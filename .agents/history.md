# History (condensed)

## Oct 27: idea → prototype
- Judged the idea honestly: "show the memory" alone exists (ChatGPT saved memories, Claude memory summary, Muse Memory.md); none **asks to confirm**. Muse also keeps hidden memory (chat recall, connector data, people profiles). The MVP became **inferred vs confirmed**.
- User refinements: cards are facets, not either/or; lessons like "summit had no stores, pack snacks"; folder/file patterns auto-generated; Tinder-style cue in chat at the right moment; don't nag.
- Read the participant guide (PDF): rules, banned projects (no personality analyzer, basic RAG, nutrition coach, medical advice), rubric, prizes, credits. Applied for Modal; Baseten described; Fireworks skipped.
- Built: test data + answer key, `me.json` cards, server, Muse-style UI (later: sidebar, Settings sheet, Memory topics, swipe decks), mock mode, eval with charts, plan.md.
- Deck v1 built from Vamshi's sample video as the quality bar; renamed **Déjà Vu**; switched to Meta blue; closer reworked.
- Generic persona **Alex** (2023–2026, everyday tasks) replaced the first San Diego/Vamshi-based data. Dated cards and "Why?" → exact conversation added.

## Oct 28 (night): live on Muse
- API key in; switched to **Muse Spark 1.3** after 1.1 returned empty replies (thinking tokens). Spend cap added.
- Vamshi's real Muse export imported privately: 5 weeks → ~42 cards, sensitive ones locked automatically.
- Moved everything into the git repo `deja-vu`; the user squashed and pushed the first commit.
- Voice confirmation via Muse Voice Transcribe (realtime WebSocket protocol found in Meta docs).
- Eval grew: memory-summary baseline, judge fixes, 2-run averages.
- UX overhaul from user feedback: two-choice cards; Not anymore → Chat about it/Skip; deck end summary with bulleted pre-filled chat.
- Test suite (now 26). Synthetic persona **Maria**. Nidhi's real export imported. Answer keys written from each person's own words (no money/visa topics).
- Final 3-way eval on 4 people (see context.md). Eval-driven fixes: style cards, apply-the-cards prompt, inclusive relevance, duplicate-edit merge, faster relevance.

## Oct 28 (late): demo-ready
- Quiet ⓘ footer; 👍/Not quite removed; live background learning with provenance; stated changes confirm the card.
- Profiles switcher (4 people); per-profile suggestions and demo scripts; Play demo conversation; `scripts/record-demo.js`.
- Replay cache + `MUSE_ENABLED`; deterministic learning prompts → recorded demos replay in ~1–1.5 s.
- Key-card-only quick checks (no more avatar/brand-pitch checks on dinner questions); agent identity fixed ("You are Sparky, Alex's agent").
- Answers now see recent turns ("lunch near the hotel" → knows it's the Inn at Sunset Cliffs).
- San Diego trip demo scripts recorded for all 4 profiles.
- Spend Oct 28: ~$8.85 of a $10 cap.

## Oct 29: engine you can see, own shell
- **Writer → grader gate** (`src/engine/review.js`), sensitive texts never logged; Insights "What I kept".
- **Prompts** moved word for word to `src/prompts/*.md`; `engine-quality.md` (six principles, own wording) + card-wording rules; `prompt-quality.md` with an audit.
- **Learning never blocks chat**; merges into memory as it is when ready.
- **Own shell:** Muse-derived tabs/sidebar/placeholder Settings removed; chat home; "Memory · by Déjà Vu" menu section; wordmark + rewind-clock mark; deck palette; light/dark switch; `.sparky/` renamed `.agents/`.
- **Answer first, check after**, quiet yeses, **draft_booking / draft_order** tool calls with a redo that marks what changed, **↻ Memory updated** in chat, **agent trace** (ⓘ + Insights), **memory on/off + fast-forward**, **topic relevance cache + single relevance call**, short reusable "Chat about it" opener, **plug-in API** (`/api/recall`, `/api/remember`).
- Re-recorded Vamshi and Alex live (~$0.30). README leads with the engine. 40 tests.

## Oct 29 (later)
- Grader moved to **Muse Wonder 1.0**; spend guard prices per model.
- App cards restyled to match the deck; dark-mode screenshots for deck slides 7–9 (Alex for Memory: Vamshi's real topics include sensitive ones).
- Fixed: an invisible fast-forward overlay swallowed every click (`[hidden]` now always wins).
- Answer-first layout: pick inside the reply, check below it, Tinder-style swipe animation on every choice.
- **Staged memory build** with guard, checkpoints, self-review, Wonder grade, contract rerun; Rebuild button with live progress; Memory since / Last verified. Live run on Alex: 37 turns → 23 cards, ~$0.05.
- Repo split into `src/engine`, `src/prompts`, `src/platform`, `src/ui`. 46 tests.
- Rebuild: confirm sheet, monthly limit (+ new-chats-only reads), confirmed cards as trusted input, grader at the exact chat spot, jump-to-message link. Live: plain-language injections 5/5 skipped by the writer (code guard 0/5); a real rebuild of Vamshi's 304 turns → 22 cards, 3 secrets removed.
- Fixed two bugs found in end-to-end testing: the update route could confirm the wrong card; a rebuild overwrote the demo seed.
- Responsive layout (phone / iPad / laptop with a toggleable sidebar). 49 tests.
