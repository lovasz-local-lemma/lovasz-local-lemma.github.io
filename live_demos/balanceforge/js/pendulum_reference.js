// Calibrated nonlinear swing-up + time-varying feedback + local LQR holding.
// This adapter uses the existing rigid driven-pivot equations at every tick.
// A saved nominal trajectory guides control; it never replaces physical state.
(function(BF){
 'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rad=Math.PI/180;
 function dataFor(links){return BF.pendulumReferenceData?.[links]||null;}
 function coordinates(run,state){
  const r=run.trajectory,sign=run.direction,n=run.links;
  return [sign*state[0]/r.scale[0],sign*state[1]/r.scale[1],
   ...Array.from({length:n},(_,j)=>[sign*state[2+j]-Math.PI,sign*state[2+n+j]/r.scale[3+2*j]]).flat()];
 }
 function updatePhase(run){
  const finished=run.referenceMode==='hold'||run.time+1e-10>=run.trajectory.controls.length*run.controlDt;
  const settled=run.finite&&run.allAboveHorizontal&&run.angleDeg.every(a=>a<20)&&run.aboveSeconds>=2;
  run.safeHold=finished&&settled&&(run.config.railHalf===null||Math.abs(run.state[0])<.9*run.config.railHalf);
  if(run.safeHold&&run.acquiredAt===null)run.acquiredAt=run.time;
  run.phase=run.safeHold?'holding':run.acquiredAt===null?'acquiring':'recovering';
 }
 function command(run,state){
  updatePhase(run);const record=run.trajectory,index=Math.floor((run.time+1e-10)/run.controlDt);
  if(run.referenceMode==='swingup'&&index<record.controls.length){
   const z=coordinates(run,state),nominal=record.nominal[index];let normalized=record.controls[index];
   for(let j=0;j<z.length;j++){
    let error=z[j]-nominal[j];if(j>=2&&j%2===0)error=Math.atan2(Math.sin(error),Math.cos(error));
    normalized+=record.feedback[index][j]*error;
   }
   return run.direction*clamp(normalized,-1,1)*run.config.maxAccel;
  }
  if(record?.holdFeedback&&run.referenceMode==='swingup'){
   const z=coordinates(run,state);for(let j=2;j<z.length;j+=2)z[j]=Math.atan2(Math.sin(z[j]),Math.cos(z[j]));
   return run.direction*clamp(-record.holdFeedback.reduce((sum,k,j)=>sum+k*z[j],0),-1,1)*run.config.maxAccel;
  }
  return run.baseModel.lqrAccel(state,run.K,run.config);
 }
 function create(options){
  const o=options||{},links=o.links===3?3:2,record=dataFor(links),referenceMode=o.phase==='hold'||o.mode==='hold'?'hold':'swingup';
  if(!BF.rigidReference)throw new Error('Load rigid_reference.js before pendulum_reference.js.');
  if(!record&&referenceMode==='swingup')throw new Error('This swing-up trajectory has not been loaded.');
  const config={...(record?.config||{}),...o.config};
  for(const key of['segLen','maxAccel','railHalf','wallK'])if(o[key]!==undefined)config[key]=o[key];
  const gravity=o.gravity??record?.gravity??700;
  if(referenceMode==='swingup'){
   for(const key of['segLen','maxAccel','railHalf','wallK','physDt','substeps'])if(config[key]!==record.config[key])
    throw new Error('Swing-up is calibrated for the saved plant; use Hold for changed physical parameters.');
   if(gravity!==record.gravity)throw new Error('Swing-up is calibrated for gravity '+record.gravity+'; use Hold for changed gravity.');
  }
  const run=BF.rigidReference.create({links,gravity,...config,tiltDeg:o.tiltDeg??(referenceMode==='hold'?5:180),controllerEnabled:o.controllerEnabled});
  run.config={...run.config,...config};run.controlDt=run.config.physDt*run.config.substeps;
  run.baseModel=run.model;run.K=run.baseModel.designLQR(gravity,run.config).K;
  run.direction=o.direction===-1?-1:1;run.trajectory=record;run.referenceMode=referenceMode;
  if(referenceMode==='swingup'){
   const tilt=(o.tiltDeg??180)*rad;
   run.initialState=[o.cartX||0,o.cartVelocity||0,...Array.from({length:links},(_,j)=>run.direction*(Math.PI-tilt)+(o.angleOffsets?.[j]||0)),...Array.from({length:links},(_,j)=>o.angularVelocities?.[j]||0)];
  }
  run.model={...run.baseModel,lqrAccel:state=>command(run,state)};
  run.isReference=true;run.plant='rigid-driven-pivot';run.method=referenceMode==='hold'?'Local LQR':'Nonlinear trajectory optimization, time-varying feedback, then local LQR';
  run.validatedPulseStrength=links===3?1000:3000;
  return reset(run);
 }
 function reset(run){BF.rigidReference.reset(run);run.acquiredAt=null;run.safeHold=false;run.phase='acquiring';updatePhase(run);return run;}
 function step(run,seconds,integratorConfig){BF.rigidReference.step(run,seconds,integratorConfig);updatePhase(run);return run;}
 function nudge(run,options){return BF.rigidReference.nudge(run,options);}
 function frame(run){return {...BF.rigidReference.frame(run),phase:run.phase,safeHold:run.safeHold,acquiredAt:run.acquiredAt,isReference:true,plant:run.plant};}
 BF.pendulumReference={create,step,nudge,frame,reset,command};
})(window.BF=window.BF||{});
