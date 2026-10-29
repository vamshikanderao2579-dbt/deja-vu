// Voice replies to quick checks, via Muse Voice Transcribe (realtime ASR).
// Protocol: wss://api.meta.ai/v1/asr/realtime. A JSON handshake with the key,
// then raw PCM16 mono 24 kHz binary frames paced in real time, then endStream.
// The server sends {type:"transcript", transcript, final} and closes with 1000.

import { config } from './config.js';
import { recordAudioSpend } from './llm.js';

const URL = 'wss://api.meta.ai/v1/asr/realtime';
const RATE = 24000;
const FRAME_MS = 80;
const FRAME_BYTES = (RATE * 2 * FRAME_MS) / 1000; // 3840

export async function transcribe(pcm) {
  if (config.mock) return mockTranscript(pcm);
  if (pcm.length % 2) pcm = pcm.subarray(0, pcm.length - 1); // PCM16 needs whole samples
  const seconds = pcm.length / (RATE * 2);
  if (seconds > 15) throw new Error('Keep voice replies under 15 seconds');
  recordAudioSpend(seconds);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.binaryType = 'arraybuffer';
    let finals = [];
    let partial = '';
    const timer = setTimeout(() => { ws.close(); reject(new Error('Transcription timed out')); }, (seconds + 15) * 1000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        authorization: { accessToken: `Bearer ${config.providers.main.apiKey}` },
        audioEncoding: 'PCM_24KHZ',
        model: 'muse-voice-transcribe-1.0',
        mode: 'PUSH_TO_TALK',
      }));
    };
    let streaming = false;
    ws.onmessage = async (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      if (msg.sessionId && !streaming) {
        streaming = true;
        // Pace frames in real time; faster or slower ingress is rejected.
        for (let i = 0; i < pcm.length; i += FRAME_BYTES) {
          if (ws.readyState !== WebSocket.OPEN) return;
          ws.send(pcm.subarray(i, i + FRAME_BYTES));
          await new Promise((r) => setTimeout(r, FRAME_MS));
        }
        ws.send(JSON.stringify({ type: 'endStream' }));
      } else if (msg.type === 'transcript') {
        if (msg.final) { finals.push(msg.transcript); partial = ''; } else partial = msg.transcript;
      } else if (msg.type === 'error') {
        clearTimeout(timer);
        reject(new Error(`Transcription error: ${msg.message}`));
        ws.close();
      }
    };
    ws.onclose = (ev) => {
      clearTimeout(timer);
      if (ev.code === 1000 || finals.length || partial) resolve([...finals, partial].join(' ').replace(/\s+/g, ' ').trim());
      else reject(new Error(`Transcription closed (${ev.code}${ev.reason ? `: ${ev.reason}` : ''})`));
    };
    ws.onerror = () => {}; // onclose reports the outcome
  });
}

// What did the person mean? Clear yes/no answers map directly; anything
// else is treated as their own wording of the card (an edit).
export function interpret(transcript) {
  const t = transcript.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return { action: null };
  const no = /^(no|nope|nah|not anymore|not really|forget it|forget that|that's wrong|wrong|no longer)\b/;
  const yes = /^(yes|yeah|yep|yup|correct|right|that's right|still true|sure|exactly|absolutely|definitely)\b/;
  if (no.test(t)) {
    // "No, it's Wednesdays now" carries a correction.
    const rest = transcript.replace(/^\s*(not anymore|nope|nah|no)\b[,.!]*\s*/i, '').replace(/\.{2,}$/, '.').trim();
    if (/^not anymore\b/i.test(rest)) return { action: 'reject' };
    return rest.split(/\s+/).length >= 3 ? { action: 'edit', text: rest } : { action: 'reject' };
  }
  if (yes.test(t)) return { action: 'confirm' };
  return { action: 'edit', text: transcript.replace(/\.{2,}$/, '.').trim() };
}

function mockTranscript(pcm) {
  return pcm.length ? 'yes that is still true' : '';
}
