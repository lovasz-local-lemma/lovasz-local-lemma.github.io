/* Finite HDR jobs only: no timer, render loop or network request in this worker. */
importScripts('./photo-models.js');
let scene=null;
self.onmessage=({data})=>{
 if(data.type==='source'){scene=data.scene;return;}
 if(data.type!=='hdr'||!scene)return;
 const M=PhotoModels,frames=M.exposures(scene,data.spacing,data.noise),merged=M.merge(frames),colors=[[.25,.88,.81],[.98,.72,.28],[.68,.5,.95],[.95,.28,.6]],map=new Float32Array(scene.data.length);
 for(let i=0;i<map.length;i+=3){const j=!merged.valid[i]||!merged.valid[i+1]||!merged.valid[i+2]?3:merged.dominant[i];map.set(colors[j],i);}
 const result={frames,merged,weights:{w:scene.w,h:scene.h,data:map},stats:M.hdrStats(scene,merged)},buffers=[...frames.map(f=>f.data.buffer),merged.data.buffer,merged.fusion.buffer,merged.valid.buffer,merged.dominant.buffer,map.buffer];
 self.postMessage({key:data.key,result},buffers);
};
