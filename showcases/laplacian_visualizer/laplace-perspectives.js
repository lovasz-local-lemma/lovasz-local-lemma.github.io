import {cameraPoint} from './laplace-camera.js?v=a8be8bb9b201';
import {bilateralFamilies,bilateralPoles,echoFourier,cases,signal,transform,filteredSignal,filteredTransform,convolution,bilateralSignal,bilateralROC,bilateralTransform,bilateralHistory} from './laplace-model.js?v=a8be8bb9b201';

const mint='#99e9cd',gold='#edce91',violet='#b9a5ff',coral='#f0ac91';
const complex=z=>z.every(Number.isFinite)?`${z[0].toFixed(3)} ${z[1]<0?'−':'+'} ${Math.abs(z[1]).toFixed(3)}i`:'Pole · unbounded';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function rocCoordinates(x,y,w,h) {
  return {sigma:clamp(-1.5+(x-55)/(w-85)*3.5,-1.5,2),omega:clamp(5-(y-50)/(h-100)*10,-5,5)};
}

function echoSurface({setup,line,text},state) {
  const {x,w,h}=setup('#laplace-surface'),end=8,rows=state.density||36,dt=end/rows,echoes=[];
  let extent=.0001;
  for(let j=rows-1;j>=0;j--){const tau=(j+.5)*dt;if(tau<cases[state.key].delay)continue;const pts=[];
    for(let k=0;k<=60;k++){const t=tau+(end-tau)*k/60,z=signal(state.key,tau)*Math.exp(-state.rate*(t-tau))*dt;extent=Math.max(extent,Math.abs(z));pts.push({t,z});}echoes.push({tau,pts});}
  const angle=state.yaw,c=Math.cos(angle),s=Math.sin(angle);
  const project=(t,tau,z)=>cameraPoint(t/end-.5,tau/end-.5,z/extent*.38,state,w,h,.60);
  const ribbons=echoes.map(e=>({tau:e.tau,points:e.pts.map(p=>project(p.t,e.tau,p.z))}));
  const grid='#91b5b332';for(let t=0;t<=end;t+=2){line(x,[project(t,0,0),project(t,end,0)],grid,1);line(x,[project(0,t,0),project(end,t,0)],grid,1);}
  echoes.sort((a,b)=>Math.cos(angle)*(b.tau-a.tau)).forEach(({tau,pts})=>{
    const positive=signal(state.key,tau)>=0,color=positive?mint:violet;
    x.beginPath();x.moveTo(...project(tau,tau,0));for(const p of pts)x.lineTo(...project(p.t,tau,p.z));x.lineTo(...project(end,tau,0));x.closePath();x.fillStyle=positive?'#67bb9d24':'#997edd2c';x.fill();
    const selected=state.fourier&&Math.abs(tau-state.echoTime)<=dt/2;
    line(x,pts.map(p=>project(p.t,tau,p.z)),selected?gold:color+'ba',selected?3:1);
  });
  const t=state.inspect;line(x,[project(t,0,0),project(t,t,0)],gold,2);
  for(const {tau} of echoes)if(tau<=t){const p=project(t,tau,signal(state.key,tau)*Math.exp(-state.rate*(t-tau))*dt);x.beginPath();x.arc(...p,2.7,0,Math.PI*2);x.fillStyle=gold;x.fill();}
  text(x,`${rows} RIBBONS · Δτ = ${dt.toFixed(3)} s · ${state.camera==='turntable'?'ONE-AXIS TURNTABLE':'TWO-AXIS ORBIT'}`,16,25,mint,w<600?9:11);
  text(x,state.fourier?'Hover or tap a ribbon · gold = selected echo':'Gold slice: contributions to the selected output time',16,h-15,gold,w<600?10:11);
  const p=project(end,0,0),q=project(end,end,0);text(x,'output t',clamp(p[0]-45,5,w-65),clamp(p[1]+20,45,h-35),gold,11);text(x,'input τ',clamp(q[0]-45,5,w-65),clamp(q[1]+20,45,h-35),violet,11);
  return ribbons;
}

