import fs from 'node:fs';
const source=fs.readFileSync(new URL('./optics.js',import.meta.url),'utf8');
const {generateFamily,refract,traceGlass,clipSupport,joinableRulings,rotateIncident,SUPPORT_MIN,SUPPORT_MAX,dot,cross,length,sub,mul,unit}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let checks=0;
function check(condition,message){checks++;if(!condition)throw new Error(message);}
const close=(a,b,tol=1e-10)=>Math.abs(a-b)<tol;
const reports=[];
for(const shape of ['sphere','slab'])for(const family of ['cone','disk','offset'])for(const ior of [1,1.1,1.5,2.1]){
  const data=generateFamily({shape,family,ior,count:193});
  check(data.valid.length>0,`${shape} ${family} has finite transmitted support`);
  check(data.cost<=386,'At most two interface evaluations per ruling');
  for(const r of data.valid){
    check(close(length(r.d),1)&&close(length(r.inside),1)&&close(length(r.outgoing),1),'All directions normalized');
    check(r.transmission>=0&&r.transmission<=1,'Fresnel transmission bounded');
    check([...r.entry,...r.exit,...r.end].every(Number.isFinite),'Finite geometry');
    check(r.end.every((x,i)=>x>=SUPPORT_MIN[i]-1e-10&&x<=SUPPORT_MAX[i]+1e-10),'Outgoing endpoint lies inside finite support');
    if(r.reachesReceiver){
      check(close(r.end[0],3.6)&&r.end[1]>=-1.32-1e-10&&r.end[1]<=1.8+1e-10&&Math.abs(r.end[2])<=1.8+1e-10,'Receiver flag obeys actual drawn rectangle');
      check(r.termination==='receiver','Receiver flag matches clipping face');
    }
    if(ior===1)check(length(sub(r.d,r.outgoing))<1e-9,'Index one preserves incoming direction');
    if(shape==='sphere'){
      check(close(length(r.entry),1)&&close(length(r.exit),1),'Both events lie on sphere');
      const tangentIn=length(cross(r.entry,r.d)),tangentInside=length(cross(r.entry,r.inside));
      check(close(tangentIn,ior*tangentInside),'Snell entry invariant');
      const tangentExitInside=length(cross(r.exit,r.inside)),tangentOut=length(cross(r.exit,r.outgoing));
      check(close(ior*tangentExitInside,tangentOut),'Snell exit invariant');
      const reversed=traceGlass(r.end,mul(r.outgoing,-1),ior,'sphere');
      check(reversed.status==='transmitted','Reverse path remains transmitted');
      check(length(sub(reversed.outgoing,mul(r.d,-1)))<2e-9,'Refraction is reciprocal');
    }else check(length(sub(r.outgoing,r.d))<1e-10,'Parallel slab restores incoming direction');
  }
  if(family==='disk')check(data.deviation<1e-10,'Centered disk meridian stays planar');
  if(family==='offset'&&(shape==='slab'||ior===1))check(data.deviation<1e-10,'Offset plane preserved by normal slab or index one');
  if(family==='offset'&&shape==='sphere'&&ior>1)check(data.deviation>.001,'Off-center sphere rays leave incident plane');
  if(ior===1.5)reports.push({shape,family,count:193,valid:data.valid.length,interfaceEvaluations:data.cost,departureAtEndpoints:data.deviation,meanFresnelTransmission:data.meanTransmission});
}
check(refract([.3,Math.sqrt(.91),0],[-1,0,0],1.5)===null,'General Snell helper rejects total internal reflection');
const zero=generateFamily({family:'offset',offset:0,ior:1.5,count:193});check(zero.deviation<1e-10,'Zero-offset parallel plane regains central symmetry');
const offset=generateFamily({family:'offset',offset:.42,ior:1.5,count:193}).valid;
let skew=0;const center=offset[Math.floor(offset.length/2)];
for(const r of offset)skew=Math.max(skew,Math.abs(dot(cross(center.outgoing,r.outgoing),sub(r.exit,center.exit))));
check(skew>1e-4,'Offset outgoing rulings contain genuinely skew lines, not a rotated plane');
// Check the clipped-ray construction across a receiver/side-face transition.
// There is no arbitrary distance cutoff: nearby directions have nearby endpoints.
let last=null;
for(let i=0;i<=200;i++){
  const d=unit([1,0,.45+i*.0005]),hit=clipSupport([0,0,0],d);
  check(hit!==null&&hit.length>0,'Bounded ray has finite positive support');
  if(last)check(length(sub(hit.end,last.end))<.004,'Support endpoint stays continuous across termination changes');
  last=hit;
}
const receiver=clipSupport([0,0,0],unit([1,0,.49])),side=clipSupport([0,0,0],unit([1,0,.51]));
check(receiver.termination==='receiver'&&side.termination==='2+','Probe crosses from receiver to side support face');
check(!joinableRulings(receiver,side),'Sheet joins reject mismatched termination classes');
check(joinableRulings(receiver,clipSupport([0,.05,0],unit([1,0,.49]))),'Same-face neighboring rulings can be joined');
check(clipSupport([0,3,0],[1,0,0])===null,'Parallel ray outside finite support is rejected');
// Range extremes used by the UI must keep all declared receiver hits on-screen.
for(const offset of [-.95,-.42,0,.42,.95])for(const ior of [1,1.5,2.1]){
  const probe=generateFamily({family:'offset',offset,ior,count:385});
  for(const r of probe.valid){
    check(r.end.every((x,i)=>x>=SUPPORT_MIN[i]-1e-10&&x<=SUPPORT_MAX[i]+1e-10),'UI extreme endpoint remains bounded');
    if(r.reachesReceiver)check(close(r.end[0],3.6)&&r.end[1]>=-1.32-1e-10&&r.end[1]<=1.8+1e-10&&Math.abs(r.end[2])<=1.8+1e-10,'UI extreme receiver flag remains truthful');
  }
}
const tiltCases=[];
for(const shape of ['sphere','slab'])for(const family of ['cone','disk','offset'])for(const [tiltLR,tiltUD] of [[-25,0],[0,-25],[9,12],[25,25]])for(const ior of [1,1.5,2.1]){
  const data=generateFamily({shape,family,tiltLR,tiltUD,ior,azimuth:37,count:97});
  check(close(length(data.axis),1)&&close(length(data.planeNormal),1),'Tilt frame remains orthonormal');
  check(close(dot(data.axis,data.planeNormal),0),'Incident axis stays in its source plane');
  check(data.rays.length===97&&data.cost<=194,'Tilt traces the actual finite input budget');
  for(const r of data.rays){
    check(close(length(r.d),1),'Tilted incident direction is normalized');
    if(family!=='cone')check(Math.abs(dot(r.d,data.planeNormal))<1e-10&&Math.abs(dot(sub(r.o,data.anchor),data.planeNormal))<1e-10,'Tilted input remains an actual plane');
  }
  for(const r of data.valid){
    check([...r.entry,...r.exit,...r.outgoing,...r.end].every(Number.isFinite),'Tilted optical path remains finite');
    check(r.end.every((x,i)=>x>=SUPPORT_MIN[i]-1e-9&&x<=SUPPORT_MAX[i]+1e-9),'Tilted output respects finite receiver support');
    check(close(length(r.inside),1)&&close(length(r.outgoing),1),'Tilted refracted directions normalized');
    const entryNormal=shape==='sphere'?r.entry:[-1,0,0],exitNormal=shape==='sphere'?r.exit:[1,0,0];
    check(close(length(cross(entryNormal,r.d)),ior*length(cross(entryNormal,r.inside))),'Tilted entry satisfies Snell');
    check(close(ior*length(cross(exitNormal,r.inside)),length(cross(exitNormal,r.outgoing))),'Tilted exit satisfies Snell');
    if(ior===1||shape==='slab')check(length(sub(r.d,r.outgoing))<1e-9,'Tilted slab or index-one output restores incident direction');
  }
  if(family!=='cone'&&ior===1)check(data.deviation<1e-9,'Index one preserves the tilted input plane');
  if(ior===1.5)tiltCases.push({shape,family,tiltLR,tiltUD,valid:data.valid.length,departureAtEndpoints:data.deviation});
}
// The renamed tab is the pre-existing complementary disk chart, not a new
// unrelated source-disk family. Its phi control rotates the angular fan.
const legacy=generateFamily({family:'meridian'}),disk=generateFamily({family:'disk'});
check(JSON.stringify(legacy)===JSON.stringify(disk),'Legacy meridian aliases the photon-disk family exactly');
for(const azimuth of [-180,-90,-37,0,90,180]){
  const full=generateFamily({family:'disk',azimuth}),half=generateFamily({family:'disk',azimuth,opposing:false});
  check(full.deviation<1e-9&&half.deviation<1e-9,'Any untilted azimuth retains its central plane');
  check(half.rays.every(r=>dot(r.d,[0,Math.cos(azimuth*Math.PI/180),Math.sin(azimuth*Math.PI/180)])>=-1e-10),'One half-disk has one oriented azimuth');
}
const tiltLRProbe=generateFamily({family:'disk',tiltLR:10}),tiltUDProbe=generateFamily({family:'cone',tiltUD:10});
check(tiltLRProbe.deviation>.1,'Out-of-plane disk tilt actually changes the refracted support');
check(length(sub(tiltUDProbe.rays[96].entry,generateFamily({family:'cone'}).rays[96].entry))>.1,'UD tilt changes the physical entry point, not just the camera');
check(tiltLRProbe.valid.length!==disk.valid.length,'LR tilt changes actual sphere-hit support');
const probe=tiltLRProbe.valid[Math.floor(tiltLRProbe.valid.length/2)];
let tiltedSkew=0;
for(const r of tiltLRProbe.valid)tiltedSkew=Math.max(tiltedSkew,Math.abs(dot(cross(probe.outgoing,r.outgoing),sub(r.exit,probe.exit))));
check(tiltedSkew>1e-4,'Tilted disk output contains genuinely skew rulings');
check(generateFamily({family:'disk',tiltLR:25}).valid.length===0,'A plane outside the glass has truthful empty transmitted support');
const report={checks,scope:'Geometric optics and finite sampled support, not a transport estimator',offsetSkewDeterminant:skew,tiltedDiskSkewDeterminant:tiltedSkew,cases:reports,tiltCases};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--save'))fs.writeFileSync(new URL('./geometry-checks.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
