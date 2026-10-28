# Context

## The project
- **Déjà Vu**: confirmed memory for personal AI agents. Team **Keyholders**: Sreenidhi (Nidhi) Durgam + Vamshi Kanderao (Vamshi presents).
- **Meta Global AI Developer Hackathon** (Cerebral Valley), Theme 1: Build for Your World. Indie track (2-person team: confirm eligibility with organizers).
- **Deadline:** Wed **Nov 4, 2026, 9:00 PM ET**. Submit **Nov 3** (last full support day). Needs: public GitHub repo, live URL, **3-minute video**, everyone listed.
- **Judging:** Impact 30 · Use of Meta AI tooling 25 (beyond basic integration, "surprise us") · Technical depth 20 · Demo 25. Top 5 per track go to a live final. Bonus prizes: Most Viral on X ($20K), Open-weights build ($10K), Community vote ($10K), Agentic use ($5K).
- **The team is traveling** Oct 27–Nov 2 (anniversary trip: San Diego → Las Vegas → Zion), on one laptop. Keep their time asks small.
- **Credits:** one $150 Meta credit grant (Nidhi's didn't arrive because of an email mismatch). Modal $100 applied. Daily spend cap in code.

## One-line pitch
Agents are really good at inferring context from chats. But confirmed memory is always better than inferred memory.

## How it works (product)
- Chat history → short **cards** (≤14 words) grouped by topic (food, travel, family, work, style…). Each card is **guessed (~)**, **confirmed (✓)** or **locked 🔒** (sensitive: unused until the user says yes). Every card is dated (learned / last mentioned / confirmed) and **Why?** opens the exact conversation and time.
- **Quick checks:** when a *key* card for this answer is guessed, changed, or a year old, the agent asks once, in chat: ✓ Still true / ✕ Not anymore / 🎙. Never style or agent-identity cards; once per chat; cooldown; confirmed cards left alone 6 months.
- **Not anymore** → card forgotten, original question answered immediately, and a normal agent message offers **💬 Chat about it** / **Skip for now** (never blocks). Chat about it pre-fills: "Hey Sparky, my Food preference '…' has changed. Now I'd like ". The reply becomes a confirmed card.
- **Memory deck** (sidebar → Memory → topic): pure swiping; at the end, one summary "You removed N cards… Chat about them / Skip for now" → pre-filled bulleted message, one line per removed card.
- **Live learning:** every chat exchange is learned from in the background; new cards arrive quietly ("Sparky noticed: …"). A change you state in chat ("Sam eats chicken and fish now") becomes a confirmed card.
- **Style cards** (how you want answers: no em dashes, 5 hashtags, short) are always included.
- **Answers** see only the relevant cards plus the recent turns of the conversation. After an answer only a quiet **ⓘ** (cards used → tap a card to open it in Memory, tokens saved).
- **Voice:** Muse Voice Transcribe (realtime WebSocket) for answering cards and dictation.
- **Profiles:** Alex, Maria (synthetic) · Sreenidhi, Vamshi (real, private). Switcher next to Settings in the sidebar.
- **Demo player:** "▶ Play a demo conversation" types each profile's script; pauses on quick checks. **Replay cache** makes recorded demos answer in ~1–1.5 s.

## Meta models in use
Muse Spark **1.3** (answers, judge, card extraction; reasoning `minimal`/`low` per job; thinking counts against max_tokens), Muse Voice Transcribe 1.0 (voice). Available but not yet used: Muse Spark Open (Baseten/Modal), Muse Image, SAM 3.1, Muse Wonder.

## Eval (docs/eval.md)
Three setups × 4 people (2 real, 2 synthetic), 42 questions, 76 checks, judged by Muse Spark:
confirmed **84.5%** vs summary 82.5% vs full history 73% · changed outside chat **94% vs 44% vs 38%** · stale answers **1 vs 2 vs 5** · memory tokens/message **~147 vs ~488 vs ~38,900** (up to 113,619). Honest caveat: on Sreenidhi's real history the summary scored higher (93 vs 86).
Real data: 5 weeks of Vamshi's Muse chats (~113,600 tokens) → ~44 cards (~400 tokens); sensitive cards (income, loans, visa, taxes, religious food rules) locked automatically.

## Where things are
- Repo: `~/Desktop/personal-context-hackathon/deja-vu` (remote: github.com/vamshikanderao2579-dbt/deja-vu, pushed by the user; first commit squashed by them).
- **Uncommitted local work** from Oct 28 night: profiles, replay cache, live learning, quiet ⓘ footer, two-choice cards, inline chat-about-it, deck end summary, multi-line composer, San Diego demo scripts, tests (26), eval personas. User reviews and commits.
- Deck (claude.ai artifact, private until shared): https://claude.ai/artifact/DJKtjUyCdDRghS4rW61hJr. 12 slides, Meta blue palette, Geist font, speaker notes. Slide files live in a scratchpad folder of the old chat; to edit, `read` the artifact first.
- App: `npm run dev` → http://localhost:3000. Avatar/name: `AGENT_NAME=Sparky`, Pip face (no avatar file).
- Private (git-ignored): `data/private/` (real histories, answer keys, real eval results, replay cache, profiles), `.env`, `data/spend.json`, `EYI Package*` exports.

## Key files
`server.js` routes · `src/agent.js` extraction, relevance (+key cards), answers, live learning, card rewrite · `src/cards.js` merge/budgets/actions · `src/cue.js` don't-nag rule · `src/llm.js` client + spend cap + replay cache · `src/store.js` profiles, state, live history · `src/voice.js` · `src/prompts.js` · `public/` app · `eval/run.js` · `scripts/` (check-api, import-muse-export, make-demo-memory, record-demo) · `test/` · `docs/eval.md`, `docs/plan.md`, `docs/status.md`.
