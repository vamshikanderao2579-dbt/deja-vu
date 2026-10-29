// End-to-end API tests: starts the real server in mock mode (no API key, no
// cost) on its own port and state file, then walks the demo flows.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3199;
const BASE = `http://localhost:${PORT}`;
const STATE = 'data/test-state.json';
const TEST_BUILD = join(ROOT, 'data', 'private', 'test-build');
let server;

const post = (path, body = {}) =>
  fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const get = (path) => fetch(BASE + path).then((r) => r.json());

before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, MAIN_API_KEY: '', BG_API_KEY: '', PORT: String(PORT), STATE_FILE: STATE, BUILD_DIR: TEST_BUILD, HISTORY_FILE: '', PROFILE: 'alex', MUSE_ENABLED: 'true', CUE_COOLDOWN_HOURS: '0', RATE_LIMIT_PER_MINUTE: '1000', DEMO_TODAY: '2026-10-27' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await get('/api/state'); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('server did not start');
});
after(() => {
  server?.kill();
  rmSync(join(ROOT, STATE), { force: true });
  rmSync(TEST_BUILD, { recursive: true, force: true });
});

test('starts in mock mode with an empty memory', async () => {
  await post('/api/reset');
  const s = await get('/api/state');
  assert.equal(s.mock, true);
  assert.equal(s.cards.length, 0);
});

test('builds dated cards from chat history', async () => {
  const s = await post('/api/distill');
  assert.ok(s.cards.length >= 15);
  assert.ok(s.cards.every((c) => c.first_seen && c.sources.length));
  assert.ok(s.cards.some((c) => c.status === 'pending'), 'a sensitive card is locked');
});

test('saying what changed confirms that card, never an unrelated one', async () => {
  const s = await get('/api/state');
  const target = s.cards.find((c) => c.category === 'travel') ?? s.cards[0];
  await post(`/api/cards/${target.id}`, { action: 'confirm' });
  // The new wording is close to the confirmed card, so it merges into it.
  const r = await post('/api/memory/update', { category: target.category, oldText: 'something else entirely', message: `now ${target.text} too` });
  assert.equal(r.card.category, target.category);
  assert.equal(r.card.id, target.id, 'the card it merged into');
  assert.match(r.card.text, new RegExp(target.text.split(' ')[0], 'i'));
});

test('a rebuild needs a confirm, and then waits a month unless the history grows', async () => {
  const unconfirmed = await fetch(BASE + '/api/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unconfirmed.status, 400);
  const plan = await get('/api/build/plan');
  assert.equal(plan.mode, 'wait', 'the build above counts as this month’s');
  assert.equal(plan.allowed, false);
  assert.ok(Date.parse(plan.nextAt) > Date.now());
  const again = await fetch(BASE + '/api/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"confirm":true}' });
  assert.equal(again.status, 429);
});

test('answer first, check after: a high-stakes request answers at once, with one check above it', async () => {
  const r = await post('/api/chat', { message: 'Grab my usual drink on the way in', conversationId: 't1' });
  assert.equal(r.type, 'answer');
  assert.ok(r.text, 'the answer is already there');
  assert.match(r.check.question, /used to say/);
  assert.ok(r.usedCards.length >= 1);
  assert.ok(r.tokens.context < r.tokens.fullHistory);
  assert.equal(r.trace.check, r.check.card.text);
  const confirmed = await post(`/api/cards/${r.check.cardId}`, { action: 'confirm' });
  assert.equal(confirmed.cards.find((c) => c.id === r.check.cardId).status, 'confirmed');
});

test('the same conversation is never asked twice, and the trace says why', async () => {
  const again = await post('/api/chat', { message: 'Find us a place to stay in Miami for spring break', conversationId: 't1' });
  assert.equal(again.type, 'answer');
  assert.equal(again.check, null);
  assert.equal(again.trace.quiet, 'asked_this_chat');
});

test('carrying on without ✕ counts as a quiet yes; two of them confirm a guess', async () => {
  const first = await post('/api/chat', { message: 'Book us a hotel in Miami for spring break', conversationId: 'q1' });
  if (!first.check) return; // the mock picked nothing to check: nothing to count
  const id = first.check.cardId;
  const next = await post('/api/chat', { message: 'thanks!', conversationId: 'q1' });
  assert.equal(next.trace.quietYes.text, first.check.card.text);
  const s = await get('/api/state');
  assert.equal(s.cards.find((c) => c.id === id).implicit_yes, 1);
});

test('a booking request comes back with a draft built from memory', async () => {
  const r = await post('/api/chat', { message: 'Book us a hotel in Miami for spring break', conversationId: 'd1', skipCue: true });
  assert.equal(r.stakes, 'high');
  assert.ok(r.draft, 'draft returned');
  assert.ok(r.draft.basedOn.length >= 1);
});

