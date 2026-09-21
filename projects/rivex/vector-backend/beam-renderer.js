/** Draw evaluated Rive contours as an analogue beam, before any rasterization.
 * Input paths are in 720 × 480 device coordinates; the capture stage owns clipping.
 */
const WIDTH = 720, HEIGHT = 480;
const MAX_CONTOURS = 2048, MAX_SEGMENTS = 32000;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finiteOption = (value, fallback) => Number.isFinite(value) ? value : fallback;

const FULLSCREEN = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const DECAY = `#version 300 es
precision highp float;
uniform sampler2D previous;
uniform float retain;
in vec2 uv; out vec4 colour;
void main() { colour = texture(previous, uv) * retain; }
`;
const BEAM_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec4 endpoints;
layout(location=1) in vec4 weights;
uniform float sigma;
out vec2 local;
flat out float segmentLength;
flat out vec3 energy;
void main() {
  vec2 delta = endpoints.zw - endpoints.xy;
  float len = max(length(delta), 0.0001);
  vec2 tangent = delta / len, normal = vec2(-tangent.y, tangent.x);
  float pad = sigma * 4.5;
  int corner = gl_VertexID;
  bool right = corner == 1 || corner == 2 || corner == 4;
  bool lower = corner == 2 || corner == 4 || corner == 5;
  local = vec2(right ? len + pad : -pad, lower ? pad : -pad);
  vec2 p = endpoints.xy + tangent * local.x + normal * local.y;
  gl_Position = vec4(p.x / 360.0 - 1.0, 1.0 - p.y / 240.0, 0.0, 1.0);
  segmentLength = len;
  energy = vec3(weights.x * (1.0-weights.y), weights.x * weights.y, weights.x * weights.z);
}`;
const BEAM_FRAGMENT = `#version 300 es
precision highp float;
uniform float sigma, deposit, storageScale;
in vec2 local;
flat in float segmentLength;
flat in vec3 energy;
out vec4 colour;
float erfApprox(float x) {
  float a = abs(x);
  float t = 1.0 + a*(0.278393 + a*(0.230389 + a*(0.000972 + a*0.078108)));
  t *= t;
  return sign(x) * (1.0 - 1.0/(t*t));
}
void main() {
  float invSigma = 1.0 / (1.41421356237 * sigma);
  float along = erfApprox(local.x * invSigma) - erfApprox((local.x-segmentLength) * invSigma);
  float across = exp(-0.5 * local.y*local.y / (sigma*sigma));
  // The finite-segment integral times arc-length dwell. Unlike one spot per
  // vertex, splitting a straight segment does not change the deposited light.
  float value = max(along, 0.0) * 0.5 * across * deposit * storageScale;
  colour = vec4(energy * value, 0.0);
}`;
const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D phosphor;
uniform vec3 tint;
uniform float storageScale;
in vec2 uv; out vec4 colour;
vec3 sampleEnergy(vec2 p) { return texture(phosphor, clamp(p, vec2(0),vec2(1))).rgb / storageScale; }
void main() {
  vec3 e = sampleEnergy(uv);
  vec2 d = vec2(3.0/720.0, 3.0/480.0);
  vec3 halo = (sampleEnergy(uv+vec2(d.x,0))+sampleEnergy(uv-vec2(d.x,0))
             +sampleEnergy(uv+vec2(0,d.y))+sampleEnergy(uv-vec2(0,d.y))) * 0.25;
  d *= 2.0;
  halo += (sampleEnergy(uv+d)+sampleEnergy(uv-d)
          +sampleEnergy(uv+vec2(d.x,-d.y))+sampleEnergy(uv+vec2(-d.x,d.y))) * 0.09;
  float body = 1.0-exp(-1.5*e.r);
  vec3 light = tint*body + tint*(1.0-exp(-halo.r))*0.22;
  light = mix(light, vec3(0.93,1.0,0.95), smoothstep(1.6,4.5,e.r)*0.88);
  light += vec3(1.0,0.55,0.15)*(1.0-exp(-e.g*1.4));
  light = mix(light, vec3(1.0,0.86,0.39), clamp(1.0-exp(-e.b),0.0,0.8));
  vec2 q = uv - 0.5;
  float vignette = 1.0-0.33*smoothstep(0.3,0.7,length(q));
  vec3 face = vec3(0.007,0.014,0.015)*vignette;
  colour = vec4(clamp(face+light*vignette,0.0,1.0),1.0);
}`;

