import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.js';

// me.json is the source of truth for the user's context. Text for the model
// and the human-readable me.md export are both generated from it.
// STATE_FILE lets tests use their own memory file.
const STATE_PATH = join(ROOT, process.env.STATE_FILE || join('data', 'me.json'));
// HISTORY_FILE in .env points at another history, e.g. a private import.
const HISTORY_PATH = join(ROOT, process.env.HISTORY_FILE || join('data', 'test-history.json'));

const empty = () => ({ version: 1, cards: [], rejected: [], cueLog: [] });

let state = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : empty();

export const history = JSON.parse(readFileSync(HISTORY_PATH, 'utf8'));
export const messagesById = new Map(
  history.conversations.flatMap((c) => c.messages.map((m) => [m.id, { ...m, date: c.date, time: c.time, conversationId: c.id, conversation: c.title }]))
);

export function getState() {
  return state;
}

export function save() {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function reset() {
  state = empty();
  if (existsSync(STATE_PATH)) rmSync(STATE_PATH);
}

export const conversationsById = new Map(history.conversations.map((c) => [c.id, c]));

// When a message was sent, as an ISO timestamp.
export function messageTime(id) {
  const m = messagesById.get(id);
  return m ? `${m.date}T${m.time ?? '12:00'}:00` : null;
}

export function historyAsText() {
  return history.conversations
    .map((c) => `## ${c.date} ${c.time ?? ''}: ${c.title}\n` + c.messages.map((m) => `[${m.id}] ${m.role}: ${m.text}`).join('\n'))
    .join('\n\n');
}
