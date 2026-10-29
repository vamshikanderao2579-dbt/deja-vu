import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT, todayString } from '../platform/config.js';
import { complete, parseJson } from '../platform/llm.js';
import { prompt } from '../prompts/index.js';
import { ACTION_TOOLS, toDraft } from './actions.js';
import { mergeCards, renderContext, estimateTokens, usable, seasonState } from './cards.js';
import { todayMs } from '../platform/config.js';
import { history, historyAsText, messageTime } from '../platform/store.js';
import { reviewCards, addReviewStats, emptyReviewStats } from './review.js';
import { guardHistory } from './guard.js';

// Conversations are batched up to this many characters per extraction call, so
// memory builds incrementally and each call stays small.
const CHUNK_CHARS = 24000;
// Agent replies are long; the user's own words carry the preferences.
const MAX_ASSISTANT_CHARS = 400;

const convForPrompt = (c) =>
  `## ${c.date} ${c.time ?? ''}: ${c.title}\n` +
  c.messages
    .map((m) => `[${m.id}] ${m.role}: ${m.role === 'assistant' && m.text.length > MAX_ASSISTANT_CHARS ? m.text.slice(0, MAX_ASSISTANT_CHARS) + '…' : m.text}`)
    .join('\n');

// Each batch keeps its conversations too, so the review can check what cards cite.
export function batches(convs) {
  const out = [];
  let cur = { texts: [], convs: [] }, size = 0;
  for (const c of convs) {
    const text = convForPrompt(c);
    if (cur.texts.length && size + text.length > CHUNK_CHARS) { out.push(cur); cur = { texts: [], convs: [] }; size = 0; }
    cur.texts.push(text);
    cur.convs.push(c);
    size += text.length;
  }
  if (cur.texts.length) out.push(cur);
  return out;
}

export const messageMap = (convs) => new Map(convs.flatMap((c) => c.messages.map((m) => [m.id, m])));

// Build cards from chat history, a few conversations at a time. Each call sees
// the cards so far, so it updates them instead of starting over.
export async function distill(existing, rejected = []) {
  if (config.mock) {
    const fixture = JSON.parse(readFileSync(join(ROOT, 'data', 'fixture-cards.json'), 'utf8'));
    return { cards: stampDates(mergeCards(existing, fixture.cards, rejected)), calls: 0, usage: null, review: emptyReviewStats(), dropped: [] };
  }
  let cards = existing;
  let calls = 0;
  let review = emptyReviewStats();
  const dropped = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0 };
  for (const batch of batches(history.conversations)) {
    const existingText = (cards.length ? `TREE: ${treeLine(cards)}\n` : '') + (cards.map((c) => `${c.id} [${c.category}${c.sub ? '/' + c.sub : ''}] ${c.text}`).join('\n') || '(none yet)');
    const convText = batch.texts.join('\n\n');
    const res = await complete(
      'bg',
      [
        { role: 'system', content: prompt('distill.system') },
        { role: 'user', content: prompt('distill.user', { existing: existingText, conversations: convText }) },
      ],
      { json: true, maxTokens: 6000, reasoning: 'low' }
    );
    calls++;
    if (res.usage) {
      usage.prompt_tokens += res.usage.prompt_tokens ?? 0;
      usage.completion_tokens += res.usage.completion_tokens ?? 0;
    }
    // Writer proposes, reviewer disposes: only cards that pass the rules and the grader merge.
    const checked = await reviewCards(parseJson(res.text).cards ?? [], { existing: cards, messages: messageMap(batch.convs) });
    review = addReviewStats(review, checked.stats);
    dropped.push(...checked.dropped);
    cards = mergeCards(cards, checked.kept, rejected);
  }
  return { cards: stampDates(cards), calls, usage, review, dropped };
}

// When each card was first and last mentioned, from its source messages.
export function stampDates(cards) {
  for (const c of cards) {
    const times = (c.sources ?? []).map(messageTime).filter(Boolean).sort();
    if (!times.length) continue;
    c.first_seen = times[0];
    c.last_seen = times.at(-1);
  }
  return cards;
}

