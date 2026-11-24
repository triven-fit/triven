// Feed sidebar: you (photo, follows, latest activity) and this week: days trained, load against a suggested range,
// a 12-week chart, and weekly goals per sport. Click a bar to see that week's days and numbers; click it again,
// or "Back to this week", to return.
//
// Suggested weekly load range: your chronic load (fitness x 7) times 0.8 to 1.3, the acute:chronic workload ratio
// band sports science treats as the "sweet spot" (below it fitness drifts, well above it injury risk climbs).
import { sb, state, toast, avatarEl, raceFlag } from './main.js?v=1795542095';
import { DEFAULTS } from './settings.js?v=1795542095';
import * as U from './units.js?v=1795542095';
import { loadOf, pmc } from './load.js?v=1795542095';
import { openModal } from './edit.js?v=1795542095';
import { nextRaceCard } from './races.js?v=1795542095';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY = 864e5, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SPV = { run: '--run', bike: '--bike', swim: '--swim' }, SPN = { all: 'All', run: 'Run', bike: 'Ride', swim: 'Swim' };
const fmtHM = s => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };
const localDay = a => { const d = new Date(Date.parse(a.start_time) + (a.utc_offset_min || 0) * 60000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const now = new Date(), TODAY = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
const mondayOf = t => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
let tab = 'all', sel = null;   // sel: index of the chosen week in the chart (null = this week)

// per-sport distance/time for one activity (multisport legs split out)
function legs(a) {
  if (a.sport === 'multi' && a.activity_sections?.length) return a.activity_sections.filter(s => SPV[s.sport]).map(s => ({ sp: s.sport, d: +s.distance_m || 0, t: +s.elapsed_s || 0, e: +s.ascent_m || 0 }));
  return SPV[a.sport] ? [{ sp: a.sport, d: +a.distance_m || 0, t: +(a.moving_s || a.elapsed_s) || 0, e: +a.ascent_m || 0 }] : [];
}

export async function mountWeek(host) {
  host.replaceChildren(); sel = null;
  const cfg = Object.assign({}, DEFAULTS, state.profile?.settings || {});
  const acts = state.activities;
  const nr = nextRaceCard();
  host.append(youCard(acts), ...(nr ? [nr] : []), weekCard(acts, cfg));
}

function youCard(acts) {
  const p = state.profile || {};
  const c = el('div', { className: 'card sidecard' });
  c.append(el('div', { className: 'youhead' }, avatarEl(p.display_name, p.avatar_path, 56), el('div', {}, el('b', { textContent: p.display_name || 'You' }),
    el('button', { className: 'linkbtn', type: 'button', textContent: 'Edit profile', style: 'font-size:12px;display:block', onclick: () => document.getElementById('openSettings').click() }))));
  const counts = el('div', { className: 'youcounts' });
  const cell = (n, t, href) => el('a', { href, className: 'ycount' }, el('b', { textContent: n }), el('span', { textContent: t }));
  counts.append(cell('…', 'Following', '#club'), cell('…', 'Followers', '#club'), cell(acts.length.toLocaleString(), 'Activities', '#log'));
  c.append(counts);
  sb.rpc('my_network').then(({ data }) => { if (!data) return; const f = data.filter(n => n.direction === 'following' && n.status === 'accepted').length, fl = data.filter(n => n.direction === 'follower' && n.status === 'accepted').length;
    counts.children[0].querySelector('b').textContent = f; counts.children[1].querySelector('b').textContent = fl; });
  const last = acts.slice().sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time))[0];
  if (last) { const d = new Date(Date.parse(last.start_time) + (last.utc_offset_min || 0) * 60000);
    c.append(el('div', { className: 'youlast' }, el('span', { className: 'muted', textContent: 'Latest activity' }),
      el('a', { href: '#a/' + last.id }, el('b', { textContent: last.name }), last.is_race ? raceFlag(13) : null, ` · ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`))); }
  return c;
}

