(() => {
  'use strict';
  const C=299792458,TAU=2*Math.PI,wrap=x=>(x%TAU+TAU)%TAU;
  function estimate(z,fMHz,dMHz,error1=0,error2=0){const f=fMHz*1e6,d=dMHz*1e6,p1=wrap(4*Math.PI*f*z/C+error1),p2=wrap(4*Math.PI*(f+d)*z/C+error2);return {single:C*p1/(4*Math.PI*f),beat:C*wrap(p2-p1)/(4*Math.PI*d),p1,p2,singleRange:C/(2*f),beatRange:C/(2*d),sensitivity:C/(4*Math.PI*d)};}
  const principal=x=>Math.atan2(Math.sin(x),Math.cos(x));
  function unwrap(samples,anchor=null){if(!samples.length)return [];const out=[samples[0]+(anchor===null?0:TAU*Math.round((anchor-samples[0])/TAU))];for(let i=1;i<samples.length;i++)out.push(out[i-1]+principal(samples[i]-samples[i-1]));return out;}
  function spatial({span=24,frequency=30,noise=.015,samples=96,jump=0,anchor=true,offset=6}={}){
    const scale=4*Math.PI*frequency*1e6/C,depth=Array.from({length:samples},(_,i)=>{const u=i/(samples-1);return offset+span*(u+.06*Math.sin(TAU*u))+(u>=.53?jump:0);}),phase=depth.map((z,i)=>z*scale+noise*Math.sin(i*1.7)),raw=phase.map(principal),continuous=unwrap(raw,anchor?depth[0]*scale:null),recovered=continuous.map(x=>x/scale);
    const increments=phase.slice(1).map((x,i)=>x-phase[i]),violations=increments.filter(x=>Math.abs(x)>=Math.PI).length;
    return {depth,phase,raw,continuous,recovered,increments,violations,maxIncrement:Math.max(...increments.map(Math.abs)),sensitivity:1/scale,wavelength:C/(frequency*1e6),rmse:Math.sqrt(depth.reduce((sum,z,i)=>sum+(z-recovered[i])**2,0)/samples)};
  }
  const math={C,wrap,estimate,principal,unwrap,spatial};if(typeof module!=='undefined')module.exports=math;if(typeof document==='undefined')return;
  const {line,setup}=ResearchLab;
  setup(({$,ctx,w,h})=>{
    const span=+$('span').value,freq=+$('frequency').value,diff=+$('difference').value,noise=+$('noise').value;for(const id of ['span','frequency','difference','noise','samples','jump'])$(id+'-out').value=(+$ (id).value).toFixed(id==='noise'?3:1);const model=estimate(0,freq,diff);$('single-range').textContent=model.singleRange.toFixed(2);$('synthetic-range').textContent=model.beatRange.toFixed(2);$('noise-scale').textContent=model.sensitivity.toFixed(3);
    const isSpatial=$('mode').value==='spatial';$('difference').disabled=isSpatial;for(const id of ['samples','jump','anchor'])$(id).disabled=!isSpatial;
    if(isSpatial){
      const m=spatial({span,frequency:freq,noise,samples:+$('samples').value,jump:+$('jump').value,anchor:$('anchor').value==='known'});$('noise-scale').textContent=m.sensitivity.toFixed(3);
      const gx=54,gw=w-76,gy=44,gh=h-180,min=Math.min(0,...m.recovered),max=Math.max(...m.depth,...m.recovered)*1.06,px=i=>gx+i/(m.depth.length-1)*gw,py=z=>gy+gh-(z-min)/(max-min)*gh;
      ctx.font='12px system-ui';ctx.fillStyle='#b5c7d6';ctx.fillText('Depth (m) · modulation wavelength '+m.wavelength.toFixed(2)+' m',gx,22);
      for(let i=0;i<=4;i++){const z=min+(max-min)*i/4;line(ctx,[[gx,py(z)],[gx+gw,py(z)]],'#abc2d027');ctx.fillText(z.toFixed(1),gx-42,py(z)+4);}
      line(ctx,m.depth.map((z,i)=>[px(i),py(z)]),'#82e7cc',2.5);line(ctx,m.recovered.map((z,i)=>[px(i),py(z)]),'#edc787',2);
      for(let i=0;i<m.increments.length;i++)if(Math.abs(m.increments[i])>=Math.PI){line(ctx,[[px(i+1),gy],[px(i+1),gy+gh]],'#ff8877',1,[3,3]);}
      ctx.fillStyle='#8be8d0';ctx.fillText('True surface',gx,gy+gh+23);ctx.fillStyle='#ebc685';ctx.fillText('Unwrapped estimate',gx+100,gy+gh+23);
      const sy=gy+gh+45;for(let i=0;i<m.raw.length;i++){ctx.fillStyle=`hsl(${wrap(m.raw[i])/TAU*360} 68% 55%)`;ctx.fillRect(px(i),sy,gw/m.raw.length+1,24);}
      ctx.fillStyle='#bfadf1';ctx.fillText('Raw wrapped phase · colors repeat each 2π',gx,sy+42);ctx.fillStyle=m.violations?'#ffad9d':'#b6d6ca';ctx.fillText('Largest adjacent phase change: '+(m.maxIncrement/Math.PI).toFixed(2)+'π · '+m.violations+' continuity violations · RMSE '+m.rmse.toFixed(3)+' m',gx,h-28);
      ctx.fillStyle='#aebfcf';ctx.fillText($('anchor').value==='known'?'Known first depth selects the initial cycle; it cannot repair a later aliased jump.':'Without an anchor, a global integer number of wavelengths remains unknown.',gx,h-10);return;
    }
    const gx=58,gy=44,gw=w-87,gh=h-174,top=Math.max(span,model.beatRange)*1.04,px=z=>gx+z/span*gw,py=z=>gy+gh-z/top*gh;ctx.font='12px system-ui';ctx.fillStyle='#cfdae4';ctx.fillText('Recovered depth (m)',gx,22);line(ctx,[[gx,gy],[gx,gy+gh],[gx+gw,gy+gh]],'#91aac965');
    for(let i=0;i<=4;i++){const z=top*i/4;line(ctx,[[gx,py(z)],[gx+gw,py(z)]],'#7c96aa25');ctx.fillStyle='#91a9ba';ctx.fillText(z.toFixed(1),gx-40,py(z)+4);ctx.fillText((span*i/4).toFixed(1),gx+i*gw/4-8,gy+gh+23);}
    line(ctx,[[px(0),py(0)],[px(span),py(span)]],'#80e9d0',2.5);
    const curves=[[],[]];let prev=null;for(let i=0;i<=600;i++){const z=i/600*span,phase1=noise*Math.sin(z*2.4),phase2=noise*Math.cos(z*1.7+.4),s=estimate(z,freq,diff,phase1,phase2);for(let k=0;k<2;k++){const value=k?s.beat:s.single,range=k?model.beatRange:model.singleRange;if(prev&&Math.abs(value-prev[k])>range*.6){line(ctx,curves[k],k?'#efc67c':'#b29ae9',k?2:1.6);curves[k]=[];}curves[k].push([px(z),py(value)]);}prev=[s.single,s.beat];}curves.forEach((c,k)=>line(ctx,c,k?'#efc67c':'#b29ae9',k?2:1.6));
    const by=gy+gh+46,bh=21;ctx.fillStyle='#aec2ce';ctx.fillText('True depth →',gx+gw-80,gy+gh+24);ctx.fillStyle='#83e6ce';ctx.fillText('True',gx,by);ctx.fillStyle='#baa5ec';ctx.fillText('One frequency',gx+65,by);ctx.fillStyle='#f0cd86';ctx.fillText('Phase difference',gx+186,by);
    for(let k=0;k<2;k++)for(let i=0;i<Math.ceil(gw);i++){const z=i/gw*span,s=estimate(z,freq,diff),phase=k?wrap(s.p2-s.p1):s.p1;ctx.fillStyle=`hsl(${phase/TAU*360} 68% 54%)`;ctx.fillRect(gx+i,by+13+k*(bh+8),1.1,bh);}
    ctx.fillStyle='#b8cbd3';ctx.fillText('Phase hue: top single frequency · bottom phase difference',gx,h-12);
  });
})();
