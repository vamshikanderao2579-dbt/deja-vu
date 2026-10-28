# Next (priority order)

## 1. Memory on/off toggle + "fast-forward 5 weeks" onboarding (NEW, user request)
For a **1-minute full-experience video, Vamshi's profile, Vamshi presenting**.
- **Memory page:** a toggle at the top, "Memory: On/Off".
  - **Off** = the whole feature is off: no cards in answers, no quick checks, no live learning. Answers run without memory (like `mode: 'none'`). Persist per profile.
  - **Turning on** → a short explainer sheet: what will happen ("I'll keep short notes from our chats, ask once in a while when it matters, you can see, fix or export everything, sensitive things stay locked"). Buttons: Turn on / Not now.
- **Fast-forward:** after turning on, play an onboarding sequence from the very first message: "Hi, I'm Charmander, your personal agent…" → a time-lapse ("Week 1… Week 5", cards counting up into topics, a few real-looking cards appearing) → lands in the San Diego demo conversation. Build as a front-end sequence with no model calls; reuse Vamshi's seed cards for the counts.

## 2. Longer Vamshi demo with a Memory tour (NEW)
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
