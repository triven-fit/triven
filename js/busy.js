// Buttons that start something slow (trim, save, upload, link…) grey out with a spinner until it finishes,
// so a click never looks like it did nothing. Any button whose onclick handler returns a promise gets this
// automatically; it is disabled meanwhile, which also stops double submits. Imported first by main.js.
const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'onclick');
Object.defineProperty(HTMLButtonElement.prototype, 'onclick', {
  configurable: true,
  get() { return desc.get.call(this); },
  set(fn) {
    if (typeof fn !== 'function') { desc.set.call(this, fn); return; }
    const btn = this;
    desc.set.call(this, function (e) {
      const r = fn.call(this, e);
      if (r && typeof r.then === 'function' && !btn.classList.contains('busy')) {
        btn.disabled = true; btn.classList.add('busy'); btn.setAttribute('aria-busy', 'true');
        const done = () => { btn.disabled = false; btn.classList.remove('busy'); btn.removeAttribute('aria-busy'); };
        r.then(done, done);
      }
      return r;
    });
  },
});
