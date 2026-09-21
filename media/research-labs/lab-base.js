/* Event-driven canvas helpers. Only controls and resizing request frames. */
(() => {
  'use strict';
  const v={add:(a,b)=>a.map((x,i)=>x+b[i]),mul:(a,s)=>a.map(x=>x*s),dot:(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]};
  v.sub=(a,b)=>v.add(a,v.mul(b,-1));v.norm=a=>Math.hypot(...a);v.unit=a=>v.mul(a,1/v.norm(a));
  function projection(yaw,pitch,points,box,pad=.1){const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),raw=p=>[cy*p[0]-sy*p[1],sp*(sy*p[0]+cy*p[1])-cp*p[2]];let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const p of points){const q=raw(p);x0=Math.min(x0,q[0]-pad);x1=Math.max(x1,q[0]+pad);y0=Math.min(y0,q[1]-pad);y1=Math.max(y1,q[1]+pad);}const s=Math.min(box.w/Math.max(.1,x1-x0),box.h/Math.max(.1,y1-y0));const project=p=>{const q=raw(p);return [box.x+box.w/2+(q[0]-(x0+x1)/2)*s,box.y+box.h/2+(q[1]-(y0+y1)/2)*s];};project.scale=s;return project;}
  function line(ctx,points,color,width=1,dash=[]){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
  function dot(ctx,p,color,r=4){ctx.save();ctx.shadowColor=color;ctx.shadowBlur=15;ctx.fillStyle=color;ctx.beginPath();ctx.arc(...p,r,0,2*Math.PI);ctx.fill();ctx.restore();}
  function arrow(ctx,p,q,color,width=2){line(ctx,[p,q],color,width);const a=Math.atan2(q[1]-p[1],q[0]-p[0]);line(ctx,[[q[0]-8*Math.cos(a-.45),q[1]-8*Math.sin(a-.45)],q,[q[0]-8*Math.cos(a+.45),q[1]-8*Math.sin(a+.45)]],color,width);}
  function setup(draw){const $=id=>document.getElementById(id),canvas=$('stage'),ctx=canvas.getContext('2d');let pending=0,disposed=false;
    const render=()=>{pending=0;const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height;if(!w||!h)return;const dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);draw({$,canvas,ctx,w,h});};
    const schedule=()=>{if(!pending&&!disposed&&!document.hidden)pending=requestAnimationFrame(render);};
    const controls=[...document.querySelectorAll('input,select')],defaults=controls.map(el=>[el,el.value,el.checked]);controls.forEach(el=>el.addEventListener('input',schedule));
    $('reset')?.addEventListener('click',()=>{defaults.forEach(([el,val,checked])=>{el.value=val;el.checked=checked;});schedule();});
    const observer=new ResizeObserver(schedule);observer.observe(canvas);document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(pending);pending=0;}else schedule();});addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(pending);pending=0;observer.disconnect();});addEventListener('pageshow',()=>{disposed=false;observer.observe(canvas);schedule();});schedule();return schedule;
  }
  globalThis.ResearchLab={v,projection,line,dot,arrow,setup};
})();
