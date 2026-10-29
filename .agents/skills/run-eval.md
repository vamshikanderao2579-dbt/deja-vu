# Skill: run and report the eval

1. Estimate cost first: synthetic persona ~$0.35, real ~$0.70–1.60 (full history is the expensive part). Check `data/spend.json` against `SPEND_CAP_USD`.
2. `npm run eval -- --persona <id>` for alex, maria, nidhi, vamshi. Eval forces `REPLAY=off` (fresh answers).
3. Results: synthetic → `eval/results/<persona>-latest.json` (Alex also writes `latest.json`, which the app's Insights charts read); real → `data/private/eval/` (never commit).
4. Diagnose misses by reading failed checks with `cardsUsed` and the answer text: was the card missing (extraction), not selected (relevance), or ignored (answer)? Fix the cause, never the answer key, unless the key itself is wrong (Maria's outdated shift check was a key bug).
5. Update `docs/eval.md` (aggregates only for real data) and slide 10 of the deck. Keep the honest caveat.
