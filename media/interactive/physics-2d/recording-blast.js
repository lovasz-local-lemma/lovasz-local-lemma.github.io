(()=>{'use strict';
  const C=window.RecordingBlastCore,$=id=>document.getElementById(id),canvas=$('blast-view'),ctx=canvas.getContext('2d');
  const gold='#f2cf83',mint='#88e5cb',coral='#ff9a85',violet='#bca6ee';let raf=0,playFrame=0,playing=false,last=0,elapsed=0;
  const settings=()=>({dt:+$('dt').value,energy:+$('energy').value,width:+$('width').value,gap:+$('gap').value,step:+$('step').value,walls:$('walls').checked});
  const text=(s,x,y,color='#aec1ca',size=12)=>{ctx.fillStyle=color;ctx.font=`${size}px system-ui`;ctx.fillText(s,x,y);};
  function line(a,b,color,width=1){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  function circle(p,r,color,fill=false){ctx.beginPath();ctx.arc(p.x,p.y,r,0,2*Math.PI);if(fill){ctx.fillStyle=color;ctx.fill();}else{ctx.strokeStyle=color;ctx.stroke();}}
  function drawPanel(box,q,method,p){
    const scale=Math.min((box.w-30)/9.6,(box.h-70)/6),ox=box.x+(box.w-9.6*scale)/2,oy=box.y+44;
    const xy=v=>({x:ox+v.x*scale,y:oy+v.y*scale});
    text(method==='narrow'?'01  ·  CHECK ONLY THE THIN RING':'02  ·  CHECK THE SWEPT REGION',box.x+14,box.y+23,method==='narrow'?coral:mint,11);
    ctx.save();ctx.beginPath();ctx.rect(box.x+8,box.y+36,box.w-16,box.h-61);ctx.clip();
    for(let x=0;x<10;x++)line(xy({x,y:0}),xy({x,y:6}),'#233942',.5);
    for(let y=0;y<=6;y++)line(xy({x:0,y}),xy({x:9.6,y}),'#233942',.5);
    const origin=xy(q.origin);
    if(q.step>0){ctx.beginPath();ctx.arc(origin.x,origin.y,(method==='narrow'?q.r+p.width/2:q.r)*scale,0,Math.PI*2);ctx.arc(origin.x,origin.y,(method==='narrow'?Math.max(0,q.r-p.width/2):q.previous)*scale,0,Math.PI*2,true);ctx.fillStyle=method==='narrow'?'#ffba7844':'#88e5cb20';ctx.fill('evenodd');}
    ctx.lineWidth=1.2;circle(origin,q.r*scale,gold);ctx.setLineDash([4,5]);circle(origin,q.previous*scale,'#b9c2bb77');ctx.setLineDash([]);
    q.barriers.forEach(b=>{const pos=xy(b);ctx.fillStyle='#b7a277';ctx.fillRect(pos.x,pos.y,b.w*scale,b.h*scale);});
    q.probes.forEach(probe=>{
      const position=xy(probe),hit=method==='narrow'?probe.narrowStep:probe.sweptStep;
      const color=hit?mint:probe.passed?(probe.blocked?violet:coral):'#54717f';
      if(probe.blocked&&probe.passed&&probe.y>2.5&&probe.y<3.8)line(origin,position,'#bca6ee35');
      circle(position,hit===q.step&&hit?4.5:3,color,true);
      if(hit){const length=Math.min(20,28/(probe.d*probe.d+.2));const end={x:position.x+(probe.x-q.origin.x)/probe.d*length,y:position.y+(probe.y-q.origin.y)/probe.d*length};line(position,end,mint,1.2);}
    });
    ctx.shadowColor=gold;ctx.shadowBlur=12;circle(origin,5,gold,true);ctx.shadowBlur=0;
    ctx.restore();text('source',origin.x-18,origin.y-15,gold,10);
    text(method==='narrow'?`${q.narrowHits} arrivals · ${q.missed} skipped`:`${q.sweptHits} arrivals · ${q.blocked} blocked`,box.x+14,box.y+box.h-8,method==='narrow'?coral:mint,12);
  }
  function render(){
    raf=0;const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height,dpr=Math.min(devicePixelRatio||1,2);
    const nw=Math.round(w*dpr),nh=Math.round(h*dpr);if(canvas.width!==nw||canvas.height!==nh){canvas.width=nw;canvas.height=nh;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const p=settings(),q=C.evaluate(p);
    const stacked=w<670,gap=stacked?13:14,bw=stacked?w:(w-gap)/2,bh=stacked?(h-gap)/2:h;
    drawPanel({x:0,y:0,w:bw,h:bh},q,'narrow',p);drawPanel({x:stacked?0:bw+gap,y:stacked?bh+gap:0,w:bw,h:bh},q,'swept',p);
    if(stacked)line({x:14,y:bh+gap/2},{x:w-14,y:bh+gap/2},'#40535b');else line({x:bw+gap/2,y:12},{x:bw+gap/2,y:h-12},'#40535b');
    for(const id of ['dt','energy','width','gap'])$(id+'-out').textContent=p[id].toFixed(id==='dt'||id==='width'?2:1);
    $('step-out').textContent=`${p.step} · t = ${q.time.toFixed(2)}`;
    $('narrow-count').textContent=q.narrowHits;$('swept-count').textContent=q.sweptHits;$('missed-count').textContent=q.missed;$('blocked-count').textContent=q.blocked;
    $('takeaway').textContent=q.missed?`${q.missed} reachable probes fell between the sampled rings. The swept interval catches their arrival even at this coarse step size.`:'Reduce the ring width or increase the frame interval to expose probes that a ring-only test skips.';
  }
  function invalidate(){if(!raf)raf=requestAnimationFrame(render);}
  function stop(){playing=false;cancelAnimationFrame(playFrame);playFrame=0;last=0;elapsed=0;$('play').textContent='Play arrival';}
  function advance(){if(+$('step').value>=+$('step').max){stop();return;}$('step').value=+$('step').value+1;invalidate();}
  function tick(now){playFrame=0;if(!playing)return;elapsed+=last?Math.min(.08,(now-last)/1000):0;last=now;if(elapsed>.45){elapsed=0;advance();}if(playing)playFrame=requestAnimationFrame(tick);}
  $('play').addEventListener('click',()=>{if(playing){stop();return;}if(+$('step').value>=+$('step').max)$('step').value=0;if(matchMedia('(prefers-reduced-motion:reduce)').matches){advance();return;}playing=true;$('play').textContent='Pause arrival';playFrame=requestAnimationFrame(tick);});
  $('next').addEventListener('click',()=>{stop();advance();});$('reset').addEventListener('click',()=>{stop();$('step').value=0;invalidate();});
  document.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{stop();$('step').max=Math.ceil(2/+$('dt').value);invalidate();}));
  new ResizeObserver(invalidate).observe(canvas);document.addEventListener('visibilitychange',()=>{last=0;});
  window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='portfolio-lab-visibility')last=0;});
  window.addEventListener('pagehide',stop);invalidate();
})();
