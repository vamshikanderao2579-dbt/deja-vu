import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { config, ROOT } from './src/config.js';
import { getState, save, reset, findMessage, findConversation, addLiveMessage, historyAsText, listProfiles, useProfile, saveSeed, loadSeed } from './src/store.js';
import * as store from './src/store.js';
import { distill, selectRelevant, answer, rewriteCard, learnFrom } from './src/agent.js';
import { decideCue, checkReason, applyFeedback } from './src/cue.js';
import { transcribe, interpret } from './src/voice.js';
import { renderMarkdown, budgetStats, estimateTokens, publicCard, usable, applyCardAction, mergeCards, seasonState } from './src/cards.js';
import { todayMs } from './src/config.js';
import { addReviewStats, emptyReviewStats } from './src/review.js';

const PUBLIC = join(ROOT, 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
// Full-history size per profile, for the "x% less than full history" comparison.
const historyTokens = new Map();
const fullHistoryTokens = () => {
  if (!historyTokens.has(store.profile.id)) historyTokens.set(store.profile.id, estimateTokens(historyAsText()));
  return historyTokens.get(store.profile.id);
};

// ---------- tiny router ----------
const routes = [];
const route = (method, path, fn) => routes.push({ method, re: new RegExp(`^${path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn });

route('GET', '/api/state', () => statePayload());

route('POST', '/api/distill', async () => {
  const s = getState();
  const { cards, calls, usage, review, dropped } = await distill(s.cards, s.rejected);
  s.cards = cards;
  // A rebuild starts the review log over: it describes how this memory was made.
  s.review = review;
  s.screened = dropped.slice(-30);
  save();
  saveSeed();
  return { ...statePayload(), distill: { calls, usage } };
});

route('POST', '/api/chat', async (body) => {
  const { message, mode = 'cards', conversationId = 'default', skipCue = false, demo = false } = body;
  if (!message?.trim()) throw httpError(400, 'message is required');
  // Finish learning from the previous message first, so memory is up to date
  // (and a replayed demo sees exactly what the live run saw).
  await learning;
  const s = getState();

  let relevant = [];
  let key = [];
  let stakes = 'low';
  if (mode === 'cards') {
    ({ relevant, key = [], stakes } = await selectRelevant(message, s.cards));
    if (!skipCue) {
      // Ask only about a card central to this answer; never style or agent-identity cards.
      // Sensitive (locked) cards are only ever reviewed in Memory, never raised mid-task.
      const askable = key.filter((c) => c.category !== 'style' && c.category !== 'assistant' && c.status !== 'pending');
      // A scripted demo spans several "days": only the once-per-chat rule applies.
      const log = demo ? s.cueLog.filter((e) => e.conversationId === conversationId) : s.cueLog;
      const cue = decideCue({ relevant: askable, stakes, conversationId, cueLog: log });
      if (cue) {
        s.cueLog.push({ cardId: cue.cardId, conversationId, at: new Date().toISOString(), outcome: null });
        save();
        return { type: 'cue', cue: { ...cue, card: publicCard(s.cards.find((c) => c.id === cue.cardId)) }, stakes };
      }
    }
  }

  const prior = s.live.find((c) => c.id === `live-${conversationId}`)?.messages ?? [];
  const res = await answer(message, mode, relevant, { recent: prior });
  const used = relevant.filter(usable);
  for (const c of used) c.last_used = new Date().toISOString();
  // Keep the exchange, then learn from it in the background (never blocks the answer).
  const { conv } = addLiveMessage(conversationId, 'user', message);
  addLiveMessage(conversationId, 'assistant', res.text);
  save();
  learnInBackground(conv);
  return {
    type: 'answer',
    text: res.text,
    mode,
    stakes,
    usedCards: used.map(publicCard),
    tokens: { context: res.contextTokens, fullHistory: fullHistoryTokens(), usage: res.usage },
  };
});

let learning = Promise.resolve();
function learnInBackground(conv) {
  // One at a time, so two quick messages don't overwrite each other's cards.
  learning = learning.then(async () => {
    try {
      const s = getState();
      const recent = { ...conv, messages: conv.messages.slice(-6) };
      const { cards, added, review, dropped } = await learnFrom(recent, s.cards, s.rejected);
      s.review = addReviewStats(s.review, review);
      s.screened = [...(s.screened ?? []), ...dropped].slice(-30);
      if (!added.length) { save(); return; }
      s.cards = cards;
      const at = new Date().toISOString();
      // Locked (sensitive) learnings are saved quietly, never announced.
      const shareable = added.filter((c) => c.status !== 'pending');
      s.learned = [...(s.learned ?? []), ...shareable.map((c) => ({ id: c.id, text: c.text, category: c.category, at }))].slice(-20);
      save();
    } catch (err) {
      console.warn('[learn]', err.message);
    }
  });
}

// Swipe or tap on a card: confirm (right), reject (left), edit (up)
route('POST', '/api/cards/:id', (body, { id }) => {
  const s = getState();
  const { action, text } = body;
  applyCardAction(s, id, action, text);

  const open = [...s.cueLog].reverse().find((e) => e.cardId === id && !e.outcome);
  if (open) open.outcome = action;
  save();
  return statePayload();
});

// The user told us in chat what changed: save it as a new confirmed card.
route('POST', '/api/memory/update', async (body) => {
  const { category, oldText, message, cardId } = body;
  if (!category || !message?.trim()) throw httpError(400, 'category and message are required');
  const s = getState();
  if (cardId && s.cards.some((c) => c.id === cardId)) applyCardAction(s, cardId, 'reject');
  const next = await rewriteCard(category, oldText ?? '', message);
  if (!next) { save(); return { card: null, ...statePayload() }; }
  // Merge without the rejected list: the new wording can be close to the old one.
  s.cards = mergeCards(s.cards, [{ category, type: next.type, text: next.text, confidence: 1 }], []);
  const card = s.cards.find((c) => c.category === category && c.text === next.text) ?? s.cards.at(-1);
  applyCardAction(s, card.id, 'confirm');
  save();
  return { card: publicCard(card), ...statePayload() };
});

route('POST', '/api/feedback', (body) => {
  const s = getState();
  applyFeedback(s.cards, body.cardIds ?? [], !!body.positive);
  save();
  return statePayload();
});

// Provenance: the exact messages a card came from, plus the full conversation around each.
route('GET', '/api/sources/:id', (_, { id }) => {
  const card = getState().cards.find((c) => c.id === id);
  if (!card) throw httpError(404, 'card not found');
  const sources = (card.sources ?? []).map((m) => findMessage(m)).filter(Boolean);
  const convIds = [...new Set(sources.map((s) => s.conversationId))];
  return {
    sources,
    conversations: convIds.map((cid) => {
      const c = findConversation(cid);
      return { id: c.id, title: c.title, date: c.date, time: c.time, messages: c.messages };
    }),
  };
});

route('GET', '/api/eval', async () => {
  const raw = await readFile(join(ROOT, 'eval', 'results', 'latest.json'), 'utf8').catch(() => null);
  if (!raw) return { available: false };
  const { rows, ...rest } = JSON.parse(raw);
  return { available: true, ...rest };
});

route('POST', '/api/reset', () => {
  reset();
  return statePayload();
});

// Loads the ready-made synthetic memory (mixed statuses) for demos.
// Resets the active profile to its starting memory (Alex: the demo memory; others:
// the memory as first built from their chats).
route('POST', '/api/demo/load', async () => {
  if (!loadSeed()) throw httpError(409, 'Build this profile’s memory first (Memory → Build from my chats).');
  return statePayload();
});

route('GET', '/api/profiles', () => ({ active: store.profile.id, profiles: listProfiles().map(({ id, name, about }) => ({ id, name, about })) }));

route('POST', '/api/profile', async ({ id }) => {
  await learning;
  if (!listProfiles().some((p) => p.id === id)) throw httpError(404, 'unknown profile');
  useProfile(id);
  return statePayload();
});

route('POST', '/api/cue-cooldown/reset', () => {
  getState().cueLog = [];
  save();
  return statePayload();
});

function statePayload() {
  const s = getState();
  return {
    mock: config.mock,
    models: { main: config.providers.main.model, bg: config.providers.bg.model, grader: config.graderEnabled ? config.providers.grader.model : null },
    userName: config.userName,
    profile: { id: store.profile.id, name: store.profile.name, about: store.profile.about, suggestions: store.profile.suggestions ?? [], script: store.profile.script ?? [] },
    museEnabled: config.museEnabled,
    agent: config.agent,
    cards: s.cards.map((c) => ({ ...publicCard(c), checkReason: seasonState(c, todayMs())?.active === false ? null : checkReason(c), seasonState: seasonState(c, todayMs()) })),
    budget: budgetStats(s.cards),
    fullHistoryTokens: fullHistoryTokens(),
    cuesShown: s.cueLog.length,
    learned: s.learned ?? [],
    // How the writer → grader gate has screened cards (counts only; dropped texts in `screened`).
    review: s.review ?? emptyReviewStats(),
    screened: s.screened ?? [],
  };
}

// ---------- exports ----------
async function serveExport(req, res) {
  const s = getState();
  if (req.url === '/export/me.json') {
    const body = JSON.stringify({ version: 1, user: config.userName, exported: new Date().toISOString(), cards: s.cards.map(publicCard) }, null, 2);
    return send(res, 200, body, 'application/json', { 'Content-Disposition': 'attachment; filename="me.json"' });
  }
  if (req.url === '/export/me.md') {
    return send(res, 200, renderMarkdown(s.cards, config.userName), 'text/markdown', { 'Content-Disposition': 'attachment; filename="me.md"' });
  }
  return false;
}

// ---------- rate limit (protects API credits on the public demo) ----------
const hits = new Map();
function rateLimited(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] ?? req.socket.remoteAddress;
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > config.rateLimitPerMinute;
}

// ---------- server ----------
const httpError = (status, message) => Object.assign(new Error(message), { status });

function send(res, status, body, type = 'application/json', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, ...headers });
  res.end(body);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/export/')) {
      if ((await serveExport(req, res)) !== false) return;
    }
    // Voice: raw PCM16 mono 24 kHz in, transcript and its meaning out.
    if (url.pathname === '/api/voice' && req.method === 'POST') {
      if (rateLimited(req)) return send(res, 429, JSON.stringify({ error: 'Slow down a little and try again in a minute.' }));
      const pcm = await readRaw(req, 1_000_000);
      const transcript = await transcribe(pcm);
      return send(res, 200, JSON.stringify({ transcript, ...interpret(transcript) }));
    }
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'POST' && rateLimited(req)) return send(res, 429, JSON.stringify({ error: 'Slow down a little and try again in a minute.' }));
      for (const r of routes) {
        const m = r.method === req.method && url.pathname.match(r.re);
        if (!m) continue;
        const body = req.method === 'POST' ? await readBody(req) : {};
        const out = await r.fn(body, m.groups ?? {});
        return send(res, 200, JSON.stringify(out));
      }
      return send(res, 404, JSON.stringify({ error: 'not found' }));
    }
    // static files
    const path = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
    const file = join(PUBLIC, path);
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'forbidden', 'text/plain');
    const data = await readFile(file).catch(() => null);
    if (!data) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, data, TYPES[extname(file)] ?? 'application/octet-stream');
  } catch (err) {
    console.error(err);
    send(res, err.status ?? 500, JSON.stringify({ error: err.message }));
  }
})
  .on('error', (err) => {
    if (err.code !== 'EADDRINUSE') throw err;
    console.error(`\n  Port ${config.port} is already in use. The app may already be running at http://localhost:${config.port}`);
    console.error(`  Stop the other copy, or run on another port:  PORT=3001 npm start\n`);
    process.exit(1);
  })
  .listen(config.port, () => {
  console.log(`\n  Running at http://localhost:${config.port}`);
  console.log(config.mock ? '  Mock mode: no MAIN_API_KEY set, using fixtures.\n' : `  Live: main=${config.providers.main.model}, bg=${config.providers.bg.model}\n`);
});

async function readRaw(req, limit) {
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw httpError(413, 'audio too long');
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw httpError(413, 'request too large');
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw httpError(400, 'invalid JSON');
  }
}
