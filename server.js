import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { config, ROOT } from './src/platform/config.js';
import { getState, save, reset, findMessage, findConversation, addLiveMessage, historyAsText, saveSeed, loadSeed, chatTitle, current, runIn, getProfile, getHistory, userName } from './src/platform/store.js';
import { sessionFor, viewFor, profilesFor, choose, saveImport, countBuild, endSession, clearCookie, buildsRunning } from './src/platform/sessions.js';
import { importHistory, isChat } from './src/platform/importers.js';
import { selectRelevant, answer, rewriteCard, proposeFrom, applyLearned, summarizeHistory } from './src/engine/agent.js';
import { cueDecision, checkReason, applyFeedback, implicitYes } from './src/engine/cue.js';
import { transcribe, interpret, VOICE_MODEL } from './src/platform/voice.js';
import { renderMarkdown, budgetStats, estimateTokens, publicCard, usable, applyCardAction, mergeCards, seasonState, untilState, renderContext, similarity } from './src/engine/cards.js';
import { todayMs } from './src/platform/config.js';
import { addReviewStats, emptyReviewStats } from './src/engine/review.js';
import { buildMemory, applyBuild } from './src/engine/build.js';

const PUBLIC = join(ROOT, 'src', 'ui');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.m4a': 'audio/mp4' };
// Full-history size per view, for the "x% less than full history" comparison.
const historyTokens = new WeakMap();
const fullHistoryTokens = () => {
  const v = current();
  if (!historyTokens.has(v)) historyTokens.set(v, estimateTokens(historyAsText()));
  return historyTokens.get(v);
};
// "How agents work today": a memory summary written once from the whole history, kept
// hidden and never checked. Saved with the state; written again only if the history grows.
const summaryJobs = new WeakMap();
async function hiddenSummary(s) {
  const size = fullHistoryTokens();
  if (s.summary?.historyTokens === size) return s.summary.text;
  const v = current();
  if (!summaryJobs.has(v)) {
    summaryJobs.set(v, (config.mock ? Promise.resolve('Mock summary: likes direct flights, hotels over Airbnbs, mild food for the kids.') : summarizeHistory())
      .then((text) => { s.summary = { text, historyTokens: size, at: new Date().toISOString() }; save(); return text; })
      .finally(() => summaryJobs.delete(v)));
  }
  return summaryJobs.get(v);
}

