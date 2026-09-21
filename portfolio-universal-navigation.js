/* The app and its brochure are siblings. Browser history remains browser history. */
(() => {
  if(window.parent!==window)return;
  const root=new URL('./',document.currentScript.src);
  const normalize=p=>decodeURI(p).replace(/\/$/,'/index.html');
  const path=normalize(location.pathname.slice(root.pathname.length));
  const query=new URLSearchParams(location.search);
  const matches=(window.PortfolioRoutes||[]).filter(r=>(r.prefix?path.startsWith(r.path):path===normalize(r.path))&&Object.entries(r.query).every(([k,v])=>query.get(k)===v));
  matches.sort((a,b)=>(!b.prefix-!a.prefix)||b.path.length-a.path.length||Object.keys(b.query).length-Object.keys(a.query).length);
  const entry=matches[0];
  const make=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text)e.textContent=text;return e;};
  const presentationKey='portfolio:navigation-presentation';
  const appTitleRegions={
    aperture:'#header',pipeline:'#app header:has(.identity)',
    'cpu-atelier':'header.masthead > .identity','analytical-render':'.brandbar > .brand',
    'inverse-render-lab':'.topbar > .brand',circle:'.site-header > .brand',
    balanceforge:'body > header.topbar > .brand,body > header.topbar > .topbar-status',
    membrane:'.panel-header > h1',hackenbush:'.hero-copy',
    symbolic_math:'header.glass-panel > h1','rubik-strategy':'.top-route-nav-brand',
    'inverse-mechanics':'#module-title','curve-atlas':'.atlas-nav > .brand-lockup',
    tracer_flatland:'body > header > .brand',
    fortune_crystal:'body > header > .identity,.masthead > .brand',
    'theory-workbench':'body > header > .identity,.masthead > .brand',
    complex_function:'#header > h1,#header > p',graph_algorithms:'.container > header > h1',
    trees:'.container > header > h1,.container > header > p',dft_dct:'.main-header > h1',
    prism_optics:'body > h1,body > h1 + p',
    image_processing:'body > .container > header.photo-hero',
    'clique-proofs':'#top > nav.topbar > a.brand,#top > .hero-copy > .eyebrow,#top > .hero-copy > h1',
    pi_collision:'#sim-title'
  };
  function installAppTitlePreferences(){
    const key='portfolio:app-title-preferences:v2';
    const expanded=new Set(['symbolic_math','inverse-mechanics','analytical-render','rubik-strategy','dft_dct','graph_algorithms']);
    const entries=Object.keys(appTitleRegions).map(id=>({id,title:(window.PortfolioRoutes||[]).find(r=>r.project===id)?.title||id,defaultCompact:!expanded.has(id)})).sort((a,b)=>a.title.localeCompare(b.title));
    let choices={};
    const clean=value=>Object.fromEntries(Object.entries(value&&typeof value==='object'?value:{}).filter(([id,v])=>Object.hasOwn(appTitleRegions,id)&&typeof v==='boolean'));
    try{choices=clean(JSON.parse(localStorage.getItem(key)||'{}'));}catch{}
    const get=id=>Object.hasOwn(choices,id)?choices[id]:!expanded.has(id);
    const notify=()=>document.dispatchEvent(new CustomEvent('portfolio:app-titles'));
    const save=()=>{try{localStorage.setItem(key,JSON.stringify(choices));}catch{}notify();};
    window.PortfolioAppTitles={entries,get,set(id,value){if(Object.hasOwn(appTitleRegions,id)){choices[id]=!!value;save();}},reset(){choices={};save();}};
    window.addEventListener('storage',event=>{if(event.key===key){try{choices=clean(JSON.parse(event.newValue||'{}'));}catch{choices={};}notify();}});
    notify();
  }

  function fork(live){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','route-fork');svg.setAttribute('viewBox',live?'0 0 58 64':'0 0 58 30');
    svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    const line=(d,kind,arrow)=>{
      for(const [path,ghost] of [[d,true],[d+' '+arrow,false]]){
        const p=document.createElementNS(svg.namespaceURI,'path');
        p.setAttribute('d',path);p.setAttribute('class','route-fork-line route-fork-'+kind+(ghost?' route-fork-echo':''));
        if(ghost)p.setAttribute('transform','translate(0 4)');
        if(entry?.kind===kind)p.classList.add('is-current');svg.append(p);
      }
    };
    if(live){
      line('M1 32 C19 32 19 15 32 15 H58','project','M33 11 L37 15 L33 19');
      line('M1 32 C19 32 19 49 32 49 H58','brochure','M33 45 L37 49 L33 53');
    }else line('M1 15 H58','brochure','M28 11 L32 15 L28 19');
    return svg;
  }

  function installPresentation(nav){
    const html=document.documentElement;
    let mode='top',height=0;
    try{if(localStorage.getItem(presentationKey)==='floating')mode='floating';}catch{/* Session-only controls still work. */}
    document.body.style.setProperty('--portfolio-original-padding-top',getComputedStyle(document.body).paddingTop);
    const toggle=make('button','route-presentation-toggle');toggle.type='button';
    nav.append(toggle);
    // Fit viewport-sized app roots without wrappers or reparenting.
    const adjusted=new WeakSet();
    function fitApps(){
      for(const node of document.body.children){
        // Decorative lift overlays already use viewport coordinates. Treating
        // the spark layer as an app toolbar shifts every spark by the nav height.
        if(node===nav||adjusted.has(node)||node.matches('.rail-aura,.rail-travel-sparks,.portfolio-stage-hint')||!['DIV','MAIN','CANVAS','ASIDE','SECTION','HEADER','NAV','BUTTON'].includes(node.tagName))continue;
        const css=getComputedStyle(node),box=node.getBoundingClientRect();
        if(Number(css.zIndex)<0)continue;
        const fullHeight=Math.abs(box.height-innerHeight)<=4;
        if(fullHeight&&(node.matches('#root,#app,#container,main,.app,.app-shell,canvas')||['fixed','absolute'].includes(css.position))){
          node.classList.add('portfolio-viewport-root');
          if(css.position==='fixed')node.classList.add('portfolio-fixed-root');
          adjusted.add(node);
        }else if(css.position==='fixed'&&css.top!=='auto'&&parseFloat(css.top)<100&&(css.transform==='none'||node.id==='modeSwitch')&&!node.matches('[role="dialog"],[aria-modal="true"]')){
          node.style.setProperty('--portfolio-toolbar-top',css.top);
          // getComputedStyle resolves an authored bottom:auto into the spare
          // viewport space. Reusing that as a margin collapses short toolbars.
          node.style.setProperty('--portfolio-toolbar-bottom','12px');
          node.classList.add('portfolio-fixed-toolbar');adjusted.add(node);
        }
      }
      for(const node of document.querySelectorAll('header,.topbar,.toolbar,.app-header,[role="banner"]')){
        if(nav.contains(node)||adjusted.has(node))continue;
        const css=getComputedStyle(node);
        if(css.position==='sticky'&&css.top!=='auto'&&parseFloat(css.top)<84){
          node.style.setProperty('--portfolio-sticky-top',css.top);node.classList.add('portfolio-sticky-header');adjusted.add(node);
        }
      }
    }
    fitApps();
    function measure(){
      const next=mode==='top'?Math.ceil(nav.getBoundingClientRect().height):0;
      if(next===height)return;
      height=next;html.style.setProperty('--portfolio-navigation-height',height+'px');
      window.dispatchEvent(new Event('resize'));
    }
    function apply(value,save=false){
      mode=value==='floating'?'floating':'top';
      nav.classList.toggle('universal-route-top',mode==='top');
      nav.classList.toggle('universal-route-dock',mode==='floating');
      nav.classList.toggle('route-compact',mode==='floating');
      html.dataset.portfolioNavigation=mode;
      toggle.textContent=mode==='top'?'Float':'Top';
      toggle.title=mode==='top'?'Use compact floating navigation · saved across pages':'Use the full top navigation · saved across pages';
      toggle.setAttribute('aria-label',mode==='top'?'Use floating navigation':'Use top navigation');
      toggle.setAttribute('aria-pressed',String(mode==='floating'));
      if(save)try{localStorage.setItem(presentationKey,mode);}catch{/* Optional persistence. */}
      measure();document.dispatchEvent(new CustomEvent('portfolio:navigation-presentation',{detail:mode}));
    }
    toggle.addEventListener('click',()=>apply(mode==='top'?'floating':'top',true));
    window.PortfolioNavigationPresentation={set:value=>apply(value,true),get current(){return mode;}};
    apply(mode);
    new ResizeObserver(measure).observe(nav);
    window.addEventListener('load',fitApps,{once:true});
    // Some app toolbars mount after the deferred portfolio scripts. Watching
    // direct children catches them without traversing every changing readout.
    const roots=new MutationObserver(records=>{
      if(records.some(r=>Array.from(r.addedNodes).some(n=>n.nodeType===1&&n!==nav)))fitApps();
    });
    roots.observe(document.body,{childList:true});
    window.addEventListener('pagehide',()=>roots.disconnect(),{once:true});
    window.addEventListener('storage',event=>{if(event.key===presentationKey)apply(event.newValue);});
  }

  function installAppTitle(nav){
    if(entry?.kind!=='project'||entry.project==='5D')return;
    const selector=appTitleRegions[entry.project];if(!selector)return;
    const html=document.documentElement;
    let parts=[],active=false;
    const slot=make('div','route-app-title');slot.dataset.app=entry.project;slot.hidden=true;
    const bundle=make(entry.project==='balanceforge'?'header':'div',entry.project==='balanceforge'?'topbar route-title-bundle':'route-title-bundle');
    slot.append(bundle);
    nav.insertBefore(slot,nav.querySelector('.route-end'));
    const toggle=make('button','route-presentation-toggle route-title-toggle');toggle.type='button';
    toggle.textContent='Compact';toggle.setAttribute('aria-label','Compact app title');toggle.hidden=true;
    nav.insertBefore(toggle,nav.querySelector('.route-presentation-toggle'));
    function update(){
      const requested=window.PortfolioAppTitles.get(entry.project);
      const next=Boolean(requested&&parts.length&&html.dataset.portfolioNavigation==='top'&&innerWidth>=1100);
      toggle.setAttribute('aria-pressed',String(requested));
      toggle.title=next?'Compact mode on · click to restore the separate app title':requested?'Compact mode resumes with wide top navigation':'Compact mode off · place the app title beside the navigation branches';
      if(next===active)return;
      active=next;
      if(active){
        slot.style.fontFamily=getComputedStyle(parts[0].node).fontFamily;
        for(const part of parts){
          bundle.append(part.node);
          if(part.link){for(const name of Object.keys(part.link))part.node.removeAttribute(name);part.node.dataset.portfolioTitleLabel='true';}
          part.source.classList.add('portfolio-title-vacated');
        }
        slot.hidden=false;html.dataset.portfolioMergedTitle=entry.project;
      }else{
        for(const part of parts){
          part.marker.parentNode?.insertBefore(part.node,part.marker.nextSibling);
          if(part.link){for(const [name,value] of Object.entries(part.link))if(value!==null)part.node.setAttribute(name,value);delete part.node.dataset.portfolioTitleLabel;}
          part.source.classList.remove('portfolio-title-vacated');
        }
        slot.hidden=true;delete html.dataset.portfolioMergedTitle;
      }
      window.dispatchEvent(new Event('resize'));
    }
    function findHeader(){
      const nodes=[...document.querySelectorAll(selector)];if(!nodes.length)return false;
      parts=nodes.map(node=>{
        const source=node.parentElement,marker=document.createComment('Original app title region');node.before(marker);
        const link=node.matches('a')?Object.fromEntries(['href','tabindex','title','role'].map(name=>[name,node.getAttribute(name)])):null;
        return {node,source,marker,link};
      });
      toggle.hidden=false;update();return true;
    }
    toggle.addEventListener('click',()=>window.PortfolioAppTitles.set(entry.project,!window.PortfolioAppTitles.get(entry.project)));
    document.addEventListener('portfolio:app-titles',update);
    document.addEventListener('portfolio:navigation-presentation',update);
    window.addEventListener('resize',update,{passive:true});
    if(!findHeader()){
      const observer=new MutationObserver(()=>{if(findHeader())observer.disconnect();});
      observer.observe(document.body,{childList:true,subtree:true});
      window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
    }
  }

  function installReturnCleanup(nav){
    const oldHidden=new WeakMap();
    const pagePath=url=>url.pathname.replace(/\/index\.html?$/i,'/');
    function duplicate(anchor){
      if(nav.contains(anchor)||anchor.closest('dialog'))return;
      const label=(anchor.textContent||'').trim();
      const named=/\b(?:back|return)\b[^\n]*\b(?:portfolio|(?:project\s+)?overview)\b/i.test(label+' '+(anchor.getAttribute('aria-label')||''))
        ||/^[\s←↩‹«]*\s*(?:portfolio|project overview|overview)(?:\s*[↗→＋+])?\s*$/i.test(label)
        ||anchor.matches('a.portfolio-return,a.portfolio-return-link');
      let match=false;
      if(named){
        try{
          const url=new URL(anchor.href);
          const targets=['index.html','Y3.html','y3.html',entry?.overview,entry?.brochure].filter(Boolean).map(p=>new URL(p,root));
          match=url.origin===root.origin&&targets.some(t=>pagePath(t).toLowerCase()===pagePath(url).toLowerCase());
        }catch{/* Keep an invalid or app-local destination visible. */}
      }
      if(match){
        if(!oldHidden.has(anchor))oldHidden.set(anchor,anchor.hidden);
        anchor.dataset.portfolioReturnDuplicate='true';anchor.hidden=true;
      }else if(oldHidden.has(anchor)){
        anchor.hidden=oldHidden.get(anchor);oldHidden.delete(anchor);delete anchor.dataset.portfolioReturnDuplicate;
      }
    }
    document.querySelectorAll('a[href]').forEach(duplicate);
    const observer=new MutationObserver(records=>{
      for(const record of records){
        if(nav.contains(record.target))continue;
        if(record.type==='attributes'){duplicate(record.target);continue;}
        const changed=record.target.nodeType===1?record.target.closest('a[href]'):null;if(changed)duplicate(changed);
        for(const node of record.addedNodes){
          if(node.nodeType!==1||nav.contains(node))continue;
          if(node.matches('a[href]'))duplicate(node);
          node.querySelectorAll('a[href]').forEach(duplicate);
        }
      }
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});
    window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
  }

  function installStageHint(nav){
    if(entry?.project!=='pipeline'||entry.kind!=='project')return;
    const key='portfolio:atelier-stage-hint:v1';
    try{if(localStorage.getItem(key)==='seen')return;}catch{}
    let hint=null,observer=null;
    function dismiss(){
      hint?.remove();hint=null;observer?.disconnect();
      document.removeEventListener('click',onClick,true);window.removeEventListener('resize',position);
      try{localStorage.setItem(key,'seen');}catch{}
    }
    function position(){
      if(!hint)return;
      const side=document.querySelector('.side-column')?.getBoundingClientRect();
      hint.style.top=Math.max(nav.getBoundingClientRect().bottom+12,side?.top||0)+'px';
      hint.style.left=Math.max(12,Math.min((side?.right||12)+12,innerWidth-320))+'px';
    }
    function onClick(event){if(event.target.closest('.side-column button.floor,.side-column nav.tabs button'))dismiss();}
    function show(){
      if(hint||!document.querySelector('.app[data-mode="pipeline"] .side-column button.floor')||!document.querySelector('.side-column nav.tabs button:not(:disabled)'))return;
      observer?.disconnect();
      hint=make('aside','portfolio-stage-hint');hint.setAttribute('role','note');hint.setAttribute('aria-label','Choose a stage');
      hint.append(make('strong','','Choose a stage'),make('p','','Click any floor number on the left to open that stage.'));
      const close=make('button','','Got it');close.type='button';close.addEventListener('click',dismiss);hint.append(close);
      document.body.append(hint);position();window.addEventListener('resize',position,{passive:true});
    }
    document.addEventListener('click',onClick,true);
    observer=new MutationObserver(show);observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','data-mode']});
    show();window.addEventListener('pagehide',()=>{observer.disconnect();document.removeEventListener('click',onClick,true);window.removeEventListener('resize',position);},{once:true});
  }

  function installCodeStats(nav){
    const key='portfolio:code-stats:v1';
    let enabled=false,data=null,pending=null,problem='',returnFocus=null;
    try{enabled=localStorage.getItem(key)==='on';}catch{/* Optional preference. */}
    const toggle=make('button','route-presentation-toggle route-code-toggle','Code');toggle.type='button';
    toggle.title='Languages used in this project';
    const meter=make('button','route-code-meter');meter.type='button';meter.hidden=true;
    meter.setAttribute('aria-haspopup','dialog');meter.setAttribute('aria-controls','portfolio-code-details');meter.setAttribute('aria-expanded','false');
    const summary=make('span','route-code-label'),bar=make('span','route-code-bar');bar.setAttribute('aria-hidden','true');meter.append(summary,bar);
    const anchor=nav.querySelector('.route-presentation-toggle');
    nav.insertBefore(meter,anchor);nav.insertBefore(toggle,anchor);
    const panel=make('section','route-code-panel');panel.id='portfolio-code-details';panel.hidden=true;panel.tabIndex=-1;
    panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','portfolio-code-heading');
    document.body.append(panel);
    // Keep the audited inventory intact; only recognized implementation languages enter this view.
    const implementationLanguages=new Set(['C','C++','GLSL','WGSL','HLSL','Metal','CUDA','TypeScript','JavaScript','Ruby','Crystal','Python','Rust','Go','C#','Java','Lua','Vue','Svelte','SQL']);
    const current=()=>entry&&entry.project!=='portfolio-self'?data?.projects?.[entry.project]:data?.website;
    const measured=row=>row?.status==='measured'&&Number.isSafeInteger(row.totalLines)&&row.totalLines>0&&Array.isArray(row.languages)&&row.languages.length>0&&row.languages.every(l=>typeof l.name==='string'&&Number.isSafeInteger(l.lines)&&l.lines>0)&&row.languages.reduce((sum,l)=>sum+l.lines,0)===row.totalLines;
    function distribution(row){
      if(!measured(row))return null;
      const languages=row.languages.filter(language=>implementationLanguages.has(language.name)).map(language=>({...language})).sort((a,b)=>b.lines-a.lines||a.name.localeCompare(b.name));
      if(!languages.length)return languages;
      // Broad relative presence, not a quantitative code-length chart.
      // Fixed tier weights keep a tiny contribution readable without implying exact shares.
      for(const language of languages){
        const relative=language.lines/languages[0].lines;
        language.weight=relative>=.5?8:relative>=.1?3:1;
      }
      const floor=Math.min(5,100/languages.length);
      const fixed=new Set();
      while(fixed.size<languages.length){
        const flexible=languages.filter(language=>!fixed.has(language));
        const remainingWeight=flexible.reduce((sum,language)=>sum+language.weight,0);
        const remainingWidth=100-fixed.size*floor;
        const small=flexible.filter(language=>language.weight/remainingWeight*remainingWidth<floor);
        if(!small.length)break;
        small.forEach(language=>fixed.add(language));
      }
      const flexibleWeight=languages.filter(language=>!fixed.has(language)).reduce((sum,language)=>sum+language.weight,0);
      for(const language of languages){
        language.displayShare=fixed.has(language)?floor:language.weight/flexibleWeight*(100-fixed.size*floor);
      }
      return languages;
    }
    function position(){
      if(panel.hidden)return;
      const rect=nav.getBoundingClientRect(),floating=document.documentElement.dataset.portfolioNavigation==='floating';
      panel.style.top=floating?'auto':Math.min(rect.bottom+8,innerHeight-120)+'px';
      panel.style.bottom=floating?Math.max(8,innerHeight-rect.top+8)+'px':'auto';
      panel.style.maxHeight=Math.max(100,floating?rect.top-16:innerHeight-rect.bottom-16)+'px';
    }
    function close(restore=false){
      panel.hidden=true;meter.setAttribute('aria-expanded','false');
      if(restore&&returnFocus?.isConnected)returnFocus.focus();
    }
    const languageColor=language=>/^#[0-9a-f]{6}$/i.test(language.color)?language.color:'#c9b781';
    function fillBar(target,languages){
      target.replaceChildren();
      for(const language of languages||[]){
        const segment=make('i','route-code-segment');
        segment.style.flexGrow=String(language.displayShare);segment.style.backgroundColor=languageColor(language);
        target.append(segment);
      }
    }
    function render(){
      const row=current(),languages=distribution(row),valid=!!languages?.length;
      summary.textContent=valid?'Languages':problem?'Unavailable':data?'No data':'Loading…';
      meter.title=valid?'Languages used in this project':problem||row?.scope||'Loading languages';
      meter.setAttribute('aria-label',valid?'Show implementation languages for '+row.title:'Show implementation-language details');
      fillBar(bar,languages);bar.classList.toggle('is-empty',!valid);
      if(panel.hidden)return;
      panel.replaceChildren();
      const head=make('div','route-code-head'),heading=make('h2','','Languages used in this project');heading.id='portfolio-code-heading';
      const closeButton=make('button','route-code-close','×');closeButton.type='button';closeButton.setAttribute('aria-label','Close code details');closeButton.addEventListener('click',()=>close(true));
      head.append(heading,closeButton);panel.append(head);
      if(!data){
        panel.append(make('p','route-code-status',problem||'Loading languages…'));
        if(problem){const retry=make('button','route-code-retry','Retry');retry.type='button';retry.addEventListener('click',load);panel.append(retry);}
        position();return;
      }
      if(valid){
        const list=make('ul','route-code-list');list.setAttribute('aria-label','Languages used in this project');
        for(const language of languages){
          const line=make('li','route-code-language'),swatch=make('span','route-code-swatch');
          swatch.style.backgroundColor=languageColor(language);swatch.setAttribute('aria-hidden','true');
          line.append(swatch,make('span','route-code-name',language.name));list.append(line);
        }
        panel.append(list);
      }else{
        panel.append(make('p','route-code-status',languages?'No recognized implementation languages in this source scope.':row?.status==='measured'?'Implementation-language data could not be verified.':row?.scope||'No measured implementation source is available for this project.'));
      }
      position();
    }
    async function load(){
      if(data)return;
      if(pending)return pending;
      problem='';render();
      pending=(async()=>{
        try{
          const response=await fetch(new URL('data/project-code-stats.json',root),{credentials:'same-origin'});
          if(!response.ok)throw new Error('Inventory unavailable');
          const next=await response.json();
          if(next?.version!==1||!next.projects||typeof next.projects!=='object')throw new Error('Unsupported inventory');
          data=next;
        }catch{problem='Source inventory is unavailable. Try again when the page is online.';}
        finally{pending=null;if(enabled)render();}
      })();
      return pending;
    }
    function open(){
      returnFocus=document.activeElement;panel.hidden=false;meter.setAttribute('aria-expanded','true');render();panel.focus({preventScroll:true});load();
    }
    function apply(value,save=false){
      enabled=value;toggle.setAttribute('aria-pressed',String(enabled));meter.hidden=!enabled;nav.classList.toggle('has-code-stats',enabled);
      if(save)try{localStorage.setItem(key,enabled?'on':'off');}catch{/* Session-only controls still work. */}
      if(enabled){render();load();}else close();
    }
    toggle.addEventListener('click',()=>{apply(!enabled,true);if(enabled)open();});
    meter.addEventListener('click',()=>panel.hidden?open():close(true));
    // Keep ordinary app shortcuts from reacting while these navigation controls have focus.
    for(const node of [toggle,meter,panel])node.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'&&!panel.hidden){event.preventDefault();close(true);}});
    document.addEventListener('pointerdown',event=>{if(!panel.hidden&&!panel.contains(event.target)&&!meter.contains(event.target)&&!toggle.contains(event.target))close();});
    window.addEventListener('resize',position,{passive:true});
    document.addEventListener('portfolio:navigation-presentation',position);
    window.addEventListener('storage',event=>{if(event.key===key)apply(event.newValue==='on');});
    apply(enabled);
  }

  function ready(){
    if(!window.PortfolioLocation)return;
    document.querySelectorAll('.compiled-portfolio-navigation').forEach(n=>n.remove());
    let nav=document.querySelector('body > .portfolio-route,body > .site-nav.portfolio-route');
    if(!nav){nav=PortfolioLocation.create({group:entry?.group||'hero',title:entry?.title||document.title.split('—')[0],thumbnail:entry?.thumbnail||'',mode:entry?'Project':'Page',home:new URL('index.html'+(entry?'#project-'+entry.project:''),root).href});document.body.append(nav);}
    if(nav.dataset.universalRoute)return;
    nav.dataset.universalRoute='true';
    if(entry){
      const group=nav.querySelector('.route-group');
      if(group&&group.tagName!=='A'){const link=make('a',group.className);link.href=new URL('index.html#'+entry.group,root);link.append(...group.childNodes);group.replaceWith(link);}
      const project=nav.querySelector('.route-project');
      if(project){
        const copy=project.querySelector('.route-copy');
        const name=project.querySelector('strong');if(name)name.textContent=entry.title;
        const label=project.querySelector('small');if(label)label.textContent=entry.kind==='overview'?'Overview':entry.kind==='brochure'?'Brochure':entry.kind==='study'?'Study':'Live project';
        const branch=make('div','route-branches');branch.setAttribute('aria-label',entry.title+' pages');
        branch.append(fork(entry.live));
        const options=entry.live?[['project','Project',entry.app],['brochure','Brochure',entry.brochure]]:[['brochure','Brochure',entry.brochure]];
        for(const [kind,text,href] of options){const a=make('a','route-branch',text);a.dataset.branch=kind;a.href=new URL(href,root);if(entry.kind===kind)a.setAttribute('aria-current','page');branch.append(a);}
        if(entry.overview!==entry.brochure){const overview=make('a','route-overview','Overview ＋');overview.href=new URL(entry.overview,root);if(entry.kind==='overview')overview.setAttribute('aria-current','page');copy?.append(overview);}
        project.append(branch);
      }
      nav.querySelectorAll('.route-home,.route-back').forEach(a=>{a.href=new URL('index.html#project-'+entry.project,root);});
    }
    installReturnCleanup(nav);
    installAppTitlePreferences();
    installPresentation(nav);
    installAppTitle(nav);
    installCodeStats(nav);
    installStageHint(nav);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
