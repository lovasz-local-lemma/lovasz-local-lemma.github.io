// Finite deterministic angular quadrature. Geometry is traced, never painted to
// resemble a caustic. Rendering this quadrature with clamped Jacobians is biased.
export const add=(a,b)=>a.map((x,i)=>x+b[i]);
export const sub=(a,b)=>a.map((x,i)=>x-b[i]);
export const mul=(a,s)=>a.map(x=>x*s);
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const norm=a=>mul(a,1/Math.hypot(...a));
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function refract(d,n,etaI,etaT){
  const c=Math.max(0,Math.min(1,-dot(d,n))),eta=etaI/etaT,k=1-eta*eta*(1-c*c);
  if(k<=0)return null;
  const ct=Math.sqrt(k),rs=(etaI*c-etaT*ct)/(etaI*c+etaT*ct),rp=(etaT*c-etaI*ct)/(etaT*c+etaI*ct);
  return {d:norm(add(mul(d,eta),mul(n,eta*c-ct))),weight:1-.5*(rs*rs+rp*rp)};
}
export function sphereHit(o,d,s,min=1e-5){
  const radii=s.axes||[s.r,s.r,s.r],q=sub(o,s.c).map((x,i)=>x/radii[i]),v=d.map((x,i)=>x/radii[i]);
  const A=dot(v,v),b=dot(q,v),c=dot(q,q)-1,h=b*b-A*c;
  if(h<0)return null;
  const root=Math.sqrt(h),a=(-b-root)/A,z=(-b+root)/A,t=a>min?a:z>min?z:null;
  return t===null?null:{t,p:add(o,mul(d,t))};
}
export const shapeNormal=(p,s)=>norm(sub(p,s.c).map((x,i)=>x/(s.axes?s.axes[i]**2:s.r*s.r)));
export const insideShape=(p,s,scale=1)=>sub(p,s.c).reduce((v,x,i)=>v+(x/(s.axes?.[i]||s.r))**2,0)<scale*scale;
// Retain medium segments and source-side optical length along the transmitted
// path, plus one bounded first-interface reflection. TIR continuation is omitted.
export function traceRay(source,d,spheres,ior){
  let o=source.slice(),L=0,air=0,power=1,reflection=null;const segments=[],glassSegments=[],signature=[];
  // A terminated continuation does not erase the illuminated exterior prefix.
  // Keep its topology distinct so sheets never bridge a transmitted/TIR boundary.
  const terminated=(reason,id)=>({segments,glassSegments,reflection,floor:null,signature:signature.join('/')+'|'+reason+':'+id,terminated:reason});
  for(let bounce=0;bounce<6;bounce++){
    let best=null,id=-1;
    spheres.forEach((s,i)=>{const h=sphereHit(o,d,s);if(h&&(!best||h.t<best.t)){best=h;id=i;}});
    const floor=d[1]<-1e-6?-o[1]/d[1]:100;
    if(!best||floor<best.t){
      const length=Math.min(floor,8),end=add(o,mul(d,length));
      segments.push({a:o,b:end,L0:L,L1:L+length,air0:air,air1:air+length,power,stage:signature.length,signature:signature.join('/'),d});
      return {segments,glassSegments,reflection,floor:floor<8?{p:end,L:L+floor,air:air+floor,power,stage:signature.length}:null,signature:signature.join('/')};
    }
    segments.push({a:o,b:best.p,L0:L,L1:L+best.t,air0:air,air1:air+best.t,power,stage:signature.length,signature:signature.join('/'),d});L+=best.t;air+=best.t;
    const s=spheres[id],normal=shapeNormal(best.p,s),enter=refract(d,normal,1,ior);
    if(!enter)return terminated('entry',id);
    // One explicitly bounded reflected branch at the first front interface.
    // It ends at the receiver, another glass body, or the 8 m display boundary.
    if(bounce===0){
      const rd=norm(sub(d,mul(normal,2*dot(d,normal)))),ro=add(best.p,mul(rd,1e-5));
      let length=rd[1]<-1e-6?-ro[1]/rd[1]:8,receiver=length<8;length=Math.min(8,length);
      for(const other of spheres){const hit=sphereHit(ro,rd,other);if(hit&&hit.t<length){length=hit.t;receiver=false;}}
      const end=add(ro,mul(rd,length)),rp=power*(1-enter.weight),seg={a:ro,b:end,L0:L,L1:L+length,air0:air,air1:air+length,power:rp,stage:0,signature:'R'+id,d:rd};
      reflection={segments:[seg],floor:receiver?{p:end,L:L+length,air:air+length,power:rp,stage:0}:null,signature:seg.signature};
    }
    const inside=add(best.p,mul(enter.d,1e-5)),exit=sphereHit(inside,enter.d,s);
    if(!exit)return terminated('intersection',id);
    glassSegments.push({a:best.p,b:exit.p,L0:L,L1:L+ior*(exit.t+1e-5),air0:air,air1:air,power:power*enter.weight,stage:signature.length+1,d:enter.d});
    const leave=refract(enter.d,mul(shapeNormal(exit.p,s),-1),ior,1);
    if(!leave)return terminated('tir',id);
    L+=ior*(exit.t+1e-5);power*=enter.weight*leave.weight*Math.exp(-.025*(exit.t+1e-5));
    o=add(exit.p,mul(leave.d,1e-5));L+=1e-5;air+=1e-5;d=leave.d;signature.push(id);
  }
  return terminated('budget',signature.length);
}
export const presets={
  jewel:{name:'The hourglass',spheres:[{c:[0,3.1,0],r:.78}],lights:[{p:[-.35,6.25,.05],target:[0,3.1,0],color:[.23,.95,1]}],camera:[7,4.3,8]},
  spectrum:{name:'Three chromatic fountains',spheres:[{c:[-2.1,2.75,0],r:.7},{c:[0,3.35,-.65],r:.85},{c:[2.1,2.75,0],r:.7}],lights:[{p:[-2.65,5.9,.3],target:[-2.1,2.75,0],color:[1,.23,.47]},{p:[-.25,6.8,-.5],target:[0,3.35,-.65],color:[.2,.8,1]},{p:[2.65,5.9,.3],target:[2.1,2.75,0],color:[1,.68,.13]}],camera:[8,4.8,10]},
  chain:{name:'Two separate focuses',spheres:[{c:[0,5.4,0],r:.75},{c:[0,2.5,0],r:.4}],lights:[{p:[0,8,0],target:[0,5.4,0],color:[.27,.72,1],aperture:.46}],camera:[7,5.5,11],target:[0,3.8,0]},
  overlap:{name:'Previous overlap: focus inside glass',spheres:[{c:[0,4.0,0],r:.65},{c:[.05,1.95,0],r:.88}],lights:[{p:[-.18,6.3,.05],target:[0,4,0],color:[.53,.45,1]}],camera:[7,4,8]}
};
export function buildTransport(scene,ior=1.5,rings=20,azimuth=100,steps=14){
  const empty=()=>({position:[],normal:[],direction:[],color:[],optical:[],air:[],stage:[],density:[]});
  const sheet=empty(),floor=empty(),reflectionSheet=empty(),reflectionFloor=empty(),rays=[],paths=[];
  let traced=0,rejected=0,joined=0;const stageRays=[0,0,0,0,0,0,0],signatures={};
  function triangle(store,vertices,color,flux,isFloor=false){
    const a=sub(vertices[1].p,vertices[0].p),b=sub(vertices[2].p,vertices[0].p),n=cross(a,b),area2=Math.hypot(...n);
    if(area2<1e-9)return;
    const normal=mul(n,1/area2),density=flux/(area2*.5);
    for(const v of vertices){store.position.push(...v.p);store.color.push(...mul(color,v.power));store.optical.push(v.L);store.air.push(v.air);store.stage.push(v.stage);store.density.push(density);if(!isFloor){store.normal.push(...normal);store.direction.push(...v.d);}}
    joined++;
  }
  for(const light of scene.lights){
    const axis=norm(sub(light.target,light.p)),u=norm(cross(axis,[0,0,1])),v=cross(axis,u),s=scene.spheres.reduce((a,b)=>Math.hypot(...sub(a.c,light.target))<Math.hypot(...sub(b.c,light.target))?a:b),angle=Math.asin(s.r/Math.hypot(...sub(s.c,light.p)))*(light.aperture??.96);
    const grid=[];
    for(let r=0;r<=rings;r++){
      const theta=angle*(r+.08)/(rings+.08),row=[];
      for(let a=0;a<=azimuth;a++){
        const phi=a/azimuth*2*Math.PI,d=norm(add(mul(axis,Math.cos(theta)),mul(add(mul(u,Math.cos(phi)),mul(v,Math.sin(phi))),Math.sin(theta))));
        const path=traceRay(light.p,d,scene.spheres,ior);traced++;if(!path)rejected++;row.push(path);
        if(path&&a<azimuth){const flux=Math.sin(theta)*angle/(rings+1)*2*Math.PI/azimuth/(2*Math.PI*(1-Math.cos(angle)));paths.push({path,color:light.color,flux});signatures[path.signature]=(signatures[path.signature]||0)+1;for(const seg of path.segments)stageRays[seg.stage]++;}
        if(path&&r===Math.floor(rings*.66)&&a%Math.max(1,Math.floor(azimuth/8))===0)rays.push({path,color:light.color});
      }grid.push(row);
    }
    // Each polar ring is a swept sheet parameterized by (azimuth, distance).
    for(let r=0;r<=rings;r++)for(let a=0;a<azimuth;a++){
      for(const reflected of [false,true]){
      const p=reflected?grid[r][a]?.reflection:grid[r][a],q=reflected?grid[r][a+1]?.reflection:grid[r][a+1];if(!p||!q||p.signature!==q.signature)continue;
      const theta=angle*(r+.08)/(rings+.08),dtheta=angle/(rings+1),dphi=2*Math.PI/azimuth;
      const angularWeight=Math.sin(theta)*dtheta*dphi/(2*Math.PI*(1-Math.cos(angle)));
      for(let k=0;k<Math.min(p.segments.length,q.segments.length);k++){
        const A=p.segments[k],B=q.segments[k];if(A.signature!==B.signature)continue;
        const length=.5*(A.L1-A.L0+B.L1-B.L0);
        for(let j=0;j<steps;j++){
          const at=(S,t)=>({p:add(S.a,mul(sub(S.b,S.a),t)),L:S.L0+(S.L1-S.L0)*t,air:S.air0+(S.air1-S.air0)*t,stage:S.stage,power:S.power,d:S.d});
          const x=at(A,j/steps),y=at(B,j/steps),z=at(A,(j+1)/steps),w=at(B,(j+1)/steps),flux=angularWeight*length/steps*.5;
          const target=reflected?reflectionSheet:sheet;
          triangle(target,[x,y,z],light.color,flux);triangle(target,[y,w,z],light.color,flux);
        }
      }
      }
    }
    // Project each finite angular cell onto the receiver. Flux / footprint area
    // makes the caustic focus emerge from the traced rays, including fold overlap.
    for(let r=0;r<rings;r++)for(let a=0;a<azimuth;a++){
      for(const reflected of [false,true]){
      const cell=[grid[r][a],grid[r][a+1],grid[r+1][a],grid[r+1][a+1]].map(p=>reflected?p?.reflection:p);
      if(cell.some(p=>!p?.floor)||new Set(cell.map(p=>p.signature)).size!==1)continue;
      const theta=angle*(r+.58)/(rings+.08),flux=Math.sin(theta)*angle/(rings+1)*2*Math.PI/azimuth/(2*Math.PI*(1-Math.cos(angle)));
      const vertices=cell.map(p=>({...p.floor,p:[p.floor.p[0],.012,p.floor.p[2]]}));
      const target=reflected?reflectionFloor:floor;
      triangle(target,[vertices[0],vertices[1],vertices[2]],light.color,flux*.5,true);triangle(target,[vertices[1],vertices[3],vertices[2]],light.color,flux*.5,true);
      }
    }
  }
  return {sheet,floor,reflectionSheet,reflectionFloor,rays,paths,stats:{traced,rejected,triangles:joined,sheetTriangles:sheet.position.length/9,floorTriangles:floor.position.length/9,reflectionTriangles:(reflectionSheet.position.length+reflectionFloor.position.length)/9,glassSegments:paths.reduce((n,p)=>n+p.path.glassSegments.length,0),stageRays,signatures}};
}
