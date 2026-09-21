export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Orthographic orbit shared by the landscape and convolution ribbons.
export function cameraPoint(x,y,z,state,w,h,scale=.65){
  const c=Math.cos(state.yaw),s=Math.sin(state.yaw),pitch=state.pitch??.55;
  const horizontal=c*x-s*y,depth=s*x+c*y;
  return [w*.5+horizontal*w*scale,h*.58+(Math.sin(pitch)*depth-Math.cos(pitch)*z)*h*scale];
}

export function containsPoint(points,x,y){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

export function nearestRibbon(ribbons,x,y){
  let best=100,result=null;
  for(const ribbon of ribbons)for(let i=1;i<ribbon.points.length;i++){
    const a=ribbon.points[i-1],b=ribbon.points[i],dx=b[0]-a[0],dy=b[1]-a[1];
    const u=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);
    const d=(x-a[0]-u*dx)**2+(y-a[1]-u*dy)**2;
    if(d<best){best=d;result=ribbon.tau;}
  }
  return result;
}
