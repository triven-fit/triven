// Training log → Activities: search and filter every activity, with totals for what matches.
// Words in the search box must all match (names, descriptions, private notes, type, race distance, gear, month and year).
import { state, raceFlag } from './main.js?v=1795591409';
import { envLabel } from './process.js?v=1795591409';
import * as U from './units.js?v=1795591409';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const fmtHM = s => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };
const SPC = { run: 'var(--run)', bike: 'var(--bike)', swim: 'var(--swim)', multi: 'var(--accent)', other: 'var(--trans)' };
const DAY = 864e5;
const F = { q: '', sport: 'all', race: false, period: 'any', from: '', to: '', min: '', max: '', sort: 'date', dir: -1, shown: 50 };

const local = a => new Date(Date.parse(a.start_time) + (a.utc_offset_min || 0) * 60000);
const timeOf = a => a.sport === 'multi' ? +a.elapsed_s : +(a.moving_s || a.elapsed_s);
function typeOf(a) {
  if (a.sport === 'multi') { const t = (a.summary?.distanceClass ? a.summary.distanceClass + ' ' : '') + (a.multisport_profile && a.multisport_profile !== 'other' ? a.multisport_profile : 'multisport'); return t[0].toUpperCase() + t.slice(1); }
  const s0 = (a.activity_sections || []).find(s => s.sport !== 'transition');
  return envLabel(a.sport, s0?.summary?.env);
}
// everything a search word can match
function haystack(a) {
  const d = local(a), gear = new Set([a.gear_id, ...(a.activity_sections || []).map(s => s.gear_id)].filter(Boolean));
  const gearNames = state.gear.filter(g => gear.has(g.id)).map(g => [g.name, g.brand, g.model].filter(Boolean).join(' '));
  const envs = (a.activity_sections || []).map(s => s.summary?.env).filter(Boolean).map(e => e.replace('_', ' '));
  return [a.name, a.description, a.notes, typeOf(a), a.sport === 'bike' ? 'ride cycling bike' : a.sport === 'run' ? 'run running' : a.sport === 'swim' ? 'swim swimming' : a.sport,
    a.multisport_profile, a.summary?.distanceClass, ...envs, a.is_race ? 'race' : '', a.indoor ? 'indoor' : '', a.summary?.linked ? 'joined linked' : '', a.source === 'manual' ? 'manual logged by hand' : '',
    ...gearNames, MON[d.getUTCMonth()], MON[d.getUTCMonth()].slice(0, 3), String(d.getUTCFullYear())].filter(Boolean).join(' ').toLowerCase();
}

function matches(list) {
  const words = F.q.toLowerCase().split(/\s+/).filter(Boolean);
  const now = Date.now(), y0 = Date.UTC(new Date().getFullYear(), 0, 1);
  const from = F.period === 'year' ? y0 : F.period === '12m' ? now - 365 * DAY : F.period === 'custom' && F.from ? Date.parse(F.from) : null;
  const to = F.period === 'custom' && F.to ? Date.parse(F.to) + DAY : null;
  const min = F.min === '' ? null : U.fromD(F.min), max = F.max === '' ? null : U.fromD(F.max);
  return list.filter(a => {
    if (F.sport !== 'all' && a.sport !== F.sport) return false;
    if (F.race && !a.is_race) return false;
    const t = local(a).getTime();
    if (from != null && t < from) return false;
    if (to != null && t >= to) return false;
    if (min != null && +a.distance_m < min) return false;
    if (max != null && +a.distance_m > max) return false;
    if (words.length) { const h = a._h || (a._h = haystack(a)); if (!words.every(w => h.includes(w))) return false; }
    return true;
  });
}
const SORTS = { date: a => Date.parse(a.start_time), name: a => (a.name || '').toLowerCase(), dist: a => +a.distance_m, time: a => timeOf(a), elev: a => +(a.ascent_m || 0),
  pace: a => { const d = +a.distance_m, t = timeOf(a); return d > 0 && t > 0 ? -d / t : Infinity; } };   // fastest first when descending

function speedText(a) {
  const d = +a.distance_m, t = timeOf(a); if (!(d > 0 && t > 0) || a.sport === 'multi') return '–';
  if (a.sport === 'run') return U.pace(t, d);
  if (a.sport === 'swim') return U.swimPace(t, d);
  return U.speed(t, d);
}

