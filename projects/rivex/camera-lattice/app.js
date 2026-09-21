import Rive from '../vector-replay/vendor/webgl2_advanced.js';
const $=id=>document.getElementById(id),canvas=$('view');
let runtime,renderer,file,art,animation,receipt,ready=false,raf=0,hostActive=true,visible=true,dirty=true,frames=0,x=4,y=2,drag=null;
const active=()=>ready&&hostActive&&visible&&!document.hidden;
function wake(){dirty=true;if(active()&&!raf)raf=runtime.requestAnimationFrame(draw);}
function draw(){
 raf=0;if(!active()||!dirty)return;
 const frame=y*receipt.columns+x;animation.time=frame;animation.apply(1);art.advance(0);
 renderer.clear();renderer.save();renderer.align(runtime.Fit.contain,runtime.Alignment.center,{minX:0,minY:0,maxX:canvas.width,maxY:canvas.height},{minX:0,minY:0,maxX:640,maxY:480});art.draw(renderer);renderer.restore();renderer.flush();
 $('yaw').value=x;$('pitch').value=y;$('yaw-value').textContent=receipt.yaw[x]+'°';$('pitch-value').textContent=receipt.pitch[y]+'°';
 $('lattice').querySelectorAll('button').forEach((button,index)=>{const pressed=String(index===frame);if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);});
 $('status').textContent=`Stored view ${frame+1} / 45 · no new scene evaluation`;
 document.body.dataset.frame=frame;document.body.dataset.yaw=x;document.body.dataset.pitch=y;document.body.dataset.draws=++frames;dirty=false;
}
function choose(a,b){x=Math.max(0,Math.min(8,Math.round(a)));y=Math.max(0,Math.min(4,Math.round(b)));wake();}
function resize(){const rect=canvas.getBoundingClientRect(),scale=Math.min(devicePixelRatio,1.5);canvas.width=Math.round(rect.width*scale);canvas.height=Math.round(rect.height*scale);wake();}
$('yaw').oninput=()=>choose(Number($('yaw').value),y);$('pitch').oninput=()=>choose(x,Number($('pitch').value));$('reset').onclick=()=>choose(4,2);
canvas.onpointerdown=event=>{drag={id:event.pointerId,left:event.clientX,top:event.clientY,x,y};canvas.setPointerCapture(event.pointerId);canvas.focus();};
canvas.onpointermove=event=>{if(!drag)return;const rect=canvas.getBoundingClientRect();choose(drag.x-(event.clientX-drag.left)/rect.width*10,drag.y+(event.clientY-drag.top)/rect.height*6);};
canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
canvas.onkeydown=event=>{const offset={ArrowLeft:[1,0],ArrowRight:[-1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(offset){event.preventDefault();choose(x+offset[0],y+offset[1]);}};
function activity(){if(!active()&&raf){runtime.cancelAnimationFrame(raf);raf=0;}else wake();}
document.addEventListener('visibilitychange',activity);
window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='portfolio-lab-visibility'){hostActive=!!event.data.visible;activity();}});
const observer=new IntersectionObserver(entries=>{const r=entries[0].boundingClientRect;visible=r.bottom>0&&r.top<innerHeight;activity();},{rootMargin:'0px 10000px',threshold:0});observer.observe(document.querySelector('main'));
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);
window.addEventListener('pagehide',event=>{hostActive=false;activity();if(!event.persisted){observer.disconnect();resizeObserver.disconnect();animation?.delete();art?.delete();file?.delete();renderer?.delete();}});
window.addEventListener('pageshow',()=>{hostActive=true;activity();});
try{
 const [meta,bytes]=await Promise.all([fetch('receipt.json').then(r=>r.json()),fetch('camera-lattice.riv').then(r=>r.arrayBuffer())]);receipt=meta;
 runtime=await Rive({locateFile:()=>new URL('../vector-replay/vendor/rive.wasm',import.meta.url).href});renderer=runtime.makeRenderer(canvas);file=await runtime.load(new Uint8Array(bytes));art=file.defaultArtboard();animation=new runtime.LinearAnimationInstance(art.animationByIndex(0),art);
 for(const pose of receipt.frames){const button=document.createElement('button');button.type='button';button.textContent=pose.index+1;button.setAttribute('aria-label',`Camera ${pose.yaw} degrees azimuth, ${pose.pitch} degrees elevation`);button.setAttribute('aria-pressed','false');button.onclick=()=>choose(pose.column,pose.row);$('lattice').append(button);}
 $('size').textContent=`${(bytes.byteLength/1048576).toFixed(2)} MiB file · 8.44 MiB decoded images · 256 × 192 per view`;
 ready=true;document.body.dataset.ready='true';document.body.dataset.rive='official';resize();
 if(parent!==window)parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);
}catch(error){$('error').hidden=false;$('error').textContent='Demo crashed — restart to recover: '+error.message;console.error(error);}
