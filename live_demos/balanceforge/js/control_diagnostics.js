// BalanceForge — bounded, passive diagnostics for the actual visible rollout.
// Sampling is DOM-free. No controller, training, or physical state is modified.
(function () {
  'use strict';
  const BF = (window.BF = window.BF || {});
  const COLORS = ['#80ddc3', '#edc574', '#8cb8ff', '#dca7ec', '#f59d82'];
  const RED = '#fa8292', MUTED = '#9ca8b5', MAX_POINTS = 1800, SAMPLE_INTERVAL = .05;
  const finite = Number.isFinite;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fmt = (x, n) => finite(x) ? x.toFixed(n == null ? 1 : n) : '—';
  const angleDegrees = x => finite(x) ? Math.atan2(Math.sin(x), Math.cos(x)) * 180 / Math.PI : NaN;
  const asArray = x => Array.isArray(x) || ArrayBuffer.isView(x) ? x : [];

  function normalize(s) {
    const links = s.links || [];
    const angles = s.linkAngles || links.map(x => x.angle);
    const velocities = s.linkAngularVelocities || links.map(x => x.angularVelocity);
    const cart = s.cart || {};
    const above = typeof s.aboveHorizontal === 'boolean' ? s.aboveHorizontal :
      angles.length > 0 && Array.from(angles).every(x => finite(x) && Math.cos(x) > 0);
    return { raw: s, time: s.time, angles: Array.from(angles, angleDegrees), omega: Array.from(velocities),
      cartX: finite(s.cartX) ? s.cartX : cart.x,
      cartVelocity: finite(s.cartVelocity) ? s.cartVelocity : cart.velocity,
      railMin: finite(s.railMin) ? s.railMin : cart.railMin,
      railMax: finite(s.railMax) ? s.railMax : cart.railMax,
      command: finite(s.command) ? s.command : cart.command,
      above, hasLinks: angles.length > 0,
      saturated: typeof cart.saturated === 'boolean' ? cart.saturated :
        finite(s.command == null ? cart.command : s.command) && Math.abs(s.command == null ? cart.command : s.command) >= 1,
    };
  }

  // Public pure recorder also supports regression tests and non-DOM consumers.
  // Callers may sample every physics step; only plot points are decimated.
  function createRecorder() {
    let visible = true, frozen = false, metadata = {}, latest = null, previous = null;
    let points = [], curriculum = [], bucket = null, lastPlot = -Infinity;
    let observedSeconds = 0, aboveSeconds = 0, holdSeconds = 0, longestHold = 0;
    let saturatedSeconds = 0, sampleCount = 0, belowCrossings = 0, gapCount = 0;
    let pendingGap = true, notice = 'Waiting for the actual simulation.', lastTrainingKey = '', lastTrainingGap = 0, episode = 0;
    let episodeKey, hasEpisodeKey = false, autoEpisodeSinceContext = false;

    function gap(message) {
      if (!pendingGap) gapCount++;
      pendingGap = true; previous = null; holdSeconds = 0; bucket = null;
      notice = message;
    }
    function clearMotion() {
      points = []; bucket = null; previous = null; lastPlot = -Infinity;
      observedSeconds = 0; aboveSeconds = 0; holdSeconds = 0; longestHold = 0;
      saturatedSeconds = 0; sampleCount = 0; belowCrossings = 0; pendingGap = true;
    }
    function context(s) {
      s = s || {};
      if (Object.prototype.hasOwnProperty.call(s, 'episodeKey')) {
        if (hasEpisodeKey && s.episodeKey !== episodeKey) {
          // The sample stream may already have detected a time rewind before
          // this display-frame context arrived. Do not clear it a second time.
          if (!autoEpisodeSinceContext) {
            clearMotion(); latest = null; episode++; gapCount++;
            notice = 'New rollout: motion history and hold counters restarted.';
          }
          autoEpisodeSinceContext = false;
        }
        episodeKey = s.episodeKey; hasEpisodeKey = true;
      }
      if (typeof s.visible === 'boolean' && visible !== s.visible) {
        visible = s.visible; gap(visible ? 'Recording resumed; the hidden interval is excluded.' : 'Hidden: collection paused.');
      }
      const wasSupported = metadata.supported;
      metadata = Object.assign({}, metadata, s);
      if (metadata.supported === false) {
        if (wasSupported !== false) { clearMotion(); latest = null; curriculum = []; lastTrainingKey = ''; }
        notice = metadata.scopeNote || 'This setup is outside the current diagnostics scope: point-mass double and triple pendulums.';
      } else if (wasSupported === false && s.supported === true) notice = 'Waiting for the next supported simulation sample.';
      if (s.training && visible && !frozen && metadata.supported !== false) {
        const t = s.training;
        const key = [t.generation, t.stage, t.gravity, t.angle].join('|');
        if (key !== lastTrainingKey) {
          curriculum.push({ generation: t.generation, stage: t.stage, gravity: t.gravity, angle: t.angle,
            bestFitness: t.bestFitness, evaluationHold: t.holdSeconds, holdSource: t.holdSource,
            previewHold: holdSeconds, time: latest ? latest.time : null, episode, gap: lastTrainingGap !== gapCount });
          if (curriculum.length > 240) curriculum.shift();
          lastTrainingKey = key;
          lastTrainingGap = gapCount;
        }
      }
    }
    function freeze(value) {
      const next = value == null ? !frozen : !!value;
      if (next !== frozen) { frozen = next; gap(next ? 'Frozen: collection paused; the simulation continues.' : 'Recording resumed; the frozen interval is excluded.'); }
    }
    function sample(snapshot) {
      if (!visible || frozen || metadata.supported === false || !snapshot || !finite(snapshot.time)) return false;
      const s = normalize(snapshot);
      if (latest && s.time < latest.time - 1e-8) {
        episode++; clearMotion(); gapCount++;
        autoEpisodeSinceContext = true;
        notice = 'New rollout: motion history and hold counters restarted.';
      }
      if (previous && s.time === previous.time) { latest = s; return false; }
      if (previous && s.angles.length !== previous.angles.length) {
        episode++; clearMotion(); gapCount++; notice = 'Link count changed: motion history restarted.';
      }
      const dt = previous ? Math.max(0, s.time - previous.time) : 0;
      // Explicit context/freeze gaps interrupt the hold. Time between actual
      // successive samples is used; no wall-clock or playback-speed scaling.
      observedSeconds += dt;
      if (s.hasLinks && previous && previous.above && s.above) { aboveSeconds += dt; holdSeconds += dt; }
      else if (!s.above || !previous) holdSeconds = 0;
      if (previous && previous.above && !s.above) belowCrossings++;
      longestHold = Math.max(longestHold, holdSeconds);
      // The command in a post-step snapshot drove this elapsed interval.
      // Requiring both endpoints would undercount alternating saturation.
      if (previous && s.saturated) saturatedSeconds += dt;
      sampleCount++;
      if (!bucket) bucket = { min: s.angles.map(Math.abs), max: s.angles.map(Math.abs), below: !s.above && s.hasLinks };
      else {
        s.angles.forEach((a, i) => { bucket.min[i] = Math.min(bucket.min[i], Math.abs(a)); bucket.max[i] = Math.max(bucket.max[i], Math.abs(a)); });
        bucket.below = bucket.below || (!s.above && s.hasLinks);
      }
      const crossing = previous && previous.above !== s.above;
      if (pendingGap || crossing || s.time - lastPlot >= SAMPLE_INTERVAL - 1e-8) {
        points.push({ time: s.time, angles: s.angles, omega: s.omega, cartX: s.cartX,
          command: s.command, min: bucket.min, max: bucket.max, below: bucket.below, gap: pendingGap, hold: holdSeconds });
        if (points.length > MAX_POINTS) points.shift();
        lastPlot = s.time; bucket = null; pendingGap = false;
      }
      previous = s; latest = s;
      if (notice === 'Waiting for the actual simulation.') notice = 'Recording actual simulation samples.';
      return true;
    }
    function reset() {
      clearMotion(); latest = null; curriculum = []; lastTrainingKey = ''; lastTrainingGap = 0; gapCount = 0; episode = 0;
      episodeKey = undefined; hasEpisodeKey = false; autoEpisodeSinceContext = false;
      notice = metadata.supported === false ? (metadata.scopeNote || 'This setup is outside the current diagnostics scope: point-mass double and triple pendulums.') :
        frozen ? 'Frozen: clear complete. Resume to record.' : 'History cleared. Waiting for the next simulation sample.';
    }
    function snapshot() {
      return { metadata, latest, points, curriculum, visible, frozen, notice, episode, gapCount,
        observedSeconds, aboveSeconds, holdSeconds, longestHold, saturatedSeconds, sampleCount, belowCrossings };
    }
    return { sample, context, freeze, reset, snapshot };
  }

  function create(container) {
    if (!container || typeof container.appendChild !== 'function') throw new Error('Control diagnostics needs a DOM container.');
    const recorder = createRecorder(), doc = container.ownerDocument || document;
    const root = doc.createElement('section'); root.className = 'bf-control-diagnostics';
    root.setAttribute('aria-label', 'Live controller diagnostics');
    root.innerHTML = `
      <header class="bcd-header"><span class="bcd-eyebrow">LIVE / INSTRUMENTS</span><h2>Inside the motion</h2>
        <p class="bcd-description">Measurements from the visible controller. Training and held-out evidence stay separate.</p></header>
      <div class="bcd-toolbar"><button type="button" data-action="freeze" aria-pressed="false">Freeze</button>
        <button type="button" data-action="reset">Clear traces</button>
        <label>Window <select data-control="window"><option value="15">15 s</option><option value="30" selected>30 s</option><option value="60">60 s</option></select></label></div>
      <div class="bcd-context" data-text="context">No controller sampled yet.</div>
      <div class="bcd-readouts"><div><span>Observed hold</span><strong data-text="hold">—</strong></div><div><span>Near command limit</span><strong data-text="saturation">—</strong></div></div>
      <p class="bcd-status" data-text="status" role="status" aria-live="polite">Waiting for the actual simulation.</p>
      <label class="bcd-view-label">Inspect <select data-control="view"><option value="all">All instruments</option><option value="motion">Motion &amp; control</option><option value="network">Inputs &amp; network</option><option value="learning">Curriculum history</option></select></label>
      <div class="bcd-grid">
        <article class="bcd-card" data-group="motion"><div class="bcd-card-heading"><h3>Every link, above or below</h3><span class="bcd-unit">|angle| / degrees</span></div>
          <canvas data-chart="angles" role="img" aria-label="Each link's absolute angle over time. The red band begins at horizontal, 90 degrees."></canvas>
          <p class="bcd-caption" data-text="angles">The dotted line is horizontal. Every rod is measured separately.</p>
          <div class="bcd-legend" data-text="legend"></div>
          <details><summary>What can this tell us?</summary><p>A crossing of 90° means that individual rod is no longer above horizontal. Thin ranges preserve extremes between plot points. The hold counter uses every supplied physics sample, not the drawn points.</p><p><b>To establish robustness:</b> repeat fixed-horizon trials on independent initial states and disturbances. A good visible trace is one rollout.</p></details></article>
        <article class="bcd-card" data-group="motion"><div class="bcd-card-heading"><h3>Phase portrait</h3><label>Link <select data-control="link" aria-label="Link shown in phase portrait"><option value="0">1</option></select></label></div>
          <canvas data-chart="phase" role="img" aria-label="Selected link angular velocity versus angle, with recent motion highlighted."></canvas>
          <p class="bcd-caption" data-text="phase">Angle horizontally; angular velocity vertically. Waiting for a trace.</p>
          <details><summary>What can this tell us?</summary><p>A shrinking orbit can suggest settling; a repeated orbit can suggest persistent oscillation. The portrait wraps angles at ±180°, so the line breaks at that seam.</p><p><b>To test an explanation:</b> replay identical starts with one damping or controller change. Orbit shape alone does not identify the cause.</p></details></article>
        <article class="bcd-card" data-group="motion"><div class="bcd-card-heading"><h3>Cart room &amp; controller effort</h3><span class="bcd-unit">rail / command</span></div>
          <canvas data-chart="cart" role="img" aria-label="Cart position within its real rail bounds and recent normalized command from minus one to one."></canvas>
          <p class="bcd-caption" data-text="cart">The upper track shows the actual rail. The lower trace shows commanded effort.</p>
          <details><summary>What can this tell us?</summary><p>Repeated commands near ±1 show the controller using its configured limit. The supplied analysis counts |command| ≥0.99 as near-limit; without that flag only ±1 counts. Little rail room shows a geometric constraint. Neither proves which limitation caused a fall.</p><p><b>To isolate the limit:</b> change acceleration authority or rail width separately, preserve observation normalization, and replay the same starts.</p></details></article>
        <article class="bcd-card" data-group="network"><div class="bcd-card-heading"><h3>What the network receives</h3><span class="bcd-unit">actual inputs</span></div>
          <canvas data-chart="inputs" role="img" aria-label="Actual input values with known bounds marked when supplied."></canvas>
          <p class="bcd-caption" data-text="inputs">Input values have not been supplied.</p>
          <details><summary>What can this tell us?</summary><p>Bars show current input values. A gold endpoint marks a supplied input boundary, not proof of clipping. Actual clipping is reported only when the analysis supplies it.</p><p><b>To establish lost information:</b> inspect the pre-clamp physical value and test a changed observation scale with a consistently adapted or retrained policy.</p></details></article>
        <article class="bcd-card" data-group="network"><div class="bcd-card-heading"><h3>Neural activity</h3><span class="bcd-unit">signed activations</span></div>
          <canvas data-chart="network" role="img" aria-label="Current node activations, normalized to the largest absolute value in this sample."></canvas>
          <p class="bcd-caption" data-text="network">Activations have not been supplied.</p>
          <details><summary>What can this tell us?</summary><p>Color shows sign; brightness shows magnitude relative to this sample. A node that is zero now is not necessarily unused. Values are the supplied live forward pass.</p><p><b>To establish useful capacity:</b> compare repeatable evaluation results after controlled ablations or architecture changes. This display does not infer intelligence from node count.</p></details></article>
        <article class="bcd-card" data-group="learning"><div class="bcd-card-heading"><h3>Curriculum actually visited</h3><span class="bcd-unit">recorded checkpoints</span></div>
          <canvas data-chart="learning" role="img" aria-label="Recorded curriculum gravity, release angle and observed preview hold. Each track has its own scale."></canvas>
          <p class="bcd-caption" data-text="learning">Waiting for reported training context.</p>
          <details><summary>What can this tell us?</summary><p>These are settings reported while this tab records, not a proposed schedule. Separate tracks use separate scales. Mint hold values are the current preview's observed streak, not population fitness.</p><p><b>To claim a stage is solved:</b> use explicitly identified evaluation-hold measurements and independent seeds. Missing or hidden history is not filled in.</p></details></article>
      </div><footer class="bcd-footer" data-text="footer">Passive instruments. No hidden training or state changes.</footer>`;
    container.appendChild(root);
    const text = {}, canvases = {}, controls = {};
    root.querySelectorAll('[data-text]').forEach(e => { text[e.dataset.text] = e; });
    root.querySelectorAll('[data-control]').forEach(e => { controls[e.dataset.control] = e; });
    root.querySelectorAll('[data-chart]').forEach(e => { canvases[e.dataset.chart] = { canvas: e, ctx: e.getContext('2d') }; });
    const freezeButton = root.querySelector('[data-action="freeze"]');
    let destroyed = false, dirty = true, lastText = -Infinity, linkCount = 0, selectedView = 'all';
    let needsMeasure = true, measuredDpr = 0, writeReadouts = true;
    let locallyVisible = true, documentVisible = !doc.hidden, explicitVisible = true;
    const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
    const updateText = (key, value) => { if (writeReadouts && text[key].textContent !== value) text[key].textContent = value; };

    function applyVisibility() { recorder.context({ visible: explicitVisible && locallyVisible && documentVisible }); dirty = true; needsMeasure = true; }
    function onDocumentVisibility() { documentVisible = !doc.hidden; applyVisibility(); }
    doc.addEventListener('visibilitychange', onDocumentVisibility);
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
      locallyVisible = !!entries[0].isIntersecting; applyVisibility();
    }) : null;
    if (observer) observer.observe(root);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { dirty = true; needsMeasure = true; }) : null;
    if (resizeObserver) resizeObserver.observe(root);
    freezeButton.addEventListener('click', () => {
      recorder.freeze(); const frozen = recorder.snapshot().frozen;
      freezeButton.textContent = frozen ? 'Resume' : 'Freeze'; freezeButton.setAttribute('aria-pressed', String(frozen));
      dirty = true; render(true);
    });
    root.querySelector('[data-action="reset"]').addEventListener('click', () => { reset(); render(true); });
    controls.window.addEventListener('change', () => { dirty = true; render(true); });
    controls.link.addEventListener('change', () => { dirty = true; render(true); });
    controls.view.addEventListener('change', () => {
      selectedView = controls.view.value;
      root.querySelectorAll('[data-group]').forEach(e => { e.hidden = selectedView !== 'all' && e.dataset.group !== selectedView; });
      dirty = true; needsMeasure = true; render(true);
    });

    // Batch layout reads before text/canvas writes; stable-size frames need none.
    function measureCanvases(dpr) {
      Object.values(canvases).forEach(c => {
        const shown = !c.canvas.closest('[hidden]');
        c.size = { width: shown ? c.canvas.clientWidth : 0, height: shown ? c.canvas.clientHeight || 144 : 0 };
      });
      Object.values(canvases).forEach(c => {
        if (!c.size.width) return;
        const w = Math.round(c.size.width*dpr), h = Math.round(c.size.height*dpr);
        if (c.canvas.width !== w || c.canvas.height !== h) { c.canvas.width = w; c.canvas.height = h; }
      });
      measuredDpr = dpr; needsMeasure = false;
    }
    function prepare(name) {
      const c = canvases[name], {width, height} = c.size || {};
      if (!c.ctx || !width) return null;
      const dpr = measuredDpr;
      const ctx = c.ctx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
      return { ctx, w: width, h: height, left: 31, right: width-10, top: 12, bottom: height-23 };
    }
    function label(c, value, x, y, color) { c.ctx.fillStyle = color || MUTED; c.ctx.fillText(value, x, y); }
    function line(c, x1, y1, x2, y2, color, dash) {
      c.ctx.strokeStyle = color; c.ctx.setLineDash(dash || []); c.ctx.beginPath(); c.ctx.moveTo(x1,y1); c.ctx.lineTo(x2,y2); c.ctx.stroke(); c.ctx.setLineDash([]);
    }
    function empty(c, message) { label(c, message, 12, c.h/2); }
    function grid(c, range, values) {
      const y = v => c.bottom-(v-range[0])/(range[1]-range[0])*(c.bottom-c.top);
      values.forEach(v => { line(c,c.left,y(v),c.right,y(v),'#ffffff10'); label(c,String(v),2,y(v)); });
      return y;
    }
    function path(c, pts, x, y, value, color, breakTest) {
      c.ctx.strokeStyle=color; c.ctx.lineWidth=1.6; c.ctx.beginPath(); let prior=null;
      pts.forEach(p => { const v=value(p); if (!finite(v)) { prior=null; return; }
        const xx=x(p), yy=y(v);
        if (!prior || p.gap || (breakTest && breakTest(prior,p))) c.ctx.moveTo(xx,yy); else c.ctx.lineTo(xx,yy);
        prior=p;
      }); c.ctx.stroke(); c.ctx.lineWidth=1;
    }
    function timeAxis(c, start, end) {
      const x=p=>c.left+(p.time-start)/Math.max(.001,end-start)*(c.right-c.left);
      label(c,fmt(start,0)+' s',c.left,c.h-8); label(c,fmt(end,1)+' s',Math.max(c.left,c.right-39),c.h-8);
      return x;
    }
    function drawAngles(state, pts, start, end) {
      const c=prepare('angles'); if(!c)return;
      if (!state.latest || !state.latest.hasLinks) return empty(c,'No link-angle measurements.');
      const y=grid(c,[0,180],[0,90,180]),x=timeAxis(c,start,end);
      c.ctx.fillStyle='#fa829214'; c.ctx.fillRect(c.left,c.top,c.right-c.left,y(90)-c.top);
      line(c,c.left,y(90),c.right,y(90),'#fa82929c',[3,3]);
      label(c,'below horizontal',c.left+5,c.top+10,'#ee9ba6');
      for(let i=0;i<state.latest.angles.length;i++){
        pts.forEach(p=>{if(finite(p.min[i])&&finite(p.max[i]))line(c,x(p),y(p.min[i]),x(p),y(p.max[i]),COLORS[i%COLORS.length]+'42');});
        path(c,pts,x,y,p=>Math.abs(p.angles[i]),COLORS[i%COLORS.length]);
      }
      updateText('angles',state.latest.angles.map((v,i)=>'L'+(i+1)+' '+fmt(Math.abs(v))+'°').join(' · ')+
        ' · '+state.belowCrossings+' observed downward crossing'+(state.belowCrossings===1?'':'s'));
    }
    function drawPhase(state, pts) {
      const c=prepare('phase'); if(!c)return; const i=+controls.link.value;
      if(!state.latest || !finite(state.latest.omega[i]))return empty(c,'No angular-velocity measurements.');
      const bound=Math.max(1,...pts.map(p=>Math.abs(p.omega[i])).filter(finite));
      const y=grid(c,[-bound,bound],[-bound,0,bound].map(x=>+x.toFixed(1)));
      const x=p=>c.left+(p.angles[i]+180)/360*(c.right-c.left);
      [-90,0,90].forEach(a=>line(c,x({angles:{[i]:a}}),c.top,x({angles:{[i]:a}}),c.bottom,a===0?'#ffffff23':'#fa829228',a===0?[]:[2,3]));
      path(c,pts,x,y,p=>p.omega[i],COLORS[i%COLORS.length]+'75',(a,b)=>Math.abs(a.angles[i]-b.angles[i])>180);
      const recent=pts.slice(-35); path(c,recent,x,y,p=>p.omega[i],COLORS[i%COLORS.length],(a,b)=>Math.abs(a.angles[i]-b.angles[i])>180);
      const last=pts[pts.length-1];if(last&&finite(last.angles[i])&&finite(last.omega[i])){
        c.ctx.fillStyle=COLORS[i%COLORS.length];c.ctx.beginPath();c.ctx.arc(x(last),y(last.omega[i]),3,0,Math.PI*2);c.ctx.fill();
      }
      label(c,'−180°',c.left,c.h-8);label(c,'0°',(c.left+c.right)/2-5,c.h-8);label(c,'180°',c.right-27,c.h-8);
      updateText('phase','Link '+(i+1)+': '+fmt(state.latest.angles[i])+'° · '+fmt(state.latest.omega[i],2)+' rad/s. Velocity scale ±'+fmt(bound,1)+'.');
    }
    function drawCart(state, pts, start, end) {
      const c=prepare('cart');if(!c)return;const s=state.latest;if(!s)return empty(c,'No cart measurements.');
      if(finite(s.railMin)&&finite(s.railMax)&&s.railMax>s.railMin&&finite(s.cartX)){
        const railX=v=>c.left+clamp((v-s.railMin)/(s.railMax-s.railMin),0,1)*(c.right-c.left);
        line(c,c.left,27,c.right,27,'#edc57452');line(c,c.left,19,c.left,35,'#edc574');line(c,c.right,19,c.right,35,'#edc574');
        c.ctx.fillStyle=COLORS[0];c.ctx.fillRect(railX(s.cartX)-5,20,10,14);
        label(c,fmt(s.railMin,0),c.left,44);label(c,fmt(s.railMax,0),c.right-28,44);
      }else label(c,'Rail bounds unavailable',c.left,26);
      c.top=64;const y=grid(c,[-1,1],[-1,0,1]),x=timeAxis(c,start,end);
      path(c,pts,x,y,p=>p.command,COLORS[1]);
      updateText('cart','Cart '+fmt(s.cartX)+' · velocity '+fmt(s.cartVelocity)+' · command '+fmt(s.command,2)+
        (finite(s.raw.cartAccel)?' · configured acceleration '+fmt(s.raw.cartAccel,0):''));
    }
    function drawInputs(state) {
      const c=prepare('inputs');if(!c)return;const raw=state.latest?state.latest.raw:{};
      const values=asArray(raw.observationValues||raw.observation), labels=raw.observationLabels||[],limits=raw.observationLimits||[];
      if(!values.length){updateText('inputs','Input values were not supplied. No clipping is inferred.');return empty(c,'No input values supplied.');}
      const n=Math.min(20,values.length),row=(c.h-16)/n,center=c.w*.52,half=c.w*.43;
      for(let i=0;i<n;i++){
        const y=8+row*(i+.5),v=values[i],lim=limits[i];
        const known=lim&&finite(lim.min)&&finite(lim.max)&&lim.max>lim.min;
        const scale=known?Math.max(Math.abs(lim.min),Math.abs(lim.max),1e-6):Math.max(1,Math.abs(v)||0);
        const magnitude=finite(v)?clamp(v/scale,-1,1)*half:0;
        line(c,center-half,y,center+half,y,'#ffffff0a');line(c,center,y-row*.3,center,y+row*.3,'#ffffff1c');
        c.ctx.fillStyle=known&&(v<=lim.min||v>=lim.max)?COLORS[1]:COLORS[0]+'a5';
        c.ctx.fillRect(Math.min(center,center+magnitude),y-Math.max(1,row*.24),Math.max(1,Math.abs(magnitude)),Math.max(2,row*.48));
        if(known){[lim.min,lim.max].forEach(b=>line(c,center+b/scale*half,y-row*.3,center+b/scale*half,y+row*.3,'#edc574'));}
        label(c,String(i+1),2,y);
      }
      const analysis=raw.observations;
      const clipText=analysis&&finite(analysis.clippedCount)?'Reported physical input clips: '+analysis.clippedCount+'.':'No pre-clamp clipping count supplied.';
      updateText('inputs',(values.length>n?'First '+n+' of '+values.length+' inputs. ':'')+clipText+' '+
        Array.from(values).slice(0,4).map((v,i)=>(labels[i]||'Input '+(i+1))+': '+fmt(v,2)).join(' · '));
    }
    function drawNetwork(state) {
      const c=prepare('network');if(!c)return;const raw=state.latest?state.latest.raw:{};
      const values=asArray(raw.nodeActivations);
      if(!values.length){updateText('network','No live node activations supplied; nothing is inferred from topology alone.');return empty(c,'No activation sample supplied.');}
      const n=Math.min(256,values.length),columns=Math.max(4,Math.floor((c.w-18)/13)),rows=Math.ceil(n/columns);
      const cell=Math.min(13,(c.h-28)/rows),left=10,top=12;
      let scale=1e-9;for(let i=0;i<n;i++)if(finite(values[i]))scale=Math.max(scale,Math.abs(values[i]));
      for(let i=0;i<n;i++){
        const v=values[i],mag=finite(v)?Math.abs(v)/scale:0;
        c.ctx.globalAlpha=finite(v)?(.12+.88*mag):.15;c.ctx.fillStyle=v<0?COLORS[1]:COLORS[0];
        c.ctx.fillRect(left+(i%columns)*((c.w-20)/columns),top+Math.floor(i/columns)*cell,Math.max(2,(c.w-20)/columns-3),Math.max(2,cell-3));
      }c.ctx.globalAlpha=1;
      label(c,'negative',10,c.h-9,COLORS[1]);label(c,'positive',80,c.h-9,COLORS[0]);label(c,'max |a| '+fmt(scale,2),c.w-90,c.h-9);
      updateText('network',(finite(raw.hiddenNodeCount)?raw.hiddenNodeCount+' hidden nodes · ':'')+(finite(raw.edgeCount)?raw.edgeCount+' edges · ':'')+
        n+' activation'+(n===1?'':'s')+(values.length>n?' shown of '+values.length:'')+'. Relative scale; zero now does not mean unused.');
    }
    function drawLearning(state) {
      const c=prepare('learning');if(!c)return;const rows=state.curriculum;
      if(!rows.length){updateText('learning','No training context supplied. This controller may be a frozen model or analytical reference.');return empty(c,'No curriculum checkpoints recorded.');}
      const tracks=[['gravity','g',COLORS[1]],['angle','angle °',COLORS[2]],['previewHold','preview s',COLORS[0]]];
      tracks.forEach(([key,title,color],index)=>{
        const top=12+index*(c.h-34)/3,bottom=top+(c.h-34)/3-9,max=Math.max(1,...rows.map(p=>Math.abs(p[key])).filter(finite));
        line(c,55,bottom,c.right,bottom,'#ffffff14');label(c,title,2,top+6,color);
        const x=(_,i)=>55+i/Math.max(1,rows.length-1)*(c.right-55);
        c.ctx.strokeStyle=color;c.ctx.beginPath();let started=false;
        rows.forEach((p,i)=>{if(!finite(p[key])){started=false;return;}const yy=bottom-clamp(p[key]/max,0,1)*(bottom-top);
          if(started&&!p.gap)c.ctx.lineTo(x(p,i),yy);else c.ctx.moveTo(x(p,i),yy);started=true;});c.ctx.stroke();
        label(c,'max '+fmt(max,0),c.right-45,top+5,color);
      });
      const last=rows[rows.length-1];label(c,rows.length+' recorded checkpoints',8,c.h-8);
      updateText('learning','Generation '+(last.generation==null?'—':last.generation)+' · stage '+(last.stage==null?'—':last.stage)+
        ' · best fitness '+fmt(last.bestFitness,2)+'. Preview hold '+fmt(last.previewHold)+' s.'+
        (finite(last.evaluationHold)?' Reported evaluation hold '+fmt(last.evaluationHold)+' s ('+(last.holdSource||'source unspecified')+').':' No evaluation hold supplied.'));
    }
    function render(force) {
      if(destroyed)return;const state=recorder.snapshot();
      if(!state.visible)return;
      const clock=now();if(!force&&!dirty)return;
      dirty=false;
      const dpr=Math.min(2,window.devicePixelRatio||1);
      if(needsMeasure||dpr!==measuredDpr||!resizeObserver)measureCanvases(dpr);
      // Text is readable at 10 Hz; plots follow display frames. Physics sampling
      // remains unthrottled, including single-step failures and bucket extrema.
      writeReadouts=!!force||clock-lastText>=100;
      if(writeReadouts)lastText=clock;
      const s=state.latest, meta=state.metadata, labelText=Array.from(new Set([meta.label,meta.controller,meta.mode,meta.objective].filter(Boolean))).join(' · ');
      root.dataset.supported=meta.supported===false?'false':'true';
      updateText('context',labelText||'Actual visible rollout');
      updateText('status',state.notice);
      updateText('hold',s&&s.hasLinks?fmt(state.holdSeconds)+' s':'—');
      updateText('saturation',state.observedSeconds>0?fmt(100*state.saturatedSeconds/state.observedSeconds,0)+'%':'—');
      updateText('footer',state.sampleCount.toLocaleString()+' physics samples · '+fmt(state.observedSeconds)+' recorded seconds · '+state.gapCount+' gap'+(state.gapCount===1?'':'s')+
        (s&&finite(s.raw.rodError)?' · rod error '+fmt(s.raw.rodError,4):'')+'. Preview evidence only.');
      if(!s){
        updateText('angles','No current link-angle measurements.');updateText('phase','No current phase trace.');updateText('cart','No current cart measurements.');
        text.legend.replaceChildren();linkCount=0;
      }
      controls.link.disabled=!s||!s.hasLinks;
      if(s&&s.angles.length!==linkCount){
        const selected=+controls.link.value;linkCount=s.angles.length;controls.link.replaceChildren();
        for(let i=0;i<linkCount;i++){const option=doc.createElement('option');option.value=String(i);option.textContent=String(i+1);controls.link.appendChild(option);}
        controls.link.value=String(Math.min(selected,Math.max(0,linkCount-1)));
        text.legend.replaceChildren();for(let i=0;i<linkCount;i++){
          const item=doc.createElement('span');item.textContent='● Link '+(i+1);item.style.color=COLORS[i%COLORS.length];text.legend.appendChild(item);
        }
      }
      const end=s?s.time:0,start=Math.max(0,end-(+controls.window.value||30));
      const pts=state.points.filter(p=>p.time>=start);
      // The live endpoint follows the current physics sample between 20 Hz
      // archived points. It is never inserted into or substituted for the record.
      if(s&&(!pts.length||pts[pts.length-1].time<s.time))pts.push({...s,min:s.angles.map(Math.abs),max:s.angles.map(Math.abs)});
      if(selectedView==='all'||selectedView==='motion'){drawAngles(state,pts,start,end);drawPhase(state,pts);drawCart(state,pts,start,end);}
      if(selectedView==='all'||selectedView==='network'){drawInputs(state);drawNetwork(state);}
      if(selectedView==='all'||selectedView==='learning')drawLearning(state);
    }
    function sample(snapshot) { if(destroyed)return; if(recorder.sample(snapshot))dirty=true; }
    function context(snapshot) {
      if(destroyed)return;snapshot=snapshot||{};
      if(typeof snapshot.visible==='boolean'&&explicitVisible!==snapshot.visible){explicitVisible=snapshot.visible;needsMeasure=true;}
      recorder.context(Object.assign({},snapshot,{visible:explicitVisible&&locallyVisible&&documentVisible}));dirty=true;
    }
    function reset() { if(destroyed)return;recorder.reset();dirty=true; }
    function destroy() {
      if(destroyed)return;destroyed=true;
      if(observer)observer.disconnect();if(resizeObserver)resizeObserver.disconnect();
      doc.removeEventListener('visibilitychange',onDocumentVisibility);root.remove();
    }
    render(true);
    return {sample,context,render,reset,destroy};
  }
  BF.controlDiagnostics = {create,createRecorder};
})();
