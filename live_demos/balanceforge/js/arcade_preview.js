// Idle-only exhibition scheduler. It chooses records; it never trains, changes
// their physics, advances a hidden warm-up, or resumes after user interaction.
(function(BF){
  'use strict';
  function create(options) {
    const o=options, random=o.random || Math.random;
    let active=false, bag=[], current=null, remaining=0, duration=0, last=null;
    let visible=true, error=null;
    function snapshot(){return {active,current,remaining:Math.max(0,remaining),duration,visible,error};}
    function publish(){if(o.onChange)o.onChange(snapshot());}
    function refill(){
      bag=o.entries().slice();
      for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
      if(bag.length>1 && bag[bag.length-1].id===current?.id)[bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]];
    }
    function advance(){
      if(!bag.length)refill();
      if(!bag.length){active=false;publish();return;}
      current=bag.pop();duration=Math.max(5000,o.duration?o.duration(current):8000);remaining=duration;
      try{o.play(current);error=null;}catch(e){error=e.message || String(e);active=false;}
      publish();
    }
    return {
      start(now){if(active)return;active=true;last=now;bag=[];error=null;advance();},
      stop(){if(!active)return;active=false;last=null;publish();},
      visibility(value,now){visible=!!value;last=now;publish();},
      tick(now){
        if(!active)return;
        if(last===null){last=now;return;}
        const elapsed=Math.max(0,now-last);last=now;
        if(!visible)return;
        remaining-=elapsed;
        // A suspended browser never fast-forwards through an entire deck.
        if(remaining<=0)advance();else publish();
      },
      snapshot,
    };
  }
  BF.arcadePreview={create};
})(window.BF=window.BF||{});
