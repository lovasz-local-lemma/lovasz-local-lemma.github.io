/* Embedded full articles keep their own typography, figures and working demos. */
(() => {
  if (parent === window || !new URLSearchParams(location.search).has('portfolio-article')) return;
  const announceReady = () => parent.postMessage({type:'portfolio-article-ready'},location.origin);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',announceReady,{once:true});
  else announceReady();
  const style = document.createElement('style');
  style.textContent = `html,body{height:auto!important;min-height:0!important;overflow:visible!important;scroll-behavior:auto!important}body{margin:0!important}.portfolio-document-return,.original-version-switch,.portfolio-demo-return,nav.toc,.toc.sidebar,aside.sidebar{display:none!important}body>.layout{display:block!important}body>.layout>main{width:auto!important;margin:0!important;max-width:none!important}img,svg,video{max-width:100%}select{color-scheme:dark}`;
  document.head.append(style);
  document.addEventListener('click', event => {
    const a=event.target.closest('a[href]');
    if(!a || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
    const url=new URL(a.href,location.href);
    if(url.origin!==location.origin || url.pathname!==location.pathname || !url.hash)return;
    let target;try{target=document.getElementById(decodeURIComponent(url.hash.slice(1)));}catch{return;}
    if(!target)return;
    event.preventDefault();
    for(let p=target.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
    parent.postMessage({type:'portfolio-article-anchor',top:target.getBoundingClientRect().top+scrollY},location.origin);
  });
})();
