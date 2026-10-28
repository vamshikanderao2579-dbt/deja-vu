const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('.app');

const MODES = [
  { id: 'cards', label: 'Memory: your cards' },
  { id: 'full', label: 'Memory: full chat history' },
  { id: 'none', label: 'Memory: off' },
];
const SUGGESTIONS = [
  'Find a place for dinner tonight with the family',
  'Grab my usual drink on the way in',
  'Gift ideas for Maya’s birthday',
  'Find us a place to stay in Miami for spring break',
];
const REASON_LABEL = {
  changed: 'You said something different recently',
  guessed: 'I guessed this from our chats',
  sensitive: 'Private. I won’t use it unless you say yes',
  stale: 'We haven’t checked this in a while',
  old: 'Learned over a year ago. Still true?',
};

const fmtMonth = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtWhen = (date, time) =>
  new Date(`${date}T${time ?? '12:00'}:00`).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// "Learned Jun 2023 · last mentioned Sep 2026 · ✓ confirmed Oct 27, 2026"
function dateLine(c) {
  const parts = [];
  if (c.first_seen) parts.push(`Learned ${fmtMonth(c.first_seen)}`);
  if (c.last_seen && fmtMonth(c.last_seen) !== fmtMonth(c.first_seen)) parts.push(`last mentioned ${fmtMonth(c.last_seen)}`);
  parts.push(c.last_confirmed ? `✓ confirmed ${fmtDay(c.last_confirmed)}` : 'not confirmed yet');
  return parts.join(' · ');
}

// Provenance: which conversation, exactly when, and the full chat on tap.
async function loadSources(box, cardId) {
  if (box.innerHTML) { box.innerHTML = ''; return; }
  const res = await api(`/api/sources/${cardId}`);
  const srcIds = new Set(res.sources.map((m) => m.id));
  box.innerHTML = res.conversations.map((c) => `<div class="src">
      <div class="src-when">${esc(fmtWhen(c.date, c.time))} · ${esc(c.title)}</div>
      ${c.messages.filter((m) => srcIds.has(m.id)).map((m) => `<div class="quote">“${esc(m.text)}”</div>`).join('')}
      <button type="button" class="conv-toggle">Open conversation</button>
      <div class="conv hidden">${c.messages.map((m) => `<div class="cm ${m.role}${srcIds.has(m.id) ? ' hl' : ''}"><b>${m.role === 'user' ? 'You' : 'Agent'}</b>${esc(m.text).replace(/\n/g, '<br>')}</div>`).join('')}</div>
    </div>`).join('');
  box.querySelectorAll('.conv-toggle').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const conv = b.nextElementSibling;
    conv.classList.toggle('hidden');
    b.textContent = conv.classList.contains('hidden') ? 'Open conversation' : 'Hide conversation';
  }));
}
const STATUS_LABEL = { confirmed: '✓ Confirmed', inferred: '~ My guess', pending: '🔒 Needs your OK' };

// Category look: label + line icon. Unknown categories fall back to a sparkle.
const ICON = {
  food: '<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5a2 2 0 0 0 2 2M11 3v5a2 2 0 0 1-2 2M17 21V3c-2 1-3 3.5-3 7v3h3"/>',
  travel: '<path d="M10.5 13.5L3 11l1.5-1.5 8 .5 4.5-4.5a2 2 0 0 1 3 3L15.5 13l.5 8-1.5 1.5-2.5-7.5-3 3V21l-1.5 1L6 18.5 2 17l1-1.5h3z"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2M3 12.5h18"/>',
  health: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  people: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.8-3.2 3.2-5 6-5s5.2 1.8 6 5M16 5.6a3.2 3.2 0 0 1 0 6M18 14.8c1.5.7 2.6 2.3 3 4.7"/>',
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  family: '<circle cx="8" cy="7" r="2.6"/><circle cx="16" cy="7" r="2.6"/><circle cx="12" cy="13.2" r="2"/><path d="M3.5 20c.4-3.6 2.2-6 4.5-6 1 0 1.9.4 2.6 1.2M20.5 20c-.4-3.6-2.2-6-4.5-6-1 0-1.9.4-2.6 1.2M9 21c.3-2 1.5-3.4 3-3.4s2.7 1.4 3 3.4"/>',
  entertainment: '<rect x="3" y="5" width="18" height="12" rx="2.5"/><path d="M8.5 21h7M10.5 8.8v4.4l3.8-2.2z"/>',
  shopping: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
  fitness: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  other: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
};
const catIcon = (cat) => `<svg viewBox="0 0 24 24">${ICON[cat] ?? ICON.other}</svg>`;
const catLabel = (cat) => cat[0].toUpperCase() + cat.slice(1);

let data = null;
let mode = 'cards';
let conversationId = newId();
const sessionLog = [];

