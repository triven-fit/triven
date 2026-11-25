// PB trophies on an activity page: gold, silver or bronze when an effort in this activity was your 1st, 2nd or 3rd best
// at that distance (runs, swims) or power duration, as things stood on the day: all-time, and within that year (cup marked '25 etc.).
import { sb, state } from './main.js?v=1795590613';
import { RUN_DISTANCES, SWIM_DISTANCES, POWER_DURATIONS, BIKE_DISTANCES } from './process.js?v=1795590613';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const MEDAL = { 1: ['Gold', '#d4a72c', '#f3d97a'], 2: ['Silver', '#9aa3a8', '#dde2e5'], 3: ['Bronze', '#b0703a', '#e2b089'] };
const ORDER = new Map([...RUN_DISTANCES.map(([n], i) => ['run|' + n, i]), ...SWIM_DISTANCES.map(([n], i) => ['swim|' + n, 100 + i]), ...POWER_DURATIONS.map(([n], i) => ['bike|' + n, 200 + i]), ...BIKE_DISTANCES.map(([n], i) => ['bike|' + (n === '100 km' ? '100 km ride' : n), 300 + i])]);
const eligible = b => b.unit === 's' || b.unit === 'W';   // run, swim and bike distances, and power

// rank of each eligible effort in this activity, all-time and within its year, among your efforts up to that day
// (owner: worked out from your own data, with ignored efforts already left out of `bests`)
const yearOfId = id => { const a = state.activities.find(x => x.id === id); return a ? new Date(Date.parse(a.start_time) + (a.utc_offset_min || 0) * 60000).getUTCFullYear() : null; };
export function trophiesFor(activityId, bests) {
  const mine = bests.filter(b => b.activity_id === activityId && eligible(b)), yr = yearOfId(activityId);
  return mine.map(b => {
    const better = bests.filter(o => o.sport === b.sport && o.effort === b.effort && o.activity_id !== b.activity_id && Date.parse(o.achieved_at) <= Date.parse(b.achieved_at)
      && (b.unit === 'W' ? +o.value > +b.value : +o.value < +b.value));
    return { ...b, rank: better.length + 1, year_rank: better.filter(o => yearOfId(o.activity_id) === yr).length + 1, yr };
  }).filter(b => b.rank <= 3 || b.year_rank <= 3);
}

export function cup(rank, size = 18) {
  const [name, dark, light] = MEDAL[rank]; const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', name);
  svg.innerHTML = `<title>${name}</title><path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="${light}" stroke="${dark}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<path d="M7 5H4.5a2.5 2.5 0 0 0 2.6 3.6M17 5h2.5a2.5 2.5 0 0 1-2.6 3.6" fill="none" stroke="${dark}" stroke-width="1.6" stroke-linecap="round"/>`
    + `<path d="M12 13v4M8.5 20.5h7l-1-3.5h-5z" fill="${dark}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round"/>`
    + `<text x="12" y="9.6" text-anchor="middle" font-size="6.5" font-weight="700" font-family="Inter,sans-serif" fill="${dark}">${rank}</text>`;
  return svg;
}
const label = b => b.unit === 'W' ? b.effort.replace(/^power /, '') + ' power' : (b.sport === 'swim' ? 'Swim ' : b.sport === 'bike' ? 'Bike ' : '') + b.effort.replace(/ (TT|ride)$/, '');
const value = b => b.unit === 'W' ? Math.round(b.value) + ' W' : fmtDur(b.value);

document.addEventListener('triven:activity', async e => {
  const { act } = e.detail; const box = document.getElementById('actTrophies'); if (!box) return;
  box.hidden = true; box.replaceChildren();
  let list;
  if (act.owner === state.user.id) list = trophiesFor(act.id, state.bests || []);
  else { const r = await sb.rpc('activity_trophies', { aid: act.id }); list = r.error ? [] : r.data || []; }
  if (!list.length) return;
  list.sort((a, b) => (ORDER.get(a.sport + '|' + a.effort) ?? 999) - (ORDER.get(b.sport + '|' + b.effort) ?? 999));
  const mine = act.owner === state.user.id;
  box.append(el('span', { className: 'trlabel', textContent: mine ? 'Your bests' : 'Their bests' }));
  const nth = r => r === 1 ? 'best' : r === 2 ? '2nd best' : '3rd best';
  list.forEach(b => { const all = b.rank <= 3, yr = b.year_rank <= 3 && b.yr;
    const why = [all ? `${nth(b.rank)} ever` : null, yr ? `${nth(b.year_rank)} of ${b.yr}` : null].filter(Boolean).join(', ');
    box.append(el('span', { className: 'trophy r' + (all ? b.rank : b.year_rank), title: `${label(b)} ${value(b)}: ${why}, at the time` },
      all ? cup(b.rank) : null, yr && (!all || b.year_rank < b.rank) ?   // a year cup adds something only when it beats the all-time one
       el('span', { style: 'display:inline-flex;align-items:center;gap:1px' }, cup(b.year_rank, all ? 14 : 18), el('span', { className: 'yr', textContent: "'" + String(b.yr).slice(2) })) : null,
      el('b', { textContent: label(b) }), el('span', { textContent: value(b) }))); });
  box.hidden = false;
});
