"""Build docs/decks/<name>.html, a standalone, offline viewer for each deck.

Sources live in docs/decks/<name>/ (deck.json + slides/*.html, the same files the
claude.ai deck artifacts are built from). Run: python3 scripts/build-decks.py
Keys: ← → or click to move (a slide's data-reveal="1", "2"… parts appear one tap at a time), N toggles speaker notes, F for full screen, P to print / save as PDF.
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
[data-reveal]{{transition:opacity .45s ease,transform .45s ease}}
.rv-off{{opacity:0;transform:translateY(14px);pointer-events:none}}
#notes{{position:fixed;left:0;right:0;bottom:0;max-height:34vh;overflow:auto;background:#0c1621ee;color:#dfe3ee;font:16px/1.5 Geist,Arial,sans-serif;padding:16px 24px;border-top:1px solid #1c2b3a;display:none}}
body.notes #notes{{display:block}}
#count{{display:none}} /* the slide number and key hints stay off the screen */
#nav{{position:fixed;right:18px;bottom:18px;display:flex;gap:10px;z-index:5}}
#nav button{{width:46px;height:46px;border-radius:50%;border:1px solid #22344a;background:#0c1621cc;color:#c9cde0;font:22px/1 Geist,Arial,sans-serif;cursor:pointer;opacity:.55;transition:opacity .2s}}
#nav button:hover{{opacity:1}}
body.notes #nav{{bottom:calc(34vh + 18px)}}
#narrGo{{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9;padding:22px 40px;border-radius:999px;border:0;background:linear-gradient(90deg,#5CC8FF,#0082FB);color:#06121F;font:700 24px Geist,Arial,sans-serif;cursor:pointer;box-shadow:0 0 60px rgba(0,130,251,.5)}}
@media print{{
  @page{{size:1920px 1080px;margin:0}}
  html,body{{overflow:visible;height:auto}}
  #stage{{position:static;transform:none!important}}
  #stage>section{{display:flex!important;position:relative;page-break-after:always}}
  #notes,#count,#nav{{display:none!important}}
  .rv-off{{opacity:1;transform:none}}
}}
</style></head><body>
<div id="stage">
{slides}
</div>
<div id="notes"></div><div id="count"></div>
<div id="nav"><button id="navPrev" aria-label="Previous slide">‹</button><button id="navNext" aria-label="Show all, then next slide">›</button></div>
<script>
const S=[...document.querySelectorAll('#stage>section')],stage=document.getElementById('stage');
let i=Math.max(0,Math.min(S.length-1,(parseInt(location.hash.slice(1))||1)-1));
function fit(){{const k=Math.min(innerWidth/1920,innerHeight/1080);stage.style.transform=`translate(-50%,-50%) scale(${{k}})`}}
// Tap-to-reveal: r parts of this slide are showing; a tap shows the next before moving on.
let r=0;const steps=(s)=>Math.max(0,...[...s.querySelectorAll('[data-reveal]')].map(e=>+e.dataset.reveal));
function reveal(){{S[i].dataset.r=r;S[i].querySelectorAll('[data-reveal]').forEach(e=>e.classList.toggle('rv-off',+e.dataset.reveal>r))}}
function next(){{if(r<steps(S[i])){{r++;reveal()}}else show(i+1)}}
function prev(){{if(r>0){{r--;reveal()}}else show(i-1,true)}}
// The › button: first click shows everything left on this slide, the next one moves on.
function skip(){{const n=steps(S[i]);if(r<n){{r=n;reveal()}}else show(i+1)}}
function show(n,full){{const was=i;i=Math.max(0,Math.min(S.length-1,n));if(i!==was||full===undefined)r=full?steps(S[i]):0;reveal();S.forEach((s,j)=>s.classList.toggle('on',j===i));
  document.getElementById('notes').textContent=S[i].querySelector('aside')?.textContent||'(no notes)';
  document.getElementById('count').textContent=`${{i+1}} / ${{S.length}} · N notes · F full screen · P print`;history.replaceState(null,'','#'+(i+1))}}
addEventListener('keydown',e=>{{if(['ArrowRight','PageDown',' '].includes(e.key))next();else if(['ArrowLeft','PageUp'].includes(e.key))prev();
  else if(e.key==='n'||e.key==='N')document.body.classList.toggle('notes');else if(e.key==='f'||e.key==='F')document.documentElement.requestFullscreen?.();
  else if(e.key==='p'||e.key==='P')print();else if(e.key==='Home')show(0);else if(e.key==='End')show(S.length-1)}});
document.getElementById('navNext').onclick=skip;document.getElementById('navPrev').onclick=()=>show(i-1,true);
addEventListener('click',e=>{{if(!e.target.closest('#notes, a, #nav'))e.clientX<innerWidth/3?prev():next()}});
addEventListener('resize',fit);fit();show(i);
// Auto-play (?narrate=1): each reveal step says its line, then the deck moves on by itself.
// The demo slide starts Alex's tour, which comes back here to the results when it ends.
const NARR={narr};
if(new URLSearchParams(location.search).has('narrate')&&Object.keys(NARR).length){{
  const wait=(ms)=>new Promise((r)=>setTimeout(r,ms));
  // If the browser won't play sound yet, a button asks for one click, then the line plays.
  const ask=(label)=>new Promise((res)=>{{const b=document.createElement('button');b.id='narrGo';b.textContent=label;document.body.append(b);b.addEventListener('click',(e)=>{{e.stopPropagation();b.remove();res()}})}});
  const say=(url)=>new Promise((res)=>{{if(!url)return wait(400).then(res);const a=new Audio(url);a.onended=a.onerror=()=>res();const guard=()=>setTimeout(res,((a.duration||10)+3)*1000);/* a stalled clip never hangs the deck */a.play().then(guard,()=>ask('▶ Continue').then(()=>a.play().then(guard,()=>res())))}});
  const run=async()=>{{
    for(;;){{const s=S[i],lines=NARR[s.id]||[];
      if(s.id==='end'&&r===0)await wait(2200); // the clock turns back first
      await say(lines[r]);await wait(150);
      if(r>=steps(s)){{if(s.id==='demo'){{location.href='/?from=slides&narrate=1#/demo?as=alex';return}}if(i===S.length-1)return}}
      next();await wait(r===0?500:200)}}}};
  // From the start, it waits for one click; back from the demo, it carries on by itself.
  if(i)wait(600).then(run);else ask('▶ Start the presentation').then(run);
}}
</script></body></html>
"""

