import { config, todayMs } from '../platform/config.js';

const DAY = 24 * 60 * 60 * 1000;
const STALE_DAYS = 180; // confirmed cards are left alone for six months
const RECHECK_DAYS = 7;
const OLD_DAYS = 365;

// Why a card would be worth a quick check, or null if it's fine as is.
export function checkReason(card, now = todayMs()) {
  if (card.until && new Date(now).toISOString().slice(0, 10) >= card.until) return 'ended';
  if (card.status === 'pending') return 'sensitive';
  if (card.status === 'inferred' && card.changed_from) return 'changed';
  if (card.status === 'inferred' && card.last_seen && now - Date.parse(card.last_seen) > OLD_DAYS * DAY) return 'old';
  if (card.status === 'inferred' && card.confidence < 0.85) return 'guessed';
  if (card.status === 'confirmed' && card.last_confirmed && now - Date.parse(card.last_confirmed) > STALE_DAYS * DAY) return 'stale';
  return null;
}

// Ask about what most likely changes this answer first. Locked (sensitive) cards
// come last: they're often only loosely related, and asking about them is personal.
const PRIORITY = { ended: 0, changed: 0, old: 1, guessed: 2, stale: 3, sensitive: 4 };

// The "don't nag" rule. A cue is shown only when all of these hold:
//  1. a relevant card is about to shape the answer and needs a check,
//  2. the stakes are high (a booking, order, plan),
//  3. no cue was shown in this conversation or within the cooldown,
//  4. this card wasn't asked about in the last week.
// `now` is the demo date (for card age); `clock` is real time (for the cooldown).
export function decideCue(args) {
  return cueDecision(args).cue;
}

// The same rule, plus why it stayed quiet (for the agent trace): low_stakes,
// asked_this_chat, cooldown, recently_asked or nothing_to_check.
export function cueDecision({ relevant, stakes, conversationId, cueLog, now = todayMs(), clock = Date.now() }) {
  if (stakes !== 'high') return { cue: null, why: 'low_stakes' };
  if (cueLog.some((e) => e.conversationId === conversationId)) return { cue: null, why: 'asked_this_chat' };
  const last = cueLog.at(-1);
  if (last && clock - Date.parse(last.at) < config.cueCooldownHours * 60 * 60 * 1000) return { cue: null, why: 'cooldown' };

  const needing = relevant.map((card) => ({ card, reason: checkReason(card, now) })).filter(({ reason }) => reason);
  const candidates = needing
    .filter(({ card }) => !cueLog.some((e) => e.cardId === card.id && clock - Date.parse(e.at) < RECHECK_DAYS * DAY))
    .sort((a, b) => PRIORITY[a.reason] - PRIORITY[b.reason] || a.card.confidence - b.card.confidence);

  if (!candidates.length) return { cue: null, why: needing.length ? 'recently_asked' : 'nothing_to_check' };
  const { card, reason } = candidates[0];
  return { cue: { cardId: card.id, reason, question: questionFor(card, reason) }, why: 'asked' };
}

// Answer first, check after: carrying on without ✕ counts as a quiet yes. It raises a
// guess's confidence but never confirms it: no promotion by repetition. Only a ✓ or
// the person saying it confirms a card.
export function implicitYes(card) {
  card.implicit_yes = (card.implicit_yes ?? 0) + 1;
  card.confidence = Math.min(0.9, (card.confidence ?? 0.6) + 0.1);
}

function questionFor(card, reason) {
  switch (reason) {
    case 'ended':
      return 'This was only for a while, and its end date has come. Still going?';
    case 'sensitive':
      return 'Went with this private detail. Still right?';
    case 'changed':
      return `Went with the new one (you used to say “${card.changed_from}”). Still right?`;
    case 'old': {
      const when = new Date(card.last_seen).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      return `Went with this, from ${when}. Still true?`;
    }
    case 'stale':
      return 'Went with this. It’s been a while: still true?';
    default:
      return 'Went with my guess. Still true?';
  }
}

// Implicit signals: a thumbs-up on an answer nudges the cards it used up,
// a "not quite" nudges them down. Good answers make future cues rarer.
// A thumbs-up confirms the guessed cards the answer used, quietly: they won't be
// asked about again. "Not quite" lowers confidence so they get checked next time.
export function applyFeedback(cards, cardIds, positive) {
  const now = new Date().toISOString();
  for (const c of cards) {
    if (!cardIds.includes(c.id) || c.status === 'pending') continue;
    if (positive) Object.assign(c, { status: 'confirmed', confidence: 1, last_confirmed: now });
    else c.confidence = Math.max(0.1, c.confidence - 0.3);
    c.last_used = now;
  }
}