function newId() {
  return 'conv-' + Math.random().toString(36).slice(2, 9);
}

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Request failed (${res.status})`);
  return out;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Small, safe markdown: paragraphs, bullet lists, **bold**.
function md(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  let html = '', list = false;
  for (const line of text.split('\n')) {
    const item = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (item) {
      if (!list) { html += '<ul>'; list = true; }
      html += `<li>${inline(item[1])}</li>`;
    } else {
      if (list) { html += '</ul>'; list = false; }
      if (line.trim()) html += `<p>${inline(line)}</p>`;
    }
  }
  return html + (list ? '</ul>' : '');
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------------- navigation: drawer, sheet, pages ----------------
const OVERLAYS = ['drawer', 'settings', 'memory', 'category', 'insights'];

function open(id) {
  if (id === 'chat') return closeAll();
  if (['feed', 'ideas', 'goals', 'library'].includes(id)) {
    closeAll();
    return toast('Not part of this prototype. Memory lives in the menu.');
  }
  if (id !== 'drawer') $('#drawer').classList.remove('open');
  $(`#${id}`).classList.add('open');
  $('#scrim').classList.toggle('on', id === 'drawer');
  if (id === 'memory') renderMemory();
  if (id === 'insights') renderInsights();
  if (id === 'settings') renderSettings();
}
function close(id) {
  $(`#${id}`).classList.remove('open');
  if (id === 'drawer') $('#scrim').classList.remove('on');
  if (id === 'category' && $('#memory').classList.contains('open')) renderMemory();
}
function closeAll() {
  OVERLAYS.forEach((id) => $(`#${id}`).classList.remove('open'));
  $('#scrim').classList.remove('on');
}

$('#menuBtn').addEventListener('click', () => open('drawer'));
$('#scrim').addEventListener('click', () => close('drawer'));
$('#openSettings').addEventListener('click', () => open('settings'));
$$('[data-go]').forEach((b) => b.addEventListener('click', () => open(b.dataset.go)));
$$('[data-close]').forEach((b) => b.addEventListener('click', () => close(b.dataset.close)));
$$('[data-soon]').forEach((b) => b.addEventListener('click', () => toast('Not part of this prototype.')));
$$('.tab').forEach((t) => t.addEventListener('click', () => open(t.dataset.tab)));

// ---------------- state ----------------
async function refresh(next) {
  data = next ?? (await api('/api/state'));
  const toCheck = data.cards.filter((c) => c.checkReason).length;
  $('#menuDot').classList.toggle('hidden', !toCheck);
  $('#drawerCount').classList.toggle('hidden', !toCheck);
  $('#drawerCount').textContent = toCheck;
}

// ---------------- chat ----------------
const thread = $('#thread');

function scrollDown() {
  const v = $('#view-chat');
  requestAnimationFrame(() => v.scrollTo({ top: v.scrollHeight, behavior: 'smooth' }));
}

function renderWelcome() {
  thread.innerHTML = '';
  if (!data.cards.length) {
    const box = el(`<div class="msg assistant"><p>Hi ${esc(data.userName)}! I haven't organized what I know about you yet. Want me to turn our past chats into a few short cards you can check?</p><div class="suggestions"><button>Build my memory from our chats</button></div></div>`);
    box.querySelector('button').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Reading our chats…';
      await buildContext();
      renderWelcome();
    });
    thread.append(box);
    return;
  }
  thread.append(el(`<p class="welcome">Try one of these</p>`));
  const s = el(`<div class="suggestions"></div>`);
  for (const q of SUGGESTIONS) {
    const b = el(`<button>${esc(q)}</button>`);
    b.addEventListener('click', () => send(q));
    s.append(b);
  }
  thread.append(s);
}

function addMsg(role, html) {
  thread.querySelectorAll('.welcome, .suggestions').forEach((n) => n.closest('.msg') || n.remove());
  const m = el(`<div class="msg ${role}">${html}</div>`);
  thread.append(m);
  scrollDown();
  return m;
}

function typing() {
  return addMsg('assistant typing', '<span class="typing-dots"><span></span><span></span><span></span></span>');
}

async function send(message, { skipCue = false } = {}) {
  if (!skipCue) addMsg('user', esc(message));
  const t = typing();
  try {
    const res = await api('/api/chat', { message, mode, conversationId, skipCue });
    t.remove();
    if (res.type === 'cue') return renderCue(res.cue, message);
    renderAnswer(res, message);
  } catch (err) {
    t.remove();
    addMsg('assistant', `<p>${esc(err.message)}</p>`);
  }
}