function program(gl, vertex, fragment) {
  const shaders = [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]].map(([type, source]) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader);
      throw new Error(`Beam shader: ${message}`);
    }
    return shader;
  });
  const value = gl.createProgram();
  shaders.forEach(shader => gl.attachShader(value, shader)); gl.linkProgram(value);
  shaders.forEach(shader => gl.deleteShader(shader));
  if (!gl.getProgramParameter(value, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(value); gl.deleteProgram(value);
    throw new Error(`Beam pipeline: ${message}`);
  }
  return { value, uniform: Object.fromEntries(Array.from({ length: gl.getProgramParameter(value, gl.ACTIVE_UNIFORMS) }, (_, i) => {
    const name = gl.getActiveUniform(value, i).name;
    return [name, gl.getUniformLocation(value, name)];
  })) };
}

function chainContours(contours, options) {
  const segments = [];
  let length = 0, travelLength = 0, contourCount = 0, droppedContours = 0, limited = false, invalid = 0;
  let previous = null;
  const append = (a, b, alpha, travel, selected) => {
    const distance = Math.hypot(b[0]-a[0], b[1]-a[1]);
    if (distance < 0.0001) return;
    if (segments.length >= MAX_SEGMENTS) { limited = true; return; }
    segments.push({ a, b, start: length, end: length+distance, distance, alpha, travel, selected });
    length += distance;
    if (travel) travelLength += distance;
  };
  for (const contour of contours) {
    if (options.isolate && options.selected != null && contour.id !== options.selected) continue;
    const alpha = clamp(finiteOption(contour.alpha, 1), 0, 1);
    if (!alpha) continue;
    if (contourCount >= MAX_CONTOURS || limited) { droppedContours++; continue; }
    const points = contour.points;
    if (!points?.length) continue;
    if (!points.every(p => p?.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))) { invalid++; continue; }
    if (points.length < 2) continue;
    contourCount++;
    if (previous) append(previous, points[0], 0.045, true, false);
    const selected = options.selected != null && contour.id === options.selected;
    for (let i = 1; i < points.length && !limited; i++) append(points[i-1], points[i], alpha, false, selected);
    if (contour.closed && !limited) append(points[points.length-1], points[0], alpha, false, selected);
    previous = contour.closed ? points[0] : points[points.length-1];
  }
  return { segments, length, travelLength, contourCount, droppedContours, limited, invalid };
}

