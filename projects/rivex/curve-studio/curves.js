// The local-fit construction mirrors RIVX's native curve evaluator. The selected
// basis is retained until drawing/export; sampling is a separate decision.
const TAU=Math.PI*2;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1],sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const quad=(u,a,b,c)=>[a,-a*(u+1)/u-b/(u*(u-1))-c*u/(1-u),a/u+b/(u*(u-1))+c/(1-u)];
const value=(q,s)=>q[0]+s*(q[1]+s*q[2]);
export function fit(a,b,c){
 const ac=sub(c,a),ab=sub(b,a),a2=dot(ac,ac);let lo=0,hi=1;
 for(let i=0;i<40;i++){const t=(lo+hi)/2,f=((a2*t-3*dot(ac,ab))*t+dot(ab.map((v,k)=>2*v+ac[k]),ab))*t-dot(ab,ab);if(f<=0)lo=t;else hi=t;}
 const u=a2<1e-20?.5:Math.max(.001,Math.min(.999,(lo+hi)/2));
 const q=[quad(u,a[0],b[0],c[0]),quad(u,a[1],b[1],c[1])],cross=ab[0]*ac[1]-ab[1]*ac[0];
 let circle=null;
 if(Math.abs(cross)>1e-4*Math.max(dot(ab,ab),a2,dot(sub(c,b),sub(c,b)))){
  const b2=dot(ab,ab),ux=(ac[1]*b2-ab[1]*a2)/(2*cross),uy=(ab[0]*a2-ac[0]*b2)/(2*cross),center=[a[0]+ux,a[1]+uy];
  const angle=p=>Math.atan2(p[1]-center[1],p[0]-center[0]);
  const wrap=d=>{d-=TAU*Math.floor(d/TAU);return cross<0&&d>0?d-TAU:d;};
  const t0=angle(a),t1=t0+wrap(angle(b)-t0),t2=t1+wrap(angle(c)-t1),angles=quad(u,t0,t1,t2);
  if(angles[1]*(angles[1]+2*angles[2])>=0)circle={center,r:Math.hypot(ux,uy),angles};
 }
 const middle=mix(a,c,.5),e1=sub(c,middle),e2=sub(b,middle),w=dot(e1,e1)>1e-12?Math.max(0,1-Math.abs(dot(e1,e2))/dot(e1,e1)):1;
 return {u,q,circle,middle,e1,e2,w,phi:quad(u,-Math.PI/2,0,Math.PI/2)};
}
function evaluate(f,s,kind){
 const p=f.q.map(q=>value(q,s));if(kind==='parabolic')return p;
 let circular=p;if(f.circle){const {center,r,angles}=f.circle,a=value(angles,s);circular=[center[0]+r*Math.cos(a),center[1]+r*Math.sin(a)];}
 if(kind==='circular')return circular;
 const a=value(f.phi,s),ellipse=f.middle.map((v,i)=>v+f.e1[i]*Math.sin(a)+f.e2[i]*Math.cos(a));
 return kind==='elliptical'?ellipse:mix(circular,ellipse,f.w);
}
export function sample(points,kind='hybrid',steps=40){
 const n=points.length;if(n<3)return points.map(p=>p.slice());const fits=points.map((p,i)=>i&&i<n-1?fit(points[i-1],p,points[i+1]):null),out=[];
 for(let j=0;j<n-1;j++)for(let k=0;k<steps;k++){
  const t=k/steps,l=fits[j],r=fits[j+1];
  if(kind==='catmull'){
   const a=points[Math.max(0,j-1)],b=points[j],c=points[j+1],d=points[Math.min(n-1,j+2)];
   out.push(b.map((v,i)=>.5*(2*v+(-a[i]+c[i])*t+(2*a[i]-5*v+4*c[i]-d[i])*t*t+(-a[i]+3*v-3*c[i]+d[i])*t*t*t)));continue;
  }
  const left=l?evaluate(l,l.u+(1-l.u)*t,kind):null,right=r?evaluate(r,r.u*t,kind):null;
  out.push(left&&right?mix(right,left,Math.cos(Math.PI*t/2)**2):left||right);
 }
 out.push(points[n-1].slice());return out;
}
export function approximationError(reference,coarse){
 let worst=0;for(const p of reference){let best=Infinity;for(let i=1;i<coarse.length;i++){const a=coarse[i-1],d=sub(coarse[i],a),t=Math.max(0,Math.min(1,dot(sub(p,a),d)/(dot(d,d)||1)));best=Math.min(best,Math.hypot(...sub(p,mix(a,coarse[i],t))));}worst=Math.max(worst,best);}return worst;
}
