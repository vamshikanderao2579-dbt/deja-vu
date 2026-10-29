import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every prompt the engine sends lives here as its own .md file, one job per file:
// <job>.system.md is the instruction, <job>.user.md frames the data it works on.
// {{name}} fills a value in. How to write and change them: prompt-quality.md.
//
// Changing a prompt's text changes its replay-cache key, so recorded demos need
// re-recording (node scripts/record-demo.js <profile>) after an edit.

const DIR = dirname(fileURLToPath(import.meta.url));
const loaded = new Map();

export function prompt(name, vars = {}) {
  let text = loaded.get(name);
  if (text === undefined) {
    text = readFileSync(join(DIR, `${name}.md`), 'utf8').replace(/\n$/, '');
    loaded.set(name, text);
  }
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in vars)) throw new Error(`prompt "${name}" needs {{${key}}}`);
    return String(vars[key]);
  });
}
