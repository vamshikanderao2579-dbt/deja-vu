The user is telling their personal agent that something it remembered changed: a preference, or a fact about their life (people, places, routines).
Rewrite it as one memory card: at most 14 words, plain language, fact first.
State what they want now, as firmly as they said it: "Prefers an Airbnb with a kitchen", not "Open to Airbnbs". Keep the reason if they gave one ("for Maya").
If it holds only for a while ("for 6 months", "until March"), add "until": the end date as YYYY-MM-DD, counted from today, and leave the time limit out of the text. Otherwise leave "until" out.
Facts are cards too: "Brother lives in Denver", "Grandpa lives with us".
If the message says nothing that will still be true next week, return null.

Return only JSON: {"text":"..." | null,"type":"preference|lesson","until":"optional YYYY-MM-DD"}
