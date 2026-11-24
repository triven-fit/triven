// People tab: find and follow athletes, follow requests, followers/following, and clubs (clubs.js).
import { sb, state, toast, avatarEl } from './main.js?v=1795526551';
import { clubsCard } from './clubs.js?v=1795526551';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => e.append(k)); return e; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const SPC = { run: 'var(--run)', bike: 'var(--bike)', swim: 'var(--swim)', transition: 'var(--trans)' };
const SPN = { run: 'Run', bike: 'Ride', swim: 'Swim', multi: 'Multisport', other: 'Workout' };
const AUD = { everyone: 'Your activities follow each one’s own setting.', followers: 'Only followers see your activities.', followers_clubs: 'Only followers and club mates see your activities.' };

export async function mountClub() {
  const v = document.getElementById('view-club'); v.replaceChildren(el('div', { className: 'note', textContent: 'Loading…' }));
  const [{ data: clubs, error }, net] = await Promise.all([sb.rpc('my_clubs'), sb.rpc('my_network')]);
  v.replaceChildren();
  if (error) { v.append(el('div', { className: 'card', textContent: 'Could not load clubs: ' + error.message })); return; }
  const wrap = el('div', { className: 'people' });
  wrap.append(peopleCard(net.data || [], net.error), clubsCard(clubs || []));
  v.append(wrap);
}

// ---------- follows ----------
export const followBtn = (id, status, followsYou, onDone) => {
  const b = el('button', { className: 'btn sm' + (status ? '' : ' primary'), type: 'button',
    textContent: status === 'accepted' ? 'Following' : status === 'pending' ? 'Requested' : followsYou ? 'Follow back' : 'Follow' });
  if (status) b.title = status === 'accepted' ? 'Click to unfollow' : 'Click to cancel the request';
  b.onclick = async () => {
    b.disabled = true;
    const r = status ? await sb.from('follows').delete().eq('follower', state.user.id).eq('followee', id)
                     : await sb.from('follows').insert({ followee: id }).select('status').single();
    b.disabled = false; if (r.error) { toast(r.error.message); return; }
    if (!status) toast(r.data?.status === 'pending' ? 'Request sent: they approve followers' : 'Following');
    onDone();
  };
  return b;
};
function personRow(name, sub, ...btns) {
  const av = typeof btns[0] === 'object' && btns[0]?.avatarPath !== undefined ? btns.shift().avatarPath : null;
  return el('div', { className: 'prow' }, avatarEl(name, av, 34),
    el('div', { style: 'flex:1;min-width:0' }, el('b', { textContent: name }), sub ? el('div', { className: 'muted', style: 'font-size:12px', textContent: sub }) : ''), ...btns);
}
function peopleCard(net, err) {
  const c = el('div', { className: 'card' }, el('h2', { textContent: 'Athletes' }));
  if (err) { c.append(el('div', { className: 'note', textContent: 'Could not load followers: ' + err.message })); return c; }
  const p = state.profile || {};
  c.append(el('div', { className: 'note', style: 'margin:0 0 10px' }, (p.searchable === false ? 'You are hidden from search. ' : p.approve_followers ? 'You approve new followers. ' : 'Anyone can follow you. ') + AUD[p.searchable === false && (p.feed_audience || 'everyone') === 'everyone' ? 'followers_clubs' : p.feed_audience || 'everyone'] + ' ',
    el('button', { className: 'linkbtn', type: 'button', textContent: 'Privacy settings', onclick: () => document.getElementById('openSettings').click() })));
  // search
  const q = el('input', { type: 'search', placeholder: 'Find athletes by name', autocomplete: 'off' });
  const res = el('div', { className: 'plist' });
  let tmr = null, seq = 0;
  const run = async () => { const term = q.value.trim(); const my = ++seq;
    if (term.length < 2) { res.replaceChildren(); return; }
    const { data, error } = await sb.rpc('search_athletes', { q: term }); if (my !== seq) return;
    res.replaceChildren();
    if (error) { res.append(el('div', { className: 'note', textContent: error.message })); return; }
    if (!data.length) { res.append(el('div', { className: 'note', textContent: 'Nobody found. People who hide themselves from search don’t appear.' })); return; }
    data.forEach(a => res.append(personRow(a.athlete, a.follows_you ? 'Follows you' : a.approve_followers ? 'Approves followers' : '', { avatarPath: a.avatar || null }, followBtn(a.id, a.you_follow, a.follows_you, () => { run(); mountClub(); }))));
  };
  q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(run, 250); };
  c.append(q, res);
  // requests, followers, following
  const pending = net.filter(n => n.direction === 'follower' && n.status === 'pending');
  const followers = net.filter(n => n.direction === 'follower' && n.status === 'accepted');
  const following = net.filter(n => n.direction === 'following');
  const iFollow = new Map(following.map(n => [n.other, n.status]));
  if (pending.length) {
    c.append(el('h3', { className: 'psub', textContent: `Follow requests · ${pending.length}` }));
    pending.forEach(n => {
      const ok = el('button', { className: 'btn sm primary', type: 'button', textContent: 'Approve' }), no = el('button', { className: 'btn sm', type: 'button', textContent: 'Decline' });
      ok.onclick = async () => { const r = await sb.from('follows').update({ status: 'accepted' }).eq('follower', n.other).eq('followee', state.user.id); if (r.error) toast(r.error.message); else mountClub(); };
      no.onclick = async () => { const r = await sb.from('follows').delete().eq('follower', n.other).eq('followee', state.user.id); if (r.error) toast(r.error.message); else mountClub(); };
      c.append(personRow(n.athlete, 'Wants to follow you', { avatarPath: n.avatar || null }, no, ok));
    });
  }
  const tabs = el('div', { className: 'segrow', style: 'margin-top:14px' }), list = el('div', { className: 'plist' });
  const showList = which => {
    tabs.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === which));
    list.replaceChildren();
    const rows = which === 'followers' ? followers : following;
    if (!rows.length) { list.append(el('div', { className: 'note', textContent: which === 'followers' ? 'No followers yet.' : 'You don’t follow anyone yet. Search above to find people.' })); return; }
    rows.forEach(n => {
      if (which === 'followers') {
        const rm = el('button', { className: 'linkbtn', type: 'button', textContent: 'Remove', style: 'color:var(--text-muted)' });
        rm.onclick = async () => { if (!rm.dataset.armed) { rm.dataset.armed = 1; rm.textContent = 'Click again to remove'; return; } const r = await sb.from('follows').delete().eq('follower', n.other).eq('followee', state.user.id); if (r.error) toast(r.error.message); else mountClub(); };
        list.append(personRow(n.athlete, '', { avatarPath: n.avatar || null }, rm, followBtn(n.other, iFollow.get(n.other) || null, true, mountClub)));
      } else list.append(personRow(n.athlete, n.status === 'pending' ? 'Waiting for approval' : '', { avatarPath: n.avatar || null }, followBtn(n.other, n.status, false, mountClub)));
    });
  };
  [['followers', `Followers · ${followers.length}`], ['following', `Following · ${following.length}`]].forEach(([k, t]) => { const b = el('button', { className: 'chip', type: 'button', textContent: t }); b.dataset.k = k; b.onclick = () => showList(k); tabs.append(b); });
  c.append(tabs, list); showList('followers');
  c.append(el('div', { className: 'note', textContent: 'Activities from people you follow are on the Feed tab under Following.' }));
  return c;
}
