import { Scene } from './scene.js';
import { Camera } from './camera.js';
import { RayTracer } from './raytracer.js';
import { RayTracerWebGL } from './raytracer-webgl.js';
import { CameraVisualizer } from './cameraVisualizer.js';
import { FFTProcessor } from './fft-processor.js';
import { CWToFProcessor } from './cwtof-processor.js';

//console.log('=== MAIN.JS LOADED ===');

class OpticalSimulator {
    constructor() {
        //console.log('=== OPTICAL SIMULATOR CONSTRUCTOR CALLED ===');
        
        this.sceneCanvas = document.getElementById('scene-canvas');
        this.cameraCanvas = document.getElementById('camera-canvas');
        
        //console.log('Canvas elements:', this.sceneCanvas, this.cameraCanvas);
        
        this.scene = new Scene();
        this.camera = new Camera();
        
        // Initialize focus points for new tilt-shift (WORLD space)
        // Equilateral triangle centered at origin, side length = 0.8
        // Height = 0.8 * sqrt(3)/2 ≈ 0.693
        const side = 0.8;
        const height = side * Math.sqrt(3) / 2;
        this.camera.focusPointA = {x: side/2, y: 0.3, z: height/3};     // Right
        this.camera.focusPointB = {x: -side/2, y: 0.3, z: height/3};    // Left
        this.camera.focusPointC = {x: 0.0, y: 0.3, z: -2*height/3};     // Back (pointing toward camera)
        
        // Debug visualization flags
        this.camera.showFocusPoints = false;
        this.camera.showFocusAxes = false;
        this.camera.showFocusTriangle = false;
        
        // Mouse picking for gizmo interaction
        this.mouseX = 0;
        this.mouseY = 0;
        this.hoveredObject = null; // 'pointA', 'pointB', 'pointC', 'center'
        this.selectedObject = null;
        this.isDragging = false;
        
        // Autofocus animation state
        this.autofocusTarget = null;
        this.autofocusStepSize = 0.15; // Distance change per frame
        this.autofocusSpeed = 0.5; // Speed multiplier (higher = faster updates)
        
        // Initialize camera rotation (use defaults from Camera class)
        this.camera.updateRotation();
        
        //console.log('Initial camera position:', this.camera.position);
        //console.log('Initial lookAt:', this.camera.lookAt);
        
        // Setup scene BEFORE creating renderers
        //console.log('Setting up scene...');
        this.setupDefaultScene();
        //console.log('Scene setup complete. Spheres:', this.scene.spheres.length);
        //console.log('Scene objects:', this.scene.objects.length);
        
        // CRITICAL: Size canvases BEFORE creating WebGL context
        // Some browsers fail to create WebGL context on 0x0 canvas
        //console.log('Sizing canvases before WebGL initialization...');
        const sceneWidth = this.sceneCanvas.parentElement.clientWidth || 800;
        const sceneHeight = this.sceneCanvas.parentElement.clientHeight || 600;
        this.sceneCanvas.width = sceneWidth;
        this.sceneCanvas.height = sceneHeight;
        //console.log(`Scene canvas sized to: ${sceneWidth}x${sceneHeight}`);
        
        // Create WebGL renderer
        this.rayTracer = new RayTracerWebGL(this.sceneCanvas, this.scene, this.camera);
        if (!this.rayTracer.gl) {
            console.error('Failed to initialize WebGL renderer');
            return;
        }
        //console.log('Using WebGL renderer');
        
        this.cameraVisualizer = new CameraVisualizer(this.cameraCanvas, this.camera, this.scene);
        
        this.stats = {
            fps: 0,
            samples: 0,
            rays: 0,
            lastTime: performance.now(),
            frames: 0
        };
        
        this.targetSPP = 100; // Default target samples per pixel
        this.isCapturingCWToF = false; // Flag to prevent auto-restart during manual capture
        
        // Scene already setup above
        this.setupEventListeners();
        this.setupControlBindings();
        
        this.resizeCanvases();
        window.addEventListener('resize', () => this.resizeCanvases());
        
        // Setup draggable resize handle
        this.setupResizeHandle();
        
        // Hide loading screen
        document.getElementById('loading').style.display = 'none';
        
        this.animate();
    }
    
    setupResizeHandle() {
        const handle = document.getElementById('resize-handle');
        const sceneViewport = document.getElementById('scene-viewport');
        const cameraViewport = document.getElementById('camera-viewport');
        
        if (!handle) {
            console.error('Resize handle not found!');
            return;
        }
        
        //console.log('Setting up resize handle');
        
        let isResizing = false;
        
        handle.addEventListener('mousedown', (e) => {
            //console.log('Resize started');
            isResizing = true;
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const container = document.getElementById('viewports');
            const containerRect = container.getBoundingClientRect();
            const mouseY = e.clientY - containerRect.top; // VERTICAL, not horizontal
            
            // Camera viewport is fixed at 300px, only resize scene viewport
            const cameraHeight = 300; // Must match CSS
            const handleHeight = 8;
            const minSceneHeight = 200;
            const maxSceneHeight = containerRect.height - cameraHeight - handleHeight - 100;
            
            const topHeight = mouseY;
            
            if (topHeight >= minSceneHeight && topHeight <= maxSceneHeight) {
                sceneViewport.style.flex = `0 0 ${topHeight}px`;
                // Camera viewport stays fixed in CSS
                
                // Trigger resize
                this.resizeCanvases();
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                //console.log('Resize ended');
                isResizing = false;
            }
        });
    }
    
    setupDefaultScene() {
        // Ground plane
        this.scene.addPlane([0, -1, 0], [0, 1, 0], { type: 'diffuse', albedo: [0.5, 0.5, 0.5] });
        
        // Closer objects (1-3m) - Prominent foreground
        this.scene.addSphere([-1.5, -0.3, 2.5], 0.5, { type: 'glass', ior: 1.5, albedo: [1.0, 1.0, 1.0] }); // Pure clear glass (fully transparent)
        this.scene.addSphere([1.2, -0.5, 3], 0.4, { type: 'glossy', albedo: [0.5, 0.5, 0.55], roughness: 0.2, texture: 'mokuti' }); // Animated mokuti Damascus steel
        
        // Middle objects (4-6m) - Main focus area - CENTER SPHERE (material showcase)
        this.centerSphereIndex = this.scene.spheres.length;
        this.scene.addSphere([0, 0, 5], 1.0, { type: 'glossy', albedo: [1.0, 0.75, 0.2], roughness: 0.15, texture: 'fbm' }); // Vibrant yellow-orange gold with thin black lightning cracks
        this.scene.addSphere([-2, -0.5, 4.5], 0.6, { type: 'glossy', albedo: [0.9, 0.9, 0.9], roughness: 0.3, texture: 'checkerboard' }); // Glossy/matte checkerboard
        this.scene.addSphere([2.5, 0.2, 5.5], 0.7, { type: 'glass', ior: 1.5, albedo: [0.3, 1.0, 0.3] }); // Bright green glass (strong tint)
        
        // Far objects (7-9m)
        this.scene.addSphere([-1, 0, 7], 0.8, { type: 'diffuse', albedo: [0.9, 0.5, 0.2] });
        this.scene.addSphere([1.8, -0.2, 8], 0.6, { type: 'mirror' });
        this.scene.addSphere([0, 0.5, 9], 0.5, { type: 'diffuse', albedo: [0.5, 0.9, 0.3] });
        
        // Volumetric sphere - homogeneous participating media
        this.scene.addVolumetricSphere([3.5, 2.0, 6.5], 0.6, 3.0, [0.7, 0.7, 0.7]);
        //console.log('Added volumetric sphere - homogeneous medium');
        
        // Store light indices for animation
        this.lights = [];
        this.animateLights = false; // Control light animation
        
        // Near light (large) - warm white, medium brightness (shows color in bokeh)
        this.lights.push({
            index: this.scene.spheres.length,
            orbit: { radius: 2.5, speed: 0.3, height: 2, z: 4 },
            initialPos: [2.5, 2, 4]
        });
        this.scene.addSphere([2.5, 2, 4], 0.15, { type: 'emissive', emission: [6, 5, 4] }); // Warm tone
        
        // Medium distance lights - varied colors and brightness
        this.scene.addSphere([2.5, 1.5, 8], 0.03, { type: 'emissive', emission: [4, 6, 8] }); // Cool blue (not too bright - shows color)
        this.scene.addSphere([-2.5, 1.5, 8], 0.03, { type: 'emissive', emission: [8, 4, 6] }); // Magenta pink
        
        // Far point lights (very small, very far) - varied brightness and colors
        this.scene.addSphere([3, 2, 20], 0.01, { type: 'emissive', emission: [15, 15, 10] }); // Warm white (bright)
        this.scene.addSphere([-3, 2, 20], 0.01, { type: 'emissive', emission: [6, 8, 10] }); // Cool cyan (shows color)
        this.scene.addSphere([0, 3, 25], 0.008, { type: 'emissive', emission: [20, 20, 20] }); // Pure white (very bright)
        this.scene.addSphere([1.5, 2.5, 22], 0.008, { type: 'emissive', emission: [10, 6, 4] }); // Orange (shows color)
        this.scene.addSphere([-1.5, 2.5, 22], 0.008, { type: 'emissive', emission: [4, 10, 6] }); // Green (shows color)
    }
    
    updateLights() {
        if (!this.animateLights) return; // Skip if animation is disabled
        
        // Animate orbiting light
        const time = performance.now() * 0.001; // seconds
        
        for (const light of this.lights) {
            const orbit = light.orbit;
            const angle = time * orbit.speed;
            const x = Math.cos(angle) * orbit.radius;
            const y = orbit.height;
            const z = orbit.z + Math.sin(angle) * orbit.radius * 0.3; // Slight forward/back
            
            // Update sphere position
            this.scene.spheres[light.index].center = [x, y, z];
        }
        
        this.rayTracer.needsUpdate = true;
    }
    
    // Get material preset by name
    getMaterialPreset(name) {
        const presets = {
            'gold-fbm': { type: 'glossy', albedo: [1.0, 0.75, 0.2], roughness: 0.15, texture: 'fbm' },
            'brushed-metal': { type: 'glossy', albedo: [0.8, 0.8, 0.85], roughness: 0.3, anisotropy: 0.8, anisotropyRotation: 0.0, texture: 'none' },
            'car-paint': { type: 'glossy', albedo: [0.8, 0.05, 0.05], roughness: 0.6, clearcoat: 1.0, clearcoatRoughness: 0.05, clearcoatIOR: 1.5, texture: 'none' },
            'chrome': { type: 'mirror', albedo: [0.95, 0.95, 0.95] },
            'velvet-red': { type: 'glossy', albedo: [0.7, 0.05, 0.05], roughness: 0.9, velvet: 1.0, velvetFalloff: 3.0, texture: 'none' },
            'iridescent': { type: 'glossy', albedo: [1.0, 1.0, 1.0], roughness: 0.03, iridescence: 1.0, iridescenceIOR: 1.4, iridescenceThickness: 400.0, texture: 'none' },
            'jade': { type: 'glossy', albedo: [0.2, 0.6, 0.4], roughness: 0.3, sss: 1.0, scatterDistance: 0.15, scatterDensity: 5.0, texture: 'none' },
            'beer-glass': { type: 'glass', ior: 1.5, albedo: [0.9, 0.5, 0.1], absorption: 2.0 }, // Pure absorption, no scattering
            'hair-brown': { type: 'glossy', albedo: [0.4, 0.25, 0.15], roughness: 0.3, hair: 1.0, hairShift: 0.05, hairRoughness2: 0.5, texture: 'none' },
            'pearl': { type: 'glossy', albedo: [0.95, 0.92, 0.88], roughness: 0.1, pearl: 1.0, pearlDepth: 0.05, pearlIOR: 1.6, texture: 'none' },
            'triple-layer': { type: 'glossy', albedo: [0.15, 0.6, 0.9], roughness: 0.4, tripleLayer: 1.0, anisotropy: 0.7, clearcoat: 1.0, clearcoatRoughness: 0.02, texture: 'fbm' },
            'fractal-emissive': { type: 'glossy', albedo: [0.2, 0.6, 1.0], roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.05, surreal: 1.0, surrealType: 1.0, texture: 'fbm' },
            'black-hole': { type: 'glossy', albedo: [0.05, 0.05, 0.1], roughness: 0.01, surreal: 1.0, surrealType: 2.0, texture: 'none' },
            'angle-rainbow': { type: 'glossy', albedo: [1.0, 1.0, 1.0], roughness: 0.1, surreal: 1.0, surrealType: 3.0, texture: 'none' },
            'impossible': { type: 'glossy', albedo: [0.8, 0.2, 0.9], roughness: 0.2, surreal: 1.0, surrealType: 4.0, texture: 'none' },
            'chromatic-geometry': { type: 'glossy', albedo: [0.5, 0.5, 0.5], roughness: 0.15, surreal: 1.0, surrealType: 5.0, texture: 'none' },
            'variable-coat-fractal': { type: 'glossy', albedo: [0.2, 0.1, 0.6], roughness: 0.5, variableCoat: 1.0, clearcoat: 1.0, clearcoatRoughness: 0.02, iridescence: 0.8, iridescenceIOR: 1.45, iridescenceThickness: 380.0, texture: 'fbm' },
            'variable-coat-grid': { type: 'glossy', albedo: [0.1, 0.5, 0.3], roughness: 0.4, variableCoat: 2.0, clearcoat: 1.0, clearcoatRoughness: 0.01, iridescence: 0.6, iridescenceIOR: 1.4, iridescenceThickness: 420.0, texture: 'none' },
            'energy-shield': { type: 'glossy', albedo: [0.1, 0.8, 1.0], roughness: 0.05, animated: 1.0, animSpeed: 2.0, animType: 1.0, emission: [0.2, 0.5, 1.0], texture: 'none' },
            'holographic': { type: 'glossy', albedo: [1.0, 1.0, 1.0], roughness: 0.02, animated: 1.0, animSpeed: 3.0, animType: 3.0, iridescence: 1.0, iridescenceIOR: 1.3, iridescenceThickness: 500.0, texture: 'none' },
            'quantum-foam': { type: 'glossy', albedo: [0.9, 0.9, 1.0], roughness: 0.3, animated: 1.0, animSpeed: 5.0, animType: 4.0, texture: 'none' },
            'glossy-plastic': { type: 'glossy', albedo: [0.2, 0.6, 0.9], roughness: 0.08 },
        };
        return presets[name] || presets['gold-fbm'];
    }
    
