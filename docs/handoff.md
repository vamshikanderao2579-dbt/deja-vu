# Handoff: Nov 2, 2026 (switching laptops)

For the next agent or chat. Read this first, then `.agents/` (README → context → rules → decisions). `.agents/to-do.md` dates from Oct 29: use this file for what's current.

**Déjà Vu** is a confirmed-memory layer any personal agent can add: infer-then-confirm, user-owned, bounded. It is not a chatbot. The chat in the app is a demo agent, Pip, with Déjà Vu memory. It was built for the Meta Global AI Developer Hackathon (Indie track). **Submissions close Tue Nov 4, 9 PM ET.**

## Where things are

| What | Where |
|---|---|
| Live app (Modal) | https://vamshikanderao2579-dbt--deja-vu-web.us-east.modal.run, running the same code as `main` |
| Repo | https://github.com/vamshikanderao2579-dbt/deja-vu (`main` @ `2fb6d0f`) |
| Full deck, 15 slides | `docs/decks/full.html`; editable on claude.ai: https://claude.ai/artifact/DJKtjUyCdDRghS4rW61hJr |
| Short deck, 6 slides + Alex demo | `docs/decks/short.html`; editable on claude.ai: https://claude.ai/artifact/LdZGeaPK3WJ1BA1gf5xsAv |
| Deck sources | `docs/decks/full/`, `docs/decks/short/` (`deck.json` + `slides/*.html`). After editing, run `python3 scripts/build-decks.py` |
| Eval method and per-person tables | `docs/eval.md`; results in `data/eval-summary.json` (also in the app under Insights) |
| Prompts and their quality bar | `src/prompts/*.md`, `src/prompts/prompt-quality.md` |
| Project memory for agents | `.agents/` (rules, decisions, history, playbooks in `.agents/skills/`) |

The claude.ai deck links are private to the account that made them. The HTML files in `docs/decks/` work anywhere: open one in a browser. Keys: ← →, **N** speaker notes, **F** full screen, **P** print / save as PDF.

## Set up the new laptop

1. `git clone https://github.com/vamshikanderao2579-dbt/deja-vu && cd deja-vu`. Node 18+, no npm install needed.
2. Copy these git-ignored files from the old laptop privately (AirDrop or USB). **Never** send them through git, chat or an AI tool:
   - `.env`: the Meta Model API key and local settings. Template: `.env.example`.
   - `deploy/deploy.env`: the public link's key and spend caps.
   - `data/private/`: the two real chat histories and their answer keys, eval builds and caches (~5 MB). The eval needs it for the two real people. The app runs without it.
   - `~/.modal.toml`: the Modal login. Or run `modal token new` after step 3.
3. To deploy: `python3 -m venv .venv-deploy && .venv-deploy/bin/pip install modal`.
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

## Open items, in order

1. **Record the video and the 1-minute demo.** The guided Alex tour takes ~47 s: landing → "Watch the 1-minute demo". Say "Confirmed memory for any agent. Not a chatbot." before the demo.
2. **Demo day:** set `SPEND_CAP_USD=15` in `deploy/deploy.env` and redeploy. `SPEND_TOTAL_CAP_USD=60` stays.
3. **Make the repo public** before submitting, so the Insights method/code links work. Then check every link in a private window.
4. **Submit** (Indie track). Confirm a 2-person team is OK.
5. Optional: narration audio with the Mac voice "Ava (Premium)". Install it under System Settings → Accessibility → Spoken Content → Manage Voices. Then record clips with `say`, and fall back to `speechSynthesis` when a clip is missing.
6. Optional: shorten Maria's tour like Alex's. Decide whether to keep the "quiet yes" auto-confirm (it conflicts with "no promotion by repetition"). Look at why Tom loses.

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
