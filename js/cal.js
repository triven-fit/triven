// Training log: fitness / fatigue / form chart and the month calendar with training load per day and week.
import { state } from './main.js?v=1795367753';
import * as U from './units.js?v=1795367753';
import { DEFAULTS } from './settings.js?v=1795367753';
import { mountPerf } from './perfui.js?v=1795367753';
import { loadOf, pmc, formBand } from './load.js?v=1795367753';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const DAY = 864e5, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SPV = { run: '--run', bike: '--bike', swim: '--swim' };
const fmtHM = s => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };
const km = m => U.toD(m).toFixed(U.toD(m) >= 100 ? 0 : 1);   // in km or miles; label with U.dU()
const fmtD = t => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const localDay = a => { const d = new Date(Date.parse(a.start_time) + (a.utc_offset_min || 0) * 60000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const mondayOf = t => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
const now = new Date(), TODAY = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
const RANGES = [['6w', '6 weeks', 42], ['3m', '3 months', 91], ['6m', '6 months', 182], ['1y', '1 year', 365]];
const COL = () => matchMedia('(prefers-color-scheme: dark)').matches ? { fit: '#7878e8', fat: '#d47524' } : { fit: '#5b5bd6', fat: '#d9731a' };

let range = '3m', month = Date.UTC(now.getFullYear(), now.getMonth(), 1), bound = false;

export function mountCal() {
  const v = document.getElementById('logPmc'), vc = document.getElementById('logCal'); v.replaceChildren(); vc.replaceChildren();
  if (!bound) { bound = true; document.addEventListener('triven:settings', () => { if (!document.getElementById('view-log').hidden) mountCal(); }); }
  const cfg = Object.assign({}, DEFAULTS, state.profile?.settings || {});
  const acts = state.activities.slice().sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
  document.getElementById('logSide').replaceChildren(ytdPanel(acts));
  if (!acts.length) { document.getElementById('logPerf').replaceChildren(); return; }
  const loads = new Map(acts.map(a => [a.id, loadOf(a, cfg)]));
  const series = pmc(acts, cfg, TODAY);
  v.append(fitnessCard(series, acts, loads)); vc.append(calendarCard(acts, loads));
  mountPerf(document.getElementById('logPerf'), acts, cfg);
}

// ---------- fitness, fatigue, form ----------
function fitnessCard(series, acts, loads) {
  const c = el('div', { className: 'card' });
  const head = el('div', { className: 'calhead' }, el('h2', { textContent: 'Fitness and form' }));
  const chips = el('div', { className: 'segrow', style: 'margin:0' });
  RANGES.forEach(([k, t]) => { const b = el('button', { className: 'chip', type: 'button', textContent: t }); b.setAttribute('aria-pressed', k === range); b.onclick = () => { range = k; mountCal(); }; chips.append(b); });
  head.append(chips); c.append(head);

  const last = series.at(-1), wk = series.at(-8) || series[0];
  const band = formBand(last.form), d = last.ctl - wk.ctl;
  const tile = (label, val, sub, col) => el('div', { className: 'stat pmcstat' }, el('small', { textContent: label }),
    el('b', {}, col ? el('i', { className: 'sw', style: `background:${col}` }) : null, String(Math.round(val))), el('div', { className: 'muted', style: 'font-size:12px', textContent: sub }));
  const C = COL();
  c.append(el('div', { className: 'stats pmcstats' },
    tile('Fitness', last.ctl, `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} in the last 7 days`, C.fit),
    tile('Fatigue', last.atl, 'last 7 days, weighted', C.fat),
    el('div', { className: `stat pmcstat form-${band.key}` }, el('small', { textContent: 'Form' }), el('b', { textContent: (last.form > 0 ? '+' : '') + Math.round(last.form) }),
      el('div', { style: 'font-size:12px;font-weight:600', textContent: band.label }), el('div', { className: 'muted', style: 'font-size:12px', textContent: band.note }))));

  const host = el('div', { className: 'pmc' }); c.append(host);
  requestAnimationFrame(() => drawPmc(host, series));

  const hrOnly = [...loads.values()].filter(l => l.method === 'time').length;
  const det = el('details', { className: 'note', style: 'margin-top:12px' }, el('summary', { textContent: 'How these are worked out' }),
    el('p', { textContent: 'Each activity gets a training load on the TSS scale, where an hour at threshold scores 100. Rides with a power meter use normalised power against your FTP once you set one in Settings. Everything else uses heart rate: each second scores by how close you were to threshold heart rate (as a share of heart-rate reserve, squared). Time without heart rate or power counts as an easy aerobic hour, 50 per hour.' }),
    el('p', { textContent: 'Fitness is the 42-day weighted average of daily load, fatigue the 7-day average, and form is yesterday’s fitness minus fatigue (the TrainingPeaks model). Form bands: above +25 transition, +5 to +25 fresh, −10 to +5 neutral, −30 to −10 productive training, below −30 overload risk.' }),
    el('p', { textContent: `Change threshold heart rate, resting heart rate or FTP in Settings and every load recalculates.${hrOnly ? ` ${hrOnly} ${hrOnly === 1 ? 'activity has' : 'activities have'} no heart rate yet, so they are estimated from time.` : ''}` }));
  c.append(det);
  return c;
}

function drawPmc(host, all) {
  const d3 = window.d3; host.replaceChildren();
  const days = RANGES.find(r => r[0] === range)[2];
  const S = all.filter(p => p.t > TODAY - days * DAY);
  if (!S.length) { host.append(el('div', { className: 'note', textContent: 'No training in this period.' })); return; }
  const C = COL(), W = Math.max(320, host.clientWidth), m = { l: 40, r: 72, t: 10 };
  const H1 = 190, H2 = 96, H3 = 54, gap = 30, H = m.t + H1 + gap + H2 + gap + H3 + 22;
  const x = d3.scaleTime().domain([S[0].t, S.at(-1).t + DAY]).range([m.l, W - m.r]);
  const bw = Math.max(1, (W - m.l - m.r) / S.length - (S.length > 120 ? 0 : 1));
  const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img')
    .attr('aria-label', `Fitness ${Math.round(S.at(-1).ctl)}, fatigue ${Math.round(S.at(-1).atl)}, form ${Math.round(S.at(-1).form)}`);
  const muted = css('--text-muted'), grid = css('--grid'), line = css('--line');
  const label = (y, t) => svg.append('text').attr('x', m.l).attr('y', y).attr('font-size', 11).attr('font-weight', 600).attr('letter-spacing', '.05em').attr('fill', muted).text(t);
  // panel 1: fitness and fatigue (same units, one axis)
  const y1top = m.t, y1 = d3.scaleLinear().domain([0, Math.max(10, d3.max(S, p => Math.max(p.ctl, p.atl)) * 1.1)]).nice().range([y1top + H1, y1top]);
  svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y1).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(d3.format('d'))).call(g => { g.select('.domain').remove(); g.selectAll('line').attr('stroke', grid); g.selectAll('text').attr('fill', muted).attr('font-size', 10); });
  const mid = p => x(p.t) + bw / 2;
  svg.append('path').datum(S).attr('fill', C.fit).attr('opacity', .12).attr('d', d3.area().x(mid).y0(y1(0)).y1(p => y1(p.ctl)).curve(d3.curveMonotoneX));
  svg.append('path').datum(S).attr('fill', 'none').attr('stroke', C.fit).attr('stroke-width', 2).attr('d', d3.line().x(mid).y(p => y1(p.ctl)).curve(d3.curveMonotoneX));
  svg.append('path').datum(S).attr('fill', 'none').attr('stroke', C.fat).attr('stroke-width', 2).attr('d', d3.line().x(mid).y(p => y1(p.atl)).curve(d3.curveMonotoneX));
  // direct labels at the right end (nudged apart if they collide)
  let lf = y1(S.at(-1).ctl), la = y1(S.at(-1).atl); if (Math.abs(lf - la) < 14) { const mp = (lf + la) / 2, s = lf < la ? -7 : 7; lf = mp + s; la = mp - s; }
  [['Fitness', lf, C.fit], ['Fatigue', la, C.fat]].forEach(([t, yy, col]) => { svg.append('circle').attr('cx', W - m.r + 8).attr('cy', yy).attr('r', 4).attr('fill', col);
    svg.append('text').attr('x', W - m.r + 16).attr('y', yy + 4).attr('font-size', 12).attr('fill', css('--text-secondary')).text(t); });
  // panel 2: form, with the bands shaded
  const y2top = y1top + H1 + gap, fmin = Math.min(-35, d3.min(S, p => p.form) - 3), fmax = Math.max(30, d3.max(S, p => p.form) + 3);
  const y2 = d3.scaleLinear().domain([fmin, fmax]).range([y2top + H2, y2top]);
  label(y2top - 6, 'FORM');
  const bands = [[25, fmax, 'Transition', 'transition'], [5, 25, 'Fresh', 'fresh'], [-10, 5, 'Neutral', 'grey'], [-30, -10, 'Productive', 'optimal'], [fmin, -30, 'Overload risk', 'risk']];
  bands.forEach(([a, b, t, k]) => { if (b <= a) return;
    svg.append('rect').attr('x', m.l).attr('width', W - m.l - m.r).attr('y', y2(b)).attr('height', y2(a) - y2(b)).attr('class', `fband fb-${k}`);
    if (y2(a) - y2(b) > 11) svg.append('text').attr('x', W - m.r + 8).attr('y', (y2(a) + y2(b)) / 2 + 4).attr('font-size', 11).attr('fill', muted).text(t); });
  svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y2(0)).attr('y2', y2(0)).attr('stroke', line);
  svg.selectAll('.fb').data(S).enter().append('rect').attr('x', p => x(p.t)).attr('width', bw)
    .attr('y', p => p.form >= 0 ? y2(p.form) : y2(0)).attr('height', p => Math.max(1, Math.abs(y2(p.form) - y2(0)))).attr('rx', bw > 6 ? 2 : 0)
    .attr('fill', p => p.form >= 0 ? css('--accent') : css('--text-muted')).attr('opacity', .85);
  [-30, -10, 5, 25].forEach(v => { if (v > fmin && v < fmax) svg.append('text').attr('x', m.l - 6).attr('y', y2(v) + 3).attr('text-anchor', 'end').attr('font-size', 10).attr('fill', muted).text(v > 0 ? '+' + v : v); });
  // panel 3: daily load
  const y3top = y2top + H2 + gap, y3 = d3.scaleLinear().domain([0, Math.max(50, d3.max(S, p => p.load))]).range([y3top + H3, y3top]);
  label(y3top - 6, 'DAILY LOAD');
  svg.selectAll('.lb').data(S.filter(p => p.load)).enter().append('rect').attr('x', p => x(p.t)).attr('width', bw)
    .attr('y', p => y3(p.load)).attr('height', p => y3(0) - y3(p.load)).attr('rx', bw > 6 ? 2 : 0).attr('fill', css('--text-secondary')).attr('opacity', .55);
  svg.append('text').attr('x', m.l - 6).attr('y', y3top + 8).attr('text-anchor', 'end').attr('font-size', 10).attr('fill', muted).text(Math.round(y3.domain()[1]));
  // x axis
  svg.append('g').attr('transform', `translate(0,${y3top + H3 + 2})`).call(d3.axisBottom(x).ticks(Math.min(8, Math.floor(W / 110))).tickSize(0).tickFormat(t => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; }))
    .call(g => { g.select('.domain').remove(); g.selectAll('text').attr('fill', muted).attr('font-size', 10).attr('dy', 12); });
  // hover: crosshair + tooltip
  const cross = svg.append('line').attr('y1', m.t).attr('y2', y3top + H3).attr('stroke', muted).attr('stroke-dasharray', '3 3').attr('opacity', 0);
  const dotF = svg.append('circle').attr('r', 4).attr('fill', C.fit).attr('stroke', css('--surface-1')).attr('stroke-width', 2).attr('opacity', 0);
  const dotA = svg.append('circle').attr('r', 4).attr('fill', C.fat).attr('stroke', css('--surface-1')).attr('stroke-width', 2).attr('opacity', 0);
  const tip = el('div', { className: 'pmctip', hidden: true }); host.style.position = 'relative'; host.append(tip);
  const hit = svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', y3top + H3 - m.t).attr('fill', 'transparent');
  const move = ev => {
    const [px] = d3.pointer(ev, svg.node()), t = x.invert(px), i = Math.max(0, Math.min(S.length - 1, Math.floor((t - S[0].t) / DAY))), p = S[i];
    const cx = mid(p); cross.attr('x1', cx).attr('x2', cx).attr('opacity', 1); dotF.attr('cx', cx).attr('cy', y1(p.ctl)).attr('opacity', 1); dotA.attr('cx', cx).attr('cy', y1(p.atl)).attr('opacity', 1);
    tip.replaceChildren(el('b', { textContent: fmtD(p.t) }),
      el('div', {}, el('i', { className: 'sw', style: `background:${C.fit}` }), `Fitness ${Math.round(p.ctl)}`),
      el('div', {}, el('i', { className: 'sw', style: `background:${C.fat}` }), `Fatigue ${Math.round(p.atl)}`),
      el('div', { textContent: `Form ${p.form > 0 ? '+' : ''}${Math.round(p.form)} · ${formBand(p.form).label}` }),
      el('div', { className: 'muted', textContent: p.load ? `Load that day ${Math.round(p.load)}` : 'Rest day' }));
    tip.hidden = false; const sc = host.clientWidth / W, left = cx * sc;
    tip.style.left = (left > host.clientWidth - 190 ? left - 186 : left + 12) + 'px'; tip.style.top = '8px';
  };
  hit.on('mousemove', move).on('touchmove', e => { e.preventDefault(); move(e.touches[0]); }, { passive: false })
    .on('mouseleave', () => { tip.hidden = true; cross.attr('opacity', 0); dotF.attr('opacity', 0); dotA.attr('opacity', 0); });
}

