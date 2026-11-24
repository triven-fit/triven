// Training log: training status, suggested thresholds (FTP, threshold heart rate), threshold pace and race predictions.
import { sb, state, toast } from './main.js?v=1795533703';
import { thresholds, suggestions, predictionHistory, trainingStatus, RACES } from './perf.js?v=1795533703';
import { applyChange, dayKey, todayKey } from './athlete.js?v=1795533703';
import { DEFAULTS } from './defaults.js?v=1795533703';
import * as U from './units.js?v=1795533703';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const DAY = 864e5, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const now = new Date(), TODAY = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
const fmtT = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const pace = mps => `${U.mmss(U.paceMs(mps))} ${U.pU()}`;
const fmtD = t => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
let race = 'Half marathon', span = 365;

export function mountPerf(host, acts, cfg) {
  host.replaceChildren();
  if (!acts.length) return;
  const th = thresholds(acts, state.bests, cfg);
  const dismissed = cfg.dismissed || {};
  const sugg = suggestions(th, cfg).filter(s => dismissed[s.key] !== s.to);
  const grid = el('div', { className: 'perfgrid' });
  grid.append(statusCard(acts, cfg), thresholdCard(th, cfg));
  host.append(...sugg.map(s => suggestionBar(s, cfg)), grid, predictorCard());
}

function suggestionBar(s, cfg) {
  const bar = el('div', { className: 'suggest' });
  const use = el('button', { className: 'btn sm primary', type: 'button', textContent: `Use ${s.to} ${s.unit}` });
  const no = el('button', { className: 'btn sm', type: 'button', textContent: 'Not now' });
  bar.append(el('div', { style: 'flex:1;min-width:220px' },
    el('b', { textContent: s.from ? `New ${s.label.toLowerCase()} suggested: ${s.to} ${s.unit} (now ${s.from})` : `Set your ${s.label}: ${s.to} ${s.unit}` }),
    el('div', { className: 'muted', style: 'font-size:12px' }, s.why + ' ', s.activity_id ? el('a', { href: '#a/' + s.activity_id, textContent: 'See the activity' }) : null)), no, use);
  const save = async patch => { const settings = { ...(state.profile.settings || {}), ...patch };
    const r = await sb.from('profiles').update({ settings }).eq('id', state.user.id); if (r.error) { toast(r.error.message); return false; }
    state.profile.settings = settings; document.dispatchEvent(new Event('triven:settings')); return true; };
  // a higher threshold applies from the activity that showed it; anything else from today
  use.onclick = async () => {
    const src = !s.down && state.activities.find(a => a.id === s.activity_id), from = src ? dayKey(src.start_time, src.utc_offset_min) : todayKey();
    const settings = applyChange(Object.assign({}, DEFAULTS, state.profile.settings || {}), { [s.key]: s.to }, from);
    const r = await sb.from('profiles').update({ settings }).eq('id', state.user.id); if (r.error) { toast(r.error.message); return; }
    state.profile.settings = settings; document.dispatchEvent(new Event('triven:settings'));
    toast(`${s.label} set to ${s.to} ${s.unit} from ${src ? 'the day of that activity' : 'today'}. Earlier activities keep their old value.`); };
  no.onclick = async () => { await save({ dismissed: { ...(cfg.dismissed || {}), [s.key]: s.to } }); bar.remove(); };
  return bar;
}

