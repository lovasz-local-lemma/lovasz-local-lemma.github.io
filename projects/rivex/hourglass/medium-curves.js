// A finite-width slice of the traced photon track measure. This is a biased
// density visualization, not an unbiased radiance estimator or an image filter.
import {sub,add,mul,insideShape} from './transport.js';
export function buildMediumField(transport,scene,{z=0,fog=.1,nx=72,ny=112,bins=96}={}){
 const xmin=-4,xmax=4,ymin=.03,ymax=Math.max(...scene.lights.map(l=>l.p[1]))+.15;
 const dx=(xmax-xmin)/(nx-1),dy=(ymax-ymin)/(ny-1),sigma=.16;
 const maxL=Math.max(...transport.paths.map(s=>s.path.segments.at(-1).L1))+.05;
 const stages=Math.max(...transport.paths.map(s=>s.path.segments.at(-1).stage))+1;
 const values=Array.from({length:stages},()=>new Float32Array(nx*ny*bins));
 for(const sample of transport.paths)for(const seg of sample.path.segments){
  const delta=sub(seg.b,seg.a),length=Math.hypot(...delta),steps=Math.max(1,Math.ceil(length/.065));
  const luminance=.2126*sample.color[0]+.7152*sample.color[1]+.0722*sample.color[2];
  for(let k=0;k<steps;k++){
   const t=(k+.5)/steps,p=add(seg.a,mul(delta,t)),slice=Math.exp(-.5*((p[2]-z)/sigma)**2);
   if(slice<1e-5)continue;
   const gx=(p[0]-xmin)/dx,gy=(p[1]-ymin)/dy,ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy;
   const optical=seg.L0+(seg.L1-seg.L0)*t,gb=optical/maxL*(bins-1),ib=Math.floor(gb),fb=gb-ib;
   const air=seg.air0+(seg.air1-seg.air0)*t;
   const weight=sample.flux*seg.power*luminance*length/steps*slice*Math.exp(-fog*air)/(dx*dy*sigma*Math.sqrt(2*Math.PI));
   const buffer=values[seg.stage];
   for(let y=0;y<2;y++)for(let x=0;x<2;x++){
    const cx=ix+x,cy=iy+y;if(cx<0||cx>=nx||cy<0||cy>=ny)continue;
    const at=(cy*nx+cx)*bins+ib,w=weight*(x?fx:1-fx)*(y?fy:1-fy);
    buffer[at]+=w*(1-fb);if(ib+1<bins)buffer[at+1]+=w*fb;
   }
  }
 }
 const field={nx,ny,bins,xmin,xmax,ymin,ymax,z,maxL,values,scene,dx,dy};
 const raw=evaluateMediumField(field,{gate:false,filter:-1});
 // A fixed reference for each rebuilt scene; sweeping a gate cannot brighten a
 // weak pulse by renormalizing it independently on each frame.
 field.reference=Math.max(...raw)*.14;
 return field;
}
export function evaluateMediumField(field,{gate=false,arrival=0,width=.7,clock=0,eye=[0,0,0],filter=-1}={}){
 const {nx,ny,bins,maxL,values}=field,result=new Float32Array(nx*ny),weights=new Float32Array(bins);
 const selected=filter<0?values:values[filter]?[values[filter]]:[];
 const fillWeights=shift=>{for(let b=0;b<bins;b++)weights[b]=gate?Math.exp(-.5*((b/(bins-1)*maxL+shift-arrival)/Math.max(width*.5,.02))**2):1;};
 fillWeights(0);
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  const i=y*nx+x,p=[field.xmin+x*field.dx,field.ymin+y*field.dy,field.z];
  if(clock&&gate)fillWeights(Math.hypot(...sub(eye,p)));
  let sum=0;for(const data of selected){const base=i*bins;for(let b=0;b<bins;b++)sum+=data[base+b]*weights[b];}result[i]=sum;
 }
 // Small separable tent kernel: explicit world-space bandwidth, independent of
 // screen resolution. It reduces angular quadrature banding, with known bias.
 const horizontal=new Float32Array(result.length),blurred=new Float32Array(result.length);
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){let sum=0,w=0;for(let d=-2;d<=2;d++)if(x+d>=0&&x+d<nx){const k=3-Math.abs(d);sum+=result[y*nx+x+d]*k;w+=k;}horizontal[y*nx+x]=sum/w;}
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){let sum=0,w=0;for(let d=-2;d<=2;d++)if(y+d>=0&&y+d<ny){const k=3-Math.abs(d);sum+=horizontal[(y+d)*nx+x]*k;w+=k;}const p=[field.xmin+x*field.dx,field.ymin+y*field.dy,field.z];blurred[y*nx+x]=field.scene.spheres.some(s=>insideShape(p,s))?0:sum/w;}
 return blurred;
}
export function fieldSample(field,values,x,y){
 const gx=(x-field.xmin)/field.dx,gy=(y-field.ymin)/field.dy,ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy;
 if(ix<0||iy<0||ix+1>=field.nx||iy+1>=field.ny)return 0;
 const i=iy*field.nx+ix;return values[i]*(1-fx)*(1-fy)+values[i+1]*fx*(1-fy)+values[i+field.nx]*(1-fx)*fy+values[i+field.nx+1]*fx*fy;
}
