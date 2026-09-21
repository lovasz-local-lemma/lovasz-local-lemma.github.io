/* Canvas presentation for the small computed Physics2D solver experiments. */
(() => {
  'use strict';
  const C=window.PhysicsSolverCore,kind=document.body.dataset.solver;
  const canvas=document.getElementById('solver-view'),ctx=canvas.getContext('2d');
  const gold='#f4cc78',mint='#83edcf',coral='#ff9c7d',violet='#bca7ff',muted='#acbfcd';
  const inputs=[...document.querySelectorAll('input')],initial=inputs.map(i=>i.value);
  const value=id=>+document.getElementById(id).value;
  const metric=(i,text)=>{document.getElementById(`metric-${i}`).textContent=text;};
  let w=900,h=360,mode=document.querySelector('[data-mode]')?.dataset.mode||'',probe={x:.44,y:.49},pole={x:.23,y:.3};
  let model=null,renderJob=0,animationJob=0,running=false,lastTime=0,animationValue=0,dragging=false;
  const reduced=window.matchMedia('(prefers-reduced-motion:reduce)');
  function text(t,x,y,color=muted,size=12,align='left'){
    ctx.fillStyle=color;ctx.font=`${size}px system-ui,sans-serif`;ctx.textAlign=align;ctx.fillText(t,x,y);
  }
  function line(x,y,x2,y2,color,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();}
  function dot(x,y,r,color,glow=0){ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=glow;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  function arrow(x,y,dx,dy,color=mint,width=1.2){
    if(Math.hypot(dx,dy)<.3)return;line(x,y,x+dx,y+dy,color,width);
    const a=Math.atan2(dy,dx),s=Math.min(5,Math.max(2,Math.hypot(dx,dy)*.28));
    line(x+dx,y+dy,x+dx-s*Math.cos(a-.5),y+dy-s*Math.sin(a-.5),color,width);
    line(x+dx,y+dy,x+dx-s*Math.cos(a+.5),y+dy-s*Math.sin(a+.5),color,width);
  }
  function path(points,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
  function frame(x,y,bw,bh){ctx.strokeStyle='#779baf20';ctx.lineWidth=1;ctx.strokeRect(x,y,bw,bh);}
  function glow(x,y,r,color){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);}
  function ready(){
    const box=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    w=Math.max(280,box.width);h=Math.max(240,box.height);
    const nw=Math.round(w*dpr),nh=Math.round(h*dpr);
    if(canvas.width!==nw||canvas.height!==nh){canvas.width=nw;canvas.height=nh;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#10202a');g.addColorStop(1,'#0a111c');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    inputs.forEach(i=>{const n=+i.value,precision=(i.step.split('.')[1]||'').length;document.getElementById(`${i.id}-value`).textContent=Number.isInteger(n)?String(n):n.toFixed(precision);});
  }
  function sph(){
    const radius=value('radius'),list=C.particles(value('compression')),field={x:18,y:38,w:w*.69-25,h:h-64};
    const scale=Math.min(field.w/.9,field.h/.65),ox=field.x+(field.w-scale*.9)/2,oy=field.y+(field.h-scale*.65)/2-scale*.17;
    const px=x=>ox+x*scale,py=y=>oy+y*scale;
    text('PARTICLE SUPPORT',18,21,mint,10);
    const q=C.density(list,probe.x,probe.y,radius),max=C.kernel(0,radius)*list[0].m;
    const glowRadius=radius*2*scale;glow(px(probe.x),py(probe.y),glowRadius,'#e8c46b22');
    ctx.strokeStyle='#ebd18780';ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(px(probe.x),py(probe.y),glowRadius,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    for(const p of list){
      const r=Math.hypot(p.x-probe.x,p.y-probe.y),weight=p.m*C.kernel(r,radius)/max;
      if(r<2*radius&&weight>.025)line(px(p.x),py(p.y),px(probe.x),py(probe.y),`rgba(109,230,194,${weight*.5})`);
      dot(px(p.x),py(p.y),2.5+weight*3,r<2*radius?mint:'#466274');
      if(mode==='gradient'&&r<radius*1.8&&r>.025){const g=p.m*C.kernelSlope(r,radius)/r;
        arrow(px(probe.x),py(probe.y),(probe.x-p.x)*g*3,(probe.y-p.y)*g*3,'#bca7ff65');}
    }
    dot(px(probe.x),py(probe.y),6,gold,16);text('probe',px(probe.x)+11,py(probe.y)-10,gold,11);
    if(mode==='gradient')arrow(px(probe.x),py(probe.y),q.gx*5,q.gy*5,violet,2.5);
    const sx=w*.72,bw=w*.25-16,top=45,bh=h-88;
    text(mode==='gradient'?'RADIAL KERNEL SLOPE':'NEIGHBOR CONTRIBUTIONS',sx,21,gold,10);
    if(mode==='density'){
      const bars=[...q.contributions].sort((a,b)=>b.value-a.value).slice(0,16),dy=bh/16;
      bars.forEach((v,i)=>{ctx.fillStyle=`rgba(105,226,188,${.35+.65*v.value/max})`;ctx.fillRect(sx,top+i*dy,bw*v.value/max,Math.max(2,dy-5));});
      text(`largest ${bars.length} of ${q.contributions.length}`,sx,h-15,muted,10);
    }else{
      frame(sx,top,bw,bh);const minSlope=Math.abs(C.kernelSlope(radius*.66,radius));
      path(Array.from({length:100},(_,i)=>{const r=i/99*radius*2;return [sx+i/99*bw,top+bh*.1-C.kernelSlope(r,radius)/minSlope*bh*.8];}),violet,2);
      text('0',sx,top+bh+17,muted,10);text('2h',sx+bw,top+bh+17,muted,10,'right');
    }
    metric(0,q.rho.toFixed(3));metric(1,q.contributions.length);metric(2,Math.hypot(q.gx,q.gy).toFixed(3));
    canvas.mapping={ox,oy,scale};
  }
  function updateMac(){model=C.createMac(32,20,probe.x,probe.y);C.iteratePressure(model,value('iterations'));}
  function projection(){
    if(!model)updateMac();const q=C.projected(model),gap=20,bw=(w-3*gap)/2,bh=h-74;
    const maxD=Math.max(...model.div.map(Math.abs)),maxP=Math.max(...model.p.map(Math.abs),.001);
    const panels=[{x:gap,u:model.u,v:model.v,d:model.div,title:'BEFORE · provisional velocity'},
      {x:2*gap+bw,u:q.u,v:q.v,d:q.div,title:`AFTER · ${model.iterations} iterations`}];
    panels.forEach((p,pi)=>{
      text(p.title,p.x,23,pi?mint:gold,w<600?10:12);
      const cw=bw/model.n,ch=bh/model.ny,top=43;
      for(let y=0;y<model.ny;y++)for(let x=0;x<model.n;x++){
        const i=y*model.n+x,v=mode==='pressure'?(pi?model.p[i]/maxP:0):p.d[i]/maxD;
        ctx.fillStyle=v>=0?`rgba(249,140,104,${Math.min(.8,Math.abs(v)*.72)})`:`rgba(100,224,201,${Math.min(.8,Math.abs(v)*.72)})`;
        ctx.fillRect(p.x+x*cw,top+y*ch,cw+.3,ch+.3);
        if((x+y)%2===0){const vx=(p.u[y*(model.n+1)+x]+p.u[y*(model.n+1)+x+1])/2,vy=(p.v[y*model.n+x]+p.v[(y+1)*model.n+x])/2;
          arrow(p.x+(x+.5)*cw,top+(y+.5)*ch,vx*cw*1.9,vy*ch*1.9,'#d6e8e4bb',1);}
      }
      frame(p.x,top,bw,bh);
      if(mode==='pressure'&&!pi)text('Pressure correction starts from zero.',p.x+bw/2,top+bh/2,muted,10,'center');
    });
    text(mode==='pressure'?'Coral / mint: signed pressure potential':'Coral / mint: positive / negative divergence',gap,h-11,muted,11);
    metric(0,q.before.toFixed(3));metric(1,q.after.toFixed(3));metric(2,`${(q.after/q.before*100).toFixed(1)}%`);
    canvas.mapping={x:gap,y:43,w:bw,h:bh};
  }
  function exchange(){
    const a=value('mass-a'),b=value('mass-b'),progress=value('progress'),cx=w*.5,y=h*.38,left=w*.16,right=w*.84;
    const heat=mode==='heat',q=heat?C.heatExchange(a,b,progress*10):C.exchange(a,b,0,progress===1?1:0);
    line(left,y,right,y,'#d8c38640',2);
    const state=heat?`Tmix ${q.target.toFixed(1)} K`:progress<1?'REACTION QUEUED':'REACTION CONSUMED';
    ctx.fillStyle='#213333';ctx.strokeStyle='#d7b87077';ctx.fillRect(cx-56,y-27,112,54);ctx.strokeRect(cx-56,y-27,112,54);
    text(heat?'THERMAL MIXTURE':'PERSISTENT GRID',cx,y-45,gold,10,'center');
    text(heat?q.target.toFixed(1)+' K':progress<1?`${q.queued.toFixed(2)} impulse`:'0 · cleared',cx,y+4,gold,11,'center');
    const shownA=heat?q.a:q.a,shownB=heat?q.b:q.b;
    const ra=22+Math.sqrt(a)*10,rb=22+Math.sqrt(b)*10;
    glow(left,y,ra*2.5,heat?'#ff8c6130':'#83edcf1a');glow(right,y,rb*2.5,'#bba1ff24');
    dot(left,y,ra,heat?'#ff9970':mint);dot(right,y,rb,heat?'#81c4df':violet);
    text('SPH',left,y+5,'#101922',13,'center');text('MPM',right,y+5,'#101922',13,'center');
    text(`${shownA.toFixed(2)}${heat?' K':' velocity'}`,left,y+ra+28,mint,12,'center');
    text(`${shownB.toFixed(2)}${heat?' K':' velocity'}`,right,y+rb+28,violet,12,'center');
    if(!heat){arrow(left,y-ra-16,Math.max(-80,Math.min(80,q.a*22)),0,mint,2);arrow(right,y-rb-16,Math.max(-80,Math.min(80,q.b*22)),0,violet,2);}
    const packet=progress<.5?left+(cx-left)*progress*2:cx+(right-cx)*(progress-.5)*2;
    dot(packet,y,5,gold,17);
    text(state,cx,h*.79,gold,12,'center');
    if(heat){
      text('Both capacities relax toward one shared target.',cx,h*.88,muted,w<520?10:12,'center');
      metric(0,q.initial.toFixed(1));metric(1,q.energy.toFixed(1));metric(2,Math.abs(q.energy-q.initial).toExponential(1));
    }else{
      text('Particle momentum + queued impulse = the complete ledger.',cx,h*.88,muted,w<520?10:12,'center');
      metric(0,q.before.toFixed(3));metric(1,`${q.after.toFixed(3)} + ${q.queued.toFixed(3)}`);metric(2,Math.abs(q.ledger-q.before).toExponential(1));
    }
  }
  function damage(){
    const args={alpha:value('alpha'),angle:value('angle')*Math.PI/180,load:value('load'),time:value('time'),length:value('length')};
    const iso=C.damageProfile({...args,alpha:0}),aniso=C.damageProfile(args),x=24,bw=w-48;
    const row=(data,top,label,color)=>{
      text(label,x,top-10,color,11);const cell=bw/data.d.length;
      for(let i=0;i<data.d.length;i++){
        const d=data.d[i];ctx.fillStyle=`rgb(${Math.round(45+205*d)},${Math.round(80+45*d)},${Math.round(93-13*d)})`;ctx.fillRect(x+i*cell,top,cell+.3,41);
        if(i%2===0){const fx=x+(i+.5)*cell,fy=top+20;line(fx-8*Math.cos(args.angle),fy-8*Math.sin(args.angle),fx+8*Math.cos(args.angle),fy+8*Math.sin(args.angle),`${color}99`);}
      }
      frame(x,top,bw,41);text('prescribed notch',x+bw*.51,top+58,muted,10,'center');
    };
    row(iso,36,'ISOTROPIC · same reference threshold',gold);row(aniso,133,'ANISOTROPIC · rotate the grain',mint);
    const plotY=235,plotH=Math.max(50,h-264);frame(x,plotY,bw,plotH);
    [iso,aniso].forEach((data,k)=>path(Array.from(data.d,(d,i)=>[x+i/(data.d.length-1)*bw,plotY+plotH*(1-d)]),k?mint:gold,2));
    text('damage 0 → 1',x+7,plotY+15,muted,10);text('position across the strip',x+bw,h-10,muted,10,'right');
    metric(0,Math.max(...iso.d).toFixed(3));metric(1,Math.max(...aniso.d).toFixed(3));metric(2,`${(Math.min(...aniso.stiffness)*100).toFixed(1)}%`);
  }
  function thermal(){
    const q=C.thermalSlab(value('time'),value('peak'),value('conductivity')),x=24,bw=w-48,n=q.T.length;
    const rows=[{y:39,label:'TEMPERATURE · warm skin / cooler core',values:q.T,color:coral,norm:t=>(t-300)/350},
      {y:119,label:'REVERSIBLE STIFFNESS · heat softens, cooling restores',values:q.soft,color:mint,norm:t=>t},
      {y:199,label:'RETAINED CONVERSION · cooling keeps the history',values:q.cure,color:violet,norm:t=>t}];
    rows.forEach(row=>{
      text(row.label,x,row.y-10,row.color,w<580?10:11);
      row.values.forEach((t,i)=>{const v=C.clamp(row.norm(t),0,1);ctx.fillStyle=row.color;ctx.globalAlpha=.08+.9*v;ctx.fillRect(x+i*bw/n,row.y,bw/n+.3,36);ctx.globalAlpha=1;});
      frame(x,row.y,bw,36);
    });
    const y=h-58;line(x,y,x+bw,y,'#526677',2);const f=value('time')/12;
    line(x,y,x+bw/3,y,'#efb16a',3);line(x+bw/3,y,x+bw,y,'#85d6d0',3);dot(x+f*bw,y,6,gold,12);
    text('heat',x,y+22,coral,11);text('heater off at t = 4',x+bw/3,y+22,muted,10,'center');text('cool',x+bw,y+22,mint,11,'right');
    metric(0,q.heater.toFixed(0)+' K');metric(1,Math.max(...q.T).toFixed(1)+' K');metric(2,Math.max(...q.cure).toFixed(3));
  }
  function magnetic(){
    const strength=value('strength'),px=value('probe-x'),py=value('probe-y'),x0=24,y0=37,bw=w-48,bh=h-65;
    text(mode==='field'?'FIELD DIRECTION':mode==='force'?'GRADIENT OF FIELD ENERGY':'DIRECTIONAL STRESS AT THE PROBE',x0,21,mint,10);
    for(let j=1;j<15;j++)for(let i=1;i<25;i++){
      const x=i/25,y=j/15,q=C.magneticPoint(x,y,pole.x,pole.y,strength),force=mode==='force',vx=force?q.fx:q.hx,vy=force?q.fy:q.hy,r=Math.hypot(vx,vy),s=Math.min(13,3+Math.log1p(r)*2.3)/Math.max(r,1e-9);
      arrow(x0+x*bw,y0+y*bh,vx*s,vy*s,force?'#cbb1fabb':'#80d8c598');
    }
    [pole,{x:1-pole.x,y:1-pole.y}].forEach((p,i)=>{glow(x0+p.x*bw,y0+p.y*bh,38,i?'#ff9c7730':'#f4cc7830');dot(x0+p.x*bw,y0+p.y*bh,10,i?coral:gold,18);text(i?'−':'+',x0+p.x*bw,y0+p.y*bh+5,'#10171b',16,'center');});
    const q=C.magneticPoint(px,py,pole.x,pole.y,strength),x=x0+px*bw,y=y0+py*bh;
    dot(x,y,5,'#e9faf0',13);ctx.strokeStyle='#e9faf080';ctx.beginPath();ctx.arc(x,y,27,0,Math.PI*2);ctx.stroke();
    if(mode==='stress'){
      const nx=q.hx/Math.max(q.h,1e-9),ny=q.hy/Math.max(q.h,1e-9);
      for(const sign of [-1,1]){
        arrow(x+sign*nx*8,y+sign*ny*8,sign*nx*44*q.alignment,sign*ny*44*q.alignment,gold,2.3);
        arrow(x-sign*ny*58,y+sign*nx*58,sign*ny*28*q.alignment,-sign*nx*28*q.alignment,violet,2.3);
      }
      text('axial tension / transverse squeeze',w/2,h-12,gold,11,'center');
    }else text('Drag the + pole · sliders move the material probe',w/2,h-12,muted,w<580?10:11,'center');
    metric(0,q.h.toFixed(3));metric(1,Math.hypot(q.fx,q.fy).toFixed(3));metric(2,q.alignment.toFixed(3));canvas.mapping={x:x0,y:y0,w:bw,h:bh};
  }
  const draws={sph,projection,exchange,damage,thermal,magnetic};
  function render(){renderJob=0;ready();draws[kind]();}
  function invalidate(){if(!renderJob)renderJob=requestAnimationFrame(render);}
  function stop(){running=false;cancelAnimationFrame(animationJob);animationJob=0;lastTime=0;const button=document.getElementById(kind==='projection'?'converge':'cycle');if(button)button.textContent=button.dataset.label;}
  function tick(now){
    animationJob=0;if(!running)return;const dt=lastTime?Math.min(.055,(now-lastTime)/1000):0;lastTime=now;
    const id=kind==='projection'?'iterations':'time',input=document.getElementById(id),end=+input.max;
    // Keep sub-slider-step elapsed time: re-reading the quantized range value
    // every frame can freeze a slow cycle when each increment rounds to zero.
    animationValue=Math.min(end,animationValue+(kind==='projection'?4:dt*(kind==='thermal'?1.5:.5)));
    input.value=animationValue;
    if(kind==='projection')updateMac();render();if(+input.value>=end)stop();else animationJob=requestAnimationFrame(tick);
  }
  inputs.forEach(input=>input.addEventListener('input',()=>{stop();if(kind==='projection')updateMac();invalidate();}));
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
    mode=button.dataset.mode;document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));invalidate();
  }));
  document.getElementById('reset').addEventListener('click',()=>{
    stop();inputs.forEach((input,i)=>{input.value=initial[i];});probe={x:.44,y:.49};pole={x:.23,y:.3};model=null;
    const buttons=[...document.querySelectorAll('[data-mode]')];mode=buttons[0]?.dataset.mode||'';buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===0)));invalidate();
  });
  const runButton=document.getElementById(kind==='projection'?'converge':'cycle');
  if(runButton){runButton.dataset.label=runButton.textContent;runButton.addEventListener('click',()=>{
    if(running){stop();return;}const input=document.getElementById(kind==='projection'?'iterations':'time');
    // Resume the retained timeline; only a finished cycle starts a new replay.
    animationValue=+input.value>=+input.max?0:+input.value;input.value=animationValue;
    if(reduced.matches){input.value=input.max;if(kind==='projection')updateMac();invalidate();return;}
    running=true;runButton.textContent='Pause cycle Ⅱ';animationJob=requestAnimationFrame(tick);
  });}
  function move(event){
    if(!dragging)return;const r=canvas.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top,m=canvas.mapping;
    if(!m)return;
    if(kind==='sph')probe={x:C.clamp((x-m.ox)/m.scale,.02,.98),y:C.clamp((y-m.oy)/m.scale,.02,.98)};
    if(kind==='projection'){
      const panelX=x>m.x+m.w+10?m.x+m.w+20:m.x;
      probe={x:C.clamp((x-panelX)/m.w,.1,.9),y:C.clamp((y-m.y)/m.h,.1,.9)};stop();updateMac();
    }
    if(kind==='magnetic')pole={x:C.clamp((x-m.x)/m.w,.05,.95),y:C.clamp((y-m.y)/m.h,.05,.95)};
    invalidate();
  }
  if(['sph','projection','magnetic'].includes(kind)){
    canvas.style.cursor='crosshair';canvas.addEventListener('pointerdown',e=>{dragging=true;canvas.setPointerCapture(e.pointerId);move(e);});
    canvas.addEventListener('pointermove',move);['pointerup','pointercancel','lostpointercapture'].forEach(type=>canvas.addEventListener(type,()=>{dragging=false;}));
  }
  new ResizeObserver(invalidate).observe(canvas);
  // The early shared frame shim retains RAF work during hover suspension. Avoid
  // integrating the hidden duration when a cycle resumes, including standalone tabs.
  document.addEventListener('visibilitychange',()=>{lastTime=0;});
  window.addEventListener('message',event=>{if(event.source===window.parent&&event.origin===location.origin&&event.data?.type==='portfolio-lab-visibility')lastTime=0;});
  window.addEventListener('pagehide',stop);
  invalidate();
})();
