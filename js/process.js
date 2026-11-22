import { snapToTrack, pathLength } from './track.js?v=1795312012';
import { lengthsIn, poolStats, poolBests } from './swim.js?v=1795312012';
// Triven: turn a decoded FIT file into activity rows, streams and best efforts.
// Pure functions only (no network), so the same code runs in the browser and in tests.

const SC = 180 / 2 ** 31;                 // semicircles -> degrees
const FIT_EPOCH = 631065600;              // 1989-12-31T00:00:00Z in unix seconds
const SPORT = { running: 'run', cycling: 'bike', swimming: 'swim', transition: 'transition' };
const r = (v, d = 2) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

export const RUN_DISTANCES = [['400 m', 400], ['1 km', 1000], ['1 mile', 1609.34], ['5 km', 5000], ['10 km', 10000], ['15 km', 15000],
  ['10 mile', 16093.4], ['Half marathon', 21097.5], ['30 km', 30000], ['Marathon', 42195], ['50 km', 50000], ['50 mile', 80467.2],
  ['100 km', 100000], ['100 mile', 160934.4]];
export const BIKE_DISTANCES = [['10 mile TT', 16093.4], ['25 mile TT', 40233.6], ['50 mile TT', 80467.2], ['90 km', 90000], ['100 km', 100000], ['100 mile TT', 160934.4], ['180 km', 180000]];   // 90 and 180 km: half and full Ironman bike legs
export const POWER_DURATIONS = [['power 1 s', 1], ['power 5 s', 5], ['power 10 s', 10], ['power 30 s', 30], ['power 1 min', 60], ['power 5 min', 300],
  ['power 10 min', 600], ['power 20 min', 1200], ['power 30 min', 1800], ['power 1 hour', 3600]];
export const SWIM_DISTANCES = [['100 m', 100], ['200 m', 200], ['400 m', 400], ['750 m', 750], ['800 m', 800], ['1500 m', 1500], ['1900 m', 1900], ['3800 m', 3800]];

export const STREAM_FIELDS = ['t', 'lat', 'lon', 'dist', 'speed', 'alt', 'hr', 'power', 'cad', 'gct', 'gctBal', 'vo', 'stride', 'temp'];

function sportOf(s) { return SPORT[s] || 'other'; }

// ---------- indoor / track / terrain per section ----------
export const INDOOR = new Set(['treadmill', 'indoor', 'virtual']);
export const ENVS = {
  run: [['road', 'Outdoor'], ['trail', 'Trail'], ['track', 'Track'], ['treadmill', 'Treadmill']],
  bike: [['road', 'Outdoor'], ['gravel', 'Gravel'], ['mtb', 'Mountain bike'], ['indoor', 'Indoor trainer'], ['virtual', 'Virtual (Zwift etc.)']],
  swim: [['pool', 'Pool'], ['open_water', 'Open water']],
};
export function envLabel(sport, env) {
  const L = { run: { road: 'Run', trail: 'Trail run', track: 'Track run', treadmill: 'Treadmill run' },
    bike: { road: 'Ride', gravel: 'Gravel ride', mtb: 'Mountain bike ride', indoor: 'Indoor ride', virtual: 'Virtual ride' },
    swim: { pool: 'Pool swim', open_water: 'Open water swim' } };
  return L[sport]?.[env] || { run: 'Run', bike: 'Ride', swim: 'Swim', transition: 'Transition' }[sport] || 'Workout';
}
function envFromFit(sport, sub, gps, elapsed) {
  const s = String(sub || '').toLowerCase();
  if (sport === 'run') { if (/treadmill|indoor/.test(s)) return 'treadmill'; if (/track/.test(s)) return 'track'; if (/trail/.test(s)) return 'trail'; return gps || elapsed < 300 ? 'road' : 'treadmill'; }
  if (sport === 'bike') { if (/virtual/.test(s)) return 'virtual'; if (/indoor|spin/.test(s)) return 'indoor'; if (/mountain/.test(s)) return 'mtb'; if (/gravel|cyclocross/.test(s)) return 'gravel'; return gps || elapsed < 300 ? 'road' : 'indoor'; }
  if (sport === 'swim') { if (/open/.test(s)) return 'open_water'; if (/lap|pool/.test(s)) return 'pool'; return gps ? 'open_water' : 'pool'; }
  return null;
}

