/* Uniform unit ball, central source, camera at infinity along +z. */
(() => {
  'use strict';
  const K=3/(4*Math.PI),F=t=>t<=0?0:t>=2?1:3*t/4-t*t*t/16,f=t=>t<0||t>2?0:3/4-3*t*t/16;
  const zAt=(rho,t)=>t<=0?Infinity:(rho*rho-t*t)/(2*t);
  function gate(rho,t,width){if(rho>1||rho<0)return 0;const z=Math.sqrt(1-rho*rho),lo=zAt(rho,t+width/2),hi=zAt(rho,t-width/2);return K*Math.max(0,Math.min(z,hi)-Math.max(-z,lo))/width;}
  function instant(rho,t){if(t<=0||t>=2||rho<0||rho>Math.sqrt(t*(2-t)))return 0;return K*(rho*rho+t*t)/(2*t*t);}
  const math={K,F,f,zAt,gate,instant};if(typeof module!=='undefined')module.exports=math;if(typeof document==='undefined')return;
  const {v,projection,line,dot,setup}=ResearchLab;
  setup(({$,ctx,w,h})=>{
    const t=+$('arrival').value,width=+$('window').value,orbit=+$('orbit').value*Math.PI/180,exposure=+$('exposure').value,mode=$('mode').value;
    for(const id of ['arrival','window','orbit','exposure'])$(id+'-out').value=(+$ (id).value).toFixed(id==='orbit'?0:3);
    const mass=F(t+width/2)-F(t-width/2);$('mass').textContent=mass.toFixed(5);$('rate').textContent=(mass/width).toFixed(5);$('limit-rate').textContent=f(t).toFixed(5);
    const cube=[];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])cube.push([x,y,z]);const p=projection(orbit,.35,cube,{x:12,y:36,w:w*.51-20,h:h-76},.03);
    const TAU=2*Math.PI;ctx.font='12px system-ui';ctx.fillStyle='#d9e8e6';ctx.fillText(mode==='volume'?'Full 3D photon support':mode==='window'?'Two arrival surfaces enclose a thick gate':'One arrival surface · a 2D sheet',20,22);
    for(let k=0;k<12;k++){const a=k*TAU/12;line(ctx,Array.from({length:65},(_,i)=>{const s=i*Math.PI/64;return p([Math.sin(s)*Math.cos(a),Math.sin(s)*Math.sin(a),Math.cos(s)]);}), '#8abbc637',1);}
    for(let k=1;k<8;k++){const z=-1+k/4,rr=Math.sqrt(1-z*z);line(ctx,Array.from({length:65},(_,i)=>p([rr*Math.cos(i*TAU/64),rr*Math.sin(i*TAU/64),z])),'#8abbc637',1);}
    if(mode==='volume'){for(let k=0;k<850;k++){const z=2*((k*.754877666)%1)-1,a=k*2.39996323,rr=Math.sqrt(1-z*z)*Math.cbrt((k*.56984029)%1);const pt=[rr*Math.cos(a),rr*Math.sin(a),z];if(v.norm(pt)<=1)dot(ctx,p(pt),'#7dd8b85a',1.25);}}
    else {const ts=mode==='window'?[Math.max(.001,t-width/2),Math.min(1.999,t+width/2)]:[t];for(let j=0;j<ts.length;j++){const q=ts[j],rr=Math.sqrt(q*(2-q)),color=ts.length===1?'#87ecd6':j?'#bca1fa':'#eac776';for(let k=1;k<=10;k++){const rho=rr*k/10;line(ctx,Array.from({length:65},(_,i)=>p([rho*Math.cos(i*TAU/64),rho*Math.sin(i*TAU/64),zAt(rho,q)])),color+(k===10?'dd':'77'),k===10?2:1);}for(let k=0;k<14;k++){const a=k*TAU/14;line(ctx,Array.from({length:40},(_,i)=>{const rho=rr*i/39;return p([rho*Math.cos(a),rho*Math.sin(a),zAt(rho,q)]);}),color+'55');}}
      if(mode==='window')for(let k=0;k<850;k++){const z=2*((k*.754877666)%1)-1,a=k*2.39996323,rr=Math.sqrt(1-z*z)*Math.sqrt((k*.56984029)%1),pt=[rr*Math.cos(a),rr*Math.sin(a),z],arrival=v.norm(pt)-z;if(Math.abs(arrival-t)<width/2)dot(ctx,p(pt),'#c2dfb78a',1.7);}
    }
    dot(ctx,p([0,0,0]),'#f3ce85',4);ctx.fillStyle='#b8c7cb';ctx.fillText('Source at center · camera looks along +z',20,h-18);
    const side=Math.min(w*.40,h*.60),sx=w*.55+(w*.43-side)/2,sy=40,N=120,img=ctx.createImageData(N,N);for(let y=0;y<N;y++)for(let x=0;x<N;x++){const rho=Math.hypot((x+.5)/N*2-1,(y+.5)/N*2-1),val=mode==='volume'?(rho<1?K*2*Math.sqrt(1-rho*rho):0):mode==='window'?gate(rho,t,width):instant(rho,t),s=1-Math.exp(-val*exposure*5),i=(y*N+x)*4;img.data[i]=Math.min(255,s*230);img.data[i+1]=Math.min(255,s*255);img.data[i+2]=Math.min(255,s*212+Math.pow(s,.4)*30);img.data[i+3]=255;}
    const cache=document.createElement('canvas');cache.width=N;cache.height=N;cache.getContext('2d').putImageData(img,0,0);ctx.drawImage(cache,sx,sy,side,side);ctx.strokeStyle='#a7dcd54f';ctx.strokeRect(sx,sy,side,side);ctx.fillStyle='#d9e8e6';ctx.fillText('Camera projection · integrated along rays',w*.55,22);
    const gx=w*.55,gy=sy+side+26,gw=w*.40,gh=Math.max(38,h-gy-32);line(ctx,[[gx,gy],[gx,gy+gh],[gx+gw,gy+gh]],'#819fa44f');line(ctx,Array.from({length:101},(_,i)=>[gx+i*gw/100,gy+gh-f(i/50)/.75*gh]),'#82ecd0',2);const xx=gx+t/2*gw;line(ctx,[[gx+Math.max(0,t-width/2)/2*gw,gy+gh],[gx+Math.min(2,t+width/2)/2*gw,gy+gh]],'#f1c979',5);dot(ctx,[xx,gy+gh-mass/width/.75*gh],'#f1c979',4);dot(ctx,[xx,gy+gh-f(t)/.75*gh],'#81edce',3);ctx.fillStyle='#aec4cc';ctx.fillText('Gold: finite gate / Δ     Mint: derivative',gx,h-10);
  });
})();
