// Bounded image-space optimization. This is independent of the native 3D trainer.
// The objective is RGB MSE of ordered, alpha-composited elliptical Gaussians.
export function makeGaussianFit(width=96,height=64){
 const n=width*height,background=[.025,.057,.067],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 let target=new Float64Array(n*3),marks=[],image=new Float64Array(n*3),iteration=0,loss=0,initialLoss=0,accepted=0,epoch=0,lastBudget=0;
 function visit(m,fn){const c=Math.cos(m.angle),s=Math.sin(m.angle),rx=3*Math.hypot(c*m.sx,s*m.sy),ry=3*Math.hypot(s*m.sx,c*m.sy);
  for(let y=Math.max(0,Math.floor(m.y-ry));y<Math.min(height,Math.ceil(m.y+ry));y++)for(let x=Math.max(0,Math.floor(m.x-rx));x<Math.min(width,Math.ceil(m.x+rx));x++){
   const dx=x+.5-m.x,dy=y+.5-m.y,u=c*dx+s*dy,v=-s*dx+c*dy,q=u*u/(m.sx*m.sx)+v*v/(m.sy*m.sy);if(q>9)continue;fn((y*width+x)*3,.96*Math.exp(-q*.5),u,v,c,s);
  }
 }
 function render(){const out=new Float64Array(n*3);for(let i=0;i<out.length;i++)out[i]=background[i%3];for(const m of marks)visit(m,(i,a)=>{for(let k=0;k<3;k++)out[i+k]=out[i+k]*(1-a)+m.c[k]*a;});return out;}
 function error(out){let sum=0;for(let i=0;i<out.length;i++)sum+=(out[i]-target[i])**2;return sum/out.length;}
 function seed(count){marks=[];const cols=Math.ceil(Math.sqrt(count*width/height)),rows=Math.ceil(count/cols),sx=width/cols*.73,sy=height/rows*.73;
  for(let j=0;j<count;j++){const x=(j%cols+.5)*width/cols,y=(Math.floor(j/cols)+.5)*height/rows,i=(Math.min(height-1,Math.floor(y))*width+Math.min(width-1,Math.floor(x)))*3;marks.push({x,y,sx,sy,angle:0,c:[target[i],target[i+1],target[i+2]]});}
  iteration=accepted=0;image=render();loss=initialLoss=error(image);
 }
 function setTarget(rgba,count=192){let delta=0;for(let i=0;i<n;i++)for(let k=0;k<3;k++){const alpha=rgba[i*4+3]/255,v=rgba[i*4+k]/255*alpha+background[k]*(1-alpha);delta+=Math.abs(v-target[i*3+k]);target[i*3+k]=v;}
  if(marks.length!==count){seed(count);epoch++;return true;}
  if(delta/(n*3)>1e-5){image=render();loss=initialLoss=error(image);iteration=accepted=0;epoch++;return true;}return false;
 }
 function step(){if(!marks.length)return false;const reverse=image.slice(),trans=new Float64Array(n).fill(1),residual=image.map((v,i)=>v-target[i]),gradients=new Array(marks.length);
  for(let j=marks.length-1;j>=0;j--){const m=marks[j],g=[0,0,0,0,0,0,0,0];let mass=1e-8;
   visit(m,(i,a,u,v,c,s)=>{const t=trans[i/3],inv=1/(1-a);let da=0;for(let k=0;k<3;k++){const before=(reverse[i+k]-a*m.c[k])*inv,e=residual[i+k]*t;da+=e*(m.c[k]-before);g[5+k]+=e*a;reverse[i+k]=before;}const z=da*a,xx=m.sx*m.sx,yy=m.sy*m.sy;g[0]+=z*(c*u/xx-s*v/yy);g[1]+=z*(s*u/xx+c*v/yy);g[2]+=z*u*u/xx;g[3]+=z*v*v/yy;g[4]+=z*u*v*(1/yy-1/xx);mass+=a*t;trans[i/3]*=1-a;});
   gradients[j]=g.map(v=>v/mass);
  }
  const original=marks.map(m=>({...m,c:m.c.slice()}));let improved=false;
  for(let trial=0;trial<5;trial++){const rate=2**(-trial);marks=original.map((m,j)=>{const g=gradients[j],bounded=(v,cap)=>clamp(v,-cap,cap);return{x:clamp(m.x-rate*bounded(g[0]*60,.4),0,width),y:clamp(m.y-rate*bounded(g[1]*60,.4),0,height),sx:clamp(m.sx*Math.exp(-rate*bounded(g[2]*8,.06)),.6,18),sy:clamp(m.sy*Math.exp(-rate*bounded(g[3]*8,.06)),.6,18),angle:m.angle-rate*bounded(g[4]*8,.05),c:m.c.map((v,k)=>clamp(v-rate*bounded(g[5+k]*2,.045),0,1))};});const candidate=render(),next=error(candidate);if(next<loss-1e-12){image=candidate;loss=next;accepted++;improved=true;break;}}
  if(!improved)marks=original;iteration++;return improved;
 }
 return {setTarget,step,reset(){marks=[];iteration=accepted=0;},advance(milliseconds=4){const start=performance.now();let steps=0;do{if(iteration>=400||!step())break;steps++;}while(performance.now()-start<milliseconds);lastBudget=performance.now()-start;return steps;},get marks(){return marks.map(m=>({...m,x:m.x*720/width,y:m.y*480/height,sx:m.sx*720/width,sy:m.sy*480/height,sigma:m.sx*720/width,c:m.c.map(v=>Math.round(v*255))}));},get stats(){return {loss,initialLoss,iteration,accepted,epoch,width,height,count:marks.length,milliseconds:lastBudget};},residual(){const pixels=new Uint8ClampedArray(n*4);for(let i=0;i<n;i++){const e=Math.sqrt((image[i*3]-target[i*3])**2+(image[i*3+1]-target[i*3+1])**2+(image[i*3+2]-target[i*3+2])**2);pixels[i*4]=Math.min(255,e*700);pixels[i*4+1]=Math.min(220,e*190);pixels[i*4+2]=Math.min(160,e*90);pixels[i*4+3]=255;}return {pixels,width,height};},snapshot(){return {marks:marks.map(m=>({...m,c:m.c.slice()})),iteration,accepted,epoch};},restore(s){if(!s?.marks)return;marks=s.marks.map(m=>({...m,c:m.c.slice()}));iteration=s.iteration||0;accepted=s.accepted||0;epoch=s.epoch||0;image=render();loss=initialLoss=error(image);}};
}
