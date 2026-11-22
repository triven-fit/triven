// Garmin attribution. Garmin's API brand guidelines (which intervals.icu's API terms pass on) require "Garmin [device model]"
// next to any activity recorded on a Garmin device — in feeds, activity pages, exports and shared images — and a credit on
// totals, charts and leaderboards worked out partly from Garmin data ("derived in part from Garmin device-sourced data").
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };

// product names Garmin uses (and how older Triven imports wrote them, without "Garmin" in front)
const GARMIN_WORDS = /\b(garmin|forerunner|f[eē]nix|epix|edge|enduro|instinct|venu|v[ií]voactive|v[ií]vosmart|v[ií]vomove|approach|marq|descent|quatix|tactix|bounty|hrm|rally|vector|varia|lily|bounce|index|swim ?2)\b/i;

// "Forerunner 965 + Hrm Pro" → "Garmin Forerunner 965 + Hrm Pro"; non-Garmin devices are left as they are
export function deviceLabel(device) {
  if (!device) return null;
  const parts = String(device).split(' + ').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (!/^garmin\b/i.test(parts[0]) && GARMIN_WORDS.test(parts[0])) parts[0] = 'Garmin ' + parts[0];
  return parts.join(' + ');
}
// the recording device only (no sensors), for compact places like feed cards
export const mainDevice = device => deviceLabel(device)?.split(' + ')[0] || null;
export const isGarmin = device => /^Garmin\b/.test(deviceLabel(device) || '');

// a small credit line for totals, charts and leaderboards
export const GARMIN_DERIVED = 'Insights derived in part from Garmin device-sourced data.';
export const GARMIN_MAYBE = 'May include data from Garmin devices.';
export function garminNote(acts, maybe = false) {
  if (!maybe && !(acts || []).some(a => isGarmin(a.device))) return null;
  return el('div', { className: 'garminnote', textContent: maybe ? GARMIN_MAYBE : GARMIN_DERIVED });
}
