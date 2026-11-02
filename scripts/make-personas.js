// Writes held-out synthetic personas for the eval (see eval/PERSONA_BRIEF.md): a week
// and more of chats plus an answer key, per person. Muse Spark writes them; this script
// checks every file (real message ids, counts, fact links) and asks again on a problem.
//
//   node scripts/make-personas.js              # all that don't exist yet
//   node scripts/make-personas.js daniel sofia # just these
//
// SYNTHETIC TEST DATA only. The eval reports these apart from the headline.

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { complete, parseJson } from '../src/platform/llm.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TODAY = '2026-11-02';
const KINDS = { stable: 8, outside: 4, inchat: 2, short: 2, sensitive: 2, oneoff: 2 }; // 20 questions

const PEOPLE = {
  daniel: { name: 'Daniel', p: 'd', life: 'Daniel, 29, Atlanta. Remote software engineer, lives alone, runs mornings.', stable: 'black coffee, no sugar; direct flights, hates layovers; cooks jollof rice on Sundays', change: 'gym evenings → 6am, because his meetings moved to evenings', short: 'no alcohol until his 10K race on Dec 6', sensitive: 'takes anxiety medication every night', oneoff: 'tried rock climbing once with friends', outside: 'now in the office Tue and Thu; swims instead of running since a pool opened nearby' },
  sofia: { name: 'Sofia', p: 's', life: 'Sofia, 41, Miami. School counselor, single mom of kids aged 8 and 11.', stable: 'Saturday farmers market; the kids want pasta on Fridays; prefers morning appointments', change: "the kids' soccer moved Tue → Thu evenings, so Thursday dinner must be quick", short: 'dairy-free trial until Nov 22', sensitive: 'custody paperwork in progress', oneoff: 'bought concert tickets once', outside: 'her 11-year-old went vegetarian; the farmers market moved to Sundays' },
  james: { name: 'James', p: 'j', life: 'James, 67, Portland. Retired teacher, widower, volunteers at the library.', stable: 'a morning walk; tea over coffee; mystery novels', change: 'book club Fri → Sat, because his library shift changed', short: 'hosting his grandkids Dec 18–24, needs kid-friendly meals that week', sensitive: 'takes heart medication daily', oneoff: 'did an escape room once', outside: 'stopped driving and takes the bus; switched to audiobooks for his eyes' },
  aisha: { name: 'Aisha', p: 'a', life: 'Aisha, 26, Seattle. Public health grad student with 2 roommates, bikes to campus.', stable: 'lentil soup meal prep on Sundays; bus over driving; studies late at the library', change: 'studying evenings → mornings, because her lab schedule changed', short: 'no caffeine after 2pm until finals end Dec 12', sensitive: 'visa renewal pending', oneoff: 'went to a wedding out of state once', outside: 'moved into her own studio with no roommates; now cooks for one' },
  luis: { name: 'Luis', p: 'l', life: 'Luis, 36, Denver. Firefighter on 24-on/48-off shifts, married, has a dog.', stable: 'chicken and rice meal prep; direct flights; weekend hikes', change: 'day off Mon → Wed, so Wednesday is hike day', short: 'no fried food until his fitness test Nov 30', sensitive: 'back injury, in physical therapy', oneoff: 'went fishing once', outside: 'switched to day shifts 7am–7pm; now takes one-stop flights when much cheaper' },
  grace: { name: 'Grace', p: 'g', life: 'Grace, 52, Boston. Bakery owner, married, kids grown.', stable: 'up at 4:30am; tea; bakes sourdough; evening dog walk', change: 'Friday takeout → cooking at home on Fridays, for budget', short: 'no weekends off until the holiday market ends Dec 20', sensitive: 'business loan payments, tight cash flow', oneoff: 'took a pottery class once', outside: 'hired a manager so Sundays are off now; switched from tea to coffee' },
  ethan: { name: 'Ethan', p: 'e', life: 'Ethan, 22, Nashville. College senior and part-time barista in a shared house.', stable: 'cold brew; lo-fi music to study; cheap eats; bikes everywhere', change: 'café shifts nights → mornings, so mornings are busy', short: 'no takeout spending until the semester ends Dec 10', sensitive: 'worried about student loan debt', oneoff: 'went to a music festival once', outside: 'got a remote internship so weekdays 9–5 are taken; sold his bike, uses an e-scooter' },
  fatima: { name: 'Fatima', p: 'f', life: 'Fatima, 33, Minneapolis. Pediatric physical therapist, married, toddler aged 2.', stable: 'home-cooked meals; toddler bedtime 7:30pm sharp; the park on weekends; trains over flights for short trips', change: 'daycare pickup 4pm → 5pm at a new location, so evenings shift later', short: 'family visiting Dec 5–8, needs the spare room set up', sensitive: 'postpartum health follow-up', oneoff: 'tried a new restaurant once for an anniversary', outside: 'toddler bedtime is now 8pm; they drive short trips now (car seat) instead of the train' },
  tom: { name: 'Tom', p: 't', life: 'Tom, 45, Columbus. Long-haul truck driver, divorced, kids 10 and 13 on weekends.', stable: 'audiobooks on drives; calls the kids Sunday evenings; direct routes, avoids tolls; weekend pickup Fri 6pm', change: 'home day Tue → Wed, so Wednesday is homework-help day', short: 'no late-night snacks while driving until Nov 28', sensitive: 'child support payment schedule', oneoff: 'went to a car show once', outside: 'has the kids every other weekend now, not every weekend; switched from audiobooks to podcasts' },
  rosa: { name: 'Rosa', p: 'r', life: 'Rosa, 58, Santa Fe. Retired nurse, lives with her partner, gardens, volunteers at a food bank.', stable: 'gardens in the morning; herbal tea; beans and rice; walks 3 miles a day', change: 'volunteer shift Mon → Wed mornings', short: 'hosting family for Thanksgiving Nov 26, needs a big meal plan that week', sensitive: 'arthritis in her hands, uses grip aids', oneoff: 'took a train trip to Chicago once', outside: 'her partner went vegetarian; she does tai chi on Tuesday mornings now' },
};

