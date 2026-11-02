import { config } from '../platform/config.js';
import { prompt } from '../prompts/index.js';

const { maxCategories, maxCardsPerCategory, maxWordsPerCard } = config.budget;

export const estimateTokens = (text) => Math.ceil(text.length / 4);

const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));

export function similarity(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);
}

// Word overlap over the union: low means the wording really changed.
function jaccard(a, b) {
  const A = words(a), B = words(b);
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / (A.size + B.size - shared || 1);
}

function clampWords(text) {
  const parts = text.trim().split(/\s+/);
  return parts.length <= maxWordsPerCard ? text.trim() : parts.slice(0, maxWordsPerCard).join(' ');
}

function nextId(cards, category) {
  let n = 1;
  while (cards.some((c) => c.id === `${category}-${n}`)) n++;
  return `${category}-${n}`;
}

// A card the user is likely to care about most survives budget trimming.
// Confirmed cards are never trimmed.
function keepScore(card) {
  return (card.status === 'confirmed' ? 100 : 0) + card.confidence * 10 + (card.sources?.length ?? 0);
}

// Merge freshly extracted cards into the store, then enforce the budget.
// `rejected` holds texts the user swiped away, so re-extraction doesn't bring them back.
export function mergeCards(existing, incoming, rejected = [], now = new Date().toISOString()) {
  const cards = existing.map((c) => ({ ...c }));
  for (const raw of incoming) {
    if (!raw?.text || !raw?.category) continue;
    const category = String(raw.category).toLowerCase().trim();
    const text = clampWords(String(raw.text));
    if (rejected.some((r) => similarity(r, text) >= 0.6)) continue;
    const match =
      (raw.id && cards.find((c) => c.id === raw.id)) ||
      cards.find((c) => c.category === category && similarity(c.text, text) >= 0.6) ||
      (raw.changed_from && cards.find((c) => similarity(c.text, raw.changed_from) >= 0.6));

    if (match) {
      match.sources = [...new Set([...(match.sources ?? []), ...(raw.sources ?? [])])];
      match.last_seen = now;
      if (validUntil(raw.until)) match.until = raw.until;
      // A different meaning for the same card (it named the card, or said what it
      // used to be) is a change of mind, not a rewording.
      const changed = (raw.changed_from || raw.id === match.id) && jaccard(match.text, text) < 0.5;
      if (changed) {
        // The user changed their mind in chat. Even a confirmed card goes back
        // to inferred so the agent checks before relying on it.
        match.changed_from = match.text;
        match.text = text;
        match.status = raw.sensitive ? 'pending' : 'inferred';
        match.confidence = raw.confidence ?? match.confidence;
      } else if (match.status !== 'confirmed') {
        match.text = text;
        match.confidence = Math.max(match.confidence, raw.confidence ?? 0);
      }
      continue;
    }

    cards.push({
      id: nextId(cards, category),
      category,
      type: raw.type === 'lesson' ? 'lesson' : 'preference',
      text,
      status: raw.sensitive ? 'pending' : 'inferred',
      sensitive: !!raw.sensitive,
      confidence: Number(raw.confidence ?? 0.6),
      sources: raw.sources ?? [],
      ...(raw.changed_from ? { changed_from: raw.changed_from } : {}),
      ...(raw.sub ? { sub: String(raw.sub) } : {}),
      ...(raw.season?.start && raw.season?.end ? { season: raw.season } : {}),
      ...(validUntil(raw.until) ? { until: raw.until } : {}),
      ...([1, 2, 3].includes(raw.priority) ? { priority: raw.priority } : {}),
      created: now,
      last_seen: now,
      last_confirmed: null,
      ...(raw.mock_keywords ? { mock_keywords: raw.mock_keywords } : {}),
    });
  }
  return enforceBudget(cards);
}

export function enforceBudget(cards) {
  const byCat = groupByCategory(cards);
  let cats = Object.keys(byCat);

  // Too many categories: fold the smallest ones into "other".
  if (cats.length > maxCategories) {
    cats.sort((a, b) => byCat[b].length - byCat[a].length);
    for (const cat of cats.slice(maxCategories - 1)) {
      for (const c of byCat[cat]) c.category = 'other';
    }
  }

  const trimmed = [];
  for (const [, group] of Object.entries(groupByCategory(cards))) {
    group.sort((a, b) => keepScore(b) - keepScore(a));
    trimmed.push(...group.filter((c, i) => i < maxCardsPerCategory || c.status === 'confirmed'));
  }
  return trimmed;
}

// Short-term memory: a card with "until" (YYYY-MM-DD) holds only until that day
// ("no meat for 6 months"). Cards without it are long-term.
export const validUntil = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
// null for a long-term card; otherwise { until, endsToday, ended } for the given day.
export function untilState(card, nowMs = Date.now()) {
  if (!validUntil(card.until)) return null;
  const today = dayOf(nowMs);
  return { until: card.until, endsToday: today === card.until, ended: today > card.until };
}

