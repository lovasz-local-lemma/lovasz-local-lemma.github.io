/* Small computed explanations, not ports of the native material solver. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhysicsFoundation=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function response(J=1,shear=.6,angle=0,bulk=8,mu=2){
    if(!(J>0))throw new RangeError('The patch must have positive area.');
    const s=Math.sqrt(J),c=Math.cos(angle),t=Math.sin(angle);
    const F=[c*s,c*shear-t*s,t*s,t*shear+c*s];
    // Proper 2D polar rotation for det(F)>0.
    const a=F[0]+F[3],b=F[2]-F[1],n=Math.hypot(a,b),R=[a/n,-b/n,b/n,a/n];
    const D=F.map((v,i)=>v-R[i]),solidPressure=bulk*(1/J-1),pressure=Math.max(0,solidPressure);
    const stress=[2*mu/J*(D[0]*F[0]+D[1]*F[1])-solidPressure,
      2*mu/J*(D[0]*F[2]+D[1]*F[3]),
      2*mu/J*(D[2]*F[0]+D[3]*F[1]),
      2*mu/J*(D[2]*F[2]+D[3]*F[3])-solidPressure];
    return {F,R,J,density:1/J,pressure,stress,fluidStress:[-pressure,0,0,-pressure],
      fluidEnergy:J<1?bulk*(J-Math.log(J)-1):0,shapeEnergy:mu*D.reduce((s,x)=>s+x*x,0)};
  }
  function topology(gap=0,n=44,ny=30){
    const walls=new Uint8Array(n*ny),outside=new Uint8Array(n*ny),queue=[];
    const x0=7,x1=n-8,y0=5,y1=ny-6,mid=Math.floor(ny/2);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)
      if(x===x0||x===x1||y===y0||y===y1)walls[y*n+x]=1;
    for(let y=mid-Math.floor(gap/2);y<mid-Math.floor(gap/2)+gap;y++)walls[y*n+x1]=0;
    for(let x=0;x<n;x++){queue.push(x,(ny-1)*n+x);outside[x]=outside[(ny-1)*n+x]=1;}
    for(let y=1;y<ny-1;y++){queue.push(y*n,y*n+n-1);outside[y*n]=outside[y*n+n-1]=1;}
    for(let k=0;k<queue.length;k++){
      const i=queue[k],x=i%n,y=Math.floor(i/n);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const xx=x+dx,yy=y+dy,j=yy*n+xx;
        if(xx<0||xx>=n||yy<0||yy>=ny||walls[j]||outside[j])continue;
        outside[j]=1;queue.push(j);
      }
    }
    const trapped=walls.reduce((s,v,i)=>s+(!v&&!outside[i]?1:0),0);
    return {n,ny,walls,outside,trapped,x0,x1,y0,y1,mid,gap};
  }
  function chamber({gap=0,breach=4,heating=1.5,end=10,dt=.005}={}){
    // Dimensionless ideal gas, unit volume, R=1, gamma=1.4. A prescribed
    // opening supplies conductance; the model does not solve fracture or jets.
    const cv=2.5,cp=3.5,trace=[];let mass=1,energy=cv,heat=0,loss=0,outMass=0;
    const steps=Math.ceil(end/dt);
    for(let i=0;i<=steps;i++){
      const time=Math.min(end,i*dt),T=energy/(cv*mass),pressure=energy/cv;
      if(i%10===0||i===steps)trace.push({time,pressure,T,mass});
      if(i===steps)break;
      const h=Math.min(dt,end-time),Q=time<3?heating:0,cooling=.12*(T-1);
      const flow=time>=breach?.32*gap*(pressure-1):0;
      const dm=Math.min(flow*h,mass*.005),exhaust=cp*(dm>=0?T:1)*dm;
      mass-=dm;outMass+=dm;energy+=Q*h-cooling*h-exhaust;
      heat+=Q*h;loss+=cooling*h+exhaust;
    }
    return {trace,mass,energy,heat,loss,outMass,initial:cv,
      balance:energy-cv-heat+loss};
  }
  return {response,topology,chamber};
});
