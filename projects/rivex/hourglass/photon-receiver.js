// A receiver estimator independent of the finite sheet tessellation.
// Each emitted ray carries source-normalized flux; retained hits allow camera,
// medium and optical-gate edits without resampling the population.
import * as THREE from 'three';
import {traceRay,add,sub,mul,norm,cross} from './transport.js';

export class PhotonReceiver {
 constructor(shared){
  this.shared=shared;this.capacity=0;this.emitted=0;this.count=0;this.target=0;this.seed=173;this.generation=0;
  this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
   uniforms:{...shared,radius:{value:.06},viewportHeight:{value:720},normalization:{value:0},reflections:{value:1}},
   vertexShader:`attribute vec3 hit,tint;attribute vec4 pathData;attribute float reflected;uniform float radius,viewportHeight;
    varying float effectiveRadius;varying vec2 kernel;varying vec3 color,world;varying vec4 data;varying float branch;
    void main(){
     // A zero control means no added world-space blur; rasterization still needs
     // a finite pixel footprint and a matching normalization.
     float pixel=2.*abs((viewMatrix*vec4(hit,1.)).z)/(projectionMatrix[1][1]*max(1.,viewportHeight));
     effectiveRadius=max(radius,max(.00001,pixel));
     kernel=position.xy;world=hit+vec3(position.x*effectiveRadius,0.,position.y*effectiveRadius);color=tint;data=pathData;branch=reflected;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
   fragmentShader:`uniform float gate,clock,arrival,width,exposure,fog,stageFilter,radius,normalization,reflections;
    varying float effectiveRadius;varying vec2 kernel;varying vec3 color,world;varying vec4 data;varying float branch;
    void main(){float r2=dot(kernel,kernel);if(r2>1.||branch>reflections+.1)discard;if(stageFilter>=0.&&abs(data.w-stageFilter)>.25)discard;
    float delay=data.x+clock*length(cameraPosition-world);float window=gate>.5?exp(-.5*pow((delay-arrival)/max(width*.5,.02),2.)):1.;
    float density=4.*exp(-4.*r2)/(3.14159265*effectiveRadius*effectiveRadius*(1.-exp(-4.)));
    gl_FragColor=vec4(color*data.z*normalization*density*8.*exposure*exp(-fog*data.y)*window,1.);}`});
  this.mesh=new THREE.Mesh(new THREE.InstancedBufferGeometry(),this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=2;this.mesh.visible=false;
 }
 random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return (this.seed+.5)/4294967296;}
 allocate(capacity){
  if(this.capacity>=capacity)return;
  const previous=this.attributes||{},geometry=new THREE.InstancedBufferGeometry(),plane=new THREE.PlaneGeometry(2,2);
  geometry.index=plane.index.clone();geometry.setAttribute('position',plane.getAttribute('position').clone());plane.dispose();
  this.attributes={};for(const [key,size]of [['hit',3],['tint',3],['pathData',4],['reflected',1]]){
   const array=new Float32Array(capacity*size);if(previous[key])array.set(previous[key].array);
   const attr=new THREE.InstancedBufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage);this.attributes[key]=attr;geometry.setAttribute(key,attr);
  }
  geometry.instanceCount=this.count;this.mesh.geometry.dispose();this.mesh.geometry=geometry;this.capacity=capacity;
 }
 reset(scene,ior,target){
  this.scene=scene;this.ior=ior;this.target=target;this.count=0;this.emitted=0;this.allocate(target*2);this.mesh.geometry.instanceCount=0;this.seed=173;this.generation++;
  this.sources=scene.lights.map(light=>{
   const axis=norm(sub(light.target,light.p)),u=norm(cross(axis,Math.abs(axis[2])>.9?[0,1,0]:[0,0,1])),v=cross(axis,u);
   const sphere=scene.spheres.reduce((a,b)=>Math.hypot(...sub(a.c,light.target))<Math.hypot(...sub(b.c,light.target))?a:b);
   const angle=Math.asin(Math.min(.99,sphere.r/Math.hypot(...sub(sphere.c,light.p))))*(light.aperture??.96);
   return {light,axis,u,v,cosine:Math.cos(angle)};
  });
  this.material.uniforms.normalization.value=0;
 }
 setTarget(target){this.target=target;this.allocate(Math.max(this.count,target*2));}
 deposit(hit,source,reflected){
  if(!hit)return;const i=this.count++,a=this.attributes;
  a.hit.setXYZ(i,hit.p[0],.016,hit.p[2]);a.tint.setXYZ(i,...source.color);a.pathData.setXYZW(i,hit.L,hit.air,hit.power,hit.stage);a.reflected.setX(i,reflected);
 }
 advance(milliseconds=6){
  if(!this.sources?.length||this.emitted>=this.target)return false;
  const end=performance.now()+milliseconds,first=this.count;
  do{
   const source=this.sources[this.emitted%this.sources.length],z=1-this.random()*(1-source.cosine),phi=this.random()*Math.PI*2,r=Math.sqrt(1-z*z);
   const d=add(mul(source.axis,z),mul(add(mul(source.u,Math.cos(phi)),mul(source.v,Math.sin(phi))),r));
   const path=traceRay(source.light.p,d,this.scene.spheres,this.ior);
   this.deposit(path.floor,source.light,0);this.deposit(path.reflection?.floor,source.light,1);this.emitted++;
  }while(this.emitted<this.target&&(this.emitted%32!==0||performance.now()<end));
  for(const a of Object.values(this.attributes)){a.addUpdateRange(first*a.itemSize,(this.count-first)*a.itemSize);a.needsUpdate=true;}
  this.mesh.geometry.instanceCount=this.count;this.material.uniforms.normalization.value=this.sources.length/this.emitted;return true;
 }
 get pending(){return this.emitted<this.target;}
 dispose(){this.mesh.geometry.dispose();this.material.dispose();}
}
