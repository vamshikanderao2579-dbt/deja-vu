// Records every tour caption in data/profiles.json, so the demo sounds the same on every
// computer: src/ui/narration/<hash>.m4a plus index.json (caption → file).
// The app plays a clip when there is one and falls back to the browser's voice when not.
//
//   KOKORO_DIR=<model folder> KOKORO_PY=<venv>/bin/python node scripts/make-narration.js
//                                                   # Kokoro (natural, open weights): see scripts/kokoro-say.py
//   node scripts/make-narration.js                  # no KOKORO_DIR: the Mac voice Ava (Premium)
//   node scripts/make-narration.js --all            # redo every clip
//
// The Mac voice needs System Settings → Accessibility → Spoken Content → System voice →
// Manage Voices → English → Ava (Premium). Both need macOS (afconvert).

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'ui', 'narration');
const KOKORO = process.env.KOKORO_DIR;
const VOICE = KOKORO ? `kokoro:${process.env.KOKORO_VOICE ?? 'af_heart'}@${process.env.KOKORO_SPEED ?? '0.9'}` : process.env.VOICE ?? 'Ava (Premium)';
const RATE = process.env.RATE ?? '120'; // Mac voice, words per minute, unhurried; the browser fallback runs at 0.65
const all = process.argv.includes('--all');

if (!KOKORO) {
  const voices = execFileSync('say', ['-v', '?'], { encoding: 'utf8' });
  if (!voices.split('\n').some((l) => l.startsWith(`${VOICE} `))) {
    console.error(`The voice "${VOICE}" isn't installed. See the note at the top of this file.`);
    process.exit(1);
  }
}

// Spoken the same way as the browser fallback in src/ui/app.js (narrate). The Mac voice
// gets a short breath after each sentence; Kokoro adds its own pauses (kokoro-say.py).
const said = (text) => text.replace(/ⓘ/g, 'The info button').replace(/~/g, 'about ');
const spoken = (text) => (KOKORO ? said(text) : said(text).replace(/([.!?])\s+/g, '$1 [[slnc 450]] '));
const fileFor = (text) => `${createHash('sha1').update(`${VOICE}|${RATE}|${spoken(text)}`).digest('hex').slice(0, 12)}.m4a`;

const profiles = JSON.parse(readFileSync(join(ROOT, 'data', 'profiles.json'), 'utf8'));
const captions = [...new Set(profiles.flatMap((p) => (p.script ?? []).map((s) => s.say).filter(Boolean)))];

mkdirSync(OUT, { recursive: true });
const index = {};
const todo = [];
for (const text of captions) {
  const file = fileFor(text);
  index[text] = file;
  if (all || !existsSync(join(OUT, file))) todo.push({ text: spoken(text), file, raw: join(tmpdir(), `dv-narration-${file}.${KOKORO ? 'wav' : 'aiff'}`) });
}
if (KOKORO && todo.length) {
  // One Python run for every clip: the model loads once.
  execFileSync(process.env.KOKORO_PY ?? 'python3', [join(ROOT, 'scripts', 'kokoro-say.py')], { input: JSON.stringify(todo.map((t) => ({ text: t.text, out: t.raw }))), stdio: ['pipe', 'inherit', 'inherit'] });
}
for (const t of todo) {
  if (!KOKORO) execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', t.raw, t.text]);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', t.raw, join(OUT, t.file)]);
  rmSync(t.raw, { force: true });
}
const made = todo.length;

// Clips no caption uses any more go, so an edited caption never plays its old words.
const keep = new Set(Object.values(index));
let removed = 0;
for (const f of readdirSync(OUT)) if (f.endsWith('.m4a') && !keep.has(f)) { rmSync(join(OUT, f)); removed++; }

writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`${captions.length} captions: ${made} recorded, ${removed} old clips removed (${VOICE}).`);
