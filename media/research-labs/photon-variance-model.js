/* Exact unit-energy spherical-shell projection and explicitly separate 1D toys.
   These models explain sampling structure; they are not native photon estimators. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhotonVarianceModel=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function rng(seed){let state=seed>>>0;return ()=>{state=(1664525*state+1013904223)>>>0;return (state+.5)/4294967296;};}
  function hash(n){n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return (n^(n>>>16))>>>0;}
  function sampleShell(random,spread=.13){return {x:(random()-.5)*.25,y:(random()-.5)*.25,r:.53+(random()-.5)*2*spread};}
  function shellIntensity(rho,r,cutoff=0){
    if(!(r>0)||rho<0||rho>=r)return 0;
    const mu=Math.sqrt(Math.max(0,1-(rho/r)**2));
    // Reject an explicitly named grazing band; do not renormalize the result.
    if(mu<cutoff)return 0;
    return 1/(2*Math.PI*r*r*mu);
  }
  function shellAt(shell,x,y,cutoff=0){return shellIntensity(Math.hypot(x-shell.x,y-shell.y),shell.r,cutoff);}
  function shellImages({size=128,samples=4,seed=9173,spread=.13,cutoff=.025}={}){
    const shared=new Float32Array(size*size),independent=new Float32Array(size*size),random=rng(seed),shells=[];
    for(let s=0;s<samples;s++)shells.push(sampleShell(random,spread));
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=y*size+x,px=(x+.5)/size*1.8-.9,py=(y+.5)/size*1.8-.9;
      const local=rng(hash(seed^Math.imul(i+1,2654435761)));let a=0,b=0;
      for(let s=0;s<samples;s++){
        a+=shellAt(shells[s],px,py,cutoff);
        b+=shellAt(sampleShell(local,spread),px,py,cutoff);
      }
      // All complete draws count, including shells which miss this pixel.
      shared[i]=a/samples;independent[i]=b/samples;
    }
    const pixelArea=(1.8/size)**2,sum=a=>a.reduce((s,x)=>s+x,0)*pixelArea;
    return {size,samples,shared,independent,shells,sharedEnergy:sum(shared),independentEnergy:sum(independent),expectedEnergy:1-cutoff};
  }
  function probeSamples({x=.45,y=.05,samples=10000,seed=9173,spread=.13,cutoff=.025}={}){
    const random=rng(seed);let sum=0,sum2=0,misses=0;
    for(let i=0;i<samples;i++){const value=shellAt(sampleShell(random,spread),x,y,cutoff);sum+=value;sum2+=value*value;if(value===0)misses++;}
    return {mean:sum/samples,second:sum2/samples,misses};
  }
  function jacobian(radius,impact,cutoff=0){
    const hit=impact>=0&&impact<radius;
    if(!hit)return {hit:false,root:0,mu:0,J:0,weight:0,accepted:false};
    const root=Math.sqrt(radius*radius-impact*impact),mu=root/radius,J=radius*root;
    return {hit:true,root,mu,J,weight:1/(2*Math.PI*J),accepted:mu>=cutoff};
  }
  function footprint({nx=96,ny=64,count=18,radius=9,seed=441}={}){
    const random=rng(seed),shapes=[],candidates=new Uint16Array(nx*ny),hits=new Uint16Array(nx*ny);
    let bounds=0,trueHits=0;
    for(let k=0;k<count;k++){
      const cx=(.07+.86*random())*nx,cy=(.07+.86*random())*ny,r=radius*(.7+.6*random());shapes.push({cx,cy,r});
      const x0=Math.max(0,Math.ceil(cx-r-.5)),x1=Math.min(nx-1,Math.floor(cx+r-.5));
      const y0=Math.max(0,Math.ceil(cy-r-.5)),y1=Math.min(ny-1,Math.floor(cy+r-.5));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const i=y*nx+x;candidates[i]++;bounds++;
        if((x+.5-cx)**2+(y+.5-cy)**2<r*r){hits[i]++;trueHits++;}
      }
    }
    const queries=nx*ny;
    return {nx,ny,count,shapes,candidates,hits,bounds,trueHits,queries,cachedBuilds:count,rebuiltBuilds:count*queries,allPairs:count*queries,rejected:bounds-trueHits};
  }
  function density1(x,k){return x<0||x>1?0:(k+1)*x**k;}
  function mixtureDensity(x,k,partner='uniform'){return .5*(density1(x,k)+(partner==='uniform'?1:density1(x,k)));}
  function mixtureSecond(k,partner='uniform'){
    if(partner!=='uniform')return k>=1?Infinity:1/((k+1)*(1-k));
    // Midpoint quadrature: q>=1/2, so there is no endpoint singularity.
    const n=32768;let sum=0;for(let i=0;i<n;i++)sum+=1/mixtureDensity((i+.5)/n,k,partner);return sum/n;
  }
  function mixtureSample(random,k,partner='uniform'){
    const chooseFirst=random()<.5,u=random(),x=chooseFirst||partner!=='uniform'?u**(1/(k+1)):u;
    const chosenDensity=chooseFirst||partner!=='uniform'?density1(x,k):1;
    return {x,weight:1/mixtureDensity(x,k,partner),flat:1/chosenDensity,technique:chooseFirst?1:2};
  }
  function mixtureTrace(k,partner='uniform',n=192,seed=8319){
    const random=rng(seed),values=[];let total=0,flatTotal=0;
    for(let i=0;i<n;i++){const sample=mixtureSample(random,k,partner);values.push(sample);total+=sample.weight;flatTotal+=sample.flat;}
    return {values,mean:total/n,flatMean:flatTotal/n};
  }
  function flatSecond(k,partner='uniform'){
    const first=k>=1?Infinity:1/((k+1)*(1-k));
    return partner==='uniform'?.5*first+.5:first;
  }
  function moment(alpha,beta,order=2){
    if(beta<=-1)return {normalizable:false,finite:false,exponent:beta-order*alpha+1,kind:'invalid density',value:Infinity};
    const exponent=beta-order*alpha+1,finite=exponent>1e-12;
    return {normalizable:true,finite,exponent,kind:finite?'finite':Math.abs(exponent)<=1e-12?'logarithmic divergence':'power divergence',value:finite?(beta+1)/exponent:Infinity};
  }
  function truncatedMoment(alpha,beta,order=2,epsilon=1e-4){
    const e=beta-order*alpha+1;
    return (beta+1)*(Math.abs(e)<1e-10?-Math.log(epsilon):(1-epsilon**e)/e);
  }
  return {clamp,rng,hash,sampleShell,shellIntensity,shellAt,shellImages,probeSamples,jacobian,footprint,density1,mixtureDensity,mixtureSecond,mixtureSample,mixtureTrace,flatSecond,moment,truncatedMoment};
});