    // Change center sphere material
    changeCenterSphereMaterial(materialName) {
        const material = this.getMaterialPreset(materialName);
        const sphere = this.scene.spheres[this.centerSphereIndex];
        
        // Update sphere material
        sphere.material = material;
        
        console.log(`🎨 Changed center sphere to: ${materialName}`, material);
        
        // Trigger re-render
        if (this.rayTracer) {
            this.rayTracer.frame = 0;
            this.rayTracer.needsUpdate = true;
        }
    }
    
    setupEventListeners() {
        // Material selector
        const materialSelector = document.getElementById('center-sphere-material');
        const anisotropyControls = document.getElementById('anisotropy-controls');
        const clearcoatControls = document.getElementById('clearcoat-controls');
        
        if (materialSelector) {
            materialSelector.addEventListener('change', (e) => {
                this.changeCenterSphereMaterial(e.target.value);
                
                // Show/hide material-specific controls
                if (anisotropyControls) {
                    anisotropyControls.style.display = (e.target.value === 'brushed-metal') ? 'block' : 'none';
                }
                if (clearcoatControls) {
                    clearcoatControls.style.display = (e.target.value === 'car-paint') ? 'block' : 'none';
                }
            });
        }
        
        // Anisotropy controls
        this.bindSlider('anisotropy-strength', 'anisotropy-value', (v) => {
            const sphere = this.scene.spheres[this.centerSphereIndex];
            if (sphere && sphere.material) {
                sphere.material.anisotropy = parseFloat(v);
                this.rayTracer.frame = 0;
                this.rayTracer.needsUpdate = true;
            }
        }, (v) => parseFloat(v).toFixed(2));
        
        this.bindSlider('anisotropy-rotation', 'anisotropy-rotation-value', (v) => {
            const sphere = this.scene.spheres[this.centerSphereIndex];
            if (sphere && sphere.material) {
                sphere.material.anisotropyRotation = parseFloat(v);
                this.rayTracer.frame = 0;
                this.rayTracer.needsUpdate = true;
            }
        }, (v) => `${parseFloat(v).toFixed(0)}°`);
        
        // Clear coat controls
        this.bindSlider('clearcoat-strength', 'clearcoat-strength-value', (v) => {
            const sphere = this.scene.spheres[this.centerSphereIndex];
            if (sphere && sphere.material) {
                sphere.material.clearcoat = parseFloat(v);
                this.rayTracer.frame = 0;
                this.rayTracer.needsUpdate = true;
            }
        }, (v) => parseFloat(v).toFixed(2));
        
        this.bindSlider('clearcoat-roughness', 'clearcoat-roughness-value', (v) => {
            const sphere = this.scene.spheres[this.centerSphereIndex];
            if (sphere && sphere.material) {
                sphere.material.clearcoatRoughness = parseFloat(v);
                this.rayTracer.frame = 0;
                this.rayTracer.needsUpdate = true;
            }
        }, (v) => parseFloat(v).toFixed(2));
        
        this.bindSlider('base-roughness', 'base-roughness-value', (v) => {
            const sphere = this.scene.spheres[this.centerSphereIndex];
            if (sphere && sphere.material) {
                sphere.material.roughness = parseFloat(v);
                this.rayTracer.frame = 0;
                this.rayTracer.needsUpdate = true;
            }
        }, (v) => parseFloat(v).toFixed(2));
        
        // Scene controls (depth arrays and reset)
        
        document.getElementById('add-depth-array-dense').addEventListener('click', () => {
            // Dense array: small spheres, more of them
            const colors = [
                [1.0, 0.2, 0.2], // Red
                [1.0, 0.6, 0.2], // Orange
                [1.0, 1.0, 0.2], // Yellow
                [0.2, 1.0, 0.2], // Green
                [0.2, 0.6, 1.0], // Blue
                [0.6, 0.2, 1.0], // Purple
                [1.0, 0.2, 0.6]  // Magenta
            ];
            
            // Create a dense grid of small spheres
            for (let i = 0; i < 9; i++) {
                const z = 1.5 + i * 1.2; // From 1.5m to 11m
                const y = -0.5; // Ground level
                
                // Create 5 spheres at this depth
                for (let j = -2; j <= 2; j++) {
                    const x = j * 0.6;
                    this.scene.addSphere([x, y, z], 0.1, { 
                        type: 'diffuse', 
                        albedo: colors[i % colors.length] 
                    });
                }
            }
            
            this.rayTracer.needsUpdate = true;
        });
        
        document.getElementById('add-depth-array-thin').addEventListener('click', () => {
            // Thin array: bigger spheres, less of them
            const colors = [
                [1.0, 0.2, 0.2], // Red
                [1.0, 0.6, 0.2], // Orange
                [1.0, 1.0, 0.2], // Yellow
                [0.2, 1.0, 0.2], // Green
                [0.2, 0.6, 1.0], // Blue
                [0.6, 0.2, 1.0], // Purple
                [1.0, 0.2, 0.6]  // Magenta
            ];
            
            // Create a thin grid of larger spheres
            for (let i = 0; i < 5; i++) {
                const z = 2 + i * 2.0; // From 2m to 10m
                const y = -0.5; // Ground level
                
                // Create 3 spheres at this depth
                for (let j = -1; j <= 1; j++) {
                    const x = j * 1.0;
                    this.scene.addSphere([x, y, z], 0.25, { 
                        type: 'diffuse', 
                        albedo: colors[i % colors.length] 
                    });
                }
            }
            
            this.rayTracer.needsUpdate = true;
        });
        
        document.getElementById('reset-scene').addEventListener('click', () => {
            this.scene.clear();
            this.setupDefaultScene();
            this.rayTracer.needsUpdate = true;
        });
        
        // Mouse tracking for gizmo interaction
        this.sceneCanvas.addEventListener('mousemove', (e) => {
            const rect = this.sceneCanvas.getBoundingClientRect();
            this.mouseX = (e.clientX - rect.left) / rect.width;
            this.mouseY = (e.clientY - rect.top) / rect.height;
            
            // Handle dragging
            if (this.isDragging && this.selectedObject) {
                this.updateDraggedObject();
            }
            
            // Check if hovering over focus points
            this.updateHoveredObject();
        });
        
        this.sceneCanvas.addEventListener('mousedown', (e) => {
            if (this.hoveredObject && (this.camera.showFocusPoints || this.camera.showFocusAxes)) {
                // Start dragging gizmo
                this.isDragging = true;
                this.selectedObject = this.hoveredObject;
                this.dragButton = e.button; // 0=left, 2=right
                
                // Store initial state for rotation
                if (this.selectedObject === 'pointA' || this.selectedObject === 'pointB' || this.selectedObject === 'pointC') {
                    this.dragStartMousePos = {x: this.mouseX, y: this.mouseY};
                    this.dragStartFocusPoints = {
                        A: {...this.camera.focusPointA},
                        B: {...this.camera.focusPointB},
                        C: {...this.camera.focusPointC}
                    };
                }
                
                this.updateGizmoStatus(); // Update status to "Dragging"
                console.log(`🖱️ Clicked: ${this.selectedObject} (button: ${e.button})`);
                e.preventDefault(); // Prevent autofocus and context menu
                return;
            }
        });
        
        this.sceneCanvas.addEventListener('mouseup', () => {
            if (this.isDragging) {
                console.log(`🖱️ Released: ${this.selectedObject}`);
            }
            this.isDragging = false;
            this.updateGizmoStatus(); // Update status back to "Hovering" or hide
        });
        
        this.sceneCanvas.addEventListener('mouseleave', () => {
            this.hoveredObject = null;
            this.isDragging = false;
            this.camera.hoveredGizmo = null;
            this.updateGizmoStatus(); // Hide status
            if (this.rayTracer) {
                this.rayTracer.needsUpdate = true;
            }
        });
        
        // Prevent context menu on right-click
        this.sceneCanvas.addEventListener('contextmenu', (e) => {
            if (this.camera.showFocusPoints || this.camera.showFocusAxes) {
                e.preventDefault();
            }
        });
        
        // Autofocus: Click on canvas to focus on that point
        this.sceneCanvas.style.cursor = 'crosshair'; // Visual hint for autofocus
        
        this.sceneCanvas.addEventListener('click', (e) => {
            // Skip if we clicked on a gizmo
            if (this.selectedObject) {
                this.selectedObject = null;
                return;
            }
            const rect = this.sceneCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Convert to UV coordinates (0 to 1)
            const u = x / rect.width;
            const v = y / rect.height;
            
            // Cast ray to find distance
            const distance = this.raycastForDistance(u, v);
            
            if (distance > 0) {
                // Start smooth animation to new focus distance
                this.autofocusTarget = distance;
                //console.log(`🎯 Autofocus: ${this.camera.focusDistance.toFixed(2)}m → ${distance.toFixed(2)}m`);
                
                // Visual feedback
                this.sceneCanvas.style.cursor = 'wait';
                setTimeout(() => {
                    this.sceneCanvas.style.cursor = 'crosshair';
                }, 1500);
            } else {
                //console.log('⚠️ No object found at clicked position');
            }
        });
    }
    
    // Update dragged object position
    updateDraggedObject() {
        if (this.selectedObject === 'center') {
            // Center sphere: move entire plane
            const center = {
                x: (this.camera.focusPointA.x + this.camera.focusPointB.x + this.camera.focusPointC.x) / 3,
                y: (this.camera.focusPointA.y + this.camera.focusPointB.y + this.camera.focusPointC.y) / 3,
                z: (this.camera.focusPointA.z + this.camera.focusPointB.z + this.camera.focusPointC.z) / 3
            };
            
            const ray = this.getRayFromScreen(this.mouseX, this.mouseY);
            let newCenter;
            
            if (this.dragButton === 0) {
                // Left-click: move in screen-parallel plane
                newCenter = this.intersectRayWithScreenPlane(ray, center);
            } else if (this.dragButton === 2) {
                // Right-click: move in XY plane (constant height)
                newCenter = this.intersectRayWithXYPlane(ray, center.y);
            }
            
            if (newCenter) {
                // Calculate offset and move all points
                const offset = {
                    x: newCenter.x - center.x,
                    y: newCenter.y - center.y,
                    z: newCenter.z - center.z
                };
                
                this.camera.focusPointA.x += offset.x;
                this.camera.focusPointA.y += offset.y;
                this.camera.focusPointA.z += offset.z;
                
                this.camera.focusPointB.x += offset.x;
                this.camera.focusPointB.y += offset.y;
                this.camera.focusPointB.z += offset.z;
                
                this.camera.focusPointC.x += offset.x;
                this.camera.focusPointC.y += offset.y;
                this.camera.focusPointC.z += offset.z;
                
                this.rayTracer.needsUpdate = true;
            }
        } else if (this.selectedObject === 'pointA' || this.selectedObject === 'pointB' || this.selectedObject === 'pointC') {
            // RGB spheres: rotate within corresponding circle
            this.rotateFocalPlane(this.selectedObject);
        }
    }
    
