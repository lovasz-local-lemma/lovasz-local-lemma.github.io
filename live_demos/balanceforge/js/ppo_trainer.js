// PPO actor-critic on the actual production point-mass plant. Gradients pass
// through network likelihood/value objectives, never through a fake simulator.
(function(BF){
 'use strict';const P=BF.ppoPolicy;
 const defaults={seed:11,setupId:'single',hiddenSizes:[32,32],numEnvs:16,rolloutSteps:256,epochs:6,minibatchSize:128,
  learningRate:3e-4,valueLearningRate:1e-3,clipEpsilon:.2,valueCoefficient:.5,entropyCoefficient:.003,maxGradientNorm:.5,
  gamma:.995,gaeLambda:.98,logStd:-.7,minLogStd:-3,maxLogStd:.5,targetKL:.03,
  gravity:850,cartAccel:8000,cartDrag:8,cartControlMode:'force',damping:.005,physicsDt:1/120,pendulumRailHalfWidth:260,
  cartMaxSpeed:600,pendulumObservationMode:'angular',singleObservationMode:'full',uprightAssist:0,jointDamping:0,useDisturb:false,
  pushTarget:'tip',pushStrength:100,pushDuration:0,pushSmoothing:0,pushIntervalMin:3,pushIntervalMax:5,
  episodeSeconds:12,startAngleDeg:10,startAngleSpreadDeg:5,uniformStart:false,termination:'fall',rewardMode:'balance',rewardScale:.1,
  centerPenalty:.08,actionPenalty:.001,railPenalty:2};
 function create(options){
  const config={...defaults,...options?.params,...options};delete config.params;
  const resumed=options?._resumeCheckpoint;delete config._resumeCheckpoint;
  if(options?.startAngleDeg==null&&options?.params?.startTiltDeg!=null)config.startAngleDeg=options.params.startTiltDeg;
  if(options?.startAngleSpreadDeg==null&&options?.params?.startTiltSpreadDeg!=null)config.startAngleSpreadDeg=options.params.startTiltSpreadDeg;
  config.hiddenSizes=(config.hiddenSizes||defaults.hiddenSizes).slice();
  if(!['single','double','triple'].includes(config.setupId)||config.cartControlMode!=='force'||config.uprightAssist||config.jointDamping)throw new Error('PPO requires an unassisted direct-acceleration point-mass pendulum.');
  if(config.useDisturb&&!BF.disturb)throw new Error('PPO disturbance training requires the production disturbance module.');
  const setup=Object.create(BF.setups.getSetup(config.setupId));setup.setObservationMode?.(config.setupId==='single'?'full':'angular');
  const random=P.rng(config.seed),model=options?.model?P.restore(options.model):P.create({numInputs:setup.observationCount,hiddenSizes:config.hiddenSizes,seed:config.seed,logStd:config.logStd});
  if(model.actor.sizes[0]!==setup.observationCount)throw new Error('PPO actor observation width mismatch.');
  if(resumed)random.state=resumed.rngState>>>0;
  let update=resumed?.update||0,totalSteps=resumed?.totalSteps||0,history=(resumed?.history||[]).map(m=>({...m})),lastMetrics=history.at(-1)||null,completed=(resumed?.completed||[]).map(e=>({...e}));
  const resumeInfo=resumed?{mode:'Episodes restarted; actor, critic, optimizer, RNG, counters and history restored',fromUpdate:update,fromPhysicsSteps:totalSteps}:null;
  const dt=config.physicsDt,envs=[];
  function start(env){
   const magnitude=config.uniformStart?random.next()*config.startAngleDeg:Math.max(.1,config.startAngleDeg+(2*random.next()-1)*config.startAngleSpreadDeg);
   const angle=magnitude*(random.next()<.5?-1:1)*Math.PI/180;
   env.state=setup.buildWorld({...config,startAngle:angle,initialStateRng:random});env.obs=setup.buildObservation(env.state);env.elapsed=0;env.return=0;env.hold=0;env.bestHold=0;env.contacts=0;env.wasContact=false;env.vCache=null;
   env.pushes=config.useDisturb?BF.disturb.make(config,env.pushRandom):null;
  }
  for(let i=0;i<config.numEnvs;i++){
   // Independent Mulberry32 streams keep a changed push schedule from
   // consuming policy-exploration random numbers. The same RNG algorithm is
   // used by BF.util.makeRng, with explicit states for checkpoint restart.
   const env={pushRandom:P.rng(resumed?.disturbanceRngStates?.[i]??((config.seed^Math.imul(i+1,0x9e3779b9))>>>0))};start(env);envs.push(env);
  }
  function* collectRolloutChunks(){
   const count=config.numEnvs*config.rolloutSteps,inputSize=model.actor.sizes[0];
   const batch={count,inputSize,observations:new Float64Array(count*inputSize),z:new Float64Array(count),oldLogProb:new Float64Array(count),values:new Float64Array(count),
    rewards:new Float64Array(count),nextValues:new Float64Array(count),done:new Uint8Array(count),terminal:new Uint8Array(count),advantages:new Float64Array(count),returns:new Float64Array(count)};
   envs.forEach(e=>e.vCache=null);let rewardSum=0,aboveSum=0,railSteps=0;
   for(let t=0;t<config.rolloutSteps;t++)for(let e=0;e<config.numEnvs;e++){
    const env=envs[e],index=t*config.numEnvs+e,obs=env.obs,mu=P.forward(model.actor,obs),std=Math.exp(model.logStd[0]),z=mu+std*random.normal(),command=Math.tanh(z);
    const value=env.vCache==null?P.forward(model.critic,obs):env.vCache;
    batch.observations.set(obs,index*inputSize);batch.z[index]=z;batch.oldLogProb[index]=P.gaussianLogProb(z,mu,model.logStd[0]);batch.values[index]=value;
    const state=env.state;state.lastCmd=command;state.lastCmds=[command];BF.physics.step(state.world,dt,command);setup.tick?.(state,dt);env.elapsed++;
    if(env.pushes)BF.disturb.tick(env.pushes,state,dt,config,env.pushRandom);
    const kin=BF.setups.kinematics(state),cart=state.world.nodes[state.cartIdx],above=kin.minSegmentCos>0;
    const finite=state.world.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)&&Number.isFinite(n.vx)&&Number.isFinite(n.vy));
    const contact=cart.x<=state.world.cartMinX+1e-6||cart.x>=state.world.cartMaxX-1e-6;
    if(contact&&!env.wasContact)env.contacts++;env.wasContact=contact;
    env.hold=above?env.hold+dt:0;env.bestHold=Math.max(env.bestHold,env.hold);
    const cosine=Number.isFinite(kin.minSegmentCos)?kin.minSegmentCos:-1;
    const center=Math.min(2,Math.abs(cart.x)/config.pendulumRailHalfWidth);
    let reward=(config.rewardMode==='swingup'?(.5+.5*cosine)+(above?.5:0):1)-config.centerPenalty*center*center-config.actionPenalty*command*command;
    if(contact)reward-=config.railPenalty;
    const terminal=!finite||contact||(config.termination==='fall'&&!above);
    if(terminal&&config.rewardMode==='balance')reward=-1;
    reward*=config.rewardScale;if(!Number.isFinite(reward))reward=-config.rewardScale;
    batch.rewards[index]=reward;env.return+=reward;rewardSum+=reward;aboveSum+=above?1:0;railSteps+=contact?1:0;
    env.obs=finite?setup.buildObservation(state):new Float64Array(inputSize);
    const nextValue=terminal?0:P.forward(model.critic,env.obs);batch.nextValues[index]=nextValue;env.vCache=nextValue;
    const truncated=env.elapsed>=Math.round(config.episodeSeconds/dt);
    batch.terminal[index]=terminal?1:0;batch.done[index]=terminal||truncated?1:0;
    if(batch.done[index]){completed.push({return:env.return,seconds:env.elapsed*dt,finalHold:env.hold,bestHold:env.bestHold,contacts:env.contacts,terminal,angle:config.startAngleDeg});if(completed.length>100)completed.shift();start(env);}
    if(index%128===127)yield null;
   }
   const advNext=new Float64Array(config.numEnvs);
   for(let t=config.rolloutSteps-1;t>=0;t--)for(let e=0;e<config.numEnvs;e++){
    const i=t*config.numEnvs+e,delta=batch.rewards[i]+config.gamma*batch.nextValues[i]-batch.values[i];
    const a=delta+config.gamma*config.gaeLambda*(batch.done[i]?0:advNext[e]);batch.advantages[i]=a;batch.returns[i]=a+batch.values[i];advNext[e]=a;
   }
   let mean=0,variance=0;for(const a of batch.advantages)mean+=a/count;for(const a of batch.advantages)variance+=(a-mean)**2/count;
   const scale=Math.sqrt(variance+1e-8);for(let i=0;i<count;i++)batch.advantages[i]=(batch.advantages[i]-mean)/scale;
   totalSteps+=count;batch.rolloutMetrics={meanReward:rewardSum/count,aboveFraction:aboveSum/count,railFraction:railSteps/count};return batch;
  }
  function* optimizeChunks(batch){
   const indices=Array.from({length:batch.count},(_,i)=>i),actorGradient=new Float64Array(model.actor.weights.length),valueGradient=new Float64Array(model.critic.weights.length),stdGradient=new Float64Array(1);
   const totals={policyLoss:0,valueLoss:0,entropy:0,approxKL:0,clipFraction:0,gradientNorm:0,minibatches:0};
   let stop=false;
   for(let epoch=0;epoch<config.epochs&&!stop;epoch++){
    for(let i=indices.length-1;i>0;i--){const j=Math.floor(random.next()*(i+1));[indices[i],indices[j]]=[indices[j],indices[i]];}
    for(let offset=0;offset<batch.count;offset+=config.minibatchSize){
     actorGradient.fill(0);valueGradient.fill(0);stdGradient.fill(0);const n=Math.min(config.minibatchSize,batch.count-offset);
     let policyLoss=0,valueLoss=0,entropy=0,kl=0,clips=0;
     for(let j=0;j<n;j++){
      const i=indices[offset+j],obs=batch.observations.subarray(i*batch.inputSize,(i+1)*batch.inputSize),actor=P.forward(model.actor,obs,true),critic=P.forward(model.critic,obs,true);
      const objective=P.clippedObjective(actor.value,model.logStd[0],batch.z[i],batch.oldLogProb[i],batch.advantages[i],config.clipEpsilon,config.entropyCoefficient);
      P.backward(model.actor,actor,objective.dMean/n,actorGradient);stdGradient[0]+=objective.dLogStd/n;
      const error=critic.value-batch.returns[i];P.backward(model.critic,critic,config.valueCoefficient*error/n,valueGradient);
      policyLoss+=objective.loss/n;valueLoss+=.5*error*error/n;entropy+=objective.entropy/n;kl+=objective.approxKL/n;clips+=objective.clipped?1/n:0;
     }
     let norm2=stdGradient[0]**2;for(const v of actorGradient)norm2+=v*v;for(const v of valueGradient)norm2+=v*v;const norm=Math.sqrt(norm2),scale=Math.min(1,config.maxGradientNorm/(norm+1e-12));
     if(!Number.isFinite(norm)||!Number.isFinite(policyLoss))throw new Error('Non-finite PPO gradient; training stopped.');
     if(kl>config.targetKL*1.5){stop=true;break;}
     P.adam(model.actor.weights,actorGradient,model.actorAdam,config.learningRate,scale);P.adam(model.critic.weights,valueGradient,model.criticAdam,config.valueLearningRate,scale);P.adam(model.logStd,stdGradient,model.stdAdam,config.learningRate,scale);
     model.logStd[0]=Math.max(config.minLogStd,Math.min(config.maxLogStd,model.logStd[0]));
     totals.policyLoss+=policyLoss;totals.valueLoss+=valueLoss;totals.entropy+=entropy;totals.approxKL+=kl;totals.clipFraction+=clips;totals.gradientNorm+=norm;totals.minibatches++;
     yield null;
    }
   }
   const n=Math.max(1,totals.minibatches);for(const key of ['policyLoss','valueLoss','entropy','approxKL','clipFraction','gradientNorm'])totals[key]/=n;
   return {...totals,earlyKLStop:stop};
  }
  function exhaust(iterator){let item;do{item=iterator.next();}while(!item.done);return item.value;}
  function collectRollout(){return exhaust(collectRolloutChunks());}
  function optimize(batch){return exhaust(optimizeChunks(batch));}
  function finishUpdate(batch,losses){update++;
   lastMetrics={update,totalSteps,...batch.rolloutMetrics,...losses,logStd:model.logStd[0],
    meanEpisodeSeconds:completed.length?completed.reduce((a,e)=>a+e.seconds,0)/completed.length:0,
    meanBestHold:completed.length?completed.reduce((a,e)=>a+e.bestHold,0)/completed.length:0,
    curriculumAngle:config.startAngleDeg,gravity:config.gravity};
   history.push(lastMetrics);if(history.length>2000)history.shift();return lastMetrics;
  }
  function stepUpdate(){const batch=collectRollout();return finishUpdate(batch,optimize(batch));}
  async function stepUpdateAsync(options){
   const o=options||{},yieldEvery=Math.max(1,o.yieldEvery??4);
   async function drain(iterator){let count=0;while(true){
    if(o.cancelled?.())return {cancelled:true};
    const item=iterator.next();if(item.done)return {value:item.value};
    if(++count%yieldEvery===0)await new Promise(resolve=>setTimeout(resolve,0));
   }}
   const rollout=await drain(collectRolloutChunks());if(rollout.cancelled)return {cancelled:true};
   const optimized=await drain(optimizeChunks(rollout.value));if(optimized.cancelled)return {cancelled:true};
   return finishUpdate(rollout.value,optimized.value);
  }
  function setTask(changes){
   for(const key of ['startAngleDeg','startAngleSpreadDeg','uniformStart','termination','rewardMode','gravity','cartAccel','cartDrag','damping','episodeSeconds','useDisturb','pushTarget','pushStrength','pushDuration','pushSmoothing','pushIntervalMin','pushIntervalMax'])if(changes[key]!=null)config[key]=changes[key];
   envs.forEach(start);completed=[];
  }
  function snapshot(){return {kind:'bf-ppo-checkpoint-v1',config:{...config,model:undefined},model:P.serialize(model),update,totalSteps,rngState:random.state,disturbanceRngStates:envs.map(env=>env.pushRandom.state),history:history.slice(),completed:completed.slice(),resumeInfo};}
  function exportRecord(extra){
   return {kind:'bf-policy-v2',algo:'ppo',policyType:'mlp',setupId:config.setupId,fitness:null,generation:update,savedAt:new Date().toISOString(),seed:config.seed,
    genome:P.toGenome(model.actor),config:null,params:null,
    trainerParams:{...config,model:undefined,mode:'ppo',policyType:'mlp',objectiveId:'pendulum_both_above',evalSeconds:60,startTiltDeg:config.startAngleDeg,startTiltSpreadDeg:config.startAngleSpreadDeg,
     startAngleRange:config.startAngleDeg*Math.PI/180,tiltDirection:'both',curriculumEnabled:false,curriculumSpecs:[]},
    uiParams:{tiltDeg:config.startAngleDeg,tiltSpreadDeg:config.startAngleSpreadDeg,tiltDirection:'both',evalSeconds:60},
    audit:{method:'PPO clipped policy objective with GAE, actor/value backpropagation and Adam on actual production PBD trajectories',updates:update,physicsSteps:totalSteps,
     actorHiddenSizes:config.hiddenSizes,exploration:'Tanh-squashed Gaussian during training; deterministic tanh(mean) during replay',entropy:'Gaussian latent entropy; not exact squashed-action entropy',
     initialization:config.initialization||'Random actor and critic; no demonstrations',trainingDisturbances:!!config.useDisturb,resumeInfo,lastMetrics},...extra};
  }
  return {config,model,stepUpdate,stepUpdateAsync,collectRollout,optimize,setTask,snapshot,exportRecord,get metrics(){return lastMetrics;},get history(){return history;}};
 }
 function restoreCheckpoint(checkpoint){
  if(checkpoint?.kind!=='bf-ppo-checkpoint-v1'||!checkpoint.config||!checkpoint.model||!Number.isSafeInteger(checkpoint.update)||checkpoint.update<0||!Number.isSafeInteger(checkpoint.totalSteps)||checkpoint.totalSteps<0||!Number.isInteger(checkpoint.rngState))throw new Error('Invalid PPO training checkpoint.');
  if(!Array.isArray(checkpoint.history)||!Array.isArray(checkpoint.completed))throw new Error('Missing PPO checkpoint history.');
  if(checkpoint.disturbanceRngStates&&(!Array.isArray(checkpoint.disturbanceRngStates)||checkpoint.disturbanceRngStates.length!==checkpoint.config.numEnvs||checkpoint.disturbanceRngStates.some(s=>!Number.isInteger(s))))throw new Error('Invalid PPO disturbance RNG states.');
  return create({...checkpoint.config,model:checkpoint.model,_resumeCheckpoint:checkpoint});
 }
 BF.ppoTrainer={create,restoreCheckpoint,defaults};
})(window.BF=window.BF||{});
