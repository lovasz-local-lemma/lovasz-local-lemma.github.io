// Ray directions point along propagation. Normals passed to refract face the incident medium.
export const add=(a,b)=>a.map((x,i)=>x+b[i]);
export const sub=(a,b)=>a.map((x,i)=>x-b[i]);
export const mul=(a,s)=>a.map(x=>x*s);
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const length=a=>Math.sqrt(dot(a,a));
export const unit=a=>mul(a,1/length(a));
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// Optical controls rotate the incident family, never the viewing camera.
// Local x points along the emitter axis; y/z span the angular fan.
export function rotateIncident(p,tiltLR=0,tiltUD=0){
  const lr=tiltLR*Math.PI/180,ud=tiltUD*Math.PI/180;
  const x=Math.cos(lr)*p[0]+Math.sin(lr)*p[2],z=-Math.sin(lr)*p[0]+Math.cos(lr)*p[2];
  return [Math.cos(ud)*x-Math.sin(ud)*p[1],Math.sin(ud)*x+Math.cos(ud)*p[1],z];
}
export const SUPPORT_MIN=[-3.6,-1.32,-1.8];
export const SUPPORT_MAX=[3.6,1.8,1.8];
export function clipSupport(o,d,extent=3.6){
  const upper=[extent,SUPPORT_MAX[1],SUPPORT_MAX[2]];
  let enter=0,leave=Infinity,termination=null;
  for(let axis=0;axis<3;axis++){
    if(Math.abs(d[axis])<1e-14){
      if(o[axis]<SUPPORT_MIN[axis]||o[axis]>upper[axis])return null;
      continue;
    }
    const ta=(SUPPORT_MIN[axis]-o[axis])/d[axis],tb=(upper[axis]-o[axis])/d[axis];
    enter=Math.max(enter,Math.min(ta,tb));
    const far=Math.max(ta,tb);
    if(far<leave){leave=far;termination=axis===0&&d[axis]>0?'receiver':`${axis}${d[axis]>0?'+':'-'}`;}
  }
  if(!Number.isFinite(leave)||leave<=enter||leave<=0)return null;
  return {start:add(o,mul(d,enter)),end:add(o,mul(d,leave)),length:leave-enter,enter,leave,termination};
}
export const joinableRulings=(a,b)=>!!(a?.end&&b?.end&&a.termination===b.termination);
export function refract(d,n,eta){
  const c=-dot(d,n),k=1-eta*eta*Math.max(0,1-c*c);
  return k<0?null:unit(add(mul(d,eta),mul(n,eta*c-Math.sqrt(k))));
}
export function fresnel(c,ni,nt){
  const st2=(ni/nt)**2*Math.max(0,1-c*c);
  if(st2>=1)return 1;
  const ct=Math.sqrt(1-st2),rs=(ni*c-nt*ct)/(ni*c+nt*ct),rp=(nt*c-ni*ct)/(nt*c+ni*ct);
  return .5*(rs*rs+rp*rp);
}
export function sphereHit(o,d,r=1){
  const b=dot(o,d),disc=b*b-dot(o,o)+r*r;
  if(disc<0)return null;
  const h=Math.sqrt(disc),near=-b-h,far=-b+h;
  return near>1e-7?near:far>1e-7?far:null;
}
export function traceGlass(o,d,n=1.5,shape='sphere'){
  let entry,normal,inside,exit,exitNormal,cost=0;
  if(shape==='sphere'){
    const t=sphereHit(o,d);if(t===null)return {status:'miss',o,d,cost};
    entry=add(o,mul(d,t));normal=unit(entry);
  }else{
    if(d[0]<=0)return {status:'miss',o,d,cost};
    const t=(-.48-o[0])/d[0];entry=add(o,mul(d,t));
    if(t<=0||Math.abs(entry[1])>1.35||Math.abs(entry[2])>1.35)return {status:'miss',o,d,cost};
    normal=[-1,0,0];
  }
  inside=refract(d,normal,1/n);cost++;
  if(!inside)return {status:'tir',o,d,entry,cost};
  if(shape==='sphere'){
    const chord=-2*dot(entry,inside);exit=add(entry,mul(inside,chord));exitNormal=mul(unit(exit),-1);
  }else{
    const t=(.48-entry[0])/inside[0];exit=add(entry,mul(inside,t));
    if(Math.abs(exit[1])>1.35||Math.abs(exit[2])>1.35)return {status:'clipped',o,d,entry,cost};
    exitNormal=[-1,0,0];
  }
  const outgoing=refract(inside,exitNormal,n);cost++;
  if(!outgoing)return {status:'tir',o,d,entry,inside,exit,cost};
  const transmission=(1-fresnel(-dot(d,normal),1,n))*(1-fresnel(-dot(inside,exitNormal),n,1));
  return {status:'transmitted',o,d,entry,inside,exit,outgoing,transmission,cost};
}
export function generateFamily({family='cone',shape='sphere',ior=1.5,offset=.42,angle=.2,azimuth=0,tiltLR=0,tiltUD=0,opposing=true,count=193,extent=3.6}={}){
  // 'meridian' remains a compatibility alias for the previous exhibit.
  const disk=family==='disk'||family==='meridian',phi=azimuth*Math.PI/180;
  const anchor=[-3.4,0,family==='offset'?offset:0],rotate=p=>rotateIncident(p,tiltLR,tiltUD);
  const planeNormal=disk?rotate([0,-Math.sin(phi),Math.cos(phi)]):rotate([0,0,1]);
  const rays=[];
  for(let i=0;i<count;i++){
    const t=i/(count-1);let o,d;
    if(family==='cone'){
      const phase=t*Math.PI*2;o=anchor;d=rotate([Math.cos(angle),Math.sin(angle)*Math.cos(phase),Math.sin(angle)*Math.sin(phase)]);
    }else if(disk){
      // One chart sweeps a polar cap in an oriented half-plane. The opposing
      // half is a second azimuth (phi + pi), shown only as optional context.
      const psi=(opposing?t*2-1:t)*.294;o=anchor;d=rotate([Math.cos(psi),Math.sin(psi)*Math.cos(phi),Math.sin(psi)*Math.sin(phi)]);
    }else{
      o=add(anchor,rotate([0,(t*2-1)*1.14,0]));d=rotate([1,0,0]);
    }
    const ray=traceGlass(o,d,ior,shape);ray.parameter=t;
    if(ray.outgoing){
      const support=clipSupport(ray.exit,ray.outgoing,extent);
      if(support){
        ray.supportStart=support.start;ray.end=support.end;ray.supportLength=support.length;ray.termination=support.termination;
        ray.reachesReceiver=support.termination==='receiver'&&ray.end[1]>=SUPPORT_MIN[1]-1e-10&&ray.end[1]<=SUPPORT_MAX[1]+1e-10&&Math.abs(ray.end[2])<=SUPPORT_MAX[2]+1e-10;
      }
    }
    rays.push(ray);
  }
  const valid=rays.filter(r=>r.status==='transmitted'&&r.end);
  return {rays,valid,anchor,axis:rotate([1,0,0]),planeNormal,cost:rays.reduce((s,r)=>s+r.cost,0),deviation:family==='cone'?null:Math.max(0,...valid.map(r=>Math.abs(dot(sub(r.end,anchor),planeNormal)))),meanTransmission:valid.reduce((s,r)=>s+r.transmission,0)/Math.max(1,valid.length)};
}
