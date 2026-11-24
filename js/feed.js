// Feeds: Me (your activities), Club (you and club mates), Everyone (public activities from all Triven athletes).
import { sb, state, toast, fetchActivity, VIS, raceFlag, avatarEl } from './main.js?v=1795526807';
import { mountWeek } from './week.js?v=1795526807';
import { envLabel } from './process.js?v=1795526807';
import { rememberLink } from './urls.js?v=1795526807';
import { tempTxt } from './weather.js?v=1795526807';
import { mainDevice, garminNote } from './garmin.js?v=1795526807';
import * as U from './units.js?v=1795526807';
import { drawRouteMap } from './mapcanvas.js?v=1795526807';
import { openEditor, mediaUrls, lightbox } from './edit.js?v=1795526807';
import { openTrim } from './trim.js?v=1795526807';
import { relayCard, relayInvites } from './relay.js?v=1795526807';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const SPC = { run: 'var(--run)', bike: 'var(--bike)', swim: 'var(--swim)', transition: 'var(--trans)' };
const SPN = { run: 'Run', bike: 'Ride', swim: 'Swim', multi: 'Multisport', other: 'Workout' };
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
let scope = 'me', io = null;

export async function mountFeed(sc) {
  scope = sc || 'me';
  const v = document.getElementById('view-feed'); v.replaceChildren();
  const bar = el('div', { className: 'feedbar' });
  [['me', 'Me'], ['following', 'Following'], ['club', 'Club'], ['everyone', 'Everyone']].forEach(([k, t]) => { const a = el('a', { className: 'chip', href: k === 'me' ? '#feed' : '#feed/' + k, textContent: t }); a.setAttribute('aria-pressed', k === scope); bar.append(a); });
  bar.append(el('span', { className: 'muted', style: 'font-size:12px;margin-left:6px', textContent: { me: 'Your activities, newest first', following: 'People you follow', club: 'You and your club mates', everyone: 'Public activities from other Triven athletes' }[scope] }));
  const invites = el('div', { className: 'invites' });
  const list = el('div', { className: 'feed' });
  const side = el('aside', { className: 'feedside', ariaLabel: 'You and this week' });
  v.append(el('div', { className: 'feedgrid' }, side, el('div', { className: 'feedmain' }, bar, invites, list)));
  mountWeek(side);
  const gn = garminNote(state.activities); if (gn) side.append(gn);
  relayInvites(invites, () => mountFeed(scope));
  await feedList(list, { scope });
}

// a paged list of feed cards; used by the Feed tab and club pages. args: { scope, club }
export async function feedList(list, args, empty) {
  io?.disconnect();
  io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); e.target._draw?.(); } }), { rootMargin: '300px' });
  const st = { cursor: null, relays: new Set() };
  const more = async () => {
    list.querySelector('.more')?.remove();
    const r = await sb.rpc('feed', { scope: args.scope, before: st.cursor || new Date(Date.now() + 864e5).toISOString(), lim: 15, ...(args.club ? { club: args.club } : {}), ...(args.person ? { person: args.person } : {}) });
    if (r.error) { list.append(el('div', { className: 'card', textContent: 'Could not load the feed: ' + r.error.message })); return; }
    const rows = r.data || [];
    if (!rows.length && !st.cursor) {
      const msg = empty || { me: ['Nothing here yet', 'Upload a .fit file or your Garmin export to fill your feed.', '#upload', 'Upload activities'],
        following: ['Nobody to show yet', 'Follow other athletes and their activities will appear here.', '#club', 'Find athletes'],
        club: ['No club activities yet', 'Join or create a club, and your club mates’ activities will appear here.', '#club', 'Clubs'],
        everyone: ['No public activities yet', 'Activities other athletes set to Everyone appear here.', null, null] }[args.scope];
      const c = el('div', { className: 'card empty' }, el('h2', { textContent: msg[0] }), el('p', { className: 'sec', textContent: msg[1] }));
      if (msg[2]) c.append(el('a', { className: 'btn primary', href: msg[2], textContent: msg[3], style: 'text-decoration:none' }));
      list.append(c); return;
    }
    // signed URLs for all photos/videos on this page in one call
    const allMedia = rows.flatMap(a => a.relay ? [] : a.media || []);
    const urls = new Map((await mediaUrls(allMedia)).map(m => [m.id, m.url]));
    rows.forEach(a => {
      if (a.relay) {   // a relay shows once, however many of its members' activities are in this feed
        if (st.relays.has(a.relay.id)) return; st.relays.add(a.relay.id);
        const rc = relayCard(a.relay, cv => io.observe(cv)); if (rc) { list.append(rc); return; }
      }
      list.append(card(a, urls, args.refresh || (() => mountFeed(scope))));
    });
    if (rows.length === 15) { st.cursor = rows[rows.length - 1].start_time; list.append(el('button', { className: 'btn more', textContent: 'Show older', onclick: more })); }
  };
  await more();
}

