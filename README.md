# Déjà Vu

**Confirmed memory for personal AI agents.**
Personal agents infer things about you from every chat, keep them out of sight, and never ask if they got it right. Déjà Vu turns that hidden memory into short cards you can see, confirm with a swipe, and own.

> Agents are really good at inferring context from chats. But confirmed memory is always better than inferred memory.

Built for the [Meta Global AI Developer Hackathon](https://dev.meta.ai/events/global-hackathon) · Theme 1: Build for Your World · Team Keyholders

---

## What it does

- **Cards, not a black box.** Chat history becomes short cards ("Partner is vegetarian", "Book the dog sitter 2 weeks before trips"), grouped by topic. Each is marked *guessed* or *confirmed*, dated, and linked to the exact conversation it came from.
- **Asks once, only when it matters.** When a guessed, changed or year-old card is about to shape a booking, order or plan, the agent asks in chat. Swipe → still true, ← not anymore, ↑ fix it. A strict rule keeps it from nagging.
- **Bounded and scoped.** At most 10 topics × 8 cards × 14 words. Each question only sees the cards relevant to it, so context stays small however long the history gets.
- **Sensitive stays locked.** Health or money cards are visible but unused until you say yes.
- **Portable.** Export everything as `me.json`.

## Built on Meta models

| Job | Model |
|---|---|
| Answers the user sees, eval judge | Muse Spark (Meta Model API) |
| Background memory work: extract cards, merge, pick relevant cards | Muse Spark (default) or Muse Spark Open via an OpenAI-compatible host |

## Quick start

Requires Node 18+. No dependencies.

```bash
cp .env.example .env     # add MAIN_API_KEY from dev.meta.ai
npm run check-api        # lists your models, makes one test call
npm run dev              # http://localhost:3000
```

Without an API key the app runs in **mock mode** on a hand-written fixture, so the UI works offline.

```bash
npm run eval             # full history vs guessed vs confirmed vs no memory
```

A daily spend cap (`SPEND_CAP_USD`, default $3) stops model calls once reached. Today's spend is in `data/spend.json`.

## Repo layout

```
server.js                 HTTP server and API routes (no framework)
src/
  agent.js                card extraction, relevance + stakes, answers
  cards.js                merge, budgets, swipe actions, rendering
  cue.js                  the don't-nag rule: when to ask a quick check
  llm.js                  OpenAI-compatible client, spend cap
  prompts.js              all model prompts
  store.js                me.json (source of truth) and chat history
  config.js               .env loading and settings
public/                   Muse-style mobile web app (chat, Memory, insights)
data/
  test-history.json       synthetic chat history, Jun 2023 to Oct 2026
  answer-key.json         planted facts and eval checklist questions
  fixture-cards.json      offline cards for mock mode
eval/run.js               the eval; results land in eval/results/
scripts/
  check-api.js            verifies keys and model IDs
  import-muse-export.js   converts a Muse data export into chat history
docs/plan.md              product and requirements doc
```

## Using your own Muse history

```bash
node scripts/import-muse-export.js "<Muse export folder>"
```

This writes `data/private/history.json`. Set `HISTORY_FILE=data/private/history.json` in `.env` to use it. Everything under `data/private/` is git-ignored: real chat history never leaves your machine except as model calls you run.

## Data and privacy

All history in `data/` is **synthetic test data**. No ads, no segments, no selling data: user-owned memory is the point.
