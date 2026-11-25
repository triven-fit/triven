// Pull to refresh on touch screens: drag down from the top of a page to check for new activities and redraw the page.
// No indicator while pulling; "Syncing…" shows once released past the threshold.
// The installed app on iPhone has no browser refresh gesture, so this stands in for it.
import { state, toast } from './main.js?v=1795590613';
import { syncNow } from './sync.js?v=1795590613';
import { refreshNotifications } from './notify.js?v=1795590613';

const TRIGGER = 70, MAX = 110;
let startY = null, startX = 0, dist = 0, active = false, running = false;
const ind = Object.assign(document.createElement('div'), { id: 'pullInd', className: 'pullind', ariaHidden: 'true' });
ind.innerHTML = '<svg class="pullico" viewBox="0 0 40 40" width="34" height="34"><circle cx="20" cy="20" r="15" fill="none" stroke="#e4e8e9" stroke-width="4"/><circle class="pa" cx="20" cy="20" r="15" fill="none" stroke="#4fd081" stroke-width="4" stroke-linecap="round" pathLength="300" stroke-dasharray="70 230"/><circle class="pa" cx="20" cy="20" r="15" fill="none" stroke="#1d2124" stroke-width="4" stroke-linecap="round" pathLength="300" stroke-dasharray="70 230" stroke-dashoffset="-100"/><circle class="pa" cx="20" cy="20" r="15" fill="none" stroke="#9aa2a6" stroke-width="4" stroke-linecap="round" pathLength="300" stroke-dasharray="70 230" stroke-dashoffset="-200"/></svg><span class="pulltxt"></span>';   // three arcs in the logo colours, one per sport
const txt = ind.querySelector('.pulltxt');
document.body.append(ind);

const blocked = t => document.querySelector('.overlay.open') || t.closest('.leaflet-container, input, textarea, select, .lapscroll, [data-nopull]');
const show = () => {};   // nothing while pulling: it's a gesture people try anyway
const hide = () => { ind.classList.remove('ready', 'spin'); txt.textContent = ''; ind.style.transform = ''; ind.style.opacity = ''; };

addEventListener('touchstart', e => {
  if (running || !state.user || e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target)) { startY = null; return; }
  startY = e.touches[0].clientY; startX = e.touches[0].clientX; dist = 0; active = false;
}, { passive: true });

addEventListener('touchmove', e => {
  if (startY == null) return;
  const dy = e.touches[0].clientY - startY, dx = e.touches[0].clientX - startX;
  if (!active && (dy < 8 || Math.abs(dx) > dy || window.scrollY > 0)) { if (dy < 0 || Math.abs(dx) > 10) startY = null; return; }
  active = true; dist = dy * 0.5; show(dist);
  if (e.cancelable) e.preventDefault();
}, { passive: false });

addEventListener('touchend', async () => {
  if (startY == null || !active) { startY = null; return; }
  startY = null; active = false;
  if (dist < TRIGGER) { hide(); return; }
  running = true; ind.classList.add('spin'); txt.textContent = 'Syncing…'; ind.style.transform = 'translate(-50%, 0)'; ind.style.opacity = 1;
  try {
    const n = await syncNow();
    refreshNotifications().catch(() => {});
    if (!n) { window.dispatchEvent(new HashChangeEvent('hashchange')); toast('Up to date'); }
  } catch { toast('Couldn’t check for new activities'); }
  finally { running = false; hide(); }
});
addEventListener('touchcancel', () => { startY = null; active = false; if (!running) hide(); });
