/* Embedded-document layout only. It never wraps a renderer's clock or input. */
(() => {
  'use strict';
  if (parent === window || window.PortfolioLabLayout) return;
  const origin = location.origin;
  let hostHeight = 900, hostWidth = innerWidth, timer = 0, probeTimer = 0, lastSize = '', disposed = false;
  let observed = new Set();
  const flexibleStages = new Map();
  const paintRoots = new Set();
  const viewportUnit = /(-?(?:\d*\.)?\d+)(?:dvh|svh|lvh|vh)\b/g;
  const viewportWidthUnit = /(-?(?:\d*\.)?\d+)(?:dvw|svw|lvw|vw)\b/g;
  const send = payload => parent.postMessage(payload, origin);
  const style = document.createElement('style');
  style.id = 'portfolio-embedded-layout';
  style.textContent = `
    html[data-portfolio-embedded],html[data-portfolio-embedded] body {
      height:auto!important;min-height:0!important;max-height:none!important;
      overflow:visible!important;
    }
    html[data-portfolio-embedded],html[data-portfolio-embedded] * {scrollbar-width:none!important}
    html[data-portfolio-embedded]::-webkit-scrollbar,html[data-portfolio-embedded] *::-webkit-scrollbar {display:none!important;width:0!important;height:0!important}
    [data-portfolio-embed-back] {display:none!important}
    [data-portfolio-expand] {height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important}
    [data-portfolio-expand-x] {overflow:visible!important}
  `;
  document.documentElement.dataset.portfolioEmbedded = 'true';
  document.head.append(style);

  // Tie viewport units to the outer reading viewport. Otherwise a 62vh scene
  // grows with its iframe; 100vw plus padding can similarly grow without end.
  function fixDeclarations(declarations) {
    for (const property of Array.from(declarations)) {
      const value = declarations.getPropertyValue(property);
      const fixed = value.replace(viewportUnit, 'calc($1 * var(--portfolio-embed-vh))').replace(viewportWidthUnit, 'calc($1 * var(--portfolio-embed-vw))');
      if (fixed !== value) declarations.setProperty(property, fixed, declarations.getPropertyPriority(property));
    }
  }
  function fixRules(rules) {
    for (const rule of rules) {
      if (rule.selectorText?.includes(':fullscreen')) continue;
      if (rule.style) fixDeclarations(rule.style);
      if (rule.cssRules) fixRules(rule.cssRules);
    }
  }
  function insidePaint(element) {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (paintRoots.has(parent)) return true;
    }
    return false;
  }
  function normalize() {
    for (const sheet of document.styleSheets) {
      try { fixRules(sheet.cssRules); } catch (_) { /* Cross-origin sheets are not editable. */ }
    }
    for (const element of document.querySelectorAll('[style]')) fixDeclarations(element.style);
    for (const link of document.querySelectorAll('a[href]')) {
      const label = link.textContent.trim();
      if (/^(?:[←↩‹]|back\b|return\b)/i.test(label) && /(?:\bRIVX\b|\bbrochure\b)/i.test(label)) {
        if (!link.hasAttribute('data-portfolio-embed-back')) link.setAttribute('data-portfolio-embed-back', '');
      }
    }

    // Some exported players use a flex:1 canvas inside a 100%-height shell.
    // Give that canvas region an independent, width-based size before allowing
    // the surrounding document to take its intrinsic height.
    for (const canvas of document.querySelectorAll('canvas')) {
      let stage = canvas.parentElement;
      for (let depth = 0; stage && stage !== document.body && depth < 4; depth++, stage = stage.parentElement) {
        const css = getComputedStyle(stage);
        if (Number(css.flexGrow) <= 0) continue;
        if (!flexibleStages.has(stage)) flexibleStages.set(stage, Math.max(.45, Math.min(1, canvas.height / Math.max(1, canvas.width))));
        break;
      }
    }
    for (const [stage, ratio] of flexibleStages) {
      const width = stage.getBoundingClientRect().width;
      if (!width) continue;
      const height = `${Math.ceil(Math.max(280, Math.min(800, width * ratio)))}px`;
      if (stage.style.height !== height) stage.style.setProperty('height', height, 'important');
      if (stage.style.flexGrow !== '0') stage.style.setProperty('flex-grow', '0', 'important');
      if (stage.style.flexShrink !== '0') stage.style.setProperty('flex-shrink', '0', 'important');
      // flex:1 uses a zero basis, which can ignore the explicit height after
      // the surrounding shell becomes content-sized.
      if (stage.style.flexBasis !== 'auto') stage.style.setProperty('flex-basis', 'auto', 'important');
      paintRoots.add(stage);
    }

    // An absolutely positioned canvas overlay is drawing, not page content.
    // Legacy players recreate their outline rectangles on every frame, and
    // sometimes again on resize even when paused. Do not let those rectangles
    // trigger width probes or retain thousands of detached ResizeObserver targets.
    for (const canvas of document.querySelectorAll('canvas')) {
      const parent = canvas.parentElement;
      if (parent === document.body) continue;
      const css = getComputedStyle(parent);
      if (css.position === 'absolute' && css.top !== 'auto' && css.bottom !== 'auto') paintRoots.add(parent);
    }
    // An SVG viewport owns its drawing, just like a canvas. Replacing paths or
    // moving annotation marks cannot change its CSS box. Observe the viewport
    // itself, but don't survey or width-probe its animated drawing descendants.
    for (const svg of document.querySelectorAll('svg')) paintRoots.add(svg);
    for (const element of paintRoots) if (!element.isConnected) paintRoots.delete(element);
    for (const element of observed) {
      if (!element.isConnected || insidePaint(element)) { resize.unobserve(element); observed.delete(element); }
    }

    // Expand actual vertical scroll containers, rather than concealing their
    // scrollbars. Canvas clipping stays intact; wide controls are fitted by
    // giving the iframe an intrinsic viewport and scaling it in the host.
    for (const element of document.body.querySelectorAll('*')) {
      if (element.tagName === 'TEXTAREA' || !element.clientHeight || insidePaint(element)) continue;
      const css = getComputedStyle(element);
      if (!element.hasAttribute('data-portfolio-expand') && /^(auto|scroll)$/.test(css.overflowY) && element.scrollHeight > element.clientHeight + 2) {
        element.setAttribute('data-portfolio-expand', '');
      }
      if (!element.hasAttribute('data-portfolio-expand-x') && /^(auto|scroll)$/.test(css.overflowX) && element.scrollWidth > element.clientWidth + 2) {
        element.setAttribute('data-portfolio-expand-x', '');
      }
      // Body height alone misses late changes in positioned children or a
      // fixed-height control panel. Observe boxes, not per-frame text counters.
      if (!observed.has(element) && !/^(CANVAS|SCRIPT|STYLE)$/i.test(element.tagName) && (element.namespaceURI !== 'http://www.w3.org/2000/svg' || element.tagName.toLowerCase() === 'svg')) {
        resize.observe(element);
        observed.add(element);
      }
    }
  }
  function extent(element, result, includeX = true, includeY = true) {
    const css = getComputedStyle(element);
    if (css.display === 'none' || css.position === 'fixed' || !element.getClientRects().length) return;
    const box = element.getBoundingClientRect();
    if (includeX) {
      result.right = Math.max(result.right, box.right + scrollX + (parseFloat(css.marginRight) || 0));
      result.left = Math.min(result.left, box.left + scrollX - (parseFloat(css.marginLeft) || 0));
    }
    if (includeY) result.bottom = Math.max(result.bottom, box.bottom + scrollY + (parseFloat(css.marginBottom) || 0));
    if (paintRoots.has(element)) return;
    // Closed details can still report boxes for hidden descendants in Chromium.
    // Only their summary contributes to the visible document height.
    if (element.tagName === 'DETAILS' && !element.open) {
      const summary = Array.from(element.children).find(child => child.tagName === 'SUMMARY');
      if (summary) extent(summary, result, includeX, includeY);
      return;
    }
    // A canvas stage intentionally clips its drawing. Its clipped descendants
    // do not determine the document's size, unlike visible overflow in a form.
    const x = includeX && !/^(hidden|clip)$/.test(css.overflowX);
    const y = includeY && !/^(hidden|clip)$/.test(css.overflowY);
    if (x || y) for (const child of element.children) extent(child, result, x, y);
  }
  function measure() {
    timer = 0;
    if (disposed || !document.body || !document.documentElement.clientWidth) return;
    normalize();
    const body = document.body;
    const bodyStyle = getComputedStyle(body);
    // Do not use documentElement.scrollHeight: it is at least the iframe's own
    // height and therefore prevents shrinking. Root min-height is normalized.
    const bounds = {bottom: body.getBoundingClientRect().bottom + scrollY + (parseFloat(bodyStyle.marginBottom) || 0), right: document.documentElement.clientWidth, left: 0};
    for (const element of body.children) extent(element, bounds);
    const height = Math.max(100, Math.ceil(bounds.bottom) + 4);
    // innerWidth is the iframe's CSS viewport width. clientWidth omits a
    // classic scrollbar: reporting that value caused the host to reject the
    // very resize message needed to remove the scrollbar.
    const width = window.innerWidth;
    const contentWidth = Math.max(width, Math.ceil(bounds.right - Math.min(0, bounds.left)), document.documentElement.scrollWidth);
    const size = `${width}:${height}:${contentWidth}`;
    if (lastSize === size) return;
    lastSize = size;
    send({type: 'portfolio-lab-size', width, height, contentWidth});
  }
  function schedule() {
    if (!disposed && !timer) timer = setTimeout(measure, 16);
  }
  function configure(config = {}) {
    // A host width probe clears its cached measurement, so acknowledge even
    // an unchanged size. Drawing mutations never request such a probe.
    if (config.force) lastSize = '';
    const height = Number(config.viewportHeight);
    if (Number.isFinite(height) && height > 100 && height !== hostHeight) hostHeight = height;
    const value = `${hostHeight / 100}px`;
    if (document.documentElement.style.getPropertyValue('--portfolio-embed-vh') !== value) {
      document.documentElement.style.setProperty('--portfolio-embed-vh', value);
    }
    const available = Number(config.availableWidth) || window.innerWidth;
    hostWidth = available;
    const widthValue = `${available / 100}px`;
    if (document.documentElement.style.getPropertyValue('--portfolio-embed-vw') !== widthValue) {
      document.documentElement.style.setProperty('--portfolio-embed-vw', widthValue);
    }
    schedule();
  }
  function probeWidth() {
    // Measurement can discover new overflow without resetting the viewport.
    // A width probe is only needed to recover from an existing scaled layout.
    if (disposed || probeTimer || window.innerWidth <= hostWidth + 1) return;
    probeTimer = setTimeout(() => {
      probeTimer = 0;
      send({type: 'portfolio-lab-reflow'});
      schedule();
    }, 80);
  }
  const resize = new ResizeObserver(schedule);
  const layoutStyle = text => (String(text || '').match(/(?:^|;)\s*(?:width|height|min-width|max-width|min-height|max-height|display|padding|margin|overflow|grid|flex)[\w-]*\s*:[^;]*/g) || []).map(value => value.replace(/^;\s*/, '').trim()).sort().join(';');
  const widthStyle = text => (String(text || '').match(/(?:^|;)\s*(?:width|min-width|max-width|display|padding|margin|overflow|grid)[\w-]*\s*:[^;]*/g) || []).map(value => value.replace(/^;\s*/, '').trim()).sort().join(';');
  const mutation = new MutationObserver(records => {
    records = records.filter(record => !insidePaint(record.target) && !(record.type === 'childList' && paintRoots.has(record.target))
      && (record.type !== 'attributes' || record.oldValue !== record.target.getAttribute(record.attributeName)));
    // Render counters often replace text every frame. ResizeObserver already
    // catches wrapping; those text updates must not trigger a full DOM survey.
    const structural = records.some(record => record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1));
    const changed = records.some(record => record.type === 'attributes' && (record.attributeName !== 'style' || layoutStyle(record.oldValue) !== layoutStyle(record.target.getAttribute('style'))));
    if (structural || changed) {
      schedule();
      // Let a removed or narrowed control return to responsive sizing. Our
      // flex-stage height/grow/shrink normalization does not affect this key.
      if (structural || records.some(record => record.type === 'attributes' && (record.attributeName !== 'style' || widthStyle(record.oldValue) !== widthStyle(record.target.getAttribute('style'))))) probeWidth();
    }
  });
  const mutationOptions = {childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'hidden', 'open', 'style']};
  resize.observe(document.body);
  mutation.observe(document.body, mutationOptions);
  document.addEventListener('load', schedule, true);
  document.addEventListener('toggle', schedule, true);
  window.addEventListener('resize', schedule);
  document.fonts?.ready.then(schedule);
  document.fonts?.addEventListener('loadingdone', schedule);

  let pointerInside = false, lastPointerNotice = 0;
  function engage(inside, event) {
    const now=performance.now();
    if (pointerInside === inside && (!event || now-lastPointerNotice<100)) return;
    pointerInside = inside;
    lastPointerNotice=now;
    send({type:'portfolio-lab-pointer',inside,intent:!!event,
      screenX:event?.screenX,screenY:event?.screenY,pointerType:event?.pointerType});
  }
  document.addEventListener('pointermove', event => {
    if (!event.pointerType || event.pointerType === 'mouse' || event.pointerType === 'pen') engage(true,event);
  }, {passive: true});
  document.documentElement.addEventListener('pointerleave', () => engage(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') send({type:'portfolio-lab-focus-close'});
  });
  window.addEventListener('pagehide', () => {
    disposed = true;
    clearTimeout(timer);
    clearTimeout(probeTimer);
    timer = 0;
    probeTimer = 0;
    resize.disconnect();
    observed = new Set();
    mutation.disconnect();
  });
  window.addEventListener('pageshow', () => {
    disposed = false;
    resize.observe(document.body);
    mutation.observe(document.body, mutationOptions);
    schedule();
  });
  window.PortfolioLabLayout = {configure, measure: schedule};
  configure();
})();
