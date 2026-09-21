/* Two independent hands use the free side of the viewport, not two rows. */
function layoutPreviewMagazine(items, width, height) {
  const cols=width<400?1:2,rows=Math.ceil(items.length/cols),gap=16;
  const cellWidth=(width-gap*(cols+1))/cols,cellHeight=(height-gap*(rows+1))/rows;
  return items.map((item,index)=>{
    const aspect=(item.width||16)/(item.height||10);
    const w=Math.min(cellWidth-6,(cellHeight-22)*aspect),h=w/aspect;
    return {x:gap+(index%cols)*(cellWidth+gap)+(cellWidth-w)/2,y:gap+Math.floor(index/cols)*(cellHeight+gap)+(cellHeight-h)/2,
      w,h,tilt:[-1.5,1.3,.9,-1.1][index%4],hand:'near',z:index+1,caption:true,fit:'contain',frameStyle:'quiet'};
  });
}
function layoutPreviewFans(items, width, height, right) {
  const count=items.length, nearCount=Math.ceil(count/2), direction=right?1:-1;
  return items.map((item,index)=>{
    const aspect=(item.width||16)/(item.height||10);
    let w,h,cx,cy,tilt,hand='near';
    if(count>3){
      const far=index>=nearCount, local=far?index-nearCount:index;
      const handCount=far?count-nearCount:nearCount;
      const progress=handCount===1?.5:local/(handCount-1);
      hand=far?'far':'near';
      w=Math.min(width*(far?.38:.40),far?400:440,height*(far?.43:.48)*aspect);
      h=w/aspect;
      // Each hand opens horizontally around a lower grip, like actual playing cards.
      // The second grip sits farther out and higher, with a wider spread and rotation.
      const spread=progress*2-1;
      tilt=spread*(far?26:20)*direction;
      const fanAngle=spread*(far?26:20)*Math.PI/180;
      const outward=width*((far?.66:.32)+spread*(far?.095:.065))+Math.sin(fanAngle)*h/2;
      cx=right?outward:width-outward;
      cy=height*(far?.44:.82)-Math.cos(fanAngle)*h/2;
    }else{
      const progress=count===1?.5:index/(count-1);
      w=Math.min(width*.88,520,height*(count<=2?.44:.36)*aspect);h=w/aspect;
      cx=width*.5-Math.sin(progress*Math.PI)*direction*width*.035;
      cy=count===1?height*.5:height*(.20+.60*progress);
      tilt=count===1?-2:(progress-.5)*direction*13;
    }
    const radians=Math.abs(tilt)*Math.PI/180;
    let boundW=Math.cos(radians)*w+Math.sin(radians)*h;
    let boundH=Math.sin(radians)*w+Math.cos(radians)*h;
    const fit=Math.min(1,(width-24)/boundW,(height-24)/boundH);
    w*=fit;h*=fit;boundW*=fit;boundH*=fit;
    cx=Math.max(12+boundW/2,Math.min(width-12-boundW/2,cx));
    cy=Math.max(12+boundH/2,Math.min(height-12-boundH/2,cy));
    return {x:cx-w/2,y:cy-h/2,w,h,tilt,hand,z:(hand==='near'?count:0)+index};
  });
}
document.addEventListener('DOMContentLoaded', () => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motion = window.PortfolioMotion;
  const indexElement = document.getElementById('project-index');
  const projects = indexElement ? JSON.parse(indexElement.textContent) : [];
  const records = new Map(projects.map(p => [p.id, p]));
  const panel = document.getElementById('galleryPanel');
  const dialog = document.querySelector('.preview-dialog');
  const layouts = window.PortfolioPreviewLayouts;
  let editingLayout=false;
  let manifestPromise, generation = 0, activeCard = null, focusGalleryTimer, galleryFrame=0;
  let pointerCard=null, focusedCard=null, activeItems=[], pointerPosition=null, dismissedCard=null;
  let galleryIntent='keyboard',scrollGuard=false;
  const cache = new Map();
  const labelFor = name => name.replace(/\.[^.]+$/, '').replaceAll('_', ' ');
  // The card surface follows the primary route. Its explicit links and editor
  // controls remain independent destinations and therefore win over this handler.
  document.querySelectorAll('.project-card[data-card-href]').forEach(card=>card.addEventListener('click',event=>{
    if(event.button!==0||event.defaultPrevented||event.target.closest('a,button,input,select,textarea,label,[contenteditable="true"]'))return;
    if(window.getSelection?.().toString())return;
    location.href=card.dataset.cardHref;
  }));
  async function mediaFor(id) {
    const record = records.get(id);
    if (Array.isArray(record?.previewGallery)) return record.previewGallery;
    if (record?.gallery?.length) return record.gallery;
    if (!record?.legacy) return [];
    if (!manifestPromise) manifestPromise = fetch('previews-manifest.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
    const manifest = await manifestPromise;
    return (manifest[id] || []).map(name => ({src: `previews/${id}/${encodeURIComponent(name)}`, caption: labelFor(name)}));
  }
  function loadMedia(item) {
    if (!cache.has(item.src)) cache.set(item.src, new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const frame=window.PortfolioMediaFrames?.lookup(item.src);
        resolve({...item, width:frame?.width||img.naturalWidth, height:frame?frame.height-frame.top:img.naturalHeight});
      };
      img.onerror = () => resolve(null);
      img.src = item.src;
    }));
    return cache.get(item.src);
  }
  function hideGallery() {
    clearTimeout(focusGalleryTimer);
    generation++; activeCard = null; activeItems=[];
    panel?.classList.remove('visible'); panel?.classList.remove('studio-preview-pinned'); document.body.classList.remove('gallery-open');
  }
  function figure(item, lazy = false) {
    const f = document.createElement('figure');
    const img = document.createElement('img');
    if (lazy) img.loading = 'lazy';
    if (item.width && item.height) { img.width=item.width; img.height=item.height; }
    img.src = item.src; img.alt = item.caption; img.decoding = 'async';
    const caption = document.createElement('figcaption'); caption.textContent = item.caption;
    f.append(img, caption); window.PortfolioMediaFrames?.apply(img); return f;
  }
  function galleryArea(card) {
    const rect = card.getBoundingClientRect();
    if(rect.bottom<100||rect.top>innerHeight)return false;
    const rail=document.querySelector('.section-rail');
    const railEdge=rail&&getComputedStyle(rail).display!=='none'?rail.getBoundingClientRect().right:0;
    const leftSpace = rect.left - Math.max(28,railEdge+28), rightSpace = innerWidth - rect.right - 28;
    const right = rightSpace >= leftSpace;
    const width = Math.min(1060,Math.max(220,right ? rightSpace : leftSpace));
    const left=Math.max(12,Math.min(innerWidth-width-12,right?rect.right+14:rect.left-width-14));
    const top=Math.max(94,(document.querySelector('.site-nav')?.getBoundingClientRect().bottom||0)+12);
    const height=Math.max(180,innerHeight-top-20);
    return {left,top,width,height,right,rect};
  }
  function positionGallery(card) {
    if (!panel || innerWidth <= 760 || dialog?.open || editingLayout) return;
    const area=galleryArea(card);if(!area)return false;
    const {left,top,width,height,right,rect}=area;
    const viewport={width:innerWidth,height:innerHeight};
    const anchor={x:rect.left,y:rect.top,width:rect.width,height:rect.height};
    // Read on reveal so edits made in another tab apply to the next group.
    // A group already on screen keeps its original viewport placement.
    const magazine=records.get(card.dataset.project)?.previewArrangement==='magazine';
    const arrangement=layouts?.resolveFor(card.dataset.project,activeItems,viewport,anchor,right?'right':'left');
    // A legacy pile containing removed Fortune images is kept in storage, but
    // doesn't override the newly curated four-print composition.
    const custom=(!magazine||arrangement?.layout.items.length===activeItems.length)?arrangement?.boxes:null;
    // Give authored groups the requested half-header breathing room in playback,
    // without rewriting their saved coordinates or moving individual pictures.
    const previewOffset=(document.querySelector('.site-nav')?.getBoundingClientRect().height||0)/2;
    panel.style.width = `${custom?innerWidth:width}px`;
    panel.style.left = `${custom?0:left}px`;panel.style.top=`${custom?previewOffset:top}px`;panel.style.height=`${custom?innerHeight:height}px`;
    panel.dataset.side=right?'right':'left';panel.dataset.hands=activeItems.length>3?'two':'one';
    const stage=panel.querySelector('.gallery-images');
    (custom||(magazine?layoutPreviewMagazine(activeItems,width,height):layoutPreviewFans(activeItems,width,height,right))).forEach(({x,y,w,h,tilt,z,hand,caption,opacity=1,fit='contain',frameStyle='glow'},i)=>{
      const item=activeItems[i];let f=stage.children[i];
      if(!f){f=figure(item);f.className='gallery-image';stage.append(f);}
      f.dataset.hand=hand;
      f.dataset.frameStyle=frameStyle;
      Object.assign(f.style,{left:`${x}px`,top:`${y}px`,width:`${w}px`,height:`${h}px`,transform:`rotate(${tilt}deg)`,zIndex:String(z),opacity:String(opacity)});
      f.querySelector('img').style.objectFit=fit;
      const crop=f.querySelector('.media-crop'),frame=window.PortfolioMediaFrames?.lookup(item.src);
      if(crop&&frame){
        const visibleHeight=frame.height-frame.top,innerWidth=Math.max(1,w-12),innerHeight=Math.max(1,h-12);
        const scale=(fit==='cover'?Math.max:Math.min)(innerWidth/frame.width,innerHeight/visibleHeight);
        Object.assign(crop.style,{width:`${frame.width*scale}px`,height:`${visibleHeight*scale}px`});
      }
      const label=f.querySelector('figcaption');if(label)label.hidden=caption===false;
    });
    return true;
  }
  let studioCard=null;
  document.addEventListener('portfolio:studio-card',e=>{
    studioCard?.classList.remove('studio-preview-selected');
    studioCard=e.detail;dismissedCard=null;
    if(studioCard){ensureEditor(studioCard);markLayout(studioCard.dataset.project);studioCard.classList.add('studio-preview-selected');showGallery(studioCard);}
    else hideGallery();
  });
  async function showGallery(card) {
    if(!panel||innerWidth<=760||dialog?.open||editingLayout||dismissedCard===card)return;
    // In Select/Note mode, moving onto another card must not replace the chosen fan.
    if(document.body.classList.contains('studio-picking')&&card!==studioCard)return;
    // A revealed arrangement belongs to the viewport, not the moving document.
    // Repeated hover/focus/scroll events must not resolve its anchor again.
    if(activeCard===card){if(card===studioCard)panel.classList.add('studio-preview-pinned');return;}
    if(activeCard)hideGallery();
    const token=++generation;activeCard=card;
    const entries=await mediaFor(card.dataset.project);
    if(token!==generation||activeCard!==card)return;
    const fallback=records.get(card.dataset.project)?.thumbnail||card.querySelector('.project-picture img')?.src;
    activeItems=entries;
    if(!activeItems.length&&fallback&&!Array.isArray(records.get(card.dataset.project)?.previewGallery))activeItems=[{src:fallback,caption:records.get(card.dataset.project)?.title||'Project preview'}];
    if(!activeItems.length){hideGallery();return;}
    panel.querySelector('.gallery-images').replaceChildren();
    if(!positionGallery(card)){hideGallery();return;}
    panel.classList.add('visible');if(card===studioCard)panel.classList.add('studio-preview-pinned');document.body.classList.add('gallery-open');
    // Show the hand immediately. One slow image must not hold every preview hostage.
    activeItems.forEach((item,index)=>loadMedia(item).then(loaded=>{
      if(token!==generation||activeCard!==card)return;
      // Remember dimensions for the next reveal. Never move an already visible
      // print when an image finishes decoding (especially on a slow connection).
      if(loaded)activeItems[index]=loaded;
    }));
  }
  function scheduleGalleryPosition() {
    if(galleryFrame)return;
    galleryFrame=requestAnimationFrame(()=>{
      galleryFrame=0;
      if(studioCard&&document.body.classList.contains('studio-on')&&!editingLayout&&!dialog?.open){showGallery(studioCard);return;}
      if(innerWidth<=760||dialog?.open||editingLayout){if(activeCard)hideGallery();return;}
      // A stationary pointer must never reveal a gallery while scrolling.
      // With no existing gallery there is nothing to retain or dismiss, so
      // avoid a full-page hit test (and the layout flush it can force).
      if(scrollGuard&&!activeCard)return;
      if(pointerPosition){
        pointerCard=document.elementFromPoint(pointerPosition.x,pointerPosition.y)?.closest('.project-card')||null;
      }
      if(scrollGuard){
        // Scrolling only checks whether the existing group still belongs here.
        // Do not open a new group as cards pass under a stationary pointer.
        if(activeCard){
          const bounds=activeCard.getBoundingClientRect();
          const retained=galleryIntent==='pointer'?pointerCard===activeCard:
            activeCard.contains(document.activeElement)&&bounds.bottom>100&&bounds.top<innerHeight;
          if(!retained)hideGallery();
        }
        return;
      }
      const card=pointerCard||(galleryIntent==='keyboard'?focusedCard:null);
      if(card&&card!==dismissedCard)showGallery(card);else if(activeCard)hideGallery();
    });
  }
  function scheduleFocusedGallery(card) {
    clearTimeout(focusGalleryTimer);
    focusGalleryTimer=setTimeout(()=>{
      const bounds=card.getBoundingClientRect();
      if(galleryIntent==='keyboard'&&card.contains(document.activeElement)&&bounds.bottom>100&&bounds.top<innerHeight)showGallery(card);
    },140);
  }
  document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('pointerenter', e => {
      if(e.pointerType==='touch')return;
      const moved=!pointerPosition||e.clientX!==pointerPosition.x||e.clientY!==pointerPosition.y;
      pointerPosition={x:e.clientX,y:e.clientY};pointerCard=card;galleryIntent='pointer';
      if(scrollGuard&&!moved){scheduleGalleryPosition();return;}
      scrollGuard=false;dismissedCard=null;showGallery(card);
    });
    card.addEventListener('pointerleave', () => {pointerCard=null;dismissedCard=null;scheduleGalleryPosition();});
    card.addEventListener('focusin', () => {focusedCard=card;dismissedCard=null;galleryIntent=pointerCard===card?'pointer':'keyboard';if(galleryIntent==='keyboard')scheduleFocusedGallery(card);});
    card.addEventListener('focusout', e => {if(!card.contains(e.relatedTarget)){focusedCard=null;scheduleGalleryPosition();}});
  });
  document.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch')return;
    const moved=!pointerPosition||e.clientX!==pointerPosition.x||e.clientY!==pointerPosition.y;
    pointerPosition={x:e.clientX,y:e.clientY};
    if(scrollGuard&&!moved)return;
    scrollGuard=false;galleryIntent='pointer';
    const card=e.target.closest?.('.project-card')||null;
    if(card!==pointerCard){pointerCard=card;dismissedCard=null;scheduleGalleryPosition();}
    else if(card&&activeCard!==card&&dismissedCard!==card)scheduleGalleryPosition();
  },{passive:true});
  document.documentElement.addEventListener('pointerleave',()=>{pointerPosition=null;pointerCard=null;scheduleGalleryPosition();});
  window.addEventListener('blur',()=>{pointerPosition=null;pointerCard=null;hideGallery();});
  // A resize invalidates the old viewport: dismiss instead of making it jump.
  window.addEventListener('resize',()=>{scrollGuard=true;hideGallery();},{passive:true});
  window.addEventListener('scroll',()=>{scrollGuard=true;scheduleGalleryPosition();},{passive:true});
  document.addEventListener('keydown', e => { if(e.key==='Escape'){dismissedCard=activeCard;hideGallery();} });
  function ensureEditor(card){
    if(card.querySelector('[data-layout-editor]'))return;
    const project=records.get(card.dataset.project);
    if(Array.isArray(project?.previewGallery)&&!project.previewGallery.length)return;
    const button=document.createElement('button');button.type='button';button.className='studio-preview-arrange';button.dataset.layoutEditor=card.dataset.project;
    button.textContent='Arrange previews';button.setAttribute('aria-label','Edit preview layout for '+(records.get(card.dataset.project)?.title||card.dataset.project));card.append(button);
  }
  document.querySelectorAll('.project-card[data-project]').forEach(ensureEditor);
  function markLayout(id){
    const saved=layouts?.load(id);
    document.querySelectorAll('[data-layout-editor]').forEach(button=>{
      if(button.dataset.layoutEditor!==id)return;
      button.classList.toggle('has-custom-preview',!!saved);
      button.title=saved?'Edit your saved preview layout':'Arrange the current hover-preview images';
    });
  }
  document.querySelectorAll('[data-layout-editor]').forEach(button=>markLayout(button.dataset.layoutEditor));
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-layout-editor]');if(!button)return;
      if(editingLayout||!window.PortfolioPreviewEditor)return;
      const card=button.closest('.project-card')||studioCard,project=records.get(button.dataset.layoutEditor);
      if(!card||!project||card.dataset.project!==project.id)return;
      editingLayout=true;hideGallery();button.disabled=true;
      try{
        const entries=await mediaFor(project.id);
        let items=entries;
        if(!items.length&&project.thumbnail&&!Array.isArray(project.previewGallery))items=[{src:project.thumbnail,caption:project.title}];
        if(!items.length)throw new Error('No preview images');
        // Use known dimensions immediately, with a short allowance for legacy images.
        const measured=await Promise.race([Promise.all(items.map(loadMedia)),new Promise(resolve=>setTimeout(()=>resolve(null),900))]);
        if(measured)items=items.map((item,i)=>measured[i]||item);
        card.scrollIntoView({block:'start',behavior:'instant'});
        await new Promise(requestAnimationFrame);
        const area=galleryArea(card);if(!area)throw new Error('Project is not visible');
        const viewport={width:innerWidth,height:innerHeight},rect=area.rect;
        const anchor={x:rect.left,y:rect.top,width:rect.width,height:rect.height},side=area.right?'right':'left';
        const magazine=project.previewArrangement==='magazine';
        const getBaseline=()=>{const a=galleryArea(card);return a?(magazine?layoutPreviewMagazine(items,a.width,a.height):layoutPreviewFans(items,a.width,a.height,a.right)).map(box=>({...box,x:box.x+a.left,y:box.y+a.top,caption:true,opacity:1,fit:'contain',frameStyle:box.frameStyle||'glow'})):[];};
        const baseline=getBaseline();
        let arrangement=layouts?.resolveFor(project.id,items,viewport,anchor,side);
        if(magazine&&arrangement?.layout.items.length!==items.length)arrangement=null;
        const boxes=arrangement?.boxes||baseline;
        const refreshContext=()=>{
          const a=galleryArea(card);if(!a)return null;
          const currentViewport={width:innerWidth,height:innerHeight},currentAnchor={x:a.rect.left,y:a.rect.top,width:a.rect.width,height:a.rect.height};
          return {viewport:currentViewport,anchor:currentAnchor,side:a.right?'right':'left',baseline:getBaseline()};
        };
        const opened=window.PortfolioPreviewEditor.open({project,card,items,boxes,baseline,getBaseline,refreshContext,viewport,anchor,side,
          orderMode:arrangement?.layout.orderMode||'manual',trigger:button,
          initialNotice:arrangement?.usedPublishedFallback?'Showing the published layout: this browser’s older draft uses different images. The older draft is kept until you edit or export this layout.':null,
          onChange:()=>markLayout(project.id),
          onClose:()=>{editingLayout=false;pointerPosition=null;pointerCard=null;focusedCard=null;dismissedCard=null;if(studioCard&&document.body.classList.contains('studio-picking'))showGallery(studioCard);}
        });
        if(!opened)throw new Error('Another preview editor is already open');
      }catch(error){editingLayout=false;button.title=`Unable to open layout editor: ${error.message}`;}
      finally{button.disabled=false;}
  });
  window.addEventListener('storage',event=>{
    if(event.key!==null&&event.key!=='portfolio:preview-layouts:v1')return;
    for(const id of records.keys())markLayout(id);
  });
  document.querySelectorAll('[data-preview]').forEach(button => button.addEventListener('click', async () => {
    hideGallery();
    const items = await mediaFor(button.dataset.preview);
    dialog.querySelector('#preview-title').textContent = records.get(button.dataset.preview)?.title || 'Project screenshots';
    const images=dialog.querySelector('.dialog-images');images.replaceChildren();
    items.forEach(item => images.append(figure(item, true)));
    if(!items.length) {const p=document.createElement('p');p.textContent='No screenshots are available for this project yet.';images.append(p);}
    if(!dialog.open)dialog.showModal();
    requestAnimationFrame(()=>dialog.classList.add('is-visible'));
  }));
  let closingPreview=false;
  async function closePreview(){
    if(!dialog?.open||closingPreview)return;
    closingPreview=true;dialog.classList.remove('is-visible');
    if(!reduced.matches)await new Promise(resolve=>setTimeout(resolve,210));
    dialog.close();closingPreview=false;
  }
  dialog?.querySelector('.close-preview').addEventListener('click',closePreview);
  dialog?.addEventListener('cancel',event=>{event.preventDefault();closePreview();});
  dialog?.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePreview();}});
  const results=document.querySelector('.technique-results');
  const normal=s=>String(s||'').trim().toLowerCase();
  const techniqueLookup=new Map();
  try{
    const connectionData=JSON.parse(document.getElementById('connection-index')?.textContent||'{}');
    for(const item of connectionData.techniques||[]){
      const label=item.label||item.id;
      for(const name of [item.id,item.label,...(item.aliases||[])])if(name)techniqueLookup.set(normal(name),label);
    }
  }catch{/* The project list remains usable if the connection index is unavailable. */}
  const canonicalTechnique=term=>techniqueLookup.get(normal(term))||term;
  let selectionVersion=0, selectedTerm=null, navigationVersion=0;
  function updateResults(update,keepMap){
    const map=keepMap?document.getElementById('connection-explorer'):null;
    const before=map?.getBoundingClientRect().top;
    update();
    if(map){
      const delta=map.getBoundingClientRect().top-before;
      if(Math.abs(delta)>.5)window.scrollBy({top:delta,behavior:'instant'});
    }
    if(origin)placeBookmark(origin);
  }
  async function clearTechniqueState({immediate=false,keepMap=false}={}){
    selectionVersion++;selectedTerm=null;
    document.querySelectorAll('.cloud-tag').forEach(b=>b.setAttribute('aria-pressed','false'));
    return motion.swap(results,()=>updateResults(()=>{if(results)results.hidden=true;},keepMap),{immediate,enter:false});
  }
  function resultTile(project) {
    const li=document.createElement('li');li.className='technique-card';
    const picture=document.createElement('a');picture.className='technique-picture';picture.href=project.demoHref||project.href;
    const offline=project.sourcePath?.startsWith('offline_projs/');
    picture.href=offline?project.href:project.demoHref||project.href;
    picture.setAttribute('aria-label',`Open ${project.title}${offline?' brochure':project.demoHref?' live demo':''}`);
    if(project.thumbnail){
      const img=document.createElement('img');img.src=project.thumbnail;img.alt='';img.width=480;img.height=270;img.loading='lazy';picture.append(img);
    }else{
      const equation=document.createElement('span');equation.className='technique-equation';equation.textContent='Kφ = λMφ';picture.append(equation);
    }
    const copy=document.createElement('div');copy.className='technique-copy';
    const title=document.createElement('a');title.className='technique-title';title.href=project.learnMoreHref||project.href;title.textContent=project.title;
    const meta=document.createElement('p');meta.textContent=(project.displayTags||project.tags||[]).slice(0,3).join(' · ');
    const actions=document.createElement('div');actions.className='technique-actions';
    const detail=document.createElement('a');detail.href=title.href;detail.textContent='Overview ＋';detail.dataset.overview=project.id;
    const connections=document.createElement('a');connections.href=`?project=${encodeURIComponent(project.id)}#connections`;connections.dataset.exploreProject=project.id;connections.textContent='Connections ⌁';connections.setAttribute('aria-label',`Explore connections for ${project.title}`);
    actions.append(detail,connections);copy.append(title,meta,actions);li.append(picture,copy);return li;
  }
  async function selectTechnique(term,scroll=true,{updateGraph=true,updateURL=true,immediate=false,keepMap=false}={}) {
    if(!results)return;
    term=canonicalTechnique(term);
    if(scroll)navigationVersion++;
    const version=++selectionVersion;
    selectedTerm=term;
    hideGallery();
    const matches=projects.filter(p=>(p.tags||[]).some(t=>normal(t)===normal(term)));
    document.querySelectorAll('.cloud-tag').forEach(b=>b.setAttribute('aria-pressed',String(normal(b.dataset.technique)===normal(term))));
    if(updateURL){const url=new URL(location.href);url.searchParams.set('technique',term);url.searchParams.delete('project');if(scroll)url.hash='topics';history.replaceState(null,'',url);}
    if(updateGraph)document.dispatchEvent(new CustomEvent('portfolio:select-technique',{detail:{term}}));
    const list=results.querySelector('ul');
    await motion.swap(results,()=>updateResults(()=>{
      results.hidden=false;
      results.querySelector('h3').textContent=`${term} · ${matches.length} ${matches.length===1?'project':'projects'}`;
      list.replaceChildren(...matches.map(resultTile));
      if(!matches.length){const li=document.createElement('li');li.className='technique-empty';li.textContent='No showcased projects use this technique yet. Choose another topic above.';list.append(li);}
    },keepMap),{immediate});
    if(version!==selectionVersion)return;
    if(scroll){
      const heading=results.querySelector('h3');heading.tabIndex=-1;heading.focus({preventScroll:true});
      results.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});
    }
  }
  document.querySelectorAll('[data-technique]').forEach(control=>control.addEventListener('click',e=>{
    if(!results||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)return;
    e.preventDefault();selectTechnique(control.dataset.technique);
  }));
  document.querySelector('.clear-technique')?.addEventListener('click',async()=>{
    navigationVersion++;
    const clearing=clearTechniqueState();const version=selectionVersion;await clearing;
    if(version!==selectionVersion)return;
    const url=new URL(location.href);url.searchParams.delete('technique');history.replaceState(null,'',url);
    document.dispatchEvent(new CustomEvent('portfolio:select-project',{detail:{id:'photon_primitive'}}));
    document.querySelector('.tag-cloud button')?.focus();
  });
  async function exploreProject(id,scroll=true){
    const explorer=document.getElementById('connection-explorer');if(!explorer)return;
    const version=++navigationVersion;
    hideGallery();const cleared=await clearTechniqueState({immediate:!scroll});
    if(!cleared||version!==navigationVersion)return;
    const url=new URL(location.href);url.searchParams.set('project',id);url.searchParams.delete('technique');url.hash='connections';history.replaceState(null,'',url);
    document.dispatchEvent(new CustomEvent('portfolio:select-project',{detail:{id}}));
    if(scroll){await window.PortfolioConnections?.whenStable();if(version===navigationVersion)scrollToMap();}
  }

  const connectionSection=document.getElementById('connections');
  const originKey='portfolio:connection-origin', returnKey='portfolio:return-position';
  const originIntent='explore-connections';
  const isConnectionAction=link=>link.matches('[data-explore-project],.project-map-link,.technique-map-link');
  let origin=null;
  let bookmarkTimer;
  const bookmarkShape='<svg viewBox="0 0 28 36" aria-hidden="true"><path class="bookmark-body" d="M3 3 25 18 3 33 7 18Z"/><path class="bookmark-facet" d="M3 3 25 18 7 18Z"/><path class="bookmark-edge" d="m3 3 22 15L3 33M7 18h13"/></svg>';
  function clearBookmark(){
    clearTimeout(bookmarkTimer);
    document.querySelectorAll('.connection-bookmark,.rail-bookmark').forEach(marker=>marker.remove());
    document.querySelectorAll('.connection-bookmark-host').forEach(host=>host.classList.remove('connection-bookmark-host'));
  }
  function placeBookmark(saved){
    clearBookmark();
    const local=pathKey(new URL(saved.url).pathname)===pathKey(location.pathname);
    const target=local&&(!saved.inResults||normal(selectedTerm)===normal(saved.term))?
      (saved.bookmarkId?document.getElementById(saved.bookmarkId):originElement(saved)):null;
    if(target){
      const host=target.closest('.project-card,.technique-card')||target;
      host.classList.add('connection-bookmark-host');
      const marker=document.createElement('span');marker.className='connection-bookmark';
      marker.setAttribute('aria-hidden','true');marker.title=`Return here: ${saved.label}`;
      marker.innerHTML=bookmarkShape+'<span class="bookmark-caption">Return here</span>';
      host.append(marker);
    }
    const floor=local&&[...document.querySelectorAll('.section-rail [data-section]')].find(link=>link.dataset.section===saved.sectionId);
    if(floor){
      const marker=document.createElement('i');marker.className='rail-bookmark';
      marker.setAttribute('role','img');marker.setAttribute('aria-label',`Return bookmark: ${saved.label}`);
      marker.title=`Return to ${saved.label}`;marker.innerHTML=bookmarkShape;floor.append(marker);
    }
  }
  function markArrival(saved){
    placeBookmark(saved);
    document.querySelectorAll('.connection-bookmark,.rail-bookmark').forEach(marker=>marker.classList.add('is-arrived'));
    bookmarkTimer=setTimeout(clearBookmark,4200);
  }
  const readSession=key=>{try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}};
  const writeSession=(key,value)=>{try{sessionStorage.setItem(key,JSON.stringify(value));}catch{/* Navigation also works without session storage. */}};
  const removeSession=key=>{try{sessionStorage.removeItem(key);}catch{}};
  const pathKey=path=>path.replace(/index\.html$/,'');
  const safeOrigin=value=>{
    // Old navigation-only checkpoints must not reappear after an ordinary Map visit.
    if(!value||value.intent!==originIntent||typeof value.url!=='string'||!Number.isFinite(value.y)||!Number.isFinite(value.time)||Date.now()-value.time>30*60*1000)return null;
    try{return new URL(value.url).origin===location.origin?value:null;}catch{return null;}
  };
  const returnButton=document.createElement('button');returnButton.className='connections-return';returnButton.hidden=true;
  returnButton.innerHTML='<span class="return-arrow" aria-hidden="true">↶</span><span><small>Return to your place</small><span class="return-label"></span></span>';
  connectionSection?.insertBefore(returnButton,document.getElementById('connection-explorer'));
  function showReturn(){
    if(!origin||!connectionSection)return;
    returnButton.querySelector('.return-label').textContent=`Back to ${origin.label}`;
    motion.swap(returnButton,()=>{returnButton.hidden=!origin;},{immediate:!returnButton.hidden});
  }
  function clearOrigin(){
    origin=null;removeSession(originKey);clearBookmark();returnButton.hidden=true;
  }
  function captureOrigin(link,destination){
    if(!isConnectionAction(link)||link.closest('#connections'))return;
    const inResults=!!link.closest('.technique-results');
    const projectId=link.dataset.exploreProject||link.closest('[data-project]')?.dataset.project;
    const section=link.closest('section,header');
    const label=inResults&&selectedTerm?`${selectedTerm} results`:records.get(projectId)?.title||
      (document.body.dataset.page==='project'?document.querySelector('h1')?.textContent:section?.querySelector('h2,h1')?.textContent)||'your previous view';
    origin={intent:originIntent,url:location.href,y:scrollY,time:Date.now(),label,projectId,inResults,term:results&&!results.hidden?selectedTerm:null,
      sectionId:section?.id||document.querySelector('.section-rail [aria-current]')?.dataset.section,
      offset:link.getBoundingClientRect().top,
      kind:link.classList.contains('project-map-link')?'project-page':link.classList.contains('technique-map-link')?'technique-map':'project',
      href:link.getAttribute('href'),targetPath:destination.pathname};
    placeBookmark(origin);
    if(connectionSection)showReturn();else writeSession(originKey,origin);
  }
  function originElement(saved){
    if(saved.kind==='project-page')return document.querySelector('.project-map-link');
    if(saved.kind==='technique-map')return document.querySelector('.technique-map-link');
    if(saved.kind==='project'){
      const scope=saved.inResults?results:document.getElementById(`project-${saved.projectId}`);
      return [...(scope?.querySelectorAll('[data-explore-project]')||[])].find(link=>link.dataset.exploreProject===saved.projectId);
    }
    return [...document.querySelectorAll('a[href]')].find(link=>link.getAttribute('href')===saved.href);
  }
  function restorePosition(saved,smooth=true){
    const target=originElement(saved);
    // A saved offset follows its card even when responsive layout changes the document height.
    const y=target&&saved.kind!=='navigation'?scrollY+target.getBoundingClientRect().top-saved.offset:saved.y;
    target?.focus({preventScroll:true});
    window.scrollTo({top:Math.max(0,y),behavior:reduced.matches||!smooth?'instant':'smooth'});
  }
  function scrollToMap(){
    const heading=connectionSection.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});
    if(window.PortfolioConnections?.center)return window.PortfolioConnections.center();
    connectionSection.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'center'});
  }
  returnButton.addEventListener('click',async()=>{
    if(!origin)return;
    const version=++navigationVersion;const saved=origin;origin=null;removeSession(originKey);
    window.PortfolioConnections?.whenStable({preventScroll:true});
    if(pathKey(new URL(saved.url).pathname)!==pathKey(location.pathname)){
      await motion.swap(document.querySelector('main'),()=>{},{enter:false});
      if(version!==navigationVersion)return;
      writeSession(returnKey,saved);
      location.assign(saved.url);return;
    }
    // Keep the map stationary while controls/results change height above it.
    await motion.swap(returnButton,()=>updateResults(()=>{returnButton.hidden=true;},true),{enter:false});
    if(version!==navigationVersion)return;
    if(saved.term)await selectTechnique(saved.term,false,{updateURL:false,keepMap:true});
    else await clearTechniqueState({keepMap:true});
    // A node selected just before Return may still have a deferred focus scroll.
    // Let it finish before issuing the single scroll back to the saved anchor.
    await window.PortfolioConnections?.whenStable();
    if(version!==navigationVersion)return;
    history.replaceState(null,'',saved.url);
    restorePosition(saved);
    markArrival(saved);
  });
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');
    if(!link||event.defaultPrevented||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0||(link.target&&link.target!=='_self'))return;
    const destination=new URL(link.href,location.href);
    if(destination.origin!==location.origin||destination.hash!=='#connections'){navigationVersion++;return;}
    if(isConnectionAction(link))captureOrigin(link,destination);
    else clearOrigin();
    if(!connectionSection)return;
    event.preventDefault();
    if(link.dataset.exploreProject)exploreProject(link.dataset.exploreProject);
    else{navigationVersion++;history.replaceState(null,'',destination);scrollToMap();}
  });
  // Explicit in-page actions use replaceState above. A native hash change is
  // ordinary navigation, not a request to bookmark whichever view was nearby.
  addEventListener('hashchange',()=>{if(location.hash==='#connections'){clearOrigin();if(connectionSection)scrollToMap();}});
  document.addEventListener('portfolio:graph-technique',event=>{navigationVersion++;event.detail.settled=selectTechnique(event.detail.term,false,{updateGraph:false,keepMap:true});});
  document.addEventListener('portfolio:graph-project',event=>{navigationVersion++;event.detail.settled=clearTechniqueState({keepMap:true});});
  const query=new URLSearchParams(location.search);
  let initialSelection;
  if(query.get('project'))initialSelection=exploreProject(query.get('project'),false);
  else if(query.get('technique')&&results)initialSelection=selectTechnique(query.get('technique'),false,{immediate:true});
  const pending=safeOrigin(readSession(originKey));removeSession(originKey);
  if(pending&&connectionSection&&location.hash==='#connections'&&pathKey(pending.targetPath)===pathKey(location.pathname)){origin=pending;showReturn();}
  const restoring=safeOrigin(readSession(returnKey));removeSession(returnKey);
  if(restoring&&pathKey(new URL(restoring.url).pathname)===pathKey(location.pathname)){
    Promise.all([document.fonts.ready,initialSelection]).then(()=>requestAnimationFrame(()=>{
      restorePosition(restoring,false);markArrival(restoring);
    }));
  }else if(connectionSection&&location.hash==='#connections'){
    // A cross-page Connections link first receives the browser's native hash
    // jump. Center the completed graph once selection and fonts have settled.
    const arrivalVersion=navigationVersion;
    Promise.resolve(initialSelection).then(()=>{
      if(arrivalVersion===navigationVersion&&location.hash==='#connections')scrollToMap();
    });
  }
});
