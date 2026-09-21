/* Display-referred native RadianceLab capture; never used as HDR radiance. */
(() => {
 'use strict';
 const source=new URL('../../../media/curated-previews/radiance-lab/caustic.png',document.currentScript.src);
 let pending;
 function load(){
  if(pending)return pending;
  pending=(async()=>{
   const image=new Image();image.src=source.href;await image.decode();
   // The recorded viewport, excluding menus and the surrounding editor panels.
   const crop={x:246,y:106,w:1360,h:792};
   const canvas=document.createElement('canvas');canvas.width=crop.w;canvas.height=crop.h;
   const ctx=canvas.getContext('2d');ctx.drawImage(image,crop.x,crop.y,crop.w,crop.h,0,0,crop.w,crop.h);
   const pixels=ctx.getImageData(0,0,crop.w,crop.h).data,data=new Float32Array(crop.w*crop.h*3);
   for(let i=0;i<crop.w*crop.h;i++)for(let c=0;c<3;c++)data[3*i+c]=pixels[4*i+c]/255;
   return {w:crop.w,h:crop.h,data,displayEncoded:true};
  })().catch(error=>{pending=null;throw error;});return pending;
 }
 globalThis.PhotoRenderCapture={load};
})();
