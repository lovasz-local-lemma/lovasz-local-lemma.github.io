/* Event-driven teaching diagram. It shows geometry and dimensional bookkeeping,
   not a universal estimator weight or native RadianceLab output. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), canvas=$('atlas'), ctx=canvas.getContext('2d');
  if(!ctx)return;
  const families={
    point:{title:'Point estimator',dim:0,remaining:3,query:'kernel lookup',note:'No path coordinate is released. A finite, normalized spatial kernel turns nearby samples into an estimate.',jac:'A finite transverse kernel is required; its support and normalization are part of the estimator.'},
    beam:{title:'Photon beam',dim:1,remaining:2,query:'ray–curve proximity',note:'Distance along a segment is released. The camera tests a swept curve through space.',jac:'Jcurve(u) = ‖X′(u) × d‖, together with the specified transverse kernel.'},
    ring:{title:'Photon ring',dim:1,remaining:2,query:'ray–curve roots',note:'Azimuth is released while distance and polar angle remain sampled, producing a circular orbit.',jac:'Every admissible ring crossing contributes; tangencies require special handling.'},
    arc:{title:'Photon arc',dim:1,remaining:2,query:'ray–curve roots',note:'Polar angle is released over a bounded interval. The retained azimuth makes the support an arc.',jac:'Jcurve(u) = ‖X′(u) × d‖; endpoint support remains part of the construction.'},
    sphere:{title:'Photon sphere',dim:2,remaining:1,query:'ray–surface roots',note:'Both directions are released at a fixed path distance, producing a spherical support.',jac:'Jsheet(α,β) = |(∂αX × ∂βX) · d| at every admissible crossing.'},
    cone:{title:'Photon cone',dim:2,remaining:1,query:'ray–surface roots',note:'Azimuth and distance are released while polar angle stays sampled, sweeping a conical sheet.',jac:'Surface roots carry a projected-area Jacobian; a grazing root is not an ordinary crossing.'},
    sheet:{title:'Meridian sheet',dim:2,remaining:1,query:'ray–surface roots',note:'Polar angle and distance are released at fixed azimuth. Some implementation notes call this family a disc.',jac:'Jsheet(α,β) = |(∂αX × ∂βX) · d|; include every valid root.'},
    plane:{title:'Emitter plane',dim:2,remaining:1,query:'ray–surface root',note:'One emitter coordinate and path distance are swept into a planar sheet.',jac:'The projected surface measure vanishes at tangency and changes with the camera direction.'},
    volume:{title:'Photon volume',dim:3,remaining:0,query:'ray interval integral',note:'All three local coordinates are released. The camera query becomes an interval through a volume.',jac:'Integrate F(s) over {s : R(s) ∈ V}; there is no isolated-root Jacobian.'}
  };
  let pending=0,disposed=false;
  const values=()=>({family:$('family').value,view:$('view').value,offset:+$('offset').value,kernel:+$('kernel').value});
  const schedule=()=>{if(!disposed&&!pending&&!document.hidden)pending=requestAnimationFrame(()=>{pending=0;draw();});};
  function fit(){
    const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(box.width*dpr)||canvas.height!==Math.round(box.height*dpr)){canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);return [box.width,box.height];
  }
  const line=(points,color,width=1,dash=[])=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);};
  const glow=(x,y,color='#86e3d0')=>{ctx.save();ctx.shadowColor=color;ctx.shadowBlur=16;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.restore();};
  function drawParameter(x,y,w,h,cfg,view){
    ctx.fillStyle='#0d1520';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#ffffff13';ctx.strokeRect(x+.5,y+.5,w-1,h-1);
    ctx.fillStyle='#d5c58e';ctx.font='600 11px system-ui';ctx.fillText(view==='geometry'?'PARAMETER SPACE · RELEASE':'MEASURE · LOCAL CONDITION',x+16,y+24);
    if(view==='measure'){
      const labels=cfg.dim<2?['transverse distance','kernel / root','density']:['projected area','root multiplicity','density'];
      labels.forEach((label,i)=>{const yy=y+62+i*62,amount=.28+(cfg.dim+i)*.15;ctx.fillStyle='#9eb0be';ctx.font='11px system-ui';ctx.fillText(label,x+16,yy);ctx.fillStyle='#172332';ctx.fillRect(x+16,yy+10,w-32,11);ctx.fillStyle=i===1?'#b5a1ec':'#72d7c4';ctx.fillRect(x+16,yy+10,(w-32)*Math.min(.9,amount),11);});
      ctx.fillStyle='#8295a5';ctx.font='10px ui-monospace,monospace';ctx.fillText(cfg.dim===3?'interval measure':'support × density × Jacobian',x+16,y+h-20);return;
    }
    const cx=x+w/2,cy=y+h*.55,scale=Math.min(w,h)*.28;
    ctx.strokeStyle='#6b7c8c55';ctx.lineWidth=1;
    line([[cx-scale*1.25,cy],[cx+scale*1.25,cy]],'#6b7c8c66');
    line([[cx,cy+scale],[cx,cy-scale]],'#6b7c8c66');
    if(cfg.dim===3)line([[cx-scale*.72,cy+scale*.65],[cx+scale*.72,cy-scale*.65]],'#6b7c8c55');
    if(cfg.dim===0){glow(cx,cy,'#e8c36e');ctx.fillStyle='#9baab6';ctx.fillText('one sampled point',cx-46,cy+32);}
    else if(cfg.dim===1){ctx.beginPath();ctx.ellipse(cx,cy,scale*.88,scale*.42,-.22,0,Math.PI*2);ctx.strokeStyle='#78dac8';ctx.lineWidth=3;ctx.stroke();glow(cx+scale*.76,cy-scale*.22,'#e8c36e');}
    else if(cfg.dim===2){for(let i=-3;i<=3;i++){line([[cx-scale,cy+i*scale/4],[cx+scale,cy+i*scale/4]],'#75d9c85c');line([[cx+i*scale/4,cy-scale],[cx+i*scale/4,cy+scale]],'#75d9c85c');}glow(cx+scale*.72,cy-scale*.68,'#e8c36e');}
    else{ctx.fillStyle='#70d8c31a';ctx.strokeStyle='#70d8c38c';ctx.fillRect(cx-scale,cy-scale*.72,scale*2,scale*1.44);ctx.strokeRect(cx-scale,cy-scale*.72,scale*2,scale*1.44);for(let i=1;i<4;i++){line([[cx-scale+i*scale*.5,cy-scale*.72],[cx-scale+i*scale*.5,cy+scale*.72]],'#70d8c344');} }
    ctx.fillStyle='#8fa2b0';ctx.font='10px system-ui';ctx.fillText(cfg.dim+' released coordinate'+(cfg.dim===1?'':'s'),x+16,y+h-20);
  }
  function drawWorld(x,y,w,h,family,offset,kernel){
    ctx.fillStyle='#09101a';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#ffffff13';ctx.strokeRect(x+.5,y+.5,w-1,h-1);
    ctx.fillStyle='#d5c58e';ctx.font='600 11px system-ui';ctx.fillText('WORLD SPACE · CAMERA QUERY',x+16,y+24);
    const X=t=>x+38+t*(w-76),Y=v=>y+h*.55-v*h*.31,rayY=Y(offset);
    for(let i=0;i<7;i++)line([[x+20,y+45+i*(h-70)/6],[x+w-18,y+45+i*(h-70)/6]],'#61748613');
    const ray=[[x+20,rayY],[x+w-18,rayY]];line(ray,'#b9a7f1',2,[7,5]);
    ctx.fillStyle='#b9a7f1';ctx.font='10px system-ui';ctx.fillText('camera ray R(s)',x+w-116,rayY-8);
    let roots=[],support='';
    const poly=(fn,a=0,b=1,steps=120,color='#70dac7',width=2)=>{
      const pts=[];let prev;
      for(let i=0;i<=steps;i++){const t=a+(b-a)*i/steps,p=[X(t),Y(fn(t))];pts.push(p);if(prev&&(prev[1]-rayY)*(p[1]-rayY)<=0&&Math.abs(prev[1]-p[1])>1e-5){const q=(rayY-prev[1])/(p[1]-prev[1]);roots.push([prev[0]+q*(p[0]-prev[0]),rayY]);}prev=p;}line(pts,color,width);
    };
    ctx.save();
    if(family==='point'){const px=X(.56),py=Y(.31),d=Math.abs(.31-offset);ctx.strokeStyle='#72d8c4';ctx.lineWidth=2;ctx.beginPath();ctx.arc(px,py,5,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#72d8c422';ctx.beginPath();ctx.arc(px,py,kernel*h*.31,0,Math.PI*2);ctx.fill();if(d<=kernel)roots=[[px,rayY]];support='distance '+d.toFixed(2);}
    if(family==='beam')poly(t=>.56*Math.sin(t*Math.PI*2-.5),.08,.92);
    if(family==='ring'||family==='sphere'){const cy=0,r=family==='ring'?.62:.7;ctx.beginPath();ctx.ellipse(X(.56),Y(cy),(w-76)*.25,h*.31*r,0,0,Math.PI*2);ctx.strokeStyle='#70dac7';ctx.lineWidth=2;ctx.stroke();if(family==='sphere'){for(const q of [.35,.7]){ctx.beginPath();ctx.ellipse(X(.56),Y(cy),(w-76)*.25*q,h*.31*r,0,0,Math.PI*2);ctx.strokeStyle='#70dac735';ctx.stroke();}}if(Math.abs(offset-cy)<=r){const dx=(w-76)*.25*Math.sqrt(1-((offset-cy)/r)**2);roots=[[X(.56)-dx,rayY],[X(.56)+dx,rayY]];}}
    if(family==='arc')poly(t=>.72*Math.sin((t-.08)*Math.PI),.12,.82,85);
    if(family==='cone'){const apex=[X(.18),Y(.04)],a=[X(.88),Y(.72)],b=[X(.88),Y(-.72)];line([apex,a],'#70dac7',2);line([apex,b],'#70dac7',2);for(let q=.25;q<1;q+=.18)line([[apex[0]+(a[0]-apex[0])*q,apex[1]+(a[1]-apex[1])*q],[apex[0]+(b[0]-apex[0])*q,apex[1]+(b[1]-apex[1])*q]],'#70dac735');if(Math.abs(offset)<.72)roots=[[X(.18+Math.abs(offset)/.72*.70),rayY]];}
    if(family==='sheet'){ctx.fillStyle='#70dac718';ctx.beginPath();for(let i=0;i<=80;i++){const t=i/80,p=[X(.1+.82*t),Y(.52*Math.sin(t*Math.PI))];i?ctx.lineTo(...p):ctx.moveTo(...p);}for(let i=80;i>=0;i--){const t=i/80,p=[X(.1+.82*t),Y(-.52*Math.sin(t*Math.PI))];ctx.lineTo(...p);}ctx.closePath();ctx.fill();for(let q=-.8;q<=.8;q+=.2)poly(t=>q*.58*Math.sin(t*Math.PI),.1,.92,60,'#70dac74a',1);roots=roots.slice(0,2);}
    if(family==='plane'){const px=X(.56);line([[px,Y(.9)],[px,Y(-.9)]],'#70dac7',3);for(let q=-.75;q<=.75;q+=.25)line([[X(.46),Y(q)],[X(.66),Y(q)]],'#70dac744');roots=[[px,rayY]];}
    if(family==='volume'){const left=X(.27),right=X(.82),top=Y(.72),bottom=Y(-.72);ctx.fillStyle='#70dac71f';ctx.fillRect(left,top,right-left,bottom-top);ctx.strokeStyle='#70dac788';ctx.strokeRect(left,top,right-left,bottom-top);for(let q=.35;q<.82;q+=.12)line([[X(q),top],[X(q),bottom]],'#70dac72c');if(Math.abs(offset)<=.72){roots=[[left,rayY],[right,rayY]];support='interval '+((right-left)/(w-76)).toFixed(2);}}
    ctx.restore();
    roots.forEach(p=>glow(...p));
    if(!support)support=roots.length?roots.length+' root'+(roots.length===1?'':'s'):'no transverse root';
    return support;
  }
  function draw(){
    const [w,h]=fit();if(!w||!h)return;
    const v=values(),cfg=families[v.family];
    $('offsetOut').value=v.offset.toFixed(2);$('kernelOut').value=v.kernel.toFixed(2);
    $('kernel').disabled=!['point','beam','arc'].includes(v.family);
    $('dimension').textContent=cfg.dim+'D';$('remaining').textContent=cfg.remaining;$('query').textContent=cfg.query;
    $('familyTitle').textContent=cfg.title;$('familyNote').textContent=cfg.note;$('jacobian').textContent=cfg.jac;
    ctx.clearRect(0,0,w,h);
    const split=Math.max(250,w*.34);
    drawParameter(0,0,split-5,h,cfg,v.view);
    $('roots').textContent=drawWorld(split+5,0,w-split-5,h,v.family,v.offset,v.kernel);
  }
  for(const id of ['family','view','offset','kernel'])$(id).addEventListener('input',schedule);
  $('reset').addEventListener('click',()=>{$('family').value='ring';$('view').value='geometry';$('offset').value=.18;$('kernel').value=.12;schedule();});
  const observer=new ResizeObserver(schedule);observer.observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(pending);pending=0;}else schedule();});
  addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(pending);observer.disconnect();});
  addEventListener('pageshow',()=>{disposed=false;observer.observe(canvas);schedule();});
  $('family').value='ring';schedule();
})();
