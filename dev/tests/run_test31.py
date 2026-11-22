# Feed sidebar: clicking a past week's bar shows that week's days and numbers; "Back to this week" returns.
import os, subprocess, time, json, datetime
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8809'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
today=datetime.datetime.utcnow().replace(hour=8,minute=0,second=0,microsecond=0)
monday=today-datetime.timedelta(days=today.weekday())
acts=[]
def add(day, name, sport='run', secs=3600, dist=10000):
  aid='00000000-0000-4000-8000-%012d'%len(acts)
  acts.append({'id':aid,'owner':'u1','num':len(acts)+1,'name':name,'sport':sport,'start_time':day.strftime('%Y-%m-%dT%H:%M:%SZ'),'utc_offset_min':0,'distance_m':dist,'elapsed_s':secs,'moving_s':secs,'ascent_m':20,'visibility':'club','share':{},'source':'upload','summary':{'loadData':{'t':{sport:secs}}}})
for wk in range(1,12):
  for d in (0,2,4): add(monday-datetime.timedelta(weeks=wk)+datetime.timedelta(days=d),'Run w%d d%d'%(wk,d))
w2=monday-datetime.timedelta(weeks=2); add(w2+datetime.timedelta(days=6),'Long ride',sport='bike',secs=4*3600,dist=100000)   # a big Sunday two weeks ago
add(monday,'Monday run')
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1300,'height':1000}); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script('window.__seedDb='+json.dumps({'profile':{'privacy_set':True,'handle':'carl'},'activities':acts})+';')
    pg.goto('http://localhost:8809/site/index.html#feed'); pg.wait_for_timeout(2500)
    card=lambda: pg.evaluate("(()=>{const t=[...document.querySelectorAll('.wtitle')].find(x=>/week/i.test(x.textContent));const c=t.closest('.card');return {title:t.textContent,load:c.querySelector('.wnum b')?.textContent,dots:[...c.querySelectorAll('.wdots i')].map(i=>i.className==='on'?1:0).join(''),cur:[...c.querySelectorAll('.wbar')].findIndex(r=>r.classList.contains('cur')),msg:c.querySelector('.whead + .muted')?.textContent||''}})()")
    s0=card(); print('NOW',s0); check(s0['title']=='This week' and s0['dots']=='1000000' and s0['cur']==11,'starts on this week')
    pg.locator('.whit').nth(9).click(); pg.wait_for_timeout(400)
    s1=card(); print('W-2',s1)
    check(s1['title'].startswith('Week of') and 'Back to this week' in s1['title'] and s1['dots']=='1010101' and s1['cur']==9,'clicking the bar two weeks back shows that week (runs Mon/Wed/Fri + Sunday ride)')
    check(s1['load']!=s0['load'] and int(s1['load'])>int(s0['load']),'its load, not this week\'s')
    check('that week' in s1['msg'] or s1['msg']=='', 'message speaks about that week: '+s1['msg'])
    pg.locator('.wtab', has_text='Ride').click(); pg.wait_for_timeout(300)
    s2=pg.evaluate("(()=>{const t=[...document.querySelectorAll('.wtitle')].find(x=>/week/i.test(x.textContent));const c=t.closest('.card');return {title:t.textContent,nums:[...c.querySelectorAll('.wnum b')].map(b=>b.textContent)}})()"); print('RIDE',s2)
    check(s2['title'].startswith('Week of') and s2['nums'][0].startswith('100'),'sport tabs keep the chosen week (100 km ride)')
    pg.locator('.wtab', has_text='All').click(); pg.locator('.whit').nth(9).click(); pg.wait_for_timeout(300)
    check(card()['title']=='This week','clicking the chosen bar again goes back')
    pg.locator('.whit').nth(3).focus(); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    check(card()['cur']==3,'keyboard: Enter on a focused bar picks it')
    pg.click('text=Back to this week'); pg.wait_for_timeout(300)
    check(card()['title']=='This week','"Back to this week" returns')
    pg.locator('.whit').nth(6).click(); pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/week.png', clip=pg.evaluate("(()=>{const r=[...document.querySelectorAll('.wtitle')].find(x=>/week/i.test(x.textContent)).closest('.card').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:Math.min(r.height,520)}})()"))
    if errs: fails.append('errors '+str(errs))
finally: srv.terminate()
print('FAILED: '+'; '.join(fails) if fails else 'ALL PASSED')
