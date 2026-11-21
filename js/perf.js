// Performance: threshold estimates, FTP suggestions, race predictions and training status.
//
// Stored per activity at upload (summary.perf): the hardest 20 minutes of each run and ride (average heart rate, pace
// or measured power), which is what a 20-30 minute threshold test measures.
//
//  - Lactate threshold heart rate (run and bike): Friel's field test uses the average HR of the last 20 minutes of a hard
//    30-minute effort. We take the highest 20-minute average HR from the last 12 weeks, from activities of 25 minutes or
//    more. Without a recent hard effort this is a floor, so we only suggest raising your setting, never lowering it.
//  - Threshold pace: Jack Daniels' T pace, the speed whose oxygen cost is 88% of your VDOT, from your best race-like
//    efforts of the last 12 weeks.
//  - FTP: 95% of your best measured 20-minute power or your best hour, last 6 weeks. Suggested when it differs from your
//    setting by 3% or more (only from a power meter; modelled power is too rough).
//  - Race predictions: the VDOT of your best effort (1 mile to marathon) in the 12 weeks up to each date, turned into
//    times with Daniels' formula. As training moves your best efforts, the predictions move.
//  - Training status: from the trend in fitness (42-day load), how this week compares with what you're used to
//    (acute:chronic workload ratio, 0.8 to 1.3 is the productive band), form, and whether performance is rising.
import { vdot } from './vo2.js?v=1795275528';
import { pmc } from './load.js?v=1795275528';

const DAY = 864e5;
const RUN_M = { '1 mile': 1609.34, '5 km': 5000, '10 km': 10000, '15 km': 15000, '10 mile': 16093.4, 'Half marathon': 21097.5, '30 km': 30000, 'Marathon': 42195 };
export const RACES = [['5K', 5000], ['10K', 10000], ['Half marathon', 21097.5], ['Marathon', 42195]];

// ---------- computed at upload: hardest 20 minutes per sport ----------
export function perfData(sections, streams) {
  const t = streams.t, hr = streams.hr || [], sp = streams.speed || [], pw = streams.power || [], n = t.length;
  const out = { v: 1 };
  for (const s of sections) {
    const k = s.sport === 'run' ? 'run' : s.sport === 'bike' ? 'bike' : null; if (!k) continue;
    if (+s.elapsed_s < 25 * 60) continue;
    if (k === 'run' && s.summary?.env === 'treadmill') continue;
    const a = +s.start_offset_s, b = a + +s.elapsed_s;
    // 1 s resample of HR, speed and power within the leg
    const len = Math.floor(b - a); const H = new Float64Array(len).fill(NaN), V = new Float64Array(len).fill(NaN), P = new Float64Array(len).fill(NaN);
    let j = 0;
    for (let i = 0; i < n; i++) { if (t[i] < a || t[i] >= b) continue; const x = Math.floor(t[i] - a); if (x >= 0 && x < len) { if (hr[i] > 30) H[x] = hr[i]; if (sp[i] != null) V[x] = sp[i]; if (pw[i] != null) P[x] = pw[i]; } }
    const fill = A => { let last = NaN; for (let i = 0; i < len; i++) { if (Number.isNaN(A[i])) A[i] = last; else last = A[i]; } };
    fill(H); fill(V); fill(P);
    const W = 1200; let best = null;
    // start at least 5 min in: the first minutes of HR are still climbing
    let sh = 0, sv = 0, spw = 0, nh = 0, np = 0;
    for (let i = 0; i < len; i++) {
      if (!Number.isNaN(H[i])) { sh += H[i]; nh++; } if (!Number.isNaN(V[i])) sv += V[i]; if (!Number.isNaN(P[i])) { spw += P[i]; np++; }
      if (i >= W) { const o = i - W; if (!Number.isNaN(H[o])) { sh -= H[o]; nh--; } if (!Number.isNaN(V[o])) sv -= V[o]; if (!Number.isNaN(P[o])) { spw -= P[o]; np--; } }
      if (i >= W - 1 && i - W + 1 >= 300 && nh > W * 0.9) { const m = sh / nh; if (!best || m > best.hr) best = { hr: +m.toFixed(1), speed: +(sv / W).toFixed(3), power: np > W * 0.9 ? Math.round(spw / np) : null, at: Math.round(a + i - W + 1) }; }
    }
    if (best && (!out[k] || best.hr > out[k].hr)) out[k] = best;
  }
  return out;
}

