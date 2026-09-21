// Deterministic, deliberately bounded diagnostics. No transport estimator is implied.
export const add=(a,b)=>a.map((x,i)=>x+b[i]);
export const sub=(a,b)=>a.map((x,i)=>x-b[i]);
export const mul=(a,t)=>a.map(x=>x*t);
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const length=a=>Math.sqrt(dot(a,a));
export const normalize=a=>mul(a,1/(length(a)||1));
export const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function random(seed=9183){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export const palette=t=>[.32+.65*Math.pow(Math.sin(1.8+t*2.6),2),.35+.55*Math.pow(Math.sin(t*2.5+.4),2),.32+.65*Math.pow(Math.sin(t*2.8+3.5),2)];
export function gyroid(p){const [x,y,z]=mul(p,2.2);return Math.sin(x)*Math.cos(y)+Math.sin(y)*Math.cos(z)+Math.sin(z)*Math.cos(x);}
export function density(p){return Math.exp(-Math.pow(gyroid(p)/.17,2))*Math.exp(-Math.pow(length(p)/2.45,8));}
export function plume(p,adverse){const c=adverse?[-1.05,.1,0]:[.2,-.5,-.35];const r=sub(p,c);return (adverse?7.5:.75)*Math.exp(-dot(r,r)/.63);}
export const light=[-2.75,1.45,.45], eye=[2.7,.5,.2];
export function transmittance(a,b,adverse,steps=24){const d=sub(b,a),l=length(d);let tau=.09*l;for(let i=0;i<steps;i++)tau+=plume(add(a,mul(d,(i+.5)/steps)),adverse)*l/steps;return Math.exp(-tau);}
export function opticalLength(a,b,varying,steps=32){const d=sub(b,a),l=length(d);let v=l;if(varying)for(let i=0;i<steps;i++){const p=add(a,mul(d,(i+.5)/steps));v+=.72*Math.exp(-dot(p,p)/1.7)*l/steps;}return v;}
export const MAX_SEGMENTS=128;
export const pathColors={photon:[1,.66,.24],camera:[.17,.86,1],medium:[.76,.48,1],connection:[1,.91,.65]};
export const inspectionCameras={sheets:{yaw:-.28,pitch:.045,zoom:9.2},relay:{yaw:-.18,pitch:.045,zoom:8.8}};
const framingClouds=new Map();
export function framingPoints(mode){
  if(framingClouds.has(mode))return framingClouds.get(mode);
  const make=mode==='sheets'?sheetsStudy:relayStudy,values=mode==='sheets'?[0,.6,1]:[0,.7,1],points=[];
  for(const value of values)for(const adverse of [false,true]){
    const study=make(value,adverse);
    points.push(...study.segments.flatMap(s=>[s.a,s.b]));
    for(const p of study.planes||[])for(const a of [-1,1])for(const b of [-1,1])points.push(add(p.center,add(mul(p.u,p.size[0]*a),mul(p.v,p.size[1]*b))));
    for(const b of study.balls||[])for(const axis of [[1,0,0],[0,1,0],[0,0,1]])for(const sign of [-1,1])points.push(add(b.slice(0,3),mul(axis,b[3]*sign)));
  }
  framingClouds.set(mode,points);return points;
}
// Fit once against the complete parameter-range envelope, not the current pose.
// This avoids both clipped prefix roots and camera breathing while sliders move.
export function fitPathDiagram(mode,width,height,mobile=width<740){
  const camera=inspectionCameras[mode],ro=mul([Math.sin(camera.yaw)*Math.cos(camera.pitch),Math.sin(camera.pitch),Math.cos(camera.yaw)*Math.cos(camera.pitch)],camera.zoom),forward=normalize(sub([0,.05,0],ro)),right=normalize(cross(forward,[0,1,0])),up=cross(right,forward);
  const projected=framingPoints(mode).map(p=>{const q=sub(p,ro),z=dot(q,forward);return [dot(q,right)/z,dot(q,up)/z];}),xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]),bounds=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)],aspect=width/height;
  const area=mobile?{left:.1,right:.9,top:.105,bottom:.485}:{left:Math.max(.075,60/width),right:Math.min(.72,(width-285)/width),top:Math.max(.14,85/height),bottom:Math.min(.70,1-190/height)};
  const focal=Math.min((area.right-area.left)*aspect/(bounds[1]-bounds[0]),(area.bottom-area.top)/(bounds[3]-bounds[2]));
  const offset=[focal*(bounds[0]+bounds[1])/2-aspect*((area.left+area.right)/2-.5),(area.top+area.bottom)/2-.5+focal*(bounds[2]+bounds[3])/2];
  return {focal,offset,area,camera};
}
const segment=(a,b,color=[.6,.8,1],strength=1,options={})=>({a,b,color,strength,...options});
function pathDrawing(vertices,role,{strength=.8,released=[],dashed=false}={}){
  const color=pathColors[role],segments=vertices.slice(1).map((b,i)=>segment(vertices[i],b,color,strength,{width:released.includes(i)?.016:.010,dashed,role}));
  for(const p of vertices)segments.push(segment(p,p,color,strength,{width:.027,role}));
  return segments;
}
const label=(position,text,role)=>({position,text,role});