function weekCard(acts, cfg) {
  const c = el('div', { className: 'card sidecard' });
  const tabs = el('div', { className: 'wtabs', role: 'tablist' });
  ['all', 'run', 'bike', 'swim'].forEach(k => { const b = el('button', { type: 'button', role: 'tab', className: 'wtab', textContent: SPN[k] }); b.setAttribute('aria-selected', k === tab);
    if (SPV[k]) b.prepend(el('i', { className: 'sw', style: `background:var(${SPV[k]})` }));
    b.onclick = () => { tab = k; c.replaceWith(weekCard(acts, cfg)); }; tabs.append(b); });
  c.append(tabs);

  const wk0 = mondayOf(TODAY), weeks = 12, first = wk0 - (weeks - 1) * 7 * DAY;
  const W = Array.from({ length: weeks }, (_, i) => ({ t: first + i * 7 * DAY, load: 0, d: 0, time: 0, e: 0, days: Array(7).fill(0) }));
  for (const a of acts) {
    const day = localDay(a); if (day < first || day > TODAY) continue;
    const wi = Math.floor((day - first) / (7 * DAY)), L = legs(a).filter(l => tab === 'all' || l.sp === tab);
    if (!L.length) continue;
    const w = W[wi]; L.forEach(l => { w.d += l.d; w.time += l.t; w.e += l.e; });
    const ld = loadOf(a, cfg); w.load += tab === 'all' ? ld.value : (ld.bySport[tab] || 0);
    w.days[(day - w.t) / DAY] = 1;
  }
  const si = sel == null ? W.length - 1 : sel, cur = W[si], isNow = si === W.length - 1;
  const days = cur.days;
  const redraw = () => c.replaceWith(weekCard(acts, cfg));
  // week dots
  const dots = el('div', { className: 'wdots' });
  'MTWTFSS'.split('').forEach((ch, i) => dots.append(el('div', {}, el('i', { className: days[i] ? 'on' : '', style: days[i] ? `background:var(${SPV[tab] || '--accent'})` : '' }), el('span', { textContent: ch }))));

  let range = null;
  if (tab === 'all') {
    // fitness going into the week: a week ago for this week, the Sunday before for a past week
    const series = pmc(acts, cfg, isNow ? TODAY - 7 * DAY : cur.t - DAY);
    const ctl = series.at(-1)?.ctl || 0;
    if (ctl > 3) range = [Math.round(ctl * 7 * 0.8), Math.round(ctl * 7 * 1.3)];
  }
  const head = el('div', { className: 'whead' }, dots);
  if (tab === 'all') head.append(el('div', { className: 'wnum' }, el('small', { textContent: 'Load' }), el('b', { textContent: Math.round(cur.load) })),
    el('div', { className: 'wnum' }, el('small', { textContent: 'Suggested' }), el('b', { textContent: range ? `${range[0]}–${range[1]}` : '—' })));
  else head.append(el('div', { className: 'wnum' }, el('small', { textContent: 'Distance' }), el('b', { textContent: U.distBig(cur.d) })),
    el('div', { className: 'wnum' }, el('small', { textContent: 'Time' }), el('b', { textContent: fmtHM(cur.time) })));
  const wd = new Date(cur.t), title = el('div', { className: 'sec wtitle', textContent: isNow ? 'This week' : `Week of ${wd.getUTCDate()} ${MON[wd.getUTCMonth()]}` });
  if (!isNow) title.append(el('button', { className: 'linkbtn wback', type: 'button', textContent: 'Back to this week', onclick: () => { sel = null; redraw(); } }));
  c.append(title, head);
  if (tab === 'all' && range) {
    const msg = isNow ? (cur.load < range[0] ? `${range[0] - Math.round(cur.load)} to go to reach your range` : cur.load > range[1] ? 'Above your usual range: big week, watch the recovery' : 'In your range')
      : (cur.load < range[0] ? `Below the range for that week by ${range[0] - Math.round(cur.load)}` : cur.load > range[1] ? 'Above the range for that week' : 'In the range for that week');
    c.append(el('div', { className: 'muted', style: 'font-size:12px;margin-top:2px', textContent: msg }));
  }
  c.append(chart(W, tab, range, si, i => { sel = i === W.length - 1 || i === si && sel != null ? null : i; redraw(); }));

  // goals: weekly (settings.goals), monthly (goalsMonth), annual (goalsYear)
  const gl = el('div', { className: 'goals' });
  const sports = tab === 'all' ? ['swim', 'bike', 'run', 'all'] : [tab];
  const t0 = new Date(TODAY), m0 = Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), 1), y0 = Date.UTC(t0.getUTCFullYear(), 0, 1);
  const PERIODS = [
    ['goals', 'This week', wk0, wk0 + 7 * DAY],
    ['goalsMonth', MONTHS[t0.getUTCMonth()], m0, Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth() + 1, 1)],
    ['goalsYear', String(t0.getUTCFullYear()), y0, Date.UTC(t0.getUTCFullYear() + 1, 0, 1)]];
  PERIODS.forEach(([key, label, start, end]) => {
    const goals = cfg[key] || {}, inP = acts.filter(a => localDay(a) >= start && localDay(a) <= TODAY);
    const tot = sp => { let d = 0, t = 0, e = 0; inP.forEach(a => legs(a).forEach(l => { if (sp === 'all' || l.sp === sp) { d += l.d; t += l.t; e += l.e; } })); return { distance: d, time: t, elevation: e }; };
    const days = Math.round((end - start) / DAY), done = (TODAY - start) / DAY + 1, left = days - done;   // today counts as done
    const rows = sports.filter(sp => goals[sp]?.target);
    if (!rows.length) return;
    gl.append(el('div', { className: 'gper', textContent: label }));
    rows.forEach(sp => { const g = goals[sp]; const have = tot(sp)[g.metric] || 0, want = g.metric === 'distance' ? g.target * 1000 : g.metric === 'time' ? g.target * 3600 : g.target;
      const f = Math.min(1, have / want), due = want * done / days, show = v => g.metric === 'distance' ? U.dist(v, 1) : g.metric === 'time' ? fmtHM(v) : U.elev(v);
      // the tick marks where you'd be by today at an even rate
      const bar = el('div', { className: 'gbar' }, el('i', { style: `width:${f * 100}%;background:var(${SPV[sp] || '--accent'})` }), key === 'goals' ? null : el('b', { className: 'gdue', style: `left:${Math.min(100, done / days * 100)}%`, title: `On pace: ${show(due)} by today` }));
      const note = have >= want ? `Goal done ${key === 'goals' ? 'this week' : key === 'goalsMonth' ? 'this month' : 'this year'}`
        : `${show(want - have)} to go · ${left} ${left === 1 ? 'day' : 'days'} left after today` + (key === 'goals' ? '' : have >= due ? ` · ${show(have - due)} ahead of pace` : ` · ${show(due - have)} behind pace`);
      gl.append(el('div', { className: 'goal' }, el('div', { className: 'gtop' }, el('b', { textContent: sp === 'all' ? 'All sports' : SPN[sp] }), el('span', { textContent: `${show(have)} / ${show(want)}` })), bar,
        el('div', { className: 'muted', style: 'font-size:11px', textContent: note }))); });
  });
  if (!gl.children.length) gl.append(el('div', { className: 'muted', style: 'font-size:12px', textContent: tab === 'all' ? 'No goals yet.' : `No ${SPN[tab].toLowerCase()} goals yet.` }));
  c.append(el('div', { className: 'sec wtitle', textContent: 'Goals' }), gl,
    el('button', { className: 'linkbtn', type: 'button', textContent: 'Set goals', style: 'margin-top:8px', onclick: () => editGoals(() => mountWeek(c.parentElement)) }));
  return c;
}

