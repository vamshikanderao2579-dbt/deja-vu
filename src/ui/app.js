const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('.app');

const MODES = [
  { id: 'cards', label: 'Memory on', chip: 'Memory', about: 'Uses the few cards that fit each message' },
  { id: 'none', label: 'Off for this chat', chip: 'No memory', about: 'A fresh start: nothing used or learned' },
  { id: 'full', label: 'Read full history', chip: 'Full history', about: 'To compare: slower, reads every chat' },
];
const SUGGESTIONS = [
  'What should we have for dinner tonight?',
  'Find me a hotel for a weekend away',
  'Gift ideas for someone in my family',
  'Help me plan my week',
];
// For someone's own imported memory: everyday asks where remembering them matters.
const MINE_SUGGESTIONS = [
  'Plan dinner for this week',
  'Find me a place to stay for a weekend away',
  'Gift ideas for someone close to me',
  'What do you remember about me?',
];
const REASON_LABEL = {
  changed: 'You said something different recently',
  guessed: 'I guessed this from our chats',
  sensitive: 'Private. Used carefully: check it when you can',
  stale: 'We haven’t checked this in a while',
  old: 'Learned over a year ago. Still true?',
  ended: 'Short-term, and its end date has come',
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

// A line icon in the logo's style (symbols in index.html).
const ico = (name, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// Short-term memory: a card that holds only until a date.
function untilBadge(c) {
  if (!c.untilState) return '';
  const day = esc(fmtDay(c.until + 'T12:00:00'));
  if (c.untilState.ended) return `<span class="season short ended">${ico('hourglass', 'sm')} Short-term · ended ${day}</span>`;
  return `<span class="season short">${ico('hourglass', 'sm')} Short-term · ${c.untilState.endsToday ? 'ends today' : `until ${day}`}</span>`;
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
// "Why?": the past chat a card came from, shown as a chat (who said what, when), with
// the exact line highlighted. "Open in chat" shows that whole conversation in the feed.
const pastName = (role) => (role === 'user' ? data.userName : 'Déjà Vu');
const pastLine = (m, hl) => `<div class="pm ${m.role}${hl ? ' hl' : ''}"><b>${esc(pastName(m.role))}:</b> ${esc(m.text).replace(/\n/g, '<br>')}</div>`;
async function loadSources(box, cardId) {
  if (box.innerHTML) { box.innerHTML = ''; return; }
  const res = await api(`/api/sources/${cardId}`);
  const srcIds = new Set(res.sources.map((m) => m.id));
  box.innerHTML = res.conversations.map((c, k) => {
    // The line it came from, with the message before and after it for context.
    const at = c.messages.findIndex((m) => srcIds.has(m.id));
    const near = c.messages.slice(Math.max(0, at - 1), at + 2);
    // An undated import has no moment to point at: point to the file instead.
    if (c.undated) return `<div class="src">
      <div class="src-when"><span class="past-tag">Imported</span>From your uploaded file${c.file ? ` · ${esc(c.file)}` : ''}</div>
      <div class="past">${c.messages.filter((m) => srcIds.has(m.id)).map((m) => pastLine(m, true)).join('')}</div>
    </div>`;
    return `<div class="src">
      <div class="src-when"><span class="past-tag">Past chat</span>${esc(fmtWhen(c.date, c.time))} · ${esc(c.title)}</div>
      <div class="past">${near.map((m) => pastLine(m, srcIds.has(m.id))).join('')}</div>
      <button type="button" class="open-past" data-k="${k}">Open in chat <span aria-hidden="true">→</span></button>
    </div>`;
  }).join('');
  box.querySelectorAll('.open-past').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openPast(res.conversations[b.dataset.k], srcIds); }));
}

// A past conversation in the chat feed, read-only, scrolled to the line a card came from.
function openPast(c, srcIds) {
  // Keep this chat as it is (an open check included) to put back afterwards.
  const kept = [...thread.childNodes];
  const v = $('#view-chat'), top = v.scrollTop;
  closeAll();
  thread.innerHTML = '';
  const head = el(`<div class="past-head"><button class="ilink" type="button">← Back to your chat</button><span><span class="past-tag">Past chat</span>${esc(fmtWhen(c.date, c.time))} · ${esc(c.title)}</span></div>`);
  head.querySelector('button').addEventListener('click', () => { thread.replaceChildren(...kept); requestAnimationFrame(() => { v.scrollTop = top; }); });
  thread.append(head);
  for (const m of c.messages) thread.append(el(`<div class="msg ${m.role} past-msg${srcIds.has(m.id) ? ' hl' : ''}"><span class="who">${esc(pastName(m.role))}</span>${esc(m.text).replace(/\n/g, '<br>')}</div>`));
  const spot = thread.querySelector('.past-msg.hl');
  requestAnimationFrame(() => { spot?.scrollIntoView({ block: 'center', behavior: 'smooth' }); spot?.classList.add('flash'); });
}
const STATUS_LABEL = { confirmed: '✓ Confirmed', inferred: '~ My guess', pending: '~ Private guess' };

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
  finance: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M16 14.5h2"/>',
  immigration: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3.2"/><path d="M8.8 10h6.4M12 6.8c-1 .9-1.4 2-1.4 3.2s.4 2.3 1.4 3.2c1-.9 1.4-2 1.4-3.2s-.4-2.3-1.4-3.2zM9 17h6"/>',
  style: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 4v-4h0A2 2 0 0 1 4 14z"/><path d="M8 8.5h8M8 11.5h5"/>',
  privacy: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2"/>',
  assistant: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4.5V8M9.5 13h.01M14.5 13h.01M9.5 16h5"/>',
  education: '<path d="M2.5 9L12 4.5 21.5 9 12 13.5zM6.5 11v5c1.6 1.6 3.4 2.4 5.5 2.4s3.9-.8 5.5-2.4v-5M21.5 9v5"/>',
  pets: '<circle cx="7" cy="9.5" r="1.8"/><circle cx="17" cy="9.5" r="1.8"/><circle cx="10" cy="5.8" r="1.8"/><circle cx="14" cy="5.8" r="1.8"/><path d="M12 12c-2.8 0-5 3.2-5 5.3 0 1.6 1.2 2.2 2.5 2.2 1 0 1.6-.5 2.5-.5s1.5.5 2.5.5c1.3 0 2.5-.6 2.5-2.2 0-2.1-2.2-5.3-5-5.3z"/>',
  review: '<path d="M20 12a8 8 0 1 1-4.7-7.3"/><path d="M8.5 11.5l3 3L20 6"/>',
  other: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
};
const catIcon = (cat) => `<svg viewBox="0 0 24 24">${ICON[cat] ?? ICON.other}</svg>`;
const catLabel = (cat) => cat[0].toUpperCase() + cat.slice(1);
// "1 card", "3 cards"
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// Every card is in exactly one group, so the numbers on screen always add up:
// to check (anything with a reason to look, confirmed or not), confirmed, or a guess that looks fine.
const bucketOf = (c) => (c.checkReason ? 'check' : c.status === 'confirmed' ? 'confirmed' : 'guess');

let data = null;
// What memory this chat uses: your cards (default), off for just this chat, or the full
// history to compare. Kept per chat in this browser; memory switched off overrides it.
let chatModes = {};
try { chatModes = JSON.parse(localStorage.getItem('dv-chat-modes') || '{}'); } catch {}
const chatMode = () => (data?.memoryOff ? 'none' : chatModes[conversationId] ?? 'cards');
let conversationId = newId();
const sessionLog = [];

function newId() {
  return 'conv-' + Math.random().toString(36).slice(2, 9);
}