function card(a, urls, refresh) {
  const d = new Date(Date.parse(a.start_time) + a.utc_offset_min * 60000);
  const when = `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  const mine = a.owner === state.user.id;
  const s0 = (a.sections || []).find(x => x.sport !== 'transition');
  const type = a.sport === 'multi' ? (a.multisport_profile === 'other' ? 'Multisport' : a.multisport_profile[0].toUpperCase() + a.multisport_profile.slice(1)) : envLabel(a.sport, s0?.env);
  const prof = a.handle ? '#u/' + a.handle : null;
  if (a.handle && a.num) rememberLink(a.id, a.handle + '/' + a.num);   // so the address bar can show /handle/num
  const head = el('div', { className: 'fhead' }, prof ? el('a', { href: prof, className: 'favlink' }, avatarEl(a.athlete, mine ? state.profile?.avatar_path : a.avatar, 38)) : avatarEl(a.athlete, mine ? state.profile?.avatar_path : a.avatar, 38),
    el('div', { style: 'flex:1' }, prof ? el('a', { href: prof, className: 'fwho' }, el('b', { textContent: mine ? 'You' : a.athlete })) : el('b', { textContent: mine ? 'You' : a.athlete }), el('div', { className: 'muted', style: 'font-size:12px', textContent: `${when} · ${type}${mine ? ' · ' + VIS[a.visibility] : ''}` })));
  const c = el('div', { className: 'card fcard' }, head, el('a', { href: '#a/' + a.id, className: 'ftitle' }, a.name, a.is_race ? ' ' : null, a.is_race ? raceFlag(18) : null));
  const dev = mainDevice(a.device); if (dev) c.append(el('div', { className: 'fdevice', textContent: dev }));   // Garmin attribution sits under the title
  if (a.description) c.append(el('div', { className: 'actdesc', textContent: a.description }));
  // stats
  const stats = el('div', { className: 'fstats' }), stat = (v, l) => stats.append(el('div', {}, el('b', { textContent: v }), el('small', { textContent: l })));
  const t = a.sport === 'multi' ? +a.elapsed_s : +(a.moving_s || a.elapsed_s);
  stat(U.dist(a.distance_m), 'Distance'); stat(fmtDur(t), 'Time');
  if (a.sport === 'run' && (mine || a.share?.pace !== false)) stat(U.pace(t, a.distance_m), 'Pace');
  if (a.sport === 'bike' && (mine || a.share?.pace !== false)) stat(U.speed(t, a.distance_m), 'Speed');
  if (a.sport === 'swim') stat(U.swimPace(t, a.distance_m), 'Pace');
  if (a.ascent_m) stat(U.elev(a.ascent_m), 'Elevation');
  const wx = mine && state.activities.find(x => x.id === a.id)?.summary?.weather;   // your own activities: the weather at the time
  if (wx) stat(tempTxt(wx.t), 'Temp');
  if (a.avg_hr) stat(Math.round(a.avg_hr) + ' bpm', 'Avg HR');
  c.append(stats);
  if (a.sport === 'multi' && a.sections?.length) {
    const strip = el('div', { className: 'fstrip' });
    a.sections.forEach(s => { const i = el('i'); i.style.flex = String(Math.max(+s.elapsed_s, 20)); i.style.background = SPC[s.sport] || 'var(--trans)'; i.title = `${s.sport === 'transition' ? 'Transition' : SPN[s.sport]} · ${fmtDur(s.elapsed_s)}`; strip.append(i); });
    c.append(strip);
  }
  // map + media strip
  const media = (a.media || []).map(m => ({ ...m, url: urls.get(m.id) })).filter(m => m.url);
  if (a.track || media.length) {
    const row = el('div', { className: 'fmedia' + (a.track && media.length ? ' both' : '') });
    if (a.track) {
      const cv = el('canvas', { className: 'fmap', width: 1200, height: 560 });
      const link = el('a', { href: '#a/' + a.id, className: 'fmapwrap' }, cv);
      cv._draw = () => drawRouteMap(cv.getContext('2d'), a.track, 0, 0, 1200, 560, { dark: dark(), pad: 60, sectionSports: a.sections.map(s => s.sport), width: 7 });
      row.append(link); io.observe(cv);
    }
    if (media.length) {
      const g = el('div', { className: 'fthumbs n' + Math.min(media.length, 3) });
      media.slice(0, 3).forEach((m, i) => { const t2 = m.kind === 'video' ? el('video', { src: m.url, muted: true, preload: 'metadata', playsInline: true }) : el('img', { src: m.url, alt: '', loading: 'lazy' });
        const b = el('button', { className: 'gitem' + (m.kind === 'video' ? ' vid' : ''), type: 'button', onclick: () => lightbox(m) }, t2);
        if (i === 2 && media.length > 3) b.append(el('span', { className: 'gmore', textContent: '+' + (media.length - 3) }));
        g.append(b); });
      row.append(g);
    }
    c.append(row);
  }
  // driving flag (owner only)
  if (mine && a.flags?.length) {
    const tb = el('button', { className: 'btn sm', textContent: 'Trim', onclick: async () => { tb.disabled = true; const dd = await fetchActivity(a.id); tb.disabled = false; openTrim(dd, refresh); } });
    c.append(el('div', { className: 'warnbar' }, el('span', { className: 'ic', textContent: '!' }), el('span', { style: 'flex:1', textContent: `Looks like it includes driving (up to ${Math.round(U.kmhTo(Math.max(...a.flags.map(f => f.maxKmh))))} ${U.sU()}).` }), tb));
  }
  // actions
  const acts = el('div', { className: 'factions' });
  const kudo = el('button', { className: 'btn sm' + (a.you_kudoed ? ' on' : ''), textContent: `👏 ${a.kudos || 0}`, disabled: mine, title: mine ? 'Kudos from others' : 'Give kudos' });
  kudo.onclick = async () => { kudo.disabled = true;
    const r = a.you_kudoed ? await sb.from('kudos').delete().eq('activity_id', a.id).eq('user_id', state.user.id) : await sb.from('kudos').insert({ activity_id: a.id });
    kudo.disabled = false; if (r.error) { toast(r.error.message); return; }
    a.you_kudoed = !a.you_kudoed; a.kudos += a.you_kudoed ? 1 : -1; kudo.textContent = `👏 ${a.kudos}`; kudo.classList.toggle('on', a.you_kudoed); };
  acts.append(kudo, el('a', { className: 'btn sm', href: '#a/' + a.id, textContent: `💬 ${a.comments || 0}`, style: 'text-decoration:none' }));
  if (mine) {
    acts.append(el('span', { style: 'flex:1' }));
    const ed = el('button', { className: 'btn sm', textContent: 'Edit' });
    ed.onclick = async () => { ed.disabled = true; try { const dd = await fetchActivity(a.id); openEditor(dd, refresh); } finally { ed.disabled = false; } };
    acts.append(ed);
  }
  c.append(acts);
  return c;
}
