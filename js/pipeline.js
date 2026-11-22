// Turning a decoded FIT file into Triven rows and files. No browser or app state in here, so the same code runs in
// the app (uploads, trims) and on the server (automatic sync from intervals.icu).
import { processFit, shareStreams, makeTrack, detectDriving, rows } from './process.js?v=1795312012';
import { loadData } from './load.js?v=1795312012';
import { perfData } from './perf.js?v=1795312012';
import { DEFAULTS } from './defaults.js?v=1795312012';

// default gear: is_default_for holds roles like "run:road,run:race" (old single values 'run'/'bike' mean everyday)
export const gearRoles = g => !g.is_default_for ? [] : g.is_default_for === 'run' ? ['run:road'] : g.is_default_for === 'bike' ? ['bike:road'] : g.is_default_for.split(',').filter(Boolean);
// only gear in use on that day (day: 'YYYY-MM-DD', the activity's local date): its in-use-from date, or the day it was added
export const gearFrom = g => g.in_use_from || (g.created_at || '').slice(0, 10) || null;
export function pickGearFrom(gear, sport, env, race, day) {
  if (sport !== 'run' && sport !== 'bike') return null;
  const live = (gear || []).filter(g => !g.retired && (!day || !gearFrom(g) || gearFrom(g) <= day)), has = role => live.find(g => gearRoles(g).includes(role))?.id;
  const e = env === 'virtual' ? 'indoor' : env;
  return (race && has(`${sport}:race`)) || (e && e !== 'road' && has(`${sport}:${e}`)) || has(`${sport}:road`) || null;
}

const localDay = a => new Date(Date.parse(a.start_time) + (a.utc_offset_min || 0) * 60000).toISOString().slice(0, 10);

// extras worked out for every processed activity: route thumbnail, possible driving, load and threshold data
export function enrichOut(out, settings) {
  out.activity.summary.track = makeTrack(out.streams, out.sections);
  out.activity.summary.driving = detectDriving(out.sections, out.streams);
  out.activity.summary.loadData = loadData(out.sections, out.streams);
  out.activity.summary.perf = perfData(out.sections, out.streams);
}

export const DEFAULT_SHARE = { map: true, hr: true, power: true, pace: true, cadence: true, dynamics: true, description: true };
const jsonBlob = o => new Blob([JSON.stringify(o)], { type: 'application/json' });

// streams files, then sections / laps / best efforts (replacing any existing ones)
export async function saveProcessed(sb, uid, id, out, share, gearBySport, replace) {
  const base = `${uid}/${id}`;
  const ups = await Promise.all([
    sb.storage.from('activity-streams').upload(`${base}.full.json`, jsonBlob(out.streams), { upsert: replace }),
    sb.storage.from('activity-streams').upload(`${base}.json`, jsonBlob(shareStreams(out.streams, share)), { upsert: replace }),
  ]);
  const upErr = ups.find(u => u.error); if (upErr) throw upErr.error;
  if (replace) {
    const del = await Promise.all(['activity_sections', 'activity_laps', 'best_efforts'].map(t => sb.from(t).delete().eq('activity_id', id)));
    const e = del.find(x => x.error); if (e) throw e.error;
  }
  const multi = out.activity.sport === 'multi';
  const secs = out.sections.map(s => ({ ...s, activity_id: id, gear_id: multi && (s.sport === 'run' || s.sport === 'bike') ? gearBySport(s.sport, s.idx) : null }));
  const res = await Promise.all([
    sb.from('activity_sections').insert(secs),
    out.laps.length ? sb.from('activity_laps').insert(out.laps.map(l => ({ ...l, activity_id: id }))) : { error: null },
    out.bests.length ? sb.from('best_efforts').insert(out.bests.map(b => ({ ...b, activity_id: id, owner: uid }))) : { error: null },
  ]);
  const err = res.find(x => x.error); if (err) throw err.error;
}

