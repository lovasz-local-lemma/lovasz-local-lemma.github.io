struct Parameters {
  resolutionTime: vec4f,
  aimRadiusMode: vec4f,
  mediumGate: vec4f,
  optics: vec4f,
  controls: vec4f,
  appearance: vec4f,
  source: vec4f,
  sphere: vec4f,
  surface: vec4f,
  zebra: vec4f,
  structure: vec4f,
  torch: vec4f,
  emitter: vec4f,
};
@group(0) @binding(0) var<uniform> u: Parameters;
@group(0) @binding(1) var rasterImage: texture_2d<f32>;
@group(0) @binding(2) var imageSampler: sampler;
@group(0) @binding(3) var photonImage: texture_2d<f32>;
@group(0) @binding(4) var beamImage: texture_2d<f32>;
@group(0) @binding(5) var previousPhotons: texture_2d<f32>;
@group(0) @binding(6) var previousBeams: texture_2d<f32>;
@group(0) @binding(7) var flowField: texture_3d<f32>;
@group(0) @binding(8) var flowSampler: sampler;

const PI = 3.14159265359;
const EYE = vec3f(5.3, 3.75, 7.6);
const LOOK = vec3f(0.0, 1.55, -0.05);
fn glassCenter()->vec3f{return u.sphere.xyz;}
fn glassRadius()->f32{return u.sphere.w;}
fn metalCenter()->vec3f{return u.zebra.xyz;}
fn metalRadius()->f32{return u.zebra.w;}
fn pedestalCenter()->vec3f{return vec3f(u.zebra.x,0.05,u.zebra.z);}
fn pedestalSize()->vec3f{return vec3f(u.zebra.w*1.12/0.93,0.05,u.zebra.w*1.12/0.93);}
fn lightPosition()->vec3f{return u.source.xyz;}
const FAR = 10000.0;

