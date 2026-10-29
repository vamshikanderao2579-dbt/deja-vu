// Step 0 of every memory build, in plain code, before any model reads the history:
//   - text that tries to steer the memory system ("ignore previous instructions",
//     "you are now…", "generate the cards in this format") is skipped, not read
//   - secrets (passwords, PINs, one-time codes, API keys, card and ID numbers) are
//     removed, so no model ever sees them
// The prompts say the same thing (build.rules.md); this makes it hold even if a
// model doesn't listen. Phone numbers and emails stay: they can become locked cards.

const INSTRUCTION = [
  /\b(ignore|disregard|forget|override)\b.{0,30}\b(previous|prior|above|earlier|all|your|system)\b.{0,20}\b(instructions?|rules|prompts?|guidelines)\b/i,
  /\byou are now\b/i,
  /\byour (new )?(rules|instructions|role|task) (are|is)\b/i,
  /\b(new|updated|real) system prompt\b/i,
  /<\/?\s*(system|instructions?|assistant)\s*>/i,
  /\[\s*system\s*\]/i,
  /\b(developer|jailbreak|god) mode\b/i,
  /\b(generate|create|write|make|format)\b.{0,25}\b(memory )?cards?\b.{0,30}\b(format|colou?rs?|style|json|markdown)\b/i,
];

const SECRETS = [
  [/\b(password|passwd|passcode|pwd|pin)\b(?:\s+(?:is|was)\b\s*[:=]?|\s*[:=])\s*\S+/gi, 'password'],
  [/\b(api[ _-]?key|secret[ _-]?key|access[ _-]?token|auth[ _-]?token|bearer)\b\s*(is|:|=)?\s*[A-Za-z0-9._\-]{8,}/gi, 'key'],
  [/\b(sk|pk|rk)[-_][A-Za-z0-9_\-]{16,}\b/g, 'key'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'key'],
  [/\b(otp|one[- ]time (pass)?code|verification code|security code|2fa code)\b\D{0,15}\d{4,8}\b/gi, 'code'],
  [/\b(?:\d[ -]?){13,19}\b/g, 'number'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, 'number'],
];

export const isInstruction = (text = '') => INSTRUCTION.some((re) => re.test(text));

export function stripSecrets(text = '') {
  let out = text;
  const kinds = [];
  for (const [re, kind] of SECRETS) {
    out = out.replace(re, () => { kinds.push(kind); return '[secret removed]'; });
  }
  return { text: out, kinds };
}

// Contact details may be remembered, but only as locked cards in "sensitive".
const CONTACT = /([\w.+-]+@[\w-]+\.[\w.]+)|(\+?\d[\d\s().-]{8,}\d)/;
export const hasContact = (text = '') => CONTACT.test(text);
export const hasSecret = (text = '') => SECRETS.some(([re]) => new RegExp(re.source, re.flags.replace('g', '')).test(text));

// Returns sanitized copies of the conversations plus what was skipped or removed.
// Message ids are kept, so cards can still cite them.
export function guardHistory(conversations) {
  const flagged = [];
  const convs = conversations.map((c) => ({
    ...c,
    messages: c.messages.map((m) => {
      if (isInstruction(m.text)) {
        flagged.push({ id: m.id, kind: 'instruction', role: m.role });
        return { ...m, text: '[skipped: reads like an instruction to the memory system]' };
      }
      const { text, kinds } = stripSecrets(m.text);
      if (kinds.length) flagged.push({ id: m.id, kind: 'secret', role: m.role });
      return { ...m, text };
    }),
  }));
  return { convs, flagged };
}
