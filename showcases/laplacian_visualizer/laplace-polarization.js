import {cases} from './laplace-model.js?v=a8be8bb9b201';
import {polarSample} from './laplace-polar-model.js?v=a8be8bb9b201';
import {cameraPoint,clamp} from './laplace-camera.js?v=a8be8bb9b201';

const host=document.querySelector('#polarization-studio');
const $=selector=>host.querySelector(selector),mint='#99e9cd',violet='#bcabff',gold='#f6d38c';
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const state={mode:'optics',signal:'oscillator',mix:.24,sigma:.12,omega:2.4,analyzer:30,time:3,yaw:-.6,pitch:.58,playing:!reduced.matches};
const signalSelect=$('[name=signal]');
for(const [key,item] of Object.entries(cases)){const option=document.createElement('option');option.value=key;option.textContent=item.title;signalSelect.append(option);}
let frame=0,visible=false,last=0;
function stopFrame(){cancelAnimationFrame(frame);frame=0;last=0;}
function schedule(){if(!frame&&visible&&!document.hidden)frame=requestAnimationFrame(tick);}
function tick(now){frame=0;if(!visible||document.hidden)return;const dt=last?Math.min(.05,(now-last)/1000):0;last=now;if(state.playing)state.time=(state.time+dt*.8)%10;render();if(state.playing)schedule();else last=0;}
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)schedule();else stopFrame();}).observe(host);
new ResizeObserver(schedule).observe(host);
document.addEventListener('visibilitychange',()=>document.hidden?stopFrame():schedule());
reduced.addEventListener('change',()=>{if(reduced.matches){state.playing=false;schedule();}});
host.addEventListener('input',event=>{const key=event.target.name;if(!(key in state))return;state[key]=['mode','signal'].includes(key)?event.target.value:Number(event.target.value);if(key==='time')state.playing=false;schedule();});
host.addEventListener('click',event=>{const preset=event.target.closest('[data-polar-mix]');if(preset){state.mode='optics';state.mix=Number(preset.dataset.polarMix);}if(event.target.closest('[data-polar-play]'))state.playing=!state.playing;if(event.target.closest('[data-polar-reset]')){state.time=0;state.yaw=-.6;state.pitch=.58;}schedule();});
const scene=$('[data-polar-scene]');let drag=null;
scene.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];scene.setPointerCapture(e.pointerId);});
scene.addEventListener('pointermove',e=>{if(!drag)return;state.yaw-=(e.clientX-drag[0])*.008;state.pitch=clamp(state.pitch+(e.clientY-drag[1])*.007,-1.3,1.3);drag=[e.clientX,e.clientY];schedule();});
for(const type of ['pointerup','pointercancel'])scene.addEventListener(type,()=>drag=null);
scene.addEventListener('keydown',e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();if(e.key==='ArrowLeft'||e.key==='ArrowRight')state.yaw+=e.key==='ArrowRight'?-.1:.1;else state.pitch=clamp(state.pitch+(e.key==='ArrowDown'?.1:-.1),-1.3,1.3);schedule();});
function canvas(selector){const c=$(selector),r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio,1.6),w=r.width,h=r.height;const W=Math.round(w*d),H=Math.round(h*d);if(c.width!==W||c.height!==H){c.width=W;c.height=H;}const x=c.getContext('2d');x.setTransform(d,0,0,d,0,0);x.clearRect(0,0,w,h);return {x,w,h};}
function line(x,points,color,width=1.5){x.beginPath();points.forEach((p,i)=>i?x.lineTo(...p):x.moveTo(...p));x.strokeStyle=color;x.lineWidth=width;x.stroke();}
function label(x,s,p,color=gold){x.fillStyle=color;x.font='11px system-ui';x.fillText(s,...p);}
function dot(x,p,color,r=4){x.beginPath();x.arc(...p,r,0,Math.PI*2);x.fillStyle=color;x.shadowColor=color;x.shadowBlur=12;x.fill();x.shadowBlur=0;}
function arrow(x,a,b,color){line(x,[a,b],color,2);const theta=Math.atan2(b[1]-a[1],b[0]-a[0]);line(x,[[b[0]-7*Math.cos(theta-.4),b[1]-7*Math.sin(theta-.4)],b,[b[0]-7*Math.cos(theta+.4),b[1]-7*Math.sin(theta+.4)]],color,2);}
function render(){
  host.querySelectorAll('input[name],select[name]').forEach(el=>el.value=state[el.name]);
  host.querySelectorAll('output[data-polar-value]').forEach(el=>el.textContent=Number(state[el.dataset.polarValue]).toFixed(2));
  $('[data-polar-optics]').hidden=state.mode!=='optics';$('[data-polar-signal]').hidden=state.mode!=='laplace';
  $('[data-polar-play]').textContent=state.playing?'Pause motion':'Play motion';
  const mix=state.mode==='laplace'?0:state.mix,kind=Math.abs(mix-.5)<.005?'LINEAR':mix<.005||mix>.995?'CIRCULAR':'ELLIPTICAL';
  $('[data-polar-equation]').textContent=state.mode==='laplace'?'z(t) = f(t)e⁻σᵗ e⁻ⁱωᵗ · f(t) = '+cases[state.signal].formula:'z(t) = e⁻σᵗ [(1 − b)e⁻ⁱωᵗ + b e⁺ⁱωᵗ]';
  $('[data-polar-reading]').textContent=state.mode==='laplace'?'Actual Laplace integrand: one clockwise phasor, modulated by the selected real signal. Time is the third coordinate; this is not its accumulated integral.':`${kind} · circular weights ${(1-mix).toFixed(2)} + ${mix.toFixed(2)}. Equal weights cancel the imaginary component. σ changes the common envelope, not the ellipse’s aspect ratio.`;
  const samples=Array.from({length:321},(_,i)=>polarSample(state,i/32)),extent=Math.max(1,...samples.map(v=>Math.abs(v.amplitude))),current=polarSample(state,state.time);
  drawScene(samples,extent,current);drawPlane(extent,current);drawProjection(samples,extent,current);
}
function drawScene(samples,extent,current){
  const {x,w,h}=canvas('[data-polar-scene]'),point=(v,t)=>{const p=cameraPoint(v[0]/extent*.63,v[1]/extent*.63,(t/10-.5)*1.6,state,w,h,.45);return [p[0],p[1]-h*.08];};
  const axis=t=>point([0,0],t);
  for(const t of [0,2,4,6,8,10]){line(x,[point([-.8*extent,0],t),point([.8*extent,0],t)],'#779f991b');label(x,`${t}s`,point([-.85*extent,0],t),'#8aaba3');}
  line(x,[axis(0),axis(10)],'#dbe9d966');
  const paths={cw:[],ccw:[],sum:[]};
  for(let i=0;i<samples.length;i++)for(const key of Object.keys(paths))paths[key].push(point(samples[i][key],i/32));
  line(x,paths.cw,mint+'55');line(x,paths.ccw,violet+'55');line(x,paths.sum,gold+'35',2);
  const end=Math.floor(state.time*32);
  // The translucent curtain connects each complex vector to its own time-axis origin.
  for(let i=1;i<=end;i++){x.beginPath();[axis((i-1)/32),paths.sum[i-1],paths.sum[i],axis(i/32)].forEach((p,j)=>j?x.lineTo(...p):x.moveTo(...p));x.closePath();x.fillStyle=`hsla(${42+i*.34},65%,66%,.075)`;x.fill();}
  x.shadowColor=gold;x.shadowBlur=9;line(x,[...paths.sum.slice(0,end+1),point(current.sum,state.time)],gold,2.3);x.shadowBlur=0;
  const ellipse=[];for(let i=0;i<=100;i++){const a=i/100*Math.PI*2,r=current.amplitude,m=state.mode==='laplace'?0:state.mix;ellipse.push(point([r*Math.cos(a),r*(2*m-1)*Math.sin(a)],state.time));}line(x,ellipse,'#dcefe96b');
  arrow(x,axis(state.time),point(current.sum,state.time),gold);dot(x,point(current.sum,state.time),gold);
  label(x,'TIME SWEEP · Re z / Im z / t',[18,25],mint);label(x,`t = ${state.time.toFixed(2)} s · drag to orbit`,[18,h-17]);
}
function drawPlane(extent,current){
  const {x,w,h}=canvas('[data-polar-plane]'),scale=Math.min(w,h)*.34/extent,p=v=>[w*.5+v[0]*scale,h*.52-v[1]*scale],O=p([0,0]);
  line(x,[[18,O[1]],[w-18,O[1]]],'#93b9ac30');line(x,[[O[0],25],[O[0],h-20]],'#93b9ac30');
  const r=current.amplitude,m=state.mode==='laplace'?0:state.mix,ellipse=[];for(let i=0;i<=120;i++){const a=i/120*Math.PI*2;ellipse.push(p([r*Math.cos(a),r*(2*m-1)*Math.sin(a)]));}line(x,ellipse,gold+'88');
  arrow(x,O,p(current.cw),mint);arrow(x,p(current.cw),p(current.sum),violet);arrow(x,O,p(current.sum),gold);dot(x,p(current.sum),gold);
  const a=state.analyzer*Math.PI/180,d=[Math.cos(a),Math.sin(a)],projected=p(d.map(v=>v*current.projection));
  x.setLineDash([4,5]);line(x,[p(d.map(v=>v*-extent)),p(d.map(v=>v*extent))],'#e1d6b970');line(x,[p(current.sum),projected],'#ffffff88');x.setLineDash([]);dot(x,projected,'#fff2d7',3);
  label(x,'VECTOR ADDITION · the current time slice',[14,22],mint);label(x,'CW mint + CCW violet = gold',[14,h-12]);
}
function drawProjection(samples,extent,current){
  const {x,w,h}=canvas('[data-polar-projection]'),px=t=>34+t/10*(w-50),py=v=>h*.51-v/extent*h*.31;
  line(x,[[34,py(0)],[w-16,py(0)]],'#93b9ac55');line(x,samples.map((v,i)=>[px(i/32),py(v.projection)]),'#ecdca5aa',1.6);
  line(x,[[px(state.time),30],[px(state.time),h-28]],violet);dot(x,[px(state.time),py(current.projection)],gold);
  label(x,`ANALYZER · ${state.analyzer.toFixed(0)}° · signed projection`,[14,20],mint);label(x,'0 s',[34,h-10]);label(x,'10 s',[w-42,h-10]);
}
