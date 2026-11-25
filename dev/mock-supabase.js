// In-memory stand-in for supabase-js, enough for the app's calls.
const db={profiles:[{id:'u1',display_name:'Carl',settings:{lthrRun:163,lthrBike:158,maxHr:175,restHr:50,zones:[85,90,95,100,103],balLo:48.5,balHi:51.5,balMin:10,ftp:null,mass:75,bikeMass:9,cda:0.27,crr:0.004},default_visibility:'club',default_share:{map:true,hr:true,power:true,pace:true,cadence:true,dynamics:true,description:true}}],
 activities:[],activity_media:[],activity_sections:[],activity_laps:[],best_efforts:[],best_ignores:[],gear:[],comments:[],kudos:[],clubs:[],club_members:[],follows:[],connections:[],sync_inbox:[],club_posts:[],relay_legs:[],feedback:[]};
const files={};
if(window.__seedDb)Object.entries(window.__seedDb).forEach(([k,v])=>{if(k==='profile')Object.assign(db.profiles[0],v);else (db[k]=db[k]||[]).push(...v)});
if(window.__seedFiles)Object.assign(files,window.__seedFiles);
window.__db=db;window.__files=files;
let n=window.__uuidStart||0;const uuid=()=>'00000000-0000-4000-8000-'+String(++n).padStart(12,'0');
function q(table){
  let rng=null,lim=null,rows=null,filters=[],ord=null,mode='select',payload=null,single=false,maybe=false,cols='*',cnt=null;
  const api={
    select(c='*',o){cols=c;if(o&&o.count)cnt=o;if(mode==='select')mode='select';return api},
    eq(k,v){filters.push(r=>r[k]===v);return api},
    contains(k,v){const m=(a,b)=>Array.isArray(b)?b.every(x=>(a||[]).includes(x)):(b&&typeof b==='object')?Object.entries(b).every(([kk,vv])=>a&&m(a[kk],vv)):a===b;filters.push(r=>m(r[k],v));return api},
    or(e){const cs=e.split(',').map(c=>{const i=c.indexOf('.'),j=c.indexOf('.',i+1);const k=c.slice(0,i),op=c.slice(i+1,j),v=c.slice(j+1);return op==='is'&&v==='null'?r=>r[k]==null:op==='lt'?r=>r[k]!=null&&r[k]<v:op==='gt'?r=>r[k]!=null&&r[k]>v:r=>String(r[k])===v});filters.push(r=>cs.some(f=>f(r)));return api},
    in(k,v){filters.push(r=>v.includes(r[k]));return api},
    order(k,o={}){if(!ord)ord=[k,o.ascending!==false];return api},
    range(a,b){rng=[a,b];return api},
    limit(k){lim=k;return api},
    single(){single=true;return api},
    maybeSingle(){single=true;maybe=true;return api},
    insert(p){mode='insert';payload=Array.isArray(p)?p:[p];return api},
    update(p){mode='update';payload=p;return api},
    delete(){mode='delete';return api},
    then(res,rej){const d=window.__delay?.(table,{rng,lim,cols,mode})||0;return (d?new Promise(r=>setTimeout(r,d)):Promise.resolve()).then(run).then(res,rej)},
  };
  function run(){
    const T=db[table];
    if(mode==='insert'){const out=payload.map(p=>{const r={id:uuid(),owner:'u1',author:'u1',created_at:new Date().toISOString(),...p};T.push(r);return r});return fin(out)}
    let rs=T.filter(r=>filters.every(f=>f(r)));
    if(mode==='update'){rs.forEach(r=>Object.assign(r,payload));return fin(rs)}
    if(mode==='delete'){rs.forEach(r=>T.splice(T.indexOf(r),1));return fin(rs)}
    rs=rs.map(r=>({...r}));
    if(table==='activities'&&cols.includes('activity_sections('))rs.forEach(r=>r.activity_sections=db.activity_sections.filter(s=>s.activity_id===r.id));
    if(ord)rs.sort((a,b)=>(a[ord[0]]>b[ord[0]]?1:-1)*(ord[1]?1:-1));
    if(rng)rs=rs.slice(rng[0],rng[1]+1);
    if(lim!=null)rs=rs.slice(0,lim);
    if(table==='activities'&&cols.includes('summary:summary_lite'))rs.forEach(r=>{const m=r.summary;if(m&&'track' in m){const{track,...rest}=m;r.summary={...rest,start:track?.[0]??null,hasTrack:true}}});
    return fin(rs);
  }
  function fin(rs){if(cnt)return{data:cnt.head?null:rs,count:rs.length,error:null};if(single){if(!rs.length)return maybe?{data:null,error:null}:{data:null,error:{message:'no rows'}};return{data:rs[0],error:null}}return{data:rs,error:null}}
  return api;
}
export function createClient(){
  const session={user:{id:'u1',email:'carl@example.com'}};
  let cb=null;
  return {
    from:q,
    rpc:async(fn,args)=>{
      window.__rpc=(window.__rpc||[]).concat([[fn,args]]);
      const W=window.__rpcData||{};
      if(fn in W){const v=W[fn];return typeof v==='function'?v(args):(v&&v.error?{data:null,error:v.error}:{data:v,error:null})}
      if(fn==='my_clubs')return{data:window.__clubs||[],error:null};
      if(fn==='feed'){const me=db.profiles[0];const own=(window.__feed||db.activities).map(a=>({...a,athlete:me.display_name||'Carl',handle:me.handle||'carl',avatar_path:me.avatar_path||null,sections:db.activity_sections.filter(s=>s.activity_id===a.id).sort((x,y)=>x.idx-y.idx),track:a.summary?.track||null,flags:a.summary?.driving||null,media:db.activity_media.filter(m=>m.activity_id===a.id),kudos:a.kudos??2,comments:a.comments??1,you_kudoed:false,relay:(window.__feedRelay||{})[a.id]||null}));
        const sc=args&&args.scope,oth=(window.__feedOthers||[]).filter(o=>sc&&sc!=='me'&&(!o.scopes||o.scopes.includes(sc)));const all=(sc==='me'||!window.__feedOthers?own:own.concat(oth)).filter(a=>!args||!args.before||a.start_time<args.before).sort((a,b)=>a.start_time<b.start_time?1:-1);return{data:all.slice(0,args&&args.lim||50),error:null}}
      if(fn==='connect_intervals'){db.connections.push({owner:'u1',provider:'intervals',athlete_id:args.p_athlete,status:'ok',created_at:new Date().toISOString()});return{data:null,error:null}}
      if(fn==='merge_summary'){const a=db.activities.find(x=>x.id===args.aid);if(a)a.summary={...(a.summary||{}),...args.patch};return{data:null,error:null}}
      if(fn==='my_network')return{data:window.__net||[],error:null};
      if(fn==='search_athletes')return{data:(window.__search||[]).map(a=>({...a,you_follow:(db.follows.find(f=>f.followee===a.id)||{}).status||null})),error:null};
      if(fn==='companions')return{data:window.__comp||[],error:null};
      if(fn==='activity_extras')return{data:{media:[]},error:null};
      if(fn==='view_activity')return{data:null,error:null};
      return{data:null,error:null}},
    auth:{getSession:async()=>({data:{session}}),onAuthStateChange(f){cb=f;setTimeout(()=>f('INITIAL_SESSION',session),0);return{data:{subscription:{unsubscribe(){}}}}},signOut:async()=>{cb&&cb('SIGNED_OUT',null)},signInWithPassword:async()=>({data:{}}),signUp:async(o)=>{window.__signup=o;return{data:{user:{identities:[{}]},session:null},error:null}},resend:async o=>{window.__resent=o;return{error:null}},resetPasswordForEmail:async(e,o)=>{window.__reset=[e,o];return{error:null}},updateUser:async o=>{window.__pw=o;return{data:{},error:null}}},
    functions:{invoke:async(name,o)=>{window.__invoked=(window.__invoked||[]).concat([[name,o&&o.body]]);return{data:{ok:true},error:null}}},
    storage:{from:b=>({upload:async(p,blob)=>{files[b+'/'+p+'#blob']=blob;files[b+'/'+p]=await blob.text?.()??blob;return{error:null}},download:async p=>{const v=files[b+'/'+p+'#blob']||(files[b+'/'+p]!=null?new Blob([files[b+'/'+p]]):null);return v==null?{error:{message:'nf'}}:{data:v,error:null}},list:async(pre,o={})=>{const seen=new Map();for(const k of Object.keys(files)){if(k.endsWith('#blob')||!k.startsWith(b+'/'+pre+'/'))continue;const rest=k.slice(b.length+pre.length+2),i=rest.indexOf('/');seen.set(i<0?rest:rest.slice(0,i),i<0?'f':null)}const all=[...seen].sort().map(([name,id])=>({name,id}));const off=o.offset||0;return{data:all.slice(off,off+(o.limit||100)),error:null}},remove:async(ps)=>{ps.forEach(p=>delete files[b+'/'+p]);return{error:null}},getPublicUrl:p=>({data:{publicUrl:files[b+'/'+p+'#blob']?URL.createObjectURL(files[b+'/'+p+'#blob']):'about:blank'}}),createSignedUrls:async(ps)=>({data:ps.map(p=>({signedUrl:files[b+'/'+p]?URL.createObjectURL(files[b+'/'+p+'#blob']||new Blob([files[b+'/'+p]])):null}))})})},
  };
}
