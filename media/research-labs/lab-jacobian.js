/* Exact local tangents, with an orthographic 3D illustration of projected measure. */
(() => {
  'use strict';
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const omega=(t,p)=>[Math.sin(t)*Math.cos(p),Math.sin(t)*Math.sin(p),Math.cos(t)];
  function patch(shape,t,p,r){const o=omega(t,p),dt=[Math.cos(t)*Math.cos(p),Math.cos(t)*Math.sin(p),-Math.sin(t)],dp=[-Math.sin(t)*Math.sin(p),Math.sin(t)*Math.cos(p),0],mul=(a,s)=>a.map(x=>x*s);return {x:mul(o,r),a:shape==='plane'?[1,0,0]:mul(shape==='sphere'?dt:dp,r),b:shape==='sphere'?mul(dp,r):o};}
  function jacobian(a,b,d){return Math.abs(dot(cross(a,b),d));}
  const math={omega,patch,jacobian};if(typeof module!=='undefined')module.exports=math;if(typeof document==='undefined')return;
  const {v,projection,line,dot:point,arrow,setup}=ResearchLab,TAU=2*Math.PI,rad=x=>x*Math.PI/180;
  setup(({$,ctx,w,h})=>{
    const values={};for(const id of ['polar','azimuth','radius','camera','elevation','orbit']){values[id]=+$ (id).value;$(id+'-out').value=values[id].toFixed(id==='radius'?2:0)+(id==='radius'?'':'°');}
    const shape=$('shape').value,t=rad(values.polar),p=rad(values.azimuth),r=values.radius,d=omega(Math.PI/2-rad(values.elevation),rad(values.camera)),{x,a,b}=patch(shape,t,p,r),n=v.unit(v.cross(a,b)),J=jacobian(a,b,d);
    $('jacobian').textContent=J.toFixed(4);$('inverse').textContent=J<1e-7?'singular':(1/J).toFixed(3);$('facing').textContent=Math.abs(v.dot(n,d)).toFixed(4);
    const curves=[],R=r,addCurve=(fn,N=64)=>{const pts=Array.from({length:N+1},(_,i)=>fn(i/N));curves.push(pts);};
    if(shape==='sphere'){for(let k=1;k<10;k++)addCurve(u=>v.mul(omega(Math.PI*k/10,u*TAU),R));for(let k=0;k<16;k++)addCurve(u=>v.mul(omega(u*Math.PI,k*TAU/16),R));}
    else if(shape==='cone'){for(let k=1;k<=7;k++)addCurve(u=>v.mul(omega(t,u*TAU),R*k/6));for(let k=0;k<20;k++)addCurve(u=>v.mul(omega(t,k*TAU/20),u*R*7/6),1);}
    else {const o=omega(t,p);for(let k=-6;k<=6;k++){const z=k*R/6;addCurve(u=>v.add([z,0,0],v.mul(o,(u*2-.2)*R)),1);addCurve(u=>v.add([(u*2-1)*R,0,0],v.mul(o,(k+6)*R/6)),1);}}
    const sz=.18,patchCorners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,z])=>v.add(x,v.add(v.mul(a,u*sz),v.mul(b,z*sz)))),endA=v.add(x,v.mul(a,.58)),endB=v.add(x,v.mul(b,.58)),endN=v.add(x,v.mul(n,.7)),cam=v.add(x,v.mul(d,1.15));
    const graphW=Math.min(300,w*.34),box={x:20,y:40,w:w-graphW-40,h:h-85};
    const proj=projection(rad(values.orbit),.3,[...curves.flat(),...patchCorners,endA,endB,endN,cam],box,.08);
    for(const c of curves)line(ctx,c.map(proj),'#68a5b43c',1);
    const screen=patchCorners.map(proj);ctx.beginPath();screen.forEach((q,i)=>i?ctx.lineTo(...q):ctx.moveTo(...q));ctx.closePath();ctx.fillStyle='#84e0c345';ctx.fill();line(ctx,[...screen,screen[0]],'#91eed4',2);
    arrow(ctx,proj(x),proj(endA),'#87ebc3',2.5);arrow(ctx,proj(x),proj(endB),'#edc471',2.5);arrow(ctx,proj(x),proj(endN),'#ad97f1',2);arrow(ctx,proj(cam),proj(x),'#f5f0d9',2);
    line(ctx,[proj([0,0,0]),proj(x)],'#b69aef',2,[5,5]);point(ctx,proj([0,0,0]),'#eac778',4);point(ctx,proj(x),'#ffffff',4);
    ctx.font='12px system-ui';ctx.fillStyle='#f0ebda';ctx.fillText('photon parameter patch',box.x+4,22);ctx.fillStyle='#abc2c9';ctx.fillText('Mint / gold: tangents   Violet: normal   White: camera ray',20,h-17);
    const gx=w-graphW+12,gy=85,gw=graphW-40,gh=h-165;ctx.fillStyle='#b9c7cf';ctx.font='12px system-ui';ctx.fillText('J as camera azimuth changes',gx,44);line(ctx,[[gx,gy],[gx,gy+gh],[gx+gw,gy+gh]],'#7b879255');
    const max=v.norm(v.cross(a,b)),graph=Array.from({length:181},(_,i)=>{const az=-Math.PI+i*TAU/180;return [gx+i*gw/180,gy+gh-jacobian(a,b,omega(Math.PI/2-rad(values.elevation),az))/Math.max(1e-9,max)*gh];});line(ctx,graph,'#82e9ce',2);
    const mx=gx+(values.camera+180)/360*gw,my=gy+gh-J/Math.max(1e-9,max)*gh;line(ctx,[[mx,gy],[mx,gy+gh]],'#eac77870',1,[4,4]);point(ctx,[mx,my],'#f3cb79',5);ctx.fillText('−180°',gx,gy+gh+22);ctx.fillText('+180°',gx+gw-39,gy+gh+22);ctx.fillText('0',gx-12,gy+gh+4);ctx.fillText(max.toFixed(2),gx,gy-10);
    if(J/max<.08){ctx.fillStyle='#ffb18e';ctx.fillText('Near grazing: inverse is ill-conditioned',gx,gy+gh+48);}
  });
})();