// A finite sheet is the endpoint locus of two positive free-flight lengths.
// Prefix turns illustrate earlier scattering; they carry no sampled BSDF weight.
export function sheetPath(support,role){
  const side=role==='photon'?-1:1,du=mul(support.u,(support.u[0]>=0?1:-1)*-side),dv=mul(support.v,-side);
  const lengths=support.size.map(v=>v+.12),anchor=sub(sub(support.center,mul(du,lengths[0])),mul(dv,lengths[1]));
  const prefix=[[side*2.72,1.94,.4],[side*2.9,.86,-.58],add(mul(anchor,.78),[side*.32,-.18,-.16]),anchor];
  return {role,support,directions:[du,dv],lengths,prefix,released:[3,4]};
}
export function reconstructSheetPath(path,endpoint){
  const offset=sub(endpoint,path.support.center),lengths=path.directions.map((d,i)=>path.lengths[i]+dot(offset,d));
  const elbow=add(path.prefix.at(-1),mul(path.directions[0],lengths[0])),end=add(elbow,mul(path.directions[1],lengths[1]));
  return {vertices:[...path.prefix,elbow,end],flightLengths:lengths};
}

function relayContext(points){
  const pivot=points[0].p,occupied=points.filter(p=>density(p.p)>.2),near=target=>occupied.reduce((best,p)=>length(sub(p.p,target))<length(sub(best,target))?p.p:best,occupied[0].p);
  const middle=[near(add(pivot,[-.65,-.3,.15])),pivot,near(add(pivot,[.65,.3,-.15]))];
  const photon=[[-2.86,2.02,.45],[-2.35,1.75,-.65],[-2.95,.73,-.5],light],camera=[[2.86,1.96,.45],[2.3,1.55,-.63],[2.94,.85,-.48],eye];
  const segments=[...pathDrawing(photon,'photon'),...pathDrawing(camera,'camera'),...pathDrawing(middle,'medium',{strength:1.4})];
  const connections=[[light,middle[0]],[middle[2],eye]];
  for(const [a,b] of connections)segments.push(segment(a,b,pathColors.connection,.9,{width:.012,dashed:true,role:'connection'}));
  return {segments,paths:[{role:'photon',vertices:photon},{role:'camera',vertices:camera},{role:'medium',vertices:middle,schematic:true}],connections,annotations:[label(photon[0],'L · photon','photon'),label(camera[0],'C · camera','camera'),label(middle[1],'M · medium subpath','medium')]};
}
export function relayStudy(amount,adverse){
  const rng=random(813),mix=.2+.7*amount,radius=.8,candidates=[];
  for(let i=0;i<900;i++){const p=[(rng()-.5)*3,(rng()-.5)*3,(rng()-.5)*3];const tr=transmittance(light,p,adverse)*transmittance(p,eye,adverse);candidates.push({p,score:density(p)*Math.pow(tr/(.4+length(sub(light,p))**2)/(.4+length(sub(eye,p))**2),amount)});}
  candidates.sort((a,b)=>b.score-a.score);const balls=[];
  for(const c of candidates)if(balls.every(b=>length(sub(b,c.p))>1.05)){balls.push(c.p);if(balls.length===3)break;}
  const volume=4*Math.PI*radius**3/3,points=[];let sum=0,sum2=0,hit=0,trsum=0;
  for(let i=0;i<512;i++){
    let p;if(rng()<mix){const b=balls[Math.floor(rng()*balls.length)],z=2*rng()-1,a=2*Math.PI*rng(),r=radius*Math.cbrt(rng());p=add(b,[r*Math.sqrt(1-z*z)*Math.cos(a),r*Math.sqrt(1-z*z)*Math.sin(a),r*z]);}else p=[(rng()-.5)*5,(rng()-.5)*5,(rng()-.5)*5];
    const q=(1-mix)/125+balls.reduce((s,b)=>s+(length(sub(p,b))<radius?mix/(balls.length*volume):0),0);
    const tr=transmittance(light,p,adverse)*transmittance(p,eye,adverse),sigma=density(p),f=sigma*tr/(.4+length(sub(light,p))**2)/(.4+length(sub(eye,p))**2),w=f/q;
    sum+=w;sum2+=w*w;trsum+=tr;if(sigma>.18)hit++;points.push({p,w,tr});
  }
  points.sort((a,b)=>b.w-a.w);const segments=[];
  for(let i=0;i<14;i++){const p=points[i*3],col=palette(i/14),strength=adverse?.1+.7*p.tr:.2+.32*p.tr;segments.push(segment(light,p.p,col,strength),segment(p.p,eye,col,strength));}
  const context=relayContext(points);
  return {segments:[...context.segments,...segments.map(s=>({...s,strength:s.strength*.45}))],paths:context.paths,connections:context.connections,annotations:context.annotations,balls:balls.map(p=>[...p,radius]),stats:{ess:sum*sum/sum2,mean:sum/512,hit:hit/512,transmittance:trsum/512,fallback:1-mix},check:{allWeightsFinite:points.every(p=>Number.isFinite(p.w)),minPdf:(1-mix)/125}};
}
export function plane(center,normal,size=[2.3,1.65]){normal=normalize(normal);const u=normalize(cross(Math.abs(normal[1])<.9?[0,1,0]:[1,0,0],normal));return {center,normal,u,v:cross(normal,u),size};}
export function planeIntersection(a,b){
  const raw=cross(a.normal,b.normal),denom=dot(raw,raw),sine=Math.sqrt(denom);if(denom<1e-12)return {valid:false,sine,reason:'parallel',length:0};
  const p=mul(add(mul(cross(b.normal,raw),dot(a.normal,a.center)),mul(cross(raw,a.normal),dot(b.normal,b.center))),1/denom),d=normalize(raw);let lo=-1e6,hi=1e6;
  for(const pl of [a,b])for(const [basis,half] of [[pl.u,pl.size[0]],[pl.v,pl.size[1]]]){const offset=dot(sub(p,pl.center),basis),slope=dot(d,basis);if(Math.abs(slope)<1e-10){if(Math.abs(offset)>half)return {valid:false,sine,reason:'finite miss',length:0,p,d};}else{let l=(-half-offset)/slope,h=(half-offset)/slope;if(l>h)[l,h]=[h,l];lo=Math.max(lo,l);hi=Math.min(hi,h);}}
  return {valid:hi>=lo,sine,reason:hi>=lo?'clipped line':'finite miss',length:Math.max(0,hi-lo),p,d,lo,hi,a:add(p,mul(d,lo)),b:add(p,mul(d,hi))};
}
export function sheetsStudy(amount,adverse){
  const angle=(adverse?1.5+amount*3:22+amount*57)*Math.PI/180,n1=normalize([.12,.76,.64]),axis=normalize(cross(n1,[0,0,1])),n2=add(mul(n1,Math.cos(angle)),mul(cross(axis,n1),Math.sin(angle)));
  const planes=[plane([0,-.22,0],n1),plane(adverse?[0,.62,.55]:[.1,.05,0],n2)],intersection=planeIntersection(...planes),families=planes.map((p,i)=>sheetPath(p,i?'camera':'photon'));
  const shared=intersection.valid?mul(add(intersection.a,intersection.b),.5):null,paths=families.map(path=>({...path,...reconstructSheetPath(path,shared||path.support.center)})),segments=[],annotations=[];
  for(const path of paths){
    segments.push(...pathDrawing(path.vertices,path.role,{released:path.released}));
    annotations.push(label(path.vertices[0],path.role==='photon'?'L · photon':'C · camera',path.role));
    for(const [j,i] of path.released.entries())annotations.push(label(mul(add(path.vertices[i],path.vertices[i+1]),.5),`${path.role==='photon'?'ℓ':'c'}${j+1} · released`,path.role));
  }
  if(shared){segments.push(segment(intersection.a,intersection.b,[1,.9,.6],1.15));for(let i=0;i<13;i++){const p=add(intersection.a,mul(sub(intersection.b,intersection.a),i/12));segments.push(segment(p,p,[1,.97,.8],1.5,{width:.018}));}annotations.push(label(shared,'x · common endpoint','connection'));}
  return {planes,intersection,segments,paths,annotations};
}
export function mirror(t,amplitude){return -1.38+.24*t*t+amplitude*Math.cos(4*t);}
export function reflectionConstraint(t,L,C,amplitude){const p=[t,mirror(t,amplitude),0],dp=[1,.48*t-4*amplitude*Math.sin(4*t),0],ddp=[0,.48-16*amplitude*Math.cos(4*t),0];let g=0,dg=0;for(const e of [L,C]){const r=sub(p,e),l=length(r),a=dot(r,dp);g+=a/l;dg+=dot(dp,dp)/l-a*a/l**3+dot(r,ddp)/l;}return {g,dg,p};}
export function solveReflection(seed,L,C,amplitude,iterations=20){let t=seed;const history=[t];for(let i=0;i<iterations;i++){const {g,dg}=reflectionConstraint(t,L,C,amplitude);if(Math.abs(g)<1e-7)break;if(Math.abs(dg)<1e-8)break;t-=clamp(g/dg,-.65,.65);history.push(t);if(Math.abs(t)>2.5)break;}const r=reflectionConstraint(t,L,C,amplitude),normal=[-(.48*t-4*amplitude*Math.sin(4*t)),1,0],sameReflectingSide=dot(sub(L,r.p),normal)>0&&dot(sub(C,r.p),normal)>0;return {t,point:r.p,residual:Math.abs(r.g),valid:Math.abs(r.g)<1e-5&&Math.abs(t)<2.35&&sameReflectingSide,history};}
export function bracketReflectionRoots(L,C,amplitude){const roots=[];let a=-2.35,ga=reflectionConstraint(a,L,C,amplitude).g;for(let k=1;k<=1024;k++){let b=-2.35+4.7*k/1024,gb=reflectionConstraint(b,L,C,amplitude).g;if(ga*gb<0){let l=a,h=b,fl=ga;for(let j=0;j<40;j++){const m=(l+h)/2,f=reflectionConstraint(m,L,C,amplitude).g;if(fl*f<=0)h=m;else{l=m;fl=f;}}roots.push((l+h)/2);}a=b;ga=gb;}return roots;}
export function loomStudy(amount,adverse){const amplitude=.035+.2*amount,L=[-2.65,2.0,0],segments=[],results=[];let maxResidual=0,converged=0;for(let i=0;i<19;i++){const z=(i-9)*.105,C=[2.5,.05+i*.105,0],seed=adverse?-2.28+i*.012:-1.3+i*.13,r=solveReflection(seed,L,C,amplitude,adverse?3:24);results.push(r);if(r.valid){converged++;maxResidual=Math.max(maxResidual,r.residual);const p=[r.point[0],r.point[1],z],a=[L[0],L[1],z],b=[C[0],C[1],z],color=palette(i/19);segments.push(segment(a,p,color,.65),segment(p,b,color,.8));}else{const t=clamp(r.t,-2.35,2.35),p=[t,mirror(t,amplitude),z];segments.push(segment([L[0],L[1],z],p,[.95,.28,.22],.16));}}
  const centerC=[2.5,.995,0],roots=bracketReflectionRoots(L,[2.5,1,0],amplitude),root=results[9],paths=root.valid?[{role:'photon',vertices:[L,root.point]},{role:'camera',vertices:[centerC,root.point]}]:[];
  for(const path of paths)segments.push(...pathDrawing(path.vertices,path.role,{strength:.9}));
  const annotations=[label(L,'L · source','photon'),label(centerC,'C · receiver','camera')];
  if(root.valid)annotations.push(label(root.point,'x · reflection root','connection'));
  return {segments,amplitude,paths,annotations,stats:{converged,total:19,maxResidual,roots:roots.length},results};}