// ---------- thresholds ----------
const dayOf = a => Date.parse(a.start_time);
export function thresholds(acts, bests, cfg, at = Date.now()) {
  const since = at - 84 * DAY, res = { run: {}, bike: {} };
  for (const k of ['run', 'bike']) {
    let top = null;
    for (const a of acts) { const p = a.summary?.perf?.[k]; if (!p || dayOf(a) < since || dayOf(a) > at) continue; if (!top || p.hr > top.hr) top = { ...p, activity_id: a.id, name: a.name, start_time: a.start_time }; }
    res[k].hr = top;
  }
  // threshold pace from VDOT (Daniels T pace ~ 88% of VDOT)
  const v = bestVdot(bests, at, 84);
  if (v) res.run.pace = { speed: speedAtVo2(0.88 * v.value), vdot: v };
  // FTP from measured power bests in the last 6 weeks
  const pw = bests.filter(b => b.sport === 'bike' && b.unit === 'W' && b.measured !== false && Date.parse(b.achieved_at) >= at - 42 * DAY && Date.parse(b.achieved_at) <= at);
  const p20 = Math.max(0, ...pw.filter(b => b.effort === 'power 20 min').map(b => +b.value)), p60 = Math.max(0, ...pw.filter(b => b.effort === 'power 1 hour').map(b => +b.value));
  const ftp = Math.max(p20 * 0.95, p60);
  if (ftp > 0) { const src = p60 >= p20 * 0.95 ? pw.find(b => b.effort === 'power 1 hour' && +b.value === p60) : pw.find(b => b.effort === 'power 20 min' && +b.value === p20);
    res.bike.ftp = { watts: Math.round(ftp), from: p60 >= p20 * 0.95 ? 'best hour' : '95% of best 20 minutes', activity_id: src?.activity_id, achieved_at: src?.achieved_at, rides: new Set(pw.map(b => b.activity_id)).size }; }
  return res;
}

// suggestions worth showing: differences big enough to matter
export function suggestions(th, cfg) {
  const out = [];
  const lr = th.run.hr, lb = th.bike.hr;
  if (lr && Math.round(lr.hr) >= (cfg.lthrRun || 0) + 3) out.push({ key: 'lthrRun', label: 'Run threshold heart rate', from: cfg.lthrRun, to: Math.round(lr.hr), unit: 'bpm',
    why: `Your hardest 20 minutes in the last 12 weeks averaged ${Math.round(lr.hr)} bpm (${lr.name}).`, activity_id: lr.activity_id });
  if (lb && Math.round(lb.hr) >= (cfg.lthrBike || 0) + 3) out.push({ key: 'lthrBike', label: 'Bike threshold heart rate', from: cfg.lthrBike, to: Math.round(lb.hr), unit: 'bpm',
    why: `Your hardest 20 minutes on the bike in the last 12 weeks averaged ${Math.round(lb.hr)} bpm (${lb.name}).`, activity_id: lb.activity_id });
  const f = th.bike.ftp;
  if (f) {
    const cur = cfg.ftp;
    if (!cur) out.push({ key: 'ftp', label: 'FTP', from: null, to: f.watts, unit: 'W', why: `From your ${f.from} with a power meter in the last 6 weeks.`, activity_id: f.activity_id });
    else if (f.watts >= cur * 1.03) out.push({ key: 'ftp', label: 'FTP', from: cur, to: f.watts, unit: 'W', why: `Your ${f.from} in the last 6 weeks says you've got stronger.`, activity_id: f.activity_id });
    else if (f.watts <= cur * 0.9 && f.rides >= 4) out.push({ key: 'ftp', label: 'FTP', from: cur, to: f.watts, unit: 'W', why: `None of your last ${f.rides} rides with power came near your FTP. It may be set too high, or you haven't ridden hard recently.`, activity_id: f.activity_id, down: true });
  }
  return out;
}

