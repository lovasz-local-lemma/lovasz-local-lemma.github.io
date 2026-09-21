/* The reasoning behind an authored punchline can be opened without leaving the project. */
(() => {
  'use strict';
  const root=new URL('./',document.currentScript.src),records=new Map(),drafts=new Map(),pending=new Map();
  const FORMAT='portfolio-explanations',KEY='portfolio:explanations:v1',FIELDS=['basis','criteria','comparisons','evidence','scope'];
  const ARCHIVE_KEY='portfolio:explanations:reviewed:v1',ARCHIVE_FORMAT='portfolio-explanation-reviews';
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const equal=(a,b)=>a===b||(Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i])))||
    (object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>own(b,key)&&equal(a[key],b[key])));
  const text=(value,max,blank=true)=>typeof value==='string'&&Array.from(value).length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)&&(blank||!!value.trim());
  const validId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
  let dialog,opener,previousScope,session,editing=false,storageWarning='',storageOkay=true;
  const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  const safeLink=(value,local=false)=>{
    try{
      if(typeof value!=='string'||!value.trim()||/[\s\u0000-\u001f\\]/.test(value))return null;
      if(local){const path=decodeURIComponent(value.split(/[?#]/)[0]);if(!path||path.startsWith('/')||/[\\\u0000-\u001f\u007f]/.test(path)||/^[a-z][a-z\d+.-]*:/i.test(value)||path.split('/').includes('..'))return null;}
      if(!local&&!/^https?:\/\//i.test(value))return null;
      const url=new URL(value,root);
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port==='0')return null;
      if(local&&(url.origin!==root.origin||!url.pathname.startsWith(root.pathname)))return null;
      return url.href;
    }catch{return null;}
  };
  function validField(field,value,complete=false){
    if(field==='basis'||field==='scope')return text(value,10000,!complete);
    if(!Array.isArray(value)||value.length>100)return false;
    if(field==='criteria')return value.every(row=>text(row,1200,!complete));
    const limits=field==='comparisons'?{name:300,url:1200,documented:10000,distinction:10000}:{label:300,url:1200};
    return value.every(row=>object(row)&&Object.keys(row).length===Object.keys(limits).length&&Object.entries(limits).every(([key,max])=>
      text(row[key],max,!complete||(field==='comparisons'&&key==='url')))&&
      (!complete||(field==='comparisons'&&!row.url)||!!safeLink(row.url,field==='evidence')));
  }
  function normalize(payload){
    if(!object(payload)||payload.format!==FORMAT||payload.version!==1||!Array.isArray(payload.edits)||payload.edits.length>500)return null;
    const ids=new Set(),result=[];
    for(const entry of payload.edits){
      if(!object(entry)||!validId(entry.projectId)||ids.has(entry.projectId)||!text(entry.projectTitle,300)||!text(entry.claim,800,false)||!object(entry.base)||!object(entry.changes))return null;
      ids.add(entry.projectId);const fields=Object.keys(entry.changes);
      if(!fields.length||fields.some(field=>!FIELDS.includes(field))||Object.keys(entry.base).length!==fields.length||
        fields.some(field=>!own(entry.base,field)||!validField(field,entry.base[field])||!validField(field,entry.changes[field])))return null;
      result.push(clone(entry));
    }
    return new Map(result.map(entry=>[entry.projectId,entry]));
  }
  function readDrafts(){
    const raw=localStorage.getItem(KEY);
    const result=raw?normalize(JSON.parse(raw)):new Map();
    if(!result)throw new Error('Unreadable drafts');
    return result;
  }
  function storedFailure(){storageOkay=false;storageWarning='Browser drafts could not be saved. Keep this page open and export your edits before leaving.';}
  function validReview(receipt,id,published){
    return object(receipt)&&receipt.projectId===id&&validId(id)&&text(receipt.claim,800,false)&&FIELDS.includes(receipt.field)&&
      ['base','submitted','published'].every(key=>validField(receipt.field,receipt[key]))&&
      typeof receipt.reviewedAt==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(receipt.reviewedAt)&&!Number.isNaN(Date.parse(receipt.reviewedAt))&&
      receipt.claim===published?.claim&&equal(receipt.published,published[receipt.field]??[]);
  }
  function reviewedArchive(){
    const raw=localStorage.getItem(ARCHIVE_KEY);
    if(!raw)return {format:ARCHIVE_FORMAT,version:1,entries:[]};
    const archive=JSON.parse(raw);
    if(!object(archive)||archive.format!==ARCHIVE_FORMAT||archive.version!==1||!Array.isArray(archive.entries)||
      archive.entries.some(row=>!validReview(row,row?.projectId,{claim:row?.claim,[row?.field]:row?.published})))throw new Error('Unreadable reviewed explanation archive');
    return archive;
  }
  function retireApplied(map){
    const retiring=[],reviewed=[];
    for(const [id,entry] of map){
      const project=records.get(id),published=project?.claimBasis;
      if(!published||published.claim!==entry.claim)continue;
      for(const field of Object.keys(entry.changes)){
        if(equal(published[field]??[],entry.changes[field]))retiring.push([id,field]);
        else{
          const receipt=Array.isArray(project.explanationReviews)&&project.explanationReviews.find(row=>validReview(row,id,published)&&
            row.field===field&&equal(row.base,entry.base[field])&&equal(row.submitted,entry.changes[field]));
          if(receipt){retiring.push([id,field]);reviewed.push({...clone(receipt),projectTitle:entry.projectTitle,draftUpdatedAt:entry.updatedAt||'',archivedAt:new Date().toISOString()});}
        }
      }
    }
    // Preserve the author's exact submitted wording before retiring a reviewed
    // correction. Failure to read or write the archive leaves every draft intact.
    if(reviewed.length){
      const archive=reviewedArchive();
      for(const row of reviewed)if(!archive.entries.some(old=>['projectId','claim','field','base','submitted','published','reviewedAt'].every(key=>equal(old[key],row[key]))))archive.entries.push(row);
      localStorage.setItem(ARCHIVE_KEY,JSON.stringify(archive));
    }
    for(const [id,field] of retiring){const entry=map.get(id);delete entry.changes[field];delete entry.base[field];if(!Object.keys(entry.changes).length)map.delete(id);}
  }
  function loadDrafts(){
    try{
      const loaded=readDrafts();drafts.clear();for(const [id,row] of loaded)drafts.set(id,row);
      const retiring=new Map([...loaded].map(([id,row])=>[id,clone(row)]));retireApplied(retiring);
      if(!equal([...loaded.values()],[...retiring.values()]))localStorage.setItem(KEY,JSON.stringify({format:FORMAT,version:1,edits:[...retiring.values()]}));
      drafts.clear();for(const [id,row] of retiring)drafts.set(id,row);storageOkay=true;storageWarning='';
    }
    catch{storedFailure();}
  }
  // Merge only the edited field into fresh storage so a brochure cannot erase
  // drafts from other pages, or an unrelated field being edited in another tab.
  function persist(field){
    if(field){const fields=pending.has(session)&&pending.get(session)===null?new Set(FIELDS):(pending.get(session)||new Set());fields.add(field);pending.set(session,fields);}
    else if(session)pending.set(session,null);
    try{
      const latest=readDrafts();
      for(const [id,fields] of pending){
        if(fields===null){latest.delete(id);continue;}
        const published=records.get(id).claimBasis,outgoing=drafts.get(id);
        const row=latest.get(id)||{projectId:id,projectTitle:records.get(id).title,claim:published.claim,base:{},changes:{}};
        for(const changed of fields){
          if(outgoing&&own(outgoing.changes,changed)){row.base[changed]=clone(outgoing.base[changed]);row.changes[changed]=clone(outgoing.changes[changed]);row.claim=outgoing.claim;}
          else{delete row.base[changed];delete row.changes[changed];}
        }
        row.updatedAt=new Date().toISOString();
        if(Object.keys(row.changes).length)latest.set(id,row);else latest.delete(id);
      }
      retireApplied(latest);
      localStorage.setItem(KEY,JSON.stringify({format:FORMAT,version:1,edits:[...latest.values()]}));
      drafts.clear();for(const [id,row] of latest)drafts.set(id,row);
      pending.clear();
      storageOkay=true;storageWarning='';
    }catch{storedFailure();}
  }
  function effective(project){
    const published=basisFor(project),entry=drafts.get(project.id);
    return entry?.claim===published?.claim?{...published,...clone(entry.changes)}:published;
  }
  function fieldValue(field){return clone(effective(records.get(session))[field]??[]);}
  function saveField(field,value){
    if(!validField(field,value))return;
    const published=records.get(session).claimBasis,old=drafts.get(session);
    if(old&&old.claim!==published.claim)return;
    const row=old?clone(old):{projectId:session,projectTitle:records.get(session).title,claim:published.claim,base:{},changes:{}};
    if(equal(value,published[field]??[])){delete row.base[field];delete row.changes[field];}
    else{if(!own(row.base,field))row.base[field]=clone(published[field]??[]);row.changes[field]=clone(value);}
    row.updatedAt=new Date().toISOString();
    if(Object.keys(row.changes).length)drafts.set(session,row);else drafts.delete(session);
    persist(field);refreshStatus();
  }
  function exportData(){return {format:FORMAT,version:1,exportedAt:new Date().toISOString(),edits:[...drafts.values()].sort((a,b)=>a.projectId.localeCompare(b.projectId)).map(clone)};}
  function incomplete(){
    return [...drafts.values()].find(row=>Object.keys(row.changes).some(field=>!validField(field,row.changes[field],true)));
  }
  function exportDrafts(){
    // Include another tab's most recent edits, unless this tab has unsaved memory drafts.
    if(storageOkay)loadDrafts();
    refreshStatus();if(!drafts.size||incomplete())return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(exportData(),null,2)+'\n'],{type:'application/json'}));
    const link=element('a');link.href=url;link.download='portfolio-explanations.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function exportReviewed(){
    try{
      const archive=reviewedArchive();if(!archive.entries.length)return;
      const url=URL.createObjectURL(new Blob([JSON.stringify({...archive,exportedAt:new Date().toISOString()},null,2)+'\n'],{type:'application/json'}));
      const link=element('a');link.href=url;link.download='portfolio-explanations-reviewed.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch{storageWarning='Reviewed drafts could not be read. Your current explanation drafts have been kept.';refreshStatus();}
  }
  function refreshStatus(){
    if(!dialog?.open)return;
    const status=dialog.querySelector('[data-claim-status]'),entry=drafts.get(session),bad=incomplete();
    const published=records.get(session).claimBasis;
    const stale=entry&&(entry.claim!==published.claim||Object.keys(entry.base).some(field=>!equal(entry.base[field],published[field]??[])));
    status.textContent=storageWarning||(bad?`Finish empty fields or correct links in ${bad.projectTitle} before exporting.`:
      stale?'Published text has changed since this draft began. Your export keeps the original text for review.':
      drafts.size?`${drafts.size} project${drafts.size===1?'':'s'} with drafts · saved in this browser · export when ready.`:'Edits save in this browser. Export them when ready for me to apply.');
    status.classList.toggle('has-warning',!!storageWarning||!!bad||!!stale);
    dialog.querySelector('[data-claim-export]').disabled=!drafts.size||!!bad;
    const archived=dialog.querySelector('[data-claim-export-reviewed]');
    if(archived){try{archived.hidden=reviewedArchive().entries.length===0;}catch{archived.hidden=true;}}
    const reset=dialog.querySelector('[data-claim-reset]');if(reset)reset.disabled=!entry;
    const review=dialog.querySelector('[data-claim-drafts]');if(review){
      review.hidden=!drafts.size;
      review.querySelector('summary').textContent=`Drafts across projects (${drafts.size})`;
      const list=review.querySelector('ul');list.replaceChildren();
      for(const row of drafts.values()){
        const item=element('li');
        if(records.has(row.projectId)&&basisFor(records.get(row.projectId))){
          const pick=action(row.projectTitle,()=>{session=row.projectId;editing=false;render();dialog.scrollTop=0;dialog.querySelector('[data-claim-edit]').focus({preventScroll:true});});
          pick.disabled=row.projectId===session;item.append(pick);
        }else{
          const link=element('a',`${row.projectTitle} ↗`);link.href=new URL(`index.html#project-${row.projectId}`,root).href;item.append(link);
        }
        list.append(item);
      }
    }
  }
  function basisFor(project){
    const basis=project?.claimBasis;
    return basis&&basis.claim===project.kicker&&typeof basis.basis==='string'&&typeof basis.scope==='string'&&
      Array.isArray(basis.criteria)&&Array.isArray(basis.comparisons)?basis:null;
  }
  function syncTrigger(button){
    const project=records.get(button.dataset.claimBasis),basis=basisFor(project);
    const current=window.PortfolioPunchlineEditor?.textFor(project?.id,'kicker',project?.kicker)??project?.kicker;
    // Studio has a separate plain-text editing route. Evidence must match what
    // is actually on the card as well as the catalog/punchline-editor record.
    const visible=button.querySelector('.claim-copy')?.textContent;
    const active=!!basis&&current===basis.claim&&visible===basis.claim;
    button.disabled=!active;
    button.querySelector('.claim-cue')?.toggleAttribute('hidden',!active);
    return active;
  }
  function sync(){document.querySelectorAll('[data-claim-basis]').forEach(syncTrigger);}
  const copyObserver=new MutationObserver(changes=>{
    const buttons=new Set(changes.map(change=>(change.target.nodeType===Node.TEXT_NODE?change.target.parentElement:change.target)?.closest('[data-claim-basis]')).filter(Boolean));
    buttons.forEach(syncTrigger);
  });
  function watchCopy(copy){if(copy)copyObserver.observe(copy,{childList:true,characterData:true,subtree:true});}
  function createTrigger(project,copyClass=''){
    if(!basisFor(project))return null;
    const button=element('button',undefined,'claim-trigger');button.type='button';button.dataset.claimBasis=project.id;button.setAttribute('aria-haspopup','dialog');
    const copy=element('span',project.kicker,['claim-copy',copyClass].filter(Boolean).join(' '));
    window.PortfolioPunchlineEditor?.decorate(copy,project.id,'kicker',project.kicker);
    const cue=element('span','Why I say this ','claim-cue'),arrow=element('span','↗');arrow.setAttribute('aria-hidden','true');cue.append(arrow);
    button.append(copy,cue);watchCopy(copy);syncTrigger(button);return button;
  }
  function close(){
    if(!dialog?.open)return;
    dialog.close();document.body.classList.remove('claim-evidence-open');
    window.PortfolioLabs?.setScope(previousScope?.isConnected?previousScope:null);
    if(opener?.isConnected&&!opener.disabled)opener.focus({preventScroll:true});
  }
  function createDialog(){
    dialog=element('dialog',undefined,'claim-evidence-dialog');dialog.setAttribute('aria-labelledby','claim-evidence-title');
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)close();});
    document.body.append(dialog);
  }
  function action(label,handler,attribute,value=''){
    const node=element('button',label,'claim-editor-button');node.type='button';node.addEventListener('click',handler);if(attribute)node.setAttribute(attribute,value);return node;
  }
  function fieldInput(label,value,name,limit,onInput,multiline=true){
    const wrap=element('label',undefined,'claim-editor-input'),caption=element('span',label);
    const input=element(multiline?'textarea':'input');input.name=name;input.value=value;input.maxLength=limit;
    if(multiline)input.rows=Math.min(12,Math.max(2,Math.ceil(value.length/65)));
    else input.type='text';
    input.spellcheck=!name.endsWith('.url');
    input.addEventListener('input',()=>{onInput(input.value);if(multiline){input.style.height='auto';input.style.height=Math.max(80,input.scrollHeight+3)+'px';}});
    if(name==='basis'||name==='scope')input.dataset.explanationField=name;
    wrap.append(caption,input);return wrap;
  }
  const fieldTitles={basis:'The explanation',criteria:'What matters here',comparisons:'Related approaches',evidence:'See it in the project',scope:'What this means'};
  function renderField(field){
    const section=dialog.querySelector(`[data-editor-section="${field}"]`);if(!section)return;
    section.replaceChildren();section.append(element('h3',fieldTitles[field]));
    if(field==='basis'||field==='scope'){
      section.append(fieldInput(field==='basis'?'Opening explanation':'Scope and closing note',fieldValue(field),field,10000,value=>saveField(field,value)));
      return;
    }
    const list=element('div',undefined,'claim-editor-list');list.dataset.explanationList=field;section.append(list);
    const rows=fieldValue(field);
    if(!rows.length)list.append(element('p','No entries. This section will be hidden in the preview.','claim-editor-empty'));
    rows.forEach((row,index)=>{
      const item=element('fieldset',undefined,'claim-editor-row');item.dataset.explanationRow='';item.append(element('legend',`${field==='criteria'?'Criterion':field==='evidence'?'Project link':'Related entry'} ${index+1}`));
      const update=(key,value)=>{const values=fieldValue(field);if(index>=values.length)return;if(key)values[index][key]=value;else values[index]=value;saveField(field,values);};
      if(field==='criteria')item.append(fieldInput('Text',row,`${field}.${index}`,1200,value=>update(null,value)));
      else{
        const key=field==='comparisons'?'name':'label';
        item.append(fieldInput(field==='comparisons'?'Name or heading':'Link text',row[key],`${field}.${index}.${key}`,300,value=>update(key,value),false));
        item.append(fieldInput(field==='comparisons'?'Source URL (optional)':'Project URL (relative to the portfolio)',row.url,`${field}.${index}.url`,1200,value=>update('url',value),false));
        if(field==='comparisons'){
          const pair=element('div',undefined,'claim-comparison-pair');
          pair.append(fieldInput('What it provides',row.documented,`${field}.${index}.documented`,10000,value=>update('documented',value)),
            fieldInput('This project’s emphasis',row.distinction,`${field}.${index}.distinction`,10000,value=>update('distinction',value)));
          item.append(pair);
        }
      }
      const tools=element('div',undefined,'claim-editor-row-actions');
      function modify(operation){
        const values=fieldValue(field);operation(values);saveField(field,values);renderField(field);
        const target=section.querySelectorAll('[data-explanation-row]')[Math.min(index,values.length-1)];
        (target?.querySelector('input,textarea')||section.querySelector('[data-explanation-add]')).focus({preventScroll:true});
      }
      const up=action('↑ Move up',()=>modify(values=>{[values[index-1],values[index]]=[values[index],values[index-1]];}),'data-explanation-move','up');up.disabled=index===0;
      const down=action('↓ Move down',()=>modify(values=>{[values[index],values[index+1]]=[values[index+1],values[index]];}),'data-explanation-move','down');down.disabled=index===rows.length-1;
      tools.append(up,down,action('Remove',()=>modify(values=>values.splice(index,1)),'data-explanation-remove'));item.append(tools);list.append(item);
    });
    const add=action(field==='criteria'?'Add criterion':field==='evidence'?'Add project link':'Add related entry',()=>{
      const values=fieldValue(field);if(values.length>=100)return;
      values.push(field==='criteria'?'':field==='evidence'?{label:'',url:''}:{name:'',url:'',documented:'',distinction:''});
      saveField(field,values);renderField(field);
      const last=section.querySelectorAll('[data-explanation-row]')[values.length-1];last.querySelector('textarea,input').focus();
    },'data-explanation-add',field);add.disabled=rows.length>=100;section.append(add);
  }
  function renderEditor(){
    const form=element('div',undefined,'claim-editor-form');
    form.append(element('p','Edit the text below, or remove and reorder entries. Source links are optional for related entries. The punchline above has its own editor.','claim-editor-help'));
    for(const field of ['basis','criteria','comparisons','evidence','scope']){const section=element('section');section.dataset.editorSection=field;form.append(section);}
    dialog.append(form);for(const field of FIELDS)renderField(field);
  }
  function render(){
    const project=records.get(session),basis=effective(project);dialog.replaceChildren();
    const header=element('header',undefined,'claim-evidence-heading'),label=element('span','Behind the project','claim-assessment-label');
    const toolbar=element('div',undefined,'claim-editor-toolbar');
    const toggle=action(editing?'Preview':'Edit explanation',()=>{editing=!editing;render();dialog.querySelector(editing?'[data-explanation-field="basis"]':'[data-claim-edit]').focus({preventScroll:true});},editing?'data-claim-preview':'data-claim-edit');
    toggle.disabled=!!drafts.get(session)&&drafts.get(session).claim!==basis.claim;
    const dismiss=element('button','Close ×','claim-evidence-close');dismiss.type='button';dismiss.addEventListener('click',close);
    toolbar.append(toggle,action('Export explanations',exportDrafts,'data-claim-export'),dismiss);header.append(label,toolbar);
    const title=element('h2',`Why I say this · ${project.title}`);title.id='claim-evidence-title';
    const claim=element('blockquote',basis.claim,'claim-evidence-quote');
    const status=element('p',undefined,'claim-editor-status');status.dataset.claimStatus='';status.setAttribute('role','status');
    const resetArea=element('div',undefined,'claim-editor-reset');
    resetArea.append(action('Restore published',()=>{
      resetArea.replaceChildren(element('span','Discard this project’s explanation draft?'));
      resetArea.append(action('Restore published text',()=>{drafts.delete(session);persist();render();dialog.querySelector(editing?'[data-claim-preview]':'[data-claim-edit]').focus({preventScroll:true});},'data-claim-reset-confirm'),
        action('Keep draft',()=>{render();dialog.querySelector('[data-claim-reset]').focus({preventScroll:true});}));
    },'data-claim-reset'));
    resetArea.append(action('Export reviewed drafts',exportReviewed,'data-claim-export-reviewed'));
    const review=element('details',undefined,'claim-editor-drafts');review.dataset.claimDrafts='';review.append(element('summary'),element('ul'));
    dialog.append(header,title,claim,status,resetArea,review);
    if(editing){renderEditor();refreshStatus();return;}
    const intro=element('p',basis.basis,'claim-evidence-intro');dialog.append(intro);
    const criteria=element('section',undefined,'claim-evidence-criteria');criteria.append(element('h3','What matters here'));
    const list=element('ul');basis.criteria.forEach(item=>{if(typeof item==='string')list.append(element('li',item));});criteria.append(list);
    if(basis.criteria.length)dialog.append(criteria);
    if(Array.isArray(basis.evidence)&&basis.evidence.length){
      const evidence=element('nav',undefined,'claim-project-evidence');evidence.setAttribute('aria-label','See the work behind this punchline');
      evidence.append(element('h3','See it in the project'));
      for(const item of basis.evidence){
        const href=safeLink(item?.url,true);if(!href||typeof item.label!=='string')continue;
        const link=element('a',item.label+' ↗');link.href=href;
        // Same-document evidence is revealed by the brochure's own anchor handler.
        link.addEventListener('click',()=>{close();if(previousScope?.open)previousScope.querySelector('.close-overview')?.click();});
        evidence.append(link);
      }
      dialog.append(evidence);
    }
    const comparisons=element('section',undefined,'claim-comparisons');comparisons.append(element('h3','Related approaches'));
    for(const item of basis.comparisons){
      const href=safeLink(item?.url);if(!['name','documented','distinction'].every(key=>typeof item[key]==='string'))continue;
      const article=element('article',undefined,'claim-comparison');
      const heading=element('h4');
      if(href){const source=element('a',item.name+' ↗');source.href=href;source.target='_blank';source.rel='noopener';heading.append(source);}else heading.textContent=item.name;
      const row=element('div',undefined,'claim-comparison-pair');
      const documented=element('div'),distinction=element('div');
      documented.append(element('span','What it provides','claim-comparison-label'),element('p',item.documented));
      distinction.append(element('span','This project’s emphasis','claim-comparison-label'),element('p',item.distinction));
      row.append(documented,distinction);article.append(heading,row);comparisons.append(article);
    }
    if(basis.comparisons.length)dialog.append(comparisons);
    const scope=element('aside',undefined,'claim-evidence-scope');scope.append(element('h3','What this means'),element('p',basis.scope));
    if(drafts.has(session))scope.append(element('span','Local draft · the published version is unchanged','claim-reviewed-at'));
    else if(typeof basis.reviewedAt==='string'){const date=element('time',`Reviewed ${basis.reviewedAt}`,'claim-reviewed-at');date.dateTime=basis.reviewedAt;scope.append(date);}
    dialog.append(scope);
    refreshStatus();
  }
  function open(id,button){
    const project=records.get(id);if(!basisFor(project)||!syncTrigger(button))return;
    if(!dialog)createDialog();
    if(storageOkay)loadDrafts();
    session=id;editing=false;opener=button;previousScope=button.closest('.overview-dialog');render();
    document.querySelector('.gallery-panel')?.classList.remove('visible');document.body.classList.remove('gallery-open');document.body.classList.add('claim-evidence-open');
    if(!dialog.open)dialog.showModal();dialog.scrollTop=0;refreshStatus();dialog.querySelector('.claim-evidence-close').focus({preventScroll:true});
    window.PortfolioLabs?.setScope(dialog);
  }
  function initialize(){
    let projects=[];try{projects=JSON.parse(document.getElementById('project-index')?.textContent||'[]');}catch{/* Ordinary static copy remains readable. */}
    for(const project of projects)if(typeof project?.id==='string')records.set(project.id,project);
    loadDrafts();
    sync();
    document.querySelectorAll('[data-claim-basis] .claim-copy').forEach(watchCopy);
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-claim-basis]');if(!button)return;
      event.preventDefault();event.stopPropagation();open(button.dataset.claimBasis,button);
    },true);
    document.addEventListener('portfolio:punchlines-changed',sync);
    addEventListener('storage',event=>{
      queueMicrotask(sync);
      if(event.key===ARCHIVE_KEY){refreshStatus();return;}
      if(event.key!==KEY&&event.key!==null)return;
      // Keep a focused field intact while independent fields catch up with the other tab.
      if(!storageOkay)return;
      const active=document.activeElement?.closest('[data-editor-section]')?.dataset.editorSection;
      loadDrafts();
      if(dialog?.open){if(editing){for(const field of FIELDS)if(field!==active)renderField(field);refreshStatus();}else render();}
    });
  }
  window.PortfolioClaims={createTrigger,exportData};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();
