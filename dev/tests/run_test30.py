# Quick sign-in for big histories: the newest 300 activities first (slim rows, no map tracks), the rest in the background.
import os, subprocess, time, json, datetime
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8808'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
now=datetime.datetime.utcnow()
acts=[];secs=[]
for i in range(450):
  t=now-datetime.timedelta(days=i*2,hours=2); aid='00000000-0000-4000-8000-9%011d'%i
  acts.append({'id':aid,'owner':'u1','num':i+1,'name':'Run %d'%i,'sport':'run','start_time':t.strftime('%Y-%m-%dT%H:%M:%SZ'),'utc_offset_min':0,'distance_m':10000,'elapsed_s':3000,'moving_s':2950,'ascent_m':50,'visibility':'club','share':{},'source':'upload','device':'Forerunner 965',
               'summary':{'track':[[51.5+i/1000,-0.1],[51.51,-0.11]],'loadData':{'t':{'run':2950}},'weather':False,'perf':{}}})
  secs.append({'id':'s%d'%i,'activity_id':aid,'idx':0,'sport':'run','elapsed_s':3000,'timer_s':2950,'distance_m':10000,'ascent_m':50,'summary':{}})
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1240,'height':900});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    # the full list (paged with range) is slow; the quick first page (limit) is not
    pg.add_init_script('window.__seedDb='+json.dumps({'profile':{'privacy_set':True,'handle':'carl'},'activities':acts,'activity_sections':secs})+';window.__delay=(t,o)=>t==="activities"&&o.rng&&o.mode==="select"?2500:0;')
    pg.goto('http://localhost:8808/site/index.html#log');pg.wait_for_timeout(1200)
    st=pg.evaluate("(async()=>{const m=await import('/site/js/main.js'+[...document.scripts].find(x=>x.src.includes('main.js')).src.split('main.js')[1]);const s=m.state;return {n:s.activities.length,partial:s.partial,first:s.activities[0]?.name,last:s.activities.at(-1)?.name,track:'track' in (s.activities[0]?.summary||{}),start:s.activities.at(-1)?.summary?.start,has:s.activities[0]?.summary?.hasTrack}})()")
    print('QUICK',st)
    check(st['n']==300 and st['partial'] is True,'opens with the newest 300 while the rest load')
    check(st['last']=='Run 0' and st['first']=='Run 299','newest first page, kept oldest-to-newest in the list')
    check(not st['track'] and st['has'] is True and st['start']==[51.5,-0.1],'list rows carry a start point, not the map track')
    check(pg.is_visible('#view-log') and pg.is_visible('#olderPill'),'log shows straight away, with "Loading your older activities…"')
    pg.wait_for_timeout(3500)
    st=pg.evaluate("(async()=>{const m=await import('/site/js/main.js'+[...document.scripts].find(x=>x.src.includes('main.js')).src.split('main.js')[1]);const s=m.state;return {n:s.activities.length,partial:s.partial,first:s.activities[0]?.name}})()")
    print('FULL',st)
    check(st['n']==450 and st['partial'] is False and st['first']=='Run 449','then the whole history')
    check(not pg.is_visible('#olderPill'),'note goes away')
    check(pg.evaluate("__db.activities.every(a=>Array.isArray(a.summary.track)&&a.summary.track.length===2)"),'stored tracks untouched')
    # an activity page still has its full map
    pg.goto('http://localhost:8808/site/index.html#a/'+acts[5]['id']);pg.wait_for_timeout(2500)
    check(pg.is_visible('#view-activity') and pg.locator('#view-activity canvas, #view-activity .leaflet-container, #view-activity svg').count()>0,'activity page opens with its own full data')
    if errs: fails.append('errors '+str(errs))
    # a small history loads in one go
    pg2=b.new_page(viewport={'width':1240,'height':900});errs2=[];pg2.on('pageerror',lambda e:errs2.append(str(e.stack)[:600]))
    pg2.add_init_script('window.__seedDb='+json.dumps({'profile':{'privacy_set':True},'activities':acts[:20],'activity_sections':secs[:20],'best_efforts':[{'id':'b1','owner':'u1','activity_id':acts[0]['id'],'sport':'run','effort':'5 km','seconds':1200,'start_time':acts[0]['start_time']}]})+';')
    pg2.goto('http://localhost:8808/site/index.html#log');pg2.wait_for_timeout(1500)
    st=pg2.evaluate("(async()=>{const m=await import('/site/js/main.js'+[...document.scripts].find(x=>x.src.includes('main.js')).src.split('main.js')[1]);const s=m.state;return {n:s.activities.length,partial:s.partial,bests:s.bestsAll.length}})()")
    check(st['n']==20 and not st['partial'] and st['bests']==1 and not pg2.is_visible('#olderPill'),'small history: everything at once, bests too '+json.dumps(st))
    if errs2: fails.append('errors '+str(errs2))
finally: srv.terminate()
print('FAILED: '+'; '.join(fails) if fails else 'ALL PASSED')