# The slide sources use <x-shape> arrows and <x-icon> icons; a browser draws neither,
# so they become inline SVG here (an arrow filled with the shape's background colour,
# an icon stroked in the element's text colour).
ICONS = {
    'CheckCircle': '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/>',
    'Search': '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    'Lock': '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    'Link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    'Lightning': '<path d="M13 2.5L4.5 13.5H12L11 21.5l8.5-11H12z"/>',
    'Chat': '<path d="M12 4c4.97 0 9 3.36 9 7.5S16.97 19 12 19c-1.1 0-2.15-.16-3.12-.46L4 20l1.4-3.6C4.5 15.1 3 13.4 3 11.5 3 7.36 7.03 4 12 4z"/>',
    'Star': '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
    'ThumbsUp': '<path d="M7 10.5v10H4v-10zM7 10.5l4-7.5a2.2 2.2 0 0 1 2.4 2.6L12.7 9H19a2 2 0 0 1 2 2.3l-1.3 7.5a2 2 0 0 1-2 1.7H7"/>',
    'Database': '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
}

def px(style, prop):
    m = re.search(rf'(?:^|;)\s*{prop}:\s*([\d.]+)px', style)
    return float(m.group(1)) if m else 24.0

def shape(m):
    attrs, kind, style = m.group(1) or '', m.group(2), m.group(3)
    fill = re.search(r'background:\s*([^;]+)', style)
    fill = fill.group(1).strip() if fill else 'currentColor'
    style = re.sub(r'background:\s*[^;]+;?', '', style)
    w, h = px(style, 'width'), px(style, 'height')
    if kind == 'arrow-right':
        t, head = h * 0.32, min(w * 0.45, h)
        pts = f'0,{h/2-t/2} {w-head},{h/2-t/2} {w-head},0 {w},{h/2} {w-head},{h} {w-head},{h/2+t/2} 0,{h/2+t/2}'
    elif kind == 'arrow-down':
        t, head = w * 0.32, min(h * 0.45, w)
        pts = f'{w/2-t/2},0 {w/2+t/2},0 {w/2+t/2},{h-head} {w},{h-head} {w/2},{h} 0,{h-head} {w/2-t/2},{h-head}'
    else:
        raise SystemExit(f'unknown x-shape kind: {kind}')
    return f'<svg{attrs} aria-hidden="true" viewBox="0 0 {w:g} {h:g}" style="{style};flex:none"><polygon points="{pts}" fill="{fill}"/></svg>'

def icon(m):
    name, style = m.group(1), m.group(2)
    if name not in ICONS:
        raise SystemExit(f'unknown x-icon name: {name}')
    return (f'<svg aria-hidden="true" viewBox="0 0 24 24" style="{style};flex:none" fill="none" stroke="currentColor" '
            f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</svg>')

def connector(m):
    style = m.group(1)
    w, head = px(style, 'width'), 9
    return (f'<svg aria-hidden="true" viewBox="0 0 {w:g} 20" style="{style};height:20px;flex:none;align-self:center" fill="none" '
            f'stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
            f'<path d="M2 10H{w-3:g}M{w-3-head:g} 3l{head} 7-{head} 7"/></svg>')

def draw(html):
    html = re.sub(r'<x-shape((?: data-[\w-]+="[^"]*")*) kind="([\w-]+)" style="([^"]*)"></x-shape>', shape, html)
    html = re.sub(r'<x-connector style="([^"]*)"></x-connector>', connector, html)
    html = re.sub(r'<x-icon name="(\w+)" style="([^"]*)"></x-icon>', icon, html)
    assert '<x-' not in html, 'an x-shape or x-icon was not converted'
    return html

for deck in sorted(p for p in ROOT.iterdir() if (p / 'deck.json').exists()):
    meta = json.loads((deck / 'deck.json').read_text())
    slides = draw('\n'.join((deck / 'slides' / f'{s}.html').read_text().strip() for s in meta['order']))
    assert '/_blob/' not in slides, f'{deck.name}: a slide uses an uploaded image; download it into the folder first'
    out = ROOT / f'{deck.name}.html'
    # Auto-play narration: per slide, the recorded clip for each reveal step (make-deck-narration.js).
    narr = {}
    script, index = deck / 'narration.json', ROOT.parent.parent / 'src' / 'ui' / 'narration' / 'deck' / 'index.json'
    if script.exists() and index.exists():
        files = json.loads(index.read_text())
        narr = {k: [f'/narration/deck/{files[t]}' if t else None for t in v] for k, v in json.loads(script.read_text()).items() if not k.startswith('_')}
    out.write_text(PAGE.format(title=meta['title'], slides=slides, narr=json.dumps(narr)))
    print(f'{out.relative_to(ROOT.parent.parent)}: {len(meta["order"])} slides')
