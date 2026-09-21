/* Decorative expression forests. Geometry and glow sprites are cached; only
   their slow drift and travelling highlights change between frames. */
(() => {
    const hostVisibility = { visible: window === window.top };
    window.SymbolicHostVisibility = hostVisibility;
    document.documentElement.classList.toggle('host-suspended', !hostVisibility.visible);
    if (window !== window.top) addEventListener('message', event => {
        if (event.source !== window.parent || event.origin !== location.origin ||
            event.data?.type !== 'portfolio-lab-visibility' || typeof event.data.visible !== 'boolean') return;
        const visible = event.data.visible;
        if (hostVisibility.visible === visible) return;
        hostVisibility.visible = visible;
        document.documentElement.classList.toggle('host-suspended', !visible);
        dispatchEvent(new CustomEvent('symbolic-host-visibility'));
    });
    const boot = () => {
        if (document.getElementById('symbolic-atmosphere')) return;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', {alpha:true});
        if (!ctx) return;
        canvas.id = 'symbolic-atmosphere';
        canvas.setAttribute('aria-hidden','true');
        canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;';
        document.body.prepend(canvas);
        // One animated layer replaces the old large, blurred moving orbs.
        document.querySelector('.orbs')?.style.setProperty('display','none');
        document.querySelector('.background-gradient')?.style.setProperty('animation','none');
        const reduced = matchMedia('(prefers-reduced-motion: reduce)');
        let requested = true;
        try { requested = localStorage.getItem('symbolic:ambient-motion') !== 'off'; } catch {}
        const button = document.createElement('button');
        button.type='button';button.className='header-link atmosphere-toggle';
        document.querySelector('.header-tools')?.append(button);
        let frame=0, width=0, height=0, previous=0, time=0, contours=[], trees=[], sprites=[];
        let scrolling=false, scrollTimer=0;
        let colors=['#a597f0','#69cdbf','#a8bcef'];
        const symbols=['∫','+','×','x','sin','x','2','∂','+','x','1','ln','x','2','x'];
        function palette() {
            const css=getComputedStyle(document.body);
            colors=[css.getPropertyValue('--primary').trim()||colors[0],css.getPropertyValue('--accent').trim()||colors[1],'#a8bcef'];
            sprites=colors.map(color=>{
                const stamp=document.createElement('canvas');stamp.width=64;stamp.height=64;
                const paint=stamp.getContext('2d');const glow=paint.createRadialGradient(32,32,0,32,32,32);
                glow.addColorStop(0,color);glow.addColorStop(.12,color+'b0');glow.addColorStop(.45,color+'28');glow.addColorStop(1,color+'00');
                paint.fillStyle=glow;paint.fillRect(0,0,64,64);return stamp;
            });
        }
        function geometry() {
            width=innerWidth;height=innerHeight;
            const scale=Math.min(devicePixelRatio||1,1.25,1920/Math.max(1,width));
            canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
            ctx.setTransform(scale,0,0,scale,0,0);
            contours=Array.from({length:13},(_,i)=>{
                const path=new Path2D();
                for(let k=0;k<=60;k++){
                    const x=width*k/60;
                    const y=height*.66+(i-6)*18+Math.sin(k*.1+i*.12)*height*.08+Math.cos(k*.19)*13;
                    if(k===0)path.moveTo(x,y);else path.lineTo(x,y);
                }
                return path;
            });
            trees=[[-.025,.12,1],[.76,.07,.82],[.61,.68,1.08]].map(([x,y,size],group)=>{
                const nodes=Array.from({length:15},(_,i)=>{
                    const depth=Math.floor(Math.log2(i+1)), start=2**depth-1, count=2**depth;
                    return {x:((i-start+.5)/count-.5)*240*size,y:depth*64*size,label:symbols[(i+group*5)%symbols.length]};
                });
                return {x:width*x+90,y:height*y,nodes,group};
            });
            paint();
        }
        function paint() {
            ctx.clearRect(0,0,width,height);
            ctx.save();ctx.translate(0,Math.sin(time*.09)*8);ctx.lineWidth=.7;
            contours.forEach((path,i)=>{ctx.strokeStyle=colors[i%3];ctx.globalAlpha=.065;ctx.stroke(path);});ctx.restore();
            trees.forEach(tree=>{
                ctx.save();ctx.translate(tree.x+Math.sin(time*.09+tree.group)*10,tree.y+Math.cos(time*.08+tree.group)*12);
                ctx.strokeStyle=colors[tree.group%3];ctx.lineWidth=.8;
                const active=Math.floor(time*.32+tree.group*4)%14+1, phase=(time*.32)%1;
                tree.nodes.forEach((node,i)=>{
                    if(i){
                        const parent=tree.nodes[Math.floor((i-1)/2)];
                        ctx.globalAlpha=.22;ctx.beginPath();ctx.moveTo(parent.x,parent.y);ctx.lineTo(node.x,node.y);ctx.stroke();
                        if(i===active){
                            ctx.globalAlpha=.52;ctx.drawImage(sprites[tree.group%3],parent.x+(node.x-parent.x)*phase-12,parent.y+(node.y-parent.y)*phase-12,24,24);
                        }
                    }
                    ctx.globalAlpha=.15;ctx.drawImage(sprites[(i+tree.group)%3],node.x-13,node.y-13,26,26);
                    ctx.globalAlpha=.4;ctx.fillStyle=colors[(i+tree.group)%3];ctx.beginPath();ctx.arc(node.x,node.y,2,0,Math.PI*2);ctx.fill();
                    if(i<7){ctx.font='12px Georgia,serif';ctx.textAlign='center';ctx.globalAlpha=.25;ctx.fillText(node.label,node.x,node.y-9);}
                });ctx.restore();
            });
            ctx.globalAlpha=1;
        }
        function tick(now) {
            frame=0;
            if(document.hidden||reduced.matches||!requested||scrolling||!hostVisibility.visible)return;
            if(!previous||now-previous>=1000/30){
                if(previous)time+=Math.min(now-previous,100)/1000;
                previous=now;paint();
            }
            frame=requestAnimationFrame(tick);
        }
        function schedule() {
            cancelAnimationFrame(frame);frame=0;previous=0;
            const enabled=requested&&!reduced.matches;
            button.textContent=enabled?'Motion on':'Motion off';
            button.setAttribute('aria-pressed',String(enabled));
            button.setAttribute('aria-label',enabled?'Pause ambient motion':'Enable ambient motion');
            button.disabled=reduced.matches;
            button.title=reduced.matches?'Static background: reduced motion is enabled in your system settings.':'Animate the decorative expression field.';
            if(enabled&&!document.hidden&&!scrolling&&hostVisibility.visible)frame=requestAnimationFrame(tick);
        }
        button.addEventListener('click',()=>{requested=!requested;try{localStorage.setItem('symbolic:ambient-motion',requested?'on':'off');}catch{}schedule();});
        addEventListener('scroll',()=>{
            scrolling=true;
            document.documentElement.classList.add('is-scrolling');
            cancelAnimationFrame(frame);frame=0;
            clearTimeout(scrollTimer);
            scrollTimer=setTimeout(()=>{
                scrolling=false;
                document.documentElement.classList.remove('is-scrolling');
                schedule();
            },170);
        },{passive:true});
        addEventListener('resize',geometry,{passive:true});
        document.addEventListener('visibilitychange',schedule);
        addEventListener('symbolic-host-visibility',schedule);
        addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;});
        addEventListener('pageshow',schedule);
        reduced.addEventListener('change',schedule);
        new MutationObserver(()=>{palette();paint();}).observe(document.body,{attributes:true,attributeFilter:['class']});
        palette();geometry();schedule();
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
