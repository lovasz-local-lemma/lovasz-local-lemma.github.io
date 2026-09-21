// Client-side engine runtime for the GitHub Pages build (ruby.wasm).
//
// Loads CRuby (ruby+stdlib.wasm) into the page, evals the actual engine
// (engine_bundle.rb), and installs a fetch() shim that routes every /api/* call
// into the in-page VM via Engine.solve — so the EXISTING frontend works unchanged
// with no server and no port. Only the GitHub-Pages build (docs/index.html) loads
// this file; the local Sinatra build never does. See technical.html.
(function () {
  'use strict';
  var V = '2.9.3' + '-' + '2.9.4';
  var ESM = 'https://cdn.jsdelivr.net/npm/@ruby/wasm-wasi' + '@' + V + '/dist/browser/+esm';
  var WASM = 'https://cdn.jsdelivr.net/npm/@ruby/4.0-wasm-wasi' + '@' + V + '/dist/ruby+stdlib.wasm';

  var vm = null, readyResolve, readyReject;
  var ready = new Promise(function (res, rej) { readyResolve = res; readyReject = rej; });

  var spin = document.createElement('style');
  spin.textContent = '@keyframes wasmspin{to{transform:rotate(360deg)}}';
  document.head.appendChild(spin);

  function overlay(msg, isError) {
    var el = document.getElementById('wasmOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wasmOverlay';
      el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.93);backdrop-filter:blur(4px);color:#e2e8f0;font-family:system-ui,sans-serif;text-align:center;transition:opacity .4s;';
      (document.body || document.documentElement).appendChild(el);
    }
    el.innerHTML = '<div style="max-width:460px;padding:2rem;">' +
      '<div style="font-size:2rem;margin-bottom:.6rem;">' + (isError ? '⚠️' : '🧪') + '</div>' +
      '<div style="font-size:1.1rem;font-weight:600;margin-bottom:.4rem;color:#fff;">' + (isError ? 'Engine failed to load' : 'Loading the math engine…') + '</div>' +
      '<div style="font-size:.85rem;color:#94a3b8;line-height:1.5;">' + msg + '</div>' +
      (isError ? '' : '<div style="margin:1.1rem auto 0;width:28px;height:28px;border:3px solid rgba(148,163,184,.3);border-top-color:#22d3ee;border-radius:50%;animation:wasmspin .8s linear infinite;"></div>') +
      '</div>';
  }
  function hideOverlay() {
    var el = document.getElementById('wasmOverlay');
    if (el) { el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 400); }
  }

  async function boot() {
    try {
      overlay('Downloading the Ruby interpreter (a few MB, one-time — then cached). The entire CAS runs in your browser; nothing is sent to a server.');
      var mod = await import(ESM);
      var wasmModule = await WebAssembly.compileStreaming(fetch(WASM));
      var res = await mod.DefaultRubyVM(wasmModule);
      vm = res.vm;
      var bundle = await (await fetch('engine_bundle.rb?v=hyperbolic-tail-20260921')).text();
      vm.eval(bundle);
      vm.eval('require "js"');
      window.__vm = vm;
      readyResolve(vm);
      hideOverlay();
    } catch (e) {
      console.error('ruby.wasm boot failed', e);
      overlay('Could not load the in-browser engine: ' + (e && e.message ? e.message : e) +
              '.<br>The interpreter is fetched from jsDelivr — check your connection and reload.', true);
      readyReject(e);
    }
  }

  // ---- fetch shim: /api/<endpoint>[/<id>]  ->  Engine.solve(endpoint, params) ----
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    var m = url.match(/\/api\/([a-zA-Z_]+)(?:\/(\d+))?/);
    if (!m) return origFetch ? origFetch(input, init) : Promise.reject(new Error('no fetch'));
    return ready.then(function () {
      var endpoint = m[1], id = m[2], params = {};
      if (init && init.body) { try { params = JSON.parse(init.body); } catch (e) {} }
      if (id) params.id = id;
      window.__e = endpoint;
      window.__p = JSON.stringify(params);
      var json;
      try {
        json = vm.eval('Engine.solve(JS.global[:__e].to_s, JS.global[:__p].to_s)').toString();
      } catch (e) {
        json = JSON.stringify({ error: 'wasm dispatch: ' + (e && e.message ? e.message : e) });
      }
      return new Response(json, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }, function () {
      return new Response(JSON.stringify({ error: 'in-browser engine failed to load' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