// ---------- VDOT and race predictions ----------
function bestVdot(bests, at, days) {
  let best = null;
  for (const b of bests) { if (b.sport !== 'run' || !RUN_M[b.effort]) continue; const t = Date.parse(b.achieved_at); if (t > at || t < at - days * DAY) continue;
    const v = vdot(RUN_M[b.effort], +b.value); if (!best || v > best.value) best = { value: v, effort: b.effort, time: +b.value, activity_id: b.activity_id, achieved_at: b.achieved_at }; }
  return best;
}
// speed (m/s) whose running oxygen cost (Daniels) equals vo2
function speedAtVo2(vo2) { const a = 0.000104, b = 0.182258, c = -4.60 - vo2; const v = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); return v / 60; }
// time (s) for a distance at a given VDOT: solve vdot(d, t) = V by bisection
export function predictTime(V, d) { let lo = d / 8, hi = d / 1.2; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (vdot(d, mid) > V) lo = mid; else hi = mid; } return (lo + hi) / 2; }
// weekly series of predictions: [{ t, vdot, times: {5K: s, ...}, from }]
export function predictionHistory(bests, from, until) {
  const out = [];
  for (let t = from; t <= until; t += 7 * DAY) { const v = bestVdot(bests, t, 84); out.push({ t, vdot: v?.value ?? null, from: v, times: v ? Object.fromEntries(RACES.map(([n, d]) => [n, predictTime(v.value, d)])) : null }); }
  return out;
}

// ---------- training status ----------
export function trainingStatus(acts, cfg, today) {
  const S = pmc(acts, cfg, today);
  // the ratios need a few weeks of history to mean anything: a single race on a near-empty log reads as "overreaching"
  const recent = acts.filter(a => Date.parse(a.start_time) > today - 42 * DAY).length;
  if (S.length < 42 || recent < 8) return { key: 'none', label: 'Building history', note: `Training status needs about six weeks of activities with heart rate (you have ${recent} in the last six weeks). Your Garmin export will fill this in.` };
  const last = S.at(-1), wk = S.at(-8) || S[0], m4 = S.at(-29) || S[0];
  const acute = S.slice(-7).reduce((p, x) => p + x.load, 0), chronic = last.ctl * 7, acwr = chronic > 1 ? acute / chronic : 0;
  const ramp = last.ctl - wk.ctl, trend4 = m4.ctl > 1 ? (last.ctl - m4.ctl) / m4.ctl : 0;
  const peak90 = Math.max(...S.slice(-90).map(x => x.ctl));
  const lastAct = Math.max(...acts.map(dayOf)), idle = (Date.now() - lastAct) / DAY;
  const range = [Math.round(chronic * 0.8), Math.round(chronic * 1.3)];
  const base = { acute: Math.round(acute), range, acwr: +acwr.toFixed(2), ramp: +ramp.toFixed(1), form: Math.round(last.form) };
  const st = (key, label, note) => ({ key, label, note, ...base });
  if (idle > 10 || (trend4 < -0.2 && acwr < 0.8)) return st('detraining', 'Detraining', 'Training has dropped off for long enough that fitness is fading. A few easy sessions will start turning it round.');
  if (acwr > 1.5 || last.form < -30) return st('overreaching', 'Overreaching', 'This week is far above what you’re used to. Short blocks like this can work, but plan recovery days soon to absorb it.');
  if (last.form > 5 && last.ctl >= peak90 * 0.85 && ramp <= 0.5) return st('peaking', 'Peaking', 'Fitness is near its recent high and fatigue has cleared. Ideal for a race.');
  if (acwr < 0.8 && last.form > 0) return st('recovery', 'Recovery', 'A lighter week. Good for absorbing training; keep it to a week or two so fitness doesn’t drift.');
  if (ramp > 1 && acwr <= 1.3) return st('productive', 'Productive', 'Load is building steadily within a safe range. Fitness should follow.');
  if (Math.abs(ramp) <= 1 && acwr >= 0.8 && acwr <= 1.3) return st('maintaining', 'Maintaining', 'Load is steady, enough to hold fitness. Add some volume or intensity to build further.');
  if (acwr > 1.3) return st('strained', 'High load', 'A big week compared with your usual. Fine for a block, but watch for fatigue.');
  return st('maintaining', 'Maintaining', ramp < -1 ? 'Fitness is dipping slightly. A normal week of training will hold it.' : 'Load is roughly steady.');
}
