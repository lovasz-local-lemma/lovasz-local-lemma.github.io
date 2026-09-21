/* Procedural atmosphere studies. One shared Canvas2D clock; no shaders or assets. */
(() => {
  'use strict';
  const presets = [
    ['energy', 'Campfire sparks', 'Distant pinpoints, warm rising embers and soft foreground sparks. Curved updrafts over a quiet amber glow.'],
    ['embers', 'Ember forge', 'Copper updrafts, hot sparks, and the glow of a working furnace.'],
    ...(window.PortfolioFireStudies?.presets || []),
    ['caustics', 'Caustic silk', 'Luminous folds of amber and cyan, like light gathered by rippling glass.'],
    ['orrery', 'Celestial brass', 'An engraved night sky of precessing orbits, fine graduations, and starlight.'],
    ['aurora', 'Aurora glass', 'Translucent jade and violet curtains suspended above a warm horizon.'],
    ['contours', 'Living contours', 'Nested copper and opal contours, slowly breathing like an imaginary terrain.'],
    ['signals', 'Signal network', 'Moving pulses through a schematic texture and feedback graph. Decorative, not execution telemetry.'],
    ['sweep', 'Geometric sweep', 'A moving construction line and families of parabolic arcs. A schematic motif, not an algorithm replay.'],
    ['resonance', 'Resonant modes', 'Superposed standing-wave traces, inspired by modal vibration.'],
    ['paths', 'Transport paths', 'A field of connected light paths with moving contribution markers.'],
    ['journey', 'Section journey · Automatic', 'Let the page change the atmosphere: warm fire and sparks, with pools of optical light between sections.']
  ];
  // A small editable score, independent of project IDs and the desktop lift.
  const homeScenes = {hero:'embers', signature:'cinderstorm', graphics:'caustics',
    systems:'firewhirl', interactive:'embers', mathematics:'orrery', studies:'hearth',
    topics:'cinderstorm', connections:'hearth', about:'hearth'};
  const chapterScenes = ['cinderstorm', 'caustics', 'embers', 'firewhirl', 'hearth'];
  const TAU = Math.PI * 2;
  const fract = value => value - Math.floor(value);
  const noise = seed => fract(Math.sin(seed * 127.1 + 311.7) * 43758.5453);

  function create(canvas, motion, onChange) {
    const project=document.body.dataset.projectId;
    const storageKey = project ? 'portfolio:atmosphere-project:'+project : 'portfolio:atmosphere-v2';
    let mode = document.body.dataset.defaultAtmosphere || 'energy', paused = false, intensity = .85;
    const baseline=window.PortfolioVisualDefaults?.settings?.atmosphere;
    const authored=baseline?.selections?.find(item=>item.scope===(project||'portfolio'))||(baseline?.active?.scope===(project||'portfolio')?baseline.active:null);
    if(authored){if(presets.some(([id])=>id===authored.mode))mode=authored.mode;if(typeof authored.paused==='boolean')paused=authored.paused;if(Number.isFinite(authored.intensity))intensity=Math.max(0,Math.min(1,authored.intensity));}
    let embers = window.PortfolioEmbers.normalize();
    try { embers = window.PortfolioEmbers.normalize(JSON.parse(localStorage.getItem('portfolio:ember-tuning-v1'))); } catch { /* Defaults are usable without storage. */ }
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (presets.some(([id]) => id === saved?.mode)) mode = saved.mode;
      if (typeof saved?.paused === 'boolean') paused = saved.paused;
      if (Number.isFinite(saved?.intensity)) intensity = Math.max(0, Math.min(1, saved.intensity));
    } catch { /* Preferences are optional. */ }

    const frame = document.createElement('canvas');
    const frameContext = frame.getContext('2d');
    let fade = 1, fadeDuration = .65;
    let scene = mode === 'journey' ? 'embers' : mode;
    let activeRegion = -1, regionFrame = 0;
    // The default must not allocate or advance the old heat simulation.
    let fire;
    const fireStudy=()=>fire || (fire=window.PortfolioFireStudies?.create());
    const article = document.body.dataset.page === 'project';
    const regions = [...document.querySelectorAll(article
      ? '.project-page > .project-hero, .project-page > .story-section'
      : 'main > .hero-section, main > .content-section, main > .about-section')].map((element, index) => ({
        element,
        name: element.querySelector('h1,h2')?.textContent.trim() || 'Introduction',
        scene: article ? (index === 0 ? 'embers' : element.matches('.scope-section,.evolution')
          ? 'hearth' : chapterScenes[(index - 1) % chapterScenes.length]) : (homeScenes[element.id] || 'embers')
      }));
    const shell = document.createElement('div');
    shell.className = 'atmosphere-tools';
    shell.innerHTML = `<button type="button" class="atmosphere-toggle" aria-expanded="false" aria-controls="atmosphere-panel"><span aria-hidden="true">✧</span> Atmosphere</button>
      <section class="atmosphere-panel" id="atmosphere-panel" aria-labelledby="atmosphere-title" hidden>
        <div class="atmosphere-heading"><h2 id="atmosphere-title">Light & atmosphere</h2><button type="button" class="atmosphere-close" aria-label="Close atmosphere controls">×</button></div>
        <div class="atmosphere-swatch" aria-hidden="true"><span></span><i></i><b></b></div>
        <label for="atmosphere-preset">Scene</label><select id="atmosphere-preset"></select>
        <p class="atmosphere-description" id="atmosphere-description"></p>
        <p class="atmosphere-region" hidden><span>This section</span><strong></strong><small></small></p>
        <div class="atmosphere-level"><label for="atmosphere-intensity">Glow intensity</label><output for="atmosphere-intensity"></output></div>
        <input id="atmosphere-intensity" type="range" min="0" max="100" step="5" aria-label="Glow intensity">
        <section class="ember-tuning" aria-labelledby="ember-tuning-title">
          <h3 id="ember-tuning-title">Sparks · three depths</h3>
          <label for="ember-profile">Starting look</label><select id="ember-profile"></select>
          <div class="ember-control-grid"></div>
          <div class="ember-tuning-actions"><button type="button" data-ember-reset>Reset campfire</button><button type="button" data-ember-copy>Copy settings</button></div>
          <output class="ember-recipe" aria-label="Current spark settings"></output><span class="ember-copy-status" role="status"></span>
        </section>
        <label class="atmosphere-motion"><input type="checkbox" id="atmosphere-animate"> Animate atmosphere</label>
        <p class="atmosphere-note"></p>
      </section>`;
    document.body.append(shell);
    const toggle = shell.querySelector('.atmosphere-toggle');
    const panel = shell.querySelector('.atmosphere-panel');
    const select = shell.querySelector('select');
    const slider = shell.querySelector('input[type="range"]');
    const animate = shell.querySelector('input[type="checkbox"]');
    const regionLabel = shell.querySelector('.atmosphere-region');
    const tuning = shell.querySelector('.ember-tuning');
    const profile = shell.querySelector('#ember-profile');
    const recipes = window.PortfolioEmbers.presets;
    Object.entries(recipes).forEach(([id,recipe])=>profile.add(new Option(recipe.label,id)));
    profile.add(new Option('Custom','custom'));
    const tuningInputs = window.PortfolioEmbers.controls.map(([key,label,min,max])=>{
      const row=document.createElement('div');row.className='ember-control';
      row.innerHTML=`<label for="ember-${key}">${label}<output for="ember-${key}"></output></label><input id="ember-${key}" type="range" min="${min}" max="${max}" step="5">`;
      const input=row.querySelector('input');
      input.addEventListener('input',()=>{embers[key]=Number(input.value);updateTuning();saveTuning();onChange();});
      tuning.querySelector('.ember-control-grid').append(row);return {key,input,output:row.querySelector('output')};
    });
    const recipeText=()=> 'Campfire sparks · '+window.PortfolioEmbers.controls.map(([key,label])=>`${label}: ${embers[key]}%`).join(' · ');
    const updateTuning=()=>{
      tuningInputs.forEach(({key,input,output})=>{input.value=embers[key];output.value=`${embers[key]}%`;input.style.setProperty('--range-fill',`${(embers[key]-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`);});
      profile.value=Object.entries(recipes).find(([,r])=>Object.keys(embers).every(k=>r.values[k]===embers[k]))?.[0]||'custom';
      tuning.querySelector('.ember-recipe').value=recipeText();
      tuning.querySelector('.ember-copy-status').textContent='';
    };
    const saveTuning=()=>{try{localStorage.setItem('portfolio:ember-tuning-v1',JSON.stringify(embers));}catch{/* Optional. */}};
    profile.addEventListener('change',()=>{if(!recipes[profile.value])return;embers={...recipes[profile.value].values};updateTuning();saveTuning();onChange();});
    tuning.querySelector('[data-ember-reset]').addEventListener('click',()=>{embers={...window.PortfolioEmbers.defaults};updateTuning();saveTuning();onChange();});
    tuning.querySelector('[data-ember-copy]').addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(recipeText());tuning.querySelector('.ember-copy-status').textContent='Copied. Paste these settings with your feedback.';}
      catch{tuning.querySelector('.ember-copy-status').textContent='Select and copy the settings shown above.';}
    });
    document.addEventListener('portfolio:ember-settings',event=>{
      embers=window.PortfolioEmbers.normalize(event.detail);updateTuning();saveTuning();onChange();
    });
    updateTuning();
    const titleFor = id => presets.find(([key]) => key === id)?.[1] || 'Ember forge';
    select.setAttribute('aria-describedby', 'atmosphere-description');
    presets.forEach(([id, title]) => {
      const option = document.createElement('option');
      option.value = id; option.textContent = title; select.append(option);
    });
    const persist = () => {
      try { localStorage.setItem(storageKey, JSON.stringify({ mode, paused, intensity })); } catch { /* Still usable. */ }
    };
    const update = () => {
      select.value = mode;
      slider.value = Math.round(intensity * 100);
      slider.style.setProperty('--range-fill',`${slider.value}%`);
      shell.querySelector('output').value = `${slider.value}%`;
      shell.querySelector('.atmosphere-description').textContent = presets.find(([id]) => id === mode)[2];
      shell.querySelector('.atmosphere-note').textContent = motion.matches
        ? 'Your reduced-motion setting keeps the scene still.'
        : project ? 'This appearance is saved for this project. Backgrounds are schematic decoration.' : 'Your choice follows you through the portfolio.';
      animate.checked = !paused && !motion.matches;
      animate.disabled = motion.matches;
      document.body.dataset.atmosphere = mode;
      document.body.dataset.atmosphereScene = scene;
      tuning.hidden = !['energy','embers'].includes(scene);
      document.body.style.setProperty('--atmosphere-opacity', intensity);
      regionLabel.hidden = mode !== 'journey';
      regionLabel.querySelector('strong').textContent = regions[activeRegion]?.name || 'This page';
      regionLabel.querySelector('small').textContent = titleFor(scene);
    };
    const changeScene = next => {
      if (next === scene) return false;
      // Snapshot the visible composite, including any interrupted dissolve.
      frame.width = canvas.width; frame.height = canvas.height;
      frameContext?.drawImage(canvas, 0, 0);
      fade = motion.matches || paused || document.hidden || !intensity || !frameContext ? 1 : 0;
      fadeDuration = mode === 'journey' ? 1.15 : .65;
      scene = next;
      return true;
    };
    const resolveRegion = (force = false, initial = false) => {
      if (mode !== 'journey') return false;
      const line = Math.max(150, innerHeight * .4);
      let next = 0;
      regions.forEach((region, index) => {
        if (region.element.getBoundingClientRect().top <= line) next = index;
      });
      // A small deadband keeps tiny wheel/trackpad reversals from flickering.
      if (!force && activeRegion >= 0 && next !== activeRegion) {
        if (next > activeRegion && regions[next]?.element.getBoundingClientRect().top > line - 30) return false;
        if (next < activeRegion && regions[activeRegion]?.element.getBoundingClientRect().top < line + 30) return false;
      }
      activeRegion = next;
      const nextScene = regions[next]?.scene || 'embers';
      if (initial) { scene = nextScene; return false; }
      return changeScene(nextScene);
    };
    const followRegion = () => {
      if (mode !== 'journey' || regionFrame || document.hidden) return;
      regionFrame = requestAnimationFrame(() => {
        regionFrame = 0;
        const previous = activeRegion;
        const changed = resolveRegion();
        if (changed || previous !== activeRegion) update();
        if (changed) onChange();
      });
    };
    const close = (restore = false) => {
      panel.hidden = true; toggle.setAttribute('aria-expanded', 'false');
      if (restore) toggle.focus({ preventScroll: true });
    };
    toggle.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
      if (open) select.focus({ preventScroll: true });
    });
    shell.querySelector('.atmosphere-close').addEventListener('click', () => close(true));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); }
    });
    document.addEventListener('pointerdown', event => {
      if (!panel.hidden && !shell.contains(event.target)) close();
    });
    select.addEventListener('change', () => {
      mode = select.value;
      if (mode === 'journey') resolveRegion(true); else changeScene(mode);
      update(); persist(); onChange();
    });
    slider.addEventListener('input', () => {
      intensity = Number(slider.value) / 100; update(); persist(); onChange();
    });
    animate.addEventListener('change', () => {
      paused = !animate.checked; fade = 1; update(); persist(); onChange();
    });
    motion.addEventListener('change', () => { fade = 1; update(); });
    window.addEventListener('scroll', followRegion, { passive: true });
    window.addEventListener('resize', followRegion, { passive: true });
    window.addEventListener('load', followRegion, { once: true });
    window.addEventListener('pageshow', followRegion);
    window.addEventListener('pagehide', () => { cancelAnimationFrame(regionFrame); regionFrame = 0; });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(regionFrame); regionFrame = 0; }
      else followRegion();
    });
    document.addEventListener('portfolio:graph-rendered', followRegion);
    const main = document.querySelector('main');
    if (main && 'ResizeObserver' in window) new ResizeObserver(followRegion).observe(main);
    document.fonts?.ready.then(followRegion);
    resolveRegion(true, true);
    update();

    // Smooth polylines share the same bounded sample budget at every resolution.
    const trace = (ctx, points, closePath = false) => {
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      if (closePath) ctx.closePath();
    };
    const stroke = (ctx, points, color, alpha, thickness = 1, bloom = false) => {
      trace(ctx, points);
      ctx.strokeStyle = color;
      if (bloom) {
        ctx.globalAlpha = alpha * .12; ctx.lineWidth = thickness + 9; ctx.stroke();
        ctx.globalAlpha = alpha * .21; ctx.lineWidth = thickness + 3; ctx.stroke();
      }
      ctx.globalAlpha = alpha; ctx.lineWidth = thickness; ctx.stroke();
    };
    const glow = (ctx, x, y, r, color, alpha) => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, color); gradient.addColorStop(1, 'transparent');
      ctx.globalAlpha = alpha; ctx.fillStyle = gradient;
      ctx.fillRect(x-r, y-r, r*2, r*2);
    };
    const stars = (ctx, w, h, time, count, color) => {
      ctx.strokeStyle = color; ctx.fillStyle = color;
      for (let i = 0; i < count; i++) {
        const x = noise(i + 5) * w, y = noise(i + 144) * h;
        const a = .24 + .23 * Math.sin(time * .35 + i * 1.7) ** 2;
        ctx.globalAlpha = a; ctx.fillRect(x, y, 1.1, 1.1);
        if (i % 9 === 0) {
          ctx.lineWidth = .65; ctx.beginPath();
          ctx.moveTo(x-3, y); ctx.lineTo(x+3, y);
          ctx.moveTo(x, y-3); ctx.lineTo(x, y+3); ctx.stroke();
        }
      }
    };

    function drawCaustics(ctx, w, h, t) {
      const samples = w < 760 ? 60 : 96;
      const bands = w < 760 ? 24 : 38;
      glow(ctx, w*.86, h*.72, Math.min(w*.58, 550), '#225b5d', .23);
      glow(ctx, w*.1, h*.28, Math.min(w*.4, 380), '#ae661d', .16);
      for (let family = 0; family < 2; family++) {
        for (let band = 0; band < bands; band++) {
          const q = band / (bands - 1), points = [];
          for (let j = 0; j <= samples; j++) {
            const u = j / samples;
            const fold = Math.sin(u*5.7 + t*.15 + q*.86) * Math.sin(u*2.4-q*1.5);
            const x = family ? w*(1.09-u*1.25) : w*(u*1.25-.14);
            const y = h*(.17 + u*.62 + fold*.23 + (q-.5)*(.09+.25*Math.cos(u*3.6+t*.11)**2));
            points.push([x, family ? h-y+h*.07 : y]);
          }
          const color = family ? (band%4 ? '#73cbc5' : '#dab4da') : (band%5 ? '#e4b05e' : '#fff0c4');
          stroke(ctx, points, color, .065 + .105*Math.sin(q*Math.PI)**2, band%7===0 ? 1.25 : .6, band%9===0);
        }
      }
      stars(ctx, w, h, t, w<760?18:35, '#d8f8ee');
    }

    function drawOrrery(ctx, w, h, t) {
      const cx = w*.78, cy = h*.62, base = Math.min(w*.49, h*.63);
      glow(ctx, cx, cy, base*.8, '#8b6b29', .13);
      ctx.save(); ctx.translate(cx, cy);
      ctx.rotate(-.28 + t*.012);
      for (let ring=0; ring<7; ring++) {
        const r=base*(.32+ring*.145), points=[];
        const tilt=.54+.065*ring;
        for(let j=0;j<=120;j++) {
          const a=j/120*TAU;
          points.push([Math.cos(a)*r, Math.sin(a)*r*tilt]);
        }
        ctx.save(); ctx.rotate(ring*.39);
        stroke(ctx, points, ring%3===0?'#c9e9de':'#d7b364', ring%3===0?.24:.18, ring===4?1.15:.6);
        const phase=t*(.033+ring*.008)+ring*2.1;
        const x=Math.cos(phase)*r, y=Math.sin(phase)*r*tilt;
        glow(ctx,x,y,16,'#f4cf7c',.21);
        ctx.globalAlpha=.78; ctx.fillStyle='#ffe8ac';
        ctx.beginPath();ctx.arc(x,y,ring%2?2:2.9,0,TAU);ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle='#e4c17e';
      for(let i=0;i<96;i++) {
        const a=i/96*TAU, r=base*1.2, len=i%8===0?13:4;
        ctx.globalAlpha=i%8===0?.35:.14;ctx.lineWidth=.65;ctx.beginPath();
        ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);
        ctx.lineTo(Math.cos(a)*(r+len),Math.sin(a)*(r+len));ctx.stroke();
      }
      ctx.restore();
      // A second offset instrument gives the margins a different scale.
      const left=[];
      for(let i=0;i<=150;i++) {const a=i/150*TAU;left.push([w*.07+Math.cos(a)*base*.63,h*.23+Math.sin(a)*base*.63]);}
      stroke(ctx,left,'#779a91',.15,.75);
      stars(ctx,w,h,t,w<760?48:95,'#e3d5ac');
    }

    function drawAurora(ctx,w,h,t) {
      const bands=w<760?24:40, samples=w<760?48:78;
      glow(ctx,w*.27,h*.61,Math.min(w*.72,600),'#22695c',.24);
      glow(ctx,w*.84,h*.34,Math.min(w*.54,500),'#624379',.17);
      for(let band=0;band<bands;band++) {
        const q=band/(bands-1), top=[],bottom=[];
        for(let j=0;j<=samples;j++) {
          const u=j/samples, x=w*(u*1.15-.08);
          const crest=h*(.18+.15*Math.sin(u*5.4+t*.12)+.055*Math.sin(u*13-t*.2));
          const drape=h*(.14+.24*Math.sin(u*3.8+t*.09)**2);
          const y=crest+q*drape+.018*h*Math.sin(q*7+u*12+t*.21);
          top.push([x,y]);bottom.push([x,y+6+q*15]);
        }
        trace(ctx,[...top,...bottom.reverse()],true);
        ctx.globalAlpha=.024;ctx.fillStyle=band<bands*.55?'#62bea3':'#a695cf';ctx.fill();
        stroke(ctx,top,band<bands*.45?'#85d4b1':band<bands*.8?'#6cacbd':'#b9a0d4',.045+.08*(1-q),.8,band%12===0);
      }
      // Distant copper horizon stays compatible with the elevator's lamps.
      const horizon=[];
      for(let i=0;i<=80;i++){const u=i/80;horizon.push([u*w,h*(.87+.025*Math.sin(u*10+t*.08))]);}
      stroke(ctx,horizon,'#dbad60',.15,1,true);
      stars(ctx,w,h,t,w<760?25:52,'#dce6d4');
    }

    function drawContours(ctx,w,h,t) {
      const rings=w<760?29:46, samples=w<760?80:116;
      for(let island=0;island<2;island++) {
        const cx=w*(island?.89:.07),cy=h*(island?.29:.76);
        const size=Math.min(w*.62,h*.67);
        glow(ctx,cx,cy,size*.55,island?'#746249':'#236665',.13);
        for(let ring=0;ring<rings;ring++) {
          const q=ring/(rings-1), points=[];
          for(let j=0;j<=samples;j++) {
            const a=j/samples*TAU;
            const r=size*(.07+q*.94)*(1+.10*Math.sin(a*3+t*.10+q*1.8)+.058*Math.cos(a*5-t*.08)+.04*Math.sin(a*8+q*3));
            points.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r*.86]);
          }
          const color=(ring+island)%6===0?'#eac77a':island?'#ad958b':'#76b6b3';
          stroke(ctx,points,color,.10+(ring%6===0?.12:0),ring%6===0?.95:.55,ring%14===0);
        }
      }
      stars(ctx,w,h,t,w<760?12:22,'#dacaa5');
    }

    function drawProjectStudy(ctx,w,h,t,kind){
      const accent=kind==='signals'?'#b6a5ef':kind==='resonance'?'#c7aeef':kind==='paths'?'#8dccdf':'#97dfbb';
      glow(ctx,w*.07,h*.64,Math.min(w*.43,460),accent,.09);
      glow(ctx,w*.96,h*.21,Math.min(w*.35,390),accent,.07);
      for(let side=0;side<2;side++){
        const x0=w*(side?.84:-.03), span=Math.min(310,w*.24);
        if(kind==='signals'){
          const nodes=Array.from({length:12},(_,i)=>[x0+(i%3)*span*.45,h*(.12+Math.floor(i/3)*.23)]);
          for(let i=0;i<11;i++){
            const a=nodes[i],b=nodes[(i+4)%12];
            stroke(ctx,[a,[b[0],a[1]],b],accent,.13,.7);
            const q=fract(t*.16+i*.127),x=a[0]+(b[0]-a[0])*Math.min(1,q*2),y=a[1]+(b[1]-a[1])*Math.max(0,q*2-1);
            glow(ctx,x,y,10,accent,.34);
          }
          nodes.forEach(([x,y])=>{ctx.globalAlpha=.28;ctx.strokeStyle=accent;ctx.strokeRect(x-9,y-9,18,18);});
        }else if(kind==='resonance'){
          for(let n=1;n<=9;n++){
            const points=[];for(let j=0;j<=80;j++){const q=j/80;points.push([x0+q*span,h*(.08+n*.09)+Math.sin(q*Math.PI*(2+n%4))*Math.cos(t*.55+n)*h*.05]);}
            stroke(ctx,points,n%3===0?'#90d9c4':accent,.12+n%3*.035,.8);
          }
        }else if(kind==='sweep'){
          const sweep=h*(.25+.5*fract(t*.027));
          stroke(ctx,[[x0,sweep],[x0+span,sweep]],accent,.36,1);
          for(let i=0;i<5;i++){
            const points=[],cy=h*(.12+i*.17),cx=x0+span*(.2+(i%3)*.26);
            for(let j=0;j<=55;j++){const x=x0+j/55*span;points.push([x,cy+(x-cx)**2/(span*.65)]);}
            stroke(ctx,points,i%2?'#8eb8e9':accent,.16,.8);
            ctx.globalAlpha=.65;ctx.fillStyle=accent;ctx.beginPath();ctx.arc(cx,cy-20,2,0,TAU);ctx.fill();
          }
        }else{
          for(let i=0;i<7;i++){
            const points=[[x0,h*(.08+i*.04)],[x0+span*.8,h*(.32+i*.025)],[x0+span*.15,h*(.69+i*.02)],[x0+span,h*.93]];
            stroke(ctx,points,i%2?'#e9bd84':accent,.17,.8);
            const q=fract(t*.10+i*.13)*3,k=Math.min(2,Math.floor(q)),u=q-k;
            glow(ctx,points[k][0]*(1-u)+points[k+1][0]*u,points[k][1]*(1-u)+points[k+1][1]*u,9,accent,.4);
          }
        }
      }
      stars(ctx,w,h,t,18,accent);
    }

    return {
      get mode(){return mode;},
      get scene(){return scene;},
      get paused(){return paused;},
      get intensity(){return intensity;},
      get visible(){return intensity>0;},
      get embers(){return embers;},
      resize(){fade=1;frame.width=frame.height=1;},
      renderHeat(ctx,w,h,t,strength=1){if(scene==='embers')fireStudy()?.renderHeat?.(ctx,w,h,t,strength);},
      render(ctx,w,h,t) {
        ctx.clearRect(0,0,w,h);ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineJoin='round';
        if(scene==='caustics')drawCaustics(ctx,w,h,t);
        else if(scene==='orrery')drawOrrery(ctx,w,h,t);
        else if(scene==='aurora')drawAurora(ctx,w,h,t);
        else if(scene==='contours')drawContours(ctx,w,h,t);
        else if(['signals','sweep','resonance','paths'].includes(scene))drawProjectStudy(ctx,w,h,t,scene);
        else fireStudy()?.render(scene,ctx,w,h,t);
        ctx.restore();
      },
      dissolve(ctx,w,h,dt,animate) {
        if(!animate || motion.matches){fade=1;return;}
        if(fade>=1)return;
        fade=Math.min(1,fade+dt/fadeDuration);
        const eased=fade*fade*(3-2*fade);
        // Mix premultiplied colors: both the incoming and outgoing scene fade,
        // including pixels where one of the transparent scenes has no marks.
        ctx.save();ctx.globalCompositeOperation='destination-in';
        ctx.globalAlpha=eased;ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
        ctx.globalCompositeOperation='lighter';ctx.globalAlpha=1-eased;
        ctx.drawImage(frame,0,0,w,h);ctx.restore();
      }
    };
  }
  window.PortfolioAtmospheres={create,presets};
})();
