# To-do: Oct 29 → Nov 4

Team travels until Nov 2 (San Diego → Vegas → Zion → NYC), one laptop. Claude does the build; your time is noted. Daily spend cap: `SPEND_CAP_USD` (check `data/spend.json`). Specs: `next.md`.

**Framing:** Déjà Vu is an *agentic memory layer* that plugs into any agent without changing how it works. Every item either uses Meta's models where they fit, makes the agent's work visible, or keeps the UX light and optional.

## Done
- [x] **Writer → grader gate** (`src/engine/review.js`): code rules, then a second model accepts/locks/rejects each proposed card. Insights → "What I kept".
- [x] **Learning never blocks chat**; prompts moved to `src/prompts/*.md`; `engine-quality.md` (six principles + card wording); `prompt-quality.md`.
- [x] **Own shell:** chat home, "Memory · by Déjà Vu" menu section, wordmark + rewind-clock mark, deck palette, light/dark switch; Muse-derived navigation removed; `.sparky/` → `.agents/`.
- [x] **Answer first, check after** with quiet yeses; ✕ → chat → redo on request.
- [x] **Drafts:** `draft_booking` / `draft_order` tool calls; the redo marks what changed (Vamshi: "under $200 a night" new, "~10 min to downtown" gone).
- [x] **Agent trace:** ⓘ per answer + Insights "What I decided" (checks per 100 answers, why it stayed quiet, quiet yeses, drafts).
- [x] **Autonomy moment:** a stated change updates the old card in place, shown in chat as ↻ Memory updated (Alex: dog sitter → sister watches Biscuit).
- [x] **Memory on/off + fast-forward** onboarding.
- [x] **Speed:** one relevance call + topic relevance cache. **Chat-about-it opener** shortened and reusable.
- [x] **Grader on Muse Wonder** (`GRADER_MODEL=muse-wonder-1.0`, priced separately in the spend guard). A/B: same verdicts as Spark, faster.
- [x] **Answer first, as a plain reply:** the pick sits inside the answer (no "draft" label, memory chips only under ⓘ); the check card comes after it; every ✓/✕ plays as a visible swipe with a stamp (demo too).
- [x] **Staged memory build** (`src/engine/build.js`): guard → scan (500-turn cap) → draft as it reads → self-review + `summary.md` → Wonder grade with priority → contract check that reruns; checkpoints; **Rebuild from all my chats** with live % and a chat note when done. Memory header: *Memory since* / *Last verified*.
- [x] **Rebuild rules:** confirm sheet; once a month, sooner only for new chats; confirmed cards passed as trusted; grader checks each card at its exact chat spot; "Go to this point in the chat ↗" on every card's sources; steering caught in any wording (live test: 5/5).
- [x] **Fits the screen:** phone as before; iPad full width; laptop sidebar that opens/closes (remembered); pencil = fresh chat.
- [x] **Fixed:** "Chat about it" could confirm an unrelated card (fallback to the last card); a rebuild overwrote the demo's starting memory.
- [x] **Saved chats:** every chat kept with a short title in a CHATS section under Memory ("Main chat" on top); reopen any, picks included; reload returns to the open chat; loading the demo memory no longer clears chats.
- [x] **Repo layout:** `src/engine`, `src/prompts`, `src/platform`, `src/ui`.
- [x] **Plug-in API** (`/api/recall`, `/api/remember`, `/api/cards/:id`) and README that leads with the engine. Demos re-recorded: Vamshi, Alex.

## Backlog, in order

