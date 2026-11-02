# Handoff: Nov 2, 2026 (switching laptops)

For the next agent or chat. Read this first, then `.agents/` (README → context → rules → decisions). `.agents/to-do.md` dates from Oct 29: use this file for what's current.

**Déjà Vu** is a confirmed-memory layer any personal agent can add: infer-then-confirm, user-owned, bounded. It is not a chatbot. The chat in the app is a demo agent, Pip, with Déjà Vu memory. It was built for the Meta Global AI Developer Hackathon (Indie track). **Submissions close Tue Nov 4, 9 PM ET.**

## Where things are

| What | Where |
|---|---|
| Live app (Modal) | https://vamshikanderao2579-dbt--deja-vu-web.us-east.modal.run, running the same code as `main` |
| Repo | https://github.com/vamshikanderao2579-dbt/deja-vu-confirmed-memory, public (renamed from `deja-vu` on Nov 2). Use this name everywhere: app, README, decks, submission. Don't rely on GitHub's redirect |
| Working folder | `/Users/vamshi/Documents/GitHub/deja-vu`. All work happens here, nowhere else |
| Full deck, 15 slides | `docs/decks/full.html` |
| Short deck, 6 slides + Alex demo | `docs/decks/short.html` |
| Deck sources | `docs/decks/full/`, `docs/decks/short/` (`deck.json` + `slides/*.html`). After editing, run `python3 scripts/build-decks.py` |
| Eval method and per-person tables | `docs/eval.md`; results in `data/eval-summary.json` (also in the app under Insights) |
| Prompts and their quality bar | `src/prompts/*.md`, `src/prompts/prompt-quality.md` |
| Project memory for agents | `.agents/` (rules, decisions, history, playbooks in `.agents/skills/`) |

Decks are edited only in `docs/decks/` (sources, then rebuild). The old claude.ai copies are no longer updated. The HTML files work anywhere: open one in a browser. Keys: ← →, **N** speaker notes, **F** full screen, **P** print / save as PDF.

## Set up the new laptop

1. The repo is already cloned at `/Users/vamshi/Documents/GitHub/deja-vu`. Node 18+, no npm install needed. This laptop had Node v14 on Nov 2, so `npm test` failed with `bad option: --test` until Node was upgraded.
2. Copy these git-ignored files from the old laptop privately (AirDrop or USB). **Never** send them through git, chat or an AI tool:
   - `.env`: the Meta Model API key and local settings. Template: `.env.example`.
   - `deploy/deploy.env`: the public link's key and spend caps.
   - `data/private/`: the two real chat histories and their answer keys, eval builds and caches (~5 MB). The eval needs it for the two real people. The app runs without it.
   - `~/.modal.toml`: the Modal login. Or run `modal token new` after step 3.
