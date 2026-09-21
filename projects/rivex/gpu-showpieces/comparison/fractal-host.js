// The external route evaluates the same complex orbit and native vector binds.
// The rendered fractal remains in WebGPU; this geometry is ordinary Rive.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
let spring=[1274.4,1175.84,1157.92],velocity=[0,0,0];
export function resetFractalInterface(){spring=[1274.4,1175.84,1157.92];velocity=[0,0,0];}
export function updateFractalInterface(v,time,put,label,seconds=1/60){
 const dt=Math.min(seconds,.035),values=[v.dispersion/2,v.zoom,v.rotation];
 ['dispersion','zoom','rotation'].forEach((name,i)=>{const target=1140+values[i]*224;velocity[i]+=(target-spring[i])*200*dt;velocity[i]*=Math.exp(-18*dt);spring[i]+=velocity[i]*dt;const stretch=1+Math.min(.55,Math.abs(velocity[i])*.0015);put(name+'X',spring[i]);put(name+'Width',Math.max(1,spring[i]-1140));put(name+'Stretch',stretch);put(name+'Squash',1/stretch);});
 put('guideX',36+v.lensX);put('guideY',168+v.lensY);put('guideRotation',v.rotation*Math.PI*2);
 label('dispersionText',v.dispersion.toFixed(2));label('zoomText',(1+v.zoom*1.8).toFixed(2)+'x');label('rotationText',String(Math.floor(v.rotation*360)).padStart(3,'0'));
 const cx=v.sampleCX??v.cX,cy=v.sampleCY??v.cY;
 label('motionText',v.playing>.5?'Hold motion':'Resume motion');label('readout',`c = ${cx.toFixed(3)} ${cy>=0?'+':''}${cy.toFixed(3)}i`);
 for(let i=0;i<3;i++){put('mode'+i,Math.abs(v.mode-i)<.1?1:0);put('hover'+i,v['hoverTarget'+i]||0);}
 let x=0,y=0,last=[1252,298],marker=[1252,298],escaped=false;const active=Math.floor(time*8)%24;
 for(let i=0;i<25;i++){
  if(!escaped){const nx=x*x-y*y+cx,ny=2*x*y+cy;x=nx;y=ny;const ox=1252+x*57,oy=298+y*29;if(x*x+y*y>20||ox<1140||ox>1364||oy<248||oy>348)escaped=true;else{last=[ox,oy];if(i===active)marker=last;}}
  put('orbitX'+i,last[0]);put('orbitY'+i,last[1]);
 }
 const px=1140+(v.cX+1.15)/1.5*224,py=248+(v.cY+.55)/1.1*100;
 const cross=[[[px-13,py],[px-4,py]],[[px+4,py],[px+13,py]],[[px,py-13],[px,py-4]],[[px,py+4],[px,py+13]]];
 cross.forEach((seg,j)=>seg.forEach((p,i)=>{put(`cross${j}X${i}`,p[0]);put(`cross${j}Y${i}`,p[1]);}));
 for(let i=0;i<=40;i++){const a=i/40*Math.PI*2;put('circleX'+i,px+Math.cos(a)*8);put('circleY'+i,py+Math.sin(a)*8);}
 for(let i=0;i<=16;i++){const a=i/16*Math.PI*2;put('markerX'+i,marker[0]+Math.cos(a)*2);put('markerY'+i,marker[1]+Math.sin(a)*2);}
}
export function hitFractalPrism(p,v){return (p.x-36-v.lensX)**2+(p.y-168-v.lensY)**2<152**2;}
export function handleFractalPointer(p,v,put){
 let drag=null;
 if(p.x>=1124&&p.x<=1380){if(p.y>=242&&p.y<=360)drag={kind:'parameter'};else{const i=[434,522,610].findIndex(y=>Math.abs(p.y-y)<25);if(i>=0)drag={kind:'fractal-slider',index:i};}}
 if(!drag&&hitFractalPrism(p,v))drag={kind:'lens',dx:p.x-36-v.lensX,dy:p.y-168-v.lensY};
 if(drag)dragFractalPointer(p,drag,put);return drag;
}
export function dragFractalPointer(p,drag,put){
 if(drag.kind==='lens'){put('lensX',clamp(p.x-36-drag.dx,155,885));put('lensY',clamp(p.y-168-drag.dy,160,480));}
 if(drag.kind==='parameter'){put('cX',-1.15+clamp((p.x-1140)/224,0,1)*1.5);put('cY',-.55+clamp((p.y-248)/100,0,1)*1.1);}
 if(drag.kind==='fractal-slider')put(['dispersion','zoom','rotation'][drag.index],clamp((p.x-1140)/224,0,1)*(drag.index===0?2:1));
}
