// Browser construction study of the native analytic fan and swept-plane geometry.
// All output is projected ordinary Rive geometry, not a radiometric estimator.
export const defaults={mode:'caustic',ior:1.5,aperture:.92,planes:20,radius:.42,sweep:1.15,slice:1.4,yaw:-.35,pitch:.34,rays:true,footprint:true,dispersion:true,luminous:true};
export const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>mul(a,1/Math.hypot(...a));
const gold=[.96,.76,.39],cyan=[.35,.85,.84],pink=[.92,.49,.62];
export function refract(d,n,eta){const c=-dot(d,n),k=1-eta*eta*(1-c*c);return k<0?null:add(mul(d,eta),mul(n,eta*c-Math.sqrt(k)));}
export function traceFan(ior=1.5,aperture=.92,count=96){
 const D=2,R=.72,fan=[];
 for(let i=0;i<count;i++){
  const angle=Math.asin(R/D)*aperture*(i+.5)/count,d=[Math.cos(angle),Math.sin(angle)],b=D*d[0],disc=b*b-D*D+R*R;if(disc<=0)continue;
  const t=b-Math.sqrt(disc),entry=mul(d,t),normal=[(entry[0]-D)/R,entry[1]/R],inside=refract(d,normal,1/ior);if(!inside)continue;
  const chord=-2*dot(inside,[entry[0]-D,entry[1]]),exit=add(entry,mul(inside,chord)),out=refract(inside,[(D-exit[0])/R,-exit[1]/R],ior);if(!out)continue;
  fan.push({entry,exit,out,clock:t+chord*ior});
 }
 return fan;
}
export function envelope(fan){
 const points=[];for(let i=1;i<fan.length;i++){
  const a=fan[i-1],b=fan[i],det=a.out[1]*b.out[0]-a.out[0]*b.out[1];if(Math.abs(det)<1e-12)continue;
  const dx=b.exit[0]-a.exit[0],dy=b.exit[1]-a.exit[1],s=(-dx*b.out[1]+dy*b.out[0])/det,t=(a.out[0]*dy-a.out[1]*dx)/det;
  if(s>=0&&t>=0){const p=add(a.exit,mul(a.out,s));if(p[0]<7)points.push([p[0],Math.abs(p[1])]);}
 }return points;
}
export function ballSection(center,radius,x){const r2=radius*radius-(x-center[0])**2;return r2>0?{center:[x,center[1],center[2]],radius:Math.sqrt(r2)}:null;}
export function uvPoint(center,u,v,a,b){return add(center,add(mul(u,a),mul(v,b)));}
export function planeArea(u,v){return 4*Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);}
export function project(p,state){const c=Math.cos(state.yaw),s=Math.sin(state.yaw),cp=Math.cos(state.pitch),sp=Math.sin(state.pitch),x=p[0]*c+p[2]*s,z=p[2]*c-p[0]*s;return [480+x*139,350-(p[1]*cp-z*sp)*139,z*cp+p[1]*sp];}
const circle=(center,radius,axis=0,n=40)=>Array.from({length:n+1},(_,i)=>{const p=center.slice(),a=i/n*Math.PI*2;p[(axis+1)%3]+=Math.cos(a)*radius;p[(axis+2)%3]+=Math.sin(a)*radius;return p;});
function factory(){const shapes=[];return{shapes,poly(points,color,alpha=.2){shapes.push({points,color,alpha,fill:true});},line(points,color,alpha=.6,width=1){shapes.push({points,color,alpha,width,fill:false});}};}
function world(a,r,phi){return [a-2.6,r*Math.cos(phi)+.1,r*Math.sin(phi)];}
function ground(g){
 g.poly([[-3,-1.04,-1.4],[3.1,-1.04,-1.4],[3.1,-1.04,1.4],[-3,-1.04,1.4]],[.11,.20,.22],.65);
 for(let x=-3;x<=3;x+=.5)g.line([[x,-1.035,-1.4],[x,-1.035,1.4]],cyan,.10,.65);
 for(let z=-1.4;z<=1.4;z+=.4)g.line([[-3,-1.035,z],[3,-1.035,z]],cyan,.10,.65);
 g.line([[-2.7,.1,0],[3,.1,0]],gold,.2,.8);
}
function caustic(g,s){
 const count=64,fan=traceFan(s.ior,s.aperture,count),env=envelope(fan),channels=s.dispersion?[[s.ior-.018,pink],[s.ior,gold],[s.ior+.018,cyan]]:[[s.ior,gold]];
 for(let lat=-3;lat<=3;lat++){const y=.72*lat/4;g.line(circle([-.6,y+.1,0],Math.sqrt(.72**2-y*y),1),cyan,.23,.8);}
 for(let phi=0;phi<Math.PI;phi+=Math.PI/8)g.line(Array.from({length:65},(_,i)=>{const t=i/64*Math.PI*2;return[-.6+.72*Math.cos(t),.1+.72*Math.sin(t)*Math.cos(phi),.72*Math.sin(t)*Math.sin(phi)];}),cyan,.22,.8);
 for(const [ior,color] of channels){
  const outline=envelope(traceFan(ior,s.aperture,count));
  for(let phi=0;phi<Math.PI*2;phi+=Math.PI/6)g.line(outline.map(([a,r])=>world(a,r,phi)),color,.65,1.5);
  for(let i=0;i<outline.length;i+=7){const[a,r]=outline[i];g.line(circle(world(a,0,0),r),color,.4,1);}
  for(let i=1;i<outline.length;i+=3)for(let j=0;j<12;j++){const ph=j/12*Math.PI*2,nph=(j+1)/12*Math.PI*2,a=outline[Math.max(0,i-3)],b=outline[i];g.poly([world(...a,ph),world(...b,ph),world(...b,nph),world(...a,nph)],color,.05);}
 }
 if(s.rays)for(let i=3;i<fan.length;i+=8)for(let phi=0;phi<Math.PI*2;phi+=Math.PI/2){const r=fan[i],end=add(r.exit,mul(r.out,(5.4-r.exit[0])/r.out[0]));g.line([world(0,0,0),world(...r.entry,phi),world(...r.exit,phi),world(...end,phi)],gold,.2,.8);}
 const x=s.slice;
 g.poly([[x,-.95,-.95],[x,.95,-.95],[x,.95,.95],[x,-.95,.95]],cyan,.06);
 g.line([[x,-.95,-.95],[x,.95,-.95],[x,.95,.95],[x,-.95,.95],[x,-.95,-.95]],cyan,.45,1);
 const rings=[];for(const r of fan){const distance=(x+2.6-r.exit[0])/r.out[0];if(distance<0)continue;const radius=Math.abs(r.exit[1]+distance*r.out[1]);if(radius<.95)rings.push(radius);}
 for(let i=0;i<rings.length;i+=2)g.line(circle([x,.1,0],rings[i]),gold,.16,.8);
 if(s.footprint)for(let j=0;j<8;j++){const phi=j/8*Math.PI*2;g.line(env.map(([a,r])=>{const p=world(a,r,phi);return[p[0],-1.025,p[2]];}),gold,.55,1);}
 return {family:'Snell ray fan → crossing envelope',equation:'det(dᵢ, dᵢ₊₁) → adjacent-ray intersection',detail:'A spherical lens bends an entire family of rays. Their forward crossings trace the caustic envelope. The cyan plane cuts the family; the gold floor drawing is its vertical footprint.',metric:`${fan.length} meridian rays · ${env.length} envelope samples`,fan,env,rings};
}
function planes(g,s){
 const u=[0,s.sweep*.48,0],v=[0,.14,s.sweep*.56],origin=[-2.35,.1,0],direction=norm([1,-.09,.18]),area=planeArea(u,v),count=s.planes;
 const corners=c=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>uvPoint(c,u,v,a,b));
 g.poly(corners(origin),gold,.35);g.line([...corners(origin),corners(origin)[0]],gold,.9,2);
 for(let i=0;i<count;i++){
  const t=(i+.5)/count*4.55,center=add(origin,mul(direction,t)),quad=corners(center),color=i%3===0?gold:cyan;
  g.poly(quad,color,.10);g.line([...quad,quad[0]],color,.42,1);
  if(s.rays)for(let j=0;j<4;j++)g.line([corners(origin)[j],quad[j]],gold,.15,.7);
  if(s.footprint){const shadow=quad.map(p=>[p[0],-1.025,p[2]]);g.poly(shadow,color,.07);g.line([...shadow,shadow[0]],color,.3,.8);}
 }
 const selected=add(origin,mul(direction,s.slice+.8)),quad=corners(selected);g.poly(quad,pink,.24);g.line([...quad,quad[0]],pink,.95,2);
 // One-dimensional normal kernel: two caps delimit a slab around a selected UV sweep.
 for(const d of [-s.radius/2,s.radius/2])g.line([...corners(add(selected,[d,0,0])),corners(add(selected,[d,0,0]))[0]],pink,.5,.9);
 return {family:'A sampled origin becomes an area',equation:'P(u,v,t) = L + u U + v V + t ω;  density = Φ / A',detail:'Release the emitter’s two position coordinates while retaining one direction and flight distance. A deposit becomes a UV plane. The pink slab makes the remaining one-dimensional kernel visible.',metric:`${count} swept planes · emitter area ${area.toFixed(2)} · Φ/A = ${(1/area).toFixed(3)} for unit power`,area};
}
function volume(g,s){
 const centers=Array.from({length:9},(_,i)=>{const t=i/8;return[-1.8+t*3.8,Math.sin(t*5.4)*.28+.1,Math.cos(t*5.4)*.38];}),n=s.planes,lo=-2.5,hi=2.65,dx=(hi-lo)/n;let disks=0,volumeEstimate=0;
 if(s.rays)g.line(centers,gold,.6,1.5);
 for(let i=0;i<n;i++){
  const x=lo+(i+.5)*dx,selected=Math.abs(x-s.slice)<dx*.6;
  g.poly([[x,-.85,-.95],[x,.85,-.95],[x,.85,.95],[x,-.85,.95]],cyan,selected?.065:s.luminous?.005:.02);
  if(selected)g.line([[x,-.85,-.95],[x,.85,-.95],[x,.85,.95],[x,-.85,.95],[x,-.85,-.95]],pink,.7,1.2);
  for(let j=0;j<centers.length;j++){
   const section=ballSection(centers[j],s.radius,x);if(!section)continue;disks++;volumeEstimate+=Math.PI*section.radius**2*dx;
   const color=j%3===0?gold:j%3===1?cyan:pink;
   // Opacity corrects for changing slice spacing, so more planes refine rather than brighten.
   const alpha=1-Math.exp(-dx*1.1);
   if(s.luminous){
    // Six nested vector disks approximate a soft radial kernel. This is a biased
    // display reconstruction, with spacing-aware opacity, not a density estimate.
    for(let layer=0;layer<6;layer++){const k=1-layer*.135,soft=1-Math.exp(-dx*.85);g.poly(circle(section.center,section.radius*k),color.map(c=>c+(1-c)*layer*.10),soft);}
   }else{g.poly(circle(section.center,section.radius),color,alpha*.6);g.line(circle(section.center,section.radius),color,.35,1);}
   if(s.footprint){const shadow=circle(section.center,section.radius).map(p=>[p[0],-1.025,p[2]]);g.poly(shadow,color,.04);}
  }
 }
 if(s.rays)for(const p of centers)for(const axis of[0,1,2])g.line(circle(p,s.radius,axis),gold,s.luminous?.09:.22,.8);
 return{family:'A stack of drawings acquires depth',equation:'r_slice² = r_ball² − (x − x_ball)²;  V ≈ Σ π r_slice² Δx',detail:'Nine diagnostic kernel balls intersect spatial planes. Each intersection is a disk, encoded as an ordinary Rive path. More planes refine the volume; no hidden 3D renderer is inside the exported file.',metric:`${n} planes · ${disks} disk sections · volume quadrature ${volumeEstimate.toFixed(3)} / ${(centers.length*4/3*Math.PI*s.radius**3).toFixed(3)}`,centers,volumeEstimate,disks};
}
export function buildScene(state){const g=factory();ground(g);const info=({caustic,planes,volume}[state.mode]||caustic)(g,state);return{...g,info};}
export function projectShapes(scene,state){
 const polys=[];
 for(const shape of scene.shapes){const points=shape.points.map(p=>project(p,state)),depth=points.reduce((n,p)=>n+p[2],0)/points.length;
  if(shape.fill)polys.push({points:points.map(p=>p.slice(0,2)),color:shape.color,alpha:shape.alpha,depth});
  else {
   const left=[],right=[];
   for(let i=0;i<points.length;i++){
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],p=points[i],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);if(l<1e-7)continue;
    const nx=-dy/l*shape.width*.5,ny=dx/l*shape.width*.5;left.push([p[0]+nx,p[1]+ny]);right.push([p[0]-nx,p[1]-ny]);
   }
   if(left.length>1)polys.push({points:[...left,...right.reverse()],color:shape.color,alpha:shape.alpha,depth});
  }
 }
 return polys.sort((a,b)=>a.depth-b.depth);
}
