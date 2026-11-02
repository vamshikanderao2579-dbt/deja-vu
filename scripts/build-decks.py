"""Build docs/decks/<name>.html, a standalone, offline viewer for each deck.

Sources live in docs/decks/<name>/ (deck.json + slides/*.html, the same files the
claude.ai deck artifacts are built from). Run: python3 scripts/build-decks.py
Keys: ← → or click to move, N toggles speaker notes, F for full screen, P to print / save as PDF.
"""
import json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'decks'
PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..800&family=Geist+Mono:wght@400..600&display=swap">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{height:100%;background:#03070c;overflow:hidden}}
#stage{{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform-origin:center}}
#stage>section{{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;display:none!important}}
#stage>section.on{{display:flex!important}}
section aside{{display:none}}
#notes{{position:fixed;left:0;right:0;bottom:0;max-height:34vh;overflow:auto;background:#0c1621ee;color:#dfe3ee;font:16px/1.5 Geist,Arial,sans-serif;padding:16px 24px;border-top:1px solid #1c2b3a;display:none}}
body.notes #notes{{display:block}}
#count{{position:fixed;right:14px;top:10px;color:#5b6178;font:13px Geist Mono,monospace}}
@media print{{
  @page{{size:1920px 1080px;margin:0}}
  html,body{{overflow:visible;height:auto}}
  #stage{{position:static;transform:none!important}}
  #stage>section{{display:flex!important;position:relative;page-break-after:always}}
  #notes,#count{{display:none!important}}
}}
</style></head><body>
<div id="stage">
{slides}
</div>
<div id="notes"></div><div id="count"></div>
<script>
const S=[...document.querySelectorAll('#stage>section')],stage=document.getElementById('stage');
let i=Math.max(0,Math.min(S.length-1,(parseInt(location.hash.slice(1))||1)-1));
function fit(){{const k=Math.min(innerWidth/1920,innerHeight/1080);stage.style.transform=`translate(-50%,-50%) scale(${{k}})`}}
function show(n){{i=Math.max(0,Math.min(S.length-1,n));S.forEach((s,j)=>s.classList.toggle('on',j===i));
  document.getElementById('notes').textContent=S[i].querySelector('aside')?.textContent||'(no notes)';
  document.getElementById('count').textContent=`${{i+1}} / ${{S.length}} · N notes · F full screen · P print`;history.replaceState(null,'','#'+(i+1))}}
addEventListener('keydown',e=>{{if(['ArrowRight','PageDown',' '].includes(e.key))show(i+1);else if(['ArrowLeft','PageUp'].includes(e.key))show(i-1);
  else if(e.key==='n'||e.key==='N')document.body.classList.toggle('notes');else if(e.key==='f'||e.key==='F')document.documentElement.requestFullscreen?.();
  else if(e.key==='p'||e.key==='P')print();else if(e.key==='Home')show(0);else if(e.key==='End')show(S.length-1)}});
addEventListener('click',e=>{{if(!e.target.closest('#notes'))show(e.clientX<innerWidth/3?i-1:i+1)}});
addEventListener('resize',fit);fit();show(i);
</script></body></html>
"""

for deck in sorted(p for p in ROOT.iterdir() if (p / 'deck.json').exists()):
    meta = json.loads((deck / 'deck.json').read_text())
    slides = '\n'.join((deck / 'slides' / f'{s}.html').read_text().strip() for s in meta['order'])
    assert '/_blob/' not in slides, f'{deck.name}: a slide uses an uploaded image; download it into the folder first'
    out = ROOT / f'{deck.name}.html'
    out.write_text(PAGE.format(title=meta['title'], slides=slides))
    print(f'{out.relative_to(ROOT.parent.parent)}: {len(meta["order"])} slides')
