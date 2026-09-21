(() => {
  'use strict';
  const C=window.PhysicsFoundation,kind=document.body.dataset.foundation,canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
  const $=id=>document.getElementById(id),v=id=>+$(id).value;
  const gold='#f3cd80',mint='#85ead0',violet='#c0a5ff',coral='#ffa081',muted='#acc0c9';
  let pending=0,tick=0,playing=false,last=0,playhead=0,w=900,h=420;
  const controls=[...document.querySelectorAll('input')],initial=controls.map(e=>e.value);
  function text(s,x,y,color=muted,size=12){ctx.fillStyle=color;ctx.font=`${size}px system-ui`;ctx.textAlign='left';ctx.fillText(s,x,y);}
  function line(x,y,xx,yy,color,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.stroke();}
  function arrow(x,y,dx,dy,color){const len=Math.hypot(dx,dy);if(len<.4)return;line(x,y,x+dx,y+dy,color,2);const a=Math.atan2(dy,dx);for(const d of [-.5,.5])line(x+dx,y+dy,x+dx-6*Math.cos(a+d),y+dy-6*Math.sin(a+d),color,2);}
  function path(points,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();}
  function dot(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.fill();}
  function metric(i,s){$(`metric-${i}`).textContent=s;}
  function ready(){const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);w=box.width;h=box.height;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#0c1620';ctx.fillRect(0,0,w,h);controls.forEach(e=>$(e.id+'-value').textContent=Number(e.value).toFixed(Number(e.step)<1?2:0));}
  function matter(){
    const q=C.response(v('area'),v('shear'),v('rotation')*Math.PI/180),vertical=w<620;
    const bw=vertical?w:w/3,bh=vertical?h/3:h;
    ['Independent points','Liquid at rest','Elastic jelly'].forEach((label,k)=>{
      const ox=vertical?0:k*bw,oy=vertical?k*bh:0,scale=Math.min(bw*.26,bh*.24),cx=ox+bw/2,cy=oy+bh*.48;
      const color=[gold,mint,violet][k],xy=(x,y)=>[cx+scale*(q.F[0]*x+q.F[1]*y),cy-scale*(q.F[2]*x+q.F[3]*y)];
      ctx.fillStyle=color+'08';ctx.fillRect(ox+8,oy+8,bw-16,bh-16);text(label,ox+20,oy+30,color,14);
      ctx.setLineDash([3,4]);path([[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]].map(([x,y])=>[cx+scale*x,cy-scale*y]),'#7992a244');ctx.setLineDash([]);
      if(k===2){for(let i=0;i<=6;i++){const t=-.9+i*.3;path([xy(t,-.9),xy(t,.9)],violet+'55');path([xy(-.9,t),xy(.9,t)],violet+'55');}}
      for(let y=0;y<7;y++)for(let x=0;x<7;x++){
        const p=xy(-.9+x*.3,-.9+y*.3);if(k===1&&x===3&&y===3){ctx.strokeStyle=mint+'55';ctx.beginPath();ctx.arc(...p,scale*.6,0,2*Math.PI);ctx.stroke();}dot(...p,2.5,color);
      }
      if(k>0){
        const S=k===1?q.fluidStress:q.stress;
        // Cauchy traction sigma*n on the actual deformed patch faces.
        const face=[[1,0,q.F[3],-q.F[1]],[-1,0,-q.F[3],q.F[1]],[0,1,-q.F[2],q.F[0]],[0,-1,q.F[2],-q.F[0]]];
        for(const [x,y,nx,ny] of face){const nn=Math.hypot(nx,ny),p=xy(x,y),tx=(S[0]*nx+S[1]*ny)/nn,ty=(S[2]*nx+S[3]*ny)/nn;arrow(...p,tx*scale*.13,-ty*scale*.13,color);}
      }
      const yy=oy+bh-52;
      text(k===0?'No density or strain response.':k===1?`Density ${q.density.toFixed(2)} · pressure ${q.pressure.toFixed(2)}`:`Shape energy ${q.shapeEnergy.toFixed(2)}`,ox+20,yy,color,12);
      text(k===0?'Contact alone adds no shape memory.':k===1?'No static shear memory.': 'The rest configuration matters.',ox+20,yy+21,muted,11);
    });
    metric(0,q.J.toFixed(2));metric(1,q.pressure.toFixed(2));metric(2,q.shapeEnergy.toFixed(2));
  }
  function cavity(){
    const time=v('time'),gap=v('gap'),breach=v('breach'),opened=time>=breach;
    const topo=C.topology(opened?gap:0),closed=C.chamber({heating:v('heating')}),vent=C.chamber({gap,breach,heating:v('heating')});
    const nearest=a=>a.trace.reduce((best,x)=>Math.abs(x.time-time)<Math.abs(best.time-time)?x:best,a.trace[0]);
    const current=nearest(vent),vertical=w<620,fw=vertical?w:w*.53,fh=vertical?h*.55:h;
    const size=Math.min((fw-36)/topo.n,(fh-80)/topo.ny),ox=(fw-size*topo.n)/2,oy=45;
    text(topo.trapped?'SEALED · outside cannot reach the interior':'OPEN · a path reaches the outside',18,25,topo.trapped?gold:mint,w<500?10:12);
    for(let y=0;y<topo.ny;y++)for(let x=0;x<topo.n;x++){
      const i=y*topo.n+x;
      ctx.fillStyle=topo.walls[i]?'#8b9b90':!topo.outside[i]?'#c6974455':'#356f7140';
      ctx.fillRect(ox+x*size,oy+y*size,size-.5,size-.5);
    }
    const cx=ox+(topo.x0+topo.x1+1)/2*size,cy=oy+(topo.y0+topo.y1+1)/2*size;
    const g=ctx.createRadialGradient(cx,cy,0,cx,cy,7*size);g.addColorStop(0,`rgba(255,139,69,${Math.min(.7,(current.T-1)*.3)})`);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(cx-7*size,cy-7*size,14*size,14*size);
    for(let i=0;i<9;i++){
      if(opened&&gap){
        const phase=(time*.08+i*.117)%1,x=cx+(ox+(topo.x1+5)*size-cx)*phase;
        const routeY=oy+(topo.mid+(gap%2)/2)*size;
        dot(x,routeY+Math.sin(i*2.5)*gap*size*.3,2,mint);
      }else{
        const angle=time*.3+i*2.4,r=(2+i%4)*size;
        dot(cx+Math.cos(angle)*r,cy+Math.sin(angle)*r,2,gold);
      }
    }
    text(time<3?'Heat enters the chamber.':'Heater off · retained energy can still vent.',18,fh-15,coral,11);
    const px=vertical?42:fw+40,py=vertical?fh+35:55,pw=w-px-25,ph=(vertical?h-fh:h)-100;
    const ymax=Math.max(...closed.trace.map(p=>p.pressure))*1.1;
    const plot=(x,y)=>[px+x/10*pw,py+ph-y/ymax*ph];
    text('CHAMBER PRESSURE · same heat input',px,py-18,gold,w<500?10:12);
    for(let i=0;i<5;i++){const y=i*ymax/4;line(px,plot(0,y)[1],px+pw,plot(0,y)[1],'#8eafbb20');text(y.toFixed(1),px-27,plot(0,y)[1]+3,muted,10);}
    path(closed.trace.map(p=>plot(p.time,p.pressure)),gold,2);path(vent.trace.map(p=>plot(p.time,p.pressure)),mint,2.5);
    line(...plot(0,1),...plot(10,1),'#ffffff50');
    const marker=plot(time,current.pressure);line(marker[0],py,marker[0],py+ph,'#c3b0ff77');dot(...marker,5,violet);
    text('0',px,py+ph+18,muted,10);text('10 · time',px+pw-45,py+ph+18,muted,10);
    text('Gold: sealed     Mint: chosen vent',px,py+ph+39,muted,11);
    metric(0,topo.trapped?`${topo.trapped} cells`:'0 · connected');metric(1,current.pressure.toFixed(2));metric(2,current.T.toFixed(2));
  }
  function draw(){pending=0;ready();if(kind==='matter')matter();else cavity();}
  function schedule(){if(!pending)pending=requestAnimationFrame(draw);}
  controls.forEach(e=>e.addEventListener('input',()=>{if(e.id==='time')playhead=v('time');schedule();}));
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{
    if(kind==='matter'){const presets={shear:[1,.8,0],compression:[.7,0,0],rotation:[1,0,50]};['area','shear','rotation'].forEach((key,i)=>$(key).value=presets[b.dataset.preset][i]);}
    else {const presets={sealed:[0,4],vented:[4,0],breach:[3,4]};['gap','breach'].forEach((key,i)=>$(key).value=presets[b.dataset.preset][i]);}
    schedule();
  }));
  // Keep sub-step time outside the range input: the browser snaps its value to
  // .05 steps, which would otherwise erase a typical 60 Hz frame increment.
  function animate(now){tick=0;if(!playing)return;if(last)playhead=(playhead+Math.min(.05,(now-last)/1000))%10;$('time').value=playhead;last=now;schedule();tick=requestAnimationFrame(animate);}
  $('play')?.addEventListener('click',()=>{playing=!playing;$('play').textContent=playing?'Pause timeline ‖':'Play timeline ↗';last=0;playhead=v('time');if(tick)cancelAnimationFrame(tick);tick=playing?requestAnimationFrame(animate):0;});
  $('reset').addEventListener('click',()=>{playing=false;last=0;if(tick)cancelAnimationFrame(tick);tick=0;if($('play'))$('play').textContent='Play timeline ↗';controls.forEach((e,i)=>e.value=initial[i]);if($('time'))playhead=v('time');schedule();});
  addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='portfolio-lab-visibility')last=0;});
  new ResizeObserver(schedule).observe(canvas);schedule();
})();