// 12 weekly bars (load for All, distance for a sport) with the chosen week's suggested range shaded; each column is a
// button (click, or Enter/Space when focused) that picks its week
function chart(W, tab, range, si, pick) {
  const d3 = window.d3, w = 264, h = 110, m = { l: 4, r: 4, t: 8, b: 18 };
  const val = x => tab === 'all' ? x.load : x.d / 1000;
  const max = Math.max(1, d3.max(W, val), range ? range[1] : 0) * 1.1;
  const x = i => m.l + i * (w - m.l - m.r) / W.length, bw = (w - m.l - m.r) / W.length - 4, y = v => h - m.b - v / max * (h - m.t - m.b);
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', '100%'); svg.setAttribute('class', 'wchart'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Last 12 weeks of ${tab === 'all' ? 'training load' : SPN[tab].toLowerCase() + ' distance'}`);
  const add = (tag, at) => { const e = document.createElementNS(ns, tag); for (const k in at) e.setAttribute(k, at[k]); svg.append(e); return e; };
  if (range) add('rect', { x: x(si) - 2, width: bw + 4, y: y(range[1]), height: y(range[0]) - y(range[1]), rx: 3, class: 'wrange' });
  W.forEach((wk, i) => { const v = val(wk), dd = new Date(wk.t);
    const r = add('rect', { x: x(i), width: bw, y: y(v), height: Math.max(v ? 2 : 0, h - m.b - y(v)), rx: 3, class: i === si ? 'wbar cur' : 'wbar' });
    if (SPV[tab]) r.style.fill = `var(${SPV[tab]})`; if (i !== si) r.style.opacity = .45;
    // a full-height, see-through hit area so short and empty weeks are easy to click
    const hit = add('rect', { x: x(i) - 2, width: bw + 4, y: m.t, height: h - m.t - 4, class: 'whit', tabindex: 0, role: 'button',
      'aria-pressed': i === si, 'aria-label': `Week of ${dd.getUTCDate()} ${MON[dd.getUTCMonth()]}: ${tab === 'all' ? Math.round(wk.load) + ' load' : U.dist(wk.d, 1)}` });
    hit.addEventListener('click', () => pick(i)); hit.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i); } });
    const t = document.createElementNS(ns, 'title'); t.textContent = `Week of ${dd.getUTCDate()} ${MON[dd.getUTCMonth()]}: ${tab === 'all' ? Math.round(wk.load) + ' load' : U.dist(wk.d, 1)} · ${fmtHM(wk.time)}`; hit.append(t); });
  [0, 4, 8, 11].forEach(i => { const dd = new Date(W[i].t); const t = add('text', { x: i === 0 ? x(i) : i === 11 ? x(i) + bw : x(i) + bw / 2, y: h - 4, 'text-anchor': i === 0 ? 'start' : i === 11 ? 'end' : 'middle', class: 'wlab' }); t.textContent = `${dd.getUTCDate()} ${MON[dd.getUTCMonth()]}`; });
  return svg;
}

