
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var C = { ac:'#34d3c4', ac2:'#4fd6e8', warm:'#f0a35e', rose:'#ff6a55',
          blue:'#5aa9ff', dim:'#8a99ab', faint:'#5e6e80', hd:'#e8eef5',
          bg:'#0b0f14', bd:'#243140' };

/* ---------- a real symmetric eigensolver (cyclic Jacobi rotations) ----------
   This is the genuine article, not a lookup: given a symmetric matrix it
   rotates away the off-diagonal entries until only the diagonal is left. The
   diagonal then holds the eigenvalues and the accumulated rotations hold the
   eigenvectors -- exactly the job the engine's solver does, just smaller.   */
function jacobiEigen(Ain, n, sweeps){
  var A = Float64Array.from(Ain), V = new Float64Array(n*n), i, k, p, q;
  for(i=0;i<n;i++) V[i*n+i] = 1;
  for(var s=0; s<(sweeps||40); s++){
    var off = 0;
    for(p=0;p<n;p++) for(q=p+1;q<n;q++) off += A[p*n+q]*A[p*n+q];
    if(off < 1e-20) break;
    for(p=0;p<n;p++) for(q=p+1;q<n;q++){
      var apq = A[p*n+q];
      if(Math.abs(apq) < 1e-15) continue;
      var theta = (A[q*n+q]-A[p*n+p])/(2*apq);
      var sgn = theta >= 0 ? 1 : -1;
      var t = sgn/(Math.abs(theta)+Math.sqrt(theta*theta+1));
      var c = 1/Math.sqrt(t*t+1), sn = t*c;
      for(k=0;k<n;k++){ var akp=A[k*n+p], akq=A[k*n+q];
        A[k*n+p]=c*akp-sn*akq; A[k*n+q]=sn*akp+c*akq; }
      for(k=0;k<n;k++){ var apk=A[p*n+k], aqk=A[q*n+k];
        A[p*n+k]=c*apk-sn*aqk; A[q*n+k]=sn*apk+c*aqk; }
      for(k=0;k<n;k++){ var vkp=V[k*n+p], vkq=V[k*n+q];
        V[k*n+p]=c*vkp-sn*vkq; V[k*n+q]=sn*vkp+c*vkq; }
    }
  }
  var idx = [];
  for(i=0;i<n;i++) idx.push({v:A[i*n+i], i:i});
  idx.sort(function(a,b){ return a.v-b.v; });
  return { values: idx.map(function(x){ return x.v; }),
           vectors: idx.map(function(x){
             var col = new Float64Array(n);
             for(var r=0;r<n;r++) col[r] = V[r*n+x.i];
             var mx = 0; for(r=0;r<n;r++) mx = Math.max(mx, Math.abs(col[r]));
             if(mx>0) for(r=0;r<n;r++) col[r] /= mx;
             return col; }) };
}

/* A string chopped into N moving points: stiffness is the classic
   (-1, 2, -1) neighbour pattern, mass is uniform. Solved for real. */
var stringCache = {};
function solveString(N){
  if(stringCache[N]) return stringCache[N];
  var A = new Float64Array(N*N), i;
  for(i=0;i<N;i++){ A[i*N+i] = 2;
    if(i>0) A[i*N+i-1] = -1;
    if(i<N-1) A[i*N+i+1] = -1; }
  var e = jacobiEigen(A, N, 60);
  var om = e.values.map(function(v){ return Math.sqrt(Math.max(v,0)); });
  var r = { N:N, omega:om, phi:e.vectors };
  stringCache[N] = r;
  return r;
}



/* ---- frame-time meter (click the "perf" badge, or press P) ----
   Every animation loop is routed through RAF() below, so wrapping the call
   there gives a per-demo cost breakdown for free: instead of guessing which
   canvas is expensive, the meter names it. Costs nothing while switched off
   (one boolean test per frame). */
var PERF = {run:function(cv,fn){fn();}};
/* ---- only animate what is actually on screen ----
   Every demo used to run its animation loop forever, so scrolling past one
   left it burning frames in the background. This gates each loop on an
   IntersectionObserver: off-screen demos re-arm cheaply and do no work. */
var _labFrames = new WeakMap();
function RAF(cv, fn){
  var queued = _labFrames.get(cv);
  if(!queued){queued = new Set(); _labFrames.set(cv,queued);}
  if(queued.has(fn)) return;
  queued.add(fn);
  requestAnimationFrame(function(){queued.delete(fn); PERF.run(cv,fn);});
}

function clear(ctx,w,h){ ctx.fillStyle = C.bg; ctx.fillRect(0,0,w,h); }
function txt(ctx,s,x,y,col,size,align){
  ctx.fillStyle = col||C.dim; ctx.font = (size||11)+'px Inter,sans-serif';
  ctx.textAlign = align||'left'; ctx.fillText(s,x,y); ctx.textAlign='left';
}
/* Fit a box of a given aspect ratio inside a region, centred.
   Every domain we draw (plate, mesh, field) lives on a SQUARE, so without this
   a square plate renders as a wide rectangle and a disc as an ellipse. One
   helper, used everywhere, instead of each demo inventing its own layout. */
function fitBox(ox,oy,w,h,aspect){
  aspect = aspect || 1;
  var bw = w, bh = w/aspect;
  if(bh > h){ bh = h; bw = h*aspect; }
  return [ox+(w-bw)/2, oy+(h-bh)/2, bw, bh];
}
function diverge(v){ // -1..1 -> blue .. pale .. red
  var t = Math.max(-1,Math.min(1,v));
  if(t>0) return 'rgb('+Math.round(242-72*t)+','+Math.round(235-200*t)+','+Math.round(220-190*t)+')';
  return 'rgb('+Math.round(242+ 216*t)+','+Math.round(235+140*t)+','+Math.round(220- 10*t)+')';
}

