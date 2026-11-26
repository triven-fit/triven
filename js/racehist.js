// Race history on a race's page: your other races at the same event, side by side with every leg and transition.
// Same event = both flagged as races, same sport (and multisport type), starts within 3 km, distance within 10%.
import { state } from './main.js?v=1795708914';
import * as U from './units.js?v=1795708914';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const diff = s => (s < 0 ? '−' : '+') + fmtDur(Math.abs(s));
const LEG = { swim: 'Swim', bike: 'Bike', run: 'Run', transition: 'T', other: 'Leg' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const start = a => a.summary?.start || a.summary?.track?.[0];
const km = (p, q) => { const R = 6371, r = x => x * Math.PI / 180, dLat = r(q[0] - p[0]), dLon = r(q[1] - p[1]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(p[0])) * Math.cos(r(q[0])) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const total = a => a.sport === 'multi' ? +a.elapsed_s : +(a.moving_s || a.elapsed_s);
export function sameEvent(a, b) {
  if (!a.is_race || !b.is_race || a.id === b.id || a.sport !== b.sport) return false;
  if (a.sport === 'multi' && a.multisport_profile !== b.multisport_profile) return false;
  const da = +a.distance_m, db = +b.distance_m; if (!(da > 0 && db > 0) || Math.abs(da - db) / Math.max(da, db) > 0.1) return false;
  const p = start(a), q = start(b); return !!(p && q && km(p, q) <= 3);
}

document.addEventListener('triven:activity', e => {
  const box = document.getElementById('raceHist'); if (!box) return;
  box.hidden = true; box.replaceChildren();
  const me = state.activities.find(x => x.id === e.detail.act.id); if (!me?.is_race) return;   // your own races
  const all = [me, ...state.activities.filter(x => sameEvent(me, x))].sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
  if (all.length < 2) return;
  const legsOf = a => (a.activity_sections || []).slice().sort((x, y) => x.idx - y.idx);
  const multi = me.sport === 'multi', cols = multi ? legsOf(me).map(s => s.sport) : [];
  let tn = 0; const head = ['', 'Date', 'Time', ...cols.map(s => s === 'transition' ? 'T' + (++tn) : LEG[s] || s), ''];
  const t = el('table', { className: 'laps rhtbl' }), hr = t.insertRow(); head.forEach(h => hr.append(el('th', { textContent: h })));
  const best = Math.min(...all.map(total));
  all.forEach(a => {
    const r = t.insertRow(); if (a.id === me.id) r.className = 'cur';
    const d = new Date(Date.parse(a.start_time) + (a.utc_offset_min || 0) * 60000);
    r.insertCell().append(a.id === me.id ? el('b', { textContent: 'This race' }) : el('a', { href: '#a/' + a.id, textContent: a.name }));
    r.insertCell().textContent = `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    r.insertCell().append(el('b', { textContent: fmtDur(total(a)) }), ...(total(a) === best ? [el('span', { className: 'rhbest', textContent: ' best' })] : []));
    const L = legsOf(a);
    cols.forEach((sp, i) => { const s = L[i]?.sport === sp ? L[i] : null, c = r.insertCell(); c.textContent = s ? fmtDur(+s.elapsed_s) : '–';
      const m = legsOf(me)[i]; if (s && a.id !== me.id && m) { const dd = +m.elapsed_s - +s.elapsed_s; if (Math.abs(dd) >= 1) c.append(el('small', { className: dd < 0 ? 'faster' : 'slower', textContent: ' ' + diff(dd) })); } });
    r.insertCell().append(a.id === me.id ? '' : el('span', { className: total(me) - total(a) < 0 ? 'faster' : 'slower', textContent: diff(total(me) - total(a)) }));
  });
  box.append(el('h2', { textContent: `Race history · ${all.length} times at this event` }), el('div', { className: 'acttblwrap' }, t),
    el('div', { className: 'note', textContent: `Your races starting within 3 km of this one at a similar distance (${U.dist(me.distance_m, 1)}). Green and red show this race against each other year, leg by leg.` }));
  box.hidden = false;
});
