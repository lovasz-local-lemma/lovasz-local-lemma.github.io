import {presets} from './transport.js';
export const dynamicScenes={
  orbiting:{name:'Dancing chromatic lenses',base:'spectrum'},
  movingChain:{name:'Moving two-focus chain',base:'chain'},
  morph:{name:'Breathing analytical glass',base:'jewel'}
};
// Animation seconds and nanosecond-scale flight time are independent clocks.
// Each pose is retraced as a frozen scene; there is no moving-boundary Doppler model.
export function sceneAt(id,phase=0,amount=1){
  const kind=dynamicScenes[id],scene=structuredClone(presets[kind?.base||id]||presets.spectrum);
  if(!kind)return scene;
  const t=phase*2*Math.PI;
  if(id==='orbiting')scene.spheres.forEach((s,i)=>{
    s.c[0]+=.36*amount*Math.sin(t+i*2.1);s.c[1]+=.24*amount*Math.cos(t+i*1.4);s.c[2]+=.27*amount*Math.sin(t+i*.9);
    scene.lights[i].target=s.c.slice();
  });
  if(id==='movingChain'){
    scene.spheres[0].c[0]=.12*amount*Math.sin(t);scene.spheres[1].c[0]=.23*amount*Math.sin(t+.6);
    scene.spheres[1].c[1]+=.15*amount*Math.cos(t);scene.lights[0].target=scene.spheres[0].c.slice();
  }
  if(id==='morph'){
    const s=scene.spheres[0];s.axes=[.78*(1+.38*amount*Math.sin(t)),.78*(1-.25*amount*Math.sin(t)),.78*(1+.22*amount*Math.cos(t))];
    s.r=Math.max(...s.axes);s.c[0]=.26*amount*Math.cos(t);s.c[2]=.16*amount*Math.sin(t);
    scene.lights[0].target=s.c.slice();scene.lights[0].aperture=.78;scene.lights[0].color=[.42,.8,1];
  }
  scene.name=kind.name;return scene;
}
