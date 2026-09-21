import Rive from '../vector-replay/vendor/webgl2_advanced.js';
import {defaults,sampleScene,vectorize} from './field.js';
import {encodeBands} from './rive.js';
const $=id=>document.getElementById(id),state={...defaults};
let runtime,renderer,file,art,bytes,shapes=[],generation=0,painted=0,frames=0,busy=false,ready=false,disposed=false,pageActive=true,hostActive=true,hostKnown=false,visible=true,timer=0,drag=null;
const active=()=>!disposed&&pageActive&&hostActive&&(hostKnown||visible)&&!document.hidden;
function status(text){$('status').textContent=text;}
function draw(){if(!art||!active())return;const cv=$('vector'),w=Math.round(cv.clientWidth*Math.min(devicePixelRatio,2)),h=Math.round(w*.8);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}art.advance(0);renderer.clear();renderer.save();renderer.align(runtime.Fit.contain,runtime.Alignment.center,{minX:0,minY:0,maxX:w,maxY:h},art.bounds);art.draw(renderer);renderer.restore();renderer.flush();document.body.dataset.frames=++frames;}
async function rebuild(){
  clearTimeout(timer);timer=0;if(!ready||busy||!active())return;busy=true;const version=generation;
  try{
    const resolution=drag?Math.min(120,state.resolution):state.resolution,field=sampleScene(state,resolution,Math.round(resolution*.8)),ctx=$('reference').getContext('2d');
    $('reference').width=field.width;$('reference').height=field.height;const image=ctx.createImageData(field.width,field.height);for(let i=0;i<field.ids.length;i++){for(let c=0;c<3;c++)image.data[i*4+c]=field.ids[i]<0?[8,18,23][c]:field.rgb[i*3+c]*255;image.data[i*4+3]=255;}ctx.putImageData(image,0,0);
    const start=performance.now();shapes=vectorize(field,state.bands,state.smooth);const nextBytes=encodeBands(shapes,state.contours),next=await runtime.load(nextBytes,undefined,false);
    if(disposed||version!==generation){next?.delete();return;}if(!next)throw Error('Official Rive rejected the contour drawing');art?.delete();file?.delete();file=next;art=file.defaultArtboard();bytes=nextBytes;painted=version;draw();
    const paths=shapes.reduce((n,s)=>n+s.loops.length,0),vertices=shapes.reduce((n,s)=>n+s.loops.reduce((m,l)=>m+l.length,0),0);
    $('cost').textContent=`${shapes.length} filled groups · ${paths} closed contours · ${vertices.toLocaleString()} vertices · ${(bytes.length/1024).toFixed(0)} KB`;
    status(`Ready · ${resolution} × ${field.height} ${drag?'moving preview':'refined drawing'} · ${(performance.now()-start).toFixed(0)} ms extraction + import`);document.body.dataset.ready='true';document.body.dataset.generation=painted;document.body.dataset.paths=paths;document.body.dataset.bytes=bytes.length;$('export').disabled=false;
  }catch(error){status('Demo crashed · Reset to recover: '+error.message);document.body.dataset.error=error.message;console.error(error);}
  finally{busy=false;if(generation!==painted&&active()&&!document.body.dataset.error)timer=setTimeout(rebuild,0);}
}
function request(){generation++;status('Standby · sampling light and rebuilding contour paths…');$('export').disabled=true;if(active()&&!timer)timer=setTimeout(rebuild,drag?25:10);}
function activity(){if(!active()){clearTimeout(timer);timer=0;}else if(generation!==painted){if(!timer)timer=setTimeout(rebuild,0);}else draw();}
for(const id of ['lightX','lightZ','bands','radius','smooth','resolution']){
 $(id).addEventListener('input',()=>{state[id]=Number($(id).value);$(id+'-value').textContent=$(id).value;request();});
 $(id).addEventListener('pointerdown',()=>{drag={control:true};});
 for(const event of ['pointerup','pointercancel','change'])$(id).addEventListener(event,()=>{if(drag?.control){drag=null;request();}});
}
$('contours').addEventListener('change',()=>{state.contours=$('contours').checked;request();});
for(const cv of [$('reference'),$('vector')]){
 cv.addEventListener('pointerdown',e=>{drag={x:e.clientX,yaw:state.yaw};cv.setPointerCapture(e.pointerId);});
 cv.addEventListener('pointermove',e=>{if(!drag||drag.control)return;state.yaw=Math.max(-.42,Math.min(.42,drag.yaw-(e.clientX-drag.x)*.002));request();});
 for(const event of ['pointerup','pointercancel'])cv.addEventListener(event,()=>{if(drag){drag=null;request();}});
 cv.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();state.yaw=Math.max(-.42,Math.min(.42,state.yaw+(e.key==='ArrowLeft'?.035:-.035)));request();});
}
let downloads=0;$('export').onclick=()=>{if(!bytes||generation!==painted)return;const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=`isocurve-drawing${downloads?' ['+downloads+']':''}.riv`;downloads++;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('reset').onclick=()=>{Object.assign(state,defaults);for(const id of ['lightX','lightZ','bands','radius','smooth','resolution']){$(id).value=state[id];$(id+'-value').textContent=state[id];}$('contours').checked=false;delete document.body.dataset.error;request();};
new ResizeObserver(()=>draw()).observe($('vector'));
const observer=new IntersectionObserver(entries=>{const next=entries[0].isIntersecting;if(next===visible)return;visible=next;if(!hostKnown)activity();});observer.observe(document.querySelector('main'));
document.addEventListener('visibilitychange',activity);window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='portfolio-lab-visibility'){const next=!!e.data.visible;if(hostKnown&&hostActive===next)return;hostKnown=true;hostActive=next;activity();}});
window.addEventListener('pagehide',e=>{pageActive=false;activity();if(!e.persisted){disposed=true;observer.disconnect();art?.delete();file?.delete();renderer?.delete();}});window.addEventListener('pageshow',()=>{pageActive=true;activity();});
window.isoStudioState=()=>({state:{...state},generation,painted,frames,active:active(),ready,busy,groups:shapes.length,bytes:bytes?.length||0,vertices:shapes.flatMap(s=>s.loops).reduce((n,l)=>n+l.length,0)});
try{runtime=await Rive({locateFile:()=>new URL('../vector-replay/vendor/rive.wasm',import.meta.url).href});renderer=runtime.makeRenderer($('vector'));ready=true;request();if(parent!==window)parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);}catch(e){status('Demo crashed · reload to recover: '+e.message);console.error(e);}
