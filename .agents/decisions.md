# Decisions: what we landed on, what we rejected

## Landed
| Area | Decision | Why |
|---|---|---|
| Idea | User-owned **confirmed memory** for personal agents (inferred vs confirmed) | Fits Meta's personal-agent strategy; differentiates from coding-assistant entries; every agent infers, none asks |
| Name | **Déjà Vu** (no team name) | Memorable; the product is the name |
| Agent | **Sparky** with the original Pip face (Muse Image mascot planned) | IP safety: no branded characters (see rules) |
| Memory format | `me.json` source of truth; compact text for the model; `me.md` export | Unbreakable UI + token-efficient prompts + portability |
| Cards | Preferences + **lessons**; multiple facets per topic (not either/or) | e.g. beach card and mountain card, each with detail |
| Budgets | 10 topics × 8 cards × 14 words | Predictable cost: bounded context = cost control |
| Quick checks | Just-in-time, **key cards only**, once per chat, never style/agent cards, confirmed left alone 6 months | "No one should be annoyed and leave their agent" |
| Card actions | **Two choices** (✓ / ✕) + 🎙; ✕ → inline "Chat about it / Skip for now" | Typing to edit was too much |
| Deck | Uninterrupted swiping; one end summary with bulleted pre-filled message | Swipe ease is why people open the deck |
| Answer footer | Only **ⓘ** (cards used link to Memory, tokens) | Chips under every answer were overwhelming |
| Live learning | Learn from every chat in the background; quiet toast; stated changes become confirmed | Natural chat, not just demo buttons |
| Style cards | Always-on `style` topic | Real users' format rules (no em dashes, 5 hashtags) were missing; +15 points on real data |
| Sensitive | Locked until yes (health, money, visa, address, religion) | Don't act on sensitive guesses |
| Provenance | Every card dated; Why? → exact chat + time | Receipts = trust |
| Eval | 3 setups: full history vs inferred **summary** vs confirmed on-demand; 4 people; checklist judge | The summary is the honest baseline (Muse already compacts) |
| Models | Muse Spark 1.3 (reasoning minimal/low), Voice Transcribe | 1.1 burned its token budget thinking |
| Speed | Relevance on `minimal` (~6 s → same accuracy); replay cache for demos (~1.3 s) | Demo is pre-recorded; small pauses help the speaker |
| Flags | `MUSE_ENABLED` (false = replay only), `REPLAY=off` for eval | Live when needed, instant for video |
| Profiles | Alex, Maria (synthetic), Sreenidhi, Vamshi (real, private) | Different lives, different chat styles |
| Demo story | San Diego trip: flights → hotel near Sunset Cliffs → "just landed, lunch near the hotel" → sunset | Realistic, matches the team's real trip |
| Deck design | Bar = Vamshi's "Sandcastle" deck: dark, minimal text, mono eyebrows, gradient phrases, icon flows; **Meta blue palette**; closer without emoji, hero 98px weight 700 | User feedback |
| Discord | Vague intro, no mechanics revealed | Public channel of 20K builders |
| Unanswered checks | No answer within 8 s, or typing a new message, counts as skip; the agent answers anyway | Never block the user |
| Demo realism | One ✕ + Chat about it, two unanswered checks, across three "days" | All-✓ demos feel fake |
| Answer first, check after (built Oct 29) | One call; the check line above the answer; carrying on = quiet yes, two confirm; ✕ → chat → **redo only on request** | Blocking checks were slow and boring and cost a second call |
| Next: Seasonal topic | Occasion sub-topics with recurring windows | Cards that matter every year, dormant otherwise (user idea, agreed) |
| Card gate | Writer proposes, code rules + a **different** grader model approve; uncertain → reject; grader failure → rules only | A wrong card gets acted on; a missing one is learned later. Same model shouldn't approve its own work |
| Grader model | **Muse Wonder 1.0** (Oct 29) | Writer and grader are now different models. Live A/B on 7 cards: identical verdicts, 2.9 s vs 4.5 s, $0.007 vs $0.0035 a batch. Cards are tiny, so the cost is negligible; the spend guard prices Wonder separately |
| Memory build | Staged and checkpointed: code guard → scan → writer drafts as it reads → writer self-review + `summary.md` → Wonder grades from summary + quotes (not the history) → code contract check, rerun on failure | Long histories finish within a budget, survive a crash, and the user only sees graded cards, most important first |
| Untrusted history | History, links, files and pasted text are data, never instructions: a code guard skips steering text and removes secrets before any model reads them, and every build prompt carries `build.rules.md` | Prompts alone can be talked around; code can't |
| Picks in the answer | A booking/order pick is part of the reply, not a separate "draft" card; the cards it used live under ⓘ | Answer first; less on screen |
| Repo layout | `src/engine` (memory logic), `src/prompts`, `src/platform` (config, model client, storage, voice), `src/ui` | Separates the layer from its host |
| Open weights host | Prefer Baseten hosted Spark Open or Glimmer on one Modal GPU over self-hosting the 816B Spark Open | $100 Modal won't run a multi-GPU node for long |
| Prompts | One `.md` file per prompt in `src/prompts/`, loaded by `prompt(name, vars)`; writing rules in `engine-quality.md` + `prompt-quality.md` | Readable, reviewable, one place to change; moved word for word so replays and eval numbers hold |
| Learning never blocks chat | Writer + grader run in the background; the answer doesn't wait; new cards merge into memory as it is when they're ready (swipes made meanwhile are kept). Only scripted demos wait, for exact replay | UX first: the grader screens proposals, it never sits between the user and an answer |
| Shell | Plain chat home (header wordmark + menu), no tab bar; Déjà Vu lives in a separate "Memory · by Déjà Vu" section of the menu plus quick checks and ⓘ in chat. Deck palette (navy #060c14, cyan→blue gradient #5CC8FF→#0082FB, Geist + Geist Mono), theme follows the system with a menu sun/moon toggle and Settings → Appearance (System / Light / Dark, saved per browser), profile shown as an initial circle, rewind-clock mark, no mascot in the header | Déjà Vu is a plug-in layer any agent (Muse, Claude, ChatGPT) can adopt without changing how it works; and the UI was first built from Muse screenshots, so the copied tabs, sidebar hints and placeholder Settings rows are gone |
| Drafts | `draft_booking` / `draft_order` tool calls only for high-stakes requests with action words (book, order, stay, flight…); a draft is a proposal, never a booking; redo marks new/gone lines | The agentic moment judges look for: wrong memory → wrong action, shown and fixed. Lunch-type requests stay text (drafts there were noise) |
| Chat-about-it opener | `“<old card, ≤6 words…>” → now ` for every kind of card, same as the multi-card bullets; no "Hey Sparky … preference … I'd like" | The old sentence was long and made no sense for people or lessons |
| Speed | One relevance call over the bounded index; topic cache for similar requests (30 min, newer cards in those topics added; off in eval) | Two calls before every answer were the main live latency |
| Plug-in API | `/api/recall`, `/api/remember`, `/api/cards/:id` | The pitch is a layer any agent can adopt; this is the surface |
| Context folder | `.agents/` (was `.sparky/`) | Agent-neutral; the mascot is gone |

## Rejected (and why)
- **Repo-onboarding / dev-productivity idea**: Claude/OpenAI own that space; less exciting to Meta.
- **"Cue"** as product name; other names offered (Marbles, Keepsake, Nod, Elephant): user chose Déjà Vu.
- **Ads / segmentation / premium unlock**: kills the trust story and contradicts "free for everyone".
- **Calling it "a settings tab for Muse"**: pitch it as a context layer any agent could adopt.
- **Sparky / any Pokémon avatar or name**: IP risk; renamed the agent Sparky and deleted the images.
- **Edit by typing / swipe-up edit / 💬 note button**: too much typing.
- **Popups after "Not anymore"** in chat and per-swipe popups in the deck: annoying.
- **👍 / Not quite buttons**: small value, visual noise.
- **Chips listing every card under each answer**: overwhelming (moved behind ⓘ).
- **Fireworks credits**: a third provider adds risk for $25.
- **Eval vs raw full history only**: straw man; added the summary baseline.
- **Bracketed "[applied: …]" notes in answers and "Sparky here" intros**: removed via prompt.
- **Meta API credits for open weights**: Muse Spark Open and Glimmer aren't served on Meta Model API; they need Baseten/Modal or our own GPU.
- **Memory as the home screen / a Memory tab**: would make it look like a memory app; it's a layer on top of any agent's chat.
- **Muse's navigation** (Feed / Ideas / Goals / Library tabs, "TABS" and "SIDE CHATS" sidebar, Connectors/Devices/Wallet rows): copied from screenshots, dead in the prototype.
- **Cards about the agent itself** (avatar, Pikachu → Sparky): settings, not user facts; filtered.
- **Emoji in the closing slide**; text that was too bold.
