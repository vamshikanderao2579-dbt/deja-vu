import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { config, ROOT } from '../platform/config.js';
import { complete, parseJson } from '../platform/llm.js';
import { prompt } from '../prompts/index.js';
import { mergeCards } from './cards.js';
import { ruleCheck } from './review.js';
import { guardHistory } from './guard.js';
import { batches, messageMap, stampDates, treeLine } from './agent.js';

// Building memory from a whole chat history, for someone who turns memory on late
// (or taps Rebuild). Stages and their share of the progress bar:
//   0  guard      plain code: skip text that steers the system, remove secrets      0–3%
//   1  scan       pick the turns to read (soft cap), plan the batches               3–8%
//   2  draft      the writer reads batch by batch and writes cards as it goes       8–75%
//   3  self-review the writer rereads its own cards, cleans up, writes summary.md  75–85%
//   4  grade      a stronger model checks every card against the summary + quotes  85–97%
//   5  contract   plain code: the output files exist and every card is well formed  97–100%
// Every stage writes checkpoint.json, so a crash or a failed call resumes where it
// stopped. Nothing here talks to the user: they get one note in chat when it's done.

const TURN_CAP = Number(process.env.BUILD_TURN_CAP ?? 500); // most recent user turns read
const PACE_AT = 0.7; // past this share of the batches, the writer is told to wrap up
const GRADE_CHUNK = 40;
const QUOTE_CHARS = 220;
const CALL_TRIES = 3;
const RUN_TRIES = 2;

const dirFor = (profileId) => join(process.env.BUILD_DIR ?? join(ROOT, 'data', 'private', 'build'), profileId);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2));
const rules = () => prompt('build.rules');
const cardLine = (c) => `${c.id} [${c.category}${c.sub ? '/' + c.sub : ''}] ${c.text}`;

