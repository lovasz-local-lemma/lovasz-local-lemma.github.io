/* Opening a capture record never pins normal scrolling to its fragment. */
(()=>{
  function revealRecord(){
    const id=decodeURIComponent(location.hash.slice(1));
    const node=id?document.getElementById(id):null;
    if(!node?.matches('.technical-record'))return;
    node.open=true;
    requestAnimationFrame(()=>node.scrollIntoView({block:'start',behavior:'instant'}));
  }
  addEventListener('hashchange',revealRecord);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',revealRecord,{once:true});else revealRecord();
})();
