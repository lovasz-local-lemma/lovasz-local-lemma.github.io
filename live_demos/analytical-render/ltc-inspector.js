(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LTCInspector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const sub = (a, b) => a.map((x, i) => x-b[i]);
  const unit = a => { const n=Math.hypot(...a); return n>1e-12?a.map(x=>x/n):[0,0,1]; };

  function halfFloat(bits) {
    const sign = bits & 0x8000 ? -1 : 1, exponent=(bits>>>10)&31, fraction=bits&1023;
    return exponent===0 ? sign*fraction*2**-24 : exponent===31 ? (fraction?NaN:sign*Infinity) : sign*(1+fraction/1024)*2**(exponent-15);
  }
  function decodeTable(base64, size) {
    const raw=atob(base64);
    if (raw.length !== size*size*8) throw new Error('Invalid LTC table dimensions');
    const values=new Float32Array(size*size*4);
    for(let i=0;i<values.length;i++) values[i]=halfFloat(raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8));
    return values;
  }
  function sampleTable(values, size, roughness, noV) {
    // Same texel-centre convention as the garage's filtered 64² textures.
    const x=clamp(roughness,.001,1)*(size-1), y=Math.sqrt(1-clamp(noV,0,1))*(size-1);
    const ix=Math.floor(x), iy=Math.floor(y), fx=x-ix, fy=y-iy;
    return [0,1,2,3].map(k=>{
      const read=(dx,dy)=>values[(Math.min(size-1,iy+dy)*size+Math.min(size-1,ix+dx))*4+k];
      return (read(0,0)*(1-fx)+read(1,0)*fx)*(1-fy)+(read(0,1)*(1-fx)+read(1,1)*fx)*fy;
    });
  }
  function edgeVector(a,b) {
    const cosine=clamp(dot(a,b),-.999999,.999999), x=Math.abs(cosine);
    const approximation=(.8543985+(.4965155+.0145206*x)*x)/(3.4175940+(4.1616724+x)*x);
    const factor=cosine>0?approximation:.5/Math.sqrt(Math.max(1-cosine*cosine,.0000001))-approximation;
    return cross(a,b).map(v=>v*factor);
  }
  function fittedFormFactor(directions) {
    const sum=[0,0,0];
    directions.forEach((a,i)=>edgeVector(a,directions[(i+1)%directions.length]).forEach((v,j)=>sum[j]+=v));
    const length=Math.hypot(...sum);
    return Math.max(0,(length*length+sum[2])/(length+1));
  }
  function evaluate(tables, input) {
    const point=input.point||[0,.002,0], normal=unit(input.normal||[0,1,0]);
    const view=unit(sub(input.camera,point)), noV=clamp(dot(normal,view),0,1);
    const projected=sub(view,normal.map(x=>x*dot(view,normal)));
    const tangent=Math.hypot(...projected)>1e-7?unit(projected):unit(cross(Math.abs(normal[1])>.86?[1,0,0]:[0,1,0],normal));
    const bitangent=unit(cross(normal,tangent)).map(x=>-x);
    const roughness=clamp(input.roughness,.001,1);
    const matrix=sampleTable(tables.matrix,tables.size,roughness,noV), amplitude=sampleTable(tables.amplitude,tables.size,roughness,noV);
    const original=input.vertices.map(v=>{const d=sub(v,point);return unit([dot(tangent,d),dot(bitangent,d),dot(normal,d)]);});
    // WGSL mat3 constructor lists columns: [m.x,0,m.y], [0,1,0], [m.z,0,m.w].
    const transformed=original.map(v=>unit([matrix[0]*v[0]+matrix[2]*v[2],v[1],matrix[1]*v[0]+matrix[3]*v[2]]));
    const frontFacing=!input.lightNormal || dot(input.lightNormal,sub(point,input.lightCenter))>0;
    const formFactor=frontFacing?fittedFormFactor(transformed):0;
    const fresnel=.04*amplitude[0]+.96*amplitude[1];
    return {point,roughness,noV,matrix,amplitude,original,transformed,formFactor,fresnel,
      response:formFactor*fresnel,frontFacing};
  }

  function mount(host, data) {
    if (!host || !data) return {update(){}};
    const tables={size:data.size,matrix:decodeTable(data.matrixBase64,data.size),amplitude:decodeTable(data.amplitudeBase64,data.size)};
    host.innerHTML=`<div class="probe-heading"><div><span class="eyebrow">LIVE · SAME LUT DATA AS THE SHADER</span><h3>A polygon changes coordinates.</h3></div><span class="probe-status">Geometric floor probe</span></div>
      <div class="probe-body"><svg class="probe-svg" viewBox="0 0 520 187" role="img" aria-label="Live emitter directions before and after the fitted LTC inverse transform"></svg>
      <div class="probe-values"><div class="probe-matrix"><span>M⁻¹ · bilinear fit</span><div data-matrix></div></div><dl><div><dt>n · v</dt><dd data-value="noV"></dd></div><div><dt>Roughness</dt><dd data-value="roughness"></dd></div><div><dt>Amplitude A / B</dt><dd data-value="amplitude"></dd></div><div><dt>Polygon factor</dt><dd data-value="formFactor"></dd></div><div><dt>F₀ = .04 response</dt><dd data-value="response"></dd></div></dl></div></div>
      <p class="probe-caption">Point (0, .002, 0), upward geometric normal, first emitter. Camera and light follow the scene; roughness follows the garage floor control (or the selected scene’s floor material). One unoccluded, isotropic GGX lobe—before normal texture, coating, visibility and tone mapping. Values use the published fit and the shader’s approximate edge/horizon evaluation; they are not a shaded-pixel readback.</p>`;
    const svg=host.querySelector('svg'), matrix=host.querySelector('[data-matrix]');
    const values=Object.fromEntries([...host.querySelectorAll('[data-value]')].map(el=>[el.dataset.value,el]));
    let last=-Infinity, lastNumbers=-Infinity, previous='', completedGeometry='';
    const project=(v,cx)=>[cx+v[0]*77+v[1]*24,126-v[2]*78+v[1]*17];
    const path=points=>points.map((p,i)=>(i?'L':'M')+p.map(x=>x.toFixed(2)).join(',')).join(' ');
    function globe(directions,cx,color,title) {
      const ring=Array.from({length:49},(_,i)=>project([Math.cos(i*Math.PI/24),Math.sin(i*Math.PI/24),0],cx));
      const arches=[0,1,2].map(j=>Array.from({length:33},(_,i)=>{const t=i*Math.PI/32,a=j*Math.PI/3;return project([Math.cos(t)*Math.cos(a),Math.cos(t)*Math.sin(a),Math.sin(t)],cx);}));
      const outline=[];directions.forEach((a,i)=>{const b=directions[(i+1)%directions.length];for(let k=0;k<15;k++)outline.push(project(unit(a.map((v,j)=>v*(1-k/15)+b[j]*k/15)),cx));});
      const projected=directions.map(d=>project(d,cx));
      return `<text x="${cx}" y="19" text-anchor="middle" fill="${color}">${title}</text><path d="${path(ring)}" class="hemisphere-grid"/>${arches.map(p=>`<path d="${path(p)}" class="hemisphere-grid"/>`).join('')}<path d="M${cx},129V39" class="probe-axis"/><path d="${path(outline)}Z" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-width="1.5"/>${projected.map((p,i)=>`<path d="M${cx},126L${p[0]},${p[1]}" stroke="${color}" stroke-opacity=".3"/><circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${color}"/><text x="${p[0]+6}" y="${p[1]-5}" fill="${color}" class="vertex-label">${i+1}</text>`).join('')}<circle cx="${cx}" cy="126" r="3" fill="#f5e5b9"/>`;
    }
    function update(input,now=performance.now()) {
      // An independently animated atmosphere does not change this surface probe.
      // Cache only complete readouts, so pausing still flushes final geometry edits.
      const geometryKey=JSON.stringify([input.sceneId,input.roughness,input.camera,input.point,input.normal,input.vertices,input.lightNormal,input.lightCenter]);
      if(geometryKey===completedGeometry)return;
      const stateKey=[input.roughness,input.sceneId].join(':');
      // Animated geometry refreshes at about 30 Hz; paused edits always land,
      // including the last pointer event before rendering becomes idle.
      if(input.animate && now-last<30 && previous===stateKey)return;
      last=now; previous=stateKey;
      if (!input.vertices?.length) return;
      const result=evaluate(tables,input);
      svg.innerHTML=globe(result.original,118,'#edc98c','01 · BRDF coordinates')+globe(result.transformed,398,'#8edbcd','02 · Cosine coordinates')+
        '<path d="M225 94H287m-7-5 7 5-7 5" class="transform-arrow"/><text x="256" y="77" text-anchor="middle" class="transform-label">M⁻¹</text><text x="118" y="174" text-anchor="middle" class="diagram-caption">same light · spherical directions</text><text x="398" y="174" text-anchor="middle" class="diagram-caption">transformed polygon · edge sum</text>';
      if (input.animate && now-lastNumbers<90 && previous===stateKey) return;
      lastNumbers=now;
      const m=result.matrix, format=x=>Math.abs(x)<.00005?'0':Math.abs(x)>=100?x.toExponential(1):x.toFixed(3);
      matrix.innerHTML=[m[0],0,m[2],0,1,0,m[1],0,m[3]].map(x=>`<span>${format(x)}</span>`).join('');
      values.noV.textContent=result.noV.toFixed(3); values.roughness.textContent=result.roughness.toFixed(3);
      values.amplitude.textContent=result.amplitude.slice(0,2).map(format).join(' / ');
      values.formFactor.textContent=result.formFactor.toFixed(4);values.response.textContent=result.response.toFixed(5);
      host.dataset.probe=JSON.stringify({roughness:result.roughness,noV:result.noV,matrix:m,amplitude:result.amplitude,formFactor:result.formFactor,response:result.response});
      completedGeometry=geometryKey;
    }
    return {update};
  }
  return {halfFloat,decodeTable,sampleTable,edgeVector,fittedFormFactor,evaluate,mount};
});
