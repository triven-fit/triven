// Edit an activity: name, description, visibility, shared fields, gear (per section for multisport), delete. Plus comments.
import { sb, state, toast, refreshActs, renderActHeader, fetchActivity, VIS, reprocess, raceFlag, pickGear, refreshGear } from './main.js?v=1795708914';
import { linkActivities, importDecoded } from './pipeline.js?v=1795708914';
import { decodeFit } from './fit.js?v=1795708914';
import { shareStreams, ENVS, INDOOR } from './process.js?v=1795708914';
import { openTrim } from './trim.js?v=1795708914';
import { openIg } from './ig.js?v=1795708914';
import * as U from './units.js?v=1795708914';
import { shareButton, linkUrl } from './profile.js?v=1795708914';
const dayOf = a => new Date(Date.parse(a.start_time) + (a.utc_offset_min || 0) * 60000).toISOString().slice(0, 10);   // activity's local date

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => e.append(k)); return e; };
const SHARE = [['map', 'Map and route'], ['pace', 'Pace and speed'], ['hr', 'Heart rate'], ['power', 'Power'], ['cadence', 'Cadence'], ['dynamics', 'Running dynamics (ground contact, balance, oscillation)'], ['description', 'Description']];
const SPORTNAME = { run: 'Run', bike: 'Bike', swim: 'Swim' };
let cur = null;
// flag/unflag a race; gear that was the automatic choice swaps to your race (or everyday) default
async function setRace(data, v) {
  const { act, sections } = data;
  const r = await sb.from('activities').update({ is_race: v }).eq('id', act.id);
  if (r.error) { toast(r.error.message); return false; }
  act.is_race = v;
  const envOf = sp => sections.find(s => s.sport === sp)?.summary?.env;
  if (act.sport === 'run' || act.sport === 'bike') {
    const was = pickGear(act.sport, envOf(act.sport), !v, dayOf(act)), now = pickGear(act.sport, envOf(act.sport), v, dayOf(act));
    if (now && now !== act.gear_id && (!act.gear_id || act.gear_id === was)) { await sb.from('activities').update({ gear_id: now }).eq('id', act.id); act.gear_id = now; toast(v ? 'Marked as a race · race gear set' : 'No longer a race · gear set back'); }
    else toast(v ? 'Marked as a race' : 'No longer a race');
  } else {
    for (const s of sections.filter(s => s.sport === 'run' || s.sport === 'bike')) {
      const was = pickGear(s.sport, s.summary?.env, !v, dayOf(act)), now = pickGear(s.sport, s.summary?.env, v, dayOf(act));
      if (now && now !== s.gear_id && (!s.gear_id || s.gear_id === was)) { await sb.from('activity_sections').update({ gear_id: now }).eq('activity_id', act.id).eq('idx', s.idx); s.gear_id = now; }
    }
    toast(v ? 'Marked as a race' : 'No longer a race');
  }
  const la = state.activities.find(a => a.id === act.id); if (la) la.is_race = v;
  return true;
}
const VISHELP = { private: 'only you', followers: 'your followers and club mates', club: 'your club mates', public: 'everyone on Triven' };

export function openModal(build) {
  const ov = $('modal'), body = $('modalBody'); body.replaceChildren(); body.className = 'sheet'; build(body, () => { ov.classList.remove('open'); body.querySelectorAll('video').forEach(v => v.pause()); }); ov.classList.add('open');
}
document.addEventListener('DOMContentLoaded', () => {});
const ov = $('modal');
ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') ov.classList.remove('open'); });