// Seasonal cards wake up inside their window (MM-DD to MM-DD, every year) and sleep
// outside it: not sent to the model, not asked about.
export function seasonState(card, nowMs = Date.now()) {
  if (!card.season) return null;
  const d = new Date(nowMs);
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const { start, end } = card.season;
  const active = start <= end ? md >= start && md <= end : md >= start || md <= end;
  if (active) return { active: true };
  const [m, day] = start.split('-').map(Number);
  let next = new Date(d.getFullYear(), m - 1, day);
  if (next < d) next = new Date(d.getFullYear() + 1, m - 1, day);
  return { active: false, wakes: next.toISOString().slice(0, 10) };
}

export function groupByCategory(cards) {
  const out = {};
  for (const c of cards) (out[c.category] ??= []).push(c);
  return out;
}

// Every card is used: confirming is a way to own memory, never a gate in front of it.
// Unconfirmed cards (guesses, and private ones not yet approved) go in marked "~", and
// the don't-nag rule may check one once when it shapes an answer.
export const usable = (c) => c.status === 'confirmed' || c.status === 'inferred' || c.status === 'pending';

export function renderContext(cards) {
  const list = cards.filter(usable);
  if (!list.length) return '';
  const groups = groupByCategory(list);
  const body = Object.entries(groups)
    .map(([cat, cs]) => `${cat}:\n` + cs.map((c) => `- ${c.status === 'confirmed' ? '✓' : '~'} ${c.text}${c.note ? ` (note: ${c.note})` : ''}${c.until ? ` (until ${c.until})` : ''}`).join('\n'))
    .join('\n');
  return `${prompt('context.header')}\n${body}`;
}

export function renderMarkdown(cards, userName) {
  const groups = groupByCategory(cards);
  const label = { confirmed: 'confirmed', inferred: 'inferred', pending: 'needs your OK' };
  return (
    `# What my agent knows about me (${userName})\n\n` +
    Object.entries(groups)
      .map(([cat, cs]) => `## ${cat[0].toUpperCase() + cat.slice(1)}\n` + cs.map((c) => `- ${c.text}${c.note ? ` (note: ${c.note})` : ''}${c.until ? ` (until ${c.until})` : ''} _(${c.type}, ${label[c.status]})_`).join('\n'))
      .join('\n\n') +
    '\n'
  );
}

export function budgetStats(cards) {
  const groups = groupByCategory(cards);
  return {
    limits: config.budget,
    categories: Object.fromEntries(
      Object.entries(groups).map(([cat, cs]) => [cat, { cards: cs.length, tokens: estimateTokens(cs.map((c) => c.text).join('\n')) }])
    ),
    totalTokens: estimateTokens(renderContext(cards)),
  };
}

// A swipe or tap: confirm (right), reject (left), edit (up). Mutates state.
export function applyCardAction(state, id, action, text, now = new Date().toISOString()) {
  const card = state.cards.find((c) => c.id === id);
  if (!card) throw Object.assign(new Error('card not found'), { status: 404 });
  if (action === 'confirm') {
    Object.assign(card, { status: 'confirmed', confidence: 1, last_confirmed: now });
    delete card.changed_from;
  } else if (action === 'edit') {
    if (!text?.trim()) throw Object.assign(new Error('text is required'), { status: 400 });
    const next = clampWords(text);
    // Two cards corrected to the same thing become one.
    const twin = state.cards.find((c) => c.id !== id && c.category === card.category && c.text === next);
    if (twin) {
      state.cards = state.cards.filter((c) => c.id !== id);
      Object.assign(twin, { status: 'confirmed', confidence: 1, last_confirmed: now });
      return;
    }
    Object.assign(card, { text: next, status: 'confirmed', confidence: 1, last_confirmed: now, edited: true });
    delete card.changed_from;
  } else if (action === 'note') {
    // A note is the user adding nuance ("only in winter"). It also counts as a confirmation.
    if (!text?.trim()) throw Object.assign(new Error('text is required'), { status: 400 });
    Object.assign(card, { note: clampWords(text), status: 'confirmed', confidence: 1, last_confirmed: now });
    delete card.changed_from;
  } else if (action === 'until') {
    // Extend a short-term card to a new end date, or keep it for good (no date).
    if (text && !validUntil(text)) throw Object.assign(new Error('until must be YYYY-MM-DD'), { status: 400 });
    if (text) card.until = text;
    else delete card.until;
    Object.assign(card, { status: card.sensitive && card.status === 'pending' ? 'pending' : 'confirmed', confidence: 1, last_confirmed: now });
  } else if (action === 'reject') {
    state.rejected.push(card.text);
    state.cards = state.cards.filter((c) => c.id !== id);
  } else {
    throw Object.assign(new Error('action must be confirm, edit, note, until, or reject'), { status: 400 });
  }
}

export function publicCard(c) {
  const { mock_keywords, ...rest } = c;
  return rest;
}
