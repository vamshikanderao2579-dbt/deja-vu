# Next (priority order)
The prioritized backlog now lives in `to-do.md` (14 items). Specs for its items 2 and 6 are below.

## Done Oct 28: writer → grader gate
`src/review.js`: code rules (≤14 words, cites a user message, no traits, nothing about the agent, sensitive always locked), then `GRADER_MODEL` (default Muse Spark 1.3) accepts / locks / rejects against the cited messages. Wired into `distill` and `learnFrom`; stats in state (`review`, `screened`), shown in Insights. Falls back to rules if the grader fails (including replay misses). Eval prints the gate line; `--grader off` for the A/B.

## UX review: Oct 28, through the real personas' eyes
Fixed: sensitive (🔒) cards no longer raised as quick checks in chat (Vamshi was asked about his wife while booking flights); no "noticed" toast for sensitive learnings; demo day separators no longer disappear.
Still annoying, fix next:
- **Live latency**: Vamshi's 45-card memory takes ~9–14 s live (tree pick + relevance + answer). Fine for the replayed video; for real use, cache relevance per topic, run tree + relevance as one call when possible, or move background calls to a small open model.
- **Generic check wording** ("Quick check before I answer. Still true?") → item 0 replaces it with "Going with: … like last time".
- **Auto-skip after 8 s**: the card disappears; make it fade to a small "skipped, using what I know" chip instead of vanishing.
- **Pre-filled update text is long** when the old card is long; shorten to "My hotel preference changed. Now I'd like ".
- **Sreenidhi**: answers ask for drafts she just referenced ("send the current draft?") when the reel isn't in context. Fine, but a "share the reel" chip would help.


## 0. Answer first, check after: "non-blocking quick checks" (NEW, agreed; do this first)
Today a quick check **blocks** the answer: card → swipe → second answer call. That's slower, costs a second answer call, and gets boring ("2 queens like last time?" every hotel search).
**New flow (one answer call):**
- The answer comes **right away**, built from the guessed card. Above it sits a slim card: *"Going with: 2 queen rooms, like last time"* with ✓ / ✕ (and 🎙).
- **Keeps chatting without tapping ✕** → implicit yes: confidence up; becomes confirmed after it's been used without objection a couple of times (or immediately on ✓).
- **✕ Not anymore** → agent says "Got it, tell me what changed" (inline Chat about it / Skip), learns from the chat, and offers one button: *"Redo the hotel picks with that?"* Re-answer only if asked.
- **Deferred confirmation:** for guessed cards used mid-task, don't interrupt; after the task wraps up (topic changes or chat goes idle), one light line: "Quick one: still 2 queen rooms for family trips?" ✓ / ✕. Max one per chat.
- Server: `/api/chat` returns `{ type:'answer', text, check:{ cardId, question } }` in one response; drop the `cue` round trip (keep it as a fallback for 🔒 sensitive cards, which must never be used before a yes).
- Update the demo scripts (step `onCheck: 'ignore' | 'reject' | 'confirm'`), record-demo, tests, slide 6 and the deck notes. Eval is unaffected (it uses confirmed cards directly).

## 0b. Seasonal memory + memory tree: DONE (Oct 28) except yearly pattern updates
Also built: memory is a tree (topic → optional sub-topic → cards). Extraction files new cards into the existing tree first (it sees a one-line TREE). Retrieval is tree-first for memories over 40 cards (pick branches by name, then only their cards). Seasonal cards sleep outside their window.
Built: `sub` sub-topics on cards (Seasonal → Thanksgiving / Christmas; Work → Job / Personal), `season {start,end,recurring}` windows, sleeping cards never sent or asked, 🍂/💤 badges, sub-topic chips + grouped list, extraction prompt, Alex history c28–c30, demo memory, tests. Left: update a season's cards from last year's pattern; a Diwali example for the real profiles.

### Original spec
- A **Seasonal** topic with sub-topics per occasion: Christmas, Thanksgiving, Diwali, birthdays, back-to-school, summer trip…
- Cards inside each, e.g. Thanksgiving → "Hosts 8 people; one vegetarian", "Flies to Indianapolis the Tuesday before".
- Card fields: `season: { name, window: "Nov 15–Nov 30", recurring: true }`. Outside the window they're dormant (not sent to the model, not asked about). Inside it, they're relevant again. The first use each year is a natural "still true this year?" moment (fits item 0).
- Update yearly from patterns (last year's plan becomes this year's guess).
- UI: a "Seasonal" tile in Memory → sub-tiles → swipe deck. Extraction prompt: detect recurring occasions and put them under `seasonal` with `season`.
- This is the "time-aware cards" recommendation made concrete (see recommendations.md, permanent / seasonal / situational).

## 1. Memory on/off toggle + "fast-forward 5 weeks" onboarding (NEW, user request)
For a **1-minute full-experience video, Vamshi's profile, Vamshi presenting**.
- **Memory page:** a toggle at the top, "Memory: On/Off".
  - **Off** = the whole feature is off: no cards in answers, no quick checks, no live learning. Answers run without memory (like `mode: 'none'`). Persist per profile.
  - **Turning on** → a short explainer sheet: what will happen ("I'll keep short notes from our chats, ask once in a while when it matters, you can see, fix or export everything, sensitive things stay locked"). Buttons: Turn on / Not now.
- **Fast-forward:** after turning on, play an onboarding sequence from the very first message: "Hi, I'm Sparky, your personal agent…" → a time-lapse ("Week 1… Week 5", cards counting up into topics, a few real-looking cards appearing) → lands in the San Diego demo conversation. Build as a front-end sequence with no model calls; reuse Vamshi's seed cards for the counts.

## 2. Longer Vamshi demo with a Memory tour (NEW)
- Done so far (Oct 28): demo scripts now span three "days" with one check each: unanswered (auto-skip after 8 s or on the next message), ✕ + Chat about it (scripted reply), unanswered. Alex and Vamshi are recorded and replay in ~1–2.4 s. Rework once item 0 lands.
- Make the scripted demo ~15–20 s per beat (pauses for narration are good).
- After the chat, open **Memory**: topics → a card's **Why?** (exact chat/time) → swipe a couple → end summary → **How lean is my memory?** showing *this profile's* token savings (e.g. 5 weeks ≈ 113K tokens vs ~150 per message). Make Insights per-profile (currently shows the Alex eval).
- Option: add the tour as steps of the demo player ("Play full demo").

## 3. Review + commit (user)
`git status`, confirm nothing private is staged, commit. The user pushes.

## 4. Visual + deck refresh
- Retake slide 6–7 screenshots with **Pip** (two-choice card, quiet ⓘ, Memory deck end summary). Upload as artifact assets and replace in the deck.
- Line chart: summary line hidden under cards (log scale or separate "per message" bars).

## 5. Deploy + submission
- Render/Railway: `npm start`, env from `.env` (`MUSE_ENABLED=true`, spend cap on). Only Alex + Maria appear publicly (private profiles need `data/private/`). Record demos on the server once, or ship replay for synthetic profiles only.
- 3-min video (script from deck speaker notes + the 1-min experience above). X post clip for Most Viral.
- Confirm a 2-person team is OK in the indie track (#questions). Submit **Nov 3**; list both members.

## 6. Nice to have (scoring)
- Background jobs on **Muse Spark Open** via Modal (open-weights bonus): `BG_BASE_URL`/`BG_MODEL`.
- **Muse Image**: photo of a ticket/receipt/menu → card (also fixes "one-off purchases don't become cards").
- Eval: 2–3 runs per persona with ranges.
