// Small dense networks with explicit reverse-mode derivatives and Adam.
// No autodiff dependency; PPO and supervised objectives use these same paths.
(function(BF){
 'use strict';
 function rng(seed){return {state:seed>>>0,next(){this.state=(this.state+0x6D2B79F5)>>>0;let t=this.state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;},
  normal(){return Math.sqrt(-2*Math.log(Math.max(1e-12,this.next())))*Math.cos(2*Math.PI*this.next());},
  range(a,b){return a+(b-a)*this.next();},int(n){return Math.floor(this.next()*n);}};}
 function createNetwork(sizes,random,outputScale){
  let count=0;const layers=[];
  for(let l=1;l<sizes.length;l++){layers.push({input:sizes[l-1],output:sizes[l],offset:count});count+=(sizes[l-1]+1)*sizes[l];}
  const weights=new Float64Array(count);
  layers.forEach((layer,i)=>{const scale=Math.sqrt(2/(layer.input+layer.output))*(i===layers.length-1?(outputScale??1):1);
   for(let j=0;j<layer.output;j++)for(let k=0;k<layer.input;k++)weights[layer.offset+j*(layer.input+1)+k]=random.normal()*scale;
  });
  return {sizes:sizes.slice(),layers,weights};
 }
 function forward(net,input,cache){
  let a=input;const activations=cache?[input]:null;
  for(let l=0;l<net.layers.length;l++){
   const layer=net.layers[l],out=new Float64Array(layer.output),last=l===net.layers.length-1;
   for(let j=0;j<layer.output;j++){const offset=layer.offset+j*(layer.input+1);let z=net.weights[offset+layer.input];
    for(let i=0;i<layer.input;i++)z+=net.weights[offset+i]*a[i];out[j]=last?z:Math.tanh(z);}
   a=out;if(cache)activations.push(a);
  }
  return cache?{value:a[0],activations}:a[0];
 }
 function backward(net,cache,outputDerivative,gradient){
  let delta=new Float64Array([outputDerivative]);
  for(let l=net.layers.length-1;l>=0;l--){
   const layer=net.layers[l],a=cache.activations[l],prior=new Float64Array(layer.input);
   for(let j=0;j<layer.output;j++){
    const offset=layer.offset+j*(layer.input+1),d=delta[j];gradient[offset+layer.input]+=d;
    for(let i=0;i<layer.input;i++){gradient[offset+i]+=d*a[i];prior[i]+=net.weights[offset+i]*d;}
   }
   if(l>0)for(let i=0;i<prior.length;i++)prior[i]*=1-a[i]*a[i];delta=prior;
  }
  return gradient;
 }
 function adamState(n){return {m:new Float64Array(n),v:new Float64Array(n),step:0};}
 function adam(weights,gradient,state,learningRate,scale){
  state.step++;const b1=.9,b2=.999,c1=1-Math.pow(b1,state.step),c2=1-Math.pow(b2,state.step);
  for(let i=0;i<weights.length;i++){
   const g=gradient[i]*(scale??1);state.m[i]=b1*state.m[i]+(1-b1)*g;state.v[i]=b2*state.v[i]+(1-b2)*g*g;
   weights[i]-=learningRate*(state.m[i]/c1)/(Math.sqrt(state.v[i]/c2)+1e-8);
  }
 }
 function create(options){
  const o=options||{},random=rng(o.seed??1),sizes=[o.numInputs,...(o.hiddenSizes||[32,32]),1];
  const actor=createNetwork(sizes,random,.01),critic=createNetwork(sizes,random,1);
  return {actor,critic,logStd:new Float64Array([o.logStd??-.7]),actorAdam:adamState(actor.weights.length),criticAdam:adamState(critic.weights.length),stdAdam:adamState(1),
   command(observation){return Math.tanh(forward(this.actor,observation));}};
 }
 function gaussianLogProb(z,mean,logStd){const u=(z-mean)*Math.exp(-logStd);return -.5*u*u-logStd-.5*Math.log(2*Math.PI);}
 function clippedObjective(mean,logStd,z,oldLogProb,advantage,epsilon,entropyCoefficient){
  const logProb=gaussianLogProb(z,mean,logStd),ratio=Math.exp(logProb-oldLogProb),bounded=Math.max(1-epsilon,Math.min(1+epsilon,ratio));
  const active=!((advantage>=0&&ratio>1+epsilon)||(advantage<0&&ratio<1-epsilon));
  const entropy=logStd+.5*Math.log(2*Math.PI*Math.E),coefficient=active?-advantage*ratio:0;
  const delta=z-mean,invVariance=Math.exp(-2*logStd);
  return {loss:-Math.min(ratio*advantage,bounded*advantage)-(entropyCoefficient||0)*entropy,
   dMean:coefficient*delta*invVariance,dLogStd:coefficient*(delta*delta*invVariance-1)-(entropyCoefficient||0),
   ratio,logProb,entropy,clipped:Math.abs(ratio-1)>epsilon,approxKL:ratio-1-(logProb-oldLogProb)};
 }
 function toGenome(net){
  const numInputs=net.sizes[0],nodes=Array.from({length:numInputs},(_,id)=>({id,kind:'input',act:0,bias:0}));
  nodes.push({id:numInputs,kind:'output',act:1,bias:0});let nextId=numInputs+1,previous=Array.from({length:numInputs},(_,i)=>i),innov=1;
  const conns=[];
  net.layers.forEach((layer,l)=>{
   const ids=l===net.layers.length-1?[numInputs]:Array.from({length:layer.output},()=>nextId++);
   for(let j=0;j<layer.output;j++){
    const offset=layer.offset+j*(layer.input+1);
    if(l===net.layers.length-1)nodes[numInputs].bias=net.weights[offset+layer.input];
    else nodes.push({id:ids[j],kind:'hidden',act:1,bias:net.weights[offset+layer.input]});
    for(let i=0;i<layer.input;i++)conns.push({innov:innov++,from:previous[i],to:ids[j],weight:net.weights[offset+i],enabled:true});
   }previous=ids;
  });
  return {numInputs,numOutputs:1,nodes,conns};
 }
 function serialize(model){return {sizes:model.actor.sizes.slice(),actor:Array.from(model.actor.weights),critic:Array.from(model.critic.weights),logStd:model.logStd[0],
  actorAdam:{m:Array.from(model.actorAdam.m),v:Array.from(model.actorAdam.v),step:model.actorAdam.step},
  criticAdam:{m:Array.from(model.criticAdam.m),v:Array.from(model.criticAdam.v),step:model.criticAdam.step},
  stdAdam:{m:Array.from(model.stdAdam.m),v:Array.from(model.stdAdam.v),step:model.stdAdam.step}};}
 function restore(data){
  if(!Array.isArray(data?.sizes)||data.sizes.length<2||data.sizes.length>8||data.sizes.at(-1)!==1||data.sizes.some(n=>!Number.isInteger(n)||n<1||n>256)||!Number.isFinite(data.logStd))throw new Error('Invalid PPO network dimensions or exploration state.');
  const count=data.sizes.slice(1).reduce((sum,n,i)=>sum+(data.sizes[i]+1)*n,0);
  for(const key of ['actor','critic'])if(!Array.isArray(data[key])||data[key].length!==count||data[key].some(v=>!Number.isFinite(v)))throw new Error('Invalid PPO '+key+' weights.');
  for(const key of ['actorAdam','criticAdam','stdAdam'])if(data[key]){
   const s=data[key],n=key==='stdAdam'?1:count;
   if(!Number.isSafeInteger(s.step)||s.step<0||!Array.isArray(s.m)||!Array.isArray(s.v)||s.m.length!==n||s.v.length!==n||s.m.some(v=>!Number.isFinite(v))||s.v.some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid PPO optimizer state.');
  }
  const model=create({numInputs:data.sizes[0],hiddenSizes:data.sizes.slice(1,-1),logStd:data.logStd});
  model.actor.weights.set(data.actor);model.critic.weights.set(data.critic);
  for(const key of ['actorAdam','criticAdam','stdAdam'])if(data[key]){model[key].m.set(data[key].m);model[key].v.set(data[key].v);model[key].step=data[key].step;}
  return model;
 }
 function supervisedBatch(model,rows,options){
  const o=options||{},gradient=new Float64Array(model.actor.weights.length);let loss=0;
  for(const row of rows){const cache=forward(model.actor,row.x,true),prediction=Math.tanh(cache.value),error=prediction-row.y;
   loss+=.5*error*error/rows.length;backward(model.actor,cache,error*(1-prediction*prediction)/rows.length,gradient);
  }
  let norm2=0;for(const g of gradient)norm2+=g*g;const norm=Math.sqrt(norm2);
  adam(model.actor.weights,gradient,model.actorAdam,o.learningRate??1e-3,Math.min(1,(o.maxGradientNorm??1)/(norm+1e-12)));
  return {loss,gradientNorm:norm,samples:rows.length,method:'Supervised action imitation via backpropagation; not reinforcement learning'};
 }
 BF.ppoPolicy={rng,createNetwork,forward,backward,adamState,adam,create,gaussianLogProb,clippedObjective,toGenome,serialize,restore,supervisedBatch};
})(window.BF=window.BF||{});
