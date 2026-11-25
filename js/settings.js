// Athlete settings sheet: heart-rate zones, running-balance flags, cycling model.
const $=id=>document.getElementById(id), ov=$('settings');
const ZNAMES=['Recovery','Aerobic','Tempo','Sub-threshold','Threshold','VO₂ max +'];
import { DEFAULTS } from './defaults.js?v=1795591409';
import * as U from './units.js?v=1795591409';
import { sb } from './main.js?v=1795591409';
import { PHYS, PHYS_LABEL, PHYS_UNIT, applyChange, removeChange, todayKey } from './athlete.js?v=1795591409';
export { DEFAULTS };
const FIELDS=['lthrRun','lthrBike','maxHr','restHr','balLo','balHi','balMin','ftp','mass','bikeMass','cda','crr'];
let getCfg=()=>DEFAULTS, onApply=()=>{}, priv=null, draft=null;
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDay=k=>{const [y,m,d]=k.split('-');return `${+d} ${MON[+m-1]} ${y}`};
// dated history of threshold changes, each part removable (applied with the rest on Apply)
function paintHist(){const box=$('s_hist');box.replaceChildren();const h=(draft.history||[]);if(!h.length)return;
  const wrap=document.createElement('div');wrap.className='hist';
  h.slice().sort((a,b)=>(b.from||'').localeCompare(a.from||'')).forEach(e=>{const r=document.createElement('div');r.className='hrow';const t=document.createElement('b');t.textContent=e.from?'From '+fmtDay(e.from):'Before your first change';
    const v=document.createElement('span');v.textContent=PHYS.filter(f=>e[f]!==undefined).map(f=>`${PHYS_LABEL[f]} ${e[f]==null?'not set':f==='mass'?U.toW(e[f])+' '+U.wU():f==='css'?mmssOut(e[f])+' '+PHYS_UNIT[f]:e[f]+' '+PHYS_UNIT[f]}`).join(' · ');
    const x=document.createElement('button');x.type='button';x.className='linkbtn';x.textContent='Remove';x.style.color='var(--text-muted)';
    x.onclick=()=>{draft=removeChange(draft,e.from);PHYS.forEach(f=>{if($('s_'+f))setF(f,draft[f])});preview();paintHist()};r.append(t,v,x);wrap.append(r)});
  const cap=document.createElement('div');cap.className='sec';cap.style.cssText='font-size:12px;font-weight:600;margin-top:12px';cap.textContent='Your changes';box.append(cap,wrap)}
function fillZoneTable(z,lr,lb){const t=$('ztable');t.replaceChildren();const h=t.insertRow();['Zone','From (% threshold HR)','Run bpm','Bike bpm'].forEach(x=>{const th=document.createElement('th');th.textContent=x;h.append(th)});
  ZNAMES.forEach((n,i)=>{const r=t.insertRow();r.insertCell().textContent=`Z${i+1} ${n}`;const c=r.insertCell();
    if(i===0)c.textContent='0';else{const inp=document.createElement('input');inp.type='number';inp.step='1';inp.value=z[i-1];inp.dataset.zi=i-1;inp.oninput=preview;c.append(inp)}
    const bpm=(L)=>i===0?`< ${Math.round(z[0]/100*L)}`:i===5?`≥ ${Math.round(z[4]/100*L)}`:`${Math.round(z[i-1]/100*L)}–${Math.round(z[i]/100*L)-1}`;
    r.insertCell().textContent=bpm(lr);r.insertCell().textContent=bpm(lb);});}
let was=null;
const WF=['mass','bikeMass'], isLb=()=>$('s_units').value==='imperial';
const setF=(f,v)=>{const e=$('s_'+f);if(!e)return;e.value=v==null||v===''?'':f==='css'?mmssOut(v):WF.includes(f)&&isLb()?Math.round(v/U.LB*10)/10:v;
  // weights shown in lb are rounded: remember the stored kg so an untouched box saves exactly what was there (no phantom weight change)
  if(WF.includes(f)){e.dataset.kg=v==null?'':v;e.dataset.shown=e.value}};
