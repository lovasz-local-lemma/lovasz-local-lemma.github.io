// Native RealGsplat PLY dialect. Never guess original-Inria log scales/logit opacity.
export function parsePly(buffer) {
  const bytes = new Uint8Array(buffer), head = new TextDecoder().decode(bytes.subarray(0, 16384));
  const marker = 'end_header\n', end = head.indexOf(marker);
  if (end < 0 || !head.startsWith('ply\n') || !head.includes('format binary_little_endian 1.0')) throw Error('Expected binary little-endian PLY');
  const header = head.slice(0, end), count = Number(header.match(/element vertex (\d+)/)?.[1]);
  const names = [...header.matchAll(/^property float (\S+)$/gm)].map(x => x[1]);
  if (header.includes('f_dc_') || !names.includes('sh_0_15') || names.length !== 59 || !count) throw Error('Expected native RIVX/nrr degree-3 PLY (linear scales, linear opacity)');
  const offset = end + marker.length, stride = names.length * 4;
  if (offset + count * stride !== bytes.length) throw Error('PLY payload length does not match its vertex count');
  const view = new DataView(buffer), fields = Object.fromEntries(names.map((name, i) => [name, i * 4]));
  const positions = new Float32Array(count * 3), records = new Float32Array(count * 80);
  const get = (base, name) => view.getFloat32(base + fields[name], true);
  for (let i = 0; i < count; ++i) {
    const base = offset + i * stride, dst = i * 80;
    for (let c = 0; c < 3; ++c) records[dst + c] = positions[i * 3 + c] = get(base, ['x', 'y', 'z'][c]);
    records[dst + 3] = get(base, 'opacity');
    const q = [0, 1, 2, 3].map(j => get(base, `rot_${j}`));
    const length = Math.hypot(...q);
    if (!(length > 0)) throw Error('Invalid Gaussian orientation');
    const [w, x, y, z] = q.map(v => v / length);
    const axes = [[1 - 2 * (y*y+z*z), 2*(x*y+w*z), 2*(x*z-w*y)],
      [2*(x*y-w*z), 1-2*(x*x+z*z), 2*(y*z+w*x)],
      [2*(x*z+w*y), 2*(y*z-w*x), 1-2*(x*x+y*y)]];
    const cov = [0, 0, 0, 0, 0, 0];
    for (let j = 0; j < 3; ++j) {
      const s = get(base, `scale_${j}`), a = axes[j], ss = s * s;
      cov[0] += ss*a[0]*a[0]; cov[1] += ss*a[0]*a[1]; cov[2] += ss*a[0]*a[2];
      cov[3] += ss*a[1]*a[1]; cov[4] += ss*a[1]*a[2]; cov[5] += ss*a[2]*a[2];
    }
    records.set(cov, dst + 4);
    for (let j = 0; j < 16; ++j) for (let c = 0; c < 3; ++c) records[dst + 12 + 4*j + c] = get(base, `sh_${c}_${j}`);
  }
  if (records.some(x => !Number.isFinite(x))) throw Error('Non-finite Gaussian data');
  return { count, positions, records, source:{buffer,offset,stride,names,fields} };
}

