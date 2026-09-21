/* Small, cancellable fades shared by discovery and the static page shell. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const active = new WeakMap();
  async function swap(element, update, {immediate = false, enter = true} = {}) {
    if (!element) { update(); return true; }
    const opacity = getComputedStyle(element).opacity;
    active.get(element)?.animation?.cancel();
    const task = {}; active.set(element, task);
    const animate = async (frames, duration) => {
      task.animation = element.animate(frames, {duration, easing:'cubic-bezier(.22,.68,.25,1)', fill:'both'});
      try { await task.animation.finished; } catch { return false; }
      return active.get(element) === task;
    };
    const motion = !immediate && !reduced.matches;
    if (motion && !element.hidden && Number(opacity) > 0) {
      if (!await animate([{opacity}, {opacity:0}], 135)) return false;
    }
    if (active.get(element) !== task) return false;
    update();
    task.animation?.cancel();
    if (motion && enter && !element.hidden) {
      if (!await animate([{opacity:0, transform:'translateY(5px)'}, {opacity:1, transform:'translateY(0)'}], 250)) return false;
    }
    task.animation?.cancel(); active.delete(element);
    return true;
  }
  window.PortfolioMotion = {swap, reduced};

  document.addEventListener('DOMContentLoaded', () => {
    const nav=document.querySelector('.site-nav');
    const measureNav=()=>document.documentElement.style.setProperty('--portfolio-nav-height',`${nav?.offsetHeight||78}px`);
    measureNav();
    if(nav&&'ResizeObserver' in window)new ResizeObserver(measureNav).observe(nav);
    // The early document helper owns page fades; keep this module for panel swaps.
    if(window.PortfolioNavigation)return;
    const surfaces = [...document.querySelectorAll('main, .footer')];
    const reveal = () => {
      document.documentElement.classList.remove('page-departing');
      if (!reduced.matches) surfaces.forEach(el => {
        el.getAnimations().forEach(a => a.cancel());
        el.animate([{opacity:0}, {opacity:1}], {duration:310, easing:'ease-out'});
      });
    };
    reveal();
    window.addEventListener('pageshow', event => { if (event.persisted) reveal(); });
    let destination = null;
    document.addEventListener('click', async event => {
      const link = event.target.closest('a[href]');
      if (event.defaultPrevented || !link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.download || (link.target && link.target !== '_self')) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || !/\/($|[^.]*$)|\.html$/i.test(url.pathname)) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      // Hash/query controls are handled by discovery, before this listener runs.
      if (reduced.matches) return;
      event.preventDefault(); destination = url.href;
      document.documentElement.classList.add('page-departing');
      const animations = surfaces.map(el => el.animate([{opacity:getComputedStyle(el).opacity}, {opacity:0}], {duration:145, easing:'ease-in', fill:'forwards'}));
      await Promise.allSettled(animations.map(a => a.finished));
      if (destination === url.href) location.assign(url.href);
    });
  });
})();
