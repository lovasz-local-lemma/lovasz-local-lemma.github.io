const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>mul(a,1/Math.hypot(...a)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const defaults={yaw:0,lightX:-.65,lightZ:.3,bands:8,radius:.68,smooth:1,resolution:240,contours:false};
const colors=[[.7,.72,.69],[.62,.07,.045],[.07,.35,.19],[.72,.73,.75]];
export function sampleScene(state,width=150,height=120){
  const rgb=new Float32Array(width*height*3),scalar=new Float32Array(width*height),ids=new Int8Array(width*height).fill(-1);
  const eye=[Math.sin(state.yaw)*3,1.8,Math.cos(state.yaw)*4.9],forward=norm(sub([0,1,-.3],eye)),right=norm(cross(forward,[0,1,0])),up=cross(right,forward),sphere=[0,state.radius+.035,-.15],light=[state.lightX,2.7,state.lightZ];
  function ball(o,d){const q=sub(o,sphere),b=dot(q,d),c=dot(q,q)-state.radius**2,h=b*b-c;if(h<0)return Infinity;const t=-b-Math.sqrt(h);return t>.0001?t:Infinity;}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const d=norm(add(forward,add(mul(right,((x+.5)/width-.5)*1.23),mul(up,(.5-(y+.5)/height)*.984))));
    let t=ball(eye,d),id=3,n=null,p=null;
    for(const [axis,at,part,normal]of [[1,0,0,[0,1,0]],[0,-1.5,1,[1,0,0]],[0,1.5,2,[-1,0,0]],[2,-1.6,0,[0,0,1]]]){
      const s=(at-eye[axis])/d[axis];if(s<.0001||s>=t)continue;const hit=add(eye,mul(d,s));if(hit[0]<-1.501||hit[0]>1.501||hit[1]<-.001||hit[1]>3||hit[2]<-1.601||hit[2]>1.6)continue;t=s;id=part;n=normal;
    }
    if(!Number.isFinite(t))continue;p=add(eye,mul(d,t));if(id===3)n=norm(sub(p,sphere));
    // A small area-light quadrature softens geometric shadows; this is a direct-light study.
    let direct=0;for(const ox of [-.14,.14])for(const oz of [-.14,.14]){const v=sub(add(light,[ox,0,oz]),p),dist=Math.hypot(...v),l=mul(v,1/dist),origin=add(p,mul(n,.002));if(ball(origin,l)>dist)direct+=Math.max(0,dot(n,l))*3.2/(.7+dist*dist)*.25;}
    const illumination=.07+direct,c=colors[id],i=y*width+x;ids[i]=id;
    for(let k=0;k<3;k++)rgb[i*3+k]=Math.pow(c[k]*illumination/(1+c[k]*illumination),1/2.2);
    scalar[i]=.2126*rgb[i*3]+.7152*rgb[i*3+1]+.0722*rgb[i*3+2];
  }
  return {width,height,rgb,scalar,ids};
}

// Zero padding closes the border. Integer lattice-edge keys make shared crossings exact.
// Saddle pairing keeps diagonal islands separate, matching native Iso's four-connectivity.
export function isoLoops(field,width,height,level,smooth=1){
  const w=width+2,h=height+2,v=new Float32Array(w*h),segments=[],points=new Map(),at=new Map();
  for(let y=0;y<height;y++)v.set(field.subarray(y*width,(y+1)*width),(y+1)*w+1);
  const pairs=[[],[[0,3]],[[0,1]],[[3,1]],[[1,2]],[[0,3],[1,2]],[[0,2]],[[3,2]],[[3,2]],[[0,2]],[[0,1],[3,2]],[[1,2]],[[3,1]],[[0,1]],[[0,3]],[]];
  for(let y=0;y<h-1;y++)for(let x=0;x<w-1;x++){
    const a=v[y*w+x],b=v[y*w+x+1],c=v[(y+1)*w+x+1],d=v[(y+1)*w+x],code=(a>=level?1:0)|(b>=level?2:0)|(c>=level?4:0)|(d>=level?8:0);if(!pairs[code].length)continue;
    const keys=[(y*w+x)*2,(y*w+x+1)*2+1,((y+1)*w+x)*2,(y*w+x)*2+1];
    const coord=e=>e===0?[x+(level-a)/(b-a)-1,y-1]:e===1?[x,y+(level-b)/(c-b)-1]:e===2?[x+(level-d)/(c-d)-1,y]:[x-1,y+(level-a)/(d-a)-1];
    for(const pair of pairs[code]){const index=segments.length,edges=pair.map(e=>keys[e]);segments.push(edges);for(let k=0;k<2;k++){points.set(edges[k],coord(pair[k]));if(!at.has(edges[k]))at.set(edges[k],[]);at.get(edges[k]).push(index);}}
  }
  const used=new Set(),loops=[];
  for(let i=0;i<segments.length;i++){
    if(used.has(i))continue;let edge=segments[i][0],current=i,start=edge,loop=[];
    while(current!==undefined&&!used.has(current)){used.add(current);loop.push(points.get(edge));const seg=segments[current];edge=seg[0]===edge?seg[1]:seg[0];current=at.get(edge)?.find(j=>!used.has(j));}
    if(edge!==start)throw Error('Open contour: inconsistent lattice adjacency');if(loop.length<3)continue;
    for(let pass=0;pass<smooth;pass++){const next=[];loop.forEach((a,j)=>{const b=loop[(j+1)%loop.length];next.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);});loop=next;}
    loops.push(loop);
  }
  return loops;
}
export function vectorize(field,bands=8,smooth=1){
  const shapes=[],{width,height,ids,scalar,rgb}=field;
  for(let id=0;id<4;id++){
    const values=new Float32Array(scalar.length);let max=0;for(let i=0;i<values.length;i++)if(ids[i]===id){values[i]=scalar[i];max=Math.max(max,scalar[i]);}
    if(!max)continue;
    // A full object silhouette under the tone levels prevents cracks where
    // independently sampled neighbouring surfaces meet.
    const mask=Float32Array.from(ids,v=>v===id?1:0),base=isoLoops(mask,width,height,.5,smooth);
    let darkest=Infinity,darkColor=[0,0,0];for(let i=0;i<ids.length;i++)if(ids[i]===id&&scalar[i]<darkest){darkest=scalar[i];darkColor=Array.from(rgb.subarray(i*3,i*3+3));}
    if(base.length)shapes.push({id,band:-1,level:0,color:darkColor,loops:base.map(loop=>loop.map(([x,y])=>[(x+.5)/width*960,(y+.5)/height*768]))});
    for(let k=0;k<bands;k++){
      const lo=k===0?.00001:max*k/bands,hi=max*(k+1)/bands,loops=isoLoops(values,width,height,lo,smooth);if(!loops.length)continue;
      const color=[0,0,0];let count=0;for(let i=0;i<values.length;i++)if(ids[i]===id&&values[i]>=lo&&(values[i]<hi||k===bands-1)){count++;for(let c=0;c<3;c++)color[c]+=rgb[i*3+c];}
      if(!count)continue;shapes.push({id,band:k,level:lo,color:color.map(v=>v/count),loops:loops.map(loop=>loop.map(([x,y])=>[(x+.5)/width*960,(y+.5)/height*768]))});
    }
  }
  return shapes;
}