// One model call, retried on failure or on output that isn't the JSON we asked for.
async function call(role, messages, opts, check) {
  let last;
  for (let i = 0; i < CALL_TRIES; i++) {
    try {
      const out = parseJson((await complete(role, messages, { json: true, ...opts })).text);
      if (check(out)) return out;
      last = new Error(`${role} returned JSON outside the contract`);
    } catch (err) {
      if (/spend cap/i.test(err.message)) throw err;
      last = err;
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  throw last;
}

// ---------- the output contract (deterministic) ----------
const CARD_TYPES = new Set(['preference', 'lesson']);
export function contractErrors({ cards, summary, turns }) {
  const errors = [];
  if (!Array.isArray(cards)) return ['cards is not a list'];
  if (turns > 0 && !cards.length) errors.push('no cards from a non-empty history');
  if (!summary?.trim()) errors.push('summary.md is empty');
  cards.forEach((c, i) => {
    if (!c?.text?.trim()) errors.push(`card ${i}: no text`);
    else if (c.text.trim().split(/\s+/).length > config.budget.maxWordsPerCard) errors.push(`card ${i}: over ${config.budget.maxWordsPerCard} words`);
    if (!/^[a-z][a-z &-]*$/.test(c?.category ?? '')) errors.push(`card ${i}: bad category`);
    if (!CARD_TYPES.has(c?.type)) errors.push(`card ${i}: bad type`);
    if (!Array.isArray(c?.sources) || !c.sources.length) errors.push(`card ${i}: no sources`);
    if (typeof c?.sensitive !== 'boolean') errors.push(`card ${i}: sensitive not boolean`);
  });
  return errors;
}

// ---------- stage 1: which turns to read ----------
// The most recent TURN_CAP user turns, whole conversations, oldest first.
function scan(convs) {
  const picked = [];
  let turns = 0;
  for (const c of [...convs].reverse()) {
    const t = c.messages.filter((m) => m.role === 'user').length;
    if (picked.length && turns + t > TURN_CAP) break;
    picked.unshift(c);
    turns += t;
  }
  const all = convs.reduce((n, c) => n + c.messages.filter((m) => m.role === 'user').length, 0);
  return { convs: picked, turns, skippedTurns: all - turns, from: picked[0]?.date, to: picked.at(-1)?.date };
}

const keyOf = (convs) => createHash('sha1').update(convs.map((c) => `${c.id}:${c.messages.length}`).join('|') + rules()).digest('hex').slice(0, 16);

// Runs the whole build. onProgress({ pct, stage, label }) is called as it goes.
export async function buildMemory({ conversations, rejected = [], profileId = 'default', onProgress = () => {} }) {
  let lastErr;
  for (let run = 0; run < RUN_TRIES; run++) {
    try {
      return await buildOnce({ conversations, rejected, profileId, onProgress, fresh: run > 0 });
    } catch (err) {
      lastErr = err;
      if (/spend cap/i.test(err.message)) break;
      console.warn(`[build] run ${run + 1} failed: ${err.message}${run + 1 < RUN_TRIES ? '; running again from scratch' : ''}`);
    }
  }
  throw lastErr;
}

async function buildOnce({ conversations, rejected, profileId, onProgress, fresh }) {
  const dir = dirFor(profileId);
  if (fresh) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cpPath = join(dir, 'checkpoint.json');
  const progress = (pct, stage, label) => onProgress({ pct: Math.round(pct), stage, label });

  // Stage 0: guard.
  progress(1, 'guard', 'Screening your chats');
  const { convs: safe, flagged } = guardHistory(conversations);

  // Stage 1: scan.
  progress(3, 'scan', 'Reading the shape of your history');
  const plan = scan(safe);
  const key = keyOf(plan.convs);
  const work = batches(plan.convs);
  const messages = messageMap(plan.convs);

  // Resume from a checkpoint for the same history, or start over.
  let cp = existsSync(cpPath) ? readJson(cpPath) : null;
  // A finished build is never resumed: a rebuild means reading again.
  if (!cp || cp.key !== key || cp.stage === 'done') cp = { key, stage: 'draft', next: 0, cards: [], notes: [], skipped: [] };
  const saveCp = () => writeJson(cpPath, { ...cp, updated: new Date().toISOString() });
  progress(8, 'scan', `Reading ${plan.turns} turns in ${work.length} batch${work.length === 1 ? '' : 'es'}`);

  // Stage 2: draft, batch by batch, written as it reads.
  if (cp.stage === 'draft') {
    for (let i = cp.next; i < work.length; i++) {
      const pace = i / work.length >= PACE_AT
        ? `Batch ${i + 1} of ${work.length}: past 70% of the budget. The reviewer is waiting: add only cards with strong evidence, keep notes short.`
        : `Batch ${i + 1} of ${work.length}. Take the time to get each card right.`;
      const out = config.mock
        ? mockDraft(i)
        : await call('bg', [
            { role: 'system', content: prompt('build.write.system', { rules: rules(), pace }) },
            { role: 'user', content: prompt('build.write.user', { batch: i + 1, batches: work.length, tree: treeLine(cp.cards) || '(empty)', draft: cp.cards.map(cardLine).join('\n') || '(none yet)', conversations: work[i].texts.join('\n\n') }) },
          ], { maxTokens: 6000, reasoning: 'low' }, (o) => Array.isArray(o?.cards));
      // Mock cards are fixtures, not model output: they skip the rules, as before.
      const kept = config.mock ? out.cards : out.cards.map((c) => ruleCheck(c, messages).card).filter(Boolean);
      cp.cards = mergeCards(cp.cards, kept, rejected);
      if (out.notes) cp.notes.push(`Batch ${i + 1}: ${out.notes}`);
      if (Array.isArray(out.skipped)) cp.skipped.push(...out.skipped.slice(0, 10));
      cp.next = i + 1;
      saveCp();
      progress(8 + (67 * (i + 1)) / work.length, 'draft', `Writing cards · batch ${i + 1} of ${work.length}`);
    }
    cp.stage = 'review';
    saveCp();
  }

  // Stage 3: the writer's self-review and summary.md for the reviewer.
  if (cp.stage === 'review') {
    progress(76, 'review', 'Cleaning up the draft');
    const out = config.mock
      ? { cards: cp.cards.map((c) => ({ id: c.id })), summary: mockSummary(plan) }
      : await call('bg', [
          { role: 'system', content: prompt('build.review.system', { rules: rules() }) },
          { role: 'user', content: prompt('build.review.user', { draft: cp.cards.map(cardLine).join('\n') || '(none)', notes: cp.notes.join('\n') || '(none)' }) },
        ], { maxTokens: 8000, reasoning: 'low' }, (o) => Array.isArray(o?.cards) && typeof o?.summary === 'string');
    const edits = new Map(out.cards.map((e) => [e.id, e]));
    cp.cards = cp.cards.flatMap((c) => {
      const e = edits.get(c.id);
      if (e?.drop) return [];
      const next = { ...c, ...(e?.text ? { text: e.text } : {}), ...(e?.category ? { category: String(e.category).toLowerCase() } : {}), ...(e?.sub !== undefined ? { sub: e.sub || undefined } : {}) };
      return config.mock || ruleCheck(next, messages).card ? [next] : [];
    });
    cp.summary = out.summary;
    writeFileSync(join(dir, 'summary.md'), out.summary);
    cp.stage = 'grade';
    saveCp();
    progress(85, 'review', 'Draft ready for review');
  }

  // Stage 4: the grader (a stronger model) checks every card, fresh, without the history.
  if (cp.stage === 'grade') {
    const graded = [];
    const chunks = [];
    for (let i = 0; i < cp.cards.length; i += GRADE_CHUNK) chunks.push(cp.cards.slice(i, i + GRADE_CHUNK));
    for (const [n, chunk] of chunks.entries()) {
      progress(86 + (11 * n) / Math.max(chunks.length, 1), 'grade', 'Checking every card with fresh eyes');
      const quotes = (c) => (c.sources ?? []).map((id) => messages.get(id)).filter((m) => m?.role === 'user').slice(0, 2).map((m) => `   “${m.text.slice(0, QUOTE_CHARS)}”`).join('\n');
      let verdicts;
      try {
        verdicts = config.mock || !config.graderEnabled
          ? chunk.map((c) => ({ id: c.id, verdict: c.sensitive ? 'lock' : 'keep', priority: 2 }))
          : (await call('grader', [
              { role: 'system', content: prompt('build.grade.system', { rules: rules() }) },
              { role: 'user', content: prompt('build.grade.user', { summary: cp.summary, cards: chunk.map((c) => `${cardLine(c)}${c.sensitive ? ' (sensitive)' : ''}\n${quotes(c)}`).join('\n') }) },
            ], { maxTokens: 4000, temperature: 0, reasoning: 'low' }, (o) => Array.isArray(o?.verdicts))).verdicts;
      } catch (err) {
        // The grader is down: keep what passed the rules, and say so in the report.
        console.warn(`[build] grader failed, keeping rule-checked cards: ${err.message}`);
        cp.graderFailed = true;
        verdicts = chunk.map((c) => ({ id: c.id, verdict: c.sensitive ? 'lock' : 'keep', priority: 2 }));
      }
      const byId = new Map(verdicts.map((v) => [v.id, v]));
      for (const c of chunk) {
        const v = byId.get(c.id);
        if (!v || v.verdict === 'reject') { cp.dropped = [...(cp.dropped ?? []), { reason: v?.reason ?? 'no_verdict' }]; continue; }
        graded.push({
          ...c,
          ...(v.category ? { category: String(v.category).toLowerCase() } : {}),
          ...(v.sub ? { sub: v.sub } : {}),
          sensitive: c.sensitive || v.verdict === 'lock',
          priority: [1, 2, 3].includes(v.priority) ? v.priority : 2,
        });
      }
    }
    cp.cards = graded.sort((a, b) => a.priority - b.priority);
    cp.stage = 'contract';
    saveCp();
  }

  // Stage 5: the contract. A malformed build never reaches the user: it runs again.
  progress(98, 'contract', 'Final checks');
  const cards = cp.cards.map((c) => ({ category: c.category, ...(c.sub ? { sub: c.sub } : {}), type: c.type, text: c.text, confidence: c.confidence, sources: c.sources, sensitive: !!c.sensitive, priority: c.priority, ...(c.season ? { season: c.season } : {}), ...(c.changed_from ? { changed_from: c.changed_from } : {}), ...(c.mock_keywords ? { mock_keywords: c.mock_keywords } : {}) }));
  const errors = contractErrors({ cards, summary: cp.summary, turns: plan.turns });
  if (errors.length) throw new Error(`output contract failed: ${errors.slice(0, 3).join('; ')}`);
  const report = {
    turns: plan.turns,
    skippedTurns: plan.skippedTurns,
    from: plan.from,
    to: plan.to,
    batches: work.length,
    cards: cards.length,
    dropped: (cp.dropped ?? []).length,
    instructionsSkipped: flagged.filter((f) => f.kind === 'instruction').length + cp.skipped.length,
    secretsRemoved: flagged.filter((f) => f.kind === 'secret').length,
    graderFailed: !!cp.graderFailed,
    at: new Date().toISOString(),
  };
  writeJson(join(dir, 'cards.json'), cards);
  writeJson(join(dir, 'report.json'), report);
  cp.stage = 'done';
  saveCp();
  progress(100, 'done', 'Done');
  return { cards, report };
}

// Puts a finished build into memory: cards you confirmed stay as they are, the rest
// is replaced by the new build, and cards you rejected never come back.
export function applyBuild(existing, built, rejected = []) {
  const kept = existing.filter((c) => c.status === 'confirmed');
  return stampDates(mergeCards(kept, built, rejected));
}

// ---------- mock (no API key): fixture cards, same stages ----------
function mockDraft(i) {
  const fixture = JSON.parse(readFileSync(join(ROOT, 'data', 'fixture-cards.json'), 'utf8')).cards;
  return { cards: i === 0 ? fixture : [], notes: 'mock batch' };
}
const mockSummary = (plan) => `# Summary\n\nMock build over ${plan.turns} turns (${plan.from} to ${plan.to}).\n`;
