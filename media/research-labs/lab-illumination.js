/* Finite CW transport experiment: analytic path delays, programmable phase,
   explicit shutter gates, and an actual 2D DFT crop. No native-renderer images. */
(() => {
  'use strict';
  const C=299792458,TAU=2*Math.PI;
  const defaults={n:64,source:'delay',shutter:'global',surface:'relief',frequency:25,tilt:24,delay:9,carrier:0,relief:3,multipath:.35,width:2,offset:0,crop:7,calibration:true,scan:.45};
  const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
  function fft(real,imag,inverse=false){
    const n=real.length;
    if(n<1||(n&(n-1)))throw new Error('FFT size must be a power of two');
    for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]];}}
    for(let len=2;len<=n;len<<=1){const a=(inverse?TAU:-TAU)/len,wr=Math.cos(a),wi=Math.sin(a);for(let start=0;start<n;start+=len){let ur=1,ui=0;for(let j=0;j<len/2;j++){const p=start+j,q=p+len/2,vr=real[q]*ur-imag[q]*ui,vi=real[q]*ui+imag[q]*ur;real[q]=real[p]-vr;imag[q]=imag[p]-vi;real[p]+=vr;imag[p]+=vi;[ur,ui]=[ur*wr-ui*wi,ur*wi+ui*wr];}}}
    if(inverse)for(let i=0;i<n;i++){real[i]/=n;imag[i]/=n;}
  }
  function fft2(real,imag,n,inverse=false){
    const r=new Float64Array(n),im=new Float64Array(n);
    for(let axis=0;axis<2;axis++)for(let a=0;a<n;a++){for(let b=0;b<n;b++){const k=axis?b*n+a:a*n+b;r[b]=real[k];im[b]=imag[k];}fft(r,im,inverse);for(let b=0;b<n;b++){const k=axis?b*n+a:a*n+b;real[k]=r[b];imag[k]=im[b];}}
    return {real,imag};
  }
  function surface(u,v,p){const z=10+(p.surface==='flat'?0:p.surface==='step'?(u<.5?-.5:.5)*p.relief:p.relief*Math.sin(TAU*u)*Math.cos(TAU*v));return [(u-.5)*1.3*z,(v-.5)*.9*z,z];}
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const scanned=p=>p.source==='point'||p.source==='line';
  function sourceLength(q,p){return p.source==='plane'?q[2]*Math.cos(p.tilt*Math.PI/180)+q[0]*Math.sin(p.tilt*Math.PI/180):p.source==='delay'?q[2]:Math.hypot(...q);}
  function code(q,u,p){return TAU*p.delay*(p.source==='delay'?.5+q[0]/13:scanned(p)?u:0);}
  function gate(i,j,p){return p.shutter!=='rolling'||!scanned(p)?1:Math.exp(-.5*((j-i-p.offset)/p.width)**2);}
  function compute(options={}){
    const p={...defaults,...options},n=p.n,size=n*n,k=TAU*p.frequency*1e6/C,origin=[0,0,0];
    const xyz=[],beta=new Float64Array(size),ar=new Float64Array(size),ai=new Float64Array(size),truthR=new Float64Array(size),truthI=new Float64Array(size),hologram=new Float64Array(size),direct=new Float64Array(size);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const at=y*n+x,q=surface(x/n,y/n,p);xyz.push(q);beta[at]=code(q,x/n,p);}
    // These positive, deliberately specified weights make the operator inspectable.
    // They are not a claim to solve visibility, BSDFs, or a complete room transport.
    const neighbors=[[8,0],[-8,0],[0,8],[0,-8],[6,6],[-6,-6],[0,0]];
    let accepted=0,available=0,directWeight=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const at=y*n+x,q=xyz[at],albedo=1+.2*Math.cos(TAU*y/n),baseGate=gate(x,x,p),phase=k*(sourceLength(q,p)+distance(q,origin))+beta[at];
      let re=albedo*baseGate*Math.cos(phase),im=albedo*baseGate*Math.sin(phase);direct[at]=baseGate;directWeight+=baseGate;
      for(const [dx,dy] of neighbors){const xx=x+dx,yy=y+dy;if(xx<0||xx>=n||yy<0||yy>=n)continue;const j=yy*n+xx,s=xyz[j],g=gate(x,xx,p),weight=p.multipath*albedo/neighbors.length;
        // Same-column and same-pixel indirect returns intentionally survive a row gate.
        const path=sourceLength(s,p)+distance(s,q)+distance(q,origin)+(dx===0&&dy===0?3:0),a=k*path+beta[j];
        re+=weight*g*Math.cos(a);im+=weight*g*Math.sin(a);available+=weight;accepted+=weight*g;
      }
      ar[at]=re;ai[at]=im;const sensor=TAU*p.carrier*x/n;hologram[at]=re*Math.cos(sensor)-im*Math.sin(sensor);
      truthR[at]=re*Math.cos(beta[at])+im*Math.sin(beta[at]);truthI[at]=im*Math.cos(beta[at])-re*Math.sin(beta[at]);
    }
    const spectrum=fft2(Float64Array.from(hologram),new Float64Array(size),n),croppedR=new Float64Array(size),croppedI=new Float64Array(size);
    const nominal=p.carrier+(p.source==='delay'||scanned(p)?p.delay:0),center=Math.round(nominal);
    for(let fy=-p.crop;fy<=p.crop;fy++)for(let fx=-p.crop;fx<=p.crop;fx++){
      if(fx*fx+fy*fy>p.crop*p.crop)continue;
      const src=((fy+n)%n)*n+((fx+center+n)%n),dest=((fy+n)%n)*n+((fx+n)%n);
      croppedR[dest]=2*spectrum.real[src];croppedI[dest]=2*spectrum.imag[src];
    }
    fft2(croppedR,croppedI,n,true);
    let error=0,signal=0,ampError=0;const local=[];
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const at=y*n+x,phaseCorrection=p.calibration?beta[at]+TAU*(p.carrier-center)*x/n:0,cs=Math.cos(phaseCorrection),sn=Math.sin(phaseCorrection),r=croppedR[at],im=croppedI[at];
      croppedR[at]=r*cs+im*sn;croppedI[at]=im*cs-r*sn;
      error+=(croppedR[at]-truthR[at])**2+(croppedI[at]-truthI[at])**2;signal+=truthR[at]**2+truthI[at]**2;
      ampError+=(Math.hypot(croppedR[at],croppedI[at])-Math.hypot(truthR[at],truthI[at]))**2;
      if(y===Math.floor(n/2)&&x<n-1)local.push(p.carrier+(beta[at+1]-beta[at])*n/TAU);
    }
    return {p,n,xyz,beta,hologram,spectrum,phasorR:ar,phasorI:ai,real:croppedR,imag:croppedI,truthR,truthI,local,nominal,center,relativeError:Math.sqrt(error/Math.max(signal,1e-20)),amplitudeError:Math.sqrt(ampError/Math.max(signal,1e-20)),accepted:available?accepted/available:0,directAcceptance:directWeight/size};
  }
  const math={C,TAU,defaults,wrap,fft,fft2,surface,code,gate,compute};if(typeof module!=='undefined')module.exports=math;if(typeof document==='undefined')return;
  const {setup,line,projection,arrow}=ResearchLab;
  const tile=document.createElement('canvas'),tc=tile.getContext('2d');
  let cachedKey='',cachedModel=null;
  function image(ctx,box,model,kind){const n=model.n;tile.width=tile.height=n;const data=tc.createImageData(n,n);let max=1;if(kind==='spectrum')max=Math.max(...model.spectrum.real.map((r,i)=>Math.log1p(Math.hypot(r,model.spectrum.imag[i]))));for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const at=y*n+x;let color;
    if(kind==='fringes'){const value=Math.max(0,Math.min(1,.5+model.hologram[at]/(2*(1.2+model.p.multipath))));color=[value*230,value*235,value*255];}
    else if(kind==='spectrum'){const j=((y+n/2)%n)*n+(x+n/2)%n,v=Math.log1p(Math.hypot(model.spectrum.real[j],model.spectrum.imag[j]))/max;color=[245*v,175*v,255*v];}
    else {const r=kind==='reference'?model.truthR[at]:model.real[at],im=kind==='reference'?model.truthI[at]:model.imag[at],a=Math.min(1,Math.hypot(r,im)/1.5),phase=Math.atan2(im,r);color=[.55+.45*Math.cos(phase),.55+.45*Math.cos(phase-2.094),.55+.45*Math.cos(phase+2.094)].map(v=>v*a*255);}
    for(let c=0;c<3;c++)data.data[4*at+c]=color[c];data.data[4*at+3]=255;
  }tc.putImageData(data,0,0);ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(tile,box.x,box.y,box.w,box.h);ctx.restore();ctx.strokeStyle='#abc4d744';ctx.strokeRect(box.x,box.y,box.w,box.h);}
  setup(({$,ctx,w,h})=>{
    const values={};for(const id of ['source','shutter','surface'])values[id]=$(id).value;for(const id of ['frequency','tilt','delay','carrier','relief','multipath','width','offset','crop','scan']){values[id]=+$(id).value;$(id+'-out').value=values[id].toFixed(['multipath','scan'].includes(id)?2:1);}values.calibration=$('calibration').value==='on';
    const key=JSON.stringify({...values,scan:0});if(key!==cachedKey){cachedModel=compute(values);cachedKey=key;}const m=cachedModel,p={...m.p,scan:values.scan},n=m.n;
    $('tilt').disabled=p.source!=='plane';$('delay').disabled=p.source==='plane';for(const id of ['width','offset'])$(id).disabled=p.shutter!=='rolling'||!scanned(p);$('scan').disabled=!scanned(p);
    $('carrier-spread').textContent=Math.min(...m.local).toFixed(1)+' … '+Math.max(...m.local).toFixed(1);
    $('retained').textContent=(100*m.accepted).toFixed(1)+'%';$('reconstruction-error').textContent=(100*m.relativeError).toFixed(1)+'%';
    const mobile=w<760,margin=18,gap=18,cw=mobile?w-2*margin:(w-2*margin-gap)/2,top=30,sceneH=mobile?155:185,carrierTop=mobile?top+sceneH+78:top,by=carrierTop+sceneH+96,cols=w<480?1:w<1050?2:4,rows=Math.ceil(4/cols),tw=(w-2*margin-(cols-1)*gap)/cols,ih=Math.min(tw,(h-by-106-(rows-1)*53)/rows);
    const wrapText=(text,x,y,width,color,step=15)=>{ctx.fillStyle=color;let lineText='',row=0;for(const word of text.split(' ')){const next=lineText?lineText+' '+word:word;if(lineText&&ctx.measureText(next).width>width){ctx.fillText(lineText,x,y+row*step);lineText=word;row++;}else lineText=next;}if(lineText)ctx.fillText(lineText,x,y+row*step);return row+1;};
    ctx.font='600 12px system-ui';ctx.fillStyle='#a8e6d6';ctx.fillText('01 · Illumination and the visible surface',margin,18);ctx.fillStyle='#dfc591';ctx.fillText('02 · Added carrier frequency / image width',mobile?margin:margin+cw+gap,carrierTop-12);
    const pts=[...m.xyz,[-8,0,0],[8,0,0],[0,0,0]],pr=projection(-.36,.38,pts,{x:margin,y:top,w:cw,h:sceneH},.1);
    for(let y=0;y<n;y+=4)line(ctx,Array.from({length:n/4},(_,i)=>pr(m.xyz[y*n+i*4])),'#b9a3f363',1);
    for(let x=0;x<n;x+=4)line(ctx,Array.from({length:n/4},(_,i)=>pr(m.xyz[(i*4)*n+x])),'#8fe8d657',1);
    const column=Math.min(n-1,Math.floor(p.scan*n)),row=Math.floor(p.scan*n*7)%n;
    if(scanned(p)){const targets=p.source==='line'?Array.from({length:n/4},(_,i)=>m.xyz[i*4*n+column]):[m.xyz[row*n+column]];targets.forEach(q=>arrow(ctx,pr([0,0,0]),pr(q),'#f6d18a88',1.5));}
    else for(let x=0;x<n;x+=8){const q=m.xyz[Math.floor(n/2)*n+x],s=p.source==='plane'?[q[0]-q[2]*Math.tan(p.tilt*Math.PI/180),q[1],0]:[q[0],q[1],0];arrow(ctx,pr(s),pr(q),'#f6d18a88',1);}
    ctx.fillStyle='#a6b6c4';ctx.font='11px system-ui';wrapText(scanned(p)?(p.source==='point'?'Raster spot: N² addressed positions':'Line sweep: N addressed columns'):'Steady illumination: rolling exposure is not a spatial filter',margin,top+sceneH+18,cw,'#a6b6c4');
    const gx=mobile?margin:margin+cw+gap,gy=carrierTop+18,gh=sceneH-30,min=Math.min(0,...m.local)-2,max=Math.max(2,...m.local)+2;
    line(ctx,[[gx,gy],[gx,gy+gh],[gx+cw,gy+gh]],'#98b4c34d');const py=v=>gy+gh-(v-min)/(max-min)*gh;
    line(ctx,[[gx,py(m.nominal)],[gx+cw,py(m.nominal)]],'#f0d29066',1,[4,4]);line(ctx,m.local.map((v,i)=>[gx+i/(n-2)*cw,py(v)]),'#e5c37f',2);
    ctx.fillStyle='#b5c9d4';wrapText('Dashed: center used by one Fourier crop',gx,carrierTop+sceneH+18,cw,'#b5c9d4');wrapText('Shutter: '+(p.shutter==='rolling'&&scanned(p)?'synchronized column acceptance':'all source positions accepted'),gx,carrierTop+sceneH+49,cw,'#b5c9d4');
    const kinds=['fringes','spectrum','recovered','reference'],titles=['03 · Balanced correlation','04 · Fourier magnitude','05 · One cropped sideband','06 · Four-tap reference'];
    for(let i=0;i<4;i++){
      const columnX=margin+(i%cols)*(tw+gap),yy=by+Math.floor(i/cols)*(ih+53),bx=columnX+(tw-ih)/2,box={x:bx,y:yy,w:ih,h:ih};
      ctx.font='600 11px system-ui';wrapText(titles[i],columnX,yy-27,tw,i>1?'#addecf':'#c8b3f2');image(ctx,box,m,kinds[i]);
      if(i===1){const cx=bx+((n/2+m.center)%n)/n*ih,cy=yy+ih/2;ctx.strokeStyle='#ffedaa';ctx.beginPath();ctx.ellipse(cx,cy,p.crop/n*ih,p.crop/n*ih,0,0,TAU);ctx.stroke();}
    }
    const footer=by+rows*ih+(rows-1)*53;ctx.font='11px system-ui';
    wrapText('Phase hue + amplitude brightness · actual FFT recovery.',margin,footer+23,w-2*margin,'#afc0cd');
    const overlap=m.center<=p.crop||m.center+p.crop>=n/2;
    wrapText(overlap?'Crop meets DC or Nyquist: sidebands may overlap or alias.':p.calibration?'Known phase is corrected after cropping; discarded frequencies stay lost.':'Carrier correction off: residual spatial code remains in the recovered field.',margin,footer+54,w-2*margin,overlap?'#efb29d':'#afc0cd');
  });
})();
