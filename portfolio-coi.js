/* Cross-origin isolation registrar. Load it as the first script in <head> of a page
   whose runtime needs SharedArrayBuffer (WebAssembly pthreads):
     <script src="../../portfolio-coi.js" data-scopes="./"></script>
   Static hosts cannot send COOP/COEP headers, so this registers portfolio-coi-sw.js
   (next to this file) for each scope in data-scopes, resolved against the page and
   kept narrow, then reloads once so the page is served through the worker.
   To remove the worker from a browser: DevTools > Application > Service workers >
   Unregister, or in the page console:
     navigator.serviceWorker.getRegistrations().then(list => list.forEach(r => r.unregister())) */
(() => {
  'use strict';
  const key = `portfolio-coi-reload:${location.pathname}`;
  // The reload guard only counts when this page reloaded itself moments ago. Chrome keeps
  // separate session storage for the isolated and non-isolated page in one tab, so the
  // isolated page cannot clear the flag the first visit left behind; without the expiry a
  // later load the worker does not control (hard reload, unregistered worker) would skip
  // its one automatic reload and show the banner.
  const RELOAD_WINDOW_MS = 10000;
  let storage = null;
  try { storage = window.sessionStorage; } catch { storage = null; }
  const remembered = () => { try { return storage ? storage.getItem(key) : null; } catch { return null; } };
  const reloadedRecently = () => {
    const age = Date.now() - Number(remembered());
    return remembered() !== null && age >= 0 && age < RELOAD_WINDOW_MS;
  };
  if (window.crossOriginIsolated) {
    try { if (storage) storage.removeItem(key); } catch { /* storage blocked */ }
    return;
  }

  const script = document.currentScript || document.querySelector('script[src*="portfolio-coi.js"]');
  const html = document.documentElement;
  const lead = 'This demo runs WebAssembly threads, which browsers allow only on cross-origin isolated pages.';
  let settled = false;

  function explain(reason) {
    settled = true;
    html.classList.remove('portfolio-coi-pending');
    const show = () => {
      if (document.getElementById('portfolio-coi-message')) return;
      const box = document.createElement('div');
      box.id = 'portfolio-coi-message';
      box.setAttribute('role', 'alert');
      box.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;max-width:720px;margin:0 auto;'
        + 'padding:14px 18px;border:1px solid #d8b272;border-radius:10px;background:#101418;color:#f1ede4;'
        + 'font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45)';
      const title = document.createElement('strong');
      title.textContent = 'Cross-origin isolation is unavailable. ';
      box.append(title, `${lead} ${reason}`);
      document.body.append(box);
    };
    if (document.body) show();
    else document.addEventListener('DOMContentLoaded', show, { once: true });
  }

  if (!window.isSecureContext) {
    explain(`${location.origin} is not a secure context, so the isolation service worker cannot start. Open the page over https:// or from http://localhost.`);
    return;
  }
  if (!('serviceWorker' in navigator)) {
    explain('Service workers are unavailable in this window (private browsing or browser settings can disable them). Open the page in a regular window of a current browser.');
    return;
  }

  // Hide the page until the reload, so the application's own not-isolated error does not flash.
  const style = document.createElement('style');
  style.textContent = 'html.portfolio-coi-pending body{visibility:hidden}';
  document.head.append(style);
  html.classList.add('portfolio-coi-pending');
  const failSafe = setTimeout(() => {
    if (!settled) explain('The isolation service worker did not start within a few seconds. Reload the page to try again.');
  }, 8000);

  const worker = new URL('portfolio-coi-sw.js', script && script.src ? script.src : location.href).href;
  const scopes = ((script && script.dataset.scopes) || './').split(/[\s,]+/).filter(Boolean)
    .map(scope => new URL(scope, location.href).href);

  const activated = registration => new Promise((resolve, reject) => {
    const watch = candidate => candidate.addEventListener('statechange', () => {
      if (candidate.state === 'activated') resolve(registration);
      else if (candidate.state === 'redundant' && !registration.active) reject(new Error('the service worker was discarded during installation'));
    });
    if (registration.active) resolve(registration);
    else if (registration.installing || registration.waiting) watch(registration.installing || registration.waiting);
    else registration.addEventListener('updatefound', () => watch(registration.installing), { once: true });
  });

  Promise.all(scopes.map(scope => navigator.serviceWorker.register(worker, { scope }).then(activated)))
    .then(() => {
      clearTimeout(failSafe);
      if (reloadedRecently()) {
        explain('The page was reloaded through the isolation service worker but is still not isolated. A hard reload (Shift+Reload) bypasses service workers, so use a normal reload; inside a frame, open the demo in its own tab.');
        return;
      }
      try {
        storage.setItem(key, String(Date.now()));
      } catch {
        explain('The isolation service worker is installed. Reload the page once to use it (session storage is blocked, so the page will not reload itself).');
        return;
      }
      settled = true;
      location.reload();
    })
    .catch(error => {
      clearTimeout(failSafe);
      explain(`The isolation service worker could not be registered (${error && error.message ? error.message : error}).`);
    });
})();
