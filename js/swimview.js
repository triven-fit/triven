// Pool swim card on an activity page: swim time vs rest, pace on swimming time, SWOLF, strokes, stroke mix,
// a per-length pace chart, and intervals (sets between rests) that open into their lengths.
import { lengthsIn, poolStats, poolIntervals, STROKE_NAME, fmtPace } from './swim.js?v=1795591409';
import { state } from './main.js?v=1795591409';
import { settingsAt } from './athlete.js?v=1795591409';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
// one colour per stroke, from the swim palette outward
const STROKE_COL = { freestyle: '--swim', backstroke: '--bike', breaststroke: '--run', butterfly: '--warn', drill: '--trans', mixed: '--text-muted', im: '--text-muted' };
const col = k => `var(${STROKE_COL[k] || '--swim'})`;

document.addEventListener('triven:activity', e => {
  const box = document.getElementById('swimcard'); if (!box) return;
  box.hidden = true; box.replaceChildren();
  const { act, sections, streams } = e.detail;
  const swims = (sections || []).filter(s => s.sport === 'swim'), pools = swims.filter(s => s.summary?.env === 'pool');
  const css = settingsAt(state.profile?.settings || {}, act).css;   // swim threshold in effect that day
  if (pools.length && streams?.lengths?.length) for (const sec of pools) { render(box, sec, lengthsIn(sec, streams.lengths), pools.length > 1); box.append(zones(poolPaces(sec, streams), css, act.owner === state.user?.id)); }
  // open water: zones from speed
  for (const sec of swims.filter(s => s.summary?.env !== 'pool')) { const p = owPaces(sec, streams); if (!p.length) continue;
    box.append(el('h2', { textContent: swims.length > 1 ? `Open water swim · leg ${sec.idx + 1}` : 'Open water swim' }), zones(p, css, act.owner === state.user?.id)); }
  box.hidden = !box.children.length;
});

