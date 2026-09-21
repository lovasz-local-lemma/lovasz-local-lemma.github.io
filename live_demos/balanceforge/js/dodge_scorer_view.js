// Read-only instruments: paint current motion every display frame, but retain
// exact decision/forecast snapshots and timestamped historical observations.
// The shipped scorer decides at 20 Hz; this view may repaint at screen refresh.
// Only score heat eases. Bodies, selected heading, text and paths stay exact.
(function(BF){'use strict';
 const GOLD='#efc879',MINT='#82d7be',TEXT='#e4e9e6',MUTED='#a1b0b3',BG='#0b1218';
 const arrows=['↖','←','↙','↑','·','↓','↗','→','↘'];
 const title='Supplied physical lookahead · learned scoring',views=new WeakMap();
 function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
 function fit(canvas){
  const w=canvas.getBoundingClientRect?.().width??canvas.clientWidth??0;
  if(!Number.isFinite(w)||w<=0)return null;
  const h=w>=620?Math.ceil(Math.max(370,164+(w-72)/3*440/720)):Math.ceil(478+(w-32)*440/720+(w-50)/6),dpr=Math.min(2,window.devicePixelRatio||1);
  if(canvas.style.height!==h+'px')canvas.style.height=h+'px';
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}return{w,h,dpr};
 }
 function label(ctx,text,x,y,size,color,align,maxWidth){ctx.font=(size||11)+'px system-ui, sans-serif';ctx.fillStyle=color||TEXT;ctx.textAlign=align||'left';if(maxWidth)ctx.fillText(text,x,y,maxWidth);else ctx.fillText(text,x,y);}
 function surface(w,h,dpr){
  const c=typeof OffscreenCanvas==='function'?new OffscreenCanvas(Math.max(1,Math.ceil(w*dpr)),Math.max(1,Math.ceil(h*dpr))):typeof document!=='undefined'?document.createElement('canvas'):null;
  if(!c)return null;c.width=Math.max(1,Math.ceil(w*dpr));c.height=Math.max(1,Math.ceil(h*dpr));const ctx=c.getContext?.('2d');
  if(!ctx||typeof ctx.roundRect!=='function')return null;
  ctx.setTransform(dpr,0,0,dpr,0,0);return{canvas:c,ctx};
 }
 function layout(w,h,dpr){
  const wide=w>=620,pad=16,gap=20,sectionW=wide?(w-pad*2-gap*2)/3:w-pad*2,sx=pad,sy=91;
  const cell=Math.min(58,(sectionW-18)/3),gridW=cell*3+12,gx=sx+(sectionW-gridW)/2;
  const fx=wide?pad+sectionW+gap:pad,fy=wide?sy:sy+gridW+57,fieldW=sectionW,fieldH=fieldW*440/720;
  const hx=wide?pad+2*(sectionW+gap):pad,hy=wide?sy:fy+fieldH+59,tw=(sectionW-18)/4,th=tw*2/3;
  return{w,h,dpr,sx,sy,cell,gridW,gx,fx,fy,fieldW,fieldH,hx,hy,tw,th,sectionW};
 }
 function staticPanels(ctx,l){
  const{w,h,sx,sy,gridW,fx,fy,fieldW,fieldH,hx,hy,tw,th,sectionW}=l;
  ctx.clearRect(0,0,w,h);ctx.fillStyle=BG;rounded(ctx,0,0,w,h,15);ctx.fill();
  label(ctx,'HOW THIS CONTROLLER DECIDES',16,24,10,MINT);label(ctx,'Physics supplies possible futures.',16,47,13,TEXT);label(ctx,'The trained weights rank the headings.',16,65,12,MUTED);
  label(ctx,'Nine learned scores',sx,sy,12,GOLD);label(ctx,'Relative scores, not probabilities.',sx,sy+gridW+29,10,MUTED,'left',sectionW);
  label(ctx,'Forecasts of constant commands',fx,fy,12,GOLD,'left',sectionW);
  ctx.fillStyle='#101e27';rounded(ctx,fx,fy+13,fieldW,fieldH,9);ctx.fill();
  ctx.strokeStyle='rgba(130,215,190,.07)';ctx.lineWidth=1;
  for(let j=1;j<4;j++){ctx.beginPath();ctx.moveTo(fx+j*fieldW/4,fy+13);ctx.lineTo(fx+j*fieldW/4,fy+13+fieldH);ctx.stroke();}
  label(ctx,'Current bullets only',fx,fy+fieldH+31,10,MUTED,'left',sectionW);label(ctx,'Future spawns unknown',fx,fy+fieldH+44,10,MUTED,'left',sectionW);
  label(ctx,'Actual observed history',hx,hy,12,GOLD,'left',sectionW);label(ctx,'Diagnostic only; not this scorer’s input.',hx,hy+18,10,MUTED,'left',sectionW);
  for(let i=0;i<4;i++){ctx.fillStyle='#101e27';rounded(ctx,hx+i*(tw+6),hy+30,tw,th,5);ctx.fill();}
 }
 function paintHistory(ctx,frame,x,y,tw,th){
  const cw=tw/frame.width,ch=th/frame.height;
  for(let row=0;row<frame.height;row++)for(let col=0;col<frame.width;col++){
   const off=(row*frame.width+col)*4,mass=frame.values[off],a=frame.values[off+3];
   if(mass>.001){ctx.fillStyle='rgba(240,162,118,'+Math.min(1,.2+mass)+')';ctx.fillRect(x+col*cw,y+row*ch,cw+.2,ch+.2);}
   if(a>.001){ctx.fillStyle='rgba(130,215,190,'+Math.min(1,.25+a)+')';ctx.fillRect(x+col*cw,y+row*ch,cw+.2,ch+.2);}
  }
 }
 function projectPaths(features,l,hw,hh){
  return(features?.paths||[]).map(path=>{
   if(!path.length)return null;const origin=features.origin||path[0],points=new Float64Array((path.length+1)*2);let at=0;
   for(const p of[origin,...path]){points[at++]=l.fx+(p.x/hw*.5+.5)*l.fieldW;points[at++]=l.fy+13+(p.y/hh*.5+.5)*l.fieldH;}
   const shape=typeof Path2D==='function'?new Path2D():null;
   if(shape){shape.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)shape.lineTo(points[i],points[i+1]);}
   return{points,shape};
  });
 }
 function draw(canvas,policy,state,frameHistory,options={}){
  if(!canvas)return null;const fitted=fit(canvas);if(!fitted)return null;const{w,h,dpr}=fitted,ctx=canvas.getContext('2d');if(!ctx)return null;
  let v=views.get(canvas);if(!v){v={history:new WeakMap(),stats:{staticBuilds:0,historyBuilds:0,pathBuilds:0}};views.set(canvas,v);}
  const key=w+':'+h+':'+dpr;
  if(v.key!==key){v.key=key;v.layout=layout(w,h,dpr);v.background=surface(w,h,dpr);v.history=new WeakMap();v.features=null;v.paths=null;
   if(v.background)staticPanels(v.background.ctx,v.layout);v.stats.staticBuilds++;}
  const l=v.layout,{sx,sy,cell,gx,fx,fy,fieldW,fieldH,hx,hy,tw,th,sectionW}=l;
  const identity=options.identity??policy??state;
  if(!v.motion&&BF.visualMotion?.make)v.motion=BF.visualMotion.make();
  if(v.state!==state||v.identity!==identity){v.motion?.reset();v.state=state;v.identity=identity;v.features=null;v.paths=null;}
  v.motion?.begin(options.now??performance.now(),{enabled:!!options.smoothing&&!options.reducedMotion,identity});
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.shadowBlur=0;ctx.setLineDash([]);ctx.clearRect(0,0,w,h);
  if(v.background)ctx.drawImage(v.background.canvas,0,0,w,h);else staticPanels(ctx,l);
  const scores=policy?.lastScores,features=policy?.lastFeatures,frames=frameHistory?.frames||[];
  let winner=-1;if(scores?.length===9){winner=0;for(let i=1;i<9;i++)if(scores[i]>scores[winner])winner=i;}
  if(winner<0)label(ctx,'Waiting for a scored decision…',sx,sy+30,11,MUTED);
  else{
   const lo=Math.min(...scores),span=Math.max(1e-9,Math.max(...scores)-lo);
   if(!v.heatTargets)v.heatTargets=new Float64Array(9);
   for(let i=0;i<9;i++)v.heatTargets[i]=(scores[i]-lo)/span;
   const heat=v.motion?v.motion.vector('score-heat',v.heatTargets):v.heatTargets;
   for(let i=0;i<9;i++){
    const x=gx+Math.floor(i/3)*(cell+6),y=sy+14+(i%3)*(cell+6),selected=i===winner;
    ctx.fillStyle='rgba(239,200,121,'+(selected?.18:.035+.07*heat[i])+')';rounded(ctx,x,y,cell,cell,9);ctx.fill();
    // Selection and score text are always current. Only score heat is filtered.
    ctx.strokeStyle=selected?GOLD:'rgba(130,215,190,.18)';ctx.lineWidth=selected?1.6:1;ctx.shadowColor=GOLD;ctx.shadowBlur=selected?8+4*heat[i]:0;ctx.stroke();ctx.shadowBlur=0;
    label(ctx,arrows[i],x+cell/2,y+cell*.45,22,selected?GOLD:MUTED,'center');label(ctx,scores[i].toFixed(2),x+cell/2,y+cell*.78,10,selected?TEXT:MUTED,'center');
   }
  }
  ctx.save();rounded(ctx,fx,fy+13,fieldW,fieldH,9);ctx.clip();
  const hw=state?.worldExtent?.halfW||360,hh=state?.worldExtent?.halfH||220;
  const mx=x=>fx+(x/hw*.5+.5)*fieldW,my=y=>fy+13+(y/hh*.5+.5)*fieldH;
  ctx.strokeStyle='rgba(244,145,105,.35)';ctx.fillStyle='#f0a276';ctx.lineWidth=1;
  for(const b of state?.dodge?.bullets||[]){if(!b.alive)continue;const x=mx(b.x),y=my(b.y);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(mx(b.x+b.vx*.15),my(b.y+b.vy*.15));ctx.stroke();ctx.beginPath();ctx.arc(x,y,Math.max(1.4,b.r*fieldW/(2*hw)),0,Math.PI*2);ctx.fill();}
  if(v.features!==features||v.hw!==hw||v.hh!==hh||!v.paths){v.paths=projectPaths(features,l,hw,hh);v.features=features;v.hw=hw;v.hh=hh;v.stats.pathBuilds++;}
  for(let i=0;i<v.paths.length;i++){
   const p=v.paths[i];if(!p)continue;ctx.strokeStyle=i===winner?GOLD:'rgba(130,215,190,.13)';ctx.lineWidth=i===winner?2:1;ctx.shadowColor=GOLD;ctx.shadowBlur=i===winner?8:0;
   if(p.shape)ctx.stroke(p.shape);else{ctx.beginPath();ctx.moveTo(p.points[0],p.points[1]);for(let j=2;j<p.points.length;j+=2)ctx.lineTo(p.points[j],p.points[j+1]);ctx.stroke();}ctx.shadowBlur=0;
  }
  const agent=state?.world?.nodes?.[state.agentIdx];if(agent){ctx.fillStyle=MINT;ctx.shadowColor=MINT;ctx.shadowBlur=9;ctx.beginPath();ctx.arc(mx(agent.x),my(agent.y),3.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  ctx.restore();
  for(let i=0;i<4;i++){
   const frame=frames[Math.max(0,frames.length-4)+i],x=hx+i*(tw+6),y=hy+30;if(!frame)continue;
   let cached=v.history.get(frame);
   if(cached===undefined){cached=surface(tw,th,dpr);if(cached)paintHistory(cached.ctx,frame,0,0,tw,th);v.history.set(frame,cached);v.stats.historyBuilds++;}
   if(cached)ctx.drawImage(cached.canvas,x,y,tw,th);else paintHistory(ctx,frame,x,y,tw,th);
   label(ctx,frame.time.toFixed(2)+' s',x+tw/2,y+th+15,9,MUTED,'center');
  }
  if(!frames.length)label(ctx,'History fills as the real simulation advances.',hx,hy+th+61,10,MUTED,'left',sectionW);
  const summary=title+(winner>=0?'; chosen heading '+arrows[winner]+', score '+scores[winner].toFixed(3):'; no decision yet')+'. History thumbnails are actual past frames and are not network input.';
  if(v.summary!==summary||canvas.getAttribute?.('aria-label')!==summary){canvas.setAttribute('role','img');canvas.setAttribute('aria-label',summary);v.summary=summary;}
  return{height:h,winner,summary,renderStats:{...v.stats}};
 }
 BF.dodgeScorerView={draw,title};
})(window.BF=window.BF||{});
