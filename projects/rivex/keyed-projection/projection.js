export function world(v,frame,meta){
 const a=frame/meta.durationFrames*Math.PI*2,c=Math.cos(a),s=Math.sin(a),p=meta.pitch;
 const x=v[0]*c+v[2]*s,z=-v[0]*s+v[2]*c;
 return [x,v[1]*Math.cos(p)-z*Math.sin(p),v[1]*Math.sin(p)+z*Math.cos(p)];
}
export function project(v,frame,meta){const p=world(v,frame,meta),scale=meta.focal/(meta.cameraDistance-p[2]);return [meta.width*.5+p[0]*scale,meta.height*.5-p[1]*scale];}
export function selectedKey(frame,meta){const a=Math.min(meta.durationFrames,Math.floor(frame)),b=Math.min(meta.durationFrames,a+1),t=frame-a;return meta.selectedKeys[a].map((v,i)=>v*(1-t)+meta.selectedKeys[b][i]*t);}
