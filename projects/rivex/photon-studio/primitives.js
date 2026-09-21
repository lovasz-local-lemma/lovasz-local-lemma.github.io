// Bounded geometry/transport port of lab3d/photon_sweep.hpp,
// photon_primitives.hpp and timeball_band.hpp (AIO native source, read only).
// Fixed sample values + finite rasterization: this is not an unbiased estimator.
import {add,sub,mul,norm,cross,dot,hitScene} from './scenes.js';
export const PI=Math.PI;
export function frame(axis){const u=norm(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0]));return [u,cross(axis,u)];}
export function direction(axis,mu,phi){const [u,v]=frame(axis),s=Math.sqrt(Math.max(0,1-mu*mu));return add(mul(axis,mu),add(mul(u,s*Math.cos(phi)),mul(v,s*Math.sin(phi))));}
export function hg(c,g){return (1-g*g)/(4*PI*Math.pow(Math.max(1e-6,1+g*g-2*g*c),1.5));}
export function sweepPoint(a,d,mu,phi){return add(a.p,mul(direction(a.axis,mu,phi),d));}
export function ellipsoid(f1,f2,L,mu,phi){
  const d=Math.hypot(...sub(f2,f1));if(L<=d+1e-6)return null;
  const axis=d>1e-8?norm(sub(f2,f1)):[0,0,1],[u,v]=frame(axis),a=L/2,b=Math.sqrt(a*a-d*d/4),s=Math.sqrt(Math.max(0,1-mu*mu)),radial=add(mul(u,Math.cos(phi)),mul(v,Math.sin(phi)));
  return {p:add(mul(add(f1,f2),.5),add(mul(axis,a*mu),mul(radial,b*s))),normal:add(mul(axis,b*b*mu),mul(radial,a*b*s))};
}
export function bandRadii(r,width,k=5){return width<=1e-6?[r]:Array.from({length:k},(_,i)=>r+(i-(k-1)/2)*width/k);}
export function boxChord(p,q,bounds){const d=sub(q,p);let t=1;for(let j=0;j<3;j++){if(Math.abs(d[j])<1e-8)continue;const x=(Math.sign(d[j])*bounds[j]-p[j])/d[j];if(x>0)t=Math.min(t,x);}return Math.hypot(...d)*t;}
export function visible(a,b,scene){const d=sub(b,a),l=Math.hypot(...d);if(l<1e-5)return true;const h=hitScene(add(a,mul(d,1e-5/l)),mul(d,1/l),scene);return !h||h.t>=l-1e-4;}
export function mediumAnchors(cache,stage=1,sigma=.25,count=5){
  const stride=Math.max(1,Math.floor(cache.count/count)),anchors=[];let current=-1,air=0,seen=new Set();
  for(const leg of cache.legs){
    if(leg.path!==current){current=leg.path;air=0;seen=new Set();}
    const length=Math.hypot(...sub(leg.b,leg.a));
    if(leg.inside&&leg.event==='glass')seen.add(leg.eventId);
    const s=seen.size||(leg.glass?1:0);
    if(!leg.inside&&leg.glass&&s===stage&&length>.16&&leg.path%stride===0){
      // Draw one conditional exponential collision within the retained clear leg.
      // Its inclusion probability and prefix survival stay in the anchor power.
      const u=.22+((leg.path*.61803398875+leg.t0*.371)%1)*.56,prob=-Math.expm1(-sigma*length),r=-Math.log1p(-u*prob)/sigma;
      anchors.push({p:add(leg.a,mul(norm(sub(leg.b,leg.a)),r)),axis:norm(sub(leg.b,leg.a)),t:leg.t0+r,color:leg.color.map(c=>c*Math.exp(-sigma*air)*prob*.9),stage:s,path:leg.path});
    }
    if(!leg.inside)air+=length;
  }
  return anchors.filter((_,i)=>i%Math.max(1,Math.ceil(anchors.length/count))===0).slice(0,count);
}
export function primitiveGeometry(anchors,options,cam){
  const {kind,distance:fixedDistance,mu:fixedMu,g,halfWidth,time,cameraClock,scene,occlusion,kernel}=options,triangles=[],lines=[];let rejected=0;
  const isCurve=kind==='ring'||kind==='arc',isTime=kind==='timeball',isSolid=kind==='solid',nPhi=options.sampled?20:32,nH=options.sampled?10:16,bases=new Map(anchors.map(a=>[a,frame(a.axis)]));
  const vertex=(anchor,r,h,p,weight)=>{
    if(isTime&&cameraClock){const e=ellipsoid(anchor.p,options.focus||cam.eye,r,h,p);return e?{p:e.p,n:e.normal,r,weight}:null;}
    const [u,v]=bases.get(anchor),st=Math.sqrt(Math.max(0,1-h*h)),w=add(mul(anchor.axis,h),add(mul(u,st*Math.cos(p)),mul(v,st*Math.sin(p)))),q=add(anchor.p,mul(w,r));
    const n=kind==='cone'?mul(sub(mul(w,options.sampled?anchor.mu:fixedMu),anchor.axis),r):mul(w,r*r);
    return {p:q,n,r,weight};
  };
  function emitTriangle(a,b,c,anchor){if(!a||!b||!c)return;for(const v of [a,b,c])triangles.push(...v.p,...v.n,...anchor.p,...anchor.axis,...anchor.color,anchor.t,v.weight,v.r);}
  for(const anchor of anchors){
    const distance=options.sampled?anchor.distance:fixedDistance,mu=options.sampled?anchor.mu:fixedMu;
    if(kind==='plane'){
      if(!anchor.prev||!anchor.outgoing)continue;
      const t1=mul(anchor.axis,Math.max(anchor.incomingLength,anchor.incomingSample)),t2=mul(anchor.outgoing,anchor.distance),normal=cross(t1,t2),area=Math.hypot(...normal);if(area<1e-5)continue;
      // Native Plane(6): release both consecutive distances, retaining directions.
      // Column anchors and optical clocks move with the first swept distance.
      const n=8,at=(u,v)=>{const p=add(anchor.prev,mul(t1,u));return {p:add(p,mul(t2,v)),n:normal,r:anchor.distance*v,weight:1,anchor:{...anchor,p,axis:anchor.outgoing,t:anchor.prevTime+Math.hypot(...t1)*u}};};
      const emit=vs=>{for(const v of vs)triangles.push(...v.p,...v.n,...v.anchor.p,...v.anchor.axis,...anchor.color,v.anchor.t,v.weight,v.r);};
      for(let i=0;i<n;i++)for(let j=0;j<n;j++){const a=at(i/n,j/n),b=at((i+1)/n,j/n),c=at((i+1)/n,(j+1)/n),d=at(i/n,(j+1)/n);emit([a,b,c]);emit([a,c,d]);}continue;
    }
    if(isCurve){
      const steps=options.sampled?48:kind==='ring'?100:80,phi=(anchor.path*.517)% (2*PI),[u,v]=frame(anchor.axis);
      for(let i=0;i<steps;i++){
        const angle=(i+.5)/steps*(kind==='ring'?2*PI:PI),h=kind==='ring'?mu:Math.cos(angle),p=kind==='ring'?angle:phi;
        const a=sweepPoint(anchor,distance,kind==='ring'?mu:Math.cos(i/steps*PI),kind==='ring'?i/steps*2*PI:phi),b=sweepPoint(anchor,distance,kind==='ring'?mu:Math.cos((i+1)/steps*PI),kind==='ring'?(i+1)/steps*2*PI:phi),mid=mul(add(a,b),.5),wo=norm(sub(mid,anchor.p)),wc=norm(sub(cam.eye,mid)),sensor=options.cameraClock?(options.focus||cam.eye):cam.eye,clock=anchor.t+distance+(cameraClock?Math.hypot(...sub(options.focus||cam.eye,mid)):0);
        if(mid.some((v,j)=>Math.abs(v)>scene.bounds[j])||(time.on&&Math.abs(clock-time.center)>time.half)||(occlusion&&(!visible(anchor.p,mid,scene)||!visible(mid,sensor,scene)))){rejected++;continue;}
        const tangent=kind==='ring'?add(mul(u,-Math.sin(p)),mul(v,Math.cos(p))):add(mul(anchor.axis,-Math.sin(angle)),mul(add(mul(u,Math.cos(phi)),mul(v,Math.sin(phi))),Math.cos(angle)));
        const J=distance*(kind==='ring'?Math.sqrt(1-mu*mu):1)*Math.hypot(...cross(tangent,wc)),angular=kind==='arc'?Math.sin(angle):1;
        const phase=(options.sampled&&kind==='ring'?1/(2*PI):hg(dot(anchor.axis,wo),g))*hg(dot(wo,norm(sub(sensor,mid))),g),Tr=Math.exp(-options.sigma*((options.sampled?0:distance)+boxChord(mid,sensor,scene.bounds)));
        lines.push({a,b,color:anchor.color,t:clock,power:angular*phase*Tr/(Math.max(.015,J)*2*kernel),kernel});
      }
      continue;
    }
    const shells=isTime?bandRadii(time.center-anchor.t,halfWidth*2,5):isSolid?Array.from({length:18},(_,i)=>(i+.5)*distance/18):[distance];
    for(const radius of shells){if(radius<=.025)continue;if(isTime&&cameraClock&&radius<=Math.hypot(...sub(options.focus||cam.eye,anchor.p)))continue;
      const w=isSolid?distance/18:isTime?1/shells.length:1;
      for(let j=0;j<nH;j++)for(let i=0;i<nPhi;i++){
        const phi0=i/nPhi*2*PI,phi1=(i+1)/nPhi*2*PI;
        const r0=kind==='cone'?Math.max(.025,radius*j/nH):radius,r1=kind==='cone'?radius*(j+1)/nH:radius;
        const h0=kind==='cone'?mu:1-2*j/nH,h1=kind==='cone'?mu:1-2*(j+1)/nH;
        const a=vertex(anchor,r0,h0,phi0,w),b=vertex(anchor,r0,h0,phi1,w),c=vertex(anchor,r1,h1,phi1,w),d=vertex(anchor,r1,h1,phi0,w);emitTriangle(a,b,c,anchor);emitTriangle(a,c,d,anchor);
      }
    }
  }
  return {triangles:new Float32Array(triangles),lines,rejected,anchors:anchors.length};
}
