/* Anchor targets have one scroll owner; the shared lift only follows position. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('click', event => {
    const link = event.target.closest('.report-rail a[href^="#"], .report-shortcuts a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const target = document.getElementById(link.hash.slice(1));
    if (!target) return;
    event.preventDefault();
    history.replaceState(null, '', link.hash);
    const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 112;
    window.scrollTo({top: Math.max(0, target.getBoundingClientRect().top + scrollY - padding), behavior: reduced.matches ? 'instant' : 'smooth'});
  });
})();
