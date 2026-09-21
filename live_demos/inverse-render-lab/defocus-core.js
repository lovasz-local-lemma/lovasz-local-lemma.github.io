(function initDefocusCore(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DefocusCore = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  // EXPERIMENTAL. Engineered aperture, depth from defocus.
  //
  // Sibling to the 2-D coded aperture lane, not a reuse of it. Same theme -- aperture design
  // changes what a measurement can resolve -- and completely different physics: this one lives
  // in a real lens, where the aperture is the defocus point spread function and the unknown is
  // the depth that set its scale. Nothing here shares a forward model with the NLOS work, which
  // is why it ships marked experimental rather than folded into that panel.
  //
  // The mechanism. Defocus convolves the sharp image with a scaled copy of the aperture. A
  // conventional round aperture blurs into a disk, and disks of different diameters have
  // Fourier transforms that are hard to tell apart -- their zero crossings are a smooth family,
  // so a slightly wrong depth explains the data almost as well as the right one. Punch a
  // deliberate pattern into the aperture and the zeros scatter into a signature that moves
  // sharply with scale, which is what makes the depth identifiable.
  //
  // THE PART THAT IS USUALLY LEFT OUT. A coded aperture is mostly opaque. It throws away light,
  // and at a fixed exposure that is a direct SNR penalty the round aperture never pays. So the
  // comparison is run on two axes:
  //
  //   matched noise    every aperture's PSF normalized to unit sum. Flattering to the coded
  //                    aperture, and the comparison most papers show.
  //   matched photons  the PSF's integral is its actual transmission, so a 50% open mask
  //                    delivers half the signal against identical sensor noise. Physical.
  //
  // Whether coding still wins on the second axis, and at what noise level it stops, is measured.
  //
  // Anchors: Levin et al. 2007, Image and Depth from a Conventional Camera with a Coded
  // Aperture; Veeraraghavan et al. 2007, Dappled Photography; Zhou and Nayar on what makes a
  // good aperture, whose whole point is that the answer depends on the noise level.
  //
  // SCOPE. The coded pattern here is a fixed pseudorandom binary mask, NOT the pattern Levin
  // et al. optimized -- any advantage it shows is a lower bound on what aperture design buys.
  // Scenes are drawn from the same 1/f Gaussian model the estimator assumes, which makes the
  // likelihood exact and isolates the aperture as the only difference; real photographs are not
  // that. Monochrome, no chromatic aberration, no diffraction, geometric optics only.

  // The experiment is controlled on BLUR DIAMETER rather than on depth, and the depths are
  // derived from it. Stepping depth directly puts an arbitrary 1/d nonlinearity between the
  // knob and the quantity that actually decides identifiability, which would make the ladder
  // bunch up at one end and confound the aperture comparison with uneven spacing.
  //
  // Every rung sits BEYOND the focus plane, so blur is monotonic in depth. A symmetric aperture
  // cannot tell near focus error from far focus error at all -- the circle of confusion depends
  // on the magnitude of 1/df - 1/d and not its sign -- and that is a separate finding, measured
  // separately, rather than something allowed to swamp this comparison.
  const DEFAULTS = {
    size: 64,              // image is size x size, and size must be a power of two
    focalLength: 50,       // mm
    apertureDiameter: 4,   // mm, so f/12.5
    focusDepth: 800,       // mm, nearer than every rung on the ladder
    blurLadder: [1.4, 2.2, 3.1, 4.2, 5.4, 6.8, 8.4, 10.2],
    pixelPitch: 0.006,     // mm on the sensor
    noiseSigma: 0.01,
    priorExponent: 2,      // 1/|w|^2, the usual natural image spectrum
    priorFloor: 1e-5,
    trials: 24,
    seed: 20260818
  };

  const APERTURE_KEYS = ["circular", "coded", "annulus"];

  const APERTURE_LABELS = {
    circular: "conventional round",
    coded: "binary coded mask",
    annulus: "annulus"
  };

  // ---------------------------------------------------------------------------------------
  // Apertures
  // ---------------------------------------------------------------------------------------

  // Each aperture answers one question: is the point (u, v) in the unit aperture disk open?
  // Keeping them as predicates rather than rasters means the PSF for any blur diameter is
  // sampled from the same continuous definition, so a comparison across scales is not
  // contaminated by resampling a raster.
  const CODED_CELLS = 7;
  const CODED_PATTERN = buildCodedPattern(CODED_CELLS, 8675309);

  function buildCodedPattern(cells, seed) {
    const rng = mulberry32(seed);
    const table = new Uint8Array(cells * cells);
    for (let i = 0; i < table.length; i += 1) table[i] = rng() < 0.5 ? 1 : 0;
    return table;
  }

  function apertureOpen(kind, u, v) {
    const r2 = u * u + v * v;
    if (r2 > 1) return 0;
    if (kind === "circular") return 1;
    if (kind === "annulus") return r2 > 0.55 * 0.55 ? 1 : 0;
    if (kind === "coded") {
      const cx = Math.min(CODED_CELLS - 1, Math.max(0, Math.floor((u * 0.5 + 0.5) * CODED_CELLS)));
      const cy = Math.min(CODED_CELLS - 1, Math.max(0, Math.floor((v * 0.5 + 0.5) * CODED_CELLS)));
      return CODED_PATTERN[cy * CODED_CELLS + cx];
    }
    throw new Error(`unknown aperture ${kind}`);
  }

  // Fraction of the full disk that is open. This is the light penalty, and it is the number
  // that decides whether coding is worth it at a fixed exposure.
  function transmission(kind, samples) {
    const n = samples || 512;
    let open = 0;
    let inside = 0;
    for (let j = 0; j < n; j += 1) {
      const v = -1 + 2 * (j + 0.5) / n;
      for (let i = 0; i < n; i += 1) {
        const u = -1 + 2 * (i + 0.5) / n;
        if (u * u + v * v > 1) continue;
        inside += 1;
        open += apertureOpen(kind, u, v);
      }
    }
    return inside > 0 ? open / inside : 0;
  }

  // ---------------------------------------------------------------------------------------
  // Optics
  // ---------------------------------------------------------------------------------------

  // Thin lens. With the sensor placed to focus at focusDepth, a point at depth d images as a
  // circle of confusion of diameter A*v*|1/focusDepth - 1/d| on the sensor.
  function sensorDistance(config) {
    return 1 / (1 / config.focalLength - 1 / config.focusDepth);
  }

  function blurDiameterPixels(depth, overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    const millimetres = config.apertureDiameter * sensorDistance(config)
      * Math.abs(1 / config.focusDepth - 1 / depth);
    return millimetres / config.pixelPitch;
  }

  // Invert the thin lens for the far side of focus, so a blur ladder becomes a depth ladder.
  function depthForBlur(blurPixels, overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    const millimetres = blurPixels * config.pixelPitch;
    const reciprocal = 1 / config.focusDepth - millimetres / (config.apertureDiameter * sensorDistance(config));
    return reciprocal > 0 ? 1 / reciprocal : Infinity;
  }

  function ladderDepths(overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    return config.blurLadder.map((blur) => depthForBlur(blur, overrides));
  }

  // The PSF, centred at the origin with wraparound so it can be multiplied against an FFT of
  // the image directly. Normalized so its sum is `scale` -- pass the transmission for the
  // physical case, or 1 to hand the coded aperture its lost photons back.
  // blurPixels is SIGNED. Positive means the point is beyond the focus plane, negative means
  // nearer than it. The sign is not cosmetic: rays from a near point cross before the sensor and
  // from a far point after it, so the aperture is imaged rotated by 180 degrees between the two
  // cases. For a centrally symmetric aperture that rotation is the identity, and the two PSFs
  // are bit-for-bit equal -- which is exactly why a round aperture cannot tell near from far.
  function pointSpreadFunction(kind, blurPixels, size, scale) {
    const psf = new Float64Array(size * size);
    const flip = blurPixels < 0 ? -1 : 1;
    const diameter = Math.max(1e-6, Math.abs(blurPixels));
    const radius = diameter * 0.5;
    const reach = Math.ceil(radius) + 1;
    const superSamples = 4;
    let sum = 0;
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        let weight = 0;
        for (let sy = 0; sy < superSamples; sy += 1) {
          for (let sx = 0; sx < superSamples; sx += 1) {
            const px = dx + (sx + 0.5) / superSamples - 0.5;
            const py = dy + (sy + 0.5) / superSamples - 0.5;
            weight += apertureOpen(kind, flip * px / radius, flip * py / radius);
          }
        }
        if (weight <= 0) continue;
        // Wrap so index 0 is the PSF centre, which is what the FFT expects.
        const x = ((dx % size) + size) % size;
        const y = ((dy % size) + size) % size;
        psf[y * size + x] += weight / (superSamples * superSamples);
        sum += weight / (superSamples * superSamples);
      }
    }
    // A blur below one pixel is a delta, not a disk. Say so rather than letting the
    // supersampler produce an arbitrary near-delta whose energy depends on subpixel phase.
    if (sum <= 0) {
      psf[0] = 1;
      sum = 1;
    }
    const target = scale === undefined ? 1 : scale;
    for (let i = 0; i < psf.length; i += 1) psf[i] *= target / sum;
    return psf;
  }

  // ---------------------------------------------------------------------------------------
  // FFT
  // ---------------------------------------------------------------------------------------

  function fft1(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i += 1) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const angle = (inverse ? 2 : -2) * Math.PI / len;
      const wr = Math.cos(angle);
      const wi = Math.sin(angle);
      for (let i = 0; i < n; i += len) {
        let cr = 1;
        let ci = 0;
        for (let k = 0; k < len / 2; k += 1) {
          const ar = re[i + k];
          const ai = im[i + k];
          const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ar + br;
          im[i + k] = ai + bi;
          re[i + k + len / 2] = ar - br;
          im[i + k + len / 2] = ai - bi;
          const nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = nr;
        }
      }
    }
    if (inverse) {
      for (let i = 0; i < n; i += 1) { re[i] /= n; im[i] /= n; }
    }
  }

  function fft2(re, im, size, inverse) {
    const rowRe = new Float64Array(size);
    const rowIm = new Float64Array(size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) { rowRe[x] = re[y * size + x]; rowIm[x] = im[y * size + x]; }
      fft1(rowRe, rowIm, inverse);
      for (let x = 0; x < size; x += 1) { re[y * size + x] = rowRe[x]; im[y * size + x] = rowIm[x]; }
    }
    for (let x = 0; x < size; x += 1) {
      for (let y = 0; y < size; y += 1) { rowRe[y] = re[y * size + x]; rowIm[y] = im[y * size + x]; }
      fft1(rowRe, rowIm, inverse);
      for (let y = 0; y < size; y += 1) { re[y * size + x] = rowRe[y]; im[y * size + x] = rowIm[y]; }
    }
  }

  function forwardTransform(field, size) {
    const re = Float64Array.from(field);
    const im = new Float64Array(size * size);
    fft2(re, im, size, false);
    return { re, im };
  }

  // ---------------------------------------------------------------------------------------
  // Scenes
  // ---------------------------------------------------------------------------------------

  // Radial frequency in cycles per image, with the DC term at index 0 and negative frequencies
  // wrapped into the top half, matching the FFT layout.
  function frequencyMagnitude(x, y, size) {
    const fx = x <= size / 2 ? x : x - size;
    const fy = y <= size / 2 ? y : y - size;
    return Math.sqrt(fx * fx + fy * fy);
  }

  // S[k] = the expected squared magnitude of the scene's DFT coefficient at frequency k.
  //
  // Defined in DFT units on purpose. The estimator and the scene generator have to agree about
  // normalization exactly, and stating the prior as "the variance of this specific coefficient"
  // leaves nothing to be inferred from whichever FFT convention happens to be in use. Getting
  // this wrong does not throw; it produces a depth estimator that sits exactly at chance while
  // every individual piece looks right.
  function priorSpectrum(size, overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    const cells = size * size;
    const spectrum = new Float64Array(cells);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const w = frequencyMagnitude(x, y, size);
        spectrum[y * size + x] = cells
          * (1 / Math.pow(Math.max(1, w), config.priorExponent) + config.priorFloor);
      }
    }
    // DC carries no depth information -- every PSF here preserves it exactly, since they all
    // integrate to the same transmission -- and left at full power it would dominate the sum.
    spectrum[0] = cells * config.priorFloor;
    // Scale so the scene has unit spatial variance. Without this, noiseSigma means nothing on
    // its own: it would be a number whose interpretation depends on the prior exponent and the
    // image size, and the noise sweep below -- which is the whole experiment -- would not be
    // comparable across configurations.
    let total = 0;
    for (let i = 0; i < cells; i += 1) total += spectrum[i];
    const gain = total > 0 ? (cells * cells) / total : 1;
    for (let i = 0; i < cells; i += 1) spectrum[i] *= gain;
    return spectrum;
  }

  // A scene drawn from exactly the prior the estimator assumes. An idealization, and the right
  // one here: it makes the likelihood exact, so any difference between apertures is a property
  // of the aperture rather than of a model mismatch neither of them expected.
  //
  // Built by shaping spatial white noise rather than by drawing Fourier coefficients directly.
  // Drawing them independently gives a spectrum that is not Hermitian, so the inverse transform
  // is complex and silently discarding its imaginary part halves the variance of what remains --
  // which would put the generator and the estimator back out of step in a way that again does
  // not throw. Shaping the transform of a real signal keeps Hermitian symmetry for free.
  function makeScene(seed, overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    const size = config.size;
    const cells = size * size;
    const spectrum = priorSpectrum(size, overrides);
    const rng = mulberry32(seed >>> 0);
    const re = new Float64Array(cells);
    const im = new Float64Array(cells);
    for (let i = 0; i < cells; i += 1) re[i] = gaussian(rng);
    fft2(re, im, size, false);
    for (let i = 0; i < cells; i += 1) {
      const gain = Math.sqrt(spectrum[i] / cells);
      re[i] *= gain;
      im[i] *= gain;
    }
    fft2(re, im, size, true);
    return re;
  }

  // A piecewise-constant scene: random rectangles of random intensity. Its gradients are
  // genuinely sparse -- almost all zero, a few large -- which the 1/f Gaussian scene above is
  // not. Gaussian fields have random phase and Gaussian gradients however you shape their
  // spectrum, so a sparsity-based score has nothing to grip.
  //
  // This is not decoration on the sign experiment, it is half of the prerequisite. The other
  // half is a non-Gaussian scorer. Neither works without the other.
  function makePiecewiseScene(seed, overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    const size = config.size;
    const rng = mulberry32(seed >>> 0);
    const field = new Float64Array(size * size);
    const rectangles = config.sceneRectangles || 14;
    for (let r = 0; r < rectangles; r += 1) {
      const w = 4 + Math.floor(rng() * size * 0.4);
      const h = 4 + Math.floor(rng() * size * 0.4);
      const x0 = Math.floor(rng() * size);
      const y0 = Math.floor(rng() * size);
      const value = rng() * 2 - 1;
      for (let dy = 0; dy < h; dy += 1) {
        for (let dx = 0; dx < w; dx += 1) {
          field[((y0 + dy) % size) * size + ((x0 + dx) % size)] += value;
        }
      }
    }
    let mean = 0;
    for (const v of field) mean += v;
    mean /= field.length;
    let variance = 0;
    for (const v of field) variance += (v - mean) * (v - mean);
    variance /= field.length;
    const gain = variance > 0 ? 1 / Math.sqrt(variance) : 1;
    for (let i = 0; i < field.length; i += 1) field[i] = (field[i] - mean) * gain;
    return field;
  }

  function sceneByKind(kind, seed, overrides) {
    return kind === "piecewise" ? makePiecewiseScene(seed, overrides) : makeScene(seed, overrides);
  }

  function convolve(field, psf, size) {
    const a = forwardTransform(field, size);
    const b = forwardTransform(psf, size);
    const re = new Float64Array(size * size);
    const im = new Float64Array(size * size);
    for (let i = 0; i < re.length; i += 1) {
      re[i] = a.re[i] * b.re[i] - a.im[i] * b.im[i];
      im[i] = a.re[i] * b.im[i] + a.im[i] * b.re[i];
    }
    fft2(re, im, size, true);
    return re;
  }

  function addNoise(field, sigma, seed) {
    const rng = mulberry32(seed >>> 0);
    const out = Float64Array.from(field);
    for (let i = 0; i < out.length; i += 1) out[i] += gaussian(rng) * sigma;
    return out;
  }

  // ---------------------------------------------------------------------------------------
  // Depth from defocus
  // ---------------------------------------------------------------------------------------

  // Levin's likelihood, which is the whole reason this works. Under x ~ N(0, P) and
  // n ~ N(0, sigma^2 I), the observation is Gaussian with per-frequency variance
  //
  //   v_k(w) = |F_k(w)|^2 P(w) + sigma^2
  //
  // and    -log p(y | k) = sum_w [ |Y(w)|^2 / v_k(w) + log v_k(w) ].
  //
  // The log v term is not decoration. Without it every hypothesis is beaten by the sharpest
  // PSF, which explains any data by attributing it to signal -- the determinant is what
  // charges a hypothesis for the freedom it claims. A depth-from-defocus implementation that
  // scores by residual alone will silently prefer the in-focus hypothesis everywhere, look
  // plausible, and be wrong.
  function depthScores(observation, psfs, overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    const size = config.size;
    const cells = size * size;
    const prior = priorSpectrum(size, overrides);
    // Spatial white noise of variance sigma^2 contributes cells*sigma^2 to |Y[k]|^2 under an
    // unnormalized DFT. Everything in this function is in those same units.
    const noiseTerm = cells * config.noiseSigma * config.noiseSigma;
    const spectrum = forwardTransform(observation, size);
    const scores = [];
    for (const psf of psfs) {
      const kernel = forwardTransform(psf, size);
      let total = 0;
      for (let i = 0; i < cells; i += 1) {
        const kernelPower = kernel.re[i] * kernel.re[i] + kernel.im[i] * kernel.im[i];
        const observed = spectrum.re[i] * spectrum.re[i] + spectrum.im[i] * spectrum.im[i];
        const variance = kernelPower * prior[i] + noiseTerm;
        total += observed / variance + Math.log(variance);
      }
      scores.push(total);
    }
    return scores;
  }

  function buildPsfSet(kind, overrides, matchPhotons) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    const scale = matchPhotons ? transmission(kind) : 1;
    return config.blurLadder.map((blur) =>
      pointSpreadFunction(kind, blur, config.size, scale));
  }

  // One aperture, swept over every true depth, repeated over independent scenes. Returns the
  // confusion structure rather than only an accuracy, because which depths get confused with
  // which is the interesting part -- a round aperture confuses neighbours symmetrically, and
  // it also cannot tell near from far at all, since the circle of confusion depends on the
  // magnitude of the focus error and not its sign.
  function depthTrial(kind, overrides, options) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    const settings = options || {};
    const matchPhotons = settings.matchPhotons !== false;
    const trials = settings.trials || config.trials;
    const psfs = buildPsfSet(kind, overrides, matchPhotons);
    const depthCount = config.blurLadder.length;
    const confusion = new Int32Array(depthCount * depthCount);
    let correct = 0;
    let indexError = 0;
    let total = 0;
    for (let trial = 0; trial < trials; trial += 1) {
      const scene = makeScene(config.seed + trial * 7919, overrides);
      for (let truth = 0; truth < depthCount; truth += 1) {
        const blurred = convolve(scene, psfs[truth], config.size);
        const observation = addNoise(blurred, config.noiseSigma, config.seed + trial * 104729 + truth);
        const scores = depthScores(observation, psfs, overrides);
        let best = 0;
        for (let k = 1; k < depthCount; k += 1) if (scores[k] < scores[best]) best = k;
        confusion[truth * depthCount + best] += 1;
        if (best === truth) correct += 1;
        indexError += Math.abs(best - truth);
        total += 1;
      }
    }
    return {
      aperture: kind,
      label: APERTURE_LABELS[kind] || kind,
      matchPhotons,
      transmission: transmission(kind),
      accuracy: correct / Math.max(1, total),
      meanIndexError: indexError / Math.max(1, total),
      confusion,
      depthCount,
      trials
    };
  }

  function apertureComparison(overrides, options) {
    const result = {};
    for (const key of APERTURE_KEYS) result[key] = depthTrial(key, overrides, options);
    return result;
  }

  // Is the aperture its own 180-degree rotation? If so, near and far at the same blur magnitude
  // produce literally the same PSF and no estimator, prior or exposure can separate them. This
  // is a property of the mask alone -- computable without running anything -- and it is the one
  // place where coding has a structural rather than a statistical advantage.
  function centrallySymmetric(kind, samples) {
    const n = samples || 256;
    for (let j = 0; j < n; j += 1) {
      const v = -1 + 2 * (j + 0.5) / n;
      for (let i = 0; i < n; i += 1) {
        const u = -1 + 2 * (i + 0.5) / n;
        if (u * u + v * v > 1) continue;
        if (apertureOpen(kind, u, v) !== apertureOpen(kind, -u, -v)) return false;
      }
    }
    return true;
  }

  // Wiener deconvolution against the same 1/f prior, used only as a means to an end: it turns
  // "which PSF explains the data" into a picture whose artifacts a non-Gaussian score can see.
  function wienerDeconvolve(observation, psf, overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    const size = config.size;
    const cells = size * size;
    const prior = priorSpectrum(size, overrides);
    const noiseTerm = cells * config.noiseSigma * config.noiseSigma;
    const y = forwardTransform(observation, size);
    const k = forwardTransform(psf, size);
    const re = new Float64Array(cells);
    const im = new Float64Array(cells);
    for (let i = 0; i < cells; i += 1) {
      const power = k.re[i] * k.re[i] + k.im[i] * k.im[i];
      const denominator = power + noiseTerm / Math.max(1e-12, prior[i]);
      if (denominator <= 0) continue;
      // conj(K) * Y / (|K|^2 + noise/prior)
      re[i] = (k.re[i] * y.re[i] + k.im[i] * y.im[i]) / denominator;
      im[i] = (k.re[i] * y.im[i] - k.im[i] * y.re[i]) / denominator;
    }
    fft2(re, im, size, true);
    return re;
  }

  // Sum of |gradient|^alpha with alpha below one -- a sparse, hyper-Laplacian penalty. This is
  // the piece a Gaussian prior cannot supply. Deconvolving with the wrong PSF leaves ringing,
  // and ringing is dense mid-magnitude gradient rather than the sparse spikes a real image has.
  function sparseGradientScore(image, size, alpha) {
    const power = alpha === undefined ? 0.8 : alpha;
    let total = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const here = image[y * size + x];
        const right = image[y * size + ((x + 1) % size)];
        const down = image[((y + 1) % size) * size + x];
        total += Math.pow(Math.abs(right - here), power) + Math.pow(Math.abs(down - here), power);
      }
    }
    return total;
  }

  // Near or far, at a blur magnitude the estimator is told. Chance is 0.5.
  //
  // TWO scorers, because the difference between them IS the result.
  //
  //   gaussian  the exact likelihood used everywhere else in this lane. It depends on the PSF
  //             only through |K(w)|^2, and a 180 degree rotation of a real PSF conjugates its
  //             transform, leaving |K| bit-identical. So this scorer is blind to the sign for
  //             EVERY aperture, symmetric or not -- not noise limited, structurally blind.
  //   sparse    Wiener deconvolve with each hypothesis, then score by a hyper-Laplacian
  //             gradient penalty. Non-Gaussian, therefore phase sensitive, therefore able to
  //             see a difference that lives entirely in the phase.
  //
  // The two candidates here share a blur magnitude and differ only by rotation, which makes
  // this the one place the sparse score can be trusted without calibration: any bias it has
  // toward smoother deconvolutions cancels exactly between them.
  function signTrial(kind, overrides, options) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    const settings = options || {};
    const matchPhotons = settings.matchPhotons !== false;
    const scorer = settings.scorer || "gaussian";
    const sceneKind = settings.sceneKind || "gaussian";
    const trials = settings.trials || config.trials;
    const scale = matchPhotons ? transmission(kind) : 1;
    const magnitudes = settings.magnitudes || config.blurLadder;
    let correct = 0;
    let total = 0;
    // The seeds vary with the blur magnitude as well as the trial. An earlier version seeded on
    // the trial alone, so all eight rungs of the ladder saw the SAME scene and the same noise
    // draw -- the accuracy was then an average over eight correlated repeats rather than over
    // `total` independent decisions, which inflates the apparent sample size and makes any
    // tolerance derived from it too tight. That matters here specifically because the
    // near-chance cells are decided by coin flips, and the tolerance guarding them was chosen
    // from an assumed number of independent draws.
    for (let m = 0; m < magnitudes.length; m += 1) {
      const magnitude = magnitudes[m];
      const far = pointSpreadFunction(kind, magnitude, config.size, scale);
      const near = pointSpreadFunction(kind, -magnitude, config.size, scale);
      for (let trial = 0; trial < trials; trial += 1) {
        for (const truthIsFar of [true, false]) {
          const stream = config.seed + m * 15485863 + trial * 7919 + (truthIsFar ? 1 : 2);
          const scene = sceneByKind(sceneKind, stream, overrides);
          const blurred = convolve(scene, truthIsFar ? far : near, config.size);
          const observation = addNoise(blurred, config.noiseSigma, stream * 31 + 5);
          let farScore;
          let nearScore;
          if (scorer === "sparse") {
            farScore = sparseGradientScore(wienerDeconvolve(observation, far, overrides), config.size);
            nearScore = sparseGradientScore(wienerDeconvolve(observation, near, overrides), config.size);
          } else {
            const scores = depthScores(observation, [far, near], overrides);
            farScore = scores[0];
            nearScore = scores[1];
          }
          if ((farScore <= nearScore) === truthIsFar) correct += 1;
          total += 1;
        }
      }
    }
    return {
      aperture: kind,
      label: APERTURE_LABELS[kind] || kind,
      scorer,
      symmetric: centrallySymmetric(kind),
      accuracy: correct / Math.max(1, total),
      total
    };
  }

  // The radial modulation transfer function of one PSF, which is what the depth cue actually
  // is: where an aperture's transfer function crosses zero, and how fast those crossings move
  // with blur diameter.
  function radialTransfer(kind, blurPixels, overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    const size = config.size;
    const psf = pointSpreadFunction(kind, blurPixels, size, 1);
    const kernel = forwardTransform(psf, size);
    const bins = Math.floor(size / 2);
    const sums = new Float64Array(bins);
    const counts = new Float64Array(bins);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const w = frequencyMagnitude(x, y, size);
        const bin = Math.floor(w);
        if (bin >= bins) continue;
        const index = y * size + x;
        sums[bin] += Math.sqrt(kernel.re[index] ** 2 + kernel.im[index] ** 2);
        counts[bin] += 1;
      }
    }
    const profile = new Float64Array(bins);
    for (let i = 0; i < bins; i += 1) profile[i] = counts[i] > 0 ? sums[i] / counts[i] : 0;
    return profile;
  }

  // A separate, calibrated two-photograph experiment. These settings do not alter the
  // Gaussian-scene trials above. The unknown is one fronto-parallel target distance and one
  // shared sharp image; a rendered still life is printed on that target, not a 3-D depth map.
  const FOCUS_PAIR_DEFAULTS = {
    size: 128, focalLength: 50, apertureDiameter: 4, pixelPitch: 0.006,
    focusDepths: [950, 1450], depthMin: 900, depthMax: 1800, depthStep: 10,
    noiseSigma: 0.006, aperture: "circular", seed: 20260909,
    reconstructionPriorScale: 0.004
  };

  function signedBlurDiameterPixels(depth, overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    return config.apertureDiameter * sensorDistance(config)
      * (1 / config.focusDepth - 1 / depth) / config.pixelPitch;
  }

  // Analytically shaded objects, soft contact shadows and an architectural backdrop provide
  // recognizable structure at several scales. No renderer state is needed by the estimator.
  function makeRenderedTarget(kind, size) {
    const n = size || FOCUS_PAIR_DEFAULTS.size;
    const image = new Float64Array(n * n);
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const leaves = [
      [.63,.24,.47,.14,.033], [.64,.30,.81,.19,.039], [.63,.40,.44,.31,.046],
      [.64,.47,.85,.39,.046], [.63,.54,.47,.49,.035], [.64,.59,.81,.54,.035]
    ];
    function sample(x, y) {
      const floor = y > .72;
      let value = floor ? .25 + .17 * (y - .72) : .17 + .20 * (1 - y) + .055 * x;
      // A recessed arch adds vertical edges and a smooth tonal ramp.
      if (y < .70 && x > .10 && x < .91 && (y > .26 || ((x-.505)/.405)**2 + ((y-.26)/.22)**2 < 1)) {
        value += .10 + .035 * Math.cos(x * Math.PI * 2);
        if (Math.abs(x-.17) < .008 || Math.abs(x-.845) < .008) value -= .055;
      }
      // All boundaries fade into a common frame so FFT periodic convolution has no visible seam.
      value -= .17 * Math.exp(-(((x-.39)/.25)**2 + ((y-.765)/.055)**2));
      value -= .11 * Math.exp(-(((x-.69)/.17)**2 + ((y-.755)/.035)**2));
      // Ground sphere: diffuse falloff, a broad highlight, and reflected floor light.
      const sx = (x-.315)/.18, sy = (y-.579)/.18;
      const sphereR2 = sx*sx + sy*sy;
      if (sphereR2 < 1) {
        const z = Math.sqrt(1-sphereR2);
        const light = Math.max(0, -.48*sx-.58*sy+.66*z);
        value = .15 + .55*light + .12*Math.max(0,sy) + .16*Math.pow(light,18);
        // Incised bands keep the object recognizable under defocus and challenge recovery.
        value -= .055 * Math.pow(.5 + .5*Math.cos((sy+.16*z)*35),12);
      }
      if (kind === "botanical") {
        if (y > .60 && y < .75 && Math.abs(x-.64) < .115-(y-.60)*.22) {
          const nx=(x-.64)/.115;
          value=.26+.37*Math.sqrt(Math.max(0,1-nx*nx))-.13*nx;
        }
        if (y > .595 && y < .62 && Math.abs(x-.64)<.123) value=.65-.25*(x-.53);
        if (y > .20 && y < .61 && Math.abs(x-(.635+.009*Math.sin(y*11)))<.005) value=.19;
        for (const [ax,ay,bx,by,width] of leaves) {
          const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);
          const t=((x-ax)*dx+(y-ay)*dy)/(len*len);
          const across=((x-ax)*-dy+(y-ay)*dx)/len;
          if(t>0&&t<1&&Math.abs(across)<width*4*t*(1-t)) {
            value=.22+.30*(1-Math.abs(across)/width)+.10*t;
            if(Math.abs(across)<.002) value+=.12;
          }
        }
      } else {
        // A ceramic bottle, shaded from its analytic surface of revolution.
        if (y>.24 && y<.755) {
          const body = .058 + .095*Math.exp(-(((y-.585)/.16)**4));
          const nx=(x-.68)/body;
          if(Math.abs(nx)<1) {
            const z=Math.sqrt(1-nx*nx);
            value=.22+.47*Math.max(0,-.42*nx+.81*z)+.16*Math.pow(Math.max(0,-.54*nx+.84*z),22);
            if(y<.266) value=.20+.32*z;
            if(y>.39 && y<.405) value-=.13;
            if(y>.67 && y<.684) value-=.11;
          }
        }
      }
      // A small engraved tile supplies thin lines, independent of the rounded objects.
      if(x>.12&&x<.29&&y>.80&&y<.865) {
        value=.63;
        if(Math.abs(y-.83)<.003 || (x>.15&&x<.24&&Math.abs(Math.sin(x*190))>.94)) value=.22;
      }
      const border=clamp(Math.min(x,y,1-x,1-y)/.065);
      return .24+(clamp(value)-.24)*(border*border*(3-2*border));
    }
    for(let y=0;y<n;y+=1) for(let x=0;x<n;x+=1) {
      let sum=0;
      for(let sy=0;sy<2;sy+=1) for(let sx=0;sx<2;sx+=1) sum+=sample((x+(sx+.5)/2)/n,(y+(sy+.5)/2)/n);
      image[y*n+x]=sum*.25;
    }
    return image;
  }

  function focusPairKernels(depth, config) {
    const scale=transmission(config.aperture,128);
    return config.focusDepths.map((focusDepth) => pointSpreadFunction(config.aperture,
      signedBlurDiameterPixels(depth,Object.assign({},config,{focusDepth})),config.size,scale));
  }

  function captureFocusPair(sharpImage, depth, overrides) {
    const config=Object.assign({},FOCUS_PAIR_DEFAULTS,overrides||{});
    if(sharpImage.length!==config.size*config.size) throw new Error("focus-pair image size mismatch");
    const kernels=focusPairKernels(depth,config);
    return kernels.map((kernel,index)=>addNoise(convolve(sharpImage,kernel,config.size),config.noiseSigma,config.seed+index*7919));
  }

  // Variable projection eliminates the unknown sharp image analytically at every frequency:
  //   min_X |Y0-H0 X|² + |Y1-H1 X|² = |Y0 H1-Y1 H0|² / (|H0|²+|H1|²).
  // The fit consumes ONLY two measurement arrays and calibrated optics. It never receives the
  // rendered target, scene name, true distance or a ground-truth-aligned PSF index.
  function fitFocusPair(observations, overrides) {
    const config=Object.assign({},FOCUS_PAIR_DEFAULTS,overrides||{});
    const n=config.size,cells=n*n;
    if(observations.length!==2||observations.some((v)=>v.length!==cells)) throw new Error("two equal-sized focus measurements required");
    if(config.focusDepths.length!==2||config.focusDepths[0]===config.focusDepths[1]) throw new Error("two distinct calibrated focus settings required");
    if(!(config.depthStep>0&&config.depthMax>config.depthMin)) throw new Error("invalid distance search interval");
    const spectra=observations.map((field)=>forwardTransform(field,n));
    const noiseTerm=Math.max(1e-14,cells*config.noiseSigma*config.noiseSigma);
    let nonDcPower=0;
    for(const spectrum of spectra) for(let i=1;i<cells;i+=1) nonDcPower+=spectrum.re[i]**2+spectrum.im[i]**2;
    const observedVariance=nonDcPower/(2*cells*cells);
    const noiseVariance=config.noiseSigma*config.noiseSigma;
    const textureExcess=observedVariance-noiseVariance*(cells-1)/cells;
    // Do not report a noise-selected minimum as a distance when the capture has no texture.
    const textureUnresolved=textureExcess<=Math.max(1e-14,6*noiseVariance/Math.sqrt(cells));
    const distances=[],scores=[];
    let best=0,bestTransforms=null;
    for(let depth=config.depthMin;depth<=config.depthMax+1e-9;depth+=config.depthStep) {
      const h=focusPairKernels(depth,config).map((kernel)=>forwardTransform(kernel,n));
      let score=0;
      for(let i=1;i<cells;i+=1) {
        const a=h[0],b=h[1],u=spectra[0],v=spectra[1];
        const denom=a.re[i]**2+a.im[i]**2+b.re[i]**2+b.im[i]**2;
        if(denom<1e-18) { score+=(u.re[i]**2+u.im[i]**2+v.re[i]**2+v.im[i]**2); continue; }
        const re=u.re[i]*b.re[i]-u.im[i]*b.im[i]-v.re[i]*a.re[i]+v.im[i]*a.im[i];
        const im=u.re[i]*b.im[i]+u.im[i]*b.re[i]-v.re[i]*a.im[i]-v.im[i]*a.re[i];
        score+=(re*re+im*im)/denom;
      }
      distances.push(depth); scores.push(score/(cells*noiseTerm));
      if(!bestTransforms||scores[scores.length-1]<scores[best]) {best=scores.length-1;bestTransforms=h;}
    }
    // Joint regularized deconvolution at the measured best distance. The weak generic 1/f
    // prior suppresses noise; DC is solved directly so display exposure is not normalized away.
    const prior=priorSpectrum(n,config),re=new Float64Array(cells),im=new Float64Array(cells);
    for(let i=0;i<cells;i+=1) {
      let power=0;
      for(let j=0;j<2;j+=1) {
        const h=bestTransforms[j],y=spectra[j];
        power+=h.re[i]**2+h.im[i]**2;
        re[i]+=h.re[i]*y.re[i]+h.im[i]*y.im[i];
        im[i]+=h.re[i]*y.im[i]-h.im[i]*y.re[i];
      }
      const denominator=power+(i===0?0:noiseTerm/Math.max(1e-12,prior[i]*config.reconstructionPriorScale));
      re[i]/=Math.max(1e-16,denominator); im[i]/=Math.max(1e-16,denominator);
    }
    fft2(re,im,n,true);
    const spread=Math.max(...scores)-Math.min(...scores);
    return {distance:distances[best],distances,scores,bestIndex:best,reconstruction:re,
      ambiguous:textureUnresolved||spread<1e-6,atBoundary:best===0||best===scores.length-1};
  }

  // ---------------------------------------------------------------------------------------

  function gaussian(rng) {
    const u = Math.max(1e-12, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    DEFAULTS,
    APERTURE_KEYS,
    APERTURE_LABELS,
    CODED_CELLS,
    CODED_PATTERN,
    apertureOpen,
    transmission,
    blurDiameterPixels,
    pointSpreadFunction,
    fft2,
    forwardTransform,
    priorSpectrum,
    depthForBlur,
    ladderDepths,
    makeScene,
    makePiecewiseScene,
    sceneByKind,
    convolve,
    addNoise,
    depthScores,
    buildPsfSet,
    depthTrial,
    apertureComparison,
    centrallySymmetric,
    signTrial,
    wienerDeconvolve,
    sparseGradientScore,
    radialTransfer,
    FOCUS_PAIR_DEFAULTS,
    signedBlurDiameterPixels,
    makeRenderedTarget,
    captureFocusPair,
    fitFocusPair,
    mulberry32
  };
});
