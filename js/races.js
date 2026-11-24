// Race calendar: your A/B/C races (settings.races), a countdown, a race-day form forecast with a taper suggestion,
// and, once raced, the result activity against your goal.
//
// Forecast: the fitness/fatigue model (load.js) run forward from today. "As you are" repeats your average daily load of the
// last 4 weeks. The taper suggestion is the smallest cut to that load over the final days (10 for an A race, 5 for a B)
// that brings race-day form into the Fresh band (+5 or more). C races aren't tapered for.
import { sb, state, toast, raceFlag } from './main.js?v=1795526551';
import { openModal } from './edit.js?v=1795526551';
import { pmc, formBand } from './load.js?v=1795526551';
import { DEFAULTS } from './settings.js?v=1795526551';
import * as U from './units.js?v=1795526551';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const DAY = 864e5, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const parseDur = v => { const p = String(v || '').trim().split(':').map(Number); if (!p.length || p.some(x => Number.isNaN(x))) return null; return p.reduce((a, x) => a * 60 + x, 0) || null; };
export const KINDS = [['triathlon', 'Triathlon'], ['duathlon', 'Duathlon'], ['aquathlon', 'Aquathlon'], ['aquabike', 'Aquabike'], ['run', 'Run'], ['ride', 'Ride'], ['swim', 'Swim'], ['other', 'Other']];
const KIND = Object.fromEntries(KINDS);
const PRI = { A: 'A race: the one that matters', B: 'B race: important, short taper', C: 'C race: training race, no taper' };
const now = new Date(), TODAY = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
const dayMs = iso => Date.parse(iso + 'T00:00:00Z');
const fmtDay = iso => { const d = new Date(dayMs(iso)); return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const races = () => (state.profile?.settings?.races || []).slice();
const cfgNow = () => Object.assign({}, DEFAULTS, state.profile?.settings || {});
const localDay = a => new Date(Date.parse(a.start_time) + (a.utc_offset_min || 0) * 60000).toISOString().slice(0, 10);

// ---------- forecast ----------
// series to today, then forward with daily load `load(dayIndexFromToday)` until race day; returns race-day form
function forecast(series, days, load) {
  let { ctl, atl } = series[series.length - 1] || { ctl: 0, atl: 0 }; let form = ctl - atl;
  for (let i = 1; i <= days; i++) { form = ctl - atl; const L = load(i); ctl += (L - ctl) / 42; atl += (L - atl) / 7; }
  return { form, ctl };
}
export function raceForecast(race) {
  const days = Math.round((dayMs(race.date) - TODAY) / DAY); if (days < 1) return null;
  const series = pmc(state.activities, cfgNow(), TODAY); if (!series.length) return null;
  const avg = series.slice(-28).reduce((p, x) => p + x.load, 0) / 28;
  const keep = forecast(series, days, () => avg);
  const win = race.pri === 'A' ? 10 : race.pri === 'B' ? 5 : 0;
  let taper = null;
  if (win && keep.form < 5) {
    const w = Math.min(win, days - 1);
    for (let cut = 0.1; cut <= 0.9001; cut += 0.05) { const f = forecast(series, days, i => i > days - w - 1 ? avg * (1 - cut) : avg); if (f.form >= 5) { taper = { cut: Math.round(cut * 100), days: w, form: f.form }; break; } }
    if (!taper && w > 0) taper = { cut: null, days: w };
  }
  return { days, avg, keep, taper, win };
}

// ---------- pages ----------
export function mountRaces(host) {
  host.replaceChildren();
  const all = races(), up = all.filter(r => dayMs(r.date) >= TODAY).sort((a, b) => a.date.localeCompare(b.date)), past = all.filter(r => dayMs(r.date) < TODAY).sort((a, b) => b.date.localeCompare(a.date));
  const card = el('div', { className: 'card' }, el('div', { className: 'racehead' }, el('h2', { textContent: 'Upcoming races' }),
    el('button', { className: 'btn sm primary', type: 'button', textContent: 'Add a race', onclick: () => editRace({}, () => mountRaces(host)) })));
  if (!up.length) card.append(el('div', { className: 'note', textContent: 'No races coming up. Add your season’s races to get a countdown and a race-day form forecast.' }));
  up.forEach(r => card.append(raceRow(r, host, true)));
  host.append(card);
  if (past.length) { const pc = el('div', { className: 'card', style: 'margin-top:16px' }, el('h2', { textContent: 'Past races' })); past.forEach(r => pc.append(raceRow(r, host, false))); host.append(pc); }
}
function raceRow(r, host, upcoming) {
  const row = el('div', { className: 'racerow' });
  const days = Math.round((dayMs(r.date) - TODAY) / DAY);
  const head = el('div', { className: 'racetop' }, el('span', { className: 'pri p' + r.pri, title: PRI[r.pri], textContent: r.pri }),
    el('div', { style: 'flex:1;min-width:0' }, el('b', { textContent: r.name }), el('div', { className: 'muted', textContent: [fmtDay(r.date), [r.dist, KIND[r.kind]].filter(Boolean).join(' '), r.goal ? 'goal ' + fmtDur(r.goal) : null].filter(Boolean).join(' · ') })),
    upcoming ? el('div', { className: 'countdown' }, el('b', { textContent: days === 0 ? 'Today' : days }), days ? el('small', { textContent: days === 1 ? 'day to go' : 'days to go' }) : null) : null,
    el('button', { className: 'linkbtn', type: 'button', textContent: 'Edit', onclick: () => editRace(r, () => mountRaces(host)) }));
  row.append(head);
  if (upcoming && days > 0) {
    const f = raceForecast(r);
    if (f) { const b = formBand(f.keep.form);
      const lines = [el('div', {}, 'Race-day form if you keep training as you are (about ', el('b', { textContent: Math.round(f.avg) }), ' load a day): ', el('b', { textContent: `${f.keep.form >= 0 ? '+' : ''}${Math.round(f.keep.form)} · ${b.label}` }))];
      if (r.pri === 'C') lines.push(el('div', { className: 'muted', textContent: 'C race: train through it, no taper.' }));
      else if (f.keep.form >= 5) lines.push(el('div', { className: 'muted', textContent: 'You’d arrive fresh already. Keep the last few days easy.' }));
      else if (f.taper?.cut) lines.push(el('div', {}, 'To arrive fresh (form +5 or more): cut training by about ', el('b', { textContent: f.taper.cut + '%' }), ` in the last ${f.taper.days} days.`));
      else if (f.taper) lines.push(el('div', { className: 'muted', textContent: `Too close to taper fully: keep the remaining ${days} days easy.` }));
      row.append(el('div', { className: 'raceforecast' }, ...lines)); }
  }
  if (!upcoming) {
    const a = r.activity_id && state.activities.find(x => x.id === r.activity_id);
    if (a) { const t = a.sport === 'multi' ? +a.elapsed_s : +(a.moving_s || a.elapsed_s);
      row.append(el('div', { className: 'raceforecast' }, el('div', {}, 'Result: ', el('a', { href: '#a/' + a.id, textContent: a.name }), ' · ', el('b', { textContent: fmtDur(t) }), a.distance_m ? ` · ${U.dist(a.distance_m)}` : '',
        r.goal ? el('span', { className: t <= r.goal ? 'good' : 'muted', textContent: ` · ${t <= r.goal ? 'goal beaten by ' + fmtDur(r.goal - t) : fmtDur(t - r.goal) + ' over goal'}` }) : null))); }
    else { const cands = state.activities.filter(x => localDay(x) === r.date).sort((x, y) => (+y.is_race - +x.is_race) || (+y.elapsed_s - +x.elapsed_s));
      if (cands.length) { const sel = el('select', { className: 'msel' }, ...cands.map(x => el('option', { value: x.id, textContent: `${x.name}${x.is_race ? ' (race)' : ''}` })));
        row.append(el('div', { className: 'raceforecast' }, el('div', {}, 'Link your result: ', sel, ' ', el('button', { className: 'btn sm', type: 'button', textContent: 'Link', onclick: () => saveRace({ ...r, activity_id: sel.value }, () => mountRaces(host)) })))); }
      else row.append(el('div', { className: 'raceforecast muted', textContent: 'No activity on that day to link as the result.' })); }
  }
  return row;
}

function editRace(r, done) {
  openModal((body, close) => {
    const isNew = !r.id;
    body.append(el('h3', { textContent: isNew ? 'Add a race' : 'Edit race' }));
    const f = {
      name: el('input', { value: r.name || '', placeholder: 'e.g. Doha Sprint Triathlon' }),
      date: el('input', { type: 'date', value: r.date || '' }),
      kind: el('select', {}, ...KINDS.map(([v, t]) => el('option', { value: v, textContent: t, selected: (r.kind || 'triathlon') === v }))),
      dist: el('input', { value: r.dist || '', placeholder: 'e.g. Sprint, 70.3, Half marathon' }),
      pri: el('select', {}, ...['A', 'B', 'C'].map(v => el('option', { value: v, textContent: PRI[v], selected: (r.pri || 'A') === v }))),
      goal: el('input', { value: r.goal ? fmtDur(r.goal) : '', placeholder: 'optional, e.g. 1:15:00' }),
    };
    body.append(el('div', { className: 'frow' }, el('label', { className: 'f' }, 'Race', f.name), el('label', { className: 'f' }, 'Date', f.date), el('label', { className: 'f' }, 'Type', f.kind),
      el('label', { className: 'f' }, 'Distance', f.dist), el('label', { className: 'f' }, 'Priority', f.pri), el('label', { className: 'f' }, 'Goal time', f.goal)));
    const msg = el('div', { className: 'note' }), left = el('div');
    if (!isNew) left.append(el('button', { className: 'btn', type: 'button', textContent: 'Delete', onclick: () => saveRace({ ...r, _delete: true }, () => { close(); done(); }) }));
    const save = el('button', { className: 'btn primary', type: 'button', textContent: 'Save' });
    body.append(msg, el('div', { className: 'actions' }, left, el('div', { style: 'display:flex;gap:8px' }, el('button', { className: 'btn', type: 'button', textContent: 'Cancel', onclick: close }), save)));
    save.onclick = () => {
      if (!f.name.value.trim() || !f.date.value) { msg.textContent = 'Give the race a name and a date.'; return; }
      const g = f.goal.value.trim() ? parseDur(f.goal.value) : null; if (f.goal.value.trim() && !g) { msg.textContent = 'Goal time like 1:15:00.'; return; }
      return saveRace({ ...r, id: r.id || crypto.randomUUID(), name: f.name.value.trim(), date: f.date.value, kind: f.kind.value, dist: f.dist.value.trim() || null, pri: f.pri.value, goal: g }, () => { close(); done(); });
    };
    f.name.focus();
  });
}
async function saveRace(r, done) {
  const list = races().filter(x => x.id !== r.id); if (!r._delete) list.push(r);
  const settings = { ...(state.profile.settings || {}), races: list.sort((a, b) => a.date.localeCompare(b.date)) };
  const res = await sb.from('profiles').update({ settings }).eq('id', state.user.id);
  if (res.error) { toast(res.error.message); return; }
  state.profile.settings = settings; toast(r._delete ? 'Race removed' : 'Race saved'); done && done();
}

// next race, for the feed sidebar
export function nextRaceCard() {
  const r = races().filter(x => dayMs(x.date) >= TODAY).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!r) return null;
  const days = Math.round((dayMs(r.date) - TODAY) / DAY), f = raceForecast(r);
  return el('a', { className: 'card sidecard nextrace', href: '#log/races' },
    el('div', { className: 'racetop' }, el('span', { className: 'pri p' + r.pri, textContent: r.pri }), el('div', { style: 'flex:1;min-width:0' }, el('b', { textContent: r.name }), el('div', { className: 'muted', textContent: fmtDay(r.date) })),
      el('div', { className: 'countdown' }, el('b', { textContent: days || 'Today' }), days ? el('small', { textContent: days === 1 ? 'day' : 'days' }) : null)),
    f && r.pri !== 'C' ? el('div', { className: 'muted', style: 'font-size:12px;margin-top:6px', textContent: f.keep.form >= 5 ? 'On course to arrive fresh.' : f.taper?.cut ? `Taper: cut about ${f.taper.cut}% in the last ${f.taper.days} days to arrive fresh.` : 'Keep the remaining days easy.' } ) : null);
}
