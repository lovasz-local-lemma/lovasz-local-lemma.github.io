import {parsePly,createSplatRenderer} from './renderer.js';
import {createRiveField} from './rive-field.js';
import {defaultEdit,regionNames,applyEdits,editedPly,editRecipe,validateRecipe} from './editing.js';
const $=id=>document.getElementById(id),canvas=$('scene');
const initial={yaw:Math.atan2(-.6,3.2),pitch:Math.atan2(-.6,Math.hypot(-.6,3.2)),distance:Math.hypot(-.6,-.6,3.2),scale:1,exposure:1,style:0,directional:true,crop:true,training:false};
const state={...initial},edit={...defaultEdit};// Embedded visibility belongs to the full host panel once its trusted message arrives.
// The local main-region observer remains the fallback for standalone playback.
let renderer,originalCloud,workingCloud,editDirty=true,frame=0,raf=0,auto=false,visible=true,parentVisible=true,hostVisibilityKnown=false,pageActive=true,previous=0,dirty=true,finalLoaded=false;
let representation='gpu',revision=0;
const nativeCanvas=$('rive-scene'),riveField=createRiveField(nativeCanvas,()=>{$('rive-export').disabled=false;nativeCaption();});
function nativeCaption(){if(representation!=='gpu')$('status').textContent=`Official Rive · ${Number(nativeCanvas.dataset.gaussians||0).toLocaleString()} selected Gaussians · ${Number(nativeCanvas.dataset.shapes||0).toLocaleString()} ellipse shapes`;}
function syncNative(){const active=representation!=='gpu'&&pageActive&&(hostVisibilityKnown||visible)&&parentVisible&&!document.hidden;riveField.setActive(active);if(!workingCloud)return;const width=state.training?400:Math.round(canvas.clientWidth),height=state.training?400:Math.round(canvas.clientHeight);riveField.update(workingCloud,state,{mode:representation,budget:Number($('rive-budget').value),width:Math.max(1,width),height:Math.max(1,height)});}
function setRepresentation(value){representation=value;$('representation').value=value;const native=value!=='gpu';canvas.style.visibility=native?'hidden':'';nativeCanvas.hidden=!native;for(const id of ['rive-budget-label','rive-export','rive-note'])$(id).hidden=!native;$('precision').hidden=native;document.querySelectorAll('[data-style]').forEach(b=>b.disabled=native);document.body.dataset.representation=value;syncNative();request();}
$('representation').onchange=()=>setRepresentation($('representation').value);
$('rive-budget').onchange=request;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function flushEdits(){if(!editDirty||!originalCloud)return;workingCloud=applyEdits(originalCloud,edit,workingCloud);renderer.updateCloud(workingCloud);workingCloud.revision=++revision;editDirty=false;document.body.dataset.edit=JSON.stringify(edit);$('edit-status').textContent=`${workingCloud.selected.toLocaleString()} splats in ${regionNames[edit.region].toLowerCase()} · ${workingCloud.remaining.toLocaleString()} retained before room crop`;}
const draw=()=>{if(!renderer||!pageActive||(!hostVisibilityKnown&&!visible)||!parentVisible||document.hidden)return;const t=performance.now();flushEdits();syncNative();if(representation!=='gpu'){nativeCaption();document.body.dataset.frames=String(++frame);document.body.dataset.yaw=String(state.yaw);document.body.dataset.drawMs=(performance.now()-t).toFixed(1);dirty=false;return;}const result=renderer.draw(state);document.body.dataset.frames=String(++frame);document.body.dataset.yaw=String(state.yaw);document.body.dataset.style=String(state.style);document.body.dataset.glerror=String(result.error);document.body.dataset.accumulation=result.floating?'float16':'display-range-fallback';document.body.dataset.camera=state.training?'capture-framing':'showcase';document.body.dataset.renderSize=`${result.renderWidth}x${result.renderHeight}`;$('status').textContent=`${result.count.toLocaleString()} splats · ${state.crop?'room crop':'complete field'} · ${state.training?'400² capture framing':Math.round(state.yaw*180/Math.PI)+'°'}`;$('precision').textContent=result.floating?'Floating accumulation · display clamp after blending':'Display-range fallback · this GPU cannot accumulate float colors';$('precision').classList.toggle('fallback',!result.floating);document.body.dataset.drawMs=(performance.now()-t).toFixed(1);dirty=false;};
function tick(now){raf=0;if(!pageActive||document.hidden||(!hostVisibilityKnown&&!visible)||!parentVisible)return;if(auto){state.yaw+=(previous?Math.min((now-previous)/1000,.05):0)*.12;dirty=true;}previous=now;if(dirty)draw();if(auto)raf=requestAnimationFrame(tick);}
function request(){dirty=true;if(pageActive&&!raf)raf=requestAnimationFrame(tick);}
function setAuto(value){auto=value;$('orbit').textContent=value?'Pause orbit':'Auto orbit';$('orbit').setAttribute('aria-pressed',String(value));previous=0;request();}
function reset(training=false){setAuto(false);Object.assign(state,initial,{training,crop:!training});$('scale').value='1';$('exposure').value='1';$('scale-value').value=$('exposure-value').value='1.00×';$('directional').checked=true;$('crop').checked=!training;$('training-camera').setAttribute('aria-pressed',String(training));setStyle(0);request();}
$('reset').onclick=()=>reset(false);
$('training-camera').onclick=()=>reset(true);
$('orbit').onclick=()=>setAuto(!auto);
function setStyle(style){state.style=style;document.querySelectorAll('[data-style]').forEach(b=>{const active=Number(b.dataset.style)===style;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});request();}
document.querySelectorAll('[data-style]').forEach(b=>b.onclick=()=>setStyle(Number(b.dataset.style)));
for(const key of ['exposure','scale'])$(key).oninput=()=>{state[key]=Number($(key).value);$(key+'-value').value=state[key].toFixed(2)+'×';request();};
$('directional').onchange=()=>{state.directional=$('directional').checked;request();};
$('crop').onchange=()=>{state.crop=$('crop').checked;request();};
let pointer=null;
for(const inputCanvas of [canvas,nativeCanvas]){
inputCanvas.onpointerdown=e=>{setAuto(false);pointer={x:e.clientX,y:e.clientY};inputCanvas.setPointerCapture(e.pointerId);};
inputCanvas.onpointermove=e=>{if(!pointer)return;state.yaw-=(e.clientX-pointer.x)*.004;state.pitch=Math.max(-1.3,Math.min(1.3,state.pitch+(e.clientY-pointer.y)*.004));pointer={x:e.clientX,y:e.clientY};request();};
inputCanvas.onpointerup=inputCanvas.onpointercancel=()=>{pointer=null;};
inputCanvas.addEventListener('wheel',e=>{e.preventDefault();state.distance=Math.max(1.8,Math.min(8,state.distance*Math.exp(e.deltaY*.001)));request();},{passive:false});
inputCanvas.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(e.key))return;e.preventDefault();setAuto(false);if(e.key==='ArrowLeft')state.yaw-=.08;if(e.key==='ArrowRight')state.yaw+=.08;if(e.key==='ArrowUp')state.pitch=Math.min(1.3,state.pitch+.06);if(e.key==='ArrowDown')state.pitch=Math.max(-1.3,state.pitch-.06);if(e.key==='+'||e.key==='=')state.distance=Math.max(1.8,state.distance*.9);if(e.key==='-')state.distance=Math.min(8,state.distance*1.1);request();};
}
new ResizeObserver(request).observe(document.querySelector('.stage'));
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;previous=0;syncNative();if(visible)request();}).observe(document.querySelector('main'));
document.addEventListener('visibilitychange',()=>{previous=0;syncNative();if(!document.hidden)request();});
window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin)return;if(e.data?.type==='portfolio-lab-visibility'){hostVisibilityKnown=true;parentVisible=e.data.visible!==false;previous=0;syncNative();if(parentVisible)request();}});
window.addEventListener('pagehide',event=>{pageActive=false;cancelAnimationFrame(raf);raf=0;previous=0;riveField.setActive(false);if(!event.persisted){riveField.dispose();renderer?.dispose();renderer=null;}});
window.addEventListener('pageshow',event=>{pageActive=true;if(event.persisted){previous=0;request();}});
reduced.addEventListener('change',()=>{if(reduced.matches)setAuto(false);});
async function load(final=false){
 setAuto(false);for(const id of ['detail','export-ply','save-look','load-look'])$(id).disabled=true;$('loading').hidden=false;$('loadbar').value=0;$('error').hidden=true;delete document.body.dataset.error;
 const asset=final?'glass-room-final.ply':'glass-room.ply',sizeLabel=final?'68.9':'7.2';
 $('loadtext').textContent=`Loading ${sizeLabel} MB of learned scene data`;
 try{
  const response=await fetch(asset);if(!response.ok)throw Error(`PLY resource: HTTP ${response.status}`);
  const total=Number(response.headers.get('Content-Length'))||(final?68859090:7213362),reader=response.body.getReader(),parts=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;parts.push(value);size+=value.length;$('loadbar').value=size/total;$('loadtext').textContent=`Loading trained field · ${(size/1e6).toFixed(1)} / ${(total/1e6).toFixed(1)} MB`;}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  $('loadtext').textContent='Projecting covariance and preparing the field…';
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const cloud=parsePly(bytes.buffer);const next=createSplatRenderer(canvas,cloud);renderer?.dispose();renderer=next;originalCloud=cloud;workingCloud=null;editDirty=true;finalLoaded=final;
  document.body.dataset.splats=String(cloud.count);document.body.dataset.asset=asset;$('count').textContent=cloud.count.toLocaleString();
  $('source-state').textContent=final?'Final exported field':'Compact checkpoint';$('source-note').textContent=final?'byte-identical native PLY':'step 5,000 · all original splats';
  $('download').href=asset;$('download').textContent=`↓ Real trained PLY · ${sizeLabel} MB`;
  $('detail').textContent=final?'Use compact field · 7.2 MB':'Larger experimental fit · 68.9 MB';
  $('loading').hidden=true;request();
  parent.postMessage({type:'portfolio-lab-preview-ready'},'*');
 }catch(error){$('loading').hidden=true;$('error').hidden=false;$('error').textContent=error.message;document.body.dataset.error=error.message;}
 finally{for(const id of ['detail','export-ply','save-look','load-look'])$(id).disabled=false;}
}
$('detail').onclick=()=>load(!finalLoaded);
const ranges=['shiftX','lift','size','tintAmount','opacity','slice','paint','paintAngle'];
function syncEditUI(){
 for(const key of Object.keys(defaultEdit)){const node=$('edit-'+key);if(typeof edit[key]==='boolean')node.checked=edit[key];else node.value=String(edit[key]);}
 for(const key of ranges)$('edit-'+key+'-value').value=key==='paintAngle'?Math.round(edit[key])+'°':Number(edit[key]).toFixed(2);
}
function changed(){editDirty=true;document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('active'));syncEditUI();request();}
for(const key of Object.keys(defaultEdit))$('edit-'+key).addEventListener('input',()=>{const node=$('edit-'+key);edit[key]=typeof defaultEdit[key]==='boolean'?node.checked:typeof defaultEdit[key]==='number'?Number(node.value):node.value;changed();});
const presets={original:{},amethyst:{tint:'#c081ff',tintAmount:.85,paint:.9,paintColor:'#ff9bd9',paintAngle:55},float:{shiftX:.35,lift:.58,size:.85,tint:'#90eaff',tintAmount:.8,paint:1.5,paintColor:'#65ddff',paintAngle:-45},section:{region:0,sliceAxis:3,slice:0.02,paint:.45,paintColor:'#e2b76a',paintAngle:70},etch:{region:0}};
document.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>{reset(false);Object.assign(edit,defaultEdit,presets[button.dataset.preset]);changed();if(button.dataset.preset==='etch')setStyle(2);button.classList.add('active');});
function downloadFile(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('rive-export').onclick=async()=>{const button=$('rive-export');button.disabled=true;setAuto(false);try{flushEdits();syncNative();const bytes=await riveField.snapshot();downloadFile(new Blob([bytes],{type:'application/octet-stream'}),'trained-field-ordinary-rive.riv');}catch(e){$('rive-status').textContent='Export unavailable: '+e.message;}finally{button.disabled=false;}};
$('export-ply').onclick=()=>{try{if(!originalCloud)throw Error('Wait for the Gaussian resource to finish loading');flushEdits();const result=editedPly(workingCloud,{crop:state.crop});downloadFile(new Blob([result.bytes],{type:'application/octet-stream'}),'rivx-edited-glass-room.ply');$('edit-status').textContent=`Exported ${result.count.toLocaleString()} edited Gaussians in native PLY format.`;}catch(e){$('edit-status').textContent=e.message;}};
$('save-look').onclick=()=>downloadFile(new Blob([JSON.stringify(editRecipe(edit,state,finalLoaded?'glass-room-final.ply':'glass-room.ply'),null,2)],{type:'application/json'}),'rivx-gaussian-look.json');
$('load-look').onclick=()=>$('recipe-file').click();
$('recipe-file').onchange=async()=>{try{const file=$('recipe-file').files[0];if(!file)return;const recipe=validateRecipe(JSON.parse(await file.text()));if((recipe.asset==='glass-room-final.ply')!==finalLoaded)await load(recipe.asset==='glass-room-final.ply');Object.assign(edit,recipe.edit);Object.assign(state,recipe.view);setAuto(false);changed();$('scale').value=state.scale;$('exposure').value=state.exposure;$('scale-value').value=state.scale.toFixed(2)+'×';$('exposure-value').value=state.exposure.toFixed(2)+'×';$('crop').checked=state.crop;$('directional').checked=state.directional;$('training-camera').setAttribute('aria-pressed',String(state.training));setStyle(state.style);$('edit-status').textContent='Look restored from file.';}catch(e){$('edit-status').textContent='Could not load look: '+e.message;}finally{$('recipe-file').value='';}};
syncEditUI();
const route=new URLSearchParams(location.search).get('representation');if(['layered','flat'].includes(route))setRepresentation(route);
load();
