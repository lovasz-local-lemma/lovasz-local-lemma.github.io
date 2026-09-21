// Display-only, frame-rate-independent easing. Never modifies policy buffers.
(function(BF){
  'use strict';
  function make(tauMs=65){
    const values=new Map();
    let last=null,identity,enabled=false,alpha=1;
    function reset(){values.clear();last=null;identity=undefined;alpha=1;}
    function begin(now,options={}){
      const next=!!options.enabled,time=Number.isFinite(now)?now:0;
      const restart=last===null||options.identity!==identity||next!==enabled||time<last||time-last>250;
      if(restart)values.clear();
      alpha=restart?1:1-Math.exp(-Math.max(0,time-last)/Math.max(1,tauMs));
      enabled=next;identity=options.identity;last=time;
    }
    function scalar(key,target){
      if(!enabled)return target;
      const previous=values.get(key);
      const result=typeof previous==='number'&&Number.isFinite(previous)&&Number.isFinite(target)?previous+(target-previous)*alpha:target;
      values.set(key,result);return result;
    }
    function vector(key,target){
      if(!enabled||!target)return target;
      let buffer=values.get(key);
      if(!(buffer instanceof Float64Array)||buffer.length!==target.length){buffer=Float64Array.from(target);values.set(key,buffer);return buffer;}
      for(let i=0;i<buffer.length;i++)buffer[i]=Number.isFinite(buffer[i])&&Number.isFinite(target[i])?buffer[i]+(target[i]-buffer[i])*alpha:target[i];
      return buffer;
    }
    return{begin,scalar,vector,reset};
  }
  BF.visualMotion={make};
})(window.BF=window.BF||{});
