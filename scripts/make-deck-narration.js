// Records the pitch deck's auto-play narration (docs/decks/pitch/narration.json) with Kokoro:
// src/ui/narration/deck/<hash>.m4a plus index.json (line → file). The deck builder
// (scripts/build-decks.py) reads that index; the app serves the clips at /narration/deck/.
//
//   KOKORO_DIR=<model folder> KOKORO_PY=<venv>/bin/python node scripts/make-deck-narration.js
//
// A male voice for the slides (am_michael at 1.15); the tours keep their own voice.

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'ui', 'narration', 'deck');
const KOKORO = process.env.KOKORO_DIR;
if (!KOKORO) { console.error('Set KOKORO_DIR (and KOKORO_PY): see scripts/kokoro-say.py.'); process.exit(1); }
const voice = process.env.KOKORO_VOICE ?? 'am_michael';
const speed = process.env.KOKORO_SPEED ?? '1.15';
const pause = process.env.KOKORO_PAUSE ?? '0.25';
const VOICE = `kokoro:${voice}@${speed}/${pause}`;

const script = JSON.parse(readFileSync(join(ROOT, 'docs', 'decks', 'pitch', 'narration.json'), 'utf8'));
const lines = [...new Set(Object.entries(script).filter(([k]) => !k.startsWith('_')).flatMap(([, v]) => v).filter(Boolean))];
const fileFor = (text) => `${createHash('sha1').update(`${VOICE}|${text}`).digest('hex').slice(0, 12)}.m4a`;

mkdirSync(OUT, { recursive: true });
const index = {};
const todo = [];
for (const text of lines) {
  const file = fileFor(text);
  index[text] = file;
  if (!existsSync(join(OUT, file))) todo.push({ text, file, raw: join(tmpdir(), `dv-deck-${file}.wav`) });
}
if (todo.length) {
  execFileSync(process.env.KOKORO_PY ?? 'python3', [join(ROOT, 'scripts', 'kokoro-say.py')], {
    input: JSON.stringify(todo.map((t) => ({ text: t.text, out: t.raw }))),
    env: { ...process.env, KOKORO_VOICE: voice, KOKORO_SPEED: speed, KOKORO_PAUSE: pause },
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}
for (const t of todo) {
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', t.raw, join(OUT, t.file)]);
  rmSync(t.raw, { force: true });
}
const keep = new Set(Object.values(index));
let removed = 0;
for (const f of readdirSync(OUT)) if (f.endsWith('.m4a') && !keep.has(f)) { rmSync(join(OUT, f)); removed++; }
writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`${lines.length} lines: ${todo.length} recorded, ${removed} old clips removed (${VOICE}).`);