document.addEventListener('click', e => { const m = document.getElementById('actEditMenu'); if (m && !m.hidden && (!m.parentElement.contains(e.target) || e.target.closest('.dditem'))) m.hidden = true; });   // outside, or after picking an item
document.addEventListener('triven:activity', e => {
  cur = e.detail;
  const mine = cur.act.owner === state.user.id;
  const reopen = () => { location.hash = '#a/' + cur.act.id + '?' + Date.now(); };
  const tools = $('actTools'); tools.replaceChildren();
  // toolbar: Edit (a menu with the less common actions), Share, Instagram post
  const menu = el('div', { className: 'ddmenu', id: 'actEditMenu', hidden: true, role: 'menu' });
  // the menu hangs from the button's right edge; on a phone the button can be near the left, so flip it if it would leave the screen
  const keepOnScreen = m => { m.style.left = m.style.right = ''; const r = m.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    if (r.left < 8) { m.style.left = '0'; m.style.right = 'auto'; } else if (r.right > vw - 8) { m.style.right = '0'; m.style.left = 'auto'; } };
  const item = (content, onclick, title) => { const b = el('button', { className: 'dditem', type: 'button', role: 'menuitem', title: title || '' }); b.append(...[].concat(content)); b.onclick = e => { menu.hidden = true; return onclick(e); }; menu.append(b); return b; };
  if (mine) {
    const eb = el('button', { className: 'btn sm', type: 'button', textContent: 'Edit ▾', ariaHasPopup: 'menu' });
    eb.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; if (!menu.hidden) keepOnScreen(menu); };
    tools.append(el('div', { className: 'ddwrap' }, eb, menu));
    item('Edit details', () => openEditor(cur, reopen), 'Name, description, notes, gear, sharing, photos');
    // one click: race or not (and race shoes/bike if you have defaults for races)
    const rb = item([], async () => { const v = !cur.act.is_race; const r = await setRace(cur, v); if (!r) return; paint(); renderActHeader(cur.act, cur.sections); });
    const paint = () => rb.replaceChildren(raceFlag(14), cur.act.is_race ? ' Not a race' : ' Mark as race');
    paint();
    if (cur.streams) item('Trim', () => openTrim(cur, reopen), 'Cut the start or end, e.g. a drive home');
    if (cur.act.summary?.linked) { const u = unlinkButton(cur); u.className = 'dditem'; const go = u.onclick; u.onclick = e => { menu.hidden = true; return go && go(e); }; menu.append(u); }
    else if (cur.act.file_path) item('Link activities', () => openLinker(cur), 'Join separate swim, bike and run files into one multisport activity');
  }
  const a0 = cur.act;
  tools.append(shareButton(async () => {   // triven.fit/<username>/<n>; opens for members who can see it
    if (mine && state.profile?.handle && a0.num) return linkUrl(state.profile.handle + '/' + a0.num);
    const r = await sb.rpc('activity_link', { aid: a0.id }); return r.data ? linkUrl(r.data) : null;
  }, a0.name));
  if (mine) tools.append(el('button', { className: 'btn sm primary', textContent: 'Instagram post', onclick: () => igFor(cur) }));
  // who can see it: one click to change
  const vbox = $('actVis'); vbox.replaceChildren(); vbox.hidden = !mine;
  if (mine) {
    vbox.append(el('span', { className: 'muted', textContent: 'Who can see this' }));
    const seg = el('div', { className: 'vseg', role: 'group', ariaLabel: 'Who can see this activity' });
    for (const [v, t] of Object.entries(VIS)) {
      const b = el('button', { type: 'button', className: 'chip', textContent: (v === 'private' ? '🔒 ' : '') + t, title: VISHELP[v] }); b.setAttribute('aria-pressed', cur.act.visibility === v);
      b.onclick = async () => { if (cur.act.visibility === v) return; const prev = cur.act.visibility;
        seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
        const { error } = await sb.from('activities').update({ visibility: v }).eq('id', cur.act.id);
        if (error) { toast('Could not change: ' + error.message); seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.textContent.endsWith(VIS[prev]))); return; }
        cur.act.visibility = v; const la = state.activities.find(a => a.id === cur.act.id); if (la) la.visibility = v; toast('Now visible to: ' + VISHELP[v]); };
      seg.append(b);
    }
    vbox.append(seg);
  }
  // driving warning
  const warn = $('actWarn'); warn.replaceChildren(); warn.hidden = true;
  const drv = cur.act.summary?.driving || [];
  if (mine && drv.length) {
    warn.hidden = false;
    const d = drv[drv.length - 1];
    warn.append(el('span', { className: 'ic', textContent: '!' }), el('div', {}, el('b', { textContent: 'This looks like it includes driving. ' }),
      document.createTextNode(`${drv.length === 1 ? 'One stretch' : drv.length + ' stretches'} at car speed, up to ${Math.round(U.kmhTo(Math.max(...drv.map(x => x.maxKmh))))} ${U.sU()}${d.atEnd ? ', at the end' : d.atStart ? ', at the start' : ''}. Forgot to stop the watch?`)),
      el('button', { className: 'btn sm', textContent: 'Trim it', onclick: () => openTrim(cur, reopen) }),
      el('button', { className: 'linkbtn', textContent: 'It was fine', onclick: async () => { const sm = { ...cur.act.summary, driving: [] }; await sb.from('activities').update({ summary: sm }).eq('id', cur.act.id); cur.act.summary = sm; warn.hidden = true; } }));
  }
  // private notes (owner only)
  const nb = $('actNotes'); nb.hidden = !(mine && cur.act.notes); nb.replaceChildren();
  if (mine && cur.act.notes) nb.append(el('div', { className: 'sec', style: 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em', textContent: 'Private notes · only you see these' }), el('div', { className: 'cbody', textContent: cur.act.notes }));
  renderGallery(cur.media || []);
  renderComments();
});

export async function mediaUrls(list) {
  if (!list.length) return [];
  const { data } = await sb.storage.from('activity-media').createSignedUrls(list.map(m => m.path), 3600);
  return list.map((m, i) => ({ ...m, url: data?.[i]?.signedUrl || null }));
}
async function igFor(d) {
  const photos = (await mediaUrls((d.media || []).filter(m => m.kind === 'photo'))).filter(p => p.url);
  const { data: comp } = await sb.rpc('companions', { aid: d.act.id });
  openIg({ ...d.act, sections: d.sections, track: d.act.summary?.track || null }, photos, comp || [],
    () => openEditor(d, () => { location.hash = '#a/' + d.act.id + '?' + Date.now(); }));
}
async function renderGallery(list) {
  const box = $('mediacard'); box.replaceChildren(); box.hidden = !list.length; if (!list.length) return;
  const items = await mediaUrls(list);
  const grid = el('div', { className: 'gallery' });
  items.forEach(m => {
    const t = m.kind === 'video' ? el('video', { src: m.url, muted: true, playsInline: true, preload: 'metadata' }) : el('img', { src: m.url, alt: '', loading: 'lazy' });
    grid.append(el('button', { className: 'gitem' + (m.kind === 'video' ? ' vid' : ''), type: 'button', onclick: () => lightbox(m) }, t));
  });
  box.append(grid);
}
export function lightbox(m) {
  openModal((body, close) => { body.classList.add('lb'); body.append(m.kind === 'video' ? el('video', { src: m.url, controls: true, autoplay: true, playsInline: true }) : el('img', { src: m.url, alt: '' }), el('div', { className: 'actions' }, el('span'), el('button', { className: 'btn', textContent: 'Close', onclick: close }))); });
}

function gearSelect(kind, value) {
  const s = el('select'), what = kind === 'bike' ? 'bike' : 'shoes';
  const fill = v => { s.replaceChildren(el('option', { value: '', textContent: kind === 'bike' ? 'No bike' : 'No shoes' }));
    state.gear.filter(g => g.kind === kind && (!g.retired || g.id === v)).forEach(g => s.append(el('option', { value: g.id, textContent: g.name + (g.retired ? ' (retired)' : ''), selected: g.id === v })));
    s.append(el('option', { value: '__new', textContent: `+ Add new ${what}…` })); s.dataset.prev = s.value; };
  fill(value); s.dataset.kind = kind; s.refill = fill;
  // "+ Add new…": a name box under the dropdown; the new item is saved straight away and chosen here
  s.addEventListener('change', () => {
    if (s.value !== '__new') { s.dataset.prev = s.value; return; }
    s.value = s.dataset.prev || ''; if (s.nextElementSibling?.classList.contains('gearnew')) { s.nextElementSibling.querySelector('input').focus(); return; }
    const name = el('input', { placeholder: kind === 'bike' ? 'Bike name, e.g. Canyon Aeroad' : 'Shoe name, e.g. Pegasus 41', maxLength: 80 });
    const add = el('button', { className: 'btn sm primary', type: 'button', textContent: 'Add' });
    const no = el('button', { className: 'btn sm', type: 'button', textContent: 'Cancel' });
    const note = el('div', { className: 'note' });
    const box = el('div', { className: 'gearnew' }, el('div', { className: 'gearnewrow' }, name, add, no), note);
    no.onclick = () => box.remove();
    name.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add.click(); } };
    add.onclick = async () => {
      const n = name.value.trim(); if (!n) { note.textContent = 'Give it a name.'; name.focus(); return; }
      const r = await sb.from('gear').insert({ kind, name: n }).select().single();
      if (r.error) { note.textContent = r.error.message; return; }
      await refreshGear();
      // offer it in every dropdown of this kind in the editor, chosen in this one
      document.querySelectorAll('#modalBody select').forEach(o => { if (o.dataset.kind === kind) o.refill(o === s ? r.data.id : o.value); });
      box.remove(); toast(`${n} added. Set its starting distance and defaults on the Gear tab.`, 5000);
    };
    s.after(box); name.focus();
  });
  return s;
}