function render(box, sec, lens, several) {
  const L = +sec.summary.poolLength || 25, st = poolStats(lens, L); if (!st) return;
  const ivs = poolIntervals(lens, L);
  box.append(el('h2', { textContent: several ? `Pool swim · leg ${sec.idx + 1}` : 'Pool swim' }));
  // headline numbers
  const stats = el('div', { className: 'swimstats' }), stat = (v, l) => stats.append(el('div', {}, el('b', { textContent: v }), el('small', { textContent: l })));
  stat(`${fmtPace(st.pace100)} /100 m`, 'Pace, swimming time');
  stat(fmtDur(st.swimTime), `Swimming · ${fmtDur(st.rest)} rest`);
  stat(`${st.lengths} × ${L} m`, `${st.distance.toLocaleString()} m in ${ivs.length} ${ivs.length === 1 ? 'set' : 'sets'}`);
  if (st.swolf != null) stat(Math.round(st.swolf), 'Avg SWOLF');
  if (st.strokeRate != null) stat(`${Math.round(st.strokeRate)} spm`, 'Stroke rate');
  if (st.strokesPerLength != null) stat(st.strokesPerLength.toFixed(1), 'Strokes per length');
  box.append(stats);
  // stroke mix
  const mix = Object.entries(st.byStroke).sort((a, b) => b[1].dist - a[1].dist);
  const bar = el('div', { className: 'strokebar' }), leg = el('div', { className: 'legend' });
  mix.forEach(([k, v]) => { const i = el('i'); i.style.flex = String(v.dist); i.style.background = col(k); i.title = `${STROKE_NAME[k] || k}: ${v.dist} m`; bar.append(i);
    leg.append(el('span', {}, el('i', { style: `background:${col(k)}` }), `${STROKE_NAME[k] || k} ${v.dist} m · ${fmtPace(v.time / v.dist * 100)} /100 m`)); });
  box.append(bar, leg);
  box.append(lengthChart(lens, L));
  // intervals, each opening into its lengths
  const tbl = el('table', { className: 'laps swimtbl' }), hr = tbl.insertRow();
  ['Set', 'Stroke', 'Distance', 'Time', 'Pace /100 m', 'SWOLF', 'Strokes', 'Rest after'].forEach(t => hr.append(el('th', { textContent: t })));
  ivs.forEach(iv => {
    const r = tbl.insertRow(); r.className = 'lap';
    [String(iv.n), STROKE_NAME[iv.stroke] || iv.stroke, `${iv.dist} m`, fmtDur(iv.time), fmtPace(iv.pace100), iv.swolf != null ? Math.round(iv.swolf) : '–', iv.strokes ?? '–', iv.rest ? fmtDur(iv.rest) : '–']
      .forEach((v, i) => { const c = r.insertCell(); if (i === 1) c.append(el('span', { className: 'dot', style: `background:${col(iv.stroke)}` })); c.append(String(v)); });
    const kids = iv.lengths.map((l, k) => { const x = tbl.insertRow(); x.className = 'swimlen'; x.hidden = true;
      [`· ${k + 1}`, STROKE_NAME[l.stroke] || '', `${L} m`, fmtDur(l.dur), fmtPace(l.dur / L * 100), l.strokes && l.stroke !== 'drill' ? Math.round(l.dur + l.strokes) : '–', l.strokes ?? '–', ''].forEach(v => x.insertCell().textContent = String(v)); return x; });
    r.title = 'Click to see each length';
    r.onclick = () => { const open = kids[0]?.hidden; kids.forEach(x => x.hidden = !open); r.classList.toggle('sel', open); };
  });
  box.append(el('div', { className: 'segbar-head' }, el('h2', { textContent: 'Sets and lengths' }), el('span', { className: 'muted', style: 'font-size:12px', textContent: 'Click a set to see its lengths' })), tbl);
  box.append(el('div', { className: 'note', textContent: 'Pace uses time spent swimming, worked out from each length your watch recorded, so rests between sets never slow it down, even if your watch put several lengths into one lap. SWOLF is a length’s time in seconds plus its strokes: lower is more efficient, and it only compares fairly within the same pool. Strokes are counted the way your watch counts them: one each time the arm wearing it completes a cycle, so freestyle and backstroke show half the total arm pulls. Double the stroke rate to compare with counters that count both arms.' }));
}

