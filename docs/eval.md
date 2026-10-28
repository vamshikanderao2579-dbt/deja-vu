# Eval: confirmed memory vs inferred memory vs full history

Three ways a personal agent can remember you, compared on **4 people** (2 synthetic personas with very different lives, plus 2 team members' own real Muse histories), **42 everyday questions** and **76 checklist items**. Answers and judge: Muse Spark 1.3.

| Setup | Memory sent with each message |
|---|---|
| **Full history** | every past message |
| **Inferred memory** | a summary Muse Spark wrote from all chats (~350 to 600 tokens), sent every message: how compact-memory agents work today |
| **Confirmed memory** | only the cards relevant to this request, after the person reviewed them |

```bash
npm run eval -- --persona alex     # alex | maria (synthetic, in repo) · nidhi | vamshi (private)
```

## How it works

1. **Build cards** from the person's history (Muse Spark, incremental batches).
2. **Review pass.** For the synthetic personas, each card is traced to the planted fact it came from and a simulated user answers with the *current truth*, including preferences that changed **outside chat** (never mentioned, so only a confirmation can catch them). For the real histories, Muse Spark plays the person, given true facts we wrote from their own messages, and confirms, rejects or corrects each card.
3. **Answer** each question in each setup.
4. **Judge** against a checklist, e.g. *"Suggests an Airbnb"* (should not) or *"Includes exactly 5 hashtags"* (should). Checklists are far more reliable than asking a model whether an answer is good.

## Results (Oct 28 2026, one run per person, final code)

| | Confirmed memory | Inferred memory (summary) | Full history |
|---|---|---|---|
| Alex · synthetic · 15 questions | **93%** | 83% | 83% |
| Maria · synthetic · 11 questions | **90%** | 85% | 75% |
| Real history A · 25 days, 457 msgs · 8 questions | 86% | **93%** | 71% |
| Real history B · 5 weeks, 727 msgs · 8 questions | **69%** | **69%** | 62% |
| **Average** | **84.5%** | 82.5% | 73% |
| Changed outside chat (synthetic) | **94%** | 44% | 38% |
| Stale answers (all 4 people) | **1** | 2 | 5 |
| Memory tokens per message (avg) | **~147** | ~488 | ~38,900 (up to 113,619) |

Earlier runs on Alex (before the final prompt changes) ranged 76 to 90% for confirmed memory, so treat single-run differences of a few points as noise.

## What it shows

- **Confirmation catches what inference can't.** When a preference changed and never came up in chat, every inferred setup kept getting it wrong (44% and 38%); confirmed memory got 94%.
- **Reading only what's needed is cheaper without costing accuracy.** Confirmed memory reads ~3× fewer tokens per message than a summary and up to ~700× fewer than full history, while matching or beating both on average.
- **Full history is the worst of both.** It's the most expensive *and* the least accurate: years of noise drown the signal.
- **Honest caveat.** On one real history where nothing had changed, the summary scored higher (93% vs 86%). A good summary is strong when life is static; confirmed memory wins on cost everywhere and on accuracy as soon as things change.

## What we fixed because of this eval

- **Style cards.** Real users have strong rules about *how* they want answers ("no em dashes", "exactly 5 hashtags", "just give the hook"). These weren't becoming cards. They are now (topic `style`) and are always included, since they're tiny and apply everywhere. On the creator-heavy real history this lifted confirmed memory from 71% to 86%.
- **Answers apply the cards.** Most early misses were a card that was sent but ignored; the prompt now says the cards were picked for this request and asks the answer to name what it applied.
- **Relevance includes the people a plan affects** (who lives with you, who you're buying for) and leans toward inclusion.
- **Known gap:** one-off purchases (concert tickets) sometimes don't become cards, so the agent can't recall them later.

## Real data stays private

The two real histories, their answer keys, cards and per-answer results live in the git-ignored `data/private/`. Only the aggregate numbers above are published. On those histories, 5 weeks of chat (~113,600 tokens) became 44 cards (~400 tokens), and sensitive cards (income, loans, visa status, tax filings, religious food rules) were locked automatically.

## Speed

Confirmed memory adds one small relevance call before answering: about 6 s per answer vs about 3 s for the others with Muse Spark 1.3 (relevance on minimal reasoning; "low" took about 9.5 s for the same accuracy).

## Cost

About $0.35 per synthetic persona and $0.70 to $1.60 per real history (full history is the expensive part).
