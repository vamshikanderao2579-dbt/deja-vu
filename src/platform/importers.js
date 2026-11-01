// Turns an uploaded chat export into the app's history format:
//   { user: { name }, conversations: [{ id, title, date, time, messages: [{ id, role, text }] }] }
//
// Recognised: ChatGPT and Claude `conversations.json`, a Muse export `manifest.json`,
// this app's own history file, any JSON list of chats or messages, and Markdown or
// plain text ("You: …" / "Assistant: …" lines, `#` headings start a new chat).
// The upload is data: nothing in it is run or followed (the build guard screens it too).

const MAX_TEXT = 4000; // characters kept per message
const pad = (n) => String(n).padStart(2, '0');

function when(raw) {
  if (raw == null || raw === '') return null;
  // A bare date is that day wherever you are (Date would read it as UTC midnight).
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { date: raw, time: '12:00' };
  const d = typeof raw === 'number' ? new Date(raw * (raw < 1e12 ? 1000 : 1)) : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
const today = () => when(Date.now());

const ROLE_USER = /^(user|human|you|me|prompt|question)$/i;
const ROLE_AI = /^(assistant|ai|bot|model|gpt|chatgpt|claude|gemini|muse|meta ai|copilot|answer|response)$/i;
const roleOf = (r) => (ROLE_USER.test(String(r ?? '').trim()) ? 'user' : ROLE_AI.test(String(r ?? '').trim()) ? 'assistant' : null);

// Message text from the shapes exports use: a string, a list of parts, or { text } blocks.
function textOf(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join('\n');
  if (typeof v === 'object') return textOf(v.text ?? v.parts ?? v.content ?? v.value ?? '');
  return '';
}
const clean = (s) => String(s).replace(/\[\[[^\]]*\]\]/g, '').replace(/\u0000/g, '').trim().slice(0, MAX_TEXT);

function conv(title, stamp, msgs) {
  const messages = msgs.map((m) => ({ role: m.role, text: clean(m.text) })).filter((m) => m.role && m.text);
  if (!messages.some((m) => m.role === 'user')) return null;
  const w = stamp ?? today();
  const first = messages.find((m) => m.role === 'user').text.replace(/\s+/g, ' ');
  return { title: String(title || '').trim().slice(0, 80) || first.slice(0, 48), date: w.date, time: w.time, messages };
}

// ChatGPT: each chat is a tree in `mapping`; walk from current_node back to the root.
function fromChatGPT(list) {
  return list.map((c) => {
    const nodes = c.mapping ?? {};
    const path = [];
    for (let id = c.current_node; id && nodes[id]; id = nodes[id].parent) path.unshift(nodes[id]);
    if (!path.length) path.push(...Object.values(nodes));
    const msgs = path.map((n) => n.message).filter(Boolean)
      .filter((m) => !m.metadata?.is_visually_hidden_from_conversation && (!m.content?.content_type || m.content.content_type === 'text'))
      .map((m) => ({ role: roleOf(m.author?.role), text: textOf(m.content?.parts ?? m.content?.text) }));
    return conv(c.title, when(c.create_time), msgs);
  });
}

// Claude: chat_messages with sender human / assistant.
const fromClaude = (list) => list.map((c) => conv(c.name, when(c.created_at), (c.chat_messages ?? []).map((m) => ({ role: roleOf(m.sender), text: m.text || textOf(m.content) }))));

// Muse export manifest: one flat list of turns; group by day.
function fromMuse(turns) {
  const days = new Map();
  for (const t of [...turns].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    const w = when(t.created_at) ?? today();
    if (!days.has(w.date)) days.set(w.date, { w, msgs: [] });
    days.get(w.date).msgs.push({ role: roleOf(t.role), text: textOf(t.content) });
  }
  return [...days.values()].map(({ w, msgs }) => conv('', w, msgs));
}

