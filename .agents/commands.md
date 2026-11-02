# Commands

```bash
cd /Users/vamshi/Documents/GitHub/deja-vu
npm run dev                                   # app at http://localhost:3000 (reloads on change)
npm test                                      # 50 tests, mock mode, $0, own state file
npm run check-api                             # key + model IDs + one test call
npm run eval -- --persona alex                # alex | maria | nidhi | vamshi; default setups: full,summary,confirmed
npm run eval -- --persona maria --modes full,summary,inferred,confirmed,none
node scripts/record-demo.js vamshi            # play a profile's demo live (answer first, checks per script) and save it for replay
curl -X POST localhost:3000/api/recall -H 'content-type: application/json' -d '{"message":"find us a hotel"}'   # plug-in API
node scripts/import-muse-export.js "<EYI folder>" data/private/<name>-history.json
node scripts/make-demo-memory.js              # rebuild Alex's demo memory (mixed statuses)
```

## .env keys
`MAIN_API_KEY`, `MAIN_MODEL=muse-spark-1.3`, `BG_*` (optional open-weights host), `SPEND_CAP_USD`, `PRICE_IN_PER_M`/`PRICE_OUT_PER_M`, `MUSE_ENABLED` (false = replay only), `CUE_COOLDOWN_HOURS`, `DEMO_TODAY=2026-10-27`, `AGENT_NAME`, `GRADER`/`GRADER_MODEL`, `RELEVANCE_CACHE=off`, `RATE_LIMIT_PER_MINUTE` (30; record-demo back-to-back can trip it: wait a minute).

## Spend
`cat data/spend.json` (today's total, live calls only; replays are free).
