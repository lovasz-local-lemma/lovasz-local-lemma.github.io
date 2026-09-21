import {project,lightPosition} from './renderer.js';
// Semantic marks are derived from scene + light, never from a GPU screenshot.
export function marks(scene,degrees,yaw=scene.camera.yaw){
 const result=[],edge=(a,b,color,width)=>result.push({a:project(scene,a,yaw),b:project(scene,b,yaw),color,width});
 const eyeY=scene.camera.pitch;
 // Sphere silhouettes: circle in the plane perpendicular to the center-to-eye vector.
 const eye=[scene.camera.target[0]+Math.sin(yaw)*Math.cos(eyeY)*scene.camera.distance,scene.camera.target[1]+Math.sin(eyeY)*scene.camera.distance,scene.camera.target[2]+Math.cos(yaw)*Math.cos(eyeY)*scene.camera.distance];
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>a.map(v=>v/Math.hypot(...a)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 for(const [sphere,color] of [[scene.glass,0xff8fdcda],[scene.metal,0xffecd096]]){const c=sphere.slice(0,3),q=eye.map((v,i)=>v-c[i]),dist=Math.hypot(...q),n=norm(q),u=norm(cross(n,[0,1,0])),v=cross(n,u),r=sphere[3]*Math.sqrt(1-(sphere[3]/dist)**2),center=c.map((x,i)=>x+n[i]*sphere[3]**2/dist);const at=a=>center.map((x,i)=>x+r*(Math.cos(a)*u[i]+Math.sin(a)*v[i]));for(let j=0;j<64;j++)edge(at(j*Math.PI/32),at((j+1)*Math.PI/32),color,.65);}
 const l=lightPosition(scene,degrees),g=scene.glass,center=[g[0]-(l[0]-g[0])*g[1]/(l[1]-g[1]),.008,g[2]-(l[2]-g[2])*g[1]/(l[1]-g[1])];
 for(let j=0;j<42;j++){const a=j*2*Math.PI/42,b=(j+1)*2*Math.PI/42;edge([center[0]+.46*Math.cos(a),center[1],center[2]+.27*Math.sin(a)],[center[0]+.46*Math.cos(b),center[1],center[2]+.27*Math.sin(b)],0xff85dedb,1.6);}
 // Direction cue and emitter cross remain ordinary Rive vector marks.
 const p=project(scene,[0,2.6,0],yaw),angle=degrees*Math.PI/180;
 result.push({a:p,b:[p[0]+30*Math.sin(angle),p[1]-18*Math.cos(angle)],color:0xffffd992,width:1.4});
 return result;
}
