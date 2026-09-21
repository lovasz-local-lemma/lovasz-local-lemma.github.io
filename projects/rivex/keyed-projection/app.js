import * as THREE from 'three';
import Rive from '../vector-replay/vendor/webgl2_advanced.js';
import {world,project} from './projection.js';
import {makeGlassTracks} from './glass-tracks.js';
import {makeGlassStudy} from './glass-study.js';
const $=id=>document.getElementById(id),meta=await(await fetch('projection-rich.json')).json(),npr=await(await fetch('projection-npr.json')).json();
const extracted=await(await fetch('glass-breakdown.json')).json();
let inspector,glassStudy;
let runtime,riveRenderer,file,art,animation,selectedNode,bytes,ready=false,raf=0,last=0,frame=20,dirty=true,visible=true,hostPaused=false,draws=0;
let drawing='baked',activeMeta=meta,loadTicket=0;
let playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
const enabled={circle:true,receiver:true,sticker:true,glass:true},layerAnimations={};let track='cube';
const reference=new THREE.WebGLRenderer({canvas:$('reference'),antialias:true,preserveDrawingBuffer:true});
reference.setPixelRatio(Math.min(devicePixelRatio,1.5));reference.setClearColor(0x0b171e);reference.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(41,1,.1,60);camera.position.set(8.6,6.4,11.8);camera.lookAt(0,.15,1.9);
const makeLines=(count,color,opacity=1)=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*6),3));const mesh=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity}));mesh.frustumCulled=false;scene.add(mesh);return mesh;};
const cube=makeLines(12,0x82d4ce),projected=makeLines(12,0xe2c58b,.6),ray=makeLines(1,0xf7c779),frustum=makeLines(8,0x507c84,.45);
const grid=new THREE.GridHelper(9,18,0x345a64,0x1a333d);grid.position.y=-1.7;grid.position.z=1.9;scene.add(grid);
const axes=new THREE.AxesHelper(1.4);axes.position.set(-2.1,-1.65,0);scene.add(axes);
const imageZ=2,d=meta.cameraDistance-imageZ,halfW=meta.width/meta.focal*d*.5,halfH=meta.height/meta.focal*d*.5;
const plane=new THREE.Mesh(new THREE.PlaneGeometry(2*halfW,2*halfH),new THREE.MeshBasicMaterial({color:0x64909a,transparent:true,opacity:.1,side:THREE.DoubleSide,depthWrite:false}));plane.position.z=imageZ;scene.add(plane);
const corners=[[-halfW,-halfH,imageZ],[halfW,-halfH,imageZ],[halfW,halfH,imageZ],[-halfW,halfH,imageZ]],cam=[0,0,meta.cameraDistance];
const fg=frustum.geometry.attributes.position.array;for(let j=0;j<4;j++){fg.set([...cam,...corners[j]],j*6);fg.set([...corners[j],...corners[(j+1)%4]],(j+4)*6);}frustum.geometry.attributes.position.needsUpdate=true;
const camBody=new THREE.Mesh(new THREE.BoxGeometry(.38,.28,.4),new THREE.MeshBasicMaterial({color:0x9dacb1,wireframe:true}));camBody.position.set(0,0,meta.cameraDistance+.16);scene.add(camBody);
function sphere(radius,color){const m=new THREE.Mesh(new THREE.SphereGeometry(radius,16,12),new THREE.MeshBasicMaterial({color}));scene.add(m);return m;}
const selected=sphere(.075,0xffd387),projectedDot=sphere(.06,0xffd387);
const ring=makeLines(meta.ringPoints.length,0xe8a8f2),ringProjection=makeLines(meta.ringPoints.length,0xe8a8f2,.5);
const content=new THREE.Group();scene.add(content);
const floorTexture=new THREE.TextureLoader().load('receiver-bake.png',()=>invalidate());floorTexture.colorSpace=THREE.SRGBColorSpace;
const floorMesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:floorTexture,side:THREE.DoubleSide}));floorMesh.rotation.x=-Math.PI/2;floorMesh.position.y=-1;content.add(floorMesh);
const glassProxy=new THREE.Mesh(new THREE.SphereGeometry(meta.sphere.radius,24,16),new THREE.MeshBasicMaterial({color:0x9fdcd9,transparent:true,opacity:.2,depthWrite:false}));glassProxy.position.fromArray(meta.sphere.center);content.add(glassProxy);
const glassWire=new THREE.Mesh(new THREE.SphereGeometry(meta.sphere.radius,16,8),new THREE.MeshBasicMaterial({color:0x83b4b5,wireframe:true,transparent:true,opacity:.3}));glassWire.position.copy(glassProxy.position);content.add(glassWire);
const stickerProxy=new THREE.Mesh(new THREE.RingGeometry(.16,.42,40),new THREE.MeshBasicMaterial({color:0x74ddd7,side:THREE.DoubleSide}));stickerProxy.position.set(.03,.23,-.97);content.add(stickerProxy);
const svgNS='http://www.w3.org/2000/svg',plots=[];
function svgElement(type,attrs){const el=document.createElementNS(svgNS,type);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;}
function trackData(){
 if(drawing!=='baked'&&track==='glass')return {keys:activeMeta.sphereTransformKeys,max:[meta.width,meta.height],labels:['Sphere contour center x','Sphere contour center y'],unit:' px',note:'The glass photograph is replaced by an ordinary Rive ellipse group. Its center, two axes and rotation have 60 fps keys; nested fills or engraved paths move with that group. These two charts show the group’s actual x/y keys.'};
 if(drawing==='engraving'&&track==='sticker')return {keys:meta.stickerColors.map(()=>[234,165]),max:[255,255],labels:['Ink red channel','Ink blue channel'],unit:' /255',note:'The projected foil curves are preserved, with one fixed ordinary Rive ink paint. Flat curves are expected: no angle-dependent color or shader is needed by this drawing style.'};
 if(track==='circle')return {keys:meta.circleKeys,max:[meta.width,meta.height],labels:['Contour point x','Contour point y'],unit:' px',note:'A white marker follows one of 48 keyed contour points. Every point is projected from the same rotating 3D circle; the ellipse changes shape, not just position.'};
 if(track==='receiver')return {keys:meta.receiverKeys,max:[meta.width,meta.height],labels:[drawing==='baked'?'Texture mesh corner x':'Receiver outline corner x',drawing==='baked'?'Texture mesh corner y':'Receiver outline corner y'],unit:' px',note:drawing==='baked'?'These are the actual x/y keys of a corner in the textured receiver’s ordinary Rive image mesh. The baked texture stays fixed in object space.':'The same projected receiver corner is now an ordinary 2D path vertex. Its drawing uses fills, hatch strokes and a graphic caustic accent; no texture or new light solve is involved.'};
 if(track==='sticker')return {keys:meta.stickerColors.map(c=>[(c>>>16)&255,c&255]),max:[255,255],labels:['Authored red channel','Authored blue channel'],unit:' /255',note:'A single ordinary Rive color track stores ARGB values. These charts split its red and blue channels for inspection; the angular hue cycle is intentionally stylized.'};
 if(track==='glass')return {keys:meta.glassVisibility.map((v,f)=>[v,f===240?0:Math.floor(f)]),max:[1,239],labels:['Image 0 opacity · held keys','Displayed image index · derived'],unit:'',hold:true,note:'Glass image 0 is visible for frame 0, and again at the loop endpoint. The right chart is the selected pose index derived from the 240 separate opacity tracks; it is not an extra authored Rive property.'};
 return {keys:meta.selectedKeys,max:[meta.width,meta.height],labels:['Projected x','Projected y'],unit:' px',note:'Dots are authored keys. Click either chart to scrub; the gold cube vertex is the same one in both views.'};
}
function makePlot(axis){
 const info=trackData(),svg=$(axis?'y-curve':'x-curve'),max=info.max[axis],color=axis?'#84d5d4':'#ecc482';svg.replaceChildren();
 const xy=(f,v)=>[30+f/meta.durationFrames*580,150-v/max*130];
 for(let i=0;i<=4;i++){const x=30+i*145;svg.append(svgElement('line',{x1:x,y1:20,x2:x,y2:150,stroke:'#29434d','stroke-width':.6}));const t=svgElement('text',{x,y:171,'text-anchor':'middle'});t.textContent=i+'s';svg.append(t);}
 for(const v of [0,max/2,max]){const y=xy(0,v)[1];svg.append(svgElement('line',{x1:30,y1:y,x2:610,y2:y,stroke:'#29434d','stroke-width':.6}));const t=svgElement('text',{x:25,y:y+3,'text-anchor':'end'});t.textContent=v;svg.append(t);}
 const data=info.keys;const points=[];data.forEach((p,f)=>{if(info.hold&&f)points.push(xy(f,data[f-1][axis]));points.push(xy(f,p[axis]));});
 const line=svgElement('polyline',{class:'track',stroke:color,points:points.map(p=>p.join(',')).join(' ')});svg.append(line);
 data.forEach((p,f)=>{const [cx,cy]=xy(f,p[axis]);svg.append(svgElement('circle',{cx,cy,r:1.55,fill:color,class:'key'}));});
 const cursor=svgElement('line',{class:'cursor',x1:0,y1:12,x2:0,y2:153}),dot=svgElement('circle',{class:'playhead',r:4.2});svg.append(cursor,dot);plots.push({axis,xy,cursor,dot});
 const scrub=e=>{const b=svg.getBoundingClientRect();seek(Math.round(Math.max(0,Math.min(meta.durationFrames,((e.clientX-b.left)/b.width*640-30)/580*meta.durationFrames))));};
 let drag=false;svg.onpointerdown=e=>{drag=true;svg.setPointerCapture(e.pointerId);scrub(e);};svg.onpointermove=e=>{if(drag)scrub(e);};svg.onpointerup=svg.onpointercancel=()=>drag=false;
 svg.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();seek(Math.max(0,Math.min(meta.durationFrames,Math.round(frame)+(e.key==='ArrowRight'?1:-1))));}};
}
function rebuildPlots(){plots.length=0;const info=trackData();$('x-label').textContent=info.labels[0];$('y-label').textContent=info.labels[1];$('track-note').textContent=info.note;makePlot(0);makePlot(1);invalidate();}
rebuildPlots();
function referenceView(){
 const points=meta.vertices.map(v=>world(v,frame,meta)),onPlane=points.map(p=>[p[0]*d/(meta.cameraDistance-p[2]),p[1]*d/(meta.cameraDistance-p[2]),imageZ]);
 for(const [mesh,ps]of [[cube,points],[projected,onPlane]]){const arr=mesh.geometry.attributes.position.array;meta.edges.forEach(([a,b],i)=>arr.set([...ps[a],...ps[b]],i*6));mesh.geometry.attributes.position.needsUpdate=true;}
 const circlePoints=meta.ringPoints.map(v=>world(v,frame,meta)),circlePlane=circlePoints.map(p=>[p[0]*d/(meta.cameraDistance-p[2]),p[1]*d/(meta.cameraDistance-p[2]),imageZ]);
 for(const [mesh,ps]of [[ring,circlePoints],[ringProjection,circlePlane]]){mesh.visible=enabled.circle;const arr=mesh.geometry.attributes.position.array;ps.forEach((p,i)=>arr.set([...p,...ps[(i+1)%ps.length]],i*6));mesh.geometry.attributes.position.needsUpdate=true;}
 content.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeRotationX(meta.pitch).multiply(new THREE.Matrix4().makeRotationY(frame/meta.durationFrames*Math.PI*2)));
 floorMesh.visible=enabled.receiver;glassProxy.visible=glassWire.visible=enabled.glass;stickerProxy.visible=enabled.sticker;stickerProxy.material.color.setHSL((.5+frame/meta.durationFrames)%1,.7,.6);
 ray.geometry.attributes.position.array.set([...cam,...points[0]]);ray.geometry.attributes.position.needsUpdate=true;selected.position.set(...points[0]);projectedDot.position.set(...onPlane[0]);reference.render(scene,camera);
}
function draw(){
 if(!ready)return;
 animation.time=frame/meta.fps;animation.apply(1);for(const [name,control]of Object.entries(layerAnimations)){control.time=enabled[name]?0:1;control.apply(1);}art.advance(0);
 riveRenderer.clear();riveRenderer.save();riveRenderer.align(runtime.Fit.contain,runtime.Alignment.center,{minX:0,minY:0,maxX:$('rive').width,maxY:$('rive').height},{minX:0,minY:0,maxX:meta.width,maxY:meta.height});art.draw(riveRenderer);riveRenderer.restore();riveRenderer.flush();
 referenceView();inspector?.draw(frame,drawing,activeMeta,enabled.glass,art);glassStudy?.draw(frame);
 const cubeValues=[selectedNode.x,selectedNode.y],info=trackData();let values;
 if(track==='cube')values=cubeValues;else if(track==='circle'){const node=art.node('circlePoint');values=[node.x,node.y];}else if(track==='glass'&&drawing!=='baked'){const node=art.node('Projected sphere contour');values=[node.x,node.y];}else{const f=Math.min(meta.durationFrames,Math.floor(frame)),g=Math.min(f+1,meta.durationFrames),t=info.hold?0:frame-f;values=info.keys[f].map((v,i)=>v+(info.keys[g][i]-v)*t);}
 for(const p of plots){const [cx,cy]=p.xy(frame,values[p.axis]);p.cursor.setAttribute('x1',cx);p.cursor.setAttribute('x2',cx);p.dot.setAttribute('cx',cx);p.dot.setAttribute('cy',cy);}
 $('x-value').textContent=values[0].toFixed(info.hold?0:2)+info.unit;$('y-value').textContent=values[1].toFixed(info.hold?0:2)+info.unit;$('frame').value=Math.round(frame);$('frame-value').textContent=`Frame ${Math.round(frame)} · ${(frame/meta.durationFrames*360).toFixed(1)}°`;
 document.body.dataset.frame=frame;document.body.dataset.nodeX=cubeValues[0];document.body.dataset.nodeY=cubeValues[1];document.body.dataset.trackX=values[0];document.body.dataset.trackY=values[1];document.body.dataset.draws=++draws;dirty=false;
}
function wake(){if(ready&&!raf&&visible&&!hostPaused&&!document.hidden)raf=runtime.requestAnimationFrame(tick);}
function invalidate(){dirty=true;wake();}
function tick(now){raf=0;if(!visible||hostPaused||document.hidden){last=0;return;}const dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(playing){frame=(frame+dt*meta.fps)%meta.durationFrames;dirty=true;}if(dirty)draw();if(playing)wake();}
function seek(value){frame=value;playing=false;$('play').textContent='Play';last=0;invalidate();}
function resize(){for(const id of ['reference','rive']){const rect=$(id).getBoundingClientRect();if(id==='reference'){reference.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}else{$(id).width=Math.round(rect.width*Math.min(devicePixelRatio,1.5));$(id).height=Math.round(rect.height*Math.min(devicePixelRatio,1.5));}}invalidate();}
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play';last=0;invalidate();};$('frame').oninput=()=>seek(Number($('frame').value));
function exportedBytes(){const copy=bytes.slice(),view=new DataView(copy.buffer);for(const [name,layer]of Object.entries(activeMeta.layers))view.setFloat32(layer.opacityOffset,enabled[name]?1:0,true);return copy;}
function download(blob,extension){let count=0;const name='keyed-'+(drawing==='baked'?'projection':drawing);try{const key=name+'-export-'+extension;count=Number(localStorage.getItem(key)||0);localStorage.setItem(key,String(count+1));}catch{}const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name+(count?` [${count}]`:'')+'.'+extension;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
$('export').onclick=()=>download(new Blob([exportedBytes()],{type:'application/octet-stream'}),'riv');
function base64(buffer){const array=new Uint8Array(buffer);let text='';for(let i=0;i<array.length;i+=32768)text+=String.fromCharCode(...array.subarray(i,i+32768));return btoa(text);}
$('export-html').onclick=async()=>{
 const button=$('export-html');button.disabled=true;button.textContent='Packaging runtime…';
 try{
  const [js,wasm,license]=await Promise.all(['webgl2_advanced.js','rive.wasm','LICENSE'].map(async name=>{const r=await fetch('../vector-replay/vendor/'+name);if(!r.ok)throw Error('Runtime resource unavailable');return r.arrayBuffer();}));
  const html=standaloneHTML(base64(js),base64(wasm),base64(exportedBytes()),new TextDecoder().decode(license));download(new Blob([html],{type:'text/html'}),'html');
 }catch(e){$('error').hidden=false;$('error').textContent='Could not package the standalone viewer: '+e.message;}
 finally{button.disabled=false;button.textContent='Download standalone HTML';}
};
function setLayers(){
 for(const name of Object.keys(enabled)){enabled[name]=$('layer-'+name).checked;const option=$('track').querySelector(`[value="${name}"]`);option.hidden=!enabled[name];option.disabled=!enabled[name];}
 if(track!=='cube'&&!enabled[track]){$('track').value='cube';track='cube';rebuildPlots();}
 $('layer-tracks').replaceChildren(...Object.entries(enabled).filter(([,on])=>on).map(([name])=>{const b=document.createElement('button');b.textContent={circle:'Contour · 60 fps vertex keys',receiver:drawing==='baked'?'Receiver · 60 fps mesh keys':'Receiver · keyed paths + hatch strokes',sticker:drawing==='engraving'?'Sticker · monochrome ink curves':'Sticker · geometry + color',glass:drawing==='baked'?'Glass · 240 image poses · 60 fps':'Sphere · keyed ellipse + vector drawing'}[name];b.onclick=()=>{$('track').value=name;track=name;rebuildPlots();};return b;}));
 $('render-caption').textContent=drawing!=='baked'?activeMeta.label+' · ordinary Rive fills and strokes · zero images / GPU Canvas':enabled.glass?'Ordinary vectors + image mesh · glass appearance sampled at 60 fps':enabled.receiver?'Ordinary vector animation + one embedded receiver texture':'Ordinary 2D vector animation · no live shading';
 $('track').querySelector('[value="glass"]').textContent=drawing==='baked'?'Glass image 0 · visibility / pose':'Sphere contour group · x / y';
 $('track').querySelector('[value="receiver"]').textContent=drawing==='baked'?'Texture mesh corner · x / y':'Receiver outline corner · x / y';
 $('npr-note').textContent=drawing==='baked'?'Begin with baked surfaces, then change their drawing. The two vector styles keep the same projection and orbit, replace sampled appearances with ordinary Rive geometry, and need no GPU Canvas.':activeMeta.scope+' Download saves this vector style with the currently enabled layers; the file has no images, scripts or custom renderer.';invalidate();
}
for(const name of Object.keys(enabled))$('layer-'+name).onchange=setLayers;
$('track').onchange=()=>{track=$('track').value;rebuildPlots();};$('reset').onclick=()=>{for(const name of Object.keys(enabled))$('layer-'+name).checked=true;setLayers();$('track').value='cube';track='cube';rebuildPlots();seek(20);};setLayers();
$('drawing').onchange=()=>loadDrawing($('drawing').value).catch(reportError);
function standaloneHTML(js,wasm,riv,license){
 const escapedLicense=license.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Keyed projection · ordinary Rive playback</title><style>:root{color-scheme:dark;font:15px/1.5 system-ui;background:#0b161d;color:#d6e3e1}body{margin:0;padding:20px}main{max-width:1100px;margin:auto}header{display:flex;flex-wrap:wrap;align-items:center;gap:14px}h1{font:28px Georgia;margin-right:auto}button,input{accent-color:#e3c789}button{background:#283e47;border:1px solid #74928b;color:inherit;padding:8px 14px;border-radius:5px}#view{width:100%;height:min(72vh,680px);display:block;background:radial-gradient(ellipse,#172e37,#0b161d);border:1px solid #7d9b9266;border-radius:14px}output{font-variant-numeric:tabular-nums;min-width:16ch}footer,p{font-size:13px;color:#9ab1b7}.bar{display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:15px 0}.bar input{flex:1;min-width:130px}#error{color:#f4a396}pre{white-space:pre-wrap;font-size:11px}details{margin-top:15px}</style><main><header><h1>3D motion → 2D Rive keys</h1><span>Official Rive WebGL2 · ordinary .riv</span></header><canvas id="view"></canvas><div class="bar"><button id="play">Play</button><input aria-label="Orbit angle" id="time" type="range" min="0" max="240" value="20"><output id="position"></output></div><p id="status">Starting the packaged official runtime…</p><p id="error"></p><footer>${drawing==='baked'?'Fixed authored camera and orbit. Projected vector geometry and texture meshes have 60 fps keys; the glass uses 240 single-frame image poses (60 fps appearance). Inactive images are still packaged.':activeMeta.label+'. Fixed authored projection with 60 fps vector keys, ordinary fills and strokes. Zero images, scripts or GPU Canvas. The tone/caustic drawing is an artistic treatment, not a light solve.'} No custom 3D renderer runs here. Layer visibility matches the export. No network requests are required.<details><summary>Official Rive runtime · MIT license</summary><pre>${escapedLicense}</pre></details></footer></main><script type="module">
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const runtimeUrl=URL.createObjectURL(new Blob([decode('${js}')],{type:'text/javascript'}));
try{
 const {default:Rive}=await import(runtimeUrl),runtime=await Rive({wasmBinary:decode('${wasm}')}),canvas=document.getElementById('view'),renderer=runtime.makeRenderer(canvas),file=await runtime.load(decode('${riv}')),art=file.defaultArtboard(),anim=new runtime.LinearAnimationInstance(art.animationByIndex(0),art);
 let frame=20,playing=false,raf=0,last=0;const slider=document.getElementById('time'),button=document.getElementById('play');
 function draw(){anim.time=frame/60;anim.apply(1);art.advance(0);renderer.clear();renderer.save();renderer.align(runtime.Fit.contain,runtime.Alignment.center,{minX:0,minY:0,maxX:canvas.width,maxY:canvas.height},{minX:0,minY:0,maxX:640,maxY:520});art.draw(renderer);renderer.restore();renderer.flush();slider.value=Math.round(frame);document.getElementById('position').textContent=(frame*1.5).toFixed(1)+'° · frame '+Math.round(frame);document.body.dataset.frame=frame;}
 function tick(t){raf=0;if(document.hidden)return;if(last&&playing)frame=(frame+Math.min(.1,(t-last)/1000)*60)%240;last=t;draw();if(playing)raf=runtime.requestAnimationFrame(tick);}
 function wake(){if(!raf&&!document.hidden){last=0;raf=runtime.requestAnimationFrame(tick);}}
 button.onclick=()=>{playing=!playing;button.textContent=playing?'Pause':'Play';wake();};slider.oninput=()=>{frame=Number(slider.value);playing=false;button.textContent='Play';draw();};
 new ResizeObserver(()=>{const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio,2);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);wake();}).observe(canvas);
 document.addEventListener('visibilitychange',()=>{last=0;if(!document.hidden)wake();});document.getElementById('status').textContent='Ready · official runtime and all assets included';document.body.dataset.ready='true';document.body.dataset.owner='official-rive';wake();
}catch(e){document.getElementById('error').textContent=e.message;console.error(e);}finally{URL.revokeObjectURL(runtimeUrl);}
</script></html>`;
}
inspector=makeGlassTracks(meta,extracted,{seek,invalidate});
glassStudy=makeGlassStudy(THREE,meta,extracted,{seek,invalidate});
new ResizeObserver(resize).observe(document.querySelector('.views'));
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;last=0;invalidate();}).observe(document.querySelector('main'));
document.addEventListener('visibilitychange',()=>{last=0;invalidate();});window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='portfolio-lab-visibility'){hostPaused=!e.data.visible;last=0;invalidate();}});
async function start(){
 runtime=await Rive({locateFile:()=>new URL('../vector-replay/vendor/rive.wasm',import.meta.url).href});riveRenderer=runtime.makeRenderer($('rive'));const requested=new URLSearchParams(location.search).get('drawing');await loadDrawing(Object.hasOwn(npr,requested)?requested:'baked');
}
async function loadDrawing(style){
 const ticket=++loadTicket,nextMeta=style==='baked'?meta:npr[style];if(!nextMeta)throw Error('Unknown vector drawing style');
 $('status').textContent='Standby · loading the ordinary Rive drawing…';document.body.dataset.loading='true';
 $('drawing').disabled=$('export').disabled=$('export-html').disabled=true;
 try{
 const response=await fetch(nextMeta.file);if(!response.ok)throw Error('Drawing file unavailable');const nextBytes=new Uint8Array(await response.arrayBuffer()),nextFile=await runtime.load(nextBytes);
 if(ticket!==loadTicket){nextFile.delete();return;}
 for(const control of Object.values(layerAnimations))control.delete();animation?.delete();art?.delete();file?.delete();
 bytes=nextBytes;file=nextFile;activeMeta=nextMeta;drawing=style;$('drawing').value=style;art=file.defaultArtboard();animation=new runtime.LinearAnimationInstance(art.animationByIndex(0),art);selectedNode=art.node('vertex0');if(!selectedNode)throw Error('Export is missing its selected vertex');
 for(const name of Object.keys(enabled)){const control=art.animationByName('Visibility '+name);if(!control)throw Error('Missing ordinary visibility animation '+name);layerAnimations[name]=new runtime.LinearAnimationInstance(control,art);}
 ready=true;$('play').disabled=$('frame').disabled=false;$('play').textContent=playing?'Pause':'Play';$('status').textContent=`${(bytes.length/1024/1024).toFixed(2)} MB · ${activeMeta.tracks.toLocaleString()} numeric/color tracks · ${activeMeta.keyCount.toLocaleString()} keys · 60 fps · ${activeMeta.images} embedded images`+(style==='baked'?` · ${(meta.glassDecodedBytes/1024/1024).toFixed(0)} MB decoded glass pixels before runtime overhead`:' · ordinary vectors only');
 $('error').hidden=true;document.body.dataset.ready='true';document.body.dataset.owner='official-rive';document.body.dataset.drawing=drawing;setLayers();rebuildPlots();resize();wake();if(parent!==window)parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);
 }finally{if(ticket===loadTicket){$('drawing').disabled=$('export').disabled=$('export-html').disabled=false;document.body.dataset.loading='false';}}
}
function reportError(e){$('error').hidden=false;$('error').textContent='Could not load the keyed example: '+e.message;console.error(e);}
start().catch(reportError);
window.addEventListener('pagehide',e=>{if(raf)runtime?.cancelAnimationFrame(raf);raf=0;if(!e.persisted){ready=false;for(const control of Object.values(layerAnimations))control.delete();animation?.delete();art?.delete();file?.delete();riveRenderer?.delete();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});floorTexture.dispose();reference.dispose();glassStudy?.dispose();}});window.addEventListener('pageshow',()=>{last=0;invalidate();});
