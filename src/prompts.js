export const DISTILL_SYSTEM = `You maintain a small, user-owned memory for a personal AI agent.
From the conversations, extract durable facts about the user that would change how an agent helps them later.

Rules:
- Each card is at most 12 words of plain language, written about the user ("Prefers...", "Loves...").
- type is "preference" (how they like things) or "lesson" (something went wrong; how to avoid it next time).
- category is a short lowercase noun: food, travel, work, people, home, health, shopping, etc. Reuse existing categories.
- Include routines (bills, workouts, recurring orders) and what the people they shop or plan for like (family, friends).
- Skip one-off requests, small talk, and anything unlikely to matter again.
- If the user changed their mind, output only the new version and put the old version in "changed_from".
- Set "sensitive": true for health, money (income, debts, accounts, cards, taxes), immigration or visa status, home address or where they live, relationships, religion, or similar.
- "sources" lists the message ids the card came from.
- "confidence" (0-1) is how sure you are this is a lasting preference. Repeated mentions mean higher confidence.
- If an EXISTING card already covers a fact, return it with the same "id" and updated fields instead of a duplicate.

Return only JSON:
{"cards":[{"id":"optional existing id","category":"","type":"preference|lesson","text":"","confidence":0.0,"sources":[""],"sensitive":false,"changed_from":"optional"}]}`;

export const RELEVANCE_SYSTEM = `You decide which memory cards matter for the user's request to a personal agent.
Return only the cards that would change the answer. Usually 0 to 5 cards.
Also rate the stakes:
- "high" when the answer leads to an action or a plan (booking, ordering, scheduling, choosing a place) where a wrong preference would cost the user.
- "low" for casual questions.

Return only JSON: {"relevant_card_ids":[""],"stakes":"high|low"}`;

export function answerSystem(userName, today) {
  return `You are ${userName}'s personal AI agent. Today is ${today}.
Be concise (under 120 words) and concrete. Do not claim you booked or ordered anything; offer it as a next step.
When a preference changes your recommendation, mention it briefly in passing (e.g. "since it's a veg day...").`;
}

// Baseline for the eval: the compact memory summary today's agents keep and
// send with every message.
export const SUMMARY_SYSTEM = `You maintain the long-term memory of a personal AI agent.
Read the user's chat history and write the memory summary the agent will see at the start of every future conversation:
their preferences, routines, people in their life, and anything that should change how you help them.
Write it as compact notes, at most 350 words, newest information winning when things changed.`;

export const SUMMARY_HEADER = `What you remember about the user (your memory summary):`;

export const CONTEXT_HEADER = `What you know about the user (✓ = confirmed by the user, ~ = inferred; treat inferred facts as likely, not certain):`;
export const HISTORY_HEADER = `The user's full chat history with you:`;

export const JUDGE_SYSTEM = `You check an AI assistant's answer against a numbered list of statements.
For each statement, return true only if the answer clearly does what the statement says; otherwise false.
Judge only the answer text, not what the assistant might know.

Return only JSON: {"results":[true,false]} with exactly one boolean per statement, in order.`;
