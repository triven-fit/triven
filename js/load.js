// Training load, fitness, fatigue and form (the Banister / TrainingPeaks performance-management model).
//
// Load per activity is on the TSS scale: one hour at threshold = 100.
//  - Bike with a power meter and an FTP set: TSS = hours x IF^2 x 100, IF = normalised power / FTP.
//  - Anything with heart rate: hours x IF^2 x 100 per second, IF = heart-rate reserve as a fraction of
//    threshold (HR - rest) / (LTHR - rest), using run LTHR for running and transitions, bike LTHR for bike and swim.
//  - Swim with a swim threshold (CSS) set: hours x IF^3 x 100, IF = swim speed / CSS speed (TrainingPeaks sTSS).
//  - No heart rate or power: 50 per hour (an easy aerobic hour), marked as an estimate.
// Fitness = 42-day exponentially weighted average of daily load, fatigue = 7-day, form = yesterday's fitness - fatigue.
//
// Uploads store a compact summary (seconds at each heart rate, normalised power and duration) and the load is worked
// out from it with the thresholds in effect on the activity's day (see athlete.js), so changing them today leaves history alone.

import { settingsAt } from './athlete.js?v=1795591409';

const SP = { run: 'run', running: 'run', bike: 'bike', cycling: 'bike', swim: 'swim', swimming: 'swim' };

// from processed streams + sections -> compact summary kept in activities.summary.loadData
export function loadData(sections, streams) {
  const t = streams.t, hr = streams.hr || [], pw = streams.power || [], n = t.length;
  const out = { v: 1, hr: {}, t: {}, pw: [] };
  sections.forEach((s, si) => {
    const sp = SP[s.sport] || 'other', a = +s.start_offset_s, b = a + +s.elapsed_s;
    const hist = out.hr[sp] || (out.hr[sp] = {});
    let secs = 0; const pwSec = [];
    for (let i = 0; i < n; i++) {
      if (t[i] < a || t[i] >= b) continue;
      const dt = Math.min(5, Math.max(0, (i + 1 < n ? t[i + 1] : t[i] + 1) - t[i]));
      secs += dt;
      if (hr[i] != null && hr[i] > 30) { const k = Math.round(hr[i]); hist[k] = (hist[k] || 0) + dt; }
      if (sp === 'bike') pwSec.push([dt, pw[i]]);
    }
    out.t[sp] = (out.t[sp] || 0) + secs;
    // normalised power: 30 s rolling mean, 4th power mean, 4th root (needs measured power on most of the leg)
    if (sp === 'bike' && pwSec.length) {
      const have = pwSec.filter(x => x[1] != null).length;
      if (have > pwSec.length * 0.8) {
        const vals = pwSec.map(x => x[1] || 0), roll = []; let sum = 0;
        for (let i = 0; i < vals.length; i++) { sum += vals[i]; if (i >= 30) sum -= vals[i - 30]; if (i >= 29) roll.push(sum / 30); }
        if (roll.length) out.pw.push({ np: Math.round(Math.pow(roll.reduce((p, v) => p + v ** 4, 0) / roll.length, 0.25)), s: Math.round(secs) });
      }
    }
  });
  for (const k in out.hr) { const h = out.hr[k]; for (const b in h) h[b] = Math.round(h[b]); if (!Object.keys(h).length) delete out.hr[k]; }
  for (const k in out.t) out.t[k] = Math.round(out.t[k]);
  return out;
}

