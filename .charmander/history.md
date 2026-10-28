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
- Key-card-only quick checks (no more avatar/brand-pitch checks on dinner questions); agent identity fixed ("You are Charmander, Alex's agent").
- Answers now see recent turns ("lunch near the hotel" → knows it's the Inn at Sunset Cliffs).
- San Diego trip demo scripts recorded for all 4 profiles.
- Spend Oct 28: ~$8.85 of a $10 cap.
