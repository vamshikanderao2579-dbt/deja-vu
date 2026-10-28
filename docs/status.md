# Status: Oct 28 night (5-minute read)

Spend today: **$7.79** of the $10 cap. Nothing committed since your push. All changes are local, waiting for your review.

## Done tonight

**1. Simpler cards (your UX ask)**
- Every card now has two choices: ✓ Still true / ✕ Not anymore, plus a 🎙 mic. Swipe up and the edit/note boxes are gone.
- ✕ forgets the card, then asks "Want to tell Sparky what changed?" with **Skip** (one tap, nothing else happens) or **💬 Chat about it**.
- Chat about it lands you in chat with the sentence started: *"Hey Sparky, my Food preference '…' has changed. Now I'd like "*. You finish it, the agent saves the new card as confirmed, then answers your original question with it.
- Same flow in the Memory swipe deck. Voice still works: "Nope, it's Wednesdays now" updates the card directly.
- Tested live end to end: latte → "a hot masala chai, no coffee" → saved "Prefers hot masala chai; avoids coffee" ✓ → answered "your usual hot masala chai".

**2. Test suite.** `npm test` runs 24 tests in under a second: 12 end-to-end API flows (cards, quick checks, never asking twice, no interruptions on casual asks, chat-about-it, provenance, thumbs-up, demo memory, exports, voice, bad input) and 12 rule tests. All pass. Mock mode, own state file, $0.

**3. Generic personas.** New synthetic persona **Maria**: ICU nurse in Phoenix, night shifts, single mom of a teen, mom moves in, budget-minded, writes short lowercase messages. 24 chats, 2024 to 2026, with an answer key. Alex stays as the suburban parent. Your and Vamshi's real histories are imported privately; I wrote answer keys from your own messages (no money or visa topics).

**4. Eval with your three setups**: full history vs inferred memory (summary, sent every message) vs confirmed memory (only what's needed), on 4 people and 42 questions:

| | Confirmed | Summary | Full history |
|---|---|---|---|
| Average accuracy | **84.5%** | 82.5% | 73% |
| Changed outside chat | **94%** | 44% | 38% |
| Stale answers | **1** | 2 | 5 |
| Tokens per message | **~147** | ~488 | ~38,900 |

Honest notes: on Nidhi's real history the summary wins (93 vs 86), because nothing in her key changed outside chat. On Vamshi's they tie at 69. Full history is worst everywhere. Details: `docs/eval.md`.

**5. Fixes the eval forced (good story for judges)**
- **Style cards.** "No em dashes", "exactly 5 hashtags" and "just give the hook" weren't becoming cards. Now topic `style`, always included. Nidhi's confirmed score went from 71% to 86%.
- Answers now *apply* the cards and say which ones they used. Relevance includes the people a plan affects. Duplicate edits merge.
- Speed: confirmed answers went from about 9.5 s to **about 6.4 s** at the same accuracy. Summary and full history take about 3 s.

**6. Slides updated:** slide 10 (new 3-way results) and slide 6 (new two-choice flow).

## Next (priority order)

1. **Review and commit** tonight's local changes (`git status`; nothing private is staged: `data/private/` is ignored).
2. **Speed.** 6 s is still slow on stage. Options: run relevance in parallel with a "thinking" bubble, cache relevance per topic, or move relevance to Muse Spark Open on Baseten/Modal (also earns the open-weights bonus).
3. **Retake app screenshots** for slides 6 and 7 (the current ones show the old 3-button card) with the avatar set to Pip, not Sparky.
4. **Deploy:** Render or Railway, `npm start`, env vars from `.env`, spend cap on. Add the live URL to the README and last slide.
5. **Video (3 min):** follow the deck's speaker notes. Demo beats: quick check → ✕ → chat about it → answer changes; Memory deck with "Why?" and the exact conversation; one voice reply; slide 10 numbers.
6. **Submit Nov 3** (not Nov 4). List both of you; confirm a 2-person team is OK in the indie track.

## What else could win points

- **Open-weights bonus ($10K):** move background jobs to Muse Spark Open via Modal once credits land; it's one `.env` change.
- **Most Viral ($20K):** a 20-second clip of the swipe → chat-about-it → "the answer changed" moment, posted on X.
- **"Surprise us" on Meta tooling:** Muse Image could turn a photo (a receipt, a menu, a concert ticket) into a card. It's also the fix for the known gap that one-off purchases don't become cards.
- **Eval polish:** 2 to 3 runs per persona with averages and ranges, plus a log-scale growth chart so the summary line is visible.
- **Real-data story:** "We ran it on our own Muse history: 5 weeks → 44 cards, 14 sensitive ones locked automatically." Show counts only, never the content.

## Where things are

- Deck: https://claude.ai/artifact/DJKtjUyCdDRghS4rW61hJr
- App: http://localhost:3000 (Settings → Load demo memory for a clean demo state)
- Eval: `npm run eval -- --persona alex|maria|nidhi|vamshi`
- Private data and results: `data/private/` (git-ignored)
