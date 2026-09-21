(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PhotonFrontierMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // A controlled two-scatter path model. This module describes its geometry
  // and constraint measure; it does not supply a full radiative-transfer law.
  const TAU = 2 * Math.PI;
  const add = (a,b) => a.map((v,i) => v+b[i]);
  const sub = (a,b) => a.map((v,i) => v-b[i]);
  const mul = (a,s) => a.map(v => v*s);
  const dot = (a,b) => a.reduce((v,x,i) => v+x*b[i],0);
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const length = a => Math.hypot(...a);
  const unit = a => mul(a,1/length(a));
  const modAngle = a => ((a%TAU)+TAU)%TAU;
  const axis = [0,0,1];

  function model(p) {
    const ct=Math.cos(p.theta1), st=Math.sin(p.theta1), cp=Math.cos(p.phi1), sp=Math.sin(p.phi1);
    const v1=[st*cp,st*sp,ct],eTheta=[ct*cp,ct*sp,-st],ePhi=[-sp,cp,0];
    const radial=add(mul(eTheta,Math.cos(p.phi2)),mul(ePhi,Math.sin(p.phi2)));
    const v2=add(mul(v1,Math.cos(p.theta2)),mul(radial,Math.sin(p.theta2)));
    const b=mul(v1,p.t1), x=add(b,mul(v2,p.t2));
    return {b,c:v2,x,v1,v2,eTheta,ePhi};
  }

  function point(mode,p,phi,t) {
    if(mode==='cylinder') return model({...p,phi2:phi,t1:t}).x;
    if(mode==='cone') return model({...p,phi2:phi,t2:t}).x;
    if(mode==='hyperboloid') return model({...p,phi1:phi,t2:t}).x;
    throw new Error('Unknown primitive family: '+mode);
  }

  function jacobians(p,d) {
    const m=model(p), spin2=mul(cross(m.v1,m.v2),p.t2), spin1=cross(axis,m.x);
    return [Math.abs(dot(cross(m.v1,spin2),d)),
      Math.abs(dot(cross(m.v2,spin2),d)),Math.abs(dot(cross(m.v2,spin1),d))];
  }

  function densities(p,d,{lo=.2,hi=3}={}) {
    if(!(hi>lo)||p.t1<lo||p.t1>hi||p.t2<lo||p.t2>hi) return [0,0,0];
    // Each technique samples one residual distance uniformly and one residual
    // azimuth uniformly. Enumerating all isolated roots requires no 1/nRoots.
    const pdf=1/((hi-lo)*TAU);
    return jacobians(p,d).map(j=>j*pdf);
  }
  function balance(p,d,domain) {
    const q=densities(p,d,domain),sum=q.reduce((a,b)=>a+b,0);
    return sum>0?q.map(x=>x/sum):[0,0,0];
  }

  function planePoint(p,t1,t2) {
    const m=model(p);return add(mul(m.v1,t1),mul(m.v2,t2));
  }
  function planeJacobian(p,d) {
    const m=model(p);return Math.abs(dot(cross(m.v1,m.v2),d));
  }
  function planeIntersections(p,o,d,lo=.2,hi=3) {
    if(!(hi>=lo)||!o.concat(d).every(Number.isFinite)||dot(d,d)<1e-24)return [];
    const m=model(p),negative=mul(d,-1),det=dot(m.v1,cross(m.v2,negative));
    // No isolated root for a rank-deficient distance-distance chart.
    if(Math.abs(det)<1e-13*Math.sqrt(dot(d,d)))return [];
    const t1=dot(o,cross(m.v2,negative))/det;
    const t2=dot(m.v1,cross(o,negative))/det;
    const s=dot(m.v1,cross(m.v2,o))/det;
    if(![t1,t2,s].every(Number.isFinite)||s<=1e-9||t1<lo-1e-9||t1>hi+1e-9||t2<lo-1e-9||t2>hi+1e-9)return [];
    return [{s,t1,t2,point:planePoint(p,t1,t2),jacobian:Math.abs(det)}];
  }
  function atlasBalance(p,d,{lo=.2,hi=3,planeShare=.1}={}) {
    if(!(planeShare>=0&&planeShare<=1))throw new Error('Invalid plane allocation');
    const q=densities(p,d,{lo,hi}).map(v=>v*(1-planeShare)/3);
    // The plane samples TWO angles, unlike the other charts' angle/distance.
    const valid=hi>lo&&p.t1>=lo&&p.t1<=hi&&p.t2>=lo&&p.t2<=hi;
    q.push(valid?planeShare*planeJacobian(p,d)/(TAU*TAU):0);
    const sum=q.reduce((a,b)=>a+b,0);return sum>0?q.map(v=>v/sum):[0,0,0,0];
  }

  function quadratic(A,B,C) {
    const scale=Math.max(Math.abs(A),Math.abs(B),Math.abs(C));
    if(!Number.isFinite(scale)||scale===0) return [];
    A/=scale;B/=scale;C/=scale;
    if(Math.abs(A)<1e-14) return Math.abs(B)>1e-14?[-C/B]:[];
    let discriminant=B*B-4*A*C;
    const tolerance=8*Number.EPSILON*(B*B+Math.abs(4*A*C));
    if(discriminant < -tolerance) return [];
    discriminant=Math.max(0,discriminant);
    const r=Math.sqrt(discriminant);
    if(r===0) return [-B/(2*A)];
    const q=-.5*(B+(B>=0?r:-r));
    return [q/A,C/q].sort((a,b)=>a-b);
  }

  // Describe X(phi,t)=O + R_axis(phi)(B+tV) in a right-handed local frame.
  function chart(mode,p) {
    const m=model(p);
    if(mode==='hyperboloid') {
      const z=model({...p,phi1:0});
      return {O:[0,0,0],U:[1,0,0],W:[0,1,0],A:axis,B:z.b,V:z.v2};
    }
    if(mode==='cone') return {O:m.b,U:m.eTheta,W:m.ePhi,A:m.v1,B:[0,0,0],V:[Math.sin(p.theta2),0,Math.cos(p.theta2)]};
    if(mode==='cylinder') return {O:[0,0,0],U:m.eTheta,W:m.ePhi,A:m.v1,B:[p.t2*Math.sin(p.theta2),0,p.t2*Math.cos(p.theta2)],V:[0,0,1]};
    throw new Error('Unknown primitive family: '+mode);
  }

  function intersections(mode,p,o,d,lo=.2,hi=3) {
    if(!(hi>=lo)||!o.concat(d).every(Number.isFinite)||dot(d,d)<1e-24) return [];
    const k=chart(mode,p),local=v=>[dot(v,k.U),dot(v,k.W),dot(v,k.A)];
    const r0=local(sub(o,k.O)),v=local(d),B=k.B,V=k.V;
    // Move the polynomial's origin to the camera line's nearest point to O.
    // This prevents distant cameras from subtracting nearly equal B² and 4AC.
    const shift=-dot(r0,v)/dot(v,v),r=add(r0,mul(v,shift));
    const pairs=[];
    if(Math.abs(V[2])<1e-12) {
      // A generator perpendicular to the revolution axis sweeps a planar
      // annulus. The same point can have two valid t/phi preimages: keep both.
      if(Math.abs(v[2])<1e-12) return [];
      const s=(B[2]-r[2])/v[2],q=add(r,mul(v,s));
      for(const t of quadratic(V[0]*V[0]+V[1]*V[1],2*(B[0]*V[0]+B[1]*V[1]),B[0]*B[0]+B[1]*B[1]-q[0]*q[0]-q[1]*q[1])) pairs.push({s,t});
    } else {
      const vz=V[2],wx=vz*B[0]+(r[2]-B[2])*V[0],wy=vz*B[1]+(r[2]-B[2])*V[1];
      const rr=V[0]*V[0]+V[1]*V[1];
      const A=vz*vz*(v[0]*v[0]+v[1]*v[1])-v[2]*v[2]*rr;
      const BB=2*(vz*vz*(r[0]*v[0]+r[1]*v[1])-v[2]*(wx*V[0]+wy*V[1]));
      const C=vz*vz*(r[0]*r[0]+r[1]*r[1])-wx*wx-wy*wy;
      for(const s of quadratic(A,BB,C)) pairs.push({s,t:(r[2]+s*v[2]-B[2])/vz});
    }
    const results=[],index={cylinder:0,cone:1,hyperboloid:2}[mode];
    for(const pair of pairs) {
      const {t}=pair,s=pair.s+shift;
      if(!Number.isFinite(s)||!Number.isFinite(t)||s<=1e-9||t<lo-1e-9||t>hi+1e-9) continue;
      const q=add(r,mul(v,pair.s)),g=add(B,mul(V,t));
      if(Math.hypot(q[0],q[1])<1e-11||Math.hypot(g[0],g[1])<1e-11) continue;
      const phi=modAngle(Math.atan2(q[1],q[0])-Math.atan2(g[1],g[0]));
      const x=point(mode,p,phi,t),ray=add(o,mul(d,s));
      if(length(sub(x,ray))>1e-7*(1+length(ray))) continue;
      const path=mode==='cylinder'?{...p,phi2:phi,t1:t}:mode==='cone'?{...p,phi2:phi,t2:t}:{...p,phi1:phi,t2:t};
      const jacobian=jacobians(path,d)[index];
      if(!Number.isFinite(jacobian)) continue;
      // Preserve distinct parameter preimages, even if they meet one ray point.
      if(results.some(h=>Math.abs(h.s-s)<1e-9&&Math.abs(h.t-t)<1e-9)) continue;
      results.push({s,t,phi,point:x,jacobian});
    }
    return results.sort((a,b)=>a.s-b.s||a.t-b.t);
  }
  return {TAU,model,point,sweeps:point,jacobians,densities,balance,intersections,
    planePoint,planeJacobian,planeIntersections,atlasBalance,
    add,sub,mul,dot,cross,length,unit,quadratic};
});
