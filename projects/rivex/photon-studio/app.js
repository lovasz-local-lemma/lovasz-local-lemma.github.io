import Rive from '../vector-replay/vendor/webgl2_advanced.js';
import {decode,clip,camera,project,guides} from './transport.js';
import {scenes,traceScene,sceneGuides,pulseCurves,sub,add,mul,norm,cross,dot} from './scenes.js';
import {makeReference} from './reference.js';
import {buildReceivers,receiverLines} from './receivers.js';
import {mediumAnchors,primitiveGeometry} from './primitives.js';
import {makePrimitiveRenderer} from './primitive-renderer.js';
import {portableHtml} from './portable.js';
import {encodeRiveInk} from './rive-snapshot.js';
import {makeFrameAverage} from './frame-average.js';
import {traceMedium,editableScene,sampledAnchors,causticEnvelope} from './scattering.js';
const $=id=>document.getElementById(id),state={mode:(['beams','points','surface','ink','rings','arcs','balls','disks','hybrid','primitives','cloud'].includes(new URLSearchParams(location.search).get('mode'))?new URLSearchParams(location.search).get('mode'):'beams'),playing:false,yaw:.38,pitch:.17,dist:4.5},cv=$('gpu'),ink=$('rive'),gl=cv.getContext('webgl2',{alpha:true,premultipliedAlpha:true});
// Embedded visibility belongs to the full host panel once its trusted message arrives.
// The local main-region observer remains the fallback for standalone playback.
let nativeCache,geometry=scenes.native,reference,primitiveRenderer,anchorKey='',anchors=[],primitiveKey='',primitivePacket;
let cloudRevision=0,cloudPass=0,cloudSample=0,sampling=false,lastSample=0,cloudOutline=[],editTimer=0,cloudPending=false,cloudTraceMs=0,cloudJob=null,pageActive=true,cloudClockMax=1,cloudTotalPhotons=0,frameAverage;
// Editing uses its own small, coherent transport sample. It never contributes
// to the independent full-budget HDR mean.
let cloudPreview=false,previewTimer=0,previewNeeded=false,lastPreview=0,previewCount=0,completedTraces=0,editPointer=null;
const previewBudget={photons:400,families:48,interval:65,settle:240};
let cameraPreview=false,cameraSettleTimer=0;
const cameraPathStride=()=>cameraPreview?Math.max(1,Math.ceil((cache?.count||0)/1000)):1;
let cache,record,runtime,renderer,file,art,nodes=[],ready=false,dirty=true,raf=0,last=0,visible=true,hostVisible=true,hostVisibilityKnown=false,used=0,draws=0,currentStrokes=[],fieldKey='',field,referenceKey='',riveKey='',referenceDraws=0,riveDraws=0;
const descriptions={cloud:['A cloud of transported light','Actual free flights · cached rotational families · finite HDR reconstruction'],hybrid:['One scene, several representations','Retained volume paths + transient surface deposits + Rive receiver relief'],primitives:['Sweep the sampled coordinates','Native-family geometry at real medium anchors · bounded biased raster port'],balls:['Finite photon balls','Retained track samples → world-radius ball kernels · biased density preview'],disks:['Transverse photon disks','Retained track samples → disks perpendicular to each path · biased kernel preview'],rings:['A pulse, swept into rings','Equal-solid-angle diffuse hemispheres · finite directional quadrature'],arcs:['A pulse, drawn as arcs','Partial ring display · finite curves, not missing specular paths'],beams:['Photon beams','Continuous path segments · exact clipping to the stored arrival interval'],points:['Points in flight','Discrete samples along the same path legs · additive Gaussian marks'],surface:['A caustic on the receiver','Recorded surface hits · finite splat kernels'],ink:['Light becomes a drawing','World-space deposit field → relief curves → official Rive shapes']};
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
let program,buffer,vao,accumulation,accumulationTexture,displayProgram,displayVao,targetWidth=0,targetHeight=0;
function initGPU(){if(!gl)throw Error('WebGL2 unavailable');if(!gl.getExtension('EXT_color_buffer_float'))throw Error('Floating-point WebGL2 color targets are needed for faint photon accumulation.');program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,`#version 300 es
in vec2 start;in vec2 end;in vec4 col;in float radius;in vec2 minor;uniform vec2 viewport;uniform bool dots;uniform highp int kernel;out vec2 vuv;out vec4 vc;out float pointMark;
void main(){vec2 corner=vec2((gl_VertexID==1||gl_VertexID==3)?1.:-1.,gl_VertexID>=2?1.:-1.);vec2 p;pointMark=(dots||length((end-start)*viewport)<.001)?1.:0.;
if(kernel>0){p=start+corner.x*(end-start)+corner.y*minor;vuv=corner;}
else if(pointMark>.5){p=start+corner*radius/viewport;vuv=corner;}
else{vec2 d=(end-start)*viewport;float len=length(d);vec2 n=len>0.?vec2(-d.y,d.x)/len:vec2(0.,1.);p=mix(start,end,(corner.x+1.)*.5)+n*corner.y*radius/viewport;vuv=corner;}
gl_Position=vec4(p,0.,1.);vc=col;}`));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`#version 300 es
precision highp float;in vec2 vuv;in vec4 vc;in float pointMark;out vec4 outColor;uniform bool dots;uniform highp int kernel;void main(){float q=pointMark>.5||kernel>0?dot(vuv,vuv):vuv.y*vuv.y;if(q>1.)discard;float profile=kernel==1?sqrt(max(0.,1.-q)):exp(-3.5*q);float a=vc.a*profile;outColor=vec4(vc.rgb*a,a);}`));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));vao=gl.createVertexArray();gl.bindVertexArray(vao);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);for(const [name,size,offset]of [['start',2,0],['end',2,8],['col',4,16],['radius',1,32],['minor',2,36]]){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,44,offset);gl.vertexAttribDivisor(loc,1);}
  // RGBA8 would round faint individual photons to zero before they can add up.
  // Accumulate linearly in half float; tone-map only the completed overlay.
  accumulation=gl.createFramebuffer();accumulationTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,accumulationTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  displayProgram=gl.createProgram();gl.attachShader(displayProgram,shader(gl.VERTEX_SHADER,`#version 300 es
  out vec2 uv;void main(){vec2 p=vec2(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.);uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`));gl.attachShader(displayProgram,shader(gl.FRAGMENT_SHADER,`#version 300 es
  precision highp float;in vec2 uv;uniform sampler2D accumulated;out vec4 color;void main(){vec3 c=texture(accumulated,uv).rgb;color=vec4(vec3(1.)-exp(-c),1.);}`));gl.linkProgram(displayProgram);if(!gl.getProgramParameter(displayProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(displayProgram));displayVao=gl.createVertexArray();frameAverage=makeFrameAverage(gl);
}
function beginAccumulation(W,H){gl.bindFramebuffer(gl.FRAMEBUFFER,accumulation);if(targetWidth!==W||targetHeight!==H){targetWidth=W;targetHeight=H;gl.bindTexture(gl.TEXTURE_2D,accumulationTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,W,H,0,gl.RGBA,gl.HALF_FLOAT,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,accumulationTexture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Photon accumulation framebuffer incomplete.');}gl.viewport(0,0,W,H);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}
function displayAccumulation(texture=accumulationTexture){gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.BLEND);gl.useProgram(displayProgram);gl.bindVertexArray(displayVao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(displayProgram,'accumulated'),0);gl.drawArrays(gl.TRIANGLES,0,3);}
function nativeActive(){return state.mode==='primitives'||state.mode==='cloud'&&$('cloud-family').value!=='beams'||state.mode==='hybrid'&&$('hybrid-primitives').checked;}
function nativeAnchors(){const count=cloudPreview||cameraPreview?Math.min(previewBudget.families,+$('anchor-count').value):+$('anchor-count').value;const key=[cloudRevision,$('scene').value,$('primitive-stage').value,$('primitive-sigma').value,count].join();if(key!==anchorKey){anchorKey=key;anchors=state.mode==='cloud'?sampledAnchors(cache,+$('primitive-stage').value,count):mediumAnchors(cache,+$('primitive-stage').value||1,+$('primitive-sigma').value,3);}return anchors;}
function detector(){return $('primitive-focus').value==='fixed'?[.7,.5,.7]:camera(state.yaw,state.pitch,state.dist,1).eye;}
function clockMax(){if(state.mode==='cloud')return cloudClockMax;if(nativeActive()){const c=camera(state.yaw,state.pitch,state.dist,1),a=nativeAnchors();return Math.max(1,...a.map(a=>a.t+(state.mode==='primitives'&&$('primitive-camera').checked?Math.hypot(...sub(detector(),a.p)):0)+2.2));}return ['rings','arcs'].includes(state.mode)?Math.max(...cache.emitters.map(e=>e.t))+2.3:cache.maxTime;}
function nativeOptions(time){const dense=state.mode==='cloud',sigma=dense?+$('sigma-s').value + +$('sigma-a').value:+$('primitive-sigma').value;return {kind:dense?$('cloud-family').value:$('primitive-kind').value,sampled:dense,albedo:sigma?+$('sigma-s').value/sigma:0,distance:+$('primitive-distance').value,mu:+$('primitive-mu').value,g:+$('primitive-g').value,sigma,kernel:dense?.008:+$('kernel-radius').value,halfWidth:time.on?time.half:0,time,cameraClock:state.mode==='primitives'&&$('primitive-camera').checked,occlusion:$('primitive-occlusion').checked,scene:geometry,focus:detector(),arrivalColors:$('palette').value==='time',clockMax:clockMax(),gain:+$('primitive-gain').value*+$('exposure').value/Math.max(1,nativeAnchors().length)};}
function fitNativeTime(){const a=nativeAnchors(),c=camera(state.yaw,state.pitch,state.dist,1);if(!a.length)return;const value=a.reduce((s,a)=>s+a.t+(state.mode==='primitives'&&$('primitive-camera').checked?Math.hypot(...sub(detector(),a.p)):0),0)/a.length+.65;$('gate').value=Math.max(0,Math.min(1000,value/clockMax()*1000));update();}
function temporal(){const zero=nativeActive()&&$('primitive-kind').value==='timeball';$('width').min=zero?'0':'10';if(!zero&&+$('width').value<10)$('width').value=10;const max=clockMax();return {on:$('gate-on').checked,center:+$('gate').value/1000*max,half:+$('width').value/2000*max};}
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
function palette(t,color){if($('palette').value==='physical')return color;const h=t/clockMax();return [.28+.72*Math.max(0,Math.cos(6*h)),.3+.7*Math.max(0,Math.cos(6*h-2)),.4+.6*Math.max(0,Math.cos(6*h-4))];}
function buildField(time){const key=[cloudRevision,$('scene').value,time.on,time.center,time.half,$('caustic').checked].join();if(key===fieldKey)return;fieldKey=key;field=buildReceivers(cache,geometry,time,$('caustic').checked);document.body.dataset.receiverFaces=field.map(f=>`${f.axis}:${f.sign}:${f.count}`).join(',');}
function render(){const rect=cv.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1),W=Math.max(1,Math.round(rect.width*dpr)),H=Math.max(1,Math.round(rect.height*dpr));if(cv.width!==W||cv.height!==H){cv.width=ink.width=$('reference').width=W;cv.height=ink.height=$('reference').height=H;}const cam=camera(state.yaw,state.pitch,state.dist,W/H),time=temporal(),width=+$('stroke').value*dpr,exposure=+$('exposure').value,only=$('caustic').checked;
  $('reference').hidden=!$('normal').checked;const nextReferenceKey=[JSON.stringify(geometry),$('scene').value,state.yaw,state.pitch,state.dist,W,H,$('sticker').checked,$('ref-brightness').value].join();if($('normal').checked&&nextReferenceKey!==referenceKey){reference.draw(cam,geometry,$('sticker').checked,+$('ref-brightness').value);referenceKey=nextReferenceKey;document.body.dataset.referenceDraws=++referenceDraws;}
  const dense=state.mode==='cloud';const isMixed=state.mode==='hybrid',hasNative=nativeActive();$('cloud-controls').hidden=!dense;$('primitive-kind').querySelector('[value=plane]').disabled=!dense;$('primitive-camera').disabled=isMixed;$('primitive-camera').title=isMixed?'Mixed layers share the source-arrival clock. Use the native sweep view for a camera-inclusive clock.':'';$('hybrid-controls').hidden=!isMixed;$('primitive-controls').hidden=!hasNative&&!dense;$('scene').querySelector('[value=diffuse]').disabled=hasNative;const isPulse=['rings','arcs'].includes(state.mode),isKernel=['balls','disks'].includes(state.mode),verts=[];let marks=0;const pointStride=Math.max(1,Math.ceil(cache.legs.length*21/60000));$('width').disabled=$('gate-on').disabled=isPulse;$('stroke').disabled=isKernel||state.mode==='primitives';$('kernel-controls').hidden=!(isKernel||hasNative&&['ring','arc'].includes($('primitive-kind').value));
  function quad(p,q,color,alpha,r,minor=[0,0]){if(!p||!q)return;verts.push(p[0],p[1],q[0],q[1],...color,alpha,r,...minor);marks++;}
  if(isPulse){for(const seg of pulseCurves(cache,time.center,state.mode==='arcs'))quad(project(seg.a,cam),project(seg.b,cam),palette(seg.t,seg.color),.14*exposure,width);
    // The incoming impulse is a short interval of actual source-to-floor legs.
    // It gives the wavefront a visible cause before the diffuse rings start.
    for(const leg of cache.legs){if(leg.t0>1e-6||leg.path%50)continue;const part=clip(leg,time.center-.025,time.center+.025);if(part)quad(project(part.a,cam),project(part.b,cam),palette(time.center,leg.color),.08*exposure,width*2);}
  }
  else if(state.mode==='surface'){for(const d of cache.deposits){if((only&&!d.glass)||(time.on&&Math.abs(d.t-time.center)>time.half))continue;const p=project(d.p,cam);quad(p,p,palette(d.t,d.color),.2*exposure,5*width);}}
  else if(isKernel){
    const radius=+$('kernel-radius').value,stride=Math.max(1,Math.ceil(cache.legs.length*5/1800));document.body.dataset.kernelStride=stride;$('kernel-value').textContent=radius.toFixed(3);
    for(const leg of cache.legs){
      if(leg.inside||leg.path%stride||(only&&!leg.glass))continue;
      const lo=time.on?Math.max(leg.t0,time.center-time.half):leg.t0,hi=time.on?Math.min(leg.t1,time.center+time.half):leg.t1;if(hi<=lo)continue;
      const direction=norm(sub(leg.b,leg.a)),u=state.mode==='balls'?cam.r:norm(cross(direction,Math.abs(direction[1])<.9?[0,1,0]:[1,0,0])),v=state.mode==='balls'?cam.u:cross(direction,u);
      const distance=Math.hypot(...sub(leg.b,leg.a))*(hi-lo)/(leg.t1-leg.t0),steps=5;
      for(let k=0;k<steps;k++){
        const phase=(leg.path*.61803398875+.5)%1,arrival=lo+(hi-lo)*(k+phase)/steps,p=mix(leg.a,leg.b,(arrival-leg.t0)/(leg.t1-leg.t0)),center=project(p,cam),major=project(add(p,mul(u,radius)),cam),minor=project(add(p,mul(v,radius)),cam);
        if(!center||!major||!minor)continue;
        // Chord-integrated ball / transverse Gaussian disk. Radius is in world
        // units; 1/r² keeps projected kernel energy stable under bandwidth edits.
        // Local affine projection and the fixed path/sample budget remain biased.
        const profileNorm=state.mode==='disks'?2.405/Math.max(.15,Math.abs(dot(direction,norm(sub(cam.eye,p))))):1;
        const weight=Math.min(3,distance/steps/.1)*.012*exposure*(.065/radius)**2*profileNorm;
        quad(center,major,palette(arrival,leg.color),weight,1,[minor[0]-center[0],minor[1]-center[1]]);
      }
    }
  }
  else if(!['ink','primitives','hybrid','cloud'].includes(state.mode)){for(const leg of cache.legs){if(state.mode==='points'&&leg.path%pointStride)continue;if(leg.inside||(only&&!leg.glass))continue;const part=time.on?clip(leg,time.center-time.half,time.center+time.half):leg;if(!part)continue;
    if(state.mode==='beams')quad(project(part.a,cam),project(part.b,cam),palette((leg.t0+leg.t1)/2,leg.color),($('scene').value==='relay'?.003:.025)*exposure,width);
    else{const steps=20;for(let k=0;k<=steps;k++){const t=k/steps,arrival=leg.t0+(leg.t1-leg.t0)*t;if(time.on&&Math.abs(arrival-time.center)>time.half)continue;const p=project(mix(leg.a,leg.b,t),cam);quad(p,p,palette(arrival,leg.color),.085*exposure,2*width);}}
  }}
  if(dense){
    const normalization=6000/cache.count,sigmaS=+$('sigma-s').value,sigmaT=sigmaS + +$('sigma-a').value,g=+$('primitive-g').value,rendered=$('cloud-rendered').checked,stride=cameraPathStride();
    if($('cloud-beams').checked||$('cloud-family').value==='beams')for(const leg of cache.legs){
      if(leg.path%stride||leg.inside||(only&&!leg.glass))continue;const part=time.on?clip(leg,time.center-time.half,time.center+time.half):leg;if(!part)continue;
      const q=mul(add(part.a,part.b),.5),eye=norm(sub(cam.eye,q)),direction=norm(sub(leg.b,leg.a)),phase=(1-g*g)/Math.pow(Math.max(.01,1+g*g-2*g*dot(direction,eye)),1.5),eyeDistance=Math.min(3,Math.hypot(...sub(cam.eye,q)));
      quad(project(part.a,cam),project(part.b,cam),palette((leg.t0+leg.t1)/2,leg.color),stride*normalization*exposure*(rendered?.04*sigmaS*phase*Math.exp(-sigmaT*eyeDistance):.003),width*(rendered?1.5:1));
    }
    if($('cloud-surface').checked)for(const d of cache.deposits){if(time.on&&Math.abs(d.t-time.center)>time.half)continue;const q=project(d.p,cam);quad(q,q,palette(d.t,d.color),.018*exposure*normalization,width*3);}
    if($('cloud-outline').checked)for(const l of cloudOutline)quad(project(l.a,cam),project(l.b,cam),[1,.78,.4],.5,width*.7);
  }
  if(isMixed){
    if($('hybrid-beams').checked||$('hybrid-points').checked)for(const leg of cache.legs){if(leg.inside||(only&&!leg.glass))continue;const part=time.on?clip(leg,time.center-time.half,time.center+time.half):leg;if(!part)continue;if($('hybrid-beams').checked)quad(project(part.a,cam),project(part.b,cam),palette((leg.t0+leg.t1)/2,leg.color),.0025*exposure,width);if($('hybrid-points').checked&&leg.path%24===0)for(let i=0;i<8;i++){const q=project(mix(part.a,part.b,i/7),cam);quad(q,q,palette((leg.t0+leg.t1)/2,leg.color),.06*exposure,width*2);}}
    if($('hybrid-surface').checked)for(const d of cache.deposits){if((only&&!d.glass)||(time.on&&Math.abs(d.t-time.center)>time.half))continue;const q=project(d.p,cam);quad(q,q,palette(d.t,d.color),.006*exposure,width*3);}
  }
  let nativeSettings;
  if(hasNative){$('primitive-distance').disabled=$('primitive-kind').value==='timeball';$('primitive-mu').disabled=!['ring','cone'].includes($('primitive-kind').value);if($('primitive-kind').value==='timeball'){$('gate-on').checked=true;$('gate-on').disabled=true;time.on=true;}nativeSettings=nativeOptions(time);const k=nativeSettings.kind;const key=[anchorKey,k,nativeSettings.sampled,nativeSettings.distance,nativeSettings.mu,nativeSettings.g,nativeSettings.sigma,nativeSettings.kernel,nativeSettings.cameraClock,...nativeSettings.focus,nativeSettings.occlusion,...(['ring','arc','timeball'].includes(k)?[state.yaw,state.pitch,state.dist,time.on,time.center,time.half]:[])].join();if(key!==primitiveKey){primitiveKey=key;primitivePacket=primitiveGeometry(nativeAnchors(),nativeSettings,cam);}if(dense&&!$('cloud-rendered').checked){const data=primitivePacket.triangles;for(let i=0;i<data.length;i+=54*4){const a=Array.from(data.subarray(i,i+3)),b=Array.from(data.subarray(i+18,i+21));if(a.some((v,j)=>Math.abs(v)>geometry.bounds[j])||b.some((v,j)=>Math.abs(v)>geometry.bounds[j]))continue;const ta=data[i+15]+data[i+17],tb=data[i+33]+data[i+35];if(time.on&&(Math.max(ta,tb)<time.center-time.half||Math.min(ta,tb)>time.center+time.half))continue;quad(project(a,cam),project(b,cam),[1,.72,.33],.055,width*.6);}}for(const l of primitivePacket.lines){const a=project(l.a,cam),b=project(l.b,cam);if(a&&b)quad(a,b,$('palette').value==='physical'?l.color:palette(l.t,l.color).map(c=>c*l.color.reduce((a,b)=>a+b,0)/3),dense&&!$('cloud-rendered').checked?.035:Math.min(2,l.power*nativeSettings.gain*(dense?nativeSettings.albedo:nativeSettings.sigma)),l.kernel*H/Math.tan(.5)/((a[2]+b[2])*.5));}document.body.dataset.primitiveTriangles=primitivePacket.triangles.length/54;document.body.dataset.primitiveLines=primitivePacket.lines.length;document.body.dataset.primitiveAnchors=anchors.length;$('primitive-status').textContent=anchors.length?`${anchors.length} medium anchors · ${k==='arc'?'polar meridians':k==='ring'?'azimuth circles':k==='timeball'?(nativeSettings.cameraClock?'camera-clock ellipsoid':'source-clock sphere')+' · '+(time.half===0?'delta gate':'finite band'):k} · regularized Jacobian`:'No eligible medium anchors in this scene/stage.';}
  beginAccumulation(W,H);gl.useProgram(program);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(verts),gl.STREAM_DRAW);gl.uniform1i(gl.getUniformLocation(program,'dots'),!['beams','hybrid','primitives','cloud'].includes(state.mode)&&!isPulse);gl.uniform1i(gl.getUniformLocation(program,'kernel'),state.mode==='balls'?1:state.mode==='disks'?2:0);gl.uniform2f(gl.getUniformLocation(program,'viewport'),W,H);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,verts.length/11);if(hasNative&&primitivePacket.triangles.length&&(!dense||$('cloud-rendered').checked))primitiveRenderer.draw(primitivePacket,cam,geometry,nativeSettings);let photonImage=accumulationTexture;
  if(dense&&(cloudPreview||cameraPreview)){cloudPass=0;}
  else if(dense&&$('sampling').value==='progressive'){
    const viewKey=JSON.stringify([W,H,state.yaw,state.pitch,state.dist,clockMax(),[...document.querySelectorAll('input,select')].filter(e=>e.id!=='sampling').map(e=>[e.id,e.type==='checkbox'?e.checked:e.value])]);
    photonImage=frameAverage.add(accumulationTexture,W,H,viewKey,cloudRevision);
    cloudPass=frameAverage.count;
  }else if(dense){frameAverage.reset();cloudPass=1;}
  displayAccumulation(photonImage);
  const nextRiveKey=[cloudRevision,$('scene').value,state.yaw,state.pitch,state.dist,W,H,$('context').checked,hasNative?[anchorKey,nativeSettings.cameraClock,$('primitive-focus').value].join():'', (state.mode==='ink'||isMixed&&$('hybrid-relief').checked)?[time.on,time.center,time.half,only,width,exposure].join(): 'guides'].join();
  if(nextRiveKey!==riveKey){
  const strokes=[];function line(a,b,w,color=1){const p=project(a,cam),q=project(b,cam);if(p&&q)strokes.push({a:[(p[0]+1)*500,(1-p[1])*350],b:[(q[0]+1)*500,(1-q[1])*350],w,color});}
  if(hasNative&&!dense){for(const a of anchors){const n=.035;line(add(a.p,[-n,0,0]),add(a.p,[n,0,0]),1.2,0);line(add(a.p,[0,-n,0]),add(a.p,[0,n,0]),1.2,0);}if(nativeSettings.cameraClock&&$('primitive-focus').value==='fixed'){const p=detector(),n=.06;line(add(p,[-n,0,0]),add(p,[n,0,0]),2,2);line(add(p,[0,-n,0]),add(p,[0,n,0]),2,2);}}
  if($('context').checked)for(const g of sceneGuides(geometry))line(g.a,g.b,.42);
  if(state.mode==='ink'||isMixed&&$('hybrid-relief').checked){buildField(time);for(const s of receiverLines(field,geometry,exposure,width/dpr/1.3))line(s.a,s.b,s.w,s.color);}
  currentStrokes=[];const counts=[0,0,0,0],newUsed=new Set();for(const s of strokes){if(counts[s.color]>=nodes.length/4){const spare=counts.findIndex(n=>n<nodes.length/4);if(spare<0)break;s.color=spare;}const k=counts[s.color]++*4+s.color;const n=nodes[k],dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1];n.x=s.a[0];n.y=s.a[1];n.rotation=Math.atan2(dy,dx);n.scaleX=Math.hypot(dx,dy);n.scaleY=s.w;newUsed.add(k);currentStrokes.push({...s,pool:k});}for(let i=0;i<nodes.length;i++)if(!newUsed.has(i)){nodes[i].scaleX=0;nodes[i].scaleY=0;}
  renderer.clear();renderer.save();renderer.align(runtime.Fit.fill,runtime.Alignment.center,{minX:0,minY:0,maxX:W,maxY:H},{minX:0,minY:0,maxX:1000,maxY:700});art.advance(0);art.draw(renderer);renderer.restore();renderer.flush();used=newUsed.size;riveKey=nextRiveKey;document.body.dataset.riveDraws=++riveDraws;
  }
  $('time').textContent=time.center.toFixed(2);$('stats').textContent=`${marks.toLocaleString()} GPU marks · ${used} Rive strokes${state.mode==='points'&&pointStride>1?' · point preview uses 1/'+pointStride+' paths':isKernel?' · finite kernels use 1/'+document.body.dataset.kernelStride+' paths':''}`;$('mode-title').textContent=descriptions[state.mode][0];$('mode-description').textContent=descriptions[state.mode][1];document.body.dataset.frames=String(++draws);document.body.dataset.marks=marks;document.body.dataset.strokes=used;document.body.dataset.mode=state.mode;document.body.dataset.yaw=state.yaw;document.body.dataset.scene=$('scene').value;document.body.dataset.clockMax=clockMax();document.body.dataset.cacheRevision=cloudRevision;document.body.dataset.photonCount=cache.count;document.body.dataset.mediumCollisions=cache.collisionCount||0;document.body.dataset.mediumOrders=JSON.stringify(cache.orderCounts||[]);document.body.dataset.accumulatedPasses=cloudPass;document.body.dataset.accumulatedPhotons=cloudPass*(cache?.count||0);document.body.dataset.totalTracedPhotons=cloudTotalPhotons;document.body.dataset.envelopeLines=cloudOutline.length;document.body.dataset.cacheSeed=cache.seed||0;samplingStatus();dirty=false;
}
function activeView(){return ready&&pageActive&&(hostVisibilityKnown||visible)&&hostVisible&&!document.hidden;}
function wake(){if(activeView()&&!raf)raf=runtime.requestAnimationFrame(tick);}
function tick(t){raf=0;if(!activeView()){last=0;return;}if(state.mode==='cloud'&&sampling&&!cameraPreview&&!cloudPending&&t-lastSample>450){lastSample=t;queueCloudTrace({accumulate:$('sampling').value==='progressive'});}if(state.playing){const dt=last?Math.min(.05,(t-last)/1000):0;$('gate').value=(+$('gate').value+dt*95)%1000;dirty=true;}last=t;if(dirty)render();if(state.playing||sampling)wake();}
function update(){dirty=true;wake();}
for(const el of document.querySelectorAll('input,select'))el.addEventListener('input',update);
function sceneEdit(){return {object:+$('edit-object').value,x:+$('edit-x').value,y:+$('edit-y').value,z:+$('edit-z').value,scale:+$('edit-scale').value,ior:+$('edit-ior').value,material:$('edit-material').value,lightX:+$('light-x').value,lightY:+$('light-y').value,lightPower:+$('light-power').value,spread:+$('light-spread').value};}
function samplingStatus(){
 const progressive=$('sampling').value==='progressive',resample=$('sampling').value==='resample',active=state.mode==='cloud';
 const preview=cloudPreview&&cloudPending&&activeView();
 const suspended=sampling&&!activeView();
 const orbiting=cameraPreview&&active;
 const phase=orbiting?'camera-preview':preview?'preview':cloudPending?'standby':suspended?'suspended':sampling?'sampling':progressive?'paused':'cached';
 document.body.dataset.samplingState=phase;document.body.dataset.activeView=String(activeView());
 document.body.dataset.preview=String(cloudPreview);document.body.dataset.cameraPreview=String(cameraPreview);document.body.dataset.previewTraces=previewCount;
 const families=active&&cache?.collisions?nativeAnchors().length:0;
 const batch=`${(cache?.count||0).toLocaleString()} photons + ${families.toLocaleString()} families / batch`;
 const lead=orbiting?`Camera preview · ${families} families · 1/${cameraPathStride()} of beam paths · same retained photons · full quality on release`:preview?`Live preview · ${previewBudget.photons} photons · ${editPointer!==null?'release to refine':'Standby · full-budget refinement follows'}`:cloudPending?(activeView()?'Standby · tracing the requested settings…':'Standby · waiting for the view to resume'):suspended?'Sampling suspended · resumes when this view is visible':sampling?(resample?'Resampling · replacing the current pass':'Accumulating · linear HDR running mean'):progressive?'Accumulation paused':resample?'Resampling paused':'Cached transport ready';
 const history=progressive&&!preview&&!orbiting?`${cloudPass.toLocaleString()} averaged passes · ${(cloudPass*(cache?.count||0)).toLocaleString()} emitted photons · `:'';
 $('sample-status').textContent=`${lead} · ${history}${batch}${cloudTraceMs?' · last trace '+cloudTraceMs+' ms':''}`;
 $('sampling-indicator').hidden=!active;$('sampling-indicator').textContent=orbiting?`Camera preview · ${families} families · 1/${cameraPathStride()} beam paths · same photons · full quality on release`:preview?`Live preview · ${previewBudget.photons} photons · full quality ${editPointer!==null?'on release':'next'}`:cloudPending?'Standby · updating transport…':suspended?'Sampling suspended · waiting for the view':`${progressive?'HDR average · '+cloudPass.toLocaleString()+' passes':resample?'Resampled pass':'Cached pass'} · ${families.toLocaleString()} families / batch`;
 $('sampling-indicator').dataset.state=phase;
 // There is no completion fraction: sample storage is bounded per batch, not
 // across the observation. The counter keeps growing until the user pauses.
 $('sample-progress').hidden=true;
 $('sample-once').disabled=cloudPending;$('sample-once').textContent=progressive?'Add one pass':'New sample';
 $('sample-play').disabled=$('sampling').value==='cached';$('sample-play').textContent=sampling?'Pause sampling':'Start sampling';
 $('cloud-controls').setAttribute('aria-busy',String(cloudPending));
}
function stopCloudPreview(){clearTimeout(previewTimer);previewTimer=0;previewNeeded=false;editPointer=null;}
function requestCloudEdit(){
 if(state.mode!=='cloud')return;
 const resume=cloudJob?.editing?cloudJob.resume:sampling;
 clearTimeout(editTimer);editTimer=0;
 cloudJob={reset:true,resume,editing:true,notBefore:performance.now()+previewBudget.settle};
 cloudPending=true;cloudPreview=true;previewNeeded=true;sampling=resume;
 frameAverage.reset();cloudPass=0;
 $('sigma-s-out').value=+$('sigma-s').value;$('sigma-a-out').value=+$('sigma-a').value;$('orders-out').value=$('scatter-orders').value;
 samplingStatus();scheduleCloudPreview();scheduleCloudTrace();
}
function scheduleCloudPreview(){
 if(previewTimer||!previewNeeded||!activeView()||!cloudJob?.editing)return;
 previewTimer=setTimeout(()=>{
  previewTimer=0;if(!previewNeeded||!activeView()||!cloudJob?.editing)return;
  previewNeeded=false;
  try{
   geometry=editableScene($('scene').value,sceneEdit());
   // A fixed preview seed makes small edits coherent. Only full production
   // passes advance the independent sampling sequence and emitted total.
   cache=traceMedium(geometry,{count:previewBudget.photons,sigmaS:+$('sigma-s').value,sigmaA:+$('sigma-a').value,g:+$('primitive-g').value,orders:+$('scatter-orders').value,seed:92731});
   cloudOutline=$('cloud-outline').checked?causticEnvelope(geometry,12,24):[];
   cloudRevision++;previewCount++;anchorKey=primitiveKey=fieldKey='';
   document.body.dataset.previewGeometry=JSON.stringify(geometry.spheres);
   lastPreview=performance.now();samplingStatus();update();
  }catch(e){cancelCloudTrace();sampling=false;$('error').hidden=false;$('error').textContent=e.message;}
 },Math.max(16,previewBudget.interval-(performance.now()-lastPreview)));
}
function finishCloudEdit(){
 editPointer=null;
 if(!cloudJob?.editing)return;
 clearTimeout(previewTimer);previewTimer=0;previewNeeded=false;
 cloudJob.notBefore=performance.now();samplingStatus();scheduleCloudTrace();
}
function queueCloudTrace({reset=false,accumulate=false,resume=sampling,delay=35}={}){
 stopCloudPreview();
 clearTimeout(editTimer);editTimer=0;cloudJob={reset,accumulate,resume,notBefore:performance.now()+delay};cloudPending=true;sampling=resume;samplingStatus();scheduleCloudTrace();
}
function cancelCloudTrace(){stopCloudPreview();clearTimeout(editTimer);editTimer=0;cloudJob=null;cloudPending=false;clearTimeout(cameraSettleTimer);cameraSettleTimer=0;cameraPreview=false;}
function scheduleCloudTrace(){
 clearTimeout(editTimer);editTimer=0;
 if(!cloudJob||!activeView()||cameraPreview||cloudJob.editing&&editPointer!==null)return;
 const job=cloudJob;
 // Paint Standby before the bounded CPU trace starts. Repeated edits coalesce;
 // suspension retains the latest job, while scene/mode changes discard it.
 editTimer=setTimeout(()=>{editTimer=0;if(cloudJob!==job||!activeView()||cameraPreview)return;if(state.mode!=='cloud'){cancelCloudTrace();return;}cloudJob=null;try{if(job.reset)resetCloud();else rebuildCloud(job.accumulate);sampling=job.resume;}catch(e){sampling=false;$('error').hidden=false;$('error').textContent=e.message;}finally{cloudPending=false;lastSample=performance.now();samplingStatus();update();}},Math.max(35,job.notBefore-performance.now()));
}
function viewActivityChanged(){
 last=0;if(!activeView()){clearTimeout(previewTimer);previewTimer=0;editPointer=null;drag=null;finishCameraPreview();}else scheduleCloudPreview();scheduleCloudTrace();
 if(!activeView()&&raf){runtime.cancelAnimationFrame(raf);raf=0;}
 if(ready)samplingStatus();wake();
}
function rebuildCloud(accumulate=false){
 if(state.mode!=='cloud')return;
 const started=performance.now(),next=traceMedium(geometry,{count:+$('photon-count').value,sigmaS:+$('sigma-s').value,sigmaA:+$('sigma-a').value,g:+$('primitive-g').value,orders:+$('scatter-orders').value,seed:92731+cloudSample++*17041});
 cache=next;cloudPreview=false;cloudTotalPhotons+=next.count;if(!accumulate){frameAverage.reset();cloudPass=0;cloudClockMax=Math.max(1,next.maxTime);}cloudRevision++;anchorKey=primitiveKey=fieldKey='';
 document.body.dataset.completedTraces=++completedTraces;
 $('sigma-s-out').value=+$('sigma-s').value;$('sigma-a-out').value=+$('sigma-a').value;$('orders-out').value=$('scatter-orders').value;
 cloudTraceMs=Math.round(performance.now()-started);
 $('source').textContent=`Browser physical-scatter port · σs=${cache.medium.sigmaS}, σa=${cache.medium.sigmaA}, HG g=${cache.medium.g}. Actual weighted free-flight collisions and changing directions; ${cache.lensCounts.join(' / ')} completed lens crossings. Cached optical-length gates select the same retained paths. Glass uses Fresnel-weighted transmission; TIR is retained.`;
 $('download').textContent='Download current transport batch';samplingStatus();update();
}
function resetCloud(){cancelCloudTrace();sampling=false;cloudPass=cloudSample=cloudTotalPhotons=0;frameAverage.reset();geometry=editableScene($('scene').value,sceneEdit());cloudOutline=causticEnvelope(geometry);rebuildCloud(false);}
function startCloud(key='relay'){state.mode='cloud';$('primitive-kind').value='ring';state.playing=false;$('play').textContent='Play time';$('scene').value=key;$('primitive-stage').value='0';$('normal').checked=true;$('ref-brightness').value=.1;$('sticker').checked=false;$('gate-on').checked=false;$('caustic').checked=false;$('palette').value='physical';$('primitive-g').value=.45;$('primitive-gain').value=220;$('stroke').value=1.3;$('kernel-radius').value=.015;selectScene();setPresetButtons();}
for(const id of ['sigma-s','sigma-a','scatter-orders','edit-x','edit-y','edit-z','edit-scale','edit-ior','light-x','light-y','light-power','light-spread','primitive-g']){
 const control=$(id);
 control.addEventListener('pointerdown',e=>{if(state.mode==='cloud')editPointer=e.pointerId;});
 control.addEventListener('input',requestCloudEdit);
 control.addEventListener('change',finishCloudEdit);
}
for(const event of ['pointerup','pointercancel'])window.addEventListener(event,e=>{if(editPointer===e.pointerId)finishCloudEdit();});
window.addEventListener('blur',finishCloudEdit);
for(const id of ['photon-count','edit-material'])$(id).addEventListener('input',()=>{if(state.mode==='cloud')queueCloudTrace({reset:true,delay:70});});
$('edit-object').addEventListener('change',()=>{for(const id of ['edit-x','edit-y','edit-z'])$(id).value=0;$('edit-scale').value=1;queueCloudTrace({reset:true,resume:false});});
$('edit-reset').onclick=()=>{for(const id of ['edit-x','edit-y','edit-z','light-x','light-y'])$(id).value=0;$('edit-scale').value=$('light-power').value=1;$('edit-ior').value=1.5;$('light-spread').value=22;$('edit-material').value='glass';queueCloudTrace({reset:true,resume:false});};
$('cloud-family').onchange=()=>{primitiveKey='';update();};
$('sampling').onchange=()=>{if(state.mode==='cloud')queueCloudTrace({reset:true,resume:$('sampling').value!=='cached'});};
$('sample-once').onclick=()=>queueCloudTrace({accumulate:$('sampling').value==='progressive',resume:false});
$('sample-play').onclick=()=>{if($('sampling').value==='cached')return;sampling=!sampling;if(cloudJob?.editing)cloudJob.resume=sampling;else if(cloudPending&&!sampling)cancelCloudTrace();lastSample=performance.now();samplingStatus();update();};
function selectScene({defer=false}={}){cancelCloudTrace();sampling=false;const key=$('scene').value;geometry=scenes[key];for(const o of $('edit-object').options)o.disabled=+o.value>=geometry.spheres.length;if(+$('edit-object').value>=geometry.spheres.length)$('edit-object').value=0;for(const o of $('primitive-stage').options)o.disabled=state.mode==='cloud'?key!=='relay'&&+o.value>1:key!=='relay'&&o.value!=='1';if(state.mode!=='cloud'&&$('primitive-stage').value==='0')$('primitive-stage').value='1';if(key!=='relay')$('primitive-stage').value=state.mode==='cloud'?'0':'1';if(state.mode==='cloud'){if(defer)queueCloudTrace({reset:true,resume:false});else resetCloud();state.dist=key==='relay'?4.4:4.2;state.yaw=key==='relay'?-.25:.2;state.pitch=.19;return;}cache=key==='native'?nativeCache:traceScene(key);state.dist=key==='relay'?5.15:5;$('palette').value=key==='native'?'physical':'time';state.pitch=.17;state.yaw=key==='relay'?-.25:.20;fieldKey='';anchorKey='';primitiveKey='';$('caustic').checked=key!=='diffuse';$('caustic').disabled=key==='diffuse';$('download').textContent=key==='native'?'Download native photon record':'Download traced path cache';$('source').textContent=key==='native'?`Native RIVXP1: ${cache.count} photons; stored ${cache.scene.optical?'optical':'geometric'} path-length clock.`:`Browser analytic port: ${cache.count} photons; optical path length Σnℓ. ${key==='relay'?'Native RelayLab geometry: transmitted through lens 1/2/3: '+cache.lensCounts.join(' / ')+'. Fresnel-weighted transmitted branches and mirror relays; reflected glass branches omitted.':'Lambertian floor scatter, then diffuse wall bounces. Pulse rings use selected floor events and equal-solid-angle quadrature; no delta surfaces.'}`;update();}
$('scene').addEventListener('change',()=>{if(['rings','arcs'].includes(state.mode)&&$('scene').value!=='diffuse'){state.mode='beams';setPresetButtons();}selectScene({defer:true});});
function setPresetButtons(){document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===state.mode));const pulse=['rings','arcs'].includes(state.mode);$('width').disabled=pulse;$('gate-on').disabled=pulse;if(pulse)$('gate-on').checked=true;$('width').title=pulse?'Pulse rings show a thin wavefront. Width applies to the finite beam/point gate.':'';}
for(const el of document.querySelectorAll('[data-preset]'))el.onclick=()=>{cancelCloudTrace();sampling=false;if(el.dataset.preset==='cloud'){startCloud();return;}state.mode=el.dataset.preset;if(['hybrid','primitives'].includes(state.mode)){$('scene').value='relay';selectScene();$('normal').checked=true;$('ref-brightness').value=.35;$('gate-on').checked=false;$('width').value=60;$('kernel-radius').value=.015;fitNativeTime();}if(['rings','arcs'].includes(state.mode)){$('scene').value='diffuse';selectScene();$('gate-on').checked=true;$('gate').value=630;$('normal').checked=false;$('exposure').value=2;$('stroke').value=2;state.playing=!matchMedia('(prefers-reduced-motion:reduce)').matches;$('play').textContent=state.playing?'Pause time':'Play time';}setPresetButtons();update();};
$('primitive-fit').onclick=fitNativeTime;for(const id of ['primitive-kind','primitive-stage','primitive-camera','primitive-focus'])$(id).addEventListener('change',()=>{if($('primitive-kind').value==='timeball'){$('gate-on').checked=true;$('width').value=0;$('primitive-gain').value=$('primitive-camera').checked?650:60;}else if(+$('width').value===0){$('width').value=60;$('gate-on').checked=false;}fitNativeTime();});
$('play').onclick=()=>{state.playing=!state.playing;$('gate-on').checked=true;$('play').textContent=state.playing?'Pause time':'Play time';last=0;update();};
// The transport batch remains intact while orbiting. Only the expensive swept
// family display is sampled more sparsely; these preview images never enter
// the HDR mean. Trace jobs wait for the camera to settle instead of blocking it.
function beginCameraPreview(held=false){
 if(state.mode!=='cloud')return;
 if(!cameraPreview){cameraPreview=true;anchorKey=primitiveKey='';frameAverage.reset();cloudPass=0;}
 clearTimeout(editTimer);editTimer=0;clearTimeout(cameraSettleTimer);cameraSettleTimer=0;
 if(!held)cameraSettleTimer=setTimeout(finishCameraPreview,180);
}
function finishCameraPreview(){
 clearTimeout(cameraSettleTimer);cameraSettleTimer=0;
 if(!cameraPreview)return;
 cameraPreview=false;anchorKey=primitiveKey='';lastSample=performance.now();
 scheduleCloudTrace();update();
}
let drag=null;
cv.onpointerdown=e=>{drag=[e.clientX,e.clientY];cv.setPointerCapture(e.pointerId);};
cv.onpointermove=e=>{if(!drag)return;beginCameraPreview(true);state.yaw-=(e.clientX-drag[0])*.005;state.pitch=Math.max(-1.2,Math.min(1.2,state.pitch+(e.clientY-drag[1])*.005));drag=[e.clientX,e.clientY];update();};
cv.onpointerup=cv.onpointercancel=cv.onlostpointercapture=()=>{drag=null;finishCameraPreview();};
cv.onwheel=e=>{e.preventDefault();beginCameraPreview();state.dist=Math.max(2,Math.min(9,state.dist*Math.exp(e.deltaY*.001)));update();};
cv.onkeydown=e=>{if(e.key.startsWith('Arrow')){e.preventDefault();beginCameraPreview();state.yaw+=(e.key==='ArrowRight'?.12:e.key==='ArrowLeft'?-.12:0);update();}};
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('portable').onclick=async()=>{const button=$('portable');button.disabled=true;button.textContent='Packaging runtime + paths…';try{const inputs={};for(const e of document.querySelectorAll('input,select'))inputs[e.id]=e.type==='checkbox'?e.checked:e.value;const html=await portableHtml({state:{...state,playing:false},inputs,scattering:state.mode==='cloud'?{sample:cloudSample,passes:cloudPass,history:'restart-frame-average',clockMax:cloudClockMax,sampling}:null});download(new Blob([html],{type:'text/html'}),'rivx-photon-studio.html');button.textContent='Exported · standalone HTML';}catch(e){button.textContent='Export failed';$('error').hidden=false;$('error').textContent=e.message;}finally{button.disabled=false;}};
$('download').onclick=()=>{if($('scene').value==='native'&&state.mode!=='cloud')download(new Blob([record]),'native-caustic-photons.rivx');else download(new Blob([JSON.stringify({format:'rivx-browser-path-cache-v1',scene:$('scene').value,scope:state.mode==='cloud'?'current bounded transport batch; framebuffer average is not path history':'retained transport cache',...cache})],{type:'application/json'}),$('scene').value+'-optical-path-cache.json');};
$('rive-export').onclick=()=>{if(dirty)render();download(new Blob([encodeRiveInk(currentStrokes)],{type:'application/octet-stream'}),'scene-derived-ink.riv');};
$('svg').onclick=()=>{const colors=['#d9ca91','#77b8b3','#c7e4db','#83a5df'];download(new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="#091218"/>`+currentStrokes.map(s=>`<path d="M${s.a.join(' ')}L${s.b.join(' ')}" fill="none" stroke="${colors[s.color]}" stroke-width="${s.w}"/>`).join('')+'</svg>'],{type:'image/svg+xml'}),'scene-derived-ink.svg');};
new ResizeObserver(update).observe(cv);new IntersectionObserver(e=>{visible=e[0].isIntersecting;viewActivityChanged();}).observe(document.querySelector('main'));document.addEventListener('visibilitychange',viewActivityChanged);window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='portfolio-lab-visibility'){hostVisibilityKnown=true;hostVisible=e.data.visible;viewActivityChanged();}});
document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===state.mode));
const controls=[...document.querySelectorAll('input,select,button')];controls.forEach(e=>e.disabled=true);
(async()=>{initGPU();primitiveRenderer=makePrimitiveRenderer(gl);reference=makeReference($('reference'));const response=await fetch('./native-caustic.rivx.gz');if(!response.ok)throw Error('Native cache missing');record=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();nativeCache=cache=decode(record);cache.geometry=geometry;runtime=await Rive({locateFile:()=>new URL('../vector-replay/vendor/rive.wasm',import.meta.url).href});renderer=runtime.makeRenderer(ink);file=await runtime.load(new Uint8Array(await(await fetch('./ink-pool.riv')).arrayBuffer()));art=file.defaultArtboard();nodes=Array.from({length:2048},(_,i)=>art.node('ink'+i));if(nodes.some(n=>!n))throw Error('Rive ink pool incomplete');$('source').textContent=`Source: native RIVXP1 · ${cache.count.toLocaleString()} photons, ${cache.legs.length.toLocaleString()} path segments; ${cache.glassPaths.toLocaleString()} paths transmit through the sphere. ${cache.scene.optical?'Optical':'Geometric'} stored path-length clock, in native scene units. ${cache.lights} recorded emitter; the artistic time palette adds no lights.`;ready=true;controls.forEach(e=>e.disabled=false);$('loading').hidden=true;const initial=new URLSearchParams(location.search).get('scene');if(initial&&scenes[initial]){$('scene').value=initial;selectScene();}if(state.mode==='cloud')startCloud(initial&&scenes[initial]?initial:'relay');if(['rings','arcs'].includes(state.mode)){$('scene').value='diffuse';selectScene();$('gate-on').checked=true;$('gate').value=630;$('palette').value='time';$('exposure').value=2;$('stroke').value=2;}if(['hybrid','primitives'].includes(state.mode)){$('kernel-radius').value=.015;if($('scene').value!=='relay'){$('scene').value='relay';selectScene();}$('normal').checked=true;$('ref-brightness').value=.35;const kind=new URLSearchParams(location.search).get('primitive');if(['ring','arc','sphere','cone','solid','timeball'].includes(kind))$('primitive-kind').value=kind;if(kind==='timeball'){$('primitive-gain').value=new URLSearchParams(location.search).get('clock')==='camera'?650:60;$('gate-on').checked=true;$('width').value=0;$('primitive-camera').checked=new URLSearchParams(location.search).get('clock')==='camera';}fitNativeTime();}if(window.__photonBundle?.snapshot){const saved=window.__photonBundle.snapshot;Object.assign(state,saved.state);for(const [id,value]of Object.entries(saved.inputs)){const e=$(id);if(!e)continue;if(e.type==='checkbox')e.checked=value;else e.value=value;}selectScene();for(const [id,value]of Object.entries(saved.inputs)){const e=$(id);if(!e)continue;if(e.type==='checkbox')e.checked=value;else e.value=value;}Object.assign(state,saved.state);if(state.mode==='cloud'&&saved.scattering){cloudPass=0;cloudSample=Math.max(0,saved.scattering.sample-1);rebuildCloud(false);if(Number.isFinite(saved.scattering.clockMax)&&saved.scattering.clockMax>0)cloudClockMax=saved.scattering.clockMax;sampling=!!saved.scattering.sampling&&$('sampling').value!=='cached';}setPresetButtons();}render();if(parent!==window&&location.origin!=='null')parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);})().catch(e=>{$('error').hidden=false;$('error').textContent=e.message;$('loading').hidden=true;console.error(e);});
window.addEventListener('pagehide',e=>{pageActive=false;editPointer=null;drag=null;finishCameraPreview();clearTimeout(previewTimer);previewTimer=0;clearTimeout(editTimer);editTimer=0;if(raf)runtime.cancelAnimationFrame(raf);raf=0;if(!e.persisted){cancelCloudTrace();ready=false;art?.delete();file?.delete();renderer?.delete();reference?.dispose();primitiveRenderer?.dispose();frameAverage?.dispose();}});

window.addEventListener("pageshow",()=>{pageActive=true;dirty=true;viewActivityChanged();});

// Read-only linear pixel evidence used by the focused browser regression.
window.__photonStudio={readAverage:()=>frameAverage.sample(accumulation),getState:()=>({passes:cloudPass,batchPhotons:cache?.count,retainedLegs:cache?.legs.length,retainedFamilies:anchors.length,totalTracedPhotons:cloudTotalPhotons,sampling,revision:cloudRevision,preview:cloudPreview,cameraPreview,cameraPathStride:cameraPathStride(),previewCount,completedTraces,averageCount:frameAverage.count,scene:geometry,medium:cache?.medium})};