    // Check if mouse is hovering over any gizmo objects
    updateHoveredObject() {
        // Show hover detection when any gizmo element is visible
        if (!this.camera.showFocusPoints && !this.camera.showFocusAxes) {
            this.hoveredObject = null;
            this.camera.hoveredGizmo = null;
            this._hoverDetectionActive = false; // Reset so we log again when re-enabled
            return;
        }
        
        // Debug: Log once when hover detection starts working
        if (!this._hoverDetectionActive) {
            console.log('✅ Hover detection is now active (visualization enabled)');
            console.log('Focus points:', this.camera.focusPointA, this.camera.focusPointB, this.camera.focusPointC);
            console.log('Camera position:', this.camera.position);
            this._hoverDetectionActive = true;
        }
        
        // Cast ray from camera through mouse position
        const ray = this.getRayFromScreen(this.mouseX, this.mouseY);
        
        // Test intersection with focus points
        const pointA = this.camera.focusPointA;
        const pointB = this.camera.focusPointB;
        const pointC = this.camera.focusPointC;
        const center = {
            x: (pointA.x + pointB.x + pointC.x) / 3,
            y: (pointA.y + pointB.y + pointC.y) / 3,
            z: (pointA.z + pointB.z + pointC.z) / 3
        };
        
        const radius = 0.06; // Same as all gizmo spheres
        const centerRadius = 0.06;
        
        // Check intersections (closest first)
        let closestDist = Infinity;
        let closest = null;
        
        // Test center sphere
        const tCenter = this.raySphereIntersect(ray, center, centerRadius);
        if (tCenter > 0 && tCenter < closestDist) {
            closestDist = tCenter;
            closest = 'center';
        }
        
        // Test point A (blue)
        const tA = this.raySphereIntersect(ray, pointA, radius);
        if (tA > 0 && tA < closestDist) {
            closestDist = tA;
            closest = 'pointA';
        }
        
        // Test point B (green)
        const tB = this.raySphereIntersect(ray, pointB, radius);
        if (tB > 0 && tB < closestDist) {
            closestDist = tB;
            closest = 'pointB';
        }
        
        // Test point C (red)
        const tC = this.raySphereIntersect(ray, pointC, radius);
        if (tC > 0 && tC < closestDist) {
            closestDist = tC;
            closest = 'pointC';
        }
        
        // Only update if changed to avoid excessive redraws
        if (this.hoveredObject !== closest) {
            this.hoveredObject = closest;
            
            // Pass to shader for glow effect
            this.camera.hoveredGizmo = closest;
            if (this.rayTracer) {
                this.rayTracer.needsUpdate = true;
            }
            
            // Update on-screen status
            this.updateGizmoStatus();
            
            // Debug log
            if (closest) {
                console.log(`🎯 Hovering: ${closest}`);
            } else {
                console.log(`🎯 Hover cleared`);
            }
        }
    }
    
    // Update on-screen gizmo status text
    updateGizmoStatus() {
        const statusDiv = document.getElementById('gizmo-status');
        if (!statusDiv) return;
        
        // Build status text
        let statusText = '';
        
        if (this.isDragging && this.selectedObject) {
            if (this.selectedObject === 'center') {
                statusText = `🖱️ Dragging Center: LMB = XY plane, RMB = XZ plane`;
            } else if (this.selectedObject === 'pointA' || this.selectedObject === 'pointB' || this.selectedObject === 'pointC') {
                statusText = `🖱️ Hold mouse and move to rotate the focal plane`;
            } else {
                statusText = `🖱️ Dragging: ${this.getGizmoDisplayName(this.selectedObject)}`;
            }
            statusDiv.style.borderColor = '#ff4a4a';
        } else if (this.hoveredObject) {
            if (this.hoveredObject === 'center') {
                statusText = `👆 Center Sphere: LMB drag = XY plane, RMB drag = XZ plane`;
            } else if (this.hoveredObject === 'pointA' || this.hoveredObject === 'pointB' || this.hoveredObject === 'pointC') {
                statusText = `👆 ${this.getGizmoDisplayName(this.hoveredObject)}: Hold mouse and move to rotate focal plane`;
            } else {
                statusText = `👆 Hovering: ${this.getGizmoDisplayName(this.hoveredObject)}`;
            }
            statusDiv.style.borderColor = '#4a9eff';
        }
        
        // Show/hide and update text
        if (statusText) {
            statusDiv.textContent = statusText;
            statusDiv.style.display = 'block';
        } else {
            statusDiv.style.display = 'none';
        }
    }
    
    // Get display name for gizmo
    getGizmoDisplayName(gizmo) {
        const names = {
            'pointA': 'Blue Sphere (Point A), won\'t really change anyting',
            'pointB': 'Green Sphere (Point B)',
            'pointC': 'Red Sphere (Point C)',
            'center': 'Yellow Center Sphere',
            'axisX': 'X Axis (Red)',
            'axisY': 'Y Axis (Green)',
            'axisZ': 'Z Axis (Blue)',
            'circleX': 'X Rotation Circle (Red)',
            'circleY': 'Y Rotation Circle (Green)',
            'circleZ': 'Z Rotation Circle (Blue)'
        };
        return names[gizmo] || gizmo;
    }
    
    // Get ray from camera through screen position (u, v in 0-1)
    getRayFromScreen(u, v) {
        const forward = this.normalize(this.subtract(this.camera.lookAt, this.camera.position));
        const right = this.normalize(this.cross(forward, [0, 1, 0]));
        const up = this.cross(right, forward);
        
        // Convert to NDC (-1 to 1)
        const ndcX = u * 2 - 1;
        const ndcY = 1 - v * 2; // Flip Y
        
        // Calculate FOV from focal length and film size (MUST match shader calculation!)
        const aspectRatio = this.sceneCanvas.width / this.sceneCanvas.height;
        const filmDiagonal = this.camera.filmSize / 1000.0; // mm to m
        const filmHeight = filmDiagonal / Math.sqrt(1.0 + aspectRatio * aspectRatio);
        const focalLengthM = this.camera.focalLength / 1000.0; // mm to m
        const fovRad = 2.0 * Math.atan(filmHeight / (2.0 * focalLengthM));
        const halfHeight = Math.tan(fovRad / 2);
        const halfWidth = halfHeight * aspectRatio;
        
        const direction = [
            forward[0] + right[0] * ndcX * halfWidth + up[0] * ndcY * halfHeight,
            forward[1] + right[1] * ndcX * halfWidth + up[1] * ndcY * halfHeight,
            forward[2] + right[2] * ndcX * halfWidth + up[2] * ndcY * halfHeight
        ];
        
        return {
            origin: this.camera.position,
            direction: this.normalize(direction)
        };
    }
    
    // Ray-sphere intersection test
    raySphereIntersect(ray, center, radius) {
        const oc = this.subtract(ray.origin, [center.x, center.y, center.z]);
        const a = this.dot(ray.direction, ray.direction);
        const b = 2.0 * this.dot(oc, ray.direction);
        const c = this.dot(oc, oc) - radius * radius;
        const discriminant = b * b - 4 * a * c;
        
        if (discriminant < 0) return -1;
        
        const t = (-b - Math.sqrt(discriminant)) / (2.0 * a);
        return t > 0.001 ? t : -1;
    }
    
    // Intersect ray with screen-parallel plane at given center point
    intersectRayWithScreenPlane(ray, center) {
        const forward = this.normalize(this.subtract(this.camera.lookAt, this.camera.position));
        
        // Plane perpendicular to camera forward direction
        const denom = this.dot(ray.direction, forward);
        if (Math.abs(denom) < 0.001) return null;
        
        // Distance from camera to center point along forward direction
        const centerVec = [center.x - this.camera.position[0], 
                          center.y - this.camera.position[1], 
                          center.z - this.camera.position[2]];
        const planeDist = this.dot(centerVec, forward);
        const planePoint = [
            this.camera.position[0] + forward[0] * planeDist,
            this.camera.position[1] + forward[1] * planeDist,
            this.camera.position[2] + forward[2] * planeDist
        ];
        
        const t = this.dot(this.subtract(planePoint, ray.origin), forward) / denom;
        if (t < 0) return null;
        
        return {
            x: ray.origin[0] + ray.direction[0] * t,
            y: ray.origin[1] + ray.direction[1] * t,
            z: ray.origin[2] + ray.direction[2] * t
        };
    }
    
    // Intersect ray with XY plane at given height
    intersectRayWithXYPlane(ray, height) {
        const planeNormal = [0, 1, 0];
        const denom = this.dot(ray.direction, planeNormal);
        
        if (Math.abs(denom) < 0.001) return null;
        
        const planePoint = [0, height, 0];
        const t = this.dot(this.subtract(planePoint, ray.origin), planeNormal) / denom;
        
        if (t < 0) return null;
        
        return {
            x: ray.origin[0] + ray.direction[0] * t,
            y: height,
            z: ray.origin[2] + ray.direction[2] * t
        };
    }
    
    // Rotate focal plane by dragging RGB sphere
    rotateFocalPlane(sphere) {
        // Get center of triangle
        const center = {
            x: (this.dragStartFocusPoints.A.x + this.dragStartFocusPoints.B.x + this.dragStartFocusPoints.C.x) / 3,
            y: (this.dragStartFocusPoints.A.y + this.dragStartFocusPoints.B.y + this.dragStartFocusPoints.C.y) / 3,
            z: (this.dragStartFocusPoints.A.z + this.dragStartFocusPoints.B.z + this.dragStartFocusPoints.C.z) / 3
        };
        
        // Get rotation axis based on which sphere is dragged
        // Calculate axes from initial state
        const planeNormal = this.normalize(this.cross(
            this.subtract([this.dragStartFocusPoints.B.x, this.dragStartFocusPoints.B.y, this.dragStartFocusPoints.B.z],
                         [this.dragStartFocusPoints.A.x, this.dragStartFocusPoints.A.y, this.dragStartFocusPoints.A.z]),
            this.subtract([this.dragStartFocusPoints.C.x, this.dragStartFocusPoints.C.y, this.dragStartFocusPoints.C.z],
                         [this.dragStartFocusPoints.A.x, this.dragStartFocusPoints.A.y, this.dragStartFocusPoints.A.z])
        ));
        
        const xAxis = this.normalize(this.subtract(
            [this.dragStartFocusPoints.B.x, this.dragStartFocusPoints.B.y, this.dragStartFocusPoints.B.z],
            [this.dragStartFocusPoints.A.x, this.dragStartFocusPoints.A.y, this.dragStartFocusPoints.A.z]
        ));
        
        const yAxis = this.normalize(this.cross(planeNormal, xAxis));
        
        // Choose rotation axis based on dragged sphere
        // Blue sphere (A) should rotate around blue Z axis (plane normal)
        // Green sphere (B) should rotate around green Y axis ✓
        // Red sphere (C) should rotate around red X axis
        let rotAxis;
        if (sphere === 'pointA') rotAxis = planeNormal; // Blue sphere → Blue Z axis
        else if (sphere === 'pointB') rotAxis = yAxis;  // Green sphere → Green Y axis
        else if (sphere === 'pointC') rotAxis = xAxis;  // Red sphere → Red X axis
        
        // Calculate rotation angle from mouse movement
        const mouseDelta = {
            x: this.mouseX - this.dragStartMousePos.x,
            y: this.mouseY - this.dragStartMousePos.y
        };
        
        const angle = (mouseDelta.x - mouseDelta.y) * 3.0; // Sensitivity factor
        
        // Rotate all three points around center
        const rotatePoint = (point) => {
            const p = [point.x - center.x, point.y - center.y, point.z - center.z];
            const rotated = this.rotateAroundAxis(p, rotAxis, angle);
            return {
                x: rotated[0] + center.x,
                y: rotated[1] + center.y,
                z: rotated[2] + center.z
            };
        };
        
        this.camera.focusPointA = rotatePoint(this.dragStartFocusPoints.A);
        this.camera.focusPointB = rotatePoint(this.dragStartFocusPoints.B);
        this.camera.focusPointC = rotatePoint(this.dragStartFocusPoints.C);
        
        this.rayTracer.needsUpdate = true;
    }
    
    // Rotate vector around axis by angle (radians)
    rotateAroundAxis(v, axis, angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const t = 1 - c;
        
        const x = v[0], y = v[1], z = v[2];
        const ax = axis[0], ay = axis[1], az = axis[2];
        
        return [
            (t * ax * ax + c) * x + (t * ax * ay - s * az) * y + (t * ax * az + s * ay) * z,
            (t * ax * ay + s * az) * x + (t * ay * ay + c) * y + (t * ay * az - s * ax) * z,
            (t * ax * az - s * ay) * x + (t * ay * az + s * ax) * y + (t * az * az + c) * z
        ];
    }
    
    // Raycast to find distance at pixel (u, v)
    raycastForDistance(u, v) {
        // Generate camera ray (same as in shader)
        const forward = this.normalize(this.subtract(this.camera.lookAt, this.camera.position));
        const right = this.normalize(this.cross(forward, [0, 1, 0]));
        const up = this.cross(right, forward);
        
        // Calculate FOV from focal length and film size
        const filmDiagonal = this.camera.filmSize / 1000.0; // mm to m
        const aspectRatio = this.sceneCanvas.width / this.sceneCanvas.height;
        const filmHeight = filmDiagonal / Math.sqrt(1.0 + aspectRatio * aspectRatio);
        const focalLengthM = this.camera.focalLength / 1000.0;
        const fovRad = 2.0 * Math.atan(filmHeight / (2.0 * focalLengthM));
        const viewportHeight = 2.0 * Math.tan(fovRad / 2.0);
        const viewportWidth = viewportHeight * aspectRatio;
        
        // Convert UV to NDC coordinates (-1 to 1)
        const coord = [(u * 2 - 1), (1 - v * 2)]; // Flip Y
        
        // Calculate ray direction
        const targetPoint = this.add(
            forward,
            this.add(
                this.scale(right, coord[0] * viewportWidth * 0.5),
                this.scale(up, coord[1] * viewportHeight * 0.5)
            )
        );
        
        const rayDir = this.normalize(targetPoint);
        
        // Intersect with scene
        let closestT = Infinity;
        
        // Check spheres
        for (const sphere of this.scene.spheres) {
            const oc = this.subtract(this.camera.position, sphere.center);
            const a = this.dot(rayDir, rayDir);
            const b = 2.0 * this.dot(oc, rayDir);
            const c = this.dot(oc, oc) - sphere.radius * sphere.radius;
            const discriminant = b * b - 4 * a * c;
            
            if (discriminant >= 0) {
                const t = (-b - Math.sqrt(discriminant)) / (2.0 * a);
                if (t > 0.001 && t < closestT) {
                    closestT = t;
                }
            }
        }
        
        // Check ground plane (y = -1)
        const tPlane = -(this.camera.position[1] + 1.0) / rayDir[1];
        if (tPlane > 0.001 && tPlane < closestT) {
            closestT = tPlane;
        }
        
        return closestT < Infinity ? closestT : -1;
    }
    
