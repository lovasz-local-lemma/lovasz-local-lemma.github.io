// Ordinary Rive 7 shapes, matching make-photon-ink-pool.py. No custom types,
// images, retained 3D or shaders: each projected mark is a transformed rectangle.
export function encodeRiveInk(strokes) {
  const types={4:1,5:0,7:2,8:2,13:2,14:2,15:2,16:2,17:2,20:2,21:2,37:3,40:0};
  const bytes=[82,73,86,69],scratch=new ArrayBuffer(4),view=new DataView(scratch);
  const uint=n=>{while(n>=128){bytes.push((n&127)|128);n>>>=7;}bytes.push(n);};
  const four=(value,float=false)=>{float?view.setFloat32(0,value,true):view.setUint32(0,value,true);bytes.push(...new Uint8Array(scratch));};
  [7,0,0,...Object.keys(types).map(Number),0].forEach(uint);
  const kinds=Object.values(types);
  for(let i=0;i<kinds.length;i+=4)four(kinds.slice(i,i+4).reduce((v,k,j)=>v|(k<<(2*j)),0));
  const object=(type,properties={})=>{uint(type);for(const [key,value]of Object.entries(properties)){uint(+key);const kind=types[key];if(kind===0)uint(value);else if(kind===1){const text=new TextEncoder().encode(value);uint(text.length);bytes.push(...text);}else four(value,kind===2);}uint(0);};
  object(23);object(1,{4:'Scene-derived ink — fixed projection, vector layer only',7:1000,8:700});
  const colors=[0xffd9ca91,0xff77b8b3,0xffc7e4db,0xff83a5df];
  let id=1;
  // Preserve the live pool's drawable order where different colors cross.
  for(const [index,s]of strokes.slice().sort((a,b)=>(a.pool??0)-(b.pool??0)).entries()){
    const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],length=Math.hypot(dx,dy);
    if(![...s.a,...s.b,s.w].every(Number.isFinite)||length<=0||s.w<=0)continue;
    object(3,{4:'ink'+(s.pool??index),5:0,13:s.a[0],14:s.a[1],15:Math.atan2(dy,dx),16:length,17:s.w});
    object(7,{5:id,13:.5,20:1,21:1});object(20,{5:id,40:2});object(18,{5:id+2,37:colors[s.color]??colors[1]});id+=4;
  }
  return new Uint8Array(bytes);
}
