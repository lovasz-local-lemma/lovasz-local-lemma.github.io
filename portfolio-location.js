/* A small location diagram, not a second menu. Only Portfolio is a navigation node. */
(() => {
  const root=new URL('./',document.currentScript.src);
  const groups={hero:['Overview','◈'],signature:['Selected','✦'],research:['Research','◇'],graphics:['More graphics','◈'],mathematics:['More math','π'],algorithms:['More algorithms','⌘'],hobby:['Open explorations','◉'],topics:['Techniques','∿'],connections:['Connections','⌁'],about:['About','◌']};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
  function create({group='hero',title='Overview',thumbnail='',mode='Project',home,back=false,compact=false}={}){
    const nav=el('nav','portfolio-route'+(compact?' route-compact':' site-nav'));nav.setAttribute('aria-label','Portfolio location');nav.dataset.routeGroup=group;
    const path=el('div','route-path');nav.append(path);
    const homeNode=el('a','route-node route-home');homeNode.href=home||new URL('index.html',root);homeNode.setAttribute('aria-label','Portfolio');
    const mark=el('img','route-mark');mark.src=new URL('media/identity/portfolio-mark.svg',root);mark.alt='';mark.width=52;mark.height=52;
    const homeCopy=el('span','route-copy');homeCopy.append(el('small','','WORK / IDEAS'),el('strong','',"Shaojie Jiao's Portfolio"));homeNode.append(mark,homeCopy);path.append(homeNode);
    for(const key of ['group','project']){
      const wire=el('span','route-wire');wire.setAttribute('aria-hidden','true');wire.append(el('i',''),el('b',''));path.append(wire);
      const node=el('div','route-node route-'+key);node.append(el('span','route-glyph',key==='group'?'✦':'◈'));
      const copy=el('span','route-copy');copy.append(el('small','',key==='group'?'Collection':'Project'),el('strong','',key==='group'?'Selected':title));node.append(copy);path.append(node);
    }
    const end=el('div','route-end');const meter=el('span','route-meter');meter.setAttribute('aria-hidden','true');for(let i=0;i<9;i++)meter.append(el('i',''));end.append(meter);
    if(back){const a=el('a','route-back','← Back to portfolio');a.href=home||new URL('index.html',root);end.append(a);}nav.append(end);
    update(nav,{group,title,thumbnail,mode},true);return nav;
  }
  function update(nav,{group='hero',title='Overview',thumbnail='',mode='Project'},immediate=false){
    const identity=JSON.stringify([group,title,thumbnail,mode]);if(nav.dataset.routeIdentity===identity)return;nav.dataset.routeIdentity=identity;
    nav.dataset.routeGroup=group;
    const groupNode=nav.querySelector('.route-group');const projectNode=nav.querySelector('.route-project');if(!groupNode||!projectNode)return;
    const groupInfo=window.PortfolioHomeGroups?.[group]||groups[group]||[group,'◇'];
    groupNode.querySelector('strong').textContent=groupInfo[0];groupNode.querySelector('.route-glyph').textContent=groupInfo[1];
    const modeLabel=projectNode.querySelector('small');modeLabel.textContent=mode;modeLabel.hidden=!mode;
    projectNode.querySelector('strong').textContent=title;projectNode.title=title;
    let img=projectNode.querySelector('.route-thumb');
    if(thumbnail){if(!img){img=el('img','route-thumb');img.alt='';img.width=42;img.height=42;projectNode.prepend(img);}img.src=new URL(thumbnail,root);img.hidden=false;}
    else if(img)img.hidden=true;
    projectNode.querySelector('.route-glyph').hidden=Boolean(thumbnail);
    if(!immediate&&!reduced.matches){projectNode.getAnimations().forEach(a=>a.cancel());projectNode.animate([{opacity:.35},{opacity:1}],{duration:450,easing:'ease-out'});}
  }
  window.PortfolioLocation={create,update};
  function ready(){
    const nav=document.querySelector('.site-nav.portfolio-route');if(!nav)return;
    if(document.body.dataset.page!=='home')return;
    const index=document.getElementById('project-index');const projects=new Map((index?JSON.parse(index.textContent):[]).map(p=>[p.id,p]));
    const sections=[...document.querySelectorAll('main>.hero-section,main>.content-section,main>.about-section')];
    let hovered=null,queued=false;
    function refresh(){
      queued=false;let section=sections[0];for(const s of sections)if(s.getBoundingClientRect().top<Math.max(160,innerHeight*.3))section=s;
      if(!section)return;
      const p=projects.get(hovered);if(p&&section.contains(document.getElementById('project-'+p.id))){update(nav,{group:section.id,title:p.title,thumbnail:p.thumbnail,mode:'In view'});return;}
      const count=section.querySelectorAll('.project-card').length;
      const title=count?`${count} projects`:({hero:'Home',topics:'Shared methods',connections:'Follow an idea',about:'Behind the work'})[section.id]||section.querySelector('h2')?.textContent||'Overview';
      update(nav,{group:section.id,title,mode:section.id==='hero'?'':count?'Collection':'In view'});
    }
    const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(refresh);}};
    document.querySelectorAll('.project-card').forEach(card=>{
      const select=()=>{hovered=card.dataset.project;schedule();};card.addEventListener('pointerenter',select);card.addEventListener('focusin',select);
      card.addEventListener('pointerleave',()=>{hovered=null;schedule();});card.addEventListener('focusout',()=>{hovered=null;schedule();});
    });
    addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule,{passive:true});refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
