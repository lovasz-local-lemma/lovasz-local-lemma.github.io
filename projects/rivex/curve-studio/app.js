import Rive from '../vector-replay/vendor/webgl2_advanced.js';
import {sample,approximationError} from './curves.js';
import {writeRive} from './rive-drawing.js';
const $=id=>document.getElementById(id),canvas=$('view'),capacity=2048;
const initial=[[115,365],[260,170],[420,438],[576,211],[730,426],[910,256]],ART={minX:0,minY:0,maxX:1080,maxY:640};
// Embedded visibility belongs to the full host panel once its trusted message arrives.
// The local main-region observer remains the fallback for standalone playback.
let points=initial.map(p=>p.slice()),fine=[],coarse=[],lines=[],error=0,runtime,renderer,file,art,nodes=[],used=new Set(),ready=false,dirty=true,phase=0,yaw=.28,playing=false,visible=true,hostPaused=false,hostVisibilityKnown=false,pageActive=true,last=0,raf=0,drag=null,selected=2,frames=0;
function evaluate(){fine=sample(points,$('basis').value,48);coarse=sample(points,$('basis').value,+$('samples').value);error=approximationError(fine,coarse);dirty=true;$('sample-value').textContent=$('samples').value;wake();}
function path(list,width,color){for(let i=1;i<list.length;i++)lines.push([list[i-1],list[i],width,color]);}
function geometry(){
 lines=[];const loom=$('scene').value==='loom';
 if(!loom){
  path(points,.8,3);path(fine,3,0);if($('approx').checked)path(coarse,1.3,2);
  points.forEach((p,j)=>{const circle=Array.from({length:21},(_,i)=>[p[0]+Math.cos(i/20*Math.PI*2)*(j===selected?9:6),p[1]+Math.sin(i/20*Math.PI*2)*(j===selected?9:6)]);path(circle,1.7,1);});
 }else{
  const source=sample(points,$('basis').value,12),c=Math.cos(yaw),s=Math.sin(yaw);
  for(let k=0;k<24;k++){
   const a=k/24*Math.PI*2,curve=source.map((p,i)=>{const t=i/(source.length-1),radius=85+(p[1]-320)*.22,x=(p[0]-540)*.68,z=Math.sin(a+t*4+phase)*radius,y=Math.cos(a+t*4+phase)*radius;return [540+x*c+z*s,320+y+(z*c-x*s)*.32];});path(curve,1.1+(k%3)*.25,k%3);
  }
 }
 return loom;
}
function render(){
 const loom=geometry(),counts=[0,0,0,0],next=new Set();let omitted=0;
 for(const [p,q,width,color]of lines){const index=counts[color]++*4+color;if(index>=capacity){omitted++;continue;}const n=nodes[index],dx=q[0]-p[0],dy=q[1]-p[1];n.x=p[0];n.y=p[1];n.rotation=Math.atan2(dy,dx);n.scaleX=Math.hypot(dx,dy);n.scaleY=width;next.add(index);}
 for(const index of used)if(!next.has(index)){nodes[index].scaleX=0;nodes[index].scaleY=0;}used=next;
 renderer.clear();renderer.save();renderer.align(runtime.Fit.contain,runtime.Alignment.center,{minX:0,minY:0,maxX:canvas.width,maxY:canvas.height},ART);art.advance(0);art.draw(renderer);renderer.restore();renderer.flush();frames++;dirty=false;
 $('badge').textContent='Official Rive · '+used.size+' ordinary vector paths';$('gesture').textContent=loom?'Drag to orbit · animate the strand field':'Drag a point · arrow keys nudge the selection';
 $('status').textContent=`${loom?'Spatial strand illustration.':'Gold: dense sampled reference. Coral: coarse approximation.'} Maximum sampled distance to approximation: ${error.toFixed(2)} artboard px. ${omitted?omitted+' segments exceed the display pool.':'All current segments fit the drawing pool.'}`;
 canvas.dataset.frames=frames;canvas.dataset.renderer='official-rive';
}
function wake(){if(ready&&!raf&&!hostPaused&&pageActive&&(hostVisibilityKnown||visible)&&!document.hidden)raf=runtime.requestAnimationFrame(tick);}
function tick(now){raf=0;if(hostPaused||!pageActive||(!hostVisibilityKnown&&!visible)||document.hidden){last=0;return;}const dt=last?Math.min(.04,(now-last)/1000):0;last=now;if(playing&&$('scene').value==='loom'){phase+=dt*.45;dirty=true;}if(dirty)render();if(playing&&$('scene').value==='loom')wake();}
function size(){const w=Math.max(1,Math.round(canvas.clientWidth*Math.min(devicePixelRatio,2))),h=Math.round(w*640/1080);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;dirty=true;}wake();}
function point(e){const b=canvas.getBoundingClientRect();return[(e.clientX-b.left)*1080/b.width,(e.clientY-b.top)*640/b.height];}
canvas.onpointerdown=e=>{const p=point(e);if($('scene').value==='loom')drag={orbit:p[0]};else{const i=points.findIndex(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<25);if(i<0)return;selected=i;drag={index:i};dirty=true;wake();}canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{if(!drag)return;const p=point(e);if(drag.index!==undefined){points[drag.index]=[Math.max(40,Math.min(1040,p[0])),Math.max(70,Math.min(570,p[1]))];evaluate();}else{yaw+=(p[0]-drag.orbit)*.006;drag.orbit=p[0];dirty=true;wake();}};
canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
canvas.onkeydown=e=>{const d={ArrowLeft:[-5,0],ArrowRight:[5,0],ArrowUp:[0,-5],ArrowDown:[0,5]}[e.key];if(!d)return;e.preventDefault();points[selected]=points[selected].map((v,i)=>Math.max(i?70:40,Math.min(i?570:1040,v+d[i])));evaluate();};
for(const id of ['basis','samples','approx','scene'])$(id).oninput=e=>{evaluate();};
$('reset').onclick=()=>{points=initial.map(p=>p.slice());phase=0;yaw=.28;evaluate();};
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Hold strands':'Animate strands';last=0;wake();};
function download(data,name,type){
 let count=download.counts?.[name]||0;try{const key='curve-atelier-export-'+name;count=Number(localStorage.getItem(key)||0);localStorage.setItem(key,String(count+1));}catch{download.counts??={};download.counts[name]=count+1;}
 const suffix=count?` [${count}]`:'',at=name.lastIndexOf('.');const filename=at<0?name+suffix:name.slice(0,at)+suffix+name.slice(at);
 const a=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type}));a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').onclick=()=>{if(!ready)return;geometry();download(writeRive(lines),'curve-atelier-drawing.riv','application/octet-stream');};
