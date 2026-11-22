# Writes videos.html (the site's how-to page) and small card images in img/videos/.
# The videos themselves are served from the triven-fit/triven-media repo (Cloudflare Pages) at MEDIA/v/NN.mp4 with NN.jpg posters.
import json, os
MEDIA = 'https://media.triven.fit'
from PIL import Image
ROOT = '/home/claude/triven'
meta = json.load(open('/tmp/vid/meta.json'))
os.makedirs(f'{ROOT}/img/videos', exist_ok=True)
for v in meta:
    Image.open(f'/tmp/vid/thumbs/{v["n"]:02d}.jpg').resize((640, 360), Image.LANCZOS).save(f'{ROOT}/img/videos/{v["n"]:02d}.jpg', quality=78, optimize=True)
esc = lambda s: s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
groups = []
for v in meta:
    if not groups or groups[-1][0] != v['group']: groups.append((v['group'], []))
    groups[-1][1].append(v)
cards = ''
for g, vs in groups:
    cards += f'<h2>{esc(g)}</h2>\n<div class="grid">\n'
    for v in vs:
        n2 = f'{v["n"]:02d}'; dur = f'{v["secs"] // 60}:{v["secs"] % 60:02d}'
        cards += (f'<a class="vcard" href="#{n2}" data-n="{n2}"><span class="thumb"><img src="/img/videos/{n2}.jpg" alt="" loading="lazy" width="640" height="360">'
                  f'<span class="dur">{dur}</span><span class="play" aria-hidden="true"></span></span>'
                  f'<span class="txt"><b>{n2} · {esc(v["title"])}</b><span>{esc(v["line"])}</span></span></a>\n')
    cards += '</div>\n'
