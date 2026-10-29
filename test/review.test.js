// The writer → grader gate: code rules and the grader's verdicts. No network:
// the grader is a stand-in function.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MAIN_API_KEY = '';
const { ruleCheck, reviewCards, addReviewStats, emptyReviewStats } = await import('../src/review.js');
const { config } = await import('../src/config.js');

const messages = new Map([
  ['m1', { role: 'user', text: 'We only do direct flights now, layovers with the kids are a nightmare' }],
  ['m2', { role: 'assistant', text: 'You seem like a very anxious traveler.' }],
  ['m3', { role: 'user', text: 'My H1B renewal is next month' }],
]);
const card = (over = {}) => ({ category: 'travel', type: 'preference', text: 'Books direct flights only when traveling with kids', sources: ['m1'], ...over });

test('rules: a card the user said passes', () => {
  assert.ok(ruleCheck(card(), messages).card);
});

test('rules: needs a cited message the user wrote', () => {
  assert.equal(ruleCheck(card({ sources: ['m2'] }), messages).reason, 'no_user_source');
  assert.equal(ruleCheck(card({ sources: ['nope'] }), messages).reason, 'no_user_source');
});

test('rules: labels about who someone is are dropped', () => {
  assert.equal(ruleCheck(card({ text: 'Is very anxious about travel', sources: ['m1'] }), messages).reason, 'trait');
});

test('rules: cards about the agent and overlong cards are dropped', () => {
  assert.equal(ruleCheck(card({ text: 'Wants the avatar to be a star' }), messages).reason, 'about_agent');
  assert.equal(ruleCheck(card({ text: Array(20).fill('word').join(' ') }), messages).reason, 'too_long');
});

test('rules: sensitive topics are always locked, even if the writer missed it', () => {
  const r = ruleCheck(card({ category: 'work', text: 'H1B visa renewal due next month', sources: ['m3'], sensitive: false }), messages);
  assert.equal(r.card.sensitive, true);
});

test('review: grader verdicts decide what is kept; dropped sensitive text is hidden', async () => {
  const was = config.mock;
  config.mock = false;
  try {
    const incoming = [card(), card({ text: 'Prefers aisle seats', sources: ['m1'] }), card({ category: 'work', text: 'Visa renewal next month', sources: ['m3'] }), card({ sources: ['m2'] })];
    const grade = async (cs) => cs.map((c) => (c.text === 'Prefers aisle seats' ? { verdict: 'reject', reason: 'unsupported' } : c.category === 'work' ? { verdict: 'reject', reason: 'one_off' } : { verdict: 'accept' }));
    const { kept, stats, dropped } = await reviewCards(incoming, { messages, grade });
    assert.deepEqual(kept.map((c) => c.text), ['Books direct flights only when traveling with kids']);
    assert.equal(stats.proposed, 4);
    assert.deepEqual(stats.byRules, { no_user_source: 1 });
    assert.deepEqual(stats.byGrader, { unsupported: 1, one_off: 1 });
    assert.ok(dropped.some((d) => d.text === '🔒 sensitive card'));
    assert.ok(!dropped.some((d) => /visa/i.test(d.text)));
  } finally { config.mock = was; }
});

test('review: "lock" keeps the card but locks it', async () => {
  const was = config.mock;
  config.mock = false;
  try {
    const { kept, stats } = await reviewCards([card()], { messages, grade: async () => [{ verdict: 'lock' }] });
    assert.equal(kept[0].sensitive, true);
    assert.equal(stats.locked, 1);
  } finally { config.mock = was; }
});

test('review: a failing grader never blocks learning', async () => {
  const was = config.mock;
  config.mock = false;
  try {
    const { kept, stats } = await reviewCards([card()], { messages, grade: async () => { throw new Error('down'); } });
    assert.equal(kept.length, 1);
    assert.equal(stats.graderErrors, 1);
  } finally { config.mock = was; }
});

test('review: stats add up across runs', () => {
  const a = { ...emptyReviewStats(), proposed: 3, kept: 2, byRules: { trait: 1 } };
  const b = { ...emptyReviewStats(), proposed: 2, kept: 1, byRules: { trait: 1 }, byGrader: { duplicate: 1 } };
  const t = addReviewStats(addReviewStats(undefined, a), b);
  assert.equal(t.proposed, 5);
  assert.deepEqual(t.byRules, { trait: 2 });
  assert.deepEqual(t.byGrader, { duplicate: 1 });
});