// ---------- relevance cache, by topic ----------
// A request like one answered recently (the redo after a ✕, "lunch near the hotel"
// twice) reuses that pick: the same cards if they still exist, plus any newer card in
// the same topics, so a change you just made is included. Saves a model call (~3-6 s).
const RELEVANCE_TTL_MS = 30 * 60 * 1000;
const STOP = new Set('the and for with our you your can please find get some any this that what who are was now just from near about into have has had will would like want need me my us we it its'.split(' '));
const intent = (msg) => new Set(msg.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const overlap = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n / (Math.max(a.size, b.size) || 1); };
const relevanceCache = [];
export const relevanceStats = { hits: 0, misses: 0 };

function cachedPick(message, pool) {
  if (process.env.RELEVANCE_CACHE === 'off') return null;
  const words = intent(message);
  const now = Date.now();
  const hit = relevanceCache.find((e) => now - e.at < RELEVANCE_TTL_MS && overlap(words, e.words) >= 0.75);
  if (!hit) return null;
  const ids = new Set(hit.ids);
  const newer = (c) => hit.categories.has(c.category) && Date.parse(c.created ?? 0) > hit.at;
  const relevant = pool.filter((c) => ids.has(c.id) || newer(c) || c.category === 'style');
  return { relevant, key: pool.filter((c) => hit.key.includes(c.id) || newer(c)), stakes: hit.stakes, cached: true };
}
function rememberPick(message, result) {
  relevanceCache.unshift({ words: intent(message), at: Date.now(), ids: result.relevant.map((c) => c.id), key: result.key.map((c) => c.id), categories: new Set(result.relevant.filter((c) => c.category !== 'style').map((c) => c.category)), stakes: result.stakes });
  relevanceCache.length = Math.min(relevanceCache.length, 50);
}

// Which cards matter for this request, and how costly a wrong guess would be.
export async function selectRelevant(message, cards) {
  // Cards about the agent itself (its name, avatar) aren't about the user.
  const candidates = cards.filter((c) => c.category !== 'assistant' && !/\b(avatar|pikachu|charmander)\b/i.test(c.text) && seasonState(c, todayMs())?.active !== false);
  if (config.mock) return mockRelevance(message, candidates);
  const cached = cachedPick(message, candidates);
  if (cached) { relevanceStats.hits++; return cached; }
  relevanceStats.misses++;
  const result = await pickRelevant(message, candidates);
  if (!result.failed) rememberPick(message, result);
  return result;
}

async function pickRelevant(message, candidates) {
  // Large memories: pick branches of the tree first (names only), then only their cards.
  let pool = candidates;
  if (candidates.length > TREE_FIRST_OVER) {
    const res = await complete('bg', [
      { role: 'system', content: prompt('branch.system') },
      { role: 'user', content: prompt('branch.user', { today: todayString(), request: message, tree: treeLine(candidates) }) },
    ], { json: true, maxTokens: 1500, reasoning: 'minimal' });
    try {
      const picked = new Set((parseJson(res.text).branches ?? []).map((b) => String(b).toLowerCase()));
      const narrowed = candidates.filter((c) => c.category === 'style' || picked.has(c.category) || (c.sub && picked.has(`${c.category}/${c.sub}`.toLowerCase())));
      if (narrowed.length) pool = narrowed;
    } catch {}
  }
  const index = pool.map((c) => `${c.id}: ${c.text}`).join('\n');
  const res = await complete(
    'bg',
    [
      { role: 'system', content: prompt('relevance.system') },
      { role: 'user', content: prompt('relevance.user', { today: todayString(), request: message, cards: index }) },
    ],
    { json: true, maxTokens: 3000, reasoning: 'minimal' }
  );
  let out;
  try {
    out = parseJson(res.text);
  } catch {
    // A malformed reply shouldn't break the chat: answer without cards this time.
    console.warn('[agent] relevance reply was not JSON; answering without cards');
    return { relevant: [], key: [], stakes: 'low', failed: true };
  }
  const ids = new Set(out.relevant_card_ids ?? []);
  // Style cards (how the user wants answers) are tiny and apply to everything.
  for (const c of pool) if (c.category === 'style') ids.add(c.id);
  // Only the cards that would most change this answer may trigger a quick check.
  const key = new Set((out.key_card_ids ?? []).filter((id) => ids.has(id)));
  return { relevant: pool.filter((c) => ids.has(c.id)), key: pool.filter((c) => key.has(c.id)), stakes: out.stakes === 'high' ? 'high' : 'low' };
}