// Anything else in JSON: a list of chats ({ title, messages }) or one list of messages.
function fromGeneric(v) {
  const list = Array.isArray(v) ? v : v.conversations ?? v.chats ?? v.messages ?? v.data ?? [];
  if (!Array.isArray(list) || !list.length) return [];
  const isMessage = (x) => x && typeof x === 'object' && (x.role ?? x.sender ?? x.author ?? x.from) != null && (x.text ?? x.content ?? x.message ?? x.parts) != null;
  const msgOf = (x) => ({ role: roleOf(typeof x.author === 'object' ? x.author.role : x.role ?? x.sender ?? x.author ?? x.from), text: textOf(x.text ?? x.content ?? x.message ?? x.parts) });
  if (list.every(isMessage)) return chunkByDay(list.map((x) => ({ ...msgOf(x), w: when(x.created_at ?? x.timestamp ?? x.time ?? x.date) })));
  return list.map((c) => {
    const msgs = c.messages ?? c.chat_messages ?? c.turns ?? c.content ?? [];
    return Array.isArray(msgs) ? conv(c.title ?? c.name, when(c.created_at ?? c.create_time ?? c.date ?? c.timestamp), msgs.filter(isMessage).map(msgOf)) : null;
  });
}
function chunkByDay(msgs) {
  const days = new Map();
  for (const m of msgs) {
    const w = m.w ?? today();
    if (!days.has(w.date)) days.set(w.date, { w, msgs: [] });
    days.get(w.date).msgs.push(m);
  }
  return [...days.values()].map(({ w, msgs: list }) => conv('', w, list));
}

// Markdown or text: `#` headings start a chat (a date in the heading dates it);
// "You:" / "User:" / "**Assistant**:" lines start a message; other lines continue it.
function fromText(raw) {
  const out = [];
  let cur = null;
  let msg = null;
  const start = (title) => { cur = { title, w: when(title.match(/\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})?/)?.[0]), msgs: [] }; out.push(cur); msg = null; };
  for (const line of raw.split(/\r?\n/)) {
    const h = line.match(/^#{1,3}\s+(.*)$/);
    if (h) { start(h[1]); continue; }
    const r = line.match(/^\s*(?:[-*]\s*)?(?:\*\*|__)?([A-Za-z][A-Za-z ]{0,14}?)(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(.*)$/);
    const role = r && roleOf(r[1]);
    if (role) {
      if (!cur) start('');
      msg = { role, text: r[2] };
      cur.msgs.push(msg);
    } else if (msg) msg.text += '\n' + line;
    else if (line.trim()) {
      if (!cur) start('');
      msg = { role: 'user', text: line };
      cur.msgs.push(msg);
    }
  }
  return out.map((c) => conv(c.title, c.w, c.msgs));
}

export function detectFormat(v) {
  if (typeof v === 'string') return 'text';
  const list = Array.isArray(v) ? v : null;
  if (list?.[0]?.mapping) return 'chatgpt';
  if (list?.[0]?.chat_messages) return 'claude';
  if (!list && Array.isArray(v?.turns) && v.turns[0]?.role) return 'muse';
  if (!list && Array.isArray(v?.conversations) && v.conversations[0]?.messages?.[0]?.text != null) return 'deja-vu';
  return 'json';
}

const LABEL = { chatgpt: 'ChatGPT', claude: 'Claude', muse: 'Muse', 'deja-vu': 'Déjà Vu', json: 'JSON', text: 'text' };

// raw: the file's text. Returns { format, label, history, turns } or throws a friendly error.
export function importHistory(raw, { name = '' } = {}) {
  let v = String(raw ?? '').replace(/^﻿/, '');
  if (!v.trim()) throw new Error('That file is empty.');
  if (/^\s*[[{]/.test(v)) {
    try { v = JSON.parse(v); } catch { throw new Error('That file looks like JSON but couldn’t be read. Is it the whole file?'); }
  }
  const format = detectFormat(v);
  const convs = (
    format === 'chatgpt' ? fromChatGPT(v) :
    format === 'claude' ? fromClaude(v) :
    format === 'muse' ? fromMuse(v.turns) :
    format === 'deja-vu' ? v.conversations.map((c) => conv(c.title, c.date ? { date: c.date, time: c.time ?? '12:00' } : null, c.messages)) :
    format === 'text' ? fromText(v) :
    fromGeneric(v)
  ).filter(Boolean);
  if (!convs.length) throw new Error('I couldn’t find any chats in that file. Try a ChatGPT or Claude conversations.json, or a .md with “You:” and “Assistant:” lines.');
  convs.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  let n = 0;
  const conversations = convs.map((c, i) => ({ id: `u${i + 1}`, ...c, messages: c.messages.map((m) => ({ id: `um${++n}`, ...m })) }));
  const turns = conversations.reduce((a, c) => a + c.messages.filter((m) => m.role === 'user').length, 0);
  return { format, label: LABEL[format], turns, history: { user: { name: String(name).trim().slice(0, 40) || 'You' }, conversations } };
}
