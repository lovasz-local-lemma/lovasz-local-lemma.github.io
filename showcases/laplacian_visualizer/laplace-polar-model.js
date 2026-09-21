import {signal} from './laplace-model.js?v=a8be8bb9b201';

// Circular components use screen-independent complex coordinates: +i points up.
// This is a vector-motion analogy, not an electromagnetic field solver.
export function polarSample(state,t){
  const amplitude=Math.exp(-state.sigma*t)*(state.mode==='laplace'?signal(state.signal,t):1);
  const mix=state.mode==='laplace'?0:state.mix,phase=state.omega*t;
  const cw=[amplitude*(1-mix)*Math.cos(phase),-amplitude*(1-mix)*Math.sin(phase)];
  const ccw=[amplitude*mix*Math.cos(phase),amplitude*mix*Math.sin(phase)];
  const sum=[cw[0]+ccw[0],cw[1]+ccw[1]],a=state.analyzer*Math.PI/180;
  return {amplitude,cw,ccw,sum,projection:sum[0]*Math.cos(a)+sum[1]*Math.sin(a)};
}