export function segmentBox(a,b,low,high){const d=sub(b,a);let lo=0,hi=1;for(let k=0;k<3;k++){if(Math.abs(d[k])<1e-10){if(a[k]<low[k]||a[k]>high[k])return null;}else{let x=(low[k]-a[k])/d[k],y=(high[k]-a[k])/d[k];if(x>y)[x,y]=[y,x];lo=Math.max(lo,x);hi=Math.min(hi,y);if(lo>hi)return null;}}return lo>=0&&lo<=1?lo:null;}
export function atlasStudy(amount,adverse){
  const base=[[-2.6,-.3,0],[-1.9,.85,-.4],[-1.2,-.55,.2],[-.45,.55,-.25],[.4,-.52,.2],[1.25,.55,-.15],[2.3,.1,0]],directions=base.slice(1).map((p,i)=>normalize(sub(p,base[i]))),lengths=base.slice(1).map((p,i)=>length(sub(p,base[i]))),released=adverse?[0,4]:[3,4],spread=.12+.43*amount,segments=[],rng=random(413),obstacles=[{low:[-.94,.2,-1.3],high:[-.69,1.8,1.3]},{low:[.71,-1.8,-1.3],high:[.91,-.53,1.3]}];let valid=0,queries=0;const endpoints=[];
  for(let s=0;s<13;s++){const delta=[(rng()-.5)*spread*2,(rng()-.5)*spread*2],points=[base[0]];for(let i=0;i<6;i++)points.push(add(points.at(-1),mul(directions[i],lengths[i]+(i===released[0]?delta[0]:i===released[1]?delta[1]:0))));endpoints.push(points.at(-1));let blocked=false;for(let i=0;i<6;i++){const a=points[i],b=points[i+1];queries++;const hits=obstacles.map(o=>segmentBox(a,b,o.low,o.high)).filter(t=>t!==null);if(hits.length){segments.push(segment(a,add(a,mul(sub(b,a),Math.min(...hits))),[1,.27,.19],.35));blocked=true;break;}segments.push(segment(a,b,palette(s/13),.4));}if(!blocked)valid++;}
  const d1=directions[released[0]],d2=directions[released[1]],normal=normalize(cross(d1,d2)),dualU=cross(d2,normal),dualV=cross(normal,d1),support={center:base.at(-1),normal,u:mul(dualU,1/dot(d1,dualU)),v:mul(dualV,1/dot(d2,dualV)),size:[spread,spread]};
  segments.push(...pathDrawing(base,'photon',{strength:.3,released,dashed:true}));
  const annotations=[label(base[0],'L · photon start','photon'),label(base.at(-1),'Endpoint support','connection'),...released.map(i=>label(mul(add(base[i],base[i+1]),.5),`ℓ${i+1} · released`,'photon'))];
  return {segments,obstacles,support,endpoints,paths:[{role:'photon',vertices:base,reference:true}],annotations,stats:{valid,total:13,queries,released:released.map(i=>i+1),affected:6-released[0],families:15},base};
}
export function chronolensStudy(amount,adverse){const L=[-2.45,.1,0],C=[2.45,.1,0],gate=5.05+amount*2.8,width=.13;let geometric=0,actual=0,overlap=0,best={error:Infinity};for(let ix=0;ix<26;ix++)for(let iy=0;iy<26;iy++)for(let iz=0;iz<18;iz++){const p=[-2.5+5*(ix+.5)/26,-2.5+5*(iy+.5)/26,-2.1+4.2*(iz+.5)/18];if(density(p)<.15)continue;const s=length(sub(p,L))+length(sub(p,C)),optical=opticalLength(L,p,adverse,16)+opticalLength(p,C,adverse,16),error=Math.abs(optical-gate),g=Math.abs(s-gate)<width*.5,o=error<width*.5;if(error<best.error)best={p,error,optical};if(g)geometric++;if(o)actual++;if(g&&o)overlap++;}
  const paths=[{role:'photon',vertices:[L,best.p]},{role:'camera',vertices:[C,best.p]}],segments=paths.flatMap(path=>pathDrawing(path.vertices,path.role,{strength:.62})),annotations=[label(L,'L · pulse source','photon'),label(C,'C · receiver','camera'),label(best.p,best.error<width*.5?'x · inside time gate':'x · nearest occupied point','connection')];
  return {segments,paths,annotations,probe:best,gate,width,stats:{geometric,actual,overlap,agreement:geometric?overlap/geometric:0}};
}
export function thinLensRay(pixel,lens,tilt,focus=0){const origin=[0,0,7.6],direction=normalize([pixel[0],pixel[1],-4.1]),t=(focus-origin[2]+tilt*origin[0])/(direction[2]-tilt*direction[0]),target=add(origin,mul(direction,t)),start=add(origin,[lens[0],lens[1],0]);return {origin:start,direction:normalize(sub(target,start)),target};}
export function focusStudy(amount,adverse){const tilt=(amount-.5)*1.5,aperture=adverse?.28:.12,plane=tilt;const testPoint=[1.3,0,plane*1.3],rays=[[-aperture,0],[aperture,0],[0,aperture]].map(p=>thinLensRay([.7,.15],p,tilt)),targets=rays.map(r=>r.target),error=length(sub(targets[0],targets[1]));
  const paths=rays.map(ray=>({role:'camera',vertices:[add(ray.origin,mul(ray.direction,(2.5-ray.origin[2])/ray.direction[2])),ray.target],apertureOrigin:ray.origin})),segments=paths.flatMap(path=>pathDrawing(path.vertices,'camera',{strength:.7})),annotations=[label(paths[0].vertices[0],'C · toward aperture','camera'),label(targets[0],'F · common focus','connection')];
  return {segments,paths,annotations,tilt,aperture,stats:{error,samples:7,tiltDegrees:Math.atan(tilt)*180/Math.PI},testPoint};}
