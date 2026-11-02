// The public link: every visitor (cookie) has their own memory. Starts the real server
// with PUBLIC_DEMO=true in mock mode (no API key, no cost).
import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3198;
const BASE = `http://localhost:${PORT}`;
const SESSIONS = join(ROOT, 'data', 'private', 'test-sessions');
let server;

// A browser: keeps its own cookie.
function visitor() {
  let cookie = '';
  const call = async (path, init = {}) => {
    const r = await fetch(BASE + path, { ...init, headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) } });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: r.status, ...(await r.json()) };
  };
  return {
    get: (p) => call(p),
    post: (p, body = {}) => call(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    upload: (p, text) => call(p, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: text }),
    id: () => cookie.split('=')[1],
  };
}

before(async () => {
  rmSync(SESSIONS, { recursive: true, force: true });
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, MAIN_API_KEY: '', BG_API_KEY: '', PORT: String(PORT), PUBLIC_DEMO: 'true', SESSION_DIR: SESSIONS, BUILD_DIR: join(SESSIONS, 'build'), SPEND_FILE: join(SESSIONS, 'spend.json'), HISTORY_FILE: '', STATE_FILE: '', PROFILE: '', MUSE_ENABLED: 'true', RATE_LIMIT_PER_MINUTE: '1000', DEMO_TODAY: '2026-10-27', SESSION_BUILDS: '1' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/api/profiles'); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('server did not start');
});
after(() => {
  server?.kill();
  rmSync(SESSIONS, { recursive: true, force: true });
});

test('public: a new visitor chooses first; only demo personas are listed', async () => {
  const v = visitor();
  const s = await v.get('/api/state');
  assert.equal(s.needsChoice, true);
  // Exactly the synthetic people in data/profiles.json, in order; never a real one.
  const synthetic = JSON.parse(readFileSync(new URL('../data/profiles.json', import.meta.url), 'utf8')).map((p) => p.id);
  assert.deepEqual(s.profiles.map((p) => p.id), synthetic);
  assert.ok(s.profiles.every((p) => p.demo && !p.real));
  assert.equal((await v.get('/api/chats')).status, 409, 'nothing else until they choose');
});

test('public: two visitors on the same persona never see each other’s changes', async () => {
  const a = visitor();
  const b = visitor();
  const sa = await a.post('/api/profile', { id: 'alex' });
  await b.post('/api/profile', { id: 'alex' });
  assert.ok(sa.cards.length >= 15, 'starts from the demo memory');
  const card = sa.cards.find((c) => c.status !== 'confirmed');
  await a.post(`/api/cards/${card.id}`, { action: 'reject' });
  await a.post('/api/chat', { message: 'dinner ideas for tonight', conversationId: 'a1' });
  const sb = await b.get('/api/state');
  assert.ok(sb.cards.some((c) => c.id === card.id), 'b still has the card a removed');
  assert.equal((await b.get('/api/chats')).chats.length, 0, 'b has no chats of a');
  assert.ok(!(await a.get('/api/state')).cards.some((c) => c.id === card.id));
  // b switching person doesn't move a.
  await b.post('/api/profile', { id: 'maria' });
  assert.equal((await a.get('/api/state')).profile.id, 'alex');
  assert.equal((await b.get('/api/state')).profile.id, 'maria');
});

test('public: import your own chats → your profile, a build with progress, then cards', async () => {
  const v = visitor();
  await v.get('/api/state');
  const claude = [{ name: 'Trip', created_at: '2026-09-01T10:00:00Z', chat_messages: [
    { sender: 'human', text: 'we always fly direct with the kids, plan a beach trip' }, { sender: 'assistant', text: 'Sure' },
  ] }];
  const r = await v.upload('/api/import?name=Sam', JSON.stringify(claude));
  assert.equal(r.imported.format, 'Claude');
  assert.equal(r.profile.id, 'mine');
  assert.equal(r.userName, 'Sam');
  assert.ok(r.job.running || r.job.done);
  let job = r.job;
  for (let i = 0; i < 100 && !job.done; i++) { await new Promise((ok) => setTimeout(ok, 50)); job = await v.get('/api/build'); }
  assert.equal(job.done, true);
  assert.equal(job.error, null);
  const s = await v.get('/api/state');
  assert.ok(s.cards.length > 0);
  const { profiles } = await v.get('/api/profiles');
  assert.equal(profiles[0].id, 'mine', 'your memory sits above the demos');
  // One build per visitor here (SESSION_BUILDS=1).
  assert.equal((await v.upload('/api/import', JSON.stringify(claude))).status, 429);
});

test('public: a bad upload is refused without starting a build', async () => {
  const v = visitor();
  const r = await v.upload('/api/import', '{"settings": {}}');
  assert.equal(r.status, 400);
  assert.match(r.error, /couldn’t find any chats/);
  assert.equal((await v.get('/api/state')).needsChoice, true);
});

test('public: ending the session deletes everything it uploaded', async () => {
  const v = visitor();
  await v.get('/api/state');
  await v.upload('/api/import', '# 2026-08-01\nYou: I am vegetarian\nAssistant: Noted');
  const dir = join(SESSIONS, v.id());
  assert.ok(existsSync(join(dir, 'history.json')));
  for (let i = 0; i < 100 && !(await v.get('/api/build')).done; i++) await new Promise((ok) => setTimeout(ok, 50));
  await v.post('/api/session/end');
  assert.ok(!existsSync(dir));
  assert.ok(!readdirSync(SESSIONS).includes(v.id()));
});
