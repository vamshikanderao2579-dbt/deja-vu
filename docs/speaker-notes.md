# Déjà Vu: speaker notes (3-minute video)

**Budget:** about 95 seconds of you talking, plus the 84-second Alex tour, which narrates itself. Total about 2:59.
**[tap]** is a click or →. **(beat)** is a one-second silence: don't fill it.
Say the numbers only as written here; they match the final eval and the slides.

---

## 1. Cover · ~12 s

Hi, I'm Vamshi. *(beat)*
**[tap]** Déjà Vu isn't a chatbot. It's a memory layer any personal agent can add:
**[tap]** Muse, ChatGPT, Claude, or your own.
**[tap]** It learns from your chats, checks with you when it matters, and shows its receipts.

## 2. The problem · ~18 s

Your agent remembers you. *(beat)* It never checks if it's still true.
**[tap]** You can't see what it guessed.
**[tap]** A guess from two years ago still books your hotel. *(beat)*
**[tap]** And every message, it re-reads a summary of everything you've told it. It forgets things, or it costs too much.
**[tap]** *(Say nothing. Let the line on the slide land.)*

## 3. The idea · ~18 s

Today's agents run on what they inferred.
**[tap]** Déjà Vu runs on what you confirmed. *(beat)*
**[tap]** It still uses every card, guesses included.
**[tap]** It asks once, in one line, only when a guess is about to book, buy or plan something.
**[tap]** *(Say nothing. The demo shows the receipts.)*
**[tap]** And no setup: drop in a ChatGPT, Claude or Muse export.

## 4. The demo · ~5 s, then the 84-second tour

**[tap]** **[tap]** Watch for the one tap. *(beat)* That tap is the whole product.
→ Click the link, pick **With voice**, and stay silent. The tour narrates itself.
→ When the end card appears, click **Back to the slides**. It opens on slide 5.

## 5. Proof · ~16 s

Fourteen people, 312 checks.
**[tap]** Déjà Vu got 80 percent right, against 72 for a summary.
**[tap]** When a preference changed and was never mentioned in chat: 81 percent. *(beat)* The others, about half.
**[tap]** And 94 percent fewer tokens than re-reading the history.

## 6. The takeaway · ~12 s

**[tap]** Agents are great at guessing who you are. They should keep guessing.
**[tap]** But confirmed memory is always better than inferred memory. *(beat)*
**[tap]** It's live and open source. Try it with your own export.

## 7. End · ~10 s

*(Let the clock spin and stop. One beat of silence.)*
So ask yourself: what would your agent have booked, if you'd never been asked? *(beat)*
Déjà Vu makes sure it's still you. *(beat)* Thank you.
*(Hold the slide for 3 seconds before you stop recording.)*

---

### If you run over, cut in this order

1. Slide 5: "Fourteen people, 312 checks." (it's on the slide) · −2 s
2. Slide 1: the last line · −4 s
3. Slide 2: the summary line · −5 s
4. The tour: tap ✕ yourself the moment it's highlighted · −1 to 2 s

---

## Live talk only (no time limit)

Add these when you're presenting live, after the matching slide.

- **After slide 1:** "Any agent can use it over HTTP: recall before answering, remember after, confirm when you answer a check. No new chat app to learn."
- **After slide 3:** "It doesn't ask every time. A check needs a key card that's a guess, changed or a year old, high stakes, and no check already asked in that chat. Small talk gets no cards at all. That's code, not a prompt."
- **After the tour:** "That was a replay, so it's instant. A real import runs a staged build: Muse Spark writes the cards and reviews its own work, Muse Wonder grades each one against the chat it came from, and a final check reruns any malformed build. Memory stays bounded: at most 10 topics, 8 cards each, 14 words a card."
- **After slide 5, the honest part:** "Two real chat histories, kept private, and twelve synthetic people. Ten of them were written after the engine was built, so they're not a clean held-out set. Déjà Vu is best or tied for 12 of 14. On one person the builder missed facts about someone she plans for, like her mother's favourite dessert. And it's a few seconds slower per answer, because it picks the cards first."
- **After slide 6:** "Personalisation only feels creepy when it's unexpected. Once personal agents are normal, people won't ask whether an app knows them; they'll complain when it doesn't. Déjà Vu is how it knows you while you stay in control."

## Q&A: have these ready, don't volunteer them

- **How it works:** Muse Spark writes the cards, Muse Wonder grades every one before it's kept, cards are short and bounded, and it asks at most once per chat.
- **Why can't anyone build this?** Anyone can. The point isn't a moat. It's the product idea: inference plus confirmation, for everyone, with a tap instead of a settings page.
- **Cost at scale:** bounded cards are the cost control. About 380 tokens in per answer instead of thousands is what makes a free personal agent workable.
- **Privacy:** cards stay with your profile and are shown in Memory. A private guess about health or money is never treated as fact and never drives a booking or a purchase. Secrets are stripped from the history it learns from and never stored in a card.
- **Why is it slower?** It picks the cards first: a few seconds, in exchange for not re-reading everything and not acting on an unconfirmed guess.
