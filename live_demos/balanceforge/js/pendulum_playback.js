// Replay scheduling only. Disturbances remain real physical impulses/pulses.
(function(BF){
 'use strict';
 function create(mode){return {mode:mode||'release',settled:0,phase:mode==='hold'?'holding':'acquiring',armed:mode==='hold'};}
 function tick(run,dt,links,holding){
  const above=links.every(l=>Number.isFinite(l.cos)?l.cos>0:l>0);
  if(run.phase==='holding'&&!above){run.phase='recovering';run.settled=0;}
  const inCatch=holding==null?links.every(l=>Number.isFinite(l.cos)?l.cos>.5:l>.5):holding;
  run.settled=inCatch?run.settled+dt:0;
  if(run.settled>=2){run.phase='holding';run.armed=true;}
  // Once armed, disturbances continue through a recovery. They are delayed
  // only for initial acquisition, not disabled whenever a controller struggles.
  return run;
 }
 const labels={acquiring:'Swing / recovery',holding:'Holding + recovery test',recovering:'Recovering after disturbance'};
 BF.pendulumPlayback={create,tick,labels};
})(window.BF);
