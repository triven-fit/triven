// Profile pages (triven.fit/<username>) and short links (triven.fit/<username>/<n>). Members only.
import { garminNote } from './garmin.js?v=1795533703';
import { sb, state, toast, avatarEl } from './main.js?v=1795533703';
import { feedList } from './feed.js?v=1795533703';
import { followBtn } from './club.js?v=1795533703';
import * as U from './units.js?v=1795533703';
import { rememberLink } from './urls.js?v=1795533703';
import { RUN_DISTANCES, SWIM_DISTANCES } from './process.js?v=1795533703';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const fmtHM = s => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };
const SPN = { run: 'Run', bike: 'Ride', swim: 'Swim', multi: 'Multisport', other: 'Workout' };
const SPC = { run: 'var(--run)', bike: 'var(--bike)', swim: 'var(--swim)', multi: 'var(--accent)', other: 'var(--trans)' };
const POWER = ['5 s', '1 min', '5 min', '20 min', '1 hour'];

export const linkUrl = path => 'https://triven.fit/' + path;

// copy, or the phone's share sheet
export async function shareLink(url, title) {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('Link copied: ' + url.replace('https://', ''), 3000); }
  catch { prompt('Copy this link', url); }
}
export const shareButton = (getUrl, title, label = 'Share') => el('button', { className: 'btn sm', type: 'button', title: 'Copy a link to this', onclick: async () => { const u = await getUrl(); if (u) shareLink(u, title); else toast('No link for this yet'); } },
  el('span', { innerHTML: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>' }), ' ' + label);

// #u/<handle> or #u/<handle>/<n>
export async function openLink(path, show) {
  const [handle, n] = path.split('/');
  show('profile'); const v = document.getElementById('view-profile'); v.replaceChildren(el('div', { className: 'note', textContent: 'Opening…' }));
  const { data, error } = await sb.rpc('resolve_link', { p_handle: handle, p_num: n ? +n : null });
  if (error) { v.replaceChildren(msg('Could not open that link', error.message)); return; }
  if (n) {
    if (data?.activity) { rememberLink(data.activity, data.handle + '/' + n); location.replace('#a/' + data.activity); return; }
    v.replaceChildren(msg(data?.found ? 'This activity isn’t shared with you' : 'No activity at that link',
      data?.found ? `@${data.handle} hasn’t shared it with you. Following them or joining their club may help.` : 'It may have been deleted, or the link is mistyped.', data?.handle ? '#u/' + data.handle : null));
    return;
  }
  if (!data?.found) { v.replaceChildren(msg('Nobody has that username', 'Check the link, or find people on the People tab.', '#club')); return; }
  if (!data.person) { v.replaceChildren(msg('This profile is private', `@${data.handle} only shows their profile to followers and club mates.`, '#club')); return; }
  if (data.handle !== handle) history.replaceState(null, '', '/' + data.handle);   // an old username: show the current one
  mountProfile(data.person);
}
function msg(title, text, href) {
  const c = el('div', { className: 'card empty' }, el('h2', { textContent: title }), el('p', { className: 'sec', textContent: text }));
  if (href) c.append(el('a', { className: 'btn', href, textContent: href.startsWith('#u/') ? 'See their profile' : 'Find people', style: 'text-decoration:none' }));
  return c;
}

export async function mountProfile(uid) {
  const v = document.getElementById('view-profile');
  const { data: p, error } = await sb.rpc('athlete_page', { uid });
  if (error || !p) { v.replaceChildren(msg('This profile is private', error?.message || 'They only show their profile to followers and club mates.')); return; }
  v.replaceChildren();
  // header
  const btns = el('div', { className: 'proftools' });
  if (p.me) btns.append(el('a', { className: 'btn sm', href: '#settings', textContent: 'Edit profile', style: 'text-decoration:none', onclick: e => { e.preventDefault(); document.getElementById('openSettings')?.click(); } }));
  else btns.append(followBtn(p.id, p.you_follow, p.follows_you, () => mountProfile(uid)));
  btns.append(shareButton(() => linkUrl(p.handle), p.name, 'Share profile'));
  const since = new Date(p.since);
  const head = el('div', { className: 'card profhead' }, avatarEl(p.name, p.avatar, 72),
    el('div', { style: 'flex:1;min-width:0' }, el('h1', { textContent: p.name }),
      el('div', { className: 'muted' }, `@${p.handle} · on Triven since ${since.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`, p.follows_you && !p.me ? ' · follows you' : ''),
      p.clubs.length ? el('div', { className: 'profclubs' }, ...p.clubs.map(c => el('a', { className: 'chip', href: '#c/' + c.id, textContent: c.name, style: 'text-decoration:none' }))) : null),
    btns);
  v.append(head);
  // this year + bests
  const grid = el('div', { className: 'profgrid' });
  const year = el('div', { className: 'card' }, el('h3', { textContent: new Date().getFullYear() + ' so far' }));
  const ys = Object.entries(p.year).sort((a, b) => b[1].s - a[1].s);
  if (!ys.length) year.append(el('div', { className: 'note', textContent: p.me ? 'Nothing this year yet.' : 'Nothing shared with you this year.' }));
  ys.forEach(([sp, t]) => year.append(el('div', { className: 'profyr' }, el('span', { className: 'dot', style: `background:${SPC[sp] || 'var(--trans)'}` }), el('b', { textContent: SPN[sp] || sp }),
    el('span', { textContent: `${t.n} · ${U.distBig(t.km * 1000)} · ${fmtHM(+t.s)}${+t.up ? ` · ${U.elev(t.up)} up` : ''}` }))));
  year.append(el('div', { className: 'note', style: 'margin-top:8px', textContent: `${p.count.toLocaleString()} ${p.me ? 'activities in all' : 'activities you can see'}` }));
  grid.append(year);
  const best = el('div', { className: 'card' }, el('h3', { textContent: 'Best efforts' }));
  const B = new Map(p.bests.map(b => [b.sport + '|' + b.effort, b]));
  const rows = [
    ['Run', RUN_DISTANCES.map(([n]) => B.get('run|' + n)).filter(Boolean), b => fmtDur(b.value)],
    ['Ride power', POWER.map(n => B.get('bike|power ' + n)).map((b, i) => b && { ...b, effort: POWER[i] }).filter(b => b?.unit === 'W'), b => Math.round(b.value) + ' W'],
    ['Swim', SWIM_DISTANCES.map(([n]) => B.get('swim|' + n)).filter(Boolean), b => fmtDur(b.value)],
  ].filter(r => r[1].length);
  if (!rows.length) best.append(el('div', { className: 'note', textContent: p.me ? 'Upload activities to fill this in.' : 'None shared with you yet.' }));
  rows.forEach(([t, list, f]) => best.append(el('div', { className: 'psub', textContent: t }),
    el('div', { className: 'profbests' }, ...list.map(b => el('a', { href: '#a/' + b.activity, title: new Date(b.at).toLocaleDateString() }, el('small', { textContent: b.effort }), el('b', { textContent: f(b) }))))));
  grid.append(best);
  v.append(grid);
  v.append(garminNote(null, true));   // totals and bests above may come from Garmin devices
  // activities
  const list = el('div', { className: 'feed' });
  v.append(el('h3', { className: 'profh', textContent: p.me ? 'Your activities' : 'Activities' }), list);
  await feedList(list, { scope: 'athlete', person: p.id, refresh: () => mountProfile(uid) },
    [p.me ? 'No activities yet' : 'Nothing to show', p.me ? 'Upload a .fit file or your Garmin export.' : 'They haven’t shared any activities with you.', p.me ? '#upload' : null, 'Upload activities']);
}
