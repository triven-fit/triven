import './busy.js?v=1795591409';
import './pull.js?v=1795591409';   // pull down from the top to sync   // first: makes slow buttons grey out while they work
import { isGarmin } from './garmin.js?v=1795591409';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.1/+esm';
import { decodeFit } from './fit.js?v=1795591409';
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.2/+esm';
export { JSZip };
import { processFit, shareStreams, rows, makeTrack, detectDriving, trimMessages, envLabel } from './process.js?v=1795591409';
import { mountActivity } from './activity.js?v=1795591409';
import { mountLog } from './log.js?v=1795591409';
import { mountGear } from './gear.js?v=1795591409';
import { mountClub } from './club.js?v=1795591409';
import { mountClubPage, mountJoin } from './clubs.js?v=1795591409';
import { mountRelay } from './relay.js?v=1795591409';
import { lengthsIn, poolStats, poolBests } from './swim.js?v=1795591409';
import { SWIM_DISTANCES, bestOverDistance } from './process.js?v=1795591409';
import { setUnits, dist as uDist } from './units.js?v=1795591409';
import { prettyOf, curRoute, rememberLink } from './urls.js?v=1795591409';
import { openLink } from './profile.js?v=1795591409';
import { mountBests, applyIgnores, backLabel } from './bests.js?v=1795591409';
import { mountRaces } from './races.js?v=1795591409';
import { weatherBackfill } from './weather.js?v=1795591409';
import { initNotifications } from './notify.js?v=1795591409';
import { initAccountData } from './account.js?v=1795591409';
import { openFeedback } from './feedback.js?v=1795591409';
import { mountAdmin, countVisit } from './admin.js?v=1795591409';
import './racehist.js?v=1795591409';   // race history card on race pages
import { mountActivities } from './actlist.js?v=1795591409';
import { installHint } from './install.js?v=1795591409';
import { openWelcome } from './settings.js?v=1795591409';
import './swimview.js?v=1795591409';
import './trophies.js?v=1795591409';
import { mountFeed } from './feed.js?v=1795591409';
import { enrichOut, saveProcessed, importDecoded, mergeMessages, pickGearFrom, gearRoles } from './pipeline.js?v=1795591409';
import { perfData } from './perf.js?v=1795591409';
import { loadData } from './load.js?v=1795591409';
import { checkOnOpen, paintConnections } from './sync.js?v=1795591409';
import { mountManual } from './manual.js?v=1795591409';
import { mountCal } from './cal.js?v=1795591409';
import { settingsAt } from './athlete.js?v=1795591409';
import { initSettings, DEFAULTS, ageOn } from './settings.js?v=1795591409';
import { offerCombine } from './edit.js?v=1795591409';

// Public project settings. The publishable key is safe in the browser: row level security decides what each user can read or write.
const SUPABASE_URL = 'https://ksubeokekwflqnmzsune.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gBU60hkphcU9T97Cn1Bvmw_QMIFFy3i';
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const VIEWS = ['auth', 'loading', 'feed', 'log', 'activity', 'upload', 'gear', 'club', 'relay', 'profile', 'admin'];
export const state = { user: null, profile: null, activities: [], gear: [], bests: [], loaded: false };

export function toast(msg, ms = 3200) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms); }
function show(v) {
  VIEWS.forEach(x => { const el = $('view-' + x); if (el) el.hidden = x !== v; });
  ['feed', 'log', 'upload', 'gear', 'club', 'activity'].forEach(x => $('tab-' + x)?.setAttribute('aria-selected', x === v));
  $('tabs').hidden = v === 'auth' || v === 'loading'; $('acct').hidden = !state.user;
}

// ---------- auth ----------
let signUp = false;
$('authSwitch').onclick = e => { e.preventDefault(); signUp = !signUp; $('nameRow').hidden = !signUp; $('authTitle').textContent = signUp ? 'Create your account' : 'Sign in';
  $('authGo').textContent = signUp ? 'Create account' : 'Sign in'; $('authSwitch').textContent = signUp ? 'Already have an account? Sign in' : 'New to Triven? Create an account';
  $('authPass').autocomplete = signUp ? 'new-password' : 'current-password'; $('authMsg').textContent = ''; };
