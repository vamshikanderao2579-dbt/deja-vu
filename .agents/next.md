# Next: specs for open items

The order lives in `to-do.md`. This file holds the specs.

## Photo → cards (to-do #2)
- **Capture:** a 📷 button in the composer (and drag-and-drop on desktop). The photo is a message like any other.
- **Pipeline:** SAM 3.1 with a text prompt ("boarding pass", "receipt", "menu") crops the object → a vision-capable model reads the crop (hosted Muse Spark if it accepts images; else Muse Spark Open) → the card writer proposes cards → the grader checks them like any card.
- **Provenance:** source = the photo (thumbnail in **Why?**), date taken.
- **Examples:** boarding pass → "Flies JetBlue JFK→SAN, window seat"; receipt → "Buys oat milk at Trader Joe's weekly"; menu → "Ordered the lamb biryani at Adda".
- **Privacy:** card numbers, booking codes and addresses never become cards (code rule before the grader).
- **Check first:** `check-api` with one small image to the hosted model (cents).

## Time-aware cards (to-do #4)
- Card field `kind`: permanent (default) / seasonal (exists: `season` window) / situational (`expires`, e.g. "On a trip in San Diego until Nov 2").
- Situational cards drop out of relevance after `expires` and disappear from Memory a week later (export keeps them).
- The writer prompt sets `expires` when a message says "this week", "until…", "for the trip". Prompt change → do with the rewrite pass and eval.

## Forget a topic / start fresh (to-do #5)
- Topic page → "Forget this topic" (export first, then confirm). Settings → "Start fresh" (export, then clear cards; history stays).

## North-star metric (to-do #6)
- "Answers that needed no correction": answers whose check (if any) wasn't ✕'d and that weren't followed by a correction message in the next turn. Show next to checks per 100 answers.

## Open weights (to-do #7)
- `BG_BASE_URL`, `BG_API_KEY`, `BG_MODEL` move the writer and relevance to an open model; the grader stays on `GRADER_MODEL` (hosted Muse Wonder), so writer and grader are different models.
- Muse Spark Open is 816B MoE (42B active): use a hosted provider (Baseten `meta-models/muse-spark-open-1026`). Glimmer (~30B, Apache 2.0) fits one GPU on Modal via vLLM.

## Small UX leftovers
- Long check cards: consider a one-line check ("Went with: 2 queen rooms") instead of the full card when the answer is short.
- Drafts: "Looks good" could save the draft to a "Drafts" list in the menu.
