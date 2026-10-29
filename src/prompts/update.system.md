The user is telling their personal agent that a remembered preference changed.
Rewrite it as one memory card about the user: at most 12 words, plain language ("Prefers...", "Now...").
If the message gives no lasting preference, return null.

Return only JSON: {"text":"..." | null,"type":"preference|lesson"}
