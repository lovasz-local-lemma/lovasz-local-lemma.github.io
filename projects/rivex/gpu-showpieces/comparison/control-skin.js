export const fixedControlStyle=slug=>slug==='spectral-observatory'?3:2;
export const hasMaterialControls=slug=>['material-nocturne','spectral-observatory','resonant-membrane'].includes(slug);
export function makeControlState(){return {pointer:{x:-100,y:-100},open:false,time:0,spring:null,velocity:[0,0,0],glow:[]};}
export function controlButtons(slug){
 const buttons=slug==='resonant-membrane'?
 [[1124,478,78,'n',2],[1210,478,80,'n',3],[1298,478,82,'n',5],[1124,564,120,'mix',0],[1254,564,126,'mix',.72],[1124,652,78,'amplitude',.12],[1210,652,80,'amplitude',.26],[1298,652,82,'amplitude',.48]]:
 ['roughness','strength','light'].flatMap((key,row)=>[[.08,.32,.68],[0,.4,.85],[-.65,.2,.8]][row].map((value,col)=>[1124+col*87,478+row*87,80,key,value]));
 return [...buttons,[1124,730,120,'playing',0],[1254,730,126,'playing',1]];
}
const inside=(p,x,y,w,h)=>p.x>=x&&p.x<=x+w&&p.y>=y&&p.y<=y+h;
export function updateControlSkin(state,slug,v,dt,drag,write,label){
 const style=fixedControlStyle(slug);state.open=false;write('controlStyle',style);
 dt=Math.min(.05,dt);if(v.playing>.5)state.time+=dt;
 const targets=slug==='resonant-membrane'?[(v.n-2)/5,v.mix,(v.amplitude-.05)/.45]:[(v.roughness-.04)/.76,v.strength,(v.light+1)*.5];
 if(!state.spring)state.spring=[...targets];
 for(let step=0;step<4;step++)for(let i=0;i<3;i++){state.velocity[i]+=(240*(targets[i]-state.spring[i])-24*state.velocity[i])*dt*.25;state.spring[i]+=state.velocity[i]*dt*.25;}
 const p=state.pointer;let hover=p.x>=1109&&p.x<=1395?[529,615,705].findIndex(y=>Math.abs(p.y-y)<14)+1:0;
 if(drag?.kind==='slider')hover=drag.index+1;
 write('controlMenuOpen',0);
 controlButtons(slug).forEach(([x,y,w,key,target],i)=>{const goal=inside(p,x,y,w,36)?1:Math.abs(v[key]-target)<.001?.5:0;state.glow[i]=(state.glow[i]||0)+(goal-(state.glow[i]||0))*(1-Math.exp(-dt*15));write('controlButton'+i,state.glow[i]*.9);});
 return [294,450,state.time,0,...targets,style,p.x-1106,p.y-450,hover,drag?.kind==='slider'?1:0,...state.spring,0];
}
