/* Zoom is opt-in for showcase captures; technical figures stay in the article. */
(() => {
  // Authored pixel insets frame the original file; no capture is rewritten.
  const frames=JSON.parse(document.getElementById('media-framing')?.textContent||'{}');
  const frameFor=src=>{
    let path;try{path=new URL(src,location.href).pathname;}catch{return null;}
    return Object.entries(frames).find(([key])=>path.endsWith('/'+key))?.[1]||null;
  };
  const frameImage=img=>{
    const frame=frameFor(img.src),old=img.parentElement?.classList.contains('media-crop')?img.parentElement:null;
    if(!frame){if(old)old.replaceWith(img);return img;}
    const box=old||document.createElement('div'),visible=frame.height-frame.top;
    box.className='media-crop';box.dataset.mediaCropTop=String(frame.top);
    box.style.setProperty('--media-aspect',`${frame.width}/${visible}`);
    box.style.setProperty('--media-ratio',String(frame.width/visible));
    box.style.setProperty('--media-source-height',`${100*frame.height/visible}%`);
    box.style.setProperty('--media-source-top',`${-100*frame.top/visible}%`);
    if(!old){img.replaceWith(box);box.append(img);}return box;
  };
  window.PortfolioMediaFrames={lookup:frameFor,apply:frameImage};
  if(!document.querySelector('link[href*="portfolio-media.css"]')){
    const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('portfolio-media.css',document.currentScript.src);document.head.append(css);
  }
  const init=()=>{
    document.querySelectorAll('a[href]').forEach(a=>{
      const img=a.querySelector('img');if(!img || a.hasAttribute('download'))return;
      const url=new URL(a.href,location.href);
      if(!/\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname))return;
      if(a.hasAttribute('data-showcase-image')&&!/\.svg$/i.test(url.pathname)){
        const button=document.createElement('button');button.type='button';button.className='showcase-zoom';button.dataset.showcaseImage=a.href;button.setAttribute('aria-label','Enlarge showcase: '+img.alt);button.append(...a.childNodes);a.replaceWith(button);
      }else a.replaceWith(...a.childNodes);
    });
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  let dialog,opener,closing=false;
  const close=()=>{
    if(!dialog?.open||closing)return;closing=true;dialog.classList.remove('is-visible');
    setTimeout(()=>{dialog.close();closing=false;opener?.focus({preventScroll:true});},matchMedia('(prefers-reduced-motion: reduce)').matches?0:260);
  };
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-showcase-image]');if(!button)return;
    e.preventDefault();e.stopPropagation();opener=button;
    if(!dialog){
      dialog=document.createElement('dialog');dialog.className='showcase-image-dialog';dialog.setAttribute('aria-label','Showcase image');
      dialog.innerHTML='<button type="button" class="showcase-close" aria-label="Close enlarged image">Close ×</button><figure><img alt=""><figcaption></figcaption></figure>';
      document.body.append(dialog);dialog.querySelector('button').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
    }
    const img=dialog.querySelector('img'),caption=button.querySelector('img')?.alt||'';
    img.src=button.dataset.showcaseImage;img.alt=caption;dialog.querySelector('figcaption').textContent=caption;
    frameImage(img);
    if(!dialog.open)dialog.showModal();requestAnimationFrame(()=>dialog.classList.add('is-visible'));
  },true);
})();
