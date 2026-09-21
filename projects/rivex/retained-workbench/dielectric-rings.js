// A separate analytic experiment, not reconstructed BSDF data from the archive.
import {add,sub,mul,dot,norm,cross,refract,sphereHit} from '../photon-studio/scenes.js';

function fresnel(d,n,t,ni,nt){
  const ci=Math.abs(dot(d,n)),ct=Math.abs(dot(t,n));
  return .5*(((ni*ci-nt*ct)/(ni*ci+nt*ct))**2+((nt*ci-ni*ct)/(nt*ci+ni*ct))**2);
}

export function angularSupport(delta,mu,width){
  const cosine=Math.max(-1,Math.min(1,mu*mu+(1-mu*mu)*Math.cos(delta)));
  return Math.exp(-.5*(Math.acos(cosine)/Math.max(1e-5,width))**2);
}

export function dielectricRings(sphere,ior=1.5,count=96){
  const center=sphere.slice(0,3),r=sphere[3],light=add(center,[0,r*2.6,0]);
  const records=[],paths=[];
  for(let i=0;i<count;i++){
    // A stratified disk viewed from a point light. Every sample traces both
    // interfaces before its outgoing direction is used as delta support.
    const radius=r*.93*Math.sqrt((i+.5)/count),phi=i*2.399963229728653;
    const aim=add(center,[radius*Math.cos(phi),0,radius*Math.sin(phi)]),incoming=norm(sub(aim,light));
    const entryLength=sphereHit(light,incoming,sphere);if(!Number.isFinite(entryLength))continue;
    const entry=add(light,mul(incoming,entryLength)),entryNormal=norm(sub(entry,center));
    const inside=refract(incoming,entryNormal,1/ior);if(!inside)continue;
    const epsilon=1e-5,exitLength=sphereHit(add(entry,mul(inside,epsilon)),inside,sphere)+epsilon;
    const exit=add(entry,mul(inside,exitLength)),normal=norm(sub(exit,center));
    const outgoing=refract(inside,mul(normal,-1),ior);if(!outgoing)continue;
    const transmission=(1-fresnel(incoming,entryNormal,inside,1,ior))*(1-fresnel(inside,normal,outgoing,ior,1));
    const mu=dot(normal,outgoing),tangent=sub(outgoing,mul(normal,mu));
    if(Math.hypot(...tangent)<1e-6)continue;
    const u=norm(tangent),v=cross(normal,u),sin=Math.sqrt(Math.max(0,1-mu*mu));
    const optical=entryLength+ior*exitLength;
    for(const distance of [.20,.42,.67,.96,1.28]){
      records.push({c:add(exit,mul(normal,distance*mu)),u:mul(u,distance*sin),v:mul(v,distance*sin),mu,phase:0,alpha:transmission,time:optical+distance});
    }
    paths.push({light,entry,exit,incoming,inside,outgoing,normal,mu,transmission,optical});
  }
  return {records,paths,light};
}
