import os
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
FIT=os.environ.get('TRIVEN_FIT',os.path.join(DEV,'fixtures','multisport.fit'))
import subprocess,time,json,base64
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8782'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
FIT=FIT;U='http://localhost:8782/site/index.html'
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950})
    errs=[];pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)+' '+(e.stack or '')[:400]))
    pg.goto(U);pg.wait_for_timeout(1500)
    # sync: a file waiting in the inbox (as the server would leave it)
    b64=base64.b64encode(open(FIT,'rb').read()).decode()
    pg.evaluate("""b64=>{const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));__files['activity-files/u1/inbox/intervals-i99.fit#blob']=new Blob([bin]);__files['activity-files/u1/inbox/intervals-i99.fit']='x';
      __db.sync_inbox.push({id:'ib1',owner:'u1',provider:'intervals',external_id:'i99',name:'Evening Duathlon',start_time:new Date().toISOString(),file_path:'u1/inbox/intervals-i99.fit',status:'new',attempts:0,created_at:new Date(Date.now()-20*60e3).toISOString()})}""", b64)
    pg.evaluate("(async()=>{const s=document.querySelector('script[type=module]').src;const m=await import('/site/js/sync.js?v='+s.split('v=')[1]);window.__n=await m.processInbox();})()");pg.wait_for_timeout(5000)
    print('inbox', json.dumps({k:pg.evaluate("__db.sync_inbox[0]")[k] for k in ['status','error','activity_id']}), 'acts', pg.evaluate("__db.activities.map(a=>a.source+':'+a.name+':'+JSON.stringify(a.summary.external))"))
    aid=pg.evaluate("__db.activities[0].id")
    # lap average pace vs lap table
    pg.goto(U+'#a/'+aid);pg.wait_for_timeout(2500)
    if pg.locator('tr.lap').count():
     pg.click('tr.lap >> nth=0');pg.wait_for_timeout(800)
     print('lap row', pg.inner_text('tr.lap >> nth=0').replace('\t',' | ').replace('\n',' ')[:120])
     print('chart avgs', pg.evaluate("[...document.querySelectorAll('#charts .chart')].map(c=>c.querySelector('.t').firstChild.textContent+': '+c.querySelector('.cur').dataset.avg).join(' | ')"))
    # settings connect form
    pg.goto(U+'#feed');pg.wait_for_timeout(2000)
    if not pg.locator('#settings.open').count(): pg.click('#openSettings');pg.wait_for_timeout(800)
    print('conn box', pg.inner_text('#connBox')[:160].replace('\n',' | '))
    pg.fill('#connBox input[type=text]','i123456');pg.fill('#connBox input[type=password]','abcdefghijklmnop');pg.click('#connBox button.btn.primary');pg.wait_for_timeout(1500)
    print('after connect', pg.inner_text('#connBox')[:160].replace('\n',' | '), 'invoked', json.dumps(pg.evaluate("window.__invoked")))
    print('ERRORS',errs)
finally: srv.terminate()
