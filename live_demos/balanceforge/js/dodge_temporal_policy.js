// All-field motion evidence and an explicitly model-informed learned scorer.
// The physical lookahead is supplied; the scoring function is learned. The
// existing two-segment planner and future pattern-controller state are unused.
(function(BF){'use strict';
 const DT=1/120,DIRS=[];for(const x of[-1,0,1])for(const y of[-1,0,1])DIRS.push([x,y]);
 const DEFAULTS={hidden:4,replanSteps:6,horizon:1.2,sampleStride:4,clearanceScale:120,edgeScale:100,maskVelocity:false,nearestOnly:0};
 const featureLabels=['clearance through0.25s','clearance through0.5s','clearance through0.8s','clearance through1.2s','minimum wall margin','final centrality','velocity alignment','previous-command alignment'];
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function agentStep(p,u,state){
  const d=1-state.world.damping;if(state.controlMode==='velocity'){p.vx=u[0]*state.maxSpeed;p.vy=u[1]*state.maxSpeed;}
  else{p.vx=p.vx*d+u[0]*state.maxAccel*DT;p.vy=p.vy*d+u[1]*state.maxAccel*DT;const speed=Math.hypot(p.vx,p.vy);if(speed>state.maxSpeed){p.vx*=state.maxSpeed/speed;p.vy*=state.maxSpeed/speed;}}
  p.x+=p.vx*DT;p.y+=p.vy*DT;const e=state.worldExtent,edge=Math.min(e.halfW-Math.abs(p.x),e.halfH-Math.abs(p.y));
  if(p.x < -e.halfW){p.x=-e.halfW;p.vx=0;}if(p.x>e.halfW){p.x=e.halfW;p.vx=0;}
  if(p.y < -e.halfH){p.y=-e.halfH;p.vy=0;}if(p.y>e.halfH){p.y=e.halfH;p.vy=0;}return edge;
 }
 function features(state,options){
  const c={...DEFAULTS,...options},a=state.world.nodes[state.agentIdx],e=state.worldExtent,steps=Math.round(c.horizon/DT),stride=c.sampleStride;
  let bullets=state.dodge.bullets.filter(b=>b.alive);
  if(c.nearestOnly)bullets=bullets.slice().sort((b,d)=>(b.x-a.x)**2+(b.y-a.y)**2-(d.x-a.x)**2-(d.y-a.y)**2).slice(0,c.nearestOnly);
  const thresholds=[.25,.5,.8,c.horizon],rows=[],paths=[];
  for(const u of DIRS){
   const p={x:a.x,y:a.y,vx:a.vx,vy:a.vy},path=[],mins=[Infinity,Infinity,Infinity,Infinity];let edgeMin=Infinity;
   let ox=p.x,oy=p.y,oldTime=0;
   for(let k=1;k<=steps;k++){
    edgeMin=Math.min(edgeMin,agentStep(p,u,state));
    if(k%stride!==0&&k!==steps)continue;const t=k*DT;
    for(const b of bullets){
     const vx=c.maskVelocity?0:b.vx,vy=c.maskVelocity?0:b.vy;
     const bx0=b.x+vx*oldTime,by0=b.y+vy*oldTime,bx1=b.x+vx*t,by1=b.y+vy*t;
     // Actual bullets despawn beyond field+40. Once both ends are outside
     // in the outgoing direction this sample cannot threaten the field.
     if((bx0>e.halfW+40&&bx1>e.halfW+40)||(bx0 < -e.halfW-40&&bx1 < -e.halfW-40)||(by0>e.halfH+40&&by1>e.halfH+40)||(by0 < -e.halfH-40&&by1 < -e.halfH-40))continue;
     const rx=bx0-ox,ry=by0-oy,dx=bx1-p.x-rx,dy=by1-p.y-ry,den=dx*dx+dy*dy,q=den?clamp(-(rx*dx+ry*dy)/den,0,1):0;
     // Agent motion between samples is approximated by its chord; physical
     // microsteps remain120Hz. Report this as a geometric forecast feature.
     const d=Math.hypot(rx+q*dx,ry+q*dy)-(b.r+a.radius);
     const closestTime=oldTime+q*(t-oldTime);for(let j=0;j<4;j++)if(closestTime<=thresholds[j]+DT)mins[j]=Math.min(mins[j],d);
    }
    path.push({x:p.x,y:p.y,t});ox=p.x;oy=p.y;oldTime=t;
   }
   const previous=state.lastCmds||[0,0];rows.push([
    ...mins.map(d=>d===Infinity?1:clamp(d/c.clearanceScale,-1,1)),clamp(edgeMin/c.edgeScale,-1,1),
    1-clamp((p.x/e.halfW)**2+(p.y/e.halfH)**2,0,2),
    clamp((a.vx*u[0]+a.vy*u[1])/state.maxSpeed,-1,1),.5*(previous[0]*u[0]+previous[1]*u[1])]);paths.push(path);
  }
  return{rows,paths,bulletCount:bullets.length,featureLabels,origin:{x:a.x,y:a.y,time:state.world.time}};
 }
 function paramCount(config){const h=config.hidden||0;return h?(8+1)*h+h+1:9;}
 function score(weights,x,config){const h=config.hidden||0;if(!h){let y=weights[8];for(let i=0;i<8;i++)y+=weights[i]*x[i];return y;}
  let y=weights[9*h+h];for(let j=0;j<h;j++){let z=weights[j*9+8];for(let i=0;i<8;i++)z+=weights[j*9+i]*x[i];y+=weights[9*h+j]*Math.tanh(z);}return y;
 }
 function validate(record){if(record?.kind!=='bf-dodge-lookahead-v1'||!record.worldParams||!record.config)throw Error('Invalid learned dodge scorer record.');
  const c={...DEFAULTS,...record.config};if(!Number.isInteger(c.hidden)||c.hidden<0||c.hidden>64||!Number.isInteger(c.replanSteps)||c.replanSteps<1||c.replanSteps>120||!Number.isInteger(c.sampleStride)||c.sampleStride<1||c.sampleStride>16||!Number.isFinite(c.horizon)||c.horizon<.8||c.horizon>3||!Number.isFinite(c.clearanceScale)||!(c.clearanceScale>0)||!Number.isFinite(c.edgeScale)||!(c.edgeScale>0)||!Number.isInteger(c.nearestOnly)||c.nearestOnly<0||c.nearestOnly>100000||typeof c.maskVelocity!=='boolean')throw Error('Invalid learned dodge scorer configuration.');
  if(!Array.isArray(record.weights)||record.weights.length!==paramCount(c)||record.weights.some(w=>!Number.isFinite(w)))throw Error('Invalid learned dodge scorer weights.');
  if(record.worldParams.physicsDt!=null&&record.worldParams.physicsDt!==DT)throw Error('Saved scorer requires the production 120 Hz physics step.');return record;}
 function createPolicy(record,getState){validate(record);const c={...DEFAULTS,...record.config};let priorState=null,since=Infinity,command=[0,0],lastFeatures=null,lastScores=null;
  return{config:c,isLearnedScorer:true,reset(){priorState=null;since=Infinity;lastFeatures=lastScores=null;},get lastFeatures(){return lastFeatures;},get lastScores(){return lastScores;},
   commandAll(_obs,out=[0,0]){const state=getState();if(!state?.dodge){out[0]=out[1]=0;return out;}if(state!==priorState){since=Infinity;priorState=state;}
    if(since>=c.replanSteps){lastFeatures=features(state,c);lastScores=lastFeatures.rows.map(row=>score(record.weights,row,c));let best=0;for(let i=1;i<9;i++)if(lastScores[i]>lastScores[best])best=i;command=DIRS[best];since=0;}
    since++;out[0]=command[0];out[1]=command[1];return out;},command(obs){const out=[0,0];this.commandAll(obs,out);return out[0];}};
 }
 // Full-world raster with separate occupancy and velocity channels. Frames
 // are copied from actual earlier states, not fabricated by backprojection.
 function rasterize(state,options){const c={width:24,height:16,velocityScale:600,...options},n=c.width*c.height,values=new Float32Array(n*4),e=state.worldExtent;
  function splat(x,y,value,channel){const fx=(x/e.halfW*.5+.5)*(c.width-1),fy=(y/e.halfH*.5+.5)*(c.height-1),ix=Math.floor(fx),iy=Math.floor(fy);
   for(let j=0;j<2;j++)for(let i=0;i<2;i++){const px=ix+i,py=iy+j;if(px<0||px>=c.width||py<0||py>=c.height)continue;const w=(i?fx-ix:1-fx+ix)*(j?fy-iy:1-fy+iy);values[(py*c.width+px)*4+channel]+=value*w;}}
  for(const b of state.dodge.bullets)if(b.alive){splat(b.x,b.y,1,0);splat(b.x,b.y,b.vx/c.velocityScale,1);splat(b.x,b.y,b.vy/c.velocityScale,2);}
  for(let i=0;i<n;i++){const mass=values[i*4];if(mass>0){values[i*4+1]/=mass;values[i*4+2]/=mass;}}
  const a=state.world.nodes[state.agentIdx];splat(a.x,a.y,1,3);return{time:state.world.time,width:c.width,height:c.height,channels:['bullet occupancy','mean velocity x','mean velocity y','agent occupancy'],values};
 }
 function createFrameHistory(options){const c={frames:4,interval:.1,...options};let stateRef=null,lastTime=-Infinity,frames=[];
  return{sample(state){const t=state.world.time;if(state!==stateRef||t<lastTime){stateRef=state;lastTime=-Infinity;frames=[];}if(t-lastTime+1e-9>=c.interval){frames.push(rasterize(state,c));if(frames.length>c.frames)frames.shift();lastTime=t;}return frames;},get frames(){return frames;},reset(){stateRef=null;lastTime=-Infinity;frames=[];}};
 }
 BF.dodgeTemporal={DEFAULTS,DIRS,featureLabels,agentStep,features,paramCount,score,validate,createPolicy,rasterize,createFrameHistory};
})(window.BF=window.BF||{});
