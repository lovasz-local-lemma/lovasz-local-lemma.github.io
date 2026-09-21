import {relayStudy,chronolensStudy,focusStudy,loomStudy,sheetsStudy,atlasStudy,MAX_SEGMENTS,sub,mul,dot,cross,normalize,fitPathDiagram,inspectionCameras} from './geometry.js?v=subpaths-2';

const $=id=>document.getElementById(id);
const MODES={
  relay:{number:'03',title:'Scattering Relay',label:'LIGHT / MEDIUM / CAMERA',type:'PROPOSAL TEST + THREE-PATH SCHEMATIC',parameter:'Product guidance',format:v=>`${Math.round(v*100)}%`,default:.7,
    caption:'The middle primitive belongs to a third, independently proposed medium subpath. Two dashed connections join it to the photon and camera chains.',
    adverse:'A dense absorbing plume blocks the entrance. Scattering density alone cannot tell you which vertices still carry useful light.',
    control:'Blend density-selected regions toward the light × camera × transmittance product. A uniform fallback always remains.',
    heading:'The medium gets its own subpath.',
    explanation:'Amber begins at the light; cyan begins at the camera. The violet chain is the proposed third participant: a short medium subpath, joined at both ends by dashed connection edges. The violet balls belong to its proposal family. This is the tridirectional idea under exploration. Here, the chain is a representative schematic chosen from occupied samples; the measured test below is still a one-vertex uniform-volume / three-ball mixture. Its full PDF counts every overlapping ball. Faint paths show selected high-weight one-vertex candidates, not a converged image estimate.',
    equation:'q(x) = (1 − α) / V + α Σᵢ 𝟙[x ∈ Bᵢ] / (3 Vᵦ)',
    computed:'512 reproducible proposal samples, overlap-aware PDF, straight-segment absorption quadrature, proxy weights f/q and effective sample size. GPU emission–absorption rendering of the prescribed field.',
    missing:'A joint PDF and transport evaluation for the illustrated medium chain, multiple scattering, phase-function and inverse-square normalization, unbiased image estimation and a matched equal-time renderer comparison.',
    source:'https://cg.ivd.kit.edu/publications/2022/once-more-nee/2022_omnee.pdf'},
  chronolens:{number:'04',title:'Chronolens',label:'A PULSE THROUGH A THIN MEDIUM',type:'OPTICAL-LENGTH DIAGNOSTIC',parameter:'Gate center',format:v=>(5.05+2.8*v).toFixed(2)+' ℓ',default:.53,
    caption:'A finite travel-time gate slices a luminous membrane. Only points whose two connecting legs arrive inside the window remain bright.',
    adverse:'A smooth index plume delays the pulse. The amber Euclidean proposal shell and the bright optical-time intersection separate.',
    control:'Sweep the path-length gate. The failure case adds a varying refractive index but retains straight connecting segments.',
    heading:'A time gate becomes a geometric shell.',
    explanation:'For constant index, distance from the source plus distance to the receiver is constant on an ellipsoid. A narrow band isolates part of the thin medium. In the adverse case, n(x) = 1 + 0.72 exp(−|x|²/1.7): the true straight-segment optical length changes while the Euclidean proposal does not. The overlap counter tests occupied voxels, not photons.',
    equation:'τ(x) = ∫ₗ→ₓ n(s) ds + ∫ₓ→꜀ n(s) ds;  |τ − τ₀| < Δ / 2',
    computed:'Two-segment optical-length quadrature, a fixed 0.13-unit acceptance window, and occupied-voxel overlap on a 26 × 26 × 18 grid. The image uses a smooth display gate.',
    missing:'Bent rays in varying index, refraction at interfaces, pulse convolution, detector response and a transient transport estimator. Travel time is shown in normalized optical-length units.',
    source:'https://imaging.cs.cmu.edu/ellipsoidal_connections/'},
  scheimpflug:{number:'05',title:'Scheimpflug Fan',label:'AN APERTURE MEETS A TILTED PLANE',type:'BIASED APERTURE STUDY',parameter:'Focus-plane tilt',format:v=>`${(Math.atan((v-.5)*1.5)*180/Math.PI).toFixed(1)}°`,default:.75,
    caption:'Thirteen luminous filaments pass through an oblique focus plane. An aperture sample changes the ray origin while preserving the selected focus point.',
    adverse:'The aperture opens wider. Filaments away from the chosen plane spread into distinct finite-sample bokeh and lose their thin structure.',
    control:'Tilt the geometric focus plane. The failure case opens the aperture from 0.12 to 0.28 world units.',
    heading:'Camera coordinates can be part of the connection.',
    explanation:'Each pixel first meets an oblique focus plane. Seven deterministic aperture locations then aim at that same point. The luminous filaments occupy different depths, so the selected plane stays in focus while other depths separate across the aperture samples. The visible bokeh is a deliberately sparse aperture quadrature.',
    equation:'F = ray ∩ { z = kx };  dₐ = normalize(F − apertureₐ)',
    computed:'Seven pinhole views from a circular aperture rule, a shared oblique focus-plane intersection, and emission–absorption quadrature through finite-width filaments.',
    missing:'A full tilted-lens optical model, sensor/lens Jacobians, lens transmission, exact aperture integration and coupled photon/lens sampling. This is a geometric focus illustration.',
    source:'https://homepages.inf.ed.ac.uk/ksubr/Files/Papers/TOG13CovTr.pdf'},
  loom:{number:'06',title:'Caustic Loom',label:'AN EXTRUDED REFLECTION CONSTRAINT',type:'ONE-DIMENSIONAL SOLVER DIAGNOSTIC',parameter:'Mirror corrugation',format:v=>(.035+.2*v).toFixed(3),default:.3,
    caption:'A corrugated mirror weaves a family of reflected paths. Each surviving strand satisfies the local reflection stationarity equation.',
    adverse:'Three iterations and clustered edge seeds lose the reflected family. Red strands stop at unsuccessful candidates instead of becoming invented connections.',
    control:'Increase the analytic mirror’s ripple. The failure case uses edge-biased seeds and a three-iteration budget.',
    heading:'A good seed is useful. A converged root is not coverage.',
    explanation:'The mirror is a bounded graph y(t) = −1.38 + 0.24t² + a cos(4t), extruded along z. For nineteen source–receiver pairs, Newton refinement drives the derivative of total path length toward zero. A separate dense sign-bracket scan counts simple roots for the center receiver. The illustration is independent of RadianceLab’s native nonlinear solver.',
    equation:'g(t) = p′(t) · [(p − L)/|p − L| + (p − C)/|p − C|] = 0',
    computed:'Analytic first/second derivatives, bounded Newton steps, residual checks and a 1,024-interval sign-bracket diagnostic. Only roots with |g| < 10⁻⁵ inside the finite mirror produce complete strands.',
    missing:'Tangential-root certification, full branch coverage, self-occlusion, root-selection probabilities, transport weights and general specular chains. This does not replace the active native solver.',
    source:'https://iliyan.com/publications/SpecularManifolds/'},
  sheets:{number:'07',title:'Crossed Sheets',label:'TWO FINITE SUPPORTS / ONE LINE',type:'EXACT GEOMETRY DIAGNOSTIC',parameter:'Relative plane angle',format:(v,b)=>`${(b?1.5+3*v:22+57*v).toFixed(1)}°`,default:.6,
    caption:'A photon subpath and a camera subpath each retain three earlier flights, then release two lengths. Their endpoint sheets meet along a finite line.',
    adverse:'The supports become nearly parallel and offset. Their infinite planes meet far away, but the finite rectangles share no points.',
    control:'Change the angle between the two plane normals. The failure case also separates their finite supports.',
    heading:'Three coincidence constraints leave one degree of freedom.',
    explanation:'Follow amber from L and cyan from C: each chain takes three fixed flights before its last two lengths are released. Their directions stay fixed; varying those positive lengths sweeps the matching colored rectangle. The highlighted chains reconstruct the same midpoint x on the intersection line. That line is solved analytically and clipped to both finite sheets. Its beads mark geometric quadrature locations. In the failure case there is no shared endpoint, so each chain ends on its own sheet. No connection is invented across the gap.',
    equation:'d ∝ n₁ × n₂;  x(t) = x₀ + td;  t ∈ I₁ ∩ I₂',
    computed:'Analytic plane intersection, finite-rectangle interval clipping, an intersection-length measurement and the conditioning indicator |n₁ × n₂|.',
    missing:'A complete path-space measure, line-sampling PDFs, material support, phase factors and connection visibility. A line intersection alone is not a transport estimator.',
    source:'https://cs.dartmouth.edu/~wjarosz/publications/deng19photon.html'},
  atlas:{number:'08',title:'Path Atlas',label:'RECONSTRUCT / RECHECK / REJECT',type:'FINITE-PATH VISIBILITY DIAGNOSTIC',parameter:'Released-length range',format:v=>'±'+(.12+.43*v).toFixed(2),default:.8,
    caption:'A six-flight family releases two lengths near the endpoint. Every reconstructed segment is tested against two finite opaque obstacles.',
    adverse:'Releasing the first and fifth lengths displaces more of the chain. Connections end at the first blocker and more inherited visibility is lost.',
    control:'Widen the two released flight lengths. The failure case changes the selected pair from adjacent late variables to distant variables.',
    heading:'More distant freedom touches more of the path.',
    explanation:'Directions remain fixed while two flight lengths vary. Each sampled pair reconstructs all downstream vertices, whose endpoint lies on a planar support. Thirteen reproducible paths are traced against two axis-aligned boxes; rejected paths stop at the first exact segment–box intersection. The displayed pair is a deliberate diagnostic selection.',
    equation:'X(u,v) = X₀ + u dᵢ + v dⱼ;  candidates = n(n − 1) / 2',
    computed:'Six-flight endpoint reconstruction, exact segment/AABB slab tests, early termination at the first blocker, and the number of potentially changed segments.',
    missing:'A sampled family-selection policy, exploration probabilities, PDFs, scattering weights, surface constraints and an efficiency claim for distant families.',
    source:'https://www.iliyan.com/publications/PointsBeamsPaths/'}
};
const PATH_CONTEXT={
  relay:{legend:[['photon','Photon subpath'],['camera','Camera subpath'],['medium','Medium subpath'],['connection','Dashed connection']],setup:'L → fixed photon prefix ⇢ M₀ → M₁ → M₂ ⇠ fixed camera prefix ← C',note:'The middle proposal belongs to the medium. The three-vertex chain illustrates an extension; the readouts measure the simpler one-vertex proxy.'},
  chronolens:{legend:[['photon','Source leg'],['camera','Receiver leg'],['connection','Selected medium point']],setup:'L → x ← C · the gate follows the total optical length of both legs',note:'The marked occupied point is nearest the selected optical-length gate. The two path legs remain visible when the shell is hidden.'},
  scheimpflug:{legend:[['camera','Reference aperture rays'],['connection','Common focus point']],setup:'Three aperture locations → one point F on the tilted focus plane',note:'Cyan shows a fixed reference camera construction, clipped at the near edge of the illustration. Filaments emit directly; this study has no photon subpath.'},
  loom:{legend:[['photon','Source leg'],['camera','Receiver leg'],['connection','Accepted mirror root']],setup:'L → x on the mirror ← C · reflection must agree at x',note:'The central accepted path is highlighted. Failed roots retain an incomplete red strand; they do not become valid connections.'},
  sheets:{legend:[['photon','Photon / amber sheet'],['camera','Camera / cyan sheet'],['connection','Shared endpoint line']],setup:'L → 3 fixed flights → (ℓ₁, ℓ₂) → x ← (c₁, c₂) ← 3 fixed flights ← C',note:'Thicker flights are released lengths. Each sheet is an endpoint locus, not a wall or a reflecting surface. The orbiting view is an inspection camera.'},
  atlas:{legend:[['photon','Reference photon chain'],['connection','Endpoint support']],setup:'L → six flights → an endpoint sheet · release two lengths and recheck every changed segment',note:'The dashed amber chain is the reference, not another accepted sample. Colored candidates stop at blockers. A camera-side connection is outside this diagnostic.'}
};
const keys=Object.keys(MODES),canvas=$('scene'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
let mode=keys.includes(location.hash.slice(1))?location.hash.slice(1):'relay',amount=MODES[mode].default,adverse=false,study=null,gl,program,segmentTexture,locations={},frame=0,orbit=false,orbitDirection=1,inView=true,last=0,drag=null,yaw=-.18,pitch=.045,zoom=7.6,disposed=false;
let viewFraming={focal:1.57,offset:[.30,0]};
const pct=v=>`${(v*100).toFixed(1)}%`;
function setPathContext(){
  const context=PATH_CONTEXT[mode];
  $('path-key').replaceChildren(...context.legend.map(([role,text])=>{const span=document.createElement('span');span.className=`path-${role}`;span.textContent=text;return span;}));
  $('path-setup').textContent=context.setup;$('path-note').textContent=context.note;
}
function updatePathLabels(){
  const rect=canvas.getBoundingClientRect(),aspect=rect.width/rect.height,mobile=matchMedia('(max-width: 740px)').matches;
  const ro=mul([Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)],zoom),forward=normalize(sub([0,.05,0],ro)),right=normalize(cross(forward,[0,1,0])),up=cross(right,forward);
  const {focal,offset}=viewFraming;
  for(const [i,annotation] of (study.annotations||[]).entries()){
    const element=$('path-labels').children[i],relative=sub(annotation.position,ro),depth=dot(relative,forward);
    const x=(.5+(focal*dot(relative,right)/depth-offset[0])/aspect)*rect.width,y=(.5+offset[1]-focal*dot(relative,up)/depth)*rect.height;
    element.hidden=depth<=0||x<14||x>rect.width-14||y<45||y>rect.height-(mobile?205:130);
    element.style.left=`${x}px`;element.style.top=`${y-9}px`;
  }
}
function setViewFraming(){
  const rect=canvas.getBoundingClientRect(),mobile=matchMedia('(max-width: 740px)').matches;
  viewFraming=inspectionCameras[mode]?fitPathDiagram(mode,rect.width,rect.height,mobile):{focal:rect.width/rect.height<1?.61:1.57,offset:rect.width/rect.height<1?[0,-.20]:[.30,0]};
  canvas.dataset.framing=JSON.stringify({focal:viewFraming.focal,offset:viewFraming.offset,area:viewFraming.area});
}
function readout(label,value,note){return `<div class="readout"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;}
function recalculate(){
  if(mode==='relay'){study=relayStudy(amount,adverse);$('readouts').innerHTML=readout('Proxy effective samples',study.stats.ess.toFixed(0)+' / 512','(Σ w)² / Σ w² · fixed candidate batch')+readout('Mean two-leg transmittance',pct(study.stats.transmittance),'proposal sample average · absorption only')+readout('Uniform fallback mass',pct(study.stats.fallback),'positive density throughout the 5³ domain');}
  if(mode==='chronolens'){study=chronolensStudy(amount,adverse);$('readouts').innerHTML=readout('Optical-length gate',study.gate.toFixed(2)+' ℓ','full hard-window width: 0.13 ℓ')+readout('Proposal / optical overlap',pct(study.stats.agreement),'accepted by both / accepted by Euclidean gate')+readout('Occupied optical-gate voxels',String(study.stats.actual),'26 × 26 × 18 diagnostic grid');}
  if(mode==='scheimpflug'){study=focusStudy(amount,adverse);$('readouts').innerHTML=readout('Focus-plane tilt',study.stats.tiltDegrees.toFixed(1)+'°','z = kx · geometric focal sheet')+readout('Aperture radius',study.aperture.toFixed(2),'world units · circular sampling rule')+readout('Aperture views',String(study.stats.samples),'sparse deterministic quadrature · visible bias');}
  if(mode==='loom'){study=loomStudy(amount,adverse);$('readouts').innerHTML=readout('Converged source–receiver pairs',`${study.stats.converged} / 19`,'finite mirror · reflection residual < 10⁻⁵')+readout('Largest accepted residual',study.stats.converged?study.stats.maxResidual.toExponential(1):'—','stationarity g(t) · rejected seeds excluded')+readout('Center-pair sign-bracket roots',String(study.stats.roots),'dense interval scan · tangential roots can be missed');}
  if(mode==='sheets'){study=sheetsStudy(amount,adverse);$('readouts').innerHTML=readout('Shared finite-line length',study.intersection.length.toFixed(3),'world units · both rectangles clipped')+readout('Normal cross-product magnitude',study.intersection.sine.toFixed(4),'tends to zero near parallel planes')+readout('Finite intersection',study.intersection.valid?'Present':'Miss','infinite-plane overlap is insufficient');}
  if(mode==='atlas'){study=atlasStudy(amount,adverse);$('readouts').innerHTML=readout('Unblocked reconstructed paths',`${study.stats.valid} / ${study.stats.total}`,'first blocker terminates each rejected chain')+readout('Released flights',study.stats.released.join(' + '),`${study.stats.affected} downstream segments can change`)+readout('Pair choices at six flights',String(study.stats.families),'unrestricted pairs · grows quadratically');}
  $('path-labels').replaceChildren(...(study.annotations||[]).map(annotation=>{const span=document.createElement('span');span.className=`path-label path-${annotation.role}`;span.textContent=annotation.text;return span;}));
  updateUniforms();requestRender();
}
function setText(){setPathContext();const m=MODES[mode];$('scene-title').textContent=m.title;$('scene-number').textContent=`STUDY ${m.number} / ${adverse?'ADVERSE CONFIGURATION':'PROMISING CONFIGURATION'}`;$('scene-label').textContent=m.label;$('render-label').textContent=m.type;$('scene-description').textContent=adverse?m.adverse:m.caption;$('parameter-label').textContent=m.parameter;$('parameter-value').textContent=m.format(amount,adverse);$('parameter').value=amount*100;$('control-description').textContent=m.control;$('explanation-title').textContent=m.heading;$('explanation').textContent=m.explanation;$('equation').textContent=m.equation;$('computed').textContent=m.computed;$('missing').textContent=m.missing;$('source-link').href=m.source;$('source-link').textContent='Related published work ↗';$('success').setAttribute('aria-pressed',String(!adverse));$('failure').setAttribute('aria-pressed',String(adverse));document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.mode===mode)));$('download-image').hidden=true;canvas.setAttribute('aria-label',`${m.title}, ${adverse?'adverse':'promising'} configuration. ${adverse?m.adverse:m.caption}`);}
function defaultZoom(){return inspectionCameras[mode]?.zoom||7.6;}
function selectMode(next){if(!MODES[next])return;mode=next;amount=MODES[mode].default;adverse=false;yaw=mode==='sheets'?-.28:mode==='loom'?.1:-.18;pitch=mode==='atlas'?.18:.045;zoom=defaultZoom();setText();recalculate();resize();}
function fail(message){$('canvas-error').hidden=false;$('canvas-error').textContent=message;}
function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;}
function loc(name){return locations[name]??(locations[name]=gl.getUniformLocation(program,name));}
function updateUniforms(){if(!gl||!program||!study)return;gl.useProgram(program);gl.uniform1i(loc('uMode'),keys.indexOf(mode));gl.uniform1f(loc('uParameter'),amount);gl.uniform1f(loc('uAdverse'),adverse?1:0);gl.uniform1f(loc('uMirror'),study.amplitude||0);
 if(study.segments.length>MAX_SEGMENTS)throw new Error('Path geometry exceeds the declared segment budget');
 const segments=study.segments,data=new Float32Array(MAX_SEGMENTS*3*4);segments.forEach((s,i)=>{data.set([...s.a,s.strength],i*4);data.set([...s.b,s.width||.009],(MAX_SEGMENTS+i)*4);data.set([...s.color,s.dashed?1:0],(MAX_SEGMENTS*2+i)*4);});if(!segmentTexture){segmentTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,segmentTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,segmentTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,MAX_SEGMENTS,3,0,gl.RGBA,gl.FLOAT,data);gl.uniform1i(loc('uSegments'),0);gl.uniform1i(loc('uCount'),segments.length);gl.uniform4fv(loc('uBalls[0]'),new Float32Array(study.balls?.flat()||Array(12).fill(0)));
 const planes=study.planes||[study.support,study.support];for(let i=0;i<2;i++){const p=planes[i];gl.uniform3fv(loc(`uCenter[${i}]`),p?.center||[0,0,0]);gl.uniform3fv(loc(`uNormal[${i}]`),p?.normal||[0,1,0]);gl.uniform3fv(loc(`uU[${i}]`),p?.u||[1,0,0]);gl.uniform3fv(loc(`uV[${i}]`),p?.v||[0,0,1]);gl.uniform2fv(loc(`uHalf[${i}]`),p?.size||[2,2]);}
}
function resize(){setViewFraming();if(!gl)return;const rect=canvas.getBoundingClientRect(),budget=mode==='scheimpflug'?320000:950000,scale=Math.min(devicePixelRatio||1,1.5,Math.sqrt(budget/(rect.width*rect.height)));const w=Math.max(1,Math.round(rect.width*scale)),h=Math.max(1,Math.round(rect.height*scale));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}requestRender();}
function render(now=0){frame=0;if(!gl||!program||disposed)return;if(orbit&&!document.hidden&&inView){if(last)yaw+=Math.min(now-last,60)*.000085*(mode==='scheimpflug'?orbitDirection:1);if(mode==='scheimpflug'){if(yaw>.35){yaw=.35;orbitDirection=-1;}if(yaw<-.55){yaw=-.55;orbitDirection=1;}}last=now;}else last=0;gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);gl.uniform2f(loc('uResolution'),canvas.width,canvas.height);gl.uniform1f(loc('uYaw'),yaw);gl.uniform1f(loc('uPitch'),pitch);gl.uniform1f(loc('uZoom'),zoom);gl.uniform1f(loc('uFocal'),viewFraming.focal);gl.uniform2fv(loc('uViewOffset'),viewFraming.offset);gl.uniform1f(loc('uGuides'),$('guides').checked?1:0);gl.drawArrays(gl.TRIANGLES,0,3);updatePathLabels();canvas.dataset.rendered=`${mode}-${adverse?'failure':'promising'}`;if(orbit&&!document.hidden&&inView)requestRender();}
function requestRender(){if(!frame&&!disposed)frame=requestAnimationFrame(render);}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{if(mode===b.dataset.mode)return;location.hash=b.dataset.mode;}));
addEventListener('hashchange',()=>selectMode(location.hash.slice(1)));
for(const id of ['success','failure'])$(id).addEventListener('click',()=>{adverse=id==='failure';setText();recalculate();});
let parameterTimer=0;$('parameter').addEventListener('input',e=>{amount=Number(e.target.value)/100;setText();clearTimeout(parameterTimer);parameterTimer=setTimeout(recalculate,40);});
$('guides').addEventListener('change',()=>{ $('download-image').hidden=true;requestRender();});
$('motion').addEventListener('click',()=>{orbit=!orbit;$('motion').setAttribute('aria-pressed',String(orbit));last=0;requestRender();});
$('reset').addEventListener('click',()=>{yaw=mode==='sheets'?-.28:mode==='loom'?.1:-.18;pitch=mode==='atlas'?.18:.045;zoom=defaultZoom();requestRender();});
$('prepare-image').addEventListener('click',()=>{if(!gl)return;orbit=false;$('motion').setAttribute('aria-pressed','false');render();const a=$('download-image');a.href=canvas.toDataURL('image/png');a.download=`${mode}-${adverse?'failure':'promising'}.png`;a.hidden=false;});
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw,pitch};canvas.setPointerCapture(e.pointerId);orbit=false;$('motion').setAttribute('aria-pressed','false');});
canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw=drag.yaw+(e.clientX-drag.x)*.004;pitch=Math.max(-.75,Math.min(.75,drag.pitch+(e.clientY-drag.y)*.003));if(mode==='scheimpflug'){yaw=Math.max(-.55,Math.min(.35,yaw));pitch=Math.max(-.4,Math.min(.4,pitch));}$('download-image').hidden=true;requestRender();});
const stopDrag=()=>{drag=null;};canvas.addEventListener('pointerup',stopDrag);canvas.addEventListener('pointercancel',stopDrag);
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.min(10.5,Math.max(6.1,zoom+e.deltaY*.004));requestRender();},{passive:false});
new ResizeObserver(resize).observe(canvas);new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(inView)requestRender();},{threshold:0}).observe(canvas);
document.addEventListener('visibilitychange',()=>{last=0;if(!document.hidden)requestRender();});
addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(frame);frame=0;});addEventListener('pageshow',()=>{disposed=false;requestRender();});
reduced.addEventListener('change',()=>{if(reduced.matches){orbit=false;$('motion').setAttribute('aria-pressed','false');}});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();disposed=true;fail('The graphics context was interrupted. Reload this page to rebuild the study. The numerical explanations below remain available.');});
selectMode(mode);
try{gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});if(!gl)throw new Error('WebGL2 is unavailable');const source=await fetch('scene.frag?v=subpaths-2').then(r=>{if(!r.ok)throw new Error('Shader could not be loaded');return r.text();});program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}'));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,source));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);gl.bindVertexArray(gl.createVertexArray());updateUniforms();resize();requestRender();}catch(error){console.error('Frontier study renderer:',error);fail('This study needs WebGL2. The numerical calculations and explanations below still work. Graphics detail: '+error.message);}
