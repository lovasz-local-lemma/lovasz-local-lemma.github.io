struct Uniforms { sizeTime: vec4f, values: vec4f, pointer: vec4f, spring: vec4f }
@group(0) @binding(0) var<uniform> u: Uniforms;
struct VertexOut { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertexMain(@builtin(vertex_index) i: u32) -> VertexOut {
  let p=vec2f(f32((i<<1u)&2u),f32(i&2u));
  var out:VertexOut;out.position=vec4f(p*2.0 - 1.0,0.0,1.0);out.uv=vec2f(p.x,1.0 - p.y);return out;
}
fn capsule(p:vec2f, halfWidth:f32, radius:f32)->f32 {return length(vec2f(max(abs(p.x) - halfWidth,0.0),p.y)) - radius;}
fn box(p:vec2f,b:vec2f,r:f32)->f32 {let q=abs(p) - b;return length(max(q,vec2f(0.0))) + min(max(q.x,q.y),0.0) - r;}
fn mask(d:f32)->f32 {return 1.0 - smoothstep(-0.7,0.7,d);}
fn smoothMin(a:f32,b:f32,k:f32)->f32 {let h=clamp(0.5 + 0.5*(b - a)/k,0.0,1.0);return mix(b,a,h) - k*h*(1.0 - h);}
@fragment fn fragmentMain(v:VertexOut)->@location(0) vec4f {
  let p=v.uv*u.sizeTime.xy;let time=u.sizeTime.z;let style=u.values.w;
  if(u.spring.w>.5 && p.y>235.0){return vec4f(0.0);}
  var color=vec3f(0.0);var alpha=0.0;
  for(var i=0;i<3;i++){
    let y=select(select(79.0,165.0,i==1),255.0,i==2);
    let value=select(select(u.values.x,u.values.y,i==1),u.values.z,i==2);
    let spring=select(select(u.spring.x,u.spring.y,i==1),u.spring.z,i==2);
    let engaged=select(0.0,1.0,abs(u.pointer.z - f32(i + 1))<0.1);
    let drag=engaged*u.pointer.w;
    let q=p - vec2f(146.0,y);let head=18.0 + value*256.0;
    let k=p - vec2f(head,y);let lag=clamp((value - spring)*256.0,-25.0,25.0);
    let track=capsule(q,124.0,2.4);let trackMask=mask(track);
    let lit=select(0.22,0.82,p.x<head);
    color+=vec3f(0.35,0.64,0.6)*trackMask*lit;alpha=max(alpha,trackMask*.9);
    let r=11.0 + engaged*1.3;var d=length(k) - r;
    var tint=vec3f(.48,.8,.75);var bodyTint=tint;var specPower=30.0;
    if(style>.5&&style<1.5){
      tint=.54 + .4*cos(vec3f(0.0,2.1,4.2) + atan2(k.y,k.x)*1.6 + length(k)*.25 + time*.35);
      specPower=54.0;
    }
    if(style>1.5&&style<2.5){
      // A damped spring stretches the meniscus; this is a material response, not a fluid solver.
      let stretch=1.0 + abs(lag)*.035 + drag*.09;
      let wobble=.5*sin(atan2(k.y,k.x)*3.0 + time*2.2)*(engaged + .25);
      d=length(vec2f(k.x/stretch,k.y*sqrt(stretch))) - r - wobble;
      let tail=k + vec2f(lag*.72,0.0);
      d=smoothMin(d,length(tail) - (4.0 + abs(lag)*.12),5.0);
      tint=mix(vec3f(.11,.71,.64),vec3f(.91,.69,.3),.5 + .5*sin(k.x*.15 + time*.55));
      bodyTint=vec3f(.045,.18,.17);specPower=70.0;
    }
    if(style>2.5&&style<3.5){
      let a=.18*sin(time*1.3 + f32(i))*(.15 + engaged) + lag*.008;
      let c=cos(a);let s=sin(a);let z=vec2f(c*k.x - s*k.y,s*k.x + c*k.y);
      d=box(z,vec2f(10.5 + drag,10.5),1.1);
      tint=select(vec3f(.91,.24,.15),vec3f(.94,.75,.19),z.x>1.5);
      tint=select(tint,vec3f(.15,.38,.71),z.y>2.5&&z.x<1.5);
      tint=select(tint,vec3f(.91,.88,.74),z.y>2.5&&z.x>1.5);
      let seam=1.0 - smoothstep(.7,1.7,min(abs(z.x - 1.5),abs(z.y - 2.5)));
      bodyTint=tint*(1.0 - seam*.85);specPower=12.0;
    }
    if(style>3.5){
      let a=time*.65 + f32(i)*1.7;let orbit=vec2f(cos(a)*17.0,sin(a)*6.0);
      let dotD=length(k - orbit) - 2.2;let dotA=mask(dotD);
      color+=vec3f(.94,.59,.25)*dotA;alpha=max(alpha,dotA);
      let arc=abs(length(vec2f(k.x,k.y*1.9)) - 18.0) - .45;let arcA=mask(arc)*.45;
      color+=vec3f(.66,.73,.65)*arcA;alpha=max(alpha,arcA);
      d=length(vec2f(k.x/1.08,k.y)) - (r + .4*sin(time*1.4 + f32(i)));
      tint=vec3f(.92,.81,.61);bodyTint=tint;specPower=18.0;
    }
    let body=mask(d);let edge=exp(-abs(d + .4)*1.6);
    let halo=exp(-max(d,0.0)*.23)*(1.0 - body)*(.11 + engaged*.35);
    let n=normalize(vec3f(k/r,sqrt(max(.02,1.0 - dot(k/r,k/r)))));
    let spec=pow(max(dot(n,normalize(vec3f(-.4,-.7,1.3))),0.0),specPower);
    let refraction=.16 + .06*sin((k.x + n.x*13.0)*.8)*cos((k.y + n.y*9.0)*.5);
    var material=bodyTint*refraction + spec*.92;
    if(style>2.5&&style<3.5){material=bodyTint*(.75 + spec*.22);}
    if(style>3.5){material=bodyTint*(.32 + .5*max(n.z,0.0)) + spec*.25;}
    color+=body*material + tint*(edge*.88 + halo);
    alpha=max(alpha,max(body*.98,halo));
  }
  return vec4f(min(color,vec3f(alpha)),alpha);
}
