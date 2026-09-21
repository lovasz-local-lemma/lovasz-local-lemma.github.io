import {kernelFamilies} from './laplace-model.js?v=a8be8bb9b201';
// A finite winding of the impulse-response kernel, displayed as an emissive tube.
// The volume is illustrative; the transform is evaluated by the linked math model.
const vertex=`#version 300 es
in vec2 position;
void main(){gl_Position=vec4(position,0,1);}`;
const fragment=`#version 300 es
precision highp float;
out vec4 color;
uniform vec2 resolution;
uniform float decay, frequency, yaw, pitch, steps, thickness, kernel;
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*resolution)/resolution.y;
  vec3 eye=4.4*vec3(cos(pitch)*sin(yaw),sin(pitch),cos(pitch)*cos(yaw));
  vec3 forward=normalize(-eye),right=normalize(cross(forward,vec3(0,1,0))),up=cross(right,forward);
  vec3 origin=eye+2.95*(uv.x*right+uv.y*up);
  vec3 sum=vec3(0);float transmission=1.;
  // Fixed quadrature is predictable even where the winding is steep or nearly straight.
  float stepSize=4.8/steps;
  for(int i=0;i<768;i++){
    if(float(i)>=steps)break;
    vec3 p=origin+forward*(2.+(float(i)+.5)*stepSize);
    float t=(p.y+1.15)*8./2.3;
    if(t<0.||t>8.)continue;
    float amplitude=1.;
    if(kernel>.5&&kernel<1.5)amplitude=sin(2.4*t);
    else if(kernel<2.5&&kernel>1.5)amplitude=cos(2.4*t);
    else if(kernel<3.5&&kernel>2.5)amplitude=decay*t;
    else if(kernel<4.5&&kernel>3.5)amplitude=decay*decay*t*t;
    else if(kernel>4.5)amplitude=.5*(sin(1.5*t)+sin(3.*t));
    float radius=amplitude*exp(-decay*t),angle=-frequency*t;
    vec2 center=radius*vec2(cos(angle),sin(angle));
    vec2 d=p.xz-center;
    float density=exp(-dot(d,d)/(thickness*thickness))*24.;
    // A soft halo separates the thin late-time spiral from the dark background.
    float halo=exp(-dot(d,d)/(thickness*thickness*8.))*.32;
    vec3 pigment=mix(vec3(1.,.65,.24),vec3(.26,.94,.79),t/8.);
    float alpha=1.-exp(-(density+halo)*stepSize);
    sum+=transmission*alpha*(pigment*.85+vec3(.34)*exp(-dot(d,d)/(thickness*thickness*.3)));
    transmission*=1.-alpha;
  }
  vec3 background=mix(vec3(.025,.045,.065),vec3(.045,.10,.12),exp(-dot(uv,uv)*2.));
  // The ground grid anchors the real/imaginary plane at t = 0.
  float hit=abs(forward.y)>.001?(-1.17-origin.y)/forward.y:-1.;
  vec3 floorPoint=origin+hit*forward;
  if(hit>0.&&length(floorPoint.xz)<1.5){
    vec2 grid=abs(fract(floorPoint.xz*4.+.5)-.5);
    float g=1.-smoothstep(.012,.035,min(grid.x,grid.y));
    background+=g*vec3(.055,.12,.12)*(1.-smoothstep(.9,1.5,length(floorPoint.xz)));
  }
  color=vec4(pow(sum+transmission*background,vec3(.85)),1);
}`;

export function createMemoryVolume(canvas){
  let gl,program,buffer,failed=false;
  function initialize(){
    gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw Error('WebGL2 unavailable');
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
    program=gl.createProgram();const shaders=[compile(gl.VERTEX_SHADER,vertex),compile(gl.FRAGMENT_SHADER,fragment)];
    shaders.forEach(s=>gl.attachShader(program,s));gl.linkProgram(program);shaders.forEach(s=>gl.deleteShader(s));
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  }
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();failed=true;});
  canvas.addEventListener('webglcontextrestored',()=>{program=null;failed=false;});
  return state=>{
    if(failed)return false;
    try{
      if(!program)initialize();
      const rect=canvas.getBoundingClientRect(),scale=Math.min(1,900/rect.width);
      canvas.width=Math.max(1,Math.round(rect.width*scale));canvas.height=Math.max(1,Math.round(rect.height*scale));
      gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      const attribute=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
      gl.uniform2f(gl.getUniformLocation(program,'resolution'),canvas.width,canvas.height);
      for(const [name,value] of Object.entries({decay:state.rate,frequency:state.omega,yaw:state.yaw,pitch:state.pitch,steps:state.quality,thickness:state.thickness,kernel:kernelFamilies[state.kernel].id}))gl.uniform1f(gl.getUniformLocation(program,name),value);
      gl.drawArrays(gl.TRIANGLES,0,3);return true;
    }catch(error){console.warn('Memory volume:',error.message);failed=true;return false;}
  };
}