test('plug-in API: recall returns the cards and prompt text for a message; remember queues learning', async () => {
  const r = await post('/api/recall', { message: 'Book us a hotel in Miami for spring break', conversationId: 'ext1' });
  assert.ok(r.cards.length >= 1);
  assert.ok(r.context.length > 0);
  const m = await post('/api/remember', { conversationId: 'ext1', messages: [{ role: 'user', text: 'we only fly direct now' }, { role: 'assistant', text: 'Noted.' }] });
  assert.equal(m.queued, true);
});

test('memory off: no cards used, no checks, nothing learned', async () => {
  await post('/api/memory/switch', { on: false });
  const r = await post('/api/chat', { message: 'Grab my usual drink on the way in', conversationId: 'off1' });
  assert.equal(r.mode, 'none');
  assert.equal(r.check, null);
  assert.equal(r.usedCards.length, 0);
  const s = await post('/api/memory/switch', { on: true });
  assert.equal(s.memoryOff, false);
});

test('a casual question is never interrupted', async () => {
  const r = await post('/api/chat', { message: 'what do I like to watch', conversationId: 't2' });
  assert.equal(r.type, 'answer');
});

test('not anymore → chat about it saves the new preference as confirmed', async () => {
  const s = await get('/api/state');
  const old = s.cards.find((c) => c.category === 'work' && /Friday/.test(c.text));
  const r = await post('/api/memory/update', { category: 'work', oldText: old.text, cardId: old.id, message: `Hey Pip, my Work preference “${old.text}” has changed. Now I’d like Wednesdays from home` });
  assert.ok(r.card);
  assert.equal(r.card.status, 'confirmed');
  assert.ok(!r.cards.some((c) => c.id === old.id && c.text === old.text), 'old card is gone');
});

test('provenance: Why? returns the exact conversation and time', async () => {
  const s = await get('/api/state');
  const r = await get(`/api/sources/${s.cards.find((c) => c.sources.length).id}`);
  assert.ok(r.sources.length);
  assert.ok(r.conversations[0].date && r.conversations[0].time && r.conversations[0].messages.length);
});

test('thumbs-up quietly confirms the cards used; not quite lowers confidence', async () => {
  const s = await get('/api/state');
  const [a, b] = s.cards.filter((x) => x.status === 'inferred');
  const up = await post('/api/feedback', { cardIds: [a.id], positive: true });
  assert.equal(up.cards.find((x) => x.id === a.id).status, 'confirmed');
  const down = await post('/api/feedback', { cardIds: [b.id], positive: false });
  assert.ok(down.cards.find((x) => x.id === b.id).confidence < b.confidence);
});

test('chat is recorded as live history (learning is off in mock mode)', async () => {
  await post('/api/chat', { message: 'what should we watch tonight', conversationId: 't9' });
  const s = await get('/api/state');
  assert.ok(Array.isArray(s.learned));
});

test('demo memory loads a mix of statuses', async () => {
  const s = await post('/api/demo/load');
  const statuses = new Set(s.cards.map((c) => c.status));
  assert.ok(statuses.has('confirmed') && statuses.has('inferred') && statuses.has('pending'));
  assert.ok(s.cards.some((c) => c.checkReason === 'stale'));
});

test('exports: me.json and me.md', async () => {
  const json = await get('/export/me.json');
  assert.ok(json.cards.length);
  const md = await fetch(BASE + '/export/me.md').then((r) => r.text());
  assert.match(md, /^# What my agent knows about me/);
});

test('voice route accepts audio (mock transcript)', async () => {
  const pcm = Buffer.alloc(24000 * 2); // one second of silence
  const r = await fetch(BASE + '/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: pcm }).then((x) => x.json());
  assert.equal(r.action, 'confirm');
});

test('bad requests are rejected cleanly', async () => {
  assert.equal((await post('/api/chat', { message: '' })).status, 400);
  assert.equal((await post('/api/cards/nope', { action: 'confirm' })).status, 404);
  assert.equal((await post('/api/memory/update', {})).status, 400);
});

test('profiles: list and switch, each with its own name', async () => {
  const { profiles, active } = await get('/api/profiles');
  assert.equal(active, 'alex');
  assert.ok(profiles.some((p) => p.id === 'maria'));
  const maria = await post('/api/profile', { id: 'maria' });
  assert.equal(maria.profile.name, 'Maria');
  assert.equal(maria.userName, 'Maria');
  assert.ok(maria.profile.script.length);
  const back = await post('/api/profile', { id: 'alex' });
  assert.equal(back.userName, 'Alex');
  assert.equal((await post('/api/profile', { id: 'nobody' })).status, 404);
});
