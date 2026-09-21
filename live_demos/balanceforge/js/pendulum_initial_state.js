// Physical initial conditions for a serial pendulum. This helper runs once at
// scene creation; it supplies no subsequent controller or state correction.
(function(root){
 'use strict';
 function sample(initial,spread,rng,direction){
  const s=spread||{};
  if(typeof rng==='number'){
   if(!root.BF?.util?.makeRng)throw new Error('Load util.js before sampling a seeded pendulum start.');
   rng=root.BF.util.makeRng(rng);
  }
  if(!rng||typeof rng.range!=='function'||typeof rng.next!=='function')throw new Error('Provide a deterministic RNG or numeric seed.');
  for(const key of ['angleDeg','relativeAngleDeg','angularVelocity','cartVelocity'])if(s[key]!=null&&!(Number.isFinite(s[key])&&s[key]>=0))throw new Error('Initial-state spreads must be finite and nonnegative.');
  const sign=s.mirror==='both'?(direction===-1||direction===1?direction:(rng.next()<.5?-1:1)):1;
  const jitter=amount=>amount?rng.range(-amount,amount):0,common=jitter(s.angleDeg||0);
  const angles=initial.anglesDeg.map((a,j)=>(a+common+(j?jitter(s.relativeAngleDeg||0):0))*sign);
  const omega=initial.angularVelocities.map(w=>(w+jitter(s.angularVelocity||0))*sign);
  return {anglesDeg:angles,angularVelocities:omega,cartX:(initial.cartX||0)*sign,
   cartVelocity:(initial.cartVelocity||0)*sign+jitter(s.cartVelocity||0)};
 }
 function apply(state,initial,physicsDt){
  if(!state||!state.world||!Array.isArray(state.segments))throw new Error('A serial pendulum state is required.');
  if(!(Number.isFinite(physicsDt)&&physicsDt>0))throw new Error('A positive physics timestep is required.');
  const world=state.world,nodes=world.nodes,cart=nodes[state.cartIdx],angles=initial.anglesDeg,omega=initial.angularVelocities;
  if(!Array.isArray(angles)||angles.length!==state.segments.length||!angles.every(Number.isFinite))throw new Error('Provide one finite angle in degrees per rod.');
  if(!Array.isArray(omega)||omega.length!==angles.length||!omega.every(Number.isFinite))throw new Error('Provide one finite signed angular velocity in rad/s per rod.');
  const cartX=initial.cartX??0,cartVelocity=initial.cartVelocity??0;
  if(!Number.isFinite(cartX)||!Number.isFinite(cartVelocity)||cartX<world.cartMinX||cartX>world.cartMaxX)throw new Error('Initial cart state must be finite and within the rail.');
  const lengths=state.segments.map(([i,j])=>{
   const rod=world.rods.find(r=>(r.a===i&&r.b===j)||(r.a===j&&r.b===i));
   if(!rod||!(rod.length>0))throw new Error('Each segment must have a physical rod.');return rod.length;
  });
  cart.x=cartX;cart.y=world.cartRailY;cart.vx=cartVelocity;cart.vy=0;
  state.segments.forEach(([i,j],k)=>{
   const a=nodes[i],b=nodes[j],theta=angles[k]*Math.PI/180,L=lengths[k],w=omega[k];
   b.x=a.x+L*Math.sin(theta);b.y=a.y-L*Math.cos(theta);
   b.vx=a.vx+L*Math.cos(theta)*w;b.vy=a.vy+L*Math.sin(theta)*w;
  });
  // Verlet stores displacement, not only velocity. Use the actual first
  // physics step here, including any refinement below the command period.
  for(const n of nodes){n.px=n.x-n.vx*physicsDt;n.py=n.y-n.vy*physicsDt;}
  return {anglesDeg:angles.slice(),angularVelocities:omega.slice(),cartX,cartVelocity,
   kineticEnergy:nodes.reduce((sum,n)=>sum+.5*n.mass*(n.vx*n.vx+n.vy*n.vy),0)};
 }
 const api={apply,sample};
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root){root.BF=root.BF||{};root.BF.pendulumInitialState=api;}
})(typeof window!=='undefined'?window:globalThis);