function renderAnswer(res, question) {
  addMsg('assistant', md(res.text));
  const ctx = res.tokens.context;
  const full = res.tokens.fullHistory;
  let line;
  if (res.mode === 'cards') {
    const pct = full ? Math.round((1 - ctx / full) * 100) : 0;
    line = res.usedCards.length
      ? `Used ${res.usedCards.length} card${res.usedCards.length > 1 ? 's' : ''} · ~${ctx} tokens of context <span class="savings">(${pct}% less than full history)</span>`
      : `No cards needed for this one · 0 tokens of context`;
  } else if (res.mode === 'full') line = `Read the full chat history · ~${ctx.toLocaleString()} tokens of context`;
  else line = 'Memory off · answered without knowing you';

  const meta = el(`<div class="meta"><div>${line}</div></div>`);
  if (res.usedCards.length) {
    const chips = el('<div class="chips"></div>');
    for (const c of res.usedCards) chips.append(el(`<span class="chip ${c.status}">${esc(c.text)}</span>`));
    meta.append(chips);
    const fb = el(`<div class="fb"><button data-p="1">👍 Spot on</button><button data-p="0">Not quite</button></div>`);
    fb.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', async () => {
        fb.querySelectorAll('button').forEach((x) => x.classList.add('done'));
        await refresh(await api('/api/feedback', { cardIds: res.usedCards.map((c) => c.id), positive: b.dataset.p === '1' }));
        toast(b.dataset.p === '1' ? 'Noted. I’ll check in less often about these.' : 'Got it. I’ll double-check these next time.');
      })
    );
    meta.append(fb);
  }
  thread.append(meta);
  scrollDown();
  sessionLog.push({ question, mode: res.mode, tokens: ctx, full, cards: res.usedCards.length });
}

function cardHtml(card, { why = '', sources = false } = {}) {
  return `<div class="swipe-card">
    <span class="stamp yes">STILL TRUE</span><span class="stamp no">NOT ANYMORE</span><span class="stamp edit"></span>
    ${why ? `<div class="why">${esc(why)}</div>` : ''}
    <div class="cat">${esc(card.category)} · ${card.type === 'lesson' ? 'lesson' : 'preference'}</div>
    <div class="text">${esc(card.text)}</div>
    ${card.changed_from ? `<div class="was">${esc(card.changed_from)}</div>` : ''}
    ${card.note ? `<div class="note">💬 ${esc(card.note)}</div>` : ''}
    ${sources ? `<div class="dates">${esc(dateLine(card))}</div>` : ''}
    ${sources ? `<button class="why-btn" type="button">Why do you think this?</button><div class="srcs"></div>` : '<div class="hint">Swipe → still true · ← not anymore</div>'}
  </div>`;
}

function renderCue(cue, question) {
  const wrap = el(`<div class="cue"><p class="q">${esc(cue.question)}</p>${cardHtml(cue.card)}
    <div class="cue-actions"><button class="no">✕ Not anymore</button><button class="mic" aria-label="Answer by voice">🎙</button><button class="yes">✓ Still true</button></div></div>`);
  thread.append(wrap);
  scrollDown();
  const card = wrap.querySelector('.swipe-card');
  let done = false;
  const settle = () => { if (done) return false; done = true; wrap.querySelector('.cue-actions')?.remove(); return true; };

  const yes = async () => {
    if (!settle()) return;
    try {
      await refresh(await api(`/api/cards/${cue.card.id}`, { action: 'confirm' }));
      wrap.append(el(`<p class="q" style="margin-top:8px">Thanks. Saved as confirmed.</p>`));
      await send(question, { skipCue: true });
    } catch (err) { toast(err.message); }
  };
  const no = async () => {
    if (!settle()) return;
    try {
      await refresh(await api(`/api/cards/${cue.card.id}`, { action: 'reject' }));
      offerChat(wrap, cue.card, () => send(question, { skipCue: true }), question);
    } catch (err) { toast(err.message); }
  };

  makeSwipeable(card, (act) => (act === 'confirm' ? yes() : act === 'reject' ? no() : null));
  wrap.querySelector('.cue-actions .yes').addEventListener('click', () => fling(card, 'confirm', yes));
  wrap.querySelector('.cue-actions .no').addEventListener('click', () => fling(card, 'reject', no));
  voiceButton(wrap.querySelector('.cue-actions .mic'), async (v) => {
    if (!v.action) return toast('Didn’t catch that. Try again?');
    wrap.querySelector('.q').insertAdjacentHTML('afterend', `<p class="heard">You said: “${esc(v.transcript)}”</p>`);
    if (v.action === 'confirm') return fling(card, 'confirm', yes);
    if (v.action === 'reject') return fling(card, 'reject', no);
    // A spoken correction ("No, it's Wednesdays now") updates the card directly.
    if (!settle()) return;
    card.style.display = 'none';
    await applyUpdate({ category: cue.card.category, oldText: cue.card.text, cardId: cue.card.id }, v.text);
    await send(question, { skipCue: true });
  }, '🎙');
}

// After a "not anymore": forget it, then offer to talk about what changed. Skipping
// is one tap, so nobody is forced into a conversation they didn't want.
function offerChat(container, card, onSkip, question = null) {
  const box = el(`<div class="after-no"><p>Got it, I’ve forgotten that. Want to tell ${esc(data.agent.name)} what changed?</p>
    <div class="after-actions"><button class="skip">Skip</button><button class="chat">💬 Chat about it</button></div></div>`);
  container.append(box);
  scrollDown();
  box.querySelector('.skip').addEventListener('click', () => { box.remove(); onSkip?.(); });
  box.querySelector('.chat').addEventListener('click', () => { box.remove(); startUpdateChat({ category: card.category, oldText: card.text, question }); });
}