function statusCard(acts, cfg) {
  const s = trainingStatus(acts, cfg, TODAY);
  const c = el('div', { className: 'card' }, el('h2', { textContent: 'Training status' }));
  c.append(el('div', { className: `tstatus ts-${s.key}` }, el('b', { textContent: s.label })), el('p', { className: 'sec', style: 'margin:4px 0 12px', textContent: s.note }));
  if (s.range) {
    // this week's load against the productive range
    const max = Math.max(s.range[1] * 1.35, s.acute * 1.05, 1), pct = v => Math.min(100, v / max * 100);
    const bar = el('div', { className: 'lbar' }, el('div', { className: 'lband', style: `left:${pct(s.range[0])}%;width:${pct(s.range[1]) - pct(s.range[0])}%` }), el('div', { className: 'lfill', style: `width:${pct(s.acute)}%` }));
    c.append(el('div', { className: 'gtop' }, el('span', { textContent: 'Load, last 7 days' }), el('b', { textContent: `${s.acute}` })), bar,
      el('div', { className: 'muted', style: 'font-size:12px;margin-top:4px', textContent: `Productive range for you: ${s.range[0]}–${s.range[1]} (0.8–1.3 × your usual week)` }));
    const kv = el('div', { className: 'ytdkv', style: 'margin-top:10px' },
      el('span', { textContent: 'This week vs usual' }), el('b', { textContent: `${s.acwr.toFixed(2)}×` }),
      el('span', { textContent: 'Fitness change, 7 days' }), el('b', { textContent: `${s.ramp > 0 ? '+' : ''}${s.ramp}` }),
      el('span', { textContent: 'Form' }), el('b', { textContent: `${s.form > 0 ? '+' : ''}${s.form}` }));
    c.append(kv);
  }
  c.append(el('details', { className: 'note', style: 'margin-top:10px' }, el('summary', { textContent: 'How the status is decided' }),
    el('p', { textContent: 'Detraining: no training for 10 days, or fitness down 20% in 4 weeks with light load. Overreaching: this week more than 1.5× your usual, or form below −30. Peaking: fresh (form above +5) with fitness within 15% of its 90-day high. Recovery: a light week (under 0.8×) and fresh. Productive: fitness rising more than 1 a week with load in range. Maintaining: fitness steady, load in range.' })));
  return c;
}

function thresholdCard(th, cfg) {
  const c = el('div', { className: 'card' }, el('h2', { textContent: 'Thresholds' }));
  const row = (label, val, sub) => el('div', { className: 'throw' }, el('span', { textContent: label }), el('div', {}, el('b', { textContent: val }), sub ? el('div', { className: 'muted', style: 'font-size:12px', textContent: sub }) : null));
  const r = th.run, b = th.bike;
  c.append(el('div', { className: 'sec wtitle', textContent: 'Running' }),
    row('Threshold HR', `${cfg.lthrRun} bpm set`, r.hr ? `Hardest 20 min, last 12 weeks: ${Math.round(r.hr.hr)} bpm at ${pace(r.hr.speed)}` : 'Needs a hard run of 25 minutes or more'),
    row('Threshold pace', r.pace ? pace(r.pace.speed) : '—', r.pace ? `Daniels T pace from your ${r.pace.vdot.effort} on ${fmtD(Date.parse(r.pace.vdot.achieved_at))}` : 'Needs a hard run of a mile or more'),
    el('div', { className: 'sec wtitle', textContent: 'Cycling' }),
    row('FTP', cfg.ftp ? `${cfg.ftp} W set` : 'not set', b.ftp ? `Power meter, last 6 weeks: ${b.ftp.watts} W (${b.ftp.from})` : 'Suggestions need rides with a power meter'),
    row('Threshold HR', `${cfg.lthrBike} bpm set`, b.hr ? `Hardest 20 min, last 12 weeks: ${Math.round(b.hr.hr)} bpm${b.hr.power ? ` at ${Math.round(b.hr.power)} W` : ''}` : 'Needs a hard ride of 25 minutes or more'));
  c.append(el('div', { className: 'note', textContent: 'Heart-rate thresholds are only ever suggested upwards: an easy few weeks doesn’t mean your threshold dropped. Set them from a lab or field test in Settings any time.' }));
  return c;
}

function predictorCard() {
  const c = el('div', { className: 'card', style: 'margin-top:16px' });
  const head = el('div', { className: 'calhead' }, el('h2', { textContent: 'Race predictor' }));
  const spans = el('div', { className: 'segrow', style: 'margin:0' });
  [[182, '6 months'], [365, '1 year'], [730, '2 years']].forEach(([d, t]) => { const b = el('button', { className: 'chip', type: 'button', textContent: t }); b.setAttribute('aria-pressed', d === span); b.onclick = () => { span = d; c.replaceWith(predictorCard()); }; spans.append(b); });
  head.append(spans); c.append(head);
  const H = predictionHistory(state.bests, TODAY - span * DAY, TODAY);
  const cur = H.at(-1);
  if (!cur?.times) { c.append(el('div', { className: 'note', textContent: 'Predictions need a hard run of a mile or more in the last 12 weeks (a race, parkrun or time trial is ideal).' })); return c; }
  const tbl = el('div', { className: 'preds' });
  RACES.forEach(([n, d]) => { const t = cur.times[n]; const b = el('button', { type: 'button', className: 'pred' }, el('small', { textContent: n }), el('b', { textContent: fmtT(t) }), el('span', { className: 'muted', textContent: pace(d / t) }));
    b.setAttribute('aria-pressed', n === race); b.onclick = () => { race = n; c.replaceWith(predictorCard()); }; tbl.append(b); });
  c.append(tbl, el('div', { className: 'muted', style: 'font-size:12px;margin:6px 0 2px', textContent: `Based on your ${cur.from.effort} in ${fmtT(cur.from.time)} on ${fmtD(Date.parse(cur.from.achieved_at))}. Marathon predictions assume marathon training: long runs and enough weekly volume.` }));
  c.append(chart(H));
  return c;
}

