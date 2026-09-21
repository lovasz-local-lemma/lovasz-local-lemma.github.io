import * as THREE from 'three';
import {makeGlassStudy} from './glass-study.js';

// The focused companion needs neither the Rive WASM nor its 7.6 MB scene file.
// Its atlas is extracted from that file at build time, never rebaked at runtime.
const [meta,extracted]=await Promise.all(['projection-rich.json','glass-breakdown.json'].map(async url=>{const response=await fetch(url);if(!response.ok)throw Error('Glass inspection resource unavailable');return response.json();}));
let frame=20,playing=false,raf=0,last=0,hostPaused=false,visible=true,study;
const play=document.getElementById('study-play');play.hidden=false;
const section=document.getElementById('glass-study');
section.querySelector('.study-heading p').textContent='Two ways to carry glass appearance through the Rive workflow: compute a fresh response, or play images of a fixed authored orbit. The volume below is extracted from our real ordinary .riv export.';
section.querySelector('.toolbar>span').textContent='The same 240-frame, 60 fps authored orbit.';
section.querySelectorAll('.study-scope').forEach(p=>{p.innerHTML=p.innerHTML.replaceAll('ordinary .riv above','ordinary keyed .riv export');});
function wake(){if(!raf&&!hostPaused&&visible&&!document.hidden)raf=requestAnimationFrame(tick);}
function tick(now){raf=0;if(hostPaused||!visible||document.hidden){last=0;return;}if(playing&&last)frame=(frame+Math.min(.1,(now-last)/1000)*60)%240;last=now;study.draw(frame);if(playing)wake();}
function seek(value){frame=value;playing=false;play.textContent='Play orbit';last=0;wake();}
study=makeGlassStudy(THREE,meta,extracted,{invalidate:wake,seek});
play.onclick=()=>{playing=!playing;play.textContent=playing?'Pause orbit':'Play orbit';last=0;wake();};
document.addEventListener('visibilitychange',()=>{last=0;wake();});
const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;last=0;wake();});observer.observe(section);
window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='portfolio-lab-visibility'){hostPaused=!event.data.visible;last=0;wake();}});
window.addEventListener('pagehide',event=>{if(raf)cancelAnimationFrame(raf);raf=0;if(!event.persisted){observer.disconnect();study.dispose();}});
window.addEventListener('pageshow',()=>{last=0;wake();});
document.body.dataset.ready='true';document.body.dataset.owner='browser-webgl-companion';
if(parent!==window)parent.postMessage({type:'portfolio-lab-preview-ready'},location.origin);wake();
