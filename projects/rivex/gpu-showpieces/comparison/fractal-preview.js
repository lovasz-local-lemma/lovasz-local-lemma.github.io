import {createShaderView} from './driver.js';
import {TAU,sectionParameter,updateSectionDiagram} from './fractal-slice.js';
import {resetFractalInterface,updateFractalInterface,handleFractalPointer,dragFractalPointer,hitFractalPrism} from './fractal-host.js';

const canvas=document.getElementById('interface'),gpu=document.getElementById('gpu'),loading=document.getElementById('loading'),status=document.getElementById('status');
const defaults={lensX:570,lensY:340,cX:-.745,cY:.186,dispersion:1.2,zoom:.16,rotation:.08,mode:0,playing:1};
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
// Embedded visibility belongs to the full host panel once its trusted message arrives.
// The local main-region observer remains the fallback for standalone playback.
let view=null,shader=null,ready=false,time=0,last=0,raf=0,drag=null,hover=0,visible=true,hostPaused=false,hostVisibilityKnown=false,token=0,phase=0,frames=0,pageActive=true;
const number=name=>view?.viewModelInstance?.number(name);
const put=(name,value)=>{const prop=number(name);if(prop&&prop.value!==value)prop.value=value;};
const label=(name,value)=>{const prop=view?.viewModelInstance?.string(name);if(prop&&prop.value!==value)prop.value=value;};
const values=()=>Object.fromEntries([...Object.entries(defaults),...['hoverTarget0','hoverTarget1','hoverTarget2'].map(k=>[k,0])].map(([k,fallback])=>[k,number(k)?.value??fallback]));
function fail(error){ready=false;loading.hidden=false;loading.textContent=String(error?.message||error)+' Use Restart to retry.';status.textContent='This instrument needs browser WebGPU over HTTPS or localhost.';if(parent!==window)parent.postMessage({type:'rivx-garden-error',message:loading.textContent},location.origin);console.error(error);}
function size(){view?.resizeDrawingSurfaceToCanvas(Math.min(devicePixelRatio||1,2));}
const sliceMode=document.getElementById('slice-mode'),sliceW=document.getElementById('slice-w'),sliceAmount=document.getElementById('slice-amount'),sliceTime=document.getElementById('slice-time');
const sectionControls=()=>({sliceMode:Number(sliceMode.value),sliceW:Number(sliceW.value),sliceAmount:Number(sliceAmount.value),slicePhase:phase,lensShape:Number(document.getElementById('lens-shape').value),deskSpectrum:Number(document.getElementById('desk-spectrum').checked),chromaticSplit:Number(document.getElementById('chromatic-split').checked)});
function tick(now){
 raf=0;if(!ready||!pageActive||document.hidden||hostPaused||(!hostVisibilityKnown&&!visible))return;
 const dt=last?Math.min(.1,(now-last)/1000):0;last=now;const v=values();
 if(v.playing>.5){time+=dt;phase=(phase+dt*TAU/22)%TAU;}
 const section=sectionControls(),amount=section.sliceMode?section.sliceAmount:0;
 const [sampleCX,sampleCY]=sectionParameter(v,phase,section.sliceW,amount);
 put('time',time);put('lensHover',hover);put('grabbed',drag?.kind==='lens'?1:0);
 updateFractalInterface({...v,sampleCX,sampleCY},time,put,label,dt);
 updateSectionDiagram(v,phase,section.sliceW,amount,put);
 shader.render({...v,...section,time,lensHover:hover,grabbed:drag?.kind==='lens'?1:0});frames++;
 const optics=shader.optics();document.getElementById('optics-status').textContent=section.lensShape!==0?'Image relay / designed glass mapping · physical desk spectrum belongs to the prism':!section.deskSpectrum?'Prism trace hidden':`${optics?.rays||0} spectral rays · ${((optics?.delivered||0)*100).toFixed(1)}% reaches this desk · ${optics?.tir||0} internal reflections`;
 sliceTime.value=phase/TAU;document.getElementById('slice-phase').textContent=(phase/TAU).toFixed(3);
 document.getElementById('slice-w-value').textContent=section.sliceW.toFixed(2);
 document.getElementById('slice-amount-value').textContent=section.sliceAmount.toFixed(2);
 const play=document.getElementById('slice-play');play.textContent=v.playing>.5?'Hold time':'Animate time';play.setAttribute('aria-pressed',String(v.playing>.5));
 raf=requestAnimationFrame(tick);
}
function visibility(){const play=ready&&pageActive&&!document.hidden&&!hostPaused&&(hostVisibilityKnown||visible);if(play){view?.play();if(!raf)raf=requestAnimationFrame(tick);}else{view?.pause();cancelAnimationFrame(raf);raf=0;}last=0;}
async function start(){const generation=++token;ready=false;cancelAnimationFrame(raf);raf=0;view?.cleanup();view=null;shader?.dispose();shader=null;time=last=phase=frames=0;sliceMode.value=1;sliceW.value=0;sliceAmount.value=.65;drag=null;hover=0;resetFractalInterface();loading.hidden=false;loading.textContent='Loading the instrument…';status.textContent='Loading the Rive interface and shader…';
 try{
  await Promise.all([
   new Promise((resolve,reject)=>{const instance=new rive.Rive({src:'interfaces/fractal-prism.riv',canvas,autoplay:true,autoBind:true,stateMachines:'Instrument',enableGPUCanvas:false,layout:new rive.Layout({fit:rive.Fit.Contain,alignment:rive.Alignment.Center}),onLoad(){if(generation!==token){instance.cleanup();resolve();return;}view=instance;if(reduced)put('playing',0);size();resolve();},onLoadError(e){reject(new Error(e.data||'Could not load the ordinary Rive interface.'));}});}),
   createShaderView(gpu,{shaderUrl:'runtime/fractal-prism.wgsl',scene:'fractal-prism',onError:fail}).then(result=>{if(generation!==token)result.dispose();else shader=result;})
  ]);
  if(generation!==token)return;ready=!!(view&&shader);loading.hidden=true;status.textContent='Live · native Rive orbit + time section in WebGPU';visibility();if(parent!==window){parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);parent.postMessage({type:'rivx-garden-ready'},location.origin);}
 }catch(error){if(generation===token)fail(error);}
}
function point(event){const b=canvas.getBoundingClientRect();return{x:(event.clientX-b.left)*1440/b.width,y:(event.clientY-b.top)*940/b.height};}
canvas.addEventListener('pointerdown',event=>{if(!ready)return;drag=handleFractalPointer(point(event),values(),put);if(drag){canvas.setPointerCapture(event.pointerId);event.preventDefault();}});
canvas.addEventListener('pointermove',event=>{if(!ready)return;const p=point(event);hover=hitFractalPrism(p,values())?1:0;canvas.style.cursor=drag?'grabbing':hover?'grab':'default';if(drag)dragFractalPointer(p,drag,put);});
for(const name of ['pointerup','pointercancel'])canvas.addEventListener(name,event=>{drag=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);});
canvas.addEventListener('pointerleave',()=>{if(!drag)hover=0;});
document.getElementById('restart').addEventListener('click',start);document.addEventListener('visibilitychange',visibility);
new ResizeObserver(size).observe(canvas);new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;visibility();}).observe(document.querySelector('main'));
if(document.documentElement.classList.contains('embedded-instrument'))new ResizeObserver(()=>{parent.postMessage({type:'rivx-garden-size',height:document.querySelector('main').getBoundingClientRect().height},location.origin);}).observe(document.querySelector('main'));
window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='portfolio-lab-visibility'){hostVisibilityKnown=true;hostPaused=!event.data.visible;visibility();}});
function dispose(){pageActive=false;token++;ready=false;visibility();view?.cleanup();shader?.dispose();view=shader=null;}
window.disposeFractalPreview=dispose;
window.addEventListener('pagehide',event=>{pageActive=false;visibility();if(!event.persisted)dispose();});
window.addEventListener('pageshow',()=>{pageActive=true;visibility();});
window.fractalPreviewState=()=>({ready,time,phase,frames,values:values(),section:sectionControls(),sample:sectionParameter(values(),phase,+sliceW.value,+sliceMode.value?+sliceAmount.value:0),nativeSection:[number('sectionDotX0')?.value,number('sectionDotY0')?.value],nativePrism:[number('guideX')?.value,number('guideY')?.value,number('guideRotation')?.value],optics:shader?.optics(),drag:drag?.kind||null,route:'ordinary-rive-external-webgpu'});
sliceTime.addEventListener('input',()=>{phase=Number(sliceTime.value)*TAU;put('playing',0);});
document.getElementById('slice-play').addEventListener('click',()=>put('playing',values().playing>.5?0:1));
const gardens={enamel:[-.745,.186,.16],lace:[-.62,.43,.28],islands:[.285,.012,.08]};
for(const button of document.querySelectorAll('[data-garden]'))button.addEventListener('click',()=>{const [x,y,z]=gardens[button.dataset.garden];put('cX',x);put('cY',y);put('zoom',z);phase=0;});
// Keyboard equivalents for the native gestures also work at narrow embed sizes.
canvas.tabIndex=0;canvas.addEventListener('keydown',event=>{const delta={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]}[event.key];if(event.key==='['||event.key===']'){event.preventDefault();put('rotation',(values().rotation+(event.key===']'?.0125:-.0125)+1)%1);return;}if(!delta)return;event.preventDefault();const v=values();put('lensX',Math.max(155,Math.min(885,v.lensX+delta[0])));put('lensY',Math.max(160,Math.min(480,v.lensY+delta[1])));});
rive.RuntimeLoader.setWasmUrl(new URL('../vendor/rive.wasm',location.href).href);start();
