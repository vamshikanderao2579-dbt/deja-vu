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

// Seasonal cards: awake inside their window, sleeping outside it.
function seasonBadge(c) {
  if (!c.seasonState) return '';
  return c.seasonState.active
    ? `<span class="season on">🍂 Active now · ${esc(c.season?.name ?? c.sub ?? 'Seasonal')}</span>`
    : `<span class="season off">💤 Sleeping until ${esc(fmtDay(c.seasonState.wakes + 'T12:00:00'))}</span>`;
}

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
      <button type="button" class="conv-toggle">Go to this point in the chat ↗</button>
      <div class="conv hidden">${c.messages.map((m) => `<div class="cm ${m.role}${srcIds.has(m.id) ? ' hl' : ''}"><b>${m.role === 'user' ? 'You' : 'Agent'}</b>${esc(m.text).replace(/\n/g, '<br>')}</div>`).join('')}</div>
    </div>`).join('');
  box.querySelectorAll('.conv-toggle').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const conv = b.nextElementSibling;
    conv.classList.toggle('hidden');
    b.textContent = conv.classList.contains('hidden') ? 'Go to this point in the chat ↗' : 'Hide conversation';
    // Land on the exact message the card came from, not the top of the chat.
    const spot = conv.querySelector('.cm.hl');
    if (spot && !conv.classList.contains('hidden')) { spot.scrollIntoView({ block: 'center', behavior: 'smooth' }); spot.classList.add('flash'); }
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
  seasonal: '<path d="M12 3c2.5 3 2.5 6 0 9-2.5-3-2.5-6 0-9zM12 12v9M7 15c2-.2 3.6.6 5 2M17 15c-2-.2-3.6.6-5 2M5 9c2.4.3 4.3 1.3 5.5 3M19 9c-2.4.3-4.3 1.3-5.5 3"/>',
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
const OVERLAYS = ['drawer', 'settings', 'profiles', 'memory', 'category', 'insights', 'memoryIntro', 'rebuildSheet'];

function open(id) {
  if (id === 'chat') return closeAll();
  if (id !== 'drawer') $('#drawer').classList.remove('open');
  $(`#${id}`).classList.add('open');
  $('#scrim').classList.toggle('on', id === 'drawer');
  if (id === 'memory') { renderMemory(); renderMemSwitch(); }
  if (id === 'insights') renderInsights();
  if (id === 'settings') renderSettings();
  if (id === 'profiles') renderProfiles();
  if (id === 'drawer') renderDrawer();
  syncChrome();
}
function close(id) {
  $(`#${id}`).classList.remove('open');
  if (id === 'drawer') $('#scrim').classList.remove('on');
  if (id === 'category' && $('#memory').classList.contains('open')) renderMemory();
  syncChrome();
}
function closeAll() {
  OVERLAYS.forEach((id) => $(`#${id}`).classList.remove('open'));
  $('#scrim').classList.remove('on');
  syncChrome();
}
// The topmost open screen lights its row in the menu.
function syncChrome() {
  const top = [...OVERLAYS].reverse().find((id) => $(`#${id}`).classList.contains('open')) ?? 'chat';
  app.dataset.view = top;
  $$('.drow').forEach((d) => d.classList.toggle('active', d.dataset.go === top));
}

// Laptop: the menu button opens and closes the sidebar (remembered). Phone and iPad: it slides over.
const SIDE_KEY = 'dv-side';
const setSide = (closed) => { $('.app').classList.toggle('side-closed', closed); try { localStorage.setItem(SIDE_KEY, closed ? 'closed' : 'open'); } catch {} };
try { $('.app').classList.toggle('side-closed', localStorage.getItem(SIDE_KEY) === 'closed'); } catch {}
$('#menuBtn').addEventListener('click', () => (wide.matches ? setSide(!$('.app').classList.contains('side-closed')) : open('drawer')));
$('#scrim').addEventListener('click', () => close('drawer'));
$('#openSettings').addEventListener('click', () => open('settings'));
$('#openProfiles').addEventListener('click', () => open('profiles'));
$$('[data-go]').forEach((b) => b.addEventListener('click', () => open(b.dataset.go)));
$$('[data-close]').forEach((b) => b.addEventListener('click', () => close(b.dataset.close)));


// ---------------- state ----------------
async function refresh(next) {
  data = next ?? (await api('/api/state'));
  const toCheck = data.cards.filter((c) => c.checkReason).length;
  $('#menuDot').classList.toggle('hidden', !toCheck);
  $('#drawerCount').classList.toggle('hidden', !toCheck);
  $('#drawerCount').textContent = toCheck;
  // On a laptop the menu is a sidebar that's always showing, so keep it current.
  if (wide.matches) renderDrawer();
}
const wide = matchMedia('(min-width: 1100px)');
wide.addEventListener('change', () => { if (wide.matches) { renderDrawer(); $('#scrim').classList.remove('on'); } });

// Sidebar: the newest cards learned from chat, newest first.
function renderDrawer() {
  renderChats();
  const recent = (data.learned ?? []).slice(-3).reverse();
  $('#drawerLearned').innerHTML = recent.length
    ? recent.map((l) => `<button class="learned-row" data-cat="${esc(l.category)}"><span class="cat-icon">${catIcon(l.category)}</span><span>${esc(l.text)}</span></button>`).join('')
    : `<p class="hint-line">New cards from your chats show up here.</p>`;
  $$('#drawerLearned .learned-row').forEach((b) => b.addEventListener('click', () => { closeAll(); open('memory'); openCategory(b.dataset.cat); }));
}

// Saved chats, newest first, under the memory section. The open one is highlighted.
const chatKey = () => `dv-chat-${data?.profile?.id ?? ''}`;
async function renderChats() {
  const { chats } = await api('/api/chats').catch(() => ({ chats: [] }));
  const box = $('#drawerChats');
  box.innerHTML = chats.length
    ? chats.slice(0, 30).map((c) => `<button class="chat-row${c.id === conversationId ? ' active' : ''}" data-id="${esc(c.id)}" title="${esc(c.title)}">${esc(c.title)}</button>`).join('')
    : `<p class="hint-line">Your chats show up here.</p>`;
  $$('#drawerChats .chat-row').forEach((b) => b.addEventListener('click', () => openChat(b.dataset.id)));
}

