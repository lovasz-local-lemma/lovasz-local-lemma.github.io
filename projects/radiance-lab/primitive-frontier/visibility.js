// A visibility/topology schematic, not an image estimator or cost benchmark.
export const baseline = [[55,280],[190,100],[340,205],[515,135],[675,245],[815,245]];
export const modes = {
  connection: {title:'One new connection', note:'The traced light prefix stays valid. Only the new camera connection needs a fresh opaque-visibility test.', labels:['L','p₁','p₂','p₃','p₄','C']},
  local: {title:'A local sweep', note:'Moving one terminal vertex changes its incoming leg and the camera connection. A cone or other local family can have this pattern; the dependency matters more than its name.', labels:['L','p₁','p₂','p₃','x','C']},
  distant: {title:'Separated coordinates', note:'A released coordinate earlier in the path can move several later vertices. Each changed leg can cross a different silhouette, even when the final algebraic connection succeeds.', labels:['L','p₁','x₂','x₃','x₄','C']},
  bridge: {title:'An independent medium bridge', note:'Here a new medium segment and its two joins need validation. If that medium subpath was already traced and remains unchanged, only the two new joins need checking.', labels:['L','p₁','M₀','M₁','p₄','C']}
};
export function pathFor(mode, value) {
  if (!modes[mode]) throw Error('Unknown visibility construction');
  const p=baseline.map(v=>[...v]),t=Math.max(-1,Math.min(1,value));
  if(mode==='connection')p[5][1]+=t*120;
  if(mode==='local')p[4][1]+=t*125;
  if(mode==='distant'){p[2][1]+=t*120;p[3][1]+=t*75;p[4][1]+=t*90;}
  if(mode==='bridge'){p[2][1]+=t*90;p[3][1]+=t*90;}
  return p;
}
export function blockersFor(fine=false) {
  const walls=[];
  for(const [x,center] of [[425,171],[737,245]]){
    walls.push([x-6,45,x+6,center-48],[x-6,center+48,x+6,355]);
    if(fine)for(const dy of [-26,0,26])walls.push([x-6,center+dy-3,x+6,center+dy+3]);
  }
  return walls;
}
export function segmentBoxEntry(a,b,box) {
  let lo=0,hi=1;
  for(let k=0;k<2;k++){
    const d=b[k]-a[k];
    if(Math.abs(d)<1e-12){if(a[k]<box[k]||a[k]>box[k+2])return null;}
    else {const u=(box[k]-a[k])/d,v=(box[k+2]-a[k])/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>hi)return null;}
  }
  return hi>=0&&lo<=1?lo:null;
}
export const segmentHitsBox=(a,b,box)=>segmentBoxEntry(a,b,box)!==null;
export function inspectPath(mode,value,fine=false) {
  const path=pathFor(mode,value),walls=blockersFor(fine),same=(a,b)=>a.every((v,k)=>Math.abs(v-b[k])<1e-9);
  const edges=path.slice(1).map((b,i)=>{
    const a=path[i],hits=walls.map(w=>segmentBoxEntry(a,b,w)).filter(t=>t!==null),t=hits.length?Math.min(...hits):null;
    return {a,b,changed:!same(a,baseline[i])||!same(b,baseline[i+1]),blocked:t!==null,hit:t===null?null:a.map((v,k)=>v+t*(b[k]-v))};
  });
  return {path,walls,edges,changed:edges.filter(e=>e.changed).length,blocked:edges.filter(e=>e.blocked).length,visible:!edges.some(e=>e.blocked)};
}

if(typeof document!=='undefined'){
  const root=document.getElementById('visibility-instrument');
  if(root){
    const svg=root.querySelector('svg'),controls=root.querySelectorAll('[data-visibility-mode]'),slider=root.querySelector('input[type=range]'),fine=root.querySelector('select'),ghost=root.querySelector('input[type=checkbox]');
    let mode='distant';
    const make=(tag,attrs,text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text)n.textContent=text;return n;};
    function draw(){
      const value=Number(slider.value)/100,state=inspectPath(mode,value,fine.value==='fine'),g=make('g',{});
      svg.setAttribute('aria-label',`${modes[mode].title}: ${state.changed} changed segments, ${state.blocked} blocked segments. ${state.visible?'Visible path':'Connection rejected by occlusion'}.`);
      g.append(make('text',{x:22,y:26,class:'vis-diagram-note'},'CONNECTION FOUND · VISIBILITY STILL TO CHECK'));
      for(const w of state.walls)g.append(make('rect',{x:w[0],y:w[1],width:w[2]-w[0],height:w[3]-w[1],rx:2,class:'vis-blocker'}));
      if(ghost.checked)g.append(make('polyline',{points:baseline.map(p=>p.join(',')).join(' '),class:'vis-ghost'}));
      for(const [i,e] of state.edges.entries()){
        const color=e.blocked?'#f09a86':e.changed?(mode==='bridge'&&i===2?'#bd9cf0':'#efc67f'):'#75cfc6';
        g.append(make('line',{x1:e.a[0],y1:e.a[1],x2:e.b[0],y2:e.b[1],stroke:color,class:e.changed?'vis-edge changed':'vis-edge retained'}));
        if(e.blocked){const [x,y]=e.hit;g.append(make('circle',{cx:x,cy:y,r:11,class:'vis-rejected'}),make('text',{x,y:y+5,'text-anchor':'middle',class:'vis-cross'},'×'));}
      }
      for(const [i,p] of state.path.entries()){
        const medium=mode==='bridge'&&(i===2||i===3);
        g.append(make('circle',{cx:p[0],cy:p[1],r:i===0||i===5?7:5,fill:medium?'#bd9cf0':i===5?'#75cfc6':'#efc67f'}),make('text',{x:p[0],y:p[1]-15,'text-anchor':'middle',class:'vis-node-label'},modes[mode].labels[i]));
      }
      g.append(make('text',{x:22,y:385,class:'vis-diagram-note'},'L LIGHT · C CAMERA · M MEDIUM'),make('text',{x:425,y:385,'text-anchor':'middle',class:'vis-diagram-note'},'OCCLUDER A'),make('text',{x:737,y:385,'text-anchor':'middle',class:'vis-diagram-note'},'OCCLUDER B'));
      svg.replaceChildren(g);
      root.querySelector('[data-vis-count]').textContent=String(state.changed);
      root.querySelector('[data-vis-result]').textContent=state.visible?'Clear connection':'Blocked connection';
      root.querySelector('[data-vis-result]').classList.toggle('is-blocked',!state.visible);
      root.querySelector('[data-vis-product]').textContent=`V₀ V₁ V₂ V₃ V₄ = ${state.visible?1:0}`;
      root.querySelector('[data-vis-note]').textContent=fine.value==='fine'&&state.edges.some(e=>!e.changed&&e.blocked)?'The new slats invalidate an unchanged prefix here. Its geometry is retained, but its old visibility is not: a blocked leg rejects the entire path.':modes[mode].note;
      root.querySelector('output').textContent=`${Math.round(value*100)}%`;
      controls.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.visibilityMode===mode)));
    }
    controls.forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.visibilityMode;draw();}));
    slider.addEventListener('input',draw);fine.addEventListener('change',draw);ghost.addEventListener('change',draw);draw();
  }
}
