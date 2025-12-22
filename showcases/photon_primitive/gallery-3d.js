// 3D Flying Gallery Controller
class Gallery3D {
    constructor() {
        this.canvas = document.getElementById('gallery-canvas');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.flyingImages = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.cameraRotation = 0;
        this.hoveredFrame = null;
        
        this.init();
        this.loadAllImages();
        this.setupEventListeners();
        this.animate();
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050505);
        this.scene.fog = new THREE.Fog(0x0a0a0a, 30, 100);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            60,
            this.canvas.clientWidth / this.canvas.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 25);

        // Renderer with premium quality and enhanced contrast
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
        
        // Enhanced color rendering to prevent washed-out look
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2; // Slightly brighter for more vibrant colors

        // Lights - enhanced for more vibrant images
        const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.7);
        this.scene.add(ambientLight);

        // Main directional light for crisp details
        const mainLight = new THREE.DirectionalLight(0xFFFFFF, 1.0);
        mainLight.position.set(10, 10, 10);
        this.scene.add(mainLight);

        // Multiple colored accent lights for atmosphere
        const lights = [
            { color: 0xD4AF37, pos: [20, 10, 10], intensity: 0.4 },
            { color: 0xF4D03F, pos: [-20, 10, -10], intensity: 0.4 },
            { color: 0xB8860B, pos: [0, 20, -20], intensity: 0.3 },
            { color: 0xFFD700, pos: [10, -10, 20], intensity: 0.3 }
        ];
        
        lights.forEach(light => {
            const pointLight = new THREE.PointLight(light.color, light.intensity);
            pointLight.position.set(...light.pos);
            this.scene.add(pointLight);
        });

        // Window resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    async loadAllImages() {
        try {
            // Use static image list (GitHub Pages compatible)
            const imageList = typeof ALL_IMAGES !== 'undefined' ? ALL_IMAGES : [];
            
            // Shuffle for random distribution
            const shuffled = [...imageList].sort(() => Math.random() - 0.5);
            
            // Create flying images with random positions and velocities
            shuffled.forEach((imagePath, i) => {
                this.createFlyingImage({ path: imagePath, title: imagePath.split('/').pop() });
            });
        } catch (error) {
            console.error('Failed to load images:', error);
        }
    }

    createFlyingImage(imageData) {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(
            imageData.path,
            (texture) => {
                // Random size between 2 and 4 (capped to prevent huge paintings blocking view)
                const size = Math.random() * 2 + 2;
                const aspect = texture.image.width / texture.image.height;
                const width = size * aspect;
                const height = size;

                // Create frame group for fancy painting effect
                const frameGroup = new THREE.Group();

                // Create image plane (DOUBLE-SIDED)
                const geometry = new THREE.PlaneGeometry(width, height, 32, 32);
                
                // Random material type for variety (decide early for geometry effects)
                const materialType = Math.random();
                
                // Add wavy distortion to geometry for liquid/bent space effect
                const positions = geometry.attributes.position;
                for (let i = 0; i < positions.count; i++) {
                    const x = positions.getX(i);
                    const y = positions.getY(i);
                    let wave = Math.sin(x * 2) * Math.cos(y * 2) * 0.02;
                    
                    // Add extra roughness for painting materials
                    if (materialType < 0.35) {
                        wave += (Math.random() - 0.5) * 0.015; // Canvas texture irregularity
                    }
                    
                    positions.setZ(i, wave);
                }
                positions.needsUpdate = true;
                let roughness, metalness;
                
                if (materialType < 0.35) {
                    // Painting-like (rough, matte)
                    roughness = 0.7 + Math.random() * 0.25;
                    metalness = 0.05;
                } else if (materialType < 0.7) {
                    // Smooth printed paper (slight sheen)
                    roughness = 0.25 + Math.random() * 0.15;
                    metalness = 0.1;
                } else {
                    // Glossy coated (gallery print)
                    roughness = 0.05 + Math.random() * 0.1;
                    metalness = 0.15;
                }
                
                // Enhance contrast and saturation to prevent washed-out look
                texture.colorSpace = THREE.SRGBColorSpace;
                
                // Create material properties object (no clearcoat - not supported by MeshStandardMaterial)
                const materialProps = {
                    map: texture,
                    roughness: roughness,
                    metalness: metalness,
                    emissive: 0x000000,
                    emissiveIntensity: 0,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.99
                };
                
                // Add canvas/paper texture for painting materials
                if (materialType < 0.35) {
                    // Create subtle bump map for canvas texture
                    const bumpCanvas = document.createElement('canvas');
                    bumpCanvas.width = 128;
                    bumpCanvas.height = 128;
                    const ctx = bumpCanvas.getContext('2d');
                    
                    // Canvas weave pattern
                    for (let i = 0; i < 128; i++) {
                        for (let j = 0; j < 128; j++) {
                            const noise = Math.random() * 40 + 215;
                            ctx.fillStyle = `rgb(${noise},${noise},${noise})`;
                            ctx.fillRect(i, j, 1, 1);
                        }
                    }
                    
                    const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
                    materialProps.bumpMap = bumpTexture;
                    materialProps.bumpScale = 0.003;
                }
                
                const material = new THREE.MeshStandardMaterial(materialProps);
                
                // Store material type for future reference
                material.userData.materialType = materialType < 0.35 ? 'painting' : (materialType < 0.7 ? 'paper' : 'coated');
                
                const imageMesh = new THREE.Mesh(geometry, material);
                frameGroup.add(imageMesh);

                // Fancy ornate frame with rounded corners and premium texture
                const frameThickness = 0.15;
                const frameDepth = 0.08;
                
                // Generate procedural bump map for carved frame effect
                const bumpCanvas = document.createElement('canvas');
                bumpCanvas.width = 64;
                bumpCanvas.height = 64;
                const bumpCtx = bumpCanvas.getContext('2d');
                
                // Create ornate pattern (reduced frequency)
                for (let i = 0; i < 64; i += 16) {
                    bumpCtx.fillStyle = i % 32 === 0 ? '#888' : '#666';
                    bumpCtx.fillRect(0, i, 64, 8);
                    bumpCtx.fillRect(i, 0, 8, 64);
                }
                
                const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
                bumpTexture.wrapS = bumpTexture.wrapT = THREE.RepeatWrapping;
                
                const frameMaterial = new THREE.MeshStandardMaterial({
                    color: 0xFFD700,
                    roughness: 0.2,
                    metalness: 0.9,
                    emissive: 0xD4AF37,
                    emissiveIntensity: 0.5,
                    bumpMap: bumpTexture,
                    bumpScale: 0.015
                });

                // Rounded frame edges
                const cornerRadius = 0.1;
                
                // Top frame (with rounded corners)
                const topFrameShape = new THREE.Shape();
                topFrameShape.moveTo(-width/2 + cornerRadius, height/2 + frameThickness);
                topFrameShape.lineTo(width/2 - cornerRadius, height/2 + frameThickness);
                topFrameShape.quadraticCurveTo(width/2, height/2 + frameThickness, width/2, height/2 + frameThickness - cornerRadius);
                topFrameShape.lineTo(width/2, height/2 + cornerRadius);
                topFrameShape.quadraticCurveTo(width/2, height/2, width/2 - cornerRadius, height/2);
                topFrameShape.lineTo(-width/2 + cornerRadius, height/2);
                topFrameShape.quadraticCurveTo(-width/2, height/2, -width/2, height/2 + cornerRadius);
                topFrameShape.lineTo(-width/2, height/2 + frameThickness - cornerRadius);
                topFrameShape.quadraticCurveTo(-width/2, height/2 + frameThickness, -width/2 + cornerRadius, height/2 + frameThickness);
                
                const topFrameGeometry = new THREE.ExtrudeGeometry(topFrameShape, {
                    depth: frameDepth,
                    bevelEnabled: true,
                    bevelThickness: 0.02,
                    bevelSize: 0.02,
                    bevelSegments: 2
                });
                const topFrame = new THREE.Mesh(topFrameGeometry, frameMaterial);
                topFrame.position.z = -frameDepth / 2;
                frameGroup.add(topFrame);

                // Simplified side frames
                const leftFrame = new THREE.Mesh(
                    new THREE.BoxGeometry(frameThickness, height, frameDepth),
                    frameMaterial
                );
                leftFrame.position.x = -width / 2 - frameThickness / 2;
                leftFrame.position.z = -frameDepth / 2;
                frameGroup.add(leftFrame);

                const rightFrame = new THREE.Mesh(
                    new THREE.BoxGeometry(frameThickness, height, frameDepth),
                    frameMaterial
                );
                rightFrame.position.x = width / 2 + frameThickness / 2;
                rightFrame.position.z = -frameDepth / 2;
                frameGroup.add(rightFrame);

                const bottomFrame = new THREE.Mesh(
                    new THREE.BoxGeometry(width + frameThickness * 2, frameThickness, frameDepth),
                    frameMaterial
                );
                bottomFrame.position.y = -height / 2 - frameThickness / 2;
                bottomFrame.position.z = -frameDepth / 2;
                frameGroup.add(bottomFrame);

                // Random initial position
                frameGroup.position.set(
                    (Math.random() - 0.5) * 60,
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 60
                );

                // Random rotation
                frameGroup.rotation.x = Math.random() * Math.PI * 2;
                frameGroup.rotation.y = Math.random() * Math.PI * 2;
                frameGroup.rotation.z = Math.random() * Math.PI * 2;

                // Store movement data
                frameGroup.userData = {
                    imageData: imageData,
                    isImage: true,
                    isClickable: true,
                    imageMesh: imageMesh,
                    imageMaterial: material,
                    frameMaterial: frameMaterial,
                    velocity: new THREE.Vector3(
                        (Math.random() - 0.5) * 0.02,
                        (Math.random() - 0.5) * 0.02,
                        (Math.random() - 0.5) * 0.02
                    ),
                    rotationSpeed: new THREE.Vector3(
                        (Math.random() - 0.5) * 0.01,
                        (Math.random() - 0.5) * 0.01,
                        (Math.random() - 0.5) * 0.01
                    ),
                    bounds: { x: 60, y: 40, z: 60 },
                    hasGlow: true, // All frames glow gold
                    waveTime: Math.random() * 100, // For wavy animation
                    trail: [], // For afterimage effect
                    isHovered: false,
                    baseEmissiveIntensity: 0,
                    size: Math.max(width, height), // For collision detection
                    previousPosition: frameGroup.position.clone()
                };

                // Add gold glow to all images
                material.emissive = new THREE.Color(0xD4AF37);
                material.emissiveIntensity = 0.25;

                this.scene.add(frameGroup);
                this.flyingImages.push(frameGroup);
            },
            undefined,
            (error) => {
                console.error('Error loading image:', imageData.path, error);
            }
        );
    }


    animate() {
        requestAnimationFrame(() => this.animate());

        const time = Date.now() * 0.001;

        // Slow camera rotation
        this.cameraRotation += 0.0005;
        this.camera.position.x = Math.sin(this.cameraRotation) * 25;
        this.camera.position.z = Math.cos(this.cameraRotation) * 25;
        this.camera.position.y = Math.sin(this.cameraRotation * 0.5) * 5;
        this.camera.lookAt(0, 0, 0);

        // Gentle repelling mechanism (cheap and elegant)
        // Only check every other frame for performance
        if (Math.floor(time * 60) % 2 === 0) {
            const repelRadius = 8; // Distance at which repelling starts
            const repelStrength = 0.0008; // Very subtle repelling force
            
            for (let i = 0; i < this.flyingImages.length; i++) {
                const frame1 = this.flyingImages[i];
                
                for (let j = i + 1; j < this.flyingImages.length; j++) {
                    const frame2 = this.flyingImages[j];
                    
                    // Quick distance check
                    const dx = frame1.position.x - frame2.position.x;
                    const dy = frame1.position.y - frame2.position.y;
                    const dz = frame1.position.z - frame2.position.z;
                    const distSq = dx * dx + dy * dy + dz * dz;
                    
                    if (distSq < repelRadius * repelRadius && distSq > 0.1) {
                        // Apply gentle repelling force
                        const dist = Math.sqrt(distSq);
                        const force = repelStrength * (repelRadius - dist) / dist;
                        
                        frame1.userData.velocity.x += dx * force;
                        frame1.userData.velocity.y += dy * force;
                        frame1.userData.velocity.z += dz * force;
                        
                        frame2.userData.velocity.x -= dx * force;
                        frame2.userData.velocity.y -= dy * force;
                        frame2.userData.velocity.z -= dz * force;
                    }
                }
            }
        }

        // Update flying images
        this.flyingImages.forEach((frameGroup) => {
            const userData = frameGroup.userData;
            
            // Gentle velocity damping to prevent runaway speeds
            userData.velocity.multiplyScalar(0.995);
            
            // Clamp velocity to reasonable limits
            const maxSpeed = 0.03;
            const speed = userData.velocity.length();
            if (speed > maxSpeed) {
                userData.velocity.multiplyScalar(maxSpeed / speed);
            }
            
            // Move images
            frameGroup.position.add(userData.velocity);
            
            // Rotate images
            frameGroup.rotation.x += userData.rotationSpeed.x;
            frameGroup.rotation.y += userData.rotationSpeed.y;
            frameGroup.rotation.z += userData.rotationSpeed.z;
            
            // Bounce off boundaries
            if (Math.abs(frameGroup.position.x) > userData.bounds.x / 2) {
                userData.velocity.x *= -1;
                frameGroup.position.x = Math.sign(frameGroup.position.x) * userData.bounds.x / 2;
            }
            if (Math.abs(frameGroup.position.y) > userData.bounds.y / 2) {
                userData.velocity.y *= -1;
                frameGroup.position.y = Math.sign(frameGroup.position.y) * userData.bounds.y / 2;
            }
            if (Math.abs(frameGroup.position.z) > userData.bounds.z / 2) {
                userData.velocity.z *= -1;
                frameGroup.position.z = Math.sign(frameGroup.position.z) * userData.bounds.z / 2;
            }
            
            // Wavy liquid effect on geometry
            if (userData.imageMesh && userData.imageMesh.geometry) {
                userData.waveTime += 0.01;
                const positions = userData.imageMesh.geometry.attributes.position;
                for (let i = 0; i < positions.count; i++) {
                    const x = positions.getX(i);
                    const y = positions.getY(i);
                    const wave = Math.sin(x * 3 + userData.waveTime) * Math.cos(y * 3 + userData.waveTime) * 0.03;
                    positions.setZ(i, wave);
                }
                positions.needsUpdate = true;
            }
            
            // Always glow (no hover dependency)
            const glowIntensity = 0.3 + Math.sin(time * 2 + userData.waveTime) * 0.15;
            if (userData.imageMaterial) {
                userData.imageMaterial.emissive = new THREE.Color(0xD4AF37);
                userData.imageMaterial.emissiveIntensity = glowIntensity;
            }
            if (userData.frameMaterial) {
                userData.frameMaterial.emissiveIntensity = 0.4 + Math.sin(time * 2 + userData.waveTime) * 0.2;
            }
        });

        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    setupEventListeners() {
        // Mouse interaction
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('click', (e) => this.onMouseClick(e));
    }

    onMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        // Reset cursor and previous hover state
        this.canvas.style.cursor = 'default';
        
        // Clear previous hover
        if (this.hoveredFrame) {
            this.hoveredFrame.userData.isHovered = false;
            this.hoveredFrame = null;
        }

        // Check for hover on frame groups
        for (let intersect of intersects) {
            // Walk up the parent chain to find the frameGroup
            let obj = intersect.object;
            while (obj) {
                if (obj.userData && obj.userData.isClickable) {
                    this.canvas.style.cursor = 'pointer';
                    obj.userData.isHovered = true;
                    this.hoveredFrame = obj;
                    break;
                }
                obj = obj.parent;
            }
            if (this.hoveredFrame) break;
        }
    }

    onMouseClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        for (let intersect of intersects) {
            // Walk up the parent chain to find the frameGroup
            let obj = intersect.object;
            while (obj) {
                if (obj.userData && obj.userData.isClickable) {
                    const imageData = obj.userData.imageData;
                    this.showImageModal(imageData);
                    return;
                }
                obj = obj.parent;
            }
        }
    }

    showImageModal(imageData) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        `;

        const img = document.createElement('img');
        img.src = imageData.path;
        
        // Set minimum size of 60% window width
        const minWidth = window.innerWidth * 0.6;
        img.style.cssText = `
            max-width: 90%;
            max-height: 90%;
            min-width: ${minWidth}px;
            border: 3px solid #D4AF37;
            border-radius: 8px;
            box-shadow: 0 0 50px rgba(212, 175, 55, 0.5);
            object-fit: contain;
        `;

        modal.appendChild(img);
        document.body.appendChild(modal);

        modal.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Press ESC to close
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }
}

// Grid View Controller
class GridViewController {
    constructor() {
        this.gridContainer = document.getElementById('grid-container');
        this.isActive = false;
    }

    async populate() {
        try {
            // Use static image list (GitHub Pages compatible)
            const imageList = typeof ALL_IMAGES !== 'undefined' ? ALL_IMAGES : [];

            imageList.forEach(imagePath => {
                const gridItem = document.createElement('div');
                gridItem.className = 'grid-item';

                const img = document.createElement('img');
                img.src = imagePath;
                img.alt = imagePath.split('/').pop();
                img.loading = 'lazy';

                // No titles - let images speak for themselves
                gridItem.appendChild(img);

                gridItem.addEventListener('click', () => {
                    this.showImageModal({ path: imagePath, title: imagePath.split('/').pop() });
                });

                this.gridContainer.appendChild(gridItem);
            });
        } catch (error) {
            console.error('Failed to load images for grid:', error);
        }
    }

    showImageModal(imageData) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        `;

        const img = document.createElement('img');
        img.src = imageData.path;
        
        // Set minimum size of 60% window width
        const minWidth = window.innerWidth * 0.6;
        img.style.cssText = `
            max-width: 90%;
            max-height: 90%;
            min-width: ${minWidth}px;
            border: 3px solid #D4AF37;
            border-radius: 8px;
            box-shadow: 0 0 50px rgba(212, 175, 55, 0.5);
            object-fit: contain;
        `;

        modal.appendChild(img);
        document.body.appendChild(modal);

        modal.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Press ESC to close
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    show() {
        document.getElementById('gallery-3d').style.display = 'none';
        document.getElementById('grid-view').classList.remove('hidden');
        this.isActive = true;
        if (this.gridContainer.children.length === 0) {
            this.populate();
        }
    }

    hide() {
        document.getElementById('gallery-3d').style.display = 'block';
        document.getElementById('grid-view').classList.add('hidden');
        this.isActive = false;
    }
}

// Initialize
let gallery3D;
let gridViewController;

window.addEventListener('DOMContentLoaded', () => {
    // Hide loading screen
    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500);
    }, 1000);

    // Initialize galleries
    gallery3D = new Gallery3D();
    gridViewController = new GridViewController();

    // View mode toggle
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const mode = btn.dataset.mode;
            if (mode === '3d') {
                gridViewController.hide();
            } else if (mode === 'grid') {
                gridViewController.show();
            }
        });
    });
    
    // Back to 3D button
    document.getElementById('back-to-3d').addEventListener('click', () => {
        gridViewController.hide();
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.view-btn[data-mode="3d"]').classList.add('active');
    });
});
