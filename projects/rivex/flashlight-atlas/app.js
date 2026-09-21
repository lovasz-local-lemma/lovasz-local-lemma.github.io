import {createFlashlightRenderer} from './renderer.js';
import {normalizeSetup,parseSetups,sourcePresets,aimAtSphere} from './setups.js';

const $=id=>document.getElementById(id), stage=$('instrument'), canvas=$('interface');
const packaged=window.__FLASHLIGHT_PACKAGE;
const defaults={aimX:.442,aimY:.410,radius:.25,density:.12,gate:.65,gateWidth:.75,temporal:0,playing:1,mode:2,ior:1.5,exposure:1,photons:4096,materialPair:0,cycleMaterials:0,skin:1,wire:.75,mediumMode:1,mediumScale:2.4,mediumContrast:.9,temporalHistory:1,followTransport:1,animateMedium:0,progressive:1,flowEnabled:0,flowPaused:0,flowStrength:1,flowFeed:1,flowView:0,flowReset:0,lightX:-2.7,lightY:6.4,lightZ:1.4,sphereX:-.85,sphereY:2.35,sphereZ:.25,sphereRadius:.86,metalX:1.58,metalY:1.03,metalZ:-.48,metalRadius:.93,bump:0,kernel:.065,feather:.35,brightness:1,torchYaw:0,torchPitch:0,sourceShape:0,sourceRadius:.18,dispersion:0,reset:0};
const flowNames=['flowEnabled','flowPaused','flowStrength','flowFeed','flowView','flowReset'];
const torchNames=['brightness','torchYaw','torchPitch','sourceShape','sourceRadius','dispersion'];
const initial={...defaults,...packaged?.settings};
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reduced){initial.playing=0;initial.flowPaused=1;}
const hostState={...initial};
let riveView,gpu,ready=false,raf=0,last=0,time=0,frames=0,visible=true,hostVisible=true,pageVisible=true,drag=null,generation=0,priorReset=0,priorState='';
let priorGPUState='',needsGPUFrame=true,lastGPUChange=0,priorPreview=false,editorDragging=false,lastStatusTime=0;
let flowElapsed=0;
let lastMaterialCycle=0;const elastic={};
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const encode=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
async function textAsset(name){if(packaged?.[name]!=null)return packaged[name];const response=await fetch(new URL(name,location.href));if(!response.ok)throw Error(`Could not load ${name} (${response.status})`);return response.text();}
async function interfaceBytes(){if(packaged?.interface)return decode(packaged.interface);const response=await fetch('interface.riv');if(!response.ok)throw Error('The native Rive interface could not be loaded.');return new Uint8Array(await response.arrayBuffer());}
const prop=name=>riveView?.viewModelInstance?.number(name);
const put=(name,value)=>{if(!Number.isFinite(value))return;const p=prop(name);if(p&&p.value!==value)p.value=value;else if(!p&&name in hostState)hostState[name]=value;};
const label=(name,value)=>{const p=riveView?.viewModelInstance?.string(name);if(p&&p.value!==value)p.value=value;};
const values=()=>Object.fromEntries(Object.keys(defaults).map(name=>[name,prop(name)?.value??hostState[name]]));
const active=()=>ready&&visible&&hostVisible&&pageVisible&&!document.hidden;
function error(error){generation++;ready=false;cancelAnimationFrame(raf);raf=0;riveView?.cleanup();riveView=null;gpu?.dispose();gpu=null;document.body.dataset.ready='false';$('loading').hidden=false;$('loading').replaceChildren(Object.assign(document.createElement('strong'),{textContent:'The instrument could not start.'}),Object.assign(document.createElement('span'),{textContent:String(error.message||error)+' Reset to retry.'}));$('status').textContent='This RIVX Suite needs WebGPU over HTTPS, localhost or a supported local-file context.';$('export').disabled=true;console.error(error);}
function updateRive(v,dt){
 for(const [i,name] of ['skinClassic','skinLiquid','skinMondrian'].entries())put(name,Math.round(v.skin)===i?1:0);
 for(const name of ['radius','density','gate']){
  const spring=elastic[name]??={value:v[name],stretch:0,velocity:0};
  const impulse=Math.min(.45,Math.abs(v[name]-spring.value)*10);spring.value=v[name];
  spring.velocity+=impulse*35;spring.velocity+=(-spring.stretch*95-spring.velocity*15)*dt;spring.stretch+=spring.velocity*dt;
  const hover=drag===name?.13:0;const stretch=reduced?0:Math.max(-.15,Math.min(.55,spring.stretch))+hover;
  put(name+'Stretch',1+stretch);put(name+'Squash',1/(1+stretch));
 }
 put('guideX',36+1040*v.aimX);put('guideY',168+640*v.aimY);put('guideRadius',2*v.radius*640);
 for(const [name,t] of [['radius',(v.radius-.08)/.42],['density',v.density/.5],['gate',v.gate]]){put(name+'X',1140+224*t);put(name==='gate'?'gateWidthUI':name+'Width',Math.max(1,224*t));}
 put('gateMarkerX',1140+224*v.gate);put('gateWindowX',1140+224*v.gate-224*v.gateWidth/26);put('gateWindowWidth',224*v.gateWidth/13);
 for(let i=0;i<3;i++){put('mode'+i,Math.abs(v.mode-i)<.1?1:0);const current=prop('hover'+i)?.value??0,target=prop('hoverTarget'+i)?.value??0;put('hover'+i,current+(target-current)*(1-Math.exp(-16*dt)));}
 put('guideGlow',.45+.35*(prop('hoverAim')?.value??0));
 put('temporalOn',v.temporal);put('playOn',v.playing);put('playOff',1-v.playing);put('time',time);
 label('temporalText',v.temporal>.5?'Time gate on':'Time gate off');label('radiusText',Math.round(v.radius*100)+'%');label('densityText',v.density.toFixed(2)+' /m');label('gateText',(3+13*v.gate).toFixed(2)+' m');label('motionText',v.playing>.5?'Hold pulse':'Sweep pulse');
 label('statusText',v.mode<.5?'TRIANGLES / DEPTH':v.mode<1.5?'TRACED REFLECTION / REFRACTION':'TRACED PHOTONS / FINITE KERNEL');
 const signature=[v.mode,v.radius,v.density,v.temporal,v.playing,Math.round(v.gate*1000),v.materialPair,v.cycleMaterials,v.skin,v.wire,v.mediumMode,v.mediumScale,v.mediumContrast,v.temporalHistory,v.followTransport,v.animateMedium,v.gateWidth,v.progressive,v.lightX,v.lightY,v.lightZ,v.sphereX,v.sphereY,v.sphereZ,v.sphereRadius,v.metalX,v.metalY,v.metalZ,v.metalRadius,v.bump,v.kernel,v.feather,v.photons,...flowNames.map(name=>v[name]),...torchNames.map(name=>v[name])].join();
 if(signature!==priorState){priorState=signature;$('accessible-mode').value=String(Math.round(v.mode));$('accessible-radius').value=v.radius;$('accessible-density').value=v.density;$('accessible-gate').value=v.gate;$('accessible-temporal').checked=v.temporal>.5;$('accessible-play').textContent=v.playing>.5?'Hold pulse':'Sweep pulse';
 for(const name of ['materialPair','skin','mediumMode'])$('option-'+name).value=String(Math.round(v[name]));
 for(const name of ['cycleMaterials','followTransport','animateMedium','progressive','temporalHistory'])$('option-'+name).checked=v[name]>.5;
 for(const name of ['lightX','lightY','lightZ','sphereX','sphereY','sphereZ','sphereRadius','metalX','metalY','metalZ','metalRadius','bump','kernel','feather','photons']){const el=$('edit-'+name);el.value=v[name];const output=$('value-'+name);if(output)output.textContent=Number(v[name]).toFixed(2);}
 for(const name of torchNames){$('torch-'+name).value=v[name];const output=$('torch-'+name+'-value');if(output)output.textContent=name==='dispersion'?v[name].toFixed(3):name==='torchYaw'||name==='torchPitch'?v[name].toFixed(0)+'°':v[name].toFixed(2);}$('torch-sourceRadius').disabled=v.sourceShape<.5;
 $('option-wire').value=v.wire;$('option-gateWidth').value=v.gateWidth;
 for(const name of ['mediumScale','mediumContrast']){$('option-'+name).value=v[name];$('option-'+name).disabled=v.mediumMode<4.5;$('option-'+name+'-value').textContent=v[name].toFixed(2);}
 $('option-gateWidth-value').textContent=v.gateWidth.toFixed(2)+' m';
 $('flow-enabled').checked=v.flowEnabled>.5;
 $('flow-pause').textContent=v.flowPaused>.5?'Resume flow':'Freeze flow';$('flow-pause').setAttribute('aria-pressed',String(v.flowPaused>.5));
 for(const id of ['flow-pause','flow-reset','flow-strength','flow-feed','flow-view'])$(id).disabled=v.flowEnabled<.5;
 $('flow-strength').value=v.flowStrength;$('flow-strength-value').textContent=v.flowStrength.toFixed(2);
 $('flow-view').value=String(v.flowView);$('flow-feed').value=v.flowFeed;$('flow-feed-value').textContent=v.flowFeed.toFixed(2);
 $('option-mediumMode').disabled=v.flowEnabled>.5;
 $('option-animateMedium').disabled=v.flowEnabled>.5;
 }
}
function tick(now){raf=0;if(!active()){last=0;return;}const dt=last?Math.min(.06,(now-last)/1000):0;last=now;let v=values();
 if(v.reset!==priorReset){priorReset=v.reset;for(const [key,val] of Object.entries(defaults))if(key!=='reset')put(key,val);v=values();}
 if(v.playing>.5){time+=dt;if(v.temporal>.5){put('gate',(v.gate+dt*.085)%1);v=values();}}
 if(v.cycleMaterials>.5 && !reduced && v.playing>.5 && time-lastMaterialCycle>7){put('materialPair',(Math.round(v.materialPair)+1+Math.floor(Math.random()*9))%10);lastMaterialCycle=time;v=values();}
 updateRive(v,dt);
 const flowRunning=v.flowEnabled>.5&&v.flowPaused<.5&&v.mode>.5;
 flowElapsed=flowRunning?flowElapsed+dt:0;
 const flowDue=flowRunning&&flowElapsed>=1/30;
 // A stationary photon view refines its retained mean. Native Rive hover
 // animation is independent and does not invalidate the optical state.
 const gpuState=[v.aimX,v.aimY,v.radius,v.mode,v.density,v.temporal,v.temporal>.5?v.gate:0,v.gateWidth,v.ior,v.photons,v.exposure,v.materialPair,v.wire,v.mediumMode,v.mediumScale,v.mediumContrast,v.temporalHistory,v.followTransport,v.progressive,v.lightX,v.lightY,v.lightZ,v.sphereX,v.sphereY,v.sphereZ,v.sphereRadius,v.metalX,v.metalY,v.metalZ,v.metalRadius,v.bump,v.kernel,v.feather,...flowNames.map(name=>v[name]),...torchNames.map(name=>v[name]),v.animateMedium>.5&&v.mediumMode>1.5?Math.floor(time*30):0].join();
 if(gpuState!==priorGPUState){lastGPUChange=now;needsGPUFrame=true;priorGPUState=gpuState;}
 const preview=!!drag||editorDragging||now-lastGPUChange<160;
 if(needsGPUFrame||preview!==priorPreview||flowDue||!flowRunning&&v.mode>1.5&&v.progressive>.5&&!preview){gpu.render({aimX:v.aimX,aimY:v.aimY,radius:v.radius,mode:Math.round(v.mode),density:v.density,gateOn:v.temporal>.5,gateCenter:3+13*v.gate,gateWidth:v.gateWidth,ior:v.ior,photons:v.photons,exposure:v.exposure,materialPair:v.materialPair,wire:v.wire,mediumMode:v.mediumMode,mediumScale:v.mediumScale,mediumContrast:v.mediumContrast,temporalHistory:v.temporalHistory>.5,followTransport:v.followTransport>.5,time:v.animateMedium>.5&&v.mediumMode>1.5?time:0,lightX:v.lightX,lightY:v.lightY,lightZ:v.lightZ,sphereX:v.sphereX,sphereY:v.sphereY,sphereZ:v.sphereZ,sphereRadius:v.sphereRadius,metalX:v.metalX,metalY:v.metalY,metalZ:v.metalZ,metalRadius:v.metalRadius,bump:v.bump,kernel:v.kernel,feather:v.feather,...Object.fromEntries(torchNames.map(name=>[name,v[name]])),flowEnabled:v.flowEnabled>.5,flowPaused:v.flowPaused>.5,flowStrength:v.flowStrength,flowFeed:v.flowFeed,flowView:v.flowView,flowReset:v.flowReset,flowDt:flowElapsed,preview,accumulate:v.progressive>.5});flowElapsed=0;needsGPUFrame=false;priorPreview=preview;frames++;}
 const flow=gpu.metrics.flow;
 if(flow){Object.assign(document.body.dataset,{flowEnabled:String(v.flowEnabled>.5),flowPaused:String(v.flowPaused>.5),flowSteps:String(flow.steps??0),flowGeneration:String(flow.generation??0),flowDispatches:String(flow.dispatches??0),flowGrid:(flow.grid??[40,32,40]).join('x'),lightingBatches:String(gpu.metrics.batches),historyWeight:String(gpu.metrics.historyWeight)});}
 if(now-lastStatusTime>240){lastStatusTime=now;const m=gpu.metrics;
 $('flow-status').textContent=v.flowEnabled<.5?'Optional: warm plumes rise around solid objects. The flashlight can also steer an artistic air jet.':v.mode<.5?'Flow held while the raster baseline is selected.':`${v.flowPaused>.5?'Frozen volume · move the light to inspect':'Evolving volume · drag the flashlight to stir'} · 40 × 32 × 40 cells · ${flow?.steps??0} compute steps`;
 $('status').textContent=flowRunning?'Live flow · compute simulation → density-aware lighting':v.mode<1.5?'Live · ordinary Rive + raster / ray evaluation':m.phase==='temporal preview'?'Sweeping pulse · 512 rays · short temporal blend (biased)':m.phase==='preview'?'Moving preview · 512 rays · refinement restarts when still':`${v.progressive>.5?'Refining':'Held batch'} · ${m.batches.toLocaleString()} batches · ${m.emitted.toLocaleString()} emitted rays · linear running mean`;}

 Object.assign(document.body.dataset,{ready:'true',frames:String(frames),mode:String(v.mode),aimX:String(v.aimX),aimY:String(v.aimY),gate:String(v.gate),temporal:String(v.temporal),route:'rivx-suite',photons:String(v.photons),materialPair:String(v.materialPair),skin:String(v.skin),mediumMode:String(v.mediumMode)});
 raf=requestAnimationFrame(tick);
}
function visibility(){if(active()){riveView?.play();if(!raf)raf=requestAnimationFrame(tick);}else{riveView?.pause();cancelAnimationFrame(raf);raf=0;}last=0;}
function resize(){riveView?.resizeDrawingSurfaceToCanvas(Math.min(devicePixelRatio||1,1.5));needsGPUFrame=true;}
async function start(){const ticket=++generation;ready=false;document.body.dataset.ready='false';cancelAnimationFrame(raf);raf=0;riveView?.cleanup();riveView=null;gpu?.dispose();gpu=null;time=frames=last=lastMaterialCycle=flowElapsed=0;for(const key of Object.keys(elastic))delete elastic[key];priorState='';drag=null;$('loading').hidden=false;$('export').disabled=true;$('status').textContent='Standby · loading the Rive instrument and GPU pipelines…';
 priorGPUState='';needsGPUFrame=true;
 try{const [bytes,shaderSource,flowShaderSource]=await Promise.all([interfaceBytes(),textAsset('scene.wgsl'),textAsset('flow.wgsl')]);
 await Promise.all([
 new Promise((resolve,reject)=>{const instance=new rive.Rive({buffer:bytes.buffer,canvas,autoplay:false,autoBind:true,stateMachines:'Instrument',enableGPUCanvas:false,layout:new rive.Layout({fit:rive.Fit.Contain,alignment:rive.Alignment.Center}),onLoad(){if(ticket!==generation){instance.cleanup();resolve();return;}riveView=instance;for(const [key,value]of Object.entries(initial))put(key,value);priorReset=initial.reset;resize();resolve();},onLoadError(e){reject(Error(e.data||'Rive could not load the interface.'));}});}),
 createFlashlightRenderer($('gpu'),{shaderSource,flowShaderSource,onError:e=>{if(ticket===generation)error(e);}}).then(view=>{if(ticket!==generation)view.dispose();else gpu=view;})]);
 if(ticket!==generation)return;ready=true;$('loading').hidden=true;$('export').disabled=false;$('status').textContent='Live · ordinary Rive controls + raster, ray and photon passes';visibility();if(parent!==window)parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);
 }catch(e){if(ticket===generation)error(e);}
}
function point(event){const b=canvas.getBoundingClientRect();return{x:(event.clientX-b.left)*1440/b.width,y:(event.clientY-b.top)*1000/b.height};}
function move(p){if(!drag)return;const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 if(drag==='aim'){put('aimX',clamp((p.x-36)/1040,0,1));put('aimY',clamp((p.y-168)/640,0,1));}
 else{const t=clamp((p.x-1140)/224,0,1);put(drag,drag==='radius'?.08+t*.42:drag==='density'?t*.5:t);if(drag==='gate')put('playing',0);}
}
canvas.addEventListener('pointerdown',event=>{if(!ready)return;const p=point(event);if(p.x>=36&&p.x<=1076&&p.y>=168&&p.y<=808)drag='aim';else if(p.x>=1120&&p.x<=1380){const i=[434,522,610].findIndex(y=>Math.abs(p.y-y)<26);if(i>=0)drag=['radius','density','gate'][i];}if(drag){canvas.setPointerCapture(event.pointerId);move(p);event.preventDefault();}});
canvas.addEventListener('pointermove',event=>{const p=point(event),inside=p.x>=36&&p.x<=1076&&p.y>=168&&p.y<=808;canvas.style.cursor=inside?'crosshair':'default';put('hoverAim',inside?1:0);if(drag)move(p);});
canvas.addEventListener('pointerleave',()=>{if(!drag)put('hoverAim',0);});
for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,event=>{drag=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);});
canvas.addEventListener('keydown',event=>{if(!ready)return;const v=values(),steps={ArrowLeft:[-.025,0],ArrowRight:[.025,0],ArrowUp:[0,-.025],ArrowDown:[0,.025]};if(steps[event.key]){put('aimX',Math.max(0,Math.min(1,v.aimX+steps[event.key][0])));put('aimY',Math.max(0,Math.min(1,v.aimY+steps[event.key][1])));event.preventDefault();}else if(['1','2','3'].includes(event.key)){put('mode',+event.key-1);event.preventDefault();}else if(event.key.toLowerCase()==='t'){put('temporal',1-v.temporal);event.preventDefault();}});
const presets={glass:{mode:2,aimX:.442,aimY:.410,radius:.25,density:.12,temporal:0},metal:{mode:1,aimX:.63,aimY:.53,radius:.23,density:.055,temporal:0},pulse:{mode:2,aimX:.442,aimY:.410,radius:.3,density:.30,mediumMode:5,animateMedium:0,temporal:1,playing:1,gate:.45},raster:{mode:0,temporal:0,density:.12},flow:{mode:3,temporal:0,density:.19,radius:.34,brightness:1.3,wire:.3,mediumMode:1,flowEnabled:1,flowPaused:reduced?1:0,flowStrength:1,flowFeed:1,lightX:-2.7,lightY:6.4,lightZ:1.4}};
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{if(!ready)return;const name=button.dataset.preset;put('flowEnabled',name==='flow'?1:0);if(name==='flow')put('flowReset',values().flowReset+1);for(const [key,val]of Object.entries(presets[name]))put(key,val);if(name!=='raster')for(const [key,val]of Object.entries(aimAtSphere(values(),name==='metal'?'metal':'sphere')))put(key,val);document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('selected',b===button));}));
$('flow-enabled').onchange=event=>{put('flowEnabled',event.target.checked?1:0);if(event.target.checked){const v=values();if(v.mode<.5)put('mode',2);if(v.density<.05)put('density',.19);}};
$('flow-pause').onclick=()=>put('flowPaused',1-values().flowPaused);
$('flow-reset').onclick=()=>put('flowReset',values().flowReset+1);
$('flow-strength').oninput=event=>put('flowStrength',+event.target.value);
$('flow-view').onchange=event=>put('flowView',+event.target.value);
$('flow-feed').oninput=event=>put('flowFeed',+event.target.value);
for(const name of ['materialPair','skin','mediumMode','wire','gateWidth','mediumScale','mediumContrast'])$('option-'+name).addEventListener('input',event=>put(name,+event.target.value));
for(const name of ['cycleMaterials','followTransport','animateMedium','progressive','temporalHistory'])$('option-'+name).addEventListener('change',event=>{put(name,event.target.checked?1:0);if(name==='cycleMaterials')lastMaterialCycle=time;});
for(const name of ['mode','radius','density','gate'])$('accessible-'+name).addEventListener('input',event=>{put(name,+event.target.value);if(name==='gate')put('playing',0);});
$('accessible-temporal').onchange=event=>put('temporal',event.target.checked?1:0);$('accessible-play').onclick=()=>put('playing',1-values().playing);$('restart').onclick=start;

