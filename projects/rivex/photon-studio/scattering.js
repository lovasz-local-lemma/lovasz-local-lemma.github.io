// Bounded CPU counterpart of the native old-3D physical-scatter path:
// exponential free flight, weighted absorption, HG direction changes and retained
// untruncated free-flight samples. Geometry/shader approximations are separate.
import {scenes,add,sub,mul,dot,norm,cross,hitScene,refract} from './scenes.js';
import {frame} from './primitives.js';
export function random(seed=92731){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;};}
export function sampleHG(axis,g,u,v){const mu=Math.abs(g)<1e-4?1-2*u:(1+g*g-((1-g*g)/(1-g+2*g*u))**2)/(2*g),[a,b]=frame(axis),s=Math.sqrt(Math.max(0,1-mu*mu)),phi=2*Math.PI*v;return norm(add(mul(axis,mu),add(mul(a,s*Math.cos(phi)),mul(b,s*Math.sin(phi)))));}
export function editableScene(key='relay',edit={}){const scene=structuredClone(scenes[key]);scene.ior=edit.ior??1.5;scene.material=edit.material||'glass';scene.lightPower=edit.lightPower??1;scene.spread=edit.spread??(key==='relay'?12:22);scene.light[0]+=edit.lightX||0;scene.light[1]+=edit.lightY||0;scene.light=scene.light.map((x,j)=>Math.max(-scene.bounds[j]+.001,Math.min(scene.bounds[j]-.001,x)));
 const index=Math.max(0,Math.min(scene.spheres.length-1,edit.object||0));if(scene.spheres[index]){scene.spheres[index][0]+=edit.x||0;scene.spheres[index][1]+=edit.y||0;scene.spheres[index][2]+=edit.z||0;scene.spheres[index][3]*=edit.scale??1;}scene.editedObject=index;return scene;}
