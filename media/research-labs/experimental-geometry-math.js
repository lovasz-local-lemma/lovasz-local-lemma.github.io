/* Controlled geometric examples, independent of the native transport engine. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhotonExperiment=api;})(globalThis,()=>{
  'use strict';
  const gaussian=(x,s)=>Math.exp(-.5*(x/s)**2)/(s*Math.sqrt(2*Math.PI));
  // Positive-term integral series avoids cancellation in erf polynomial fits.
  function cdf(x){if(x<=-8)return 0;if(x>=8)return 1;let term=x,sum=x;for(let n=1;n<160;n++){term*=x*x/(2*n+1);sum+=term;if(Math.abs(term)<Math.abs(sum)*1e-16)break;}return .5+sum*Math.exp(-x*x/2)/Math.sqrt(2*Math.PI);}
  const box=(x,a,s)=>cdf((x+a)/s)-cdf((x-a)/s);
  // Light travels +z and the sensor at z=0 receives the return: both legs attenuate.
  const attenuation=(ext,H)=>ext===0?H:-Math.expm1(-2*ext*H)/(2*ext);
  function intensity(x,y,p,a,b,s,ext,H){return attenuation(ext,H)*box(x-p,a,s)*box(y,b,s);}
  function derivative(x,y,p,a,b,s,ext,H){return attenuation(ext,H)*(gaussian(x-p-a,s)-gaussian(x-p+a,s))*box(y,b,s);}
  function difference(x,y,p,a,b,s,ext,H,step){return (intensity(x,y,p+step,a,b,s,ext,H)-intensity(x,y,p,a,b,s,ext,H))/step;}
  function surface(h,tilt,k){
    const c=Math.cos(tilt),s=Math.sin(tilt),r2=1-h*h;
    if(r2<0)return {kind:'empty',radius:0,roots:[],jacobian:0};
    const radius=Math.sqrt(r2),x=(k-s*h)/c,y2=r2-x*x;
    if(Math.abs(c)<1e-10)return {kind:'degenerate',radius,roots:[],jacobian:0};
    if(y2 < -1e-12)return {kind:'empty',radius,roots:[],jacobian:0};
    if(y2<=1e-12)return {kind:'tangent',radius,roots:[[x,0,h]],jacobian:0};
    const y=Math.sqrt(y2);return {kind:'regular',radius,roots:[[x,y,h],[x,-y,h]],jacobian:Math.abs(c*y)};
  }
  return {gaussian,cdf,box,attenuation,intensity,derivative,difference,surface};
});
