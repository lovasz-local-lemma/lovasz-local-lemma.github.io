document.documentElement.classList.toggle('embedded', parent !== window);
const bundled = window.__VECTOR_SIGNAL__;
const encode = bytes => { let s=''; for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768)); return btoa(s); };
const decode = text => Uint8Array.from(atob(text), c=>c.charCodeAt(0));
const moduleURL = source => 'data:text/javascript;base64,'+encode(new TextEncoder().encode(source));
const {default:Rive}=await import(bundled?moduleURL(bundled.runtime):'./vendor/canvas_advanced.js');
const {installCapture}=await import(bundled?moduleURL(bundled.capture):'./capture.js');
const {createBeamRenderer}=await import(bundled?moduleURL(bundled.beam):'./beam-renderer.js');
const {createSignalHistory}=await import(bundled?moduleURL(bundled.historyModule):'./signal-history.js');
const $=id=>document.getElementById(id);
const text=(id,value)=>{const node=$(id),next=String(value);if(node.textContent!==next)node.textContent=next;};
const samples={
  truck:{file:'../effect-workshop/samples/truck.riv',mode:'s:0',credit:'Truck · official Rive wasm example · MIT repository',url:'https://github.com/rive-app/rive-wasm/tree/master/wasm/examples/parcel_example'},
  faux:{file:'../effect-workshop/samples/faux.riv',mode:'a:0',credit:'Faux 3D Game Icons · rishi.kumar.id · CC BY',url:'https://rive.app/marketplace/14514-27371-faux-3d-game-icons/'},
  jellyfish:{file:'../effect-workshop/samples/jellyfish.riv',mode:'a:11',credit:'Jellyfish · Rive runtime fixture; original artist not identified in fixture metadata',url:'https://github.com/rive-app/rive-runtime/blob/main/tests/unit_tests/assets/jellyfish_test.riv'},
  rosette:{file:'../effect-workshop/kinetic-rosette.riv',mode:'a:0',credit:'Kinetic rosette · original RIVX artwork'},
};
const state={radius:1.1,persistence:.34,speed:.35,coverage:.72,strength:1.2,colour:'green',playing:!matchMedia('(prefers-reduced-motion: reduce)').matches,clip:true,showTravel:false,isolate:false,returnLayer:true,selected:null,hidden:[],...bundled?.settings};
let runtime,capture,beam,referenceRenderer,overlayRenderer,overlayFile,overlayArt,overlayMachine,overlayVM,overlayNumbers={};
let sourceBytes,sourceName,sourceMeta,sourceFile,art,animation,machine,frame,stats,sourceKey='truck',boardIndex=0,loadId=0;
let raf=0,last=0,ready=false,visible=true,hostPaused=false,dirty=true,ticks=0,hover=null,lastInspector='';
let lastUI=-Infinity;
let restorePlayAfterSweep=false;
const signalHistory=createSignalHistory($('history-volume'),{onChange:()=>wake(),onSweepComplete:()=>{if(restorePlayAfterSweep){state.playing=false;restorePlayAfterSweep=false;refresh();}}});
const numeric=['radius','persistence','speed','coverage','strength'];
const fail=error=>{console.error(error);$('error').hidden=false;$('error').textContent=error.message||String(error);document.body.dataset.error=String(error);};
async function fetchBytes(url){const response=await fetch(url);if(!response.ok)throw Error('Could not load '+url);return new Uint8Array(await response.arrayBuffer());}
function refresh(){
  for(const key of numeric){$(key).value=state[key];$(key+'-value').textContent=key==='radius'?state[key].toFixed(2)+' px':key==='persistence'?state[key].toFixed(2)+' s':key==='coverage'?Math.round(state[key]*100)+'%':state[key].toFixed(2);}
  $('colour').value=state.colour;$('play').textContent=state.playing?'Pause':'Play';$('clip').checked=state.clip;$('travel').checked=state.showTravel;$('isolate').checked=state.isolate;$('return').checked=state.returnLayer;
  $('hide').disabled=state.selected===null;$('release').disabled=state.selected===null;$('restore').disabled=!state.hidden.length;
}
function wake(){dirty=true;lastUI=-Infinity;if(ready&&!raf&&visible&&!hostPaused&&!document.hidden)raf=requestAnimationFrame(tick);}
function invalidate(clear=false){if(clear)beam?.clear();lastInspector='';refresh();wake();}
function chooseAnimation(value){
  signalHistory.clear();
  animation?.delete();machine?.delete();animation=machine=null;
  const [kind,index]=value.split(':');
  if(kind==='a')animation=new runtime.LinearAnimationInstance(art.animationByIndex(Number(index)),art);
  if(kind==='s')machine=new runtime.StateMachineInstance(art.stateMachineByIndex(Number(index)),art);
  $('machine-inputs').replaceChildren();
  if(machine)for(let i=0;i<machine.inputCount();i++){
    const input=machine.input(i),label=document.createElement('label');label.textContent=input.name+' ';
    if(input.type===runtime.SMIInput.trigger){const b=document.createElement('button');b.textContent=input.name;b.onclick=()=>{input.asTrigger().fire();wake();};$('machine-inputs').append(b);continue;}
    const el=document.createElement('input');el.dataset.inputName=input.name;
    if(input.type===runtime.SMIInput.bool){el.type='checkbox';el.checked=input.asBool().value;el.onchange=()=>{input.asBool().value=el.checked;wake();};}
    else{el.type='number';el.value=input.asNumber().value;el.style.width='70px';el.onchange=()=>{input.asNumber().value=Number(el.value);wake();};}
    label.append(el);$('machine-inputs').append(label);
  }
  invalidate(true);
}
function setBoard(index,preferred){
  animation?.delete();machine?.delete();animation=machine=null;art?.delete();boardIndex=index;art=sourceFile.artboardByIndex(index);art.advance(0);
  $('artboard').value=index;$('animation').replaceChildren(new Option('Still / no driver','none'));
  for(let i=0;i<art.animationCount();i++)$('animation').add(new Option('Timeline · '+art.animationByIndex(i).name,'a:'+i));
  for(let i=0;i<art.stateMachineCount();i++)$('animation').add(new Option('State · '+art.stateMachineByIndex(i).name,'s:'+i));
  const options=[...$('animation').options],selected=options.find(o=>o.value===preferred)?.value||(art.animationCount()?'a:0':art.stateMachineCount()?'s:0':'none');
  $('animation').value=selected;state.selected=null;state.hidden=[];chooseAnimation(selected);
}
async function loadSource(bytes,name,meta,key,index=0,preferred){
  const version=++loadId;ready=false;$('status').textContent='Importing';
  const loaded=await runtime.load(bytes,undefined,false);if(version!==loadId){loaded.delete();return;}
  animation?.delete();machine?.delete();art?.delete();sourceFile?.delete();animation=machine=art=null;
  sourceBytes=bytes;sourceName=name;sourceMeta=meta;sourceKey=key;sourceFile=loaded;
  $('artboard').replaceChildren();for(let i=0;i<loaded.artboardCount();i++){const a=loaded.artboardByIndex(i);$('artboard').add(new Option(a.name,i));a.delete();}
  setBoard(Math.min(index,loaded.artboardCount()-1),preferred);$('source').value=key;
  const credit=$('credit');credit.replaceChildren(document.createTextNode(meta?.credit||name));if(meta?.url){const a=document.createElement('a');a.href=meta.url;a.textContent=' · source / credit ↗';a.target='_blank';a.rel='noopener';credit.append(a);}
  document.body.dataset.source=name;ready=true;$('error').hidden=true;delete document.body.dataset.error;invalidate(true);
}
async function selectSource(key){const meta=samples[key];await loadSource(await fetchBytes(meta.file),meta.file.split('/').at(-1),meta,key,0,meta.mode);}
function drawOriginal(dt){
  if(animation){animation.advance(dt);animation.apply(1);}machine?.advanceAndApply(dt);art.advance(dt);
  referenceRenderer.clear();referenceRenderer.save();referenceRenderer.align(runtime.Fit.contain,runtime.Alignment.center,{minX:28,minY:28,maxX:692,maxY:452},art.bounds);
  capture.begin();try{art.draw(referenceRenderer);}finally{frame=capture.end({clip:state.clip});}
  referenceRenderer.restore();runtime.resolveAnimationFrame();
}
function boundsOf(draw){let bounds=[Infinity,Infinity,-Infinity,-Infinity];for(const c of draw.contours)for(const[x,y]of c.points){bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);}return Number.isFinite(bounds[0])?bounds:[0,0,0,0];}
function drawReturn(){
  overlayRenderer.clear();if(!state.returnLayer){runtime.resolveAnimationFrame();return;}
  const chosen=frame.draws.find(d=>d.id===(state.selected??hover)),bounds=chosen?boundsOf(chosen):[0,0,0,0];
  const values={headX:stats.head?.[0]||0,headY:stats.head?.[1]||0,selectedX:(bounds[0]+bounds[2])/2,selectedY:(bounds[1]+bounds[3])/2,selectedWidth:Math.max(1,bounds[2]-bounds[0]+12),selectedHeight:Math.max(1,bounds[3]-bounds[1]+12),selectionOpacity:chosen?1:0,scanPhase:stats.phase||0};
  for(const [key,value]of Object.entries(values))if(overlayNumbers[key])overlayNumbers[key].value=value;
  overlayMachine.advanceAndApply(0);overlayArt.advance(0);overlayArt.draw(overlayRenderer);runtime.resolveAnimationFrame();
}
function drawInspector(){
  const id=state.selected??hover,draw=frame.draws.find(d=>d.id===id),key=[id,draw?ticks:'empty',state.hidden.join(',')].join(':');if(key===lastInspector)return;lastInspector=key;
  const ctx=$('geometry').getContext('2d');ctx.clearRect(0,0,720,360);ctx.strokeStyle='#233939';ctx.lineWidth=1;for(let x=0;x<720;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,360);ctx.stroke();}for(let y=0;y<360;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(720,y);ctx.stroke();}
  if(!draw){ctx.fillStyle='#8caaa8';ctx.font='16px Georgia';ctx.textAlign='center';ctx.fillText('Select a path in the beam view',360,180);text('selection','Hover the enhanced drawing to inspect an evaluated path. Click to pin it; mute or isolate it without changing the original drawing.');return;}
  const [x0,y0,x1,y1]=boundsOf(draw),scale=Math.min(620/Math.max(1,x1-x0),260/Math.max(1,y1-y0));ctx.save();ctx.translate(360,180);ctx.scale(scale,scale);ctx.translate(-(x0+x1)/2,-(y0+y1)/2);ctx.lineWidth=1.3/scale;
  for(const contour of draw.contours){ctx.beginPath();contour.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle='#e8d28f';ctx.stroke();}
  let prev=[0,0],start=prev;
  for(const [verb,...p]of draw.commands){if(verb==='M'){prev=p;start=p;}else if(verb==='L')prev=p;else if(verb==='Z')prev=start;else if(verb==='C'){
    ctx.beginPath();ctx.moveTo(...prev);ctx.lineTo(p[0],p[1]);ctx.moveTo(p[2],p[3]);ctx.lineTo(p[4],p[5]);ctx.strokeStyle='#69a89c';ctx.stroke();for(let i=0;i<6;i+=2){ctx.beginPath();ctx.arc(p[i],p[i+1],2.5/scale,0,Math.PI*2);ctx.fillStyle=i===4?'#f1dda1':'#72d5c5';ctx.fill();}prev=p.slice(4);
  }}ctx.restore();
  text('selection',`Draw ${draw.id+1} · path resource ${draw.pathId} · ${draw.style}${draw.gradient?' / gradient':''} · ${draw.commands.filter(c=>c[0]==='C').length} cubics · ${draw.clips.length} clip layers · ${Math.round(draw.alpha*100)}% opacity${state.hidden.includes(draw.id)?' · muted':''}. IDs identify evaluated draw calls, not editor object names.`);
}
function tick(time){try{renderTick(time);}catch(error){raf=0;state.playing=false;refresh();$('status').textContent='Needs reset';fail(error);}}
function renderTick(time){
  raf=0;if(!ready||!visible||hostPaused||document.hidden){last=0;return;}
  const dt=last?Math.min(.05,(time-last)/1000):1/60;last=time;
  if(dirty||state.playing){drawOriginal(state.playing?dt:0);ticks++;document.body.dataset.frames=ticks;document.body.dataset.cubics=frame.cubics;document.body.dataset.draws=frame.draws.length;document.body.dataset.sourceTime=animation?.time||0;
    const contours=frame.contours.filter(c=>!state.hidden.includes(c.id));signalHistory.capture(contours,state.playing?dt:0,state.playing);stats=beam.draw(contours,dt,{...state,selected:state.selected??hover});drawReturn();drawInspector();signalHistory.render(state.selected??hover);
    // Text does not need the beam's frame rate. Stable values do not rewrite DOM nodes.
    if(time-lastUI>=100){lastUI=time;updateHistoryUI();text('draw-count',frame.draws.length);text('cubic-count',frame.cubics);text('segment-count',stats.segments);text('status',state.playing?'Live · '+(stats.floatBuffer?'HDR':'8-bit'):'Held');
      text('limits',[`${frame.images} image draws and ${frame.meshes} image meshes have no contour in this route.`,frame.truncated?'Capture limit reached (800 draws / 120k points).':'',stats.warning||''].filter(Boolean).join(' '));}
    document.body.dataset.segments=stats.segments;document.body.dataset.selected=state.selected??'';document.body.dataset.phase=stats.phase;document.body.dataset.returnLayer=state.returnLayer;
    dirty=false;
  }
  if(state.playing)raf=requestAnimationFrame(tick);
}
let historyPathOptions='';
function updateHistoryUI(){
 const paths=frame.draws.filter(d=>d.contours.length),key=paths.map(d=>d.id+':'+d.pathId).join(',');
 if(key!==historyPathOptions){historyPathOptions=key;$('history-path').replaceChildren(new Option('All paths / hover to inspect',''),...paths.map(d=>new Option(`Draw ${d.id+1} · ${d.style} · ${d.commands.filter(c=>c[0]==='C').length} cubics`,d.id)));}
 $('history-path').value=state.selected===null?'':String(state.selected);
 text('history-selection',(state.selected??hover)===null?'Hover or select a curve above':`Draw ${(state.selected??hover)+1} · current geometry`);
 text('history-path-title',(state.selected??hover)===null?'All captured paths':`Draw ${(state.selected??hover)+1} · through time`);
 const h=signalHistory.metrics();$('history-mode').value=h.mode;$('history-window').value=h.windowSeconds;$('history-lookback').value=h.lookback;$('history-depth').value=h.depth;
 text('history-window-value',h.windowSeconds.toFixed(2)+' s');text('history-lookback-value',h.lookback.toFixed(2)+' s');
 text('history-record',h.recording?'Freeze capture':'Record continuously');
 text('history-status',h.enabled?(h.sweeping?'Recording a one-second sweep… ':h.recording?'Rolling path capture · ':'Capture held · ')+h.frames+' / '+h.maxFrames+' samples · '+(h.bytes/1048576).toFixed(2)+' MiB of coordinates':'3D history is off. The live drawing and current-curve inspector still work.');
 $('history-enabled').checked=h.enabled;for(const control of document.querySelectorAll('.history-toolbar button,.history-controls input,.history-controls select'))control.disabled=!h.enabled;
 $('history-volume').setAttribute('aria-disabled',String(!h.enabled));
 document.body.dataset.historyFrames=h.frames;document.body.dataset.historyBytes=h.bytes;document.body.dataset.historyMode=h.mode;document.body.dataset.historyEnabled=h.enabled;
}
$('history-enabled').onchange=()=>{if(restorePlayAfterSweep){state.playing=false;restorePlayAfterSweep=false;signalHistory.freeze();refresh();}signalHistory.set({enabled:$('history-enabled').checked});};
for(const[name,key]of [['history-mode','mode'],['history-window','windowSeconds'],['history-lookback','lookback'],['history-depth','depth']])$(name).addEventListener('input',()=>signalHistory.set({[key]:key==='mode'?$(name).value:Number($(name).value)}));
$('history-path').onchange=()=>{state.selected=$('history-path').value===''?null:Number($('history-path').value);invalidate(state.isolate);};
$('history-record').onclick=()=>signalHistory.set({recording:!signalHistory.metrics().recording});
$('history-pose').onclick=()=>{signalHistory.freeze();signalHistory.set({mode:'snapshot',lookback:0});};
$('history-sweep').onclick=()=>{restorePlayAfterSweep=!state.playing;state.playing=true;signalHistory.sweep(1);refresh();wake();};
$('history-clear').onclick=()=>{signalHistory.clear();wake();};
window.__vectorSignalHistory={metrics:()=>signalHistory.metrics(),samples:()=>signalHistory.pack(),set:settings=>signalHistory.set(settings)};
function canvasPoint(event,canvas){const r=canvas.getBoundingClientRect();return[(event.clientX-r.left)*720/r.width,(event.clientY-r.top)*480/r.height];}
function nearestPath(p){let best=null,distance=8;for(const c of frame?.contours||[])for(let i=1;i<c.points.length;i++){const a=c.points[i-1],b=c.points[i],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);if(d<distance){distance=d;best=c.id;}}return best;}
$('overlay').onpointermove=e=>{const next=nearestPath(canvasPoint(e,$('overlay')));if(next!==hover){hover=next;wake();}};
$('overlay').onpointerleave=()=>{hover=null;wake();};$('overlay').onclick=e=>{state.selected=nearestPath(canvasPoint(e,$('overlay')));invalidate(state.isolate);};$('overlay').ondblclick=()=>{state.selected=null;invalidate(state.isolate);};
$('release').onclick=()=>{state.selected=null;invalidate(state.isolate);};$('hide').onclick=()=>{if(state.selected!==null&&!state.hidden.includes(state.selected))state.hidden.push(state.selected);invalidate(true);};$('restore').onclick=()=>{state.hidden=[];invalidate(true);};
for(const type of ['pointerdown','pointermove','pointerup','pointerleave'])$('reference').addEventListener(type,e=>{if(!machine)return;const p=canvasPoint(e,$('reference')),b=art.bounds,s=Math.min(664/(b.maxX-b.minX),424/(b.maxY-b.minY)),x=(p[0]-360)/s+(b.minX+b.maxX)/2,y=(p[1]-240)/s+(b.minY+b.maxY)/2;machine[{pointerdown:'pointerDown',pointermove:'pointerMove',pointerup:'pointerUp',pointerleave:'pointerExit'}[type]]?.(x,y);wake();});
for(const key of numeric)$(key).oninput=()=>{state[key]=Number($(key).value);invalidate();};
$('colour').onchange=()=>{state.colour=$('colour').value;invalidate();};
for(const[id,key]of [['clip','clip'],['travel','showTravel'],['isolate','isolate'],['return','returnLayer']])$(id).onchange=()=>{state[key]=$(id).checked;invalidate(key!=='returnLayer');};
$('play').onclick=()=>{state.playing=!state.playing;last=0;invalidate();};$('clear').onclick=()=>invalidate(true);
$('source').onchange=()=>selectSource($('source').value).catch(fail);$('artboard').onchange=()=>setBoard(Number($('artboard').value));$('animation').onchange=()=>chooseAnimation($('animation').value);
$('file').onchange=async()=>{const file=$('file').files[0];if(file){$('source').querySelector('[value="import"]').hidden=false;try{await loadSource(new Uint8Array(await file.arrayBuffer()),file.name,{credit:'Locally imported artwork · kept on this device'},'import');}catch(e){fail(e);}}};