// ---------- tiny router ----------
const routes = [];
const route = (method, path, fn) => routes.push({ method, re: new RegExp(`^${path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn });

route('GET', '/api/state', () => statePayload());

// Building memory from the whole history runs as a background job: the page polls
// GET /api/build for progress and tells the user in chat when it's done. Each view
// (one person's memory, for one visitor) has its own job.

// One full rebuild per month per person. Sooner only once the history has grown, and
// then it reads just the new chats. When every card is confirmed, a rebuild starts
// after the newest one: everything before it is already approved.
const REBUILD_DAYS = Number(process.env.REBUILD_DAYS ?? 30);
const REBUILD_GROWTH_TOKENS = Number(process.env.REBUILD_GROWTH_TOKENS ?? 20000);
const DAY_MS = 24 * 60 * 60 * 1000;
// Counted fresh (the comparison figure above is cached): live chats grow the history.
const historyTokensNow = () => estimateTokens(historyAsText());
function rebuildPlan() {
  const s = getState();
  const last = s.build?.at ? Date.parse(s.build.at) : null;
  const tokens = historyTokensNow();
  const growth = last ? tokens - (s.build.historyTokens ?? tokens) : 0;
  const allConfirmed = s.cards.length && s.cards.every((c) => c.status === 'confirmed');
  const confirmedThrough = allConfirmed ? s.cards.map((c) => c.last_seen).filter(Boolean).sort().at(-1) ?? null : null;
  const base = { lastAt: s.build?.at ?? null, nextAt: last ? new Date(last + REBUILD_DAYS * DAY_MS).toISOString() : null, cards: s.cards.length, confirmed: s.cards.filter((c) => c.status === 'confirmed').length };
  // On the public link a demo person (Alex, Maria) can always rebuild: the build is recorded, so it's free.
  if (!last || (config.publicDemo && getProfile().script?.length) || Date.now() - last >= REBUILD_DAYS * DAY_MS) return { ...base, allowed: true, mode: 'full', since: confirmedThrough };
  if (growth >= REBUILD_GROWTH_TOKENS) return { ...base, allowed: true, mode: 'new', since: s.build.readThrough ?? null, growth };
  return { ...base, allowed: false, mode: 'wait', growth, needTokens: REBUILD_GROWTH_TOKENS - growth };
}

function startBuild(plan = { mode: 'full', since: null }) {
  const view = current();
  if (view.buildJob?.running) return view.buildJob;
  const s = getState();
  const profileId = getProfile().id;
  const job = { running: true, profileId, pct: 0, stage: 'guard', label: 'Starting', startedAt: new Date().toISOString() };
  view.buildJob = job;
  // The job keeps the view it started in (runIn carries it through every await), so a
  // visitor switching people meanwhile can't send these cards to the wrong memory.
  job.promise = buildMemory({ conversations: getHistory().conversations, existing: s.cards, rejected: s.rejected, profileId: view.buildKey, since: plan.since, onProgress: (p) => Object.assign(job, p) })
    .then(({ cards, report }) => {
      const st = getState();
      st.cards = markImported(applyBuild(st.cards, cards, st.rejected, { partial: plan.mode === 'new' || !!plan.since }));
      st.updatedAt = new Date().toISOString();
      st.build = { ...report, mode: plan.mode, historyTokens: historyTokensNow() };
      st.review = emptyReviewStats();
      save();
      saveSeed();
      Object.assign(job, { running: false, done: true, pct: 100, report });
    })
    .catch((err) => Object.assign(job, { running: false, done: true, error: err.message }));
  return job;
}
// Cards learned only from undated imported chats: tagged imported, and never short-term
// (there's no date to count from). Dated chats in Déjà Vu make cards the usual way.
function markImported(cards) {
  const undated = new Set(getHistory().conversations.filter((c) => c.undated).flatMap((c) => c.messages.map((m) => m.id)));
  if (!undated.size) return cards;
  for (const c of cards) {
    if (c.sources?.length && c.sources.every((id) => undated.has(id))) { c.imported = true; delete c.until; }
  }
  return cards;
}
const jobView = (j) => (j ? { running: j.running, done: !!j.done, pct: j.pct, stage: j.stage, label: j.label, report: j.report ?? null, error: j.error ?? null, profileId: j.profileId } : { running: false });

// Saved chats, newest first, for the sidebar; and one chat's messages, to reopen it.
const chatId = (c) => c.id.replace(/^live-/, '');
route('GET', '/api/chats', () => ({
  chats: getState().live
    .map((c, i) => ({ c, i, at: c.updated ?? `${c.date}T${c.time}` }))
    .filter(({ c }) => c.messages.some((m) => m.role === 'user'))
    .sort((a, b) => b.at.localeCompare(a.at) || b.i - a.i)
    .map(({ c }) => ({ id: chatId(c), title: chatTitle(c.messages.find((m) => m.role === 'user').text), date: c.date, updated: c.updated ?? null, messages: c.messages.length })),
}));
route('GET', '/api/chats/:id', (_, { id }) => {
  const c = getState().live.find((x) => x.id === `live-${id}`);
  if (!c) throw httpError(404, 'chat not found');
  return { id, title: chatTitle(c.messages.find((m) => m.role === 'user')?.text ?? c.title), messages: c.messages.map(({ role, text, draft }) => ({ role, text, ...(draft ? { draft } : {}) })) };
});

route('GET', '/api/build/plan', () => rebuildPlan());
route('POST', '/api/build', (body, _, { session }) => {
  if (current().buildJob?.running) return jobView(current().buildJob);
  if (!body?.confirm) throw httpError(400, 'Confirm the rebuild first.');
  const plan = rebuildPlan();
  if (!plan.allowed) throw httpError(429, `You refreshed your memory recently. Try again on ${new Date(plan.nextAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`);
  canBuild(session);
  return jobView(startBuild(plan));
});
route('GET', '/api/build', () => jobView(current().buildJob));

// Builds cost API credits: on the public link each visitor gets a few, and only a few run at once.
function canBuild(session) {
  if (!config.publicDemo) return;
  if ((session.builds ?? 0) >= config.sessionBuilds) throw httpError(429, 'This demo allows a couple of memory builds per visitor, and you’ve used them.');
  if (buildsRunning() >= config.buildsAtOnce) throw httpError(503, 'A few people are building their memory right now. Try again in a couple of minutes.');
  countBuild(session);
}

// The same build, waited on, without the monthly limit (tests and scripts; not on the public link).
route('POST', '/api/distill', async () => {
  if (config.publicDemo) throw httpError(404, 'not found');
  const job = startBuild();
  await job.promise;
  if (job.error) throw httpError(500, job.error);
  return { ...statePayload(), build: job.report };
});

route('POST', '/api/chat', async (body) => {
  const { message, conversationId = 'default', skipCue = false, demo = false } = body;
  if (!message?.trim()) throw httpError(400, 'message is required');
  // Learning (writer + grader) runs in the background and never delays an answer:
  // new cards join memory when they're ready. Only a scripted demo waits for it,
  // so a replay sees exactly the memory the recorded run saw.
  if (demo) await current().learning;
  const s = getState();
  // Memory cards by default; the other two are there to compare: a hidden summary (how
  // agents work today) or re-reading every chat.
  const mode = ['summary', 'full'].includes(body.mode) ? body.mode : 'cards';
  const trace = { mode, stakes: 'low', picked: 0, check: null, quiet: null, quietYes: null };

  // Answer first, check after: carrying on in the same chat without ✕ is a quiet yes.
  const open = [...s.cueLog].reverse().find((e) => e.conversationId === conversationId && !e.outcome);
  if (open) {
    const card = s.cards.find((c) => c.id === open.cardId);
    if (card) { implicitYes(card); trace.quietYes = { text: card.text, confirmed: card.status === 'confirmed' }; }
    open.outcome = 'implicit';
  }

  let relevant = [];
  let key = [];
  let stakes = 'low';
  let check = null;
  if (mode === 'cards') {
    ({ relevant, key = [], stakes } = await selectRelevant(message, s.cards));
    if (skipCue) trace.quiet = 'redo';
    else {
      // Check only a card central to this answer; never style or agent-identity cards.
      // Sensitive (locked) cards are only ever reviewed in Memory, never raised mid-task.
      const askable = key.filter((c) => c.category !== 'style' && c.category !== 'assistant' && c.status !== 'pending' && !c.sensitive);
      // A scripted demo spans several "days": only the once-per-chat rule applies.
      const log = demo ? s.cueLog.filter((e) => e.conversationId === conversationId) : s.cueLog;
      const decision = cueDecision({ relevant: askable, stakes, conversationId, cueLog: log });
      if (decision.cue) {
        s.cueLog.push({ cardId: decision.cue.cardId, conversationId, at: new Date().toISOString(), outcome: null });
        check = { ...decision.cue, card: publicCard(s.cards.find((c) => c.id === decision.cue.cardId)) };
        trace.check = check.card.text;
      } else trace.quiet = decision.why;
    }
  }
  trace.stakes = stakes;
  trace.picked = relevant.length;

  // One answer call, right away. The check (if any) rides along above it; a high-stakes
  // request may come back with a booking or order draft built from the same cards.
  const prior = s.live.find((c) => c.id === `live-${conversationId}`)?.messages ?? [];
  // Draft tools only for requests that are about acting: booking, ordering, a stay or a flight.
  // The summary and full-history chats get them too (today's agents can draft a booking), so
  // the three compare like for like: only what each remembers differs, not the tools sent.
  const actions = (mode === 'cards' ? stakes === 'high' : true) && ACTION_WORDS.test(message);
  // The chat's model picker: only allowed models and effort levels; the default otherwise.
  const model = config.answerModels.includes(body.model) && body.model !== config.providers.main.model ? body.model : null;
  // A redo after a change thinks a little harder, so it switches to what the user now wants.
  const effort = ['medium', 'high'].includes(body.effort) ? body.effort : skipCue ? 'medium' : 'low';
  const summary = mode === 'summary' ? await hiddenSummary(s) : undefined;
  const res = await answer(message, mode, relevant, { summary, recent: prior, actions, redo: skipCue, model, effort });
  const used = relevant.filter(usable);
  for (const c of used) c.last_used = new Date().toISOString();
  // Insights counts what Déjà Vu decided; the two comparison modes decide nothing.
  if (mode === 'cards') s.trace = countTrace(s.trace, trace, !!res.draft);
  // Keep the exchange, then learn from it in the background (never blocks the answer).
  const { conv } = addLiveMessage(conversationId, 'user', message);
  addLiveMessage(conversationId, 'assistant', res.text, res.draft ? { draft: res.draft } : {});
  save();
  // Only Déjà Vu memory learns cards; the other two are there to compare.
  if (mode === 'cards') learnInBackground(conv);
  return {
    type: 'answer',
    text: res.text,
    draft: res.draft ?? null,
    check,
    trace,
    mode,
    stakes,
    usedCards: used.map(publicCard),
    model: model ?? config.providers.main.model,
    tokens: { context: res.contextTokens, fullHistory: fullHistoryTokens(), usage: res.usage },
  };
});

const ACTION_WORDS = /\b(book|booking|reserve|reservation|order|buy|purchase|stay|hotel|airbnb|room|flights?|fly|tickets?)\b/i;

// Running totals of what the memory agent decided, for Insights.
function countTrace(t = {}, one, drafted) {
  const out = { answers: 0, checksAsked: 0, checksConfirmed: 0, checksCorrected: 0, quiet: {}, quietYes: 0, drafts: 0, ...t, quiet: { ...(t.quiet ?? {}) } };
  out.answers++;
  if (one.check) out.checksAsked++;
  if (one.quiet && one.mode === 'cards') out.quiet[one.quiet] = (out.quiet[one.quiet] ?? 0) + 1;
  if (one.quietYes) out.quietYes++;
  if (drafted) out.drafts++;
  return out;
}

// ---------- plug-in API: the memory layer for any agent ----------
// recall: the cards (and prompt text) for one message, plus a check if one is due.
// The host agent puts `context` in its own prompt and shows `check` above its answer.
route('POST', '/api/recall', async ({ message, conversationId = 'external' }) => {
  if (!message?.trim()) throw httpError(400, 'message is required');
  const s = getState();
  const { relevant, key = [], stakes } = await selectRelevant(message, s.cards);
  const askable = key.filter((c) => c.category !== 'style' && c.category !== 'assistant' && c.status !== 'pending' && !c.sensitive);
  const { cue } = cueDecision({ relevant: askable, stakes, conversationId, cueLog: s.cueLog });
  if (cue) { s.cueLog.push({ cardId: cue.cardId, conversationId, at: new Date().toISOString(), outcome: null }); save(); }
  const cards = relevant.filter(usable);
  return { stakes, cards: cards.map(publicCard), context: renderContext(cards), check: cue ? { ...cue, card: publicCard(s.cards.find((c) => c.id === cue.cardId)) } : null };
});
// remember: hand over an exchange; cards are written, graded and merged in the background.
route('POST', '/api/remember', ({ messages, conversationId = 'external' }) => {
  if (!Array.isArray(messages) || !messages.length) throw httpError(400, 'messages is required: [{ role, text }]');
  let conv;
  for (const m of messages) ({ conv } = addLiveMessage(conversationId, m.role === 'assistant' ? 'assistant' : 'user', String(m.text ?? '')));
  save();
  learnInBackground(conv);
  return { queued: true };
});
// confirm / reject: POST /api/cards/:id { action: 'confirm' | 'reject' } (below).

function learnInBackground(conv) {
  // One at a time per memory, so two quick messages don't overwrite each other's cards.
  // It runs in the view it was started from, even if the visitor switches people meanwhile.
  const view = current();
  view.learning = view.learning.then(async () => {
    try {
      const recent = { ...conv, messages: conv.messages.slice(-6) };
      const { kept, review, dropped } = await proposeFrom(recent, getState().cards);
      // Merge into memory as it is now: chat and swipes kept going while the writer and grader worked.
      const s = getState();
      const before = new Map(s.cards.map((c) => [c.id, c.text]));
      const { cards, added } = applyLearned(s.cards, kept, s.rejected);
      s.review = addReviewStats(s.review, review);
      s.screened = [...(s.screened ?? []), ...dropped].slice(-30);
      if (!added.length) { save(); return; }
      s.cards = cards;
      const at = new Date().toISOString();
      s.updatedAt = at;
      // Locked (sensitive) learnings are saved quietly, never announced.
      const shareable = added.filter((c) => c.status !== 'pending');
      // `was`: the card this learning changed, so the chat can show the update happening.
      s.learned = [...(s.learned ?? []), ...shareable.map((c) => ({ id: c.id, text: c.text, category: c.category, at, ...(before.has(c.id) && before.get(c.id) !== c.text ? { was: before.get(c.id) } : {}) }))].slice(-20);
      save();
    } catch (err) {
      console.warn('[learn]', err.message);
    }
  });
}

// Swipe or tap on a card: confirm (right), reject (left), edit (up)
route('POST', '/api/cards/:id', async (body, { id }) => {
  if (body.demo) await current().learning;
  const s = getState();
  const { action, text } = body;
  applyCardAction(s, id, action, text);
  s.updatedAt = new Date().toISOString();

  const open = [...s.cueLog].reverse().find((e) => e.cardId === id && !e.outcome);
  if (open) {
    open.outcome = action;
    // How a check ended, for Insights: ✕ or a new wording is a correction; ✓, a note
    // or a new end date is a yes. Carrying on is counted as a quiet yes in the chat route.
    const t = (s.trace ??= {});
    if (action === 'reject' || action === 'edit') t.checksCorrected = (t.checksCorrected ?? 0) + 1;
    else t.checksConfirmed = (t.checksConfirmed ?? 0) + 1;
  }
  save();
  return statePayload();
});

// The user told us in chat what changed: save it as a new confirmed card.
route('POST', '/api/memory/update', async (body) => {
  const { category, oldText, message, cardId } = body;
  if (!category || !message?.trim()) throw httpError(400, 'category and message are required');
  if (body.demo) await current().learning;
  const s = getState();
  if (cardId && s.cards.some((c) => c.id === cardId)) applyCardAction(s, cardId, 'reject');
  const next = await rewriteCard(category, oldText ?? '', message);
  if (!next) { save(); return { card: null, ...statePayload() }; }
  // Merge without the rejected list: the new wording can be close to the old one.
  const before = new Set(s.cards.map((c) => c.id));
  s.cards = mergeCards(s.cards, [{ category, type: next.type, text: next.text, confidence: 1, ...(next.until ? { until: next.until } : {}) }], []);
  // The card this became: a new one, or the existing card it merged into (which keeps
  // its old wording, so take the user's new words). Never just "the last card".
  const card = s.cards.find((c) => !before.has(c.id)) ??
    s.cards.find((c) => c.category === category && c.text === next.text) ??
    s.cards.filter((c) => c.category === category).sort((a, b) => similarity(b.text, next.text) - similarity(a.text, next.text))[0];
  if (!card) { save(); return { card: null, ...statePayload() }; }
  card.text = next.text;
  if (next.until) card.until = next.until;
  else delete card.until;
  s.updatedAt = new Date().toISOString();
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
      return { id: c.id, title: c.title, date: c.date, time: c.time, undated: !!c.undated, file: c.undated ? getHistory().source?.file ?? null : null, messages: c.messages };
    }),
  };
});

// The eval across all people (numbers only, committed: data/eval-summary.json), else the
// last local run for the synthetic default persona.
route('GET', '/api/eval', async () => {
  const combined = await readFile(join(ROOT, 'data', 'eval-summary.json'), 'utf8').catch(() => null);
  if (combined) return { available: true, ...JSON.parse(combined) };
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
route('POST', '/api/demo/load', async (body) => {
  if (!loadSeed()) throw httpError(409, 'Build this profile’s memory first (Memory → Build from my chats).');
  // The guided tour starts with Déjà Vu off: no cards until it's turned on.
  if (body?.empty) { Object.assign(getState(), { cards: [], rejected: [], cueLog: [], learned: [] }); save(); }
  // A visit to a demo person starts clean: their starting cards, no chats from last time.
  if (body?.fresh && getProfile().script?.length) { Object.assign(getState(), { live: [], build: null }); save(); }
  // A fresh start picks cards fresh too, so a recorded demo replays exactly.
  current().relevanceCache = [];
  return statePayload();
});

// The guided tour builds memory the way a new user would: from an empty memory, over the
// same chats. Only for a demo person with a tour; the recorded build replays for free.
route('POST', '/api/demo/build', () => {
  if (!getProfile().script?.length) throw httpError(404, 'not found');
  if (current().buildJob?.running) return jobView(current().buildJob);
  Object.assign(getState(), { cards: [], rejected: [], cueLog: [], learned: [] });
  current().relevanceCache = [];
  save();
  return jobView(startBuild());
});

route('GET', '/api/profiles', (_, __, { session }) => ({ active: viewFor(session)?.profile.id ?? null, profiles: profilesFor(session), importMaxMb: config.importMaxMb }));

route('POST', '/api/profile', async ({ id }, _, { session }) => {
  if (!choose(session, id)) throw httpError(404, 'unknown profile');
  return runIn(viewFor(session), statePayload);
});

// Your own memory: upload a chat export (raw file in the body). It becomes this visitor's
// profile and a build starts right away; the page shows its progress.
async function importRoute(req, url, session) {
  if (current()?.buildJob?.running) throw httpError(409, 'A memory build is already running. Wait for it to finish.');
  // The page trims a big export to its newest part before upload; this is only a backstop.
  const raw = await readRaw(req, config.importMaxMb * 1024 * 1024, 'That file is too big for this prototype. Try a shorter export.');
  let parsed;
  try { parsed = importHistory(raw, { name: url.searchParams.get('name') ?? '', file: url.searchParams.get('file') ?? '' }); } catch (err) { throw httpError(400, err.message); }
  const check = await isChat(parsed.history);
  if (!check.chat) throw httpError(400, 'That doesn’t look like a chat. Upload a conversation between you and an assistant (ChatGPT, Claude, Muse, or a log with “You:” and “Assistant:” lines).');
  canBuild(session);
  saveImport(session, parsed);
  const view = viewFor(session);
  // The build reads the newest BUILD_TURN_CAP messages you wrote; say so up front.
  const reading = Math.min(parsed.turns, Number(process.env.BUILD_TURN_CAP ?? 500));
  return runIn(view, () => ({ imported: { format: parsed.label, turns: parsed.turns, reading, undated: parsed.undated, conversations: parsed.history.conversations.length }, job: jobView(startBuild()), ...statePayload() }));
}

// End the visit: delete everything uploaded or built in it.
route('POST', '/api/session/end', (_, __, { session, res }) => {
  endSession(session);
  clearCookie(res);
  return { ended: true };
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
    models: { answer: config.answerModels, main: config.providers.main.model, bg: config.providers.bg.model, grader: config.graderEnabled ? config.providers.grader.model : null, voice: VOICE_MODEL },
    userName: userName(),
    profile: { id: getProfile().id, name: getProfile().name, about: getProfile().about, suggestions: getProfile().suggestions ?? [], script: getProfile().script ?? [], mine: getProfile().id === 'mine', demo: !getProfile().real && getProfile().id !== 'mine' },
    publicDemo: config.publicDemo,
    museEnabled: config.museEnabled,
    agent: config.agent,
    today: new Date(todayMs()).toISOString().slice(0, 10),
    cards: s.cards.map((c) => ({ ...publicCard(c), checkReason: seasonState(c, todayMs())?.active === false ? null : checkReason(c), seasonState: seasonState(c, todayMs()), untilState: untilState(c, todayMs()) })),
    budget: budgetStats(s.cards),
    fullHistoryTokens: fullHistoryTokens(),
    cuesShown: s.cueLog.length,
    learned: s.learned ?? [],
    // How the writer → grader gate has screened cards (counts only; dropped texts in `screened`).
    review: s.review ?? emptyReviewStats(),
    trace: s.trace ?? null,
    updatedAt: s.updatedAt ?? null,
    topicUpdated: s.topicUpdated ?? {},
    screened: s.screened ?? [],
    build: s.build ?? null,
  };
}

// ---------- exports ----------
async function serveExport(req, res) {
  const s = getState();
  if (req.url === '/export/me.json') {
    const body = JSON.stringify({ version: 1, user: userName(), exported: new Date().toISOString(), cards: s.cards.map(publicCard) }, null, 2);
    return send(res, 200, body, 'application/json', { 'Content-Disposition': 'attachment; filename="me.json"' });
  }
  if (req.url === '/export/me.md') {
    return send(res, 200, renderMarkdown(s.cards, userName()), 'text/markdown', { 'Content-Disposition': 'attachment; filename="me.md"' });
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

// Routes that work before a visitor has picked someone (public link: the welcome screen).
const NO_VIEW = new Set(['/api/state', '/api/profiles', '/api/profile', '/api/session/end', '/api/eval']);
// Before a choice, the page shows the welcome screen: demo personas or "Import your memory".
const choicePayload = (session) => ({ needsChoice: true, publicDemo: config.publicDemo, mock: config.mock, agent: config.agent, profiles: profilesFor(session), active: session.chosen ? session.profileId : null, importMaxMb: config.importMaxMb });

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const isApi = url.pathname.startsWith('/api/') || url.pathname.startsWith('/export/');
    const session = isApi ? sessionFor(req, res) : null;
    const view = session && viewFor(session);
    if (isApi && !view && !NO_VIEW.has(url.pathname) && url.pathname !== '/api/import') return send(res, 409, JSON.stringify({ error: 'Pick a demo or import your memory first.' }));
    if (url.pathname.startsWith('/export/')) {
      if ((await runIn(view, () => serveExport(req, res))) !== false) return;
    }
    // Voice: raw PCM16 mono 24 kHz in, transcript and its meaning out.
    if (url.pathname === '/api/voice' && req.method === 'POST') {
      if (rateLimited(req)) return send(res, 429, JSON.stringify({ error: 'Slow down a little and try again in a minute.' }));
      const pcm = await readRaw(req, 1_000_000);
      const transcript = await transcribe(pcm);
      return send(res, 200, JSON.stringify({ transcript, ...interpret(transcript) }));
    }
    if (url.pathname === '/api/import' && req.method === 'POST') {
      if (rateLimited(req)) return send(res, 429, JSON.stringify({ error: 'Slow down a little and try again in a minute.' }));
      return send(res, 200, JSON.stringify(await runIn(view, () => importRoute(req, url, session))));
    }
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'POST' && rateLimited(req)) return send(res, 429, JSON.stringify({ error: 'Slow down a little and try again in a minute.' }));
      if (url.pathname === '/api/state' && !view) return send(res, 200, JSON.stringify(choicePayload(session)));
      for (const r of routes) {
        const m = r.method === req.method && url.pathname.match(r.re);
        if (!m) continue;
        const body = req.method === 'POST' ? await readBody(req) : {};
        let out = await runIn(view, () => r.fn(body, m.groups ?? {}, { session, req, res }));
        // A browser that hasn't picked who it is yet lands on the Select user page.
        if (url.pathname === '/api/state' && !session.chosen) out = { ...out, ...choicePayload(session) };
        return send(res, 200, JSON.stringify(out));
      }
      return send(res, 404, JSON.stringify({ error: 'not found' }));
    }
    // The pitch deck, at a link only the slides and the presenter know.
    if (url.pathname === '/slides') {
      const deck = await readFile(join(ROOT, 'docs', 'decks', 'pitch.html')).catch(() => null);
      return deck ? send(res, 200, deck, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' }) : send(res, 404, 'not found', 'text/plain');
    }
    // static files
    const path = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
    const file = join(PUBLIC, path);
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'forbidden', 'text/plain');
    const data = await readFile(file).catch(() => null);
    if (!data) return send(res, 404, 'not found', 'text/plain');
    // Always check for a newer version, so a redeploy never leaves someone on an old app.
  send(res, 200, data, TYPES[extname(file)] ?? 'application/octet-stream', { 'Cache-Control': 'no-cache' });
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

async function readRaw(req, limit, tooBig = 'audio too long') {
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw httpError(413, tooBig);
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
