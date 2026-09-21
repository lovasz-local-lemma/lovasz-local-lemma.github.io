// Pure geometry for the retained path player. No renderer, DOM or trace solver.
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const length=v=>Math.hypot(...v);
const norm=v=>v.map(x=>x/(length(v)||1));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const palette=[[.90,.77,.38],[.40,.90,.77],[.66,.51,.91],[.99,.49,.37]];
export function paletteIndex(rgb){const m=Math.max(...rgb,1e-6),c=rgb.map(x=>x/m);return palette.map(p=>p.reduce((s,x,i)=>s+(x-c[i])**2,0)).reduce((best,d,i,a)=>d<a[best]?i:best,0);}
export function parseCache(raw){
 if(raw?.format!=='RIVX-PATHS-1'||!Array.isArray(raw.paths))throw Error('Expected a RIVX-PATHS-1 path cache.');
 if(raw.paths.length>100000)throw Error('This display accepts at most 100,000 paths. Export a smaller cache.');
 const legs=[];let boundsMin=[Infinity,Infinity,Infinity],boundsMax=[-Infinity,-Infinity,-Infinity],minTime=Infinity,maxTime=-Infinity;
 let vertexCount=0;
 for(const path of raw.paths){
  if(!Array.isArray(path.vertices))throw Error('A path has no vertices array.');
  let previous=null;
  for(const v of path.vertices){
   if(++vertexCount>500000)throw Error('This display accepts at most 500,000 vertices.');
   if(!Array.isArray(v.position)||v.position.length!==3||v.position.some(x=>!Number.isFinite(x))||!Number.isFinite(v.timeNs))throw Error('Every vertex needs a finite 3D position and timeNs.');
   if(v.position.some(x=>Math.abs(x)>1e7))throw Error('World coordinates exceed this viewer’s supported range.');
   if(previous&&v.timeNs<previous.timeNs)throw Error('Arrival times must be nondecreasing along each path.');
   boundsMin=boundsMin.map((x,i)=>Math.min(x,v.position[i]));boundsMax=boundsMax.map((x,i)=>Math.max(x,v.position[i]));
   minTime=Math.min(minTime,v.timeNs);maxTime=Math.max(maxTime,v.timeNs);
   const c=v.color??path.color??[.9,.77,.38];
   if(!Array.isArray(c)||c.length!==3||c.some(x=>!Number.isFinite(x)||x<0))throw Error('Vertex colors must contain three finite, nonnegative values.');
   if(previous&&length(sub(v.position,previous.position))>1e-9&&v.timeNs>previous.timeNs){
    // Native Beam display uses throughput on the arriving endpoint of a leg.
    legs.push({a:previous.position,b:v.position,t0:previous.timeNs,t1:v.timeNs,color:paletteIndex(c)});
   }
   previous=v;
  }
 }
 if(!legs.length)throw Error('The cache contains no nonzero path legs with increasing arrival time.');
 const center=mix(boundsMin,boundsMax,.5),radius=Math.max(.25,length(sub(boundsMax,boundsMin))*.55);
 const provenance=raw.provenance||[raw.source,raw.clock,raw.purpose,raw.selection].filter(Boolean).join(' · ');
 return {legs,minTime,maxTime,center,radius,boundsMin,boundsMax,name:String(raw.name||raw.source||'Native path cache'),provenance:String(provenance||'Imported retained geometry. Trace settings are fixed in the cache.')};
}
export function clipTime(leg,lo,hi){
 const a=Math.max(0,(lo-leg.t0)/(leg.t1-leg.t0)),b=Math.min(1,(hi-leg.t0)/(leg.t1-leg.t0));
 return b>a?{...leg,a:mix(leg.a,leg.b,a),b:mix(leg.a,leg.b,b)}:null;
}
export function camera(center,radius,yaw,pitch,distance){
 const eye=add(center,[Math.sin(yaw)*Math.cos(pitch)*distance*radius,Math.sin(pitch)*distance*radius,Math.cos(yaw)*Math.cos(pitch)*distance*radius]);
 const forward=norm(sub(center,eye)),right=norm(cross(forward,[0,1,0])),up=cross(right,forward);
 return {eye,forward,right,up,near:radius*.02,focal:680};
}
export function projectSegment(a,b,c){
 let za=dot(sub(a,c.eye),c.forward),zb=dot(sub(b,c.eye),c.forward);
 if(za<=c.near&&zb<=c.near)return null;
 if(za<c.near){a=mix(a,b,(c.near-za)/(zb-za));za=c.near;}
 if(zb<c.near){b=mix(b,a,(c.near-zb)/(za-zb));zb=c.near;}
 const project=(p,z)=>[500+c.focal*dot(sub(p,c.eye),c.right)/z,350-c.focal*dot(sub(p,c.eye),c.up)/z];
 const p=project(a,za),q=project(b,zb);
 return {p,q,depth:(za+zb)*.5};
}
export function roomGuides(min,max){
 const corners=Array.from({length:8},(_,i)=>min.map((v,j)=>(i&(1<<j))?max[j]:v)),out=[];
 for(let i=0;i<8;i++)for(let j=0;j<3;j++)if(!(i&(1<<j)))out.push({a:corners[i],b:corners[i|(1<<j)],color:1});
 return out;
}
export function fixture(){
 const paths=[];
 for(let i=0;i<44;i++){
  const a=i*2.39996323,r=Math.sqrt((i+.5)/44),col=palette[Math.floor(i/11)];
  const points=[[-2.7,.8,0],[-.7,.25+Math.cos(a)*r*.62,Math.sin(a)*r*.62],[.9,-.15-Math.cos(a)*r*.27,-Math.sin(a)*r*.27],[2.7,-.5+Math.cos(a)*r*1.35,Math.sin(a)*r*1.35]];
  let t=0;paths.push({vertices:points.map((position,j)=>{if(j)t+=length(sub(position,points[j-1]))/.299792458;return {position,timeNs:t,color:col};})});
 }
 return {format:'RIVX-PATHS-1',name:'Geometric timing fixture',provenance:'Constructed converging and diverging paths, timed at c. This is a geometry fixture, not traced caustic radiance.',paths};
}
