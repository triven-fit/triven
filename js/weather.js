// Heat on activities: the weather at the activity's time and place (Open-Meteo, free, no key), saved in summary.weather.
// Only a rounded location (0.1°, about 10 km) and the date are sent. Runs get a heat cost on pace from temperature + dew
// point (the sum in °F: up to 100 no effect, 150 ≈ 4.5% slower, 180 ≈ 10%, above that hard running isn't advised).
import { sb, state } from './main.js?v=1795547292';
import * as U from './units.js?v=1795547292';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const DAY = 864e5;
const INDOOR = new Set(['treadmill', 'indoor', 'virtual', 'pool']);
const where = a => { const p = a.summary?.start || a.summary?.track?.[0]; return p ? [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10] : null; };
const outdoor = a => !a.indoor && !(a.activity_sections || []).every(s => INDOOR.has(s.summary?.env)) && where(a);

// fetch and average the hours the activity covered
export async function fetchWeather(a) {
  const ll = where(a); if (!ll) return null;
  const t0 = Date.parse(a.start_time), t1 = t0 + (+a.elapsed_s || 3600) * 1000, d0 = new Date(t0).toISOString().slice(0, 10), d1 = new Date(t1).toISOString().slice(0, 10);
  const recent = Date.now() - t0 < 80 * DAY;   // the archive lags a few days; the forecast API covers the recent past
  const base = recent ? 'https://api.open-meteo.com/v1/forecast' : 'https://archive-api.open-meteo.com/v1/archive';
  const url = `${base}?latitude=${ll[0]}&longitude=${ll[1]}&start_date=${d0}&end_date=${d1}&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,wind_speed_10m&timezone=GMT`;
  const r = await fetch(url); if (!r.ok) return null;
  const h = (await r.json()).hourly; if (!h?.time) return null;
  const idx = h.time.map((t, i) => [Date.parse(t + ':00Z'), i]).filter(([t]) => t >= t0 - 1800e3 && t <= t1 + 1800e3).map(x => x[1]);
  if (!idx.length) return null;
  const avg = k => { const v = idx.map(i => h[k][i]).filter(x => x != null); return v.length ? Math.round(v.reduce((p, x) => p + x, 0) / v.length * 10) / 10 : null; };
  const w = { t: avg('temperature_2m'), feels: avg('apparent_temperature'), hum: avg('relative_humidity_2m'), dew: avg('dew_point_2m'), wind: avg('wind_speed_10m'), src: 'open-meteo' };
  return w.t == null ? null : w;
}
async function ensure(a) {
  if (a.summary?.weather !== undefined || !outdoor(a)) return a.summary?.weather || null;
  let w = null; try { w = await fetchWeather(a); } catch { return null; }   // offline: try another time
  const summary = { ...(a.summary || {}), weather: w || false };          // false: looked, nothing found
  // merged on the server: list rows carry a slim summary without the map track, so never write one back whole
  const r = await sb.rpc('merge_summary', { aid: a.id, patch: { weather: w || false } });
  if (!r.error) { a.summary = summary; const s = state.activities.find(x => x.id === a.id); if (s) s.summary = summary; }
  return w;
}

// heat cost on running pace, % slower, from °C temperature and dew point
export function heatCost(w) {
  if (!w || w.t == null || w.dew == null) return null;
  const f = c => c * 9 / 5 + 32, s = f(w.t) + f(w.dew);
  const P = [[100, 0], [110, 0.5], [120, 1], [130, 2], [140, 3], [150, 4.5], [160, 6], [170, 8], [180, 10]];
  if (s <= 100) return 0; if (s >= 180) return 10;
  for (let i = 1; i < P.length; i++) if (s <= P[i][0]) { const [x0, y0] = P[i - 1], [x1, y1] = P[i]; return Math.round((y0 + (s - x0) / (x1 - x0) * (y1 - y0)) * 10) / 10; }
  return 10;
}
export const tempTxt = c => U.imperial() ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`;
const windTxt = k => U.imperial() ? `${Math.round(k / 1.609)} mph` : `${Math.round(k)} km/h`;

// on the activity page
document.addEventListener('triven:activity', async e => {
  const { act, sections } = e.detail, box = document.getElementById('actWeather'); if (!box) return;
  box.hidden = true; box.replaceChildren();
  const a = { ...act, activity_sections: sections };
  const w = act.owner === state.user?.id ? await ensure(a) : act.summary?.weather;
  if (!w || document.getElementById('actWeather') !== box) return;
  const parts = [el('b', { textContent: tempTxt(w.t) }), w.feels != null && Math.abs(w.feels - w.t) >= 1 ? ` · feels like ${tempTxt(w.feels)}` : '', w.hum != null ? ` · humidity ${Math.round(w.hum)}%` : '', w.wind != null ? ` · wind ${windTxt(w.wind)}` : ''];
  box.append(el('span', { className: 'wxicon', textContent: w.t >= 30 ? '🌡' : '☁' }), ...parts);
  const run = (sections || []).filter(s => s.sport === 'run'), hc = heatCost(w);
  if (run.length && hc != null) {
    const d = run.reduce((p, s) => p + (+s.distance_m || 0), 0), t = run.reduce((p, s) => p + (+s.timer_s || +s.elapsed_s || 0), 0);
    if (hc === 0) box.append(el('span', { className: 'muted', textContent: ' · no heat cost on pace' }));
    else box.append(el('span', { className: 'heatcost', title: 'From temperature plus dew point: the pace you could expect in cool conditions for the same effort.' },
      ` · heat cost ≈ ${hc}%${hc >= 10 ? ' (hard running not advised)' : ''}`, d > 0 && t > 0 ? ` · heat-adjusted pace ${U.pace(t / (1 + hc / 100), d)}` : ''));
  }
  box.append(el('span', { className: 'muted wxsrc', textContent: ' · weather: Open-Meteo' }));
  box.hidden = false;
});

// fill in recent outdoor activities in the background, newest first, a batch per visit
export async function weatherBackfill(max = 120) {
  const todo = state.activities.filter(a => a.summary?.weather === undefined && outdoor(a)).sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time)).slice(0, max);
  for (const a of todo) { await ensure(a); await new Promise(r => setTimeout(r, 250)); }
}