3. To deploy: `/opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv-deploy && .venv-deploy/bin/pip install modal` (needs Python 3.10+: the Mac's own 3.9 caps Modal at 1.2.6, which the workspace rejects), then `.venv-deploy/bin/modal token new` once.
4. Check it: `npm test` (65 pass, mock mode, $0), then `npm start` → http://localhost:3000.

## Commands

```bash
npm test                                            # 65 tests, mock mode
npm start                                           # local app on :3000
node eval/run.js --persona grace                    # one person, ~$0.60–0.80
node eval/summarize.js                              # pool results → data/eval-summary.json
node scripts/make-persona-memories.js               # eval builds → data/personas/<id>-memory.json (demo memories)
.venv-deploy/bin/modal deploy deploy/modal_app.py   # deploy the public link
python3 scripts/build-decks.py                      # rebuild docs/decks/*.html
```

Demo replay: record with the `record-replay` launch config (port 3002), then check with `replay-check` (port 3003, model calls off). Play both the Alex and Maria tours. The `replay-check` logs must show only `[replay hit]`. Steps: `.agents/skills/record-demo.md`. Any change to the answer, learn, distill or build prompts changes the cache keys, so re-record after it.

## Current numbers (Nov 2, after the builder fix)

| | Déjà Vu memory | Summary | Full history |
|---|---|---|---|
| Main set: 4 people (2 real, 2 synthetic), 76 checks | **88.2%** | 78.9% | 73.7% |
| … changed outside chat | **91.7%** | 58.3% | 41.7% |
| 10 more synthetic people, 236 checks | **79.7%** | 69.5% | 69.5% |
| … changed outside chat | **81.3%** | 48.2% | 49.1% |
| Memory tokens per message | ~140–150 | ~400–490 | ~1.6K–39K |

- **One headline over all 14 people, 312 checks, each counted once:** 81.7% vs 71.8% summary vs 70.5% full history; changed outside chat 82.3% vs 49.2% vs 48.4%. It's in `data/eval-summary.json` under `all` and in Insights. Quote this one, not a number averaged from the two blocks.
- Déjà Vu memory is best or tied for 13 of 14 people. It loses on Tom (65% vs 70% full history).
- **Say this honestly:** the 10 synthetic people were written after the engine was built. Their first, untouched run was 72.5% vs 69.5%. The builder fix (the writer makes a second pass; the grader rewords instead of rejecting) came after reading two of their builds (Grace, James). So they're no longer fully "held out". The README, `docs/eval.md` and both decks already say so.
- Spend so far: about $43 of the $150 Meta credit, tracked in `data/spend.json` (local, git-ignored). Keep $40+ for the demo.

## What happened last (Nov 2)

- 10 synthetic personas with first names only (Daniel, Sofia, James, Aisha, Luis, Grace, Ethan, Fatima, Tom, Rosa). They are demo users in the dropdown under "Demo personas"; "+ Import my memory" comes first.
- Every prompt was revised against `prompt-quality.md`. The engine never blocks: every card is used, private ones included.
- Builder fix and full re-eval. Demos re-recorded and checked at 0 misses. Deployed. Decks updated.
- The pushed history squashed two commits into `2fb6d0f`. Its message describes only the personas and eval, not the builder fix. No files were lost.
- QA fixes (`aa6e042`): one pooled 14-person figure (`all` in `eval/summarize.js`, shown in Insights, README, `docs/eval.md`); the 10 synthetic people are no longer called held out; the trace says "Gave the agent N cards that fit" instead of "Used"; a card corrected in chat says "you told me"; the user menu scrolls; model versions on the landing and demo end card; a reworded "to check" note.
- Repo renamed to `deja-vu-confirmed-memory` (another `deja-vu` exists on GitHub) and every link updated (`c5f8ba2`): Insights method/code links, both deck closers, this file, `.agents/context.md`.

## Open items, in order

1. **Deployed Nov 3** (`.venv-deploy/bin/modal deploy deploy/modal_app.py`); Maria's tour checked on the live link. Both tours were re-recorded on Nov 3 and replay with 0 misses; narration clips (Ava) are in `src/ui/narration/`. Rerun `node scripts/make-narration.js` after any caption edit, and re-record the tours after any answer, learn or build prompt edit.
2. **Persona tours (optional):** only Alex and Maria have guided tours. The other 10 are listed under "Personas: chat with their memory" and answer live (costs model calls). A tour each means a `script` in `data/profiles.json`, recording (~$0.30 each) and clips.
3. **Test the live chat** on the Modal link after deploying: memory off in a **new** chat (same-chat context still applies by design), a run question (the knee card should read as a guess, with no booking offer), End session (now tap twice).
4. **Live answers are slow** (~1–2 minutes in the Nov 3 review). Worth a look before the video: time `selectRelevant` vs the answer call.
5. **First 30 seconds:** the review found no wow before import plus five messages. Lead the video and landing with the ↻ Memory updated flip and the token trace.
6. **Record the video and the 1-minute demo.** Say "Confirmed memory for any agent. Not a chatbot." before the demo. In the submission, **quote the pooled 14-person figure only** (81.7% vs 71.8% vs 70.5%); the two separate blocks moved between runs.
7. **Demo day:** set `SPEND_CAP_USD=15` in `deploy/deploy.env` and redeploy. `SPEND_TOTAL_CAP_USD=60` stays.
8. **Submit** (Indie track). Confirm a 2-person team is OK. Check every link in a private window.
9. Optional: look at why Tom loses. A live correction's provenance reads "Learned from" two chats, not "you told me" like the tour card.

**Decided Nov 3:** memory off means no cards used, asked or learned, and nothing carried to other chats; the chat's own messages still count (that's what any agent does). The UI says "Memory cards off — current chat still applies". The submission should say the saving is across chats: a new chat gets ~150 tokens of cards instead of re-reading ~39K of history. A quiet yes raises confidence but never confirms a card. Insights leads with "answers that needed no correction".

## Rules that must hold (full list: `.agents/rules.md`)

- Never commit or show `data/private/`, `.env`, `deploy/deploy.env`, `deploy/.modal.toml`, `.venv-deploy`, `data/spend.json` or `EYI Package*`. Before every commit:
  - check the staged list
  - grep for tokens
  - grep data files for real names
- Never put an API key in chat, code or commits. Never show sensitive card content (money, visa, health, religion, addresses) outside the user's own UI.
- Commit or push only when asked. The user pushes. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Personas use first names only. No branded characters. Don't copy other products' navigation.
- State costs before big runs and respect the spend caps. `REPLAY_DEBUG` stays off on deploy. The public link never stores visitors' answers.
- Memory never blocks: rules may mark or label a card but never withhold it. An unconfirmed inference is still used.
- Work happens only in `/Users/vamshi/Documents/GitHub/deja-vu`. Decks are edited only in `docs/decks/`, never on claude.ai.
