/* A genuine linear render from Aperture's CPU tracer, shared by the photo studies. */
(() => {
 'use strict';let cached=null,pending=null;
 const base=new URL('./assets/',document.currentScript.src);
 function load(){if(cached)return Promise.resolve(cached);if(pending)return pending;
  pending=Promise.all([fetch(new URL('aperture-atelier.json',base)),fetch(new URL('aperture-atelier.bin',base))]).then(async([meta,data])=>{
   if(!meta.ok||!data.ok)throw Error('The Aperture radiance fixture could not be loaded.');
   const info=await meta.json(),bytes=new Uint8Array(await data.arrayBuffer());cached={...PhotoModels.decodeRGBE(bytes,info.width,info.height),info};return cached;
  }).catch(error=>{pending=null;throw error;});return pending;
 }
 globalThis.PhotoSources={load,peek:()=>cached};
})();
