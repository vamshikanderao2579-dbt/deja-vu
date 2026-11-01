// Importing someone's own chats: each export format becomes the app's history format.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importHistory } from '../src/platform/importers.js';

const chatgpt = [{
  title: 'Weekend in Lisbon', create_time: 1727000000, current_node: 'c',
  mapping: {
    root: { id: 'root', message: null, parent: null, children: ['s'] },
    s: { id: 's', parent: 'root', message: { author: { role: 'system' }, content: { content_type: 'text', parts: [''] } } },
    a: { id: 'a', parent: 's', message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['plan a weekend in lisbon, we never fly red-eyes'] } } },
    b: { id: 'b', parent: 'a', message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['Here is a plan…'] } } },
    old: { id: 'old', parent: 'a', message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['an answer that was regenerated'] } } },
    c: { id: 'c', parent: 'b', message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['great, thanks'] } } },
  },
}];

test('import: ChatGPT conversations.json follows the chosen branch only', () => {
  const r = importHistory(JSON.stringify(chatgpt), { name: 'Sam' });
  assert.equal(r.format, 'chatgpt');
  const [c] = r.history.conversations;
  assert.equal(c.title, 'Weekend in Lisbon');
  assert.deepEqual(c.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.ok(!c.messages.some((m) => /regenerated/.test(m.text)));
  assert.equal(r.history.user.name, 'Sam');
  assert.equal(r.turns, 2);
  assert.match(c.date, /^2024-09-2\d$/);
});

test('import: Claude conversations.json', () => {
  const claude = [{ uuid: 'x', name: 'Gift ideas', created_at: '2026-09-01T10:00:00Z', chat_messages: [
    { sender: 'human', text: 'gift ideas for my sister, she loves pottery', content: [] },
    { sender: 'assistant', text: '', content: [{ type: 'text', text: 'Some ideas…' }] },
  ] }];
  const r = importHistory(JSON.stringify(claude));
  assert.equal(r.format, 'claude');
  assert.deepEqual(r.history.conversations[0].messages.map((m) => m.text), ['gift ideas for my sister, she loves pottery', 'Some ideas…']);
  assert.equal(r.history.user.name, 'You');
});

test('import: Markdown with headings and speaker lines', () => {
  const md = `# 2026-08-02 Groceries\n**You:** I'm vegetarian, plan meals\nfor the week\n**Assistant:** Sure.\n\n# 2026-08-09 Running\nUser: training for a half marathon\nAI: Nice!`;
  const r = importHistory(md);
  assert.equal(r.format, 'text');
  assert.equal(r.history.conversations.length, 2);
  assert.equal(r.history.conversations[0].date, '2026-08-02');
  assert.equal(r.history.conversations[0].messages[0].text, "I'm vegetarian, plan meals\nfor the week");
  assert.equal(r.history.conversations[1].messages[1].role, 'assistant');
});

test('import: a plain list of messages, and unique ids', () => {
  const r = importHistory(JSON.stringify([{ role: 'user', content: 'hi there', timestamp: '2026-07-01T09:00:00Z' }, { role: 'assistant', content: 'hello' }, { role: 'user', content: 'again', timestamp: '2026-07-02T09:00:00Z' }]));
  assert.equal(r.format, 'json');
  const ids = r.history.conversations.flatMap((c) => c.messages.map((m) => m.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(r.turns, 2);
});

test('import: empty, broken or chat-less files get a friendly error', () => {
  assert.throws(() => importHistory(''), /empty/);
  assert.throws(() => importHistory('{"broken": '), /couldn’t be read/);
  assert.throws(() => importHistory('{"settings": {"theme": "dark"}}'), /couldn’t find any chats/);
});