const HISTORY_SYSTEM = `You write SYNTHETIC test data: one person's chat history with their personal AI assistant, for an evaluation. Fictional people only, first names only (never a surname for anyone), and no emails, phone numbers or street addresses.
Write like a real person typing: lower case, short, sometimes off topic. Each fact comes up inside a real request ("find me a flight..."), never as a list of facts. Assistant replies are short (one or two sentences).
Return only JSON.`;

const historyPrompt = (x) => `Person: ${x.life}
Stable facts (each comes up 2-3 times, in different chats): ${x.stable}. Also invent 3 more stable facts that fit this life (a food or drink habit, a person they plan for and what that person likes, a routine), each 2-3 times.
A change made in chat: ${x.change}. First the old way once or twice, then later the new way with the reason and an explicit "don't do the old one anymore".
Short-term: ${x.short}. Stated twice, with the end date.
Sensitive: ${x.sensitive}. Exactly once.
One-off: ${x.oneoff}. Exactly once, clearly a one-time thing.
NEVER mention these (they changed outside chat): ${x.outside}.

Write 14 to 18 conversations dated 2026-10-20 to 2026-11-01 (at least 7 different days), with 45 to 60 user messages in all, plus a short assistant reply after each user message.
Message ids: "${x.p}001", "${x.p}002", ... unique and in order. Conversation ids: "${x.p}c01", "${x.p}c02", ...
JSON shape: {"user":{"name":"${x.name}"},"conversations":[{"id":"${x.p}c01","date":"2026-10-20","time":"07:40","title":"short title","messages":[{"id":"${x.p}001","role":"user","text":"..."},{"id":"${x.p}002","role":"assistant","text":"..."}]}]}`;

const KEY_SYSTEM = `You write the answer key for an evaluation of a personal AI agent's memory, from a SYNTHETIC chat history. Be exact: every fact cites the user messages it came from by their ids. Return only JSON.`;

