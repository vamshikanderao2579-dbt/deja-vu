# Prompt quality

How the engine's prompts are organized, written and changed. The six writing principles are in [`../engine-quality.md`](../engine-quality.md); this file applies them to prompts.

## Where prompts live
- **One file per prompt**, in this folder. Nothing else in the repo holds prompt text.
- **`<job>.system.md`** is the instruction. **`<job>.user.md`** frames the data the job works on. Headers (`*.header.md`) introduce a block of context inside another prompt.
- **`{{name}}`** fills a value in at call time. A missing value throws, so a typo fails loudly instead of sending a broken prompt.
- **Load with** `prompt('<file name without .md>', { name: value })` from [`index.js`](index.js).
- **The file is exactly what the model sees.** No comments or notes inside a prompt file; they would be sent too. Notes go here.

## The prompts

| File | Job | Model role | Values |
|---|---|---|---|
| `distill.system` / `distill.user` | Build cards from chat history, a batch at a time | bg (writer) | `existing`, `conversations` |
| `learn.system-addendum` / `learn.user` | Live learning from the latest exchange (added to `distill.system`) | bg (writer) | `existing`, `conversation` |
| `grade.system` / `grade.user` | Accept, lock or reject each proposed card against the messages it cites | grader | `existing`, `proposed` |
| `branch.system` / `branch.user` | Large memories: pick tree branches before cards | bg | `today`, `request`, `tree` |
| `relevance.system` / `relevance.user` | Pick relevant cards, key cards and stakes | bg | `today`, `request`, `cards` |
| `answer.system` | The answer the user sees | main | `userName`, `today`, `agentName` |
| `context.header` | Introduces the picked cards inside `answer.system` | main | none |
| `update.system` / `update.user` | Turn "here's what changed" into one confirmed card | bg | `category`, `oldCard`, `message` |
| `summary.system`, `summary.header` | Eval baseline: the memory summary agents keep today | main | none |
| `history.header` | Eval baseline: full history in the prompt | main | none |
| `judge.system` / `judge.user` | Eval: check an answer against its checklist | main | `question`, `answer`, `statements` |
| `eval-reviewer.system` | Eval: a simulated person reviews their cards | main | `userName`, `facts` |
| `mascot.image` | Muse Image prompt for the Sparky mascot (`scripts/generate_mascot.py`) | Muse Image | none |

## Writing a prompt here
1. **First line: the job.** "You decide which memory cards matter for the user's request." Everything after it is detail (principle 1).
2. **Rules as actions.** "Put each card under an existing topic when it fits." Pair any limit with its replacement: "Offer bookings as a next step" rather than only "Do not claim you booked" (principle 2).
3. **Card vocabulary, exactly.** card, topic, sub-topic, confirmed / inferred / locked, key card, quick check, lesson, preference (principle 3).
4. **An example for every format.** At least one real card text and the exact JSON shape the code parses (principle 4).
5. **Numbers, not adjectives.** "at most 12 words", "1 to 3 key cards", "usually 2 to 8 cards" (principle 5).
6. **Labels on every data block.** `EXISTING cards:`, `NEW conversations:`, `PROPOSED cards (with the messages they cite):` (principle 6).
7. **JSON out, every background job.** End with `Return only JSON:` and the shape. The code calls `parseJson` and keeps working if a reply is malformed.

## Changing a prompt
1. Edit the `.md` file.
2. `npm test` (rules and flows, no cost).
3. Rerun the eval on at least one synthetic persona (`npm run eval -- --persona alex`, about $1) and compare with `docs/eval.md`. A prompt change without an eval number is a guess.
4. Re-record demos (`node scripts/record-demo.js <profile>`): the replay cache is keyed on the exact prompt text, so an edited prompt no longer replays.

## Audit: where today's prompts drift from the principles
These prompts were moved here word for word, so recorded demos and the Oct 28 eval numbers still hold. A rewrite pass should fix the following, measured with the eval before and after (to-do.md):
- **`distill.system`:** says "at most 12 words" while the code allows 14 (principle 3). One long bullet list mixes card format, tree placement, seasonal rules, style and sensitivity; split it under short labels (principles 1, 6). No example card (principle 4).
- **`answer.system`:** "Do not claim you booked or ordered anything" and "Never call the user…" lead with the boundary; lead with the action instead (principle 2). This prompt changes anyway when the gated booking action lands.
- **`context.header`:** one long sentence carries three instructions plus "No brackets or tags, and don't introduce yourself"; split into short positive lines (principles 2, 5).
- **`relevance.system`:** the stakes rule and the key-card rule sit in one paragraph; give each its own label (principle 6).
- **`update.system`:** no example of a good rewrite (principle 4).
- **`grade.system`, `judge.system`:** already close; keep them as the model for the others.
