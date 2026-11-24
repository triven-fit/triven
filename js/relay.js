// Relays: separate activities from people who follow each other, shown as one race.
// Each person's activity stays theirs (totals, bests, load); the relay is a shared view on top.
import { garminNote } from './garmin.js?v=1795526807';
import { sb, state, toast, avatarEl, raceFlag } from './main.js?v=1795526807';
import { drawRouteMap } from './mapcanvas.js?v=1795526807';
import * as U from './units.js?v=1795526807';
import { openModal } from './edit.js?v=1795526807';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const SPC = { run: 'var(--run)', bike: 'var(--bike)', swim: 'var(--swim)', transition: 'var(--trans)', multi: 'var(--accent)', other: 'var(--trans)' };
const SPN = { run: 'Run', bike: 'Bike', swim: 'Swim', multi: 'Multisport', other: 'Workout' };
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const localTime = (iso, off) => { const d = new Date(Date.parse(iso) + (off || 0) * 60000); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const localDate = (iso, off) => { const d = new Date(Date.parse(iso) + (off || 0) * 60000); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const legSport = l => l.sport === 'multi' ? (l.multisport_profile && l.multisport_profile !== 'other' ? l.multisport_profile[0].toUpperCase() + l.multisport_profile.slice(1) : 'Multisport') : SPN[l.sport] || 'Workout';

// legs in order with hand-over gaps; total = first start to last finish
export function relayTimeline(relay) {
  const legs = (relay.legs || []).filter(l => l.status === 'accepted' && l.start_time).sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
  const parts = []; let prevEnd = null;
  for (const l of legs) {
    const st = Date.parse(l.start_time), en = st + (+l.elapsed_s || 0) * 1000;
    if (prevEnd != null) parts.push({ kind: 'gap', s: Math.max(0, (st - prevEnd) / 1000) });
    parts.push({ kind: 'leg', leg: l, s: +l.elapsed_s || 0 });
    prevEnd = prevEnd == null ? en : Math.max(prevEnd, en);
  }
  const first = legs[0] ? Date.parse(legs[0].start_time) : 0;
  return { legs, parts, total: legs.length ? (prevEnd - first) / 1000 : 0, distance: legs.reduce((a, l) => a + (+l.distance_m || 0), 0), pending: (relay.legs || []).filter(l => l.status === 'pending') };
}
// one route from every leg whose map the viewer may see; section numbers run on across legs
export function relayTrack(legs) {
  const track = [], sports = [];
  for (const l of legs) {
    const secs = l.sections?.length ? l.sections : [{ sport: l.sport }];
    if (Array.isArray(l.track)) for (const p of l.track) track.push([p[0], p[1], sports.length + (p[2] || 0)]);
    sports.push(...secs.map(s => s.sport));
  }
  return track.length > 1 ? { track, sports } : null;
}
function strip(tl, tall) {
  const s = el('div', { className: tall ? 'rstrip tall' : 'fstrip' });
  for (const p of tl.parts) {
    const i = el('i'); i.style.flex = String(Math.max(p.s, tall ? 30 : 20));
    if (p.kind === 'gap') { i.style.background = 'var(--trans)'; i.title = `Hand-over · ${fmtDur(p.s)}`; }
    else {
      i.style.background = SPC[p.leg.sport] || 'var(--trans)'; i.title = `${p.leg.athlete} · ${legSport(p.leg)} · ${fmtDur(p.s)}`;
      if (tall) i.append(el('span', { className: 'n', textContent: p.leg.athlete }), el('span', { className: 'v', textContent: `${legSport(p.leg)} · ${fmtDur(p.s)}` }));
    }
    s.append(i);
  }
  return s;
}
function faces(legs, size = 30) {
  const f = el('span', { className: 'faces' });
  legs.forEach(l => f.append(avatarEl(l.athlete, l.owner === state.user.id ? state.profile?.avatar_path : l.avatar, size)));
  return f;
}
const names = legs => { const n = legs.map(l => l.owner === state.user.id ? 'You' : l.athlete); return n.length < 3 ? n.join(' and ') : n.slice(0, -1).join(', ') + ' and ' + n.at(-1); };

// feed card for a relay (shown once per relay, whichever member's activity brought it into the feed)
export function relayCard(relay, observe) {
  const tl = relayTimeline(relay); const L = tl.legs; if (!L.length) return null;
  const head = el('div', { className: 'fhead' }, faces(L, 34),
    el('div', { style: 'flex:1;min-width:0' }, el('b', { textContent: names(L) }),
      el('div', { className: 'muted', style: 'font-size:12px', textContent: `${localDate(L[0].start_time, L[0].utc_offset_min)} · ${localTime(L[0].start_time, L[0].utc_offset_min)} · Relay of ${L.length}` })));
  const race = L.some(l => l.is_race);
  const c = el('div', { className: 'card fcard relaycard' }, head, el('a', { href: '#r/' + relay.id, className: 'ftitle' }, relay.name, race ? ' ' : null, race ? raceFlag(18) : null));
  const stats = el('div', { className: 'fstats' }), stat = (v, l) => stats.append(el('div', {}, el('b', { textContent: v }), el('small', { textContent: l })));
  stat(U.dist(tl.distance), 'Distance'); stat(fmtDur(tl.total), 'Time'); stat(String(L.length), 'Legs');
  c.append(stats, strip(tl, false));
  const legsBox = el('div', { className: 'rlegs' });
  L.forEach(l => legsBox.append(el(l.activity_id ? 'a' : 'div', { className: 'rleg', href: l.activity_id ? '#a/' + l.activity_id : undefined },
    el('i', { style: `background:${SPC[l.sport] || 'var(--trans)'}` }), el('span', { textContent: l.owner === state.user.id ? 'You' : l.athlete }),
    el('span', { className: 'muted', textContent: `${legSport(l)} · ${fmtDur(+l.elapsed_s || 0)}` }))));
  c.append(legsBox);
  const rt = relayTrack(L);
  if (rt) {
    const cv = el('canvas', { className: 'fmap', width: 1200, height: 560 });
    cv._draw = () => drawRouteMap(cv.getContext('2d'), rt.track, 0, 0, 1200, 560, { dark: dark(), pad: 60, sectionSports: rt.sports, width: 7 });
    c.append(el('div', { className: 'fmedia' }, el('a', { href: '#r/' + relay.id, className: 'fmapwrap' }, cv)));
    observe ? observe(cv) : cv._draw();
  }
  c.append(el('div', { className: 'factions' }, el('a', { className: 'btn sm', href: '#r/' + relay.id, textContent: 'Open relay', style: 'text-decoration:none' })));
  return c;
}

// ---------- relay page ----------
export async function mountRelay(id) {
  const v = document.getElementById('view-relay'); v.replaceChildren(el('div', { className: 'note', textContent: 'Loading…' }));
  const { data: relay, error } = await sb.rpc('relay_view', { rid: id });
  v.replaceChildren();
  if (error || !relay) { v.append(el('div', { className: 'card', textContent: error ? 'Could not load the relay: ' + error.message : 'This relay has ended, or you can’t see it.' })); return; }
  const tl = relayTimeline(relay), L = tl.legs, me = (relay.legs || []).find(l => l.owner === state.user.id);
  const card = el('div', { className: 'card' });
  const tags = el('div', {}, el('span', { className: 'tag', textContent: 'Relay' }), L.length ? el('span', { className: 'tag', textContent: localDate(L[0].start_time, L[0].utc_offset_min) }) : null);
  const title = el('h1', { style: 'margin-top:8px', textContent: relay.name });
  if (L.some(l => l.is_race)) title.append(' ', raceFlag(26));
  const tools = el('div', { className: 'rtools' });
  if (me?.status === 'accepted') {
    const rn = el('button', { className: 'btn sm', textContent: 'Rename' });
    rn.onclick = () => openModal((body, close) => {
      const inp = el('input', { value: relay.name, maxLength: 120 });
      body.append(el('h3', { textContent: 'Rename relay' }), el('label', { className: 'f' }, 'Name', inp),
        el('div', { className: 'actions' }, el('span'), el('div', { style: 'display:flex;gap:8px' }, el('button', { className: 'btn', textContent: 'Cancel', onclick: close }),
          el('button', { className: 'btn primary', textContent: 'Save', onclick: async () => { const r = await sb.rpc('rename_relay', { rid: relay.id, p_name: inp.value }); if (r.error) { toast(r.error.message); return; } close(); mountRelay(id); } }))));
      inp.focus();
    });
    const add = me.activity_id ? el('button', { className: 'btn sm', textContent: 'Add a leg', onclick: () => openRelayMaker({ id: me.activity_id, name: relay.name, start_time: me.start_time }, () => mountRelay(id), relay) }) : null;
    const leave = el('button', { className: 'btn sm', textContent: 'Leave relay' });
    leave.onclick = async () => { if (!leave.dataset.armed) { leave.dataset.armed = 1; leave.textContent = L.length + tl.pending.length <= 2 ? 'Click again: this ends the relay' : 'Click again to leave'; return; }
      const r = await sb.rpc('leave_relay', { rid: relay.id }); if (r.error) { toast(r.error.message); return; } toast('You’ve left the relay. Your activity is unchanged.'); location.hash = '#a/' + me.activity_id; };
    tools.append(rn, add || '', leave);
  }
  card.append(el('div', { className: 'acthead' }, tags, tools), title,
    el('div', { className: 'sub', textContent: L.length ? `${names(L)} · started ${localTime(L[0].start_time, L[0].utc_offset_min)}` : 'Waiting for the other legs' }));
  const stats = el('div', { className: 'stats' }), stat = (val, l) => stats.append(el('div', { className: 'stat' }, el('b', { textContent: val }), el('small', { textContent: l })));
  stat(fmtDur(tl.total), 'Total time'); stat(U.dist(tl.distance), 'Distance'); stat(String(L.length), 'Legs');
  const gaps = tl.parts.filter(p => p.kind === 'gap'); if (gaps.length) stat(fmtDur(gaps.reduce((a, p) => a + p.s, 0)), 'Hand-overs');
  card.append(stats);
  if (L.length) card.append(el('div', { className: 'segbar-head' }, el('h2', { textContent: 'Legs' })), strip(tl, true));
  v.append(card);

  // legs table
  const tbl = el('table', { className: 'laps' });
  const hr = tbl.insertRow(); ['#', 'Athlete', 'Leg', 'Start', 'Time', 'Distance', 'Pace / speed', ''].forEach(t => hr.append(el('th', { textContent: t })));
  let n = 0;
  for (const p of tl.parts) {
    const r = tbl.insertRow();
    if (p.kind === 'gap') { r.className = 'rgap'; ['', '', 'Hand-over', '', fmtDur(p.s), '', '', ''].forEach(t => r.insertCell().textContent = t); continue; }
    const l = p.leg, d = +l.distance_m || 0, t = +l.elapsed_s || 0;
    const pace = !d || !t ? '' : l.sport === 'run' ? U.pace(t, d) : l.sport === 'swim' ? U.swimPace(t, d) : U.speed(t, d);
    r.insertCell().textContent = String(++n);
    r.insertCell().append(el('span', { style: 'display:inline-flex;gap:8px;align-items:center' }, avatarEl(l.athlete, l.owner === state.user.id ? state.profile?.avatar_path : l.avatar, 22), l.owner === state.user.id ? 'You' : l.athlete));
    r.insertCell().append(el('span', { className: 'dot', style: `background:${SPC[l.sport] || 'var(--trans)'}` }), legSport(l));
    [localTime(l.start_time, l.utc_offset_min), fmtDur(t), U.dist(d), pace].forEach(x => r.insertCell().textContent = x);
    r.insertCell().append(l.activity_id ? el('a', { href: '#a/' + l.activity_id, textContent: 'Open' }) : el('span', { className: 'muted', textContent: 'Not shared with you', style: 'font-size:12px' }));
  }
  for (const pnd of tl.pending) { const r = tbl.insertRow(); r.className = 'rgap'; ['', '', '', '', '', '', '', ''].forEach(() => r.insertCell()); r.cells[1].textContent = pnd.athlete; r.cells[2].textContent = 'Invited, waiting for them to accept'; }
  const rt = relayTrack(L);
  const grid = el('div', { className: 'rgrid' });
  grid.append(el('div', { className: 'card' }, el('h2', { textContent: 'Results', style: 'margin-bottom:8px' }), el('div', { className: 'rtable' }, tbl),
    el('div', { className: 'note', textContent: 'Each leg stays in its owner’s own log for totals, bests and training load. Leg details follow each owner’s sharing settings.' })));
  if (rt) {
    const cv = el('canvas', { className: 'fmap', width: 1000, height: 760, style: 'width:100%;height:auto;border-radius:8px' });
    grid.append(el('div', { className: 'card' }, el('h2', { textContent: 'Route', style: 'margin-bottom:8px' }), cv,
      el('div', { className: 'legend' }, ...[...new Set(L.map(l => l.sport))].map(s => el('span', {}, el('i', { style: `background:${SPC[s]}` }), SPN[s])))));
    drawRouteMap(cv.getContext('2d'), rt.track, 0, 0, 1000, 760, { dark: dark(), pad: 50, sectionSports: rt.sports, width: 6 });
  }
  v.append(grid, garminNote(null, true));
}

// ---------- making a relay from your activity ----------
export function openRelayMaker(act, onDone, existing) {
  openModal(async (body, close) => {
    body.append(el('h3', { textContent: existing ? 'Add a leg to the relay' : 'Make a relay' }),
      el('p', { className: 'sec', style: 'margin-top:0', textContent: 'Join your activity with a team mate’s into one relay. It’s for people who follow each other. They approve it before it appears, and either of you can leave it later.' }));
    const box = el('div', { className: 'note', textContent: 'Loading…' }); body.append(box);
    const [cand, net] = await Promise.all([sb.rpc('relay_candidates', { aid: act.id }), sb.rpc('my_network')]);
    box.remove();
    if (cand.error) { body.append(el('div', { className: 'note', textContent: cand.error.message })); return; }
    const inRelay = new Set((existing?.legs || []).map(l => l.owner));
    const followers = new Set((net.data || []).filter(n => n.direction === 'follower' && n.status === 'accepted').map(n => n.other));
    const mutual = (net.data || []).filter(n => n.direction === 'following' && n.status === 'accepted' && followers.has(n.other) && !inRelay.has(n.other));
    if (!mutual.length) { body.append(el('div', { className: 'card empty', style: 'margin-top:8px' }, el('p', { className: 'sec', textContent: 'Relays are between people who follow each other. Follow your team mates (and have them follow you back) on the People tab.' }), el('a', { className: 'btn', href: '#club', textContent: 'Find team mates', onclick: close, style: 'text-decoration:none' }))); return; }
    let pick = null;
    const list = el('div', { className: 'rpick' });
    const choose = (row, val) => { list.querySelectorAll('.ropt').forEach(r => r.classList.toggle('sel', r === row)); pick = val; go.disabled = false; };
    for (const p of mutual) {
      const acts = (cand.data || []).filter(c => c.owner === p.other);
      const grp = el('div', { className: 'rgroup' }, el('div', { className: 'rwho' }, avatarEl(p.athlete, p.avatar, 26), el('b', { textContent: p.athlete })));
      acts.forEach(c => { const row = el('button', { type: 'button', className: 'ropt' }, el('span', { className: 'dot', style: `background:${SPC[c.sport] || 'var(--trans)'}` }),
        el('span', { style: 'flex:1;text-align:left', textContent: c.name }), el('span', { className: 'muted', textContent: `${localTime(c.start_time, c.utc_offset_min)} · ${fmtDur(+c.elapsed_s)} · ${U.dist(c.distance_m, 1)}` }));
        row.onclick = () => choose(row, { other: p.other, other_aid: c.activity_id, who: p.athlete }); grp.append(row); });
      const ask = el('button', { type: 'button', className: 'ropt ask' }, el('span', { style: 'flex:1;text-align:left', textContent: acts.length ? 'Let them choose their activity' : 'Ask them to pick their activity for the leg' }));
      ask.onclick = () => choose(ask, { other: p.other, other_aid: null, who: p.athlete }); grp.append(ask);
      list.append(grp);
    }
    const name = el('input', { value: existing ? existing.name : (act.name || 'Relay').replace(/\b(morning|afternoon|evening|lunch|night)\b/i, '').trim() + ' relay', maxLength: 120 });
    const go = el('button', { className: 'btn primary', textContent: 'Send invitation', disabled: true });
    go.onclick = async () => { go.disabled = true;
      const r = await sb.rpc('start_relay', { aid: act.id, other: pick.other, other_aid: pick.other_aid, p_name: name.value });
      go.disabled = false; if (r.error) { toast(r.error.message); return; }
      toast(`Invitation sent to ${pick.who}. The relay shows once they accept.`); close(); onDone?.(); };
    body.append(el('div', { className: 'sec', style: 'margin:6px 0', textContent: 'Activities within 12 hours of yours that you can see:' }), list);
    if (!existing) body.append(el('label', { className: 'f', style: 'margin-top:12px' }, 'Relay name', name));
    body.append(el('div', { className: 'actions', style: 'margin-top:14px' }, el('span'), el('div', { style: 'display:flex;gap:8px' }, el('button', { className: 'btn', textContent: 'Cancel', onclick: close }), go)));
  });
}

// ---------- invitations (top of the feed) ----------
export async function relayInvites(host, onChange) {
  const { data, error } = await sb.rpc('my_relay_invites');
  if (error || !data?.length) return;
  for (const inv of data) {
    const tl = relayTimeline(inv.relay || { legs: [] });
    const anchor = tl.legs[0] ? Date.parse(tl.legs[0].start_time) : Date.now();
    const mine = state.activities.filter(a => Math.abs(Date.parse(a.start_time) - anchor) <= 12 * 3600e3).sort((a, b) => Math.abs(Date.parse(a.start_time) - anchor) - Math.abs(Date.parse(b.start_time) - anchor));
    const sel = el('select');
    if (!mine.length) sel.append(el('option', { value: '', textContent: 'No activities of yours within 12 hours' }));
    mine.forEach(a => sel.append(el('option', { value: a.id, textContent: `${a.name} · ${localTime(a.start_time, a.utc_offset_min)} · ${U.dist(a.distance_m, 1)}`, selected: a.id === inv.activity_id })));
    const ok = el('button', { className: 'btn sm primary', textContent: 'Accept', disabled: !mine.length }), no = el('button', { className: 'btn sm', textContent: 'Decline' });
    ok.onclick = async () => { ok.disabled = true; const r = await sb.rpc('respond_relay', { rid: inv.relay_id, accept: true, p_activity: sel.value }); ok.disabled = false; if (r.error) { toast(r.error.message); return; } toast('Relay joined'); onChange?.(); };
    no.onclick = async () => { const r = await sb.rpc('respond_relay', { rid: inv.relay_id, accept: false }); if (r.error) { toast(r.error.message); return; } toast('Invitation declined'); onChange?.(); };
    host.append(el('div', { className: 'card invite' },
      el('div', { className: 'fhead' }, avatarEl(inv.invited_by, inv.invited_by_avatar, 34), el('div', { style: 'flex:1' },
        el('b', { textContent: `${inv.invited_by} invited you to a relay` }), el('div', { className: 'muted', style: 'font-size:12px', textContent: `${inv.relay_name} · ${tl.legs.map(l => `${l.athlete}: ${legSport(l)} ${fmtDur(+l.elapsed_s || 0)}`).join(' · ')}` }))),
      el('div', { className: 'sec', style: 'margin-top:10px;font-size:13px', textContent: 'Your leg:' }),
      el('div', { className: 'clubform' }, sel, no, ok),
      el('div', { className: 'note', style: 'margin-top:6px', textContent: 'Your leg’s sport, time and distance will show on the relay to anyone who can see it. Everything else follows your activity’s own sharing settings. Your activity stays yours for totals and bests.' })));
  }
}

// ---------- banner on an activity page that's part of a relay ----------
document.addEventListener('triven:activity', async e => {
  const { act } = e.detail; const box = document.getElementById('actRelay'); if (!box) return;
  box.hidden = true; box.replaceChildren();
  const tools = document.getElementById('actTools');
  const { data } = await sb.from('relay_legs').select('relay_id,status').eq('activity_id', act.id).maybeSingle();
  if (data) {
    const r = await sb.rpc('relay_view', { rid: data.relay_id }); const relay = r.data; if (!relay) return;
    const tl = relayTimeline(relay);
    box.hidden = false;
    box.append(el('span', { className: 'rbadge', textContent: 'Relay' }), el('span', { style: 'flex:1', textContent: tl.legs.length >= 2 ? `Part of ${relay.name} with ${names(tl.legs.filter(l => l.owner !== act.owner))} · ${fmtDur(tl.total)} total` : `Relay invitation sent: waiting for ${tl.pending.map(p => p.athlete).join(', ')}` }),
      el('a', { className: 'btn sm', href: '#r/' + relay.id, textContent: 'Open relay', style: 'text-decoration:none' }));
  } else if (act.owner === state.user.id && document.getElementById('actEditMenu')) {   // in the Edit menu
    const menu = document.getElementById('actEditMenu');
    menu.append(el('button', { className: 'dditem', type: 'button', role: 'menuitem', textContent: 'Make a relay', title: 'Join this with a team mate’s activity into one relay', onclick: () => openRelayMaker(act, () => { location.hash = '#a/' + act.id + '?' + Date.now(); }) }));
  }
});
