/* Shared-event geometry and native local density ratios. This is an on-demand
   schematic: it performs no path sampling, transport integration or benchmarking. */
(() => {
  'use strict';
  const PI=Math.PI,TAU=2*PI,dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s),sub=(a,b)=>add(a,mul(b,-1));
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=a=>mul(a,1/Math.hypot(...a)),axis=[0,0,1],phi=.4;
  const omega=theta=>[Math.sin(theta)*Math.cos(phi),Math.sin(theta)*Math.sin(phi),Math.cos(theta)];
  function densities(family,theta,t,d,size=1.2){
    const w=omega(theta),mu=Math.cos(theta),sn=Math.sin(theta),wd=dot(w,d),qt=.5*Math.exp(-.5*t);
    if(family==='planes')return {ut:Math.abs(dot(cross([size,0,0],w),d)),vt:Math.abs(dot(cross([0,size,0],w),d)),uv:size*size*Math.abs(d[2])*qt};
    if(family==='directional')return {cone:Math.abs(mu*wd-d[2])/t,disk:Math.abs(dot(cross(axis,w),d))/(TAU*t*sn*sn),sphere:qt*Math.abs(wd)};
    const tangentRing=[-Math.sin(phi),Math.cos(phi),0],tangentArc=[mu*Math.cos(phi),mu*Math.sin(phi),-sn];
    const sine=v=>Math.hypot(...cross(v,d)),qm=2*mu,qp=1/TAU;
    return {ring:qm*qt*sn*sine(tangentRing)/t,arc:qp*qt*sine(tangentArc)/(t*sn),beam:qm*qp*sine(w)/(t*t)};
  }
  function balances(ds){const total=Object.values(ds).reduce((a,b)=>a+b,0);return Object.fromEntries(Object.entries(ds).map(([k,v])=>[k,total>0?v/total:0]));}
  function fitSupport(points,width,height,pad=0){
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
    for(const p of points){x0=Math.min(x0,p[0]-pad);x1=Math.max(x1,p[0]+pad);y0=Math.min(y0,p[1]-pad);y1=Math.max(y1,p[1]+pad);}
    const scale=Math.min((width-110)/Math.max(.1,x1-x0),(height-91)/Math.max(.1,y1-y0));
    return {scale,cx:(x0+x1)/2,cy:(y0+y1)/2};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={densities,balances,omega,cross,dot,fitSupport};
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id),canvas=$('stage'),ctx=canvas.getContext('2d');if(!ctx)return;
  const family=document.body.dataset.family,members={planes:['ut','vt','uv'],directional:['cone','disk','sphere'],curves:['ring','arc','beam']}[family];
  const names={ut:'UT plane',vt:'VT plane',uv:'UV quad',arb:'Arbitrary plane',cone:'Cone',disk:'Disk',sphere:'Sphere',ring:'Ring',arc:'Arc',beam:'Beam'};
  const color=Object.fromEntries(members.map((k,i)=>[k,['#82e8cb','#f3c77c','#bda4ff'][i]]));color.arb='#83c8f6';
  const release={ut:'Sweep u + t · retain v',vt:'Sweep v + t · retain u',uv:'Sweep u + v · retain t',arb:'Sweep emitter chord + t · retain transverse offset',cone:'Sweep azimuth + distance · retain polar angle',disk:'Sweep polar angle + distance · retain azimuth',sphere:'Sweep both angles · retain distance',ring:'Sweep azimuth · retain polar angle + distance',arc:'Sweep polar angle · retain azimuth + distance',beam:'Sweep distance · retain both angles'};
  let mode='mis',pending=0,disposed=false;
  const controls=[...document.querySelectorAll('input[type=range]')],defaults=Object.fromEntries(controls.map(el=>[el.id,el.value]));
  const schedule=()=>{if(!pending&&!disposed&&!document.hidden)pending=requestAnimationFrame(()=>{pending=0;draw();});};
  function draw(){
    const box=canvas.getBoundingClientRect(),width=box.width,height=box.height;if(!width||!height)return;
    const dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const theta=+$('polar').value*PI/180,t=+$('distance').value,az=+$('camera').value*PI/180,el=+$('elevation').value*PI/180,yaw=(+$('orbit').value-28)*PI/180;
    const size=$('size')?+$('size').value:1.2,beta=$('orientation')?+$('orientation').value*PI/180:0,radius=$('radius')?+$('radius').value:.08;
    const w=omega(theta),x=mul(w,t),d=[Math.cos(el)*Math.cos(az),Math.cos(el)*Math.sin(az),Math.sin(el)];
    controls.forEach(control=>{const angle=['polar','camera','elevation','orbit','orientation'].includes(control.id);$(control.id+'-out').value=angle?control.value+'°':(+control.value).toFixed(control.id==='radius'?3:2);});
    const values=densities(family,theta,t,d,size),shares=balances(values);
    $('weights').innerHTML=members.map(key=>`<div class="weight" style="--c:${color[key]};--share:${shares[key]*100}%"><b>${(100*shares[key]).toFixed(1)}%</b><span>${names[key]} · local MIS weight</span><div class="meter"><i></i></div></div>`).join('');
    $('selection-note').textContent=mode==='mis'?'Same supported event, three different local densities. Turn the camera ray and watch the mixture shift responsibility.':release[mode];
    const maximum=Math.max(t*1.45,2.2,size*1.1),operations=[],supportPoints=[[0,0,0],x];
    let scale=1,cx=0,cy=0,collectBounds=false;
    const rawProject=p=>{const xx=p[0]*Math.cos(yaw)-p[1]*Math.sin(yaw),yy=p[0]*Math.sin(yaw)+p[1]*Math.cos(yaw);return [xx,.54*yy-.842*p[2]];};
    function project(p){const q=rawProject(p);return [width*.5+(q[0]-cx)*scale,height*.5+6+(q[1]-cy)*scale];}
    // Fit the actual selected support, not an oversized cube or the infinite
    // reference grid. Deferred drawing keeps thick curves at the same world radius.
    const stroke=(pts,c,lineWidth=1,dash=[])=>{operations.push({pts,c,lineWidth,dash,cap:ctx.lineCap});if(collectBounds)supportPoints.push(...pts);};
    const fill=(pts,c)=>{operations.push({pts,c,fill:true});if(collectBounds)supportPoints.push(...pts);};
    function path(fn,n=72){return Array.from({length:n+1},(_,i)=>fn(i/n));}
    function surface(fn,key,nu=12,nv=14){const c=color[key];for(let i=0;i<nu;i++)for(let j=0;j<nv;j++)fill([fn(i/nu,j/nv),fn((i+1)/nu,j/nv),fn((i+1)/nu,(j+1)/nv),fn(i/nu,(j+1)/nv)],c+'05');for(let i=0;i<=nu;i++)stroke(path(q=>fn(i/nu,q),48),c+'70',.8);for(let j=0;j<=nv;j++)stroke(path(q=>fn(q,j/nv),48),c+'55',.8);}
    for(let i=-5;i<=5;i++){stroke([[-maximum,i*maximum/5,0],[maximum,i*maximum/5,0]],'#819da41b');stroke([[i*maximum/5,-maximum,0],[i*maximum/5,maximum,0]],'#819da41b');}
    collectBounds=true;
    const half=size/2;fill([[-half,-half,0],[half,-half,0],[half,half,0],[-half,half,0]],'#edc77a18');stroke([[-half,-half,0],[half,-half,0],[half,half,0],[-half,half,0],[-half,-half,0]],'#edc77a77');
    collectBounds=false;
    stroke([[0,0,0],[0,0,maximum*1.4]],'#d2daf14c',1,[4,5]);
    collectBounds=true;
    const selected=mode==='mis'?members:[mode];
    for(const key of selected){
      if(key==='cone')surface((u,v)=>mul([Math.sin(theta)*Math.cos(TAU*u),Math.sin(theta)*Math.sin(TAU*u),Math.cos(theta)],maximum*v),key);
      if(key==='sphere')surface((u,v)=>mul([Math.sin(v*PI/2)*Math.cos(TAU*u),Math.sin(v*PI/2)*Math.sin(TAU*u),Math.cos(v*PI/2)],t),key);
      if(key==='disk')surface((u,v)=>mul([Math.sin(u*PI/2)*Math.cos(phi),Math.sin(u*PI/2)*Math.sin(phi),Math.cos(u*PI/2)],maximum*v),key);
      if(['ut','vt','arb'].includes(key)){const edge=key==='ut'?[1,0,0]:key==='vt'?[0,1,0]:[Math.cos(beta),Math.sin(beta),0],extent=key==='arb'?size/(2*Math.max(Math.abs(edge[0]),Math.abs(edge[1]))):half;surface((u,v)=>add(mul(edge,(2*u-1)*extent),mul(w,maximum*v)),key,6,10);}
      if(key==='uv')surface((u,v)=>add(x,[(u-.5)*size,(v-.5)*size,0]),key,7,7);
      if(['ring','arc','beam'].includes(key)){
        const pts=key==='ring'?path(q=>[t*Math.sin(theta)*Math.cos(TAU*q),t*Math.sin(theta)*Math.sin(TAU*q),t*Math.cos(theta)]):key==='arc'?path(q=>mul([Math.sin(PI*q/2)*Math.cos(phi),Math.sin(PI*q/2)*Math.sin(phi),Math.cos(PI*q/2)],t)):path(q=>mul(w,q*maximum));
        ctx.lineCap='round';stroke(pts,color[key]+'24',()=>Math.max(2,2*radius*scale));stroke(pts,color[key]+'f0',1.8);ctx.lineCap='butt';
        // Faint rods make the held distance and center of each angular sweep legible.
        if(key!=='beam')stroke([[0,0,0],x],color[key]+'38',1,[3,4]);
      }
    }
    ({scale,cx,cy}=fitSupport(supportPoints.map(rawProject),width,height,family==='curves'?radius:0));
    collectBounds=false;
    stroke([sub(x,mul(d,maximum*1.18)),add(x,mul(d,maximum*1.18))],'#f4f0dc',2,[7,4]);
    ctx.save();ctx.beginPath();ctx.rect(8,33,width-16,height-62);ctx.clip();
    for(const op of operations){ctx.beginPath();op.pts.forEach((p,i)=>{const v=project(p);i?ctx.lineTo(...v):ctx.moveTo(...v);});if(op.fill){ctx.closePath();ctx.fillStyle=op.c;ctx.fill();}else{ctx.strokeStyle=op.c;ctx.lineWidth=typeof op.lineWidth==='function'?op.lineWidth():op.lineWidth;ctx.lineCap=op.cap;ctx.setLineDash(op.dash);ctx.stroke();}}
    ctx.restore();
    const point=project(x),source=project([0,0,0]);
    ctx.save();ctx.shadowColor='#f7f2d2';ctx.shadowBlur=18;ctx.fillStyle='#fff9d4';ctx.beginPath();ctx.arc(...point,4,0,TAU);ctx.fill();ctx.restore();ctx.fillStyle='#f2cf89';ctx.beginPath();ctx.arc(...source,3.5,0,TAU);ctx.fill();
    ctx.font='11px system-ui';ctx.fillStyle='#e9e6d3';ctx.fillText('shared event x',point[0]+8,point[1]-10);ctx.fillStyle='#e2c27d';ctx.fillText('source y',source[0]+9,source[1]+16);
    ctx.font='12px system-ui';ctx.fillStyle='#c1d4db';ctx.fillText(mode==='mis'?'Complementary supports at one camera event':release[mode],15,23);
    ctx.font='11px system-ui';ctx.fillStyle='#96a9b7';ctx.fillText(family==='curves'?'Translucent tube = finite support · core = one-dimensional sweep':'Finite drawing window · the native support also applies medium and visibility tests',15,height-15);
  }
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));schedule();}));
  controls.forEach(el=>el.addEventListener('input',schedule));
  $('grazing').addEventListener('click',()=>{const theta=+$('polar').value*PI/180,w=omega(theta),key=mode==='mis'?members[0]:mode;let d;
    if(key==='uv')d=[1,0,0];else if(key==='ut')d=[1,0,0];else if(key==='vt')d=[0,1,0];else if(key==='arb'){const a=+$('orientation').value*PI/180;d=[Math.cos(a),Math.sin(a),0];}
    else if(key==='sphere'||key==='ring')d=[-Math.sin(phi),Math.cos(phi),0];else if(key==='arc')d=[Math.cos(theta)*Math.cos(phi),Math.cos(theta)*Math.sin(phi),-Math.sin(theta)];else d=w;
    $('camera').value=Math.atan2(d[1],d[0])*180/PI;$('elevation').value=Math.asin(d[2])*180/PI;schedule();});
  $('reset').addEventListener('click',()=>{controls.forEach(el=>el.value=defaults[el.id]);mode='mis';document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode==='mis')));schedule();});
  const observer=new ResizeObserver(schedule);observer.observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(pending);pending=0;}else schedule();});
  addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(pending);pending=0;observer.disconnect();});
  addEventListener('pageshow',()=>{disposed=false;observer.observe(canvas);schedule();});schedule();
})();
