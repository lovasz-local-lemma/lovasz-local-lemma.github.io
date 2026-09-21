// GPU image effects, followed optionally by explicit screen-space line extraction.
export function makeEffects(canvas, curves) {
 const gl=canvas.getContext('webgl2',{alpha:false,preserveDrawingBuffer:true});
 if(!gl)throw Error('WebGL2 is required for the effect stage.');
 const vertex=`#version 300 es
 precision highp float;out vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`;
 const fragment=`#version 300 es
 precision highp float;
 in vec2 uv;out vec4 color;uniform sampler2D source;uniform int mode;uniform float density,strength;uniform vec2 size;
 vec3 rgb(vec2 p){return texture(source,clamp(p,vec2(0),vec2(1))).rgb;}float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
 void main(){vec2 p=vec2(uv.x,1.-uv.y),d=1./size;vec3 c=rgb(p);float l=lum(c);float gx=lum(rgb(p+vec2(d.x,0)))-lum(rgb(p-vec2(d.x,0)));float gy=lum(rgb(p+vec2(0,d.y)))-lum(rgb(p-vec2(0,d.y)));float edge=length(vec2(gx,gy));vec3 paper=vec3(.025,.057,.067);vec3 ink=vec3(.90,.67,.35);
 if(mode==5){float best=1e8;vec3 chosen=c;int radius=3+int(strength*3.);for(int quadrant=0;quadrant<4;quadrant++){vec3 sum=vec3(0),square=vec3(0);float n=0.;vec2 signQ=vec2(quadrant%2==0?-1.:1.,quadrant<2?-1.:1.);for(int y=0;y<=9;y++)for(int x=0;x<=9;x++){if(x>radius||y>radius)continue;vec3 s=rgb(p+vec2(x,y)*signQ*d);sum+=s;square+=s*s;n++;}vec3 mean=sum/n;float variance=dot(max(vec3(0),square/n-mean*mean),vec3(1));if(variance<best){best=variance;chosen=mean;}}float tooth=.98+.02*sin(p.x*size.x*2.)*sin(p.y*size.y*2.7);color=vec4(chosen*tooth,1);return;}
 if(mode==0){color=vec4(c,1);return;}
 if(mode==1){float t=l*density*.55;float isoline=1.-smoothstep(.035,.035+fwidth(t)*1.5,abs(fract(t)-.5));float shade=smoothstep(.06,.32,l);float hatch=1.-smoothstep(.1,.32,abs(fract((p.x*size.x+p.y*size.y)/9.)-.5));float v=max(isoline*shade,edge*4.);v=max(v,hatch*smoothstep(.12,.45,l)*.36);color=vec4(mix(paper,ink,clamp(v*strength,0.,1.)),1);return;}
 color=vec4(c,1);}`;
 const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const program=gl.createProgram(),vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.deleteShader(vs);gl.deleteShader(fs);gl.useProgram(program);
 const uniforms={};for(const n of ['source','mode','density','strength','size'])uniforms[n]=gl.getUniformLocation(program,n);
 const source=gl.createTexture();
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.uniform1i(uniforms.source,0);gl.uniform2f(uniforms.size,720,480);
 const field=document.createElement('canvas');field.width=240;field.height=160;const ctx=field.getContext('2d',{willReadFrequently:true}),out=curves.getContext('2d');
 let segments=[];
 const pairs=[[],[3,0],[0,1],[3,1],[1,2],[3,2,0,1],[0,2],[3,2],[2,3],[0,2],[0,3,1,2],[1,2],[1,3],[0,1],[3,0],[]];
 function contours(input,density,strength){
  ctx.clearRect(0,0,240,160);ctx.drawImage(input,0,0,240,160);const data=ctx.getImageData(0,0,240,160).data;const values=new Float32Array(240*160);
  for(let i=0;i<values.length;i++)values[i]=(data[4*i]*.2126+data[4*i+1]*.7152+data[4*i+2]*.0722)/255;
  segments=[];const levels=Math.max(2,Math.round(density/6));out.fillStyle='#08171b';out.fillRect(0,0,720,480);out.lineWidth=.65+strength;
  for(let level=1;level<=levels;level++){const iso=.05+level/(levels+1)*.76;out.beginPath();out.strokeStyle=`hsl(${164+level*10} 70% ${45+level/levels*30}%)`;
   for(let y=0;y<159;y++)for(let x=0;x<239;x++){const v=[values[y*240+x],values[y*240+x+1],values[(y+1)*240+x+1],values[(y+1)*240+x]],mask=(v[0]>iso?1:0)|(v[1]>iso?2:0)|(v[2]>iso?4:0)|(v[3]>iso?8:0),q=pairs[mask];if(!q.length)continue;
    const corners=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]],edge=e=>{const j=(e+1)%4,t=Math.max(0,Math.min(1,(iso-v[e])/(v[j]-v[e]||1e-8)));return [(corners[e][0]+(corners[j][0]-corners[e][0])*t)*3,(corners[e][1]+(corners[j][1]-corners[e][1])*t)*3];};
    for(let k=0;k<q.length;k+=2){const a=edge(q[k]),b=edge(q[k+1]);out.moveTo(...a);out.lineTo(...b);segments.push({a,b,color:out.strokeStyle});}
   }out.stroke();
  }return segments.length;
 }
 return {draw(input,state,time){
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,input);
  curves.hidden=state.preset!=='curves';canvas.hidden=state.preset==='curves';
  if(state.preset==='curves')return {segments:contours(input,state.density,state.strength),history:0};
  const mode={source:0,ink:1,oil:5}[state.preset]??0;gl.useProgram(program);gl.viewport(0,0,720,480);gl.uniform1i(uniforms.mode,mode);gl.uniform1f(uniforms.density,state.density);gl.uniform1f(uniforms.strength,state.strength);gl.drawArrays(gl.TRIANGLES,0,3);return {segments:0,history:0};
 },segments(input,density,strength){contours(input,density,strength);return segments;},clear(){},svg(input,state){contours(input,state.density,state.strength);const lines=segments.map(s=>`<path d="M${s.a.map(x=>x.toFixed(2)).join(',')}L${s.b.map(x=>x.toFixed(2)).join(',')}" stroke="${s.color}"/>`).join('');return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480"><rect width="720" height="480" fill="#08171b"/><g fill="none" stroke-width="${(.65+state.strength).toFixed(2)}">${lines}</g></svg>`;},dispose(){gl.deleteTexture(source);gl.deleteProgram(program);}};
}
