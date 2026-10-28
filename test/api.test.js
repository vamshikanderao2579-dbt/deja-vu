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
let server;

const post = (path, body = {}) =>
  fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const get = (path) => fetch(BASE + path).then((r) => r.json());

before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, MAIN_API_KEY: '', BG_API_KEY: '', PORT: String(PORT), STATE_FILE: STATE, HISTORY_FILE: '', CUE_COOLDOWN_HOURS: '0', RATE_LIMIT_PER_MINUTE: '1000', DEMO_TODAY: '2026-10-27' },
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

test('a high-stakes request with a changed card asks once, then answers', async () => {
  const cue = await post('/api/chat', { message: 'Grab my usual drink on the way in', conversationId: 't1' });
  assert.equal(cue.type, 'cue');
  assert.match(cue.cue.question, /used to say/);
  const confirmed = await post(`/api/cards/${cue.cue.cardId}`, { action: 'confirm' });
  assert.equal(confirmed.cards.find((c) => c.id === cue.cue.cardId).status, 'confirmed');
  const ans = await post('/api/chat', { message: 'Grab my usual drink on the way in', conversationId: 't1', skipCue: true });
  assert.equal(ans.type, 'answer');
  assert.ok(ans.usedCards.length >= 1);
  assert.ok(ans.tokens.context < ans.tokens.fullHistory);
});

test('the same conversation is never asked twice', async () => {
  const again = await post('/api/chat', { message: 'Find us a place to stay in Miami for spring break', conversationId: 't1' });
  assert.equal(again.type, 'answer');
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

test('thumbs-up nudges confidence of the cards used', async () => {
  const s = await get('/api/state');
  const c = s.cards.find((x) => x.status === 'inferred' && x.confidence < 0.9);
  const r = await post('/api/feedback', { cardIds: [c.id], positive: true });
  assert.ok(r.cards.find((x) => x.id === c.id).confidence > c.confidence);
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
