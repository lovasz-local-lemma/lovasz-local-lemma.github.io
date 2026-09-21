// Biased reconstruction of the retained photon sheets. No painted caustic map,
// no readback, and no additional transport tracing when the camera/gate changes.
import * as THREE from 'three';
const quadVertex=`varying vec2 uvScreen;void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const glassVertex=`varying vec3 world;varying vec3 normalWorld;void main(){world=(modelMatrix*vec4(position,1.)).xyz;normalWorld=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`;
const glassFragment=`uniform sampler2D photons,reconstructed;uniform mat4 projectionMatrix;uniform vec3 center,axes;uniform float ior;uniform vec2 resolution;varying vec3 world,normalWorld;
 vec3 studio(vec3 d){
  vec3 c=mix(vec3(.009,.019,.026),vec3(.07,.13,.17),smoothstep(-.3,.8,d.y));
  float strip=exp(-pow((d.x+.48*d.z-.16)*8.,2.))*smoothstep(.1,.85,d.y);
  float window=exp(-pow((d.x-.6)*6.,2.)-pow((d.y-.4)*9.,2.));
  float rim=pow(max(0.,dot(d,normalize(vec3(-.8,.1,-.3)))),24.);
  return c+vec3(.52,.75,.85)*strip+vec3(1.,.75,.4)*window+vec3(.06,.27,.34)*rim;
 }
 vec3 lightAt(vec3 p){vec4 clip=projectionMatrix*viewMatrix*vec4(p,1.);vec2 q=clip.xy/clip.w*.5+.5;
  if(clip.w<=0.||any(lessThan(q,vec2(0.)))||any(greaterThan(q,vec2(1.))))return vec3(0.);
  return mix(texture2D(photons,q).rgb,texture2D(reconstructed,q).rgb,.8);
 }
 void main(){
  vec3 n=normalize((world-center)/(axes*axes)),d=normalize(world-cameraPosition);
  float cosine=max(0.,dot(-d,n)),f0=pow((ior-1.)/(ior+1.),2.),f=f0+(1.-f0)*pow(1.-cosine,5.);
  vec3 inside=refract(d,n,1./ior),q=(world-center)/axes,v=inside/axes;
  float chord=max(.0,-2.*dot(q,v)/dot(v,v));vec3 exitPoint=world+inside*chord;
  vec3 exitNormal=normalize((exitPoint-center)/(axes*axes)),outgoing=refract(inside,-exitNormal,ior);
  vec3 reflected=reflect(d,n);vec3 reflection=studio(reflected);
  if(reflected.y<-.02)reflection+=lightAt(world+reflected*max(.0,-world.y/reflected.y))*.65;
  float distance=outgoing.y<-.02?min(12.,max(0.,-exitPoint.y/outgoing.y)):3.;
  vec3 through=studio(outgoing)*.42+lightAt(exitPoint+outgoing*distance);
  // Analytic two-interface camera direction; radiance lookup remains screen-space.
  vec3 attenuation=exp(-vec3(.035,.014,.009)*chord);
  vec3 color=(1.-f)*through*attenuation+f*reflection+vec3(.008,.017,.022)*pow(1.-cosine,3.);
  gl_FragColor=vec4(color,.5); // alpha identifies glass for the final composition
 }`;
export function makeGlassMaterial(ior){return new THREE.ShaderMaterial({uniforms:{photons:{value:null},reconstructed:{value:null},center:{value:new THREE.Vector3()},axes:{value:new THREE.Vector3(1,1,1)},ior:{value:ior},resolution:{value:new THREE.Vector2()}},vertexShader:glassVertex,fragmentShader:glassFragment,blending:THREE.NoBlending,depthWrite:true});}
const floorVertex=`varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`;
const floorFragment=`varying vec3 world;
 void main(){
  vec3 eye=normalize(cameraPosition-world),reflection=reflect(-eye,vec3(0.,1.,0.));
  float radius=length(world.xz),stage=1.-smoothstep(5.6,6.8,radius);
  // A deliberately art-directed matte studio receiver, independent of photon flux.
  vec3 color=mix(vec3(.007,.012,.017),vec3(.025,.042,.048),stage);
  float key=pow(max(0.,dot(reflection,normalize(vec3(-.4,.9,.28)))),18.);
  float fill=pow(max(0.,dot(reflection,normalize(vec3(.75,.5,-.7)))),10.);
  color+=vec3(.026,.044,.054)*key+vec3(.022,.019,.013)*fill;
  vec2 cell=abs(fract(world.xz*.5-.5)-.5)/max(fwidth(world.xz*.5),vec2(.002));
  float seams=1.-min(min(cell.x,cell.y),1.);color*=1.-seams*.12;
  float rim=exp(-pow((radius-6.1)/.035,2.));color+=vec3(.023,.036,.039)*rim;
  float grain=fract(sin(dot(world.xz,vec2(127.1,311.7)))*43758.5453);color*=.97+.06*grain;
  color*=.7+.3*exp(-radius*.04);gl_FragColor=vec4(color,1.);
 }`;
export class BeautyPass{
 constructor(renderer){
  this.renderer=renderer;const target=()=>new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false});
  this.raw=target();this.ping=target();this.smooth=target();this.base=target();this.base.depthBuffer=true;
  this.scene=new THREE.Scene();this.camera=new THREE.Camera();this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));this.scene.add(this.quad);
  this.floorMaterial=new THREE.ShaderMaterial({vertexShader:floorVertex,fragmentShader:floorFragment});
  this.blur=new THREE.ShaderMaterial({uniforms:{source:{value:null},stepUV:{value:new THREE.Vector2()},sigma:{value:2}},vertexShader:quadVertex,fragmentShader:`uniform sampler2D source;uniform vec2 stepUV;uniform float sigma;varying vec2 uvScreen;void main(){vec4 c=vec4(0.);float total=0.;
   // Contiguous taps avoid the replicated highlights caused by dilated sparse taps.
   for(int i=-6;i<=6;i++){float x=float(i),w=exp(-.5*x*x/(sigma*sigma));c+=texture2D(source,uvScreen+stepUV*x)*w;total+=w;}gl_FragColor=c/total;}`});
  this.composite=new THREE.ShaderMaterial({uniforms:{base:{value:this.base.texture},raw:{value:this.raw.texture},filtered:{value:this.smooth.texture},reconstruction:{value:1}},vertexShader:quadVertex,fragmentShader:`uniform sampler2D base,raw,filtered;uniform float reconstruction;varying vec2 uvScreen;void main(){
   vec4 surface=texture2D(base,uvScreen);vec3 source=texture2D(raw,uvScreen).rgb,soft=texture2D(filtered,uvScreen).rgb;
   float glass=step(.25,surface.a)*(1.-step(.75,surface.a));
   vec3 light=mix(source,soft,clamp(reconstruction*.75,0.,1.))+soft*.22*reconstruction;
   gl_FragColor=vec4(surface.rgb+light*(1.-glass),1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});
 }
 resize(width,height){const w=Math.max(1,Math.round(width)),h=Math.max(1,Math.round(height));if(this.base.width===w&&this.base.height===h)return;this.base.setSize(w,h);for(const rt of [this.raw,this.ping,this.smooth])rt.setSize(Math.max(1,Math.round(w*.65)),Math.max(1,Math.round(h*.65)));}
 pass(material,target){this.quad.material=material;this.renderer.setRenderTarget(target);this.renderer.render(this.scene,this.camera);}
 render(scene,camera,{photons,shells,floor,grid,lamps,radius=1}){
  const r=this.renderer,clear=r.getClearColor(new THREE.Color()),alpha=r.getClearAlpha(),visible=new Map();
  for(const node of [floor,grid,...shells,...lamps]){visible.set(node,node.visible);node.visible=false;}
  r.setClearColor(0x000000,0);r.setRenderTarget(this.raw);r.render(scene,camera);
  this.blur.uniforms.sigma.value=.75+radius;
  this.blur.uniforms.source.value=this.raw.texture;this.blur.uniforms.stepUV.value.set(1/this.raw.width,0);this.pass(this.blur,this.ping);
  this.blur.uniforms.source.value=this.ping.texture;this.blur.uniforms.stepUV.value.set(0,1/this.raw.height);this.pass(this.blur,this.smooth);
  for(const [node,state]of visible)node.visible=state;
  for(const node of photons){visible.set(node,node.visible);node.visible=false;}
  for(const shell of shells){shell.material.uniforms.photons.value=this.raw.texture;shell.material.uniforms.reconstructed.value=this.smooth.texture;}
  const oldGrid=grid.visible,oldFloor=floor.material;grid.visible=false;floor.material=this.floorMaterial;
  r.setClearColor(0x0b151d,0);r.setRenderTarget(this.base);r.render(scene,camera);grid.visible=oldGrid;floor.material=oldFloor;
  this.composite.uniforms.reconstruction.value=radius;this.pass(this.composite,null);
  for(const [node,state]of visible)node.visible=state;r.setClearColor(clear,alpha);
 }
 dispose(){for(const rt of [this.raw,this.ping,this.smooth,this.base])rt.dispose();this.blur.dispose();this.composite.dispose();this.floorMaterial.dispose();this.quad.geometry.dispose();}
}