export function openEditor(data, onSaved) {
  const { act, sections } = data;
  openModal((body, close) => {
    const name = el('input', { value: act.name, maxLength: 120 });
    const desc = el('textarea', { rows: 4, value: act.description || '' });
    const vis = el('select');
    Object.entries(VIS).forEach(([v, t]) => vis.append(el('option', { value: v, textContent: t, selected: act.visibility === v })));
    const notes = el('textarea', { rows: 3, value: act.notes || '', placeholder: 'How it felt, niggles, fuelling, conditions…' });
    const raceCk = el('input', { type: 'checkbox', checked: !!act.is_race });
    const sec1 = el('section', {}, el('label', { className: 'f' }, 'Name', name), el('label', { className: 'f', style: 'margin-top:10px' }, 'Description', desc),
      el('label', { className: 'f', style: 'margin-top:10px' }, 'Private notes (only you)', notes),
      el('label', { className: 'ck' }, raceCk, ' This was a race ', raceFlag(14)));
    // photos and videos
    const mediaSec = el('section', {}, el('h2', { textContent: 'Photos and videos' }));
    const mgrid = el('div', { className: 'gallery small' });
    const fin = el('input', { type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true });
    const addBtn = el('button', { className: 'btn sm', type: 'button', textContent: 'Add photos or videos', onclick: () => fin.click() });
    const mmsg = el('div', { className: 'note' });
    mediaSec.append(mgrid, el('div', { style: 'margin-top:8px' }, addBtn, fin), mmsg);
    let media = (data.media || []).slice();
    const drawMedia = async () => { mgrid.replaceChildren(); for (const m of await mediaUrls(media)) {
      const t = m.kind === 'video' ? el('video', { src: m.url, muted: true, preload: 'metadata' }) : el('img', { src: m.url, alt: '' });
      const rm = el('button', { className: 'gx', type: 'button', textContent: '×', title: 'Remove', onclick: async () => { await sb.storage.from('activity-media').remove([m.path]); await sb.from('activity_media').delete().eq('id', m.id); media = media.filter(x => x.id !== m.id); data.media = media; drawMedia(); } });
      mgrid.append(el('div', { className: 'gitem' }, t, rm)); } };
    drawMedia();
    fin.onchange = async () => { const files = [...fin.files]; fin.value = '';
      for (const f of files) { mmsg.textContent = `Uploading ${f.name}…`;
        try { media.push(await uploadMedia(act, f, media.length)); data.media = media; await drawMedia(); }
        catch (e) { mmsg.textContent = `${f.name}: ${e.message || e}`; continue; } }
      mmsg.textContent = ''; };
    // where it happened: treadmill / track / indoor trainer / pool...
    const typeSec = el('section', {}, el('h2', { textContent: act.sport === 'multi' ? 'Type of each leg' : 'Type' }));
    const typeInputs = [];
    { const real = sections.filter(s => ENVS[s.sport]); const cnt = {}, tot = {}; real.forEach(s => tot[s.sport] = (tot[s.sport] || 0) + 1);
      real.forEach(s => { cnt[s.sport] = (cnt[s.sport] || 0) + 1;
        const sel = el('select'); ENVS[s.sport].forEach(([v, t]) => sel.append(el('option', { value: v, textContent: t, selected: (s.summary?.env || ENVS[s.sport][0][0]) === v })));
        // treadmill: what the machine said, so the watch's distance (and every pace and lap) can be corrected
        const dist = el('input', { type: 'number', min: 0.1, step: 0.01, value: s.distance_m ? U.toD(s.distance_m).toFixed(2) : '', style: 'width:110px' });
        const watch = s.summary?.watchDistance;
        const fixRow = el('label', { className: 'mf', style: 'margin-top:6px' }, 'Treadmill distance', dist, U.dU(), watch ? el('span', { className: 'muted', textContent: ` (watch said ${U.dist(watch)})` }) : null);
        const showFix = () => { fixRow.hidden = sel.value !== 'treadmill'; }; sel.addEventListener('change', showFix); showFix();
        typeInputs.push({ sec: s, sel, dist });
        typeSec.append(el('label', { className: 'f', style: 'margin-top:8px' }, `${SPORTNAME[s.sport]}${tot[s.sport] > 1 ? ' ' + cnt[s.sport] : ''}${s.distance_m ? ` · ${U.dist(s.distance_m)}` : ''}`, sel), fixRow); });
      if (!real.length) typeSec.hidden = true;
      typeSec.append(el('div', { className: 'note', textContent: 'Track snaps your GPS onto the 400 m track and measures the distance round lane 1. For a treadmill run, enter the distance the treadmill showed: the leg’s pace, laps and stride are rescaled to match. Treadmill and indoor rides don’t count towards distance bests (power bests still count).' })); }
    // gear
    const gearSec = el('section', {}, el('h2', { textContent: 'Gear' }));
    const gearInputs = [];
    if (act.sport === 'multi') {
      const real = sections.filter(s => s.sport === 'run' || s.sport === 'bike');
      let n = { run: 0, bike: 0 };
      const total = { run: real.filter(s => s.sport === 'run').length, bike: real.filter(s => s.sport === 'bike').length };
      real.forEach(s => { n[s.sport]++; const sel = gearSelect(s.sport === 'run' ? 'shoe' : 'bike', s.gear_id);
        gearInputs.push({ sec: s, sel }); gearSec.append(el('label', { className: 'f', style: 'margin-top:8px' }, `${SPORTNAME[s.sport]}${total[s.sport] > 1 ? ' ' + n[s.sport] : ''} · ${U.dist(s.distance_m)}`, sel)); });
    } else if (act.sport === 'run' || act.sport === 'bike') {
      const sel = gearSelect(act.sport === 'run' ? 'shoe' : 'bike', act.gear_id); gearInputs.push({ sec: null, sel });
      gearSec.append(el('label', { className: 'f', style: 'margin-top:8px' }, act.sport === 'run' ? 'Shoes' : 'Bike', sel));
    } else gearSec.append(el('div', { className: 'note', textContent: 'Gear can be assigned to runs and rides.' }));
    // sharing
    const shareSec = el('section', {}, el('h2', { textContent: 'Who can see it' }), el('label', { className: 'f', style: 'margin-top:8px' }, 'Visible to', vis));
    const boxes = {};
    const grid = el('div', { className: 'checks' });
    SHARE.forEach(([k, t]) => { const c = el('input', { type: 'checkbox', checked: act.share?.[k] !== false }); boxes[k] = c; grid.append(el('label', { className: 'chk' }, c, ' ' + t)); });
    shareSec.append(el('div', { className: 'note', textContent: 'Data shown to other people. You always see everything.' }), grid);
    // actions
    const msg = el('div', { className: 'note' });
    const del = el('button', { className: 'btn', textContent: 'Delete activity', type: 'button' });
    const save = el('button', { className: 'btn primary', textContent: 'Save', type: 'button' });
    const cancel = el('button', { className: 'btn', textContent: 'Cancel', type: 'button', onclick: close });
    // Save and Cancel pinned to the top of the sheet; Delete stays at the bottom, away from Save
    body.append(el('div', { className: 'edbar' }, el('h3', { textContent: 'Edit activity' }), el('div', { className: 'edbtns' }, cancel, save)), msg,
      sec1, typeSec, mediaSec, gearSec, shareSec, el('div', { className: 'delrow' }, del));

    save.onclick = async () => {
      save.disabled = true; msg.textContent = 'Saving…';
      const share = Object.fromEntries(SHARE.map(([k]) => [k, boxes[k].checked]));
      const upd = { name: name.value.trim() || act.name, description: desc.value.trim() || null, notes: notes.value.trim() || null, visibility: vis.value, share };
      const single = gearInputs.find(g => !g.sec); if (single) upd.gear_id = (single.sel.value !== '__new' && single.sel.value) || null;
      const r = await sb.from('activities').update(upd).eq('id', act.id);
      if (r.error) { msg.textContent = r.error.message; save.disabled = false; return; }
      for (const g of gearInputs.filter(g => g.sec)) {
        const v = (g.sel.value !== '__new' && g.sel.value) || null; if (v === g.sec.gear_id) continue;
        const q = await sb.from('activity_sections').update({ gear_id: v }).eq('activity_id', act.id).eq('idx', g.sec.idx); if (q.error) { msg.textContent = q.error.message; save.disabled = false; return; }
        g.sec.gear_id = v;
      }
      if (raceCk.checked !== !!act.is_race) await setRace(data, raceCk.checked);
      // type changes: uploaded files are re-processed (track snapping, bests); manual entries just store it
      const changed = typeInputs.filter(t => t.sel.value !== (t.sec.summary?.env || ENVS[t.sec.sport][0][0]));
      // treadmill distances that differ from what's stored (10 m tolerance)
      const fixes = typeInputs.filter(t => t.sel.value === 'treadmill' && +t.dist.value > 0 && Math.abs(U.fromD(t.dist.value) - (+t.sec.distance_m || 0)) > 10);
      if (changed.length || fixes.length) {
        if (act.file_path) {
          msg.textContent = fixes.length ? 'Correcting the treadmill distance…' : 'Re-processing with the new type…';
          const env = sections.map(s => { const t = typeInputs.find(x => x.sec === s); return t ? t.sel.value : (s.summary?.env || null); });
          const distFix = { ...(act.summary?.distFix || {}) };
          // stored as a factor of the watch's distance, so it still holds if the run is trimmed later
          fixes.forEach(t => { distFix[t.sec.idx] = +(U.fromD(t.dist.value) / (+t.sec.summary?.watchDistance || +t.sec.distance_m)).toFixed(5); });
          try { await reprocess({ act: { ...act, ...upd }, sections }, { env, distFix }); }
          catch (e) { msg.textContent = 'Saved, but the type could not be applied: ' + (e.message || e); save.disabled = false; return; }
        } else {
          for (const t of new Set([...changed, ...fixes])) { const d = fixes.includes(t) ? Math.round(U.fromD(t.dist.value)) : null;
            const q = await sb.from('activity_sections').update({ summary: { ...(t.sec.summary || {}), env: t.sel.value },
              ...(d ? { distance_m: d, avg_speed: +(d / (+t.sec.elapsed_s || 1)).toFixed(3) } : {}) }).eq('activity_id', act.id).eq('idx', t.sec.idx);
            if (q.error) { msg.textContent = q.error.message; save.disabled = false; return; }
            if (d) t.sec.distance_m = d; }
          if (fixes.length) await sb.from('activities').update({ distance_m: sections.reduce((p, s) => p + (+s.distance_m || 0), 0) }).eq('id', act.id);
          const envs = sections.map(s => { const t = typeInputs.find(x => x.sec === s); return t ? t.sel.value : s.summary?.env; }).filter(Boolean);
          await sb.from('activities').update({ indoor: envs.length > 0 && envs.every(e => INDOOR.has(e)) }).eq('id', act.id);
        }
      }
      // a new type can mean different default gear (track spikes, treadmill shoes, the turbo bike)
      for (const t of typeInputs) {
        const sp = t.sec.sport, oldEnv = t.sec.summary?.env, newEnv = t.sel.value; if (oldEnv === newEnv) continue;
        const was = pickGear(sp, oldEnv, !!act.is_race, dayOf(act)), now = pickGear(sp, newEnv, !!act.is_race, dayOf(act)); if (!now || now === was) continue;
        if (act.sport === sp) { const gi = single?.sel.value || null; if (!gi || gi === was) { await sb.from('activities').update({ gear_id: now }).eq('id', act.id); } }
        else if (!t.sec.gear_id || t.sec.gear_id === was) await sb.from('activity_sections').update({ gear_id: now }).eq('activity_id', act.id).eq('idx', t.sec.idx);
      }
      // the shared copy of the data is rebuilt whenever sharing choices change
      if (JSON.stringify(share) !== JSON.stringify(act.share) && data.streams && act.streams_path) {
        const blob = new Blob([JSON.stringify(shareStreams(data.streams, share))], { type: 'application/json' });
        const u = await sb.storage.from('activity-streams').upload(act.streams_path, blob, { upsert: true });
        if (u.error) { msg.textContent = 'Saved, but the shared copy could not be updated: ' + u.error.message; }
      }
      Object.assign(act, upd);
      await refreshActs([act.id]); close(); toast('Activity saved'); onSaved && onSaved();
    };
    del.onclick = () => {
      if (del.dataset.armed) return doDelete();
      del.dataset.armed = '1'; del.textContent = 'Click again to delete for good'; del.style.borderColor = 'var(--warn)';
      setTimeout(() => { delete del.dataset.armed; del.textContent = 'Delete activity'; del.style.borderColor = ''; }, 4000);
    };
    async function doDelete() {
      del.disabled = true; msg.textContent = 'Deleting…';
      const files = [act.streams_path, act.streams_path?.replace(/\.json$/, '.full.json')].filter(Boolean);
      if ((data.media || []).length) await sb.storage.from('activity-media').remove(data.media.map(m => m.path));
      if (files.length) await sb.storage.from('activity-streams').remove(files);
      if (act.file_path) await sb.storage.from('activity-files').remove([act.file_path]);
      if (act.summary?.linked) await sb.storage.from('activity-files').remove(act.summary.linked.parts.map(p => p.file_path));
      const r = await sb.from('activities').delete().eq('id', act.id);
      if (r.error) { msg.textContent = r.error.message; del.disabled = false; return; }
      await refreshActs([], [act.id]); close(); toast('Activity deleted'); location.hash = '#log';
    }
  });
}