export function multisportProfile(seq) {
  const legs = seq.filter(x => x !== 'transition'), s = legs.join('-');
  if (s === 'swim-bike-run') return 'triathlon';
  if (s === 'run-bike-run') return 'duathlon';
  if (s === 'swim-run' || s === 'run-swim-run') return 'aquathlon';
  if (s === 'swim-bike') return 'aquabike';
  if (s === 'bike-run' || s === 'run-bike') return 'brick';
  // swimrun: four or more legs alternating swim and run
  if (legs.length >= 4 && legs.every(x => x === 'swim' || x === 'run') && legs.every((x, i) => i === 0 || x !== legs[i - 1])) return 'swimrun';
  return 'other';
}
// race distance from leg distances (metres): standard ITU/World Triathlon and duathlon distances, with generous ranges
const TRI_CLASSES = [['Super sprint', [250, 550], [6000, 13000], [1500, 3600]], ['Sprint', [550, 1000], [15000, 26000], [4000, 6500]],
  ['Olympic', [1200, 1800], [35000, 45000], [8500, 11500]], ['Middle distance', [1700, 2300], [80000, 100000], [19000, 23500]],
  ['Full distance', [3200, 4300], [165000, 192000], [39000, 44500]]];
const DU_CLASSES = [['Sprint', [4000, 6500], [17000, 24000], [2000, 3500]], ['Standard', [8500, 11500], [35000, 45000], [4000, 6000]], ['Long', [9000, 11500], [55000, 160000], [9000, 31000]]];
export function distanceClass(profile, sections) {
  const real = sections.filter(s => s.sport !== 'transition'), d = real.map(s => +s.distance_m || 0);
  const inR = (v, [a, b]) => v >= a && v <= b;
  const pick = (classes, legs) => { let best = null, bestN = 0;
    for (const [name, ...ranges] of classes) { const n = ranges.filter((r, i) => inR(legs[i], r)).length; if (n > bestN) { best = name; bestN = n; } }
    return bestN >= 2 ? best : null; };
  if (profile === 'triathlon' && d.length === 3) return pick(TRI_CLASSES, d);
  if (profile === 'duathlon' && d.length === 3) return pick(DU_CLASSES, d);
  return null;
}

// fastest time to cover `dist` metres inside one section's records (interpolated)
export function bestOverDistance(recs, dist) {
  let best = null, j = 0;
  for (let i = 0; i < recs.length; i++) {
    if (j < i) j = i;
    while (j < recs.length && recs[j].dist - recs[i].dist < dist) j++;
    if (j >= recs.length) break;
    const a = recs[j - 1], b = recs[j];
    const f = (recs[i].dist + dist - a.dist) / Math.max(1e-6, b.dist - a.dist);
    const t = a.t + f * (b.t - a.t) - recs[i].t;
    if (best == null || t < best.t) best = { t, start: recs[i].t };
  }
  return best;
}

// best average power for each duration, from a 1-second resampled series
function bestPower(recs, durations) {
  if (recs.length < 2) return {};
  const t0 = recs[0].t, n = Math.floor(recs[recs.length - 1].t - t0) + 1;
  const p = new Float64Array(n); let j = 0;
  for (let k = 0; k < n; k++) { const t = t0 + k; while (j < recs.length - 1 && recs[j + 1].t <= t) j++; const gap = (recs[j + 1]?.t ?? recs[j].t) - recs[j].t; p[k] = gap > 10 ? 0 : (recs[j].power ?? 0); }
  const pre = new Float64Array(n + 1); for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + p[i];
  const out = {};
  for (const [name, w] of durations) { if (w > n) continue; let b = 0, at = 0; for (let i = 0; i + w <= n; i++) { const a = (pre[i + w] - pre[i]) / w; if (a > b) { b = a; at = i; } } if (b > 0) out[name] = { w: b, start: t0 + at }; }
  return out;
}

