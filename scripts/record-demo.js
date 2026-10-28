// Records a profile's demo conversation against the running app (live Muse), so
// that MUSE_ENABLED=false can replay it instantly for a video.
//
//   npm run dev                                  # with MUSE_ENABLED=true
//   node scripts/record-demo.js maria            # alex | maria | sreenidhi | vamshi
//
// It does exactly what the app's "Play demo conversation" does, and answers any
// quick check with ✓ Still true. Replay the same way: answer cards ✓ Still true.
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
const conversationId = 'demo-' + Date.now().toString(36);

for (const message of s.profile.script) {
  const t0 = Date.now();
  let r = await call('/api/chat', { message, mode: 'cards', conversationId });
  let note = '';
  if (r.type === 'cue') {
    note = `  ↳ quick check: “${r.cue.card.text}” → ✓ still true`;
    await call(`/api/cards/${r.cue.cardId}`, { action: 'confirm' });
    r = await call('/api/chat', { message, mode: 'cards', conversationId, skipCue: true });
  }
  console.log(`\n› ${message}  (${((Date.now() - t0) / 1000).toFixed(1)}s)${note ? '\n' + note : ''}\n  ${r.text.replace(/\s+/g, ' ').slice(0, 140)}…`);
}
// Let background learning from the last message finish and be saved.
await new Promise((r) => setTimeout(r, 6000));
s = await call('/api/state');
console.log(`\nLearned during the chat: ${s.learned.map((l) => `“${l.text}”`).join(', ') || 'nothing new'}\n`);
