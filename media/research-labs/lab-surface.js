(() => {
  'use strict';
  const M=PhotonExperiment,L=ResearchLab,{line,dot,arrow,projection}=L,TAU=2*Math.PI;
  const circle=(r,z,steps=120)=>Array.from({length:steps+1},(_,i)=>[r*Math.cos(i*TAU/steps),r*Math.sin(i*TAU/steps),z]);
  const label=(ctx,text,x,y,color='#bed0d5',font='12px system-ui')=>{ctx.fillStyle=color;ctx.font=font;ctx.fillText(text,x,y);};
  function paragraph(ctx,text,x,y,width,color='#bfd0d4'){
    ctx.font='12px system-ui';ctx.fillStyle=color;let row='';
    for(const word of text.split(' ')){const next=row?row+' '+word:word;if(row&&ctx.measureText(next).width>width){ctx.fillText(row,x,y);y+=18;row=word;}else row=next;}
    if(row)ctx.fillText(row,x,y);return y+18;
  }
  L.setup(({$,ctx,w,h})=>{
    const level=+$('level').value,tilt=+$('tilt').value*Math.PI/180,k=+$('offset').value,yaw=+$('orbit').value*Math.PI/180,dual=$('query').value==='sheet';
    ['level','tilt','offset','orbit'].forEach(id=>$(id+'-out').textContent=$(id).value);
    const state=M.surface(level,tilt,k),np=[0,0,1],nc=[Math.cos(tilt),0,Math.sin(tilt)],split=w>=760,geometryW=split?w*.55:w;
    const photonPlane=[[-1.18,-1.18,level],[1.18,-1.18,level],[1.18,1.18,level],[-1.18,1.18,level]];
    const point=(a,b)=>[k*nc[0]+b*Math.sin(tilt),a,k*nc[2]-b*Math.cos(tilt)];
    const cameraPlane=[point(-1.18,-1.18),point(1.18,-1.18),point(1.18,1.18),point(-1.18,1.18)];
    const singleHit=[.2,-.6,Math.sqrt(.6)];
    // Fit the actual construction, including every arrow tip, then use all eight
    // AABB corners. Two opposite corners alone do not bound a rotated 3D box.
    const points=[...[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>[x,y,z]))),...photonPlane,[0,0,level+.55]];
    if(dual){points.push(...cameraPlane);for(const p of state.roots)points.push(p,p.map((v,i)=>v+.4*np[i]),p.map((v,i)=>v+.4*nc[i]),p.map(v=>v*1.4));}
    else points.push(singleHit,singleHit.map(v=>v*1.5));
    const extent=[0,1,2].map(axis=>[Math.min(...points.map(p=>p[axis])),Math.max(...points.map(p=>p[axis]))]);
    const bounds=extent[0].flatMap(x=>extent[1].flatMap(y=>extent[2].map(z=>[x,y,z])));
    const project=projection(yaw,.38,bounds,{x:18,y:62,w:geometryW-36,h:h-120},.035);
    const poly=(pts,color,edge)=>{const a=pts.map(project);ctx.beginPath();a.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=color;ctx.fill();if(edge)line(ctx,a.concat([a[0]]),edge,1.3);};
    label(ctx,dual?'Two footprints meet on the receiver':'One photon footprint on the receiver',20,28,'#f6dc9a',`600 ${w<460?13:15}px system-ui`);
    label(ctx,'Gold: photon · Mint: receiver · Violet: camera',20,49,'#b9ced9',`${w<460?10:12}px system-ui`);
    for(let j=-5;j<=5;j++){const z=j/6;line(ctx,circle(Math.sqrt(1-z*z),z).map(project),'#8cd9cc55');}
    for(let j=0;j<12;j++){const a=j*TAU/12;line(ctx,Array.from({length:121},(_,i)=>{const t=i*TAU/120;return project([Math.cos(a)*Math.sin(t),Math.sin(a)*Math.sin(t),Math.cos(t)]);}),'#8cd9cc48');}
    poly(photonPlane,'#f4c96920','#e7bc6288');
    if(state.radius>0){const footprint=circle(state.radius,level);line(ctx,footprint.map(project),'#ffdb80',3);const samples=circle(state.radius,level,24);for(let i=0;i<24;i++)dot(ctx,project(samples[i]),'#ffdb80',2.1);}
    arrow(ctx,project([0,0,level]),project([0,0,level+.55]),'#ffe6a3');
    if(dual){
      poly(cameraPlane,'#ba9ef522','#c4a5ff88');
      if(Math.abs(k)<1){const r=Math.sqrt(1-k*k);line(ctx,Array.from({length:121},(_,i)=>point(r*Math.cos(i*TAU/120),r*Math.sin(i*TAU/120))).map(project),'#c9adff',2.5);}
      for(const p of state.roots){dot(ctx,project(p),'#fff4cc',7);arrow(ctx,project(p),project(p.map((v,i)=>v+.4*np[i])),'#ffe6a3');arrow(ctx,project(p),project(p.map((v,i)=>v+.4*nc[i])),'#c9adff');arrow(ctx,project(p),project(p.map(v=>v*1.4)),'#8af0d0');}
    }else{dot(ctx,project(singleHit),'#c9adff',6);arrow(ctx,project(singleHit.map(v=>v*1.5)),project(singleHit),'#c9adff');}
    $('support').textContent=dual?(state.roots.length+' crossing'+(state.roots.length===1?'':'s')):'1D curve';
    $('jacobian').textContent=dual?(state.kind==='regular'?state.jacobian.toFixed(4):state.kind==='empty'?'No crossing':'Singular'):'r / R = '+state.radius.toFixed(4);
    $('inverse').textContent=dual?(state.kind==='regular'?(1/state.jacobian).toFixed(3):'—'):state.radius>0?(1/state.radius).toFixed(3):'Singular';
    paragraph(ctx,dual?(state.kind==='regular'?'Both transverse branches contribute. An opaque receiver may hide one.':'No regular crossing: move or rotate the camera sheet.'):'An independent camera hit generally misses the curve. Add a sweep or a finite kernel.',20,h-38,geometryW-40,state.kind==='regular'||!dual?'#9fdcca':'#ffb783');
    if(!split)return;

    // The graph is a second view of the same determinant, not an illustrative fit.
    const x0=geometryW+24,right=w-24,inner=right-x0;
    line(ctx,[[geometryW+4,24],[geometryW+4,h-26]],'#afc5cc26');
    label(ctx,dual?'A crossing approaches tangency':'One constraint leaves a curve',x0,28,'#ffe0a1','600 15px system-ui');
    paragraph(ctx,dual?'Move the camera sheet. Its two crossings merge at either end of the valid offset interval.':'Move the photon sheet. The footprint radius and the surface coarea factor change together.',x0,53,inner);
    const plot={x:x0+34,y:118,w:inner-48,h:Math.max(135,h-286)},xmin=dual?-1.08:-1.06,xmax=-xmin;
    const px=x=>plot.x+(x-xmin)/(xmax-xmin)*plot.w,py=y=>plot.y+plot.h-y*plot.h;
    const center=Math.sin(tilt)*level,span=Math.abs(Math.cos(tilt))*state.radius,low=dual?center-span:-1,high=dual?center+span:1;
    ctx.fillStyle='#8bd9bb10';ctx.fillRect(px(low),plot.y,px(high)-px(low),plot.h);
    for(const y of [0,.25,.5,.75,1]){line(ctx,[[plot.x,py(y)],[plot.x+plot.w,py(y)]],'#a5c6cb20');label(ctx,y===0?'0':y===1?'1':y.toFixed(2),plot.x-30,py(y)+4,'#a4b8c4','10px system-ui');}
    line(ctx,[[plot.x,plot.y],[plot.x,py(0)],[plot.x+plot.w,py(0)]],'#a5c6cb6a',1.2);
    const curve=Array.from({length:181},(_,i)=>{const t=low+(high-low)*i/180,val=dual?Math.sqrt(Math.max(0,span*span-(t-center)**2)):Math.sqrt(Math.max(0,1-t*t));return [px(t),py(val)];});
    ctx.save();ctx.shadowColor='#8cf0ca';ctx.shadowBlur=8;line(ctx,curve,'#9defcf',2.5);ctx.restore();
    for(const end of [low,high]){line(ctx,[[px(end),plot.y],[px(end),py(0)]],'#d8b37e4a',1,[3,5]);dot(ctx,[px(end),py(0)],'#ffb18a',4);}
    const current=dual?k:level,value=dual?state.jacobian:state.radius;
    line(ctx,[[px(current),plot.y-8],[px(current),py(0)+8]],'#f7d783b0',1.4,[5,4]);
    dot(ctx,[px(current),py(value)],dual&&state.kind==='empty'?'#ff9b7a':'#ffe6a0',5);
    for(const tick of [-1,0,1]){line(ctx,[[px(tick),py(0)],[px(tick),py(0)+5]],'#a5c6cb70');label(ctx,String(tick),px(tick)-4,py(0)+18,'#a8bbc8','10px system-ui');}
    label(ctx,dual?'Camera plane offset k →':'Photon plane height h →',plot.x+plot.w*.23,py(0)+39,'#c7d6da','11px system-ui');
    label(ctx,dual?'Intersection determinant J':'Surface gradient r / R',plot.x,plot.y-17,'#9de8cd','12px system-ui');
    const ny=py(0)+73;
    label(ctx,dual?`Valid offsets: ${low.toFixed(3)} < k < ${high.toFixed(3)}`:'Regular footprint: −1 < h < 1',x0,ny,'#f0dca6','12px system-ui');
    label(ctx,dual?'J² = cos²θ (1−h²) − (k−h sinθ)²':'r / R = √(1−h²)   (unit receiver)',x0,ny+24,'#c9b9ff','12px ui-monospace, monospace');
    paragraph(ctx,dual?'At coral endpoints J=0: the inverse weight becomes singular. Outside this interval, there is no crossing.':'Near a pole the circle shrinks, while 1/r grows. Their product preserves the measure: ∮ (1/r) ds = 2π.',x0,ny+48,inner,'#b8cbd3');
  });
})();
