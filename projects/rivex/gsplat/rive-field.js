// A bounded ordinary-Rive approximation of the same trained PLY resource.
// Projection and SH use the Gaussian renderer's camera/model conventions.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function projection(state,width,height){const {yaw,pitch,distance}=state,eye=[distance*Math.sin(yaw)*Math.cos(pitch),distance*Math.sin(pitch),distance*Math.cos(yaw)*Math.cos(pitch)],forward=eye.map(x=>-x/distance),right=[Math.cos(yaw),0,-Math.sin(yaw)],up=[-Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch),-Math.sin(pitch)*Math.cos(yaw)];return {eye,forward,right,up,width,height,focal:Math.min(width,height)*.5/Math.tan(.5)};}
export function projectedGaussian(cloud,id,state,c){
 const b=id*80,r=cloud.records,p=[r[b],r[b+1],r[b+2]],d=p.map((x,i)=>x-c.eye[i]),z=dot(d,c.forward),opacity=r[b+3];
 if(z<.05||opacity<1/255||(state.crop&&Math.max(...p.map(Math.abs))>1.045))return null;
 const x=dot(d,c.right),y=dot(d,c.up),jx=c.right.map((v,i)=>c.focal/z*(v-c.forward[i]*x/z)),jy=c.up.map((v,i)=>c.focal/z*(v-c.forward[i]*y/z)),cov=v=>[r[b+4]*v[0]+r[b+5]*v[1]+r[b+6]*v[2],r[b+5]*v[0]+r[b+7]*v[1]+r[b+8]*v[2],r[b+6]*v[0]+r[b+8]*v[1]+r[b+9]*v[2]];
 const xx=dot(jx,cov(jx))*state.scale**2+.3,xy=dot(jx,cov(jy))*state.scale**2,yy=dot(jy,cov(jy))*state.scale**2+.3,mid=(xx+yy)/2,delta=Math.hypot((xx-yy)/2,xy),l1=Math.max(mid+delta,.1),l2=Math.max(mid-delta,.1),rx=Math.sqrt(l1),ry=Math.sqrt(l2);
 const angle=Math.abs(xy)>1e-6?-Math.atan2(l1-xx,xy):(xx>=yy?0:-Math.PI/2),cx=c.width/2+x*c.focal/z,cy=c.height/2-y*c.focal/z;
 if(cx+3*rx<0||cx-3*rx>c.width||cy+3*rx<0||cy-3*rx>c.height)return null;
 const len=Math.hypot(...d),[a,e,f]=d.map(v=>v/len),sh=[.2820947918,-.4886025119*e,.4886025119*f,-.4886025119*a,1.0925484306*a*e,-1.0925484306*e*f,.3153915653*(2*f*f-a*a-e*e),-1.0925484306*a*f,.5462742153*(a*a-e*e),-.5900435899*e*(3*a*a-e*e),2.8906114426*a*e*f,-.4570457995*e*(4*f*f-a*a-e*e),.3731763326*f*(2*f*f-3*a*a-3*e*e),-.4570457995*a*(4*f*f-a*a-e*e),1.4453057213*f*(a*a-e*e),-.5900435899*a*(a*a-3*e*e)];
 const rgb=[0,1,2].map(k=>{let sum=.5;for(let j=0;j<(state.directional?16:1);j++)sum+=sh[j]*r[b+12+j*4+k];return clamp(sum*state.exposure,0,1);});
 return {id,x:cx,y:cy,rx,ry,angle,z,opacity:clamp(opacity,0,.99),rgb,score:opacity*Math.sqrt(rx*ry)};
}
export function selectProjected(cloud,state,width,height,budget){
 const c=projection(state,width,height),buckets=Array.from({length:384},()=>[]);let eligible=0;
 for(let id=0;id<cloud.count;id++){const mark=projectedGaussian(cloud,id,state,c);if(!mark)continue;eligible++;const x=clamp(Math.floor(mark.x/width*24),0,23),y=clamp(Math.floor(mark.y/height*16),0,15);buckets[y*24+x].push(mark);}
 buckets.forEach(bucket=>bucket.sort((a,b)=>b.score-a.score||a.id-b.id));const marks=[];let row=0,added=true;
 while(marks.length<budget&&added){added=false;for(const bucket of buckets){if(bucket[row]){marks.push(bucket[row]);added=true;if(marks.length===budget)break;}}row++;}
 // Earlier native drawables appear above later ones.
 marks.sort((a,b)=>a.z-b.z||a.id-b.id);return {marks,eligible};
}
export function encodeProjected(marks,width,height,layers=6){
 const props={4:1,5:0,7:2,8:2,13:2,14:2,15:2,16:2,17:2,18:2,20:2,21:2,37:3,40:0},bytes=[82,73,86,69],scratch=new DataView(new ArrayBuffer(4));
 const uint=n=>{while(n>=128){bytes.push((n&127)|128);n>>>=7;}bytes.push(n);},four=(n,float=false)=>{float?scratch.setFloat32(0,n,true):scratch.setUint32(0,n,true);bytes.push(...new Uint8Array(scratch.buffer));};
 [7,0,0,...Object.keys(props).map(Number),0].forEach(uint);const kinds=Object.values(props);for(let i=0;i<kinds.length;i+=4)four(kinds.slice(i,i+4).reduce((v,k,j)=>v|(k<<(2*j)),0));
 let id=0;const obj=(type,p={})=>{const index=id++;uint(type);for(const[k,v]of Object.entries(p)){uint(+k);if(props[k]===0)uint(v);else if(props[k]===1){const b=new TextEncoder().encode(v);uint(b.length);bytes.push(...b);}else four(v,props[k]===2);}uint(0);return index;};
 obj(23);id=0;obj(1,{4:'Trained Gaussians — projected ordinary Rive ellipses; fixed view',7:width,8:height});
 for(const m of marks){const group=obj(2,{4:'gaussian-'+m.id,5:0,13:m.x,14:m.y,15:m.angle,16:m.rx,17:m.ry}),color=((255<<24)|(Math.round(m.rgb[0]*255)<<16)|(Math.round(m.rgb[1]*255)<<8)|Math.round(m.rgb[2]*255))>>>0;
  for(let i=0;i<layers;i++){const radius=layers===1?2:(i+1)/layers*3,alpha=layers===1?m.opacity:(m.opacity*Math.exp(-.5*((i+.5)/layers*3)**2)-(i+1<layers?m.opacity*Math.exp(-.5*((i+1.5)/layers*3)**2):0))/(1-(i+1<layers?m.opacity*Math.exp(-.5*((i+1.5)/layers*3)**2):0)),shape=obj(3,{5:group,18:alpha});obj(4,{5:shape,20:radius*2,21:radius*2});const fill=obj(20,{5:shape,40:2});obj(18,{5:fill,37:color});}
 }
 return new Uint8Array(bytes);
}
export function createRiveField(canvas,changed){
 let runtime,renderer,file,art,marks=[],nodes=[],bytes,initialized,disposed=false,busy=false,timer=0,raf=0,lastCloud,lastState,lastMode,lastBudget,lastFrameSize,active=false,refreshAfterBusy=false,lastSignature='',lastLoadedSignature='',captures=0;
 const status=document.getElementById('rive-status'),signature=()=>JSON.stringify([lastState,lastMode,lastBudget,lastCloud?.revision||0,lastFrameSize]);
 async function init(){const {default:Rive}=await import('../vector-replay/vendor/webgl2_advanced.js');runtime=await Rive({locateFile:()=>new URL('../vector-replay/vendor/rive.wasm',import.meta.url).href});if(disposed)return;renderer=runtime.makeRenderer(canvas,true);if(!renderer)throw Error('Official Rive renderer unavailable');}
 function draw(){if(!active||disposed||!art||!lastCloud||document.hidden)return;const c=projection(lastState,canvas.width,canvas.height);marks.forEach((m,i)=>{const p=projectedGaussian(lastCloud,m.id,lastState,c),n=nodes[i];n.opacity=p?1:0;if(p){n.x=p.x;n.y=p.y;n.rotation=p.angle;n.scaleX=p.rx;n.scaleY=p.ry;}});art.advance(0);renderer.clear();renderer.save();renderer.align(runtime.Fit.contain,runtime.Alignment.center,{minX:0,minY:0,maxX:canvas.width,maxY:canvas.height},{minX:0,minY:0,maxX:canvas.width,maxY:canvas.height});art.draw(renderer);renderer.restore();renderer.flush();canvas.dataset.frames=String(Number(canvas.dataset.frames||0)+1);canvas.dataset.yaw=String(lastState.yaw);}
 function wake(){if(active&&!raf&&runtime&&!disposed&&!document.hidden)raf=runtime.requestAnimationFrame(()=>{raf=0;draw();});}
 async function refresh(){
  if(!active||disposed||!lastCloud)return;if(busy){refreshAfterBusy=true;return;}busy=true;let failed=false;status.textContent='Standby · sampling the trained field into ordinary Rive…';
  try{if(!initialized)initialized=init();await initialized;if(disposed)return;const cloud=lastCloud,state={...lastState},mode=lastMode,budget=lastBudget,sig=signature(),width=lastFrameSize[0],height=lastFrameSize[1],layers=mode==='flat'?1:6;
   const selection=selectProjected(cloud,state,width,height,budget),nextBytes=encodeProjected(selection.marks,width,height,layers),next=await runtime.load(nextBytes,undefined,false);if(!next)throw Error('Official Rive rejected the projected field');if(disposed){next.delete();return;}
   art?.delete();file?.delete();file=next;art=file.defaultArtboard();marks=selection.marks;nodes=marks.map(m=>art.node('gaussian-'+m.id));if(nodes.some(n=>!n))throw Error('Incomplete native ellipse pool');bytes=nextBytes;lastLoadedSignature=sig;canvas.width=width;canvas.height=height;canvas.dataset.ready='true';canvas.dataset.shapes=String(marks.length*layers);canvas.dataset.gaussians=String(marks.length);canvas.dataset.eligible=String(selection.eligible);canvas.dataset.captures=String(++captures);canvas.dataset.bytes=String(bytes.length);status.textContent=`Official Rive · ${marks.length.toLocaleString()} selected Gaussians / ${selection.eligible.toLocaleString()} visible · ${layers} ellipse${layers===1?'':'s'} each · ${(bytes.length/1024).toFixed(0)} KB`;wake();changed?.();
  }catch(e){failed=true;status.textContent='Native preview unavailable: '+e.message;canvas.dataset.error=e.message;}
  finally{busy=false;if(active&&!failed&&(refreshAfterBusy||lastLoadedSignature!==signature())){refreshAfterBusy=false;schedule();}}
 }
 function schedule(){if(timer||!active||disposed)return;timer=setTimeout(()=>{timer=0;refresh();},180);}
 return {
  update(cloud,state,{mode,budget,width,height}){lastCloud=cloud;lastState={...state};lastMode=mode;lastBudget=budget;lastFrameSize=[width,height];const sig=signature();if(sig!==lastSignature){lastSignature=sig;if(art)wake();schedule();}},
  setActive(value){active=value;if(!value){clearTimeout(timer);timer=0;if(raf)runtime?.cancelAnimationFrame(raf);raf=0;}else{wake();if(lastCloud&&lastLoadedSignature!==signature())schedule();}},
  async snapshot(){if(!active)throw Error('Keep the native preview visible while exporting');clearTimeout(timer);timer=0;while(busy)await new Promise(r=>setTimeout(r,20));if(lastLoadedSignature!==signature())await refresh();if(!bytes)throw Error('Wait for the native field to finish preparing');return bytes;},
  dispose(){disposed=true;clearTimeout(timer);if(raf)runtime?.cancelAnimationFrame(raf);art?.delete();file?.delete();renderer?.delete();}
 };
}
