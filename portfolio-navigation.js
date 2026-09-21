/* Installed in the head: paint the dark shell before any application initializes. */
(() => {
  if (window.PortfolioNavigation) return;
  const html=document.documentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const reloading=performance.getEntriesByType('navigation')[0]?.type==='reload';
  let incoming=false, enterAnimation=null, leaving=null;
  if(!reloading&&!reduced.matches)html.classList.add('portfolio-booting');
  const failSafe=setTimeout(()=>html.classList.remove('portfolio-booting'),2500);
  addEventListener('pagereveal',event=>{
    incoming=Boolean(event.viewTransition);
    if(incoming){enterAnimation?.cancel();html.classList.remove('portfolio-booting');}
  });
  function restore(){
    html.classList.remove('portfolio-booting','page-departing');
    enterAnimation?.cancel();leaving?.animation?.cancel();leaving=null;
  }
  async function navigate(href){
    const url=new URL(href,location.href);
    if(url.origin!==location.origin){location.assign(url.href);return;}
    if(url.pathname===location.pathname&&url.search===location.search&&url.href.includes('#')){restore();location.assign(url.href);return;}
    if(reduced.matches||'CSSViewTransitionRule' in window){location.assign(url.href);return;}
    leaving?.animation?.cancel();
    const task={};leaving=task;
    task.animation=document.body.animate([{opacity:getComputedStyle(document.body).opacity},{opacity:0}],{duration:220,easing:'ease-in',fill:'forwards'});
    try{await task.animation.finished;}catch{return;}
    if(leaving===task)location.assign(url.href);
  }
  window.PortfolioNavigation={navigate};
  function ready(){
    clearTimeout(failSafe);
    const wasPending=html.classList.contains('portfolio-booting');
    html.classList.remove('portfolio-booting');
    // A refresh keeps its first rendered frame: never flash it and fade it again.
    if(wasPending&&!incoming&&!reduced.matches)enterAnimation=document.body.animate([{opacity:0},{opacity:1}],{duration:360,easing:'ease-out'});
    // Window bubbling follows the document's connection/overview controllers.
    addEventListener('click',event=>{
      const link=event.target.closest('a[href]');
      if(event.defaultPrevented||!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.hasAttribute('download'))return;
      if(link.target&&link.target!=='_self'&&link.target!=='_top')return;
      const url=new URL(link.href,location.href);
      if(url.origin!==location.origin||!/(?:\/$|\.html?$|\/[^./]+$)/i.test(url.pathname))return;
      if(url.pathname===location.pathname&&url.search===location.search&&url.href.includes('#'))return;
      if(link.target==='_top'&&window!==top){
        try{if(top.PortfolioNavigation){event.preventDefault();top.PortfolioNavigation.navigate(url.href);}}catch{}
        return;
      }
      if(!reduced.matches&&!('CSSViewTransitionRule' in window)){event.preventDefault();navigate(url.href);}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
  addEventListener('pageshow',event=>{if(event.persisted)restore();});
})();
