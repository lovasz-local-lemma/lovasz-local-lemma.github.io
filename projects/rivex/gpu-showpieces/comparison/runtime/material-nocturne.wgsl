// MATERIAL NOCTURNE — analytic optical still life for an actual Rive GPU Canvas.
// Source lineage: LTC Light Studio garage-shader.js (object-local procedural
// finish and height gradient; GGX/Smith; approximate separate clearcoat).
// This compact port uses 4x4 Gaussian area quadrature, NOT fitted LTC tables.
// Studio reflections use analytic rectangular environment panels. Glass traces
// both spherical interfaces at three RGB indices; blur is deterministic angular
// quadrature. Floor caustic is a designed accent, not a physical transport solve.
//
// 64 bytes, shared with the Rive script:
// resolutionTime=(width,height,timeSeconds,unused)
// control=(roughness[0..1],coat[0..1],lightAzimuth[-1..1],exposure)
// pointer=(normalizedX,normalizedY,pressed,unused)
// misc=(detail[0..2],motion[0..1],view[0beauty,1normal,2mask,3base,4coat],haze)
//
// Default: control=(0.32,0.85,0.2,1.1), misc=(1,1,0,0.15).
struct Uniforms {
  resolutionTime: vec4<f32>,
  control: vec4<f32>,
  pointer: vec4<f32>,
  misc: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
const PI: f32 = 3.141592653589793;

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOut {
  var out: VertexOut;
  let x = f32((index << 1u) & 2u);
  let y = f32(index & 2u);
  out.position = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(x,y);
  return out;
}

fn saturate(x: f32) -> f32 { return clamp(x,0.0,1.0); }
fn sq(x: f32) -> f32 { return x*x; }
fn rotateY(p: vec3<f32>, a: f32) -> vec3<f32> {
  let c=cos(a); let s=sin(a);
  return vec3<f32>(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);
}
fn time() -> f32 { return u.resolutionTime.z * clamp(u.misc.y,0.0,1.0); }
fn sphere(index: u32) -> vec4<f32> {
  if (index==0u) { return vec4<f32>(-0.83,1.04,-0.03,1.04); }
  if (index==1u) { return vec4<f32>(1.16,0.79,0.36,0.79); }
  if (index==2u) { return vec4<f32>(-0.20,0.285,1.51,0.285); }
  return vec4<f32>(1.64,0.47,-1.27,0.47);
}
struct Hit { distance: f32, point: vec3<f32>, normal: vec3<f32>, material: i32 };
fn intersectSphere(ro: vec3<f32>, rd: vec3<f32>, sp: vec4<f32>) -> f32 {
  let q=ro - sp.xyz; let b=dot(q,rd); let c=dot(q,q) - sp.w*sp.w;
  let h=b*b - c;
  if (h<0.0) { return 1e5; }
  let r=sqrt(h);
  let nearT=-b - r;
  if (nearT>0.001) { return nearT; }
  let farT=-b+r;
  return select(1e5,farT,farT>0.001);
}
fn hitScene(ro: vec3<f32>, rd: vec3<f32>, skip: i32) -> Hit {
  var hit: Hit;
  hit.distance=1e5; hit.point=vec3<f32>(0.0); hit.normal=vec3<f32>(0.0,1.0,0.0); hit.material=-1;
  if (rd.y < -0.00001) {
    let floorT=-ro.y/rd.y;
    if (floorT>0.001) { hit.distance=floorT; hit.material=4; }
  }
  if (rd.z < -0.00001) {
    let wallT=(-3.8 - ro.z)/rd.z;
    if (wallT>0.001 && wallT<hit.distance) { hit.distance=wallT; hit.material=5; }
  }
  for (var j=0u;j<4u;j=j+1u) {
    if (i32(j)==skip) { continue; }
    let d=intersectSphere(ro,rd,sphere(j));
    if (d<hit.distance) { hit.distance=d; hit.material=i32(j); }
  }
  hit.point=ro+rd*hit.distance;
  if (hit.material==5) { hit.normal=vec3<f32>(0.0,0.0,1.0); }
  if (hit.material>=0 && hit.material<4) { hit.normal=normalize(hit.point - sphere(u32(hit.material)).xyz); }
  return hit;
}
fn tangent(n: vec3<f32>) -> vec3<f32> {
  return normalize(cross(select(vec3<f32>(0.0,1.0,0.0),vec3<f32>(1.0,0.0,0.0),abs(n.y)>0.9),n));
}
fn maskField(p: vec3<f32>) -> f32 {
  // Object-local mineral veins: same construction as the LTC garage, with a
  // wider directional zebra rhythm for readable rough/smooth material regions.
  let warp=p+0.14*sin(p.zxy*5.7+vec3<f32>(0.7,1.3,2.1));
  let vein=sin(warp.y*16.0+2.1*sin(warp.x*4.0)+warp.z*3.0);
  return smoothstep(-0.20,0.20,vein);
}
fn localPoint(h: Hit) -> vec3<f32> {
  if (h.material>=4) { return h.point; }
  let q=h.point - sphere(u32(h.material)).xyz;
  return rotateY(q,time()*0.075+0.35);
}
fn microGradient(p: vec3<f32>) -> vec3<f32> {
  let a=vec3<f32>(17.0,23.0,19.0);
  let b=vec3<f32>(43.0,-29.0,37.0);
  let c=vec3<f32>(-71.0,61.0,53.0);
  return a*(0.0032*cos(dot(p,a)))+b*(0.0011*cos(dot(p,b)+1.7))+c*(0.00022*cos(dot(p,c)+3.1));
}
fn detailedNormal(h: Hit) -> vec3<f32> {
  let q=localPoint(h);
  var gradient=microGradient(q)*0.2;
  if (h.material==0) {
    let groove=cos(q.y*72.0+q.z*6.0);
    gradient+=vec3<f32>(0.001*cos(q.x*12.0),0.004*groove,0.004*6.0/72.0*groove);
  }
  if (h.material==1) { gradient*=0.16; }
  if (h.material>=4) {
    gradient=vec3<f32>(0.00025*cos(q.x*13.0+q.z*3.0),0.0,0.00025*cos(q.z*11.0 - q.x*2.0));
  } else {
    gradient=rotateY(gradient,-time()*0.075 - 0.35);
  }
  gradient=gradient - h.normal*dot(gradient,h.normal);
  return normalize(h.normal - gradient*clamp(u.misc.x,0.0,2.0));
}
fn fresnel(nv: f32,f0: vec3<f32>) -> vec3<f32> {
  return f0+(vec3<f32>(1.0) - f0)*pow(1.0 - saturate(nv),5.0);
}
fn ggx(n: vec3<f32>,v: vec3<f32>,l: vec3<f32>,roughness: f32,f0: vec3<f32>) -> vec3<f32> {
  let nv=dot(n,v); let nl=dot(n,l);
  if (nv<=0.0 || nl<=0.0) { return vec3<f32>(0.0); }
  let h=normalize(v+l);
  let alpha=max(0.0025,roughness*roughness);
  let a2=alpha*alpha;
  let nh=max(0.0,dot(n,h));
  let den=sq(nh*nh*(a2 - 1.0)+1.0);
  let distribution=a2/max(1e-7,PI*den);
  let visibility=0.5/max(1e-6,nl*sqrt(nv*nv*(1.0 - a2)+a2)+nv*sqrt(nl*nl*(1.0 - a2)+a2));
  return distribution*visibility*fresnel(dot(v,h),f0);
}
fn lightCenter(i: u32) -> vec3<f32> {
  if (i==0u) { return rotateY(vec3<f32>(-2.6,4.3,2.3),u.control.z*0.9); }
  return vec3<f32>(3.6,2.3,-1.25);
}
fn lightRadiance(i: u32) -> vec3<f32> {
  return select(vec3<f32>(7.0,6.1,4.4),vec3<f32>(7.0,11.0,13.8),i==1u);
}
fn lightAxisU(i: u32) -> vec3<f32> {
  return select(rotateY(vec3<f32>(1.7,0.0,0.0),u.control.z*0.9),vec3<f32>(0.0,0.0,1.5),i==1u);
}
fn lightAxisV(i: u32) -> vec3<f32> {
  return select(rotateY(vec3<f32>(0.0,0.0,0.65),u.control.z*0.9),vec3<f32>(0.0,1.4,0.0),i==1u);
}
fn visibilityTo(p: vec3<f32>,l: vec3<f32>,limit: f32,skip: i32) -> f32 {
  var transmittance=1.0;
  for (var j=0u;j<4u;j=j+1u) {
    if (i32(j)==skip) { continue; }
    let d=intersectSphere(p,l,sphere(j));
    if (d<limit) {
      if (j==1u) { transmittance*=0.35; } else { return 0.0; }
    }
  }
  return transmittance;
}
struct Direct { base: vec3<f32>, coat: vec3<f32> };
fn quadratureNode(i: u32) -> f32 {
  if (i==0u) { return -0.8611363; }
  if (i==1u) { return -0.3399810; }
  if (i==2u) { return 0.3399810; }
  return 0.8611363;
}
fn quadratureWeight(i: u32) -> f32 {
  return select(0.6521451,0.3478548,i==0u || i==3u);
}
fn areaLighting(h: Hit,n: vec3<f32>,v: vec3<f32>,albedo: vec3<f32>,f0: vec3<f32>,rough: f32,metal: f32) -> Direct {
  var out: Direct; out.base=vec3<f32>(0.0); out.coat=vec3<f32>(0.0);
  let coatN=normalize(mix(h.normal,n,0.18));
  for (var li=0u;li<2u;li=li+1u) {
    let axisU=lightAxisU(li); let axisV=lightAxisV(li);
    let lightN=normalize(cross(axisU,axisV));
    let area=4.0*length(cross(axisU,axisV));
    // Fixed loops keep one lexical call site per repeated optical operation.
    // Uniform-dependent bounds triggered pipeline churn in the native CLI.
    let sampleCount=16u;
    for (var k=0u;k<sampleCount;k=k+1u) {
      var dx=quadratureNode(k%4u);
      var dy=quadratureNode(k/4u);
      var quadrature=quadratureWeight(k%4u)*quadratureWeight(k/4u);
      if (sampleCount==4u) {
        dx=select(-0.57735,0.57735,(k&1u)==1u);
        dy=select(-0.57735,0.57735,(k&2u)==2u);
        quadrature=1.0;
      }
      let lp=lightCenter(li)+axisU*dx+axisV*dy;
      let delta=lp - h.point; let d2=dot(delta,delta); let l=delta*inverseSqrt(d2);
      let nl=max(0.0,dot(n,l));
      let weight=max(0.0,dot(lightN,-l))*area/max(d2,0.1)*0.25*quadrature;
      let vis=visibilityTo(h.point+h.normal*0.003,l,sqrt(d2),h.material);
      let irradiance=lightRadiance(li)*weight*vis;
      // Finite Gaussian quadrature resolves diffuse/wide lobes. Environment
      // strips below carry the stable narrow-lobe studio highlight.
      let wideRough=max(0.22,rough);
      out.base+=(albedo*(1.0 - metal)/PI+ggx(n,v,l,wideRough,f0))*irradiance*nl;
      out.coat+=ggx(coatN,v,l,0.20,vec3<f32>(0.04))*irradiance*max(0.0,dot(coatN,l));
    }
  }
  return out;
}
fn panelEnvironment(dir: vec3<f32>,rough: f32) -> vec3<f32> {
  let d=normalize(dir);
  var col=mix(vec3<f32>(0.007,0.016,0.018),vec3<f32>(0.12,0.20,0.22),smoothstep(-0.25,0.65,d.y));
  // Finite studio strip shapes convolved with a soft angular edge. These
  // fixtures match the main warm/cool palette; this is environment lighting.
  let a=rotateY(d,-u.control.z*0.9);
  let blur=0.012+rough*rough*0.30;
  let warm= smoothstep(-blur,blur,a.y - 0.12)*smoothstep(-blur,blur,0.92 - a.y)
    *smoothstep(-blur,blur,a.x+0.67)*smoothstep(-blur,blur,-0.32 - a.x);
  col+=vec3<f32>(1.7,1.32,0.82)*warm;
  let strip= smoothstep(-blur,blur,d.x - 0.32)*smoothstep(-blur,blur,0.67 - d.x)
    *smoothstep(-blur,blur,d.y+0.17)*smoothstep(-blur,blur,0.82 - d.y);
  col+=vec3<f32>(0.75,1.35,1.55)*strip;
  let rim=exp(-sq((d.x+0.03)/(0.035+rough*0.12)))*smoothstep(-0.15,0.75,d.y);
  col+=vec3<f32>(0.80,0.57,0.25)*rim;
  // Black flags split the reflected panels into long contrasting strips.
  let flag=smoothstep(-blur,blur,a.x+0.51)*smoothstep(-blur,blur,-0.475 - a.x);
  return col*(1.0 - 0.72*flag);
}
fn floorPigment(p: vec3<f32>) -> vec3<f32> {
  let pixelWidth=clamp(length(p - vec3<f32>(2.7,2.3,6.9))/(3.3*max(u.resolutionTime.y,1.0)),0.002,0.06);
  let marble=sin(p.x*3.1+p.z*1.7+0.7*sin(p.z*2.8))*0.5+0.5;
  var color=mix(vec3<f32>(0.023,0.051,0.05),vec3<f32>(0.044,0.084,0.077),marble);
  let ring=abs(length((p.xz - vec2<f32>(0.05,0.04))*vec2<f32>(1.0,0.87)) - 2.12);
  let outer=1.0 - smoothstep(max(0.0,0.016 - pixelWidth),0.018+pixelWidth,ring);
  let ring2=abs(length((p.xz - vec2<f32>(0.05,0.04))*vec2<f32>(1.0,0.87)) - 2.17);
  let inset=1.0 - smoothstep(max(0.0,0.007 - pixelWidth),0.009+pixelWidth,ring2);
  color=mix(color,vec3<f32>(0.44,0.28,0.094),max(outer,inset)*0.85);
  let gx=abs(fract(p.x*0.78+0.5) - 0.5);
  let gz=abs(fract(p.z*0.78+0.5) - 0.5);
  let grout=max(1.0 - smoothstep(0.0,0.003+pixelWidth,gx),1.0 - smoothstep(0.0,0.003+pixelWidth,gz));
  return color*(1.0 - 0.52*grout);
}
fn roughMask(q: vec3<f32>) -> f32 {
  return smoothstep(-0.22,0.22,sin(q.y*13.0+2.4*sin(q.x*3.2)+q.z*4.0));
}
fn shadeOpaque(h: Hit,rd: vec3<f32>,reflectionDepth: bool) -> vec3<f32> {
  let q=localPoint(h); let n=detailedNormal(h); let v=-rd;
  var mask=maskField(q);
  var rough=clamp(u.control.x,0.05,0.95);
  var coat=clamp(u.control.y,0.0,1.0);
  var pigment=vec3<f32>(0.028,0.045,0.044);
  var f0=vec3<f32>(0.055); var metal=0.15;
  if (h.material==0) {
    pigment=mix(vec3<f32>(0.007,0.013,0.014),vec3<f32>(0.62,0.38,0.11),mask);
    f0=mix(vec3<f32>(0.06,0.066,0.07),vec3<f32>(0.82,0.43,0.13),mask);
    rough=mix(0.13+rough*0.12,0.22+rough*0.53,mask);
    metal=mix(0.40,1.0,mask);
  } else if (h.material==2) {
    pigment=vec3<f32>(0.13,0.06,0.11); f0=vec3<f32>(0.56,0.23,0.38);
    rough=0.12+rough*0.16; metal=0.98; coat=0.45*coat;
  } else if (h.material==3) {
    pigment=vec3<f32>(0.07,0.16,0.19);f0=vec3<f32>(0.38,0.62,0.70);
    mask=roughMask(q);rough=mix(0.08,0.38,mask)+rough*0.15;metal=1.0;coat=0.35*coat;
  } else if (h.material==4) {
    pigment=floorPigment(h.point);f0=vec3<f32>(0.048);
    rough=0.42+rough*0.20;metal=0.06;coat=0.0;
  } else {
    pigment=vec3<f32>(0.01,0.034,0.038);f0=vec3<f32>(0.025);
    rough=0.82;metal=0.0;coat=0.0;
  }
  let materialView=i32(u.misc.z+0.5);
  if (materialView==1) { return n*0.5+vec3<f32>(0.5); }
  if (materialView==2) { return mix(vec3<f32>(0.035,0.15,0.18),vec3<f32>(0.95,0.61,0.16),mask); }
  let direct=areaLighting(h,n,v,pigment,f0,rough,metal);
  let r=reflect(rd,n);
  let fr=fresnel(dot(n,v),f0);
  var reflected=panelEnvironment(r,rough);
  if (h.material==4 && !reflectionDepth) {
    // One deliberate reflection level preserves the main sphere silhouettes on
    // the lacquered stage; no recursive transport or hidden accumulation.
    let rh=hitScene(h.point+n*0.008,r,4);
    if (rh.material>=0 && rh.material<4) {
      let amount=(1.0 - rough)*0.48;
      let silhouette=mix(vec3<f32>(0.045,0.071,0.063),vec3<f32>(0.52,0.29,0.09),maskField(rh.point));
      reflected=mix(reflected,silhouette*panelEnvironment(reflect(r,rh.normal),0.3),amount);
    }
  }
  let ambientDiffuse=pigment*(1.0 - metal)*(0.08+0.13*max(0.0,n.y));
  let environmentWeight=select(0.62+0.38*metal,0.12,h.material>=4);
  let base=direct.base+fr*reflected*environmentWeight+ambientDiffuse;
  let coatN=normalize(mix(h.normal,n,0.18));
  let coatFresnel=0.04+0.96*pow(1.0 - max(0.0,dot(v,coatN)),5.0);
  let transmission=(1.0 - coat*coatFresnel)*(1.0 - coat*(0.04+0.96/21.0));
  let top=coat*(direct.coat+panelEnvironment(reflect(rd,coatN),0.09)*coatFresnel);
  if (materialView==3) { return base*transmission; }
  if (materialView==4) { return top; }
  return base*transmission+top;
}
fn roomRay(ro: vec3<f32>,rd: vec3<f32>,skip: i32) -> vec3<f32> {
  let h=hitScene(ro,rd,skip);
  if (h.material==5) {
    let glow=exp(-dot(h.point.xy - vec2<f32>(1.5,2.1),h.point.xy - vec2<f32>(1.5,2.1))*0.13);
    return vec3<f32>(0.014,0.034,0.041)+vec3<f32>(0.018,0.068,0.081)*glow;
  }
  if (h.material==4) {
    // Smooth bounded floor response keeps unresolved grout out of refracted rays.
    let warm=exp(-sq((h.point.x+2.0)*0.4) - sq(h.point.z*0.3));
    return floorPigment(h.point)*1.4+vec3<f32>(0.055,0.037,0.014)*warm;
  }
  if (h.material>=0 && h.material!=1) {
    // Glass sees actual analytic room intersections and coarse object response,
    // not a framebuffer copy. This branch is intentionally one-level.
    let n=h.normal;
    let f=select(vec3<f32>(0.12,0.17,0.16),floorPigment(h.point)*1.8,h.material==4);
    let stripe=maskField(h.point - sphere(0u).xyz);
    let base=select(mix(vec3<f32>(0.015,0.025,0.028),vec3<f32>(0.51,0.31,0.10),stripe),f,h.material==4);
    let r=reflect(rd,n);
    return base*(0.35+0.5*max(0.0,n.y))+panelEnvironment(r,0.22)*select(0.36,0.12,h.material==4);
  }
  return panelEnvironment(rd,0.04)*0.6;
}
fn dielectricFresnel(ci: f32,etaI: f32,etaT: f32) -> f32 {
  let c=clamp(ci,0.0,1.0);let eta=etaI/etaT;
  let st2=eta*eta*max(0.0,1.0 - c*c);
  if(st2>=1.0) {return 1.0;}
  let ct=sqrt(1.0 - st2);
  let rs=(etaT*c - etaI*ct)/max(0.00001,etaT*c+etaI*ct);
  let rp=(etaI*c - etaT*ct)/max(0.00001,etaI*c+etaT*ct);
  return 0.5*(rs*rs+rp*rp);
}
fn throughGlass(h: Hit,rd: vec3<f32>,ior: f32) -> vec3<f32> {
  let inside=refract(rd,h.normal,1.0/ior);
  if(dot(inside,inside)<0.00001) {return panelEnvironment(reflect(rd,h.normal),0.1);}
  let origin=h.point - h.normal*0.0015;
  let d=intersectSphere(origin,inside,sphere(1u));
  let exitP=origin+inside*d;
  let exitN=normalize(exitP - sphere(1u).xyz);
  let outD=refract(inside,-exitN,ior);
  if(dot(outD,outD)<0.00001) {return panelEnvironment(reflect(inside,-exitN),0.1)*0.5;}
  let normalD=normalize(outD);
  let tx=1.0 - dielectricFresnel(dot(inside,exitN),ior,1.0);
  let beer=exp(-vec3<f32>(0.08,0.012,0.015)*d);
  let blur=roughMask(localPoint(h))*(0.018+0.045*clamp(u.control.x,0.0,1.0));
  let tan=tangent(normalD);
  let bi=cross(normalD,tan);
  // Fixed 5-ray blur is explicitly an appearance quadrature, not rough-glass MIS.
  let tapCount=5u;
  var result=vec3<f32>(0.0);
  for (var tap=0u;tap<tapCount;tap=tap+1u) {
    var sampleD=normalD;
    if (tap==1u) { sampleD=normalize(normalD+tan*blur+bi*blur*0.41); }
    if (tap==2u) { sampleD=normalize(normalD - tan*blur - bi*blur*0.41); }
    if (tap==3u) { sampleD=normalize(normalD+bi*blur - tan*blur*0.41); }
    if (tap==4u) { sampleD=normalize(normalD - bi*blur+tan*blur*0.41); }
    let weight=select(select(0.15,0.4,tap==0u),1.0,tapCount==1u);
    result+=roomRay(exitP+exitN*0.003,sampleD,1)*weight;
  }
  return result*beer*tx;
}
fn shadeGlass(h: Hit,rd: vec3<f32>) -> vec3<f32> {
  let mask=roughMask(localPoint(h));let n=detailedNormal(h);
  if (i32(u.misc.z+0.5)==1) {return n*0.5+vec3<f32>(0.5);}
  if (i32(u.misc.z+0.5)==2) {return mix(vec3<f32>(0.04,0.14,0.16),vec3<f32>(0.85,0.68,0.29),mask);}
  let channelCount=3u;
  var transmitted=vec3<f32>(0.0);
  for (var channel=0u;channel<channelCount;channel=channel+1u) {
    var ior=1.515;
    if (channelCount==3u) { ior=select(select(1.523,1.515,channel==1u),1.509,channel==0u); }
    let sampleColor=throughGlass(h,rd,ior);
    if (channelCount==1u) { transmitted=sampleColor; }
    else { transmitted[channel]=sampleColor[channel]; }
  }
  let f=dielectricFresnel(max(0.0,dot(-rd,h.normal)),1.0,1.515);
  let reflection=panelEnvironment(reflect(rd,n),0.022+mask*0.19);
  let clean=transmitted*(1.0 - f)+reflection*f;
  // Narrow rough/smooth boundary sheen makes both surface lobes legible.
  let groove=pow(max(0.0,1.0 - abs(mask*2.0 - 1.0)),5.0);
  return clean+vec3<f32>(0.025,0.07,0.076)*groove*(0.15+0.85*f);
}
fn sceneColor(ro: vec3<f32>,rd: vec3<f32>) -> vec3<f32> {
  let h=hitScene(ro,rd,-1);
  var color=vec3<f32>(0.008,0.021,0.023);
  if (h.material==1) {color=shadeGlass(h,rd);}
  else if(h.material>=0) {color=shadeOpaque(h,rd,false);}
  else {
    color+=vec3<f32>(0.018,0.03,0.027)*exp(-sq((rd.y+0.05)*3.0));
  }
  if(h.material==4) {
    // Art-directed receiving-plane spectral accent. It is not an estimator.
    let q=h.point.xz - vec2<f32>(1.17,0.15);
    let arc=length(q*vec2<f32>(1.0,1.4));
    let ridge=exp(-sq((arc - 0.66)/0.065))*exp(-dot(q,q)*0.5);
    let offset=atan2(q.y,q.x)*2.1;
    let spectrum=0.5+0.5*cos(offset+vec3<f32>(0.0,2.1,4.2));
    color+=spectrum*ridge*0.15;
  }
  let depth=min(h.distance,14.0);
  let haze=clamp(u.misc.w,0.0,1.0);
  let tr=exp(-depth*haze*0.065);
  color=color*tr+vec3<f32>(0.035,0.064,0.067)*(1.0 - tr);
  return color;
}
fn aces(c: vec3<f32>) -> vec3<f32> {
  let x=max(vec3<f32>(0.0),c);
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),vec3<f32>(0.0),vec3<f32>(1.0));
}
@fragment fn fragmentMain(input: VertexOut) -> @location(0) vec4<f32> {
  let resolution=max(u.resolutionTime.xy,vec2<f32>(1.0));
  let uv=input.uv;
  let screen=(uv*2.0 - vec2<f32>(1.0))*vec2<f32>(resolution.x/resolution.y,-1.0);
  let ro=vec3<f32>(2.7,2.3,6.9);
  let lookAt=vec3<f32>(0.03,0.94,0.1);
  let forward=normalize(lookAt - ro);
  let right=normalize(cross(forward,vec3<f32>(0.0,1.0,0.0)));
  let up=cross(right,forward);
  let aaCount=2u;
  var color=vec3<f32>(0.0);
  for (var sampleIndex=0u;sampleIndex<aaCount;sampleIndex=sampleIndex+1u) {
    let aa=select(0.0,select(-0.5,0.5,sampleIndex==1u)/resolution.y,aaCount==2u);
    let rd=normalize(forward*3.3+right*(screen.x+aa)+up*(screen.y+aa));
    color+=sceneColor(ro,rd)/f32(aaCount);
  }
  let vignette=1.0 - 0.19*dot(uv - 0.5,uv - 0.5);
  color=aces(color*max(0.05,u.control.w))*vignette;
  // Explicit display transfer: render target receives display-ready art.
  color=pow(color,vec3<f32>(1.0/2.2));
  return vec4<f32>(color,1.0);
}
