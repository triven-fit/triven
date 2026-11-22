# Clean addresses: /log, /log/bests/…, /carl/2 instead of #routes; reloads go through 404.html; back/forward; ?build= removed.
import os, subprocess, time, json, threading, http.server, functools
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
class H(http.server.SimpleHTTPRequestHandler):
  def log_message(self,*a): pass
  def send_error(self, code, *a, **k):   # like GitHub Pages: unknown paths get 404.html
    if code!=404: return super().send_error(code,*a,**k)
    body=open(os.path.join(DEV,'site','404.html'),'rb').read()
    self.send_response(404);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
srv=http.server.ThreadingHTTPServer(('localhost',8796),functools.partial(H,directory=DEV));threading.Thread(target=srv.serve_forever,daemon=True).start()
acts=[];secs=[];bests=[]
for n,(i,d,w) in enumerate([('r1','2025-03-01',280),('r2','2026-02-01',300)],1):
  acts.append({'id':i,'num':n,'owner':'u1','name':'Ride '+i,'sport':'bike','start_time':d+'T05:00:00Z','utc_offset_min':180,'distance_m':20000,'elapsed_s':3600,'moving_s':3600,'ascent_m':100,'is_race':False,'visibility':'club','share':{},'summary':{'manual':True},'source':'manual'})
  secs.append({'id':'s'+i,'activity_id':i,'idx':0,'sport':'bike','elapsed_s':3600,'distance_m':20000,'summary':{}})
  bests.append({'id':'b'+i,'owner':'u1','activity_id':i,'sport':'bike','effort':'power 20 min','value':w,'unit':'W','measured':True,'achieved_at':d+'T05:30:00Z'})
seed={'profile':{'privacy_set':True,'handle':'carl'},'activities':acts,'activity_sections':secs,'best_efforts':bests}
mock="window.__rpcData={resolve_link: a => ({data: a.p_num ? {found:true,handle:'carl',activity:'r'+a.p_num} : {found:true,handle:'carl',person:'u1'}, error:null})};"
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    pg.add_init_script('window.__seedDb='+json.dumps(seed)+';'+mock)
    url=lambda: pg.evaluate('location.pathname+location.search+location.hash')
    pg.goto('http://localhost:8796/site/index.html?build=123#log');pg.wait_for_timeout(2500)
    check(url()=='/log','opens as /log, ?build= gone: '+url())
    pg.click('#lognavBests');pg.wait_for_timeout(800);check(url()=='/log/bests','Best efforts: /log/bests')
    pg.click('#logBests tr:has-text("20 min")');pg.wait_for_timeout(600);check(url()=='/log/bests/bike/power%2020%20min','category: '+url())
    pg.click('#logBests .ranklist a:has-text("Ride r2")');pg.wait_for_timeout(2000)
    check(url()=='/carl/2','your activity shows as /carl/2: '+url())
    check(pg.is_visible('#actBack') and 'power' in pg.inner_text('#actBack'),'back link to the list, with no ?back= in the address')
    pg.go_back();pg.wait_for_timeout(1200);check(url()=='/log/bests/bike/power%2020%20min' and pg.is_visible('#logBests .ranklist'),'browser Back returns to the list')
    pg.go_forward();pg.wait_for_timeout(2000);check(url()=='/carl/2' and pg.is_visible('#view-activity'),'browser Forward reopens the activity')
    pg.reload();pg.wait_for_timeout(3000);check(url()=='/carl/2' and pg.inner_text('#actName').startswith('Ride r2'),'reloading /carl/2 reopens it (via 404.html)')
    pg.goto('http://localhost:8796/log/bests?y=2025');pg.wait_for_timeout(3000)
    check(url()=='/log/bests?y=2025' and '280 W' in pg.inner_text('#logBests'),'a clean address opened directly works: '+url())
    pg.click('#tab-feed');pg.wait_for_timeout(1500);check(url()=='/feed','tab links give clean addresses: '+url())
    pg.goto('http://localhost:8796/carl');pg.wait_for_timeout(3000);check(url()=='/carl' and pg.is_visible('#view-profile'),'profile at /carl')
    pg.goto('http://localhost:8796/nosuch/thing/here');pg.wait_for_timeout(2500);check(url()=='/feed','unknown address goes home')
    # slow buttons grey out until they finish
    pg.evaluate("()=>{const b=document.createElement('button');b.id='slowb';b.textContent='Trim';b.onclick=()=>new Promise(r=>setTimeout(r,800));document.body.append(b)}")
    pg.click('#slowb');pg.wait_for_timeout(150)
    check(pg.evaluate("document.getElementById('slowb').disabled && document.getElementById('slowb').classList.contains('busy')"),'a slow button is greyed out and disabled while working')
    pg.wait_for_timeout(1000);check(pg.evaluate("!document.getElementById('slowb').disabled"),'…and comes back when done')
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.shutdown()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
