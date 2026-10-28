// Converts a Muse "Export Your Information" package into the app's history format.
//
//   node scripts/import-muse-export.js "<export folder>" [out=data/private/history.json]
//
// One conversation per day. The output goes in data/private/, which git ignores:
// real chat history must never be committed. Point the app at it with
// HISTORY_FILE=data/private/history.json in .env.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [dir, outArg] = process.argv.slice(2);
if (!dir) {
  console.error('Usage: node scripts/import-muse-export.js "<export folder>" [output file]');
  process.exit(1);
}
const out = join(ROOT, outArg ?? 'data/private/history.json');

const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const turns = (manifest.turns ?? [])
  .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
  .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

// created_at may be ISO or epoch seconds; normalise to local date + HH:MM.
function when(t) {
  const raw = t.created_at;
  const d = typeof raw === 'number' ? new Date(raw * (raw < 1e12 ? 1000 : 1)) : new Date(raw);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

// Strip UI widget markup like [[hatch_widget ...]] that isn't conversation text.
const clean = (s) => s.replace(/\[\[[^\]]*\]\]/g, '').trim();

const byDay = new Map();
let n = 0;
for (const t of turns) {
  const { date, time } = when(t);
  const text = clean(t.content);
  if (!text) continue;
  if (!byDay.has(date)) byDay.set(date, { id: `d${byDay.size + 1}`, date, time, title: '', messages: [] });
  const conv = byDay.get(date);
  conv.messages.push({ id: `p${String(++n).padStart(4, '0')}`, role: t.role, text });
}

// Title each day by its first user message, shortened.
for (const c of byDay.values()) {
  const first = c.messages.find((m) => m.role === 'user')?.text ?? 'Chat';
  c.title = first.replace(/\s+/g, ' ').slice(0, 48) + (first.length > 48 ? '…' : '');
}

const user = manifest.turns?.[0] ? 'Vamshi' : 'User';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({ _label: 'PRIVATE. Imported from a Muse data export. Never commit.', user: { name: process.env.USER_NAME ?? user }, conversations: [...byDay.values()] }, null, 2)
);
const msgs = [...byDay.values()].reduce((a, c) => a + c.messages.length, 0);
console.log(`Imported ${msgs} messages across ${byDay.size} days → ${out}`);