struct Surface {
  distance: f32,
  point: vec3f,
  normal: vec3f,
  material: f32,
};
fn cameraBasis() -> mat3x3f {
  let f = normalize(LOOK - EYE);
  let r = normalize(cross(f, vec3f(0,1,0)));
  return mat3x3f(r, cross(r,f), f);
}
fn screenRay(uv: vec2f) -> vec3f {
  let q = vec2f((uv.x*2.0-1.0)*u.resolutionTime.x/u.resolutionTime.y, 1.0-uv.y*2.0);
  return normalize(cameraBasis()*vec3f(q*0.48,1.0));
}
fn project(p: vec3f) -> vec4f {
  let b = cameraBasis();
  let rel = p-EYE;
  let q = vec3f(dot(rel,b[0]),dot(rel,b[1]),dot(rel,b[2]));
  return vec4f(q.x/(0.48*u.resolutionTime.x/u.resolutionTime.y),q.y/0.48,q.z*1.001-0.05005,q.z);
}
fn sphereDistance(ro: vec3f,rd: vec3f,c: vec3f,r: f32) -> f32 {
  let oc=ro-c; let b=dot(oc,rd); let d=b*b-dot(oc,oc)+r*r;
  if(d<0.0){return FAR;}
  let root=sqrt(d); let near=-b-root; let far=-b+root;
  if(near>0.001){return near;}
  if(far>0.001){return far;}
  return FAR;
}
fn boxDistance(ro: vec3f,rd: vec3f,c: vec3f,r: vec3f) -> vec2f {
  let inv=1.0/select(vec3f(0.00001),rd,abs(rd)>vec3f(0.00001));
  let a=(c-r-ro)*inv; let b=(c+r-ro)*inv;
  let lo=min(a,b); let hi=max(a,b);
  let near=max(lo.x,max(lo.y,lo.z)); let far=min(hi.x,min(hi.y,hi.z));
  if(far<max(near,0.001)){return vec2f(FAR,0);}
  return vec2f(select(far,near,near>0.001),1.0);
}
fn boxNormal(p: vec3f,c: vec3f,r: vec3f)->vec3f{
  let q=(p-c)/r; let a=abs(q);
  if(a.x>a.y && a.x>a.z){return vec3f(sign(q.x),0,0);}
  if(a.y>a.z){return vec3f(0,sign(q.y),0);}
  return vec3f(0,0,sign(q.z));
}
fn hitScene(ro: vec3f,rd: vec3f,glass: bool) -> Surface {
  var t=FAR; var n=vec3f(0,1,0); var material=-1.0;
  if(rd.y < -0.0001){let d=-ro.y/rd.y; if(d>0.001 && d<t){let p=ro+rd*d;if(abs(p.x)<7.5 && abs(p.z)<7.0){t=d;n=vec3f(0,1,0);material=0.0;}}}
  if(rd.z < -0.0001){let d=(-3.6-ro.z)/rd.z;if(d>0.001&&d<t){let p=ro+rd*d;if(abs(p.x)<5.0&&p.y>0.0&&p.y<5.2){t=d;n=vec3f(0,0,1);material=1.0;}}}
  if(rd.x < -0.0001){let d=(-4.7-ro.x)/rd.x;if(d>0.001&&d<t){let p=ro+rd*d;if(p.z>-3.6&&p.z<3.0&&p.y>0.0&&p.y<5.2){t=d;n=vec3f(1,0,0);material=1.0;}}}
  if(glass){let d=sphereDistance(ro,rd,glassCenter(),glassRadius());if(d<t){t=d;n=normalize(ro+rd*d-glassCenter());material=2.0;}}
  let d=sphereDistance(ro,rd,metalCenter(),metalRadius());if(d<t){t=d;n=normalize(ro+rd*d-metalCenter());material=3.0;}
  let cc=vec3f(-2.78,0.72,-1.70);let cr=vec3f(0.58,0.72,0.58);let bd=boxDistance(ro,rd,cc,cr).x;
  if(bd<t){t=bd;n=boxNormal(ro+rd*bd,cc,cr);material=4.0;}
  let pc=pedestalCenter();let pr=pedestalSize();let pd=boxDistance(ro,rd,pc,pr).x;
  if(pd<t){t=pd;n=boxNormal(ro+rd*pd,pc,pr);material=5.0;}
  return Surface(t,ro+rd*t,n,material);
}
fn targetPoint()->vec3f{
  let rd=screenRay(u.aimRadiusMode.xy);
  // Aim on a camera-facing plane through the glass, not the picked surface.
  // Surface picking jumps in depth at silhouettes and rotates the whole torch.
  // Actual shadow, refraction and photon rays still intersect the scene below.
  let forward=cameraBasis()[2];
  let depth=dot(glassCenter()-EYE,forward);
  return EYE+rd*(depth/dot(rd,forward));
}
fn lightDirection()->vec3f{
  let d=normalize(targetPoint()-lightPosition());
  let yaw=u.torch.y;let pitch=u.torch.z;
  let turned=vec3f(d.x*cos(yaw)+d.z*sin(yaw),d.y,-d.x*sin(yaw)+d.z*cos(yaw));
  let right=normalize(cameraBasis()[0]-turned*dot(cameraBasis()[0],turned));
  return normalize(turned*cos(pitch)+cross(right,turned)*sin(pitch));
}
fn sourceFrame()->mat3x3f{
  let axis=lightDirection();let right=normalize(cameraBasis()[0]-axis*dot(cameraBasis()[0],axis));
  return mat3x3f(right,cross(axis,right),axis);
}
// Uniform area samples, with identical total flux for every emitter shape.
fn emitterPoint(sample:vec2f)->vec3f{
  if(u.emitter.x<0.5||u.emitter.y<0.0001){return lightPosition();}
  var q=sqrt(sample.x)*vec2f(cos(2.0*PI*sample.y),sin(2.0*PI*sample.y));
  if(u.emitter.x>1.5){
    let edge=floor(sample.x*10.0);let a=edge*PI/5.0;let b=(edge+1.0)*PI/5.0;
    let ra=select(1.0,0.43,u32(edge)%2u==1u);let rb=1.43-ra;
    q=sqrt(fract(sample.x*10.0))*mix(ra*vec2f(cos(a),sin(a)),rb*vec2f(cos(b),sin(b)),sample.y);
  }
  return lightPosition()+sourceFrame()*vec3f(q*u.emitter.y,0);
}
fn spotFrom(p:vec3f,source:vec3f)->f32{
  let v=normalize(p-source);let c=dot(v,lightDirection());
  let angle=0.09+u.aimRadiusMode.z*0.76;
  return smoothstep(cos(angle),cos(angle*0.67),c);
}
fn spot(p:vec3f)->f32{return spotFrom(p,lightPosition());}
fn temporal(path:f32)->f32{
  if(u.mediumGate.y<0.5){return 1.0;}
  let sigma=max(0.08,u.mediumGate.w);
  let x=(path-u.mediumGate.z)/sigma;
  return exp(-0.5*x*x);
}
fn environment(rd:vec3f)->vec3f{
  let sky=mix(vec3f(0.017,0.032,0.042),vec3f(0.19,0.30,0.31),smoothstep(-0.2,0.9,rd.y));
  let key=pow(max(0.0,dot(rd,normalize(vec3f(-0.8,1.8,1.2)))),90.0)*vec3f(5.0,3.9,2.4);
  let strip=pow(max(0.0,dot(rd,normalize(vec3f(1.6,0.65,-1.0)))),170.0)*vec3f(0.4,1.5,1.8);
  let rim=pow(max(0.0,dot(rd,normalize(vec3f(-1.0,0.2,-1.8)))),38.0)*vec3f(0.18,0.48,0.52);
  return sky+key+strip+rim;
}
fn hash(n:f32)->f32{return fract(sin(n*127.1+31.41)*43758.5453);}
// Each zebra band selects a complete material, not just a different tint.
fn stripe(p:vec3f)->f32{
  let n=(p-metalCenter())/metalRadius();
  return smoothstep(-0.13,0.13,sin(n.y*32.0+n.x*9.0+2.7*sin(n.x*8.0+n.z*5.0)+sin(n.z*19.0)));
}
struct BandMaterial { color:vec3f, rough:f32, metal:f32, glow:f32 };
fn bandMaterial(p:vec3f)->BandMaterial{
  let band=stripe(p);let pair=i32(u.appearance.x+0.5);
  var a=vec3f(0.13,0.23,0.23);var b=vec3f(0.85,0.30,0.10);
  var roughA=0.48;var roughB=0.10;var metalA=0.82;var metalB=1.0;var glow=0.0;
  if(pair==1){a=vec3f(0.019,0.021,0.035);b=vec3f(0.37,0.95,0.07);roughA=0.95;roughB=0.12;metalA=0.0;metalB=0.08;glow=0.48;}
  if(pair==2){let marble=pow(0.5+0.5*sin(p.x*16.0+p.y*9.0+3.0*sin(p.z*7.0)+sin(p.y*11.0)),10.0);a=mix(vec3f(0.64,0.71,0.69),vec3f(0.025,0.09,0.09),marble);b=vec3f(0.82,0.40,0.26);roughA=0.57;roughB=0.07;metalA=0.0;metalB=1.0;}
  if(pair==3){a=vec3f(0.018,0.014,0.025);b=vec3f(0.04,0.13,0.8);roughA=0.84;roughB=0.08;metalA=0.0;metalB=0.35;}
  if(pair==4){a=vec3f(0.28,0.34,0.37);b=0.50+0.44*cos(vec3f(0,2.1,4.2)+p.y*7.0+p.z*4.0);roughA=0.54;roughB=0.13;metalA=0.95;metalB=0.65;}
  if(pair==5){a=vec3f(0.36,0.10,0.05);b=vec3f(0.77,0.76,0.59);roughA=0.92;roughB=0.24;metalA=0.0;metalB=0.15;}
  if(pair==6){let grain=0.5+0.5*sin(p.y*52.0+sin(p.x*7.0+p.z*9.0)*8.0);a=mix(vec3f(0.09,0.028,0.009),vec3f(0.47,0.20,0.045),grain);b=vec3f(0.75,0.51,0.14);roughA=0.68;roughB=0.08;metalA=0.0;metalB=1.0;}
  if(pair==7){a=vec3f(0.19,0.29,0.31);b=vec3f(0.78,0.91,0.94);roughA=0.86;roughB=0.04;metalA=1.0;metalB=0.0;}
  if(pair==8){let grain=hash(floor(p.x*100.0)+floor(p.y*120.0)*17.0+floor(p.z*130.0)*31.0);a=vec3f(0.84,0.78,0.61)*(0.87+0.16*grain);let view=normalize(EYE-p);let phase=dot(normalize(p-metalCenter()),view)*24.0+p.y*2.0;b=0.48+0.46*cos(vec3f(0,2.1,4.2)+phase);roughA=0.96;roughB=0.035;metalA=0.0;metalB=0.94;}
  if(pair==9){a=vec3f(0.52,0.60,0.63);b=vec3f(0.70,0.29,0.13);roughA=0.22;roughB=0.78;metalA=1.0;metalB=1.0;}
  return BandMaterial(mix(a,b,band),mix(roughA,roughB,band),mix(metalA,metalB,band),glow*band);
}
fn palette(p:vec3f,mat:f32)->vec3f{
  if(mat<0.5){
    let cell=floor(p.xz*1.25);let checker=abs(fract((cell.x+cell.y)*0.5)*2.0);
    let q=abs(fract(p.xz*1.25)-0.5);let line=smoothstep(0.487,0.5,max(q.x,q.y));
    let marble=0.022*sin(p.x*7.1+p.z*3.8+sin(p.z*9.0)*0.43);
    return mix(mix(vec3f(0.053,0.09,0.102),vec3f(0.075,0.12,0.13),checker)+marble,vec3f(0.17,0.23,0.22),line*0.6);
  }
  if(mat<1.5){
    let arch=abs(p.x+0.15);let stripes=smoothstep(0.97,0.995,cos((p.x+p.z)*9.0));
    return mix(vec3f(0.052,0.105,0.118),vec3f(0.29,0.31,0.24),stripes*0.42);
  }
  if(mat<2.5){return vec3f(0.12,0.48,0.53);}
  if(mat<3.5){return bandMaterial(p).color;}
  if(mat<4.5){let bars=smoothstep(0.88,0.96,cos(p.y*32.0));return mix(vec3f(0.07,0.18,0.22),vec3f(0.53,0.40,0.18),bars);}
  return vec3f(0.11,0.13,0.13);
}
fn directShade(hit:Surface,rd:vec3f,quality:bool)->vec3f{
  if(hit.material<0.0){return environment(rd)*0.35;}
  let p=hit.point;var n=hit.normal;
  if(hit.material>2.5&&hit.material<3.5&&u.surface.x>0.0){let q=p-metalCenter();let gradient=vec3f(cos(q.x*17.0)*sin(q.y*13.0),sin(q.x*17.0)*cos(q.y*13.0),cos(q.z*21.0))*.5;n=normalize(n-u.surface.x*(gradient-n*dot(n,gradient)));}
  let l=normalize(lightPosition()-p);let v=-rd;let h=normalize(l+v);
  let albedo=palette(p,hit.material);
  let fill=max(0.0,dot(n,normalize(vec3f(-1.8,3.0,2.0))));
  let distance=length(lightPosition()-p);let cone=spot(p);
  var sourceLight=0.0;
  if(quality){
    let count=select(1u,5u,u.emitter.x>0.5&&u.emitter.y>0.0001);
    for(var i=0u;i<count;i++){
      let source=emitterPoint(vec2f((f32(i)+0.5)/f32(count),fract(f32(i)*0.61803398875+0.21)));
      let delta=source-p;let d=length(delta);let block=hitScene(p+n*0.006,delta/d,false);
      let visibility=select(1.0,0.08,block.distance<d);
      var air=1.0;if(u.structure.z>.5){air=exp(-u.mediumGate.x*flowColumn(source,p));}
      sourceLight+=spotFrom(p,source)*visibility*temporal(d)*air/f32(count);
    }
  }
  sourceLight*=u.torch.x;
  let lighting=max(0.0,dot(n,l))*sourceLight*8.0/(1.0+distance*distance*0.055);
  let rough=select(0.48,bandMaterial(p).rough,hit.material>2.5&&hit.material<3.5);
  var spec=pow(max(0.0,dot(n,h)),mix(24.0,100.0,1.0-rough));
  if(u.appearance.x>8.5&&hit.material>2.5&&hit.material<3.5){let helper=select(vec3f(0,1,0),vec3f(1,0,0),abs(n.y)>0.95);let tangent=normalize(cross(n,helper));let bitangent=cross(n,tangent);let nh=max(.02,dot(n,h));let ax=mix(.045,.5,stripe(p));let ay=.55;spec=exp(-(pow(dot(h,tangent)/ax,2.0)+pow(dot(h,bitangent)/ay,2.0))/(nh*nh));}
  var col=albedo*(0.14+0.50*fill)+vec3f(0.025,0.047,0.052)*max(0.0,n.y);
  if(quality){
    col=albedo*(0.18+0.40*fill+lighting*vec3f(1.12,0.93,0.68));
    col+=vec3f(1.0,0.78,0.44)*spec*sourceLight*2.8;
    let env=environment(reflect(rd,n));
    let fres=pow(1.0-max(0.0,dot(n,v)),5.0);
    if(hit.material>2.5&&hit.material<3.5){
      let material=bandMaterial(p);
      let n2=normalize(n+material.rough*0.015*vec3f(sin(p.y*130.0),sin(p.z*110.0),cos(p.x*130.0)));
      let e=mix(environment(reflect(rd,n2)),vec3f(0.22,0.31,0.33),material.rough*0.88);
      let conductor=e*mix(albedo,vec3f(0.95),fres)*1.65;
      col=mix(col,conductor,material.metal*(1.0-material.rough*0.25));
      col+=mix(vec3f(0.16),albedo,material.metal)*spec*sourceLight*(3.0-rough*1.6);
      col+=albedo*material.glow*(0.16+lighting*0.65);
    }else if(hit.material<0.5){col+=env*(0.022+0.20*fres);}
    else if(hit.material>3.5&&hit.material<4.5){col+=env*(0.10+0.16*fres);}
  }else{
    let grid=abs(fract(p.xz*3.0)-0.5);
    if(hit.material<0.5){col=mix(col,vec3f(0.05,0.17,0.19),smoothstep(0.483,0.5,max(grid.x,grid.y))*0.65);}
    col+=vec3f(0.20,0.43,0.47)*spec*0.18;
  }
  if(hit.material>0.5 && hit.material<1.5 && n.z>0.5){
    let arch=abs(length(vec2f(p.x,p.y-1.7))-2.05);
    let base=abs(p.y-0.21);
    let light=exp(-arch*arch*9000.0)*smoothstep(1.62,1.78,p.y)+exp(-base*base*14000.0)*0.6;
    col+=vec3f(0.60,0.30,0.095)*light*0.75;
    let panel=vec2f(abs(p.x+2.1)-0.18,abs(p.y-2.5)-1.16);
    let panelDistance=max(panel.x,panel.y);
    let opal=1.0-smoothstep(-0.015,0.015,panelDistance);
    let halo=exp(-max(0.0,panelDistance)*9.0);
    col+=vec3f(0.65,0.86,0.83)*(opal*1.65+halo*0.06);
  }
  return col;
}
fn dielectricShade(hit:Surface,rd:vec3f,center:vec3f,radius:f32)->vec3f{
  let n=hit.normal;let cosI=max(0.0,dot(-rd,n));let ior=clamp(u.optics.x,1.05,2.0);
  let f0=pow((ior-1.0)/(ior+1.0),2.0);let fres=f0+(1.0-f0)*pow(1.0-cosI,5.0);
  let reflected=reflect(rd,n);let rh=hitScene(hit.point+n*0.005,reflected,false);
  var reflectColor=environment(reflected);
  if(rh.distance<40.0){reflectColor=directShade(rh,reflected,true);}
  var transmitted=vec3f(0.0);
  for(var channel=0;channel<3;channel++){
    let eta=ior+(f32(channel)-1.0)*u.torch.w;
    let inner=refract(rd,n,1.0/eta);let inside=hit.point+inner*0.005;
    let chord=sphereDistance(inside,inner,center,radius);
    let exit=inside+inner*chord;let exitNormal=normalize(exit-center);
    let outgoing=refract(inner,-exitNormal,eta);
    if(dot(outgoing,outgoing)>0.001){
      let back=hitScene(exit+outgoing*0.008,outgoing,false);
      var col=environment(outgoing);
      if(back.distance<40.0){col=directShade(back,outgoing,true);}
      let absorption=exp(-chord*vec3f(0.06,0.018,0.011));
      transmitted[channel]=col[channel]*absorption[channel];
    }else{transmitted[channel]=environment(reflect(inner,-exitNormal))[channel];}
  }
  var col=mix(transmitted,reflectColor,fres);
  let rim=pow(1.0-cosI,3.0);
  col+=vec3f(0.13,0.48,0.57)*rim*0.18;
  let glint=pow(max(0.0,dot(reflected,normalize(lightPosition()-hit.point))),180.0)*4.0;
  return col+vec3f(1.0,0.87,0.63)*glint*spot(hit.point)*temporal(length(lightPosition()-hit.point))*u.torch.x;
}

