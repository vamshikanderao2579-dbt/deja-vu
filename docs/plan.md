# Déjà Vu: user-owned, confirmed memory for personal AI agents

**Meta Global AI Developer Hackathon (Cerebral Valley)** · Indie Developer track · Theme 1: Build for Your World
**Team:** Sreenidhi (Nidhi) Durgam + Vamshi Kanderao · **Submission due:** Wed Nov 4, 2026, 9:00 PM ET (target: done by Nov 3, the last full support day)

**One-liner:** Personal AI that asks before it assumes: your memory becomes cards you can see, confirm with a swipe, and own.

---

## 1. Problem

- Personal agents (Muse, ChatGPT, Claude) remember things about you, but most of that memory is hidden. Muse has an editable Memory.md, yet it also recalls chat history, connected-app data and people profiles you can't see. ChatGPT's "reference chat history" is invisible too.
- None of them **ask you to confirm** what they inferred. A guess from one chat three months ago carries the same weight as something you said yesterday.
- Re-reading years of history for every answer is expensive. That matters if a top-quality agent is going to be **free for everyone**.
- Firsthand story: Vamshi uses Muse daily. Muse's memory file is empty, yet it remembers last week's lunch. *What does it actually know about me, and is it still right?*

## 2. Thesis

**Inferred vs. confirmed context: what you confirm should outrank what it guessed.**

Two wins:
1. **Trust:** context is visible, traceable to its source, and correctable. No black box.
2. **Cost:** bounded context means predictable token cost. "Free AI needs cost control, and bounded user context *is* cost control."
Retention follows: people stay where the agent remembers them correctly.

## 3. Product

### 3.1 Cards
- Short plain-language cards (at most 12–14 words), grouped into categories that are created automatically as chats grow (food, travel, work...).
- **Two types:**
  - **Preference:** how you like things ("Prefers hike-in beaches over driving and parking").
  - **Lesson:** something that went wrong and how to avoid it ("Summit had no stores, so pack water and snacks").
- Cards **describe different sides of you**, not either/or choices. Travel can hold a beach card and a mountain card, each with its own detail.
- **Status:** `confirmed` ✓ · `inferred` ~ · `pending` 🔒 (sensitive, unused until the user says yes).
- **Provenance:** every card links to the exact messages it came from (the "Why?" button).

### 3.2 Bounded by design
- Limits: up to 10 categories, 8 cards per category, 14 words per card.
- Every card shows when it was learned, last mentioned and confirmed; "Why?" opens the exact conversation and timestamp.
- Cards learned over a year ago and never confirmed are flagged for a quick check ("You last mentioned this in Mar 2025. Still true?").
- Over budget: merge duplicates, then trim the lowest-value **inferred** cards. **Confirmed cards are never trimmed.** The user's confirmations decide what survives.

### 3.3 Quick checks in chat (the core interaction)
- When an inferred or stale card is about to shape an answer, the agent asks once, inline: *"Still veg on Tuesdays?"*
- **One gesture on any device:** swipe on a phone (→ still true, ← not anymore, ↑ edit), tap buttons on the web, quick replies on WhatsApp, voice on glasses (Muse Voice Transcribe).
- **The "don't nag" rule.** Ask only when all of these hold:
  1. the card is relevant and actually changes this answer;
  2. it is inferred-only, low confidence, changed recently, or stale (60+ days since last confirmed);
  3. the stakes are high (booking, ordering, planning);
  4. no check has been asked in this conversation, none within the cooldown, and this card wasn't asked about in the last 7 days.
  Never during urgent tasks, and never more than one card at a time.
- **Implicit confirmation:** accepting a recommendation that used a card (👍) raises its confidence; "not quite" lowers it. *It asks less the more you use it.*

### 3.4 Task-scoped context
Each request loads only the relevant cards. A restaurant question never sees work or health cards. This is better for privacy and uses fewer tokens.

### 3.5 Sensitive-fact gate
Health, finance, relationships, religion: these cards start as `pending`. They're visible to the user but **not used in answers until confirmed**. The point isn't to hide anything from the user; it's that the agent doesn't act on sensitive guesses. We never give medical advice.