$('authForm').onsubmit = async e => {
  e.preventDefault(); $('authGo').disabled = true; $('authMsg').textContent = '';
  const email = $('authEmail').value.trim(), password = $('authPass').value;
  const res = signUp ? await sb.auth.signUp({ email, password, options: { data: { display_name: $('authName').value.trim() || undefined }, emailRedirectTo: location.origin + '/' } })
                     : await sb.auth.signInWithPassword({ email, password });
  $('authGo').disabled = false;
  if (res.error) {
    // not confirmed yet: offer to send the link again
    if (/not confirmed/i.test(res.error.message)) { authNote(`Confirm your email first: click the link we sent to ${email}. `, 'Send it again', async () => { const r = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.origin + '/' } }); authNote(r.error ? r.error.message : `Sent again to ${email}. Check your spam folder too.`); }); return; }
    authNote(/invalid login/i.test(res.error.message) ? 'That email and password don’t match. Check them, or reset your password.' : res.error.message); return;
  }
  $('authPass').value = '';
  // with email confirmation on, sign-up returns no session until the link is clicked
  if (signUp && !res.data.session) {
    authNote(res.data.user && !res.data.user.identities?.length ? 'There may already be an account for that email. Sign in, or reset your password.'
      : `Nearly there: we’ve sent a link to ${email}. Click it to confirm your email, then sign in here. Check your spam folder if it hasn’t arrived in a few minutes.`);
  }
};
function authNote(text, linkText, onLink) {
  const m = $('authMsg'); m.replaceChildren(text);
  if (linkText) { const a = document.createElement('a'); a.href = '#'; a.textContent = linkText; a.onclick = e => { e.preventDefault(); onLink(); }; m.append(a); }
}
$('authForgot').onclick = async e => {
  e.preventDefault();
  const email = $('authEmail').value.trim();
  if (!email) { authNote('Enter your email above, then click “Forgot your password?” again.'); $('authEmail').focus(); return; }
  const r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/#reset' });
  authNote(r.error ? r.error.message : `If there’s an account for ${email}, a link to set a new password is on its way. Check your spam folder too.`);
};
// arriving from a password-reset link: choose a new password
function newPasswordSheet() {
  const ov = $('modal'), body = $('modalBody'); body.replaceChildren(); body.className = 'sheet';
  const h = document.createElement('h3'); h.textContent = 'Choose a new password';
  const lab = document.createElement('label'); lab.className = 'f'; lab.textContent = 'New password (at least 8 characters)';
  const inp = Object.assign(document.createElement('input'), { type: 'password', autocomplete: 'new-password', minLength: 8 }); lab.append(inp);
  const msg = document.createElement('div'); msg.className = 'note';
  const go = Object.assign(document.createElement('button'), { className: 'btn primary', textContent: 'Save password', type: 'button' });
  go.onclick = async () => { if (inp.value.length < 8) { msg.textContent = 'Use at least 8 characters.'; return; } go.disabled = true;
    const r = await sb.auth.updateUser({ password: inp.value }); go.disabled = false;
    if (r.error) { msg.textContent = r.error.message; return; } ov.classList.remove('open'); toast('Password changed'); if (curRoute() === '#reset') location.hash = '#feed'; };
  const row = document.createElement('div'); row.className = 'actions'; row.append(document.createElement('span'), go);
  body.append(h, lab, msg, row); ov.classList.add('open'); inp.focus();
}
$('signOut').onclick = $('signOut2').onclick = async () => { await sb.auth.signOut(); };

