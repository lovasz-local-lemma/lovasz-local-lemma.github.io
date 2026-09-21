/* Opt-in generated teaching frames only. Install before their drawing engines.
   A preview drains one initial RAF batch, then retains all subsequent work. */
(() => {
  'use strict';
  if(window.PortfolioLabFrame)return;
  const embedded=window.parent!==window,preview=embedded&&new URLSearchParams(location.search).get('portfolio-preview')==='1';
  const nativeFrame=window.requestAnimationFrame.bind(window),nativeCancel=window.cancelAnimationFrame.bind(window);
  const jobs=new Map(),audio=new Set();let serial=0,scheduled=0,previewJob=0,readyJob=0,hostVisible=!embedded,paused=false,disposed=false,previewPending=preview,ready=false,hasLoaded=document.readyState==='complete';
  const allowed=()=>!disposed&&!paused&&hostVisible&&!document.hidden;
  const targetOrigin=location.origin&&location.origin!=='null'?location.origin:'*';
  const announce=()=>{readyJob=0;if(ready||disposed)return;ready=true;window.parent.postMessage({type:'portfolio-lab-preview-ready'},targetOrigin);};
  function notifyPaint(){if(!ready&&!readyJob)readyJob=nativeFrame(announce);}
  function schedule(){if(!scheduled&&jobs.size&&allowed())scheduled=nativeFrame(flush);}
  function drain(time){const batch=[...jobs.keys()];for(const id of batch){const fn=jobs.get(id);if(!fn)continue;jobs.delete(id);try{fn(time);}catch(error){console.error('Schematic frame callback failed',error);}}}
  function flush(time){scheduled=0;if(!allowed())return;drain(time);notifyPaint();schedule();}
  window.requestAnimationFrame=fn=>{const id=++serial;jobs.set(id,fn);schedule();return id;};
  window.cancelAnimationFrame=id=>jobs.delete(id);
  function quietAudio(){for(const context of audio){if(context.state==='running')context.suspend().catch(()=>{});}document.querySelectorAll('audio,video').forEach(media=>{if(!media.paused)media.pause();});}
  function trackAudio(context){
    if(audio.has(context))return context;audio.add(context);
    const resume=context.resume?.bind(context);if(resume)context.resume=()=>allowed()?resume():Promise.resolve();
    if(!allowed()&&context.state==='running')context.suspend().catch(()=>{});return context;
  }
  // Generated labs create audio only from explicit controls. This guard also
  // prevents a future initializer from making a prewarmed frame audible.
  for(const key of ['AudioContext','webkitAudioContext']){const Native=window[key];if(typeof Native!=='function')continue;function Tracked(...args){return trackAudio(Reflect.construct(Native,args,new.target||Native));}Tracked.prototype=Native.prototype;Object.setPrototypeOf(Tracked,Native);window[key]=Tracked;}
  const mediaPrototype=window.HTMLMediaElement?.prototype;if(mediaPrototype?.play){const play=mediaPrototype.play;mediaPrototype.play=function(...args){return allowed()?play.apply(this,args):Promise.resolve();};}
  document.addEventListener('play',event=>{if(!allowed())event.target.pause?.();},true);
  function sync(){if(!allowed()){nativeCancel(scheduled);scheduled=0;quietAudio();}else{cancelPreview();schedule();if(!jobs.size)notifyPaint();}}
  function cancelPreview(){previewPending=false;nativeCancel(previewJob);previewJob=0;}
  function paintPreview(){
    previewJob=0;if(!previewPending||disposed||document.hidden||hostVisible)return;
    previewPending=false;drain(performance.now());quietAudio();notifyPaint();
  }
  function requestPreview(){if(!hasLoaded||!previewPending||disposed||document.hidden||hostVisible||previewJob)return;previewJob=nativeFrame(()=>{previewJob=nativeFrame(paintPreview);});}
  const loaded=()=>{hasLoaded=true;if(previewPending)requestPreview();else if(allowed()){schedule();if(!jobs.size)notifyPaint();}};
  if(document.readyState==='complete')loaded();else window.addEventListener('load',loaded,{once:true});
  window.addEventListener('message',event=>{
    if(event.source!==window.parent||event.origin!==location.origin)return;
    if(event.data?.type==='portfolio-lab-preview-cancel'){cancelPreview();return;}
    if(event.data?.type!=='portfolio-lab-visibility'||typeof event.data.visible!=='boolean')return;
    hostVisible=event.data.visible;sync();
  });
  document.addEventListener('visibilitychange',()=>{sync();if(!document.hidden)requestPreview();});
  window.addEventListener('pagehide',event=>{disposed=true;nativeCancel(scheduled);nativeCancel(previewJob);nativeCancel(readyJob);scheduled=previewJob=readyJob=0;quietAudio();if(!event.persisted){jobs.clear();audio.forEach(context=>{if(context.state!=='closed')context.close().catch(()=>{});});audio.clear();}});
  window.addEventListener('pageshow',()=>{disposed=false;sync();requestPreview();});
  window.PortfolioLabFrame={preview,trackAudio,setPaused(value){paused=!!value;sync();}};
})();
