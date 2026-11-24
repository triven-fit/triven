// Owner dashboard (#admin): sign-ups, active users, visits, uploads, what's being recorded, and feedback triage.
// Everything comes from admin_stats(days) (019), which refuses anyone who isn't in the admins table.
import { sb, toast } from './main.js?v=1795526551';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const nf = n => (n ?? 0).toLocaleString();
const dfmt = d => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
let days = 30, data = null, fbFilter = 'open';

// --- charts: one axis, thin bars with a 2px gap, recessive grid, legend for 2+ series, hover tooltip on every bar
function chart(rows, series, { type = 'bar', height = 190 } = {}) {
  const W = 640, H = height, pl = 34, pr = 8, pt = 10, pb = 22, iw = W - pl - pr, ih = H - pt - pb;
  const tot = r => series.reduce((a, s) => a + (r[s.key] || 0), 0);
  const max = Math.max(1, ...rows.map(r => type === 'line' ? Math.max(...series.map(s => r[s.key] || 0)) : tot(r)));
  const step = Math.pow(10, Math.floor(Math.log10(max))), nice = Math.ceil(max / step) * step, ticks = [0, nice / 2, nice];
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'adchart', role: 'img' });
  ticks.forEach(t => { const y = pt + ih - t / nice * ih; svg.append(sv('line', { x1: pl, x2: W - pr, y1: y, y2: y, class: 'adgrid' }));
    const l = sv('text', { x: pl - 6, y: y + 3, 'text-anchor': 'end', class: 'adtick' }); l.textContent = nf(Math.round(t)); svg.append(l); });
  const bw = iw / rows.length, x = i => pl + i * bw;
  [0, Math.floor(rows.length / 2), rows.length - 1].forEach(i => { if (!rows[i]) return; const l = sv('text', { x: x(i) + bw / 2, y: H - 6, 'text-anchor': i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle', class: 'adtick' }); l.textContent = rows[i].label; svg.append(l); });
  if (type === 'line') series.forEach(s => {
    const pts = rows.map((r, i) => `${x(i) + bw / 2},${pt + ih - (r[s.key] || 0) / nice * ih}`).join(' ');
    svg.append(sv('polyline', { points: pts, fill: 'none', stroke: `var(${s.color})`, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  });
  else rows.forEach((r, i) => { let y0 = pt + ih; series.forEach(s => { const v = r[s.key] || 0; if (!v) return; const h = v / nice * ih;
    svg.append(sv('rect', { x: x(i) + Math.min(1, bw * .15), y: y0 - h + (y0 < pt + ih ? 1 : 0), width: Math.max(1, bw - Math.min(2, bw * .3)), height: Math.max(0, h - (y0 < pt + ih ? 2 : 0)), rx: Math.min(2, bw / 4), fill: `var(${s.color})` })); y0 -= h; }); });
  const tip = el('div', { className: 'adtip', hidden: true }), hov = sv('rect', { class: 'adhov', y: pt, height: ih, width: bw, x: 0, visibility: 'hidden' }); svg.prepend(hov);
  svg.addEventListener('pointermove', e => {
    const b = svg.getBoundingClientRect(), i = Math.max(0, Math.min(rows.length - 1, Math.floor(((e.clientX - b.left) / b.width * W - pl) / bw))), r = rows[i];
    hov.setAttribute('x', x(i)); hov.setAttribute('visibility', 'visible');
    tip.replaceChildren(el('b', { textContent: r.label }), ...series.map(s => el('div', {}, el('i', { style: `background:var(${s.color})` }), `${s.label} `, el('b', { textContent: nf(r[s.key] || 0) }))));
    tip.hidden = false; const px = (x(i) + bw / 2) / W * b.width; tip.style.left = Math.min(b.width - 150, Math.max(0, px - 75)) + 'px';
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; hov.setAttribute('visibility', 'hidden'); });
  const legend = series.length > 1 ? el('div', { className: 'adlegend' }, ...series.map(s => el('span', {}, el('i', { style: `background:var(${s.color})` }), s.label))) : null;
  return el('div', { className: 'adplot' }, legend, svg, tip);
}
// daily rows, or weekly sums beyond four months so bars stay readable
function bucket(daily, pick) {
  const rows = daily.map(d => ({ day: d.day, ...pick(d) }));
  if (rows.length <= 120) return rows.map(r => ({ ...r, label: dfmt(r.day) }));
  const out = [];
  for (let i = 0; i < rows.length; i += 7) { const w = rows.slice(i, i + 7), o = { label: 'w/c ' + dfmt(w[0].day) }; for (const k in w[0]) if (k !== 'day') o[k] = w.reduce((a, r) => a + (r[k] || 0), 0); out.push(o); }
  return out;
}
const card = (title, sub, ...kids) => el('div', { className: 'card adcard' }, el('h3', { textContent: title }), sub ? el('div', { className: 'note', textContent: sub }) : null, ...kids);
const tile = (label, value, sub) => el('div', { className: 'adtile' }, el('div', { className: 'adtl', textContent: label }), el('div', { className: 'adtv', textContent: value }), sub ? el('div', { className: 'adts', textContent: sub }) : null);

function csv() {
  const cols = ['day', 'signups', 'active', 'uploads', 'synced', 'manual', 'landing', 'app', 'help', 'videos', 'other_pages'];
  const lines = [cols.join(',')].concat(data.daily.map(d => { const v = d.views || {}; const other = Object.entries(v).filter(([k]) => !['landing', 'app', 'help', 'videos'].includes(k)).reduce((a, [, n]) => a + n, 0);
    return [d.day, d.signups, d.active, d.uploads, d.synced, d.manual, v.landing || 0, v.app || 0, v.help || 0, v.videos || 0, other].join(','); }));
  const a = el('a', { href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })), download: `triven-stats-${data.from}-to-${data.to}.csv` }); document.body.append(a); a.click(); a.remove();
}

function feedbackCard() {
  const list = el('div', { className: 'adfb' });
  const chips = el('div', { className: 'segrow' });
  const paint = () => {
    chips.replaceChildren(...[['open', 'Open'], ['feature', 'Suggestions'], ['problem', 'Problems'], ['all', 'All']].map(([k, t]) =>
      el('button', { type: 'button', className: 'chip', textContent: t, ariaPressed: String(fbFilter === k), onclick: () => { fbFilter = k; paint(); } })));
    const rows = data.feedback.filter(f => fbFilter === 'all' || (fbFilter === 'open' ? ['new', 'seen', 'planned'].includes(f.status) : f.kind === fbFilter));
    list.replaceChildren(...(rows.length ? rows.map(f => {
      const st = el('select', {}, ...[['new', 'New'], ['seen', 'Seen'], ['planned', 'Planned'], ['done', 'Done'], ['wontfix', 'Not planned']].map(([v, t]) => el('option', { value: v, textContent: t, selected: v === f.status })));
      const note = el('input', { type: 'text', value: f.admin_note || '', placeholder: 'Reply (the sender sees this)' });
      const save = el('button', { className: 'btn sm', type: 'button', textContent: 'Save', onclick: async () => {
        const { error } = await sb.from('feedback').update({ status: st.value, admin_note: note.value.trim() || null }).eq('id', f.id);
        if (error) { toast(error.message); return; } f.status = st.value; f.admin_note = note.value.trim() || null; toast('Saved'); paint(); } });
      return el('div', { className: 'adfbrow' + (f.status === 'new' ? ' new' : '') },
        el('div', { className: 'adfbhead' }, el('span', { className: 'adkind ' + f.kind, textContent: f.kind === 'feature' ? 'Suggestion' : 'Problem' }),
          el('span', { className: 'muted', textContent: `${f.name || 'Someone'}${f.handle ? ' (@' + f.handle + ')' : ''} · ${new Date(f.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` })),
        el('div', { className: 'adfbbody', textContent: f.body }),
        f.kind === 'problem' ? el('div', { className: 'note', textContent: [f.page && 'Page ' + f.page, f.app_build && 'build ' + f.app_build, f.screen, f.user_agent].filter(Boolean).join(' · ') }) : null,
        el('div', { className: 'adfbact' }, st, note, save));
    }) : [el('div', { className: 'note', textContent: 'Nothing here.' })]));
  };
  paint();
  return card('Feedback', 'Suggestions and problem reports from members. Changing the status notifies the sender.', chips, list);
}

export async function mountAdmin(host) {
  host.replaceChildren(el('div', { className: 'note', style: 'padding:30px', textContent: 'Loading the dashboard…' }));
  const { data: d, error } = await sb.rpc('admin_stats', { days });
  if (error || !d) { host.replaceChildren(el('div', { className: 'card' }, el('h2', { textContent: 'Dashboard' }), el('p', { className: 'note', textContent: 'This page is only for the site owner.' }))); return; }
  data = d; const T = d.totals, daily = d.daily;
  const sum = k => daily.reduce((a, r) => a + (r[k] || 0), 0);
  const pages = ['landing', 'app', 'help'], views = r => { const v = r.views || {}; const o = { landing: v.landing || 0, app: v.app || 0, help: v.help || 0, other: 0 }; for (const k in v) if (!pages.includes(k)) o.other += v[k]; return o; };
  let running = T.users - daily.reduce((a, r) => a + r.signups, 0);
  const cum = daily.map(r => ({ day: r.day, users: (running += r.signups) }));
  const head = el('div', { className: 'adhead' }, el('h2', { textContent: 'Dashboard' }),
    el('div', { className: 'segrow' }, ...[[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, 'Year']].map(([n, t]) =>
      el('button', { type: 'button', className: 'chip', textContent: t, ariaPressed: String(days === n), onclick: () => { days = n; mountAdmin(host); } })),
      el('button', { type: 'button', className: 'btn sm', textContent: 'Download CSV', onclick: csv })));
  const tiles = el('div', { className: 'adtiles' },
    tile('Members', nf(T.users), `+${nf(T.users_new)} in ${days} days`),
    tile('Active today', nf(T.active_1), `${nf(T.active_7)} this week · ${nf(T.active_30)} this month`),
    tile('Activities', nf(T.activities), `+${nf(T.activities_new)} in ${days} days`),
    tile('Visitors', nf(T.visitors), `over ${days} days, all pages`),
    tile('Using auto-sync', nf(T.synced_users), T.users ? Math.round(T.synced_users / T.users * 100) + '% of members' : ''),
    tile('Multisport activities', nf(T.multisport), T.activities ? (T.multisport / T.activities * 100).toFixed(1) + '% of all' : ''),
    tile('Social', `${nf(T.follows)} follows`, `${nf(T.clubs)} clubs · ${nf(T.relays)} relays · ${nf(T.kudos)} kudos · ${nf(T.comments)} comments`),
    tile('Feedback', `${nf(T.feedback_new)} new`, `${nf(T.feedback_open)} open`));
  const sp = d.sports || {}, spRows = Object.entries(sp).sort((a, b) => b[1] - a[1]), spMax = Math.max(1, ...spRows.map(r => r[1]));
  const SPN = { run: 'Run', bike: 'Ride', swim: 'Swim', multi: 'Multisport', other: 'Other' };
  const sports = card('Activities by sport', `Median ${nf(Math.round(d.per_user?.median || 0))} activities per member, most ${nf(d.per_user?.max || 0)}.`,
    el('div', { className: 'adbars' }, ...spRows.map(([k, n]) => el('div', { className: 'adbar' }, el('span', { textContent: SPN[k] || k }), el('div', {}, el('i', { style: `width:${n / spMax * 100}%` })), el('b', { textContent: nf(n) })))),
    Object.keys(d.profiles || {}).length ? el('div', { className: 'note', style: 'margin-top:8px', textContent: 'Multisport: ' + Object.entries(d.profiles).map(([k, n]) => `${k || 'other'} ${nf(n)}`).join(' · ') }) : null);
  const devices = card('Devices', 'Which watches and computers activities come from.',
    el('table', { className: 'adtbl' }, el('tbody', {}, ...d.devices.map(x => el('tr', {}, el('td', { textContent: x.device }), el('td', { className: 'num', textContent: nf(x.n) }))))));
  const recent = card('Newest members', 'The 50 most recent sign-ups.', el('div', { className: 'adscroll' }, el('table', { className: 'adtbl' },
    el('thead', {}, el('tr', {}, ...['Name', 'Email', 'Joined', 'Activities', 'Last seen', 'Sync'].map(t => el('th', { textContent: t })))),
    el('tbody', {}, ...d.recent.map(u => el('tr', {}, el('td', {}, u.handle ? el('a', { href: '#u/' + u.handle, textContent: u.name || u.handle }) : (u.name || '—')), el('td', { textContent: u.email || '' }),
      el('td', { textContent: new Date(u.joined).toLocaleDateString() }), el('td', { className: 'num', textContent: nf(u.activities) }),
      el('td', { textContent: u.last_seen ? dfmt(u.last_seen) : '—' }), el('td', { textContent: u.synced ? 'Yes' : '' })))))));
  host.replaceChildren(head, tiles,
    el('div', { className: 'adgrid2' },
      card('New members', `${nf(sum('signups'))} in this period`, chart(bucket(daily, r => ({ n: r.signups })), [{ key: 'n', label: 'Sign-ups', color: '--s1' }])),
      card('Total members', null, chart(bucket(cum, r => ({ n: r.users })).map((r, i, a) => r), [{ key: 'n', label: 'Members', color: '--s1' }], { type: 'line' })),
      card('Daily active members', 'Members who opened the app that day.', chart(bucket(daily, r => ({ n: r.active })), [{ key: 'n', label: 'Active', color: '--s1' }])),
      card('Activities added', `${nf(sum('uploads') + sum('synced') + sum('manual'))} in this period`,
        chart(bucket(daily, r => ({ up: r.uploads, sy: r.synced, ma: r.manual })), [{ key: 'up', label: 'Uploaded', color: '--s1' }, { key: 'sy', label: 'Synced', color: '--s2' }, { key: 'ma', label: 'Logged by hand', color: '--s3' }])),
      card('Visitors', 'Each browser counts once a day per page.', chart(bucket(daily, views), [{ key: 'landing', label: 'Home page', color: '--s1' }, { key: 'app', label: 'App (signed in)', color: '--s2' }, { key: 'help', label: 'Help', color: '--s3' }, { key: 'other', label: 'Other pages', color: '--s4' }])),
      sports),
    feedbackCard(),
    el('div', { className: 'adgrid2' }, recent, devices),
    el('p', { className: 'note', style: 'margin:14px 2px', textContent: `Figures for ${dfmt(d.from)} to ${dfmt(d.to)} (UTC). Uploads count files added by hand, including history imports; synced means arrived through intervals.icu.` }));
}

// once a day per browser: count the visit, and mark the member active
export function countVisit(page, signedIn) {
  const day = new Date().toISOString().slice(0, 10), key = `triven.seen.${page}`;
  try { if (localStorage.getItem(key) === day) return; localStorage.setItem(key, day); } catch { /* storage blocked: count anyway */ }
  sb.rpc('count_view', { p_page: page }).then(() => {}, () => {});
  if (signedIn) sb.rpc('touch_day').then(() => {}, () => {});
}
