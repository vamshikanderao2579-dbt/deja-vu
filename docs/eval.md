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
| **All checks** | **81.7%** | 71.8% | 70.5% |
| Changed outside chat | **82.3%** | 49.2% | 48.4% |

The two sets below are the breakdown. Averaging them doesn't give the headline, because the sets have different numbers of checks.

### Main set: 4 people, 42 questions, 76 checks

| | Déjà Vu memory | Memory summary | Full history |
|---|---|---|---|
| Alex · synthetic | **90%** | 79% | 79% |
| Maria · synthetic | **95%** | 90% | 70% |
| Real history A · 194 user msgs | **93%** | 86% | 71% |
| Real history B · 304 user msgs | **69%** | 54% | **69%** |
| **This set** | **88.2%** | 78.9% | 73.7% |
| Changed outside chat | **91.7%** | 58.3% | 41.7% |
| Stale answers | **0** | 4 | 4 |
| Memory tokens per message | **~150** | ~490 | ~39,000 |

### 10 more synthetic people, 200 questions, 236 checks

Written with [`scripts/make-personas.js`](../scripts/make-personas.js) from [`eval/PERSONA_BRIEF.md`](../eval/PERSONA_BRIEF.md) after the engine was built. The builder was tuned with two of their builds (Grace, James) in view, so they are not a clean held-out set. Each has 9 to 13 days of chats (about 50 messages), 20 questions (8 stable, 4 changed outside chat, 2 changed in chat, 2 short-term, 2 sensitive, 2 one-off) and only first names. The same Meta model family writes them, answers and judges, which is a limit of this eval.

| | Déjà Vu memory | Memory summary | Full history |
|---|---|---|---|
| James | **92%** | 83% | 79% |
| Fatima | **91%** | 61% | 70% |
| Rosa | **87%** | 74% | 74% |
| Aisha | **84%** | 72% | 68% |
| Sofia | **83%** | 70% | 78% |
| Ethan | **78%** | 65% | 57% |
| Grace | **76%** | 68% | 64% |
| Luis | **74%** | **74%** | **74%** |
| Daniel | **67%** | **67%** | 63% |
| Tom | 65% | 61% | **70%** |
| **This set** | **79.7%** | 69.5% | 69.5% |
| Changed outside chat | **81.3%** | 48.2% | 49.1% |
| Stale answers | **7** | 13 | 11 |
| Memory tokens per message | **~138** | ~395 | ~1,650 |

How the builder works: the writer makes a second pass over each conversation for missed facts, and the grader rewords a card with one unsupported detail instead of rejecting it, reading up to three cited spots. Each person ends up with 11 to 16 cards from about 50 messages. Treat single-run differences of a few points as noise.

## What it shows

- **Confirmation catches what inference can't.** Over all 14 people and 312 checks, each counted once: Déjà Vu memory 81.7%, summary 71.8%, full history 70.5%. When a preference changed and never came up in chat, the summary and full history got it right about half the time (49.2% and 48.4%); Déjà Vu memory got 82.3%.
- **Reading only what's needed is cheaper without costing accuracy.** Déjà Vu memory reads ~3× fewer tokens per message than a summary and far fewer than full history, while scoring higher than both on each set.
- **Full history is the worst of both.** It's the most expensive *and* the least accurate: years of noise drown the signal.
- **Honest caveat.** On one real history where nothing had changed, the summary scored higher (93% vs 86%). A good summary is strong when life is static; confirmed memory wins on cost everywhere and on accuracy as soon as things change.

## Design choices the eval supports

- **Style cards.** Real users have strong rules about *how* they want answers ("no em dashes", "exactly 5 hashtags", "just give the hook"). These are cards too (topic `style`), always included, since they're tiny and apply everywhere.
- **Answers apply the cards.** The answer prompt says the cards were picked for this request and asks the answer to name what it applied, so a card that's sent isn't ignored.
- **Relevance includes the people a plan affects** (who lives with you, who you're buying for) and leans toward inclusion.
- **Known gap:** one-off purchases (concert tickets) sometimes don't become cards, so the agent can't recall them later.

## Real data stays private

The two real histories, their answer keys, cards and per-answer results live in the git-ignored `data/private/`. Only the aggregate numbers above are published. On those histories, 5 weeks of chat (~113,600 tokens) became 44 cards (~400 tokens), and sensitive cards (income, loans, visa status, tax filings, religious food rules) were locked automatically.

## Speed

Confirmed memory adds one small relevance call before answering: about 6 s per answer vs about 3 s for the others with Muse Spark 1.3 (relevance runs on minimal reasoning).

## Cost

About $0.35 per synthetic persona and $0.70 to $1.60 per real history (full history is the expensive part).
