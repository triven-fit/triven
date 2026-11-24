// "Suggest a feature" and "Report a problem": a short form that saves to the feedback table (019).
// Problems carry the page you were on, the app version, your browser and screen size, so they can be reproduced.
import { sb, state, toast } from './main.js?v=1795526551';
import { openModal } from './edit.js?v=1795526551';
import { curRoute } from './urls.js?v=1795526551';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const STATUS = { new: 'Sent', seen: 'Seen', planned: 'Planned', done: 'Done', wontfix: 'Not planned' };
const BUILD = new URL(import.meta.url).searchParams.get('v');

export function openFeedback(kind = 'feature') {
  const from = curRoute();
  openModal(async (body, close) => {
    const tabs = el('div', { className: 'segrow', style: 'margin:4px 0 12px' });
    const ta = el('textarea', { rows: 6, maxLength: 4000, style: 'width:100%' });
    const help = el('div', { className: 'note', style: 'margin-top:6px' });
    const send = el('button', { className: 'btn primary', type: 'button', textContent: 'Send' });
    const paint = () => {
      tabs.replaceChildren(...[['feature', 'Suggest a feature'], ['problem', 'Report a problem']].map(([k, t]) =>
        el('button', { type: 'button', className: 'chip', textContent: t, ariaPressed: String(k === kind), onclick: () => { kind = k; paint(); } })));
      ta.placeholder = kind === 'feature' ? 'What would make Triven better for you? What would you use it for?' : 'What happened, and what did you expect? Steps to make it happen again help a lot.';
      help.textContent = kind === 'feature' ? 'Goes straight to the person who builds Triven. You’ll get a notification when its status changes.'
        : 'We’ll include the page you were on, the app version, your browser and screen size. Nothing else.';
    };
    paint();
    send.onclick = async () => {
      const text = ta.value.trim();
      if (text.length < 3) { ta.focus(); return; }
      const { error } = await sb.from('feedback').insert({ user_id: state.user.id, kind, body: text, page: from, app_build: BUILD, user_agent: navigator.userAgent.slice(0, 300), screen: `${innerWidth}×${innerHeight}` });
      if (error) { toast('Couldn’t send: ' + error.message); return; }
      close(); toast(kind === 'feature' ? 'Thanks! Suggestion sent.' : 'Thanks! Problem reported.');
    };
    const mine = el('div', { className: 'fbmine' });
    body.append(el('h3', { textContent: 'Feedback' }), tabs, ta, help,
      el('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px' }, el('button', { className: 'btn', type: 'button', textContent: 'Cancel', onclick: close }), send), mine);
    ta.focus();
    const { data } = await sb.from('feedback').select('kind,body,status,created_at,admin_note').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(10);
    if (data?.length) mine.append(el('h4', { textContent: 'What you’ve sent', style: 'margin:18px 0 6px' }),
      ...data.map(f => el('div', { className: 'fbrow' }, el('span', { className: 'fbst fb-' + f.status, textContent: STATUS[f.status] || f.status }),
        el('span', {}, el('b', { textContent: f.kind === 'feature' ? 'Suggestion: ' : 'Problem: ' }), f.body.length > 140 ? f.body.slice(0, 140) + '…' : f.body,
          f.admin_note ? el('div', { className: 'muted', style: 'font-size:12px;margin-top:2px', textContent: 'Reply: ' + f.admin_note }) : null))));
  });
}
