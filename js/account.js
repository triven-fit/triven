// Your data: download everything as a zip, or delete the account and all of it.
import { deviceLabel } from './garmin.js?v=1795310749';
import { sb, state, toast, JSZip } from './main.js?v=1795310749';

const $ = id => document.getElementById(id);
const BUCKETS = ['activity-files', 'activity-streams', 'activity-media', 'avatars'];

async function rows(make) {                       // page past the 1000-row API limit
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999); if (error) throw error;
    out.push(...data); if (data.length < 1000) return out;
  }
}
// every stored file under <your id>/ in a bucket (folders are walked)
export async function listFiles(bucket, prefix) {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    for (const f of data) {
      const p = `${prefix}/${f.name}`;
      if (f.id == null) files.push(...await listFiles(bucket, p)); else files.push(p);
    }
    if (data.length < 1000) return files;
  }
}
const csvCell = v => v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
function activitiesCsv(acts) {
  const cols = ['num', 'start_time', 'name', 'sport', 'multisport_profile', 'distance_m', 'moving_s', 'elapsed_s', 'ascent_m', 'avg_hr', 'calories', 'is_race', 'indoor', 'visibility', 'description', 'device'];
  // the device column is the Garmin attribution Garmin's guidelines ask for on exported data ("Garmin <model>")
  return [cols.join(','), ...acts.map(a => cols.map(c => csvCell(c === 'device' ? deviceLabel(a.device) : a[c])).join(','))].join('\n');
}

async function exportData(btn, withFiles) {
  const me = state.user.id, zip = new JSZip(), say = t => { $('dataMsg').textContent = t; };
  say('Gathering your data…');
  const acts = await rows(() => sb.from('activities').select('*, activity_sections(*), activity_laps(*)').eq('owner', me).order('start_time'));
  const [gear, bests, ignores, comments, kudos, follows, clubs, posts, media] = await Promise.all([
    rows(() => sb.from('gear').select('*').eq('owner', me)),
    rows(() => sb.from('best_efforts').select('*').eq('owner', me)),
    rows(() => sb.from('best_ignores').select('*').eq('owner', me)),
    rows(() => sb.from('comments').select('*').eq('author', me)),
    rows(() => sb.from('kudos').select('*').eq('user_id', me)),
    rows(() => sb.from('follows').select('*').or(`follower.eq.${me},followee.eq.${me}`)),
    rows(() => sb.from('club_members').select('*, clubs(name)').eq('user_id', me)),
    rows(() => sb.from('club_posts').select('*').eq('author', me)),
    rows(() => sb.from('activity_media').select('*').eq('owner', me)),
  ]);
  const j = o => JSON.stringify(o, null, 1);
  zip.file('README.txt', `Your Triven data, exported ${new Date().toISOString()}.\n\nprofile.json: your profile and settings (thresholds, goals, races).\nactivities.csv: one line per activity (the device column says which watch or computer recorded it; activities from Garmin devices are attributed to Garmin).\nactivities.json: everything about each activity, with multisport sections and laps.\ngear.json, best_efforts.json, comments.json, kudos.json, follows.json, clubs.json, club_posts.json, photos.json.\n${withFiles ? 'files/: your original activity files (.fit), the processed data streams, photos and your profile picture.\n' : ''}`);
  zip.file('profile.json', j({ ...state.profile, email: state.user.email }));
  zip.file('activities.csv', activitiesCsv(acts));
  zip.file('activities.json', j(acts));
  zip.file('gear.json', j(gear)); zip.file('best_efforts.json', j(bests.map(b => ({ ...b, ignored: ignores.some(i => i.activity_id === b.activity_id && i.sport === b.sport && i.effort === b.effort) || undefined }))));
  zip.file('comments.json', j(comments)); zip.file('kudos.json', j(kudos)); zip.file('follows.json', j(follows));
  zip.file('clubs.json', j(clubs)); zip.file('club_posts.json', j(posts)); zip.file('photos.json', j(media));
  if (withFiles) {
    const all = [];
    for (const b of BUCKETS) { say(`Finding files (${b})…`); (await listFiles(b, me)).forEach(p => all.push([b, p])); }
    let done = 0, failed = 0;
    const work = async () => { for (let x; (x = all.shift());) {
      const [b, p] = x, { data, error } = await sb.storage.from(b).download(p);
      if (error) failed++; else zip.file(`files/${b}/${p.slice(me.length + 1)}`, data);
      if (++done % 20 === 0) say(`Downloading files… ${done} done`);
    } };
    await Promise.all(Array.from({ length: 6 }, work));
    if (failed) toast(`${failed} file${failed > 1 ? 's' : ''} couldn't be downloaded and are missing from the zip.`);
  }
  say('Packing the zip…');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `triven-${state.profile?.handle || 'data'}-${new Date().toISOString().slice(0, 10)}.zip` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60e3);
  say(`Downloaded: ${acts.length} activities${withFiles ? ' with their files' : ''}.`);
}

async function deleteAccount() {
  const me = state.user.id, say = t => { $('delMsg').textContent = t; };
  say('Deleting your files…');
  for (const b of BUCKETS) {
    const files = await listFiles(b, me);
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await sb.storage.from(b).remove(files.slice(i, i + 100)); if (error) throw error;
      say(`Deleting your files… (${b}, ${Math.min(i + 100, files.length)} of ${files.length})`);
    }
  }
  say('Deleting your account…');
  const { error } = await sb.rpc('delete_my_account'); if (error) throw error;
  try { localStorage.clear(); sessionStorage.clear(); } catch {}
  await sb.auth.signOut().catch(() => {});
  location.replace('/?deleted=1');
}

export function initAccountData() {
  const ex = $('dataExport'), del = $('delAccount'); if (!ex || ex.dataset.ready) return; ex.dataset.ready = 1;
  ex.onclick = () => exportData(ex, $('dataFiles').checked).catch(e => { $('dataMsg').textContent = 'Export failed: ' + (e.message || e); });
  $('delConfirm').oninput = () => { del.disabled = $('delConfirm').value.trim().toLowerCase() !== 'delete'; };
  // second step: an explicit warning before anything is touched
  del.onclick = () => {
    const n = state.activities.length;
    $('delSureBody').textContent = `This cannot be undone. Your account, ${n.toLocaleString()} activit${n === 1 ? 'y' : 'ies'} with their original files, photos, gear, bests, comments and follows will be permanently deleted, and you'll be signed out.`;
    $('delSure').hidden = false; del.hidden = true; $('delNo').focus();
  };
  const reset = () => { $('delSure').hidden = true; del.hidden = false; };
  $('delNo').onclick = () => { reset(); $('delConfirm').value = ''; del.disabled = true; };
  $('delConfirm').addEventListener('input', () => { if ($('delConfirm').value.trim().toLowerCase() !== 'delete') reset(); });
  $('delYes').onclick = () => { $('delNo').disabled = true;
    return deleteAccount().catch(e => { $('delNo').disabled = false; $('delMsg').textContent = "Couldn't finish: " + (e.message || e) + '. Try again; anything already removed stays removed.'; }); };
}