fn glassShade(hit:Surface,rd:vec3f)->vec3f{return dielectricShade(hit,rd,glassCenter(),glassRadius());}

struct MeshVertex { @builtin(position) position:vec4f,@location(0) world:vec3f,@location(1) normal:vec3f,@location(2) @interpolate(flat) material:f32 };
fn quadCorner(i:u32)->vec2f{
  let corners=array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
  return corners[i%6u];
}
fn sphereVertex(i:u32,center:vec3f,radius:f32,mat:f32)->MeshVertex{
  let corner=quadCorner(i);let cell=i/6u;
  let az=(f32(cell%64u)+corner.x)*2.0*PI/64.0;
  let el=(f32(cell/64u)+corner.y)*PI/40.0;
  let n=vec3f(sin(el)*cos(az),cos(el),sin(el)*sin(az));let p=center+n*radius;
  return MeshVertex(project(p),p,n,mat);
}
fn boxVertex(i:u32,c:vec3f,r:vec3f,mat:f32)->MeshVertex{
  let uv=quadCorner(i)*2.0-1.0;let face=i/6u;var p=vec3f(0);var n=vec3f(0);
  switch(face){
    case 0u:{p=vec3f(1,uv.y,uv.x);n=vec3f(1,0,0);}
    case 1u:{p=vec3f(-1,uv.y,-uv.x);n=vec3f(-1,0,0);}
    case 2u:{p=vec3f(uv.x,1,uv.y);n=vec3f(0,1,0);}
    case 3u:{p=vec3f(uv.x,-1,-uv.y);n=vec3f(0,-1,0);}
    case 4u:{p=vec3f(-uv.x,uv.y,1);n=vec3f(0,0,1);}
    default:{p=vec3f(uv.x,uv.y,-1);n=vec3f(0,0,-1);}
  }
  p=c+p*r;return MeshVertex(project(p),p,n,mat);
}
// 18 room vertices + two 64x40 sphere meshes + two boxes = 30,810 vertices.
@vertex fn rasterVertex(@builtin(vertex_index) id:u32)->MeshVertex{
  if(id<18u){
    let q=quadCorner(id);var p=vec3f(0);var n=vec3f(0,1,0);var mat=0.0;
    if(id<6u){p=vec3f(mix(-7.5,7.5,q.x),0,mix(-7.0,7.0,q.y));}
    else if(id<12u){p=vec3f(mix(-5.0,5.0,q.x),q.y*5.2,-3.6);n=vec3f(0,0,1);mat=1.0;}
    else{p=vec3f(-4.7,q.y*5.2,mix(-3.6,3.0,q.x));n=vec3f(1,0,0);mat=1.0;}
    return MeshVertex(project(p),p,n,mat);
  }
  if(id<15378u){return sphereVertex(id-18u,glassCenter(),glassRadius(),2.0);}
  if(id<30738u){return sphereVertex(id-15378u,metalCenter(),metalRadius(),3.0);}
  if(id<30774u){return boxVertex(id-30738u,vec3f(-2.78,0.72,-1.70),vec3f(0.58,0.72,0.58),4.0);}
  return boxVertex(id-30774u,pedestalCenter(),pedestalSize(),5.0);
}
@fragment fn rasterFragment(v:MeshVertex)->@location(0) vec4f{
  let rd=normalize(v.world-EYE);let n=normalize(v.normal);
  var col=directShade(Surface(length(v.world-EYE),v.world,n,v.material),rd,false);
  if(v.material>1.5&&v.material<2.5){
    let outline=pow(1.0-max(0.0,dot(-rd,n)),2.0);
    let latitude=1.0-smoothstep(0.022,0.047,abs(sin(acos(clamp(n.y,-1.0,1.0))*12.0)));
    let longitude=1.0-smoothstep(0.024,0.060,abs(sin(atan2(n.z,n.x)*12.0)));
    col=vec3f(0.028,0.085,0.102)+vec3f(0.11,0.34,0.36)*(outline+max(latitude,longitude)*(0.8+u.appearance.y*1.8));
  }
  if(u.appearance.y>0.01){
    var grid=vec2f(v.world.x*3.0,v.world.z*3.0);
    if(v.material>0.5&&v.material<1.5){grid=vec2f(v.world.x+v.world.z,v.world.y)*3.0;}
    if(v.material>2.5&&v.material<3.5){grid=vec2f(atan2(n.z,n.x)*8.0,acos(clamp(n.y,-1.0,1.0))*10.0);}
    let edge=abs(fract(grid)-0.5);let width=max(fwidth(grid),vec2f(0.006));
    let wires=max(smoothstep(0.5-width.x*1.25,0.5,edge.x),smoothstep(0.5-width.y*1.25,0.5,edge.y));
    col=mix(col,col*0.40+vec3f(0.12,0.66,0.59)*wires,u.appearance.y*0.74);
  }
  // Rive backends without half-float color targets store raster radiance in a
  // bounded perceptual encoding. Photon targets must stay linear for addition.
  if(u.controls.w>0.5){
    let radiance=max(col,vec3f(0));
    return vec4f(sqrt(radiance/(vec3f(1.0)+radiance)),1.0);
  }
  return vec4f(col,1.0);
}