// a whole new activity from a decoded file. profile = the owner's profiles row, gear = their gear rows.
// Returns { status: 'ok' | 'skip' | 'notact', id, activity, settings } (settings is set when the watch filled in thresholds).
export async function importDecoded(sb, { uid, messages, errors, raw, source, profile, gear, extra }) {
  if (!messages.sessionMesgs?.length) return { status: 'notact' };
  if (errors?.length && !messages.recordMesgs?.length) throw new Error('file is damaged');
  const out = processFit(messages, { source });
  // the same file arriving twice (upload and sync, or two syncs) is kept once
  const dup = await sb.from('activities').select('id').eq('owner', uid).eq('source_id', out.activity.source_id).maybeSingle();
  if (dup.data) return { status: 'skip', id: dup.data.id };
  const inLinked = await sb.from('activities').select('id').eq('owner', uid).contains('summary', { linked: { sourceIds: [out.activity.source_id] } }).limit(1);
  if (inLinked.data?.length) return { status: 'skip', id: inLinked.data[0].id };
  // first activity fills athlete settings from the watch if they were never set
  let st = { ...(profile.settings || {}) }, settingsChanged = false;
  if (!st.fromWatch && out.activity.summary.lthr) {
    const lthr = out.activity.summary.lthr;
    Object.assign(st, { lthrRun: lthr, lthrBike: lthr - 5, maxHr: out.activity.summary.maxHr || st.maxHr, mass: st.massSet ? st.mass : (out.activity.summary.weight || st.mass), fromWatch: true });
    const r = await sb.from('profiles').update({ settings: st }).eq('id', uid); if (!r.error) settingsChanged = true;
  }
  enrichOut(out, st);
  const a = out.activity;
  if (extra) Object.assign(a.summary, extra);
  const day = localDay(a);
  if (a.sport === 'run' || a.sport === 'bike') a.gear_id = pickGearFrom(gear, a.sport, out.sections.find(s => s.sport === a.sport)?.summary?.env, false, day);
  a.owner = uid; a.visibility = profile.default_visibility || 'club'; a.share = profile.default_share || DEFAULT_SHARE;
  const ins = await sb.from('activities').insert(a).select('id').single();
  if (ins.error) throw ins.error;
  const id = ins.data.id, base = `${uid}/${id}`;
  const up = await sb.storage.from('activity-files').upload(`${base}.fit`, new Blob([raw], { type: 'application/octet-stream' }), { upsert: true });
  if (up.error) throw up.error;
  await saveProcessed(sb, uid, id, out, a.share, (sp, idx) => pickGearFrom(gear, sp, out.sections[idx]?.summary?.env, false, day), false);
  const r2 = await sb.from('activities').update({ file_path: `${base}.fit`, streams_path: `${base}.json` }).eq('id', id); if (r2.error) throw r2.error;
  return { status: 'ok', id, activity: a, settings: settingsChanged ? st : null };
}

// ---------- linking separate activities into one multisport activity ----------
// parts: [{ messages }], in any order. Sessions are put in time order, each file's distances are made continuous, and the
// gap between the end of one part and the start of the next becomes a transition leg.
export function mergeMessages(parts) {
  const P = parts.map(p => p.messages).filter(m => m.sessionMesgs?.length)
    .sort((a, b) => +a.sessionMesgs[0].startTime - +b.sessionMesgs[0].startTime);
  if (P.length < 2) throw new Error('pick at least two activities');
  const end = m => Math.max(...m.sessionMesgs.map(s => +s.startTime + (s.totalElapsedTime || 0) * 1000));
  const out = { fileIdMesgs: P[0].fileIdMesgs, deviceInfoMesgs: P[0].deviceInfoMesgs || [], userProfileMesgs: P[0].userProfileMesgs || [],
    timeInZoneMesgs: (P[0].timeInZoneMesgs || []).filter(z => z.referenceMesg === 'session').slice(0, 1),
    sessionMesgs: [], lapMesgs: [], recordMesgs: [], lengthMesgs: [], eventMesgs: [] };
  let distOff = 0, timer = 0;
  P.forEach((m, i) => {
    if (i > 0) {
      const gapStart = end(P[i - 1]), gapEnd = +m.sessionMesgs[0].startTime, gap = (gapEnd - gapStart) / 1000;
      if (gap < -5) throw new Error('two of these activities overlap in time');
      if (gap > 1) out.sessionMesgs.push({ sport: 'transition', startTime: new Date(gapStart), totalElapsedTime: gap, totalTimerTime: gap, totalDistance: 0 });
    }
    m.sessionMesgs.forEach(s => { out.sessionMesgs.push(s); timer += s.totalTimerTime || 0; });
    out.lapMesgs.push(...(m.lapMesgs || []));
    out.lengthMesgs.push(...(m.lengthMesgs || []));
    const recs = m.recordMesgs || []; let maxD = 0;
    recs.forEach(r => { if (r.distance != null) { maxD = Math.max(maxD, r.distance); out.recordMesgs.push({ ...r, distance: r.distance + distOff }); } else out.recordMesgs.push(r); });
    distOff += Math.max(maxD, m.sessionMesgs.reduce((p, s) => p + (s.totalDistance || 0), 0));
  });
  out.recordMesgs.sort((a, b) => +a.timestamp - +b.timestamp);
  const a0 = P[0].activityMesgs?.[0] || {}, last = P[P.length - 1].activityMesgs?.[0] || {};
  out.activityMesgs = [{ ...a0, timestamp: last.timestamp || new Date(end(P[P.length - 1])), localTimestamp: a0.localTimestamp, totalTimerTime: timer }];
  return out;
}

