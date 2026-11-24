// Automatic sync. The server (Edge Function "sync") checks each connected member on their own schedule (every 30 minutes
// for active members, less often for quiet ones), fetches new activities into an inbox and processes them. Opening the app
// also asks for a check if the last one was over 10 minutes ago; anything the server couldn't finish is processed here.
import { sb, state, toast, refreshActs } from './main.js?v=1795534599';
import { decodeFit } from './fit.js?v=1795534599';
import { importDecoded } from './pipeline.js?v=1795534599';

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
let busy = false;

// process inbox files: the server gets the first 12 minutes (or two tries), unless `now` is set (Sync now)
export async function processInbox(now = false) {
  if (busy || !state.user) return 0; busy = true; let n = 0; const ids = [];
  try {
    const { data: items } = await sb.from('sync_inbox').select('*').eq('owner', state.user.id).eq('status', 'new').order('start_time');
    const due = (items || []).filter(it => now || it.attempts >= 2 || Date.now() - Date.parse(it.created_at) > 12 * 60e3);
    for (const it of due) {
      try {
        const dl = await sb.storage.from('activity-files').download(it.file_path); if (dl.error) throw dl.error;
        const raw = new Uint8Array(await dl.data.arrayBuffer());
        const { messages, errors } = decodeFit(raw);
        const r = await importDecoded(sb, { uid: state.user.id, messages, errors, raw, source: it.provider, profile: state.profile, gear: state.gear, extra: { external: { [it.provider]: it.external_id } } });
        if (r.settings) state.profile.settings = r.settings;
        await sb.from('sync_inbox').update({ status: r.status === 'ok' ? 'done' : r.status === 'skip' ? 'skip' : 'failed', activity_id: r.id || null, error: r.status === 'notact' ? 'not an activity' : null }).eq('id', it.id);
        if (r.status === 'ok' || r.status === 'skip') sb.storage.from('activity-files').remove([it.file_path]);
        if (r.status === 'ok') { n++; ids.push(r.id); }
      } catch (e) { await sb.from('sync_inbox').update({ status: 'failed', error: String(e.message || e) }).eq('id', it.id); }
    }
    if (n) { await refreshActs(ids); toast(`${n} new ${n === 1 ? 'activity' : 'activities'} synced`); if (!state.route?.startsWith('#a/')) window.dispatchEvent(new HashChangeEvent('hashchange')); }
  } finally { busy = false; }
  return n;
}

// on opening the app: ask for a check if it's been a while, then import whatever is waiting
export async function checkOnOpen() {
  if (!state.user) return;
  try {
    const { data: c } = await sb.from('connections').select('last_sync,status').eq('owner', state.user.id).eq('provider', 'intervals').maybeSingle();
    if (c && (!c.last_sync || Date.now() - Date.parse(c.last_sync) > 10 * 60e3)) await sb.functions.invoke('sync', { body: { mode: 'mine' } });
  } catch {}
  await processInbox().catch(() => {});
}

// Settings → Connected services
export async function paintConnections() {
  const box = $('connBox'); if (!box || !state.user) return;
  const { data: conns } = await sb.from('connections').select('*').eq('owner', state.user.id);
  const c = (conns || []).find(x => x.provider === 'intervals');
  box.replaceChildren();
  const head = el('div', { className: 'connhead' }, el('b', { textContent: 'intervals.icu' }),
    el('span', { className: 'muted', textContent: ' · brings in Garmin, COROS, Wahoo, Suunto, Polar and Zwift automatically' }));
  box.append(head);
  if (c) {
    const when = c.last_sync ? new Date(c.last_sync).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'not yet';
    const { count } = await sb.from('sync_inbox').select('id', { count: 'exact', head: true }).eq('owner', state.user.id).eq('status', 'done');
    box.append(el('div', { className: c.status === 'error' ? 'connstat bad' : 'connstat' }, c.status === 'error' ? `Problem: ${c.last_error}` : `Connected as ${c.athlete_id} · last checked ${when} · ${count || 0} imported`));
    const now = el('button', { className: 'btn sm primary', type: 'button', textContent: 'Sync now' });
    now.onclick = async () => { now.disabled = true; now.textContent = 'Checking…';
      const r = await sb.functions.invoke('sync', { body: { mode: 'mine', force: true } });
      if (r.error) toast('Sync failed: ' + (r.error.message || r.error));
      const n = await processInbox(true); if (!n && !r.error) toast('Nothing new');
      now.disabled = false; now.textContent = 'Sync now'; paintConnections(); };
    const off = el('button', { className: 'linkbtn', type: 'button', textContent: 'Disconnect', style: 'color:var(--text-muted)' });
    off.onclick = async () => { if (!off.dataset.armed) { off.dataset.armed = 1; off.textContent = 'Click again to disconnect'; return; }
      await sb.from('connections').delete().eq('owner', state.user.id).eq('provider', 'intervals'); toast('Disconnected; your key has been deleted'); paintConnections(); };
    box.append(el('div', { style: 'display:flex;gap:12px;align-items:center;margin-top:8px' }, now, off));
  } else {
    const id = el('input', { type: 'text', placeholder: 'i123456', autocomplete: 'off', style: 'width:130px' });
    const key = el('input', { type: 'password', placeholder: 'API key', autocomplete: 'off' });
    const go = el('button', { className: 'btn sm primary', type: 'button', textContent: 'Connect' });
    const msg = el('div', { className: 'note' });
    go.onclick = async () => {
      if (!/^i?\d+$/.test(id.value.trim()) || key.value.trim().length < 10) { msg.textContent = 'Enter your athlete ID (like i123456) and the API key from intervals.icu.'; return; }
      go.disabled = true; msg.textContent = 'Connecting…';
      const r = await sb.rpc('connect_intervals', { p_athlete: id.value.trim(), p_key: key.value.trim() });
      if (r.error) { msg.textContent = r.error.message; go.disabled = false; return; }
      key.value = '';
      const s = await sb.functions.invoke('sync', { body: { mode: 'mine', force: true } });
      if (s.error) msg.textContent = 'Connected, but the first check failed: ' + (s.error.message || s.error);
      await processInbox(true); paintConnections();
    };
    box.append(el('ol', { className: 'connsteps' },
      el('li', {}, 'In ', el('a', { href: 'https://intervals.icu/settings', target: '_blank', rel: 'noopener', textContent: 'intervals.icu settings' }), ', connect your Garmin, COROS or other watch account (free).'),
      el('li', {}, 'In the same settings page, under ', el('b', { textContent: 'Developer Settings' }), ', create an API key and copy it with your athlete ID (shown there, like i123456).'),
      el('li', {}, 'Paste both here. New activities then arrive in Triven on their own: straight away when you open the app, and otherwise within about half an hour of your watch syncing.')),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' }, id, key, go), msg,
      el('div', { className: 'note', textContent: 'Your key is stored where only the sync server can read it, and deleted if you disconnect. Activities that reached intervals.icu from Strava can’t be passed on (Strava’s rules); ones from your watch can.' }));
  }
}
