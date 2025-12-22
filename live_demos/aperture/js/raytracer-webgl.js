export class RayTracerWebGL {
    constructor(canvas, scene, camera) {
        console.log('RayTracerWebGL constructor starting...');
        this.canvas = canvas;
        this.scene = scene;
        this.camera = camera;
        
        this.updateLoadingStatus('Initializing WebGL context...');
        
        // Setup WebGL context
        try {
            // Try WebGL 2 first
            let gl = canvas.getContext('webgl2', {
                antialias: false,
                depth: false,
                stencil: false,
                alpha: false,
                preserveDrawingBuffer: false
            });
            
            if (!gl) {
                // Diagnostics
                console.error('WebGL 2 context creation failed');
                console.log('Canvas:', canvas);
                console.log('Trying fallback contexts...');
                
                // Try experimental
                gl = canvas.getContext('experimental-webgl2');
                if (gl) {
                    console.log('Got experimental-webgl2 context');
                } else {
                    // Check if WebGL 1 works
                    const gl1 = canvas.getContext('webgl');
                    if (gl1) {
                        console.error('WebGL 1 works but WebGL 2 is not available');
                        alert('WebGL 2 is not supported on your system.\n\nPossible fixes:\n1. Update your graphics drivers\n2. Enable hardware acceleration in Chrome (chrome://settings/system)\n3. Check chrome://gpu for issues');
                    } else {
                        console.error('No WebGL support at all');
                        alert('WebGL is disabled or not available.\n\nCheck:\n1. Hardware acceleration: chrome://settings/system\n2. GPU status: chrome://gpu\n3. Chrome flags: chrome://flags/#ignore-gpu-blocklist');
                    }
                    this.gl = null;
                    return;
                }
            }
            
            this.gl = gl;
            this.needsUpdate = true;
            this.frame = 0;
            
            // Visualization settings
            this.visualizeFocus = false;
            this.focusVisMode = 'additive'; // 'additive' or 'inverted'
            this.focusTolerance = 1.5; // Pixels of acceptable blur (traditional)
            this.scheimpflugTolerance = 2.0; // Pixels of acceptable blur (Scheimpflug)
            this.enableVPT = false; // Volumetric path tracing disabled by default
            this.minBounces = 1; // Minimum bounces to visualize
            this.bounceRange = 8; // Range of bounces (max = min + range)
            this.vptMaxBounces = 6;
            
            // Temporal averaging for animated scenes
            this.samplesPerPixel = 1;
            this.isAnimating = false;
            this.isAutofocusing = false; // Temporal blending during autofocus
            this.autofocusBlendFactor = 0.3; // How much new frame contributes (lower = smoother)
            this.frameHistory = [];
            this.maxFrameHistory = 16; // Limited by shader sampler count
            
            // Supersampling and anti-aliasing (OFF by default)
            this.supersample = 1; // 1=none (default, off), 2=2x2, 3=3x3, 4=4x4
            this.reconstructionKernel = 0; // 0=box (default for simplicity)
            
            // Check for float texture support
            const ext = gl.getExtension('EXT_color_buffer_float');
            if (!ext) {
                console.warn('EXT_color_buffer_float not supported, using RGBA16F');
                this.useFloat16 = true;
            } else {
                console.log('EXT_color_buffer_float supported');
                this.useFloat16 = false;
            }
            
            // Settings
            this.minBounces = 1;
            this.bounceRange = 8;
            this.samplesPerFrame = 1;
            
            console.log('Initializing WebGL shaders...');
            this.initWebGL();
            
            console.log('Resizing WebGL renderer...');
            this.resize();
            
            console.log('WebGL renderer initialized successfully');
            console.log('Canvas size:', this.canvas.width, 'x', this.canvas.height);
            console.log('GL viewport:', this.width, 'x', this.height);
        } catch (e) {
            console.error('Failed to initialize WebGL:', e);
            this.gl = null;
        }
    }
    
    updateLoadingStatus(message) {
        const statusEl = document.getElementById('loading-status');
        if (statusEl) {
            statusEl.textContent = message;
            console.log(message);
        }
    }
    
    showCompilationNotification(seconds) {
        // Create notification overlay
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 200, 0, 0.95);
            color: white;
            padding: 30px 50px;
            border-radius: 10px;
            font-size: 24px;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            text-align: center;
            cursor: pointer;
        `;
        notification.innerHTML = `
            Shader Compilation Complete<br>
            <span style="font-size: 18px; font-weight: normal;">Took ${seconds} seconds</span><br>
            <span style="font-size: 14px; opacity: 0.8;">Click to dismiss</span>
        `;
        
        // Remove on click
        notification.onclick = () => notification.remove();
        
        // Auto-remove after 10 seconds if not clicked
        setTimeout(() => {
            if (notification.parentNode) notification.remove();
        }, 10000);
        
        document.body.appendChild(notification);
    }
    
    initWebGL() {
        this.updateLoadingStatus('Setting up shaders...');
        const gl = this.gl;
        
        // Vertex shader for fullscreen quad
        const vsSource = `#version 300 es
        in vec2 a_position;
        out vec2 v_uv;
        
        void main() {
            v_uv = a_position * 0.5 + 0.5;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }`;
        
        /*
        ═══════════════════════════════════════════════════════════════════
                            FRAGMENT SHADER - PATH TRACER
        ═══════════════════════════════════════════════════════════════════
        Real-time physically-based path tracer with:
        - Volumetric rendering (VPT with Woodcock tracking)
        - Advanced optical effects (chromatic aberration, DOF, etc.)
        - Complex material library (35+ BSDFs)
        - Holographic capture simulation (CW-ToF, Off-Axis)
        ═══════════════════════════════════════════════════════════════════
        */
        const fsSource = `#version 300 es
        precision highp float;
        
        // ─────────────────────────────────────────────────────────────────
        // SHADER INPUTS/OUTPUTS
        // ─────────────────────────────────────────────────────────────────
        in vec2 v_uv;
        out vec4 fragColor;
        
        // ─────────────────────────────────────────────────────────────────
        // CORE UNIFORMS
        // ─────────────────────────────────────────────────────────────────
        uniform vec2 u_resolution;
        uniform float u_time;
        uniform float u_frame;
        uniform sampler2D u_accumTexture;
        
        // ─────────────────────────────────────────────────────────────────
        // CAMERA PARAMETERS
        // ─────────────────────────────────────────────────────────────────
        uniform vec3 u_cameraPos;
        uniform vec3 u_cameraLookAt;
        uniform float u_focalLength;
        uniform float u_focusDistance;
        uniform float u_apertureFStop;
        uniform int u_cameraType; // 0=pinhole, 1=thin-lens
        
        // ─────────────────────────────────────────────────────────────────
        // RENDERING SETTINGS
        // ─────────────────────────────────────────────────────────────────
        uniform int u_minBounces;          // Min path bounces to visualize
        uniform int u_bounceRange;         // Bounce range (max = min + range)
        uniform bool u_enableVPT;          // Volumetric path tracing
        uniform int u_vptMaxBounces;       // VPT maximum bounces
        uniform bool u_visualizeFocus;     // Focus plane visualization
        uniform int u_focusVisMode;        // 0=additive, 1=inverted
        uniform float u_focusTolerance;    // Traditional DoF tolerance
        uniform float u_scheimpflugTolerance; // Scheimpflug DoF tolerance
        
        // ─────────────────────────────────────────────────────────────────
        // APERTURE (Lens Opening)
        // ─────────────────────────────────────────────────────────────────
        uniform int u_apertureShape;       // 0=circular, 1=hex, 2=square, 3=star
        uniform int u_apertureBlades;      // Blade count for polygonal shapes
        uniform vec3 u_apertureShift;      // XYZ shift in meters
        uniform vec2 u_apertureTilt;       // XY tilt in radians
        
        // ─────────────────────────────────────────────────────────────────
        // LENS PROPERTIES
        // ─────────────────────────────────────────────────────────────────
        uniform int u_distortionType;      // 0=none, 1=barrel, 2=pincushion, 3=fisheye
        uniform float u_distortionAmount;  // Distortion strength
        
        // ─────────────────────────────────────────────────────────────────
        // SENSOR/FILM PROPERTIES
        // ─────────────────────────────────────────────────────────────────
        uniform float u_filmSize;          // Diagonal in mm
        uniform vec2 u_filmTilt;           // XY tilt in radians
        uniform vec2 u_filmShift;          // XY shift in meters
        uniform float u_filmCurvature;     // Curvature amount
        uniform vec2 u_sensorOffset;       // Viewport offset (normalized)
        
        // ─────────────────────────────────────────────────────────────────
        // TILT-SHIFT SYSTEMS
        // ─────────────────────────────────────────────────────────────────
        // Legacy: Virtual plane tilt-shift
        uniform bool u_enableTiltShift;
        
        // New: Ray Tracing Gems II - Scheimpflug via 3 focus points
        uniform bool u_enableNewTiltShift;
        uniform vec3 u_focusPointA;        // Triangle vertex 1 (world space)
        uniform vec3 u_focusPointB;        // Triangle vertex 2 (world space)
        uniform vec3 u_focusPointC;        // Triangle vertex 3 (world space)
        uniform bool u_showFocusPoints;    // Debug: Show RGB spheres
        uniform bool u_showFocusAxes;      // Debug: Show XYZ axes
        uniform bool u_showFocusTriangle;  // Debug: Show focal plane
        uniform int u_hoveredGizmo;        // Mouse hover state
        
        // Chromatic aberration (scene glass)
        uniform bool u_enableChromaticAberration;
        uniform int u_chromaticAberrationMode; // 0=RGB, 1=spectrum
        uniform float u_chromaticAberration; // 0.0 to 3.0, controls IOR variation strength
        uniform bool u_showRedChannel;
        uniform bool u_showGreenChannel;
        uniform bool u_showBlueChannel;
        uniform float u_spectralFilterMin;
        uniform float u_spectralFilterMax;
        
        // Lens chromatic aberration
        uniform bool u_enableLensCA;
        uniform int u_lensCAMode; // 0=postprocess, 1=spectral
        uniform float u_lensCAStrength;
        
        // Time-of-Flight (TOF) filtering
        uniform bool u_enableTOF;
        uniform float u_tofMinDistance;
        uniform float u_tofRange;
        
        // Continuous Wave ToF (holographic depth sensing)
        uniform bool u_enableCWToF;
        uniform float u_cwTofModulationFreq; // Modulation frequency in Hz
        uniform float u_cwTofPhaseOffset; // Phase offset for multi-phase capture (radians)
        uniform float u_cwTofWavelength; // Wavelength in nm for coherent light
        uniform bool u_cwTofShowInterference; // Show interference patterns
        uniform bool u_cwTofShowDepth; // Show depth map mode
        
        // Off-Axis Holography (single-shot spatial phase encoding)
        uniform bool u_enableOffAxisHolography;
        uniform float u_offAxisReferenceAngle; // Reference beam angle in radians
        uniform float u_offAxisWavelength; // Wavelength in nm
        uniform float u_offAxisCarrierFreq; // Spatial carrier frequency
        
        // Planar wave light source (coherent illumination)
        uniform bool u_enablePlanarWaveLight;
        uniform float u_planarWaveLightDistance;
        uniform float u_planarWaveLightSize;
        uniform float u_planarWaveLightIntensity;
        uniform float u_planarWaveCarrierFreq;
        uniform float u_planarWaveTiltAngle; // Tilt angle in radians
        uniform bool u_disableSceneLights;
        
        // Reference wave (for interference)
        uniform bool u_enableReferenceWave;
        uniform float u_referenceWaveIntensity;
        uniform float u_referenceWaveFrequency;
        uniform float u_referenceWavePhase; // Phase in radians
        uniform bool u_referenceWaveColorMode; // Preserve color vs grayscale interference
        
        // Ground truth depth reference
        uniform bool u_showDepthReference;
        
        // Participating media (environment fog)
        uniform bool u_enableEnvironmentFog;
        uniform float u_fogDensity;
        uniform vec3 u_fogAlbedo;
        uniform float u_fogAnisotropy;
        
        // Scene uniforms
        uniform int u_numSpheres;
        uniform vec4 u_spheres[32]; // xyz=pos, w=radius
        uniform vec4 u_sphereMats[32]; // xyz=albedo, w=type (0=diffuse,1=metal,2=glass,3=mirror,4=emissive,5=volumetric,6=glossy)
        uniform vec4 u_sphereEmission[32]; // xyz=emission
        uniform vec4 u_sphereVolume[32]; // x=density, y=roughness, z=anisotropy, w=anisotropyRotation
        uniform vec4 u_sphereTexture[32]; // x=texture type, y=clearcoat, z=clearcoatRoughness, w=clearcoatIOR
        uniform float u_groundPattern; // Ground pattern type
        uniform float u_groundPatternScale; // Ground pattern scale
        
        // Constants
        const float PI = 3.14159265359;
        const float EPSILON = 0.001;
        const int MAX_BOUNCES = 32; // Max possible bounces (actual limit set by uniforms)
        
        // Random number generator
        float g_seed = 0.0;
        
        void initRandom(vec2 uv, float frame, float time) {
            // Use both frame and time for better randomness
            // Time ensures different random seeds for animated scenes
            g_seed = fract(sin(dot(uv, vec2(12.9898, 78.233)) + frame + time * 0.1) * 43758.5453123);
        }
        
        float random() {
            g_seed = fract(sin(g_seed) * 43758.5453123);
            return g_seed;
        }
        
        // Reconstruction filter kernels (DISABLED - not used currently)
        // TODO: Re-enable when supersampling is working
        
        // 3D Perlin noise for volumetric density
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
        
        float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
            
            vec3 i  = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);
            
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);
            
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            
            i = mod289(i);
            vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
            
            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;
            
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);
            
            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            
            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);
            
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            
            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
            
            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);
            
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;
            
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }
        
        // Fractal Perlin noise - reduced octaves for faster compilation
        float turbulence(vec3 p, float scale) {
            float sum = 0.0;
            float freq = scale;
            float amp = 1.0;
            float maxAmp = 0.0;
            
            // 2 octaves (optimized for fast compilation)
            for (int i = 0; i < 2; i++) {
                sum += snoise(p * freq) * amp;
                maxAmp += amp;
                freq *= 2.1;
                amp *= 0.5;
            }
            
            // Normalize to [-1, 1], then remap with high contrast
            sum = sum / maxAmp;
            sum = sign(sum) * pow(abs(sum), 0.7);
            return sum * 0.5 + 0.5;
        }
        
        // Removed unused noise2D and turbulence2D functions for faster compilation
        
        // Ray structure
        struct Ray {
            vec3 origin;
            vec3 direction;
            float wavelength; // 0.0=red(700nm), 0.5=green(550nm), 1.0=violet(400nm)
        };
        
        // Convert wavelength (0-1) to RGB color
        // Based on real visible spectrum: 0.0=red(700nm), 0.5=green(550nm), 1.0=violet(400nm)
        vec3 wavelengthToRGB(float t) {
            // Map to approximate wavelength in nanometers (700nm to 400nm)
            // Using CIE color matching functions approximation
            vec3 color = vec3(0.0);
            
            if (t >= 0.0 && t < 0.15) {
                // Red to Orange (700-620nm)
                color = vec3(1.0, mix(0.0, 0.5, (t - 0.0) / 0.15), 0.0);
            } else if (t >= 0.15 && t < 0.3) {
                // Orange to Yellow (620-580nm)
                color = vec3(1.0, mix(0.5, 1.0, (t - 0.15) / 0.15), 0.0);
            } else if (t >= 0.3 && t < 0.5) {
                // Yellow to Green (580-550nm)
                color = vec3(mix(1.0, 0.0, (t - 0.3) / 0.2), 1.0, 0.0);
            } else if (t >= 0.5 && t < 0.65) {
                // Green to Cyan (550-490nm)
                color = vec3(0.0, 1.0, mix(0.0, 1.0, (t - 0.5) / 0.15));
            } else if (t >= 0.65 && t < 0.8) {
                // Cyan to Blue (490-450nm)
                color = vec3(0.0, mix(1.0, 0.0, (t - 0.65) / 0.15), 1.0);
            } else {
                // Blue to Violet (450-400nm)
                color = vec3(mix(0.0, 0.5, (t - 0.8) / 0.2), 0.0, 1.0);
            }
            
            // Intensity falloff at edges (eye sensitivity)
            float intensity = 1.0;
            if (t < 0.05) intensity = mix(0.3, 1.0, t / 0.05);
            if (t > 0.95) intensity = mix(1.0, 0.3, (t - 0.95) / 0.05);
            
            return color * intensity;
        }
        
        struct Hit {
            bool hit;
            float t;
            vec3 point;
            vec3 normal;
            int materialIndex;
        };
        
        // Procedural texture functions
        float hash(vec3 p) {
            p = fract(p * 0.3183099 + 0.1);
            p *= 17.0;
            return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        
        vec3 hash3(vec3 p) {
            return vec3(
                hash(p),
                hash(p + vec3(13.1, 71.7, 47.2)),
                hash(p + vec3(89.3, 23.5, 61.8))
            );
        }
        
        // Voronoi/cell noise - returns distance to cell edge (for cracks)
        float voronoiCracks(vec3 p, float scale) {
            vec3 pScaled = p * scale;
            vec3 pInt = floor(pScaled);
            vec3 pFract = fract(pScaled);
            
            float minDist1 = 1.0;
            float minDist2 = 1.0;
            
            // Check neighboring cells
            for (int z = -1; z <= 1; z++) {
                for (int y = -1; y <= 1; y++) {
                    for (int x = -1; x <= 1; x++) {
                        vec3 neighbor = vec3(float(x), float(y), float(z));
                        vec3 cellPoint = neighbor + hash3(pInt + neighbor);
                        vec3 diff = cellPoint - pFract;
                        float dist = length(diff);
                        
                        // Track two nearest distances
                        if (dist < minDist1) {
                            minDist2 = minDist1;
                            minDist1 = dist;
                        } else if (dist < minDist2) {
                            minDist2 = dist;
                        }
                    }
                }
            }
            
            // Return edge distance (cracks appear where cells meet)
            return minDist2 - minDist1;
        }
        
        float noise(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f); // Smoothstep
            
            return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        
        float fbm(vec3 p) {
            float value = 0.0;
            float amplitude = 0.5;
            float frequency = 1.0;
            for (int i = 0; i < 3; i++) {
                value += amplitude * noise(p * frequency);
                frequency *= 2.5; // More detail
                amplitude *= 0.45;
            }
            return value;
        }
        
        // Removed unused turbulence(vec3) overload - not called anywhere
        
        vec3 checkerboard(vec3 p, float scale) {
            vec3 q = floor(p * scale);
            float pattern = mod(q.x + q.y + q.z, 2.0);
            return vec3(pattern);
        }
        
        // 3D hash function for Worley noise
        vec3 hash33(vec3 p) {
            p = fract(p * vec3(0.1031, 0.1030, 0.0973));
            p += dot(p, p.yxz + 33.33);
            return fract((p.xxy + p.yxx) * p.zyx);
        }
        
        
        vec3 applyTexture(vec3 baseColor, vec3 hitPoint, float textureType, float scale) {
            if (textureType == 0.0) {
                // No texture, use base color
                return baseColor;
            } else if (textureType == 1.0) {
                // Checkerboard
                vec3 checker = checkerboard(hitPoint, 3.0 * scale);
                return mix(baseColor * 0.3, baseColor, checker.x);
            } else if (textureType == 2.0) {
                // Thin black cracks on gold (Voronoi cell edges)
                float cracks = voronoiCracks(hitPoint, 3.0);
                
                // Very sharp threshold to make thin, crisp cracks
                float crackPattern = smoothstep(0.0, 0.03, cracks); // Only 0-0.03 range is black
                
                // Bright shiny gold (95%+ gold, <5% black cracks)
                return mix(vec3(0.0), baseColor, crackPattern);
            } else if (textureType == 3.0) {
                // Fine grid (1-pixel lines)
                vec3 p = hitPoint * scale;
                vec2 grid = fract(p.xz);
                float line = step(0.95, max(grid.x, grid.y));
                return mix(baseColor, vec3(0.0), line);
            } else if (textureType == 4.0) {
                // Thick grid
                vec3 p = hitPoint * scale;
                vec2 grid = fract(p.xz);
                float line = step(0.9, max(grid.x, grid.y));
                return mix(baseColor, vec3(0.0), line);
            } else if (textureType == 5.0) {
                // Concentric circles (for depth perception)
                vec3 p = hitPoint * scale;
                float dist = length(p.xz);
                float circles = fract(dist);
                float line = step(0.9, circles);
                return mix(baseColor, vec3(0.0), line);
            } else if (textureType == 6.0) {
                // Animated mokuti pattern (Damascus steel) - HIGH CONTRAST
                vec3 p = hitPoint * 3.0;
                
                // Add time-based animation
                float t = u_time * 0.1; // Slow animation
                p.x += sin(t) * 0.5;
                p.y += cos(t * 0.7) * 0.3;
                
                // Flowing wood-grain pattern
                float layer1 = turbulence(vec3(p.x * 0.25, p.y * 0.5, p.z * 0.25), 1.5);
                float layer2 = snoise(p * 1.5) * 0.4;
                
                // Create flowing bands that shift over time with HIGHER CONTRAST
                float bands = fract((layer1 + layer2 + t * 0.05) * 3.0);
                float pattern = smoothstep(0.25, 0.35, bands) * (1.0 - smoothstep(0.65, 0.75, bands));
                
                // HIGHER CONTRAST color palette - darker darks, brighter brights
                vec3 darkColor = vec3(0.02, 0.04, 0.08);   // Very dark blue-black
                vec3 brightColor1 = vec3(0.35, 0.25, 0.55); // Brighter purple
                vec3 brightColor2 = vec3(0.25, 0.45, 0.65); // Brighter steel blue
                vec3 accentColor = vec3(0.55, 0.15, 0.25);   // Brighter red accent
                
                // Animate color selection
                float colorPhase = fract(layer1 * 2.0 + t * 0.02);
                vec3 brightColor = mix(brightColor1, brightColor2, sin(colorPhase * 6.28) * 0.5 + 0.5);
                brightColor = mix(brightColor, accentColor, smoothstep(0.7, 0.8, colorPhase));
                
                // Increase overall contrast
                return mix(darkColor, brightColor, pow(pattern, 0.7));
            }
            return baseColor;
        }
        
        // Sphere intersection
        bool intersectSphere(Ray ray, vec3 center, float radius, out float t) {
            vec3 oc = ray.origin - center;
            float a = dot(ray.direction, ray.direction);
            float b = 2.0 * dot(oc, ray.direction);
            float c = dot(oc, oc) - radius * radius;
            float discriminant = b * b - 4.0 * a * c;
            
            if (discriminant < 0.0) return false;
            
            float t1 = (-b - sqrt(discriminant)) / (2.0 * a);
            float t2 = (-b + sqrt(discriminant)) / (2.0 * a);
            
            // Take the closest positive hit
            if (t1 > 0.001) {
                t = t1;
                return true;
            }
            if (t2 > 0.001) {
                t = t2;
                return true;
            }
            
            return false;
        }
        
        // Fast SDF-based line segment test (much cheaper than cylinder intersection)
        bool intersectAxisLine(Ray ray, vec3 lineStart, vec3 lineDir, float lineLength, float radius, out float t, out vec3 normal) {
            // Find closest points between ray and line segment
            vec3 w0 = ray.origin - lineStart;
            float a = dot(ray.direction, ray.direction);
            float b = dot(ray.direction, lineDir);
            float c = dot(lineDir, lineDir);
            float d = dot(ray.direction, w0);
            float e = dot(lineDir, w0);
            
            float denom = a * c - b * b;
            if (abs(denom) < 0.0001) return false;
            
            float sc = (b * e - c * d) / denom;
            float tc = (a * e - b * d) / denom;
            
            // Clamp to line segment
            tc = clamp(tc, 0.0, lineLength);
            
            if (sc < 0.001) return false;
            
            vec3 pointOnRay = ray.origin + sc * ray.direction;
            vec3 pointOnLine = lineStart + tc * lineDir;
            float dist = length(pointOnRay - pointOnLine);
            
            if (dist < radius) {
                t = sc;
                normal = normalize(pointOnRay - pointOnLine);
                return true;
            }
            return false;
        }
        
        
        // Helper: Test sphere and update closest hit
        void testSphere(Ray ray, vec3 center, float radius, int matIndex, inout Hit closest) {
            float t;
            if (intersectSphere(ray, center, radius, t) && t < closest.t) {
                closest.hit = true;
                closest.t = t;
                closest.point = ray.origin + ray.direction * t;
                closest.normal = normalize(closest.point - center);
                closest.materialIndex = matIndex;
            }
        }
        
        // Helper: Test axis line and update closest hit
        void testCylinder(Ray ray, vec3 base, vec3 axis, float radius, float lineLength, int matIndex, inout Hit closest) {
            float t;
            vec3 normal;
            if (intersectAxisLine(ray, base, axis, lineLength, radius, t, normal) && t < closest.t) {
                closest.hit = true;
                closest.t = t;
                closest.point = ray.origin + ray.direction * t;
                closest.normal = normal;
                closest.materialIndex = matIndex;
            }
        }
        
        // Helper: Calculate focal plane coordinate system
        void getFocalPlaneAxes(out vec3 origin, out vec3 xAxis, out vec3 yAxis, out vec3 zAxis) {
            origin = (u_focusPointA + u_focusPointB + u_focusPointC) / 3.0;
            zAxis = normalize(cross(u_focusPointB - u_focusPointA, u_focusPointC - u_focusPointA));
            xAxis = normalize(u_focusPointB - u_focusPointA);
            yAxis = normalize(cross(zAxis, xAxis));
        }
        
        // Helper: Set gizmo sphere material (glossy with hover effect)
        void setGizmoSphereMaterial(int hoverIndex, vec3 baseColor, out float matType, out vec3 albedo, out vec3 emission) {
            matType = 6.0; // Glossy
            if (u_hoveredGizmo == hoverIndex) {
                albedo = vec3(1.0);
                emission = vec3(5.0);
            } else {
                albedo = baseColor;
                emission = vec3(0.0);
            }
        }
        
        // Helper: Set gizmo axis material (emissive with stripe)
        void setGizmoAxisMaterial(vec3 hitPoint, vec3 axisOrigin, vec3 axisDir, vec3 baseColor, out float matType, out vec3 albedo, out vec3 emission) {
            float distAlongAxis = dot(hitPoint - axisOrigin, axisDir);
            float stripe = step(0.5, fract(distAlongAxis * 5.0));
            matType = 4.0; // Emissive
            albedo = baseColor * 0.1 + baseColor * 0.9 * vec3(0.1);
            emission = baseColor * (1.5 + stripe * 0.5);
        }
        
        // Helper: Set gizmo circle material (emissive with hover)
        void setGizmoCircleMaterial(int hoverIndex, vec3 baseColor, out float matType, out vec3 albedo, out vec3 emission) {
            matType = 4.0; // Emissive
            if (u_hoveredGizmo == hoverIndex) {
                albedo = vec3(1.0);
                emission = vec3(5.0);
            } else {
                albedo = baseColor;
                emission = baseColor * 0.8 + vec3(0.1);
            }
        }
        
        // Helper: Build tangent space basis from normal
        void buildTangentBasis(vec3 normal, out vec3 tangent, out vec3 bitangent) {
            vec3 up = abs(normal.z) < 0.999 ? vec3(0, 0, 1) : vec3(1, 0, 0);
            tangent = normalize(cross(up, normal));
            bitangent = cross(normal, tangent);
        }
        
        // Helper: Calculate camera basis vectors (right, up, forward)
        void getCameraBasis(out vec3 forward, out vec3 right, out vec3 up) {
            forward = normalize(u_cameraLookAt - u_cameraPos);
            right = normalize(cross(forward, vec3(0, 1, 0)));
            up = cross(right, forward);
        }
        
        // Scene intersection
        Hit intersectScene(Ray ray) {
            Hit closest;
            closest.hit = false;
            closest.t = 1e10;
            
            for (int i = 0; i < u_numSpheres && i < 32; i++) {
                vec3 center = u_spheres[i].xyz;
                float radius = u_spheres[i].w;
                float matType = u_sphereMats[i].w;
                
                // Skip surface intersection for volumetric materials
                // They'll be handled specially in the trace function
                if (matType == 5.0) {
                    continue;
                }
                
                float t;
                if (intersectSphere(ray, center, radius, t)) {
                    if (t < closest.t) {
                        closest.hit = true;
                        closest.t = t;
                        closest.point = ray.origin + ray.direction * t;
                        closest.normal = normalize(closest.point - center);
                        closest.materialIndex = i;
                    }
                }
            }
            
            // Debug visualization: Focus points as glossy spheres
            if (u_showFocusPoints) {
                float debugRadius = 0.06;
                testSphere(ray, u_focusPointA, debugRadius, -100, closest); // Blue
                testSphere(ray, u_focusPointB, debugRadius, -101, closest); // Green
                testSphere(ray, u_focusPointC, debugRadius, -102, closest); // Red
            }
            
            // Debug visualization: Axes only (no center sphere)
            if (u_showFocusAxes) {
                vec3 origin, xAxis, yAxis, zAxis;
                getFocalPlaneAxes(origin, xAxis, yAxis, zAxis);
                
                float axisLength = 0.5; // Shorter axes
                float axisRadius = 0.008;
                float tipRadius = 0.03;
                
                // X axis (red)
                testCylinder(ray, origin, xAxis, axisRadius, axisLength, -104, closest);
                
                // Y axis (green)
                testCylinder(ray, origin, yAxis, axisRadius, axisLength, -105, closest);
                
                // Z axis (blue)
                testCylinder(ray, origin, zAxis, axisRadius, axisLength, -106, closest);
            }
            
            
            // Debug visualization: Focal plane triangle
            if (u_showFocusTriangle) {
                // Focus points are already in world space
                vec3 focusA_world = u_focusPointA;
                vec3 focusB_world = u_focusPointB;
                vec3 focusC_world = u_focusPointC;
                
                // Calculate triangle normal
                vec3 triNormal = normalize(cross(focusB_world - focusA_world, focusC_world - focusA_world));
                
                // Ray-plane intersection
                float denom = dot(ray.direction, triNormal);
                
                // DOUBLE-SIDED: Accept hits from both sides using abs()
                // Reject only if ray is nearly parallel to plane (abs < threshold)
                if (abs(denom) > 0.0001) { // Extremely small threshold to avoid edge artifacts
                    float t = dot(focusA_world - ray.origin, triNormal) / denom;
                    if (t > 0.1 && t < closest.t) { // No max distance limit
                        vec3 hitPoint = ray.origin + ray.direction * t;
                        
                        // Check if point is inside ACTUAL triangle (no scaling)
                        // Use barycentric coordinates
                        vec3 v0 = focusC_world - focusA_world;
                        vec3 v1 = focusB_world - focusA_world;
                        vec3 v2 = hitPoint - focusA_world;
                        
                        float dot00 = dot(v0, v0);
                        float dot01 = dot(v0, v1);
                        float dot02 = dot(v0, v2);
                        float dot11 = dot(v1, v1);
                        float dot12 = dot(v1, v2);
                        
                        float denom = dot00 * dot11 - dot01 * dot01;
                        
                        // Guard against degenerate triangle (numerical safety)
                        if (abs(denom) > 0.0001) {
                            float invDenom = 1.0 / denom;
                            float u = (dot11 * dot02 - dot01 * dot12) * invDenom;
                            float v = (dot00 * dot12 - dot01 * dot02) * invDenom;
                            
                            // Only show triangle if within bounds
                            if (u >= 0.0 && v >= 0.0 && (u + v) <= 1.0) {
                                closest.hit = true;
                                closest.t = t;
                                closest.point = hitPoint;
                                // DOUBLE-SIDED: Flip normal to face camera
                                closest.normal = dot(ray.direction, triNormal) > 0.0 ? -triNormal : triNormal;
                                closest.materialIndex = -103; // Special: focal plane triangle
                            }
                        }
                    }
                }
            }
            
            // Ground plane at y = -1
            float tPlane = -(ray.origin.y + 1.0) / ray.direction.y;
            if (tPlane > EPSILON && tPlane < closest.t) {
                closest.hit = true;
                closest.t = tPlane;
                closest.point = ray.origin + ray.direction * tPlane;
                closest.normal = vec3(0, 1, 0);
                closest.materialIndex = -1; // Ground
            }
            
            return closest;
        }
        
        // Random unit vector on hemisphere
        vec3 randomHemisphere(vec3 normal) {
            float z = random() * 2.0 - 1.0;
            float a = random() * 2.0 * PI;
            float r = sqrt(1.0 - z * z);
            vec3 dir = vec3(r * cos(a), r * sin(a), z);
            return dot(dir, normal) > 0.0 ? dir : -dir;
        }
        
        vec3 randomUnitVector() {
            float z = random() * 2.0 - 1.0;
            float a = random() * 2.0 * PI;
            float r = sqrt(1.0 - z * z);
            return vec3(r * cos(a), r * sin(a), z);
        }
        
        // GGX microfacet sampling for glossy materials
        vec3 sampleGGX(vec3 normal, float roughness) {
            float alpha = roughness * roughness;
            float r1 = random();
            float r2 = random();
            
            // Sample halfway vector in tangent space
            float theta = atan(alpha * sqrt(r1) / sqrt(1.0 - r1));
            float phi = 2.0 * PI * r2;
            
            float cosTheta = cos(theta);
            float sinTheta = sin(theta);
            vec3 H = vec3(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
            
            // Build tangent space and transform to world space
            vec3 tangent, bitangent;
            buildTangentBasis(normal, tangent, bitangent);
            return normalize(tangent * H.x + bitangent * H.y + normal * H.z);
        }
        
        // Thin-film interference (for iridescence)
        vec3 thinFilmInterference(float thickness, float ior, float cosTheta) {
            // Wavelengths for RGB (in nanometers)
            float lambdaR = 650.0;
            float lambdaG = 550.0;
            float lambdaB = 450.0;
            
            // Optical path difference
            float opticalPath = 2.0 * ior * thickness * cosTheta;
            
            // Phase shift for each wavelength
            float phaseR = 2.0 * PI * opticalPath / lambdaR;
            float phaseG = 2.0 * PI * opticalPath / lambdaG;
            float phaseB = 2.0 * PI * opticalPath / lambdaB;
            
            // Interference intensity (constructive/destructive)
            float intensityR = 0.5 + 0.5 * cos(phaseR);
            float intensityG = 0.5 + 0.5 * cos(phaseG);
            float intensityB = 0.5 + 0.5 * cos(phaseB);
            
            return vec3(intensityR, intensityG, intensityB);
        }
        
        // Anisotropic GGX sampling (for brushed metal, etc.)
        vec3 sampleGGXAnisotropic(vec3 normal, float roughness, float anisotropy, float rotation) {
            float r1 = random();
            float r2 = random();
            
            // Build tangent space basis
            vec3 tangent, bitangent;
            buildTangentBasis(normal, tangent, bitangent);
            
            // Apply rotation (convert degrees to radians)
            float angle = rotation * PI / 180.0;
            float cosAngle = cos(angle);
            float sinAngle = sin(angle);
            vec3 tangentRotated = tangent * cosAngle + bitangent * sinAngle;
            vec3 bitangentRotated = -tangent * sinAngle + bitangent * cosAngle;
            
            // Anisotropic roughness
            // anisotropy = 0: isotropic (circular)
            // anisotropy = 1: fully anisotropic (linear brushes)
            float aspect = sqrt(1.0 - anisotropy * 0.9); // Limit to prevent singularity
            float alphaX = roughness * roughness / aspect;
            float alphaY = roughness * roughness * aspect;
            
            // Sample anisotropic GGX
            float phi = 2.0 * PI * r2;
            float cosPhi = cos(phi);
            float sinPhi = sin(phi);
            
            // Anisotropic theta
            float tanTheta2 = r1 / (1.0 - r1);
            float denom = (cosPhi * cosPhi) / (alphaX * alphaX) + (sinPhi * sinPhi) / (alphaY * alphaY);
            float theta = atan(sqrt(tanTheta2 / denom));
            
            float cosTheta = cos(theta);
            float sinTheta = sin(theta);
            
            // Halfway vector in anisotropic tangent space
            vec3 H = vec3(sinTheta * cosPhi, sinTheta * sinPhi, cosTheta);
            
            // Transform to world space with rotated frame
            return normalize(tangentRotated * H.x + bitangentRotated * H.y + normal * H.z);
        }
        
        // Sky color
        vec3 getSky(vec3 dir) {
            float t = 0.5 * (dir.y + 1.0);
            return mix(vec3(1.0), vec3(0.5, 0.7, 1.0), t);
        }
        
        // Direct lighting (NEE - Next Event Estimation)
        vec3 sampleDirectLight(vec3 pos, vec3 normal) {
            vec3 directLight = vec3(0.0);
            
            // Sample all emissive spheres (unless scene lights are disabled)
            if (!u_disableSceneLights) {
                for (int i = 0; i < u_numSpheres && i < 16; i++) {
                float matType = u_sphereMats[i].w;
                if (matType == 4.0) { // Emissive
                    vec3 lightCenter = u_spheres[i].xyz;
                    vec3 emission = u_sphereEmission[i].xyz;
                    float lightRadius = u_spheres[i].w;
                    
                    // Sample point on light
                    vec3 toLight = lightCenter - pos;
                    float dist = length(toLight);
                    vec3 lightDir = toLight / dist;
                    
                    // Check if light is above horizon
                    float NdotL = dot(normal, lightDir);
                    if (NdotL <= 0.0) continue;
                    
                    // Shadow ray
                    Ray shadowRay;
                    shadowRay.origin = pos + normal * EPSILON * 2.0;
                    shadowRay.direction = lightDir;
                    
                    // Check occlusion (surfaces + volumetric attenuation)
                    bool occluded = false;
                    float transmittance = 1.0;
                    
                    for (int j = 0; j < u_numSpheres && j < 16; j++) {
                        if (j == i) continue; // Skip the light itself
                        float checkMatType = u_sphereMats[j].w;
                        
                        vec3 center = u_spheres[j].xyz;
                        float radius = u_spheres[j].w;
                        float t;
                        
                        if (intersectSphere(shadowRay, center, radius, t)) {
                            if (t > EPSILON && t < dist - lightRadius) {
                                if (checkMatType == 5.0) {
                                    // Volumetric sphere - attenuate but don't block
                                    float sphereDensity = u_sphereVolume[j].x;
                                    // Approximate path length through sphere
                                    float pathInSphere = 2.0 * sqrt(radius * radius - pow(t, 2.0));
                                    transmittance *= exp(-sphereDensity * pathInSphere);
                                } else {
                                    // Solid occluder - fully blocked
                                    occluded = true;
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Also check environment fog attenuation
                    if (u_enableEnvironmentFog && u_fogDensity > 0.0001) {
                        transmittance *= exp(-u_fogDensity * dist);
                    }
                    
                    if (!occluded && transmittance > 0.001) {
                        // Solid angle approximation with volumetric transmittance
                        float solidAngle = (lightRadius * lightRadius) / (dist * dist);
                        directLight += emission * NdotL * solidAngle * transmittance;
                    }
                }
                }
            }
            
            // Planar wave light source (for coherent illumination)
            if (u_enablePlanarWaveLight) {
                // Calculate camera basis
                vec3 cameraForward, cameraRight, cameraUp;
                getCameraBasis(cameraForward, cameraRight, cameraUp);
                
                // Apply tilt to light direction (rotate around camera up axis)
                float tiltAngle = u_planarWaveTiltAngle;
                vec3 lightForward = cameraForward * cos(tiltAngle) + cameraRight * sin(tiltAngle);
                
                // Light is positioned behind camera, offset by tilt
                vec3 lightCenter = u_cameraPos - lightForward * u_planarWaveLightDistance;
                
                // Sample random point on square light
                float halfSize = u_planarWaveLightSize * 0.5;
                vec2 lightUV = vec2(random() - 0.5, random() - 0.5);
                vec3 lightPos = lightCenter + cameraRight * (lightUV.x * u_planarWaveLightSize) 
                                            + cameraUp * (lightUV.y * u_planarWaveLightSize);
                
                // Direction from light to surface
                vec3 toLightSample = lightPos - pos;
                float dist = length(toLightSample);
                vec3 lightDir = toLightSample / dist;
                
                // Light shoots forward in tilted direction (check if surface is in front of light)
                vec3 lightToSurfaceDir = normalize(pos - lightPos);
                float shootsForward = dot(lightToSurfaceDir, lightForward);
                
                if (shootsForward > 0.0) {
                    // Check if surface faces light
                    float NdotL = dot(normal, lightDir);
                    if (NdotL > 0.0) {
                        // Shadow ray
                        Ray shadowRay;
                        shadowRay.origin = pos + normal * EPSILON * 2.0;
                        shadowRay.direction = lightDir;
                        
                        // Check occlusion
                        bool occluded = false;
                        Hit shadowHit = intersectScene(shadowRay);
                        if (shadowHit.hit && shadowHit.t < dist - EPSILON) {
                            occluded = true;
                        }
                        
                        if (!occluded) {
                            // Calculate extra path length from sampling position on light
                            // This creates the planar wave wavefront tilt
                            float extraPathLength = 0.0;
                            if (u_planarWaveCarrierFreq > 0.01) {
                                // Carrier frequency creates a spatial phase ramp
                                // Convert position on light (lightUV.x) to extra path length
                                // This simulates a tilted wavefront
                                float wavelength = 850e-9; // meters (near-IR, typical for ToF)
                                extraPathLength = lightUV.x * u_planarWaveLightSize * u_planarWaveCarrierFreq * wavelength;
                            }
                            
                            // Area light contribution
                            // For large planar wave light, use simplified area light formula
                            float lightArea = u_planarWaveLightSize * u_planarWaveLightSize;
                            float solidAngle = lightArea / (dist * dist + lightArea);
                            
                            // Intensity is scaled by user-specified value
                            // Carrier frequency affects PHASE, not intensity (used in interference)
                            directLight += vec3(u_planarWaveLightIntensity) * NdotL * solidAngle * 10.0;
                        }
                    }
                }
            }
            
            return directLight;
        }
        
        // Henyey-Greenstein phase function for anisotropic scattering
        float henyeyGreenstein(float cosTheta, float g) {
            float g2 = g * g;
            float denom = 1.0 + g2 - 2.0 * g * cosTheta;
            return (1.0 - g2) / (4.0 * PI * pow(denom, 1.5));
        }
        
        // Sample Henyey-Greenstein phase function
        vec3 sampleHenyeyGreenstein(vec3 wi, float g) {
            if (abs(g) < 0.001) {
                // Isotropic
                return randomUnitVector();
            }
            
            float xi1 = random();
            float xi2 = random();
            
            // Sample cosTheta
            float sqrTerm = (1.0 - g * g) / (1.0 - g + 2.0 * g * xi1);
            float cosTheta = (1.0 + g * g - sqrTerm * sqrTerm) / (2.0 * g);
            cosTheta = clamp(cosTheta, -1.0, 1.0);
            float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
            float phi = 2.0 * PI * xi2;
            
            // Build local coordinate system
            vec3 w = -wi; // Incident direction
            vec3 u, v;
            buildTangentBasis(w, u, v);
            
            // Scatter direction in local coordinates
            vec3 localDir = vec3(
                sinTheta * cos(phi),
                sinTheta * sin(phi),
                cosTheta
            );
            
            return normalize(u * localDir.x + v * localDir.y + w * localDir.z);
        }
        
        // Unified volumetric system: handles both environment fog and volumetric spheres
        // Returns: 0=no interaction, 1=scatter, 2=absorb
        // Sets scatterPos if interaction occurs
        int sampleVolumetricInteraction(Ray ray, float tMax, out vec3 scatterPos, out vec3 scatterAlbedo, out float travelDist) {
            float tMin = 0.0;
            float sigma_t_max = 0.0; // Majorant (max density along ray)
            vec3 albedo = vec3(0.8);
            
            // Check environment fog
            if (u_enableEnvironmentFog && u_fogDensity > 0.0001) {
                sigma_t_max = u_fogDensity;
                albedo = u_fogAlbedo;
            }
            
            // Check volumetric spheres - find closest intersection
            int volumeIdx = -1;
            float volumeTEntry = 1e10;
            float volumeTExit = 1e10;
            
            for (int i = 0; i < u_numSpheres && i < 32; i++) {
                float matType = u_sphereMats[i].w;
                if (matType != 5.0) continue; // Skip non-volumetric
                
                vec3 center = u_spheres[i].xyz;
                float radius = u_spheres[i].w;
                
                vec3 oc = ray.origin - center;
                float b = dot(oc, ray.direction);
                float c = dot(oc, oc) - radius * radius;
                float discriminant = b * b - c;
                
                if (discriminant >= 0.0) {
                    float sqrtDisc = sqrt(discriminant);
                    float t1 = -b - sqrtDisc;
                    float t2 = -b + sqrtDisc;
                    
                    // Check if we're inside or will enter this volume
                    float tEntry = (c < 0.0) ? EPSILON : max(EPSILON, t1);
                    float tExit = t2;
                    
                    if (tEntry < tExit && tEntry < volumeTEntry && tEntry < tMax) {
                        volumeIdx = i;
                        volumeTEntry = tEntry;
                        volumeTExit = min(tExit, tMax);
                        
                        // Volumetric sphere has higher density - use it as majorant
                        float sphereDensity = u_sphereVolume[i].x;
                        if (sphereDensity > sigma_t_max) {
                            sigma_t_max = sphereDensity;
                            albedo = u_sphereMats[i].xyz;
                        }
                    }
                }
            }
            
            // No participating media at all
            if (sigma_t_max < 0.0001) {
                return 0;
            }
            
            // Woodcock tracking (delta tracking) - simplified for faster compilation
            float t = tMin;
            int maxIterations = 8; // Optimized for faster compilation
            int iterations = 0;
            
            while (t < tMax && iterations < maxIterations) {
                iterations++;
                
                // Sample free-flight distance using majorant
                float xi = random();
                if (xi < 0.0001) xi = 0.0001;
                t += -log(1.0 - xi) / sigma_t_max;
                
                if (t >= tMax) {
                    travelDist = tMax;
                    return 0;
                }
                
                vec3 pos = ray.origin + ray.direction * t;
                
                // Evaluate actual density at this position (simplified)
                float sigma_t_here = 0.0;
                vec3 albedo_here = vec3(0.8);
                
                // Check environment fog only (skip per-sphere check for speed)
                if (u_enableEnvironmentFog && u_fogDensity > 0.0001) {
                    sigma_t_here = u_fogDensity;
                    albedo_here = u_fogAlbedo;
                }
                
                // Woodcock acceptance-rejection
                float acceptProb = sigma_t_here / sigma_t_max;
                if (random() < acceptProb) {
                    scatterPos = pos;
                    scatterAlbedo = albedo_here;
                    travelDist = t;
                    return 1; // Scatter
                }
            }
            
            travelDist = tMax;
            return 0; // No interaction
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // EXTRACTED MATERIAL EVALUATION FUNCTIONS (for faster compilation)
        // ═══════════════════════════════════════════════════════════════════
        
        // Glass material with Fresnel refraction
        bool evaluateGlass(inout Ray ray, Hit hit, inout vec3 color, vec3 albedo, float ior, float absorption) {
            bool entering = dot(ray.direction, hit.normal) < 0.0;
            vec3 outwardNormal = entering ? hit.normal : -hit.normal;
            float etaRatio = entering ? (1.0 / ior) : ior;
            
            vec3 refracted = refract(normalize(ray.direction), outwardNormal, etaRatio);
            
            if (length(refracted) > 0.01) {
                vec3 V = -normalize(ray.direction);
                float cosTheta = abs(dot(V, outwardNormal));
                float r0 = pow((1.0 - ior) / (1.0 + ior), 2.0);
                float fresnel = r0 + (1.0 - r0) * pow(1.0 - cosTheta, 5.0);
                
                if (random() < fresnel) {
                    ray.direction = reflect(ray.direction, outwardNormal);
                    ray.origin = hit.point + outwardNormal * EPSILON;
                } else {
                    ray.direction = refracted;
                    ray.origin = hit.point - outwardNormal * EPSILON;
                    
                    if (absorption > 0.001 && !entering) {
                        vec3 attenuation = exp(-albedo * absorption * hit.t);
                        color *= attenuation;
                    }
                }
                return true;
            } else {
                ray.direction = reflect(ray.direction, hit.normal);
                ray.origin = hit.point + hit.normal * EPSILON;
                return true;
            }
        }
        
        // Mirror material (perfect reflection)
        bool evaluateMirror(inout Ray ray, Hit hit, inout vec3 color, vec3 albedo) {
            ray.direction = reflect(ray.direction, hit.normal);
            ray.origin = hit.point + hit.normal * EPSILON;
            color *= albedo;
            return true;
        }
        
        // Diffuse material with direct lighting
        void evaluateDiffuse(inout Ray ray, Hit hit, inout vec3 color, inout vec3 light, vec3 albedo) {
            vec3 directLight = sampleDirectLight(hit.point, hit.normal);
            light += color * albedo * directLight / PI;
            
            vec3 scattered = normalize(hit.normal + randomUnitVector());
            ray.origin = hit.point + hit.normal * EPSILON;
            ray.direction = scattered;
            color *= albedo;
        }
        
        // Path tracing with integrated VPT
        vec3 trace(Ray ray) {
            vec3 color = vec3(1.0);
            vec3 light = vec3(0.0);
            vec3 focusOverlay = vec3(0.0); // Dual-channel focus visualization
            bool firstHit = true;
            int minBounces = u_enableVPT ? 1 : u_minBounces;
            int maxBounces = u_enableVPT ? u_vptMaxBounces : (u_minBounces + u_bounceRange);
            float pathLength = 0.0; // TOF: track total path length
            vec3 firstHitPos = vec3(0.0); // Track first hit position for carrier wave
            int actualBounces = 0; // Track actual bounces taken
            
            // Pre-calculate axis vectors ONCE per ray (not per bounce!)
            vec3 debugAxisOrigin = (u_focusPointA + u_focusPointB + u_focusPointC) / 3.0;
            vec3 debugPlaneNormal = normalize(cross(u_focusPointB - u_focusPointA, u_focusPointC - u_focusPointA));
            vec3 debugXAxis = normalize(u_focusPointB - u_focusPointA);
            vec3 debugYAxis = normalize(cross(debugPlaneNormal, debugXAxis));
            
            for (int bounce = 0; bounce < MAX_BOUNCES; bounce++) {
                if (bounce >= maxBounces) break; // Adaptive bounce limit
                
                // Find closest surface hit
                Hit hit = intersectScene(ray);
                
                // Unified volumetric sampling (environment fog + volumetric spheres)
                // Only active when VPT is enabled
                if (u_enableVPT) {
                    float tMax = hit.hit ? hit.t : 1000.0;
                    vec3 volScatterPos;
                    vec3 volAlbedo;
                    float volTravelDist;
                    
                    int volResult = sampleVolumetricInteraction(ray, tMax, volScatterPos, volAlbedo, volTravelDist);
                    
                    if (volResult == 1) {
                        // Scattering event in participating media
                        pathLength += volTravelDist;
                        
                        // Scatter using Henyey-Greenstein phase function
                        vec3 scatterDir = sampleHenyeyGreenstein(ray.direction, u_fogAnisotropy);
                        
                        // Direct lighting at scatter point
                        vec3 directLight = sampleDirectLight(volScatterPos, scatterDir);
                        light += color * volAlbedo * directLight / (4.0 * PI);
                        
                        // Continue with scattered ray
                        ray.origin = volScatterPos;
                        ray.direction = scatterDir;
                        color *= volAlbedo;
                        
                        continue; // Skip surface processing
                    } else if (volResult == 2) {
                        // Absorption - path ends
                        break;
                    }
                    // If volResult == 0: no interaction, ray traveled volTravelDist and continues to surface
                }
                
                // TOF: accumulate path length
                if (hit.hit) {
                    pathLength += hit.t;
                }
                
                // Process surface hit
                if (!hit.hit) {
                    // Return sky color (or black if scene lights disabled)
                    if (u_disableSceneLights) {
                        light += vec3(0.0); // Black sky when scene lights off
                    } else {
                        light += color * getSky(ray.direction);
                    }
                    break;
                }
                
                // Focus region visualization - dual mode with separate tolerances
                if (u_visualizeFocus && firstHit) {
                    float focalLengthM = u_focalLength / 1000.0;
                    float f = focalLengthM;
                    float s = u_focusDistance;
                    float N = u_apertureFStop;
                    
                    // Calculate pixel size on sensor
                    float filmDiagonalM = u_filmSize / 1000.0;
                    float aspectRatio = u_resolution.x / u_resolution.y;
                    float filmHeightM = filmDiagonalM / sqrt(1.0 + aspectRatio * aspectRatio);
                    float pixelSizeM = filmHeightM / u_resolution.y;
                    
                    // Separate thresholds for each channel
                    float cocThresholdTraditional = pixelSizeM * max(u_focusTolerance, 0.5);
                    float cocThresholdScheimpflug = pixelSizeM * max(u_scheimpflugTolerance, 0.5);
                    
                    // GREEN channel: Traditional planar focus
                    vec3 forward = normalize(u_cameraLookAt - u_cameraPos);
                    vec3 toHit = hit.point - u_cameraPos;
                    float d_planar = dot(toHit, forward);
                    
                    float numerator_sph = f * f * abs(d_planar - s);
                    float denominator_sph = N * s * (d_planar - f);
                    float coc_planar = abs(numerator_sph / max(denominator_sph, 0.0001));
                    
                    bool inFocusTraditional = (coc_planar < cocThresholdTraditional);
                    float sharpnessTraditional = inFocusTraditional ? 1.0 - (coc_planar / cocThresholdTraditional) : 0.0;
                    
                    // RED channel: Scheimpflug plane focus (only if tilt-shift enabled)
                    if (u_enableTiltShift && length(u_filmTilt) > 0.001) {
                        // Recalculate camera basis vectors
                        vec3 forward, right, up;
                        getCameraBasis(forward, right, up);
                        
                        // Calculate film plane normal (use FILM tilt)
                        // Tilt X (rotation around right/X axis): affects Y direction → horizontal band
                        // Tilt Y (rotation around up/Y axis): affects X direction → vertical band
                        
                        // Apply INDEPENDENT rotations (not sequential!)
                        // Each tilt rotates from the base forward direction
                        vec3 filmNormal = forward;
                        
                        // Apply Tilt X: rotate around right axis (horizontal axis)
                        // Positive angle tilts TOP backward, creating horizontal focus band at Y=0
                        if (abs(u_filmTilt.x) > 0.001) {
                            float angle = u_filmTilt.x;
                            filmNormal = filmNormal + sin(angle) * up;
                        }
                        
                        // Apply Tilt Y: rotate around up axis (vertical axis)  
                        // Positive angle tilts RIGHT backward, creating vertical focus band at X=0
                        if (abs(u_filmTilt.y) > 0.001) {
                            float angle = u_filmTilt.y;
                            filmNormal = filmNormal + sin(angle) * right;
                        }
                        
                        filmNormal = normalize(filmNormal);
                        
                        // Scheimpflug focal plane: THE SINGLE FIXED PLANE where everything is in focus
                        // This is determined by the Scheimpflug principle:
                        // The lens plane, sensor plane, and focal plane all intersect at one line
                        
                        // For a tilted sensor, the focal plane is also tilted
                        // Its distance and orientation are determined by the thin lens equation + geometry
                        
                        // Focal plane center: forward at focus distance
                        vec3 focalPlaneCenter = u_cameraPos + forward * u_focusDistance;
                        
                        // Focal plane normal: parallel to sensor normal (Scheimpflug principle)
                        // When sensor tilts, focal plane tilts the same way
                        vec3 focalPlaneNormal = filmNormal;
                        
                        // Perpendicular distance from hit point to THE focal plane
                        float perpDist = abs(dot(hit.point - focalPlaneCenter, focalPlaneNormal));
                        
                        // Calculate CoC based on perpendicular distance from focal plane
                        // Similar to traditional CoC, but using perpendicular distance instead
                        // CoC = (aperture_diameter / f-number) * (perpDist / object_distance) * magnification
                        
                        float objectDist = length(hit.point - u_cameraPos);
                        float apertureDiameter = f / N; // meters
                        float magnification = f / max(s, 0.001);
                        
                        // CoC increases with perpendicular distance from focal plane
                        // Scale factor accounts for the fact that perpDist affects focus differently than axial distance
                        float coc_scheimpflug = apertureDiameter * (perpDist / max(objectDist, 0.1)) * abs(magnification) * 2.0;
                        
                        bool inFocusScheimpflug = (coc_scheimpflug < cocThresholdScheimpflug);
                        float sharpnessScheimpflug = inFocusScheimpflug ? 1.0 - (coc_scheimpflug / cocThresholdScheimpflug) : 0.0;
                        
                        // Apply visualization based on mode
                        if (u_focusVisMode == 0) {
                            // Additive mode: Show both for comparison
                            // Green = traditional focus (for reference)
                            // Red = Scheimpflug focus (what actually matters with tilt)
                            focusOverlay.g = sharpnessTraditional * 0.3; // Dimmed for reference
                            focusOverlay.r = sharpnessScheimpflug * 0.7;  // Brighter (this is what matters!)
                        } else {
                            // Inverted mode: With tilt-shift, ONLY Scheimpflug matters
                            // Traditional focus is ignored when tilt is active
                            if (!inFocusScheimpflug) {
                                // Out of Scheimpflug focus: red tint
                                focusOverlay = vec3(0.3, 0.0, 0.0);
                            }
                            // Show traditional as subtle reference (green tint)
                            if (!inFocusTraditional) {
                                focusOverlay.g += 0.1; // Subtle green = "would be out of focus without tilt"
                            }
                        }
                    } else {
                        // No tilt-shift: only traditional focus
                        if (u_focusVisMode == 0) {
                            // Additive mode
                            focusOverlay.g = sharpnessTraditional * 0.5;
                        } else {
                            // Inverted mode: tint if out of focus
                            if (!inFocusTraditional) {
                                focusOverlay = vec3(0.0, 0.3, 0.3); // Cyan tint for out of focus
                            }
                        }
                    }
                }
                
                // Save first hit position for carrier wave calculations
                if (firstHit) {
                    firstHitPos = hit.point;
                }
                firstHit = false;
                
                // Material (only for non-volumetric objects)
                vec3 albedo;
                float matType;
                vec3 emission = vec3(0.0);
                float textureType = 0.0;
                
                // Debug vectors already calculated outside loop!
                
                if (hit.materialIndex >= 0) {
                    albedo = u_sphereMats[hit.materialIndex].xyz;
                    matType = u_sphereMats[hit.materialIndex].w;
                    emission = u_sphereEmission[hit.materialIndex].xyz;
                    textureType = u_sphereTexture[hit.materialIndex].x;
                    
                    // Apply procedural texture (scale=1.0 for spheres)
                    albedo = applyTexture(albedo, hit.point, textureType, 1.0);
                    
                    // Check for passthrough split demo material (marker value 999.0 in volume data)
                    float passthroughSplit = u_sphereVolume[hit.materialIndex].x;
                    if (passthroughSplit > 900.0) {
                        // Left half passthrough, right half normal material
                        // Use X coordinate relative to sphere center
                        vec3 sphereCenter = u_spheres[hit.materialIndex].xyz;
                        vec3 localPos = hit.point - sphereCenter;
                        
                        if (localPos.x < 0.0) {
                            // Left half: Pass through completely
                            // No material interaction, ray continues
                            continue;
                        }
                        // Right half: Use material as normal (brushed metal with anisotropy)
                    }
                } else if (hit.materialIndex == -100) {
                    // Debug: Focus Point A - Blue
                    setGizmoSphereMaterial(1, vec3(0.2, 0.4, 1.0), matType, albedo, emission);
                } else if (hit.materialIndex == -101) {
                    // Debug: Focus Point B - Green
                    setGizmoSphereMaterial(2, vec3(0.2, 1.0, 0.4), matType, albedo, emission);
                } else if (hit.materialIndex == -102) {
                    // Debug: Focus Point C - Red
                    setGizmoSphereMaterial(3, vec3(1.0, 0.2, 0.2), matType, albedo, emission);
                } else if (hit.materialIndex == -103) {
                    // Debug: Focal plane triangle - metallic
                    albedo = vec3(0.7, 0.75, 0.8); // Light metallic gray
                    matType = 6.0; // Glossy/metal
                    emission = vec3(0.0);
                } else if (hit.materialIndex == -104) {
                    // Debug: X axis - Red
                    setGizmoAxisMaterial(hit.point, debugAxisOrigin, debugXAxis, vec3(1.0, 0.0, 0.0), matType, albedo, emission);
                } else if (hit.materialIndex == -105) {
                    // Debug: Y axis - Green
                    setGizmoAxisMaterial(hit.point, debugAxisOrigin, debugYAxis, vec3(0.0, 1.0, 0.0), matType, albedo, emission);
                } else if (hit.materialIndex == -106) {
                    // Debug: Z axis - Blue
                    setGizmoAxisMaterial(hit.point, debugAxisOrigin, debugPlaneNormal, vec3(0.0, 0.0, 1.0), matType, albedo, emission);
                } else if (hit.materialIndex == -107) {
                    // Debug: Center sphere - Yellow/Gold
                    setGizmoSphereMaterial(4, vec3(1.0, 0.85, 0.3), matType, albedo, emission);
                } else if (hit.materialIndex == -108) {
                    // Debug: X rotation circle - Red
                    setGizmoCircleMaterial(8, vec3(1.0, 0.2, 0.2), matType, albedo, emission);
                } else if (hit.materialIndex == -109) {
                    // Debug: Y rotation circle - Green
                    setGizmoCircleMaterial(9, vec3(0.2, 1.0, 0.2), matType, albedo, emission);
                } else if (hit.materialIndex == -110) {
                    // Debug: Z rotation circle - Blue
                    setGizmoCircleMaterial(10, vec3(0.2, 0.2, 1.0), matType, albedo, emission);
                } else if (hit.materialIndex == -111) {
                    // Debug: Sphere cage X ring (YZ plane) - Red
                    albedo = vec3(1.0, 0.2, 0.2);
                    matType = 4.0; // Emissive
                    emission = vec3(0.8, 0.1, 0.1);
                } else if (hit.materialIndex == -112) {
                    // Debug: Sphere cage Y ring (XZ plane) - Green
                    albedo = vec3(0.2, 1.0, 0.2);
                    matType = 4.0; // Emissive
                    emission = vec3(0.1, 0.8, 0.1);
                } else if (hit.materialIndex == -113) {
                    // Debug: Sphere cage Z ring (XY plane) - Blue
                    albedo = vec3(0.2, 0.2, 1.0);
                    matType = 4.0; // Emissive
                    emission = vec3(0.1, 0.1, 0.8);
                } else {
                    // Ground with pattern
                    albedo = vec3(0.5);
                    matType = 0.0; // Diffuse
                    
                    // Apply ground pattern
                    albedo = applyTexture(albedo, hit.point, u_groundPattern, u_groundPatternScale);
                }
                
                // Increment bounce count on surface hit
                actualBounces++;
                
                // Emissive
                if (matType == 4.0) {
                    if (!u_disableSceneLights) {
                        light += color * emission;
                    }
                    break;
                }
                
                // Glass material (refraction + reflection with Fresnel)
                if (matType == 2.0) {
                    float ior = 1.5;
                    if (u_enableChromaticAberration) {
                        ior += (ray.wavelength - 0.5) * 0.12 * u_chromaticAberration;
                    }
                    float absorption = u_sphereVolume[hit.materialIndex].x;
                    if (evaluateGlass(ray, hit, color, albedo, ior, absorption)) continue;
                }
                
                // Mirror material (perfect reflection)
                if (matType == 3.0) {
                    if (evaluateMirror(ray, hit, color, albedo)) continue;
                }
                
                // Material-specific handling
                if (matType == 6.0) {
                    // Glossy/Microfacet material (with optional clear coat or SSS)
                    float densityOrScatter = u_sphereVolume[hit.materialIndex].x;
                    float roughness = u_sphereVolume[hit.materialIndex].y;
                    float anisotropy = u_sphereVolume[hit.materialIndex].z;
                    float anisotropyRotation = u_sphereVolume[hit.materialIndex].w;
                    
                    float clearcoatOrSSS = u_sphereTexture[hit.materialIndex].y;
                    float clearcoatRoughnessOrDensity = u_sphereTexture[hit.materialIndex].z;
                    float clearcoatIOR = u_sphereTexture[hit.materialIndex].w;
                    
                    // Check for SSS (negative scatter distance marker + negative IOR)
                    bool isSSS = (densityOrScatter < -0.001 && clearcoatIOR < 0.0);
                    
                    if (isSSS) {
                        // Subsurface Scattering: volumetric random walk
                        float scatterDistance = -densityOrScatter;
                        float sssStrength = clearcoatOrSSS;
                        float scatterDensity = clearcoatRoughnessOrDensity;
                        
                        // Refract into surface
                        float sssIOR = 1.4; // Typical for translucent materials
                        vec3 refracted = refract(normalize(ray.direction), hit.normal, 1.0 / sssIOR);
                        
                        if (length(refracted) > 0.01) {
                            // Enter material and do random walk
                            vec3 sssPos = hit.point - hit.normal * EPSILON;
                            vec3 sssDir = refracted;
                            vec3 sssColor = vec3(1.0);
                            float totalDist = 0.0;
                            
                            // Random walk inside material (limited bounces for performance)
                            for (int sssStep = 0; sssStep < 4; sssStep++) {
                                // Sample scatter distance
                                float stepDist = -log(random()) / scatterDensity * scatterDistance;
                                totalDist += stepDist;
                                sssPos += sssDir * stepDist;
                                
                                // Absorption (Beer's law)
                                vec3 absorption = exp(-albedo * scatterDensity * totalDist);
                                sssColor *= absorption;
                                
                                // Check if we exit the object
                                vec3 toCenter = u_spheres[hit.materialIndex].xyz - sssPos;
                                float distToCenter = length(toCenter);
                                float radius = u_spheres[hit.materialIndex].w;
                                
                                if (distToCenter > radius - EPSILON) {
                                    // Exit surface - refract out
                                    vec3 exitNormal = normalize(sssPos - u_spheres[hit.materialIndex].xyz);
                                    vec3 exitDir = refract(sssDir, -exitNormal, sssIOR);
                                    if (length(exitDir) < 0.01) {
                                        exitDir = reflect(sssDir, -exitNormal);
                                    }
                                    
                                    // Set up ray to continue from exit point
                                    ray.origin = sssPos + exitNormal * EPSILON;
                                    ray.direction = normalize(exitDir);
                                    color *= sssColor * albedo * sssStrength;
                                    break;
                                }
                                
                                // Scatter: random new direction
                                sssDir = randomUnitVector();
                            }
                        }
                        continue;
                    }
                    
                    // Standard glossy/clearcoat path
                    float clearcoat = clearcoatOrSSS;
                    float clearcoatRoughness = clearcoatRoughnessOrDensity;
                    
                    // Variable Coating: Texture-controlled clearcoat (marked by negative IOR)
                    if (clearcoatIOR < -0.5) {
                        float variableCoatType = -clearcoatIOR;
                        float coatPattern = 0.0;
                        
                        // Type 1: Simplified fractal pattern (use hash instead of FBM)
                        if (variableCoatType < 1.5) {
                            coatPattern = hash(hit.point * 4.0);
                        }
                        // Type 2: Grid/field pattern
                        else {
                            // Voronoi-like cells
                            vec3 gridPos = hit.point * 6.0;
                            vec3 cellPos = floor(gridPos);
                            float minDist = 1.0;
                            for (int x = -1; x <= 1; x++) {
                                for (int y = -1; y <= 1; y++) {
                                    for (int z = -1; z <= 1; z++) {
                                        vec3 neighbor = cellPos + vec3(float(x), float(y), float(z));
                                        vec3 point = neighbor + vec3(
                                            sin(neighbor.x * 12.34) * 0.5 + 0.5,
                                            sin(neighbor.y * 23.45) * 0.5 + 0.5,
                                            sin(neighbor.z * 34.56) * 0.5 + 0.5
                                        );
                                        float dist = length(gridPos - point);
                                        minDist = min(minDist, dist);
                                    }
                                }
                            }
                            coatPattern = minDist;
                        }
                        
                        // High-contrast quantization: 3 levels
                        // 0.0-0.3: No coating (expose base)
                        // 0.3-0.6: Rough coating (frosted glass)
                        // 0.6-1.0: Clear coating (smooth glass)
                        float quantized = floor(coatPattern * 3.0) / 3.0;
                        
                        if (quantized < 0.35) {
                            // No coating - just base material
                            clearcoat = 0.0;
                        } else if (quantized < 0.65) {
                            // Rough/frosted coating
                            clearcoat = 0.7;
                            clearcoatRoughness = 0.3; // Frosted
                        } else {
                            // Clear/smooth coating
                            clearcoat = 1.0;
                            clearcoatRoughness = 0.01; // Very smooth
                        }
                        
                        // Reset IOR to standard value for Fresnel calculation
                        clearcoatIOR = 1.5;
                    }
                    
                    // Checkerboard: vary between glossy metal (smooth) and matte (rough)
                    if (textureType == 1.0) {
                        vec3 checker = checkerboard(hit.point, 3.0);
                        // Dark squares: glossy metal (low roughness = 0.05)
                        // Light squares: brushed/matte (high roughness = 0.8)
                        roughness = mix(0.05, 0.8, checker.x);
                    }
                    
                    if (roughness < 0.01) roughness = 0.01; // Prevent zero roughness
                    
                    // Dual-layer BRDF for car paint (clear coat + base)
                    bool sampleClearcoat = false;
                    float actualRoughness = roughness;
                    
                    if (clearcoat > 0.01) {
                        // Calculate Fresnel for clear coat layer
                        vec3 V = -ray.direction;
                        float NdotV = max(dot(hit.normal, V), 0.0);
                        float F0 = pow((1.0 - clearcoatIOR) / (1.0 + clearcoatIOR), 2.0);
                        float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);
                        
                        // Decide whether to sample clear coat or base layer
                        float clearcoatProb = clearcoat * fresnel;
                        if (random() < clearcoatProb) {
                            // Sample glossy clear coat layer
                            sampleClearcoat = true;
                            actualRoughness = clearcoatRoughness;
                            // Clear coat is colorless (white reflection)
                            albedo = vec3(1.0);
                        }
                        // else: Sample base paint layer with original albedo and roughness
                    }
                    
                    // Sample microfacet halfway vector (anisotropic or isotropic)
                    vec3 H;
                    if (anisotropy > 0.01 && !sampleClearcoat) {
                        // Use anisotropic sampling for brushed metal (not for clearcoat)
                        H = sampleGGXAnisotropic(hit.normal, actualRoughness, anisotropy, anisotropyRotation);
                    } else {
                        // Use standard isotropic sampling
                        H = sampleGGX(hit.normal, actualRoughness);
                    }
                    
                    // Reflect view direction around halfway vector
                    vec3 V = -ray.direction;
                    vec3 scattered = reflect(-V, H);
                    
                    // Check if reflection is above surface
                    if (dot(scattered, hit.normal) > 0.0) {
                        ray.origin = hit.point + hit.normal * EPSILON;
                        ray.direction = scattered;
                        
                        // Fresnel and microfacet BRDF approximation
                        float NdotV = max(dot(hit.normal, V), 0.0);
                        float NdotL = max(dot(hit.normal, scattered), 0.0);
                        float fresnel = pow(1.0 - NdotV, 5.0);
                        
                        // Check for special material effects (stored in emission array)
                        vec3 effectData = u_sphereEmission[hit.materialIndex].xyz;
                        float effectAlpha = u_sphereEmission[hit.materialIndex].w;
                        
                        // Surreal materials (marked by effectData.x > 2000 and alpha == 3)
                        if (effectData.x > 2000.0 && effectAlpha > 2.5) {
                            float surrealType = effectData.x - 2000.0;
                            
                            // 1. Fractal Emissive: Simplified (use hash instead of FBM)
                            if (surrealType < 1.5) {
                                // Simplified roughness modulation using hash
                                float roughHash = hash(hit.point * 5.0) * 0.5 + 0.5;
                                actualRoughness = mix(0.05, 0.8, roughHash);
                                
                                // Simplified emission
                                float emitHash = hash(hit.point * 3.0 + vec3(100.0)) * 0.5 + 0.5;
                                vec3 emitColor = albedo * pow(emitHash, 3.0) * 8.0;
                                
                                // Re-sample with modulated roughness
                                H = sampleGGX(hit.normal, actualRoughness);
                                scattered = reflect(-V, H);
                                
                                // Apply clearcoat on top
                                color *= albedo * (1.0 - fresnel * 0.5) + emitColor;
                            }
                            // 2. Black Hole: Gravitational lensing / ray bending
                            else if (surrealType < 2.5) {
                                // Black hole center
                                vec3 blackHoleCenter = u_spheres[hit.materialIndex].xyz;
                                float radius = u_spheres[hit.materialIndex].w;
                                
                                // Distance to center
                                vec3 toCenter = blackHoleCenter - hit.point;
                                float dist = length(toCenter);
                                vec3 pullDir = normalize(toCenter);
                                
                                // Gravitational ray bending
                                float gravStrength = (radius / dist) * 0.5; // Inverse square-ish
                                vec3 bentRay = normalize(scattered + pullDir * gravStrength);
                                
                                // Dark accretion disk pattern
                                float diskPattern = abs(sin(atan(toCenter.y, toCenter.x) * 8.0)) * (1.0 - dist / radius);
                                vec3 diskColor = vec3(0.1, 0.3, 0.5) * diskPattern;
                                
                                ray.direction = bentRay;
                                color *= albedo * 0.3 + diskColor;
                            }
                            // 3. Angle Rainbow: Color from incoming/outgoing angle relationship
                            else if (surrealType < 3.5) {
                                vec3 incoming = normalize(ray.direction);
                                vec3 outgoing = normalize(scattered);
                                
                                // Color from dot product (clamped to avoid acos domain errors)
                                float dotProd = dot(incoming, outgoing);
                                float dotInNorm = clamp(dot(incoming, hit.normal), -1.0, 1.0);
                                float dotOutNorm = clamp(dot(outgoing, hit.normal), -1.0, 1.0);
                                float sumAngle = acos(abs(dotInNorm)) + acos(abs(dotOutNorm));
                                
                                // Rainbow mapping
                                float hue = fract(dotProd * 0.5 + 0.5 + sumAngle / (2.0 * PI));
                                vec3 rainbow;
                                rainbow.r = abs(hue * 6.0 - 3.0) - 1.0;
                                rainbow.g = 2.0 - abs(hue * 6.0 - 2.0);
                                rainbow.b = 2.0 - abs(hue * 6.0 - 4.0);
                                rainbow = clamp(rainbow, 0.0, 1.0);
                                
                                color *= rainbow;
                            }
                            // 4. Impossible Material: Energy increases with bounces (breaks conservation)
                            else if (surrealType < 4.5) {
                                // Gain energy each bounce (impossible!)
                                float energyGain = 1.2;
                                color *= albedo * energyGain;
                                
                                // Shift color based on bounce count
                                float bounceHue = float(bounce) / float(maxBounces);
                                vec3 bounceColor = vec3(
                                    sin(bounceHue * PI),
                                    sin(bounceHue * PI + 2.0),
                                    sin(bounceHue * PI + 4.0)
                                ) * 0.5 + 0.5;
                                color *= bounceColor;
                            }
                            // 5. Chromatic Geometry: Color from vector operations
                            else {
                                vec3 incoming = normalize(ray.direction);
                                vec3 outgoing = normalize(scattered);
                                vec3 normal = hit.normal;
                                
                                // Use cross product and dot product for color
                                vec3 crossProd = cross(incoming, outgoing);
                                float dotInNorm = dot(incoming, normal);
                                float dotOutNorm = dot(outgoing, normal);
                                
                                // Map geometric relationships to color
                                vec3 geomColor;
                                geomColor.r = length(crossProd);
                                geomColor.g = abs(dotInNorm);
                                geomColor.b = abs(dotOutNorm);
                                
                                color *= geomColor * 1.5;
                            }
                        }
                        // Animated materials (marked by effectData.x > 1000 and alpha == 2)
                        if (effectData.x > 1000.0 && effectAlpha > 1.5) {
                            float animType = effectData.x - 1000.0;
                            float animSpeed = effectData.y;
                            float isTripleLayer = effectData.z;
                            
                            // Time-based animation
                            float t = u_time * animSpeed;
                            
                            // 1. Energy Shield: Hexagonal scan pattern
                            if (animType < 1.5) {
                                // Hexagonal grid
                                vec2 gridUV = hit.point.xy * 5.0;
                                float hexGrid = abs(sin(gridUV.x * 3.14) * sin(gridUV.y * 3.14 * 0.866));
                                float scanLine = sin(hit.point.z * 10.0 - t * 3.0) * 0.5 + 0.5;
                                float pulse = sin(t * 2.0) * 0.3 + 0.7;
                                
                                // Modulate albedo and add emission
                                albedo = mix(albedo, vec3(0.5, 1.0, 1.0), hexGrid * scanLine * pulse);
                                color *= albedo * (1.0 + scanLine * 0.5);
                            }
                            // 2. Lava: Flowing thermal emission (simplified)
                            // 2. Holographic: Shifting interference patterns
                            else if (animType < 3.5) {
                                // Time-varying thickness
                                float thickness = 400.0 + sin(t + hit.point.x * 5.0) * 100.0;
                                thickness += cos(t * 0.7 + hit.point.y * 5.0) * 50.0;
                                
                                // Animated thin-film
                                vec3 holoColor = thinFilmInterference(thickness, 1.3, NdotV);
                                
                                // Scan lines
                                float scanlines = sin(hit.point.y * 50.0 - t * 10.0) * 0.1 + 1.0;
                                color *= holoColor * scanlines;
                            }
                            // 4. Quantum Foam: Turbulent spacetime (simplified)
                            else {
                                // Single-scale turbulence (much faster)
                                vec3 quantumPos = hit.point * 8.0 + vec3(t * 0.5);
                                float turbulence = fbm(quantumPos);
                                
                                // Quantum fluctuations
                                float fluctuation = sin(turbulence * 10.0 + t * 3.0);
                                
                                // Color shift
                                vec3 quantum1 = vec3(0.7, 0.8, 1.0);
                                vec3 quantum2 = vec3(1.0, 0.9, 1.0);
                                albedo = mix(quantum1, quantum2, fluctuation * 0.5 + 0.5);
                                color *= albedo * (1.0 + abs(fluctuation) * 0.3);
                            }
                        }
                        // Triple-Layer: Dual clearcoat + brushed fractal metal (simplified)
                        else if (textureType == 2.0 && clearcoat > 0.5 && anisotropy > 0.01) {
                            // Simplified: skip expensive FBM normal perturbation for compilation speed
                            vec3 perturbNormal = hit.normal;
                            
                            // Use perturbed normal for sampling
                            vec3 H_perturb = sampleGGXAnisotropic(perturbNormal, actualRoughness, anisotropy, anisotropyRotation);
                            vec3 scattered_perturb = reflect(-V, H_perturb);
                            
                            if (dot(scattered_perturb, perturbNormal) > 0.0) {
                                ray.direction = scattered_perturb;
                                // Layer interaction
                                color *= albedo * (1.0 - fresnel * 0.3);
                            }
                        }
                        // Velvet/Fluffy: Retroreflective sheen at grazing angles
                        else if (effectData.x > 0.01 && effectData.x < 10.0) {
                            float velvetStrength = effectData.x;
                            float velvetFalloff = effectData.y;
                            float noiseAmount = effectData.z; // Fluffy adds noise
                            
                            // Velvet sheen is strongest at grazing angles (reverse of normal Fresnel)
                            float velvetSheen = pow(1.0 - NdotV, velvetFalloff);
                            
                            // Add fuzz/noise for fluffy materials
                            if (noiseAmount > 0.01) {
                                // Simplified fuzziness using hash
                                float fuzz = hash(hit.point * 10.0) * noiseAmount;
                                velvetSheen *= (1.0 + fuzz);
                            }
                            
                            // Add bright rim lighting effect
                            color *= albedo * (1.0 + velvetSheen * velvetStrength);
                        }
                        // Iridescence/Pearl: Thin-film interference (marked by negative value)
                        else if (effectData.x < -0.01) {
                            float iridescenceStrength = -effectData.x;
                            float iridescenceIOR = effectData.y;
                            float iridescenceThickness = effectData.z;
                            
                            // Pearl: Add depth-based color variation
                            // Check clearcoat IOR: pearl uses positive IOR, iridescence uses default
                            if (clearcoatIOR > 1.3) {
                                // Pearl: Simplified depth using hash
                                float depth = hash(hit.point * 15.0) * 0.02;
                                iridescenceThickness += depth * 200.0; // Vary thickness by depth
                            }
                            
                            // Calculate thin-film color based on viewing angle
                            vec3 filmColor = thinFilmInterference(iridescenceThickness, iridescenceIOR, NdotV);
                            // Mix with base albedo
                            color *= mix(albedo, filmColor * albedo, iridescenceStrength);
                        }
                        // Hair: Dual specular lobes (Marschner-style)
                        else if (clearcoatIOR > 10.0) {
                            // Hair marker: IOR > 10
                            float hairShift = clearcoatOrSSS; // Reuse clearcoat for shift
                            float hairRoughness2 = clearcoatRoughnessOrDensity; // Second lobe roughness
                            
                            // Primary lobe (R): Direct reflection
                            float NdotH1 = max(dot(hit.normal, H), 0.0);
                            float lobe1 = pow(NdotH1, 1.0 / (actualRoughness * actualRoughness));
                            
                            // Secondary lobe (TRT): Shifted reflection
                            vec3 shiftedNormal = normalize(hit.normal + scattered * hairShift);
                            vec3 H2 = normalize(V + scattered);
                            float NdotH2 = max(dot(shiftedNormal, H2), 0.0);
                            float lobe2 = pow(NdotH2, 1.0 / (hairRoughness2 * hairRoughness2));
                            
                            // Combine lobes with Fresnel
                            float hairFresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 5.0);
                            vec3 specular = vec3(lobe1 * hairFresnel + lobe2 * 0.5);
                            color *= albedo * mix(vec3(1.0), specular, 0.3);
                        }
                        // Standard glossy
                        else {
                            color *= albedo * (1.0 - fresnel * 0.5);
                        }
                    } else {
                        // Invalid reflection, treat as diffuse
                        evaluateDiffuse(ray, hit, color, light, albedo);
                    }
                } else {
                    // Diffuse with direct lighting (NEE for faster convergence)
                    evaluateDiffuse(ray, hit, color, light, albedo);
                }
                
                // Russian roulette
                if (bounce > 1) {
                    float p = max(albedo.r, max(albedo.g, albedo.b));
                    if (random() > p) break;
                    color /= p;
                }
            }
            
            // Apply focus overlay additively (so we can see scene underneath)
            light += focusOverlay;
            
            // TOF filtering: only return light if path length is within range
            if (u_enableTOF) {
                // Carrier wave creates a spatial phase ramp (tilts the time gate)
                float carrierOffset = 0.0;
                if (u_planarWaveCarrierFreq > 0.01) {
                    // Calculate camera basis
                    vec3 cameraForward = normalize(u_cameraLookAt - u_cameraPos);
                    vec3 cameraRight = normalize(cross(cameraForward, vec3(0, 1, 0)));
                    
                    // Project hit position onto camera right axis (horizontal position)
                    vec3 toHit = firstHitPos - u_cameraPos;
                    float horizontalPos = dot(toHit, cameraRight);
                    
                    // Carrier frequency creates depth offset based on horizontal position
                    // Scale to create visible tilt: ~1m per 10 carrier units
                    carrierOffset = horizontalPos * u_planarWaveCarrierFreq * 0.05;
                }
                
                // Apply TOF gate with carrier offset
                float effectivePathLength = pathLength + carrierOffset;
                float maxDistance = u_tofMinDistance + u_tofRange;
                float inRange = step(u_tofMinDistance, effectivePathLength) * step(effectivePathLength, maxDistance);
                light *= inRange;
            }
            
            // CW-ToF: Continuous wave time-of-flight with interference patterns
            if (u_enableCWToF) {
                // Speed of light in m/s
                const float c = 299792458.0;
                
                // Modulation wavelength
                float lambda_mod = c / u_cwTofModulationFreq;
                
                // Object wave phase from path length (round-trip: light -> object -> camera)
                // When using planar wave light, pathLength is approx camera-to-object
                // For interference, we need: phase = 2π × (2 × distance) / λ_mod
                float objectPhase = (2.0 * PI * 2.0 * pathLength) / lambda_mod;
                objectPhase += u_cwTofPhaseOffset; // Add user-controlled phase offset
                
                // Carrier wave creates spatial phase ramp (tilts fringes)
                float carrierPhaseOffset = 0.0;
                if (u_planarWaveCarrierFreq > 0.01) {
                    // Calculate camera basis
                    vec3 cameraForward = normalize(u_cameraLookAt - u_cameraPos);
                    vec3 cameraRight = normalize(cross(cameraForward, vec3(0, 1, 0)));
                    
                    // Project hit position onto camera right axis (horizontal position)
                    vec3 toHit = firstHitPos - u_cameraPos;
                    float horizontalPos = dot(toHit, cameraRight);
                    
                    // Carrier creates spatial phase ramp across image
                    // Higher frequency = more tilted fringes
                    carrierPhaseOffset = 2.0 * PI * u_planarWaveCarrierFreq * horizontalPos / u_planarWaveLightSize;
                }
                
                if (u_cwTofShowInterference) {
                    // Interference between object wave and reference wave
                    // Object wave: intensity from scene, phase from optical path
                    float objectIntensity = length(light) / sqrt(3.0);
                    
                    // Only apply interference where there's actual light (not empty space)
                    if (objectIntensity > 0.001) {
                        // Reference wave with controllable parameters
                        float referenceIntensity = u_referenceWaveIntensity;
                        
                        // Reference wave phase (can be different frequency for heterodyne detection)
                        // Uses controllable reference frequency (may differ from object frequency)
                        float referencePhase = (2.0 * PI * 2.0 * pathLength * u_referenceWaveFrequency) / c;
                        referencePhase += u_referenceWavePhase;
                        
                        // Add carrier wave spatial offset to object phase
                        float objectPhaseWithCarrier = objectPhase + carrierPhaseOffset;
                        
                        // Phase difference between object and reference waves
                        // This is what creates the visible fringes!
                        float phaseDiff = objectPhaseWithCarrier - referencePhase;
                        
                        // Interference term: I_total = I_obj + I_ref + 2*sqrt(I_obj*I_ref)*cos(phase_diff)
                        float interference = 2.0 * sqrt(objectIntensity * referenceIntensity) * cos(phaseDiff);
                        float combined = objectIntensity + referenceIntensity + interference;
                        
                        // Normalize to [0, 1]
                        float maxIntensity = objectIntensity + referenceIntensity + 2.0 * sqrt(objectIntensity * referenceIntensity);
                        combined = combined / max(maxIntensity, 0.001);
                        combined = clamp(combined, 0.0, 1.0);
                        
                        // Show as grayscale (monochromatic hologram)
                        light = vec3(combined);
                    } else {
                        // Empty space remains black (no reference wave there)
                        light = vec3(0.0);
                    }
                } else if (u_cwTofShowDepth) {
                    // CW-ToF reconstructed depth (from 4-phase algorithm)
                    // In reality: would compute from I0, I90, I180, I270 captures
                    // Here: simulate the result which would extract smooth depth
                    
                    // The 4-phase algorithm extracts phase, which maps to depth
                    float depth = pathLength;
                    
                    // Normalize depth for visualization (0-20m display range)
                    float normalizedDepth = clamp(depth / 20.0, 0.0, 1.0);
                    
                    // Color-code depth: blue=close, cyan=mid, red=far
                    vec3 depthColor;
                    if (normalizedDepth < 0.5) {
                        depthColor = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), normalizedDepth * 2.0);
                    } else {
                        depthColor = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.0, 0.0), (normalizedDepth - 0.5) * 2.0);
                    }
                    
                    // Show pure depth without scene intensity
                    light = depthColor;
                }
            }
            
            // Reference Wave Interference (independent of CW-ToF)
            if (u_enableReferenceWave) {
                const float c = 299792458.0;
                float objectIntensity = length(light) / sqrt(3.0);
                
                // Only apply interference where there's actual light (not empty space)
                if (objectIntensity > 0.001) {
                    float referenceIntensity = u_referenceWaveIntensity;
                    
                    // Reference wave phase from path length
                    float referencePhase = (2.0 * PI * 2.0 * pathLength * u_referenceWaveFrequency) / c;
                    referencePhase += u_referenceWavePhase;
                    
                    // Carrier wave creates spatial phase ramp (tilts fringes)
                    float carrierPhaseOffset = 0.0;
                    if (u_planarWaveCarrierFreq > 0.01) {
                        vec3 cameraForward = normalize(u_cameraLookAt - u_cameraPos);
                        vec3 cameraRight = normalize(cross(cameraForward, vec3(0, 1, 0)));
                        vec3 toHit = firstHitPos - u_cameraPos;
                        float horizontalPos = dot(toHit, cameraRight);
                        carrierPhaseOffset = 2.0 * PI * u_planarWaveCarrierFreq * horizontalPos / u_planarWaveLightSize;
                    }
                    
                    // Interference pattern with carrier wave spatial phase
                    float phaseWithCarrier = referencePhase + carrierPhaseOffset;
                    float interference = 2.0 * sqrt(objectIntensity * referenceIntensity) * cos(phaseWithCarrier);
                    float combined = objectIntensity + referenceIntensity + interference;
                    
                    // Normalize
                    float maxIntensity = objectIntensity + referenceIntensity + 2.0 * sqrt(objectIntensity * referenceIntensity);
                    combined = combined / max(maxIntensity, 0.001);
                    combined = clamp(combined, 0.0, 1.0);
                    
                    if (u_referenceWaveColorMode) {
                        // Color mode: Modulate scene color by interference pattern
                        // Preserves material colors while showing fringes
                        vec3 sceneColor = light / max(objectIntensity * sqrt(3.0), 0.001);
                        light = sceneColor * combined;
                    } else {
                        // Grayscale mode: Show pure interference pattern (traditional hologram)
                        light = vec3(combined);
                    }
                } else {
                    // Empty space remains black
                    light = vec3(0.0);
                }
            }
            
            // Off-Axis Holography is handled in main() using direct path length
            // (Not applied here to avoid issues with multi-bounce paths)
            
            // Bounce filtering: only show paths within [minBounces, minBounces + bounceRange]
            // This allows visualizing specific bounce counts (e.g., only 3rd bounce)
            if (!u_enableVPT) {
                if (actualBounces < minBounces || actualBounces > maxBounces) {
                    light = vec3(0.0); // Filter out paths outside bounce range
                }
            }
            
            return light;
        }
        
        // Apply lens distortion
        vec2 applyDistortion(vec2 coord) {
            if (u_distortionType == 0) return coord;
            
            float r2 = dot(coord, coord);
            float distortion = 1.0;
            
            if (u_distortionType == 1) {
                // Barrel distortion (negative radial)
                distortion = 1.0 + u_distortionAmount * r2;
            } else if (u_distortionType == 2) {
                // Pincushion distortion (positive radial)
                distortion = 1.0 - u_distortionAmount * r2;
            } else if (u_distortionType == 3) {
                // Fisheye distortion
                float r = sqrt(r2);
                if (r > 0.0) {
                    float theta = atan(r * u_distortionAmount * 2.0);
                    distortion = theta / r;
                }
            }
            
            return coord * distortion;
        }
        
        // Sample aperture shape
        vec2 sampleAperture(float radius) {
            if (u_apertureShape == 0) {
                // Circular
                float r = sqrt(random()) * radius;
                float theta = random() * 2.0 * PI;
                return vec2(r * cos(theta), r * sin(theta));
            } else if (u_apertureShape == 1) {
                // Regular Polygon (N-gon) - uses blade count for sides
                // Sample by picking a triangle from center to two adjacent vertices
                int sides = max(u_apertureBlades, 3);
                
                // Pick random triangle (from N triangles)
                int tri = int(random() * float(sides));
                
                // Two vertices of this triangle (centered at origin)
                float angle1 = (float(tri) / float(sides)) * 2.0 * PI - PI / 2.0;
                float angle2 = (float(tri + 1) / float(sides)) * 2.0 * PI - PI / 2.0;
                
                vec2 v1 = vec2(cos(angle1), sin(angle1)) * radius;
                vec2 v2 = vec2(cos(angle2), sin(angle2)) * radius;
                
                // Uniformly sample within triangle (origin, v1, v2)
                float u = random();
                float v = random();
                if (u + v > 1.0) {
                    u = 1.0 - u;
                    v = 1.0 - v;
                }
                
                return u * v1 + v * v2;
            } else if (u_apertureShape == 2) {
                // Square
                float x = (random() * 2.0 - 1.0) * radius;
                float y = (random() * 2.0 - 1.0) * radius;
                return vec2(x, y);
            } else if (u_apertureShape == 3) {
                // Star (N-pointed) - uses blade count, supports 3+
                int blades = max(u_apertureBlades, 3);
                float angle = random() * 2.0 * PI;
                float bladeAngle = 2.0 * PI / float(blades);
                float modAngle = mod(angle, bladeAngle);
                float bladeDist = bladeAngle / 2.0;
                float distFromCenter = abs(modAngle - bladeDist) / bladeDist;
                float r = mix(radius * 0.4, radius, distFromCenter) * sqrt(random());
                return vec2(r * cos(angle), r * sin(angle));
            } else if (u_apertureShape == 4) {
                // Ring (annular aperture) - creates donut bokeh
                float angle = random() * 2.0 * PI;
                float innerRadius = radius * 0.5;
                float r = mix(innerRadius, radius, sqrt(random()));
                return vec2(r * cos(angle), r * sin(angle));
            } else if (u_apertureShape == 5) {
                // Diagonal scar (creates streak bokeh)
                float x = (random() * 2.0 - 1.0) * radius;
                float y = x * 0.3 + (random() - 0.5) * 0.2 * radius; // Thin diagonal band
                return vec2(x, y);
            } else if (u_apertureShape == 6) {
                // Coded aperture - MURA (Modified Uniformly Redundant Array) pattern
                // 5x5 MURA pattern for depth from defocus (using rejection sampling)
                const int size = 5;
                
                // Sample random cell position
                float rx = random();
                float ry = random();
                int gridX = int(rx * float(size));
                int gridY = int(ry * float(size));
                
                // MURA pattern encoded as function (avoids array initialization issues)
                // Pattern: 1=open, 0=blocked
                bool isOpen = false;
                int idx = gridY * size + gridX;
                if (idx == 0 || idx == 2 || idx == 3 || idx == 5 || idx == 6 || idx == 8 ||
                    idx == 10 || idx == 12 || idx == 13 || idx == 15 || idx == 17 ||
                    idx == 18 || idx == 20 || idx == 22 || idx == 24) {
                    isOpen = true;
                }
                
                if (isOpen) {
                    // Map to physical position
                    float cellSize = (2.0 * radius) / float(size);
                    float x = (float(gridX) + random() - float(size)/2.0) * cellSize;
                    float y = (float(gridY) + random() - float(size)/2.0) * cellSize;
                    return vec2(x, y);
                } else {
                    // Blocked, try nearby open cell (deterministic fallback, no recursion)
                    gridX = (gridX + 1) % size;
                    float cellSize = (2.0 * radius) / float(size);
                    float x = (float(gridX) + random() - float(size)/2.0) * cellSize;
                    float y = (float(gridY) + random() - float(size)/2.0) * cellSize;
                    return vec2(x, y);
                }
            } else if (u_apertureShape == 7) {
                // Pinhole grid (NxN array) - uses blade count for density
                int gridSize = max(u_apertureBlades, 3);
                int gridX = int(random() * float(gridSize));
                int gridY = int(random() * float(gridSize));
                
                float cellSize = (2.0 * radius) / float(gridSize);
                float pinRadius = cellSize * 0.3; // Small pinholes (scales with density)
                
                // Center of this grid cell
                float centerX = (float(gridX) - float(gridSize)/2.0 + 0.5) * cellSize;
                float centerY = (float(gridY) - float(gridSize)/2.0 + 0.5) * cellSize;
                
                // Sample within pinhole
                float angle = random() * 2.0 * PI;
                float r = pinRadius * sqrt(random());
                return vec2(centerX + r * cos(angle), centerY + r * sin(angle));
            } else if (u_apertureShape == 8) {
                // Heart shape ❤ (creates heart-shaped bokeh)
                float t = random() * 2.0 * PI;
                float x = 16.0 * pow(sin(t), 3.0);
                float y = 13.0 * cos(t) - 5.0 * cos(2.0*t) - 2.0 * cos(3.0*t) - cos(4.0*t);
                float scale = radius / 17.0; // Normalize to fit aperture
                return vec2(x * scale, -y * scale); // Flip Y to upright
            } else if (u_apertureShape == 9) {
                // Cat eye (vertical slit with rounded ends)
                float angle = random() * 2.0 * PI;
                float r = sqrt(random()) * radius;
                float x = r * cos(angle) * 0.15; // Narrow horizontally
                float y = r * sin(angle);
                return vec2(x, y);
            }
            return vec2(0.0);
        }
        
        // Calculate ray from virtual sensor to actual sensor for tilt-shift splatting
        // Returns: virtual sensor UV coordinates for this actual sensor pixel
        vec2 getVirtualSensorUV(vec2 actualUV, vec3 forward, vec3 right, vec3 up, 
                                float filmWidth, float filmHeight, float focalLengthM,
                                out vec3 actualSensorPoint) {
            // Calculate actual (tilted) sensor point in 3D
            float filmPosZ = -(focalLengthM * u_focusDistance) / (u_focusDistance - focalLengthM);
            
            // Actual sensor coordinate in camera space (before tilt)
            vec3 sensorPoint = vec3(
                actualUV.x * filmWidth * 0.5,
                actualUV.y * filmHeight * 0.5,
                filmPosZ
            );
            
            // Apply film tilt to get actual sensor position
            if (length(u_filmTilt) > 0.001) {
                // Rotate around right axis (tilt X)
                if (abs(u_filmTilt.x) > 0.001) {
                    float cosX = cos(u_filmTilt.x);
                    float sinX = sin(u_filmTilt.x);
                    float y = sensorPoint.y;
                    float z = sensorPoint.z;
                    sensorPoint.y = y * cosX - z * sinX;
                    sensorPoint.z = y * sinX + z * cosX;
                }
                // Rotate around up axis (tilt Y)
                if (abs(u_filmTilt.y) > 0.001) {
                    float cosY = cos(u_filmTilt.y);
                    float sinY = sin(u_filmTilt.y);
                    float x = sensorPoint.x;
                    float z = sensorPoint.z;
                    sensorPoint.x = x * cosY + z * sinY;
                    sensorPoint.z = -x * sinY + z * cosY;
                }
            }
            
            actualSensorPoint = sensorPoint;
            
            // Virtual sensor is parallel to focal plane (no tilt)
            // Map actual sensor point back to virtual sensor UV
            vec3 virtualSensorPoint = vec3(
                sensorPoint.x,
                sensorPoint.y,
                filmPosZ  // Virtual sensor at same Z as untilted sensor
            );
            
            vec2 virtualUV = vec2(
                virtualSensorPoint.x / (filmWidth * 0.5),
                virtualSensorPoint.y / (filmHeight * 0.5)
            );
            
            return virtualUV;
        }
        
        // Generate camera ray with specific wavelength
        Ray generateRay(vec2 uv, float wavelength) {
            Ray ray;
            ray.origin = u_cameraPos;
            ray.wavelength = wavelength;
            
            // Calculate basis vectors (camera looks TOWARD lookAt point)
            vec3 forward, right, up;
            getCameraBasis(forward, right, up);
            
            // Calculate film dimensions from diagonal size
            // Film size is diagonal in mm, convert to meters and calculate width/height
            float filmDiagonal = u_filmSize / 1000.0; // Convert to meters
            float aspectRatio = u_resolution.x / u_resolution.y;
            float filmHeight = filmDiagonal / sqrt(1.0 + aspectRatio * aspectRatio);
            float filmWidth = filmHeight * aspectRatio;
            
            // Calculate FOV from focal length and actual film size
            float focalLengthM = u_focalLength / 1000.0;
            float fovRad = 2.0 * atan(filmHeight / (2.0 * focalLengthM));
            float viewportHeight = 2.0 * tan(fovRad / 2.0);
            float viewportWidth = viewportHeight * aspectRatio;
            
            vec2 jitter = vec2(random(), random()) / u_resolution;
            vec2 coord = (uv + jitter) * 2.0 - 1.0;
            
            // Apply lens distortion
            coord = applyDistortion(coord);
            
            // Apply spectral lens chromatic aberration (wavelength-dependent radial distortion)
            if (u_enableLensCA && u_lensCAMode == 1) {
                // Wavelength-dependent lens dispersion
                // Blue (wavelength=1.0, high IOR) refracts more → shifts outward
                // Red (wavelength=0.0, low IOR) refracts less → shifts inward
                vec2 dir = coord;
                float dist = length(dir);
                
                // Wavelength distortion factor: negative for red (contract), positive for blue (expand)
                float dispersionFactor = (wavelength - 0.5) * u_lensCAStrength * 0.05;
                
                // Apply radial distortion (dist² makes it stronger at edges)
                coord = coord * (1.0 + dispersionFactor * (dist * dist + 0.2));
            }
            
            // Apply sensor viewport offset (pan to see shifted image)
            // This moves the sampling window on the virtual sensor plane
            coord.x += u_sensorOffset.x;
            coord.y += u_sensorOffset.y;
            
            // Apply film shift (offset the sampling position)
            coord.x += u_filmShift.x / (filmWidth * 0.5);
            coord.y += u_filmShift.y / (filmHeight * 0.5);
            
            // Calculate target point on virtual film plane
            vec3 targetPoint = forward + 
                               coord.x * viewportWidth * 0.5 * right + 
                               coord.y * viewportHeight * 0.5 * up;
            
            // Apply film tilt (rotate the target point around center)
            if (length(u_filmTilt) > 0.001) {
                // Rotate around right axis (tilt X)
                if (abs(u_filmTilt.x) > 0.001) {
                    float cosX = cos(u_filmTilt.x);
                    float sinX = sin(u_filmTilt.x);
                    vec3 localUp = targetPoint - forward;
                    float upDist = dot(localUp, up);
                    float forwardDist = dot(localUp, forward);
                    float newUpDist = upDist * cosX - forwardDist * sinX;
                    float newForwardDist = upDist * sinX + forwardDist * cosX;
                    targetPoint = forward + normalize(forward) * newForwardDist + up * newUpDist + right * dot(localUp, right);
                }
                
                // Rotate around up axis (tilt Y)
                if (abs(u_filmTilt.y) > 0.001) {
                    float cosY = cos(u_filmTilt.y);
                    float sinY = sin(u_filmTilt.y);
                    vec3 localRight = targetPoint - forward;
                    float rightDist = dot(localRight, right);
                    float forwardDist = dot(localRight, forward);
                    float newRightDist = rightDist * cosY - forwardDist * sinY;
                    float newForwardDist = rightDist * sinY + forwardDist * cosY;
                    targetPoint = forward + normalize(forward) * newForwardDist + right * newRightDist + up * dot(localRight, up);
                }
            }
            
            // Apply film curvature (bend the film surface)
            if (abs(u_filmCurvature) > 0.001) {
                float distFromCenter = length(coord);
                float curvatureOffset = u_filmCurvature * distFromCenter * distFromCenter * 0.1;
                targetPoint += forward * curvatureOffset;
            }
            
            if (u_cameraType == 0) {
                // Pinhole - ray points toward target
                ray.direction = normalize(targetPoint);
            } else {
                // Thin lens - sample aperture with tilt/shift and focus
                float apertureRadius = focalLengthM / (u_apertureFStop * 2.0);
                if (u_apertureFStop < 8192.0) {
                    // Aperture normal (optical axis) - starts as forward direction
                    vec3 apertureNormal = forward;
                    
                    // Apply aperture tilt
                    if (length(u_apertureTilt) > 0.001) {
                        // Rotate around right axis (tilt X)
                        if (abs(u_apertureTilt.x) > 0.001) {
                            float cosX = cos(u_apertureTilt.x);
                            float sinX = sin(u_apertureTilt.x);
                            vec3 rotated = apertureNormal;
                            float upComp = dot(rotated, up);
                            float fwdComp = dot(rotated, forward);
                            rotated = normalize(forward) * (fwdComp * cosX - upComp * sinX) +
                                     up * (fwdComp * sinX + upComp * cosX) +
                                     right * dot(rotated, right);
                            apertureNormal = rotated;
                        }
                        // Rotate around up axis (tilt Y)
                        if (abs(u_apertureTilt.y) > 0.001) {
                            float cosY = cos(u_apertureTilt.y);
                            float sinY = sin(u_apertureTilt.y);
                            vec3 rotated = apertureNormal;
                            float rightComp = dot(rotated, right);
                            float fwdComp = dot(rotated, forward);
                            rotated = normalize(forward) * (fwdComp * cosY - rightComp * sinY) +
                                     right * (fwdComp * sinY + rightComp * cosY) +
                                     up * dot(rotated, up);
                            apertureNormal = rotated;
                        }
                        apertureNormal = normalize(apertureNormal);
                    }
                    
                    // Sample point on aperture disk
                    vec2 apertureSample = sampleAperture(apertureRadius);
                    
                    // For new tilt-shift, we'll use different basis later
                    vec3 apertureDiskPoint = apertureSample.x * right + apertureSample.y * up;
                    
                    // Rotate disk point by aperture tilt (only for old tilt-shift)
                    if (length(u_apertureTilt) > 0.001 && !u_enableNewTiltShift) {
                        if (abs(u_apertureTilt.x) > 0.001) {
                            float cosX = cos(u_apertureTilt.x);
                            float sinX = sin(u_apertureTilt.x);
                            float upComp = dot(apertureDiskPoint, up);
                            float fwdComp = dot(apertureDiskPoint, forward);
                            apertureDiskPoint = forward * (fwdComp * cosX - upComp * sinX) +
                                              up * (fwdComp * sinX + upComp * cosX) +
                                              right * dot(apertureDiskPoint, right);
                        }
                        if (abs(u_apertureTilt.y) > 0.001) {
                            float cosY = cos(u_apertureTilt.y);
                            float sinY = sin(u_apertureTilt.y);
                            float rightComp = dot(apertureDiskPoint, right);
                            float fwdComp = dot(apertureDiskPoint, forward);
                            apertureDiskPoint = forward * (fwdComp * cosY - rightComp * sinY) +
                                              right * (fwdComp * sinY + rightComp * cosY) +
                                              up * dot(apertureDiskPoint, up);
                        }
                    }
                    
                    // Aperture center position
                    vec3 apertureCenter = ray.origin + 
                                         u_apertureShift.x * right + 
                                         u_apertureShift.y * up + 
                                         u_apertureShift.z * forward;
                    
                    // Final lens point
                    vec3 lensPoint = apertureCenter + apertureDiskPoint;
                    
                    vec3 focusPoint;
                    
                    // Tilt-shift mode: sample from VIRTUAL sensor, then see where ray hits ACTUAL sensor
                    if (u_enableTiltShift && length(u_filmTilt) > 0.001) {
                        // Tilt-shift blur is DIRECTIONAL and GEOMETRIC:
                        // - Tilt X (rotation around right/X axis): blur varies with Y coordinate (horizontal focus line at Y=0)
                        // - Tilt Y (rotation around up/Y axis): blur varies with X coordinate (vertical focus line at X=0)
                        
                        // Calculate actual Z-displacement of sensor point due to tilt
                        // This is the key: points away from the rotation axis are at different depths
                        float filmPosZ = -(focalLengthM * u_focusDistance) / (u_focusDistance - focalLengthM);
                        
                        // Calculate how much sensor point is displaced in Z due to tilt
                        // Tilt X: rotation around X axis affects Y positions
                        float zDisplacementFromTiltX = filmPosZ * (1.0 - cos(u_filmTilt.x)) * abs(coord.y);
                        zDisplacementFromTiltX += abs(sin(u_filmTilt.x)) * abs(coord.y * filmHeight * 0.5);
                        
                        // Tilt Y: rotation around Y axis affects X positions  
                        float zDisplacementFromTiltY = filmPosZ * (1.0 - cos(u_filmTilt.y)) * abs(coord.x);
                        zDisplacementFromTiltY += abs(sin(u_filmTilt.y)) * abs(coord.x * filmWidth * 0.5);
                        
                        // Blur is proportional to:
                        // 1. Depth displacement from focus plane
                        // 2. Aperture size (aperture diameter = focal length / f-stop)
                        // 3. Magnification factor
                        float apertureRadius = focalLengthM / u_apertureFStop;
                        float magnification = focalLengthM / (u_focusDistance - focalLengthM);
                        
                        // Calculate blur kernel size based on actual geometric cone projection
                        // The key: how much does the virtual→actual sensor mapping spread?
                        
                        // Simple approximation: blur radius proportional to tilt angle and distance from axis
                        // This simulates the cone of virtual pixels that contribute to this actual pixel
                        // Scale factor tuned so blur is subtle at small angles
                        // At 10°, edge pixels (coord=1) at f/2.8 should have ~0.02 blur radius
                        float blurScaleFactor = 0.3; 
                        
                        // Tilt X creates Y-directional blur
                        float blurRadiusY = abs(u_filmTilt.x) * abs(coord.y) * blurScaleFactor / u_apertureFStop;
                        
                        // Tilt Y creates X-directional blur  
                        float blurRadiusX = abs(u_filmTilt.y) * abs(coord.x) * blurScaleFactor / u_apertureFStop;
                        
                        // Clamp to prevent extreme values
                        blurRadiusX = clamp(blurRadiusX, 0.0, 3.0);
                        blurRadiusY = clamp(blurRadiusY, 0.0, 3.0);
                        
                        // For this ACTUAL pixel, stochastically sample VIRTUAL sensor neighborhood
                        // This gathering approximates: "which virtual pixels would splat here?"
                        vec2 virtualJitter = vec2(
                            (random() - 0.5) * 2.0 * blurRadiusX,
                            (random() - 0.5) * 2.0 * blurRadiusY
                        );
                        
                        // Start from UNTILTED virtual sensor, then apply jitter
                        // (Virtual sensor is parallel to focal plane, not tilted)
                        vec2 virtualCoord = coord + virtualJitter;
                        vec3 virtualTargetPoint = forward + 
                                                  virtualCoord.x * viewportWidth * 0.5 * right + 
                                                  virtualCoord.y * viewportHeight * 0.5 * up;
                        
                        // Now apply the actual sensor tilt to get final target
                        // (This is where the distortion comes from)
                        vec3 jitteredTargetPoint = virtualTargetPoint;
                        
                        // Apply film tilt to the virtual target point
                        if (length(u_filmTilt) > 0.001) {
                            // Rotate around right axis (tilt X)
                            if (abs(u_filmTilt.x) > 0.001) {
                                float cosX = cos(u_filmTilt.x);
                                float sinX = sin(u_filmTilt.x);
                                vec3 localUp = jitteredTargetPoint - forward;
                                float upDist = dot(localUp, up);
                                float forwardDist = dot(localUp, forward);
                                float newUpDist = upDist * cosX - forwardDist * sinX;
                                float newForwardDist = upDist * sinX + forwardDist * cosX;
                                jitteredTargetPoint = forward + normalize(forward) * newForwardDist + up * newUpDist + right * dot(localUp, right);
                            }
                            
                            // Rotate around up axis (tilt Y)
                            if (abs(u_filmTilt.y) > 0.001) {
                                float cosY = cos(u_filmTilt.y);
                                float sinY = sin(u_filmTilt.y);
                                vec3 localRight = jitteredTargetPoint - forward;
                                float rightDist = dot(localRight, right);
                                float forwardDist = dot(localRight, forward);
                                float newRightDist = rightDist * cosY - forwardDist * sinY;
                                float newForwardDist = rightDist * sinY + forwardDist * cosY;
                                jitteredTargetPoint = forward + normalize(forward) * newForwardDist + right * newRightDist + up * dot(localRight, up);
                            }
                        }
                        
                        // Focus point for jittered pixel
                        // This is where the ray from this jittered position through aperture center hits the focal plane
                        vec3 virtualFocusDir = normalize(jitteredTargetPoint);
                        
                        // Find focus point on focal plane (perpendicular to aperture normal)
                        vec3 focalPlaneCenter = apertureCenter + apertureNormal * u_focusDistance;
                        float denom = dot(virtualFocusDir, apertureNormal);
                        if (abs(denom) > 0.0001) {
                            vec3 toPlane = focalPlaneCenter - ray.origin;
                            float t = dot(toPlane, apertureNormal) / denom;
                            focusPoint = ray.origin + virtualFocusDir * max(t, 0.1);
                        } else {
                            focusPoint = ray.origin + virtualFocusDir * u_focusDistance;
                        }
                        
                        // Now trace ray: lens point → focus point
                        // This ray will hit scene at correct position
                        // But it will also hit the ACTUAL tilted sensor at a different location
                        // The accumulation over frames/samples creates the blur effect
                        
                    } else if (u_enableNewTiltShift) {
                        // NEW TILT-SHIFT (Ray Tracing Gems II Ch.31)
                        // Define focal plane from 3 focus points, derive lens tilt from geometry
                        
                        // Transform focus points from world space to camera space
                        vec3 focusA_cam = vec3(
                            dot(u_focusPointA - u_cameraPos, right),
                            dot(u_focusPointA - u_cameraPos, up),
                            dot(u_focusPointA - u_cameraPos, forward)
                        );
                        vec3 focusB_cam = vec3(
                            dot(u_focusPointB - u_cameraPos, right),
                            dot(u_focusPointB - u_cameraPos, up),
                            dot(u_focusPointB - u_cameraPos, forward)
                        );
                        vec3 focusC_cam = vec3(
                            dot(u_focusPointC - u_cameraPos, right),
                            dot(u_focusPointC - u_cameraPos, up),
                            dot(u_focusPointC - u_cameraPos, forward)
                        );
                        
                        // Calculate focal plane normal from 3 points (in camera space)
                        vec3 vecAB = focusB_cam - focusA_cam;
                        vec3 vecAC = focusC_cam - focusA_cam;
                        vec3 focalPlaneNormal = normalize(cross(vecAB, vecAC));
                        
                        // Ensure normal points toward camera (camera is at origin in camera space)
                        // For consistent tilt calculation on both sides
                        if (dot(focalPlaneNormal, -focusA_cam) < 0.0) {
                            focalPlaneNormal = -focalPlaneNormal;
                        }
                        
                        // Calculate lens tilt vector from Scheimpflug geometry (use camera space points)
                        vec3 tilt = vec3(0.0);
                        
                        if (abs(focalPlaneNormal.x) > abs(focalPlaneNormal.y)) {
                            tilt.x = (focusA_cam.z - focusB_cam.z) * focalLengthM /
                                (focusA_cam.z * focusB_cam.x - focusB_cam.z * focusA_cam.x +
                                 (focusA_cam.z * focusB_cam.y - focusB_cam.z * focusA_cam.y) *
                                 focalPlaneNormal.y / focalPlaneNormal.x);
                            tilt.y = tilt.x * focalPlaneNormal.y / focalPlaneNormal.x;
                        } else if (abs(focalPlaneNormal.y) > 0.0) {
                            tilt.y = (focusA_cam.z - focusB_cam.z) * focalLengthM /
                                (focusA_cam.z * focusB_cam.y - focusB_cam.z * focusA_cam.y +
                                 (focusA_cam.z * focusB_cam.x - focusB_cam.z * focusA_cam.x) *
                                 focalPlaneNormal.x / focalPlaneNormal.y);
                            tilt.x = tilt.y * focalPlaneNormal.x / focalPlaneNormal.y;
                        }
                        
                        tilt.z = sqrt(max(0.0, 1.0 - tilt.x * tilt.x - tilt.y * tilt.y));
                        
                        // Build orthonormal basis for tilted lens
                        vec3 basis_u = normalize(cross(tilt,
                            abs(tilt.x) > abs(tilt.y) ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
                        vec3 basis_v = cross(tilt, basis_u);
                        
                        // Resample lens point using tilted basis (Ray Tracing Gems II method)
                        float theta = 6.28318531 * random();
                        float r = 0.5 * apertureRadius * sqrt(random());
                        vec3 tilted_lens = (cos(theta) * basis_u + sin(theta) * basis_v) * r;
                        lensPoint = apertureCenter + tilted_lens;
                        
                        // SIMPLIFIED: Intersect viewing ray with focal plane (in WORLD space)
                        // The focal plane passes through the 3 focus points (world space)
                        
                        // World space plane equation
                        vec3 vecAB_world = u_focusPointB - u_focusPointA;
                        vec3 vecAC_world = u_focusPointC - u_focusPointA;
                        vec3 planeNormal_world = normalize(cross(vecAB_world, vecAC_world));
                        
                        // Ensure normal points toward camera (for consistent behavior on both sides)
                        vec3 planeToCamera = u_cameraPos - u_focusPointA;
                        if (dot(planeNormal_world, planeToCamera) < 0.0) {
                            planeNormal_world = -planeNormal_world;
                        }
                        
                        vec3 planePoint_world = u_focusPointA;
                        
                        // Ray from camera through sensor point (world space)
                        vec3 rayDir = normalize(targetPoint);
                        
                        // Intersect ray with focal plane (double-sided: accept from both sides)
                        float denom = dot(rayDir, planeNormal_world);
                        float absDenom = abs(denom);
                        
                        if (absDenom > 0.0001) {
                            // Use absolute value to handle both sides consistently
                            float numerator = dot(planePoint_world - ray.origin, planeNormal_world);
                            float t = numerator / denom;  // Keep signed for proper direction
                            
                            // For double-sided plane: accept virtually any positive intersection
                            // Extremely permissive range to avoid ANY visible boundaries
                            if (t > 0.00001 && t < 10000.0) {
                                // Focus point is where ray hits the focal plane (world space)
                                focusPoint = ray.origin + rayDir * t;
                            } else {
                                // Fallback only for extreme cases (behind camera or absurdly far)
                                // Still use ray direction to maintain spatial variation
                                focusPoint = ray.origin + rayDir * clamp(abs(t), u_focusDistance * 0.5, u_focusDistance * 2.0);
                            }
                        } else {
                            // Ray nearly parallel to plane: extend in ray direction
                            // Use focus distance as reference but avoid hard boundary
                            focusPoint = ray.origin + rayDir * u_focusDistance;
                        }
                        
                    } else {
                        // Standard mode: focus point along viewing direction at focus distance
                        focusPoint = ray.origin + normalize(targetPoint) * u_focusDistance;
                    }
                    
                    // Generate ray from lens sample point toward focus point
                    ray.origin = lensPoint;
                    ray.direction = normalize(focusPoint - lensPoint);
                } else {
                    ray.direction = normalize(targetPoint);
                }
            }
            
            return ray;
        }
        
        void main() {
            initRandom(v_uv, u_frame, u_time);
            
            // Generate random value for wavelength selection
            float rnd = random();
            
            // Continuous wavelength (0-1 range)
            float wavelength = mix(0.5, rnd, float(u_enableChromaticAberration));
            
            // Apply spectral filter (only show wavelengths in range)
            float inRange = step(u_spectralFilterMin, wavelength) * step(wavelength, u_spectralFilterMax);
            
            // Trace ray
            Ray ray = generateRay(v_uv, wavelength);
            vec3 result = trace(ray);
            
            // Off-Axis Holography - real-time hologram with fringes
            if (u_enableOffAxisHolography) {
                // Get first hit distance for direct path
                Hit firstHit = intersectScene(ray);
                
                if (firstHit.hit) {
                    float directPathLength = firstHit.t;
                    vec2 normalizedPos = v_uv * 2.0 - 1.0;
                    
                    // Object wave phase encodes depth
                    float objectPhase = (2.0 * PI * directPathLength / 5.0); // 5m wrapping
                    
                    // Reference wave carrier
                    float carrierPhase = 2.0 * PI * u_offAxisCarrierFreq * normalizedPos.x;
                    
                    // RAW HOLOGRAM: interference fringes
                    float objectIntensity = length(result) / sqrt(3.0);
                    float referenceIntensity = 0.8;
                    
                    float combinedPhase = objectPhase + carrierPhase;
                    float interference = 2.0 * sqrt(objectIntensity * referenceIntensity) * cos(combinedPhase);
                    
                    float hologramIntensity = objectIntensity + referenceIntensity + interference;
                    hologramIntensity = hologramIntensity / (2.0 * (sqrt(objectIntensity * referenceIntensity) + referenceIntensity));
                    hologramIntensity = clamp(hologramIntensity, 0.0, 1.0);
                    
                    result = vec3(hologramIntensity);
                }
            }
            
            // Ground Truth Depth Reference (for comparison with reconstruction methods)
            if (u_showDepthReference) {
                // Get first hit distance for ground truth
                Hit firstHit = intersectScene(ray);
                
                if (firstHit.hit) {
                    float depth = firstHit.t;
                    
                    // Normalize depth (0-20m range)
                    float normalizedDepth = clamp(depth / 20.0, 0.0, 1.0);
                    
                    // Color-code depth: blue=close, cyan=mid, red=far
                    vec3 depthColor;
                    if (normalizedDepth < 0.5) {
                        depthColor = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), normalizedDepth * 2.0);
                    } else {
                        depthColor = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.0, 0.0), (normalizedDepth - 0.5) * 2.0);
                    }
                    
                    // Pure ground truth depth (no scene info)
                    result = depthColor;
                } else {
                    // No hit - show black
                    result = vec3(0.0);
                }
            }
            
            // Channel separation/contribution
            vec3 color;
            float caEnabled = float(u_enableChromaticAberration);
            
            if (u_chromaticAberrationMode == 1) {
                // SPECTRUM MODE: continuous rainbow dispersion
                // Sample one wavelength and contribute its spectral color
                vec3 spectralColor = wavelengthToRGB(wavelength);
                
                // Extract appropriate color component from result based on wavelength
                // This preserves material color while showing spectral dispersion
                float useR = step(wavelength, 0.33);
                float useG = step(0.33, wavelength) * (1.0 - step(0.67, wavelength));
                float useB = step(0.67, wavelength);
                float sampleIntensity = result.r * useR + result.g * useG + result.b * useB;
                
                // Contribute spectral color weighted by sampled intensity
                color = spectralColor * sampleIntensity * inRange;
            } else {
                // RGB MODE: discrete R, G, B channels
                // Determine which channel this sample belongs to
                float r = step(rnd, 0.333) * float(u_showRedChannel);
                float g = step(0.333, rnd) * (1.0 - step(0.666, rnd)) * float(u_showGreenChannel);
                float b = step(0.666, rnd) * float(u_showBlueChannel);
                
                // Build channel mask (3.0 to compensate for 1/3 sampling)
                vec3 channelMask = vec3(r, g, b) * 3.0 * caEnabled + vec3(1.0) * (1.0 - caEnabled);
                
                // Apply mask
                color = result * channelMask;
            }
            
            // Clamp to prevent NaN/Inf
            color = clamp(color, vec3(0.0), vec3(100.0));
            
            // Progressive accumulation or temporal blending (STAY in LINEAR space)
            vec3 accumulatedColor = color;
            if (u_frame > 0.0) {
                vec3 prevColor = texture(u_accumTexture, v_uv).rgb;
                
                // Use temporal blending during autofocus (frame stays at 0)
                // Use standard accumulation otherwise
                if (u_frame < 1.5) {
                    // Temporal blending mode (frame is 0 or fractional)
                    float blendFactor = fract(u_frame); // Use fractional part as blend factor
                    if (blendFactor < 0.01) blendFactor = 0.3; // Default blend
                    accumulatedColor = prevColor * (1.0 - blendFactor) + color * blendFactor;
                } else {
                    // Standard accumulation
                    float weight = 1.0 / (u_frame + 1.0);
                    accumulatedColor = prevColor * (1.0 - weight) + color * weight;
                }
            }
            
            // ALWAYS store the clean accumulated color (no lens CA!)
            // This prevents feedback loop
            fragColor = vec4(accumulatedColor, 1.0);
        }`;
        
        // Compile shaders with timing
        this.updateLoadingStatus('Compiling fragment shader (this may take a moment)...');
        const compileStartTime = performance.now();
        this.program = this.createProgram(vsSource, fsSource);
        const compileEndTime = performance.now();
        const compilationTime = ((compileEndTime - compileStartTime) / 1000).toFixed(2);
        
        if (!this.program) {
            console.error('Failed to create shader program!');
            return;
        }
        
        console.log(`✅ Shader compilation complete, took ${compilationTime} seconds`);
        this.showCompilationNotification(compilationTime);
        this.updateLoadingStatus('Loading uniform locations...');
        
        // Create fullscreen quad
        const positions = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1
        ]);
        
        const posBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        
        const posLoc = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        
        // Create framebuffer and textures for accumulation
        this.accumTexture = this.createTexture(1, 1);
        this.framebuffer = gl.createFramebuffer();
        
        // Get uniform locations
        this.uniforms = {};
        const uniformNames = [
            'u_resolution', 'u_time', 'u_frame', 'u_accumTexture',
            // 'u_supersample', 'u_reconstructionKernel', // Disabled for now
            'u_cameraPos', 'u_cameraLookAt', 'u_focalLength', 'u_focusDistance', 'u_apertureFStop', 'u_cameraType',
            'u_visualizeFocus', 'u_focusVisMode', 'u_focusTolerance', 'u_scheimpflugTolerance', 'u_enableVPT', 'u_minBounces', 'u_bounceRange', 'u_vptMaxBounces',
            'u_distortionType', 'u_distortionAmount', 'u_apertureShape', 'u_apertureBlades',
            'u_apertureShift', 'u_apertureTilt',
            'u_filmSize', 'u_filmTilt', 'u_filmShift', 'u_filmCurvature', 'u_enableTiltShift', 'u_sensorOffset',
            'u_enableNewTiltShift', 'u_focusPointA', 'u_focusPointB', 'u_focusPointC',
            'u_showFocusPoints', 'u_showFocusAxes', 'u_showFocusTriangle', 'u_hoveredGizmo',
            'u_enableChromaticAberration', 'u_chromaticAberrationMode', 'u_chromaticAberration', 
            'u_showRedChannel', 'u_showGreenChannel', 'u_showBlueChannel',
            'u_spectralFilterMin', 'u_spectralFilterMax',
            'u_enableLensCA', 'u_lensCAMode', 'u_lensCAStrength',
            'u_enableTOF', 'u_tofMinDistance', 'u_tofRange',
            'u_enableCWToF', 'u_cwTofModulationFreq', 'u_cwTofPhaseOffset', 'u_cwTofWavelength',
            'u_cwTofShowInterference', 'u_cwTofShowDepth',
            'u_enableOffAxisHolography', 'u_offAxisReferenceAngle', 'u_offAxisWavelength', 'u_offAxisCarrierFreq',
            'u_enablePlanarWaveLight', 'u_planarWaveLightDistance', 'u_planarWaveLightSize', 
            'u_planarWaveLightIntensity', 'u_planarWaveCarrierFreq', 'u_planarWaveTiltAngle', 'u_disableSceneLights',
            'u_enableReferenceWave', 'u_referenceWaveIntensity', 'u_referenceWaveFrequency', 'u_referenceWavePhase', 'u_referenceWaveColorMode',
            'u_showDepthReference',
            'u_enableEnvironmentFog', 'u_fogDensity', 'u_fogAlbedo', 'u_fogAnisotropy',
            'u_numSpheres', 'u_spheres', 'u_sphereMats', 'u_sphereEmission', 'u_sphereVolume', 'u_sphereTexture',
            'u_groundPattern', 'u_groundPatternScale'
        ];
        
        for (const name of uniformNames) {
            this.uniforms[name] = gl.getUniformLocation(this.program, name);
            if (this.uniforms[name] === null) {
                console.warn(`Uniform '${name}' not found in shader`);
            }
        }
        
        console.log('WebGL initialization complete');
        this.updateLoadingStatus('Initialization complete!');
    }
    
    createProgram(vsSource, fsSource) {
        const gl = this.gl;
        
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsSource);
        gl.compileShader(vs);
        
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.error('VS compile error:', gl.getShaderInfoLog(vs));
            return null;
        }
        
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsSource);
        gl.compileShader(fs);
        
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            const errorLog = gl.getShaderInfoLog(fs);
            console.error('FS compile error:', errorLog);
            
            // Show detailed error with line numbers
            const lines = errorLog.split('\n');
            console.error('Detailed shader errors:');
            lines.forEach(line => {
                if (line.trim()) console.error('  ', line);
            });
            
            // Show shader source with line numbers around error
            const sourceLines = fsSource.split('\n');
            console.error('\nShader source (first 50 lines):');
            for (let i = 0; i < Math.min(50, sourceLines.length); i++) {
                console.error(`${(i+1).toString().padStart(4, ' ')}: ${sourceLines[i]}`);
            }
            
            alert('Shader compilation failed! Check console for details.');
            return null;
        }
        
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(program));
            return null;
        }
        
        return program;
    }
    
    createTexture(width, height) {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        
        // Use RGBA16F if RGBA32F not supported
        const internalFormat = this.useFloat16 ? gl.RGBA16F : gl.RGBA32F;
        const type = this.useFloat16 ? gl.HALF_FLOAT : gl.FLOAT;
        
        console.log(`Creating texture ${width}x${height}, format:`, internalFormat === gl.RGBA32F ? 'RGBA32F' : 'RGBA16F');
        
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
    }
    
    resize() {
        if (!this.gl) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.width = width;
        this.height = height;
        
        const gl = this.gl;
        gl.viewport(0, 0, width, height);
        
        // Recreate accumulation textures
        if (this.accumTexture) {
            gl.deleteTexture(this.accumTexture);
        }
        if (this.tempTexture) {
            gl.deleteTexture(this.tempTexture);
            this.tempTexture = null;
        }
        
        this.accumTexture = this.createTexture(width, height);
        
        this.needsUpdate = true;
        this.frame = 0;
    }
    
    render() {
        if (!this.gl || !this.program) {
            console.error('Cannot render - GL or program missing');
            console.error('GL exists:', !!this.gl, 'Program exists:', !!this.program);
            return;
        }
        
        if (this.needsUpdate) {
            if (this.isAnimating || this.isAutofocusing) {
                // Don't reset frame counter for animation/autofocus - use temporal blending
                this.needsUpdate = false;
            } else {
                // Static scene - reset accumulation
                this.frame = 0;
                this.needsUpdate = false;
                this.frameHistory = []; // Clear history when scene changes
            }
        }
        
        // For animated scenes, always use frame 0 (no accumulation within frame)
        const effectiveFrame = this.isAnimating ? 0 : this.frame;
        
        const gl = this.gl;
        gl.useProgram(this.program);
        
        // Set uniforms
        gl.uniform2f(this.uniforms.u_resolution, this.width, this.height);
        gl.uniform1f(this.uniforms.u_time, performance.now() / 1000);
        gl.uniform1f(this.uniforms.u_frame, this.frame);
        
        // Supersampling disabled for now
        
        // Camera
        if (this.frame === 0) {
            console.log('Camera pos:', this.camera.position);
            console.log('Camera lookAt:', this.camera.lookAt);
            console.log('Camera type:', this.camera.type);
            console.log('Focal length:', this.camera.focalLength);
            console.log('F-stop:', this.camera.apertureFStop);
            
            // Calculate and log the forward direction
            const forward = [
                this.camera.lookAt[0] - this.camera.position[0],
                this.camera.lookAt[1] - this.camera.position[1],
                this.camera.lookAt[2] - this.camera.position[2]
            ];
            const len = Math.sqrt(forward[0]*forward[0] + forward[1]*forward[1] + forward[2]*forward[2]);
            forward[0] /= len; forward[1] /= len; forward[2] /= len;
            console.log('Forward direction:', forward);
        }
        
        gl.uniform3fv(this.uniforms.u_cameraPos, this.camera.position);
        gl.uniform3fv(this.uniforms.u_cameraLookAt, this.camera.lookAt);
        gl.uniform1f(this.uniforms.u_focalLength, this.camera.focalLength);
        gl.uniform1f(this.uniforms.u_focusDistance, this.camera.focusDistance);
        gl.uniform1f(this.uniforms.u_apertureFStop, this.camera.apertureFStop);
        gl.uniform1i(this.uniforms.u_cameraType, this.camera.type === 'pinhole' ? 0 : 1);
        gl.uniform1i(this.uniforms.u_visualizeFocus, this.visualizeFocus ? 1 : 0);
        gl.uniform1i(this.uniforms.u_focusVisMode, this.focusVisMode === 'inverted' ? 1 : 0);
        gl.uniform1f(this.uniforms.u_focusTolerance, this.focusTolerance);
        gl.uniform1f(this.uniforms.u_scheimpflugTolerance, this.scheimpflugTolerance);
        gl.uniform1i(this.uniforms.u_enableVPT, this.enableVPT ? 1 : 0);
        gl.uniform1i(this.uniforms.u_minBounces, this.minBounces);
        gl.uniform1i(this.uniforms.u_bounceRange, this.bounceRange);
        gl.uniform1i(this.uniforms.u_vptMaxBounces, this.vptMaxBounces);
        
        // Lens distortion
        const distortionTypeMap = { 'none': 0, 'barrel': 1, 'pincushion': 2, 'fisheye': 3 };
        gl.uniform1i(this.uniforms.u_distortionType, distortionTypeMap[this.camera.distortionType] || 0);
        gl.uniform1f(this.uniforms.u_distortionAmount, this.camera.distortionAmount);
        
        // Aperture shape and transforms
        const apertureShapeMap = { 
            'circular': 0, 'polygon': 1, 'hexagonal': 1, 'square': 2, 'star': 3,
            'ring': 4, 'diagonal': 5, 'coded': 6, 'pinhole-grid': 7,
            'heart': 8, 'cat': 9
        };
        gl.uniform1i(this.uniforms.u_apertureShape, apertureShapeMap[this.camera.apertureShape] || 0);
        gl.uniform1i(this.uniforms.u_apertureBlades, this.camera.apertureBlades);
        gl.uniform3f(this.uniforms.u_apertureShift,
            this.camera.apertureShiftX,
            this.camera.apertureShiftY,
            this.camera.apertureShiftZ);
        gl.uniform2f(this.uniforms.u_apertureTilt,
            this.camera.apertureTiltX * Math.PI / 180,
            this.camera.apertureTiltY * Math.PI / 180);
        
        // Film/sensor parameters
        gl.uniform1f(this.uniforms.u_filmSize, this.camera.filmSize);
        gl.uniform2f(this.uniforms.u_filmTilt, 
            this.camera.filmTiltX * Math.PI / 180, 
            this.camera.filmTiltY * Math.PI / 180);
        gl.uniform2f(this.uniforms.u_filmShift, 
            this.camera.filmShiftX, 
            this.camera.filmShiftY);
        gl.uniform1f(this.uniforms.u_filmCurvature, this.camera.filmCurvature);
        gl.uniform2f(this.uniforms.u_sensorOffset,
            this.camera.sensorOffsetX || 0.0,
            this.camera.sensorOffsetY || 0.0);
        gl.uniform1i(this.uniforms.u_enableTiltShift, this.camera.enableTiltShift ? 1 : 0);
        
        // New tilt-shift (Ray Tracing Gems II)
        gl.uniform1i(this.uniforms.u_enableNewTiltShift, this.camera.enableNewTiltShift ? 1 : 0);
        
        // Focus points are in WORLD space - pass directly to shader
        // Shader will transform them to camera space
        const focusA = this.camera.focusPointA || {x: 0.5, y: 0.3, z: 0.0};
        const focusB = this.camera.focusPointB || {x: -0.5, y: 0.3, z: 0.0};
        const focusC = this.camera.focusPointC || {x: 0.0, y: 0.3, z: 0.5};
        
        gl.uniform3f(this.uniforms.u_focusPointA, focusA.x, focusA.y, focusA.z);
        gl.uniform3f(this.uniforms.u_focusPointB, focusB.x, focusB.y, focusB.z);
        gl.uniform3f(this.uniforms.u_focusPointC, focusC.x, focusC.y, focusC.z);
        gl.uniform1i(this.uniforms.u_showFocusPoints, this.camera.showFocusPoints ? 1 : 0);
        gl.uniform1i(this.uniforms.u_showFocusAxes, this.camera.showFocusAxes ? 1 : 0);
        gl.uniform1i(this.uniforms.u_showFocusTriangle, this.camera.showFocusTriangle ? 1 : 0);
        
        // Hovered gizmo for glow effect
        // 0=none, 1-4=spheres, 5-7=axes, 8-10=circles
        let hoveredIdx = 0;
        if (this.camera.hoveredGizmo === 'pointA') hoveredIdx = 1;
        else if (this.camera.hoveredGizmo === 'pointB') hoveredIdx = 2;
        else if (this.camera.hoveredGizmo === 'pointC') hoveredIdx = 3;
        else if (this.camera.hoveredGizmo === 'center') hoveredIdx = 4;
        else if (this.camera.hoveredGizmo === 'axisX') hoveredIdx = 5;
        else if (this.camera.hoveredGizmo === 'axisY') hoveredIdx = 6;
        else if (this.camera.hoveredGizmo === 'axisZ') hoveredIdx = 7;
        else if (this.camera.hoveredGizmo === 'circleX') hoveredIdx = 8;
        else if (this.camera.hoveredGizmo === 'circleY') hoveredIdx = 9;
        else if (this.camera.hoveredGizmo === 'circleZ') hoveredIdx = 10;
        gl.uniform1i(this.uniforms.u_hoveredGizmo, hoveredIdx);
        
        // Chromatic aberration (scene glass)
        gl.uniform1i(this.uniforms.u_enableChromaticAberration, this.camera.enableChromaticAberration ? 1 : 0);
        gl.uniform1i(this.uniforms.u_chromaticAberrationMode, this.camera.chromaticAberrationMode === 'spectrum' ? 1 : 0);
        gl.uniform1f(this.uniforms.u_chromaticAberration, this.camera.chromaticAberration);
        gl.uniform1i(this.uniforms.u_showRedChannel, this.camera.showRedChannel ? 1 : 0);
        gl.uniform1i(this.uniforms.u_showGreenChannel, this.camera.showGreenChannel ? 1 : 0);
        gl.uniform1i(this.uniforms.u_showBlueChannel, this.camera.showBlueChannel ? 1 : 0);
        gl.uniform1f(this.uniforms.u_spectralFilterMin, this.camera.spectralFilterMin);
        gl.uniform1f(this.uniforms.u_spectralFilterMax, this.camera.spectralFilterMax);
        
        // Lens chromatic aberration
        gl.uniform1i(this.uniforms.u_enableLensCA, this.camera.enableLensChromaticAberration ? 1 : 0);
        gl.uniform1i(this.uniforms.u_lensCAMode, this.camera.lensChromaticAberrationMode === 'spectral' ? 1 : 0);
        gl.uniform1f(this.uniforms.u_lensCAStrength, this.camera.lensChromaticAberration);
        
        // Time-of-Flight (TOF) filtering
        gl.uniform1i(this.uniforms.u_enableTOF, this.camera.enableTOF ? 1 : 0);
        gl.uniform1f(this.uniforms.u_tofMinDistance, this.camera.tofMinDistance);
        gl.uniform1f(this.uniforms.u_tofRange, this.camera.tofRange);
        
        // Continuous Wave ToF (holographic depth sensing)
        gl.uniform1i(this.uniforms.u_enableCWToF, this.camera.enableCWToF ? 1 : 0);
        gl.uniform1f(this.uniforms.u_cwTofModulationFreq, this.camera.cwTofModulationFreq);
        gl.uniform1f(this.uniforms.u_cwTofPhaseOffset, this.camera.cwTofPhaseOffset * Math.PI / 180); // Convert to radians
        gl.uniform1f(this.uniforms.u_cwTofWavelength, this.camera.cwTofWavelength);
        gl.uniform1i(this.uniforms.u_cwTofShowInterference, this.camera.cwTofShowInterference ? 1 : 0);
        gl.uniform1i(this.uniforms.u_cwTofShowDepth, this.camera.cwTofShowDepth ? 1 : 0);
        
        // Off-Axis Holography (spatial phase encoding)
        gl.uniform1i(this.uniforms.u_enableOffAxisHolography, this.camera.enableOffAxisHolography ? 1 : 0);
        gl.uniform1f(this.uniforms.u_offAxisReferenceAngle, this.camera.offAxisReferenceAngle * Math.PI / 180); // Convert to radians
        gl.uniform1f(this.uniforms.u_offAxisWavelength, this.camera.offAxisWavelength);
        gl.uniform1f(this.uniforms.u_offAxisCarrierFreq, this.camera.offAxisCarrierFreq);
        
        // Planar wave light source
        gl.uniform1i(this.uniforms.u_enablePlanarWaveLight, this.camera.enablePlanarWaveLight ? 1 : 0);
        gl.uniform1f(this.uniforms.u_planarWaveLightDistance, this.camera.planarWaveLightDistance);
        gl.uniform1f(this.uniforms.u_planarWaveLightSize, this.camera.planarWaveLightSize);
        gl.uniform1f(this.uniforms.u_planarWaveLightIntensity, this.camera.planarWaveLightIntensity);
        gl.uniform1f(this.uniforms.u_planarWaveCarrierFreq, this.camera.planarWaveCarrierFreq);
        gl.uniform1f(this.uniforms.u_planarWaveTiltAngle, this.camera.planarWaveTiltAngle * Math.PI / 180); // Convert to radians
        gl.uniform1i(this.uniforms.u_disableSceneLights, this.camera.disableSceneLights ? 1 : 0);
        
        // Reference wave
        gl.uniform1i(this.uniforms.u_enableReferenceWave, this.camera.enableReferenceWave ? 1 : 0);
        gl.uniform1f(this.uniforms.u_referenceWaveIntensity, this.camera.referenceWaveIntensity);
        gl.uniform1f(this.uniforms.u_referenceWaveFrequency, this.camera.referenceWaveFrequency);
        gl.uniform1f(this.uniforms.u_referenceWavePhase, this.camera.referenceWavePhase * Math.PI / 180); // Convert to radians
        gl.uniform1i(this.uniforms.u_referenceWaveColorMode, this.camera.referenceWaveColorMode ? 1 : 0);
        
        // Ground truth depth reference
        gl.uniform1i(this.uniforms.u_showDepthReference, this.camera.showDepthReference ? 1 : 0);
        
        // Environment fog (participating media)
        gl.uniform1i(this.uniforms.u_enableEnvironmentFog, this.camera.enableEnvironmentFog ? 1 : 0);
        gl.uniform1f(this.uniforms.u_fogDensity, this.camera.fogDensity);
        gl.uniform3f(this.uniforms.u_fogAlbedo, 
            this.camera.fogAlbedo[0], 
            this.camera.fogAlbedo[1], 
            this.camera.fogAlbedo[2]);
        gl.uniform1f(this.uniforms.u_fogAnisotropy, this.camera.fogAnisotropy);
        
        // Scene
        const spheres = this.scene.spheres || [];
        const numSpheres = Math.min(spheres.length, 32);
        
        if (this.frame === 0) {
            console.log(`Rendering ${numSpheres} spheres`);
        }
        
        gl.uniform1i(this.uniforms.u_numSpheres, numSpheres);
        
        // Always send full arrays (32 spheres worth) to avoid INVALID_VALUE errors
        const sphereData = new Float32Array(32 * 4); // 32 spheres, 4 floats each
        const matData = new Float32Array(32 * 4);
        const emissionData = new Float32Array(32 * 4);
        const volumeData = new Float32Array(32 * 4);
        const textureData = new Float32Array(32 * 4);
        
        for (let i = 0; i < numSpheres; i++) {
            const s = spheres[i];
            sphereData[i * 4 + 0] = s.center[0];
            sphereData[i * 4 + 1] = s.center[1];
            sphereData[i * 4 + 2] = s.center[2];
            sphereData[i * 4 + 3] = s.radius;
            
            // Material type mapping
            let matType = 0;
            if (s.material.type === 'metal') matType = 1;
            else if (s.material.type === 'glass') matType = 2;
            else if (s.material.type === 'mirror') matType = 3;
            else if (s.material.type === 'emissive') matType = 4;
            else if (s.material.type === 'volumetric') matType = 5;
            else if (s.material.type === 'glossy') matType = 6;
            
            matData[i * 4 + 0] = s.material.albedo ? s.material.albedo[0] : 1;
            matData[i * 4 + 1] = s.material.albedo ? s.material.albedo[1] : 1;
            matData[i * 4 + 2] = s.material.albedo ? s.material.albedo[2] : 1;
            matData[i * 4 + 3] = matType;
            
            emissionData[i * 4 + 0] = s.material.emission ? s.material.emission[0] : 0;
            emissionData[i * 4 + 1] = s.material.emission ? s.material.emission[1] : 0;
            emissionData[i * 4 + 2] = s.material.emission ? s.material.emission[2] : 0;
            emissionData[i * 4 + 3] = 1;
            
            // For non-emissive materials, reuse emission for special effects
            // Surreal materials override everything (highest priority)
            if (s.material.surreal) {
                // Store surreal parameters in emission
                emissionData[i * 4 + 0] = 2000.0 + (s.material.surrealType || 0.0); // 2000+ = surreal marker
                emissionData[i * 4 + 1] = s.material.surrealParam1 || 0.0;
                emissionData[i * 4 + 2] = s.material.surrealParam2 || 0.0;
                emissionData[i * 4 + 3] = 3; // Surreal marker in alpha
            }
            // Animated materials override this
            else if (s.material.animated) {
                // Store animation parameters in emission
                emissionData[i * 4 + 0] = 1000.0 + (s.material.animType || 0.0); // 1000+ = animated marker
                emissionData[i * 4 + 1] = s.material.animSpeed || 1.0; // Animation speed
                emissionData[i * 4 + 2] = s.material.tripleLayer || 0.0; // Extra flags
                emissionData[i * 4 + 3] = 2; // Animated marker in alpha
            } else if (!s.material.emission || s.material.emission.every(v => v === 0)) {
                // Velvet/Fluffy parameters (retroreflective sheen)
                if (s.material.velvet || s.material.fluffy) {
                    emissionData[i * 4 + 0] = s.material.velvet || s.material.fluffy || 0.0; // Strength
                    emissionData[i * 4 + 1] = s.material.velvetFalloff || s.material.fluffyFalloff || 3.0; // Falloff exponent
                    emissionData[i * 4 + 2] = s.material.fluffyNoise || 0.0; // Noise amount for fluffy
                }
                // Iridescence/Pearl parameters (thin-film interference)
                if (s.material.iridescence || s.material.pearl) {
                    emissionData[i * 4 + 0] = -(s.material.iridescence || s.material.pearl || 0.0); // Negative = effect
                    emissionData[i * 4 + 1] = s.material.iridescenceIOR || 1.4; // Film IOR
                    emissionData[i * 4 + 2] = s.material.iridescenceThickness || 400.0; // Thickness in nm
                }
            }
            
            // Volumetric/Roughness/Anisotropy/SSS/Absorption data
            // For volumetric materials: density
            // For SSS materials: negative scatter distance
            // For glass with absorption: positive absorption coefficient
            // For passthrough split: marker value 999.0
            if (s.material.passthroughSplit) {
                volumeData[i * 4 + 0] = 999.0; // Marker for passthrough split material
            } else if (s.material.type === 'volumetric') {
                volumeData[i * 4 + 0] = s.material.density || 0.0;
            } else if (s.material.sss) {
                // SSS: reuse density slot for scatter distance
                volumeData[i * 4 + 0] = -(s.material.scatterDistance || 0.1); // Negative = SSS mode
            } else if (s.material.type === 'glass' && s.material.absorption) {
                // Glass with Beer's law absorption
                volumeData[i * 4 + 0] = s.material.absorption || 0.0; // Positive = absorption
            } else {
                volumeData[i * 4 + 0] = 0.0;
            }
            
            volumeData[i * 4 + 1] = s.material.roughness || 0.0; // For glossy materials
            volumeData[i * 4 + 2] = s.material.anisotropy || 0.0; // Anisotropy strength (0-1)
            volumeData[i * 4 + 3] = s.material.anisotropyRotation || 0.0; // Rotation angle in degrees
            
            // Texture data: 0=none, 1=checkerboard, 2=fbm, 6=mokuti
            let texType = 0;
            if (s.material.texture === 'checkerboard') texType = 1;
            else if (s.material.texture === 'fbm') texType = 2;
            else if (s.material.texture === 'mokuti') texType = 6;
            textureData[i * 4 + 0] = texType;
            
            // Clear coat OR SSS OR Hair OR Pearl OR Variable Coat parameters (mutually exclusive)
            if (s.material.clearcoat) {
                // Clear coat parameters (for car paint or variable coat)
                textureData[i * 4 + 1] = s.material.clearcoat || 0.0; // Clear coat strength (0-1)
                textureData[i * 4 + 2] = s.material.clearcoatRoughness || 0.0; // Clear coat roughness
                // Variable coat uses negative IOR as marker: -variableCoatType
                if (s.material.variableCoat) {
                    textureData[i * 4 + 3] = -(s.material.variableCoat || 1.0); // Negative = variable coat marker
                } else {
                    textureData[i * 4 + 3] = s.material.clearcoatIOR || 1.5; // Clear coat IOR
                }
            } else if (s.material.sss) {
                // SSS parameters
                textureData[i * 4 + 1] = s.material.sss || 0.0; // SSS strength
                textureData[i * 4 + 2] = s.material.scatterDensity || 5.0; // Scatter density
                textureData[i * 4 + 3] = -1.0; // Negative IOR = SSS marker
            } else if (s.material.hair) {
                // Hair parameters (dual specular lobes)
                textureData[i * 4 + 1] = s.material.hairShift || 0.05; // Lobe shift
                textureData[i * 4 + 2] = s.material.hairRoughness2 || 0.5; // Second lobe roughness
                textureData[i * 4 + 3] = 100.0; // IOR > 10 = hair marker
            } else if (s.material.pearl) {
                // Pearl parameters (iridescence with noise)
                textureData[i * 4 + 1] = s.material.pearlDepth || 0.05; // Noise depth
                textureData[i * 4 + 2] = 0.0;
                textureData[i * 4 + 3] = s.material.pearlIOR || 1.6; // IOR for pearl
            } else {
                textureData[i * 4 + 1] = 0.0;
                textureData[i * 4 + 2] = 0.0;
                textureData[i * 4 + 3] = 1.5; // Default IOR
            }
        }
        
        gl.uniform4fv(this.uniforms.u_spheres, sphereData);
        gl.uniform4fv(this.uniforms.u_sphereMats, matData);
        gl.uniform4fv(this.uniforms.u_sphereEmission, emissionData);
        gl.uniform4fv(this.uniforms.u_sphereVolume, volumeData);
        gl.uniform4fv(this.uniforms.u_sphereTexture, textureData);
        
        // Ground pattern
        gl.uniform1f(this.uniforms.u_groundPattern, this.scene.groundPattern);
        gl.uniform1f(this.uniforms.u_groundPatternScale, this.scene.groundPatternScale);
        
        // Create temp texture for new frame
        if (!this.tempTexture) {
            this.tempTexture = this.createTexture(this.width, this.height);
        }
        
        // Render to temp texture (NOT to accumTexture to avoid feedback loop)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tempTexture, 0);
        
        // Check framebuffer completeness
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error('Framebuffer incomplete:', status);
            return;
        }
        
        // NOW bind accumTexture for READING (feedback loop avoided)
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.accumTexture);
        gl.uniform1i(this.uniforms.u_accumTexture, 0);
        
        // Render (reads from accumTexture, writes to tempTexture)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // Swap textures (temp becomes new accum)
        const temp = this.accumTexture;
        this.accumTexture = this.tempTexture;
        this.tempTexture = temp;
        
        // Handle temporal averaging for animated scenes
        let displayTexture = this.accumTexture;
        
        if (this.isAnimating && this.samplesPerPixel > 1) {
            // Copy current frame to history
            if (!this.frameHistory[0]) {
                // Initialize history textures
                for (let i = 0; i < this.maxFrameHistory; i++) {
                    this.frameHistory[i] = this.createTexture(this.width, this.height);
                }
            }
            
            // Rotate history: move all frames back by one
            const oldestFrame = this.frameHistory[this.samplesPerPixel - 1] || this.frameHistory[this.frameHistory.length - 1];
            for (let i = Math.min(this.samplesPerPixel - 1, this.frameHistory.length - 1); i > 0; i--) {
                this.frameHistory[i] = this.frameHistory[i - 1];
            }
            
            // Copy current frame to history[0]
            this.frameHistory[0] = oldestFrame;
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.frameHistory[0], 0);
            gl.bindTexture(gl.TEXTURE_2D, this.accumTexture);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            
            // Average the last N frames
            if (!this.tempAverageTexture) {
                this.tempAverageTexture = this.createTexture(this.width, this.height);
            }
            displayTexture = this.averageFrames(Math.min(this.samplesPerPixel, this.frameHistory.length));
        }
        
        // Render accumulated result to screen with gamma correction
        if (!this.displayProgram) {
            this.createDisplayProgram();
        }
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(this.displayProgram);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, displayTexture);
        gl.uniform1i(this.displayUniforms.u_texture, 0);
        
        // Lens chromatic aberration (post-process) - only when mode is 'postprocess'
        const enablePostProcessCA = this.camera.enableLensChromaticAberration && 
                                     this.camera.lensChromaticAberrationMode === 'postprocess';
        gl.uniform1i(this.displayUniforms.u_enableLensCA, enablePostProcessCA ? 1 : 0);
        gl.uniform1f(this.displayUniforms.u_lensCAStrength, this.camera.lensChromaticAberration);
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        if (!this.isAnimating) {
            if (this.isAutofocusing) {
                // Keep frame at blend factor during autofocus (temporal blending)
                this.frame = this.autofocusBlendFactor;
            } else {
                // Normal accumulation
                this.frame++;
            }
        }
    }
    
    createDisplayProgram() {
        const gl = this.gl;
        
        const vsSource = `#version 300 es
        in vec2 a_position;
        out vec2 v_uv;
        void main() {
            v_uv = a_position * 0.5 + 0.5;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }`;
        
        const fsSource = `#version 300 es
        precision highp float;
        in vec2 v_uv;
        out vec4 fragColor;
        uniform sampler2D u_texture;
        uniform bool u_enableLensCA;
        uniform float u_lensCAStrength;
        
        void main() {
            vec3 color;
            
            if (u_enableLensCA) {
                // Lens chromatic aberration - radial color fringing
                vec2 dir = v_uv - vec2(0.5);
                float dist = length(dir);
                vec2 offset = normalize(dir) * u_lensCAStrength * 0.01 * (dist * dist + 0.2);
                
                // Blue (high IOR) shifts outward, Red (low IOR) shifts inward
                vec2 uvR = clamp(v_uv - offset * 1.0, vec2(0.0), vec2(1.0));
                vec2 uvG = v_uv;
                vec2 uvB = clamp(v_uv + offset * 1.5, vec2(0.0), vec2(1.0));
                
                color = vec3(
                    texture(u_texture, uvR).r,
                    texture(u_texture, uvG).g,
                    texture(u_texture, uvB).b
                );
            } else {
                color = texture(u_texture, v_uv).rgb;
            }
            
            // Apply gamma correction for display
            color = pow(color, vec3(1.0 / 2.2));
            fragColor = vec4(color, 1.0);
        }`;
        
        this.displayProgram = this.createProgram(vsSource, fsSource);
        
        // Set up position attribute for display program
        const posLoc = gl.getAttribLocation(this.displayProgram, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        
        this.displayUniforms = {
            u_texture: gl.getUniformLocation(this.displayProgram, 'u_texture'),
            u_enableLensCA: gl.getUniformLocation(this.displayProgram, 'u_enableLensCA'),
            u_lensCAStrength: gl.getUniformLocation(this.displayProgram, 'u_lensCAStrength')
        };
    }
    
    averageFrames(numFrames) {
        const gl = this.gl;
        
        // Create averaging shader if it doesn't exist
        if (!this.averageProgram) {
            const vsSource = `#version 300 es
            in vec2 a_position;
            out vec2 v_uv;
            void main() {
                v_uv = a_position * 0.5 + 0.5;
                gl_Position = vec4(a_position, 0.0, 1.0);
            }`;
            
            const fsSource = `#version 300 es
            precision highp float;
            in vec2 v_uv;
            out vec4 fragColor;
            uniform sampler2D u_frame0, u_frame1, u_frame2, u_frame3;
            uniform sampler2D u_frame4, u_frame5, u_frame6, u_frame7;
            uniform sampler2D u_frame8, u_frame9, u_frame10, u_frame11;
            uniform sampler2D u_frame12, u_frame13, u_frame14, u_frame15;
            uniform int u_numFrames;
            
            void main() {
                vec3 sum = vec3(0.0);
                
                // Manually sample each texture based on numFrames
                if (u_numFrames > 0) sum += texture(u_frame0, v_uv).rgb;
                if (u_numFrames > 1) sum += texture(u_frame1, v_uv).rgb;
                if (u_numFrames > 2) sum += texture(u_frame2, v_uv).rgb;
                if (u_numFrames > 3) sum += texture(u_frame3, v_uv).rgb;
                if (u_numFrames > 4) sum += texture(u_frame4, v_uv).rgb;
                if (u_numFrames > 5) sum += texture(u_frame5, v_uv).rgb;
                if (u_numFrames > 6) sum += texture(u_frame6, v_uv).rgb;
                if (u_numFrames > 7) sum += texture(u_frame7, v_uv).rgb;
                if (u_numFrames > 8) sum += texture(u_frame8, v_uv).rgb;
                if (u_numFrames > 9) sum += texture(u_frame9, v_uv).rgb;
                if (u_numFrames > 10) sum += texture(u_frame10, v_uv).rgb;
                if (u_numFrames > 11) sum += texture(u_frame11, v_uv).rgb;
                if (u_numFrames > 12) sum += texture(u_frame12, v_uv).rgb;
                if (u_numFrames > 13) sum += texture(u_frame13, v_uv).rgb;
                if (u_numFrames > 14) sum += texture(u_frame14, v_uv).rgb;
                if (u_numFrames > 15) sum += texture(u_frame15, v_uv).rgb;
                
                fragColor = vec4(sum / float(u_numFrames), 1.0);
            }`;
            
            this.averageProgram = this.createProgram(vsSource, fsSource);
            this.averageUniforms = {
                u_frames: [],
                u_numFrames: gl.getUniformLocation(this.averageProgram, 'u_numFrames')
            };
            // Get uniform locations for individual frame samplers (max 16)
            for (let i = 0; i < 16; i++) {
                this.averageUniforms.u_frames[i] = gl.getUniformLocation(this.averageProgram, `u_frame${i}`);
            }
        }
        
        // Render averaged frames to temp texture
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tempAverageTexture, 0);
        
        gl.useProgram(this.averageProgram);
        gl.uniform1i(this.averageUniforms.u_numFrames, numFrames);
        
        // Bind frame history textures
        for (let i = 0; i < numFrames; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, this.frameHistory[i]);
            gl.uniform1i(this.averageUniforms.u_frames[i], i);
        }
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        return this.tempAverageTexture;
    }
}
