# Rules

## Privacy (hard)
- Real chat histories, answer keys, cards, eval rows and the replay cache stay in **`data/private/`** (git-ignored). Never commit, paste into slides, or show in the video. Publish **aggregates only** (counts, percentages, token totals).
- Never show sensitive card *content* (money, visa, health, religion, addresses). The 🔒 count is fine.
- Never put the API key in chat, code or commits. It lives in `.env` (git-ignored).

## Git
- **Don't commit or push unless the user asks.** They review and push themselves. Never rewrite their history.
- Before any commit: check that nothing under `data/private/`, `.env`, `spend.json` or `EYI Package*` is staged.

## Models and money
- Every product AI call runs on **Meta models** (Muse Spark via the Meta Model API; Muse Spark Open via Baseten/Modal is allowed). Coding tools are free choice, but never claim Muse built something it didn't.
- Respect `SPEND_CAP_USD` in `.env` (daily, enforced in `src/platform/llm.js`). Tell the user the expected cost before big runs. Eval runs always go live (`REPLAY=off`); recorded demos replay from cache.
- Muse Spark reasoning tokens count against `max_tokens`: keep generous limits and `reasoning: 'minimal'|'low'`.

## IP
- No branded characters (Pokémon, Disney…) anywhere, including cards shown on screen. The app shows the Déjà Vu wordmark and rewind-clock mark, no mascot. Don't use other companies' logos, and don't copy another product's navigation, labels or helper text (the first UI was built from Muse screenshots; that's been removed).
- The hackathon disqualifies "assets you do not have the rights to".

## UX principles (from the user, non-negotiable)
- **Light first.** Nothing extra after an answer except a quiet ⓘ. No feedback buttons.
- **Ask rarely.** Quick checks only for a *key* card, only when it's guessed / changed / a year old, once per chat, never for style or agent-identity cards; confirmed cards aren't re-asked for 6 months.
- **Two choices only:** ✓ Still true / ✕ Not anymore (+ 🎙). No typing to edit cards.
- **Never block.** "Chat about it" is an optional link in a normal agent message; the person can just keep chatting.
- **Swiping is for speed:** no popups mid-deck; one summary at the end.
- **The agent is Sparky** inside chat text, never Muse/Claude/Gemini, and never calls the user by the agent's name.
- **Memory is a layer, not the home.** Chat stays the home screen; Déjà Vu shows up as a line above an answer, a ⓘ under it, and its own menu section. Lightweight and optional: it must never change how the host agent works.
- **Answer first.** Nothing ever waits on a check; redo only when the person asks.
- Generic, multi-demographic examples; realistic conversations (the San Diego trip story).

## Prompts
- Prompt text lives only in `src/prompts/*.md`. Follow `src/engine/engine-quality.md` and `prompt-quality.md`. After editing one: `npm test`, an eval run, and re-record demos (the replay cache is keyed on prompt text).

## Working style
- Test end to end (front end + back end) after changes: `npm test`, then the browser flow. Verify with the real model when it matters, within budget.
- Be honest in numbers and docs (state caveats; don't rig evals).
