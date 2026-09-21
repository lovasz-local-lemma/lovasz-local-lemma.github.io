import {RAD,makeBake,probes,prediction,loss,fitStep,profileLight,appearanceDefaults,materialNames,textureNames,predictionParameters,profileParameters,fitParametersStep,parameterNames} from './model.js';
import {createRenderer} from './renderer.js';
import {makeVectorBridge} from './rive-bridge.js';
const $=id=>document.getElementById(id);
const initial={theta:-35*RAD,power:1,yaw:18*RAD,tint:0,bakedTint:0,epsilon:.25*RAD,keepColor:true,grid:false};
const state={...initial},targetState={theta:-55*RAD,power:1.3};
const appearance={...appearanceDefaults},targetAppearance={...appearanceDefaults,tint:0},reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const focus=new URLSearchParams(location.search).get('focus'),differentialFocus=focus==='differential'||document.body.hasAttribute('data-research-study'),bakeFocus=focus==='bake';
if(bakeFocus)document.body.classList.add('bake-focus');
const renderers={};let captured,points,targetPixels,history=[],iteration=0,fitting=false,raf=0,dirty=true,visible=true,hostPaused=false,ready=false,frames=0;
let transition=null,survey=null,lastTick=0,computeMs=0,fitStarted=0,vectorBridge=null;
const optionalKeys=['roughness','relief','tint','contrast'];
const selectedKeys=()=>['theta','power',...optionalKeys.filter(key=>differentialFocus&&$('solve-'+key).checked)];
const parameters=()=>({theta:state.theta,power:state.power,tint:state.tint,roughness:appearance.roughness,relief:appearance.relief,contrast:appearance.contrast});
const targetParameters=()=>({...parameters(),...targetAppearance,...targetState});
function setParameters(value){state.theta=value.theta;state.power=value.power;if(value.tint!==undefined)state.tint=value.tint;for(const key of ['roughness','relief','contrast'])if(value[key]!==undefined)appearance[key]=value[key];}
const evaluate=p=>differentialFocus?predictionParameters(points,p):prediction(points,p.theta,p.power);
function measured(operation){const t=performance.now(),result=operation();computeMs+=performance.now()-t;return result;}
function timing(){document.body.dataset.computeMs=String(computeMs);$('compute-time').textContent=`${computeMs.toFixed(1)} ms numerical work`;}
function sharedAppearance(){for(const key of optionalKeys)if(!differentialFocus||!$('solve-'+key).checked)targetAppearance[key]=key==='tint'?state.tint:appearance[key];targetAppearance.material=appearance.material;targetAppearance.texture=appearance.texture;}
function syncUnknowns(){
  for(const key of optionalKeys){const enabled=differentialFocus&&$('solve-'+key).checked;$('target-'+key+'-row').hidden=!enabled;$('target-'+key).value=targetAppearance[key];$('target-'+key+'-value').textContent=targetAppearance[key].toFixed(2);}
  $('unknown-count').textContent=selectedKeys().length+' fitted scalars';
}

