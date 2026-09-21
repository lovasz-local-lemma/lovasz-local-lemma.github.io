import Rive from './vendor/webgl2_advanced.js';
import {parseCache,clipTime,camera,projectSegment,roomGuides,fixture,mix} from './geometry.js';
const $=id=>document.getElementById(id),ui={};
for(const id of ['view','status','error','representation','gate','width','budget','stroke','play','reset','orbit','guides','file','fixture','source-name','source-note','file-status','drawn','legs','cost','caption'])ui[id]=$(id);
const CAPACITY=384,ART={minX:0,minY:0,maxX:1000,maxY:700};
let data=parseCache(fixture()),displayLegs=data.legs,playing=true,dirty=true,ready=false,yaw=-.4,pitch=.23,distance=2.7,last=0,raf=0,visible=true,externalPaused=false,hostSignal=false,runtime,renderer,file,artboard,nodes=[],lastUsed=new Set(),cpuAverage=0,renderCount=0;
function updateData(next){
 data=next;const stride=Math.max(1,Math.ceil(data.legs.length/2400));displayLegs=data.legs.filter((_,i)=>i%stride===0);
 ui['source-name'].textContent=data.name;ui['source-note'].textContent=data.provenance;
 ui['file-status'].textContent=stride>1?`Display preview: ${displayLegs.length.toLocaleString()} of ${data.legs.length.toLocaleString()} legs (deterministic stride ${stride}).`:'All retained legs available to the display.';
 ui.legs.textContent=data.legs.length.toLocaleString();dirty=true;wake();
}
function updateLabels(){
 const span=data.maxTime-data.minTime;
 $('gate-value').textContent=(data.minTime+Number(ui.gate.value)/1000*span).toFixed(2)+' ns';
 $('width-value').textContent=(Number(ui.width.value)/1000*span).toFixed(2)+' ns';
 $('budget-value').textContent=ui.budget.value;$('stroke-value').textContent=(Number(ui.stroke.value)/10).toFixed(1)+' px';
 ui.play.textContent=playing?'Pause time':'Play time';
}
function size(){const b=ui.view.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);if(b.width<1||b.height<1)return;const w=Math.round(b.width*dpr),h=Math.round(b.height*dpr);if(ui.view.width!==w||ui.view.height!==h){ui.view.width=w;ui.view.height=h;dirty=true;}}
function moveNode(index,p,q,width){
 const n=nodes[index],dx=q[0]-p[0],dy=q[1]-p[1];n.x=p[0];n.y=p[1];n.rotation=Math.atan2(dy,dx);n.scaleX=Math.max(.001,Math.hypot(dx,dy));n.scaleY=width;
}
function render(){
 const start=performance.now();size();updateLabels();
 const cam=camera(data.center,data.radius,yaw,pitch,distance),span=data.maxTime-data.minTime,center=data.minTime+Number(ui.gate.value)/1000*span,half=Number(ui.width.value)/2000*span;
 const budget=Number(ui.budget.value),width=Number(ui.stroke.value)/10,mode=ui.representation.value,candidates=[];
 let eligible=0;
 if(ui.guides.checked)for(const g of roomGuides(data.boundsMin,data.boundsMax)){const p=projectSegment(g.a,g.b,cam);if(p)candidates.push({...p,color:1,width:.55,guide:true});}
 for(const leg of displayLegs){
  if(mode==='points'){
   const steps=18;
   for(let i=0;i<steps;i++){const t=(i+.5)/steps,time=leg.t0+t*(leg.t1-leg.t0);if(time<center-half||time>center+half)continue;
    const x=mix(leg.a,leg.b,t),p=projectSegment(x,x,cam);if(!p)continue;eligible++;candidates.push({...p,q:[p.p[0]+width*1.25,p.p[1]],width:width*1.25,color:leg.color});}
  }else{
   const part=mode==='paths'?leg:clipTime(leg,center-half,center+half);if(!part)continue;
   const p=projectSegment(part.a,part.b,cam);if(!p)continue;eligible++;candidates.push({...p,color:leg.color,width});
  }
 }
 // A finite display pool is an explicit approximation. Preserve guides, then select
 // a deterministic distributed subset so a dense first path cannot consume every slot.
 const guides=candidates.filter(x=>x.guide),ink=candidates.filter(x=>!x.guide),room=Math.max(0,budget-guides.length);
 const selected=guides.concat(ink.length>room?Array.from({length:room},(_,i)=>ink[Math.floor((i+.5)*ink.length/room)]):ink);
 // Pool nodes have fixed paint order and color. This is a line-structure display,
 // not a depth-sorted transparent renderer; sorting candidates cannot change that.
 const counts=[0,0,0,0],used=new Set();let dropped=0;
 for(const item of selected){const color=item.color,slot=counts[color]++;if(slot>=96){dropped++;continue;}const index=slot*4+color;moveNode(index,item.p,item.q,item.width);used.add(index);}
 for(const index of lastUsed)if(!used.has(index)){nodes[index].scaleX=0;nodes[index].scaleY=0;}
 lastUsed=used;
 renderer.clear();renderer.save();renderer.align(runtime.Fit.contain,runtime.Alignment.center,{minX:0,minY:0,maxX:ui.view.width,maxY:ui.view.height},ART);
 artboard.advance(0);artboard.draw(renderer);renderer.restore();renderer.flush();
 const cpu=performance.now()-start;cpuAverage=renderCount?cpuAverage*.92+cpu*.08:cpu;renderCount++;
 ui.drawn.textContent=used.size;ui.cost.textContent=cpuAverage.toFixed(2);
 const removed=Math.max(0,candidates.length-selected.length)+dropped;
 ui.caption.classList.toggle('warning',removed>0);
 ui.caption.textContent=`${mode==='points'?'18 samples per retained leg; each surviving sample costs a separate square.':mode==='beams'?'Clip arrival-time intervals, then project the shortened beam.':'Full retained paths; the time window is bypassed.'} ${eligible.toLocaleString()} eligible marks; ${removed?removed.toLocaleString()+' omitted by the display/palette budget.':'all fit the current budget.'}`;
 ui.view.dataset.frames=String(renderCount);ui.view.dataset.drawn=String(used.size);ui.view.dataset.yaw=yaw.toFixed(3);ui.view.dataset.renderer='official-rive-webgl2';
 dirty=false;
}
function wake(){if(ready&&!raf&&visible&&!externalPaused&&!document.hidden)raf=runtime.requestAnimationFrame(tick);}
function tick(t){raf=0;if(!visible||externalPaused||document.hidden){last=0;return;}const dt=Math.min(.05,(t-(last||t))/1000);last=t;
 if(playing&&ui.representation.value!=='paths'){ui.gate.value=String((Number(ui.gate.value)+dt*75)%1000);dirty=true;}
 if(ui.orbit.checked){yaw+=dt*.18;dirty=true;}
 if(dirty)render();
 if((playing&&ui.representation.value!=='paths')||ui.orbit.checked)wake();
}
for(const id of ['representation','gate','width','budget','stroke','guides'])ui[id].addEventListener('input',()=>{if(id==='gate')playing=false;updateLabels();dirty=true;wake();});
ui.play.onclick=()=>{playing=!playing;updateLabels();last=0;dirty=true;wake();};
ui.orbit.onchange=()=>{last=0;dirty=true;wake();};
ui.reset.onclick=()=>{yaw=-.4;pitch=.23;distance=2.7;dirty=true;wake();};
ui.fixture.onclick=()=>{updateData(parseCache(fixture()));ui.file.value='';};
ui.file.onchange=async()=>{const local=ui.file.files?.[0];if(!local)return;try{if(local.size>64*1024*1024)throw Error('This browser viewer accepts caches up to 64 MB.');updateData(parseCache(JSON.parse(await local.text())));ui.status.textContent='Native cache loaded · live projection';}catch(e){ui['file-status'].textContent='Import refused: '+e.message;}};
let dragging=null;
ui.view.onpointerdown=e=>{dragging=[e.clientX,e.clientY];ui.view.setPointerCapture(e.pointerId);};
ui.view.onpointermove=e=>{if(!dragging)return;yaw-=(e.clientX-dragging[0])*.006;pitch=Math.max(-1.35,Math.min(1.35,pitch+(e.clientY-dragging[1])*.005));dragging=[e.clientX,e.clientY];dirty=true;wake();};
ui.view.onpointerup=ui.view.onpointercancel=()=>{dragging=null;};
ui.view.onwheel=e=>{e.preventDefault();distance=Math.max(1.2,Math.min(7,distance*Math.exp(e.deltaY*.001)));dirty=true;wake();};
ui.view.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')yaw-=.12;if(e.key==='ArrowRight')yaw+=.12;if(e.key==='ArrowUp')pitch=Math.min(1.35,pitch+.1);if(e.key==='ArrowDown')pitch=Math.max(-1.35,pitch-.1);dirty=true;wake();};
new ResizeObserver(()=>{size();dirty=true;wake();}).observe(ui.view);
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;last=0;wake();}).observe(ui.view);
document.addEventListener('visibilitychange',()=>{last=0;wake();});
// The brochure may suspend this child. No state is discarded.
window.addEventListener('message',e=>{if(e.source!==window.parent||e.origin!==location.origin)return;const m=e.data;if(m?.type==='portfolio-lab-visibility'&&typeof m.visible==='boolean'){hostSignal=true;externalPaused=!m.visible;last=0;wake();}});
async function start(){
 runtime=await Rive({locateFile:()=>new URL('./vendor/rive.wasm',import.meta.url).href});
 size();renderer=runtime.makeRenderer(ui.view);if(!renderer)throw Error('The official Rive WebGL2 renderer could not initialize.');
 const response=await fetch(new URL('./beam-pool.riv',import.meta.url));if(!response.ok)throw Error('The Rive drawing-pool asset is missing.');
 file=await runtime.load(new Uint8Array(await response.arrayBuffer()));if(!file)throw Error('Rive rejected the drawing-pool file.');
 artboard=file.defaultArtboard();if(!artboard)throw Error('The drawing pool has no artboard.');
 for(let i=0;i<CAPACITY;i++){const name='beam'+String(i).padStart(3,'0'),node=artboard.node(name);if(!node)throw Error('The drawing pool is missing '+name);node.scaleX=0;node.scaleY=0;nodes.push(node);}
 const nativeCache=await fetch(new URL('./paths.json',import.meta.url));
 if(nativeCache.ok)data=parseCache(await nativeCache.json());
 else if(nativeCache.status!==404)throw Error('The companion paths.json could not be loaded ('+nativeCache.status+').');
 ready=true;ui.status.textContent='Live 3D projection · 384 reusable vector shapes';updateData(data);wake();
 if(window.parent!==window)runtime.requestAnimationFrame(()=>{if(!renderCount)render();window.parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);if(!hostSignal)externalPaused=true;});
}
start().catch(e=>{ready=false;if(raf)runtime.cancelAnimationFrame(raf);raf=0;ui.error.hidden=false;ui.error.textContent='The vector player could not start.\n'+e.message;ui.status.textContent='Renderer unavailable';console.error(e);});
window.addEventListener('pagehide',e=>{if(raf)runtime.cancelAnimationFrame(raf);raf=0;if(!e.persisted){ready=false;artboard?.delete();file?.delete();renderer?.delete();}});
window.addEventListener('pageshow',e=>{if(e.persisted){dirty=true;last=0;wake();}});
