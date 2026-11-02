import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ROOT, config, setTodaySource } from './config.js';

// Each profile is one person: their chat history and their memory (me.json-style
// state). Synthetic profiles live in data/profiles.json; real ones in
// data/private/profiles.json, which only exists on the machine that has them.
//
// me.json is the source of truth for a person's memory. Text for the model and
// the human-readable me.md export are both generated from it.
//
// A "view" is one person's history and memory, opened for whoever is using it. The
// server runs each request inside the visitor's view (runIn), so two visitors never
// see each other's memory; background work keeps the view it started in.

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const exists = (p) => existsSync(join(ROOT, p));

export function listProfiles() {
  const pub = exists('data/profiles.json') ? read('data/profiles.json') : [];
  const priv = !config.publicDemo && exists('data/private/profiles.json') ? read('data/private/profiles.json').map((p) => ({ ...p, real: true })) : [];
  return [...pub, ...priv].filter((p) => exists(p.history));
}

// `live` holds conversations typed in the app, so cards learned from them have
// real sources ("Why?" opens the exact live message).
const empty = () => ({ version: 1, cards: [], rejected: [], cueLog: [], live: [], learned: [] });
const readState = (path) => (existsSync(path) ? { ...empty(), ...JSON.parse(readFileSync(path, 'utf8')) } : null);

// profile: { id, name, about, ... }; history: { conversations }; statePath: where its memory
// is saved; seedPath: the starting memory "Load demo memory" goes back to; start: the memory
// a new state file begins with; buildKey: its build folder; realToday: ignore DEMO_TODAY.
export function openView({ profile, history, statePath, seedPath = null, start = null, buildKey = profile.id, userName = profile.name, realToday = false }) {
  const messagesById = new Map(
    history.conversations.flatMap((c) => c.messages.map((m) => [m.id, { ...m, date: c.date, time: c.time, conversationId: c.id, conversation: c.title }]))
  );
  return {
    profile, history, statePath, seedPath, buildKey, userName, realToday,
    messagesById,
    conversationsById: new Map(history.conversations.map((c) => [c.id, c])),
    state: readState(statePath) ?? { ...empty(), ...structuredClone(start ?? {}) },
    buildJob: null,
    learning: Promise.resolve(),
  };
}

// A fresh copy of a persona for a visitor: its demo memory (or first build), no chats.
export function startingMemory(p) {
  for (const f of [p.demoMemory, p.state.replace(/\.json$/, '.seed.json')]) if (f && exists(f)) return { cards: read(f).cards };
  return null;
}

const ACTIVE_PATH = join(ROOT, 'data', 'active-profile.txt');
export const activeProfileId = () => process.env.PROFILE || (existsSync(ACTIVE_PATH) ? readFileSync(ACTIVE_PATH, 'utf8').trim() : '');
export const rememberActive = (id) => { if (!process.env.STATE_FILE && !process.env.HISTORY_FILE && !config.publicDemo) writeFileSync(ACTIVE_PATH, id); };

// A profile's own files, shared by everyone on this machine (the local app, scripts, eval).
// HISTORY_FILE / STATE_FILE (eval, tests) override the default profile's files; an eval
// (HISTORY_FILE set, no request) overrides whichever profile the process starts with.
export function profileView(id, { fromEnv = false } = {}) {
  const all = listProfiles();
  const p = all.find((x) => x.id === id) ?? all[0];
  if (!p) throw new Error('No profiles found (data/profiles.json)');
  const isDefault = p.id === all[0].id || (fromEnv && !!process.env.HISTORY_FILE);
  const statePath = join(ROOT, (isDefault && process.env.STATE_FILE) || p.state);
  return openView({
    profile: p,
    history: read((isDefault && process.env.HISTORY_FILE) || p.history),
    statePath,
    seedPath: p.demoMemory ? join(ROOT, p.demoMemory) : statePath.replace(/\.json$/, '') + '.seed.json',
    // The agent addresses the person by this profile's name (eval sets USER_NAME).
    userName: process.env.HISTORY_FILE && process.env.USER_NAME ? process.env.USER_NAME : p.name,
  });
}

