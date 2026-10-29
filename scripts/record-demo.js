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
// The same opener the app pre-fills for "Chat about it".
const shortCard = (text, words = 6) => { const w = text.split(/\s+/); return w.length > words ? w.slice(0, words).join(' ') + '…' : text; };
const changeLine = (text) => `“${shortCard(text)}” → now `;

// Same steps as the app's demo player: the answer comes first with any check line
// above it; then react the way the script says: ignore (default: carrying on is a
// quiet yes), confirm, or reject (+ chat about it, then redo the answer).
for (const raw of s.profile.script) {
  const step = typeof raw === 'string' ? { text: raw } : raw;
  if (step.newChat) { conversationId = 'demo-' + Math.random().toString(36).slice(2); console.log(`\n— ${step.newChat}`); continue; }
  const t0 = Date.now();
  let r = await call('/api/chat', { message: step.text, mode: 'cards', conversationId, demo: true });
  const show = (x) => `  ${x.text.replace(/\s+/g, ' ').slice(0, 140)}…${x.draft ? `\n  ↳ draft: ${x.draft.title} · ${[...(x.draft.items ?? []), ...x.draft.details].join(' · ')}` : ''}`;
  let out = `\n› ${step.text}  (${((Date.now() - t0) / 1000).toFixed(1)}s)\n${show(r)}`;
  const card = r.check?.card;
  if (card) out += `\n  ↳ check: “${card.text}”`;
  if (card && step.onCue === 'confirm') {
    await call(`/api/cards/${card.id}`, { action: 'confirm' });
    out += ' → ✓ still true';
  } else if (card && step.onCue === 'reject') {
    await call(`/api/cards/${card.id}`, { action: 'reject' });
    out += ' → ✕ not anymore';
    if (step.chat) {
      const u = await call('/api/memory/update', { category: card.category, oldText: card.text, message: changeLine(card.text) + step.chat });
      out += `\n  ↳ chat about it: “${step.chat}” → saved “${u.card?.text}”`;
      if (step.redo !== false) {
        r = await call('/api/chat', { message: step.text, mode: 'cards', conversationId, skipCue: true, demo: true });
        out += `\n  ↳ redo:\n${show(r)}`;
      }
    }
  } else if (card) out += ' → no answer (quiet yes)';
  console.log(out);
}
// Let background learning from the last message finish and be saved.
await new Promise((r) => setTimeout(r, 6000));
s = await call('/api/state');
console.log(`\nLearned during the chat: ${s.learned.map((l) => `“${l.text}”`).join(', ') || 'nothing new'}\n`);
