import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { config, ROOT } from './config.js';

// ---------- spend guard ----------
// Every call adds its token cost to today's total in data/spend.json. Once the
// total reaches SPEND_CAP_USD, further calls are refused before they are sent.
const SPEND_PATH = process.env.SPEND_FILE ?? join(ROOT, 'data', 'spend.json');
const PRICE_IN = Number(process.env.PRICE_IN_PER_M ?? 1.25); // USD per 1M input tokens
const PRICE_OUT = Number(process.env.PRICE_OUT_PER_M ?? 4.25); // USD per 1M output tokens
// Models priced differently from the default above, as [in, out] USD per 1M tokens.
const MODEL_PRICES = { 'muse-wonder-1.0': [4, 20] };
const priceOf = (model) => MODEL_PRICES[model] ?? [PRICE_IN, PRICE_OUT];
// Days recorded before per-model pricing have no token_usd; price them at the default.
const tokenUsd = (day) => day.token_usd ?? (day.in * PRICE_IN + day.out * PRICE_OUT) / 1e6;
const CAP = Number(process.env.SPEND_CAP_USD ?? 3);
// All days together, for this spend file (the public link has its own). Off unless set.
const TOTAL_CAP = Number(process.env.SPEND_TOTAL_CAP_USD ?? Infinity);

const today = () => new Date().toISOString().slice(0, 10);
function readSpend() {
  const all = existsSync(SPEND_PATH) ? JSON.parse(readFileSync(SPEND_PATH, 'utf8')) : {};
  return { all, day: all[today()] ?? { usd: 0, calls: 0, in: 0, out: 0 } };
}
export function spentToday() {
  return readSpend().day;
}
export const spentTotal = () => Object.values(readSpend().all).reduce((a, d) => a + (d.usd ?? 0), 0);
function recordSpend(inTok, outTok, model) {
  const { all, day } = readSpend();
  const [pin, pout] = priceOf(model);
  day.token_usd = tokenUsd(day) + (inTok * pin + outTok * pout) / 1e6;
  day.in += inTok;
  day.out += outTok;
  day.calls += 1;
  day.usd = Math.round((day.token_usd + (day.audio_usd ?? 0)) * 10000) / 10000;
  all[today()] = day;
  writeFileSync(SPEND_PATH, JSON.stringify(all, null, 2));
  return day;
}

// Transcription is billed per second of audio. Unknown rate, so count it
// conservatively against the same cap.
const AUDIO_PER_MIN = Number(process.env.PRICE_AUDIO_PER_MIN ?? 0.02);
export function recordAudioSpend(seconds) {
  const { all, day } = readSpend();
  day.audio_usd = Math.round(((day.audio_usd ?? 0) + (seconds / 60) * AUDIO_PER_MIN) * 10000) / 10000;
  day.usd = Math.round((tokenUsd(day) + day.audio_usd) * 10000) / 10000;
  if (day.usd >= CAP) throw new Error(`Daily spend cap reached ($${day.usd.toFixed(2)} of $${CAP}).`);
  all[today()] = day;
  writeFileSync(SPEND_PATH, JSON.stringify(all, null, 2));
}

// ---------- replay cache ----------
// Every live response is saved, keyed by the exact request. With MUSE_ENABLED=false
// the same request is answered from the cache in well under a second, with no API
// call: record a demo once live, then replay it as many times as you like.
// Saved under data/private/ because answers can contain personal history.
// data/demo-replay.json is a second, read-only layer that ships with the repo: the demo
// personas' "Play a demo conversation", recorded once (scripts/record-demo.js), so it
// replays for free on the public link. The public link never writes a cache.
const CACHE_PATH = process.env.REPLAY_FILE ?? join(ROOT, 'data', 'private', 'replay-cache.json');
const DEMO_REPLAY_PATH = join(ROOT, 'data', 'demo-replay.json');
let cache = null;
let demoReplay = null;
// The public link reads only the demo layer, never a private cache on this machine.
function loadCache() {
  if (!cache) cache = existsSync(CACHE_PATH) && (!config.publicDemo || process.env.REPLAY_FILE) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};
  return cache;
}
const findReplay = (key) => {
  demoReplay ??= existsSync(DEMO_REPLAY_PATH) && CACHE_PATH !== DEMO_REPLAY_PATH ? JSON.parse(readFileSync(DEMO_REPLAY_PATH, 'utf8')) : {};
  return loadCache()[key] ?? demoReplay[key];
};
function saveCache() {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
}
const cacheKey = (role, body) =>
  createHash('sha1').update(JSON.stringify({ role, model: body.model, messages: body.messages, json: !!body.response_format, reasoning: body.reasoning_effort, ...(body.tools ? { tools: body.tools.map((t) => t.function.name) } : {}) })).digest('hex');
export const replayStats = { hits: 0, misses: 0 };

