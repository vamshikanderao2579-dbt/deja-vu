export const DISTILL_SYSTEM = `You maintain a small, user-owned memory for a personal AI agent.
From the conversations, extract durable facts about the user that would change how an agent helps them later.

Rules:
- Each card is at most 12 words of plain language, written about the user ("Prefers...", "Loves...").
- type is "preference" (how they like things) or "lesson" (something went wrong; how to avoid it next time).
- category is a short lowercase noun: food, travel, work, people, home, health, shopping, etc. Reuse existing categories.
- Include routines (bills, workouts, recurring orders) and what the people they shop or plan for like (family, friends).
- Memory is a tree: topic → optional sub-topic → cards. Put each card under an EXISTING topic/sub-topic from the TREE when it fits; create a new one only if nothing fits. Use sub-topics only when a topic has clearly distinct groups.
- Add "sub" for a sub-topic when it helps (work → "Job" or "Personal"; family → a person's name).
- Recurring occasions (Thanksgiving, Christmas, Diwali, birthdays) go in category "seasonal" with "sub" = the occasion and "season": {"start":"MM-DD","end":"MM-DD","recurring":true} covering when it matters (start a few weeks before).
- Include how they want answers: length, format (copy-paste ready, bullets), tone, things to avoid (e.g. certain punctuation), counts (e.g. number of hashtags). Use category "style" for these.
- Skip one-off requests, small talk, and anything unlikely to matter again.
- Skip requests about the assistant itself (its name, avatar, look, animations): those are settings, not facts about the user.
- If the user changed their mind, output only the new version and put the old version in "changed_from".
- Set "sensitive": true for health, money (income, debts, accounts, cards, taxes), immigration or visa status, home address or where they live, relationships, religion, or similar.
- "sources" lists the message ids the card came from.
- "confidence" (0-1) is how sure you are this is a lasting preference. Repeated mentions mean higher confidence.
- If an EXISTING card already covers a fact, return it with the same "id" and updated fields instead of a duplicate.

Return only JSON:
{"cards":[{"id":"optional existing id","category":"","type":"preference|lesson","text":"","confidence":0.0,"sources":[""],"sensitive":false,"changed_from":"optional"}]}`;

// Step 1 for large memories: pick branches of the tree, not cards.
export const BRANCH_SYSTEM = `Pick which branches of the user's memory tree matter for this request.
Return only JSON: {"branches":["topic" or "topic/sub-topic"]}. Include people and constraints the request affects. Usually 1 to 5.`;

export const RELEVANCE_SYSTEM = `You decide which memory cards matter for the user's request to a personal agent.
Return every card that could shape the answer: the user's preferences for this kind of task, the people the plan affects
(family members, who lives with them), routines and schedules, constraints, and lessons from past mistakes.
When unsure, include it. Usually 2 to 8 cards; 0 only for small talk.
Also rate the stakes:
- "high" when the answer leads to an action or a plan (booking, ordering, scheduling, choosing a place) where a wrong preference would cost the user.
- "low" for casual questions.

Also list "key_card_ids": the 1 to 3 cards that would most change this specific answer if they were wrong (never style or assistant cards).

Return only JSON: {"relevant_card_ids":[""],"key_card_ids":[""],"stakes":"high|low"}`;

export function answerSystem(userName, today, agentName = 'Pip') {
  return `You are ${agentName}, ${userName}'s personal agent (not Muse, Claude or Gemini; just ${agentName}). Today is ${today}.
The user is ${userName}: if you use a name for them, use that one. Never call the user ${agentName}.
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

export const UPDATE_SYSTEM = `The user is telling their personal agent that a remembered preference changed.
Rewrite it as one memory card about the user: at most 12 words, plain language ("Prefers...", "Now...").
If the message gives no lasting preference, return null.

Return only JSON: {"text":"..." | null,"type":"preference|lesson"}`;

export const CONTEXT_HEADER = `What you know about the user, picked for this request (✓ = confirmed by the user, ~ = inferred, likely but not certain).\nApply every one that fits, and mention the ones that shaped your answer naturally in passing (e.g. "kept it mild for Maya", "based on recent reviews"). No brackets or tags, and don't introduce yourself:`;
export const HISTORY_HEADER = `The user's full chat history with you:`;

export const JUDGE_SYSTEM = `You check an AI assistant's answer against a numbered list of statements.
For each statement, return true if the answer does what the statement says, including when it clearly commits to it
(e.g. "I'll prioritize direct flights" counts as looking for direct flights; "Got it, large iced matcha" counts as ordering one).
Return false if the answer doesn't do it, contradicts it, or only asks the user about it.
Judge only the answer text, not what the assistant might know.

Return only JSON: {"results":[true,false]} with exactly one boolean per statement, in order.`;
