// Clubs: list and search, create, club pages (posts from admins, members, the club's activities), invite links, admin settings.
import { garminNote } from './garmin.js?v=1795591409';
import { sb, state, toast, avatarEl, avatarUrl } from './main.js?v=1795591409';
import { openModal } from './edit.js?v=1795591409';
import { feedList } from './feed.js?v=1795591409';
import * as U from './units.js?v=1795591409';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ago = iso => { const d = new Date(iso), s = (Date.now() - d) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; return `${d.getDate()} ${MON[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`; };
export const inviteLink = code => `${location.origin}/join/${code}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const policyText = p => p === 'approval' ? 'Admins approve new members' : 'Anyone with the link can join';
// club photo, or its first letter on a coloured square
export function clubBadge(name, path, size = 40) {
  const s = el('span', { className: 'clubbadge' }); s.style.width = s.style.height = size + 'px'; s.style.fontSize = Math.round(size * 0.45) + 'px';
  const url = avatarUrl(path);
  if (url) { const i = el('img', { src: url, alt: '', loading: 'lazy' }); i.onerror = () => { i.remove(); s.textContent = (name || '?').trim()[0]?.toUpperCase() || '?'; }; s.append(i); }
  else s.textContent = (name || '?').trim()[0]?.toUpperCase() || '?';
  return s;
}
async function copy(text, what) { try { await navigator.clipboard.writeText(text); toast(what + ' copied'); } catch { toast('Copy failed: ' + text, 6000); } }

// ---------- People tab: your clubs, find a club, create one ----------
export function clubsCard(clubs) {
  const c = el('div', { className: 'card' }, el('h2', { textContent: 'Clubs' }));
  if (!clubs.length) c.append(el('p', { className: 'sec', style: 'margin:8px 0 0', textContent: 'Join a club to see your club mates’ activities on the Feed tab under Club, or start one for your own group.' }));
  const list = el('div', { className: 'plist' });
  clubs.forEach(k => {
    const sub = k.status === 'pending' ? 'Request sent, waiting for an admin' : `${plural(k.members, 'member')}${k.role === 'owner' ? ' · you run it' : k.role === 'admin' ? ' · admin' : ''}`;
    const row = el('a', { className: 'prow clublink', href: '#c/' + k.id }, clubBadge(k.name, k.avatar, 38),
      el('div', { style: 'flex:1;min-width:0' }, el('b', { textContent: k.name }), el('div', { className: 'muted', style: 'font-size:12px', textContent: sub })));
    if (k.pending) row.append(el('span', { className: 'pill warn', textContent: plural(k.pending, 'request') }));
    list.append(row);
  });
  c.append(list);
  // search listed clubs
  const q = el('input', { type: 'search', placeholder: 'Find a club by name', autocomplete: 'off', style: 'margin-top:12px' });
  const res = el('div', { className: 'plist' }); let tmr = null, seq = 0;
  const run = async () => { const my = ++seq; const term = q.value.trim(); if (term.length < 2) { res.replaceChildren(); return; }
    const { data, error } = await sb.rpc('search_clubs', { q: term }); if (my !== seq) return; res.replaceChildren();
    if (error) { res.append(el('div', { className: 'note', textContent: error.message })); return; }
    if (!data.length) { res.append(el('div', { className: 'note', textContent: 'No clubs found. Invite-only clubs don’t show in search: ask a member for the invite link.' })); return; }
    data.forEach(k => res.append(el('a', { className: 'prow clublink', href: '#c/' + k.id }, clubBadge(k.name, k.avatar, 34),
      el('div', { style: 'flex:1;min-width:0' }, el('b', { textContent: k.name }), el('div', { className: 'muted', style: 'font-size:12px', textContent: `${plural(k.members, 'member')} · ${k.my_status === 'active' ? 'You’re a member' : k.my_status === 'pending' ? 'Request sent' : policyText(k.join_policy)}` })))));
  };
  q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(run, 250); };
  const code = el('input', { placeholder: 'Or paste an invite link or code' });
  const jn = el('button', { className: 'btn sm', textContent: 'Open', type: 'button' });
  jn.onclick = () => { const m = code.value.trim().match(/([0-9a-f]{12})\s*$/i); if (!m) { toast('That doesn’t look like an invite link'); return; } location.hash = '#join/' + m[1].toLowerCase(); };
  c.append(q, res, el('div', { className: 'clubform' }, code, jn),
    el('div', { style: 'margin-top:12px' }, el('button', { className: 'btn sm primary', type: 'button', textContent: 'Start a club', onclick: () => openClubForm(null) })));
  return c;
}

// create or edit (admins) a club
function openClubForm(club) {
  openModal((body, close) => {
    const name = el('input', { value: club?.name || '', maxLength: 80, placeholder: 'e.g. Doha Triathlon Club' });
    const desc = el('textarea', { value: club?.description || '', maxLength: 1000, rows: 3, placeholder: 'What the club is about, where and when you train' });
    const radio = (group, val, label, sub, on) => el('label', { className: 'ropt' + (on ? ' sel' : '') }, el('input', { type: 'radio', name: group, value: val, checked: on }), el('span', { style: 'flex:1' }, el('b', { textContent: label }), el('div', { className: 'muted', style: 'font-size:12px', textContent: sub })));
    const listed = el('div', { className: 'rpick' }, radio('listed', 'yes', 'Listed', 'Anyone can find it in club search', club ? club.listed : true), radio('listed', 'no', 'Invite only', 'Only people with the invite link can find it', club ? !club.listed : false));
    const policy = el('div', { className: 'rpick' }, radio('policy', 'open', 'Free to join', 'People join straight away', (club?.join_policy || 'open') === 'open'), radio('policy', 'approval', 'Admin approval', 'You approve each request first', club?.join_policy === 'approval'));
    [listed, policy].forEach(g => g.addEventListener('change', () => g.querySelectorAll('.ropt').forEach(r => r.classList.toggle('sel', r.querySelector('input').checked))));
    const val = (g, n) => g.querySelector(`input[name=${n}]:checked`).value;
    const go = el('button', { className: 'btn primary', textContent: club ? 'Save' : 'Create club' });
    go.onclick = async () => {
      if (name.value.trim().length < 2) { toast('Give the club a name'); return; }
      go.disabled = true;
      const r = club ? await sb.rpc('update_club', { cid: club.id, p_name: name.value, p_description: desc.value, p_listed: val(listed, 'listed') === 'yes', p_policy: val(policy, 'policy') })
                     : await sb.rpc('create_club', { club_name: name.value, p_description: desc.value, p_listed: val(listed, 'listed') === 'yes', p_policy: val(policy, 'policy') });
      go.disabled = false; if (r.error) { toast(r.error.message); return; }
      close(); toast(club ? 'Club updated' : 'Club created');
      location.hash = '#c/' + (club ? club.id : r.data.id) + (club ? '?' + Date.now() : '');
    };
    body.append(el('h3', { textContent: club ? 'Club settings' : 'Start a club' }),
      el('label', { className: 'f' }, 'Name', name), el('label', { className: 'f', style: 'margin-top:10px' }, 'Description', desc),
      el('div', { className: 'sec', style: 'margin:14px 0 6px;font-weight:600', textContent: 'Who can find it' }), listed,
      el('div', { className: 'sec', style: 'margin:14px 0 6px;font-weight:600', textContent: 'Joining' }), policy,
      el('div', { className: 'note', textContent: 'There’s always an invite link to share, whichever you choose. You can change these later.' }),
      el('div', { className: 'actions', style: 'margin-top:14px' }, el('span'), el('div', { style: 'display:flex;gap:8px' }, el('button', { className: 'btn', textContent: 'Cancel', onclick: close }), go)));
    name.focus();
  });
}

// ---------- club page ----------
export async function mountClubPage(id) {
  const v = document.getElementById('view-club'); v.replaceChildren(el('div', { className: 'note', textContent: 'Loading…' }));
  const { data: k, error } = await sb.rpc('club_page', { cid: id });
  v.replaceChildren();
  if (error || !k) { v.append(el('div', { className: 'card' }, el('p', { textContent: error ? 'Could not load the club: ' + error.message : 'This club is invite only, or no longer exists. Ask a member for the invite link.' }), el('a', { href: '#club', textContent: 'Back to People' }))); return; }
  const member = k.my_status === 'active', admin = member && (k.my_role === 'owner' || k.my_role === 'admin');
  v.append(el('a', { href: '#club', className: 'back', textContent: '← People and clubs' }), clubHead(k, member, admin));
  if (!member) return;
  const main = el('div', { className: 'clubmain' }), side = el('aside', { className: 'clubside' });
  v.append(el('div', { className: 'clubgrid2' }, main, side));
  main.append(postsCard(k, admin));
  if (member) main.append(leaderCard(k));
  const list = el('div', { className: 'feed' });
  main.append(el('h2', { style: 'margin:18px 0 8px', textContent: 'Club activities' }), list);
  feedList(list, { scope: 'club', club: k.id, refresh: () => mountClubPage(id) }, ['No activities yet', 'Activities members share with their club or with everyone appear here.', null, null]);
  if (admin && k.pending?.length) side.append(pendingCard(k));
  side.append(membersCard(k, admin));
}

function clubHead(k, member, admin) {
  const c = el('div', { className: 'card clubhead' });
  const badge = clubBadge(k.name, k.avatar, 72);
  if (admin) { // change the club photo
    const f = el('input', { type: 'file', accept: 'image/*', hidden: true });
    const pick = el('button', { className: 'linkbtn', type: 'button', textContent: k.avatar ? 'Change photo' : 'Add photo', onclick: () => f.click() });
    f.onchange = async () => { const file = f.files[0]; f.value = ''; if (!file) return;
      try { const blob = await squareJpeg(file), path = `clubs/${k.id}/photo-${Date.now()}.jpg`;
        const up = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error;
        const r = await sb.rpc('update_club', { cid: k.id, p_avatar: path }); if (r.error) throw r.error;
        if (k.avatar) sb.storage.from('avatars').remove([k.avatar]);
        toast('Club photo updated'); mountClubPage(k.id);
      } catch (e) { toast('Could not set the photo: ' + (e.message || e)); } };
    c.append(el('div', { className: 'clubphoto' }, badge, pick, f));
  } else c.append(badge);
  const info = el('div', { style: 'flex:1;min-width:0' }, el('h1', { textContent: k.name }),
    el('div', { className: 'muted', style: 'margin-top:4px;font-size:13px', textContent: `${plural(k.members_count, 'member')} · ${k.listed ? 'Listed in club search' : 'Invite only'} · ${policyText(k.join_policy)}` }));
  if (k.description) info.append(el('div', { className: 'actdesc', textContent: k.description }));
  const acts = el('div', { className: 'clubacts' });
  if (member) {
    const link = inviteLink(k.invite_code);
    acts.append(el('button', { className: 'btn sm primary', textContent: 'Copy invite link', onclick: () => copy(link, 'Invite link') }));
    if (admin) acts.append(el('button', { className: 'btn sm', textContent: 'Settings', onclick: () => openClubForm(k) }),
      el('button', { className: 'btn sm', textContent: 'New invite link', title: 'Stops the old link working', onclick: async e => { const b = e.currentTarget; if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = 'Click again: the old link stops working'; return; }
        const r = await sb.rpc('update_club', { cid: k.id, p_new_code: true }); if (r.error) { toast(r.error.message); return; } toast('New invite link made'); mountClubPage(k.id); } }));
    const leave = el('button', { className: 'btn sm', textContent: 'Leave' });
    leave.onclick = async () => { if (!leave.dataset.armed) { leave.dataset.armed = 1; leave.textContent = k.my_role === 'owner' ? (k.members_count > 1 ? 'Click again: an admin takes over' : 'Click again: the club is deleted') : 'Click again to leave'; return; }
      const r = await sb.from('club_members').delete().eq('club_id', k.id).eq('user_id', state.user.id); if (r.error) { toast(r.error.message); return; } toast('You’ve left ' + k.name); location.hash = '#club'; };
    acts.append(leave);
  } else if (k.my_status === 'pending') {
    acts.append(el('span', { className: 'pill', textContent: 'Request sent' }), el('button', { className: 'linkbtn', textContent: 'Cancel request', onclick: async () => { await sb.from('club_members').delete().eq('club_id', k.id).eq('user_id', state.user.id); mountClubPage(k.id); } }));
  } else {
    acts.append(el('button', { className: 'btn primary', textContent: k.join_policy === 'approval' ? 'Ask to join' : 'Join club', onclick: async () => {
      const r = await sb.rpc('join_listed_club', { cid: k.id }); if (r.error) { toast(r.error.message); return; }
      toast(r.data.status === 'pending' ? 'Request sent to the club admins' : 'Welcome to ' + k.name); mountClubPage(k.id); } }));
  }
  info.append(acts);
  c.append(info);
  return c;
}

function postsCard(k, admin) {
  const c = el('div', { className: 'card' }, el('h2', { textContent: 'Club news' }));
  if (admin) {
    const t = el('textarea', { rows: 2, maxLength: 4000, placeholder: 'Post a message to the club: sessions, races, kit orders…' });
    const go = el('button', { className: 'btn sm primary', textContent: 'Post' });
    go.onclick = async () => { const body = t.value.trim(); if (!body) return; go.disabled = true;
      const r = await sb.from('club_posts').insert({ club_id: k.id, body }); go.disabled = false; if (r.error) { toast(r.error.message); return; } mountClubPage(k.id); };
    c.append(el('div', { className: 'composer' }, t, go));
  }
  if (!k.posts?.length) c.append(el('div', { className: 'note', textContent: admin ? 'Messages you post appear here for every member.' : 'No messages from the club admins yet.' }));
  (k.posts || []).forEach(p => {
    const row = el('div', { className: 'post' }, avatarEl(p.name, p.avatar, 32),
      el('div', { style: 'flex:1;min-width:0' }, el('div', {}, el('b', { textContent: p.name }), el('span', { className: 'muted', style: 'font-size:12px;margin-left:8px', textContent: ago(p.created_at) })),
        el('div', { className: 'cbody', textContent: p.body })));
    if (admin || p.author === state.user.id) {
      const del = el('button', { className: 'linkbtn', textContent: 'Delete', style: 'color:var(--text-muted)' });
      del.onclick = async () => { if (!del.dataset.armed) { del.dataset.armed = 1; del.textContent = 'Click again to delete'; return; } const r = await sb.from('club_posts').delete().eq('id', p.id); if (r.error) toast(r.error.message); else mountClubPage(k.id); };
      row.append(del);
    }
    c.append(row);
  });
  return c;
}

function pendingCard(k) {
  const c = el('div', { className: 'card' }, el('h2', { textContent: `Requests to join · ${k.pending.length}` }));
  k.pending.forEach(p => {
    const ok = el('button', { className: 'btn sm primary', textContent: 'Approve' }), no = el('button', { className: 'btn sm', textContent: 'Decline' });
    const act = approve => async () => { const r = await sb.rpc('review_member', { cid: k.id, uid: p.id, approve }); if (r.error) toast(r.error.message); else mountClubPage(k.id); };
    ok.onclick = act(true); no.onclick = act(false);
    c.append(el('div', { className: 'prow' }, avatarEl(p.name, p.avatar, 30), el('b', { style: 'flex:1', textContent: p.name }), no, ok));
  });
  return c;
}

function membersCard(k, admin) {
  const c = el('div', { className: 'card' }, el('h2', { textContent: `Members · ${k.members.length}` }));
  const owner = k.my_role === 'owner';
  k.members.forEach(m => {
    const row = el('div', { className: 'prow' }, avatarEl(m.name, m.avatar, 30), el('div', { style: 'flex:1;min-width:0' }, el('b', { textContent: m.id === state.user.id ? m.name + ' (you)' : m.name }),
      m.role !== 'member' ? el('div', { className: 'muted', style: 'font-size:12px', textContent: m.role === 'owner' ? 'Owner' : 'Admin' }) : null));
    if (m.id !== state.user.id && (owner || (admin && m.role === 'member'))) {
      const menu = el('select', { className: 'msel', ariaLabel: 'Change ' + m.name });
      menu.append(el('option', { value: '', textContent: '⋯' }));
      if (owner) menu.append(el('option', { value: m.role === 'admin' ? 'member' : 'admin', textContent: m.role === 'admin' ? 'Make a member' : 'Make an admin' }), el('option', { value: 'owner', textContent: 'Hand the club over' }));
      menu.append(el('option', { value: 'remove', textContent: 'Remove from club' }));
      menu.onchange = async () => { const v = menu.value; menu.value = ''; if (!v) return;
        if ((v === 'remove' || v === 'owner') && !confirmInline(row, v === 'remove' ? `Remove ${m.name}?` : `Make ${m.name} the owner? You become an admin.`, () => run(v))) return;
        run(v); };
      const run = async v => { const r = v === 'remove' ? await sb.rpc('remove_member', { cid: k.id, uid: m.id }) : await sb.rpc('set_member_role', { cid: k.id, uid: m.id, p_role: v });
        if (r.error) toast(r.error.message); else mountClubPage(k.id); };
      row.append(menu);
    }
    c.append(row);
  });
  return c;
}
// small inline yes/no instead of a browser dialog
function confirmInline(row, text, yes) {
  row.querySelector('.confirm')?.remove();
  const box = el('div', { className: 'confirm' }, el('span', { textContent: text }), el('button', { className: 'btn sm', textContent: 'Cancel', onclick: () => box.remove() }), el('button', { className: 'btn sm primary', textContent: 'Yes', onclick: () => { box.remove(); yes(); } }));
  row.after(box); return false;
}

// ---------- invite links ----------
export async function mountJoin(code) {
  const v = document.getElementById('view-club'); v.replaceChildren(el('div', { className: 'note', textContent: 'Loading…' }));
  try { localStorage.removeItem('triven.join'); } catch { /* storage blocked */ }
  const { data: k, error } = await sb.rpc('club_preview', { code });
  v.replaceChildren();
  if (error || !k) { v.append(el('div', { className: 'card' }, el('h2', { textContent: 'Invite link not found' }), el('p', { className: 'sec', textContent: 'The link may have been replaced by a newer one. Ask a club member for the current link.' }), el('a', { href: '#club', textContent: 'Go to clubs' }))); return; }
  if (k.my_status === 'active') { location.replace('#c/' + k.id); return; }
  const c = el('div', { className: 'card clubhead', style: 'max-width:620px' }, clubBadge(k.name, k.avatar, 72));
  const info = el('div', { style: 'flex:1' }, el('div', { className: 'muted', style: 'font-size:12px;text-transform:uppercase;letter-spacing:.06em;font-weight:600', textContent: 'You’re invited to join' }),
    el('h1', { textContent: k.name }), el('div', { className: 'muted', style: 'margin-top:4px;font-size:13px', textContent: `${plural(k.members, 'member')} · ${policyText(k.join_policy)}` }));
  if (k.description) info.append(el('div', { className: 'actdesc', textContent: k.description }));
  if (k.my_status === 'pending') info.append(el('div', { className: 'clubacts' }, el('span', { className: 'pill', textContent: 'Request sent: an admin will approve it' })));
  else {
    const go = el('button', { className: 'btn primary', textContent: k.join_policy === 'approval' ? 'Ask to join' : 'Join club' });
    go.onclick = async () => { go.disabled = true; const r = await sb.rpc('join_club', { code }); go.disabled = false; if (r.error) { toast(r.error.message); return; }
      if (r.data.status === 'pending') { toast('Request sent to the club admins'); mountJoin(code); } else { toast('Welcome to ' + k.name); location.hash = '#c/' + k.id; } };
    info.append(el('div', { className: 'clubacts' }, go, el('a', { className: 'btn', href: '#feed', textContent: 'Not now', style: 'text-decoration:none' })),
      el('div', { className: 'note', textContent: 'Club mates see the activities you set to Club or Followers, and you see theirs. You can leave at any time.' }));
  }
  c.append(info); v.append(c);
}

async function squareJpeg(file, px = 400) {
  const img = await createImageBitmap(file); const side = Math.min(img.width, img.height);
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  cv.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, px, px);
  return await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.88));
}

// ---------- leaderboard: members' totals this week, month or year (only what you can see; multisport legs by sport) ----------
let LB = { period: 'month', sport: 'all', metric: 'dist' };
function leaderCard(k) {
  const card = el('div', { className: 'card', style: 'margin-top:16px' }), body = el('div');
  const chips = (opts, key) => { const row = el('div', { className: 'segrow' }); opts.forEach(([v, t]) => { const b = el('button', { className: 'chip', type: 'button', textContent: t }); b.setAttribute('aria-pressed', LB[key] === v); b.onclick = () => { LB[key] = v; card.replaceWith(leaderCard(k)); }; row.append(b); }); return row; };
  card.append(el('h2', { textContent: 'Leaderboard' }),
    el('div', { className: 'lbctl' }, chips([['week', 'This week'], ['month', 'This month'], ['year', 'This year']], 'period'), chips([['all', 'All'], ['run', 'Run'], ['bike', 'Ride'], ['swim', 'Swim']], 'sport'),
      chips([['dist', 'Distance'], ['secs', 'Time'], ['elev', 'Elevation']], 'metric')), body);
  const n = new Date(), d0 = LB.period === 'week' ? new Date(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 6) % 7)) : LB.period === 'month' ? new Date(n.getFullYear(), n.getMonth(), 1) : new Date(n.getFullYear(), 0, 1);
  const d1 = LB.period === 'week' ? new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 7) : LB.period === 'month' ? new Date(d0.getFullYear(), d0.getMonth() + 1, 1) : new Date(d0.getFullYear() + 1, 0, 1);
  body.append(el('div', { className: 'note', textContent: 'Loading…' }));
  sb.rpc('club_leaderboard', { p_club: k.id, p_from: d0.toISOString(), p_to: d1.toISOString(), p_sport: LB.sport }).then(({ data, error }) => {
    body.replaceChildren();
    if (error) { body.append(el('div', { className: 'note', textContent: error.message })); return; }
    const key = LB.metric, rows = (data || []).filter(r => r.n > 0 && +r[key] > 0).sort((a, b) => b[key] - a[key]);
    if (!rows.length) { body.append(el('div', { className: 'note', textContent: 'Nothing shared yet for this period.' })); return; }
    const top = +rows[0][key], fmt = v => key === 'dist' ? U.dist(v, 1) : key === 'elev' ? U.elev(v) : (h => `${Math.floor(h)}h ${String(Math.round(h % 1 * 60)).padStart(2, '0')}m`)(v / 3600);
    const list = el('div', { className: 'lblist' });
    rows.forEach((r, i) => list.append(el(r.handle ? 'a' : 'div', { className: 'lbrow' + (r.user_id === state.user.id ? ' me' : ''), href: r.handle ? '#u/' + r.handle : undefined },
      el('span', { className: 'lbrank', textContent: i + 1 }), avatarEl(r.name, r.avatar, 28), el('span', { className: 'lbname', textContent: r.user_id === state.user.id ? 'You' : r.name }),
      el('span', { className: 'lbbar' }, el('i', { style: `width:${Math.max(2, r[key] / top * 100)}%` })), el('b', { textContent: fmt(+r[key]) }), el('small', { className: 'muted', textContent: `${r.n} ${r.n === 1 ? 'activity' : 'activities'}` }))));
    body.append(list, el('div', { className: 'note', textContent: 'Counts activities shared with the club (never private ones). Multisport races count each leg towards its sport.' }), garminNote(null, true));
  });
  return card;
}
