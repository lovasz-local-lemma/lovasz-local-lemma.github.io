/* Small, inspectable computational-photography models; shared by UI and Node checks. */
(() => {
 'use strict';
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
 function random(seed=1){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
 const luminance=(r,g,b)=>.2126*r+.7152*g+.0722*b;
 function radianceScene(w=192,h=112){const data=new Float32Array(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=x/w,v=y/h,checker=(Math.floor(u*22)+Math.floor(v*14))%2;let c=[.008+.012*checker,.012+.012*checker,.018+.02*checker];
  const glow=1.5*Math.exp(-((u-.72)**2+(v-.28)**2)/.055);c=c.map((q,i)=>q+glow*[.55,.8,1.4][i]);
  if(u>.59&&u<.9&&v>.1&&v<.49){const grid=(Math.floor((u-.59)*50)%5===0||Math.floor((v-.1)*40)%5===0);c=grid?[1.7,2.4,3.4]:[22+30*u,31+36*v,60];}
  const dx=(u-.33)/.23,dy=(v-.58)/.31,r=Math.hypot(dx,dy);
  if(r<1){const z=Math.sqrt(1-r*r),shine=65*Math.exp(-((dx+.42)**2+(dy+.44)**2)/.008),engraving=.62+.38*(.5+.5*Math.sin(28*Math.atan2(dy,dx)+r*14));c=[.32,.12,.045].map(q=>q*(.1+2.8*z)*engraving+shine);}
  if(v>.85){const step=Math.floor(u*12),level=.006*2**step;c=[level,level*.88,level*.66];}
  data.set(c,(y*w+x)*3);
 }return {w,h,data};}
 function exposures(scene,spacing=3,noise=0,seed=12){const times=[2**(-spacing-2),.25,2**(spacing-2)],rng=random(seed);return times.map(t=>{const data=new Float32Array(scene.data.length);for(let i=0;i<data.length;i++){const sensor=clamp(scene.data[i]*t+(rng()-.5)*noise/255);data[i]=Math.round(255*sensor**(1/2.2))/255;}return {t,data};});}
 const wellExposed=z=>z<=1/255||z>=254/255?0:1-Math.abs(2*z-1);
 function merge(brackets){const count=brackets[0].data.length,out=new Float32Array(count),fusion=new Float32Array(count),valid=new Uint8Array(count),dominant=new Uint8Array(count);for(let i=0;i<count;i++){
  let sum=0,den=0,best=-1,index=0,display=0;
  for(let j=0;j<brackets.length;j++){const b=brackets[j],z=b.data[i],weight=wellExposed(z);sum+=weight*(Math.log(Math.max(z,1e-12))*2.2-Math.log(b.t));den+=weight;display+=weight*z;if(weight>best){best=weight;index=j;}}
  if(den>1e-12){out[i]=Math.exp(sum/den);fusion[i]=display/den;valid[i]=1;dominant[i]=index;}
  else {const allBright=brackets.every(b=>b.data[i]>=.5),b=allBright?brackets.reduce((a,b)=>a.t<b.t?a:b):brackets.reduce((a,b)=>a.t>b.t?a:b);out[i]=b.data[i]**2.2/b.t;fusion[i]=b.data[i];dominant[i]=3;}
 }return {data:out,fusion,valid,dominant};}
 function tone(data,exposure=0,method='reinhard',white=8){const out=new Float32Array(data.length),gain=2**exposure;for(let i=0;i<data.length;i+=3){const l=luminance(data[i],data[i+1],data[i+2])*gain,mapped=method==='log'?Math.log1p(l)/Math.log1p(white):l/(1+l),scale=l>1e-12?mapped/l:0;for(let c=0;c<3;c++)out[i+c]=clamp(data[i+c]*gain*scale)**(1/2.2);}return out;}
 function hdrStats(scene,merged){let covered=0,error=0,n=0,min=Infinity,max=0;for(let i=0;i<scene.data.length;i++){const r=scene.data[i];if(r>0)min=Math.min(min,r);max=Math.max(max,r);if(merged.valid[i]&&r>0){error+=(Math.log2(Math.max(merged.data[i],1e-12)/r))**2;n++;}if(i%3===0&&merged.valid[i]&&merged.valid[i+1]&&merged.valid[i+2])covered++;}return {covered:covered/(scene.w*scene.h),logRmse:Math.sqrt(error/Math.max(1,n)),stops:max>0?Math.log2(max/min):0};}
 function sample(image,x,y){const {w,h,data}=image;if(x<0||x>w-1||y<0||y>h-1)return null;const ix=Math.floor(x),iy=Math.floor(y),xx=Math.min(ix+1,w-1),yy=Math.min(iy+1,h-1),fx=x-ix,fy=y-iy,out=[];for(let c=0;c<3;c++)out[c]=(1-fy)*((1-fx)*data[(iy*w+ix)*3+c]+fx*data[(iy*w+xx)*3+c])+fy*((1-fx)*data[(yy*w+ix)*3+c]+fx*data[(yy*w+xx)*3+c]);return out;}
 const disparities={far:-11,middle:0,near:11};
 function layerColor(layer,x,y,w,h){const u=x/w,v=y/h;if(layer==='far'){const grid=(Math.floor(x/7)+Math.floor(y/7))%2;return [.08+.09*grid,.19+.18*grid,.38+.22*grid];}
  if(layer==='middle'){const r=Math.hypot((u-.54)/.23,(v-.55)/.32);if(r>.98)return null;const stripe=.4+.6*(.5+.5*Math.sin(x*.7+y*.2));return [.85*stripe,.49*stripe,.15*stripe];}
  const leaf=((u-.24)/.16)**2+((v-.5)/.32)**2<1;if(!leaf||Math.sin(y*.47+x*.11)<-.78)return null;const stripe=.5+.5*(.5+.5*Math.sin(x*1.25));return [.2*stripe,.81*stripe,.63*stripe];
 }
 function photoLayer(texture,name,x,y,w,h){const u=x/w,v=y/h;
  if(name==='far')return sample(texture,clamp(u)*(texture.w-1),clamp(v)*(texture.h-1));
  const near=name==='near',cx=near?.28:.57,cy=near?.56:.54,rx=near?.16:.22,ry=near?.29:.35,dx=(u-cx)/rx,dy=(v-cy)/ry;if(dx*dx+dy*dy>1)return null;
  const tx=near?.625:.38,ty=near?.70:.56,sx=near?.065:.105,sy=near?.115:.185;
  return sample(texture,(tx+dx*sx)*(texture.w-1),(ty+dy*sy)*(texture.h-1));
 }
 function photoField(texture,w,h,views,layer,disparityScale){const margin=Math.ceil(11*disparityScale)+2,sw=w+2*margin,planes=[];
  for(const name of ['far','middle','near']){if(layer!=='all'&&name!==layer)continue;const data=new Float32Array(sw*h*4);for(let y=0;y<h;y++)for(let x=0;x<sw;x++){const color=photoLayer(texture,name,x+.5-margin,y+.5,w,h);if(color){const i=(y*sw+x)*4;data[i]=color[0];data[i+1]=color[1];data[i+2]=color[2];data[i+3]=1;}}planes.push({data,disparity:disparities[name]*disparityScale});}
  const images=[];for(let j=0;j<views;j++){const u=-1+2*j/(views-1),data=new Float32Array(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let r=.035,g=.05,b=.075;for(const plane of planes){const xx=x-plane.disparity*u+margin,ix=Math.floor(xx),f=xx-ix,i=(y*sw+ix)*4,k=i+4,a=plane.data,alpha=a[i+3]*(1-f)+a[k+3]*f;r=a[i]*(1-f)+a[k]*f+r*(1-alpha);g=a[i+1]*(1-f)+a[k+1]*f+g*(1-alpha);b=a[i+2]*(1-f)+a[k+2]*f+b*(1-alpha);}const i=(y*w+x)*3;data[i]=r;data[i+1]=g;data[i+2]=b;}images.push({w,h,data,u});}return {w,h,images,layer,disparityScale};
 }
 function lightField({w=176,h=104,views=25,layer='all',texture=null,disparityScale=1}={}){if(texture)return photoField(texture,w,h,views,layer,disparityScale);const images=[];for(let j=0;j<views;j++){const u=-1+2*j/(views-1),data=new Float32Array(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let color=[.035,.05,.075];for(const name of ['far','middle','near']){if(layer!=='all'&&name!==layer)continue;const c=layerColor(name,x+.5-disparities[name]*disparityScale*u,y+.5,w,h);if(c)color=c;}data.set(color,(y*w+x)*3);}images.push({w,h,data,u});}return {w,h,images,layer,disparityScale};}
 function refocus(field,focus=11,aperture=1,profile='uniform'){const {w,h}=field,out=new Float32Array(w*h*3),views=field.images.filter(image=>Math.abs(image.u)<=aperture+1e-8);let variance=0,count=0;
  const weights=views.map(image=>profile==='gaussian'&&aperture>0?Math.exp(-2*(image.u/aperture)**2):1);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let red=0,green=0,blue=0,n=0,sumLum=0,sumSquare=0;
   for(let j=0;j<views.length;j++){const image=views[j],xx=x+focus*image.u;if(xx<0||xx>w-1)continue;const ix=Math.floor(xx),right=Math.min(ix+1,w-1),f=xx-ix,i=(y*w+ix)*3,k=(y*w+right)*3,a=image.data,weight=weights[j],r=a[i]*(1-f)+a[k]*f,g=a[i+1]*(1-f)+a[k+1]*f,b=a[i+2]*(1-f)+a[k+2]*f,l=luminance(r,g,b);red+=weight*r;green+=weight*g;blue+=weight*b;sumLum+=weight*l;sumSquare+=weight*l*l;n+=weight;}
   if(n){const i=(y*w+x)*3;out[i]=red/n;out[i+1]=green/n;out[i+2]=blue/n;variance+=Math.max(0,sumSquare/n-(sumLum/n)**2);count++;}
  }return {w,h,data:out,views:views.length,variance:variance/Math.max(1,count)};}
 function epi(field,row,focus=0,aperture=1){const images=field.images.filter(image=>Math.abs(image.u)<=aperture+1e-8),w=field.w,h=images.length,data=new Float32Array(w*h*3);images.forEach((image,j)=>{for(let x=0;x<w;x++){const c=sample(image,x+focus*image.u,row);if(c)data.set(c,(j*w+x)*3);}});return {w,h,data};}
 function transform(t,p){return [t.a*p[0]-t.b*p[1]+t.tx,t.b*p[0]+t.a*p[1]+t.ty];}
 function inverse(t,p){const d=t.a*t.a+t.b*t.b;if(d<1e-14)return null;const x=p[0]-t.tx,y=p[1]-t.ty;return [(t.a*x+t.b*y)/d,(-t.b*x+t.a*y)/d];}
 function fit(pairs){if(pairs.length<2)return null;const mean=[0,0,0,0];pairs.forEach(p=>[...p.p,...p.q].forEach((v,i)=>mean[i]+=v/pairs.length));let den=0,a=0,b=0;for(const {p,q} of pairs){const x=p[0]-mean[0],y=p[1]-mean[1],u=q[0]-mean[2],v=q[1]-mean[3];den+=x*x+y*y;a+=x*u+y*v;b+=x*v-y*u;}if(den<1e-10)return null;a/=den;b/=den;if(a*a+b*b<1e-12)return null;return {a,b,tx:mean[2]-a*mean[0]+b*mean[1],ty:mean[3]-b*mean[0]-a*mean[1]};}
 const residual=(model,pair)=>{const q=transform(model,pair.p);return Math.hypot(q[0]-pair.q[0],q[1]-pair.q[1]);};
 function ransac(pairs,{threshold=2.5,iterations=160,seed=41}={}){if(pairs.length<3)return {model:null,inliers:[],reason:'At least three correspondences are required.'};const rng=random(seed);let best=null,bestIn=[],bestCost=Infinity;for(let i=0;i<iterations;i++){let a=Math.floor(rng()*pairs.length),b=Math.floor(rng()*(pairs.length-1));if(b>=a)b++;const model=fit([pairs[a],pairs[b]]);if(!model)continue;const inliers=[],errors=pairs.map(p=>residual(model,p));errors.forEach((e,k)=>{if(e<=threshold)inliers.push(k);});const cost=errors.reduce((s,e)=>s+Math.min(e*e,threshold*threshold),0);if(inliers.length>bestIn.length||(inliers.length===bestIn.length&&cost<bestCost)){best=model;bestIn=inliers;bestCost=cost;}}
  if(bestIn.length<3)return {model:null,inliers:[],reason:'No consensus with at least three matches.'};
  for(let pass=0;pass<3;pass++){const refined=fit(bestIn.map(i=>pairs[i]));if(!refined)break;const inliers=[];pairs.forEach((p,i)=>{if(residual(refined,p)<=threshold)inliers.push(i);});if(inliers.length<3)break;best=refined;const unchanged=bestIn.join()===inliers.join();bestIn=inliers;if(unchanged)break;}
  return {model:best,inliers:bestIn,residuals:pairs.map(p=>residual(best,p)),reason:''};
 }
 function correspondences({w=240,h=150,outliers=.4,noise=1,seed=7,count=48,model=null}={}){const rng=random(seed),a=12*Math.PI/180,truth=model||{a:1.03*Math.cos(a),b:1.03*Math.sin(a),tx:22,ty:-14},pairs=[];for(let i=0;i<count;i++){
  const isOutlier=i<Math.round(count*outliers);let p,q,attempts=0;
  do {p=[20+rng()*(w-65),20+rng()*(h-40)];q=transform(truth,p);if(isOutlier){q=[rng()*w,rng()*h];}else{q[0]+=(rng()-.5)*2*noise;q[1]+=(rng()-.5)*2*noise;}if(++attempts>256)throw new Error('No visible correspondence in this image geometry');}while(!isOutlier&&(q[0]<1||q[0]>w-2||q[1]<1||q[1]>h-2));
  pairs.push({p,q,isOutlier});
 }return {pairs,truth,w,h};}
 function warp(image,model,w=image.w,h=image.h){const data=new Float32Array(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=inverse(model,[x,y]),color=p&&sample(image,...p);if(color)data.set(color,(y*w+x)*3);}return {w,h,data};}
 function mosaic(a,b,model){const pad=30,w=a.w+pad*2,h=a.h,data=new Float32Array(w*h*3);if(!model)return {w,h,data};for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=[x-pad,y],q=transform(model,p),ca=sample(a,...p),cb=sample(b,...q);if(!ca&&!cb)continue;let wa=ca?Math.max(.01,Math.min(p[0],a.w-1-p[0],p[1],a.h-1-p[1])):0,wb=cb?Math.max(.01,Math.min(q[0],b.w-1-q[0],q[1],b.h-1-q[1])):0;for(let c=0;c<3;c++)data[(y*w+x)*3+c]=((ca?.[c]||0)*wa+(cb?.[c]||0)*wb)/(wa+wb);}return {w,h,data};}
 function decodeRGBE(bytes,w,h){if(bytes.length!==w*h*4)throw Error('RGBE dimensions do not match the buffer');const data=new Float32Array(w*h*3);for(let i=0;i<w*h;i++){const e=bytes[4*i+3],scale=e?2**(e-136):0;for(let c=0;c<3;c++)data[3*i+c]=bytes[4*i+c]*scale;}return {w,h,data};}
 function resize(image,w,h){w=Math.max(1,Math.round(w));h=Math.max(1,Math.round(h));const data=new Float32Array(w*h*3),sx=image.w/w,sy=image.h/h;
  // Area averaging preserves linear exposure energy when reducing resolution.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let weight=0;const sum=[0,0,0];for(let yy=Math.floor(y*sy);yy<Math.ceil((y+1)*sy);yy++)for(let xx=Math.floor(x*sx);xx<Math.ceil((x+1)*sx);xx++){const a=Math.max(0,Math.min(xx+1,(x+1)*sx)-Math.max(xx,x*sx))*Math.max(0,Math.min(yy+1,(y+1)*sy)-Math.max(yy,y*sy));if(xx>=image.w||yy>=image.h)continue;for(let c=0;c<3;c++)sum[c]+=image.data[(yy*image.w+xx)*3+c]*a;weight+=a;}for(let c=0;c<3;c++)data[(y*w+x)*3+c]=sum[c]/weight;}return {w,h,data};
 }
 function stitchPair(source){const w=Math.floor(source.w*.6),h=Math.floor(source.h*.72),ax=source.w*.02,ay=(source.h-h)/2,bx=source.w*.68,by=source.h/2,angle=.065,c=Math.cos(angle),s=Math.sin(angle),a={w,h,data:new Float32Array(w*h*3)},b={w,h,data:new Float32Array(w*h*3)};
  const truth={a:c,b:-s,tx:c*(ax-bx)+s*(ay-by)+w/2,ty:-s*(ax-bx)+c*(ay-by)+h/2};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const ca=sample(source,x+ax,y+ay),u=x-w/2,v=y-h/2,cb=sample(source,c*u-s*v+bx,s*u+c*v+by);if(ca)a.data.set(ca,(y*w+x)*3);if(cb)b.data.set(cb,(y*w+x)*3);}
  return {a,b,truth,viewport:{w:source.w,h:source.h,x:-ax,y:-ay},source};
 }
 function stitch(a,b,model,viewport,mode='feather'){
  const {w,h}=viewport,data=new Float32Array(w*h*3),mask=new Uint8Array(w*h);let error=0,overlap=0;
  if(!model)return {w,h,data,mask,overlap:0,overlapRmse:NaN};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=[x+viewport.x,y+viewport.y],q=transform(model,p),ca=sample(a,...p),cb=sample(b,...q),i=y*w+x;if(!ca&&!cb)continue;mask[i]=ca&&cb?3:ca?1:2;
    let wa=ca?Math.max(.01,Math.min(p[0],a.w-1-p[0],p[1],a.h-1-p[1])):0,wb=cb?Math.max(.01,Math.min(q[0],b.w-1-q[0],q[1],b.h-1-q[1])):0;
    if(ca&&cb){overlap++;for(let ch=0;ch<3;ch++)error+=(ca[ch]-cb[ch])**2;}
    for(let ch=0;ch<3;ch++)data[i*3+ch]=mode==='difference'&&ca&&cb?Math.min(1,Math.abs(ca[ch]-cb[ch])*4):mode==='seam'?(wa>=wb?(ca?.[ch]||0):(cb?.[ch]||0)):((ca?.[ch]||0)*wa+(cb?.[ch]||0)*wb)/(wa+wb);
  }return {w,h,data,mask,overlap,overlapRmse:overlap?Math.sqrt(error/(overlap*3)):NaN};
 }
 function quadRay(camera,u,v,x,y){const {origin,forward,right,up,focusDistance,halfAperture,width,height,fovDegrees}=camera,halfHeight=Math.tan(fovDegrees*Math.PI/360)*focusDistance,xx=(2*x/width-1)*width/height*halfHeight,yy=(1-2*y/height)*halfHeight;
  const start=origin.map((a,k)=>a+halfAperture*(u*right[k]+v*up[k])),target=origin.map((a,k)=>a+focusDistance*forward[k]+xx*right[k]+yy*up[k]),delta=target.map((a,k)=>a-start[k]),len=Math.hypot(...delta);return {origin:start,direction:delta.map(a=>a/len)};
 }
 function quadDisparity(camera,depth,width=camera.width){return (width/camera.width)*camera.height/(2*Math.tan(camera.fovDegrees*Math.PI/360))*camera.halfAperture*(1/camera.focusDistance-1/depth);}
 function quadSelection(images,aperture=1,shape='square',profile='uniform'){
  const distance=image=>shape==='disk'?Math.hypot(image.u,image.v):Math.max(Math.abs(image.u),Math.abs(image.v)),nearest=Math.min(...images.map(distance)),radius=Math.max(aperture,nearest),chosen=images.filter(im=>distance(im)<=radius+1e-7);
  return chosen.map(image=>({image,weight:profile==='gaussian'?Math.exp(-2*(image.u*image.u+image.v*image.v)/Math.max(radius*radius,1e-8)):1}));
 }
 function quadRefocus(field,depth,aperture=1,shape='square',profile='uniform',width=field.w){const w=Math.min(field.w,width),h=Math.round(w*field.h/field.w),data=new Float32Array(w*h*3),selected=quadSelection(field.images,aperture,shape,profile),d=quadDisparity(field.camera,depth),sx=field.w/w,sy=field.h/h;let coverage=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let red=0,green=0,blue=0,den=0;for(const {image,weight} of selected){const px=(x+.5)*sx-.5+d*image.u,py=(y+.5)*sy-.5-d*image.v;if(px<0||py<0||px>field.w-1||py>field.h-1)continue;const ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy,i=(iy*field.w+ix)*3,j=(iy*field.w+Math.min(ix+1,field.w-1))*3,k=(Math.min(iy+1,field.h-1)*field.w+ix)*3,l=(Math.min(iy+1,field.h-1)*field.w+Math.min(ix+1,field.w-1))*3,a=image.data,a0=(1-fx)*(1-fy),a1=fx*(1-fy),a2=(1-fx)*fy,a3=fx*fy;red+=weight*(a[i]*a0+a[j]*a1+a[k]*a2+a[l]*a3);green+=weight*(a[i+1]*a0+a[j+1]*a1+a[k+1]*a2+a[l+1]*a3);blue+=weight*(a[i+2]*a0+a[j+2]*a1+a[k+2]*a2+a[l+2]*a3);den+=weight;}if(den){const i=(y*w+x)*3;data[i]=red/den;data[i+1]=green/den;data[i+2]=blue/den;coverage++;}}
  return {w,h,data,views:selected.length,coverage:coverage/(w*h),disparity:d};
 }
 function quadEPI(field,row,cameraRow=4,depth=null){const images=field.images.filter(im=>im.row===cameraRow).sort((a,b)=>a.col-b.col),w=field.w,h=images.length,data=new Float32Array(w*h*3),d=depth===null?0:quadDisparity(field.camera,depth);
  images.forEach((image,j)=>{for(let x=0;x<w;x++){const color=sample(image,x+d*image.u,row-d*image.v);if(color)data.set(color,(j*w+x)*3);}});return {w,h,data};
 }
 const api={clamp,random,luminance,radianceScene,exposures,wellExposed,merge,tone,hdrStats,sample,disparities,layerColor,lightField,refocus,epi,transform,inverse,fit,residual,ransac,correspondences,warp,mosaic,decodeRGBE,resize,stitchPair,stitch,quadRay,quadDisparity,quadSelection,quadRefocus,quadEPI};
 if(typeof module!=='undefined')module.exports=api;globalThis.PhotoModels=api;
})();
