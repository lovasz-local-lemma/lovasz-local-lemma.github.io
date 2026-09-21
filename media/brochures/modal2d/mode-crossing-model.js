/* Five-coordinate coupled operator from Modal2D's authored teaching article.
   This is a teaching eigenproblem, not a geometric FEM solve. */
(function(root){
  'use strict';
  const N=5, base=[1,1.55,1.9,2.5,2.9], slope=[1.5,.15,-.55,.9,-.2];
  function operator(parameter,coupling){
    const matrix=new Float64Array(N*N);
    for(let i=0;i<N;i++){
      matrix[i*N+i]=base[i]+slope[i]*parameter;
      if(i+1<N)matrix[i*N+i+1]=matrix[(i+1)*N+i]=coupling;
    }
    return matrix;
  }
  // Cyclic Jacobi rotations, retaining the eigenvectors as well as eigenvalues.
  function solve(parameter,coupling){
    const matrix=operator(parameter,coupling), a=matrix.slice(), v=new Float64Array(N*N);
    for(let i=0;i<N;i++)v[i*N+i]=1;
    for(let sweep=0;sweep<40;sweep++){
      let off=0;
      for(let p=0;p<N;p++)for(let q=p+1;q<N;q++)off+=a[p*N+q]**2;
      if(off<1e-24)break;
      for(let p=0;p<N;p++)for(let q=p+1;q<N;q++){
        const apq=a[p*N+q];if(Math.abs(apq)<1e-15)continue;
        const theta=(a[q*N+q]-a[p*N+p])/(2*apq);
        const t=(theta>=0?1:-1)/(Math.abs(theta)+Math.sqrt(theta*theta+1));
        const c=1/Math.sqrt(1+t*t), s=t*c;
        for(let k=0;k<N;k++){const x=a[k*N+p],y=a[k*N+q];a[k*N+p]=c*x-s*y;a[k*N+q]=s*x+c*y;}
        for(let k=0;k<N;k++){const x=a[p*N+k],y=a[q*N+k];a[p*N+k]=c*x-s*y;a[q*N+k]=s*x+c*y;}
        for(let k=0;k<N;k++){const x=v[k*N+p],y=v[k*N+q];v[k*N+p]=c*x-s*y;v[k*N+q]=s*x+c*y;}
      }
    }
    const order=Array.from({length:N},(_,i)=>i).sort((i,j)=>a[i*N+i]-a[j*N+j]);
    return {matrix,values:order.map(i=>a[i*N+i]),vectors:order.map(i=>{
      const vector=Array.from({length:N},(_,r)=>v[r*N+i]);
      const norm=Math.hypot(...vector);return vector.map(x=>x/norm);
    })};
  }
  function characterMode(result,basis){
    return result.vectors.reduce((best,vector,index)=>vector[basis]**2>result.vectors[best][basis]**2?index:best,0);
  }
  function sweep(coupling,count=201){
    const samples=Array.from({length:count},(_,i)=>solve(i/(count-1),coupling));
    const approaches=[];
    for(let mode=0;mode<N-1;mode++)for(let i=1;i<count-1;i++){
      const gap=sample=>sample.values[mode+1]-sample.values[mode];
      const current=gap(samples[i]);
      if(current<gap(samples[i-1])&&current<=gap(samples[i+1])&&current<.3)
        approaches.push({parameter:i/(count-1),mode,gap:current});
    }
    approaches.sort((a,b)=>a.parameter-b.parameter);
    return {samples,approaches};
  }
  const api={operator,solve,characterMode,sweep};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ModalCrossingModel=api;
})(typeof window==='object'?window:globalThis);