// swim threshold typed as m:ss per 100 m, stored as seconds
export const mmssIn=v=>{v=String(v||'').trim();if(!v)return null;const m=v.match(/^(\d{1,2})[:.](\d{1,2})$/);const s=m?+m[1]*60+ +m[2]:/^\d+$/.test(v)?+v:NaN;return s>0&&s<=3600?s:NaN};
const mmssOut=s=>s==null||s===''?'':`${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`;
function readForm(){const o={};FIELDS.forEach(f=>{const e=$('s_'+f),v=e.value;o[f]=v===''?null:WF.includes(f)&&e.dataset.shown===v&&e.dataset.kg!==''?+e.dataset.kg:WF.includes(f)&&isLb()?Math.round(+v*U.LB*100)/100:+v});o.css=mmssIn($('s_css').value);o.zones=[...document.querySelectorAll('#ztable input')].map(i=>+i.value);return o}
function preview(){const o=readForm(),c=getCfg();fillZoneTable(o.zones,o.lthrRun||c.lthrRun,o.lthrBike||c.lthrBike);}
function fillPriv(){if(!priv)return;const p=priv.get()||{};$('p_name').value=p.display_name||'';$('p_handle').value=p.handle||'';hState='ok';$('p_handleMsg').textContent=p.handle?'Your profile link: triven.fit/'+p.handle:'';$('p_handleMsg').className='hmsg';$('p_defvis').value=p.default_visibility||'club';$('p_search').checked=p.searchable!==false;$('p_approve').checked=!!p.approve_followers;$('p_approveRow').hidden=!$('p_search').checked;$('p_audience').value=(p.searchable===false&&(p.feed_audience||'everyone')==='everyone')?'followers_clubs':(p.feed_audience||'everyone');audOpt()}
function audOpt(){const hid=!$('p_search').checked,o=$('p_audience').querySelector('option[value=everyone]');o.disabled=hid;if(hid&&$('p_audience').value==='everyone')$('p_audience').value='followers_clubs'}
function openSheet(cfg){draft={...cfg};$('s_from').value=todayKey();$('s_from').max=todayKey();document.querySelector('input[name=s_when][value=date]').checked=true;paintHist();fillPriv();$('s_units').value=was=cfg.units||'metric';unitLabels();$('s_dob').value=cfg.dob||'';$('s_dob').max=todayKey();showAge();FIELDS.forEach(f=>setF(f,cfg[f]));setF('css',cfg.css);$('s_tt400').value=$('s_tt200').value='';$('s_cssCalc').textContent='';fillZoneTable(cfg.zones,cfg.lthrRun,cfg.lthrBike);const e=$('formerr');if(e)e.textContent='';ov.classList.add('open');ov.scrollTop=0;ov.querySelector('.sheet')?.scrollTo?.(0,0)}
function alertBox(msg){let n=$('formerr');if(!n){n=document.createElement('div');n.id='formerr';n.className='note';n.style.color='var(--warn-ink)';document.querySelector('.sheet .actions').before(n)}n.textContent=msg}
let hState='ok',hTimer=null;
function watchHandle(){const i=$('p_handle'),m=$('p_handleMsg');i.oninput=()=>{const v=i.value.trim().toLowerCase();clearTimeout(hTimer);const mine=priv?.get()?.handle;
  if(v===mine){hState='ok';m.className='hmsg';m.textContent='Your profile link: triven.fit/'+v;return}
  if(!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(v)||/^[0-9]+$/.test(v)){hState='invalid';m.className='hmsg bad';m.textContent='3–30 letters, numbers, - or _';return}
  hState='wait';m.className='hmsg';m.textContent='Checking…';
  hTimer=setTimeout(async()=>{const r=await sb.rpc('check_handle',{h:v});if(i.value.trim().toLowerCase()!==v)return;hState=r.error?'invalid':r.data;
    m.className='hmsg '+(hState==='ok'?'good':'bad');m.textContent=hState==='ok'?'Available: triven.fit/'+v:hState==='taken'?'Taken':r.error?r.error.message:'That one isn’t allowed'},300)}}