// pace of every length as bars (taller = faster), coloured by stroke, with gaps for rests
function lengthChart(lens, L) {
  const host = el('div', { className: 'swimchart' });
  const act = lens.filter(l => l.type !== 'idle' && l.dur > 0); if (act.length < 2) return host;
  requestAnimationFrame(() => {
    const W = Math.max(320, host.clientWidth || 900), H = 150, m = { l: 48, r: 6, t: 10, b: 18 };
    const items = []; lens.forEach(l => items.push(l.type === 'idle' ? { gap: true, dur: l.dur } : l));
    const x = d3.scaleBand().domain(items.map((_, i) => i)).range([m.l, W - m.r]).paddingInner(0.15);
    const paces = act.map(l => l.dur / L * 100), lo = Math.min(...paces), hi = Math.max(...paces);
    const y = d3.scaleLinear().domain([hi * 1.08, Math.max(0, lo * 0.85)]).range([H - m.b, m.t]);   // faster pace higher
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Pace for each length');
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l - 4},0)`).call(d3.axisLeft(y).ticks(4).tickSize(0).tickFormat(v => fmtPace(v)));
    items.forEach((l, i) => {
      if (l.gap) { svg.append('rect').attr('x', x(i)).attr('width', x.bandwidth()).attr('y', H - m.b - 3).attr('height', 3).attr('fill', css('--grid')).append('title').text(`Rest ${fmtDur(l.dur)}`); return; }
      const p = l.dur / L * 100;
      svg.append('rect').attr('x', x(i)).attr('width', x.bandwidth()).attr('y', y(p)).attr('height', H - m.b - y(p)).attr('rx', 2).attr('fill', css(STROKE_COL[l.stroke] || '--swim'))
        .append('title').text(`${STROKE_NAME[l.stroke] || 'Length'} · ${fmtDur(l.dur)} (${fmtPace(p)} /100 m)${l.strokes ? ` · ${l.strokes} strokes · SWOLF ${Math.round(l.dur + l.strokes)}` : ''}`);
    });
    svg.append('text').attr('x', m.l).attr('y', H - 2).attr('font-size', 10).attr('fill', css('--text-muted')).text('Each bar is a length; grey ticks are rests. Taller is faster.');
  });
  return host;
}

// ---------- swim zones: pace against your swim threshold (CSS) ----------
// Bands in seconds per 100 m slower (+) or faster (−) than CSS, after Swim Smooth's CSS-based zones.
const SZ = [['Z1', 'Recovery', 15, Infinity], ['Z2', 'Endurance', 6, 15], ['Z3', 'Tempo', 2, 6], ['Z4', 'Threshold', -2, 2], ['Z5', 'Above threshold', -Infinity, -2]];
const SZ_COL = ['--z1', '--z2', '--z3', '--z4', '--z5'];
// [seconds, pace per 100 m] pairs
function poolPaces(sec, streams) {
  const L = +sec.summary?.poolLength || 25;
  return lengthsIn(sec, streams?.lengths || []).filter(l => l.type !== 'idle' && l.dur > 0).map(l => [l.dur, l.dur / L * 100]);
}
function owPaces(sec, streams) {
  if (!streams?.t || !streams.speed) return [];
  const a = +sec.start_offset_s, b = a + +sec.elapsed_s, out = [];
  for (let i = 1; i < streams.t.length; i++) { const t = streams.t[i]; if (t < a || t > b) continue; const v = streams.speed[i], dt = Math.min(10, t - streams.t[i - 1]);
    if (v > 0.3 && v < 3 && dt > 0) out.push([dt, 100 / v]); }
  return out;
}
function zones(paces, css, mine) {
  const wrap = el('div', { className: 'swimzones' }, el('h3', { className: 'psub', textContent: 'Swim zones' }));
  if (!(css > 0)) { wrap.append(el('div', { className: 'note', textContent: mine ? 'Set your swim threshold (CSS) in Settings → Swimming to see time in each swim zone.' : 'No swim threshold set.' })); return wrap; }
  const tot = paces.reduce((p, x) => p + x[0], 0); if (!tot) return el('div');
  const secs = SZ.map(([, , lo, hi]) => paces.filter(([, p]) => p - css >= lo && p - css < hi).reduce((s, x) => s + x[0], 0));
  const bar = el('div', { className: 'szbar' });
  secs.forEach((s, i) => { if (s > 0) bar.append(el('i', { style: `width:${s / tot * 100}%;background:var(${SZ_COL[i]})`, title: `${SZ[i][0]} ${SZ[i][1]}: ${fmtDur(s)}` })); });
  const t = el('table', { className: 'laps sztbl' });
  SZ.forEach(([z, name, lo, hi], i) => { const r = t.insertRow();
    r.insertCell().append(el('span', { className: 'dot', style: `background:var(${SZ_COL[i]})` }), ` ${z} ${name}`);
    r.insertCell().textContent = lo === -Infinity ? `faster than ${fmtPace(css + hi)}` : hi === Infinity ? `slower than ${fmtPace(css + lo)}` : `${fmtPace(css + lo)}–${fmtPace(css + hi)}`;
    r.insertCell().textContent = fmtDur(secs[i]); r.insertCell().textContent = Math.round(secs[i] / tot * 100) + '%'; });
  wrap.append(bar, t, el('div', { className: 'note', textContent: `Paces per 100 m against your swim threshold (CSS) of ${fmtPace(css)} on the day. Rests aren't counted.` }));
  return wrap;
}
