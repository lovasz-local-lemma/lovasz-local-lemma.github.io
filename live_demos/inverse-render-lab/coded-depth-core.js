/* Calibrated spatial depth chart: independent periodic planar cells, not a dense scene camera. */
(function initCodedDepth(root, factory) {
  const optics = typeof module === "object" && module.exports ? require("./defocus-core.js") : root.DefocusCore;
  const api = factory(optics);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CodedDepthCore = api;
})(typeof self !== "undefined" ? self : globalThis, function codedDepthFactory(D) {
  "use strict";
  if (!D) throw new Error("CodedDepthCore requires DefocusCore");

  const DEFAULTS = Object.freeze({
    size: 256, grid: 4, focalLength: 50, apertureDiameter: 4,
    pixelPitch: .006, focusDepths: [800, 1450], depthMin: 900, depthMax: 1800, depthStep: 20,
    noiseSigma: .001, aperture: "coded", mode: "single", scene: "terrace", texture: "natural",
    seed: 20260908, priorExponent: 2, priorFloor: 1e-5, flatCell: 15
  });
  const SCENES = Object.freeze({ terrace: "Terraced plaques", slope: "Sloping mosaic", wave: "Undulating relief" });
  const TEXTURES = Object.freeze({ natural: "Textured plaques · generic prior", structured: "Shaded specimens · prior stress" });
  const BOUNDARY_MODEL = "Known independent planar cells; each local image is periodic. No light crosses cell boundaries.";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function configure(overrides) {
    const given = overrides || {}, c = Object.assign({}, DEFAULTS, given);
    c.focusDepths = Array.from(given.focusDepths || DEFAULTS.focusDepths);
    if (given.pixelPitch === undefined) c.pixelPitch = DEFAULTS.pixelPitch * DEFAULTS.size / c.size;
    const n = c.size / c.grid;
    if (![128, 256, 512].includes(c.size) || c.grid !== 4 || (n & (n - 1))) throw new Error("Use a 4×4 chart at 128, 256 or 512 pixels");
    if (!["single", "pair"].includes(c.mode)) throw new Error("Unknown depth capture mode");
    if (!D.APERTURE_KEYS.includes(c.aperture)) throw new Error("Unknown aperture");
    if (![c.focalLength,c.apertureDiameter,c.pixelPitch].every(v=>Number.isFinite(v)&&v>0)) throw new Error("Positive finite camera dimensions required");
    if (!(c.depthMin > c.focalLength && c.depthMax > c.depthMin && c.depthStep > 0) || (c.depthMax-c.depthMin)/c.depthStep > 150) throw new Error("Invalid depth dictionary");
    if (!(Number.isFinite(c.noiseSigma) && c.noiseSigma >= 0)) throw new Error("Invalid sensor noise");
    if (c.focusDepths.length !== 2 || c.focusDepths.some(v => !(Number.isFinite(v) && v > c.focalLength))) throw new Error("Two calibrated focus distances required");
    if (c.mode === "pair" && c.focusDepths[0] === c.focusDepths[1]) throw new Error("Two distinct focus settings required");
    // A stationary Gaussian texture prior sees |H|², which is unchanged by PSF reversal.
    // Its single-photo depth estimate therefore needs a known side of the focus plane.
    if (c.mode === "single" && c.depthMin <= c.focusDepths[0]) throw new Error("Single-photo search must be on the known far side of focus");
    return c;
  }

  function cellsFor(c) {
    const n = c.size / c.grid, cells = [];
    for (let row = 0; row < c.grid; row++) for (let column = 0; column < c.grid; column++) {
      cells.push({ index: row*c.grid+column, x: column*n, y: row*n, width: n, height: n });
    }
    return cells;
  }
  function extract(field, size, cell) {
    const out = new Float64Array(cell.width * cell.height);
    for (let y=0;y<cell.height;y++) out.set(field.subarray((cell.y+y)*size+cell.x,(cell.y+y)*size+cell.x+cell.width),y*cell.width);
    return out;
  }
  function place(target, patch, size, cell) {
    for (let y=0;y<cell.height;y++) target.set(patch.subarray(y*cell.width,(y+1)*cell.width),(cell.y+y)*size+cell.x);
  }
  function fillCell(target, value, size, cell) {
    for (let y=0;y<cell.height;y++) target.fill(value,(cell.y+y)*size+cell.x,(cell.y+y)*size+cell.x+cell.width);
  }

  // Sharp texture and depth exist only on this forward-simulation side of the API. The
  // cell grid is part of camera calibration, independent of which layout/texture is shown.
  function makeScene(name, overrides) {
    const c = configure(overrides), sceneName = name || c.scene;
    if (!SCENES[sceneName] || !TEXTURES[c.texture]) throw new Error("Unknown depth chart scene or texture");
    const sharp = new Float64Array(c.size*c.size), truthDepth = new Float64Array(sharp.length), patches = cellsFor(c);
    const n = c.size/c.grid;
    for (const cell of patches) {
      const column = cell.x/n, row = cell.y/n;
      let fraction;
      if (sceneName === "terrace") fraction = .11 + row*.245 + (column-1.5)*.019;
      else if (sceneName === "slope") fraction = .07 + column*.19 + row*.075;
      else fraction = .49 + .31*Math.sin((column+.4)*1.15)*Math.cos((row+.2)*1.25);
      cell.depth = c.depthMin + fraction*(c.depthMax-c.depthMin);
      cell.flat = cell.index === c.flatCell;
      const grain = D.makeScene(c.seed+cell.index*104729,{size:n,priorExponent:c.priorExponent,priorFloor:c.priorFloor});
      const field = new Float64Array(n*n);
      const specimen = c.texture === "structured" ? D.makeRenderedTarget(cell.index%2 ? "botanical" : "stilllife",n) : null;
      for (let y=0;y<n;y++) for (let x=0;x<n;x++) {
        const i=y*n+x;
        // The grain has the generic spectrum assumed by the single-image likelihood. A
        // smooth, periodic light variation gives the plaque a readable embossed appearance.
        // Structured specimens intentionally violate that stationary Gaussian assumption.
        const value = specimen ? specimen[i]+.014*grain[i] : .46+.085*grain[i]+.035*Math.cos(2*Math.PI*x/n)*Math.cos(2*Math.PI*y/n);
        field[i] = cell.flat ? .46 : clamp(value,.015,.985);
      }
      place(sharp,field,c.size,cell); fillCell(truthDepth,cell.depth,c.size,cell);
    }
    return { size:c.size, grid:c.grid, sharp, truthDepth, patches, scene:sceneName, texture:c.texture, boundaryModel:BOUNDARY_MODEL };
  }

  function psfAtDepth(depth, focusIndex, overrides) {
    const c = configure(overrides), n = c.size/c.grid;
    if (!(Number.isFinite(depth)&&depth>c.focalLength) || ![0,1].includes(focusIndex)) throw new Error("Valid object distance and focus index required");
    const blur = D.signedBlurDiameterPixels(depth,Object.assign({},c,{focusDepth:c.focusDepths[focusIndex]}));
    if (Math.abs(blur)>n*2) throw new Error("Defocus kernel exceeds the calibrated cell sampling range");
    return D.pointSpreadFunction(c.aperture,blur,n,D.transmission(c.aperture,128));
  }

  function captureScene(scene, overrides) {
    const c = configure(overrides), count = c.mode === "pair" ? 2 : 1;
    if (scene.size !== c.size || scene.sharp.length !== c.size*c.size || scene.patches.length !== c.grid*c.grid) throw new Error("Chart/camera size mismatch");
    const captures = Array.from({length:count},()=>new Float64Array(c.size*c.size));
    for (const cell of scene.patches) {
      const texture = extract(scene.sharp,c.size,cell);
      for (let j=0;j<count;j++) {
        const blurred = D.convolve(texture,psfAtDepth(cell.depth,j,c),cell.width);
        place(captures[j],D.addNoise(blurred,c.noiseSigma,c.seed+cell.index*7919+j*1000003+17),c.size,cell);
      }
    }
    return captures;
  }

  function buildDictionary(c) {
    const n=c.size/c.grid,count=c.mode === "pair" ? 2 : 1, distances=[], transforms=[];
    for (let depth=c.depthMin;depth<=c.depthMax+1e-9;depth+=c.depthStep) {
      distances.push(depth);
      transforms.push(Array.from({length:count},(_,j)=>D.forwardTransform(psfAtDepth(depth,j,c),n)));
    }
    return { distances, transforms };
  }

  function fitCell(observations, dictionary, c) {
    const n=c.size/c.grid,N=n*n, spectra=observations.map(image=>D.forwardTransform(image,n));
    const prior=D.priorSpectrum(n,c), noise=Math.max(1e-14,N*c.noiseSigma*c.noiseSigma);
    const powers=spectra.map(s=>Float64Array.from(s.re,(v,i)=>v*v+s.im[i]*s.im[i]));
    let observedVariance=0;
    for (const power of powers) for(let i=1;i<N;i++) observedVariance+=power[i]/(spectra.length*N*N);
    const textureExcess=observedVariance-c.noiseSigma*c.noiseSigma*(N-1)/N;
    const texturePoor=textureExcess<=Math.max(1e-13,6*c.noiseSigma*c.noiseSigma/Math.sqrt(N));
    const scores=[],variances=[];
    // Generic texture variance is profiled from the observation, never read from the scene.
    // A broad, fixed logarithmic ladder is shared by every layout, seed and aperture.
    const varianceLadder=Array.from({length:17},(_,i)=>Math.pow(2,-15+i*.75));
    for (const H of dictionary.transforms) {
      let score=Infinity,variance=.008;
      if (c.mode === "single") {
        const hp=Float64Array.from(H[0].re,(v,i)=>v*v+H[0].im[i]*H[0].im[i]);
        for (const amplitude of varianceLadder) {
          let total=0;
          for(let i=1;i<N;i++) {
            const v=hp[i]*prior[i]*amplitude+noise;
            total+=powers[0][i]/v+Math.log(v);
          }
          if(total<score) {score=total;variance=amplitude;}
        }
        score/=N-1;
      } else {
        let total=0;
        const a=H[0],b=H[1],u=spectra[0],v=spectra[1];
        for(let i=1;i<N;i++) {
          const denominator=a.re[i]**2+a.im[i]**2+b.re[i]**2+b.im[i]**2;
          if(denominator<1e-18) {total+=powers[0][i]+powers[1][i];continue;}
          const re=u.re[i]*b.re[i]-u.im[i]*b.im[i]-v.re[i]*a.re[i]+v.im[i]*a.im[i];
          const im=u.re[i]*b.im[i]+u.im[i]*b.re[i]-v.re[i]*a.im[i]-v.im[i]*a.re[i];
          total+=(re*re+im*im)/denominator;
        }
        score=total/((N-1)*noise);
      }
      scores.push(score);variances.push(variance);
    }
    let best=0;
    for(let i=1;i<scores.length;i++) if(scores[i]<scores[best]) best=i;
    const atBoundary=best===0||best===scores.length-1;
    // Score separation is conditional on this optical/texture model, not a calibrated
    // probability that the reported depth is correct on arbitrary photographs.
    let outside=Infinity;
    for(let i=0;i<scores.length;i++) if(Math.abs(dictionary.distances[i]-dictionary.distances[best])>=Math.max(60,c.depthStep*2)) outside=Math.min(outside,scores[i]);
    const separation=Math.max(0,(outside-scores[best])*(N-1));
    const confidence=texturePoor||atBoundary ? 0 : clamp(1-Math.exp(-separation*.025),0,1);
    const ambiguous=texturePoor||atBoundary||confidence<.12;
    const h=dictionary.transforms[best],re=new Float64Array(N),im=new Float64Array(N);
    for(let i=0;i<N;i++) {
      let power=0;
      for(let j=0;j<h.length;j++) {
        power+=h[j].re[i]**2+h[j].im[i]**2;
        re[i]+=h[j].re[i]*spectra[j].re[i]+h[j].im[i]*spectra[j].im[i];
        im[i]+=h[j].re[i]*spectra[j].im[i]-h[j].im[i]*spectra[j].re[i];
      }
      const regularization=i===0?0:noise/Math.max(1e-14,prior[i]*variances[best]);
      re[i]/=Math.max(1e-16,power+regularization);im[i]/=Math.max(1e-16,power+regularization);
    }
    D.fft2(re,im,n,true);
    return {depth:ambiguous?NaN:dictionary.distances[best],bestDepth:dictionary.distances[best],confidence,
      depths:dictionary.distances.slice(),scores,bestIndex:best,ambiguous,atBoundary,texturePoor,
      textureVariance:variances[best],scoreSeparation:separation,reconstruction:re};
  }

  // This boundary accepts sensor arrays and calibration only. It does not accept truth depth,
  // target pixels, object masks, a scene selector, or simulator-generated kernel identities.
  function fitDepth(captures, overrides) {
    const c=configure(overrides),count=c.mode === "pair"?2:1;
    if(captures.length!==count||captures.some(a=>a.length!==c.size*c.size||!Array.prototype.every.call(a,Number.isFinite))) throw new Error("Invalid coded-depth measurements");
    const dictionary=buildDictionary(c),reconstruction=new Float64Array(c.size*c.size);
    const depth=new Float64Array(reconstruction.length),confidence=new Float64Array(reconstruction.length),patches=[];
    for(const cell of cellsFor(c)) {
      const result=fitCell(captures.map(image=>extract(image,c.size,cell)),dictionary,c);
      place(reconstruction,result.reconstruction,c.size,cell);
      fillCell(depth,result.depth,c.size,cell);fillCell(confidence,result.confidence,c.size,cell);
      const patch=Object.assign({},cell,result);delete patch.reconstruction;patches.push(patch);
    }
    return {size:c.size,grid:c.grid,reconstruction,depth,confidence,patches,depthMin:c.depthMin,depthMax:c.depthMax,
      mode:c.mode,boundaryModel:BOUNDARY_MODEL,confidenceMeaning:"Model-conditional score separation, not calibrated accuracy"};
  }

  return {DEFAULTS,SCENES,TEXTURES,BOUNDARY_MODEL,configure,makeScene,captureScene,fitDepth,psfAtDepth};
});
