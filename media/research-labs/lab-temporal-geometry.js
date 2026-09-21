/* Exact geometric teaching models; no Monte Carlo radiance is implied. */
(() => {
  'use strict';
  const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s);
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=a=>Math.hypot(...a),unit=a=>mul(a,1/norm(a)),TAU=2*Math.PI;
  const light=[-1,0,0],camera=[1,0,0],ballRadius=3.5;
  function arrival(x,unwarp=false){return norm(sub(x,light))+(unwarp?0:norm(sub(x,camera)));}
  function sheet(length,theta,phi,unwarp=false){
    if(unwarp)return add(light,[length*Math.cos(theta),length*Math.sin(theta)*Math.cos(phi),length*Math.sin(theta)*Math.sin(phi)]);
    if(length<2)return null;
    const a=length/2,b=Math.sqrt(a*a-1);
    return [a*Math.cos(theta),b*Math.sin(theta)*Math.cos(phi),b*Math.sin(theta)*Math.sin(phi)];
  }
  function timeGradient(x,unwarp=false){return unwarp?unit(sub(x,light)):add(unit(sub(x,light)),unit(sub(x,camera)));}
  function directions(spread=1){return [[1,1,spread],[1,-1,-spread],[-1,1,-spread],[-1,-1,spread]].map(unit);}
  function push(t,dirs){return t.reduce((p,x,i)=>add(p,mul(dirs[i],x)),[0,0,0]);}
  function sliceVertices(time){
    const points=[];
    for(let free=0;free<4;free++)for(let mask=0;mask<8;mask++){
      const p=Array(4).fill(0);let bit=0,sum=0;
      for(let i=0;i<4;i++)if(i!==free){p[i]=(mask>>bit++)&1;sum+=p[i];}
      p[free]=time-sum;
      if(p[free]>=-1e-9&&p[free]<=1+1e-9){p[free]=Math.min(1,Math.max(0,p[free]));if(!points.some(q=>norm(sub(p,q))<1e-8))points.push(p);}
    }
    return points;
  }
  function hull(points){
    const faces=[],seen=new Set(),center=points.reduce((p,q)=>add(p,mul(q,1/points.length)),[0,0,0]);
    for(let a=0;a<points.length;a++)for(let b=a+1;b<points.length;b++)for(let c=b+1;c<points.length;c++){
      let n=cross(sub(points[b],points[a]),sub(points[c],points[a]));if(norm(n)<1e-8)continue;n=unit(n);
      const d=points.map(p=>dot(n,sub(p,points[a])));if(d.some(x=>x>1e-7)&&d.some(x=>x<-1e-7))continue;
      const indices=d.flatMap((x,i)=>Math.abs(x)<1e-7?[i]:[]),key=indices.join(',');if(seen.has(key))continue;seen.add(key);
      const mid=indices.reduce((p,i)=>add(p,mul(points[i],1/indices.length)),[0,0,0]);if(dot(n,sub(mid,center))<0)n=mul(n,-1);
      const u=unit(sub(points[indices[0]],mid)),v=cross(n,u);
      indices.sort((i,j)=>Math.atan2(dot(sub(points[i],mid),v),dot(sub(points[i],mid),u))-Math.atan2(dot(sub(points[j],mid),v),dot(sub(points[j],mid),u)));
      faces.push({indices,normal:n});
    }
    return faces;
  }
  function jacobian(dirs){return Math.abs(dot(sub(dirs[0],dirs[3]),cross(sub(dirs[1],dirs[3]),sub(dirs[2],dirs[3]))));}
  function density(time){return [1,-4,6,-4,1].reduce((sum,c,k)=>sum+c*Math.pow(Math.max(0,time-k),3),0)/6;}
  function polyVolume(points,faces=hull(points)){return Math.abs(faces.reduce((sum,f)=>{const a=points[f.indices[0]];for(let j=1;j<f.indices.length-1;j++)sum+=dot(a,cross(points[f.indices[j]],points[f.indices[j+1]]))/6;return sum;},0));}
  const math={light,camera,ballRadius,arrival,sheet,timeGradient,directions,push,sliceVertices,hull,jacobian,density,polyVolume};
  if(typeof module!=='undefined')module.exports=math;if(typeof document==='undefined')return;
  const {projection,line,dot:glowDot,setup}=ResearchLab,colors=['#ffdf86','#94efcb','#baa6ff','#ff9e74'];
  function label(ctx,text,x,y,color='#c6d8d9',size=12){ctx.fillStyle=color;ctx.font=`${size}px system-ui`;ctx.fillText(text,x,y);}
  function grid(ctx,p,size=2){for(let i=-2;i<=2;i++){line(ctx,[p([-size,i,0]),p([size,i,0])],'#8fa99b16');line(ctx,[p([i,-size,0]),p([i,size,0])],'#8fa99b16');}}
  function mesh(ctx,p,length,unwarp,color,alpha='88',width=1){
    if(!unwarp&&length<=2)return;
    const visible=pt=>norm(sub(pt,light))<=ballRadius+1e-6;
    for(let k=1;k<12;k++){
      let path=[];for(let j=0;j<=72;j++){const pt=sheet(length,k*Math.PI/12,j*TAU/72,unwarp);if(visible(pt))path.push(p(pt));else{if(path.length>1)line(ctx,path,color+alpha,width);path=[];}}if(path.length>1)line(ctx,path,color+alpha,width);
    }
    for(let k=0;k<18;k++){
      let path=[];for(let j=0;j<=48;j++){const pt=sheet(length,j*Math.PI/48,k*TAU/18,unwarp);if(visible(pt))path.push(p(pt));else{if(path.length>1)line(ctx,path,color+alpha,width);path=[];}}if(path.length>1)line(ctx,path,color+alpha,width);
    }
  }
  function polygon(ctx,points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.3;ctx.stroke();}
  function drawHull(ctx,p,points,color){const faces=hull(points);for(const f of faces)polygon(ctx,f.indices.map(i=>p(points[i])),color+'15',color+'70');for(const q of points)glowDot(ctx,p(q),color,2.5);}
  const schedule=setup(({$,ctx,w,h})=>{
    const mode=$('mode').value,hyper=mode==='hyper',unwarp=$('unwarp').checked,gate=$('gate').checked;
    const time=+$('time').value,width=+$('width').value,yaw=+$('orbit').value*Math.PI/180,probe=+$('probe').value*Math.PI/180,spread=+$('spread').value;
    document.querySelectorAll('[data-ball]').forEach(el=>{el.hidden=hyper;});document.querySelectorAll('[data-hyper]').forEach(el=>{el.hidden=!hyper;});
    for(const id of ['time','length','width','orbit','probe','spread'])$(id+'-out').value=(+$ (id).value).toFixed(['orbit','probe'].includes(id)?0:2);
    const split=w>660,half=split?w/2:w,ph=split?h:h/2;
    const box1={x:18,y:44,w:half-36,h:ph-84},box2={x:split?half+18:18,y:split?44:ph+44,w:half-36,h:ph-84};
    if(!hyper){
      // The same slider is an arrival length, in units with propagation speed c=1.
      const length=+$('length').value;
      const bounds=[];for(const x of [-4.7,2.7])for(const y of [-3.7,3.7])for(const z of [-3.7,3.7])bounds.push([x,y,z]);
      const p=projection(yaw,.3,bounds,box1,.03);grid(ctx,p,3);
      label(ctx,'WORLD SPACE · 3D SUPPORT',box1.x,box1.y-19,'#f4d689',11);
      if($('support').checked)mesh(ctx,p,ballRadius,true,'#a6c6cc','23');
      if(gate){
        mesh(ctx,p,length-width/2,unwarp,'#ffbd79','38');mesh(ctx,p,length+width/2,unwarp,'#b7a0ff','38');
        for(let k=0;k<250;k++){
          const t=Math.acos(1-2*((k*.754877666+.31)%1)),phi=k*2.39996323,l=length+(((k*.56984029+.2)%1)-.5)*width;
          const q=sheet(l,t,phi,unwarp);if(q&&norm(sub(q,light))<=ballRadius)glowDot(ctx,p(q),'#e7d5a953',1.1);
        }
      }
      ctx.save();ctx.shadowColor=unwarp?'#ffce69':'#a5ffe2';ctx.shadowBlur=9;mesh(ctx,p,length,unwarp,unwarp?'#ffce69':'#a5ffe2','b0',1.1);ctx.restore();
      const point=sheet(length,1.15,probe,unwarp),q=p(point),lp=p(light),cp=p(camera);
      line(ctx,[lp,q],colors[0],2.6);line(ctx,[q,cp],unwarp?'#aebac74c':colors[2],2.6,unwarp?[4,5]:[]);
      glowDot(ctx,lp,colors[0],5);glowDot(ctx,cp,colors[2],5);glowDot(ctx,q,'#ffffff',5);
      label(ctx,'Light',lp[0]+8,lp[1]+17,colors[0]);label(ctx,'Camera',cp[0]+8,cp[1]-9,colors[2]);
      const gl=norm(timeGradient(point,unwarp)),leg1=norm(sub(point,light)),leg2=norm(sub(point,camera));
      $('metric-a').textContent=gate?'3D thickness':'2D sheet';$('metric-b').textContent=gl.toFixed(4);$('metric-c').textContent=(1/gl).toFixed(4);
      $('metric-a-label').textContent='selected world-space support';$('metric-b-label').textContent='arrival gradient |∇L|';$('metric-c-label').textContent='coarea factor 1 / |∇L|';
      label(ctx,unwarp?'Camera unwarped: a spherical wavefront':'Full sensor travel: an ellipsoidal wavefront',box1.x,box1.y+box1.h+25,'#e9ebdb',12);
      const x0=box2.x+8,y0=box2.y+18,bw=box2.w-16;
      label(ctx,'ONE PATH · TWO TRAVEL DISTANCES',box2.x,box2.y-19,'#f4d689',11);
      label(ctx,'Source → selected point',x0,y0,colors[0]);label(ctx,leg1.toFixed(3),x0+bw-50,y0,colors[0]);
      ctx.fillStyle=colors[0]+'a8';ctx.fillRect(x0,y0+13,bw*leg1/(leg1+leg2),12);
      label(ctx,'Selected point → sensor',x0,y0+63,colors[2]);label(ctx,leg2.toFixed(3),x0+bw-50,y0+63,colors[2]);
      ctx.fillStyle=colors[2]+(unwarp?'38':'a8');ctx.fillRect(x0,y0+76,bw*leg2/(leg1+leg2),12);
      label(ctx,unwarp?'Sensor leg removed from the time coordinate':'Both legs contribute to the measured arrival',x0,y0+120,'#d4dfda',12);
      label(ctx,unwarp?'Lᵤ(x) = |x − light|':'L(x) = |x − light| + |x − camera|',x0,y0+149,'#bba5ff',13);
      const gy=y0+200,gx=x0,gw=bw,gh=Math.max(70,box2.h-240),max=5.2;
      line(ctx,[[gx,gy+gh],[gx+gw,gy+gh]],'#bdced955');
      // Along the selected source ray, this graph uses the exact finite-camera distance.
      const dir=unit(sub(point,light)),pts=[];for(let i=0;i<=110;i++){const r=ballRadius*i/110,value=arrival(add(light,mul(dir,r)),unwarp);pts.push([gx+i*gw/110,gy+gh-value/max*gh]);}line(ctx,pts,unwarp?colors[0]:colors[1],2);
      const target=gy+gh-length/max*gh;if(gate){ctx.fillStyle='#ffce7926';ctx.fillRect(gx,target-width/max*gh/2,gw,width/max*gh);}line(ctx,[[gx,target],[gx+gw,target]],'#f5d78c',1.2,[4,4]);glowDot(ctx,[gx+leg1/ballRadius*gw,target],'#fff0b8',4);
      label(ctx,'Distance along this light ray →',gx,gy+gh+23,'#abbfce',11);label(ctx,'Arrival L',gx,gy-12,'#abbfce',11);
      $('mode-summary').textContent=unwarp?'Removing only the sensor leg reveals local propagation. The same ball now meets a spherical arrival surface. The camera still observes it; only its travel delay is omitted.':'Equal source-to-point plus point-to-sensor distance defines an ellipsoid with the source and sensor as foci. A finite gate has thickness; its zero-width limit is a surface.';
    }else{
      const dirs=directions(spread),coords=sliceVertices(time),chart=coords.map(q=>q.slice(0,3)),world=coords.map(q=>push(q,dirs));
      const cube=Array.from({length:8},(_,i)=>[i&1,(i>>1)&1,(i>>2)&1]);
      const support4=Array.from({length:16},(_,i)=>push(Array.from({length:4},(_,k)=>(i>>k)&1),dirs));
      const p1=projection(yaw,.4,cube,box1,.12),p2=projection(yaw,.4,support4,box2,.12);
      label(ctx,'PARAMETER SPACE · (t₁, t₂, t₃)',box1.x,box1.y-19,'#f4d689',11);label(ctx,'WORLD SPACE · x = Σ tᵢ ωᵢ',box2.x,box2.y-19,'#f4d689',11);
      for(let i=0;i<8;i++)for(let k=0;k<3;k++)if(!(i&(1<<k)))line(ctx,[p1(cube[i]),p1(cube[i|(1<<k)])],'#b3cad73a');
      for(let i=0;i<16;i++)for(let k=0;k<4;k++)if(!(i&(1<<k)))line(ctx,[p2(support4[i]),p2(support4[i|(1<<k)])],colors[k]+'22');
      drawHull(ctx,p1,chart,colors[1]);drawHull(ctx,p2,world,colors[0]);
      for(const [axis,name] of [[0,'t₁'],[1,'t₂'],[2,'t₃']]){const to=[0,0,0];to[axis]=1;const q=p1(to);line(ctx,[p1([0,0,0]),q],colors[axis],2);label(ctx,name,q[0]+8,q[1]+6,colors[axis],14);}
      const weights=coords.reduce((q,p)=>add(q,mul(p,1/coords.length)),[0,0,0,0]);let pos=[0,0,0];
      for(let i=0;i<4;i++){const next=add(pos,mul(dirs[i],weights[i]));line(ctx,[p2(pos),p2(next)],colors[i],3);glowDot(ctx,p2(next),colors[i],3.2);pos=next;}
      const j=jacobian(dirs);$('metric-a').textContent='4 − 1 = 3';$('metric-b').textContent=j.toFixed(4);$('metric-c').textContent=(1/j).toFixed(4);
      $('metric-a-label').textContent='free path coordinates after slicing';$('metric-b-label').textContent='space-time Jacobian |det A|';$('metric-c-label').textContent='world-volume density per unit time';
      label(ctx,'t₄ = T − t₁ − t₂ − t₃, with every tᵢ in [0,1]',box1.x,box1.y+box1.h+25,'#ccd9d7',11);
      label(ctx,`${coords.length} vertices · ${polyVolume(world).toFixed(3)} world-volume units`,box2.x,box2.y+box2.h+25,'#ccd9d7',11);
      $('mode-summary').textContent='Four independently swept segment lengths fill a 4D parameter box. Fixing their sum removes one degree of freedom. This 3D slice maps to a world-space volume when the four direction vectors are affinely independent; flattening them makes the Jacobian shrink.';
    }
  });
  // Dragging changes the view only. The host suspension wrapper keeps this state intact.
  const canvas=document.getElementById('stage');let drag=null;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,angle:+document.getElementById('orbit').value};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;document.getElementById('orbit').value=Math.max(-175,Math.min(175,drag.angle+(e.clientX-drag.x)*.45));schedule();});
  canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
})();
