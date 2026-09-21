// The bake keeps a diffuse factorization. The inverse material study mirrors
// the GPU's textured microfacet response so its residuals fit the shown image.
export const spheres = [[-.82,.72,0,.72],[.88,.55,.24,.55]];
export const RAD=Math.PI/180, BAKE_RANGE=4, STUDY_ZOOM=.72;
export const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const norm=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);};
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function light(theta){return [3.2*Math.sin(theta),3.6,3.2*Math.cos(theta)];}
export function intersectSphere(o,d,s){const q=sub(o,s),b=dot(q,d),h=b*b-dot(q,q)+s[3]*s[3];if(h<0)return 1e6;const r=Math.sqrt(h),t=-b-r;return t>.001?t:(-b+r>.001?-b+r:1e6);}
export function hit(o,d){let t=1e6,id=-1;for(let i=0;i<2;i++){const a=intersectSphere(o,d,spheres[i]);if(a<t){t=a;id=i;}}if(d[1]<-.0001){const a=-o[1]/d[1],p=o.map((v,i)=>v+a*d[i]);if(a>.001&&a<t&&Math.abs(p[0])<4&&Math.abs(p[2])<4){t=a;id=2;}}if(id<0)return null;const p=o.map((v,i)=>v+t*d[i]),n=id===2?[0,1,0]:norm(sub(p,spheres[id]));return {p,n,id};}
export function camera(yaw,zoom=1){const eye=[5.4*Math.sin(yaw)*.91*zoom,.62+2.48*zoom,5.4*Math.cos(yaw)*.91*zoom],f=norm(sub([0,.62,0],eye)),r=norm(cross(f,[0,1,0])),u=cross(r,f);return {eye,f,r,u};}
export function ray(c,x,y,aspect){return norm(c.f.map((v,i)=>v*2.1+c.r[i]*x*aspect+c.u[i]*y));}
export function irradiance(p,n,theta,power){const v=sub(light(theta),p),r2=dot(v,v),l=norm(v),nd=Math.max(0,dot(n,l));if(nd===0)return .075;const o=p.map((v,i)=>v+n[i]*.004);let vis=1;for(const s of spheres)if(intersectSphere(o,l,s)<Math.sqrt(r2)){vis=0;break;}return .075+vis*power*12*nd/r2;}
export function albedo(p,id,tint){if(id===0)return [.82*(1-tint)+.22*tint,.36*(1-tint)+.63*tint,.105*(1-tint)+.78*tint];if(id===1)return [.19,.62,.56];const check=((Math.floor(p[0]*2)+Math.floor(p[2]*2))%2+2)%2;return check?[.28,.32,.34]:[.43,.47,.47];}
export function sampleSurface(id,u,v){if(id===2)return {p:[u*8-4,0,v*8-4],n:[0,1,0]};const phi=(u-.5)*Math.PI*2,theta=v*Math.PI,n=[Math.sin(theta)*Math.cos(phi),Math.cos(theta),Math.sin(theta)*Math.sin(phi)],s=spheres[id];return {p:n.map((q,i)=>s[i]+s[3]*q),n};}
export function makeBake(theta,power,resolution=128){return [0,1,2].map(id=>{const size=id===2?resolution*2:resolution,data=new Uint8Array(size*size*4);let max=0;for(let y=0;y<size;y++)for(let x=0;x<size;x++){const {p,n}=sampleSurface(id,(x+.5)/size,(y+.5)/size),E=irradiance(p,n,theta,power);max=Math.max(max,E);const j=(y*size+x)*4;data[j]=Math.round(Math.min(1,E/BAKE_RANGE)*255);data[j+1]=data[j];data[j+2]=data[j];data[j+3]=255;}return {size,data,max};});}
export const materialNames=['Satin ceramic','Brushed metal','Glazed lacquer'];
export const textureNames=['Plain','Mokume bands','Woven inlay','Porcelain waves'];
export const appearanceDefaults={material:2,texture:1,roughness:.3,relief:.34,contrast:1};

