/* Navigation for staged applications. App-internal back controls stay untouched. */
(() => {
  'use strict';
  // An embedded schematic belongs to the surrounding brochure's navigation.
  // The same file opened on its own still receives its portfolio return dock.
  if (window.parent !== window) return;
  if(document.querySelector('script[src*="portfolio-universal-navigation.js"]'))return;
  const script = document.currentScript;
  if (!script?.src) return;
  const root = new URL('./', script.src);
  const localURL = value => {
    try {
      const url = new URL(value, root);
      return url.origin === root.origin && url.pathname.startsWith(root.pathname) ? url : null;
    } catch { return null; }
  };
  const pagePath = url => url.pathname.replace(/\/index\.html?$/i, '/');
  const normalize = value => String(value).trim().toLowerCase().replaceAll('_', '-');
  let entry = { project: script.dataset.project || '', overview: script.dataset.overview || '', title: script.dataset.title || 'Project overview',
    group: script.dataset.group || 'hero', thumbnail: script.dataset.thumbnail || '' };
  // One runtime may have several portfolio entries (Fortune and Theory), and
  // nested visualization directories must not inherit a sibling's identity.
  try {
    const current = new URL(location.href);
    const matches = JSON.parse(script.dataset.routes || '[]').filter(route => {
      const url = localURL(route.path);
      return url && pagePath(url) === pagePath(current)
        && Object.entries(route.query || {}).every(([name, value]) => normalize(current.searchParams.get(name) || '') === normalize(value));
    }).sort((a, b) => (b.priority || 0) - (a.priority || 0));
    if (matches.length) entry = matches[0];
  } catch { /* Malformed optional metadata must not remove the return path. */ }
  const destination = new URL('index.html' + (entry.project ? '#project-' + encodeURIComponent(entry.project) : '#signature'), root);
  const overview = entry.overview ? localURL(entry.overview) : null;
  const returnLabel = '← Back to portfolio';
  const hiddenReturns = new WeakMap();

  function isPortfolioReturn(anchor) {
    const label = `${anchor.textContent || ''} ${anchor.getAttribute('aria-label') || ''}`.trim();
    const namedReturn = /\b(?:back|return)\b[^\n]*\b(?:portfolio|(?:project\s+)?overview)\b/i.test(label)
      || /^[\s←↩‹«]*\s*(?:portfolio|project overview|overview)(?:\s*[↗→＋+])?\s*$/i.test(anchor.textContent || '')
      || anchor.matches('a.portfolio-return,a.portfolio-return-link');
    if (!namedReturn) return false;
    let url;
    try { url = new URL(anchor.href); } catch { return false; }
    if (url.origin !== root.origin) return false;
    const ancestorHome = /\/index\.html?$/i.test(url.pathname)
      && root.pathname.startsWith(url.pathname.replace(/index\.html?$/i, ''));
    const portfolioHome = url.pathname === root.pathname || url.pathname === destination.pathname || ancestorHome;
    const portfolioPage = url.pathname.startsWith(root.pathname + 'projects/')
      && /\/projects\/[^/]+\/(?:index|overview)\.html?$/i.test(url.pathname);
    return portfolioHome || portfolioPage;
  }
  function deduplicateReturn(anchor) {
    if (anchor.closest('.compiled-portfolio-navigation,.compiled-project-overview')) return;
    if (!isPortfolioReturn(anchor)) {
      if (hiddenReturns.has(anchor)) {
        anchor.hidden = hiddenReturns.get(anchor); hiddenReturns.delete(anchor);
        delete anchor.dataset.portfolioReturnDuplicate;
      }
      return;
    }
    // Keep the authored destination and label intact; only our replacement is
    // visible. This also prevents a framework update from accumulating returns.
    if (!hiddenReturns.has(anchor)) hiddenReturns.set(anchor, anchor.hidden);
    anchor.dataset.portfolioReturnDuplicate = 'true';
    anchor.hidden = true;
  }

  function attach() {
    if (document.querySelector('.compiled-portfolio-navigation')) return;
    const dock = document.createElement('aside');
    dock.className = 'compiled-portfolio-navigation';
    dock.setAttribute('aria-label', 'Project navigation');
    try {
      if (window.PortfolioLocation?.create) {
        const map = window.PortfolioLocation.create({ group: entry.group || 'hero', title: entry.title || 'Project',
          thumbnail: entry.thumbnail ? localURL(entry.thumbnail)?.href || '' : '',
          mode: location.pathname.includes('/live_demos/') ? 'Live app' : 'Study', home: destination.href, compact: true });
        const home = map.querySelector('.route-home');
        if (home) { home.target = '_top'; home.title = 'Portfolio'; }
        dock.append(map);
      }
    } catch { /* The explicit return remains available if the optional map fails. */ }
    const actions = document.createElement('div'); actions.className = 'compiled-navigation-actions';
    const back = document.createElement('a');
    back.className = 'compiled-portfolio-return'; back.href = destination.href;
    back.textContent = returnLabel; back.target = '_top'; actions.append(back);
    if (overview) installOverview(actions, overview);
    dock.append(actions);
    document.body.append(dock);
    document.querySelectorAll('a[href]').forEach(deduplicateReturn);
    // Frameworks may mount their header later. Inspect only added anchor trees,
    // not every animation, canvas frame, or text readout.
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') { deduplicateReturn(record.target); continue; }
        const changedLink = record.target?.nodeType === 1 ? record.target.closest('a[href]') : null;
        if (changedLink) deduplicateReturn(changedLink);
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1 || dock.contains(node)) continue;
          if (node.matches('a[href]')) deduplicateReturn(node);
          node.querySelectorAll('a[href]').forEach(deduplicateReturn);
        }
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  }

  function installOverview(dock, url) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'compiled-overview-open'; button.textContent = 'Overview ＋';
    button.setAttribute('aria-label', 'Open project overview');
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'compiled-project-overview');
    button.setAttribute('aria-expanded', 'false'); dock.append(button);
    const dialog = document.createElement('dialog');
    dialog.id = 'compiled-project-overview'; dialog.className = 'compiled-project-overview';
    dialog.setAttribute('aria-labelledby', 'compiled-overview-title');
    const header = document.createElement('header'); header.className = 'compiled-overview-header';
    const title = document.createElement('h2'); title.id = 'compiled-overview-title'; title.textContent = entry.title || 'Project overview';
    const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.className = 'compiled-overview-close';
    closeButton.textContent = 'Close ×'; closeButton.setAttribute('aria-label', 'Close project overview');
    header.append(title, closeButton);
    const status = document.createElement('p'); status.className = 'compiled-overview-status'; status.setAttribute('role', 'status');
    const frame = document.createElement('iframe'); frame.className = 'compiled-overview-frame';
    frame.title = `${entry.title || 'Project'} — full project overview`;
    const fallback = document.createElement('a'); fallback.className = 'compiled-overview-fallback';
    fallback.href = url.href; fallback.target = '_top'; fallback.textContent = 'Open overview as a page ↗';
    dialog.append(header, status, frame, fallback); document.body.append(dialog);
    let closing = false, closeTimer = 0;
    function open() {
      clearTimeout(closeTimer); closing = false;
      status.textContent = 'Loading the full project overview…';
      if (frame.getAttribute('src') !== url.href) frame.src = url.href;
      if (!dialog.open) dialog.showModal();
      button.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => { if (dialog.open && !closing) dialog.classList.add('is-visible'); });
      closeButton.focus();
    }
    function close() {
      if (!dialog.open || closing) return;
      closing = true; dialog.classList.remove('is-visible'); button.setAttribute('aria-expanded', 'false');
      closeTimer = setTimeout(() => {
        dialog.close(); frame.src = 'about:blank'; closing = false;
        button.focus({ preventScroll: true });
      }, reduced.matches ? 0 : 500);
    }
    frame.addEventListener('load', () => {
      if (!dialog.open || frame.getAttribute('src') !== url.href) return;
      try {
        const doc = frame.contentDocument;
        if (!doc?.querySelector('main')) throw new Error('Missing project overview');
        doc.documentElement.classList.add('portfolio-overview-embedded');
        if (!doc.getElementById('compiled-overview-embed-style')) {
          const style = doc.createElement('style'); style.id = 'compiled-overview-embed-style';
          style.textContent = 'html.portfolio-overview-embedded body>.site-nav,'
            + 'html.portfolio-overview-embedded main.project-page>.story-trail{display:none!important}'
            + 'html.portfolio-overview-embedded main.project-page{padding-top:16px!important}'
            + 'html.portfolio-overview-embedded{scroll-padding-top:16px!important}';
          doc.head.append(style);
        }
        status.textContent = 'Full project overview · close this panel to return to the running project.';
        doc.querySelectorAll('a[href]').forEach(anchor => {
          if (pagePath(new URL(anchor.href)) !== pagePath(url)) anchor.target = '_top';
        });
        doc.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
      } catch { status.textContent = 'The overview could not be displayed here. Use the page link below.'; }
    });
    button.addEventListener('click', open); closeButton.addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
})();
