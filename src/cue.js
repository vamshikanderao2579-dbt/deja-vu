import { config, todayMs } from './config.js';

const DAY = 24 * 60 * 60 * 1000;
const STALE_DAYS = 60;
const RECHECK_DAYS = 7;
const OLD_DAYS = 365;

// Why a card would be worth a quick check, or null if it's fine as is.
export function checkReason(card, now = todayMs()) {
  if (card.status === 'pending') return 'sensitive';
  if (card.status === 'inferred' && card.changed_from) return 'changed';
  if (card.status === 'inferred' && card.last_seen && now - Date.parse(card.last_seen) > OLD_DAYS * DAY) return 'old';
  if (card.status === 'inferred' && card.confidence < 0.85) return 'guessed';
  if (card.status === 'confirmed' && card.last_confirmed && now - Date.parse(card.last_confirmed) > STALE_DAYS * DAY) return 'stale';
  return null;
}

const PRIORITY = { changed: 0, sensitive: 1, old: 2, guessed: 3, stale: 4 };

// The "don't nag" rule. A cue is shown only when all of these hold:
//  1. a relevant card is about to shape the answer and needs a check,
//  2. the stakes are high (a booking, order, plan),
//  3. no cue was shown in this conversation or within the cooldown,
//  4. this card wasn't asked about in the last week.
// `now` is the demo date (for card age); `clock` is real time (for the cooldown).
export function decideCue({ relevant, stakes, conversationId, cueLog, now = todayMs(), clock = Date.now() }) {
  if (stakes !== 'high') return null;
  if (cueLog.some((e) => e.conversationId === conversationId)) return null;
  const last = cueLog.at(-1);
  if (last && clock - Date.parse(last.at) < config.cueCooldownHours * 60 * 60 * 1000) return null;

  const candidates = relevant
    .map((card) => ({ card, reason: checkReason(card, now) }))
    .filter(({ card, reason }) => reason && !cueLog.some((e) => e.cardId === card.id && clock - Date.parse(e.at) < RECHECK_DAYS * DAY))
    .sort((a, b) => PRIORITY[a.reason] - PRIORITY[b.reason] || a.card.confidence - b.card.confidence);

  if (!candidates.length) return null;
  const { card, reason } = candidates[0];
  return { cardId: card.id, reason, question: questionFor(card, reason) };
}

function questionFor(card, reason) {
  switch (reason) {
    case 'sensitive':
      return 'This seems relevant, but I won’t use it unless you say so. Should I factor it in?';
    case 'changed':
      return `Quick check: you used to say “${card.changed_from}”. Is this the new normal?`;
    case 'old': {
      const when = new Date(card.last_seen).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      return `You last mentioned this in ${when}. Still true?`;
    }
    case 'stale':
      return 'It’s been a while. Still true?';
    default:
      return 'Quick check before I answer. Still true?';
  }
}

// Implicit signals: a thumbs-up on an answer nudges the cards it used up,
// a "not quite" nudges them down. Good answers make future cues rarer.
export function applyFeedback(cards, cardIds, positive) {
  for (const c of cards) {
    if (!cardIds.includes(c.id) || c.status === 'pending') continue;
    c.confidence = Math.max(0.1, Math.min(0.95, c.confidence + (positive ? 0.1 : -0.2)));
    c.last_used = new Date().toISOString();
  }
}
