// Records a profile's demo conversation against the running app (live Muse), so
// that MUSE_ENABLED=false can replay it instantly for a video.
//
//   npm run dev                                  # with MUSE_ENABLED=true
//   node scripts/record-demo.js maria            # alex | maria | sreenidhi | vamshi
//
// It does exactly what the app's "Play demo conversation" does, and answers any
// quick check the way the script says (✓ by default, ✕ + chat, or no answer).
// Builds the profile's memory first if it has none.

const PORT = process.env.PORT ?? 3000;
const BASE = `http://localhost:${PORT}`;
const id = process.argv[2] ?? 'alex';

const call = async (path, body) => {
  const res = await fetch(BASE + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json();
  if (!res.ok) throw new Error(`${path}: ${out.error}`);
  return out;
};

let s = await call('/api/profile', { id });
console.log(`\nProfile: ${s.profile.name}${s.museEnabled ? '' : '  (MUSE_ENABLED=false: nothing new gets recorded)'}`);
if (!s.cards.length) {
  console.log('Building memory from chats…');
  s = await call('/api/distill', {});
  console.log(`  ${s.cards.length} cards`);
}
await call('/api/demo/load', {});
let conversationId = 'demo-' + Date.now().toString(36);
const label = (c) => c[0].toUpperCase() + c.slice(1);

// Same steps as the app's demo player: text, a new chat ("next day"), and how to
// react to a quick check (confirm by default, reject + chat, or ignore = skip).
for (const raw of s.profile.script) {
  const step = typeof raw === 'string' ? { text: raw } : raw;
  if (step.newChat) { conversationId = 'demo-' + Math.random().toString(36).slice(2); console.log(`\n— ${step.newChat}`); continue; }
  const t0 = Date.now();
  let r = await call('/api/chat', { message: step.text, mode: 'cards', conversationId, demo: true });
  let note = '';
  if (r.type === 'cue') {
    const card = r.cue.card;
    if (step.onCue === 'reject') {
      await call(`/api/cards/${r.cue.cardId}`, { action: 'reject' });
      r = await call('/api/chat', { message: step.text, mode: 'cards', conversationId, skipCue: true, demo: true });
      note = `  ↳ quick check: “${card.text}” → ✕ not anymore`;
      if (step.chat) {
        const message = `Hey ${s.agent.name}, my ${label(card.category)} preference “${card.text}” has changed. Now I’d like ${step.chat}`;
        const u = await call('/api/memory/update', { category: card.category, oldText: card.text, message });
        note += `\n  ↳ chat about it: “${step.chat}” → saved “${u.card?.text}”`;
      }
    } else if (step.onCue === 'ignore') {
      r = await call('/api/chat', { message: step.text, mode: 'cards', conversationId, skipCue: true, demo: true });
      note = `  ↳ quick check: “${card.text}” → no answer (skipped)`;
    } else {
      await call(`/api/cards/${r.cue.cardId}`, { action: 'confirm' });
      r = await call('/api/chat', { message: step.text, mode: 'cards', conversationId, skipCue: true, demo: true });
      note = `  ↳ quick check: “${card.text}” → ✓ still true`;
    }
  }
  console.log(`\n› ${step.text}  (${((Date.now() - t0) / 1000).toFixed(1)}s)${note ? '\n' + note : ''}\n  ${r.text.replace(/\s+/g, ' ').slice(0, 140)}…`);
}
// Let background learning from the last message finish and be saved.
await new Promise((r) => setTimeout(r, 6000));
s = await call('/api/state');
console.log(`\nLearned during the chat: ${s.learned.map((l) => `“${l.text}”`).join(', ') || 'nothing new'}\n`);
