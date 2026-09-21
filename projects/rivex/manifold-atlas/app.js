import Rive from '../vector-replay/vendor/webgl2_advanced.js';
import {defaults,buildScene,projectShapes} from './geometry.js';
import {encodeDrawing} from './rive.js';
const $=id=>document.getElementById(id),canvas=$('view'),state={...defaults};
const initialMode=new URL(location.href).searchParams.get('mode');if(['caustic','planes','volume'].includes(initialMode))state.mode=initialMode;
let runtime,renderer,file,art,bytes,ready=false,busy=false,disposed=false,visible=true,hostKnown=false,hostActive=true,pageActive=true,generation=0,painted=-1,frames=0,timer=0,drag=null,stats={};
const active=()=>ready&&!disposed&&hostActive&&pageActive&&(hostKnown||visible)&&!document.hidden;
function draw(){if(!art||!active())return;const w=Math.max(1,Math.round(canvas.clientWidth*Math.min(devicePixelRatio,2))),h=Math.round(w*700/960);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}renderer.clear();renderer.save();renderer.align(runtime.Fit.contain,runtime.Alignment.center,{minX:0,minY:0,maxX:w,maxY:h},art.bounds);art.advance(0);art.draw(renderer);renderer.restore();renderer.flush();frames++;}
async function rebuild(){
 timer=0;if(!active()||busy)return;busy=true;const version=generation,start=performance.now();
 try{
  const scene=buildScene(state),polygons=projectShapes(scene,state),nextBytes=encodeDrawing(polygons),next=await runtime.load(nextBytes,undefined,false);
  if(disposed||version!==generation){next?.delete();return;}if(!next)throw Error('The official runtime rejected the drawing');
  art?.delete();file?.delete();file=next;art=file.defaultArtboard();bytes=nextBytes;painted=version;
  for(const name of ['family','equation','detail','metric'])$(name).textContent=scene.info[name];
  stats={polygons:polygons.length,bytes:bytes.length,buildMs:performance.now()-start,mode:state.mode};
  $('status').textContent=`Ready · ${polygons.length.toLocaleString()} Rive paths · ${(bytes.length/1024).toFixed(0)} KB · ${stats.buildMs.toFixed(0)} ms rebuild`;$('export').disabled=false;document.body.dataset.ready='true';draw();
 }catch(error){$('status').textContent='Demo crashed · reload to recover: '+error.message;document.body.dataset.error=error.message;console.error(error);}
 finally{busy=false;if(active()&&painted!==generation&&!document.body.dataset.error)timer=setTimeout(rebuild,0);}
}
function request(){generation++;$('status').textContent='Standby · rebuilding the Rive drawing…';$('export').disabled=true;if(!timer&&active())timer=setTimeout(rebuild,drag?35:12);}
function mode(){for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode));for(const group of document.querySelectorAll('[data-controls]'))group.hidden=!group.dataset.controls.split(' ').includes(state.mode);$('slice-label').textContent=state.mode==='volume'?'Inspect stored plane':'Inspection plane';$('slice-note').textContent=state.mode==='volume'?'Snaps to the spatial slices. More planes give finer inspection steps.':'';request();}
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{state.mode=button.dataset.mode;mode();};
for(const id of ['ior','aperture','planes','radius','sweep','slice'])$(id).oninput=()=>{state[id]=Number($(id).value);$(id+'-value').textContent=state[id].toFixed(id==='planes'?0:2);request();};
for(const id of ['rays','footprint','dispersion','luminous'])$(id).onchange=()=>{state[id]=$(id).checked;request();};
canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,yaw:state.yaw,pitch:state.pitch};canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{if(!drag)return;state.yaw=drag.yaw+(e.clientX-drag.x)*.005;state.pitch=Math.max(-.65,Math.min(1.05,drag.pitch+(e.clientY-drag.y)*.004));request();};
canvas.onpointerup=canvas.onpointercancel=()=>{if(drag){drag=null;request();}};
canvas.onkeydown=e=>{const d={ArrowLeft:[-.08,0],ArrowRight:[.08,0],ArrowUp:[0,.06],ArrowDown:[0,-.06]}[e.key];if(d){e.preventDefault();state.yaw+=d[0];state.pitch=Math.max(-.65,Math.min(1.05,state.pitch+d[1]));request();}};
$('front').onclick=()=>{state.yaw=0;state.pitch=0;request();};$('reset').onclick=()=>{state.yaw=defaults.yaw;state.pitch=defaults.pitch;request();};
let downloads=0;$('export').onclick=()=>{if(!bytes||generation!==painted)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));a.href=url;a.download=`photon-${state.mode}${downloads?' ['+downloads+']':''}.riv`;downloads++;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function activity(){if(!active()){clearTimeout(timer);timer=0;}else if(painted!==generation){if(!timer)timer=setTimeout(rebuild,0);}else draw();}
const resize=new ResizeObserver(draw);resize.observe(canvas);const intersection=new IntersectionObserver(entries=>{const next=entries[0].isIntersecting;if(next===visible)return;visible=next;if(!hostKnown)activity();});intersection.observe(document.querySelector('main'));
document.addEventListener('visibilitychange',activity);window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='portfolio-lab-visibility'){const next=!!e.data.visible;if(hostKnown&&hostActive===next)return;hostKnown=true;hostActive=next;activity();}});
window.addEventListener('pagehide',e=>{pageActive=false;activity();if(!e.persisted){disposed=true;resize.disconnect();intersection.disconnect();art?.delete();file?.delete();renderer?.delete();}});window.addEventListener('pageshow',()=>{pageActive=true;activity();});
window.manifoldAtlasState=()=>({ready,active:active(),busy,generation,painted,frames,state:{...state},stats:{...stats}});
mode();try{runtime=await Rive({locateFile:()=>new URL('../vector-replay/vendor/rive.wasm',import.meta.url).href});renderer=runtime.makeRenderer(canvas);ready=true;request();if(parent!==window)parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);}catch(error){$('status').textContent='Demo crashed · reload to recover: '+error.message;console.error(error);}
