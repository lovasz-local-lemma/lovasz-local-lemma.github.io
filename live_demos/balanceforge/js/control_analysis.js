// Read-only diagnostics for the point-mass single/double/triple PBD scenes.
// No control decisions, learned inputs, or physical states are modified.
(function(BF){
 'use strict';
 function snapshot(state,params,meta){
  params=params||{};meta=meta||{};
  if(!state||!state.world||!state.segments)return null;
  const w=state.world,ns=w.nodes,c=ns[state.cartIdx];if(!c)return null;
  let prefixLength=0,kinetic=.5*c.mass*(c.vx*c.vx+c.vy*c.vy),potential=0,uprightPotential=0,rodError=0;
  const links=state.segments.map(([ia,ib],index)=>{
   const a=ns[ia],b=ns[ib],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),l2=Math.max(1e-12,length*length);
   const rod=w.rods.find(r=>(r.a===ia&&r.b===ib)||(r.a===ib&&r.b===ia)),restLength=rod?rod.length:length;
   const angle=Math.atan2(dx,-dy),angularVelocity=((b.vx-a.vx)*(-dy)+(b.vy-a.vy)*dx)/l2;
   prefixLength+=restLength;kinetic+=.5*b.mass*(b.vx*b.vx+b.vy*b.vy);
   potential+=b.mass*w.gravity*(c.y+prefixLength-b.y);uprightPotential+=2*b.mass*w.gravity*prefixLength;
   rodError=Math.max(rodError,Math.abs(length-restLength));
   return {index,angle,angleDeg:angle*180/Math.PI,angularVelocity,cosine:length>1e-12?-dy/length:0,length,restLength,mass:b.mass};
  });
  const supported=[1,2,3].includes(links.length)&&state.segments.every((s,i)=>i?s[0]===state.segments[i-1][1]:s[0]===state.cartIdx)&&!(w.springs||[]).length;
  const command=Number.isFinite(meta.command)?meta.command:Number.isFinite(state.lastCmd)?state.lastCmd:w.cartCommand||0;
  const dt=params.physicsDt||1/120,decay=w.damping>0&&w.damping<1?-Math.log(1-w.damping)/dt:0;
  const acceleration=Math.max(0,w.cartAccel||0),beta=Math.max(0,w.cartDrag||0)+decay,speed=Math.abs(c.vx);
  const brakingDistanceApprox=acceleration>0?(beta>1e-9?speed/beta-acceleration/(beta*beta)*Math.log1p(beta*speed/acceleration):speed*speed/(2*acceleration)):null;
  const single=links.length===1,angular=single||state.pendulumObservationMode==='angular',legacyTriple=links.length===3&&!angular;
  const dropout=single&&state.singleDropout&&state.singleDropout.mode==='blind-dropout';
  // These scales mirror the existing three scene encoders. In particular the
  // single and legacy-triple encoders retain /600 even for force-mode scenes.
  const xScale=!single&&!legacyTriple&&w.pendulumRailHalfWidth&&w.pendulumRailHalfWidth!==260?w.pendulumRailHalfWidth*(240/260):240;
  const vScale=meta.observationScales?.cartVelocity ||
    (!single&&!legacyTriple&&w.cartControlMode==='force'?Math.max(600,w.cartAccel/(w.cartDrag>0?w.cartDrag:1)):600);
  const clips=[];
  if(Math.abs(c.x/xScale)>1.5)clips.push({kind:'position',index:0,raw:c.x/xScale,limit:1.5});
  if(Math.abs(c.vx/vScale)>2)clips.push({kind:'cartVelocity',index:1,raw:c.vx/vScale,limit:2});
  if(angular)for(let i=0;i<links.length;i++){
   // Single's historical encoder divides by fixed segLen²; double/triple
   // divide by measured length². Preserve that detail in the diagnostic.
   const raw=links[i].angularVelocity*.3*(single?links[i].length**2/links[i].restLength**2:1);
   if(Math.abs(raw)>3)clips.push({kind:'angularVelocity',link:i,index:single?4:links.length===2?6+i:8+i,raw,limit:3});
  }
  if(!angular&&supported){const mid=ns[state.segments[0][1]],tip=ns[state.tipIdx];
   const raw=[(mid.vx-c.vx)/800,(tip.vx-mid.vx)/800];
   raw.forEach((v,i)=>{if(Math.abs(v)>2)clips.push({kind:'relativeVelocity',index:(links.length===2?6:8)+i,raw:v,limit:2});});
  }
  const minimumCosine=Math.min(...links.map(l=>l.cosine)),railMin=w.cartMinX,railMax=w.cartMaxX;
  const controlMode=w.cartControlMode||params.cartControlMode;
  return {
   time:Number.isFinite(meta.time)?meta.time:w.time||0,supported,links,minimumCosine,aboveHorizontal:links.length>0&&minimumCosine>0,
   gravity:w.gravity,cartAccel:acceleration,rodError,
   cart:{x:c.x,velocity:c.vx,command,commandFraction:Math.abs(command),saturated:Math.abs(command)>=.99,controlMode,
    railMin,railMax,railMargin:Math.min(c.x-railMin,railMax-c.x),directionalRailMargin:c.vx>=0?railMax-c.x:c.x-railMin,
    brakingDistanceApprox:controlMode==='force'?brakingDistanceApprox:null,brakingModel:'Cart alone with continuous drag; ignores pendulum reaction and rail impact. Not a reachability guarantee.'},
   energy:{supported,kind:'point-mass mechanical diagnostic',kinetic,potentialAboveHanging:potential,uprightPotential,total:kinetic+potential,
    normalized:supported&&uprightPotential>0?(kinetic+potential)/uprightPotential:null,
    actuatorPowerApprox:controlMode==='force'?c.mass*acceleration*command*c.vx:null,
    note:'Hanging rest is0; upright rest is1. Energy sufficiency is not swing-up feasibility; PBD damping/projection/contact do not conserve this diagnostic.'},
   observations:{mode:dropout?'blind-dropout':angular?'angular':'legacy',available:supported&&!dropout,clippedCount:supported&&!dropout?clips.length:null,angularClips:clips.filter(x=>x.kind==='angularVelocity').length,
    cartVelocityClipped:clips.some(x=>x.kind==='cartVelocity'),clips,
    note:dropout?'Clipping unavailable for masked/dropout observations; this read-only helper does not advance the encoder.':angular?'Per-link signed rates are observed but clipped beyond10rad/s.':'Legacy horizontal relative velocities can hide angular rate near horizontal.'},
   observationValues:meta.observationValues||meta.observation||null,observationLabels:meta.observationLabels||null,observationLimits:meta.observationLimits||null,
   nodeActivations:meta.nodeActivations||null,hiddenNodeCount:meta.hiddenNodeCount??null,edgeCount:meta.edgeCount??null,training:meta.training||null
  };
 }
 BF.controlAnalysis={snapshot};
})(window.BF=window.BF||{});