/* ================= 01 mesh ================= */
(function(){
  var cv = $('cvMesh'); if(!cv) return;
  var ctx = cv.getContext('2d'), hover = -1, tris = [], nodes = [];
  function inShape(x,y){ // a bell-ish blob in [-1,1]^2
    var r = Math.sqrt(x*x+y*y*1.35);
    var wob = 0.80 + 0.15*Math.cos(3*Math.atan2(y,x)) + 0.07*Math.cos(5*Math.atan2(y,x));
    return r < wob;
  }
  function build(res){
    nodes = []; tris = [];
    var g = res, idx = {}, i, j;
    for(j=-g;j<=g;j++) for(i=-g;i<=g;i++){
      var x = i/g, y = j/g;
      if(inShape(x,y)){ idx[i+','+j] = nodes.length; nodes.push([x,y]); }
    }
    for(j=-g;j<g;j++) for(i=-g;i<g;i++){
      var a=idx[i+','+j], b=idx[(i+1)+','+j], c=idx[i+','+(j+1)], d=idx[(i+1)+','+(j+1)];
      if(a!==undefined&&b!==undefined&&c!==undefined) tris.push([a,b,c]);
      if(b!==undefined&&d!==undefined&&c!==undefined) tris.push([b,d,c]);
    }
  }
  function P(p){ return [cv.width/2 + p[0]*115, cv.height/2 - p[1]*115]; }
  function draw(){
    clear(ctx,cv.width,cv.height);
    for(var t=0;t<tris.length;t++){
      var A=P(nodes[tris[t][0]]), B=P(nodes[tris[t][1]]), D=P(nodes[tris[t][2]]);
      ctx.beginPath(); ctx.moveTo(A[0],A[1]); ctx.lineTo(B[0],B[1]); ctx.lineTo(D[0],D[1]); ctx.closePath();
      ctx.fillStyle = (t===hover) ? 'rgba(240,163,94,.55)' : 'rgba(52,211,196,.10)';
      ctx.fill();
      ctx.strokeStyle = (t===hover) ? C.warm : 'rgba(90,169,255,.32)';
      ctx.lineWidth = (t===hover)?2:1; ctx.stroke();
    }
    if($('mshNodes').checked){
      ctx.fillStyle = C.ac2;
      for(var i=0;i<nodes.length;i++){ var p=P(nodes[i]);
        ctx.beginPath(); ctx.arc(p[0],p[1],1.7,0,6.284); ctx.fill(); }
    }
    if(hover>=0){
      var h = tris[hover];
      txt(ctx,'this one triangle: 3 corners x 2 directions = 6 numbers',
          cv.width-14, 26, C.warm, 12.5,'right');
      txt(ctx,'it contributes a 6x6 stiffness table',cv.width-14,44,C.dim,12,'right');
      ctx.fillStyle = C.warm;
      for(var k=0;k<3;k++){ var q=P(nodes[h[k]]);
        ctx.beginPath(); ctx.arc(q[0],q[1],4,0,6.284); ctx.fill(); }
    }
    $('mshInfo').textContent = nodes.length+' nodes  ·  '+tris.length+
      ' triangles  ·  '+(nodes.length*2)+' degrees of freedom';
  }
  cv.addEventListener('mousemove', function(ev){
    var r = cv.getBoundingClientRect();
    var mx = (ev.clientX-r.left)*cv.width/r.width, my = (ev.clientY-r.top)*cv.height/r.height;
    hover = -1;
    for(var t=0;t<tris.length;t++){
      var A=P(nodes[tris[t][0]]), B=P(nodes[tris[t][1]]), D=P(nodes[tris[t][2]]);
      var d=(B[1]-D[1])*(A[0]-D[0])+(D[0]-B[0])*(A[1]-D[1]); if(!d) continue;
      var u=((B[1]-D[1])*(mx-D[0])+(D[0]-B[0])*(my-D[1]))/d;
      var v=((D[1]-A[1])*(mx-D[0])+(A[0]-D[0])*(my-D[1]))/d;
      if(u>=0&&v>=0&&u+v<=1){ hover=t; break; }
    }
    draw();
  });
  cv.addEventListener('mouseleave', function(){ hover=-1; draw(); });
  $('mshRes').addEventListener('input', function(){ build(+$('mshRes').value); draw(); });
  $('mshNodes').addEventListener('change', draw);
  build(+$('mshRes').value); draw();
})();

/* ================= 02 assembly ================= */
(function(){
  var cvm = $('cvAsmMesh'), cva = $('cvAsmMat'); if(!cvm||!cva) return;
  var cm = cvm.getContext('2d'), ca = cva.getContext('2d');
  var G = 3, nodes = [], tris = [], hover = -1, i, j;
  for(j=0;j<G;j++) for(i=0;i<G;i++) nodes.push([i/(G-1), j/(G-1)]);
  for(j=0;j<G-1;j++) for(i=0;i<G-1;i++){
    var a=j*G+i, b=j*G+i+1, c=(j+1)*G+i, d=(j+1)*G+i+1;
    tris.push([a,b,c]); tris.push([b,d,c]);
  }
  var N = nodes.length*2, K = new Float64Array(N*N);
  function assemble(){
    K = new Float64Array(N*N);
    for(var t=0;t<tris.length;t++){
      var tr = tris[t];
      for(var p=0;p<3;p++) for(var q=0;q<3;q++){
        var w = (p===q)?2.0:-0.85;
        for(var dd=0;dd<2;dd++){
          var r = tr[p]*2+dd, c2 = tr[q]*2+dd;
          K[r*N+c2] += w;
        }
      }
    }
  }
  assemble();
  var AB = fitBox(30, 26, cvm.width-60, cvm.height-58, 1);   // square domain
  function Pm(p){ return [AB[0]+p[0]*AB[2], AB[1]+AB[3]-p[1]*AB[3]]; }
  function drawMesh(){
    clear(cm,cvm.width,cvm.height);
    for(var t=0;t<tris.length;t++){
      var A=Pm(nodes[tris[t][0]]),B=Pm(nodes[tris[t][1]]),D=Pm(nodes[tris[t][2]]);
      cm.beginPath(); cm.moveTo(A[0],A[1]); cm.lineTo(B[0],B[1]); cm.lineTo(D[0],D[1]); cm.closePath();
      cm.fillStyle = (t===hover)?'rgba(240,163,94,.5)':'rgba(52,211,196,.09)'; cm.fill();
      cm.strokeStyle = (t===hover)?C.warm:'rgba(90,169,255,.35)'; cm.lineWidth=(t===hover)?2:1; cm.stroke();
    }
    for(var n=0;n<nodes.length;n++){ var p=Pm(nodes[n]);
      cm.fillStyle = (hover>=0 && tris[hover].indexOf(n)>=0)?C.warm:C.ac2;
      cm.beginPath(); cm.arc(p[0],p[1],4.5,0,6.284); cm.fill();
      txt(cm,''+n,p[0]+7,p[1]-6,C.faint,10);
    }
    txt(cm,'mesh: '+nodes.length+' nodes',12,16,C.dim,12);
  }
  function drawMat(){
    clear(ca,cva.width,cva.height);
    var s = Math.min((cva.width-56)/N,(cva.height-56)/N), ox=42, oy=30, mx=0, r, c2;
    for(r=0;r<N*N;r++) mx = Math.max(mx, Math.abs(K[r]));
    for(r=0;r<N;r++) for(c2=0;c2<N;c2++){
      var v = Math.abs(K[r*N+c2])/(mx||1);
      if(v>0.001){
        ca.fillStyle = 'rgba(79,214,232,'+(0.12+0.85*v)+')';
        ca.fillRect(ox+c2*s, oy+r*s, s-0.6, s-0.6);
      }
    }
    if(hover>=0){
      var tr = tris[hover], dofs = [];
      for(var p=0;p<3;p++){ dofs.push(tr[p]*2); dofs.push(tr[p]*2+1); }
      ca.strokeStyle = C.warm; ca.lineWidth = 1.4;
      for(var a=0;a<dofs.length;a++) for(var b=0;b<dofs.length;b++)
        ca.strokeRect(ox+dofs[b]*s, oy+dofs[a]*s, s, s);
      txt(ca,'this element touches these entries',ox,oy-10,C.warm,12);
    } else {
      txt(ca,'global stiffness K  ('+N+' x '+N+')',ox,oy-10,C.dim,12);
    }
    txt(ca,'dof',10,oy+N*s/2,C.faint,10);
  }
  cvm.addEventListener('mousemove', function(ev){
    var r = cvm.getBoundingClientRect();
    var mx=(ev.clientX-r.left)*cvm.width/r.width, my=(ev.clientY-r.top)*cvm.height/r.height;
    hover=-1;
    for(var t=0;t<tris.length;t++){
      var A=Pm(nodes[tris[t][0]]),B=Pm(nodes[tris[t][1]]),D=Pm(nodes[tris[t][2]]);
      var d=(B[1]-D[1])*(A[0]-D[0])+(D[0]-B[0])*(A[1]-D[1]); if(!d) continue;
      var u=((B[1]-D[1])*(mx-D[0])+(D[0]-B[0])*(my-D[1]))/d;
      var v=((D[1]-A[1])*(mx-D[0])+(A[0]-D[0])*(my-D[1]))/d;
      if(u>=0&&v>=0&&u+v<=1){ hover=t; break; }
    }
    drawMesh(); drawMat();
  });
  cvm.addEventListener('mouseleave',function(){ hover=-1; drawMesh(); drawMat(); });
  drawMesh(); drawMat();
})();