// age from date of birth (stored as settings.dob, YYYY-MM-DD; shown only to you)
export const ageOn=(dob,day=todayKey())=>{if(!dob)return null;const[y,m,d]=dob.split('-').map(Number),[Y,M,D]=day.split('-').map(Number);return Y-y-((M<m||(M===m&&D<d))?1:0)};
function showAge(){const a=ageOn($('s_dob').value);$('s_age').textContent=a!=null&&a>=0&&a<120?`Age ${a}. Only you see this.`:'Only you see this.'}
function unitLabels(){document.querySelectorAll('#settings .wunit').forEach(s=>s.textContent=isLb()?'lb':'kg')}
export function initSettings(get,apply,privacy){watchHandle();
  // CSS from a 400 m and a 200 m time trial
  const tt=()=>{const a=mmssIn($('s_tt400').value),b=mmssIn($('s_tt200').value),m=$('s_cssCalc');if(!(a>0&&b>0)){m.textContent='';return}
    if(a<=b){m.className='hmsg bad';m.textContent='The 400 m should take longer than the 200 m.';return}
    const c=(a-b)/2;$('s_css').value=mmssOut(c);m.className='hmsg good';m.textContent=`CSS ${mmssOut(c)} /100 m, filled in above.`};
  $('s_tt400').oninput=$('s_tt200').oninput=tt;$('s_dob').oninput=showAge;
  // switching units converts the weights already in the boxes
  $('s_units').onchange=()=>{const now=$('s_units').value;WF.forEach(f=>{const i=$('s_'+f);if(i.value===''||!was||was===now)return;if(i.dataset.shown===i.value&&i.dataset.kg!==''){i.value=now==='imperial'?Math.round(+i.dataset.kg/U.LB*10)/10:+i.dataset.kg;i.dataset.shown=i.value}else i.value=now==='imperial'?Math.round(+i.value/U.LB*10)/10:Math.round(+i.value*U.LB*10)/10});was=now;unitLabels()};
  getCfg=()=>Object.assign({},DEFAULTS,get()||{}); onApply=apply; priv=privacy||null;
  $('p_search').onchange=()=>{$('p_approveRow').hidden=!$('p_search').checked;audOpt()};
  ['s_lthrRun','s_lthrBike'].forEach(id=>$(id).addEventListener('input',preview));
  $('openSettings').onclick=()=>openSheet(getCfg());
  $('closeSettings').onclick=$('setX').onclick=()=>ov.classList.remove('open');
  $('openSettings').addEventListener('click',()=>{$('setWelcome').hidden=true});
  ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('open')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')ov.classList.remove('open')});
  $('resetSettings').onclick=()=>openSheet(DEFAULTS);
  $('saveSettings').onclick=()=>{const o=readForm();const z=o.zones;
    if(!(z.every((v,i)=>i===0||v>z[i-1]))){alertBox('Zone boundaries must increase from Z2 to Z6.');return}
    if(!(o.balLo<50&&o.balHi>50)){alertBox('Balance thresholds must sit either side of 50%.');return}
    if(Number.isNaN(o.css)||(o.css!=null&&(o.css<50||o.css>300))){alertBox('Swim threshold: enter a pace per 100 m between 0:50 and 5:00, like 1:45.');return}
    const patch=Object.fromEntries(Object.entries(o).filter(([k,v])=>v!=null||k==='ftp'||k==='css'));
    const when=document.querySelector('input[name=s_when]:checked').value, from=when==='all'?null:($('s_from').value||todayKey());
    const cfg=Object.assign(applyChange(draft,patch,from),{massSet:true,units:$('s_units').value,dob:$('s_dob').value||null});
    if(priv&&$('p_handle').value.trim().toLowerCase()!==(priv.get()?.handle||'')&&hState!=='ok'){alertBox(hState==='taken'?'That username is taken. Pick another.':hState==='wait'?'Still checking the username. Try again in a moment.':'Usernames are 3–30 letters, numbers, - or _, and can’t be only numbers.');$('p_handle').focus();return}
    if(priv){const p=priv.get()||{},n=$('p_name').value.trim();const upd={handle:$('p_handle').value.trim().toLowerCase()||p.handle,display_name:n||p.display_name,default_visibility:$('p_defvis').value,searchable:$('p_search').checked,approve_followers:$('p_search').checked&&$('p_approve').checked,feed_audience:$('p_audience').value,privacy_set:true};
      if(Object.keys(upd).some(k=>upd[k]!==p[k]))priv.save(upd);}
    ov.classList.remove('open');onApply(cfg);};
}

// first sign-in: settings with a welcome note at the top (saving marks the privacy choice as made)
export function openWelcome(){openSheet(getCfg());document.querySelector('input[name=s_when][value=all]').checked=true;$('setWelcome').hidden=false;$('p_name').focus();ov.scrollTop=0}