const keyPrompt = (x, history) => `Person: ${x.life}
Facts that changed OUTSIDE chat (they are not in the history; the person would tell a memory reviewer): ${x.outside}.

The chat history:
${history.conversations.map((c) => `## ${c.date} ${c.title}\n` + c.messages.map((m) => `[${m.id}] ${m.role}: ${m.text}`).join('\n')).join('\n\n')}

Write the answer key as JSON:
{"today":"${TODAY}",
 "facts":[{"id":"${x.p.toUpperCase()}01","category":"food","text":"short fact","sources":["${x.p}001"]}, ...],
 "current_truth":{"<fact id>":{"action":"edit","text":"what is true now"},"<fact id>":{"action":"confirm"}},
 "questions":[{"id":"${x.p.toUpperCase()}Q01","kind":"stable","text":"an everyday request","checks":[{"text":"observable statement","kw":["word","phrase"],"want":true,"fact":"<fact id>"}]}]}

Rules:
- facts: every fact in the history (stable, both sides of the in-chat change, short-term, sensitive, one-off), each citing only USER message ids where it was said. The old side of the in-chat change gets "superseded_by": the new fact's id.
- current_truth: each outside-chat change as {"action":"edit","text":...} on the stable fact it changes (2 edits, or more if there are more changes), plus {"action":"confirm"} on 3 or 4 other stable facts.
- questions: exactly 20 everyday requests (plans, bookings, meals, gifts, schedules), each with "kind" and 1 to 3 checks:
  8 "stable" (the answer should use a stable fact),
  4 "outside" (only right if the answer follows current_truth; add a "want": false check for the old version where it fits),
  2 "inchat" (uses the new preference; one "want": false check for the old one),
  2 "short" (inside the short-term window; the answer respects it),
  2 "sensitive" (a request where the sensitive fact matters; "want": true that the answer takes it into account),
  2 "oneoff" (a "want": false check that the answer treats the one-off as a habit or preference).
- checks: short observable statements, always phrased as something the answer DOES. "want": true means the answer should do it; "want": false means it should not. So a trap is {"text":"Plans a morning run","want":false}, never "Does not plan a morning run".
- checks: 2 to 4 lower-case words or phrases that would appear in an answer that does it. fact: the fact id it tests.`;

function checkHistory(h, x) {
  const errs = [];
  const convs = h.conversations ?? [];
  const msgs = convs.flatMap((c) => c.messages ?? []);
  const user = msgs.filter((m) => m.role === 'user');
  const days = new Set(convs.map((c) => c.date));
  if (convs.length < 12) errs.push(`only ${convs.length} conversations (need 14+)`);
  if (days.size < 7) errs.push(`only ${days.size} different days (need 7+)`);
  if (user.length < 40) errs.push(`only ${user.length} user messages (need 45+)`);
  if (convs.some((c) => !/^2026-1[01]-\d\d$/.test(c.date) || c.date < '2026-10-20' || c.date > '2026-11-01')) errs.push('a date outside 2026-10-20..2026-11-01');
  if (new Set(msgs.map((m) => m.id)).size !== msgs.length) errs.push('duplicate message ids');
  if (msgs.some((m) => !String(m.id).startsWith(x.p) || !['user', 'assistant'].includes(m.role) || !m.text)) errs.push('a message with a bad id, role or empty text');
  return errs;
}

function checkKey(k, h) {
  const errs = [];
  const userIds = new Set(h.conversations.flatMap((c) => c.messages).filter((m) => m.role === 'user').map((m) => m.id));
  const facts = new Map((k.facts ?? []).map((f) => [f.id, f]));
  for (const f of facts.values()) {
    if (!f.sources?.length || f.sources.some((s) => !userIds.has(s))) errs.push(`fact ${f.id} cites a message that isn't a user message`);
    if (f.superseded_by && !facts.has(f.superseded_by)) errs.push(`fact ${f.id} superseded_by an unknown fact`);
  }
  if (![...facts.values()].some((f) => f.superseded_by)) errs.push('no superseded_by for the in-chat change');
  const truth = Object.entries(k.current_truth ?? {});
  if (truth.some(([id, t]) => !facts.has(id) || !['edit', 'confirm'].includes(t.action))) errs.push('current_truth names an unknown fact or action');
  if (truth.filter(([, t]) => t.action === 'edit').length < 2) errs.push('fewer than 2 outside-chat edits in current_truth');
  const qs = k.questions ?? [];
  if (qs.length !== 20) errs.push(`${qs.length} questions (need exactly 20)`);
  for (const [kind, n] of Object.entries(KINDS)) if (qs.filter((q) => q.kind === kind).length !== n) errs.push(`need ${n} "${kind}" questions`);
  for (const q of qs) for (const c of q.checks ?? []) {
    if (!c.text || typeof c.want !== 'boolean' || !facts.has(c.fact) || !Array.isArray(c.kw) || !c.kw.length) { errs.push(`question ${q.id} has a malformed check`); break; }
    // A negated statement flips the meaning of "want": always describe what the answer does.
    if (/^(does not|doesn't|do not|don't|never|no |avoids? (saying|suggesting|mentioning))/i.test(c.text.trim())) { errs.push(`question ${q.id}: check "${c.text}" is negated; phrase it as what the answer does and use "want"`); break; }
  }
  if (qs.some((q) => !q.checks?.length || q.checks.length > 3)) errs.push('a question with 0 or more than 3 checks');
  return errs;
}

