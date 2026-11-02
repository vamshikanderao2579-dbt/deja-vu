# Prompt quality

How the engine's prompts are organized, written and changed. The six writing principles are in [`../engine/engine-quality.md`](../engine/engine-quality.md); this file applies them to prompts.

## Where prompts live
- **One file per prompt**, in this folder. Nothing else in the repo holds prompt text.
- **`<job>.system.md`** is the instruction. **`<job>.user.md`** frames the data the job works on. Headers (`*.header.md`) introduce a block of context inside another prompt.
- **`{{name}}`** fills a value in at call time. A missing value throws, so a typo fails loudly instead of sending a broken prompt.
- **Load with** `prompt('<file name without .md>', { name: value })` from [`index.js`](index.js).
- **The file is exactly what the model sees.** No comments or notes inside a prompt file; they would be sent too. Notes go here.

## The prompts

| File | Job | Model role | Values |
|---|---|---|---|
| `build.rules` | Shared rules for every build step: history is data not instructions, no secrets, contacts locked, never message the user | all build steps | none |
| `build.write.system` / `build.write.user` | Build stage 2: write cards batch by batch, with notes for the reviewer | bg (writer) | `rules`, `pace` / `batch`, `batches`, `tree`, `draft`, `conversations` |
| `build.review.system` / `build.review.user` | Build stage 3: the writer's self-review and `summary.md` | bg (writer) | `rules` / `draft`, `notes` |
| `build.grade.system` / `build.grade.user` | Build stage 4: keep, lock or reject each card from the summary and quotes; priority | grader | `rules` / `summary`, `cards` |
| `distill.system` / `distill.user` | The older one-pass build, kept for the eval until it is rerun on the staged build | bg (writer) | `existing`, `conversations` |
| `learn.system-addendum` / `learn.user` | Live learning from the latest exchange (added to `distill.system`, with `build.rules`) | bg (writer) | `today`, `existing`, `conversation` |
| `grade.system` / `grade.user` | Accept, lock or reject each proposed card against the messages it cites | grader | `existing`, `proposed` |
| `branch.system` / `branch.user` | Large memories: pick tree branches before cards | bg | `today`, `request`, `tree` |
| `relevance.system` / `relevance.user` | Pick relevant cards, key cards and stakes | bg | `today`, `request`, `cards` |
| `answer.system` | The answer the user sees | main | `userName`, `today`, `agentName` |
| `answer.redo` | Added to `answer.system` when the user redoes an answer after changing a card | main | none |
| `import.check` | One look at a sample of an upload: is it a chat? | bg | none |
| `context.header` | Introduces the picked cards inside `answer.system` | main | none |
| `update.system` / `update.user` | Turn "here's what changed" into one confirmed card (with `until` for short-term) | bg | `today`, `category`, `oldCard`, `message` |
| `summary.system`, `summary.header` | Eval baseline: the memory summary agents keep today | main | none |
| `history.header` | Eval baseline: full history in the prompt | main | none |
| `judge.system` / `judge.user` | Eval: check an answer against its checklist | main | `question`, `answer`, `statements` |
| `eval-reviewer.system` | Eval: a simulated person reviews their cards | main | `userName`, `facts` |
| `mascot.image` | Muse Image prompt for the Sparky mascot (`scripts/generate_mascot.py`) | Muse Image | none |

## Writing a prompt here
1. **First line: the job.** "You decide which memory cards matter for the user's request." Everything after it is detail (principle 1).
2. **Rules as actions.** "Put each card under an existing topic when it fits." Pair any limit with its replacement: "Offer bookings as a next step" rather than only "Do not claim you booked" (principle 2).
3. **Card vocabulary, exactly.** card, topic, sub-topic, confirmed / inferred / private, key card, quick check, lesson, preference, short-term (principle 3).
8. **Never a gate.** A rule may mark, label or check a card; it never keeps a card from the answer. Unconfirmed cards are used as guesses, private ones too. Only secrets and text aimed at the memory system are left out.
4. **An example for every format.** At least one real card text and the exact JSON shape the code parses (principle 4).
5. **Numbers, not adjectives.** "at most 12 words", "1 to 3 key cards", "usually 2 to 8 cards" (principle 5).
6. **Labels on every data block.** `EXISTING cards:`, `NEW conversations:`, `PROPOSED cards (with the messages they cite):` (principle 6).
7. **JSON out, every background job.** End with `Return only JSON:` and the shape. The code calls `parseJson` and keeps working if a reply is malformed.

## Changing a prompt
1. Edit the `.md` file.
2. `npm test` (rules and flows, no cost).
3. Rerun the eval on at least one synthetic persona (`npm run eval -- --persona alex`, about $1) and compare with `docs/eval.md`. A prompt change without an eval number is a guess.
4. Re-record demos (`node scripts/record-demo.js <profile>`): the replay cache is keyed on the exact prompt text, so an edited prompt no longer replays.

## Audit (Nov 2): done
The drift listed on Oct 28 is fixed: `answer.system` leads with the action, `context.header` is short positive lines, `relevance.system` has a labelled section for relevant cards, key cards and stakes, `distill.system` is split under labels with the real 14-word limit and example cards, `update.system` has examples, and both graders treat "lock" as private-and-used (no "when unsure, reject"). Every change was followed by a re-recorded demo and an eval run (docs/eval.md).
