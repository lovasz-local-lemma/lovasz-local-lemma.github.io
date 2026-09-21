'use strict';
// All scene intersections, random draws and estimator arithmetic run in CRuby.
// The worker keeps the JavaScript canvas/UI thread responsive during Ruby batches.
importScripts('vendor/ruby-browser.umd.js');
let vm;
const boot=(async()=>{
  const response=await fetch('vendor/ruby+stdlib.wasm');
  if(!response.ok)throw new Error('Ruby runtime HTTP '+response.status);
  const module=await WebAssembly.compile(await response.arrayBuffer());
  ({vm}=await self['ruby-wasm-wasi'].DefaultRubyVM(module));
  const source=await fetch('transport.rb');
  if(!source.ok)throw new Error('Transport engine HTTP '+source.status);
  vm.eval(await source.text());
  return vm.eval('RUBY_VERSION').toString();
})();
let queue=Promise.resolve();
self.onmessage=({data})=>{
  queue=queue.then(async()=>{
    try{
      const rubyVersion=await boot;
      const bytes=new TextEncoder().encode(JSON.stringify(data.request));
      const encoded=btoa(String.fromCharCode(...bytes));
      const start=performance.now();
      const result=JSON.parse(vm.eval(`FlatlandTransport.dispatch_json('${encoded}'.unpack1('m0'))`).toString());
      self.postMessage({id:data.id,result,rubyVersion,computeMs:performance.now()-start});
    }catch(error){self.postMessage({id:data.id,error:error?.message||String(error)});}
  });
};
