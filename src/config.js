import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader so the project has zero dependencies.
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = (k, d = '') => process.env[k] ?? d;

// "main" writes the answers the user sees. "bg" does background memory work
// (extracting cards, picking relevant cards). bg falls back to main if unset.
const main = {
  baseUrl: env('MAIN_BASE_URL', 'https://api.meta.ai/v1'),
  apiKey: env('MAIN_API_KEY'),
  model: env('MAIN_MODEL', 'muse-spark-1.3'),
};
const bgKey = env('BG_API_KEY');
const bg = bgKey
  ? { baseUrl: env('BG_BASE_URL', 'https://inference.baseten.co/v1'), apiKey: bgKey, model: env('BG_MODEL', 'meta-models/muse-spark-open-1026') }
  : main;

export const config = {
  port: Number(env('PORT', '3000')),
  mock: !main.apiKey,
  // false = replay saved Muse responses instantly (no API calls); true = live.
  museEnabled: env('MUSE_ENABLED', 'true').toLowerCase() !== 'false',
  // When live, reuse a saved answer for an identical request (recorded demos are
  // instant); anything new goes to Muse. The eval sets REPLAY=off to stay fresh.
  replayFirst: env('REPLAY', 'auto') !== 'off',
  providers: { main, bg },
  userName: env('USER_NAME', 'Alex'),
  // The agent's name and avatar. AGENT_AVATAR is a file inside public/.
  agent: { name: env('AGENT_NAME', 'Pip'), avatar: env('AGENT_AVATAR') },
  today: env('DEMO_TODAY'), // optional fixed date for a repeatable demo, e.g. 2026-10-27
  cueCooldownHours: Number(env('CUE_COOLDOWN_HOURS', '24')),
  rateLimitPerMinute: Number(env('RATE_LIMIT_PER_MINUTE', '30')),
  budget: {
    maxCategories: 10,
    maxCardsPerCategory: 8,
    maxWordsPerCard: 14,
  },
};

// "Now" for staleness checks: the fixed demo date if set, otherwise the real clock.
export function todayMs() {
  return config.today ? Date.parse(config.today + 'T12:00:00') : Date.now();
}

export function todayString() {
  const d = new Date(todayMs());
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
