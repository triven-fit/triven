// Training log → Best efforts. Overview: every category in distance or duration order, for all time or one year.
// Pick one to see your top 10 (one per activity); open an activity with a way back to the list; ignore spurious efforts.
// Ignored efforts (table best_ignores) drop out of bests, trophies, profile bests, FTP and race predictions.
import { sb, state, toast } from './main.js?v=1795591072';
import { RUN_DISTANCES, BIKE_DISTANCES, POWER_DURATIONS, SWIM_DISTANCES } from './process.js?v=1795591072';
import { cup } from './trophies.js?v=1795591072';
import * as U from './units.js?v=1795591072';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SWIM_LABEL = { '750 m': '750 m (sprint tri)', '1500 m': '1500 m (Olympic tri)', '1900 m': '1.9 km (70.3)', '3800 m': '3.8 km (Ironman)' };

export const CATS = [
  { key: 'run', title: 'Running', note: 'The fastest stretch of any run, including the run legs of multisport races.',
    items: RUN_DISTANCES.map(([e, m]) => ({ sport: 'run', effort: e, m, label: e })) },
  { key: 'power', title: 'Cycling power', note: 'Measured power from a power meter only. Estimated power never sets a best.',
    items: POWER_DURATIONS.map(([e]) => ({ sport: 'bike', effort: e, hi: true, label: e.replace(/^power /, '') })) },
  { key: 'bike', title: 'Cycling', note: 'Time trial distances use the fastest stretch of any ride.',
    items: [...BIKE_DISTANCES.map(([e, m]) => ({ sport: 'bike', effort: e === '100 km' ? '100 km ride' : e, m,   // stored as '100 km ride' (see process.js)
      label: { '90 km': '90 km (70.3 bike)', '180 km': '180 km (Ironman bike)' }[e] || e })),
      { sport: 'bike', effort: 'longest ride', hi: true, label: 'Longest ride' }, { sport: 'bike', effort: 'most elevation', hi: true, label: 'Most elevation gain' }] },
  { key: 'swim', title: 'Swimming', note: 'Pool swims count continuous swimming only (no rests or drills); open water uses GPS.',
    items: SWIM_DISTANCES.map(([e, m]) => ({ sport: 'swim', effort: e, m, label: SWIM_LABEL[e] || e })) },
];
const ITEM = new Map(CATS.flatMap(c => c.items.map(i => [i.sport + '|' + i.effort, { ...i, cat: c }])));

// ---------- data ----------
const ikey = b => `${b.activity_id}|${b.sport}|${b.effort}`;
export function applyIgnores() { state.bests = (state.bestsAll || []).filter(b => !state.ignores?.has(ikey(b))); }
const ACT = () => { const m = new Map(); state.activities.forEach(a => m.set(a.id, a)); return m; };
export const yearOf = a => new Date(Date.parse(a.start_time) + (a.utc_offset_min || 0) * 60000).getUTCFullYear();
const dateOf = (a, b) => { const d = new Date(Date.parse(a?.start_time || b.achieved_at) + (a?.utc_offset_min || 0) * 60000); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
// every effort for one category in scope, best first
function ranked(it, year, acts, includeIgnored = false) {
  return (includeIgnored ? state.bestsAll || [] : state.bests).filter(b => b.sport === it.sport && b.effort === it.effort && acts.has(b.activity_id)
    && (year === 'all' || yearOf(acts.get(b.activity_id)) === +year))
    .sort((x, y) => it.hi ? y.value - x.value : x.value - y.value || Date.parse(x.achieved_at) - Date.parse(y.achieved_at));
}
const val = (it, b) => b.unit === 'W' ? `${Math.round(b.value)} W` : b.unit === 'm' ? (it.effort === 'longest ride' ? U.dist(b.value, 1) : U.elev(b.value)) : fmtDur(b.value);
const second = (it, b) => {
  if (b.unit === 'W') { const kg = state.profile?.settings?.mass; return kg ? `${(b.value / kg).toFixed(2)} W/kg` : ''; }
  if (b.unit === 'm') return '';
  return it.sport === 'run' ? U.pace(b.value, it.m) : it.sport === 'swim' ? U.swimPace(b.value, it.m) : U.speed(b.value, it.m);
};
const parse = h => { const [path, q] = h.split('?'); const y = new URLSearchParams(q || '').get('y') || 'all'; const parts = path.split('/').slice(2).map(decodeURIComponent); return { y, sport: parts[0], effort: parts[1] }; };
const href = (sport, effort, y) => '#log/bests' + (sport ? `/${sport}/${encodeURIComponent(effort)}` : '') + (y && y !== 'all' ? `?y=${y}` : '');

function yearChips(y, go) {
  const acts = ACT(), years = [...new Set((state.bests || []).map(b => acts.get(b.activity_id)).filter(Boolean).map(yearOf))].sort((a, b) => b - a);
  const row = el('div', { className: 'segrow bestyears' });
  ['all', ...years].forEach(v => { const b = el('a', { className: 'chip', href: go(String(v)), textContent: v === 'all' ? 'All time' : v }); b.setAttribute('aria-pressed', String(v) === String(y)); row.append(b); });
  return row;
}

// ---------- pages ----------
export function mountBests(host, h) {
  const p = parse(h);
  host.replaceChildren();
  if (p.sport && ITEM.has(p.sport + '|' + p.effort)) return detail(host, ITEM.get(p.sport + '|' + p.effort), p.y);
  const acts = ACT();
  host.append(yearChips(p.y, v => href(null, null, v)));
  const grid = el('div', { className: 'grid2b', style: 'margin-top:12px' });
  CATS.forEach(c => {
    const t = el('table', { className: 'pb bestlist' }), card = el('div', { className: 'card' }, el('h2', { textContent: c.title }), t, el('div', { className: 'note', textContent: c.note }));
    c.items.forEach(it => {
      const list = ranked(it, p.y, acts), b = list[0], tr = t.insertRow();
      tr.insertCell().textContent = it.label;
      if (!b) { tr.className = 'none'; const td = tr.insertCell(); td.colSpan = 3; td.textContent = '—'; }
      else {
        tr.className = 'go'; tr.tabIndex = 0; tr.title = `See your top ${Math.min(10, list.length)}`;
        tr.insertCell().append(el('b', { textContent: val(it, b) }));
        tr.insertCell().textContent = second(it, b);
        tr.insertCell().append(el('span', { className: 'muted', textContent: dateOf(acts.get(b.activity_id), b) }));
      }
      const go = () => { location.hash = href(it.sport, it.effort, p.y); };
      tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); };
      tr.append(el('td', { className: 'chev', textContent: b ? '›' : '' }));
    });
    grid.append(card);
  });
  host.append(grid);
}

