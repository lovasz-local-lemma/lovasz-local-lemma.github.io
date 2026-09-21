// Temporary display integration, separate from training and archived settings.
(function(BF){
 'use strict';
 const rates=[60,120,240,480,960,1920];
 function compatible(hz,controlDt){const n=hz*controlDt;return Number.isFinite(n)&&n>=1&&Math.abs(n-Math.round(n))<1e-8;}
 function choices(recordedDt,controlDt){
  return [...new Set([1/recordedDt,...rates])].filter(hz=>compatible(hz,controlDt)).sort((a,b)=>a-b);
 }
 function integration(recordedDt,controlDt,overrideHz){
  const hz=overrideHz||1/recordedDt;
  if(!compatible(hz,controlDt))throw new RangeError('Physics must divide the unchanged controller interval into whole steps.');
  return {hz,dt:1/hz,substeps:Math.round(hz*controlDt),recordedHz:1/recordedDt,overridden:Math.abs(hz-1/recordedDt)>1e-7};
 }
 function rebase(world,fromDt,toDt){
  if(fromDt===toDt)return;
  const ratio=toDt/fromDt;
  for(const n of world.nodes){
   // Preserve encoded velocity, including setup-specific collision corrections.
   // Position and physical velocity are never assigned to a desired pose.
   n.px=n.x-(n.x-n.px)*ratio;n.py=n.y-(n.y-n.py)*ratio;
  }
 }
 function advance(state,command,recordedDt,overrideHz,afterStep){
  const plan=integration(recordedDt,recordedDt,overrideHz),world=state.world,setup=state.setup;
  // Keep the recorded path byte-for-byte unchanged, including setup events.
  if(!plan.overridden){
   BF.physics.step(world,recordedDt,command);setup.tick?.(state,recordedDt);afterStep?.(recordedDt);return;
  }
  const damping=world.damping,tr=state.terrainRun,terrainStep=tr?.steps,terrainEvery=tr?.P.controlEvery;
  rebase(world,recordedDt,plan.dt);
  world.damping=1-Math.pow(1-damping,plan.dt/recordedDt);
  // The outside world always sees the original counter units. Inside the
  // integration interval, scale both phase and period so terrain still latches
  // at 30 Hz, even when its physical collisions run more frequently.
  if(tr){tr.steps=terrainStep*plan.substeps;tr.P.controlEvery=terrainEvery*plan.substeps;}
  try{
   for(let i=0;i<plan.substeps;i++){
    BF.physics.step(world,plan.dt,command);setup.tick?.(state,plan.dt);afterStep?.(plan.dt);
   }
  }finally{
   if(tr){tr.steps=terrainStep+Number(tr.steps>terrainStep*plan.substeps);tr.P.controlEvery=terrainEvery;}
   rebase(world,plan.dt,recordedDt);
   world.damping=damping;
  }
  // Histories and damping are in recorded units again before a planner clones
  // the world or the next observation is built. Its forecast model is unchanged.
 }
 BF.playbackPhysics={rates,choices,integration,rebase,advance};
})(window.BF=window.BF||{});