// ---------- month calendar ----------
function calendarCard(acts, loads) {
  const c = el('div', { className: 'card', style: 'margin-top:16px' });
  const d = new Date(month), y = d.getUTCFullYear(), mo = d.getUTCMonth();
  const nav = (n, t, lbl) => el('button', { className: 'btn sm', type: 'button', textContent: t, ariaLabel: lbl, onclick: () => { const dd = new Date(month); month = n === 0 ? Date.UTC(now.getFullYear(), now.getMonth(), 1) : Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + n, 1); mountCal(); } });
  c.append(el('div', { className: 'calhead' }, el('h2', { textContent: `${MONTHS[mo]} ${y}` }), el('div', { className: 'pnav' }, nav(-1, '‹', 'Previous month'), nav(0, 'Today'), nav(1, '›', 'Next month'))));
  const g = el('div', { className: 'cal' }); c.append(g);
  [...WD, 'Week'].forEach(w => g.append(el('div', { className: 'dow', textContent: w })));
  const byDay = new Map(); acts.forEach(a => { const k = localDay(a); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(a); });
  const end = Date.UTC(y, mo + 1, 1);
  for (let w = mondayOf(month); w < end; w += 7 * DAY) {
    let wd = 0, wt = 0, wl = 0; const bySp = {};
    const addSp = (sp, dist, time) => { const o = bySp[sp] || (bySp[sp] = { d: 0, t: 0 }); o.d += dist || 0; o.t += time || 0; };
    for (let i = 0; i < 7; i++) {
      const t = w + i * DAY, list = byDay.get(t) || [];
      const cell = el('div', { className: 'day' + (new Date(t).getUTCMonth() !== mo ? ' out' : '') + (t === TODAY ? ' today' : '') });
      const dl = list.reduce((p, a) => p + loads.get(a.id).value, 0);
      cell.append(el('div', { className: 'dhead' }, el('span', { className: 'n', textContent: new Date(t).getUTCDate() }), dl ? el('span', { className: 'dload', title: 'Training load', textContent: Math.round(dl) }) : null));
      list.forEach(a => {
        const time = a.sport === 'multi' ? +a.elapsed_s : +(a.moving_s || a.elapsed_s);
        wd += +a.distance_m || 0; wt += time || 0; wl += loads.get(a.id).value;
        if (a.sport === 'multi' && a.activity_sections?.length) a.activity_sections.forEach(s => { if (s.sport !== 'transition') addSp(s.sport, +s.distance_m, +s.elapsed_s); });
        else addSp(SPV[a.sport] ? a.sport : 'other', +a.distance_m, time);
        const b = el('a', { className: 'chipact', href: '#a/' + a.id, title: `${a.name} · ${km(a.distance_m)} ${U.dU()} · ${fmtHM(time)} · load ${loads.get(a.id).value}` },
          el('b', { textContent: (a.is_race ? '🏁 ' : '') + (+a.distance_m > 0 ? `${km(a.distance_m)} ${U.dU()}` : fmtHM(time)) }), el('span', { textContent: a.name }));
        b.style.borderLeftColor = a.sport === 'multi' ? 'var(--text-secondary)' : `var(${SPV[a.sport] || '--trans'})`;
        if (a.sport === 'multi' && a.activity_sections?.length) { const mb = el('div', { className: 'mbar' }); a.activity_sections.slice().sort((p, q) => p.idx - q.idx).forEach(s => { const i = el('i'); i.style.flex = String(s.elapsed_s); i.style.background = s.sport === 'transition' ? 'var(--trans)' : `var(${SPV[s.sport] || '--trans'})`; mb.append(i); }); b.append(mb); }
        cell.append(b);
      });
      g.append(cell);
    }
    // one total if the week was a single sport, otherwise swim / bike / run lines
    const sps = ['swim', 'bike', 'run', 'other'].filter(k => bySp[k] && bySp[k].t > 0);
    const wk = el('div', { className: 'wk' });
    if (wt && sps.length <= 1) wk.append(el('b', { textContent: km(wd) + ' ' + U.dU() }), el('div', { textContent: fmtHM(wt) }));
    else if (wt) sps.forEach(k => wk.append(el('div', { className: 'wsp' }, el('i', { className: 'sw', style: `background:var(${SPV[k] || '--trans'})` }),
      el('span', {}, el('b', { textContent: { swim: 'Swim', bike: 'Bike', run: 'Run', other: 'Other' }[k] + ' ' }), `${bySp[k].d ? km(bySp[k].d) + ' ' + U.dU() + ' · ' : ''}${fmtHM(bySp[k].t)}`))));
    if (wt) wk.append(el('div', { className: 'wload', textContent: `Load ${Math.round(wl)}` }));
    g.append(wk);
  }
  c.append(el('div', { className: 'note', textContent: 'The number in the corner of a day is that day’s training load. Tap an activity to open it.' }));
  return c;
}