// Land in chat with the sentence started for them; they only finish it.
let pendingUpdate = null;
function startUpdateChat(info) {
  closeAll();
  pendingUpdate = info;
  const input = $('#input');
  input.value = `Hey ${data.agent.name}, my ${catLabel(info.category)} preference “${info.oldText}” has changed. Now I’d like `;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  input.scrollLeft = input.scrollWidth;
}

async function applyUpdate(info, message) {
  const t = typing();
  try {
    const res = await api('/api/memory/update', { ...info, message });
    t.remove();
    await refresh(res);
    addMsg('assistant', res.card
      ? `<p>Got it. Saved to <b>${esc(catLabel(info.category))}</b>: “${esc(res.card.text)}” ✓</p>`
      : `<p>Okay. I won’t keep anything about that for now.</p>`);
  } catch (err) {
    t.remove();
    addMsg('assistant', `<p>${esc(err.message)}</p>`);
  }
}

// ---------------- voice (Muse Voice Transcribe) ----------------
// Tap to start, tap again to stop (auto-stops at 8 s). Audio is captured as
// PCM16 mono 24 kHz, the format the transcription API expects.
let rec = null;
async function startRecording(onStop) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext({ sampleRate: 24000 });
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  src.connect(proc);
  proc.connect(ctx.destination);
  rec = { stream, ctx, proc, chunks, onStop, timer: setTimeout(stopRecording, 8000) };
}
function stopRecording() {
  if (!rec) return;
  const { stream, ctx, proc, chunks, onStop, timer } = rec;
  rec = null;
  clearTimeout(timer);
  proc.disconnect();
  stream.getTracks().forEach((t) => t.stop());
  ctx.close();
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const pcm = new Int16Array(len);
  let i = 0;
  for (const c of chunks) for (const v of c) pcm[i++] = Math.max(-1, Math.min(1, v)) * 0x7fff;
  onStop(pcm);
}
async function transcribeClip(pcm) {
  const res = await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: pcm.buffer });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Voice failed');
  return out; // { transcript, action, text }
}
// Wires a button: tap to talk, tap to stop, then hands the result to onResult.
function voiceButton(btn, onResult, idleLabel) {
  btn.addEventListener('click', async () => {
    if (rec) return stopRecording();
    try {
      await startRecording(async (pcm) => {
        btn.classList.remove('recording');
        btn.innerHTML = '…';
        try { onResult(await transcribeClip(pcm)); }
        catch (err) { toast(err.message); }
        finally { btn.innerHTML = idleLabel; }
      });
      btn.classList.add('recording');
      btn.innerHTML = '■ Stop';
    } catch {
      toast('Microphone not available.');
    }
  });
}

// ---------------- swipe gesture ----------------
function makeSwipeable(card, onAction) {
  let sx = 0, sy = 0, dx = 0, dy = 0, active = false;
  const stamps = { yes: card.querySelector('.stamp.yes'), no: card.querySelector('.stamp.no'), edit: card.querySelector('.stamp.edit') };
  card.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input,button')) return;
    active = true; sx = e.clientX; sy = e.clientY; dx = dy = 0;
    card.classList.add('dragging');
    card.setPointerCapture(e.pointerId);
  });
  card.addEventListener('pointermove', (e) => {
    if (!active) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    card.style.transform = `translate(${dx}px, ${Math.min(dy, 0)}px) rotate(${dx / 18}deg)`;
    stamps.yes.style.opacity = Math.max(0, Math.min(1, dx / 90));
    stamps.no.style.opacity = Math.max(0, Math.min(1, -dx / 90));
    stamps.edit.style.opacity = Math.abs(dx) < 40 ? Math.max(0, Math.min(1, -dy / 80)) : 0;
  });
  const end = () => {
    if (!active) return;
    active = false;
    card.classList.remove('dragging');
    Object.values(stamps).forEach((s) => (s.style.opacity = 0));
    if (dx > 90) fling(card, 'confirm', () => onAction('confirm'));
    else if (dx < -90) fling(card, 'reject', () => onAction('reject'));
    else if (dy < -80 && Math.abs(dx) < 60) { card.style.transform = ''; onAction('edit'); }
    else card.style.transform = '';
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

function fling(card, action, after) {
  const x = action === 'confirm' ? 500 : -500;
  card.style.transform = `translate(${x}px, -20px) rotate(${x / 20}deg)`;
  card.style.opacity = '0';
  setTimeout(() => {
    if (card.closest('.cue')) card.style.display = 'none';
    after();
  }, 220);
}

// ---------------- composer ----------------
$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#input').value.trim();
  if (!v) return;
  $('#input').value = '';
  if (pendingUpdate) {
    const info = pendingUpdate;
    pendingUpdate = null;
    addMsg('user', esc(v));
    applyUpdate({ category: info.category, oldText: info.oldText }, v).then(() => info.question && send(info.question, { skipCue: true }));
    return;
  }
  send(v);
});
$('#plusBtn').addEventListener('click', () => { if (!thread.querySelector('.suggestions')) renderWelcome(); });
voiceButton($('#micBtn'), (v) => { if (v.transcript) { $('#input').value = v.transcript; $('#input').focus(); } else toast('Didn’t catch that.'); }, $('#micBtn').innerHTML);
const newChat = () => { conversationId = newId(); renderWelcome(); closeAll(); };
$('#newChatBtn').addEventListener('click', newChat);
$('#drawerNewChat').addEventListener('click', newChat);

