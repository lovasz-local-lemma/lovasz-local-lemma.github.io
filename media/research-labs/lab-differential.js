(() => {
  'use strict';
  const M=PhotonExperiment,L=ResearchLab,cache=new Map();
  function fieldCanvas(kind,width,height,args){
    const key=[kind,width,height,...args].join(':');if(cache.has(key))return cache.get(key);
    const out=document.createElement('canvas');out.width=width;out.height=height;const c=out.getContext('2d'),im=c.createImageData(width,height),[p,a,b,s,ext,H,step]=args;
    const peak=M.attenuation(ext,H),scale=peak/(s*Math.sqrt(2*Math.PI)),cols=Array.from({length:width},(_,i)=>{const x=((i+.5)/width-.5)*4.5;return kind==='render'?peak*M.box(x-p,a,s):kind==='finite'?(M.box(x-p-step,a,s)-M.box(x-p,a,s))*peak/step:(M.gaussian(x-p-a,s)-M.gaussian(x-p+a,s))*peak;});
    for(let j=0;j<height;j++){const y=(.5-(j+.5)/height)*3,by=M.box(y,b,s);for(let i=0;i<width;i++){
      const q=cols[i]*by;
      const intensity=Math.min(1,Math.abs(q)/(kind==='render'?peak:scale)),v=Math.sqrt(intensity),color=kind==='render'?[255,208,103]:q<0?[119,139,255]:[255,143,84],n=(j*width+i)*4;
      for(let ch=0;ch<3;ch++)im.data[n+ch]=Math.round([7,13,22][ch]+v*(color[ch]-[7,13,22][ch]));im.data[n+3]=255;
    }}c.putImageData(im,0,0);cache.set(key,out);return out;
  }
  L.setup(({$,ctx,w,h})=>{
    cache.clear();const p=+$('position').value,step=+$('step').value,a=+$('width').value,b=.65,s=+$('filter').value,ext=+$('extinction').value,H=2.2,args=[p,a,b,s,ext,H,step],limit=$('representation').value==='limit';
    ['position','step','width','filter','extinction','orbit'].forEach(id=>$(id+'-out').textContent=$(id).value);
    const topH=Math.min(350,h*.43),bounds=[-2,2].flatMap(x=>[-1,1].flatMap(y=>[0,H].map(z=>[x,y,z]))),proj=L.projection(+$('orbit').value*Math.PI/180,.5,bounds,{x:25,y:50,w:w-50,h:topH-68});
    ctx.font='600 15px system-ui';ctx.fillStyle='#ffe0a1';ctx.fillText(limit?'The derivative lives on the moving side faces':'A translated volume gains one sliver and loses another',18,25);
    const face=(x,color)=>{const pts=[[x,-b,0],[x,b,0],[x,b,H],[x,-b,H]].map(proj);ctx.beginPath();pts.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.closePath();ctx.fillStyle=color;ctx.fill();L.line(ctx,pts.concat([pts[0]]),color.replace('30','bb'),2);};
    const box=(left,right,color)=>{for(const z of[0,H])L.line(ctx,[[left,-b,z],[right,-b,z],[right,b,z],[left,b,z],[left,-b,z]].map(proj),color,1.5);for(const x of[left,right])for(const y of[-b,b])L.line(ctx,[proj([x,y,0]),proj([x,y,H])],color,1.5);};
    box(p-a,p+a,'#f5cc7866');face(p-a,'#8195ff30');face(p+a,'#ff9a6230');
    if(!limit){box(p-a+step,p+a+step,'#ffe8ab99');for(const x of[p-a,p+a])face(x+step,x<p?'#8195ff30':'#ff9a6230');}
    // Each source edge is integrated continuously. These discrete rays show
    // the ruling of a zero-normal-thickness support; they are not beam kernels.
    for(const [x,color] of [[p-a,'#9aaaff'],[p+a,'#ffb17d']]){
      L.line(ctx,[proj([x,-b,0]),proj([x,b,0])],color,3);
      for(let j=0;j<7;j++){
        const y=-b+2*b*j/6;
        L.line(ctx,[proj([x,y,0]),proj([x,y,H])],color+'88',.9);
        L.arrow(ctx,proj([x,y,H*.32]),proj([x,y,H*.51]),color,1);
      }
    }
    for(let i=0;i<5;i++)L.arrow(ctx,proj([p-a+2*a*i/4,0,0]),proj([p-a+2*a*i/4,0,.45]),'#f9d87f',1.3);
    L.arrow(ctx,proj([p,0,H*.7]),proj([p+.6,0,H*.7]),'#fff1bd');
    ctx.font='12px system-ui';ctx.fillStyle='#c6d1dc';ctx.fillText('Each colored source edge → parallel rays → a signed sheet.',18,topH-7);
    const gap=12,pad=14,tw=(w-2*pad-2*gap)/3,imageH=Math.min(tw*2/3,190),start=topH+22,dpr=Math.min(devicePixelRatio||1,2);
    const titles=['Filtered single-scatter image','Finite difference / Δx','Analytic boundary sheets'];
    ['render','finite','exact'].forEach((kind,i)=>{const x=pad+i*(tw+gap);ctx.font='600 '+(w<620?10:12)+'px system-ui';ctx.fillStyle='#e9d79c';ctx.fillText(titles[i],x,start-8);ctx.drawImage(fieldCanvas(kind,Math.max(8,Math.round(tw*dpr)),Math.max(8,Math.round(imageH*dpr)),args),x,start,tw,imageH);ctx.strokeStyle='#9fccbc55';ctx.strokeRect(x,start,tw,imageH);});
    const plot={x:35,y:start+imageH+48,w:w-70,h:h-start-imageH-84},peak=M.attenuation(ext,H)/(s*Math.sqrt(2*Math.PI)),fd=[],exact=[];let err=0,norm=0;
    for(let i=0;i<=400;i++){const x=-2.25+4.5*i/400,d=M.derivative(x,0,p,a,b,s,ext,H),f=M.difference(x,0,p,a,b,s,ext,H,step);err+=(f-d)**2;norm+=d*d;fd.push([plot.x+i/400*plot.w,plot.y+plot.h/2-f/peak*plot.h*.4]);exact.push([plot.x+i/400*plot.w,plot.y+plot.h/2-d/peak*plot.h*.4]);}
    ctx.fillStyle='#bbcad5';ctx.font='12px system-ui';ctx.fillText('Center row: gold = finite difference · mint = exact derivative',plot.x,plot.y-12);L.line(ctx,[[plot.x,plot.y+plot.h/2],[plot.x+plot.w,plot.y+plot.h/2]],'#8194aa44');L.line(ctx,fd,'#f8d27d',2,[5,4]);L.line(ctx,exact,'#82efcc',2);
    $('error').textContent=(100*Math.sqrt(err/Math.max(1e-20,norm))).toFixed(2)+'%';$('thickness').textContent=limit?'0 · signed sheets':step.toFixed(3);$('energy').textContent='0 · full image';
  });
})();
