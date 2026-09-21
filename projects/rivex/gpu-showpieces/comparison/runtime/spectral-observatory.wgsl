// SPECTRAL OBSERVATORY / RIVX
// Analytic two - interface optical transport, seven wavelength samples.
// The photographic receiver caustic and atmosphere are an art - directed preview,
// not an unbiased solution. See DESIGN.md for the exact capability boundary.
struct Uniforms {
    resolutionTime: vec4<f32>,
    controls: vec4<f32>,
    pointer: vec4<f32>,
    misc: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
    let p = vec2<f32>(f32((index << 1u) & 2u), f32(index & 2u));
    return VertexOutput(vec4<f32>(p * 2.0 - 1.0, 0.0, 1.0), p);
}
const PI: f32 = 3.14159265359;
const FAR: f32 = 10000.0;
const ORB: vec3<f32> = vec3<f32>(-0.53, 1.09, 0.0);
const PRISM: vec3<f32> = vec3<f32>(1.30, 0.62, -0.46);
const METAL: vec3<f32> = vec3<f32>(-1.71, 0.335, 0.75);
struct Hit { t: f32, n: vec3<f32>, id: i32 };
fn saturate(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }
fn turn(p: vec3<f32>, a: f32) -> vec3<f32> { return vec3<f32>(cos(a)*p.x+sin(a)*p.z,p.y,-sin(a)*p.x+cos(a)*p.z); }
fn hash(p: vec2<f32>) -> f32 { return fract(sin(dot(p,vec2<f32>(127.1,311.7)))*43758.5453); }
fn noise(p: vec2<f32>) -> f32 {
    let f = fract(p); let i = floor(p); let s = f*f*(3.0 - 2.0*f);
    return mix(mix(hash(i),hash(i+vec2<f32>(1.0,0.0)),s.x),mix(hash(i+vec2<f32>(0.0,1.0)),hash(i+vec2<f32>(1.0,1.0)),s.x),s.y);
}
fn sphere(ro: vec3<f32>,rd: vec3<f32>,center: vec3<f32>,radius: f32,id: i32) -> Hit {
    let oc=ro - center; let b=dot(oc,rd); let c=dot(oc,oc) - radius*radius; let d=b*b - c;
    if(d<0.0){return Hit(FAR,vec3<f32>(0.0),id);}
    let q=sqrt(d); var t=-b - q; if(t<0.0005){t=-b+q;}
    if(t<0.0005){return Hit(FAR,vec3<f32>(0.0),id);}
    return Hit(t,normalize(ro+rd*t - center),id);
}
fn prism(ro: vec3<f32>,rd: vec3<f32>) -> Hit {
    let a=-0.28; let p=turn(ro - PRISM,a); let d=turn(rd,a);
    var near=-FAR; var far=FAR; var normalNear=vec3<f32>(0.0); var normalFar=vec3<f32>(0.0);
    for(var i=0;i<5;i++){
        var n=vec3<f32>(0.0,0.0,1.0); var extent=0.39;
        if(i==0){n=vec3<f32>(0.8660254,0.5,0.0);extent=0.52;}
        if(i==1){n=vec3<f32>(-0.8660254,0.5,0.0);extent=0.52;}
        if(i==2){n=vec3<f32>(0.0,-1.0,0.0);extent=0.52;}
        if(i==4){n=vec3<f32>(0.0,0.0,-1.0);}
        let den=dot(n,d); let numer=extent - dot(n,p);
        if(abs(den)<0.000001){if(numer<0.0){return Hit(FAR,n,2);}continue;}
        let t=numer/den;
        if(den<0.0){if(t>near){near=t;normalNear=n;}}
        else {if(t<far){far=t;normalFar=n;}}
    }
    if(near>far || far<0.0005){return Hit(FAR,vec3<f32>(0.0),2);}
    if(near>0.0005){return Hit(near,turn(normalNear,-a),2);}
    return Hit(far,turn(normalFar,-a),2);
}
fn lightPosition() -> vec3<f32> {
    return vec3<f32>(-2.9+1.6*sin(u.controls.x),4.6,1.3+1.5*cos(u.controls.x));
}
fn environment(rd: vec3<f32>,rough: f32) -> vec3<f32> {
    let sky=saturate(rd.y*0.5+0.5);
    var c=mix(vec3<f32>(0.014,0.023,0.032),vec3<f32>(0.090,0.13,0.155),pow(sky,2.0));
    // Three studio softboxes. Angular width is broadened by the material lobe.
    let key=normalize(lightPosition());
    let d=acos(clamp(dot(rd,key),-1.0,1.0));
    c+=vec3<f32>(1.0,0.84,0.64)*7.0*exp(-pow(d/(0.125+rough*0.28),4.0));
    let side=normalize(vec3<f32>(-2.3,1.6,-2.4));
    let sideDist=acos(clamp(dot(rd,side),-1.0,1.0));
    c+=vec3<f32>(0.58,0.85,1.0)*3.3*exp(-pow(sideDist/(0.21+rough*0.25),4.0));
    let strip=exp(-pow((rd.x - 0.68)/(0.040+rough*0.11),2.0))*smoothstep(-0.04,0.1,rd.y)*(1.0 - smoothstep(0.63,0.85,rd.y));
    c+=vec3<f32>(0.92,0.97,1.0)*4.5*strip;
    let slit=exp(-pow((rd.z+0.78)/(0.025+rough*0.09),2.0))*smoothstep(-0.03,0.18,rd.y);
    c+=vec3<f32>(1.0,0.50,0.23)*1.3*slit;
    return c;
}
fn bandColor(index: i32) -> vec3<f32> {
    // Seven overlapping RGB sensitivity lobes, normalized during reconstruction.
    let wavelength=430.0+f32(index)*36.66667;
    return vec3<f32>(exp(-0.5*pow((wavelength - 607.0)/43.0,2.0)),exp(-0.5*pow((wavelength - 543.0)/34.0,2.0)),exp(-0.5*pow((wavelength - 453.0)/27.0,2.0)));
}
fn caustic(p: vec3<f32>) -> vec3<f32> {
    var color=vec3<f32>(0.0); var weight=vec3<f32>(0.0);
    let shift=sin(u.controls.x)*0.35;
    for(var i=0;i<7;i++){
        let s=f32(i)/6.0;
        let center=vec2<f32>(0.4+shift+(s - 0.5)*0.83*u.controls.z,0.66);
        let q=p.xz - center; let y=q.y;
        let x=q.x - (0.23+0.09*s*u.controls.z)*y - 0.052*y*y;
        let spread=0.075+abs(y)*0.021+u.controls.y*0.023;
        let core=exp(-pow(x/spread,2.0))*exp(-pow((y - 0.7)/1.65,2.0));
        let ripple=0.90+0.1*cos(y*28.0+x*14.0);
        color+=bandColor(i)*core*ripple*1.5; weight+=bandColor(i);
    }
    color*=3.0/max(weight,vec3<f32>(0.001));
    let q=p.xz - vec2<f32>(-0.94+shift,0.74);
    let ellipse=length(q/vec2<f32>(0.80,0.31));
    color+=vec3<f32>(0.4,0.69,0.81)*exp(-pow((ellipse - 1.0)/0.065,2.0))*0.8;
    return color;
}
fn floorColor(p: vec3<f32>,rd: vec3<f32>,rough: f32) -> vec3<f32> {
    let grain=noise(p.xz*75.0)*0.6+noise(p.xz*5.0)*0.4;
    var base=vec3<f32>(0.012,0.023,0.028)*(0.82+grain*0.34);
    // Curved brass indexing marks etched into the optical bench.
    let radius=length(p.xz - vec2<f32>(0.0,-0.1));
    let rings=exp(-pow((radius - 2.42)/0.010,2.0))+0.45*exp(-pow((radius - 2.49)/0.0035,2.0));
    let angle=atan2(p.z+0.1,p.x);
    let tick=pow(0.5+0.5*cos(angle*120.0),24.0)*smoothstep(2.37,2.39,radius)*(1.0 - smoothstep(2.44,2.46,radius));
    base+=vec3<f32>(0.31,0.23,0.12)*(rings+tick*0.65);
    let l=lightPosition(); let ldir=normalize(l - p);
    var shadow=1.0;
    let oc=ORB - p; let along=dot(oc,ldir);
    let rayDist=length(oc - ldir*along);
    shadow*=mix(0.46,1.0,smoothstep(0.71,1.2,rayDist));
    shadow*=mix(0.25,1.0,smoothstep(0.25,0.55,length(p.xz - METAL.xz)));
    let diffuse=0.8+max(ldir.y,0.0)*1.4;
    var result=base*diffuse*shadow;
    let reflected=environment(reflect(rd,vec3<f32>(0.0,1.0,0.0)),0.25+rough*0.35);
    let f=0.035+0.45*pow(1.0 - abs(rd.y),5.0);
    result+=reflected*f*0.34;
    result+=caustic(p)*(1.0 - rough*0.36);
    return result;
}
fn opaqueRadiance(ro: vec3<f32>,rd: vec3<f32>,rough: f32) -> vec3<f32> {
    var floorT=FAR;
    if(rd.y < -0.0001){floorT=-ro.y/rd.y;}
    let metal=sphere(ro,rd,METAL,0.335,3);
    if(metal.t<floorT){
        let p=ro+rd*metal.t;
        let az=atan2(metal.n.z,metal.n.x);
        let weave=0.5+0.5*sin(az*55.0+metal.n.y*14.0);
        let coat=vec3<f32>(0.84,0.46,0.18)*(0.7+0.3*weave);
        return environment(reflect(rd,metal.n),0.08+rough*0.2)*coat+vec3<f32>(0.06,0.021,0.008)*max(dot(metal.n,normalize(lightPosition() - p)),0.0);
    }
    if(floorT>0.0 && floorT<40.0){return floorColor(ro+rd*floorT,rd,rough);}
    var c=environment(rd,rough)*0.12;
    let horizon=exp(-pow((rd.y+0.03)/0.13,2.0));
    c+=vec3<f32>(0.018,0.036,0.044)*horizon;
    // Distant recessed slats: deliberate architectural depth, not an image card.
    if(rd.z < -0.001){
        let t=(-4.0 - ro.z)/rd.z;
        if(t>0.0){
            let p=ro+rd*t;
            let grooves=pow(0.5+0.5*cos(p.x*19.0),8.0);
            c+=vec3<f32>(0.018,0.025,0.028)*grooves*exp(-abs(p.y - 1.2)*0.65);
            let line=exp(-pow((p.y - 0.10)/0.021,2.0));
            c+=vec3<f32>(0.28,0.15,0.059)*line;
        }
    }
    return c;
}
fn opticalExit(ro: vec3<f32>,rd: vec3<f32>,id: i32) -> Hit {
    if(id==1){return sphere(ro,rd,ORB,1.045,1);}
    return prism(ro,rd);
}
fn optical(ro: vec3<f32>,rd: vec3<f32>,hit: Hit) -> vec3<f32> {
    let p=ro+hit.t*rd; let n=hit.n;
    var frost=0.0;
    if(hit.id==1){
        // Smooth and frosted glass coexist on one boundary, with no geometry seam.
        let stripe=sin(n.y*18.0+n.x*2.0+0.45*sin(n.z*7.0));
        frost=smoothstep(0.18,0.30,stripe)*u.controls.y;
    }
    let reflectDir=reflect(rd,n);
    let reflection=opaqueRadiance(p+n*0.002,reflectDir,0.012+frost*0.6);
    let cosI=abs(dot(rd,n));
    let fresnel=0.042+0.958*pow(1.0 - cosI,5.0);
    var transmitted=vec3<f32>(0.0); var weight=vec3<f32>(0.0);
    for(var band=0;band<7;band++){
        let nm=430.0+f32(band)*36.66667;
        // Cauchy - shaped IOR curve, exaggerated controllably for the exhibit.
        let ior=1.47+u.controls.z*0.075*(pow(550.0/nm,2.0) - 0.46);
        var inside=refract(rd,n,1.0/ior);
        var origin=p+inside*0.002; var distance=0.0; var throughput=1.0;
        var exitDirection=inside; var exitPoint=origin; var escaped=false;
        for(var bounce=0;bounce<3;bounce++){
            let eh=opticalExit(origin,inside,hit.id);
            if(eh.t>999.0){break;}
            exitPoint=origin+inside*eh.t; distance+=eh.t;
            exitDirection=refract(inside,-eh.n,ior);
            if(dot(exitDirection,exitDirection)>0.0001){
                let r0=pow((ior - 1.0)/(ior+1.0),2.0);
                let exitFresnel=r0+(1.0 - r0)*pow(1.0 - abs(dot(inside,eh.n)),5.0);
                throughput*=1.0 - exitFresnel; escaped=true;break;
            }
            inside=reflect(inside,eh.n); origin=exitPoint+inside*0.002; throughput*=0.94;
        }
        var sampleColor=vec3<f32>(0.012,0.022,0.027);
        if(escaped){
            sampleColor=opaqueRadiance(exitPoint+exitDirection*0.004,exitDirection,frost);
            // A broad deterministic lobe supplies frosted transmission blur.
            if(frost>0.005){
                let tangent=normalize(cross(exitDirection,vec3<f32>(0.07,1.0,0.03)));
                let bitangent=cross(exitDirection,tangent);
                let spread=frost*0.12;
                let a=opaqueRadiance(exitPoint,normalize(exitDirection+tangent*spread),frost);
                let b=opaqueRadiance(exitPoint,normalize(exitDirection - tangent*spread),frost);
                let c=opaqueRadiance(exitPoint,normalize(exitDirection+bitangent*spread),frost);
                sampleColor=mix(sampleColor,(sampleColor+a+b+c)*0.25,saturate(frost*2.8));
            }
        }
        let absorption=exp(-distance*vec3<f32>(0.052,0.022,0.013));
        let sensitivity=bandColor(band);
        transmitted+=sampleColor*absorption*sensitivity*throughput; weight+=sensitivity;
    }
    transmitted/=max(weight,vec3<f32>(0.0001));
    var result=mix(transmitted,reflection,fresnel);
    // The soft internal body provides separation from the charcoal bench.
    result+=vec3<f32>(0.10,0.16,0.17)*frost*(0.2+pow(1.0 - cosI,2.0))*0.34;
    if(hit.id==2){
        let local=turn(p - PRISM,-0.28);
        let e1=abs(dot(vec3<f32>(0.8660254,0.5,0.0),local) - 0.52);
        let e2=abs(dot(vec3<f32>(-0.8660254,0.5,0.0),local) - 0.52);
        let e3=abs(local.y+0.52); let ez=abs(abs(local.z) - 0.39);
        let edge=min(max(e1,e2),min(max(e1,ez),min(max(e2,ez),max(e3,ez))));
        result+=vec3<f32>(0.19,0.30,0.35)*exp(-edge*190.0);
    }
    return result;
}
fn tonemap(v: vec3<f32>) -> vec3<f32> {
    let x=max(v,vec3<f32>(0.0));
    return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),vec3<f32>(0.0),vec3<f32>(1.0));
}
fn errorFunction(x: f32) -> f32 {
    let x2=x*x;
    return sign(x)*sqrt(max(0.0,1.0 - exp(-x2*(1.2732395+0.147*x2)/(1.0+0.147*x2))));
}
fn atmosphere(ro: vec3<f32>, rd: vec3<f32>, distance: f32) -> vec3<f32> {
    // Closed-form Gaussian-cylinder integral, clipped by the first surface and
    // the beam's end planes. No raymarch stepping/banding in this thin shaft.
    let source=lightPosition(); let destination=PRISM+vec3<f32>(0.0,0.35,0.0);
    let axis=destination - source; let axisLength=length(axis); let v=axis/axisLength;
    let m=ro - source; let dv=dot(rd,v); let mv=dot(m,v);
    let a=max(0.000001,1.0 - dv*dv);
    let b=dot(m,rd) - mv*dv; let c=dot(m,m) - mv*mv;
    let middle=-b/a; let miss2=max(0.0,c - b*b/a);
    var lo=0.0; var hi=min(distance,12.0);
    if(abs(dv)>0.00001){
        let t0=-mv/dv; let t1=(axisLength - mv)/dv;
        lo=max(lo,min(t0,t1)); hi=min(hi,max(t0,t1));
    }else if(mv<0.0 || mv>axisLength){return vec3<f32>(0.0);}
    if(hi<=lo){return vec3<f32>(0.0);}
    let radius=0.055; let scale=sqrt(a)/radius;
    let integral=0.8862269*radius/sqrt(a)*exp(-miss2/(radius*radius))*(errorFunction((hi - middle)*scale) - errorFunction((lo - middle)*scale));
    return vec3<f32>(0.62,0.79,0.9)*integral*0.28;
}
@fragment fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
    let resolution=max(u.resolutionTime.xy,vec2<f32>(1.0));
    let uv=(in.uv*2.0 - 1.0)*vec2<f32>(resolution.x/resolution.y,1.0);
    let angle=0.13+u.controls.w+0.055*sin(u.resolutionTime.z*0.22);
    let ro=vec3<f32>(sin(angle)*4.5,2.32,cos(angle)*4.5);
    let lookAt=vec3<f32>(-0.12,0.87,-0.10);
    let forward=normalize(lookAt - ro); let right=normalize(cross(forward,vec3<f32>(0.0,1.0,0.0))); let up=cross(right,forward);
    let rd=normalize(forward*1.84+right*uv.x+up*uv.y);
    var hit=sphere(ro,rd,ORB,1.045,1);
    let ph=prism(ro,rd); if(ph.t<hit.t){hit=ph;}
    var color=opaqueRadiance(ro,rd,0.0);
    var floorT=FAR; if(rd.y<0.0){floorT=-ro.y/rd.y;}
    let mh=sphere(ro,rd,METAL,0.335,3);
    if(hit.t<floorT && hit.t<mh.t){color=optical(ro,rd,hit);}
    color+=atmosphere(ro,rd,min(hit.t,min(floorT,mh.t)));
    let vignette=1.0 - 0.20*pow(length(in.uv - 0.5)*1.3,2.0);
    color=pow(tonemap(color*1.3),vec3<f32>(1.0/2.2))*vignette;
    return vec4<f32>(color,1.0);
}

