(() => {
  'use strict';
  const C=window.RecordingRecoveryCore,$=id=>document.getElementById(id),mint='#86e2c8',gold='#eccd89';
  const inputs=['heat-duration','heat-level','shear','time'].map($);
  let models=[],job=0;
  function surface(id){const canvas=$(id),box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=box.width,h=box.height;
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);return{ctx,w,h};}
  function line(ctx,points,color,width=1,dash=[]){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.setLineDash([]);}
  function label(ctx,text,x,y,color='#aebfb7',size=10){ctx.fillStyle=color;ctx.font=`${size}px system-ui,sans-serif`;ctx.fillText(text,x,y);}
  function specimen(id,model,index,color){
    const {ctx,w,h}=surface(id),s=model.samples[index],size=Math.min(h-73,w/(2+model.shear)),x=(w-size*(1+model.shear))/2,y=h-34;
    const xy=(u,v,g)=>[x+size*(u+g*v),y-size*v];
    const shape=g=>[xy(0,0,g),xy(1,0,g),xy(1,1,g),xy(0,1,g),xy(0,0,g)];
    line(ctx,[[15,y+3],[w-15,y+3]],'#68877c50');
    line(ctx,shape(0),'#baccc275',1,[4,4]);
    if(s.released)line(ctx,shape(model.shear),'#cead7040',1,[2,5]);
    ctx.beginPath();shape(s.totalShear).forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.fillStyle=color+'14';ctx.fill();line(ctx,shape(s.totalShear),color,1.7);
    for(let k=1;k<8;k++){const q=k/8;line(ctx,[xy(q,0,s.totalShear),xy(q,1,s.totalShear)],color+'60');line(ctx,[xy(0,q,s.totalShear),xy(1,q,s.totalShear)],color+'60');}
    label(ctx,s.released?'LOAD RELEASED':index===0?'DISTORTION IMPOSED':s.heating?'HEATING · LOAD HELD':'COOLING · LOAD HELD',14,24,s.heating?'#efaf7f':color,9);
    label(ctx,`Liquid ${Math.round(s.phi*100)}%  ·  stiffness ${(s.stiffness*100).toFixed(0)}%`,14,h-12,'#afc5ba',9);
    if(!s.released){const top=xy(.5,1,s.totalShear);line(ctx,[[top[0]-20,top[1]-10],[top[0]+20,top[1]-10]],gold,1.3);line(ctx,[[top[0]+15,top[1]-14],[top[0]+20,top[1]-10],[top[0]+15,top[1]-6]],gold,1.3);}
  }
  function history(index){const{ctx,w,h}=surface('history-view'),left=33,right=w-16,top=26,bottom=h-29,x=i=>left+(right-left)*i/C.END,y=v=>bottom-(bottom-top)*v;
    for(const value of [0,.5,1]){line(ctx,[[left,y(value)],[right,y(value)]],'#a6be9b18');label(ctx,String(Math.round(value*100))+'%',3,y(value)+3,'#8fa69d',9);}
    for(const [m,color]of[[models[0],mint],[models[1],gold]]){line(ctx,m.samples.map(s=>[x(s.update),y(s.memory)]),color,2);line(ctx,m.samples.map(s=>[x(s.update),y(s.phi)]),color+'80',1.3,[3,4]);}
    line(ctx,[[x(index),top-4],[x(index),bottom]],'#d8e8cfaa',1,[2,3]);line(ctx,[[x(C.RELEASE),top],[x(C.RELEASE),bottom]],'#dcad7638',1);
    label(ctx,'MEMORY / PHASE',left,13,'#afc5ba',9);label(ctx,'Heat + cool, with deformation held',left,h-9,'#90a69a',9);
    label(ctx,'release',Math.max(left,x(C.RELEASE)-18),13,gold,9);
  }
  function draw(){job=0;const index=+$('time').value,duration=+$('heat-duration').value,heatLevel=+$('heat-level').value,shear=+$('shear').value;
    models=[C.solve({heatSteps:C.REFERENCE,heatLevel,shear}),C.solve({heatSteps:duration,heatLevel,shear})];
    $('heat-duration-value').textContent=duration+' updates';$('heat-level-value').textContent=Math.round(heatLevel*100)+'%';$('shear-value').textContent=shear.toFixed(2);$('time-value').textContent=index+' / '+C.END;
    $('selected-duration').textContent='Your pulse / '+duration+' heated updates';
    $('selected-title').textContent=models[1].final.memory>.85?'Keep the elastic memory.':models[1].final.memory>.2?'Recover only part of the shear.':'Leave a permanent distortion.';
    for(const [i,prefix,color]of[[0,'reference',mint],[1,'selected',gold]]){const m=models[i],s=m.samples[index];specimen(prefix+'-view',m,index,color);$(prefix+'-memory').textContent=(s.memory*100).toFixed(1)+'%';$(prefix+'-set').textContent=m.final.totalShear.toFixed(3);}
    const current=models[1].samples[index];
    $('sequence-note').textContent=current.released?'Both samples are fully cooled and unloaded. Dashed square: original shape. Faint slanted outline: the same held deformation.':index===0?'The same shear is imposed on both samples before heating.':current.heating?'Your sample is still being heated. The local strain memory can decay as the phase fraction rises.':'The heat is off for your sample; cooling restores stiffness. The load stays in place until update 100.';
    for(const button of document.querySelectorAll('[data-time]'))button.setAttribute('aria-pressed',String(+button.dataset.time===index));
    history(index);
  }
  const schedule=()=>{if(!job)job=requestAnimationFrame(draw);};
  inputs.forEach(input=>input.addEventListener('input',schedule));
  document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>{$('time').value=button.dataset.time;schedule();}));
  const observer=new ResizeObserver(schedule);observer.observe(document.querySelector('.comparison'));
  window.addEventListener('pagehide',event=>{if(!event.persisted)observer.disconnect();cancelAnimationFrame(job);job=0;});
  window.addEventListener('pageshow',schedule);schedule();
})();