export function processFit(messages, opts = {}) {
  const fid = messages.fileIdMesgs?.[0] || {};
  const act = messages.activityMesgs?.[0] || {};
  const S = (messages.sessionMesgs || []).slice().sort((a, b) => a.startTime - b.startTime);
  if (!S.length) throw new Error('No sessions in this file');
  const start = S[0].startTime;
  const startMs = +start;
  const off = s => (+s - startMs) / 1000;
  let utcOffsetMin = 0;
  if (act.localTimestamp != null && act.timestamp) utcOffsetMin = Math.round(((act.localTimestamp + FIT_EPOCH) - (+act.timestamp / 1000)) / 60);

  const sections = S.map((s, i) => ({
    idx: i, sport: sportOf(s.sport), start_offset_s: r(off(s.startTime)), elapsed_s: r(s.totalElapsedTime), timer_s: r(s.totalTimerTime),
    distance_m: r(s.totalDistance, 1), ascent_m: s.totalAscent ?? null, avg_hr: s.avgHeartRate ?? null, max_hr: s.maxHeartRate ?? null,
    avg_speed: r(s.enhancedAvgSpeed ?? s.avgSpeed, 3), avg_power: s.avgPower ?? null,
    avg_cadence: s.avgRunningCadence ?? s.avgCadence ?? null,
    summary: {
      maxSpeed: r(s.enhancedMaxSpeed ?? s.maxSpeed, 3), maxPower: s.maxPower ?? null, np: s.normalizedPower ?? null, descent: s.totalDescent ?? null,
      calories: s.totalCalories ?? null, te: s.totalTrainingEffect ?? null, ate: s.totalAnaerobicTrainingEffect ?? null,
      avgGct: r(s.avgStanceTime, 1), avgGctBal: r(s.avgStanceTimeBalance, 2), avgVo: r(s.avgVerticalOscillation, 1), avgStride: r(s.avgStepLength, 0),
      poolLength: s.poolLength ?? null, numLengths: s.numActiveLengths ?? null, avgStrokeRate: s.avgCadence ?? null, swolf: s.avgSwolf ?? null,
      subSport: s.subSport ?? null,
    },
  }));
  const secAt = t => { for (let i = sections.length - 1; i >= 0; i--) if (t >= sections[i].start_offset_s - 0.5) return i; return 0; };

  const laps = (messages.lapMesgs || []).slice().sort((a, b) => a.startTime - b.startTime).map((l, i) => ({
    idx: i, sport: sportOf(l.sport ?? S[secAt(off(l.startTime))].sport), start_offset_s: r(off(l.startTime)), elapsed_s: r(l.totalElapsedTime),
    distance_m: r(l.totalDistance, 1), ascent_m: l.totalAscent ?? null, avg_hr: l.avgHeartRate ?? null, max_hr: l.maxHeartRate ?? null,
    avg_speed: r(l.enhancedAvgSpeed ?? l.avgSpeed, 3), avg_power: l.avgPower ?? null,
  }));

  // records -> columnar streams
  const recs = (messages.recordMesgs || []).filter(x => x.timestamp).map(x => {
    const cad = x.cadence != null ? x.cadence + (x.fractionalCadence || 0) : null;
    return {
      t: r(off(x.timestamp), 1), lat: x.positionLat != null ? r(x.positionLat * SC, 6) : null, lon: x.positionLong != null ? r(x.positionLong * SC, 6) : null,
      dist: r(x.distance, 1), speed: r(x.enhancedSpeed ?? x.speed, 3), alt: r(x.enhancedAltitude ?? x.altitude, 1), hr: x.heartRate ?? null,
      power: x.power ?? null, cad: r(cad, 1), gct: r(x.stanceTime, 1), gctBal: r(x.stanceTimeBalance, 2), vo: r(x.verticalOscillation, 1),
      stride: r(x.stepLength, 0), temp: x.temperature ?? null,
    };
  });
  // where each section happened: treadmill / track / trail / road, indoor / virtual / road, pool / open water.
  // The watch's sub-sport decides, unless the user picked one (opts.env); no GPS on a run or ride means indoors.
  sections.forEach((s, i) => {
    const a = s.start_offset_s, b = a + s.elapsed_s, inSec = recs.filter(x => x.t >= a && x.t <= b);
    const gps = inSec.filter(x => x.lat != null).length > Math.max(10, inSec.length * 0.2);
    s.summary.env = (opts.env && opts.env[i]) || envFromFit(s.sport, s.summary.subSport, gps, s.elapsed_s);
    s.summary.gps = gps;
    if (s.sport === 'run' && s.summary.env === 'track' && gps) {
      const snap = snapToTrack(inSec.map(x => x.lat), inSec.map(x => x.lon));
      if (!snap) { s.summary.trackFit = null; return; }
      // put the points on the track and measure the leg along it (lane 1, like a watch in track mode)
      let d = null, prevLat = null, prevLon = null, d0 = inSec.find(x => x.dist != null)?.dist ?? 0;
      inSec.forEach((x, k) => { x.lat = snap.lat[k]; x.lon = snap.lon[k]; });
      const oldEnd = inSec.filter(x => x.dist != null).at(-1)?.dist ?? d0;
      d = d0;
      for (const x of inSec) { if (x.lat != null) { if (prevLat != null) d += pathLength([prevLat, x.lat], [prevLon, x.lon]); prevLat = x.lat; prevLon = x.lon; } if (x.dist != null || x.lat != null) x.dist = r(d, 1); }
      const delta = d - oldEnd;
      recs.forEach(x => { if (x.t > b && x.dist != null) x.dist = r(x.dist + delta, 1); });
      s.summary.watchDistance = s.distance_m; s.distance_m = r(d - d0, 1);
      if (s.elapsed_s) s.avg_speed = r(s.distance_m / (s.timer_s || s.elapsed_s), 3);
      s.summary.trackFit = snap.fit; s.summary.trackOval = snap.oval;
    }
  });
  // treadmill distance correction (opts.distFix[idx] = treadmill distance / watch distance): scale the leg's distance, speed,
  // stride and laps by the same factor, and shift everything after it so the later legs keep their own distances
  if (opts.distFix) sections.forEach((s, i) => {
    const f = +opts.distFix[i]; if (!(f > 0) || !(s.distance_m > 0) || Math.abs(f - 1) < 1e-4) return;
    const want = s.distance_m * f;
    const a = s.start_offset_s, b = a + s.elapsed_s;
    const inSec = recs.filter(x => x.t >= a && x.t <= b);
    const d0 = inSec.find(x => x.dist != null)?.dist ?? 0, dEnd = inSec.filter(x => x.dist != null).at(-1)?.dist ?? d0;
    for (const x of inSec) { if (x.dist != null) x.dist = r(d0 + (x.dist - d0) * f, 1); if (x.speed != null) x.speed = r(x.speed * f, 3); if (x.stride != null) x.stride = r(x.stride * f, 0); }
    const delta = (dEnd - d0) * (f - 1);
    recs.forEach(x => { if (x.t > b && x.dist != null) x.dist = r(x.dist + delta, 1); });
    s.summary.watchDistance = s.distance_m; s.distance_m = r(want, 1);
    if (s.avg_speed != null) s.avg_speed = r(s.avg_speed * f, 3);
    if (s.summary.maxSpeed != null) s.summary.maxSpeed = r(s.summary.maxSpeed * f, 3);
    if (s.summary.avgStride != null) s.summary.avgStride = r(s.summary.avgStride * f, 0);
    s.summary.distFix = r(f, 4);
    laps.forEach(l => { if (l.sport === s.sport && l.start_offset_s >= a - 0.5 && l.start_offset_s < b - 0.5) { if (l.distance_m != null) l.distance_m = r(l.distance_m * f, 1); if (l.avg_speed != null) l.avg_speed = r(l.avg_speed * f, 3); } });
  });
  const streams = { fields: STREAM_FIELDS, v: 1 };
  for (const f of STREAM_FIELDS) streams[f] = recs.map(x => x[f]);
  if (messages.lengthMesgs?.length) streams.lengths = messages.lengthMesgs.map(l => ({ t: r(off(l.startTime), 1), dur: r(l.totalElapsedTime, 2), type: l.lengthType, strokes: l.totalStrokes ?? null, stroke: l.swimStroke ?? null }));
  // pool swims: swim time from active lengths (rest excluded), so pace and moving time ignore rests
  for (const sec of sections) {
    if (sec.sport !== 'swim' || sec.summary.env !== 'pool') continue;
    const st = poolStats(lengthsIn(sec, streams.lengths), sec.summary.poolLength);
    if (!st) continue;
    Object.assign(sec.summary, { swimTime: st.swimTime, rest: st.rest, swolf: st.swolf != null ? r(st.swolf, 1) : sec.summary.swolf, strokeRate: st.strokeRate != null ? r(st.strokeRate, 1) : null,
      strokesPerLength: st.strokesPerLength != null ? r(st.strokesPerLength, 1) : null, numLengths: st.lengths, swimV: 1 });
    if (sec.distance_m > 0 && st.swimTime > 0) sec.avg_speed = r(sec.distance_m / st.swimTime, 3);
  }

  // activity row
  const real = sections.filter(s => s.sport !== 'transition');
  const kinds = [...new Set(real.map(s => s.sport))];
  const isMulti = real.length > 1 && kinds.length > 1;
  const sport = isMulti ? 'multi' : (kinds[0] || 'other');
  const totalElapsed = sections.reduce((a, s) => Math.max(a, s.start_offset_s + s.elapsed_s), 0);
  const sum = k => sections.reduce((a, s) => a + (s[k] || 0), 0);
  const hrW = sections.filter(s => s.avg_hr).reduce((a, s) => a + s.avg_hr * s.elapsed_s, 0) / Math.max(1, sections.filter(s => s.avg_hr).reduce((a, s) => a + s.elapsed_s, 0));
  const profile = isMulti ? multisportProfile(sections.map(s => s.sport)) : null;
  const indoor = real.length > 0 && real.every(s => INDOOR.has(s.summary.env));
  const local = new Date(startMs + utcOffsetMin * 60000);
  const hh = local.getUTCHours();
  const part = hh < 12 ? 'Morning' : hh < 17 ? 'Afternoon' : hh < 21 ? 'Evening' : 'Night';
  const label = { run: 'Run', bike: 'Ride', swim: 'Swim', other: 'Workout' };
  const dClass = isMulti ? distanceClass(profile, sections) : null;
  const name = isMulti ? `${part} ${indoor ? 'Indoor ' : ''}${dClass ? dClass + ' ' : ''}${profile === 'other' ? 'Multisport' : (dClass ? profile : profile[0].toUpperCase() + profile.slice(1))}` : `${part} ${real[0] ? envLabel(real[0].sport, real[0].summary.env).replace(/\b\w/g, c => c.toUpperCase()) : label[sport] || 'Workout'}`;
  const devices = (messages.deviceInfoMesgs || []);
  const creator = devices.find(d => d.deviceIndex === 'creator') || {};
  const sensors = [...new Set(devices.filter(d => d.garminProduct && d.garminProduct !== creator.garminProduct && d.sourceType !== 'local').map(d => String(d.garminProduct)))];
  const NICE = { fenix7x: 'Garmin fēnix 7X', fenix7: 'Garmin fēnix 7', fenix7s: 'Garmin fēnix 7S', fenix8: 'Garmin fēnix 8', fr965: 'Garmin Forerunner 965', fr955: 'Garmin Forerunner 955', fr265: 'Garmin Forerunner 265', fr255: 'Garmin Forerunner 255', edge1040: 'Garmin Edge 1040', edge840: 'Garmin Edge 840', hrmProPlus: 'HRM-Pro Plus', hrmPro: 'HRM-Pro', hrm600: 'HRM 600', hrmRun: 'HRM-Run' };
  const nice = v => NICE[v] || String(v).replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
  const tz = (messages.timeInZoneMesgs || []).find(z => z.referenceMesg === 'session');
  const up = messages.userProfileMesgs?.[0] || {};

  const activity = {
    name, sport, multisport_profile: profile, start_time: new Date(startMs).toISOString(), utc_offset_min: utcOffsetMin,
    distance_m: r(sum('distance_m'), 1), elapsed_s: r(totalElapsed), moving_s: r(sport === 'swim' && real.every(x => x.summary.swimTime) ? real.reduce((p, x) => p + x.summary.swimTime, 0) : (act.totalTimerTime ?? sum('timer_s'))),
    ascent_m: sum('ascent_m') || null, descent_m: sections.reduce((a, s) => a + (s.summary.descent || 0), 0) || null,
    calories: sections.reduce((a, s) => a + (s.summary.calories || 0), 0) || null, avg_hr: hrW ? Math.round(hrW) : null,
    max_hr: Math.max(0, ...sections.map(s => s.max_hr || 0)) || null, indoor,
    device: [creator.garminProduct || fid.garminProduct ? (s => /^garmin\b/i.test(s) ? s : 'Garmin ' + s)(nice(creator.garminProduct || fid.garminProduct)) : fid.manufacturer && nice(fid.manufacturer),
             ...sensors.map(nice)].filter(Boolean).join(' + ') || null,   // Garmin attribution needs "Garmin <model>"
    source: opts.source || 'upload',
    source_id: opts.sourceId || `${fid.manufacturer || 'x'}-${fid.serialNumber || 'x'}-${+(fid.timeCreated || start)}`,
    summary: {
      lthr: tz?.thresholdHeartRate ?? null, maxHr: tz?.maxHeartRate ?? null, ftp: tz?.functionalThresholdPower ?? null,
      weight: up.weight ?? null, distanceClass: dClass, te: S[S.length - 1].totalTrainingEffect ?? null, ate: S[S.length - 1].totalAnaerobicTrainingEffect ?? null,
    },
  };

  // best efforts
  const bests = [];
  const add = (sport, effort, value, unit, startOff, measured = true) => bests.push({ sport, effort, value: r(value, 2), unit, start_offset_s: startOff == null ? null : r(startOff, 1), measured, achieved_at: activity.start_time });
  sections.forEach((s, i) => {
    const sr = recs.filter(x => x.t >= s.start_offset_s && x.t <= s.start_offset_s + s.elapsed_s && x.dist != null);
    const env = s.summary.env, noDist = env === 'treadmill' || env === 'indoor' || env === 'virtual';
    if (s.sport === 'run' && !noDist) RUN_DISTANCES.forEach(([n, d]) => { if (s.distance_m >= d) { const b = bestOverDistance(sr, d); if (b) add('run', n, b.t, 's', b.start); } });
    if (s.sport === 'bike') {
      if (!noDist) BIKE_DISTANCES.forEach(([n, d]) => { if (s.distance_m >= d) { const b = bestOverDistance(sr, d); if (b) add('bike', n, b.t, 's', b.start); } });
      const pr = recs.filter(x => x.t >= s.start_offset_s && x.t <= s.start_offset_s + s.elapsed_s);
      if (pr.some(x => x.power > 0)) Object.entries(bestPower(pr, POWER_DURATIONS)).forEach(([n, v]) => add('bike', n, v.w, 'W', v.start));
    }
    if (s.sport === 'swim' && s.summary.env === 'pool' && streams.lengths?.length) {
      Object.entries(poolBests(lengthsIn(s, streams.lengths), s.summary.poolLength, SWIM_DISTANCES)).forEach(([n, b]) => add('swim', n, b.t, 's', b.start));
    } else if (s.sport === 'swim' && sr.length > 1) SWIM_DISTANCES.forEach(([n, d]) => { if (s.distance_m >= d) { const b = bestOverDistance(sr, d); if (b) add('swim', n, b.t, 's', b.start); } });
  });
  // keep the best of each effort across sections (e.g. run 1 vs run 2 of a duathlon)
  const keep = new Map();
  for (const b of bests) { const k = b.effort + '|' + b.sport; const cur = keep.get(k); if (!cur || (b.unit === 'W' ? b.value > cur.value : b.value < cur.value)) keep.set(k, b); }
  const outdoorBike = sections.filter(s => s.sport === 'bike' && !INDOOR.has(s.summary.env));
  const bikeDist = outdoorBike.reduce((a, s) => a + (s.distance_m || 0), 0);
  const bikeGain = outdoorBike.reduce((a, s) => a + (s.ascent_m || 0), 0);
  const out = [...keep.values()];
  if (bikeDist > 0) out.push({ sport: 'bike', effort: 'longest ride', value: r(bikeDist, 1), unit: 'm', start_offset_s: null, measured: true, achieved_at: activity.start_time });
  if (bikeGain > 0) out.push({ sport: 'bike', effort: 'most elevation', value: bikeGain, unit: 'm', start_offset_s: null, measured: true, achieved_at: activity.start_time });
  // run and bike efforts share names like '100 km'; make the stored effort key unique per sport
  out.forEach(b => { if (b.sport === 'bike' && b.effort === '100 km') b.effort = '100 km ride'; });

  return { activity, sections, laps, streams, bests: out };
}

