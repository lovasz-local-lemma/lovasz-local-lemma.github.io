/** The square membrane's material coordinates and modal recipe, shared with the signed instrument. */
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function modalTerms(v={}) {
  const sx=v.strikeX??.31,sy=v.strikeY??.44,damping=v.damping??.18;
  const result=[];
  for(let n=1;n<=3;n++)for(let m=1;m<=3;m++){
    const order=n*n+m*m,ratio=Math.sqrt(order/2);
    result.push({n,m,ratio,weight:Math.sin(Math.PI*n*sx)*Math.sin(Math.PI*m*sy)*Math.exp(-.032*order)/ratio,
      decay:(.25+2.4*damping)*(1+.055*order)});
  }
  return result;
}
export function eigenField(x,y,v={},age=v.strikeTime??0) {
  if((v.excitationMode??0)<.5){const n=v.n??2,m=v.m??3,k=v.mix??.72;return (Math.sin(n*Math.PI*x)*Math.sin(m*Math.PI*y)+k*Math.sin(m*Math.PI*x)*Math.sin(n*Math.PI*y))/(1+Math.abs(k));}
  let sum=0;
  for(const t of modalTerms(v))sum+=Math.sin(Math.PI*t.n*x)*Math.sin(Math.PI*t.m*y)*t.weight*Math.sin(Math.PI*.5*age*t.ratio)*Math.exp(-t.decay*age)*4/4.6;
  return sum;
}
export function surfacePoint(x,y) {
  const length=Math.hypot(4.35,4.3,5.75),fx=-4.35/length,fy=-4.3/length,fz=-5.75/length;
  const rl=Math.hypot(fx,fz),rx=-fz/rl,rz=fx/rl,ux=-rz*fy,uy=rz*fx-rx*fz,uz=rx*fy;
  const sx=((x-36)/1040*2-1)*1040/640,sy=1-(y-168)/640*2;
  const dx=fx*3+rx*sx+ux*sy,dy=fy*3+uy*sy,dz=fz*3+rz*sx+uz*sy;
  const t=(.54-4.55)/dy,px=4.35+dx*t,pz=5.75+dz*t;
  return Math.abs(px)<=2&&Math.abs(pz)<=2&&t>0?{x:(px+2)/4,y:(pz+2)/4}:null;
}
const inside=(p,x,y,w,h)=>p.x>=x&&p.x<=x+w&&p.y>=y&&p.y<=y+h;
export function strikeModal(v,put,x=v.strikeX??.31,y=v.strikeY??.44){
  put('strikeX',clamp(x,.015,.985));put('strikeY',clamp(y,.015,.985));put('excitationMode',1);
  put('strikeTime',0);put('strikeSerial',(v.strikeSerial??0)+1);put('playing',1);
}
/** Returns false for an unrelated gesture, true for a button/strike, or a slider key for dragging. */
export function handleModalGesture(p,v,put){
  if(inside(p,650,705,116,32)){put('excitationMode',0);return true;}
  if(inside(p,776,705,116,32)){strikeModal(v,put);return true;}
  if(inside(p,902,705,110,32)){const enabled=(v.audioEnabled??0)<.5;put('audioEnabled',enabled?1:0);if(enabled)strikeModal(v,put);return true;}
  if(inside(p,446,764,262,25)){updateModalDrag('damping',p,v,put);return 'damping';}
  if(inside(p,744,764,274,25)){updateModalDrag('fundamental',p,v,put);return 'fundamental';}
  if(inside(p,1176,266,144,144)){strikeModal(v,put,(p.x-1176)/144,(p.y-266)/144);return true;}
  if(inside(p,50,255,1010,428)){const hit=surfacePoint(p.x,p.y);if(hit){strikeModal(v,put,hit.x,hit.y);return true;}}
  return false;
}
export function updateModalDrag(kind,p,_v,put){
  if(kind==='damping')put('damping',clamp((p.x-456)/242,0,1));
  if(kind==='fundamental')put('fundamental',55*8**clamp((p.x-754)/254,0,1));
}
/** The external route owns this clock; a linked route should copy the signed strikeTime instead. */
export function advanceModalClock(v,seconds,previousSerial=v.strikeSerial??0){
  const reset=(v.strikeSerial??0)!==previousSerial;
  return (reset?0:v.strikeTime??0)+((v.playing??1)>.5?Math.min(seconds,.1):0);
}

/** Update ordinary Rive drawing properties used by comparison_geometry.py. */
export function updateModalInterface(v,put,label=()=>{},pointer={x:-100,y:-100}){
  const impulse=(v.excitationMode??0)>.5,age=v.strikeTime??0;
  label('dampingLabel','DECAY  '+(v.damping??.18).toFixed(2));
  label('pitchLabel','FUNDAMENTAL  '+Math.round(v.fundamental??110)+' Hz');
  label('listenLabel',(v.audioEnabled??0)>.5?'Sound on':'Listen');
  label('modeLabel',impulse?'Nine damped modes · click a new strike position':'Click the surface or diagram to strike · visual phase slowed');
  for(let i=0;i<3;i++){
    put('modalSelected'+i,(i===0?!impulse:i===1?impulse:(v.audioEnabled??0)>.5)?1:0);
    put('modalHover'+i,inside(pointer,[650,776,902][i],705,i===2?110:116,32)?1:0);
  }
  modalTerms(v).forEach((t,i)=>{
    const h=Math.max(1,Math.abs(t.weight)*Math.exp(-t.decay*age)*24);
    put(`modalEnergy${i}Y0`,734-h);put(`modalEnergy${i}Y1`,734);
  });
  const fractions=[v.damping??.18,Math.log((v.fundamental??110)/55)/Math.log(8)];
  fractions.forEach((t,i)=>{
    const x=[456,754][i],w=[242,254][i],thumb=x+w*t;
    put(`modalRail${i}X0`,x);put(`modalRail${i}X1`,thumb);put(`modalKnob${i}X0`,thumb);put(`modalKnob${i}X1`,thumb);
  });
  const x=1176+(v.strikeX??.31)*144,y=266+(v.strikeY??.44)*144;
  for(const [axis,pts] of [['H',[[x-5,y],[x+5,y]]],['V',[[x,y-5],[x,y+5]]]])pts.forEach((p,i)=>{put('modalStrike'+axis+'X'+i,p[0]);put('modalStrike'+axis+'Y'+i,p[1]);});
}