sb.auth.onAuthStateChange((evt, session) => {
  if (evt === 'PASSWORD_RECOVERY') setTimeout(newPasswordSheet, 300);
  const u = session?.user || null;
  if (u?.id === state.user?.id) return;
  state.user = u; state.loaded = false;
  if (!u) { show('auth'); countVisit(/^\/join\//.test(location.pathname) || curRoute().startsWith('#join/') ? 'join' : 'landing', false); if (/[?&]deleted=1/.test(location.search)) { $('authMsg').textContent = 'Your account and everything in it has been deleted.'; history.replaceState(null, '', '/'); } return; }
  boot();
});

async function boot() {
  show('loading');
  await loadAll({ quick: true });
  setTimeout(() => checkOnOpen(), 1500);   // a fresh check if it's been a while, then anything waiting in the inbox
  $('acctName').textContent = state.profile?.display_name || state.user.email; paintAvatar();
  // an invite link opened before signing in (or before confirming the email address)
  let pendingJoin = null; try { pendingJoin = localStorage.getItem('triven.join'); } catch { /* storage blocked */ }
  if (pendingJoin && !curRoute().startsWith('#join/')) location.hash = '#join/' + pendingJoin;
  // a profile or activity link opened before signing in
  let pendingLink = null; try { pendingLink = localStorage.getItem('triven.link'); localStorage.removeItem('triven.link'); } catch { /* storage blocked */ }
  if (pendingLink && !pendingJoin && state.profile?.privacy_set && curRoute() !== pendingLink) location.hash = pendingLink;
  initNotifications(); initAccountData(); countVisit('app', true);
  sb.rpc('is_admin').then(({ data }) => { state.isAdmin = data === true; document.querySelectorAll('.adminonly').forEach(e => e.hidden = !state.isAdmin); if (state.isAdmin && curRoute() === '#admin') route(); }, () => {});
  document.querySelectorAll('.fbopen').forEach(b => b.onclick = () => { $('settings').classList.remove('open'); openFeedback(b.dataset.kind || 'feature'); });
  route();
  installHint();
  if (state.profile && !state.profile.privacy_set) setTimeout(() => { paintConnections(); openWelcome(); }, 600);
  (state.fullLoad || Promise.resolve()).then(backfill);   // on the whole list, once it's in
}
let backfilled = false;
async function backfill() {
  if (backfilled) return; backfilled = true;
  const todo = state.activities.filter(a => a.file_path && (!a.summary || !(a.summary.hasTrack || 'track' in a.summary) || !('loadData' in a.summary) || !('perf' in a.summary)));
  for (const a of todo) {
    try { const d = await fetchActivity(a.id); if (!d.streams) continue;
      const sm = { ...d.act.summary, track: makeTrack(d.streams, d.sections), driving: detectDriving(d.sections, d.streams), loadData: loadData(d.sections, d.streams), perf: perfData(d.sections, d.streams) };
      await sb.from('activities').update({ summary: sm }).eq('id', a.id); a.summary = sm; } catch (e) { /* try again next visit */ }
  }  await swimBackfill(); bikeBackfill().then(() => weatherBackfill());
}
// pool swims imported before 20 Nov 2026: swim time without rests, pace on it, and bests over continuous swimming,
// worked out from the lengths already saved with each activity (no need to read the file again)
async function swimBackfill() {
  const todo = state.activities.filter(a => (a.activity_sections || []).some(s => s.sport === 'swim' && s.summary?.env === 'pool' && !s.summary?.swimV));
  let changed = 0; const changedIds = [];
  for (const a of todo) {
    try {
      const d = await fetchActivity(a.id), lens = d.streams?.lengths || [];
      const newBests = []; let swimTotal = 0, allPool = true;
      for (const sec of d.sections) {
        if (sec.sport !== 'swim') continue;
        if (sec.summary?.env !== 'pool') { allPool = false; continue; }
        const L = sec.summary?.poolLength, st = poolStats(lengthsIn(sec, lens), L);
        const sm = { ...sec.summary, swimV: 1 }, upd = { summary: sm };
        if (st) {
          Object.assign(sm, { swimTime: st.swimTime, rest: st.rest, swolf: st.swolf != null ? Math.round(st.swolf * 10) / 10 : sm.swolf, strokeRate: st.strokeRate != null ? Math.round(st.strokeRate * 10) / 10 : null,
            strokesPerLength: st.strokesPerLength != null ? Math.round(st.strokesPerLength * 10) / 10 : null, numLengths: st.lengths });
          if (+sec.distance_m > 0 && st.swimTime > 0) upd.avg_speed = Math.round(sec.distance_m / st.swimTime * 1000) / 1000;
          swimTotal += st.swimTime;
          Object.entries(poolBests(lengthsIn(sec, lens), L, SWIM_DISTANCES)).forEach(([effort, b]) => newBests.push({ owner: state.user.id, activity_id: a.id, sport: 'swim', effort, value: Math.round(b.t * 100) / 100, unit: 's', start_offset_s: Math.round(b.start * 10) / 10, measured: true, achieved_at: d.act.start_time }));
        } else allPool = false;
        await sb.from('activity_sections').update(upd).eq('activity_id', a.id).eq('idx', sec.idx);
      }
      if (swimTotal > 0) {
        // keep the best per distance across legs, replace the old swim bests (which could include rests)
        const keep = new Map(); newBests.forEach(b => { const c = keep.get(b.effort); if (!c || b.value < c.value) keep.set(b.effort, b); });
        await sb.from('best_efforts').delete().eq('activity_id', a.id).eq('sport', 'swim');
        if (keep.size) await sb.from('best_efforts').insert([...keep.values()]);
        if (d.act.sport === 'swim' && allPool) await sb.from('activities').update({ moving_s: Math.round(swimTotal) }).eq('id', a.id);
        changed++; changedIds.push(a.id);
      }
    } catch (e) { /* try again next visit */ }
  }
  if (changedIds.length) await refreshActs(changedIds);
}

// rides imported before 21 Nov 2026: add 90 km and 180 km bests (half and full Ironman bike legs) from the saved streams. Once.
async function bikeBackfill() {
  if (state.profile?.settings?.bikeBestsV >= 1) return;
  const IND = ['indoor', 'virtual'], have = new Set((state.bestsAll || []).filter(b => b.effort === '90 km').map(b => b.activity_id));
  const todo = state.activities.filter(a => !have.has(a.id) && (a.activity_sections || []).some(s => s.sport === 'bike' && +s.distance_m >= 90000 && !IND.includes(s.summary?.env)));
  let added = 0; const addedIds = [];
  for (const a of todo) {
    try {
      const d = await fetchActivity(a.id); if (!d.streams?.dist) continue;
      const recs = rows(d.streams), keep = new Map();
      for (const s of d.sections) {
        if (s.sport !== 'bike' || IND.includes(s.summary?.env)) continue;
        const sr = recs.filter(x => x.t >= +s.start_offset_s && x.t <= +s.start_offset_s + +s.elapsed_s && x.dist != null);
        [['90 km', 90000], ['180 km', 180000]].forEach(([effort, m]) => { if (+s.distance_m < m) return; const b = bestOverDistance(sr, m);
          if (b && (!keep.has(effort) || b.t < keep.get(effort).value)) keep.set(effort, { owner: state.user.id, activity_id: a.id, sport: 'bike', effort, value: Math.round(b.t * 100) / 100, unit: 's', start_offset_s: Math.round(b.start * 10) / 10, measured: true, achieved_at: a.start_time }); });
      }
      if (keep.size) { const r = await sb.from('best_efforts').insert([...keep.values()]); if (!r.error) { added += keep.size; addedIds.push(a.id); } }
    } catch (e) { /* skip this one */ }
  }
  const settings = { ...(state.profile.settings || {}), bikeBestsV: 1 };
  if (!(await sb.from('profiles').update({ settings }).eq('id', state.user.id)).error) state.profile.settings = settings;
  if (addedIds.length) await refreshActs(addedIds);
}

// ---------- data ----------
// fetch every row, 1000 at a time (Supabase caps a single request at 1000), up to 4 pages at once
async function allRows(q) {
  const N = 1000, out = [];
  for (let from = 0; ; from += 4 * N) {
    const rs = await Promise.all([0, 1, 2, 3].map(k => q().range(from + k * N, from + (k + 1) * N - 1)));
    for (const r of rs) {
      if (r.error) return r;
      out.push(...(r.data || [])); if (!r.data || r.data.length < N) return { data: out, error: null };
    }
  }
}
// the activity list carries a slim summary: no map track, just its start point (summary_lite, migration 022)
const ACT_COLS = 'id,num,name,description,notes,sport,multisport_profile,start_time,utc_offset_min,distance_m,elapsed_s,moving_s,ascent_m,calories,avg_hr,indoor,is_race,gear_id,source,visibility,share,summary:summary_lite,device,activity_sections(idx,sport,elapsed_s,timer_s,distance_m,ascent_m,gear_id,summary)';
const QUICK = 300;
let loadGen = 0;
// quick: at sign-in, load the newest activities first so the app opens straight away, then everything else
// in the background (state.partial is true until it arrives, and the log and gear pages redraw then).
// Bring a few activities up to date in the loaded lists, instead of reloading the whole history (loadAll):
// ids = activities added or changed (fetched again with their best efforts), removed = activities deleted.
// Used after uploads, sync, edits, trims, linking and deleting. Falls back to loadAll if anything goes wrong.
export async function refreshActs(ids = [], removed = []) {
  const uid = state.user.id; ids = [...new Set(ids.filter(Boolean))];
  const gone = new Set([...removed, ...ids]), parts = [];
  for (let i = 0; i < ids.length; i += 100) parts.push(ids.slice(i, i + 100));
  const [acts, bests] = await Promise.all([
    Promise.all(parts.map(p => sb.from('activities').select(ACT_COLS).eq('owner', uid).in('id', p))),
    Promise.all(parts.map(p => sb.from('best_efforts').select('*').eq('owner', uid).in('activity_id', p))),
  ]);
  if ([...acts, ...bests].some(r => r.error)) return loadAll();
  const A = acts.flatMap(r => r.data || []), Bs = bests.flatMap(r => r.data || []);
  A.forEach(x => x.num && rememberLink(x.id, state.profile?.handle + '/' + x.num));
  const t = a => Date.parse(a.start_time);
  state.activities = state.activities.filter(a => !gone.has(a.id)).concat(A).sort((a, b) => t(a) - t(b) || (a.id < b.id ? -1 : 1));
  state.bestsAll = (state.bestsAll || []).filter(b => !gone.has(b.activity_id)).concat(Bs);
  applyIgnores();
}
export async function refreshGear() {
  const g = await sb.from('gear').select('*').eq('owner', state.user.id).order('created_at');
  if (!g.error) state.gear = g.data || [];
}
export async function loadAll({ quick = false, bestsP = null } = {}) {
  const uid = state.user.id, gen = ++loadGen;
  const acts = () => sb.from('activities').select(ACT_COLS).eq('owner', uid);
  bestsP = bestsP || allRows(() => sb.from('best_efforts').select('*').eq('owner', uid).order('id'));
  const [p, a, g, ig] = await Promise.all([
    sb.from('profiles').select('*').eq('id', uid).single(),
    quick ? acts().order('start_time', { ascending: false }).order('id', { ascending: false }).limit(QUICK) : allRows(() => acts().order('start_time').order('id')),
    sb.from('gear').select('*').eq('owner', uid).order('created_at'),
    allRows(() => sb.from('best_ignores').select('activity_id,sport,effort').eq('owner', uid).order('activity_id')),
  ]);
  if (gen !== loadGen) return;   // a newer load has started; its result wins
  const partial = quick && (a.data || []).length >= QUICK;
  const b = partial ? { data: [] } : await bestsP;   // a big history: bests arrive with the rest
  if (gen !== loadGen) return;
  for (const r of [p, a, g, b]) if (r.error) { toast('Could not load your data: ' + r.error.message, 6000); }
  if (quick) a.data = (a.data || []).reverse();
  state.profile = p.data; setUnits(state.profile?.settings?.units); (a.data || []).forEach(x => x.num && rememberLink(x.id, state.profile?.handle + '/' + x.num)); state.activities = a.data || []; state.gear = g.data || []; state.bestsAll = b.data || []; state.ignores = new Set((ig.data || []).map(x => `${x.activity_id}|${x.sport}|${x.effort}`)); applyIgnores(); state.loaded = true;
  state.partial = partial; $('olderPill').hidden = !partial;
  if (!quick) return;
  // pages that read only the server (feed, clubs, people, relays, activity pages) don't need redrawing
  const redraw = () => { if (!/^#(a|u|c|r|join)\/|^#(feed|club|people|admin|upload)/.test(curRoute())) route(); };
  state.fullLoad = partial ? loadAll({ bestsP }).then(() => { if (gen + 1 === loadGen) redraw(); }) : Promise.resolve();
}
initAvatar();
document.getElementById('openSettings').addEventListener('click', () => paintConnections());
initSettings(() => state.profile?.settings, async cfg => { const was = state.profile?.settings?.units || 'metric'; await saveSettings(cfg); setUnits(cfg.units); if ((cfg.units || 'metric') !== was) { route(); return; } if (!$('view-activity').hidden && window.__actApply && curAct) window.__actApply(cfgFor(curAct)); document.dispatchEvent(new Event('triven:settings')); },
  { get: () => state.profile, save: async upd => { const { error } = await sb.from('profiles').update(upd).eq('id', state.user.id); if (error) { toast('Could not save privacy settings: ' + error.message); return; } Object.assign(state.profile, upd); } });
export async function saveSettings(cfg) {
  state.profile.settings = cfg;
  const { error } = await sb.from('profiles').update({ settings: cfg }).eq('id', state.user.id);
  toast(error ? 'Settings not saved: ' + error.message : 'Settings saved');
}

// usage per gear item: whole activities plus multisport sections assigned to it
export function gearUsage() {
  return state.gear.map(g => {
    let m = 0, uses = 0;
    for (const a of state.activities) {
      const secs = (a.activity_sections || []).filter(s => s.gear_id === g.id);
      if (secs.length) { m += secs.reduce((x, s) => x + (+s.distance_m || 0), 0); uses++; }
      else if (a.gear_id === g.id) { m += +a.distance_m || 0; uses++; }
    }
    return { ...g, used_m: m, uses };
  });
}

function logData() {
  const acts = state.activities.map(a => {
    const local = new Date(Date.parse(a.start_time) + a.utc_offset_min * 60000).toISOString().slice(0, 19);
    const secs = (a.activity_sections || []).slice().sort((x, y) => x.idx - y.idx);
    return { id: a.id, name: a.name, start: local, sport: a.sport, dist: +a.distance_m, moving: +(a.moving_s ?? a.elapsed_s), elapsed: +a.elapsed_s,
      elev: +(a.ascent_m || 0), indoor: a.indoor, gear: a.gear_id, cal: a.calories, source: a.source === 'upload' ? 'Upload' : a.source, detail: true, profile: a.multisport_profile,
      sections: secs.map(s => ({ sport: s.sport === 'transition' ? 'trans' : s.sport, dist: +s.distance_m || 0, elapsed: +s.elapsed_s, elev: +s.ascent_m || 0 })) };
  });
  return { activities: acts, gear: gearUsage(), bests: state.bests, mass: state.profile?.settings?.mass, age: ageOn(state.profile?.settings?.dob) };
}

// ---------- routing ----------
async function route() {
  if (!state.user) return show('auth');
  if (!state.loaded) return;
  const h = curRoute();
  state.route = h;
  // show a clean address (/log/bests, /carlg/412) instead of the #route; 404.html maps it back on reload
  const pretty = prettyOf(h);
  if (location.pathname + location.search !== pretty || location.hash) history.replaceState(history.state, '', pretty);
  if (!h.startsWith('#a/')) { try { sessionStorage.removeItem('triven.back'); } catch { /* storage blocked */ } }
  $('tab-activity').hidden = true;
  if (h.startsWith('#a/')) return openActivity(h.slice(3).split('?')[0]);
  if (h.startsWith('#u/')) return openLink(h.slice(3).split('?')[0], show);
  if (h === '#me') { location.replace('#u/' + (state.profile?.handle || '')); return; }
  if (h === '#feed' || h.startsWith('#feed/')) { show('feed'); return mountFeed(h.split('/')[1] || 'me'); }
  if (h === '#upload') { show('upload'); mountManual($('manualBox')); return; }
  if (h === '#gear') { show('gear'); mountGear(); return; }
  if (h === '#club' || h === '#people') { show('club'); mountClub(); return; }
  if (h.startsWith('#c/')) { show('club'); mountClubPage(h.slice(3).split('?')[0]); return; }
  if (h.startsWith('#join/')) { show('club'); mountJoin(h.slice(6).split('?')[0]); return; }
  if (h.startsWith('#r/')) { show('relay'); mountRelay(h.slice(3).split('?')[0]); return; }
  if (h === '#admin') { show('admin'); if (state.isAdmin !== false) mountAdmin($('view-admin')); return; }
  if (h.startsWith('#feedback')) { location.replace('#feed'); setTimeout(() => openFeedback(h.includes('problem') ? 'problem' : 'feature'), 300); return; }
  show('log');
  const bests = h === '#log/bests' || h.startsWith('#log/bests/') || h.startsWith('#log/bests?'), acts = h === '#log/activities', racesV = h === '#log/races';
  $('logMain').hidden = bests || acts || racesV; $('logBests').hidden = !bests; $('logGear').hidden = bests || acts || racesV; $('logActs').hidden = !acts; $('logRaces').hidden = !racesV;
  $('lognavMain').setAttribute('aria-pressed', !bests && !acts && !racesV); $('lognavRaces').setAttribute('aria-pressed', racesV); $('lognavBests').setAttribute('aria-pressed', bests); $('lognavActs').setAttribute('aria-pressed', acts);
  $('logGarmin').hidden = !state.activities.some(x => isGarmin(x.device));   // Garmin's guidelines: credit Garmin on totals, charts and bests
  if (acts) { mountActivities($('logActs')); emptyHint(); return; }
  if (racesV) { mountRaces($('logRaces')); return; }
  if (bests) { mountBests($('logBests'), h); emptyHint(); window.scrollTo(0, 0); return; }
  mountLog(logData());
  if (!bests) mountCal();
  emptyHint();
}
function emptyHint() {
  let el = $('emptyHint');
  if (state.activities.length) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'emptyHint'; el.className = 'card empty'; el.style.marginBottom = '16px';
    el.innerHTML = '<h2>No activities yet</h2><p class="sec">Add your first .fit file, or a whole Garmin export, to fill your log.</p><a class="btn primary" href="#upload" style="text-decoration:none">Upload activities</a>';
    $('view-log').prepend(el); }
}
window.addEventListener('hashchange', route);
// back and forward between clean addresses (no #) don't fire hashchange
window.addEventListener('popstate', () => { if (!location.hash) route(); });
// press / anywhere (outside a text box) to search your activities
document.addEventListener('keydown', e => { if (e.key !== '/' || e.metaKey || e.ctrlKey || /input|textarea|select/i.test(document.activeElement?.tagName) || !state.user) return; e.preventDefault(); if (curRoute() === '#log/activities') document.querySelector('.actsearch')?.focus(); else location.hash = '#log/activities'; });

// ---------- one activity ----------
const SPORT_FIT = { run: 'running', bike: 'cycling', swim: 'swimming', transition: 'transition', other: 'other' };
// Re-run the original file through processing: used by trim, restore and changing a leg's type (treadmill, track...).
// trim: [from, to] seconds from the file's start, 'none' to restore the full file, or undefined to keep the current trim.
// env: per-section types chosen by the user (kept for later re-processing).
export async function reprocess({ act, sections }, { trim, env, distFix } = {}) {
  // linked activities are rebuilt from each part's original file
  const fetchMsgs = async path => { const dl = await sb.storage.from('activity-files').download(path); if (dl.error) throw dl.error; return decodeFit(new Uint8Array(await dl.data.arrayBuffer())).messages; };
  const messages = act.summary?.linked
    ? mergeMessages(await Promise.all(act.summary.linked.parts.map(async p => ({ messages: await fetchMsgs(p.file_path) }))))
    : await fetchMsgs(act.file_path);
  const cur = act.summary?.trim, win = trim === 'none' ? null : trim || (cur ? [cur.from, cur.to] : null);
  const envs = env || act.summary?.env || null;
  // treadmill corrections only apply to legs that are still treadmill
  const fix = Object.fromEntries(Object.entries(distFix || act.summary?.distFix || {}).filter(([i, v]) => v > 0 && (!envs || envs[i] === 'treadmill')));
  const out = processFit(win ? trimMessages(messages, win[0], win[1]) : messages, { source: act.source, env: envs, distFix: fix, sourceId: act.summary?.linked ? act.source_id : undefined });
  enrich(out);
  const n = out.activity;
  if (win) n.summary.trim = { from: win[0], to: win[1], origElapsed: cur?.origElapsed || +act.elapsed_s }; else delete n.summary.trim;
  if (envs) n.summary.env = envs;
  if (Object.keys(fix).length) n.summary.distFix = fix; else delete n.summary.distFix;
  const upd = { start_time: n.start_time, distance_m: n.distance_m, elapsed_s: n.elapsed_s, moving_s: n.moving_s, ascent_m: n.ascent_m, descent_m: n.descent_m,
    calories: n.calories, avg_hr: n.avg_hr, max_hr: n.max_hr, indoor: n.indoor, summary: act.summary?.linked ? { ...n.summary, linked: act.summary.linked } : n.summary,
    ...(act.summary?.linked ? { name: act.name, multisport_profile: n.multisport_profile, sport: n.sport } : {}) };
  const r = await sb.from('activities').update(upd).eq('id', act.id); if (r.error) throw r.error;
  // keep gear on each leg: nth run section keeps the nth run's gear
  const bySport = {}; sections.forEach(s => (bySport[s.sport] ||= []).push(s.gear_id));
  const seen = {}; const gearFor = sp => { seen[sp] = (seen[sp] || 0) + 1; return (bySport[sp] || [])[seen[sp] - 1] || null; };
  await writeProcessed(act.id, out, act.share, gearFor, true);
  await refreshActs([act.id]);
  return n;
}
export async function fetchActivity(id) {
  const [a, s, l] = await Promise.all([
    sb.from('activities').select('*').eq('id', id).single(),
    sb.from('activity_sections').select('*').eq('activity_id', id).order('idx'),
    sb.from('activity_laps').select('*').eq('activity_id', id).order('idx'),
  ]);
  if (a.error || !a.data) {
    // not ours: read it through the sharing-aware function
    const v = await sb.rpc('view_activity', { aid: id });
    if (v.error || !v.data) throw (v.error || new Error('not visible'));
    const { act, sections, laps } = v.data;
    let streams = null;
    if (act.streams_path) { const dl = await sb.storage.from('activity-streams').download(act.streams_path); if (!dl.error) streams = JSON.parse(await dl.data.text()); }
    const ex = await sb.rpc('activity_extras', { aid: id });
    return { act, sections, laps, streams, media: ex.data?.media || [] };
  }
  const act = a.data, path = act.owner === state.user.id ? act.streams_path?.replace(/\.json$/, '.full.json') : act.streams_path;
  let streams = null;
  const [dl, md] = await Promise.all([path ? sb.storage.from('activity-streams').download(path) : { error: true }, sb.from('activity_media').select('*').eq('activity_id', id).order('position')]);
  if (!dl.error) streams = JSON.parse(await dl.data.text());
  return { act, sections: s.data || [], laps: l.data || [], streams, media: md.data || [] };
}
export function toRaw({ act, sections, laps, streams }) {
  const sm = act.summary || {};
  return {
    sessions: sections.map(s => ({ sport: SPORT_FIT[s.sport] || 'other', start: +s.start_offset_s, elapsed: +s.elapsed_s, timer: +s.timer_s, dist: +s.distance_m || 0,
      avgHr: s.avg_hr, maxHr: s.max_hr, ascent: s.ascent_m, descent: s.summary?.descent, avgSpeed: s.avg_speed, maxSpeed: s.summary?.maxSpeed,
      avgPower: s.avg_power, maxPower: s.summary?.maxPower, avgCad: s.avg_cadence, cal: s.summary?.calories, avgGct: s.summary?.avgGct, avgVo: s.summary?.avgVo,
      avgStride: s.summary?.avgStride, te: s.summary?.te, ate: s.summary?.ate, hrZones: [], lthr: sm.lthr, maxHrSet: sm.maxHr, env: s.summary?.env || null, trackOval: s.summary?.trackOval || null, swimTime: s.summary?.swimTime || null, swolf: s.summary?.swolf ?? null })),
    laps: laps.map(l => ({ sport: SPORT_FIT[l.sport] || 'other', start: +l.start_offset_s, elapsed: +l.elapsed_s, dist: +l.distance_m || 0, avgHr: l.avg_hr, maxHr: l.max_hr,
      avgSpeed: l.avg_speed, avgPower: l.avg_power, ascent: l.ascent_m })),
    recordFields: streams ? streams.fields : ['t'],
    records: streams ? rows(streams).map(o => streams.fields.map(f => o[f])) : [],
    meta: { start: act.start_time, device: act.device, sensors: [], utcOffsetH: act.utc_offset_min / 60, weight: act.summary?.weight || null },
  };
}
// settings in effect on the activity's day; other people's activities use what their watch recorded, else your own settings
let curAct = null;
export function cfgFor(act) {
  const now = Object.assign({}, DEFAULTS, state.profile?.settings || {});
  return settingsAt(act.owner === state.user.id ? now : { ...now, history: [] }, act);
}
async function openActivity(id) {
  show('loading');
  let data;
  try { data = await fetchActivity(id); } catch (e) { toast('Could not open that activity'); location.hash = '#log'; return; }
  const { act } = data;
  const tab = $('tab-activity'); tab.hidden = false; tab.href = '#a/' + id;
  const d = new Date(Date.parse(act.start_time) + act.utc_offset_min * 60000);
  tab.textContent = `${act.name} · ${d.getUTCDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  show('activity');
  // opened from a list (best efforts): a way back to it
  // a list (best efforts) that opened this activity leaves a way back in sessionStorage
  let back = null; try { const b = JSON.parse(sessionStorage.getItem('triven.back') || 'null'); if (b?.id === id) back = b.h; } catch { /* storage blocked */ }
  const bl = $('actBack');
  bl.hidden = !back; if (back) { bl.href = back; bl.textContent = backLabel(back); }
  renderActHeader(act, data.sections);
  if (!data.streams && !act.summary?.manual) toast('This activity has no detailed data file.', 4000);
  $('view-activity').classList.toggle('nodata', !data.streams);
  curAct = act;
  mountActivity(toRaw(data), cfgFor(act));
  document.dispatchEvent(new CustomEvent('triven:activity', { detail: data }));
}
export function renderActHeader(act, sections) {
  $('actName').replaceChildren(act.name); if (act.is_race) $('actName').append(' ', raceFlag(26));
  $('actDesc').textContent = act.description || '';
  const tags = $('actTags'); tags.replaceChildren();
  const T = { run: 'Run', bike: 'Ride', swim: 'Swim', other: 'Workout' };
  const add = t => { const s = document.createElement('span'); s.className = 'tag'; s.textContent = t; tags.append(s); };
  if (act.sport === 'multi') { add((act.summary?.distanceClass ? act.summary.distanceClass + ' ' : '') + (act.multisport_profile === 'other' ? 'Multisport' : act.multisport_profile)); if (act.summary?.linked) add(`Joined from ${act.summary.linked.parts.length} files`); add(sections.filter(s => s.sport !== 'transition').map(s => T[s.sport] === 'Ride' ? 'Bike' : T[s.sport]).join(' · ')); }
  else add(sections[0] ? envLabel(sections.find(s => s.sport !== 'transition')?.sport || act.sport, sections.find(s => s.sport !== 'transition')?.summary?.env) : (T[act.sport] || 'Workout'));
  if (act.athlete && act.owner !== state.user.id) add(act.athlete);
  if (act.indoor && act.sport === 'multi') add('Indoor');
  const tr = sections.find(s => s.summary?.env === 'track');
  if (tr) add(tr.summary.trackFit == null ? 'Track (no track found in GPS)' : 'Snapped to track');
  if (act.summary?.manual) add('Logged by hand');
  if (act.owner !== state.user.id) add(VIS[act.visibility]);
}
export const VIS = { private: 'Only me', followers: 'Followers', club: 'Club', public: 'Everyone' };

// profile photos (public bucket 'avatars'); falls back to the first letter of the name
export const avatarUrl = path => path ? sb.storage.from('avatars').getPublicUrl(path).data.publicUrl : null;
export function avatarEl(name, path, size = 34) {
  const s = document.createElement('span'); s.className = 'avatar'; s.style.width = s.style.height = size + 'px'; s.style.fontSize = Math.round(size * 0.42) + 'px';
  const url = avatarUrl(path);
  if (url) { const i = document.createElement('img'); i.src = url; i.alt = ''; i.loading = 'lazy'; i.onerror = () => { i.remove(); s.textContent = (name || '?').trim()[0]?.toUpperCase() || '?'; }; s.append(i); }
  else s.textContent = (name || '?').trim()[0]?.toUpperCase() || '?';
  return s;
}
// crop to a centred square, 400 px JPEG
async function squareJpeg(file, px = 400) {
  const img = await createImageBitmap(file); const side = Math.min(img.width, img.height);
  const c = document.createElement('canvas'); c.width = c.height = px;
  c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, px, px);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
}
function paintAvatar() {
  const p = state.profile || {};
  $('p_avatar').replaceChildren(avatarEl(p.display_name, p.avatar_path, 64)); $('p_avdel').hidden = !p.avatar_path;
  const chip = $('acctAvatar'); chip.replaceChildren(avatarEl(p.display_name || state.user?.email, p.avatar_path, 26));
}
export function initAvatar() {
  $('p_avpick').onclick = () => $('p_avfile').click();
  $('p_avfile').onchange = async () => {
    const f = $('p_avfile').files[0]; $('p_avfile').value = ''; if (!f) return;
    try {
      const blob = await squareJpeg(f), path = `${state.user.id}/avatar-${Date.now()}.jpg`, old = state.profile.avatar_path;
      const up = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error;
      const r = await sb.from('profiles').update({ avatar_path: path }).eq('id', state.user.id); if (r.error) throw r.error;
      state.profile.avatar_path = path; if (old) sb.storage.from('avatars').remove([old]);
      paintAvatar(); toast('Profile photo updated');
    } catch (e) { toast('Could not set the photo: ' + (e.message || e)); }
  };
  $('p_avdel').onclick = async () => {
    const old = state.profile.avatar_path; if (!old) return;
    const r = await sb.from('profiles').update({ avatar_path: null }).eq('id', state.user.id); if (r.error) { toast(r.error.message); return; }
    state.profile.avatar_path = null; sb.storage.from('avatars').remove([old]); paintAvatar(); toast('Photo removed');
  };
}

// chequered flag shown next to the title of races
export function raceFlag(size = 18) {
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('class', 'raceflag'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Race');
  svg.innerHTML = '<title>Race</title><path d="M3 2v17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="4" y="3" width="13" height="9" rx="1" fill="#fff" stroke="currentColor" stroke-width="1.2"/>'
    + [[4, 3], [10.5, 3], [7.25, 6], [13.75, 6], [4, 9], [10.5, 9]].map(([x, y]) => `<rect x="${x}" y="${y}" width="3.25" height="3" fill="currentColor"/>`).join('');
  return svg;
}

// default gear: is_default_for holds roles like "run:road,run:race" (old single values 'run'/'bike' mean everyday)
export const GEAR_ROLES = { shoe: [['run:road', 'Everyday runs'], ['run:trail', 'Trail'], ['run:track', 'Track'], ['run:treadmill', 'Treadmill'], ['run:race', 'Races']],
  bike: [['bike:road', 'Everyday rides'], ['bike:indoor', 'Indoor / virtual'], ['bike:gravel', 'Gravel'], ['bike:mtb', 'Mountain bike'], ['bike:race', 'Races']] };
export { gearRoles };
export const pickGear = (sport, env, race, day) => pickGearFrom(state.gear, sport, env, race, day);   // day: activity's local YYYY-MM-DD

// ---------- upload ----------
const drop = $('drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => handleFiles([...e.dataTransfer.files]));
$('fileIn').onchange = e => { handleFiles([...e.target.files]); e.target.value = ''; };

function upRow(name) {
  const r = document.createElement('div'); r.className = 'uprow'; const n = document.createElement('span'); n.textContent = name;
  const st = document.createElement('span'); st.className = 'st'; st.textContent = 'Waiting'; r.append(n, st); $('upList').prepend(r);
  return { set(t, cls) { st.textContent = t; if (cls) r.className = 'uprow ' + cls; } };
}
async function* fitEntries(files) {
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) yield* zipEntries(await JSZip.loadAsync(f), f.name);
    else if (/\.fit$/i.test(f.name)) yield { name: f.name, data: new Uint8Array(await f.arrayBuffer()) };
  }
}
async function* zipEntries(zip, label) {
  for (const e of Object.values(zip.files)) {
    if (e.dir) continue;
    if (/\.fit$/i.test(e.name)) yield { name: e.name.split('/').pop(), data: await e.async('uint8array') };
    else if (/\.zip$/i.test(e.name)) yield* zipEntries(await JSZip.loadAsync(await e.async('uint8array')), e.name);
  }
}
let busy = false;
async function handleFiles(files) {
  if (busy) { toast('Already importing; wait for it to finish.'); return; }
  busy = true; let added = 0, skipped = 0, failed = 0, notActivity = 0; const fresh = [];
  const summaryRow = upRow(`Importing ${files.length} file${files.length > 1 ? 's' : ''}`);
  try {
    for await (const ent of fitEntries(files)) {
      const row = upRow(ent.name);
      try {
        const res = await importFit(ent, row);
        if (res === 'skip') skipped++; else if (res === 'notact') notActivity++; else { added++; if (res.id) fresh.push(res); }
      } catch (e) { failed++; row.set('Failed: ' + (e.message || e), 'err'); }
      summaryRow.set(`${added} added · ${skipped} already in Triven · ${failed} failed`);
    }
  } finally { busy = false; }
  summaryRow.set(`Done: ${added} added · ${skipped} already in Triven${notActivity ? ` · ${notActivity} non-activity files ignored` : ''}${failed ? ` · ${failed} failed` : ''}`, failed ? 'err' : 'ok');
  if (added) { await refreshActs(fresh.map(f => f.id)); toast(`${added} ${added === 1 ? 'activity' : 'activities'} added`); }
  // files that follow on from each other (within 10 minutes) may be one race recorded as separate activities
  const groups = consecutiveGroups(fresh, 10 * 60e3);
  if (groups.length) offerCombine(groups);
}
export function consecutiveGroups(list, maxGap) {
  const a = list.filter(x => x.sport !== 'multi').sort((p, q) => p.start - q.start), out = [];
  let g = [];
  for (const x of a) {
    if (g.length && x.start - g[g.length - 1].end <= maxGap && x.start - g[g.length - 1].end > -5000 && g.length < 5) g.push(x);
    else { if (g.length > 1) out.push(g); g = [x]; }
  }
  if (g.length > 1) out.push(g);
  return out;
}

export function enrich(out) { enrichOut(out, state.profile?.settings); }
// write streams, sections, laps and bests for an activity (new, or replacing after a trim)
export const writeProcessed = (id, out, share, gearBySport, replace) => saveProcessed(sb, state.user.id, id, out, share, gearBySport, replace);

export async function importFit(ent, row) {
  const { messages, errors } = decodeFit(ent.data);
  row.set('Saving');
  const r = await importDecoded(sb, { uid: state.user.id, messages, errors, raw: ent.data, source: /^\d+_ACTIVITY\.fit$/i.test(ent.name) ? 'garmin_export' : 'upload', profile: state.profile, gear: state.gear });
  if (r.settings) state.profile.settings = r.settings;
  if (r.status === 'notact') { row.set('Not an activity (skipped)'); return 'notact'; }
  if (r.status === 'skip') { row.set('Already in Triven', 'ok'); return 'skip'; }
  const a = r.activity, drv = a.summary.driving?.length ? ' · looks like it includes driving, check it' : '';
  row.set(`Added: ${a.name}, ${uDist(a.distance_m, 1)}${drv}`, 'ok');
  const start = Date.parse(a.start_time);
  return { id: r.id, sport: a.sport, start, end: start + (+a.elapsed_s || 0) * 1000 };
}

// start
// the update reload's ?build= marker has done its job
if (/[?&]build=/.test(location.search)) history.replaceState(null, '', location.pathname + location.search.replace(/[?&]build=\d+/, '').replace(/^&/, '?') + location.hash);
if (location.hash.startsWith('#u/')) { try { localStorage.setItem('triven.link', location.hash); } catch { /* storage blocked */ } }
if (location.hash.startsWith('#join/')) { try { localStorage.setItem('triven.join', location.hash.slice(6).split('?')[0]); } catch { /* storage blocked */ } }
(async () => {
  const { data } = await sb.auth.getSession();
  if (!data.session) show('auth');
})();

// GitHub Pages lets browsers cache index.html for up to 10 minutes, which can keep an old build running after an
// update. Check for a newer build when the app opens, when it comes back to the foreground and every few minutes,
// and load it (with a fresh URL so the cache is skipped) unless a dialog is open.
const MY_BUILD = new URL(import.meta.url).searchParams.get('v');
async function checkForUpdate() {
  if (busy) return;   // never reload during an import: it would stop it part-way (checked again every few minutes)
  try {
    const html = await (await fetch('/index.html?nc=' + Date.now(), { cache: 'no-store' })).text();
    const live = html.match(/js\/main\.js\?v=(\d+)/)?.[1];
    if (!live || !MY_BUILD || live === MY_BUILD) return;
    const go = () => location.replace('/?build=' + live + curRoute());   // the build number skips the cached page; it's removed again on load
    if (!$('modal').classList.contains('open') && !$('settings')?.classList.contains('open')) go();
    else toast('Triven has been updated. It will reload when you close this.', 6000), document.addEventListener('click', function once() { if (!$('modal').classList.contains('open')) { document.removeEventListener('click', once, true); go(); } }, true);
  } catch { /* offline: try again later */ }
}
checkForUpdate(); setInterval(checkForUpdate, 5 * 60e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
