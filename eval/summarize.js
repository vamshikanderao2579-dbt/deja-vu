// Combines the latest eval of every person into data/eval-summary.json: numbers only
// (no questions, answers or card text), so it can ship with the app and show in Insights.
// Real people appear as "Real history A/B".
//
//   node eval/summarize.js

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PEOPLE = [
  { id: 'alex', label: 'Alex (synthetic)', file: 'eval/results/alex-latest.json', key: 'data/answer-key.json' },
  { id: 'maria', label: 'Maria (synthetic)', file: 'eval/results/maria-latest.json', key: 'data/personas/maria-answer-key.json' },
  { id: 'nidhi', label: 'Real history A', file: 'data/private/eval/nidhi-latest.json', key: 'data/private/nidhi-answer-key.json' },
  { id: 'vamshi', label: 'Real history B', file: 'data/private/eval/vamshi-latest.json', key: 'data/private/vamshi-answer-key.json' },
];
const read = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
// `drifted`: facts that changed outside chat (only a confirmation can catch them).
const runs = PEOPLE.filter((p) => existsSync(join(ROOT, p.file))).map((p) => ({ ...p, r: read(p.file), drifted: new Set(Object.keys(read(p.key).current_truth ?? {})) }));
if (runs.some(({ r }) => r.mock)) throw new Error('A mock run is in the mix; rerun the eval live first.');
const modes = runs[0].r.summary.map((s) => s.mode);
const pct = (xs) => (xs.length ? Math.round((xs.filter((c) => c.pass).length / xs.length) * 1000) / 10 : null);
const avg = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / (xs.length || 1));

// Pooled over every check of every person: each check counts once.
const combined = modes.map((mode) => {
  const checksOf = ({ r }) => r.rows.filter((x) => x.mode === mode).flatMap((x) => x.checks);
  const checks = runs.flatMap(checksOf);
  const drifted = runs.flatMap((run) => checksOf(run).filter((c) => run.drifted.has(c.fact)));
  const per = runs.map(({ r }) => r.summary.find((s) => s.mode === mode));
  return {
    mode,
    accuracy: pct(checks),
    accuracyDrifted: pct(drifted),
    staleErrors: per.reduce((a, s) => a + s.staleErrors, 0),
    avgContextTokens: avg(per.map((s) => s.avgContextTokens)),
    maxContextTokens: Math.max(...per.map((s) => s.avgContextTokens)),
    avgLatencyMs: avg(per.map((s) => s.avgLatencyMs)),
  };
});

const alex = runs.find((x) => x.id === 'alex')?.r ?? runs[0].r;
const out = {
  generated: runs.map(({ r }) => r.generated).sort().at(-1),
  build: 'staged (guard → writer → self-review → grader → contract)',
  models: { ...alex.models },
  people: runs.length,
  questions: runs.reduce((a, { r }) => a + r.questions, 0),
  checks: runs.reduce((a, { r }) => a + r.checks, 0),
  combined,
  perPerson: runs.map(({ label, r }) => ({ label, questions: r.questions, checks: r.checks, cards: r.cards.built, summary: r.summary.map(({ mode, accuracy, accuracyDrifted, staleErrors, avgContextTokens }) => ({ mode, accuracy, accuracyDrifted, staleErrors, avgContextTokens })) })),
  projection: alex.projection,
};
writeFileSync(join(ROOT, 'data', 'eval-summary.json'), JSON.stringify(out, null, 2) + '\n');
console.table(Object.fromEntries(combined.map((c) => [c.mode, { 'accuracy %': c.accuracy, 'changed outside chat %': c.accuracyDrifted, 'stale errors': c.staleErrors, 'avg tokens': c.avgContextTokens }])));
console.log('Saved data/eval-summary.json');
