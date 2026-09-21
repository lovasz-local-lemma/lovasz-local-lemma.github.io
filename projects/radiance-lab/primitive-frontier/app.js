(() => {
  'use strict';
  const M=window.PhotonFrontierMath,canvas=document.getElementById('atlas'),ctx=canvas.getContext('2d');
  const $=id=>document.getElementById(id),rad=Math.PI/180,domain={lo:.25,hi:2.5};
  const families=['cylinder','cone','hyperboloid','plane'],colors=['#73dacc','#f0c282','#b69beb','#ec9c92'];
  const rgb=['115,218,204','240,194,130','182,155,235','236,156,146'];
  const parameterIds=['theta1','theta2','phi1','phi2','t1','t2'],probeIds=['azimuth','elevation','offset'];
  let mode='all',yaw=-.5,pitch=.38,zoom=.82,playing=false,frame=0,lastFrame=0,phase=0,dirty=true;
  let params,model,probe,meshes=[],roots=[],width=1,height=1;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const presets={open:[42,57,-24,72,1.05,1.4],neck:[27,38,-38,95,1.85,1.65],waist:[58,104,-32,42,1.45,1.9],broad:[69,76,28,130,.8,1.15]};
  for(let i=0;i<4;i++){
    const row=document.createElement('div');row.className='weight '+families[i];
    row.innerHTML='<div class="row"><span>'+families[i][0].toUpperCase()+families[i].slice(1)+'</span><small id="jac-'+i+'"></small><b id="weight-'+i+'"></b></div><div class="track"><span id="bar-'+i+'"></span></div>';
    $('weights').append(row);
  }
  function read(){
    params=Object.fromEntries(parameterIds.map(id=>[id,+$(id).value*(id.startsWith('t')&&!id.startsWith('theta')?1:rad)]));
    model=M.model(params);
    for(const id of [...parameterIds,...probeIds])$(id+'-value').textContent=(id==='t1'||id==='t2'||id==='offset')?(+$(id).value).toFixed(2):(+$(id).value).toFixed(probeIds.includes(id)?2:0)+'°';
    const az=+$('azimuth').value*rad,el=+$('elevation').value*rad;
    const d=[Math.cos(el)*Math.cos(az),Math.cos(el)*Math.sin(az),Math.sin(el)];
    const side=M.unit(M.cross(d,[0,0,1]));
    probe={d,o:M.add(M.sub(model.x,M.mul(d,5)),M.mul(side,+$('offset').value))};
    roots=families.map(f=>f==='plane'?M.planeIntersections(params,probe.o,probe.d,domain.lo,domain.hi):M.intersections(f,params,probe.o,probe.d,domain.lo,domain.hi));
    const planeOn=$('plane-partner').checked;
    const js=[...M.jacobians(params,probe.d),planeOn?M.planeJacobian(params,probe.d):0],weights=M.atlasBalance(params,probe.d,{...domain,planeShare:planeOn?.1:0});
    const rankDeficient=Math.max(...js)<1e-8;
    const onPath=Math.abs(+$('offset').value)<1e-10&&!rankDeficient;
    $('weight-label').textContent=rankDeficient?'Shared degeneracy':onPath?'Balance weight':'Probe misses marked path';
    for(let i=0;i<4;i++){$('jac-'+i).textContent='J '+(js[i]<1e-5?js[i].toExponential(1):js[i].toFixed(3));$('weight-'+i).textContent=i===3&&!planeOn?'Off':onPath?(weights[i]*100).toFixed(1)+'%':'—';$('bar-'+i).style.width=(onPath?weights[i]*100:0)+'%';}
    $('root-status').textContent='Isolated crossings: '+roots.map((r,i)=>families[i]+' '+(i===3&&!planeOn?'off':r.length)).join(' · ')+'.';
    meshes=families.map(f=>{
      const rows=[],n=48,k=10;for(let v=0;v<=k;v++){const row=[];for(let u=0;u<=n;u++)row.push(f==='plane'?M.planePoint(params,domain.lo+(domain.hi-domain.lo)*u/n,domain.lo+(domain.hi-domain.lo)*v/k):M.point(f,params,u/n*M.TAU,domain.lo+(domain.hi-domain.lo)*v/k));rows.push(row);}return rows;
    });
    dirty=true;request();
  }
  function project(p){
    const cp=Math.cos(pitch),sp=Math.sin(pitch),cy=Math.cos(yaw),sy=Math.sin(yaw);
    const delta=M.sub(p,[0,0,1.15]),right=[cy,-sy,0],up=[-sp*sy,-sp*cy,cp],eye=[cp*sy,cp*cy,sp];
    const depth=M.dot(delta,eye),f=7.5/(7.5-depth),scale=Math.min(width*.21,height*.24)*zoom;
    return {x:width*.5+M.dot(delta,right)*scale*f,y:height*.52-M.dot(delta,up)*scale*f,z:depth};
  }
  function line(points,color,alpha=1,lineWidth=1,glow=0){
    // Clip in view space: a long probe can pass behind the orbit camera.
    ctx.beginPath();for(let i=1;i<points.length;i++){
      let a=points[i-1],b=points[i],za=project(a).z,zb=project(b).z;
      if(za>6.9&&zb>6.9)continue;
      if(za>6.9)a=M.add(a,M.mul(M.sub(b,a),(6.9-za)/(zb-za)));
      else if(zb>6.9)b=M.add(a,M.mul(M.sub(b,a),(6.9-za)/(zb-za)));
      const pa=project(a),pb=project(b);ctx.moveTo(pa.x,pa.y);ctx.lineTo(pb.x,pb.y);
    }ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.lineWidth=lineWidth;ctx.shadowColor=color;ctx.shadowBlur=glow;ctx.stroke();ctx.shadowBlur=0;ctx.globalAlpha=1;
  }
  function spot(p,color,size=3,glow=0){const q=project(p);ctx.beginPath();ctx.arc(q.x,q.y,size,0,M.TAU);ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=glow;ctx.fill();ctx.shadowBlur=0;}
  function draw(){
    ctx.clearRect(0,0,width,height);
    const light=$('luminous').checked;
    for(let i=-4;i<=4;i++){line([[i,-4,0],[i,4,0]],'#719693',.105,.7);line([[-4,i,0],[4,i,0]],'#719693',.105,.7);}
    line([[0,0,-.2],[0,0,4]],'#aab8a7',.24,.8);
    const active=families.map((_,i)=>i).filter(i=>(mode==='all'||mode===families[i])&&(i!==3||$('plane-partner').checked));
    const quads=[];
    for(const i of active){const g=meshes[i];for(let v=0;v<g.length-1;v++)for(let u=0;u<g[0].length-1;u++){
      const p=[g[v][u],g[v][u+1],g[v+1][u+1],g[v+1][u]].map(project);quads.push({p,i,z:p.reduce((a,b)=>a+b.z,0)/4});
    }}
    quads.sort((a,b)=>a.z-b.z);
    for(const {p,i} of quads){ctx.beginPath();p.forEach((q,j)=>j?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fillStyle='rgba('+rgb[i]+','+(mode==='all'?.022:.055)+')';ctx.fill();}
    if(light)ctx.globalCompositeOperation='screen';
    for(const i of active){const g=meshes[i];for(let v=0;v<g.length;v+=2)line(g[v],colors[i],v===0||v===g.length-1?.65:.25,.85,light?3:0);
      for(let u=0;u<g[0].length-1;u+=2)line(g.map(row=>row[u]),colors[i],mode==='all'?.3:.47,.65,light?2:0);
      // A moving generatrix shows the released azimuth, without changing the
      // selected path or the statistics beside it.
      const phi=playing?phase:(i===2?params.phi1:params.phi2);
      const at=t=>i===3?M.planePoint(params,playing?domain.lo+(domain.hi-domain.lo)*(.5+.45*Math.sin(phase*.7)):params.t1,t):M.point(families[i],params,phi,t);
      const curve=[];for(let j=0;j<=40;j++)curve.push(at(domain.lo+(domain.hi-domain.lo)*j/40));
      line(curve,colors[i],.95,1.6,light?10:0);
      if(playing)spot(at(domain.lo+(domain.hi-domain.lo)*(.5+.45*Math.sin(phase*.7))),colors[i],2.7,light?14:0);
    }
    ctx.globalCompositeOperation='source-over';
    line([[0,0,0],model.b,model.x],'#faf0c5',.95,2,light?9:0);
    spot([0,0,0],'#e6b96e',4,light?20:0);spot(model.b,'#faf0c5',4,light?18:0);spot(model.x,'#ffffff',5,light?22:0);
    ctx.setLineDash([7,6]);line([probe.o,M.add(probe.o,M.mul(probe.d,10))],'#e99591',.75,1.5,light?3:0);ctx.setLineDash([]);
    for(const i of active)for(const r of roots[i]){const p=project(r.point);ctx.strokeStyle=colors[i];ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,7+i*3,0,M.TAU);ctx.stroke();}
    const x=project(model.x),b=project(model.b);ctx.font='11px ui-monospace,monospace';ctx.fillStyle='#ebddbd';ctx.fillText('selected path',x.x+12,x.y-13);ctx.fillStyle='#adbfba';ctx.fillText('scatter',b.x+11,b.y+16);
    dirty=false;
  }
  function request(){if(!frame)frame=requestAnimationFrame(tick);}
  function tick(time){frame=0;if(document.hidden)return;if(dirty||playing&&time-lastFrame>32){if(playing)phase+=Math.min(64,time-lastFrame||32)*.00048;lastFrame=time;draw();}if(playing)request();}
  function stop(){playing=false;$('play').textContent='Animate sweep';$('play').setAttribute('aria-pressed','false');$('view-caption').textContent='Same path · complementary surfaces';dirty=true;request();}
  $('play').addEventListener('click',()=>{if(playing){stop();return;}playing=true;lastFrame=0;$('play').textContent='Pause sweep';$('play').setAttribute('aria-pressed','true');$('view-caption').textContent='Azimuth sweeps · selected path stays fixed';request();});
  reduced.addEventListener('change',()=>{if(reduced.matches)stop();});
  $('luminous').addEventListener('change',()=>{dirty=true;request();});
  $('plane-partner').addEventListener('change',read);
  for(const id of [...parameterIds,...probeIds])$(id).addEventListener('input',read);
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));dirty=true;request();}));
  document.querySelectorAll('[data-probe]').forEach(b=>b.addEventListener('click',()=>{
    let d;if(b.dataset.probe==='shared-tangent'){$('phi2').value=0;read();d=M.unit(M.cross(model.v1,model.v2));}
    else if(b.dataset.probe==='crossing')d=M.unit([.65,-.72,.24]);
    else {const spin=b.dataset.probe==='cone-tangent'?M.mul(M.cross(model.v1,model.v2),params.t2):M.cross([0,0,1],model.x);d=M.unit(M.add(model.v2,M.mul(spin,.55)));}
    $('azimuth').value=Math.atan2(d[1],d[0])/rad;$('elevation').value=Math.asin(d[2])/rad;$('offset').value=0;read();
  }));
  $('arrangement').addEventListener('change',()=>{presets[$('arrangement').value].forEach((v,i)=>$(parameterIds[i]).value=v);read();});
  $('reset-view').addEventListener('click',()=>{yaw=-.5;pitch=.38;zoom=.82;dirty=true;request();});
  let drag=null;canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw-=(e.clientX-drag.x)*.006;pitch=Math.max(-1.35,Math.min(1.35,pitch+(e.clientY-drag.y)*.005));drag={x:e.clientX,y:e.clientY};dirty=true;request();});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>drag=null);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.5,Math.min(2,zoom*Math.exp(-e.deltaY*.0006)));dirty=true;request();},{passive:false});
  new ResizeObserver(()=>{const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);width=rect.width;height=rect.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);dirty=true;request();}).observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastFrame=0;dirty=true;request();}});
  read();

  function element(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
  function table(headers,rows){const wrap=element('div',null,'table-scroll'),t=element('table'),head=element('tr');headers.forEach(x=>head.append(element('th',x)));t.append(head);rows.forEach(values=>{const row=element('tr');values.forEach(x=>row.append(element('td',String(x))));t.append(row);});wrap.append(t);return wrap;}
  async function measurements(){
    try{
      const response=await fetch('validation.json');if(!response.ok)throw Error('unavailable');const data=await response.json(),e=data.estimates;
      const ref=Object.values(data.reference).at(-1),mis=e.three_chart_mis,varianceGain=Math.min(...['cylinder','cone','hyperboloid'].map(k=>e[k].variance_times_quadric_queries))/mis.variance_times_quadric_queries;
      const root=$('measurements-content');root.replaceChildren();const grid=element('div',null,'measure-grid');
      for(const [value,label] of [[ref.toFixed(6),'independent quadrature'],[mis.mean.toFixed(6),'three-chart MIS mean'],[(100*mis.relative_reference_error).toFixed(2)+'%','MIS / reference difference'],[varianceGain.toFixed(2)+'×','variance reduction vs best single · equal queries']]){const card=element('div',null,'measure-card');card.append(element('span',label),element('strong',value));grid.append(card);}root.append(grid);
      root.append(table(['Method','Mean','95% replicate interval','Variance × queries'],Object.entries(e).map(([k,v])=>[k==='three_chart_mis'?'Three-chart MIS':k[0].toUpperCase()+k.slice(1),v.mean.toFixed(6),v.ci95_normal.map(x=>x.toFixed(6)).join(' – '),v.variance_times_quadric_queries.toFixed(5)])));
      root.append(element('p',`${data.replicates} independent replicates; ${data.samples_per_chart_per_replicate.toLocaleString()} draws per chart per replicate. MIS uses all three charts; the variance column accounts for that extra work. Normal intervals are empirical and can be unreliable for heavy-tailed single-chart estimates. Equal query count is not equal time.`,'small'));
      root.append(element('p','The native harness also records wall time and reference refinement. Geometry is checked with independent finite differences and known-path roots. The image below is a small numerical diagnostic, rather than a glass beauty render.','small'));
      const files=element('p',null,'small');const a=element('a','Saved measurement data');a.href='validation.json';files.append(a);root.append(files);
      const filmResponse=await fetch('films.json');if(filmResponse.ok){const films=await filmResponse.json();$('film-view').hidden=false;$('film').src='films.svg';$('film-caption').textContent=`${films.width} × ${films.height} pixels; ${films.queries_per_pixel} quadric queries per pixel, or ${films.mis_draws_per_chart_per_pixel} per chart in MIS. Same exposure and tone curve. The reference uses ${films.reference_quadrature.join(' × ')} midpoint quadrature per pixel; finite reference resolution remains an approximation.`;}
    }catch{$('measurements-content').replaceChildren(element('p','The saved numerical results could not be loaded. The live geometry experiment above remains available.'));}
  }
  async function cacheResults(){
    try{const response=await fetch('cache-summary.json');if(!response.ok)throw Error('unavailable');const d=await response.json(),root=$('cache-content');root.replaceChildren();
      root.append(table(['Visibility method','Relative bias / error','Exact query fraction','Time × variance / baseline'],d.rows.map(r=>[r.name,r.error,r.fraction,r.efficiency])));
      root.append(element('p',d.note,'small'));const img=element('img');img.src='visibility-atlas.svg';img.alt='Parameter-space visibility map, coarse cached prediction and positive or negative residual';img.style.width='100%';img.loading='lazy';root.append(img);
    }catch{$('cache-content').replaceChildren(element('p','The saved visibility results could not be loaded.'));}
  }
  measurements();cacheResults();
})();
