import {dielectricRings} from './dielectric-rings.js';
import {createReference} from "./reference.js";
window.rivxHostVisible=true;
(async function(){
  var stat = document.getElementById('stat'), err = document.getElementById('err');
  function fail(m){ err.hidden=false;err.textContent=m;stat.textContent='failed';document.body.dataset.error=m;document.getElementById('loading').hidden=true; }
  const cache=new URLSearchParams(location.search).get('cache')==='compact'?'compact':'full';
  const path=cache==='compact'?'compact.rivx':'../../../live_demos/rivex/exports/retained-caustic-splats.rivx';
  document.getElementById('cache').value=cache;
  const response=await fetch(path);if(!response.ok)throw Error('Record download failed: '+response.status);
  const buf=await response.arrayBuffer(),u8=new Uint8Array(buf),bin={length:buf.byteLength,substr:(start,n)=>new TextDecoder().decode(u8.slice(start,start+n))};
  // ---- the record: "RIVX3D" + u32 version + 8 f32 (yaw pitch dist tx ty tz tofMin tofMax)
  //      + u32 count = 46 bytes, then sections of (u32 id, u32 byteSize, payload).
  //      id 1 = splats, 15 f32 each: px py pz sx sy sz qx qy qz qw r g b a tof.
  //      id 3 = manifolds (85 B each), id 4 = occluders (29 B each) -- counted, not drawn yet.
  if (bin.length < 46 || bin.substr(0, 6) !== 'RIVX3D') { fail('Not a RIVX3D record.'); return; }
  var dv = new DataView(buf);
  var H = { yaw: dv.getFloat32(10, true), pitch: dv.getFloat32(14, true), dist: dv.getFloat32(18, true),
            target:[dv.getFloat32(22,true),dv.getFloat32(26,true),dv.getFloat32(30,true)], tofMin: dv.getFloat32(34, true), tofMax: dv.getFloat32(38, true), count: dv.getUint32(42, true) };
  var sceneOccluders = [], tags=null;
  var S = null, nMani = 0, nOcc = 0, off = 46, MOFF = 0, MSZ = 0;
  while (off + 8 <= bin.length) {
    var id = dv.getUint32(off, true), sz = dv.getUint32(off + 4, true), p0 = off + 8;
    if (p0 + sz > bin.length) break;
    if (id === 1) S = new Float32Array(buf.slice(p0, p0 + sz));      // slice: 4-byte alignment
    else if(id===2) tags=new Uint8Array(buf.slice(p0,p0+sz));
    else if (id === 3) { nMani = Math.floor(sz / 85); MOFF = p0; MSZ = sz; }
    else if (id === 4) { nOcc = Math.floor(sz / 29);
      for(var oi=0;oi<nOcc;oi++){var ob=p0+oi*29,oc=[dv.getUint8(ob)];for(var ok=0;ok<7;ok++)oc.push(dv.getFloat32(ob+1+ok*4,true));sceneOccluders.push(oc);}
    }
    off = p0 + sz;
  }
  if (!S || S.length < 15) { fail('The record has no splat section.'); return; }
  var N = Math.min(H.count, Math.floor(S.length / 15));
  // ---- manifolds: 85 bytes each = u8 form + 21 f32 (c, u, v, p0, p1, r g b alpha, blur, tof).
  //      form 0 EllipseOutline, 1 EllipseFill, 2 Segment, 3 Quad. Decoded once into
  //      per-instance attributes; the ring geometry itself is built in the vertex shader.
  var MF = new Float32Array(nMani * 16), MT = new Float32Array(nMani), MA = new Float32Array(nMani);
  var MBLUR = 0.0, nOutline = 0, nFillQ = 0;
  for (var mi = 0; mi < nMani; mi++) {
    var mb = MOFF + mi * 85, form = dv.getUint8(mb), q = mb + 1;
    function f(k){ return dv.getFloat32(q + 4 * k, true); }
    var o = mi * 16;
    if (form === 2) { MF[o] = f(9); MF[o+1] = f(10); MF[o+2] = f(11);          // p0 as the centre
      MF[o+3] = f(12) - f(9); MF[o+4] = f(13) - f(10); MF[o+5] = f(14) - f(11); // u = p1 - p0
      MF[o+6] = 0; MF[o+7] = 0; MF[o+8] = 0; }
    else { for (var k = 0; k < 9; k++) MF[o + k] = f(k); }
    MF[o+9] = f(15); MF[o+10] = f(16); MF[o+11] = f(17); MF[o+12] = form;
    MA[mi] = f(18); MT[mi] = f(20); MBLUR = Math.max(MBLUR, f(19));
    if (form === 0 || form === 2) nOutline++; else nFillQ++;
  }
  var clockMin=H.tofMin,clockMax=H.tofMax,span = Math.max(clockMax - clockMin, 1e-6);
  const nativeRings={MF,MT,MA,nMani,nOutline,nFillQ};let analyticRings=false,analyticPaths=[];
  // ---- GL ----
  var cv = document.getElementById('cv');
  var gl = cv.getContext('webgl2', { premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true });
  if (!gl) { fail('WebGL2 is not available in this browser.'); return; }
  function sh(t, src){ var o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
  var prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 iCRA;
layout(location=2) in vec3 iColor;
layout(location=3) in vec2 iRT;
uniform vec2 uViewport;
out vec2 vEll; out vec3 vColor; out float vAlpha;
void main(){
  vec2 loc = vec2(aCorner.x * iCRA.z, aCorner.y * iRT.x);
  float c = cos(iRT.y), s = sin(iRT.y);
  vec2 off = vec2(loc.x * c - loc.y * s, loc.x * s + loc.y * c);
  vec2 px = iCRA.xy + off;
  vec2 clip = vec2(px.x / uViewport.x * 2.0 - 1.0, 1.0 - px.y / uViewport.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vEll = aCorner; vColor = iColor; vAlpha = iCRA.w;
}
`));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
uniform float uExposure;
in vec2 vEll; in vec3 vColor; in float vAlpha;
out vec4 frag;
void main(){
  float r2 = dot(vEll, vEll);
  if (r2 > 1.0) discard;
  float g = exp(-4.0 * r2);
  const float edge = 0.018315639;
  float a = max(g - edge, 0.0) / (1.0 - edge) * vAlpha;
  frag = vec4(vColor * uExposure * a, a);
}
`));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { fail('Shader link failed: ' + gl.getProgramInfoLog(prog)); return; }
  var uViewport = gl.getUniformLocation(prog, 'uViewport');
  // ---- the manifold programs. RIBBON: one instance per outline/segment, 2*(SEG+1) vertices,
  //      each vertex = a sample of the world ring (or the segment's two ends) projected through
  //      the camera and pushed sideways by the stroke half-width plus the feather reach. A
  //      sample behind the near plane, or next to one, collapses and flags vKill so the
  //      fragment stage drops the triangle: the native splits runs at the same condition.
  //      FAN: fills and quads as a triangle fan of projected rim points.
  var SEG = 64;
  var mvs = `#version 300 es
precision highp float;
layout(location=0) in float aIdx;
layout(location=1) in vec3 iC; layout(location=2) in vec3 iU; layout(location=3) in vec3 iV;
layout(location=4) in vec3 iRGB; layout(location=5) in float iForm; layout(location=6) in vec3 iSupport;
uniform float uKernelWidth;
uniform mat4 uVP; uniform vec2 uViewport; uniform float uReach; uniform sampler2D uAlpha; uniform int uSeg;
out vec3 vColor; out float vAlpha; out float vAcross; out float vKill; out float vSupport;
vec3 pt(int i){ if (iForm == 2.0) return (i == 0) ? iC : iC + iU;
  float t = 6.2831853 * float(i) / float(uSeg); return iC + iU * cos(t) + iV * sin(t); }
vec2 px(vec4 c){ vec2 n = c.xy / c.w; return vec2((n.x * 0.5 + 0.5) * uViewport.x, (1.0 - (n.y * 0.5 + 0.5)) * uViewport.y); }
void main(){
  int k = int(aIdx); int i = k / 2; float side = (k - 2 * i == 0) ? 1.0 : -1.0;
  int n = (iForm == 2.0) ? 2 : uSeg + 1;
  vColor = iRGB; vAcross = side; vKill = 0.0;
  float angle = 6.2831853 * float(i) / float(uSeg) - iSupport.x;
  float theta=acos(clamp(iSupport.y*iSupport.y+(1.-iSupport.y*iSupport.y)*cos(angle),-1.,1.));
  vSupport=iSupport.z>.5?exp(-.5*pow(theta/max(uKernelWidth,.0001),2.)):1.;
  vAlpha = texelFetch(uAlpha, ivec2(gl_InstanceID & 255, gl_InstanceID >> 8), 0).r;
  if (i >= n) { gl_Position = vec4(0.0, 0.0, 0.0, 0.0); vKill = 1.0; return; }
  int is = (iForm == 2.0) ? i : (i - (i / uSeg) * uSeg);          // the closing vertex repeats sample 0
  vec4 c0 = uVP * vec4(pt(is), 1.0);
  vec4 cm, cp;
  if (iForm == 2.0) { cm = uVP * vec4(pt(0), 1.0); cp = uVP * vec4(pt(1), 1.0); }
  else { cm = uVP * vec4(pt((is + uSeg - 1) - ((is + uSeg - 1) / uSeg) * uSeg), 1.0); cp = uVP * vec4(pt((is + 1) - ((is + 1) / uSeg) * uSeg), 1.0); }
  if (c0.w < 0.05 || cm.w < 0.05 || cp.w < 0.05) { gl_Position = vec4(0.0, 0.0, 0.0, 0.0); vKill = 1.0; return; }
  vec2 p0 = px(c0), tng = px(cp) - px(cm);
  float tl = length(tng); vec2 nrm = tl > 1e-6 ? vec2(-tng.y, tng.x) / tl : vec2(0.0, 0.0);
  vec2 p = p0 + nrm * side * uReach;
  gl_Position = vec4(p.x / uViewport.x * 2.0 - 1.0, 1.0 - p.y / uViewport.y * 2.0, 0.0, 1.0);
}`;
  var mfs = `#version 300 es
precision highp float;
in vec3 vColor; in float vAlpha; in float vAcross; in float vKill; in float vSupport;
uniform float uExposure;
uniform float uHalfW; uniform float uSigma; uniform float uReach;
uniform int uSupportMode; uniform vec3 uTint;
out vec4 frag;
void main(){
  if (vKill > 0.001) discard;
  float d = abs(vAcross) * uReach;
  float cov = 1.0 - smoothstep(uHalfW - 1.5 * uSigma, uHalfW + 1.5 * uSigma, d);
  float a = cov * vAlpha * (uSupportMode==1?vSupport:1.); if (a <= 0.0) discard;
  frag = vec4(vColor * uTint * uExposure * a, a);
}`;
  var fvs = `#version 300 es
precision highp float;
layout(location=0) in float aIdx;
layout(location=1) in vec3 iC; layout(location=2) in vec3 iU; layout(location=3) in vec3 iV;
layout(location=4) in vec3 iRGB; layout(location=5) in float iForm; layout(location=6) in vec3 iSupport;
uniform mat4 uVP; uniform vec2 uViewport; uniform sampler2D uAlpha;
out vec3 vColor; out float vAlpha; out float vAcross; out float vKill; out float vSupport;
void main(){
  int i = int(aIdx); vColor = iRGB; vAcross = 0.0; vKill = 0.0; vSupport=1.;
  vAlpha = texelFetch(uAlpha, ivec2(gl_InstanceID & 255, gl_InstanceID >> 8), 0).r;
  vec3 w;
  if (iForm == 3.0) { int c = (i - 1); if (c < 0) c = 0; if (c > 3) c = 3;
    vec3 su = (c == 1 || c == 2) ? iU : -iU; vec3 sv = (c >= 2) ? iV : -iV; w = (i == 0) ? iC : iC + su + sv;
    if (i > 5) { gl_Position = vec4(0.0); vKill = 1.0; return; } }
  else { if (i == 0) w = iC; else { float t = 6.2831853 * float(i - 1) / 48.0; w = iC + iU * cos(t) + iV * sin(t); } }
  vec4 c0 = uVP * vec4(w, 1.0);
  if (c0.w < 0.05) { gl_Position = vec4(0.0); vKill = 1.0; return; }
  vec2 n = c0.xy / c0.w; gl_Position = vec4(n.x, n.y, 0.0, 1.0);
}`;
  function mkProg(v, f){ var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, v));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, f)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr)); return pr; }
  var mprog = null, fprog = null, mvao = null, fvao = null, alphaTex = null, alphaBuf = null;
  if (nMani > 0) {
    mprog = mkProg(mvs, mfs); fprog = mkProg(fvs, mfs);
    var manifoldBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, manifoldBuffer); gl.bufferData(gl.ARRAY_BUFFER, MF, gl.STATIC_DRAW);
    function bindInst(){
      var st = 16 * 4;
      gl.bindBuffer(gl.ARRAY_BUFFER, manifoldBuffer);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 0);  gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 12); gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, st, 24); gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, st, 36); gl.vertexAttribDivisor(4, 1);
      gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.FLOAT, false, st, 48); gl.vertexAttribDivisor(5, 1);
      gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 3, gl.FLOAT, false, st, 52); gl.vertexAttribDivisor(6, 1);
    }
    var idxR = new Float32Array(2 * (256 + 1)); for (var q1 = 0; q1 < idxR.length; q1++) idxR[q1] = q1;
    var idxF = new Float32Array(50); for (var q2 = 0; q2 < 50; q2++) idxF[q2] = q2;
    mvao = gl.createVertexArray(); gl.bindVertexArray(mvao);
    var bR = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bR); gl.bufferData(gl.ARRAY_BUFFER, idxR, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0); bindInst();
    fvao = gl.createVertexArray(); gl.bindVertexArray(fvao);
    var bF = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bF); gl.bufferData(gl.ARRAY_BUFFER, idxF, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0); bindInst();
    // Per-instance TOF alpha rides a 256 x 64 R32F texture (16,384 entries), refreshed per frame.
    alphaTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, alphaTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 256, 64, 0, gl.RED, gl.FLOAT, null);
    alphaBuf = new Float32Array(256 * 64);
  }
  var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  var quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  var inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  var STRIDE = 9 * 4;
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE, 0);  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, STRIDE, 16); gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, STRIDE, 28); gl.vertexAttribDivisor(3, 1);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied src-over, the native blend
  // ---- state ----
  var yaw = H.yaw-.5, pitch = H.pitch+.22, dist = (H.dist > 0 ? H.dist : 4)*1.15;
  // Start on a representative band instead of the almost-empty first arrival.
  // This is especially important in the layered page: the retained renderer must
  // announce itself immediately rather than leaving only the Rive schematic visible.
  var tofOn = false, gate = clockMin + 0.35 * span, width = 0.18 * span, viewRadius = Math.pow(10,-.25), playing = false;
  var sweepSpeed = span / 6.0;  // one traversal every six seconds
  var W = 1, Hh = 1, needSort = true, dirty=true, exposure=Math.pow(2,-.6), frames=0;
  var vz = new Float32Array(N), order = new Uint32Array(N);
  var pxx = new Float32Array(N), pyy = new Float32Array(N), rad = new Float32Array(N), minor=new Float32Array(N),angle=new Float32Array(N);
  var data = new Float32Array(N * 9);
  var eye = [0,0,0], fwd = [0,0,1], right=[1,0,0],cameraUp=[0,1,0],VP = new Float32Array(16);
  const reference=createReference(document.getElementById("reference"));
  // ---- the native camera: orbitCamera + lookAt + perspective, column-major m[col*4+row] ----
  function camera(){
    var lim = 1.55334; if (pitch > lim) pitch = lim; if (pitch < -lim) pitch = -lim;
    var dir = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    eye = dir.map((d,i)=>H.target[i]+d*dist); fwd=dir.map(d=>-d);
    var up = [0,1,0];
    var sx = fwd[1]*up[2] - fwd[2]*up[1], sy = fwd[2]*up[0] - fwd[0]*up[2], sz = fwd[0]*up[1] - fwd[1]*up[0];
    var sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
    var ux = sy*fwd[2] - sz*fwd[1], uy = sz*fwd[0] - sx*fwd[2], uz = sx*fwd[1] - sy*fwd[0];
    right=[sx,sy,sz];cameraUp=[ux,uy,uz];
    var V = new Float32Array(16);
    V[0] = sx; V[4] = sy; V[8] = sz;  V[12] = -(sx*eye[0] + sy*eye[1] + sz*eye[2]);
    V[1] = ux; V[5] = uy; V[9] = uz;  V[13] = -(ux*eye[0] + uy*eye[1] + uz*eye[2]);
    V[2] = -fwd[0]; V[6] = -fwd[1]; V[10] = -fwd[2]; V[14] = fwd[0]*eye[0] + fwd[1]*eye[1] + fwd[2]*eye[2];
    V[3] = 0; V[7] = 0; V[11] = 0; V[15] = 1;
    var fovY = 1.0, zn = 0.05, zf = 100.0, aspect = W / Hh, f = 1.0 / Math.tan(fovY * 0.5);
    var P = new Float32Array(16);
    P[0] = f / aspect; P[5] = f; P[10] = (zf + zn) / (zn - zf); P[11] = -1; P[14] = (2 * zf * zn) / (zn - zf);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      var acc = 0; for (var k = 0; k < 4; k++) acc += P[k*4 + r] * V[c*4 + k];
      VP[c*4 + r] = acc;
    }
  }
  // ---- projection of the whole cloud, native rules; sorted far -> near on camera change ----
  function project(){
    camera();
    var focalPx = Hh / (2 * Math.tan(0.5));   // fovY 1.0
    for (var i = 0; i < N; i++) {
      var b = i * 15, x = S[b], y = S[b+1], z = S[b+2];
      var cw = VP[3]*x + VP[7]*y + VP[11]*z + VP[15];
      var viewZ = (x - eye[0]) * fwd[0] + (y - eye[1]) * fwd[1] + (z - eye[2]) * fwd[2];
      if (!(cw > 1e-6) || !(viewZ > 0.02)) { vz[i] = -1; continue; }
      var iw = 1 / cw;
      var nx = (VP[0]*x + VP[4]*y + VP[8]*z + VP[12]) * iw;
      var ny = (VP[1]*x + VP[5]*y + VP[9]*z + VP[13]) * iw;
      pxx[i] = (nx * 0.5 + 0.5) * W;
      pyy[i] = (1 - (ny * 0.5 + 0.5)) * Hh;
      // Project the actual three principal axes through the perspective Jacobian.
      let qx=S[b+6],qy=S[b+7],qz=S[b+8],qw=S[b+9],ql=Math.hypot(qx,qy,qz,qw)||1;qx/=ql;qy/=ql;qz/=ql;qw/=ql;
      const axes=[[1-2*(qy*qy+qz*qz),2*(qx*qy+qz*qw),2*(qx*qz-qy*qw)],[2*(qx*qy-qz*qw),1-2*(qx*qx+qz*qz),2*(qy*qz+qx*qw)],[2*(qx*qz+qy*qw),2*(qy*qz-qx*qw),1-2*(qx*qx+qy*qy)]];
      const jx=[0,4,8].map(j=>.5*W*(VP[j]-nx*VP[j+3])*iw),jy=[0,4,8].map(j=>-.5*Hh*(VP[j+1]-ny*VP[j+3])*iw);
      let aa=0,bb=0,ab=0;for(let axis=0;axis<3;axis++){const sc=S[b+3+axis]*viewRadius,ax=axes[axis].reduce((t,v,j)=>t+v*jx[j],0)*sc,ay=axes[axis].reduce((t,v,j)=>t+v*jy[j],0)*sc;aa+=ax*ax;bb+=ay*ay;ab+=ax*ay;}
      const mid=.5*(aa+bb),dif=Math.hypot(.5*(aa-bb),ab);rad[i]=Math.sqrt(Math.max(0,mid+dif));minor[i]=Math.sqrt(Math.max(.001,mid-dif));angle[i]=.5*Math.atan2(2*ab,aa-bb);
      vz[i] = viewZ;
    }
    for (var j = 0; j < N; j++) order[j] = j;
    var vzz = vz;
    order.sort(function(a, b2){ return vzz[b2] - vzz[a]; });   // far first
    needSort = false;
  }
  var drawn = 0, drawnMani = 0;
  // The native stroke: 2 px full width, gaussian feather with sigma = max(blur/2, 0.5) px.
  // The record's blur is the bake's world-space beam radius handed over as pixels (0.04),
  // so in practice the 0.5 px floor is what draws -- the same on the native path.
  var MHALFW = 1.0, MSIGMA = Math.max(MBLUR * 0.5, 0.5), MREACH = MHALFW + 1.5 * MSIGMA;
  function drawManifolds(){
    drawnMani = 0;
    if (!mprog || !document.getElementById('mf').checked) return;
    var inv255 = analyticRings?1e-6:1 / 255, hw = 0.5 * Math.max(width, 1e-4),ringAlpha=Number(document.getElementById('ringAlpha').value)*(analyticRings?15:1);
    for (var mi = 0; mi < nMani && mi < 16384; mi++) {
      var a = MA[mi]*ringAlpha;
      if (tofOn) { var dd = (MT[mi] - gate) / hw; a *= Math.exp(-dd * dd); }
      if (a < inv255) a = 0; else drawnMani++;
      alphaBuf[mi] = a;
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, alphaTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 64, gl.RED, gl.FLOAT, alphaBuf);
    if (nOutline > 0) {
      gl.useProgram(mprog);gl.uniform1f(gl.getUniformLocation(mprog,'uExposure'),exposure); gl.bindVertexArray(mvao);
      gl.uniformMatrix4fv(gl.getUniformLocation(mprog, 'uVP'), false, VP);
      gl.uniform2f(gl.getUniformLocation(mprog, 'uViewport'), W, Hh);
      gl.uniform1f(gl.getUniformLocation(mprog, 'uReach'), MREACH);
      gl.uniform1f(gl.getUniformLocation(mprog, 'uHalfW'), MHALFW);
      gl.uniform1f(gl.getUniformLocation(mprog, 'uSigma'), MSIGMA);
      const segments=analyticRings?256:SEG;
      gl.uniform1i(gl.getUniformLocation(mprog, 'uSeg'), segments);
      gl.uniform1f(gl.getUniformLocation(mprog,'uKernelWidth'),Number(document.getElementById('kernel-width').value)*Math.PI/180);
      gl.uniform1i(gl.getUniformLocation(mprog, 'uAlpha'), 0);
      const mode=analyticRings?Number(document.getElementById('kernel-mode').value):0;
      function pass(support,tint){gl.uniform1i(gl.getUniformLocation(mprog,'uSupportMode'),support);gl.uniform3fv(gl.getUniformLocation(mprog,'uTint'),tint);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,2*(segments+1),nMani);}
      if(!analyticRings)pass(0,[1,1,1]);
      else{if(mode!==1)pass(0,mode===2?[.12,.16,.17]:[.5,.65,.68]);if(mode!==0)pass(1,[1,.72,.3]);}
    }
    if (nFillQ > 0) {
      gl.useProgram(fprog);gl.uniform1i(gl.getUniformLocation(fprog,'uSupportMode'),0);gl.uniform3f(gl.getUniformLocation(fprog,'uTint'),1,1,1);gl.uniform1f(gl.getUniformLocation(fprog,'uExposure'),exposure); gl.bindVertexArray(fvao);
      gl.uniformMatrix4fv(gl.getUniformLocation(fprog, 'uVP'), false, VP);
      gl.uniform2f(gl.getUniformLocation(fprog, 'uViewport'), W, Hh);
      gl.uniform1f(gl.getUniformLocation(fprog, 'uHalfW'), MHALFW);
      gl.uniform1f(gl.getUniformLocation(fprog, 'uSigma'), MSIGMA);
      gl.uniform1f(gl.getUniformLocation(fprog, 'uReach'), MREACH);
      gl.uniform1i(gl.getUniformLocation(fprog, 'uAlpha'), 0);
      gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 50, nMani);
    }
  }
  function draw(){
    if (needSort) project();
    var n = 0, inv255 = 1 / 255, hw = 0.5 * Math.max(width, 1e-6);
    const showPoints=document.getElementById('points').checked,showSurface=document.getElementById('surface').checked,showMedium=document.getElementById('medium').checked,palette=Number(document.getElementById('palette').value);
    for (var k = 0; k < N && showPoints; k++) {
      var i = order[k]; if (!(vz[i] > 0)) continue;
      if(tags&&((tags[i]===0&&!showSurface)||(tags[i]!==0&&!showMedium)))continue;
      var b = i * 15, a = S[b+13];
      if (tofOn) { var dd = (S[b+14] - gate) / hw; a *= Math.exp(-dd * dd); }
      if (a < inv255) continue;               // below 8-bit: can never show
      var r = rad[i]; if (r < 0.4) continue;  // the native small-splat cull
      var o = n * 9;
      data[o] = pxx[i]; data[o+1] = pyy[i]; data[o+2] = r; data[o+3] = a;
      const t=Math.max(0,Math.min(1,(S[b+14]-clockMin)/span));
      const rgb=palette===1?[.12+.88*t,.75-.25*t,1-.88*t]:palette===2?(tags&&tags[i]===0?[.98,.6,.25]:[.18,.85,1]):[S[b+10],S[b+11],S[b+12]];
      data[o+4]=rgb[0];data[o+5]=rgb[1];data[o+6]=rgb[2];data[o+7] = minor[i]; data[o+8] = angle[i];
      n++;
    }
    drawn = n;
    gl.viewport(0, 0, W, Hh);
    // Transparent clear lets an optional official-Rive schematic remain visible below
    // the retained field. The stage itself supplies the same opaque dark background.
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (n > 0) {
      gl.useProgram(prog);gl.uniform1f(gl.getUniformLocation(prog,'uExposure'),exposure); gl.bindVertexArray(vao);
      gl.uniform2f(uViewport, W, Hh);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n * 9), gl.STREAM_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    }
    if (needSort === false) { /* the camera is current */ }
    drawManifolds();   // after the splats, record order, same blend -- the native draw order
  }
  function resize(){
    var b = cv.getBoundingClientRect(), dpr = Math.min(1.5,window.devicePixelRatio || 1);
    var w = Math.max(1, Math.round(b.width * dpr)), h = Math.max(1, Math.round(b.height * dpr));
    if (w !== W || h !== Hh) { W = w; Hh = h; cv.width = w; cv.height = h; needSort = true; }
  }
  // DRAG DIRECTION (the user: "let us reverse left and right"): dragging RIGHT turns the
  // scene as if you pushed its near side to the right, i.e. the eye orbits LEFT -- yaw
  // decreases. The first cut had the sign the other way and it read as pulling the far side.
  // ---- controls ----
  var sg = document.getElementById('sg'), sw = document.getElementById('sw'), sr = document.getElementById('sr');
  var og = document.getElementById('og'), ow = document.getElementById('ow'), or_ = document.getElementById('or');
  var pp = document.getElementById('pp'), tofCb = document.getElementById('tof'), camEl = document.getElementById('cam');
  function readout(){
    og.textContent = gate.toFixed(2); ow.textContent = width.toFixed(2); or_.textContent = viewRadius.toFixed(2);
    sg.value = String(Math.round((gate - clockMin) / span * 1000));
    camEl.textContent = drawn + ' / ' + N + ' splats' + (nMani ? ', ' + drawnMani + ' / ' + nMani + ' manifolds' : '') + '  yaw ' + (yaw * 180 / Math.PI).toFixed(0) + '°  pitch ' +
      (pitch * 180 / Math.PI).toFixed(0) + '°  dist ' + dist.toFixed(2) + '   drag = orbit, wheel = distance';
  }
  sw.value = String(Math.round(width / span * 1000));
  sg.addEventListener('input', function(){ gate = clockMin + span * (+sg.value) / 1000; playing = false;tofOn=true;tofCb.checked=true;pp.textContent = 'Play gate'; });
  sw.addEventListener('input', function(){ width = Math.max(1e-6, span * (+sw.value) / 1000); });
  sr.addEventListener('input', function(){ viewRadius = Math.pow(10,+sr.value); needSort = true; });
  tofCb.addEventListener('change', function(){ tofOn = tofCb.checked; });
  pp.addEventListener('click', function(){ playing = !playing; tofOn=true;tofCb.checked=true;pp.textContent = playing ? 'Pause gate' : 'Play gate'; });
  function bindLayerToggle(id, target){
    var cb=document.getElementById(id), el=document.getElementById(target);
    if(cb&&el) cb.addEventListener('change',function(){ el.style.visibility=cb.checked?'visible':'hidden'; });
  }
  bindLayerToggle('showUnder','riveUnderlay');
  bindLayerToggle('showRetained','cv');
  bindLayerToggle('showOverlay','riveOverlay');
  var dragging = false, lx=0,ly=0;
  cv.addEventListener('pointerdown',e=>{dragging=true;lx=e.clientX;ly=e.clientY;cv.setPointerCapture(e.pointerId);});
  cv.addEventListener('pointerup',()=>dragging=false);cv.addEventListener('pointercancel',()=>dragging=false);
  cv.addEventListener('pointermove',e=>{if(!dragging)return;yaw-=(e.clientX-lx)*.005;pitch+=(e.clientY-ly)*.005;lx=e.clientX;ly=e.clientY;needSort=true;wake();});
  cv.addEventListener('wheel',e=>{e.preventDefault();dist=Math.min(50,Math.max(.3,dist*Math.exp(e.deltaY*.001)));needSort=true;wake();},{passive:false});
  cv.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')yaw+=.1;if(e.key==='ArrowRight')yaw-=.1;if(e.key==='ArrowUp')pitch+=.1;if(e.key==='ArrowDown')pitch-=.1;if(e.key==='+')dist*=.9;if(e.key==='-')dist*=1.1;needSort=true;wake();}});
  const $=id=>document.getElementById(id);
  $('exposure').oninput=()=>{exposure=2**Number($('exposure').value);$('exposureValue').textContent=Number($('exposure').value).toFixed(1)+' EV';};
  $('ringAlpha').oninput=()=>$('ringAlphaValue').textContent=Number($('ringAlpha').value).toFixed(3);
  $('referenceStrength').oninput=()=>$('referenceValue').textContent=Number($('referenceStrength').value).toFixed(2);
  $('cache').onchange=()=>{location.search=$('cache').value==='compact'?'?cache=compact':'';};
  if(!tags){$('surface').disabled=true;$('medium').disabled=true;$('surface').parentElement.lastElementChild.textContent='not tagged';$('medium').parentElement.lastElementChild.textContent='not tagged';$('palette').querySelector('[value="2"]').disabled=true;}
  function setRingSource(analytic){
    analyticRings=analytic;if(analytic)$('view-caption').textContent='Analytic Snell specimen · grey candidates / gold support';const phase=(gate-clockMin)/span,band=width/span;
    if(analytic){
      const sphere=sceneOccluders.find(o=>o[0]===0),study=dielectricRings(sphere?sphere.slice(1,5):[0,0,0,.45],Number($('kernel-ior').value));
      analyticPaths=study.paths;nMani=study.records.length;nOutline=nMani;nFillQ=0;
      MF=new Float32Array(nMani*16);MT=new Float32Array(nMani);MA=new Float32Array(nMani);
      study.records.forEach((r,i)=>{MF.set([...r.c,...r.u,...r.v,1,1,1,0,r.phase,r.mu,1],i*16);MT[i]=r.time;MA[i]=r.alpha;});
      clockMin=Math.min(...MT)-.1;clockMax=Math.max(...MT)+.1;
    }else{({MF,MT,MA,nMani,nOutline,nFillQ}=nativeRings);clockMin=H.tofMin;clockMax=H.tofMax;}
    span=Math.max(1e-6,clockMax-clockMin);sweepSpeed=span/6;gate=clockMin+phase*span;width=band*span;
    gl.bindBuffer(gl.ARRAY_BUFFER,manifoldBuffer);gl.bufferData(gl.ARRAY_BUFFER,MF,gl.STATIC_DRAW);
    $('kernel-controls').hidden=!analytic;$('clock-unit').textContent=analytic?'Optical length · Σ nℓ':'Recorded scene-length units';
    $('kernel-width-value').textContent=$('kernel-width').value+'°';$('kernel-ior-value').textContent=Number($('kernel-ior').value).toFixed(2);
  }
  $('kernel-ior').oninput=()=>{if(analyticRings)setRingSource(true);};
  $('kernel-width').oninput=()=>$('kernel-width-value').textContent=$('kernel-width').value+'°';
  function preset(name){
    setRingSource(name==='dielectric');
    document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===name)));
    $('points').checked=!['rings','normal','dielectric'].includes(name);$('mf').checked=['rings','dielectric'].includes(name);$('surface').checked=name!=='pulse';$('medium').checked=true;
    tofOn=['pulse','rings','dielectric'].includes(name);playing=['pulse','rings','dielectric'].includes(name)&&!matchMedia('(prefers-reduced-motion:reduce)').matches;tofCb.checked=tofOn;pp.textContent=playing?'Pause gate':'Play gate';
    width=span*(name==='rings'?.05:name==='dielectric'?.28:.18);gate=clockMin+span*(name==='rings'?.245:.35);sw.value=width/span*1000;
    $('background').value=name==='normal'?'2':name==='beauty'?'1':'0';$('referenceStrength').value=name==='normal'?'0.85':'0.15';$('referenceStrength').oninput();
    $('view-caption').textContent={beauty:'Native field · arrival-time colors',pulse:'Tagged medium samples · arrival window',rings:'Native ellipse outlines · separate representation',normal:'Normal reference from exported sphere + box',dielectric:'Analytic Snell specimen · grey candidates / gold support'}[name];
    if(!tags&&name==='pulse')$('view-caption').textContent='Untagged compact field · arrival window';wake();
  }
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));
  const cameraPreset=(y,p,d)=>{yaw=y;pitch=p;dist=d;needSort=true;wake();};
  $('front').onclick=()=>cameraPreset(H.yaw,H.pitch,H.dist);
  $('oblique').onclick=()=>cameraPreset(-.5,.22,H.dist*1.15);
  $('top').onclick=()=>cameraPreset(-.45,.72,H.dist*1.2);
  $('reset').onclick=()=>{cameraPreset(H.yaw-.5,H.pitch+.22,H.dist*1.15);viewRadius=Math.pow(10,-.25);sr.value=-.25;exposure=Math.pow(2,-.6);$('exposure').value=-.6;$('exposure').oninput();$('palette').value=1;$('ringAlpha').value=.02;$('ringAlpha').oninput();$('sphere').checked=true;['showUnder','showRetained','showOverlay'].forEach(id=>{$(id).checked=true;$(id).dispatchEvent(new Event('change'));});preset('beauty');};
  const ids=['points','surface','medium','mf','ringAlpha','sr','exposure','palette','tof','sg','sw','background','sphere','referenceStrength','showUnder','showRetained','showOverlay','kernel-mode','kernel-width','kernel-ior'];
  function settings(){return {format:'rivx-retained-view',version:1,cache,ringSource:analyticRings?'dielectric':'native',timing:{gate,width},camera:{yaw,pitch,dist},values:Object.fromEntries(ids.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]))};}
  $('save-look').onclick=()=>{const blob=new Blob([JSON.stringify(settings(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='rivx-retained-view.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);$('settings-status').textContent='View settings exported; native record unchanged.';};
  $('load-look').onclick=()=>$('look-file').click();$('look-file').onchange=async()=>{try{const f=$('look-file').files[0];if(!f)return;const state=JSON.parse(await f.text());if(state.format!=='rivx-retained-view'||state.version!==1||state.cache!==cache)throw Error('Choose the matching native cache before loading its settings.');if(!state.camera||!['yaw','pitch','dist'].every(k=>Number.isFinite(state.camera[k])))throw Error('Invalid camera');setRingSource(state.ringSource==='dielectric');for(const id of ids){const el=$(id),v=state.values?.[id];if(el.disabled||v===undefined)continue;if(el.type==='checkbox'){if(typeof v!=='boolean')throw Error('Invalid '+id);el.checked=v;el.dispatchEvent(new Event('change'));}else{if(!Number.isFinite(Number(v)))throw Error('Invalid '+id);el.value=String(v);el.dispatchEvent(new Event('input'));}}if(analyticRings)setRingSource(true);gate=clockMin+span*Number($('sg').value)/1000;width=span*Number($('sw').value)/1000;if(Number.isFinite(state.timing?.gate))gate=Math.max(clockMin,Math.min(clockMax,state.timing.gate));if(Number.isFinite(state.timing?.width))width=Math.max(span*.001,Math.min(span,state.timing.width));tofOn=!!state.values?.tof;tofCb.checked=tofOn;yaw=state.camera.yaw;pitch=Math.max(-1.55,Math.min(1.55,state.camera.pitch));dist=Math.max(.3,Math.min(50,state.camera.dist));playing=false;pp.textContent='Play gate';needSort=true;document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed','false'));$('settings-status').textContent='View restored. Playback paused.';wake();}catch(e){$('settings-status').textContent=e.message;}finally{$('look-file').value='';}};
  let raf=0,last=performance.now(),visible=true,alive=true,pageActive=true;
  function wake(){dirty=true;if(alive&&pageActive&&!raf&&visible&&!document.hidden&&window.rivxHostVisible)raf=requestAnimationFrame(frame);}
  function frame(now){raf=0;if(!alive||!pageActive||!visible||document.hidden||!window.rivxHostVisible){last=now;return;}const dt=Math.min(.05,(now-last)/1000);last=now;if(playing&&tofOn){gate+=sweepSpeed*dt;if(gate>clockMax)gate=clockMin;dirty=true;}
    resize();if(dirty||needSort){draw();readout();window.rivxGatePhase=Math.max(0,Math.min(1,(gate-clockMin)/span));window.rivxPlaying=playing&&tofOn;
      const view={matrix:Array.from(VP),width:W,height:Hh,occluders:sceneOccluders,eye,forward:fwd,right,up:cameraUp};window.rivxSceneView=view;
      reference.draw(view,Number($('background').value),Number($('referenceStrength').value),$('sphere').checked);window.dispatchEvent(new Event('rivx-view-updated'));
      document.body.dataset.frames=String(++frames);document.body.dataset.drawn=String(drawn);document.body.dataset.manifolds=String(drawnMani);document.body.dataset.glerror=String(gl.getError());document.body.dataset.yaw=String(yaw);document.body.dataset.gate=String(gate);document.body.dataset.radius=String(viewRadius);document.body.dataset.ringSource=analyticRings?'dielectric':'native';document.body.dataset.playing=String(playing);document.body.dataset.kernelMode=$('kernel-mode').value;$('stat').textContent=analyticRings?analyticPaths.length+' analytic two-interface paths · '+nMani+' candidate rings · archived point field remains a separate layer':N.toLocaleString()+' native splats · '+nMani.toLocaleString()+' recorded rings · '+nOcc+' reference objects';dirty=false;
    }if(playing&&tofOn)wake();}
  for(const id of ids){$(id).addEventListener('input',wake);$(id).addEventListener('change',wake);}
  pp.addEventListener('click',wake);window.addEventListener('resize',()=>{needSort=true;wake();});document.addEventListener('visibilitychange',()=>{last=performance.now();wake();});
  new ResizeObserver(()=>{needSort=true;wake();}).observe(cv);new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;last=performance.now();wake();}).observe(document.querySelector('.workbench'));
  window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='portfolio-lab-visibility'){window.rivxHostVisible=!!e.data.visible;last=performance.now();wake();}});
  window.addEventListener('pagehide',e=>{pageActive=false;if(raf)cancelAnimationFrame(raf);raf=0;if(!e.persisted){alive=false;reference.dispose();gl.getExtension('WEBGL_lose_context')?.loseContext();}});window.addEventListener('pageshow',()=>{pageActive=true;last=performance.now();wake();});
  stat.textContent=N.toLocaleString()+' native splats · '+nMani.toLocaleString()+' recorded rings · '+nOcc+' reference objects';
  $('loading').hidden=true;document.body.dataset.cache=cache;document.body.dataset.splats=String(N);document.body.dataset.tagged=String(!!tags);
  window.rivxWorkbench={settings,header:H,recordCount:N,tagged:!!tags,getAnalyticPaths:()=>analyticPaths};
  preset('beauty');resize();wake();if(parent!==window)parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);
})().catch(e=>{document.getElementById('loading').hidden=true;document.getElementById('err').hidden=false;document.getElementById('err').textContent='Retained renderer could not start: '+e.message;document.body.dataset.error=e.message;console.error(e);});
