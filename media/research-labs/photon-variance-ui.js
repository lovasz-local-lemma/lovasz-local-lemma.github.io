/* Event-driven views; the early shared frame controller owns hover suspension. */
(() => {
  'use strict';
  const M=window.PhotonVarianceModel,panels=[...document.querySelectorAll('.pv-panel')],tabs=[...document.querySelectorAll('[data-tab]')];
  const gold='#f5d080',mint='#8deed0',violet='#c4abff',coral='#ffa583',muted='#adc2cd';
  const initial=new Map([...document.querySelectorAll('input')].map(i=>[i.id,i.value]));
  let active='correlation',reuse='cached',partner='uniform',weighting='balance',seed=9173,misSeed=8319,job=0;
  let imageCache=null,imageKey='',workCache=null,workKey='',misCache=null,misKey='';
  let canvas,ctx,w,h;
  const get=id=>+document.getElementById(id).value;
  const metric=(key,n,value)=>{document.getElementById(`${key}-metric-${n}`).textContent=value;};
  function text(s,x,y,color=muted,size=11,align='left') {ctx.fillStyle=color;ctx.font=`${size}px system-ui,sans-serif`;ctx.textAlign=align;ctx.fillText(s,x,y);}
  function line(x,y,x2,y2,color=muted,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();}
  function curve(points,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
  function dot(x,y,r,color,glow=0){ctx.fillStyle=color;ctx.shadowBlur=glow;ctx.shadowColor=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  function arrow(x,y,dx,dy,color=gold,width=1.5){
    line(x,y,x+dx,y+dy,color,width);const a=Math.atan2(dy,dx),s=5;
    line(x+dx,y+dy,x+dx-s*Math.cos(a-.5),y+dy-s*Math.sin(a-.5),color,width);
    line(x+dx,y+dy,x+dx-s*Math.cos(a+.5),y+dy-s*Math.sin(a+.5),color,width);
  }
  function frame(x,y,bw,bh){ctx.strokeStyle='#98bda438';ctx.lineWidth=1;ctx.strokeRect(x,y,bw,bh);}
  function tickLabel(value){
    if(value>=10000)return `1e${Math.round(Math.log10(value))}`;
    return Number.isInteger(value)?String(value):value.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
  }
  function yTicks(values,toY,x,y,bw,bh,color=muted,side='left',grid=true){
    let previous=Infinity;
    for(const value of values){
      const yy=toY(value);if(yy<y-.5||yy>y+bh+.5||Math.abs(yy-previous)<12)continue;
      if(grid)line(x,yy,x+bw,yy,'#97b9ac21');
      text(tickLabel(value),side==='left'?x-5:x+bw+5,yy+3,color,8,side==='left'?'right':'left');previous=yy;
    }
  }
  function begin(){
    canvas=document.getElementById(`canvas-${active}`);ctx=canvas.getContext('2d');
    const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);w=Math.max(280,r.width);h=Math.max(240,r.height);
    const width=Math.round(w*dpr),height=Math.round(h*dpr);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#10222a');g.addColorStop(1,'#0a111b');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    document.querySelectorAll(`#panel-${active} input`).forEach(i=>{const p=(i.step.split('.')[1]||'').length,n=+i.value;document.getElementById(`${i.id}-out`).textContent=n.toFixed(p);});
  }
  function texture(field,size,exposure){
    const c=document.createElement('canvas');c.width=c.height=size;const cctx=c.getContext('2d'),pixels=cctx.createImageData(size,size);
    for(let i=0;i<field.length;i++){
      const a=1-Math.exp(-field[i]*exposure),hot=Math.max(0,(a-.6)/.4),j=4*i;
      pixels.data[j]=8+a*67+hot*180;pixels.data[j+1]=17+a*193+hot*28;pixels.data[j+2]=24+a*157-hot*52;pixels.data[j+3]=255;
    }
    cctx.putImageData(pixels,0,0);return c;
  }
  function correlation(){
    const samples=get('samples'),spread=get('spread'),cutoff=get('cutoff'),exposure=get('exposure'),key=[samples,spread,cutoff,seed].join('/');
    if(key!==imageKey){imageCache=M.shellImages({size:160,samples,spread,cutoff,seed});imageKey=key;}
    const q=imageCache,gap=18,panel=(w-3*gap)/2,s=Math.min(panel,h-63),top=37;
    const images=[{field:q.shared,x:gap,title:'SHARED · one shell draw covers every pixel',color:gold},
      {field:q.independent,x:2*gap+panel,title:'INDEPENDENT · new draws at each pixel',color:mint}];
    images.forEach(item=>{
      const x=item.x+(panel-s)/2;ctx.fillStyle='#080f16';ctx.fillRect(item.x,top,panel,s);
      ctx.imageSmoothingEnabled=true;ctx.drawImage(texture(item.field,q.size,exposure),x,top,s,s);frame(item.x,top,panel,s);
      text(w<650?item.title.split(' · ')[0]:item.title,item.x,21,item.color,w<650?11:10);
      text(`${samples} complete ${samples===1?'draw':'draws'} per pixel`,item.x+panel/2,top+s+17,muted,10,'center');
    });
    metric('correlation',0,q.sharedEnergy.toFixed(3));metric('correlation',1,q.independentEnergy.toFixed(3));metric('correlation',2,q.expectedEnergy.toFixed(3));
    document.getElementById('seed-note').textContent=`Realization ${seed} · common exposure · zero-valued misses included`;
  }
  function jacobian(){
    const radius=get('radius'),impact=get('impact'),cutoff=get('ray-cutoff'),q=M.jacobian(radius,impact,cutoff);
    const left=w*.45,cx=left*.5,cy=h*.51,scale=Math.min(left*.34,h*.32)/1.2,R=radius*scale,rayY=cy-impact*scale;
    text('SPHERE / CAMERA-RAY MERIDIAN',18,21,gold,w<650?9:10);
    const fill=ctx.createRadialGradient(cx-R*.28,cy-R*.25,R*.02,cx,cy,R);fill.addColorStop(0,'#77b9a132');fill.addColorStop(.8,'#44677220');fill.addColorStop(1,'#9ee8b738');
    ctx.fillStyle=fill;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#a8deca80';ctx.stroke();
    for(const k of [-.6,-.3,0,.3,.6]){
      const ry=Math.sqrt(1-k*k)*R;ctx.beginPath();ctx.ellipse(cx,cy+k*R,ry,ry*.19,0,0,Math.PI*2);ctx.strokeStyle='#8bceb432';ctx.stroke();
    }
    for(const k of [.35,.7]){ctx.beginPath();ctx.ellipse(cx,cy,R*k,R,0,0,Math.PI*2);ctx.strokeStyle='#b4d7c926';ctx.stroke();}
    line(cx-R-18,cy,cx+R+18,cy,'#97afa435');line(cx,cy-R-15,cx,cy+R+15,'#97afa435');
    arrow(20,rayY,left-32,0,gold,1.8);text('camera ray',24,rayY-8,gold,10);
    line(cx+R+8,cy,cx+R+8,rayY,'#d2b5fb66');text('δ',cx+R+14,(cy+rayY)/2,violet,12);
    if(q.hit){
      for(const sign of [-1,1]){
        const x=cx+sign*q.root*scale,y=rayY;dot(x,y,4.5,q.accepted?mint:coral,12);
        arrow(x,y,sign*q.root/radius*28,-impact/radius*28,mint,1.5);
      }
      ctx.setLineDash([4,5]);line(cx-q.root*scale,rayY,cx+q.root*scale,rayY,'#d4ffeacc',2);ctx.setLineDash([]);
    }
    text(q.hit?(q.accepted?'two supported crossings':'crossings rejected by cutoff'):'ray misses this sphere',cx,h-17,q.hit?(q.accepted?mint:coral):muted,10,'center');
    const x=left+20,y=43,bw=w-x-28,bh=h-94;
    frame(x,y,bw,bh);
    yTicks([0,.25,.5,.75,1],v=>y+bh*(1-v),x,y,bw,bh,mint);
    yTicks([1,10,100],v=>y+bh*(1-Math.log10(v)/2.1),x,y,bw,bh,violet,'right',false);
    const boundary=Math.sqrt(Math.max(0,1-cutoff*cutoff));
    if(cutoff>0){ctx.fillStyle='#e7b4771c';ctx.fillRect(x+bw*boundary,y,bw*(1-boundary),bh);ctx.setLineDash([3,4]);line(x+bw*boundary,y,x+bw*boundary,y+bh,coral);ctx.setLineDash([]);}
    const jpoints=[],wpoints=[];
    for(let i=0;i<=240;i++){
      const t=i/240*.99995,mu=Math.sqrt(1-t*t);jpoints.push([x+t*bw,y+bh*(1-mu)]);wpoints.push([x+t*bw,y+bh*(1-Math.min(1,Math.log10(1/mu)/2.1))]);
    }
    curve(jpoints,mint,2);curve(wpoints,violet,2);
    const relative=impact/radius,marker=x+M.clamp(relative,0,1)*bw;line(marker,y,marker,y+bh,'#f3d58380');
    if(q.hit)dot(marker,y+bh*(1-Math.min(1,Math.log10(1/q.mu)/2.1)),4,gold,10);
    text('J / t² · linear',x,y-13,mint,10);text('t² / J · log',x+bw,y-13,violet,10,'right');
    text('0 · through the center',x,y+bh+19,muted,9);text('1 · tangent',x+bw,y+bh+19,muted,9,'right');
    metric('jacobian',0,q.hit?q.J.toFixed(5):'no hit');metric('jacobian',1,q.hit?q.weight.toFixed(4):impact===radius?'∞ · boundary':'0');metric('jacobian',2,q.hit?(q.accepted?'kept':'discarded'):'outside support');
  }
  function work(){
    const count=get('support-count'),radius=get('footprint-radius'),resolution=get('resolution'),key=[count,radius,resolution].join('/');
    if(key!==workKey){workCache=M.footprint({count,nx:96*resolution,ny:64*resolution,radius:radius*resolution});workKey=key;}
    const q=workCache,available=w*.65-25,cell=Math.min(available/q.nx,(h-67)/q.ny),bw=q.nx*cell,bh=q.ny*cell,x=19+(available-bw)/2,y=39,cw=cell,ch=cell;
    text('PROJECTED SUPPORTS + BOUNDING BOXES',x,21,mint,w<650?9:10);
    for(let j=0;j<q.ny;j++)for(let i=0;i<q.nx;i++){
      const idx=j*q.nx+i,hit=q.hits[idx],falsePositive=q.candidates[idx]-hit;
      if(hit||falsePositive){ctx.fillStyle=hit?`rgba(104,218,181,${.12+Math.min(.7,hit*.15)})`:`rgba(239,161,105,${.14+Math.min(.55,falsePositive*.13)})`;ctx.fillRect(x+i*cw,y+j*ch,cw+.2,ch+.2);}
    }
    q.shapes.forEach((p,i)=>{
      if(i<8){ctx.strokeStyle='#edce825e';ctx.setLineDash([3,5]);ctx.strokeRect(x+(p.cx-p.r)*cw,y+(p.cy-p.r)*ch,2*p.r*cw,2*p.r*ch);ctx.setLineDash([]);}
      ctx.strokeStyle='#b4efd351';ctx.beginPath();ctx.ellipse(x+p.cx*cw,y+p.cy*ch,p.r*cw,p.r*ch,0,0,Math.PI*2);ctx.stroke();
    });
    frame(x,y,bw,bh);text(`${q.nx} × ${q.ny} query locations · ${q.count} supports`,x,h-10,muted,10);
    const sx=w*.68,sw=w-sx-18,rows=[['Queries Q',q.queries,mint],['Retain: builds N',q.cachedBuilds,gold],['Rebuild: builds NQ',q.rebuiltBuilds,violet],['Bound candidates',q.bounds,gold],['True disk hits',q.trueHits,mint],['Bound-only misses',q.rejected,coral]];
    rows.forEach(([label,value,color],i)=>{const ry=42+i*43;text(label,sx,ry,color,w<650?9:10);text(Number(value).toLocaleString(),sx+sw,ry+18,color,w<650?12:15,'right');line(sx,ry+27,sx+sw,ry+27,'#9fbaa226');});
    metric('work',0,(reuse==='cached'?q.cachedBuilds:q.rebuiltBuilds).toLocaleString());metric('work',1,q.bounds.toLocaleString());metric('work',2,q.trueHits.toLocaleString());
  }
  function mis(){
    const k=get('power'),alpha=get('alpha'),beta=get('beta'),key=[k,partner,misSeed].join('/');
    if(key!==misKey){misCache={trace:M.mixtureTrace(k,partner,192,misSeed),second:M.mixtureSecond(k,partner),flatSecond:M.flatSecond(k,partner)};misKey=key;}
    const compact=w<650,q=misCache,x=32,y=37,bw=compact?w-52:w*.6-46,bh=compact?108:126,max=Math.max(k+1,1)*1.12;
    text('NORMALIZED DENSITIES · COMMON dx MEASURE',x,20,mint,w<650?9:10);frame(x,y,bw,bh);
    yTicks([0,(k+1)/2,k+1],v=>y+bh*(1-v/max),x,y,bw,bh,muted);
    const points=fn=>Array.from({length:161},(_,i)=>{const t=i/160;return [x+t*bw,y+bh*(1-fn(t)/max)];});
    curve(points(t=>M.density1(t,k)),gold,2.2);ctx.setLineDash([5,4]);curve(points(t=>partner==='uniform'?1:M.density1(t,k)),mint,1.8);ctx.setLineDash([]);curve(points(t=>M.mixtureDensity(t,k,partner)),'#e5f6ed',1.6);
    text('x = 0',x,y+bh+17,muted,9);text('x = 1',x+bw,y+bh+17,muted,9,'right');
    const ty=compact?192:215,th=compact?80:h-244,weights=q.trace.values,maxLog=Math.max(Math.log1p(2),...weights.flatMap(v=>[Math.log1p(v.weight),Math.log1p(v.flat)]));
    text('FLAT / BALANCE · SAME SAMPLES · log(1 + W)',x,ty-12,gold,compact?9:10);frame(x,ty,bw,th);
    yTicks([0,1,2,5,10,20,50,100,200,500,1000,2000,5000,10000],v=>ty+th*(1-Math.log1p(v)/maxLog),x,ty,bw,th,muted);
    for(const selected of [weighting==='flat'?'balance':'flat',weighting])weights.forEach((p,i)=>{
      const xx=x+i/(weights.length-1)*bw,v=selected==='flat'?p.flat:p.weight,yy=ty+th*(1-Math.log1p(v)/maxLog);
      const on=selected===weighting;line(xx,ty+th,xx,yy,selected==='flat'?(on?'#f1cb82da':'#f1cb8245'):(on?'#8becd0db':'#8becd048'),on?1.4:1);
    });
    const sx=compact?32:w*.63,sw=compact?w-52:w-sx-22,sy=compact?319:45,sh=compact?Math.max(72,h-368):h-103;
    text('INDEPENDENT POWER-LAW TAIL TEST',sx,compact?sy-13:20,violet,compact?9:10);frame(sx,sy,sw,sh);
    const mean=M.moment(alpha,beta,1),second=M.moment(alpha,beta,2),maxTail=Math.max(1,Math.log10(1+M.truncatedMoment(alpha,beta,2,1e-6)));
    yTicks([0,1,2,5,...Array.from({length:24},(_,i)=>10**(i+1))],v=>sy+sh*(1-Math.log10(1+v)/maxTail),sx,sy,sw,sh,muted);
    for(const [order,color] of [[1,mint],[2,gold]]){
      const pts=Array.from({length:160},(_,i)=>{const power=-1-i/159*5,t=M.truncatedMoment(alpha,beta,order,10**power);return [sx+i/159*sw,sy+sh*(1-Math.log10(1+t)/maxTail)];});curve(pts,color,2);
    }
    text('εmin: 10⁻¹ → 10⁻⁶',sx,sy+sh+18,muted,10);text('truncated moments · log scale',sx,sy+sh+35,muted,9);
    const selectedSecond=weighting==='flat'?q.flatSecond:q.second;
    metric('mis',0,'1');metric('mis',1,Number.isFinite(selectedSecond)?selectedSecond.toFixed(4):'∞ · k ≥ 1');metric('mis',2,(weighting==='flat'?q.trace.flatMean:q.trace.mean).toFixed(3));
    document.getElementById('tail-readout').innerHTML=[['Mean',mean,mint,1],['Second moment',second,gold,2]].map(([label,result,color,order])=>
      `<article style="--c:${color}"><strong>${label}: ${result.kind}</strong><p>β − ${order===1?'α':'2α'} + 1 = <code>${result.exponent.toFixed(2)}</code>${result.finite?`; normalized toy value ${result.value.toFixed(3)}`:'. Equality gives logarithmic divergence.'}</p></article>`).join('');
  }
  const draws={correlation,jacobian,work,mis};
  function render(){job=0;begin();draws[active]();}
  function invalidate(){if(!job)job=requestAnimationFrame(render);}
  function select(key,focus=false){
    active=key;panels.forEach(p=>{p.hidden=p.id!==`panel-${key}`;});tabs.forEach(t=>{const on=t.dataset.tab===key;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;if(on&&focus)t.focus();});invalidate();
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>select(tab.dataset.tab));
    tab.addEventListener('keydown',event=>{
      let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;
      if(next!==undefined){event.preventDefault();select(tabs[next].dataset.tab,true);}
    });
  });
  document.querySelectorAll('input').forEach(input=>input.addEventListener('input',invalidate));
  document.getElementById('resample').addEventListener('click',()=>{seed+=101;invalidate();});
  document.querySelectorAll('[data-reuse]').forEach(button=>button.addEventListener('click',()=>{reuse=button.dataset.reuse;document.querySelectorAll('[data-reuse]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));invalidate();}));
  document.querySelectorAll('[data-partner]').forEach(button=>button.addEventListener('click',()=>{partner=button.dataset.partner;document.querySelectorAll('[data-partner]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));invalidate();}));
  document.querySelectorAll('[data-weighting]').forEach(button=>button.addEventListener('click',()=>{weighting=button.dataset.weighting;document.querySelectorAll('[data-weighting]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));invalidate();}));
  document.querySelectorAll('[data-reset]').forEach(button=>button.addEventListener('click',()=>{
    const key=button.dataset.reset;document.querySelectorAll(`#panel-${key} input`).forEach(i=>{i.value=initial.get(i.id);});
    if(key==='correlation')seed=9173;
    if(key==='work'){reuse='cached';document.querySelectorAll('[data-reuse]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.reuse===reuse)));}
    if(key==='mis'){partner='uniform';weighting='balance';misSeed=8319;document.querySelectorAll('[data-partner]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.partner===partner)));document.querySelectorAll('[data-weighting]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.weighting===weighting)));}
    invalidate();
  }));
  const observer=new ResizeObserver(invalidate);document.querySelectorAll('canvas').forEach(c=>observer.observe(c));
  // One pending frame is enough to redraw. The early controller queues it while
  // the embedded lab is suspended and gives the host a full-size first paint.
  invalidate();
})();
