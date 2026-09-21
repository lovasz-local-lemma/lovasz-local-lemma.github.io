/* Interactive version of the authored five-mode parameter sweep. */
(() => {
  'use strict';
  const model=window.ModalCrossingModel, $=id=>document.getElementById(id);
  const graph=$('crossing-graph'),shape=$('crossing-shape');if(!graph||!model)return;
  const parameter=$('crossing-parameter'),coupling=$('crossing-coupling'),play=$('crossing-play');
  const colors=['#e8c674','#80dcc1','#83b4ef','#b9a0ef','#ed9b9f'],names=['A','B','C','D','E'];
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let x=.30,g=.055,playing=!motion.matches,direction=1,phase=0,previous=0,mode=0,basis=0,follow='character';
  let history=model.sweep(g),current=model.solve(x,g),selected=0,lastText=0;
  let backdrop=document.createElement('canvas'),needsChart=true,lastSize='',frame=0;
  function select(){selected=follow==='character'?model.characterMode(current,basis):mode;}
  function canvasContext(canvas){
    const width=Math.max(200,canvas.clientWidth),height=Math.max(80,canvas.clientHeight),dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);needsChart=true;}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,width,height,dpr};
  }
  function layout(width,height){
    return {px:t=>42+(width-62)*t,py:v=>height-35-(height-66)*(v-.7)/2.85,left:42,right:width-20,top:31,bottom:height-35};
  }
  function text(ctx,value,xp,yp,color='#b1c7bf',align='left',size=11){ctx.fillStyle=color;ctx.font=size+'px system-ui';ctx.textAlign=align;ctx.fillText(value,xp,yp);}
  function chart(w,h,dpr){
    backdrop.width=Math.round(w*dpr);backdrop.height=Math.round(h*dpr);
    const ctx=backdrop.getContext('2d');ctx.scale(dpr,dpr);const p=layout(w,h);
    ctx.fillStyle='#0c1519';ctx.fillRect(0,0,w,h);ctx.lineWidth=1;ctx.strokeStyle='#8bbfac20';
    for(let i=1;i<=3;i++){const y=p.py(i);ctx.beginPath();ctx.moveTo(p.left,y);ctx.lineTo(p.right,y);ctx.stroke();text(ctx,i.toFixed(1),p.left-8,y+4,'#8daba0','right');}
    for(let i=0;i<=4;i++)text(ctx,(i/4).toFixed(2),p.px(i/4),h-14,'#8daba0','center');
    text(ctx,'eigenvalue λ = ω² (relative units)',12,18,'#c1d0c4');
    text(ctx,'parameter s',w-20,h-2,'#91b7a6','right',10);
    for(let k=0;k<5;k++){
      for(let i=1;i<history.samples.length;i++){
        const t=i/(history.samples.length-1),a=history.samples[i-1],b=history.samples[i];
        const weight=follow==='character'?(a.vectors[k][basis]**2+b.vectors[k][basis]**2)/2:(k===mode?1:.10);
        ctx.globalAlpha=.20+.80*weight;ctx.strokeStyle=follow==='character'?colors[basis]:colors[k];ctx.lineWidth=1.4+2.2*weight;
        ctx.beginPath();ctx.moveTo(p.px(t-1/(history.samples.length-1)),p.py(a.values[k]));ctx.lineTo(p.px(t),p.py(b.values[k]));ctx.stroke();
      }
    }
    ctx.globalAlpha=1;
    for(const approach of history.approaches){const result=history.samples[Math.round(approach.parameter*(history.samples.length-1))];const y=p.py((result.values[approach.mode]+result.values[approach.mode+1])/2);ctx.strokeStyle='#eaca7577';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.px(approach.parameter),y,8,0,Math.PI*2);ctx.stroke();}
    needsChart=false;
  }
  function drawGraph(){
    const {ctx,width:w,height:h,dpr}=canvasContext(graph),size=w+':'+h+':'+dpr;
    if(lastSize!==size){lastSize=size;needsChart=true;}
    if(needsChart)chart(w,h,dpr);
    ctx.clearRect(0,0,w,h);ctx.drawImage(backdrop,0,0,w,h);const p=layout(w,h),cx=p.px(x);
    ctx.strokeStyle='#faf0bd8c';ctx.lineWidth=1;ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(cx,p.top);ctx.lineTo(cx,p.bottom);ctx.stroke();ctx.setLineDash([]);
    for(let k=0;k<5;k++){ctx.fillStyle=k===selected?'#fff5c7':colors[k];ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=k===selected?14:0;ctx.beginPath();ctx.arc(cx,p.py(current.values[k]),k===selected?5:3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  }
  function drawShape(){
    const {ctx,width:w,height:h}=canvasContext(shape),v=current.vectors[selected],mid=h*.51;
    ctx.fillStyle='#0c1519';ctx.fillRect(0,0,w,h);text(ctx,'Selected eigenvector · illustrative sine basis',12,18,'#d7d3ab');
    ctx.strokeStyle='#769d8e44';ctx.beginPath();ctx.moveTo(16,mid);ctx.lineTo(w-16,mid);ctx.stroke();
    function value(t){return v.reduce((sum,c,j)=>sum+c*Math.sin((j+1)*Math.PI*t),0);}
    let maximum=1;for(let i=0;i<=120;i++)maximum=Math.max(maximum,Math.abs(value(i/120)));
    function curve(scale,alpha,width){ctx.globalAlpha=alpha;ctx.strokeStyle=colors[follow==='character'?basis:selected];ctx.lineWidth=width;ctx.beginPath();for(let i=0;i<=160;i++){const t=i/160,xx=16+(w-32)*t,yy=mid-(h*.28/maximum)*value(t)*scale;if(i)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy);}ctx.stroke();ctx.globalAlpha=1;}
    curve(1,.23,1.2);curve(-1,.23,1.2);ctx.shadowBlur=10;ctx.shadowColor=colors[follow==='character'?basis:selected];curve(Math.cos(phase),1,2.4);ctx.shadowBlur=0;
    text(ctx,'Motion slowed for inspection · amplitude normalized',w/2,h-12,'#9fbbb0','center',10);
  }
  function updateText(){
    parameter.value=x;coupling.value=g;$('crossing-parameter-value').value=x.toFixed(3);$('crossing-coupling-value').value=g.toFixed(3);
    const v=current.vectors[selected],gaps=current.values.slice(1).map((value,i)=>value-current.values[i]);
    $('crossing-readout').textContent='Sorted mode '+(selected+1)+' · λ '+current.values[selected].toFixed(3)+' · closest gap '+Math.min(...gaps).toFixed(3);
    for(let i=0;i<5;i++){const weight=100*v[i]**2;$('crossing-bar-'+i).style.width=weight+'%';$('crossing-weight-'+i).value=Math.round(weight)+'%';}
    $('crossing-follow-note').textContent=follow==='character'?'Bright segments contain more of basis '+names[basis]+'. The selected dot follows whichever mode contains the largest share; its sorted index can change.':'Follow the '+(mode+1)+(mode===0?'st':mode===1?'nd':mode===2?'rd':'th')+' lowest eigenvalue. Its index stays fixed while the basis contributions below can exchange.';
  }
  function sync(){select();drawGraph();drawShape();updateText();}
  function setX(value){x=Math.max(0,Math.min(1,value));current=model.solve(x,g);sync();}
  function schedule(){if(!frame&&(playing||!motion.matches))frame=requestAnimationFrame(tick);}
  function setPlaying(value){playing=value;play.textContent=playing?'Pause sweep':'Play sweep';play.setAttribute('aria-pressed',String(playing));schedule();}
  parameter.addEventListener('input',()=>{setPlaying(false);setX(+parameter.value);});
  coupling.addEventListener('input',()=>{g=+coupling.value;history=model.sweep(g);current=model.solve(x,g);needsChart=true;sync();});
  play.addEventListener('click',()=>setPlaying(!playing));
  $('crossing-next').addEventListener('click',()=>{setPlaying(false);const next=history.approaches.find(item=>item.parameter>x+.015)||history.approaches[0];if(next)setX(next.parameter);});
  $('crossing-reset').addEventListener('click',()=>{x=.30;g=.055;direction=1;phase=0;follow='character';basis=0;mode=0;history=model.sweep(g);current=model.solve(x,g);needsChart=true;refreshChoices();setPlaying(!motion.matches);sync();});
  function refreshChoices(){
    document.querySelectorAll('[data-cross-follow]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.crossFollow===follow)));
    document.querySelectorAll('[data-cross-choice]').forEach((button,i)=>{button.textContent=follow==='character'?'Basis '+names[i]:'Mode '+(i+1);button.setAttribute('aria-pressed',String(i===(follow==='character'?basis:mode)));});
  }
  document.querySelectorAll('[data-cross-follow]').forEach(button=>button.addEventListener('click',()=>{follow=button.dataset.crossFollow;needsChart=true;refreshChoices();sync();}));
  document.querySelectorAll('[data-cross-choice]').forEach((button,i)=>button.addEventListener('click',()=>{if(follow==='character')basis=i;else mode=i;needsChart=true;refreshChoices();sync();}));
  function scrub(event){const rect=graph.getBoundingClientRect(),p=layout(rect.width,rect.height);setPlaying(false);setX((event.clientX-rect.left-p.left)/(p.right-p.left));}
  graph.addEventListener('pointerdown',event=>{graph.setPointerCapture(event.pointerId);scrub(event);});
  graph.addEventListener('pointermove',event=>{if(graph.hasPointerCapture(event.pointerId))scrub(event);});
  graph.addEventListener('pointerup',event=>{if(graph.hasPointerCapture(event.pointerId))graph.releasePointerCapture(event.pointerId);});
  new ResizeObserver(()=>{needsChart=true;sync();}).observe(graph);
  motion.addEventListener('change',()=>{if(motion.matches)setPlaying(false);else schedule();});
  function tick(now){
    frame=0;
    const dt=previous?Math.min((now-previous)/1000,.04):0;previous=now;
    if(playing){x+=direction*dt*.07;if(x>=1){x=1;direction=-1;}if(x<=0){x=0;direction=1;}current=model.solve(x,g);select();}
    if(!motion.matches)phase+=dt*3;
    drawGraph();drawShape();if(now-lastText>70){updateText();lastText=now;}
    schedule();
  }
  refreshChoices();setPlaying(playing);sync();
})();
