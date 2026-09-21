/* Numerical kernels for masked gradient integration and explicit Fourier editing. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhotoEditModels=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 const luma=(r,g,b)=>.2126*r+.7152*g+.0722*b;
 function displayImage(image){
  const data=new Float32Array(image.data.length);
  for(let p=0;p<data.length;p+=3){const L=luma(image.data[p],image.data[p+1],image.data[p+2]),scale=1/(1+Math.max(0,L));for(let c=0;c<3;c++)data[p+c]=clamp(image.data[p+c]*scale);}
  return {w:image.w,h:image.h,data};
 }
 function gradientScene(image,{center=.69,source=.42,radius=.23,tint=.2}={}){
  const {w,h}=image,target={w,h,data:new Float32Array(image.data)},donor={w,h,data:new Float32Array(image.data.length)},mask=new Uint8Array(w*h);
  const cx=Math.round(center*(w-1)),cy=Math.round(.54*(h-1)),sx=Math.round(source*(w-1)),r=Math.max(2,radius*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const p=y*w+x,q=y*w+clamp(x+sx-cx,0,w-1);
   for(let c=0;c<3;c++){target.data[3*p+c]=clamp(image.data[3*p+c]*(1+tint*[.5,-.15,-.55][c])+tint*[.025,.005,0][c]);donor.data[3*p+c]=image.data[3*q+c];}
   mask[p]=+(x>0&&x<w-1&&y>0&&y<h-1&&((x-cx)/r)**2+((y-cy)/r)**2<1);
  }
  return {target,donor,mask,cx,cy,sx,r};
 }
 function poisson(target,source,mask,{mixed=false,gain=1,tolerance=1e-6,maxIterations=220}={}){
  const {w,h}=target,n=w*h,map=new Int32Array(n).fill(-1),pixels=[];
  if(source.w!==w||source.h!==h||mask.length!==n)throw new RangeError('Source, target, and mask sizes must agree.');
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=y*w+x;if(mask[p]){map[p]=pixels.length;pixels.push(p);}}
  const count=pixels.length,size=count*3,b=new Float64Array(size),u=new Float64Array(size),neighbors=new Int32Array(count*4),guide=new Float32Array(n),paste=new Float32Array(target.data);
  pixels.forEach((p,j)=>{const qs=[p-1,p+1,p-w,p+w];let magnitude=0;
   qs.forEach((q,k)=>{neighbors[j*4+k]=map[q];let srcNorm=0,dstNorm=0;for(let c=0;c<3;c++){srcNorm+=(gain*(source.data[3*p+c]-source.data[3*q+c]))**2;dstNorm+=(target.data[3*p+c]-target.data[3*q+c])**2;}
    const useTarget=mixed&&dstNorm>srcNorm;
    for(let c=0;c<3;c++){const g=useTarget?target.data[3*p+c]-target.data[3*q+c]:gain*(source.data[3*p+c]-source.data[3*q+c]);b[3*j+c]+=g+(map[q]<0?target.data[3*q+c]:0);magnitude+=g*g;}
   });
   guide[p]=Math.sqrt(magnitude/12);for(let c=0;c<3;c++){u[3*j+c]=target.data[3*p+c];paste[3*p+c]=source.data[3*p+c];}
  });
  const apply=(v,out)=>{for(let j=0;j<count;j++)for(let c=0;c<3;c++){let sum=4*v[3*j+c];for(let k=0;k<4;k++){const q=neighbors[j*4+k];if(q>=0)sum-=v[3*q+c];}out[3*j+c]=sum;}};
  const dot=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;};
  const r=new Float64Array(size),d=new Float64Array(size),ad=new Float64Array(size);apply(u,ad);for(let i=0;i<size;i++)d[i]=r[i]=b[i]-ad[i];
  const normB=Math.sqrt(dot(b,b)),threshold=tolerance*Math.max(normB,1e-12);let rr=dot(r,r),iterations=0;
  for(;iterations<maxIterations&&Math.sqrt(rr)>threshold;iterations++){
   apply(d,ad);const denominator=dot(d,ad);if(denominator<=1e-30)break;
   const alpha=rr/denominator;for(let i=0;i<size;i++){u[i]+=alpha*d[i];r[i]-=alpha*ad[i];}
   const next=dot(r,r),beta=next/rr;for(let i=0;i<size;i++)d[i]=r[i]+beta*d[i];rr=next;
  }
  const data=new Float32Array(target.data),residual=new Float32Array(n);apply(u,ad);let error=0,clipped=0;
  pixels.forEach((p,j)=>{let e=0;for(let c=0;c<3;c++){const value=u[3*j+c];data[3*p+c]=value;e+=(ad[3*j+c]-b[3*j+c])**2;clipped+=+(value<0||value>1);}residual[p]=Math.sqrt(e/3);error+=e;});
  return {w,h,data,paste,guide,residual,iterations,unknowns:count,relativeResidual:Math.sqrt(error)/Math.max(normB,1e-12),clipped:clipped/Math.max(1,size)};
 }
 function fft1(re,im,inverse=false){
  const n=re.length;if(n!==im.length||n<1||(n&(n-1)))throw new RangeError('FFT dimensions must be powers of two.');
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
  for(let length=2;length<=n;length<<=1){const angle=(inverse?2:-2)*Math.PI/length,wr=Math.cos(angle),wi=Math.sin(angle);for(let start=0;start<n;start+=length){let ur=1,ui=0;for(let j=0;j<length/2;j++){const a=start+j,b=a+length/2,vr=re[b]*ur-im[b]*ui,vi=re[b]*ui+im[b]*ur;re[b]=re[a]-vr;im[b]=im[a]-vi;re[a]+=vr;im[a]+=vi;const next=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=next;}}}
  if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
 }
 function fft2(re,im,w,h,inverse=false){
  if(re.length!==w*h||im.length!==w*h)throw new RangeError('FFT buffer shape mismatch.');
  for(let y=0;y<h;y++)fft1(re.subarray(y*w,(y+1)*w),im.subarray(y*w,(y+1)*w),inverse);
  const rr=new Float64Array(h),ii=new Float64Array(h);for(let x=0;x<w;x++){for(let y=0;y<h;y++){rr[y]=re[y*w+x];ii[y]=im[y*w+x];}fft1(rr,ii,inverse);for(let y=0;y<h;y++){re[y*w+x]=rr[y];im[y*w+x]=ii[y];}}
  return {re,im,w,h};
 }
 const power2=n=>2**Math.ceil(Math.log2(n));
 const reflect=(i,n)=>{if(n<2)return 0;const j=i%(2*(n-1));return j<n?j:2*(n-1)-j;};
 function spectrum(image){
  const w=power2(image.w),h=power2(image.h),channels=[];
  for(let c=0;c<3;c++){const re=new Float64Array(w*h),im=new Float64Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)re[y*w+x]=image.data[3*(reflect(y,image.h)*image.w+reflect(x,image.w))+c];channels.push(fft2(re,im,w,h));}
  return {w,h,image,channels};
 }
 function transfer(fx,fy,{mode='low',cutoff=.11,width=.045,soft=true,keepMean=true,notchX=.13,notchY=.04}={}){
  const r=Math.hypot(fx,fy),smooth=(distance,edge)=>soft?1/(1+Math.exp(clamp((distance-edge)/Math.max(.001,width*.22),-50,50))):+(distance<=edge);
  let value=1;
  if(mode==='low')value=smooth(r,cutoff);
  if(mode==='high')value=1-smooth(r,cutoff);
  if(mode==='band')value=smooth(r,cutoff+width*.5)*(1-smooth(r,Math.max(0,cutoff-width*.5)));
  if(mode==='notch'){const d1=Math.hypot(fx-notchX,fy-notchY),d2=Math.hypot(fx+notchX,fy+notchY);value=(1-smooth(d1,width))*(1-smooth(d2,width));}
  if(keepMean&&fx===0&&fy===0)value=1;
  return value;
 }
 function filterSpectrum(spec,options={}){
  const {w,h,image}=spec,n=w*h,mask=new Float32Array(n),amplitude=new Float32Array(n),data=new Float32Array(image.data.length),removed=new Float32Array(image.data.length);
  let originalEnergy=0,keptEnergy=0,imaginaryEnergy=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const fx=(x<=w/2?x:x-w)/w,fy=(y<=h/2?y:y-h)/h;mask[y*w+x]=transfer(fx,fy,options);}
  // Nyquist rows/columns represent their own wrapped negative frequencies. Enforce
  // the discrete conjugate pair explicitly, including those boundary cases.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=y*w+x,q=((h-y)%h)*w+(w-x)%w;if(p<=q)mask[p]=mask[q]=(mask[p]+mask[q])*.5;}
  for(let c=0;c<3;c++){
   const input=spec.channels[c],re=new Float64Array(n),im=new Float64Array(n);
   for(let i=0;i<n;i++){const e=input.re[i]**2+input.im[i]**2;originalEnergy+=e;keptEnergy+=e*mask[i]**2;amplitude[i]+=Math.sqrt(e)/3;re[i]=input.re[i]*mask[i];im[i]=input.im[i]*mask[i];}
   fft2(re,im,w,h,true);
   for(let y=0;y<image.h;y++)for(let x=0;x<image.w;x++){const p=y*image.w+x,q=y*w+x;data[3*p+c]=re[q];removed[3*p+c]=image.data[3*p+c]-re[q];imaginaryEnergy+=im[q]**2;}
  }
  let clipped=0;for(const v of data)clipped+=+(v<0||v>1);
  return {w:image.w,h:image.h,data,removed,pw:w,ph:h,mask,amplitude,energy:keptEnergy/Math.max(originalEnergy,1e-20),imaginaryRms:Math.sqrt(imaginaryEnergy/data.length),clipped:clipped/data.length};
 }
 return {clamp,luma,displayImage,gradientScene,poisson,fft1,fft2,spectrum,transfer,filterSpectrum};
});
