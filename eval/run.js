// Eval: does bounded, user-confirmed context beat full history and inferred-only memory?
//
//   node eval/run.js                 # all modes, writes eval/results/latest.json
//   node eval/run.js --concurrency 2
//
// Modes
//   full       the whole chat history in every prompt (how "remember everything" scales)
//   inferred   cards extracted from history, nothing confirmed (memory as agents do it today)
//   confirmed  the same cards after one review pass by a simulated user
//   summary    a memory summary written once from all history, sent with every message
//              (how compact-memory agents work today)
//   none       no memory (baseline)
//
// Without an API key this runs in mock mode with a keyword judge, which only
// checks the plumbing. Real numbers need MAIN_API_KEY.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const key = JSON.parse(readFileSync(join(ROOT, 'data', 'answer-key.json'), 'utf8'));
process.env.DEMO_TODAY ??= key.today; // answers must agree on what "today" is

const { config } = await import('../src/config.js');
const { distill, selectRelevant, answer, summarizeHistory } = await import('../src/agent.js');
const { applyCardAction, estimateTokens, renderContext } = await import('../src/cards.js');
const { complete, parseJson } = await import('../src/llm.js');
const { JUDGE_SYSTEM } = await import('../src/prompts.js');
const { history, historyAsText } = await import('../src/store.js');

const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const CONCURRENCY = Number(arg('concurrency', 3));
const MODES = ['full', 'summary', 'inferred', 'confirmed', 'none'];
const factsById = Object.fromEntries(key.facts.map((f) => [f.id, f]));

const log = (...a) => console.log(...a);
log(`\nEval · ${config.mock ? 'MOCK (keyword judge, plumbing check only)' : `live · answers ${config.providers.main.model} · memory ${config.providers.bg.model}`}`);

// ---------- 1. Build cards from history ----------
let t0 = Date.now();
const built = await distill([], []);
const inferredCards = built.cards;
log(`Built ${inferredCards.length} cards in ${((Date.now() - t0) / 1000).toFixed(1)}s (${built.calls} model calls)`);

// ---------- 2. Simulated review pass ----------
// Each card is matched to the planted fact it came from (by shared source
// messages), and the simulated user answers with the current truth.
function factFor(card) {
  let best = null, bestOverlap = 0;
  for (const f of key.facts) {
    const overlap = f.sources.filter((s) => card.sources?.includes(s)).length;
    // On a tie, prefer the current fact over one it superseded: a card citing both
    // the old and the new message describes the new state.
    if (overlap > bestOverlap || (overlap && overlap === bestOverlap && best?.superseded_by === f.id)) [best, bestOverlap] = [f, overlap];
  }
  return best;
}

const reviewState = { cards: structuredClone(inferredCards), rejected: [] };
const swipes = { confirm: 0, edit: 0, reject: 0, unmatched: 0 };
for (const card of structuredClone(inferredCards)) {
  const fact = factFor(card);
  if (!fact) { swipes.unmatched++; continue; }
  const truth = key.current_truth[fact.id];
  if (fact.superseded_by) { applyCardAction(reviewState, card.id, 'reject'); swipes.reject++; }
  else if (truth?.action === 'edit') { applyCardAction(reviewState, card.id, 'edit', truth.text); swipes.edit++; }
  else if (truth?.action === 'reject') { applyCardAction(reviewState, card.id, 'reject'); swipes.reject++; }
  else { applyCardAction(reviewState, card.id, 'confirm'); swipes.confirm++; }
}
const confirmedCards = reviewState.cards;
log(`Review pass: ${swipes.confirm} confirmed, ${swipes.edit} edited, ${swipes.reject} rejected, ${swipes.unmatched} not matched to a planted fact`);

// ---------- 2b. Baseline memory summary ----------
const memorySummary = config.mock
  ? key.facts.filter((f) => !f.superseded_by).map((f) => f.text).join('. ')
  : await summarizeHistory();
log(`Memory summary: ~${estimateTokens(memorySummary)} tokens`);

// ---------- 3. Answer every question in every mode ----------
async function runOne(q, mode) {
  const start = Date.now();
  let relevant = [];
  if (mode === 'inferred' || mode === 'confirmed') {
    ({ relevant } = await selectRelevant(q.text, mode === 'inferred' ? inferredCards : confirmedCards));
  }
  const res = await answer(q.text, ['full', 'summary', 'none'].includes(mode) ? mode : 'cards', relevant, { summary: memorySummary });
  return {
    question: q.id,
    mode,
    text: res.text,
    cardsUsed: relevant.map((c) => c.text),
    contextTokens: res.contextTokens,
    promptTokens: res.usage?.prompt_tokens ?? null,
    latencyMs: Date.now() - start,
  };
}

// ---------- 4. Judge ----------
function keywordJudge(text, checks) {
  const t = text.toLowerCase();
  return checks.map((c) => c.kw.some((k) => t.includes(k.toLowerCase())));
}

async function llmJudge(q, text) {
  const statements = q.checks.map((c, i) => `${i + 1}. ${c.text}`).join('\n');
  const res = await complete(
    'main',
    [
      { role: 'system', content: JUDGE_SYSTEM },
      { role: 'user', content: `Question: ${q.text}\n\nAnswer:\n${text}\n\nStatements:\n${statements}` },
    ],
    { json: true, maxTokens: 3000, temperature: 0, reasoning: 'minimal' }
  );
  const results = parseJson(res.text).results;
  if (!Array.isArray(results) || results.length !== q.checks.length) throw new Error(`Judge returned ${JSON.stringify(results)} for ${q.id}`);
  return results.map(Boolean);
}

