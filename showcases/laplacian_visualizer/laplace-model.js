// Causal examples: analytic transforms and independently integrated time histories.
export const cases = {
  oscillator: {title:'Decaying resonance',a:.25,b:2.4,delay:0,formula:'e⁻⁰·²⁵ᵗ sin(2.4t) u(t)',laplace:'2.4 / ((s + 0.25)² + 2.4²)'},
  growth: {title:'Growing exponential',a:-.3,b:0,delay:0,formula:'e⁰·³ᵗ u(t)',laplace:'1 / (s − 0.3)'},
  delayed: {title:'Delayed resonance',a:.25,b:2.4,delay:1.2,formula:'e⁻⁰·²⁵⁽ᵗ⁻¹·²⁾ sin(2.4(t − 1.2)) u(t − 1.2)',laplace:'e⁻¹·²ˢ · 2.4 / ((s + 0.25)² + 2.4²)'},
  decay: {title:'Exponential memory',a:.7,b:0,delay:0,formula:'e⁻⁰·⁷ᵗ u(t)',laplace:'1 / (s + 0.7)'},
  step: {title:'Unit step',a:0,b:0,delay:0,formula:'u(t)',laplace:'1 / s'},
  cosine: {title:'Decaying cosine',a:.25,b:2.4,kind:'cos',delay:0,formula:'e⁻⁰·²⁵ᵗ cos(2.4t) u(t)',laplace:'(s + 0.25) / ((s + 0.25)² + 2.4²)'},
  slow: {title:'Slow, long-lived mode',a:.08,b:.8,delay:0,formula:'e⁻⁰·⁰⁸ᵗ sin(0.8t) u(t)',laplace:'0.8 / ((s + 0.08)² + 0.8²)'},
  fast: {title:'Fast, short-lived mode',a:.4,b:4,delay:0,formula:'e⁻⁰·⁴ᵗ sin(4t) u(t)',laplace:'4 / ((s + 0.4)² + 16)'},
  ramp: {title:'Rise then decay · double pole',a:.7,b:0,power:1,delay:0,formula:'t e⁻⁰·⁷ᵗ u(t)',laplace:'1 / (s + 0.7)²'},
  quadratic: {title:'Smooth onset · triple pole',a:.8,b:0,power:2,delay:0,formula:'t² e⁻⁰·⁸ᵗ u(t)',laplace:'2 / (s + 0.8)³'},
  beats: {title:'Two-mode beating',a:.2,b:2,delay:0,terms:[{a:.2,b:2,gain:.5},{a:.2,b:2.7,gain:.5}],formula:'½ e⁻⁰·²ᵗ [sin(2t) + sin(2.7t)] u(t)',laplace:'1 / ((s + 0.2)² + 4) + 1.35 / ((s + 0.2)² + 7.29)'}
};
const termsOf=key=>cases[key].terms||[cases[key]];
const mul=([a,b],[c,d])=>[a*c-b*d,a*d+b*c];
const div=([a,b],[c,d])=>{const n=c*c+d*d;return n<1e-20?[Infinity,0]:[(a*c+b*d)/n,(b*c-a*d)/n];};
function termValue(term,t){return (term.gain??1)*Math.pow(t,term.power||0)*Math.exp(-term.a*t)*(term.b?(term.kind==='cos'?Math.cos(term.b*t):Math.sin(term.b*t)):1);}
function termTransform(term,sigma,omega){
  const x=sigma+term.a,b=term.b||0;
  if(b)return div(term.kind==='cos'?[x,omega]:[b,0],[x*x-omega*omega+b*b,2*x*omega]).map(v=>v*(term.gain??1));
  let z=[1,0];for(let i=0;i<=(term.power||0);i++)z=div(z,[x,omega]);
  return z.map(v=>v*(term.power===2?2:1)*(term.gain??1));
}
export function signal(key,t) {
  t-=cases[key].delay;return t<0?0:termsOf(key).reduce((v,term)=>v+termValue(term,t),0);
}
export function transform(key,sigma,omega) {
  const delay=cases[key].delay,sum=termsOf(key).reduce((sum,term)=>{const v=termTransform(term,sigma,omega);return [sum[0]+v[0],sum[1]+v[1]];},[0,0]);
  if(!sum.every(Number.isFinite))return [Infinity,0];
  return mul(sum,[Math.exp(-sigma*delay)*Math.cos(omega*delay),-Math.exp(-sigma*delay)*Math.sin(omega*delay)]);
}
export function history(key,sigma,omega,T=16,n=1000) {
  const dt=T/n, samples=[];let real=0,imag=0,pr=0,pi=0;
  for(let j=0;j<=n;j++) {
    const t=j*dt,weighted=signal(key,t)*Math.exp(-sigma*t);
    const r=weighted*Math.cos(omega*t),i=-weighted*Math.sin(omega*t);
    if(j){real+=(pr+r)*dt/2;imag+=(pi+i)*dt/2;}
    samples.push({t,f:signal(key,t),weighted,r,i,real,imag}); pr=r;pi=i;
  }
  return {samples,value:[real,imag],converges:sigma>-cases[key].a};
}
export function inverse(key,c,t,band=14,n=1024) {
  // Real causal f: pair ±ω and integrate Re[F(c+iω)e^(iωt)] / π.
  const dw=band/n;let sum=0;
  for(let j=0;j<=n;j++) {
    const w=j*dw,[r,i]=transform(key,c,w);
    if(!Number.isFinite(r))return NaN;
    sum+=(j===0||j===n?.5:1)*(r*Math.cos(w*t)-i*Math.sin(w*t));
  }
  return Math.exp(c*t)*sum*dw/Math.PI;
}
export function poles(key) {
  return termsOf(key).flatMap(({a,b})=>b?[[-a,b],[-a,-b]]:[[-a,0]]);
}