struct PhotonVertex { @builtin(position) position:vec4f,@location(0) local:vec2f,@location(1) @interpolate(flat) energy:vec3f };
fn random2(i:u32)->vec2f{
  // An integer permutation avoids the precision bands produced by sine hashes.
  var x=i*747796405u+2891336453u;var word=((x>>((x>>28u)+4u))^x)*277803737u;word=(word>>22u)^word;
  let a=f32(word)/4294967296.0;x=word*747796405u+2891336453u;word=((x>>((x>>28u)+4u))^x)*277803737u;word=(word>>22u)^word;
  return vec2f(a,f32(word)/4294967296.0);
}
struct Transport { origin:vec3f, direction:vec3f, point:vec3f, normal:vec3f, path:f32, length:f32, power:f32, valid:f32, color:vec3f };
fn transport(id:u32)->Transport{
  let rand=random2(id+1u+u32(u.optics.w)*65537u);let direction=lightDirection();
  let source=emitterPoint(random2(id+19073u+u32(u.optics.w)*65537u));
  let channel=min(2u,u32(random2(id+97829u+u32(u.optics.w)*65537u).x*3.0));
  var color=vec3f(1);if(u.torch.w>0.000001){color=vec3f(0);color[channel]=3.0;}
  let helper=select(vec3f(0,1,0),vec3f(1,0,0),abs(direction.y)>0.95);let tangent=normalize(cross(direction,helper));let bitangent=cross(tangent,direction);
  let angle=0.09+u.aimRadiusMode.z*0.76;
  let cosTheta=mix(1.0,cos(angle),rand.x);let sinTheta=sqrt(max(0.0,1.0-cosTheta*cosTheta));let phi=rand.y*PI*2.0;
  var rd=normalize(direction*cosTheta+(tangent*cos(phi)+bitangent*sin(phi))*sinTheta);
  let first=hitScene(source,rd,true);
  let invalid=Transport(vec3f(0),rd,vec3f(0),vec3f(0,1,0),0.0,0.0,0.0,0.0,color);
  // This bounded transport route expects an external emitter. An editor pose
  // inside the glass cannot use the air-to-glass entry model.
  if(length(source-glassCenter())<=glassRadius()+0.002){return invalid;}
  // The sampled ray must actually reach the illuminated dielectric first.
  if(first.material<1.5||first.material>2.5){return invalid;}
  let eta=clamp(u.optics.x+(f32(channel)-1.0)*u.torch.w,1.01,2.2);let f0=pow((eta-1.0)/(eta+1.0),2.0);
  let fres=f0+(1.0-f0)*pow(1.0-max(0.0,dot(-rd,first.normal)),5.0);
  rd=refract(rd,first.normal,1.0/eta);let inside=first.point+rd*0.002;
  let chord=sphereDistance(inside,rd,glassCenter(),glassRadius());let exit=inside+rd*chord;
  let exitCos=max(0.0,dot(rd,normalize(exit-glassCenter())));
  rd=refract(rd,-normalize(exit-glassCenter()),eta);
  if(dot(rd,rd)<0.001){return invalid;}
  let ro=exit+rd*0.002;let receiver=hitScene(ro,rd,false);
  if(receiver.material<0.0||receiver.material==3.0){return invalid;}
  let exitFres=f0+(1.0-f0)*pow(1.0-exitCos,5.0);
  var power=(1.0-fres)*(1.0-exitFres)*exp(-chord*0.025)*u.torch.x;
  // Only the incident segment belongs in the shared power. Beam samples and
  // receiver photons integrate their different outgoing distances separately.
  if(u.structure.z>.5){power*=exp(-u.mediumGate.x*flowColumn(source,first.point));}
  return Transport(ro,rd,receiver.point,receiver.normal,first.distance+(chord+0.002)*eta,receiver.distance,power,1.0,color);
}
@vertex fn photonVertex(@builtin(vertex_index) vertex:u32)->PhotonVertex{
  let t=transport(vertex/6u);
  let invalid=PhotonVertex(vec4f(2.0,2.0,2.0,1.0),vec2f(0),vec3f(0));
  if(t.valid<0.5){return invalid;}
  let previewScale=select(1.0,0.45,u.controls.y>0.5);
  let sigma=(u.surface.y+0.028*(1.0-abs(dot(t.direction,t.normal))))*previewScale;
  let local=(quadCorner(vertex)*2.0-1.0)*3.0;
  let helper=select(vec3f(0,1,0),vec3f(1,0,0),abs(t.normal.y)>0.9);
  let axis=normalize(cross(t.normal,helper));let other=cross(t.normal,axis);
  let wp=t.point+(axis*local.x+other*local.y)*sigma+t.normal*0.006;
  var air=1.0;if(u.structure.z>.5){air=exp(-u.mediumGate.x*flowColumn(t.origin,t.point));}
  let energy=t.power*air*temporal(t.path+t.length)*140.0/(max(1.0,u.optics.y)*2.0*PI*sigma*sigma);
  return PhotonVertex(project(wp),local,vec3f(1.0,0.77,0.39)*t.color*energy);
}
struct BeamVertex { @builtin(position) position:vec4f,@location(0) along:vec2f,@location(1) @interpolate(flat) power:f32,@location(2) @interpolate(flat) path:vec2f,@location(3) world:vec3f,@location(4) @interpolate(flat) color:vec3f,@location(5) @interpolate(flat) origin:vec3f };
@vertex fn beamVertex(@builtin(vertex_index) vertex:u32)->BeamVertex{
  let t=transport(vertex/6u);let q=quadCorner(vertex);
  let invalid=BeamVertex(vec4f(2,2,2,1),vec2f(0),0.0,vec2f(0),vec3f(0),vec3f(0),vec3f(0));
  if(t.valid<0.5||u.mediumGate.x<0.001){return invalid;}
  let offset=normalize(cross(t.direction,normalize(EYE-(t.origin+t.point)*0.5)));
  let width=0.035;let p=mix(t.origin,t.point,q.y)+offset*(q.x*2.0-1.0)*width*3.0;
  return BeamVertex(project(p),vec2f(q.x*2.0-1.0,q.y),t.power,vec2f(t.path,t.length),p,t.color,t.origin);
}
fn mediumDensity(p:vec3f)->f32{
  if(u.structure.z>.5){
    let q=(p-vec3f(-4.7,0,-3.6))/vec3f(9.7,5.2,6.6);
    if(any(q<vec3f(0))||any(q>vec3f(1))){return 0.0;}
    return max(0.0,textureSampleLevel(flowField,flowSampler,q,0.0).r);
  }
  if(u.appearance.z<0.5){return 0.0;}
  if(u.appearance.z<1.5){return 1.0;}
  if(u.appearance.z>4.5){
    let q=p*u.structure.x+vec3f(u.resolutionTime.z*.16,u.resolutionTime.z*.07,0.0);
    let gyroid=sin(q.x)*cos(q.y)+sin(q.y)*cos(q.z)+sin(q.z)*cos(q.x);
    let contrast=u.structure.y;
    let thin=1.0-smoothstep(.10,.42,abs(gyroid));
    let pockets=smoothstep(.28,.76,gyroid);
    let field=select(thin*thin,pockets,u.appearance.z>5.5);
    return mix(.30,.008,contrast)+mix(1.2,7.0,contrast)*field;
  }
  let cloud=0.5+0.5*sin(p.x*2.3+sin(p.z*2.8)+u.resolutionTime.z*0.28)*sin(p.y*3.1-p.z*1.7);
  if(u.appearance.z<2.5){return 0.2+1.8*cloud*cloud;}
  if(u.appearance.z<3.5){return 0.15+2.0*smoothstep(0.25,0.9,cloud);}
  return 0.2+1.5*pow(cloud,3.0);
}
fn chamberDensity(p:vec3f)->f32{
  if(p.x< -4.7||p.x>5.0||p.y<0.02||p.y>5.2||p.z< -3.6||p.z>3.0){return 0.0;}
  if(length(p-glassCenter())<glassRadius()){return 0.0;}
  if(u.structure.z>.5){
    if(length(p-metalCenter())<metalRadius()){return 0.0;}
    if(all(abs(p-vec3f(-2.78,.72,-1.70))<vec3f(.58,.72,.58))){return 0.0;}
    if(all(abs(p-pedestalCenter())<pedestalSize())){return 0.0;}
  }
  return mediumDensity(p);
}
fn flowColumn(a:vec3f,b:vec3f)->f32{
  // Clip quadrature to the volume: the camera/source can be outside it.
  let delta=b-a;let distance=length(delta);if(distance<.0001){return 0.0;}
  let inverse=1.0/select(vec3f(.000001),delta,abs(delta)>vec3f(.000001));
  let aa=(vec3f(-4.7,0,-3.6)-a)*inverse;let bb=(vec3f(5,5.2,3)-a)*inverse;
  let lo=min(aa,bb);let hi=max(aa,bb);
  let begin=max(0.0,max(lo.x,max(lo.y,lo.z)));let end=min(1.0,min(hi.x,min(hi.y,hi.z)));
  if(end<=begin){return 0.0;}
  var sum=0.0;
  for(var i=0u;i<8u;i++){sum+=chamberDensity(a+delta*mix(begin,end,(f32(i)+.5)/8.0));}
  return sum*distance*(end-begin)/8.0;
}
fn coarseColumn(a:vec3f,b:vec3f)->f32{
  // Three midpoint samples make the new structured medium absorb as well as
  // glow. This is a short quadrature, not heterogeneous tracking.
  return length(b-a)*(chamberDensity(mix(a,b,1.0/6.0))+chamberDensity(mix(a,b,.5))+chamberDensity(mix(a,b,5.0/6.0)))/3.0;
}
@fragment fn beamFragment(v:BeamVertex)->@location(0) vec4f{
  let distance=v.path.x+v.along.y*v.path.y;
  let energy=v.power*exp(-4.5*v.along.x*v.along.x)*temporal(distance)*u.mediumGate.x*mediumDensity(v.world);
  var attenuation=exp(-u.mediumGate.x*(distance+length(EYE-v.world))*0.45);
  if(u.appearance.z>4.5){attenuation=exp(-u.mediumGate.x*(coarseColumn(lightPosition(),v.world)+coarseColumn(EYE,v.world))*.45);}
  if(u.structure.z>.5){attenuation=exp(-u.mediumGate.x*(flowColumn(v.origin,v.world)+flowColumn(EYE,v.world)));}
  let tint=select(vec3f(1,0.78,0.40),vec3f(0.27,0.82,1.0),u.appearance.z>3.5&&u.appearance.z<4.5);
  return vec4f(tint*v.color*energy*attenuation*115.0/max(1.0,u.optics.z),0.0);
}
@fragment fn photonFragment(v:PhotonVertex)->@location(0) vec4f{
  let r2=dot(v.local,v.local);let weight=exp(-0.5*r2);
  return vec4f(v.energy*weight*max(0.0001,u.controls.z),0.0);
}