export function renderSystem(ctx,state) {
  const {$,plot,line,setup,text}=ctx,ribbons=echoSurface(ctx,state);
  const actual=[],input=[];for(let j=0;j<=240;j++){const t=8*j/240;actual.push([t,filteredSignal(state.key,state.rate,t)]);input.push([t,signal(state.key,t)]);}
  const extent=Math.max(1,...actual.map(p=>Math.abs(p[1])),...input.map(p=>Math.abs(p[1])));
  const p=plot('#laplace-a',[{values:input,color:mint},{values:actual,color:gold,width:2.5}],[0,8],[-extent,extent],'Output time t');
  const exact=filteredSignal(state.key,state.rate,state.inspect);line(p.x,[[p.px(state.inspect),p.py(-extent)],[p.px(state.inspect),p.py(extent)]],gold+'66',1);
  p.x.beginPath();p.x.arc(p.px(state.inspect),p.py(exact),4,0,2*Math.PI);p.x.fillStyle=gold;p.x.fill();
  const integral=convolution(state.key,state.rate,state.inspect,600),curve=integral.samples.map(s=>[s.tau,s.contribution]),range=Math.max(.1,...curve.map(p=>Math.abs(p[1])));
  const q=plot('#laplace-b',[{values:curve,color:violet,width:2}],[0,Math.max(.5,state.inspect)],[-range,range],'Input time τ');
  q.x.save();q.x.beginPath();q.x.moveTo(q.px(curve[0][0]),q.py(0));curve.forEach(a=>q.x.lineTo(q.px(a[0]),q.py(a[1])));q.x.lineTo(q.px(curve.at(-1)[0]),q.py(0));q.x.closePath();q.x.fillStyle='#b9a5ff25';q.x.fill();q.x.restore();
  const F=transform(state.key,state.sigma,state.omega),x=state.sigma+state.rate,d=x*x+state.omega**2,H=d<1e-20?[Infinity,0]:[x/d,-state.omega/d],Y=filteredTransform(state.key,state.rate,state.sigma,state.omega),boundary=Math.max(-cases[state.key].a,-state.rate),valid=state.sigma>boundary;
  $('#laplace-metrics').innerHTML=`<div><span>Input F(s)</span><b>${complex(F)}</b></div><div><span>System H(s) = 1/(s + λ)</span><b>${complex(H)}</b></div><div><span>Output Y(s) = F(s)H(s)</span><b>${complex(Y)}</b></div>`;
  $('#laplace-surface-cap').innerHTML='<strong>Every input sample leaves an echo.</strong>Each ribbon is f(τ)e⁻λ⁽ᵗ⁻τ⁾Δτ for t ≥ τ, with the vertical scale shared across ribbons. Mint and violet have opposite signs. The gold slice gathers contributions at one output time; their sum makes the gold response alongside. Drag to orbit. Density changes the quadrature spacing Δτ; it does not change the underlying continuous system.';
  $('#laplace-cap-a').innerHTML='<strong>A system remembers earlier input.</strong>Mint: the selected input. Gold: its zero-state response to h(t) = e⁻λᵗu(t). Change the memory decay λ or move the inspection time to follow the response being assembled.';
  $('#laplace-cap-b').innerHTML='<strong>Signed area becomes one output sample.</strong>This is the convolution integrand f(τ)h(t−τ), not a copy of the output curve. Contributions can reinforce or cancel. The ribbon display uses coarse samples; this area uses 600-step quadrature.';
  if(state.fourier){
    const tau=state.echoTime,weight=signal(state.key,tau)*8/(state.density||36),real=[],imag=[];
    for(let i=0;i<=240;i++){const omega=-8+16*i/240,[r,im]=echoFourier(tau,weight,state.rate,omega);real.push([omega,r]);imag.push([omega,im]);}
    const range=Math.max(.001,...real.map(p=>Math.abs(p[1])),...imag.map(p=>Math.abs(p[1])));
    plot('#laplace-b',[{values:real,color:gold},{values:imag,color:violet}],[-8,8],[-range,range],'Fourier frequency ω · rad/s');
    $('#laplace-cap-b').innerHTML=`<strong>Selected echo · τ = ${tau.toFixed(2)} s</strong>Gold: real. Violet: imaginary. Eτ(iω) = f(τ)Δτ e⁻ⁱωτ / (λ + iω). The delay rotates phase; amplitude is |f(τ)Δτ| / √(λ² + ω²). This is the full decaying echo, including its tail beyond the drawing.`;
  }
  $('#laplace-formula').textContent=`y(t) = ∫₀ᵗ f(τ)e⁻λ⁽ᵗ⁻τ⁾ dτ  ↔  Y(s) = F(s)/(s + λ)`;
  return {ribbons,warning:!valid,message:`At t = ${state.inspect.toFixed(2)}, integrated echoes give ${integral.value.toFixed(5)}; the closed-form response gives ${exact.toFixed(5)} (difference ${Math.abs(integral.value-exact).toExponential(2)}). ${valid?'At the selected s, convolution becomes the complex product above.':`The product is shown algebraically, but both defining transforms require σ > ${boundary.toFixed(2)} here.`} This λ-dependent filter has DC gain 1/λ; it is not normalized to unit gain.`};
}

