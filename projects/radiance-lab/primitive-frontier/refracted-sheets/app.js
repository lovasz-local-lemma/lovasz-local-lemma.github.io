import {generateFamily,joinableRulings,rotateIncident,add,sub,mul,dot,cross,unit} from './optics.js?v=disk-tilt-1';

const $=id=>document.getElementById(id),canvas=$('scene'),ctx=canvas.getContext('2d');
const emission=document.createElement('canvas'),light=emission.getContext('2d');
const state={family:'cone',shape:'sphere',ior:1.5,offset:.42,angle:.2,azimuth:0,tiltLR:0,tiltUD:0,opposing:true,count:193,luminous:true,dispersion:true,surface:true,rays:true};
let yaw=.32,pitch=.26,distance=8.2,frame=0,geometry=[],width=900,height=590,scale=1;
const descriptions={
  cone:{label:'AZIMUTH SHEET',title:'Follow a cone through the glass.',detail:'One polar angle. A complete revolution. A refracted waist.',heading:'The useful part is the symmetry.',text:'For a point source and a centered sphere, fix the polar angle ψ and rotate the ray chain around the source–sphere axis. The entry, both refractions and exit all rotate together. The resulting outgoing ruled surface is the hourglass; its axis-crossing waist is a fold. The existing estimator uses this symmetry instead of tracing a dense fan for each camera connection.',equation:'fix ψ · sweep (φ, r) → surface of revolution'},
  disk:{label:'PHOTON DISK / MERIDIAN',title:'A disk is the complementary chart.',detail:'Keep azimuth. Sweep polar angle and distance. Follow the same glass chain.',heading:'One scatter. Two ways to meet it.',text:'This photon disk is an angular fan swept along its rays, not a disk-shaped area light. Fix azimuth φ and sweep polar angle ψ with exit distance r: the complementary chart to the hourglass. At zero tilt the point source, sphere center and ray fan share a central plane, so the refracted support stays planar even when it folds. The optional opposite half is a second chart at φ + π. Tilting the fan out of that central plane can warp its refracted support.',equation:'disk: fix φ, sweep (ψ, r) · hourglass: fix ψ, sweep (φ, r)'},
  offset:{label:'OFFSET LIGHT SHEET',title:'Move the plane. Break the symmetry.',detail:'Parallel incident rays become a curved, folded ribbon after the sphere.',heading:'A flat input need not have a flat output.',text:'The rays arrive in one offset plane, but a curved interface supplies normals outside that plane. Their outgoing directions no longer share a common plane. Set the offset to zero to recover a central planar sheet; switch to the parallel slab to keep an offset plane flat. This family uses parallel illumination, not the point-source sampling measure of the hourglass or meridian estimator.',equation:'X(u, r) = x_exit(u) + r · ω_exit(u)'}
};
function rebuild(){
  geometry=(state.dispersion?[-.013,0,.017]:[0]).map(delta=>generateFamily({...state,ior:Math.max(1,state.ior+delta)}));
  const central=geometry[state.dispersion?1:0],info=descriptions[state.family];
  $('view-label').textContent=`${info.label} / ${state.shape==='sphere'?'SPHERE':'PARALLEL SLAB'}`;
  const tilted=state.tiltLR!==0||state.tiltUD!==0;
  $('view-title').textContent=central.valid.length===0?'The selected family misses the glass.':state.shape==='slab'?'Parallel interfaces. Shifted ray support.':tilted?'Tilt the input. Recompute the glass.':info.title;
  $('view-detail').textContent=central.valid.length===0?'Reduce the incident tilt or change the fan orientation to recover transmitted paths.':state.shape==='slab'?'Snell refraction changes the internal path; parallel faces restore each outgoing direction.':tilted?'The source and glass stay fixed. The incident family changes before both Snell refractions.':info.detail;
  $('explanation-title').textContent=info.heading;$('explanation').textContent=info.text;$('equation').textContent=info.equation;
  $('valid-value').textContent=`${central.valid.length} / ${state.count}`;
  $('valid-detail').textContent=`Central wavelength · ${state.count-central.valid.length} outside transmitted support`;
  $('metric-label').textContent=state.family==='cone'?'Interface evaluations':'Departure from incident plane';
  $('metric-value').textContent=state.family==='cone'?central.cost:central.deviation.toFixed(3)+' R';
  $('metric-detail').textContent=state.family==='cone'?'Central wavelength · two evaluations per valid ray':`At the finite ray endpoints · ${central.cost} interface evaluations`;
  $('transmission-value').textContent=central.valid.length?(central.meanTransmission*100).toFixed(1)+'%':'—';
  $('angle-control').hidden=state.family!=='cone';$('offset-control').hidden=state.family!=='offset';
  $('disk-control').hidden=state.family!=='disk';
  $('tilt-note').textContent=tilted?'Incident rays are tilted about their source. This numerical ray view does not assume the centered hourglass’s analytic symmetry.':'Tilt changes the incident rays; dragging changes only the camera. Rotating an unmarked sphere itself would have no optical effect.';
  $('download-image').hidden=true;requestDraw();
}
function requestDraw(){
  // Exported pixels belong to a specific camera, display and optical state.
  const image=$('download-image');image.hidden=true;image.removeAttribute('href');
  if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw();});
}
function camera(){
  const eye=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)],right=unit(cross([0,1,0],eye)),up=cross(eye,right),center=[.18,-.02,0],focal=Math.min(width*.92,height*1.8);
  return p=>{const q=sub(p,center),depth=distance-dot(q,eye),k=focal/Math.max(.15,depth);return [width*.49+dot(q,right)*k,height*.46-dot(q,up)*k,depth,k];};
}
function path(context,pts,project){context.beginPath();pts.forEach((p,i)=>{const q=project(p);i?context.lineTo(q[0],q[1]):context.moveTo(q[0],q[1]);});}
function segment(context,a,b,color,lineWidth,project){path(context,[a,b],project);context.strokeStyle=color;context.lineWidth=lineWidth;context.stroke();}
function polygon(context,pts,color,project){path(context,pts,project);context.closePath();context.fillStyle=color;context.fill();}
function circle(context,x,y,r,color){context.beginPath();context.arc(x,y,r,0,2*Math.PI);context.fillStyle=color;context.fill();}
function ring(context,center,r,color,project,axis='x'){
  const pts=Array.from({length:81},(_,i)=>{const a=i/80*2*Math.PI;return add(center,axis==='x'?[0,Math.cos(a)*r,Math.sin(a)*r]:[Math.cos(a)*r,0,Math.sin(a)*r]);});path(context,pts,project);context.strokeStyle=color;context.lineWidth=.7;context.stroke();
}
function environment(project){
  ctx.clearRect(0,0,width,height);const bg=ctx.createLinearGradient(0,0,width,height);bg.addColorStop(0,'#091317');bg.addColorStop(.6,'#050b11');bg.addColorStop(1,'#0e1e23');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
  polygon(ctx,[[-4,-1.35,-3],[4,-1.35,-3],[4,-1.35,3],[-4,-1.35,3]],'#0c1a1e',project);
  for(let i=-7;i<=7;i++){
    segment(ctx,[-4,-1.35,i*.4],[4,-1.35,i*.4],'#28454455',.6,project);
    segment(ctx,[i*.55,-1.35,-3],[i*.55,-1.35,3],'#28454455',.6,project);
  }
  segment(ctx,[-3.6,0,0],[3.7,0,0],'#98bea225',.7,project);
  polygon(ctx,[[3.6,-1.32,-1.8],[3.6,1.8,-1.8],[3.6,1.8,1.8],[3.6,-1.32,1.8]],'#426f6814',project);
  path(ctx,[[3.6,-1.32,-1.8],[3.6,1.8,-1.8],[3.6,1.8,1.8],[3.6,-1.32,1.8]],project);ctx.strokeStyle='#7fafa12c';ctx.lineWidth=.6;ctx.stroke();
  const receiver=project([3.6,-1.48,0]);ctx.fillStyle='#87aaa078';ctx.font='8px ui-monospace, monospace';ctx.textAlign='center';ctx.fillText('FINITE RECEIVER',receiver[0],receiver[1]);
}
function glassBack(project){
  if(state.shape==='slab'){
    for(const x of [-.48,.48])polygon(ctx,[[x,-1.35,-1.35],[x,1.35,-1.35],[x,1.35,1.35],[x,-1.35,1.35]],'#84d7dd13',project);
    return;
  }
  const c=project([0,0,0]),r=c[3];const glass=ctx.createRadialGradient(c[0]-r*.31,c[1]-r*.37,r*.1,c[0],c[1],r);glass.addColorStop(0,'#88b0ad17');glass.addColorStop(.55,'#1125281a');glass.addColorStop(.83,'#21575625');glass.addColorStop(1,'#77c7ba29');circle(ctx,c[0],c[1],r,glass);
}
function glassFront(project){
  if(state.shape==='slab'){
    for(const x of [-.48,.48]){
      path(ctx,[[x,-1.35,-1.35],[x,1.35,-1.35],[x,1.35,1.35],[x,-1.35,1.35],[x,-1.35,-1.35]],project);ctx.strokeStyle='#9be3d576';ctx.lineWidth=1;ctx.stroke();
    }
    for(const y of [-1.35,1.35])for(const z of [-1.35,1.35])segment(ctx,[-.48,y,z],[.48,y,z],'#7cadac44',.8,project);
    return;
  }
  const c=project([0,0,0]),r=c[3];ctx.beginPath();ctx.arc(c[0],c[1],r,0,Math.PI*2);ctx.lineWidth=1.15;ctx.strokeStyle='#95ecdc80';ctx.stroke();
  ctx.beginPath();ctx.arc(c[0],c[1],r*.984,3.7,4.7);ctx.lineWidth=2;ctx.strokeStyle='#dcf8dc9c';ctx.stroke();
  ctx.beginPath();ctx.ellipse(c[0]-r*.28,c[1]-r*.58,r*.23,r*.048,-.48,0,Math.PI*2);ctx.fillStyle='#e5fff24e';ctx.fill();
  if(!state.luminous){ring(ctx,[0,0,0],1,'#719d8870',project,'x');ring(ctx,[0,0,0],1,'#719d8845',project,'y');}
}
function sheet(project){
  light.clearRect(0,0,width,height);light.globalCompositeOperation='lighter';light.lineJoin='round';light.lineCap='round';
  const colors=state.dispersion?[[255,161,86],[149,240,195],[115,153,255]]:[[230,217,157]];
  geometry.forEach((family,channel)=>{
    const rgb=colors[channel].join(','),factor=193/state.count;
    if(state.surface){
      for(let i=1;i<family.rays.length;i++){
        const a=family.rays[i-1],b=family.rays[i];if(!a.end||!b.end)continue;
        polygon(light,[a.o,b.o,b.entry,a.entry],`rgba(${rgb},${state.luminous?.038:.024})`,project);
        polygon(light,[a.entry,b.entry,b.exit,a.exit],`rgba(${rgb},${state.luminous?.065:.035})`,project);
        // Different support faces are separate strips. Connecting them would
        // draw a curtain across the clipping boundary rather than a ruling sheet.
        if(!joinableRulings(a,b))continue;
        const steps=18;
        for(let k=0;k<steps;k++){
          const t0=k/steps,t1=(k+1)/steps;
          const aa=add(a.supportStart,mul(sub(a.end,a.supportStart),t0)),ab=add(a.supportStart,mul(sub(a.end,a.supportStart),t1));
          const ba=add(b.supportStart,mul(sub(b.end,b.supportStart),t0)),bb=add(b.supportStart,mul(sub(b.end,b.supportStart),t1));
          polygon(light,[aa,ba,bb,ab],`rgba(${rgb},${(state.luminous?.065:.018)*Math.exp(-t0*.7)})`,project);
        }
      }
    }
    if(state.luminous){
      for(const r of family.valid){
        const alpha=Math.min(.23,.075*factor*r.transmission);path(light,[r.o,r.entry,r.exit,r.end],project);light.strokeStyle=`rgba(${rgb},${alpha})`;light.lineWidth=.65;light.stroke();
      }
    }
    let previous=null;
    for(const r of family.rays){
      if(r.reachesReceiver&&previous?.reachesReceiver&&Math.hypot(...sub(r.end,previous.end))<.5)segment(light,previous.end,r.end,`rgba(${rgb},.5)`,state.luminous?2.2:1.2,project);
      previous=r;
    }
  });
  light.globalCompositeOperation='source-over';
  ctx.save();ctx.globalCompositeOperation='lighter';
  if(state.luminous){ctx.filter='blur(8px)';ctx.globalAlpha=.6;ctx.drawImage(emission,0,0,width,height);ctx.filter='blur(2px)';ctx.globalAlpha=.35;ctx.drawImage(emission,0,0,width,height);ctx.filter='none';}
  ctx.globalAlpha=.85;ctx.drawImage(emission,0,0,width,height);ctx.restore();
  if(state.rays){
    const middle=geometry[state.dispersion?1:0];const stride=Math.max(1,Math.round(state.count/13));
    middle.rays.forEach((r,i)=>{if(i%stride)return;if(!r.end){ctx.save();ctx.setLineDash([3,5]);segment(ctx,r.o,r.entry||add(r.o,mul(r.d,5)),'#b8aaa533',.7,project);ctx.restore();return;}path(ctx,[r.o,r.entry,r.exit,r.end],project);ctx.strokeStyle=state.luminous?'#f7edb653':'#efda9ad4';ctx.lineWidth=state.luminous?.7:1.1;ctx.stroke();if(!state.luminous){for(const p of [r.entry,r.exit]){const q=project(p);circle(ctx,q[0],q[1],2,'#fbeab6');}}});
  }
  if(state.family!=='offset'){
    const p=project([-3.4,0,0]),g=ctx.createRadialGradient(p[0],p[1],0,p[0],p[1],25);g.addColorStop(0,'#ffeaca88');g.addColorStop(.1,'#ffe2a568');g.addColorStop(1,'#f5d09000');circle(ctx,p[0],p[1],25,g);circle(ctx,p[0],p[1],2.5,'#fff2cc');
  }else{const anchor=[-3.4,0,state.offset];segment(ctx,add(anchor,rotateIncident([0,-1.14,0],state.tiltLR,state.tiltUD)),add(anchor,rotateIncident([0,1.14,0],state.tiltLR,state.tiltUD)),'#e7e3b594',2,project);}
}
function draw(){
  const box=canvas.getBoundingClientRect();width=Math.max(1,box.width);height=Math.max(1,box.height);scale=Math.min(window.devicePixelRatio||1,1.6);
  const w=Math.round(width*scale),h=Math.round(height*scale);
  if(canvas.width!==w||canvas.height!==h){canvas.width=emission.width=w;canvas.height=emission.height=h;}
  ctx.setTransform(scale,0,0,scale,0,0);light.setTransform(scale,0,0,scale,0,0);
  const project=camera();environment(project);glassBack(project);sheet(project);glassFront(project);
  canvas.dataset.rendered=`${state.family}-${state.shape}-${state.ior}-${state.offset}-${state.count}-${state.tiltLR}-${state.tiltUD}-${state.azimuth}-${state.opposing}`;
}
document.querySelectorAll('[data-family]').forEach(button=>button.addEventListener('click',()=>{
  state.family=button.dataset.family;document.querySelectorAll('[data-family]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));rebuild();
}));
$('glass').addEventListener('change',event=>{state.shape=event.target.value;rebuild();});
for(const id of ['ior','angle','offset','density','azimuth','tiltLR','tiltUD'])$(id).addEventListener('input',event=>{
  const n=+event.target.value;state[id==='density'?'count':id]=n;
  $(id+'-value').textContent=id==='ior'?n.toFixed(2):id==='angle'?(n*180/Math.PI).toFixed(1)+'°':id==='offset'?n.toFixed(2)+' R':['azimuth','tiltLR','tiltUD'].includes(id)?n+'°':String(n);rebuild();
});
for(const id of ['dispersion','surface','rays','opposing'])$(id).addEventListener('change',event=>{state[id]=event.target.checked;rebuild();});
$('reset-tilt').addEventListener('click',()=>{for(const id of ['tiltLR','tiltUD']){state[id]=0;$(id).value='0';$(id+'-value').textContent='0°';}rebuild();});
for(const mode of ['luminous','schematic'])$(mode).addEventListener('click',()=>{state.luminous=mode==='luminous';$('luminous').setAttribute('aria-pressed',String(state.luminous));$('schematic').setAttribute('aria-pressed',String(!state.luminous));requestDraw();});
$('reset-view').addEventListener('click',()=>{yaw=.32;pitch=.26;distance=8.2;requestDraw();});
let drag=null;
canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw-=(e.clientX-drag[0])*.007;pitch=Math.max(-1.2,Math.min(1.2,pitch+(e.clientY-drag[1])*.007));drag=[e.clientX,e.clientY];requestDraw();});
canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(5.8,Math.min(12,distance*Math.exp(e.deltaY*.001)));requestDraw();},{passive:false});
$('prepare-image').addEventListener('click',()=>{draw();const link=$('download-image');link.href=canvas.toDataURL('image/png');link.download=`glass-sheet-${state.family}-${state.shape}.png`;link.hidden=false;});
new ResizeObserver(requestDraw).observe(canvas);rebuild();