struct ScreenVertex { @builtin(position) position:vec4f,@location(0) uv:vec2f };
@vertex fn vertexMain(@builtin(vertex_index) id:u32)->ScreenVertex{
  let uv=vec2f(f32((id<<1u)&2u),f32(id&2u));
  return ScreenVertex(vec4f(uv*vec2f(2,-2)+vec2f(-1,1),0,1),uv);
}
fn livingMedium(ro:vec3f,rd:vec3f,end:f32)->vec3f{
  let sigma=max(0.0,u.mediumGate.x);if(sigma<.0001){return vec3f(0);}
  let inverse=1.0/select(vec3f(.000001),rd,abs(rd)>vec3f(.000001));
  let a=(vec3f(-4.7,.02,-3.6)-ro)*inverse;let b=(vec3f(5,5.2,3)-ro)*inverse;
  let lo=min(a,b);let hi=max(a,b);let start=max(0.0,max(lo.x,max(lo.y,lo.z)));
  let finish=min(end,min(hi.x,min(hi.y,hi.z)));if(finish<=start){return vec3f(0);}
  let step=(finish-start)/56.0;let axis=lightDirection();let angle=.09+u.aimRadiusMode.z*.76;
  var transmission=1.0;var result=vec3f(0);
  for(var i=0u;i<56u;i++){
    let p=ro+rd*(start+(f32(i)+.5)*step);let rho=chamberDensity(p);
    if(rho<.001){continue;}
    let vl=p-lightPosition();let distance=length(vl);let incident=vl/max(distance,.001);
    let cone=smoothstep(cos(angle),cos(angle*.67),dot(incident,axis));
    // Bounded ambient fill makes the unlit plume's body readable. Direct
    // scattering uses the actual beam, occlusion and current density field.
    var illumination=vec3f(.16,.23,.29);
    if(cone>.001){
      let occluder=hitScene(lightPosition(),incident,true);
      if(occluder.distance>=distance-.02){
        let g=.38;let phase=(1.0-g*g)/(4.0*PI*pow(1.0+g*g-2.0*g*dot(incident,-rd),1.5));
        let air=exp(-sigma*flowColumn(lightPosition(),p));
        illumination+=vec3f(1,.83,.57)*u.torch.x*cone*phase*air*temporal(distance)*32.0/(1.0+distance*distance*.035);
      }
    }
    if(u.structure.w>.5){
      let field=textureSampleLevel(flowField,flowSampler,(p-vec3f(-4.7,0,-3.6))/vec3f(9.7,5.2,6.6),0.0);
      let heat=smoothstep(.02,1.25,field.g);
      illumination=mix(vec3f(.10,.56,.85),vec3f(2.6,.71,.16),heat)*2.0;
    }
    let segment=exp(-sigma*rho*step);
    result+=transmission*(1.0-segment)*illumination;transmission*=segment;
  }
  return result;
}
fn medium(ro:vec3f,rd:vec3f,end:f32)->vec3f{
  if(u.structure.z>.5){return livingMedium(ro,rd,end);}
  let sigma=max(0.0,u.mediumGate.x);if(sigma<0.0001||(u.appearance.z<0.5&&u.structure.z<.5)){return vec3f(0);}
  let mediumEntry=max(0.0,boxDistance(ro,rd,vec3f(0.15,2.5,-0.3),vec3f(4.85,2.5,3.3)).x);
  let lightDir=lightDirection();
  let angle=0.09+u.aimRadiusMode.z*0.76;let cos2=pow(cos(angle),2.0);
  let relative=ro-lightPosition();let axial=dot(relative,lightDir);let slope=dot(rd,lightDir);
  let a=slope*slope-cos2;let b=2.0*(axial*slope-cos2*dot(relative,rd));
  let c=axial*axial-cos2*dot(relative,relative);let discriminant=b*b-4.0*a*c;
  var start=0.0;var finish=min(end,17.0);
  // Integrate only the camera-ray interval inside the cone. Uniform steps over
  // the whole room otherwise leave visible rings across a narrow flashlight.
  if(discriminant<0.0){if(c<0.0){return vec3f(0);}}
  else if(abs(a)>0.00001){
    let root=sqrt(discriminant);let t0=(-b-root)/(2.0*a);let t1=(-b+root)/(2.0*a);
    let near=min(t0,t1);let far=max(t0,t1);
    if(a<0.0){start=max(start,near);finish=min(finish,far);}
    else if(c<0.0){start=max(start,far);}
    else if(near>0.0){finish=min(finish,near);}
  }
  if(abs(slope)>0.00001){
    let apex=-axial/slope;
    if(slope>0.0){start=max(start,apex);}else{finish=min(finish,apex);}
  }else if(axial<0.0){return vec3f(0);}
  if(finish<=start){return vec3f(0);}
  let samples=select(48u,36u,u.structure.z>.5);
  let step=(finish-start)/f32(samples);var result=vec3f(0);var cameraColumn=0.0;
  if(u.structure.z>.5){cameraColumn=flowColumn(ro,ro+rd*start);}
  for(var i=0u;i<samples;i++){
    let t=start+(f32(i)+0.5)*step;let p=ro+rd*t;
    if(p.y<0.02||p.y>select(5.0,5.2,u.structure.z>.5)||p.z< -3.55){continue;}
    let vl=p-lightPosition();let d=length(vl);
    let cone=smoothstep(cos(angle),cos(angle*0.67),dot(normalize(vl),lightDir));
    let cosPhase=dot(normalize(vl),-rd);let g=0.38;
    let phase=(1.0-g*g)/(4.0*PI*pow(1.0+g*g-2.0*g*cosPhase,1.5));
    var localDensity=mediumDensity(p);
    if(u.appearance.z>4.5||u.structure.z>.5){localDensity=chamberDensity(p);cameraColumn+=localDensity*step;}
    let occluder=hitScene(lightPosition(),normalize(vl),true);
    if(occluder.distance<d-0.02){continue;}
    let absorption=select(1.0,2.7,u.appearance.z>2.5&&u.appearance.z<3.5);
    // Extinction starts at the gallery boundary, not at the external camera.
    // The artistic cloud uses a homogeneous optical-depth prior.
    var trans=exp(-sigma*(max(0.0,t-mediumEntry)+max(0.0,d-0.3))*absorption*0.55);
    if(u.appearance.z>4.5){trans=exp(-sigma*(max(0.0,cameraColumn-.5*localDensity*step)+coarseColumn(lightPosition(),p))*.55);}
    if(u.structure.z>.5){trans=exp(-sigma*(max(0.0,cameraColumn-.5*localDensity*step)+flowColumn(lightPosition(),p)));}
    let photonTime=temporal(d);
    result+=mix(vec3f(1.0,0.82,0.55),vec3f(0.18,0.72,1.0),select(0.0,0.65,u.appearance.z>3.5&&u.appearance.z<4.5))*localDensity*cone*phase*trans*photonTime*sigma*step*26.0/(1.0+d*d*0.035);
  }
  return result*u.torch.x;
}
fn tonemap(x:vec3f)->vec3f{
  let a=max(vec3f(0),x*u.resolutionTime.w);
  return pow(clamp((a*(2.51*a+0.03))/(a*(2.43*a+0.59)+0.14),vec3f(0),vec3f(1)),vec3f(1.0/2.2));
}
@fragment fn fragmentMain(v:ScreenVertex)->@location(0) vec4f{
  let uv=v.uv;let storage=max(0.0001,u.controls.z);
  var raster=textureSampleLevel(rasterImage,imageSampler,uv,0.0).rgb;
  if(u.controls.w>0.5){
    let square=raster*raster;
    raster=square/max(vec3f(0.001),vec3f(1.0)-square);
  }
  let q=(uv-u.aimRadiusMode.xy)*vec2f(u.resolutionTime.x/u.resolutionTime.y,1.0);
  let radius=max(0.06,u.aimRadiusMode.z);let distance=length(q);
  var mask=1.0-smoothstep(radius*(1.0-u.surface.z),radius*1.08,distance);
  if(u.aimRadiusMode.w<0.5){mask=0.0;}
  if(u.aimRadiusMode.w>2.5){mask=1.0;}
  let rd=screenRay(uv);let h=hitScene(EYE,rd,true);
  let pixel=1.0/u.resolutionTime.xy;
  let receiverLight=(fieldAt(photonImage,uv)*0.6+fieldAt(photonImage,uv+vec2f(pixel.x*1.5,0))*0.1+fieldAt(photonImage,uv-vec2f(pixel.x*1.5,0))*0.1+fieldAt(photonImage,uv+vec2f(0,pixel.y*1.5))*0.1+fieldAt(photonImage,uv-vec2f(0,pixel.y*1.5))*0.1)/storage;
  let volumeLight=fieldAt(beamImage,uv);
  let fog=medium(EYE,rd,h.distance);
  var col=raster;
  if(mask>0.001){
    var traced=directShade(h,rd,true);
    if(h.material>1.5&&h.material<2.5){traced=glassShade(h,rd);}
    if(h.material>2.5&&h.material<3.5){
      let reflected=reflect(rd,h.normal);
      let mirror=hitScene(h.point+h.normal*0.009,reflected,true);
      var reflection=directShade(mirror,reflected,true);
      if(mirror.material>1.5&&mirror.material<2.5){reflection=glassShade(mirror,reflected);}
      let metal=palette(h.point,h.material);
      let material=bandMaterial(h.point);
      traced=mix(traced,reflection*metal*2.0,material.metal*(1.0-material.rough)*0.42);
      if(u.appearance.x>6.5&&u.appearance.x<7.5){traced=mix(traced,dielectricShade(h,rd,metalCenter(),metalRadius()),stripe(h.point));}
    }
    if(h.material>=0.0&&h.material<0.5){
      let reflected=reflect(rd,h.normal);
      let mirror=hitScene(h.point+h.normal*0.006,reflected,true);
      var reflection=directShade(mirror,reflected,true);
      if(mirror.material>1.5&&mirror.material<2.5){reflection=glassShade(mirror,reflected);}
      let fresnel=0.04+0.20*pow(1.0-max(0.0,dot(-rd,h.normal)),5.0);
      traced=mix(traced,reflection,fresnel);
    }
    if(u.aimRadiusMode.w>1.5 && h.material>=0.0 && (h.material<1.5 || h.material>3.5)){
      traced+=receiverLight*palette(h.point,h.material)*1.6;
    }
    if(h.distance<50.0&&u.structure.z>.5){traced*=exp(-u.mediumGate.x*flowColumn(EYE,h.point));}
    else if(h.distance<50.0&&u.appearance.z>0.5){traced=traced*exp(-u.mediumGate.x*h.distance*0.16);}

    col=mix(raster,traced,mask);
  }
  if(u.appearance.w>0.5&&u.aimRadiusMode.w>1.5&&h.material>=0.0&&(h.material<1.5||h.material>3.5)){col+=receiverLight*palette(h.point,h.material)*1.6*(1.0-mask);}
  if(u.aimRadiusMode.w>0.5){
    let fogReveal=select(mask,1.0,u.appearance.w>0.5);
    col+=(fog+volumeLight)*fogReveal;
  }
  let rim=exp(-pow((distance-radius*1.03)*190.0,2.0));
  if(u.aimRadiusMode.w>0.5&&u.aimRadiusMode.w<2.5){col+=vec3f(0.12,0.26,0.29)*rim*0.14;}
  let vignette=1.0-0.20*pow(length((uv-0.5)*vec2f(1.2,1.0)),1.8);
  return vec4f(tonemap(col*vignette),1.0);
}