// Integral of t^n exp(qt), evaluated analytically; series avoids cancellation near q=0.
function exponentialMoment(n,q,u){
  if(Math.hypot(...q)*u<.5){
    let sum=[0,0],power=[1,0],factorial=1;
    for(let k=0;k<24;k++){const scale=u**(n+k+1)/(factorial*(n+k+1));sum=[sum[0]+power[0]*scale,sum[1]+power[1]*scale];power=mul(power,q);factorial*=k+1;}
    return sum;
  }
  const e=[Math.exp(q[0]*u)*Math.cos(q[1]*u),Math.exp(q[0]*u)*Math.sin(q[1]*u)];
  let value=div([e[0]-1,e[1]],q);
  for(let k=1;k<=n;k++)value=div([u**k*e[0]-k*value[0],u**k*e[1]-k*value[1]],q);
  return value;
}
export function filteredSignal(key,rate,t) {
  const u=t-cases[key].delay;if(u<=0)return 0;
  return termsOf(key).reduce((sum,term)=>{const value=exponentialMoment(term.power||0,[rate-term.a,term.b||0],u),component=term.b&&term.kind!=='cos'?value[1]:value[0];return sum+(term.gain??1)*Math.exp(-rate*u)*component;},0);
}
export function filteredTransform(key,rate,sigma,omega) {
  const [r,i]=transform(key,sigma,omega),x=sigma+rate,d=x*x+omega*omega;
  return d<1e-20?[Infinity,0]:[(r*x+i*omega)/d,(i*x-r*omega)/d];
}
export function convolution(key,rate,t,n=600) {
  // Start at the support boundary, so a delayed onset cannot straddle a quadrature cell.
  const start=Math.min(t,cases[key].delay),span=Math.max(0,t-start),dt=span/n,samples=[];let value=0,previous=0;
  for(let j=0;j<=n;j++){
    const tau=start+j*dt,input=t<cases[key].delay?0:signal(key,tau),kernel=Math.exp(-rate*(t-tau)),contribution=input*kernel;
    if(j)value+=(previous+contribution)*dt/2;
    samples.push({tau,input,kernel,contribution,cumulative:value});previous=contribution;
  }
  return {samples,value};
}

