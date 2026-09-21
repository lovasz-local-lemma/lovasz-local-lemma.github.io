(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const names={pt:'Path tracing',mis:'Path tracing + MIS',lt:'Light tracing',pm:'Photon mapping'};
  const colors={pt:'#8bd6c7',mis:'#edcf89',lt:'#c1aeef',pm:'#9bcdf4'};
  const sceneNames={courtyard:'Diffuse courtyard',small_light:'A very small emitter',baffle:'Around the shelf',rgb:'Three colored emitters',direct:'Direct-light calibration'};
  const descriptions={
    pt:'Begin at the camera. Sample cosine-weighted diffuse reflections until an emitter is reached or the bounce budget runs out.',
    mis:'A camera path plus explicit light connections. Multiple importance sampling combines both ways of finding an emitter.',
    lt:'Begin on an emitter. At each diffuse vertex, connect to the camera and splat into the correct angular bin. Every launch is counted.',
    pm:'Emit photons, retain their incident flux on surfaces, then gather at the camera’s visible points. A finite-radius density estimate trades sharpness for stability; it is biased.'
  };
  const formulas={pt:'β ← β · f cos θ / p = β · ρ',mis:'w = p² / (p² + q²)',lt:'ΔLbin = Φ · f · cos θ / (r Δθ)',pm:'L̂ = (ρ / 2) · ΣΦ / (N · ℓkernel)'};
  const labels={camera:'Camera ray',bounce:'Surface intersection',sample:'Sample direction',emission:'Emitter contribution',connect:'Connect to light',blocked:'Rejected connection',escape:'Escape',launch:'Emit a path','light-bounce':'Light-path intersection',direct:'Direct emitter → camera','camera-connect':'Connect to camera',backface:'Dark emitter back','photon-launch':'Emit a photon','photon-hit':'Photon intersection','photon-store':'Store incident flux',gather:'Gather on the surface'};
  let snapshot=null,selected='mis',step=0,auto=!matchMedia('(prefers-reduced-motion: reduce)').matches,busy=false,initialized=false,epoch=0,requestId=0,framePending=false,bootFailed=false;
  let batchSize=128,computeMs=0,lastAutoStart=0,inspectionVersion=0;
  const pending=new Map();
  const worker=new Worker('transport-worker.js');
  worker.onmessage=({data})=>{
    const wait=pending.get(data.id);if(!wait)return;pending.delete(data.id);
    if(data.error)wait.reject(new Error(data.error));else wait.resolve(data);
  };
  worker.onerror=event=>{for(const wait of pending.values())wait.reject(new Error(event.message||'Ruby worker failed'));pending.clear();};
  function request(value){return new Promise((resolve,reject)=>{const id=++requestId;pending.set(id,{resolve,reject});worker.postMessage({id,request:value});});}
  function fail(error){auto=false;busy=false;bootFailed=true;$('error').hidden=false;$('error').textContent='The Ruby engine could not complete this request: '+error.message+'. Serve this directory over HTTP and verify that the local vendor/runtime files are present.';$('runtime').textContent='Engine unavailable';updateControls();}
  function sceneOptions(){const seed=Number($('seed').value);return {scene:$('scene').value,albedo:Number($('albedo').value),lightWidth:Number($('lightWidth').value),bounces:Number($('bounces').value),seed:Number.isFinite(seed)?Math.trunc(seed):41,pixels:64,photonMap:true,photonRadius:Number($('photonRadius').value),photonBudget:Number($('photonBudget').value),photonCameraSamples:8};}
  function updateControls(){
    $('run').disabled=!initialized||bootFailed;$('one').disabled=!initialized||bootFailed||busy;$('reset').disabled=!initialized||bootFailed;
    $('run').textContent=auto?'Pause sampling':'▶ Accumulate samples';
    $('run').classList.toggle('primary',!auto);
    const pm=snapshot?.methods?.pm;
    $('photonStatus').textContent=pm?`${pm.count.toLocaleString()} / ${pm.budget.toLocaleString()} launches · ${pm.stored.toLocaleString()} stored hits · radius ${pm.radius.toFixed(2)}${pm.complete?' · map frozen; restart to rebuild':''}`:'Photon map builds alongside the path estimators.';
    const calibration=$('scene').value==='direct';$('albedo').disabled=calibration;$('lightWidth').disabled=calibration;
    const has=!!snapshot?.trace?.events?.length;
    $('eventStep').disabled=!has;$('backStep').disabled=!has||step===0;$('nextStep').disabled=!has||step===snapshot.trace.events.length-1;
  }
  async function reset(){
    const generation=++epoch;busy=true;bootFailed=false;$('error').hidden=true;updateControls();
    try{
      const data=await request({action:'reset',options:sceneOptions()});
      if(generation!==epoch)return;
      initialized=true;busy=false;snapshot=data.result;step=0;
      $('runtime').classList.add('ready');$('runtime').innerHTML='<span></span>Ruby '+data.rubyVersion+' · local WebAssembly';
      $('scene-title').textContent=sceneNames[snapshot.scene.id];
      updateAll();
      await nextBatch(true);
    }catch(error){if(generation===epoch)fail(error);}
  }
  async function nextBatch(force=false,single=false){
    if(busy||!initialized||bootFailed||(!auto&&!force)||document.hidden)return;
    busy=true;const generation=epoch,inspectionAtStart=inspectionVersion;lastAutoStart=performance.now();updateControls();
    try{
      const response=await request(single?{action:'trace',selected}:{action:'batch',count:batchSize,selected});
      if(generation!==epoch)return;
      const heldTrace=snapshot?.trace;
      snapshot=response.result;computeMs=response.computeMs;busy=false;
      if(inspectionVersion!==inspectionAtStart&&heldTrace)snapshot.trace=heldTrace;
      // Small worker chunks preserve control latency; the transport samples themselves are unchanged.
      if(!single)batchSize=Math.max(16,Math.min(384,Math.round(batchSize*130/Math.max(computeMs,1))));
      if(inspectionVersion===inspectionAtStart)step=Math.max(0,(snapshot.trace?.events.length||1)-1);updateAll();
      if(snapshot.trace?.method!==selected){await nextBatch(true,true);return;}
      if(auto&&!document.hidden)setTimeout(()=>nextBatch(),Math.max(40,180-(performance.now()-lastAutoStart)));
    }catch(error){if(generation===epoch)fail(error);}
  }
  function format(value,digits=3){return Number.isFinite(value)?(Math.abs(value)>=10000?value.toExponential(2):value.toFixed(digits)):'—';}
  function triple(value){return value?value.map(v=>format(v,2)).join(' · '):'—';}
  function paintColor(c,exposure=1){return 'rgb('+c.map(v=>Math.round(255*Math.pow(1-Math.exp(-Math.max(0,v)*exposure),1/2.2))).join(',')+')';}
  function setMethod(){selected=$('method').value;$('methodDescription').textContent=descriptions[selected];$('formula').textContent=formulas[selected];$('inspectorTitle').textContent=names[selected];}
  function updateInspector(){
    const trace=snapshot?.trace,events=trace?.events||[],e=events[step];
    $('eventStep').max=Math.max(0,events.length-1);$('eventStep').value=step;
    $('stepLabel').textContent=events.length?`${step+1} / ${events.length} events`:'No path yet';
    $('pathIndex').textContent=trace?'Path '+trace.number.toLocaleString():'—';
    $('eventCount').textContent=events.length;
    if(trace){$('inspectorTitle').textContent=names[trace.method];$('methodDescription').textContent=descriptions[trace.method];$('formula').textContent=formulas[trace.method];}
    $('eventSummary').textContent=e?(e.message||`${e.material||'Surface'} · ${labels[e.kind]||e.kind}. The colored segment follows the actual sampled ray.`):'Choose “Trace one path” to inspect a complete draw, including failed connections.';
    $('beta').previousElementSibling.textContent=e?.kind==='gather'?'Incident flux ΣΦ':trace?.method==='pm'?'Photon flux Φ':'Throughput β';
    $('beta').textContent=triple(e?.throughput);$('pdf').textContent=format(e?.pdf,4);$('otherPdf').textContent=format(e?.otherPdf,4);$('weight').textContent=format(e?.weight,4);$('contribution').textContent=triple(e?.contribution);
    $('events').replaceChildren(...events.map((ev,i)=>{
      const li=document.createElement('li');li.classList.toggle('active',i===step);
      const button=document.createElement('button');button.type='button';button.setAttribute('aria-current',i===step?'step':'false');
      const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');
      const label=document.createElement('span');label.textContent=labels[ev.kind]||ev.kind;
      button.append(number,label);button.onclick=()=>chooseStep(i);li.append(button);return li;
    }));
    updateControls();
  }
  function chooseStep(value){auto=false;inspectionVersion++;step=Math.max(0,Math.min(snapshot.trace.events.length-1,Number(value)));updateInspector();schedulePaint();}
  for(const method of Object.keys(names)){
    const card=document.createElement('article');card.className='film-card';
    card.innerHTML=`<h3 class="${method}-color">${names[method]} <small id="count-${method}">0 launches</small></h3><canvas id="film-${method}" width="64" height="36" aria-label="${names[method]} angular radiance strip"></canvas><div class="film-stats"><span>Ray queries <strong id="rays-${method}">—</strong></span><span>${method==='pm'?'Depositing paths':'Nonzero paths'} <strong id="hits-${method}">—</strong></span></div><div class="film-mean">Mean <strong id="mean-${method}">—</strong> <span id="se-${method}"></span></div>`;
    $('films').append(card);
  }
  function updateFilms(){
    if(!snapshot)return;
    const exposure=2**Number($('exposure').value);
    for(const [m,result]of Object.entries(snapshot.methods)){
      const canvas=$('film-'+m);if(canvas.width!==snapshot.pixels)canvas.width=snapshot.pixels;
      const ctx=canvas.getContext('2d');result.image.forEach((c,i)=>{ctx.fillStyle=paintColor(c,exposure);ctx.fillRect(i,0,1,canvas.height);});
      $('count-'+m).textContent=result.count.toLocaleString()+(m==='pm'?(result.complete?' photons · frozen':' photons'):' launches');$('rays-'+m).textContent=result.rays.toLocaleString();
      $('hits-'+m).textContent=(result.nonzeroFraction*100).toFixed(1)+'%';$('mean-'+m).textContent=format(result.mean,4);$('se-'+m).textContent=m==='pm'?' · finite-radius estimate':' ± '+format(result.standardError,4);
    }
  }
  function fitCanvas(canvas){
    const rect=canvas.getBoundingClientRect();const dpr=Math.min(2,window.devicePixelRatio||1);
    const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,w:rect.width,h:rect.height};
  }
  function drawProfile(){
    const {ctx,w,h}=fitCanvas($('profileCanvas'));ctx.clearRect(0,0,w,h);if(!snapshot)return;
    const luminance=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
    const max=Math.max(.001,...Object.values(snapshot.methods).flatMap(r=>r.image.map(luminance)));
    const left=38,right=w-10,bottom=h-19,top=13;
    ctx.font='10px Segoe UI';ctx.fillStyle='#718c9c';ctx.lineWidth=1;ctx.strokeStyle='#809eb11c';
    for(let i=0;i<=3;i++){const y=bottom-(bottom-top)*i/3;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillText((max*i/3).toFixed(1),3,y+3);}
    for(const m of ['pt','lt','mis','pm']){
      if(!snapshot.methods[m])continue;
      ctx.strokeStyle=colors[m];ctx.lineWidth=m===selected?2:1.2;ctx.globalAlpha=.85;ctx.beginPath();
      snapshot.methods[m].image.forEach((c,i)=>{const x=left+(right-left)*(i+.5)/snapshot.pixels,y=bottom-(bottom-top)*luminance(c)/max;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
    }ctx.globalAlpha=1;
  }
  function drawScene(){
    const {ctx,w,h}=fitCanvas($('sceneCanvas'));ctx.clearRect(0,0,w,h);
    if(!snapshot){ctx.fillStyle='#7894a5';ctx.font='14px Segoe UI';ctx.textAlign='center';ctx.fillText('Loading the actual Ruby transport engine…',w/2,h/2);return;}
    const scene=snapshot.scene,b=scene.bounds,padding=27;
    const scale=Math.min((w-padding*2)/(b[2]-b[0]),(h-padding*2)/(b[3]-b[1]));
    const ox=(w-(b[2]-b[0])*scale)/2-b[0]*scale,oy=(h+(b[3]+b[1])*scale)/2;
    const point=p=>[ox+p[0]*scale,oy-p[1]*scale];
    function line(a,b,color,width=1,dash=[]){a=point(a);b=point(b);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();ctx.setLineDash([]);}
    function arrow(a,b,color,alpha=1){
      const a2=point(a),b2=point(b),dx=b2[0]-a2[0],dy=b2[1]-a2[1],len=Math.hypot(dx,dy);if(len<2)return;
      ctx.globalAlpha=alpha;line(a,b,color,1.5);
      const t=.72,x=a2[0]+dx*t,y=a2[1]+dy*t;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x+dx/len*5,y+dy/len*5);ctx.lineTo(x-dx/len*3-dy/len*3,y-dy/len*3+dx/len*3);ctx.lineTo(x-dx/len*3+dy/len*3,y-dy/len*3-dx/len*3);ctx.closePath();ctx.fill();ctx.globalAlpha=1;
    }
    ctx.fillStyle='#0d151d';ctx.fillRect(0,0,w,h);
    for(let x=-4.5;x<=4.5;x+=.5)line([x,0],[x,6.1],'#759db00b');for(let y=0;y<=6;y+=.5)line([-4.4,y],[4.4,y],'#759db00b');
    // A subtle field-of-view wedge gives the 1D angular sensor a spatial origin.
    const camera=point(scene.camera);ctx.beginPath();ctx.moveTo(...camera);
    const angles=[Math.PI/2-scene.fov/2,Math.PI/2+scene.fov/2];for(const a of angles){const q=point([scene.camera[0]+Math.cos(a)*7,scene.camera[1]+Math.sin(a)*7]);ctx.lineTo(...q);}ctx.closePath();ctx.fillStyle='#86bfca05';ctx.fill();
    for(const o of scene.objects){
      const c=paintColor(o.color,1.4);
      if(o.type==='circle'){
        const [x,y]=point(o.center),r=o.radius*scale;const g=ctx.createRadialGradient(x-r*.4,y-r*.45,0,x,y,r);
        g.addColorStop(0,c);g.addColorStop(1,'#152331');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.lineWidth=1.2;ctx.strokeStyle=c;ctx.stroke();
        ctx.beginPath();ctx.arc(x,y,r*.78,-Math.PI*.93,-Math.PI*.32);ctx.strokeStyle='#d7e5e71a';ctx.stroke();
      }else if(o.emission){ctx.shadowBlur=15;ctx.shadowColor=paintColor(o.emission,.3);line(o.a,o.b,paintColor(o.emission,.4),5);ctx.shadowBlur=0;line(o.a,o.b,'#fff0c9',1.3);}
      else{line(o.a,o.b,c,4);line(o.a,o.b,'#c6d8dd26',.7);}
    }
    if(selected==='pm'&&$('photonDots').checked){
      for(const mark of snapshot.methods.pm.preview){
        const p=point(mark.point);ctx.fillStyle=paintColor(mark.flux,.06);ctx.globalAlpha=.65;ctx.beginPath();ctx.arc(...p,mark.depth===1?2:1.4,0,Math.PI*2);ctx.fill();
      }ctx.globalAlpha=1;
    }
    const events=snapshot.trace?.events||[];const upto=Math.min(step,events.length-1);
    for(let i=0;i<=upto;i++){
      const e=events[i],strong=i===upto;const lt=snapshot.trace.method==='lt';
      let color=snapshot.trace.method==='pm'?colors.pm:(lt?colors.lt:colors.pt);if(['connect','direct','camera-connect'].includes(e.kind))color=colors.mis;if(e.kind==='blocked')color='#df8793';
      if(e.a&&e.b&&Math.hypot(e.a[0]-e.b[0],e.a[1]-e.b[1])>.0001){
        if(e.kind==='blocked'){ctx.globalAlpha=strong?.85:.3;line(e.a,e.b,color,strong?1.3:.8,[4,5]);ctx.globalAlpha=1;}else{if(strong){ctx.shadowBlur=8;ctx.shadowColor=color;}arrow(e.a,e.b,color,strong?1:.45);ctx.shadowBlur=0;}
      }
      if(e.b&&['camera','bounce','light-bounce','emission','photon-hit','photon-store'].includes(e.kind)){const p=point(e.b);ctx.fillStyle=color;ctx.beginPath();ctx.arc(...p,strong?3.3:2,0,Math.PI*2);ctx.fill();}
    }
    const e=events[upto];
    if(e?.kind==='gather'){
      ctx.shadowBlur=12;ctx.shadowColor=colors.pm;
      for(const support of e.supportLines||[])for(let j=1;j<support.length;j++)line(support[j-1],support[j],colors.pm,5);
      ctx.shadowBlur=0;ctx.fillStyle='#eff9ff';
      for(const q of e.gatherPoints||[]){ctx.beginPath();ctx.arc(...point(q),2.1,0,Math.PI*2);ctx.fill();}
      const center=point(e.b);ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(...center,7,0,Math.PI*2);ctx.stroke();
      ctx.textAlign='left';ctx.font='11px Segoe UI';ctx.fillStyle=colors.pm;ctx.fillText(`${e.photons} photons · surface support ${e.supportLength.toFixed(2)}`,center[0]+12,center[1]-12);
    }
    if(e?.normal&&e.kind!=='gather'&&$('lobes').checked&&e.b){
      const origin=e.kind==='sample'||e.kind==='launch'||e.kind==='photon-launch'?e.a:(['connect','blocked','direct','camera-connect'].includes(e.kind)?e.a:e.b);
      if(origin){const center=point(origin),n=e.normal;const angle=Math.atan2(n[1],n[0]);ctx.beginPath();ctx.moveTo(...center);
        for(let i=0;i<=50;i++){const t=-Math.PI/2+i*Math.PI/50,r=.48*Math.cos(t),a=angle+t,p=point([origin[0]+Math.cos(a)*r,origin[1]+Math.sin(a)*r]);ctx.lineTo(...p);}ctx.closePath();ctx.fillStyle='#8bd6c714';ctx.fill();ctx.strokeStyle='#8bd6c765';ctx.lineWidth=1;ctx.stroke();
        line(origin,[origin[0]+n[0]*.52,origin[1]+n[1]*.52],'#d5e3e56e',.8,[3,3]);
        ctx.font='10px Segoe UI';ctx.fillStyle='#a3cfc4';ctx.textAlign='left';ctx.fillText('p = cos θ / 2',center[0]+12,center[1]-13);
      }
    }
    ctx.shadowColor=colors.pt;ctx.shadowBlur=13;ctx.fillStyle=colors.pt;ctx.beginPath();ctx.arc(...camera,5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.strokeStyle='#a2d7d275';ctx.lineWidth=1;ctx.beginPath();ctx.arc(...camera,10,0,Math.PI*2);ctx.stroke();
    ctx.textAlign='center';ctx.font='10px Segoe UI';ctx.fillStyle='#97bfca';ctx.fillText('CAMERA · 64 ANGULAR BINS',camera[0],camera[1]+24);
    ctx.textAlign='left';ctx.font='10px Segoe UI';ctx.fillStyle='#708b9c';ctx.fillText('All objects: diffuse reflectors / one-sided line emitters',17,20);
    ctx.textAlign='right';ctx.fillText(snapshot.bounces+' surface bounces',w-17,20);
  }
  function schedulePaint(){if(framePending)return;framePending=true;requestAnimationFrame(()=>{framePending=false;if(document.hidden)return;drawScene();drawProfile();});}
  function updateAll(){updateInspector();updateFilms();schedulePaint();}
  $('run').onclick=()=>{auto=!auto;updateControls();if(auto)nextBatch();};
  $('one').onclick=()=>{auto=false;updateControls();nextBatch(true,true);};
  $('reset').onclick=reset;
  $('method').onchange=()=>{setMethod();auto=false;updateControls();if(!busy)nextBatch(true,true);};
  $('scene').onchange=()=>{$('lightWidth').value=$('scene').value==='small_light'?'0.28':'1.4';$('lightWidthValue').value=Number($('lightWidth').value).toFixed(2);reset();};
  for(const id of ['albedo','lightWidth','photonRadius']){$(id).oninput=()=>{$(id+'Value').value=Number($(id).value).toFixed(2);};$(id).onchange=reset;}
  $('photonBudget').onchange=reset;
  $('photonDots').onchange=schedulePaint;
  $('bounces').onchange=reset;$('seed').onchange=reset;
  $('eventStep').oninput=()=>chooseStep($('eventStep').value);$('backStep').onclick=()=>chooseStep(step-1);$('nextStep').onclick=()=>chooseStep(step+1);
  $('lobes').onchange=schedulePaint;$('exposure').oninput=()=>{updateFilms();schedulePaint();};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){schedulePaint();if(auto)nextBatch();}});
  const observer=new ResizeObserver(schedulePaint);observer.observe($('sceneCanvas'));observer.observe($('profileCanvas'));
  window.addEventListener('pagehide',event=>{if(!event.persisted)worker.terminate();});
  const requestedMethod=new URLSearchParams(location.search).get('method');
  if(Object.hasOwn(names,requestedMethod))$('method').value=requestedMethod;
  setMethod();schedulePaint();reset();
})();