// predicted time for the chosen race, week by week (lower is faster)
function chart(H) {
  const d3 = window.d3, host = el('div', { className: 'predchart' });
  requestAnimationFrame(() => {
    const W = Math.max(300, host.clientWidth), Ht = 200, m = { l: 56, r: 16, t: 12, b: 24 };
    const pts = H.filter(p => p.times).map(p => ({ t: p.t, v: p.times[race], from: p.from }));
    if (pts.length < 2) { host.append(el('div', { className: 'note', textContent: 'The chart fills in as you add more hard efforts.' })); return; }
    const x = d3.scaleTime().domain([H[0].t, H.at(-1).t]).range([m.l, W - m.r]);
    const lo = d3.min(pts, p => p.v), hi = d3.max(pts, p => p.v), pad = Math.max(30, (hi - lo) * 0.15);
    const y = d3.scaleLinear().domain([lo - pad, hi + pad]).range([Ht - m.b, m.t]);   // more time = higher
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${Ht}`).attr('width', '100%').attr('role', 'img').attr('aria-label', `Predicted ${race} time over time`);
    const muted = css('--text-muted'), grid = css('--grid'), acc = css('--accent');
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(fmtT)).call(g => { g.select('.domain').remove(); g.selectAll('line').attr('stroke', grid); g.selectAll('text').attr('fill', muted).attr('font-size', 10); });
    svg.append('g').attr('transform', `translate(0,${Ht - m.b + 4})`).call(d3.axisBottom(x).ticks(Math.min(8, Math.floor(W / 100))).tickSize(0).tickFormat(t => { const d = new Date(t); return `${MON[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`; }))
      .call(g => { g.select('.domain').remove(); g.selectAll('text').attr('fill', muted).attr('font-size', 10).attr('dy', 10); });
    // break the line where there was no recent hard effort
    const line = d3.line().defined(p => p.times).x(p => x(p.t)).y(p => y(p.times[race])).curve(d3.curveStepAfter);
    svg.append('path').datum(H).attr('fill', 'none').attr('stroke', acc).attr('stroke-width', 2).attr('d', line);
    const lp = pts.at(-1); svg.append('circle').attr('cx', x(lp.t)).attr('cy', y(lp.v)).attr('r', 4).attr('fill', acc).attr('stroke', css('--surface-1')).attr('stroke-width', 2);
    svg.append('text').attr('x', m.l).attr('y', m.t - 2).attr('font-size', 10).attr('fill', muted).text('lower is faster');
    // hover
    const tip = el('div', { className: 'pmctip', hidden: true }); host.style.position = 'relative'; host.append(tip);
    const dot = svg.append('circle').attr('r', 4).attr('fill', acc).attr('opacity', 0);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', Ht - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', ev => { const [px] = d3.pointer(ev, svg.node()); const t = x.invert(px); let best = H[0]; for (const p of H) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
        if (!best.times) { tip.hidden = true; dot.attr('opacity', 0); return; }
        dot.attr('cx', x(best.t)).attr('cy', y(best.times[race])).attr('opacity', 1);
        tip.replaceChildren(el('b', { textContent: `Week of ${fmtD(best.t)}` }), el('div', { textContent: `${race}: ${fmtT(best.times[race])}` }), el('div', { className: 'muted', textContent: `from ${best.from.effort} ${fmtT(best.from.time)}, ${fmtD(Date.parse(best.from.achieved_at))}` }));
        tip.hidden = false; const sc = host.clientWidth / W, left = x(best.t) * sc; tip.style.left = (left > host.clientWidth - 200 ? left - 196 : left + 12) + 'px'; tip.style.top = '8px'; })
      .on('mouseleave', () => { tip.hidden = true; dot.attr('opacity', 0); });
  });
  return host;
}
