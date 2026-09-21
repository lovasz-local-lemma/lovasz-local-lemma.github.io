// Finite 2D cross-section of an extruded equilateral prism. Coordinates match
// the garden shader (one unit is the height of its viewport, y points down).
// N-SF11 Sellmeier data: SCHOTT's optical-glass datasheet, February 2014.
export const PROFILE_SIZE=512, PATH_RECORDS=48, RECEIVER_Y=.446;
export const RECEIVER_MIN=-.8125,RECEIVER_MAX=.8125;
const TAU=2*Math.PI,EPS=1e-7;
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],mul=(a,s)=>[a[0]*s,a[1]*s],dot=(a,b)=>a[0]*b[0]+a[1]*b[1],cross=(a,b)=>a[0]*b[1]-a[1]*b[0],norm=a=>mul(a,1/Math.hypot(...a));
export const rotate=(p,a)=>[Math.cos(a)*p[0]-Math.sin(a)*p[1],Math.sin(a)*p[0]+Math.cos(a)*p[1]];
export function glassIndex(nm,dispersion=1){const x=(nm/1000)**2,B=[1.737596950,.313747346,1.898781010],C=[.013188707,.0623068142,155.23629];const n=wave=>Math.sqrt(1+B.reduce((sum,b,i)=>sum+b*wave/(wave-C[i]),0)),reference=n(.5876**2);return reference+(n(x)-reference)*dispersion;}
export function prismVertices(centre,angle){const r=.168;return [[-r,-r/Math.sqrt(3)],[r,-r/Math.sqrt(3)],[0,2*r/Math.sqrt(3)]].map(v=>add(centre,rotate(v,angle)));}
export function intersectPrism(origin,direction,vertices){let best=null;for(let i=0;i<3;i++){const a=vertices[i],edge=sub(vertices[(i+1)%3],a),den=cross(direction,edge);if(Math.abs(den)<EPS)continue;const offset=sub(a,origin),t=cross(offset,edge)/den,s=cross(offset,direction)/den;if(t>EPS&&s>=-EPS&&s<=1+EPS&&(!best||t<best.t))best={t,point:add(origin,mul(direction,t)),normal:norm([edge[1],-edge[0]]),face:i};}return best;}
// normal points into the incident medium; directions point along propagation.
export function refractRay(direction,normal,nFrom,nTo){const cosine=Math.max(0,Math.min(1,-dot(direction,normal))),eta=nFrom/nTo,k=1-eta*eta*(1-cosine*cosine);if(k<0)return null;return norm(add(mul(direction,eta),mul(normal,eta*cosine-Math.sqrt(k))));}
export function fresnelTransmission(direction,normal,nFrom,nTo){const ci=Math.max(0,Math.min(1,-dot(direction,normal))),eta=nFrom/nTo,k=1-eta*eta*(1-ci*ci);if(k<0)return 0;const ct=Math.sqrt(k),s=(nFrom*ci-nTo*ct)/(nFrom*ci+nTo*ct),p=(nTo*ci-nFrom*ct)/(nTo*ci+nFrom*ct);return 1-(s*s+p*p)/2;}
export function tracePrism({centre=[0,0],angle=0,direction=[.3,1],aperture=0,wavelength=550,dispersion=1,maxReflections=6,receiverY=RECEIVER_Y}={}){
 const vertices=prismVertices(centre,angle),incoming=norm(direction),side=[incoming[1],-incoming[0]],origin=add(add(centre,mul(incoming,-1.3)),mul(side,aperture));let hit=intersectPrism(origin,incoming,vertices);
 if(!hit)return {status:'miss',energy:0,segments:[]};const segments=[[origin,hit.point]],index=glassIndex(wavelength,dispersion);let energy=fresnelTransmission(incoming,hit.normal,1,index),ray=refractRay(incoming,hit.normal,1,index),point=hit.point,tir=0;
 for(let bounce=0;bounce<=maxReflections;bounce++){
  const next=intersectPrism(add(point,mul(ray,EPS*10)),ray,vertices);if(!next)return {status:'invalid',energy:0,segments,tir};segments.push([point,next.point]);const normal=mul(next.normal,-1),out=refractRay(ray,normal,index,1);
  if(out){energy*=fresnelTransmission(ray,normal,index,1);const distance=(receiverY-next.point[1])/out[1];if(distance<=0||!Number.isFinite(distance))return {status:'away',energy,segments,exit:next.point,direction:out,tir};const receiver=add(next.point,mul(out,distance));segments.push([next.point,receiver]);return {status:'receiver',receiver,energy,segments,exit:next.point,direction:out,tir};}
  if(tir>=maxReflections)break;
  tir++;ray=sub(ray,mul(next.normal,2*dot(ray,next.normal)));point=next.point;
 }
 return {status:'trapped',energy:0,segments,tir};
}
// Display RGB basis only. Ray directions and receiver positions use wavelength.
export function wavelengthColor(nm){const bell=(c,w)=>Math.exp(-.5*((nm-c)/w)**2);return [bell(615,43)+.16*bell(425,22),bell(540,34),bell(450,28)];}
export function buildPrismLight(controls,width=1040,height=640){
 const data=new Float32Array((PROFILE_SIZE+PATH_RECORDS)*4),centre=[(controls.lensX-width*.5)/height,(controls.lensY-height*.5)/height],angle=controls.rotation*TAU,dispersion=controls.chromaticSplit===0?0:controls.dispersion;
 const active=controls.lensShape===0&&controls.deskSpectrum!==0,direction=[Math.sin(26*Math.PI/180),Math.cos(26*Math.PI/180)],wavelengths=25,apertureSamples=13,apertureWidth=.009,binWidth=(RECEIVER_MAX-RECEIVER_MIN)/PROFILE_SIZE,kernel=.0018;
 const traces=[];let delivered=0,tir=0,away=0,pathIndex=0;
 if(active)for(let w=0;w<wavelengths;w++){const wavelength=410+w*280/(wavelengths-1),color=wavelengthColor(wavelength);for(let a=0;a<apertureSamples;a++){
   const ray=tracePrism({centre,angle,direction,aperture:((a+.5)/apertureSamples-.5)*apertureWidth,wavelength,dispersion});tir+=ray.tir||0;
   if(ray.status!=='receiver'){away++;continue;}const x=ray.receiver[0],weight=ray.energy/(wavelengths*apertureSamples);traces.push({wavelength,x,energy:weight,direction:ray.direction});
   if(x>=RECEIVER_MIN&&x<=RECEIVER_MAX)delivered+=weight;
   const lo=Math.max(0,Math.floor((x-kernel*4-RECEIVER_MIN)/binWidth)),hi=Math.min(PROFILE_SIZE-1,Math.ceil((x+kernel*4-RECEIVER_MIN)/binWidth));
   for(let j=lo;j<=hi;j++){const dx=RECEIVER_MIN+(j+.5)*binWidth-x,amount=weight*Math.exp(-.5*(dx/kernel)**2)/(Math.sqrt(2*Math.PI)*kernel);for(let c=0;c<3;c++)data[j*4+c]+=amount*color[c];data[j*4+3]+=amount;}
   if(a===Math.floor(apertureSamples/2)&&[3,12,21].includes(w)){for(let s=0;s<ray.segments.length&&pathIndex<PATH_RECORDS/2;s++){const [start,end]=ray.segments[s];data.set([...start,...end],PROFILE_SIZE*4+pathIndex*8);data.set([...color,ray.energy*(s===0?.45:1)],PROFILE_SIZE*4+pathIndex*8+4);pathIndex++;}}
 }}
 return {data,centre,angle,traces,stats:{rays:active?wavelengths*apertureSamples:0,delivered,tir,away,paths:pathIndex,dispersion,meanX:traces.length?traces.reduce((sum,r)=>sum+r.x*r.energy,0)/traces.reduce((sum,r)=>sum+r.energy,0):null}};
}
