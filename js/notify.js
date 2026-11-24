// Notifications bell: kudos, comments, replies, followers, relay invitations, club requests and posts (my_notifications()).
// Unread = newer than settings.notifSeen, which opening the list moves to now (so it's the same on every device).
import { sb, state, avatarEl } from './main.js?v=1795534599';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const ago = t => { const s = (Date.now() - Date.parse(t)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min'; if (s < 86400) return Math.floor(s / 3600) + ' h';
  if (s < 7 * 86400) return Math.floor(s / 86400) + ' d'; const d = new Date(t); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
let items = [], timer = null;

function line(n) {
  const who = el('b', { textContent: n.actor_name || 'Someone' }), what = n.activity_name ? el('i', { textContent: n.activity_name }) : null, club = el('b', { textContent: n.club_name || 'your club' });
  const q = n.body ? el('span', { className: 'muted', textContent: ` “${n.body}”` }) : null;
  switch (n.kind) {
    case 'kudos': return { href: '#a/' + n.activity_id, kids: [who, ' gave kudos on ', what] };
    case 'comment': return { href: '#a/' + n.activity_id, kids: [who, ' commented on ', what, q] };
    case 'reply': return { href: '#a/' + n.activity_id, kids: [who, ' also commented on ', what, q] };
    case 'follow': return { href: n.actor_handle ? '#u/' + n.actor_handle : '#club', kids: [who, ' started following you'] };
    case 'follow_request': return { href: '#club', kids: [who, ' asked to follow you'] };
    case 'relay_invite': return { href: '#feed', kids: [who, ' invited you to a relay', n.club_name ? `: ${n.club_name}` : ''] };
    case 'club_request': return { href: '#c/' + n.club_id, kids: [who, ' asked to join ', club] };
    case 'club_post': return { href: '#c/' + n.club_id, kids: [who, ' posted in ', club, q] };
    case 'feedback_feature': return { href: '#admin', kids: [who, ' suggested a feature', q] };
    case 'feedback_problem': return { href: '#admin', kids: [who, ' reported a problem', q] };
    case 'feedback_status': return { href: '#feedback', kids: ['Your feedback is now ', el('b', { textContent: { seen: 'seen', planned: 'planned', done: 'done', wontfix: 'not planned' }[n.club_name] || n.club_name }), q] };
    default: return { href: '#feed', kids: [who] };
  }
}
const seen = () => Date.parse(state.profile?.settings?.notifSeen || 0) || 0;
function paintBadge() {
  const b = document.getElementById('bellBadge'); if (!b) return;
  const n = items.filter(x => Date.parse(x.at) > seen()).length;
  b.textContent = n > 9 ? '9+' : n; b.hidden = !n;
  document.getElementById('bellBtn')?.setAttribute('aria-label', n ? `Notifications, ${n} new` : 'Notifications');
}
export async function refreshNotifications() {
  if (!state.user) return;
  const { data, error } = await sb.rpc('my_notifications', { lim: 40 });
  if (!error) { items = data || []; paintBadge(); }
}
async function markSeen() {
  const newest = items[0]?.at; if (!newest || Date.parse(newest) <= seen()) return;
  const settings = { ...(state.profile.settings || {}), notifSeen: new Date().toISOString() };
  if (!(await sb.from('profiles').update({ settings }).eq('id', state.user.id)).error) state.profile.settings = settings;
  paintBadge();
}
function open() {
  const panel = document.getElementById('bellPanel'); if (!panel) return;
  if (!panel.hidden) { panel.hidden = true; return; }
  const was = seen();
  panel.replaceChildren(el('div', { className: 'bellhead' }, el('b', { textContent: 'Notifications' })));
  if (!items.length) panel.append(el('div', { className: 'note', style: 'padding:10px', textContent: 'Nothing yet. Kudos, comments, new followers and club news show up here.' }));
  items.forEach(n => { const l = line(n);
    panel.append(el('a', { className: 'bellitem' + (Date.parse(n.at) > was ? ' new' : ''), href: l.href, onclick: () => { panel.hidden = true; } },
      avatarEl(n.actor_name || '?', n.actor_avatar, 30), el('span', { className: 'belltext' }, ...l.kids.filter(Boolean)), el('small', { className: 'muted', textContent: ago(n.at) }))); });
  // on phones the panel spans the screen just under the bell (it's fixed there, so it can't run off the left edge)
  const bell = document.getElementById('bellBtn'); if (bell) panel.style.setProperty('--bellTop', Math.round(bell.getBoundingClientRect().bottom + 6) + 'px');
  panel.hidden = false;
  markSeen();
}
export function initNotifications() {
  const btn = document.getElementById('bellBtn'); if (!btn || btn.dataset.ready) return;
  btn.dataset.ready = 1; btn.onclick = e => { e.stopPropagation(); open(); };
  document.addEventListener('click', e => { const p = document.getElementById('bellPanel'); if (p && !p.hidden && !p.contains(e.target)) p.hidden = true; });
  refreshNotifications();
  clearInterval(timer); timer = setInterval(refreshNotifications, 2 * 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshNotifications(); });
}