$('#modeChip').addEventListener('click', () => {
  const i = MODES.findIndex((m) => m.id === mode);
  mode = MODES[(i + 1) % MODES.length].id;
  $('#modeChip').dataset.mode = mode;
  $('#modeLabel').textContent = MODES.find((m) => m.id === mode).label;
  toast({ cards: 'Using only the cards relevant to each question.', full: 'Comparison mode: the agent reads your entire history.', none: 'Comparison mode: no memory at all.' }[mode]);
});

// ---------------- memory: categories ----------------
async function buildContext() {
  try {
    const res = await api('/api/distill', {});
    await refresh(res);
    toast(`Built ${res.cards.length} cards from your chats.`);
  } catch (err) {
    toast(err.message);
  }
}
$('#distillBtn').addEventListener('click', async (e) => {
  e.target.disabled = true;
  e.target.textContent = 'Reading our chats…';
  await buildContext();
  e.target.disabled = false;
  e.target.textContent = 'Build from my chats';
  renderMemory();
});
$('#redistillBtn').addEventListener('click', async () => { await buildContext(); renderMemory(); });

function groups() {
  const g = {};
  for (const c of data.cards) (g[c.category] ??= []).push(c);
  return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
}

function renderMemory() {
  const empty = !data.cards.length;
  $('#memoryEmpty').classList.toggle('hidden', !empty);
  $('#memoryLinks').classList.toggle('hidden', empty);
  const confirmed = data.cards.filter((c) => c.status === 'confirmed').length;
  const toCheck = data.cards.filter((c) => c.checkReason).length;
  $('#memorySummary').innerHTML = empty
    ? ''
    : `<div class="summary"><div><b>${data.cards.length}</b> things I know</div><div><b>${confirmed}</b> confirmed by you</div><div><b>${toCheck}</b> to check</div></div>`;
  const grid = $('#catGrid');
  grid.innerHTML = '';
  for (const [cat, cards] of groups()) {
    const check = cards.filter((c) => c.checkReason).length;
    const tile = el(`<button class="cat-tile"><span class="cat-icon">${catIcon(cat)}</span>
      <span class="cat-name">${esc(catLabel(cat))}</span>
      <span class="fine">${cards.length} card${cards.length === 1 ? '' : 's'}${check ? ` · <b class="to-check">${check} to check</b>` : ''}</span></button>`);
    tile.addEventListener('click', () => openCategory(cat));
    grid.append(tile);
  }
}

// ---------------- memory: one category ----------------
let deck = { cat: null, ids: [], i: 0 };

function openCategory(cat) {
  const cards = data.cards.filter((c) => c.category === cat);
  // Cards that need a check come first, then everything else it knows.
  cards.sort((a, b) => (b.checkReason ? 1 : 0) - (a.checkReason ? 1 : 0));
  deck = { cat, ids: cards.map((c) => c.id), i: 0 };
  $('#catIcon').innerHTML = catIcon(cat);
  $('#catName').textContent = catLabel(cat);
  setSeg('deck');
  open('category');
  renderDeck();
}