// opening an activity from a list remembers the list, so the activity page can offer a way back
const actLink = (b, a) => el('a', { href: '#a/' + b.activity_id, textContent: a?.name || 'Activity', onclick: () => { try { sessionStorage.setItem('triven.back', JSON.stringify({ id: b.activity_id, h: state.route })); } catch { /* storage blocked */ } } });
function detail(host, it, y) {
  const acts = ACT(), list = ranked(it, y, acts), top = list.slice(0, 10);
  const ignored = ranked(it, y, acts, true).filter(b => state.ignores.has(ikey(b)));
  const card = el('div', { className: 'card' });
  card.append(el('a', { className: 'backlink', href: href(null, null, y), textContent: '← All best efforts' }),
    el('h2', { style: 'margin-top:6px', textContent: `${it.cat.title}: ${it.label}` }),
    el('p', { className: 'sec', style: 'margin:2px 0 10px', textContent: `Your top ${top.length || 10}${y === 'all' ? ' of all time' : ' in ' + y}, one per activity.` }),
    yearChips(y, v => href(it.sport, it.effort, v)));
  if (!top.length) card.append(el('div', { className: 'note', textContent: y === 'all' ? 'No efforts yet.' : `No efforts in ${y}.` }));
  else {
    const t = el('table', { className: 'pb ranklist' }), hr = t.insertRow();
    ['', it.unit === 'W' || it.hi ? 'Best' : 'Time', '', 'Date', 'Activity', ''].forEach(c => hr.append(el('th', { textContent: c })));
    top.forEach((b, i) => {
      const tr = t.insertRow(), a = acts.get(b.activity_id);
      tr.insertCell().append(i < 3 ? cup(i + 1, 20) : el('span', { className: 'rk', textContent: i + 1 }));
      tr.insertCell().append(el('b', { textContent: val(it, b) }));
      tr.insertCell().textContent = second(it, b);
      tr.insertCell().textContent = dateOf(a, b);
      tr.insertCell().append(actLink(b, a));
      tr.insertCell().append(el('button', { className: 'linkbtn ign', type: 'button', textContent: 'Ignore', title: 'Leave this out of your bests and trophies (e.g. a power spike)', onclick: () => setIgnored(b, true, () => detail(host.replaceChildren() || host, it, y)) }));
    });
    card.append(el('div', { className: 'acttblwrap' }, t));
  }
  if (ignored.length) {
    const t = el('table', { className: 'pb ranklist ignored' });
    ignored.forEach(b => { const tr = t.insertRow(), a = acts.get(b.activity_id);
      tr.insertCell().textContent = val(it, b); tr.insertCell().textContent = dateOf(a, b);
      tr.insertCell().append(actLink(b, a));
      tr.insertCell().append(el('button', { className: 'linkbtn', type: 'button', textContent: 'Restore', onclick: () => setIgnored(b, false, () => detail(host.replaceChildren() || host, it, y)) })); });
    card.append(el('h3', { className: 'psub', style: 'margin-top:18px', textContent: `Ignored (${ignored.length})` }), t);
  }
  card.append(el('div', { className: 'note', textContent: 'Ignoring an effort leaves it out of your bests, trophies, profile and FTP suggestions. The activity itself isn’t changed, and you can restore it here.' }));
  host.append(card);
}

export async function setIgnored(b, on, done) {
  const k = ikey(b);
  const r = on ? await sb.from('best_ignores').insert({ activity_id: b.activity_id, sport: b.sport, effort: b.effort })
    : await sb.from('best_ignores').delete().eq('activity_id', b.activity_id).eq('sport', b.sport).eq('effort', b.effort);
  if (r.error) { toast('Could not save: ' + r.error.message); return; }
  if (on) state.ignores.add(k); else state.ignores.delete(k);
  applyIgnores();
  toast(on ? 'Ignored. It no longer counts as a best.' : 'Restored');
  done && done();
}

// text for the activity page's back link
export function backLabel(h) {
  const p = parse(h), it = p.sport && ITEM.get(p.sport + '|' + p.effort);
  if (it) return `← Back to ${it.cat.key === 'power' ? it.label + ' power' : it.label} bests${p.y !== 'all' ? ' (' + p.y + ')' : ''}`;
  return h.startsWith('#log/bests') ? '← Back to best efforts' : '← Back';
}