// One retry, then give up on this answer rather than the whole run.
async function judgeSafely(q, text) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await llmJudge(q, text);
    } catch (err) {
      if (attempt === 2) {
        console.warn(`\n  judge failed on ${q.id}: ${err.message}`);
        return null;
      }
    }
  }
}

const jobs = key.questions.flatMap((q) => MODES.map((mode) => ({ q, mode })));
const rows = [];
let done = 0;
async function worker() {
  while (jobs.length) {
    const { q, mode } = jobs.shift();
    const row = await runOne(q, mode);
    const said = config.mock ? keywordJudge(row.text, q.checks) : await judgeSafely(q, row.text);
    row.judged = !!said;
    row.checks = said ? q.checks.map((c, i) => ({ text: c.text, fact: c.fact, want: c.want, said: said[i], pass: said[i] === c.want })) : [];
    rows.push(row);
    done++;
    if (process.stdout.isTTY) process.stdout.write(`\r  answered ${done}/${key.questions.length * MODES.length}`);
  }
}
t0 = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
log(`\n  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ---------- 5. Aggregate ----------
const drifted = new Set(Object.keys(key.current_truth));
const changedInChat = new Set(key.facts.filter((f) => f.superseded_by).flatMap((f) => [f.id, f.superseded_by]));
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (xs) => (xs.length ? Math.round((xs.filter((c) => c.pass).length / xs.length) * 100) : null);

const summary = MODES.map((mode) => {
  const rs = rows.filter((r) => r.mode === mode);
  const checks = rs.flatMap((r) => r.checks);
  return {
    mode,
    unjudged: rs.filter((r) => !r.judged).length,
    accuracy: pct(checks),
    accuracyDrifted: pct(checks.filter((c) => drifted.has(c.fact))),
    accuracyChangedInChat: pct(checks.filter((c) => changedInChat.has(c.fact))),
    accuracyStable: pct(checks.filter((c) => !drifted.has(c.fact) && !changedInChat.has(c.fact))),
    staleErrors: checks.filter((c) => !c.want && c.said).length,
    avgContextTokens: Math.round(avg(rs.map((r) => r.contextTokens))),
    avgPromptTokens: rs.every((r) => r.promptTokens != null) ? Math.round(avg(rs.map((r) => r.promptTokens))) : null,
    avgLatencyMs: Math.round(avg(rs.map((r) => r.latencyMs))),
  };
});

// ---------- 6. Projection: how context grows with months of use ----------
// Full history grows with every conversation; cards are capped by the budget.
const tokensPerConversation = estimateTokens(historyAsText()) / history.conversations.length;
const CONV_PER_DAY = 2;
const allCardsTokens = estimateTokens(renderContext(confirmedCards));
const b = config.budget;
const cardCeiling = Math.round(b.maxCategories * b.maxCardsPerCategory * b.maxWordsPerCard * 1.4);
const confirmedAvg = summary.find((s) => s.mode === 'confirmed').avgContextTokens;
const projection = [1, 3, 6, 12, 24].map((months) => ({
  months,
  fullHistory: Math.round(tokensPerConversation * CONV_PER_DAY * 30 * months),
  cardsPerQuestion: confirmedAvg,
  // A memory summary stays roughly fixed in size but is sent whole every message.
  summaryPerMessage: estimateTokens(memorySummary),
  cardsCeiling: cardCeiling,
}));

// ---------- 7. Save + print ----------
const result = {
  generated: new Date().toISOString(),
  mock: config.mock,
  models: { answers: config.providers.main.model, memory: config.providers.bg.model, judge: config.mock ? 'keyword' : config.providers.main.model },
  today: key.today,
  questions: key.questions.length,
  checks: key.questions.reduce((a, q) => a + q.checks.length, 0),
  cards: { built: inferredCards.length, afterReview: confirmedCards.length, allCardsTokens, swipes },
  memorySummary: { tokens: estimateTokens(memorySummary), text: memorySummary },
  summary,
  projection: { assumptions: { conversationsPerDay: CONV_PER_DAY, tokensPerConversation: Math.round(tokensPerConversation) }, points: projection },
  rows: rows.sort((a, b) => a.question.localeCompare(b.question) || MODES.indexOf(a.mode) - MODES.indexOf(b.mode)),
};
const dir = join(ROOT, 'eval', 'results');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'latest.json'), JSON.stringify(result, null, 2));
writeFileSync(join(dir, `${result.generated.replace(/[:.]/g, '-')}${config.mock ? '-mock' : ''}.json`), JSON.stringify(result, null, 2));

log('');
console.table(
  Object.fromEntries(
    summary.map((s) => [
      s.mode,
      {
        'accuracy %': s.accuracy,
        'drifted %': s.accuracyDrifted,
        'changed-in-chat %': s.accuracyChangedInChat,
        'stable %': s.accuracyStable,
        'stale errors': s.staleErrors,
        'context tok': s.avgContextTokens,
        'latency ms': s.avgLatencyMs,
      },
    ])
  )
);
log(`Projection at ${CONV_PER_DAY} chats/day: 12 months of full history ≈ ${projection[3].fullHistory.toLocaleString()} tokens per prompt; confirmed cards ≈ ${confirmedAvg} per question (ceiling ${cardCeiling}).`);
log(`Saved eval/results/latest.json${config.mock ? '  (MOCK: not real results)' : ''}\n`);
