/* Native exact-primitive density contract, expressed on ds du dv for one
   uniformly sampled diffuse square source. No hit-conditioned normalization.
   See RadianceLab's cross-family strategy 26 and docs/variance/catalogue.md.
   The quadrature below is a density diagnostic, not a native renderer. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhotonCombinationModel=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  const PI=Math.PI,keys=['uv','ut','vt','arb','cone','disk','sphere'];
  const names={uv:'UV · emitter plane',ut:'UT · first edge',vt:'VT · second edge',arb:'Arbitrary plane',cone:'Cone',disk:'Disk · meridian',sphere:'Sphere'};
  const colors={uv:'#f6d184',ut:'#f3ad75',vt:'#d5df98',arb:'#ebb4cf',cone:'#86e8c6',disk:'#89c8f3',sphere:'#c4b0ff'};
  const defaults={size:1.6,height:1.8,offset:.65,azimuth:25,elevation:-12,sigma:.5,angle:35,half:1.3};
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=a=>Math.hypot(...a),unit=a=>{const n=norm(a);return n?a.map(v=>v/n):[0,0,0];};
  function config(input={}){const c={...defaults,...input},a=c.azimuth*PI/180,e=c.elevation*PI/180;c.d=[Math.cos(e)*Math.cos(a),Math.cos(e)*Math.sin(a),Math.sin(e)];c.center=[c.offset,.19,c.height];c.area=c.size*c.size;return c;}
  function camera(c,s){return c.center.map((v,i)=>v+s*c.d[i]);}
  function directionAngles(direction){const d=unit(direction),round=v=>Math.round(v*1000)/1000;return {azimuth:round(Math.atan2(d[1],d[0])*180/PI),elevation:round(Math.asin(Math.max(-1,Math.min(1,d[2])))*180/PI)};}
  function event(c,s,u,v,d=c.d){
    const source=[c.size*(u-.5),c.size*(v-.5),0],point=camera(c,s),r=point.map((x,i)=>x-source[i]),t=norm(r),w=unit(r),mu=w[2],sn2=w[0]*w[0]+w[1]*w[1];
    const density=Object.fromEntries(keys.map(k=>[k,0]));
    if(!(t>0&&mu>0&&u>=0&&u<=1&&v>=0&&v<=1))return {density,payload:0,supported:false,source,point,t,w,mu};
    const a=c.angle*PI/180,edge=[Math.cos(a),Math.sin(a),0],A=c.area,R=c.size/Math.sqrt(2),qt=c.sigma*Math.exp(-c.sigma*t),pw=mu/PI,common=pw/(t*t),wd=dot(w,d);
    const normals={uv:[0,0,1],ut:cross([c.size,0,0],w),vt:cross([0,c.size,0],w),arb:cross(edge,w),cone:[mu*w[0],mu*w[1],mu*w[2]-1],disk:cross([0,0,1],w),sphere:w};
    const factors={uv:A*qt*common,ut:common,vt:common,arb:A/(2*R)*common,cone:1/t,disk:sn2>0?1/(2*PI*t*sn2):0,sphere:qt};
    keys.forEach(k=>{density[k]=factors[k]*Math.abs(dot(normals[k],d));});
    // The exact axis is a coordinate singularity for the disk parameterization.
    // It is reported, not filled by an arbitrary epsilon or clamped density.
    if(sn2===0)density.disk=NaN;
    const payload=A*pw*c.sigma*Math.exp(-c.sigma*(t+s+c.half))/(t*t);
    return {density,payload,supported:true,source,point,t,w,mu,normals,factors,axis:sn2===0,wd};
  }
  function allocation(selected,raw={}){const total=selected.reduce((s,k)=>s+(raw[k]===undefined?1:Math.max(0,raw[k])),0);if(!(total>0))throw Error('At least one allocation must be positive.');return Object.fromEntries(selected.map(k=>[k,(raw[k]===undefined?1:Math.max(0,raw[k]))/total]));}
  function mixture(densities,a){return Object.entries(a).reduce((s,[k,v])=>s+v*densities[k],0);}
  function probes(c,ns=21,nu=19,nv=19){const list=[],weight=2*c.half/(ns*nu*nv);for(let i=0;i<ns;i++)for(let j=0;j<nu;j++)for(let k=0;k<nv;k++){const s=((i+.5)/ns*2-1)*c.half,u=(j+.5)/nu,v=(k+.5)/nv;list.push({...event(c,s,u,v),s,u,v,weight});}return list;}
  function analyze(list,selected,raw={},costs={},length=2.6){
    const a=allocation(selected,raw),cost=selected.reduce((s,k)=>s+a[k]*(costs[k]??1),0),gain=Object.fromEntries(keys.map(k=>[k,0]));
    let integral=0,H=0,minQ=Infinity,uncovered=0,invalid=0,active=0;
    for(const p of list){const q=mixture(p.density,a),f=p.payload,dv=p.weight;integral+=dv*f;if(!(f>0))continue;active++;
      if(!Number.isFinite(q)){invalid++;continue;}minQ=Math.min(minQ,q);
      if(!(q>0)){uncovered+=dv*f;H=Infinity;continue;}
      const h=dv*f*f/q;H+=h;keys.forEach(k=>{gain[k]+=h*p.density[k]/q;});
    }
    if(invalid)H=NaN; // Do not publish a finite score after skipping an undefined PDF.
    const relative=integral>0?H/(integral*integral):NaN;
    const candidates=keys.map(k=>({key:k,gain:H>0&&Number.isFinite(H)?gain[k]/H:NaN,costRatio:(costs[k]??1)/cost}));
    return {a,integral,H,relative,minQ,relativeMin:minQ*length,uncovered:integral>0?uncovered/integral:0,invalid,active,cost,effort:cost*relative,candidates,evaluations:list.length*selected.length};
  }
  // Jacobi diagonalization of a symmetric 3×3 Gram matrix gives a genuine
  // direction witness for coincident zeros of the native absolute-dot PDFs.
  function eigenSymmetric(matrix){const a=matrix.map(r=>r.slice()),v=[[1,0,0],[0,1,0],[0,0,1]];for(let iteration=0;iteration<35;iteration++){
    let p=0,q=1;for(const [i,j]of[[0,2],[1,2]])if(Math.abs(a[i][j])>Math.abs(a[p][q])){p=i;q=j;}if(Math.abs(a[p][q])<1e-15)break;
    const angle=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),co=Math.cos(angle),si=Math.sin(angle),app=a[p][p],aqq=a[q][q],apq=a[p][q];
    for(let i=0;i<3;i++)if(i!==p&&i!==q){const ip=a[i][p],iq=a[i][q];a[i][p]=a[p][i]=co*ip-si*iq;a[i][q]=a[q][i]=si*ip+co*iq;}
    a[p][p]=co*co*app-2*co*si*apq+si*si*aqq;a[q][q]=si*si*app+2*co*si*apq+co*co*aqq;a[p][q]=a[q][p]=0;
    for(let i=0;i<3;i++){const ip=v[i][p],iq=v[i][q];v[i][p]=co*ip-si*iq;v[i][q]=si*ip+co*iq;}
  }return [0,1,2].map(i=>({value:Math.max(0,a[i][i]),vector:v.map(r=>r[i])})).sort((a,b)=>a.value-b.value);}
  function localSpan(e,selected,raw={}){
    if(!e.normals)return {rank:0,eigen:[],direction:[1,0,0]};
    const a=allocation(selected,raw),G=[[0,0,0],[0,0,0],[0,0,0]],B=[[0,0,0],[0,0,0],[0,0,0]];
    selected.forEach(k=>{if(!(e.factors[k]>0))return;const n=unit(e.normals[k]),v=e.normals[k],c=a[k]*e.factors[k];for(let i=0;i<3;i++)for(let j=0;j<3;j++){G[i][j]+=a[k]*n[i]*n[j];B[i][j]+=c*c*v[i]*v[j];}});
    const eigen=eigenSymmetric(G),rank=eigen.filter(e=>e.value>1e-9).length,scale=Math.max(...B.flat().map(Math.abs)),weighted=scale>0?eigenSymmetric(B.map(r=>r.map(v=>v/scale))):eigenSymmetric(B);
    return {rank,eigen,direction:eigen[0].vector,lowerBound:rank===3?Math.sqrt(weighted[0].value*scale):0};
  }
  return {keys,names,colors,defaults,config,camera,directionAngles,event,allocation,mixture,probes,analyze,localSpan,eigenSymmetric,dot,cross,norm,unit};
});
