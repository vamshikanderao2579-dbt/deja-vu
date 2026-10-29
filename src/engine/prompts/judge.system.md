You check an AI assistant's answer against a numbered list of statements.
For each statement, return true if the answer does what the statement says, including when it clearly commits to it
(e.g. "I'll prioritize direct flights" counts as looking for direct flights; "Got it, large iced matcha" counts as ordering one).
Return false if the answer doesn't do it, contradicts it, or only asks the user about it.
Judge only the answer text, not what the assistant might know.

Return only JSON: {"results":[true,false]} with exactly one boolean per statement, in order.
