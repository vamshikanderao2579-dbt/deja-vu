# To-do: one focus per day (Oct 29 → Nov 4)

Team travels until Nov 2 (San Diego → Vegas → Zion → NYC), one laptop. Claude does the build; your time per day is noted. Daily spend cap: `SPEND_CAP_USD` (check `data/spend.json`). Specs for each item are in `next.md`.

## Wed Oct 29: re-run the evals (queued first)
- [ ] Claude: `npm run eval -- --persona alex|maria|nidhi|vamshi` on the latest code (tree-first relevance, key-card checks, agent identity, recent turns, seasonal sleeping cards). ~$3–4 total; say the cost before starting.
- [ ] Claude: diagnose misses (see skills/run-eval.md), update `docs/eval.md` and deck slide 10, honest caveats kept.
- [ ] You (10 min): skim the new numbers.
- [ ] Claude: **re-record all 4 demos** (`node scripts/record-demo.js <profile>`, ~$0.40 total; wait a minute between profiles). The agent was renamed **Sparky**, so the old recordings (made as "Charmander") no longer replay.
- [ ] You (2 min): **generate Sparky with Muse Image**. Run:
  `python3 scripts/generate_mascot.py` → 4 options in `public/sparky-option-1..4.png`, each resized to 1024×765 like the placeholder. Pick one: `cp public/sparky-option-N.png public/sparky.png`, set `AGENT_AVATAR=sparky.png` in `.env`, restart the app. (`--n 2` for fewer; each option is a paid call.) Then delete the Gemini placeholder `public/sparky.jpeg` and use the line "Muse Image designed our agent" in the deck/video.
  Prompt (also in the script; edit with `--prompt "…"`):
  > Cute friendly cartoon mascot named Sparky: a glossy golden-yellow five-pointed star with a soft amber outline, big shiny blue eyes, small happy open smile, tiny eyebrows, short rounded arms open wide in a welcoming pose, two short legs, standing. Soft warm glow, a little trail of tiny golden stars curving behind it. Centered inside a pale sky-blue circular badge with a thin gold ring and a few small sparkles. Clean modern cartoon style, smooth shading, original character, not resembling any existing brand or franchise mascot. Off-white background, no text, no logos.

## Thu Oct 30: answer first, check after (next.md item 0)
- [ ] Claude: one-call flow; the slim "Going with: …" line above the answer; continuing = implicit yes; ✕ → chat → optional "Redo with that?"; deferred check after the task. 🔒 cards still never used before a yes.
- [ ] Claude: update demo scripts (`onCheck`), `record-demo.js`, tests; re-record all 4 demos (wait a minute between profiles for the rate limit).
- [ ] You (15 min): play Vamshi's and Alex's demos; flag anything that feels off.

## Fri Oct 31: the 1-minute experience (next.md items 1–2)
- [ ] Claude: Memory on/off toggle + explainer; "fast-forward 5 weeks" onboarding into Vamshi's San Diego demo; Memory tour (Why?, swipe, end summary); per-profile "How lean is my memory?".
- [ ] You (20 min): dry-run the 1-minute flow; Vamshi practices narration over the pauses.

## Sat Nov 1: ship it (flying home)
- [ ] You: review + commit (`git status`: nothing from `data/private/`, `.env`), push. Make the repo public.
- [ ] Claude: deploy (Render/Railway); only Alex + Maria public; spend cap on. README live URL.
- [ ] Claude: retake slide 6–7 screenshots with the **Pip** avatar; fill `[repo link]`, `[live demo URL]`, `[your name]` in the deck.

## Sun Nov 2: record
- [ ] You: record the 1-minute experience (Vamshi presenting) and the 3-minute submission video (deck + demo). `MUSE_ENABLED=false` for instant replay; answer cards as scripted.
- [ ] You: 20-second X clip (✕ → chat about it → the answer changes) for Most Viral.

## Mon Nov 3: submit (last full support day)
- [ ] You: confirm in #questions that a 2-person team is OK in the Indie track.
- [ ] You: submit on the CV platform; both listed; check the repo and video links in a private window.

## Tue Nov 4: buffer only (deadline 9 PM ET)
- [ ] Fix anything the submission check found. Share the gallery link for the community vote.

## Parking lot (only if time allows)
Muse Spark Open via Modal (open-weights bonus) · Muse Image (photo → card) · seasonal cards updated from last year's pattern · eval with 2–3 runs per persona.
