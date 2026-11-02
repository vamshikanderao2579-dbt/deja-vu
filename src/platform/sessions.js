import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT } from './config.js';
import { listProfiles, openView, profileView, startingMemory, activeProfileId, rememberActive } from './store.js';

// One session per browser (a cookie). It remembers which person the visitor is looking at:
// a demo persona or their own imported history.
//
// Local app: personas read and write their own files, as before; only the choice of
// person is per browser. Public link (PUBLIC_DEMO=true): every visitor gets a private
// copy of a persona, and their import, in SESSION_DIR/<id>/. Ending the session, or
// SESSION_IDLE_HOURS without a visit, deletes that folder.

const COOKIE = 'dv_sid';
const ID = /^[a-f0-9]{32}$/;
const MINE = 'mine'; // the profile id of a visitor's imported history

const sessions = new Map(); // id → { id, profileId, imported, builds, lastSeen }
const views = new Map(); // key → view (opened history + memory)
const dirOf = (id) => join(config.sessionDir, id);
const metaPath = (id) => join(dirOf(id), 'session.json');

function persist(s) {
  if (!config.publicDemo && !s.imported) return; // the local app keeps nothing per browser but the cookie
  mkdirSync(dirOf(s.id), { recursive: true });
  writeFileSync(metaPath(s.id), JSON.stringify({ ...s, lastSeen: undefined }, null, 2));
}

function cookieId(req) {
  const m = (req.headers.cookie ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m && ID.test(m[1]) ? m[1] : null;
}

// The visitor's session, created on first visit. Sets the cookie on `res` when new.
export function sessionFor(req, res) {
  let id = cookieId(req);
  let s = id && sessions.get(id);
  if (!s && id && existsSync(metaPath(id))) {
    try { s = JSON.parse(readFileSync(metaPath(id), 'utf8')); s.chosen ??= !!s.profileId; sessions.set(id, s); } catch { s = null; }
  }
  if (!s) {
    id = randomBytes(16).toString('hex');
    // A browser picks who it is on the Select user page first (`chosen`). Until then the
    // local app answers API calls (curl, scripts) for the last-used person, as before.
    s = { id, profileId: config.publicDemo ? null : activeProfileId() || null, chosen: false, imported: null, builds: 0 };
    sessions.set(id, s);
    const secure = config.publicDemo ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(config.sessionIdleHours * 3600)}${secure}`);
  }
  s.lastSeen = Date.now();
  return s;
}

// What a visitor can pick: demo personas, plus their import once they have one.
export function profilesFor(s) {
  const demos = listProfiles().map(({ id, name, about, real, script }) => ({ id, name, about, demo: !real, real: !!real, tour: !!script?.length }));
  return s.imported ? [{ id: MINE, name: s.imported.name, about: `Your ${s.imported.label} history · ${s.imported.turns} messages`, demo: false }, ...demos] : demos;
}

// The view a session is looking at (null: hasn't chosen yet, public link only).
export function viewFor(s) {
  let pid = s.profileId;
  if (pid === MINE && !s.imported) pid = null;
  if (!pid && !config.publicDemo) pid = listProfiles()[0]?.id;
  if (!pid) return null;
  if (pid === MINE) return cached(`${s.id}:${MINE}`, () => mineView(s));
  const p = listProfiles().find((x) => x.id === pid) ?? listProfiles()[0];
  if (!p) return null;
  if (!config.publicDemo) return cached(`local:${p.id}`, () => profileView(p.id));
  // A private copy of the persona, starting from its demo memory.
  const dir = dirOf(s.id);
  return cached(`${s.id}:${p.id}`, () => openView({
    profile: p,
    history: JSON.parse(readFileSync(join(ROOT, p.history), 'utf8')),
    statePath: join(dir, `${p.id}.json`),
    start: startingMemory(p),
    seedPath: p.demoMemory ? join(ROOT, p.demoMemory) : null,
    buildKey: join(dir, `build-${p.id}`),
  }));
}
function cached(key, make) {
  if (!views.has(key)) views.set(key, make());
  return views.get(key);
}
function mineView(s) {
  const dir = dirOf(s.id);
  return openView({
    profile: { id: MINE, name: s.imported.name, about: 'Your imported history', suggestions: [] },
    history: JSON.parse(readFileSync(join(dir, 'history.json'), 'utf8')),
    statePath: join(dir, `${MINE}.json`),
    buildKey: join(dir, 'build-mine'),
    realToday: true,
  });
}

export function choose(s, profileId) {
  if (profileId === MINE ? !s.imported : !listProfiles().some((p) => p.id === profileId)) return false;
  s.profileId = profileId;
  s.chosen = true;
  if (profileId !== MINE) rememberActive(profileId);
  persist(s);
  return true;
}

// Save an imported history as this visitor's own profile, replacing an earlier import.
export function saveImport(s, { history, label, turns }) {
  const dir = dirOf(s.id);
  mkdirSync(dir, { recursive: true });
  rmSync(join(dir, `${MINE}.json`), { force: true });
  rmSync(join(dir, 'build-mine'), { recursive: true, force: true });
  writeFileSync(join(dir, 'history.json'), JSON.stringify(history));
  views.delete(`${s.id}:${MINE}`);
  s.imported = { name: history.user.name, label, turns, at: new Date().toISOString() };
  s.profileId = MINE;
  s.chosen = true;
  persist(s);
}

export function countBuild(s) {
  s.builds = (s.builds ?? 0) + 1;
  persist(s);
}

// Delete everything this visitor uploaded or built.
export function endSession(s) {
  for (const k of [...views.keys()]) if (k.startsWith(`${s.id}:`)) views.delete(k);
  sessions.delete(s.id);
  rmSync(dirOf(s.id), { recursive: true, force: true });
}
export const clearCookie = (res) => res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);

// Idle sessions are deleted: in memory, and their folders on disk (also after a restart).
export function sweep(now = Date.now()) {
  const idle = config.sessionIdleHours * 3600 * 1000;
  for (const s of [...sessions.values()]) {
    if (now - (s.lastSeen ?? 0) > idle && !anyBuilding(s)) endSession(s);
  }
  if (!existsSync(config.sessionDir)) return;
  for (const id of readdirSync(config.sessionDir)) {
    if (!ID.test(id) || sessions.has(id)) continue;
    const dir = dirOf(id);
    if (now - statSync(dir).mtimeMs > idle) rmSync(dir, { recursive: true, force: true });
  }
}
const anyBuilding = (s) => [...views.entries()].some(([k, v]) => k.startsWith(`${s.id}:`) && v.buildJob?.running);
export const buildsRunning = () => [...views.values()].filter((v) => v.buildJob?.running).length;
setInterval(sweep, 15 * 60 * 1000).unref();