if(differentialFocus){document.body.classList.add('differential-focus');document.querySelector('h1').textContent='Fit the image. Export the drawing.';document.querySelector('.intro').textContent='Keeping a scene in the host enables tools before export: here, image fitting recovers light and material settings, then the same scene becomes ordinary Rive paths and fills. This optional browser experiment connects inverse rendering to RIVX’s representation choices.';document.title='Image fitting → ordinary Rive vectors · RIVX experiment';document.querySelector('.route>span').textContent='Host-side image fitting → shaded vector facets → portable .riv';document.querySelector('.route>a').textContent='Inspect the generated Rive drawing ↓';document.querySelector('.route>a').href='#vector-title';state.theta=55*RAD;state.power=.65;}
if(document.body.hasAttribute('data-research-study')){document.title='Material recovery · Inverse Render Lab';document.querySelector('h1').textContent='Recover the material. Keep the drawing.';document.querySelector('.intro').textContent='A calibrated image can constrain more than the light. Fit six surface and illumination scalars, inspect their actual residuals, then turn the recovered scene into ordinary Rive geometry. This is the same executable study used in the RIVX representation laboratory.';}
function stopFit(message){if(fitting&&message)$('fit-status').textContent=message;fitting=false;transition=null;survey=null;lastTick=0;document.body.dataset.fitPhase='idle';$('fit').textContent='Fit selected parameters';}
function sync(){for(const [id,value] of [['light',state.theta/RAD],['power',state.power],['camera',state.yaw/RAD],['tint',state.tint],['target-angle',targetState.theta/RAD],['target-power',targetState.power]])$(id).value=value;$('keep-color').checked=state.keepColor;$('grid').checked=state.grid;for(const [id,value] of [['light',`${(state.theta/RAD).toFixed(1)}°`],['power',state.power.toFixed(2)],['camera',`${(state.yaw/RAD).toFixed(1)}°`],['tint',`${Math.round(state.tint*100)}%`],['target-angle',`${(targetState.theta/RAD).toFixed(0)}°`],['target-power',targetState.power.toFixed(2)]])$(id+'-value').textContent=value;}
function refreshEvidence(){sharedAppearance();points=probes(state.yaw,state.tint,80,52,differentialFocus?appearance:null);targetPixels=evaluate(targetParameters());history=[loss(evaluate(parameters()),targetPixels)];syncUnknowns();$('sample-count').textContent=`${points.length} visible sphere pixels · ${points.length*3} linear RGB residuals`;iteration=0;updateLoss();}
function updateLoss(){const current=history.at(-1);$('loss-value').textContent=current.toExponential(3);const scale=Math.max(history[0],...history,1e-12);const path=history.map((v,i)=>`${i?'L':'M'}${history.length>1?i/(history.length-1)*400:0} ${(64-58*Math.sqrt(v/scale)).toFixed(2)}`).join(' ');$('loss-path').setAttribute('d',history.length===1?path+' L400 '+(64-58*Math.sqrt(current/scale)).toFixed(2):path);$('loss-chart').setAttribute('aria-label',`Loss history, ${history.length} samples. Initial MSE ${history[0].toExponential(3)}, current MSE ${current.toExponential(3)}. Vertical display uses square-root error.`);document.body.dataset.loss=String(current);document.body.dataset.iterations=String(iteration);}
function render(){sync();syncAppearance();syncUnknowns();const normal={...state,...appearance,detailMode:differentialFocus,grid:false};renderers.frozen?.draw(state,2);renderers.surface?.draw(state,1);renderers.live?.draw(state);renderers.prediction?.draw(normal);renderers.derivative?.draw(normal,3);renderers.target?.draw({...normal,...(differentialFocus?targetAppearance:{}),...targetState});$('surface-status').textContent=state.keepColor?'Camera and surface color remain editable.':'Camera stays live; captured surface color is locked.';$('color-capability').textContent=state.keepColor?'Color live':'Color fixed';$('color-capability').classList.toggle('yes',state.keepColor);$('prediction-status').textContent=`Light ${(state.theta/RAD).toFixed(1)}° · power ${state.power.toFixed(2)}`;$('target-status').textContent=`Target ${(targetState.theta/RAD).toFixed(0)}° · power ${targetState.power.toFixed(2)}`;dirty=false;document.body.dataset.frames=String(++frames);document.body.dataset.light=String(state.theta/RAD);document.body.dataset.power=String(state.power);document.body.dataset.camera=String(state.yaw/RAD);document.body.dataset.tint=String(state.tint);document.body.dataset.material=String(appearance.material);document.body.dataset.texture=String(appearance.texture);document.body.dataset.relief=String(appearance.relief);document.body.dataset.roughness=String(appearance.roughness);document.body.dataset.contrast=String(appearance.contrast);vectorBridge?.markStale();}
function capture(){stopFit();captured={theta:state.theta,power:state.power,yaw:state.yaw,tint:state.tint};state.bakedTint=state.tint;if(!differentialFocus){const charts=makeBake(state.theta,state.power);charts.forEach((chart,i)=>renderers.surface.upload(i,chart.size,chart.size,chart.data));renderers.live.draw({...state,grid:false});renderers.frozen.upload(3,640,416,renderers.live.read());}$('capture-status').textContent=`Captured light ${(state.theta/RAD).toFixed(1)}° · power ${state.power.toFixed(2)} · camera ${(state.yaw/RAD).toFixed(1)}°`;$('frozen-status').textContent=`Captured view ${(state.yaw/RAD).toFixed(1)}°; every pixel stays fixed.`;document.body.dataset.bakedLight=String(state.theta/RAD);$('insight').textContent='The new image and lighting charts now match the current state. Change the camera, light or color again to test which dependencies survived.';dirty=true;wake();}
function wake(){if(ready&&!raf&&visible&&!hostPaused&&!document.hidden)raf=requestAnimationFrame(tick);}
function finishStep(next){
  setParameters(next);if(next.improved){iteration++;history.push(next.loss);}updateLoss();transition=null;dirty=true;
  document.body.dataset.fitPhase='accepted';timing();
  if(next.loss<1e-10||!next.improved||iteration>=48){
    stopFit();const reduction=history[0]>0?100*(1-next.loss/history[0]):0;
    $('fit-status').textContent=next.loss<1e-8?'Target recovered':next.improved?'Iteration limit reached':'Fit reached a local stationary point';
    $('fit-detail').textContent=`${iteration} accepted steps · error reduced by ${reduction.toFixed(3)}%. Fitted: ${selectedKeys().map(key=>parameterNames[key]).join(', ')}. ${computeMs.toFixed(1)} ms numerical work; ${(performance.now()-fitStarted).toFixed(0)} ms elapsed including presentation. Discrete material, texture frequencies, camera and geometry remain known.`;
    document.body.dataset.fitResult=$('fit-status').textContent;
  }
}
function acceptStep(next,coarse=false){
  if(!next.improved||reducedMotion.matches||!$('animate-fit').checked){finishStep(next);return;}
  transition={from:parameters(),next,elapsed:0,duration:coarse?1100:580};
  document.body.dataset.fitPhase='transition';document.body.dataset.stepAngle=String(next.theta/RAD);
  $('fit-status').textContent=`Moving to accepted step ${iteration+1}`;
  $('fit-detail').textContent=`${coarse?'A coarse angle survey found this lower-error basin.':'A damped Gauss–Newton step passed the residual test.'} This transition is slowed for inspection. The loss curve records accepted endpoints, not intervening animation.`;
}
function solverTick(){
  if(survey){
    const budget=$('animate-fit').checked?2:22;
    for(let j=0;j<budget&&survey.index<survey.angles.length;j++){
      const angle=survey.angles[survey.index++];
      const candidate=measured(()=>differentialFocus?profileParameters(points,targetPixels,parameters(),angle):profileLight(points,targetPixels,angle));
      if(candidate.loss<survey.best.loss)survey.best=candidate;
    }
    $('fit-status').textContent=`Surveying light angles · ${survey.index} / ${survey.angles.length}`;timing();
    if(survey.index===survey.angles.length){const best=survey.best;survey=null;acceptStep({...best,improved:best.loss<history.at(-1)},true);}
  }else acceptStep(measured(()=>differentialFocus?fitParametersStep(points,targetPixels,parameters(),selectedKeys()):fitStep(points,targetPixels,state.theta,state.power)));
}
function tick(now){
  raf=0;if(!visible||hostPaused||document.hidden){lastTick=0;return;}
  const dt=lastTick?Math.min(64,now-lastTick):0;lastTick=now;
  if(fitting){
    if(transition){
      transition.elapsed+=dt;const u=reducedMotion.matches||!$('animate-fit').checked?1:Math.min(1,transition.elapsed/transition.duration),e=u*u*(3-2*u),next={};
      for(const key of Object.keys(transition.from))next[key]=transition.from[key]+((transition.next[key]??transition.from[key])-transition.from[key])*e;
      setParameters(next);dirty=true;if(u===1)finishStep(transition.next);
    }else{
      const end=performance.now()+20;do{solverTick();}while(fitting&&!survey&&!transition&&!$('animate-fit').checked&&performance.now()<end);
    }
  }
  if(dirty)render();if(fitting)wake();else lastTick=0;
}
function update(refit=true){stopFit('Controls changed · ready to refit');if(refit)refreshEvidence();dirty=true;vectorBridge?.markStale();wake();}
function syncAppearance(){
  for(const key of ['relief','contrast']){$('solve-'+key).disabled=appearance.texture===0;$('solve-'+key).title=appearance.texture===0?'A plain surface has no pattern coefficient or height gradient to recover.':'';if(appearance.texture===0)$('solve-'+key).checked=false;}
  for(const key of ['material','texture','roughness','relief','contrast'])$(key).value=appearance[key];
  $('relief').disabled=appearance.texture===0;$('relief').title=appearance.texture===0?'Choose a texture to supply the height gradient.':'Analytic height gradient changes the shading normal; the silhouette stays spherical.';$('roughness-value').textContent=appearance.roughness.toFixed(2);$('relief-value').textContent=appearance.relief.toFixed(2);$('contrast-value').textContent=appearance.contrast.toFixed(2);
  $('appearance-status').textContent=`${materialNames[appearance.material]} · ${textureNames[appearance.texture]} · ${selectedKeys().length===2?'surface known; fit light':'selected surface scalars are unknown'}`;
}
for(const key of ['material','texture','roughness','relief','contrast'])$(key).addEventListener('input',()=>{appearance[key]=Number($(key).value);syncAppearance();update();});
const materialStudies={mokume:{material:1,texture:1,roughness:.38,relief:.45,tint:0},porcelain:{material:0,texture:3,roughness:.24,relief:.62,tint:1},inlay:{material:2,texture:2,roughness:.3,relief:.45,tint:.4}};
document.querySelectorAll('[data-study]').forEach(button=>button.addEventListener('click',()=>{const {tint,...values}=materialStudies[button.dataset.study];Object.assign(appearance,values);state.tint=tint;syncAppearance();update();$('fit-status').textContent='Material changed · light is ready to recover';}));
for(const [id,key,multiplier] of [['light','theta',RAD],['power','power',1],['camera','yaw',RAD],['tint','tint',1]])$(id).addEventListener('input',()=>{state[key]=Number($(id).value)*multiplier;update();});
for(const [id,key,multiplier] of [['target-angle','theta',RAD],['target-power','power',1]])$(id).addEventListener('input',()=>{targetState[key]=Number($(id).value)*multiplier;update();});
$('keep-color').onchange=()=>{state.keepColor=$('keep-color').checked;update(false);};$('grid').onchange=()=>{state.grid=$('grid').checked;update(false);};$('epsilon').onchange=()=>{state.epsilon=Number($('epsilon').value)*RAD;update(false);};
$('capture').onclick=capture;
$('reset').onclick=()=>{Object.assign(state,initial);Object.assign(appearance,appearanceDefaults);syncAppearance();Object.assign(targetState,{theta:-55*RAD,power:1.3});Object.assign(targetAppearance,{...appearanceDefaults,tint:0});optionalKeys.forEach(key=>$('solve-'+key).checked=false);$('epsilon').selectedIndex=0;refreshEvidence();capture();$('fit-status').textContent='Ready to fit';$('fit-detail').textContent='The solver receives target colors and estimates the light angle and power from their residuals.';};
$('try-light').onclick=()=>{state.theta=(captured.theta/RAD<0?65:-65)*RAD;$('insight').textContent='The light and shadow move only in the retained scene. The surface bake still knows where its illumination belongs, but that captured illumination cannot follow a new emitter.';update();};
$('try-camera').onclick=()=>{state.yaw=(captured.yaw/RAD>0?-58:58)*RAD;$('insight').textContent='The captured image keeps its old projection. The baked lighting and retained scene both follow the camera because they still know the surfaces. This diffuse model has no view-dependent reflection to invalidate the lighting bake.';update();};
$('try-color').onclick=()=>{state.tint=captured.tint<.5?1:0;$('insight').textContent=state.keepColor?'Surface color survived because the charts store illumination separately. The fixed image cannot recover that separation. Turn off editable surface color to see a bake that locks the captured color as well.':'The surface bake now locks its captured color. Only the retained scene follows the new material color; re-enable editable surface color to retain that degree of freedom.';update();};
$('challenge').onclick=()=>{state.theta=55*RAD;state.power=.65;targetState.theta=-55*RAD;targetState.power=1.3;state.yaw=18*RAD;state.tint=0;update();$('fit-status').textContent='Challenge ready · recover angle and power';$('fit-detail').textContent='The prediction starts at +55° and power 0.65. The target is a separate image at −55° and power 1.30. Press Fit to estimate both from visible sphere colors.';};
$('animate-fit').onchange=()=>{if(fitting)wake();};
for(const key of optionalKeys){$('solve-'+key).onchange=()=>{sharedAppearance();syncUnknowns();update();};$('target-'+key).oninput=()=>{targetAppearance[key]=Number($('target-'+key).value);update();};}
$('challenge-material').onclick=()=>{optionalKeys.forEach(key=>$('solve-'+key).checked=true);Object.assign(appearance,{material:2,texture:2,roughness:.6,relief:.12,contrast:.25});Object.assign(state,{theta:55*RAD,power:.65,tint:.1,yaw:18*RAD});Object.assign(targetAppearance,{material:2,texture:2,roughness:.3,relief:.6,tint:.7,contrast:.85});Object.assign(targetState,{theta:-55*RAD,power:1.3});syncAppearance();update();$('fit-status').textContent='Six unknowns · one target image';};
$('fit').onclick=()=>{if(fitting){stopFit('Fit paused');return;}refreshEvidence();fitting=true;lastTick=0;computeMs=0;fitStarted=performance.now();timing();delete document.body.dataset.fitResult;if(differentialFocus){survey={angles:Array.from({length:22},(_,i)=>Math.min(125,-125+i*12)*RAD),index:0,best:{...parameters(),loss:history[0]}};}document.body.dataset.fitPhase=survey?'survey':'solve';$('fit').textContent='Pause fit';$('fit-status').textContent='Fitting from image residuals…';wake();};
new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);lastTick=0;wake();},{rootMargin:'80px'}).observe(document.querySelector('main'));
document.addEventListener('visibilitychange',()=>{lastTick=0;wake();});window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==location.origin)return;if(e.data?.type==='portfolio-lab-visibility'){hostPaused=!e.data.visible;lastTick=0;wake();}});
window.addEventListener('pagehide',e=>{if(raf)cancelAnimationFrame(raf);raf=0;if(!e.persisted){ready=false;vectorBridge?.dispose();Object.values(renderers).forEach(r=>r.dispose());}});window.addEventListener('pageshow',()=>{dirty=true;wake();});
try{for(const id of differentialFocus?['prediction','derivative','target']:bakeFocus?['frozen','surface','live']:['frozen','surface','live','prediction','derivative','target'])renderers[id]=createRenderer($(id));ready=true;syncAppearance();refreshEvidence();capture();render();document.body.dataset.ready='true';if(differentialFocus){vectorBridge=makeVectorBridge(()=>({...state,...appearance,detailMode:true}),edit=>{for(const[key,value]of Object.entries(edit))if(key in appearance)appearance[key]=value;else state[key]=value;update();});}if(parent!==window)parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);}catch(error){$('error').hidden=false;$('error').textContent=error.message;document.body.dataset.error=error.message;document.querySelectorAll('input,button,select').forEach(control=>control.disabled=true);console.error(error);}