// Float32 history is sampled explicitly because filtering float32 textures is
// optional in WebGPU. Running means stay in linear radiance before tonemapping.
fn fieldAt(image:texture_2d<f32>,uv:vec2f)->vec3f{
 let size=vec2i(textureDimensions(image));let p=uv*vec2f(size)-0.5;let a=vec2i(floor(p));let t=fract(p);
 let c00=textureLoad(image,clamp(a,vec2i(0),size-1),0).rgb;
 let c10=textureLoad(image,clamp(a+vec2i(1,0),vec2i(0),size-1),0).rgb;
 let c01=textureLoad(image,clamp(a+vec2i(0,1),vec2i(0),size-1),0).rgb;
 let c11=textureLoad(image,clamp(a+vec2i(1,1),vec2i(0),size-1),0).rgb;
 return mix(mix(c00,c10,t.x),mix(c01,c11,t.x),t.y);
}
struct MeanOutput{@location(0) photon:vec4f,@location(1) beam:vec4f};
@fragment fn meanFragment(v:ScreenVertex)->MeanOutput{
 let p=vec2i(v.position.xy);let weight=u.controls.x;
 let photons=textureLoad(photonImage,p,0);let beams=textureLoad(beamImage,p,0);
 if(weight>=1.0){return MeanOutput(photons,beams);}
 return MeanOutput(mix(textureLoad(previousPhotons,p,0),photons,weight),mix(textureLoad(previousBeams,p,0),beams,weight));
}
