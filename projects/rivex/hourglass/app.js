import * as THREE from 'three';
import {OrbitControls} from '../../../live_demos/pi/vendor/three/examples/jsm/controls/OrbitControls.js';
import Rive from '../vector-replay/vendor/webgl2_advanced.js';
import {presets,buildTransport,sub,add,mul,norm,cross,insideShape} from './transport.js';
import {dynamicScenes,sceneAt} from './dynamics.js';
import {buildMediumField,evaluateMediumField,fieldSample} from './medium-curves.js';
import {BeautyPass,makeGlassMaterial} from './beauty.js';
import {PhotonReceiver} from './photon-receiver.js';
const $=id=>document.getElementById(id),stage=$('stage');
const embedded=window.__RIVX_HOURGLASS_BUNDLE__,decode64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
// Embedded visibility belongs to the full host panel once its trusted message arrives.
// The local main-region observer remains the fallback for standalone playback.
let moving=false,motionPhase=0,motionSpeed=.7,shellMeshes=[],lampMeshes=[];
let sceneData=presets.spectrum,transport,mediumField,runtime,riveRenderer,riveFile,art,markNodes=[];
let visible=true,hostPaused=false,hostVisibilityKnown=false,ready=false,dirty=true,raf=0,last=0,playing=false,frames=0;
let workTimer=0,workSerial=0,workScheduled=false,pendingWork=null,pageSuspended=false;
const renderer=new THREE.WebGLRenderer({canvas:$('scene-canvas'),antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor(0x081015);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(43,1,.08,100),controls=new OrbitControls(camera,$('scene-canvas'));
controls.target.set(0,2.65,0);controls.enableDamping=false;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=5;controls.maxDistance=22;controls.enablePan=false;
const group=new THREE.Group();scene.add(group);
scene.add(new THREE.HemisphereLight(0xbbe4f5,0x14202a,1.1));const soft=new THREE.DirectionalLight(0xe7d4ac,2);soft.position.set(4,8,5);scene.add(soft);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(28,28),new THREE.MeshStandardMaterial({color:0x111d25,roughness:.6,metalness:.55}));floor.rotation.x=-Math.PI/2;scene.add(floor);
const grid=new THREE.GridHelper(24,48,0x28454a,0x152a32);grid.position.y=.003;grid.material.transparent=true;grid.material.opacity=.4;scene.add(grid);
const beauty=new BeautyPass(renderer);
const shared={gate:{value:0},clock:{value:0},arrival:{value:6.8},width:{value:.7},exposure:{value:1.2},fog:{value:.1},albedo:{value:.9},anisotropy:{value:.18},stageFilter:{value:-1}};
const photonReceiver=new PhotonReceiver(shared);scene.add(photonReceiver.mesh);
const progressive=()=>$('receiver-mode').value==='photons'&&!moving;
function resetReceiver(){photonReceiver.reset(sceneData,Number($('ior').value),Number($('receiver-budget').value));}
function holdScene(){
 if(!moving)return false;
 moving=false;last=0;$('motion-play').textContent='Animate scene';
 return true;
}
function requestReceiverWork(reason,{restart=false}={}){
 // The animated preview draws angular cells. A deliberate photon edit must
 // hold and retrace this pose, otherwise the changed receiver stays invisible.
 const held=holdScene();
 queueWork(held?'Holding this pose · '+reason:reason,{transport:held,restart});
}
function receiverStatus(){
 const p=photonReceiver,enabled=$('receiver-mode').value==='photons',hidden=$('display').value==='volume';
 const notice=moving?'Scene animation and optical arrival are independent clocks. Editing photon controls holds this pose and refines it.':'Scene held for photon refinement. Animate scene resumes motion; the optical pulse can still sweep independently.';
 const motionNotice=document.querySelector('.motion-note');if(motionNotice.textContent!==notice)motionNotice.textContent=notice;
 $('smooth-receiver').checked=enabled;
 $('receiver-budget').disabled=$('receiver-radius').disabled=$('receiver-restart').disabled=!enabled;
 $('receiver-radius-value').textContent=Number($('receiver-radius').value)===0?'0 · pixel':Number($('receiver-radius').value).toFixed(3)+' m';
 $('receiver-progress').max=Math.max(1,p.target);$('receiver-progress').value=p.emitted;$('receiver-progress').hidden=!enabled||moving;
 if(!pendingWork){
  const state=moving?'Motion preview':!enabled?'Inspecting cells':hidden?'Receiver paused':p.pending?'Refining':'Ready';
  $('work-state').textContent=state;document.body.dataset.work=state.toLowerCase().replaceAll(' ','-');
  $('receiver-status').textContent=moving?'Angular preview while moving · edit emitted rays or kernel, or Restart photons, to hold this pose and refine it':!enabled?'Angular footprints expose tessellation spokes · enable Remove angular spokes for independently sampled hits':hidden?'Receiver is hidden · show Surface caustic or Volume + receiver to continue':`${p.emitted.toLocaleString()} / ${p.target.toLocaleString()} emitted rays · ${p.count.toLocaleString()} retained hits${p.pending?' · controls remain live':' · fixed-kernel result'}`;
 }
 $('work-status').setAttribute('aria-busy',String(!!pendingWork||enabled&&!moving&&!hidden&&p.pending));
 document.body.dataset.receiverSamples=p.emitted;document.body.dataset.receiverHits=p.count;document.body.dataset.receiverMode=$('receiver-mode').value;
 document.body.dataset.receiverTarget=p.target;document.body.dataset.receiverGeneration=p.generation;document.body.dataset.sceneMoving=String(moving);
}
function queueWork(reason,{transport:retrace=false,restart=false,field=false}={}){
 // Keep the last requested settings, merge dependencies, and yield two paints
 // before synchronous geometry allocation so the Standby state is visible.
 pauseQueuedWork();
 pendingWork={transport:retrace||pendingWork?.transport,restart:restart||pendingWork?.restart,field:field||pendingWork?.field};
 document.body.dataset.work='standby';$('work-state').textContent='Standby';$('receiver-status').textContent=reason+' · applying the latest settings…';$('work-status').setAttribute('aria-busy','true');
 schedulePendingWork(70);
}
function pauseQueuedWork(){
 ++workSerial;clearTimeout(workTimer);workTimer=0;workScheduled=false;
}
function schedulePendingWork(delay=0){
 if(!pendingWork||workScheduled||pageSuspended||hostPaused||(!hostVisibilityKnown&&!visible)||document.hidden)return;
 const token=workSerial;workScheduled=true;
 workTimer=setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(token!==workSerial)return;
  workTimer=0;workScheduled=false;
  if(!pendingWork||pageSuspended||hostPaused||(!hostVisibilityKnown&&!visible)||document.hidden)return;
  const job=pendingWork;
  try{
   if(job.transport)rebuild();
   else if(job.restart)resetReceiver();
   else if(Number($('receiver-budget').value)!==photonReceiver.target){
    const target=Number($('receiver-budget').value);if(target<photonReceiver.emitted)resetReceiver();else photonReceiver.setTarget(target);
   }
   if((job.field||job.transport)&&curveMode())mediumField=buildMediumField(transport,sceneData,{z:Number($('slice').value),fog:shared.fog.value});
   pendingWork=null;updateDisplay();draw();
  }catch(error){pendingWork=null;$('work-state').textContent='Retry';$('receiver-status').textContent=error.message;document.body.dataset.work='error';console.error(error);}
 })),delay);
}

