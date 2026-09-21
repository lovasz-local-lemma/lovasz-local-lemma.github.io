// Bounded browser port of the native RelayLab geometry and spot light.
// Native: lab3d_photon.cpp REL_*; lab3d_light.hpp scene 8; photon_record.hpp panelTilt.
export const add=(a,b)=>a.map((v,i)=>v+b[i]), sub=(a,b)=>a.map((v,i)=>v-b[i]), mul=(a,s)=>a.map(v=>v*s), dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0), norm=a=>mul(a,1/Math.hypot(...a));
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const scenes={
  native:{name:'Native glass caustic',bounds:[1.2,1.2,1.2],spheres:[[0,0,0,.45]],panels:[],light:[0,1.17,0],kind:0},
  relay:{name:'Relay lab · three lenses',bounds:[2.2,1.2,1.3],spheres:[[-1.25,.15,0,.5],[.75,-.3,0,.22],[1.78,-.55,0,.28]],panels:[{c:[.06785715,-1.08,0],angle:-1.520148,half:[.45,.5],color:[.92,.92,.92]},{c:[1.112,.114,0],angle:-1.5358811,half:[.28,.5],color:[.40,.85,.95]}],light:[-2,.85,0],kind:8},
  diffuse:{name:'Pulse pavilion · diffuse receiver',bounds:[1.8,1.2,1.6],spheres:[],panels:[],light:[-.65,.8,0],kind:4}
};
export function sphereHit(o,d,s){const q=sub(o,s),b=dot(q,d),h=b*b-dot(q,q)+s[3]*s[3];if(h<0)return Infinity;const a=-b-Math.sqrt(h),z=-b+Math.sqrt(h);return a>1e-5?a:z>1e-5?z:Infinity;}
export function hitScene(o,d,scene){let best={t:Infinity};
  scene.spheres.forEach((s,i)=>{const t=sphereHit(o,d,s);if(t<best.t){const p=add(o,mul(d,t));best={t,p,n:norm(sub(p,s)),type:'glass',id:i};}});
  scene.panels.forEach((p,i)=>{const n=[Math.cos(p.angle),Math.sin(p.angle),0],u=[-n[1],n[0],0],den=dot(d,n);if(Math.abs(den)<1e-8)return;const t=dot(sub(p.c,o),n)/den;if(t<=1e-5||t>=best.t)return;const at=add(o,mul(d,t)),q=sub(at,p.c);if(Math.abs(dot(q,u))<=p.half[0]&&Math.abs(q[2])<=p.half[1])best={t,p:at,n:den<0?n:mul(n,-1),type:'mirror',id:i,color:p.color};});
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){if(axis===2&&sign===1)continue;if(Math.abs(d[axis])<1e-9)continue;const t=(sign*scene.bounds[axis]-o[axis])/d[axis];if(t<=1e-5||t>=best.t)continue;const p=add(o,mul(d,t));if(p.some((v,j)=>j!==axis&&Math.abs(v)>scene.bounds[j]+1e-5))continue;const n=[0,0,0];n[axis]=-sign;best={t,p,n,type:'diffuse',color:axis===0?(sign===-1?[.35,.13,.06]:[.06,.32,.28]):[.58,.62,.67]};}
  return Number.isFinite(best.t)?best:null;
}
export function refract(d,n,eta){const c=-dot(d,n),k=1-eta*eta*(1-c*c);return k<0?null:norm(add(mul(d,eta),mul(n,eta*c-Math.sqrt(k))));}
function frame(axis){const u=norm(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0]));return [u,cross(axis,u)];}
export function traceScene(key,count=4200){const scene=scenes[key],legs=[],deposits=[],emitters=[],lensCounts=[0,0,0];let seed=92731,maxTime=0,glassPaths=0;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;};
  for(let i=0;i<count;i++){let o=[...scene.light],d,color=[1,.92,.78],time=0,inside=false,glass=false;const seen=new Set();
    if(key==='relay'){const axis=norm(sub(scene.spheres[0].slice(0,3),o)),[u,v]=frame(axis),c=1-rnd()*(1-Math.cos(12*Math.PI/180)),s=Math.sqrt(1-c*c),a=rnd()*Math.PI*2;d=add(mul(axis,c),add(mul(u,s*Math.cos(a)),mul(v,s*Math.sin(a))));}
    else {const target=[(rnd()-.5)*.65,-1.2,(rnd()-.5)*.65];d=norm(sub(target,o));}
    for(let bounce=0;bounce<19;bounce++){const h=hitScene(o,d,scene);if(!h)break;const t1=time+h.t*(inside?1.5:1);legs.push({a:o,b:h.p,t0:time,t1,color:[...color],glass,inside,path:i,event:h.type,eventId:h.id??null});time=t1;maxTime=Math.max(maxTime,time);
      if(h.type==='glass'){const entering=dot(d,h.n)<0,n=entering?h.n:mul(h.n,-1),next=refract(d,n,entering?1/1.5:1.5);if(next){const cosine=Math.min(1,Math.max(0,-dot(d,n))),ct=Math.abs(dot(next,n)),ni=entering?1:1.5,nt=entering?1.5:1;const rs=((ni*cosine-nt*ct)/(ni*cosine+nt*ct))**2,rp=((nt*cosine-ni*ct)/(nt*cosine+ni*ct))**2;color=mul(color,1-(rs+rp)/2);d=next;inside=entering;if(!entering){glass=true;if(!seen.has(h.id)){lensCounts[h.id]++;seen.add(h.id);}}}else d=sub(d,mul(n,2*dot(d,n)));}
      else if(h.type==='mirror'){d=sub(d,mul(h.n,2*dot(d,h.n)));color=color.map((x,j)=>x*h.color[j]);}
      else {deposits.push({p:h.p,t:time,color:[...color],normal:h.n,glass});
        // Keep the actual floor-event position/time; displacing the wavefront
        // center off the floor would give it an artificial optical head start.
        if(key==='diffuse'&&bounce===0&&i%350===0)emitters.push({p:[...h.p],normal:h.n,t:time,color:color.map((x,j)=>x*h.color[j])});
        if(key==='relay'||bounce>=2)break;
        const [u,v]=frame(h.n),a=rnd()*Math.PI*2,r=Math.sqrt(rnd());d=add(mul(h.n,Math.sqrt(1-r*r)),add(mul(u,r*Math.cos(a)),mul(v,r*Math.sin(a))));color=color.map((x,j)=>x*h.color[j]);
      }
      o=add(h.p,mul(d,1e-4));time+=1e-4*(inside?1.5:1);
    }if(glass)glassPaths++;
  }
  return {count,legs,deposits,emitters,maxTime,glassPaths,lensCounts,lights:1,scene:{kind:scene.kind,ior:1.5,optical:true},geometry:scene};
}
export function sceneGuides(scene){const lines=[];for(const s of scene.spheres)for(let axis=0;axis<3;axis++)for(let k=0;k<48;k++){const p=t=>{const a=s.slice(0,3);a[(axis+1)%3]+=s[3]*Math.cos(t);a[(axis+2)%3]+=s[3]*Math.sin(t);return a;};lines.push({a:p(k*Math.PI/24),b:p((k+1)*Math.PI/24)});}for(let i=0;i<8;i++)for(let a=0;a<3;a++)if(!(i&(1<<a)))lines.push({a:[0,1,2].map(j=>(i&(1<<j)?1:-1)*scene.bounds[j]),b:[0,1,2].map(j=>((i|(1<<a))&(1<<j)?1:-1)*scene.bounds[j])});for(const p of scene.panels){const u=[-Math.sin(p.angle),Math.cos(p.angle),0],pts=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>add(p.c,add(mul(u,a*p.half[0]),[0,0,b*p.half[1]])));pts.forEach((a,i)=>lines.push({a,b:pts[(i+1)%4]}));}return lines;}
// A diffuse impulse is swept as equal-solid-angle hemispherical rings. Each ring
// has Lambertian cos(theta) energy. The azimuth phase jitters; the pulse is radial.
// This is finite directional quadrature, never a sweep through a delta interface.
export function pulseCurves(cache,time,arc=false){
  const lines=[];
  for(const [j,e]of cache.emitters.entries()){
    const radius=time-e.t;if(radius<=.015||radius>2.3)continue;
    const [u,v]=frame(e.normal);
    for(let row=0;row<7;row++){
      const c=(row+.5)/7,s=Math.sqrt(1-c*c),phase=j*2.399963+row*.763,span=arc?Math.PI*.70:Math.PI*2,steps=arc?12:36;
      const p=a=>add(e.p,mul(add(mul(e.normal,c),add(mul(u,s*Math.cos(a)),mul(v,s*Math.sin(a)))),radius));
      for(let k=0;k<steps;k++){
        const a=p(phase+k/steps*span),b=p(phase+(k+1)/steps*span);
        if(a.some((v,i)=>Math.abs(v)>cache.geometry.bounds[i])||b.some((v,i)=>Math.abs(v)>cache.geometry.bounds[i]))continue;
        // The quadrature's solid-angle weight is retained for inspection. The
        // drawing intentionally uses cosine-weighted constant-width strokes,
        // not a radiometrically normalized angular/area reconstruction.
        lines.push({a,b,color:mul(e.color,c),t:time,emitter:j,polarCosine:c,solidAngle:span/(steps*7)});
      }
    }
  }
  return lines;
}