function launch(scene,u,v){const target=scene.spheres[0]?.slice(0,3)||[0,-1.2,0],axis=norm(sub(target,scene.light)),[a,b]=frame(axis),mu=1-u*(1-Math.cos(scene.spread*Math.PI/180)),s=Math.sqrt(1-mu*mu),phi=v*Math.PI*2;return add(mul(axis,mu),add(mul(a,s*Math.cos(phi)),mul(b,s*Math.sin(phi))));}
function dielectric(d,h,ior){const entering=dot(d,h.n)<0,n=entering?h.n:mul(h.n,-1),ni=entering?1:ior,nt=entering?ior:1,next=refract(d,n,ni/nt);if(!next)return {d:sub(d,mul(n,2*dot(d,n))),transmit:false,weight:1,entering};const ci=Math.max(0,-dot(d,n)),ct=Math.abs(dot(next,n)),rs=((ni*ci-nt*ct)/(ni*ci+nt*ct))**2,rp=((nt*ci-ni*ct)/(nt*ci+ni*ct))**2;return {d:next,transmit:true,weight:1-(rs+rp)/2,entering};}
function insideGlass(scene,p){return scene.spheres.some((s,i)=>(i!==scene.editedObject||scene.material==='glass')&&Math.hypot(...sub(p,s))<s[3]);}
export function traceMedium(scene,{count=6000,sigmaS=.38,sigmaA=.025,g=.45,orders=5,seed=92731}={}){
 const rng=random(seed),sigmaT=sigmaS+sigmaA,legs=[],deposits=[],collisions=[],lensCounts=[0,0,0],orderCounts=Array(orders+1).fill(0);let maxTime=0,glassPaths=0,absorbed=0;
 for(let path=0;path<count;path++){
  let p=scene.light.slice(),d=launch(scene,rng(),rng()),power=[scene.lightPower,scene.lightPower*.72,scene.lightPower*.33],t=0,inside=insideGlass(scene,p),glass=false,order=0,previousAnchor=null;const crossed=new Set();
  for(let event=0;event<38;event++){
   const hit=hitScene(p,d,scene);let boundary=hit?.t??Infinity;
   // Open-front escape is still a finite medium boundary; no fog outside the room.
   for(let j=0;j<3;j++)if(Math.abs(d[j])>1e-9){const exit=(Math.sign(d[j])*scene.bounds[j]-p[j])/d[j];if(exit>1e-5)boundary=Math.min(boundary,exit);}
   if(!Number.isFinite(boundary)||boundary<=1e-5)break;
   const freeFlight=!inside&&sigmaT>0?-Math.log1p(-rng())/sigmaT:Infinity;
   if(previousAnchor){previousAnchor.distance=freeFlight;previousAnchor.outgoing=d.slice();previousAnchor.mu=dot(previousAnchor.axis,d);previousAnchor.nextIsMedium=freeFlight<boundary;previousAnchor=null;}
   const collision=freeFlight<boundary,length=collision?freeFlight:boundary,end=add(p,mul(d,length)),endTime=t+length*(inside?scene.ior:1);
   legs.push({a:p,b:end,t0:t,t1:endTime,color:power.slice(),inside,glass,path,event:collision?'medium':hit?.type||'escape',eventId:hit?.id??null,order,freeFlight,stage:crossed.size,direction:d.slice()});
   maxTime=Math.max(maxTime,endTime);
   if(collision){
    if(sigmaS===0){absorbed++;break;}
    power=mul(power,sigmaS/sigmaT);order++;orderCounts[order]=(orderCounts[order]||0)+1;
    const anchor={p:end,prev:p,axis:d.slice(),t:endTime,prevTime:t,color:power.slice(),stage:crossed.size,path,order,incomingSample:freeFlight,incomingLength:length,distance:0};collisions.push(anchor);
    if(order>=orders||Math.max(...power)<1e-5)break;
    previousAnchor=anchor;d=sampleHG(d,g,rng(),rng());p=end;t=endTime;continue;
   }
   if(!hit||Math.abs(hit.t-boundary)>1e-4)break;
   if(hit.type==='glass'){
    const material=hit.id===scene.editedObject?scene.material:'glass';
    if(material==='mirror'){d=sub(d,mul(hit.n,2*dot(d,hit.n)));power=mul(power,.91);}
    else if(material==='diffuse'){deposits.push({p:end,t:endTime,color:power.slice(),normal:hit.n,glass});break;}
    else{const result=dielectric(d,hit,scene.ior);d=result.d;power=mul(power,result.weight);if(result.transmit){inside=result.entering;if(!inside){glass=true;if(!crossed.has(hit.id)){crossed.add(hit.id);lensCounts[hit.id]++;}}}}
   }else if(hit.type==='mirror'){d=sub(d,mul(hit.n,2*dot(d,hit.n)));power=power.map((x,j)=>x*hit.color[j]);}
   else{deposits.push({p:end,t:endTime,color:power.slice(),normal:hit.n,glass});break;}
   p=add(end,mul(d,1e-4));t=endTime+1e-4*(inside?scene.ior:1);
  }
  if(glass)glassPaths++;
 }
 // The last allowed collision has no retained outgoing flight: never invent a sweep.
 const sweeps=collisions.filter(a=>Number.isFinite(a.distance)&&a.distance>1e-5);
 return {count,batches:[{start:0,count}],legs,deposits,collisions:sweeps,collisionCount:collisions.length,orderCounts,maxTime,glassPaths,lensCounts,absorbed,lights:1,emitters:[],geometry:scene,scene:{kind:scene.kind,ior:scene.ior,optical:true},medium:{sigmaS,sigmaA,g,orders},seed};
}
export function mergeCaches(a,b){if(!a)return b;const offset=a.count;return {...b,count:a.count+b.count,batches:(a.batches||[{start:0,count:a.count}]).concat((b.batches||[{start:0,count:b.count}]).map(batch=>({...batch,start:batch.start+offset}))),legs:a.legs.concat(b.legs.map(l=>({...l,path:l.path+offset}))),deposits:a.deposits.concat(b.deposits),collisions:a.collisions.concat(b.collisions.map(c=>({...c,path:c.path+offset}))),collisionCount:a.collisionCount+b.collisionCount,orderCounts:b.orderCounts.map((n,i)=>n+(a.orderCounts[i]||0)),maxTime:Math.max(a.maxTime,b.maxTime),lensCounts:b.lensCounts.map((n,i)=>n+a.lensCounts[i]),glassPaths:a.glassPaths+b.glassPaths};}
export function sampledAnchors(cache,stage=0,count=192){const eligible=cache.collisions.filter(a=>stage===0||a.stage===stage),step=eligible.length/Math.min(count,eligible.length);return Array.from({length:Math.min(count,eligible.length)},(_,i)=>eligible[Math.floor((i+.5)*step)]);}
// Keep the selected family from each independent pass. Reselecting a fixed-size
// subset of the merged cache replaces old samples instead of refining the image.
// Every retained family is replayed after camera/time edits and normalized by
// their total count in the renderer. This is bounded sample accumulation.
export function accumulatedAnchors(cache,stage=0,count=192){
 const batches=cache.batches||[{start:0,count:cache.count}];
 return batches.flatMap(batch=>sampledAnchors({collisions:cache.collisions.filter(a=>a.path>=batch.start&&a.path<batch.start+batch.count)},stage,count));
}
// Primary specular mapping only: exact analytic sphere/plane intersections and
// Snell directions. This deterministically follows transmission, without media.
export function primaryHit(scene,d){let p=scene.light.slice(),inside=insideGlass(scene,p),t=0;const visited=[];for(let k=0;k<24;k++){const h=hitScene(p,d,scene);if(!h)return null;t+=h.t*(inside?scene.ior:1);if(h.type==='diffuse')return {p:h.p,normal:h.n,t,signature:visited.join('/')};if(h.type==='glass'){if(h.id===scene.editedObject&&scene.material!=='glass')return null;const r=dielectric(d,h,scene.ior);d=r.d;if(r.transmit){inside=r.entering;if(!inside)visited.push(h.id);}}else d=sub(d,mul(h.n,2*dot(d,h.n)));p=add(h.p,mul(d,1e-4));}return null;}
export function causticEnvelope(scene,rings=42,azimuth=80){
 const grid=Array.from({length:rings+1},(_,r)=>Array.from({length:azimuth+1},(_,a)=>primaryHit(scene,launch(scene,r/rings,a/azimuth)))),cells=[];
 // A fold is where the signed receiver-map Jacobian changes sign. Its zero is
 // linearly reconstructed on this finite angular grid, not a hull of deposits.
 for(let r=0;r<rings;r++){const row=[];for(let a=0;a<azimuth;a++){const p=grid[r][a],q=grid[r+1][a],s=grid[r][a+1];if(!p||!q||!s||!p.signature||p.signature!==q.signature||p.signature!==s.signature||dot(p.normal,q.normal)<.99||dot(p.normal,s.normal)<.99){row.push(null);continue;}row.push({p:mul(add(add(p.p,q.p),s.p),1/3),J:dot(cross(sub(q.p,p.p),sub(s.p,p.p)),p.normal),normal:p.normal,signature:p.signature});}cells.push(row);}
 const lines=[];for(let r=1;r<rings-1;r++)for(let a=0;a<azimuth;a++){const c=cells[r][a],p=cells[r-1][a],n=cells[r][(a+1)%azimuth],pn=cells[r-1][(a+1)%azimuth];if(!c||!p||!n||!pn||c.signature!==p.signature||n.signature!==pn.signature||c.J*p.J>=0||n.J*pn.J>=0)continue;const at=(u,v)=>add(mul(add(u.p,mul(u.normal,.005)),Math.abs(v.J)/(Math.abs(u.J)+Math.abs(v.J))),mul(add(v.p,mul(v.normal,.005)),Math.abs(u.J)/(Math.abs(u.J)+Math.abs(v.J))));lines.push({a:at(c,p),b:at(n,pn)});}return lines;
}
