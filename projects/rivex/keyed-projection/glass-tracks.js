const NS='http://www.w3.org/2000/svg';
const el=(name,attrs={})=>{const node=document.createElementNS(NS,name);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);return node;};
const colors=['#e8bf76','#8bdad8','#e5a2d2'];
const sample=(values,frame,held=false)=>{const a=Math.min(240,Math.floor(frame)),b=Math.min(240,a+1),t=held?0:frame-a;return values[a]*(1-t)+values[b]*t;};

export function makeGlassTracks(meta,extracted,{seek,invalidate}){
 const toggle=document.getElementById('glass-breakdown'),box=document.getElementById('glass-details'),list=document.getElementById('glass-track-list'),overlay=document.getElementById('glass-overlay');
 let style,tracks=[],plots=[],lastMeta;
 toggle.addEventListener('change',()=>{box.hidden=!toggle.checked;overlay.toggleAttribute('hidden',!toggle.checked);invalidate();});
 function rebuild(drawing,active){
  style=drawing;lastMeta=active;list.replaceChildren();plots=[];
  if(drawing==='baked'){
   tracks=[{id:'crop-x',name:'Selected image mesh · center x',values:extracted.quads.map(q=>(q[0]+q[2])/2),unit:' px'}, {id:'crop-y',name:'Selected image mesh · center y',values:extracted.quads.map(q=>(q[1]+q[3])/2),unit:' px'}, {id:'crop-width',name:'Selected image mesh · width',values:extracted.quads.map(q=>q[2]-q[0]),unit:' px'}].map((track,i)=>({...track,color:colors[i],held:true,source:'Derived from the actual image quad selected by authored opacity keys. This is not a morph or a new transform track.'}));
  }else{
   tracks=[{id:'axis-x',name:'Sphere ellipse · horizontal scale',values:active.sphereTransformKeys.map(p=>p[3]),unit:' px',color:'#a0b9c7',source:'Authored Rive scaleX of the projected ellipse group.'},{id:'axis-y',name:'Sphere ellipse · vertical scale',values:active.sphereTransformKeys.map(p=>p[4]),unit:' px',color:'#c3a2de',source:'Authored Rive scaleY of the projected ellipse group.'},...active.detailTracks];
  }
  document.getElementById('glass-detail-note').textContent=drawing==='baked'?'The baked PBR appearance has no hidden refraction or morph controls. Three curves below follow the real cropped image meshes; the frame index selects one of 240 actual opacity schedules. Colored guides locate those measurements in the Rive view.':drawing==='engraving'?'The contour is a keyed ellipse. Inside it, 23 independent ordinary Rive scale tracks breathe the engraved lines; the three colored strokes below are highlighted in the Rive view. These curves are part of the downloaded .riv.':'The contour is a keyed ellipse. Five ordinary filled ellipses have their own x/y keys. Three color-coded tone centers below point to those visible paper regions; the motion is in the downloaded .riv.';
  for(const t of tracks){
   const row=document.createElement('div');row.className='glass-track';row.dataset.track=t.id;row.style.setProperty('--track-color',t.color);
   const label=document.createElement('label');label.textContent=t.name;const output=document.createElement('output');label.append(output);row.append(label);
   const svg=el('svg',{viewBox:'0 0 640 80',role:'img',tabindex:0,'aria-label':t.name+'; click to scrub the actual Rive animation'});
   let lo=Math.min(...t.values),hi=Math.max(...t.values);const pad=Math.max((hi-lo)*.1,.002);lo-=pad;hi+=pad;
   const xy=(f,v)=>[12+f/240*616,64-(v-lo)/(hi-lo)*50];
   [0,60,120,180,240].forEach(f=>svg.append(el('line',{x1:xy(f,0)[0],x2:xy(f,0)[0],y1:7,y2:69,stroke:'#2c424b'})));
   const points=[];t.values.forEach((v,f)=>{if(t.held&&f)points.push(xy(f,t.values[f-1]));points.push(xy(f,v));});
   svg.append(el('polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:t.color,'stroke-width':1.7}));
   const cursor=el('line',{y1:6,y2:69,stroke:'#ffffff66'}),dot=el('circle',{r:3.6,fill:t.color});svg.append(cursor,dot);
   const scrub=e=>{const r=svg.getBoundingClientRect();seek(Math.max(0,Math.min(240,Math.round(((e.clientX-r.left)/r.width*640-12)/616*240))));};
   let dragging=false;svg.onpointerdown=e=>{dragging=true;svg.setPointerCapture(e.pointerId);scrub(e);};svg.onpointermove=e=>{if(dragging)scrub(e);};svg.onpointerup=svg.onpointercancel=()=>dragging=false;
   svg.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();seek(Math.max(0,Math.min(240,Number(row.dataset.frame)+(e.key==='ArrowRight'?1:-1))));}};
   const note=document.createElement('small');note.textContent=t.source;row.append(svg,note);list.append(row);plots.push({t,row,output,xy,cursor,dot});
  }
 }
 function draw(frame,drawing,active,glassVisible,art){
  if(style!==drawing||lastMeta!==active)rebuild(drawing,active);
  box.hidden=!toggle.checked;overlay.toggleAttribute('hidden',!toggle.checked||!glassVisible);box.dataset.style=drawing;box.dataset.pose=Math.min(239,Math.floor(frame)%240);
  if(!toggle.checked)return;
  for(const p of plots){let value=sample(p.t.values,frame,p.t.held);if(p.t.node){const node=art.node(p.t.node);const actual=node&&(p.t.property===16?node.scaleX:node.x);if(Number.isFinite(actual))value=actual;}
   const [x,y]=p.xy(frame,value);p.cursor.setAttribute('x1',x);p.cursor.setAttribute('x2',x);p.dot.setAttribute('cx',x);p.dot.setAttribute('cy',y);p.output.textContent=value.toFixed(3)+p.t.unit;p.row.dataset.value=value;p.row.dataset.frame=frame;
  }
  overlay.replaceChildren();if(!glassVisible)return;
  if(drawing==='baked'){
   const q=extracted.quads[Math.floor(frame)],cx=(q[0]+q[2])/2,cy=(q[1]+q[3])/2;
   overlay.append(el('rect',{x:q[0],y:q[1],width:q[2]-q[0],height:q[3]-q[1],fill:'none',stroke:colors[2],'stroke-width':1,'stroke-dasharray':'4 4'}),el('line',{x1:cx-10,x2:cx+10,y1:cy,y2:cy,stroke:colors[0],'stroke-width':3}),el('line',{x1:cx,x2:cx,y1:cy-10,y2:cy+10,stroke:colors[1],'stroke-width':3}));
   const text=el('text',{x:q[0],y:q[1]-7,fill:colors[2],'font-size':11});text.textContent='Held image '+(Math.floor(frame)%240)+' / 239';overlay.append(text);
  }else{
   const keys=active.sphereTransformKeys,a=Math.floor(frame),b=Math.min(240,a+1),t=frame-a,p=keys[a].map((v,i)=>v*(1-t)+keys[b][i]*t),[x,y,rotation,rx,ry]=p;
   const transform=(u,v)=>[x+Math.cos(rotation)*rx*u-Math.sin(rotation)*ry*v,y+Math.sin(rotation)*rx*u+Math.cos(rotation)*ry*v];
   const axis=(u,v,color)=>{const [x2,y2]=transform(u,v);overlay.append(el('line',{x1:x,y1:y,x2,y2,stroke:color,'stroke-width':1,'stroke-dasharray':'3 4'}));};axis(1,0,'#a0b9c7');axis(0,1,'#c3a2de');
   for(const d of active.detailTracks){
    if(drawing==='engraving'){
     const scale=sample(d.values,frame),yy=d.localPoint[1],points=[];for(let j=0;j<=20;j++){const xx=(-1+j/10)*d.halfWidth;points.push(transform(xx*scale,yy-.14*(xx/d.halfWidth)**2*(1-Math.abs(d.baseY))));}
     overlay.append(el('polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:d.color,'stroke-width':2}));
    }else{const [cx,cy]=transform(sample(d.values,frame),sample(d.yValues,frame));overlay.append(el('circle',{cx,cy,r:4,fill:d.color,stroke:'#10232a','stroke-width':1.5}));}
   }
  }
 }
 return {draw};
}
