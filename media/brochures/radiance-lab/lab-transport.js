/* Event-driven transport schematics. Settings survive host pause/resume;
   only explicit reset changes state. All geometry is illustrative. */
(() => {
  'use strict';
  const M=window.TransportModels,$=id=>document.getElementById(id),canvas=$('diagram'),ctx=canvas.getContext('2d');
  const C={gold:'#efd080',mint:'#85dfc7',blue:'#97baf8',violet:'#b7a0f1',red:'#ee998c',muted:'#93a3ba',dim:'#40516a',ink:'#eee9dc'};
  const modes={
    bdpt:{intro:'One path, every split. Choose how many vertices grow from the light and camera, then change their relative probability under a common path measure.',title:'MIS combines alternative constructions',note:'All s + t = N splits are shown. Gold and blue are sampled subpaths; the mint segment is the explicit connection. A delta vertex blocks ordinary connection strategies beside it. The weight bars use the displayed illustrative PDFs, evaluated at the same path, with one sample per strategy.',formula:'wᵢ(x) = [nᵢ pᵢ(x)]ᵝ / Σⱼ[nⱼ pⱼ(x)]ᵝ · contribution = wᵢ F / (nᵢ pᵢ)',implementation:'The native surface tracer has a (s,t) strategy pyramid and an explicit path-density MIS route. Its volume showcase can fall back to flat weights. This schematic demonstrates balance / power weighting; it does not reproduce a native film.',scope:'Topology and MIS arithmetic · relative PDFs are editable teaching inputs.',paper:'https://graphics.stanford.edu/papers/veach_thesis/'},
    vcm:{intro:'An exact visibility connection and a finite-radius merge reach different light-path populations. Move the camera query and inspect both supports on a receiving surface.',title:'Connect a segment, or gather a neighborhood',note:'Each dot is a stored light arrival in this surface view. The mint disk selects nearby photons; the inset shows the normalized Epanechnikov kernel. Radius changes both population and smoothing. Full VCM must also combine connection and merge strategies with compatible MIS densities.',formula:'Kᵣ(d) = 2[1 − (d/r)²] / (πr²),  0 ≤ d < r;  zero outside',implementation:'RadianceLab stores surface light vertices, draws connections and merges, and uses this kernel with normal checks. Its current combination uses density heuristics, so it is not a verified reproduction of the published VCM MIS derivation.',scope:'Surface support in arbitrary units · kernel density is not radiance.',paper:'https://iliyan.com/publications/ImplementingVCM/ImplementingVCM_TechRep2012_rev2.pdf'},
    upbp:{intro:'Points, camera segments and photon segments give different ways to estimate scattering in a medium. Switch the support construction while keeping the stored light walk visible.',title:'Change the support, then account for its measure',note:'Point–point samples two scattering vertices. Point–beam queries stored points along a camera segment. Beam–beam uses light and camera segments. MC paths instead construct scattering vertices and explicit connections. Their different support dimensions require different density conversions before MIS.',formula:'Volume points · camera-ray integrals · beam cross-sections → compatible transport estimates',implementation:'The UPBP-labelled native lane has optional medium tracking and volume-point gathers. Its stored beams are visualized but are not queried by a beam gather. The beam–beam view here explains the published framework; it does not claim that native feature is complete.',scope:'2D projection of 3D support · counts are geometric, not weighted radiance.',paper:'https://iliyan.com/publications/PointsBeamsPaths'},
    guiding:{intro:'Learn where useful incident light arrives, then mix that guide with the scattering proposal. Compare the probabilities and the exact variance of a small discrete model.',title:'A better proposal changes variance, not the target',note:'This one-angle slice has 64 bins and a fixed two-lobe integrand. Training quality improves a normalized guide. Mixture sampling retains BSDF support and divides by the full mixture probability, regardless of the component that generated a sample. The variance shown is computed exactly for this finite toy.',formula:'qᵢ = (1 − α)bᵢ + αgᵢ · I = ΣᵢFᵢΔθ · Var = Σᵢ(FᵢΔθ)²/qᵢ − I²',implementation:'The native guiding experiment uses a regular 3D grid with 16 × 16 directional histograms. It is not the adaptive SD-tree in the reference paper. The slice here isolates the proposal and probability ledger without claiming native convergence rates.',scope:'Discrete angular toy · normalized probability masses, not solid-angle PDFs.',paper:'https://jannovak.info/publications/PathGuide/index.html'},
    manifold:{intro:'Move the sensor: the old specular path is no longer valid. A Newton step moves its mirror vertex back toward a path that obeys reflection.',title:'Solve the constraint before accepting a path',note:'For one flat mirror, stationarity of path length gives a scalar constraint C(x)=0. Step the solver and watch the angular mismatch vanish. General manifold exploration couples many such constraints, tracks valid branches, and includes the induced proposal density in Metropolis acceptance.',formula:'C(x) = d[|L − M(x)| + |E − M(x)|]/dx = 0 · xₖ₊₁ = xₖ − C(xₖ)/C′(xₖ)',implementation:'RadianceLab’s manifold exploration prototype currently scales mutations around specular events; it does not run a Newton manifold solver. This working one-mirror solve explains the missing mechanism and is deliberately separate from the native implementation.',scope:'One-mirror Newton solve · geometry only; no MCMC transport estimator.',paper:'https://rgl.epfl.ch/publications/Jakob2012Manifold'}
  };
  const fresh={bdpt:()=>({n:6,s:3,beta:2,finite:true,delta:false,pdf:[.05,.36,.65,1,.38,.14,.03,.04,.02]}),vcm:()=>({query:.56,radius:.105,view:'both'}),upbp:()=>({query:.53,radius:.065,view:'point-beam'}),guiding:()=>({fraction:.7,training:.6}),manifold:()=>({camera:.79,seed:.72,iterations:0})};
  const state=Object.fromEntries(Object.keys(fresh).map(key=>[key,fresh[key]()]));
  let mode='bdpt',pending=0,hostVisible=window.parent===window,disposed=false;
  const params=new URLSearchParams(location.search),initial=params.get('mode'),group=params.get('group');if(modes[initial])mode=initial;
  const allowed=group==='construction'?['bdpt','vcm','upbp']:group==='adaptation'?['guiding','manifold']:Object.keys(modes);
  if(!allowed.includes(mode))mode=allowed[0];
  for(const b of document.querySelectorAll('[data-mode]'))b.hidden=!allowed.includes(b.dataset.mode);
  if(group==='adaptation')document.querySelector('h1').textContent='Where to spend the next sample';
  const schedule=()=>{if(disposed||pending||document.hidden)return;pending=requestAnimationFrame(()=>{pending=0;if(hostVisible||window.PortfolioLabFrame?.preview)draw();});};
  function slider(id,label,min,max,step,value,format){return `<div class="control"><label for="${id}">${label}<output id="${id}-out">${format(value)}</output></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;}
  function select(id,label,options,value){return `<div class="control"><label for="${id}">${label}</label><select id="${id}">${options.map(([v,t])=>`<option value="${v}" ${v===value?'selected':''}>${t}</option>`).join('')}</select></div>`;}
  function check(id,label,value){return `<div class="control"><label for="${id}">${label}<input id="${id}" type="checkbox" ${value?'checked':''}></label></div>`;}
  const fixed=n=>v=>Number(v).toFixed(n),percent=v=>Math.round(v*100)+'%';
  function bindSlider(id,key,format,after){$(id).addEventListener('input',e=>{state[mode][key]=+e.target.value;$(id+'-out').textContent=format(+e.target.value);after?.();schedule();});}
  function controls(){
    const s=state[mode];$('strategy-list').replaceChildren();
    if(mode==='bdpt'){
      $('controls').innerHTML=slider('vertices','Total path vertices N',4,8,1,s.n,fixed(0))+select('heuristic','MIS weighting',[['1','Balance · β = 1'],['2','Power · β = 2']],String(s.beta))+slider('density','Selected relative PDF pᵢ',.01,2,.01,s.pdf[s.s],fixed(2))+check('aperture','Finite aperture · t = 0 is possible',s.finite)+check('delta','One ideal specular vertex',s.delta);
      bindSlider('vertices','n',fixed(0),()=>{s.s=Math.min(s.s,s.n);updatePdfControl();});
      $('heuristic').addEventListener('change',e=>{s.beta=+e.target.value;schedule();});
      $('density').addEventListener('input',e=>{s.pdf[s.s]=+e.target.value;$('density-out').textContent=(+e.target.value).toFixed(2);schedule();});
      for(const [id,key] of [['aperture','finite'],['delta','delta']])$(id).addEventListener('change',e=>{s[key]=e.target.checked;schedule();});
    }else if(mode==='vcm'||mode==='upbp'){
      const surface=mode==='vcm';
      $('controls').innerHTML=slider('query','Camera query position',.2,.8,.005,s.query,percent)+slider('radius','Gather radius',.025,.2,.005,s.radius,fixed(3))+select('support','Display support',surface?[['connection','Connection'],['merge','Merging'],['both','Both supports']]:[['point-point','Point–point'],['point-beam','Point–beam'],['beam-beam','Beam–beam'],['mc','MC paths']],s.view);
      bindSlider('query','query',percent);bindSlider('radius','radius',fixed(3));$('support').addEventListener('change',e=>{s.view=e.target.value;schedule();});
    }else if(mode==='guiding'){
      $('controls').innerHTML=slider('fraction','Guide mixture α',0,.95,.01,s.fraction,percent)+slider('training','Training quality · toy',0,1,.02,s.training,percent);
      bindSlider('fraction','fraction',percent);bindSlider('training','training',percent);
    }else{
      $('controls').innerHTML=slider('camera','Sensor position',.35,.91,.01,s.camera,percent)+slider('seed','Starting mirror vertex',.12,.9,.01,s.seed,percent)+`<div class="control"><button type="button" id="step">Newton step →</button></div>`;
      $('camera').addEventListener('input',e=>{s.seed=M.mirrorSolve(s.seed,s.camera,s.iterations).x;s.camera=+e.target.value;s.iterations=0;$('camera-out').textContent=percent(s.camera);$('seed').value=s.seed;$('seed-out').textContent=percent(s.seed);schedule();});
      bindSlider('seed','seed',percent,()=>{s.iterations=0;});$('step').addEventListener('click',()=>{s.iterations=Math.min(8,s.iterations+1);schedule();});
    }
  }
  function updatePdfControl(){const s=state.bdpt;$('density').value=s.pdf[s.s];$('density-out').textContent=s.pdf[s.s].toFixed(2);}
  function choose(next){mode=next;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));const m=modes[mode];$('intro').textContent=m.intro;$('note-title').textContent=m.title;$('note').textContent=m.note;$('formula').textContent=m.formula;$('implementation').textContent=m.implementation;$('scope').textContent=m.scope;$('paper').href=m.paper;controls();schedule();}
  function line(a,b,color,width=2,dash=[]){ctx.beginPath();ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();ctx.setLineDash([]);}
  function circle(p,r,color,stroke){ctx.beginPath();ctx.arc(...p,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}}
  function text(t,x,y,color=C.muted,size=12,align='left'){ctx.font=`${size}px system-ui,sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;const room=align==='center'?2*Math.min(x-10,canvas.clientWidth-x-10):align==='right'?x-10:canvas.clientWidth-x-10;ctx.fillText(t,x,y,Math.max(20,room));}
  function arrow(a,b,color,width=2){line(a,b,color,width);const dx=b[0]-a[0],dy=b[1]-a[1],angle=Math.atan2(dy,dx),r=7;line(b,[b[0]-r*Math.cos(angle-.4),b[1]-r*Math.sin(angle-.4)],color,width);line(b,[b[0]-r*Math.cos(angle+.4),b[1]-r*Math.sin(angle+.4)],color,width);}
  function metric(a,la,b,lb,c,lc){for(const [id,value] of [['metric-a',a],['label-a',la],['metric-b',b],['label-b',lb],['metric-c',c],['label-c',lc]])$(id).textContent=value;}
  function frame(){const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,devicePixelRatio||1);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.lineWidth=1;for(let x=24;x<w;x+=36)line([x,0],[x,h],'#829ec009',1);for(let y=24;y<h;y+=36)line([0,y],[w,y],'#829ec009',1);return [w,h];}
  function bdpt(w,h){
    const s=state.bdpt,n=s.n,delta=s.delta?Math.floor(n/2):-1,paths=M.splits(n,s.finite,delta),pdf=paths.map((p,i)=>p.supported?s.pdf[i]:0),weights=M.weights(pdf,s.beta);
    const margin=Math.max(35,w*.075),points=Array.from({length:n},(_,i)=>[margin+(w-2*margin)*i/(n-1),h*(i===0?.35:i===n-1?.37:i%2?.72:.23)]);
    text('Light subpath',20,24,C.gold,12);text('Eye subpath',w-20,24,C.blue,12,'right');
    for(let i=0;i<n-1;i++){const connection=i===s.s-1&&s.s>0&&s.s<n,color=connection?(paths[s.s].supported?C.mint:C.red):i<s.s-1?C.gold:C.blue;line(points[i],points[i+1],color,connection?4:2.5,connection?[7,6]:[]);if(!connection){const a=i<s.s?points[i]:points[i+1],b=i<s.s?points[i+1]:points[i];arrow([a[0]*.55+b[0]*.45,a[1]*.55+b[1]*.45],[a[0]*.45+b[0]*.55,a[1]*.45+b[1]*.55],color,2);}}
    points.forEach((p,i)=>{const col=i<s.s?C.gold:C.blue;circle(p,9,'#121b28',col);circle(p,3.5,col);if(i===delta){ctx.save();ctx.translate(...p);ctx.rotate(Math.PI/4);ctx.strokeStyle=C.violet;ctx.lineWidth=2;ctx.strokeRect(-12,-12,24,24);ctx.restore();}text(i===0?'Emitter':i===n-1?'Sensor':`x${i}`,p[0],p[1]+(i%2?27:-22),i===delta?C.violet:col,12,'center');});
    const reason=!paths[s.s].supported?(s.s===n?'Pinhole: no finite aperture to hit':'Ordinary connection violates a delta constraint'):s.s===0?'Eye walk reaches the emitter':s.s===1?'Next-event estimation':s.s===n?'Light walk reaches the finite aperture':s.s===n-1?'Light subpath connects to the sensor':'Two sampled subpaths meet by visibility connection';
    text(reason,w/2,h-28,paths[s.s].supported?C.ink:C.red,w<550?11:13,'center');
    const list=$('strategy-list');list.style.setProperty('--splits',n+1);list.innerHTML=paths.map((p,i)=>`<button type="button" data-split="${i}" aria-pressed="${i===s.s}" style="--weight:${weights[i]*100}%">${i} + ${p.t}<span>${p.supported?(100*weights[i]).toFixed(1)+'%':'unsupported'}</span><i></i></button>`).join('');
    for(const b of list.querySelectorAll('button'))b.addEventListener('click',()=>{s.s=+b.dataset.split;updatePdfControl();schedule();});
    metric(`s=${s.s}, t=${n-s.s}`,'selected light / eye vertices',weights[s.s].toFixed(3),'MIS weight at this path',weights.reduce((a,b)=>a+b,0).toFixed(3),'sum over supported strategies');
    canvas.setAttribute('aria-label',`${reason}. Selected split ${s.s},${n-s.s}. Its MIS weight is ${weights[s.s].toFixed(3)}. All ${n+1} splits appear below.`);
  }
  const photons=Array.from({length:88},(_,i)=>{const a=i*2.3999632297,r=Math.sqrt((i+.5)/88);return [.54+.285*r*Math.cos(a),.52+.3*r*Math.sin(a)*(.6+.4*Math.sin(i*.7)**2)];});
  function vcm(w,h){
    const s=state.vcm,scale=Math.min(w*.65,h*1.04),ox=Math.max(6,(w*.65-scale)/2),oy=12,P=p=>[ox+p[0]*scale,oy+p[1]*scale],q=[s.query,.58],qp=P(q),r=s.radius*scale,merge=s.view!=='connection',connect=s.view!=='merge';
    const right=Math.max(scale+15,w*.71);text('Receiving surface · top view',18,24,C.muted,11);
    const distances=photons.map(p=>Math.hypot(p[0]-q[0],p[1]-q[1])),accepted=distances.filter(d=>d<s.radius).length;
    if(merge)circle(qp,r,'#85dfc717',C.mint);
    if(connect){const bounce=P([.28,.22]);line(P([.11,.1]),bounce,C.gold,2.5);circle(bounce,6,C.gold);line(bounce,qp,C.blue,2.5,[6,4]);text('connection',bounce[0]+14,bounce[1]-9,C.blue,10);}
    photons.forEach((p,i)=>circle(P(p),distances[i]<s.radius&&merge?3.5:2.1,distances[i]<s.radius&&merge?C.gold:'#927b485c'));
    circle(qp,6,'#0b111b',C.blue);line(qp,P([.9,.84]),C.blue,2);text('camera query',qp[0]-4,qp[1]+r+22,C.blue,11,'center');
    const gw=Math.max(60,w-right-25),gh=85,gy=100;text('Kernel cross-section',right,55,C.mint,11);line([right,gy+gh],[right+gw,gy+gh],C.dim);const peak=M.diskKernel(0,s.radius);ctx.beginPath();for(let i=0;i<=64;i++){const u=i/64,d=Math.abs(u*2-1)*s.radius,v=M.diskKernel(d,s.radius)/peak;const x=right+u*gw,y=gy+gh-v*gh;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.strokeStyle=C.mint;ctx.lineWidth=2;ctx.stroke();text('−r',right,gy+gh+18,C.muted,10);text('+r',right+gw,gy+gh+18,C.muted,10,'right');text('∫ K dA = 1',right,gy+gh+43,C.gold,12);text('finite support',right,gy+gh+63,C.muted,10);
    metric(merge?String(accepted):'—','photons inside the disk',s.radius.toFixed(3),'radius in surface units',merge?(distances.reduce((sum,d)=>sum+M.diskKernel(d,s.radius),0)/photons.length).toFixed(2):'—','kernel density / stored photon · not radiance');
    canvas.setAttribute('aria-label',`VCM ${s.view}. ${accepted} stored photons lie inside radius ${s.radius.toFixed(3)} around the movable surface query.`);
  }
  const beamPaths=Array.from({length:12},(_,i)=>[[.12,.13+i*.015],[.37+i*.028,.32+i*.027],[.8-i*.032,.75+.05*Math.cos(i)]]);
  function upbp(w,h){
    const s=state.upbp,sx=w*.88,sy=h*.87,P=p=>[w*.05+p[0]*sx,h*.055+p[1]*sy],a=[.1,s.query+.19],b=[.9,s.query-.12],q=[.57,s.query+.014],r=s.radius*Math.min(sx,sy);
    text('Medium · projected light-path records',16,22,C.muted,11);
    if(s.view==='point-point')circle(P(q),r,'#85dfc719',C.mint);
    else if(s.view!=='mc'){ctx.lineCap='round';line(P(a),P(b),'#85dfc70e',r*2);ctx.lineCap='butt';}
    let count=0;
    beamPaths.forEach((path,j)=>{
      if(s.view==='beam-beam'){
        for(let k=0;k<2;k++){
          // The display is a projection; intersection in this plane is illustrative only.
          const close=M.segmentDistance(path[k],path[k+1],a,b)<s.radius;
          line(P(path[k]),P(path[k+1]),close?C.gold:'#7e713b62',close?2.7:1.3);if(close)count++;
        }
      }else{
        for(let k=0;k<2;k++)line(P(path[k]),P(path[k+1]),'#88763a32',1);
        for(const p of path.slice(1)){const d=s.view==='point-point'?Math.hypot(p[0]-q[0],p[1]-q[1]):M.pointSegment(p,a,b).distance,inside=d<s.radius;
          if(inside)count++;circle(P(p),inside&&s.view!=='mc'?4:2.5,inside?C.gold:'#ad935b73');
          if(s.view==='point-beam'&&inside){const near=M.pointSegment(p,a,b).point;line(P(p),P(near),C.mint,1,[3,3]);}
          if(s.view==='mc'&&j%3===0)line(P(p),P(q),'#b7a0f180',1,[4,4]);}
      }
    });
    arrow(P(a),P(b),C.blue,2.7);circle(P(a),6,C.blue);if(['point-point','mc'].includes(s.view))circle(P(q),6,C.mint);text('Camera segment',P(a)[0],P(a)[1]+24,C.blue,11);
    const support={'point-point':'3D ball at a sampled eye vertex','point-beam':'Point support integrated along the eye segment','beam-beam':'Two segments and a transverse support','mc':'Sampled medium vertices + explicit connections'};
    text(support[s.view],w/2,h-14,C.mint,w<550?10:12,'center');
    metric(s.view==='mc'?'Connections':s.view==='beam-beam'?'Segment support':String(count),s.view==='beam-beam'?'overlap shown schematically':'selected query geometry',s.radius.toFixed(3),'support radius in normalized coordinates','Distinct measures','common path formulation required for MIS');
    canvas.setAttribute('aria-label',`UPBP ${s.view} support. ${support[s.view]}. This is a two-dimensional projection, not a three-dimensional radiance evaluation.`);
  }
  function guiding(w,h){
    const s=state.guiding,g=M.guide(s.fraction,s.training),cx=w*.32,cy=h*.8,r=Math.min(w*.29,h*.59),max=Math.max(...g.bsdf,...g.learned,...g.mixture);
    for(const rr of [.33,.66,1]){ctx.beginPath();ctx.arc(cx,cy,r*rr,Math.PI,0);ctx.strokeStyle='#536d892c';ctx.stroke();}line([cx-r,cy],[cx+r,cy],C.dim);
    const lobe=(values,color,fill)=>{ctx.beginPath();ctx.moveTo(cx,cy);values.forEach((p,i)=>{const a=g.theta[i],length=r*(p/max);ctx.lineTo(cx+Math.sin(a)*length,cy-Math.cos(a)*length);});ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();};
    lobe(g.bsdf,C.blue,'#97baf80a');lobe(g.learned,C.gold,'#efd08013');lobe(g.mixture,C.mint,'#85dfc715');
    for(let sample=0;sample<22;sample++){let u=(sample+.5)/22,i=0;while(i<63&&u>g.mixture[i])u-=g.mixture[i++];const a=g.theta[i];line([cx,cy],[cx+Math.sin(a)*r,cy-Math.cos(a)*r],'#85dfc735',1);}
    circle([cx,cy],6,C.mint);text('Scattering vertex',cx,cy+24,C.blue,11,'center');
    const x=w*.66,gw=w*.29;for(const [label,col,k] of [['BSDF',C.blue,0],['Guide',C.gold,1],['Mixture',C.mint,2]]){line([x,32+k*23],[x+18,32+k*23],col,2);text(label,x+25,36+k*23,col,11);}
    text('Probability mass per angular bin',x,125,C.muted,10);for(let i=0;i<64;i++){const bw=gw/64,bh=g.mixture[i]/max*100;ctx.fillStyle=C.mint;ctx.fillRect(x+i*bw,245-bh,Math.max(.7,bw-1),bh);}line([x,245],[x+gw,245],C.dim);text('−π/2',x,265,C.muted,10);text('+π/2',x+gw,265,C.muted,10,'right');
    metric(g.integral.toFixed(3),'target integral · unchanged',(g.baseline/Math.max(g.variance,1e-12)).toFixed(2)+'×','variance reduction · exact discrete toy',g.mixture.reduce((a,b)=>a+b,0).toFixed(3),'mixture probability mass');
    canvas.setAttribute('aria-label',`Path guiding with ${Math.round(s.fraction*100)} percent guide mixture. Integral ${g.integral.toFixed(3)} is fixed. Variance reduction is ${(g.baseline/Math.max(g.variance,1e-12)).toFixed(2)} times in this discrete example.`);
  }
  function manifold(w,h){
    const s=state.manifold,res=M.mirrorSolve(s.seed,s.camera,s.iterations),sx=w*.61,sy=h*.94,P=p=>[16+p[0]*sx,6+p[1]*sy],L=[.16,.19],E=[s.camera,.29],X=[res.x,.79],exact=M.mirrorExact(s.camera);
    line(P([.03,.79]),P([.97,.79]),C.blue,4);for(let i=0;i<17;i++)line(P([.04+i*.054,.8]),P([.01+i*.054,.84]),C.dim,1);
    for(const x of res.history.slice(0,-1)){line(P(L),P([x,.79]),'#efd08027',1);line(P([x,.79]),P(E),'#97baf827',1);}
    line(P(L),P(X),C.gold,2.7);line(P(X),P(E),Math.abs(res.residual)<1e-5?C.mint:C.red,2.7);
    line(P([exact,.73]),P([exact,.85]),C.mint,1,[3,4]);circle(P(L),7,C.gold);circle(P(E),7,C.blue);circle(P(X),6,C.violet);text('Light',P(L)[0],P(L)[1]-17,C.gold,11,'center');text('Sensor',P(E)[0],P(E)[1]-17,C.blue,11,'center');text('Perfect mirror',P([.32,.94])[0],P([.32,.94])[1],C.blue,11);text('exact root',P([exact,.88])[0],P([exact,.88])[1],C.mint,10,'center');
    const gx=w*.69,gw=w*.27,gy=h*.22,gh=h*.54,px=x=>gx+x*gw,py=v=>gy+gh*(.5-v/3);
    text(w<550?'Constraint C(x)':'Reflection constraint C(x)',gx,gy-18,C.muted,11);line([gx,py(0)],[gx+gw,py(0)],C.dim,1);ctx.beginPath();for(let i=0;i<=80;i++){const x=i/80,y=M.mirrorResidual(x,s.camera).value;i?ctx.lineTo(px(x),py(y)):ctx.moveTo(px(x),py(y));}ctx.strokeStyle=C.violet;ctx.lineWidth=2;ctx.stroke();
    const r=M.mirrorResidual(res.x,s.camera);line([px(res.x),py(r.value)],[px(res.x-r.value/r.derivative),py(0)],C.gold,1.5,[4,3]);circle([px(res.x),py(r.value)],5,C.gold);circle([px(exact),py(0)],4,C.mint);text('x along mirror',gx,gy+gh+20,C.muted,10);text('Newton tangent',gx,gy+gh+43,C.gold,10);
    metric(String(s.iterations),'damped Newton steps',Math.abs(res.residual).toExponential(2),'absolute reflection constraint residual',Math.abs(res.x-exact).toExponential(2),'distance from analytic mirror solution');
    $('step').disabled=s.iterations>=8||Math.abs(res.residual)<1e-9;
    canvas.setAttribute('aria-label',`One-mirror constraint solve after ${s.iterations} Newton steps. Residual ${Math.abs(res.residual).toExponential(2)}. Difference from analytic solution ${Math.abs(res.x-exact).toExponential(2)}.`);
  }
  function draw(){const [w,h]=frame();if(w<1||h<1)return;({bdpt,vcm,upbp,guiding,manifold})[mode](w,h);}
  for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>choose(b.dataset.mode));
  $('reset').addEventListener('click',()=>{state[mode]=fresh[mode]();choose(mode);});
  const observer=new ResizeObserver(schedule);observer.observe(canvas);
  addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin||e.data?.type!=='portfolio-lab-visibility')return;hostVisible=!!e.data.visible;if(!hostVisible){cancelAnimationFrame(pending);pending=0;}else schedule();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(pending);pending=0;}else schedule();});
  addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(pending);observer.disconnect();});
  addEventListener('pageshow',()=>{disposed=false;observer.observe(canvas);schedule();});
  choose(mode);
})();