/* ================= 03 eigensolve ================= */
var EIG = { sol:null, sel:0 };
(function(){
  var cv = $('cvEig'); if(!cv) return;
  var ctx = cv.getContext('2d'), t0 = performance.now();
  function gallery(){
    var g = $('eigGal'); g.innerHTML = '';
    if(!EIG.sol) return;
    var show = Math.min(8, EIG.sol.N);
    for(var k=0;k<show;k++){
      (function(k){
        var d = document.createElement('div');
        d.className = 'm'+(k===EIG.sel?' sel':'');
        var c = document.createElement('canvas'); c.width=86; c.height=34;
        var x = c.getContext('2d');
        x.fillStyle='#0b0f14'; x.fillRect(0,0,86,34);
        x.strokeStyle=C.ac; x.lineWidth=1.5; x.beginPath();
        var ph = EIG.sol.phi[k], N = EIG.sol.N;
        for(var i=0;i<=N+1;i++){
          var v = (i===0||i===N+1)?0:ph[i-1];
          var px = 4+(78)*i/(N+1), py = 17-v*12;
          if(i===0) x.moveTo(px,py); else x.lineTo(px,py);
        }
        x.stroke();
        var lab = document.createElement('div');
        lab.textContent = 'mode '+(k+1);
        d.appendChild(c); d.appendChild(lab);
        d.onclick = function(){ EIG.sel = k; gallery(); };
        g.appendChild(d);
      })(k);
    }
  }
  function draw(){
    clear(ctx,cv.width,cv.height);
    var W=cv.width, H=cv.height;
    if(!EIG.sol){
      txt(ctx,'press "Solve for modes" - the eigensolver runs live',W/2,H/2,C.faint,14,'center');
      RAF(cv,draw); return;
    }
    var s = EIG.sol, N = s.N, k = EIG.sel;
    var t = (performance.now()-t0)/1000;
    var anim = Math.sin(t*2.0*Math.min(1+k*0.35,4));
    ctx.strokeStyle = 'rgba(90,169,255,.25)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(40,H/2); ctx.lineTo(W-40,H/2); ctx.stroke();
    ctx.strokeStyle = C.ac; ctx.lineWidth = 2.4; ctx.beginPath();
    for(var i=0;i<=N+1;i++){
      var v = (i===0||i===N+1)?0:s.phi[k][i-1];
      var px = 40+(W-80)*i/(N+1), py = H/2 - v*anim*52;
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.stroke();
    ctx.fillStyle = C.ac2;
    for(i=1;i<=N;i++){
      var v2 = s.phi[k][i-1];
      var px2 = 40+(W-80)*i/(N+1), py2 = H/2 - v2*anim*52;
      ctx.beginPath(); ctx.arc(px2,py2,2.6,0,6.284); ctx.fill();
    }
    // still points
    for(i=1;i<N;i++){
      if(s.phi[k][i-1]*s.phi[k][i] < 0){
        var px3 = 40+(W-80)*(i+0.5)/(N+1);
        ctx.strokeStyle='rgba(240,163,94,.75)'; ctx.setLineDash([3,3]); ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(px3,H/2-58); ctx.lineTo(px3,H/2+58); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    txt(ctx,'mode '+(k+1)+'  ·  frequency ratio '+(s.omega[k]/s.omega[0]).toFixed(2)+'x the fundamental',
        14,22,C.hd,13);
    txt(ctx,'dashed = still points (nodes)',14,H-12,C.faint,11);
    RAF(cv,draw);
  }
  $('eigGo').addEventListener('click', function(){
    var N = +$('eigN').value;
    var t1 = performance.now();
    EIG.sol = solveString(N);
    var ms = (performance.now()-t1).toFixed(1);
    EIG.sel = 0;
    $('eigInfo').textContent = N+'x'+N+' matrix solved in '+ms+' ms  ·  '+N+' modes found';
    gallery();
  });
  $('eigN').addEventListener('input', function(){
    $('eigInfo').textContent = 'press solve ('+$('eigN').value+' segments)';
  });
  draw();
})();

/* ================= 04 strike ================= */
(function(){
  var cv = $('cvStrike'); if(!cv) return;
  var ctx = cv.getContext('2d'), N = 24, s = solveString(N), hit = 0.31, amps = [];
  var drag = false, hover = false, touched = false, hx = -1;
  function calc(){
    amps = [];
    var pos = hit*(N+1);
    for(var k=0;k<10;k++){
      var i = Math.max(0,Math.min(N-1, Math.round(pos)-1));
      amps.push(s.phi[k][i]);
    }
  }
  function px(ev){
    var r = cv.getBoundingClientRect();
    var cx = (ev.touches && ev.touches[0]) ? ev.touches[0].clientX : ev.clientX;
    return (cx - r.left)*cv.width/r.width;
  }
  function setFrom(mx){ hit = Math.max(0.02,Math.min(0.98,(mx-40)/(cv.width-80))); calc(); }
  cv.addEventListener('mousedown', function(ev){ drag=true; touched=true; setFrom(px(ev)); ev.preventDefault(); });
  window.addEventListener('mousemove', function(ev){ if(drag) setFrom(px(ev)); });
  window.addEventListener('mouseup', function(){ drag=false; });
  cv.addEventListener('mousemove', function(ev){ hover=true; hx=px(ev); });
  cv.addEventListener('mouseleave', function(){ hover=false; hx=-1; });
  cv.addEventListener('touchstart', function(ev){ drag=true; touched=true; setFrom(px(ev)); ev.preventDefault(); },{passive:false});
  cv.addEventListener('touchmove', function(ev){ if(drag){ setFrom(px(ev)); ev.preventDefault(); } },{passive:false});
  cv.addEventListener('touchend', function(){ drag=false; });
  function draw(){
    clear(ctx,cv.width,cv.height);
    var W=cv.width, t=performance.now()/1000;
    var trackY = 58, x0 = 40, x1 = W-40;
    // track: reads as a slider, so it looks draggable
    ctx.strokeStyle='rgba(90,169,255,.35)'; ctx.lineWidth=7; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x0,trackY); ctx.lineTo(x1,trackY); ctx.stroke();
    ctx.strokeStyle=C.ac; ctx.lineWidth=7;
    ctx.beginPath(); ctx.moveTo(x0,trackY); ctx.lineTo(x0+(x1-x0)*hit,trackY); ctx.stroke();
    ctx.lineCap='butt';
    // ghost of where the cursor would drop the handle
    if(hover && !drag && hx>x0-14 && hx<x1+14){
      ctx.fillStyle='rgba(240,163,94,.30)';
      ctx.beginPath(); ctx.arc(Math.max(x0,Math.min(x1,hx)),trackY,8,0,6.284); ctx.fill();
    }
    // glowing handle -- pulses until first use so it invites a drag
    var hxp = x0+(x1-x0)*hit;
    var pulse = touched ? (drag?1:0.55) : (0.55+0.45*Math.sin(t*3.1));
    ctx.fillStyle='rgba(240,163,94,'+(0.13*pulse)+')';
    ctx.beginPath(); ctx.arc(hxp,trackY,26*(drag?1.15:1),0,6.284); ctx.fill();
    ctx.fillStyle='rgba(240,163,94,'+(0.26*pulse)+')';
    ctx.beginPath(); ctx.arc(hxp,trackY,15,0,6.284); ctx.fill();
    ctx.fillStyle=C.warm;
    ctx.beginPath(); ctx.arc(hxp,trackY,drag?9:8,0,6.284); ctx.fill();
    ctx.strokeStyle='rgba(255,235,200,.95)'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.arc(hxp,trackY,drag?9:8,0,6.284); ctx.stroke();
    ctx.strokeStyle='rgba(255,220,160,.8)'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.moveTo(hxp,trackY-18); ctx.lineTo(hxp,trackY-11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hxp,trackY+11); ctx.lineTo(hxp,trackY+18); ctx.stroke();
    txt(ctx, touched ? 'drag the handle to move the strike'
                     : 'drag me  -  move the strike along the string',
        40, 26, touched?C.dim:C.warm, 12.5);
    txt(ctx, (hit*100).toFixed(0)+'%', hxp, trackY+36, C.warm, 11.5, 'center');
    // bars
    var bw = (W-100)/amps.length;
    for(var k=0;k<amps.length;k++){
      var a = Math.abs(amps[k]), h = a*118, x = 50+k*bw;
      ctx.fillStyle = a<0.05 ? 'rgba(120,140,160,.35)' : C.ac;
      ctx.fillRect(x, 236-h, bw-9, h);
      txt(ctx,''+(k+1), x+(bw-9)/2, 252, a<0.05?C.faint:C.dim, 11,'center');
      if(a<0.05) txt(ctx,'off', x+(bw-9)/2, 230, C.faint,10,'center');
    }
    txt(ctx,'how much of each mode you excited',50,112,C.hd,13);
    RAF(cv,draw);
  }
  calc(); RAF(cv,draw);
})();

/* ================= 05 sound ================= */
(function(){
  var cv = $('cvSound'); if(!cv) return;
  var ctx = cv.getContext('2d'), actx = null;
  function params(){
    return { f0:+$('sndF0').value, z:+$('sndZ').value/10000,
             slope:+$('sndSlope').value/100, n:+$('sndN').value };
  }
  function modes(){
    var p = params(), s = solveString(24), out = [];
    for(var k=0;k<p.n;k++){
      var ratio = s.omega[k]/s.omega[0];
      var f = p.f0*ratio;
      var zeta = p.z*(1+p.slope*ratio*3);
      out.push({ f:f, a:Math.abs(s.phi[k][7])/(k+1), d:zeta*2*Math.PI*f });
    }
    return out;
  }
  function draw(){
    clear(ctx,cv.width,cv.height);
    var W=cv.width,H=cv.height, ms = modes(), i, k;
    ctx.strokeStyle='rgba(90,169,255,.2)'; ctx.beginPath();
    ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();
    ctx.strokeStyle=C.ac; ctx.lineWidth=1.4; ctx.beginPath();
    var dur = 0.9;
    for(i=0;i<W;i++){
      var t = i/W*dur, v = 0;
      for(k=0;k<ms.length;k++) v += ms[k].a*Math.sin(2*Math.PI*ms[k].f*t)*Math.exp(-ms[k].d*t);
      var y = H/2 - v*46;
      if(i===0) ctx.moveTo(i,y); else ctx.lineTo(i,y);
    }
    ctx.stroke();
    // envelope
    ctx.strokeStyle='rgba(240,163,94,.55)'; ctx.setLineDash([4,4]); ctx.lineWidth=1;
    ctx.beginPath();
    for(i=0;i<W;i++){
      var t2=i/W*dur, e=0;
      for(k=0;k<ms.length;k++) e += Math.abs(ms[k].a)*Math.exp(-ms[k].d*t2);
      if(i===0) ctx.moveTo(i,H/2-e*46); else ctx.lineTo(i,H/2-e*46);
    }
    ctx.stroke(); ctx.setLineDash([]);
    txt(ctx,ms.length+' modes summed  ·  '+ms[0].f.toFixed(0)+' Hz fundamental',12,20,C.hd,13);
    txt(ctx,'dashed = the fading envelope',12,H-10,C.faint,11);
    $('sndInfo').textContent = 'top mode '+ms[ms.length-1].f.toFixed(0)+' Hz';
  }
  $('sndPlay').addEventListener('click', function(){
    if(!actx){ var AC = window.AudioContext||window.webkitAudioContext;
      if(!AC){ $('sndInfo').textContent='no audio support'; return; } actx = window.ModalLabLifecycle.trackAudio(new AC()); }
    if(actx.state==='suspended') actx.resume();
    var sr = actx.sampleRate, dur = 2.0, ms = modes();
    var buf = actx.createBuffer(1, Math.floor(sr*dur), sr), d = buf.getChannelData(0);
    var norm = 0; for(var k=0;k<ms.length;k++) norm += Math.abs(ms[k].a);
    for(var i=0;i<d.length;i++){
      var t = i/sr, v = 0;
      for(k=0;k<ms.length;k++) v += ms[k].a*Math.sin(2*Math.PI*ms[k].f*t)*Math.exp(-ms[k].d*t);
      d[i] = 0.5*v/(norm||1);
    }
    var src = actx.createBufferSource(); src.buffer = buf;
    src.connect(actx.destination); src.start();
  });
  ['sndF0','sndZ','sndSlope','sndN'].forEach(function(id){
    $(id).addEventListener('input', draw); });
  draw();
})();

/* ================= 06 2D modes + Chladni (five plate shapes) ================= */
(function(){
  var cv2 = $('cv2D'), cvc = $('cvChl'); if(!cv2||!cvc) return;
  var c2 = cv2.getContext('2d'), cc = cvc.getContext('2d');
  var modePixels=96;
  if($('modeDetail')) $('modeDetail').addEventListener('change',function(){
    modePixels=Number(this.value);drawModes();
  });
  var NG = 16, sstr = solveString(NG), GRID = 64;
  var SHAPES = ['rectangle','disc','triangle','hexagon','ring'];
  var ANALYTIC = [true,true,false,false,false];
  var shape = 0, NSOLVE = 13;    // grid used for the numerical shapes

  function besselJ(m,x){
    var half=x/2, fact=1, k;
    for(k=2;k<=m;k++) fact*=k;
    var t=Math.pow(half,m)/fact, sum=t;
    for(k=1;k<60;k++){ t *= -(half*half)/(k*(k+m)); sum += t;
      if(Math.abs(t)<1e-13) break; }
    return sum;
  }
  var JZ = { 0:[2.404826,5.520078,8.653728,11.791534],
             1:[3.831706,7.015587,10.173468],
             2:[5.135622,8.417244,11.619841],
             3:[6.380162,9.761023],
             4:[7.588342,11.064709], 5:[8.771484] };
  var PROF = 129;

  /* All shapes live on the unit square, so one inside() test defines them. */
  function inside(x,y){
    var dx=x-0.5, dy=y-0.5, r=Math.sqrt(dx*dx+dy*dy), k;
    if(shape===0) return true;
    if(shape===1) return r<=0.5;
    if(shape===4) return r>=0.19 && r<=0.47;
    if(shape===2){                                  // triangle
      var ax=0.5,ay=0.95, bx=0.06,by=0.16, cx2=0.94,cy2=0.16;
      var d1=(x-bx)*(ay-by)-(ax-bx)*(y-by);
      var d2=(x-cx2)*(by-cy2)-(bx-cx2)*(y-cy2);
      var d3=(x-ax)*(cy2-ay)-(cx2-ax)*(y-ay);
      var neg=(d1<0)||(d2<0)||(d3<0), pos=(d1>0)||(d2>0)||(d3>0);
      return !(neg&&pos);
    }
    var apo = 0.47*Math.cos(Math.PI/6);             // hexagon
    for(k=0;k<3;k++){
      var a=k*Math.PI/3;
      if(Math.abs(dx*Math.cos(a)+dy*Math.sin(a)) > apo) return false;
    }
    return true;
  }

  var pairs = [], solveInfo = '';
  function analyticModes(){
    var out=[], m, n, i;
    if(shape===0){
      for(m=0;m<4;m++) for(n=0;n<4;n++)
        out.push({m:m,n:n,w:Math.sqrt(sstr.omega[m]*sstr.omega[m]+sstr.omega[n]*sstr.omega[n])});
    } else {
      for(var mm in JZ) for(i=0;i<JZ[mm].length;i++){
        var p={m:+mm,z:JZ[mm][i],w:JZ[mm][i],prof:new Float64Array(PROF)};
        for(var t=0;t<PROF;t++) p.prof[t]=besselJ(p.m,p.z*t/(PROF-1));
        out.push(p);
      }
    }
    solveInfo = 'closed form';
    return out;
  }
  /* No formula exists for a triangle, a hexagon or an annulus. So we do what
     the real engine does: discretise the shape, build the matrix, and hand it
     to the eigensolver. Same jacobiEigen() as section 3, just on a 2D grid. */
  function numericModes(){
    var N=NSOLVE, idx=new Int32Array(N*N), cells=[], i, j;
    for(i=0;i<N*N;i++) idx[i]=-1;
    for(j=0;j<N;j++) for(i=0;i<N;i++){
      if(inside((i+0.5)/N,(j+0.5)/N)){ idx[j*N+i]=cells.length; cells.push([i,j]); }
    }
    var n=cells.length;
    if(n<8){ solveInfo='too small'; return []; }
    var A=new Float64Array(n*n);
    for(var c=0;c<n;c++){
      var ci=cells[c][0], cj=cells[c][1];
      A[c*n+c]=4;
      var nb=[[ci+1,cj],[ci-1,cj],[ci,cj+1],[ci,cj-1]];
      for(var q=0;q<4;q++){
        var ni=nb[q][0], nj=nb[q][1];
        if(ni<0||nj<0||ni>=N||nj>=N) continue;      // Dirichlet: clamped edge
        var d=idx[nj*N+ni];
        if(d>=0) A[c*n+d]=-1;
      }
    }
    var e=jacobiEigen(A,n,6);
    var out=[], K=Math.min(14,n);
    for(var k=0;k<K;k++){
      var g=new Float64Array(N*N), mx=0;
      for(var t2=0;t2<n;t2++){
        var v=e.vectors[k][t2];
        g[cells[t2][1]*N+cells[t2][0]]=v;
        if(Math.abs(v)>mx) mx=Math.abs(v);
      }
      if(mx>0) for(t2=0;t2<N*N;t2++) g[t2]/=mx;
      out.push({grid:g, gn:N, w:Math.sqrt(Math.max(e.values[k],1e-9))});
    }
    solveInfo = 'grid eigensolve · ' + n + ' unknowns';
    return out;
  }
  function rawVal(p,x,y){
    if(p.grid){
      var N=p.gn, u=x*N-0.5, v=y*N-0.5;
      var xi=Math.max(0,Math.min(N-2,Math.floor(u))), yi=Math.max(0,Math.min(N-2,Math.floor(v)));
      var fx=Math.max(0,Math.min(1,u-xi)), fy=Math.max(0,Math.min(1,v-yi));
      return (p.grid[yi*N+xi]*(1-fx)+p.grid[yi*N+xi+1]*fx)*(1-fy)+
             (p.grid[(yi+1)*N+xi]*(1-fx)+p.grid[(yi+1)*N+xi+1]*fx)*fy;
    }
    if(shape===0){
      var i=Math.max(0,Math.min(NG-1,Math.round(x*(NG+1))-1));
      var j=Math.max(0,Math.min(NG-1,Math.round(y*(NG+1))-1));
      return sstr.phi[p.m][i]*sstr.phi[p.n][j];
    }
    var dx=x-0.5, dy=y-0.5, r=Math.sqrt(dx*dx+dy*dy)*2;
    if(r>1) return 0;
    var uu=r*(PROF-1), i0=uu|0; if(i0>PROF-2) i0=PROF-2;
    var f=uu-i0;
    return (p.prof[i0]*(1-f)+p.prof[i0+1]*f)*Math.cos(p.m*Math.atan2(dy,dx));
  }
  function buildModes(){
    pairs = ANALYTIC[shape] ? analyticModes() : numericModes();
    pairs.sort(function(a,b){ return a.w-b.w; });
    // resample every mode onto the field grid once, so changing the drive
    // frequency later is nothing but multiply-adds
    for(var q=0;q<pairs.length;q++){
      var sm=new Float64Array(GRID*GRID);
      for(var i=0;i<GRID;i++) for(var j=0;j<GRID;j++){
        var x=(i+0.5)/GRID, y=(j+0.5)/GRID;
        sm[j*GRID+i] = inside(x,y) ? rawVal(pairs[q],x,y) : 0;
      }
      pairs[q].samp = sm;
    }
  }

  function drawModes(){
    clear(c2,cv2.width,cv2.height);
    var label = SHAPES[shape]+' · mode shapes';
    c2.font='12.5px Inter,sans-serif'; var labelW=c2.measureText(label).width;
    c2.font='11px Inter,sans-serif'; var statusW=c2.measureText(solveInfo).width;
    var stacked=labelW+statusW+32>cv2.width, headerH=stacked?42:26;
    txt(c2,label,10,14,C.hd,12.5);
    txt(c2,solveInfo,cv2.width-10,stacked?29:14,ANALYTIC[shape]?C.faint:C.warm,11,'right');
    var cellW=cv2.width/3, rowH=(cv2.height-headerH)/2, sz=modePixels;
    for(var q=0;q<6;q++){
      var p=pairs[q+1]; if(!p) continue;
      var col=q%3, row=(q/3)|0;
      var r0=fitBox(col*cellW+10, headerH+row*rowH+16, cellW-20, rowH-24, 1);
      var ox=r0[0], oy=r0[1], w=r0[2], h=r0[3];
      for(var a=0;a<sz;a++) for(var b=0;b<sz;b++){
        var xx=(a+0.5)/sz, yy=(b+0.5)/sz;
        if(!inside(xx,yy)) continue;
        c2.fillStyle=diverge(rawVal(p,xx,yy));
        c2.fillRect(ox+a*w/sz, oy+h-(b+1)*h/sz, w/sz+0.7, h/sz+0.7);
      }
      c2.strokeStyle='rgba(90,169,255,.3)'; c2.lineWidth=1;
      c2.strokeRect(ox,oy,w,h);
      txt(c2,'f = '+(p.w/pairs[1].w).toFixed(2)+'x',ox,oy-5,C.dim,10.5);
    }
  }

  var sand=[], fld=null, msk=null;
  var foff=document.createElement('canvas');
  foff.width=GRID; foff.height=GRID;
  var foct=foff.getContext('2d'), fimg=foct.createImageData(GRID,GRID);
  function field(fd){
    if(!pairs.length) return;
    var w=(fd/1000)*1.15*pairs[pairs.length-1].w, i, j, k;
    fld=new Float64Array(GRID*GRID); msk=new Uint8Array(GRID*GRID);
    var re=new Float64Array(GRID*GRID), im=new Float64Array(GRID*GRID);
    for(i=0;i<GRID;i++) for(j=0;j<GRID;j++)
      msk[j*GRID+i]=inside((i+0.5)/GRID,(j+0.5)/GRID)?1:0;
    var dk=-1;
    for(i=0;i<GRID&&dk<0;i++) for(j=0;j<GRID;j++)
      if(msk[j*GRID+i]){ dk=j*GRID+i; break; }
    for(var q=1;q<pairs.length;q++){
      var p=pairs[q], wi=p.w, a=p.samp[dk>=0?dk:0];
      if(Math.abs(a)<1e-9) a=0.2;
      var dr=wi*wi-w*w, di=2*0.03*wi*w, den=dr*dr+di*di;
      if(den<1e-12) continue;
      var hr=a*dr/den, hi2=-a*di/den;
      for(k=0;k<GRID*GRID;k++){
        if(!msk[k]) continue;
        var v=p.samp[k]; re[k]+=hr*v; im[k]+=hi2*v;
      }
    }
    var mx=0;
    for(k=0;k<GRID*GRID;k++){ fld[k]=Math.sqrt(re[k]*re[k]+im[k]*im[k]);
      if(fld[k]>mx) mx=fld[k]; }
    if(mx>0) for(k=0;k<GRID*GRID;k++) fld[k]/=mx;
    for(k=0;k<GRID*GRID;k++) if(!msk[k]) fld[k]=1.8;   // repulsive wall
  }
  function inCell(x,y){
    var i=Math.round(x), j=Math.round(y);
    if(i<0||j<0||i>=GRID||j>=GRID) return false;
    return msk && msk[j*GRID+i]===1;
  }
  function seed(){
    sand=[]; var guard=0;
    while(sand.length<1600 && guard++<60000){
      var x=Math.random()*(GRID-1), y=Math.random()*(GRID-1);
      if(inCell(x,y)) sand.push([x,y]);
    }
  }
  function amp(x,y){
    var xi=Math.max(0,Math.min(GRID-2,x|0)), yi=Math.max(0,Math.min(GRID-2,y|0));
    var fx=x-xi, fy=y-yi;
    return (fld[yi*GRID+xi]*(1-fx)+fld[yi*GRID+xi+1]*fx)*(1-fy)+
           (fld[(yi+1)*GRID+xi]*(1-fx)+fld[(yi+1)*GRID+xi+1]*fx)*fy;
  }
  function step(){
    if(!fld) return;
    for(var i=0;i<sand.length;i++){
      var p=sand[i];
      if(!inCell(p[0],p[1])){
        for(var g=0;g<8;g++){
          var rx=Math.random()*(GRID-1), ry=Math.random()*(GRID-1);
          if(inCell(rx,ry)){ p[0]=rx; p[1]=ry; break; }
        }
        continue;
      }
      var a=Math.min(1,amp(p[0],p[1]));
      var gx=amp(Math.min(GRID-1.01,p[0]+0.7),p[1])-amp(Math.max(0,p[0]-0.7),p[1]);
      var gy=amp(p[0],Math.min(GRID-1.01,p[1]+0.7))-amp(p[0],Math.max(0,p[1]-0.7));
      var nx=p[0]-gx*3.4, ny=p[1]-gy*3.4, j2=0.09+1.35*a;
      nx+=(Math.random()*2-1)*j2; ny+=(Math.random()*2-1)*j2;
      nx=Math.max(0,Math.min(GRID-1.01,nx)); ny=Math.max(0,Math.min(GRID-1.01,ny));
      if(inCell(nx,ny)){ p[0]=nx; p[1]=ny; }
    }
  }
  function drawChl(){
    clear(cc,cvc.width,cvc.height);
    var r0=fitBox(14,28,cvc.width-28,cvc.height-48,1);
    var ox=r0[0], oy=r0[1], w=r0[2], h=r0[3];
    if(fld){
      var fd2=fimg.data;
      for(var i=0;i<GRID;i++) for(var j=0;j<GRID;j++){
        var k=j*GRID+i, o=((GRID-1-j)*GRID+i)*4;
        if(!msk[k]){ fd2[o+3]=0; continue; }
        fd2[o]=52; fd2[o+1]=211; fd2[o+2]=196; fd2[o+3]=(255*(0.05+0.32*fld[k]))|0;
      }
      foct.putImageData(fimg,0,0);
      cc.imageSmoothingEnabled=true;
      cc.drawImage(foff,ox,oy,w,h);
    }
    cc.fillStyle='rgba(250,245,228,.95)';
    cc.beginPath();
    for(var k2=0;k2<sand.length;k2++){
      var p=sand[k2];
      cc.rect(ox+p[0]*w/(GRID-1)-1, oy+h-p[1]*h/(GRID-1)-1, 2,2);
    }
    cc.fill();
    cc.strokeStyle='rgba(90,169,255,.3)'; cc.lineWidth=1;
    cc.strokeRect(ox,oy,w,h);
    txt(cc,'sand settles on the still lines of the driven response',14,17,C.hd,12.5);
  }
  function loop(){ step(); drawChl(); RAF(cvc,loop); }
  function upd(){
    if(!pairs.length) return;
    var fd=+$('chlF').value;
    field(fd);
    var w=(fd/1000)*1.15*pairs[pairs.length-1].w;
    var near=pairs[1]||pairs[0], bd=1e9;
    for(var q=1;q<pairs.length;q++){ var d=Math.abs(pairs[q].w-w); if(d<bd){bd=d;near=pairs[q];} }
    $('chlInfo').textContent='driving at '+(w/pairs[1].w).toFixed(2)+
      'x fundamental  ·  nearest mode '+(near.w/pairs[1].w).toFixed(2)+'x';
  }
  function rebuild(){ buildModes(); drawModes(); upd(); seed(); }
  var seg=$('shpSeg');
  if(seg){
    SHAPES.forEach(function(nm,i){
      var b=document.createElement('button'); b.textContent=nm;
      if(i===0) b.className='on';
      b.onclick=function(){
        shape=i;
        Array.prototype.forEach.call(seg.children,function(c,j){ c.className=(j===i)?'on':''; });
        if(ANALYTIC[i]){ rebuild(); return; }
        clear(c2,cv2.width,cv2.height);
        txt(c2,'no formula for a '+nm+' -',18,cv2.height/2-12,C.warm,14);
        txt(c2,'building the matrix and solving it...',18,cv2.height/2+10,C.hd,14);
        setTimeout(rebuild, 40);          // let that paint before we block
      };
      seg.appendChild(b);
    });
  }
  var chlPend=false;
  $('chlF').addEventListener('input',function(){
    if(chlPend) return; chlPend=true;
    requestAnimationFrame(function(){ chlPend=false; upd(); });
  });
  $('chlSand').addEventListener('click', seed);
  rebuild(); loop();
})();

/* ================= 07 directivity ================= */
(function(){
  var cv = $('cvDir'); if(!cv) return;
  var ctx = cv.getContext('2d');
  function draw(){
    clear(ctx,cv.width,cv.height);
    var k = +$("dirF").value*0.0015, R = +$('dirR').value;
    var NS = 64, NA = 240, mag = [], mx = 0, j, i;
    for(j=0;j<NA;j++){
      var th = 6.283185*j/NA, ux=Math.cos(th), uy=Math.sin(th), re=0, im=0;
      for(i=0;i<NS;i++){
        var a = 6.283185*i/NS, sx=Math.cos(a)*R, sy=Math.sin(a)*R;
        var ob = ux*Math.cos(a)+uy*Math.sin(a);
        if(ob<=0) continue;
        var ph = -k*(ux*sx+uy*sy);
        re += ob*Math.cos(ph); im += ob*Math.sin(ph);
      }
      var m = Math.sqrt(re*re+im*im); mag.push(m); mx = Math.max(mx,m);
    }
    var cx = cv.width*0.5, cy = cv.height*0.5, PR = 118;
    // object
    ctx.strokeStyle='rgba(90,169,255,.5)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(cx,cy,R*0.42,0,6.284); ctx.stroke();
    for(var g=1;g<=3;g++){ ctx.strokeStyle='rgba(90,110,130,.3)';
      ctx.beginPath(); ctx.arc(cx,cy,PR*g/3,0,6.284); ctx.stroke(); }
    ctx.beginPath(); ctx.strokeStyle=C.ac; ctx.lineWidth=2;
    for(j=0;j<=NA;j++){
      var jj=j%NA, th2=6.283185*jj/NA, r=(mag[jj]/(mx||1))*PR;
      var px=cx+Math.cos(th2)*r, py=cy-Math.sin(th2)*r;
      if(j===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.stroke();
    ctx.fillStyle='rgba(52,211,196,.13)'; ctx.fill();
    var mean=0; for(j=0;j<NA;j++) mean+=mag[j]; mean/=NA;
    var wl = (2*Math.PI/Math.max(k,1e-6));
    $('dirInfo').textContent = 'object is '+(2*R/wl).toFixed(2)+
      ' wavelengths across  ·  focus '+(mx/(mean||1)).toFixed(2);
    txt(ctx,'loudness vs direction',16,24,C.hd,13);
    txt(ctx,(2*R/wl < 0.5) ? 'small vs wavelength: radiates evenly'
                           : 'large vs wavelength: beams and nulls',16,cv.height-16,C.warm,12);
  }
  $('dirF').addEventListener('input',draw); $('dirR').addEventListener('input',draw);
  draw();
})();

/* ================= 08 avoided crossings ================= */
(function(){
  var cv = $('cvCross'); if(!cv) return;
  var ctx = cv.getContext('2d');
  var NP = 140, NM = 5, curves = [], marks = [];
  (function compute(){
    var base = [1.0,1.55,1.9,2.5,2.9], slope = [1.5,0.15,-0.55,0.9,-0.2], g = 0.055;
    for(var p=0;p<NP;p++){
      var x = p/(NP-1);
      var A = new Float64Array(NM*NM);
      for(var i=0;i<NM;i++){ A[i*NM+i] = base[i]+slope[i]*x;
        if(i<NM-1){ A[i*NM+i+1] = g; A[(i+1)*NM+i] = g; } }
      var e = jacobiEigen(A,NM,30);
      curves.push(e.values.slice());
    }
    for(var k=0;k+1<NM;k++) for(var q=1;q+1<NP;q++){
      var d0=curves[q-1][k+1]-curves[q-1][k], d1=curves[q][k+1]-curves[q][k],
          d2=curves[q+1][k+1]-curves[q+1][k];
      if(d1<d0 && d1<d2 && d1<0.20) marks.push([q,k]);
    }
  })();
  function draw(){
    clear(ctx,cv.width,cv.height);
    var W=cv.width,H=cv.height, lo=0.8, hi=3.3;
    function PX(p){ return 46+(W-70)*p/(NP-1); }
    function PY(v){ return H-34-(H-60)*(v-lo)/(hi-lo); }
    ctx.strokeStyle='rgba(90,110,130,.22)';
    for(var g2=0;g2<=4;g2++){ var y=PY(lo+(hi-lo)*g2/4);
      ctx.beginPath(); ctx.moveTo(46,y); ctx.lineTo(W-24,y); ctx.stroke(); }
    for(var k=0;k<NM;k++){
      ctx.beginPath(); ctx.lineWidth=2;
      ctx.strokeStyle='hsl('+(178+k*26)+',68%,62%)';
      for(var p=0;p<NP;p++){
        var x=PX(p), y=PY(curves[p][k]);
        if(p===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    for(var m=0;m<marks.length;m++){
      var q=marks[m][0], kk=marks[m][1];
      var cx=PX(q), cy=(PY(curves[q][kk])+PY(curves[q][kk+1]))/2;
      ctx.strokeStyle=C.warm; ctx.lineWidth=1.7;
      ctx.beginPath(); ctx.arc(cx,cy,11,0,6.284); ctx.stroke();
    }
    txt(ctx,'mode frequency',14,26,C.dim,12);
    txt(ctx,'shape stretched  ->',W-24,H-12,C.dim,12,'right');
    txt(ctx,'circles: the curves nearly meet, then veer apart and swap roles',
        46,H-12,C.warm,12);
  }
  draw();
})();

/* ================= 09 showcase: whole pipeline ================= */
(function(){
  var cv = $('cvShow'); if(!cv) return;
  var ctx = cv.getContext('2d'), t0 = performance.now();
  var s = solveString(20), NG=14, s2 = solveString(NG);
  var pan = [
    'shape  ->  mesh','mesh  ->  K, M','eigensolve  ->  modes',
    'strike  ->  recipe','modes  ->  waveform','waveform  ->  room'];
  function box(i){
    var w = cv.width/3, h = cv.height/2;
    return { x:(i%3)*w+14, y:Math.floor(i/3)*h+14, w:w-28, h:h-28 };
  }
  function frame(){
    clear(ctx,cv.width,cv.height);
    var t = (performance.now()-t0)/1000, i;
    for(i=0;i<6;i++){
      var b = box(i);
      ctx.fillStyle='#131a23'; ctx.strokeStyle='rgba(90,169,255,.22)';
      ctx.lineWidth=1;
      ctx.beginPath(); ctx.rect(b.x,b.y,b.w,b.h); ctx.fill(); ctx.stroke();
      txt(ctx,(i+1)+'.  '+pan[i], b.x+11, b.y+19, C.ac2, 12.5);
    }
    // 1 mesh
    var b0 = box(0), g=6;
    for(var yy=-g;yy<g;yy++) for(var xx=-g;xx<g;xx++){
      var X=xx/g, Y=yy/g;
      if(X*X+Y*Y*1.3 < 0.72){
        var px=b0.x+b0.w/2+X*b0.w*0.36, py=b0.y+b0.h/2+Y*b0.h*0.34;
        var st=b0.w*0.36/g;
        ctx.strokeStyle='rgba(52,211,196,.42)'; ctx.lineWidth=0.8;
        ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+st,py);
        ctx.lineTo(px,py+st*0.95); ctx.closePath(); ctx.stroke();
      }
    }
    // 2 matrix
    var b1 = box(1), n=18, cs=Math.min(b1.w,b1.h-30)/n;
    var mx0 = b1.x+(b1.w-cs*n)/2, my0 = b1.y+30;
    for(var r=0;r<n;r++) for(var c3=0;c3<n;c3++){
      var d = Math.abs(r-c3);
      if(d<=2){ ctx.fillStyle='rgba(79,214,232,'+(0.75-0.25*d)+')';
        ctx.fillRect(mx0+c3*cs,my0+r*cs,cs-0.7,cs-0.7); }
    }
    // 3 modes
    var b2 = box(2), k2 = Math.floor(t*0.7)%5;
    ctx.strokeStyle=C.ac; ctx.lineWidth=2; ctx.beginPath();
    for(i=0;i<=s.N+1;i++){
      var v=(i===0||i===s.N+1)?0:s.phi[k2][i-1];
      var px2=b2.x+14+(b2.w-28)*i/(s.N+1);
      var py2=b2.y+b2.h*0.6-v*Math.sin(t*4)*b2.h*0.22;
      if(i===0) ctx.moveTo(px2,py2); else ctx.lineTo(px2,py2);
    }
    ctx.stroke();
    txt(ctx,'mode '+(k2+1),b2.x+11,b2.y+b2.h-11,C.faint,11);
    // 4 strike recipe
    var b3 = box(3), hitp=0.3+0.16*Math.sin(t*0.8);
    for(var kk=0;kk<8;kk++){
      var idx=Math.max(0,Math.min(s.N-1,Math.round(hitp*(s.N+1))-1));
      var a=Math.abs(s.phi[kk][idx]);
      var bw=(b3.w-30)/8, hh=a*(b3.h-56);
      ctx.fillStyle= a<0.06?'rgba(120,140,160,.35)':C.ac;
      ctx.fillRect(b3.x+15+kk*bw, b3.y+b3.h-18-hh, bw-6, hh);
    }
    txt(ctx,'strike at '+(hitp*100).toFixed(0)+'%',b3.x+11,b3.y+b3.h-4,C.faint,11);
    // 5 waveform
    var b4 = box(4);
    ctx.strokeStyle=C.ac; ctx.lineWidth=1.3; ctx.beginPath();
    for(i=0;i<b4.w-22;i++){
      var tt=i/(b4.w-22)*0.5, v2=0;
      for(var m2=0;m2<6;m2++)
        v2+=Math.sin(2*Math.PI*180*(s.omega[m2]/s.omega[0])*tt)*Math.exp(-(6+m2*9)*tt)/(m2+1);
      var yy2=b4.y+b4.h*0.62-v2*b4.h*0.20;
      if(i===0) ctx.moveTo(b4.x+11+i,yy2); else ctx.lineTo(b4.x+11+i,yy2);
    }
    ctx.stroke();
    // 6 radiation
    var b5 = box(5), ccx=b5.x+b5.w/2, ccy=b5.y+b5.h*0.58, PR=Math.min(b5.w,b5.h)*0.31;
    ctx.strokeStyle=C.ac; ctx.lineWidth=1.8; ctx.beginPath();
    for(var j2=0;j2<=120;j2++){
      var th3=6.283185*j2/120;
      var rr=(0.55+0.45*Math.abs(Math.cos(2.5*th3+t*0.5)))*PR;
      var qx=ccx+Math.cos(th3)*rr, qy=ccy-Math.sin(th3)*rr;
      if(j2===0) ctx.moveTo(qx,qy); else ctx.lineTo(qx,qy);
    }
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle='rgba(52,211,196,.13)'; ctx.fill();
    // arrows between panels
    ctx.strokeStyle='rgba(240,163,94,.5)'; ctx.lineWidth=1.4;
    for(i=0;i<5;i++){
      if(i===2) continue;
      var a1=box(i), a2=box(i+1);
      if(Math.floor(i/3)===Math.floor((i+1)/3)){
        var ax=a1.x+a1.w+2, ay=a1.y+a1.h/2;
        ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(a2.x-2,ay); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(a2.x-2,ay); ctx.lineTo(a2.x-8,ay-4);
        ctx.lineTo(a2.x-8,ay+4); ctx.closePath(); ctx.fillStyle='rgba(240,163,94,.6)'; ctx.fill();
      }
    }
    RAF(cv,frame);
  }
  if($('scRun')) $('scRun').addEventListener('click', function(){ t0 = performance.now(); });
  frame();
})();

})();
