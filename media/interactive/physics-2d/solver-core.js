/* Computed teaching models for the Physics2D brochure.
   Kernels, pressure operators and the uniaxial damage driver follow the source;
   the small prescribed experiments isolate those operations, not the native solver. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PhysicsSolverCore = api;
})(typeof window !== 'undefined' ? window : this, function() {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const spline = q => q < 1 ? 1 - 1.5*q*q + .75*q*q*q : q < 2 ? .25*(2-q)**3 : 0;
  function kernel(r,h) { return 10/(7*Math.PI*h*h)*spline(Math.abs(r)/h); }
  function kernelSlope(r,h) {
    const q=Math.abs(r)/h, s=10/(7*Math.PI*h*h*h);
    return q<1?s*(-3*q+2.25*q*q):q<2?s*(-.75*(2-q)**2):0;
  }
  function particles(compression=1, jitter=.1) {
    const list=[];
    for(let y=0;y<10;y++)for(let x=0;x<15;x++){
      // A free boundary and a narrow neck expose support loss and density changes.
      if(x>9&&(y<3||y>6))continue;
      list.push({x:.13+compression*(x*.047+jitter*.02*Math.sin(x*13+y*7)),
        y:.24+y*.053+jitter*.025*Math.cos(x*5+y*11),m:.047*.053});
    }
    return list;
  }
  function density(list,x,y,h) {
    let rho=0,gx=0,gy=0;const contributions=[];
    list.forEach((p,i)=>{
      const dx=x-p.x,dy=y-p.y,r=Math.hypot(dx,dy),value=p.m*kernel(r,h);
      if(r<2*h){contributions.push({i,value,r});rho+=value;
        if(r>1e-8){const g=p.m*kernelSlope(r,h)/r;gx+=g*dx;gy+=g*dy;}}
    });
    return {rho,gx,gy,contributions};
  }
  function createMac(n=32,ny=20,jetX=.34,jetY=.58) {
    const h=1/n,u=new Float64Array((n+1)*ny),v=new Float64Array(n*(ny+1));
    const ui=(x,y)=>y*(n+1)+x,vi=(x,y)=>y*n+x;
    for(let y=0;y<ny;y++)for(let x=1;x<n;x++){
      const px=x/n,py=(y+.5)/ny,dx=px-jetX,dy=py-jetY;
      u[ui(x,y)]=1.8*Math.exp(-(dx*dx/.022+dy*dy/.07))-.45*dy*Math.exp(-(dx*dx+dy*dy)*8);
    }
    for(let y=1;y<ny;y++)for(let x=0;x<n;x++){
      const px=(x+.5)/n,py=y/ny,dx=px-jetX,dy=py-jetY;
      v[vi(x,y)]=.45*dx*Math.exp(-(dx*dx+dy*dy)*8)-.35*Math.exp(-(dx*dx/.06+(dy+.18)**2/.018));
    }
    const model={n,ny,h,u,v,p:new Float64Array(n*ny),iterations:0};
    model.div=divergence(model,u,v);return model;
  }
  function divergence(model,u=model.u,v=model.v){
    const {n,ny,h}=model,d=new Float64Array(n*ny);
    for(let y=0;y<ny;y++)for(let x=0;x<n;x++)
      d[y*n+x]=(u[y*(n+1)+x+1]-u[y*(n+1)+x]+v[(y+1)*n+x]-v[y*n+x])/h;
    return d;
  }
  function iteratePressure(model,count){
    const {n,ny,h,div}=model;let p=model.p,next=new Float64Array(p.length);
    for(let k=0;k<count;k++){
      for(let y=0;y<ny;y++)for(let x=0;x<n;x++){
        const i=y*n+x;let sum=0,neighbors=0;
        if(x>0){sum+=p[i-1];neighbors++;}if(x<n-1){sum+=p[i+1];neighbors++;}
        if(y>0){sum+=p[i-n];neighbors++;}if(y<ny-1){sum+=p[i+n];neighbors++;}
        next[i]=(sum-h*h*div[i])/neighbors;
      }
      const swap=p;p=next;next=swap;
    }
    model.p=p;model.iterations+=count;return model;
  }
  function projected(model){
    const {n,ny,h,p}=model,u=model.u.slice(),v=model.v.slice();
    for(let y=0;y<ny;y++)for(let x=1;x<n;x++)u[y*(n+1)+x]-=(p[y*n+x]-p[y*n+x-1])/h;
    for(let y=1;y<ny;y++)for(let x=0;x<n;x++)v[y*n+x]-=(p[y*n+x]-p[(y-1)*n+x])/h;
    const div=divergence(model,u,v),rms=a=>Math.sqrt(a.reduce((sum,x)=>sum+x*x,0)/a.length);
    return {u,v,div,before:rms(model.div),after:rms(div)};
  }
  function exchange(mA,mB,restitution=0,stage=1){
    const vA=2.4,vB=-.2,J=-(1+restitution)*(vA-vB)/(1/mA+1/mB);
    const a=vA+J/mA,b=vB+(stage>=1?-J/mB:0);
    const queued=stage>=1?0:-J;
    return {J,a,b,queued,before:mA*vA+mB*vB,after:mA*a+mB*b,ledger:mA*a+mB*b+queued};
  }
  function heatExchange(cA,cB,time=0){
    const tA=560,tB=290,target=(cA*tA+cB*tB)/(cA+cB),relax=Math.exp(-.45*time);
    const a=target+(tA-target)*relax,b=target+(tB-target)*relax;
    return {a,b,target,energy:cA*a+cB*b,initial:cA*tA+cB*tB};
  }
  function uniaxialDrive(stressRatio,alpha,angle){
    const direction=1+alpha*Math.cos(angle)**2;
    return stressRatio**2*direction**2/Math.max(1,1+alpha)**2;
  }
  function damageProfile({alpha=-.85,angle=70*Math.PI/180,load=1.55,time=1,length=1.8,n=76}={}){
    const d=new Float64Array(n),history=new Float64Array(n),ratio=new Float64Array(n);
    const dt=.015,steps=Math.round(time/dt),eta=.65,zeta=2.4;
    for(let i=0;i<n;i++)ratio[i]=load*(.67+.48*Math.exp(-(((i-(n-1)*.51)/(n*.09))**2)));
    for(let k=0;k<steps;k++){
      const phase=k*dt,cycle=phase<1.5?Math.sin(Math.PI/2*Math.min(phase/.8,1)):Math.max(0,1-(phase-1.5)/1.5);
      const next=d.slice();
      for(let i=0;i<n;i++){
        const phi=uniaxialDrive(ratio[i]*cycle,alpha,angle);
        history[i]=Math.min(12,Math.max(history[i],zeta*Math.max(phi-1,0)));
        const lap=d[Math.max(0,i-1)]+d[Math.min(n-1,i+1)]-2*d[i];
        const rate=Math.min(dt/eta,.999/(history[i]+1+4*length*length));
        next[i]=Math.min(1,d[i]+rate*Math.max((1-d[i])*history[i]-d[i]+length*length*lap,0));
      }
      d.set(next);
    }
    return {d,history,ratio,stiffness:Array.from(d,x=>(1-x)**2*.99+.01)};
  }
  function thermalSlab(time=5,peak=560,conductivity=.12,n=50){
    // Explicit 1D heat diffusion on a static strip. Time and conductivity are
    // nondimensional; the native MAT_THERMAL softening law is evaluated in K.
    const T=new Float64Array(n).fill(300),cure=new Float64Array(n),dt=.008,steps=Math.round(time/dt);
    const a=conductivity*24;
    for(let step=0;step<steps;step++){
      const t=step*dt,heater=t<4?peak:300,next=T.slice();
      for(let i=0;i<n;i++){
        const left=i?T[i-1]:heater,right=i<n-1?T[i+1]:300;
        next[i]=T[i]+dt*(a*(left+right-2*T[i])-.025*(T[i]-300));
        const rate=.6*clamp((T[i]-350)/150,0,1);
        cure[i]=1-(1-cure[i])*Math.exp(-rate*dt);
      }
      T.set(next);
    }
    return {T,cure,soft:Array.from(T,t=>clamp(1-(t-300)/200,.05,1)),heater:time<4?peak:300};
  }
  function magneticPoint(x,y,poleX,poleY,strength=1){
    // Regularized analytic 2D pole pair; educational external-field model.
    // The force proxy is 1/2 grad |H|^2 for constant unit susceptibility.
    const poles=[{x:poleX,y:poleY,s:strength},{x:1-poleX,y:1-poleY,s:-strength}];
    let hx=0,hy=0,xx=0,xy=0,yy=0;
    for(const pole of poles){
      const dx=x-pole.x,dy=y-pole.y,q=dx*dx+dy*dy+.014;
      hx+=pole.s*dx/q;hy+=pole.s*dy/q;
      xx+=pole.s*(1/q-2*dx*dx/(q*q));xy+=pole.s*(-2*dx*dy/(q*q));yy+=pole.s*(1/q-2*dy*dy/(q*q));
    }
    const h=Math.hypot(hx,hy);
    return {hx,hy,h,fx:hx*xx+hy*xy,fy:hx*xy+hy*yy,alignment:1-Math.exp(-h*.42)};
  }
  return {clamp,kernel,kernelSlope,particles,density,createMac,divergence,iteratePressure,projected,exchange,heatExchange,uniaxialDrive,damageProfile,thermalSlab,magneticPoint};
});
