/* Linear-RGB source-over teaching model derived from RIVX's time-slice export notes. */
(() => {
  'use strict';
  function weights(beta, order, corrected) {
    const alphaA = corrected ? (order === 'ab' ? 1 : 1 - beta) : 1 - beta;
    const alphaB = corrected ? (order === 'ab' ? beta : 1) : beta;
    return order === 'ab' ? {a: alphaA * (1 - alphaB), b: alphaB, background: (1 - alphaA) * (1 - alphaB), alphaA, alphaB}
      : {a: alphaA, b: alphaB * (1 - alphaA), background: (1 - alphaA) * (1 - alphaB), alphaA, alphaB};
  }
  function solveSchedule(target, order) {
    const alphas=target.map(()=>0);let left=1;
    for(const j of [...order].reverse()){alphas[j]=left>1e-12?Math.min(1,target[j]/left):0;left=Math.max(0,left-target[j]);}
    return alphas;
  }
  function visibleWeights(alphas,order){const visible=alphas.map(()=>0);let left=1;for(const j of [...order].reverse()){visible[j]=alphas[j]*left;left*=1-alphas[j];}return {visible,background:left};}
  function composite(a, b, background, w) { return a.map((x, k) => x * w.a + b[k] * w.b + background[k] * w.background); }
  const srgb = x => x <= .0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - .055;
  function slice(u, v, phase) {
    const x = u * 2 - 1, y = v * 2 - 1;
    const center = phase === 0 ? -.34 : .34;
    const field = Math.exp(-((x - center) ** 2 * 8 + (y + .1) ** 2 * 3));
    const ripple = .25 + .75 * Math.cos((x - center) * 10 + y * 4) ** 2;
    const light = field * (.3 + .7 * ripple);
    const color = phase === 0 ? [.94, .36, .065] : [.07, .64, .72];
    return color.map(c => .018 + light * c * .84);
  }
  function backdrop(u, v) {
    const light = (Math.floor(u * 14) + Math.floor(v * 10)) % 2;
    return light ? [.60, .52, .76] : [.16, .12, .24];
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {weights, composite, srgb, slice, backdrop, solveSchedule, visibleWeights};
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id), canvas = $('stage'), ctx = canvas.getContext('2d');
  if (!ctx) return;
  const buffer = document.createElement('canvas'); buffer.width = 280; buffer.height = 176;
  const bc = buffer.getContext('2d'), image = bc.createImageData(buffer.width, buffer.height);
  // The source fields never change. Cache them once so dragging alpha only composites
  // pixels; the display transfer is a finite 8-bit lookup, not transport computation.
  const fieldsA = new Float32Array(buffer.width * buffer.height * 3);
  const fieldsB = new Float32Array(fieldsA.length), fieldsC = new Float32Array(fieldsA.length), display = new Uint8Array(4097);
  const backdropField = new Float32Array(fieldsA.length);
  for (let i = 0; i <= 4096; ++i) display[i] = Math.round(srgb(i / 4096) * 255);
  for (let y = 0; y < buffer.height; ++y) for (let x = 0; x < buffer.width; ++x) {
    const offset = (y * buffer.width + x) * 3, u = (x + .5) / buffer.width, v = (y + .5) / buffer.height;
    fieldsA.set(slice(u, v, 0), offset); fieldsB.set(slice(u, v, 1), offset);
    fieldsC.set([.55,.18,.65].map(c=>.018+c*Math.exp(-((u-.5)**2*20+(v-.65)**2*30))*(.3+.7*Math.cos(u*24-v*15)**2)),offset);
    backdropField.set(backdrop(u, v), offset);
  }
  let pending = 0, disposed = false, playing=false, last=0, hostVisible=true, animation=0;
  function wakeAnimation(){if(!animation&&playing&&!disposed&&!document.hidden&&hostVisible)animation=requestAnimationFrame(animate);}
  function animate(t){animation=0;if(!playing||disposed||document.hidden||!hostVisible){last=0;return;}if(last)$('blend').value=(1+Math.sin(t*.0007))*.5;last=t;draw();wakeAnimation();}
  const schedule = () => { if (!disposed && !pending && !document.hidden) pending = requestAnimationFrame(() => { pending = 0; draw(); }); };
  function draw() {
    const box = canvas.getBoundingClientRect(), w = box.width, h = box.height, dpr = Math.min(devicePixelRatio || 1, 2);
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const beta = +$('blend').value, bg = +$('background').value, order = $('order').value;
    $('blend-out').value = beta.toFixed(2); $('background-out').value = bg.toFixed(2);
    const third=+$('third').value, target=[(1-beta)*(1-third),beta*(1-third),third], orderIds=order==='ab'?[0,1,2]:[2,1,0];
    $('third-out').value=third.toFixed(2);
    const alpha=solveSchedule(target,orderIds), old=visibleWeights(target,orderIds), fixed=visibleWeights(alpha,orderIds);
    const coeff=(r,a)=>({a:r.visible[0],b:r.visible[1],c:r.visible[2],background:r.background,alphaA:a[0],alphaB:a[1],alphaC:a[2]});
    const naive=coeff(old,target),corrected=coeff(fixed,alpha);
    $('schedule').textContent='Bottom → top: '+orderIds.map(j=>'ABC'[j]+' α='+alpha[j].toFixed(3)+' → '+(target[j]*100).toFixed(1)+'% visible').join(' · ');
    $('leak').textContent = (naive.background * 100).toFixed(1) + '%';
    $('weight-a').textContent = (corrected.a * 100).toFixed(1) + '%';
    $('weight-b').textContent = (corrected.b * 100).toFixed(1) + '%';
    const stack=w<600, margin=16,gap=16,pw=stack?w-margin*2:(w-margin*2-gap)/2,ph=Math.min((stack?h/2:h)-117,pw*.70),top=44;
    function panel(x, coeffs, title, color, yOffset=0) {
      ctx.save();ctx.translate(0,yOffset);
      let offset = 0;
      const back = bg * coeffs.background;
      for (let i = 0; i < fieldsA.length; i += 3) {
        for (let k = 0; k < 3; ++k) {
          const linear = fieldsA[i + k] * coeffs.a + fieldsB[i + k] * coeffs.b + fieldsC[i+k]*coeffs.c + backdropField[i + k] * back;
          image.data[offset++] = display[Math.round(Math.min(1, Math.max(0, linear)) * 4096)];
        }
        image.data[offset++] = 255;
      }
      bc.putImageData(image, 0, 0); ctx.drawImage(buffer, x, top, pw, ph);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(x, top, pw, ph);
      ctx.fillStyle = color; ctx.font = '13px system-ui'; ctx.fillText(title, x, 25);
      const y = top + ph + 14, bh = 12;
      let cursor = x;
      for (const [key, tint] of [['a', '#edba70'], ['b', '#79d4d0'], ['c', '#ca79da'], ['background', '#77778a']]) {
        const width = pw * coeffs[key]; ctx.fillStyle = tint; ctx.fillRect(cursor, y, width, bh); cursor += width;
      }
      ctx.font = '11px system-ui'; ctx.fillStyle = '#c3c8d5';
      ctx.fillText(`αA ${coeffs.alphaA.toFixed(2)}   αB ${coeffs.alphaB.toFixed(2)}   αC ${coeffs.alphaC.toFixed(2)}`, x, y + 31);
      ctx.fillStyle = '#8ea0b8';
      ctx.fillText(`A ${(coeffs.a * 100).toFixed(0)}% · B ${(coeffs.b * 100).toFixed(0)}% · C ${(coeffs.c*100).toFixed(0)}% · BG ${(coeffs.background * 100).toFixed(0)}%`, x, y + 49);
    }
    panel(margin, naive, 'Complementary alphas', '#c6aacb');
    panel(stack?margin:margin+pw+gap,corrected,'Solved visible weights','#87dfcd',stack?h/2:0);
    canvas.setAttribute('aria-label', `At blend ${beta.toFixed(2)}, complementary alphas expose ${(naive.background * 100).toFixed(1)} percent of the purple checkerboard backdrop. The solved schedule has no checkerboard contribution and visible slice weights ${corrected.a.toFixed(2)} and ${corrected.b.toFixed(2)}.`);
  }
  ['blend', 'background', 'order', 'third'].forEach(id => $(id).addEventListener('input', schedule));
  $('midpoint').addEventListener('click', () => { $('blend').value = .5; $('third').value=0; schedule(); });
  $('three').onclick=()=>{$('blend').value=.5;$('third').value=1/3;schedule();};
  $('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause blend':'Play blend';$('play').setAttribute('aria-pressed',playing);last=0;if(playing)wakeAnimation();};
  window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='portfolio-lab-visibility'){hostVisible=e.data.visible;last=0;if(playing&&hostVisible)wakeAnimation();}});
  $('reset').addEventListener('click', () => { $('blend').value = .5; $('background').value = .45; $('order').value = 'ab'; $('third').value=0; schedule(); });
  const observer = new ResizeObserver(schedule); observer.observe(canvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(pending); pending = 0; } else {schedule();last=0;if(playing&&hostVisible)wakeAnimation();} });
  window.addEventListener('pagehide', () => { disposed = true; cancelAnimationFrame(animation);animation=0;cancelAnimationFrame(pending); pending = 0; observer.disconnect(); });
  window.addEventListener('pageshow', () => { disposed = false; observer.observe(canvas); schedule(); });
  schedule();
})();
