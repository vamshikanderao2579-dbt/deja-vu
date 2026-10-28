# Eval: does confirmed memory beat inferred memory?

All numbers below come from `npm run eval` on **synthetic** test data (`data/test-history.json`, 27 conversations from 2023 to 2026, persona "Alex"). Answers and the judge are Muse Spark 1.3.

## Setup

1. **Build cards** from the full history (Muse Spark, incremental batches).
2. **Simulated review pass.** Each card is matched to the planted fact it came from (shared source messages) and a simulated user answers with the *current truth* from `data/answer-key.json`: confirm, reject outdated facts, or edit the three preferences that changed **outside chat** (never mentioned in the history, so only a confirmation can catch them).
3. **Answer 15 everyday questions** ("Find a place for dinner tonight with the family", "Book flights for our spring break trip", …) in five setups:

| Setup | Memory sent with each message |
|---|---|
| Full history | every past message |
| Memory summary | a ~460-token summary Muse Spark wrote from the whole history (how compact-memory agents work today) |
| Guessed cards | only the relevant cards, none confirmed |
| Confirmed cards | only the relevant cards, after the review pass |
| No memory | nothing |

4. **Judge** each answer against a checklist (29 checks total), e.g. *"Suggests an Airbnb"* (should not) or *"Picks Wednesday as the work-from-home day"* (should). A checklist is far more reliable than asking a model "is this a good answer?".

## Results (average of 2 runs, Oct 28 2026)

| | Confirmed cards | Memory summary | Full history | Guessed cards | No memory |
|---|---|---|---|---|---|
| **Overall accuracy** | **88%** | 81% | 76% | 74% | 30% |
| Changed outside chat | **100%** | 25% | 25% | 0% | 50% |
| Changed in chat | **100%** | 92% | 83% | 92% | 50% |
| Stable facts | 82% | **89%** | 84% | 84% | 19% |
| Stale answers | **0** | 1 | 1 | 1 | 0 |
| Memory tokens per message | **~59** | ~467 | ~1,712 | ~57 | 0 |

## What it shows

- **Confirmation is the only way to catch life changes that never come up in chat.** Every inferred setup, including a good summary, stays wrong about them.
- **Scoped cards read ~8× fewer tokens per message than a summary** and ~30× fewer than full history, and the gap widens as history grows: full history passes 45K tokens a year at two chats a day, while cards stay capped (10 topics × 8 cards × 14 words).
- **Honest caveat:** on long-stable facts the summary still edges out scoped cards (89% vs 82%). Most misses were a relevant card that was sent but not used in the answer, or a card the relevance step left out. That's the next thing to tune.

## Real data (private, not in this repo)

On one team member's own 5 weeks of Muse chats (727 messages, ~113,600 tokens), Déjà Vu built 42 cards totalling ~398 tokens, about 285× smaller. 14 of them (income, loan, visa status, tax filing, religious food habits) were locked as sensitive automatically. The raw history and cards stay in the git-ignored `data/private/`.

## Cost

One full eval run costs about $0.45 on Muse Spark 1.3.
