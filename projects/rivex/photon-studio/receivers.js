// Receiver fields follow recorded hit normals. A relay caustic can land on a wall,
// so projecting every deposit into the floor plane would silently lose it.
export function buildReceivers(cache,scene,time,onlyGlass=false,n=64){
  const faces=[];
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
    if(axis===2&&sign===1)continue;
    const uv=[0,1,2].filter(i=>i!==axis),normal=[0,0,0];normal[axis]=-sign;
    const face={axis,sign,uv,normal,n,a:new Float32Array(n*n),count:0,maximum:0};
    for(const d of cache.deposits){
      if(Math.abs(d.p[axis]-sign*scene.bounds[axis])>.025||(d.normal&&d.normal[axis]*-sign<.7)||(onlyGlass&&!d.glass)||(time.on&&Math.abs(d.t-time.center)>time.half))continue;
      const x=Math.round((d.p[uv[0]]/(2*scene.bounds[uv[0]])+.5)*(n-1)),y=Math.round((d.p[uv[1]]/(2*scene.bounds[uv[1]])+.5)*(n-1)),power=d.color.reduce((s,v)=>s+v,0)/3;face.count++;
      for(let j=-3;j<=3;j++)for(let i=-3;i<=3;i++)if(x+i>=0&&x+i<n&&y+j>=0&&y+j<n)face.a[(y+j)*n+x+i]+=power*Math.exp(-(i*i+j*j)/3);
    }
    for(const a of face.a)face.maximum=Math.max(face.maximum,a);
    if(face.count)faces.push(face);
  }
  return faces.sort((a,b)=>b.count-a.count);
}
export function receiverSample(face,u,v){
  const {n,a}=face,x=Math.max(0,Math.min(n-1,u*(n-1))),y=Math.max(0,Math.min(n-1,v*(n-1))),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(n-1,x0+1),y1=Math.min(n-1,y0+1),fx=x-x0,fy=y-y0;
  const z=(a[y0*n+x0]*(1-fx)+a[y0*n+x1]*fx)*(1-fy)+(a[y1*n+x0]*(1-fx)+a[y1*n+x1]*fx)*fy;
  return Math.log1p(z)/Math.log1p(Math.max(1,face.maximum));
}
export function receiverPoint(face,scene,u,v,offset=0){const p=[0,0,0];p[face.axis]=face.sign*scene.bounds[face.axis]-face.sign*(.008+offset);p[face.uv[0]]=(2*u-1)*scene.bounds[face.uv[0]];p[face.uv[1]]=(2*v-1)*scene.bounds[face.uv[1]];return p;}
export function receiverLines(faces,scene,exposure,width,maxFaces=3){
  const lines=[],active=faces.slice(0,maxFaces),rows=active.length===1?32:20,columns=active.length===1?40:24;
  for(const [fi,face]of active.entries())for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
    const v=(j+.5)/rows,u=i/columns,u1=(i+1)/columns,a=Math.min(1,receiverSample(face,u,v)*exposure),b=Math.min(1,receiverSample(face,u1,v)*exposure);
    lines.push({a:receiverPoint(face,scene,u,v,a*.14),b:receiverPoint(face,scene,u1,v,b*.14),w:(.35+Math.pow(a,.7)*1.4)*width,color:(j+fi)%4});
  }
  return lines;
}
