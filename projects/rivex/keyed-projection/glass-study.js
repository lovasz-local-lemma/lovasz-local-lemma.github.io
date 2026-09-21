/* The live study is deliberately a browser shader, separate from the ordinary
 * Rive file above. The volume uses real image poses extracted from that file. */
const vertex=`varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const fragment=`precision highp float;
 varying vec2 vUv;
 uniform mat3 inverseOrbit;
 uniform sampler2D floorMap;
 uniform vec2 resolution;
 uniform float ior,gridView,second,cropView,layerOpacity;
 vec3 center(int i){return i==0?vec3(.2,-.24,.06):vec3(-.31,.73,.06);}
 float radius(int i){return i==0?.62:.31;}
 float hit(vec3 ro,vec3 rd,vec3 c,float r){vec3 oc=ro-c;float b=dot(rd,oc),h=b*b-dot(oc,oc)+r*r;if(h<0.)return -1.;float t=-b-sqrt(h);return t>.0001?t:-1.;}
 vec3 environment(vec3 ro,vec3 rd){
  vec3 color=vec3(.013,.026,.036)+pow(max(rd.y,0.),2.)*vec3(.1,.13,.16);
  float t=(-1.-ro.y)/rd.y;vec3 p=ro+rd*t;
  if(t>0.&&abs(p.x)<1.&&abs(p.z)<1.){
   vec2 uv=(p.xz+1.)*.5;vec3 tex=pow(texture2D(floorMap,uv).rgb,vec3(2.2));
   vec2 line=abs(fract(uv*14.)-.5);float g=1.-smoothstep(.025,.055,min(line.x,line.y));
   color=mix(tex,mix(vec3(.013,.035,.044),vec3(.2,.8,.72),g),gridView);
  }
  t=(2.6-ro.y)/rd.y;p=ro+rd*t;
  if(t>0.&&abs(p.x+.35)<1.1&&abs(p.z-.3)<.65)color=vec3(5.8,5.5,4.6);
  float strip=exp(-pow((rd.x-.91)/.15,2.)-pow((rd.y-.02)/.24,2.)-pow((rd.z+.28)/.3,2.));
  return color+strip*vec3(.06,.18,.24);
 }
 vec3 transmit(vec3 ro,vec3 rd,float n){
  float throughput=1.;
  for(int pass=0;pass<3;pass++){
   float nearest=1e6;int sphere=-1;
   for(int j=0;j<2;j++){if(j==1&&second<.5)continue;float t=hit(ro,rd,center(j),radius(j));if(t>0.&&t<nearest){sphere=j;nearest=t;}}
   if(sphere<0)break;
   vec3 c=center(sphere);float r=radius(sphere);vec3 p=ro+rd*nearest,normal=normalize(p-c);
   vec3 inside=refract(rd,normal,1./n);float chord=-2.*dot(inside,p-c);vec3 exit=p+inside*chord;
   rd=refract(inside,-normalize(exit-c),n);ro=exit+rd*.001;throughput*=.965;
  }
  return environment(ro,rd)*throughput;
 }
 void main(){
  float scale=min(resolution.x/640.,resolution.y/520.)*1.35;vec2 pixel=(vUv-.5)*resolution/scale+vec2(320.,260.);
  if(cropView>.5)pixel=vec2(200.,120.)+vUv*240.;
  vec3 ro=inverseOrbit*vec3(0.,0.,6.),rd=inverseOrbit*normalize(vec3((pixel.x-320.)/700.,(pixel.y-260.)/700.,-1.));
  float nearest=1e6;int sphere=-1;
  for(int j=0;j<2;j++){if(j==1&&second<.5)continue;float t=hit(ro,rd,center(j),radius(j));if(t>0.&&t<nearest){sphere=j;nearest=t;}}
  vec3 color=environment(ro,rd);
  if(sphere>=0){
   vec3 p=ro+rd*nearest,n=normalize(p-center(sphere));float cosI=max(0.,-dot(rd,n)),f0=pow((ior-1.)/(ior+1.),2.),f=f0+(1.-f0)*pow(1.-cosI,5.);
   vec3 reflected=environment(p,reflect(rd,n));vec3 transmitted;
   transmitted.r=transmit(ro,rd,ior-.005).r;transmitted.g=transmit(ro,rd,ior).g;transmitted.b=transmit(ro,rd,ior+.007).b;
   color=reflected*f+transmitted*(1.-f)*vec3(.96,.99,1.);
  }
  color=pow(1.-exp(-color*1.05),vec3(1./2.2));gl_FragColor=vec4(color,layerOpacity);
 }`;

const norm=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);},add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
function refract(d,n,eta){const ci=-dot(d,n),k=1-eta*eta*(1-ci*ci);return k<0?null:norm(add(mul(d,eta),mul(n,eta*ci-Math.sqrt(k))));}

// The displayed paths are actual transmitted rays; the optical clock includes
// n * distance inside each sphere. Their finite count is a geometry diagnostic,
// not an unbiased volume-radiance estimator.
export function tracePulse(ior,second){
 const spheres=[{c:[.2,-.24,.06],r:.62},...(second?[{c:[-.31,.73,.06],r:.31}]:[])],target=spheres.at(-1),light=[-.75,2.5,.45],segments=[];
 for(let i=0;i<73;i++){
  const r=Math.sqrt((i+.5)/73)*target.r*.91,a=i*2.39996323;let ro=light.slice(),rd=norm(sub(add(target.c,[Math.cos(a)*r,0,Math.sin(a)*r]),ro)),clock=0;
  for(let bounce=0;bounce<4;bounce++){
   let distance=Infinity,body=null;
   for(const s of spheres){const oc=sub(ro,s.c),b=dot(rd,oc),disc=b*b-dot(oc,oc)+s.r*s.r;if(disc>0){const t=-b-Math.sqrt(disc);if(t>.001&&t<distance){distance=t;body=s;}}}
   const floor=(-1-ro[1])/rd[1];if(floor>.001&&floor<distance){segments.push({a:ro,b:add(ro,mul(rd,floor)),start:clock,end:clock+floor,inside:false});break;}
   if(!body)break;
   const p=add(ro,mul(rd,distance));segments.push({a:ro,b:p,start:clock,end:clock+distance,inside:false});clock+=distance;
   const n=mul(sub(p,body.c),1/body.r),inside=refract(rd,n,1/ior);if(!inside)break;
   const chord=-2*dot(inside,sub(p,body.c)),end=add(p,mul(inside,chord));segments.push({a:p,b:end,start:clock,end:clock+chord*ior,inside:true});clock+=chord*ior;
   const out=refract(inside,mul(sub(end,body.c),-1/body.r),ior);if(!out)break;rd=out;ro=add(end,mul(out,.001));
  }
 }
 return segments;
}

// Clip in optical length, then project the same geometry into each stored pose.
export function gatedSegments(segments, gate, width, finite=gate<8.5) {
 const half=width*.5;
 return segments.flatMap(s=>{
  const a=finite?Math.max(0,(gate-half-s.start)/(s.end-s.start)):0;
  const b=finite?Math.min(1,(gate+half-s.start)/(s.end-s.start)):1;
  if(a>=b||a>=1||b<=0)return [];
  const delta=sub(s.b,s.a);
  return [{a:add(s.a,mul(delta,a)),b:add(s.a,mul(delta,b)),inside:s.inside}];
 });
}

// This is an explicit inspection-time mapping, not a clock read from the atlas.
// The selected stored pose shares the live gate; other poses offset it linearly.
export function historyPulseTime(gate,pose,selectedPose,span,swept){
 return swept?gate+(pose-selectedPose)*span/240:gate;
}

// The halo is a screen-space Gaussian around each actual segment. It changes
// presentation only: it does not add transport or claim a radiance estimate.
function makeRayLayer(THREE,capacity){
 const group=new THREE.Group(),positions=new Float32Array(capacity*6),colors=new Float32Array(capacity*6);
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage));
 const lineMaterial=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.8,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending});
 const lines=new THREE.LineSegments(geometry,lineMaterial);lines.frustumCulled=false;lines.renderOrder=301;group.add(lines);
 const glowGeometry=new THREE.InstancedBufferGeometry();
 glowGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,-1,0,1,-1,0,0,1,0,1,1,0],3));glowGeometry.setIndex([0,1,2,2,1,3]);
 const starts=new Float32Array(capacity*3),ends=new Float32Array(capacity*3),tints=new Float32Array(capacity*3);
 for(const [name,array]of[['aStart',starts],['aEnd',ends],['aTint',tints]])glowGeometry.setAttribute(name,new THREE.InstancedBufferAttribute(array,3).setUsage(THREE.DynamicDrawUsage));
 const glowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,
  uniforms:{viewport:{value:new THREE.Vector2(640,520)},intensity:{value:.15}},
  vertexShader:`attribute vec3 aStart,aEnd,aTint; uniform vec2 viewport; varying vec3 tint; varying float across;
   void main(){vec4 a=projectionMatrix*modelViewMatrix*vec4(aStart,1.),b=projectionMatrix*modelViewMatrix*vec4(aEnd,1.);
    vec2 delta=(b.xy/b.w-a.xy/a.w)*viewport,normal=vec2(-delta.y,delta.x)/max(length(delta),.001);
    vec4 p=mix(a,b,position.x);p.xy+=normal*position.y*7./viewport*p.w;gl_Position=p;tint=aTint;across=position.y;}`,
  fragmentShader:`precision highp float;varying vec3 tint;varying float across;uniform float intensity;void main(){gl_FragColor=vec4(tint,exp(-across*across*5.)*intensity);}`});
 const halo=new THREE.Mesh(glowGeometry,glowMaterial);halo.frustumCulled=false;halo.renderOrder=300;group.add(halo);
 return {group,update(paths,glow,opacity=1){
  const count=Math.min(capacity,paths.length);
  paths.slice(0,count).forEach((s,i)=>{const color=s.inside?[.5,.85,1]:[1,.72,.32];positions.set([...s.a,...s.b],i*6);colors.set([...color,...color],i*6);starts.set(s.a,i*3);ends.set(s.b,i*3);tints.set(color,i*3);});
  geometry.setDrawRange(0,count*2);geometry.attributes.position.needsUpdate=geometry.attributes.color.needsUpdate=true;
  glowGeometry.instanceCount=count;for(const attr of Object.values(glowGeometry.attributes))if(attr.isInstancedBufferAttribute)attr.needsUpdate=true;
  halo.visible=glow;lineMaterial.opacity=.8*opacity;glowMaterial.uniforms.intensity.value=.15*opacity;return count;
 },viewport(w,h){glowMaterial.uniforms.viewport.value.set(w,h);}};
}

function clipToSlice(a,b,z){
 // Liang–Barsky clipping keeps the diagnostic inside the atlas crop.
 let lo=0,hi=1;const dx=b[0]-a[0],dy=b[1]-a[1];
 for(const[p,q]of[[-dx,a[0]+1.5],[dx,1.5-a[0]],[-dy,a[1]+1.5],[dy,1.5-a[1]]]){
  if(Math.abs(p)<1e-9){if(q<0)return null;continue;}
  const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;
 }
 return {a:[a[0]+lo*dx,a[1]+lo*dy,z],b:[a[0]+hi*dx,a[1]+hi*dy,z]};
}

export function makeGlassStudy(THREE,meta,extracted,{invalidate,seek}){
 const $=id=>document.getElementById(id),section=$('glass-study'),liveCanvas=$('glass-live'),volumeCanvas=$('glass-volume');
 let visible=false,hostPaused=false,pageActive=true,disposed=false,pulsePlaying=false,pulseRaf=0,pulseLast=0,pulseClock=0;
 function canAnimate(){return visible&&!hostPaused&&pageActive&&!document.hidden&&!disposed;}
 function wakePulse(){if(pulsePlaying&&canAnimate()&&!pulseRaf)pulseRaf=requestAnimationFrame(advancePulse);}
 function stopPulseFrame(){if(pulseRaf)cancelAnimationFrame(pulseRaf);pulseRaf=0;pulseLast=0;}
 function advancePulse(now){pulseRaf=0;if(!canAnimate())return;
  if(pulseLast){pulseClock=(pulseClock+Math.min(.1,(now-pulseLast)/1000)*1.15)%8.45;$('pulse-clock').value=pulseClock;}
  pulseLast=now;invalidate();wakePulse();
 }
 function pulseState(){section.dataset.pulsePlaying=String(pulsePlaying);$('pulse-play').textContent=pulsePlaying?'Pause pulse':'Animate pulse';$('pulse-play').setAttribute('aria-pressed',String(pulsePlaying));}
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible)stopPulseFrame();invalidate();wakePulse();});observer.observe(section);
 const live=new THREE.WebGLRenderer({canvas:liveCanvas,antialias:true,preserveDrawingBuffer:true}),volume=new THREE.WebGLRenderer({canvas:volumeCanvas,antialias:true,preserveDrawingBuffer:true});
 for(const renderer of [live,volume]){renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x09151b);}live.autoClear=false;
 const scene=new THREE.Scene(),quadCamera=new THREE.Camera(),uniforms={inverseOrbit:{value:new THREE.Matrix3()},floorMap:{value:new THREE.TextureLoader().load('receiver-bake.png',invalidate)},resolution:{value:new THREE.Vector2(640,520)},ior:{value:1.515},gridView:{value:0},second:{value:0},cropView:{value:0},layerOpacity:{value:1}};
 uniforms.floorMap.value.flipY=false;
 const material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms});scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
 const rayScene=new THREE.Scene(),rayCamera=new THREE.PerspectiveCamera(2*Math.atan(meta.height/2/meta.focal/1.35)*180/Math.PI,640/520,.01,100);rayCamera.position.set(0,0,6);rayCamera.lookAt(0,0,0);
 const rayLayer=makeRayLayer(THREE,73*16);rayScene.add(rayLayer.group);let segments=tracePulse(1.515,false);
 const volumeScene=new THREE.Scene(),volumeCamera=new THREE.PerspectiveCamera(37,1,.1,40),stack=new THREE.Group();volumeScene.add(stack);let yaw=-.58;
 const cards=[],responses=[],rotations=[],atlas=new THREE.TextureLoader().load('glass-time-atlas.webp',()=>{for(const card of cards)card.material.map.needsUpdate=true;invalidate();});atlas.colorSpace=THREE.SRGBColorSpace;
 const poseRotation=frame=>new THREE.Matrix4().makeRotationX(meta.pitch).multiply(new THREE.Matrix4().makeRotationY(frame/240*Math.PI*2));
 for(let i=0;i<60;i++){
  const map=atlas.clone();map.needsUpdate=true;map.repeat.set(1/10,1/6);map.offset.set((i%10)/10,1-(Math.floor(i/10)+1)/6);
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.MeshBasicMaterial({map,transparent:true,opacity:.45,depthWrite:false,side:THREE.DoubleSide}));mesh.position.z=(i/59-.5)*5;stack.add(mesh);cards.push(mesh);
  const rotation=poseRotation(i*4);rotations.push(rotation);
  const responseUniforms={...uniforms,inverseOrbit:{value:new THREE.Matrix3().setFromMatrix4(rotation.clone().invert())},cropView:{value:1},layerOpacity:{value:.7}};
  const response=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.ShaderMaterial({
   vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:fragment,uniforms:responseUniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  response.position.z=mesh.position.z+.002;stack.add(response);responses.push(response);
 }
 const historyRays=makeRayLayer(THREE,60*73*16);stack.add(historyRays.group);
 const frame=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3,3,5)),new THREE.LineBasicMaterial({color:0x59787b,transparent:true,opacity:.3}));stack.add(frame);
 const selected=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(3,3)),new THREE.LineBasicMaterial({color:0xe7c37c,transparent:true,opacity:.7}));selected.renderOrder=310;stack.add(selected);
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.MeshBasicMaterial({color:0xa8e1d5,transparent:true,opacity:.025,side:THREE.DoubleSide,depthWrite:false}));stack.add(plane);
 function updateCamera(){const distance=9.5*Math.max(1,1.05/volumeCamera.aspect);volumeCamera.position.set(Math.sin(yaw)*distance,2.35,Math.cos(yaw)*distance);volumeCamera.lookAt(0,0,0);section.dataset.volumeYaw=yaw;}
 updateCamera();let drag=null;volumeCanvas.onpointerdown=e=>{drag={x:e.clientX,yaw};volumeCanvas.setPointerCapture(e.pointerId);};volumeCanvas.onpointermove=e=>{if(drag){yaw=drag.yaw-(e.clientX-drag.x)*.006;updateCamera();invalidate();}};volumeCanvas.onpointerup=volumeCanvas.onpointercancel=()=>drag=null;
 $('live-ior').oninput=()=>{uniforms.ior.value=Number($('live-ior').value);$('live-ior-value').textContent=uniforms.ior.value.toFixed(3);segments=tracePulse(uniforms.ior.value,$('live-chain').checked);invalidate();};
 $('live-grid').onchange=()=>{uniforms.gridView.value=+$('live-grid').checked;invalidate();};
 $('live-chain').onchange=()=>{uniforms.second.value=+$('live-chain').checked;segments=tracePulse(uniforms.ior.value,$('live-chain').checked);invalidate();};
 for(const id of ['live-paths','pulse-width','ray-glow','volume-range','volume-images','volume-live','volume-rays','history-span'])$(id).oninput=invalidate;
 $('history-sweep').oninput=()=>{if($('history-sweep').checked){$('live-paths').checked=true;$('volume-rays').checked=true;if(Number($('pulse-clock').value)>=8.5)$('pulse-clock').value=3.7;}invalidate();};
 $('pulse-clock').oninput=()=>{pulsePlaying=false;stopPulseFrame();pulseState();invalidate();};
 $('pulse-play').onclick=()=>{pulsePlaying=!pulsePlaying;if(pulsePlaying){$('live-paths').checked=true;if(Number($('pulse-clock').value)>=8.5)$('pulse-clock').value=.05;pulseClock=Number($('pulse-clock').value);}else stopPulseFrame();pulseState();invalidate();wakePulse();};pulseState();
 $('study-angle').oninput=()=>seek(Number($('study-angle').value));
 function resize(){for(const renderer of [live,volume]){const r=renderer.domElement.getBoundingClientRect();renderer.setSize(r.width,r.height,false);}volumeCamera.aspect=volumeCanvas.clientWidth/volumeCanvas.clientHeight;volumeCamera.updateProjectionMatrix();updateCamera();invalidate();}
 const resizeObserver=new ResizeObserver(resize);resizeObserver.observe($('glass-study-views'));resize();
 function draw(orbitFrame){
  if(!canAnimate())return;
  const rotation=poseRotation(orbitFrame);uniforms.inverseOrbit.value.setFromMatrix4(rotation.clone().invert());rayLayer.group.quaternion.setFromRotationMatrix(rotation);uniforms.resolution.value.set(liveCanvas.width,liveCanvas.height);
  live.clear();live.render(scene,quadCamera);
  const gate=Number($('pulse-clock').value),opticalWidth=Number($('pulse-width').value),paths=$('live-paths').checked?gatedSegments(segments,gate,opticalWidth):[],glow=$('ray-glow').checked;
  const count=rayLayer.update(paths,glow);
  const cssWidth=liveCanvas.clientWidth,cssHeight=liveCanvas.clientHeight,scale=Math.min(cssWidth/640,cssHeight/520),w=640*scale,h=520*scale;rayLayer.viewport(w,h);live.setViewport((cssWidth-w)/2,(cssHeight-h)/2,w,h);live.render(rayScene,rayCamera);live.setViewport(0,0,cssWidth,cssHeight);
  // Depth is authored orbit time. An optical pulse selects ray sections within
  // each pose. They stay independent in shared mode; swept mode explicitly
  // maps authored pose offsets to optical-clock offsets below.
  const width=Number($('volume-range').value),active=Math.floor((orbitFrame%240)/4),start=Math.max(0,Math.min(240-width,orbitFrame-width/2));let shown=0,responseCount=0;
  const projected=[],sliceSamples=[],point=new THREE.Vector3(),swept=$('history-sweep').checked&&gate<8.5,historySpan=Number($('history-span').value);
  function project(p,rotation){point.set(...p).applyMatrix4(rotation);const factor=700/(6-point.z);return [point.x*factor*3/240,(point.y*factor+20)*3/240];}
  cards.forEach((card,i)=>{
   const included=(width>0&&i*4>=start&&i*4<start+width)||i===active;
   card.visible=included&&$('volume-images').checked;card.material.opacity=i===active?.96:.18;card.renderOrder=i===active?200:Math.round(180-Math.abs(i-active));
   const response=responses[i];response.visible=included&&$('volume-live').checked;response.material.uniforms.layerOpacity.value=i===active?.85:.10;response.renderOrder=card.renderOrder+1;
   if(response.visible)responseCount++;if(!included)return;shown++;
   const sliceClock=historyPulseTime(gate,i*4,active*4,historySpan,swept),slicePaths=swept&&$('live-paths').checked?gatedSegments(segments,sliceClock,opticalWidth,true):paths;
   const before=projected.length;
   if($('volume-rays').checked)for(const s of slicePaths){const clipped=clipToSlice(project(s.a,rotations[i]),project(s.b,rotations[i]),card.position.z+.006);if(clipped)projected.push({...clipped,inside:s.inside});}
   sliceSamples.push({pose:i*4,clock:sliceClock,segments:projected.length-before,length:slicePaths.reduce((sum,s)=>sum+Math.hypot(...sub(s.b,s.a)),0)});
  });
  historyRays.viewport(volumeCanvas.clientWidth,volumeCanvas.clientHeight);const historyCount=historyRays.update(projected,glow,1/Math.max(1,shown));
  selected.position.z=plane.position.z=cards[active].position.z;volume.render(volumeScene,volumeCamera);
  $('volume-value').textContent=`${(width/60).toFixed(2)} s · ${shown} displayed slices`;$('pulse-value').textContent=gate<8.5?`${gate.toFixed(2)} optical units`:'All optical lengths';$('pulse-width-value').textContent=`${opticalWidth.toFixed(2)} units`;$('study-angle').value=orbitFrame;$('study-angle-value').textContent=`${(orbitFrame*1.5).toFixed(1)}°`;
  $('history-span-value').textContent=`${historySpan.toFixed(1)} optical units / orbit`;$('history-span').disabled=!$('history-sweep').checked;$('history-clock-note').textContent=swept?`Sweep: τ(slice) = τ(live) + (pose − selected pose) × ${historySpan.toFixed(1)} / 240. Same optical window width; no wrap at the slice edges.`:gate>=8.5?'All optical lengths: the finite pulse window and sweep are bypassed.':'Shared live clock: every image pose displays the same optical gate.';
  Object.assign(section.dataset,{historyClockMode:swept?'swept':'shared',sliceSamples:JSON.stringify(sliceSamples),visibleSegments:count,volumeRaySegments:historyCount,responseSlices:responseCount,slices:shown,gate,width:opticalWidth,draws:Number(section.dataset.draws||0)+1});
 }
 function onVisibility(){stopPulseFrame();wakePulse();}
 function onHost(event){if(event.source===parent&&event.origin===location.origin&&event.data?.type==='portfolio-lab-visibility'){hostPaused=!event.data.visible;stopPulseFrame();wakePulse();}}
 function onHide(){pageActive=false;stopPulseFrame();}
 function onShow(){pageActive=true;wakePulse();}
 document.addEventListener('visibilitychange',onVisibility);window.addEventListener('message',onHost);window.addEventListener('pagehide',onHide);window.addEventListener('pageshow',onShow);
 function dispose(){disposed=true;stopPulseFrame();observer.disconnect();resizeObserver.disconnect();document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('message',onHost);window.removeEventListener('pagehide',onHide);window.removeEventListener('pageshow',onShow);for(const s of [scene,rayScene,volumeScene])s.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});uniforms.floorMap.value.dispose();atlas.dispose();live.dispose();volume.dispose();}
 return {draw,dispose};
}
