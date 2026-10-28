# Skill: add a profile

1. History: synthetic → write `data/personas/<id>-history.json` (conversations with ids, dates, times; messages with ids). Real → `node scripts/import-muse-export.js "<EYI folder>" data/private/<id>-history.json`.
2. Register it in `data/profiles.json` (public) or `data/private/profiles.json` (private): `id, name, about, history, state, suggestions, script`.
3. Optional eval: answer key with facts (synthetic: with `sources` message ids + `current_truth` drift; real: facts only, Muse plays the person), questions with checklist `checks`; add to `PERSONAS` in `eval/run.js`.
4. In the app: switch profile → Memory → Build from my chats (saves a starting-memory seed) → record its demo (skills/record-demo.md).
