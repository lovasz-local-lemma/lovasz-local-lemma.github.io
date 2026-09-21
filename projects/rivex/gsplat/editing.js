// Spatial masks are authoring selections, not learned semantic labels.
export const defaultEdit = Object.freeze({region:1,shiftX:0,lift:0,size:1,tint:'#a48bff',tintAmount:0,opacity:1,isolate:false,sliceAxis:0,slice:1.1,paint:0,paintAngle:35,paintColor:'#6ae6ff'});
export const regionNames=['Entire field','Glass region','Room region','Left wall region','Right wall region','Floor region','Ceiling region'];
const center=[-.25,-.6,.1],C0=.28209479177387814;
export const hexRgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
export function inRegion(x,y,z,region){
 const glass=(x-center[0])**2+(y-center[1])**2+(z-center[2])**2<.49**2;
 return region===0||(region===1&&glass)||(region===2&&!glass)||(region===3&&x<-.82)||(region===4&&x>.82)||(region===5&&y<-.82)||(region===6&&y>.82);
}
export function applyEdits(original,edit,working){
 const out=working||{...original,positions:new Float32Array(original.positions.length),records:new Float32Array(original.records.length)};
 out.records.set(original.records);out.positions.set(original.positions);
 const tint=hexRgb(edit.tint),paintColor=hexRgb(edit.paintColor),angle=edit.paintAngle*Math.PI/180;
 // A movable, view-independent Gaussian color accent in world space. It does
 // not recover reflectance, normals, visibility, or the original illumination.
 const light=[Math.sin(angle)*1.05, .05+edit.lift, .1+Math.cos(angle)*1.05];
 const pivot=edit.region===1?center:[0,0,0];let selected=0,remaining=0;
 for(let i=0;i<original.count;i++){
  const b=i*80,p=i*3,x=original.positions[p],y=original.positions[p+1],z=original.positions[p+2];
  const chosen=inRegion(x,y,z,edit.region);
  if(chosen){
   selected++;
   out.positions[p]=pivot[0]+(x-pivot[0])*edit.size+edit.shiftX;
   out.positions[p+1]=pivot[1]+(y-pivot[1])*edit.size+edit.lift;
   out.positions[p+2]=pivot[2]+(z-pivot[2])*edit.size;
   out.records.set(out.positions.subarray(p,p+3),b);
   for(let c=4;c<10;c++)out.records[b+c]*=edit.size**2;
   out.records[b+3]*=edit.opacity;
   const d2=(out.positions[p]-light[0])**2+(out.positions[p+1]-light[1])**2+(out.positions[p+2]-light[2])**2;
   const accent=edit.paint*Math.exp(-d2/(2*.7**2));
   for(let c=0;c<3;c++){
    const gain=1+(tint[c]-1)*edit.tintAmount;
    // C = .5 + sum(SH*basis). Multiplying C by gain changes the constant
    // offset too; merely multiplying all coefficients would be incorrect.
    for(let j=0;j<16;j++)out.records[b+12+j*4+c]*=gain;
    out.records[b+12+c]+=(.5*(gain-1)+accent*paintColor[c])/C0;
   }
  }else if(edit.isolate)out.records[b+3]=0;
  if(edit.sliceAxis&&out.positions[p+edit.sliceAxis-1]>edit.slice)out.records[b+3]=0;
  if(out.records[b+3]>0)remaining++;
 }
 out.edit={...edit};out.selected=selected;out.remaining=remaining;
 return out;
}