total = sum(v['secs'] for v in meta) // 60
html = f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>How-to videos · Triven</title><link rel="icon" href="/logo.svg">
<meta name="description" content="Short videos showing how to use Triven, the free training log for swimming, cycling, running and multisport.">
<style>
:root{{--bg:#eef0ef;--card:#fbfcfb;--text:#1b1e20;--muted:#5d666b;--accent:#1f9d55;--line:rgba(27,30,32,.1);--chip:#eef1ef}}
@media (prefers-color-scheme:dark){{:root{{--bg:#141618;--card:#1b1e20;--text:#e8eaeb;--muted:#9aa2a6;--accent:#4fd081;--line:rgba(255,255,255,.1);--chip:#24282b}}}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 Inter,system-ui,-apple-system,Segoe UI,sans-serif}}
main{{max-width:1080px;margin:0 auto;padding:28px 20px 60px}}
header{{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:22px}}header a.home{{color:inherit;text-decoration:none;font-weight:700;font-size:20px;letter-spacing:.04em;display:flex;align-items:center;gap:10px}}header img{{height:30px}}
header .open{{font-size:14px;font-weight:600;color:#fff;background:var(--accent);padding:7px 14px;border-radius:8px;text-decoration:none}}
.doc{{background:var(--card);border-radius:16px;padding:28px 32px;border:1px solid var(--line)}}
h1{{font-size:30px;line-height:1.2;margin:0 0 4px}}h2{{font-size:20px;margin:30px 0 12px}}
.muted{{color:var(--muted);font-size:15px}}a{{color:var(--accent)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}}
.vcard{{display:flex;flex-direction:column;gap:8px;text-decoration:none;color:inherit;border-radius:12px}}
.thumb{{position:relative;display:block;border-radius:12px;overflow:hidden;aspect-ratio:16/9;background:#1b1e20}}.thumb img{{width:100%;height:100%;object-fit:cover;display:block}}
.dur{{position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.75);color:#fff;font-size:12px;font-weight:600;padding:1px 6px;border-radius:5px}}
.play{{position:absolute;inset:0;margin:auto;width:52px;height:52px;border-radius:50%;background:rgba(0,0,0,.55);opacity:0;transition:opacity .15s}}
.play::after{{content:"";position:absolute;left:21px;top:16px;border-left:16px solid #fff;border-top:10px solid transparent;border-bottom:10px solid transparent}}
a.vcard:hover .play,a.vcard:focus-visible .play{{opacity:1}}a.vcard:hover b{{color:var(--accent)}}
.play{{opacity:.85}}
dialog{{border:0;padding:0;background:transparent;max-width:min(1100px,96vw);width:96vw}}dialog::backdrop{{background:rgba(0,0,0,.82)}}
.pl{{background:#000;border-radius:12px;overflow:hidden}}.pl video{{display:block;width:100%;aspect-ratio:16/9;background:#000}}
.pbar{{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#141618;color:#e8eaeb;font-size:14px}}.pbar b{{flex:1;font-weight:600}}
.pbar button{{font:inherit;font-weight:600;border:0;border-radius:8px;padding:6px 12px;cursor:pointer;background:#24282b;color:#e8eaeb}}.pbar button.go{{background:#1f9d55;color:#fff}}
.txt{{display:flex;flex-direction:column;gap:2px}}.txt b{{font-size:15px;line-height:1.3}}.txt span{{font-size:14px;color:var(--muted);line-height:1.4}}
footer{{display:flex;gap:18px;flex-wrap:wrap;margin-top:22px;font-size:13px;color:var(--muted)}}footer a{{color:inherit}}
@media (max-width:640px){{.doc{{padding:22px 18px}}}}
</style></head><body><main>
<header><a class="home" href="/"><img src="/logo.svg" alt="">TRIVEN</a><a class="open" href="/">Open Triven</a></header>
<article class="doc">
<h1>How-to videos</h1>
<p class="muted">{len(meta)} short videos, about {total} minutes in all, each on one part of Triven. Prefer reading? The <a href="/help.html">help guide</a> covers the same ground.</p>
{cards}</article>
<dialog id="pl" aria-label="Video player"><div class="pl"><video id="vid" controls playsinline preload="metadata"></video><div class="pbar"><b id="vt"></b><button id="vn" class="go" type="button">Next ›</button><button id="vx" type="button">Close</button></div></div></dialog>
<footer><span>© Triven</span><a href="/help.html">Help</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="mailto:hello@triven.fit">hello@triven.fit</a></footer>
</main><script>(function(){{
var M='{MEDIA}',V={json.dumps([[f'{v["n"]:02d}', v['title']] for v in meta])},d=document.getElementById('pl'),vid=document.getElementById('vid'),cur=-1;
function open_(n){{var i=V.findIndex(function(x){{return x[0]===n}});if(i<0)return;cur=i;vid.poster=M+'/v/'+n+'.jpg';vid.src=M+'/v/'+n+'.mp4';document.getElementById('vt').textContent=n+' · '+V[i][1];document.getElementById('vn').hidden=i===V.length-1;if(!d.open)d.showModal();if(location.hash!=='#'+n)history.replaceState(null,'','#'+n);vid.play().catch(function(){{}})}}
function close_(){{vid.pause();vid.removeAttribute('src');vid.load();if(d.open)d.close();history.replaceState(null,'',location.pathname)}}
document.querySelectorAll('a.vcard').forEach(function(a){{a.addEventListener('click',function(e){{e.preventDefault();open_(a.dataset.n)}})}});
document.getElementById('vn').onclick=function(){{if(cur<V.length-1)open_(V[cur+1][0])}};document.getElementById('vx').onclick=close_;d.addEventListener('close',function(){{if(vid.getAttribute('src'))close_()}});
d.addEventListener('click',function(e){{if(e.target===d)close_()}});vid.addEventListener('ended',function(){{if(cur<V.length-1)document.getElementById('vn').focus()}});
function fromHash(){{if(/^#\\d\\d$/.test(location.hash))open_(location.hash.slice(1))}}fromHash();addEventListener('hashchange',fromHash);
}})();</script><script>try{{var p='videos',d=new Date().toISOString().slice(0,10),k='triven.seen.'+p;if(localStorage.getItem(k)!==d){{localStorage.setItem(k,d);fetch('https://ksubeokekwflqnmzsune.supabase.co/rest/v1/rpc/count_view',{{method:'POST',headers:{{apikey:'sb_publishable_gBU60hkphcU9T97Cn1Bvmw_QMIFFy3i','Content-Type':'application/json'}},body:JSON.stringify({{p_page:p}}),keepalive:true}}).catch(function(){{}})}}}}catch(e){{}}</script></body></html>
'''
open(f'{ROOT}/videos.html', 'w').write(html)
print('videos.html', len(html), 'bytes;', len(meta), 'videos from', MEDIA)
