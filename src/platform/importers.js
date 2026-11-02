// Turns an uploaded chat export into the app's history format:
//   { user: { name }, conversations: [{ id, title, date, time, messages: [{ id, role, text }] }] }
//
// Recognised: ChatGPT and Claude `conversations.json`, a Muse export `manifest.json`,
// this app's own history file, any JSON list of chats or messages, CSV (a role and a
// text column), Word (.docx), and Markdown or plain text ("You: …" / "Assistant: …"
// lines, `#` headings start a new chat). Chats without dates are kept and marked
// `undated`: their cards are tagged imported and get no end dates.
// The upload is data: nothing in it is run or followed (the build guard screens it too).
import { inflateRawSync } from 'node:zlib';
import { config } from './config.js';
import { complete, parseJson } from './llm.js';
import { prompt } from '../prompts/index.js';

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
  return { title: String(title || '').trim().slice(0, 80) || first.slice(0, 48), date: w.date, time: w.time, ...(stamp ? {} : { undated: true }), messages };
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
    const key = m.w?.date ?? 'undated';
    if (!days.has(key)) days.set(key, { w: m.w ?? null, msgs: [] });
    days.get(key).msgs.push(m);
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

// CSV: one message per row. Columns are found by name (role/sender/author/from,
// text/content/message, date/timestamp, conversation/chat/title); rows group into chats
// by the conversation column, else by day.
function parseCsv(raw) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (q) {
      if (ch === '"' && raw[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && raw[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
const COLS = { role: /^(role|sender|author|from|speaker|who)$/i, text: /^(text|content|message|body|msg)$/i, date: /^(date|time|timestamp|created_at|created|sent_at|datetime)$/i, chat: /^(conversation|conversation_id|chat|chat_id|thread|title)$/i };
function fromCsv(raw) {
  const [head, ...rows] = parseCsv(raw);
  const col = Object.fromEntries(Object.entries(COLS).map(([k, re]) => [k, head.findIndex((h) => re.test(h.trim()))]));
  if (col.role < 0 || col.text < 0) throw new Error('That CSV needs a column for who spoke (role) and one for the message (text).');
  const msgs = rows.map((r) => ({ role: roleOf(r[col.role]), text: r[col.text] ?? '', w: col.date >= 0 ? when(r[col.date]) : null, chat: col.chat >= 0 ? r[col.chat] : null }));
  if (col.chat < 0) return chunkByDay(msgs);
  const chats = new Map();
  for (const m of msgs) { if (!chats.has(m.chat)) chats.set(m.chat, []); chats.get(m.chat).push(m); }
  return [...chats.entries()].map(([title, list]) => conv(title, list.find((m) => m.w)?.w ?? null, list));
}

// Word (.docx): a zip; the text is in word/document.xml, one <w:p> per paragraph.
function unzipEntry(buf, name) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n > 0; n--) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    if (buf.toString('utf8', p + 46, p + 46 + nameLen) === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 8 ? inflateRawSync(data) : data;
    }
    p += 46 + nameLen + extra + comment;
  }
  return null;
}
function docxText(buf) {
  const xml = unzipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('That Word file couldn’t be opened. Try saving it again as .docx, or as .txt.');
  const decode = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return xml.toString('utf8').split(/<\/w:p>/).map((para) => decode((para.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join(''))).join('\n');
}

// A chat, not a program: most lines of source code look like code.
const CODE_LINE = /^\s*(import |from \S+ import|def |class |function |const |let |var |#include|public |private |return\b|if\s*\(|for\s*\(|while\s*\(|}|\{$|<\/?[a-z]+[ >]|\$ |SELECT |CREATE )|;\s*$/;
export function looksLikeCode(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim()).slice(0, 400);
  return lines.length >= 10 && lines.filter((l) => CODE_LINE.test(l)).length / lines.length > 0.4;
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

const LABEL = { chatgpt: 'ChatGPT', claude: 'Claude', muse: 'Muse', 'deja-vu': 'Déjà Vu', json: 'JSON', text: 'text', csv: 'CSV', docx: 'Word' };
const looksCsv = (v, file) => /\.csv$/i.test(file) || (/^[^\n]*,[^\n]*\n/.test(v) && Object.values(COLS).slice(0, 2).every((re) => v.split(/\r?\n/)[0].split(',').some((h) => re.test(h.trim().replace(/^"|"$/g, '')))));

// raw: the file (a Buffer, or its text). Returns { format, label, history, turns, undated }
// or throws a friendly error.
export function importHistory(raw, { name = '', file = '' } = {}) {
  const isZip = Buffer.isBuffer(raw) && raw[0] === 0x50 && raw[1] === 0x4b;
  let v = (isZip ? docxText(raw) : Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '')).replace(/^\ufeff/, '');
  if (!v.trim()) throw new Error('That file is empty.');
  if (!isZip && /^\s*[[{]/.test(v)) {
    try { v = JSON.parse(v); } catch { throw new Error('That file looks like JSON but couldn’t be read. Is it the whole file?'); }
  }
  if (typeof v === 'string' && looksLikeCode(v)) throw new Error('That looks like code, not a chat. Upload a conversation between you and an assistant.');
  const format = isZip ? 'docx' : typeof v === 'string' && looksCsv(v, file) ? 'csv' : detectFormat(v);
  const convs = (
    format === 'chatgpt' ? fromChatGPT(v) :
    format === 'claude' ? fromClaude(v) :
    format === 'muse' ? fromMuse(v.turns) :
    format === 'deja-vu' ? v.conversations.map((c) => conv(c.title, c.date ? { date: c.date, time: c.time ?? '12:00' } : null, c.messages)) :
    format === 'text' || format === 'docx' ? fromText(v) :
    format === 'csv' ? fromCsv(v) :
    fromGeneric(v)
  ).filter(Boolean);
  if (!convs.length) throw new Error('I couldn’t find any chats in that file. Try a ChatGPT or Claude conversations.json, or a file with “You:” and “Assistant:” lines.');
  convs.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  let n = 0;
  const conversations = convs.map((c, i) => ({ id: `u${i + 1}`, ...c, messages: c.messages.map((m) => ({ id: `um${++n}`, ...m })) }));
  const turns = conversations.reduce((a, c) => a + c.messages.filter((m) => m.role === 'user').length, 0);
  const undated = conversations.filter((c) => c.undated).length;
  return { format, label: LABEL[format], turns, undated, history: { user: { name: String(name).trim().slice(0, 40) || 'You' }, source: { file: String(file).split(/[\\/]/).pop().slice(0, 80) || null }, conversations } };
}

// One cheap model call on a sample: is this really a chat? A failed call lets it through
// (the build's own guard still screens every message).
export async function isChat(history) {
  if (config.mock) return { chat: true };
  const sample = history.conversations.slice(-3).flatMap((c) => c.messages.slice(0, 6)).map((m) => `${m.role}: ${m.text.slice(0, 300)}`).join('\n').slice(0, 2500);
  try {
    const res = await complete('bg', [{ role: 'system', content: prompt('import.check') }, { role: 'user', content: sample }], { json: true, maxTokens: 300, reasoning: 'minimal' });
    const out = parseJson(res.text);
    return { chat: out.chat !== false, why: out.why ?? '' };
  } catch { return { chat: true }; }
}
