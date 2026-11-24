// Activity view: charts, map, zones, FTP, running balance, laps. Mounted with one activity at a time.
import { deviceLabel } from './garmin.js?v=1795526551';
import { srcText } from './athlete.js?v=1795526551';
import * as U from './units.js?v=1795526551';
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let bound=false;
export function mountActivity(raw,cfgIn,saveCfg){
const F=raw.recordFields, S=raw.sessions, L=raw.laps;

// ---------- settings ----------
const DEFAULTS={lthrRun:S[0].lthr||163,lthrBike:(S[0].lthr||163)-5,maxHr:S[0].maxHrSet||175,restHr:50,
  zones:[85,90,95,100,103], balLo:48.5, balHi:51.5, balMin:10, ftp:null, mass:78.4, bikeMass:9, cda:0.27, crr:0.004};
const ZNAMES=['Recovery','Aerobic','Tempo','Sub-threshold','Threshold','VO₂ max +'];
let CFG=Object.assign({},DEFAULTS,cfgIn||{});
// weight on the day (from the watch file) beats today's weight in Settings
const MASS=()=>raw.meta.weight||CFG.mass;

// ---------- records ----------
const ENVN={treadmill:'Treadmill',track:'Track',trail:'Trail',indoor:'Indoor',virtual:'Virtual'};const NAMES=[]; let rc=0,tc=0; let sc=0; const nRun=S.filter(s=>s.sport==='running').length; S.forEach(s=>{ const pre=ENVN[s.env]?ENVN[s.env]+' ':''; if(s.sport==='running') NAMES.push(pre+(pre?'run':'Run')+(nRun>1?' '+(++rc):'')); else if(s.sport==='cycling') NAMES.push(pre+(pre?'bike':'Bike')); else if(s.sport==='swimming') NAMES.push(++sc>1?'Swim '+sc:'Swim'); else if(s.sport==='transition') NAMES.push('T'+(++tc)); else NAMES.push('Workout') });
const segOf=t=>{for(let i=S.length-1;i>=0;i--) if(t>=S[i].start-0.5) return i; return 0};
const R=raw.records.map(a=>{const o={};F.forEach((k,i)=>o[k]=a[i]);o.seg=segOf(o.t);o.sport=S[o.seg].sport;return o});
R.forEach(r=>{const run=r.sport==='running';
  r.spm=run&&r.cad>20?r.cad*2:null; r.pw=run&&r.power>0?r.power:null; r.gct=run&&r.gct>0?r.gct:null;
  r.bal=run&&r.gctBal>0&&(r.t-S[r.seg].start)>=15?r.gctBal:null; r.vo=run&&r.vo>0?r.vo/10:null; r.kmh=r.speed!=null?r.speed*3.6:null;});
// stride length: the watch's own figure (running dynamics) when recorded, otherwise speed ÷ step rate
const STRIDE_REC=R.some(r=>r.sport==='running'&&r.stride>0);
R.forEach((r,i)=>{const w=R.slice(Math.max(0,i-2),i+3).filter(x=>x.seg===r.seg&&x.kmh!=null);r.kmhS=w.length?d3.mean(w,x=>x.kmh):null;
  {const sm=r.sport!=='running'?null:STRIDE_REC?(r.stride>0?r.stride/1000:null):(()=>{const c=w.filter(x=>x.spm>100);return r.kmhS>5&&c.length?r.kmhS/3.6*60/d3.mean(c,x=>x.spm):null})();
   r.strideU=sm==null||sm>3?null:U.imperial()?sm/U.FT:sm;}
  r.pace=r.sport==='running'&&r.kmhS>5?60/U.kmhTo(r.kmhS):null; r.spdU=U.kmhTo(r.kmhS); r.altU=r.alt!=null?U.toE(r.alt):null;
  r.brk=i>0&&(r.t-R[i-1].t>10||r.seg!==R[i-1].seg);});
// grade-adjusted pace (runs, outdoors): Minetti's energy cost of running at grade g, J/kg/m (3.6 on the flat), with the
// grade over ±15 s; GAP is the pace on the flat that costs the same. Treadmill and track legs are flat by definition.
const COST=g=>{g=Math.max(-0.45,Math.min(0.45,g));return 155.4*g**5-30.4*g**4-43.3*g**3+46.3*g**2+19.5*g+3.6};
R.forEach((r,i)=>{r.gapF=null;r.gap=null;const env=S[r.seg]?.env;
  if(r.sport!=='running'||r.alt==null||r.dist==null||!(r.kmhS>5)||env==='treadmill'||env==='track')return;
  let j=i,k=i;while(j>0&&R[j-1].seg===r.seg&&r.t-R[j-1].t<=15)j--;while(k<R.length-1&&R[k+1].seg===r.seg&&R[k+1].t-r.t<=15)k++;
  const a=R[j],b=R[k];if(a.alt==null||b.alt==null||a.dist==null||b.dist==null)return;const dd=b.dist-a.dist;if(dd<15)return;
  r.gapF=COST((b.alt-a.alt)/dd)/3.6;r.gap=r.pace/r.gapF;});
const HAS_GAP=R.some(r=>r.gap!=null);
// average GAP over records: flat-equivalent distance over time (speed in m/s)
function gapOf(rs){let d=0,t=0;for(let i=1;i<rs.length;i++){const r=rs[i];if(r.gapF==null||rs[i-1].seg!==r.seg)continue;const dt=Math.min(10,r.t-rs[i-1].t);if(dt<=0)continue;d+=r.kmhS/3.6*r.gapF*dt;t+=dt}
  return d>0&&t>60?fmtPace(paceOf(d/t))+' '+U.pU():null}
const recsIn=o=>R.filter(r=>r.t>=o.start&&r.t<o.start+o.elapsed);
// balance smoothed over ~10 s (time-based)
R.forEach((r,i)=>{ if(r.bal==null){r.balS=null;return} let s=0,n=0; for(let j=i;j>=0&&R[j].t>=r.t-5;j--){if(R[j].seg===r.seg&&R[j].bal!=null){s+=R[j].bal;n++}} for(let j=i+1;j<R.length&&R[j].t<=r.t+5;j++){if(R[j].seg===r.seg&&R[j].bal!=null){s+=R[j].bal;n++}} r.balS=s/n;});

// ---------- formatting ----------
const fmtDur=s=>{s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`:`${m}:${String(x).padStart(2,'0')}`};
const fmtPace=v=>{if(v==null)return '–';const m=Math.floor(v),s=Math.round((v-m)*60);return s===60?`${m+1}:00`:`${m}:${String(s).padStart(2,'0')}`};
const paceOf=ms=>ms>0?U.perUnit()/ms/60:null, km=m=>U.toD(m).toFixed(2);   // pace in min per km or mile
const colorOf=sp=>css(sp==='running'?'--run':sp==='cycling'?'--bike':sp==='swimming'?'--swim':'--trans');
const balTxt=v=>`${v.toFixed(1)}% L / ${(100-v).toFixed(1)}% R`;
const t0=new Date(raw.meta.start), local=new Date(t0.getTime()+raw.meta.utcOffsetH*3600e3);
const wk=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
document.getElementById('subline').textContent=`${wk[local.getUTCDay()]} ${local.getUTCDate()} ${mo[local.getUTCMonth()]} ${local.getUTCFullYear()} · ${String(local.getUTCHours()).padStart(2,'0')}:${String(local.getUTCMinutes()).padStart(2,'0')} ${raw.meta.device?' · '+deviceLabel(raw.meta.device):''}`;
const total={elapsed:d3.sum(S,s=>s.elapsed),dist:d3.sum(S,s=>s.dist),cal:d3.sum(S,s=>s.cal),ascent:d3.sum(S,s=>s.ascent),
  avgHr:Math.round(d3.sum(S,s=>s.avgHr?s.avgHr*s.elapsed:0)/(d3.sum(S,s=>s.avgHr?s.elapsed:0)||1))||null,maxHr:d3.max(S,s=>s.maxHr)||null};
const tEnd=total.elapsed;

// ---------- derived: zones, balance flags, bike power ----------
const lthrFor=sp=>sp==='cycling'?CFG.lthrBike:CFG.lthrRun;
function zoneOf(hr,sp){const f=hr/lthrFor(sp)*100; let z=0; CFG.zones.forEach((b,i)=>{if(f>=b) z=i+1}); return z;}
function zoneBpm(i,sp){const L=lthrFor(sp),b=CFG.zones; if(i===0) return `< ${Math.round(b[0]/100*L)}`; if(i===5) return `≥ ${Math.round(b[4]/100*L)}`; return `${Math.round(b[i-1]/100*L)}–${Math.round(b[i]/100*L)-1}`;}

let FLAGS=[];
function computeFlags(){
  FLAGS=[]; let cur=null;
  const close=()=>{ if(cur&&cur.t1-cur.t0>=CFG.balMin) FLAGS.push(cur); cur=null; };
  R.forEach((r,i)=>{
    const out=r.balS!=null&&(r.balS<CFG.balLo||r.balS>CFG.balHi);
    const side=r.balS!=null?(r.balS<50?'R':'L'):null;
    if(out){
      if(cur&&cur.side===side&&cur.seg===r.seg&&r.t-cur.t1<=10){cur.t1=r.t;cur.vals.push(r.balS)}
      else{close();cur={t0:r.t,t1:r.t,side,seg:r.seg,vals:[r.balS]}}
    } else if(cur&&(r.t-cur.t1>10||r.seg!==cur.seg)) close();
  }); close();
  FLAGS.forEach(f=>f.avg=d3.mean(f.vals));
}

let BIKE=null;
function computeBike(){
  const bi=S.findIndex(s=>s.sport==='cycling'); if(bi<0){BIKE=null;return}
  const recs=R.filter(r=>r.seg===bi); if(recs.length<2){BIKE=null;return} const has=recs.some(r=>r.power>0);
  const T0=recs[0].t,T1=recs[recs.length-1].t, n=Math.floor(T1-T0)+1;
  const interp=key=>{const out=new Float64Array(n);let j=0;for(let k=0;k<n;k++){const t=T0+k;while(j<recs.length-2&&recs[j+1].t<t)j++;const a=recs[j],b=recs[j+1]||a;const va=a[key]??0,vb=b[key]??va;const f=b.t>a.t?Math.min(1,Math.max(0,(t-a.t)/(b.t-a.t))):0;out[k]=va+(vb-va)*f}return out};
  const roll=(x,w)=>{const o=new Float64Array(x.length),h=Math.floor(w/2);let s=0,q=[];const pre=new Float64Array(x.length+1);for(let i=0;i<x.length;i++)pre[i+1]=pre[i]+x[i];for(let i=0;i<x.length;i++){const a=Math.max(0,i-h),b=Math.min(x.length,i+w-h);o[i]=(pre[b]-pre[a])/(b-a)}return o};
  let P, estimated=!has;
  const hr=interp('hr');
  if(has){ P=interp('power'); }
  else{
    const v=roll(interp('speed'),5), alt=roll(interp('alt'),61), dist=interp('dist');
    const m=MASS()+CFG.bikeMass, rho=1.19, eta=0.975, g=9.81;
    const grade=new Float64Array(n); for(let k=0;k<n;k++){const a=Math.max(0,k-30),b=Math.min(n-1,k+30);const dd=dist[b]-dist[a];grade[k]=dd>40?Math.max(-0.06,Math.min(0.06,(alt[b]-alt[a])/dd)):0}
    P=new Float64Array(n);
    for(let k=0;k<n;k++){const acc=k>0&&k<n-1?(v[k+1]-v[k-1])/2:0;const th=Math.atan(grade[k]);
      P[k]=Math.max(0,(m*g*v[k]*(CFG.crr*Math.cos(th)+Math.sin(th))+0.5*rho*CFG.cda*v[k]**3+m*acc*v[k])/eta);}
  }
  const pre=new Float64Array(n+1); for(let i=0;i<n;i++)pre[i+1]=pre[i]+P[i];
  const best=w=>{if(w>n) return null; let b=0; for(let i=0;i+w<=n;i++){const a=(pre[i+w]-pre[i])/w; if(a>b)b=a} return b};
  const durs=[[1,'1s'],[5,'5s'],[10,'10s'],[30,'30s'],[60,'1m'],[300,'5m'],[600,'10m'],[1200,'20m'],[1800,'30m'],[3600,'1h']];
  const curve=durs.map(([w,l])=>({w,l,p:best(w)}));
  const avgP=pre[n]/n, avgHr=d3.mean(hr);
  const b20=best(1200);
  const hrFrac=avgHr/CFG.lthrBike;
  const ftpHr=hrFrac>0.8&&n>=1200?avgP/hrFrac:null;      // steady-effort method
  const ftp20=b20?b20*0.95:null;                             // classic 20-min method
  const est = has ? (ftp20) : (ftpHr ?? ftp20);
  const p30=roll(P,30); recs.forEach(r=>{const k=Math.round(r.t-T0); r.bpw=p30[Math.max(0,Math.min(n-1,k))]});
  BIKE={bi,has,estimated,curve,avgP,avgHr,hrFrac,ftpHr,ftp20,est,dur:n};
}

// ---------- selection ----------
let sel={kind:'all'};
const range=()=>sel.kind==='seg'?[S[sel.i].start,S[sel.i].start+S[sel.i].elapsed]:sel.kind==='lap'?[L[sel.i].start,L[sel.i].start+L[sel.i].elapsed]:sel.kind==='span'?[sel.t0,sel.t1]:[0,tEnd];
const selSport=()=>sel.kind==='seg'?S[sel.i].sport:sel.kind==='lap'?L[sel.i].sport:sel.kind==='span'?S[sel.seg].sport:S.every(s=>s.sport===S[0].sport)?S[0].sport:'multi';   // a single-sport activity charts as that sport
const MULTI=S.length>1, WHOLE=MULTI?'race':({running:'run',cycling:'ride',swimming:'swim'}[S[0].sport]||'activity');
const selLabel=()=>sel.kind==='all'?'the whole '+WHOLE:sel.kind==='seg'?NAMES[sel.i]:sel.kind==='lap'?'lap '+(sel.i+1):'this flagged stretch';

// swim pace per 100 m, on time spent swimming when the watch recorded lengths (rest excluded)
const p100=(secs,dist)=>{if(!(dist>0)||!(secs>0))return '–';const s=Math.round(secs/dist*100);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
function swimItems(o,isAll){const t=o.swimTime||o.timer||o.elapsed;const it=[[fmtDur(t),o.swimTime?'Swim time':'Time'],[o.dist<10000?Math.round(o.dist).toLocaleString()+' m':km(o.dist)+' '+U.dU(),'Distance'],[p100(t,o.dist)+' /100 m','Avg pace'+(o.swimTime?' (swimming)':'')]];
  if(o.swimTime&&o.elapsed-o.swimTime>5) it.push([fmtDur(o.elapsed-o.swimTime),'Rest · total '+fmtDur(o.elapsed)]);
  if(o.avgHr) it.push([o.avgHr+' bpm','Avg HR'+(o.maxHr?' · max '+o.maxHr:'')]);
  if(o.swolf) it.push([Math.round(o.swolf),'Avg SWOLF']);
  return it.slice(0,6)}
function statItems(){
  if(sel.kind==='all'&&!MULTI&&S[0].sport==='swimming') return swimItems({...S[0],avgHr:total.avgHr,maxHr:total.maxHr},true);
  if(sel.kind==='all') return [[fmtDur(total.elapsed),'Total time'],[U.dist(total.dist),'Distance'],(S.some(s=>s.sport==='transition')?[fmtDur(d3.sum(S.filter(s=>s.sport==='transition'),s=>s.elapsed)),'Transitions']:(S.every(s=>s.sport==='running')?[fmtPace(paceOf(total.dist/total.elapsed))+' '+U.pU(),'Avg pace']:[U.speed(total.elapsed,total.dist),'Avg speed'])),...(S.every(s=>s.sport==='running')&&HAS_GAP&&gapOf(R)?[[gapOf(R),'Grade-adjusted pace']]:[]),
    ...(total.avgHr?[[total.avgHr+' bpm','Avg HR'+(total.maxHr?' · max '+total.maxHr:'')]]:[]),...(total.ascent||R.length?[[U.elev(total.ascent||0),'Elevation gain'+(R.length?' (watch)':'')]]:[]),...(total.cal?[[total.cal+' kcal','Energy']]:[])];
  if(sel.kind==='span'){const [a,b]=range();const rs=R.filter(r=>r.t>=a&&r.t<=b);
    return [[fmtDur(b-a),'Duration'],[(v=>`${v.toFixed(1)} / ${(100-v).toFixed(1)}`)(d3.mean(rs.filter(r=>r.bal!=null),r=>r.bal)),'GCT balance L / R %'],[fmtPace(60/U.kmhTo((((d=>d.length>1?(d[d.length-1].dist-d[0].dist)/((d[d.length-1].t-d[0].t)||1):d3.mean(rs,r=>r.kmh)/3.6)(rs.filter(r=>r.dist!=null)))*3.6)))+' '+U.pU(),'Pace'],[Math.round(d3.mean(rs,r=>r.hr))+' bpm','Avg HR'],[Math.round(d3.mean(rs.filter(r=>r.gct),r=>r.gct))+' ms','Ground contact'],[Math.round(d3.mean(rs.filter(r=>r.spm),r=>r.spm))+' spm','Cadence']];}
  const o=sel.kind==='seg'?S[sel.i]:L[sel.i], sp=o.sport;
  if(sp==='swimming'&&sel.kind==='seg') return swimItems(o);
  if(sp==='swimming') return [[fmtDur(o.elapsed),'Time'],[Math.round(o.dist)+' m','Distance'],[p100(o.elapsed,o.dist)+' /100 m','Pace'],...(o.avgHr?[[o.avgHr+' bpm','Avg HR']]:[])];
  const it=[[fmtDur(o.elapsed),'Time'],[sp==='transition'?Math.round(o.dist)+' m':km(o.dist)+' '+U.dU(),'Distance']];
  it.push(sp==='running'?[fmtPace(paceOf(o.avgSpeed))+' '+U.pU(),'Avg pace']:[U.speedMs(o.avgSpeed),'Avg speed']);
  if(sp==='running'&&HAS_GAP){const g=gapOf(recsIn(o));if(g)it.push([g,'Grade-adjusted pace'])}
  it.push([o.avgHr+' bpm','Avg HR'+(o.maxHr?' · max '+o.maxHr:'')]);
  if(sp==='running'&&o.avgPower) it.push([o.avgPower+' W','Avg run power']);
  if(sp==='running'&&o.avgCad) it.push([o.avgCad*2+' spm','Cadence']);
  if(sp==='cycling'&&BIKE) it.push([Math.round(BIKE.avgP)+' W','Avg power'+(BIKE.estimated?' (est.)':'')]);
  if(o.ascent!=null) it.push([U.elev(o.ascent),'Elevation gain']);
  return it.slice(0,6);
}
function renderStats(){const el=document.getElementById('stats');el.replaceChildren();statItems().forEach(([v,l])=>{const d=document.createElement('div');d.className='stat';const b=document.createElement('b');b.textContent=v;const s=document.createElement('small');s.textContent=l;d.append(b,s);el.append(d)})}

function renderSegbar(){
  const bar=document.getElementById('segbar');bar.replaceChildren();
  // sections and the whole-race/section chips only mean something for multisport
  const head=bar.previousElementSibling,row0=document.getElementById('selrow');
  [head,bar,row0].forEach(e=>{if(e)e.hidden=!MULTI});if(!MULTI)return;
  S.forEach((s,i)=>{const d=document.createElement('div');d.className='seg'+(s.sport==='transition'?' trans':'')+(sel.kind==='seg'&&sel.i===i?' sel':'');
    d.style.flex=s.sport==='transition'?'0 0 22px':String(s.elapsed);d.style.background=colorOf(s.sport);d.title=`${NAMES[i]} · ${fmtDur(s.elapsed)}`;
    if(s.sport!=='transition'){const n=document.createElement('div');n.className='n';n.textContent=`${NAMES[i]}  ${fmtDur(s.elapsed)}`;
      const v=document.createElement('div');v.className='v';v.textContent=s.sport==='running'?`${km(s.dist)} ${U.dU()} · ${fmtPace(paceOf(s.avgSpeed))}${U.pU()}`:`${km(s.dist)} ${U.dU()} · ${U.speedMs(s.avgSpeed)}`;d.append(n,v);}
    d.onclick=()=>select(sel.kind==='seg'&&sel.i===i?{kind:'all'}:{kind:'seg',i});bar.append(d);});
  const row=document.getElementById('selrow');row.replaceChildren();
  const mk=(txt,on,fn)=>{const b=document.createElement('button');b.className='chip';b.textContent=txt;b.setAttribute('aria-pressed',on);b.onclick=fn;row.append(b)};
  mk('Whole race',sel.kind==='all',()=>select({kind:'all'}));
  S.forEach((s,i)=>mk(`${NAMES[i]} ${fmtDur(s.elapsed)}`,sel.kind==='seg'&&sel.i===i,()=>select({kind:'seg',i})));
  if(sel.kind==='lap'||sel.kind==='span'){const sp=document.createElement('span');sp.className='muted';sp.textContent=sel.kind==='lap'?`Lap ${sel.i+1} selected`:`Flagged stretch ${fmtDur(sel.t0)}–${fmtDur(sel.t1)} selected`;row.append(sp)}
}

// ---------- map ----------
let mapMarker,mapProj,moveCursorMap=()=>{},hideCursorMap=()=>{};
let lmap=null;
// street map (Leaflet + CARTO tiles) when available; the SVG drawing below is the fallback
function renderMap(){
  if(window.L){try{return renderLeaflet()}catch(e){console.warn('map',e)}}
  return renderSvgMap();
}
function renderLeaflet(){
  const LF=window.L;
  const host=document.getElementById('mapsvg');const note=document.getElementById('mapnote');if(note)note.hidden=true;
  const pts=R.filter(r=>r.lat!=null);
  const card=host.closest('.card');if(card)card.hidden=!pts.length&&S.every(s=>s.sport==='transition'||['treadmill','indoor','virtual','pool'].includes(s.env));
  if(!pts.length){if(lmap){lmap.remove();lmap=null}host.replaceChildren(Object.assign(document.createElement('div'),{className:'note',textContent:'No GPS in this activity (indoor or pool).'}));return}
  let div=document.getElementById('lmap');
  if(!div||!lmap||lmap._raw!==raw){if(lmap){lmap.remove();lmap=null}host.replaceChildren();div=document.createElement('div');div.id='lmap';host.append(div);
    const isDark=matchMedia('(prefers-color-scheme: dark)').matches;
    lmap=LF.map(div,{zoomControl:true,attributionControl:false,scrollWheelZoom:false});LF.control.attribution({prefix:'<a href="https://leafletjs.com">Leaflet</a>'}).addTo(lmap);lmap._raw=raw;
    const ESRI='https://server.arcgisonline.com/ArcGIS/rest/services/',att='Esri, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    const base=LF.tileLayer(ESRI+`Canvas/${isDark?'World_Dark_Gray_Base':'World_Light_Gray_Base'}/MapServer/tile/{z}/{y}/{x}`,{maxNativeZoom:16,maxZoom:19,attribution:att}).addTo(lmap);
    const sat=LF.tileLayer(ESRI+'World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:18,maxZoom:19,attribution:'Esri, Maxar, Earthstar Geographics'});
    const terrain=LF.tileLayer(ESRI+'World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:18,maxZoom:19,attribution:'Esri, HERE, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors'});
    const topo=LF.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{subdomains:'abc',maxNativeZoom:17,maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM · style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'});
    LF.control.layers({Map:base,Terrain:terrain,'Topo (contours)':topo,Satellite:sat},null,{position:'topright'}).addTo(lmap);
    // the 400 m track the run was snapped to
    S.forEach(s=>{if(s.trackOval)LF.polyline(s.trackOval,{color:isDark?'#c9ccd1':'#8a8f96',weight:9,opacity:.28,interactive:false}).addTo(lmap)});
    lmap._layers2=LF.layerGroup().addTo(lmap);
    const cur=LF.circleMarker([0,0],{radius:7,color:css('--surface-1'),weight:3,fillColor:css('--cursor'),fillOpacity:1});
    moveCursorMap=r=>{cur.setLatLng([r.lat,r.lon]);if(!lmap.hasLayer(cur))cur.addTo(lmap)};hideCursorMap=()=>{if(lmap&&lmap.hasLayer(cur))lmap.removeLayer(cur)};
    const sub=pts.filter((p,i)=>i%2===0);
    lmap.on('mousemove',e=>{const q=lmap.latLngToLayerPoint(e.latlng);let best=null,bd=900;for(const p of sub){const pp=lmap.latLngToLayerPoint([p.lat,p.lon]);const d=(pp.x-q.x)**2+(pp.y-q.y)**2;if(d<bd){bd=d;best=p}}best?setCursor(best):setCursor(null)});
    lmap.on('mouseout',()=>setCursor(null));
    setTimeout(()=>lmap.invalidateSize(),50);
  }
  const g=lmap._layers2;g.clearLayers();
  const [a,b]=range(),dim=sel.kind!=='all';
  const rank={cycling:0,running:1,swimming:1,transition:2};
  [...S.keys()].sort((i,j)=>(rank[S[i].sport]??1)-(rank[S[j].sport]??1)).forEach(i=>{
    const seg=pts.filter(p=>p.seg===i).map(p=>[p.lat,p.lon]);if(seg.length<2)return;
    LF.polyline(seg,{color:colorOf(S[i].sport),weight:dim?3:4,opacity:dim?.35:.95}).addTo(g);
    if(dim){const s2=pts.filter(p=>p.seg===i&&p.t>=a&&p.t<=b).map(p=>[p.lat,p.lon]);if(s2.length>1)LF.polyline(s2,{color:colorOf(S[i].sport),weight:5,opacity:1}).addTo(g)}
  });
  FLAGS.forEach(f=>{const s=pts.filter(p=>p.t>=f.t0&&p.t<=f.t1).map(p=>[p.lat,p.lon]);if(s.length>1)LF.polyline(s,{color:css('--warn'),weight:4,dashArray:'2 7'}).addTo(g)});
  LF.circleMarker([pts[0].lat,pts[0].lon],{radius:6,color:css('--text-primary'),weight:2,fillColor:css('--accent'),fillOpacity:1}).bindTooltip('Start').addTo(g);
  const e=pts[pts.length-1];LF.circleMarker([e.lat,e.lon],{radius:6,color:css('--text-primary'),weight:2,fillColor:css('--surface-1'),fillOpacity:1}).bindTooltip('Finish').addTo(g);
  const fit=(dim?pts.filter(p=>p.t>=a&&p.t<=b):pts).map(p=>[p.lat,p.lon]);
  if(fit.length>1)lmap.fitBounds(LF.latLngBounds(fit),{padding:[24,24],maxZoom:17});
}
function renderSvgMap(){
  const W=640,H=420,pad=22, pts=R.filter(r=>r.lat!=null);
  const lat0=d3.mean(pts,p=>p.lat)*Math.PI/180, X=p=>p.lon*Math.cos(lat0), Y=p=>-p.lat;
  const [a,b]=range(); const fit=sel.kind==='all'?pts:pts.filter(p=>p.t>=a&&p.t<=b);
  let [x0,x1]=d3.extent(fit,X),[y0,y1]=d3.extent(fit,Y); const ms=0.003;
  if(x1-x0<ms){const c=(x0+x1)/2;x0=c-ms/2;x1=c+ms/2} if(y1-y0<ms){const c=(y0+y1)/2;y0=c-ms/2;y1=c+ms/2}
  const k=Math.min((W-2*pad)/(x1-x0),(H-2*pad)/(y1-y0)), ox=(W-k*(x1-x0))/2, oy=(H-k*(y1-y0))/2;
  mapProj=p=>[ox+(X(p)-x0)*k, oy+(Y(p)-y0)*k];
  const svg=d3.select('#mapsvg').html('').append('svg').attr('viewBox',`0 0 ${W} ${H}`);
  svg.append('clipPath').attr('id','mclip').append('rect').attr('width',W).attr('height',H).attr('rx',8);
  svg.append('rect').attr('width',W).attr('height',H).attr('rx',8).attr('fill',css('--surface-2'));
  const gm=svg.append('g').attr('clip-path','url(#mclip)');
  const line=d3.line().x(p=>mapProj(p)[0]).y(p=>mapProj(p)[1]);
  const rank={cycling:0,running:1,transition:2}, dim=sel.kind!=='all';
  [...S.keys()].sort((i,j)=>rank[S[i].sport]-rank[S[j].sport]).forEach(i=>{
    const seg=pts.filter(p=>p.seg===i);
    gm.append('path').attr('d',line(seg)).attr('fill','none').attr('stroke',colorOf(S[i].sport)).attr('stroke-width',dim?2:3).attr('stroke-linejoin','round').attr('stroke-linecap','round').attr('opacity',dim?.25:.9);
    if(dim){const s2=seg.filter(p=>p.t>=a&&p.t<=b); if(s2.length>1) gm.append('path').attr('d',line(s2)).attr('fill','none').attr('stroke',colorOf(S[i].sport)).attr('stroke-width',3.5).attr('stroke-linejoin','round').attr('stroke-linecap','round');}
  });
  // flagged balance stretches on the route
  FLAGS.forEach(f=>{const s=pts.filter(p=>p.t>=f.t0&&p.t<=f.t1); if(s.length>1) gm.append('path').attr('d',line(s)).attr('fill','none').attr('stroke',css('--warn')).attr('stroke-width',dim?4:3).attr('stroke-dasharray','2 4').attr('stroke-linecap','round')});
  const st=mapProj(pts[0]);
  gm.append('circle').attr('cx',st[0]).attr('cy',st[1]).attr('r',6).attr('fill',css('--surface-1')).attr('stroke',css('--text-primary')).attr('stroke-width',2);
  gm.append('text').attr('x',st[0]+10).attr('y',st[1]-8).text('Start / finish').attr('font-size',11).attr('fill',css('--text-secondary'));
  const kmPx=k*(1000/111320), IMP=U.imperial(), big=IMP?U.MI:1000, small=IMP?152.4:100, sbm=kmPx*big/1000>W/2?small:big, sbPx=kmPx*sbm/1000;
  const sb=svg.append('g').attr('transform',`translate(${W-pad-sbPx},${H-pad})`);
  sb.append('line').attr('x2',sbPx).attr('stroke',css('--text-secondary')).attr('stroke-width',2);
  sb.append('text').attr('x',sbPx/2).attr('y',-6).attr('text-anchor','middle').attr('font-size',11).attr('fill',css('--text-secondary')).text(sbm===big?(IMP?'1 mi':'1 km'):(IMP?'500 ft':'100 m'));
  svg.append('text').attr('x',pad).attr('y',pad+6).attr('font-size',12).attr('font-weight',600).attr('fill',css('--text-secondary')).text('N ↑');
  mapMarker=svg.append('circle').attr('r',7).attr('fill',css('--cursor')).attr('stroke',css('--surface-1')).attr('stroke-width',2.5).style('display','none');
  moveCursorMap=r=>{const [x,y]=mapProj(r);mapMarker.attr('cx',x).attr('cy',y).style('display',null)};hideCursorMap=()=>mapMarker&&mapMarker.style('display','none');
  const del=d3.Delaunay.from(pts,p=>mapProj(p)[0],p=>mapProj(p)[1]);
  svg.on('pointermove',e=>{const m=svg.node().getScreenCTM().inverse();const pt=svg.node().createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const q=pt.matrixTransform(m);setCursor(pts[del.find(q.x,q.y)])}).on('pointerleave',()=>setCursor(null));
}

// ---------- zones ----------
function renderZones(){
  const [a,b]=range(); const tz=[0,0,0,0,0,0];
  for(let i=1;i<R.length;i++){const r=R[i],p=R[i-1]; if(r.t<a||p.t>b||r.hr==null) continue; tz[zoneOf(r.hr,r.sport)]+=Math.min(r.t-p.t,10);}
  const sum=d3.sum(tz)||1, top=tz.indexOf(d3.max(tz)), sp=selSport();
  const lo=top===0?0:CFG.zones[top-1], hi=top===5?null:CFG.zones[top];
  document.getElementById('focus').textContent=ZNAMES[top];
  document.getElementById('focusline').textContent=`${Math.round(tz[top]/sum*100)}% of ${selLabel()} was in Z${top+1} (${top===0?'below '+hi:hi==null?lo+'+':lo+'–'+(hi-1)}% of threshold HR).`;
  const el=document.getElementById('zones');el.replaceChildren();
  ZNAMES.forEach((zn,i)=>{const row=document.createElement('div');row.className='zrow';
    const l=document.createElement('div');l.className='lbl';const bb=document.createElement('b');bb.textContent=`Z${i+1} ${zn}`;const sm=document.createElement('div');sm.className='muted';
    sm.textContent=sp==='multi'?`R ${zoneBpm(i,'running')} · B ${zoneBpm(i,'cycling')}`:`${zoneBpm(i,sp)} bpm`;l.append(bb,sm);
    const bar=document.createElement('div');bar.className='bar';const f=document.createElement('div');f.style.width=(tz[i]/sum*100)+'%';f.style.background=`var(--z${i+1})`;bar.append(f);
    const v=document.createElement('div');v.className='val';v.textContent=tz[i]>0?`${fmtDur(tz[i])} · ${Math.round(tz[i]/sum*100)}%`:'–';
    row.append(l,bar,v);el.append(row);});
  document.getElementById('znote').textContent=`${selSport()==='multi'?'R = run, B = bike. ':''}Zones use run threshold HR ${CFG.lthrRun} bpm (${srcText(CFG._src?.lthrRun)}) and bike threshold HR ${CFG.lthrBike} bpm (${srcText(CFG._src?.lthrBike)}), the values in effect on this day, applied to every HR sample. Settings keeps a dated history, so changing them later doesn’t alter past activities. ${S[S.length-1].te!=null?`Garmin's own Training Effect: ${S[S.length-1].te} aerobic / ${S[S.length-1].ate} anaerobic.`:''}`;
}

// ---------- FTP card ----------
function renderFtp(){
  const el=document.getElementById('ftpcard');el.replaceChildren();
  const h=document.createElement('h2');h.textContent='Cycling FTP';el.append(h);
  if(!BIKE){el.append(Object.assign(document.createElement('div'),{className:'note',textContent:'No cycling in this activity.'}));return}
  const manual=CFG.ftp>0, ftp=manual?CFG.ftp:BIKE.est;
  const top=document.createElement('div');top.style.marginTop='10px';
  const big=document.createElement('div');big.className='big';big.textContent=ftp?Math.round(ftp):'–';const u=document.createElement('small');u.textContent=`W · ${ftp?(ftp/MASS()).toFixed(2):'–'} W/kg`;big.append(u);
  const pill=document.createElement('span');pill.className='pill';pill.style.marginTop='6px';pill.textContent=manual?(CFG._src?.ftp==='watch'?'FTP on your watch that day':'FTP in Settings that day'):BIKE.has?'From power meter':'Estimate · low confidence';
  top.append(big,pill);el.append(top);
  const kv=document.createElement('div');kv.className='kv';
  const add=(k,v)=>{const a=document.createElement('span');a.className='sec';a.textContent=k;const b=document.createElement('b');b.textContent=v;kv.append(a,b)};
  add(BIKE.estimated?'Avg power (estimated from speed)':'Avg power',Math.round(BIKE.avgP)+' W');
  add('Avg HR vs bike threshold HR',`${Math.round(BIKE.avgHr)} / ${CFG.lthrBike} bpm (${Math.round(BIKE.hrFrac*100)}%)`);
  if(BIKE.ftpHr) add('Method A: avg power ÷ HR fraction',Math.round(BIKE.ftpHr)+' W');
  if(BIKE.ftp20) add('Method B: 95% of best 20 min',Math.round(BIKE.ftp20)+' W');
  el.append(kv);
  const t=document.createElement('table');t.className='pc';const r1=t.insertRow(),r2=t.insertRow();
  BIKE.curve.forEach(c=>{const th=document.createElement('th');th.textContent=c.l;r1.append(th);const td=r2.insertCell();
    const unreliable=BIKE.estimated&&c.w<60; if(c.p==null||unreliable){td.className='na';td.textContent=c.p==null?'—':'n/a'} else td.textContent=Math.round(c.p);});
  const cap=document.createElement('div');cap.className='note';cap.style.marginTop='6px';
  cap.textContent=BIKE.has?'Best power for each duration (W). Method B is the headline FTP.':
   `Best power for each duration (W, estimated). No power meter on this ride, so power is modelled from speed, gradient, weight (${U.toW(MASS())} ${U.wU()} rider${raw.meta.weight?', from your watch that day':''} + ${U.toW(CFG.bikeMass)} ${U.wU()} bike) and riding position, assuming no wind. Under a minute is shown as n/a because speed data is too noisy at that length. Method A is the headline: this ride was steady and below threshold, so Method B gives only a lower bound. A ride with a power meter will replace the estimate.`;
  el.append(t,cap);
}

// ---------- charts ----------
const charts=[]; let xScale;
function chartDefs(){
  const sp=selSport(), d=[{key:'altU',title:'Elevation',unit:U.eU(),fmt:v=>v.toFixed(0),area:true}];
  d.push(sp==='running'?{key:'pace',title:'Pace',unit:U.pU(),fmt:fmtPace,invert:true,tick:fmtPace}:{key:'spdU',title:'Speed',unit:U.sU(),fmt:v=>v.toFixed(1)});
  if(sp==='running'&&HAS_GAP) d.push({key:'gap',title:'Grade-adjusted pace',note:'pace on the flat for the same effort',unit:U.pU(),fmt:fmtPace,invert:true,tick:fmtPace});
  d.push({key:'hr',title:'Heart rate',unit:'bpm',fmt:v=>v.toFixed(0),hr:true});
  if(sp==='multi'||sp==='cycling') d.push({key:'bpw',title:'Bike power',note:BIKE&&BIKE.estimated?'estimated from speed · 30 s avg':'30 s avg',unit:'W',fmt:v=>v.toFixed(0),dashed:BIKE&&BIKE.estimated});
  if(sp==='multi'||sp==='running'){
    d.push({key:'pw',title:'Run power',unit:'W',fmt:v=>v.toFixed(0)});
    d.push({key:'spm',title:'Cadence',unit:'spm',fmt:v=>v.toFixed(0)});
    d.push({key:'strideU',title:'Stride length',note:STRIDE_REC?'':'estimated from speed and cadence',unit:U.imperial()?'ft':'m',fmt:v=>v.toFixed(2)});
    d.push({key:'gct',title:'Ground contact time',unit:'ms',fmt:v=>v.toFixed(0)});
    d.push({key:'balS',title:'GCT balance',note:'10 s avg · above line = left-heavy',unit:'',fmt:balTxt,bal:true});
    d.push({key:'vo',title:'Vertical oscillation',unit:'cm',fmt:v=>v.toFixed(1)});
  }
  return d;
}
function renderChartSel(){
  const bar=document.getElementById('chartsel');if(!bar)return;bar.replaceChildren();bar.hidden=sel.kind==='all';if(sel.kind==='all')return;
  const [a,b]=range();let txt;
  if(sel.kind==='lap'){const l=L[sel.i];txt=`Lap ${sel.i+1} · ${NAMES[segOf(l.start+.5)]} · ${l.dist<100?Math.round(l.dist)+' m':km(l.dist)+' '+U.dU()} · ${fmtDur(l.elapsed)}`}
  else if(sel.kind==='seg'){const s=S[sel.i];txt=`${NAMES[sel.i]} · ${s.dist<100?Math.round(s.dist||0)+' m':km(s.dist)+' '+U.dU()} · ${fmtDur(s.elapsed)}`}
  else txt=`Flagged stretch ${fmtDur(a)}–${fmtDur(b)}`;
  const dot=document.createElement('span');dot.className='dot';dot.style.background=colorOf(selSport()==='multi'?'transition':selSport());
  const lab=document.createElement('span');lab.append('Charts for ');const bb=document.createElement('b');bb.textContent=txt;lab.append(bb);
  const btn=document.createElement('button');btn.className='btn sm';btn.textContent='Whole '+WHOLE;btn.onclick=()=>select({kind:'all'});
  const sp=document.createElement('span');sp.style.flex='1';bar.append(dot,lab,sp,btn);
}
function renderCharts(){
  renderChartSel();
  const host=document.getElementById('charts');host.replaceChildren();charts.length=0;
  const [a,b]=range(), W=Math.max(320,host.clientWidth-32), m={l:46,r:8,t:6,b:4};
  xScale=d3.scaleLinear().domain([a,b]).range([m.l,W-m.r]);
  const vis=R.filter(r=>r.t>=a-2&&r.t<=b+2), defs=chartDefs().filter(d=>vis.some(r=>r[d.key]!=null));
  // averages for the selection: pace and speed the way the watch does it (lap or leg distance over its time, or the
  // distance covered over the span); everything else from the samples strictly inside the selection
  const inR=R.filter(r=>r.t>=a&&r.t<=b), selObj=sel.kind==='lap'?L[sel.i]:sel.kind==='seg'?S[sel.i]:null;
  const spanSpeed=()=>{const d=inR.filter(r=>r.dist!=null);return d.length>1&&b>a?(d[d.length-1].dist-d[0].dist)/(d[d.length-1].t-d[0].t||b-a):null};
  const avgMs=selObj&&selObj.avgSpeed>0?+selObj.avgSpeed:selObj&&selObj.dist>0&&selObj.elapsed>0?selObj.dist/selObj.elapsed:spanSpeed();
  const avgOf=d=>{
    if((d.key==='pace'||d.key==='spdU')&&avgMs>0) return d.key==='pace'?fmtPace(60/U.kmhTo(avgMs*3.6)):d.fmt(U.kmhTo(avgMs*3.6));
    if(d.key==='hr'&&selObj&&selObj.avgHr) return d.fmt(+selObj.avgHr);
    if((d.key==='pw'||d.key==='bpw')&&selObj&&selObj.avgPower>0&&!(d.key==='bpw'&&!(BIKE&&BIKE.has))) return d.fmt(+selObj.avgPower);
    const v=inR.map(r=>r[d.key]).filter(v=>v!=null);return v.length?d.fmt(d3.mean(v)):'–'};
  defs.forEach((d,ci)=>{
    const vals=vis.map(r=>r[d.key]).filter(v=>v!=null), H=d.bal?120:84, last=ci===defs.length-1, HH=H+(last?18:0);
    const div=document.createElement('div');div.className='chart';const head=document.createElement('div');head.className='chead';
    const t=document.createElement('div');t.className='t';t.textContent=d.title;if(d.note){const em=document.createElement('em');em.textContent=d.note;t.append(em)}
    const cur=document.createElement('div');cur.className='cur';
    const avg=avgOf(d);
    cur.dataset.avg=`avg ${avg}`;cur.append(document.createTextNode(`avg ${avg}`));const u=document.createElement('small');u.textContent=d.unit;cur.append(u);
    head.append(t,cur);div.append(head);host.append(div);
    const svg=d3.select(div).append('svg').attr('viewBox',`0 0 ${W+16} ${HH}`).attr('height',HH);
    let dom;
    if(d.bal){const devs=vals.map(v=>Math.abs(v-50)).sort(d3.ascending);const dv=Math.min(6,Math.max(3,Math.ceil(d3.quantile(devs,.98)+0.5)));dom=[50-dv,50+dv]}
    else{const sv=vals.slice().sort(d3.ascending);dom=d.key==='pace'?[d3.quantile(sv,.01),d3.quantile(sv,.99)]:[sv[0],sv[sv.length-1]];const p=(dom[1]-dom[0])*.12||1;dom=[dom[0]-p,dom[1]+p];}
    const y=d3.scaleLinear().domain(d.invert?[dom[1],dom[0]]:dom).range([H-m.b,m.t]).clamp(true);
    if(d.bal){
      // balanced band, centre line, side labels
      svg.append('rect').attr('x',m.l).attr('width',W-m.l-m.r).attr('y',y(CFG.balHi)).attr('height',y(CFG.balLo)-y(CFG.balHi)).attr('fill',css('--band'));
      svg.append('line').attr('x1',m.l).attr('x2',W-m.r).attr('y1',y(50)).attr('y2',y(50)).attr('stroke',css('--text-muted'));
      [CFG.balLo,CFG.balHi].forEach(v=>svg.append('line').attr('x1',m.l).attr('x2',W-m.r).attr('y1',y(v)).attr('y2',y(v)).attr('stroke',css('--text-muted')).attr('stroke-dasharray','3 3').attr('opacity',.7));
      const ticks=[dom[0],CFG.balLo,50,CFG.balHi,dom[1]];
      ticks.forEach(v=>svg.append('text').attr('x',m.l-6).attr('y',y(v)+3).attr('text-anchor','end').attr('font-size',10).attr('fill',css('--text-muted')).text(v===50?'50/50':v>50?`L ${(+v).toFixed(1)}`:`R ${(100-v).toFixed(1)}`));
      svg.append('text').attr('x',W-m.r-4).attr('y',m.t+11).attr('text-anchor','end').attr('font-size',10).attr('font-weight',600).attr('fill',css('--text-muted')).text('LEFT-HEAVY ↑');
      svg.append('text').attr('x',W-m.r-4).attr('y',H-m.b-5).attr('text-anchor','end').attr('font-size',10).attr('font-weight',600).attr('fill',css('--text-muted')).text('RIGHT-HEAVY ↓');
      FLAGS.filter(f=>f.t1>=a&&f.t0<=b).forEach(f=>{const x0=xScale(Math.max(a,f.t0)),x1=xScale(Math.min(b,f.t1));
        svg.append('rect').attr('x',x0).attr('width',Math.max(2,x1-x0)).attr('y',m.t).attr('height',H-m.t-m.b).attr('fill',css('--warn')).attr('opacity',.14);});
    } else {
      svg.append('g').attr('class','gridl').attr('transform',`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(3).tickSize(-(W-m.l-m.r)).tickFormat(''));
      svg.append('g').attr('class','axis').attr('transform',`translate(${m.l-4},0)`).call(d3.axisLeft(y).ticks(3).tickSize(0).tickFormat(d.tick||(v=>v)));
    }
    if(sel.kind==='all') S.forEach(s=>{if(s.sport==='transition') svg.append('rect').attr('x',xScale(s.start)).attr('width',Math.max(2,xScale(s.start+s.elapsed)-xScale(s.start))).attr('y',m.t).attr('height',H-m.t-m.b).attr('fill',css('--trans')).attr('opacity',.18)});
    if(d.hr){[['running',CFG.lthrRun],['cycling',CFG.lthrBike]].forEach(([sp,v])=>{S.forEach(s=>{if(s.sport!==sp)return;const xa=Math.max(a,s.start),xb=Math.min(b,s.start+s.elapsed);if(xb<=xa)return;
        svg.append('line').attr('x1',xScale(xa)).attr('x2',xScale(xb)).attr('y1',y(v)).attr('y2',y(v)).attr('stroke',css('--text-muted')).attr('stroke-dasharray','3 3');})});
      svg.append('text').attr('x',W-m.r).attr('y',y(CFG.lthrRun)-4).attr('text-anchor','end').attr('font-size',10).attr('fill',css('--text-muted')).text('threshold HR');}
    S.forEach((s,i)=>{const seg=vis.filter(r=>r.seg===i);if(seg.length<2)return;
      const parts=[];let cu=[];seg.forEach(r=>{if(r.brk&&cu.length){parts.push(cu);cu=[]}cu.push(r)});parts.push(cu);
      const gen=d3.line().defined(r=>r[d.key]!=null).x(r=>xScale(r.t)).y(r=>y(r[d.key])).curve(d3.curveMonotoneX);
      parts.forEach(p=>{
        if(d.area){svg.append('path').attr('d',d3.area().defined(r=>r[d.key]!=null).x(r=>xScale(r.t)).y0(H-m.b).y1(r=>y(r[d.key])).curve(d3.curveMonotoneX)(p)).attr('fill',colorOf(s.sport)).attr('opacity',.16);}
        svg.append('path').attr('d',gen(p)).attr('fill','none').attr('stroke',colorOf(s.sport)).attr('stroke-width',2).attr('stroke-linejoin','round').attr('stroke-dasharray',d.dashed?'5 3':null);
        if(d.bal){FLAGS.forEach(f=>{const q=p.filter(r=>r.t>=f.t0&&r.t<=f.t1);if(q.length>1)svg.append('path').attr('d',gen(q)).attr('fill','none').attr('stroke',css('--warn')).attr('stroke-width',2.5);})}
      });});
    if(last) svg.append('g').attr('class','axis').attr('transform',`translate(0,${H+2})`).call(d3.axisBottom(xScale).ticks(Math.min(8,Math.floor(W/90))).tickSize(0).tickFormat(v=>fmtDur(v)));
    const hair=svg.append('line').attr('y1',m.t).attr('y2',H-m.b).attr('stroke',css('--cursor')).style('display','none');
    const dot=svg.append('circle').attr('r',4).attr('fill',css('--cursor')).attr('stroke',css('--surface-1')).attr('stroke-width',2).style('display','none');
    svg.append('rect').attr('x',m.l).attr('width',W-m.l-m.r).attr('height',HH).attr('fill','transparent').style('cursor','crosshair')
      .on('pointermove',e=>{const mm=svg.node().getScreenCTM().inverse();const pt=svg.node().createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const q=pt.matrixTransform(mm);setCursor(R[d3.bisector(r=>r.t).center(R,xScale.invert(q.x))])})
      .on('pointerleave',()=>setCursor(null));
    charts.push({d,y,hair,dot,cur});
  });
}
function setCursor(r){
  const ro=document.getElementById('readout');
  if(!r){hideCursorMap();charts.forEach(c=>{c.hair.style('display','none');c.dot.style('display','none');c.cur.firstChild.textContent=c.cur.dataset.avg});ro.replaceChildren(Object.assign(document.createElement('span'),{textContent:'Hover the charts or route'}));return}
  if(r.lat!=null)moveCursorMap(r);
  const [a,b]=range(),inR=r.t>=a&&r.t<=b;
  charts.forEach(c=>{const v=r[c.d.key];if(inR){c.hair.attr('x1',xScale(r.t)).attr('x2',xScale(r.t)).style('display',null);if(v!=null)c.dot.attr('cx',xScale(r.t)).attr('cy',c.y(v)).style('display',null);else c.dot.style('display','none')}
    c.cur.firstChild.textContent=v!=null?c.d.fmt(v)+' ':'– ';});
  const items=[[NAMES[r.seg],''],['Time',fmtDur(r.t)],['Distance',km(r.dist)+' '+U.dU()],['HR',r.hr!=null?`${r.hr} bpm · Z${zoneOf(r.hr,r.sport)+1}`:'–'],
    r.sport==='running'?['Pace',fmtPace(r.pace)+' '+U.pU()]:['Speed',r.spdU!=null?r.spdU.toFixed(1)+' '+U.sU():'–']];
  if(r.balS!=null) items.push(['GCT balance',balTxt(r.balS)]);
  ro.replaceChildren();items.forEach(([k,v])=>{const s=document.createElement('span');
    if(!v){const dt=document.createElement('span');dt.className='dot';dt.style.background=colorOf(r.sport);const b=document.createElement('b');b.textContent=k;s.append(dt,b)}
    else{s.append(document.createTextNode(k+' '));const b=document.createElement('b');b.textContent=v;s.append(b)}ro.append(s)});
}