function setSeg(v) {
  $$('#catSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  $('#catDeckWrap').classList.toggle('hidden', v !== 'deck');
  $('#catList').classList.toggle('hidden', v !== 'list');
  if (v === 'list') renderCatList();
  else renderDeck();
}
$$('#catSeg button').forEach((b) => b.addEventListener('click', () => setSeg(b.dataset.v)));

const currentCard = () => {
  while (deck.i < deck.ids.length) {
    const c = data.cards.find((x) => x.id === deck.ids[deck.i]);
    if (c) return c;
    deck.i++;
  }
  return null;
};

function renderDeck() {
  const root = $('#deck');
  root.innerHTML = '';
  const total = deck.ids.length;
  const card = currentCard();
  $('#catProgress').textContent = card ? `${Math.min(deck.i + 1, total)} of ${total}` : `${total} reviewed`;
  $('#deckButtons').classList.toggle('hidden', !card);
  if (!card) {
    root.append(el(`<div class="deck-done"><p>That’s everything I know about your ${esc(deck.cat)}.</p><button class="ghost" type="button">See as list</button></div>`));
    root.querySelector('button').addEventListener('click', () => setSeg('list'));
    return;
  }
  // Show up to two cards behind the current one for the stacked look.
  const upcoming = deck.ids.slice(deck.i + 1, deck.i + 3).map((id) => data.cards.find((c) => c.id === id)).filter(Boolean).reverse();
  for (const c of upcoming) root.append(el(cardHtml(c, { why: STATUS_LABEL[c.status] })));
  const top = el(cardHtml(card, { why: card.checkReason ? REASON_LABEL[card.checkReason] : STATUS_LABEL[card.status], sources: true }));
  root.append(top);
  top.querySelector('.why-btn').addEventListener('click', () => loadSources(top.querySelector('.srcs'), card.id));
  makeSwipeable(top, (act) => deckAct(act));
}

async function deckAct(act) {
  const card = currentCard();
  if (!card || (act !== 'confirm' && act !== 'reject')) return;
  await refresh(await api(`/api/cards/${card.id}`, { action: act }));
  deck.i++;
  if (act === 'reject') {
    renderDeck();
    offerChat($('#deck'), card, null);
    return;
  }
  renderDeck();
}
voiceButton($('#deckMic'), async (v) => {
  const card = currentCard();
  if (!card || !v.action) return toast('Didn’t catch that. Try again?');
  toast(`You said: “${v.transcript}”`);
  if (v.action === 'confirm' || v.action === 'reject') return deckAct(v.action);
  const res = await api('/api/memory/update', { category: card.category, oldText: card.text, cardId: card.id, message: v.text });
  await refresh(res);
  if (res.card) toast(`Saved: “${res.card.text}” ✓`);
  deck.i++;
  renderDeck();
}, '🎙');
$('#deckButtons').addEventListener('click', (e) => {
  const act = e.target.closest('button')?.dataset.act;
  if (!act) return;
  const top = $('#deck').lastElementChild;
  if ((act === 'confirm' || act === 'reject') && top?.classList.contains('swipe-card')) fling(top, act, () => deckAct(act));
  else deckAct(act);
});

function renderCatList() {
  const root = $('#catList');
  root.innerHTML = '';
  const cards = data.cards.filter((c) => c.category === deck.cat);
  const max = data.budget.limits.maxCardsPerCategory;
  const tokens = data.budget.categories[deck.cat]?.tokens ?? 0;
  const sec = el(`<section class="category"><header><h2>${esc(catLabel(deck.cat))}</h2><span class="budget">${cards.length}/${max} cards · ~${tokens} tokens</span></header><div class="meter"><i style="width:${Math.min(100, (cards.length / max) * 100)}%"></i></div></section>`);
  for (const c of cards) sec.append(listCard(c));
  root.append(sec);
}

function listCard(c) {
  const row = el(`<div class="ccard"><div class="top"><div><div class="txt">${esc(c.text)}</div>
    <div class="kind">${c.type === 'lesson' ? 'Lesson' : 'Preference'} · from ${c.sources.length} message${c.sources.length === 1 ? '' : 's'}${c.changed_from ? ` · was “${esc(c.changed_from)}”` : ''}</div>
    ${c.note ? `<div class="kind">💬 ${esc(c.note)}</div>` : ''}
    <div class="kind">${esc(dateLine(c))}</div></div>
    <span class="badge ${c.status}">${STATUS_LABEL[c.status]}</span></div>
    <div class="actions"><button data-a="why">Why?</button>${c.status !== 'confirmed' ? '<button data-a="confirm">✓ Confirm</button>' : ''}<button data-a="edit">Edit</button><button data-a="reject">Remove</button></div></div>`);
  const srcBox = el('<div class="sources srcs"></div>');
  row.append(srcBox);
  row.querySelector('[data-a=why]').addEventListener('click', () => loadSources(srcBox, c.id));
  row.querySelector('[data-a=confirm]')?.addEventListener('click', async () => { await refresh(await api(`/api/cards/${c.id}`, { action: 'confirm' })); renderCatList(); });
  row.querySelector('[data-a=reject]').addEventListener('click', async () => { await refresh(await api(`/api/cards/${c.id}`, { action: 'reject' })); renderCatList(); toast('Removed. I won’t bring it back.'); });
  row.querySelector('[data-a=edit]').addEventListener('click', () => {
    if (row.querySelector('.edit-box')) return;
    const box = el(`<form class="edit-box"><input value="${esc(c.text)}" maxlength="90" /><button>Save</button></form>`);
    box.addEventListener('submit', async (e) => { e.preventDefault(); await refresh(await api(`/api/cards/${c.id}`, { action: 'edit', text: box.querySelector('input').value })); renderCatList(); });
    row.append(box);
    box.querySelector('input').focus();
  });
  return row;
}

// ---------------- insights ----------------
function renderInsights() {
  const confirmed = data.cards.filter((c) => c.status === 'confirmed').length;
  const cardTurns = sessionLog.filter((l) => l.mode === 'cards');
  const avg = cardTurns.length ? Math.round(cardTurns.reduce((a, l) => a + l.tokens, 0) / cardTurns.length) : 0;
  $('#stats').innerHTML = `
    <div class="stat"><div class="n">${confirmed}/${data.cards.length}</div><div class="l">cards confirmed by you</div></div>
    <div class="stat"><div class="n">~${data.budget.totalTokens}</div><div class="l">tokens for all your cards</div></div>
    <div class="stat"><div class="n">~${data.fullHistoryTokens.toLocaleString()}</div><div class="l">tokens for full history</div></div>
    <div class="stat"><div class="n">${data.cuesShown}</div><div class="l">quick checks asked</div></div>`;

  renderEval();
  const box = $('#sessionLog');
  if (!sessionLog.length) return;
  const full = data.fullHistoryTokens;
  box.innerHTML = `<h3>This session</h3>
    <div class="bar"><span class="lbl">Full history</span><span class="track"><span class="fill" style="width:100%;background:var(--series-2)"></span></span><span class="val">${full.toLocaleString()}</span></div>
    <div class="bar"><span class="lbl">Your cards (avg)</span><span class="track"><span class="fill" style="width:${Math.max(1, (avg / full) * 100)}%;background:var(--series-1)"></span></span><span class="val">${avg}</span></div>
    ${sessionLog.map((l) => `<div class="log-row"><span>${esc(l.question)}</span><span>${l.mode === 'cards' ? `${l.cards} cards · ${l.tokens} tok` : l.mode === 'full' ? `full · ${l.tokens.toLocaleString()} tok` : 'no memory'}</span></div>`).join('')}`;
}

// ---------------- eval charts ----------------
const MODE_NAMES = { confirmed: 'Confirmed cards', inferred: 'Guessed cards', summary: 'Memory summary', full: 'Full history', none: 'No memory' };
const MODE_ORDER = ['confirmed', 'inferred', 'summary', 'full', 'none'];

async function renderEval() {
  const box = $('#evalBox');
  const ev = await api('/api/eval').catch(() => ({ available: false }));
  if (!ev.available) {
    box.innerHTML = `<div class="card-box"><h3>Eval</h3><p class="fine">No results yet. Run <code>npm run eval</code>.</p></div>`;
    return;
  }
  const rows = MODE_ORDER.map((m) => ev.summary.find((s) => s.mode === m)).filter(Boolean);
  const when = new Date(ev.generated).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  box.innerHTML = `
    <div class="card-box viz">
      <div class="viz-head"><h3>Eval: ${ev.questions} questions, ${ev.checks} checks</h3>${ev.mock ? '<span class="badge pending">Mock run, not real results</span>' : ''}</div>
      <p class="fine">${when} · answers ${esc(ev.models.answers)} · judge ${esc(ev.models.judge)} · ${ev.cards.swipes.confirm + ev.cards.swipes.edit + ev.cards.swipes.reject} swipes to review</p>
      ${barChart('Answer accuracy', 'Share of checklist items each setup got right', rows.map((r) => ({ label: MODE_NAMES[r.mode], value: r.accuracy, emph: r.mode === 'confirmed' })), (v) => `${v}%`, 100)}
      ${barChart('Preferences that changed outside chat', 'Only a confirmation can catch these', rows.map((r) => ({ label: MODE_NAMES[r.mode], value: r.accuracyDrifted ?? 0, emph: r.mode === 'confirmed' })), (v) => `${v}%`, 100)}
      ${barChart('Context per question', 'Tokens of memory sent with each prompt', rows.map((r) => ({ label: MODE_NAMES[r.mode], value: r.avgContextTokens, emph: r.mode === 'confirmed' })), (v) => `${v.toLocaleString()} tok`)}
      ${lineChart(ev.projection)}
      <details class="table-view"><summary>Show as table</summary>
        <table><thead><tr><th>Setup</th><th>Accuracy</th><th>Changed outside chat</th><th>Changed in chat</th><th>Stale errors</th><th>Tokens</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${MODE_NAMES[r.mode]}</td><td>${r.accuracy}%</td><td>${r.accuracyDrifted ?? '–'}%</td><td>${r.accuracyChangedInChat ?? '–'}%</td><td>${r.staleErrors}</td><td>${r.avgContextTokens.toLocaleString()}</td></tr>`).join('')}</tbody></table>
      </details>
    </div>`;
  wireTips(box);
}

function barChart(title, sub, items, fmt, max = Math.max(...items.map((i) => i.value), 1)) {
  return `<figure class="chart"><figcaption><b>${title}</b><span>${sub}</span></figcaption>
    ${items.map((i) => `<div class="hbar" data-tip="${esc(i.label)}: ${esc(fmt(i.value))}">
      <span class="hbar-label">${esc(i.label)}</span>
      <span class="hbar-plot"><span class="hbar-fill ${i.emph ? 'emph' : ''}" style="width:${Math.max(0.6, (i.value / max) * 100)}%"></span><span class="hbar-val">${esc(fmt(i.value))}</span></span>
    </div>`).join('')}</figure>`;
}

function lineChart(proj) {
  const pts = proj.points;
  const W = 320, H = 170, L = 8, R = 92, T = 12, B = 26;
  const maxX = pts.at(-1).months, maxY = Math.max(...pts.map((p) => p.fullHistory));
  const x = (m) => L + (m / maxX) * (W - L - R);
  const y = (v) => H - B - (v / maxY) * (H - T - B);
  const path = (k) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.months).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');
  const last = pts.at(-1);
  const grid = [0.5, 1].map((f) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(maxY * f)}" y2="${y(maxY * f)}"/>`).join('');
  const dots = (k, cls, name) => pts.map((p) => `<circle class="${cls}" cx="${x(p.months)}" cy="${y(p[k])}" r="4"/><circle class="hit" cx="${x(p.months)}" cy="${y(p[k])}" r="11" data-tip="${name}, ${p.months} mo: ${p[k].toLocaleString()} tokens"/>`).join('');
  return `<figure class="chart"><figcaption><b>As the history grows</b><span>Tokens per prompt at ${proj.assumptions.conversationsPerDay} chats/day (projection)</span></figcaption>
    <div class="legend-row"><span><i class="sw s2"></i>Full history</span>${pts[0].summaryPerMessage ? '<span><i class="sw s3"></i>Memory summary</span>' : ''}<span><i class="sw s1"></i>Confirmed cards</span></div>
    <svg class="line" viewBox="0 0 ${W} ${H}" role="img" aria-label="Full history tokens grow to ${last.fullHistory.toLocaleString()} at ${last.months} months while confirmed cards stay near ${last.cardsPerQuestion}">
      ${grid}<line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
      <path class="s2" d="${path('fullHistory')}"/>${pts[0].summaryPerMessage ? `<path class="s3" d="${path('summaryPerMessage')}"/>` : ''}<path class="s1" d="${path('cardsPerQuestion')}"/>
      ${dots('fullHistory', 'm2', 'Full history')}${dots('cardsPerQuestion', 'm1', 'Confirmed cards')}
      <text class="dl" x="${x(last.months) + 8}" y="${y(last.fullHistory) + 4}">${(last.fullHistory / 1000).toFixed(0)}k</text>
      <text class="dl" x="${x(last.months) + 8}" y="${y(last.cardsPerQuestion) - 2}">${last.cardsPerQuestion}</text>
      ${pts.filter((p) => p.months >= 6).map((p) => `<text class="tick" x="${x(p.months)}" y="${H - 8}" text-anchor="middle">${p.months}mo</text>`).join('')}
    </svg></figure>`;
}