function editGoals(onDone) {
  openModal((body, close) => {
    const S = state.profile?.settings || {};
    const P = [['goals', 'Weekly', 'Weeks run Monday to Sunday.'], ['goalsMonth', 'Monthly', 'Calendar months.'], ['goalsYear', 'Annual', 'Calendar years, January to December.']];
    const draft = Object.fromEntries(P.map(([k]) => [k, { ...(S[k] || {}) }]));   // stored in km, hours or metres
    let cur = 'goals';
    body.append(el('h3', { textContent: 'Goals' }));
    const chips = el('div', { className: 'segrow', style: 'margin:4px 0 6px' }), hint = el('p', { className: 'sec', style: 'margin-top:0' }), box = el('div');
    body.append(chips, hint, box);
    const toBox = (k, g) => g?.target == null ? '' : (g.metric || (k === 'all' ? 'time' : 'distance')) === 'distance' ? +U.toD(g.target * 1000).toFixed(1) : g.metric === 'elevation' ? Math.round(U.toE(g.target)) : g.target;
    let rows = {};
    const keep = () => { const out = {}; for (const k in rows) { const v = parseFloat(rows[k].target.value); if (v > 0) { const m = rows[k].metric.value, old = draft[cur][k];
      // an untouched box keeps the stored value exactly
      out[k] = old && old.metric === m && String(toBox(k, old)) === rows[k].target.value ? old : { metric: m, target: m === 'distance' ? U.fromD(v) / 1000 : m === 'elevation' ? (U.imperial() ? v * U.FT : v) : v }; } }
      draft[cur] = out; };
    const paint = () => {
      chips.replaceChildren(...P.map(([k, t]) => { const b = el('button', { type: 'button', className: 'chip', textContent: t }); b.setAttribute('aria-pressed', k === cur); b.onclick = () => { keep(); cur = k; paint(); }; return b; }));
      hint.textContent = P.find(p => p[0] === cur)[2] + ' Multisport legs count towards their own sport. Leave a target empty for no goal.';
      const g = draft[cur]; rows = {}; box.replaceChildren();
      [['swim', 'Swim'], ['bike', 'Ride'], ['run', 'Run'], ['all', 'All sports']].forEach(([k, t]) => {
        const metric = el('select'); [['distance', `Distance (${U.dU()})`], ['time', 'Time (hours)'], ['elevation', `Elevation (${U.eU()})`]].forEach(([v, l]) => metric.append(el('option', { value: v, textContent: l, selected: (g[k]?.metric || (k === 'all' ? 'time' : 'distance')) === v })));
        const target = el('input', { type: 'number', min: 0, step: 'any', value: toBox(k, g[k]), placeholder: 'no goal', style: 'width:110px' });
        rows[k] = { metric, target };
        box.append(el('div', { className: 'goalrow' }, el('b', { textContent: t }), metric, target));
      });
    };
    paint();
    const save = el('button', { className: 'btn primary', type: 'button', textContent: 'Save goals' });
    body.append(el('div', { className: 'actions', style: 'justify-content:flex-end' }, el('button', { className: 'btn', type: 'button', textContent: 'Cancel', onclick: close }), save));
    save.onclick = async () => {
      keep();
      const settings = { ...(state.profile.settings || {}), ...draft };
      const r = await sb.from('profiles').update({ settings }).eq('id', state.user.id);
      if (r.error) { toast(r.error.message); return; }
      state.profile.settings = settings; close(); toast('Goals saved'); onDone && onDone();
    };
  });
}
