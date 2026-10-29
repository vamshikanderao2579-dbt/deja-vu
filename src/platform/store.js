import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT, config } from './config.js';

// Each profile is one person: their chat history and their memory (me.json-style
// state). Synthetic profiles live in data/profiles.json; real ones in
// data/private/profiles.json, which only exists on the machine that has them.
//
// me.json is the source of truth for a person's memory. Text for the model and
// the human-readable me.md export are both generated from it.

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const exists = (p) => existsSync(join(ROOT, p));

export function listProfiles() {
  const pub = exists('data/profiles.json') ? read('data/profiles.json') : [];
  const priv = exists('data/private/profiles.json') ? read('data/private/profiles.json') : [];
  return [...pub, ...priv].filter((p) => exists(p.history));
}

// `live` holds conversations typed in the app, so cards learned from them have
// real sources ("Why?" opens the exact live message).
const empty = () => ({ version: 1, cards: [], rejected: [], cueLog: [], live: [], learned: [] });

export let profile = null;
export let history = { conversations: [] };
export let messagesById = new Map();
export let conversationsById = new Map();
let state = empty();
let statePath = '';

const ACTIVE_PATH = join(ROOT, 'data', 'active-profile.txt');

// HISTORY_FILE / STATE_FILE (eval, tests) override the default profile's files.
export function useProfile(id) {
  const all = listProfiles();
  const p = all.find((x) => x.id === id) ?? all[0];
  if (!p) throw new Error('No profiles found (data/profiles.json)');
  const isDefault = p.id === all[0].id;
  const historyPath = (isDefault && process.env.HISTORY_FILE) || p.history;
  statePath = join(ROOT, (isDefault && process.env.STATE_FILE) || p.state);
  profile = p;
  history = read(historyPath);
  messagesById = new Map(
    history.conversations.flatMap((c) => c.messages.map((m) => [m.id, { ...m, date: c.date, time: c.time, conversationId: c.id, conversation: c.title }]))
  );
  conversationsById = new Map(history.conversations.map((c) => [c.id, c]));
  state = existsSync(statePath) ? { ...empty(), ...JSON.parse(readFileSync(statePath, 'utf8')) } : empty();
  // The agent addresses the person by this profile's name (eval sets USER_NAME).
  config.userName = process.env.HISTORY_FILE && process.env.USER_NAME ? process.env.USER_NAME : p.name;
  if (!process.env.STATE_FILE && !process.env.HISTORY_FILE) writeFileSync(ACTIVE_PATH, p.id);
  return p;
}

const initial = process.env.PROFILE || (existsSync(ACTIVE_PATH) ? readFileSync(ACTIVE_PATH, 'utf8').trim() : '');
useProfile(initial);

export function getState() {
  return state;
}

export function save() {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function reset() {
  state = empty();
  if (existsSync(statePath)) rmSync(statePath);
}

// A snapshot of freshly built memory, so a demo can always start from it. Only the
// first build sets it: a later rebuild must not change what a recorded demo starts from.
const seedPath = () => statePath.replace(/\.json$/, '') + '.seed.json';
export function saveSeed() {
  if (existsSync(seedPath())) return;
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(seedPath(), JSON.stringify({ cards: state.cards }, null, 2));
}
export function loadSeed() {
  const file = profile.demoMemory ? join(ROOT, profile.demoMemory) : seedPath();
  if (!existsSync(file)) return null;
  const { cards } = JSON.parse(readFileSync(file, 'utf8'));
  Object.assign(state, { cards: structuredClone(cards), rejected: [], cueLog: [], live: [], learned: [] });
  save();
  return state;
}

// ---------- live chat (typed in the app) ----------
const pad = (n) => String(n).padStart(2, '0');
export function addLiveMessage(conversationId, role, text) {
  const now = new Date();
  const id = `live-${conversationId}`;
  let conv = state.live.find((c) => c.id === id);
  if (!conv) {
    conv = { id, date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, time: `${pad(now.getHours())}:${pad(now.getMinutes())}`, title: text.slice(0, 48), messages: [] };
    state.live.push(conv);
  }
  const msg = { id: `${id}-${conv.messages.length + 1}`, role, text };
  conv.messages.push(msg);
  return { conv, msg };
}

export function findConversation(id) {
  return conversationsById.get(id) ?? state.live.find((c) => c.id === id) ?? null;
}

export function findMessage(id) {
  const m = messagesById.get(id);
  if (m) return m;
  for (const c of state.live) {
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
  return history.conversations
    .map((c) => `## ${c.date} ${c.time ?? ''}: ${c.title}\n` + c.messages.map((m) => `[${m.id}] ${m.role}: ${m.text}`).join('\n'))
    .join('\n\n');
}
