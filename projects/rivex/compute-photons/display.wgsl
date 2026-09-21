struct Params { optical: vec4f, sample: vec4f, display: vec4f, size: vec4f }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> field: array<u32>;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertexMain(@builtin(vertex_index) i:u32)->Vertex {var v=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));var out:Vertex;out.position=vec4f(v[i],0.,1.);out.uv=v[i]*.5+.5;return out;}
fn cell(ij:vec2i)->vec3f{if(any(ij<vec2i(0))||any(ij>=vec2i(256))){return vec3f(0.);}let n=u32(ij.y*256+ij.x)*3u;return vec3f(f32(field[n]),f32(field[n+1u]),f32(field[n+2u]));}
fn density(uv:vec2f)->vec3f{let q=uv*256.-.5;let base=vec2i(floor(q));let f=fract(q);var light=vec3f(0.);for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){let xy=base+vec2i(x,y);let a=mix(cell(xy),cell(xy+vec2i(1,0)),f.x);let b=mix(cell(xy+vec2i(0,1)),cell(xy+vec2i(1,1)),f.x);let wx=select(.25,.5,x==0);let wy=select(.25,.5,y==0);light+=mix(a,b,f.y)*wx*wy;}}return light*(65536./25.)/(256.*max(p.sample.z,1.));}
fn floorLight(pos:vec3f)->vec3f {let uv=(pos.xz+2.5)/5.;let e=density(uv);let line=abs(fract(pos.xz*2.+.5)-.5);let grid=1.-smoothstep(.008,.022,min(line.x,line.y));let check=.5+.5*sin(pos.x*1.2)*sin(pos.z*1.2);return vec3f(.012,.022,.029)+vec3f(.017,.017,.012)*grid+vec3f(.004)*check+e*.32;}
fn sphere(ro:vec3f,rd:vec3f,c:vec3f,r:f32)->vec2f {let oc=ro-c;let b=dot(oc,rd);let h=b*b-dot(oc,oc)+r*r;if(h<0.){return vec2f(-1.);}let s=sqrt(h);return vec2f(-b-s,-b+s);}
fn environment(rd:vec3f)->vec3f{let top=smoothstep(-.1,.8,rd.y);let strip=pow(max(0.,dot(rd,normalize(vec3f(-.7,1.,-.2)))),42.);let rim=pow(max(0.,dot(rd,normalize(vec3f(.6,.5,1.)))),35.);return mix(vec3f(.008,.014,.019),vec3f(.16,.22,.24),top)+vec3f(4.,3.1,1.9)*strip+vec3f(.5,1.5,1.7)*rim;}
fn sceneBehind(ro:vec3f,rd:vec3f)->vec3f{if(rd.y<-.001){let t=-ro.y/rd.y;if(t>0.){let hit=ro+rd*t;return floorLight(hit)*exp(-t*.055);}}return environment(rd);}
fn heat(v:f32)->vec3f{let t=clamp(log(1.+v*2.)/4.,0.,1.);return mix(mix(vec3f(.015,.035,.09),vec3f(.02,.75,.62),smoothstep(0.,.4,t)),mix(vec3f(1.,.4,.08),vec3f(1.,.94,.68),smoothstep(.7,1.,t)),smoothstep(.35,.75,t));}
@fragment fn fragmentMain(v:Vertex)->@location(0) vec4f {
 let screen=vec2f(v.uv.x,1.-v.uv.y);var color=vec3f(0.);
 if(p.display.y>.5){let uv=(screen-.5)*vec2f(1.5,1.)*.48+.5;let d=density(uv);if(p.display.y>1.5){color=heat(dot(d,vec3f(.2126,.7152,.0722))*p.display.x);}else{color=vec3f(.008,.016,.022)+d*.32*p.display.x;color=color/(1.+color);}}
 else {let camera=vec3f(2.2,2.35,3.6);let focus=vec3f(0.,.55,0.);let forward=normalize(focus-camera);let right=normalize(cross(forward,vec3f(0.,1.,0.)));let up=cross(right,forward);let xy=(screen-.5)*vec2f(1.5,-1.)*.85;let rd=normalize(forward+right*xy.x+up*xy.y);let center=vec3f(0.,p.optical.x,0.);let hit=sphere(camera,rd,center,.62);color=sceneBehind(camera,rd);
 if(hit.x>0.){let point=camera+rd*hit.x;let n=normalize(point-center);let reflection=environment(reflect(rd,n));var transmission=vec3f(0.);for(var channel=0;channel<3;channel++){let index=p.optical.y+(f32(channel)-1.)*p.optical.z;let inside=refract(rd,n,1./index);let start=point+inside*.0001;let back=sphere(start,inside,center,.62);let end=start+inside*back.y;let endN=normalize(end-center);let outDir=refract(inside,-endN,index);let sample=sceneBehind(end+outDir*.001,outDir)*exp(-.07*back.y);transmission[channel]=sample[channel];}let f0=pow((p.optical.y-1.)/(p.optical.y+1.),2.);let fres=f0+(1.-f0)*pow(1.-max(0.,-dot(rd,n)),5.);color=mix(transmission,reflection,fres)+vec3f(.012,.025,.025)*pow(1.-max(0.,-dot(rd,n)),2.);}
 color*=p.display.x;color=color/(1.+color);}
 let vignette=1.-.15*dot(screen-.5,screen-.5);return vec4f(pow(max(color*vignette,vec3f(0.)),vec3f(1./2.2)),1.);
}
