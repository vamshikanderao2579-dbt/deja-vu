# Brief: 10 synthetic personas, written after the engine was built, for the Déjà Vu eval

Hand this whole file to Claude. It generates **chat histories and answer keys only**. It does not run anything or invent any scores: scores come from running the real pipeline afterwards (`node eval/run.js`).

Everything here is **SYNTHETIC TEST DATA**, written after the engine was built, and not used in the demo.

## What to produce, per persona

Two JSON files, in the exact shape of the existing Maria files (`data/personas/maria-history.json`, `data/personas/maria-answer-key.json`):

1. `data/personas/<id>-history.json`
2. `data/personas/<id>-answer-key.json`

`<id>` is the first name in lower case (`daniel`, `sofia`, …). The eval finds them automatically.

### History file

```json
{
  "_label": "SYNTHETIC TEST DATA, written after the engine was built. Persona Daniel.",
  "user": { "name": "Daniel" },
  "conversations": [
    { "id": "d01", "date": "2026-10-20", "time": "07:40", "title": "Coffee order",
      "messages": [
        { "id": "d001", "role": "user", "text": "black coffee, no sugar, as always" },
        { "id": "d002", "role": "assistant", "text": "Got it: black coffee, no sugar." }
      ] }
  ]
}
```

- 10 to 14 conversations dated **2026-10-20 to 2026-11-01**, about **22 to 25 user messages** in all, plus short assistant replies.
- Message ids are unique within the persona and use its own letter prefix (`d001`, `s001`, …).
- Write like a real person typing to an assistant: lower case, short, sometimes off topic. Each fact comes up inside a real request ("find me a flight…"), not as a list of facts.
- **Stable facts:** each one 2 to 3 times, in different chats.
- **The in-chat change:** first the old preference (once or twice), then later the new one, with a reason and an explicit "don't do the old one anymore".
- **The short-term fact:** stated twice, with its end date.
- **The sensitive fact:** exactly once.
- **The one-off:** exactly once, clearly a one-time thing.
- **The two outside-chat changes do NOT appear in the history at all.** They live only in the answer key (`current_truth`). They are what only a confirmation can catch, and they are the eval's most important number.

### Answer-key file

```json
{
  "_label": "SYNTHETIC TEST DATA, written after the engine was built. Ground truth for persona Daniel.",
  "today": "2026-11-02",
  "facts": [
    { "id": "D01", "category": "food", "text": "Drinks black coffee, no sugar", "sources": ["d001", "d031"] },
    { "id": "D05", "category": "fitness", "text": "Gym in the evenings", "sources": ["d011"], "superseded_by": "D06" },
    { "id": "D06", "category": "fitness", "text": "Gym at 6am now; meetings moved to evenings", "sources": ["d027"] }
  ],
  "_current_truth": "What Daniel answers when shown each card. These changes never came up in chat.",
  "current_truth": {
    "D02": { "action": "edit", "text": "In the office Tue and Thu now; other days remote" },
    "D03": { "action": "confirm" }
  },
  "questions": [
    { "id": "DQ01", "text": "Book me a flight to Chicago for next Thursday",
      "checks": [
        { "text": "Suggests a direct flight", "kw": ["direct", "nonstop"], "want": true, "fact": "D04" },
        { "text": "Suggests a flight with a layover", "kw": ["layover", "connecting", "1 stop"], "want": false, "fact": "D04" }
      ] }
  ]
}
```

