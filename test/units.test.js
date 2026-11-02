// Unit tests for the memory rules: merging, budgets, swipe actions, the
// don't-nag rule and voice interpretation. No network, no API key.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MAIN_API_KEY = '';
const { mergeCards, applyCardAction, renderContext, usable } = await import('../src/engine/cards.js');
const { decideCue, checkReason } = await import('../src/engine/cue.js');
const { interpret } = await import('../src/platform/voice.js');
const { config } = await import('../src/platform/config.js');

const card = (over = {}) => ({ category: 'food', type: 'preference', text: 'Loves Thai food', confidence: 0.9, sources: ['m1'], ...over });
const NOW = Date.parse('2026-10-27T12:00:00');

test('merge: a repeated fact updates the card instead of duplicating it', () => {
  const a = mergeCards([], [card()]);
  const b = mergeCards(a, [card({ text: 'Loves Thai food a lot', sources: ['m2'] })]);
  assert.equal(b.length, 1);
  assert.deepEqual(b[0].sources.sort(), ['m1', 'm2']);
});

test('merge: sensitive facts start unconfirmed (pending) and are still used', () => {
  const [c] = mergeCards([], [card({ category: 'health', text: 'Lower back pain', sensitive: true })]);
  assert.equal(c.status, 'pending');
  assert.equal(usable(c), true);
});

test('merge: a card the user removed is not brought back', () => {
  const rejected = ['Loves Thai food'];
  assert.equal(mergeCards([], [card()], rejected).length, 0);
});

test('merge: a change of mind replaces the old wording and keeps it as changed_from', () => {
  const a = mergeCards([], [card({ text: 'Usual drink is an oat milk latte' })]);
  const b = mergeCards(a, [card({ text: 'Usual drink is now iced matcha', changed_from: 'Usual drink is an oat milk latte' })]);
  assert.equal(b.length, 1);
  assert.equal(b[0].text, 'Usual drink is now iced matcha');
  assert.equal(b[0].changed_from, 'Usual drink is an oat milk latte');
});

test('budget: cards are capped per topic, words per card are capped', () => {
  const many = Array.from({ length: 15 }, (_, i) => card({ text: `Fact number ${i} about something unique ${'x'.repeat(i)}`, confidence: i / 20 }));
  const out = mergeCards([], many);
  assert.ok(out.length <= config.budget.maxCardsPerCategory);
  const long = mergeCards([], [card({ text: Array(30).fill('word').join(' ') })]);
  assert.ok(long[0].text.split(' ').length <= config.budget.maxWordsPerCard);
});

test('budget: confirmed cards are never trimmed', () => {
  let cards = mergeCards([], [card({ text: 'Keep me always please', confidence: 0.1 })]);
  const state = { cards, rejected: [] };
  applyCardAction(state, cards[0].id, 'confirm');
  const many = Array.from({ length: 12 }, (_, i) => card({ text: `Other fact ${i} ${'y'.repeat(i)}`, confidence: 0.95 }));
  cards = mergeCards(state.cards, many);
  assert.ok(cards.some((c) => c.text === 'Keep me always please'));
});

test('actions: confirm, edit, note and reject', () => {
  const state = { cards: mergeCards([], [card(), card({ text: 'Hates olives on pizza', sources: ['m9'] })]), rejected: [] };
  const [a, b] = state.cards;
  applyCardAction(state, a.id, 'confirm');
  assert.equal(state.cards[0].status, 'confirmed');
  applyCardAction(state, a.id, 'note', 'only on weekends');
  assert.equal(state.cards[0].note, 'only on weekends');
  applyCardAction(state, a.id, 'edit', 'Loves Thai and Mexican food');
  assert.equal(state.cards[0].text, 'Loves Thai and Mexican food');
  applyCardAction(state, b.id, 'reject');
  assert.equal(state.cards.length, 1);
  assert.deepEqual(state.rejected, ['Hates olives on pizza']);
  assert.throws(() => applyCardAction(state, a.id, 'explode'));
});

test('context: every card reaches the model; confirmed ones are marked ✓, the rest ~', () => {
  const cards = [
    { ...card(), status: 'confirmed' },
    { ...card({ text: 'Lower back pain' }), status: 'pending' },
    { ...card({ text: 'Likes tacos' }), status: 'inferred' },
  ];
  const text = renderContext(cards);
  assert.match(text, /✓ Loves Thai food/);
  assert.match(text, /~ Likes tacos/);
  assert.match(text, /~ Lower back pain/);
});

test('check reasons: changed, sensitive, old, guessed, stale, fine', () => {
  const day = 864e5;
  assert.equal(checkReason({ status: 'inferred', changed_from: 'x', confidence: 0.9 }, NOW), 'changed');
  assert.equal(checkReason({ status: 'pending' }, NOW), 'sensitive');
  assert.equal(checkReason({ status: 'inferred', confidence: 0.9, last_seen: new Date(NOW - 400 * day).toISOString() }, NOW), 'old');
  assert.equal(checkReason({ status: 'inferred', confidence: 0.6, last_seen: new Date(NOW - 10 * day).toISOString() }, NOW), 'guessed');
  assert.equal(checkReason({ status: 'confirmed', last_confirmed: new Date(NOW - 200 * day).toISOString() }, NOW), 'stale');
  assert.equal(checkReason({ status: 'confirmed', last_confirmed: new Date(NOW - 90 * day).toISOString() }, NOW), null, 'confirmed cards are left alone for 6 months');
  assert.equal(checkReason({ status: 'confirmed', last_confirmed: new Date(NOW - 5 * day).toISOString() }, NOW), null);
});