### 3.6 Portable context
- `me.json` is the **source of truth** (typed, validated, can't break the UI).
- Generated from it: compact text for the model (cheapest for tokens) and `me.md` for humans and other agents. An "AGENTS.md for people."
- One-tap export of both.

### 3.7 Screens (familiar personal-agent layout: sidebar, settings, chat)
- **Sidebar → Memory** and **Settings → Memory** open a grid of topics (Food, Family, Travel, Work...). Tap a topic to get a swipe deck: → that's right, ← not right, ↑ edit, 💬 add a note.
1. **Chat:** answers plus inline quick-check cards. Each answer shows "Used N cards · ~X tokens (Y% less than full history)", plus 👍 / Not quite. A memory toggle switches between cards, full history, and off for live comparison.
2. **Your context:** cards by category with budget meters, status badges, Why? / Confirm / Edit / Remove.
3. **Insights:** tokens for cards vs. full history; the eval chart goes here.
4. **Quick check deck:** a Tinder-style stack of cards that need a check, for when the user wants to go through several at once.
5. **Your data:** export me.json / me.md, reset, engine info.

## 4. Positioning

- Pitch it as **a context layer any personal agent could adopt**, not as "a settings tab for Muse." Don't claim integration with any real Meta product.
- **Out of scope for the pitch:** ads, segmentation, monetizing personal data, premium unlocks. User-owned data is the trust story, and "free for everyone" stays intact.
- **Banned-project check** (from the participant guide): we are *not* a personality analyzer (we store preferences and lessons the user confirms, never labels about who someone is), *not* basic RAG (the core is the confirmation loop, budgets, provenance and scoping), and *not* a nutrition coach or medical advisor.

## 5. Architecture

```
Browser (Muse-style mobile UI)
   │  /api/chat  /api/cards/:id  /api/distill  /export/me.json
Node server (no dependencies)
   ├─ selectRelevant  → BG model: which cards matter + stakes
   ├─ decideCue       → plain code: the don't-nag rule
   ├─ answer          → MAIN model with only the relevant cards
   ├─ distill         → BG model, 6 conversations per call, incremental merge
   └─ me.json         → source of truth; text and me.md generated from it
```

| Job | Model | Provider |
|---|---|---|
| Answers the user sees | Muse Spark | Meta Model API |
| Card extraction, relevance, eval judging | Muse Spark Open (`meta-models/muse-spark-open-1026`) | Baseten (falls back to Meta API) |
| Voice replies to quick checks | Muse Voice Transcribe | Meta Model API |
| Stretch: snap a menu/receipt → cards | Muse Image / SAM 3.1 | Meta Model API |

Each provider is one config line (all speak the OpenAI chat format). With no key, the app runs in **mock mode** on hand-written fixtures.

## 6. Eval (Technical Depth + the demo chart)

- **Data:** `data/test-history.json`: 27 conversations of TEST DATA from Jun 2023 to Oct 2026. Persona "Alex" (they/them): partner Sam, kid Maya, dog Biscuit. Everyday personal-agent tasks: dinner, groceries, coffee order, calendar, flights and stays, gifts, bills, shows, running. Planted facts F01–F20, four in-chat changes (latte → matcha, Airbnb → hotels, dinosaurs → soccer), one lesson (book the dog sitter early), one sensitive fact (back pain).
- **Answer key:** `data/answer-key.json`: 15 everyday questions with checklist checks, plus three preferences that changed outside chat (WFH day moved, open to a ski trip, back pain confirmed).
- **Setups:**
  - A: full history
  - B: inferred-only cards (how agents work today)
  - C: cards after confirmation swipes
  - D: no memory (baseline)
- **Metrics:**
  - context tokens and latency
  - fact accuracy: a judge model checks each answer against its checklist (more reliable than "is this good?")
  - stale-fact errors (used F06a/F11a)
  - quick checks asked per conversation
- **Target chart:** C uses ~95% fewer tokens than A and beats B on changed facts.

## 7. Build schedule

| Day | Deliverable | Status |
|---|---|---|
| Tue Oct 27 | Test data + answer key, card schema, server, Muse-style UI, mock mode | ✅ done |
| Wed Oct 28 | API key in; live card extraction + relevance + answers; tune prompts | ⏳ needs credits |
| Thu Oct 29 | Eval script + chart in Insights | |
| Fri Oct 30 | Voice replies via Muse Voice Transcribe; polish quick-check flow | |
| Sat Oct 31 | Deploy (public URL + rate limit + spend limit); public GitHub repo | |
| Sun Nov 1 | Demo script, record 3-min video draft | |
| Mon Nov 2 | Final video, README, X post for the Most Viral prize | |
| Tue Nov 3 | Buffer. Submit early | |
| Wed Nov 4 | Hard deadline 9 PM ET | |

## 8. Demo script (3 minutes)

1. **(0:00)** Firsthand hook: "My agent's memory file is empty. It still remembers my lunch. What does it know, and is it still right?"
2. **(0:20)** Build context from chats → cards appear, each with "Why?" provenance.
3. **(0:50)** "Need places for lunch today" → quick check: *Still veg on Tuesdays?* → swipe right → the answer applies it.
4. **(1:20)** "Grab me a morning drink" → *You used to say cold brew; is chai the new normal?* → swipe → chai places.
5. **(1:45)** Same question with memory set to full history: same quality, about 20× the tokens. Show the eval chart.
6. **(2:15)** Sensitive gate (knee card stays 🔒 until yes) and the 👍 implicit confirmation.
7. **(2:35)** Export me.json: "Your context is yours, portable to any agent." Close on: free, trusted, affordable to run.

## 9. Submission checklist

- [ ] Accept Official Rules; claim $150 Meta credits (form + card on file + spend limit) by Nov 4
- [ ] Apply: Baseten ($100 + 2M TPM), Modal ($100, backup)
- [ ] Public GitHub repo with commit history showing work done during the event
- [ ] Live public URL
- [ ] 3-minute video showing only features built during the hackathon
- [ ] Everyone listed on the submission page; repo and video links checked in a private window
- [ ] X post with the demo clip (Most Viral bonus)

## 10. Open questions

- Exact Muse Spark model ID from the Model list page.
- Hosting choice (Render, Railway or Fly for a Node server).
