/* Dedicated numerical work, created only while its experiment is visible. */
importScripts('photo-edit-models.js');
let cachedImage=null,cachedSpectrum=null;
self.onmessage=event=>{
 const {id,type,image,options}=event.data;
 try{
  if(image){cachedImage=image;cachedSpectrum=null;}
  if(!cachedImage)throw new Error('No source image received.');
  const started=performance.now();let result;
  if(type==='gradient'){
   const scene=PhotoEditModels.gradientScene(cachedImage,options);
   result={...PhotoEditModels.poisson(scene.target,scene.donor,scene.mask,{...options,maxIterations:Math.max(220,Math.ceil(cachedImage.w*.8))}),scene};
  }else{
   if(!cachedSpectrum)cachedSpectrum=PhotoEditModels.spectrum(cachedImage);
   result=PhotoEditModels.filterSpectrum(cachedSpectrum,options);
  }
  self.postMessage({id,result,milliseconds:performance.now()-started});
 }catch(error){self.postMessage({id,error:error.message});}
};