const vertex=`attribute vec3 tint; attribute float optical,airLength,transportStage; attribute float density; attribute vec3 travelDirection;
 varying vec3 vTint; varying float vOptical,vAir,vStage; varying float vDensity; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vDirection;
 void main(){vTint=tint;vOptical=optical;vAir=airLength;vStage=transportStage;vDensity=density;vWorld=position;vNormal=normal;vDirection=travelDirection;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment=`uniform float gate,clock,arrival,width,exposure,fog,albedo,anisotropy,stageFilter;uniform float receiver;
 varying vec3 vTint;varying float vOptical,vAir,vStage,vDensity;varying vec3 vWorld,vNormal,vDirection;
 void main(){if(stageFilter>=0.&&abs(vStage-stageFilter)>.25)discard;
 vec3 toEye=cameraPosition-vWorld;float eyeDistance=length(toEye);vec3 viewDir=normalize(toEye);
 float L=vOptical+clock*eyeDistance;float window=gate>.5?exp(-.5*pow((L-arrival)/max(width*.5,.02),2.)):1.;
 float cosine=max(abs(dot(normalize(vNormal),viewDir)),.14);
 float g=anisotropy;float phase=(1.-g*g)/(12.56637*pow(max(.01,1.+g*g-2.*g*dot(normalize(vDirection),viewDir)),1.5));
 // Extinction-aware finite bandwidth integration, sigma_s = albedo * sigma_t.
 float integrated=fog>.0001?(1.-exp(-fog*.1))/.1:0.;
 float scatter=receiver>.5?8.:(integrated*albedo*phase/cosine*120.);
 float trans=exp(-fog*(vAir+(receiver>.5?0.:eyeDistance)));
 float radiance=min(vDensity,40.)*scatter*trans*window*exposure;
 // Additive display blend intentionally clamps radiance; this is a preview.
 gl_FragColor=vec4(vTint*radiance,1.);}`;
let volumeMesh,receiverMesh,reflectionMesh,reflectionReceiver;
function updateGeometry(mesh,data,isReceiver){
 const attributes={position:[data.position,3],normal:[isReceiver?data.position.map((_,i)=>i%3===1?1:0):data.normal,3],tint:[data.color,3],optical:[data.optical,1],density:[data.density,1],travelDirection:[isReceiver?data.position.map((_,i)=>i%3===1?-1:0):data.direction,3],airLength:[data.air,1],transportStage:[data.stage,1]};
 for(const [name,[values,size]]of Object.entries(attributes)){const old=mesh.geometry.getAttribute(name);if(old&&old.array.length===values.length){old.array.set(values);old.needsUpdate=true;}else mesh.geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,size));}
 mesh.geometry.setDrawRange(0,data.position.length/3);mesh.geometry.boundingSphere=null;
}
function sheetMesh(data,isReceiver){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.position,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(isReceiver?data.position.map((_,i)=>i%3===1?1:0):data.normal,3));g.setAttribute('tint',new THREE.Float32BufferAttribute(data.color,3));g.setAttribute('optical',new THREE.Float32BufferAttribute(data.optical,1));g.setAttribute('density',new THREE.Float32BufferAttribute(data.density,1));g.setAttribute('travelDirection',new THREE.Float32BufferAttribute(isReceiver?data.position.map((_,i)=>i%3===1?-1:0):data.direction,3));
 g.setAttribute('airLength',new THREE.Float32BufferAttribute(data.air,1));g.setAttribute('transportStage',new THREE.Float32BufferAttribute(data.stage,1));
 const m=new THREE.ShaderMaterial({uniforms:{...shared,receiver:{value:isReceiver?1:0}},vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
 const mesh=new THREE.Mesh(g,m);mesh.frustumCulled=false;mesh.renderOrder=isReceiver?2:3;group.add(mesh);return mesh;
}
function disposeGroup(){while(group.children.length){const o=group.children[0];group.remove(o);o.geometry?.dispose();if(o.userData.shellMaterials)Object.values(o.userData.shellMaterials).forEach(m=>m.dispose());else if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();}}
function rebuild({dynamic=false}={}){
 const t=performance.now(),quality=dynamic?4:Number($('quality').value),azimuth=dynamic?24:quality===12?64:quality===20?96:128;
 transport=buildTransport(sceneData,Number($('ior').value),quality,azimuth,dynamic?4:14);mediumField=null;
 if(!dynamic)resetReceiver();
 if(dynamic&&volumeMesh){updateGeometry(volumeMesh,transport.sheet,false);updateGeometry(receiverMesh,transport.floor,true);updateGeometry(reflectionMesh,transport.reflectionSheet,false);updateGeometry(reflectionReceiver,transport.reflectionFloor,true);}
 else{
  disposeGroup();shellMeshes=[];lampMeshes=[];
  volumeMesh=sheetMesh(transport.sheet,false);receiverMesh=sheetMesh(transport.floor,true);
  reflectionMesh=sheetMesh(transport.reflectionSheet,false);reflectionReceiver=sheetMesh(transport.reflectionFloor,true);
  for(const s of sceneData.spheres){
   const schematic=new THREE.MeshPhysicalMaterial({color:0xa3cbd5,metalness:.12,roughness:.08,transparent:true,opacity:.22,side:THREE.FrontSide,depthWrite:false,clearcoat:1});
   const shell=new THREE.Mesh(new THREE.SphereGeometry(1,64,40),schematic);shell.userData.shellMaterials={schematic,beauty:makeGlassMaterial(Number($('ior').value))};shell.renderOrder=4;group.add(shell);shellMeshes.push(shell);
  }
  for(const light of sceneData.lights){const body=new THREE.Mesh(new THREE.SphereGeometry(.072,20,12),new THREE.MeshBasicMaterial({color:new THREE.Color(...light.color)}));group.add(body);const lamp=new THREE.PointLight(new THREE.Color(...light.color),2,7,2);group.add(lamp);lampMeshes.push({body,lamp});}
 }
 sceneData.spheres.forEach((s,i)=>{const shell=shellMeshes[i],axes=s.axes||[s.r,s.r,s.r];shell.position.set(...s.c);shell.scale.set(...axes);shell.userData.shellMaterials.beauty.uniforms.center.value.set(...s.c);shell.userData.shellMaterials.beauty.uniforms.axes.value.set(...axes);});
 sceneData.lights.forEach((l,i)=>{lampMeshes[i].body.position.set(...l.p);lampMeshes[i].lamp.position.set(...l.p);});
 $('status').textContent=`${transport.stats.traced.toLocaleString()} traced rays · ${Math.round(transport.stats.sheetTriangles/1000)}k triangles · after 1st glass: ${transport.stats.stageRays[1]} · after 2nd: ${transport.stats.stageRays[2]} · ${Math.round(performance.now()-t)} ms${dynamic?' · motion preview':''}`;
 document.body.dataset.transportIor=String(Number($('ior').value));document.body.dataset.scene=$('scene').value;document.body.dataset.stageTwo=transport.stats.stageRays[2];document.body.dataset.signatures=JSON.stringify(transport.stats.signatures);
 document.body.dataset.traced=transport.stats.traced;document.body.dataset.triangles=transport.stats.triangles;document.body.dataset.reflectionTriangles=transport.stats.reflectionTriangles;document.body.dataset.glassSegments=transport.stats.glassSegments;document.body.dataset.motion=String(motionPhase);document.body.dataset.axes=JSON.stringify(sceneData.spheres.map(s=>s.axes||[s.r,s.r,s.r]));updateDisplay();draw();
}
function setScene(id){
 moving=!!dynamicScenes[id]&&!matchMedia('(prefers-reduced-motion: reduce)').matches;motionPhase=0;
 $('motion-controls').hidden=!dynamicScenes[id];$('motion-play').textContent=moving?'Pause scene':'Animate scene';$('motion-phase').value=0;
 sceneData=sceneAt(id,motionPhase);reset();queueWork("Scene transport",{transport:true});last=0;draw();
}
function curveMode(){return $('display').value.includes('curves');}
function updateDisplay(){const mode=$('display').value,pretty=$('beauty').checked;volumeMesh.visible=['both','volume','hybrid-curves'].includes(mode);receiverMesh.visible=mode!=='volume'&&!progressive();photonReceiver.mesh.visible=mode!=='volume'&&progressive();photonReceiver.material.uniforms.radius.value=Number($('receiver-radius').value);photonReceiver.material.uniforms.reflections.value=pretty&&$('reflections').checked?1:0;receiverStatus();reflectionMesh.visible=pretty&&$('reflections').checked&&volumeMesh.visible;reflectionReceiver.visible=pretty&&$('reflections').checked&&receiverMesh.visible;
 shellMeshes.forEach(s=>s.material=s.userData.shellMaterials[pretty?'beauty':'schematic']);$('curve-controls').hidden=!curveMode();$('reconstruction').disabled=!pretty;
 $('render-label').textContent=mode==='curves'?'LIVE RIVE MEDIUM CURVES':pretty?'BEAUTY · RECONSTRUCTED PHOTON LIGHT':'SCHEMATIC · FINITE TRANSPORT SHEETS';$('legend').textContent=curveMode()?'GPU receiver · Official Rive medium curves':pretty?'Biased beauty · cached rays → HDR light → reconstruction':'GPU sheets · Official Rive contours';document.body.dataset.volume=volumeMesh.visible;document.body.dataset.beauty=String(pretty);}
function project(p){const v=new THREE.Vector3(...p).project(camera);return [(v.x*.5+.5)*1000,(.5-v.y*.5)*650];}
function vectorSegments(){
 const segments=[];
 const edge=(a,b,w=1)=>segments.push({a:project(a),b:project(b),width:w});
 const eye=camera.position.toArray();
 if($('vectors').checked)for(const s of sceneData.spheres){const axes=s.axes||[s.r,s.r,s.r],q=sub(eye,s.c).map((x,i)=>x/axes[i]),dist=Math.hypot(...q),n=norm(q),u=norm(cross(n,[0,1,0])),v=cross(n,u),r=Math.sqrt(1-1/(dist*dist)),c=mul(n,1/dist),at=t=>add(s.c,add(c,mul(add(mul(u,Math.cos(t)),mul(v,Math.sin(t))),r)).map((x,i)=>x*axes[i]));for(let j=0;j<64;j++)edge(at(j*Math.PI/32),at((j+1)*Math.PI/32),.65);}
 if($('rays').checked)for(const sample of transport.rays)for(const seg of sample.path.segments)if(shared.stageFilter.value<0||seg.stage===shared.stageFilter.value)edge(seg.a,seg.b,.72);
 if($('internal-rays').checked)for(const sample of transport.rays)for(const seg of sample.path.glassSegments)if(shared.stageFilter.value<0||seg.stage===shared.stageFilter.value){
  // Clip the finite glass segment to the same optical-time window as the photons.
  const shift=shared.clock.value?Math.hypot(...sub(eye,mul(add(seg.a,seg.b),.5))):0;
  const a=shared.gate.value?Math.max(0,(shared.arrival.value-shift-shared.width.value-seg.L0)/(seg.L1-seg.L0)):0,b=shared.gate.value?Math.min(1,(shared.arrival.value-shift+shared.width.value-seg.L0)/(seg.L1-seg.L0)):1;
  if(b>a)edge(add(seg.a,mul(sub(seg.b,seg.a),a)),add(seg.a,mul(sub(seg.b,seg.a),b)),1.15);
 }
 // Reserve the gold marks for scene-derived medium curves. Rive owns every
 // visible segment: this is not a GPU image with a decorative Rive label.
 while(segments.length<320)segments.push(null);
 let curveCount=0;
 if(curveMode()&&!pendingWork?.field&&!pendingWork?.transport){
  if(!mediumField)mediumField=buildMediumField(transport,sceneData,{z:Number($('slice').value),fog:shared.fog.value,...(moving?{nx:40,ny:64,bins:48}:{})});
  const values=evaluateMediumField(mediumField,{gate:shared.gate.value,arrival:shared.arrival.value,width:shared.width.value,clock:shared.clock.value,eye,filter:shared.stageFilter.value});
  const response=$('curve-response').value,amplitude=Number($('curve-amount').value),reference=Math.max(mediumField.reference,1e-8),z=mediumField.z;
  const at=(x,y,phase)=>{const raw=fieldSample(mediumField,values,x,y),tone=Math.min(1.5,Math.log1p(raw/reference*4)*shared.exposure.value*shared.fog.value/.1/Math.log(5));return {p:[x+(response==='width'?0:amplitude*tone*Math.sin(y*7+phase)),y,z],tone};};
  const inside=p=>sceneData.spheres.some(s=>insideShape(p,s,1.008));
  for(let line=0;line<38;line++){
   const x=-3.6+line/37*7.2,phase=line*.45;
   for(let j=0;j<84;j++){
    const a=at(x,mediumField.ymin+j/84*(mediumField.ymax-mediumField.ymin),phase),b=at(x,mediumField.ymin+(j+1)/84*(mediumField.ymax-mediumField.ymin),phase),tone=(a.tone+b.tone)*.5;
    if(tone<.014||inside(a.p)||inside(b.p))continue;
    edge(a.p,b.p,response==='bend'?.6:.18+tone*2.7);curveCount++;
   }
  }
 }
 document.body.dataset.curves=curveCount;
 return segments;
}
function drawVectors(){if(!art)return;const segments=vectorSegments();markNodes.forEach((n,i)=>{const m=segments[i];if(!m){n.scaleY=0;return;}const dx=m.b[0]-m.a[0],dy=m.b[1]-m.a[1];n.x=m.a[0];n.y=m.a[1];n.rotation=Math.atan2(dy,dx);n.scaleX=Math.hypot(dx,dy);n.scaleY=m.width;});art.advance(0);riveRenderer.clear();riveRenderer.save();riveRenderer.align(runtime.Fit.fill,runtime.Alignment.center,{minX:0,minY:0,maxX:$('rive-canvas').width,maxY:$('rive-canvas').height},{minX:0,minY:0,maxX:1000,maxY:650});art.draw(riveRenderer);riveRenderer.restore();riveRenderer.flush();}
function draw(){dirty=true;wake();}
function render(){photonReceiver.material.uniforms.viewportHeight.value=renderer.domElement.height*($('beauty').checked?.65:1);if($('beauty').checked)beauty.render(scene,camera,{photons:[volumeMesh,receiverMesh,reflectionMesh,reflectionReceiver,photonReceiver.mesh],shells:shellMeshes,floor,grid,lamps:lampMeshes.map(l=>l.body),radius:Number($('reconstruction').value)});else renderer.render(scene,camera);drawVectors();document.body.dataset.frames=++frames;document.body.dataset.gate=shared.gate.value;document.body.dataset.time=shared.arrival.value;document.body.dataset.filter=shared.stageFilter.value;document.body.dataset.internalRays=String($('internal-rays').checked);document.body.dataset.albedo=shared.albedo.value;document.body.dataset.anisotropy=shared.anisotropy.value;dirty=false;}
function wake(){schedulePendingWork();if(ready&&!raf&&!pageSuspended&&(hostVisibilityKnown||visible)&&!hostPaused&&!document.hidden)raf=runtime.requestAnimationFrame(tick);}
function tick(now){raf=0;if(pageSuspended||(!hostVisibilityKnown&&!visible)||hostPaused||document.hidden){last=0;return;}const dt=last?Math.min(.07,(now-last)/1000):0;last=now;if(moving&&!pendingWork){motionPhase=(motionPhase+dt*motionSpeed/8)%1;$('motion-phase').value=motionPhase;sceneData=sceneAt($('scene').value,motionPhase);rebuild({dynamic:true});}if(playing){shared.arrival.value+=dt*1.2;const eyeDistance=camera.position.distanceTo(controls.target),base=shared.clock.value?Math.max(0,eyeDistance-3):0,max=shared.clock.value?eyeDistance+12:11;if(shared.arrival.value>max)shared.arrival.value=base;$('time').value=shared.arrival.value;updateLabels();dirty=true;}if(!pendingWork&&progressive()&&photonReceiver.pending&&photonReceiver.mesh.visible){photonReceiver.advance(5);receiverStatus();dirty=true;}if(dirty)render();if(playing||moving||(progressive()&&photonReceiver.pending&&photonReceiver.mesh.visible))wake();}
function updateLabels(){$('time-value').textContent=shared.arrival.value.toFixed(2)+' m';$('width-value').textContent=shared.width.value.toFixed(2)+' m';$('ior-value').textContent=Number($('ior').value).toFixed(2);$('fog-value').textContent=shared.fog.value.toFixed(2)+' /m';$('albedo-value').textContent=shared.albedo.value.toFixed(2);$('anisotropy-value').textContent=shared.anisotropy.value.toFixed(2);}
function reset(){camera.position.set(...sceneData.camera);controls.target.set(...(sceneData.target||[0,sceneData===presets.jewel?2.6:2.8,0]));controls.update();draw();}
function resize(){const r=stage.getBoundingClientRect();renderer.setSize(r.width,r.height,false);beauty.resize(renderer.domElement.width,renderer.domElement.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();$('rive-canvas').width=Math.round(r.width*Math.min(devicePixelRatio,1.6));$('rive-canvas').height=Math.round(r.height*Math.min(devicePixelRatio,1.6));draw();}
controls.addEventListener('change',draw);new ResizeObserver(resize).observe(stage);
$('scene').onchange=()=>setScene($('scene').value);
$('motion-play').onclick=()=>{moving=!moving;$('motion-play').textContent=moving?'Pause scene':'Animate scene';last=0;if(!moving)queueWork('Paused scene · rebuilding fine transport',{transport:true});else updateDisplay();draw();};
$('motion-phase').oninput=()=>{moving=false;$('motion-play').textContent='Animate scene';motionPhase=Number($('motion-phase').value);sceneData=sceneAt($('scene').value,motionPhase);queueWork('Scene pose',{transport:true});};
$('motion-speed').oninput=()=>{motionSpeed=Number($('motion-speed').value);};$('ior').oninput=()=>{updateLabels();queueWork('Glass refraction',{transport:true});};$('quality').onchange=()=>queueWork('Angular sheet resolution',{transport:true});
function selectReceiver(){if($('receiver-mode').value==='photons'&&moving)requestReceiverWork('Preparing independent photon rays');updateDisplay();draw();}
$('receiver-mode').onchange=selectReceiver;$('smooth-receiver').onchange=()=>{$('receiver-mode').value=$('smooth-receiver').checked?'photons':'cells';selectReceiver();};$('receiver-budget').onchange=()=>requestReceiverWork('Receiver sample budget');$('receiver-restart').onclick=()=>requestReceiverWork('Restarting independent photon rays',{restart:true});$('receiver-radius').oninput=()=>{if(moving)requestReceiverWork('Receiver kernel');updateDisplay();draw();};
$('reset').onclick=reset;$('display').onchange=()=>{updateDisplay();if(curveMode()&&!mediumField)queueWork('Rive medium field',{field:true});else draw();};$('beauty').onchange=$('reflections').onchange=()=>{updateDisplay();draw();};$('vectors').onchange=$('rays').onchange=$('internal-rays').onchange=draw;$('reconstruction').oninput=draw;
$('path-stage').onchange=()=>{shared.stageFilter.value=Number($('path-stage').value);draw();};
$('curve-response').onchange=$('curve-amount').oninput=draw;
$('slice').oninput=()=>{$('slice-value').textContent=Number($('slice').value).toFixed(2)+' m';queueWork('Rive medium slice',{field:true});};
for(const key of ['time','width','exposure','fog','albedo','anisotropy'])$(key).oninput=()=>{shared[key==='time'?'arrival':key].value=Number($(key).value);if(key==='fog'){if(curveMode())queueWork('Rive medium attenuation',{field:true});else mediumField=null;}if(key==='time'){playing=false;$('play').textContent='Sweep pulse';}updateLabels();draw();};
$('gate').onchange=()=>{shared.gate.value=$('gate').checked?1:0;draw();};$('clock').onchange=()=>{shared.clock.value=$('clock').value==='camera'?1:0;const eyeDistance=camera.position.distanceTo(controls.target);shared.arrival.value+=shared.clock.value?eyeDistance:-eyeDistance;$('time').max=shared.clock.value?40:24;shared.arrival.value=Math.max(0,Math.min(Number($('time').max),shared.arrival.value));$('time').value=shared.arrival.value;updateLabels();draw();};
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause pulse':'Sweep pulse';if(playing){$('gate').checked=true;shared.gate.value=1;}last=0;draw();};
$('scene-canvas').onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const a=(e.key==='ArrowLeft'?-.1:.1),p=camera.position.clone().sub(controls.target);p.applyAxisAngle(new THREE.Vector3(0,1,0),a);camera.position.copy(p.add(controls.target));controls.update();draw();}};
function syncActivity(){
 last=0;
 if(pageSuspended||hostPaused||(!hostVisibilityKnown&&!visible)||document.hidden)pauseQueuedWork();
 else wake();
}
// Controls are part of the live study too. On narrow screens they can be in
// view while the canvas is below the fold; their requested work must still run.
new IntersectionObserver(e=>{visible=e[0].isIntersecting;syncActivity();}).observe(document.querySelector('main'));document.addEventListener('visibilitychange',syncActivity);window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='portfolio-lab-visibility'){hostVisibilityKnown=true;hostPaused=!e.data.visible;syncActivity();}});
async function start(){const query=new URLSearchParams(location.search);if(presets[query.get('scene')]||dynamicScenes[query.get('scene')]){$('scene').value=query.get('scene');sceneData=sceneAt(query.get('scene'));}if([...$('display').options].some(o=>o.value===query.get('display')))$('display').value=query.get('display');reset();rebuild();resize();runtime=await Rive(embedded?{wasmBinary:decode64(embedded.wasm)}:{locateFile:()=>new URL('../vector-replay/vendor/rive.wasm',import.meta.url).href});riveRenderer=runtime.makeRenderer($('rive-canvas'));riveFile=await runtime.load(embedded?decode64(embedded.context):new Uint8Array(await(await fetch('./context.riv')).arrayBuffer()));art=riveFile.defaultArtboard();markNodes=Array.from({length:4096},(_,i)=>art.node('mark'+i));if(markNodes.some(n=>!n))throw Error('Incomplete Rive context asset');document.body.dataset.rive='official';ready=true;if(dynamicScenes[$('scene').value])setScene($('scene').value);
 if(embedded?.settings){pauseQueuedWork();pendingWork=null;const saved=embedded.settings;$('scene').value=saved.scene;motionPhase=saved.phase||0;sceneData=sceneAt(saved.scene,motionPhase);moving=false;playing=false;$('motion-controls').hidden=!dynamicScenes[saved.scene];$('motion-play').textContent='Animate scene';$('motion-phase').value=motionPhase;$('play').textContent='Sweep pulse';
 for(const [id,value]of Object.entries(saved.controls)){const el=$(id);if(!el)continue;if(el.type==='checkbox')el.checked=value;else el.value=value;}
 motionSpeed=Number($('motion-speed').value);
 for(const key of ['gate','clock','arrival','width','exposure','fog','albedo','anisotropy','stageFilter'])if(saved.uniforms[key]!==undefined)shared[key].value=saved.uniforms[key];
 camera.position.set(...saved.camera);controls.target.set(...saved.target);controls.update();rebuild();updateLabels();}
 render();if(parent!==window)parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);wake();}
$('export-study').onclick=async()=>{const button=$('export-study');button.disabled=true;$('export-status').textContent='Packing scene, shaders, Rive and runtime…';const wasMoving=moving,wasPlaying=playing;moving=playing=false;try{
 const {exportStudy}=await import('./export.js'),settings={scene:$('scene').value,phase:motionPhase,camera:camera.position.toArray(),target:controls.target.toArray(),uniforms:Object.fromEntries(Object.entries(shared).map(([k,v])=>[k,v.value])),controls:Object.fromEntries(['receiver-mode','receiver-budget','receiver-radius','motion-speed','display','vectors','rays','internal-rays','beauty','reflections','reconstruction','path-stage','curve-response','curve-amount','slice','time','width','exposure','fog','albedo','anisotropy','gate','clock','ior','quality'].map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]))};
 const result=await exportStudy(settings);$('export-status').textContent=`Saved ${result.name} · ${(result.bytes/1048576).toFixed(1)} MB · opens without a server.`;
 }catch(e){$('export-status').textContent='Export failed: '+e.message;}finally{button.disabled=false;moving=wasMoving;playing=wasPlaying;last=0;draw();}};
start().catch(e=>{$('error').hidden=false;$('error').textContent='Could not start the study: '+e.message;console.error(e);});
window.addEventListener('pagehide',e=>{pageSuspended=true;pauseQueuedWork();if(!e.persisted)pendingWork=null;if(raf)runtime.cancelAnimationFrame(raf);raf=0;if(!e.persisted){ready=false;controls.dispose();disposeGroup();photonReceiver.dispose();beauty.dispose();floor.geometry.dispose();floor.material.dispose();grid.geometry.dispose();grid.material.dispose();renderer.dispose();art?.delete();riveFile?.delete();riveRenderer?.delete();}});window.addEventListener('pageshow',()=>{pageSuspended=false;last=0;draw();});
