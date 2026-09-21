/* Local simple-shear reduction of MAT_PHASE's deformation-gradient reset.
   Prescribed phase target; no heat transport, latent-heat solve or MPM dynamics. */
((root,factory)=>{const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RecordingRecoveryCore=api;})(globalThis,()=>{
  'use strict';
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  function smoothstep(a,b,x){const t=clamp((x-a)/(b-a));return t*t*(3-2*t);}
  const DT=.02,RELEASE=100,END=120,REFERENCE=8;
  function solve({heatSteps=32,heatLevel=.75,shear=.65}={}){
    heatSteps=Math.round(clamp(heatSteps,1,60));heatLevel=clamp(heatLevel);shear=clamp(shear,0,1.2);
    let phi=0,elasticShear=shear;
    const samples=[];
    for(let update=0;update<=END;update++){
      const heating=update>0&&update<=heatSteps;
      let reset=0;
      if(update){
        const target=heating?heatLevel:0;
        phi=clamp(phi+clamp(target-phi,-2*DT,2*DT));
        reset=.3*smoothstep(.3,.9,phi);
        // F=[[1,gamma_e],[0,1]], J=1: mixing F toward sqrt(J)I
        // leaves its diagonal unchanged and multiplies shear by (1-reset).
        elasticShear*=1-reset;
      }
      const relaxedShear=shear-elasticShear,released=update>=RELEASE;
      samples.push({update,phi,reset,stiffness:Math.max((1-phi)**3,.02),memory:shear?elasticShear/shear:1,
        recoverableShear:elasticShear,relaxedShear,elasticShear:released?0:elasticShear,
        totalShear:released?relaxedShear:shear,heating,released});
    }
    return {heatSteps,heatLevel,shear,samples,final:samples[END]};
  }
  return {DT,RELEASE,END,REFERENCE,clamp,smoothstep,solve};
});
