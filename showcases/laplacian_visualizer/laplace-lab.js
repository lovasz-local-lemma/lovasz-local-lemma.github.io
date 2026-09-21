import {cameraPoint,containsPoint,nearestRibbon,clamp} from './laplace-camera.js?v=a8be8bb9b201';
import {createMemoryVolume} from './laplace-volume.js?v=a8be8bb9b201';
import {bilateralFamilies,kernelFamilies,kernelValue,kernelTransform,cases,signal,transform,history,inverse,poles} from './laplace-model.js?v=a8be8bb9b201';
import {renderSystem,renderROC,rocCoordinates} from './laplace-perspectives.js?v=a8be8bb9b201';
document.querySelectorAll('.laplace-lab[data-initial-mode]').forEach(initializeInstrument);
function initializeInstrument(host){
const $=s=>host.querySelector(s.startsWith('#')?`[data-role="${s.slice(1)}"]`:s), state={key:'oscillator',sigma:.15,omega:2.4,T:18,band:16,mode:host.dataset.initialMode,family:'exponential',kernel:'exponential',complexView:'both',beta:2,yaw:-.55,pitch:.55,camera:'free',density:36,fourier:0,echoTime:1.33,quality:512,thickness:.05,rate:.7,inspect:3.2,pole:-.5,side:'causal'};
for(const [name,items] of [['key',cases],['kernel',kernelFamilies]]){
 const select=$(`[name=${name}]`);select.replaceChildren(...Object.entries(items).map(([key,item])=>{const option=document.createElement('option');option.value=key;option.textContent=item.title;return option;}));
}
const mint='#99e9cd',gold='#edce91',violet='#b9a5ff';let pending=0,visible=false;
function suspend(){cancelAnimationFrame(pending);pending=0;}
function invalidate(){if(!pending&&visible&&!document.hidden)pending=requestAnimationFrame(()=>{pending=0;if(visible&&!document.hidden)render();});}
new IntersectionObserver(es=>{visible=es[0].isIntersecting;if(visible)invalidate();else suspend();},{rootMargin:'150px'}).observe(host);
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else invalidate();});
new ResizeObserver(invalidate).observe(host);
let slicePolygon=[],sliceAxis=[1,0],echoRibbons=[];
host.addEventListener('input',e=>{if(e.target.name in state){state[e.target.name]=['key','side','camera','family','kernel','complexView'].includes(e.target.name)?e.target.value:Number(e.target.value);if(e.target.name==='camera')state.pitch=.55;invalidate();}});
host.addEventListener('click',e=>{
  const mode=e.target.closest('[data-laplace-mode]');
  if(mode)state.mode=mode.dataset.laplaceMode;
  if(e.target.closest('[data-fourier-section]')){state.mode='spectrum';state.sigma=0;$('[name=sigma]').value=0;}
  invalidate();
});
const volume=$('#laplace-volume'),drawVolume=createMemoryVolume(volume),surface=$('#laplace-surface');
volume.addEventListener('webglcontextrestored',invalidate);
let drag=null;
function localPoint(canvas,e){const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
function moveROC(e){const r=surface.getBoundingClientRect();Object.assign(state,rocCoordinates(e.clientX-r.left,e.clientY-r.top,r.width,r.height));for(const name of ['sigma','omega'])$(`[name=${name}]`).value=state[name];invalidate();}
function inspectRibbon(e){if(state.mode!=='system'||!state.fourier)return;const tau=nearestRibbon(echoRibbons,...localPoint(surface,e));if(tau!==null&&tau!==state.echoTime){state.echoTime=tau;$('[name=echoTime]').value=tau;invalidate();}}
for(const canvas of [surface,volume]){
  canvas.addEventListener('pointerdown',e=>{const point=localPoint(canvas,e);drag={x:e.clientX,y:e.clientY,sigma:state.sigma,yaw:state.yaw,pitch:state.pitch,slice:state.mode==='spectrum'&&containsPoint(slicePolygon,...point)};canvas.setPointerCapture(e.pointerId);if(state.mode==='roc')moveROC(e);else inspectRibbon(e);});
  canvas.addEventListener('pointermove',e=>{
    if(!drag){if(canvas===surface)inspectRibbon(e);return;}
    if(state.mode==='roc'){moveROC(e);return;}
    if(drag.slice){const [dx,dy]=sliceAxis;state.sigma=clamp(drag.sigma+((e.clientX-drag.x)*dx+(e.clientY-drag.y)*dy)/Math.max(25,dx*dx+dy*dy),-1.5,2);$('[name=sigma]').value=state.sigma;}
    else{state.yaw=drag.yaw-(e.clientX-drag.x)*.005;if(state.camera==='free')state.pitch=clamp(drag.pitch+(e.clientY-drag.y)*.005,-1.35,1.35);}
    invalidate();
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>drag=null);
  canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(state.mode==='spectrum'&&['ArrowLeft','ArrowRight'].includes(e.key)){state.sigma=clamp(state.sigma+(e.key==='ArrowRight'?.05:-.05),-1.5,2);$('[name=sigma]').value=state.sigma;}else if(['ArrowLeft','ArrowRight'].includes(e.key))state.yaw+=e.key==='ArrowRight'?-.1:.1;else if(state.camera==='free')state.pitch=clamp(state.pitch+(e.key==='ArrowDown'?.1:-.1),-1.35,1.35);invalidate();});
}
const probe=$('#s-probe');let probing=false;
function moveProbe(e){const r=probe.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;state.sigma=clamp(-1.5+3.5*(x-30)/(r.width-45),-1.5,2);state.omega=clamp(5-10*(y-18)/(r.height-44),-5,5);invalidate();}
probe.addEventListener('pointerdown',e=>{probing=true;probe.setPointerCapture(e.pointerId);moveProbe(e);});probe.addEventListener('pointermove',e=>{if(probing)moveProbe(e);});for(const event of ['pointerup','pointercancel'])probe.addEventListener(event,()=>probing=false);
probe.addEventListener('keydown',e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();if(e.key==='ArrowLeft'||e.key==='ArrowRight')state.sigma=clamp(state.sigma+(e.key==='ArrowRight'?.05:-.05),-1.5,2);else state.omega=clamp(state.omega+(e.key==='ArrowUp'?.1:-.1),-5,5);invalidate();});
function renderProbe(){const {x,w,h}=setup('#s-probe'),px=v=>30+(v+1.5)/3.5*(w-45),py=v=>18+(5-v)/10*(h-44),edge=px(-cases[state.key].a);x.fillStyle='#99e9cd18';x.fillRect(edge,18,w-15-edge,h-44);line(x,[[px(0),18],[px(0),h-26]],gold+'88');line(x,[[30,py(0)],[w-15,py(0)]],mint+'55');for(const [s,o] of poles(state.key)){const a=px(s),b=py(o);line(x,[[a-3,b-3],[a+3,b+3]],'#ffbaa7');line(x,[[a+3,b-3],[a-3,b+3]],'#ffbaa7');}x.beginPath();x.arc(px(state.sigma),py(state.omega),5,0,Math.PI*2);x.fillStyle=gold;x.fill();text(x,'ω',5,25,violet,11);text(x,'σ →',w-42,h-7,gold,11);text(x,`s = ${state.sigma.toFixed(2)} ${state.omega<0?'−':'+'} ${Math.abs(state.omega).toFixed(2)}i`,30,h-7,gold,11);}
function renderFunctionBanner(){
 let time,formula,label='F(s)';
 if(state.mode==='roc'){const family=bilateralFamilies[state.family];time=`${state.side==='causal'?'':'−'}${family.time} ${state.side==='causal'?'u(t)':'u(−t)'}`;formula=family.formula;}
 else if(state.mode==='volume'){time=kernelFamilies[state.kernel].formula+' u(t)';formula=kernelFamilies[state.kernel].laplace;label='H(s)';}
 else{time=cases[state.key].formula;formula=cases[state.key].laplace;}
 $('#selected-time').textContent=(state.mode==='volume'?'h(t)':'f(t)')+' = '+time;$('#selected-transform').textContent=label+' = '+formula;
}
function setup(id){const c=$(id),r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,1.6);c.width=Math.max(10,Math.round(r.width*d));c.height=Math.max(10,Math.round(r.height*d));const x=c.getContext('2d');x.scale(d,d);return {x,w:r.width,h:r.height};}
function text(x,str,px,py,color='#a3bdc8',size=12){x.fillStyle=color;x.font=`${size}px system-ui`;x.fillText(str,px,py);}
function line(x,pts,color,width=1.5){x.beginPath();pts.forEach((p,i)=>i?x.lineTo(...p):x.moveTo(...p));x.strokeStyle=color;x.lineWidth=width;x.stroke();}
function plot(id,series,xrange,yrange,xlabel){const{x,w,h}=setup(id),m={l:48,r:20,t:30,b:38};const px=t=>m.l+(t-xrange[0])/(xrange[1]-xrange[0])*(w-m.l-m.r),py=y=>h-m.b-(y-yrange[0])/(yrange[1]-yrange[0])*(h-m.t-m.b);
  for(let i=0;i<=4;i++){const yy=yrange[0]+i*(yrange[1]-yrange[0])/4;line(x,[[m.l,py(yy)],[w-m.r,py(yy)]],'#a7ccd518',1);text(x,Math.abs(yy)>99?yy.toExponential(0):yy.toFixed(1),5,py(yy)+4,'#859fa8',10);}
  line(x,[[m.l,m.t],[m.l,h-m.b],[w-m.r,h-m.b]],'#8ba5aa77');
  x.save();x.beginPath();x.rect(m.l,m.t,w-m.l-m.r,h-m.t-m.b);x.clip();series.forEach(s=>line(x,s.values.map(([a,b])=>[px(a),py(b)]),s.color,s.width||1.7));x.restore();
  text(x,xlabel,m.l,h-12);text(x,String(xrange[1]),w-35,h-12);
  return {x,px,py,w,h};
}
function mesh(){const{x,w,h}=setup('#laplace-surface'),n=38,cols=48,points=[],quads=[];
  const project=(s,o,z)=>cameraPoint((s-.25)*.29,o*.084,z*.23,state,w,h,.58);
  const height=(s,o)=>Math.min(3.7,Math.log1p(Math.hypot(...transform(state.key,s,o))));
  for(let j=0;j<=n;j++){const row=[];for(let i=0;i<=cols;i++){const s=-1.5+3.5*i/cols,o=-5+10*j/n,[r,im]=transform(state.key,s,o);row.push({s,o,z:height(s,o),phase:Math.atan2(im,r)});}points.push(row);}
  for(let j=0;j<n;j++)for(let i=0;i<cols;i++){const p=[points[j][i],points[j][i+1],points[j+1][i+1],points[j+1][i]];quads.push({p,depth:p.reduce((a,v)=>a+Math.sin(state.yaw)*(v.s-.25)*.83+Math.cos(state.yaw)*v.o*.24,0)});}
  quads.sort((a,b)=>a.depth-b.depth).forEach(({p})=>{const inROC=p[0].s>-cases[state.key].a;x.beginPath();p.forEach((q,i)=>i?x.lineTo(...project(q.s,q.o,q.z)):x.moveTo(...project(q.s,q.o,q.z)));x.closePath();x.fillStyle=`hsla(${190+p[0].phase*45},${inROC?56:12}%,${inROC?34+p[0].z*5:19}%,.87)`;x.fill();x.strokeStyle=inROC?'#a8ddd530':'#dba48318';x.lineWidth=.5;x.stroke();});
  if(state.mode==='spectrum'){
    const plane=[project(state.sigma,-5,0),project(state.sigma,5,0),project(state.sigma,5,3.7),project(state.sigma,-5,3.7)];
    slicePolygon=plane;const origin=project(0,0,0),shift=project(1,0,0);sliceAxis=[shift[0]-origin[0],shift[1]-origin[1]];
    x.beginPath();plane.forEach((p,i)=>i?x.lineTo(...p):x.moveTo(...p));x.closePath();x.fillStyle='#edce911b';x.fill();x.strokeStyle='#edce9166';x.stroke();
    const zero=[];for(let i=0;i<=120;i++){const o=-5+10*i/120;zero.push(project(0,o,height(0,o)));}x.setLineDash([5,5]);line(x,zero,mint,1.5);x.setLineDash([]);
  }
  const cut=[];for(let i=0;i<=150;i++){const o=-5+10*i/150;cut.push(project(state.sigma,o,height(state.sigma,o)));}line(x,cut,gold,2);
  const pp=project(state.sigma,state.omega,height(state.sigma,state.omega));line(x,[project(state.sigma,state.omega,0),pp],violet,2);text(x,`ω = ${state.omega.toFixed(2)}`,pp[0]+10,pp[1]-12,violet,12);x.beginPath();x.arc(...pp,5,0,Math.PI*2);x.fillStyle='#fff5d2';x.shadowColor=gold;x.shadowBlur=15;x.fill();x.shadowBlur=0;
  poles(state.key).forEach(([s,o])=>{const p=project(s,o,3.8);line(x,[[p[0]-4,p[1]-4],[p[0]+4,p[1]+4]],'#ffbaa7',2);line(x,[[p[0]+4,p[1]-4],[p[0]-4,p[1]+4]],'#ffbaa7',2);});
  text(x,'HEIGHT  log(1 + |F|)    COLOR  phase',18,25,mint,11);text(x,state.mode==='spectrum'?'Drag gold plane to slice · elsewhere to orbit':'Drag to orbit · gold = your vertical σ section',18,h-15,'#d8c59d',11);
  text(x,'σ',...project(2.15,5,0),gold,15);text(x,'ω',...project(-1.5,5.8,0),violet,15);
}
function syncControls(){host.dataset.mode=state.mode;host.querySelectorAll('[data-laplace-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.laplaceMode===state.mode)));host.querySelectorAll('output[data-value]').forEach(o=>o.textContent=Number(state[o.dataset.value]).toFixed(['T','band','density'].includes(o.dataset.value)?0:2));
  const studies=['weight','spectrum','inverse'].includes(state.mode);$('.lab-steps').hidden=!studies;host.querySelectorAll('[data-instrument]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.instrument===(studies?'studies':state.mode))));
  host.querySelectorAll('[data-modes]').forEach(el=>el.hidden=!el.dataset.modes.split(' ').includes(state.mode));
  $('#beta-control').hidden=state.mode!=='roc'||!['cosine','sine','timecosine'].includes(state.family);
  host.querySelectorAll('input[name],select[name]').forEach(el=>{if(el.name in state)el.value=state[el.name];});
  $('#echo-time-control').hidden=state.mode!=='system'||!state.fourier;
  $('#laplace-metrics').hidden=!['system','roc'].includes(state.mode);
  surface.hidden=state.mode==='volume';volume.hidden=state.mode!=='volume';
}
function render(){syncControls();
  $('#omega-label').textContent=['weight','volume'].includes(state.mode)?'Rotation frequency ω':'Inspect frequency ω';
  const sample=transform(state.key,state.sigma,state.omega);
  $('#control-feedback').textContent=['system','volume'].includes(state.mode)?`λ = ${state.rate.toFixed(2)}: ${state.mode==='volume'?'the decay envelope':'memory'} falls to 37% after ${(1/state.rate).toFixed(2)} seconds. ω = ${state.omega.toFixed(2)} rad/s${state.mode==='system'?' selects the complex response below; it does not change the input signal.':' changes the winding; negative values reverse its handedness.'}`:state.mode==='spectrum'?`Inspecting ω = ${state.omega.toFixed(2)} rad/s: |F(s)| = ${Math.hypot(...sample).toFixed(3)}, phase = ${Math.atan2(sample[1],sample[0]).toFixed(3)} rad. The violet cursor and horizon plot follow ω; the full spectrum stays fixed.`:state.mode==='roc'?`Family: ${state.family}. Switching time support preserves its formula and poles; changing the family changes the formula. Select σ and ω on the plane.`:state.mode==='inverse'?'Reconstruction integrates over every frequency in the selected band. Change σ and Ω to inspect its accuracy.':'Change ω to inspect another complex frequency; σ controls exponential weighting.';
  renderFunctionBanner();
  if(['weight','spectrum','system'].includes(state.mode))renderProbe();
  if(state.mode==='volume'){
    const ok=drawVolume(state);
    $('#laplace-formula').textContent='q(t) = (h(t) cos ωt, −h(t) sin ωt, t), 0 ≤ t ≤ 8';
    $('#laplace-surface-cap').innerHTML='<strong>Time lifts a winding into a sculpture.</strong>Horizontal coordinates are the real and imaginary parts of the selected h(t)e⁻ⁱωᵗ; a negative h(t) reverses the horizontal direction. Height is time (bottom 0, top 8 s). Gold is early, mint is late. Drag to orbit, or use arrow keys. Thickness and glow are display choices, not a physical medium.';
    const values=[],path=[];let re=0,im=0,previous=[kernelValue(state.kernel,state.rate,0),0];for(let i=0;i<=600;i++){const t=i*8/600,r=kernelValue(state.kernel,state.rate,t),current=[r*Math.cos(state.omega*t),-r*Math.sin(state.omega*t)];values.push([t,r]);if(i){re+=(previous[0]+current[0])*4/600;im+=(previous[1]+current[1])*4/600;}previous=current;path.push([re,im]);}
    plot('#laplace-a',[{values,color:gold}],[0,8],[-1.05,1.05],'Memory age t (seconds)');
    const limit=kernelTransform(state.kernel,state.rate,0,state.omega),ex=Math.max(.3,...path.flat().map(Math.abs),...limit.map(Math.abs)),acc=plot('#laplace-b',[{values:path,color:violet}],[-ex,ex],[-ex,ex],'Accumulated real part');acc.x.beginPath();acc.x.arc(acc.px(limit[0]),acc.py(limit[1]),4,0,Math.PI*2);acc.x.fillStyle=gold;acc.x.fill();
    $('#laplace-cap-a').innerHTML='<strong>The selected kernel sets the winding.</strong>Positive and negative lobes wind on opposite sides. λ changes the decay envelope. The plotted amplitude has fixed axes.';$('#laplace-cap-b').innerHTML=`<strong>Sum the winding to recover H(iω).</strong>The violet path integrates the selected kernel over eight seconds; the gold dot is its infinite-time limit. Finite-window error: ${Math.hypot(re-limit[0],im-limit[1]).toExponential(2)}. The infinite transform is H(s) = ${kernelFamilies[state.kernel].laplace}.`;
    $('#laplace-status').dataset.warning=String(!ok);$('#laplace-status').textContent=ok?'WebGL2 · fixed-step volume ray marching of an analytic winding. Like the higher-dimensional field experiments, this samples a scalar field along each viewing ray. Here the field surrounds an explicit signal curve: the 3D shape and both plots share λ and ω. No mesh or pre-rendered frames; the ray marcher runs only when a control or camera changes.':'WebGL2 is unavailable. The linked kernel and complex-sum plots remain usable.';return;
  }
  if(state.mode==='system'){const current=[],reference=[];for(let i=0;i<=160;i++){const t=i/20;current.push([t,Math.exp(-state.rate*t)]);reference.push([t,Math.exp(-.7*t)]);}plot('#memory-kernel',[{values:reference,color:mint},{values:current,color:gold,width:3}],[0,8],[0,1.05],'Memory age t (seconds)');}
  if(state.mode==='system'||state.mode==='roc'){
    const result=(state.mode==='system'?renderSystem:renderROC)({$,setup,text,line,plot},state);
    echoRibbons=result.ribbons||[];
    $('#laplace-status').dataset.warning=String(result.warning);$('#laplace-status').textContent=result.message;
    surface.setAttribute('aria-label',state.mode==='system'?'Delayed impulse response ribbons, drag to orbit':'Pole and bilateral convergence region; drag to select sigma and omega');return;
  }
  surface.setAttribute('aria-label','Draggable three-dimensional magnitude and phase surface of the Laplace transform');
  $('#laplace-surface-cap').innerHTML='<strong>The surface is a map of a complex function, not a physical volume.</strong>Height encodes log(1 + |F|); color encodes phase. Pole peaks are capped for display. The dim region shows the algebraic continuation outside the causal signal’s region of convergence. The gold curve is your constant-σ section.';
  $('[name=key]').value=state.key;$('#laplace-formula').textContent='f(t) = '+cases[state.key].formula;mesh();
  const H=history(state.key,state.sigma,state.omega,state.T,1200),tail=H.samples.at(-1),F=transform(state.key,state.sigma,state.omega),err=Math.hypot(H.value[0]-F[0],H.value[1]-F[1]),roc=-cases[state.key].a;
  let message=`Integral exists for σ > ${roc.toFixed(2)}. At T = ${state.T}, finite-window error against F(s): ${err.toExponential(2)}.`;
  if(state.mode==='weight'){
    const a=H.samples,extent=Math.max(1,...a.map(p=>Math.abs(p.weighted)),...a.map(p=>Math.abs(p.f)));
    plot('#laplace-a',[{values:a.map(p=>[p.t,p.f]),color:'#667e8e'},{values:a.map(p=>[p.t,p.weighted]),color:mint},{values:a.map(p=>[p.t,p.r]),color:gold}],[0,state.T],[-extent,extent],'Time t');
    const path=a.map(p=>[p.real,p.imag]),integrand=a.map(p=>[p.r,p.i]),ex=Math.max(.25,...path.map(p=>Math.max(Math.abs(p[0]),Math.abs(p[1]))),Math.min(30,Math.abs(F[0])),Math.min(30,Math.abs(F[1])),...integrand.flat().map(Math.abs));
    const series=[];if(state.complexView!=='sum')series.push({values:integrand,color:mint});if(state.complexView!=='integrand')series.push({values:path,color:violet});
    const p=plot('#laplace-b',series,[-ex,ex],[-ex,ex],'Real part');
    if(H.converges&&F.every(Number.isFinite)){p.x.beginPath();p.x.arc(p.px(F[0]),p.py(F[1]),4,0,Math.PI*2);p.x.fillStyle=gold;p.x.fill();}
    $('#laplace-cap-a').innerHTML='<strong>Weight, then wind</strong>Muted: f(t). Mint: exponential weighting. Gold: the real part after rotating at ω.';
    $('#laplace-cap-b').innerHTML='<strong>The winding and the walk are different objects.</strong>Mint: the instantaneous integrand f(t)e⁻ˢᵗ. Violet: its accumulated integral up to T. Move the s-plane dot to change both. The gold dot is the infinite-time value inside the ROC. Each curve uses its own units on the shared complex axes; this overlay compares shape, not equal physical quantities.';
  }else if(state.mode==='spectrum'){
    const samples=H.samples,weightedExtent=Math.max(1,...samples.map(p=>Math.abs(p.f)),...samples.map(p=>Math.abs(p.weighted)));
    plot('#laplace-weighted',[{values:samples.map(p=>[p.t,p.f]),color:'#667e8e'},{values:samples.map(p=>[p.t,p.weighted]),color:mint}],[0,state.T],[-weightedExtent,weightedExtent],'Time t');
    $('#slice-identity').textContent=`F(${state.sigma.toFixed(2)} + iω) = Fourier{ e⁻σᵗ f(t) }${H.converges?' · defining integral converges':' · only the finite-window Fourier transform exists here'}`;
    const a=[],b=[];for(let k=0;k<=190;k++){const omega=-5+10*k/190;a.push([omega,Math.min(20,Math.hypot(...transform(state.key,state.sigma,omega)))]);b.push([omega,Math.hypot(...history(state.key,state.sigma,omega,state.T,600).value)]);}
    const extent=Math.min(24,Math.max(1,...a.map(p=>p[1]),...b.map(p=>p[1])));const cursor=plot('#laplace-a',[{values:a,color:gold},{values:b,color:mint}],[-5,5],[0,extent],'Angular frequency ω');line(cursor.x,[[cursor.px(state.omega),cursor.py(0)],[cursor.px(state.omega),cursor.py(extent)]],violet,2);text(cursor.x,`ω ${state.omega.toFixed(2)}`,Math.min(cursor.w-90,Math.max(50,cursor.px(state.omega)+7)),22,violet);
    const times=[];for(let j=1;j<=100;j++){const T=state.T*j/100;times.push([T,Math.min(100,Math.hypot(...history(state.key,state.sigma,state.omega,T,Math.max(100,Math.round(T*60))).value))]);}
    plot('#laplace-b',[{values:times,color:violet}],[0,state.T],[0,Math.max(1,...times.map(p=>p[1]))],'Observation horizon T');
    $('#laplace-cap-a').innerHTML='<strong>A Fourier spectrum for every σ</strong>Mint: the finite recorded signal. Gold: the analytic formula. At σ = 0 this is the ordinary Fourier section, if it converges.';
    $('#laplace-cap-b').innerHTML='<strong>Finite values do not prove convergence</strong>Watch the integral magnitude as the horizon grows. Outside the ROC a finite recording can still look deceptively well behaved.';
  }else{
    const actual=[],approx=[];let error=0,nvalid=0;for(let j=0;j<=150;j++){const t=6*j/150,f=signal(state.key,t),v=inverse(state.key,state.sigma,t,state.band,700);actual.push([t,f]);approx.push([t,v]);if(t>.08&&Number.isFinite(v)){error+=(v-f)**2;nvalid++;}}
    const ex=Math.max(1,...actual.map(p=>Math.abs(p[1])),Math.min(20,Math.max(...approx.map(p=>Math.abs(p[1])).filter(Number.isFinite))));
    plot('#laplace-a',[{values:actual,color:mint,width:2.5},{values:approx,color:gold}],[0,6],[-ex,ex],'Reconstructed time t');
    const spec=[];for(let j=0;j<=250;j++){const w=state.band*j/250,[r,i]=transform(state.key,state.sigma,w);spec.push([w,r*Math.cos(w*2)-i*Math.sin(w*2)]);}
    const sy=Math.max(.3,...spec.map(p=>Math.abs(p[1])));plot('#laplace-b',[{values:spec,color:violet}],[0,state.band],[-sy,sy],'Integration frequency ω');
    $('#laplace-cap-a').innerHTML='<strong>Reconstruct a signal from a vertical contour</strong>Mint: the original. Gold: finite-band inverse. Increasing the band resolves sharp changes; a distant contour amplifies numerical cancellation.';
    $('#laplace-cap-b').innerHTML='<strong>One time value, many cancelling frequencies</strong>The inverse integrand at t = 2. Its signed area, scaled by e²σ/π, produces one point of the reconstruction.';
    message+=` Reconstruction RMSE on 0.08 < t ≤ 6: ${nvalid?Math.sqrt(error/nvalid).toExponential(2):'undefined'}.`;
  }
  $('#laplace-status').dataset.warning=String(!H.converges);$('#laplace-status').textContent=H.converges?message:`Outside the convergence region (requires σ > ${roc.toFixed(2)}). The dim surface is an analytic continuation of the formula; it is not the defining integral here. A Bromwich contour placed here does not reconstruct this causal signal.`;
}

// Reserve the right controls and viewport before the card becomes visible.
syncControls();

}
