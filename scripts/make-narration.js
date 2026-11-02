// Records every tour caption in data/profiles.json with a Mac voice, so the demo sounds
// the same on every computer: src/ui/narration/<hash>.m4a plus index.json (caption → file).
// The app plays a clip when there is one and falls back to the browser's voice when not.
//
//   node scripts/make-narration.js                  # Ava (Premium), only missing clips
//   node scripts/make-narration.js --all            # redo every clip
//   VOICE="Zoe (Premium)" node scripts/make-narration.js
//
// Install the voice first: System Settings → Accessibility → Spoken Content →
// System voice → Manage Voices → English → Ava (Premium). macOS only (say, afconvert).

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'ui', 'narration');
const VOICE = process.env.VOICE ?? 'Ava (Premium)';
const RATE = process.env.RATE ?? '180'; // words per minute; the browser fallback runs at 0.96
const all = process.argv.includes('--all');

const voices = execFileSync('say', ['-v', '?'], { encoding: 'utf8' });
if (!voices.split('\n').some((l) => l.startsWith(`${VOICE} `))) {
  console.error(`The voice "${VOICE}" isn't installed. See the note at the top of this file.`);
  process.exit(1);
}

// Spoken the same way as the browser fallback in src/ui/app.js (narrate).
const spoken = (text) => text.replace(/ⓘ/g, 'The info button').replace(/~/g, 'about ');
const fileFor = (text) => `${createHash('sha1').update(`${VOICE}|${RATE}|${text}`).digest('hex').slice(0, 12)}.m4a`;

const profiles = JSON.parse(readFileSync(join(ROOT, 'data', 'profiles.json'), 'utf8'));
const captions = [...new Set(profiles.flatMap((p) => (p.script ?? []).map((s) => s.say).filter(Boolean)))];

mkdirSync(OUT, { recursive: true });
const index = {};
let made = 0;
for (const text of captions) {
  const file = fileFor(text);
  index[text] = file;
  if (!all && existsSync(join(OUT, file))) continue;
  const aiff = join(tmpdir(), `dv-narration-${file}.aiff`);
  execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', aiff, spoken(text)]);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', aiff, join(OUT, file)]);
  rmSync(aiff, { force: true });
  made++;
}

// Clips no caption uses any more go, so an edited caption never plays its old words.
const keep = new Set(Object.values(index));
let removed = 0;
for (const f of readdirSync(OUT)) if (f.endsWith('.m4a') && !keep.has(f)) { rmSync(join(OUT, f)); removed++; }

writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`${captions.length} captions: ${made} recorded, ${removed} old clips removed (${VOICE}).`);
