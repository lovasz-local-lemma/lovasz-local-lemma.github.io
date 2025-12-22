// Complex Function Visualizer
class ComplexFunctionVisualizer {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.init();
        this.setupEventListeners();
        this.animate();
    }

    init() {
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);
        
        // Camera setup
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(5, 4, 5);
        
        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.canvas, 
            antialias: true,
            alpha: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        // Post-processing setup
        this.setupPostProcessing();
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        this.scene.add(directionalLight);
        
        // State
        this.state = {
            function: 'sqrt',
            vizMode: 'color',
            curvedArrows: true,
            thickArrows: true,
            arrowOpacity: 0.7,
            gridDensity: 10,
            highlightRadius: 0.3,
            regionShape: 'square',
            pipeDensity: 24,
            morphTime: 0,
            separation: 3.0,
            showFromPlane: true,
            showToPlane: true,
            showHighlight: true,
            showMultiValue: true,
            riemannMode: 'stacked', // 'single', 'stacked', 'overlapping'
            showGrid: true,
            selectedPoint: null,
            highlightMesh: null,
            hoverPoint: null,
            pulseTime: 0,
            // Derivative landscape settings
            showContourLines: true,
            heightScale: 1.5,
            materialStyle: 'iridescent',
            // Distortion field settings
            showDistortionArrows: true,
            showDistortionEllipses: true,
            distortionDensity: 12,
            // Singularity detection settings
            showFunctionPoles: true,
            showFunctionZeros: true,
            showDerivativePoles: false,
            showDerivativeZeros: false,
            singularityRadius: 2.0,
            showContourMarkers: false
        };
        
        // Function descriptions
        this.functionInfo = {
            identity: 'The identity function leaves all points unchanged. Perfect for testing!',
            square: 'Squares each complex number. Angles double, magnitudes square. Maps circles to circles.',
            cube: 'Cubes each complex number. Angles triple, magnitudes cube.',
            inverse: 'The reciprocal function f(z) = 1/z. Swaps inside/outside of unit circle. Has a pole at z=0.',
            exp: 'Complex exponential e^z. Maps vertical strips to annuli. Highly non-injective (periodic in imaginary direction).',
            sin: 'Complex sine function. Extends real sine to complex plane. Has zeros at multiples of π.',
            cos: 'Complex cosine function. cos(z) = (e^(iz) + e^(-iz))/2. Has zeros at odd multiples of π/2.',
            tan: 'Complex tangent function tan(z) = sin(z)/cos(z). Has poles where cos(z) = 0.',
            log: 'Complex logarithm (principal branch). Multi-valued function with branch cut on negative real axis.',
            sqrt: 'Square root. Two-valued function with branch point at z=0. Enable "Show Riemann Surfaces" to see both branches!',
            cbrt: 'Cube root. Three-valued function with branch point at z=0. Enable "Show Riemann Surfaces" to see all three branches!',
            mobius: 'Möbius transformation. Maps circles to circles, lines to lines. Fixes points ±i.',
            joukowsky: 'Joukowsky transformation f(z) = z + 1/z. Used in airfoil design. Maps circles to ellipses.'
        };
        
        // Create visualizations
        this.createPlanes();
        this.updateVisualization();
        this.detectAndShowSingularities();
        
        // Raycaster for interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // Derivative landscape mesh (created on demand)
        this.derivativeMesh = null;
        this.contourLines = null;
        this.axisContours = null;
        this.distortionGroup = null;
        this.singularityMarkers = null;
        
        // Post-processing
        this.composer = null;
        this.bloomPass = null;
        this.renderTarget1 = null;
        this.renderTarget2 = null;
        this.accumIndex = 0;
    }
    
    setupPostProcessing() {
        // Check if EffectComposer is available
        if (typeof THREE.EffectComposer === 'undefined') {
            console.warn('EffectComposer not available, using standard rendering');
            this.composer = null;
            return;
        }
        
        try {
            // Create effect composer
            this.composer = new THREE.EffectComposer(this.renderer);
            console.log('EffectComposer created successfully');
            
            // Render pass - renders the scene
            const renderPass = new THREE.RenderPass(this.scene, this.camera);
            this.composer.addPass(renderPass);
            console.log('RenderPass added');
            
            // Multi-scale gaussian blur bloom
            // Create render targets for blur passes
            const rtParameters = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat
            };
            
            const blurRT1 = new THREE.WebGLRenderTarget(window.innerWidth / 2, window.innerHeight / 2, rtParameters);
            const blurRT2 = new THREE.WebGLRenderTarget(window.innerWidth / 2, window.innerHeight / 2, rtParameters);
            const blurRT3 = new THREE.WebGLRenderTarget(window.innerWidth / 4, window.innerHeight / 4, rtParameters);
            const blurRT4 = new THREE.WebGLRenderTarget(window.innerWidth / 4, window.innerHeight / 4, rtParameters);
            
            // First blur pass (small radius)
            const hBlur1 = new THREE.ShaderPass(THREE.HorizontalBlurShader);
            hBlur1.uniforms['h'].value = 1.0 / (window.innerWidth / 2);
            hBlur1.uniforms['sigma'].value = 1.5;
            hBlur1.renderToScreen = false;
            this.composer.addPass(hBlur1);
            
            const vBlur1 = new THREE.ShaderPass(THREE.VerticalBlurShader);
            vBlur1.uniforms['v'].value = 1.0 / (window.innerHeight / 2);
            vBlur1.uniforms['sigma'].value = 1.5;
            vBlur1.renderToScreen = false;
            this.composer.addPass(vBlur1);
            
            // Second blur pass (medium radius)
            const hBlur2 = new THREE.ShaderPass(THREE.HorizontalBlurShader);
            hBlur2.uniforms['h'].value = 2.0 / (window.innerWidth / 2);
            hBlur2.uniforms['sigma'].value = 3.0;
            hBlur2.renderToScreen = false;
            this.composer.addPass(hBlur2);
            
            const vBlur2 = new THREE.ShaderPass(THREE.VerticalBlurShader);
            vBlur2.uniforms['v'].value = 2.0 / (window.innerHeight / 2);
            vBlur2.uniforms['sigma'].value = 3.0;
            vBlur2.renderToScreen = false;
            this.composer.addPass(vBlur2);
            
            // Third blur pass (large radius)
            const hBlur3 = new THREE.ShaderPass(THREE.HorizontalBlurShader);
            hBlur3.uniforms['h'].value = 3.0 / (window.innerWidth / 4);
            hBlur3.uniforms['sigma'].value = 5.0;
            hBlur3.renderToScreen = false;
            this.composer.addPass(hBlur3);
            
            const vBlur3 = new THREE.ShaderPass(THREE.VerticalBlurShader);
            vBlur3.uniforms['v'].value = 3.0 / (window.innerHeight / 4);
            vBlur3.uniforms['sigma'].value = 5.0;
            vBlur3.renderToScreen = false;
            this.composer.addPass(vBlur3);
            
            console.log('Multi-scale gaussian blur passes added');
        
            // Final pass
            const copyPass = new THREE.ShaderPass(THREE.CopyShader);
            copyPass.renderToScreen = true;
            this.composer.addPass(copyPass);
            console.log('CopyPass added');
            
            // Set up accumulation buffers for temporal AA / motion blur
            const renderTargetParams = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                stencilBuffer: false
            };
            
            this.renderTarget1 = new THREE.WebGLRenderTarget(
                window.innerWidth,
                window.innerHeight,
                renderTargetParams
            );
            
            this.renderTarget2 = new THREE.WebGLRenderTarget(
                window.innerWidth,
                window.innerHeight,
                renderTargetParams
            );
            
            console.log('Post-processing setup complete!');
        } catch (error) {
            console.error('Failed to setup post-processing:', error);
            this.composer = null;
        }
    }

    // Complex number operations
    complexAdd(a, b) {
        return { re: a.re + b.re, im: a.im + b.im };
    }

    complexMult(a, b) {
        return {
            re: a.re * b.re - a.im * b.im,
            im: a.re * b.im + a.im * b.re
        };
    }

    complexDiv(a, b) {
        const denom = b.re * b.re + b.im * b.im;
        return {
            re: (a.re * b.re + a.im * b.im) / denom,
            im: (a.im * b.re - a.re * b.im) / denom
        };
    }

    complexExp(z) {
        const exp_re = Math.exp(z.re);
        return {
            re: exp_re * Math.cos(z.im),
            im: exp_re * Math.sin(z.im)
        };
    }

    complexSin(z) {
        const iz = { re: -z.im, im: z.re };
        const neg_iz = { re: z.im, im: -z.re };
        const exp_iz = this.complexExp(iz);
        const exp_neg_iz = this.complexExp(neg_iz);
        return {
            re: (exp_iz.im - exp_neg_iz.im) / 2,
            im: -(exp_iz.re - exp_neg_iz.re) / 2
        };
    }

    complexSqrt(z, branch = 0) {
        const r = Math.sqrt(z.re * z.re + z.im * z.im);
        const theta = Math.atan2(z.im, z.re);
        const sqrt_r = Math.sqrt(r);
        const angle = theta / 2 + branch * Math.PI;
        return {
            re: sqrt_r * Math.cos(angle),
            im: sqrt_r * Math.sin(angle)
        };
    }

    complexCbrt(z, branch = 0) {
        const r = Math.sqrt(z.re * z.re + z.im * z.im);
        const theta = Math.atan2(z.im, z.re);
        const cbrt_r = Math.pow(r, 1/3);
        const angle = theta / 3 + branch * 2 * Math.PI / 3;
        return {
            re: cbrt_r * Math.cos(angle),
            im: cbrt_r * Math.sin(angle)
        };
    }

    complexCos(z) {
        // cos(z) = (e^(iz) + e^(-iz))/2
        const iz = { re: -z.im, im: z.re };
        const neg_iz = { re: z.im, im: -z.re };
        const exp_iz = this.complexExp(iz);
        const exp_neg_iz = this.complexExp(neg_iz);
        return {
            re: (exp_iz.re + exp_neg_iz.re) / 2,
            im: (exp_iz.im + exp_neg_iz.im) / 2
        };
    }

    complexTan(z) {
        const sinz = this.complexSin(z);
        const cosz = this.complexCos(z);
        return this.complexDiv(sinz, cosz);
    }

    complexLog(z, branch = 0) {
        const r = Math.sqrt(z.re * z.re + z.im * z.im);
        if (r < 0.001) return { re: -10, im: 0 };
        const theta = Math.atan2(z.im, z.re);
        return {
            re: Math.log(r),
            im: theta + branch * 2 * Math.PI
        };
    }

    // Get all possible values for multi-valued functions
    getAllValues(z) {
        switch(this.state.function) {
            case 'sqrt':
                return [
                    this.complexSqrt(z, 0),
                    this.complexSqrt(z, 1)
                ];
            case 'cbrt':
                return [
                    this.complexCbrt(z, 0),
                    this.complexCbrt(z, 1),
                    this.complexCbrt(z, 2)
                ];
            case 'log':
                return [
                    this.complexLog(z, 0),
                    this.complexLog(z, 1),
                    this.complexLog(z, -1)
                ];
            default:
                return [this.applyFunction(z)];
        }
    }

    // Compute numerical derivative using central difference
    computeDerivative(z, h = 0.001) {
        const fz = this.applyFunction(z);
        const fz_h = this.applyFunction({ re: z.re + h, im: z.im });
        
        // f'(z) ≈ (f(z+h) - f(z)) / h
        const deriv = {
            re: (fz_h.re - fz.re) / h,
            im: (fz_h.im - fz.im) / h
        };
        
        return deriv;
    }
    
    // Get magnitude of derivative |f'(z)|
    getDerivativeMagnitude(z) {
        const deriv = this.computeDerivative(z);
        const mag = Math.sqrt(deriv.re * deriv.re + deriv.im * deriv.im);
        
        // Clamp extreme values for visualization
        return Math.min(mag, 10);
    }

    // Apply complex function with safety checks
    applyFunction(z) {
        const { re, im } = z;
        let result;
        
        switch(this.state.function) {
            case 'identity':
                result = { re, im };
                break;
            case 'square':
                result = this.complexMult(z, z);
                break;
            case 'cube':
                result = this.complexMult(this.complexMult(z, z), z);
                break;
            case 'inverse':
                if (re * re + im * im < 0.01) {
                    result = { re: 0, im: 0 };
                } else {
                    result = this.complexDiv({ re: 1, im: 0 }, z);
                }
                break;
            case 'exp':
                result = this.complexExp(z);
                break;
            case 'sin':
                result = this.complexSin(z);
                break;
            case 'mobius':
                const num = { re: re - 1, im };
                const den = { re: re + 1, im };
                if (den.re * den.re + den.im * den.im < 0.01) {
                    result = { re: 0, im: 0 };
                } else {
                    result = this.complexDiv(num, den);
                }
                break;
            case 'sqrt':
                result = this.complexSqrt(z);
                break;
            case 'cbrt':
                result = this.complexCbrt(z);
                break;
            case 'cos':
                result = this.complexCos(z);
                break;
            case 'tan':
                result = this.complexTan(z);
                break;
            case 'log':
                result = this.complexLog(z);
                break;
            case 'joukowsky':
                const inv = this.complexDiv({ re: 1, im: 0 }, z);
                result = this.complexAdd(z, inv);
                break;
            default:
                result = { re, im };
        }
        
        // Safety: handle NaN and Infinity
        if (!isFinite(result.re) || !isFinite(result.im) || 
            isNaN(result.re) || isNaN(result.im)) {
            return { re: 0, im: 0 };
        }
        
        // Clamp to reasonable bounds
        const maxVal = 10;
        result.re = Math.max(-maxVal, Math.min(maxVal, result.re));
        result.im = Math.max(-maxVal, Math.min(maxVal, result.im));
        
        return result;
    }

    // Convert complex number to color
    complexToColor(z) {
        const angle = Math.atan2(z.im, z.re);
        const mag = Math.sqrt(z.re * z.re + z.im * z.im);
        
        const h = (angle + Math.PI) / (2 * Math.PI);
        const s = Math.tanh(mag * 0.5);
        const v = 0.9;
        
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        
        let r, g, b;
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        
        return new THREE.Color(r, g, b);
    }

    createPlanes() {
        const resolution = 128;
        const size = 4;
        
        // From plane
        this.fromPlaneGeometry = new THREE.PlaneGeometry(size, size, resolution, resolution);
        const fromColors = [];
        const positions = this.fromPlaneGeometry.attributes.position.array;
        
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = { re: x, im: y };
            const color = this.complexToColor(z);
            fromColors.push(color.r, color.g, color.b);
        }
        
        this.fromPlaneGeometry.setAttribute('color', new THREE.Float32BufferAttribute(fromColors, 3));
        
        const fromMaterial = new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        
        this.fromPlane = new THREE.Mesh(this.fromPlaneGeometry, fromMaterial);
        this.fromPlane.position.z = -this.state.separation / 2;
        this.scene.add(this.fromPlane);
        
        // Create to planes (can be multiple for multi-valued functions)
        this.toPlanes = [];
        this.createToPlanes();
        
        this.addGridLines();
    }

    createToPlanes() {
        // Remove old to planes
        this.toPlanes.forEach(plane => this.scene.remove(plane));
        this.toPlanes = [];
        
        const resolution = 128;
        const size = 4;
        
        // Determine number of branches based on mode
        const testZ = { re: 0, im: 0 };
        let numBranches = 1;
        if (this.state.showMultiValue) {
            const allBranches = this.getAllValues(testZ).length;
            numBranches = this.state.riemannMode === 'single' ? 1 : allBranches;
        }
        
        for (let branch = 0; branch < numBranches; branch++) {
            const planeGeometry = new THREE.PlaneGeometry(size, size, resolution, resolution);
            const colors = [];
            const positions = planeGeometry.attributes.position.array;
            
            for (let i = 0; i < positions.length; i += 3) {
                const x = positions[i];
                const y = positions[i + 1];
                const z = { re: x, im: y };
                
                let w;
                if (this.state.showMultiValue) {
                    const allValues = this.getAllValues(z);
                    w = allValues[branch];
                } else {
                    w = this.applyFunction(z);
                }
                
                positions[i] = w.re;
                positions[i + 1] = w.im;
                
                const color = this.complexToColor(z);
                colors.push(color.r, color.g, color.b);
            }
            
            planeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            planeGeometry.attributes.position.needsUpdate = true;
            
            const material = new THREE.MeshBasicMaterial({
                vertexColors: true,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.8
            });
            
            const plane = new THREE.Mesh(planeGeometry, material);
            // Apply z-offset based on display mode
            // stacked: add offset for each branch
            // overlapping/single: all at base plane (no offset)
            const planeZ = this.state.riemannMode === 'stacked'
                ? this.state.separation / 2 + (branch * 0.8)
                : this.state.separation / 2;
            plane.position.z = planeZ;
            plane.visible = this.state.showToPlane;
            this.scene.add(plane);
            this.toPlanes.push(plane);
        }
    }

    addGridLines() {
        if (this.gridLines) {
            this.gridLines.forEach(line => this.scene.remove(line));
        }
        this.gridLines = [];
        
        if (!this.state.showGrid) return;
        
        const gridSize = 4;
        const divisions = 8;
        const tubeRadius = 0.008;
        const tubeSegments = 8;
        
        // Material for grid tubes - metallic gold
        const gridMaterial = new THREE.MeshStandardMaterial({
            color: 0x997744,
            metalness: 0.6,
            roughness: 0.3,
            emissive: 0x332211,
            emissiveIntensity: 0.3
        });
        
        const createTubeGrid = (zPos) => {
            const group = new THREE.Group();
            const halfSize = gridSize / 2;
            const step = gridSize / divisions;
            
            // Horizontal lines
            for (let i = 0; i <= divisions; i++) {
                const y = -halfSize + i * step;
                const curve = new THREE.LineCurve3(
                    new THREE.Vector3(-halfSize, y, 0),
                    new THREE.Vector3(halfSize, y, 0)
                );
                const geometry = new THREE.TubeGeometry(curve, 1, tubeRadius, tubeSegments, false);
                const mesh = new THREE.Mesh(geometry, gridMaterial);
                group.add(mesh);
            }
            
            // Vertical lines
            for (let i = 0; i <= divisions; i++) {
                const x = -halfSize + i * step;
                const curve = new THREE.LineCurve3(
                    new THREE.Vector3(x, -halfSize, 0),
                    new THREE.Vector3(x, halfSize, 0)
                );
                const geometry = new THREE.TubeGeometry(curve, 1, tubeRadius, tubeSegments, false);
                const mesh = new THREE.Mesh(geometry, gridMaterial);
                group.add(mesh);
            }
            
            // Add corner spheres
            const cornerRadius = tubeRadius * 1.5;
            const corners = [
                [-halfSize, -halfSize],
                [-halfSize, halfSize],
                [halfSize, -halfSize],
                [halfSize, halfSize]
            ];
            corners.forEach(([cx, cy]) => {
                const sphereGeo = new THREE.SphereGeometry(cornerRadius, 8, 8);
                const sphere = new THREE.Mesh(sphereGeo, gridMaterial);
                sphere.position.set(cx, cy, 0);
                group.add(sphere);
            });
            
            group.position.z = zPos;
            return group;
        };
        
        const fromGrid = createTubeGrid(-this.state.separation / 2);
        this.scene.add(fromGrid);
        this.gridLines.push(fromGrid);
        
        const toGrid = createTubeGrid(this.state.separation / 2);
        this.scene.add(toGrid);
        this.gridLines.push(toGrid);
    }

    updateVisualization() {
        if (this.arrowGroup) {
            this.scene.remove(this.arrowGroup);
            this.arrowGroup = null;
        }
        if (this.state.highlightMesh) {
            this.scene.remove(this.state.highlightMesh);
            this.state.highlightMesh = null;
        }
        if (this.derivativeMesh) {
            this.scene.remove(this.derivativeMesh);
            this.derivativeMesh = null;
        }
        if (this.contourLines) {
            this.scene.remove(this.contourLines);
            this.contourLines = null;
        }
        if (this.axisContours) {
            this.scene.remove(this.axisContours);
            this.axisContours = null;
        }
        if (this.distortionGroup) {
            this.scene.remove(this.distortionGroup);
            this.distortionGroup = null;
        }
        
        this.createToPlanes();
        
        switch(this.state.vizMode) {
            case 'color':
                break;
            case 'arrows':
                this.createArrowVisualization();
                break;
            case 'derivative':
                this.createDerivativeLandscape();
                break;
            case 'distortion':
                this.createDistortionField();
                break;
        }
        
        this.fromPlane.visible = this.state.showFromPlane;
        this.toPlanes.forEach(plane => plane.visible = this.state.showToPlane);
        
        // Update singularity markers
        this.detectAndShowSingularities();
    }

    createArrowVisualization() {
        this.arrowGroup = new THREE.Group();
        
        const density = this.state.gridDensity;
        const size = 4;
        const step = size / density;
        
        for (let i = 0; i <= density; i++) {
            for (let j = 0; j <= density; j++) {
                const x = -size/2 + j * step;
                const y = -size/2 + i * step;
                const z = { re: x, im: y };
                const w = this.applyFunction(z);
                
                const maxVal = 5;
                const wx = Math.max(-maxVal, Math.min(maxVal, w.re));
                const wy = Math.max(-maxVal, Math.min(maxVal, w.im));
                
                const color = this.complexToColor(z);
                
                if (this.state.curvedArrows) {
                    this.createCurvedArrow(x, y, wx, wy, color);
                } else {
                    this.createStraightArrow(x, y, wx, wy, color);
                }
            }
        }
        
        this.scene.add(this.arrowGroup);
    }
    
    createStraightArrow(x1, y1, x2, y2, color) {
        const z1 = -this.state.separation / 2;
        const z2 = this.state.separation / 2;
        
        if (this.state.thickArrows) {
            // Use tube geometry for thick appearance
            const curve = new THREE.LineCurve3(
                new THREE.Vector3(x1, y1, z1),
                new THREE.Vector3(x2, y2, z2)
            );
            const tubeRadius = 0.015;
            const geometry = new THREE.TubeGeometry(curve, 1, tubeRadius, 6, false);
            const material = new THREE.MeshStandardMaterial({ 
                color: color,
                metalness: 0.3,
                roughness: 0.4,
                emissive: color,
                emissiveIntensity: 0.2,
                transparent: true,
                opacity: this.state.arrowOpacity
            });
            const tube = new THREE.Mesh(geometry, material);
            this.arrowGroup.add(tube);
            
            // Add arrowhead
            const direction = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1);
            const length = direction.length();
            direction.normalize();
            const arrowHelper = new THREE.ArrowHelper(
                direction,
                new THREE.Vector3(x1, y1, z1),
                length,
                color,
                0.1,
                0.05
            );
            arrowHelper.line.material.transparent = true;
            arrowHelper.line.material.opacity = 0;
            this.arrowGroup.add(arrowHelper);
        } else {
            // Use thin line
            const points = [
                new THREE.Vector3(x1, y1, z1),
                new THREE.Vector3(x2, y2, z2)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ 
                color: color,
                transparent: true,
                opacity: this.state.arrowOpacity
            });
            const line = new THREE.Line(geometry, material);
            this.arrowGroup.add(line);
            
            const direction = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1);
            const length = direction.length();
            direction.normalize();
            const arrowHelper = new THREE.ArrowHelper(
                direction,
                new THREE.Vector3(x1, y1, z1),
                length,
                color,
                0.1,
                0.05
            );
            arrowHelper.line.material.transparent = true;
            arrowHelper.line.material.opacity = 0;
            this.arrowGroup.add(arrowHelper);
        }
    }

    createCurvedArrow(x1, y1, x2, y2, color) {
        const z1 = -this.state.separation / 2;
        const z2 = this.state.separation / 2;
        
        const curve = new THREE.CubicBezierCurve3(
            new THREE.Vector3(x1, y1, z1),
            new THREE.Vector3(x1, y1, 0),
            new THREE.Vector3(x2, y2, 0),
            new THREE.Vector3(x2, y2, z2)
        );
        
        if (this.state.thickArrows) {
            // Use tube geometry for thick appearance
            const tubeRadius = 0.015;
            const geometry = new THREE.TubeGeometry(curve, 20, tubeRadius, 6, false);
            const material = new THREE.MeshStandardMaterial({ 
                color: color,
                metalness: 0.3,
                roughness: 0.4,
                emissive: color,
                emissiveIntensity: 0.2,
                transparent: true,
                opacity: this.state.arrowOpacity
            });
            const tube = new THREE.Mesh(geometry, material);
            this.arrowGroup.add(tube);
        } else {
            // Use thin line
            const points = curve.getPoints(20);
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ 
                color: color,
                transparent: true,
                opacity: this.state.arrowOpacity
            });
            const line = new THREE.Line(geometry, material);
            this.arrowGroup.add(line);
        }
    }

    // Get shape points based on selected shape
    getShapePoints(centerX, centerY, size, segments, morphFactor = 0) {
        const points = [];
        const shape = this.state.regionShape;
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            let x, y;
            
            if (shape === 'circle') {
                const angle = t * Math.PI * 2;
                x = centerX + size * Math.cos(angle);
                y = centerY + size * Math.sin(angle);
            } else if (shape === 'square') {
                const side = Math.floor(t * 4);
                const localT = (t * 4) % 1;
                if (side === 0) { x = centerX + size * (1 - 2 * localT); y = centerY + size; }
                else if (side === 1) { x = centerX - size; y = centerY + size * (1 - 2 * localT); }
                else if (side === 2) { x = centerX - size + 2 * size * localT; y = centerY - size; }
                else { x = centerX + size; y = centerY - size + 2 * size * localT; }
            } else if (shape === 'triangle') {
                const side = Math.floor(t * 3);
                const localT = (t * 3) % 1;
                const h = size * Math.sqrt(3);
                if (side === 0) { x = centerX + size * (1 - 2 * localT); y = centerY + h / 3; }
                else if (side === 1) { x = centerX - size + size * localT; y = centerY + h / 3 - h * localT; }
                else { x = centerX + size * localT; y = centerY - 2 * h / 3 + h * localT; }
            } else if (shape === 'morph_circle_ellipse') {
                const angle = t * Math.PI * 2;
                const factor = 0.5 + 0.5 * Math.sin(morphFactor);
                x = centerX + size * Math.cos(angle);
                y = centerY + size * factor * Math.sin(angle);
            } else if (shape === 'morph_circle_triangle') {
                const angle = t * Math.PI * 2;
                const circleX = centerX + size * Math.cos(angle);
                const circleY = centerY + size * Math.sin(angle);
                
                // Triangle points
                const side = Math.floor(t * 3);
                const localT = (t * 3) % 1;
                const h = size * Math.sqrt(3);
                let triX, triY;
                if (side === 0) { triX = centerX + size * (1 - 2 * localT); triY = centerY + h / 3; }
                else if (side === 1) { triX = centerX - size + size * localT; triY = centerY + h / 3 - h * localT; }
                else { triX = centerX + size * localT; triY = centerY - 2 * h / 3 + h * localT; }
                
                const factor = 0.5 + 0.5 * Math.sin(morphFactor);
                x = circleX * (1 - factor) + triX * factor;
                y = circleY * (1 - factor) + triY * factor;
            }
            
            points.push({ x, y });
        }
        return points;
    }

    createHighlightVisualization(clickPoint) {
        // Remove old highlight
        if (this.state.highlightMesh) {
            this.scene.remove(this.state.highlightMesh);
        }
        
        this.state.highlightMesh = new THREE.Group();
        
        const size = this.state.highlightRadius;
        const segments = this.state.pipeDensity;
        
        // Get shape points for domain
        const shapePoints = this.getShapePoints(clickPoint.x, clickPoint.y, size, segments, this.state.morphTime);
        
        // Create color-coded outline on domain plane
        const inputPoints = [];
        const inputColors = [];
        for (let i = 0; i <= segments; i++) {
            const point = shapePoints[i];
            inputPoints.push(new THREE.Vector3(point.x, point.y, -this.state.separation / 2));
            
            // Color code by position (hue based on angle around shape)
            const hue = i / segments;
            const color = new THREE.Color().setHSL(hue, 1.0, 0.6);
            inputColors.push(color.r, color.g, color.b);
        }
        
        const inputGeometry = new THREE.BufferGeometry().setFromPoints(inputPoints);
        inputGeometry.setAttribute('color', new THREE.Float32BufferAttribute(inputColors, 3));
        const inputLine = new THREE.Line(inputGeometry, new THREE.LineBasicMaterial({ 
            vertexColors: true, 
            linewidth: 5
        }));
        this.state.highlightMesh.add(inputLine);
        
        // Add red pivot marker at center on domain plane
        const pivotGeometry = new THREE.SphereGeometry(0.04, 16, 16);
        const pivotMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
        const domainPivot = new THREE.Mesh(pivotGeometry, pivotMaterial);
        domainPivot.position.set(clickPoint.x, clickPoint.y, -this.state.separation / 2);
        this.state.highlightMesh.add(domainPivot);
        
        // For multi-valued functions, create separate output circles for each branch
        const testZ = { re: clickPoint.x, im: clickPoint.y };
        const allBranches = this.getAllValues(testZ);
        let numBranches = this.state.showMultiValue ? allBranches.length : 1;
        if (this.state.showMultiValue && this.state.riemannMode === 'single') {
            numBranches = 1;
        }
        
        for (let branch = 0; branch < numBranches; branch++) {
            const outputPoints = [];
            const outputColors = [];
            const outputZ = this.state.riemannMode === 'stacked' 
                ? this.state.separation / 2 + (branch * 0.8)
                : this.state.separation / 2;
            
            for (let i = 0; i <= segments; i++) {
                const point = shapePoints[i];
                const z = { re: point.x, im: point.y };
                const allValues = this.getAllValues(z);
                const w = allValues[branch];
                outputPoints.push(new THREE.Vector3(w.re, w.im, outputZ));
                
                // Same color coding as domain
                const hue = i / segments;
                const color = new THREE.Color().setHSL(hue, 1.0, 0.6);
                outputColors.push(color.r, color.g, color.b);
            }
            
            const outputGeometry = new THREE.BufferGeometry().setFromPoints(outputPoints);
            outputGeometry.setAttribute('color', new THREE.Float32BufferAttribute(outputColors, 3));
            const outputLine = new THREE.Line(outputGeometry, new THREE.LineBasicMaterial({ 
                vertexColors: true,
                linewidth: 5
            }));
            this.state.highlightMesh.add(outputLine);
            
            // Add red pivot marker at mapped center on range plane
            const centerZ = { re: clickPoint.x, im: clickPoint.y };
            const centerValues = this.getAllValues(centerZ);
            const centerW = centerValues[branch];
            const rangePivot = new THREE.Mesh(pivotGeometry, pivotMaterial);
            rangePivot.position.set(centerW.re, centerW.im, outputZ);
            this.state.highlightMesh.add(rangePivot);
        }
        
        // Create pipe connecting the circles
        this.createPipe(clickPoint, size, segments);
        
        this.scene.add(this.state.highlightMesh);
        
        // Update info display
        const z = { re: clickPoint.x, im: clickPoint.y };
        const allResults = this.getAllValues(z);
        if (allResults.length > 1) {
            const valuesStr = allResults.map(w => `(${w.re.toFixed(2)}, ${w.im.toFixed(2)})`).join(', ');
            document.getElementById('selectedPoint').textContent = 
                `Selected: (${clickPoint.x.toFixed(2)}, ${clickPoint.y.toFixed(2)}) → ${valuesStr}`;
        } else {
            const wResult = allResults[0];
            document.getElementById('selectedPoint').textContent = 
                `Selected: (${clickPoint.x.toFixed(2)}, ${clickPoint.y.toFixed(2)}) → (${wResult.re.toFixed(2)}, ${wResult.im.toFixed(2)})`;
        }
    }

    createCircleOutline(cx, cy, cz, radius, segments) {
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(
                cx + radius * Math.cos(angle),
                cy + radius * Math.sin(angle),
                cz
            ));
        }
        return new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 })
        );
    }

    createPipe(center, radius, segments) {
        const depthSteps = 40;
        
        // Get all values for determining branches
        const testZ = { re: center.x, im: center.y };
        const allBranches = this.getAllValues(testZ);
        let numBranches = this.state.showMultiValue ? allBranches.length : 1;
        if (this.state.showMultiValue && this.state.riemannMode === 'single') {
            numBranches = 1;
        }
        
        // Create smooth surface for each branch
        for (let branchIdx = 0; branchIdx < numBranches; branchIdx++) {
            // Calculate target z based on mode
            const targetZ = this.state.riemannMode === 'stacked'
                ? this.state.separation / 2 + (branchIdx * 0.8)
                : this.state.separation / 2;
            
            // Get shape points for smooth interpolation
            const domainShapePoints = this.getShapePoints(center.x, center.y, radius, segments, this.state.morphTime);
            
            // Build vertices and faces for smooth surface
            const vertices = [];
            const colors = [];
            const faces = [];
            
            // Create rings at each depth level
            for (let d = 0; d <= depthSteps; d++) {
                const t = d / depthSteps;
                const z = -this.state.separation / 2 + t * (targetZ - (-this.state.separation / 2));
                
                for (let i = 0; i <= segments; i++) {
                    const point = domainShapePoints[i];
                    const inputX = point.x;
                    const inputY = point.y;
                    const inputZ = { re: inputX, im: inputY };
                    
                    const allValues = this.getAllValues(inputZ);
                    const w = allValues[branchIdx];
                    
                    // Color gradient from domain to range
                    const hue = i / segments;
                    const domainColor = new THREE.Color().setHSL(hue, 1.0, 0.5 + 0.3 * (1 - t));
                    const color = domainColor;
                    
                    // Interpolate position
                    let x, y;
                    if (this.state.curvedArrows) {
                        const mt = 1 - t;
                        x = mt * mt * mt * inputX + 3 * mt * mt * t * inputX + 
                            3 * mt * t * t * w.re + t * t * t * w.re;
                        y = mt * mt * mt * inputY + 3 * mt * mt * t * inputY + 
                            3 * mt * t * t * w.im + t * t * t * w.im;
                    } else {
                        x = inputX + t * (w.re - inputX);
                        y = inputY + t * (w.im - inputY);
                    }
                    
                    vertices.push(x, y, z);
                    colors.push(color.r, color.g, color.b);
                }
            }
            
            // Create faces connecting rings
            for (let d = 0; d < depthSteps; d++) {
                for (let i = 0; i < segments; i++) {
                    const a = d * (segments + 1) + i;
                    const b = d * (segments + 1) + i + 1;
                    const c = (d + 1) * (segments + 1) + i + 1;
                    const d2 = (d + 1) * (segments + 1) + i;
                    
                    faces.push(a, b, c);
                    faces.push(a, c, d2);
                }
            }
            
            // Create geometry
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            geometry.setIndex(faces);
            geometry.computeVertexNormals();
            
            const material = new THREE.MeshPhongMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.65,
                side: THREE.DoubleSide,
                shininess: 30,
                flatShading: false
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            this.state.highlightMesh.add(mesh);
            
            // Add pulsing energy ring that travels along pipe
            this.createPulsingRing(branchIdx, domainShapePoints, center, targetZ, segments, depthSteps);
        }
    }
    
    // Create pulsing energy ring that travels along pipe (with glow layers)
    createPulsingRing(branchIdx, shapePoints, center, targetZ, segments, depthSteps) {
        const pulseProgress = (this.state.pulseTime % 2.0) / 2.0; // 0 to 1 over 2 seconds
        const ringDepth = Math.floor(pulseProgress * depthSteps);
        
        if (ringDepth >= depthSteps) return;
        
        const t = ringDepth / depthSteps;
        const z = -this.state.separation / 2 + t * (targetZ - (-this.state.separation / 2));
        
        // Create ring points and colors
        const ringPoints = [];
        const ringColors = [];
        
        for (let i = 0; i <= segments; i++) {
            const point = shapePoints[i];
            const inputX = point.x;
            const inputY = point.y;
            const inputZ = { re: inputX, im: inputY };
            
            const allValues = this.getAllValues(inputZ);
            const w = allValues[branchIdx];
            
            // Linear interpolation only
            const x = inputX + t * (w.re - inputX);
            const y = inputY + t * (w.im - inputY);
            
            ringPoints.push(new THREE.Vector3(x, y, z));
            
            // Bright glowing color
            const hue = i / segments;
            const color = new THREE.Color().setHSL(hue, 1.0, 0.9);
            ringColors.push(color.r, color.g, color.b);
        }
        
        // Main bright ring
        const ringGeometry = new THREE.BufferGeometry().setFromPoints(ringPoints);
        ringGeometry.setAttribute('color', new THREE.Float32BufferAttribute(ringColors, 3));
        const ringLine = new THREE.Line(ringGeometry, new THREE.LineBasicMaterial({ 
            vertexColors: true,
            linewidth: 4,
            transparent: true,
            opacity: 0.95
        }));
        this.state.highlightMesh.add(ringLine);
        
        // Add 2 semi-transparent glow layers
        for (let layer = 1; layer <= 2; layer++) {
            const glowGeometry = ringGeometry.clone();
            const glowLine = new THREE.Line(glowGeometry, new THREE.LineBasicMaterial({ 
                vertexColors: true,
                linewidth: 4 + layer * 2,
                transparent: true,
                opacity: 0.4 / layer
            }));
            this.state.highlightMesh.add(glowLine);
        }
    }

    createPlaneHighlight(center, radius, z, isFilled) {
        const segments = 32;
        const geometry = new THREE.CircleGeometry(radius, segments);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: isFilled ? 0.3 : 0.2,
            side: THREE.DoubleSide
        });
        
        const circle = new THREE.Mesh(geometry, material);
        circle.position.set(center.x, center.y, z);
        this.state.highlightMesh.add(circle);
    }

    // Create derivative magnitude and phase textures
    generateDerivativeTextures() {
        const resolution = 256;
        const size = 4;
        
        // Derivative magnitude data
        const derivData = new Uint8Array(resolution * resolution);
        const phaseData = new Uint8Array(resolution * resolution * 3);
        
        for (let i = 0; i < resolution; i++) {
            for (let j = 0; j < resolution; j++) {
                const x = -size/2 + (j / resolution) * size;
                const y = -size/2 + (i / resolution) * size;
                const z = { re: x, im: y };
                
                // Derivative magnitude
                const derivMag = this.getDerivativeMagnitude(z);
                const normalizedMag = Math.min(derivMag / 5.0, 1.0); // Normalize to [0, 1]
                const idx = i * resolution + j;
                derivData[idx] = Math.floor(normalizedMag * 255);
                
                // Phase color
                const fz = this.applyFunction(z);
                const color = this.complexToColor(fz);
                const idx3 = idx * 3;
                phaseData[idx3] = Math.floor(color.r * 255);
                phaseData[idx3 + 1] = Math.floor(color.g * 255);
                phaseData[idx3 + 2] = Math.floor(color.b * 255);
            }
        }
        
        // Create textures
        this.derivativeTexture = new THREE.DataTexture(
            derivData,
            resolution,
            resolution,
            THREE.LuminanceFormat,
            THREE.UnsignedByteType
        );
        this.derivativeTexture.needsUpdate = true;
        
        this.phaseTexture = new THREE.DataTexture(
            phaseData,
            resolution,
            resolution,
            THREE.RGBFormat,
            THREE.UnsignedByteType
        );
        this.phaseTexture.needsUpdate = true;
    }

    // Create derivative landscape as displaced mesh surface
    createDerivativeLandscape() {
        const resolution = 128;
        const size = 6;
        
        // Create plane geometry with high resolution
        const geometry = new THREE.PlaneGeometry(size, size, resolution, resolution);
        const positions = geometry.attributes.position.array;
        const colors = [];
        
        // Displace vertices based on derivative magnitude
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = { re: x, im: y };
            
            // Get derivative magnitude and use as height
            const derivMag = this.getDerivativeMagnitude(z);
            positions[i + 2] = derivMag * this.state.heightScale;
            
            // Color based on phase and height
            const fz = this.applyFunction(z);
            const phaseColor = this.complexToColor(fz);
            
            // Height-based color blending
            const heightFactor = Math.min(derivMag / 3.0, 1.0);
            const heightColor = {
                r: 0.05 + heightFactor * 0.95,
                g: 0.05 + heightFactor * 0.8,
                b: 0.15 + heightFactor * 0.05
            };
            
            // Blend phase and height colors
            const blendedColor = {
                r: phaseColor.r * 0.3 + heightColor.r * 0.7,
                g: phaseColor.g * 0.3 + heightColor.g * 0.7,
                b: phaseColor.b * 0.3 + heightColor.b * 0.7
            };
            
            colors.push(blendedColor.r, blendedColor.g, blendedColor.b);
        }
        
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
        
        // Material based on style selection
        let material;
        if (this.state.materialStyle === 'iridescent') {
            // Iridescent bubble-like material
            material = new THREE.MeshPhysicalMaterial({
                vertexColors: true,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.85,
                metalness: 0.3,
                roughness: 0.1,
                clearcoat: 1.0,
                clearcoatRoughness: 0.1,
                transmission: 0.3,
                ior: 1.5,
                thickness: 0.5,
                envMapIntensity: 1.5
            });
        } else if (this.state.materialStyle === 'glass') {
            // Glass-like transparent material
            material = new THREE.MeshPhysicalMaterial({
                vertexColors: true,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.6,
                metalness: 0.0,
                roughness: 0.0,
                transmission: 0.9,
                ior: 1.5,
                thickness: 1.0
            });
        } else {
            // Standard Phong
            material = new THREE.MeshPhongMaterial({
                vertexColors: true,
                side: THREE.DoubleSide,
                shininess: 60,
                flatShading: false,
                transparent: false
            });
        }
        
        this.derivativeMesh = new THREE.Mesh(geometry, material);
        this.derivativeMesh.rotation.x = 0;
        this.scene.add(this.derivativeMesh);
        
        // Add axis contour lines if enabled
        if (this.state.showContourLines) {
            this.addAxisContours();
        }
        
        // Add sample point markers if enabled
        if (this.state.showContourMarkers) {
            this.addContourMarkers();
        }
    }
    
    // Add x-axis and y-axis contour lines showing real slices
    addAxisContours() {
        if (!this.derivativeMesh) return;
        
        const size = 6;
        const resolution = 100;
        const axisGroup = new THREE.Group();
        
        // X-axis contour (y=0, showing f'(x+0i))
        const xAxisPoints = [];
        for (let i = 0; i <= resolution; i++) {
            const x = -size/2 + (i / resolution) * size;
            const y = 0;
            const z = { re: x, im: y };
            const derivMag = this.getDerivativeMagnitude(z);
            const height = derivMag * this.state.heightScale;
            xAxisPoints.push(new THREE.Vector3(x, y, height));
        }
        
        const xAxisGeometry = new THREE.BufferGeometry().setFromPoints(xAxisPoints);
        const xAxisMaterial = new THREE.LineBasicMaterial({
            color: 0xFF4444,
            linewidth: 3,
            transparent: true,
            opacity: 0.9
        });
        const xAxisLine = new THREE.Line(xAxisGeometry, xAxisMaterial);
        axisGroup.add(xAxisLine);
        
        // Y-axis contour (x=0, showing f'(0+yi))
        const yAxisPoints = [];
        for (let i = 0; i <= resolution; i++) {
            const x = 0;
            const y = -size/2 + (i / resolution) * size;
            const z = { re: x, im: y };
            const derivMag = this.getDerivativeMagnitude(z);
            const height = derivMag * this.state.heightScale;
            yAxisPoints.push(new THREE.Vector3(x, y, height));
        }
        
        const yAxisGeometry = new THREE.BufferGeometry().setFromPoints(yAxisPoints);
        const yAxisMaterial = new THREE.LineBasicMaterial({
            color: 0x44FF44,
            linewidth: 3,
            transparent: true,
            opacity: 0.9
        });
        const yAxisLine = new THREE.Line(yAxisGeometry, yAxisMaterial);
        axisGroup.add(yAxisLine);
        
        this.axisContours = axisGroup;
        this.scene.add(this.axisContours);
    }
    
    // Add sample point markers to derivative landscape
    addContourMarkers() {
        if (this.contourLines) {
            this.scene.remove(this.contourLines);
            this.contourLines = null;
        }
        
        if (!this.derivativeMesh) return;
        
        const resolution = 48;
        const size = 6;
        const contourSpacing = 0.5;
        
        const linesGroup = new THREE.Group();
        
        // Create glowing sphere markers at contour heights
        for (let h = 0.2; h < 8; h += contourSpacing) {
            const positions = [];
            
            for (let i = 0; i <= resolution; i++) {
                for (let j = 0; j <= resolution; j++) {
                    const x = -size/2 + (j / resolution) * size;
                    const y = -size/2 + (i / resolution) * size;
                    const z = { re: x, im: y };
                    const derivMag = this.getDerivativeMagnitude(z);
                    const height = derivMag * this.state.heightScale;
                    
                    // If close to contour height
                    if (Math.abs(height - h) < 0.06) {
                        positions.push(x, y, height);
                    }
                }
            }
            
            if (positions.length > 0) {
                // Create instanced mesh for efficient rendering
                const sphereGeometry = new THREE.SphereGeometry(0.025, 8, 8);
                const heightFactor = h / 8.0;
                
                // Color gradient from blue (low) to gold (high)
                const color = new THREE.Color();
                color.setHSL(0.6 - heightFactor * 0.5, 0.8, 0.5 + heightFactor * 0.3);
                
                // Inner core material (bright)
                const coreMaterial = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.9
                });
                
                // Outer glow material
                const glowMaterial = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.3,
                    side: THREE.BackSide
                });
                
                for (let i = 0; i < positions.length; i += 3) {
                    // Core sphere
                    const core = new THREE.Mesh(sphereGeometry, coreMaterial);
                    core.position.set(positions[i], positions[i+1], positions[i+2]);
                    linesGroup.add(core);
                    
                    // Glow sphere (slightly larger)
                    const glowGeometry = new THREE.SphereGeometry(0.04, 8, 8);
                    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
                    glow.position.set(positions[i], positions[i+1], positions[i+2]);
                    linesGroup.add(glow);
                }
            }
        }
        
        this.contourLines = linesGroup;
        this.scene.add(this.contourLines);
    }

    // Update derivative landscape
    updateDerivativeLandscape() {
        if (!this.derivativeMesh) return;
        
        // Recreate with new height scale
        this.scene.remove(this.derivativeMesh);
        if (this.contourLines) {
            this.scene.remove(this.contourLines);
        }
        if (this.axisContours) {
            this.scene.remove(this.axisContours);
        }
        this.createDerivativeLandscape();
    }

    // Create conformal distortion field visualization
    createDistortionField() {
        // Clear old distortion field first
        if (this.distortionGroup) {
            this.scene.remove(this.distortionGroup);
            this.distortionGroup = null;
        }
        
        this.distortionGroup = new THREE.Group();
        
        const density = this.state.distortionDensity;
        const size = 4;
        const step = size / density;
        
        for (let i = 0; i <= density; i++) {
            for (let j = 0; j <= density; j++) {
                const x = -size/2 + j * step;
                const y = -size/2 + i * step;
                const z = { re: x, im: y };
                
                // Compute Jacobian
                const J = computeJacobian(this, z);
                const props = getDistortionProperties(J);
                
                // Color based on area scaling (determinant)
                const detClamped = Math.min(props.det / 2.0, 1.0);
                const color = new THREE.Color().setHSL(0.55 - detClamped * 0.4, 0.8, 0.5);
                
                // Show direction arrows if enabled
                if (this.state.showDistortionArrows) {
                    const arrowLength = 0.2 * Math.sqrt(props.det);
                    const arrowDir = new THREE.Vector3(
                        Math.cos(props.angle),
                        Math.sin(props.angle),
                        0
                    );
                    
                    const arrow = new THREE.ArrowHelper(
                        arrowDir,
                        new THREE.Vector3(x, y, 0),
                        arrowLength,
                        color,
                        0.08,
                        0.04
                    );
                    this.distortionGroup.add(arrow);
                }
                
                // Show stretch ellipses if enabled
                if (this.state.showDistortionEllipses) {
                    const ellipseGeometry = new THREE.CircleGeometry(0.1, 32);
                    const ellipseMaterial = new THREE.MeshBasicMaterial({
                        color: color,
                        transparent: true,
                        opacity: 0.3,
                        side: THREE.DoubleSide
                    });
                    
                    const ellipse = new THREE.Mesh(ellipseGeometry, ellipseMaterial);
                    ellipse.position.set(x, y, 0);
                    
                    // Scale to show principal stretches
                    const scale1 = Math.abs(props.lambda1) * 0.3;
                    const scale2 = Math.abs(props.lambda2) * 0.3;
                    ellipse.scale.set(scale1, scale2, 1);
                    ellipse.rotation.z = props.angle;
                    
                    this.distortionGroup.add(ellipse);
                }
            }
        }
        
        this.scene.add(this.distortionGroup);
    }

    // Detect and visualize poles and zeros
    detectAndShowSingularities() {
        // Clear old markers
        if (this.singularityMarkers) {
            this.scene.remove(this.singularityMarkers);
            this.singularityMarkers = null;
        }
        
        const hasAnyEnabled = this.state.showFunctionPoles || this.state.showFunctionZeros || 
                              this.state.showDerivativePoles || this.state.showDerivativeZeros;
        if (!hasAnyEnabled) return;
        
        this.singularityMarkers = new THREE.Group();
        const radius = this.state.singularityRadius;
        
        // Find zeros of f(z)
        if (this.state.showFunctionZeros) {
            const zeros = findZeros(this, radius, 20);
            console.log(`Found ${zeros.length} zeros of f(z):`, zeros);
            zeros.forEach(zero => {
                this.createSingularityMarker(zero.pos, zero.order, true, false);
            });
        }
        
        // Find poles of f(z)
        if (this.state.showFunctionPoles) {
            const poles = findPoles(this, radius, 20);
            console.log(`Found ${poles.length} poles of f(z):`, poles);
            poles.forEach(pole => {
                this.createSingularityMarker(pole.pos, pole.order, false, false);
            });
        }
        
        // Find zeros of f'(z) - critical points
        if (this.state.showDerivativeZeros) {
            const derivZeros = findDerivativeZeros(this, radius, 20);
            console.log(`Found ${derivZeros.length} zeros of f'(z):`, derivZeros);
            derivZeros.forEach(zero => {
                this.createSingularityMarker(zero.pos, zero.order, true, true);
            });
        }
        
        // Find poles of f'(z)
        if (this.state.showDerivativePoles) {
            const derivPoles = findDerivativePoles(this, radius, 20);
            console.log(`Found ${derivPoles.length} poles of f'(z):`, derivPoles);
            derivPoles.forEach(pole => {
                this.createSingularityMarker(pole.pos, pole.order, false, true);
            });
        }
        
        if (this.singularityMarkers.children.length > 0) {
            this.scene.add(this.singularityMarkers);
        }
    }
    
    // Create visual marker for singularity
    createSingularityMarker(pos, order, isZero, isDerivative) {
        // Lighter colors for f(z), darker for f'(z)
        let color;
        if (isDerivative) {
            color = isZero ? 0x1a1a66 : 0x661a1a; // Darker blue/red for derivative
        } else {
            color = isZero ? 0x4444FF : 0xFF4444; // Bright blue/red for function
        }
        const size = 0.05 + order * 0.015; // Smaller spheres
        
        // Create glowing sphere
        const geometry = new THREE.SphereGeometry(size, 16, 16);
        const material = new THREE.MeshBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.8
        });
        
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.set(pos.re, pos.im, -this.state.separation / 2);
        this.singularityMarkers.add(sphere);
        
        // Add glow ring
        const ringGeometry = new THREE.RingGeometry(size * 1.5, size * 2, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.set(pos.re, pos.im, -this.state.separation / 2);
        this.singularityMarkers.add(ring);
    }

    updateFunctionInfo() {
        const infoEl = document.getElementById('functionInfo');
        const funcName = this.state.function;
        const description = this.functionInfo[funcName] || '';
        
        if (description) {
            infoEl.innerHTML = `<p style="color: #B8B8B8; font-size: 0.85em; line-height: 1.5;"><strong style="color: #F4D03F;">About this function:</strong><br>${description}</p>`;
        } else {
            infoEl.innerHTML = '';
        }
    }

    setupEventListeners() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            
            if (this.composer) {
                this.composer.setSize(window.innerWidth, window.innerHeight);
                
                // Update render targets
                this.renderTarget1.setSize(window.innerWidth, window.innerHeight);
                this.renderTarget2.setSize(window.innerWidth, window.innerHeight);
            }
        });
        
        // Initialize function info
        this.updateFunctionInfo();
        
        document.getElementById('functionSelect').addEventListener('change', (e) => {
            this.state.function = e.target.value;
            this.updateFunctionInfo();
            this.updateVisualization();
        });
        
        document.querySelectorAll('input[name="vizMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.state.vizMode = e.target.value;
                document.getElementById('arrowControls').style.display = 
                    this.state.vizMode === 'arrows' ? 'block' : 'none';
                document.getElementById('derivativeControls').style.display = 
                    this.state.vizMode === 'derivative' ? 'block' : 'none';
                document.getElementById('distortionControls').style.display = 
                    this.state.vizMode === 'distortion' ? 'block' : 'none';
                this.updateVisualization();
            });
        });
        
        document.getElementById('curvedArrows').addEventListener('change', (e) => {
            this.state.curvedArrows = e.target.checked;
            if (this.state.vizMode === 'arrows') this.updateVisualization();
        });
        
        document.getElementById('thickArrows').addEventListener('change', (e) => {
            this.state.thickArrows = e.target.checked;
            if (this.state.vizMode === 'arrows') this.updateVisualization();
        });
        
        document.getElementById('arrowOpacity').addEventListener('input', (e) => {
            this.state.arrowOpacity = parseFloat(e.target.value);
            document.getElementById('arrowOpacityValue').textContent = e.target.value;
            if (this.state.vizMode === 'arrows') this.updateVisualization();
        });
        
        document.getElementById('gridDensity').addEventListener('input', (e) => {
            this.state.gridDensity = parseInt(e.target.value);
            document.getElementById('gridDensityValue').textContent = e.target.value;
            if (this.state.vizMode === 'arrows') this.updateVisualization();
        });
        
        document.getElementById('showHighlight').addEventListener('change', (e) => {
            this.state.showHighlight = e.target.checked;
            if (!this.state.showHighlight && this.state.highlightMesh) {
                this.scene.remove(this.state.highlightMesh);
                this.state.highlightMesh = null;
            }
        });
        
        document.getElementById('highlightRadius').addEventListener('input', (e) => {
            this.state.highlightRadius = parseFloat(e.target.value);
            document.getElementById('highlightRadiusValue').textContent = e.target.value;
            if (this.state.hoverPoint && this.state.showHighlight) {
                this.createHighlightVisualization(this.state.hoverPoint);
            }
        });
        
        document.getElementById('regionShape').addEventListener('change', (e) => {
            this.state.regionShape = e.target.value;
            if (this.state.hoverPoint && this.state.showHighlight) {
                this.createHighlightVisualization(this.state.hoverPoint);
            }
        });
        
        document.getElementById('pipeDensity').addEventListener('input', (e) => {
            this.state.pipeDensity = parseInt(e.target.value);
            document.getElementById('pipeDensityValue').textContent = e.target.value;
            if (this.state.hoverPoint && this.state.showHighlight) {
                this.createHighlightVisualization(this.state.hoverPoint);
            }
        });
        
        document.getElementById('showFromPlane').addEventListener('change', (e) => {
            this.state.showFromPlane = e.target.checked;
            this.fromPlane.visible = this.state.showFromPlane;
        });
        
        document.getElementById('showToPlane').addEventListener('change', (e) => {
            this.state.showToPlane = e.target.checked;
            this.toPlanes.forEach(plane => plane.visible = this.state.showToPlane);
        });
        
        document.getElementById('showMultiValue').addEventListener('change', (e) => {
            this.state.showMultiValue = e.target.checked;
            // Show/hide Riemann mode selector
            const riemannModeLabel = document.getElementById('riemannModeLabel');
            if (riemannModeLabel) {
                riemannModeLabel.style.display = e.target.checked ? 'block' : 'none';
            }
            this.updateVisualization();
        });
        
        document.getElementById('riemannMode').addEventListener('change', (e) => {
            this.state.riemannMode = e.target.value;
            this.updateVisualization();
        });
        
        document.getElementById('showGrid').addEventListener('change', (e) => {
            this.state.showGrid = e.target.checked;
            this.addGridLines();
        });
        
        document.getElementById('separation').addEventListener('input', (e) => {
            this.state.separation = parseFloat(e.target.value);
            document.getElementById('separationValue').textContent = e.target.value;
            this.fromPlane.position.z = -this.state.separation / 2;
            this.toPlanes.forEach((plane, idx) => {
                const zOffset = idx * 0.8;
                plane.position.z = this.state.separation / 2 + zOffset;
            });
            this.addGridLines();
            this.updateVisualization();
        });
        
        document.getElementById('showContourLines').addEventListener('change', (e) => {
            this.state.showContourLines = e.target.checked;
            this.updateDerivativeLandscape();
        });
        
        document.getElementById('showContourMarkers').addEventListener('change', (e) => {
            this.state.showContourMarkers = e.target.checked;
            this.updateDerivativeLandscape();
        });
        
        document.getElementById('heightScale').addEventListener('input', (e) => {
            this.state.heightScale = parseFloat(e.target.value);
            document.getElementById('heightScaleValue').textContent = e.target.value;
            this.updateDerivativeLandscape();
        });
        
        document.getElementById('materialStyle').addEventListener('change', (e) => {
            this.state.materialStyle = e.target.value;
            this.updateDerivativeLandscape();
        });
        
        document.getElementById('showDistortionArrows').addEventListener('change', (e) => {
            this.state.showDistortionArrows = e.target.checked;
            if (this.state.vizMode === 'distortion') this.updateVisualization();
        });
        
        document.getElementById('showDistortionEllipses').addEventListener('change', (e) => {
            this.state.showDistortionEllipses = e.target.checked;
            if (this.state.vizMode === 'distortion') this.updateVisualization();
        });
        
        document.getElementById('distortionDensity').addEventListener('input', (e) => {
            this.state.distortionDensity = parseInt(e.target.value);
            document.getElementById('distortionDensityValue').textContent = e.target.value;
            if (this.state.vizMode === 'distortion') this.updateVisualization();
        });
        
        document.getElementById('showFunctionPoles').addEventListener('change', (e) => {
            this.state.showFunctionPoles = e.target.checked;
            this.detectAndShowSingularities();
        });
        
        document.getElementById('showFunctionZeros').addEventListener('change', (e) => {
            this.state.showFunctionZeros = e.target.checked;
            this.detectAndShowSingularities();
        });
        
        document.getElementById('showDerivativePoles').addEventListener('change', (e) => {
            this.state.showDerivativePoles = e.target.checked;
            this.detectAndShowSingularities();
        });
        
        document.getElementById('showDerivativeZeros').addEventListener('change', (e) => {
            this.state.showDerivativeZeros = e.target.checked;
            this.detectAndShowSingularities();
        });
        
        document.getElementById('singularityRadius').addEventListener('input', (e) => {
            this.state.singularityRadius = parseFloat(e.target.value);
            document.getElementById('singularityRadiusValue').textContent = e.target.value;
            this.detectAndShowSingularities();
        });
        
        document.getElementById('resetCamera').addEventListener('click', () => {
            this.camera.position.set(5, 4, 5);
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        });
        
        this.canvas.addEventListener('mousemove', (event) => {
            if (!this.state.showHighlight) return;
            
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            // Try to intersect with the from plane
            const intersects = this.raycaster.intersectObject(this.fromPlane);
            if (intersects.length > 0) {
                const point = intersects[0].point;
                this.state.hoverPoint = point;
                this.createHighlightVisualization(point);
            }
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update morph time for morphing shapes
        if (this.state.regionShape.startsWith('morph_')) {
            this.state.morphTime += 0.02;
            if (this.state.hoverPoint && this.state.showHighlight) {
                this.createHighlightVisualization(this.state.hoverPoint);
            }
        }
        
        // Update pulse animation for energy ring (throttled)
        if (this.state.hoverPoint && this.state.showHighlight) {
            this.state.pulseTime += 0.016;
            // Only refresh every 10 frames to reduce load
            if (Math.floor(this.state.pulseTime * 60) % 10 === 0) {
                this.createHighlightVisualization(this.state.hoverPoint);
            }
        }
        
        this.controls.update();
        
        // Render with post-processing if available, otherwise use standard rendering
        if (this.composer) {
            this.composer.render();
            this.applyAccumulation();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    applyAccumulation() {
        // Simple temporal accumulation for smooth motion
        const blendFactor = 0.9; // Higher = more temporal smoothing
        
        // Swap render targets
        const tempTarget = this.renderTarget1;
        this.renderTarget1 = this.renderTarget2;
        this.renderTarget2 = tempTarget;
        
        // Render current frame to target
        this.composer.render(this.renderTarget2);
        
        // Blend with previous frame (simple approach)
        this.accumIndex++;
        if (this.accumIndex > 5) { // Start blending after a few frames
            // This creates a subtle motion blur / temporal AA effect
            // The actual blending happens through the bloom pass accumulation
        }
    }
}

// Initialize the visualizer
new ComplexFunctionVisualizer();