function renderLaps(){
  const t=document.getElementById('laps');t.replaceChildren();const hr=t.insertRow();
  ['#','Section','Time','Distance','Pace / speed',...(HAS_GAP?['GAP']:[]),'Avg HR','Power','Gain'].forEach(h=>{const th=document.createElement('th');th.textContent=h;hr.append(th)});
  L.forEach((l,i)=>{const tr=t.insertRow();tr.className='lap'+(sel.kind==='lap'&&sel.i===i?' sel':'');
    [String(i+1),NAMES[segOf(l.start+.5)],fmtDur(l.elapsed),l.dist<100?Math.round(l.dist)+' m':km(l.dist)+' '+U.dU(),
     l.sport==='running'?fmtPace(paceOf(l.avgSpeed))+' '+U.pU():l.sport==='cycling'?U.speedMs(l.avgSpeed):'–',...(HAS_GAP?[l.sport==='running'?(gapOf(recsIn(l))||'–'):'–']:[]),l.avgHr??'–',l.avgPower?l.avgPower+' W':'–',l.ascent!=null?U.elev(l.ascent):'–']
    .forEach((c,j)=>{const td=tr.insertCell();if(j===1){const d=document.createElement('span');d.className='dot';d.style.background=colorOf(l.sport);td.append(d)}td.append(document.createTextNode(c))});
    tr.onclick=()=>{const off=sel.kind==='lap'&&sel.i===i;select(off?{kind:'all'}:{kind:'lap',i});if(!off)document.getElementById('chartscard')?.scrollIntoView({behavior:'smooth',block:'start'})};});
}


// settings are edited in settings.js; it calls this to re-render with new values
window.__actApply=cfg=>{CFG=Object.assign({},DEFAULTS,cfg);recompute();renderAll();};

function select(s){sel=s;renderAll()}
function recompute(){computeFlags();computeBike()}
function renderAll(){renderStats();renderSegbar();renderMap();renderZones();renderFtp();renderCharts();   // ground contact balance: shown on its chart (band and flags) and the map, no card of its own
renderLaps()}
recompute();
window.__act={renderAll,renderCharts};
sel={kind:'all'};renderAll();
if(!bound){bound=true;let rt;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{if(!document.getElementById('view-activity').hidden)window.__act.renderCharts()},150)});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(!document.getElementById('view-activity').hidden)window.__act.renderAll()});}
return {get cfg(){return CFG}};
}