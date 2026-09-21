import * as THREE from 'three';
import {BeautyPass,makeGlassMaterial} from '../hourglass/beauty.js';
import {binWeights} from './model.js';

const sheetVertex=`attribute vec3 tint,travel;attribute float optical,air,density;varying vec3 color,world,normalWorld,direction;varying float lengthOptical,airDistance,flux;
void main(){color=tint;world=position;normalWorld=normal;direction=travel;lengthOptical=optical;airDistance=air;flux=density;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const sheetFragment=`uniform float center,width,enabled;varying vec3 color,world,normalWorld,direction;varying float lengthOptical,airDistance,flux;
void main(){vec3 view=normalize(cameraPosition-world);float g=.18,phase=(1.-g*g)/(12.56637*pow(max(.01,1.+g*g-2.*g*dot(direction,view)),1.5));
float w=enabled>.5?exp(-.5*pow((lengthOptical-center)/max(.004,width*.5),2.)):1.;float J=max(abs(dot(normalWorld,view)),.14);
float light=min(flux,40.)*(1.-exp(-.1*.1))/.1*.9*phase/J*120.*exp(-.1*(airDistance+length(cameraPosition-world)))*w*1.3;
gl_FragColor=vec4(color*light,1.);}`;

export function makeScene(canvas,model){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor(0x081015);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(43,1,.08,100);camera.position.set(7,4.6,9);camera.lookAt(0,2.5,0);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(28,28),new THREE.MeshBasicMaterial({color:0x13252b}));floor.rotation.x=-Math.PI/2;scene.add(floor);
 const grid=new THREE.GridHelper(20,40,0x28454a,0x152a32);grid.position.y=.002;scene.add(grid);
 const uniforms={center:{value:7.35},width:{value:.5},enabled:{value:1}},geometry=new THREE.BufferGeometry(),data=model.sheet;
 for(const [name,key,size]of[['position','position',3],['normal','normal',3],['tint','color',3],['travel','direction',3],['optical','optical',1],['air','air',1],['density','density',1]])geometry.setAttribute(name,new THREE.BufferAttribute(data[key],size));
 const volume=new THREE.Mesh(geometry,new THREE.ShaderMaterial({uniforms,vertexShader:sheetVertex,fragmentShader:sheetFragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));volume.frustumCulled=false;scene.add(volume);
 const texture=new THREE.DataArrayTexture(model.atlas,model.size,model.size,model.bins);texture.format=THREE.RGBAFormat;texture.type=THREE.FloatType;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
 const [xmin,xmax,zmin,zmax]=model.bounds,area=new THREE.PlaneGeometry(xmax-xmin,zmax-zmin);area.rotateX(-Math.PI/2);area.translate((xmin+xmax)*.5,.018,(zmin+zmax)*.5);
 const atlas=new THREE.Mesh(area,new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,uniforms:{field:{value:texture},weights:{value:binWeights(model,7.35,.5)},gain:{value:1},bounds:{value:new THREE.Vector4(...model.bounds)}},
  vertexShader:`out vec2 receiverUV;uniform vec4 bounds;void main(){receiverUV=vec2((position.x-bounds.x)/(bounds.y-bounds.x),(position.z-bounds.z)/(bounds.w-bounds.z));gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`precision highp sampler2DArray;uniform sampler2DArray field;uniform float gain;uniform float weights[${model.bins}];in vec2 receiverUV;out vec4 result;void main(){vec3 light=vec3(0.);for(int i=0;i<${model.bins};i++){if(weights[i]>.00001)light+=texture(field,vec3(receiverUV,float(i))).rgb*weights[i];}result=vec4(light*8.*1.3*gain,1.);}`,
  transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));scene.add(atlas);
 const pointsGeometry=new THREE.InstancedBufferGeometry(),quad=new THREE.PlaneGeometry(2,2);pointsGeometry.index=quad.index.clone();pointsGeometry.setAttribute('position',quad.getAttribute('position').clone());quad.dispose();
 const count=model.hits.length/8,positions=new Float32Array(count*3),colors=new Float32Array(count*3),optical=new Float32Array(count);
 for(let j=0;j<count;j++){const i=j*8,h=model.hits,flux=h[i+4]*Math.exp(-model.fog*h[i+3])/model.photons;positions.set([h[i],.018,h[i+1]],j*3);colors.set([h[i+5]*flux,h[i+6]*flux,h[i+7]*flux],j*3);optical[j]=h[i+2];}
 for(const [name,array,size]of[['hit',positions,3],['energy',colors,3],['delay',optical,1]])pointsGeometry.setAttribute(name,new THREE.InstancedBufferAttribute(array,size));pointsGeometry.instanceCount=count;
 const points=new THREE.Mesh(pointsGeometry,new THREE.ShaderMaterial({uniforms:{...uniforms,radius:{value:model.radius},gain:{value:1}},
  vertexShader:`attribute vec3 hit,energy;attribute float delay;uniform float radius;varying vec2 kernel;varying vec3 flux;varying float optical;void main(){kernel=position.xy;flux=energy;optical=delay;gl_Position=projectionMatrix*modelViewMatrix*vec4(hit+vec3(position.x*radius,0.,position.y*radius),1.);}`,
  fragmentShader:`uniform float radius,center,width,enabled,gain;varying vec2 kernel;varying vec3 flux;varying float optical;void main(){float r2=dot(kernel,kernel);if(r2>1.)discard;float k=4.*exp(-4.*r2)/(3.14159265*radius*radius*(1.-exp(-4.)));float w=enabled>.5?exp(-.5*pow((optical-center)/max(.004,width*.5),2.)):1.;gl_FragColor=vec4(flux*k*w*8.*1.3*gain,1.);}`,
  transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));points.frustumCulled=false;points.visible=false;scene.add(points);
 const shells=model.scene.spheres.map(s=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(s.r,64,40),makeGlassMaterial(model.ior));mesh.position.set(...s.c);mesh.material.uniforms.center.value.set(...s.c);mesh.material.uniforms.axes.value.set(s.r,s.r,s.r);scene.add(mesh);return mesh;});
 const lamps=model.scene.lights.map(l=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(.065,16,12),new THREE.MeshBasicMaterial({color:new THREE.Color(...l.color)}));mesh.position.set(...l.p);scene.add(mesh);return mesh;});
 const beauty=new BeautyPass(renderer);
 // Diagnose the two real drawing routes on the same receiver-UV grid. Keeping
 // this separate from the beauty pass removes its blur, glass and tone curve.
 // The camera looks at the double-sided receiver from below, so +X is right
 // and +Z is up, matching the atlas coordinates and stored-slice inspector.
 const chartScene=new THREE.Scene(),chartCamera=new THREE.OrthographicCamera(xmin,xmax,zmax,zmin,.01,4);
 chartCamera.position.set(0,-1,0);chartCamera.up.set(0,0,1);chartCamera.lookAt(0,0,0);chartCamera.updateMatrixWorld();
 const chartAtlas=new THREE.Mesh(area,atlas.material),chartSplats=new THREE.Mesh(pointsGeometry,points.material);
 chartAtlas.frustumCulled=chartSplats.frustumCulled=false;chartScene.add(chartAtlas,chartSplats);
 let chartTarget=null,chartKey='',chartResult=null,comparisonPasses=0;
 function updateField(state){
  atlas.material.uniforms.gain.value=points.material.uniforms.gain.value=state.gain||1;
  uniforms.center.value=state.time;uniforms.width.value=state.width;uniforms.enabled.value=state.gate?1:0;
  atlas.material.uniforms.weights.value=binWeights(model,state.time,state.width,state.gate);
 }
 function compareReceiver(state){
  const key=[state.gate,state.time,state.width].join(':');
  if(chartResult&&key===chartKey)return chartResult;
  if(!chartTarget){
   // Half-float blending is also the format used by the regular beauty pass.
   // Readback is explicitly converted to linear floats before comparison.
   chartTarget=new THREE.WebGLRenderTarget(model.size,model.size,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false});
  }
  updateField(state);atlas.material.uniforms.gain.value=points.material.uniforms.gain.value=1;
  const clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),previous=renderer.getRenderTarget();
  renderer.setClearColor(0x000000,0);
  function capture(useAtlas){
   chartAtlas.visible=useAtlas;chartSplats.visible=!useAtlas;
   renderer.setRenderTarget(chartTarget);renderer.clear();renderer.render(chartScene,chartCamera);
   const bits=new Uint16Array(model.size*model.size*4);renderer.readRenderTargetPixels(chartTarget,0,0,model.size,model.size,bits);
   const pixels=new Float32Array(model.size*model.size*3);
   for(let i=0,j=0;i<bits.length;i+=4)for(let c=0;c<3;c++)pixels[j++]=THREE.DataUtils.fromHalfFloat(bits[i+c])/10.4;
   comparisonPasses++;return pixels;
  }
  const baked=capture(true),retained=capture(false);let absolute=0,squared=0,referenceSquared=0,referenceMass=0,bakedMass=0,peak=0;
  for(let i=0;i<baked.length;i++){
   const difference=baked[i]-retained[i];absolute+=Math.abs(difference);squared+=difference*difference;referenceSquared+=retained[i]*retained[i];referenceMass+=retained[i];bakedMass+=baked[i];peak=Math.max(peak,baked[i],retained[i]);
  }
  renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);updateField(state);
  chartKey=key;chartResult={size:model.size,baked,retained,peak,time:state.time,width:state.width,gate:state.gate,passes:comparisonPasses,
   metrics:{relativeL1:referenceMass>1e-12?absolute/referenceMass:absolute>1e-12?null:0,relativeRMSE:referenceSquared>1e-24?Math.sqrt(squared/referenceSquared):squared>1e-24?null:0,bakedMass:bakedMass*model.texelArea,retainedMass:referenceMass*model.texelArea,maximum:peak,format:'RGBA16F',texelArea:model.texelArea}};
  return chartResult;
 }
 function resize(w,h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();beauty.resize(canvas.width,canvas.height);}
 function draw(state){updateField(state);volume.visible=state.volume;atlas.visible=state.surface&&state.receiver==='atlas';points.visible=state.surface&&state.receiver==='splats';beauty.render(scene,camera,{photons:[volume,atlas,points],shells,floor,grid,lamps,radius:.7});}
 function dispose(){scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});chartTarget?.dispose();texture.dispose();beauty.dispose();renderer.dispose();}
 return {camera,resize,draw,dispose,compareReceiver,comparisonPassCount:()=>comparisonPasses};
}
