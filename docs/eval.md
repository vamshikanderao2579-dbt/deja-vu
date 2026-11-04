# Eval: confirmed memory vs inferred memory vs full history

Three ways a personal agent can remember you, compared on **14 people** (2 real people's own Muse histories, plus 12 synthetic people with very different lives), **242 everyday questions** and **312 checklist items**. Answers and judge: Muse Spark 1.3.

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

## Results (one run per person)

### Headline: all 14 people, 312 checks, each counted once

| | Déjà Vu memory | Memory summary | Full history |
|---|---|---|---|
| **All checks** | **80.4%** | 72.4% | 75.0% |
| Changed outside chat | **80.6%** | 49.2% | 55.6% |
| Tokens in per answer (the API's count, average of 242) | **381** | 603 | 6,945 |

The two sets below are the breakdown. Averaging them doesn't give the headline, because the sets have different numbers of checks.

### Main set: 4 people, 42 questions, 76 checks

| | Déjà Vu memory | Memory summary | Full history |
|---|---|---|---|
| Alex · synthetic | **93%** | 76% | 83% |
| Maria · synthetic | **95%** | 80% | 85% |
| Real history A · 194 user msgs | **86%** | 79% | **86%** |
| Real history B · 304 user msgs | **62%** | **62%** | **62%** |
| **This set** | **86.8%** | 75.0% | 80.3% |
| Changed outside chat | **91.7%** | 41.7% | 50.0% |
| Stale answers | **1** | 3 | 2 |
| Tokens in per answer | **393** | 704 | 30,436 |

### 10 more synthetic people, 200 questions, 236 checks

Written with [`scripts/make-personas.js`](../scripts/make-personas.js) from [`eval/PERSONA_BRIEF.md`](../eval/PERSONA_BRIEF.md) after the engine was built. The builder was tuned with two of their builds (Grace, James) in view, so they are not a clean held-out set. Each has 9 to 13 days of chats (about 50 messages), 20 questions (8 stable, 4 changed outside chat, 2 changed in chat, 2 short-term, 2 sensitive, 2 one-off) and only first names. The same Meta model family writes them, answers and judges, which is a limit of this eval.

| | Déjà Vu memory | Memory summary | Full history |
|---|---|---|---|
| James | **92%** | 83% | 83% |
| Fatima | **87%** | 61% | 74% |
| Aisha | **84%** | 60% | 72% |
| Rosa | **78%** | **78%** | 74% |
| Luis | **78%** | 74% | **78%** |
| Tom | **78%** | **78%** | **78%** |
| Daniel | **75%** | 71% | 67% |
| Sofia | 74% | **83%** | 65% |
| Grace | 72% | 68% | **76%** |
| Ethan | **65%** | 61% | **65%** |
| **This set** | **78.4%** | 71.6% | 73.3% |
| Changed outside chat | **79.5%** | 50.0% | 56.3% |
| Stale answers | **5** | 13 | 10 |
| Tokens in per answer | **379** | 582 | 2,012 |

How the builder works: the writer makes a second pass over each conversation for missed facts, and the grader rewords a card with one unsupported detail instead of rejecting it, reading up to three cited spots. Each person ends up with 11 to 16 cards from about 50 messages. Treat single-run differences of a few points as noise.

## What it shows

- **Confirmation catches what inference can't.** Over all 14 people and 312 checks, each counted once: Déjà Vu memory 80.4%, summary 72.4%, full history 75.0%. When a preference changed and never came up in chat, the summary and full history got it right about half the time (49.2% and 55.6%); Déjà Vu memory got 80.6%.
- **Reading only what's needed costs fewer tokens.** Déjà Vu sent 381 tokens per answer on average (the API's own count), against 603 for a summary and 6,945 for the full history: 94% fewer than the full history. It is a few seconds slower per answer (about 12 s against 6 to 7 s), because it picks the cards first.
- **Full history is expensive and no more accurate.** Up to 111,000 tokens a message on the longest real history, and still behind confirmed cards.
- **Where it lost.** Déjà Vu is best or tied for 12 of 14 people. It lost to the summary on Sofia (74% vs 83%): her chats say her mother loves lemon desserts and mystery novels, and the card builder made no card for either, though its rules already ask for what the people the user plans for like. It lost to full history on Grace (72% vs 76%).
- **How these prompts were reached (Nov 3).** A first rerun with leaner prompts dropped Déjà Vu to 77.2%: it sent too few cards ("most requests need 1 to 5"), was told not every card needs using, and stopped acknowledging worries. Restoring "when unsure, include it", "use every card that fits" and one line on acknowledging news or worries brought it back to 80.4%, while checks stay limited to bookings, purchases, appointments, trips and events.

## Design choices the eval supports

- **Style cards.** Real users have strong rules about *how* they want answers ("no em dashes", "exactly 5 hashtags", "just give the hook"). These are cards too (topic `style`), always included, since they're tiny and apply everywhere.
- **Answers apply the cards.** The cards come with one line: use every card that fits this request, inferred ones too, and skip any that don't bear on it. An answer may say in passing which card shaped it.
- **Relevance includes the people a plan affects** (who lives with you, who you're buying for) and leans toward inclusion.
- **Known gap:** one-off purchases (concert tickets) sometimes don't become cards, so the agent can't recall them later.

## Real data stays private

The two real histories, their answer keys, cards and per-answer results live in the git-ignored `data/private/`. Only the aggregate numbers above are published. On those histories, 5 weeks of chat (~113,600 tokens) became 44 cards (~400 tokens), and sensitive cards (income, loans, visa status, tax filings, religious food rules) were locked automatically.

## Speed

Confirmed memory adds one small relevance call before answering: about 6 s per answer vs about 3 s for the others with Muse Spark 1.3 (relevance runs on minimal reasoning).

## Cost

About $0.35 per synthetic persona and $0.70 to $1.60 per real history (full history is the expensive part).
