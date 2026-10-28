# Recommendations: making Déjà Vu a seller for any personal-agent company

*Written from the seat of a senior technical product director at an AI lab. This is a product point of view, not a statement of any company's plans.*

## 1. The core insight is right, so sharpen the category
Every assistant now remembers. The open problem is **trust and correctness over time**: memory that silently drifts, can't be audited, and gets more expensive as it grows. Déjà Vu's wedge, *"confirmed beats inferred"*, is a real product principle, not a feature.

**Name the category, not the feature:** *a confirmed-context layer for agents*. Sell three outcomes:
1. **Correctness:** answers stay right when life changes (eval: 94% vs 44% on changes outside chat).
2. **Cost:** read only what's needed (~150 tokens per message vs ~490 for a summary, ~39K for full history).
3. **Trust:** users can see, fix, lock and export what the agent believes, with receipts.

## 2. What I'd do differently if designing this for an assistant like Claude
- **Memory as user-owned data, not model state.** One typed store (`me.json`-like) with a published schema. Every read and write is logged ("used in 12 answers this week"). The model proposes, the user disposes.
- **Scopes, not one bucket.** Personal / work / household / per-project memory, plus **shared cards** (a household where Sam's diet is one card both partners see). Most memory bugs come from scope bleed: work style leaking into personal chats, one person's preferences applied to another.
- **Confidence with decay.** Every card carries confidence and a *kind of time*: permanent ("allergic to peanuts"), seasonal ("training for a half marathon"), situational ("on a trip this week"). Situational cards expire on their own. That alone removes most stale answers without asking anyone anything.
- **Ask budget as a product metric.** Treat interruptions as a scarce resource: a per-user budget of questions per week, spent only where the expected cost of being wrong is highest (bookings, purchases, plans for other people). Report "questions asked per 100 answers" next to accuracy.
- **Sensitive tiers with on-device options.** Health, money, immigration, religion, location: never inferred into answers without opt-in, optionally stored only on the device, never used for ads.
- **Delegated, permissioned sharing.** OAuth-style scopes for other agents: "share my food cards with the grocery agent for this order", time-boxed and revocable. That turns memory from lock-in into a platform.
- **Evals as part of the product.** Ship the checklist eval as a harness the team runs on every model or prompt change: accuracy, changed-outside-chat accuracy, stale-answer rate, tokens per message, questions per 100 answers.

## 3. What to inherit from modern personalization (and do better)
The pre-AI pattern was a **sign-up questionnaire**: pick genres, follow topics, or skip. Modern products moved past it:

| Product pattern | What they learned | What Déjà Vu should do |
|---|---|---|
| **Implicit signals** (short-video and music apps: skips, rewatches, saves) | Behavior beats stated preferences; no onboarding needed | Learn from chat silently (live learning), and treat "user accepted the plan" as a soft confirmation. Don't make people fill forms |
| **"Not interested" / "Suggest less" / "Because you watched…"** | Cheap negative feedback plus explanations build trust | ✕ Not anymore and the ⓘ "why" are this; add "why" on every recommendation, not only in Memory |
| **Profiles** (streaming apps' household profiles) | One account, many people | Household and shared cards; per-person scopes |
| **Year-in-review rituals** (music "Wrapped") | People enjoy reviewing their own data if it's delightful | A monthly 30-second **Memory Wrapped**: "Here's what I learned about you this month, swipe to keep." Opt-in, shareable, viral |
| **Editable interest centers** (ad and feed "your interests" pages) | Users want to see and edit inferences, but these pages are buried and ad-centric | Make the memory the *front door*, not a settings page, and never ad-centric |
| **Feed resets** | Sometimes people want a fresh start | "Forget this topic" and "start fresh" per scope, with export first |
| **Cold start via import** | New users have no history | Import from other assistants or exports (we already import Muse exports), then one fast swipe session to confirm the top 10 cards |

**Where we beat them:** these systems infer *interests* to rank content. An agent *acts* (books, buys, messages), so a wrong inference costs real money and trust. That's why **confirmation at the moment of action** (not at sign-up) is the right primitive for agents. Lead the pitch with that.

## 4. Product improvements that would make it shine
1. **Time-aware cards** (permanent / seasonal / situational) with auto-expiry. Biggest accuracy win for the least friction.
2. **Household and shared memory.** Partner, kids, parents: who a plan affects is the most common miss in our eval.
3. **Memory Wrapped** monthly ritual (also the Most Viral angle).
4. **Multimodal capture:** a photo of a receipt, ticket or menu becomes a card (Muse Image). It fixes our known gap: one-off purchases don't become cards.
5. **Agent-to-agent sharing scopes**, with an audit log.
6. **On-device sensitive vault.**
7. **Developer SDK:** `remember()`, `recall(request)`, `confirm(card)`, plus the eval harness, with drop-in UI components (quick-check card, Memory deck). This is what turns it into something *any* agent company could adopt.
8. **North-star metric:** "answers that needed no correction", alongside cost per answer and questions per 100 answers.

## 5. Business case (any personal-agent company)
- **Cost:** memory tokens per message drop roughly 3× vs a summary and 100×+ vs history replay. At assistant scale, that's a direct infrastructure line item (model it: users × messages/day × tokens saved × price).
- **Retention:** people stay where they're remembered *correctly*. Stale memory is a silent churn driver ("it keeps suggesting Airbnbs").
- **Trust and regulation:** visible, editable, exportable memory is ahead of where privacy regulation is heading (access, correction, portability).
- **Platform:** permissioned sharing makes the memory layer a hub other agents plug into.

## 6. Portfolio framing (LinkedIn)
- **Title:** "Déjà Vu: confirmed memory for personal AI agents (Meta Global AI Hackathon)".
- **Story in three lines:** every agent guesses, none asks; I built a context layer that asks once at the right moment; on 4 people (2 real histories) it was more accurate than a memory summary while reading 3× fewer tokens.
- **Artifacts:** 60-second product video, the deck, the repo with `docs/eval.md`, and a short write-up of the **decisions you rejected** (popups, feedback buttons, typing to edit). Product judgment shows in what you cut.
- **Show the honest caveat** (a summary wins on static lives). Hiring managers trust candidates who report where their idea loses.
- **Roles it maps to:** AI product manager, applied AI engineer, memory/personalization teams at assistant, music, video and commerce companies.
