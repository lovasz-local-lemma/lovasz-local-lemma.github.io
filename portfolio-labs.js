/* Fresh pointer/keyboard intent starts a demo after navigation settles.
   Vertical visibility can suspend it, but cannot start it on its own. */
(() => {
  'use strict';
  const hostScriptURL = new URL(document.currentScript?.src || new URL('portfolio-labs.js', location.origin + '/'));
  const layoutURL = new URL('portfolio-lab-layout.js' + hostScriptURL.search, hostScriptURL).href;
  const initialCards = [...document.querySelectorAll('.interactive-study')];
  const cards = [];

  const mediaQuery = (query, fallback) => {
    if (typeof window.matchMedia === 'function') return window.matchMedia(query);
    return { matches: fallback, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  };
  const watchQuery = (query, listener) => {
    if (typeof query.addEventListener === 'function') query.addEventListener('change', listener);
    else if (typeof query.addListener === 'function') query.addListener(listener);
  };
  // A browser without matchMedia still gets mouse hover and explicit controls.
  const fineHover = mediaQuery('(hover: hover) and (pointer: fine)', true);
  const reduced = mediaQuery('(prefers-reduced-motion: reduce)', false);
  const targetOrigin = location.origin && location.origin !== 'null' ? location.origin : '*';
  const state = new WeakMap();
  const boundCards = new WeakSet();
  let scope = null, observer = null, previewObserver = null, focused = null, isolated = null;
  const allowed = card => (!scope || scope.contains(card)) && (!focused || focused.card === card) && (!isolated || isolated === card);
  const active = new Set();
  const activityListeners = new Set();
  let activityQueued = false, activitySerial = 0;
  const activityChanged = () => {
    if (activityQueued || !activityListeners.size) return;
    activityQueued = true;
    queueMicrotask(() => { activityQueued = false; for (const listener of activityListeners) listener(); });
  };
  let keyboardInput = true;
  let navigating = false, navigationTimer = 0, pointerPosition = null;
  const navigationBusy = () => navigating || !!document.querySelector('.section-rail[data-moving="true"]');
  const previewQueue = [];
  let previewBusy = null, previewTimer = 0;

  const selectedId = card => card.dataset.labSelected;
  const selectedFrame = card => state.get(card).frames.get(selectedId(card));
  const tellFrame = (frame, visible) => frame?.contentWindow?.postMessage(
    { type: 'portfolio-lab-visibility', visible }, targetOrigin);
  const previewCapable = card => card.dataset.labPreview === 'frame';
  const frameReady = frame => frame?.dataset.loaded && (!frame.dataset.previewCapable || frame.dataset.previewReady);
  const previewSource = src => {
    const url = new URL(src, location.href);
    url.searchParams.set('portfolio-preview', '1');
    return url.href;
  };
  const stopPrewarm = () => {
    if (!previewBusy) return;
    const {frame, timer} = previewBusy;
    clearTimeout(timer);
    frame.dataset.previewCancelled = 'true';
    frame.contentWindow?.postMessage({type: 'portfolio-lab-preview-cancel'}, targetOrigin);
    previewBusy = null;
    activityChanged();
  };
  const schedulePrewarm = () => {
    if (!previewTimer) previewTimer = setTimeout(() => { previewTimer = 0; pumpPrewarm(); }, 40);
  };
  const queuePrewarm = card => {
    if (!allowed(card) || !previewCapable(card) || !state.get(card).near || selectedFrame(card) || previewQueue.includes(card)) return;
    previewQueue.push(card); schedulePrewarm();
  };
  const finishPrewarm = frame => {
    if (previewBusy?.frame !== frame) return;
    clearTimeout(previewBusy.timer); previewBusy = null; schedulePrewarm();
    activityChanged();
  };
  function pumpPrewarm() {
    if (active.size || previewBusy || document.hidden || navigationBusy()) return;
    while (previewQueue.length) {
      const card = previewQueue.shift();
      if (!state.has(card) || !allowed(card) || !state.get(card).near || !previewCapable(card) || selectedFrame(card)) continue;
      const frame = createFrame(card, {preview: true});
      previewBusy = {card, frame, timer: setTimeout(() => {
        if (previewBusy?.frame !== frame) return;
        stopPrewarm(); schedulePrewarm();
      }, 10000)};
      activityChanged();
      break;
    }
  }

  const updateReset = card => {
    const button = card.querySelector('[data-lab-reset]');
    if (!button) return;
    button.removeAttribute('disabled');
    button.setAttribute('aria-disabled', 'false');
  };

  const showHealth = card => {
    const message = selectedFrame(card)?.dataset.failure;
    card.classList.toggle('has-lab-error', !!message);
    const button = card.querySelector('[data-lab-reset]');
    if (button) {
      button.textContent = message ? 'Restart demo ↺' : 'Reset ↺';
      button.title = message
        ? 'This demo crashed. Restart recreates its renderer and restores its initial settings; other demos are unaffected.'
        : 'Reload the selected demo from its initial state. Other demos are unaffected.';
    }
    if (message) {
      card.querySelector('.lab-state').textContent = 'Demo crashed — restart to recover';
      card.querySelector('.lab-state').title = 'Experimental GPU demos can lose their graphics context. Restart recreates this demo without reloading the page or affecting other demos.';
      card.querySelector('.lab-status').textContent = `${message} · Use Restart demo to recreate this renderer.`;
    } else {
      card.querySelector('.lab-state').removeAttribute('title');
    }
  };
  const reportFailure = (card, frame, message) => {
    if (!state.has(card) || ![...state.get(card).frames.values()].includes(frame)) return;
    frame.dataset.failure = String(message || 'The live renderer stopped.').slice(0,240);
    if (selectedFrame(card) === frame) showHealth(card);
    activityChanged();
  };

  // The child measures intrinsic content after removing viewport feedback.
  // This helper is independent of the renderer's paused animation clock.
  const sizeFrame = (card, frame, width, height) => {
    const available = card.querySelector('.lab-live').clientWidth;
    if (!available) return;
    const scale = Math.min(1, available / width);
    // Store the current intrinsic size for this variant and width. A previous
    // taller tab (or an opened disclosure) must not impose a permanent floor.
    const heights = state.get(card).frameHeights;
    heights.set(`${frame.dataset.labFrame}:${available}`, Math.ceil(height * scale - 1e-6));
    frame.dataset.contentHeight = String(height);
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    frame.style.transformOrigin = '0 0';
    frame.style.transform = scale < 1 ? `scale(${scale})` : '';
    frame.dataset.contentScale = String(scale);
    card.style.setProperty('--lab-height', `${Math.ceil(height * scale)}px`);
  };
  const fitFrame = (card, frame, {probeWidth = false} = {}) => {
    if (!frame || frame.hidden) return;
    const available = card.querySelector('.lab-live').clientWidth;
    if (!available) return;
    const widthChanged = Number(frame.dataset.availableWidth) !== available;
    if (probeWidth || widthChanged) {
      frame.dataset.availableWidth = String(available);
      frame.style.width = `${available}px`;
      frame.style.transform = '';
      delete frame.dataset.contentWidth;
    }
    const cachedHeight = Number(frame.dataset.intrinsicHeight || frame.dataset.contentHeight);
    if (!widthChanged && Number(frame.dataset.measuredAvailableWidth) === available && cachedHeight >= 100) sizeFrame(card, frame, frame.clientWidth, cachedHeight);
    try { frame.contentWindow?.PortfolioLabLayout?.configure({viewportHeight: window.innerHeight, availableWidth: available, force: true}); }
    catch (_) { /* Cross-origin frames retain their declared height. */ }
  };
  const installLayout = (card, frame) => {
    try {
      const child = frame.contentWindow, doc = frame.contentDocument;
      if (!doc?.body || child.location.origin !== location.origin) return;
      if (child.PortfolioLabLayout) { fitFrame(card, frame); return; }
      const script = doc.createElement('script');
      script.src = layoutURL;
      script.addEventListener('load', () => fitFrame(card, frame), {once: true});
      doc.head.append(script);
    } catch (_) { /* Only same-origin laboratories expose intrinsic content. */ }
  };

  const showSelectedFrame = card => {
    const current = selectedFrame(card);
    const running = active.has(card) && state.get(card).intersecting && !document.hidden;
    for (const [id, frame] of state.get(card).frames) {
      const chosen = id === selectedId(card);
      frame.hidden = !chosen;
      frame.inert = !chosen || !running;
      frame.tabIndex = chosen && running ? 0 : -1;
      if (!chosen || !running) tellFrame(frame, false);
    }
    card.querySelector('.lab-live').inert = !running;
    if (current) fitFrame(card, current);
    card.classList.toggle('has-live-view', !!frameReady(current));
    updateReset(card);
    showHealth(card);
  };

  const describePaused = card => {
    const frame = selectedFrame(card);
    card.querySelector('.lab-state').textContent = frame ? 'Suspended · state retained' : 'Suspended · waiting for input';
    card.querySelector('.lab-status').textContent = frame
      ? 'Paused · settings retained. Move the pointer into this demo after scrolling, or press Run now.'
      : 'Suspended · move the pointer here after scrolling, focus a control, or press Run now.';
    showHealth(card);
  };

  const pause = (card, { manual = false, remember = false } = {}) => {
    if (!card) return;
    const cardState = state.get(card);
    if (manual) cardState.suppressAuto = true;
    cardState.resumePending = !manual && remember && (active.has(card) || cardState.resumePending);
    cardState.freshIntent = false;
    clearTimeout(cardState.enterTimer); cardState.enterTimer = 0;
    if (!active.has(card)) { if (manual) activityChanged(); return; }
    active.delete(card);
    showSelectedFrame(card);
    const button = card.querySelector('[data-lab-toggle]');
    button.setAttribute('aria-pressed', 'false');
    button.textContent = 'Run now ↗';
    card.classList.remove('is-running');
    card.classList.add('is-suspended');
    describePaused(card);
    schedulePrewarm();
    activityChanged();
  };

  const createFrame = (card, {preview = false} = {}) => {
    const cardState = state.get(card);
    const id = selectedId(card);
    if (cardState.frames.has(id)) return cardState.frames.get(id);
    const frame = document.createElement('iframe');
    frame.title = card.querySelector('.lab-view-title').textContent || card.querySelector('h3').textContent;
    frame.dataset.labFrame = id;
    if (previewCapable(card)) frame.dataset.previewCapable = 'true';
    frame.tabIndex = -1;
    frame.inert = true;
    frame.setAttribute('scrolling', 'no');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads');
    frame.addEventListener('load', () => {
      // Reset may remove this frame while its navigation is still pending.
      if (cardState.frames.get(id) !== frame) return;
      frame.dataset.loaded = 'true';
      try {
        const child = frame.contentWindow, doc = frame.contentDocument;
        child.addEventListener('error', event => { if (event.message) reportFailure(card, frame, event.message); });
        child.addEventListener('unhandledrejection', event => reportFailure(card, frame, event.reason?.message || event.reason));
        doc.addEventListener('webglcontextlost', () => reportFailure(card, frame, 'Graphics context lost.'), true);
        const inspect = () => {
          const error = doc.querySelector('#error') || doc.querySelector('#err');
          const message = doc.body?.dataset.labError || doc.body?.dataset.error || (error && !error.hidden && error.style?.display !== 'none' && error.textContent.trim());
          if (message) reportFailure(card, frame, message);
        };
        if (typeof MutationObserver === 'function' && doc.body) {
          frame.healthObserver = new MutationObserver(inspect);
          frame.healthObserver.observe(doc.body, {attributes:true, attributeFilter:['data-error','data-lab-error']});
          const error = doc.querySelector('#error') || doc.querySelector('#err');
          if (error) frame.healthObserver.observe(error, {attributes:true, childList:true, subtree:true, characterData:true});
        }
        inspect();
      } catch (_) { /* Only same-origin demos expose their failure state. */ }

      installLayout(card, frame);
      if (frame.dataset.previewCancelled) frame.contentWindow?.postMessage({type: 'portfolio-lab-preview-cancel'}, targetOrigin);
      showSelectedFrame(card);
      if (active.has(card) && selectedFrame(card) === frame && cardState.intersecting && !document.hidden) {
        card.querySelector('.lab-status').textContent = 'Interactive · runs while this panel remains vertically in view.';
        tellFrame(frame, true);
      }
      showHealth(card);
      activityChanged();
    });
    cardState.frames.set(id, frame);
    card.querySelector('.lab-live').append(frame);
    frame.src = preview ? previewSource(card.dataset.labSrc) : card.dataset.labSrc;
    updateReset(card);
    activityChanged();
    return frame;
  };

  const activate = (card, { explicit = false } = {}) => {
    const cardState = state.get(card);
    if (!cardState || !allowed(card) || !cardState.intersecting || document.hidden) return false;
    if (explicit) cardState.suppressAuto = false;
    cardState.resumePending = false; cardState.freshIntent = false;
    clearTimeout(cardState.enterTimer); cardState.enterTimer = 0;
    if (previewBusy && previewBusy.card !== card) stopPrewarm();
    active.add(card);
    cardState.started = true;
    card.classList.add('is-running');
    card.classList.remove('is-suspended');
    const button = card.querySelector('[data-lab-toggle]');
    button.setAttribute('aria-pressed', 'true');
    button.textContent = 'Pause ‖';
    card.querySelector('.lab-state').textContent = 'Active · interactive';
    const frame = createFrame(card);
    showSelectedFrame(card);
    if (frame.dataset.loaded) {
      card.querySelector('.lab-status').textContent = 'Interactive · runs while this panel remains vertically in view.';
      tellFrame(frame, true);
    } else card.querySelector('.lab-status').textContent = 'Loading schematic…';
    showHealth(card);
    activityChanged();
    return true;
  };

  const autoActivate = card => {
    const cardState = state.get(card);
    if (active.has(card)) return;
    if (navigationBusy() || cardState.suppressAuto || reduced.matches || !cardState.freshIntent) return;
    activate(card);
  };

  const scheduleHover = card => {
    const cardState = state.get(card);
    if (active.has(card) || cardState.enterTimer || navigationBusy() || !cardState.freshIntent || !fineHover.matches || reduced.matches || !cardState.pointer || cardState.suppressAuto) return;
    cardState.enterTimer = setTimeout(() => {
      cardState.enterTimer = 0;
      if (cardState.pointer) autoActivate(card);
    }, 120);
  };

  const resumeEngaged = () => {
    if (document.hidden || navigationBusy()) return;
    for (const card of cards) {
      const info = state.get(card);
      if (info.resumePending && !info.suppressAuto && allowed(card) && info.intersecting) activate(card);
    }
  };
  // Scroll-induced pointerenter is not user intent. Screen coordinates remain
  // stable when a card/iframe moves underneath a stationary cursor.
  const pointerIntent = (card, event) => {
    if (event.pointerType && !['mouse','pen'].includes(event.pointerType)) return;
    const position = [event.screenX, event.screenY];
    if (!position.every(Number.isFinite)) return;
    const moved = !pointerPosition || position.some((value,i)=>value !== pointerPosition[i]);
    pointerPosition = position;
    if (!moved || !card || !state.has(card) || navigationBusy()) return;
    const info=state.get(card);info.pointer=true;info.freshIntent=true;
    card.classList.add('is-primed');scheduleHover(card);
  };
  const navigationStarted = () => {
    clearTimeout(navigationTimer);
    if (!navigating) {
      navigating=true;
      for (const card of cards) {
        const info=state.get(card);info.freshIntent=false;
        clearTimeout(info.enterTimer);info.enterTimer=0;
      }
      stopPrewarm();activityChanged();
    }
    navigationTimer=setTimeout(()=>{
      navigationTimer=0;navigating=false;
      // Only temporary interruptions may resume. Passing a demo vertically
      // never grants this flag; hover intent during travel is discarded.
      resumeEngaged();schedulePrewarm();activityChanged();
    },220);
  };
  // The elevator car can still be settling after the document stops scrolling.
  // Watch its explicit motion state; no geometry reads or polling are needed.
  const watchElevator = () => {
    const rail = document.querySelector('.section-rail');
    if (!rail || typeof MutationObserver !== 'function') return;
    new MutationObserver(navigationStarted).observe(rail, {attributes:true,attributeFilter:['data-moving']});
    if (rail.dataset.moving === 'true') navigationStarted();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',watchElevator,{once:true});
  else watchElevator();
  const verticalIntersection = (card, fallback = true) => {
    const rect = card.getBoundingClientRect?.();
    return rect ? rect.bottom > 0 && rect.top < window.innerHeight : fallback;
  };
  const updateVertical = card => {
    const cardState = state.get(card);
    if (!cardState) return;
    const wasIntersecting = cardState.intersecting;
    cardState.intersecting = verticalIntersection(card, cardState.intersecting);
    if (wasIntersecting !== cardState.intersecting) activityChanged();
    if (!cardState.intersecting) pause(card);
  };

  const select = (card, tab) => {
    if (!state.has(card)) return;
    if (selectedId(card) === tab.dataset.labVariant) return;
    card.dataset.labSelected = tab.dataset.labVariant;
    card.dataset.labSrc = tab.dataset.src;
    card.dataset.labPreview = tab.dataset.preview || 'poster';
    card.dataset.labFit = 'true';
    if (previewBusy?.card === card && previewBusy.frame.dataset.labFrame !== selectedId(card)) stopPrewarm();
    const retained = state.get(card).frameHeights.get(`${selectedId(card)}:${card.querySelector('.lab-live').clientWidth}`);
    card.style.setProperty('--lab-height', `${retained || tab.dataset.height}px`);
    for (const sibling of card.querySelectorAll('[data-lab-variant]')) {
      const chosen = sibling === tab;
      sibling.setAttribute('aria-selected', String(chosen));
      sibling.tabIndex = chosen ? 0 : -1;
    }
    const poster = card.querySelector('.lab-poster');
    poster.src = tab.dataset.poster;
    poster.alt = `Preview of ${tab.dataset.title}`;
    card.querySelector('.lab-view-title').textContent = tab.dataset.title;
    card.querySelector('.lab-summary').textContent = tab.dataset.summary;
    card.querySelector('.lab-caption').textContent = tab.dataset.caption;
    card.querySelector('.lab-frame').setAttribute('aria-label', tab.dataset.title);
    card.querySelector('[data-lab-open]').href = tab.dataset.src;
    const contract = card.querySelector('.lab-contract');
    if (contract) {
      const values = [tab.dataset.runtime || '', tab.dataset.artifact || '', tab.dataset.exportRoute || '', tab.dataset.purpose || '', tab.dataset.provenance || '', tab.dataset.takeaway || ''];
      contract.hidden = !values.some(Boolean);
      ['runtime','artifact','export-route','purpose','provenance','takeaway'].forEach((key,i) => {const row=contract.querySelector(`[data-lab-contract="${key}"]`);const span=row?.querySelector('span');if(span){span.textContent=values[i];row.hidden=!values[i];}});
    }

    showSelectedFrame(card);
    if (active.has(card)) activate(card);
    else describePaused(card);
    queuePrewarm(card);
    activityChanged();
  };

  const reset = card => {
    const cardState = state.get(card);
    if (!cardState) return;
    const id = selectedId(card);
    const old = cardState.frames.get(id);
    if (!old) { activate(card, {explicit:true}); return; }
    if (previewBusy?.frame === old) stopPrewarm();
    tellFrame(old, false);
    old.contentObserver?.disconnect();
    old.healthObserver?.disconnect();
    old.remove();
    cardState.frames.delete(id);
    card.classList.remove('has-live-view','has-lab-error');
    updateReset(card);
    showHealth(card);
    if (active.has(card)) {
      card.querySelector('.lab-status').textContent = 'Resetting schematic…';
      activate(card, { explicit: true });
    } else {
      card.querySelector('.lab-status').textContent = 'Reset · hover, focus, or use Run now to begin again.';
      card.querySelector('.lab-state').textContent = 'Suspended · reset';
    }
    activityChanged();
  };

  const leaveFocus = () => {
    if (!focused) return;
    const saved = focused, {card, button} = saved;
    focused = null;
    if (typeof card.hidePopover === 'function' && card.matches(':popover-open')) card.hidePopover();
    card.removeAttribute('popover');
    card.classList.remove('is-focused');
    for (const [name, value] of saved.attributes) {
      if (value === null) card.removeAttribute(name); else card.setAttribute(name, value);
    }
    // Responsive content can be much shorter in the wide popout. Restore its
    // reading-space height before unlocking scroll, or a last-page card can
    // temporarily shorten the document and clamp the saved reading offset.
    if (saved.labHeight) card.style.setProperty('--lab-height', saved.labHeight);
    saved.placeholder.remove();
    for (const [element, inert] of saved.inert) element.inert = inert;
    for (const [name, value, priority] of saved.bodyStyles) document.body.style.setProperty(name, value, priority);
    document.documentElement.style.overflow = saved.overflow;
    button.textContent = 'Pop out ⛶';
    button.setAttribute('aria-label', 'Open demo popout');
    button.setAttribute('aria-pressed', 'false');
    // The brochure uses smooth anchor scrolling. Returning from a popout is
    // restoration, not navigation: never animate through unrelated chapters.
    fitFrame(card, selectedFrame(card), {probeWidth: true});
    window.scrollTo({left:saved.x, top:saved.y, behavior:'instant'});
    cards.forEach(updateVertical);
    resumeEngaged();
    button.focus({preventScroll: true});
    requestAnimationFrame(() => {
      if (!focused) document.documentElement.style.overflowAnchor = saved.anchor;
    });
    activityChanged();
  };
  const focusCard = card => {
    if (focused?.card === card) { leaveFocus(); return; }
    if (focused) leaveFocus();
    // A deliberate popout supersedes a temporary performance isolation.
    isolated = null;
    if (!allowed(card)) return;
    const button = card.querySelector('[data-lab-focus]');
    const placeholder = document.createElement('div'), box = card.getBoundingClientRect(), css = getComputedStyle(card);
    placeholder.style.cssText = `height:${box.height}px;margin:${css.marginTop} ${css.marginRight} ${css.marginBottom} ${css.marginLeft};pointer-events:none`;
    placeholder.setAttribute('aria-hidden', 'true');
    focused = {card, button, placeholder, x:scrollX, y:scrollY, inert:[], overflow:document.documentElement.style.overflow,
      labHeight:card.style.getPropertyValue('--lab-height'),
      anchor:document.documentElement.style.overflowAnchor,
      bodyStyles:['position','top','left','width'].map(name=>[name,document.body.style.getPropertyValue(name),document.body.style.getPropertyPriority(name)]),
      attributes:['role', 'aria-modal', 'aria-label'].map(name => [name, card.getAttribute(name)])};
    // Freeze the underlying page before removing the card from document flow.
    // The placeholder retains its space; the iframe itself is never moved.
    document.documentElement.style.overflowAnchor = 'none';
    document.body.style.position = 'fixed';
    document.body.style.top = `${-focused.y}px`;
    document.body.style.left = `${-focused.x}px`;
    document.body.style.width = '100%';
    card.before(placeholder);
    for (let node = card; node.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) if (sibling !== node && sibling !== placeholder) {
        focused.inert.push([sibling, sibling.inert]); sibling.inert = true;
      }
    }
    document.documentElement.style.overflow = 'hidden';
    card.classList.add('is-focused');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', card.querySelector('.lab-view-title')?.textContent || 'Focused live demo');
    // The top layer does not reparent/reload an iframe. Controls and GPU state
    // survive entering and leaving focus, unlike cloning the demo into a modal.
    if (typeof card.showPopover === 'function') { card.setAttribute('popover', 'manual'); card.showPopover(); }
    button.textContent = 'Close ×';
    button.setAttribute('aria-label', 'Close demo popout');
    button.setAttribute('aria-pressed', 'true');
    for (const other of [...active]) if (other !== card) pause(other, {remember:true});
    stopPrewarm();
    fitFrame(card, selectedFrame(card), {probeWidth: true});
    updateVertical(card);
    if (!state.get(card).suppressAuto) activate(card);
    button.focus({preventScroll: true});
    activityChanged();
  };

  const register = card => {
    if (state.has(card)) return;
    cards.push(card);
    card.dataset.labFit = 'true';
    if (!card.querySelector('.lab-interaction-hint')) {
      const hint = document.createElement('p');
      hint.className = 'lab-interaction-hint';
      hint.textContent = 'Wheel over the scene may zoom; move outside it to scroll the page.';
      card.querySelector('.lab-actions').after(hint);
    }
    state.set(card, {frames:new Map(),intersecting:true,pointer:false,keyboardFocus:false,
      suppressAuto:false,started:false,freshIntent:false,resumePending:false,frameHeights:new Map(),enterTimer:0,near:false,activityId:++activitySerial});
    if (typeof ResizeObserver === 'function') {
      const live = card.querySelector('.lab-live');
      let previousWidth = -1;
      const layoutObserver = new ResizeObserver(() => {
        if (live.clientWidth === previousWidth) return;
        previousWidth = live.clientWidth;
        fitFrame(card, selectedFrame(card));
      });
      layoutObserver.observe(live);
      state.get(card).layoutObserver = layoutObserver;
    }
    card.classList.remove('has-live-view','is-primed','is-running');
    card.classList.add('is-suspended');
    card.querySelector('[data-lab-toggle]').setAttribute('aria-pressed','false');
    card.querySelector('[data-lab-toggle]').textContent='Run now ↗';
    describePaused(card);
    updateReset(card);
    // A retained DOM card can be mounted again; bind its input handlers once.
    if (!boundCards.has(card)) {
      boundCards.add(card);
      card.addEventListener('pointerenter', event => {
        if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
        const cardState = state.get(card);
        if (!cardState) return;
        cardState.pointer = true;
        card.classList.add('is-primed');
      });
      card.addEventListener('pointerleave', event => {
        const cardState = state.get(card);
        if (!cardState?.pointer || (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
        cardState.pointer = false;
        cardState.freshIntent = false;
        clearTimeout(cardState.enterTimer);cardState.enterTimer=0;
        card.classList.remove('is-primed');

      });
      card.addEventListener('focusin', () => {
        if (!keyboardInput) return;
        const cardState = state.get(card);
        if (!cardState) return;
        cardState.keyboardFocus = true;
        cardState.freshIntent = !navigationBusy();
        autoActivate(card);
      });
      card.addEventListener('focusout', () => {
        setTimeout(() => {
          if (!state.has(card)) return;
          const cardState = state.get(card);
          cardState.keyboardFocus = card.contains(document.activeElement) && keyboardInput;
          if (!cardState.keyboardFocus && !cardState.pointer) {
            resumeEngaged();
          }
        }, 0);
      });
    }
    observer?.observe(card);
    previewObserver?.observe(card);
    activityChanged();
  };
  initialCards.forEach(register);

  let backdropPress = false;
  const outsideFocus = event => {
    if (!focused) return false;
    const box = focused.card.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };
  document.addEventListener('pointerdown', event => { keyboardInput = false; backdropPress = outsideFocus(event); }, true);
  document.addEventListener('pointerup', event => {
    if (backdropPress && outsideFocus(event)) { event.preventDefault(); leaveFocus(); }
    backdropPress = false;
  }, true);
  document.addEventListener('keydown', () => { keyboardInput = true; }, true);
  document.addEventListener('pointermove', event => pointerIntent(event.target.closest?.('.interactive-study'),event), {passive:true});
  document.addEventListener('wheel', navigationStarted, {passive:true,capture:true});
  document.addEventListener('touchmove', navigationStarted, {passive:true,capture:true});
  document.addEventListener('click', event => {
    const focusButton = event.target.closest('[data-lab-focus]');
    if (focusButton) { focusCard(focusButton.closest('.interactive-study')); return; }
    const toggle = event.target.closest('[data-lab-toggle]');
    if (toggle) {
      const card = toggle.closest('.interactive-study');
      if (active.has(card)) pause(card, { manual: true });
      else activate(card, { explicit: true });
      return;
    }
    const resetButton = event.target.closest('[data-lab-reset]');
    if (resetButton) {
      if (!resetButton.hasAttribute('disabled')) reset(resetButton.closest('.interactive-study'));
      return;
    }
    const tab = event.target.closest('[data-lab-variant]');
    if (tab) select(tab.closest('.interactive-study'), tab);
  });

  document.addEventListener('keydown', event => {
    if (focused && event.key === 'Escape') { event.preventDefault(); leaveFocus(); return; }
    const tab = event.target.closest('[data-lab-variant]');
    if (!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const card = tab.closest('.interactive-study');
    const tabs = [...card.querySelectorAll('[data-lab-variant]')];
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    event.preventDefault();
    select(card, next);
    next.focus({ preventScroll: true });
  });

  observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const cardState = state.get(entry.target);
      if (!cardState) continue;
      const wasIntersecting = cardState.intersecting;
      cardState.intersecting = verticalIntersection(entry.target, entry.isIntersecting);
      if (wasIntersecting !== cardState.intersecting) activityChanged();
      if (!cardState.intersecting) pause(entry.target);
    }
  }, { rootMargin: '0px', threshold: 0 }) : null;
  cards.forEach(card => observer?.observe(card));
  // Only generated frames with an early suspension bootstrap opt in. Large live
  // applications retain their ordinary explicit loading behavior.
  previewObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!state.has(entry.target)) continue;
      state.get(entry.target).near = entry.isIntersecting;
      if (entry.isIntersecting) queuePrewarm(entry.target);
      else if (previewBusy?.card === entry.target) { stopPrewarm(); schedulePrewarm(); }
    }
  }, {rootMargin: '420px 0px', threshold: 0}) : null;
  cards.forEach(card => previewObserver?.observe(card));
  window.addEventListener('resize', () => {
    for (const card of cards) { fitFrame(card, selectedFrame(card)); updateVertical(card); }
  });
  let scrollTimer = 0;
  window.addEventListener('scroll', () => {
    navigationStarted();
    if (!scrollTimer) scrollTimer = setTimeout(() => { scrollTimer = 0; cards.forEach(updateVertical); }, 32);
  }, {passive: true, capture: true});
  window.addEventListener('message', event => {
    if (event.origin === location.origin && ['portfolio-lab-size', 'portfolio-lab-reflow', 'portfolio-lab-pointer', 'portfolio-lab-focus-close'].includes(event.data?.type)) {
      for (const card of cards) for (const frame of state.get(card).frames.values()) {
        if (event.source !== frame.contentWindow || selectedFrame(card) !== frame) continue;
        if (event.data.type === 'portfolio-lab-focus-close') {
          if (focused?.card === card) leaveFocus();
        } else if (event.data.type === 'portfolio-lab-size') {
          const {height, width, contentWidth = width} = event.data;
          if (!Number.isFinite(height) || height < 100 || height > 100000 || !Number.isFinite(contentWidth) || contentWidth < 1 || contentWidth > 30000 || Math.abs(width - frame.clientWidth) > 2) return;
          const pixels = String(Math.ceil(height));
          frame.dataset.intrinsicHeight = pixels;
          frame.dataset.measuredAvailableWidth = String(card.querySelector('.lab-live').clientWidth);
          frame.dataset.contentWidth = String(width);
          frame.dataset.contentHeight = pixels;
          // First let responsive content reflow at the panel's actual width.
          // Only unavoidable intrinsic overflow asks for a wider CSS viewport;
          // transform the entire iframe so native input coordinates stay valid.
          sizeFrame(card, frame, Math.max(width, Math.ceil(contentWidth)), Number(pixels));
        } else if (event.data.type === 'portfolio-lab-reflow') {
          fitFrame(card, frame, {probeWidth: true});
        } else {
          const cardState = state.get(card);
          cardState.pointer = !!event.data.inside || card.matches(':hover');
          card.classList.toggle('is-primed', cardState.pointer);
          if (event.data.inside && event.data.intent) pointerIntent(card,event.data);
          if (!cardState.pointer) { cardState.freshIntent=false;clearTimeout(cardState.enterTimer);cardState.enterTimer=0; }

        }
        return;
      }
    }
    if (event.origin === location.origin && event.data?.type === 'portfolio-lab-error') {
      for (const card of cards) for (const frame of state.get(card).frames.values()) {
        if (event.source === frame.contentWindow) { reportFailure(card, frame, event.data.message); return; }
      }
    }
    if (event.origin !== location.origin || event.data?.type !== 'portfolio-lab-preview-ready') return;
    for (const card of cards) for (const frame of state.get(card).frames.values()) {
      if (event.source !== frame.contentWindow || !frame.dataset.previewCapable) continue;
      frame.dataset.previewReady = 'true';
      showSelectedFrame(card);
      if (!active.has(card)) describePaused(card);
      finishPrewarm(frame);
      return;
    }
  });

  const selectHash = () => {
    let hash;
    try { hash = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    for (const card of cards) {
      const tab = [...card.querySelectorAll('[data-lab-variant]')].find(candidate => `lab-${candidate.dataset.labVariant}` === hash);
      if (tab) select(card, tab);
    }
  };
  selectHash();
  window.addEventListener('hashchange', selectHash);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { for (const card of [...active]) pause(card,{remember:true}); stopPrewarm(); }
    else { resumeEngaged(); schedulePrewarm(); }
  });
  window.addEventListener('pagehide', () => { for (const card of [...active]) pause(card,{remember:true}); stopPrewarm(); });
  window.addEventListener('pageshow', () => { resumeEngaged(); schedulePrewarm(); });
  watchQuery(fineHover, () => {
    if (!fineHover.matches) for (const card of [...active]) pause(card);
    else resumeEngaged();
  });
  watchQuery(reduced, () => {
    if (reduced.matches) for (const card of [...active]) pause(card);
    else resumeEngaged();
  });
  // Diagnostics read our permission state, not CSS animations or guessed FPS.
  // Actual redraw counters are sampled separately, only while the panel is open.
  const activityCard = id => cards.find(card => state.get(card).activityId === Number(id));
  const activitySnapshot = () => ({
    hidden: document.hidden, navigating: navigationBusy(), focused: focused ? state.get(focused.card)?.activityId : null,
    isolated: isolated ? state.get(isolated)?.activityId : null,
    demos: cards.map(card => {
      const info = state.get(card), frame = selectedFrame(card);
      let reason = !frame ? 'Not loaded' : 'Suspended';
      if (active.has(card)) reason = frame?.dataset.loaded ? 'Running' : 'Loading';
      else if (previewBusy?.card === card) reason = 'Preparing preview';
      else if (info.suppressAuto) reason = 'Manually paused';
      else if (document.hidden) reason = 'Page hidden';
      else if (focused && focused.card !== card) reason = 'Behind popout';
      else if (isolated && isolated !== card) reason = 'Isolated out';
      else if (scope && !scope.contains(card)) reason = 'Outside current view';
      else if (!info.intersecting && frame) reason = 'Outside vertical view';
      else if (frame) reason = navigationBusy() ? 'Waiting for navigation to settle' : 'Waiting for pointer';
      if (frame?.dataset.failure) reason = 'Demo crashed';
      return {id:info.activityId, anchor:card.id, title:card.querySelector('h3')?.textContent.trim() || 'Live demo',
        variant:card.querySelector('.lab-view-title')?.textContent.trim() || '', reason,
        permitted:active.has(card), loaded:!!frame?.dataset.loaded, visible:info.intersecting,
        canRun:allowed(card) && info.intersecting && !document.hidden,
        canIsolate:info.intersecting && !document.hidden && (!scope || scope.contains(card)) && (!focused || focused.card === card),
        retained:info.frames.size, failure:frame?.dataset.failure || '',
        manual:info.suppressAuto, focused:focused?.card === card, isolated:isolated === card};
    })
  });
  const observedCounters = id => {
    const card = activityCard(id), result = [];
    if (!card) return result;
    const visit = (frame, key, depth, selected) => {
      if (depth > 4 || result.length >= 64) return;
      try {
        const doc = frame.contentDocument;
        if (!doc?.body) { result.push({key, count:null, label:frame.title || 'Unreported frame'}); return; }
        const body = doc.body.dataset;
        let count = body.frames ?? body.draws;
        if (count === undefined) {
          const nodes = [...doc.querySelectorAll('[data-frames]')];
          if (nodes.length) count = nodes.reduce((sum, node) => sum + Number(node.dataset.frames || 0), 0);
        }
        result.push({key, count:count !== undefined && Number.isFinite(Number(count)) ? Number(count) : null,
          label:doc.title || frame.title || 'Embedded renderer', selected:selected && !frame.hidden});
        [...doc.querySelectorAll('iframe')].forEach((child, index) => visit(child, `${key}.${index}`, depth+1,selected && !frame.hidden));
      } catch (_) { result.push({key, count:null, label:frame.title || 'Unreported frame'}); }
    };
    for (const [key, frame] of state.get(card).frames) visit(frame, key, 0, frame === selectedFrame(card));
    return result;
  };
  const isolation = id => {
    const card = id == null ? null : activityCard(id);
    if (id != null && (!card || !state.get(card).intersecting || (scope && !scope.contains(card)))) return false;
    if (focused && card && focused.card !== card) return false;
    isolated = card;
    if (card) {
      for (const other of [...active]) if (other !== card) pause(other,{remember:true});
      stopPrewarm(); activate(card, {explicit:true});
    } else { resumeEngaged(); schedulePrewarm(); }
    activityChanged(); return true;
  };
  // Overviews share the same visible-range lifecycle and retained frames.
  window.PortfolioLabs = {
    activity: {
      snapshot: activitySnapshot, counters: observedCounters,
      subscribe(listener) { activityListeners.add(listener); return () => activityListeners.delete(listener); },
      isolate: isolation,
      pause(id) { const card=activityCard(id); if(card) pause(card,{manual:true}); },
      run(id) { const card=activityCard(id); if(card) activate(card,{explicit:true}); },
      pauseAll() { for(const card of cards) if(active.has(card)) pause(card,{manual:true}); stopPrewarm(); clearTimeout(previewTimer); previewTimer=0; previewQueue.length=0; },
      locate(id) { const card=activityCard(id); if(card) card.scrollIntoView({behavior:'instant',block:'center'}); }
    },
    mount(root) {
      if (root.matches?.('.interactive-study')) register(root);
      root.querySelectorAll('.interactive-study').forEach(register);
    },
    setScope(root) {
      scope = root;
      if (isolated && scope && !scope.contains(isolated)) isolated = null;
      for (const card of [...active]) if (!allowed(card)) pause(card,{remember:true});
      if (previewBusy && !allowed(previewBusy.card)) stopPrewarm();
      for (const card of cards) if (allowed(card)) queuePrewarm(card);
      resumeEngaged();
      activityChanged();
    },
    unmount(root) {
      if (focused && (focused.card === root || root.contains(focused.card))) leaveFocus();
      if (isolated && (isolated === root || root.contains(isolated))) isolated = null;
      for (const card of [...cards]) {
        if (card !== root && !root.contains(card)) continue;
        if (active.has(card)) pause(card);
        if (previewBusy?.card === card) stopPrewarm();
        clearTimeout(state.get(card).enterTimer);
        state.get(card).layoutObserver?.disconnect();
        for (const frame of state.get(card).frames.values()) { tellFrame(frame,false); frame.contentObserver?.disconnect(); frame.healthObserver?.disconnect(); frame.remove(); }
        state.get(card).frames.clear();
        observer?.unobserve(card); previewObserver?.unobserve(card);
        for (let i=previewQueue.length-1;i>=0;i--) if (previewQueue[i]===card) previewQueue.splice(i,1);
        cards.splice(cards.indexOf(card),1); state.delete(card);
      }
      resumeEngaged(); activityChanged();
    }
  };
  const activityScript = document.createElement('script');
  activityScript.src = new URL('portfolio-lab-activity.js' + hostScriptURL.search, hostScriptURL).href;
  document.head.append(activityScript);
})();
