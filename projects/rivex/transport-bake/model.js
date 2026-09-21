import {presets,buildTransport,traceRay,add,sub,mul,norm,cross} from '../hourglass/transport.js';

export const profiles={
 coarse:{bins:16,size:128,photons:32768,radius:.09,ior:1.5,fog:.1,label:'Compact · 16 slices'},
 fine:{bins:64,size:256,photons:131072,radius:.035,ior:1.5,fog:.1,label:'Fine · 64 slices'}
};
export const config=profiles.coarse;
export const gateWeight=(length,center,width,enabled=true)=>enabled?Math.exp(-.5*((length-center)/Math.max(.004,width*.5))**2):1;
export function binWeights(model,center,width,enabled=true){return Float32Array.from({length:model.bins},(_,i)=>gateWeight(model.timeMin+i*model.timeStep,center,width,enabled));}

// This is a source-clock receiver bake. Each texel stores linear flux density;
// no exposure, tone curve or camera leg is baked into the field.
export async function buildBake(progress=()=>{},yieldWork=()=>new Promise(r=>setTimeout(r,0)),quality='coarse'){
 const scene=structuredClone(presets.jewel),c=profiles[quality]||config;progress('Tracing retained volume',0);await yieldWork();
 const transport=buildTransport(scene,c.ior,12,64,8);
 const light=scene.lights[0],body=scene.spheres[0],axis=norm(sub(light.target,light.p)),u=norm(cross(axis,[0,0,1])),v=cross(axis,u);
 const angle=Math.asin(body.r/Math.hypot(...sub(body.c,light.p)))*.96,cosine=Math.cos(angle),records=[];
 // Equal-solid-angle radial strata plus a golden-angle azimuth cover the cone
 // evenly. This is finite quadrature, not a claim of unbiased convergence.
 let xmin=Infinity,xmax=-Infinity,zmin=Infinity,zmax=-Infinity,timeMin=Infinity,timeMax=-Infinity;
 for(let i=0;i<c.photons;i++){
  const z=1-(i+.5)/c.photons*(1-cosine),phi=((i*.6180339887498949)%1)*2*Math.PI,r=Math.sqrt(1-z*z),dir=add(mul(axis,z),mul(add(mul(u,Math.cos(phi)),mul(v,Math.sin(phi))),r));
  const hit=traceRay(light.p,dir,scene.spheres,c.ior).floor;
  if(hit){records.push(hit.p[0],hit.p[2],hit.L,hit.air,hit.power,...light.color);xmin=Math.min(xmin,hit.p[0]);xmax=Math.max(xmax,hit.p[0]);zmin=Math.min(zmin,hit.p[2]);zmax=Math.max(zmax,hit.p[2]);timeMin=Math.min(timeMin,hit.L);timeMax=Math.max(timeMax,hit.L);}
  if(i%1024===1023){progress('Sampling the transmitted receiver field',.05+.4*i/c.photons);await yieldWork();}
 }
 if(!records.length)throw Error('No receiver intersections in fixed bake scene');
 const hits=new Float32Array(records),padding=c.radius*1.3; xmin-=padding;xmax+=padding;zmin-=padding;zmax+=padding;
 const bounds=[xmin,xmax,zmin,zmax],dx=(xmax-xmin)/c.size,dz=(zmax-zmin)/c.size,texelArea=dx*dz,timeStep=Math.max(1e-5,(timeMax-timeMin)/(c.bins-1));
 const atlas=new Float32Array(c.size*c.size*c.bins*4),binMass=new Float64Array(c.bins);let inputMass=0;
 for(let i=0;i<hits.length;i+=8){
  const [x,z,L,air,power,red,green,blue]=hits.subarray(i,i+8),q=Math.max(0,Math.min(c.bins-1,(L-timeMin)/timeStep)),lo=Math.floor(q),hi=Math.min(c.bins-1,lo+1),f=q-lo;
  const density=power*Math.exp(-c.fog*air)/c.photons,energy=density*(red+green+blue);inputMass+=energy;binMass[lo]+=energy*(1-f);binMass[hi]+=energy*f;
  const cells=[];let total=0;
  const x0=Math.max(0,Math.floor((x-c.radius-xmin)/dx)),x1=Math.min(c.size-1,Math.ceil((x+c.radius-xmin)/dx));
  const z0=Math.max(0,Math.floor((z-c.radius-zmin)/dz)),z1=Math.min(c.size-1,Math.ceil((z+c.radius-zmin)/dz));
  for(let zz=z0;zz<=z1;zz++)for(let xx=x0;xx<=x1;xx++){
   const r2=(((xx+.5)*dx+xmin-x)**2+((zz+.5)*dz+zmin-z)**2)/(c.radius*c.radius);if(r2>1)continue;
   const w=Math.exp(-4*r2);total+=w;cells.push([zz*c.size+xx,w]);
  }
  for(const [pixel,w]of cells){const value=density*w/(total*texelArea);for(const [bin,weight]of[[lo,1-f],[hi,f]]){const index=(bin*c.size*c.size+pixel)*4;atlas[index]+=red*value*weight;atlas[index+1]+=green*value*weight;atlas[index+2]+=blue*value*weight;}}
  if(i%(8*1024)===0){progress(`Baking ${c.bins} HDR receiver slices`,.45+.55*i/hits.length);await yieldWork();}
 }
 let atlasMass=0;for(let i=0;i<atlas.length;i+=4)atlasMass+=(atlas[i]+atlas[i+1]+atlas[i+2])*texelArea;
 // Preserve the exact finite drawing field in exports. Reopen does not retrace.
 const sheet=Object.fromEntries(Object.entries(transport.sheet).map(([k,values])=>[k,new Float32Array(values)]));
 progress('Ready',1);return {...c,quality,scene,sheet,hits,atlas,bounds,timeMin,timeMax,timeStep,texelArea,binMass:Array.from(binMass),inputMass,atlasMass,rays:transport.rays,stats:transport.stats};
}

export function receiverMass(model,center,width,enabled=true,atlas=false){
 if(atlas)return binWeights(model,center,width,enabled).reduce((sum,w,i)=>sum+w*model.binMass[i],0);
 let sum=0;const h=model.hits;
 for(let i=0;i<h.length;i+=8)sum+=h[i+4]*Math.exp(-model.fog*h[i+3])/model.photons*(h[i+5]+h[i+6]+h[i+7])*gateWeight(h[i+2],center,width,enabled);
 return sum;
}

export function fingerprint(array){let h=2166136261;for(const n of new Uint8Array(array.buffer,array.byteOffset,array.byteLength)){h^=n;h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
