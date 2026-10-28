import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT, todayString } from './config.js';
import { complete, parseJson } from './llm.js';
import { DISTILL_SYSTEM, RELEVANCE_SYSTEM, HISTORY_HEADER, SUMMARY_SYSTEM, SUMMARY_HEADER, UPDATE_SYSTEM, answerSystem } from './prompts.js';
import { mergeCards, renderContext, estimateTokens, usable } from './cards.js';
import { history, historyAsText, messageTime } from './store.js';

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

function batches(convs) {
  const out = [];
  let cur = [], size = 0;
  for (const c of convs) {
    const text = convForPrompt(c);
    if (cur.length && size + text.length > CHUNK_CHARS) { out.push(cur); cur = []; size = 0; }
    cur.push(text);
    size += text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

// Build cards from chat history, a few conversations at a time. Each call sees
// the cards so far, so it updates them instead of starting over.
export async function distill(existing, rejected = []) {
  if (config.mock) {
    const fixture = JSON.parse(readFileSync(join(ROOT, 'data', 'fixture-cards.json'), 'utf8'));
    return { cards: stampDates(mergeCards(existing, fixture.cards, rejected)), calls: 0, usage: null };
  }
  let cards = existing;
  let calls = 0;
  const usage = { prompt_tokens: 0, completion_tokens: 0 };
  for (const batch of batches(history.conversations)) {
    const existingText = cards.map((c) => `${c.id} [${c.category}] ${c.text}`).join('\n') || '(none yet)';
    const convText = batch.join('\n\n');
    const res = await complete(
      'bg',
      [
        { role: 'system', content: DISTILL_SYSTEM },
        { role: 'user', content: `EXISTING cards:\n${existingText}\n\nNEW conversations:\n${convText}` },
      ],
      { json: true, maxTokens: 6000, reasoning: 'low' }
    );
    calls++;
    if (res.usage) {
      usage.prompt_tokens += res.usage.prompt_tokens ?? 0;
      usage.completion_tokens += res.usage.completion_tokens ?? 0;
    }
    cards = mergeCards(cards, parseJson(res.text).cards ?? [], rejected);
  }
  return { cards: stampDates(cards), calls, usage };
}

// When each card was first and last mentioned, from its source messages.
function stampDates(cards) {
  for (const c of cards) {
    const times = (c.sources ?? []).map(messageTime).filter(Boolean).sort();
    if (!times.length) continue;
    c.first_seen = times[0];
    c.last_seen = times.at(-1);
  }
  return cards;
}

// Which cards matter for this request, and how costly a wrong guess would be.
export async function selectRelevant(message, cards) {
  // Cards about the agent itself (its name, avatar) aren't about the user.
  const candidates = cards.filter((c) => c.category !== 'assistant' && !/\b(avatar|pikachu|charmander)\b/i.test(c.text));
  if (config.mock) return mockRelevance(message, candidates);
  const index = candidates.map((c) => `${c.id}: ${c.text}`).join('\n');
  const res = await complete(
    'bg',
    [
      { role: 'system', content: RELEVANCE_SYSTEM },
      { role: 'user', content: `Today: ${todayString()}\nRequest: ${message}\n\nCards:\n${index}` },
    ],
    { json: true, maxTokens: 3000, reasoning: 'minimal' }
  );
  let out;
  try {
    out = parseJson(res.text);
  } catch {
    // A malformed reply shouldn't break the chat: answer without cards this time.
    console.warn('[agent] relevance reply was not JSON; answering without cards');
    return { relevant: [], stakes: 'low' };
  }
  const ids = new Set(out.relevant_card_ids ?? []);
  // Style cards (how the user wants answers) are tiny and apply to everything.
  for (const c of candidates) if (c.category === 'style') ids.add(c.id);
  // Only the cards that would most change this answer may trigger a quick check.
  const key = new Set((out.key_card_ids ?? []).filter((id) => ids.has(id)));
  return { relevant: candidates.filter((c) => ids.has(c.id)), key: candidates.filter((c) => key.has(c.id)), stakes: out.stakes === 'high' ? 'high' : 'low' };
}

// "My Travel preference X has changed. Now I'd like Y" → a new card text.
export async function rewriteCard(category, oldText, message) {
  if (config.mock) {
    const words = message.replace(/^.*?(now i'?d like|now i prefer|now)\s*/i, '').trim().split(/\s+/).slice(0, 12).join(' ');
    return words ? { text: words.charAt(0).toUpperCase() + words.slice(1), type: 'preference' } : null;
  }
  const res = await complete('bg', [
    { role: 'system', content: UPDATE_SYSTEM },
    { role: 'user', content: `Category: ${category}\nOld card: ${oldText}\nUser's message: ${message}` },
  ], { json: true, maxTokens: 1500, reasoning: 'minimal' });
  const out = parseJson(res.text);
  return out.text ? { text: out.text, type: out.type === 'lesson' ? 'lesson' : 'preference' } : null;
}

// Learns from one live conversation as it happens: same extraction prompt,
// just the new exchange. Returns the merged cards and the ones that are new.
export async function learnFrom(conv, existing, rejected = []) {
  if (config.mock) return { cards: existing, added: [] };
  const existingText = existing.map((c) => `${c.id} [${c.category}] ${c.text}`).join('\n') || '(none yet)';
  const res = await complete('bg', [
    { role: 'system', content: DISTILL_SYSTEM + '\n\nOnly return cards that are new or changed by these NEW messages. Return {"cards":[]} if nothing lasting was said.' },
    // Neutral labels (n1, n2…) instead of ids and clock times, so the same chat always
    // produces the same request (and a recorded demo replays exactly).
    { role: 'user', content: `EXISTING cards:\n${existingText}\n\nNEW conversation:\n${conv.messages.map((m, i) => `[n${i + 1}] ${m.role}: ${m.text}`).join('\n')}` },
  ], { json: true, maxTokens: 3000, reasoning: 'minimal' });
  let incoming = [];
  try { incoming = parseJson(res.text).cards ?? []; } catch { return { cards: existing, added: [] }; }
  const realId = (ref) => conv.messages[Number(String(ref).replace(/\D/g, '')) - 1]?.id ?? ref;
  incoming = incoming.map((c) => ({ ...c, sources: (c.sources ?? []).map(realId) }));
  const before = new Map(existing.map((c) => [c.id, c.text]));
  const cards = stampDates(mergeCards(existing, incoming, rejected));
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
    { role: 'system', content: SUMMARY_SYSTEM },
    { role: 'user', content: historyAsText() },
  ], { maxTokens: 4000, reasoning: 'low' });
  return res.text.trim();
}

// mode: "cards" (bounded, relevant cards only), "summary" (a memory summary, every message),
// "full" (entire history), "none" (no memory)
export async function answer(message, mode, relevantCards, { summary, recent = [] } = {}) {
  const today = todayString();
  let context = '';
  if (mode === 'cards') context = renderContext(relevantCards.filter(usable));
  if (mode === 'full') context = `${HISTORY_HEADER}\n${historyAsText()}`;
  if (mode === 'summary') context = `${SUMMARY_HEADER}\n${summary}`;

  const contextTokens = estimateTokens(context);
  if (config.mock) {
    return { text: mockAnswer(message, mode, relevantCards.filter(usable)), contextTokens, usage: null };
  }
  const messages = [
    { role: 'system', content: answerSystem(config.userName, today, config.agent.name) + (context ? `\n\n${context}` : '') },
    // Earlier turns of this conversation, so "near the hotel" knows which hotel.
    ...recent.slice(-6).map((m) => ({ role: m.role, content: m.text })),
    { role: 'user', content: message },
  ];
  const res = await complete('main', messages, { maxTokens: 2000, temperature: 0.4, reasoning: 'low' });
  return { text: res.text.trim(), contextTokens, usage: res.usage };
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