test("don't-nag rule: only high stakes, once per chat, respects cooldown", () => {
  const relevant = [{ id: 'food-1', status: 'inferred', confidence: 0.5, text: 'x' }];
  const clock = Date.now();
  assert.equal(decideCue({ relevant, stakes: 'low', conversationId: 'c', cueLog: [], now: NOW, clock }), null);
  const cue = decideCue({ relevant, stakes: 'high', conversationId: 'c', cueLog: [], now: NOW, clock });
  assert.equal(cue.cardId, 'food-1');
  const asked = [{ cardId: 'other', conversationId: 'c', at: new Date(clock - 48 * 36e5).toISOString() }];
  assert.equal(decideCue({ relevant, stakes: 'high', conversationId: 'c', cueLog: asked, now: NOW, clock }), null, 'once per conversation');
  const recent = [{ cardId: 'other', conversationId: 'z', at: new Date(clock - 60e3).toISOString() }];
  const cooldown = config.cueCooldownHours;
  config.cueCooldownHours = 24;
  assert.equal(decideCue({ relevant, stakes: 'high', conversationId: 'c', cueLog: recent, now: NOW, clock }), null, 'cooldown');
  config.cueCooldownHours = cooldown;
});

test("don't-nag rule: a changed card is asked about before a merely guessed one", () => {
  const relevant = [
    { id: 'a', status: 'inferred', confidence: 0.5, text: 'guess' },
    { id: 'b', status: 'inferred', confidence: 0.9, changed_from: 'old', text: 'new' },
  ];
  assert.equal(decideCue({ relevant, stakes: 'high', conversationId: 'c', cueLog: [], now: NOW, clock: Date.now() }).cardId, 'b');
});

test('voice: yes, no and corrections', () => {
  assert.deepEqual(interpret("Yes, that's still true."), { action: 'confirm' });
  assert.deepEqual(interpret('Yeah'), { action: 'confirm' });
  assert.deepEqual(interpret('Nope, not anymore..'), { action: 'reject' });
  assert.deepEqual(interpret('No'), { action: 'reject' });
  assert.deepEqual(interpret('No, I work from home on Wednesdays now..'), { action: 'edit', text: 'I work from home on Wednesdays now.' });
  assert.equal(interpret('Actually only on weekends').action, 'edit');
  assert.deepEqual(interpret(''), { action: null });
});

test('seasonal cards: awake inside their window, sleeping outside, windows wrap the year', async () => {
  const { seasonState } = await import('../src/engine/cards.js');
  const thanksgiving = { season: { start: '10-25', end: '11-30' } };
  const winter = { season: { start: '12-15', end: '01-10' } };
  assert.deepEqual(seasonState(thanksgiving, Date.parse('2026-10-27T12:00:00')), { active: true });
  assert.deepEqual(seasonState(thanksgiving, Date.parse('2026-07-01T12:00:00')), { active: false, wakes: '2026-10-25' });
  assert.equal(seasonState(winter, Date.parse('2027-01-05T12:00:00')).active, true);
  assert.equal(seasonState({}, NOW), null);
});

test('short-term: a card with an end date keeps it, shows it to the model and ends on time', async () => {
  const { untilState } = await import('../src/engine/cards.js');
  const [c] = mergeCards([], [card({ text: 'No meat (health plan)', until: '2027-04-27' }), card({ text: 'Bad date', until: 'soon' })]).filter((x) => x.text === 'No meat (health plan)');
  assert.equal(c.until, '2027-04-27');
  assert.ok(renderContext([{ ...c, status: 'confirmed' }]).includes('(until 2027-04-27)'));
  assert.equal(untilState(c, Date.parse('2027-04-26T12:00:00')).ended, false);
  assert.equal(untilState(c, Date.parse('2027-04-27T12:00:00')).endsToday, true);
  assert.equal(untilState(c, Date.parse('2027-04-28T12:00:00')).ended, true);
  assert.equal(untilState(card(), NOW), null);
  assert.equal(mergeCards([], [card({ until: 'soon' })])[0].until, undefined);
});

test('short-term: on its end date a card is worth a check; extend or keep it for good', () => {
  const c = { ...card(), id: 'food-1', status: 'confirmed', until: '2026-10-27', last_confirmed: '2026-10-01T00:00:00Z' };
  assert.equal(checkReason(c, NOW), 'ended');
  assert.equal(checkReason({ ...c, until: '2026-12-01' }, NOW), null);
  const state = { cards: [c], rejected: [] };
  applyCardAction(state, 'food-1', 'until', '2027-01-27');
  assert.equal(state.cards[0].until, '2027-01-27');
  applyCardAction(state, 'food-1', 'until', '');
  assert.equal(state.cards[0].until, undefined);
  assert.throws(() => applyCardAction(state, 'food-1', 'until', 'next year'));
});
