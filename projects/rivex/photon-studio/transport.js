// Decode the actual native RIVXP1 container. No invented path geometry.
export function decode(buffer) {
  const d=new DataView(buffer),text=new TextDecoder().decode(new Uint8Array(buffer,0,6));
  if(text!=='RIVXP1'||d.getUint32(6,true)!==1)throw Error('Expected RIVXP1 v1');
  const count=d.getUint32(10,true),pts=d.getUint32(14,true),size=count*pts*4;
  if(count>200000||pts>64||pts<2)throw Error('Unsupported path dimensions');
  let positions,colors,normals,scene,lights;let p=22;
  while(p+8<=d.byteLength){const tag=d.getUint32(p,true),n=d.getUint32(p+4,true);p+=8;if(p+n>d.byteLength)throw Error('Truncated section');
    if(tag===4){if(n!==size*12)throw Error('Incorrect path section');positions=new Float32Array(buffer.slice(p,p+size*4));colors=new Float32Array(buffer.slice(p+size*4,p+size*8));normals=new Float32Array(buffer.slice(p+size*8,p+n));}
    if(tag===2)scene={kind:d.getInt32(p,true),ior:d.getFloat32(p+29,true),optical:!!d.getUint8(p+72)};
    if(tag===1)lights=d.getUint32(p,true);p+=n;
  }
  if(!positions||!scene)throw Error('Missing native sections');
  const legs=[],deposits=[];let maxTime=0,glassPaths=0;
  for(let i=0;i<count;i++){let glass=false;for(let j=0;j<pts;j++){const k=(i*pts+j)*4,kind=positions[k+3];if(kind<=0)break;const pos=Array.from(positions.subarray(k,k+3)),time=colors[k+3];if(![...pos,time].every(Number.isFinite))throw Error('Nonfinite path');maxTime=Math.max(maxTime,time);
      if(j){const prev=k-4,t0=colors[prev+3];if(time>t0)legs.push({a:Array.from(positions.subarray(prev,prev+3)),b:pos,t0,t1:time,color:Array.from(colors.subarray(k,k+3)),glass,inside:kind===112,path:i});}
      if(kind===112)glass=true; // The incoming internal leg is excluded; subsequent legs have transmitted through glass.
      if(j&&kind<100){const normal=Array.from(normals.subarray(k+1,k+4));if(Math.hypot(...normal)>.5)deposits.push({p:pos,t:time,color:Array.from(colors.subarray(k,k+3)),normal,glass});}
    }if(glass)glassPaths++;
  }
  return {count,legs,deposits,maxTime,glassPaths,scene,lights};
}
export function clip(leg,lo,hi){const den=leg.t1-leg.t0,u=Math.max(0,(lo-leg.t0)/den),v=Math.min(1,(hi-leg.t0)/den);return v>u?{...leg,a:leg.a.map((x,i)=>x+(leg.b[i]-x)*u),b:leg.a.map((x,i)=>x+(leg.b[i]-x)*v)}:null;}
export function camera(yaw,pitch,dist,aspect){const eye=[Math.sin(yaw)*Math.cos(pitch)*dist,Math.sin(pitch)*dist,Math.cos(yaw)*Math.cos(pitch)*dist],f=eye.map(x=>-x/dist),r=[Math.cos(yaw),0,-Math.sin(yaw)],u=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch)];return {eye,f,r,u,aspect};}
export function project(p,c){const v=p.map((x,i)=>x-c.eye[i]),dot=a=>a.reduce((s,x,i)=>s+x*v[i],0),z=dot(c.f);if(z<.08)return null;return [dot(c.r)/z/Math.tan(.5)/c.aspect,dot(c.u)/z/Math.tan(.5),z];}
export function guides(){const lines=[],r=.45;for(let axis=0;axis<3;axis++)for(let k=0;k<48;k++){const point=t=>{const p=[0,0,0];p[(axis+1)%3]=r*Math.cos(t);p[(axis+2)%3]=r*Math.sin(t);return p;};lines.push({a:point(k*Math.PI/24),b:point((k+1)*Math.PI/24),color:[.38,.6,.62]});}for(let i=0;i<8;i++)for(let a=0;a<3;a++)if(!(i&(1<<a)))lines.push({a:[0,1,2].map(j=>(i&(1<<j))?1.2:-1.2),b:[0,1,2].map(j=>((i|(1<<a))&(1<<j))?1.2:-1.2),color:[.25,.31,.34]});return lines;}