$('retain').onclick=()=>download(JSON.stringify({format:'rivx-curve-study-1',basis:$('basis').value,points,sampling:+$('samples').value,scene:$('scene').value,yaw,phase},null,2),'curve-atelier-construction.json','application/json');
new ResizeObserver(size).observe(canvas);new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;last=0;wake();}).observe(document.querySelector('main'));document.addEventListener('visibilitychange',()=>{last=0;wake();});
window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='portfolio-lab-visibility'){hostVisibilityKnown=true;hostPaused=!e.data.visible;last=0;wake();}});
window.addEventListener('pagehide',e=>{pageActive=false;if(raf){runtime?.cancelAnimationFrame(raf);raf=0;}if(!e.persisted){ready=false;art?.delete();file?.delete();renderer?.delete();}});window.addEventListener('pageshow',()=>{pageActive=true;last=0;wake();});
window.curveStudioState=()=>({ready,frames,error,used:used.size,points:points.map(p=>p.slice()),basis:$('basis').value,scene:$('scene').value,phase,yaw});
try{runtime=await Rive({locateFile:()=>new URL('../vector-replay/vendor/rive.wasm',import.meta.url).href});renderer=runtime.makeRenderer(canvas);file=await runtime.load(writeRive(Array.from({length:capacity},(_,i)=>[null,null,1,i%4]),true));art=file.defaultArtboard();nodes=Array.from({length:capacity},(_,i)=>art.node('line'+i));for(const n of nodes){n.scaleX=0;n.scaleY=0;}ready=true;$('export').disabled=false;size();evaluate();if(parent!==window)parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);}catch(e){$('status').textContent='Demo failed · reload to recover: '+e.message;console.error(e);}
