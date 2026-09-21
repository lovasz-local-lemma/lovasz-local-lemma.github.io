/* Recorded films retain their numerical provenance; presentation never blends methods. */
(() => {
  'use strict';
  const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
  function showExhibit(root,record){
    const actions=el('div',null,'exhibit-actions');actions.setAttribute('role','group');actions.setAttribute('aria-label',record.title+' recorded views');
    const figure=el('figure',null,'beauty-figure'),image=el('img'),caption=el('figcaption');
    image.decoding='async';image.loading='lazy';
    const title=el('strong'),text=el('p'),badge=el('span',record.kind,'badge');
    caption.append(title,text,badge);figure.append(image,caption);
    const choices=record.views.map((view,index)=>{
      const b=el('button',view.label);b.type='button';b.setAttribute('aria-pressed',String(index===0));
      b.addEventListener('click',()=>select(index));actions.append(b);return b;
    });
    function select(index){
      const view=record.views[index];image.src=view.image;image.alt=view.alt||view.caption;
      image.width=view.width||1200;image.height=view.height||750;
      figure.classList.toggle('compact-film',Boolean(view.compact));
      figure.classList.toggle('physical-film',record.title==='Rotational Atlas');
      image.style.setProperty('--film-width',`${view.displayWidth||view.width||1200}px`);
      title.textContent=view.title||view.label;text.textContent=view.caption;
      choices.forEach((b,j)=>b.setAttribute('aria-pressed',String(index===j)));
    }
    root.replaceChildren(actions,figure);select(0);
    if(record.metrics?.length){const row=el('div',null,'exhibit-metrics');for(const m of record.metrics){const box=el('div');box.append(el('strong',m.value),el('span',m.label));row.append(box);}root.append(row);}
    root.append(el('p',record.scope,'small'));
    const details=el('details',null,'exhibit-ledger');details.append(el('summary','What produced these images?'));
    for(const paragraph of record.ledger||[])details.append(el('p',paragraph));
    if(record.data){const p=el('p'),a=el('a','Recorded experiment data');a.href=record.data;p.append(a);details.append(p);}
    for(const link of record.additionalData||[]){const p=el('p'),a=el('a',link.label);a.href=link.href;p.append(a);details.append(p);}
    root.append(details);
  }
  fetch('exhibits.json?v=hero-2',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('missing');return r.json();}).then(data=>{
    showExhibit(document.getElementById('physical-exhibit'),data.physical);
    showExhibit(document.getElementById('shadow-exhibit'),data.shadow);
    const groups=[['study-cards',['relay','sheets','loom','atlas']],['camera-study-cards',['scheimpflug','chronolens']]];
    for(const [id,order] of groups){
    const grid=document.getElementById(id);
    for(const ident of order){
      const study=data.studies.find(s=>s.id===ident);if(!study)continue;
      const a=el('a',null,'frontier-card');a.href='explorations/index.html#'+study.id;
      if(study.image){const img=el('img');img.src=study.image;img.alt=study.title+' — controlled rendering study';img.loading='lazy';img.width=640;img.height=400;a.append(img);}
      const body=el('div');body.append(el('span',study.label.replace(/^\d+\s*\/\s*/,''),'eyebrow'),el('h3',study.title),el('p',study.description));a.append(body);grid.append(a);
    }
    }
  }).catch(()=>{
    for(const id of ['physical-exhibit','shadow-exhibit'])document.getElementById(id).textContent='The recorded films could not be loaded. The interactive coordinate atlas remains available below.';
  });
})();
