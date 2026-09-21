'use strict';
import {crispPresentation} from './presentation.js';
import {createModalAudio} from './modal-audio.js';
const pieces={
  'interactive-optics':{title:'Liquid optics',machine:'Instrument',description:'Pick up a thick glass lens and move it across an iridescent optical still life. Native Rive gestures and sliders drive the lens, its GPU material and a vector diagram of the colour paths.',try:'Drag the glass itself. Tune refraction, dispersion and frost; switch between Crystal, Frosted and Liquid. Hover over controls to light their edges. Hold the motion, move the lens across different objects, then reset its position.',limits:'Stylized screen-space optics with separate RGB sample paths and deterministic aperture blur. Liquid mode adds animated capillary distortion; it is not a fluid simulation or a full spectral path tracer.'},
  'material-nocturne':{title:'Material nocturne',machine:'Instrument',description:'Patterned metal, a separate clearcoat response and compound glass share a carefully lit stage. Native Rive controls change the material while a vector microfacet plot explains what changed.',try:'Compare Polished, Satin and Frosted, then move the light. Remove the clearcoat and bring it back. The gold plot follows the roughness control; the teal curve is a fixed comparison. Drag the three luminous sliders for continuous control. Hold motion for a material study.',limits:'Analytic intersections and finite rectangular-light quadrature make this a compact real-time material study. Studio reflections and the receiver caustic are bounded approximations; it is not LTC fitting or a full path tracer.'},
  'spectral-observatory':{title:'Spectral observatory',machine:'Instrument',description:'A glass lens and triangular prism turn wavelength-dependent refraction into a live optical study. Ordinary Rive curves show the same Cauchy-shaped index model used by the shader.',try:'Turn dispersion off, then select Natural and Study. Compare clear and frosted glass and change the light direction. The native Rive curve changes with the optical parameter; the teal curve stays as a reference. Drag the sliders for continuous control.',limits:'The shader traces seven wavelength bands through analytic sphere and prism boundaries, with Beer attenuation and internal reflection. RGB reconstruction, receiver caustics and visible shafts are approximations. It is not a converged spectral transport simulation.'},
  'resonant-membrane':{title:'Resonant membrane',machine:'Membrane',description:'A reflective membrane becomes a playable modal instrument. Strike its surface or nodal diagram: the location chooses which modes receive energy. The surface, Rive curves and audible decay share the same modal weights.',try:'Choose Strike, then tap the surface or the nodal diagram. Compare a centre strike with one near an edge. Turn on Listen, vary damping and pitch, and hear the modes add up. Return to Eigen to study individual standing-wave pairs.',limits:'Nine analytic modes of a square membrane with fixed edges, with exaggerated displacement and slowed visual oscillation. The browser synthesizes the audible modal sum through Web Audio; that optional sound bridge is separate from the standalone visual .riv. This is a teaching model, not the full Modal finite-element backend.'},
  'fractal-prism':{title:'Prismatic garden',machine:'Instrument',description:'A piece of glass becomes a way to explore a mathematical landscape. Move the prism through a Julia field, then drag its parameter on the Rive diagram to change the entire garden. A vector orbit makes the iteration visible.',try:'Drag the prism across a boundary. Move the point on the parameter pad and watch the fractal reorganize. Change magnification, prism angle and dispersion, then try the three palettes. The Rive diagram and GPU scene respond to the same coordinates.',limits:'A finite Julia-set iteration with a stylized refractive prism and RGB dispersion. The optical treatment is designed for exploration; it is not a spectral transport simulation.'}
};
let instance=null,generation=0,modalAudio=null,currentSlug='',gardenFrame=null,gardenReady=false,playerVisible=true,pageActive=true,hostPaused=parent!==window;
const canvas=document.querySelector('#riveCanvas'), status=document.querySelector('#status'), loading=document.querySelector('#loading'),player=document.querySelector('.player');
const formatDescription=document.querySelector('#format-description'),formatNote=document.querySelector('#format-note');
const signedDescription=formatDescription.textContent,signedNote=formatNote.textContent;
const detail=crispPresentation(document.getElementById('crisp-details'),[document.querySelector('.player')]);
rive.RuntimeLoader.setWasmUrl(new URL('vendor/rive.wasm',location.href).href);
function resize(){if(instance)instance.resizeDrawingSurfaceToCanvas(Math.min(devicePixelRatio||1,2))}
function stopOnHidden(){
  const visible=pageActive&&playerVisible&&!document.hidden&&!hostPaused;
  if(instance){if(visible)instance.play();else instance.pause();}
  gardenFrame?.contentWindow?.postMessage({type:'portfolio-lab-visibility',visible},location.origin);
}
function closeGarden(){
  gardenReady=false;
  if(!gardenFrame)return;
  gardenFrame.contentWindow?.postMessage({type:'portfolio-lab-visibility',visible:false},location.origin);
  gardenFrame.contentWindow?.disposeFractalPreview?.();
  gardenFrame.remove();gardenFrame=null;
}
async function openPiece(slug,{pushHistory=false}={}){
  if(!pieces[slug])slug='material-nocturne';
  const token=++generation,piece=pieces[slug];
  currentSlug=slug;detail.select(slug==='resonant-membrane');
  modalAudio?.dispose();modalAudio=null;
  if(instance){instance.cleanup();instance=null}
  closeGarden();
  const isGarden=slug==='fractal-prism';
  player.classList.toggle('garden-player',isGarden);canvas.hidden=isGarden;
  loading.hidden=false;loading.textContent=isGarden?'Opening the Rive + WebGPU instrument…':'Opening the Rive document…';
  status.textContent='Loading '+piece.title;document.title=piece.title+' — Studies in light';
  document.querySelectorAll('[data-piece]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.piece===slug)));
  document.querySelector('#description').textContent=piece.description;
  document.querySelector('#try').textContent=piece.try;document.querySelector('#limits').textContent=piece.limits;
  document.querySelector('#format-label').textContent=isGarden?'RIVE + GPU HOST':'GPU CANVAS .RIV';
  formatDescription.textContent=isGarden?'The ordinary .riv supplies vector controls, the complex orbit and the time-path drawing. A WebGPU host renders the Julia field and the optical study, sharing the same coordinates without reading pixels back. The host also supplies a CPU-traced spectral profile through its own GPU buffer.':signedDescription;
  formatNote.textContent=isGarden?'This is the Rive + GPU host delivery format: an ordinary .riv packaged with its browser renderer. The rendering code lives in the host. The four other studies demonstrate signed, self-contained GPU Canvas visual documents.':signedNote;
  document.querySelector('#audio-status').hidden=true;
  document.querySelector('#modal-links').hidden=slug!=='resonant-membrane';
  history[pushHistory?'pushState':'replaceState'](null,'','#'+slug);
  document.querySelector('#compare-route').href='comparison/index.html'+(isGarden?'':'#'+slug);
  if(isGarden){
    const frame=document.createElement('iframe');gardenFrame=frame;
    frame.className='garden-frame';frame.title='Prismatic Garden — Rive controls and WebGPU optics';
    frame.src='comparison/fractal-preview.html?instrument=1&v=20260921-finish';
    frame.addEventListener('load',()=>{if(token===generation&&gardenFrame===frame)stopOnHidden();});
    player.insertBefore(frame,loading);return;
  }
  const response=await fetch('exports/'+slug+'.riv?v=20260921-finish');
  if(!response.ok)throw new Error('The signed Rive document could not be loaded ('+response.status+').');
  const bytes=await response.arrayBuffer();if(token!==generation)return;
  instance=new rive.Rive({buffer:bytes,canvas,autoplay:true,autoBind:true,enableGPUCanvas:true,stateMachine:piece.machine,
    layout:new rive.Layout({fit:rive.Fit.Contain,alignment:rive.Alignment.Center}),
    onLoad(){if(token!==generation)return;resize();loading.hidden=true;status.textContent=piece.title+' · '+(bytes.byteLength/1024).toFixed(0)+' KB · official WebGL2 2.42.2';
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){const vm=instance.viewModelInstance;const play=vm&&vm.number('playing');if(play)play.value=0;}
      if(slug==='resonant-membrane')modalAudio=createModalAudio(canvas,()=>{
        const vm=instance?.viewModelInstance;if(!vm)return null;
        return Object.fromEntries(['n','m','mix','amplitude','playing','excitationMode','strikeX','strikeY','strikeSerial','damping','fundamental','audioEnabled'].map(key=>[key,vm.number(key)?.value]));
      },text=>document.querySelector('#audio-status').textContent=text);
      document.querySelector('#audio-status').hidden=slug!=='resonant-membrane';
      document.querySelector('#audio-status').textContent='Sound off · choose Listen inside the Rive instrument to enable it.';
      stopOnHidden();window.dispatchEvent(new CustomEvent('showpiece-ready',{detail:{slug,bytes:bytes.byteLength}}));},
    onAdvance(){modalAudio?.update();},
    onLoadError(e){if(token!==generation)return;fail(e.data||'Rive could not load this document');}
  });
}
function fail(error){status.textContent='Playback needs attention';loading.hidden=false;loading.textContent=String(error)+' Use Restart to reload.';console.error(error)}
document.querySelectorAll('[data-piece]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.piece!==currentSlug)openPiece(b.dataset.piece,{pushHistory:true}).catch(fail);}));
document.querySelector('#restart').addEventListener('click',()=>openPiece(location.hash.slice(1)).catch(fail));
document.querySelector('#fullscreen').addEventListener('click',()=>document.querySelector('.player').requestFullscreen().catch(fail));
new ResizeObserver(resize).observe(canvas);document.addEventListener('visibilitychange',stopOnHidden);
new IntersectionObserver(entries=>{playerVisible=entries[0].isIntersecting;stopOnHidden();}).observe(player);
window.addEventListener('message',event=>{
  if(parent!==window&&event.source===parent&&event.origin===location.origin&&event.data?.type==='portfolio-lab-visibility'&&typeof event.data.visible==='boolean'){
    hostPaused=!event.data.visible;stopOnHidden();return;
  }
  if(event.origin!==location.origin||!gardenFrame||event.source!==gardenFrame.contentWindow)return;
  if(event.data?.type==='rivx-garden-size'){
    const height=Number(event.data.height);
    if(Number.isFinite(height)&&height>0&&height<8000)gardenFrame.style.height=Math.ceil(height)+'px';
  }else if(event.data?.type==='rivx-garden-ready'){
    gardenReady=true;loading.hidden=true;status.textContent='Prismatic garden · ordinary .riv + WebGPU host';stopOnHidden();
    window.dispatchEvent(new CustomEvent('showpiece-ready',{detail:{slug:'fractal-prism',route:'ordinary-rive-external-webgpu'}}));
  }else if(event.data?.type==='rivx-garden-error')fail(event.data.message||'The GPU instrument could not be loaded.');
});
window.addEventListener('pagehide',event=>{pageActive=false;stopOnHidden();if(!event.persisted){generation++;modalAudio?.dispose();if(instance)instance.cleanup();closeGarden();}});
window.addEventListener('pageshow',()=>{pageActive=true;stopOnHidden();});
window.addEventListener('hashchange',()=>{if(location.hash.slice(1)!==currentSlug)openPiece(location.hash.slice(1)).catch(fail);});
window.showpieceState=()=>({slug:currentSlug,ready:gardenReady||!!instance?.viewModelInstance,route:gardenFrame?'ordinary-rive-external-webgpu':'gpu-canvas-riv',audio:modalAudio?.state,
  values:instance?.viewModelInstance?Object.fromEntries(instance.viewModelInstance.properties.filter(p=>p.type==='number').map(p=>[p.name,instance.viewModelInstance.number(p.name)?.value])):{}});
openPiece(location.hash.slice(1)||'material-nocturne').catch(fail);
