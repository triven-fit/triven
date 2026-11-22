// One-tap Instagram image: route over a map (or your photo, or transparent sticker), activity type, title and stats.
import { drawRouteMap } from './mapcanvas.js?v=1795310749';
import { envLabel } from './process.js?v=1795310749';
import { mainDevice } from './garmin.js?v=1795310749';
import * as U from './units.js?v=1795310749';
import { openModal } from './edit.js?v=1795310749';
import { toast } from './main.js?v=1795310749';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => e.append(k)); return e; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SPORTCOL = { run: '#22a05a', bike: '#3987e5', swim: '#9085e9', transition: '#8d959a' };
const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const pace = (t, m) => { const p = t / (m / 1000); return `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, '0')}`; };
const SIZES = { post: [1080, 1350], story: [1080, 1920] };

function labelFor(a) {
  if (a.sport === 'multi') { const p = a.multisport_profile === 'other' ? 'Multisport' : a.multisport_profile[0].toUpperCase() + a.multisport_profile.slice(1);
    const legs = (a.sections || []).filter(s => s.sport !== 'transition').map(s => envLabel(s.sport, s.summary?.env ?? s.env).replace(/\bride\b/i, m => m[0] === 'R' ? 'Bike' : 'bike').replace(/^Run$/, 'Run'));
    return `${p} · ${legs.join(' · ')}`; }
  const s0 = (a.sections || []).find(s => s.sport !== 'transition');
  return envLabel(a.sport, s0?.summary?.env ?? s0?.env);
}
function stats(a) {
  const t = a.sport === 'multi' ? +a.elapsed_s : +(a.moving_s || a.elapsed_s), d = +a.distance_m;
  const out = [[U.toD(d).toFixed(U.toD(d) >= 100 ? 0 : 2), U.dU()], [fmtDur(t), 'time']];
  if (a.sport === 'run') out.push([U.mmss(U.paceS(t, d)), U.pU()]);
  else if (a.sport === 'bike') out.push([U.kmhTo(d / t * 3.6).toFixed(1), U.sU()]);
  else if (a.sport === 'swim') out.push([pace(t, d * 10), '/100 m']);
  else if (a.ascent_m) out.push([Math.round(U.toE(a.ascent_m)), U.eU() + ' up']);
  if (a.sport !== 'multi' && a.ascent_m && out.length < 4 && a.sport !== 'swim') out.push([Math.round(a.ascent_m), 'm up']);
  return out;
}
function wrap(ctx, text, maxW, maxLines) {
  const words = text.split(/\s+/), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; let l = lines[maxLines - 1]; while (ctx.measureText(l + '…').width > maxW && l.length) l = l.slice(0, -1); lines[maxLines - 1] = l + '…'; }
  return lines;
}
function loadImage(src) { return new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

export async function renderIg(a, { style = 'map', size = 'post', photoUrl = null, withLine = '' } = {}) {
  await Promise.all([document.fonts.load('700 80px "Barlow Semi Condensed"'), document.fonts.load('600 40px "Barlow Semi Condensed"'), document.fonts.load('500 30px Inter')]).catch(() => {});
  const [W, H] = SIZES[size];
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  const sticker = style === 'sticker';
  const sectionSports = (a.sections || []).map(s => s.sport);
  const textCol = '#f3f5f4', subCol = 'rgba(243,245,244,.75)';
  const shadow = on => { ctx.shadowColor = on ? 'rgba(0,0,0,.6)' : 'transparent'; ctx.shadowBlur = on ? 18 : 0; };
  const bottomH = size === 'story' ? 640 : 520;
  if (style === 'map') {
    await drawRouteMap(ctx, a.track, 0, 0, W, H, { dark: true, pad: 120, sectionSports, width: 9, dim: 0.15 });
  } else if (style === 'photo' && photoUrl) {
    const img = await loadImage(photoUrl);
    if (img) { const s = Math.max(W / img.width, H / img.height); ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s); }
    else { ctx.fillStyle = '#1b1e20'; ctx.fillRect(0, 0, W, H); }
  }
  if (!sticker) {
    // darken top and bottom so text reads over any background
    let g = ctx.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, 'rgba(10,12,13,.75)'); g.addColorStop(1, 'rgba(10,12,13,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 300);
    g = ctx.createLinearGradient(0, H - bottomH - 160, 0, H); g.addColorStop(0, 'rgba(10,12,13,0)'); g.addColorStop(0.35, 'rgba(10,12,13,.82)'); g.addColorStop(1, 'rgba(10,12,13,.95)'); ctx.fillStyle = g; ctx.fillRect(0, H - bottomH - 160, W, bottomH + 160);
  }
  // route in a corner box for photo and sticker styles
  if (style === 'photo' && a.track) {
    // small route panel, top right, over the photo
    const tmp = document.createElement('canvas'); tmp.width = 320; tmp.height = 320;
    await drawRouteMap(tmp.getContext('2d'), a.track, 0, 0, 320, 320, { tiles: false, pad: 24, sectionSports, width: 7, glow: true, dark: true });
    ctx.save(); ctx.globalAlpha = 0.92; ctx.beginPath(); ctx.roundRect(W - 400, 160, 320, 320, 24); ctx.clip(); ctx.drawImage(tmp, W - 400, 160); ctx.restore();
  }
  // sticker: the map drawer paints a background; clear it back to transparent except the line
  if (sticker) {
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const x2 = c2.getContext('2d');
    const box = [90, 230, W - 180, size === 'story' ? 900 : 560];
    await drawRouteMap(x2, a.track, ...box, { tiles: false, pad: 20, sectionSports, width: 10, glow: true, dark: true });
    // keep only line pixels (background colour #1b1e20 -> transparent)
    const id = x2.getImageData(0, 0, W, H), d = id.data;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 27) < 4 && Math.abs(d[i + 1] - 30) < 4 && Math.abs(d[i + 2] - 32) < 4) d[i + 3] = 0;
    ctx.clearRect(0, 0, W, H); ctx.putImageData(id, 0, 0);
  }
  // brand
  shadow(sticker);
  ctx.fillStyle = textCol; ctx.font = '700 46px "Barlow Semi Condensed"'; ctx.textBaseline = 'alphabetic';
  let bx = 70; const by = 112;
  for (const ch of 'TRIVEN') { ctx.fillStyle = ch === 'V' ? '#4fd081' : textCol; ctx.fillText(ch, bx, by); bx += ctx.measureText(ch).width + 6; }
  ctx.fillStyle = '#4fd081'; ctx.font = '600 46px "Barlow Semi Condensed"'; ctx.fillText('.fit', bx - 2, by);
  // type pill
  const pill = ((a.is_race ? 'Race · ' : '') + labelFor(a)).toUpperCase();
  ctx.font = '600 28px Inter'; const pw = ctx.measureText(pill).width + 44;
  const py = H - bottomH + 40;
  shadow(false);
  ctx.fillStyle = 'rgba(79,208,129,.18)'; ctx.strokeStyle = '#4fd081'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(70, py, pw, 54, 27); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#4fd081'; ctx.fillText(pill, 92, py + 37);
  // title and date
  shadow(sticker);
  ctx.fillStyle = textCol; ctx.font = '700 84px "Barlow Semi Condensed"';
  const lines = wrap(ctx, a.name, W - 140, 2);
  let ty = py + 140; lines.forEach(l => { ctx.fillText(l, 70, ty); ty += 86; });
  const dt = new Date(Date.parse(a.start_time) + a.utc_offset_min * 60000);
  ctx.font = '500 30px Inter'; ctx.fillStyle = subCol;
  const day = withLine ? `${WD[dt.getUTCDay()].slice(0, 3)} ${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}` : `${WD[dt.getUTCDay()]} ${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
  ctx.fillText(day, 70, ty - 30);
  if (withLine) { const dw = ctx.measureText(day + '  ·  ').width; ctx.fillStyle = '#4fd081'; ctx.font = '600 30px Inter';
    ctx.fillText(wrap(ctx, withLine, W - 140 - dw, 1)[0], 70 + dw, ty - 30); ctx.fillStyle = subCol; ctx.font = '500 30px Inter'; ctx.fillText('·', 70 + ctx.measureText(day + '  ').width, ty - 30); }
  // stats row
  const st = stats(a), colW = (W - 140) / st.length, sy = H - 90;
  st.forEach(([v, u], i) => { const x = 70 + i * colW;
    ctx.fillStyle = textCol; ctx.font = '700 72px "Barlow Semi Condensed"'; ctx.fillText(String(v), x, sy - 34);
    ctx.fillStyle = subCol; ctx.font = '500 28px Inter'; ctx.fillText(u, x, sy + 4); });
  // recording device, bottom right: Garmin's guidelines need "Garmin <model>" on every shared image of Garmin data
  const dev = mainDevice(a.device);
  if (dev) { ctx.save(); ctx.fillStyle = subCol; ctx.font = '500 24px Inter'; ctx.textAlign = 'right'; ctx.fillText(dev, W - 70, H - 36); ctx.restore(); }
  // multisport: section bar with times
  if (a.sport === 'multi' && a.sections?.length) {
    shadow(false);
    const barY = sy - 150, total = a.sections.reduce((p, s) => p + Math.max(+s.elapsed_s, 30), 0); let x = 70;
    a.sections.forEach(s => { const w = (W - 140) * Math.max(+s.elapsed_s, 30) / total - 4; ctx.fillStyle = SPORTCOL[s.sport] || '#8d959a'; ctx.beginPath(); ctx.roundRect(x, barY, Math.max(4, w), 14, 7); ctx.fill();
      if (s.sport !== 'transition' && w > 110) { ctx.fillStyle = subCol; ctx.font = '500 24px Inter'; ctx.fillText(fmtDur(+s.elapsed_s), x, barY - 12); }
      x += w + 4; });
  }
  shadow(false);
  return c;
}

const VERB = { run: 'Ran', bike: 'Rode', swim: 'Swam', multi: 'Raced' };
export function withText(a, comp) {
  const seen = new Set(), names = [];
  for (const c of comp || []) { if (seen.has(c.owner)) continue; seen.add(c.owner); names.push((c.athlete || 'a club mate').trim().split(/\s+/)[0]); }
  if (!names.length) return '';
  const list = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} & ${names[1]}` : names.length === 3 ? `${names[0]}, ${names[1]} & ${names[2]}` : `${names[0]}, ${names[1]} & ${names.length - 2} others`;
  return `${VERB[a.sport] || 'Trained'} with ${list}`;
}
export function openIg(a, photos = [], companions = [], onAddPhotos = null) {
  openModal(async (body, close) => {
    body.append(el('h3', { textContent: 'Instagram post' }));
    const wl = withText(a, companions);
    const opts = { style: a.track ? 'map' : (photos.length ? 'photo' : 'sticker'), size: 'post', photoUrl: photos[0]?.url || null, withLine: wl };
    const row = el('div', { className: 'segrow' });
    const press = (key, b) => row.querySelectorAll(`[data-k=${key}]`).forEach(x => x.setAttribute('aria-pressed', x === b));
    const mk = (key, val, label, disabled) => { const b = el('button', { className: 'chip', type: 'button', textContent: label, disabled }); b.setAttribute('aria-pressed', opts[key] === val); b.onclick = () => { opts[key] = val; press(key, b); draw(); }; b.dataset.k = key; return b; };
    const photoChip = mk('style', 'photo', 'My photo');
    photoChip.onclick = () => { if (!opts.photoUrl) { askPhoto(); return; } opts.style = 'photo'; press('style', photoChip); thumbs.hidden = photos.length < 2; draw(); };
    row.append(mk('style', 'map', 'Map', !a.track), photoChip, mk('style', 'sticker', 'Transparent sticker'), el('span', { style: 'width:14px' }), mk('size', 'post', 'Post 4:5'), mk('size', 'story', 'Story 9:16'));
    row.querySelectorAll('[data-k=style]').forEach(b => { if (b !== photoChip) b.addEventListener('click', () => { thumbs.hidden = true; }); });
    if (wl) { const t = el('button', { className: 'chip', type: 'button', textContent: wl }); t.setAttribute('aria-pressed', 'true');
      t.onclick = () => { opts.withLine = opts.withLine ? '' : wl; t.setAttribute('aria-pressed', !!opts.withLine); draw(); }; row.append(el('span', { style: 'width:14px' }), t); }
    // pick which photo when there are several
    const thumbs = el('div', { className: 'igthumbs', hidden: !(opts.style === 'photo' && photos.length > 1) });
    const addThumb = url => { const b = el('button', { type: 'button', className: 'igthumb' }, el('img', { src: url, alt: '' }));
      b.setAttribute('aria-pressed', url === opts.photoUrl); b.onclick = () => { opts.photoUrl = url; thumbs.querySelectorAll('.igthumb').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); }; thumbs.append(b); };
    photos.forEach(p => addThumb(p.url));
    // no photo on the activity: say so, offer one from the device (used for this image only) or adding to the activity
    const pick = el('input', { type: 'file', accept: 'image/*', hidden: true });
    pick.onchange = () => { const f = pick.files[0]; if (!f) return; const url = URL.createObjectURL(f); photos.push({ url }); addThumb(url);
      opts.photoUrl = url; opts.style = 'photo'; press('style', photoChip); thumbs.hidden = photos.length < 2; pop.hidden = true; draw(); };
    const pop = el('div', { className: 'igpop', hidden: true },
      el('b', { textContent: 'No photos on this activity yet' }),
      el('div', { className: 'note', textContent: 'Pick one from this device just for this image, or add photos to the activity so they show in the feed too.' }),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px' },
        el('button', { className: 'btn sm primary', type: 'button', textContent: 'Choose a photo', onclick: () => pick.click() }),
        onAddPhotos ? el('button', { className: 'btn sm', type: 'button', textContent: 'Add photos to activity', onclick: () => { close(); onAddPhotos(); } }) : '',
        el('button', { className: 'btn sm', type: 'button', textContent: 'Cancel', onclick: () => { pop.hidden = true; } })));
    const askPhoto = () => { pop.hidden = false; };
    const prev = el('div', { className: 'igprev' }, el('div', { className: 'note', textContent: 'Drawing…' }));
    const share = el('button', { className: 'btn primary', type: 'button', textContent: 'Share' });
    const dl = el('a', { className: 'btn', textContent: 'Download', style: 'text-decoration:none' });
    const note = el('div', { className: 'note', textContent: 'On your phone, Share opens the share sheet: pick Instagram. On a computer, download it and post from your phone.' });
    body.append(row, thumbs, pop, pick, prev, el('div', { className: 'actions' }, el('button', { className: 'btn', type: 'button', textContent: 'Close', onclick: close }), el('div', { style: 'display:flex;gap:8px' }, dl, share)), note);
    let file = null, seq = 0;
    async function draw() {
      const my = ++seq; prev.replaceChildren(el('div', { className: 'note', textContent: 'Drawing…' }));
      const c = await renderIg(a, opts); if (my !== seq) return;
      c.className = 'igcanvas'; prev.replaceChildren(c);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const name = `triven-${a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
      file = new File([blob], name, { type: 'image/png' });
      if (dl.href) URL.revokeObjectURL(dl.href); dl.href = URL.createObjectURL(blob); dl.download = name;
      share.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    }
    share.onclick = async () => { if (!file) return; try { await navigator.share({ files: [file], title: a.name }); } catch (e) { if (e.name !== 'AbortError') toast('Sharing failed: download it instead'); } };
    draw();
  });
}