// "My Travel preference X has changed. Now I'd like Y" → a new card text.
export async function rewriteCard(category, oldText, message) {
  if (config.mock) {
    const words = message.replace(/^.*?(now i'?d like|now i prefer|now)\s*/i, '').trim().split(/\s+/).slice(0, 12).join(' ');
    return words ? { text: words.charAt(0).toUpperCase() + words.slice(1), type: 'preference' } : null;
  }
  const res = await complete('bg', [
    { role: 'system', content: prompt('update.system') },
    { role: 'user', content: prompt('update.user', { category, oldCard: oldText, message }) },
  ], { json: true, maxTokens: 1500, reasoning: 'minimal' });
  const out = parseJson(res.text);
  return out.text ? { text: out.text, type: out.type === 'lesson' ? 'lesson' : 'preference' } : null;
}

// The memory tree as one line: "food (6) · seasonal: Thanksgiving (2), Christmas (2) · …"
// Budgets cap memory at 80 cards, so one relevance call over the whole index is small
// (~1K tokens) and saves a round trip. Branch-first picking is kept for larger memories.
const TREE_FIRST_OVER = 120;
export function treeLine(cards) {
  const t = {};
  for (const c of cards) { (t[c.category] ??= {})[c.sub ?? ''] = ((t[c.category] ??= {})[c.sub ?? ''] ?? 0) + 1; }
  return Object.entries(t).map(([cat, subs]) => {
    const named = Object.entries(subs).filter(([s]) => s);
    return named.length ? `${cat}: ${named.map(([s, n]) => `${s} (${n})`).join(', ')}` : `${cat} (${subs['']})`;
  }).join(' · ');
}

// Learns from one live conversation as it happens: same extraction prompt,
// just the new exchange. Returns the merged cards and the ones that are new.
export async function learnFrom(conv, existing, rejected = []) {
  const { kept, review, dropped } = await proposeFrom(conv, existing);
  return { ...applyLearned(existing, kept, rejected), review, dropped };
}

// Step 1 (slow, background): the writer proposes cards, the gate screens them.
export async function proposeFrom(rawConv, existing) {
  if (config.mock) return { kept: [], review: emptyReviewStats(), dropped: [] };
  // Same step 0 as a full build: steering text skipped, secrets removed, before the model reads it.
  const conv = guardHistory([rawConv]).convs[0];
  const existingText = (existing.length ? `TREE: ${treeLine(existing)}\n` : '') + (existing.map((c) => `${c.id} [${c.category}${c.sub ? '/' + c.sub : ''}] ${c.text}`).join('\n') || '(none yet)');
  const res = await complete('bg', [
    { role: 'system', content: prompt('distill.system') + '\n\n' + prompt('learn.system-addendum') + '\n\n' + prompt('build.rules') },
    // Neutral labels (n1, n2…) instead of ids and clock times, so the same chat always
    // produces the same request (and a recorded demo replays exactly).
    { role: 'user', content: prompt('learn.user', { existing: existingText, conversation: conv.messages.map((m, i) => `[n${i + 1}] ${m.role}: ${m.text}`).join('\n') }) },
  ], { json: true, maxTokens: 3000, reasoning: 'minimal' });
  let incoming = [];
  try { incoming = parseJson(res.text).cards ?? []; } catch { return { kept: [], review: emptyReviewStats(), dropped: [] }; }
  const realId = (ref) => conv.messages[Number(String(ref).replace(/\D/g, '')) - 1]?.id ?? ref;
  incoming = incoming.map((c) => ({ ...c, sources: (c.sources ?? []).map(realId) }));
  const { kept, stats: review, dropped } = await reviewCards(incoming, { existing, messages: messageMap([conv]) });
  return { kept, review, dropped };
}

// Step 2 (instant): merge screened cards into memory as it is now, so a swipe made
// while step 1 ran is kept.
export function applyLearned(existing, kept, rejected = []) {
  const before = new Map(existing.map((c) => [c.id, c.text]));
  const cards = stampDates(mergeCards(existing, kept, rejected));
  const added = cards.filter((c) => !before.has(c.id) || before.get(c.id) !== c.text);
  // They just said it themselves, so a change stated in chat counts as confirmed.
  const now = new Date().toISOString();
  for (const c of added) {
    if (c.changed_from && c.status !== 'pending') {
      Object.assign(c, { status: 'confirmed', confidence: 1, last_confirmed: now });
      delete c.changed_from;
    }
  }
  return { cards, added };
}

// The baseline memory summary: written once from the whole history.
export async function summarizeHistory() {
  const res = await complete('main', [
    { role: 'system', content: prompt('summary.system') },
    { role: 'user', content: historyAsText() },
  ], { maxTokens: 4000, reasoning: 'low' });
  return res.text.trim();
}

// mode: "cards" (bounded, relevant cards only), "summary" (a memory summary, every message),
// "full" (entire history), "none" (no memory)
// `actions`: let the answer propose a booking or order draft through a tool call (the app
// passes it for high-stakes requests; the eval leaves it off so answers stay plain text).
export async function answer(message, mode, relevantCards, { summary, recent = [], actions = false } = {}) {
  const today = todayString();
  let context = '';
  if (mode === 'cards') context = renderContext(relevantCards.filter(usable));
  if (mode === 'full') context = `${prompt('history.header')}\n${historyAsText()}`;
  if (mode === 'summary') context = `${prompt('summary.header')}\n${summary}`;

  const contextTokens = estimateTokens(context);
  if (config.mock) {
    const draft = actions && /\b(book|reserve|order)\b/i.test(message)
      ? { type: 'booking', kind: 'other', title: 'Mock draft', when: '', party: '', details: relevantCards.filter(usable).slice(0, 3).map((c) => c.text), basedOn: relevantCards.filter(usable).slice(0, 3).map((c) => c.text) }
      : null;
    return { text: mockAnswer(message, mode, relevantCards.filter(usable)), draft, contextTokens, usage: null };
  }
  const messages = [
    { role: 'system', content: prompt('answer.system', { userName: config.userName, today, agentName: config.agent.name }) + (actions ? `\n\n${prompt('answer.tools-addendum')}` : '') + (context ? `\n\n${context}` : '') },
    // Earlier turns of this conversation, so "near the hotel" knows which hotel.
    ...recent.slice(-6).map((m) => ({ role: m.role, content: m.text })),
    { role: 'user', content: message },
  ];
  const res = await complete('main', messages, { maxTokens: 2000, temperature: 0.4, reasoning: 'low', tools: actions ? ACTION_TOOLS : null });
  const draft = toDraft(res.toolCalls?.[0]);
  // A tool call can come with no text; give the draft a short lead-in.
  const text = res.text.trim() || (draft ? `Here's a draft${draft.title ? ` for ${draft.title}` : ''}, based on what I know. Want me to change anything?` : '');
  return { text, draft, contextTokens, usage: res.usage };
}

// ---------- mock mode (no API key): deterministic stand-ins for UI work ----------

const HIGH_STAKES = /\b(book|order|plan|schedule|reserve|set up|grab|find|buy|gift|flights?|vacation|trip|stay|dinner|lunch|grocery|groceries|pick)\b/i;

function mockRelevance(message, cards) {
  const m = message.toLowerCase();
  const relevant = cards.filter((c) => (c.mock_keywords ?? []).some((k) => m.includes(k)));
  return { relevant, key: relevant, stakes: HIGH_STAKES.test(message) ? 'high' : 'low' };
}

function mockAnswer(message, mode, cards) {
  const note = '(Mock answer. Add MAIN_API_KEY in .env for real Muse Spark answers.)';
  if (mode === 'none') return `Here are some general suggestions for “${message}”. I don't know your preferences yet. ${note}`;
  if (mode === 'full') return `I scanned your entire chat history to answer “${message}”. ${note}`;
  if (!cards.length) return `Here are a few options for “${message}”. ${note}`;
  return `For “${message}”, I took into account:\n${cards.map((c) => `• ${c.text}`).join('\n')}\n${note}`;
}