const vertex = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in uint id;
uniform sampler2D data;
uniform vec3 eye, right, up, forward;
uniform vec2 viewport;
uniform float focal, scale, exposure;
uniform int style, directional, crop, displayClamp;
out vec2 uv;
out vec4 rgba;
vec4 readAt(int j) { int a=int(id)*20+j; return texelFetch(data,ivec2(a%2048,a/2048),0); }
void main() {
 vec4 p=readAt(0), a=readAt(1), b=readAt(2);
 vec3 d=p.xyz-eye;
 vec3 cam=vec3(dot(d,right),dot(d,up),dot(d,forward));
 if(cam.z<0.05 || (crop==1 && max(max(abs(p.x),abs(p.y)),abs(p.z))>1.045)){gl_Position=vec4(2,2,2,1);rgba=vec4(0);uv=vec2(0);return;}
 mat3 cov=mat3(a.x,a.y,a.z, a.y,a.w,b.x, a.z,b.x,b.y);
 vec3 jx=focal/cam.z*(right-forward*cam.x/cam.z);
 vec3 jy=focal/cam.z*(up-forward*cam.y/cam.z);
 float xx=dot(jx,cov*jx)*scale*scale+0.3;
 float xy=dot(jx,cov*jy)*scale*scale;
 float yy=dot(jy,cov*jy)*scale*scale+0.3;
 float mid=(xx+yy)*0.5, delta=length(vec2((xx-yy)*0.5,xy));
 float l1=max(mid+delta,0.1), l2=max(mid-delta,0.1);
 vec2 axis=abs(xy)>1e-6?normalize(vec2(xy,l1-xx)): (xx>=yy?vec2(1,0):vec2(0,1));
 vec2 c=vec2((gl_VertexID&1)==0?-1.:1., (gl_VertexID&2)==0?-1.:1.);
 float extent=3.0;
 vec2 pixel=cam.xy*focal/cam.z + extent*(c.x*sqrt(l1)*axis+c.y*sqrt(l2)*vec2(-axis.y,axis.x));
 gl_Position=vec4(pixel*2.0/viewport,0,1); uv=c*extent;
 vec3 v=normalize(p.xyz-eye); float x=v.x,y=v.y,z=v.z;
 float sh[16]; sh[0]=0.2820947918;
 sh[1]=-0.4886025119*y; sh[2]=0.4886025119*z; sh[3]=-0.4886025119*x;
 sh[4]=1.0925484306*x*y;sh[5]=-1.0925484306*y*z;sh[6]=0.3153915653*(2.*z*z-x*x-y*y);
 sh[7]=-1.0925484306*x*z;sh[8]=0.5462742153*(x*x-y*y);
 sh[9]=-0.5900435899*y*(3.*x*x-y*y);sh[10]=2.8906114426*x*y*z;
 sh[11]=-0.4570457995*y*(4.*z*z-x*x-y*y);sh[12]=0.3731763326*z*(2.*z*z-3.*x*x-3.*y*y);
 sh[13]=-0.4570457995*x*(4.*z*z-x*x-y*y);sh[14]=1.4453057213*z*(x*x-y*y);
 sh[15]=-0.5900435899*x*(x*x-3.*y*y);
 vec3 color=vec3(0.5);
 for(int j=0;j<16;++j) { if(j==0 || directional==1) color+=sh[j]*readAt(3+j).rgb; }
 // Trained SH may legitimately exceed one before alpha compositing. Preserve
 // that radiance in the floating target and clamp only when displaying it.
 color=max(color*exposure,vec3(0));
 if(displayClamp==1)color=min(color,vec3(1));
 if(style==2) color=mix(vec3(0.19,0.83,0.65),vec3(0.9,0.72,0.35),clamp(log(l1/l2)/5.,0.,1.));
 rgba=vec4(color,p.w);
}`;

const fragment = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
in vec4 rgba;
uniform int style;
out vec4 color;
void main(){
 float r2=dot(uv,uv); if(r2>9.)discard;
 float a=min(0.99,rgba.a*exp(-0.5*r2));
 if(style==1){ if(r2>0.17)discard; a=max(rgba.a,0.7); }
 if(style==2){ float ring=abs(sqrt(r2)-2.); if(ring>0.07)discard; a=0.16*rgba.a; }
 if(a<1./255.)discard;
 color=vec4(rgba.rgb*a,a);
}`;

