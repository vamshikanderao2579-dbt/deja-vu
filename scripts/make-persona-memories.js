// Saves each held-out persona's built cards (from its eval run) as the memory a visitor
// starts with when they pick that person: data/personas/<id>-memory.json.
//
//   node eval/run.js --persona daniel        # builds data/private/eval-build/daniel/cards.json
//   node scripts/make-persona-memories.js    # every persona that has a build
//
// Synthetic only. Cards start as guesses (private ones flagged), as a fresh build would.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { applyBuild } = await import('../src/engine/build.js');

const profiles = JSON.parse(readFileSync(join(ROOT, 'data', 'profiles.json'), 'utf8'));
for (const p of profiles.filter((x) => x.today && x.demoMemory)) {
  const built = join(ROOT, 'data', 'private', 'eval-build', p.id, 'cards.json');
  if (!existsSync(built)) { console.log(`${p.id}: no build yet, skipped`); continue; }
  const cards = applyBuild([], JSON.parse(readFileSync(built, 'utf8')), [], { partial: false });
  writeFileSync(join(ROOT, p.demoMemory), JSON.stringify({ cards }, null, 2) + '\n');
  console.log(`${p.id}: ${cards.length} cards → ${p.demoMemory}`);
}