let demoRunning = false; // Play demo is running
// Big screens scale the whole app up (--z in styles.css). Screen positions from the
// browser are in real pixels; positions we set are in the app's own, so divide by it.
const uiZoom = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--z')) || 1;
async function api(path, body) {
  // During Play demo, every write says so: the server then lets background learning
  // finish first, so a replay always sees the memory the recording saw.
  if (body !== undefined && demoRunning) body = { demo: true, ...body };
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
const OVERLAYS = ['importSheet', 'drawer', 'settings', 'memory', 'category', 'insights', 'memoryIntro', 'rebuildSheet'];

function open(id) {
  if (id === 'chat') return closeAll();
  if (id !== 'drawer') $('#drawer').classList.remove('open');
  $(`#${id}`).classList.add('open');
  $('#scrim').classList.toggle('on', id === 'drawer');
  if (id === 'memory') { renderMemory(); renderMemSwitch(); }
  if (id === 'insights') renderInsights();
  if (id === 'settings') renderSettings();
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
$('#openProfiles').addEventListener('click', openUserPicker);
$$('[data-go]').forEach((b) => b.addEventListener('click', () => open(b.dataset.go)));
$$('[data-close]').forEach((b) => b.addEventListener('click', () => close(b.dataset.close)));


// ---------------- state ----------------
async function refresh(next) {
  data = next ?? (await api('/api/state'));
  const toCheck = data.cards.filter((c) => c.checkReason).length;
  $('#menuDot').classList.toggle('hidden', !toCheck);
  $('#drawerCount').classList.toggle('hidden', !toCheck);
  $('#drawerCount').textContent = `${toCheck} to check`;
  // On a laptop the menu is a sidebar that's always showing, so keep it current.
  if (wide.matches) renderDrawer();
}
const wide = matchMedia('(min-width: 1100px)');
wide.addEventListener('change', () => { if (wide.matches) { renderDrawer(); $('#scrim').classList.remove('on'); } });

// Sidebar: the newest cards learned from chat, newest first.
function renderDrawer() {
  renderChats();
}

// Memory page: the newest cards learned from chat, newest first.
function renderLearned() {
  const recent = (data.learned ?? []).slice(-3).reverse();
  $('#memLearned').innerHTML = recent.length
    ? `<p class="label sub-label">RECENTLY LEARNED</p>${recent.map((l) => `<button class="learned-row" data-cat="${esc(l.category)}"><span class="cat-icon">${catIcon(l.category)}</span><span>${esc(l.text)}</span></button>`).join('')}`
    : '';
  $$('#memLearned .learned-row').forEach((b) => b.addEventListener('click', () => openCategory(b.dataset.cat)));
}

// Saved chats, newest first, under the memory section. The open one is highlighted.
const chatKey = () => `dv-chat-${data?.profile?.id ?? ''}`;
async function renderChats() {
  // The guided demo's chat is a replay, not one of yours: it stays out of the list.
  const chats = (await api('/api/chats').catch(() => ({ chats: [] }))).chats.filter((c) => !c.id.startsWith('demo-'));
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
  renderMemChip();
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
  renderMemChip();
  if (!data.cards.length && building) {
    thread.append(el(`<div class="msg assistant"><p>${esc(`Hi ${data.userName}! I’m reading your chats now and turning them into short cards. I’ll tell you here when they’re ready.`)}</p></div>`));
    return;
  }
  if (!data.cards.length) {
    const box = el(`<div class="msg assistant"><p>Hi ${esc(data.userName)}! I haven't organized what I know about you yet. Want me to turn our past chats into a few short cards you can check?</p><div class="suggestions"><button>Build my memory from our chats</button></div></div>`);
    box.querySelector('button').addEventListener('click', askRebuild);
    thread.append(box);
    return;
  }
  thread.append(el(`<p class="welcome">Try one of these, or just chat</p>`));
  const s = el(`<div class="suggestions"></div>`);
  if (data.profile?.script?.length) {
    const demo = el(`<button class="play-demo">▶ Play a demo conversation <span class="pd-sub">recorded · instant</span></button>`);
    demo.addEventListener('click', playDemo);
    s.append(demo);
  }
  for (const q of data.profile?.suggestions?.length ? data.profile.suggestions : data.profile?.mine ? MINE_SUGGESTIONS : SUGGESTIONS) {
    const b = el(`<button>${esc(q)}</button>`);
    b.addEventListener('click', () => send(q));
    s.append(b);
  }
  thread.append(s);
  checkEndings();
}

// Short-term cards whose end date has come: ask once, in chat, what to do.
const endingsShown = new Set();
const addMonths = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
function checkEndings() {
  for (const c of data.cards.filter((x) => x.untilState && (x.untilState.endsToday || x.untilState.ended) && !endingsShown.has(x.id))) {
    endingsShown.add(c.id);
    const m = el(`<div class="msg assistant ending"><p><span class="mu-tag">${ico('hourglass', 'sm')} Short-term memory</span></p>
      <p>“${esc(c.text)}” was only until <b>${esc(fmtDay(c.until + 'T12:00:00'))}</b>. Keep it going?</p>
      <div class="end-actions"><button data-x="1">+1 month</button><button data-x="3">+3 months</button><button data-x="keep">Keep for good</button><button data-x="change">Change it</button><button data-x="end" class="quiet">Let it end</button></div></div>`);
    m.querySelector('.end-actions').addEventListener('click', async (e) => {
      const x = e.target.closest('button')?.dataset.x;
      if (!x) return;
      const done = (text) => { m.querySelector('.end-actions').remove(); m.append(el(`<p class="q settled">${esc(text)}</p>`)); };
      try {
        if (x === 'change') { done('Tell me what changed below.'); return startUpdateChat({ category: c.category, oldText: c.text }); }
        if (x === 'end') { await refresh(await api(`/api/cards/${c.id}`, { action: 'reject' })); return done(`Done. “${c.text}” has ended and won’t be used.`); }
        const until = x === 'keep' ? '' : addMonths(data.today, Number(x));
        await refresh(await api(`/api/cards/${c.id}`, { action: 'until', text: until }));
        done(until ? `Extended to ${fmtDay(until + 'T12:00:00')} ✓` : 'Kept for good: it’s long-term memory now ✓');
      } catch (err) { toast(err.message); }
    });
    thread.append(m);
    scrollDown();
  }
}

function addMsg(role, html) {
  thread.querySelectorAll('.welcome, .suggestions').forEach((n) => n.closest('.msg') || n.remove());
  const m = el(`<div class="msg ${role}">${html}</div>`);
  thread.append(m);
  scrollDown();
  return m;
}

// While a model works: a short note on what's happening instead of bare dots. The
// first notes are the real steps; then a few others, never the same one twice in a row.
const STEP_NOTES = ['Reading your memory…', 'Picking the cards that fit…'];
// With memory off: nothing that sounds like reading memory.
const PLAIN_NOTES = ['Thinking it through…', 'Drafting your answer…', 'Almost there…'];
const MORE_NOTES = ['Weighing confirmed vs guessed…', 'Checking what changed lately…', 'Connecting the dots…', 'Thinking it through…', 'Drafting your answer…', 'Cross-checking the details…', 'Mulling it over…', 'Cerebrating…', 'Almost there…'];
function typing(steps = STEP_NOTES, more = MORE_NOTES) {
  const m = addMsg('assistant typing', '<span class="typing-dots"><span></span><span></span><span></span></span><span class="typing-note"></span>');
  const note = m.querySelector('.typing-note');
  let i = 0, last = '';
  const next = () => {
    if (!m.isConnected) return clearInterval(timer);
    let t = steps[i++];
    if (!t) { do t = more[Math.floor(Math.random() * more.length)]; while (t === last); }
    last = t;
    note.classList.remove('in');
    setTimeout(() => { note.textContent = t; note.classList.add('in'); }, 150);
  };
  next();
  const timer = setInterval(next, 1500);
  return m;
}

let inFlight = 0;
async function send(message, { skipCue = false } = {}) {
  inFlight++;
  try { return await sendInner(message, { skipCue }); } finally { inFlight--; }
}
async function sendInner(message, { skipCue = false } = {}) {
  if (!skipCue) addMsg('user', esc(message));
  const t = chatMode() === 'none' ? typing(['Thinking…'], PLAIN_NOTES) : typing(skipCue ? ['Using your updated card…'] : STEP_NOTES);
  try {
    const res = await api('/api/chat', { message, mode: chatMode(), conversationId, skipCue, demo: demoRunning, ...(demoRunning ? {} : chosenModel()) });
    t.remove();
    rememberChat();
    renderChats();
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
      const conf = used.filter((c) => c.status === 'confirmed').length;
      line = used.length ? `Gave the agent ${count(used.length, 'card')} that fit (${conf} confirmed, ${used.length - conf} ${used.length - conf === 1 ? 'guess' : 'guesses'}) · ~${ctx} tokens <span class="savings">(${pct}% less than full history)</span>` : 'No cards needed for this one';
    } else line = res.mode === 'full' ? `Read the full chat history · ~${ctx.toLocaleString()} tokens` : 'Memory off';
    const u = res.tokens.usage;
    if (u?.prompt_tokens) line += `<div class="tok-row"><span>⬆ ${u.prompt_tokens.toLocaleString()} tokens in</span><span>⬇ ${(u.completion_tokens ?? 0).toLocaleString()} out</span>${res.model ? `<span>${esc(modelName(res.model))}</span>` : ''}</div>`;
    detail.innerHTML = `<div>${line}</div>${res.trace ? `<div class="trace-line">${traceLine(res.trace)}</div>` : ''}`;
    if (used.length) {
      const chips = el('<div class="chips"></div>');
      for (const c of used) {
        // Private cards are used like any other; a lock marks them on your own screen.
        const priv = c.sensitive || c.status === 'pending';
        const chip = el(`<button class="chip ${c.status}" title="Open in Memory">${priv ? `${ico('lock', 'sm')} ` : ''}${esc(c.text)}</button>`);
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
    <div class="face front">
    ${card.imported ? '<span class="tag-imported">Imported</span>' : ''}
    ${why ? `<div class="why">${esc(why)}</div>` : ''}
    <div class="cat">${esc(card.category)}${card.sub ? ` · ${esc(card.sub)}` : ''} · ${card.type === 'lesson' ? 'lesson' : 'preference'}</div>
    ${seasonBadge(card)}${untilBadge(card)}
    <div class="text">${esc(card.text)}</div>
    ${card.changed_from ? `<div class="was">${esc(card.changed_from)}</div>` : ''}
    ${card.note ? `<div class="note">💬 ${esc(card.note)}</div>` : ''}
    ${sources ? `<div class="dates">${esc(dateLine(card))}</div>` : ''}
    ${sources ? `<button class="why-btn" type="button">Learned from your chat ↻</button>` : '<div class="hint">Swipe → still true · ← not anymore</div>'}
    </div>
    ${sources ? `<div class="face back" hidden><div class="back-head">Learned from</div><div class="srcs"></div><button class="flip-back" type="button">↩ Flip back</button></div>` : ''}
  </div>`;
}

// The back of a card: the past chat it was learned from. Swiping still works either side.
function wireFlip(cardEl, id) {
  const front = cardEl.querySelector('.face.front'), back = cardEl.querySelector('.face.back');
  const flip = async (toBack) => {
    if (toBack && !back.querySelector('.srcs').innerHTML) await loadSources(back.querySelector('.srcs'), id);
    cardEl.classList.add('flipping');
    await sleep(160);
    front.hidden = toBack;
    back.hidden = !toBack;
    cardEl.classList.remove('flipping');
  };
  cardEl.querySelector('.why-btn').addEventListener('click', (e) => { e.stopPropagation(); flip(true); });
  cardEl.querySelector('.flip-back').addEventListener('click', (e) => { e.stopPropagation(); flip(false); });
}

// What the loop decided for one answer, in a line (shown under ⓘ).
const QUIET = {
  low_stakes: 'no check: nothing at stake',
  asked_this_chat: 'no check: already asked once in this chat',
  cooldown: 'no check: asked recently',
  recently_asked: 'no check: asked about these this week',
  nothing_to_check: 'no check: no shaky guess shaped it',
  redo: 'redone with your change',
};
function traceLine(t) {
  if (t.mode !== 'cards') return t.mode === 'none' ? 'Memory off: no cards used, asked or learned (this chat’s own messages still count)' : 'Full history, no checks';
  const parts = [`${t.stakes} stakes`];
  parts.push(t.check ? `checked “${esc(t.check)}”` : esc(QUIET[t.quiet] ?? 'no check'));
  if (t.quietYes) parts.push(`you carried on, so “${esc(t.quietYes.text)}” counts as a quiet yes (still a guess)`);
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
  const t = typing(['Rewriting the cards…', 'Saving them to memory…']);
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
  const t = typing(['Rewriting the card…', 'Saving it to memory…']);
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

// The memory chip in the message box: this chat only.
function renderMemChip() {
  const m = chatMode();
  $('#memChip').dataset.mode = data?.memoryOff ? 'off' : m;
  $('#memChipLabel').textContent = data?.memoryOff ? 'Memory off' : MODES.find((x) => x.id === m).chip;
}
$('#memChip').addEventListener('click', (e) => {
  e.stopPropagation();
  if (data.memoryOff) return open('memoryIntro');
  const menu = $('#memMenu');
  if (!menu.hidden) return (menu.hidden = true);
  const m = chatMode();
  menu.innerHTML = MODES.map((x) => `<button role="menuitemradio" aria-checked="${x.id === m}" data-m="${x.id}"><span><b>${esc(x.label)}</b><small>${esc(x.about)}</small></span>${x.id === m ? '✓' : ''}</button>`).join('') +
    `<div class="mm-sep"></div><p class="mm-note">Only this chat. Turn memory off everywhere in Memory.</p>`;
  menu.hidden = false;
});
$('#memMenu').addEventListener('click', (e) => {
  e.stopPropagation();
  const id = e.target.closest('[data-m]')?.dataset.m;
  if (!id) return;
  if (id === 'cards') delete chatModes[conversationId]; else chatModes[conversationId] = id;
  try { localStorage.setItem('dv-chat-modes', JSON.stringify(chatModes)); } catch {}
  $('#memMenu').hidden = true;
  renderMemChip();
  toast({ cards: 'Memory on for this chat.', none: 'Memory off for this chat: nothing used or learned here.', full: 'This chat reads your whole history, to compare.' }[id]);
});
document.addEventListener('click', () => { $('#memMenu').hidden = true; });

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
  pollBuild();
}
function pollBuild() {
  clearInterval(buildPoll);
  buildPoll = setInterval(async () => {
    const job = await fetch('/api/build').then((r) => r.json()).catch(() => null);
    if (!job || job.error === 'Pick a demo or import your memory first.') return;
    showBuild(job);
    if (job.done) { clearInterval(buildPoll); await buildDone(job); }
  }, 700);
}
let building = false;
function showBuild(job) {
  building = !!job.running;
  $('#buildBox').hidden = !job.running;
  $('#buildLabel').textContent = job.label ?? 'Working';
  $('#buildPct').textContent = `${job.pct ?? 0}%`;
  $('#buildFill').style.width = `${job.pct ?? 0}%`;
  $('#redistillBtn').disabled = $('#distillBtn').disabled = !!job.running;
  // The import sheet shows the same progress, big.
  if (job.running || job.done) {
    $('#impPct').textContent = `${job.pct ?? 0}%`;
    $('#impFill').style.width = `${job.pct ?? 0}%`;
    if (job.label && !$('#importProgress').hidden && job.stage !== 'guard') $('#impLabel').textContent = job.label;
  }
}
async function buildDone(job) {
  // From an import: close the progress sheet and land in the new memory.
  const fromImport = $('#importSheet').classList.contains('open') && !$('#importProgress').hidden;
  if (fromImport) close('importSheet');
  if (job.error) {
    if (!data.cards.length) thread.innerHTML = '';
    return addMsg('assistant', `<p>${esc(`I couldn’t finish building your memory: ${job.error}`)}</p>`);
  }
  if (fromImport || (data.profile?.mine && !data.cards.length)) {
    await refresh(await api('/api/state'));
    renderWelcome();
  }
  if (job.report && !job.report.turns) return addMsg('assistant', '<p>No new chats to read since your last rebuild. Your memory is up to date.</p>');
  await refresh(await api('/api/state'));
  renderMemory();
  const r = job.report;
  const toCheck = data.cards.filter((c) => c.checkReason).length;
  const confirmed = data.cards.filter((c) => c.status === 'confirmed').length;
  const notes = [
    r.instructionsSkipped ? `skipped ${r.instructionsSkipped} message${r.instructionsSkipped === 1 ? '' : 's'} that read like instructions to me` : '',
    r.secretsRemoved ? `left out ${r.secretsRemoved} password${r.secretsRemoved === 1 ? '' : 's'} or code${r.secretsRemoved === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  const lead = fromImport ? `Your memory is ready: ${count(data.cards.length, 'card')} from ${count(r.turns, 'message')} of yours, ${toCheck} for you to check. Swipe through them in Memory, then ask me anything.` : `Your memory is rebuilt from ${count(r.turns, 'turn')}: ${count(data.cards.length, 'card')}, ${confirmed ? `${confirmed} you confirmed kept as they are, ` : ''}${toCheck} for you to check.`;
  const m = addMsg('assistant', `<p>${esc(lead)}${notes.length ? ` ${esc(`I ${notes.join(' and ')}.`)}` : ''}</p>
    <div class="inline-actions"><button class="ilink open-mem">Open Memory</button></div>`);
  m.querySelector('.open-mem').addEventListener('click', () => { renderMemory(); open('memory'); });
}
$('#distillBtn').addEventListener('click', askRebuild);
$('#redistillBtn').addEventListener('click', askRebuild);

const subsOf = (cards) => [...new Set(cards.map((c) => c.sub).filter(Boolean))];

function groups() {
  const g = {};
  for (const c of data.cards) (g[c.category] ??= []).push(c);
  // Biggest topics first; "other" always last.
  return Object.entries(g).sort((a, b) => (a[0] === 'other') - (b[0] === 'other') || b[1].length - a[1].length);
}
let topicFilter = 'all';

function renderMemory() {
  const empty = !data.cards.length;
  $('#memoryEmpty').classList.toggle('hidden', !empty);
  $('#memoryLinks').classList.toggle('hidden', empty);
  $('#topicHead').hidden = empty;
  const n = { check: 0, confirmed: 0, guess: 0 };
  for (const c of data.cards) n[bucketOf(c)]++;
  const toCheck = n.check;
  const locked = data.cards.filter((c) => c.checkReason && c.status === 'pending').length;
  const recheck = data.cards.filter((c) => c.checkReason && c.status === 'confirmed').length;
  const pct = empty ? 0 : Math.round((n.confirmed / data.cards.length) * 100);
  // When memory started (the earliest thing a card was learned from) and when you last approved a card.
  const starts = data.cards.map((c) => c.first_seen ?? c.created).filter(Boolean).sort();
  const verified = data.cards.map((c) => c.last_confirmed).filter(Boolean).sort();
  const day = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  $('#memDates').innerHTML = '';
  $('#memStamp').textContent = empty ? '' : stampLine(data.cards, data.updatedAt);
  // The overview: how much of memory you've confirmed, and one button to check the rest.
  $('#memorySummary').innerHTML = empty ? '' : `<div class="mem-hero">
      <div class="ring" style="--p:${pct}" role="img" aria-label="${pct}% confirmed by you"><div><b>${pct}%</b><span>confirmed</span></div></div>
      <div class="hero-text">
        <h2>${toCheck ? `${count(toCheck, 'card')} to check` : 'All caught up'}</h2>
        <p class="hero-stats"><span><b>${data.cards.length}</b> ${data.cards.length === 1 ? 'card' : 'cards'} in all:</span><span><b>${n.check}</b> to check</span><span><b>${n.confirmed}</b> confirmed</span><span><b>${n.guess}</b> ${n.guess === 1 ? 'guess' : 'guesses'} that look right</span></p>
        ${locked || recheck ? `<p class="fine hero-note">Each card is counted once. The ${toCheck} to check: ${[locked ? `${locked} private, not checked yet` : '', recheck ? `${recheck} you confirmed before that may have changed` : '', toCheck - locked - recheck ? `${toCheck - locked - recheck} ${toCheck - locked - recheck === 1 ? 'guess' : 'guesses'}` : ''].filter(Boolean).join(' · ')}.</p>` : ''}
        <p class="mem-dates"><span>Since <b>${starts.length ? day(starts[0]) : '—'}</b></span></p>
        ${toCheck ? `<button class="primary review-btn" id="reviewBtn">Review now<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>` : ''}
      </div>
    </div>`;
  $('#reviewBtn')?.addEventListener('click', openReview);
  renderLearned();
  $('#memCredit').textContent = empty || !data.models ? '' : `Cards written by ${modelName(data.models.bg)}${data.models.grader ? `, graded by ${modelName(data.models.grader)}` : ''}. Answers by ${modelName(data.models.main)}. Voice by ${modelName(data.models.voice ?? 'muse-voice-transcribe-1.0')}.`;
  $$('#topicSeg button').forEach((b) => b.classList.toggle('on', b.dataset.f === topicFilter));
  const grid = $('#catGrid');
  grid.innerHTML = '';
  for (const [cat, cards] of groups()) {
    const check = cards.filter((c) => c.checkReason).length;
    if (topicFilter === 'check' && !check) continue;
    const ok = cards.filter((c) => bucketOf(c) === 'confirmed').length;
    // A peek at what's inside, never a private card's text.
    const shown = cards.filter((c) => !c.sensitive && c.status !== 'pending')
      .sort((a, b) => (b.checkReason ? 1 : 0) - (a.checkReason ? 1 : 0) || (b.status === 'confirmed') - (a.status === 'confirmed')).slice(0, 2);
    const hidden = cards.length - cards.filter((c) => !c.sensitive && c.status !== 'pending').length;
    const peek = shown.map((c) => `<li class="${c.status === 'confirmed' ? 'ok' : 'guess'}">${esc(c.text)}${c.until ? ` <span class="ct-short" title="Short-term">${ico('hourglass', 'sm')}</span>` : ''}</li>`).join('') +
      (!shown.length && hidden ? `<li class="lock">Private. Only shown when you open it.</li>` : '');
    const tile = el(`<button class="cat-tile" aria-label="${esc(catLabel(cat))}: ${count(cards.length, 'card')}${check ? `, ${check} to check` : ''}">
      <span class="ct-top"><span class="cat-icon">${catIcon(cat)}</span>
        <span class="ct-name"><b>${esc(catLabel(cat))}</b><span class="fine">${count(cards.length, 'card')} · ${ok} confirmed</span><span class="fine ct-stamp">${esc(stampLine(cards, data.topicUpdated?.[cat]))}</span></span>
        ${check ? `<span class="ct-pill">${check} to check</span>` : `<span class="ct-pill done" title="All confirmed or fine">✓</span>`}</span>
      <span class="ct-bar" aria-hidden="true"><i style="width:${Math.round((ok / cards.length) * 100)}%"></i></span>
      ${peek ? `<ul class="ct-peek">${peek}</ul>` : ''}
      ${subsOf(cards).length ? `<span class="fine subs">${subsOf(cards).map(esc).join(' · ')}</span>` : ''}</button>`);
    tile.addEventListener('click', () => openCategory(cat));
    grid.append(tile);
  }
  if (!grid.children.length && !empty) grid.append(el(`<p class="fine all-done">Nothing to check. Every topic is up to date.</p>`));
}
$$('#topicSeg button').forEach((b) => b.addEventListener('click', () => { topicFilter = b.dataset.f; renderMemory(); }));

// "Updated Nov 2 · Confirmed Oct 27": when these cards last changed, and were last confirmed.
function stampLine(cards, extra) {
  const latest = (xs) => xs.filter(Boolean).sort().at(-1);
  const updated = latest([extra, ...cards.map((c) => c.updated ?? c.created)]);
  const confirmed = latest(cards.map((c) => c.last_confirmed));
  return `Updated ${updated ? fmtDay(updated) : '—'} · Confirmed ${confirmed ? fmtDay(confirmed) : 'not yet'}`;
}

// Every card that needs a look, across topics, in one deck: changed first, then private ones.
const REVIEW_ORDER = { changed: 0, sensitive: 1, guessed: 2, stale: 3, old: 4 };
function openReview() {
  const cards = data.cards.filter((c) => c.checkReason).sort((a, b) => (REVIEW_ORDER[a.checkReason] ?? 9) - (REVIEW_ORDER[b.checkReason] ?? 9));
  deck = { cat: null, review: true, sub: null, ids: cards.map((c) => c.id), i: 0, removed: [] };
  $('#catSubs').innerHTML = '';
  $('#catIcon').innerHTML = catIcon('review');
  $('#catName').textContent = 'To check';
  $('#catStamp').textContent = stampLine(cards);
  setSeg('deck');
  open('category');
  renderDeck();
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
  $('#catStamp').textContent = stampLine(all, data.topicUpdated?.[cat]);
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
    const done = el(`<div class="deck-done"><p>${deck.review ? 'All caught up. Everything you checked is saved.' : `That’s everything I know about your ${esc(deck.cat)}.`}</p><button class="ghost" type="button">See as list</button></div>`);
    done.querySelector('button').addEventListener('click', () => setSeg('list'));
    // One question at the end, not one per swipe.
    if (deck.removed.length) {
      const n = deck.removed.length;
      const box = el(`<div class="after-no"><p>You removed ${n} ${deck.review ? '' : `${esc(deck.cat)} `}card${n > 1 ? 's' : ''}. Want to tell ${esc(data.agent.name)} what changed?</p>
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
  wireFlip(top, card.id);
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
  const cards = deck.review
    ? deck.ids.map((id) => data.cards.find((c) => c.id === id)).filter((c) => c?.checkReason)
    : data.cards.filter((c) => c.category === deck.cat && (!deck.sub || c.sub === deck.sub));
  const max = data.budget.limits.maxCardsPerCategory;
  const tokens = data.budget.categories[deck.cat]?.tokens ?? 0;
  const sec = deck.review
    ? el(`<section class="category"><header><h2>To check</h2><span class="budget">${cards.length} left</span></header></section>`)
    : el(`<section class="category"><header><h2>${esc(catLabel(deck.cat))}</h2><span class="budget">${cards.length}/${count(max, 'card')} · ~${tokens} tokens</span></header><div class="meter"><i style="width:${Math.min(100, (cards.length / max) * 100)}%"></i></div></section>`);
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
  const row = el(`<div class="ccard" data-card="${esc(c.id)}"><div class="top"><div>${c.imported ? '<span class="tag-imported">Imported</span>' : ''}<div class="txt">${esc(c.text)}</div>
    <div class="kind">${c.type === 'lesson' ? 'Lesson' : 'Preference'} · ${c.sources.length ? `from ${count(c.sources.length, 'message')}` : 'you told me'}${c.changed_from ? ` · was “${esc(c.changed_from)}”` : ''}</div>
    ${c.note ? `<div class="kind">💬 ${esc(c.note)}</div>` : ''}
    <div class="kind">${esc(dateLine(c))}</div>${seasonBadge(c)}${untilBadge(c)}</div>
    <span class="badge ${c.status}">${STATUS_LABEL[c.status]}</span></div>
    <div class="actions"><button data-a="why">Learned from</button>${c.status !== 'confirmed' ? '<button data-a="confirm">✓ Confirm</button>' : ''}<button data-a="edit">Edit</button><button data-a="reject">Remove</button></div></div>`);
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
  const cards = data.cards;
  const n = { check: 0, confirmed: 0, guess: 0 };
  for (const c of cards) n[bucketOf(c)]++;
  const pct = cards.length ? Math.round((n.confirmed / cards.length) * 100) : 0;
  const full = data.fullHistoryTokens || 1;
  const saved = Math.max(0, Math.round((1 - data.budget.totalTokens / full) * 100));
  const shortTerm = cards.filter((c) => c.untilState && !c.untilState.ended).length;
  const t = data.trace;
  const kpi = (icon, value, label, viz = '') => `<div class="kpi"><div class="kpi-top"><span class="kpi-icon">${icon}</span>${viz}</div><div class="kpi-n">${value}</div><div class="kpi-l">${label}</div></div>`;
  $('#stats').innerHTML =
    kpi(ico('check'), `${pct}%`, `confirmed by you · ${n.confirmed} of ${cards.length}`, `<span class="mini-ring" style="--p:${pct}"></span>`) +
    kpi(ico('bolt'), `${saved}%`, `smaller than your full history`, `<span class="mini-bars"><i style="height:100%"></i><i class="emph" style="height:${Math.max(6, 100 - saved)}%"></i></span>`) +
    kpi(ico('chat'), t?.answers ? `${t.checksAsked}<small>/${t.answers}</small>` : '0', 'answers that asked a quick check') +
    kpi(ico('hourglass'), shortTerm, `short-term ${shortTerm === 1 ? 'card' : 'cards'} with an end date`);
  renderTopics();
  renderTrace();
  renderGate();
  renderEval();
  renderSession();
}

// Every topic as one stacked bar: confirmed, guesses, to check. Tap one to open it.
function renderTopics() {
  const box = $('#topicBox');
  const rows = groups().map(([cat, cs]) => {
    const k = { confirmed: 0, guess: 0, check: 0 };
    for (const c of cs) k[bucketOf(c)]++;
    return { cat, total: cs.length, ...k };
  });
  if (!rows.length) { box.hidden = true; return; }
  box.hidden = false;
  const max = Math.max(...rows.map((r) => r.total));
  box.innerHTML = `<h3>Memory by topic</h3>
    <div class="legend-row"><span><i class="sw ok"></i>Confirmed</span><span><i class="sw guess"></i>Guess</span><span><i class="sw check"></i>To check</span></div>
    ${rows.map((r) => `<button class="stack-row" data-cat="${esc(r.cat)}" data-tip="${esc(catLabel(r.cat))}: ${r.confirmed} confirmed, ${r.guess} ${r.guess === 1 ? 'guess' : 'guesses'}, ${r.check} to check">
      <span class="stack-label">${catIcon(r.cat)}${esc(catLabel(r.cat))}</span>
      <span class="stack" style="width:${(r.total / max) * 100}%">${['confirmed', 'guess', 'check'].map((k) => r[k] ? `<i class="${k}" style="flex:${r[k]}"></i>` : '').join('')}</span>
      <span class="stack-n">${r.total}</span></button>`).join('')}`;
  box.querySelectorAll('.stack-row').forEach((b) => b.addEventListener('click', () => { open('memory'); openCategory(b.dataset.cat); }));
  wireTips(box);
}

// What the loop decided across answers: one bar, asked vs each reason it stayed quiet.
function renderTrace() {
  const box = $('#traceBox');
  const t = data.trace;
  if (!t?.answers) { box.hidden = true; return; }
  const quiet = Object.entries(t.quiet ?? {}).filter(([k]) => k !== 'redo');
  const parts = [['Asked a quick check', t.checksAsked, 'ask'], ...quiet.map(([k, v], i) => [cap((QUIET[k] ?? k).replace(/^no check: /, '')), v, `q${i % 4}`])].filter(([, v]) => v);
  const total = parts.reduce((a, [, v]) => a + v, 0) || 1;
  box.hidden = false;
  // The north star: answers that needed no correction. A redo is the fix for an earlier
  // answer, so it isn't counted as an answer of its own.
  const answered = t.answers - (t.quiet?.redo ?? 0);
  const corrected = t.checksCorrected ?? 0;
  const confirmed = (t.checksConfirmed ?? 0) + (t.quietYes ?? 0);
  const pct = (n) => `${Math.round((n / (answered || 1)) * 100)}%`;
  box.innerHTML = `<h3>Answers that needed no correction</h3>
    <div class="north"><b>${pct(answered - corrected)}</b><span>${answered - corrected} of ${count(answered, 'answer')} were right as they were</span></div>
    <ul class="split-legend">
      <li><i class="sw ok"></i>No check needed<b>${answered - t.checksAsked}</b></li>
      <li><i class="sw ask"></i>Checked, and you went with it (✓ or carried on)<b>${confirmed}</b></li>
      <li><i class="sw fix"></i>Checked, and you corrected it (✕)<b>${corrected}</b></li>
      ${t.checksAsked - confirmed - corrected > 0 ? `<li><i class="sw q2"></i>Checked, no answer yet<b>${t.checksAsked - confirmed - corrected}</b></li>` : ''}
    </ul>
    <h3 class="trace-h">When it asked, and when it stayed quiet</h3>
    <div class="split">${parts.map(([l, v, k]) => `<i class="${k}" style="flex:${v}" data-tip="${esc(l)}: ${v}"></i>`).join('')}</div>
    <ul class="split-legend">${parts.map(([l, v, k]) => `<li><i class="sw ${k}"></i>${esc(l)}<b>${Math.round((v / total) * 100)}%</b></li>`).join('')}</ul>
    <div class="chips-row"><span class="chip-stat">${t.answers} answers</span><span class="chip-stat">${t.drafts} picks from memory</span><span class="chip-stat">${t.quietYes} quiet yeses</span></div>`;
  wireTips(box);
}

// What the memory agent did: proposed → kept, and why the rest was dropped.
const REASONS = { too_long: 'too long', about_agent: 'about me, not you', trait: 'a label, not a preference', no_user_source: 'not in your words', unsupported: 'not backed by the chat', one_off: 'a one-off', duplicate: 'already known', empty: 'empty' };
function renderGate() {
  const box = $('#gateBox');
  const r = data.review;
  if (!r?.proposed) { box.hidden = true; return; }
  const totals = {};
  for (const [k, v] of Object.entries({ ...r.byRules }).concat(Object.entries(r.byGrader))) totals[k] = (totals[k] ?? 0) + v;
  box.hidden = false;
  box.innerHTML = `<h3>Cards proposed vs kept</h3>
    <p class="fine">${esc(modelName(data.models.bg))} writes · ${data.models.grader ? esc(modelName(data.models.grader)) : 'code rules'} checks</p>
    ${barChart('', '', [{ label: 'Proposed', value: r.proposed }, { label: 'Kept', value: r.kept, emph: true }, ...Object.entries(totals).map(([k, v]) => ({ label: `Dropped: ${REASONS[k] ?? k}`, value: v }))], (v) => String(v), r.proposed)}`;
  wireTips(box);
}

// This session: memory sent per answer vs the full history.
function renderSession() {
  const box = $('#sessionLog');
  const turns = sessionLog.filter((l) => l.mode === 'cards');
  if (!turns.length) { box.hidden = true; return; }
  const avg = Math.round(turns.reduce((a, l) => a + l.tokens, 0) / turns.length);
  box.hidden = false;
  box.innerHTML = `<h3>This session</h3>${barChart('', '', [{ label: 'Full history', value: data.fullHistoryTokens }, { label: 'Your cards (avg)', value: avg, emph: true }], (v) => `${v.toLocaleString()} tok`)}`;
  wireTips(box);
}

// ---------------- eval charts ----------------
const MODE_NAMES = { confirmed: 'Déjà Vu memory', inferred: 'Guessed cards', summary: 'Memory summary', full: 'Full history', none: 'No memory' };
const MODE_ORDER = ['confirmed', 'inferred', 'summary', 'full', 'none'];

async function renderEval() {
  const box = $('#evalBox');
  const ev = await api('/api/eval').catch(() => ({ available: false }));
  if (!ev.available) {
    box.innerHTML = `<div class="card-box"><h3>Eval</h3><p class="fine">No results yet. Run <code>npm run eval</code>.</p></div>`;
    return;
  }
  if (ev.combined) return renderCombinedEval(box, ev);
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

// The eval across every person (data/eval-summary.json): pooled over all checks.
const modelName = (id = '') => id.split('/').pop().replace(/-(\d)/, ' $1').split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
function renderCombinedEval(box, ev) {
  const rows = MODE_ORDER.map((m) => ev.combined.find((s) => s.mode === m)).filter(Boolean);
  const when = new Date(ev.generated).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  const conf = rows.find((r) => r.mode === 'confirmed');
  // Honest about where confirmed cards did not win.
  const lost = ev.perPerson.filter((p) => { const s = (m) => p.summary.find((x) => x.mode === m)?.accuracy ?? 0; return Math.max(s('summary'), s('full')) > s('confirmed'); });
  box.innerHTML = `
    <div class="card-box viz">
      <div class="viz-head"><h3>Eval: ${ev.people} people, ${ev.questions} questions, ${ev.checks} checks</h3></div>
      <p class="fine">${when} · memory built by the staged build: ${esc(modelName(ev.models.memory))} writes, ${esc(modelName(ev.models.grader ?? ''))} grades · answers ${esc(modelName(ev.models.answers))} · judge ${esc(modelName(ev.models.judge))}</p>
      ${barChart('Answer accuracy', 'Share of checklist items each setup got right, all people', rows.map((r) => ({ label: MODE_NAMES[r.mode], value: r.accuracy, emph: r.mode === 'confirmed' })), (v) => `${v}%`, 100)}
      ${rows.some((r) => r.accuracyDrifted != null) ? barChart('Preferences that changed outside chat', 'Only a confirmation can catch these', rows.map((r) => ({ label: MODE_NAMES[r.mode], value: r.accuracyDrifted ?? 0, emph: r.mode === 'confirmed' })), (v) => `${v}%`, 100) : ''}
      ${barChart('Memory sent per question', 'Tokens of memory in each prompt (average per person)', rows.map((r) => ({ label: MODE_NAMES[r.mode], value: r.avgContextTokens, emph: r.mode === 'confirmed' })), (v) => `${v.toLocaleString()} tok`)}
      ${ev.heldOut ? (() => { const h = MODE_ORDER.map((m) => ev.heldOut.combined.find((x) => x.mode === m)).filter(Boolean); const all = (m) => ev.all?.combined.find((x) => x.mode === m); return `<h3 class="held-h">${ev.heldOut.people} more synthetic people, ${ev.heldOut.checks} checks</h3><p class="fine">Written after the engine was built. The builder was fixed after reading two of their builds.</p>${ev.all ? `<p class="fine"><b>All ${ev.all.people} people, ${ev.all.checks} checks, each counted once:</b> ${MODE_ORDER.map((m) => all(m) && `${MODE_NAMES[m]} ${all(m).accuracy}%`).filter(Boolean).join(' · ')}. Changed outside chat: ${MODE_ORDER.map((m) => all(m) && `${all(m).accuracyDrifted}%`).filter(Boolean).join(' · ')}.</p>` : ''}${barChart('Answer accuracy', 'These 10 people only', h.map((r) => ({ label: MODE_NAMES[r.mode], value: r.accuracy, emph: r.mode === 'confirmed' })), (v) => `${v}%`, 100)}${barChart('Preferences that changed outside chat', 'These 10 people only', h.map((r) => ({ label: MODE_NAMES[r.mode], value: r.accuracyDrifted ?? 0, emph: r.mode === 'confirmed' })), (v) => `${v}%`, 100)}`; })() : ''}
      ${ev.projection ? lineChart(ev.projection) : ''}
      <details class="table-view"><summary>Each person</summary>
        <table><thead><tr><th>Person</th><th>Checks</th>${rows.map((r) => `<th>${MODE_NAMES[r.mode]}</th>`).join('')}</tr></thead>
        <tbody>${ev.perPerson.map((p) => `<tr><td>${esc(p.label)}</td><td>${p.checks}</td>${rows.map((r) => `<td>${p.summary.find((s) => s.mode === r.mode)?.accuracy ?? '–'}%</td>`).join('')}</tr>`).join('')}</tbody></table>
      </details>
      <p class="fine eval-note">A check is one thing an answer should get right, like “suggests an Airbnb” or “keeps it mild for Maya”. <a href="https://github.com/vamshikanderao2579-dbt/deja-vu-confirmed-memory/blob/main/docs/eval.md" target="_blank" rel="noopener">How it’s measured ↗</a> · <a href="https://github.com/vamshikanderao2579-dbt/deja-vu-confirmed-memory" target="_blank" rel="noopener">Code ↗</a></p>
      <p class="fine eval-note">${lost.length ? `Honest note: for ${lost.map((p) => esc(p.label)).join(' and ')}, another setup scored higher than confirmed cards. ` : ''}Confirmed cards here went through one simulated review; stale errors with confirmed cards: ${conf?.staleErrors ?? '–'}.</p>
    </div>`;
  wireTips(box);
}

function barChart(title, sub, items, fmt, max = Math.max(...items.map((i) => i.value), 1)) {
  return `<figure class="chart">${title ? `<figcaption><b>${title}</b><span>${sub}</span></figcaption>` : ''}
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
      const r = app.getBoundingClientRect(), z = uiZoom();
      tip.style.left = Math.min((e.clientX - r.left) / z + 12, r.width / z - tip.offsetWidth - 8) + 'px';
      tip.style.top = (e.clientY - r.top) / z - 36 + 'px';
    });
    n.addEventListener('pointerleave', () => tip.classList.remove('show'));
  });
}

// ---------------- the guided demo ----------------
// A short tour that drives the real app on its own: a caption says what is about to
// happen and a pointer moves to what it presses, so every jump has a visible cause.
// Each demo person's steps are in data/profiles.json.
// Steps: text (type and send), info (open ⓘ), why (open a card's source), back,
// swipe ('yes' | 'no' on the check line), chat (tell it what changed), redo,
// memory, section (open a topic), swipes ({ cardId: 'yes' | 'no' }, in deck order).
const DEMO_SCRIPT = [
  { say: 'A normal question. Memory is used quietly; nothing is asked.', text: 'find a place for dinner tonight with the family' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let tourBar = null;
// Controls: hide the captions (when presenting and talking over it), pause, narrate
// (the browser's own voice: the Meta API has no text-to-speech model), stop.
const tourPrefs = { hidden: true, voice: true, asked: false };
try { Object.assign(tourPrefs, JSON.parse(localStorage.getItem('dv-tour') || '{}')); } catch {}
let tourPaused = false;
const saveTourPrefs = () => { try { localStorage.setItem('dv-tour', JSON.stringify(tourPrefs)); } catch {} };
function showTour() {
  tourBar?.remove();
  tourPaused = false;
  tourBar = el(`<div class="tour" role="status"><div class="tour-text"><span class="tour-step"></span><p></p></div>
    <div class="tour-actions">
      <button class="tour-btn t-voice" type="button"></button>
      <button class="tour-btn t-eye" type="button"></button>
      <button class="tour-btn t-pause" type="button"></button>
      <button class="tour-btn t-stop" type="button" aria-label="Stop the demo">${ico('stop')}</button>
    </div></div>`);
  document.body.append(tourBar);
  document.body.append(el(`<div class="tour-cursor" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 3l14 8-6 1.6L10 19z"/></svg></div>`));
  const sync = () => {
    tourBar.classList.toggle('mini', tourPrefs.hidden);
    const b = (sel, icon, label) => { const n = tourBar.querySelector(sel); n.innerHTML = ico(icon); n.setAttribute('aria-label', label); n.title = label; };
    b('.t-voice', tourPrefs.voice ? 'sound' : 'mute', tourPrefs.voice ? 'Narration on' : 'Narration off');
    b('.t-eye', tourPrefs.hidden ? 'eye' : 'eye-off', tourPrefs.hidden ? 'Show captions' : 'Hide captions');
    b('.t-pause', tourPaused ? 'resume' : 'pause', tourPaused ? 'Play' : 'Pause');
  };
  tourBar.querySelector('.t-voice').addEventListener('click', () => { tourPrefs.voice = !tourPrefs.voice; if (!tourPrefs.voice) { speechSynthesis?.cancel(); stopClip(); } saveTourPrefs(); sync(); });
  tourBar.querySelector('.t-eye').addEventListener('click', () => { tourPrefs.hidden = !tourPrefs.hidden; saveTourPrefs(); sync(); });
  tourBar.querySelector('.t-pause').addEventListener('click', () => { tourPaused = !tourPaused; if (tourPaused) { speechSynthesis?.pause(); clip?.pause(); } else { speechSynthesis?.resume(); clip?.play().catch(() => {}); } sync(); });
  tourBar.querySelector('.t-stop').addEventListener('click', stopTour);
  sync();
}
function stopTour() {
  demoRunning = false; tourPaused = false;
  document.body.classList.remove('touring');
  try { speechSynthesis.cancel(); } catch {}
  stopClip();
  tourBar?.remove(); tourBar = null;
  document.querySelectorAll('.tour-cursor, .tour-ripple').forEach((n) => n.remove());
  // Leave everything matching what the tour did: fresh counts, no tutorial popping up after.
  markSeen('dv-tour-land', 'dv-tour-app');
  refresh().then(() => { renderDrawer(); if ($('#memory').classList.contains('open')) renderMemory(); }).catch(() => {});
}
const whilePaused = async () => { while (tourPaused && demoRunning) await sleep(250); };
// A warm, conversational female English voice: the natural (neural) voices first, then
// premium ones, then the best of the rest.
function bestVoice() {
  const voices = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  const rank = (v) => [/(aria|jenny|ava|emma|michelle).*natural/i, /natural/i, /(ava|zoe|allison|nicky|serena).*(premium|enhanced)/i, /premium|enhanced/i, /google us english/i, /google uk english female/i, /samantha|karen|moira|tessa/i, /en-us/i].findIndex((re) => re.test(`${v.name} ${v.lang}`));
  return voices.map((v) => [v, rank(v)]).filter(([, r]) => r >= 0).sort((a, b) => a[1] - b[1])[0]?.[0] ?? voices[0] ?? null;
}
try { speechSynthesis.getVoices(); } catch {}
// Recorded clips (scripts/make-narration.js): the same voice on every computer.
// A caption without a clip falls back to the browser's own voice.
let clips = {};
fetch('narration/index.json').then((r) => (r.ok ? r.json() : {})).then((x) => { clips = x; }).catch(() => {});
let clip = null;
let clipDone = () => {};
function playClip(file) {
  return new Promise((resolve) => {
    stopClip();
    clipDone = resolve;
    clip = new Audio(`narration/${file}`);
    clip.onended = () => resolve(true);
    clip.onerror = () => resolve(false);
    clip.onloadedmetadata = () => setTimeout(() => resolve(true), (clip?.duration ?? 20) * 1000 + 3000); // if it stalls
    clip.play().catch(() => resolve(false));
  });
}
// Stopping resolves the wait as done, so the tour never falls back to a second voice.
const stopClip = () => { clip?.pause(); clip = null; clipDone(true); };

// Read a caption aloud; resolves when it's done (or right away when narration is off).
async function narrate(text) {
  if (!tourPrefs.voice) return;
  if (clips[text] && await playClip(clips[text])) return;
  if (!('speechSynthesis' in window)) return;
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/ⓘ/g, 'The info button').replace(/~/g, 'about '));
    const voice = bestVoice();
    if (voice) u.voice = voice;
    u.rate = 0.96;
    u.pitch = 1.05;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
    setTimeout(resolve, 2500 + text.length * 80); // if the browser never says it finished
  });
}

// Before the first play: voice or captions, so sound is never a surprise in a meeting.
// Voice tucks the captions away; captions-only stays silent. The bar can switch either.
function askNarration() {
  if (tourPrefs.asked || !('speechSynthesis' in window)) return Promise.resolve();
  return new Promise((resolve) => {
    const box = el(`<div class="narr-ask" role="dialog" aria-label="How to play the demo"><div class="narr-card">
      <div class="ct-icon">${ico('sound')}</div><h3>Play the demo with voice?</h3>
      <p>A voice explains each step while it plays. Choose captions if you’re somewhere quiet.</p>
      <div class="narr-row"><button class="ghost" data-v="0">Captions only</button><button class="primary" data-v="1">With voice</button></div></div></div>`);
    box.addEventListener('click', (e) => {
      const v = e.target.closest('[data-v]')?.dataset.v;
      if (v == null) return;
      Object.assign(tourPrefs, { asked: true, voice: v === '1', hidden: v === '1' });
      saveTourPrefs();
      box.remove();
      resolve();
    });
    document.body.append(box);
    box.querySelector('.primary').focus();
  });
}

async function playDemo() {
  if (demoRunning) return;
  await askNarration();
  demoRunning = true;
  document.querySelectorAll('.coach-spot, .coach-tip').forEach((n) => n.remove());
  coaching = false;
  closeAll();
  try {
    await refresh(await api('/api/demo/load', {}));
  } catch (err) {
    demoRunning = false;
    return toast(err.message);
  }
  if (data.memoryOff) await refresh(await api('/api/memory/switch', { on: true }));
  learnedSeen = data.learned?.at(-1)?.at ?? '';
  conversationId = `demo-${newId()}`;
  thread.innerHTML = '';
  document.body.classList.add('touring'); // model and memory pickers out of the way
  showTour();
  const input = $('#input');
  const steps = data.profile?.script?.length ? data.profile.script : DEMO_SCRIPT;
  const typeIn = async (text) => { for (const ch of text) { if (!demoRunning) return; input.value += ch; growInput(); await sleep(8); } await sleep(150); };
  const settled = async () => { await sleep(400); while (demoRunning && inFlight > 0) await sleep(300); };
  const until = async (sel, ms = 20000) => { for (let t = 0; t < ms && demoRunning; t += 300) { const n = [...document.querySelectorAll(sel)].at(-1); if (n) return n; await sleep(300); } return null; };
  // The pointer glides to what is about to be pressed, then clicks it.
  const cursor = $('.tour-cursor');
  const press = async (node) => {
    await whilePaused();
    if (!node || !demoRunning) return;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(150);
    const r = node.getBoundingClientRect();
    const z = uiZoom();
    const x = (r.left + Math.min(r.width / 2, 40)) / z, y = (r.top + r.height / 2) / z;
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    await sleep(380);
    const ripple = el(`<span class="tour-ripple" style="left:${x}px;top:${y}px"></span>`);
    document.body.append(ripple);
    setTimeout(() => ripple.remove(), 600);
    node.click();
  };
  // The caption for a step, left up long enough to read.
  const say = async (text, i) => {
    await whilePaused();
    if (!tourBar || !text) return;
    tourBar.querySelector('.tour-step').textContent = `${i + 1} of ${steps.length}`;
    tourBar.querySelector('p').textContent = text;
    await Promise.all([sleep(tourPrefs.hidden && !tourPrefs.voice ? 300 : Math.min(1800, 600 + text.length * 8)), narrate(text)]);
    await whilePaused();
  };
  const lastCard = (sel) => [...document.querySelectorAll(sel)].at(-1);
  // Back to chat the way a person would: the back arrow on each open page.
  const backToChat = async () => {
    for (const id of ['category', 'memory']) if ($(`#${id}`).classList.contains('open')) { await press($(`[data-close="${id}"]`)); await sleep(450); }
    closeAll();
  };

  for (const [i, step] of steps.entries()) {
    if (!demoRunning) break;
    await say(step.say, i);
    if (!demoRunning) break;
    if (step.newChat) { conversationId = newId(); thread.append(el(`<p class="day-sep">${esc(step.newChat)}</p>`)); scrollDown(); }
    if (step.memoryOff) {
      // Start like most agents today: nothing about the person is used.
      await refresh(await api('/api/memory/switch', { on: false }));
      renderMemSwitch();
    }
    if (step.memoryOn) {
      // Turn memory on the way a person would: Memory → switch → the intro → fast-forward.
      await backToChat();
      if (!wide.matches) { await press($('#menuBtn')); await sleep(400); }
      await press(onScreen(['#drawer .drow[data-go="memory"]', '#menuBtn']));
      await sleep(600);
      await press($('#memToggle'));
      await sleep(1100); // time to read the intro
      await press($('#memOnBtn'));
      await press(await until('#ffGo:not([hidden])', 20000));
      conversationId = newId();
      await sleep(500);
    }
    if (step.ending) {
      // A short-term card's end date: show the prompt, then answer it.
      await backToChat();
      endingsShown.clear();
      checkEndings();
      await sleep(600);
      await press(lastCard(`#thread .ending [data-x="${step.ending}"]`));
      await sleep(400);
    }
    if (step.back) await backToChat();
    if (step.text) { await backToChat(); await press(input); await typeIn(step.text); $('#composer').requestSubmit(); await settled(); }
    if (step.info) {
      const btn = lastCard('#thread .meta .info');
      await press(btn);
      if (step.info !== true) {
        // Then open the card it names, and the message it was learned from.
        const chip = [...(btn?.closest('.meta')?.querySelectorAll('.chip') ?? [])].find((c) => c.textContent.toLowerCase().includes(step.info.toLowerCase()));
        await sleep(500);
        await press(chip);
        await sleep(400);
        const row = document.querySelector('#catList .flash, #catList [data-card].flash') ?? [...document.querySelectorAll('#catList [data-card]')].find((r) => r.textContent.toLowerCase().includes(step.info.toLowerCase()));
        await press(row?.querySelector('[data-a=why]'));
        const go = await until('#catList .open-past', 5000);
        await sleep(900);
        await press(go);
        await sleep(1300);
        await press($('#thread .past-head button'));
        await sleep(500);
      }
    }
    if (step.swipe) {
      const actions = lastCard('#thread .cue.check .cue-actions');
      await press(actions?.querySelector(step.swipe === 'no' ? '.no' : '.yes'));
      await settled();
    }
    if (step.chat) {
      await press(await until('#thread .inline-actions .chat, .after-no .chat'));
      await sleep(200);
      if (Array.isArray(step.chat)) {
        // One line per removed card: finish each "→ now …".
        const parts = input.value.split('→ now ');
        input.value = parts[0];
        for (const [k, rest] of parts.slice(1).entries()) { input.value += '→ now '; await typeIn(step.chat[k] ?? ''); input.value += rest.replace(/^\s*/, rest.includes('\n') ? '\n' : '').replace(/^\n+/, '\n'); }
        input.value = input.value.trimEnd();
      } else await typeIn(step.chat);
      const said = document.querySelectorAll('#thread .msg.assistant').length;
      $('#composer').requestSubmit();
      for (let t = 0; t < 20000 && demoRunning && document.querySelectorAll('#thread .msg.assistant:not(.typing)').length <= said; t += 300) await sleep(300);
      await sleep(300);
    }
    if (step.yourTurn) {
      // The one real tap: point at the button, wait for the viewer; tap it for them if they don't.
      const actions = lastCard('#thread .cue.check .cue-actions');
      const btn = actions?.querySelector(step.yourTurn === 'no' ? '.no' : '.yes');
      if (btn) {
        btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
        btn.classList.add('tour-tap');
        for (let t = 0; t < 9000 && demoRunning && actions.isConnected; t += 200) await sleep(200);
        btn.classList.remove('tour-tap');
        if (actions.isConnected) await press(btn);
      }
      await settled();
    }
    if (step.choose) {
      // Say what changed in one tap: a chip (the recorded answer), or type your own.
      await until('#thread .inline-actions .chat');
      const box = el(`<div class="tour-choices">${step.choose.map((c, k) => `<button type="button" data-k="${k}">${esc(c)}</button>`).join('')}<button type="button" data-k="own" class="own">Type my own…</button></div>`);
      thread.append(box);
      scrollDown();
      let picked = null;
      box.addEventListener('click', (e) => { const k = e.target.closest('button')?.dataset.k; if (k != null) picked = k; });
      for (let t = 0; t < 9000 && demoRunning && picked == null; t += 200) await sleep(200);
      if (picked == null) { await press(box.querySelector('[data-k="0"]')); picked = '0'; }
      box.remove();
      await press(await until('#thread .inline-actions .chat'));
      const said = document.querySelectorAll('#thread .msg.assistant').length;
      if (picked === 'own') {
        tourBar.querySelector('p').textContent = 'Finish the sentence and press Enter.';
        input.focus();
        for (let t = 0; t < 120000 && demoRunning && document.querySelectorAll('#thread .msg.assistant:not(.typing)').length <= said; t += 300) await sleep(300);
      } else {
        await typeIn(step.choose[Number(picked)]);
        $('#composer').requestSubmit();
        for (let t = 0; t < 20000 && demoRunning && document.querySelectorAll('#thread .msg.assistant:not(.typing)').length <= said; t += 300) await sleep(300);
      }
      await sleep(300);
    }
    if (step.redo) {
      await press(await until('#thread .inline-actions .redo'));
      await settled();
      // The new pick, marked: what's new and what's gone.
      const pick = lastCard('#thread .pick');
      pick?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      pick?.classList.add('tour-glow');
      setTimeout(() => pick?.classList.remove('tour-glow'), 4000);
    }
    if (step.glance) { await backToChat(); if (!wide.matches) { open('drawer'); await sleep(300); } await press(onScreen(['#drawer .drow[data-go="memory"]', '#menuBtn'])); if (!$('#memory').classList.contains('open')) open('memory'); await sleep(1800); }
    if (step.memory) { closeAll(); open('drawer'); await sleep(350); await press($('#drawer [data-go="memory"]')); if (!$('#memory').classList.contains('open')) open('memory'); }
    if (step.section) {
      const tile = [...document.querySelectorAll('#catGrid .cat-tile')].find((t) => t.getAttribute('aria-label').toLowerCase().startsWith(step.section.toLowerCase()));
      await press(tile);
    }
    if (step.swipes) {
      await sleep(300);
      for (let k = 0; k < 8 && demoRunning; k++) {
        const card = currentCard();
        if (!card) break;
        const act = step.swipes[card.id] === 'no' ? 'reject' : 'confirm';
        await sleep(400); // time to read the card
        const at = deck.i;
        await press($(`#deckButtons [data-act="${act}"]`));
        for (let t = 0; t < 10000 && demoRunning && deck.i === at; t += 200) await sleep(200);
        await sleep(200);
      }
    }
    await sleep(450); // a moment on the result before the next caption
  }
  await sleep(600);
  const finished = demoRunning;
  stopTour();
  if (finished) showDemoEnd();
}
$('#playDemoBtn').addEventListener('click', playDemo);

// After the tour: a clear next step, and a clean chat to start from.
function showDemoEnd() {
  const box = el(`<div class="narr-ask demo-end" role="dialog" aria-label="Demo finished"><div class="narr-card">
    <div class="ct-icon">${ico('logo')}</div><h3>That’s Déjà Vu</h3>
    <p>Memory any agent can add: it uses what it learned, checks once when it matters, and you fix it in one tap.</p>
    <div class="end-grid"><button class="primary" data-x="try">Try it yourself</button><button class="ghost" data-x="memory">Open Memory</button><button class="ghost" data-x="numbers">See the numbers</button></div>
    <p class="fine">Answers by Muse Spark 1.3 · cards graded by Muse Wonder 1.0 · voice by Muse Voice Transcribe 1.0</p></div></div>`);
  box.addEventListener('click', (e) => {
    const x = e.target.closest('[data-x]')?.dataset.x;
    if (!x && e.target !== box) return;
    box.remove();
    newChat();
    if (x === 'memory') open('memory');
    if (x === 'numbers') open('insights');
    if (x === 'try') toast('Tell it something that changed (“I’m vegetarian now”), then ask for a plan.');
  });
  document.body.append(box);
}

// ---------------- profiles ----------------
const PROFILE_COLORS = ['#0082FB', '#E5484D', '#1FA36A', '#B5541C', '#6250D6', '#0F7B8A'];
function applyProfileChrome() {
  $('#profileInitial').textContent = (data.profile?.name ?? '?')[0];
  renderMemSwitch();
}

// ---------------- memory on/off + the fast-forward ----------------
function renderMemSwitch() {
  const on = !data.memoryOff;
  $('#memToggle').setAttribute('aria-checked', String(on));
  $('#memSwitchSub').textContent = on ? 'On: I remember what matters to you.' : 'Off: I don’t remember anything.';
  renderMemChip();
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
  const res = await api('/api/memory/switch', { on: true });
  await refresh(res);
  renderMemSwitch();
  closeAll();
  // The guided demo shows memory being built; otherwise it picks up where it left off.
  if (demoRunning || !res.resume) return fastForward();
  const r = res.resume;
  toast(`Memory is back on: kept your ${count(r.kept, 'card')}${r.updatedAt ? `, last updated ${fmtDay(r.updatedAt)}` : ''}.${r.newChats ? ` Reading only the ${count(r.newChats, 'newer chat')}.` : ''}`);
  if (r.newChats) pollBuild();
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
    await sleep(demoRunning ? 450 : 900);
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
// Dark by default; Light or System when picked. Kept in this browser only.
function currentTheme() {
  return document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function setTheme(t) {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try { localStorage.setItem('dv-theme', t); } catch {}
  $$('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.t === (document.documentElement.dataset.theme ?? 'system')));
}
$('#themeBtn').addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
$$('#themeSeg button').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.t)));
$$('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.t === (document.documentElement.dataset.theme ?? 'system')));

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
  $('#sessionGroup').hidden = !data.publicDemo;
  $('#aboutLine').textContent = data.profile?.mine
    ? 'Déjà Vu · prototype for the Meta Global AI Developer Hackathon. Your imported chats stay in this session only.'
    : 'Déjà Vu · prototype for the Meta Global AI Developer Hackathon. Demo chat history is made up.';
}
// Tap twice, in the app: a browser dialog can be blocked (embedded or automated
// browsers), which made the button look broken.
let endArmed = null;
$('#endSessionBtn').addEventListener('click', async () => {
  const btn = $('#endSessionBtn');
  const sub = btn.querySelector('.fine');
  if (!endArmed) {
    sub.textContent = 'Tap again to delete your upload, cards and chats';
    btn.classList.add('armed');
    endArmed = setTimeout(() => { endArmed = null; sub.textContent = 'Deletes your upload and cards'; btn.classList.remove('armed'); }, 5000);
    return;
  }
  clearTimeout(endArmed);
  sub.textContent = 'Ending…';
  try { await api('/api/session/end', {}); } catch (err) { endArmed = null; btn.classList.remove('armed'); sub.textContent = 'Deletes your upload and cards'; return toast(`Couldn’t end the session: ${err.message}`); }
  try { Object.keys(localStorage).filter((k) => k.startsWith('dv-chat')).forEach((k) => localStorage.removeItem(k)); sessionStorage.setItem('dv-ended', '1'); } catch {}
  location.reload();
});
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

// ---------------- select user: the first page ----------------
// No accounts: a visitor picks a demo person, their own imported memory, or "New user"
// (import your chats). Each browser's choice and memory are its own (a session cookie).
const NEW_USER = '__new';
function showLanding(choice, { canGoBack = false } = {}) {
  closeAll();
  app.classList.add('landing-on');
  $('#landing').hidden = false;
  $('#landing').scrollTop = 0;
  $('#landBack').hidden = !canGoBack;
  importMaxMb = choice.importMaxMb ?? 30;
  const opt = (p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.demo ? ' (demo)' : ''}</option>`;
  const mine = choice.profiles.filter((p) => !p.demo && !p.real);
  const real = choice.profiles.filter((p) => p.real);
  const demos = choice.profiles.filter((p) => p.demo);
  const sel = $('#userSelect');
  // Bring your own chats first, then the demo people, then anyone already here.
  sel.innerHTML = `<option value="${NEW_USER}">+ Import my memory (new user)</option>` +
    (mine.length ? `<optgroup label="You">${mine.map(opt).join('')}</optgroup>` : '') +
    `<optgroup label="Demo personas">${demos.map(opt).join('')}</optgroup>` +
    (real.length ? `<optgroup label="On this computer">${real.map(opt).join('')}</optgroup>` : '');
  sel.value = choice.profiles.some((p) => p.id === choice.active) ? choice.active : (mine[0] ?? demos[0] ?? real[0])?.id ?? NEW_USER;
  landingProfiles = choice.profiles;
  describeUser();
  if (!seen('dv-tour-land')) setTimeout(() => coach(LAND_TIPS, 'dv-tour-land'), 600);
}
let landingProfiles = [];
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
function describeUser() {
  const id = $('#userSelect').value;
  const p = landingProfiles.find((x) => x.id === id);
  $('#userAbout').textContent = id === NEW_USER
    ? 'Bring your ChatGPT, Claude or Muse chats. I’ll ask your name, then build your cards (a few minutes).'
    : p?.demo ? `${cap(p.about.replace(/^Synthetic · /, ''))}. Made-up chats and memory, ready to try.` : p?.about ?? '';
  $('#userGo').textContent = id === NEW_USER ? 'Continue: import my chats' : `Continue as ${p?.name ?? 'this user'}`;
}
function hideLanding() {
  $('#landing').hidden = true;
  app.classList.remove('landing-on');
}
$('#userSelect').addEventListener('change', describeUser);
$('#userGo').addEventListener('click', async () => {
  const id = $('#userSelect').value;
  if (id === NEW_USER) return openImport();
  try {
    await enterApp(await api('/api/profile', { id }));
    newChat(); // from the welcome page, always a clean start
    toast(`You’re in as ${data.profile.name}.`);
  } catch (err) { toast(err.message); }
});
// The fastest way in: straight into Alex's guided demo.
$('#landDemo').addEventListener('click', async () => {
  markSeen('dv-tour-app'); // the demo is the tour
  try {
    await enterApp(await api('/api/profile', { id: 'alex' }));
    newChat();
    playDemo();
  } catch (err) { toast(err.message); }
});
$('#landBack').addEventListener('click', hideLanding);
// The avatar at the bottom of the menu: switch person right here, or import as a new
// user; the welcome page is one more option, not the only way.
async function openUserPicker(e) {
  e?.stopPropagation();
  const menu = $('#userMenu');
  if (!menu.hidden) return (menu.hidden = true);
  let choice;
  try { choice = await api('/api/profiles'); } catch (err) { return toast(err.message); }
  const row = (p) => `<button role="menuitemradio" aria-checked="${p.id === data.profile.id}" data-id="${esc(p.id)}"><span class="um-av">${esc(p.name[0])}</span><span><b>${esc(p.name)}</b><small>${p.demo ? 'Demo user' : p.real ? 'On this computer' : 'Your chats'}</small></span>${p.id === data.profile.id ? '<i>✓</i>' : ''}</button>`;
  menu.innerHTML = choice.profiles.map(row).join('') +
    `<div class="mm-sep"></div><button data-id="${NEW_USER}"><span class="um-av">+</span><span><b>New user</b><small>Import my chats</small></span></button>
    <button data-id="__welcome"><span class="um-av"><svg aria-hidden="true"><use href="#i-play"/></svg></span><span><b>Welcome page</b><small>How it works</small></span></button>`;
  menu.hidden = false;
  menu.onclick = async (ev) => {
    ev.stopPropagation();
    const id = ev.target.closest('button')?.dataset.id;
    if (!id) return;
    menu.hidden = true;
    if (id === '__welcome') return showLanding(choice, { canGoBack: true });
    if (id === NEW_USER) return openImport();
    if (id === data.profile.id) return;
    try {
      await enterApp(await api('/api/profile', { id }));
      toast(`You’re in as ${data.profile.name}.`);
    } catch (err) { toast(err.message); }
  };
}
document.addEventListener('click', () => { $('#userMenu').hidden = true; });

// Open the app on a person's memory: their last chat, or a fresh one.
async function enterApp(state) {
  hideLanding();
  demoRunning = false;
  await refresh(state);
  learnedSeen = data.learned?.at(-1)?.at ?? '';
  sessionLog.length = 0;
  applyProfileChrome();
  renderModelChip();
  // Come back to the chat you were in.
  let last = null;
  try { last = localStorage.getItem(chatKey()); } catch {}
  if (last) await openChat(last); else { conversationId = newId(); renderWelcome(); }
  renderChats();
  // A build still running (a reload mid-import): keep showing its progress.
  const job = await api('/api/build').catch(() => null);
  if (job?.running) pollBuild();
  if (!seen('dv-tour-app')) setTimeout(() => coach(APP_TIPS, 'dv-tour-app'), 500);
}

// ---------------- model picker (in the composer) ----------------
// Which Meta model answers in chat, and how hard it thinks. Memory work stays on the
// background model; this only changes the answer. Kept in this browser.
const MODEL_INFO = { 'muse-spark-1.3': 'Fast, everyday answers', 'muse-wonder-1.0': 'Deeper thinking, a bit slower' };
const EFFORTS = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']];
let pick = { model: null, effort: 'low' };
try { pick = { ...pick, ...JSON.parse(localStorage.getItem('dv-model') || '{}') }; } catch {}
function chosenModel() {
  const models = data?.models?.answer ?? [];
  return { model: models.includes(pick.model) ? pick.model : models[0], effort: pick.effort };
}
function renderModelChip() {
  const { model, effort } = chosenModel();
  $('#modelLabel').textContent = model ? `${modelName(model).replace(/^Muse /, '')}${effort !== 'low' ? ` · ${cap(effort)}` : ''}` : '';
  $('#modelChip').hidden = !model;
}
function renderModelMenu() {
  const { model, effort } = chosenModel();
  $('#modelMenu').innerHTML = `${(data.models.answer ?? []).map((m, i) => `<button role="menuitemradio" aria-checked="${m === model}" data-m="${esc(m)}"><span><b>${esc(modelName(m))}</b>${i === 0 ? '<i class="tag">Default</i>' : ''}<small>${esc(MODEL_INFO[m] ?? '')}</small></span>${m === model ? '✓' : ''}</button>`).join('')}
    <div class="mm-sep"></div><div class="mm-effort"><span>Effort</span><div class="seg">${EFFORTS.map(([v, l]) => `<button data-e="${v}" class="${v === effort ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
}
$('#modelChip').addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = $('#modelMenu');
  if (!menu.hidden) return (menu.hidden = true);
  renderModelMenu();
  menu.hidden = false;
});
$('#modelMenu').addEventListener('click', (e) => {
  e.stopPropagation();
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.m) { pick.model = b.dataset.m; $('#modelMenu').hidden = true; }
  if (b.dataset.e) pick.effort = b.dataset.e;
  try { localStorage.setItem('dv-model', JSON.stringify(pick)); } catch {}
  renderModelChip();
  if (!$('#modelMenu').hidden) renderModelMenu();
});
document.addEventListener('click', () => { $('#modelMenu').hidden = true; });

// ---------------- first-visit tutorial ----------------
// A spotlight on the real controls, one at a time: Next, or Skip. Shown once per
// browser (the landing on a first visit, the app on first entry); “Show me around” replays it.
const LAND_TIPS = [
  { at: '#pickCard .select-wrap', icon: 'user', title: 'Pick who to try it as', text: 'Alex and Maria are demo people with months of made-up chats and memory.' },
  { at: '#pickCard .select-wrap', icon: 'upload', title: 'Or bring your own chats', text: 'Choose “+ New user” to import a ChatGPT or Claude export. It’s deleted when your session ends.' },
  { at: '#userGo', icon: 'next', title: 'Then continue', text: 'No sign-in. You land in a normal chat.' },
  { at: '#landSide', icon: 'cards', title: 'What happens inside', text: 'It learns short cards from chats, uses only the ones that fit, and asks once when a guess matters.' },
];
const APP_TIPS = [
  { at: '#thread .play-demo', icon: 'play', title: 'Watch a 1-minute demo', text: 'A recorded conversation plays by itself and shows every part of the app.' },
  { at: ['#drawer .drow[data-go="memory"]', '#menuBtn'], icon: 'memory', title: 'Your memory lives here', text: 'Your cards: every card by topic. Swipe to check them.' },
  { at: '#composer', icon: 'chat', title: 'Or just chat', text: 'Ask for a plan or a booking. ⓘ under an answer shows the cards it used.' },
];
// The first of a tip's targets that is on screen (the docked menu, or the ☰ button).
const onScreen = (sel) => [sel].flat().map((q) => $(q)).find((n) => { const r = n?.getBoundingClientRect(); return r && r.width && r.right > 0 && r.left < innerWidth; });
const seen = (k) => { try { return localStorage.getItem(k) === '1'; } catch { return true; } };
const markSeen = (...ks) => { try { ks.forEach((k) => localStorage.setItem(k, '1')); } catch {} };
let coaching = false;
function coach(all, key) {
  const tips = all.filter((t) => onScreen(t.at));
  if (!tips.length || coaching || demoRunning) return; // never over a running demo
  coaching = true;
  let i = 0;
  const spot = el('<div class="coach-spot" aria-hidden="true"></div>');
  const tip = el('<div class="coach-tip" role="dialog" aria-label="Tutorial"></div>');
  document.body.append(spot, tip);
  const end = (all) => { coaching = false; spot.remove(); tip.remove(); removeEventListener('resize', place); all ? markSeen('dv-tour-land', 'dv-tour-app') : markSeen(key); };
  function place() {
    const target = onScreen(tips[i].at);
    if (!target) return;
    const r = target.getBoundingClientRect(), pad = 8, z = uiZoom();
    Object.assign(spot.style, { left: `${(r.left - pad) / z}px`, top: `${(r.top - pad) / z}px`, width: `${(r.width + pad * 2) / z}px`, height: `${(r.height + pad * 2) / z}px` });
    // Below, above, then beside the target: never on top of what it points at.
    const h = tip.offsetHeight * z, w = tip.offsetWidth * z, gap = pad + 14;
    const clampX = (x) => Math.min(Math.max(16, x), innerWidth - w - 16);
    const clampY = (y) => Math.min(Math.max(16, y), innerHeight - h - 16);
    let top, left;
    if (r.bottom + gap + h < innerHeight) { top = r.bottom + gap; left = clampX(r.left); }
    else if (r.top - gap - h > 0) { top = r.top - gap - h; left = clampX(r.left); }
    else if (r.left - gap - w > 0) { left = r.left - gap - w; top = clampY(r.top); }
    else if (r.right + gap + w < innerWidth) { left = r.right + gap; top = clampY(r.top); }
    else { left = clampX(r.left); top = innerHeight - h - 16; }
    tip.style.top = `${top / z}px`;
    tip.style.left = `${left / z}px`;
  }
  function render() {
    const t = tips[i], last = i === tips.length - 1;
    tip.innerHTML = `<div class="ct-icon">${ico(t.icon)}</div><h3>${esc(t.title)}</h3><p>${esc(t.text)}</p>
      <div class="ct-row"><span class="ct-dots">${tips.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span>
      <button class="ct-skip" type="button">Skip tutorial</button><button class="primary ct-next" type="button">${last ? 'Got it' : 'Next'}</button></div>`;
    tip.querySelector('.ct-skip').addEventListener('click', () => end(true));
    tip.querySelector('.ct-next').addEventListener('click', () => { if (last) return end(false); i++; render(); });
    onScreen(t.at)?.scrollIntoView({ block: 'nearest' });
    requestAnimationFrame(place);
    tip.querySelector('.ct-next').focus({ preventScroll: true });
  }
  addEventListener('resize', place);
  render();
}
$('#landTour').addEventListener('click', () => { try { localStorage.removeItem('dv-tour-app'); } catch {} coach(LAND_TIPS, 'dv-tour-land'); });

// ---------------- import your memory ----------------
let importFile = null;
function openImport() {
  $('#importForm').hidden = false;
  $('#importProgress').hidden = true;
  $('#importError').hidden = true;
  syncImportGo();
  open('importSheet');
  setTimeout(() => $('#importName').focus(), 350);
}
function pickFile(f) {
  importFile = f ?? null;
  $('#importFileName').textContent = f ? f.name : 'Choose a file';
  $('#importDrop').classList.toggle('has', !!f);
  syncImportGo();
  $('#importError').hidden = true;
}
const syncImportGo = () => { $('#importGo').disabled = !importFile || !$('#importName').value.trim(); };
$('#importName').addEventListener('input', syncImportGo);
$('#importFile').addEventListener('change', (e) => pickFile(e.target.files[0]));
const drop = $('#importDrop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); pickFile(e.dataTransfer.files[0]); });
// A big export is trimmed here, before upload, to its newest part (the build only reads
// the newest messages anyway), so nobody has to cut a file down by hand.
let importMaxMb = 30;
const stampOf = (c) => { const t = c.update_time ?? c.create_time ?? c.updated_at ?? c.created_at ?? c.date ?? 0; return typeof t === 'number' ? t * (t < 1e12 ? 1000 : 1) : Date.parse(t) || 0; };
async function trimForUpload(file) {
  const target = importMaxMb * 1024 * 1024 * 0.8;
  if (file.size <= target || /\.docx$/i.test(file.name)) return { body: file, note: '' };
  const text = await file.text();
  if (/^\s*[[{]/.test(text)) {
    let v;
    try { v = JSON.parse(text); } catch { return { body: file, note: '' }; }
    const key = Array.isArray(v) ? null : ['conversations', 'chats', 'turns', 'messages'].find((k) => Array.isArray(v[k]));
    const list = key ? v[key] : Array.isArray(v) ? v : null;
    if (!list) return { body: file, note: '' };
    const sorted = [...list].sort((a, b) => stampOf(b) - stampOf(a));
    const kept = [];
    let size = 0;
    for (const c of sorted) { size += JSON.stringify(c).length; if (size > target) break; kept.push(c); }
    const out = key ? { ...v, [key]: kept } : kept;
    return { body: new Blob([JSON.stringify(out)]), note: `Your file was big, so I read the newest ${kept.length.toLocaleString()} of ${list.length.toLocaleString()} ${key === 'turns' || key === 'messages' ? 'messages' : 'chats'}.` };
  }
  // Text, Markdown or CSV: keep the end (the newest part), from a line break; a CSV keeps its header.
  const head = /\.csv$/i.test(file.name) ? text.slice(0, text.indexOf('\n') + 1) : '';
  const tail = text.slice(-Math.floor(target));
  return { body: new Blob([head + tail.slice(tail.indexOf('\n') + 1)]), note: 'Your file was big, so I read its newest part.' };
}

$('#importGo').addEventListener('click', async () => {
  if (!importFile) return;
  const go = $('#importGo');
  go.disabled = true;
  go.textContent = 'Uploading…';
  const name = $('#importName').value.trim();
  try {
    go.textContent = 'Reading…';
    const { body, note } = await trimForUpload(importFile);
    go.textContent = 'Uploading…';
    const res = await fetch(`/api/import?name=${encodeURIComponent(name)}&file=${encodeURIComponent(importFile.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || `Upload failed (${res.status})`);
    $('#importForm').hidden = true;
    $('#importProgress').hidden = false;
    const im = out.imported;
    $('#impLabel').textContent = [
      note || `Read ${im.conversations.toLocaleString()} chats from your ${im.format} file.`,
      im.reading < im.turns ? `This prototype builds from your newest ${im.reading.toLocaleString()} of ${im.turns.toLocaleString()} messages, to keep costs down.` : '',
      im.undated ? 'Some chats have no dates, so cards from them are tagged Imported.' : '',
    ].filter(Boolean).join(' ');
    try { localStorage.removeItem('dv-chat-mine'); } catch {}
    showBuild(out.job);
    await enterApp(out);
    pollBuild(); // until it's done, even if it finished already
  } catch (err) {
    $('#importError').textContent = err.message;
    $('#importError').hidden = false;
  } finally {
    go.textContent = 'Build my memory';
    syncImportGo();
  }
});

// ---------------- boot ----------------
// The app always opens on Select user, with whoever this browser used last picked.
(async () => {
  const state = await api('/api/state');
  showLanding(state.needsChoice ? state : await api('/api/profiles'));
  try { if (sessionStorage.getItem('dv-ended')) { sessionStorage.removeItem('dv-ended'); toast('Session ended: your upload, cards and chats are deleted.'); } } catch {}
})();
