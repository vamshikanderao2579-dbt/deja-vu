"""Speaks tour captions with Kokoro (open-weights TTS, Apache 2.0) for scripts/make-narration.js.

Reads [{"text": ..., "out": ".../clip.wav"}, ...] as JSON on stdin and writes one WAV each,
with a short pause between sentences so it sounds like someone explaining.
Needs: pip install kokoro-onnx soundfile, plus kokoro-v1.0.onnx and voices-v1.0.bin from
https://github.com/thewh1teagle/kokoro-onnx/releases (model-files-v1.0) in KOKORO_DIR.
"""
import json, os, re, sys
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

model_dir = os.environ['KOKORO_DIR']
voice = os.environ.get('KOKORO_VOICE', 'af_heart')
speed = float(os.environ.get('KOKORO_SPEED', '0.9'))
pause = float(os.environ.get('KOKORO_PAUSE', '0.35'))

kokoro = Kokoro(os.path.join(model_dir, 'kokoro-v1.0.onnx'), os.path.join(model_dir, 'voices-v1.0.bin'))
for job in json.load(sys.stdin):
    parts, rate = [], 24000
    for sentence in [s for s in re.split(r'(?<=[.!?:])\s+', job['text']) if s.strip()]:
        audio, rate = kokoro.create(sentence, voice=voice, speed=speed, lang='en-us')
        parts += [audio, np.zeros(int(rate * pause), dtype=audio.dtype)]
    sf.write(job['out'], np.concatenate(parts[:-1]), rate)