// Object-space waves supply both colour and an analytic height gradient. The
// gradient bends the shading normal only: intersections and silhouettes stay
// spherical. Keep these functions paired with the GLSL implementation.
export function surfaceDetail(p,id,texture){
  const q=id===2?p:sub(p,spheres[id]);
  let value=.5,g=[0,0,0];
  if(texture===1){const phase=15*q[0]+3*Math.sin(7*q[1])+2*Math.sin(6*q[2]);value=.5+.5*Math.sin(phase);const d=.5*Math.cos(phase);g=[d*15,d*21*Math.cos(7*q[1]),d*12*Math.cos(6*q[2])];}
  else if(texture===2){const a=22*(q[0]+q[2]),b=18*q[1];value=.5+.5*Math.sin(a)*Math.sin(b);g=[11*Math.cos(a)*Math.sin(b),9*Math.sin(a)*Math.cos(b),11*Math.cos(a)*Math.sin(b)];}
  else if(texture===3){const phase=12*q[1]+2.4*Math.sin(5*q[0])+1.8*Math.sin(5*q[2]);value=.5+.5*Math.sin(phase);const d=.5*Math.cos(phase);g=[12*d*Math.cos(5*q[0]),12*d,9*d*Math.cos(5*q[2])];}
  return {value,g};
}
export function detailedSurface(p,n,id,tint,appearance){
  const {value,g}=surfaceDetail(p,id,appearance.texture),tangent=g.map((v,i)=>v-n[i]*dot(g,n));
  const normal=norm(n.map((v,i)=>v-.055*appearance.relief*tangent[i]));
  const base=albedo(p,id,tint),factor=appearance.texture===0?1:1-(appearance.contrast??1)*.68*(1-value);
  return {n:normal,a:base.map(v=>v*factor)};
}
export function surfaceRadiance(point,theta,power){
  if(!point.appearance)return point.a.map(v=>v*irradiance(point.p,point.n,theta,power));
  const {p,n,id,view,appearance,tint}=point,{n:ns,a}=detailedSurface(p,n,id,tint,appearance);
  const toLight=sub(light(theta),p),r2=dot(toLight,toLight),l=norm(toLight),v=view,h=norm(l.map((x,i)=>x+v[i]));
  const nl=Math.max(0,dot(ns,l)),nv=Math.max(.001,dot(ns,v)),nh=Math.max(0,dot(ns,h)),vh=Math.max(0,dot(v,h));
  const rough=Math.max(.09,appearance.roughness),alpha=rough*rough,a2=alpha*alpha,den=nh*nh*(a2-1)+1;
  const D=a2/(Math.PI*den*den),k=(rough+1)**2/8,G=nl/(nl*(1-k)+k)*nv/(nv*(1-k)+k);
  const metal=appearance.material===1?1:0,coat=appearance.material===2?.11:.045;
  const o=p.map((x,i)=>x+n[i]*.004),vis=spheres.some(s=>intersectSphere(o,l,s)<Math.sqrt(r2))?0:1;
  return a.map(c=>{const f0=metal?c:coat,F=f0+(1-f0)*(1-vh)**5;const spec=D*G*F/Math.max(.004,4*nl*nv);return c*.075+(c*(1-metal)*(1-F)+Math.PI*spec)*vis*power*12*nl/r2;});
}
export function probes(yaw,tint,width=80,height=52,appearance=null){const c=camera(yaw,appearance?STUDY_ZOOM:1),out=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++){const h=hit(c.eye,ray(c,(x+.5)/width*2-1,1-(y+.5)/height*2,width/height));if(h&&h.id<2){const a=albedo(h.p,h.id,tint);out.push({...h,a,tint,view:norm(sub(c.eye,h.p)),appearance:appearance?{...appearance}:null});}}return out;}
export function prediction(points,theta,power){const values=new Float64Array(points.length*3);points.forEach((p,i)=>{values.set(surfaceRadiance(p,theta,power),i*3);});return values;}
export function loss(a,b){let s=0;for(let i=0;i<a.length;i++)s+=(a[i]-b[i])**2;return s/a.length;}
// Illumination is affine in emitter power. Profile that variable analytically
// while surveying light angles; this gives sharp specular scenes a measured
// starting basin before the local two-variable solve.
export function profileLight(points,target,theta){const ambient=prediction(points,theta,0),unit=prediction(points,theta,1);let ab=0,bb=0;for(let i=0;i<target.length;i++){const b=unit[i]-ambient[i];ab+=b*(target[i]-ambient[i]);bb+=b*b;}const power=Math.max(.3,Math.min(1.8,ab/Math.max(bb,1e-12)));return {theta,power,loss:loss(prediction(points,theta,power),target)};}
// Damped Gauss–Newton, with a short backtracking line search. Both columns of J
// are actual central differences of this forward model, not a prescribed path.
export function fitStep(points,target,theta,power){const h=.005,q=.005,f=prediction(points,theta,power),ap=prediction(points,theta+h,power),am=prediction(points,theta-h,power),pp=prediction(points,theta,power+q),pm=prediction(points,theta,power-q);let aa=1e-5,ab=0,bb=1e-5,ga=0,gb=0;for(let i=0;i<f.length;i++){const a=(ap[i]-am[i])/(2*h),b=(pp[i]-pm[i])/(2*q),r=f[i]-target[i];aa+=a*a;ab+=a*b;bb+=b*b;ga+=a*r;gb+=b*r;}const det=aa*bb-ab*ab,da=Math.max(-.3,Math.min(.3,(-bb*ga+ab*gb)/det)),dp=Math.max(-.3,Math.min(.3,(ab*ga-aa*gb)/det));const before=loss(f,target);for(let scale=1;scale>=1/64;scale/=2){const a=Math.max(-125*RAD,Math.min(125*RAD,theta+da*scale)),p=Math.max(.3,Math.min(1.8,power+dp*scale)),after=loss(prediction(points,a,p),target);if(after<before)return {theta:a,power:p,loss:after,improved:true};}return {theta,power,loss:before,improved:false};}

