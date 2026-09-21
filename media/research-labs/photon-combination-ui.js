/* On-demand geometry and deterministic quadrature. Hover suspension is owned
   by the early shared frame controller; state never depends on a frame loop. */
(() => {
  'use strict';
  const M=window.PhotonCombinationModel,$=id=>document.getElementById(id),gold='#f4d087',mint='#97e6ce',muted='#aec6cc';
  let selected=['cone','disk','sphere'],weights={},costs={},mapMode='density',job=0,probeKey='',samples=null,result=null,span=null,c=null;
  const stateKeys=Object.keys(M.defaults).filter(k=>k!=='half');
  const initial=new Map([...document.querySelectorAll('input')].map(e=>[e.id,e.value]));
  const num=(x,d=3)=>!Number.isFinite(x)?(Number.isNaN(x)?'undefined':'∞'):x===0?'0':Math.abs(x)<.001||Math.abs(x)>10000?x.toExponential(2):x.toFixed(d);
  function settings(){return M.config(Object.fromEntries(stateKeys.map(k=>[k,+$(k).value])));}
  function updateOutputs(){document.querySelectorAll('input[type=range]').forEach(e=>{const out=$(`${e.id}-out`);if(out)out.textContent=(+e.value).toFixed((e.step.split('.')[1]||'').length);});}
  function allocationControls(){
    $('allocation-controls').innerHTML=selected.map(k=>`<div class="pc-allocation" style="--c:${M.colors[k]}"><strong>${M.names[k]}</strong><label>Allocation<input type="number" min="0.1" max="10" step="0.1" data-weight="${k}" value="${weights[k]??1}" aria-label="${M.names[k]} allocation"></label><label>Relative work<input type="number" min="0.25" max="10" step="0.25" data-cost="${k}" value="${costs[k]??1}" aria-label="${M.names[k]} relative work"></label></div>`).join('');
    $('allocation-controls').querySelectorAll('input').forEach(e=>e.addEventListener('input',()=>{if(!e.validity.valid)return;const type=e.dataset.weight?'weight':'cost',key=e.dataset.weight||e.dataset.cost;(type==='weight'?weights:costs)[key]=+e.value;schedule();}));
  }
  function setSelected(next){selected=next;document.querySelectorAll('[data-strategy]').forEach(b=>b.setAttribute('aria-pressed',String(selected.includes(b.dataset.strategy))));$('selection-note').textContent=selected.length===3?'Three selected. Remove one before adding another.':'Two selected. Add a third, or compare this pair as it is.';allocationControls();schedule();}
  function setup(id){const canvas=$(id),r=canvas.getBoundingClientRect(),w=Math.max(260,r.width),h=Math.max(250,r.height),dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#11282d');g.addColorStop(1,'#0b1420');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);return {ctx,w,h};}
  function label(ctx,t,x,y,color=muted,size=10,align='left'){ctx.fillStyle=color;ctx.font=`${size}px system-ui`;ctx.textAlign=align;ctx.fillText(t,x,y);}
  function stroke(ctx,points,color,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  function dot(ctx,p,r,color){ctx.beginPath();ctx.arc(...p,r,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();}
  function geometry(){
    const {ctx,w,h}=setup('geometry'),e=M.event(c,0,.5,.5),t=e.t,omega=e.w,n=[0,0,1],curves=[];
    const add=(points,color,width=1)=>curves.push({points,color,width});
    const radius=c.size/2;
    for(let i=0;i<=6;i++){const v=(i/6-.5)*c.size;add([[-radius,v,0],[radius,v,0]],'#f4d08730');add([[v,-radius,0],[v,radius,0]],'#f4d08730');}
    add([[-radius,-radius,0],[radius,-radius,0],[radius,radius,0],[-radius,radius,0],[-radius,-radius,0]],gold,1.5);
    selected.forEach(k=>{
      const color=M.colors[k]+'70',segments=56;
      if(k==='sphere'){for(let axis=0;axis<3;axis++){const points=[];for(let i=0;i<=segments;i++){const a=2*Math.PI*i/segments,p=[0,0,0];p[(axis+1)%3]=t*Math.cos(a);p[(axis+2)%3]=t*Math.sin(a);if(p[2]>=-1e-8)points.push(p);else if(points.length){add(points.splice(0),color);}}if(points.length)add(points,color);}}
      else if(k==='cone'){const sn=Math.sqrt(1-omega[2]**2);for(const f of [.55,1])add(Array.from({length:segments+1},(_,i)=>{const a=2*Math.PI*i/segments;return [t*f*sn*Math.cos(a),t*f*sn*Math.sin(a),t*f*omega[2]];}),color);for(let i=0;i<8;i++){const a=2*Math.PI*i/8;add([[0,0,0],[t*sn*Math.cos(a),t*sn*Math.sin(a),t*omega[2]]],color);}}
      else if(k==='disk'){const tangent=M.unit([omega[0],omega[1],0]);add(Array.from({length:segments+1},(_,i)=>{const a=Math.PI*i/segments;return [t*tangent[0]*Math.cos(a),t*tangent[1]*Math.cos(a),t*Math.sin(a)];}),color);add([tangent.map(v=>-v*t),tangent.map(v=>v*t)],color);}
      else if(k==='uv'){const z=e.point[2],cx=e.point[0],cy=e.point[1];add([[cx-radius,cy-radius,z],[cx+radius,cy-radius,z],[cx+radius,cy+radius,z],[cx-radius,cy+radius,z],[cx-radius,cy-radius,z]],color);}
      else{const a=k==='ut'?0:k==='vt'?Math.PI/2:c.angle*Math.PI/180,edge=[Math.cos(a)*radius,Math.sin(a)*radius,0],p=e.point;add([edge.map(v=>-v),edge,edge.map((v,i)=>v+p[i]),edge.map((v,i)=>-v+p[i]),edge.map(v=>-v)],color);}
    });
    const ray=[M.camera(c,-c.half),M.camera(c,c.half)],r=M.camera(c,+$('slice').value);add(ray,gold,2);add([[0,0,0],r],'#fff0ce66',1);
    const raw=p=>[p[0]*.82-p[1]*.6,p[0]*.25+p[1]*.34-p[2]*.9],all=curves.flatMap(o=>o.points).map(raw),lo=[Math.min(...all.map(p=>p[0])),Math.min(...all.map(p=>p[1]))],hi=[Math.max(...all.map(p=>p[0])),Math.max(...all.map(p=>p[1]))],scale=Math.min((w-55)/(hi[0]-lo[0]),(h-70)/(hi[1]-lo[1]));
    const project=p=>{const q=raw(p);return [w/2+(q[0]-(lo[0]+hi[0])/2)*scale,h/2+12+(q[1]-(lo[1]+hi[1])/2)*scale];};
    curves.forEach(o=>stroke(ctx,o.points.map(project),o.color,o.width));
    selected.forEach(k=>{const v=M.unit(e.normals[k]),p=project(e.point),p2=project(e.point.map((x,i)=>x+.45*v[i]));stroke(ctx,[p,p2],M.colors[k],2.2);dot(ctx,p2,2.4,M.colors[k]);});
    dot(ctx,project([0,0,0]),4,gold);dot(ctx,project(r),5,'#faffed');label(ctx,'ONE SOURCE · ONE CAMERA SEGMENT',13,20,gold,9);label(ctx,`Ray length ${2*c.half} · source area ${num(c.area,2)}`,13,h-12,muted,9);
  }
  function map(){
    const {ctx,w,h}=setup('density-map'),N=56,values=[],s=+$('slice').value,a=result.a;let max=0;
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){const e=M.event(c,s,(i+.5)/N,(j+.5)/N),q=M.mixture(e.density,a),v=mapMode==='density'?q*2*c.half:q>0?e.payload*e.payload/q:Infinity;values.push(v);if(Number.isFinite(v))max=Math.max(max,v);}
    const sorted=values.filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b),mid=sorted[Math.floor(sorted.length/2)]||1,denom=Math.log1p(max/mid)||1,size=Math.min(w-70,h-65),x=(w-size)/2-7,y=32,cell=size/N;
    values.forEach((v,i)=>{let color;if(!Number.isFinite(v))color='#f99991';else{const f=Math.log1p(v/mid)/denom;const r=11+f*107+Math.max(0,f-.65)*310,g=25+f*190,b=36+f*121; color=`rgb(${Math.min(255,r)},${Math.min(255,g)},${Math.min(255,b)})`;}ctx.fillStyle=color;ctx.fillRect(x+(i%N)*cell,y+size-(Math.floor(i/N)+1)*cell,cell+.3,cell+.3);});
    ctx.strokeStyle='#d8e8ca66';ctx.strokeRect(x,y,size,size);
    for(const tick of [0,.5,1]){label(ctx,String(tick),x+tick*size,y+size+14,muted,9,'center');label(ctx,String(tick),x-8,y+(1-tick)*size+3,muted,9,'right');}
    label(ctx,'u',x+size+14,y+size+14,gold,11);label(ctx,'v',x-8,y-7,gold,11);
    label(ctx,mapMode==='density'?'NATIVE MIXTURE · q × ray length':'ERROR WEIGHT · f²/q',13,19,gold,9);
    const gx=x+size+18,gw=8,gh=size,gradient=ctx.createLinearGradient(0,y+gh,0,y);gradient.addColorStop(0,'#0b1924');gradient.addColorStop(.55,'#4b9274');gradient.addColorStop(1,'#e5d795');ctx.fillStyle=gradient;ctx.fillRect(gx,y,gw,gh);
    label(ctx,num(max,2),gx+5,y-7,muted,8,'center');label(ctx,'0',gx+4,y+gh+14,muted,8,'center');
    $('map-caption').textContent=`Source-coordinate slice at s = ${s.toFixed(2)}. Brighter means ${mapMode==='density'?'more mixture density':'larger local contribution to the proxy'}. The color scale is logarithmic and rescales to this view; coral marks an undefined or infinite value.`;
  }
  function readouts(){
    $('coverage').textContent=result.invalid?'Undefined':`${((1-result.uncovered)*100).toFixed(2)}%`;$('min-density').textContent=result.invalid?'Undefined':num(result.relativeMin);$('proxy').textContent=num(result.relative);$('cost-proxy').textContent=num(result.effort);
    const e=M.event(c,0,.5,.5);span=M.localSpan(e,selected,weights);
    $('span-title').textContent=span.rank===3?'The selected normals span all three dimensions.':'There is a shared-zero ray direction at this event.';
    $('span-note').textContent=(span.rank===3?`At the center event, the native PDFs give q ≥ ${num(span.lowerBound)} for every unit ray direction. This is a local bound; it does not establish a global variance bound.`:`Local normal rank ${span.rank}/3. All selected densities vanish along a common direction at the source-center / ray-center event. Finite probes can miss this zero even when coverage reads 100%.`)+` Current ray q = ${num(M.mixture(e.density,result.a),6)}. Aiming rounds to 0.001°.`;
    const rows=[...result.candidates].sort((a,b)=>(b.gain-b.costRatio)-(a.gain-a.costRatio));
    $('candidate-rows').innerHTML=rows.map(row=>{const improvement=row.gain-row.costRatio,caption=!Number.isFinite(row.gain)?'Unresolved coverage':Math.abs(improvement)<.015?'Approximately neutral':improvement>0?'Reduces cost × proxy':'Increases cost × proxy';return `<tr style="--c:${M.colors[row.key]}"><td>${M.names[row.key]}<br><small>${selected.includes(row.key)?'Reallocate toward':'Add candidate'}</small></td><td>${num(row.gain)}</td><td>${num(row.costRatio)}</td><td class="${improvement>0?'pc-improves':'pc-worse'}">${caption}</td></tr>`;}).join('');
    $('probe-note').textContent=`${samples.length.toLocaleString()} deterministic midpoint probes · ${result.evaluations.toLocaleString()} selected-density evaluations · I ≈ ${num(result.integral,5)}. The candidate prediction concerns an infinitesimal reallocation, not replacing an entire strategy.${result.invalid?' Coordinate-singular probes encountered: '+result.invalid+'.':''}`;
  }
  function render(){job=0;updateOutputs();c=settings();const key=JSON.stringify(c);if(key!==probeKey){samples=M.probes(c);probeKey=key;}result=M.analyze(samples,selected,weights,costs,2*c.half);readouts();geometry();map();}
  function schedule(){if(!job)job=requestAnimationFrame(render);}
  document.querySelectorAll('[data-strategy]').forEach(b=>{const key=b.dataset.strategy;b.style.setProperty('--c',M.colors[key]);b.addEventListener('click',()=>{if(selected.includes(key)){if(selected.length>2)setSelected(selected.filter(k=>k!==key));else $('selection-note').textContent='Keep at least two strategies for a combination. Add a third before removing one.';}else if(selected.length<3)setSelected([...selected,key]);else $('selection-note').textContent='Three strategies are already selected. Remove one first, then choose the replacement.';});});
  const presets={directional:['cone','disk','sphere'],planes:['uv','ut','vt'],redundant:['ut','vt','arb'],mixed:['uv','cone','disk']};
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>setSelected(presets[b.dataset.preset].slice())));
  document.querySelectorAll('input[type=range]').forEach(e=>e.addEventListener('input',schedule));
  document.querySelectorAll('[data-map]').forEach(b=>b.addEventListener('click',()=>{mapMode=b.dataset.map;document.querySelectorAll('[data-map]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));schedule();}));
  $('align-ray').addEventListener('click',()=>{if(!span)return;const angles=M.directionAngles(span.direction);$('azimuth').value=angles.azimuth;$('elevation').value=angles.elevation;schedule();});
  $('reset').addEventListener('click',()=>{initial.forEach((v,k)=>$(k).value=v);weights={};costs={};mapMode='density';document.querySelectorAll('[data-map]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.map==='density')));setSelected(presets.directional.slice());});
  new ResizeObserver(schedule).observe(document.querySelector('.pc-main'));window.addEventListener('resize',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  setSelected(selected);render();
})();
