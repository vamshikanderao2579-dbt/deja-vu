// Checks the API keys in .env before a demo:  npm run check-api
// Lists the models each provider offers and makes one tiny call per role.

import { config } from '../src/config.js';
import { complete } from '../src/llm.js';

if (config.mock) {
  console.log('\n  No MAIN_API_KEY in .env, so the app runs in mock mode.');
  console.log('  Copy .env.example to .env and add your Meta Model API key.\n');
  process.exit(1);
}

let ok = true;
const roles = config.providers.bg === config.providers.main ? ['main'] : ['main', 'bg'];

for (const role of roles) {
  const p = config.providers[role];
  const label = role === 'main' ? 'Answers (main)' : 'Memory upkeep (bg)';
  console.log(`\n${label}: ${p.baseUrl}  model=${p.model}`);

  try {
    const res = await fetch(`${p.baseUrl.replace(/\/$/, '')}/models`, { headers: { Authorization: `Bearer ${p.apiKey}` } });
    if (res.ok) {
      const ids = ((await res.json()).data ?? []).map((m) => m.id);
      console.log(`  models: ${ids.slice(0, 12).join(', ') || '(none listed)'}${ids.length > 12 ? ', …' : ''}`);
      if (ids.length && !ids.includes(p.model)) console.log(`  ⚠ "${p.model}" is not in that list. Set the right ID in .env.`);
    } else {
      console.log(`  (model list not available: HTTP ${res.status})`);
    }
  } catch (err) {
    console.log(`  (model list not available: ${err.message})`);
  }

  try {
    const t0 = Date.now();
    const r = await complete(role, [{ role: 'user', content: 'Reply with the single word: ready' }], { maxTokens: 300, temperature: 0, reasoning: 'minimal' });
    console.log(`  ✓ call worked in ${Date.now() - t0} ms: "${r.text.trim()}"`);
  } catch (err) {
    ok = false;
    console.log(`  ✗ ${err.message}`);
  }
}

console.log(ok ? '\nAll set. Run npm run dev, then npm run eval.\n' : '\nFix the errors above, then run this again.\n');
process.exit(ok ? 0 : 1);
