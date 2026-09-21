// Bounded analytic scene, shared by the fixed-view shader and retained-view experiment.
// This is ordinary WebGL2, not Rive GPU Canvas. No readback occurs during interaction.
export const vertex = `#version 300 es
in vec2 position; out vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0,1);}`;
export const fragment = `#version 300 es
precision highp float;
in vec2 uv; out vec4 color;
uniform vec2 resolution;
uniform vec4 glass, metal;
uniform vec3 eye, target, light;
uniform float roughness, ior;
uniform int viewMode;
float sphere(vec3 o,vec3 d,vec4 s){vec3 q=o-s.xyz;float b=dot(q,d),c=dot(q,q)-s.w*s.w,h=b*b-c;if(h<0.)return 1e5;h=sqrt(h);float t=-b-h;return t>.001?t:(-b+h>.001?-b+h:1e5);}
vec3 env(vec3 d){vec3 c=mix(vec3(.055,.075,.09),vec3(.24,.31,.38),clamp(d.y*.5+.5,0.,1.));float soft=pow(max(0.,dot(d,normalize(vec3(-.3,1.,.6)))),60.);return c+soft*vec3(2.6,2.2,1.65);}
float hit(vec3 o,vec3 d,bool withGlass,out int id){float t=1e5;id=0;float a=sphere(o,d,metal);if(a<t){t=a;id=2;}if(withGlass){a=sphere(o,d,glass);if(a<t){t=a;id=3;}}if(d.y<-.0001){a=-o.y/d.y;if(a>.001&&a<t){t=a;id=1;}}if(d.z<-.0001){a=(-3.-o.z)/d.z;if(a>.001&&a<t){t=a;id=4;}}return t;}
float visibility(vec3 p){vec3 l=light-p;float dist=length(l);vec3 d=l/dist;float m=sphere(p+d*.004,d,metal);if(m<dist)return .04;float g=sphere(p+d*.004,d,glass);return g<dist?.36:1.;}
vec3 base(vec3 p,int id){if(id==1){vec2 cell=floor(p.xz*2.);float c=mod(cell.x+cell.y,2.);return mix(vec3(.2,.27,.29),vec3(.4,.46,.44),c);}if(id==4)return vec3(.18,.22,.25);return vec3(.72,.43,.12);}
vec3 normal(vec3 p,int id){return id==1?vec3(0,1,0):id==4?vec3(0,0,1):normalize(p-metal.xyz);}
vec3 shade(vec3 p,vec3 d,int id){vec3 n=normal(p,id),l=light-p;float r2=dot(l,l);l=normalize(l);vec3 h=normalize(l-d);float nd=max(0.,dot(n,l));float v=visibility(p);vec3 a=base(p,id);float exponent=mix(220.,8.,roughness);float spec=pow(max(0.,dot(n,h)),exponent)*(exponent+2.)/40.;vec3 c=a*.15+(a*nd+spec*mix(vec3(.3),a,id==2?1.:0.))*v*9./max(1.,r2);if(id==2)c+=env(reflect(d,n))*a*.55;
if(id==1){vec2 center=glass.xz-(light.xz-glass.xz)*glass.y/max(.1,light.y-glass.y);vec2 q=p.xz-center;float rr=length(q/vec2(.72,.42));float caustic=exp(-pow((rr-.64)*5.,2.))*.85+exp(-dot(q,q)*9.)*.4;c+=vec3(.55,.9,1.)*caustic;}
return c;}
vec3 secondary(vec3 o,vec3 d){int id;float t=hit(o,d,false,id);return id==0?env(d):shade(o+d*t,d,id);}
vec3 cameraRay(vec2 at){vec3 f=normalize(target-eye),r=normalize(cross(f,vec3(0,1,0))),u=cross(r,f);vec2 p=at*2.-1.;p.x*=resolution.x/resolution.y;return normalize(f*2.1+r*p.x+u*p.y);}
void main(){vec3 d=cameraRay(uv);int id;float t=hit(eye,d,true,id);vec3 p=eye+d*t,c;
if(viewMode==1){color=vec4(id==1?vec3(.3,.7,.65):id==2?vec3(.95,.7,.25):id==3?vec3(.48,.62,1.):id==4?vec3(.55,.35,.6):vec3(.1),1);return;}
if(viewMode>=10){color=vec4(float(id)/255.,0,0,1);return;}
if(id==3){vec3 n=normalize(p-glass.xyz);float f0=pow((ior-1.)/(ior+1.),2.);float F=f0+(1.-f0)*pow(1.-max(0.,dot(-d,n)),5.);vec3 inner=refract(d,n,1./ior);float travel=sphere(p+inner*.004,inner,glass);vec3 exitP=p+inner*(travel+.004);vec3 outDir=refract(inner,-normalize(exitP-glass.xyz),ior);vec3 through=length(outDir)<.1?env(reflect(inner,-normalize(exitP-glass.xyz))):secondary(exitP+outDir*.005,outDir);vec3 reflected=secondary(p+n*.005,reflect(d,n));c=mix(through*exp(-vec3(.15,.045,.022)*travel),reflected,F);vec3 h=normalize(normalize(light-p)-d);c+=vec3(1.8,1.5,1.1)*pow(max(0.,dot(n,h)),200.);}
else c=id==0?env(d):shade(p,d,id);
c=pow(max(c,vec3(0))/(vec3(1)+max(c,vec3(0))),vec3(1./2.2));color=vec4(c,1);}`;
export function lightPosition(scene,degrees){const a=degrees*Math.PI/180,l=scene.light;return [Math.sin(a)*l.radius,l.height,l.centerZ+Math.cos(a)*l.radius];}
export function eyePosition(scene,yaw=scene.camera.yaw){const c=scene.camera;return c.target.map((v,i)=>v+[Math.sin(yaw)*Math.cos(c.pitch)*c.distance,Math.sin(c.pitch)*c.distance,Math.cos(yaw)*Math.cos(c.pitch)*c.distance][i]);}
export function project(scene,p,yaw=scene.camera.yaw){const e=eyePosition(scene,yaw),sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>a.map(v=>v/Math.hypot(...a)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];const f=norm(sub(scene.camera.target,e)),r=norm(cross(f,[0,1,0])),u=cross(r,f),q=sub(p,e),z=dot(q,f);return [320+210*2.1*dot(q,r)/z,210-210*2.1*dot(q,u)/z];}
export function createRenderer(canvas,scene){const gl=canvas.getContext('webgl2',{alpha:false,preserveDrawingBuffer:true,antialias:false});if(!gl)throw Error('WebGL2 is unavailable');const program=gl.createProgram();for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(program,s);gl.deleteShader(s);}gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);const uniforms=Object.fromEntries(['resolution','glass','metal','eye','target','light','roughness','ior','viewMode'].map(k=>[k,gl.getUniformLocation(program,k)]));return {draw({degrees=0,yaw=scene.camera.yaw,roughness=.24,ior=1.5,viewMode=0}={}){gl.useProgram(program);gl.viewport(0,0,canvas.width,canvas.height);gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);gl.uniform4fv(uniforms.glass,scene.glass);gl.uniform4fv(uniforms.metal,scene.metal);gl.uniform3fv(uniforms.eye,eyePosition(scene,yaw));gl.uniform3fv(uniforms.target,scene.camera.target);gl.uniform3fv(uniforms.light,lightPosition(scene,degrees));gl.uniform1f(uniforms.roughness,roughness);gl.uniform1f(uniforms.ior,ior);gl.uniform1i(uniforms.viewMode,viewMode);gl.drawArrays(gl.TRIANGLES,0,6);},dispose(){gl.deleteBuffer(buffer);gl.deleteProgram(program);}};}
