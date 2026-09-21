#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uResolution;
uniform vec2 uViewOffset;
uniform int uMode, uCount;
uniform float uParameter,uAdverse,uGuides,uYaw,uPitch,uZoom,uMirror,uFocal;
uniform vec4 uBalls[3];
uniform sampler2D uSegments;
uniform vec3 uCenter[2],uNormal[2],uU[2],uV[2];
uniform vec2 uHalf[2];
const vec3 LIGHT=vec3(-2.75,1.45,.45),EYE=vec3(2.7,.5,.2);
float sq(float x){return x*x;}
float erfApprox(float x){float s=sign(x);x=abs(x);float t=1./(1.+.3275911*x);return s*(1.-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*exp(-x*x));}
float gaussianIntegral(vec3 a,vec3 b,vec3 center,float variance){vec3 v=b-a;float len=length(v);vec3 d=v/max(len,.00001),r=a-center;float q=dot(r,d),h=max(0.,dot(r,r)-q*q),s=sqrt(variance);return exp(-h/variance)*s*.886226925*(erfApprox((len+q)/s)-erfApprox(q/s));}
float absorption(vec3 a,vec3 b){vec3 c=mix(vec3(.2,-.5,-.35),vec3(-1.05,.1,0),uAdverse);return .09*length(b-a)+mix(.75,7.5,uAdverse)*gaussianIntegral(a,b,c,.63);}
float optical(vec3 a,vec3 b){return length(a-b)+uAdverse*.72*gaussianIntegral(a,b,vec3(0),1.7);}
float gyroid(vec3 p){p*=2.2;return sin(p.x)*cos(p.y)+sin(p.y)*cos(p.z)+sin(p.z)*cos(p.x);}
float envelope(vec3 p){return exp(-pow(length(p)/2.45,8.));}
float gaussian(float x,float width){return exp(-sq(x/width));}
vec3 spectrum(float t){return vec3(.32+.65*sq(sin(1.8+t*2.6)),.35+.55*sq(sin(t*2.5+.4)),.32+.65*sq(sin(t*2.8+3.5)));}
float boxDistance(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
// rgb is a selected emission field; alpha is an extinction coefficient.
// This display integral is not an unbiased scattering-transport estimator.
vec4 medium(vec3 p){
  vec3 emission=vec3(0);float sigma=0.;
  if(uMode==0){
    float material=gaussian(gyroid(p),.16)*envelope(p);
    float tau=absorption(LIGHT,p)+absorption(p,EYE),illumination=exp(-tau)*12./((.4+dot(p-LIGHT,p-LIGHT))*(.4+dot(p-EYE,p-EYE)));
    vec3 color=mix(vec3(.11,.86,.75),vec3(1.3,.60,.26),smoothstep(-1.6,1.5,p.x+p.y*.7));
    emission=color*material*(.16+5.8*illumination);sigma=material*.37;
    vec3 c=mix(vec3(.2,-.5,-.35),vec3(-1.05,.1,0),uAdverse);float fog=exp(-dot(p-c,p-c)/.63);sigma+=fog*mix(.035,.8,uAdverse);
    if(uGuides>.5)for(int i=0;i<3;i++){float r=length(p-uBalls[i].xyz),shell=gaussian(r-uBalls[i].w,.017);float stripes=.27+.73*pow(abs(sin(atan(p.z-uBalls[i].z,p.x-uBalls[i].x)*8.)),18.);emission+=vec3(.76,.48,1.)*shell*.45*stripes;sigma+=shell*.03;}
  }else if(uMode==1){
    vec3 L=vec3(-2.45,.1,0),C=vec3(2.45,.1,0);float geometric=length(p-L)+length(p-C),travel=optical(L,p)+optical(p,C),gate=5.05+uParameter*2.8;
    float material=gaussian(gyroid(p),.2)*envelope(p),shell=gaussian(travel-gate,.075);
    emission=material*shell*mix(vec3(.17,1.3,1.18),vec3(1.28,.28,.71),smoothstep(-1.4,1.4,p.y))*6.;sigma=material*shell*.72;
    emission+=material*vec3(.035,.051,.079);sigma+=material*.03;
    if(uGuides>.5){float preview=gaussian(geometric-gate,.022)*envelope(p),grid=.15+.85*pow(abs(sin(atan(p.z,p.y-.1)*12.)),18.);emission+=preview*grid*mix(vec3(.48,.78,1.),vec3(.98,.53,.19),uAdverse)*.27;}
  }else if(uMode==2){
    for(int i=0;i<13;i++){
      float f=float(i),y=(f-6.)*.27+.14*sin(p.x*2.4+f*.46),z=.38*p.x+sin(f*1.4)*1.0;
      float dist=length(vec2(p.y-y,p.z-z)),fiber=gaussian(dist,.026)*(1.-smoothstep(2.25,2.5,abs(p.x)));
      float beads=1.+2.5*pow(.5+.5*cos(p.x*7.+f*.6),16.);
      emission+=spectrum(f/13.)*fiber*8.*beads;sigma+=fiber*.7;
    }
    if(uGuides>.5){float tilt=(uParameter-.5)*1.5,d=(p.z-tilt*p.x)/sqrt(1.+tilt*tilt),sheet=gaussian(d,.015)*(1.-smoothstep(2.1,2.4,max(abs(p.x),abs(p.y))));float grid=max(pow(abs(cos(p.x*3.14159)),40.),pow(abs(cos(p.y*3.14159)),40.));emission+=sheet*vec3(.3,.72,.77)*(.035+.13*grid);}
  }else if(uMode==3){
    float h=-1.38+.24*p.x*p.x+uMirror*cos(4.*p.x),sheet=gaussian(p.y-h,.024)*(1.-smoothstep(2.33,2.4,abs(p.x)))*(1.-smoothstep(1.15,1.28,abs(p.z)));
    float grooves=.15+.85*pow(.5+.5*cos(p.z*70.),8.);emission+=sheet*vec3(.22,.58,.77)*grooves*1.5;sigma=sheet*.7;
  }else if(uMode==4){
    if(uGuides>.5)for(int i=0;i<2;i++){vec3 r=p-uCenter[i];float x=dot(r,uU[i]),y=dot(r,uV[i]),d=dot(r,uNormal[i]);float extent=(1.-smoothstep(uHalf[i].x-.03,uHalf[i].x,abs(x)))*(1.-smoothstep(uHalf[i].y-.03,uHalf[i].y,abs(y)));float sheet=gaussian(d,.018)*extent;
      float grid=max(pow(.5+.5*cos(x*16.),20.),pow(.5+.5*cos(y*16.),20.));float edge=max(smoothstep(uHalf[i].x-.045,uHalf[i].x,abs(x)),smoothstep(uHalf[i].y-.045,uHalf[i].y,abs(y)));
      vec3 color=i==0?vec3(1.,.66,.24):vec3(.17,.86,1.);emission+=color*sheet*(.12+.50*grid+edge*2.);sigma+=sheet*.10;
    }
  }else if(uMode==5){
    for(int i=0;i<2;i++){vec3 center=i==0?vec3(-.815,1.,0):vec3(.81,-1.165,0),halfBox=i==0?vec3(.125,.8,1.3):vec3(.10,.635,1.3);float d=boxDistance(p-center,halfBox);float skin=gaussian(d,.016);emission+=vec3(.62,.17,.075)*skin*(.15+.25*pow(.5+.5*cos(p.z*30.),12.));sigma+=float(d<0.)*1.5;}
    if(uGuides>.5){vec3 r=p-uCenter[0];float x=dot(r,uU[0]),y=dot(r,uV[0]),d=dot(r,uNormal[0]),support=gaussian(d,.016)*(1.-smoothstep(uHalf[0].x-.02,uHalf[0].x,abs(x)))*(1.-smoothstep(uHalf[0].y-.02,uHalf[0].y,abs(y)));emission+=vec3(.22,.66,.96)*support*.5;sigma+=support*.02;}
  }
  return vec4(emission,sigma);
}
vec3 rayVolume(vec3 ro,vec3 rd,int steps){
  float lo=max(.1,uZoom-4.2),hi=uZoom+4.2,dt=(hi-lo)/float(steps),trans=1.;vec3 color=vec3(0);
  // A pixel-stable substep prevents banding without animated noise.
  float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
  for(int i=0;i<136;i++){if(i>=steps)break;vec3 p=ro+rd*(lo+(float(i)+jitter)*dt);if(any(greaterThan(abs(p),vec3(3.1,2.6,2.8))))continue;vec4 m=medium(p);float atten=exp(-m.a*dt);color+=trans*m.rgb*dt;trans*=atten;if(trans<.025)break;}
  return color;
}
// Path ownership remains visible when constraint surfaces are hidden.
vec3 raySegments(vec3 ro,vec3 rd){vec3 color=vec3(0);
  for(int i=0;i<128;i++){if(i>=uCount)break;vec4 A=texelFetch(uSegments,ivec2(i,0),0),B=texelFetch(uSegments,ivec2(i,1),0),C=texelFetch(uSegments,ivec2(i,2),0);vec3 a=A.xyz,v=B.xyz-a,w=ro-a;float c=max(dot(v,v),.000001),b=dot(rd,v),d=dot(rd,w),e=dot(v,w),den=max(.000001,c-b*b),t=(b*e-c*d)/den,s=clamp((e+b*t)/c,0.,1.);vec3 point=a+s*v;t=dot(point-ro,rd);float distance=length(ro+rd*t-point);if(t<0.)continue;float width=max(B.w,.009),core=gaussian(distance,width),glow=gaussian(distance,width*4.)*.12,dash=mix(1.,smoothstep(.18,.36,fract(s*sqrt(c)*7.)),C.w);color+=C.rgb*(core+glow)*A.w*1.6*dash;
  }return color;
}
vec3 tone(vec3 c){return clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.);}
void main(){
  vec2 uv=(gl_FragCoord.xy/uResolution-.5);uv.x*=uResolution.x/uResolution.y;uv+=uViewOffset;
  vec3 ro=vec3(sin(uYaw)*cos(uPitch),sin(uPitch),cos(uYaw)*cos(uPitch))*uZoom,target=vec3(0,.05,0),forward=normalize(target-ro),right=normalize(cross(forward,vec3(0,1,0))),up=cross(right,forward);
  vec3 rd=normalize(forward*uFocal+right*uv.x+up*uv.y),color=vec3(0);
  if(uMode==2){
    float tilt=(uParameter-.5)*1.5,den=rd.z-tilt*rd.x;
    // The geometric camera only defines focus for forward plane intersections.
    // Invalid edge pixels keep the background, never a reversed aperture ray.
    if(abs(den)>.00001){float t=(tilt*ro.x-ro.z)/den;if(t>0.){vec3 focus=ro+rd*t;float aperture=mix(.12,.28,uAdverse);
      for(int i=0;i<7;i++){float f=float(i),r=i==0?0.:aperture*sqrt((f-.5)/6.),a=f*2.39996323;vec3 lens=ro+right*r*cos(a)+up*r*sin(a),d=normalize(focus-lens);color+=rayVolume(lens,d,128)/7.;}
    }}
  }else{color=rayVolume(ro,rd,136);}
  color+=raySegments(ro,rd);
  // Spatial display scaffold; never counted as a sample or path contribution.
  if(rd.y<-.001){float t=(-2.24-ro.y)/rd.y;vec3 p=ro+rd*t;if(t>0.){float grid=max(pow(abs(cos(p.x*3.14159)),90.),pow(abs(cos(p.z*3.14159)),90.));float fade=exp(-.15*dot(p.xz,p.xz));color+=vec3(.035,.063,.07)*grid*fade;}}
  vec3 background=mix(vec3(.009,.018,.026),vec3(.021,.030,.047),smoothstep(-.6,.6,uv.y));color+=background;
  vec3 mapped=pow(tone(color*1.35),vec3(1./2.2));float vignette=1.-.17*dot(uv,uv);mapped*=max(.66,vignette);fragColor=vec4(mapped,1.);
}
