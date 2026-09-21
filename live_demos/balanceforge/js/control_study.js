(function(BF){
  'use strict';
  const $=id=>document.getElementById(id),models=BF.showcaseModels.filter(m=>m.record&&['double','triple'].includes(m.record.setupId)&&
    (m.record.policyType||'mlp')==='mlp'&&!m.record.trainerParams.pendulumInitialState&&!(m.record.trainerParams.uprightAssist||m.record.trainerParams.jointDamping));
  for(const m of models){const o=document.createElement('option');o.value=m.id;o.textContent=m.label;$('probeModel').append(o);}
  if(models.some(m=>m.id==='double-neat-wall-swingup'))$('probeModel').value='double-neat-wall-swingup';
  const angles=[3,15,25,50,90,140],results=new Map();let generation=0,running=false,selected=null,exportData=null;
  function model(){return models.find(m=>m.id===$('probeModel').value);}
  function description(){const m=model();$('probeDescription').textContent=m?m.summary:'No compatible saved models available.';}
  function table(){
    const table=$('probeMatrix');table.replaceChildren();const head=document.createElement('thead'),hr=document.createElement('tr');
    const first=document.createElement('th');first.textContent='Fixed controller / change';hr.append(first);
    for(const angle of angles){const th=document.createElement('th');th.scope='col';th.textContent=angle+'°';hr.append(th);}head.append(hr);table.append(head);
    const body=document.createElement('tbody');
    for(const v of BF.controlProbe.variants){const row=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=v.label;th.title=v.detail;row.append(th);
      for(const angle of angles){const td=document.createElement('td'),b=document.createElement('button');b.type='button';b.dataset.key=v.id+':'+angle;
        b.textContent='—';b.disabled=true;b.setAttribute('aria-label',v.label+', '+angle+' degrees: not measured');b.addEventListener('click',()=>select(b.dataset.key));td.append(b);row.append(td);}body.append(row);
    }table.append(body);
  }
  function updateCell(key){const rows=results.get(key),b=$('probeMatrix').querySelector('[data-key="'+key+'"]'),pass=rows.filter(r=>r.success).length;
    b.replaceChildren(document.createTextNode(pass+' / 2'));const sub=document.createElement('span');sub.className='cell-caption';sub.textContent='held without rail';b.append(sub);
    b.dataset.pass=pass;b.disabled=false;b.setAttribute('aria-label',key+': '+pass+' of 2 signed releases passed. Show traces.');
  }
  function select(key){selected=key;for(const b of $('probeMatrix').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.key===key));
    const rows=results.get(key);if(!rows)return;const variant=BF.controlProbe.variants.find(v=>v.id===rows[0].variant);
    $('traceTitle').textContent=variant.label+' · '+key.split(':')[1]+'° from upright';
    $('traceDetails').replaceChildren();for(const r of rows){const p=document.createElement('p');p.textContent=(r.angle<0?'Left':'Right')+' release: '+r.finalAboveSeconds.toFixed(1)+' s final continuous hold; '+r.contacts+' rail contacts; '+(100*r.saturationFraction).toFixed(1)+'% command saturation; maximum rod error '+r.maxRodError.toFixed(3)+' px.';$('traceDetails').append(p);}
    $('traceInterpretation').textContent=variant.detail;draw(rows);
  }
  function draw(rows){const canvas=$('probeTrace'),rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.max(300,rect.width*dpr);canvas.height=230*dpr;
    const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const w=canvas.width/dpr,h=230,left=40,top=22,colors=['#80ddc3','#edc574','#8cb8ff'];ctx.clearRect(0,0,w,h);
    ctx.font='11px system-ui';ctx.fillStyle='#b0bec9';
    for(const v of[0,45,90,135,180]){const y=top+v/180*(h-50);ctx.strokeStyle=v===90?'#fa829277':'#33444d66';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-12,y);ctx.stroke();ctx.fillText(v+'°',4,y+4);}
    for(const [ri,r]of rows.entries()){for(let link=0;link<(r.trace[0]?.angles.length||0);link++){ctx.strokeStyle=colors[link];ctx.globalAlpha=ri?.5:1;ctx.setLineDash(ri?[4,4]:[]);ctx.beginPath();r.trace.forEach((s,i)=>{const x=left+s.time/30*(w-left-12),y=top+Math.abs(s.angles[link])/180*(h-50);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();}}
    ctx.globalAlpha=1;ctx.setLineDash([]);ctx.fillText('0 s',left,h-8);ctx.fillText('30 s',w-40,h-8);ctx.fillText('90° = horizon',w-112,top+(h-50)/2-6);
  }
  $('probeRun').addEventListener('click',async()=>{
    const run=++generation,m=model();if(!m)return;running=true;selected=null;results.clear();table();exportData=null;$('probeExport').disabled=true;
    $('traceTitle').textContent='Select a measured cell';$('traceDetails').replaceChildren();
    $('traceInterpretation').textContent='Running a new experiment; prior traces have been cleared.';
    $('probeTrace').getContext('2d').clearRect(0,0,$('probeTrace').width,$('probeTrace').height);
    $('probeRun').disabled=true;$('probeModel').disabled=true;$('probeCancel').disabled=false;$('probeProgress').value=0;
    const total=BF.controlProbe.variants.length*angles.length*2;let done=0;
    try{
      for(const v of BF.controlProbe.variants)for(const angle of angles){const pair=[];
        for(const sign of[-1,1]){
          if(run!==generation)return;
          $('probeStatus').textContent=v.label+' · '+(sign*angle)+'° · '+done+'/'+total+' short rollouts';
          const result=await BF.controlProbe.run(m.record,{variant:v.id,angle:sign*(angle+.35),seconds:30,cancelled:()=>run!==generation});
          if(run!==generation)return;pair.push(result);$('probeProgress').value=++done/total;
        }
        const key=v.id+':'+angle;results.set(key,pair);updateCell(key);if(!selected)select(key);
      }
      exportData={model:m.id,criterion:'30-second exploratory probes, final 10 seconds all links above horizontal and no rail contact; two signed canonical releases per cell, magnitudes label+0.35 degrees; not a held-out reliability estimate.',angles,results:Object.fromEntries(results)};
      $('probeStatus').textContent='Complete. Select a cell to inspect both releases. These short probes describe this frozen controller, not all possible controllers.';$('probeExport').disabled=false;
    }catch(error){$('probeStatus').textContent='Probe stopped: '+error.message;}
    finally{if(run===generation){running=false;$('probeRun').disabled=false;$('probeModel').disabled=false;$('probeCancel').disabled=true;}}
  });
  $('probeCancel').addEventListener('click',()=>{generation++;running=false;$('probeRun').disabled=false;$('probeModel').disabled=false;$('probeCancel').disabled=true;$('probeStatus').textContent='Stopped. Completed cells remain available; incomplete trials are excluded.';});
  $('probeModel').addEventListener('change',()=>{generation++;results.clear();selected=null;exportData=null;table();description();$('probeExport').disabled=true;$('probeStatus').textContent='Choose Run probes to measure this controller.';$('traceTitle').textContent='Select a measured cell';$('traceDetails').replaceChildren();$('probeTrace').getContext('2d').clearRect(0,0,$('probeTrace').width,$('probeTrace').height);});
  $('probeExport').addEventListener('click',()=>{if(!exportData)return;const url=URL.createObjectURL(new Blob([JSON.stringify(exportData,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='balanceforge-control-probes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  window.addEventListener('resize',()=>{if(selected)draw(results.get(selected));});
  window.addEventListener('pagehide',()=>{generation++;});table();description();
})(window.BF);