async function exportPlayer(){
  $('export').disabled=true;$('export-status').textContent='Packing the evaluator, renderer and original artwork…';
  try{
    let assets=bundled;
    if(!assets){const urls=['vendor/canvas_advanced.js','capture.js','beam-renderer.js','app.js','style.css','vendor/LICENSE','signal-history.js'];const texts=await Promise.all(urls.map(u=>fetch(u).then(r=>{if(!r.ok)throw Error('Missing '+u);return r.text();})));assets={runtime:texts[0],capture:texts[1],beam:texts[2],app:texts[3],css:texts[4],license:texts[5],historyModule:texts[6],wasm:encode(await fetchBytes('vendor/rive.wasm')),overlay:encode(await fetchBytes('beam-cursor.riv'))};}
    const inputs={};if(machine)for(let i=0;i<machine.inputCount();i++){const input=machine.input(i);if(input.type!==runtime.SMIInput.trigger)inputs[input.name]=input.type===runtime.SMIInput.bool?input.asBool().value:input.asNumber().value;}
    const data={...assets,format:'RIVX-VECTOR-SIGNAL-1',source:encode(sourceBytes),name:sourceName,meta:sourceMeta,key:sourceKey,board:boardIndex,animation:$('animation').value,time:animation?.time||0,inputs,settings:{...state},signalHistory:signalHistory.pack(),limitations:'State machines restart with stored inputs; transient phosphor rebuilds. Not a universal native .rivx player.'};
    const clone=document.documentElement.cloneNode(true);clone.querySelectorAll('script,link[rel="stylesheet"]').forEach(n=>n.remove());clone.querySelector('header .back')?.remove();clone.querySelector('#export').disabled=false;clone.querySelector('#export-status').textContent='Self-contained exported vector renderer.';clone.querySelector('#error').hidden=true;
    const style=document.createElement('style');style.textContent=assets.css;clone.querySelector('head').append(style);
    const html='<!doctype html>\n'+clone.outerHTML.replace('</body>',`<script>window.__VECTOR_SIGNAL__=${JSON.stringify(data).replace(/</g,'\\u003c')};<\/script><script type="module">${assets.app.replace(/<\/script/gi,'<\\/script')}<\/script></body>`);
    let suffix=0;const key='vector-signal-export';try{if(!$('overwrite').checked){suffix=Number(localStorage.getItem(key)||0);localStorage.setItem(key,String(suffix+1));}}catch{suffix=exportPlayer.count||0;exportPlayer.count=suffix+1;}
    const name='vector-signal'+(suffix?` [${suffix}]`:'')+'.html',url=URL.createObjectURL(new Blob([html],{type:'text/html'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
    $('export-status').textContent=`Saved ${name} · ${(html.length/1048576).toFixed(1)} MB. Timelines retain their time; state machines restart with saved inputs. Captured vector history is retained and opens held. Phosphor history rebuilds.`;
  }catch(e){fail(e);$('export-status').textContent='Export failed; the source is unchanged.';}finally{$('export').disabled=false;}
}
$('export').onclick=exportPlayer;
async function start(){
  refresh();runtime=await Rive(bundled?{wasmBinary:decode(bundled.wasm)}:{locateFile:name=>new URL('vendor/'+(name.includes('fallback')?'rive_fallback.wasm':'rive.wasm'),import.meta.url).href});capture=installCapture(runtime);beam=createBeamRenderer($('beam'));referenceRenderer=runtime.makeRenderer($('reference'));overlayRenderer=runtime.makeRenderer($('overlay'));
  overlayFile=await runtime.load(bundled?decode(bundled.overlay):await fetchBytes('beam-cursor.riv'),undefined,false);overlayArt=overlayFile.defaultArtboard();overlayVM=overlayFile.defaultArtboardViewModel(overlayArt).defaultInstance();overlayMachine=new runtime.StateMachineInstance(overlayArt.stateMachineByIndex(0),overlayArt);overlayMachine.bindViewModelInstance(overlayVM);
  for(const key of ['headX','headY','selectedX','selectedY','selectedWidth','selectedHeight','selectionOpacity','scanPhase'])overlayNumbers[key]=overlayVM.number(key);
  if(bundled){await loadSource(decode(bundled.source),bundled.name,bundled.meta,bundled.key,bundled.board,bundled.animation);Object.assign(state,bundled.settings);if(animation)animation.time=bundled.time;if(machine)for(let i=0;i<machine.inputCount();i++){const input=machine.input(i),value=bundled.inputs[input.name];if(value!==undefined){const v=input.type===runtime.SMIInput.bool?input.asBool():input.asNumber();v.value=value;}}for(const option of $('source').options)option.disabled=option.value!==sourceKey;signalHistory.restore(bundled.signalHistory);}
  else await selectSource(new URLSearchParams(location.search).get('source')||'truck');
  if(new URLSearchParams(location.search).has('paused'))state.playing=false;invalidate();document.body.dataset.ready='true';if(parent!==window)parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);
}
function checkVerticalVisibility(){const b=document.querySelector('main').getBoundingClientRect();const next=b.bottom>0&&b.top<innerHeight;if(next!==visible){visible=next;last=0;wake();}}
window.addEventListener('scroll',checkVerticalVisibility,{passive:true});window.addEventListener('resize',checkVerticalVisibility);
document.addEventListener('visibilitychange',()=>{last=0;wake();});window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='portfolio-lab-visibility'){hostPaused=!e.data.visible;last=0;wake();}});
window.addEventListener('pagehide',e=>{if(raf)cancelAnimationFrame(raf);raf=0;if(!e.persisted){ready=false;animation?.delete();machine?.delete();art?.delete();sourceFile?.delete();overlayMachine?.delete();overlayArt?.delete();overlayFile?.delete();referenceRenderer?.delete();overlayRenderer?.delete();beam?.dispose();capture?.dispose();}});window.addEventListener('pageshow',e=>{if(e.persisted)wake();});
start().catch(fail);
