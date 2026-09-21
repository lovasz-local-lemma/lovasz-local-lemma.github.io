import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as G from './geometry.js';

// Verify invariants against geometric identities, not against saved pictures.
let checks=0;const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const close=(a,b,tol=1e-7)=>Math.abs(a-b)<=tol;
const report={scope:'Browser illustrations; no full-transport convergence claim.',modes:{}};
for(const [name,fn,value] of [['relay',G.relayStudy,.7],['chronolens',G.chronolensStudy,.53],['scheimpflug',G.focusStudy,.75],['loom',G.loomStudy,.3],['sheets',G.sheetsStudy,.6],['atlas',G.atlasStudy,.8]]){
  report.modes[name]={};
  for(const adverse of [false,true]){
    const study=fn(value,adverse);
    report.modes[name][adverse?'failure':'promising']=study.stats||{length:study.intersection.length,sine:study.intersection.sine,valid:study.intersection.valid};
    check(study.segments.length<=G.MAX_SEGMENTS,`${name}: segment upload fits shader`);
    check(study.segments.every(s=>[...s.a,...s.b,...s.color,s.strength].every(Number.isFinite)),`${name}: finite line geometry`);
    check(study.annotations.length>=2,`${name}: ownership annotations remain available`);
  }
}
for(const amount of [0,.25,.5,.75,1])for(const adverse of [false,true]){
  const s=G.sheetsStudy(amount,adverse),hit=s.intersection;
  if(hit.valid)for(const p of [hit.a,hit.b,G.mul(G.add(hit.a,hit.b),.5)])for(const plane of s.planes){
    const r=G.sub(p,plane.center);
    check(Math.abs(G.dot(r,plane.normal))<1e-9,'clipped point lies on each plane');
    check(Math.abs(G.dot(r,plane.u))<=plane.size[0]+1e-8,'clipped point inside u support');
    check(Math.abs(G.dot(r,plane.v))<=plane.size[1]+1e-8,'clipped point inside v support');
  }
  check(adverse?!hit.valid:hit.valid,'matched plane presets separate finite hit / miss');
  for(const path of s.paths){
    check(path.prefix.length===4,'sheet construction retains three fixed prefix flights');
    check(path.flightLengths.every(t=>t>0),'displayed released flights remain positive');
    for(const u of [-1,0,1])for(const v of [-1,0,1]){
      const expected=G.add(path.support.center,G.add(G.mul(path.support.u,u*path.support.size[0]),G.mul(path.support.v,v*path.support.size[1]))),reconstructed=G.reconstructSheetPath(path,expected);
      check(reconstructed.flightLengths.every(t=>t>0),'entire finite sheet has positive released lengths');
      check(G.length(G.sub(reconstructed.vertices.at(-1),expected))<1e-9,'two released flights sweep the displayed sheet exactly');
      for(const [j,i] of path.released.entries())check(G.length(G.sub(G.normalize(G.sub(reconstructed.vertices[i+1],reconstructed.vertices[i])),path.directions[j]))<1e-9,'released flight changes length without changing direction');
    }
  }
  if(hit.valid)check(G.length(G.sub(s.paths[0].vertices.at(-1),s.paths[1].vertices.at(-1)))<1e-9,'camera and photon chain meet at the same point');
  else check(G.length(G.sub(s.paths[0].vertices.at(-1),s.paths[1].vertices.at(-1)))>.1,'failed sheets retain separate endpoints');
  const atlas=G.atlasStudy(amount,adverse);
  for(const p of atlas.endpoints){const r=G.sub(p,atlas.support.center);check(Math.abs(G.dot(r,atlas.support.normal))<1e-9,'reconstructed endpoint in analytic plane');check(Math.abs(G.dot(r,atlas.support.u))<=atlas.support.size[0]+1e-9,'released u stays inside support');check(Math.abs(G.dot(r,atlas.support.v))<=atlas.support.size[1]+1e-9,'released v stays inside support');}
}
const parallel=G.planeIntersection(G.plane([0,0,0],[0,1,0]),G.plane([0,1,0],[0,1,0]));
check(!parallel.valid&&parallel.reason==='parallel','parallel plane diagnostic');
for(const amount of [0,.3,.7,1]){
  const study=G.loomStudy(amount,false),amplitude=study.amplitude,L=[-2.65,2,0];
  study.results.forEach((root,i)=>{
    const C=[2.5,.05+i*.105,0];
    if(root.valid){const p=root.point,n=G.normalize([-(.48*root.t-4*amplitude*Math.sin(4*root.t)),1,0]),incoming=G.normalize(G.sub(p,L)),outgoing=G.normalize(G.sub(C,p)),reflected=G.sub(incoming,G.mul(n,2*G.dot(incoming,n)));
      check(G.length(G.sub(reflected,outgoing))<1e-5,'accepted root obeys vector reflection law');
    }
  });
  for(const t of [-1.6,-.2,.7,1.8]){
    const h=1e-5,C=[2.5,1,0],r=G.reflectionConstraint(t,L,C,amplitude),left=G.reflectionConstraint(t-h,L,C,amplitude),right=G.reflectionConstraint(t+h,L,C,amplitude);
    check(close((right.g-left.g)/(2*h),r.dg,2e-7),'analytic constraint derivative agrees with finite differences');
  }
}
for(const tilt of [-.7,0,.4,.7])for(const aperture of [[-.28,0],[.28,0],[0,.28]]){
  const ray=G.thinLensRay([.6,-.4],aperture,tilt),t=(tilt*ray.origin[0]-ray.origin[2])/(ray.direction[2]-tilt*ray.direction[0]),hit=G.add(ray.origin,G.mul(ray.direction,t));
  check(G.length(G.sub(hit,ray.target))<1e-10,'aperture ray intersects common focus point');
  check(Math.abs(hit[2]-tilt*hit[0])<1e-10,'focus point lies on tilted plane');
}
for(const adverse of [false,true]){
  const a=G.relayStudy(.7,adverse),b=G.relayStudy(.7,adverse);
  check(a.check.allWeightsFinite&&a.check.minPdf>0,'relay retains supported finite weights');
  check(a.stats.ess>0&&a.stats.ess<=512,'proxy ESS bounded by sample count');
  check(a.stats.mean===b.stats.mean,'relay sample batch deterministic');
  const middle=a.paths.find(p=>p.role==='medium');
  check(middle.schematic&&middle.vertices.length===3,'independent medium chain explicitly marked schematic');
  check(middle.vertices.every(p=>G.density(p)>.2),'representative medium vertices lie in occupied scattering field');
  check(G.length(G.sub(a.connections[0][1],middle.vertices[0]))===0&&G.length(G.sub(a.connections[1][0],middle.vertices.at(-1)))===0,'two connections attach to distinct medium-chain ends');
  for(const p of [[0,0,0],[1,1,1],[-1,.4,.3]])check(Math.abs(G.transmittance(G.light,p,adverse,24)-G.transmittance(G.light,p,adverse,240))<.001,'absorption quadrature stable on probe rays');
}
check(close(G.segmentBox([-2,0,0],[2,0,0],[-1,-1,-1],[1,1,1]),.25),'segment box entry fraction');
check(G.segmentBox([-2,2,0],[2,2,0],[-1,-1,-1],[1,1,1])===null,'parallel segment misses box');
check(G.segmentBox([0,0,0],[2,0,0],[-1,-1,-1],[1,1,1])===0,'segment beginning inside solid is blocked immediately');
check(G.segmentBox([1,0,0],[2,0,0],[-1,-1,-1],[1,1,1])===0,'closed obstacle boundary is included');
check(G.chronolensStudy(.53,false).stats.agreement===1,'constant-index gates agree');
check(G.chronolensStudy(.53,true).stats.agreement<.2,'index plume produces gate mismatch');
check(G.atlasStudy(.8,false).stats.valid>G.atlasStudy(.8,true).stats.valid,'distant release loses visibility in selected scene');
const shader=readFileSync(new URL('./scene.frag',import.meta.url),'utf8'),pathShader=shader.split('vec3 raySegments')[1].split('vec3 tone')[0];
check(pathShader.includes(`i<${G.MAX_SEGMENTS}`),'shader and CPU share declared upload capacity');
check(!pathShader.includes('uGuides'),'constraint toggle cannot remove the persistent subpath layer');
for(let i=0;i<=10;i++)for(const adverse of [false,true])for(const fn of [G.relayStudy,G.chronolensStudy,G.focusStudy,G.loomStudy,G.sheetsStudy,G.atlasStudy]){
  const study=fn(i/10,adverse);
  check(study.segments.length<=G.MAX_SEGMENTS,'all slider states stay inside the shader segment budget');
  check(study.segments.every(s=>[...s.a,...s.b,s.width||.009].every(Number.isFinite)),'all slider states produce finite path geometry');
  check(study.annotations.every(a=>a.position.every(Number.isFinite)),'all slider states produce finite label anchors');
}
for(const mode of ['sheets','relay'])for(const [width,height,mobile] of [[1140,750,false],[1168,750,false],[900,595,false],[730,590,false],[1450,750,false],[358,750,true],[708,750,true]]){
  const {focal,offset,area,camera}=G.fitPathDiagram(mode,width,height,mobile),aspect=width/height,ro=G.mul([Math.sin(camera.yaw)*Math.cos(camera.pitch),Math.sin(camera.pitch),Math.cos(camera.yaw)*Math.cos(camera.pitch)],camera.zoom),forward=G.normalize(G.sub([0,.05,0],ro)),right=G.normalize(G.cross(forward,[0,1,0])),up=G.cross(right,forward),make=mode==='sheets'?G.sheetsStudy:G.relayStudy;
  for(const value of mode==='sheets'?[0,.6,1]:[0,.7,1])for(const adverse of [false,true]){
    const study=make(value,adverse),points=study.paths.flatMap(p=>p.vertices);
    for(const p of points){
      const q=G.sub(p,ro),z=G.dot(q,forward),x=.5+(focal*G.dot(q,right)/z-offset[0])/aspect,y=.5+offset[1]-focal*G.dot(q,up)/z;
      check(x>=area.left-1e-9&&x<=area.right+1e-9,`${mode}: every default-camera path vertex clears horizontal frame and controls at ${width}px`);
      check(y>=area.top-1e-9&&y<=area.bottom+1e-9,`${mode}: every default-camera path vertex clears heading and caption at ${height}px`);
    }
  }
}
report.passedChecks=checks;
console.log(JSON.stringify(report,null,2));