// A bilateral pair: the same rational expression has two disjoint possible ROCs.
// The value at the single discontinuity t=0 does not affect either integral.
export const bilateralFamilies={
  exponential:{formula:'1/(s − p)',time:'eᵖᵗ'},
  repeated:{formula:'1/(s − p)²',time:'t eᵖᵗ'},
  triple:{formula:'1/(s − p)³',time:'½t² eᵖᵗ'},
  timecosine:{formula:'((s − p)² − β²)/((s − p)² + β²)²',time:'t eᵖᵗ cos(βt)'},
  cosine:{formula:'(s − p)/((s − p)² + β²)',time:'eᵖᵗ cos(βt)'},
  sine:{formula:'β/((s − p)² + β²)',time:'eᵖᵗ sin(βt)'}
};
export function bilateralSignal(side,p,t,family='exponential',beta=2) {
  if(side==='causal'?t<0:t>0)return 0;
  const shape=family==='triple'?t*t/2:family==='timecosine'?t*Math.cos(beta*t):family==='repeated'?t:family==='cosine'?Math.cos(beta*t):family==='sine'?Math.sin(beta*t):1;
  return (side==='causal'?1:-1)*shape*Math.exp(p*t);
}
export function bilateralROC(side,p,sigma) {return side==='causal'?sigma>p:sigma<p;}
export function bilateralTransform(p,sigma,omega,family='exponential',beta=2) {
  const x=sigma-p,d=x*x+omega*omega;
  if(family==='exponential')return d<1e-20?[Infinity,0]:[x/d,-omega/d];
  if(family==='triple'){if(d<1e-20)return [Infinity,0];return div(div(div([1,0],[x,omega]),[x,omega]),[x,omega]);}
  if(family==='timecosine'){const square=[x*x-omega*omega,2*x*omega],den=[square[0]+beta*beta,square[1]];return div([square[0]-beta*beta,square[1]],mul(den,den));}
  const r=x*x-omega*omega+(family==='repeated'?0:beta*beta),i=2*x*omega,denom=r*r+i*i;
  if(denom<1e-20)return [Infinity,0];
  const nr=family==='cosine'?x:family==='sine'?beta:1,ni=family==='cosine'?omega:0;
  return [(nr*r+ni*i)/denom,(ni*r-nr*i)/denom];
}
export function bilateralPoles(p,family='exponential',beta=2){
  return ['cosine','sine','timecosine'].includes(family)?[[p,beta],[p,-beta]]:[[p,0]];
}

// Fourier transform of weight * exp(-rate * (t-tau)) * u(t-tau).
export function echoFourier(tau,weight,rate,omega) {
  const d=rate*rate+omega*omega,c=Math.cos(omega*tau),s=Math.sin(omega*tau);
  return [weight*(rate*c-omega*s)/d,-weight*(omega*c+rate*s)/d];
}
export function bilateralHistory(side,p,sigma,omega,T=16,n=1000,family='exponential',beta=2) {
  // r is distance from the origin along the supported half-axis. For the left-sided
  // signal dt reverses with the limits; the remaining negative sign is in the signal.
  const sign=side==='causal'?1:-1,dr=T/n,samples=[];let real=0,imag=0,pr=0,pi=0;
  for(let j=0;j<=n;j++){
    const distance=j*dr,t=sign*distance,weighted=bilateralSignal(side,p,t,family,beta)*Math.exp(-sigma*t);
    const r=weighted*Math.cos(omega*t),i=-weighted*Math.sin(omega*t);
    if(j){real+=(pr+r)*dr/2;imag+=(pi+i)*dr/2;}
    samples.push({distance,t,r,i,real,imag});pr=r;pi=i;
  }
  return {samples,value:[real,imag],converges:bilateralROC(side,p,sigma)};
}

export const kernelFamilies={
  exponential:{title:'Exponential',formula:'e⁻λᵗ',laplace:'1 / (s + λ)',id:0},
  sine:{title:'Ringing sine',formula:'e⁻λᵗ sin(2.4t)',laplace:'2.4 / ((s + λ)² + 2.4²)',id:1},
  cosine:{title:'Ringing cosine',formula:'e⁻λᵗ cos(2.4t)',laplace:'(s + λ) / ((s + λ)² + 2.4²)',id:2},
  rise:{title:'Rise and fade',formula:'λt e⁻λᵗ',laplace:'λ / (s + λ)²',id:3},
  smooth:{title:'Smooth onset',formula:'(λt)² e⁻λᵗ',laplace:'2λ² / (s + λ)³',id:4},
  beats:{title:'Two-mode beating',formula:'½ e⁻λᵗ [sin(1.5t) + sin(3t)]',laplace:'0.75 / ((s + λ)² + 2.25) + 1.5 / ((s + λ)² + 9)',id:5}
};
function kernelTerms(key,rate){
  if(key==='beats')return [{a:rate,b:1.5,gain:.5},{a:rate,b:3,gain:.5}];
  return [{a:rate,b:key==='sine'||key==='cosine'?2.4:0,kind:key==='cosine'?'cos':'sin',power:key==='rise'?1:key==='smooth'?2:0,gain:key==='rise'?rate:key==='smooth'?rate*rate:1}];
}
export function kernelValue(key,rate,t){return kernelTerms(key,rate).reduce((sum,term)=>sum+termValue(term,t),0);}
export function kernelTransform(key,rate,sigma,omega){return kernelTerms(key,rate).reduce((sum,term)=>{const z=termTransform(term,sigma,omega);return [sum[0]+z[0],sum[1]+z[1]];},[0,0]);}