for(const name of torchNames){const input=$('torch-'+name);input.addEventListener('input',()=>put(name,+input.value));input.addEventListener('pointerdown',()=>editorDragging=true);}
$('torch-reset-direction').onclick=()=>{put('torchYaw',0);put('torchPitch',0);};
const editNames=['lightX','lightY','lightZ','sphereX','sphereY','sphereZ','sphereRadius','metalX','metalY','metalZ','metalRadius','bump','kernel','feather','photons'];
for(const name of editNames){const input=$('edit-'+name);input.addEventListener('input',()=>{put(name,+input.value);if(name==='sphereRadius'||name==='sphereY'){const v=values();put('sphereY',Math.max(v.sphereY,v.sphereRadius+.08));}if(name==='metalRadius'||name==='metalY'){const v=values();put('metalY',Math.max(v.metalY,v.metalRadius+.1));}});input.addEventListener('pointerdown',()=>editorDragging=true);}
for(const event of ['pointerup','pointercancel'])window.addEventListener(event,()=>editorDragging=false);
function applySetup(settings){const normalized=normalizeSetup(settings,defaults);for(const [name,value]of Object.entries(normalized))if(name!=='reset')put(name,value);needsGPUFrame=true;}
document.querySelectorAll('[data-source]').forEach(button=>button.onclick=()=>{put('torchYaw',0);put('torchPitch',0);for(const [name,value]of Object.entries(sourcePresets[button.dataset.source]))put(name,value);for(const [name,value]of Object.entries(aimAtSphere(values())))put(name,value);put('temporal',0);});
$('aim-sphere').onclick=()=>{put('torchYaw',0);put('torchPitch',0);for(const [name,value]of Object.entries(aimAtSphere(values())))put(name,value);};
let savedSetups=[];
try{savedSetups=packaged?.setups?parseSetups(JSON.stringify({format:'RIVX-FLASHLIGHT-SETUPS-1',setups:packaged.setups}),defaults):parseSetups(localStorage.getItem('rivx-flashlight-setups')||'{"format":"RIVX-FLASHLIGHT-SETUPS-1","setups":[]}',defaults);}catch{}
function renderList(persist=false){const select=$('saved-setups');select.replaceChildren(Object.assign(document.createElement('option'),{value:'',textContent:'Choose a saved setup'}));savedSetups.forEach((entry,i)=>select.append(Object.assign(document.createElement('option'),{value:String(i),textContent:entry.name})));try{if(persist)localStorage.setItem('rivx-flashlight-setups',JSON.stringify({format:'RIVX-FLASHLIGHT-SETUPS-1',setups:savedSetups}));}catch{}}
$('add-setup').onclick=()=>{if(!ready)return;if(savedSetups.length>=100){$('setup-status').textContent='The list already contains 100 setups.';return;}const name=$('setup-name').value.trim().slice(0,80)||'Gallery setup '+(savedSetups.length+1);savedSetups.push({name,settings:normalizeSetup(values(),defaults)});renderList(true);$('saved-setups').value=String(savedSetups.length-1);$('setup-status').textContent='Added “'+name+'” to your local list.';};
$('saved-setups').onchange=()=>{const entry=savedSetups[+$('saved-setups').value];if($('saved-setups').value!==''&&entry){applySetup(entry.settings);$('setup-name').value=entry.name;$('setup-status').textContent='Restored “'+entry.name+'”. Photon refinement restarted.';}};
$('remove-setup').onclick=()=>{const selected=$('saved-setups').value;if(selected==='')return;const removed=savedSetups.splice(+selected,1)[0];renderList(true);$('setup-status').textContent='Removed “'+removed.name+'” from your local list.';};
$('export-setups').onclick=()=>{const json=JSON.stringify({format:'RIVX-FLASHLIGHT-SETUPS-1',setups:savedSetups},null,2),url=URL.createObjectURL(new Blob([json],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='flashlight-setups.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
$('import-setups').onclick=()=>$('setup-file').click();$('setup-file').onchange=async()=>{const file=$('setup-file').files[0];if(!file)return;try{if(file.size>500000)throw Error('Setup list is too large.');const entries=parseSetups(await file.text(),defaults),merged=[...savedSetups],keys=new Set(merged.map(e=>JSON.stringify(e)));let added=0;for(const entry of entries){const key=JSON.stringify(entry);if(!keys.has(key)){if(merged.length>=100)throw Error('Import would exceed 100 setups; remove entries first.');merged.push(entry);keys.add(key);added++;}}savedSetups=merged;renderList(true);$('setup-status').textContent='Added '+added+' imported setups; existing entries kept. Choose one to restore it.';}catch(e){$('setup-status').textContent='Import failed: '+e.message;}$('setup-file').value='';};
renderList();
if(matchMedia('(max-width:760px)').matches)document.querySelector('.accessible').open=true;
new ResizeObserver(resize).observe(stage);window.addEventListener('scroll',()=>{const b=document.querySelector('main').getBoundingClientRect();const next=b.bottom>0&&b.top<innerHeight;if(next!==visible){visible=next;visibility();}},{passive:true});document.addEventListener('visibilitychange',visibility);
window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='portfolio-lab-visibility'){hostVisible=!!event.data.visible;visibility();}});
window.addEventListener('pagehide',event=>{pageVisible=false;visibility();if(!event.persisted){generation++;ready=false;riveView?.cleanup();gpu?.dispose();}});window.addEventListener('pageshow',()=>{pageVisible=true;needsGPUFrame=true;visibility();});
window.__flashlightAtlas={getState:()=>({ready,frames,time,values:values(),route:'rivx-suite',setups:savedSetups.map(s=>({name:s.name,settings:{...s.settings}})),metrics:gpu?.metrics,nativeHandles:Object.fromEntries(['skinClassic','skinLiquid','skinMondrian','radiusStretch','radiusSquash'].map(name=>[name,prop(name)?.value]))}),set:state=>{for(const [name,val]of Object.entries(state))if(name in defaults)put(name,val);}};