function rocPlane({setup,line,text},state) {
  const {x,w,h}=setup('#laplace-surface'),m={l:55,r:30,t:50,b:50},px=v=>m.l+(v+1.5)/3.5*(w-m.l-m.r),py=v=>m.t+(5-v)/10*(h-m.t-m.b),pole=px(state.pole),right=state.side==='causal';
  x.fillStyle=right?'#ad88ed0c':'#987edc29';x.fillRect(m.l,m.t,pole-m.l,h-m.t-m.b);
  x.fillStyle=right?'#75dbb82c':'#75dbb80c';x.fillRect(pole,m.t,w-m.r-pole,h-m.t-m.b);
  for(let v=-1;v<=2;v+=.5){line(x,[[px(v),m.t],[px(v),h-m.b]],'#b1c3cb20',1);text(x,v.toFixed(1),px(v)-10,h-m.b+18,'#b9c6c9',10);}
  for(let v=-4;v<=4;v+=2){line(x,[[m.l,py(v)],[w-m.r,py(v)]],'#b1c3cb20',1);text(x,String(v),m.l-23,py(v)+4,'#b9c6c9',10);}
  line(x,[[px(0),m.t],[px(0),h-m.b]],gold+'c0',1.5);line(x,[[m.l,py(0)],[w-m.r,py(0)]],'#b9c7ce70',1);
  x.setLineDash([5,5]);line(x,[[pole,m.t],[pole,h-m.b]],coral+'b0',1.5);x.setLineDash([]);
  for(const [,omega] of bilateralPoles(state.pole,state.family,state.beta)){line(x,[[pole-6,py(omega)-6],[pole+6,py(omega)+6]],coral,2.5);line(x,[[pole-6,py(omega)+6],[pole+6,py(omega)-6]],coral,2.5);if(['repeated','triple','timecosine'].includes(state.family))text(x,state.family==='triple'?'×3':'×2',pole+10,py(omega)+5,coral,12);}
  const selected=bilateralROC(state.side,state.pole,state.sigma),dot=[px(state.sigma),py(state.omega)];x.beginPath();x.arc(...dot,6,0,2*Math.PI);x.fillStyle=selected?mint:coral;x.shadowColor=x.fillStyle;x.shadowBlur=15;x.fill();x.shadowBlur=0;
  text(x,'SAME POLES · DIFFERENT TIME SUPPORT',16,25,mint,w<600?10:12);
  text(x,right?'ROC → right of the pole':'ROC ← left of the pole',clamp(pole+(right?15:-175),m.l+8,w-205),m.t+24,right?mint:violet,12);
  text(x,'ω',m.l-28,m.t+5,violet,13);text(x,'σ',w-m.r-2,h-m.b+20,gold,13);
  text(x,'Gold line = Fourier axis σ = 0 · drag the dot or use the sliders',16,h-12,gold,w<600?9:11);
}