// ---------- comments ----------
async function renderComments() {
  const box = $('comments'); if (!box) return; box.replaceChildren(el('h2', { textContent: 'Comments' }));
  const { act } = cur;
  const r = await sb.from('comments').select('*').eq('activity_id', act.id).order('created_at');
  const list = r.data || [];
  const ids = [...new Set(list.map(c => c.author))];
  const names = {};
  if (ids.length) { const p = await sb.from('profiles').select('id,display_name').in('id', ids); (p.data || []).forEach(x => names[x.id] = x.display_name); }
  const ul = el('div', { className: 'clist' });
  if (!list.length) ul.append(el('div', { className: 'note', textContent: 'No comments yet.' }));
  list.forEach(c => {
    const when = new Date(c.created_at);
    const row = el('div', { className: 'crow' }, el('b', { textContent: names[c.author] || 'Athlete' }), el('span', { className: 'muted', textContent: ' · ' + when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) }), el('div', { className: 'cbody', textContent: c.body }));
    if (c.author === state.user.id || act.owner === state.user.id) row.append(el('button', { className: 'linkbtn', textContent: 'Delete', onclick: async () => { await sb.from('comments').delete().eq('id', c.id); renderComments(); } }));
    ul.append(row);
  });
  const inp = el('textarea', { rows: 2, placeholder: 'Add a comment', maxLength: 2000 });
  const go = el('button', { className: 'btn sm primary', textContent: 'Post', type: 'button' });
  go.onclick = async () => { const body = inp.value.trim(); if (!body) return; go.disabled = true;
    const q = await sb.from('comments').insert({ activity_id: act.id, body }); go.disabled = false;
    if (q.error) { toast(q.error.message); return; } renderComments(); };
  box.append(ul, el('div', { className: 'cform' }, inp, go));
}