// copy of the streams with fields the owner chose not to share removed
export function shareStreams(streams, share) {
  const s = { ...streams };
  const drop = f => { s[f] = s[f] ? s[f].map(() => null) : s[f]; };
  if (!share.map) { drop('lat'); drop('lon'); }
  if (!share.hr) drop('hr');
  if (!share.power) drop('power');
  if (!share.pace) { drop('speed'); delete s.lengths; }
  if (!share.cadence) drop('cad');
  if (!share.dynamics) { drop('gct'); drop('gctBal'); drop('vo'); drop('stride'); }
  return s;
}

// columnar -> row objects (the activity view works with rows)
export function rows(streams) {
  const n = streams.t.length, out = new Array(n);
  for (let i = 0; i < n; i++) { const o = {}; for (const f of streams.fields) o[f] = streams[f][i]; out[i] = o; }
  return out;
}

// ---------- route thumbnail for feeds: ~250 points [lat, lon, section] ----------
export function makeTrack(streams, sections, max = 250) {
  const idx = []; for (let i = 0; i < streams.t.length; i++) if (streams.lat[i] != null && streams.lon[i] != null) idx.push(i);
  if (idx.length < 2) return null;
  const step = Math.max(1, Math.ceil(idx.length / max));
  const secAt = t => { for (let i = sections.length - 1; i >= 0; i--) if (t >= sections[i].start_offset_s - 0.5) return i; return 0; };
  const pts = [];
  for (let k = 0; k < idx.length; k += step) { const i = idx[k]; pts.push([r(streams.lat[i], 5), r(streams.lon[i], 5), secAt(streams.t[i])]); }
  const last = idx[idx.length - 1]; pts.push([r(streams.lat[last], 5), r(streams.lon[last], 5), secAt(streams.t[last])]);
  return pts;
}

