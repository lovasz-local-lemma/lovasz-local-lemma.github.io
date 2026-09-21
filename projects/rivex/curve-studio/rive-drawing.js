const palette=[0xffeac97e,0xff82d7c2,0xffdf917b,0xff4b6b6a];
export function writeRive(segments,pool=false){
 const types={4:1,5:0,7:2,8:2,24:2,25:2,32:0,37:3,40:0},out=[82,73,86,69],scratch=new DataView(new ArrayBuffer(4));
 const uint=n=>{while(n>=128){out.push((n&127)|128);n>>>=7;}out.push(n);};
 const word=(v,float=false)=>{float?scratch.setFloat32(0,v,true):scratch.setUint32(0,v,true);out.push(...new Uint8Array(scratch.buffer));};
 [7,0,0,...Object.keys(types).map(Number),0].forEach(uint);const kinds=Object.values(types);for(let i=0;i<kinds.length;i+=4)word(kinds.slice(i,i+4).reduce((v,k,j)=>v|(k<<(j*2)),0));
 let id=0;const obj=(type,props={})=>{const n=id++;uint(type);for(const [key,v]of Object.entries(props)){uint(+key);if(types[key]===0)uint(v);else if(types[key]===1){const b=new TextEncoder().encode(v);uint(b.length);out.push(...b);}else word(v,types[key]===2);}uint(0);return n;};
 obj(23);id=0;obj(1,{4:'Curve atelier — ordinary vector drawing',7:1080,8:640});
 segments.forEach((s,i)=>{let points=[[0,-.5],[1,-.5],[1,.5],[0,.5]];
  if(!pool){const [a,b,width]=s,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,nx=-dy/len*width/2,ny=dx/len*width/2;points=[[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]];}
  const shape=obj(3,{4:'line'+i,5:0}),path=obj(16,{5:shape,32:1});for(const [x,y]of points)obj(5,{5:path,24:x,25:y});const fill=obj(20,{5:shape,40:2});obj(18,{5:fill,37:palette[s[3]??i%4]});
 });return new Uint8Array(out);
}
export {palette};