async function ask(system, user, check, label) {
  let note = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await complete('main', [{ role: 'system', content: system }, { role: 'user', content: user + note }], { json: true, maxTokens: 16000, reasoning: 'low' });
    let out;
    try { out = parseJson(res.text); } catch { note = '\n\nYour last reply was not valid JSON. Return only the JSON.'; continue; }
    const errs = check(out);
    if (!errs.length) return out;
    console.warn(`  ${label}, try ${attempt}: ${errs.join('; ')}`);
    note = `\n\nYour last attempt had these problems; fix all of them:\n- ${errs.join('\n- ')}`;
  }
  throw new Error(`${label}: still failing after 3 tries`);
}

const named = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const wanted = named.length ? named : Object.keys(PEOPLE);
for (const id of wanted) {
  const x = PEOPLE[id];
  if (!x) { console.error(`Unknown persona ${id}`); continue; }
  const hPath = join(ROOT, 'data', 'personas', `${id}-history.json`);
  const kPath = join(ROOT, 'data', 'personas', `${id}-answer-key.json`);
  if (existsSync(hPath) && existsSync(kPath) && !named.length) { console.log(`${id}: exists, skipped`); continue; }
  // --key-only: keep the chats already written, redo the answer key.
  let history;
  if (process.argv.includes('--key-only') && existsSync(hPath)) history = JSON.parse(readFileSync(hPath, 'utf8'));
  else {
    console.log(`${id}: writing a week of chats…`);
    history = await ask(HISTORY_SYSTEM, historyPrompt(x), (h) => checkHistory(h, x), `${id} history`);
    history._label = `SYNTHETIC TEST DATA, held out. Persona ${x.life}`;
    history.user = { name: x.name };
  }
  console.log(`${id}: writing the answer key…`);
  const key = await ask(KEY_SYSTEM, keyPrompt(x, history), (k) => checkKey(k, history), `${id} key`);
  const out = { _label: `SYNTHETIC TEST DATA, held out. Ground truth for ${x.name}.`, today: TODAY, facts: key.facts, _current_truth: `What ${x.name} answers when shown each card. These changes never came up in chat.`, current_truth: key.current_truth, questions: key.questions };
  writeFileSync(hPath, JSON.stringify(history, null, 2) + '\n');
  writeFileSync(kPath, JSON.stringify(out, null, 2) + '\n');
  const users = history.conversations.flatMap((c) => c.messages).filter((m) => m.role === 'user').length;
  console.log(`${id}: ${history.conversations.length} chats over ${new Set(history.conversations.map((c) => c.date)).size} days, ${users} user messages, ${out.facts.length} facts, ${out.questions.length} questions, ${out.questions.reduce((a, q) => a + q.checks.length, 0)} checks`);
}
