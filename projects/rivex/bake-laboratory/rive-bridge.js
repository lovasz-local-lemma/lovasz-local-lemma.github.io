import {spheres,camera,dot,sub,norm,surfaceRadiance,STUDY_ZOOM} from './model.js';

// Scene-derived, fixed-projection polygons. No image readback is involved.
export function vectorFacets(state,segments=48){
  const c=camera(state.yaw,STUDY_ZOOM),facets=[],project=p=>{const q=sub(p,c.eye),z=dot(q,c.f);return [480+dot(q,c.r)/z*2.1*312,312-dot(q,c.u)/z*2.1*312];};
  const color=rgb=>((255<<24)|rgb.reduce((value,v,i)=>value|(Math.round(Math.pow(Math.max(0,v)/(1+Math.max(0,v)),1/2.2)*255)<<(16-i*8)),0))>>>0;
  function triangle(points,id){
    if(points.some(p=>dot(sub(p,c.eye),c.f)<.1))return;
    const p=points[0].map((v,i)=>(v+points[1][i]+points[2][i])/3),n=id===2?[0,1,0]:norm(sub(p,spheres[id])),view=norm(sub(c.eye,p));
    if(id!==2&&dot(n,view)<=0)return;
    const surface=id===2?p:n.map((v,i)=>spheres[id][i]+v*spheres[id][3]);
    const rgb=surfaceRadiance({p:surface,n,id,view,appearance:state,tint:state.tint},state.theta,state.power);
    facets.push({points:points.map(project),color:color(rgb),depth:dot(sub(p,c.eye),c.f),id});
  }
  for(let id=0;id<2;id++){
    const s=spheres[id],rows=segments/2,p=(u,v)=>[s[0]+s[3]*Math.sin(v)*Math.cos(u),s[1]+s[3]*Math.cos(v),s[2]+s[3]*Math.sin(v)*Math.sin(u)];
    for(let v=0;v<rows;v++)for(let u=0;u<segments;u++){
      const a=p(u/segments*Math.PI*2,v/rows*Math.PI),b=p((u+1)/segments*Math.PI*2,v/rows*Math.PI),d=p(u/segments*Math.PI*2,(v+1)/rows*Math.PI),e=p((u+1)/segments*Math.PI*2,(v+1)/rows*Math.PI);
      if(v)triangle([a,b,d],id);if(v<rows-1)triangle([b,e,d],id);
    }
  }
  for(let z=-4;z<4;z+=.25)for(let x=-4;x<4;x+=.25){triangle([[x,0,z],[x+.25,0,z],[x,0,z+.25]],2);triangle([[x+.25,0,z],[x+.25,0,z+.25],[x,0,z+.25]],2);}
  // Rive's earlier shapes draw above later shapes. Floor is always behind the
  // two disjoint spheres; within either object sort projected triangles by depth.
  return facets.sort((a,b)=>(a.id===2)-(b.id===2)||a.depth-b.depth);
}
export function encodeVectorScene(facets){
  const types={4:1,5:0,7:2,8:2,24:2,25:2,32:0,37:3,40:0},bytes=[82,73,86,69],scratch=new DataView(new ArrayBuffer(4));
  const uint=n=>{while(n>=128){bytes.push((n&127)|128);n>>>=7;}bytes.push(n);};
  const four=(n,float=false)=>{float?scratch.setFloat32(0,n,true):scratch.setUint32(0,n,true);bytes.push(...new Uint8Array(scratch.buffer));};
  [7,0,0,...Object.keys(types).map(Number),0].forEach(uint);const kinds=Object.values(types);for(let i=0;i<kinds.length;i+=4)four(kinds.slice(i,i+4).reduce((v,k,j)=>v|(k<<(2*j)),0));
  let id=0;const obj=(type,props={})=>{const index=id++;uint(type);for(const [key,value]of Object.entries(props)){uint(+key);if(types[key]===0)uint(value);else if(types[key]===1){const b=new TextEncoder().encode(value);uint(b.length);bytes.push(...b);}else four(value,types[key]===2);}uint(0);return index;};
  obj(23);id=0;obj(1,{4:'Recovered scene — shaded vector facets; fixed projection',7:960,8:624});
  facets.forEach((facet,i)=>{const shape=obj(3,{4:(facet.id===2?'receiver':'sphere-'+facet.id)+'-facet-'+i,5:0}),path=obj(16,{5:shape,32:1});const polygon=facet.points.slice(),area=polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];},0);if(area<0)polygon.reverse();for(const [x,y]of polygon)obj(5,{5:path,24:x,25:y});const fill=obj(20,{5:shape,40:2});obj(18,{5:fill,37:facet.color});});
  return new Uint8Array(bytes);
}
export function makeVectorBridge(getState,onEdit){
  const $=id=>document.getElementById(id),canvas=$('rive-scene'),section=canvas.closest('.vector-bridge');
  let runtime,renderer,file,art,bytes,initialized,version=0,disposed=false,busy=false,raf=0,timer=0;
  let captured='',quality=0,wanted='',lastChange=0,seen=false,localVisible=true,hostPaused=false,hostKnown=false,pageActive=true,forceFinal=false,builds=0;
  const signature=state=>JSON.stringify([state.theta,state.power,state.yaw,state.tint,state.material,state.texture,state.roughness,state.relief,state.contrast,$('facet-density').value]);
  const active=()=>!disposed&&pageActive&&!document.hidden&&!hostPaused&&(hostKnown||localVisible);
  const current=()=>captured===signature(getState())&&quality===Number($('facet-density').value);
  function report(phase,text){section.dataset.rivePhase=phase;section.setAttribute('aria-busy',String(['queued','rebuilding'].includes(phase)));$('rive-status').textContent=text;$('download-rive').disabled=!bytes||!current()||busy;}
  async function initialize(){const {default:Rive}=await import('../vector-replay/vendor/webgl2_advanced.js');runtime=await Rive({locateFile:()=>new URL('../vector-replay/vendor/rive.wasm',import.meta.url).href});if(disposed)return;renderer=runtime.makeRenderer(canvas,true);if(!renderer)throw Error('Official Rive renderer unavailable.');}
  function schedule(delay=70){if(timer||busy||!seen||!active()||(!$('rive-live').checked&&!forceFinal))return;timer=setTimeout(()=>{timer=0;rebuild();},delay);}
  function syncControls(){const state=getState();for(const[id,key,scale]of[['rive-camera','yaw',180/Math.PI],['rive-light','theta',180/Math.PI],['rive-roughness','roughness',1]]){$(id).value=state[key]*scale;$(id+'-value').textContent=key==='roughness'?state[key].toFixed(2):(state[key]*scale).toFixed(1)+'°';}}
  function markStale(){
    if(disposed)return;syncControls();const next=signature(getState());
    if(next!==wanted){wanted=next;lastChange=performance.now();}
    if(current())return;
    if(!busy)report($('rive-live').checked?'queued':'held',$('rive-live').checked?'Standby · updating the ordinary Rive drawing…':'Drawing held · enable Live update or rebuild this scene.');
    schedule();
  }
  async function rebuild(){
    if(busy||!active()||!seen)return;
    busy=true;$('rebuild-rive').disabled=true;report('rebuilding','Rebuilding · shading projected polygons for official Rive…');
    const token=++version,started=performance.now();let failed=false;
    try{
      if(!initialized)initialized=initialize();await initialized;if(disposed)return;
      // Changes while loading or rebuilding are coalesced into the next sample.
      // A smaller mesh supplies feedback during a drag; the selected density is
      // restored after 180 ms of quiet. Neither route uses an image snapshot.
      const state={...getState()},key=signature(state),density=Number($('facet-density').value);
      const resolution=forceFinal||performance.now()-lastChange>=180?density:Math.min(24,density);forceFinal=false;
      const facets=vectorFacets(state,resolution),nextBytes=encodeVectorScene(facets),next=await runtime.load(nextBytes,undefined,false);
      if(!next)throw Error('Official Rive could not read the vector scene.');
      if(disposed||token!==version){next.delete();return;}
      const nextArt=next.defaultArtboard();if(!nextArt){next.delete();throw Error('The vector scene contains no artboard.');}
      art?.delete();file?.delete();file=next;art=nextArt;bytes=nextBytes;captured=key;quality=resolution;
      if(raf)runtime.cancelAnimationFrame(raf);
      raf=runtime.requestAnimationFrame(()=>{
        raf=0;if(!active()||token!==version)return;
        art.advance(0);renderer.clear();renderer.save();renderer.align(runtime.Fit.contain,runtime.Alignment.center,{minX:0,minY:0,maxX:960,maxY:624},{minX:0,minY:0,maxX:960,maxY:624});art.draw(renderer);renderer.restore();renderer.flush();
        delete canvas.dataset.error;Object.assign(canvas.dataset,{ready:'true',facets:facets.length,light:state.theta,bytes:bytes.length,parameters:JSON.stringify(state),builds:++builds,quality:resolution,buildMs:(performance.now()-started).toFixed(1)});
        if(current())report('ready',`Live ordinary Rive · ${facets.length.toLocaleString()} paths · ${(bytes.length/1024).toFixed(0)} KB · drag to orbit`);
        else{report('queued','Standby · refining the latest scene into ordinary Rive…');schedule(Math.max(30,180-(performance.now()-lastChange)));}
      });
    }catch(error){failed=true;report('error','Vector preview unavailable: '+error.message);canvas.dataset.error=error.message;if(!renderer)initialized=null;}
    finally{busy=false;$('rebuild-rive').disabled=false;if(!failed&&!current())schedule(Math.max(30,180-(performance.now()-lastChange)));}
  }
  $('rebuild-rive').onclick=()=>{forceFinal=true;seen=true;wanted=signature(getState());if(timer)clearTimeout(timer);timer=0;rebuild();};
  $('facet-density').onchange=markStale;$('rive-live').onchange=()=>{if(!$('rive-live').checked){clearTimeout(timer);timer=0;}markStale();};
  for(const[id,key,scale]of[['rive-camera','yaw',Math.PI/180],['rive-light','theta',Math.PI/180],['rive-roughness','roughness',1]])$(id).oninput=()=>onEdit({[key]:Number($(id).value)*scale});
  let drag=null;canvas.onpointerdown=e=>{if(e.button!==0)return;drag={x:e.clientX,yaw:getState().yaw};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(drag)onEdit({yaw:Math.max(-80*Math.PI/180,Math.min(80*Math.PI/180,drag.yaw-(e.clientX-drag.x)*.005))});};
  canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};canvas.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();onEdit({yaw:Math.max(-80*Math.PI/180,Math.min(80*Math.PI/180,getState().yaw+(e.key==='ArrowLeft'?1:-1)*.04))});};
  let downloads=0;$('download-rive').onclick=()=>{if(!bytes||!current()||busy)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));a.href=url;a.download='recovered-vector-scene'+(downloads?' ['+downloads+']':'')+'.riv';downloads++;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  let wasActive=active();
  function resume(){const now=active(),resuming=now&&!wasActive;wasActive=now;if(!now){if(timer)clearTimeout(timer);timer=0;if(raf)runtime?.cancelAnimationFrame(raf);raf=0;return;}if(seen&&resuming){captured='';markStale();}}
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&!seen){seen=true;forceFinal=true;markStale();}},{rootMargin:'100px'});observer.observe(section);
  const visibility=new IntersectionObserver(entries=>{localVisible=entries[0].isIntersecting;resume();});visibility.observe(document.querySelector('main'));
  const onHost=e=>{if(e.source===parent&&e.origin===location.origin&&e.data?.type==='portfolio-lab-visibility'){hostKnown=true;hostPaused=!e.data.visible;resume();}};
  const onHide=()=>{pageActive=false;resume();},onShow=()=>{pageActive=true;resume();};
  window.addEventListener('message',onHost);window.addEventListener('pagehide',onHide);window.addEventListener('pageshow',onShow);document.addEventListener('visibilitychange',resume);syncControls();
  return {markStale,dispose(){disposed=true;version++;clearTimeout(timer);observer.disconnect();visibility.disconnect();window.removeEventListener('message',onHost);window.removeEventListener('pagehide',onHide);window.removeEventListener('pageshow',onShow);document.removeEventListener('visibilitychange',resume);if(raf)runtime?.cancelAnimationFrame(raf);art?.delete();file?.delete();renderer?.delete();}};
}
