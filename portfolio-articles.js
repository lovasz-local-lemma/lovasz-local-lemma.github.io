/* A closed document has no browsing context or decoding work. Open ones retain state. */
(() => {
  const frames=[...document.querySelectorAll('iframe[data-article-src]')];
  const states=new Map();
  const tell=(frame,visible)=>frame.contentWindow?.postMessage({type:'portfolio-lab-visibility',visible},location.origin);
  const sync=frame=>{
    const state=states.get(frame),open=frame.closest('details').open;
    if(open&&state.near&&!frame.hasAttribute('src')){
      const url=new URL(frame.dataset.articleSrc,location.href);url.searchParams.set('portfolio-article','1');
      frame.loading='eager';frame.src=url.href;frame.previousElementSibling.textContent='Loading the complete document…';
    }
    if(frame.hasAttribute('src'))tell(frame,open&&state.visible&&!document.hidden);
  };
  const nearby=new IntersectionObserver(entries=>entries.forEach(e=>{states.get(e.target).near=e.isIntersecting;sync(e.target);}),{rootMargin:'500px'});
  const visible=new IntersectionObserver(entries=>entries.forEach(e=>{states.get(e.target).visible=e.isIntersecting;sync(e.target);}),{threshold:0});
  frames.forEach(frame=>{
    states.set(frame,{near:false,visible:false});nearby.observe(frame);visible.observe(frame);
    frame.closest('details').addEventListener('toggle',()=>sync(frame));
    const reveal=()=>{
      if(!frame.hasAttribute('src'))return;
      const doc=frame.contentDocument;if(!doc?.body || doc.URL==='about:blank')return;
      if(states.get(frame).document===doc)return;
      states.get(frame).document=doc;
      const status=frame.previousElementSibling;status.textContent='Full document · read and interact here';
      frame.classList.add('is-loaded');
      let queued=false,last=0;
      const size=()=>{queued=false;if(!frame.closest('details').open)return;const height=Math.ceil(doc.body.scrollHeight);if(height>0&&Math.abs(height-last)>2){last=height;frame.style.height=height+'px';}};
      const queue=()=>{if(!queued){queued=true;requestAnimationFrame(size);}};
      new ResizeObserver(queue).observe(doc.body);
      frame.closest('details').addEventListener('toggle',queue);
      doc.addEventListener('load',queue,true);doc.fonts?.ready.then(queue);
      queue();sync(frame);
    };
    states.get(frame).reveal=reveal;
    frame.addEventListener('load',reveal);
  });
  document.addEventListener('visibilitychange',()=>frames.forEach(sync));
  addEventListener('message',e=>{
    if(e.origin===location.origin && e.data?.type==='portfolio-article-ready'){
      const frame=frames.find(f=>f.contentWindow===e.source);if(frame)states.get(frame).reveal();return;
    }
    if(e.origin!==location.origin || e.data?.type!=='portfolio-article-anchor' || !Number.isFinite(e.data.top))return;
    const frame=frames.find(f=>f.contentWindow===e.source);if(!frame)return;
    const top=Math.max(0,frame.getBoundingClientRect().top+scrollY+e.data.top-110);
    scrollTo({top,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  });
})();