| # | Item | Why it scores | Blocked on | Size |
|---|---|---|---|---|
| 1 | **Deck: technical-depth slides.** The engine end to end, the don't-nag rule, answer-first + drafts, the grader, how each Meta model is used and why; close on "don't change what works: lightweight and optional" | Tech depth (20%) + tooling (25%) in the video | nothing | 2 h (tonight) |
| 2 | **Photo → cards.** Snap a boarding pass, receipt or menu → cards with provenance "from your photo". SAM 3.1 crops the object → a vision model reads it → the grader checks it like any card. First: does hosted Muse Spark 1.3 accept images (`check-api`, cents)? | Tooling: multimodal + SAM; fixes "one-off purchases never become cards" | nothing to start | 1 day |
| 3 | **Re-record Maria and Sreenidhi** in the new flow; **remove the two "Charmander" cards** from Vamshi's memory (you, 1 min: Memory → swipe left) | Demo: every profile replays | nothing | 30 min (~$0.30) |
| 4 | **Time-aware cards** (recommendations): *situational* cards ("on a trip this week") carry an expiry and drop out on their own; seasonal already sleeps/wakes | Impact: removes stale answers without asking anyone anything | prompt change → with #11 | ½ day |
| 5 | **Forget a topic / start fresh** (recommendations): one control per topic, export first | Trust: the person stays in charge | nothing | 1–2 h |
| 6 | **North-star in Insights** (recommendations): "answers that needed no correction" next to checks per 100 answers | Impact framed as product metrics | nothing | 1 h |
| 7 | **Open weights for background work.** Writer on Muse Spark Open or Glimmer, grader on hosted Muse Wonder. Meta Model API credits don't cover open weights (they aren't served there): use **Baseten's hosted Spark Open** or **Glimmer (~30B) on one Modal GPU**. Config is ready (`BG_*`) | Tooling + open-weights bonus ($10K) | **credits** (Modal requested Oct 27; Baseten: apply) | ½ day once credits land |
| 8 | **Sensitive vault on Glimmer:** locked cards handled only by the self-hosted model | Privacy story | #7 | ½ day |
| 9 | **Household / shared cards** (recommendations): a partner's or kid's cards both people see; who a plan affects is the most common miss | Impact | nothing | stretch |
| 10 | **Deploy + deck fills:** `modal deploy deploy/modal_app.py` (live; daily cap $5 for now: set `SPEND_CAP_USD=15` in `deploy/deploy.env` and redeploy before demo day); deck `[your name]`, `[repo link]`, `[live demo URL]`; retake slides 7–8 screenshots (answer-first layout) | Stage 1 needs a live URL | #3 | 2 h (Nov 1) |
| 11 | **Prompt rewrite pass** against the six principles + card-wording rules (audit in `prompt-quality.md`), with an `ambiguous` reject reason for the grader. New eval → new cards, so do it with #13 | Tech depth | before #13 | ½ day |
| 12 | **Muse Wonder as independent eval judge**, right before the evals (today Spark answers *and* judges) | Removes the self-judging objection | nothing (~$1–2) | 2 h |
| 13 | **Eval rerun + grader A/B** on all 4 people (`--grader off`), new answer flow, **built with the staged build** (`eval/run.js` still calls the one-pass `distill`); update `docs/eval.md`, README and deck slide 10 | A fresh number for everything above | after #11–12 (~$4–5) | ½ day |
| 14 | **Muse Image "Memory Wrapped"** shareable image for the X post | Most Viral + tooling (small) | nothing | 1 h |
| 15 | **SAM 3.1 in the video:** spotlight the ✕ and the draft changing | Demo polish | recorded video | stretch |

Check before sending real histories through the cheaper Muse Spark **Contributor** tier: its data terms.

## Fixed dates
- **Sat Nov 1:** you review + commit + push; repo public. Deploy (#10).
- **Sun Nov 2:** record the 1-minute experience (Vamshi: memory off → on → fast-forward → San Diego demo) and the 3-minute video; 20-second X clip (✕ → the hotel draft changes).
- **Mon Nov 3:** confirm a 2-person team is OK in the Indie track (#questions); submit; check links in a private window.
- **Tue Nov 4:** buffer only (deadline 9 PM ET).

## You, this week
- Ping Modal in the Discord about credits; apply for Baseten ($100 + 2M TPM). Unblocks #7–#8.
- Remove the two Charmander cards in Vamshi's Memory (#3).
- Play Vamshi's and Alex's demos and flag anything off.
