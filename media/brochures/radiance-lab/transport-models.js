/* Small, deterministic teaching models. No native film or rendering estimates.
   CommonJS export permits numerical checks without a DOM. */
((root, factory) => {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.TransportModels = model;
})(typeof window === 'undefined' ? {} : window, () => {
  'use strict';
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  function weights(pdf, beta = 2, counts = pdf.map(() => 1)) {
    const power = pdf.map((p, i) => Math.pow(Math.max(0, p * counts[i]), beta));
    const total = power.reduce((a, b) => a + b, 0);
    return power.map(x => total ? x / total : 0);
  }
  function splits(vertices, finiteAperture, deltaVertex = -1) {
    return Array.from({length: vertices + 1}, (_, s) => {
      const t = vertices - s;
      const blocked = (t === 0 && !finiteAperture) ||
        (s > 0 && t > 0 && (s - 1 === deltaVertex || s === deltaVertex));
      return {s, t, supported: !blocked};
    });
  }
  function diskKernel(distance, radius) {
    // Normalized Epanechnikov kernel on a two-dimensional surface.
    return distance < radius ? 2 * (1 - (distance / radius) ** 2) / (Math.PI * radius ** 2) : 0;
  }
  function guide(fraction, training) {
    // A discrete one-angle slice, not a three-dimensional solid-angle PDF.
    const n = 64, delta = Math.PI / n;
    const theta = Array.from({length:n}, (_, i) => -Math.PI / 2 + (i + .5) * delta);
    const f = theta.map(a => Math.cos(a) * (.08 + 2.8 * Math.exp(-(((a - .48) / .15) ** 2)) + .8 * Math.exp(-(((a + .67) / .24) ** 2))));
    const normal = a => {const sum = a.reduce((s, v) => s + v, 0); return a.map(v => v / sum);};
    const bsdf = normal(theta.map(Math.cos));
    const learned = normal(f.map((v, i) => (1-training) * (v * (.2 + 1.3 * Math.sin(i * 1.17) ** 2) + .32) + training * v));
    const mixture = learned.map((v, i) => fraction * v + (1 - fraction) * bsdf[i]);
    const integral = f.reduce((a, v) => a + v * delta, 0);
    const variance = p => Math.max(0, f.reduce((a, v, i) => a + (v * delta) ** 2 / p[i], 0) - integral ** 2);
    return {theta, f, bsdf, learned, mixture, integral, variance:variance(mixture), baseline:variance(bsdf)};
  }
  function mirrorResidual(x, cameraX) {
    const lx=.16, ly=.19, ey=.29, my=.79;
    const dl=Math.hypot(x-lx,my-ly), de=Math.hypot(x-cameraX,my-ey);
    return {value:(x-lx)/dl+(x-cameraX)/de,
      derivative:(my-ly)**2/dl**3+(my-ey)**2/de**3};
  }
  function mirrorSolve(seed, cameraX, iterations) {
    let x=seed;const history=[x];
    for(let i=0;i<iterations;i++) {
      const r=mirrorResidual(x,cameraX);
      let step=r.value/r.derivative, next=clamp(x-step,.03,.97);
      // Backtracking keeps the toy's Newton steps inside the mirror and descending.
      for(let j=0;j<14&&Math.abs(mirrorResidual(next,cameraX).value)>Math.abs(r.value);j++) {
        step*=.5;next=clamp(x-step,.03,.97);
      }
      x=next;history.push(x);
    }
    return {x,history,residual:mirrorResidual(x,cameraX).value};
  }
  function mirrorExact(cameraX) {
    // Intersect the emitter–reflected-camera segment with y=.79.
    return .16 + (cameraX-.16)*(.79-.19)/(2*.79-.29-.19);
  }
  function pointSegment(p,a,b) {
    const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;
    const t=len?clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len,0,1):0;
    const q=[a[0]+t*dx,a[1]+t*dy];
    return {distance:Math.hypot(p[0]-q[0],p[1]-q[1]),point:q};
  }
  function segmentDistance(a,b,c,d) {
    const cross=(u,v)=>u[0]*v[1]-u[1]*v[0],sub=(u,v)=>[u[0]-v[0],u[1]-v[1]];
    const ab=sub(b,a),cd=sub(d,c),ca=sub(c,a),denom=cross(ab,cd);
    if(Math.abs(denom)>1e-12){const t=cross(ca,cd)/denom,u=cross(ca,ab)/denom;if(t>=0&&t<=1&&u>=0&&u<=1)return 0;}
    return Math.min(pointSegment(a,c,d).distance,pointSegment(b,c,d).distance,pointSegment(c,a,b).distance,pointSegment(d,a,b).distance);
  }
  return {weights,splits,diskKernel,guide,mirrorResidual,mirrorSolve,mirrorExact,pointSegment,segmentDistance};
});
