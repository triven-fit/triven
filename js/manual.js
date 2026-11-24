// Log an activity without a file: treadmill, indoor bike, a gym session, or a multisport brick done on machines.
import { sb, state, toast, refreshActs, pickGear, raceFlag } from './main.js?v=1795533221';
import { ENVS, INDOOR, envLabel, multisportProfile } from './process.js?v=1795533221';
import * as U from './units.js?v=1795533221';
const dayOfAct = (start, off) => new Date(start.getTime() + (off || 0) * 60000).toISOString().slice(0, 10);   // local date, for gear in use that day

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const SPN = { run: 'Run', bike: 'Bike', swim: 'Swim', transition: 'Transition' };
const DEF_ENV = { run: 'treadmill', bike: 'indoor', swim: 'pool' };
// "45", "45:30", "1:05:30" -> seconds
const parseDur = v => { const p = String(v || '').trim().split(':').map(Number); if (!p.length || p.some(x => !Number.isFinite(x))) return 0; return p.reduce((a, x) => a * 60 + x, 0) * (p.length === 1 ? 60 : 1); };

export function mountManual(host) {
  host.replaceChildren();
  const card = el('div', { className: 'card', style: 'margin-top:16px' }, el('h2', { textContent: 'Log without a file' }),
    el('p', { className: 'sec', style: 'margin-top:0', textContent: 'For a treadmill run, an indoor ride or anything your watch didn’t record. Multisport bricks stay as one activity.' }));
  let kind = 'run';
  const kinds = el('div', { className: 'segrow' });
  const legsBox = el('div', { className: 'mlegs' });
  const legs = [];
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const date = el('input', { type: 'date', value: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` });
  const time = el('input', { type: 'time', value: `${pad(now.getHours())}:00` });
  const name = el('input', { type: 'text', placeholder: 'Name (optional)', maxLength: 120 });
  const desc = el('textarea', { rows: 2, placeholder: 'Description (optional)' });
  const msg = el('div', { className: 'note' });
  const race = el('input', { type: 'checkbox' });

  const legRow = (sport, env) => {
    const sp = el('select'); ['swim', 'bike', 'run', 'transition'].forEach(v => sp.append(el('option', { value: v, textContent: SPN[v], selected: v === sport })));
    const ty = el('select');
    const dur = el('input', { type: 'text', inputMode: 'numeric', placeholder: 'h:mm:ss', style: 'width:100px' });
    const dist = el('input', { type: 'number', min: 0, step: 'any', style: 'width:100px' });
    const unit = el('span', { className: 'muted' });
    const hr = el('input', { type: 'number', min: 40, max: 230, placeholder: 'avg HR', style: 'width:84px' });
    const asc = el('input', { type: 'number', min: 0, placeholder: 'climb ' + U.eU(), style: 'width:84px' });
    const rm = el('button', { className: 'linkbtn', type: 'button', textContent: 'Remove', style: 'color:var(--text-muted)' });
    const row = el('div', { className: 'mleg' });
    const refresh = () => {
      const s = sp.value; ty.replaceChildren(); ty.hidden = !ENVS[s];
      (ENVS[s] || []).forEach(([v, t]) => ty.append(el('option', { value: v, textContent: t, selected: v === (env || DEF_ENV[s]) })));
      env = null; unit.textContent = s === 'swim' ? 'm' : U.dU(); dist.placeholder = s === 'swim' ? 'metres' : U.imperial() ? 'miles' : 'km';
      dist.hidden = unit.hidden = s === 'transition'; hr.hidden = s === 'transition'; asc.hidden = s !== 'run' && s !== 'bike';
    };
    sp.onchange = refresh; refresh();
    rm.onclick = () => { legs.splice(legs.indexOf(leg), 1); row.remove(); };
    const leg = { sp, ty, dur, dist, hr, asc, row, rm };
    row.append(sp, ty, el('label', { className: 'mf' }, 'Time', dur), el('label', { className: 'mf' }, 'Distance', dist, unit), hr, asc, rm);
    return leg;
  };
  const setKind = k => {
    kind = k; kinds.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === k));
    legs.length = 0; legsBox.replaceChildren();
    const plan = k === 'multi' ? [['bike', 'indoor'], ['transition'], ['run', 'treadmill']] : [[k, DEF_ENV[k]]];
    plan.forEach(([s, e]) => { const l = legRow(s, e); legs.push(l); legsBox.append(l.row); });
    legs.forEach(l => { l.sp.disabled = k !== 'multi'; l.rm.hidden = k !== 'multi'; });
    addLeg.hidden = k !== 'multi';
  };
  [['run', 'Run'], ['bike', 'Ride'], ['swim', 'Swim'], ['multi', 'Multisport']].forEach(([k, t]) => { const b = el('button', { className: 'chip', type: 'button', textContent: t }); b.dataset.k = k; b.onclick = () => setKind(k); kinds.append(b); });
  const addLeg = el('button', { className: 'btn sm', type: 'button', textContent: '+ Add leg', onclick: () => { const l = legRow('run', 'treadmill'); legs.push(l); legsBox.append(l.row); } });
  const save = el('button', { className: 'btn primary', type: 'button', textContent: 'Save activity' });
  card.append(kinds, el('div', { className: 'frow', style: 'margin-top:10px' }, el('label', { className: 'f' }, 'Date', date), el('label', { className: 'f' }, 'Start time', time)),
    legsBox, addLeg, el('label', { className: 'ck' }, race, ' This was a race ', raceFlag(14)), el('label', { className: 'f', style: 'margin-top:10px' }, 'Name', name), el('label', { className: 'f', style: 'margin-top:8px' }, 'Description', desc),
    msg, el('div', { className: 'actions', style: 'justify-content:flex-end' }, save));
  setKind('run');
  host.append(card);

  save.onclick = async () => {
    msg.textContent = '';
    const L = legs.map(l => {
      const sport = l.sp.value, d = parseFloat(l.dist.value) || 0;
      return { sport, env: ENVS[sport] ? l.ty.value : null, elapsed: parseDur(l.dur.value), dist: sport === 'swim' ? d : U.fromD(d), hr: +l.hr.value || null, asc: +l.asc.value ? Math.round(U.imperial() ? +l.asc.value * U.FT : +l.asc.value) : null };
    });
    if (L.some(l => l.elapsed <= 0)) { msg.textContent = 'Give every leg a time, e.g. 45:00 or 1:05:30.'; return; }
    if (!date.value) { msg.textContent = 'Pick a date.'; return; }
    save.disabled = true; msg.textContent = 'Saving…';
    const start = new Date(`${date.value}T${time.value || '07:00'}`); // local time
    const off = -start.getTimezoneOffset();
    const real = L.filter(l => l.sport !== 'transition');
    const kindsUsed = [...new Set(real.map(l => l.sport))];
    const multi = real.length > 1 && kindsUsed.length > 1;
    const sport = multi ? 'multi' : (kindsUsed[0] || 'other');
    const profile = multi ? multisportProfile(L.map(l => l.sport)) : null;
    const total = L.reduce((a, l) => a + l.elapsed, 0), totalDist = L.reduce((a, l) => a + l.dist, 0);
    const hrLegs = L.filter(l => l.hr), avgHr = hrLegs.length ? Math.round(hrLegs.reduce((a, l) => a + l.hr * l.elapsed, 0) / hrLegs.reduce((a, l) => a + l.elapsed, 0)) : null;
    // training load from average heart rate where given, otherwise from time
    const loadData = { v: 1, t: {}, hr: {}, pw: [] };
    L.forEach(l => { const k = l.sport === 'transition' ? 'other' : l.sport; loadData.t[k] = (loadData.t[k] || 0) + l.elapsed;
      if (l.hr) { const h = loadData.hr[k] || (loadData.hr[k] = {}); h[l.hr] = (h[l.hr] || 0) + l.elapsed; } });
    const hh = start.getHours(), part = hh < 12 ? 'Morning' : hh < 17 ? 'Afternoon' : hh < 21 ? 'Evening' : 'Night';
    const auto = multi ? `${part} ${profile === 'other' ? 'Multisport' : profile[0].toUpperCase() + profile.slice(1)}` : `${part} ${envLabel(sport, real[0]?.env).replace(/\b\w/g, c => c.toUpperCase())}`;
    const act = {
      name: name.value.trim() || auto, description: desc.value.trim() || null, sport, multisport_profile: profile,
      start_time: start.toISOString(), utc_offset_min: off, distance_m: Math.round(totalDist), elapsed_s: total, moving_s: total,
      ascent_m: L.reduce((a, l) => a + (l.asc || 0), 0) || null, avg_hr: avgHr, max_hr: null,
      indoor: real.length > 0 && real.every(l => INDOOR.has(l.env)), source: 'manual', source_id: crypto.randomUUID(),
      visibility: state.profile?.default_visibility || 'club', share: state.profile?.default_share || undefined,
      summary: { manual: true, loadData, track: null }, is_race: race.checked,
      gear_id: multi ? null : pickGear(sport, real[0]?.env, race.checked, dayOfAct(start, off)),
    };
    if (!act.share) delete act.share;
    const ins = await sb.from('activities').insert(act).select('id').single();
    if (ins.error) { msg.textContent = 'Could not save: ' + ins.error.message; save.disabled = false; return; }
    let t = 0;
    const secs = L.map((l, i) => { const s = { activity_id: ins.data.id, idx: i, sport: l.sport, start_offset_s: t, elapsed_s: l.elapsed, timer_s: l.elapsed,
      distance_m: l.dist || null, ascent_m: l.asc, avg_hr: l.hr, avg_speed: l.dist && l.elapsed ? +(l.dist / l.elapsed).toFixed(3) : null, summary: { env: l.env, manual: true }, gear_id: multi ? pickGear(l.sport, l.env, race.checked, dayOfAct(start, off)) : null }; t += l.elapsed; return s; });
    const r2 = await sb.from('activity_sections').insert(secs);
    if (r2.error) { msg.textContent = 'Saved the activity but not its legs: ' + r2.error.message; save.disabled = false; return; }
    await refreshActs([ins.data.id]); toast('Activity logged'); location.hash = '#a/' + ins.data.id;
  };
}
