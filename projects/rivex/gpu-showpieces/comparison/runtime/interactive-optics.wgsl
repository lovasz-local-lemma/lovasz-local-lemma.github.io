// LIQUID OPTICS. Original analytic composition for the official Rive GPU Canvas.
// A stylized thick lens bends a procedural still life with RGB dispersion,
// deterministic rough transmission, animated capillary waves and thin-film rim.
// This is designed screen-space optics, not a physical light transport solver.
struct Uniforms {
  resolutionTime: vec4<f32>,
  lens: vec4<f32>, // stage x, y, power, dispersion
  finish: vec4<f32>, // roughness, material, hover, grabbed
  extra: vec4<f32>, // wave amplitude, reserved
};
@group(0) @binding(0) var<uniform> u: Uniforms;
struct VertexOut { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32>, };
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOut {
  var out: VertexOut;
  let x=f32((index<<1u)&2u); let y=f32(index&2u);
  out.position=vec4<f32>(x*2.0 - 1.0,1.0-y*2.0,0.0,1.0); out.uv=vec2<f32>(x,y); return out;
}
fn sat(x:f32)->f32 { return clamp(x,0.0,1.0); }
fn rr(p:vec2<f32>,b:vec2<f32>,r:f32)->f32 {
  let q=abs(p)-b+r; return min(max(q.x,q.y),0.0)+length(max(q,vec2<f32>(0.0)))-r;
}
fn film(x:f32)->vec3<f32> { return 0.52+0.48*cos(vec3<f32>(0.0,2.1,4.2)+x); }
fn fres(n:vec3<f32>)->f32 { return pow(1.0-sat(n.z),3.0); }
fn studio(n:vec3<f32>,base:vec3<f32>,metal:f32)->vec3<f32> {
  let r=reflect(vec3<f32>(0.0,0.0,-1.0),n);
  let strip=pow(sat(1.0-abs(r.x*0.65+r.y*0.45+0.29)*3.2),11.0);
  let strip2=pow(sat(1.0-abs(r.x-r.y*0.15 - 0.68)*6.0),3.0);
  let soft=pow(sat(dot(n,normalize(vec3<f32>(-0.5,-0.65,0.9)))),3.0);
  let edge=fres(n);
  return base*(0.12+soft*0.72)+mix(vec3<f32>(1.0),base,metal)*strip*1.15
    +vec3<f32>(0.30,0.80,0.85)*strip2*0.7+base*edge*0.45;
}
fn sphere(p:vec2<f32>,c:vec2<f32>,radius:f32,base:vec3<f32>,under:vec3<f32>)->vec3<f32> {
  let q=(p-c)/radius; let r2=dot(q,q);
  if r2>1.0 { return under; }
  let n=vec3<f32>(q,sqrt(max(0.0,1.0-r2)));
  let colour=studio(n,base,0.65);
  return mix(under,colour,1.0-smoothstep(0.984,1.0,r2));
}
fn scene(p:vec2<f32>)->vec3<f32> {
  let t=u.resolutionTime.z;
  var col=vec3<f32>(0.025,0.036,0.071);
  col+=vec3<f32>(0.08,0.04,0.16)*exp(-dot(p-vec2<f32>(-0.55,-0.3),p-vec2<f32>(-0.55,-0.3))*4.0);
  col+=vec3<f32>(0.018,0.19,0.17)*exp(-dot(p-vec2<f32>(0.63,0.2),p-vec2<f32>(0.63,0.2))*5.0);
  // Fine machined optical ruling. It makes lens displacement readable at rest.
  let ruled=pow(sat(cos(p.x*200.0+p.y*52.0)),22.0);
  col+=ruled*vec3<f32>(0.019,0.045,0.044)*(0.4+0.6*sat(p.y+0.5));
  let gy=abs(fract((p.y+0.5)*14.0) - 0.5);
  col+=vec3<f32>(0.02,0.035,0.04)*(1.0-smoothstep(0.012,0.023,gy));
  // Animated silk ribbon, with a bright narrow folded edge.
  let wave=0.18*sin(p.x*3.8+t*0.14)+0.09*sin(p.x*7.0-t*0.18);
  let dy=p.y-wave+0.09;
  let ribbon=1.0-smoothstep(0.09,0.095,abs(dy));
  let turn=dy/0.095;
  let silk=mix(vec3<f32>(0.11,0.40,0.54),vec3<f32>(0.95,0.29,0.10),sat(p.x+0.5));
  let rc=silk*(0.15+0.8*pow(sat(1.0-turn*turn),0.8))+vec3<f32>(0.8,0.68,0.4)*pow(sat(1.0-abs(turn+0.57)*4.0),5.0);
  col=mix(col,rc,ribbon);
  // Soft contact shadows of the three specimen forms.
  col*=1.0 - 0.54*exp(-dot((p-vec2<f32>(0.22,0.2))*vec2<f32>(2.8,6.0),(p-vec2<f32>(0.22,0.2))*vec2<f32>(2.8,6.0)));
  col=sphere(p,vec2<f32>(-0.47,-0.23),0.18,vec3<f32>(0.77,0.20,0.36),col);
  col=sphere(p,vec2<f32>(-0.31,0.245),0.105,vec3<f32>(0.35,0.44,0.88),col);
  // Face-on compound torus: analytic surface normal, film tint and studio reflection.
  let q=(p-vec2<f32>(0.28,0.015))*vec2<f32>(1.0,1.09);
  let rad=length(q); let side=(rad - 0.245)/0.085;
  if abs(side)<1.0 {
    let z=sqrt(max(0.0,1.0-side*side));
    let n=normalize(vec3<f32>(q/max(rad,0.001)*side,z));
    let tint=mix(vec3<f32>(0.81,0.60,0.24),film(4.5+atan2(q.y,q.x)*0.8+z*2.4),0.38);
    let grain=0.97+0.03*sin(atan2(q.y,q.x)*360.0);
    let tc=studio(n,tint,0.84)*grain;
    col=mix(col,tc,1.0-smoothstep(0.965,1.0,abs(side)));
  }
  col=sphere(p,vec2<f32>(0.605,-0.28),0.105,vec3<f32>(0.24,0.91,0.67),col);
  // Small constellation pinpoints and warm floating light streak.
  col+=vec3<f32>(0.42,0.22,0.065)*exp(-abs(p.y+0.36)*150.0)*exp(-pow((p.x+0.03)*2.1,2.0));
  return col;
}
fn transmitted(p:vec2<f32>,direction:vec2<f32>,rough:f32)->vec3<f32> {
  let off=direction;
  let blur=rough*rough*0.025;
  if blur<0.001 { return scene(p+off); }
  var result=scene(p+off)*0.12;
  // Deterministic golden-angle aperture integration gives a soft frosted image,
  // rather than visibly offset copies of bright edges.
  for(var i=0u;i<16u;i++) {
    let f=f32(i)+0.5;
    let radius=sqrt(f/16.0)*blur;
    let angle=f*2.399963;
    let aperture=vec2<f32>(cos(angle),sin(angle))*radius;
    result+=scene(p+off+aperture)*0.055;
  }
  return result;
}
@fragment fn fragmentMain(in:VertexOut)->@location(0) vec4<f32> {
  let res=u.resolutionTime.xy; let t=u.resolutionTime.z;
  let p=(in.uv*res-res*0.5)/res.y;
  let c=(u.lens.xy-res*0.5)/res.y;
  let lp=p-c;
  let b=vec2<f32>(0.324,0.226); let corner=0.08;
  let d=rr(lp,b,corner);
  let eps=0.001;
  let grad=normalize(vec2<f32>(rr(lp+vec2<f32>(eps,0.0),b,corner)-rr(lp-vec2<f32>(eps,0.0),b,corner),rr(lp+vec2<f32>(0.0,eps),b,corner)-rr(lp-vec2<f32>(0.0,eps),b,corner))+vec2<f32>(0.0000001));
  let edge=exp(-abs(d)*70.0);
  let border=exp(-abs(d)*380.0);
  let inner=sat(-d/0.1);
  let mode=u.finish.y;
  let liquid=select(0.0,1.0,mode>1.5);
  let wave=sin(length(lp-vec2<f32>(0.08,0.035))*38.0-t*1.8)*sin(lp.y*21.0+lp.x*16.0+t*0.55);
  let ripple=vec2<f32>(cos(lp.x*24.0+t),sin(lp.y*19.0-t*0.8))*0.014*liquid*u.extra.x;
  var direction=(grad*0.067*pow(1.0-inner,0.7)+lp*0.18)*u.lens.z+ripple*inner;
  direction+=grad*wave*0.006*liquid;
  var col=scene(p);
  // A floating refractive plate casts a soft, coloured perimeter shadow.
  col*=1.0 - 0.3*exp(-abs(d - 0.012)*40.0);
  col+=film(lp.x*4.0-lp.y*5.0+0.4)*exp(-abs(d)*43.0)*0.14;
  if d<0.0 {
    let disp=u.lens.w*(0.055+0.26*edge);
    let red=transmitted(p,direction*(1.0+disp),u.finish.x);
    let green=transmitted(p,direction,u.finish.x);
    let blue=transmitted(p,direction*(1.0-disp),u.finish.x);
    var refracted=vec3<f32>(red.r,green.g,blue.b);
    // Frost scatters energy into a quiet milky layer without obliterating the object.
    refracted=mix(refracted,refracted*0.70+vec3<f32>(0.16,0.22,0.24),u.finish.x*0.4);
    let topLight=pow(sat(1.0-abs(lp.y+0.159+lp.x*0.13)*21.0),6.0);
    let filmColour=film(1.6+lp.x*4.0+lp.y*8.0+t*0.09);
    refracted+=vec3<f32>(0.8,0.9,1.0)*topLight*0.13;
    refracted+=filmColour*(0.075+0.22*liquid)*edge;
    refracted+=filmColour*wave*0.04*liquid;
    refracted+=vec3<f32>(0.008,0.019,0.026);
    col=mix(col,refracted,1.0-smoothstep(-0.0025,0.0,d));
  }
  let reflection=sat(-grad.x*0.58-grad.y*0.68+0.18);
  col+=border*(vec3<f32>(0.46,0.73,0.76)+vec3<f32>(0.65,0.5,0.3)*reflection)*(0.65+u.finish.z*0.45+u.finish.w*0.35);
  col+=exp(-abs(d+0.011)*260.0)*film(lp.x*6.0+lp.y*7.0)*0.16;
  // Low-strength display grading, no texture assets or external renderer.
  col=vec3<f32>(1.0)-exp(-col*1.22);
  col=pow(max(col,vec3<f32>(0.0)),vec3<f32>(0.88));
  let vignette=1.0 - 0.17*dot(in.uv - 0.5,in.uv - 0.5);
  return vec4<f32>(col*vignette,1.0);
}

