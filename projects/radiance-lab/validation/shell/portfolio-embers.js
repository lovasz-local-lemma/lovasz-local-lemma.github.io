/* Cached sprites and three depth planes: one bounded Canvas2D pass. */
(() => {
  'use strict';
  const defaults = {density:100,size:125,brilliance:135,softness:65,depth:100,speed:85,trails:115,haze:85,roundness:100,...window.PortfolioVisualDefaults?.settings?.atmosphere?.sparks};
  const controls = [
    ['density','Spark count',40,170],['size','Spark size',60,200],
    ['brilliance','Hot highlights',50,200],['softness','Near blur',0,100],
    ['depth','Depth / parallax',0,150],['speed','Rising speed',35,160],
    ['trails','Trail length',0,200],['haze','Ambient glow',0,150],
    ['roundness','Spark roundness',0,100]
  ];
  const presets = {
    campfire:{label:'Campfire · layered',values:defaults},
    fine:{label:'Fine & distant',values:{...defaults,density:120,size:85,brilliance:100,softness:25,depth:60,haze:55}},
    close:{label:'Close embers',values:{...defaults,density:85,size:160,brilliance:165,softness:85,depth:135,haze:110}}
  };
  const normalize = value => Object.fromEntries(controls.map(([key,,min,max]) =>
    [key,Number.isFinite(value?.[key])?Math.min(max,Math.max(min,value[key])):defaults[key]]));
  function create(ctx){
    const random=(lo,hi)=>lo+Math.random()*(hi-lo);
    const sprite=(rgb,soft)=>{
      const image=document.createElement('canvas');image.width=image.height=96;
      const c=image.getContext('2d'),g=c.createRadialGradient(48,48,0,48,48,48);
      g.addColorStop(0,soft?`rgba(${rgb},.62)`:'#fff9dc');
      g.addColorStop(soft ? .16 : .035,soft?`rgba(${rgb},.46)`:'#fff0ad');
      g.addColorStop(soft ? .35 : .10,`rgba(${rgb},${soft ? .19 : .68})`);
      g.addColorStop(.58,`rgba(${rgb},.07)`);g.addColorStop(1,`rgba(${rgb},0)`);
      c.fillStyle=g;c.fillRect(0,0,96,96);return image;
    };
    const colors=['255,184,66','255,218,124','246,113,30','202,71,16'];
    const sharp=colors.map(c=>sprite(c,false)),soft=colors.map(c=>sprite(c,true));
    const mist=document.createElement('canvas');mist.width=mist.height=128;
    const m=mist.getContext('2d'),g=m.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,'#ca7d2850');g.addColorStop(.4,'#a967221d');g.addColorStop(1,'#80501600');
    m.fillStyle=g;m.fillRect(0,0,128,128);
    let w=1,h=1,embers=[],pointerX=0,pointerY=0,px=0,py=0,lastTime=0;
    const points=12;
    const lane=(i,t)=>w*[.12,.48,.88][i]+Math.sin(t*.13+i*2.2)*w*.065;
    const reset=(e,scatter=false)=>{
      const d=Math.random();e.layer=d<.45?0:d<.85?1:2;
      e.z=[.15,.52,1][e.layer];e.lane=Math.floor(Math.random()*3);
      e.x=Math.random()<.82?lane(e.lane,lastTime)+random(-w*.17,w*.17):random(0,w);
      e.y=scatter?random(-20,h+20):h+random(12,55);
      e.phase=random(0,Math.PI*2);e.wind=random(-8,8);
      e.streak=Math.random()<.09;e.hot=Math.random()<.13;
      e.speed=random(18,32)+e.z*42;if(e.streak)e.speed*=1.7;
      e.vx=e.wind;e.vy=e.speed;e.age=scatter?random(1,4):0;
      e.life=h/e.speed*random(1.25,2.0);
      e.size=[random(7,13),random(14,25),random(29,49)][e.layer];
      e.brightness=random(.45,1)*(e.hot?1.65:1);
      e.soft=Math.random();e.tint=Math.floor(Math.random()*3);
      e.trail=e.streak||(e.layer===1&&Math.random()<.65)||(e.layer===2&&Math.random()<.32);
      e.xs||=new Float32Array(points);e.ys||=new Float32Array(points);
      e.xs.fill(e.x);e.ys.fill(e.y);return e;
    };
    // Pointer motion only sets a target; it never allocates or starts another clock.
    addEventListener('pointermove',e=>{pointerX=e.clientX/Math.max(1,w)-.5;pointerY=e.clientY/Math.max(1,h)-.5;},{passive:true});
    const ensureCount=n=>{while(embers.length<n)embers.push(reset({},true));};
    return {
      resize(width,height){w=width;h=height;embers.forEach(e=>reset(e,true));},
      paint({width,height,time,dt,animate,reduced,settings,heat}){
        w=width;h=height;lastTime=time;
        const s=settings||defaults;
        const base=Math.min(w<760?38:94,Math.max(34,w*h/19000+16));
        const count=Math.round(Math.min(reduced?30:(w<760?62:150),base*s.density/100));
        ensureCount(count);
        ctx.clearRect(0,0,w,h);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
        heat?.(ctx,w,h,time,.45);
        // A broad warm veil, kept below the sparks and rendered from one cached sprite.
        for(let i=0;i<4;i++){
          const scale=Math.min(900,w*.72),x=lane(i%3,time*.7),y=h*(i===3?.24:.87)+Math.sin(time*.18+i)*h*.05;
          ctx.globalAlpha=(i===3?.18:.58)*s.haze/100*(.9+.1*Math.sin(time*.8+i));
          ctx.drawImage(mist,x-scale*.55,y-scale*.29,scale*1.1,scale*.72);
        }
        if(animate){const blend=Math.min(1,dt*2.2);px+=(pointerX-px)*blend;py+=(pointerY-py)*blend;}
        ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
        const step=dt*s.speed/100;
        // Draw far to near. The small population makes three linear passes cheaper
        // than allocating/sorting a draw list every frame.
        for(let layer=0;layer<3;layer++)for(let i=0;i<count;i++){
          const e=embers[i];if(e.layer!==layer)continue;
          if(animate){
            e.age+=step;
            const distance=(e.x-lane(e.lane,time))/Math.max(60,w*.09);
            const updraft=1/(1+distance*distance),lower=Math.max(0,1-(h-e.y)/(h*.55));
            const curl=Math.sin(time*1.1+e.phase+e.y*.012)*(10+e.z*24);
            const vx=e.wind+curl+Math.sin(time*2.2+e.phase)*lower*10;
            const vy=e.speed*(1+updraft*.32+lower*Math.max(0,Math.sin(time*1.2+e.lane*2))**5*.65);
            e.vx+=(vx-e.vx)*Math.min(1,step*2.7);e.vy+=(vy-e.vy)*Math.min(1,step*2.1);
            e.x+=e.vx*step;e.y-=e.vy*step;
            if(e.age>e.life||e.y< -65||e.x< -70||e.x>w+70)reset(e);
            for(let j=points-1;j>0;j--){e.xs[j]=e.xs[j-1];e.ys[j]=e.ys[j-1];}
            e.xs[0]=e.x;e.ys[0]=e.y;
          }
          const fade=Math.min(1,e.age/.8)*Math.min(1,Math.max(0,(e.life-e.age)/1.5))*Math.min(1,Math.max(0,(e.y+50)/110));
          const flicker=.8+.13*Math.sin(time*(e.hot?8:4)+e.phase)+.07*Math.sin(time*11+i);
          const alpha=Math.min(1,fade*flicker*e.brightness*[.55,.9,.85][e.layer]*s.brilliance/100);
          if(alpha<.01)continue;
          const offsetX=reduced?0:px*e.z*32*s.depth/100,offsetY=reduced?0:py*e.z*20*s.depth/100;
          const x=e.x+offsetX,y=e.y+offsetY;
          const blur=e.layer===2&&e.soft<s.softness/100;
          const size=e.size*s.size/100*(1+(s.depth/100-1)*e.z*.4);
          const cooling=e.age/e.life;const color=cooling>.75?3:e.tint;
          if(e.trail&&s.trails>0&&!blur){
            ctx.beginPath();ctx.moveTo(x,y);
            for(let j=1;j<points;j++)ctx.lineTo(x+(e.xs[j]-e.x)*s.trails/100,y+(e.ys[j]-e.y)*s.trails/100);
            ctx.globalAlpha=alpha*.16;ctx.strokeStyle='#ed9d3e';ctx.lineWidth=e.streak?3.6:1.8;ctx.stroke();
            ctx.globalAlpha=alpha*.65;ctx.strokeStyle=e.hot?'#fff1be':'#ffd383';ctx.lineWidth=e.streak?1:.55;ctx.stroke();
          }
          ctx.globalAlpha=alpha;
          const image=blur?soft[color]:sharp[color],baseStretch=blur?1:(e.streak?1.65:1.15);
          const stretch=1+(baseStretch-1)*(1-s.roundness/100);
          ctx.drawImage(image,x-size/2,y-size*stretch/2,size,size*stretch);
          if(!blur&&e.hot){
            const core=Math.max(.55,size*.035),coreStretch=1+.46*(1-s.roundness/100);
            ctx.globalAlpha=alpha*.9;ctx.fillStyle='#fff9e3';ctx.beginPath();ctx.ellipse(x,y,core,core*coreStretch,0,0,Math.PI*2);ctx.fill();
          }
        }
        ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
      }
    };
  }
  window.PortfolioEmbers={create,defaults,presets,controls,normalize};
})();