// ---------- stretches that look like driving ----------
// run: faster than 6.2 m/s (22 km/h) for 20 s+; bike: faster than 16.7 m/s (60 km/h) for 45 s+ when not descending.
export function detectDriving(sections, streams) {
  const out = [];
  const R = rows(streams);
  sections.forEach((s, si) => {
    const lim = s.sport === 'run' ? 6.2 : s.sport === 'bike' ? 16.7 : s.sport === 'swim' ? 3.5 : null;
    const minDur = s.sport === 'bike' ? 45 : 20;
    if (!lim || INDOOR.has(s.summary?.env) || s.summary?.gps === false) return;
    const rs = R.filter(x => x.t >= s.start_offset_s && x.t <= s.start_offset_s + s.elapsed_s && x.speed != null);
    let cur = null;
    const close = () => { if (cur && cur.t1 - cur.t0 >= minDur) out.push(cur); cur = null; };
    for (let i = 0; i < rs.length; i++) {
      const x = rs[i];
      // smooth over ~10 s
      let sum = 0, n = 0; for (let j = i; j >= 0 && rs[j].t >= x.t - 10; j--) { sum += rs[j].speed; n++; }
      const v = sum / n;
      let descending = false;
      if (s.sport === 'bike') { const back = rs.find(y => y.t >= x.t - 30); if (back && back.alt != null && x.alt != null && x.dist - back.dist > 100) descending = (x.alt - back.alt) / (x.dist - back.dist) < -0.03; }
      if (v > lim && !descending) { if (cur && x.t - cur.t1 <= 15) { cur.t1 = x.t; cur.max = Math.max(cur.max, v); cur.d1 = x.dist; } else { close(); cur = { t0: x.t, t1: x.t, max: v, d0: x.dist, d1: x.dist, section: si }; } }
      else if (cur && x.t - cur.t1 > 15) close();
    }
    close();
  });
  return out.map(d => ({ t0: r(d.t0, 0), t1: r(d.t1, 0), section: d.section, maxKmh: r(d.max * 3.6, 0), km: d.d1 != null && d.d0 != null ? r((d.d1 - d.d0) / 1000, 2) : null,
    atEnd: d.section === sections.length - 1 && sections[d.section].start_offset_s + sections[d.section].elapsed_s - d.t1 < 120,
    atStart: d.section === 0 && d.t0 - sections[0].start_offset_s < 120 }));
}

