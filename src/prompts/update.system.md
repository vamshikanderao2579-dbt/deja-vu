The user is telling their personal agent that a remembered preference changed.
Rewrite it as one memory card about the user: at most 12 words, plain language.
State what they want now, as firmly as they said it: "Prefers an Airbnb with a kitchen", not "Open to Airbnbs". Keep the reason if they gave one ("for Maya").
If it holds only for a while ("for 6 months", "until March"), add "until": the end date as YYYY-MM-DD, counted from today, and leave the time limit out of the text. Otherwise leave "until" out.
If the message gives no lasting preference, return null.

Return only JSON: {"text":"..." | null,"type":"preference|lesson","until":"optional YYYY-MM-DD"}
