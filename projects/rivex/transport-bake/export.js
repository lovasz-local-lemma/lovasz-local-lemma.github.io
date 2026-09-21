const encode=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const pack=array=>encode(new Uint8Array(array.buffer,array.byteOffset,array.byteLength));
const unpack=text=>new Float32Array(decode(text).buffer);
export function packModel(model){return {...model,hits:pack(model.hits),atlas:pack(model.atlas),sheet:Object.fromEntries(Object.entries(model.sheet).map(([key,array])=>[key,pack(array)]))};}
export function unpackModel(model){return {...model,hits:unpack(model.hits),atlas:unpack(model.atlas),sheet:Object.fromEntries(Object.entries(model.sheet).map(([key,text])=>[key,unpack(text)]))};}
const routes={three:'../../../live_demos/pi/vendor/three/build/three.module.js',orbit:'../../../live_demos/pi/vendor/three/examples/jsm/controls/OrbitControls.js',rive:'../vector-replay/vendor/webgl2_advanced.js',transport:'../hourglass/transport.js',beauty:'../hourglass/beauty.js',model:'./model.js',renderer:'./renderer.js',schematic:'./schematic.js',comparison:'./comparison.js',exporter:'./export.js',app:'./app.js'};
async function asset(path,binary=false){const r=await fetch(path);if(!r.ok)throw Error('Missing export dependency: '+path);return binary?encode(new Uint8Array(await r.arrayBuffer())):r.text();}
let nextExport=0;
export async function exportStudy(model,settings){
 let bundle=window.__RIVX_TRANSPORT_BAKE__;
 if(!bundle){const [modules,css,context,wasm,license,threeLicense]=await Promise.all([Promise.all(Object.entries(routes).map(async([id,path])=>[id,await asset(path)])),asset('./style.css'),asset('../hourglass/context.riv',true),asset('../vector-replay/vendor/rive.wasm',true),asset('../vector-replay/vendor/LICENSE'),asset('../../../live_demos/pi/vendor/three/LICENSE')]);bundle={format:'RIVX-TRANSPORT-BAKE-1',modules:Object.fromEntries(modules),css,context,wasm,license,threeLicense,officialGpuCanvas:false,model:packModel(model)};}
 bundle={...bundle,settings};
 const doc=document.documentElement.cloneNode(true);doc.querySelectorAll('script,link').forEach(e=>e.remove());for(const key of Object.keys(doc.querySelector('body').dataset))delete doc.querySelector('body').dataset[key];doc.querySelector('#export').disabled=true;doc.querySelector('#play').disabled=true;
 doc.querySelector('#export-status').textContent='Restored Suite · actual stored bake · no network needed';const style=document.createElement('style');style.textContent=bundle.css;doc.querySelector('head').append(style);
 const boot=`window.__RIVX_TRANSPORT_BAKE__=${JSON.stringify(bundle).replace(/</g,'\\u003c')};const bundle=window.__RIVX_TRANSPORT_BAKE__,imports={},routes=${JSON.stringify(routes)};for(const [id,raw]of Object.entries(bundle.modules)){let source=raw;if(!['three','rive','exporter'].includes(id))for(const [name,path]of Object.entries(routes))source=source.split("'"+path+"'").join("'"+name+"'");imports[id]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));}const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);import('app').catch(e=>{const n=document.getElementById('error');n.hidden=false;n.textContent=e.message;console.error(e);});`;
 const html='<!doctype html>\n'+doc.outerHTML.replace('</body>',()=>`<script>${boot.replace(/<\/script/gi,'<\\/script')}<\/script></body>`);
 try{nextExport=Math.max(nextExport,Number(localStorage.getItem('rivx-transport-bake-export')||0))+1;localStorage.setItem('rivx-transport-bake-export',String(nextExport));}catch{nextExport++;}
 const name=`rivx-transport-bake [${nextExport}].html`,blob=new Blob([html],{type:'text/html'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);return {name,bytes:blob.size};
}
