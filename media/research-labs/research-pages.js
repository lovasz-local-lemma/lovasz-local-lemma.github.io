/* Observe reading position. A requested floor stays lit only during its scroll. */
(() => {
  'use strict';
  const camera='<svg viewBox="0 0 24 20" width="15" height="13" aria-hidden="true"><rect x="1" y="3" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 7 7-4v14l-7-4z" fill="currentColor"/></svg>';
  for(const link of document.querySelectorAll('nav#TOC a[href^="#"],.side-nav a.nav-item[href^="#"]')){
    const section=document.getElementById(link.hash.slice(1));
    if(!section)continue;
    const interactive=section.matches('.interactive-study')||!!section.querySelector('.interactive-study,.lab-frame,[data-lab-src],canvas');
    const video=!!section.querySelector('video,iframe[src*="youtube.com/embed/"],iframe[src*="player.vimeo.com/"]');
    if(!interactive&&!video)continue;
    const first=link.firstChild?.nodeType===3?link.firstChild:link.firstElementChild?.firstChild;
    if(first?.nodeType===3)first.textContent=first.textContent.replace(/^\s*↔\s*/, '');
    const badges=document.createElement('span');badges.className='rail-media';
    badges.innerHTML=(interactive?'<i class="rail-media-kind rail-media-interactive" title="Interactive" aria-label="Interactive">↔</i>':'')+(video?'<i class="rail-media-kind rail-media-video" title="Video" aria-label="Video">'+camera+'</i>':'');
    link.append(badges);
  }
  const links=[...document.querySelectorAll('nav#TOC a[href^="#"]')];
  if(!links.length)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const targets=links.map(link=>[link,document.getElementById(link.hash.slice(1))])
    .filter(([,target])=>target)
    .sort((a,b)=>a[1].compareDocumentPosition(b[1])&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
  let pending=0,requested=null,settling=0;
  const update=()=>{
    pending=0;
    // Hidden nested links must not extinguish every visible floor indicator.
    const visible=targets.filter(([link,target])=>link.getClientRects().length&&target.getClientRects().length);
    let chosen=requested||visible[0];
    if(!requested){
      for(const entry of visible)if(entry[1].getBoundingClientRect().top<180)chosen=entry;
      if(scrollY+innerHeight>=document.documentElement.scrollHeight-3)chosen=visible.at(-1);
    }
    for(const [link] of targets){
      const active=link===chosen?.[0];link.classList.toggle('active',active);
      if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
    }
  };
  const schedule=()=>{if(!pending)pending=requestAnimationFrame(update);};
  const release=()=>{clearTimeout(settling);requested=null;schedule();};
  for(const entry of targets)entry[0].addEventListener('click',event=>{
    if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();requested=entry;update();
    entry[1].scrollIntoView({behavior:reduced.matches?'auto':'smooth',block:'start'});
    history.replaceState(null,'',entry[0].hash);
    clearTimeout(settling);settling=setTimeout(release,1200);
  });
  addEventListener('scroll',()=>{
    schedule();
    if(requested){clearTimeout(settling);settling=setTimeout(release,160);}
  },{passive:true});
  addEventListener('scrollend',event=>{
    // A scroll inside the lift (or the previous page scroll finishing) is not arrival.
    if(event?.target&&event.target!==document&&event.target!==document.documentElement)return;
    if(requested&&Math.abs(requested[1].getBoundingClientRect().top)>180&&scrollY+innerHeight<document.documentElement.scrollHeight-3)return;
    release();
  },{passive:true});
  for(const name of ['wheel','touchstart','pointerdown'])addEventListener(name,release,{passive:true});
  addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))release();});
  addEventListener('resize',schedule,{passive:true});addEventListener('load',schedule);
  document.fonts?.ready.then(schedule);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(schedule).observe(document.body);
  update();
})();