- **facts:** every fact in the history, with the user message ids it came from (`sources`). The old side of the in-chat change has `superseded_by` pointing to the new fact.
- **current_truth:** the 2 outside-chat changes as `{"action": "edit", "text": "<what is true now>"}` on the fact they change, and `{"action": "confirm"}` for 3 to 4 stable facts that are still true.
- **questions: exactly 10**, each an everyday request (not a quiz), each with 1 to 3 checks:
  - 4 stable (the answer should use a stable fact)
  - 2 outside-chat changes (only right if the answer follows `current_truth`, e.g. "Suggests Tuesday or Thursday at the office")
  - 1 in-chat change (uses the new preference, with a `"want": false` check for the old one)
  - 1 short-term, inside its window
  - 1 sensitive: a request where the sensitive fact matters, and the check is `"want": true` that the answer takes it into account (e.g. a workout plan that's easy on the back injury, a week of meals that works with the heart medication). Déjà Vu uses every card, private ones included: memory never blocks what an agent would use anyway.
  - 1 one-off: a check that the answer does **not** treat the one-off as a preference (`"want": false`)
- **checks:** short, observable statements ("Suggests a direct flight"). `kw` = 2 to 4 lower-case words or phrases that would appear in an answer that does it (used only for a free offline format check). `fact` = the fact id it tests.

## The 10 personas

Each line: stable facts · in-chat change · short-term · sensitive · one-off · **two outside-chat changes**.

1. **Daniel**, 29, Atlanta. Remote software engineer, lives alone, runs mornings. Stable: black coffee no sugar; direct flights, hates layovers; jollof rice on Sundays. In-chat change: gym evenings → 6am, because meetings moved to evenings. Short-term: no alcohol until his 10K on Dec 6. Sensitive: takes anxiety medication nightly. One-off: tried rock climbing once. Outside chat: now in the office Tue and Thu; swims instead of running since a new pool opened nearby.
2. **Sofia**, 41, Miami. School counselor, single mom, kids 8 and 11. Stable: Saturday farmers market; kids want pasta on Fridays; morning appointments. In-chat change: kids' soccer Tue → Thu evenings, so Thursday dinner must be quick. Short-term: dairy-free trial until Nov 22. Sensitive: custody paperwork in progress. One-off: bought concert tickets once. Outside chat: her 11-year-old went vegetarian; the farmers market moved to Sundays.
3. **James**, 67, Portland. Retired teacher, widower, volunteers at the library. Stable: morning walk; tea over coffee; mystery novels. In-chat change: book club Fri → Sat, because his library shift changed. Short-term: hosting grandkids Dec 18–24, needs kid-friendly meals that week. Sensitive: daily heart medication. One-off: did an escape room once. Outside chat: stopped driving and takes the bus; switched to audiobooks for his eyes.
4. **Aisha**, 26, Seattle. Public health grad student, 2 roommates, bikes to campus. Stable: lentil soup meal prep Sundays; bus over driving; studies late at the library. In-chat change: studying evenings → mornings, because her lab schedule changed. Short-term: no caffeine after 2pm until finals end Dec 12. Sensitive: visa renewal pending. One-off: went to a wedding out of state once. Outside chat: moved into her own studio, no roommates; now cooks for one.
5. **Luis**, 36, Denver. Firefighter on 24-on/48-off shifts, married, has a dog. Stable: chicken and rice meal prep; direct flights; weekend hikes. In-chat change: day off Mon → Wed, so Wednesday is hike day. Short-term: no fried food until his fitness test Nov 30. Sensitive: back injury, in physical therapy. One-off: went fishing once. Outside chat: switched to day shifts 7am–7pm; now takes one-stop flights when they're much cheaper.
6. **Grace**, 52, Boston. Bakery owner, married, kids grown. Stable: up at 4:30am; tea; bakes sourdough; evening dog walk. In-chat change: Friday takeout → cooking at home Fridays, for budget. Short-term: no weekends off until the holiday market ends Dec 20. Sensitive: business loan payments, tight cash flow. One-off: took a pottery class once. Outside chat: hired a manager, so Sundays are off now; switched from tea to coffee.
7. **Ethan**, 22, Nashville. College senior, part-time barista, shared house. Stable: cold brew; lo-fi music to study; cheap eats; bikes everywhere. In-chat change: café shifts nights → mornings, so mornings are busy. Short-term: no takeout spending until the semester ends Dec 10. Sensitive: worried about student loan debt. One-off: went to a music festival once. Outside chat: got a remote internship, so weekdays 9–5 are taken; sold his bike, uses an e-scooter.
8. **Fatima**, 33, Minneapolis. Pediatric physical therapist, married, toddler aged 2. Stable: home-cooked meals; toddler bedtime 7:30pm sharp; weekend park; trains over flights for short trips. In-chat change: daycare pickup 4pm → 5pm at a new location, so evenings shift later. Short-term: family visiting Dec 5–8, needs the spare room set up. Sensitive: postpartum health follow-up. One-off: tried a new restaurant once for an anniversary. Outside chat: toddler bedtime is now 8pm; they drive short trips now (car seat), not the train.
9. **Tom**, 45, Columbus. Long-haul truck driver, divorced, kids 10 and 13 on weekends. Stable: audiobooks on drives; calls the kids Sunday evenings; direct routes, avoids tolls; weekend pickup Fri 6pm. In-chat change: home day Tue → Wed, so Wednesday is homework-help day. Short-term: no late-night snacks while driving until Nov 28. Sensitive: child support payment schedule. One-off: went to a car show once. Outside chat: has the kids every other weekend now, not every weekend; switched from audiobooks to podcasts.
10. **Rosa**, 58, Santa Fe. Retired nurse, lives with her partner, gardens, volunteers at a food bank. Stable: garden in the morning; herbal tea; beans and rice; walks 3 miles a day. In-chat change: volunteer shift Mon → Wed mornings. Short-term: hosting family for Thanksgiving Nov 26, needs a big meal plan that week. Sensitive: arthritis in her hands, uses grip aids. One-off: took a train trip to Chicago once. Outside chat: her partner went vegetarian; she does tai chi on Tuesday mornings now.

## Rules for Claude

- Don't reuse wording or situations from Alex or Maria; each life should read differently.
- Don't write questions you expect Déjà Vu to ace: include the stale, sensitive and one-off traps exactly as listed.
- Use only fictional people and places. No real names, emails, phone numbers or addresses.
- Don't produce or estimate any scores.

## After the files exist (back in the repo)

```bash
# Free format check, no model calls: keyword judge only
MAIN_API_KEY= node eval/run.js --persona daniel

# Real run, once per persona (about $0.40–0.60 each), then the summary
node eval/run.js --persona daniel
node eval/summarize.js
```

The summary reports these personas as **"synthetic, written after the engine was built"**, pooled separately from the headline numbers, and each person's row is shown, including where Déjà Vu loses.