// photos are resized to 2048 px JPEG; videos up to 50 MB go up as they are
async function uploadMedia(act, f, position) {
  const isVid = f.type.startsWith('video/'), isImg = f.type.startsWith('image/');
  if (!isVid && !isImg) throw new Error('not a photo or video');
  let blob = f, ext = (f.name.split('.').pop() || 'bin').toLowerCase(), w = null, h = null, dur = null;
  if (isImg) {
    const bmp = await createImageBitmap(f).catch(() => null);
    if (bmp) { const k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height)); w = Math.round(bmp.width * k); h = Math.round(bmp.height * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86)); ext = 'jpg'; }
  } else {
    if (f.size > 50 * 1024 * 1024) throw new Error('videos must be under 50 MB');
    await new Promise(res => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => { w = v.videoWidth; h = v.videoHeight; dur = v.duration; URL.revokeObjectURL(v.src); res(); }; v.onerror = res; v.src = URL.createObjectURL(f); });
  }
  const path = `${state.user.id}/${act.id}/${crypto.randomUUID()}.${ext}`;
  const up = await sb.storage.from('activity-media').upload(path, blob, { contentType: isImg ? 'image/jpeg' : f.type });
  if (up.error) throw up.error;
  const r = await sb.from('activity_media').insert({ activity_id: act.id, path, kind: isVid ? 'video' : 'photo', width: w, height: h, duration_s: dur, position }).select('*').single();
  if (r.error) throw r.error;
  return r.data;
}