export function renderROC(ctx,state) {
  const {$,plot,line}=ctx;rocPlane(ctx,state);
  // Shared signed-log amplitude keeps the decaying alternative visible beside a growing one.
  const signedLog=v=>Math.sign(v)*Math.log1p(Math.abs(v));
  const causal=[],left=[];for(let j=0;j<=240;j++){const t=6*j/240;causal.push([t,signedLog(bilateralSignal('causal',state.pole,t,state.family,state.beta))]);left.push([-6+t,signedLog(bilateralSignal('anticausal',state.pole,-6+t,state.family,state.beta))]);}
  const scale=Math.max(1,...causal.map(p=>Math.abs(p[1])),...left.map(p=>Math.abs(p[1])));
  const p=plot('#laplace-a',[{values:[[-6,0],[6,0]],color:'#9bacbe38'},{values:causal,color:state.side==='causal'?mint:'#99e9cd45',width:state.side==='causal'?2.5:1.2},{values:left,color:state.side==='anticausal'?violet:'#b9a5ff45',width:state.side==='anticausal'?2.5:1.2}],[-6,6],[-scale,scale],'Time t · height sign(f) log(1 + |f|)');
  line(p.x,[[p.px(0),p.py(-scale)],[p.px(0),p.py(scale)]],gold+'55',1);
  const integral=bilateralHistory(state.side,state.pole,state.sigma,state.omega,state.T,3200,state.family,state.beta),a=integral.samples.map(s=>[s.distance,Math.log1p(Math.hypot(s.real,s.imag))]),F=bilateralTransform(state.pole,state.sigma,state.omega,state.family,state.beta),analytic=Math.log1p(Math.hypot(...F)),valid=integral.converges,finite=F.every(Number.isFinite);
  const series=[{values:a,color:state.side==='causal'?mint:violet,width:2}];if(valid&&finite)series.push({values:[[0,analytic],[state.T,analytic]],color:gold});
  plot('#laplace-b',series,[0,state.T],[0,Math.max(1,...a.map(p=>p[1]),valid&&finite?analytic:0)],'Window radius T · height log(1 + |integral|)');
  const stable=bilateralROC(state.side,state.pole,0),side=state.side==='causal'?'Right-sided / causal':'Left-sided / anti-causal',dir=state.side==='causal'?'>':'<';
  $('#laplace-metrics').innerHTML=`<div><span>Same algebraic F(s)</span><b>${complex(F)}</b></div><div><span>Selected region</span><b>σ ${dir} ${state.pole.toFixed(2)}</b></div><div><span>If used as an impulse response</span><b>${stable?'BIBO stable':'Not BIBO stable'}</b></div>`;
  const family=bilateralFamilies[state.family||'exponential'];
  $('#laplace-formula').textContent=`F(s) = ${family.formula}, p = ${state.pole.toFixed(2)}; f(t) = ${state.side==='causal'?'':'−'}${family.time} ${state.side==='causal'?'u(t)':'u(−t)'}`;
  $('#laplace-surface-cap').innerHTML='<strong>The region of convergence is part of the answer.</strong>The poles and rational formula stay fixed when you switch the time direction. The shaded admissible half-plane changes. A selected point outside that half-plane gives an algebraic continuation, not the signal’s defining integral.';
  $('#laplace-cap-a').innerHTML=`<strong>One formula, two time-domain signals.</strong>Right-sided: ${family.time} u(t). Left-sided: −${family.time} u(−t). Shared signed-log height keeps both alternatives visible. The active signal is bright; the opposite support is faint.`;
  $('#laplace-cap-b').innerHTML='<strong>Let the time window decide.</strong>The actual bilateral integral uses [0,T] or [−T,0], according to the selected support. Its magnitude is plotted with logarithmic compression. Inside the ROC it approaches the gold infinite-window value; outside it may grow or oscillate without converging.';
  const error=finite?Math.hypot(integral.value[0]-F[0],integral.value[1]-F[1]):Infinity;
  return {warning:!valid,message:`${side}: the defining integral requires σ ${dir} ${state.pole.toFixed(2)}. ${valid?`Finite-window error at T = ${state.T}: ${error.toExponential(2)}.`:'This point is outside the ROC, including its boundary; a finite observation is not a transform value.'} ${stable?'The Fourier axis lies inside this ROC. The impulse response is absolutely integrable, so this ideal LTI system is BIBO stable.':'The Fourier axis is outside this ROC. This impulse response is not absolutely integrable, so this ideal LTI system is not BIBO stable.'} Anti-causal does not mean implementable as an online causal device.`};
}
