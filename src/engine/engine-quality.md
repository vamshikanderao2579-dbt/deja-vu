# Engine quality: six writing principles

Everything the engine says, to a model or to a person, follows these six. That covers prompts (`prompts/`), card text, quick-check questions, UI copy, `.sparky/` notes and code comments. Prompt-specific rules build on them in [`prompts/prompt-quality.md`](prompts/prompt-quality.md); the same six applied to card text are in [Card wording](#card-wording-the-six-principles-applied-to-cards) below.

## 1. Build up in layers
Open with the job in one plain sentence, then add the detail. When a task has several stages, number them so each step can be read and checked by itself.

> The grader prompt opens with its job ("You review memory cards another model proposed… before they are saved"), then lists the three verdicts, then the reject reasons.

## 2. Say what to do
Phrase each instruction as the action to take. When a limit is needed, put it next to the action that replaces it, so the reader knows where to go instead.

> Instead of "Don't ask about style cards," write: "Pick key cards from preferences, people and plans; style cards apply quietly and are never asked about."
>
> Instead of "Don't say you booked the hotel," write: "Offer the booking as a next step."

## 3. Pick the exact word
Small wording changes change behavior. Use one term per idea and keep it everywhere: a **card** (never "fact", "note" or "memory item"), **confirmed / inferred / locked** for its status, a **quick check** for the in-chat question. Where the UI uses a friendlier word ("guessed" for inferred), map it once in the prompt rather than mixing both.

> "Key card" means the 1 to 3 cards that would most change this answer. Use it only in that sense.

## 4. Show one
Give a concrete example of the output you want: a real card, a real JSON shape, a real question. Every format rule and every common-mistake entry carries one.

> Card text: "Books direct flights when traveling with the kids" (a preference), "Summit had no stores; pack water and snacks" (a lesson).
>
> JSON: `{"verdicts":[{"i":0,"verdict":"reject","reason":"one_off"}]}`

## 5. Cut to the instruction
One clear sentence beats a cautious paragraph. Padding hides the rule and invites a loose reading.

> Instead of "It would probably be good to try to keep each card fairly short where possible," write: "Each card is at most 12 words."

## 6. Signpost
Use headings and leading labels so the reader can tell instructions from background at a glance. Start a line with the exact field, file or label it acts on.

> "`sensitive`: true for health, money, immigration or visa status, where they live, relationships or religion."
>
> In data framing, label each block in capitals: `EXISTING cards:`, `NEW conversation:`, `PROPOSED cards:`.

---

# Card wording: the six principles applied to cards

A card is read three ways: by the person in a quick check ("Still true?"), by the answer model, and by the person again in the Memory deck. Every card has to read the same way all three times.

**The ✓ / ✕ test.** Read the card as "Still true: *<card>*?". If ✕ could mean two different things, rewrite the card.

> "No non-veg on Tuesdays" fails: ✕ could mean "meat is back on Tuesdays" or "vegetarian every day now".
> "Vegetarian on Tuesdays" passes: ✕ has one meaning.

## 1. Fact first, condition after
Lead with what the person does or likes, then when or for whom. One card holds one fact; split a card that joins two.

> "Vegetarian on Tuesdays", not "On Tuesdays, for family reasons, avoids eating meat".
> "Books direct flights with the kids" and "Prefers aisle seats" as two cards, not "Books direct flights with kids and likes aisle seats".

## 2. Say what they do
Write the habit or preference itself. When the fact is a real limit (an allergy, something they avoid), name it plainly and add what they do instead. Keep the meaning exact: a rewrite that changes the fact is worse than a double negative.

> "Drinks tea; avoids coffee", not "Doesn't drink coffee anymore".
> "Allergic to peanuts" stays as it is: the limit is the fact.
> "Vegetarian on Tuesdays" keeps the day; "Vegetarian on Mondays" would be a different card.

## 3. The verb sets the strength
Match the verb to how firm the person was, and keep it. **Prefers** / **Likes** = a soft preference. **Always** / **Only** = a rule they stated. **Avoids** = steers clear. **Allergic to** = never, for safety. Don't turn a preference into a rule. Name people the same way on every card ("Sam", not "Sam" here and "partner" there).

> "Prefers hotels near the beach" (said once, loosely) vs "Only books refundable hotels" (stated as a rule).

## 4. Concrete details
Use the number, day, place or name from the chat, so the card can shape an answer. A lesson card carries its fix.

> "Hotels under $200 a night", not "Likes affordable hotels".
> "Summit had no stores; pack water and snacks", not "Hiking trip went badly".

## 5. Short and plain
At most 12 words. No hedges ("tends to", "sometimes seems to"); the card's status (inferred or confirmed) already says how sure we are.

> "Walks the dog at 7 am", not "Seems to usually tend to walk the dog fairly early in the morning".

## 6. Let the topic carry the context
The topic and sub-topic are the card's heading, so the text skips what they already say. When a card is about someone else, lead with their name.

> Under *Seasonal / Thanksgiving*: "Hosts 8 people; one vegetarian", not "For Thanksgiving every year, hosts 8 people".
> "Sam: eats chicken and fish now", not "Partner's diet changed to include chicken and fish".
