/* One stationary-probe shock-front experiment; no combustion or fluid solver. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RecordingBlastCore=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  function radius(t,energy=1){
    const k=3*Math.pow(energy,.25),c0=2,transition=(k/(2*c0))**2;
    return t<=transition?k*Math.sqrt(Math.max(0,t)):k*Math.sqrt(transition)+c0*(t-transition);
  }
  function swept(distance,previous,current){return distance>previous&&distance<=current;}
  function endpoint(distance,current,width){return Math.abs(distance-current)<=width/2;}
  // Exact line/rectangle intersection for these authored teaching barriers.
  // The native shaders instead sample the source-to-receiver segment through an SDF.
  function segmentRect(a,b,r){
    let lo=0,hi=1;
    for(const axis of ['x','y']){
      const d=b[axis]-a[axis],min=r[axis],max=min+r[axis==='x'?'w':'h'];
      if(Math.abs(d)<1e-12){if(a[axis]<min||a[axis]>max)return false;continue;}
      let first=(min-a[axis])/d,last=(max-a[axis])/d;
      if(first>last)[first,last]=[last,first];lo=Math.max(lo,first);hi=Math.min(hi,last);
      if(lo>hi)return false;
    }
    return hi>0&&lo<1;
  }
  function scene(gap=1.25,walls=true){
    const origin={x:1,y:3},probes=[];
    for(let x=2;x<=8.7;x+=1.05)for(let y=.6;y<5.5;y+=.8)probes.push({x,y});
    const barriers=walls?[{x:4.15,y:0,w:.18,h:3-gap/2},{x:4.15,y:3+gap/2,w:.18,h:3-gap/2}]:[];
    return {origin,probes,barriers};
  }
  function evaluate({dt=.18,step=5,energy=1,width=.08,gap=1.25,walls=true}={}){
    const geometry=scene(gap,walls),r=radius(step*dt,energy),previous=radius(Math.max(0,step-1)*dt,energy);
    const probes=geometry.probes.map(p=>{
      const d=Math.hypot(p.x-geometry.origin.x,p.y-geometry.origin.y);
      const blocked=geometry.barriers.some(w=>segmentRect(geometry.origin,p,w));
      let narrowStep=0,sweptStep=0;
      for(let s=1;s<=step;s++){
        const now=radius(s*dt,energy),before=radius((s-1)*dt,energy);
        if(!blocked&&!narrowStep&&endpoint(d,now,width))narrowStep=s;
        if(!blocked&&!sweptStep&&swept(d,before,now))sweptStep=s;
      }
      return {...p,d,blocked,narrowStep,sweptStep,passed:d<=r};
    });
    return {...geometry,probes,r,previous,time:step*dt,step,
      narrowHits:probes.filter(p=>p.narrowStep).length,
      sweptHits:probes.filter(p=>p.sweptStep).length,
      blocked:probes.filter(p=>p.blocked&&p.passed).length,
      missed:probes.filter(p=>!p.blocked&&p.passed&&!p.narrowStep).length};
  }
  return {radius,swept,endpoint,segmentRect,scene,evaluate};
});
