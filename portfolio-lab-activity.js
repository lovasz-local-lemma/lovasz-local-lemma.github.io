/* On-demand diagnostics. No renderer interception, canvas readback or idle poll. */
(() => {
  'use strict';
  const activity = window.PortfolioLabs?.activity;
  if (!activity || document.getElementById('lab-activity')) return;
  const experienceKey = 'portfolio-live-demo-tried-v1';
  let experienced = false, firstUseHint = null, stylesReady = false;
  try { experienced = localStorage.getItem(experienceKey) === '1'; } catch (_) { /* Storage can be disabled. */ }
  const removeHint = () => { firstUseHint?.remove(); firstUseHint = null; };
  function updateFirstUse(snapshot) {
    // A preview load isn't a visit. Record a loaded demo only when the host has
    // actually enabled it; this works for pointer, keyboard and explicit Run.
    if (!experienced && snapshot.demos.some(d => d.permitted && d.loaded && !d.failure)) {
      experienced = true;
      try { localStorage.setItem(experienceKey, '1'); } catch (_) { /* Remember for this page even without storage. */ }
    }
    if (experienced) { removeHint(); return; }
    if (firstUseHint || document.body.dataset.page !== 'project' || !snapshot.demos.length) return;
    firstUseHint = document.createElement('aside');
    firstUseHint.className = 'lab-first-use';
    firstUseHint.hidden = !stylesReady;
    firstUseHint.setAttribute('aria-label', 'How to try the live demos');
    firstUseHint.innerHTML = '<div><strong>These demos are live.</strong><p>After scrolling, move your pointer into a demo or press <b>Run</b>. It pauses when you scroll past it, keeping the portfolio responsive.</p></div><button type="button">Find a demo ↓</button>';
    firstUseHint.querySelector('button').addEventListener('click', () => {
      const card = activity.snapshot().demos.filter(d => !d.failure)
        .map(d => document.getElementById(d.anchor)).find(element => element?.getClientRects().length);
      // A card can be several screens tall. Put its Run control in view rather
      // than centering the whole card on an unrelated explanation farther down.
      card?.querySelector('[data-lab-toggle]')?.scrollIntoView({behavior:'instant',block:'center'});
    });
    document.body.append(firstUseHint);
  }
  window.addEventListener('storage', event => {
    if (event.key === experienceKey && event.newValue === '1') { experienced = true; removeHint(); }
  });
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('portfolio-lab-activity.css', document.currentScript.src).href;
  stylesheet.addEventListener('load', () => { stylesReady = true; if (firstUseHint) firstUseHint.hidden = false; });
  document.head.append(stylesheet);
  const panel = document.createElement('aside');
  panel.id = 'lab-activity'; panel.className = 'lab-activity';
  panel.setAttribute('aria-label', 'Demo activity diagnostics');
  panel.innerHTML = `<button class="lab-activity-launch" aria-expanded="false" aria-controls="lab-activity-body" title="See which demos can run, inspect reported redraws, or temporarily run one alone">Demos · 0 live</button>
    <section id="lab-activity-body" hidden>
      <header><div><small>PERFORMANCE INSPECTOR</small><h2>Demo activity</h2></div><button data-action="close" aria-label="Close activity panel">×</button></header>
      <p class="lab-activity-summary"></p>
      <p class="lab-activity-help">Live means the host allows work. Redraws count renderer-reported updates; a live demo can be idle. Activated demos may run together while vertically visible. Scrolling back does not resume them: move the pointer after navigation settles, or press Run.</p>
      <div class="lab-activity-metrics" aria-label="Page performance"><span data-metric="cadence">Sampling page cadence…</span><span data-metric="tasks"></span></div>
      <p class="lab-activity-help">These are page timing samples, not GPU timings. Other tabs and unreported renderers can also affect responsiveness.</p>
      <div class="lab-activity-tools"><button data-action="pause-all" title="Manually pause all currently running demos and cancel preview preparation">Pause all live</button><button data-action="restore" hidden>End isolation</button><button data-action="report">Save report</button></div>
      <label class="lab-activity-filter"><input type="checkbox"> Include unopened demos</label>
      <div class="lab-activity-list"></div>
      <p class="lab-activity-empty" hidden>No demos loaded yet. Hover a demo or press its Run button.</p>
      <p class="lab-activity-foot">Try <b>Run alone</b> to compare camera response. End isolation resumes previously running, still-visible demos and preserves manual pauses. Sampling stops when this panel closes.</p>
    </section>`;
  document.body.append(panel);
  const launch = panel.querySelector('.lab-activity-launch'), body = panel.querySelector('section');
  const list = panel.querySelector('.lab-activity-list'), rows = new Map(), observations = new Map();
  let open = false, timer = 0, raf = 0, previousTime = 0, previousFrame = 0, gaps = [], longTasks = 0, longTaskMS = 0, observer;
  let cadence = null;
  const title = demo => demo.variant && demo.variant !== demo.title ? `${demo.title} · ${demo.variant}` : demo.title;
  const liveCount = snapshot => snapshot.demos.filter(d => d.permitted && d.loaded && !d.failure).length;
  function makeRow(id) {
    const row = document.createElement('article'); row.dataset.demoId = id;
    row.innerHTML = `<h3></h3><p class="lab-activity-state"></p><p class="lab-activity-observed"></p><div class="lab-activity-row-actions"><button data-action="toggle"></button><button data-action="alone">Run alone</button><button data-action="locate">Find</button></div>`;
    rows.set(id, row); return row;
  }
  function render() {
    const snapshot = activity.snapshot(), count = liveCount(snapshot);
    updateFirstUse(snapshot);
    const registered = new Set(snapshot.demos.map(d => d.id));
    for (const id of observations.keys()) if (!registered.has(id)) observations.delete(id);
    const loading = snapshot.demos.filter(d => d.reason === 'Loading').length;
    launch.textContent = `Demos · ${count} live${loading ? ` · ${loading} loading` : ''}${snapshot.isolated ? ' · solo' : ''}`;
    launch.title = snapshot.isolated ? 'One-demo isolation is active. Open to end isolation and restore normal visibility rules.' : 'See which demos can run, inspect reported redraws, or temporarily run one alone';
    panel.hidden = !snapshot.demos.length;
    // A popout covers and makes this inspector inert; don't keep measuring a
    // hidden panel. Its normal host badge will be available again on return.
    if (open && snapshot.focused) { setOpen(false); return; }
    if (!open) return;
    panel.querySelector('.lab-activity-summary').textContent = `${count} live · ${snapshot.demos.reduce((n,d)=>n+d.retained,0)} retained frames${snapshot.isolated ? ' · one-demo isolation' : snapshot.focused ? ' · popout isolated' : ''}${snapshot.navigating ? ' · navigation settling' : ''}`;
    panel.querySelector('[data-action="restore"]').hidden = !snapshot.isolated;
    const includeAll = panel.querySelector('input').checked;
    const shown = snapshot.demos.filter(d => includeAll || d.retained || d.permitted);
    panel.querySelector('.lab-activity-empty').hidden = !!shown.length;
    const ids = new Set(shown.map(d => d.id));
    for (const [id, row] of rows) if (!ids.has(id)) { row.remove(); rows.delete(id); }
    for (const demo of shown) {
      const row = rows.get(demo.id) || makeRow(demo.id);
      if (!row.isConnected) list.append(row);
      row.dataset.live = String(demo.permitted); row.dataset.warning = String(!!demo.failure || !!observations.get(demo.id)?.unexpected);
      row.querySelector('h3').textContent = title(demo);
      row.querySelector('.lab-activity-state').textContent = `${demo.reason}${demo.isolated ? ' · running alone' : ''}${demo.retained > 1 ? ` · ${demo.retained-1} inactive variants retained` : ''}`;
      row.querySelector('.lab-activity-state').title = demo.failure;
      const observed = observations.get(demo.id);
      row.querySelector('.lab-activity-observed').textContent = observed?.text || (demo.loaded ? 'Waiting for reported redraw counters…' : 'No loaded renderer');
      row.querySelector('.lab-activity-observed').title = observed?.detail || 'Sampling uses existing renderer counters. Unsupported renderers are explicitly unreported.';
      const toggle = row.querySelector('[data-action="toggle"]'); toggle.textContent = demo.permitted ? 'Pause' : 'Run';
      toggle.disabled = !demo.permitted && !demo.canRun;
      row.querySelector('[data-action="alone"]').disabled = !demo.canIsolate || demo.isolated;
      row.querySelector('[data-action="locate"]').disabled = !!snapshot.focused;
    }
  }
  function sample() {
    const now = performance.now(), elapsed = previousTime ? (now-previousTime)/1000 : 0;
    const snapshot = activity.snapshot();
    for (const demo of snapshot.demos) {
      if (!demo.retained) continue;
      const counters = activity.counters(demo.id), old = observations.get(demo.id);
      let delta = 0, inactiveDelta = 0, reporting = 0, unreported = 0;
      const values = new Map(), selected = new Map();
      for (const counter of counters) {
        if (counter.count == null) { unreported++; continue; }
        reporting++; values.set(counter.key, counter.count);selected.set(counter.key,counter.selected);
        const prior = old?.values.get(counter.key);
        if (prior !== undefined && counter.count >= prior) {
          delta += counter.count-prior;
          if(counter.selected===false && old.selected.get(counter.key)===false)inactiveDelta+=counter.count-prior;
        }
      }
      const rate = elapsed && old ? delta/elapsed : null;
      // Require two suspended observations: an in-flight last frame is normal.
      const unexpected = (inactiveDelta > 0 || (!demo.permitted && old?.permitted === false && delta > 0)) && demo.reason !== 'Preparing preview';
      const text = !reporting ? 'Redraws unreported' : rate == null ? 'Sampling reported redraws…' : `${rate.toFixed(1)} reported redraws/s${rate === 0 ? ' · idle' : ''}${unreported ? ' · some frames unreported' : ''}${unexpected ? ' · work while suspended' : ''}`;
      observations.set(demo.id, {values, selected, permitted:demo.permitted, rate, text, unexpected, documents:counters.length, reporting,
        detail:counters.map(c=>`${c.label}: ${c.count == null ? 'unreported' : c.count+' updates'}`).join('\n')});
    }
    previousTime = now;
    if (gaps.length) {
      const sorted = [...gaps].sort((a,b)=>a-b), average = gaps.reduce((a,b)=>a+b,0)/gaps.length;
      cadence = {hz:1000/average, p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]};
      panel.querySelector('[data-metric="cadence"]').textContent = `Page cadence ${cadence.hz.toFixed(0)} Hz · p95 gap ${cadence.p95.toFixed(0)} ms`;
    }
    panel.querySelector('[data-metric="tasks"]').textContent = observer ? `Long tasks (>50 ms): ${longTasks} · ${longTaskMS.toFixed(0)} ms since opening` : 'Long-task measurement unavailable';
    render();
  }
  function clock(time) {
    if (previousFrame) { gaps.push(time-previousFrame); if (gaps.length > 180) gaps.shift(); }
    previousFrame = time; raf = requestAnimationFrame(clock);
  }
  function stop() {
    clearInterval(timer); timer=0; cancelAnimationFrame(raf); raf=0; observer?.disconnect(); observer=null;
  }
  function start() {
    stop(); if (!open || document.hidden) return;
    previousTime=previousFrame=longTasks=longTaskMS=0; gaps=[]; observations.clear(); cadence=null;
    panel.querySelector('[data-metric="cadence"]').textContent='Sampling page cadence…';
    try {
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        observer = new PerformanceObserver(entries => { for(const entry of entries.getEntries()){longTasks++;longTaskMS+=entry.duration;} });
        observer.observe({entryTypes:['longtask']});
      }
    } catch (_) { observer=null; }
    sample(); timer=setInterval(sample,1000); raf=requestAnimationFrame(clock);
  }
  function setOpen(value) {
    open=value; body.hidden=!value; launch.setAttribute('aria-expanded',String(value));
    if(open){start();render();}else stop();
  }
  launch.addEventListener('click',()=>setOpen(!open));
  panel.querySelector('input').addEventListener('change',render);
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&open){setOpen(false);launch.focus();event.stopPropagation();}});
  panel.addEventListener('click',event=>{
    const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;
    const id=Number(event.target.closest('[data-demo-id]')?.dataset.demoId);
    if(action==='close'){setOpen(false);launch.focus();}
    if(action==='pause-all')activity.pauseAll();
    if(action==='restore')activity.isolate(null);
    if(action==='alone')activity.isolate(id);
    if(action==='locate')activity.locate(id);
    if(action==='toggle'){const demo=activity.snapshot().demos.find(d=>d.id===id);if(demo?.permitted)activity.pause(id);else activity.run(id);}
    if(action==='report'){
      const report={capturedAt:new Date().toISOString(),scope:'This page only; redraw counters are optional; cadence is not GPU timing',page:location.pathname,...activity.snapshot(),cadence,longTasks,longTaskMS,observed:[...observations].map(([id,o])=>({id,rate:o.rate,unexpected:o.unexpected,documents:o.documents,reporting:o.reporting,detail:o.detail}))};
      const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='demo-activity.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    render();
  });
  activity.subscribe(render); document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
  window.addEventListener('pagehide',stop);window.addEventListener('pageshow',start);
  render();
})();