// Reopen a saved chat: its messages and any pick, as they were. Keep chatting in it.
async function openChat(id) {
  let chat;
  try { chat = await api(`/api/chats/${encodeURIComponent(id)}`); } catch { try { localStorage.removeItem(chatKey()); } catch {} return renderWelcome(); }
  demoRunning = false;
  conversationId = id;
  thread.innerHTML = '';
  chat.messages.forEach((m, i) => addMsg(m.role, m.role === 'user' ? esc(m.text) : md(m.text) + (m.draft ? pickHtml(m.draft, `saved-${id}-${i}`) : '')));
  closeAll();
  rememberChat();
  renderChats();
  const v = $('#view-chat');
  requestAnimationFrame(() => { v.scrollTop = v.scrollHeight; });
}
const rememberChat = () => { try { localStorage.setItem(chatKey(), conversationId); } catch {} };

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
    box.querySelector('button').addEventListener('click', askRebuild);
    thread.append(box);
    return;
  }
  thread.append(el(`<p class="welcome">Try one of these, or just chat</p>`));
  const s = el(`<div class="suggestions"></div>`);
  const demo = el(`<button class="play-demo">▶ Play a demo conversation</button>`);
  demo.addEventListener('click', playDemo);
  s.append(demo);
  for (const q of data.profile?.suggestions?.length ? data.profile.suggestions : SUGGESTIONS) {
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

let inFlight = 0;
async function send(message, { skipCue = false } = {}) {
  inFlight++;
  try { return await sendInner(message, { skipCue }); } finally { inFlight--; }
}
async function sendInner(message, { skipCue = false } = {}) {
  if (!skipCue) addMsg('user', esc(message));
  const t = typing();
  try {
    const res = await api('/api/chat', { message, mode, conversationId, skipCue, demo: demoRunning });
    t.remove();
    rememberChat();
    renderChats();
    if (res.trace?.quietYes?.confirmed) toast(`Confirmed “${res.trace.quietYes.text}”: you went with it twice.`);
    renderAnswer(res, message);
  } catch (err) {
    t.remove();
    addMsg('assistant', `<p>${esc(err.message)}</p>`);
  }
}

// After an answer: one quiet row. Details (cards used, tokens) only on ⓘ.
function renderAnswer(res, question) {
  // Answer first, check after: the pick reads as a normal reply, the check sits under it.
  addMsg('assistant', md(res.text) + (res.draft ? pickHtml(res.draft, question) : ''));
  if (res.check) renderCheck(res.check, question);
  const ctx = res.tokens.context;
  const full = res.tokens.fullHistory;
  sessionLog.push({ question, mode: res.mode, tokens: ctx, full, cards: res.usedCards.length });
  scheduleLearnedCheck();

  const used = res.usedCards;
  const meta = el(`<div class="meta quiet">
    <div class="meta-row">
      <button class="mini info" aria-label="What I used" title="What I used">ⓘ</button>
    </div>
    <div class="meta-detail hidden"></div>
  </div>`);
  const detail = meta.querySelector('.meta-detail');
  meta.querySelector('.info').addEventListener('click', () => {
    if (!detail.classList.contains('hidden')) return detail.classList.add('hidden');
    let line;
    if (res.mode === 'cards') {
      const pct = full ? Math.round((1 - ctx / full) * 100) : 0;
      line = used.length ? `Used ${used.length} card${used.length > 1 ? 's' : ''} · ~${ctx} tokens <span class="savings">(${pct}% less than full history)</span>` : 'No cards needed for this one';
    } else line = res.mode === 'full' ? `Read the full chat history · ~${ctx.toLocaleString()} tokens` : 'Memory off';
    detail.innerHTML = `<div>${line}</div>${res.trace ? `<div class="trace-line">${traceLine(res.trace)}</div>` : ''}`;
    if (used.length) {
      const chips = el('<div class="chips"></div>');
      for (const c of used) {
        const chip = el(`<button class="chip ${c.status}" title="Open in Memory">${esc(c.text)}</button>`);
        chip.addEventListener('click', () => openCard(c.id));
        chips.append(chip);
      }
      detail.append(chips);
    }
    detail.classList.remove('hidden');
    scrollDown();
  });
  thread.append(meta);
  scrollDown();
}

// Jump from a chip to that exact card in Memory (list view, highlighted).
function openCard(id) {
  const card = data.cards.find((c) => c.id === id);
  if (!card) return toast('That card has changed since.');
  open('memory');
  openCategory(card.category);
  setSeg('list');
  requestAnimationFrame(() => {
    const row = document.querySelector(`#catList [data-card="${CSS.escape(id)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center' });
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 1600);
  });
}

// Learning happens in the background after each answer; mention new cards once.
let learnedSeen = null;
function scheduleLearnedCheck() {
  for (const ms of [4000, 12000]) setTimeout(async () => {
    const prev = learnedSeen;
    await refresh();
    const fresh = (data.learned ?? []).filter((l) => !prev || l.at > prev);
    if (!fresh.length) return;
    learnedSeen = fresh.at(-1).at;
    // Memory changing on its own from what was said: shown where it happened.
    for (const l of fresh.filter((x) => x.was)) {
      const n = el(`<button class="mem-update"><span class="mu-tag">↻ Memory updated</span><s>${esc(l.was)}</s><b>${esc(l.text)}</b></button>`);
      n.addEventListener('click', () => openCard(l.id));
      thread.append(n);
      scrollDown();
    }
    const plain = fresh.filter((x) => !x.was);
    if (plain.length) toast(`${data.agent.name} noticed: “${plain.at(-1).text}”${plain.length > 1 ? ` (+${plain.length - 1} more)` : ''}`);
  }, ms);
}

function cardHtml(card, { why = '', sources = false } = {}) {
  return `<div class="swipe-card">
    <span class="stamp yes">STILL TRUE</span><span class="stamp no">NOT ANYMORE</span><span class="stamp edit"></span>
    ${why ? `<div class="why">${esc(why)}</div>` : ''}
    <div class="cat">${esc(card.category)}${card.sub ? ` · ${esc(card.sub)}` : ''} · ${card.type === 'lesson' ? 'lesson' : 'preference'}</div>
    ${seasonBadge(card)}
    <div class="text">${esc(card.text)}</div>
    ${card.changed_from ? `<div class="was">${esc(card.changed_from)}</div>` : ''}
    ${card.note ? `<div class="note">💬 ${esc(card.note)}</div>` : ''}
    ${sources ? `<div class="dates">${esc(dateLine(card))}</div>` : ''}
    ${sources ? `<button class="why-btn" type="button">Why do you think this?</button><div class="srcs"></div>` : '<div class="hint">Swipe → still true · ← not anymore</div>'}
  </div>`;
}

// What the loop decided for one answer, in a line (shown under ⓘ).
const QUIET = {
  low_stakes: 'no check: nothing at stake',
  asked_this_chat: 'no check: already asked once in this chat',
  cooldown: 'no check: asked recently',
  recently_asked: 'no check: asked about these this week',
  nothing_to_check: 'no check: the cards it used are confirmed or fresh',
  redo: 'redone with your change',
};
function traceLine(t) {
  if (t.mode !== 'cards') return t.mode === 'none' ? 'Memory off: nothing used, asked or learned' : 'Full history, no checks';
  const parts = [`Picked ${t.picked} card${t.picked === 1 ? '' : 's'}`, `${t.stakes} stakes`];
  parts.push(t.check ? `checked “${esc(t.check)}”` : esc(QUIET[t.quiet] ?? 'no check'));
  if (t.quietYes) parts.push(`you carried on, so “${esc(t.quietYes.text)}” counts as a yes`);
  return parts.join(' · ');
}

// The check line above an answer: what it went with, ✓ / ✕, never blocking.
// Sending the next message without ✕ counts as a quiet yes (the server keeps score).
function renderCheck(check, question) {
  const wrap = el(`<div class="cue check"><p class="q">${esc(check.question)}</p>${cardHtml(check.card)}
    <div class="cue-actions"><button class="no">✕ Not anymore</button><button class="mic" aria-label="Answer by voice">🎙</button><button class="yes">✓ Still true</button></div></div>`);
  thread.append(wrap);
  scrollDown();
  const card = wrap.querySelector('.swipe-card');
  let done = false;
  const settle = () => { if (done) return false; done = true; openCueSkip = null; wrap.querySelector('.cue-actions')?.remove(); return true; };
  const note = (text) => wrap.append(el(`<p class="q settled">${esc(text)}</p>`));
  // Carrying on: fold the card away; it stays a guess the server just nudged up.
  openCueSkip = () => { if (!settle()) return; card.style.display = 'none'; note(`Kept “${check.card.text}”.`); };

  const yes = async () => {
    if (!settle()) return;
    try {
      await refresh(await api(`/api/cards/${check.card.id}`, { action: 'confirm' }));
      card.style.display = 'none';
      note(`✓ Saved “${check.card.text}” as confirmed.`);
    } catch (err) { toast(err.message); }
  };
  const no = async () => {
    if (!settle()) return;
    wrap.querySelector('.q')?.remove(); // the reply right after says what was forgotten
    try {
      await refresh(await api(`/api/cards/${check.card.id}`, { action: 'reject' }));
      offerChatInline(`Got it, I’ve forgotten “${check.card.text}”.`, () => startUpdateChat({ category: check.card.category, oldText: check.card.text, question }), () => offerRedo(question, 'Redo it without that?'));
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
    await applyUpdate({ category: check.card.category, oldText: check.card.text, cardId: check.card.id }, v.text);
    offerRedo(question);
  }, '🎙');
}

// One button: redo the last answer with what just changed. Only on request.
function offerRedo(question, label = 'Redo it with that?') {
  if (!question) return;
  const m = addMsg('assistant', `<div class="inline-actions"><button class="ilink redo">↻ ${esc(label)}</button></div>`);
  m.classList.add('bare');
  m.querySelector('.redo').addEventListener('click', () => { m.remove(); send(question, { skipCue: true }); });
}

// ---------------- picks: the action a confirmation controls ----------------
// A booking or order the agent picked from memory, shown inside its reply. Redone
// after a ✕, the new pick marks what changed against the last one for the same request.
const lastDraft = new Map();
function pickHtml(d, question) {
  const prev = lastDraft.get(question);
  lastDraft.set(question, d);
  const lines = [...(d.items ?? []), ...(d.details ?? [])];
  const prevLines = prev ? [...(prev.items ?? []), ...(prev.details ?? [])] : [];
  // The model rewords freely between picks: a line counts as the same if most of its words match.
  const words = (l) => new Set(l.toLowerCase().replace(/[^a-z0-9$\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
  const same = (a, b) => { const A = words(a), B = words(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / (Math.min(A.size, B.size) || 1) >= 0.5; };
  const isNew = (l) => prev && !prevLines.some((p) => same(p, l));
  const gone = prev ? prevLines.filter((p) => !lines.some((l) => same(p, l))) : [];
  const head = [d.when, d.party].filter(Boolean).map(esc).join(' · ');
  return `<div class="pick${prev ? ' updated' : ''}">
    <div class="pick-title">${esc(d.title)}</div>
    ${head ? `<div class="pick-when">${head}</div>` : ''}
    <ul>${lines.map((l) => `<li class="${isNew(l) ? 'new' : ''}">${esc(l)}</li>`).join('')}${gone.map((l) => `<li class="gone">${esc(l)}</li>`).join('')}</ul>
  </div>`;
}

// A normal agent message with two quiet links. Nothing waits on it: the person can
// tap Chat about it, tap Skip, or just send their next message.
function offerChatInline(lead, onChat, onSkip) {
  const m = addMsg('assistant', `<p>${esc(lead)} Want to tell me what changed?</p>
    <div class="inline-actions"><button class="ilink chat">💬 Chat about it</button><button class="ilink skip">Skip for now</button></div>`);
  const actions = m.querySelector('.inline-actions');
  actions.querySelector('.chat').addEventListener('click', () => { actions.remove(); onChat(); });
  actions.querySelector('.skip').addEventListener('click', () => { actions.remove(); onSkip?.(); });
}

// The opener for telling the agent what changed, one form for every kind of card
// (a preference, a person, a lesson): the old card, shortened, then "→ now ".
const shortCard = (text, words = 6) => { const w = text.split(/\s+/); return w.length > words ? w.slice(0, words).join(' ') + '…' : text; };
const changeLine = (text) => `“${shortCard(text)}” → now `;

// Land in chat with the sentence started for them; they only finish it.
let pendingUpdate = null;
let openCueSkip = null; // set while a quick check is waiting
function startUpdateChat(info) {
  closeAll();
  pendingUpdate = info;
  const input = $('#input');
  input.value = changeLine(info.oldText);
  growInput();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

// Several removed cards at once: one bullet each, the user just fills in "now …".
function startMultiUpdate(category, cards) {
  closeAll();
  pendingUpdate = { items: cards.map((c) => ({ category: c.category, oldText: c.text })) };
  const input = $('#input');
  input.value = cards.map((c) => `• ${changeLine(c.text)}`).join('\n');
  growInput();
  input.focus();
  // Cursor at the end of the first bullet.
  const first = input.value.indexOf('→ now ') + '→ now '.length;
  input.setSelectionRange(first, first);
}

async function applyUpdates(items, message) {
  const lines = message.split('\n').filter((l) => l.trim().startsWith('•'));
  const t = typing();
  const saved = [];
  for (const [i, item] of items.entries()) {
    const after = (lines[i] ?? '').split('→ now')[1]?.trim();
    if (!after) continue; // left blank: nothing to save
    try {
      const res = await api('/api/memory/update', { ...item, message: `${changeLine(item.oldText)}${after}` });
      await refresh(res);
      if (res.card) saved.push(res.card);
    } catch (err) { toast(err.message); }
  }
  t.remove();
  addMsg('assistant', saved.length
    ? `<p>Got it. Saved:</p><ul>${saved.map((c) => `<li><b>${esc(catLabel(c.category))}</b>: “${esc(c.text)}” ✓</li>`).join('')}</ul>`
    : `<p>Okay, nothing new to save for now.</p>`);
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
    if (Math.abs(dx) > 90) {
      card.dataset.dragged = '1';
      return fling(card, dx > 0 ? 'confirm' : 'reject', () => onAction(dx > 0 ? 'confirm' : 'reject'));
    }
    Object.values(stamps).forEach((s) => (s.style.opacity = 0));
    if (dy < -80 && Math.abs(dx) < 60) { card.style.transform = ''; onAction('edit'); }
    else card.style.transform = '';
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

// Every choice reads as a swipe, even from a button, voice or the demo: the card leans
// with its stamp showing, then flies off. A card already dragged past the line just flies.
function fling(card, action, after) {
  const dir = action === 'confirm' ? 1 : -1;
  const stamp = card.querySelector(action === 'confirm' ? '.stamp.yes' : '.stamp.no');
  const fly = () => {
    card.style.transition = 'transform .35s ease-in, opacity .35s ease-in';
    card.style.transform = `translate(${dir * 520}px, -30px) rotate(${dir * 24}deg)`;
    card.style.opacity = '0';
    setTimeout(() => {
      card.style.transition = '';
      if (card.closest('.cue')) card.style.display = 'none';
      after();
    }, 340);
  };
  if (card.dataset.dragged) { delete card.dataset.dragged; return fly(); }
  card.style.transition = 'transform .55s cubic-bezier(.2, .8, .2, 1)';
  card.style.transform = `translate(${dir * 70}px, -4px) rotate(${dir * 5}deg)`;
  if (stamp) { stamp.style.transition = 'opacity .3s'; stamp.style.opacity = 1; }
  setTimeout(fly, 750);
}

// ---------------- composer ----------------
const inputEl = $('#input');
const growInput = () => { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 168) + 'px'; };
inputEl.addEventListener('input', growInput);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); }
});
$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#input').value.trim();
  if (!v) return;
  $('#input').value = '';
  growInput();
  if (openCueSkip) openCueSkip(); // typing on counts as skipping the open quick check
  if (pendingUpdate?.items) {
    const items = pendingUpdate.items;
    pendingUpdate = null;
    addMsg('user', esc(v).replace(/\n/g, '<br>'));
    applyUpdates(items, v);
    return;
  }
  if (pendingUpdate) {
    const info = pendingUpdate;
    pendingUpdate = null;
    addMsg('user', esc(v));
    applyUpdate({ category: info.category, oldText: info.oldText }, v).then(() => offerRedo(info.question));
    return;
  }
  send(v);
});
$('#plusBtn').addEventListener('click', () => { if (!thread.querySelector('.suggestions')) renderWelcome(); });
voiceButton($('#micBtn'), (v) => { if (v.transcript) { $('#input').value = v.transcript; $('#input').focus(); } else toast('Didn’t catch that.'); }, $('#micBtn').innerHTML);
const newChat = () => { demoRunning = false; conversationId = newId(); try { localStorage.removeItem(chatKey()); } catch {} renderWelcome(); renderChats(); closeAll(); $('#view-chat').scrollTop = 0; $('#input').value = ''; growInput(); if (wide.matches) $('#input').focus(); };
$('#newChatBtn').addEventListener('click', newChat);
$('#drawerNewChat').addEventListener('click', newChat);

$('#modeChip').addEventListener('click', () => {
  if (data.memoryOff) return open('memoryIntro');
  const i = MODES.findIndex((m) => m.id === mode);
  mode = MODES[(i + 1) % MODES.length].id;
  $('#modeChip').dataset.mode = mode;
  $('#modeLabel').textContent = MODES.find((m) => m.id === mode).label;
  toast({ cards: 'Using only the cards relevant to each question.', full: 'Comparison mode: the agent reads your entire history.', none: 'Comparison mode: no memory at all.' }[mode]);
});

// ---------------- memory: categories ----------------
// Building memory from the whole history runs in the background with a live progress
// bar; when it's done, one note in chat links to Memory.
let buildPoll = null;
// Every rebuild asks first, and says what it will and won't touch.
const dayLabel = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
async function askRebuild() {
  let plan;
  try { plan = await api('/api/build/plan'); } catch (err) { return toast(err.message); }
  const li = (b, t) => `<li><b>${esc(b)}</b> ${esc(t)}</li>`;
  const go = $('#rebuildGo');
  go.hidden = !plan.allowed;
  $('#rebuildCancel').textContent = plan.allowed ? 'Not now' : 'OK';
  if (plan.mode === 'wait') {
    $('#rebuildTitle').textContent = 'Memory was refreshed recently';
    $('#rebuildList').innerHTML = li(`You rebuilt it on ${dayLabel(plan.lastAt)}.`, `You can rebuild again on ${dayLabel(plan.nextAt)}.`) +
      li('Sooner once you’ve chatted more.', 'Then I read only the new chats.') +
      li('Nothing is lost meanwhile.', 'I keep learning from each chat as it happens.');
  } else if (plan.mode === 'new') {
    $('#rebuildTitle').textContent = 'Read your new chats?';
    $('#rebuildList').innerHTML = li(`Only what’s new since ${dayLabel(plan.since ?? plan.lastAt)}.`, 'Everything already in memory stays as it is.') +
      li('Confirmed cards guide me.', 'I won’t repeat or reword them; if one changed, I’ll ask you.');
    go.textContent = 'Read new chats';
  } else {
    $('#rebuildTitle').textContent = plan.lastAt || plan.cards ? 'Rebuild from all your chats?' : 'Build from your chats?';
    $('#rebuildList').innerHTML = li(plan.since ? `I’ll read from ${dayLabel(plan.since)}.` : 'I’ll re-read your whole history.', plan.since ? 'Every card before that is already confirmed by you.' : 'It runs in the background; keep chatting.') +
      (plan.confirmed ? li(`Your ${plan.confirmed} confirmed card${plan.confirmed === 1 ? '' : 's'} stay.`, 'I use them as a guide and won’t reword them; if one changed, I’ll ask you.') : '') +
      (plan.cards > plan.confirmed ? li('Guesses may change.', 'Cards you haven’t confirmed yet can be replaced or removed.') : '') +
      li('Once a month.', 'Sooner only for new chats.');
    go.textContent = plan.lastAt || plan.cards ? 'Rebuild memory' : 'Build my memory';
  }
  open('rebuildSheet');
}
$('#rebuildGo').addEventListener('click', () => { close('rebuildSheet'); startBuild(); });
async function startBuild() {
  try { showBuild(await api('/api/build', { confirm: true })); } catch (err) { return toast(err.message); }
  clearInterval(buildPoll);
  buildPoll = setInterval(async () => {
    const job = await fetch('/api/build').then((r) => r.json()).catch(() => null);
    if (!job) return;
    showBuild(job);
    if (job.done) { clearInterval(buildPoll); await buildDone(job); }
  }, 700);
}
function showBuild(job) {
  $('#buildBox').hidden = !job.running;
  $('#buildLabel').textContent = job.label ?? 'Working';
  $('#buildPct').textContent = `${job.pct ?? 0}%`;
  $('#buildFill').style.width = `${job.pct ?? 0}%`;
  $('#redistillBtn').disabled = $('#distillBtn').disabled = !!job.running;
}
async function buildDone(job) {
  if (job.report && !job.report.turns) return addMsg('assistant', '<p>No new chats to read since your last rebuild. Your memory is up to date.</p>');
  if (job.error) return addMsg('assistant', `<p>${esc(`I couldn’t finish rebuilding your memory: ${job.error}`)}</p>`);
  await refresh(await api('/api/state'));
  renderMemory();
  const r = job.report;
  const toCheck = data.cards.filter((c) => c.checkReason).length;
  const confirmed = data.cards.filter((c) => c.status === 'confirmed').length;
  const notes = [
    r.instructionsSkipped ? `skipped ${r.instructionsSkipped} message${r.instructionsSkipped === 1 ? '' : 's'} that read like instructions to me` : '',
    r.secretsRemoved ? `left out ${r.secretsRemoved} password${r.secretsRemoved === 1 ? '' : 's'} or code${r.secretsRemoved === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  const m = addMsg('assistant', `<p>${esc(`Your memory is rebuilt from ${r.turns} turns: ${data.cards.length} cards, ${confirmed ? `${confirmed} you confirmed kept as they are, ` : ''}${toCheck} for you to check.`)}${notes.length ? ` ${esc(`I ${notes.join(' and ')}.`)}` : ''}</p>
    <div class="inline-actions"><button class="ilink open-mem">Open Memory</button></div>`);
  m.querySelector('.open-mem').addEventListener('click', () => { renderMemory(); open('memory'); });
}
$('#distillBtn').addEventListener('click', askRebuild);
$('#redistillBtn').addEventListener('click', askRebuild);

const subsOf = (cards) => [...new Set(cards.map((c) => c.sub).filter(Boolean))];

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
  // When memory started (the earliest thing a card was learned from) and when you last approved a card.
  const starts = data.cards.map((c) => c.first_seen ?? c.created).filter(Boolean).sort();
  const verified = data.cards.map((c) => c.last_confirmed).filter(Boolean).sort();
  const day = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  $('#memDates').innerHTML = empty ? '' : `<span>Memory since <b>${starts.length ? day(starts[0]) : '—'}</b></span><span>Last verified <b>${verified.length ? day(verified.at(-1)) : 'not yet'}</b></span>`;
  const grid = $('#catGrid');
  grid.innerHTML = '';
  for (const [cat, cards] of groups()) {
    const check = cards.filter((c) => c.checkReason).length;
    const tile = el(`<button class="cat-tile"><span class="cat-icon">${catIcon(cat)}</span>
      <span class="cat-name">${esc(catLabel(cat))}</span>
      <span class="fine">${cards.length} card${cards.length === 1 ? '' : 's'}${check ? ` · <b class="to-check">${check} to check</b>` : ''}</span>
      ${subsOf(cards).length ? `<span class="fine subs">${subsOf(cards).map(esc).join(' · ')}</span>` : ''}</button>`);
    tile.addEventListener('click', () => openCategory(cat));
    grid.append(tile);
  }
}

// ---------------- memory: one category ----------------
let deck = { cat: null, ids: [], i: 0 };

function openCategory(cat, sub = null) {
  const all = data.cards.filter((c) => c.category === cat);
  const cards = sub ? all.filter((c) => c.sub === sub) : all;
  const subs = subsOf(all);
  const chips = $('#catSubs');
  chips.innerHTML = '';
  if (subs.length) {
    for (const s of [null, ...subs]) {
      const b = el(`<button class="${s === sub ? 'on' : ''}">${esc(s ?? 'All')}</button>`);
      b.addEventListener('click', () => openCategory(cat, s));
      chips.append(b);
    }
  }
  // Cards that need a check come first, then everything else it knows.
  cards.sort((a, b) => (b.checkReason ? 1 : 0) - (a.checkReason ? 1 : 0));
  deck = { cat, sub, ids: cards.map((c) => c.id), i: 0, removed: [] };
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
    const done = el(`<div class="deck-done"><p>That’s everything I know about your ${esc(deck.cat)}.</p><button class="ghost" type="button">See as list</button></div>`);
    done.querySelector('button').addEventListener('click', () => setSeg('list'));
    // One question at the end, not one per swipe.
    if (deck.removed.length) {
      const n = deck.removed.length;
      const box = el(`<div class="after-no"><p>You removed ${n} ${esc(deck.cat)} card${n > 1 ? 's' : ''}. Want to tell ${esc(data.agent.name)} what changed?</p>
        <div class="after-actions"><button class="skip">Skip for now</button><button class="chat">💬 Chat about ${n > 1 ? 'them' : 'it'}</button></div></div>`);
      box.querySelector('.skip').addEventListener('click', () => { deck.removed = []; box.remove(); });
      box.querySelector('.chat').addEventListener('click', () => {
        const removed = deck.removed;
        deck.removed = [];
        removed.length > 1 ? startMultiUpdate(deck.cat, removed) : startUpdateChat({ category: removed[0].category, oldText: removed[0].text });
      });
      done.append(box);
    }
    root.append(done);
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
  if (act === 'reject') deck.removed.push(card);
  deck.i++;
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
  const cards = data.cards.filter((c) => c.category === deck.cat && (!deck.sub || c.sub === deck.sub));
  const max = data.budget.limits.maxCardsPerCategory;
  const tokens = data.budget.categories[deck.cat]?.tokens ?? 0;
  const sec = el(`<section class="category"><header><h2>${esc(catLabel(deck.cat))}</h2><span class="budget">${cards.length}/${max} cards · ~${tokens} tokens</span></header><div class="meter"><i style="width:${Math.min(100, (cards.length / max) * 100)}%"></i></div></section>`);
  let lastSub;
  // Awake seasons first, then the rest by sub-topic.
  const asleep = (c) => (c.seasonState?.active === false ? 1 : 0);
  for (const c of [...cards].sort((a, b) => asleep(a) - asleep(b) || (a.sub ?? '').localeCompare(b.sub ?? ''))) {
    if (c.sub && c.sub !== lastSub) sec.append(el(`<div class="sub-head">${esc(c.sub)}</div>`));
    lastSub = c.sub;
    sec.append(listCard(c));
  }
  root.append(sec);
}

function listCard(c) {
  const row = el(`<div class="ccard" data-card="${esc(c.id)}"><div class="top"><div><div class="txt">${esc(c.text)}</div>
    <div class="kind">${c.type === 'lesson' ? 'Lesson' : 'Preference'} · from ${c.sources.length} message${c.sources.length === 1 ? '' : 's'}${c.changed_from ? ` · was “${esc(c.changed_from)}”` : ''}</div>
    ${c.note ? `<div class="kind">💬 ${esc(c.note)}</div>` : ''}
    <div class="kind">${esc(dateLine(c))}</div>${seasonBadge(c)}</div>
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

  renderTrace();
  renderGate();
  renderEval();
  const box = $('#sessionLog');
  if (!sessionLog.length) return;
  const full = data.fullHistoryTokens;
  box.innerHTML = `<h3>This session</h3>
    <div class="bar"><span class="lbl">Full history</span><span class="track"><span class="fill" style="width:100%;background:var(--series-2)"></span></span><span class="val">${full.toLocaleString()}</span></div>
    <div class="bar"><span class="lbl">Your cards (avg)</span><span class="track"><span class="fill" style="width:${Math.max(1, (avg / full) * 100)}%;background:var(--series-1)"></span></span><span class="val">${avg}</span></div>
    ${sessionLog.map((l) => `<div class="log-row"><span>${esc(l.question)}</span><span>${l.mode === 'cards' ? `${l.cards} cards · ${l.tokens} tok` : l.mode === 'full' ? `full · ${l.tokens.toLocaleString()} tok` : 'no memory'}</span></div>`).join('')}`;
}

// What the loop decided across answers: checks asked, and why it stayed quiet the rest of the time.
function renderTrace() {
  const box = $('#traceBox');
  const t = data.trace;
  if (!t?.answers) { box.hidden = true; return; }
  const quiet = Object.entries(t.quiet ?? {}).filter(([k]) => k !== 'redo');
  const quietTotal = quiet.reduce((a, [, n]) => a + n, 0);
  box.hidden = false;
  box.innerHTML = `<h3>What I decided</h3>
    <p class="fine">Every answer, I pick the cards that matter and decide whether a guess is worth a quick check. Most of the time the answer is no.</p>
    <div class="log-row"><span>Answers</span><span>${t.answers}</span></div>
    <div class="log-row"><span>Quick checks asked</span><span>${t.checksAsked} <span class="fine">(${Math.round((t.checksAsked / t.answers) * 100)} per 100 answers)</span></span></div>
    <div class="log-row"><span>Stayed quiet</span><span>${quietTotal}</span></div>
    ${quiet.map(([k, n]) => `<div class="log-row sub"><span>${esc((QUIET[k] ?? k).replace(/^no check: /, ''))}</span><span>${n}</span></div>`).join('')}
    <div class="log-row"><span>Quiet yeses (you carried on)</span><span>${t.quietYes}</span></div>
    <div class="log-row"><span>Drafts made from memory</span><span>${t.drafts}</span></div>`;
}

// What the memory agent did: one model writes cards, rules and a second model screen them.
const REASONS = { too_long: 'too long', about_agent: 'about me, not you', trait: 'a label, not a preference', no_user_source: 'not in your words', unsupported: 'not backed by the chat', one_off: 'a one-off', duplicate: 'already known', empty: 'empty' };
function renderGate() {
  const box = $('#gateBox');
  const r = data.review;
  if (!r?.proposed) { box.hidden = true; return; }
  const dropped = Object.entries({ ...r.byRules }).concat(Object.entries(r.byGrader));
  const totals = {};
  for (const [k, n] of dropped) totals[k] = (totals[k] ?? 0) + n;
  const writer = data.models.bg, grader = data.models.grader;
  box.hidden = false;
  box.innerHTML = `<h3>What I kept, and what I didn't</h3>
    <p class="fine">${esc(writer)} writes cards from your chats. ${grader ? `Code rules and ${esc(grader)} check each one against your own words` : 'Code rules check each one'} before it's saved.</p>
    <div class="log-row"><span>Proposed</span><span>${r.proposed}</span></div>
    <div class="log-row"><span>Kept</span><span>${r.kept}${r.locked ? ` (${r.locked} 🔒 locked)` : ''}</span></div>
    ${Object.entries(totals).map(([k, n]) => `<div class="log-row"><span>Dropped: ${esc(REASONS[k] ?? k)}</span><span>${n}</span></div>`).join('')}
    ${data.screened?.length ? `<details class="table-view"><summary>Recently dropped</summary>${data.screened.slice(-8).reverse().map((d) => `<div class="log-row"><span>${esc(d.text)}</span><span>${esc(REASONS[d.reason] ?? d.reason)}</span></div>`).join('')}</details>` : ''}`;
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

// ---------------- demo conversation ----------------
// A natural chat, typed for you: when a card pops up, and when it doesn't.
const DEMO_SCRIPT = [
  'hey! anything fun to watch tonight?',                 // casual: no quick check
  'find a place for dinner tonight with the family',      // a plan: may ask once
  'oh btw Sam started eating chicken and fish again',     // learned quietly, no popup
  'grab my usual drink on the way in',                    // already asked this chat: no popup
  'book us a hotel in Miami for spring break',            // remembered, not asked
];
let demoRunning = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function playDemo() {
  if (demoRunning) return;
  demoRunning = true;
  closeAll();
  try {
    await refresh(await api('/api/demo/load', {}));
  } catch (err) {
    demoRunning = false;
    return toast(err.message);
  }
  learnedSeen = data.learned?.at(-1)?.at ?? '';
  conversationId = newId();
  thread.innerHTML = '';
  const input = $('#input');
  const typeIn = async (text) => { for (const ch of text) { input.value += ch; growInput(); await sleep(28); } await sleep(350); $('#composer').requestSubmit(); };
  const settled = async () => { await sleep(400); while (demoRunning && inFlight > 0) await sleep(300); };
  const until = async (sel, ms = 15000) => { for (let t = 0; t < ms && demoRunning; t += 300) { const n = [...document.querySelectorAll(sel)].at(-1); if (n) return n; await sleep(300); } return null; };
  for (const raw of data.profile?.script?.length ? data.profile.script : DEMO_SCRIPT) {
    if (!demoRunning) break;
    const step = typeof raw === 'string' ? { text: raw } : raw;
    if (step.newChat) { await sleep(1200); conversationId = newId(); thread.append(el(`<p class="day-sep">${esc(step.newChat)}</p>`)); scrollDown(); continue; }
    await sleep(900);
    await typeIn(step.text);
    // The answer arrives first; react to its check line the way the script says:
    // ignore (carry on = quiet yes, the default), confirm, or reject (+ chat, then redo).
    await settled();
    const open = [...document.querySelectorAll('#thread .cue.check')].at(-1)?.querySelector('.cue-actions');
    if (open && step.onCue && step.onCue !== 'ignore') {
      await sleep(1800);
      open.querySelector(step.onCue === 'reject' ? '.no' : '.yes').click();
      if (step.onCue === 'reject' && step.chat) {
        await settled();
        (await until('#thread .inline-actions .chat'))?.click();
        await sleep(600);
        await typeIn(step.chat);
        await settled();
        if (step.redo !== false) { await sleep(1200); (await until('#thread .inline-actions .redo'))?.click(); }
      }
    }
    await settled();
    await sleep(1800);
  }
  demoRunning = false;
}
$('#playDemoBtn').addEventListener('click', playDemo);

// ---------------- profiles ----------------
const PROFILE_COLORS = ['#0082FB', '#E5484D', '#1FA36A', '#B5541C', '#6250D6', '#0F7B8A'];
async function renderProfiles() {
  const { profiles, active } = await api('/api/profiles');
  const list = $('#profileList');
  list.innerHTML = '';
  profiles.forEach((p, i) => {
    const row = el(`<button class="prow"><span class="pav" style="background:${PROFILE_COLORS[i % PROFILE_COLORS.length]}">${esc(p.name[0])}</span>
      <span><span class="pname">${esc(p.name)}</span><br><span class="pabout">${esc(p.about)}</span></span>${p.id === active ? '<span class="pcheck">✓</span>' : ''}</button>`);
    row.addEventListener('click', () => switchProfile(p.id));
    list.append(row);
  });
}
async function switchProfile(id) {
  demoRunning = false;
  await refresh(await api('/api/profile', { id }));
  applyProfileChrome();
  learnedSeen = data.learned?.at(-1)?.at ?? '';
  sessionLog.length = 0;
  conversationId = newId();
  renderWelcome();
  closeAll();
  toast(`Switched to ${data.profile.name}`);
}
function applyProfileChrome() {
  $('#profileInitial').textContent = (data.profile?.name ?? '?')[0];
  renderMemSwitch();
}

// ---------------- memory on/off + the fast-forward ----------------
function renderMemSwitch() {
  const on = !data.memoryOff;
  $('#memToggle').setAttribute('aria-checked', String(on));
  $('#memSwitchSub').textContent = on ? 'On: I remember what matters to you.' : 'Off: I don’t remember anything.';
  $('#modeChip').classList.toggle('off', !on);
  $('#modeLabel').textContent = on ? MODES.find((m) => m.id === mode).label : 'Memory: off';
}
$('#memToggle').addEventListener('click', async () => {
  if (!data.memoryOff) {
    await refresh(await api('/api/memory/switch', { on: false }));
    renderMemSwitch();
    return toast('Memory is off. Your cards are kept; I just won’t use them.');
  }
  open('memoryIntro');
});
$('#memOnBtn').addEventListener('click', async () => {
  await refresh(await api('/api/memory/switch', { on: true }));
  renderMemSwitch();
  closeAll();
  fastForward();
});

// A time-lapse of the first weeks: cards collecting into topics. Front end only, no model calls.
async function fastForward() {
  const ff = $('#fastForward');
  // One card per topic, preferences and lessons only: a varied, non-personal sample.
  const pool = data.cards.filter((c) => c.status !== 'pending' && !c.sensitive && !['people', 'family', 'privacy', 'assistant', 'other', 'work'].includes(c.category) && !/\b(agent|avatar|charmander|pikachu|emoji)\b/i.test(c.text));
  const shown = [...new Map(pool.map((c) => [c.category, c])).values()].slice(0, 6);
  const total = data.cards.length;
  const topics = new Set(data.cards.map((c) => c.category)).size;
  const weeks = 5;
  $('#ffCardsList').innerHTML = '';
  $('#ffDone').textContent = '';
  $('#ffGo').hidden = true;
  ff.hidden = false;
  requestAnimationFrame(() => ff.classList.add('on'));
  for (let w = 1; w <= weeks; w++) {
    $('#ffWeek').textContent = `Week ${w}`;
    $('#ffCards').textContent = Math.round((total * w) / weeks);
    $('#ffTopics').textContent = Math.max(1, Math.round((topics * w) / weeks));
    for (const c of shown.slice(Math.floor(((w - 1) * shown.length) / weeks), Math.floor((w * shown.length) / weeks))) {
      $('#ffCardsList').prepend(el(`<div class="ff-card"><span class="cat-icon">${catIcon(c.category)}</span><span>${esc(c.text)}</span></div>`));
    }
    await sleep(900);
  }
  $('#ffDone').textContent = `${weeks} weeks of chats → ${total} short cards, about ${data.budget.totalTokens.toLocaleString()} tokens instead of ${data.fullHistoryTokens.toLocaleString()}.`;
  $('#ffGo').hidden = false;
}
$('#ffGo').addEventListener('click', () => {
  const ff = $('#fastForward');
  ff.classList.remove('on');
  setTimeout(() => { ff.hidden = true; }, 300);
  renderWelcome();
});

// ---------------- appearance ----------------
// System by default; Light or Dark when picked. Kept in this browser only.
function currentTheme() {
  return document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function setTheme(t) {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try { t === 'system' ? localStorage.removeItem('dv-theme') : localStorage.setItem('dv-theme', t); } catch {}
  $$('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.t === (document.documentElement.dataset.theme ?? 'system')));
}
$('#themeBtn').addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
$$('#themeSeg button').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.t)));
setTheme(document.documentElement.dataset.theme ?? 'system');

// ---------------- settings ----------------
function renderSettings() {
  const b = data.budget.limits;
  const ceiling = Math.round(b.maxCategories * b.maxCardsPerCategory * b.maxWordsPerCard * 1.4);
  const pct = Math.round((data.budget.totalTokens / ceiling) * 100);
  $('#budgetPct').textContent = `${pct}% used`;
  $('#budgetBar').style.width = `${Math.min(100, pct)}%`;
  $('#engineInfo').innerHTML = `
    <div class="srow static">Mode<span class="fine right">${data.mock ? 'Mock (no API key yet)' : data.museEnabled ? 'Live (Muse)' : 'Replay (saved Muse answers)'}</span></div>
    <div class="srow static">Answers<span class="fine right">${esc(data.models.main)}</span></div>
    <div class="srow static">Memory upkeep<span class="fine right">${esc(data.models.bg)}</span></div>
    <div class="srow static">Limits<span class="fine right">${b.maxCategories} topics · ${b.maxCardsPerCategory} cards · ${b.maxWordsPerCard} words</span></div>`;
}
$('#demoBtn').addEventListener('click', async () => {
  try { await refresh(await api('/api/demo/load', {})); } catch (err) { return toast(err.message); }
  conversationId = newId();
  renderWelcome();
  renderSettings();
  toast(`${data.profile.name}’s starting memory is loaded.`);
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
  learnedSeen = data.learned?.at(-1)?.at ?? '';
  applyProfileChrome();
  // Come back to the chat you were in.
  let last = null;
  try { last = localStorage.getItem(chatKey()); } catch {}
  if (last) await openChat(last); else renderWelcome();
  renderChats();
})();
