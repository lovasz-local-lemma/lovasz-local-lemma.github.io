/* Controller for the actual 10×10 Aperture camera array. Rendering is demand-driven. */
(() => {
 const base=new URL('./',document.currentScript.src);
 function attach(section,{setup,paint}){
  const $=s=>section.querySelector(s),D=PhotoDisplay,notice=$('[data-quad-state]'),array=$('[data-canvas="array"]');
  let worker=null,cached=null,requested='',contact=null,referencePoster=null,focusPoster=null,failed=false;
  function drawArray(settings){const {ctx,width,height}=D.size(array,16/9);ctx.fillStyle='#0b1720';ctx.fillRect(0,0,width,height);if(contact?.complete&&contact.naturalWidth)ctx.drawImage(contact,0,0,width,height);const cw=width/10,ch=height/10;for(let row=0;row<10;row++)for(let col=0;col<10;col++){const u=-1+2*col/9,v=-1+2*row/9,distance=settings.shape==='disk'?Math.hypot(u,v):Math.max(Math.abs(u),Math.abs(v)),minimum=settings.shape==='disk'?Math.SQRT2/9:1/9;
    if(distance>Math.max(settings.aperture,minimum)+1e-7){ctx.fillStyle='#06101bc0';ctx.fillRect(col*cw,row*ch,cw,ch);}ctx.strokeStyle='#c5e5df50';ctx.lineWidth=.65;ctx.strokeRect(col*cw,row*ch,cw,ch);}
   const index=settings.camera;ctx.strokeStyle='#fff0a2';ctx.lineWidth=2.5;ctx.strokeRect((index%10)*cw+1,Math.floor(index/10)*ch+1,cw-2,ch-2);
  }
  const schedule=setup(section,settings=>{
   drawArray(settings);
   if(!contact&&typeof Image==='function'){contact=new Image();contact.onload=schedule;contact.src=new URL('assets/quad-lightfield/contact-sheet.png',base);referencePoster=new Image();referencePoster.onload=schedule;referencePoster.src=new URL('assets/quad-lightfield/reference.png',base);focusPoster=new Image();focusPoster.onload=schedule;focusPoster.src=new URL('assets/quad-lightfield/refocus-default.png',base);}
   if(!cached){const centerCanvas=$('[data-canvas="center"]'),focusCanvas=$('[data-canvas="focus"]');
    if(referencePoster?.complete&&referencePoster.naturalWidth&&settings.camera===44){const {ctx,width,height}=D.size(centerCanvas,16/9);ctx.drawImage(referencePoster,0,0,width,height);}else if(contact?.complete&&contact.naturalWidth){const {ctx,width,height}=D.size(centerCanvas,16/9),cellW=contact.naturalWidth/10,cellH=contact.naturalHeight/10;ctx.drawImage(contact,(settings.camera%10)*cellW,Math.floor(settings.camera/10)*cellH,cellW,cellH,0,0,width,height);}
    if(focusPoster?.complete&&focusPoster.naturalWidth){const {ctx,width,height}=D.size(focusCanvas,16/9);ctx.drawImage(focusPoster,0,0,width,height);}
   }
   const key=JSON.stringify(settings);
   if(!worker&&!failed){if(typeof Worker!=='function'){failed=true;notice.textContent='A Web Worker is required to refocus this captured camera array.';return;}
    worker=new Worker(new URL('photo-quad-worker.js',base));worker.onmessage=({data})=>{if(data.type==='progress'){if(data.key===requested)notice.textContent=`Loading real captures · ${data.done} / ${data.total} · ${data.cached} cached${cached?' · previous result retained':' · saved default preview shown'}`;return;}if(data.type==='error'){failed=true;notice.textContent=data.message;return;}if(data.type==='result'&&data.key===requested){cached=data;schedule();}};worker.onerror=event=>{event.preventDefault();failed=true;notice.textContent='The light-field worker could not start. The other photography studies remain available.';};
   }
   if(key!==requested&&!failed){requested=key;notice.textContent=cached?'Updating focus · previous result retained':'Loading real captures · saved default preview shown';worker.postMessage({type:'render',key,settings});}
   if(!cached||cached.key!==key)return;
   const drawn=paint($('[data-canvas="center"]'),cached.images.center),ctx=drawn.ctx;ctx.strokeStyle='#ffe7a0';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,(settings.row+.5)*drawn.sy);ctx.lineTo(drawn.width,(settings.row+.5)*drawn.sy);ctx.stroke();
   paint($('[data-canvas="focus"]'),cached.images.focus);paint($('[data-canvas="epi"]'),cached.images.epi,{height:128});paint($('[data-canvas="shear"]'),cached.images.shear,{height:128});
   $('[data-stat="views"]').textContent=cached.views;$('[data-stat="coverage"]').textContent=(cached.coverage*100).toFixed(1)+'%';$('[data-stat="focus"]').textContent=cached.disparity.toFixed(2)+' px';
   notice.textContent=`${cached.width} × ${cached.height} actual captures · camera (${cached.selected.col}, ${cached.selected.row}) · ${cached.quality==='full'?'full-resolution sum':'interactive preview; refining'} · ${cached.views} views integrated in linear light`;
  });
  array.addEventListener('pointerdown',event=>{const rect=array.getBoundingClientRect(),col=Math.min(9,Math.max(0,Math.floor((event.clientX-rect.left)/rect.width*10))),row=Math.min(9,Math.max(0,Math.floor((event.clientY-rect.top)/rect.height*10))),control=$('[data-input="camera"]');control.value=String(row*10+col);control.dispatchEvent(new Event('input',{bubbles:true}));});
  // Stop acquisition between files and skip pending high-resolution work while away.
  let onScreen=false;const update=()=>worker?.postMessage({type:'active',value:onScreen&&!document.hidden});
  new IntersectionObserver(es=>{onScreen=es[0].isIntersecting;update();},{rootMargin:'180px'}).observe(section);document.addEventListener('visibilitychange',update);
 }
 globalThis.PhotoQuad={attach};
})();