// load for one activity with the settings in effect on its day (athlete.js) -> { value, bySport, method: 'power'|'hr'|'time'|'mixed' }
export function loadOf(a, cfgNow) {
  const cfg = settingsAt(cfgNow, a);
  const d = a.summary?.loadData;
  const rest = cfg.restHr || 50;
  const lthr = sp => sp === 'bike' || sp === 'swim' ? (cfg.lthrBike || 158) : (cfg.lthrRun || 163);
  const bySport = {}, methods = new Set();
  if (!d) { // older activity without the summary: time only
    const sp = SP[a.sport] || 'other', h = (+a.moving_s || +a.elapsed_s || 0) / 3600;
    return { value: Math.round(h * 50), bySport: { [sp]: Math.round(h * 50) }, method: 'time' };
  }
  for (const sp of Object.keys(d.t)) {
    const total = d.t[sp] || 0; let load = 0, covered = 0;
    const sw = sp === 'swim' && cfg.css > 0 ? swimSecs(a) : null;
    if (sw) {   // swim: pace against CSS, IF cubed (TrainingPeaks sTSS); heart rate in the water is unreliable
      for (const x of sw) { const IF = Math.min(1.5, (x.d / x.s) / (100 / cfg.css)); load += x.s / 3600 * IF ** 3 * 100; }
      covered = total;   // rests between sets add nothing
      methods.add('pace');
    } else if (sp === 'bike' && cfg.ftp && d.pw?.length) {
      for (const p of d.pw) { const IF = p.np / cfg.ftp; load += p.s / 3600 * IF * IF * 100; covered += p.s; }
      methods.add('power');
    } else if (d.hr?.[sp]) {
      const L = lthr(sp);
      for (const [bpm, s] of Object.entries(d.hr[sp])) { const IF = Math.min(1.5, Math.max(0, (bpm - rest) / (L - rest))); load += s / 3600 * IF * IF * 100; covered += s; }
      methods.add('hr');
    }
    const left = Math.max(0, total - covered);
    if (left > 120) { load += left / 3600 * 50; methods.add('time'); }
    bySport[sp] = load;
  }
  const value = Object.values(bySport).reduce((p, v) => p + v, 0);
  for (const k in bySport) bySport[k] = Math.round(bySport[k]);
  return { value: Math.round(value), bySport, method: methods.size === 1 ? [...methods][0] : methods.size ? 'mixed' : 'time' };
}

// swim legs with distance and time spent swimming (pool: rest excluded; open water: moving time)
function swimSecs(a) {
  const out = (a.activity_sections || []).filter(s => s.sport === 'swim' && +s.distance_m > 0).map(s => ({ d: +s.distance_m, s: +(s.summary?.swimTime || s.timer_s || s.elapsed_s) }))
    .filter(x => x.s > 60 && x.d / x.s < 3);
  return out.length ? out : null;
}

// daily series from the first activity to `until` (UTC ms of a day start). Days keyed by local date of the activity.
export function pmc(acts, cfg, until) {
  const DAY = 864e5, byDay = new Map();
  const dayOf = a => { const t = Date.parse(a.start_time) + (a.utc_offset_min || 0) * 60000; const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
  for (const a of acts) { const k = dayOf(a), l = loadOf(a, cfg).value; byDay.set(k, (byDay.get(k) || 0) + l); }
  if (!byDay.size) return [];
  const start = Math.min(...byDay.keys()), out = [];
  let ctl = 0, atl = 0;
  for (let t = start; t <= until; t += DAY) {
    const load = byDay.get(t) || 0, form = ctl - atl;   // form uses yesterday's values
    ctl += (load - ctl) / 42; atl += (load - atl) / 7;
    out.push({ t, load, ctl, atl, form });
  }
  return out;
}

// form bands (Joe Friel / TrainingPeaks)
export function formBand(f) {
  if (f > 25) return { key: 'transition', label: 'Transition', note: 'Very fresh, but fitness is starting to fade.' };
  if (f > 5) return { key: 'fresh', label: 'Fresh', note: 'Rested and ready to race.' };
  if (f >= -10) return { key: 'grey', label: 'Neutral', note: 'Not tired, but not building much fitness either.' };
  if (f >= -30) return { key: 'optimal', label: 'Productive training', note: 'Tired from training that is building fitness.' };
  return { key: 'risk', label: 'Overload risk', note: 'Fatigue is well above fitness. Plan some recovery.' };
}