// Export in the SAME native PLY dialect. No viewer-only color inversion, film
// filter, splat footprint scale, exposure, or camera state is baked into it.
export function editedPly(cloud,{crop=false}={}){
 const source=cloud.source,edit=cloud.edit||defaultEdit;
 if(!source)throw Error('The original PLY resource is unavailable');
 const kept=[];
 for(let i=0;i<cloud.count;i++){
  const p=i*3;
  if(cloud.records[i*80+3]<=0)continue;
  if(crop&&Math.max(Math.abs(cloud.positions[p]),Math.abs(cloud.positions[p+1]),Math.abs(cloud.positions[p+2]))>1.045)continue;
  kept.push(i);
 }
 if(!kept.length)throw Error('The selection contains no visible Gaussian centers to export');
 const header='ply\nformat binary_little_endian 1.0\ncomment Edited RIVX native field; baked appearance, not inverse-rendered material\nelement vertex '+kept.length+'\n'+source.names.map(n=>'property float '+n+'\n').join('')+'end_header\n';
 const encoded=new TextEncoder().encode(header),bytes=new Uint8Array(encoded.length+kept.length*source.stride);bytes.set(encoded);
 const view=new DataView(bytes.buffer),old=new DataView(source.buffer);
 const field=(base,name,value)=>view.setFloat32(base+source.fields[name],value,true);
 for(let j=0;j<kept.length;j++){
  const i=kept[j],base=encoded.length+j*source.stride,oldBase=source.offset+i*source.stride,b=i*80,p=i*3;
  bytes.set(new Uint8Array(source.buffer,oldBase,source.stride),base);
  for(let c=0;c<3;c++)field(base,['x','y','z'][c],cloud.positions[p+c]);
  const chosen=inRegion(old.getFloat32(oldBase+source.fields.x,true),old.getFloat32(oldBase+source.fields.y,true),old.getFloat32(oldBase+source.fields.z,true),edit.region);
  for(let c=0;c<3;c++)field(base,'scale_'+c,old.getFloat32(oldBase+source.fields['scale_'+c],true)*(chosen?edit.size:1));
  field(base,'opacity',cloud.records[b+3]);
  for(let c=0;c<3;c++)for(let k=0;k<16;k++)field(base,`sh_${c}_${k}`,cloud.records[b+12+k*4+c]);
 }
 return {bytes,count:kept.length};
}

export function editRecipe(edit,state,asset){
 return {format:'RIVX-GAUSSIAN-EDIT-1',asset,edit:{...edit},view:{yaw:state.yaw,pitch:state.pitch,distance:state.distance,scale:state.scale,exposure:state.exposure,style:state.style,directional:state.directional,crop:state.crop,training:state.training},note:'Appearance edits to a baked Gaussian field. Light paint is a spatial SH color accent; no recovered BRDF, relighting visibility, shadow or refraction solve.'};
}

export function validateRecipe(value){
 if(value?.format!=='RIVX-GAUSSIAN-EDIT-1'||!['glass-room.ply','glass-room-final.ply'].includes(value.asset))throw Error('Choose a Gaussian edit recipe exported by this page');
 const edit={...defaultEdit},limits={region:[0,6],shiftX:[-.8,.8],lift:[-.6,1.2],size:[.5,1.7],tintAmount:[0,1],opacity:[0,1],sliceAxis:[0,3],slice:[-1.2,1.2],paint:[0,3],paintAngle:[-180,180]};
 for(const [key,[lo,hi]]of Object.entries(limits)){const v=value.edit?.[key];if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)throw Error('Invalid edit control: '+key);edit[key]=v;}
 for(const key of ['tint','paintColor']){if(!/^#[0-9a-f]{6}$/i.test(value.edit?.[key]))throw Error('Invalid color: '+key);edit[key]=value.edit[key];}
 if(typeof value.edit?.isolate!=='boolean')throw Error('Invalid isolation control');edit.isolate=value.edit.isolate;
 for(const k of ['region','sliceAxis'])if(!Number.isInteger(edit[k]))throw Error('Invalid selection control');
 const v=value.view||{},view={};
 const ranges={yaw:[-1e6,1e6],pitch:[-1.3,1.3],distance:[1.8,8],scale:[.15,1.8],exposure:[.5,2],style:[0,2]};
 for(const [k,[lo,hi]]of Object.entries(ranges)){if(!Number.isFinite(v[k])||v[k]<lo||v[k]>hi)throw Error('Invalid view control: '+k);view[k]=v[k];}
 for(const k of ['directional','crop','training']){if(typeof v[k]!=='boolean')throw Error('Invalid view control: '+k);view[k]=v[k];}
 return {asset:value.asset,edit,view};
}
