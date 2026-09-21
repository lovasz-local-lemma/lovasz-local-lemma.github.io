// Curated setups contain public scene numbers and names, never code or assets.
export const sourcePresets={above:{lightX:-2.7,lightY:6.4,lightZ:1.4},camera:{lightX:3.8,lightY:.85,lightZ:6.2},right:{lightX:4.4,lightY:3.9,lightZ:1.7}};
export const ranges={flowView:[0,1],flowStrength:[0,2],flowFeed:[0,2],brightness:[0,5],torchYaw:[-50,50],torchPitch:[-50,50],sourceShape:[0,2],sourceRadius:[0,.5],dispersion:[0,.08],aimX:[0,1],aimY:[0,1],radius:[.08,.5],density:[0,.5],gate:[0,1],gateWidth:[.08,4],mode:[0,3],ior:[1.05,2],exposure:[.2,3],photons:[512,65536],materialPair:[0,9],skin:[0,2],wire:[0,1],mediumMode:[0,6],mediumScale:[.7,5],mediumContrast:[0,1],lightX:[-4.5,4.8],lightY:[.35,7.5],lightZ:[-3.4,6.8],sphereX:[-3.2,2.4],sphereY:[.5,4.2],sphereZ:[-2.6,2.5],sphereRadius:[.35,1.3],metalX:[-3.2,3.8],metalY:[.45,4.2],metalZ:[-2.6,2.5],metalRadius:[.35,1.3],bump:[0,1],kernel:[.025,.16],feather:[.1,.75]};
const switches=['flowEnabled','flowPaused','temporal','playing','cycleMaterials','followTransport','animateMedium','progressive','temporalHistory'];
export function normalizeSetup(source,defaults){
 if(!source||typeof source!=='object'||Array.isArray(source))throw Error('A setup needs a settings object.');
 const value={...defaults};for(const [key,range]of Object.entries(ranges)){if(source[key]===undefined)continue;if(typeof source[key]!=='number'||!Number.isFinite(source[key]))throw Error('Invalid scene value: '+key);value[key]=Math.max(range[0],Math.min(range[1],source[key]));}
 for(const key of switches)if(source[key]!==undefined){if(typeof source[key]!=='number'||!Number.isFinite(source[key]))throw Error('Invalid scene value: '+key);value[key]=source[key]>.5?1:0;}
 for(const key of ['flowView','mode','materialPair','skin','mediumMode','photons','sourceShape'])value[key]=Math.round(value[key]);
 value.sphereY=Math.max(value.sphereY,value.sphereRadius+.08);value.metalY=Math.max(value.metalY,value.metalRadius+.1);value.reset=0;return value;
}
export function parseSetups(text,defaults){
 const data=JSON.parse(text);if(data.format!=='RIVX-FLASHLIGHT-SETUPS-1'||!Array.isArray(data.setups)||data.setups.length>100)throw Error('Expected a flashlight setup list with at most 100 entries.');
 return data.setups.map((entry,i)=>({name:String(entry.name||'Setup '+(i+1)).replace(/[\x00-\x1f]/g,'').slice(0,80),settings:normalizeSetup(entry.settings,defaults)}));
}
export function aimAtSphere(settings,prefix='sphere'){
 const E=[5.3,3.75,7.6],look=[0,1.55,-.05],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),norm=a=>a.map(v=>v/Math.hypot(...a)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const f=norm(sub(look,E)),r=norm(cross(f,[0,1,0])),u=cross(r,f),q=sub([settings[prefix+'X'],settings[prefix+'Y'],settings[prefix+'Z']],E),z=dot(q,f);
 return {aimX:Math.max(0,Math.min(1,(dot(q,r)/z/(.48*1040/640)+1)*.5)),aimY:Math.max(0,Math.min(1,(1-dot(q,u)/z/.48)*.5))};
}
