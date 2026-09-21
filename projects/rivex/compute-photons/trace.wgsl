struct Params { optical: vec4f, sample: vec4f, display: vec4f, size: vec4f }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read_write> field: array<atomic<u32>>;
const N: u32 = 256u;
const STATS: u32 = N*N*3u;
fn hash(v: u32) -> u32 { var x=v; x=(x^(x>>16u))*0x7feb352du; x=(x^(x>>15u))*0x846ca68bu; return x^(x>>16u); }
fn rnd(v: u32)->f32 { return f32(hash(v)&0xffffffu)/16777216.; }
fn sphere(ro: vec3f,rd: vec3f,c: vec3f,r: f32)->vec2f { let o=ro-c; let b=dot(o,rd); let h=b*b-dot(o,o)+r*r; if(h<0.){return vec2f(-1.);}let d=sqrt(h);return vec2f(-b-d,-b+d); }
fn fresnel(c: f32,n: f32)->f32 { let a=(n-1.)/(n+1.);let f=a*a;return f+(1.-f)*pow(1.-clamp(c,0.,1.),5.); }
@compute @workgroup_size(128)
fn trace(@builtin(global_invocation_id) gid: vec3u) {
 let i=gid.x;if(i>=u32(p.sample.y)){return;}
 let seed=i+u32(p.sample.x)*32768u;
 let angle=6.28318530718*rnd(seed*7u+1u);let radial=rnd(seed*7u+2u);
 // Both source profiles retain the same total power. The annulus makes the
 // three wavelength-dependent focal footprints individually inspectable.
 let radius=select(.64*sqrt(radial),sqrt(mix(.38*.38,.42*.42,radial)),p.sample.w>.5);
 let center=vec3f(0.,p.optical.x,0.);let dir=normalize(vec3f(-p.optical.w,-1.,0.));let side=normalize(vec3f(1.,-p.optical.w,0.));
 let ro=center-dir*3.5+side*(radius*cos(angle))+vec3f(0.,0.,radius*sin(angle));
 let channel=min(2u,u32(rnd(seed*7u+3u)*3.));let index=p.optical.y+(f32(channel)-1.)*p.optical.z;
 let roots=sphere(ro,dir,center,.62);if(roots.x<=0.){atomicAdd(&field[STATS+1u],1u);return;}
 let entry=ro+dir*roots.x;let normal=normalize(entry-center);let inside=refract(dir,normal,1./index);
 if(dot(inside,inside)<.001){return;}let internalOrigin=entry+inside*.0001;let back=sphere(internalOrigin,inside,center,.62);
 if(back.y<=0.){return;}let exit=internalOrigin+inside*back.y;let outward=normalize(exit-center);let after=refract(inside,-outward,index);
 if(dot(after,after)<.001||after.y>=-.0001){atomicAdd(&field[STATS+2u],1u);return;}
 let hit=exit+after*(-exit.y/after.y);let uv=(hit.xz+vec2f(2.5))/5.;
 if(any(uv<vec2f(0.))||any(uv>=vec2f(1.))){atomicAdd(&field[STATS+2u],1u);return;}
 let cell=vec2u(uv*f32(N));
 let energy=(1.-fresnel(-dot(dir,normal),index))*(1.-fresnel(dot(inside,outward),index))*exp(-.07*back.y);
 // One randomly selected RGB band receives 3× flux. The 4,194,304-ray
 // cap guarantees even the worst possible single-cell sum stays below 2^32.
 let deposit=u32(round(energy*768.));
 atomicAdd(&field[(cell.y*N+cell.x)*3u+channel],deposit);
 // A horizontal marginal of the same deposits, returned to ordinary Rive.
 // Each photon adds once; the existing total-photon cap also bounds each bin.
 atomicAdd(&field[STATS+4u+cell.x/4u],deposit);
 atomicAdd(&field[STATS],1u);
}
