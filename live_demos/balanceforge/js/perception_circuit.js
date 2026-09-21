// Read-only view of the last real policy decision. Never evaluates a network
// or queries/rebuilds a world to manufacture a more interesting display.
(function(BF){
  'use strict';
  function supports(trainer,policy,observation){
    if(!trainer||!policy||!observation)return false;
    const p=trainer.params||{},t=trainer.setupId;
    if(t!=='terrain-run'&&t!=='dodge')return false;
    return !!((p.policyType==='cnn-grid'&&policy.lastImage)||
      (t==='dodge'&&(p.policyType==='cnn-multiscale'||p.useHybridCnn)&&policy.lastLocalImage)||
      (policy.lastTrace&&observation.length>=(t==='dodge'?516:198)));
  }
  function snapshot(trainer,policy,observation,state){
    if(!trainer||!policy||!observation)return null;
    const p=trainer.params||{},type=p.policyType,terrain=trainer.setupId==='terrain-run',dodge=trainer.setupId==='dodge';
    if(!terrain&&!dodge)return null;
    const stages=[];let invalidCount=0;
    const finite=v=>{if(Number.isFinite(v))return v;invalidCount++;return 0;};
    const copy=v=>Array.from(v||[],finite);
    const maps=(title,values,w,h,count,interleaved,names)=>{
      if(!values)return;
      const planes=[];
      for(let f=0;f<count;f++){
        const data=Array.from({length:w*h},(_,i)=>finite(values[interleaved?i*count+f:f*w*h+i]));
        planes.push({name:names?.[f]||`Filter ${f+1}`,w,h,data});
      }
      stages.push({title,planes});
    };
    const vector=(title,values,names,instantIndices)=>{if(values?.length)stages.push({title,values:copy(values),names,instantIndices});};
    let title,description;
    if(type==='cnn-grid'&&policy.lastImage){
      const c=BF.cnnGrid.resolveConfig(trainer.cnnGridConfig||policy.config);
      title=terrain?'Terrain · convolution + body state':'Dodge · convolution + body state';
      description='Supplied sensor raster → learned convolution → max-pool → body state + dense → commands.'+(terrain?' The plant holds commands at 30 Hz; a positive jump request needs ground contact and a clear cooldown.':'');
      maps('01 · Sensor planes',policy.lastImage,c.gridW,c.gridH,c.channels,false,terrain?['Solid tiles','Hazard tiles']:['Danger raster']);
      maps('02 · Learned filters · ReLU',policy.lastConv,c.gridW,c.gridH,c.numFilters,true);
      maps('03 · Max-pool',policy.lastPool,c.pooledW,c.pooledH,c.numFilters,true);
      vector('04 · Body state bypass',observation.slice(0,c.agentStateSize),terrain?['vx','vy','grounded','sub-tile x','sub-tile y','goal dist']:['x','y','vx','vy'],terrain?[2]:undefined);
      vector('05 · Dense activations',policy.lastHidden);
      vector('06 · Neural commands',policy.lastOutput,terrain?['drive','jump']:['x','y']);
    }else if(dodge&&(type==='cnn-multiscale'||p.useHybridCnn)&&policy.lastLocalImage){
      const c=trainer.hybridCnnConfig||trainer.cnnMultiscaleConfig;
      if(!c)return null;
      const frozen=!!p.useHybridCnn,F=c.numFilters;
      title=frozen?'Frozen convolution → evolved wiring':'Two-scale convolution → dense';
      description=frozen?'Random convolution is frozen. The downstream NEAT graph learns over its pooled features.':'Both sensor scales pass through learned filters, pooling and the dense controller.';
      maps('01 · Near sensor',policy.lastLocalImage,c.localGridSize,c.localGridSize,1,false,['Near danger']);
      maps('02 · Far sensor',policy.lastGlobalImage,c.globalGridSize,c.globalGridSize,1,false,['Far danger']);
      maps(`03 · Near ${frozen?'frozen':'learned'} filters`,policy.lastLocalConv,c.localGridSize,c.localGridSize,F,true);
      maps(`04 · Far ${frozen?'frozen':'learned'} filters`,policy.lastGlobalConv,c.globalGridSize,c.globalGridSize,F,true);
      const pw=Math.max(1,Math.floor(c.localGridSize/c.poolSize)),gw=Math.max(1,Math.floor(c.globalGridSize/c.poolSize));
      maps('05 · Near max-pool',policy.lastLocalPool,pw,pw,F,true);
      maps('06 · Far max-pool',policy.lastGlobalPool,gw,gw,F,true);
      vector('07 · Body state bypass',observation.slice(0,c.agentStateSize),['x','y','vx','vy']);
      vector(frozen?'08 · Projected NEAT inputs':'08 · Dense activations',frozen?policy.lastProjected:policy.lastHidden);
      vector('09 · Neural commands',frozen?policy.lastTrace?.outputs:policy.lastOutput,['x','y']);
    }else if(dodge&&policy.lastTrace&&observation.length>=516){
      title='Spatial grids → evolved wiring';
      description='Engineered near/far danger grids are flattened into neural inputs. No convolution or pooling runs here.';
      maps('01 · Near / far danger',observation.slice(4,516),16,16,2,false,['Near · ±80 px','Far · whole field']);
      vector('02 · Agent state',observation.slice(0,4),['x','y','vx','vy']);
      vector('03 · Nearest-bullet channels',observation.slice(516),Array.from({length:observation.length-516},(_,i)=>`${1+Math.floor(i/4)} ${['dx','dy','vx','vy'][i%4]}`));
      const hidden=policy.genome.nodes.filter(n=>n.kind==='hidden');
      vector('04 · Hidden activations',hidden.map(n=>policy.lastTrace.activations.get(n.id)),hidden.map(n=>`n${n.id}`));
      vector('05 · Neural commands',policy.lastTrace.outputs,['x','y']);
    }else if(terrain&&policy.lastTrace&&observation.length>=198){
      title='Terrain · spatial inputs + dense feedback';
      description='Local solid/hazard tiles and six body scalars feed learned dense wiring. This controller has no convolution.';
      // Patch-only is six scalars then two 8×12 planes; patch+summary keeps
      // its patch at the tail and prepends the full summary instead.
      maps('01 · Local tile patch',observation.slice(-192),12,8,2,false,['Solid tiles','Hazard tiles']);
      vector('02 · Body / supplied summary',observation.slice(0,-192),undefined,[2]);
      const hidden=policy.genome.nodes.filter(n=>n.kind==='hidden');
      vector('03 · Hidden activations',hidden.map(n=>policy.lastTrace.activations.get(n.id)));
      vector('04 · Neural commands',policy.lastTrace.outputs,['drive','jump']);
    }else return null;
    if(terrain && state?.terrainRun){
      const tr=state.terrainRun;
      vector('Plant · held commands / jump gate',[tr.cmd?.[0]||0,tr.cmd?.[1]||0,tr.agent?.grounded?1:0,(tr.agent?.jumpTimer||0)<=0?1:0],['drive','jump req','grounded','gate clear'],[2,3]);
      stages[stages.length-1].note=`${tr.jumps||0} executed jump impulses · 30 Hz command hold`;
    }
    return{title,description,stages,invalidCount};
  }

  // The frame, grain and labels do not change at the policy update rate.
  // Keep them in one bitmap per live canvas, and allocate map work buffers
  // only when its responsive layout / architecture changes.
  const renderers=new WeakMap();
  const warm=Array.from({length:256},(_,i)=>{const a=i/255;return `rgba(255,${Math.round(96+133*a)},${Math.round(45+129*a)},${.03+.97*a})`;});
  const cool=Array.from({length:256},(_,i)=>`rgba(126,152,245,${.06+.94*i/255})`);
  function peak(values,floor=0){let max=floor;for(let i=0;i<values.length;i++)max=Math.max(max,Math.abs(values[i]));return max;}
  function label(ctx,s,x,y,color,size,max){ctx.font=`${size}px system-ui`;ctx.fillStyle=color;ctx.fillText(s,x,y,max);}
  function layoutSignature(view,width,dpr){
    let key=width+'|'+dpr+'|'+view.title;
    for(const s of view.stages){
      key+='|'+s.title+':'+(s.note?1:0);
      if(s.planes)for(const p of s.planes)key+=':'+p.name+','+p.w+','+p.h;
      else key+=':'+s.values.length+':'+(s.names||[]).join(',');
    }
    return key;
  }
  function makeLayout(view,width,dpr){
    const cols=width>=650?2:1,gap=12,pad=12,cw=(width-pad*2-gap*(cols-1))/cols;
    const heights=view.stages.map(s=>(s.planes?48+Math.ceil(s.planes.length/2)*(Math.min(120,(cw-34)/2)*s.planes[0].h/s.planes[0].w+25):54+Math.ceil(Math.min(64,s.values.length)/4)*23)+(s.note?18:0));
    const rows=[];for(let i=0;i<heights.length;i+=cols)rows.push(Math.max(...heights.slice(i,i+cols)));
    const height=pad*2+rows.reduce((a,b)=>a+b+gap,0)+20,stages=[];let y=pad;
    for(let i=0;i<view.stages.length;i++){
      const s=view.stages[i],col=i%cols,row=Math.floor(i/cols),x=pad+col*(cw+gap),h=rows[row];
      if(col===0&&i>0)y+=rows[row-1]+gap;
      const g={x,y,h,cw,title:s.title};
      if(s.planes){
        const mw=Math.min(120,(cw-34)/2);
        g.planes=s.planes.map((p,j)=>{const mh=mw*p.h/p.w;
          return{px:x+12+(j%2)*(mw+10),py:y+40+Math.floor(j/2)*(mh+25),mw,mh,
            dx:mw/p.w,dy:mh/p.h,w:p.w,h:p.h,name:p.name,normalized:new Float64Array(p.data.length)};});
      }else{
        g.bw=(cw-30)/4;g.bars=[];
        for(let k=0;k<Math.min(64,s.values.length);k++)g.bars.push({x:x+12+(k%4)*g.bw,y:y+40+Math.floor(k/4)*23,name:s.names?.[k]||String(k+1)});
      }
      stages.push(g);
    }
    return{width,height,dpr,pad,cw,stages};
  }
  function paintStatic(ctx,layout){
    const {width,height,dpr}=layout;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    for(const g of layout.stages){
      const {x,y,h,cw}=g;
      const frame=ctx.createLinearGradient(x,y,x+cw,y+h);frame.addColorStop(0,'#263445');frame.addColorStop(.4,'#14202c');frame.addColorStop(1,'#0c111a');
      ctx.fillStyle=frame;ctx.beginPath();ctx.roundRect(x,y,cw,h,14);ctx.fill();
      ctx.strokeStyle='#a4c4e64a';ctx.lineWidth=1;ctx.stroke();
      ctx.strokeStyle='#e8f7ff85';ctx.beginPath();ctx.moveTo(x+16,y+.5);ctx.lineTo(x+cw-16,y+.5);ctx.stroke();
      ctx.fillStyle='#c2dfff0a';for(let k=0;k<55;k++){const gx=(k*67%251)/251,gy=(k*113%239)/239;ctx.fillRect(x+4+gx*(cw-8),y+4+gy*(h-8),1,1);}
      label(ctx,g.title,x+12,y+22,'#f2d399',11,cw-24);
      if(g.planes)for(const p of g.planes){
        ctx.fillStyle='#071119';ctx.fillRect(p.px,p.py,p.mw,p.mh);
        ctx.strokeStyle='#efd7ad55';ctx.strokeRect(p.px-.5,p.py-.5,p.mw+1,p.mh+1);
        label(ctx,`${p.name} · ${p.w}×${p.h}`,p.px,p.py+p.mh+14,'#bacadb',9,p.mw);
        const sheen=ctx.createLinearGradient(p.px,p.py,p.px+p.mw,p.py+p.mh);
        sheen.addColorStop(0,'#ffffff12');sheen.addColorStop(.45,'#ffffff00');sheen.addColorStop(.5,'#ffffff0a');sheen.addColorStop(1,'#ffffff00');p.sheen=sheen;
      }else for(const b of g.bars){
        label(ctx,b.name,b.x,b.y,'#aebbd1',8,g.bw-5);ctx.fillStyle='#060c16';ctx.fillRect(b.x,b.y+4,g.bw-6,4);
      }
    }
  }
  function buildBackground(layout){
    if(typeof document==='undefined'||!document.createElement)return null;
    const bitmap=document.createElement('canvas');bitmap.width=Math.round(layout.width*layout.dpr);bitmap.height=Math.round(layout.height*layout.dpr);
    const ctx=bitmap.getContext('2d');if(!ctx)return null;paintStatic(ctx,layout);return bitmap;
  }
  function draw(canvas,view,options={}){
    if(!canvas||!view)return;
    const width=canvas.getBoundingClientRect().width;if(width<=0)return;
    const dpr=Math.min(2,window.devicePixelRatio||1),signature=layoutSignature(view,width,dpr);
    let renderer=renderers.get(canvas);
    if(!renderer){renderer={motion:null,layout:null,signature:'',background:null,aria:'',smoothing:null};renderers.set(canvas,renderer);}
    if(!renderer.motion&&BF.visualMotion)renderer.motion=BF.visualMotion.make();
    if(renderer.signature!==signature){
      renderer.signature=signature;renderer.layout=makeLayout(view,width,dpr);renderer.background=buildBackground(renderer.layout);
      // A different architecture cannot inherit another input's visual history.
      if(renderer.motion)renderer.motion.reset();
    }
    const layout=renderer.layout,{height,pad,cw}=layout;
    const cssHeight=Math.ceil(height)+'px';if(canvas.style.height!==cssHeight)canvas.style.height=cssHeight;
    const pixelWidth=Math.round(width*dpr),pixelHeight=Math.round(height*dpr);
    if(canvas.width!==pixelWidth)canvas.width=pixelWidth;if(canvas.height!==pixelHeight)canvas.height=pixelHeight;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const smoothing=!!(options.smoothing&&renderer.motion);
    if(renderer.motion)renderer.motion.begin(options.now||0,{enabled:smoothing,identity:options.identity??view.title});
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    if(renderer.background)ctx.drawImage(renderer.background,0,0,pixelWidth,pixelHeight,0,0,width,height);else paintStatic(ctx,layout);
    for(let i=0;i<view.stages.length;i++){
      const stage=view.stages[i],g=layout.stages[i],{x,y,h}=g;
      if(stage.planes){
        for(let j=0;j<stage.planes.length;j++){
          const p=stage.planes[j],pg=g.planes[j],max=peak(p.data,1),target=pg.normalized;
          for(let k=0;k<p.data.length;k++)target[k]=p.data[k]/max;
          const displayed=smoothing?renderer.motion.vector(`map:${i}:${j}`,target):target;
          for(let k=0;k<displayed.length;k++){
            const v=displayed[k],a=Math.min(255,Math.round(Math.abs(v)*255));ctx.fillStyle=(v<0?cool:warm)[a];
            ctx.fillRect(pg.px+(k%p.w)*pg.dx,pg.py+Math.floor(k/p.w)*pg.dy,Math.max(.4,pg.dx-.45),Math.max(.4,pg.dy-.45));
          }
          ctx.fillStyle=pg.sheen;ctx.fillRect(pg.px,pg.py,pg.mw,pg.mh);
        }
      }else{
        const displayed=smoothing?renderer.motion.vector(`bars:${i}`,stage.values):stage.values;
        for(let k=0;k<g.bars.length;k++){
          // Discrete facts (grounded / gate clear) are never interpolated.
          const b=g.bars[k],v=stage.instantIndices?.includes(k)?stage.values[k]:displayed[k],strength=Math.min(1,Math.abs(v));
          ctx.fillStyle=v<0?'#8badff':'#ffcf88';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=5*strength;
          ctx.fillRect(b.x,b.y+4,(g.bw-6)*strength,4);ctx.shadowBlur=0;
        }
        // Summaries and counters describe the current actual policy / plant.
        label(ctx,`${stage.values.length>64?'First 64 / ':''}${stage.values.length} values · peak ${peak(stage.values).toFixed(2)}`,x+12,y+h-(stage.note?28:10),'#8da5b8',9,cw-24);
        if(stage.note)label(ctx,stage.note,x+12,y+h-10,'#d8bc88',9,cw-24);
      }
      if(!options.reducedMotion){
        const t=(options.now||0)*.00015+i*.19;ctx.fillStyle='#ffe5b4';ctx.shadowColor='#ff9b35';ctx.shadowBlur=7;
        for(let k=0;k<3;k++){const u=(t+k*.29)%1;ctx.beginPath();ctx.arc(x+14+u*(cw-28),y+h-2-2*Math.sin(u*8),.7,0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;
      }
    }
    const footer=view.invalidCount?`${view.invalidCount} non-finite values · displayed as zero; inspect this policy`
      :(smoothing?'Display smoothing · current peaks / gates · warm + / blue −':'Live magnitudes · warm + / blue − · maps scale per plane; bars clip at 1');
    label(ctx,footer,pad,height-7,view.invalidCount?'#ff9a9a':'#93a9bc',9,width-pad*2);
    const aria=view.title+'. '+view.stages.map(s=>s.title).join('; ')+
      (smoothing?'. Display smoothing on for map intensities and continuous bars; peaks, counters and discrete gates are current actual values.':'. Current policy values; display smoothing off.')+
      ` Decorative sparks. ${view.invalidCount||0} non-finite values.`;
    if(renderer.aria!==aria){canvas.setAttribute('aria-label',aria);renderer.aria=aria;}
    if(renderer.smoothing!==smoothing){canvas.setAttribute('data-display-smoothing',smoothing?'on':'off');renderer.smoothing=smoothing;}
  }
  BF.perceptionCircuit={supports,snapshot,draw};
})(window.BF=window.BF||{});
