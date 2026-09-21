const $=id=>document.getElementById(id);
let lastField=null,lastDisplay='',atlasImage,retainedImage,differenceImage;
function bitmap(field,source){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=field.size;
 const context=canvas.getContext('2d'),image=context.createImageData(field.size,field.size),maximum=Math.max(field.peak,1e-12);
 for(let y=0;y<field.size;y++)for(let x=0;x<field.size;x++){
  const src=(y*field.size+x)*3,dst=((field.size-1-y)*field.size+x)*4;
  for(let channel=0;channel<3;channel++)image.data[dst+channel]=255*Math.log1p(source[src+channel]/maximum*30)/Math.log(31);
  image.data[dst+3]=255;
 }
 context.putImageData(image,0,0);return canvas;
}
function errorBitmap(field,amplification,signed){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=field.size;
 const context=canvas.getContext('2d'),image=context.createImageData(field.size,field.size),maximum=Math.max(field.peak,1e-12);
 for(let y=0;y<field.size;y++)for(let x=0;x<field.size;x++){
  const src=(y*field.size+x)*3,dst=((field.size-1-y)*field.size+x)*4;
  let error=0;for(let c=0;c<3;c++)error+=signed?field.baked[src+c]-field.retained[src+c]:Math.abs(field.baked[src+c]-field.retained[src+c]);
  const amount=Math.sqrt(Math.min(1,Math.abs(error)*amplification/(maximum*3))),color=signed&&error<0?[83,196,226]:[239,193,112];
  for(let c=0;c<3;c++)image.data[dst+c]=[5,13,18][c]+color[c]*amount;
  image.data[dst+3]=255;
 }
 context.putImageData(image,0,0);return canvas;
}
function text(id,value){if($(id).textContent!==value)$(id).textContent=value;}
export function drawReceiverComparison(field,state){
 const identity=[state.comparison,state.wipe,state.difference].join(':');
 if(field===lastField&&identity===lastDisplay)return;
 if(field!==lastField){atlasImage=bitmap(field,field.baked);retainedImage=bitmap(field,field.retained);}
 const canvas=$('receiver-comparison-view'),context=canvas.getContext('2d');
 // A constant canvas box prevents display modes from changing the embed height.
 if(canvas.width!==1000){canvas.width=1000;canvas.height=620;}
 context.fillStyle='#071116';context.fillRect(0,0,1000,620);context.imageSmoothingEnabled=true;
 const side=state.comparison==='side',difference=state.comparison==='signed'||state.comparison==='absolute';
 if(side){
  context.drawImage(atlasImage,16,66,472,472);context.drawImage(retainedImage,512,66,472,472);
  context.fillStyle='#ecc987';context.font='20px system-ui';context.fillText('Stored atlas',24,38);context.fillStyle='#83cfca';context.fillText('Retained splats',520,38);
 }else{
  const left=222,top=34,size=550;
  if(difference){differenceImage=errorBitmap(field,state.difference,state.comparison==='signed');context.drawImage(differenceImage,left,top,size,size);}
  else{
   context.drawImage(retainedImage,left,top,size,size);context.save();context.beginPath();context.rect(left,top,size*state.wipe/100,size);context.clip();context.drawImage(atlasImage,left,top,size,size);context.restore();
   const x=left+size*state.wipe/100;context.strokeStyle='#ecc987';context.lineWidth=2;context.beginPath();context.moveTo(x,top);context.lineTo(x,top+size);context.stroke();
   context.fillStyle='#ecc987';context.font='17px system-ui';context.fillText('Stored atlas',32,294);context.fillStyle='#83cfca';context.fillText('Retained splats',816,294);
  }
  context.strokeStyle='#3a5860';context.lineWidth=1;context.strokeRect(left-.5,top-.5,size+1,size+1);
 }
 const metrics=field.metrics,percent=value=>value===null?'—':(100*value).toFixed(2)+'%';
 text('comparison-l1',percent(metrics.relativeL1));text('comparison-rmse',percent(metrics.relativeRMSE));
 text('comparison-mass',metrics.retainedMass.toFixed(5)+' / '+metrics.bakedMass.toFixed(5));
 text('comparison-clock',field.gate?`${field.time.toFixed(4)} m · ${field.width.toFixed(4)} m window`:'Ungated receiver field');
 text('comparison-legend',state.comparison==='signed'?`Gold: atlas exceeds splats. Blue: splats exceed atlas. Linear error ×${state.difference}, mapped to display colour.`:state.comparison==='absolute'?`Gold: absolute atlas–splat difference, ×${state.difference}, mapped to display colour.`:'One shared display curve for both fields. Registered in the same receiver coordinates.');
 const dataset=$('receiver-comparison').dataset;dataset.relativeL1=metrics.relativeL1;dataset.relativeRmse=metrics.relativeRMSE;dataset.mode=state.comparison;dataset.passes=field.passes;dataset.time=field.time;
 lastField=field;lastDisplay=identity;
}
