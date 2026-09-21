/* Small numerical Fourier pipeline for explaining sideband recovery.
   It recomputes only after controls or layout change. */
(() => {
  'use strict';
  const N=128,$=id=>document.getElementById(id),canvas=$('holo'),ctx=canvas.getContext('2d');
  if(!ctx)return;
  let pending=0,disposed=false;
  const wrap=i=>(i%N+N)%N;
  function fft1(re,im,inverse){
    for(let i=1,j=0;i<N;i++){let bit=N>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
    for(let len=2;len<=N;len<<=1){const ang=(inverse?2:-2)*Math.PI/len,wr0=Math.cos(ang),wi0=Math.sin(ang);for(let i=0;i<N;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const u=i+j,v=i+j+len/2,tr=re[v]*wr-im[v]*wi,ti=re[v]*wi+im[v]*wr;re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;const nwr=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=nwr;}}}
    if(inverse)for(let i=0;i<N;i++){re[i]/=N;im[i]/=N;}
  }
  function fft2(re,im,inverse){
    const a=new Float64Array(N),b=new Float64Array(N);
    for(let y=0;y<N;y++){for(let x=0;x<N;x++){a[x]=re[y*N+x];b[x]=im[y*N+x];}fft1(a,b,inverse);for(let x=0;x<N;x++){re[y*N+x]=a[x];im[y*N+x]=b[x];}}
    for(let x=0;x<N;x++){for(let y=0;y<N;y++){a[y]=re[y*N+x];b[y]=im[y*N+x];}fft1(a,b,inverse);for(let y=0;y<N;y++){re[y*N+x]=a[y];im[y*N+x]=b[y];}}
  }
  const hsv=(h,s,v)=>{h=(h%1+1)%1;const i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s),c=[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6];return c.map(x=>Math.round(x*255));};
  const noise=i=>{let x=(i+1)*2654435761>>>0;x^=x>>>15;x=Math.imul(x,2246822519);x^=x>>>13;return (x>>>0)/4294967295*2-1;};
  function image(values,color){
    const out=new ImageData(N,N);let max=0;if(color==='log')for(let i=0;i<values.length;i++)max=Math.max(max,Math.log1p(values[i]));
    for(let i=0;i<N*N;i++){let rgb;if(color==='gray'){const v=Math.max(0,Math.min(1,values[i]));rgb=[v*255,v*255,v*255];}else if(color==='log'){const v=Math.log1p(values[i])/Math.max(max,1e-9);rgb=hsv(.67-.58*v,.75,Math.pow(v,.55));}else{const v=Math.max(0,Math.min(1,values.amp[i]));rgb=hsv(values.phase[i]/(Math.PI*2)+.58,.74,.14+.86*Math.sqrt(v));}const j=i*4;out.data[j]=rgb[0];out.data[j+1]=rgb[1];out.data[j+2]=rgb[2];out.data[j+3]=255;}return out;
  }
  const offscreen=data=>{const c=document.createElement('canvas');c.width=c.height=N;c.getContext('2d').putImageData(data,0,0);return c;};
  function compute(){
    const model=$('model').value,k=+$('carrier').value,angle=+$('angle').value*Math.PI/180,radius=+$('crop').value,sigma=+$('noise').value,depth=$('depthCoupled').checked;
    const kx=Math.round(k*Math.cos(angle)),ky=Math.round(k*Math.sin(angle));
    $('carrierOut').value=Math.hypot(kx,ky).toFixed(1)+' cyc';$('angleOut').value=$('angle').value+'°';$('cropOut').value=radius+' px';$('noiseOut').value=sigma.toFixed(2);
    const amp=new Float64Array(N*N),phase=new Float64Array(N*N),signal=new Float64Array(N*N),fim=new Float64Array(N*N);
    let smin=Infinity,smax=-Infinity,coverage=0;
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x,u=(x-N/2)/(N/2),v=(y-N/2)/(N/2),a=Math.min(1,.15+.86*Math.exp(-((u+.28)**2+(v+.1)**2)*4.8)+.62*Math.exp(-((u-.32)**2+(v-.18)**2)*12));const p=1.45*Math.sin(u*2.4)+.9*Math.cos(v*3.2)+1.2*Math.atan2(v+.12,u-.18);const local=depth?1+.52*v:1,theta=2*Math.PI*(kx*x/N+ky*y/N)*local;let q=model==='hologram'?a*a+1+2*a*Math.cos(p-theta):.5*a*Math.cos(theta-p);q+=sigma*noise(i);amp[i]=a;phase[i]=p;signal[i]=q;smin=Math.min(smin,q);smax=Math.max(smax,q);if(a>.22)coverage++;}
    const shown=new Float64Array(N*N);for(let i=0;i<shown.length;i++)shown[i]=(signal[i]-smin)/Math.max(1e-9,smax-smin);
    const fre=Float64Array.from(signal);fft2(fre,fim,false);
    const magnitude=new Float64Array(N*N);for(let y=0;y<N;y++)for(let x=0;x<N;x++){const src=wrap(y+N/2)*N+wrap(x+N/2);magnitude[y*N+x]=Math.hypot(fre[src],fim[src]);}
    const sign=$('sideband').value==='minus'?-1:1,cx=wrap(sign*kx),cy=wrap(sign*ky),ore=new Float64Array(N*N),oim=new Float64Array(N*N);
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){if(dx*dx+dy*dy>radius*radius)continue;const src=wrap(cy+dy)*N+wrap(cx+dx),dst=wrap(dy)*N+wrap(dx);ore[dst]=fre[src];oim[dst]=fim[src];}
    fft2(ore,oim,true);
    const rampPhase=new Float64Array(N*N),rampAmp=new Float64Array(N*N);let maxAmp=0;
    for(let i=0;i<N*N;i++)maxAmp=Math.max(maxAmp,Math.hypot(ore[i],oim[i]));
    for(let i=0;i<N*N;i++){rampAmp[i]=Math.hypot(ore[i],oim[i])/Math.max(maxAmp,1e-9);rampPhase[i]=Math.atan2(oim[i],ore[i]);}
    const expectedSign=sign<0?1:-1;let cr=0,ci=0,weight=0;
    for(let i=0;i<N*N;i++)if(amp[i]>.22){const d=rampPhase[i]-expectedSign*phase[i],w=amp[i];cr+=w*Math.cos(d);ci+=w*Math.sin(d);weight+=w;}
    const gauge=Math.atan2(ci,cr);let err=0;
    for(let i=0;i<N*N;i++)if(amp[i]>.22){const d=Math.atan2(Math.sin(rampPhase[i]-expectedSign*phase[i]-gauge),Math.cos(rampPhase[i]-expectedSign*phase[i]-gauge));err+=amp[i]*d*d;}
    err=Math.sqrt(err/Math.max(weight,1e-9));
    const clearance=Math.max(0,Math.hypot(kx,ky)-radius);
    return {amp,phase,shown,magnitude,rampAmp,rampPhase,kx,ky,radius,sign,clearance,coverage:coverage/(N*N),error:err,depth};
  }
  function render(){
    const data=compute(),box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=box.width,h=box.height;if(!w||!h)return;
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const gap=12,pw=(w-gap*3)/2,ph=(h-gap*3)/2,panels=[[gap,gap,'Object amplitude + phase',offscreen(image({amp:data.amp,phase:data.phase},'phase'))],[gap*2+pw,gap,'Recorded intensity / correlation',offscreen(image(data.shown,'gray'))],[gap,gap*2+ph,'Log Fourier magnitude + crop',offscreen(image(data.magnitude,'log'))],[gap*2+pw,gap*2+ph,'Recovered wrapped phase',offscreen(image({amp:data.rampAmp,phase:data.rampPhase},'phase'))]];
    ctx.imageSmoothingEnabled=true;
    for(const [x,y,label,img] of panels){ctx.fillStyle='#0a1019';ctx.fillRect(x,y,pw,ph);const side=Math.min(pw-18,ph-30),ix=x+(pw-side)/2,iy=y+23+(ph-27-side)/2;ctx.drawImage(img,ix,iy,side,side);ctx.strokeStyle='#ffffff20';ctx.strokeRect(x+.5,y+.5,pw-1,ph-1);ctx.fillStyle='#c8d1d6';ctx.font='600 10px system-ui';ctx.fillText(label,x+9,y+16);}
    const sx=gap,sy=gap*2+ph,side=Math.min(pw-18,ph-30),ix=sx+(pw-side)/2,iy=sy+23+(ph-27-side)/2;const centerX=ix+side*(.5+data.sign*data.kx/N),centerY=iy+side*(.5+data.sign*data.ky/N);ctx.strokeStyle=data.clearance<2?'#ff806f':'#f0ce79';ctx.lineWidth=2;ctx.beginPath();ctx.arc(centerX,centerY,side*data.radius/N,0,Math.PI*2);ctx.stroke();
    $('clearance').textContent=data.clearance.toFixed(1)+' bins';$('bandwidth').textContent=data.radius+' / '+(N/2);$('coverage').textContent=(data.coverage*100).toFixed(0)+'%';$('error').textContent=data.error.toFixed(2)+' rad';$('clearance').style.color=data.clearance<2?'#ff8b78':'';
  }
  const schedule=()=>{if(!disposed&&!pending&&!document.hidden)pending=requestAnimationFrame(()=>{pending=0;render();});};
  for(const id of ['model','carrier','angle','crop','noise','sideband','depthCoupled'])$(id).addEventListener('input',schedule);
  $('reset').addEventListener('click',()=>{Object.entries({model:'hologram',carrier:15,angle:-22,crop:11,noise:.03,sideband:'minus'}).forEach(([id,v])=>$(id).value=v);$('depthCoupled').checked=false;schedule();});
  const observer=new ResizeObserver(schedule);observer.observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(pending);pending=0;}else schedule();});
  addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(pending);observer.disconnect();});
  addEventListener('pageshow',()=>{disposed=false;observer.observe(canvas);schedule();});
  schedule();
})();