// Both Meta Model API and Baseten speak the OpenAI chat-completions format.
// `reasoning` sets how long the model thinks first (minimal | low | medium). Thinking
// tokens count toward maxTokens and are billed as output, so keep it low for small jobs.
// `tools` (OpenAI function tools) lets the model call one; calls come back as `toolCalls`.
export async function complete(role, messages, { json = false, maxTokens = 1500, temperature = 0.2, reasoning = 'low', tools = null, model = null } = {}) {
  const p = config.providers[role];
  // `model`: another allowed model for this one call (the chat's model picker).
  // A quote cut through an emoji leaves half a character, which the API rejects.
  const whole = (v) => (typeof v === 'string' ? v.toWellFormed() : v);
  messages = messages.map((m) => ({ ...m, content: whole(m.content) }));
  const body = { model: model ?? p.model, messages, max_tokens: maxTokens, temperature };
  if (json) body.response_format = { type: 'json_object' };
  if (tools?.length) { body.tools = tools; body.tool_choice = 'auto'; }
  if (reasoning) body.reasoning_effort = reasoning;
  const key = cacheKey(role, body);

  if (!config.museEnabled || config.replayFirst) {
    const hit = findReplay(key);
    if (!hit && config.museEnabled) return liveCall();
    if (!hit) {
      replayStats.misses++;
      if (process.env.REPLAY_DEBUG) console.warn(`[replay miss] ${role} ${key.slice(0, 8)} ${JSON.stringify(messages).slice(-600)}`);
      throw Object.assign(new Error('Not recorded yet. Run this once with MUSE_ENABLED=true, then replay.'), { status: 409 });
    }
    replayStats.hits++;
    if (process.env.REPLAY_DEBUG) console.warn(`[replay hit] ${role} ${key.slice(0, 8)}`);
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 150)); // feels natural, still instant
    return { text: hit.text, toolCalls: hit.toolCalls ?? [], usage: hit.usage, model: body.model, replayed: true };
  }

  return liveCall();

  async function liveCall() {
  if (process.env.REPLAY_DEBUG) console.warn(`[live] ${role} ${key.slice(0, 8)} ${JSON.stringify(messages).slice(-600)}`);
  // Only live calls count against the daily cap; replays are free.
  const spent = spentToday();
  // On the public link visitors see a plain message; the numbers are for whoever runs it.
  const busy = 'The demo has used its model budget for now. You can still browse the demo memory; please try chatting again later.';
  if (spent.usd >= CAP) {
    throw new Error(config.publicDemo ? busy : `Daily spend cap reached ($${spent.usd.toFixed(2)} of $${CAP}). Raise SPEND_CAP_USD in .env to continue.`);
  }
  if (spentTotal() >= TOTAL_CAP) {
    throw new Error(config.publicDemo ? busy : `Total spend cap reached ($${spentTotal().toFixed(2)} of $${TOTAL_CAP}). Raise SPEND_TOTAL_CAP_USD to continue.`);
  }

  let res = await post(p, body);
  // Some providers reject response_format, reasoning_effort or tools; retry once without them.
  if (!res.ok && res.status === 400 && (body.response_format || body.reasoning_effort || body.tools)) {
    console.warn(`[llm] ${role} rejected the request (${(await res.text().catch(() => '')).slice(0, 160)}); retrying plain`);
    delete body.response_format;
    delete body.reasoning_effort;
    delete body.tools;
    delete body.tool_choice;
    res = await post(p, body);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${role} model call failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  const toolCalls = (data.choices?.[0]?.message?.tool_calls ?? []).map((c) => {
    let args = {};
    try { args = JSON.parse(c.function?.arguments || '{}'); } catch {}
    return { name: c.function?.name, args };
  }).filter((c) => c.name);
  if (data.choices?.[0]?.finish_reason === 'length') console.warn(`[llm] ${role} reply hit maxTokens (${maxTokens}); raise it if output looks cut off`);
  // Use the provider's token counts; fall back to a character estimate.
  const inTok = data.usage?.prompt_tokens ?? Math.ceil(JSON.stringify(messages).length / 4);
  const outTok = data.usage?.completion_tokens ?? Math.ceil(text.length / 4);
  recordSpend(inTok, outTok, body.model);
  // Kept for replay, except on the public link: visitors' answers are never stored.
  // (Recording the demo replay sets REPLAY_FILE explicitly, so that run is kept.)
  if (!config.publicDemo || process.env.REPLAY_FILE) {
    loadCache()[key] = { text, ...(toolCalls.length ? { toolCalls } : {}), usage: data.usage ?? null, at: new Date().toISOString() };
    saveCache();
  }
  return { text, toolCalls, usage: data.usage ?? null, model: p.model };
  }
}

// A dropped connection (DNS, reset) is retried twice before the call fails.
async function post(p, body, tries = 3) {
  try {
    return await fetch(`${p.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (tries <= 1) throw err;
    await new Promise((r) => setTimeout(r, 800 * (4 - tries)));
    return post(p, body, tries - 1);
  }
}

export function parseJson(text) {
  const clean = text.replace(/```(?:json)?/g, '');
  try {
    return JSON.parse(clean);
  } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Model did not return JSON');
    return JSON.parse(m[0]);
  }
}
