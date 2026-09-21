// Fixed-edge square membrane. Two degenerate (n,m)/(m,n) eigenfunctions.
// Analytic geometry and normals; nodal grains illustrate |mode| near zero.
struct V { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> }
struct U { viewport: vec4<f32>, mode: vec4<f32>, look: vec4<f32>, unused: vec4<f32> }
@group(0) @binding(0) var<uniform> u: U;
const PI: f32 = 3.141592653589793;
@vertex fn vertexMain(@builtin(vertex_index) index: u32)->V {
  var corners = array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0),vec2<f32>(3.0,-1.0),vec2<f32>(-1.0,3.0));
  var out: V; out.position = vec4<f32>(corners[index],0.0,1.0); out.uv = corners[index] * 0.5 + 0.5; return out;
}
fn hash(p: vec2<f32>)->f32 { return fract(sin(dot(p,vec2<f32>(127.1,311.7))) * 43758.5453); }
// Continuous fixed-edge square membrane, evaluated in normalized coordinates.
// The impulse bank uses the same spatial weights and decay as the audio player.
fn modalShape(p: vec2<f32>, n:f32, m:f32)->vec3<f32> {
  let v=(p+2.0)*0.25;let ax=PI*n*v.x;let ay=PI*m*v.y;
  return vec3<f32>(sin(ax)*sin(ay),PI*0.25*n*cos(ax)*sin(ay),PI*0.25*m*sin(ax)*cos(ay));
}
fn mode(p: vec2<f32>)->vec3<f32> {
  if u.look.x<0.5 { return (modalShape(p,u.mode.x,u.mode.y)+u.mode.z*modalShape(p,u.mode.y,u.mode.x))/(1.0+abs(u.mode.z)); }
  var result=vec3<f32>(0.0);
  let age=u.look.y;
  for(var ni=1;ni<=3;ni++) {for(var mi=1;mi<=3;mi++) {
    let n=f32(ni);let m=f32(mi);let order=n*n+m*m;let ratio=sqrt(order*0.5);
    let weight=sin(PI*n*u.look.z)*sin(PI*m*u.look.w)*exp(-0.032*order)/ratio;
    let decay=(0.25+2.4*u.unused.x)*(1.0+0.055*order);
    let q=weight*sin(PI*0.5*age*ratio)*exp(-decay*age)/4.6;
    result+=modalShape(p,n,m)*q*4.0;
  }}
  return result;
}
fn amplitude()->f32 {
  if u.look.x>0.5 {return u.mode.w;}
  return u.mode.w*cos(u.viewport.z*sqrt(u.mode.x*u.mode.x+u.mode.y*u.mode.y)/sqrt(13.0));
}
fn height(p:vec2<f32>)->f32 {return 0.54+amplitude()*mode(p).x;}
fn box(ro:vec3<f32>,rd:vec3<f32>,bmin:vec3<f32>,bmax:vec3<f32>)->vec2<f32> {
  let a = (bmin - ro)/rd; let b = (bmax - ro)/rd;
  let near = min(a,b); let far = max(a,b);
  return vec2<f32>(max(max(near.x,near.y),near.z),min(min(far.x,far.y),far.z));
}
fn intersect(ro:vec3<f32>,rd:vec3<f32>)->f32 {
  let ab = box(ro,rd,vec3<f32>(-2.0,0.03,-2.0),vec3<f32>(2.0,1.05,2.0));
  if ab.x > ab.y || ab.y < 0.0 { return -1.0; }
  var t = max(ab.x,0.0);
  var prev = t;
  var prevD = (ro + rd*t).y - height((ro+rd*t).xz);
  let step = (ab.y - t)/64.0;
  for(var i=1;i<=64;i++) {
    t = max(ab.x,0.0) + f32(i)*step;
    let p = ro + rd*t; let d = p.y-height(p.xz);
    if d*prevD <= 0.0 {
      var lo = prev; var hi = t; let sign0 = prevD;
      for(var j=0;j<8;j++) { let mid = (lo+hi)*0.5; let q = ro+rd*mid; if (q.y-height(q.xz))*sign0>0.0 { lo=mid; } else { hi=mid; } }
      return (lo+hi)*0.5;
    }
    prev=t; prevD=d;
  }
  return -1.0;
}
fn environment(d:vec3<f32>)->vec3<f32> {
  var c = mix(vec3<f32>(0.006,0.015,0.020),vec3<f32>(0.065,0.11,0.125),smoothstep(-0.4,0.8,d.y));
  let panelA = exp(-pow((d.x + 0.50)/0.38,8.0)-pow((d.y - 0.54)/0.11,6.0));
  let panelB = exp(-pow((d.z - 0.35)/0.5,8.0)-pow((d.y - 0.72)/0.055,4.0));
  let amber = exp(-pow((d.x - 0.80)/0.13,4.0)-pow((d.y - 0.18)/0.56,4.0));
  let cyan = exp(-pow((d.z + 0.80)/0.13,4.0)-pow((d.y - 0.24)/0.65,4.0));
  c += vec3<f32>(1.0,0.91,0.72)*panelA*3.8;
  c += vec3<f32>(0.64,0.96,1.0)*panelB*3.0;
  c += vec3<f32>(1.0,0.46,0.13)*amber*2.1;
  c += vec3<f32>(0.04,0.6,0.62)*cyan*1.9;
  return c;
}
fn ggx(n:vec3<f32>,v:vec3<f32>,l:vec3<f32>,f0:vec3<f32>,rough:f32)->vec3<f32> {
  let nl = max(dot(n,l),0.0); let nv = max(dot(n,v),0.001); let h=normalize(v+l); let nh=max(dot(n,h),0.0);
  let a=rough*rough; let a2=a*a; let de=nh*nh*(a2 - 1.0)+1.0; let d=a2/(PI*de*de);
  let k=(rough+1.0)*(rough+1.0)/8.0;
  let g=nv/(nv*(1.0-k)+k)*nl/(nl*(1.0-k)+k);
  let f=f0+(vec3<f32>(1.0)-f0)*pow(1.0-max(dot(h,v),0.0),5.0);
  return f*d*g*nl/(4.0*max(nv*nl,0.001));
}
fn shadeMetal(p:vec3<f32>,n0:vec3<f32>,v:vec3<f32>,rim:bool)->vec3<f32> {
  let field=mode(p.xz);
  let grain=sin(p.x*170.0+sin(p.z*47.0)*2.0);
  let n=normalize(n0+vec3<f32>(grain*0.002,0.0,grain*0.001));
  let metal = mix(vec3<f32>(0.64,0.47,0.20),vec3<f32>(0.20,0.43,0.41),smoothstep(-0.25,0.3,field.x)*0.7);
  let f0=select(metal,vec3<f32>(0.68,0.47,0.19),rim);
  let rough=select(0.23,0.18,rim);
  var c = environment(reflect(-v,n))*f0*0.46;
  c += f0*0.06;
  let lightA=normalize(vec3<f32>(-2.0,4.5,1.2)-p);
  let lightB=normalize(vec3<f32>(3.5,3.0,-3.5)-p);
  c += ggx(n,v,lightA,f0,rough)*vec3<f32>(1.0,0.72,0.32)*1.8;
  c += ggx(n,v,lightB,f0,rough)*vec3<f32>(0.18,0.75,0.84)*1.8;
  if !rim {
    // The sampled eigenfunction determines where illustrative grains appear.
    // They do not migrate or feed back into the motion simulation.
    let cell=p.xz*82.0; let id=floor(cell); let jitter=vec2<f32>(hash(id),hash(id+17.4));
    let center=(id+jitter)/82.0; let ff=mode(center).x;
    let nodal=exp(-ff*ff/0.0012)*select(1.0,0.32,u.look.x>0.5);
    let dotRadius=length(fract(cell)-jitter);
    let fleck=exp(-dotRadius*dotRadius/0.030)*nodal;
    let nodeLine=exp(-field.x*field.x/0.00022)*select(1.0,0.18,u.look.x>0.5);
    c += vec3<f32>(0.92,0.58,0.17)*fleck*(1.3+2.0*hash(id+4.0));
    c += vec3<f32>(0.12,0.38,0.31)*nodeLine*0.55;
    let scratch=pow(0.5+0.5*sin(p.x*140.0+p.z*45.0),32.0);
    c += vec3<f32>(0.015,0.010,0.006)*scratch;
  }
  return c;
}
@fragment fn fragmentMain(v:V)->@location(0) vec4<f32> {
  let uv = (v.uv*2.0 - 1.0)*vec2<f32>(1040.0/640.0,1.0);
  let ro=vec3<f32>(4.35,4.55,5.75); let aim=vec3<f32>(0.0,0.25,0.0);
  let f=normalize(aim-ro); let right=normalize(cross(f,vec3<f32>(0.0,1.0,0.0))); let up=cross(right,f);
  let rd=normalize(f*3.0+right*uv.x+up*uv.y);
  var c=vec3<f32>(0.010,0.024,0.029);
  var nearest=1000.0;
  let floorT=(-0.24-ro.y)/rd.y;
  if floorT>0.0 {
    let p=ro+rd*floorT; nearest=floorT;
    let fall=exp(-dot(p.xz,p.xz)*0.028);
    let shadow=1.0 - 0.80*exp(-pow(p.x/2.45,6.0)-pow(p.z/2.45,6.0));
    c=vec3<f32>(0.022,0.04,0.043)*(0.25+0.75*fall)*shadow;
    let radial=length(p.xz);
    let fineRing=exp(-pow((radial - 3.15)/0.009,2.0));
    let wideRing=exp(-pow((radial - 3.29)/0.006,2.0));
    c+=vec3<f32>(0.07,0.045,0.016)*(fineRing+wideRing)*fall;
    c+=vec3<f32>(0.03,0.012,0.003)*exp(-dot(p.xz-vec2<f32>(1.0,0.6),p.xz-vec2<f32>(1.0,0.6))*0.13);
  }
  // Thin machined square frame around the fixed membrane perimeter.
  let rimT=(0.54-ro.y)/rd.y;
  if rimT>0.0 && rimT<nearest {
    let p=ro+rd*rimT; let q=abs(p.xz); let edge=max(q.x,q.y);
    if edge<2.14 && edge>2.0 {
      var normal=vec3<f32>(0.0,1.0,0.0);
      let bevel=sin((edge - 2.0)/0.14*PI);
      normal=normalize(vec3<f32>(select(0.0,sign(p.x),q.x>q.y)*cos((edge - 2.0)/0.14*PI)*0.6,1.0,select(sign(p.z),0.0,q.x>q.y)*cos((edge - 2.0)/0.14*PI)*0.6));
      c=shadeMetal(p,normal,-rd,true)*(0.5+0.5*bevel); nearest=rimT;
    }
  }
  let t=intersect(ro,rd);
  if t>0.0 && t<nearest {
    let p=ro+rd*t; let d=mode(p.xz); let a=amplitude();
    let n=normalize(vec3<f32>(-a*d.y,1.0,-a*d.z));
    c=shadeMetal(p,n,-rd,false);
    let edgeFade=(1.0 - smoothstep(1.88,2.0,max(abs(p.x),abs(p.z))));
    c*=0.64+0.36*edgeFade;
  }
  let vignette=1.0 - 0.13*dot(v.uv - 0.5,v.uv - 0.5);
  c*=vignette;
  c=(c*(2.51*c+0.03))/(c*(2.43*c+0.59)+0.14);
  return vec4<f32>(pow(clamp(c,vec3<f32>(0.0),vec3<f32>(1.0)),vec3<f32>(1.0/2.2)),1.0);
}


