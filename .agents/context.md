# Context

## The project
- **Déjà Vu**: confirmed memory for personal AI agents. Team: Sreenidhi (Nidhi) Durgam + Vamshi Kanderao (Vamshi presents).
- **Meta Global AI Developer Hackathon** (Cerebral Valley), Theme 1: Build for Your World. Indie track (2-person team: confirm eligibility with organizers).
- **Deadline:** Wed **Nov 4, 2026, 9:00 PM ET**. Submit **Nov 3** (last full support day). Needs: public GitHub repo, live URL, **3-minute video**, everyone listed.
- **Judging:** Impact 30 · Use of Meta AI tooling 25 (beyond basic integration, "surprise us") · Technical depth 20 · Demo 25. Top 5 per track go to a live final. Bonus prizes: Most Viral on X ($20K), Open-weights build ($10K), Community vote ($10K), Agentic use ($5K).
- **The team is traveling** Oct 27–Nov 2 (anniversary trip: San Diego → Las Vegas → Zion), on one laptop. Keep their time asks small.
- **Credits:** one $150 Meta credit grant (Nidhi's didn't arrive because of an email mismatch). Modal $100 applied. Daily spend cap in code.

## One-line pitch
Agents are really good at inferring context from chats. But confirmed memory is always better than inferred memory.

