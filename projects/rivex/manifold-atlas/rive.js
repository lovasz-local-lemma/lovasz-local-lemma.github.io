// Fixed projection writer: ordinary Rive 7 paths, flat RGBA fills, no extensions.
export function encodeDrawing(polygons){
 const types={4:1,5:0,7:2,8:2,24:2,25:2,32:0,37:3,40:0},bytes=[82,73,86,69],scratch=new DataView(new ArrayBuffer(4));
 const uint=n=>{while(n>=128){bytes.push((n&127)|128);n>>>=7;}bytes.push(n);};
 const word=(n,float=false)=>{float?scratch.setFloat32(0,n,true):scratch.setUint32(0,n,true);bytes.push(...new Uint8Array(scratch.buffer));};
 [7,0,0,...Object.keys(types).map(Number),0].forEach(uint);const kinds=Object.values(types);for(let i=0;i<kinds.length;i+=4)word(kinds.slice(i,i+4).reduce((n,k,j)=>n|(k<<(2*j)),0));
 let id=0;function obj(type,props={}){const result=id++;uint(type);for(const[key,v]of Object.entries(props)){uint(+key);if(types[key]===0)uint(v);else if(types[key]===1){const text=new TextEncoder().encode(v);uint(text.length);bytes.push(...text);}else word(v,types[key]===2);}uint(0);return result;}
 obj(23);id=0;obj(1,{4:'Photon manifold atlas — ordinary vector snapshot',7:960,8:700});
 for(const p of [...polygons].reverse()){
  const shape=obj(3,{5:0}),path=obj(16,{5:shape,32:1});for(const[x,y]of p.points)obj(5,{5:path,24:x,25:y});
  const fill=obj(20,{5:shape,40:1}),rgba=[...p.color,p.alpha].map(v=>Math.round(Math.max(0,Math.min(1,v))*255));obj(18,{5:fill,37:((rgba[3]<<24)|(rgba[0]<<16)|(rgba[1]<<8)|rgba[2])>>>0});
 }
 return new Uint8Array(bytes);
}