// Parameter fitting uses one fixed set of visible surface probes. Geometry,
// camera, discrete material family and texture frequencies are known.
export const parameterBounds={theta:[-125*RAD,125*RAD],power:[.3,1.8],roughness:[.09,.8],relief:[0,1.5],tint:[0,1],contrast:[0,1]};
export const parameterNames={theta:'light angle',power:'emitter power',roughness:'roughness',relief:'bump relief',tint:'copper / blue',contrast:'texture contrast'};
export function predictionParameters(points,parameters){
  const values=new Float64Array(points.length*3);
  points.forEach((point,i)=>values.set(surfaceRadiance({...point,tint:parameters.tint,appearance:{...point.appearance,roughness:parameters.roughness,relief:parameters.relief,contrast:parameters.contrast}},parameters.theta,parameters.power),i*3));
  return values;
}
export function profileParameters(points,target,parameters,theta){
  const state={...parameters,theta},ambient=predictionParameters(points,{...state,power:0}),unit=predictionParameters(points,{...state,power:1});let ab=0,bb=0;
  for(let i=0;i<target.length;i++){const b=unit[i]-ambient[i];ab+=b*(target[i]-ambient[i]);bb+=b*b;}
  state.power=Math.max(.3,Math.min(1.8,ab/Math.max(bb,1e-12)));
  return {...state,loss:loss(predictionParameters(points,state),target)};
}
function linearSolve(matrix,rhs){
  const a=matrix.map((row,i)=>[...row,rhs[i]]),n=rhs.length;
  for(let k=0;k<n;k++){
    let pivot=k;for(let j=k+1;j<n;j++)if(Math.abs(a[j][k])>Math.abs(a[pivot][k]))pivot=j;
    if(Math.abs(a[pivot][k])<1e-16)return null;[a[k],a[pivot]]=[a[pivot],a[k]];
    const d=a[k][k];for(let j=k;j<=n;j++)a[k][j]/=d;
    for(let i=0;i<n;i++)if(i!==k){const q=a[i][k];for(let j=k;j<=n;j++)a[i][j]-=q*a[k][j];}
  }
  return a.map(row=>row[n]);
}
export function fitParametersStep(points,target,parameters,keys){
  const f=predictionParameters(points,parameters),before=loss(f,target),n=keys.length;
  const ranges=keys.map(key=>parameterBounds[key][1]-parameterBounds[key][0]);
  const columns=keys.map((key,j)=>{
    const h=.001*ranges[j],plus={...parameters,[key]:parameters[key]+h},minus={...parameters,[key]:parameters[key]-h};
    const fp=predictionParameters(points,plus),fm=predictionParameters(points,minus);
    return Float64Array.from(fp,(v,i)=>(v-fm[i])/(2*.001));
  });
  const H=Array.from({length:n},()=>Array(n).fill(0)),g=Array(n).fill(0);
  for(let i=0;i<f.length;i++)for(let a=0;a<n;a++){const ja=columns[a][i];g[a]+=ja*(f[i]-target[i]);for(let b=0;b<=a;b++)H[a][b]+=ja*columns[b][i];}
  for(let a=0;a<n;a++)for(let b=0;b<a;b++)H[b][a]=H[a][b];
  // Scale damping per column, then verify every candidate against image error.
  // This lets angle, colour and narrow highlights share one bounded solve.
  for(const damping of [1e-5,1e-3,.05,1]){
    const A=H.map((row,i)=>row.map((v,j)=>v+(i===j?damping*Math.max(H[i][i],1e-5)+1e-8:0))),step=linearSolve(A,g.map(v=>-v));
    if(!step)continue;
    for(let scale=1;scale>=1/32;scale/=2){
      const next={...parameters};keys.forEach((key,j)=>{const [lo,hi]=parameterBounds[key];next[key]=Math.max(lo,Math.min(hi,parameters[key]+Math.max(-.18,Math.min(.18,step[j]))*ranges[j]*scale));});
      const after=loss(predictionParameters(points,next),target);
      if(after<before)return {...next,loss:after,improved:true};
    }
  }
  return {...parameters,loss:before,improved:false};
}
