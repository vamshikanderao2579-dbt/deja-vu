# To-do: Oct 29 → Nov 4

Team travels until Nov 2 (San Diego → Vegas → Zion → NYC), one laptop. Claude does the build; your time per day is noted. Daily spend cap: `SPEND_CAP_USD` (check `data/spend.json`). Specs: `next.md`.

**Framing for everything below:** Déjà Vu is an *agentic memory layer*: the agent whose job is memory. Every item either uses more of Meta's models where they fit, or makes the agent's work visible to a judge.

## Done Oct 28
- [x] **Writer → grader gate** (`src/review.js`). Every card the background model proposes passes code rules (≤14 words, cites a message the *user* wrote, no personality labels, nothing about the agent, sensitive topics always locked), then a second model (`GRADER_MODEL`, default Muse Spark 1.3) accepts, locks or rejects it against the cited messages. A failing grader never blocks learning. `GRADER=off` / `npm run eval -- --grader off` for the comparison. Tests: `test/review.test.js`.
- [x] **Learning never blocks chat:** writer + grader run after the answer; new cards merge when ready without overwriting swipes made meanwhile (live check: answer returned, the grader finished ~6 s later).
- [x] **Prompts moved** to `src/engine/prompts/*.md` (word for word; verified identical; replay still hits) with `src/engine/engine-quality.md` (six principles) and `prompt-quality.md`.
- [x] **Own shell (Oct 29):** chat stays home with the Déjà Vu wordmark and a rewind-clock mark; no tab bar; memory is a separate "Memory · by Déjà Vu" menu section (your cards, how lean, recently learned); Muse's copied tabs, sidebar hints and placeholder Settings rows removed; the deck's navy + cyan→blue gradient palette and Geist fonts. Deck slides 6–7 need new screenshots.
- [x] **First piece of the agent trace:** Insights → "What I kept, and what I didn't" (proposed / kept / locked / dropped by reason, recently dropped; sensitive texts never shown).

## Backlog, in suggested priority order (reorder together)

| # | Item | Why it scores | Blocked on | Size |
|---|---|---|---|---|
| 1 | **Eval rerun + grader A/B** on alex + maria (with and without the grader), then nidhi + vamshi | Tech depth: a hard number for "the grader stops wrong cards" | nothing (~$3–4) | ½ day |
| 2 | **Answer first, check after** (next.md item 0) | Demo: no blocking; one call instead of two | nothing | 1 day |
| 3 | **A real action the confirmation gates.** Muse Spark tool calls `draft_hotel_booking` / `draft_grocery_order` return a structured draft card in chat (dates, room type, items). ✕ on the "Going with: 2 queens" line visibly changes the draft. **Not built yet**: today the answer prompt says "don't claim you booked anything" and there are no tools. Pairs with #2 (same flow). | Impact + Best Agentic ($5K): wrong memory → wrong action, shown | nothing | 1 day |
| 4 | **Agent trace, full version.** Extend Insights + a quiet per-answer ⓘ line with what the loop decided: cards picked, checks *asked vs suppressed* (low stakes, cooldown, once-per-chat, sleeping seasonal), cards learned, cards screened out | Tech depth: makes the invisible loop visible | nothing | ½ day |
| 5 | **Autonomy moment in the demo:** a later chat updates a card on its own, no swipe ("Sam eats chicken and fish now" → card changes, confirmed). Live learning already does it; script it and show it | Demo: proves it's an agent, not a settings page | nothing | 1–2 h |
| 6 | **Memory on/off + "fast-forward 5 weeks" onboarding** (next.md item 1) | Demo: the 1-minute full experience | nothing | ½–1 day |
| 7 | **Open weights for background work.** Writer on an open model, grader on hosted Muse Spark (two different models). Muse Spark Open is 816B MoE: self-hosting it on Modal needs a multi-GPU node, which $100 covers for a few hours at most, so prefer **Baseten's hosted Spark Open** (per token) or **Muse Glimmer (~30B) on one Modal GPU** via vLLM. Config is ready (`BG_BASE_URL`, `BG_API_KEY`, `BG_MODEL`) | Tooling (25%) + open-weights bonus ($10K) | **credits**: Modal (requested Oct 27, no reply), Baseten (apply) | ½ day once credits land |
| 8 | **Photo → cards.** Snap a boarding pass, receipt or menu → cards with provenance "from your photo". SAM 3.1 crops the object ("the boarding pass") → Spark Open or Glimmer reads it → the grader checks it like any card. First check whether hosted Muse Spark 1.3 accepts images (`check-api`, cents): if yes, build it now on Spark and swap in the open model later | Tooling: multimodal + SAM; fixes "one-off purchases never become cards" | best on #7; maybe not | 1 day |
| 9 | **Sensitive vault on Glimmer:** locked cards are extracted and reviewed only by the self-hosted model, never sent to a cloud API | Impact + tooling: privacy story | #7 (Glimmer) | ½ day |
| 10 | **README and submission lead with the engine:** loop diagram (chat → writer → rules → grader → me.json → relevance → don't-nag rule → answer/action) and eval numbers first, screenshots second | Stage 1 + skimming judges | nothing | 2 h |
| 11 | **Muse Wonder as independent eval judge** (today Spark answers *and* judges); later a monthly memory audit and seasonal refresh | Tech depth: removes the self-judging objection | nothing (~$1–2) | 2 h |
| 12 | **Muse Image:** a shareable "Memory Wrapped" image for the X post (the header mascot is gone; `scripts/generate_mascot.py` stays if we want one for the deck) | Tooling (small) + Most Viral | nothing | 1 h + your pick |
| 13 | **SAM 3.1 in the video:** masks to spotlight the ✕ card and the draft changing | Demo polish | recorded video | stretch |
| 15 | **Prompt rewrite pass** against the six principles (audit list in `src/engine/prompts/prompt-quality.md`): distill 12 vs 14 words, positive phrasing in answer/context header, examples in update/distill, and the **card wording rules** (engine-quality.md → Card wording: ✓/✕ test, "Vegetarian on Tuesdays" not "No non-veg on Tuesdays") in the distill and update prompts, with an `ambiguous` reject reason for the grader. Measure with the eval before and after; re-record demos | Tech depth: prompts that read as deliberate | after #1 | ½ day |
| 14 | ✅ **IP tidy-up:** README no longer says "Muse-style" (done Oct 28). Never use Meta/Muse logos or say it's a Meta product; model names are fine | Avoids any "looks like Meta's product" question | nothing | 10 min |

## Fixed dates
- **Sat Nov 1:** review + commit (nothing from `data/private/`, `.env`), push, repo public. Deploy (Render/Railway; only Alex + Maria public; spend cap on). Retake deck slides 6–7 with the new flow.
- **Sun Nov 2:** record the 1-minute experience (Vamshi) and the 3-minute submission video; 20-second X clip (✕ → the draft changes).
- **Mon Nov 3:** confirm a 2-person team is OK in the Indie track (#questions); submit; check links in a private window.
- **Tue Nov 4:** buffer only (deadline 9 PM ET).

## You, this week
- Ping Modal in the hackathon Discord about the credit request; apply for Baseten ($100 + 2M TPM).
- 2 min: run the mascot script and pick one.
- 15 min after #2–#3: play Vamshi's and Alex's demos and flag anything off.
