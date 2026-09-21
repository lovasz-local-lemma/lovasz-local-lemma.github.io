/* Resolve catalog routes from this script, including when opened inside a brochure. */
const portfolioBrochureRoot = new URL('./',document.currentScript.src);
document.addEventListener('DOMContentLoaded', () => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const index=document.getElementById('project-index');
  const records=new Map((index?JSON.parse(index.textContent):[]).map(p=>[p.id,p]));
  const cards=[...document.querySelectorAll('[data-hand-card]')];
  const reveal=id=>{
    cards.forEach(card=>card.classList.toggle('is-front',card.dataset.handCard===id));
  };
  cards.forEach(card=>{
    card.addEventListener('pointerenter',()=>reveal(card.dataset.handCard));
    card.addEventListener('focusin',()=>reveal(card.dataset.handCard));
  });
  document.querySelector('.hero-feature')?.addEventListener('pointerleave',()=>reveal('radiance-lab'));
  reveal('radiance-lab');
  const modal=document.querySelector('.overview-dialog');
  const target=modal?.querySelector('.overview-content');
  let opener=null, closing=false;
  const el=(tag,text,className)=>{const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;};
  const link=(label,href)=>{const a=el('a',label,'launch-item');a.href=new URL(href,portfolioBrochureRoot);return a;};
  function contextIntro(record){
    const context=el('aside','','project-context');context.setAttribute('aria-label','Start here: the idea and what to watch');
    for(const [key,label] of [['idea','The idea'],['watch','What to watch']]){
      const paragraph=el('p','',key==='watch'?'project-context-watch':'');
      paragraph.append(el('strong',label),el('span',record[key]));context.append(paragraph);
    }
    if(record.links?.length){
      const resources=el('div','','project-context-links');resources.setAttribute('aria-label','Optional background resources');
      record.links.forEach(source=>{const a=el('a',source.label+' ↗');a.href=source.href;a.target='_blank';a.rel='noopener noreferrer';a.append(el('small',source.credit+' · external'));resources.append(a);});
      context.append(resources);
    }
    return context;
  }
  function overviewLab(p, example) {
    const card=el('section','','interactive-study overview-lab is-suspended');
    const ident='overview-lab-'+p.id;
    card.id=ident;card.dataset.labSrc=new URL(example.src,portfolioBrochureRoot).href;
    card.dataset.labSelected=ident;card.dataset.labPreview=example.preview||'poster';
    card.style.setProperty('--lab-height',String(example.height||560)+'px');
    const heading=el('div','','lab-heading');heading.append(el('span','↔','lab-mark'));
    const copy=el('div','');copy.append(el('span','Interactive example','eyebrow'),el('h3',example.title));heading.append(copy);
    const view=el('div','','lab-view-copy');view.append(el('h4',example.title,'lab-view-title'));
    const actions=el('div','','lab-actions');
    const run=el('button','Run now ↗');run.type='button';run.dataset.labToggle='';run.setAttribute('aria-pressed','false');run.setAttribute('aria-controls',ident+'-frame');
    const reset=el('button','Reset ↺','lab-reset');reset.type='button';reset.dataset.labReset='';reset.setAttribute('aria-controls',ident+'-frame');
    const open=el('a','Open separately ↗');open.dataset.labOpen='';open.href=card.dataset.labSrc;open.target='_blank';open.rel='noopener';
    actions.append(run,reset,open,el('span','Suspended · hover to run','lab-state'));
    const frame=el('div','','lab-frame');frame.id=ident+'-frame';frame.setAttribute('role','region');frame.setAttribute('aria-label',example.title);
    const poster=document.createElement('img');poster.className='lab-poster';poster.src=new URL(example.poster||p.thumbnail,portfolioBrochureRoot);poster.alt=example.title+' preview';poster.loading='lazy';poster.decoding='async';poster.width=1280;poster.height=720;
    const live=el('div','','lab-live');live.inert=true;frame.append(poster,live,el('span','Move inside to explore','lab-preview-label'));
    const status=el('p','Explore this example here, or open it separately. Use Run now to start.','lab-status');status.setAttribute('role','status');
    card.append(heading,view,actions,frame,status);return card;
  }
  function openOverview(id,button){
    const p=records.get(id);if(!p||!modal||closing)return;
    window.PortfolioLabs?.unmount(target);
    opener=button;target.replaceChildren();target.removeAttribute('aria-busy');
    const overview=p.overview||{summary:p.summary,steps:(p.workflow?.steps||[]).map(s=>({...s,text:s.detail}))};
    const masthead=el('header','','overview-masthead');const intro=el('div','','overview-intro');
    const title=el('h2',p.title);title.id='overview-title';
    const field=p.discipline||({research:'Research',graphics:'Graphics',mathematics:'Mathematics',algorithms:'Algorithms',hobby:'Explorations',signature:'Selected work'}[p.group])||p.language||'Project overview';
    intro.append(el('span',field,'eyebrow'),title,el('p',overview.summary,'overview-summary'));
    if(p.kicker){
      let punchline=window.PortfolioClaims?.createTrigger(p,'overview-punchline');
      if(!punchline){punchline=el('p',p.kicker,'overview-punchline');window.PortfolioPunchlineEditor?.decorate(punchline,p.id,'kicker',p.kicker);}
      intro.insertBefore(punchline,title);
    }
    if(p.status)intro.append(el('span',p.status,'project-status'));
    if(!p.overview)window.PortfolioPunchlineEditor?.decorate(intro.querySelector('.overview-summary'),p.id,'summary',p.summary);
    if(p.context)intro.append(contextIntro(p.context));
    masthead.append(intro);
    if(p.thumbnail){const cover=el('figure','','overview-cover');const img=document.createElement('img');img.src=new URL(p.thumbnail,portfolioBrochureRoot);img.alt=p.title+' showcase';img.decoding='async';cover.append(img);masthead.append(cover);}
    target.append(masthead);
    if(p.motivation){
      const reason=el('aside','','project-motivation');reason.dataset.motivationStatus=p.motivation.status;reason.setAttribute('aria-label','The idea behind the project');
      const heading=el('div','','motivation-heading');heading.append(el('span','The idea behind it'));
      if(p.motivation.status==='proposed')heading.append(el('span','Proposed wording · for review','motivation-review'));
      const takeaway=el('p','','motivation-takeaway');takeaway.append(el('span','Working intuition'),document.createTextNode(' '+p.motivation.takeaway));
      reason.append(heading,takeaway);target.append(reason);
      if(p.motivation.scope){const scope=el('p','','motivation-scope');scope.append(el('span','Deliberate scope'),document.createTextNode(' '+p.motivation.scope));reason.append(scope);}
      if(p.referencesHref){const sources=link('Related research & shader credits ↗',p.referencesHref);sources.className='motivation-references';reason.append(sources);}
    }
    const flow=el('section','','overview-flow');flow.setAttribute('aria-label','Capabilities at a glance');
    const ol=el('ol','','case-flow');
    overview.steps.forEach((step,i)=>{const li=el('li','');const symbol=el('span',step.symbol,'flow-symbol');symbol.setAttribute('aria-hidden','true');li.append(symbol,el('span',String(i+1).padStart(2,'0'),'flow-index'),el('h3',step.title),el('p',step.text));ol.append(li);});
    flow.append(ol);target.append(flow);
    if(overview.takeaway)target.append(el('p',overview.takeaway,'overview-takeaway'));
    const actions=el('div','','overview-actions');
    const live=p.delivery==='live';const offline=!live;
    actions.append(link(
      'Open brochure →',
      p.guideHref||p.href
    ));
    if(live)actions.append(link('Open the live project ↗',p.demoHref||p.href));
    else if(p.demoHref&&p.demoHref!==p.href)actions.append(link('Open the browser edition ↗',p.demoHref));
    if(p.technicalHref)actions.append(link('Technical docs · native implementation ↗',p.technicalHref));
    if(p.validationHref)actions.append(link('Validation · images & measurements ↗',p.validationHref));
    target.append(actions);
    const highlights=p.overviewMedia||[];
    if(highlights.length){const gallery=el('div','','overview-evidence');highlights.forEach(m=>{const fig=el('figure','',m.fullWidth?'overview-wide-figure':'');let media;if(m.kind==='video'){media=document.createElement('video');media.controls=true;media.playsInline=true;media.preload='none';if(m.poster)media.poster=new URL(m.poster,portfolioBrochureRoot);}else{media=document.createElement('img');media.alt=m.caption||p.title;media.loading='lazy';media.decoding='async';}media.src=new URL(m.src,portfolioBrochureRoot);fig.append(media);if(m.caption)fig.append(el('figcaption',m.caption));gallery.append(fig);});target.append(gallery);}
    if(overview.interactive)target.append(overviewLab(p,overview.interactive));
    document.querySelector('.gallery-panel')?.classList.remove('visible');
    document.body.classList.remove('gallery-open');
    if(!modal.open)modal.showModal();modal.scrollTop=0;
    window.PortfolioLabs?.setScope(modal);window.PortfolioLabs?.mount(target);
    requestAnimationFrame(()=>modal.classList.add('is-visible'));
  }
  // Capture precedes the site's ordinary page-transition handler.
  document.addEventListener('click',e=>{
    const control=e.target.closest('[data-overview]');
    if(!control||!records.has(control.dataset.overview)||e.button!==0||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
    e.preventDefault();e.stopPropagation();openOverview(control.dataset.overview,control);
  },true);
  async function close(){
    if(!modal?.open||closing)return;closing=true;
    // Pause every demo while retaining its last frame throughout the fade.
    window.PortfolioLabs?.setScope(modal.querySelector('.overview-heading'));
    modal.classList.remove('is-visible');
    if(!reduced.matches)await new Promise(resolve=>setTimeout(resolve,500));
    modal.close();window.PortfolioLabs?.unmount(target);target.replaceChildren();window.PortfolioLabs?.setScope(null);closing=false;opener?.focus({preventScroll:true});
  }
  modal?.querySelector('.close-overview').addEventListener('click',close);
  modal?.addEventListener('cancel',e=>{e.preventDefault();close();});
  modal?.addEventListener('click',e=>{if(e.target!==modal)return;const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();});
  const chooser=document.getElementById('card-presentation');
  const apply=value=>{document.body.dataset.cardStyle=['ribbon','glass','quiet'].includes(value)?value:'ribbon';if(chooser)chooser.value=document.body.dataset.cardStyle;};
  const authoredPresentation=window.PortfolioVisualDefaults?.settings?.cardPresentation||'ribbon';
  try{apply(localStorage.getItem('portfolio:card-presentation')||authoredPresentation);}catch{apply(authoredPresentation);}
  const setPresentation=value=>{apply(value);try{localStorage.setItem('portfolio:card-presentation',document.body.dataset.cardStyle);}catch{};document.dispatchEvent(new CustomEvent('portfolio:card-presentation',{detail:document.body.dataset.cardStyle}));};
  chooser?.addEventListener('change',()=>setPresentation(chooser.value));
  const labelKey='portfolio:card-labels:v1';
  const labelDefaults={ribbon:true,canonical:false,...window.PortfolioVisualDefaults?.settings?.cardLabels};
  let labels;
  const applyLabels=value=>{
    labels=Object.fromEntries(Object.entries(labelDefaults).map(([key,fallback])=>[key,typeof value?.[key]==='boolean'?value[key]:fallback]));
    document.body.dataset.cardRibbon=String(labels.ribbon);
    document.body.dataset.cardCanonical=String(labels.canonical);
    return {...labels};
  };
  try{applyLabels(JSON.parse(localStorage.getItem(labelKey)));}catch{applyLabels(labelDefaults);}
  const setLabels=value=>{
    applyLabels({...labels,...value});
    try{localStorage.setItem(labelKey,JSON.stringify(labels));}catch{/* Export retains the current choices. */}
    document.dispatchEvent(new CustomEvent('portfolio:card-labels',{detail:{...labels}}));
  };
  window.addEventListener('storage',event=>{
    if(event.key==='portfolio:card-presentation'){apply(event.newValue||authoredPresentation);document.dispatchEvent(new CustomEvent('portfolio:card-presentation',{detail:document.body.dataset.cardStyle}));}
    if(event.key===labelKey){try{applyLabels(JSON.parse(event.newValue));}catch{applyLabels(labelDefaults);}document.dispatchEvent(new CustomEvent('portfolio:card-labels',{detail:{...labels}}));}
  });
  window.PortfolioCardPresentation={set:setPresentation,setLabels,get labels(){return {...labels};}};
  const brochureRail=document.querySelector('.manual-navigation');
  if(brochureRail){
    const key='portfolio:brochure-content-width';
    const control=document.createElement('div');control.className='brochure-width-control';
    control.innerHTML='<label for="brochure-width">Content width <output id="brochure-width-value"></output></label><input id="brochure-width" type="range" min="45" max="85" step="1" aria-describedby="brochure-width-hint"><small id="brochure-width-hint">Screen width, excluding the elevator. Fits available space.</small><button type="button">Reset to 67%</button>';
    brochureRail.prepend(control);
    const slider=control.querySelector('input'),output=control.querySelector('output');
    const setWidth=(value,save=false)=>{
      const number=Number(value),width=Number.isFinite(number)?Math.max(45,Math.min(85,number)):67;
      slider.value=width;output.value=width+'%';document.documentElement.style.setProperty('--brochure-content-width',width+'vw');
      if(save)try{localStorage.setItem(key,String(width));}catch{}
      window.dispatchEvent(new Event('resize'));
    };
    let saved;try{saved=localStorage.getItem(key);}catch{}
    setWidth(saved===null||saved===undefined?67:saved);
    slider.addEventListener('input',()=>setWidth(slider.value,true));
    control.querySelector('button').addEventListener('click',()=>setWidth(67,true));
  }
  const chapters=[...document.querySelectorAll('.manual-chapter')];
  document.querySelectorAll('[data-media-comparison]').forEach(figure=>{
    const controls=figure.querySelector('.comparison-controls');
    const slider=controls.querySelector('input');
    const before=controls.querySelector('[data-comparison-before]').textContent;
    const after=controls.querySelector('[data-comparison-after]').textContent;
    const update=()=>{
      const value=Math.max(0,Math.min(100,Number(slider.value)));
      figure.style.setProperty('--comparison-position',value+'%');
      slider.setAttribute('aria-valuetext',`${value}% ${before}, ${100-value}% ${after}`);
    };
    update();
    slider.addEventListener('input',update);
    figure.classList.add('comparison-ready');
    controls.hidden=false;
  });
  const deckSwitch=document.querySelector('[data-brochure-switch]');
  const manual=document.getElementById('manual');
  if(deckSwitch&&manual){
    let manualTop=0,queued=false;
    const measure=()=>{
      manualTop=manual.getBoundingClientRect().top+scrollY;
      const rail=document.querySelector('.brochure-rail')?.getBoundingClientRect();
      if(rail&&innerWidth>760){
        deckSwitch.style.setProperty('--deck-switch-left',`${Math.max(12,rail.left)}px`);
        deckSwitch.style.setProperty('--deck-switch-width',`${Math.min(210,Math.max(180,rail.width))}px`);
      }
    };
    const update=()=>{
      queued=false;
      const inside=scrollY+Math.max(130,innerHeight*.18)>=manualTop;
      deckSwitch.dataset.mode=inside?'manual':'overview';
      deckSwitch.setAttribute('aria-label',inside?'Back to introduction':'Skip introduction');
      const label=deckSwitch.querySelector('strong');
      if(label)label.textContent=inside?'Back to introduction':'Skip introduction';
      deckSwitch.querySelector('small').textContent=inside?'↑ Introduction':'↓ Technical guide';
      deckSwitch.title=inside?'Back to introduction':'Skip introduction · open the technical guide';
    };
    const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(update);}};
    measure();update();
    deckSwitch.addEventListener('click',()=>{
      const target=deckSwitch.dataset.mode==='manual'?0:Math.max(0,manualTop-104);
      scrollTo({top:target,behavior:reduced.matches?'instant':'smooth'});
    });
    addEventListener('scroll',schedule,{passive:true});
    addEventListener('resize',()=>{measure();schedule();},{passive:true});
    document.addEventListener('toggle',()=>{measure();schedule();},true);
    addEventListener('load',()=>{measure();schedule();},{once:true});
    document.fonts?.ready.then(()=>{measure();schedule();});
  }
  const readingDetails=[...document.querySelectorAll('.manual-detail')];
  if(readingDetails.length){
    const status=document.querySelector('.reading-status');
    const report=()=>{if(status)status.textContent=`${readingDetails.filter(d=>d.open).length} / ${readingDetails.length} details open`;};
    document.querySelectorAll('[data-reading]').forEach(button=>button.addEventListener('click',()=>{
      readingDetails.forEach(detail=>{detail.open=button.dataset.reading==='all'||(button.dataset.reading==='explanations'&&detail.dataset.readingLayer==='explanation');});
      report();
    }));
    readingDetails.forEach(detail=>detail.addEventListener('toggle',report));
    // A directly linked detail should be readable, including when arriving from
    // browser history. Ordinary scrolling never changes the hash or scroll target.
    const revealLinkedDetail=()=>{
      let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}
      const target=document.getElementById(id);
      const detail=target?.closest('.manual-detail');
      if(detail){detail.open=true;report();}
    };
    addEventListener('hashchange',revealLinkedDetail);
    revealLinkedDetail();report();
    let printState;
    addEventListener('beforeprint',()=>{printState=readingDetails.map(d=>d.open);readingDetails.forEach(d=>{d.open=true;});});
    addEventListener('afterprint',()=>{readingDetails.forEach((d,i)=>{d.open=printState?.[i]??d.open;});});
  }
  const links=[...document.querySelectorAll('.manual-navigation nav a')];
  if(chapters.length){
    let queued=false;
    const update=()=>{queued=false;let current=chapters[0];for(const chapter of chapters)if(chapter.getBoundingClientRect().top<190)current=chapter;links.forEach(a=>{if(a.hash==='#'+current.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});};
    if(!document.querySelector('.brochure-rail')){addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(update);}},{passive:true});update();}
    // Only the recording currently being watched needs to decode frames.
    document.querySelectorAll('.manual-media video').forEach(video=>video.addEventListener('play',()=>document.querySelectorAll('.manual-media video').forEach(other=>{if(other!==video)other.pause();})));
  }
});