export function createSplatRenderer(canvas, cloud) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw Error('WebGL2 is required for this Gaussian field');
  const compile = (type, source) => {const s=gl.createShader(type); gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment),program=gl.createProgram();
  gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const floating=!!gl.getExtension('EXT_color_buffer_float')&&!!gl.getExtension('EXT_float_blend');
  const compositeVertex=compile(gl.VERTEX_SHADER,`#version 300 es
   out vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`);
  const compositeFragment=compile(gl.FRAGMENT_SHADER,`#version 300 es
   precision highp float;in vec2 uv;uniform sampler2D accumulated;out vec4 color;
   void main(){color=vec4(clamp(texture(accumulated,uv).rgb,0.,1.),1);}`);
  const composite=gl.createProgram();gl.attachShader(composite,compositeVertex);gl.attachShader(composite,compositeFragment);gl.linkProgram(composite);
  if(!gl.getProgramParameter(composite,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(composite));
  const target=gl.createFramebuffer(),targetTexture=gl.createTexture();let targetWidth=0,targetHeight=0,floatTarget=floating;
  function resizeTarget(width,height){
    if(width===targetWidth&&height===targetHeight)return;
    gl.bindTexture(gl.TEXTURE_2D,targetTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,floatTarget?gl.RGBA16F:gl.RGBA8,width,height,0,gl.RGBA,floatTarget?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,target);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,targetTexture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){
      floatTarget=false;gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Unable to allocate Gaussian compositing target');
    }
    targetWidth=width;targetHeight=height;
  }
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
  const rows=Math.ceil(cloud.count*20/2048), data=new Float32Array(rows*2048*4);data.set(cloud.records);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,2048,rows,0,gl.RGBA,gl.FLOAT,data);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);const index=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,index);
  gl.enableVertexAttribArray(0);gl.vertexAttribIPointer(0,1,gl.UNSIGNED_INT,4,0);gl.vertexAttribDivisor(0,1);
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);
  const loc=Object.fromEntries(['data','eye','right','up','forward','viewport','focal','scale','exposure','style','directional','crop','displayClamp'].map(x=>[x,gl.getUniformLocation(program,x)]));
  const order=Uint32Array.from({length:cloud.count},(_,i)=>i),depth=new Float32Array(cloud.count);
  let lastPose='';
  return {
    updateCloud(next){
      if(next.count!==cloud.count)throw Error('Editing must retain the original Gaussian indexing');
      cloud=next;data.set(next.records);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,2048,rows,gl.RGBA,gl.FLOAT,data);lastPose='';
    },
    draw({yaw,pitch,distance,scale=1,exposure=1,style=0,directional=true,crop=true,training=false}) {
      const width=Math.max(1,Math.round(canvas.clientWidth*Math.min(devicePixelRatio,1.5))),height=Math.max(1,Math.round(canvas.clientHeight*Math.min(devicePixelRatio,1.5)));
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      const renderWidth=training?400:width,renderHeight=training?400:height;
      resizeTarget(renderWidth,renderHeight);gl.bindFramebuffer(gl.FRAMEBUFFER,target);
      gl.viewport(0,0,renderWidth,renderHeight);gl.clearColor(training?0:0.027,training?0:0.035,training?0:0.043,1);gl.clear(gl.COLOR_BUFFER_BIT);
      const eye=[distance*Math.sin(yaw)*Math.cos(pitch),distance*Math.sin(pitch),distance*Math.cos(yaw)*Math.cos(pitch)];
      const forward=eye.map(x=>-x/distance),right=[Math.cos(yaw),0,-Math.sin(yaw)];
      const up=[-Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch),-Math.sin(pitch)*Math.cos(yaw)];
      const pose=`${yaw},${pitch}`;
      if(pose!==lastPose){
        for(let i=0;i<cloud.count;++i)depth[i]=cloud.positions[i*3]*forward[0]+cloud.positions[i*3+1]*forward[1]+cloud.positions[i*3+2]*forward[2];
        order.sort((a,b)=>depth[b]-depth[a]);gl.bindBuffer(gl.ARRAY_BUFFER,index);gl.bufferData(gl.ARRAY_BUFFER,order,gl.DYNAMIC_DRAW);lastPose=pose;
      }
      gl.useProgram(program);gl.bindVertexArray(vao);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform3fv(loc.eye,eye);gl.uniform3fv(loc.right,right);gl.uniform3fv(loc.up,up);gl.uniform3fv(loc.forward,forward);
      gl.uniform2f(loc.viewport,renderWidth,renderHeight);gl.uniform1f(loc.focal,Math.min(renderWidth,renderHeight)*0.5/Math.tan(0.5));
      gl.uniform1f(loc.scale,scale);gl.uniform1f(loc.exposure,exposure);gl.uniform1i(loc.style,style);gl.uniform1i(loc.directional,directional?1:0);gl.uniform1i(loc.crop,crop?1:0);
      gl.uniform1i(loc.displayClamp,floatTarget?0:1);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,cloud.count);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,width,height);gl.clearColor(0.027,0.035,0.043,1);gl.clear(gl.COLOR_BUFFER_BIT);
      if(training){const side=Math.min(width,height);gl.viewport(Math.floor((width-side)/2),Math.floor((height-side)/2),side,side);}
      gl.disable(gl.BLEND);gl.useProgram(composite);gl.bindTexture(gl.TEXTURE_2D,targetTexture);gl.drawArrays(gl.TRIANGLES,0,3);
      return {eye,count:cloud.count,error:gl.getError(),floating:floatTarget,renderWidth,renderHeight};
    },
    dispose(){gl.deleteTexture(texture);gl.deleteTexture(targetTexture);gl.deleteFramebuffer(target);gl.deleteBuffer(index);gl.deleteVertexArray(vao);gl.deleteProgram(program);gl.deleteProgram(composite);gl.deleteShader(vs);gl.deleteShader(fs);gl.deleteShader(compositeVertex);gl.deleteShader(compositeFragment);}
  };
}
