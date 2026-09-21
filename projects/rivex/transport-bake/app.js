import * as THREE from 'three';
import {OrbitControls} from '../../../live_demos/pi/vendor/three/examples/jsm/controls/OrbitControls.js';
import Rive from '../vector-replay/vendor/webgl2_advanced.js';
import {buildBake,binWeights,receiverMass,fingerprint} from './model.js';
import {makeScene} from './renderer.js';
import {unpackModel,exportStudy} from './export.js';
import {drawTemporalSchematic} from './schematic.js';
import {drawReceiverComparison} from './comparison.js';
import {add,sub,mul,norm,cross} from '../hourglass/transport.js';
const $=id=>document.getElementById(id),bundle=window.__RIVX_TRANSPORT_BAKE__,decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
let model,view,controls,runtime,riveRenderer,riveFile,art,marks=[],ready=false,playing=false,raf=0,last=0,dirty=true,pageActive=true,hostActive=true,visible=true,disposed=false,frames=0;
let instrumentsDirty=true,instrumentUpdates=0;
const state={receiver:'atlas',volume:true,surface:true,vectors:true,gate:false,time:7.35,width:.5,gain:1,compare:false,comparison:'wipe',wipe:50,difference:8};
const active=()=>!disposed&&pageActive&&hostActive&&visible&&!document.hidden;
function status(title,text,fraction){$('work-state').textContent=title;$('work-label').textContent=text;$('progress').value=fraction;document.body.dataset.work=title.toLowerCase();}
async function yieldWork(){await new Promise(r=>setTimeout(r,0));while(!active()){if(disposed)throw Error('Study closed during build');await new Promise(r=>setTimeout(r,80));}}
function schedule(updateInstruments=true){dirty=true;instrumentsDirty ||= updateInstruments!==false;if(ready&&active()&&!raf)raf=runtime.requestAnimationFrame(tick);}
function cameraChanged(){schedule(false);}
function activity(){last=0;if(!active()&&raf){runtime?.cancelAnimationFrame(raf);raf=0;}else schedule();}
function tick(now){raf=0;if(!active())return;const dt=last?Math.min(.07,(now-last)/1000):0;last=now;if(playing){state.time=(state.time+dt*1.15)%Number($('time').max);dirty=true;instrumentsDirty=true;syncInputs();}if(dirty)draw();if(playing)raf=runtime.requestAnimationFrame(tick);}
function syncInputs(){for(const [id,value]of Object.entries(state)){$(id).type==='checkbox'?$(id).checked=value:$(id).value=value;}$('time-value').textContent=state.time.toFixed(2)+' m';$('width-value').textContent=state.width.toFixed(3)+' m';$('gain-value').textContent=state.gain.toFixed(0)+'×';$('wipe-value').textContent=state.wipe+'%';$('difference-value').textContent=state.difference+'×';$('wipe').disabled=state.comparison!=='wipe';$('difference').disabled=!['signed','absolute'].includes(state.comparison);}
function project(p){const q=new THREE.Vector3(...p).project(view.camera);return [(q.x*.5+.5)*1000,(.5-q.y*.5)*650];}
function drawRive(){
 const lines=[],edge=(a,b,w)=>lines.push({a:project(a),b:project(b),w});
 if(state.vectors){
  for(const s of model.scene.spheres){const q=sub(view.camera.position.toArray(),s.c),dist=Math.hypot(...q),n=norm(q),u=norm(cross(n,[0,1,0])),v=cross(n,u),r=s.r*Math.sqrt(1-s.r*s.r/(dist*dist)),c=add(s.c,mul(n,s.r*s.r/dist)),at=a=>add(c,mul(add(mul(u,Math.cos(a)),mul(v,Math.sin(a))),r));for(let i=0;i<64;i++)edge(at(i*Math.PI/32),at((i+1)*Math.PI/32),.7);}
  // The ordinary Rive marks carry the very same source clock as both fields.
  for(const sample of model.rays)for(const seg of [...sample.path.segments,...sample.path.glassSegments]){const lo=state.gate?Math.max(0,(state.time-state.width*.5-seg.L0)/(seg.L1-seg.L0)):0,hi=state.gate?Math.min(1,(state.time+state.width*.5-seg.L0)/(seg.L1-seg.L0)):1;if(hi>lo)edge(add(seg.a,mul(sub(seg.b,seg.a),lo)),add(seg.a,mul(sub(seg.b,seg.a),hi)),.82);}
 }
 marks.forEach((node,i)=>{const line=lines[i];if(!line){node.scaleY=0;return;}const dx=line.b[0]-line.a[0],dy=line.b[1]-line.a[1];node.x=line.a[0];node.y=line.a[1];node.rotation=Math.atan2(dy,dx);node.scaleX=Math.hypot(dx,dy);node.scaleY=line.w;});
 art.advance(0);riveRenderer.clear();riveRenderer.save();riveRenderer.align(runtime.Fit.fill,runtime.Alignment.center,{minX:0,minY:0,maxX:$('rive').width,maxY:$('rive').height},{minX:0,minY:0,maxX:1000,maxY:650});art.draw(riveRenderer);riveRenderer.restore();riveRenderer.flush();document.body.dataset.riveMarks=lines.length;
}
let contactImage,selectedSlice=5;
function makeContact(){
 const s=model.size,canvas=document.createElement('canvas');canvas.width=s*8;canvas.height=s*Math.ceil(model.bins/8);const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(canvas.width,canvas.height);let maximum=0;
 for(let i=0;i<model.atlas.length;i+=4)maximum=Math.max(maximum,model.atlas[i],model.atlas[i+1],model.atlas[i+2]);
 for(let bin=0;bin<model.bins;bin++)for(let y=0;y<s;y++)for(let x=0;x<s;x++){const src=(bin*s*s+y*s+x)*4,dst=((Math.floor(bin/8)*s+(s-1-y))*canvas.width+(bin%8)*s+x)*4;for(let c=0;c<3;c++)pixels.data[dst+c]=255*Math.log1p(model.atlas[src+c]/maximum*100000)/Math.log(100001);pixels.data[dst+3]=255;}
 ctx.putImageData(pixels,0,0);return canvas;
}
function drawContact(){
 const canvas=$('contact'),ctx=canvas.getContext('2d'),w=canvas.clientWidth,h=canvas.clientHeight;
 if(canvas.width!==Math.round(w*devicePixelRatio)||canvas.height!==Math.round(h*devicePixelRatio)){canvas.width=Math.round(w*devicePixelRatio);canvas.height=Math.round(h*devicePixelRatio);}
 ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);ctx.fillStyle='#061015';ctx.fillRect(0,0,w,h);
 const columns=w<530?4:8,rows=Math.ceil(model.bins/columns),tileW=w/columns,tileH=h/rows,weights=binWeights(model,state.time,state.width,state.gate),s=model.size;
 if($('follow').checked)selectedSlice=Math.max(0,Math.min(model.bins-1,Math.round((state.time-model.timeMin)/model.timeStep)));
 for(let i=0;i<model.bins;i++){const x=(i%columns)*tileW,y=Math.floor(i/columns)*tileH;ctx.drawImage(contactImage,(i%8)*s,Math.floor(i/8)*s,s,s,x+3,y+3,tileW-6,tileH-10);ctx.fillStyle='#e6c57b';ctx.fillRect(x+3,y+tileH-5,(tileW-6)*weights[i],2);ctx.strokeStyle=i===selectedSlice?'#e6c57b':'#83cfca25';ctx.strokeRect(x+.5,y+.5,tileW-1,tileH-1);}
 const enlarged=$('slice-image');if(enlarged.width!==s){enlarged.width=enlarged.height=s;}const ec=enlarged.getContext('2d');ec.drawImage(contactImage,(selectedSlice%8)*s,Math.floor(selectedSlice/8)*s,s,s,0,0,s,s);
 $('slice').value=selectedSlice;$('slice-value').textContent=`${selectedSlice+1} / ${model.bins}`;
 const center=model.timeMin+selectedSlice*model.timeStep;
 $('slice-range').textContent=`${Math.max(model.timeMin,center-model.timeStep*.5).toFixed(4)}–${Math.min(model.timeMax,center+model.timeStep*.5).toFixed(4)} optical m · ${model.timeStep.toFixed(4)} m spacing`;
 document.body.dataset.slice=selectedSlice;
}
function selectSlice(index){if(!ready)return;selectedSlice=Math.max(0,Math.min(model.bins-1,index));$('follow').checked=false;schedule();}
$('slice').oninput=()=>selectSlice(Number($('slice').value));
$('follow').onchange=schedule;
$('contact').onclick=e=>{if(!ready)return;const r=$('contact').getBoundingClientRect(),columns=r.width<530?4:8,rows=Math.ceil(model.bins/columns);selectSlice(Math.floor((e.clientX-r.left)/r.width*columns)+columns*Math.floor((e.clientY-r.top)/r.height*rows));isolateSlice();};
function isolateSlice(){if(!ready)return;state.time=model.timeMin+selectedSlice*model.timeStep;state.width=Math.max(.008,model.timeStep*.85);state.gate=true;playing=false;$('play').textContent='Sweep pulse';syncInputs();schedule();}
$('isolate').onclick=isolateSlice;
let lastComparisonField=null,lastComparisonTime=0;
function drawComparison(){
 const panel=$('receiver-comparison');if(panel.hidden===state.compare)panel.hidden=!state.compare;
 const route=!state.surface?'Receiver hidden · enable Receiver to view either route':state.receiver==='atlas'?`Receiver: ${model.bins} baked UV layers · sampled time weights`:`Receiver: ${(model.hits.length/8).toLocaleString()} per-hit kernels · continuous time weights`;
 if($('receiver-route-status').textContent!==route)$('receiver-route-status').textContent=route;
 if(!state.compare)return;
 const now=performance.now();
 if(!playing||!lastComparisonField||now-lastComparisonTime>=160){lastComparisonField=view.compareReceiver(state);lastComparisonTime=now;}
 drawReceiverComparison(lastComparisonField,state);
}
$('stress-time').onclick=()=>{if(!ready)return;state.time=model.timeMin+(Math.floor(model.bins*.4)+.5)*model.timeStep;state.width=Math.max(.008,model.timeStep*.45);state.gate=true;state.compare=true;state.comparison='signed';playing=false;$('play').textContent='Sweep pulse';syncInputs();schedule();};
$('temporal-schematic').addEventListener('transport-time-scrub',event=>{if(!ready)return;state.time=event.detail.time;state.gate=true;playing=false;$('play').textContent='Sweep pulse';syncInputs();schedule();});
function draw(){
 view.draw(state);drawRive();
 // Orbit changes projection, not transport or the receiver's UV/time domain.
 // Keep its chart, contact sheet and per-hit energy reduction off that path.
 if(instrumentsDirty){
  drawContact();drawTemporalSchematic(model,state);drawComparison();
  const direct=receiverMass(model,state.time,state.width,state.gate,false),baked=receiverMass(model,state.time,state.width,state.gate,true);
  $('energy').textContent=direct.toFixed(4)+' / '+baked.toFixed(4);
  document.body.dataset.referenceEnergy=direct;document.body.dataset.atlasEnergy=baked;
  instrumentsDirty=false;instrumentUpdates++;
 }
 document.body.dataset.frames=++frames;document.body.dataset.time=state.time;document.body.dataset.receiver=state.receiver;dirty=false;
}
function resize(){if(!ready)return;const rect=$('stage').getBoundingClientRect();view.resize(rect.width,rect.height);$('rive').width=Math.round(rect.width*Math.min(devicePixelRatio,1.6));$('rive').height=Math.round(rect.height*Math.min(devicePixelRatio,1.6));schedule();}
for(const id of Object.keys(state))$(id).addEventListener($(id).type==='range'?'input':'change',()=>{state[id]=$(id).type==='checkbox'?$(id).checked:$(id).type==='range'?Number($(id).value):$(id).value;if(id==='time'){playing=false;$('play').textContent='Sweep pulse';}syncInputs();schedule();});
$('play').onclick=()=>{playing=!playing;if(playing){if(!state.gate)state.time=0;state.gate=true;}$('play').textContent=playing?'Pause pulse':'Sweep pulse';syncInputs();last=0;schedule();};
$('reset').onclick=()=>{if(!view)return;view.camera.position.set(7,4.6,9);controls.target.set(0,2.5,0);controls.update();cameraChanged();};
$('top').onclick=()=>{if(!view)return;view.camera.position.set(0,10,.01);controls.target.set(0,0,0);controls.update();cameraChanged();};
$('scene').addEventListener('keydown',e=>{if(!view||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const p=view.camera.position.clone().sub(controls.target);p.applyAxisAngle(new THREE.Vector3(0,1,0),e.key==='ArrowLeft'?.12:-.12);view.camera.position.copy(p.add(controls.target));controls.update();cameraChanged();});
$('export').onclick=async()=>{const wasPlaying=playing;playing=false;$('export').disabled=true;$('export-status').textContent='Packing actual HDR slices and retained transport…';try{const result=await exportStudy(model,{...state,slice:selectedSlice,follow:$('follow').checked,camera:view.camera.position.toArray(),target:controls.target.toArray()});$('export-status').textContent=`Saved ${result.name} · ${(result.bytes/1048576).toFixed(1)} MiB · reopens without retracing or network.`;}catch(e){$('export-status').textContent='Export failed: '+e.message;console.error(e);}finally{$('export').disabled=false;playing=wasPlaying;last=0;schedule();}};
const intersection=new IntersectionObserver(entries=>{const bounds=entries[0].boundingClientRect;visible=bounds.bottom>0&&bounds.top<innerHeight;activity();},{rootMargin:'0px 10000px',threshold:0});intersection.observe(document.querySelector('main'));
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe($('stage'));document.addEventListener('visibilitychange',activity);window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='portfolio-lab-visibility'){hostActive=!!event.data.visible;activity();}});
window.addEventListener('pagehide',event=>{pageActive=false;activity();if(!event.persisted){disposed=true;intersection.disconnect();resizeObserver.disconnect();controls?.dispose();view?.dispose();art?.delete();riveFile?.delete();riveRenderer?.delete();}});window.addEventListener('pageshow',()=>{pageActive=true;activity();});
function installModelInfo(){
 contactImage=makeContact();selectedSlice=Math.min(model.bins-1,bundle?.settings?.slice??Math.floor(model.bins*.4));if(bundle?.settings?.follow!==undefined)$('follow').checked=bundle.settings.follow;
 $('slice').max=model.bins-1;$('quality').value=model.quality||'coarse';$('quality').disabled=!!bundle;
 $('atlas-heading').textContent=`${model.bins} slices. One surface.`;
 $('hit-count').textContent=`${(model.hits.length/8).toLocaleString()} hits / ${(model.photons/1024).toFixed(0)}k rays`;
 $('atlas-bytes').textContent=`${(model.atlas.byteLength/1048576).toFixed(1)} MiB · RGBA32F`;$('bin-width').textContent=model.timeStep.toFixed(4)+' optical m';
 document.body.dataset.atlasHash=fingerprint(model.atlas);document.body.dataset.hitHash=fingerprint(model.hits);document.body.dataset.quality=model.quality||'coarse';
 $('play').disabled=$('export').disabled=false;
 if(model.quality==='fine'&&!bundle){state.time=model.timeMin+selectedSlice*model.timeStep;state.width=Math.max(.008,model.timeStep*.85);state.gate=true;state.gain=12;}
}
$('quality').onchange=async()=>{
 if(!ready||bundle)return;const quality=$('quality').value,position=view.camera.position.toArray(),target=controls.target.toArray();
 ready=false;document.body.dataset.ready='false';playing=false;$('play').textContent='Sweep pulse';
 if(raf){runtime.cancelAnimationFrame(raf);raf=0;}
 $('quality').disabled=$('export').disabled=$('play').disabled=true;$('progress').hidden=false;
 status('Standby','Preparing a new fixed bake; playback resumes when all slices are ready.',0);
 try{
  const next=await buildBake((name,p)=>status(name==='Ready'?'Ready':'Baking',name,p),yieldWork,quality);
  controls.dispose();view.dispose();model=next;view=makeScene($('scene'),model);
  controls=new OrbitControls(view.camera,$('scene'));controls.target.set(...target);view.camera.position.set(...position);controls.enablePan=false;controls.minDistance=5;controls.maxDistance=18;controls.maxPolarAngle=Math.PI*.49;controls.addEventListener('change',cameraChanged);controls.update();
  installModelInfo();ready=true;document.body.dataset.ready='true';$('quality').disabled=false;$('progress').hidden=true;
  status('Ready',`${model.bins} stored slices · no new tracing during playback`,1);syncInputs();resize();
 }catch(error){$('error').hidden=false;$('error').textContent=error.message;status('Demo crashed','Restart to recover.',0);console.error(error);}
};
async function start(){
 status('Standby',bundle?'Restoring actual stored transport…':'Tracing volume and receiver, then baking HDR slices…',0);await yieldWork();
 model=bundle?unpackModel(bundle.model):await buildBake((name,p)=>status(name==='Ready'?'Ready':'Baking',name,p),yieldWork,new URLSearchParams(location.search).get('quality')==='fine'?'fine':'coarse');
 $('time').max=Math.ceil(model.timeMax+1.25);
 status('Preparing','Loading official Rive context and GPU drawing…',.98);
 view=makeScene($('scene'),model);controls=new OrbitControls(view.camera,$('scene'));controls.target.set(0,2.5,0);controls.enablePan=false;controls.minDistance=5;controls.maxDistance=18;controls.maxPolarAngle=Math.PI*.49;controls.addEventListener('change',cameraChanged);controls.update();
 if(bundle?.settings){for(const key of Object.keys(state))if(bundle.settings[key]!==undefined)state[key]=bundle.settings[key];view.camera.position.set(...bundle.settings.camera);controls.target.set(...bundle.settings.target);controls.update();}
 runtime=await Rive(bundle?{wasmBinary:decode(bundle.wasm)}:{locateFile:()=>new URL('../vector-replay/vendor/rive.wasm',import.meta.url).href});riveRenderer=runtime.makeRenderer($('rive'));riveFile=await runtime.load(bundle?decode(bundle.context):new Uint8Array(await(await fetch('../hourglass/context.riv')).arrayBuffer()));art=riveFile.defaultArtboard();marks=Array.from({length:4096},(_,i)=>art.node('mark'+i));if(marks.some(n=>!n))throw Error('Incomplete official Rive context');
 installModelInfo();ready=true;document.body.dataset.ready='true';document.body.dataset.rive='official';document.body.dataset.restored=String(!!bundle);
 status('Ready',`${model.bins} slices · ${model.timeMin.toFixed(2)}–${model.timeMax.toFixed(2)} optical m · ${bundle?'restored stored data':'one fixed transport bake'}`,1);$('progress').hidden=true;syncInputs();resize();
 window.__transportBake={getState:()=>({...state,ready,frames,instrumentUpdates,playing,active:active(),camera:view.camera.position.toArray(),atlasHash:fingerprint(model.atlas),hitHash:fingerprint(model.hits),massError:Math.abs(model.atlasMass-model.inputMass)/model.inputMass,timeMin:model.timeMin,timeMax:model.timeMax,atlasBytes:model.atlas.byteLength,hitBytes:model.hits.byteLength,restored:!!bundle,bins:model.bins,size:model.size,quality:model.quality||'coarse',photons:model.photons,selectedSlice,comparisonPasses:view.comparisonPassCount(),comparisonMetrics:lastComparisonField?.metrics||null}),inspectModel:()=>({timeMin:model.timeMin,timeMax:model.timeMax,timeStep:model.timeStep,binMass:model.binMass,inputMass:model.inputMass,atlasMass:model.atlasMass,sheetOptical:Array.from(model.sheet.optical.subarray(0,24))}),set:values=>{Object.assign(state,values);syncInputs();schedule();},setCamera:position=>{view.camera.position.set(...position);controls.target.set(0,2.5,0);controls.update();cameraChanged();}};
 if(parent!==window)parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);
}
start().catch(error=>{$('error').hidden=false;$('error').textContent=error.message;status('Demo crashed','Restart to recover.',0);console.error(error);});
