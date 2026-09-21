export function encodeBands(shapes,contours=false){
  const types={4:1,5:0,7:2,8:2,24:2,25:2,32:0,37:3,40:0},bytes=[82,73,86,69],scratch=new DataView(new ArrayBuffer(4));
  const uint=n=>{while(n>=128){bytes.push((n&127)|128);n>>>=7;}bytes.push(n);};
  const word=(n,float=false)=>{float?scratch.setFloat32(0,n,true):scratch.setUint32(0,n,true);bytes.push(...new Uint8Array(scratch.buffer));};
  [7,0,0,...Object.keys(types).map(Number),0].forEach(uint);const kinds=Object.values(types);for(let i=0;i<kinds.length;i+=4)word(kinds.slice(i,i+4).reduce((n,k,j)=>n|(k<<(2*j)),0));
  let id=0;function obj(type,props={}){const result=id++;uint(type);for(const [key,v]of Object.entries(props)){uint(+key);if(types[key]===0)uint(v);else if(types[key]===1){const text=new TextEncoder().encode(v);uint(text.length);bytes.push(...text);}else word(v,types[key]===2);}uint(0);return result;}
  obj(23);id=0;obj(1,{4:'Iso atelier — ordinary Rive contour bands',7:960,8:768});
  const path=(shape,loop)=>{const p=obj(16,{5:shape,32:1});for(const [x,y]of loop)obj(5,{5:p,24:x,25:y});};
  // Ordinary Rive paints earlier sibling shapes on top: reverse ascending bands.
  for(const s of [...shapes].reverse()){
    const shape=obj(3,{4:`object-${s.id}-tone-${s.band}`,5:0});
    for(const loop of s.loops){if(!contours)path(shape,loop);else loop.forEach((a,i)=>{const b=loop[(i+1)%loop.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,nx=-dy/len*.65,ny=dx/len*.65;path(shape,[[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]]);});}
    const fill=obj(20,{5:shape,40:1}),rgb=contours?s.color.map(v=>Math.min(1,.35+v)):s.color;
    obj(18,{5:fill,37:((255<<24)|(Math.round(rgb[0]*255)<<16)|(Math.round(rgb[1]*255)<<8)|Math.round(rgb[2]*255))>>>0});
  }
  return new Uint8Array(bytes);
}
