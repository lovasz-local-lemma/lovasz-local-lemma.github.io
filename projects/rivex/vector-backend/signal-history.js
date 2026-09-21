/** Bounded, geometric history of Rive's evaluated drawing commands. */
export function createSignalHistory(canvas, options={}) {
  const maxFrames=72, maxPoints=2200, interval=1/20;
  const ctx=canvas.getContext('2d');
  let frames=[], clock=0, lastCapture=-Infinity, recording=true, mode='volume', yaw=.48, pitch=-.15, depth=190;
  let lookback=0, windowSeconds=3.5, sweepUntil=null, dragging=null, enabled=false;
  let revision=0, lastRender='', renders=0, captures=0;
  const onChange=()=>{revision++;options.onChange?.();};
  function snapshot(contours){
    const candidates=contours.filter(c=>c.points.length>1&&c.alpha>.01).slice(0,240);
    const total=candidates.reduce((n,c)=>n+c.points.length,0);let budget=maxPoints;const paths=[];
    for(let index=0;index<candidates.length;index++){
      const c=candidates[index],reserve=(candidates.length-index-1)*2;
      const count=Math.min(c.points.length,Math.max(2,Math.floor((maxPoints-candidates.length*2)*c.points.length/Math.max(1,total))+2),budget-reserve);
      if(count<2)break;
      const xy=new Float32Array(count*2);
      for(let j=0;j<count;j++){const a=j*(c.points.length-1)/(count-1),i=Math.floor(a),t=a-i,p=c.points[i],q=c.points[Math.min(i+1,c.points.length-1)];xy[2*j]=p[0]+(q[0]-p[0])*t;xy[2*j+1]=p[1]+(q[1]-p[1])*t;}
      paths.push({id:c.id,alpha:c.alpha,xy});budget-=count;
    }
    return {time:clock,paths};
  }
  function capture(contours,dt=0,advanced=true){
    if(!enabled)return false;
    clock+=Math.max(0,Math.min(.1,dt));
    if((!recording&&frames.length)||(!advanced&&frames.length)||clock-lastCapture<interval)return false;
    frames.push(snapshot(contours));lastCapture=clock;revision++;captures++;
    while(frames.length>maxFrames)frames.shift();
    if(sweepUntil!==null&&clock>=sweepUntil){recording=false;sweepUntil=null;options.onSweepComplete?.();}
    return true;
  }
  function clear(){frames=[];lastCapture=-Infinity;clock=0;sweepUntil=null;lookback=0;revision++;}
  function set(value){
    if(value.enabled!==undefined){enabled=!!value.enabled;dragging=null;}
    if(value.mode)mode=value.mode;
    if(value.recording!==undefined)recording=!!value.recording;
    if(value.lookback!==undefined)lookback=Math.max(0,Math.min(3.5,value.lookback));
    if(value.windowSeconds!==undefined)windowSeconds=Math.max(.05,Math.min(3.5,value.windowSeconds));
    if(value.depth!==undefined)depth=Math.max(0,Math.min(380,value.depth));
    onChange();
  }
  function sweep(seconds=1){clear();recording=true;mode='volume';sweepUntil=clock+seconds;windowSeconds=seconds;onChange();}
  function freeze(){recording=false;sweepUntil=null;onChange();}
  function project(x,y,z){
    const xx=(x-360)*.76, yy=(240-y)*.76;
    const a=xx*Math.cos(yaw)+z*Math.sin(yaw),b=-xx*Math.sin(yaw)+z*Math.cos(yaw);
    const vertical=yy*Math.cos(pitch)-b*Math.sin(pitch),distance=yy*Math.sin(pitch)+b*Math.cos(pitch);
    const scale=900/(900-distance);
    return [360+a*scale,240-vertical*scale];
  }
  function stroke3(points,col,width=1){ctx.beginPath();for(let i=0;i<points.length;i++){const p=project(...points[i]);i?ctx.lineTo(...p):ctx.moveTo(...p);}ctx.strokeStyle=col;ctx.lineWidth=width;ctx.stroke();}
  function render(selected=null){
    const key=enabled?`${revision}:${selected}`:'off';
    if(key===lastRender)return false;
    lastRender=key;renders++;
    ctx.clearRect(0,0,720,480);ctx.fillStyle='#09161c';ctx.fillRect(0,0,720,480);
    if(!enabled){ctx.fillStyle='#abc6c0';ctx.font='21px Georgia';ctx.textAlign='center';ctx.fillText('The time volume is optional.',360,214);ctx.font='14px system-ui';ctx.fillText('Enable 3D history above to record the live vector paths.',360,249);return true;}
    if(!frames.length){ctx.fillStyle='#abc6c0';ctx.font='17px Georgia';ctx.textAlign='center';ctx.fillText('Play the source to capture its actual paths.',360,235);return;}
    const newest=frames.at(-1).time,end=newest-lookback,start=end-windowSeconds;
    let shown=frames.filter(f=>f.time>=start-.001&&f.time<=end+.001);
    if(mode==='snapshot')shown=shown.length?[shown.at(-1)]:[];
    const span=Math.max(.05,newest-frames[0].time);
    if(mode==='volume'){
      for(const z of [-depth,0])stroke3([[0,0,z],[720,0,z],[720,480,z],[0,480,z],[0,0,z]],'#355955');
      for(const[x,y]of [[0,0],[720,0],[720,480],[0,480]])stroke3([[x,y,-depth],[x,y,0]],'#24443e');
    }
    for(const f of shown){
      const age=newest-f.time,z=mode==='snapshot'?0:-depth*age/span;
      const fraction=1-Math.min(1,age/span);
      for(const path of f.paths){
        const focus=selected===null||path.id===selected;
        const alpha=path.alpha*(mode==='snapshot'?.90:.065+.22*fraction)*(focus?1:.14);
        ctx.beginPath();for(let i=0;i<path.xy.length;i+=2){const q=mode==='snapshot'?[360+(path.xy[i]-360)*.86,240+(path.xy[i+1]-240)*.86]:project(path.xy[i],path.xy[i+1],z);i?ctx.lineTo(...q):ctx.moveTo(...q);}
        ctx.strokeStyle=focus?`rgba(${Math.round(101+133*fraction)},${Math.round(207+12*fraction)},${Math.round(205-65*fraction)},${alpha})`:`rgba(87,129,135,${alpha})`;
        ctx.lineWidth=mode==='snapshot'?1.4:1.05;ctx.stroke();
      }
    }
    ctx.textAlign='left';ctx.font='11px ui-monospace,monospace';ctx.fillStyle='#b8cfbe';ctx.fillText(mode==='snapshot'?'ONE CAPTURED POSE':'Z = ELAPSED SOURCE TIME',18,24);
    ctx.fillStyle='#ddcb9c';ctx.fillText(`${shown.length} / ${frames.length} retained samples · ${span.toFixed(2)} s`,18,460);
    ctx.textAlign='right';ctx.fillStyle='#8da9a4';ctx.fillText(mode==='volume'?'Drag to turn the time volume':'No shader or image edges supply these contours',702,460);
  }
  function metrics(){return{enabled,renders,captures,frames:frames.length,points:frames.reduce((n,f)=>n+f.paths.reduce((m,p)=>m+p.xy.length/2,0),0),bytes:frames.reduce((n,f)=>n+f.paths.reduce((m,p)=>m+p.xy.byteLength,0),0),maxFrames,maxPoints,recording,mode,lookback,windowSeconds,depth,clock,sweeping:sweepUntil!==null,first:frames[0]?.time,last:frames.at(-1)?.time};}
  function pack(){return{...metrics(),yaw,pitch,samples:frames.map(f=>({time:f.time,paths:f.paths.map(p=>({...p,xy:Array.from(p.xy)}))}))};}
  function restore(data){
    if(!data?.samples)return;
    clear();for(const f of data.samples.slice(-maxFrames)){let points=0;const paths=[];for(const p of f.paths.slice(0,240)){const xy=p.xy.slice(0,Math.min(maxPoints-points,p.xy.length/2)*2);if(xy.length<4||xy.some(v=>!Number.isFinite(v)))continue;points+=xy.length/2;paths.push({id:p.id,alpha:Math.max(0,Math.min(1,p.alpha)),xy:new Float32Array(xy)});if(points>=maxPoints)break;}frames.push({time:Number(f.time)||0,paths});}
    clock=frames.at(-1)?.time||0;lastCapture=clock;recording=false;mode=data.mode==='snapshot'?'snapshot':'volume';yaw=Number.isFinite(data.yaw)?data.yaw:.48;pitch=Number.isFinite(data.pitch)?data.pitch:-.15;set({...data,enabled:data.enabled??true});recording=false;
  }
  canvas.addEventListener('pointerdown',event=>{if(!enabled||mode!=='volume')return;dragging=[event.clientX,event.clientY];canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!dragging)return;yaw+=(event.clientX-dragging[0])*.007;pitch=Math.max(-.8,Math.min(.8,pitch+(event.clientY-dragging[1])*.005));dragging=[event.clientX,event.clientY];onChange();});
  for(const name of ['pointerup','pointercancel'])canvas.addEventListener(name,event=>{dragging=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);});
  return {capture,clear,set,sweep,freeze,render,metrics,pack,restore};
}
