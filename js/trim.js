// Trim an activity's start or end (e.g. forgot to stop the watch and drove home). Re-processes the original file, so totals, laps and bests are exact.
import { sb, state, toast, loadAll, enrich, writeProcessed, reprocess } from './main.js?v=1795542095';
import { decodeFit } from './fit.js?v=1795542095';
import { processFit, trimMessages, rows } from './process.js?v=1795542095';
import { openModal } from './edit.js?v=1795542095';
import * as U from './units.js?v=1795542095';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => e.append(k)); return e; };
const fmtDur = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const COL = { run: '--run', bike: '--bike', swim: '--swim', transition: '--trans' };

export function openTrim(data, onDone) {
  const { act, sections, streams } = data;
  if (!streams) { toast('This activity has no detailed data to trim.'); return; }
  const R = rows(streams), T = act.summary?.trim?.origElapsed || +act.elapsed_s, total = R.length ? R[R.length - 1].t : T;
  const driving = act.summary?.driving || [];
  openModal((body, close) => {
    body.append(el('h3', { textContent: 'Trim activity' }),
      el('div', { className: 'note', textContent: 'Drag the handles to cut time off the start or end. Distance, time, laps, bests and the map are recalculated from your original file, which is kept, so you can undo this later.' }));
    const W = 640, H = 170, m = { l: 34, r: 8, t: 10, b: 20 };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.classList.add('trimchart');
    const route = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); route.setAttribute('viewBox', '0 0 640 260'); route.classList.add('trimroute');
    const a0 = el('input', { type: 'range', min: 0, max: Math.round(total), step: 1, value: 0 }), a1 = el('input', { type: 'range', min: 0, max: Math.round(total), step: 1, value: Math.round(total) });
    const lab = el('div', { className: 'trimlab' });
    const sliders = el('div', { className: 'dual' }, a0, a1);
    const quick = el('div', { className: 'segrow' });
    driving.forEach(d => {
      const txt = d.atStart ? `Cut the drive at the start (${Math.round(U.kmhTo(d.maxKmh))} ${U.sU()})` : `Cut from ${fmtDur(d.t0)} (${Math.round(U.kmhTo(d.maxKmh))} ${U.sU()}${d.km ? `, ${U.dist(d.km * 1000)}` : ''})`;
      quick.append(el('button', { className: 'chip', type: 'button', textContent: txt, onclick: () => { if (d.atStart) a0.value = Math.min(total, d.t1 + 5); else a1.value = Math.max(0, d.t0 - 5); upd(); } }));
    });
    quick.append(el('button', { className: 'chip', type: 'button', textContent: 'Reset', onclick: () => { a0.value = 0; a1.value = Math.round(total); upd(); } }));
    const msg = el('div', { className: 'note' });
    const save = el('button', { className: 'btn primary', type: 'button', textContent: 'Trim' });
    const left = el('div', { style: 'display:flex;gap:8px' });
    if (act.summary?.trim) left.append(el('button', { className: 'btn', type: 'button', textContent: 'Restore original', onclick: () => run(null) }));
    body.append(route, svg, sliders, lab, quick, msg, el('div', { className: 'actions' }, left, el('div', { style: 'display:flex;gap:8px' }, el('button', { className: 'btn', type: 'button', textContent: 'Cancel', onclick: close }), save)));

    // draw speed trace and route once; selection overlays update
    const x = t => m.l + (W - m.l - m.r) * t / total;
    const sp = R.map(r => r.speed == null ? null : U.kmhTo(r.speed * 3.6)), maxS = Math.max(10, ...sp.filter(v => v != null));
    const y = v => H - m.b - (H - m.t - m.b) * v / maxS;
    const secOf = t => { for (let i = sections.length - 1; i >= 0; i--) if (t >= sections[i].start_offset_s - .5) return i; return 0; };
    const NS = 'http://www.w3.org/2000/svg', mk = (tag, at, parent) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); parent.append(e); return e; };
    driving.forEach(d => mk('rect', { x: x(d.t0), y: m.t, width: Math.max(2, x(d.t1) - x(d.t0)), height: H - m.t - m.b, fill: css('--warn'), opacity: .25 }, svg));
    let path = '', prevSec = -1;
    R.forEach((r, i) => { if (sp[i] == null) return; const s = secOf(r.t); if (s !== prevSec) { if (path) mk('path', { d: path, fill: 'none', stroke: css(COL[sections[prevSec].sport] || '--trans'), 'stroke-width': 1.5 }, svg); path = `M${x(r.t)},${y(sp[i])}`; prevSec = s; } else path += `L${x(r.t)},${y(sp[i])}`; });
    if (path) mk('path', { d: path, fill: 'none', stroke: css(COL[sections[prevSec].sport] || '--trans'), 'stroke-width': 1.5 }, svg);
    [0, Math.round(maxS / 2), Math.round(maxS)].forEach(v => mk('text', { x: m.l - 4, y: y(v) + 3, 'text-anchor': 'end', 'font-size': 10, fill: css('--text-muted') }, svg).textContent = v);
    mk('text', { x: m.l, y: H - 4, 'font-size': 10, fill: css('--text-muted') }, svg).textContent = `speed ${U.sU()} over time`;
    const shadeL = mk('rect', { x: m.l, y: m.t, height: H - m.t - m.b, fill: css('--bg'), opacity: .75 }, svg), shadeR = mk('rect', { y: m.t, height: H - m.t - m.b, fill: css('--bg'), opacity: .75 }, svg);
    const pts = R.filter(r => r.lat != null);
    let proj = null;
    if (pts.length > 1) {
      const lat0 = pts.reduce((p, q) => p + q.lat, 0) / pts.length * Math.PI / 180, X = p => p.lon * Math.cos(lat0), Y = p => -p.lat;
      const xs = pts.map(X), ys = pts.map(Y), [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const k = Math.min(600 / (x1 - x0 || 1e-6), 220 / (y1 - y0 || 1e-6)), ox = (640 - k * (x1 - x0)) / 2, oy = (260 - k * (y1 - y0)) / 2;
      proj = p => [ox + (X(p) - x0) * k, oy + (Y(p) - y0) * k];
      mk('rect', { width: 640, height: 260, rx: 8, fill: css('--surface-2') }, route);
    }
    const kept = mk('path', { fill: 'none', stroke: css('--accent'), 'stroke-width': 3, 'stroke-linejoin': 'round' }, route), cut = mk('path', { fill: 'none', stroke: css('--text-muted'), 'stroke-width': 2, 'stroke-dasharray': '3 4' }, route);
    function upd() {
      let s = +a0.value, e = +a1.value; if (s > e - 30) { if (document.activeElement === a0) a0.value = s = e - 30; else a1.value = e = s + 30; }
      shadeL.setAttribute('width', Math.max(0, x(s) - m.l)); shadeR.setAttribute('x', x(e)); shadeR.setAttribute('width', Math.max(0, W - m.r - x(e)));
      const inR = R.filter(r => r.t >= s && r.t <= e && r.dist != null), dist = inR.length ? inR[inR.length - 1].dist - inR[0].dist : 0;
      const orig = R.filter(r => r.dist != null), od = orig.length ? orig[orig.length - 1].dist - orig[0].dist : 0;
      lab.replaceChildren(el('span', {}, 'Keep ', el('b', { textContent: `${fmtDur(s)} → ${fmtDur(e)}` })), el('span', {}, ' · ', el('b', { textContent: U.dist(dist) }), ` in ${fmtDur(e - s)}`),
        el('span', { className: 'muted', textContent: ` (cutting ${U.dist(od - dist)}, ${fmtDur(total - (e - s))})` }));
      if (proj) { const line = arr => arr.map((p, i) => (i ? 'L' : 'M') + proj(p).join(',')).join('');
        kept.setAttribute('d', line(pts.filter(p => p.t >= s && p.t <= e))); cut.setAttribute('d', line(pts.filter(p => p.t < s)) + line(pts.filter(p => p.t > e))); }
      save.disabled = s <= 0 && e >= Math.round(total);
    }
    a0.oninput = a1.oninput = upd; upd();
    save.onclick = () => run([+a0.value, +a1.value]);

    async function run(win) {
      save.disabled = true; msg.textContent = win ? 'Trimming…' : 'Restoring…';
      try {
        const n = await reprocess({ act, sections }, { trim: win ? [win[0] + (act.summary?.trim?.from || 0), win[1] + (act.summary?.trim?.from || 0)] : 'none' });
        close(); toast(win ? `Trimmed to ${U.dist(n.distance_m)}` : 'Original restored'); onDone && onDone();
      } catch (e) { msg.textContent = 'Could not trim: ' + (e.message || e); save.disabled = false; }
    }
  });
}
