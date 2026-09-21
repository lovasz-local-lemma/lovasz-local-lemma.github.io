// Classical control study on the actual single-pendulum PBD plant.
(function(BF) {
  'use strict';
  const DEFAULTS = {gravity:1000,damping:0.0005,cartControlMode:'force',cartAccel:7000,cartDrag:1,cartWallsEnabled:true};
  function coords(s) {
    const c=s.world.nodes[s.cartIdx],b=s.world.nodes[s.tipIdx],dx=b.x-c.x,dy=b.y-c.y,l2=dx*dx+dy*dy;
    return [c.x,c.vx,Math.atan2(dx,-dy),((b.vx-c.vx)*(-dy)+(b.vy-c.vy)*dx)/l2];
  }
  function state(z,opts,dt) {
    const s=BF.setups.getSetup('single').buildWorld({...opts,startAngle:z[2]});
    const c=s.world.nodes[s.cartIdx],b=s.world.nodes[s.tipIdx],L=s.world.rods[0].length;
    c.x=z[0]; b.x+=z[0]; c.vx=z[1]; b.vx=z[1]+L*Math.cos(z[2])*z[3]; b.vy=L*Math.sin(z[2])*z[3];
    for(const n of s.world.nodes){n.px=n.x-n.vx*dt;n.py=n.y-n.vy*dt;}
    return s;
  }
  function linearize(opts,dt) {
    const A=Array.from({length:4},()=>Array(4).fill(0)),B=Array(4),eps=1e-4;
    for(let j=0;j<5;j++) {
      const plus=[0,0,0,0],minus=plus.slice(); if(j<4){plus[j]=eps;minus[j]=-eps;}
      const sp=state(plus,opts,dt),sm=state(minus,opts,dt);
      BF.physics.step(sp.world,dt,j===4?eps:0); BF.physics.step(sm.world,dt,j===4?-eps:0);
      const zp=coords(sp),zm=coords(sm);
      for(let i=0;i<4;i++) {if(j<4) A[i][j]=(zp[i]-zm[i])/(2*eps);else B[i]=(zp[i]-zm[i])/(2*eps);}
    }
    return {A,B};
  }
  function dare(A,B,Q,R) {
    let P=Q.map((q,i)=>Q.map((_,j)=>i===j?q:0)),K;
    for(let it=0;it<10000;it++) {
      const PA=Array.from({length:4},()=>Array(4).fill(0)),PB=Array(4).fill(0);
      for(let i=0;i<4;i++)for(let k=0;k<4;k++){PB[i]+=P[i][k]*B[k];for(let j=0;j<4;j++)PA[i][j]+=P[i][k]*A[k][j];}
      const den=R+B.reduce((sum,b,i)=>sum+b*PB[i],0);
      K=Array(4).fill(0);for(let j=0;j<4;j++)for(let i=0;i<4;i++)K[j]+=B[i]*PA[i][j]/den;
      let error=0;const next=Array.from({length:4},()=>Array(4).fill(0));
      for(let i=0;i<4;i++)for(let j=0;j<4;j++) {
        let value=(i===j?Q[i]:0)-K[i]*den*K[j];
        for(let k=0;k<4;k++)value+=A[k][i]*PA[k][j];
        next[i][j]=value;error=Math.max(error,Math.abs(value-P[i][j]));
      }
      // Roundoff in the Riccati subtraction can excite an antisymmetric mode
      // under repeated A'PA. A Riccati value matrix is symmetric by definition.
      for(let i=0;i<4;i++)for(let j=0;j<i;j++){const value=.5*(next[i][j]+next[j][i]);next[i][j]=next[j][i]=value;}
      P=next;if(error<1e-9)return {K,P,iterations:it+1};
    }
    return {K,P,iterations:10000};
  }
  function create(opts,control) {
    const plant={...DEFAULTS,...opts},c={energyGain:2,positionGain:20,velocityGain:5,targetEnergy:1.03,catchAngle:.6,catchRate:3,wallGuard:180,...control};
    if(plant.cartControlMode!=='force')throw new Error('The energy controller requires the force-driven single-pendulum scene.');
    const dt=plant.physicsDt||1/120,lin=linearize(plant,dt),lqr=dare(lin.A,lin.B,[.00003,.000002,6,.12],.03);
    if(lqr.iterations===10000||!lqr.K.every(Number.isFinite))throw new Error('The local Riccati solve did not converge for this scene.');
    return {plant,control:c,dt,linearization:lin,lqr,holding:false};
  }
  function command(controller,s) {
    const z=coords(s),[x,v,t,w]=z,c=controller.control,L=s.world.rods[0].length,g=s.world.gravity;
    if(!controller.holding&&Math.abs(t)<c.catchAngle&&Math.abs(w)<c.catchRate)controller.holding=true;
    if(controller.holding&&Math.abs(t)>.9)controller.holding=false;
    let acceleration;
    if(controller.holding) acceleration=-controller.lqr.K.reduce((sum,k,j)=>sum+k*z[j],0)*s.world.cartAccel;
    else {
      // E/(m g L) = L*w^2/(2g) + cos(theta), with theta measured from
      // upright. Its ideal pendulum derivative is -a*w*cos(theta)/g.
      // The small energy surplus counters damping; centering/braking terms
      // and the discrete PBD plant make this a tested heuristic, not a global
      // Lyapunov guarantee. The actual state is never rewritten by command().
      const E=.5*L/g*w*w+Math.cos(t);
      acceleration=c.energyGain*g*w*Math.cos(t)*(E-c.targetEnergy)-c.positionGain*x-c.velocityGain*v+s.world.cartDrag*v;
      // The exact hanging rest has no angular signal: a bounded push breaks its symmetry.
      if(Math.abs(w)<.01&&Math.abs(Math.sin(t))<.01)acceleration=.12*s.world.cartAccel;
    }
    if(!controller.holding&&Math.abs(x)>c.wallGuard&&x*v>0) {
      const distance=Math.max(5,Math.max(Math.abs(s.world.cartMinX),Math.abs(s.world.cartMaxX))-Math.abs(x)-10);
      const braking=v*v/(2*distance)+100;
      acceleration=x>0?Math.min(acceleration,-braking):Math.max(acceleration,braking);
    }
    return Math.max(-1,Math.min(1,acceleration/s.world.cartAccel));
  }
  function makePolicy(getState,opts,control) {
    const controller=create(opts,control);
    return {controller,command(){return command(controller,getState());}};
  }
  BF.singleSwingup={DEFAULTS,coords,state,linearize,dare,create,command,makePolicy};
})(window.BF);
