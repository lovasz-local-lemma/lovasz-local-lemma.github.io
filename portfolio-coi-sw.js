/* Cross-origin isolation service worker for static hosting.
   GitHub Pages and python -m http.server cannot send the COOP/COEP headers that
   SharedArrayBuffer (WebAssembly pthreads) requires. portfolio-coi.js registers
   this worker only for the scopes a page names (CPU Atelier: its own directory).
   Same-origin responses are re-emitted with the isolation headers; every other
   request passes through untouched, and nothing is cached.
   To remove it from a browser: DevTools > Application > Service workers > Unregister. */
'use strict';

const agent = (self.navigator && self.navigator.userAgent) || '';
const chromium = /(?:Chrome|Chromium)\/(\d+)/.exec(agent);
const firefox = /Firefox\/(\d+)/.exec(agent);
// COEP credentialless (keeps no-cors cross-origin fonts and images loadable) is
// supported from Chromium 96 and Firefox 119. Safari, every iOS browser (WebKit)
// and older engines get require-corp.
const credentialless = !/CriOS|FxiOS|EdgiOS/.test(agent)
  && (chromium ? Number(chromium[1]) >= 96 : firefox ? Number(firefox[1]) >= 119 : false);
const EMBEDDER_POLICY = credentialless ? 'credentialless' : 'require-corp';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const request = event.request;
  let url;
  try { url = new URL(request.url); } catch { return; }
  if (url.origin !== self.location.origin) return;
  // DevTools can issue this combination; fetch() would reject it.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
  event.respondWith(isolate(request));
});

async function isolate(request) {
  const response = await fetch(request);
  // Redirects handed back to navigations and opaque responses cannot be rebuilt.
  if (response.status === 0 || response.type === 'opaque' || response.type === 'opaqueredirect') return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', EMBEDDER_POLICY);
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
