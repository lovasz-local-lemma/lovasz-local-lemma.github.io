/* Short card motion is opt-in by attention; full recordings retain their sound. */
(() => {
  const init = () => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const connection = navigator.connection;
    let active = null;
    document.querySelectorAll('video.card-motion[data-preview-src]').forEach(video => {
      const link = video.closest('.project-picture');
      let timer, wanted = false;
      const stop = () => {
        wanted = false; clearTimeout(timer); video.pause();
        link.classList.remove('motion-ready');
        if (active === stop) active = null;
      };
      const start = () => {
        if (reduced.matches || connection?.saveData || document.hidden) return;
        if (active && active !== stop) active();
        wanted = true; active = stop; clearTimeout(timer);
        timer = setTimeout(() => {
          if (!wanted) return;
          video.muted = true;
          if (!video.hasAttribute('src')) video.src = video.dataset.previewSrc;
          video.play().catch(stop);
        }, 300);
      };
      video.addEventListener('playing', () => {
        if (wanted) link.classList.add('motion-ready'); else video.pause();
      });
      video.addEventListener('error', stop);
      link.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') start(); });
      link.addEventListener('pointerleave', stop);
      link.addEventListener('focus', start);
      link.addEventListener('blur', stop);
      link.addEventListener('click', stop);
      const observer = new IntersectionObserver(entries => { if (!entries[0].isIntersecting) stop(); });
      observer.observe(link);
      document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
      reduced.addEventListener('change', stop);
    });
    document.querySelectorAll('.opening-performance video').forEach(video => {
      const figure = video.closest('figure');
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'performance-play';
      button.textContent = '▶ Play performance · sound on';
      figure.insertBefore(button, video.nextSibling);
      button.addEventListener('click', async () => {
        button.textContent = 'Loading performance…';
        try { video.muted = false; await video.play(); }
        catch { button.textContent = '▶ Try again · or use the video controls'; }
      });
      video.addEventListener('play', () => { button.hidden = true; });
      video.addEventListener('error', () => { button.hidden = false; button.textContent = 'Recording unavailable · try the video controls'; });
    });
    document.querySelectorAll('.recording-gallery').forEach(gallery => {
      const choices = [...gallery.querySelectorAll('[data-recording-index]')];
      const panes = [...gallery.querySelectorAll('.recording-pane')];
      choices.forEach((button,index) => button.addEventListener('click', () => {
        choices.forEach((choice,i) => choice.setAttribute('aria-pressed', String(i === index)));
        panes.forEach((pane,i) => { pane.hidden = i !== index; if (i !== index) pane.querySelector('video')?.pause(); });
      }));
    });
    const recordings = [...document.querySelectorAll('.manual-media video')];
    // A segment written as #t=start,end stops at its end and replays from its start (browsers only honour the end on first play).
    recordings.forEach(video => {
      const m = /#t=([\d.]+),([\d.]+)/.exec(video.querySelector('source')?.getAttribute('src') || '');
      if (!m) return;
      const start = +m[1], end = +m[2];
      video.addEventListener('play', () => { if (video.currentTime < start - 0.3 || video.currentTime >= end - 0.05) video.currentTime = start; });
      video.addEventListener('timeupdate', () => { if (video.currentTime >= end) { video.pause(); video.currentTime = end; } });
    });
    const posters = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.poster = e.target.dataset.poster; posters.unobserve(e.target); }
    }), {rootMargin:'200px'});
    recordings.filter(v => v.dataset.poster).forEach(v => posters.observe(v));
    const visible = new IntersectionObserver(entries => entries.forEach(e => { if (!e.isIntersecting) e.target.pause(); }));
    recordings.forEach(video => {
      visible.observe(video);
      video.addEventListener('play', () => recordings.forEach(other => { if (other !== video) other.pause(); }));
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) recordings.forEach(video => video.pause()); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
