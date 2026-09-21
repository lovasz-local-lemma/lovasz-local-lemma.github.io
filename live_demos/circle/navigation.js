(function () {
  "use strict";

  const nav = document.querySelector(".lab-nav");
  if (!nav) return;
  const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
  const sections = links.map((link) => document.getElementById(link.hash.slice(1)));
  if (sections.some((section) => !section)) return;
  let queued = false;
  let activeIndex = -1;

  function update() {
    queued = false;
    const horizontal = window.matchMedia("(max-width: 1199px)").matches;
    const readingLine = horizontal ? nav.getBoundingClientRect().bottom + 36 : Math.min(200, window.innerHeight * 0.22);
    let next = 0;
    sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top <= readingLine) next = index;
    });
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) next = sections.length - 1;
    if (next === activeIndex) return;
    activeIndex = next;
    links.forEach((link, index) => {
      if (index === next) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });

    // Keep the current chapter visible in the narrow rail without scrolling the page.
    if (horizontal) {
      const rail = nav.getBoundingClientRect();
      const selected = links[next].getBoundingClientRect();
      if (selected.left < rail.left + 8) nav.scrollLeft += selected.left - rail.left - 8;
      else if (selected.right > rail.right - 8) nav.scrollLeft += selected.right - rail.right + 8;
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(update);
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("hashchange", schedule);
  window.addEventListener("load", schedule);
  // Method changes and deferred chart rendering can change chapter positions.
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(schedule);
    observer.observe(document.querySelector(".site-shell"));
    sections.forEach((section) => observer.observe(section));
  }
  update();
})();
