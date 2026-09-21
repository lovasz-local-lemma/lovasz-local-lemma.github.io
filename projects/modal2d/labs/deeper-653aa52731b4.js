
(function(){
"use strict";
var $ = function(id){ return document.getElementById(id); };
var C = { ac:'#34d3c4', ac2:'#4fd6e8', warm:'#f0a35e', viol:'#b98cff',
          blue:'#5aa9ff', dim:'#8a99ab', faint:'#5e6e80', hd:'#e8eef5', bg:'#0b0f14' };


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

function clear(x,w,h){ x.fillStyle=C.bg; x.fillRect(0,0,w,h); }
function txt(x,s,px,py,col,size,al){
  x.fillStyle=col||C.dim; x.font=(size||11)+'px Inter,sans-serif';
  x.textAlign=al||'left'; x.fillText(s,px,py); x.textAlign='left'; }
function hsv(h,s,v){ // h in [0,1]
  var i=Math.floor(h*6), f=h*6-i, p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s), r,g,b;
  switch(i%6){ case 0:r=v;g=t;b=p;break; case 1:r=q;g=v;b=p;break; case 2:r=p;g=v;b=t;break;
    case 3:r=p;g=q;b=v;break; case 4:r=t;g=p;b=v;break; default:r=v;g=p;b=q; }
  return [Math.round(r*255),Math.round(g*255),Math.round(b*255)]; }

/* ============ 1. Huygens interference ============ */
(function(){
  var cv=$('cvHuy'); if(!cv) return;
  var x=cv.getContext('2d'), W=cv.width, H=cv.height;
  function mk(w){
    var h=Math.round(w*H/W), c=document.createElement('canvas');
    c.width=w; c.height=h;
    var cx=c.getContext('2d');
    return {c:c, x:cx, img:cx.createImageData(w,h), w:w, h:h};
  }
  /* Two buffers. Dragging renders the smaller one every frame; once you stop,
     the large one is filled a BAND AT A TIME across successive frames, so a
     much sharper image costs no dropped frames. Note both use every source --
     dropping sources would change the interference pattern itself, so the
     preview would stop resembling the result. Fewer pixels merely blurs. */
  var LO=mk(210), HI=mk(560);
  var pending=false, idleT=null, job=null;

  function params(){
    var k=+$('huyF').value*0.055, half=+$('huyW').value, curv=+$('huyC').value*0.012;
    var NS=2*half+1, sx=new Float64Array(NS), sy=new Float64Array(NS);
    for(var i=0;i<NS;i++){
      var u=(i-half)*9;
      sx[i]=W/2+u; sy[i]=H-26 + curv*u*u*0.02;
    }
    return {k:k, NS:NS, sx:sx, sy:sy, curv:curv};
  }
  function rows(B,buf,y0,y1,P){
    var kx=W/B.w, ky=H/B.h, mx=0;
    for(var py=y0;py<y1;py++){
      var wy=py*ky;
      for(var px=0;px<B.w;px++){
        var wx=px*kx, re=0, im=0;
        for(var i=0;i<P.NS;i++){
          var dx=wx-P.sx[i], dy=wy-P.sy[i];
          var r=Math.sqrt(dx*dx+dy*dy); if(r<3) r=3;
          var a=1/Math.sqrt(r), ph=-P.k*r;
          re+=a*Math.cos(ph); im+=a*Math.sin(ph);
        }
        var m=Math.sqrt(re*re+im*im);
        buf[py*B.w+px]=m; if(m>mx) mx=m;
      }
    }
    return mx;
  }
  function blit(B,buf,mx,P,note){
    var d=B.img.data, n=B.w*B.h, i;
    for(i=0;i<n;i++){
      var v=buf[i]/(mx||1); v=Math.pow(v,0.75);
      d[i*4]=Math.round(20+235*v*v); d[i*4+1]=Math.round(30+180*v);
      d[i*4+2]=Math.round(60+150*Math.sqrt(v)); d[i*4+3]=255;
    }
    B.x.putImageData(B.img,0,0);
    x.imageSmoothingEnabled=true;
    x.drawImage(B.c,0,0,W,H);
    x.fillStyle=C.warm;
    for(i=0;i<P.NS;i++){ x.beginPath(); x.arc(P.sx[i],P.sy[i],2.2,0,6.284); x.fill(); }
    txt(x,'brightness = how loud the air is at that point',12,20,C.hd,12.5);
    if(note) txt(x,note,W-14,20,C.faint,11.5,'right');
    var wl=6.283185/P.k;
    $('huyInfo').textContent='array is '+((P.NS*9)/wl).toFixed(1)+' wavelengths wide'+
      (Math.abs(P.curv)>0.02?'  ·  focused':'');
  }
  function fast(){
    job=null;
    var P=params(), buf=new Float32Array(LO.w*LO.h);
    blit(LO, buf, rows(LO,buf,0,LO.h,P), P, 'sharpening...');
  }
  function fullStart(){
    job={P:params(), buf:new Float32Array(HI.w*HI.h), y:0, mx:0};
    requestAnimationFrame(fullStep);
  }
  function fullStep(){
    if(!job) return;
    var band=Math.max(8, Math.round(HI.h/9));
    var y1=Math.min(HI.h, job.y+band);
    var m=rows(HI, job.buf, job.y, y1, job.P);
    if(m>job.mx) job.mx=m;
    job.y=y1;
    if(job.y<HI.h) requestAnimationFrame(fullStep);
    else { blit(HI, job.buf, job.mx, job.P, null); job=null; }
  }
  function schedule(){
    job=null;                                  // abandon any in-flight sharp pass
    if(!pending){ pending=true;
      requestAnimationFrame(function(){ pending=false; fast(); }); }
    if(idleT) clearTimeout(idleT);
    idleT=setTimeout(fullStart,170);
  }
  ['huyF','huyW','huyC'].forEach(function(id){ $(id).addEventListener('input',schedule); });
  fast(); fullStart();
})();

/* ============ 2. phasor ============ */
(function(){
  var cv=$('cvPhasor'); if(!cv) return;
  var x=cv.getContext('2d'), t0=performance.now();
  function frame(){
    clear(x,cv.width,cv.height);
    var A=+$('phA').value/100, ph=+$('phP').value*Math.PI/180;
    var t=(performance.now()-t0)/1000;
    var cx=118, cy=cv.height/2, R=72;
    x.strokeStyle='rgba(90,110,130,.35)'; x.lineWidth=1;
    x.beginPath(); x.arc(cx,cy,R,0,6.284); x.stroke();
    x.beginPath(); x.moveTo(cx-R-8,cy); x.lineTo(cx+R+8,cy); x.stroke();
    x.beginPath(); x.moveTo(cx,cy-R-8); x.lineTo(cx,cy+R+8); x.stroke();
    var ang=t*2.2+ph;
    var ex=cx+Math.cos(ang)*R*A, ey=cy-Math.sin(ang)*R*A;
    x.strokeStyle=C.viol; x.lineWidth=2.6;
    x.beginPath(); x.moveTo(cx,cy); x.lineTo(ex,ey); x.stroke();
    x.fillStyle=C.viol; x.beginPath(); x.arc(ex,ey,4.5,0,6.284); x.fill();
    x.strokeStyle='rgba(240,163,94,.55)'; x.setLineDash([3,3]); x.lineWidth=1;
    x.beginPath(); x.moveTo(ex,ey); x.lineTo(ex,cy); x.stroke(); x.setLineDash([]);
    txt(x,'the stored phasor',cx,cy+R+30,C.dim,12,'center');
    // wave
    var ox=250, ow=cv.width-ox-24, oy=cv.height/2;
    x.strokeStyle='rgba(90,110,130,.3)';
    x.beginPath(); x.moveTo(ox,oy); x.lineTo(ox+ow,oy); x.stroke();
    x.strokeStyle=C.ac; x.lineWidth=2; x.beginPath();
    for(var i=0;i<ow;i++){
      var tt=t-(ow-i)/ow*4.2;
      var v=A*Math.cos(tt*2.2+ph);
      var py=oy-v*62;
      if(i===0) x.moveTo(ox+i,py); else x.lineTo(ox+i,py);
    }
    x.stroke();
    x.fillStyle=C.ac2; x.beginPath();
    x.arc(ox+ow-1, oy-A*Math.cos(t*2.2+ph)*62, 4,0,6.284); x.fill();
    txt(x,'the pressure it produces  ->  read off, never simulated',ox,26,C.hd,12.5);
    $('phInfo').textContent='size '+A.toFixed(2)+'  ·  angle '+$('phP').value+' deg';
    RAF(cv,frame);
  }
  ['phA','phP'].forEach(function(id){ $(id).addEventListener('input',function(){}); });
  frame();
})();

/* ============ 3. nine views (six shown) ============ */
(function(){
  var cv=$('cvField'); if(!cv) return;
  var x=cv.getContext('2d'), W=cv.width, H=cv.height, mode=0;
  var names=['Live','Envelope','Phase','Intensity','Vorticity','Divergence'];
  var seg=$('fldSeg');
  names.forEach(function(nm,i){
    var b=document.createElement('button'); b.textContent=nm;
    if(i===0) b.className='on';
    b.onclick=function(){ mode=i;
      Array.prototype.forEach.call(seg.children,function(c,j){ c.className=(j===i)?'on':''; });
      draw(); };
    seg.appendChild(b);
  });
  var GW=215, GH=82; // computation grid, upscaled to canvas
  var RE=new Float32Array(GW*GH), IM=new Float32Array(GW*GH);
  var goff=document.createElement('canvas'); goff.width=GW; goff.height=GH;
  var goct=goff.getContext('2d'), img=goct.createImageData(GW,GH), t0=performance.now();
  function compute(){
    var k=+$('fldF').value*0.06, spread=+$('fldS').value;
    var src=[[GW/2-spread*0.6,GH*0.85],[GW/2,GH*0.15],[GW/2+spread*0.6,GH*0.8]];
    for(var j=0;j<GH;j++) for(var i=0;i<GW;i++){
      var re=0,im=0;
      for(var s=0;s<3;s++){
        var dx=i-src[s][0], dy=j-src[s][1];
        var r=Math.sqrt(dx*dx+dy*dy); if(r<2) r=2;
        var a=1/Math.sqrt(r);
        re+=a*Math.cos(-k*r); im+=a*Math.sin(-k*r);
      }
      RE[j*GW+i]=re; IM[j*GW+i]=im;
    }
  }
  function at(a,i,j){ i=Math.max(0,Math.min(GW-1,i)); j=Math.max(0,Math.min(GH-1,j)); return a[j*GW+i]; }
  function inten(i,j){ // energy flow vector
    var re=at(RE,i,j), im=at(IM,i,j);
    var gxr=(at(RE,i+1,j)-at(RE,i-1,j))*0.5, gxi=(at(IM,i+1,j)-at(IM,i-1,j))*0.5;
    var gyr=(at(RE,i,j+1)-at(RE,i,j-1))*0.5, gyi=(at(IM,i,j+1)-at(IM,i,j-1))*0.5;
    return [re*gxi-im*gxr, re*gyi-im*gyr];
  }
  function draw(){
    var t=(performance.now()-t0)/1000, d=img.data;
    // precompute per-grid value then upscale
    var val=new Float32Array(GW*GH), hue=new Float32Array(GW*GH), useHue=(mode===2), mx=0, i,j;
    for(j=0;j<GH;j++) for(i=0;i<GW;i++){
      var idx=j*GW+i, re=RE[idx], im=IM[idx], v=0;
      if(mode===0) v=re*Math.cos(t*2.4)-im*Math.sin(t*2.4);
      else if(mode===1) v=Math.sqrt(re*re+im*im);
      else if(mode===2){ v=Math.sqrt(re*re+im*im); hue[idx]=(Math.atan2(im,re)/6.283185+0.5); }
      else if(mode===3){ var I=inten(i,j); v=Math.sqrt(I[0]*I[0]+I[1]*I[1]); }
      else if(mode===4){ var a1=inten(i+1,j)[1],a2=inten(i-1,j)[1],
                             b1=inten(i,j+1)[0],b2=inten(i,j-1)[0];
                         v=(a1-a2)*0.5-(b1-b2)*0.5; }
      else { var c1=inten(i+1,j)[0],c2=inten(i-1,j)[0],
                 e1=inten(i,j+1)[1],e2=inten(i,j-1)[1];
             v=(c1-c2)*0.5+(e1-e2)*0.5; }
      val[idx]=v; if(Math.abs(v)>mx) mx=Math.abs(v);
    }
    if(mx<1e-12) mx=1;
    for(var py=0;py<GH;py++){
      var gj=py;
      for(var px=0;px<GW;px++){
        var gi=px;
        var idx2=gj*GW+gi, v2=val[idx2]/mx, o=(py*GW+px)*4, r,g,b;
        if(useHue){
          var c=hsv(hue[idx2],0.82,Math.min(1,Math.abs(v2)*2.2));
          r=c[0]; g=c[1]; b=c[2];
        } else if(mode===1||mode===3){
          var u=Math.pow(Math.abs(v2),0.7);
          r=Math.round(18+230*u*u); g=Math.round(28+200*u); b=Math.round(58+150*Math.sqrt(u));
        } else {
          var s2=Math.max(-1,Math.min(1,v2*2.2));
          if(s2>0){ r=Math.round(20+235*s2); g=Math.round(28+60*s2); b=Math.round(40+30*s2); }
          else { r=Math.round(20-10*s2); g=Math.round(60-60*s2); b=Math.round(70-185*s2); }
        }
        d[o]=r; d[o+1]=g; d[o+2]=b; d[o+3]=255;
      }
    }
    goct.putImageData(img,0,0);
    x.imageSmoothingEnabled=true;
    x.drawImage(goff,0,0,W,H);
    txt(x,names[mode],14,24,C.hd,14);
    var ex={0:'the wave, moving',1:'standing pattern - dark = permanently quiet',
      2:'colour = phase; where all colours meet is a singularity',
      3:'brightness = how fast energy flows there',
      4:'swirl of the energy flow - whirlpools sit on the singularities',
      5:'where flow appears from nothing'};
    txt(x,ex[mode],14,H-14,C.warm,12);
    $('fldInfo').textContent=names[mode]+' view';
    if(mode===0) RAF(cv,draw);
  }
  function redo(){ compute(); draw(); }
  ['fldF','fldS'].forEach(function(id){ $(id).addEventListener('input',redo); });
  redo();
})();

/* ============ 4. duct + helmholtz ============ */
(function(){
  var cd=$('cvDuct'), ch=$('cvHelm'); if(!cd||!ch) return;
  var a=cd.getContext('2d'), b=ch.getContext('2d');
  function draw(){
    var L=+$('ductL').value, neck=+$('helmN').value;
    clear(a,cd.width,cd.height);
    var ox=26, oy=44, w=cd.width-52, h=52;
    for(var m=1;m<=3;m++){
      var yy=oy+(m-1)*74;
      for(var i=0;i<w;i++){
        var v=Math.cos(m*Math.PI*i/w);
        var r,g,bl;
        if(v>0){ r=Math.round(242-72*v); g=Math.round(235-200*v); bl=Math.round(220-190*v); }
        else { r=Math.round(242+216*v); g=Math.round(235+140*v); bl=Math.round(220-10*v); }
        a.fillStyle='rgb('+r+','+g+','+bl+')';
        a.fillRect(ox+i,yy,1.4,h);
      }
      a.strokeStyle='rgba(90,169,255,.35)'; a.strokeRect(ox,yy,w,h);
      txt(a,'mode '+m+'   f = '+m+' x (c/2L)',ox,yy-6,C.dim,11.5);
      for(var n2=1;n2<m;n2++){
        var px=ox+w*n2/m;
        a.strokeStyle='rgba(240,163,94,.8)'; a.setLineDash([3,3]);
        a.beginPath(); a.moveTo(px,yy); a.lineTo(px,yy+h); a.stroke(); a.setLineDash([]);
      }
    }
    txt(a,'air modes in a closed box (pressure)',14,20,C.hd,12.5);
    // helmholtz curve
    clear(b,ch.width,ch.height);
    var bx=44, by=ch.height-42, bw=ch.width-70, bh=ch.height-80;
    b.strokeStyle='rgba(90,110,130,.35)';
    b.beginPath(); b.moveTo(bx,by-bh); b.lineTo(bx,by); b.lineTo(bx+bw,by); b.stroke();
    b.strokeStyle=C.viol; b.lineWidth=2.2; b.beginPath();
    for(var i2=0;i2<bw;i2++){
      var V=0.25+2.4*i2/bw;
      var f=1/Math.sqrt(V*neck*0.02);
      var py=by-Math.min(bh,f*bh*0.30);
      if(i2===0) b.moveTo(bx+i2,py); else b.lineTo(bx+i2,py);
    }
    b.stroke();
    var Vm=0.25+2.4*(L-20)/80, fm=1/Math.sqrt(Vm*neck*0.02);
    var mxp=bx+bw*(L-20)/80, myp=by-Math.min(bh,fm*bh*0.30);
    b.fillStyle=C.warm; b.beginPath(); b.arc(mxp,myp,5,0,6.284); b.fill();
    txt(b,'bottle note vs body size',14,20,C.hd,12.5);
    txt(b,'bigger body  ->',bx+bw,by+18,C.dim,11,'right');
    txt(b,'pitch',10,by-bh+4,C.dim,11);
    $('ductInfo').textContent='box '+L+'  ·  neck '+neck+
      '  ·  bottle note '+(fm*100).toFixed(0)+' (arb)';
  }
  ['ductL','helmN'].forEach(function(id){ $(id).addEventListener('input',draw); });
  draw();
})();

/* ============ 5. structure-air coupling ============ */
(function(){
  var cv=$('cvCouple'); if(!cv) return;
  var x=cv.getContext('2d');
  function draw(){
    clear(x,cv.width,cv.height);
    var g=+$('cplG').value/1000, W=cv.width, H=cv.height, N=180;
    var lo=0.55, hi=1.5;
    function PX(i){ return 52+(W-80)*i/(N-1); }
    function PY(v){ return H-38-(H-70)*(v-lo)/(hi-lo); }
    // uncoupled (dashed)
    x.setLineDash([4,4]); x.lineWidth=1.3;
    x.strokeStyle='rgba(140,160,180,.55)';
    x.beginPath();
    for(var i=0;i<N;i++){ var p=i/(N-1), y=PY(1.0);
      if(i===0) x.moveTo(PX(i),y); else x.lineTo(PX(i),y); }
    x.stroke();
    x.beginPath();
    for(i=0;i<N;i++){ var p2=i/(N-1), y2=PY(0.65+0.72*p2);
      if(i===0) x.moveTo(PX(i),y2); else x.lineTo(PX(i),y2); }
    x.stroke(); x.setLineDash([]);
    // coupled: eigenvalues of [[a,g],[g,b]]
    var cols=[C.ac,C.warm];
    for(var br=0;br<2;br++){
      x.strokeStyle=cols[br]; x.lineWidth=2.4; x.beginPath();
      for(i=0;i<N;i++){
        var p3=i/(N-1), A=1.0, B=0.65+0.72*p3;
        var mean=(A+B)/2, dd=Math.sqrt(((A-B)/2)*((A-B)/2)+g*g);
        var v=br===0? mean-dd : mean+dd;
        var yy=PY(v);
        if(i===0) x.moveTo(PX(i),yy); else x.lineTo(PX(i),yy);
      }
      x.stroke();
    }
    var minGap=2*g;
    txt(x,'frequency',14,26,C.dim,12);
    txt(x,'air cavity tuned upward  ->',W-24,H-14,C.dim,12,'right');
    txt(x,'dashed = if they ignored each other   solid = the real coupled answer',
        52,H-14,C.viol,12);
    $('cplInfo').textContent = g<0.001 ? 'no coupling: they cross'
      : 'closest approach '+(minGap).toFixed(3)+' - they never touch';
  }
  $('cplG').addEventListener('input',draw); draw();
})();

/* ============ 6. curvature stiffens ============ */
(function(){
  var cv=$('cvShell'); if(!cv) return;
  var x=cv.getContext('2d');
  function draw(){
    clear(x,cv.width,cv.height);
    var c=+$('shC').value/100;
    var W=cv.width, cx=W/2, y0=118, L=W-160;
    // stiffness rises steeply with curvature (illustrative)
    var stiff=1+34*c*c;
    var defl=52/stiff;
    for(var pass=0;pass<2;pass++){
      x.strokeStyle= pass===0 ? 'rgba(120,140,160,.45)' : C.viol;
      x.lineWidth= pass===0?1.4:2.6;
      x.setLineDash(pass===0?[4,4]:[]);
      x.beginPath();
      for(var i=0;i<=120;i++){
        var u=i/120, px=cx-L/2+L*u;
        var curve=-c*70*Math.sin(Math.PI*u);
        var bend= pass===0 ? 0 : defl*Math.sin(Math.PI*u);
        x.lineTo(px, y0+curve+bend);
      }
      x.stroke();
    }
    x.setLineDash([]);
    // arrow (the push)
    x.strokeStyle=C.warm; x.lineWidth=2;
    x.beginPath(); x.moveTo(cx,y0-c*70-46); x.lineTo(cx,y0-c*70-8); x.stroke();
    x.beginPath(); x.moveTo(cx,y0-c*70-4); x.lineTo(cx-5,y0-c*70-14);
    x.lineTo(cx+5,y0-c*70-14); x.closePath(); x.fillStyle=C.warm; x.fill();
    // bar
    var bw=250, bx=cv.width/2-bw/2, by=cv.height-52;
    x.fillStyle='rgba(90,110,130,.25)'; x.fillRect(bx,by,bw,13);
    x.fillStyle=C.viol; x.fillRect(bx,by,bw*Math.min(1,Math.sqrt(stiff)/6),13);
    txt(x,'stiffness',bx,by-7,C.dim,11.5);
    txt(x,'dashed = shape at rest   solid = pushed',18,26,C.hd,12.5);
    $('shInfo').textContent='curvature '+(c*100).toFixed(0)+'%  ·  '+stiff.toFixed(1)+
      'x stiffer  ·  pitch x'+Math.sqrt(stiff).toFixed(2);
  }
  $('shC').addEventListener('input',draw); draw();
})();

/* ============ 7. tetrahedra ============ */
(function(){
  var cv=$('cvTet'); if(!cv) return;
  var x=cv.getContext('2d'), yaw=0.6, pitch=0.42, drag=false, lx=0, ly=0, t0=performance.now();
  var nodeCache={n:-1,c:0};
  cv.addEventListener('mousedown',function(e){ drag=true; lx=e.clientX; ly=e.clientY; });
  window.addEventListener('mouseup',function(){ drag=false; });
  window.addEventListener('mousemove',function(e){
    if(!drag) return; yaw+=(e.clientX-lx)*0.01; pitch+=(e.clientY-ly)*0.01;
    lx=e.clientX; ly=e.clientY; });
  function frame(){
    clear(x,cv.width,cv.height);
    var n=+$('tetN').value, spin=$('tetSpin').checked;
    var t=(performance.now()-t0)/1000;
    var Y=yaw+(spin?t*0.35:0), P=pitch;
    var cx=cv.width/2, cy=cv.height/2+10, S=Math.min(cv.width,cv.height)*0.34;
    function proj(px,py,pz){
      var X=px*Math.cos(Y)-pz*Math.sin(Y);
      var Z=px*Math.sin(Y)+pz*Math.cos(Y);
      var Yy=py*Math.cos(P)-Z*Math.sin(P);
      var Zz=py*Math.sin(P)+Z*Math.cos(P);
      var f=1/(1+Zz*0.30);
      return [cx+X*S*f, cy-Yy*S*f, Zz];
    }
    var edges=[], i,j,k;
    for(k=0;k<n;k++) for(j=0;j<n;j++) for(i=0;i<n;i++){
      var u=(i/(n-1||1))*2-1, v=(j/(n-1||1))*2-1, w=(k/(n-1||1))*2-1;
      if(u*u+v*v+w*w>1.05) continue;
      var s=2/(n-1||1)*0.5;
      var a=proj(u,v,w), b=proj(u+s,v,w), c=proj(u,v+s,w), d=proj(u,v,w+s);
      edges.push([a,b,(a[2]+b[2])/2]); edges.push([a,c,(a[2]+c[2])/2]);
      edges.push([a,d,(a[2]+d[2])/2]); edges.push([b,c,(b[2]+c[2])/2]);
      edges.push([b,d,(b[2]+d[2])/2]); edges.push([c,d,(c[2]+d[2])/2]);
    }
    edges.sort(function(p,q){ return q[2]-p[2]; });
    for(i=0;i<edges.length;i++){
      var e=edges[i], dep=Math.max(0,Math.min(1,(e[2]+1)/2));
      x.strokeStyle='rgba('+Math.round(80+100*(1-dep))+','+Math.round(180+50*(1-dep))+',235,'+(0.22+0.5*(1-dep))+')';
      x.lineWidth=0.9;
      x.beginPath(); x.moveTo(e[0][0],e[0][1]); x.lineTo(e[1][0],e[1][1]); x.stroke();
    }
    if(nodeCache.n!==n){ var cnt=0;
      for(k=0;k<n;k++) for(j=0;j<n;j++) for(i=0;i<n;i++){
        var u2=(i/(n-1||1))*2-1, v2=(j/(n-1||1))*2-1, w2=(k/(n-1||1))*2-1;
        if(u2*u2+v2*v2+w2*w2<=1.05) cnt++;
      }
      nodeCache={n:n,c:cnt};
    }
    var nodes=nodeCache.c;
    txt(x,'drag to rotate',14,24,C.dim,12);
    $('tetInfo').textContent=nodes+' nodes  ·  '+(nodes*3)+' degrees of freedom  ·  '+
      'solve cost ~ '+((nodes*3/100)*(nodes*3/100)*(nodes*3/100)).toFixed(0)+' units';
    RAF(cv,frame);
  }
  frame();
})();

/* ============ 8. spacetime block ============ */
(function(){
  var cv=$('cvSpace'); if(!cv) return;
  var x=cv.getContext('2d'), kind=0, t0=performance.now();
  var seg=$('stSeg');
  ['standing','travelling'].forEach(function(nm,i){
    var b=document.createElement('button'); b.textContent=nm;
    if(i===0) b.className='on';
    b.onclick=function(){ kind=i;
      Array.prototype.forEach.call(seg.children,function(c,j){ c.className=(j===i)?'on':''; }); };
    seg.appendChild(b);
  });
  var SW=190, SH=96, soff=document.createElement('canvas');
  soff.width=SW; soff.height=SH;
  var soct=soff.getContext('2d'), simg=soct.createImageData(SW,SH);
  function wave(u,t){
    return kind===0 ? Math.sin(u*9.4)*Math.cos(t*2.4)
                    : Math.sin(u*9.4 - t*2.4);
  }
  function frame(){
    clear(x,cv.width,cv.height);
    var t=(performance.now()-t0)/1000, win=+$('stW').value;
    // left: animated
    var ox=26, ow=340, oy=cv.height/2;
    x.strokeStyle='rgba(90,110,130,.3)';
    x.beginPath(); x.moveTo(ox,oy); x.lineTo(ox+ow,oy); x.stroke();
    x.strokeStyle=C.ac; x.lineWidth=2.2; x.beginPath();
    for(var i=0;i<=ow;i++){
      var u=i/ow, v=wave(u,t);
      var py=oy-v*66;
      if(i===0) x.moveTo(ox+i,py); else x.lineTo(ox+i,py);
    }
    x.stroke();
    txt(x,'live: one instant at a time',ox,26,C.hd,12.5);
    // right: spacetime block
    var bx=430, bw=cv.width-bx-26, bh=cv.height-70, by=44;
    var sd=simg.data;
    for(var r=0;r<SH;r++){
      var tt=t+(r/SH)*win*2.6;
      for(var c=0;c<SW;c++){
        var u2=c/SW, v2=wave(u2,tt);
        var s=Math.max(-1,Math.min(1,v2)), o=(r*SW+c)*4;
        if(s>0){ sd[o]=(20+235*s)|0; sd[o+1]=(30+70*s)|0; sd[o+2]=(45+35*s)|0; }
        else { sd[o]=(20-8*s)|0; sd[o+1]=(60-60*s)|0; sd[o+2]=(72-183*s)|0; }
        sd[o+3]=255;
      }
    }
    soct.putImageData(simg,0,0);
    x.imageSmoothingEnabled=true;
    x.drawImage(soff,bx,by,bw,bh);
    x.strokeStyle='rgba(90,169,255,.3)'; x.strokeRect(bx,by,bw,bh);
    txt(x,'space  ->',bx,by-8,C.dim,11.5);
    txt(x,'time',bx-22,by+bh/2,C.dim,11.5);
    txt(x, kind===0?'vertical stripes = nodes that never move'
                   :'slanted stripes = the wave travelling',
        bx,cv.height-14,C.warm,12);
    $('stInfo').textContent = kind===0? 'standing: nodes fixed in space'
                                      : 'travelling: slope = speed';
    RAF(cv,frame);
  }
  frame();
})();

/* ============ 9. where the formulas run out ============ */
(function(){
  var cv=$('cvWhy'); if(!cv) return;
  var x=cv.getContext('2d');
  function radius(th, d){
    // a circle at d=0, progressively lumpier after that
    return 1 + d*(0.26*Math.sin(3*th+0.6) + 0.15*Math.sin(5*th+2.1) - 0.11*Math.cos(2*th));
  }
  function draw(){
    clear(x,cv.width,cv.height);
    var d=+$('whyD').value/100, g=+$('whyR').value;
    var cx=cv.width*0.30, cy=cv.height*0.52, S=Math.min(cv.width*0.20,cv.height*0.38);
    function inShape(u,v){
      var r=Math.sqrt(u*u+v*v); if(r<1e-9) return true;
      return r <= radius(Math.atan2(v,u), d);
    }
    // outline
    x.strokeStyle=d>0.001?'rgba(185,140,255,.85)':'rgba(79,214,232,.9)';
    x.lineWidth=2; x.beginPath();
    for(var a=0;a<=180;a++){
      var th=6.283185*a/180, rr=radius(th,d);
      var px=cx+Math.cos(th)*rr*S, py=cy-Math.sin(th)*rr*S;
      if(a===0) x.moveTo(px,py); else x.lineTo(px,py);
    }
    x.closePath(); x.stroke();
    // mesh
    var nodes=0, tris=0, i, j;
    var idx={};
    for(j=-g;j<=g;j++) for(i=-g;i<=g;i++){
      var u=i/g*1.35, v=j/g*1.35;
      if(inShape(u,v)){ idx[i+','+j]=1; nodes++; }
    }
    x.strokeStyle='rgba(52,211,196,.35)'; x.lineWidth=0.8;
    for(j=-g;j<g;j++) for(i=-g;i<g;i++){
      var a1=idx[i+','+j], b1=idx[(i+1)+','+j], c1=idx[i+','+(j+1)], d1=idx[(i+1)+','+(j+1)];
      var X=function(ii){ return cx+(ii/g*1.35)*S; }, Y=function(jj){ return cy-(jj/g*1.35)*S; };
      if(a1&&b1&&c1){ x.beginPath(); x.moveTo(X(i),Y(j)); x.lineTo(X(i+1),Y(j));
        x.lineTo(X(i),Y(j+1)); x.closePath(); x.stroke(); tris++; }
      if(b1&&d1&&c1){ x.beginPath(); x.moveTo(X(i+1),Y(j)); x.lineTo(X(i+1),Y(j+1));
        x.lineTo(X(i),Y(j+1)); x.closePath(); x.stroke(); tris++; }
    }
    // verdict panel
    var bx=cv.width*0.56, by=52;
    if(d<0.005){
      x.fillStyle='rgba(79,214,232,.10)';
      x.fillRect(bx-14,by-30,cv.width-bx-12,132);
      x.strokeStyle='rgba(79,214,232,.5)'; x.lineWidth=1;
      x.strokeRect(bx-14,by-30,cv.width-bx-12,132);
      txt(x,'a perfect circle',bx,by-6,C.ac2,15);
      txt(x,'modes have a closed form:',bx,by+22,C.dim,13);
      txt(x,'J_m( j_mn  r / R ) cos( m theta )',bx,by+46,C.hd,14);
      txt(x,'no mesh, no solver, no computer needed',bx,by+72,C.faint,12);
    } else {
      x.fillStyle='rgba(240,163,94,.10)';
      x.fillRect(bx-14,by-30,cv.width-bx-12,132);
      x.strokeStyle='rgba(240,163,94,.5)'; x.lineWidth=1;
      x.strokeRect(bx-14,by-30,cv.width-bx-12,132);
      txt(x,'not a circle any more',bx,by-6,C.warm,15);
      txt(x,'closed form:  none exists',bx,by+22,C.warm,13);
      txt(x,'the only way through is to mesh it',bx,by+46,C.hd,13);
      txt(x,'and solve the matrices numerically',bx,by+66,C.hd,13);
      txt(x,'-> exactly what Modal2D does',bx,by+90,C.ac,12.5);
    }
    txt(x,nodes+' nodes  ·  '+tris+' triangles  ·  '+(nodes*2)+' unknowns',
        cx,cv.height-14,C.dim,12,'center');
    $('whyInfo').textContent = d<0.005 ? 'circle: solvable with a pencil'
                                       : 'deformed: needs the full machinery';
  }
  ['whyD','whyR'].forEach(function(id){ $(id).addEventListener('input',draw); });
  draw();
})();


})();
