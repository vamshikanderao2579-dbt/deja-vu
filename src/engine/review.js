import { config } from '../platform/config.js';
import { complete, parseJson } from '../platform/llm.js';
import { prompt } from '../prompts/index.js';
import { hasSecret, hasContact } from './guard.js';

// The gate every new card passes before it enters memory:
//   1. code rules (free, deterministic): length, evidence from the user, no traits,
//      nothing about the agent, sensitive topics always locked
//   2. the grader model (a different model from the one that wrote the card):
//      is it supported by the cited messages, lasting, new?
// Only cards that pass both are merged.

const TRAIT = /\b(personality|introvert(ed)?|extrovert(ed)?|narcissis\w*|insecure|selfish|perfectionist|type a|is (very |quite |a bit |an? )?(lazy|shy|moody|impatient|stubborn|emotional|smart|intelligent|controlling|anxious|confident|naive))\b/i;
const SENSITIVE = /\b(salary|income|debts?|loans?|mortgage|credit card|bank account|tax(es)?|visa|green card|h-?1b|immigration|diagnos\w*|medication|prescription|therapy|therapist|pregnan\w*|surgery|religio\w*|halal|kosher|home address|lives at)\b/i;
const ABOUT_AGENT = /\b(avatar|the assistant|assistant's|agent's name|pikachu|charmander)\b/i;

const SOURCE_CHARS = 300;
const MAX_SOURCES = 3;

// Returns { card } (possibly with sensitive forced on) or { reason } to drop it.
export function ruleCheck(raw, messages) {
  if (!raw?.text?.trim() || !raw?.category) return { reason: 'empty' };
  const text = String(raw.text).trim();
  if (text.split(/\s+/).length > config.budget.maxWordsPerCard) return { reason: 'too_long' };
  const category = String(raw.category).toLowerCase().trim();
  if (category === 'assistant' || ABOUT_AGENT.test(text) || new RegExp(`\\b${escape(config.agent.name)}\\b`, 'i').test(text)) return { reason: 'about_agent' };
  if (TRAIT.test(text)) return { reason: 'trait' };
  if (hasSecret(text)) return { reason: 'secret' };
  // Evidence: at least one cited message the user wrote themselves.
  const cited = (raw.sources ?? []).map((id) => messages.get(id)).filter(Boolean);
  if (!cited.some((m) => m.role === 'user')) return { reason: 'no_user_source' };
  // Phone numbers and emails may be kept, but only locked, under "sensitive".
  if (hasContact(text)) return { card: { ...raw, text, category: 'sensitive', sensitive: true } };
  const sensitive = !!raw.sensitive || SENSITIVE.test(text);
  return { card: { ...raw, text, category, sensitive } };
}

// Dropped cards are logged for the Memory view; never log a sensitive one's words.
const shown = (text = '') => (SENSITIVE.test(text) ? '🔒 sensitive card' : text);
const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Asks the grader model about every candidate in one call.
// Returns one { verdict, reason } per candidate, in order.
export async function gradeWithModel(candidates, { existing, messages }) {
  const existingIds = new Set(existing.map((c) => c.id));
  const list = candidates.map((c, i) => {
    const src = (c.sources ?? []).slice(0, MAX_SOURCES).map((id) => {
      const m = messages.get(id);
      return m ? `    [${m.role}] ${m.text.slice(0, SOURCE_CHARS)}` : null;
    }).filter(Boolean).join('\n');
    const tag = c.id && existingIds.has(c.id) ? ` (UPDATE of ${c.id})` : '';
    return `${i}. [${c.category}${c.sub ? '/' + c.sub : ''}] ${c.text}${tag}\n${src}`;
  }).join('\n');
  const known = existing.map((c) => `${c.id}: ${c.text}`).join('\n') || '(none)';
  const res = await complete('grader', [
    { role: 'system', content: prompt('grade.system') },
    { role: 'user', content: prompt('grade.user', { existing: known, proposed: list }) },
  ], { json: true, maxTokens: 3000, temperature: 0, reasoning: 'minimal' });
  const verdicts = parseJson(res.text).verdicts ?? [];
  return candidates.map((_, i) => {
    const v = verdicts.find((x) => Number(x.i) === i) ?? verdicts[i];
    // A card the grader skipped is kept: silence isn't a rejection.
    if (!v) return { verdict: 'accept' };
    const verdict = ['accept', 'lock', 'reject'].includes(v.verdict) ? v.verdict : 'accept';
    return { verdict, reason: v.reason };
  });
}

export const emptyReviewStats = () => ({ proposed: 0, kept: 0, locked: 0, byRules: {}, byGrader: {}, graderCalls: 0, graderErrors: 0 });

// Screen freshly extracted cards. `messages` maps message id → { role, text }.
// Returns the cards to merge, review stats, and the dropped cards with reasons.
export async function reviewCards(incoming, { existing = [], messages, grade = gradeWithModel } = {}) {
  const stats = emptyReviewStats();
  const dropped = [];
  stats.proposed = incoming.length;

  const passed = [];
  for (const raw of incoming) {
    const r = ruleCheck(raw, messages);
    if (r.reason) {
      stats.byRules[r.reason] = (stats.byRules[r.reason] ?? 0) + 1;
      dropped.push({ text: shown(raw?.text), by: 'rules', reason: r.reason });
    } else passed.push(r.card);
  }

  let kept = passed;
  if (passed.length && config.graderEnabled && !config.mock) {
    try {
      const verdicts = await grade(passed, { existing, messages });
      stats.graderCalls++;
      kept = [];
      passed.forEach((card, i) => {
        const v = verdicts[i];
        if (v.verdict === 'reject') {
          const reason = v.reason || 'rejected';
          stats.byGrader[reason] = (stats.byGrader[reason] ?? 0) + 1;
          dropped.push({ text: shown(card.text), by: 'grader', reason });
        } else kept.push(v.verdict === 'lock' ? { ...card, sensitive: true } : card);
      });
    } catch (err) {
      // The grader must never block learning: fall back to the code rules alone.
      stats.graderErrors++;
      console.warn('[review] grader unavailable, keeping rule-checked cards:', err.message);
    }
  }
  stats.kept = kept.length;
  stats.locked = kept.filter((c) => c.sensitive).length;
  return { kept, stats, dropped };
}

// Adds one review's numbers into a running total.
export function addReviewStats(total = emptyReviewStats(), add) {
  const out = { ...emptyReviewStats(), ...total, byRules: { ...total.byRules }, byGrader: { ...total.byGrader } };
  for (const k of ['proposed', 'kept', 'locked', 'graderCalls', 'graderErrors']) out[k] += add[k] ?? 0;
  for (const k of ['byRules', 'byGrader']) for (const [r, n] of Object.entries(add[k] ?? {})) out[k][r] = (out[k][r] ?? 0) + n;
  return out;
}