// ---------- year to date, per sport ----------
function ytdPanel(acts) {
  const y = new Date(TODAY).getUTCFullYear(), from = Date.UTC(y, 0, 1);
  const ys = acts.filter(a => localDay(a) >= from);
  const S = {}, legs = [];
  let multi = 0;
  for (const a of ys) {
    if (a.sport === 'multi' && a.activity_sections?.length) { multi++;
      a.activity_sections.filter(s => s.sport !== 'transition').forEach(s => legs.push({ a, sp: s.sport, d: +s.distance_m || 0, t: +s.elapsed_s || 0, e: +s.ascent_m || 0 })); }
    else legs.push({ a, sp: a.sport, d: +a.distance_m || 0, t: +(a.moving_s || a.elapsed_s) || 0, e: +a.ascent_m || 0 });
  }
  for (const l of legs) { if (!SPV[l.sp]) continue; const o = S[l.sp] || (S[l.sp] = { n: new Set(), d: 0, t: 0, e: 0, long: null });
    o.n.add(l.a.id); o.d += l.d; o.t += l.t; o.e += l.e; if (!o.long || l.d > o.long.d) o.long = l; }
  const c = el('div', { className: 'card' }, el('h2', { textContent: `${y} so far` }));
  const sps = ['swim', 'bike', 'run'].filter(k => S[k]);
  if (!sps.length) { c.append(el('div', { className: 'note', textContent: 'No activities this year yet.' })); return c; }
  const name = { swim: 'Swim', bike: 'Bike', run: 'Run' };
  sps.forEach(k => { const o = S[k];
    const kv = el('div', { className: 'ytdkv' },
      el('span', { textContent: 'Activities' }), el('b', { textContent: o.n.size }),
      el('span', { textContent: 'Time' }), el('b', { textContent: fmtHM(o.t) }));
    if (k !== 'swim') kv.append(el('span', { textContent: 'Elevation' }), el('b', { textContent: U.elev(o.e) }));
    if (o.long) kv.append(el('span', { textContent: k === 'swim' ? 'Longest swim' : k === 'bike' ? 'Longest ride' : 'Longest run' }),
      el('b', {}, el('a', { href: '#a/' + o.long.a.id, title: o.long.a.name, textContent: k === 'swim' && o.long.d < 10000 ? `${Math.round(o.long.d).toLocaleString()} m` : `${km(o.long.d)} ${U.dU()}` })));
    c.append(el('div', { className: 'ytdsp' }, el('h3', {}, el('i', { className: 'sw', style: `background:var(${SPV[k]})` }), name[k]),
      el('div', { className: 'ytdbig' }, k === 'swim' && o.d < 10000 ? Math.round(o.d).toLocaleString() : km(o.d), el('small', { textContent: k === 'swim' && o.d < 10000 ? 'm' : U.dU() })), kv));
  });
  if (multi) c.append(el('div', { className: 'note', style: 'margin-top:4px', textContent: `Includes ${multi} multisport ${multi === 1 ? 'race' : 'races'}, each leg counted in its own sport.` }));
  return c;
}
