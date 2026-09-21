// Self-contained browser suite: official Rive runtime/WASM + ordinary ink .riv
// + the native record + the custom browser path/primitive renderer. No CDN.
const modules=['app.js','transport.js','scenes.js','reference.js','receivers.js','primitives.js','primitive-renderer.js','rive-snapshot.js','portable.js','scattering.js','frame-average.js'];
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
export async function portableHtml(snapshot){
  let sources,assets,html,css,license;
  if(window.__photonBundle){({sources,assets,html,css,license}=window.__photonBundle);}
  else{
    sources={};assets={};
    await Promise.all(modules.map(async name=>{const r=await fetch(new URL(name,import.meta.url));if(!r.ok)throw Error('Missing module '+name);sources[name]=await r.text();}));
    sources['rive-runtime.js']=await(await fetch('../vector-replay/vendor/webgl2_advanced.js')).text();
    for(const [name,url]of Object.entries({native:'./native-caustic.rivx.gz',ink:'./ink-pool.riv',wasm:'../vector-replay/vendor/rive.wasm'})){const r=await fetch(url);if(!r.ok)throw Error('Missing export asset '+name);assets[name]=base64(new Uint8Array(await r.arrayBuffer()));}
    html=await(await fetch('index.html')).text();css=await(await fetch('style.css')).text();license=await(await fetch('../vector-replay/vendor/LICENSE')).text();
    // A downloaded study may live in any directory. Keep its reading link
    // attached to the source site instead of resolving from the export folder.
    const radianceGuide=new URL('../../radiance-lab/index.html#manual-photon-primitive-mode',import.meta.url).href;
    html=html.replaceAll('href="../../radiance-lab/index.html#manual-photon-primitive-mode"','href="'+radianceGuide+'"');
  }
  const payload=JSON.stringify({sources,assets,html,css,license,snapshot}).replaceAll('<','\\u003c');
  const loader=`
  const pack=${payload};window.__photonBundle=pack;
  pack.urls={};for(const [key,b64]of Object.entries(pack.assets)){const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));pack.urls[key]=URL.createObjectURL(new Blob([bytes],{type:key==='wasm'?'application/wasm':'application/octet-stream'}));}
  const map={imports:{}};
  for(const [name,raw]of Object.entries(pack.sources)){
    let source=raw;
    if(name!=='rive-runtime.js'){for(const dep of Object.keys(pack.sources))source=source.replaceAll("'./"+dep+"'","'photon/"+dep+"'").replaceAll('"./'+dep+'"','"photon/'+dep+'"');source=source.replaceAll('../vector-replay/vendor/webgl2_advanced.js','photon/rive-runtime.js');}
    if(name==='app.js')source=source.replace("new URL('../vector-replay/vendor/rive.wasm',import.meta.url).href","window.__photonBundle.urls.wasm").replace("fetch('./native-caustic.rivx.gz')","fetch(window.__photonBundle.urls.native)").replace("fetch('./ink-pool.riv')","fetch(window.__photonBundle.urls.ink)");
    map.imports['photon/'+name]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  }
  const imports=document.createElement('script');imports.type='importmap';imports.textContent=JSON.stringify(map);document.head.append(imports);
  const start=document.createElement('script');start.type='module';start.textContent="import 'photon/app.js';";document.body.append(start);`;
  return html.replace('<link rel="stylesheet" href="style.css">','<style>'+css+'</style>')
    .replace('<script src="../lab-health.js"></script>','')
    .replace(/<p id="bundled-example">[\s\S]*?<\/p>/,'')
    .replace('<a href="../index.html">← RIVX</a>','<span>PORTABLE RIVX PHOTON STUDY · OFFICIAL RIVE + CUSTOM WEBGL2</span>')
    .replace('<script type="module" src="app.js"></script>','<script>'+loader+'</script>');
}
