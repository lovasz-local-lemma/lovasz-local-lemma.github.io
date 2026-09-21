const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
async function asset(path,binary=false){const r=await fetch(path);if(!r.ok)throw Error('Missing export dependency: '+path);return binary?b64(new Uint8Array(await r.arrayBuffer())):r.text();}
const routes={
 'three':'../../../live_demos/pi/vendor/three/build/three.module.js',
 'rivx-orbit':'../../../live_demos/pi/vendor/three/examples/jsm/controls/OrbitControls.js',
 'rivx-runtime':'../vector-replay/vendor/webgl2_advanced.js',
 'rivx-transport':'./transport.js','rivx-dynamics':'./dynamics.js','rivx-medium':'./medium-curves.js','rivx-beauty':'./beauty.js','rivx-receiver':'./photon-receiver.js','rivx-export':'./export.js','rivx-hourglass':'./app.js'
};
export async function exportStudy(settings){
 let bundle=window.__RIVX_HOURGLASS_BUNDLE__;
 if(!bundle){
   const entries=await Promise.all(Object.entries(routes).map(async([id,p])=>[id,await asset(p)]));
   const [css,wasm,context,license,threeLicense]=await Promise.all([asset('./style.css'),asset('../vector-replay/vendor/rive.wasm',true),asset('./context.riv',true),asset('../vector-replay/vendor/LICENSE'),asset('../../../live_demos/pi/vendor/three/LICENSE')]);
   bundle={format:'RIVX-HOURGLASS-HTML-1',modules:Object.fromEntries(entries),css,wasm,context,license,threeLicense,officialGpuCanvas:false};
 }
 bundle={...bundle,settings};
 const doc=document.documentElement.cloneNode(true);doc.querySelectorAll('script,link').forEach(e=>e.remove());
 for(const key of Object.keys(doc.querySelector('body').dataset))delete doc.querySelector('body').dataset[key];
 doc.querySelectorAll('a[href]').forEach(a=>a.removeAttribute('href'));
 doc.querySelector('#export-study').disabled=false;doc.querySelector('#export-status').textContent='Self-contained browser study · Three.js sheets + official Rive curves';
 const style=document.createElement('style');style.textContent=bundle.css;doc.querySelector('head').append(style);
 const json=JSON.stringify(bundle).replace(/</g,'\\u003c');
 const boot=`window.__RIVX_HOURGLASS_BUNDLE__=${json};
 const bundle=window.__RIVX_HOURGLASS_BUNDLE__,imports={};
 const routes=${JSON.stringify(routes)};
 for(const [id,raw] of Object.entries(bundle.modules)){
   let source=raw;
   if(id!=='rivx-runtime'&&id!=='three'&&id!=='rivx-export')for(const [name,path]of Object.entries(routes)){source=source.split("'"+path+"'").join("'"+name+"'");}
   imports[id]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
 }
 const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);import('rivx-hourglass').catch(e=>{const node=document.getElementById('error');node.hidden=false;node.textContent=e.message;});`;
 const html='<!doctype html>\n'+doc.outerHTML.replace('</body>',()=>`<script>${boot.replace(/<\/script/gi,'<\\/script')}<\/script></body>`);
 const index=Number(sessionStorage.getItem('rivx-hourglass-exports')||0)+1;sessionStorage.setItem('rivx-hourglass-exports',String(index));
 const name=`rivx-hourglass${index>1?' ['+index+']':''}.html`,url=URL.createObjectURL(new Blob([html],{type:'text/html'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 return {name,bytes:new TextEncoder().encode(html).length};
}