function wireTips(root) {
  let tip = $('#vizTip');
  if (!tip) { tip = el('<div id="vizTip" class="viz-tip"></div>'); app.append(tip); }
  root.querySelectorAll('[data-tip]').forEach((n) => {
    n.addEventListener('pointerenter', () => { tip.textContent = n.dataset.tip; tip.classList.add('show'); });
    n.addEventListener('pointermove', (e) => {
      const r = app.getBoundingClientRect();
      tip.style.left = Math.min(e.clientX - r.left + 12, r.width - tip.offsetWidth - 8) + 'px';
      tip.style.top = e.clientY - r.top - 36 + 'px';
    });
    n.addEventListener('pointerleave', () => tip.classList.remove('show'));
  });
}

// ---------------- settings ----------------
function renderSettings() {
  const b = data.budget.limits;
  const ceiling = Math.round(b.maxCategories * b.maxCardsPerCategory * b.maxWordsPerCard * 1.4);
  const pct = Math.round((data.budget.totalTokens / ceiling) * 100);
  $('#budgetPct').textContent = `${pct}% used`;
  $('#budgetBar').style.width = `${Math.min(100, pct)}%`;
  $('#engineInfo').innerHTML = `
    <div class="srow static">Mode<span class="fine right">${data.mock ? 'Mock (no API key yet)' : 'Live'}</span></div>
    <div class="srow static">Answers<span class="fine right">${esc(data.models.main)}</span></div>
    <div class="srow static">Memory upkeep<span class="fine right">${esc(data.models.bg)}</span></div>
    <div class="srow static">Limits<span class="fine right">${b.maxCategories} topics · ${b.maxCardsPerCategory} cards · ${b.maxWordsPerCard} words</span></div>`;
}
$('#demoBtn').addEventListener('click', async () => {
  await refresh(await api('/api/demo/load', {}));
  conversationId = newId();
  renderWelcome();
  renderSettings();
  toast('Demo memory loaded: confirmed, guessed, stale and locked cards.');
});
$('#cooldownBtn').addEventListener('click', async () => { await refresh(await api('/api/cue-cooldown/reset', {})); toast('The next relevant question can ask a quick check.'); });
$('#resetBtn').addEventListener('click', async () => {
  if (!confirm('Delete all cards and start over?')) return;
  await refresh(await api('/api/reset', {}));
  sessionLog.length = 0;
  conversationId = newId();
  renderWelcome();
  closeAll();
});

// ---------------- boot ----------------
(async () => {
  await refresh();
  $('#agentName').textContent = data.agent.name;
  $('#drawerTitle').textContent = data.agent.name;
  if (data.agent.avatar) $('.avatar').innerHTML = `<img src="/${encodeURI(data.agent.avatar)}" alt="" />`;
  renderWelcome();
})();
