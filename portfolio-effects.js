/* Canvas2D embers and a moving section-navigation light. No render dependencies. */
(() => {
  'use strict';
  const ready = () => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const body = document.body;
    const root = document.documentElement;
    let scrollIdleTimer = 0;
    const markScrolling = () => {
      root.classList.add('is-scrolling');
      clearTimeout(scrollIdleTimer);
      scrollIdleTimer = setTimeout(() => root.classList.remove('is-scrolling'), 170);
    };
    window.addEventListener('scroll', markScrolling, { passive: true });

    // Only the small visible border highlights run; offscreen cards stay still.
    const surfaces = [...document.querySelectorAll('.project-card, .hero-art, .launch-item')];
    surfaces.forEach((surface, index) => surface.style.setProperty('--edge-delay', `${-(index % 7) * 1.07}s`));
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => entry.target.classList.toggle('effects-in-view', entry.isIntersecting));
      }, { rootMargin: '100px 0px', threshold: 0 });
      surfaces.forEach(surface => observer.observe(surface));
    } else surfaces.forEach(surface => surface.classList.add('effects-in-view'));

    const rail = document.querySelector('.section-rail');
    if (rail) {
      const links = [...rail.querySelectorAll('a[data-section]')];
      const sections = links.map(link => document.getElementById(link.dataset.section));
      const passingTimers = new Map();
      const ignitionTimers = new Map();
      const aura = document.createElement('span');
      aura.className = 'rail-aura';
      aura.setAttribute('aria-hidden', 'true');
      rail.before(aura);
      const crown = document.createElement('span');
      crown.className = 'rail-crown';
      crown.setAttribute('aria-hidden', 'true');
      crown.innerHTML = '<span>↑</span><span>LIFT</span><span>↓</span>';
      rail.prepend(crown);
      links.forEach((link, index) => { link.dataset.floor = String(index).padStart(2, '0'); });
      // Concentric filaments follow the displayed ink. Every copy expands
      // about the ink center, rather than its baseline or an extrusion vector.
      const svgNS = 'http://www.w3.org/2000/svg', glyphCache = new Map();
      const glyphCanvas = document.createElement('canvas');
      const glyphContext = glyphCanvas.getContext('2d', { willReadFrequently: true });
      const svgElement = (name, attrs, parent) => {
        const element = document.createElementNS(svgNS, name);
        Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
        parent.append(element);
        return element;
      };
      const glyphGeometry = (text, style) => {
        const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const key = `${text}|${font}`;
        if (glyphCache.has(key)) return glyphCache.get(key);
        if (!glyphContext) return null;
        const context = glyphContext, scale = 4, pad = 8;
        context.font = font;
        const metrics = context.measureText(text), size = parseFloat(style.fontSize);
        const ascent = metrics.fontBoundingBoxAscent || size * .8;
        const descent = metrics.fontBoundingBoxDescent || size * .2;
        const baseline = pad + ascent * scale, origin = pad + Math.max(0, metrics.actualBoundingBoxLeft) * scale;
        glyphCanvas.width = Math.ceil((metrics.width + size) * scale + pad * 2);
        glyphCanvas.height = Math.ceil((ascent + descent) * scale + pad * 2);
        context.scale(scale, scale);
        context.font = font;
        context.fillText(text, origin / scale, baseline / scale);
        const width = glyphCanvas.width, height = glyphCanvas.height;
        const pixels = context.getImageData(0, 0, width, height).data;
        const ink = new Uint8Array(width * height);
        let left = width, right = 0, top = height, bottom = 0;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          if (pixels[(y * width + x) * 4 + 3] < 80) continue;
          ink[y * width + x] = 1;
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        if (left > right || top > bottom) return null;
        const point = (x, y) => [(x - origin) / scale - metrics.width / 2, (y - baseline) / scale];
        const anchors = [];
        for (const fraction of [.08, .35, .65, .92]) {
          const y = Math.round(top + (bottom - top) * fraction);
          let l = left, r = right;
          while (l <= right && !ink[y * width + l]) l++;
          while (r >= left && !ink[y * width + r]) r--;
          if (l <= r) { anchors.push(point(l, y)); if (r - l > scale) anchors.push(point(r, y)); }
        }
        const result = { font, ascent, descent, anchors, bounds: [...point(left, top), ...point(right, bottom)] };
        glyphCache.set(key, result);
        return result;
      };
      const engravings = links.map(link => {
        const glyph = link.querySelector(':scope > span:first-child');
        const mesh = svgElement('svg', { class: 'rail-engraving', 'aria-hidden': 'true', focusable: 'false' }, link);
        return { link, glyph, mesh, signature: '' };
      });
      const refreshEngravings = () => {
        for (const item of engravings) {
          const { link, glyph, mesh } = item;
          if (!glyph || !link.offsetWidth || !glyph.textContent.trim()) continue;
          const style = getComputedStyle(glyph), text = glyph.textContent.trim();
          const data = glyphGeometry(text, style);
          if (!data) continue;
          const signature = [text, data.font, glyph.offsetLeft, glyph.offsetTop, glyph.offsetWidth, glyph.offsetHeight, link.clientWidth, link.clientHeight].join('|');
          if (signature === item.signature) continue;
          item.signature = signature; mesh.replaceChildren(); mesh.setAttribute('viewBox', `0 0 ${link.clientWidth} ${link.clientHeight}`);
          mesh.dataset.glyph = text;
          const x = glyph.offsetLeft + glyph.offsetWidth / 2;
          const y = glyph.offsetTop + (glyph.offsetHeight + data.ascent - data.descent) / 2;
          const common = { 'font-family': style.fontFamily, 'font-size': style.fontSize, 'font-style': style.fontStyle, 'font-weight': style.fontWeight, 'text-anchor': 'middle' };
          const [l, t, r, b] = data.bounds;
          const cx = (l + r) / 2, cy = (t + b) / 2;
          mesh.style.transformOrigin = `${x + cx}px ${y + cy}px`;
          const makeHalo = (name, scales, curved) => {
            const group = svgElement('g', { class: name, transform: `translate(${x + cx},${y + cy})` }, mesh);
            scales.forEach((scale, index) => {
              const ring = svgElement('g', { class: `rail-filament-shell rail-shell-${index}`, transform: `scale(${scale})` }, group);
              svgElement('text', { ...common, x: -cx, y: -cy, class: 'rail-glyph-outline' }, ring).textContent = text;
            });
            data.anchors.forEach(([ax, ay], index) => {
              const dx = ax - cx, dy = ay - cy, first = scales[0], last = scales.at(-1);
              const length = Math.hypot(dx, dy) || 1, bend = curved ? (index % 2 ? .8 : -.8) : 0;
              const mx = dx * (first + last) / 2 - dy / length * bend;
              const my = dy * (first + last) / 2 + dx / length * bend;
              svgElement('path', { class: 'rail-filament-link', d: `M${dx * first},${dy * first}Q${mx},${my} ${dx * last},${dy * last}` }, group);
              if (index % 2 === 0) svgElement('circle', { cx: dx * last, cy: dy * last, r: curved ? .55 : .7, class: 'rail-glyph-joint' }, group);
            });
          };
          makeHalo('rail-construction', [1.16, 1.58], false);
          makeHalo('rail-nixie', [1.12, 1.38, 1.7], true);
        }
      };
      let engravingFrame = 0;
      const scheduleEngravings = () => {
        if (engravingFrame) return;
        engravingFrame = requestAnimationFrame(() => { engravingFrame = 0; refreshEngravings(); });
      };
      const glyphObserver = new MutationObserver(scheduleEngravings);
      engravings.forEach(({ glyph }) => { if (glyph) glyphObserver.observe(glyph, { childList: true, characterData: true, subtree: true }); });
      window.addEventListener('resize', scheduleEngravings, { passive: true });
      document.addEventListener('portfolio:design-settings', scheduleEngravings);
      if (document.fonts?.ready) document.fonts.ready.then(() => { glyphCache.clear(); engravings.forEach(item => { item.signature = ''; }); scheduleEngravings(); });
      scheduleEngravings();
      const finish=document.createElement('i');finish.className='rail-finish';finish.setAttribute('aria-hidden','true');rail.append(finish);
      const sparks=document.createElement('div');sparks.className='rail-travel-sparks';sparks.setAttribute('aria-hidden','true');rail.before(sparks);
      // These use viewport coordinates, including on brochures whose rail is
      // nested in a sticky or transformed layout.
      body.append(aura, sparks);
      const sparkAnimations=new Set();
      const clearSparks=()=>{sparkAnimations.forEach(a=>a.cancel());sparkAnimations.clear();sparks.replaceChildren();};
      const indicator = rail.querySelector('.rail-indicator');
      // Avoid repeatedly notifying state observers when scrolling within a floor.
      const setRailState = (key, value) => {
        if (rail.dataset[key] !== value) rail.dataset[key] = value;
      };
      let lastSparkTime = 0, lastSparkPosition = NaN;
      const emitSparks=(now, travelDirection)=>{
        if(!root.hasAttribute('data-elevator-travel-sparks')||motion.matches||document.hidden||!rail.offsetWidth||sparkAnimations.size>=40||!indicator||now-lastSparkTime<65)return;
        // The aura and sparks share the carriage rectangle read by renderCar.
        const rect=carRect, frame=geometry;
        if(!rect||!frame)return;
        const center=rect.top+rect.height*.5;
        if(center<frame.top||center>frame.bottom||Math.abs(center-lastSparkPosition)<1.4)return;
        const layer=sparks.getBoundingClientRect();
        const scaleX=layer.width/Math.max(1,sparks.clientWidth),scaleY=layer.height/Math.max(1,sparks.clientHeight);
        if(!scaleX||!scaleY)return;
        lastSparkTime=now;lastSparkPosition=center;
        for(let n=0;n<4;n++){
          const particle=document.createElement('i'),side=n%2?-1:1;
          particle.style.left=`${((side<0?rect.left:rect.right)-layer.left)/scaleX-1.25}px`;
          particle.style.top=`${(center-layer.top)/scaleY-2.5+(Math.random()-.5)*4}px`;
          particle.style.setProperty('--spark-turn',`${side*(20+Math.random()*35)}deg`);sparks.append(particle);
          const reach=side*(16+Math.random()*20), drift=-travelDirection*(2+Math.random()*3);
          // Keep the bright part at the moving contact; a short sideways burst
          // fades before the carriage travels on to the next floor.
          const animation=particle.animate([
            {transform:'translate(0,0) scale(1.25)',opacity:1},
            {offset:.12,transform:`translate(${reach*.24}px,${drift*.15}px) scale(.95)`,opacity:.8},
            {offset:.4,transform:`translate(${reach*.65}px,${drift*.5}px) scale(.6)`,opacity:.16},
            {transform:`translate(${reach}px,${drift+4}px) scale(.12)`,opacity:0}
          ],{duration:280+Math.random()*100,easing:'linear'});
          sparkAnimations.add(animation);animation.finished.catch(()=>{}).finally(()=>{sparkAnimations.delete(animation);particle.remove();});
        }
      };
      document.addEventListener('portfolio:design-settings',()=>{if(!root.hasAttribute('data-elevator-travel-sparks'))clearSparks();});
      document.addEventListener('visibilitychange',()=>{if(document.hidden)clearSparks();});
      motion.addEventListener('change',()=>{if(motion.matches)clearSparks();});

      let currentIndex = -1;
      let queued = false, railFrame = 0, lastStep = 0;
      let position = NaN, destination = 0, velocity = 0, carHeight = 44;
      let geometry = null, carRect = null, floors = [], crossedIndex = -1;
      let railCenterTarget = null;
      let sectionTops = [], threshold = 145, layoutDirty = true;
      body.classList.add('has-section-rail');

      // A short ignition delay and a much longer CSS decay behave like warm
      // incandescent lamps. Only floors physically crossed by the car light up.
      const ignite = index => {
        if (index < 0 || motion.matches) return;
        const link = links[index];
        clearTimeout(ignitionTimers.get(link));
        ignitionTimers.set(link, setTimeout(() => {
          ignitionTimers.delete(link);
          clearTimeout(passingTimers.get(link));
          link.classList.add('is-passing');
          passingTimers.set(link, setTimeout(() => {
            link.classList.remove('is-passing');
            passingTimers.delete(link);
          }, 240));
        }, 55));
      };
      const renderCar = () => {
        // Only the carriage consumes these variables. Setting inherited values
        // on the whole lift also invalidated every button and filament SVG.
        const style = (indicator || rail).style;
        const y = `${position.toFixed(2)}px`, height = `${carHeight}px`;
        if (style.getPropertyValue('--rail-y') !== y) style.setProperty('--rail-y', y);
        if (style.getPropertyValue('--rail-height') !== height) style.setProperty('--rail-height', height);
        if (geometry && indicator) {
          // Read once after applying the carriage transform. This includes its
          // scale, internal scrolling, borders, and live height transition.
          carRect = indicator.getBoundingClientRect();
          const center = carRect.top + carRect.height / 2;
          aura.style.transform = `translate3d(${carRect.left + carRect.width / 2 - 80}px, ${center - 66}px, 0)`;
          const visible = String(center > geometry.top && center < geometry.bottom);
          if (aura.dataset.visible !== visible) aura.dataset.visible = visible;
        }
      };
      const arrive = () => {
        position = destination;
        velocity = 0;
        setRailState('moving', 'false');
        links.forEach((link, index) => link.classList.toggle('is-lit', index === currentIndex));
        renderCar();
      };
      const stepCar = now => {
        railFrame = 0;
        if (document.hidden || !geometry) return;
        const dt = Math.min((now - lastStep) / 1000 || .016, .035);
        lastStep = now;
        // A damped motor, with bounded acceleration and speed, retains its
        // momentum when the scroll target changes. No restart at each floor.
        const error = destination - position;
        const acceleration = Math.max(-2200, Math.min(2200, error * 105 - velocity * 20.5));
        velocity = Math.max(-470, Math.min(470, velocity + acceleration * dt));
        position += velocity * dt;
        const center = position + carHeight / 2;
        let crossed = -1, nearest = Infinity;
        floors.forEach((floor, index) => {
          const distance = Math.abs(center - floor.center);
          if (distance < nearest && distance < floor.height * .56) { crossed = index; nearest = distance; }
        });
        if (crossed >= 0 && crossed !== crossedIndex) { ignite(crossed); crossedIndex = crossed; }
        renderCar();
        if (Math.abs(velocity) > 8) emitSparks(now, Math.sign(velocity));
        if (Math.abs(error) < .15 && Math.abs(velocity) < .7) arrive();
        else railFrame = requestAnimationFrame(stepCar);
      };
      const updateRail = () => {
        queued = false;
        if (!rail.offsetWidth || (rail.classList.contains('brochure-rail') && !rail.querySelector('details')?.open)) {
          geometry = null;
          carRect = null;
          cancelAnimationFrame(railFrame);
          railFrame = 0;
          if (aura.dataset.visible !== 'false') aura.dataset.visible = 'false';
          setRailState('ready', 'false');
          setRailState('moving', 'false');
          return;
        }
        if (layoutDirty) {
          const firstSection = sections.find(Boolean);
          threshold = rail.classList.contains('brochure-rail')
            ? Math.max(145,(parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||0)+(parseFloat(getComputedStyle(firstSection).scrollMarginTop)||0)+12)
            : Math.max(145, window.innerHeight * .27);
          sectionTops = sections.map(section => section ? section.getBoundingClientRect().top + window.scrollY : Infinity);
          floors = links.map(link => ({ center: link.offsetTop + link.offsetHeight / 2, height: link.offsetHeight }));
          layoutDirty = false;
        }
        // The rail may move from document flow into its sticky position while
        // the page scrolls. Keep only this viewport-relative rectangle live;
        // chapter and floor geometry remains cached.
        geometry = rail.getBoundingClientRect();
        let nextIndex = sections.findIndex(Boolean);
        const readingLine = window.scrollY + threshold;
        sectionTops.forEach((top, index) => {
          if (top <= readingLine) nextIndex = index;
        });
        if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8) {
          for (let index = sections.length - 1; index >= 0; index--) {
            if (sections[index]) { nextIndex = index; break; }
          }
        }
        if (nextIndex < 0) return;
        const selected = links[nextIndex];
        destination = selected.offsetTop;
        carHeight = selected.offsetHeight;
        setRailState('ready', 'true');
        // Follow a new chapter once. Scrolling the chapter list itself must never
        // pull it back to the current chapter; readers may be browsing ahead.
        if (nextIndex !== currentIndex && rail.clientHeight && (selected.offsetTop < rail.scrollTop + 7 ||
          selected.offsetTop + selected.offsetHeight > rail.scrollTop + rail.clientHeight - 7)) {
          const top = Math.max(0, Math.min(rail.scrollHeight - rail.clientHeight,
            selected.offsetTop - rail.clientHeight / 2 + selected.offsetHeight / 2));
          // The rail's own scroll events must not restart an in-flight easing.
          if (railCenterTarget === null || Math.abs(top - railCenterTarget) > 1) {
            railCenterTarget = top;
            rail.scrollTo({ top, behavior: motion.matches ? 'instant' : 'smooth' });
          }
        } else railCenterTarget = null;
        if (nextIndex !== currentIndex) {
          links.forEach((link, index) => {
            if (index === nextIndex) link.setAttribute('aria-current', 'location');
            else if (link.hasAttribute('aria-current')) link.removeAttribute('aria-current');
          });
        }
        currentIndex = nextIndex;
        if (!Number.isFinite(position) || motion.matches) {
          cancelAnimationFrame(railFrame);
          railFrame = 0;
          arrive();
          crossedIndex = nextIndex;
        } else if (Math.abs(destination - position) > .15) {
          setRailState('direction', destination > position ? 'down' : 'up');
          if (rail.dataset.moving !== 'true') links.forEach(link => link.classList.remove('is-lit'));
          setRailState('moving', 'true');
          if (!railFrame && !document.hidden) { lastStep = performance.now(); railFrame = requestAnimationFrame(stepCar); }
        } else renderCar();
      };
      const scheduleRail = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(updateRail);
      };
      window.addEventListener('scroll', scheduleRail, { passive: true });
      window.addEventListener('resize', () => { layoutDirty = true; scheduleRail(); }, { passive: true });
      document.addEventListener('portfolio:design-settings', () => { layoutDirty = true; scheduleRail(); });
      window.addEventListener('load', scheduleRail, { once: true });
      rail.addEventListener('scroll', scheduleRail, { passive: true });
      rail.querySelector('details')?.addEventListener('toggle', () => { layoutDirty = true; scheduleRail(); });
      document.addEventListener('toggle', () => { layoutDirty = true; scheduleRail(); }, true);
      document.addEventListener('load', event => {
        if (event.target instanceof HTMLImageElement || event.target instanceof HTMLVideoElement) {
          layoutDirty = true;
          scheduleRail();
        }
      }, true);
      document.addEventListener('visibilitychange', () => {
        cancelAnimationFrame(railFrame);
        railFrame = 0;
        if (!document.hidden) scheduleRail();
      });
      motion.addEventListener('change', () => {
        if (motion.matches) {
          ignitionTimers.forEach(clearTimeout);
          passingTimers.forEach(clearTimeout);
          ignitionTimers.clear();
          passingTimers.clear();
          links.forEach(link => link.classList.remove('is-passing'));
        }
        scheduleRail();
      });
      if ('ResizeObserver' in window) new ResizeObserver(() => { layoutDirty = true; scheduleRail(); }).observe(rail);
      if (document.fonts?.ready) document.fonts.ready.then(() => { layoutDirty = true; scheduleRail(); });
      scheduleRail();
    }

    const canvas = document.querySelector('.spark-field');
    if (!canvas || canvas.dataset.emberField === 'ready') return;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;
    canvas.dataset.emberField = 'ready';

    const emberField = window.PortfolioEmbers.create(context);
    let width = 1, height = 1, dpr = 1;
    let time = 0, lastPaint = 0, nextPaint = 0, animationFrame = 0, resizeFrame = 0;
    let atmosphere = null;
    const paintEmbers = (dt, animate) => emberField.paint({
      width, height, time, dt, animate, reduced: motion.matches,
      settings: atmosphere?.embers,
      heat: atmosphere?.scene === 'embers' ? atmosphere.renderHeat : null
    });

    const paint = (dt, animate) => {
      time += dt;
      if (atmosphere && !['embers','energy'].includes(atmosphere.scene)) atmosphere.render(context, width, height, time);
      else paintEmbers(dt, animate);
      atmosphere?.dissolve(context, width, height, dt, animate);
    };
    const tick = now => {
      animationFrame = requestAnimationFrame(tick);
      const elapsed = now - lastPaint;
      // Keep the atmosphere moving during scrolling and elevator navigation.
      const fps = atmosphere?.scene === 'energy' ? 30 : 24;
      const interval=1000 / fps;
      if (now < nextPaint - .5) return;
      nextPaint += interval;
      if (nextPaint < now) nextPaint = now + interval;
      lastPaint = now;
      paint(Math.min(elapsed / 1000, .07), true);
    };
    const synchronizeMotion = () => {
      body.classList.toggle('effects-paused', document.hidden || motion.matches || !!atmosphere?.paused);
      if (document.hidden || motion.matches || atmosphere?.paused || atmosphere?.visible === false) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        if (!document.hidden) paint(0, false);
      } else if (!animationFrame) {
        // Continuous slider events must not postpone every scheduled paint.
        lastPaint = performance.now(); nextPaint=lastPaint; animationFrame = requestAnimationFrame(tick);
      }
    };
    const resize = () => {
      resizeFrame = 0;
      width = Math.max(1, document.documentElement.clientWidth);
      height = Math.max(1, window.innerHeight);
      // The field is deliberately soft. Bounding its backing store prevents a
      // high-DPI full-screen canvas from competing with brochure interaction.
      dpr = Math.min(window.devicePixelRatio || 1, 1.75, Math.sqrt(2400000 / (width * height)));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      atmosphere?.resize();
      emberField.resize(width, height);
      paint(0, false);
    };
    window.addEventListener('resize', () => {
      if (!resizeFrame) resizeFrame = requestAnimationFrame(resize);
    }, { passive: true });
    document.addEventListener('visibilitychange', synchronizeMotion);
    motion.addEventListener('change', synchronizeMotion);
    window.addEventListener('pagehide', () => {cancelAnimationFrame(animationFrame);animationFrame=0;});
    window.addEventListener('pageshow', synchronizeMotion);
    atmosphere = window.PortfolioAtmospheres?.create(canvas, motion, synchronizeMotion) || null;
    window.PortfolioAtmosphereCurrent = atmosphere;
    resize();
    synchronizeMotion();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
