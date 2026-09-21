/* Exact ray/sphere Snell geometry, not a film estimator. Off-axis followers are
   traced individually: rotating one already-traced chain would be incorrect. */
(() => {
  'use strict';
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),add=(a,b)=>a.map((x,i)=>x+b[i]);
  const mul=(a,s)=>a.map(x=>x*s),sub=(a,b)=>add(a,mul(b,-1));
  const unit=a=>mul(a,1/Math.hypot(...a)),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function refract(d,n,eta){const c=clamp(-dot(d,n),0,1),k=1-eta*eta*(1-c*c);return k<0?null:unit(add(mul(d,eta),mul(n,eta*c-Math.sqrt(k))));}
  function fresnel(c,n1,n2){const s=(n1/n2)**2*(1-c*c);if(s>=1)return 1;const t=Math.sqrt(1-s);return ((n1*c-n2*t)**2/(n1*c+n2*t)**2+(n1*t-n2*c)**2/(n1*t+n2*c)**2)/2;}
  function sphereStep(origin,direction,center,radius,ior){
    const q=sub(origin,center),b=dot(q,direction),disc=b*b-dot(q,q)+radius*radius;
    if(disc<0)return null;const near=-b-Math.sqrt(disc);if(near<1e-7)return null;
    const entry=add(origin,mul(direction,near)),ni=unit(sub(entry,center)),ci=clamp(-dot(direction,ni),0,1);
    const internal=refract(direction,ni,1/ior);if(!internal)return null;
    const chord=-2*dot(sub(entry,center),internal),exit=add(entry,mul(internal,chord));
    const no=mul(unit(sub(exit,center)),-1),co=clamp(-dot(internal,no),0,1),outgoing=refract(internal,no,ior);
    if(!outgoing)return null;
    return {origin,direction,entry,internal,exit,outgoing,chord,incidence:Math.acos(ci),transmission:(1-fresnel(ci,1,ior))*(1-fresnel(co,ior,1))};
  }
  function scene(chain,offaxis){const balls=[{c:[0,0,0],r:1}];if(chain||offaxis)balls.push({c:[2.7,offaxis?.62:0,0],r:.86});if(chain)balls.push({c:[5.05,offaxis?1.2:0,0],r:.78});return balls;}
  function traceChain(distance,ior,fraction,azimuth,balls){
    const p=Math.asin(1/distance)*fraction,origin=[-distance,0,0],incoming=[Math.cos(p),Math.sin(p)*Math.cos(azimuth),Math.sin(p)*Math.sin(azimuth)];
    let o=origin,d=incoming,T=1;const steps=[];
    for(const ball of balls){const s=sphereStep(o,d,ball.c,ball.r,ior);if(!s)break;steps.push(s);T*=s.transmission;o=s.exit;d=s.outgoing;}
    return {origin,incoming,steps,exit:o,outgoing:d,transmission:T,complete:steps.length===balls.length};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={refract,fresnel,sphereStep,traceChain,scene};
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id),canvas=$('stage'),ctx=canvas.getContext('2d');if(!ctx)return;
  let pending=0,disposed=false;
  const schedule=()=>{if(!pending&&!disposed&&!document.hidden)pending=requestAnimationFrame(()=>{pending=0;draw();});};
  function draw(){
    const box=canvas.getBoundingClientRect(),w=box.width,h=box.height;if(!w||!h)return;
    const dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const distance=+$('source').value,ior=+$('ior').value,fraction=+$('polar').value/100,reach=+$('reach').value;
    const chain=$('chain').getAttribute('aria-pressed')==='true',offaxis=$('off-axis').getAttribute('aria-pressed')==='true',meridian=$('view').value==='meridian';
    const yaw=meridian?0:+$('orbit').value*Math.PI/180,balls=scene(chain,offaxis);
    for(const [id,v] of Object.entries({'ior-out':ior.toFixed(2),'source-out':distance.toFixed(2)+' R','polar-out':Math.round(fraction*100)+'%','reach-out':reach.toFixed(1)+' R','orbit-out':$('orbit').value+'°'}))$(id).value=v;
    $('orbit').disabled=meridian;
    const rays=Array.from({length:97},(_,k)=>traceChain(distance,ior,fraction,k/96*Math.PI*2,balls)),selected=rays[0];
    $('entry-angle').textContent=(selected.steps[0].incidence*180/Math.PI).toFixed(1)+'°';
    $('deviation').textContent=selected.steps.length*2+' / '+balls.length*2;
    $('transmission').textContent=(selected.transmission*100).toFixed(1)+'%';
    $('construction-note').textContent=offaxis?'Off-axis follower: each azimuth has a different Snell chain. The native query scans and refines roots on this ruled surface, then evaluates its changing Jacobian. Some azimuths miss a follower entirely.':'Shared axis: all sphere centers lie on the point-source axis. A complete chain rotates rigidly, so its outgoing sheet retains the inexpensive quadratic crossing.';
    $('support-note').textContent=balls.length===1?'Two surface transmissions precede one medium-scattering query. Wire density is geometric, not brightness.':`${rays.slice(0,96).filter(r=>r.complete).length}/96 sampled azimuths traverse all ${balls.length} spheres. “Chain” means repeated specular transmissions; it does not add random medium bounces.`;
    const rotated=p=>[Math.cos(yaw)*p[0]+Math.sin(yaw)*p[2],meridian?p[1]:p[1]*.966-(-Math.sin(yaw)*p[0]+Math.cos(yaw)*p[2])*.259];
    const bounds=[];rays.forEach(r=>{r.steps.forEach(s=>bounds.push(rotated(s.entry),rotated(s.exit)));bounds.push(rotated(r.origin),rotated(add(r.exit,mul(r.outgoing,reach))));});balls.forEach(b=>{for(let i=0;i<24;i++){let a=i*Math.PI/12;bounds.push(rotated(add(b.c,[Math.cos(a)*b.r,Math.sin(a)*b.r,0])));}});
    let x0=Math.min(...bounds.map(p=>p[0])),x1=Math.max(...bounds.map(p=>p[0])),y0=Math.min(-1.2,...bounds.map(p=>p[1])),y1=Math.max(1.2,...bounds.map(p=>p[1]));
    const s=Math.min((w-65)/(x1-x0+.4),(h-75)/(y1-y0+.3));
    const project=p=>{const q=rotated(p);return [w/2+(q[0]-(x0+x1)/2)*s,h/2-(q[1]-(y0+y1)/2)*s];};
    const line=(pts,color,width=1)=>{ctx.beginPath();pts.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(...q):ctx.moveTo(...q);});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
    ctx.strokeStyle='#7e8da014';for(let x=0;x<w;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    line([[-distance,0,0],[balls.at(-1).c[0]+reach+1,0,0]],'#c6b9e740');
    balls.forEach((b,i)=>{const c=project(b.c),r=b.r*s,g=ctx.createRadialGradient(c[0]-r*.3,c[1]-r*.4,1,...c,r);g.addColorStop(0,'#bcaafa33');g.addColorStop(.84,'#839ac60c');g.addColorStop(1,'#afc9ef45');ctx.beginPath();ctx.arc(...c,r,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();ctx.strokeStyle='#aabbdf88';ctx.lineWidth=1.2;ctx.stroke();ctx.fillStyle='#a6b2c6';ctx.font='11px system-ui';ctx.fillText('Sphere '+(i+1),c[0]-24,c[1]-r-7);});
    function drawRay(r,alpha,highlight=false){r.steps.forEach((step,i)=>{line([step.origin,step.entry],i?'#83e0cc'+alpha:'#ecc774'+alpha,highlight?2:.8);line([step.entry,step.exit],'#bb9cf4'+alpha,highlight?2.2:.9);});if(r.steps.length)line([r.exit,add(r.exit,mul(r.outgoing,reach))],r.complete?'#8aebd1'+alpha:'#edba72'+alpha,highlight?2:.8);}
    if(meridian){for(let k=-23;k<=23;k++){const r=traceChain(distance,ior,k/24*.94,0,balls);drawRay(r,'42');}drawRay(selected,'ff',true);}
    else {
      // Join valid neighbours on each physical segment; never bridge a missed follower.
      for(let segment=0;segment<balls.length;segment++)for(let ring=0;ring<=13;ring++){
        let prev=null;for(const r of rays){const step=r.steps[segment];if(!step){prev=null;continue;}const end=r.steps[segment+1]?.entry||add(step.exit,mul(step.outgoing,reach));const p=add(step.exit,mul(sub(end,step.exit),ring/13));if(prev)line([prev,p],segment===balls.length-1?'#76e0c643':'#7cd7d22b',.8);prev=p;}
      }
      rays.filter((_,i)=>i%3===0).forEach(r=>drawRay(r,'64'));drawRay(selected,'ff',true);
    }
    const source=project(selected.origin);ctx.save();ctx.shadowColor='#ffe0a0';ctx.shadowBlur=20;ctx.fillStyle='#ffe0a0';ctx.beginPath();ctx.arc(...source,4,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.fillStyle='#c3cfdf';ctx.font='12px system-ui';ctx.fillText(offaxis?'Broken rotational symmetry · traced azimuth family':balls.length>1?'Repeated refraction · one common revolution axis':'One polar seed · rotate its complete Snell path',16,23);
    ctx.fillStyle='#98aabe';ctx.font='11px system-ui';ctx.fillText('R = first sphere radius · no radiance accumulation',16,h-14);
  }
  for(const id of ['ior','source','polar','reach','orbit','view'])$(id).addEventListener('input',schedule);
  for(const id of ['chain','off-axis'])$(id).addEventListener('click',()=>{$(id).setAttribute('aria-pressed',String($(id).getAttribute('aria-pressed')!=='true'));schedule();});
  $('straight').addEventListener('click',()=>{$('ior').value=1;schedule();});
  $('reset').addEventListener('click',()=>{for(const [id,v] of Object.entries({ior:1.5,source:3.2,polar:65,reach:4,orbit:24,view:'revolve'}))$(id).value=v;for(const id of ['chain','off-axis'])$(id).setAttribute('aria-pressed','false');schedule();});
  const observer=new ResizeObserver(schedule);observer.observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(pending);pending=0;}else schedule();});
  addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(pending);pending=0;observer.disconnect();});
  addEventListener('pageshow',()=>{disposed=false;observer.observe(canvas);schedule();});schedule();
})();
