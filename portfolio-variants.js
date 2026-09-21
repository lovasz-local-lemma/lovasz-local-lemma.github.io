/* Behaviour used only by the homepage variant pages (home-*.html).
   The hero hands and stage, the showcase pictures, tile videos and the section rail. Editing
   (layout, text and notes) lives in portfolio-studio.js. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ready = fn => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', () => setTimeout(fn, 0), { once: true })
    : setTimeout(fn, 0);

  /* ---------------------------------------------------------------- hero hands */
  function hands() {
    const groups = [...document.querySelectorAll('.hero-hand[data-hand-front]')];
    if (!groups.length) return;
    const cardsOf = hand => [...hand.querySelectorAll('[data-hand-card]')];
    const restOne = hand => cardsOf(hand).forEach(c => c.classList.toggle('is-front', c.dataset.handCard === hand.dataset.handFront));
    const rest = () => groups.forEach(restOne);
    // portfolio-brochures.js fronts RadianceLab page-wide; re-apply per hand after it runs.
    rest();
    groups.forEach(hand => {
      hand.addEventListener('pointerleave', () => setTimeout(() => restOne(hand), 0));
      cardsOf(hand).forEach(card => {
        const lift = () => setTimeout(() => {
          groups.forEach(other => { if (other !== hand) restOne(other); });
          cardsOf(hand).forEach(c => c.classList.toggle('is-front', c === card));
        }, 0);
        card.addEventListener('pointerenter', lift);
        card.addEventListener('focusin', lift);
      });
    });
    document.querySelector('.hero-feature')?.addEventListener('pointerleave', () => setTimeout(rest, 0));
  }

  /* ---------------------------------------------------------------- hero stage */
  // The step between cards is a percentage of the hand, so it cannot be reused inside a card
  // (percentages there resolve against the card). Measure it once and hand it back as pixels.
  function sizeHands() {
    document.querySelectorAll('.poker').forEach(hand => {
      const cards = hand.querySelectorAll('.poker-card');
      if (cards.length < 2) return;
      const step = cards[1].offsetLeft - cards[0].offsetLeft;
      if (step > 0) hand.style.setProperty('--step-px', `${Math.round(step)}px`);
    });
  }

  let flashing = null, cancelTrip = null, flashTimer = 0;
  function clearFocus() {
    if (cancelTrip) { cancelTrip(); cancelTrip = null; }
    clearTimeout(flashTimer);
    if (flashing) { flashing.classList.remove('is-located'); flashing = null; }
  }

  // A hero card flies you to the real card, which flashes once when it arrives and is then an ordinary card.
  function locate(id) {
    const card = document.getElementById('project-' + id);
    if (!card) return false;
    clearFocus();
    const behavior = reduced.matches ? 'auto' : 'smooth';
    // A card taller than the space under the sticky nav is aligned by its top (html's scroll-padding keeps it
    // clear of the nav); a shorter one is centred.
    const tall = card.offsetHeight > innerHeight - 140;
    const margin = card.style.scrollMarginTop;
    if (tall) card.style.scrollMarginTop = '0px';
    card.scrollIntoView({ behavior, block: tall ? 'start' : 'center' });
    // Flash only once the trip is over (the scroll has ended): a long smooth scroll to a card far down the page
    // can take well over a second, and a flash during the flight would be missed.
    let done = false, frame = 0;
    const started = performance.now();
    let lastY = scrollY, still = 0;
    const onEnd = () => setTimeout(finish, 60);
    const watch = () => {
      if (done) return;
      if (Math.abs(scrollY - lastY) < 0.5) still += 1; else { still = 0; lastY = scrollY; }
      const elapsed = performance.now() - started;
      if ((still > 8 && elapsed > 300) || elapsed > 5000) { finish(); return; }
      frame = requestAnimationFrame(watch);
    };
    const stop = () => {
      done = true;
      cancelAnimationFrame(frame);
      removeEventListener('scrollend', onEnd);
      if (tall) card.style.scrollMarginTop = margin;
    };
    function finish() {
      if (done) return;
      stop();
      cancelTrip = null;
      flashing = card;
      card.classList.add('is-located');
      // The flash ends with its animation; the timer also ends it when motion is reduced (a still outline, no animation).
      const end = () => { if (flashing === card) clearFocus(); };
      card.addEventListener('animationend', end, { once: true });
      flashTimer = setTimeout(end, reduced.matches ? 650 : 1400);
    }
    addEventListener('scrollend', onEnd);
    frame = requestAnimationFrame(watch);
    cancelTrip = () => { if (!done) stop(); };
    return true;
  }

  // Stack a hand around its active card: the active card on top, then its neighbours, then the
  // cards further away, so the ones beside it show the most. Without an active card the hand keeps
  // its natural order. Each title sits on whichever edge of its card is left uncovered.
  function orderHand(hand, active) {
    if (!hand) return;
    const cards = [...hand.querySelectorAll('.poker-card')];
    const last = cards.length - 1;
    hand.classList.toggle('has-active', active != null);
    cards.forEach((card, i) => {
      card.style.zIndex = String(active == null ? 2 + i : 30 - Math.abs(i - active));
      card.classList.toggle('is-active', i === active);
      card.classList.toggle('is-selected', i === active);
      const side = active == null ? (i === last ? '' : 'left') : i < active ? 'left' : i > active ? 'right' : '';
      card.classList.toggle('is-left', side === 'left');
      card.classList.toggle('is-right', side === 'right');
    });
  }

  // A card only becomes active once the pointer rests on it briefly, so sweeping out of a hand
  // across other cards leaves the last card you actually pointed at on top.
  const DWELL = 50;
  // Recent pointer positions, to tell a pointer passing over a card on its way somewhere from one that
  // has arrived.
  const trail = [];
  addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    trail.push({ x: event.clientX, y: event.clientY, t: event.timeStamp });
    while (trail.length > 10 || (trail.length > 2 && event.timeStamp - trail[0].t > 140)) trail.shift();
  }, { passive: true });
  // True while the pointer is still moving and heading down into the box (the lower hand): a pointer that
  // crosses a neighbouring top card on its way there must not switch the field under it. Once the pointer
  // slows to a stop the answer is false, so resting on the card still selects it.
  function headingInto(box) {
    if (!box || trail.length < 3) return false;
    const a = trail[0], b = trail[trail.length - 1];
    const dt = b.t - a.t;
    if (dt < 16 || performance.now() - b.t > 70) return false;
    const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
    if (vy < 0.08 || Math.hypot(vx, vy) < 0.15) return false;
    const r = box.getBoundingClientRect();
    if (b.y >= r.top) return b.x >= r.left - 40 && b.x <= r.right + 40;
    const x = b.x + vx * (r.top - b.y) / vy;
    return x >= r.left - 60 && x <= r.right + 60;
  }
  function onDwell(card, activate, target) {
    let timer = null;
    const attempt = () => {
      if (target && headingInto(target)) { timer = setTimeout(attempt, 40); return; }
      activate();
    };
    card.addEventListener('pointerenter', event => {
      clearTimeout(timer);
      // While the studio is picking elements, pointing at a card must not reshuffle the hands.
      if (document.body.classList.contains('studio-picking')) return;
      // A tap is handled as a click (see stage), so the first tap can choose the field without leaving.
      if (event.pointerType === 'touch') return;
      timer = setTimeout(attempt, DWELL);
    });
    card.addEventListener('pointerleave', () => clearTimeout(timer));
    // Keyboard focus selects at once; the focus a tap gives the link does not, so the tap's click decides.
    let tapped = 0;
    card.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') tapped = performance.now(); });
    card.addEventListener('focusin', () => { if (performance.now() - tapped > 800) activate(); });
  }

  function stage() {
    const anchors = document.querySelector('.hero-anchors');
    const fans = document.querySelector('.hero-fans');
    if (!anchors || !fans) return;
    const trigger = anchors.dataset.trigger || 'hover';
    const cards = [...anchors.querySelectorAll('[data-anchor-card]')];
    const sets = [...fans.querySelectorAll('.fan-set')];
    let current = null;
    const select = id => {
      const index = cards.findIndex(c => c.dataset.anchorCard === id);
      if (index < 0 || id === current) return;
      current = id;
      orderHand(anchors, index);
      sets.forEach(s => {
        const on = s.dataset.for === id;
        s.classList.toggle('is-active', on);
        s.setAttribute('aria-hidden', String(!on));
        if (on) orderHand(s.querySelector('.poker'), null);
      });
    };
    select(cards[0]?.dataset.anchorCard);
    window.PortfolioStage = { select, current: () => current };

    // The active card stays on top after the pointer leaves; only another card replaces it.
    // On touch there is no hover: the first tap on a card chooses its field, a second tap goes to it.
    let lastPointer = 'mouse';
    anchors.addEventListener('pointerdown', event => { lastPointer = event.pointerType; }, true);
    cards.forEach(card => {
      const id = card.dataset.anchorCard;
      if (trigger === 'hover') onDwell(card, () => select(id), fans);
      card.querySelector('a')?.addEventListener('click', event => {
        if ((trigger === 'click' || lastPointer === 'touch') && current !== id) { event.preventDefault(); select(id); return; }
        if (anchors.dataset.anchorClick === 'locate' && locate(id)) event.preventDefault();
      });
    });

    sets.forEach(set => {
      const hand = set.querySelector('.poker');
      if (!hand) return;
      // Keyboard focus on a card of a hidden hand shows that hand, so focus never lands on something invisible.
      set.addEventListener('focusin', () => select(set.dataset.for));
      orderHand(hand, null);
      [...hand.querySelectorAll('.poker-card')].forEach((card, i) => {
        onDwell(card, () => orderHand(hand, i));
        card.querySelector('a')?.addEventListener('click', event => {
          if (fans.dataset.fanClick === 'locate' && locate(card.dataset.fanCard)) event.preventDefault();
        });
      });
    });
  }

  /* ---------------------------------------------------------------- showcase pictures */
  function showcases() {
    document.querySelectorAll('.project-picture.showcase[data-showcase]').forEach(box => {
      const mode = box.dataset.showcase;
      if (mode === 'fan') return;
      const shots = [...box.querySelectorAll(':scope > img')];
      const caps = [...box.querySelectorAll('.shot-captions > span')];
      const dots = [...box.querySelectorAll('.shot-dot')];
      if (shots.length < 2) return;
      let index = 0, timer = null;
      const show = next => {
        index = (next + shots.length) % shots.length;
        shots.forEach((s, i) => s.classList.toggle('is-active', i === index));
        caps.forEach((c, i) => c.classList.toggle('is-active', i === index));
        dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
      };
      const interval = Number(box.dataset.interval) || 4200;
      const start = () => { if (!timer && !reduced.matches) timer = setInterval(() => show(index + 1), interval); };
      const stop = () => { clearInterval(timer); timer = null; };
      dots.forEach(dot => {
        const pick = event => { event.preventDefault(); event.stopPropagation(); stop(); show(Number(dot.dataset.shot)); };
        dot.addEventListener('click', pick);
        dot.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') pick(e); });
      });
      box.addEventListener('pointerenter', stop);
      box.addEventListener('pointerleave', start);
      // Only run while the card is on screen.
      new IntersectionObserver(entries => entries.forEach(e => e.isIntersecting ? start() : stop()), { rootMargin: '80px' }).observe(box);
    });
  }

  /* ---------------------------------------------------------------- tile videos */
  function tileVideos() {
    document.querySelectorAll('[data-tile-video]').forEach(video => {
      video.muted = true;
      const play = () => { if (!reduced.matches) video.play().catch(() => {}); };
      const stop = () => { video.pause(); };
      video.closest('.note-tile')?.addEventListener('pointerenter', play);
      video.closest('.note-tile')?.addEventListener('pointerleave', stop);
      new IntersectionObserver(entries => entries.forEach(e => e.isIntersecting ? play() : stop()), { rootMargin: '40px' }).observe(video);
    });
  }

  /* ---------------------------------------------------------------- section rail */
  function rail() {
    const nav = document.querySelector('.section-rail[data-rail-design]');
    if (!nav) return;
    const design = nav.dataset.railDesign;
    if (design === 'flat') return;
    const groups = [...nav.querySelectorAll('.rail-subs')].map(subs => ({
      subs, parent: nav.querySelector(`a[data-section="${subs.dataset.for}"]`), section: document.getElementById(subs.dataset.for),
    })).filter(g => g.parent && g.section);
    if (!groups.length) return;
    if (design === 'flyout') {
      groups.forEach(({ subs, parent }) => {
        const open = state => {
          if (state) subs.style.top = `${parent.offsetTop}px`;
          subs.classList.toggle('is-open', state);
        };
        parent.addEventListener('pointerenter', () => open(true));
        parent.addEventListener('focusin', () => open(true));
        subs.addEventListener('pointerenter', () => open(true));
        [parent, subs].forEach(node => node.addEventListener('pointerleave', () => setTimeout(() => {
          if (!subs.matches(':hover') && !parent.matches(':hover')) open(false);
        }, 120)));
        nav.addEventListener('pointerleave', () => open(false));
      });
    }
    if (design === 'inline') {
      // Sub-entries take up room only while their section is the one being read.
      const sync = () => groups.forEach(({ subs, section }) => {
        const box = section.getBoundingClientRect();
        subs.classList.toggle('is-open', box.top < innerHeight * 0.6 && box.bottom > innerHeight * 0.25);
      });
      addEventListener('scroll', sync, { passive: true });
      addEventListener('resize', sync, { passive: true });
      sync();
    }
    // Light the sub-entry whose lane is in view, in every design that shows them.
    const lanes = groups.flatMap(({ subs }) => [...subs.querySelectorAll('a')].map(link => ({
      link, target: document.getElementById(link.getAttribute('href').slice(1)),
    }))).filter(l => l.target);
    if (!lanes.length) return;
    const mark = () => lanes.forEach(({ link, target }) => {
      const box = target.getBoundingClientRect();
      link.classList.toggle('is-lit', box.top < innerHeight * 0.5 && box.bottom > 0);
    });
    addEventListener('scroll', mark, { passive: true });
    mark();
  }

  let sizing = null;
  addEventListener('resize', () => { clearTimeout(sizing); sizing = setTimeout(sizeHands, 150); }, { passive: true });
  ready(() => { hands(); stage(); sizeHands(); showcases(); tileVideos(); rail(); });
})();