/** Rendering is independent of the Rive loader; callers may feed captured or saved paths. */
export function createBeamRenderer(canvas) {
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('The vector beam renderer requires WebGL2.');
  const floatSupported = !!gl.getExtension('EXT_color_buffer_float');
  const decay = program(gl, FULLSCREEN, DECAY);
  const beam = program(gl, BEAM_VERTEX, BEAM_FRAGMENT);
  const composite = program(gl, FULLSCREEN, COMPOSITE);
  const fullVAO = gl.createVertexArray(), beamVAO = gl.createVertexArray(), instanceBuffer = gl.createBuffer();
  gl.bindVertexArray(beamVAO); gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  for (let index = 0; index < 2; index++) {
    gl.enableVertexAttribArray(index); gl.vertexAttribPointer(index, 4, gl.FLOAT, false, 32, index*16); gl.vertexAttribDivisor(index, 1);
  }
  const targets = [];
  let floatBuffer = floatSupported;
  function allocateTargets(useFloat) {
    for (let i = 0; i < 2; i++) {
      const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, useFloat ? gl.RGBA16F : gl.RGBA8, WIDTH, HEIGHT, 0, gl.RGBA, useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      targets.push({ texture, framebuffer });
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return false;
    }
    return true;
  }
  if (!allocateTargets(floatBuffer)) {
    targets.forEach(t => { gl.deleteFramebuffer(t.framebuffer); gl.deleteTexture(t.texture); }); targets.length = 0;
    floatBuffer = false;
    if (!allocateTargets(false)) throw new Error('The browser cannot create the beam history buffer.');
  }
  const storageScale = floatBuffer ? 1 : 1/8;
  const instanceData = new Float32Array((MAX_SEGMENTS*2+4)*8);
  let phase = 0, read = 0, disposed = false, initialized = false;
  const tints = { green: [0.12,0.95,0.38], amber: [1,0.58,0.13], ice: [0.35,0.80,1] };

  function clear() {
    if (disposed) return;
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
    targets.forEach(t => { gl.bindFramebuffer(gl.FRAMEBUFFER, t.framebuffer); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    phase = 0; read = 0; initialized = false;
  }

  function draw(contours, dt = 1/60, options = {}) {
    if (disposed) throw new Error('The vector beam renderer has been disposed.');
    if (gl.isContextLost()) throw new Error('The vector beam GPU context was lost. Reset the demo to restore it.');
    const path = chainContours(contours, options);
    const radius = clamp(finiteOption(options.radius, 1.1), 0.3, 10);
    const persistence = clamp(finiteOption(options.persistence, 0.35), 0.01, 8);
    const strength = clamp(finiteOption(options.strength, 1.2), 0, 8);
    const speed = clamp(finiteOption(options.speed, 0.35), 0, 12);
    const coverage = clamp(finiteOption(options.coverage, 0.65), 0.005, 1);
    // Inactive tabs are suspended by the host. A long gap fades rather than
    // depositing a giant catch-up flash when they are resumed.
    const elapsed = clamp(finiteOption(dt, 1/60), 0, 1);
    if (options.playing !== false) phase = (phase + speed*elapsed) % 1;
    const decayTime = initialized ? elapsed : Math.max(elapsed, 1/60);
    const retain = Math.exp(-decayTime/persistence);
    const deposit = 2.8 * strength * (1-retain);
    const start = phase*path.length, stop = start+coverage*path.length;
    const windows = stop > path.length ? [[start,path.length],[0,stop-path.length]] : [[start,stop]];
    let activeSegments = 0, head = [0,0], headBlanked = false;
    const emit = (s, a, b) => {
      if (s.travel && !options.showTravel) return;
      const u = (a-s.start)/s.distance, v = (b-s.start)/s.distance;
      const dx = s.b[0]-s.a[0], dy = s.b[1]-s.a[1];
      const offset = activeSegments++*8;
      instanceData.set([s.a[0]+u*dx,s.a[1]+u*dy,s.a[0]+v*dx,s.a[1]+v*dy,s.alpha,s.travel?1:0,s.selected?1:0,0], offset);
    };
    for (const s of path.segments) {
      if (start >= s.start && start < s.end) {
        const t = (start-s.start)/s.distance;
        head = [s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t]; headBlanked = s.travel;
      }
      for (const [a,b] of windows) {
        const lo = Math.max(a,s.start), hi = Math.min(b,s.end);
        if (hi-lo > 0.0001) emit(s,lo,hi);
      }
    }
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0,0,WIDTH,HEIGHT); gl.activeTexture(gl.TEXTURE0);
    const write = 1-read;
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[write].framebuffer); gl.disable(gl.BLEND);
    gl.bindVertexArray(fullVAO); gl.useProgram(decay.value);
    gl.bindTexture(gl.TEXTURE_2D,targets[read].texture); gl.uniform1i(decay.uniform.previous,0); gl.uniform1f(decay.uniform.retain,retain);
    gl.drawArrays(gl.TRIANGLES,0,3);
    if (activeSegments && deposit > 0) {
      gl.bindVertexArray(beamVAO); gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,instanceData.subarray(0,activeSegments*8),gl.DYNAMIC_DRAW);
      gl.useProgram(beam.value); gl.uniform1f(beam.uniform.sigma,radius); gl.uniform1f(beam.uniform.deposit,deposit); gl.uniform1f(beam.uniform.storageScale,storageScale);
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE,gl.ONE);
      gl.drawArraysInstanced(gl.TRIANGLES,0,6,activeSegments); gl.disable(gl.BLEND);
    }
    read = write; initialized = true;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.bindVertexArray(fullVAO); gl.useProgram(composite.value);
    gl.bindTexture(gl.TEXTURE_2D,targets[read].texture); gl.uniform1i(composite.uniform.phosphor,0);
    gl.uniform3fv(composite.uniform.tint,tints[options.colour] || tints.green); gl.uniform1f(composite.uniform.storageScale,storageScale);
    gl.drawArrays(gl.TRIANGLES,0,3); gl.bindVertexArray(null);
    const warnings = [];
    if (path.limited || path.droppedContours) warnings.push(`Beam preview limited to ${MAX_SEGMENTS.toLocaleString()} segments / ${MAX_CONTOURS.toLocaleString()} contours.`);
    if (path.invalid) warnings.push(`${path.invalid} invalid contours skipped.`);
    if (!floatBuffer) warnings.push('8-bit linear history fallback; faint persistence may quantize.');
    return { segments:path.segments.length, activeSegments, length:path.length, travelLength:path.travelLength, contours:path.contourCount, head, headBlanked, phase, floatBuffer, warning:warnings.join(' '), limited:path.limited || path.droppedContours>0 };
  }

  function dispose() {
    if (disposed) return;
    targets.forEach(t => { gl.deleteFramebuffer(t.framebuffer); gl.deleteTexture(t.texture); });
    [decay,beam,composite].forEach(p => gl.deleteProgram(p.value));
    gl.deleteBuffer(instanceBuffer); gl.deleteVertexArray(beamVAO); gl.deleteVertexArray(fullVAO); disposed = true;
  }
  clear();
  return { draw, clear, dispose, width:WIDTH, height:HEIGHT, floatBuffer };
}