export function mountActivities(host) {
  host.replaceChildren();
  const card = el('div', { className: 'card' });
  const q = el('input', { type: 'search', className: 'actsearch', placeholder: 'Search names, notes, gear, “race”, “pool”, “sprint triathlon”, “march 2025”…', value: F.q, autocomplete: 'off' });
  const sportRow = el('div', { className: 'segrow', style: 'margin:10px 0 0' });
  [['all', 'All'], ['run', 'Run'], ['bike', 'Ride'], ['swim', 'Swim'], ['multi', 'Multisport']].forEach(([k, t]) => { const b = el('button', { className: 'chip', type: 'button', textContent: t }); b.dataset.k = k; b.onclick = () => { F.sport = k; F.shown = 50; paint(); }; sportRow.append(b); });
  const race = el('button', { className: 'chip', type: 'button' }, raceFlag(13), ' Races only'); race.onclick = () => { F.race = !F.race; F.shown = 50; paint(); };
  sportRow.append(el('span', { style: 'width:8px' }), race);
  const period = el('select', { className: 'msel' }); [['any', 'Any time'], ['year', 'This year'], ['12m', 'Last 12 months'], ['custom', 'Dates…']].forEach(([v, t]) => period.append(el('option', { value: v, textContent: t, selected: F.period === v })));
  const from = el('input', { type: 'date', value: F.from }), to = el('input', { type: 'date', value: F.to });
  const dates = el('span', { className: 'actdates' }, from, ' – ', to);
  const min = el('input', { type: 'number', min: 0, step: 'any', placeholder: 'min', value: F.min, className: 'actkm' }), max = el('input', { type: 'number', min: 0, step: 'any', placeholder: 'max', value: F.max, className: 'actkm' });
  const filters = el('div', { className: 'actfilters' }, el('label', {}, 'When ', period), dates, el('label', {}, 'Distance ', min, ' – ', max, ' ' + U.dU()));
  const clear = el('button', { className: 'linkbtn', type: 'button', textContent: 'Clear filters', onclick: () => { Object.assign(F, { q: '', sport: 'all', race: false, period: 'any', from: '', to: '', min: '', max: '', shown: 50 }); mountActivities(host); } });
  const summary = el('div', { className: 'actsum' }), list = el('div', { className: 'actlist' });
  card.append(q, sportRow, filters, el('div', { className: 'actsumrow' }, summary, clear), list);
  host.append(card);

  let tmr = null;
  q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => { F.q = q.value; F.shown = 50; paint(); }, 150); };
  period.onchange = () => { F.period = period.value; F.shown = 50; paint(); };
  from.onchange = () => { F.from = from.value; paint(); }; to.onchange = () => { F.to = to.value; paint(); };
  min.oninput = () => { F.min = min.value; paint(); }; max.oninput = () => { F.max = max.value; paint(); };

  function paint() {
    sportRow.querySelectorAll('.chip[data-k]').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === F.sport));
    race.setAttribute('aria-pressed', F.race); dates.hidden = F.period !== 'custom';
    const res = matches(state.activities);
    const key = SORTS[F.sort]; res.sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * F.dir; });
    const dist = res.reduce((p, a) => p + (+a.distance_m || 0), 0), time = res.reduce((p, a) => p + timeOf(a), 0), elev = res.reduce((p, a) => p + (+a.ascent_m || 0), 0);
    summary.replaceChildren(el('b', { textContent: `${res.length.toLocaleString()} ${res.length === 1 ? 'activity' : 'activities'}` }),
      res.length ? ` · ${U.distBig(dist)} · ${fmtHM(time)} · ${U.elev(elev)}` : '');
    list.replaceChildren();
    if (!res.length) { list.append(el('div', { className: 'note', textContent: state.activities.length ? 'No activities match. Try fewer words or clear the filters.' : 'No activities yet. Upload some on the Upload tab.' })); return; }
    const tbl = el('table', { className: 'laps acttbl' }), hr = tbl.insertRow();
    [['date', 'Date'], ['name', 'Activity'], [null, 'Type'], ['dist', 'Distance'], ['time', 'Time'], ['pace', 'Pace / speed'], ['elev', 'Elevation']].forEach(([k, t]) => {
      const th = el('th', { textContent: t + (k && F.sort === k ? (F.dir < 0 ? ' ↓' : ' ↑') : '') });
      if (k) { th.className = 'sortable'; th.onclick = () => { if (F.sort === k) F.dir = -F.dir; else { F.sort = k; F.dir = k === 'name' ? 1 : -1; } paint(); }; }
      hr.append(th);
    });
    res.slice(0, F.shown).forEach(a => {
      const r = tbl.insertRow(), d = local(a);
      r.insertCell().textContent = `${d.getUTCDate()} ${MON[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
      const nm = r.insertCell(); nm.append(el('span', { className: 'dot', style: `background:${SPC[a.sport] || 'var(--trans)'}` }), el('a', { href: '#a/' + a.id, textContent: a.name }));
      if (a.is_race) nm.append(' ', raceFlag(13));
      [typeOf(a), U.dist(a.distance_m), fmtDur(timeOf(a)), speedText(a), a.ascent_m ? U.elev(a.ascent_m) : '–'].forEach(v => { r.insertCell().textContent = v; });
    });
    list.append(el('div', { className: 'acttblwrap' }, tbl));
    if (res.length > F.shown) list.append(el('button', { className: 'btn more', textContent: `Show more (${(res.length - F.shown).toLocaleString()} left)`, onclick: () => { F.shown += 100; paint(); } }));
  }
  paint();
  if (!matchMedia('(pointer: coarse)').matches) q.focus();
}
