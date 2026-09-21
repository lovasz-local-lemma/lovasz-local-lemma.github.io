const $ = id => document.getElementById(id);
const GRID = 256, BATCH = 32768, CAP = 4194304, STATS = GRID * GRID * 3;
const state = {height:1.48, ior:1.5, dispersion:.1, tilt:0, exposure:1.1, view:0, pupil:1};
const presets = {focus:{height:.95,ior:1.5,dispersion:.04,tilt:.18,pupil:0},halo:{height:1.48,ior:1.5,dispersion:.1,tilt:0,pupil:1},oblique:{height:1.32,ior:1.46,dispersion:.1,tilt:-.38,pupil:1}};
let device, context, uniform, field, tracePipeline, displayPipeline, traceGroup, displayGroup, view, instrument;
let profilePeak=0, riveEdits=0;
const instrumentNumber=name=>instrument?.viewModelInstance?.number(name);
let batches=0, emitted=0, raf=0, dirty=true, clear=true, disposed=false, visible=true, hostVisible=parent===window, ready=false, readPending=false, serial=0, lastStats=null;
let playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
const put=(name,value)=>{const v=view?.viewModelInstance?.number(name);if(v&&v.value!==value)v.value=value;};
function refresh(){
 const receiverView=instrumentNumber('receiverView');if(receiverView&&receiverView.value!==state.view)receiverView.value=state.view;
 for(const key of ['height','ior','dispersion','tilt','exposure']){$(key).value=state[key];$(key+'-value').textContent=key==='tilt'?(Math.atan(state[key])*180/Math.PI).toFixed(1)+'°':state[key].toFixed(key==='height'||key==='ior'?3:2);}
 $('view').value=state.view; $('pupil').value=state.pupil; $('pause').textContent=playing?'Hold sampling':'Resume sampling';$('pause').setAttribute('aria-pressed',String(!playing));
 $('samples').textContent=emitted.toLocaleString();
 document.body.dataset.photons=String(emitted);document.body.dataset.batches=String(batches);document.body.dataset.playing=String(playing);
 document.body.dataset.computeWorkgroups=String(batches*(BATCH/128));
 const phase=emitted>=CAP?'Accumulator full · result held':playing?'Independent batches refining the field':'Sampling held';
 $('status').textContent=phase+(lastStats?' · '+Math.round(lastStats.accepted/Math.max(lastStats.emitted,1)*100)+'% reach the receiver':'');
}
function reset(){serial++;emitted=0;batches=0;lastStats=null;profilePeak=0;for(let i=0;i<64;i++){const p=instrumentNumber('profile'+i);if(p)p.value=184;}for(const key of ['accepted','missed','rejected'])delete document.body.dataset[key];clear=true;dirty=true;refresh();wake();}
function changed(optical=true){if(optical)reset();else{dirty=true;refresh();wake();}}
for(const key of ['height','ior','dispersion','tilt','exposure'])$(key).addEventListener('input',()=>{state[key]=Number($(key).value);if(key!=='exposure'&&instrumentNumber('preset'))instrumentNumber('preset').value=-1;document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed','false'));changed(key!=='exposure');});
$('view').addEventListener('change',()=>{state.view=Number($('view').value);changed(false);});
$('pupil').addEventListener('change',()=>{state.pupil=Number($('pupil').value);if(instrumentNumber('preset'))instrumentNumber('preset').value=-1;document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed','false'));changed();});
$('pause').addEventListener('click',()=>{playing=!playing;dirty=true;refresh();wake();});
$('reset').addEventListener('click',reset);
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{Object.assign(state,presets[b.dataset.preset]);if(instrumentNumber('preset'))instrumentNumber('preset').value=-1;$('rive-choice').textContent=b.textContent+' · keyboard controls';document.querySelectorAll('[data-preset]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));reset();}));
function markAxis(){
 // This marker is ordinary Rive vector geometry. Its coordinates come from
 // the source axis, not a readback or guess about where the caustic is brightest.
 const point=[-state.tilt*state.height,0,0];let x,y;
 if(state.view){x=((point[0]/5)/.72+.5)*720;y=((point[2]/5)/.48+.5)*480;}
 else{const cam=[2.2,2.35,3.6],target=[0,.55,0],dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]),norm=a=>a.map(v=>v/Math.hypot(...a)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],f=norm(sub(target,cam)),r=norm(cross(f,[0,1,0])),u=cross(r,f),q=sub(point,cam),z=dot(q,f);x=(.5+dot(q,r)/z/(.85*1.5))*720;y=(.5-dot(q,u)/z/.85)*480;}
 put('headX',x);put('headY',y);put('selectionOpacity',0);put('scanPhase',Math.min(1,emitted/CAP));
}
function resize(){view?.resizeDrawingSurfaceToCanvas(Math.min(devicePixelRatio||1,2));instrument?.resizeDrawingSurfaceToCanvas(Math.min(devicePixelRatio||1,2));}
function wake(){if(ready&&!raf&&!disposed&&!document.hidden&&visible&&hostVisible){view?.play();raf=requestAnimationFrame(frame);}}
function sync(){const show=!document.hidden&&visible&&hostVisible&&!disposed;if(!show){cancelAnimationFrame(raf);raf=0;view?.pause();instrument?.pause();}else{view?.play();instrument?.play();dirty=true;wake();}}
function frame(){
 raf=0;if(disposed||!ready||document.hidden||!visible||!hostVisible)return;
 const sample=(playing||emitted===0)&&emitted<CAP;
 if(dirty||sample){
  const next=emitted+(sample?BATCH:0);
  const values=new Float32Array([state.height,state.ior,state.dispersion,state.tilt,batches,BATCH,next,state.pupil,state.exposure,state.view,0,0,1080,720,GRID,0]);
  device.queue.writeBuffer(uniform,0,values);const encoder=device.createCommandEncoder();
  if(clear){encoder.clearBuffer(field);clear=false;}
  if(sample){const pass=encoder.beginComputePass({label:'Actual photon trace and atomic deposits'});pass.setPipeline(tracePipeline);pass.setBindGroup(0,traceGroup);pass.dispatchWorkgroups(BATCH/128);pass.end();batches++;emitted=next;}
  const render=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});render.setPipeline(displayPipeline);render.setBindGroup(0,displayGroup);render.draw(3);render.end();device.queue.submit([encoder.finish()]);
  dirty=false;markAxis();refresh();if(sample&&(batches%16===0||emitted===CAP||!playing))readStats();
 }
 if(playing&&emitted<CAP)wake();else requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!raf&&(!playing||emitted>=CAP))view?.pause();}));
}
async function readStats(){
 if(readPending||disposed)return;readPending=true;const token=serial,at=emitted;
 const buffer=device.createBuffer({size:272,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 try{const commands=device.createCommandEncoder();commands.copyBufferToBuffer(field,STATS*4,buffer,0,272);device.queue.submit([commands.finish()]);await buffer.mapAsync(GPUMapMode.READ);const s=new Uint32Array(buffer.getMappedRange());if(!disposed&&token===serial){lastStats={accepted:s[0],missed:s[1],rejected:s[2],emitted:at};document.body.dataset.accepted=String(s[0]);document.body.dataset.missed=String(s[1]);document.body.dataset.rejected=String(s[2]);profilePeak=Math.max(1,...s.subarray(4));for(let i=0;i<64;i++)instrumentNumber('profile'+i).value=184-64*s[4+i]/profilePeak;refresh();}buffer.unmap();}catch(error){if(!disposed)console.warn('Photon statistics readback unavailable',error);}finally{buffer.destroy();readPending=false;}
}
function fail(error){ready=false;cancelAnimationFrame(raf);raf=0;$('loading').hidden=false;const unavailable=error.code==='WEBGPU_UNAVAILABLE';$('loading').textContent=(unavailable?'This experiment needs a WebGPU-capable browser. ':'The photon renderer could not initialize. ')+(error.message||error);document.body.dataset.error=String(error.message||error);$('status').textContent=unavailable?'WebGPU is unavailable':'Renderer initialization failed';console.error(error);}
async function shader(url){const response=await fetch(url);if(!response.ok)throw Error('Missing '+url);const module=device.createShaderModule({code:await response.text(),label:url});const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw Error(url+': '+errors.map(m=>`${m.lineNum}:${m.linePos} ${m.message}`).join('; '));return module;}
async function start(){
 refresh();if(!navigator.gpu)throw Object.assign(Error('WebGPU is not available in this context.'),{code:'WEBGPU_UNAVAILABLE'});
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Object.assign(Error('No GPU adapter was returned.'),{code:'WEBGPU_UNAVAILABLE'});device=await adapter.requestDevice();
 device.addEventListener('uncapturederror',event=>fail(event.error));device.lost.then(info=>{if(!disposed)fail(new Error(info.message||'The GPU device was lost.'));});
 context=$('scene').getContext('webgpu');const format=navigator.gpu.getPreferredCanvasFormat();context.configure({device,format,alphaMode:'opaque'});
 uniform=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});field=device.createBuffer({label:'Atomic RGB photon receiver + counts + Rive profile',size:(STATS+68)*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
 const [traceModule,displayModule]=await Promise.all([shader('trace.wgsl'),shader('display.wgsl')]);
 tracePipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:traceModule,entryPoint:'trace'}});
 displayPipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:displayModule,entryPoint:'vertexMain'},fragment:{module:displayModule,entryPoint:'fragmentMain',targets:[{format}]},primitive:{topology:'triangle-list'}});
 const group=pipeline=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}},{binding:1,resource:{buffer:field}}]});traceGroup=group(tracePipeline);displayGroup=group(displayPipeline);
 rive.RuntimeLoader.setWasmUrl(new URL('../gpu-showpieces/vendor/rive.wasm',location.href).href);
 await new Promise((resolve,reject)=>{view=new rive.Rive({src:'../vector-backend/beam-cursor.riv',canvas:$('rive'),autoplay:true,autoBind:true,stateMachines:'Cursor',enableGPUCanvas:false,layout:new rive.Layout({fit:rive.Fit.Contain,alignment:rive.Alignment.Center}),onLoad(){resize();markAxis();resolve();},onLoadError(e){reject(Error(e.data||'The ordinary Rive reticle failed to load.'));}});});
 await new Promise((resolve,reject)=>{instrument=new rive.Rive({src:'photon-instrument.riv',canvas:$('rive-instrument'),autoplay:true,autoBind:true,stateMachines:'Instrument',enableGPUCanvas:false,layout:new rive.Layout({fit:rive.Fit.Contain,alignment:rive.Alignment.Center}),onLoad(){resize();
  instrumentNumber('preset').on(()=>{const index=Math.round(instrumentNumber('preset').value);const preset=Object.values(presets)[index];if(!preset)return;Object.assign(state,preset);riveEdits++;$('rive-choice').textContent=['Focused glass','Spectral halo','Oblique light'][index]+' · selected inside Rive';reset();});
  instrumentNumber('receiverView').on(()=>{const value=Math.round(instrumentNumber('receiverView').value);if(value<0||value>2||value===state.view)return;state.view=value;riveEdits++;changed(false);});resolve();},onLoadError(e){reject(Error(e.data||'The Rive control instrument failed to load.'));}});});
 ready=true;document.body.dataset.ready='true';document.body.dataset.route='ordinary-rive-host-compute';$('loading').hidden=true;
 if(parent!==window)parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);sync();
}
new ResizeObserver(resize).observe(document.querySelector('.viewport'));
const observedVisibility=new Map();
const visibilityObserver=new IntersectionObserver(entries=>{for(const entry of entries)observedVisibility.set(entry.target,entry.isIntersecting);visible=[...observedVisibility.values()].some(Boolean);sync();});
for(const element of document.querySelectorAll('.instrument,.rive-controls'))visibilityObserver.observe(element);
document.addEventListener('visibilitychange',sync);
window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='portfolio-lab-visibility'){hostVisible=!!event.data.visible;sync();}});
window.addEventListener('pagehide',event=>{cancelAnimationFrame(raf);raf=0;view?.pause();instrument?.pause();if(event.persisted)return;disposed=true;view?.cleanup();instrument?.cleanup();uniform?.destroy();field?.destroy();context?.unconfigure();device?.destroy();});
window.addEventListener('pageshow',event=>{if(event.persisted){dirty=true;sync();}});
// Explicit diagnostics for local verification; source and buffer data stay local.
window.computePhotonState=()=>({ready,batches,emitted,playing,cap:CAP,bufferBytes:(STATS+68)*4,stats:lastStats,state:{...state},compute:true,riveEdits,profilePeak,instrumentReady:!!instrument?.viewModelInstance});
start().catch(fail);