    // Vector math helpers
    add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
    subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    scale(v, s) { return [v[0] * s, v[1] * s, v[2] * s]; }
    dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    cross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }
    normalize(v) {
        const len = Math.sqrt(this.dot(v, v));
        return len > 0 ? this.scale(v, 1.0 / len) : v;
    }
    
    setupControlBindings() {
        // Render settings - Min Bounces + Bounce Range
        this.bindSlider('min-bounces', 'min-bounces-value', (v) => {
            this.rayTracer.minBounces = parseInt(v);
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindSlider('bounce-range', 'bounce-range-value', (v) => {
            this.rayTracer.bounceRange = parseInt(v);
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindSlider('vpt-max-bounces', 'vpt-bounces-value', (v) => {
            this.rayTracer.vptMaxBounces = parseInt(v);
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindSlider('target-spp', 'target-spp-value', (v) => {
            this.targetSPP = parseInt(v);
            // Update display
            const display = document.getElementById('target-spp-display');
            if (display) display.textContent = this.targetSPP;
        });
        
        this.bindSlider('samples-per-pixel', 'spp-value', (v) => {
            this.rayTracer.samplesPerPixel = parseInt(v);
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindSlider('supersample', 'supersample-value', (v) => {
            this.rayTracer.supersample = parseInt(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => `${v}x${v}`);
        
        const reconstructionFilter = document.getElementById('reconstruction-filter');
        if (reconstructionFilter) {
            // Set initial value from HTML
            this.rayTracer.reconstructionKernel = parseInt(reconstructionFilter.value);
            
            reconstructionFilter.addEventListener('change', () => {
                this.rayTracer.reconstructionKernel = parseInt(reconstructionFilter.value);
                this.rayTracer.needsUpdate = true;
            });
        }
        
        // VPT toggle - controls volumetric path tracing
        this.bindCheckbox('enable-vpt', (checked) => {
            this.rayTracer.enableVPT = checked;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindCheckbox('visualize-focus', (checked) => {
            this.rayTracer.visualizeFocus = checked;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindCheckbox('animate-lights', (checked) => {
            this.animateLights = checked;
            this.rayTracer.isAnimating = checked;
            
            if (!checked) {
                // Reset light to initial position
                for (const light of this.lights) {
                    if (light.initialPos) {
                        this.scene.spheres[light.index].center = light.initialPos;
                    }
                }
                this.rayTracer.needsUpdate = true;
            }
        });
        
        this.bindSlider('focus-tolerance', 'tolerance-value', (v) => {
            this.rayTracer.focusTolerance = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(1));
        
        this.bindSlider('scheimpflug-tolerance', 'scheimpflug-tolerance-value', (v) => {
            this.rayTracer.scheimpflugTolerance = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(1));
        
        // Focus visualization mode
        const focusVisModeSelect = document.getElementById('focus-vis-mode');
        if (focusVisModeSelect) {
            focusVisModeSelect.addEventListener('change', () => {
                this.rayTracer.focusVisMode = focusVisModeSelect.value;
                this.rayTracer.needsUpdate = true;
            });
        }

        // Environment
        this.bindSlider('sky-intensity', 'sky-value', (v) => {
            this.scene.skyIntensity = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(1));
        
        this.bindSlider('fog-density', 'fog-value', (v) => {
            this.scene.fogDensity = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(2));
        
        // Ground pattern
        const groundPatternSelect = document.getElementById('ground-pattern');
        if (groundPatternSelect) {
            groundPatternSelect.addEventListener('change', () => {
                this.scene.groundPattern = parseFloat(groundPatternSelect.value);
                this.rayTracer.needsUpdate = true;
            });
        }
        
        this.bindSlider('ground-pattern-scale', 'ground-scale-value', (v) => {
            this.scene.groundPatternScale = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(1));
        
        // Camera type
        document.getElementById('camera-type').addEventListener('change', (e) => {
            this.camera.type = e.target.value;
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        });
        
        // Camera rotation controls
        this.bindSlider('cam-yaw', 'cam-yaw-value', (v) => {
            this.camera.yaw = parseFloat(v);
            this.camera.updateRotation();
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(0)}°`);
        
        this.bindSlider('cam-pitch', 'cam-pitch-value', (v) => {
            this.camera.pitch = parseFloat(v);
            this.camera.updateRotation();
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(0)}°`);
        
        this.bindSlider('cam-distance', 'cam-distance-value', (v) => {
            this.camera.distance = parseFloat(v);
            this.camera.updateRotation();
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(1)}m`);
        
        // Lens distortion
        document.getElementById('distortion-type').addEventListener('change', (e) => {
            this.camera.distortionType = e.target.value;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindSlider('distortion-amount', 'distortion-value', (v) => {
            this.camera.distortionAmount = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(2));
        
        // Aperture
        const apertureShapeSelect = document.getElementById('aperture-shape');
        const aperturePreview = document.getElementById('aperture-preview');
        const shapeEmojis = {
            'circular': '⚪',
            'polygon': '⬡',
            'hexagonal': '⬡',
            'square': '⬜',
            'star': '⭐',
            'ring': '🍩',
            'diagonal': '⚡',
            'coded': '🔬',
            'pinhole-grid': '📐',
            'heart': '❤️',
            'cat': '🐱'
        };
        
        apertureShapeSelect.addEventListener('change', (e) => {
            this.camera.apertureShape = e.target.value;
            if (aperturePreview) {
                aperturePreview.textContent = shapeEmojis[e.target.value] || '⭐';
            }
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        });
        
        this.bindSlider('aperture-size', 'aperture-value', (v) => {
            // Convert slider (0-120) to f-stop with piecewise logarithmic scale
            // Range: f/0.01 to f/128 (extended for extreme control)
            // Extra resolution in the critical f/1.4 - f/16 blur transition region
            const sliderVal = parseFloat(v);
            let fstop;
            
            if (sliderVal <= 35) {
                // 0-35: f/0.01 to f/1.4 (ultra-wide apertures, extreme shallow DOF)
                const t = sliderVal / 35;
                fstop = Math.exp(Math.log(0.01) + t * (Math.log(1.4) - Math.log(0.01)));
            } else if (sliderVal <= 75) {
                // 35-75: f/1.4 to f/16 (critical transition range - 40% of slider)
                const t = (sliderVal - 35) / 40;
                fstop = Math.exp(Math.log(1.4) + t * (Math.log(16) - Math.log(1.4)));
            } else {
                // 75-120: f/16 to f/128 (deep DOF, extended range)
                const t = (sliderVal - 75) / 45;
                fstop = Math.exp(Math.log(16) + t * (Math.log(128) - Math.log(16)));
            }
            
            this.camera.apertureFStop = fstop;
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => {
            const sliderVal = parseFloat(v);
            let fstop;
            
            if (sliderVal <= 35) {
                const t = sliderVal / 35;
                fstop = Math.exp(Math.log(0.01) + t * (Math.log(1.4) - Math.log(0.01)));
            } else if (sliderVal <= 75) {
                const t = (sliderVal - 35) / 40;
                fstop = Math.exp(Math.log(1.4) + t * (Math.log(16) - Math.log(1.4)));
            } else {
                const t = (sliderVal - 75) / 45;
                fstop = Math.exp(Math.log(16) + t * (Math.log(128) - Math.log(16)));
            }
            
            if (fstop < 1) return `f/${fstop.toFixed(2)}`;
            if (fstop < 10) return `f/${fstop.toFixed(1)}`;
            return `f/${fstop.toFixed(0)}`;
        });
        
        this.bindSlider('aperture-blades', 'blades-value', (v) => {
            this.camera.apertureBlades = parseInt(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        });
        
        // Aperture shift controls
        this.bindSlider('aperture-shift-x', 'aperture-shift-x-value', (v) => {
            this.camera.apertureShiftX = parseFloat(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(3));
        
        this.bindSlider('aperture-shift-y', 'aperture-shift-y-value', (v) => {
            this.camera.apertureShiftY = parseFloat(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(3));
        
        this.bindSlider('aperture-shift-z', 'aperture-shift-z-value', (v) => {
            this.camera.apertureShiftZ = parseFloat(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(3));
        
        // Aperture tilt controls
        this.bindSlider('aperture-tilt-x', 'aperture-tilt-x-value', (v) => {
            this.camera.apertureTiltX = parseFloat(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(0)}°`);
        
        this.bindSlider('aperture-tilt-y', 'aperture-tilt-y-value', (v) => {
            this.camera.apertureTiltY = parseFloat(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(0)}°`);
        
        // Lens
        this.bindSlider('focal-length', 'focal-value', (v) => {
            this.camera.focalLength = parseFloat(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => `${v}mm`);
        
        this.bindSlider('focus-distance', 'focus-value', (v) => {
            this.camera.focusDistance = parseFloat(v);
            this.autofocusTarget = null; // Cancel autofocus if manually adjusted
            this.rayTracer.isAutofocusing = false;
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        });
        
        this.bindSlider('autofocus-speed', 'autofocus-speed-value', (v) => {
            this.autofocusSpeed = parseFloat(v);
        });
        
        this.bindSlider('autofocus-blend', 'autofocus-blend-value', (v) => {
            this.rayTracer.autofocusBlendFactor = parseFloat(v);
        });
        
        this.bindSlider('lens-elements', 'elements-value', (v) => {
            this.camera.lensElements = parseInt(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        });
        
        // Film shift controls
        this.bindSlider('film-shift-x', 'film-shift-x-value', (v) => {
            this.camera.filmShiftX = parseFloat(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(3));
        
        this.bindSlider('film-shift-y', 'film-shift-y-value', (v) => {
            this.camera.filmShiftY = parseFloat(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(3));
        
        this.bindSlider('film-shift-z', 'film-shift-z-value', (v) => {
            this.camera.filmShiftZ = parseFloat(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(3));
        
        // Film tilt controls
        this.bindSlider('film-tilt-x', 'tilt-x-value', (v) => {
            this.camera.filmTiltX = parseFloat(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(0)}°`);
        
        this.bindSlider('film-tilt-y', 'tilt-y-value', (v) => {
            this.camera.filmTiltY = parseFloat(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(0)}°`);
        
        // Sensor offset controls (viewport panning)
        this.bindSlider('sensor-offset-x', 'sensor-offset-x-value', (v) => {
            this.camera.sensorOffsetX = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(2));
        
        this.bindSlider('sensor-offset-y', 'sensor-offset-y-value', (v) => {
            this.camera.sensorOffsetY = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(2));
        
        this.bindSlider('film-curvature', 'curve-value', (v) => {
            this.camera.filmCurvature = parseFloat(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(2));
        
        this.bindSlider('film-size', 'film-size-value', (v) => {
            this.camera.filmSize = parseFloat(v);
            this.rayTracer.needsUpdate = true;
            this.cameraVisualizer.needsUpdate = true;
        }, (v) => `${v}mm`);
        
        // New tilt-shift mode (Ray Tracing Gems II)
        this.bindCheckbox('enable-new-tiltshift', (checked) => {
            this.camera.enableNewTiltShift = checked;
            this.rayTracer.needsUpdate = true;
        });
        
        // Show gizmo (all visualization elements together)
        this.bindCheckbox('show-gizmo', (checked) => {
            this.camera.showFocusPoints = checked;
            this.camera.showFocusAxes = checked;
            this.camera.showFocusTriangle = checked;
            this.rayTracer.needsUpdate = true;
            console.log(`🎯 Gizmo ${checked ? 'enabled' : 'disabled'}`);
        });
        
        // Focus points controlled by direct manipulation in 3D view (no sliders)
        // Triangle is now equilateral with side length 0.8
        
        
        // Visualization
        this.bindCheckbox('show-rays', (checked) => {
            this.cameraVisualizer.showRays = checked;
            this.cameraVisualizer.needsUpdate = true;
        });
        
        this.bindCheckbox('show-components', (checked) => {
            this.cameraVisualizer.showComponents = checked;
            this.cameraVisualizer.needsUpdate = true;
        });
        
        this.bindSlider('viz-ray-count', 'ray-count-value', (v) => {
            this.cameraVisualizer.rayCount = parseInt(v);
            this.cameraVisualizer.needsUpdate = true;
        });
        
        // Chromatic aberration
        const chromaticModeSelect = document.getElementById('chromatic-mode');
        const chromaticStrengthSlider = document.getElementById('chromatic-aberration');
        const rgbDebugDiv = document.getElementById('rgb-channel-debug');
        const spectralFilterDiv = document.getElementById('spectral-filter');
        const spectralMinSlider = document.getElementById('spectral-filter-min');
        const spectralMaxSlider = document.getElementById('spectral-filter-max');
        
        const rgbChannelCheckboxes = [
            document.getElementById('show-red-channel'),
            document.getElementById('show-green-channel'),
            document.getElementById('show-blue-channel')
        ];
        
        const updateChromaticUIState = () => {
            const enabled = this.camera.enableChromaticAberration;
            const isSpectrum = this.camera.chromaticAberrationMode === 'spectrum';
            
            if (chromaticModeSelect) chromaticModeSelect.disabled = !enabled;
            if (chromaticStrengthSlider) chromaticStrengthSlider.disabled = !enabled;
            
            // Show/hide mode-specific controls
            if (rgbDebugDiv) {
                rgbDebugDiv.style.display = (enabled && !isSpectrum) ? 'block' : 'none';
            }
            if (spectralFilterDiv) {
                spectralFilterDiv.style.display = (enabled && isSpectrum) ? 'block' : 'none';
            }
            
            // Enable/disable RGB channel checkboxes
            rgbChannelCheckboxes.forEach(cb => {
                if (cb) cb.disabled = !enabled || isSpectrum;
            });
            
            // Enable/disable spectral filter sliders
            if (spectralMinSlider) spectralMinSlider.disabled = !enabled || !isSpectrum;
            if (spectralMaxSlider) spectralMaxSlider.disabled = !enabled || !isSpectrum;
        };
        
        this.bindCheckbox('enable-chromatic-aberration', (checked) => {
            this.camera.enableChromaticAberration = checked;
            updateChromaticUIState();
            this.rayTracer.needsUpdate = true;
        });
        
        if (chromaticModeSelect) {
            chromaticModeSelect.addEventListener('change', (e) => {
                this.camera.chromaticAberrationMode = e.target.value;
                updateChromaticUIState();
                this.rayTracer.needsUpdate = true;
            });
        }
        
        this.bindSlider('chromatic-aberration', 'chromatic-aberration-value', (v) => {
            this.camera.chromaticAberration = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(1));
        
        // RGB channel debug toggles
        this.bindCheckbox('show-red-channel', (checked) => {
            this.camera.showRedChannel = checked;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindCheckbox('show-green-channel', (checked) => {
            this.camera.showGreenChannel = checked;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindCheckbox('show-blue-channel', (checked) => {
            this.camera.showBlueChannel = checked;
            this.rayTracer.needsUpdate = true;
        });
        
        // Spectral filter sliders
        this.bindSlider('spectral-filter-min', 'spectral-min-value', (v) => {
            this.camera.spectralFilterMin = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => {
            const val = parseFloat(v);
            if (val < 0.3) return `${val.toFixed(2)} (Red)`;
            if (val < 0.6) return `${val.toFixed(2)} (Green)`;
            return `${val.toFixed(2)} (Blue)`;
        });
        
        this.bindSlider('spectral-filter-max', 'spectral-max-value', (v) => {
            this.camera.spectralFilterMax = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => {
            const val = parseFloat(v);
            if (val < 0.3) return `${val.toFixed(2)} (Red)`;
            if (val < 0.6) return `${val.toFixed(2)} (Green)`;
            return `${val.toFixed(2)} (Blue)`;
        });
        
        // Lens chromatic aberration
        const lensCASlider = document.getElementById('lens-chromatic-aberration');
        const lensCAModeSelect = document.getElementById('lens-chromatic-mode');
        
        this.bindCheckbox('enable-lens-chromatic-aberration', (checked) => {
            this.camera.enableLensChromaticAberration = checked;
            if (lensCASlider) lensCASlider.disabled = !checked;
            if (lensCAModeSelect) lensCAModeSelect.disabled = !checked;
            this.rayTracer.needsUpdate = true;
        });
        
        if (lensCAModeSelect) {
            lensCAModeSelect.addEventListener('change', (e) => {
                this.camera.lensChromaticAberrationMode = e.target.value;
                this.rayTracer.needsUpdate = true;
            });
        }
        
        this.bindSlider('lens-chromatic-aberration', 'lens-chromatic-value', (v) => {
            this.camera.lensChromaticAberration = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(1));
        
        // Time-of-Flight (TOF) filtering
        const tofMinSlider = document.getElementById('tof-min-distance');
        const tofRangeSlider = document.getElementById('tof-range');
        
        this.bindCheckbox('enable-tof', (checked) => {
            this.camera.enableTOF = checked;
            if (tofMinSlider) tofMinSlider.disabled = !checked;
            if (tofRangeSlider) tofRangeSlider.disabled = !checked;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindSlider('tof-min-distance', 'tof-min-value', (v) => {
            this.camera.tofMinDistance = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(1)}m`);
        
        this.bindSlider('tof-range', 'tof-range-value', (v) => {
            this.camera.tofRange = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(1)}m`);
        
        // Planar Wave Light Source
        const planarWaveDistanceSlider = document.getElementById('planar-wave-distance');
        const planarWaveSizeSlider = document.getElementById('planar-wave-size');
        const planarWaveIntensitySlider = document.getElementById('planar-wave-intensity');
        const planarWaveCarrierSlider = document.getElementById('planar-wave-carrier');
        const planarWaveTiltSlider = document.getElementById('planar-wave-tilt');
        
        this.bindCheckbox('enable-planar-wave-light', (checked) => {
            this.camera.enablePlanarWaveLight = checked;
            if (planarWaveDistanceSlider) planarWaveDistanceSlider.disabled = !checked;
            if (planarWaveSizeSlider) planarWaveSizeSlider.disabled = !checked;
            if (planarWaveIntensitySlider) planarWaveIntensitySlider.disabled = !checked;
            if (planarWaveCarrierSlider) planarWaveCarrierSlider.disabled = !checked;
            if (planarWaveTiltSlider) planarWaveTiltSlider.disabled = !checked;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindCheckbox('disable-scene-lights', (checked) => {
            this.camera.disableSceneLights = checked;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindSlider('planar-wave-distance', 'planar-wave-distance-value', (v) => {
            this.camera.planarWaveLightDistance = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(1)}m`);
        
        this.bindSlider('planar-wave-size', 'planar-wave-size-value', (v) => {
            this.camera.planarWaveLightSize = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(1)}m`);
        
        this.bindSlider('planar-wave-intensity', 'planar-wave-intensity-value', (v) => {
            this.camera.planarWaveLightIntensity = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(1)}`);
        
        this.bindSlider('planar-wave-carrier', 'planar-wave-carrier-value', (v) => {
            this.camera.planarWaveCarrierFreq = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(1)} MHz`);
        
        this.bindSlider('planar-wave-tilt', 'planar-wave-tilt-value', (v) => {
            this.camera.planarWaveTiltAngle = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(1)}°`);
        
        // Reference Wave Controls
        this.bindCheckbox('enable-ref-wave', (checked) => {
            this.camera.enableReferenceWave = checked;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindCheckbox('ref-wave-color-mode', (checked) => {
            this.camera.referenceWaveColorMode = checked;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindSlider('ref-wave-intensity', 'ref-wave-intensity-value', (v) => {
            this.camera.referenceWaveIntensity = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(2)}`);
        
        this.bindSlider('ref-wave-freq', 'ref-wave-freq-value', (v) => {
            this.camera.referenceWaveFrequency = parseFloat(v) * 1e6; // Convert MHz to Hz
            this.rayTracer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(1)} MHz`);
        
        this.bindSlider('ref-wave-phase', 'ref-wave-phase-value', (v) => {
            this.camera.referenceWavePhase = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(0)}°`);
        
        // CW-ToF (Continuous Wave Time-of-Flight)
        const cwtofFreqSlider = document.getElementById('cwtof-freq');
        const cwtofPhaseSlider = document.getElementById('cwtof-phase');
        const cwtofWavelengthSlider = document.getElementById('cwtof-wavelength');
        const cwtofShowInterference = document.getElementById('cwtof-show-interference');
        const cwtofShowGroundTruth = document.getElementById('cwtof-show-ground-truth');
        const cwtofShowReconstruction = document.getElementById('cwtof-show-reconstruction');
        const cwtofPreviewOverlay = document.getElementById('cwtof-preview-overlay');
        const cwtofReconstructionCanvas = document.getElementById('cwtof-reconstruction-canvas');
        const cwtofCapture4PhaseBtn = document.getElementById('cwtof-capture-4phase');
        
        this.bindCheckbox('enable-cwtof', (checked) => {
            this.camera.enableCWToF = checked;
            if (cwtofFreqSlider) cwtofFreqSlider.disabled = !checked;
            if (cwtofPhaseSlider) cwtofPhaseSlider.disabled = !checked;
            if (cwtofWavelengthSlider) cwtofWavelengthSlider.disabled = !checked;
            if (cwtofShowInterference) cwtofShowInterference.disabled = !checked;
            if (cwtofShowGroundTruth) cwtofShowGroundTruth.disabled = !checked;
            if (cwtofShowReconstruction) cwtofShowReconstruction.disabled = !checked;
            if (cwtofCapture4PhaseBtn) cwtofCapture4PhaseBtn.disabled = !checked;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindCheckbox('cwtof-show-interference', (checked) => {
            this.camera.cwTofShowInterference = checked;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindCheckbox('cwtof-show-ground-truth', (checked) => {
            this.camera.cwTofShowDepth = checked;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindCheckbox('cwtof-show-reconstruction', (checked) => {
            this.camera.cwTofShowReconstruction = checked;
            if (cwtofPreviewOverlay) {
                cwtofPreviewOverlay.style.display = checked ? 'block' : 'none';
            }
            this.rayTracer.needsUpdate = true;
        });
        
        // 4-phase capture button
        if (cwtofCapture4PhaseBtn) {
            cwtofCapture4PhaseBtn.addEventListener('click', async () => {
                console.log('📸 Starting 4-phase CW-ToF capture...');
                this.isCapturingCWToF = true; // Disable auto-restart during capture
                cwtofCapture4PhaseBtn.disabled = true;
                cwtofCapture4PhaseBtn.textContent = '⏳ Phase 0° (waiting for samples...)';
                
                try {
                    const gl = this.rayTracer.gl;
                    const phases = [0, 90, 180, 270];
                    
                    // Capture each phase
                    for (let i = 0; i < 4; i++) {
                        const phaseAngle = phases[i];
                        console.log(`\n📐 Phase ${i+1}/4: ${phaseAngle}°`);
                        
                        // Set phase and reset accumulation
                        this.camera.cwTofPhaseOffset = phaseAngle;
                        this.rayTracer.frame = 0;
                        this.rayTracer.needsUpdate = true;
                        
                        // Update button text
                        cwtofCapture4PhaseBtn.textContent = `⏳ Phase ${phaseAngle}° (0/${this.targetSPP})`;
                        
                        // Wait for targetSPP samples to accumulate
                        await new Promise(resolve => {
                            const checkSPP = () => {
                                const currentSPP = this.rayTracer.frame;
                                
                                // Update progress
                                cwtofCapture4PhaseBtn.textContent = `⏳ Phase ${phaseAngle}° (${currentSPP}/${this.targetSPP})`;
                                
                                if (currentSPP >= this.targetSPP) {
                                    console.log(`  ✓ Phase ${phaseAngle}° ready (${currentSPP} samples)`);
                                    resolve();
                                } else {
                                    requestAnimationFrame(checkSPP);
                                }
                            };
                            requestAnimationFrame(checkSPP);
                        });
                        
                        // Capture this phase
                        console.log(`  📸 Capturing phase ${phaseAngle}°...`);
                        this.cwtofProcessor.capturePhase(gl, gl.canvas.width, gl.canvas.height, i);
                        
                        // Small delay between captures
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                    // Reconstruct depth
                    console.log('🔬 Reconstructing depth from 4 phases...');
                    this.cwtofProcessor.reconstructDepth(this.camera.cwTofModulationFreq);
                    this.cwtofProcessor.unwrapDepth();
                    
                    // Render to canvas
                    this.renderCWToFReconstruction();
                    
                    // Reset to phase 0
                    this.camera.cwTofPhaseOffset = 0;
                    this.rayTracer.needsUpdate = true;
                    
                    console.log('✓ 4-phase reconstruction complete!');
                    this.isCapturingCWToF = false; // Re-enable auto-restart
                    cwtofCapture4PhaseBtn.textContent = '✓ Captured!';
                    setTimeout(() => {
                        cwtofCapture4PhaseBtn.textContent = '📸 Capture 4-Phase & Reconstruct Depth';
                        cwtofCapture4PhaseBtn.disabled = false;
                    }, 2000);
                    
                } catch (error) {
                    console.error('Error during 4-phase capture:', error);
                    this.isCapturingCWToF = false; // Re-enable auto-restart even on error
                    cwtofCapture4PhaseBtn.textContent = '❌ Error!';
                    setTimeout(() => {
                        cwtofCapture4PhaseBtn.textContent = '📸 Capture 4-Phase & Reconstruct Depth';
                        cwtofCapture4PhaseBtn.disabled = false;
                    }, 2000);
                }
            });
        }
        
        // View captured phase slider (for viewing stored high-quality phase images)
        const viewPhaseSlider = document.getElementById('cwtof-view-phase');
        const viewPhaseValue = document.getElementById('cwtof-view-phase-value');
        if (viewPhaseSlider && viewPhaseValue) {
            viewPhaseSlider.addEventListener('input', (e) => {
                const phaseAngle = parseInt(e.target.value);
                viewPhaseValue.textContent = `${phaseAngle}°`;
                
                // Display the captured phase image
                const phaseIndex = phaseAngle / 90; // 0, 90, 180, 270 → 0, 1, 2, 3
                
                if (this.cwtofProcessor && this.cwtofProcessor.capturedPhases[phaseIndex]) {
                    // Add active glow to indicate we're viewing captured data
                    viewPhaseSlider.classList.add('active-viewer');
                    
                    // Render the captured phase to canvas
                    this.renderCapturedPhase(phaseIndex);
                } else {
                    // No captured data, remove glow
                    viewPhaseSlider.classList.remove('active-viewer');
                    console.log(`⚠️ No captured data for phase ${phaseAngle}°. Click "Capture 4-Phase" first.`);
                }
            });
            
            // Remove glow when mouse leaves
            viewPhaseSlider.addEventListener('mouseleave', () => {
                // Keep glow if we're actively viewing captured data
                const phaseIndex = parseInt(viewPhaseSlider.value) / 90;
                if (!this.cwtofProcessor || !this.cwtofProcessor.capturedPhases[phaseIndex]) {
                    viewPhaseSlider.classList.remove('active-viewer');
                }
            });
        }
        
        this.bindSlider('cwtof-freq', 'cwtof-freq-value', (v) => {
            this.camera.cwTofModulationFreq = parseFloat(v) * 1e6; // Convert MHz to Hz
            this.rayTracer.needsUpdate = true;
        }, (v) => `${v} MHz`);
        
        this.bindSlider('cwtof-phase', 'cwtof-phase-value', (v) => {
            this.camera.cwTofPhaseOffset = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => `${v}°`);
        
        this.bindSlider('cwtof-wavelength', 'cwtof-wavelength-value', (v) => {
            this.camera.cwTofWavelength = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => `${v}nm`);
        
        this.bindCheckbox('cwtof-show-interference', (checked) => {
            this.camera.cwTofShowInterference = checked;
            if (checked) this.camera.cwTofShowDepth = false;
            if (cwtofShowDepth) cwtofShowDepth.checked = false;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindCheckbox('cwtof-show-depth', (checked) => {
            this.camera.cwTofShowDepth = checked;
            if (checked) this.camera.cwTofShowInterference = false;
            if (cwtofShowInterference) cwtofShowInterference.checked = false;
            this.rayTracer.needsUpdate = true;
        });
        
        // Off-Axis Holography
        const offaxisCarrierSlider = document.getElementById('offaxis-carrier');
        const offaxisShowFFTPreview = document.getElementById('offaxis-show-fft-preview');
        const offaxisFFTTestMode = document.getElementById('offaxis-fft-test-mode');
        const fftPreviewOverlay = document.getElementById('fft-preview-overlay');
        const fftPreviewCanvas = document.getElementById('fft-preview-canvas');
        const filteredPreviewCanvas = document.getElementById('filtered-preview-canvas');
        const reconstructedPreviewCanvas = document.getElementById('reconstructed-preview-canvas');
        const fftPhaseCanvas = document.getElementById('fft-phase-canvas');
        const filteredPhaseCanvas = document.getElementById('filtered-phase-canvas');
        const ifftPhaseCanvas = document.getElementById('ifft-phase-canvas');
        const unwrappedPhaseCanvas = document.getElementById('unwrapped-phase-canvas');
        const comparisonCanvas = document.getElementById('comparison-canvas');
        
        // Initialize FFT processor for preview
        this.fftProcessor = new FFTProcessor(this.camera.offAxisFFTPreviewSize);
        this.fftPreviewInterval = null;
        
        // Initialize CW-ToF processor for 4-phase depth reconstruction
        this.cwtofProcessor = new CWToFProcessor(512); // Full resolution for better quality
        
        const offaxisMinSPPSlider = document.getElementById('offaxis-min-spp');
        const offaxisShowComparison = document.getElementById('offaxis-show-comparison');
        const comparisonView = document.getElementById('comparison-view');
        
        this.bindCheckbox('enable-offaxis', (checked) => {
            this.camera.enableOffAxisHolography = checked;
            if (offaxisCarrierSlider) offaxisCarrierSlider.disabled = !checked;
            if (offaxisShowFFTPreview) offaxisShowFFTPreview.disabled = !checked;
            if (offaxisFFTTestMode) offaxisFFTTestMode.disabled = !checked;
            if (offaxisMinSPPSlider) offaxisMinSPPSlider.disabled = !checked;
            if (offaxisShowComparison) offaxisShowComparison.disabled = !checked;
            this.rayTracer.needsUpdate = true;
        });
        
        // Comparison view toggle
        if (offaxisShowComparison && comparisonView) {
            offaxisShowComparison.addEventListener('change', (e) => {
                console.log('Comparison view toggle:', e.target.checked);
                comparisonView.style.display = e.target.checked ? 'block' : 'none';
            });
        } else {
            console.warn('Comparison view elements not found:', {
                checkbox: !!offaxisShowComparison,
                view: !!comparisonView
            });
        }
        
        this.bindSlider('offaxis-carrier', 'offaxis-carrier-value', (v) => {
            this.camera.offAxisCarrierFreq = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => `${parseFloat(v).toFixed(1)} MHz`);
        
        // Note: Off-axis now uses unified targetSPP from Holography general settings
        // (old offaxis-min-spp slider removed from UI)
        
        // FFT Preview toggle
        if (offaxisShowFFTPreview) {
            offaxisShowFFTPreview.addEventListener('change', (e) => {
                this.camera.offAxisShowFFTPreview = e.target.checked;
                
                if (fftPreviewOverlay) {
                    fftPreviewOverlay.style.display = e.target.checked ? 'block' : 'none';
                }
                
                if (e.target.checked) {
                    // Start periodic FFT computation
                    this.startFFTPreview(fftPreviewCanvas, filteredPreviewCanvas, reconstructedPreviewCanvas, 
                                        fftPhaseCanvas, filteredPhaseCanvas, ifftPhaseCanvas, unwrappedPhaseCanvas, comparisonCanvas);
                } else {
                    // Stop periodic FFT computation
                    this.stopFFTPreview();
                }
            });
        }
        
        // FFT Test mode toggle
        if (offaxisFFTTestMode) {
            offaxisFFTTestMode.addEventListener('change', (e) => {
                this.camera.offAxisFFTTestMode = e.target.checked;
                //console.log('FFT Test Mode:', e.target.checked ? 'ON (synthetic pattern)' : 'OFF (real capture)');
            });
        }
        
        // Ground truth depth reference
        this.bindCheckbox('show-depth-reference', (checked) => {
            this.camera.showDepthReference = checked;
            this.rayTracer.needsUpdate = true;
        });
        
        // Environment fog (participating media)
        const fogDensitySlider = document.getElementById('fog-density');
        const fogAnisotropySlider = document.getElementById('fog-anisotropy');
        
        this.bindCheckbox('enable-environment-fog', (checked) => {
            this.camera.enableEnvironmentFog = checked;
            if (fogDensitySlider) fogDensitySlider.disabled = !checked;
            if (fogAnisotropySlider) fogAnisotropySlider.disabled = !checked;
            this.rayTracer.needsUpdate = true;
        });
        
        this.bindSlider('fog-density', 'fog-density-value', (v) => {
            this.camera.fogDensity = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(2));
        
        this.bindSlider('fog-anisotropy', 'fog-anisotropy-value', (v) => {
            this.camera.fogAnisotropy = parseFloat(v);
            this.rayTracer.needsUpdate = true;
        }, (v) => parseFloat(v).toFixed(2));
    }
    
    bindSlider(sliderId, valueId, callback, formatter = (v) => v) {
        const slider = document.getElementById(sliderId);
        const valueDisplay = valueId ? document.getElementById(valueId) : null;
        
        if (!slider) {
            console.warn(`Slider element not found: ${sliderId}`);
            return;
        }
        if (valueId && !valueDisplay) {
            console.warn(`Value display element not found: ${valueId}`);
            // Don't return - still bind the slider even if display is missing
        }
        
        slider.addEventListener('input', (e) => {
            const value = e.target.value;
            if (valueDisplay) {
                valueDisplay.textContent = formatter(value);
            }
            callback(value);
        });
    }
    
    bindCheckbox(checkboxId, callback) {
        const checkbox = document.getElementById(checkboxId);
        if (!checkbox) {
            console.warn(`Checkbox element not found: ${checkboxId}`);
            return;
        }
        checkbox.addEventListener('change', (e) => {
            callback(e.target.checked);
        });
    }
    
    resizeCanvases() {
        // Scene canvas fills its container
        const sceneWidth = this.sceneCanvas.parentElement.clientWidth;
        const sceneHeight = this.sceneCanvas.parentElement.clientHeight;
        
        //console.log('Scene viewport size:', sceneWidth, 'x', sceneHeight);
        
        this.sceneCanvas.width = sceneWidth || 1280;
        this.sceneCanvas.height = sceneHeight || 720;
        
        // Camera visualizer canvas fills its container
        const cameraWidth = this.cameraCanvas.parentElement.clientWidth;
        const cameraHeight = this.cameraCanvas.parentElement.clientHeight;
        
        //console.log('Camera viewport size:', cameraWidth, 'x', cameraHeight);
        
        this.cameraCanvas.width = cameraWidth || 800;
        this.cameraCanvas.height = cameraHeight || 400;
        
        //console.log('Resizing renderers...');
        if (this.rayTracer && this.rayTracer.resize) {
            this.rayTracer.resize();
        }
        if (this.cameraVisualizer && this.cameraVisualizer.resize) {
            this.cameraVisualizer.resize();
        }
    }
    
    updateStats() {
        const now = performance.now();
        this.stats.frames++;
        
        if (now - this.stats.lastTime >= 1000) {
            this.stats.fps = this.stats.frames;
            this.stats.frames = 0;
            this.stats.lastTime = now;
            
            document.getElementById('fps').textContent = `FPS: ${this.stats.fps}`;
            document.getElementById('samples').textContent = `Frames: ${this.rayTracer.frame || 0}`;
            document.getElementById('rays').textContent = `Rays: ${this.rayTracer.raysTraced || 0}`;
        }
    }
    
    // Start real-time FFT preview
    startFFTPreview(fftCanvas, filteredCanvas, reconstructedCanvas, fftPhaseCanvas, filteredPhaseCanvas, ifftPhaseCanvas, unwrappedPhaseCanvas, comparisonCanvas) {
        if (this.fftPreviewInterval) return; // Already running
        
        //console.log('Starting real-time FFT preview...');
        
        const updateFFT = async () => {
            if (!this.camera.enableOffAxisHolography || !this.camera.offAxisShowFFTPreview) {
                this.stopFFTPreview();
                return;
            }
            
            try {
                const gl = this.rayTracer.gl;
                
                // Check if we have enough frames (WebGL uses 'frame' not 'currentSample')
                const currentFrames = this.rayTracer.frame || 0;
                if (currentFrames < this.targetSPP) {
                    //console.log(`⏳ Waiting for more frames: ${currentFrames}/${this.targetSPP}`);
                    return; // Skip this update, wait for more frames
                }
                
                // //console.log('=== FFT Preview Update ===');
                // //console.log('Off-axis enabled:', this.camera.enableOffAxisHolography);
                // //console.log('Canvas size:', gl.canvas.width, 'x', gl.canvas.height);
                // //console.log('FFT size:', this.fftProcessor.size);
                // //console.log('Current frames:', currentFrames, '(min:', this.camera.offAxisMinSPP + ')');
                
                // TEST MODE or REAL CAPTURE
                if (this.camera.offAxisFFTTestMode) {
                    console.log('🧪 TEST MODE: Generating single cosine wave pattern');
                    this.fftProcessor.generateTestPattern('single-wave'); // Single wave → 3 dots in FFT
                } else {
                    //console.log('📸 REAL CAPTURE MODE');
                    
                    // CRITICAL: Reset accumulation to get fresh hologram frame
                    // Accumulated frames smooth out the fringes!
                    //console.log('  Resetting accumulation for fresh hologram...');
                    const oldFrame = this.rayTracer.frame;
                    this.rayTracer.frame = 0;
                    this.rayTracer.needsUpdate = true;
                    
                    // Wait for one fresh frame to render
                    await new Promise(resolve => {
                        const checkFrame = () => {
                            if (this.rayTracer.frame > 0) {
                                //console.log('  Fresh frame rendered, capturing...');
                                resolve();
                            } else {
                                requestAnimationFrame(checkFrame);
                            }
                        };
                        checkFrame();
                    });
                    
                    // Now capture the fresh hologram
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                    this.fftProcessor.captureHologram(gl, gl.canvas.width, gl.canvas.height);
                    
                    // Restore accumulation
                    // //console.log('  Resuming accumulation...');
                    this.rayTracer.needsUpdate = true;
                }
                
                // === FULL PIPELINE ===
                //console.log('Computing full off-axis holography pipeline...');
                
                // Stage 1: FFT
                //console.log('Stage 1: Computing FFT...');
                this.fftProcessor.fft2D(false);
                this.fftProcessor.computeMagnitudePhase();
                
                // Stage 2: Filter sideband
                //console.log('Stage 2: Filtering sideband...');
                this.fftProcessor.filterSideband(this.camera.offAxisCarrierFreq);
                
                // Stage 3: Reconstruct phase (depth)
                //console.log('Stage 3: Reconstructing phase/depth...');
                this.fftProcessor.reconstructPhase();
                
                // Always unwrap phase to remove 2π discontinuities
                this.fftProcessor.unwrapPhase();
                
                const size = this.fftProcessor.size;
                
                // === DRAW STAGE 1: FFT MAGNITUDE ===
                const ctx1 = fftCanvas.getContext('2d');
                const imageData1 = ctx1.createImageData(size, size);
                for (let i = 0; i < size * size; i++) {
                    const val = Math.floor(this.fftProcessor.fftMagnitude[i] * 255);
                    imageData1.data[i * 4 + 0] = val;
                    imageData1.data[i * 4 + 1] = val;
                    imageData1.data[i * 4 + 2] = val;
                    imageData1.data[i * 4 + 3] = 255;
                }
                ctx1.putImageData(imageData1, 0, 0);
                
                // Draw filter region overlay (rectangle showing where we're filtering)
                if (this.fftProcessor.detectedSidebandX !== undefined) {
                    const sidebandX = this.fftProcessor.detectedSidebandX;
                    const sidebandY = this.fftProcessor.detectedSidebandY || 0;
                    const filterWidth = Math.max(this.camera.offAxisCarrierFreq * 0.4, 20);
                    
                    // The sideband position is in raw FFT coordinates (DC at 0,0)
                    // But if the display shows DC centered, we need to add size/2 offset
                    // Since sideband is in the positive frequency range, it stays as-is
                    // But we need to shift Y to center, and wrap X if needed
                    const displayX = sidebandX; // Sideband is in [0, size/2] range, already correct
                    const displayY = sidebandY; // Y should be near 0 (horizontal fringes)
                    
                    ctx1.strokeStyle = '#00ffff';
                    ctx1.lineWidth = 2;
                    ctx1.beginPath();
                    // Draw vertical rectangle centered at displayX
                    // const rectX = displayX - filterWidth/2;
                    const rectX = displayX + size/2 - filterWidth/2;
                    const rectY = 0;
                    const rectW = filterWidth;
                    const rectH = size;
                    ctx1.rect(rectX, rectY, rectW, rectH);
                    ctx1.stroke();
                    
                    // Draw crosshair at filter center
                    // ctx1.strokeStyle = '#00ff00';
                    // ctx1.lineWidth = 1;
                    // ctx1.beginPath();
                    // ctx1.moveTo(displayX - 10, displayY);
                    // ctx1.lineTo(displayX + 10, displayY);
                    // ctx1.moveTo(displayX, Math.max(0, displayY - 10));
                    // ctx1.lineTo(displayX, Math.min(size, displayY + 10));
                    // ctx1.stroke();
                    
                    // console.log(`Filter overlay: sideband=(${sidebandX}, ${sidebandY}), rect at x=${rectX}, w=${rectW}`);
                }
                
                // === DRAW STAGE 2: FILTERED SIDEBAND ===
                const ctx2 = filteredCanvas.getContext('2d');
                const imageData2 = ctx2.createImageData(size, size);
                for (let i = 0; i < size * size; i++) {
                    const val = Math.floor(this.fftProcessor.filteredMagnitude[i] * 255);
                    imageData2.data[i * 4 + 0] = val;
                    imageData2.data[i * 4 + 1] = val;
                    imageData2.data[i * 4 + 2] = val;
                    imageData2.data[i * 4 + 3] = 255;
                }
                ctx2.putImageData(imageData2, 0, 0);
                
                // === DRAW STAGE 3a: IFFT MAGNITUDE ===
                const ctx3 = reconstructedCanvas.getContext('2d');
                const imageData3 = ctx3.createImageData(size, size);
                if (this.fftProcessor.ifftMagnitude) {
                    for (let i = 0; i < size * size; i++) {
                        const y = Math.floor(i / size);
                        const x = i % size;
                
                        // Flip vertically: invert y
                        const newpos = (size - 1 - y) * size + x;
                
                        // Show IFFT magnitude (grayscale)
                        const val = Math.floor(this.fftProcessor.ifftMagnitude[i] * 255);
                        imageData3.data[newpos * 4 + 0] = val;
                        imageData3.data[newpos * 4 + 1] = val;
                        imageData3.data[newpos * 4 + 2] = val;
                        imageData3.data[newpos * 4 + 3] = 255;
                    }
                } else {
                    // Fill with gray if not ready
                    for (let i = 0; i < size * size; i++) {
                        const y = Math.floor(i / size);
                        const x = i % size;
                        const newpos = (size - 1 - y) * size + x;
                
                        imageData3.data[newpos * 4 + 0] = 128;
                        imageData3.data[newpos * 4 + 1] = 128;
                        imageData3.data[newpos * 4 + 2] = 128;
                        imageData3.data[newpos * 4 + 3] = 255;
                    }
                }
                
                ctx3.putImageData(imageData3, 0, 0);
                
                // === DRAW STAGE 1b: RAW FFT PHASE ===
                const ctx4 = fftPhaseCanvas.getContext('2d');
                const imageData4 = ctx4.createImageData(size, size);
                
                // Debug: Check phase range - USE SNAPSHOT!
                let minPhase1 = Infinity, maxPhase1 = -Infinity;
                let nonZeroImag1 = 0;
                for (let i = 0; i < size * size; i++) {
                    const phase = Math.atan2(this.fftProcessor.fftImagSnapshot[i], this.fftProcessor.fftRealSnapshot[i]);
                    minPhase1 = Math.min(minPhase1, phase);
                    maxPhase1 = Math.max(maxPhase1, phase);
                    if (Math.abs(this.fftProcessor.fftImagSnapshot[i]) > 0.01) nonZeroImag1++;
                }
                //console.log(`1b FFT Phase SNAPSHOT: range=[${minPhase1.toFixed(3)}, ${maxPhase1.toFixed(3)}], nonZeroImag=${nonZeroImag1}/${size*size}`);
                
                for (let i = 0; i < size * size; i++) {
                    // Compute phase: atan2(imag, real) - USE SNAPSHOT!
                    const phase = Math.atan2(this.fftProcessor.fftImagSnapshot[i], this.fftProcessor.fftRealSnapshot[i]);
                    // Normalize from [-π, π] to [0, 1]
                    const normalized = (phase + Math.PI) / (2 * Math.PI);
                    
                    // Colormap: blue (near) -> cyan -> red (far)
                    if (normalized < 0.5) {
                        imageData4.data[i * 4 + 0] = 0;
                        imageData4.data[i * 4 + 1] = Math.floor(normalized * 2 * 255);
                        imageData4.data[i * 4 + 2] = Math.floor((1 - normalized * 2) * 255);
                    } else {
                        imageData4.data[i * 4 + 0] = Math.floor((normalized - 0.5) * 2 * 255);
                        imageData4.data[i * 4 + 1] = Math.floor((1 - (normalized - 0.5) * 2) * 255);
                        imageData4.data[i * 4 + 2] = 0;
                    }
                    imageData4.data[i * 4 + 3] = 255;
                }
                ctx4.putImageData(imageData4, 0, 0);
                
                // === DRAW STAGE 2b: FILTERED PHASE ===
                const ctx5 = filteredPhaseCanvas.getContext('2d');
                const imageData5 = ctx5.createImageData(size, size);
                
                // Debug: Check phase range - USE SNAPSHOT!
                let minPhase2 = Infinity, maxPhase2 = -Infinity;
                let nonZeroImag2 = 0;
                for (let i = 0; i < size * size; i++) {
                    const phase = Math.atan2(this.fftProcessor.filteredImagSnapshot[i], this.fftProcessor.filteredRealSnapshot[i]);
                    minPhase2 = Math.min(minPhase2, phase);
                    maxPhase2 = Math.max(maxPhase2, phase);
                    if (Math.abs(this.fftProcessor.filteredImagSnapshot[i]) > 0.01) nonZeroImag2++;
                }
                //console.log(`2b Filtered Phase SNAPSHOT: range=[${minPhase2.toFixed(3)}, ${maxPhase2.toFixed(3)}], nonZeroImag=${nonZeroImag2}/${size*size}`);
                
                for (let i = 0; i < size * size; i++) {
                    // Compute phase: atan2(imag, real) - USE SNAPSHOT!
                    const phase = Math.atan2(this.fftProcessor.filteredImagSnapshot[i], this.fftProcessor.filteredRealSnapshot[i]);
                    // Normalize from [-π, π] to [0, 1]
                    const normalized = (phase + Math.PI) / (2 * Math.PI);
                    
                    // Colormap: blue (near) -> cyan -> red (far)
                    if (normalized < 0.5) {
                        imageData5.data[i * 4 + 0] = 0;
                        imageData5.data[i * 4 + 1] = Math.floor(normalized * 2 * 255);
                        imageData5.data[i * 4 + 2] = Math.floor((1 - normalized * 2) * 255);
                    } else {
                        imageData5.data[i * 4 + 0] = Math.floor((normalized - 0.5) * 2 * 255);
                        imageData5.data[i * 4 + 1] = Math.floor((1 - (normalized - 0.5) * 2) * 255);
                        imageData5.data[i * 4 + 2] = 0;
                    }
                    imageData5.data[i * 4 + 3] = 255;
                }
                ctx5.putImageData(imageData5, 0, 0);
                
                // === DRAW STAGE 3b: WRAPPED PHASE (ALWAYS) ===
                const ctx6 = ifftPhaseCanvas.getContext('2d');
                const imageData6 = ctx6.createImageData(size, size);
                
                if (this.fftProcessor.reconstructedPhase) {
                    for (let i = 0; i < size * size; i++) {
                        const y = Math.floor(i / size);
                        const x = i % size;
                        const newpos = (size - 1 - y) * size + x;
                    
                        const phase = this.fftProcessor.reconstructedPhase[i];
                        // Colormap: blue (near) -> cyan -> red (far)
                        if (phase < 0.5) {
                            imageData6.data[newpos * 4 + 0] = 0;
                            imageData6.data[newpos * 4 + 1] = Math.floor(phase * 2 * 255);
                            imageData6.data[newpos * 4 + 2] = Math.floor((1 - phase * 2) * 255);
                        } else {
                            imageData6.data[newpos * 4 + 0] = Math.floor((phase - 0.5) * 2 * 255);
                            imageData6.data[newpos * 4 + 1] = Math.floor((1 - (phase - 0.5) * 2) * 255);
                            imageData6.data[newpos * 4 + 2] = 0;
                        }
                        imageData6.data[newpos * 4 + 3] = 255;
                    }
                } else {
                    // Fill with gray if not ready
                    for (let i = 0; i < size * size; i++) {
                        imageData6.data[i * 4 + 0] = 128;
                        imageData6.data[i * 4 + 1] = 128;
                        imageData6.data[i * 4 + 2] = 128;
                        imageData6.data[i * 4 + 3] = 255;
                    }
                }
                ctx6.save();
                ctx6.scale(-1, 1);
                ctx6.putImageData(imageData6, 0, 0);
                ctx6.restore();
                
                // === DRAW STAGE 3c: UNWRAPPED PHASE (ALWAYS COMPUTED) ===
                const ctx7 = unwrappedPhaseCanvas.getContext('2d');
                const imageData7 = ctx7.createImageData(size, size);
                
                // Unwrapped phase is always computed now
                for (let i = 0; i < size * size; i++) {
                    const y = Math.floor(i / size);
                    const x = i % size;
                    const newpos = (size - 1 - y) * size + x;
                
                    const phase = this.fftProcessor.unwrappedPhase[i];
                    // Colormap: blue (near) -> cyan -> red (far)
                    if (phase < 0.5) {
                        imageData7.data[newpos * 4 + 0] = 0;
                        imageData7.data[newpos * 4 + 1] = Math.floor(phase * 2 * 255);
                        imageData7.data[newpos * 4 + 2] = Math.floor((1 - phase * 2) * 255);
                    } else {
                        imageData7.data[newpos * 4 + 0] = Math.floor((phase - 0.5) * 2 * 255);
                        imageData7.data[newpos * 4 + 1] = Math.floor((1 - (phase - 0.5) * 2) * 255);
                        imageData7.data[newpos * 4 + 2] = 0;
                    }
                    imageData7.data[newpos * 4 + 3] = 255;
                }
                ctx7.save();
                ctx7.scale(-1, 1);
                ctx7.putImageData(imageData7, 0, 0);
                ctx7.restore();
                
                // === DRAW STAGE 4: SIDE-BY-SIDE COMPARISON (IF ENABLED) ===
                const comparisonCheckbox = document.getElementById('offaxis-show-comparison');
                if (comparisonCanvas && comparisonCheckbox?.checked) {
                    console.log('Drawing comparison view...');
                    const ctx8 = comparisonCanvas.getContext('2d');
                    const imageData8 = ctx8.createImageData(size * 2, size);
                    
                    // Draw wrapped phase on left half
                    if (this.fftProcessor.reconstructedPhase) {
                        for (let y = 0; y < size; y++) {
                            for (let x = 0; x < size; x++) {
                                const srcIdx = y * size + x;
                                const newY = size - 1 - y;  // Flip vertically
                                const dstIdx = newY * (size * 2) + x;
                                
                                const phase = this.fftProcessor.reconstructedPhase[srcIdx];
                                if (phase < 0.5) {
                                    imageData8.data[dstIdx * 4 + 0] = 0;
                                    imageData8.data[dstIdx * 4 + 1] = Math.floor(phase * 2 * 255);
                                    imageData8.data[dstIdx * 4 + 2] = Math.floor((1 - phase * 2) * 255);
                                } else {
                                    imageData8.data[dstIdx * 4 + 0] = Math.floor((phase - 0.5) * 2 * 255);
                                    imageData8.data[dstIdx * 4 + 1] = Math.floor((1 - (phase - 0.5) * 2) * 255);
                                    imageData8.data[dstIdx * 4 + 2] = 0;
                                }
                                imageData8.data[dstIdx * 4 + 3] = 255;
                            }
                        }
                    }
                    
                    // Draw unwrapped phase on right half
                    if (this.fftProcessor.unwrappedPhase) {
                        for (let y = 0; y < size; y++) {
                            for (let x = 0; x < size; x++) {
                                const srcIdx = y * size + x;
                                const newY = size - 1 - y;  // Flip vertically
                                const dstIdx = newY * (size * 2) + (size + x);
                                
                                const phase = this.fftProcessor.unwrappedPhase[srcIdx];
                                if (phase < 0.5) {
                                    imageData8.data[dstIdx * 4 + 0] = 0;
                                    imageData8.data[dstIdx * 4 + 1] = Math.floor(phase * 2 * 255);
                                    imageData8.data[dstIdx * 4 + 2] = Math.floor((1 - phase * 2) * 255);
                                } else {
                                    imageData8.data[dstIdx * 4 + 0] = Math.floor((phase - 0.5) * 2 * 255);
                                    imageData8.data[dstIdx * 4 + 1] = Math.floor((1 - (phase - 0.5) * 2) * 255);
                                    imageData8.data[dstIdx * 4 + 2] = 0;
                                }
                                imageData8.data[dstIdx * 4 + 3] = 255;
                            }
                        }
                    }
                    
                    // Draw divider line
                    for (let y = 0; y < size; y++) {
                        const idx = y * (size * 2) + size;
                        imageData8.data[idx * 4 + 0] = 255;  // White line
                        imageData8.data[idx * 4 + 1] = 255;
                        imageData8.data[idx * 4 + 2] = 255;
                        imageData8.data[idx * 4 + 3] = 255;
                    }
                    
                    ctx8.save();
                    ctx8.scale(-1, 1);
                    ctx8.putImageData(imageData8, 0, 0);
                    ctx8.restore();
                }

                //console.log('✓ Full pipeline complete!');
                
            } catch (error) {
                console.error('FFT preview error:', error);
            }
        };
        
        // Update every 500ms
        this.fftPreviewInterval = setInterval(updateFFT, 500);
        updateFFT(); // Initial update
    }
    
    // Stop real-time FFT preview
    stopFFTPreview() {
        if (this.fftPreviewInterval) {
            clearInterval(this.fftPreviewInterval);
            this.fftPreviewInterval = null;
            //console.log('Stopped FFT preview');
        }
    }
    
    updateHolographyStatus() {
        // Only show when CW-ToF or Off-Axis Holography is enabled
        const statusPanel = document.getElementById('holography-status');
        const showStatus = this.camera.enableCWToF || this.camera.enableOffAxisHolography;
        
        if (!statusPanel) return;
        
        if (showStatus) {
            statusPanel.style.display = 'block';
            
            // Check 1: Planar Wave Light enabled
            const planarLight = this.camera.enablePlanarWaveLight;
            const statusPlanarLight = document.getElementById('status-planar-light');
            if (statusPlanarLight) {
                statusPlanarLight.innerHTML = planarLight ? '🟢 Planar Light' : '🔴 Planar Light';
            }
            
            // Check 2: Frequency match (carrier = modulation)
            const carrierFreq = this.camera.planarWaveCarrierFreq;
            const modFreq = this.camera.cwTofModulationFreq / 1e6; // Convert Hz to MHz
            const freqMatch = Math.abs(carrierFreq - modFreq) < 0.1; // Tolerance of 0.1 MHz
            const statusFreqMatch = document.getElementById('status-freq-match');
            if (statusFreqMatch) {
                statusFreqMatch.innerHTML = freqMatch ? 
                    `🟢 Freq Match (${carrierFreq.toFixed(1)} MHz)` : 
                    `🔴 Freq Mismatch (Carrier: ${carrierFreq.toFixed(1)}, Mod: ${modFreq.toFixed(1)} MHz)`;
            }
            
            // Check 3: Bounce range for single scatter (min=1, range=1 gives exactly 1 bounce)
            const minBounces = this.rayTracer ? this.rayTracer.minBounces : 1;
            const bounceRange = this.rayTracer ? this.rayTracer.bounceRange : 8;
            const maxBounces = minBounces + bounceRange;
            const bounceCorrect = (minBounces === 1 && bounceRange === 1); // Single scatter: exactly 1 bounce
            const statusBounce = document.getElementById('status-bounce');
            if (statusBounce) {
                if (bounceCorrect) {
                    statusBounce.innerHTML = '🟢 Single Scatter (min=1, range=1)';
                } else {
                    statusBounce.innerHTML = `🟡 Bounces: ${minBounces}-${maxBounces} (single scatter: min=1, range=1)`;
                }
            }
            
            // Check 4: Scene lights disabled (isolate planar wave)
            const sceneLightsOff = this.camera.disableSceneLights;
            const statusSceneLights = document.getElementById('status-scene-lights');
            if (statusSceneLights) {
                statusSceneLights.innerHTML = sceneLightsOff ? 
                    '🟢 Scene Lights Off' : 
                    '🟡 Scene Lights On (recommended: off)';
            }
        } else {
            statusPanel.style.display = 'none';
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Autofocus animation (smooth transition with temporal blending)
        if (this.autofocusTarget !== null) {
            this.rayTracer.isAutofocusing = true;
            
            const current = this.camera.focusDistance;
            const target = this.autofocusTarget;
            const diff = target - current;
            
            if (Math.abs(diff) > 0.01) {
                // Smoothly move towards target
                this.camera.focusDistance = current + diff * this.autofocusStepSize * this.autofocusSpeed;
                this.rayTracer.needsUpdate = true; // Trigger temporal blend
                
                // Update UI slider
                const slider = document.getElementById('focus-distance');
                const display = document.getElementById('focus-value');
                if (slider) slider.value = this.camera.focusDistance;
                if (display) display.textContent = this.camera.focusDistance.toFixed(1);
                
                // Update camera visualizer in real-time
                if (this.cameraVisualizer) {
                    this.cameraVisualizer.needsUpdate = true;
                }
            } else {
                // Target reached - switch to normal accumulation
                this.camera.focusDistance = target;
                this.autofocusTarget = null;
                this.rayTracer.isAutofocusing = false;
                this.rayTracer.needsUpdate = true; // Reset for clean accumulation
                //console.log(`✓ Autofocus complete: ${target.toFixed(2)}m`);
            }
        } else {
            // Ensure autofocus mode is off
            this.rayTracer.isAutofocusing = false;
        }
        
        // Update animated lights
        this.updateLights();
        
        // Update FPS counter
        this.stats.frames++;
        const now = performance.now();
        if (now - this.stats.lastTime > 1000) {
            this.stats.fps = this.stats.frames;
            this.stats.frames = 0;
            this.stats.lastTime = now;
            
            // Update stats display
            const statsEl = document.getElementById('stats');
            const sppIndicator = document.getElementById('spp-indicator');
            if (statsEl) {
                const renderer = 'WebGL';
                const frame = this.rayTracer ? this.rayTracer.frame : 0;
                const samples = frame; // Each frame = 1 sample per pixel
                statsEl.textContent = `${this.stats.fps} FPS | ${renderer}`;
            }
            
            // Update SPP indicator
            if (sppIndicator) {
                const currentSPP = this.rayTracer ? this.rayTracer.frame : 0;
                const targetSPP = this.targetSPP;
                const percentage = Math.min(100, Math.floor((currentSPP / targetSPP) * 100));
                
                // Color code: red < 50%, yellow 50-99%, green >= 100%
                let color = '#ff4444';
                if (percentage >= 100) color = '#44ff44';
                else if (percentage >= 50) color = '#ffaa00';
                
                sppIndicator.style.background = `rgba(0,0,0,0.7)`;
                sppIndicator.style.borderLeft = `4px solid ${color}`;
                sppIndicator.innerHTML = `SPP: <b>${currentSPP}</b> / ${targetSPP} (${percentage}%)`;
            }
            
            // Update holography setup status indicators
            this.updateHolographyStatus();
        }
        
        // Auto-restart accumulation when targetSPP is reached (for holography live preview)
        // This ensures consistent sample count for each capture cycle
        // Skip during manual CW-ToF capture (isCapturingCWToF flag prevents interference)
        if (this.rayTracer && this.rayTracer.frame >= this.targetSPP && !this.isCapturingCWToF) {
            const isHolographyActive = this.camera.enableCWToF || this.camera.enableOffAxis;
            
            if (isHolographyActive) {
                // Reset accumulation to start fresh cycle
                console.log(`🔄 Target SPP reached (${this.rayTracer.frame}/${this.targetSPP}), restarting accumulation...`);
                this.rayTracer.frame = 0;
                this.rayTracer.needsUpdate = true;
            }
        }
        
        // Render only if raytracer is ready
        if (this.rayTracer && this.rayTracer.render) {
            this.rayTracer.render();
        }
        
        if (this.cameraVisualizer && this.cameraVisualizer.render) {
            this.cameraVisualizer.render();
        }
    }
    
    // Render CW-ToF reconstructed depth to canvas
    renderCWToFReconstruction() {
        const canvas = document.getElementById('cwtof-reconstruction-canvas');
        if (!canvas || !this.cwtofProcessor.unwrappedDepth) return;
        
        const ctx = canvas.getContext('2d');
        const srcSize = this.cwtofProcessor.size;
        const dstSize = canvas.width;
        const imageData = ctx.createImageData(dstSize, dstSize);
        
        // Render unwrapped depth with blue-cyan-red colormap, scaled to canvas size
        for (let dstY = 0; dstY < dstSize; dstY++) {
            for (let dstX = 0; dstX < dstSize; dstX++) {
                // Map to source coordinates
                const srcX = Math.floor(dstX * srcSize / dstSize);
                const srcY = Math.floor(dstY * srcSize / dstSize);
                const srcIdx = srcY * srcSize + srcX;
                const dstIdx = dstY * dstSize + dstX;
                
                const depth = this.cwtofProcessor.unwrappedDepth[srcIdx];
                
                // Colormap: blue (near) -> cyan -> red (far)
                if (depth < 0.5) {
                    imageData.data[dstIdx * 4 + 0] = 0;
                    imageData.data[dstIdx * 4 + 1] = Math.floor(depth * 2 * 255);
                    imageData.data[dstIdx * 4 + 2] = Math.floor((1 - depth * 2) * 255);
                } else {
                    imageData.data[dstIdx * 4 + 0] = Math.floor((depth - 0.5) * 2 * 255);
                    imageData.data[dstIdx * 4 + 1] = Math.floor((1 - (depth - 0.5) * 2) * 255);
                    imageData.data[dstIdx * 4 + 2] = 0;
                }
                imageData.data[dstIdx * 4 + 3] = 255;
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        console.log('✓ Rendered CW-ToF reconstruction to canvas');
    }
    
    // Render captured phase image to main canvas (for viewing stored high-quality phases)
    renderCapturedPhase(phaseIndex) {
        if (!this.cwtofProcessor || !this.cwtofProcessor.capturedPhases[phaseIndex]) {
            console.warn(`No captured data for phase index ${phaseIndex}`);
            return;
        }
        
        const canvas = this.sceneCanvas;
        const ctx = canvas.getContext('2d');
        const phaseData = this.cwtofProcessor.capturedPhases[phaseIndex];
        
        // Create temporary canvas for the phase data
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = phaseData.width;
        tempCanvas.height = phaseData.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Put phase data into temporary canvas
        tempCtx.putImageData(phaseData, 0, 0);
        
        // Scale to main canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
        
        // Add overlay text
        ctx.fillStyle = 'rgba(255, 170, 0, 0.9)';
        ctx.font = 'bold 24px monospace';
        ctx.fillText(`📸 Captured Phase ${phaseIndex * 90}° (${this.targetSPP} SPP)`, 20, 40);
        
        console.log(`✓ Displaying captured phase ${phaseIndex * 90}° (${phaseData.width}x${phaseData.height})`);
    }
}

// Initialize the application
window.addEventListener('DOMContentLoaded', () => {
    new OpticalSimulator();
    
    // Font selector
    const fontSelector = document.getElementById('font-selector');
    if (fontSelector) {
        fontSelector.addEventListener('change', (e) => {
            document.body.style.fontFamily = e.target.value;
            console.log('🔤 Font changed to:', e.target.value);
        });
    }
});
