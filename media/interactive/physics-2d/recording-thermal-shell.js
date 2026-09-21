(() => {
  'use strict';
  const C=RecordingShell,$=id=>document.getElementById(id),canvas=$('shell-view'),ctx=canvas.getContext('2d'),inputs=[...document.querySelectorAll('input[type=range]')];
  const initial=inputs.map(v=>v.value),reduced=matchMedia('(prefers-reduced-motion:reduce)');let renderId=0,runId=0,running=false,last=0,clock=+$('time').value;
  const text=(s,x,y,color='#b6c5cd',size=11,align='left')=>{ctx.fillStyle=color;ctx.font=`${size}px system-ui`;ctx.textAlign=align;ctx.fillText(s,x,y);};
  function line(points,color,width=1,dash=[]){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.setLineDash([]);}
  const tint=t=>{const v=C.clamp((t-300)/400);return `rgb(${Math.round(111+144*v)},${Math.round(174-26*v)},${Math.round(195-123*v)})`;};
  function draw(){
    renderId=0;const box=canvas.getBoundingClientRect(),w=Math.max(280,box.width),h=box.height,dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b1720';ctx.fillRect(0,0,w,h);
    const m=C.sample(Object.fromEntries(inputs.map(v=>[v.id,+v.value]))),compact=w<650,cx=compact?w/2:w*.26,cy=compact?149:183,r=compact?82:Math.min(100,w*.15),radius=r*m.geometry.r;
    inputs.forEach(v=>{$(v.id+'-value').textContent=v.id==='time'?(+v.value).toFixed(2):v.value;});
    text('SURFACE / CORE CROSS SECTION',20,25,'#f3cd80',10);
    ctx.save();ctx.globalAlpha=.2;ctx.fillStyle=tint(m.Tc);ctx.beginPath();ctx.arc(cx,cy,radius-13,0,2*Math.PI);ctx.fill();ctx.restore();
    for(let i=0;i<Math.floor(65*m.core.gas);i++){const a=i*2.399963,rho=Math.sqrt((i+.5)/65)*(radius-23);ctx.fillStyle='#edce8599';ctx.beginPath();ctx.arc(cx+Math.cos(a)*rho,cy+Math.sin(a)*rho,1.7,0,7);ctx.fill();}
    const gap=m.tear>.6?.12+(m.tear-.6)*.5:0;ctx.lineWidth=12;ctx.strokeStyle=tint(m.Ts);ctx.beginPath();ctx.arc(cx,cy,radius,-Math.PI/2+gap,Math.PI*1.5-gap);ctx.stroke();
    ctx.lineWidth=2;ctx.strokeStyle='#eac371';ctx.beginPath();ctx.arc(cx,cy,radius+10,-Math.PI/2,-Math.PI/2+2*Math.PI*m.shell.cure);ctx.stroke();
    ctx.setLineDash([4,5]);ctx.strokeStyle='#7fe7ca';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(cx,cy,r*m.geometry.rc,0,7);ctx.stroke();ctx.setLineDash([]);
    if(gap)for(let j=0;j<5;j++){const dx=(j-2)*7;line([[cx+dx*.4,cy-radius-7],[cx+dx,cy-radius-30-j%2*12]],'#7fe7ca99');}
    text(Math.round(m.Tc)+' K',cx,cy-6,'#ecdfbd',19,'center');text('core gas '+Math.round(m.core.gas*100)+'%',cx,cy+15,'#d1bb83',11,'center');
    text('shell '+Math.round(m.Ts)+' K',cx,cy+radius+32,'#f3cd80',11,'center');text(gap?'Vent open · stored gas can escape':'Shell restrains the preferred core size',cx,compact?294:339,gap?'#7fe7ca':'#b6c5cd',compact?10:11,'center');
    const plot={x:compact?36:w*.53,y:compact?340:75,w:compact?w-60:w*.42,h:compact?133:228};
    text('STATE HISTORY',plot.x,plot.y-20,'#f3cd80',10);line([[plot.x,plot.y],[plot.x,plot.y+plot.h],[plot.x+plot.w,plot.y+plot.h]],'#6e8b9f55');
    for(const [key,color,dash]of [['shell','#e8c77c',[]],['core','#7fe7ca',[]],['gas','#b9a6ff',[]],['tear','#ff9274',[4,3]]])line(m.history.map(q=>[plot.x+q.t/18*plot.w,plot.y+(1-q[key])*plot.h]),color,2,dash);
    const eventX=plot.x+8/18*plot.w;line([[eventX,plot.y],[eventX,plot.y+plot.h]],'#8e9ca855',1,[2,4]);text('heat off',eventX+4,plot.y+12,'#8195a5',9);
    text('0',plot.x-13,plot.y+plot.h+3);text('1',plot.x-13,plot.y+4);text('0 s',plot.x,plot.y+plot.h+18);text('18 s',plot.x+plot.w,plot.y+plot.h+18,'#b6c5cd',11,'right');
    const ly=plot.y+plot.h+37;for(const [i,label,color]of [[0,'shell set','#e8c77c'],[1,'core set','#7fe7ca'],[2,'core gas','#b9a6ff'],[3,'tear','#ff9274']])text(label,plot.x+i*plot.w/4,ly,color,compact?9:10);
    $('phase').textContent=m.phase;$('temperature').textContent=Math.round(m.Ts)+' / '+Math.round(m.Tc)+' K';$('setting').textContent=Math.round(m.shell.cure*100)+' / '+Math.round(m.core.cure*100)+'%';$('vent').textContent=Math.round(m.tear*100)+'%'+(gap?' · open':' · closed');
  }
  function invalidate(){if(!renderId)renderId=requestAnimationFrame(draw);}
  function stop(){running=false;cancelAnimationFrame(runId);runId=0;last=0;$('cycle').textContent='Run heat / cool cycle ↗';}
  function tick(now){runId=0;if(!running)return;clock=Math.min(18,clock+(last?Math.min(.05,(now-last)/1000)*1.3:0));last=now;$('time').value=clock;draw();if(clock>=18)stop();else runId=requestAnimationFrame(tick);}
  inputs.forEach(v=>v.addEventListener('input',()=>{stop();invalidate();}));
  $('cycle').addEventListener('click',()=>{if(running){stop();return;}clock=+$('time').value>=18?0:+$('time').value;if(reduced.matches){$('time').value=18;invalidate();return;}running=true;last=0;$('cycle').textContent='Pause cycle Ⅱ';runId=requestAnimationFrame(tick);});
  $('reset').addEventListener('click',()=>{stop();inputs.forEach((v,i)=>v.value=initial[i]);invalidate();});
  new ResizeObserver(invalidate).observe(canvas);document.addEventListener('visibilitychange',()=>{last=0;});
  window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='portfolio-lab-visibility')last=0;});
  reduced.addEventListener('change',()=>{if(reduced.matches)stop();});window.addEventListener('pagehide',stop);invalidate();
})();