## How it works (product)
Déjà Vu is an **agentic memory layer**: it plugs into any chat agent without changing how the agent works. Chat stays the home screen; memory shows up as one line above an answer, a ⓘ under it, and a "Memory · by Déjà Vu" section in the menu.
- **Cards:** chat history → short cards (≤14 words) by topic (tree: topic → sub-topic → cards; seasonal cards sleep outside their window). Status: guessed (~), confirmed (✓), locked 🔒 (sensitive, unused until yes). Dated; **Why?** opens the exact message.
- **Writer → grader gate** (`src/engine/review.js`): code rules (≤14 words, cites a user message, no trait labels, nothing about the agent, sensitive always locked) then `GRADER_MODEL` accepts/locks/rejects. Never blocks.
- **Answer first, check after:** one answer call, right away. If a *key* card is guessed/changed/old and stakes are high (the don't-nag rule, `src/engine/cue.js`), a check line sits **above** the answer: ✓ / ✕ / just carry on. Carrying on = quiet yes (+confidence, never confirms on its own). ✕ → "Got it, I've forgotten X. Want to tell me what changed?" → Chat about it pre-fills `“<old card, 6 words…>” → now ` → saved as confirmed → **↻ Redo it with that?** (only on request).
- **Drafts (the action memory controls):** booking/order/stay/flight requests (high stakes + action words) give the answer model `draft_booking` / `draft_order` tools (`src/engine/actions.js`). The draft card shows details + "from your memory" chips; after a redo it marks **new** and struck-out lines (fuzzy match). Nothing is ever booked.
- **Background learning** after every answer, never delaying it; merges into memory as it is then (swipes made meanwhile survive). A stated change updates the old card in place and shows in chat as **↻ Memory updated** (old struck → new).
- **Agent trace:** ⓘ under each answer shows cards picked, stakes, and checked X / why it stayed quiet; Insights → "What I decided" totals (checks per 100 answers, quiet reasons, quiet yeses, drafts) and "What I kept, and what I didn't" (grader).
- **Memory on/off** (Memory page switch, persisted per profile): off = nothing used, asked or learned. Turning on → explainer sheet → **fast-forward** time-lapse (Week 1…5, cards collecting) → chat.
- **Plug-in API:** `POST /api/recall` (cards + prompt text + check for a message), `POST /api/remember` (learn from an exchange), `POST /api/cards/:id` (confirm/reject).
- **Speed:** one relevance call over the bounded index (branch-first only above 120 cards) + topic relevance cache (similar request within 30 min reuses the pick plus newer cards in those topics; off in eval). Live answers ~4–7 s; replays ~1 s.
- **Look:** Déjà Vu wordmark + rewind-clock mark (no mascot), deck palette (navy, cyan→blue gradient, Geist), light/dark (menu ☀/☾ + Settings → Appearance), profile as an initial circle. Agent is still called "Sparky" inside chat text.
- **Voice:** Muse Voice Transcribe for answering a check. **Profiles:** Alex, Maria (synthetic) · Sreenidhi, Vamshi (real, private). **Demo player** follows each script's `onCue`: ignore (default), confirm, reject + chat + redo.

## Meta models in use
Muse Spark **1.3**: answers + draft tool calls, relevance, card writing, eval judge. Muse **Wonder 1.0**: grader (default `GRADER_MODEL`, $4/$20 per M, priced separately in the spend guard) (reasoning `minimal`/`low`). Muse Voice Transcribe 1.0. **Not yet:** Muse Spark Open / Glimmer (open weights: need Baseten/Modal or own GPU; Meta Model API credits don't cover them), SAM 3.1 + vision for photo → cards, Muse Wonder (independent judge), Muse Image (Memory Wrapped).

## Eval (docs/eval.md)
Three setups × 4 people (2 real, 2 synthetic), 42 questions, 76 checks, judged by Muse Spark:
confirmed **84.5%** vs summary 82.5% vs full history 73% · changed outside chat **94% vs 44% vs 38%** · stale answers **1 vs 2 vs 5** · memory tokens/message **~147 vs ~488 vs ~38,900** (up to 113,619). Honest caveat: on Sreenidhi's real history the summary scored higher (93 vs 86).
Real data: 5 weeks of Vamshi's Muse chats (~113,600 tokens) → ~44 cards (~400 tokens); sensitive cards (income, loans, visa, taxes, religious food rules) locked automatically.

## Where things are
- Repo: `/Users/vamshi/Documents/GitHub/deja-vu` (remote: github.com/vamshikanderao2579-dbt/deja-vu-confirmed-memory). The user commits and pushes.
- Deck (claude.ai artifact, private until shared): https://claude.ai/artifact/DJKtjUyCdDRghS4rW61hJr. 12+ slides, navy + cyan→blue gradient, Geist, speaker notes. `read` it before editing.
- App: `npm run dev` → http://localhost:3000. Demos recorded Oct 29 for **Vamshi** and **Alex** in the new flow (replay ~1 s); Maria and Sreenidhi need re-recording.
- Private (git-ignored): `data/private/` (real histories, answer keys, eval results, replay cache, profiles), `.env`, `data/spend.json`, `EYI Package*` exports.
- Unused leftovers: `src/ui/sparky.jpeg`, `AGENT_AVATAR`, `scripts/generate_mascot.py` (keep only if a mascot is wanted for the deck).
- Vamshi's private memory still holds two old "Charmander" cards (agent identity, pre-rename): remove them in Memory before recording (IP rule).

## Key files
`server.js` chat route (answer first, check, picks, trace), plug-in API, learning, build job (`/api/build`) · `src/engine/` the memory layer: `agent.js` relevance (+ topic cache), answers, picks, live learning · `build.js` staged build from a whole history (guard → scan → draft → self-review → grade → contract, `checkpoint.json` per stage, files in `data/private/build/<profile>/`) · `guard.js` step 0 (steering text skipped, secrets removed) · `review.js` code rules for cards · `cue.js` don't-nag rule, quiet yes · `cards.js` merge/budgets/actions · `actions.js` draft tools · `engine-quality.md` · `src/prompts/` every prompt (`build.rules.md` shared build rules; `prompt-quality.md` index) · `src/platform/` config, model client (spend cap priced per model, replay cache), storage, voice · `src/ui/` app · `eval/run.js` (still the old one-pass `distill`) · `scripts/record-demo.js` · `test/` (46 tests) · `docs/eval.md`.
