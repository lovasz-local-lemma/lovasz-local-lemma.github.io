// Controlled counterfactuals of a frozen controller in the production PBD plant.
// This measures a policy's sampled behavior, not the plant's reachable set.
(function (BF) {
  'use strict';
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const variants = [
    {id:'recorded',label:'Recorded plant',detail:'Frozen weights; the saved gravity, actuator, rail and observations.'},
    {id:'refined',label:'2× physics resolution',detail:'Same control period and damping per second; twice as many physics steps.'},
    {id:'authority',label:'1.5× acceleration',detail:'Changes actuator authority only. The saved observation normalization is retained.'},
    {id:'push',label:'Two tip nudges',detail:'Recorded plant, plus opposite 35 px/s tip-velocity impulses at 10 s and 20 s.'},
    {id:'zero',label:'Zero commands',detail:'Passive baseline in the recorded plant; no controller.'}
  ];
  function create(record,options) {
    options=options||{};
    BF.championIO.validate(record);
    if(record.trainerParams?.pendulumInitialState||record.uiParams?.pendulumInitialState)
      throw new Error('This angle matrix tests releases from rest. Use the separate momentum-start audit for a supplied-velocity controller.');
    if (!['double','triple'].includes(record.setupId) || (record.policyType||'mlp')!=='mlp')
      throw new Error('This probe supports the point-mass double/triple MLP controllers.');
    const p={...BF.championIO.presetOf(record).params,curriculumEnabled:false,useDisturb:false};
    // The encoding is local to this experiment, including its display labels.
    const setup=Object.create(BF.setups.getSetup(record.setupId));
    setup.setObservationMode(p.pendulumObservationMode||'legacy');
    const variant=variants.find(v=>v.id===options.variant)||variants[0];
    const controlDt=p.physicsDt||1/120,substeps=variant.id==='refined'?2:1,dt=controlDt/substeps;
    const seconds=options.seconds||30,angle=options.angle??p.tiltDeg??10;
    const state=setup.buildWorld({...p,pendulumObservationMode:p.pendulumObservationMode||'legacy',startAngle:angle*Math.PI/180,
      cartAccel:p.cartAccel*(variant.id==='authority'?1.5:1),
      damping:1-Math.pow(1-p.damping,1/substeps)});
    if(setup.buildObservation(state).length!==record.genome.numInputs)throw new Error('Observation width does not match the saved controller.');
    if(state.uprightAssist || state.jointDamping)throw new Error('Use an unassisted physical controller for this probe.');
    const policy=BF.neat.policy(BF.neat.cloneGenome(record.genome));
    const baseVScale=p.cartControlMode!=='force'||(record.setupId==='triple'&&p.pendulumObservationMode!=='angular')?600:
      Math.max(600,p.cartAccel/(p.cartDrag>0?p.cartDrag:1));
    const hidden=record.genome.nodes.filter(n=>n.kind==='hidden');
    const steps=Math.round(seconds/controlDt),trace=[];
    let k=0,hold=0,above=0,saturation=0,clipping=0,contacts=0,contact=false,finite=true,maxRodError=0,firstBelow=null;
    let last=null;
    function step() {
      if(k>=steps||!finite)return false;
      const obs=setup.buildObservation(state);
      // Changing acceleration otherwise also changes the force-mode velocity
      // encoding. Keep that input in the saved policy's original units.
      if(variant.id==='authority'&&state.world.cartControlMode==='force')
        obs[1]=clamp(state.world.nodes[state.cartIdx].vx/baseVScale,-2,2);
      const command=variant.id==='zero'?0:clamp(policy.command(obs),-1,1);
      if(!Number.isFinite(command)){finite=false;return false;}
      state.lastCmd=command;state.lastCmds=[command];
      for(let j=0;j<substeps;j++) {
        BF.physics.step(state.world,dt,command);setup.tick?.(state,dt);
        last=BF.controlAnalysis.snapshot(state,{...p,physicsDt:dt},{time:k*controlDt+(j+1)*dt,command,
          observationScales:variant.id==='authority'?{cartVelocity:baseVScale}:null});
        finite=last.links.every(l=>Number.isFinite(l.angle)&&Number.isFinite(l.angularVelocity))&&Number.isFinite(last.cart.x);
        if(!finite)break;
        hold=last.aboveHorizontal?hold+dt:0;above+=last.aboveHorizontal?dt:0;
        if(!last.aboveHorizontal&&firstBelow==null)firstBelow=last.time;
        saturation+=last.cart.saturated?dt:0;
        clipping+=last.observations.clippedCount?dt:0;
        const touching=last.cart.railMargin<=1e-6;
        if(touching&&!contact)contacts++;contact=touching;
        maxRodError=Math.max(maxRodError,last.rodError);
        if(options.onSample)options.onSample({...last,observationValues:obs.slice(),observationLabels:setup.observationAbbr,
          nodeActivations:variant.id==='zero'||!policy.lastTrace?.activations?null:hidden.map(n=>policy.lastTrace.activations.get(n.id)??0),
          hiddenNodeCount:variant.id==='zero'?null:hidden.length,edgeCount:variant.id==='zero'?null:record.genome.conns.filter(c=>c.enabled).length});
      }
      if(variant.id==='push'&&(k+1===Math.round(10/controlDt)||k+1===Math.round(20/controlDt))) {
        const tip=state.world.nodes[state.tipIdx],sign=k+1===Math.round(10/controlDt)?1:-1;
        BF.physics.applyImpulse(state.world,state.tipIdx,sign*35*tip.mass,0);
      }
      if(last&&(k%6===0 || k===steps-1))trace.push({time:last.time,angles:last.links.map(l=>l.angleDeg),x:last.cart.x,
        command,hold,energy:last.energy.normalized});
      k++;return true;
    }
    function result() {
      return {variant:variant.id,angle,seconds,controlDt,physicsDt:dt,substeps,finite,complete:k===steps,
        finalAboveSeconds:hold,aboveFraction:above/seconds,saturationFraction:saturation/seconds,clippingFraction:clipping/seconds,
        contacts,maxRodError,firstBelow,success:finite&&k===steps&&hold>=10-1e-7&&contacts===0,trace,
        criterion:'Every physical link stays above horizontal for the final 10 of 30 seconds, with no rail contact throughout.'};
    }
    return {step,result,state,params:p,variant};
  }
  async function run(record,options) {
    const trial=create(record,options);let budget=0;
    while(true) {
      if(options?.cancelled?.())return {...trial.result(),cancelled:true};
      if(!trial.step())break;
      if(++budget===240){budget=0;
        await new Promise(resolve=>setTimeout(resolve,0));}
    }
    return trial.result();
  }
  BF.controlProbe={variants,create,run};
})(window.BF=window.BF||{});
