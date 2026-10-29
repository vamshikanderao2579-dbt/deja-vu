// Builds data/demo-memory.json: a ready-made memory with a realistic mix of
// confirmed, guessed, stale, locked and annotated cards, for demos and the video.
//
//   node scripts/make-demo-memory.js
//
// Synthetic only: it uses the fixture cards and the test chat history.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.HISTORY_FILE = ''; // always the synthetic history
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { mergeCards } = await import('../src/engine/cards.js');
const { messageTime } = await import('../src/platform/store.js');

const fixture = JSON.parse(readFileSync(join(ROOT, 'data', 'fixture-cards.json'), 'utf8')).cards;
const cards = mergeCards([], fixture, [], '2026-10-20T09:00:00');

// What the user has already reviewed, and when. Older than 6 months = "stale".
const reviewed = {
  'Loves Thai and Mexican food': { confirmed: '2026-09-26T19:40:00' },
  'Partner Sam is vegetarian': { confirmed: '2026-03-20T18:10:00' },
  'No meetings before 10 AM (school drop-off)': { confirmed: '2026-10-02T08:30:00' },
  'Wants summaries as short bullets': { confirmed: '2026-10-12T09:15:00' },
  'Direct flights and a window seat, even if pricier': { confirmed: '2026-07-11T21:00:00' },
  'Bills due on the 1st; remind 3 days before': { confirmed: '2026-10-01T10:05:00', note: 'Rent is the big one' },
  'Likes sci-fi and true crime; no horror': { confirmed: '2026-10-05T22:10:00', note: 'Sam picks rom-coms on Fridays' },
  // Confirmed last November: this year it wakes up as a natural "still true this year?".
  'Hosts Thanksgiving for 8; Mom brings the pumpkin pie': { confirmed: '2025-11-24T19:00:00' },
};

for (const c of cards) {
  const times = (c.sources ?? []).map(messageTime).filter(Boolean).sort();
  if (times.length) [c.first_seen, c.last_seen] = [times[0], times.at(-1)];
  delete c.mock_keywords;
  const r = reviewed[c.text];
  if (r) {
    Object.assign(c, { status: 'confirmed', confidence: 1, last_confirmed: r.confirmed });
    delete c.changed_from;
    if (r.note) c.note = r.note;
  }
}

const out = { _label: 'Synthetic demo memory. Load it from Settings → Load demo memory.', cards };
writeFileSync(join(ROOT, 'data', 'demo-memory.json'), JSON.stringify(out, null, 2));
const n = (s) => cards.filter((c) => c.status === s).length;
console.log(`demo-memory.json: ${cards.length} cards · ${n('confirmed')} confirmed · ${n('inferred')} guessed · ${n('pending')} locked`);
