/* Actual captured radiance remains in this worker. Only displayed results transfer. */
importScripts('./photo-models.js');
const M=PhotoModels,base=new URL('./assets/quad-lightfield/',self.location.href),loaded=new Map();
let manifest=null,latest=null,running=false,active=true;
async function metadata(){if(manifest)return manifest;const response=await fetch(new URL('manifest.json',base));if(!response.ok)throw Error('The rendered camera-array manifest is unavailable.');manifest=await response.json();return manifest;}
async function loadView(capture){if(loaded.has(capture.index))return loaded.get(capture.index);const response=await fetch(new URL(capture.file,base),{cache:'force-cache'});if(!response.ok)throw Error(`Capture ${capture.index} could not be loaded.`);let bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes[0]===31&&bytes[1]===139){if(typeof DecompressionStream!=='function')throw Error('This browser needs gzip DecompressionStream support to open the captured light field.');bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
 const image={...M.decodeRGBE(bytes,manifest.width,manifest.height),...capture};loaded.set(capture.index,image);return image;
}
async function loadSet(captures,key){let next=0,done=0;await Promise.all(Array.from({length:Math.min(4,captures.length)},async()=>{while(next<captures.length){if(!active)return;const capture=captures[next++];await loadView(capture);done++;self.postMessage({type:'progress',key,done,total:captures.length,cached:loaded.size});}}));}
function display(image){return {w:image.w,h:image.h,data:M.tone(image.data,.3)};}
function send(key,quality,field,settings){const merged=M.quadRefocus(field,settings.focus,settings.aperture,settings.shape,settings.profile,quality==='preview'?320:field.w),selected=field.images.find(im=>im.index===settings.camera),cameraRow=Math.floor(settings.camera/10),center=display(selected),raw=display(M.quadEPI(field,settings.row,cameraRow)),shear=display(M.quadEPI(field,settings.row,cameraRow,settings.focus)),focus=display(merged),images={center,focus,epi:raw,shear},transfers=Object.values(images).map(im=>im.data.buffer);
 self.postMessage({type:'result',key,quality,images,views:merged.views,coverage:merged.coverage,disparity:merged.disparity,width:field.w,height:field.h,selected:{row:selected.row,col:selected.col,u:selected.u,v:selected.v}},transfers);
}
async function run(){if(running||!active)return;running=true;try{while(latest&&active){const request=latest;latest=null;await metadata();const chosen=M.quadSelection(manifest.captures,request.settings.aperture,request.settings.shape,request.settings.profile).map(x=>x.image),row=Math.floor(request.settings.camera/10),needed=[...new Map([...chosen,...manifest.captures.filter(c=>c.row===row)].map(c=>[c.index,c])).values()];await loadSet(needed,request.key);if(!active){latest=latest||request;continue;}if(latest)continue;
   const field={w:manifest.width,h:manifest.height,camera:manifest.camera,images:needed.map(c=>loaded.get(c.index))};send(request.key,'preview',field,request.settings);
   // Leave an idle interval after the preview: a continuing drag supersedes the
   // expensive full-resolution pass while the main thread remains responsive.
   await new Promise(resolve=>setTimeout(resolve,120));if(!active)latest=latest||request;else if(!latest)send(request.key,'full',field,request.settings);
  }}catch(error){self.postMessage({type:'error',message:error.message});}finally{running=false;if(latest&&active)run();}}
self.onmessage=({data})=>{if(data.type==='active'){active=data.value;if(active)run();return;}if(data.type==='render'){latest=data;run();}};