// parts: [{ act, sections, messages }] — the owner's activities with their decoded original files
export async function linkActivities(sb, { uid, parts, profile, gear }) {
  if (parts.length < 2 || parts.length > 5) throw new Error('link between 2 and 5 activities');
  if (parts.some(p => p.act.summary?.linked)) throw new Error('one of these is already linked: unlink it first');
  if (parts.some(p => !p.act.file_path)) throw new Error('activities logged by hand can’t be linked (they have no file)');
  parts = parts.slice().sort((a, b) => Date.parse(a.act.start_time) - Date.parse(b.act.start_time));
  const flat = parts.map(p => ({ file_path: p.act.file_path, source_id: p.act.source_id, name: p.act.name, start_time: p.act.start_time, source: p.act.source, messages: p.messages }));
  const sourceIds = flat.map(f => f.source_id);
  const merged = mergeMessages(flat);
  const out = processFit(merged, { source: flat[0].source || 'upload', sourceId: 'linked:' + sourceIds.join('+') });
  enrichOut(out, profile.settings);
  const a = out.activity, first = parts[0].act;
  a.owner = uid; a.visibility = first.visibility; a.share = first.share || DEFAULT_SHARE; a.is_race = parts.some(p => p.act.is_race);
  a.summary.linked = { parts: flat.map(({ messages, ...f }) => f), sourceIds };
  // keep the gear each part had: nth run leg gets the nth run's gear
  const gearQueue = {}; parts.forEach(p => (p.sections.length ? p.sections : [{ sport: p.act.sport, gear_id: p.act.gear_id }]).forEach(s => (gearQueue[s.sport] ||= []).push(s.gear_id || p.act.gear_id || null)));
  const seen = {}, gearFor = sp => { seen[sp] = (seen[sp] || 0) + 1; return (gearQueue[sp] || [])[seen[sp] - 1] || pickGearFrom(gear, sp, null, a.is_race, localDay(a)); };
  const ins = await sb.from('activities').insert(a).select('id').single();
  if (ins.error) throw ins.error;
  const id = ins.data.id;
  await saveProcessed(sb, uid, id, out, a.share, gearFor, false);
  await sb.from('activities').update({ streams_path: `${uid}/${id}.json` }).eq('id', id);
  // photos move to the new activity; the separate rows go (their original files are kept for unlinking)
  const oldIds = parts.map(p => p.act.id);
  await sb.from('activity_media').update({ activity_id: id }).in('activity_id', oldIds);
  const oldStreams = parts.flatMap(p => p.act.streams_path ? [p.act.streams_path, p.act.streams_path.replace(/\.json$/, '.full.json')] : []);
  const del = await sb.from('activities').delete().in('id', oldIds);
  if (del.error) throw del.error;
  if (oldStreams.length) await sb.storage.from('activity-streams').remove(oldStreams);
  return { id, activity: a };
}