// Outside a request (scripts, eval, unit tests) everything uses this view.
let fallback = null;
const als = new AsyncLocalStorage();
export const current = () => als.getStore() ?? fallback;
export const runIn = (view, fn) => als.run(view, fn);
setTodaySource(() => (current()?.realToday ? null : config.today));

export function useProfile(id) {
  fallback = profileView(id, { fromEnv: true });
  rememberActive(fallback.profile.id);
  return fallback.profile;
}
useProfile(activeProfileId());

export const getProfile = () => current().profile;
export const getHistory = () => current().history;
export const userName = () => current().userName;

export function getState() {
  return current().state;
}

export function save() {
  const v = current();
  mkdirSync(dirname(v.statePath), { recursive: true });
  writeFileSync(v.statePath, JSON.stringify(v.state, null, 2));
}

export function reset() {
  const v = current();
  v.state = empty();
  if (existsSync(v.statePath)) rmSync(v.statePath);
}

// A snapshot of freshly built memory, so a demo can always start from it. Only the
// first build sets it: a later rebuild must not change what a recorded demo starts from.
export function saveSeed() {
  const v = current();
  if (!v.seedPath || existsSync(v.seedPath)) return;
  mkdirSync(dirname(v.seedPath), { recursive: true });
  writeFileSync(v.seedPath, JSON.stringify({ cards: v.state.cards }, null, 2));
}
export function loadSeed() {
  const v = current();
  if (!v.seedPath || !existsSync(v.seedPath)) return null;
  const { cards } = JSON.parse(readFileSync(v.seedPath, 'utf8'));
  // Saved chats stay: loading the demo memory resets what's remembered, not what was said.
  Object.assign(v.state, { cards: structuredClone(cards), rejected: [], cueLog: [], learned: [] });
  save();
  return v.state;
}

// ---------- live chat (typed in the app) ----------
// A chat's title is its first message, cut at a word near 40 characters.
export function chatTitle(text) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  const cut = t.length > 40 ? t.slice(0, 40).replace(/\s+\S*$/, '') + '…' : t;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}
const pad = (n) => String(n).padStart(2, '0');
export function addLiveMessage(conversationId, role, text, extra = {}) {
  const state = getState();
  const now = new Date();
  const id = `live-${conversationId}`;
  let conv = state.live.find((c) => c.id === id);
  if (!conv) {
    conv = { id, date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, time: `${pad(now.getHours())}:${pad(now.getMinutes())}`, title: chatTitle(text), messages: [] };
    state.live.push(conv);
  }
  const msg = { id: `${id}-${conv.messages.length + 1}`, role, text, ...extra };
  conv.messages.push(msg);
  conv.updated = now.toISOString();
  return { conv, msg };
}

export function findConversation(id) {
  return current().conversationsById.get(id) ?? getState().live.find((c) => c.id === id) ?? null;
}

export function findMessage(id) {
  const m = current().messagesById.get(id);
  if (m) return m;
  for (const c of getState().live) {
    const lm = c.messages.find((x) => x.id === id);
    if (lm) return { ...lm, date: c.date, time: c.time, conversationId: c.id, conversation: c.title };
  }
  return null;
}

// When a message was sent, as an ISO timestamp.
export function messageTime(id) {
  const m = findMessage(id);
  return m ? `${m.date}T${m.time ?? '12:00'}:00` : null;
}

export function historyAsText() {
  return getHistory().conversations
    .map((c) => `## ${c.date} ${c.time ?? ''}: ${c.title}\n` + c.messages.map((m) => `[${m.id}] ${m.role}: ${m.text}`).join('\n'))
    .join('\n\n');
}