// ---------- link separate activities into one multisport activity ----------
const LEG = { run: 'Run', bike: 'Bike', swim: 'Swim', multi: 'Multisport', other: 'Workout' };
const hm = t => { const d = new Date(t); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const fmtGap = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
function openLinker(data) {
  const me = data.act, t0 = Date.parse(me.start_time);
  // candidates: your file-based, unlinked activities within 12 hours either side
  const cands = state.activities.filter(a => a.source !== 'manual' && !a.summary?.linked && Math.abs(Date.parse(a.start_time) - t0) < 12 * 3600e3)
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
  const chosen = new Set([me.id]);
  // pre-tick neighbours that follow on within 30 minutes (a typical brick or race)
  const endOf = a => Date.parse(a.start_time) + (+a.elapsed_s || 0) * 1000;
  let i = cands.findIndex(a => a.id === me.id);
  for (let j = i + 1; j < cands.length && chosen.size < 5 && Date.parse(cands[j].start_time) - endOf(cands[j - 1]) < 30 * 60e3; j++) chosen.add(cands[j].id);
  for (let j = i - 1; j >= 0 && chosen.size < 5 && Date.parse(cands[j + 1].start_time) - endOf(cands[j]) < 30 * 60e3; j--) chosen.add(cands[j].id);
  openModal((body, close) => {
    body.append(el('h3', { textContent: 'Link activities' }), el('p', { className: 'sec', style: 'margin-top:0', textContent: 'Join up to 5 separate activities into one multisport activity. The gap between one finishing and the next starting becomes a transition.' }));
    const list = el('div', { className: 'linklist' }), prev = el('div', { className: 'linkprev' }), msg = el('div', { className: 'note' });
    const go = el('button', { className: 'btn primary', type: 'button' });
    const local = a => Date.parse(a.start_time) + (a.utc_offset_min || 0) * 60000;
    const draw = () => {
      list.replaceChildren();
      cands.forEach(a => {
        const ck = el('input', { type: 'checkbox', checked: chosen.has(a.id), disabled: a.id === me.id || (!chosen.has(a.id) && chosen.size >= 5) });
        ck.onchange = () => { ck.checked ? chosen.add(a.id) : chosen.delete(a.id); draw(); };
        list.append(el('label', { className: 'linkrow' + (chosen.has(a.id) ? ' on' : '') }, ck,
          el('span', { className: 'lt', textContent: `${hm(local(a))}–${hm(local(a) + (+a.elapsed_s || 0) * 1000)}` }),
          el('b', { textContent: a.name }), el('span', { className: 'muted', textContent: `${LEG[a.sport] || a.sport} · ${U.dist(a.distance_m)}` })));
      });
      if (cands.length < 2) list.append(el('div', { className: 'note', textContent: 'No other activities within 12 hours of this one. Upload the other legs first.' }));
      // preview of the joined activity
      const sel = cands.filter(a => chosen.has(a.id)); prev.replaceChildren(); let bad = null;
      sel.forEach((a, k) => {
        if (k) { const gap = (Date.parse(a.start_time) - endOf(sel[k - 1])) / 1000;
          if (gap < -5) bad = `${sel[k - 1].name} and ${a.name} overlap in time.`;
          prev.append(el('span', { className: 'lgap' + (gap > 1800 ? ' long' : ''), textContent: gap > 1 ? `T ${fmtGap(gap)}` : 'no gap' })); }
        prev.append(el('span', { className: 'lleg', style: `border-color:var(--${a.sport === 'bike' ? 'bike' : a.sport === 'swim' ? 'swim' : 'run'})`, textContent: `${LEG[a.sport] || a.sport} ${U.dist(a.distance_m, 1)}` }));
      });
      const longGap = sel.some((a, k) => k && (Date.parse(a.start_time) - endOf(sel[k - 1])) > 1800e3);
      msg.textContent = bad || (longGap ? 'One gap is over 30 minutes: it will still count as transition time.' : '');
      go.textContent = sel.length < 2 ? 'Pick another activity' : `Link ${sel.length} activities`;
      go.disabled = sel.length < 2 || !!bad;
    };
    draw();
    body.append(list, el('div', { className: 'sec wtitle', textContent: 'Joined activity' }), prev, msg,
      el('div', { className: 'note', textContent: 'Photos move across. Comments and kudos on the separate activities aren’t carried over. You can unlink again later.' }),
      el('div', { className: 'actions', style: 'justify-content:flex-end' }, el('button', { className: 'btn', type: 'button', textContent: 'Cancel', onclick: close }), go));
    go.onclick = async () => {
      go.disabled = true; msg.textContent = 'Linking…';
      try { const r = await linkIds([...chosen]); close(); toast(`Linked into ${r.activity.name}`); location.hash = '#a/' + r.id; }
      catch (e) { msg.textContent = 'Could not link: ' + (e.message || e); go.disabled = false; }
    };
  });
}
async function linkIds(ids) {
  const [{ data: acts, error: e1 }, { data: secs, error: e2 }] = await Promise.all([sb.from('activities').select('*').in('id', ids), sb.from('activity_sections').select('*').in('activity_id', ids)]);
  if (e1 || e2) throw (e1 || e2);
  const parts = await Promise.all(acts.map(async a => {
    const dl = await sb.storage.from('activity-files').download(a.file_path); if (dl.error) throw dl.error;
    return { act: a, sections: (secs || []).filter(s => s.activity_id === a.id).sort((p, q) => p.idx - q.idx), messages: decodeFit(new Uint8Array(await dl.data.arrayBuffer())).messages };
  }));
  const r = await linkActivities(sb, { uid: state.user.id, parts, profile: state.profile, gear: state.gear });
  await refreshActs([r.id], ids);
  return r;
}
// after an upload: separate files that follow on from each other within 10 minutes
export function offerCombine(groups) {
  const g = groups[0], rest = groups.slice(1);
  const acts = g.map(x => state.activities.find(a => a.id === x.id)).filter(Boolean);
  if (acts.length < 2) { if (rest.length) offerCombine(rest); return; }
  openModal((body, close) => {
    const prev = el('div', { className: 'linkprev' });
    acts.forEach((a, k) => {
      if (k) { const gap = (Date.parse(a.start_time) - Date.parse(acts[k - 1].start_time) - (+acts[k - 1].elapsed_s || 0) * 1000) / 1000;
        prev.append(el('span', { className: 'lgap', textContent: gap > 1 ? `T ${fmtGap(gap)}` : 'no gap' })); }
      prev.append(el('span', { className: 'lleg', style: `border-color:var(--${a.sport === 'bike' ? 'bike' : a.sport === 'swim' ? 'swim' : 'run'})`, textContent: `${LEG[a.sport] || a.sport} ${U.dist(a.distance_m, 1)}` }));
    });
    const msg = el('div', { className: 'note' });
    const yes = el('button', { className: 'btn primary', type: 'button', textContent: 'Combine into one' });
    const next = () => { close(); if (rest.length) setTimeout(() => offerCombine(rest), 150); };
    body.append(el('h3', { textContent: 'Combine these into one activity?' }),
      el('p', { className: 'sec', style: 'margin-top:0', textContent: `These ${acts.length} activities follow straight on from each other. If they were one race or brick session, Triven can join them into a single multisport activity with the gaps counted as transitions.` }),
      prev, msg, el('div', { className: 'actions', style: 'justify-content:flex-end' }, el('button', { className: 'btn', type: 'button', textContent: 'Keep separate', onclick: next }), yes));
    yes.onclick = async () => {
      yes.disabled = true; msg.textContent = 'Combining…';
      try { const r = await linkIds(acts.map(a => a.id)); toast(`Combined into ${r.activity.name}`); if (!rest.length) location.hash = '#a/' + r.id; next(); }
      catch (e) { msg.textContent = 'Could not combine: ' + (e.message || e); yes.disabled = false; }
    };
  });
}
function unlinkButton(data) {
  const b = el('button', { className: 'btn sm', type: 'button', textContent: 'Unlink', title: `Split back into the ${data.act.summary.linked.parts.length} original activities` });
  b.onclick = async () => {
    if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = `Split into ${data.act.summary.linked.parts.length}?`; return; }
    b.disabled = true; b.textContent = 'Splitting…';
    try {
      const { act } = data, parts = act.summary.linked.parts;
      const raws = await Promise.all(parts.map(async p => { const dl = await sb.storage.from('activity-files').download(p.file_path); if (dl.error) throw dl.error; return new Uint8Array(await dl.data.arrayBuffer()); }));
      // the joined activity goes first, so its parts aren't seen as duplicates
      const { data: media } = await sb.from('activity_media').select('id').eq('activity_id', act.id);
      const tmp = await sb.from('activities').update({ summary: { ...act.summary, linked: { ...act.summary.linked, sourceIds: [] } } }).eq('id', act.id); if (tmp.error) throw tmp.error;
      const ids = [];
      for (let k = 0; k < parts.length; k++) {
        const { messages, errors } = decodeFit(raws[k]);
        const r = await importDecoded(sb, { uid: state.user.id, messages, errors, raw: raws[k], source: parts[k].source || 'upload', profile: state.profile, gear: state.gear });
        if (r.id) ids.push(r.id);
      }
      if (media?.length && ids[0]) await sb.from('activity_media').update({ activity_id: ids[0] }).eq('activity_id', act.id);
      if (act.streams_path) await sb.storage.from('activity-streams').remove([act.streams_path, act.streams_path.replace(/\.json$/, '.full.json')]);
      await sb.from('activities').delete().eq('id', act.id);
      // the restored copies were re-uploaded under new names: drop the old part files
      await sb.storage.from('activity-files').remove(parts.map(p => p.file_path));
      await refreshActs(ids, [act.id]); toast(`Split into ${ids.length} activities`); location.hash = ids[0] ? '#a/' + ids[0] : '#log';
    } catch (e) { toast('Could not unlink: ' + (e.message || e)); b.disabled = false; b.textContent = 'Unlink'; }
  };
  return b;
}