// ---------- trim: keep only [a, b] seconds from the original start, recompute totals ----------
export function trimMessages(messages, a, b) {
  const S = (messages.sessionMesgs || []).slice().sort((x, y) => x.startTime - y.startTime);
  const t0 = +S[0].startTime, A = t0 + a * 1000, B = t0 + b * 1000;
  const recs = (messages.recordMesgs || []).filter(x => x.timestamp && +x.timestamp >= A && +x.timestamp <= B);
  if (recs.length < 2) throw new Error('Nothing left after trimming');
  const d0 = recs.find(x => x.distance != null)?.distance || 0;
  const rr = recs.map(x => ({ ...x, distance: x.distance != null ? x.distance - d0 : x.distance }));
  const stats = (from, to, orig) => {
    const sr = rr.filter(x => +x.timestamp >= from && +x.timestamp <= to);
    if (!sr.length) return null;
    const ds = sr.filter(x => x.distance != null), dist = ds.length ? ds[ds.length - 1].distance - ds[0].distance : 0;
    const el = (to - from) / 1000;
    let timer = 0; for (let i = 1; i < sr.length; i++) { const g = (sr[i].timestamp - sr[i - 1].timestamp) / 1000; if (g <= 10) timer += g; }
    const hr = sr.map(x => x.heartRate).filter(v => v > 0), pw = sr.map(x => x.power).filter(v => v != null);
    const sp = sr.map(x => x.enhancedSpeed ?? x.speed).filter(v => v != null);
    let asc = 0, desc = 0, ref = null;
    for (const x of sr) { const h = x.enhancedAltitude ?? x.altitude; if (h == null) continue; if (ref == null) { ref = h; continue; } if (h - ref >= 2) { asc += h - ref; ref = h; } else if (ref - h >= 2) { desc += ref - h; ref = h; } }
    const frac = orig.totalElapsedTime ? Math.min(1, el / orig.totalElapsedTime) : 1;
    return { ...orig, startTime: new Date(from), timestamp: new Date(to), totalElapsedTime: el, totalTimerTime: timer || el, totalDistance: dist,
      totalAscent: Math.round(asc), totalDescent: Math.round(desc),
      avgHeartRate: hr.length ? Math.round(hr.reduce((p, q) => p + q, 0) / hr.length) : orig.avgHeartRate, maxHeartRate: hr.length ? Math.max(...hr) : orig.maxHeartRate,
      enhancedAvgSpeed: timer ? dist / timer : orig.enhancedAvgSpeed, avgSpeed: undefined, enhancedMaxSpeed: sp.length ? Math.max(...sp) : orig.enhancedMaxSpeed,
      avgPower: pw.length ? Math.round(pw.reduce((p, q) => p + q, 0) / pw.length) : orig.avgPower, maxPower: pw.length ? Math.max(...pw) : orig.maxPower,
      totalCalories: orig.totalCalories != null ? Math.round(orig.totalCalories * frac) : null };
  };
  // legs that aren't cut keep the watch's own totals; only cut legs are re-measured from the records
  const clip = list => (list || []).map(s => { const st = +s.startTime, en = st + (s.totalElapsedTime || 0) * 1000; const f = Math.max(st, A), t = Math.min(en, B); if (t <= f) return null; return f === st && t === en ? s : stats(f, t, s); }).filter(Boolean);
  const sessions = clip(S);
  if (!sessions.length) throw new Error('Nothing left after trimming');
  const act = { ...(messages.activityMesgs?.[0] || {}) }; delete act.totalTimerTime;
  return { ...messages, recordMesgs: rr, sessionMesgs: sessions, lapMesgs: clip(messages.lapMesgs), activityMesgs: [act],
    lengthMesgs: (messages.lengthMesgs || []).filter(l => +l.startTime >= A && +l.startTime <= B) };
}
