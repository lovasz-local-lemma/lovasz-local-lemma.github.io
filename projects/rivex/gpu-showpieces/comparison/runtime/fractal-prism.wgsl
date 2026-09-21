// The desk receives a host-traced finite-prism spectrum. The Julia image
// behind the glass keeps its separate designed screen-space transmission model.
struct Uniforms {
  resolutionTime: vec4<f32>,
  lens: vec4<f32>,
  fractal: vec4<f32>,
  touch: vec4<f32>,
  optics: vec4<f32>, // shape, desk study, chromatic split, reserved
};
@group(0) @binding(0) var<uniform> u: Uniforms;
struct PrismLight {profile:array<vec4<f32>,512>, paths:array<vec4<f32>,48>};
@group(0) @binding(1) var<storage,read> prismLight:PrismLight;
fn receiverLight(x:f32)->vec3<f32>{let sample=clamp((x+.8125)/1.625*512.0-.5,0.0,511.0);let a=u32(floor(sample));return mix(prismLight.profile[a].rgb,prismLight.profile[min(a+1u,511u)].rgb,fract(sample));}
struct VertexOut { @builtin(position) position:vec4<f32>, @location(0) uv:vec2<f32>, };
@vertex fn vertexMain(@builtin(vertex_index) index:u32)->VertexOut {
  var out:VertexOut;
  let x=f32((index<<1u)&2u);let y=f32(index&2u);
  out.position=vec4<f32>(x*2.0 - 1.0,1.0 - y*2.0,0.0,1.0);out.uv=vec2<f32>(x,y);return out;
}
fn sat(x:f32)->f32{return clamp(x,0.0,1.0);}
fn rotate(p:vec2<f32>,angle:f32)->vec2<f32>{let c=cos(angle);let s=sin(angle);return vec2<f32>(c*p.x - s*p.y,s*p.x+c*p.y);}
fn segment(p:vec2<f32>,a:vec2<f32>,b:vec2<f32>)->f32{let v=b - a;return length(p - a - v*sat(dot(p - a,v)/dot(v,v)));}
fn film(v:f32)->vec3<f32>{return .55+.45*cos(vec3<f32>(.3,2.4,4.6)+v);}
fn triangle(p0:vec2<f32>,r:f32)->f32 {
  var p=p0;let k=1.7320508;p.x=abs(p.x) - r;p.y=p.y+r/k;
  if p.x+k*p.y>0.0 {p=vec2<f32>(p.x - k*p.y, - k*p.x - p.y)*.5;}
  p.x -=clamp(p.x, - 2.0*r,0.0);return  - length(p)*sign(p.y);
}
fn roundedBox(p:vec2<f32>,b:vec2<f32>,r:f32)->f32 {let q=abs(p)-b+r;return length(max(q,vec2<f32>(0.0)))+min(max(q.x,q.y),0.0)-r;}
fn lensShape(p:vec2<f32>)->f32 {
 if u.optics.x<.5 {return triangle(p,.168)-.014;}
 if u.optics.x<1.5 {return length(p)-.161;}
 if u.optics.x<2.5 {return roundedBox(p,vec2<f32>(.188,.121),.026);}
 if u.optics.x<3.5 {return abs(length(p)-.125)-.036;}
 return roundedBox(p,vec2<f32>(.095,.180),.031);
}
fn chalk(p:vec2<f32>,centre:vec2<f32>,r:f32)->f32 {
 let q=p-centre;let a=atan2(q.y,q.x);let edge=abs(length(q)-r-.0008*sin(a*37.0));
 let grain=.65+.35*sin(p.x*2783.0)*sin(p.y*2113.0);
 return (1.0-smoothstep(.0005,.0022,edge))*grain;
}
fn julia(p:vec2<f32>, parameter:vec2<f32>)->vec3<f32> {
  let scale=3.6/(1.0+u.fractal.z*1.8);
  var z=(p - vec2<f32>( - .075, - .025))*scale;
  let c=parameter;var derivative=vec2<f32>(1.0,0.0);
  var count=0.0;var trap=20.0;var sum=0.0;
  for(var i=0;i<80;i++){
    derivative=2.0*vec2<f32>(z.x*derivative.x - z.y*derivative.y,z.x*derivative.y+z.y*derivative.x);
    z=vec2<f32>(z.x*z.x - z.y*z.y,2.0*z.x*z.y)+c;
    trap=min(trap,abs(length(z) - .58));sum+=exp( - 5.0*abs(z.y));
    count=f32(i);if dot(z,z)>200.0 {break;}
  }
  let r=max(length(z),1.001);
  let smoothCount=count+1.0 - log2(max(.01,log2(r)));
  let dist=clamp(.5*log(r)*r/max(length(derivative),.00001),0.0,2.0);
  let inside=select(0.0,1.0,count>78.0);
  let copper=vec3<f32>(.85,.40,.16);let gold=vec3<f32>(.97,.78,.39);let blue=vec3<f32>(.025,.34,.43);
  var pigment=mix(blue,gold,sat(.5+.5*sin(smoothCount*.19+.7)));
  pigment=mix(pigment,copper,.3+.25*cos(smoothCount*.07));
  if u.fractal.w>.5 && u.fractal.w<1.5 {pigment=mix(vec3<f32>(.77,.15,.13),vec3<f32>(.07,.33,.62),sat(.5+.5*sin(smoothCount*.21)));}
  if u.fractal.w>1.5 {pigment=mix(vec3<f32>(.17,.39,.35),vec3<f32>(.97,.89,.60),sat(.5+.5*sin(smoothCount*.13)));}
  let edge=exp( - dist*90.0);let engraving=pow(sat(.5+.5*cos(smoothCount*2.7)),7.0);
  let vein=exp( - trap*70.0);
  var col=vec3<f32>(.019,.065,.076)+pigment*(edge*.70+vein*.34);
  col+=gold*engraving*edge*.27;
  col=mix(col,vec3<f32>(.012,.028,.039)+blue*sat(sum/35.0)*.48+gold*vein*.18,inside);
  // Thin relief edges make escape - time structure read like enamel and inlay.
  col+=vec3<f32>(.30,.66,.70)*exp( - dist*330.0)*.13;
  return col;
}
fn world(p:vec2<f32>, parameter:vec2<f32>)->vec3<f32> {
  var col=vec3<f32>(.018,.045,.057);
  col+=vec3<f32>(.08,.13,.15)*exp( - dot(p - vec2<f32>( - .3, - .15),p - vec2<f32>( - .3, - .15))*2.4);
  let fine=1.0 - smoothstep(.012,.03,abs(fract((p.x+.82)*24.0) - .5));
  col+=vec3<f32>(.036,.050,.046)*fine*(.4+.6*sat(p.y+.5));
  // A quiet geometric theatre surrounds the complex - plane specimen.
  let floor=1.0 - smoothstep(.392,.395,p.y);
  let ground=mix(vec3<f32>(.10,.16,.16),vec3<f32>(.22,.26,.24),sat((p.y - .37)*8.0));
  col=mix(ground,col,floor);
  let frame=roundedBox(p+vec2<f32>(.045,.035),vec2<f32>(.72,.355),.018);
  let wood=.58+.2*sin(p.x*390.0+sin(p.y*40.0));
  let edge=1.0-smoothstep(.008,.012,abs(frame));
  col=mix(col,vec3<f32>(.30,.25,.16)*wood+vec3<f32>(.13,.12,.08),edge);
  col+=vec3<f32>(.32,.32,.23)*(1.0-smoothstep(.0008,.002,abs(frame+.007)));
  let mask=1.0-smoothstep(-.010,-.008,frame);
  let dust=.97+.03*sin(p.x*2100.0)*sin(p.y*1861.0);
  col=mix(col,julia(p,parameter)*dust,mask);
  col+=vec3<f32>(.66,.63,.45)*chalk(p,vec2<f32>(-.651,.252),.043)*mask;
  col+=vec3<f32>(.76,.51,.33)*chalk(p,vec2<f32>(.606,-.293),.023)*mask;
  // Receiver coordinates match the host's ray/desk intersections. No spectrum
  // is invented when every transmitted ray misses this finite receiver.
  if u.optics.y>.5 && u.optics.x<.5 && p.y>.399 {
    let strip=exp(-.5*pow((p.y-.446)/.011,2.0));
    let irradiance=receiverLight(p.x);
    col+=irradiance*strip*.052;
    col+=irradiance*exp(-.5*pow((p.y-.446)/.032,2.0))*.007;
  }
  let shadow=exp( - pow((p.x - .22)*6.0,2.0) - pow((p.y - .432)*52.0,2.0));
  col*=1.0 - shadow*.5;
  return col;
}
@fragment fn fragmentMain(in:VertexOut)->@location(0) vec4<f32> {
  let pixel=in.uv*u.resolutionTime.xy;
  let p=(pixel - u.resolutionTime.xy*.5)/u.resolutionTime.y;
  let centre=(u.lens.xy - u.resolutionTime.xy*.5)/u.resolutionTime.y;
  let angle=u.lens.w*6.2831853;
  let q=rotate(p - centre, - angle);
  let d=lensShape(q);
  var col=world(p,u.fractal.xy);
  // The prism's offset shadow and dispersion fan remain tied to its Rive node.
  let shadowD=lensShape(rotate(p - centre - vec2<f32>(.018,.030), - angle)) - .006;
  col*=1.0 - (1.0 - smoothstep( - .015,.03,shadowD))*.25;
  // Thin diagnostic paths show the actual transmitted/TIR ray construction.
  // Their brightness is for legibility; the receiver uses energy accumulation.
  if u.optics.y>.5 && u.optics.x<.5 {
    for(var k=0u;k<24u;k++){
      let line=prismLight.paths[k*2u];let tint=prismLight.paths[k*2u+1u];
      if tint.a>0.0 {let distance=segment(p,line.xy,line.zw);col+=tint.rgb*tint.a*exp(-distance*distance/0.000002)*.16;}
    }
  }
  if d<.004 {
    let e=.0008;
    let grad=normalize(vec2<f32>(lensShape(q+vec2<f32>(e,0.0)) - lensShape(q - vec2<f32>(e,0.0)),lensShape(q+vec2<f32>(0.0,e)) - lensShape(q - vec2<f32>(0.0,e))));
    let bevel=1.0 - smoothstep( - .043, - .001,d);
    let interior=1.0 - smoothstep( - .022, - .001,d);
    let facet=normalize(q+vec2<f32>(.0001,.0001));
    let bend=rotate(mix(grad,facet,.28),angle);
    var mapped=centre+(p - centre)*(.72 - .08*u.fractal.z)+bend*(.025+.021*bevel);
    var fiberCoverage=1.0;
    if u.optics.x>3.5 {
      // An ideal coherent faceplate transfers each input fiber to the same
      // output fiber. The raised face samples a displaced input plane; no
      // cylindrical inversion, reflection or anamorphic picture is involved.
      let pitch=.0037;
      let row=floor(q.y/pitch);let offset=.5*fract(row*.5)*2.0;
      let fiber=vec2<f32>((floor(q.x/pitch-offset)+.5+offset)*pitch,(row+.5)*pitch);
      mapped=centre+rotate(fiber+vec2<f32>(0.0,.047),angle);
      fiberCoverage=.72+.28*(1.0-smoothstep(.0011,.00185,length(q-fiber)));
    }
    let split=select((.002+.012*pow(1.0 - interior,1.4))*u.lens.z*u.optics.z,0.0,u.optics.x>3.5);
    // The prism reveals a section through the same Julia family. A tilted
    // section couples vertical position to phase; the outer field stays fixed.
    let phase=u.resolutionTime.w+select(0.0,(mapped.y-centre.y)*5.0,u.touch.y>1.5);
    let amount=select(0.0,u.touch.w,u.touch.y>.5);
    let parameter=u.fractal.xy+amount*vec2<f32>(.085*cos(phase)+.026*u.touch.z,.060*sin(phase)+.045*u.touch.z);
    let r=world(mapped+bend*split,parameter).r;let g=world(mapped,parameter).g;let b=world(mapped - bend*split,parameter).b;
    var glass=vec3<f32>(r,g,b)*vec3<f32>(1.13,1.12,1.06)*fiberCoverage+vec3<f32>(.023,.040,.042);
    let reflectStrip=pow(sat(.5+.5*cos(dot(q,vec2<f32>(5.0,8.0))+1.1)),18.0);
    glass+=vec3<f32>(.92,1.0,.98)*reflectStrip*.17;
    glass+=film(dot(grad,vec2<f32>(2.4,3.1))+u.resolutionTime.z*.12)*pow(sat(1.0 - abs(d+.008)*76.0),3.0)*(.24+.19*u.lens.z);
    let rim=1.0 - smoothstep(.0005,.0028,abs(d+.001));
    glass+=mix(vec3<f32>(.52,.67,.71),vec3<f32>(.9,.96,.92),sat(dot(grad,normalize(vec2<f32>( - .6, - .8)))))*rim*(.7+.4*u.touch.x);
    let a=1.0 - smoothstep( - .0015,.002,d);
    col=mix(col,glass,a);
  }
  let vignette=sat(1.1 - .38*dot(p,p));col*=vignette;
  // Gentle highlight compression; leave shadows crisp enough for the engraving.
  col=col/(vec3<f32>(1.0)+col*.20);
  return vec4<f32>(pow(max(col,vec3<f32>(0.0)),vec3<f32>(.85)),1.0);
}

