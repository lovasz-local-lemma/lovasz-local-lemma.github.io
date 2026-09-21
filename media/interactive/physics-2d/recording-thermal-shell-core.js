/* Two-node heat exchange + authored native CRUST_DOUGH rates. The common
   radius and scalar strain are an explanatory reduction, not native MPM. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RecordingShell=api;})(globalThis,()=>{
  'use strict';
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
  function thermalStep(Ts,Tc,heater,k,dt,h=.20,Cs=.18,Cc=.82){
    // Backward Euler on a symmetric heat exchange. Stable for the full range;
    // with h=0 the weighted energy Cs*Ts+Cc*Tc is conserved exactly.
    const a=Cs/dt+h+k,b=-k,c=-k,d=Cc/dt+k,r=Cs/dt*Ts+h*heater,s=Cc/dt*Tc,det=a*d-b*c;
    return [(r*d-b*s)/det,(a*s-c*r)/det];
  }
  function stateStep(q,T,shell,dt,vent){
    const cureRate=(shell?1.4:.18)*clamp((T-370)/220);
    const gasRate=2.2*(shell?.12:1.8)*clamp((T-345)/165)*(1-q.cure*.25);
    const cure=1-(1-q.cure)*Math.exp(-cureRate*dt);
    let gas=1-(1-q.gas)*Math.exp(-gasRate*dt);
    if(T<335)gas*=Math.exp(-.1*dt);if(vent)gas*=Math.exp(-1.1*dt);
    return {cure:clamp(cure),gas:clamp(gas)};
  }
  function geometry(shell,core){
    const sc=smooth(.14,.72,shell.gas)*smooth(.12,.90,shell.cure),cc=smooth(.14,.72,core.gas)*smooth(.12,.90,core.cure);
    const rs=Math.sqrt(Math.max(.25,1+.30*shell.gas-.04*shell.cure-.02*sc));
    const rc=Math.sqrt(Math.max(.25,1+.48*core.gas-.012*core.cure-.02*cc));
    const ks=1.2+5.6*shell.cure,kc=1.2;
    return {rs,rc,ks,kc,r:(ks*rs+kc*rc)/(ks+kc)};
  }
  function sample(options={}){
    const p={time:5,peak:610,conductance:.05,strain:.12,dt:.02,...options};
    let Ts=300,Tc=300,shell={cure:0,gas:0},core={cure:0,gas:0},tear=0,t=0,ventTime=null;
    const history=[{t,Ts,Tc,shell:0,core:0,gas:0,tear:0}];
    while(t<p.time-1e-10){
      const dt=Math.min(p.dt,p.time-t,t<8?8-t:Infinity),heater=t<8?p.peak:300;
      [Ts,Tc]=thermalStep(Ts,Tc,heater,p.conductance,dt);
      shell=stateStep(shell,Ts,true,dt,tear>.6);core=stateStep(core,Tc,false,dt,tear>.6);
      const g=geometry(shell,core),elastic=Math.max(0,g.r/g.rs-1)+p.strain;
      const mismatch=shell.cure*.04+core.gas*.07,threshold=.4-.22*shell.cure;
      const drive=Math.max(0,.92*elastic+mismatch-threshold),rate=(.16+1.49*shell.cure)*(1+core.gas);
      tear=clamp(tear+drive*rate*dt);t+=dt;if(tear>.6&&ventTime===null)ventTime=t;
      history.push({t,Ts,Tc,shell:shell.cure,core:core.cure,gas:core.gas,tear});
    }
    return {p,Ts,Tc,shell,core,tear,ventTime,geometry:geometry(shell,core),history,phase:p.time<8?'Heating · surface first':'Cooling · setting remains'};
  }
  return {clamp,smooth,thermalStep,stateStep,geometry,sample};
});