async function saveSuite(){if(!ready)return;$('export').disabled=true;$('export-status').textContent='Standby · packaging the current instrument, runtime and shader…';
 const fetchChecked=async path=>{const response=await fetch(path);if(!response.ok)throw Error(`Could not package ${path} (${response.status})`);return response;};
 try{const [app,renderer,shader,css,bytes,library,wasm,license,setupsModule,flowModule,flowShader]=await Promise.all([textAsset('app.js'),textAsset('renderer.js'),textAsset('scene.wgsl'),textAsset('style.css'),interfaceBytes(),packaged?packaged.rivejs:fetchChecked('../gpu-showpieces/vendor/rive.js').then(r=>r.text()),packaged?decode(packaged.wasm):fetchChecked('../gpu-showpieces/vendor/rive.wasm').then(r=>r.arrayBuffer()).then(b=>new Uint8Array(b)),packaged?packaged.license:fetchChecked('../gpu-showpieces/vendor/LICENSE').then(r=>r.text()),textAsset('setups.js'),textAsset('flow.js'),textAsset('flow.wgsl')]);
 const fontNames=['licenses/Inter-OFL.txt','licenses/KaTeX-fonts-LICENSE.txt'];
 const fontNotices=await Promise.all(fontNames.map(textAsset));
 const pkg={'app.js':app,'renderer.js':renderer,'scene.wgsl':shader,'style.css':css,'setups.js':setupsModule,'flow.js':flowModule,'flow.wgsl':flowShader,setups:savedSetups,interface:encode(bytes),rivejs:library,wasm:encode(wasm),license,settings:{...values(),playing:0,flowPaused:1},...Object.fromEntries(fontNames.map((name,i)=>[name,fontNotices[i]]))};
 const root=document.documentElement.cloneNode(true);root.querySelectorAll('script,link[rel=stylesheet]').forEach(el=>el.remove());root.querySelector('title').textContent='Flashlight Atlas · offline RIVX Suite';const style=document.createElement('style');style.textContent=css;root.querySelector('head').append(style);
 const bootstrap=`window.__FLASHLIGHT_PACKAGE=${JSON.stringify(pkg).replace(/</g,'\\u003c')};const p=window.__FLASHLIGHT_PACKAGE;const lib=document.createElement('script');lib.src=URL.createObjectURL(new Blob([p.rivejs],{type:'text/javascript'}));lib.onload=()=>{const flow=URL.createObjectURL(new Blob([p['flow.js']],{type:'text/javascript'}));const renderer=URL.createObjectURL(new Blob([p['renderer.js'].replace("'./flow.js'",JSON.stringify(flow))],{type:'text/javascript'}));const setups=URL.createObjectURL(new Blob([p['setups.js']],{type:'text/javascript'}));const app=p['app.js'].replace("'./renderer.js'",JSON.stringify(renderer)).replace("'./setups.js'",JSON.stringify(setups));const main=document.createElement('script');main.type='module';main.src=URL.createObjectURL(new Blob([app],{type:'text/javascript'}));document.body.append(main);};document.head.append(lib);`;
 const script=document.createElement('script');script.textContent=bootstrap;root.querySelector('body').append(script);const blob=new Blob(['<!doctype html>\n'+root.outerHTML],{type:'text/html'}),url=URL.createObjectURL(blob),a=document.createElement('a');let count=0;try{count=Number(localStorage.getItem('flashlight-suite-count')||0);localStorage.setItem('flashlight-suite-count',String(count+1));}catch{}a.href=url;a.download='flashlight-atlas'+(count?` [${count}]`:'')+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);$('export-status').textContent='Exported · the selected settings, Rive interface and GPU player are packaged together. Smoke restarts from its seeded setup, held for inspection. Open in a WebGPU-capable browser.';
 }catch(e){$('export-status').textContent='Export failed: '+e.message;}finally{$('export').disabled=false;}}
$('export').onclick=saveSuite;
rive.RuntimeLoader.setWasmUrl(packaged?'data:application/wasm;base64,'+packaged.wasm:new URL('../gpu-showpieces/vendor/rive.wasm',location.href).href);
start();
