// Recorded images stay unlit; the room, frames and motion are decoration.
function photonGalleryRandom(index, channel) {
    const n = Math.sin((index + 1) * 127.1 + (channel + 1) * 311.7) * 43758.5453;
    return n - Math.floor(n);
}
function photonGalleryPose(index, time, aspect = 1.6) {
    const r = channel => photonGalleryRandom(index, channel);
    const phase = channel => r(channel) * Math.PI * 2;
    const direction = channel => r(channel) < 0.5 ? -1 : 1;
    // Each coordinate has its own phase, direction and period. These are
    // independent flights through a shallow volume, without rings or bands.
    const u = 0.76 * Math.sin(phase(0) + time * direction(3) * (0.037 + r(4) * 0.046)) +
        0.14 * Math.sin(phase(5) + time * 0.17);
    const v = 0.73 * Math.sin(phase(1) + time * direction(6) * (0.032 + r(7) * 0.045)) +
        0.13 * Math.sin(phase(8) - time * 0.14);
    const z = 1.5 + 8 * Math.sin(phase(2) + time * direction(9) * (0.018 + r(10) * 0.022));
    const halfHeight = (32 - z) * Math.tan(54 * Math.PI / 360);
    return {
        x: u * halfHeight * aspect,
        y: v * halfHeight,
        z,
        pitch: Math.sin(phase(11) + time * direction(12) * (0.11 + r(13) * 0.17)) * 0.30,
        yaw: Math.sin(phase(14) + time * direction(15) * (0.09 + r(16) * 0.15)) * 0.39,
        roll: (r(17) - 0.5) * 0.9 + time * direction(18) * (0.025 + r(19) * 0.045)
    };
}
// Affine projection of the print's top/left edges is enough for a seamless
// screen-space flight, including its spin. The final image uses its true aspect.
function photonGalleryFlightTransform(origin, target) {
    if (!origin || !origin.points || origin.points.length < 4) return 'matrix(.86,0,0,.86,0,0)';
    const [a, b, , d] = origin.points;
    return `matrix(${(b.x-a.x)/target.width},${(b.y-a.y)/target.width},` +
        `${(d.x-a.x)/target.height},${(d.y-a.y)/target.height},${a.x-target.left},${a.y-target.top})`;
}
class Gallery3D {
    constructor() {
        this.canvas = document.getElementById('gallery-canvas');
        this.flyingImages = [];
        this.pickTargets = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredFrame = null;
        this.pointerInside = false;
        this.motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.isActive = true;
        this.isInView = false;
        this.modalOpen = false;
        this.contextLost = false;
        this.animationFrame = null;
        this.lastTimestamp = null;
        this.animationTime = 0;
        this.pendingImages = [];
        this.loadingImages = 0;
        this.textureLoader = new THREE.TextureLoader();
        this.frameInterval = 1000 / 30;
        this.tick = timestamp => this.animate(timestamp);

        this.init();
        this.loadAllImages();
        this.setupEventListeners();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x071113);
        this.camera = new THREE.PerspectiveCamera(54, 1, 0.1, 150);
        this.camera.position.set(0, 0, 32);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'low-power'
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        this.renderer.shadowMap.enabled = false;
        // This page loads THREE r128: encoding, not the later colorSpace API.
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        // Only the lit moldings use the highlight rolloff. Recorded prints and
        // backdrop explicitly opt out, preserving their original color values.
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1;

        // Only the decorative ribbons respond to these lights.
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.62));
        const keyLight = new THREE.DirectionalLight(new THREE.Color(0xffefd1).convertSRGBToLinear(), 0.95);
        keyLight.position.set(8, 10, 15);
        this.scene.add(keyLight);
        const rimLight = new THREE.DirectionalLight(new THREE.Color(0xc4d5e8).convertSRGBToLinear(), 0.4);
        rimLight.position.set(-12, -4, 6);
        this.scene.add(rimLight);
        this.createInteriorBackdrop();
        this.canvas.setAttribute('role', 'button');
        this.canvas.tabIndex = 0;
        this.canvas.setAttribute('aria-label', 'Flying recorded renderer images in liquid amber, honey wood and brass frames. Select a print to enlarge it. Keyboard: arrow keys choose a print, Enter opens it; Grid View browses the complete collection.');
        this.onWindowResize();
    }

    loadAllImages() {
        const imageList = typeof ALL_IMAGES !== 'undefined' ? ALL_IMAGES : [];
        const shuffled = [...imageList];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        // Bound GPU memory and draw calls. The grid retains the complete archive.
        this.pendingImages = shuffled.slice(0, 30).map((path, index) => ({
            path, title: path.split('/').pop(), index
        }));
    }

    pumpImageQueue() {
        // Load only while visible, with two decodes in flight at most.
        while (this.canRender() && this.loadingImages < 2 && this.pendingImages.length) {
            const imageData = this.pendingImages.shift();
            this.loadingImages++;
            this.textureLoader.load(imageData.path, texture => {
                try {
                    this.createFlyingImage(imageData, texture);
                } catch (error) {
                    texture.dispose();
                    console.error('Could not prepare gallery image:', imageData.path, error);
                } finally {
                    this.loadingImages--;
                    this.invalidate();
                    this.pumpImageQueue();
                }
            }, undefined, error => {
                this.loadingImages--;
                console.error('Error loading image:', imageData.path, error);
                this.pumpImageQueue();
            });
        }
    }

    createFlyingImage(imageData, texture) {
        const aspect = texture.image.width / texture.image.height;
        const size = 0.9 + photonGalleryRandom(imageData.index, 25) * 0.24;
        const height = Math.min(3.2, 4.9 / aspect) * size;
        imageData.width = texture.image.width;
        imageData.height = texture.image.height;
        const width = height * aspect;
        // Thumbnails bound GPU storage; grid and lightbox use the original files.
        const longestEdge = Math.max(texture.image.width, texture.image.height);
        if (longestEdge > 768) {
            const thumbnail = document.createElement('canvas');
            thumbnail.width = Math.max(1, Math.round(texture.image.width * 768 / longestEdge));
            thumbnail.height = Math.max(1, Math.round(texture.image.height * 768 / longestEdge));
            const context = thumbnail.getContext('2d');
            if (context) {
                context.drawImage(texture.image, 0, 0, thumbnail.width, thumbnail.height);
                texture.image = thumbnail;
                texture.needsUpdate = true;
            }
        }
        texture.encoding = THREE.sRGBEncoding;
        texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        const imageMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            color: 0xffffff,
            side: THREE.DoubleSide,
            toneMapped: false,
            fog: false
        });
        // Four vertices: the recorded image itself is neither bent nor tinted.
        const imageMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), imageMaterial);
        const frameGroup = new THREE.Group();
        frameGroup.add(imageMesh);

        const index = imageData.index;
        const phase = index * 2.3999632297;
        const family = index % 3;
        const brass = family === 2;
        const wood = family === 1;
        const palettes = brass ? [0xd5a044, 0xb98032, 0xddad56] :
            wood ? [0xbf752b, 0xa96121, 0xd4933a] : [0xf0ab32, 0xe68b25, 0xeabd42];
        // r128 treats material Color hex values as linear. These are authored
        // sRGB swatches, so decode once before illumination/output encoding.
        const swatch = hex => new THREE.Color(hex).convertSRGBToLinear();
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: swatch(palettes[Math.floor(index / 3) % palettes.length]),
            metalness: brass ? 0.76 : wood ? 0.06 : 0.58,
            roughness: brass ? 0.38 : wood ? 0.72 : 0.20 + (index % 3) * 0.06,
            emissive: swatch(wood ? 0xa45c1e : brass ? 0xc18a31 : 0xd48928),
            emissiveIntensity: wood ? 0.10 : brass ? 0.17 : 0.22,
            side: THREE.DoubleSide
        });
        const { ribbon, outline, inlay } = brass ?
            this.createBrassFrameGeometry(width, height, Math.floor(index / 3) % 3) : wood ?
            this.createWoodFrameGeometry(width, height, phase) :
            this.createFrameGeometry(width, height, phase, index % 3);
        const frameMesh = new THREE.Mesh(ribbon, frameMaterial);
        frameGroup.add(frameMesh);
        const outlineMaterial = new THREE.LineBasicMaterial({
            color: swatch(wood ? 0xda983f : brass ? 0xdca94f : 0xf6bb4b), toneMapped: false,
            transparent: true, opacity: brass ? 0.82 : 0.65
        });
        frameGroup.add(new THREE.LineLoop(outline, outlineMaterial));
        if (inlay) {
            // Dark incised marks read as carving against the warm metal, while
            // the separate outer lip keeps a restrained gold catchlight.
            const engravingMaterial = new THREE.LineBasicMaterial({
                color: swatch(0x4c2e13), toneMapped: false
            });
            frameGroup.add(new THREE.LineSegments(inlay, engravingMaterial));
        }

        frameGroup.userData = {
            imageData, isClickable: true, imageMesh, imageMaterial, frameMaterial,
            phase, index, width, height, frameStyle: wood ? 'honey-wood' : brass ? 'carved-brass' : 'fluid-ribbon',
            isHovered: false
        };
        this.scene.add(frameGroup);
        this.flyingImages.push(frameGroup);
        this.pickTargets.push(imageMesh, frameMesh);
    }

    createFrameGeometry(width, height, phase, variant) {
        // A small, static ribbon around a rounded rectangle. Undulations are
        // decorative and do not encode primitive support, densities or a Jacobian.
        const halfWidth = width / 2 + 0.12;
        const halfHeight = height / 2 + 0.12;
        const radius = 0.10;
        const points = [];
        const side = (x1, y1, x2, y2, nx, ny) => {
            for (let i = 0; i < 8; i++) {
                const t = i / 8;
                points.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, nx, ny });
            }
        };
        const corner = (cx, cy, angle) => {
            for (let i = 0; i < 8; i++) {
                const a = angle + i / 8 * Math.PI / 2;
                const nx = Math.cos(a);
                const ny = Math.sin(a);
                points.push({ x: cx + radius * nx, y: cy + radius * ny, nx, ny });
            }
        };
        side(halfWidth - radius, halfHeight, -halfWidth + radius, halfHeight, 0, 1);
        corner(-halfWidth + radius, halfHeight - radius, Math.PI / 2);
        side(-halfWidth, halfHeight - radius, -halfWidth, -halfHeight + radius, -1, 0);
        corner(-halfWidth + radius, -halfHeight + radius, Math.PI);
        side(-halfWidth + radius, -halfHeight, halfWidth - radius, -halfHeight, 0, -1);
        corner(halfWidth - radius, -halfHeight + radius, Math.PI * 1.5);
        side(halfWidth, -halfHeight + radius, halfWidth, halfHeight - radius, 1, 0);
        corner(halfWidth - radius, halfHeight - radius, 0);

        const vertices = [];
        const rimVertices = [];
        const indices = [];
        points.forEach((point, index) => {
            const t = index / points.length * Math.PI * 2;
            const flow = Math.sin(t * (3 + variant) + phase);
            const thickness = 0.19 + flow * 0.10 + Math.cos(t * 7 - phase) * 0.035;
            const x = point.x + point.nx * thickness;
            const y = point.y + point.ny * thickness;
            const z = Math.sin(t * 3 + phase) * (0.06 + variant * 0.025);
            vertices.push(point.x, point.y, 0, x, y, z);
            rimVertices.push(x, y, z + 0.008);
            const a = index * 2;
            const b = ((index + 1) % points.length) * 2;
            indices.push(a, a + 1, b, a + 1, b + 1, b);
        });
        const ribbon = new THREE.BufferGeometry();
        ribbon.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        ribbon.setIndex(indices);
        ribbon.computeVertexNormals();
        ribbon.computeBoundingSphere();
        const outline = new THREE.BufferGeometry();
        outline.setAttribute('position', new THREE.Float32BufferAttribute(rimVertices, 3));
        return { ribbon, outline };
    }

    createBrassFrameGeometry(width, height, variant) {
        // A beveled molding, raised inner lip and engraved corner fans; the
        // outline/inlay are batched so ornament adds only one draw call.
        const halfWidth = width / 2 + 0.025;
        const halfHeight = height / 2 + 0.025;
        const thickness = 0.23 + variant * 0.025;
        const roundedRectangle = (path, x, y, radius) => {
            path.moveTo(-x + radius, -y);
            path.lineTo(x - radius, -y);
            path.quadraticCurveTo(x, -y, x, -y + radius);
            path.lineTo(x, y - radius);
            path.quadraticCurveTo(x, y, x - radius, y);
            path.lineTo(-x + radius, y);
            path.quadraticCurveTo(-x, y, -x, y - radius);
            path.lineTo(-x, -y + radius);
            path.quadraticCurveTo(-x, -y, -x + radius, -y);
            return path;
        };
        const shape = roundedRectangle(new THREE.Shape(), halfWidth + thickness, halfHeight + thickness, 0.18);
        shape.holes.push(roundedRectangle(new THREE.Path(), halfWidth, halfHeight, 0.06));
        const ribbon = new THREE.ExtrudeGeometry(shape, {
            depth: 0.10, bevelEnabled: true, bevelSegments: 2,
            steps: 1, bevelSize: 0.045, bevelThickness: 0.04, curveSegments: 5
        });
        ribbon.translate(0, 0, -0.055);
        const points = roundedRectangle(new THREE.Path(), halfWidth + thickness * 0.78,
            halfHeight + thickness * 0.78, 0.13).getPoints(6);
        const outline = new THREE.BufferGeometry().setFromPoints(
            points.map(point => new THREE.Vector3(point.x, point.y, 0.09)));
        const cuts = [];
        const segment = (ax, ay, bx, by, z = 0.096) => cuts.push(ax, ay, z, bx, by, z);
        const inner = roundedRectangle(new THREE.Path(), halfWidth + 0.055, halfHeight + 0.055, 0.075).getPoints(6);
        for (let i = 1; i < inner.length; i++) {
            segment(inner[i - 1].x, inner[i - 1].y, inner[i].x, inner[i].y);
        }
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
            for (let j = 0; j < 5; j++) {
                const angle = (j + 0.5) / 5 * Math.PI / 2;
                const ox = sx * (halfWidth + 0.035);
                const oy = sy * (halfHeight + 0.035);
                segment(ox + sx * Math.cos(angle) * 0.06, oy + sy * Math.sin(angle) * 0.06,
                    ox + sx * Math.cos(angle) * (thickness - 0.025),
                    oy + sy * Math.sin(angle) * (thickness - 0.025));
            }
        }
        // Small chevrons along the molding catch the light like chased metal.
        for (const sy of [-1, 1]) {
            for (let x = -halfWidth + 0.28; x < halfWidth - 0.2; x += 0.22) {
                const y = sy * (halfHeight + thickness * 0.47);
                segment(x - 0.045, y, x, y + sy * 0.045);
                segment(x, y + sy * 0.045, x + 0.045, y);
            }
        }
        const inlay = new THREE.BufferGeometry();
        inlay.setAttribute('position', new THREE.Float32BufferAttribute(cuts, 3));
        return { ribbon, outline, inlay };
    }

    createWoodFrameGeometry(width, height, phase) {
        // A substantial honey-colored molding with long, irregular grain. The
        // grain is batched line geometry, so it never needs a texture upload.
        const shape = new THREE.Shape();
        const x = width / 2 + 0.035;
        const y = height / 2 + 0.035;
        const border = 0.28;
        shape.moveTo(-x-border, -y-border);
        shape.lineTo(x+border, -y-border);
        shape.lineTo(x+border, y+border);
        shape.lineTo(-x-border, y+border);
        shape.closePath();
        const hole = new THREE.Path();
        hole.moveTo(-x,-y); hole.lineTo(x,-y); hole.lineTo(x,y); hole.lineTo(-x,y); hole.closePath();
        shape.holes.push(hole);
        const ribbon = new THREE.ExtrudeGeometry(shape, {
            depth: 0.14, bevelEnabled: true, bevelSegments: 2,
            steps: 1, bevelSize: 0.035, bevelThickness: 0.035
        });
        ribbon.translate(0,0,-0.10);
        const outline = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-x-0.22,-y-0.22,0.055), new THREE.Vector3(x+0.22,-y-0.22,0.055),
            new THREE.Vector3(x+0.22,y+0.22,0.055), new THREE.Vector3(-x-0.22,y+0.22,0.055)
        ]);
        const cuts = [];
        const stroke = points => {
            for(let i=1;i<points.length;i++) cuts.push(...points[i-1],...points[i]);
        };
        for(const sign of [-1,1]) for(let grain=0;grain<6;grain++) {
            const offset = 0.045 + grain * 0.035;
            const horizontal=[], vertical=[];
            for(let i=0;i<=24;i++) {
                const t=i/24;
                const wiggle=Math.sin(t*9+phase+grain)*0.007 + Math.sin(t*22+grain)*0.003;
                horizontal.push([-x+2*x*t, sign*(y+offset+wiggle),0.079]);
                vertical.push([sign*(x+offset+wiggle),-y+2*y*t,0.079]);
            }
            stroke(horizontal); stroke(vertical);
        }
        const inlay = new THREE.BufferGeometry();
        inlay.setAttribute('position',new THREE.Float32BufferAttribute(cuts,3));
        return {ribbon,outline,inlay};
    }

    createInteriorBackdrop() {
        // One inexpensive background pass: broad colored light and a few moving
        // wavefronts, without bloom buffers, ray marching or a full-screen blur.
        this.skyMaterial = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            vertexShader: `varying vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
            fragmentShader: `varying vec2 vUv; uniform float uTime;
                void main() {
                    vec2 p = (vUv - 0.5) * vec2(1.4, 1.0);
                    float amber = exp(-dot(p - vec2(-0.32 + 0.08*sin(uTime*0.08), 0.12),
                        p - vec2(-0.32 + 0.08*sin(uTime*0.08), 0.12)) * 8.0);
                    float jade = exp(-dot(p - vec2(0.35, -0.2 + 0.06*cos(uTime*0.09)),
                        p - vec2(0.35, -0.2 + 0.06*cos(uTime*0.09))) * 10.0);
                    vec3 color = vec3(0.0017, 0.0038, 0.006) +
                        amber * vec3(0.015, 0.009, 0.002) + jade * vec3(0.002, 0.013, 0.012);
                    for (int i = 0; i < 4; i++) {
                        float fi = float(i);
                        float d = p.y - (sin(p.x*4.2 + fi*0.7 + uTime*0.06)*0.11 + fi*0.105 - 0.21);
                        float core = 1.0 / (1.0 + d*d*180000.0);
                        float halo = 1.0 / (1.0 + d*d*1800.0);
                        color += (core*0.045 + halo*0.006) * vec3(1.0, 0.68, 0.26);
                    }
                    color *= 0.65 + 0.35 * (1.0 - smoothstep(0.1, 0.75, length(p)));
                    gl_FragColor = vec4(color, 1.0);
                    #include <encodings_fragment>
                }`,
            depthTest: false, depthWrite: false, toneMapped: false
        });
        const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.skyMaterial);
        sky.frustumCulled = false;
        sky.position.z = -110;
        sky.renderOrder = -10;
        this.camera.add(sky);
        this.scene.add(this.camera);

        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = glowCanvas.height = 32;
        const glowContext = glowCanvas.getContext('2d');
        if (!glowContext) return;
        const gradient = glowContext.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255,248,222,1)');
        gradient.addColorStop(0.14, 'rgba(255,227,153,.9)');
        gradient.addColorStop(0.4, 'rgba(240,183,89,.18)');
        gradient.addColorStop(1, 'rgba(210,156,64,0)');
        glowContext.fillStyle = gradient;
        glowContext.fillRect(0, 0, 32, 32);
        const glow = new THREE.CanvasTexture(glowCanvas);
        const vertices = [];
        for (let i = 0; i < 150; i++) {
            const phase = i * 2.3999632297;
            const radius = 24 + (i % 9) * 3;
            vertices.push(Math.cos(phase) * radius, ((i * 17) % 47) - 23,
                Math.sin(phase) * radius);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.PointsMaterial({
            map: glow, color: 0xffe1a0, size: 0.34, opacity: 0.75,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            toneMapped: false
        });
        this.roomSparks = new THREE.Points(geometry, material);
        this.scene.add(this.roomSparks);
    }

    canRender() {
        return this.isActive && this.isInView && !document.hidden && !this.modalOpen &&
            !this.contextLost && this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0;
    }

    invalidate() {
        if (this.canRender() && this.animationFrame === null) {
            this.animationFrame = requestAnimationFrame(this.tick);
        }
    }

    syncActivity() {
        this.lastTimestamp = null;
        if (!this.canRender()) {
            if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
            return;
        }
        this.pumpImageQueue();
        this.invalidate();
    }

    setActive(active) {
        this.isActive = active;
        if (active) this.onWindowResize();
        this.syncActivity();
    }

    animate(timestamp) {
        this.animationFrame = null;
        if (!this.canRender()) return;
        const reducedMotion = this.motionPreference.matches;
        const elapsed = this.lastTimestamp === null ? 0 : timestamp - this.lastTimestamp;
        if (!reducedMotion && this.lastTimestamp !== null && elapsed < this.frameInterval) {
            this.invalidate();
            return;
        }
        // Ease the whole flight while inspecting a print, preserving relative motion
        // and giving the pointer a larger selection window.
        if (!reducedMotion) this.animationTime += Math.min(elapsed / 1000, 0.1) *
            (this.hoveredFrame ? 0.22 : 1);
        this.lastTimestamp = timestamp;
        const time = this.animationTime;
        this.camera.position.set(0, 0, 32);
        this.camera.lookAt(0, 0, 0);
        this.skyMaterial.uniforms.uTime.value = time;
        if (this.roomSparks) {
            this.roomSparks.rotation.y = time * 0.012;
            this.roomSparks.position.y = Math.sin(time * 0.12) * 0.7;
        }
        this.flyingImages.forEach(frameGroup => {
            const data = frameGroup.userData;
            const pose = photonGalleryPose(data.index, time, this.camera.aspect);
            frameGroup.position.set(pose.x, pose.y, pose.z);
            // The flight is genuinely three-dimensional. Prints remain unlit and
            // front-facing, with bounded pitch/yaw rather than edge-on tumbling.
            frameGroup.lookAt(this.camera.position);
            frameGroup.rotateX(pose.pitch);
            frameGroup.rotateY(pose.yaw);
            frameGroup.rotateZ(pose.roll);
            const wood = data.frameStyle === 'honey-wood';
            const brass = data.frameStyle === 'carved-brass';
            data.frameMaterial.emissiveIntensity = data.isHovered ? (wood ? 0.20 : brass ? 0.34 : 0.48) :
                (wood ? 0.10 : brass ? 0.17 : 0.22) + Math.sin(time * 0.65 + data.phase) * 0.035;
        });
        this.renderer.render(this.scene, this.camera);
        // A print can fly away from a stationary pointer; update its hover after
        // world matrices have been rendered, not only on mousemove events.
        if (this.pointerInside) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const hit = this.raycaster.intersectObjects(this.pickTargets, false)[0];
            this.setHoveredFrame(hit ? hit.object.parent : null);
        }
        if (!reducedMotion) this.invalidate();
    }

    onWindowResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        if (!width || !height) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
        this.invalidate();
    }

    setupEventListeners() {
        this.canvas.addEventListener('pointermove', event => this.onMouseMove(event));
        this.canvas.addEventListener('pointerleave', () => {
            this.pointerInside = false;
            this.setHoveredFrame(null);
        });
        this.canvas.addEventListener('click', event => this.onMouseClick(event));
        this.canvas.addEventListener('keydown', event => {
            if (!this.flyingImages.length || !this.canRender()) return;
            if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation?.();
                const offset = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
                const selected = this.flyingImages.indexOf(this.hoveredFrame);
                const index = (selected + offset + this.flyingImages.length) % this.flyingImages.length;
                this.setHoveredFrame(this.flyingImages[index]);
                this.canvas.setAttribute('aria-label', `${index + 1} of ${this.flyingImages.length}: ${this.hoveredFrame.userData.imageData.title}. Enter to enlarge, arrows to choose another print.`);
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation?.();
                this.showImageModal((this.hoveredFrame || this.flyingImages[0]).userData.imageData,
                    this.hoveredFrame || this.flyingImages[0]);
            }
        });
        window.addEventListener('resize', () => this.onWindowResize());
        document.addEventListener('visibilitychange', () => this.syncActivity());
        this.canvas.addEventListener('webglcontextlost', event => {
            event.preventDefault();
            this.contextLost = true;
            this.syncActivity();
        });
        this.canvas.addEventListener('webglcontextrestored', () => {
            this.contextLost = false;
            this.syncActivity();
        });
        const motionChange = () => this.syncActivity();
        if (this.motionPreference.addEventListener) {
            this.motionPreference.addEventListener('change', motionChange);
        } else {
            this.motionPreference.addListener(motionChange);
        }
        if ('IntersectionObserver' in window) {
            this.visibilityObserver = new IntersectionObserver(entries => {
                this.isInView = entries.some(entry => entry.isIntersecting);
                this.syncActivity();
            });
            this.visibilityObserver.observe(this.canvas);
        } else {
            const checkVisibility = () => {
                const rect = this.canvas.getBoundingClientRect();
                this.isInView = rect.bottom > 0 && rect.top < window.innerHeight &&
                    rect.right > 0 && rect.left < window.innerWidth;
                this.syncActivity();
            };
            window.addEventListener('scroll', checkVisibility, { passive: true });
            window.addEventListener('resize', checkVisibility);
            checkVisibility();
        }
        if ('ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
            this.resizeObserver.observe(this.canvas);
        }
    }

    pickFrame(event) {
        if (!this.canRender()) return null;
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.set(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hit = this.raycaster.intersectObjects(this.pickTargets, false)[0];
        return hit ? hit.object.parent : null;
    }

    setHoveredFrame(frame) {
        if (frame === this.hoveredFrame) return;
        if (this.hoveredFrame) this.hoveredFrame.userData.isHovered = false;
        this.hoveredFrame = frame;
        if (frame) frame.userData.isHovered = true;
        this.canvas.style.cursor = frame ? 'pointer' : 'default';
        this.invalidate();
    }

    onMouseMove(event) {
        this.pointerInside = true;
        this.setHoveredFrame(this.pickFrame(event));
    }

    onMouseClick(event) {
        const frame = this.pickFrame(event);
        if (frame) this.showImageModal(frame.userData.imageData, frame);
    }

    projectPrint(frame) {
        const rect = this.canvas.getBoundingClientRect();
        const {width,height} = frame.userData;
        const points = [[-width/2,height/2],[width/2,height/2],
            [width/2,-height/2],[-width/2,-height/2]].map(([x,y]) => {
                const p = new THREE.Vector3(x,y,0).applyMatrix4(frame.matrixWorld).project(this.camera);
                return {x:rect.left+(p.x+1)*rect.width/2, y:rect.top+(1-p.y)*rect.height/2};
            });
        return {points};
    }

    showImageModal(imageData, frame) {
        if (this.modalOpen) return;
        const getOrigin = frame ? () => this.projectPrint(frame) : null;
        if (frame) {
            frame.visible = false;
            this.renderer.render(this.scene, this.camera);
        }
        this.modalOpen = true;
        this.syncActivity();
        showGalleryImageModal(imageData, () => {
            if (frame) frame.visible = true;
            this.modalOpen = false;
            this.syncActivity();
        }, getOrigin);
    }
}

// Both views open the untouched original in a body-level flight layer, so the
// enlarged print can exceed the gallery viewport without being clipped.
function showGalleryImageModal(imageData, onClose = () => {}, getOrigin = null) {
    const previousFocus = document.activeElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', imageData.title || 'Gallery image');
    modal.style.cssText = 'position:fixed;inset:0;z-index:2147483000;cursor:zoom-out;isolation:isolate;';
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:absolute;inset:0;background:rgba(5,7,8,.94);opacity:1;';
    const img = document.createElement('img');
    img.alt = imageData.title || 'Recorded renderer image';
    img.style.cssText = 'position:fixed;display:block;object-fit:contain;border:2px solid #d9a843;border-radius:8px;box-shadow:0 0 45px rgba(226,165,45,.28),0 24px 80px #000;box-sizing:border-box;transform-origin:0 0;opacity:0;cursor:zoom-out;max-width:none;max-height:none;';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = 'Return to gallery ×';
    closeButton.setAttribute('aria-label', 'Close enlarged image');
    closeButton.style.cssText = 'position:absolute;top:12px;right:16px;padding:10px 18px;color:#ffe4a5;background:#17130bee;border:1px solid #d4af37;border-radius:9px;box-shadow:0 0 20px #d4af3725;cursor:pointer;z-index:1;';
    const notice = document.createElement('p');
    notice.style.cssText = 'position:absolute;bottom:4px;left:0;right:0;text-align:center;color:#e1c998;font:13px system-ui;pointer-events:none;margin:7px;';
    notice.textContent = 'Original recording · click anywhere or press Escape to return';
    modal.append(backdrop, img, closeButton, notice);
    const root = document.documentElement;
    const oldOverflow = root.style.overflow;
    const oldGutter = root.style.scrollbarGutter;
    root.style.scrollbarGutter = 'stable';
    root.style.overflow = 'hidden';
    const inertSiblings = Array.from(document.body.children).map(element => [element, element.inert]);
    inertSiblings.forEach(([element]) => { element.inert = true; });
    document.body.appendChild(modal);
    let closing = false;
    let finished = false;
    let loaded = false;
    let target = null;
    let flight = null;
    let backdropAnimation = null;
    const layout = () => {
        const ratio = (img.naturalWidth || imageData.width || 4) / (img.naturalHeight || imageData.height || 3);
        const maxWidth = Math.max(1, window.innerWidth - 48);
        const maxHeight = Math.max(1, window.innerHeight - 104);
        const width = Math.min(maxWidth, maxHeight * ratio);
        const height = width / ratio;
        target = {width, height, left:(window.innerWidth-width)/2, top:56+(maxHeight-height)/2};
        Object.assign(img.style,{left:`${target.left}px`,top:`${target.top}px`,width:`${width}px`,height:`${height}px`});
    };
    const animate = (element, frames, duration) => {
        if(reducedMotion || !element.animate) return null;
        const animation=element.animate(frames,{duration,easing:'cubic-bezier(.22,.78,.22,1)',fill:'both'});
        if(animation.finished) animation.finished.catch(()=>{});
        return animation;
    };
    backdropAnimation = animate(backdrop,[{opacity:0},{opacity:1}],320);
    const begin = () => {
        if(closing || loaded) return;
        loaded = true;
        layout();
        img.style.opacity = '1';
        img.style.transform = 'matrix(1,0,0,1,0,0)';
        const origin = getOrigin ? getOrigin() : null;
        flight = animate(img,[{transform:photonGalleryFlightTransform(origin,target),opacity:0.7},
            {transform:'matrix(1,0,0,1,0,0)',opacity:1}],540);
    };
    const cleanup = () => {
        if(finished) return;
        finished = true;
        document.removeEventListener('keydown', handleKey);
        window.removeEventListener('resize', resize);
        inertSiblings.forEach(([element,wasInert]) => { element.inert=wasInert; });
        root.style.overflow=oldOverflow;
        root.style.scrollbarGutter=oldGutter;
        modal.remove();
        if(previousFocus && previousFocus.isConnected) previousFocus.focus({preventScroll:true});
        onClose();
    };
    const close = () => {
        if(closing) return;
        closing = true;
        const current = window.getComputedStyle ? window.getComputedStyle(img) : img.style;
        const fromTransform = current.transform || 'matrix(1,0,0,1,0,0)';
        const fromOpacity = current.opacity || '1';
        const backdropOpacity = window.getComputedStyle ? window.getComputedStyle(backdrop).opacity : '1';
        if(flight) flight.cancel();
        if(backdropAnimation) backdropAnimation.cancel();
        backdropAnimation = animate(backdrop,[{opacity:backdropOpacity || '1'},{opacity:0}],320);
        if(loaded && target) {
            const origin = getOrigin ? getOrigin() : null;
            flight = animate(img,[{transform:fromTransform,opacity:fromOpacity},
                {transform:photonGalleryFlightTransform(origin,target),opacity:0.65}],430);
        } else flight = null;
        if(flight && flight.finished) flight.finished.then(cleanup,cleanup);
        else cleanup();
    };
    const resize = () => {
        if(closing || !loaded) return;
        if(flight) flight.cancel();
        layout();
        img.style.transform='matrix(1,0,0,1,0,0)';
    };
    const handleKey = event => {
        if(event.key === 'Escape') { event.preventDefault(); event.stopPropagation?.(); close(); }
        if(event.key === 'Tab') { event.preventDefault(); event.stopPropagation?.(); closeButton.focus({preventScroll:true}); }
    };
    modal.addEventListener('click',close);
    document.addEventListener('keydown',handleKey);
    window.addEventListener('resize',resize);
    img.addEventListener('load',begin,{once:true});
    img.addEventListener('error',() => { notice.textContent='The original image could not be loaded. Click to return.'; },{once:true});
    img.src=imageData.path;
    if(img.complete && img.naturalWidth) begin();
    closeButton.focus({preventScroll:true});
    return {close};
}

class GridViewController {
    constructor() {
        this.gridContainer = document.getElementById('grid-container');
        this.gridView = document.getElementById('grid-view');
        this.flyingView = document.getElementById('gallery-3d');
        this.wrapper = this.flyingView.parentElement;
        this.isActive = false;
        this.modalOpen = false;
        this.wrapper.dataset.galleryView = 'flying';
        this.gridView.inert = true;
        this.gridView.setAttribute('aria-hidden', 'true');
        // Keep one view switch in both modes. Neither layer is display:none:
        // the room keeps its size, the canvas keeps its last frame, and a
        // reversal mid-fade simply transitions back from the current opacity.
        const controls = this.flyingView.querySelector('.view-controls');
        if (controls) {
            controls.setAttribute('role', 'group');
            controls.setAttribute('aria-label', 'Gallery presentation');
            this.wrapper.appendChild(controls);
        }
        const backButton = document.getElementById('back-to-3d');
        if (backButton) backButton.hidden = true;
        const heading = document.createElement('div');
        heading.className = 'grid-room-heading';
        const eyebrow = document.createElement('span');
        eyebrow.className = 'grid-room-kicker';
        eyebrow.textContent = 'The print room';
        const title = document.createElement('h3');
        title.textContent = 'A collection of light.';
        const count = document.createElement('span');
        count.className = 'grid-room-count';
        count.textContent = `${typeof ALL_IMAGES !== 'undefined' ? ALL_IMAGES.length : 0} recorded images · select a print to enlarge`;
        heading.append(eyebrow, title, count);
        this.gridView.insertBefore(heading, this.gridContainer);
        this.gridContainer.setAttribute('aria-label', 'Complete recorded image collection');
        this.syncButtons();
    }

    populate() {
        const imageList = typeof ALL_IMAGES !== 'undefined' ? ALL_IMAGES : [];
        const items = document.createDocumentFragment();
        const metadata = new Map();
        if (typeof GALLERY_ROOMS !== 'undefined') GALLERY_ROOMS.forEach(room => {
            (room.images || []).forEach(image => { if (!metadata.has(image.path)) metadata.set(image.path, image); });
        });
        imageList.forEach((imagePath, index) => {
            const filename = imagePath.split('/').pop();
            const record = metadata.get(imagePath);
            const title = record?.title || filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
            const gridItem = document.createElement('button');
            gridItem.type = 'button';
            gridItem.className = `grid-item grid-frame-${['brass', 'liquid', 'wood'][index % 3]}`;
            gridItem.dataset.print = String(index + 1);
            gridItem.setAttribute('aria-label', `Enlarge ${title}`);
            gridItem.title = filename;
            const mount = document.createElement('span');
            mount.className = 'grid-print-mount';
            const mat = document.createElement('span');
            mat.className = 'grid-print-mat';
            const img = document.createElement('img');
            img.alt = title;
            img.loading = 'lazy';
            img.decoding = 'async';
            const markLoaded = () => {
                gridItem.classList.add('is-loaded');
            };
            img.addEventListener('load', markLoaded, {once:true});
            img.src = imagePath;
            if (img.complete && img.naturalWidth) markLoaded();
            mat.appendChild(img);
            mount.appendChild(mat);
            const plate = document.createElement('span');
            plate.className = 'grid-print-plate';
            const number = document.createElement('span');
            number.className = 'grid-print-number';
            number.textContent = String(index + 1).padStart(3, '0');
            const caption = document.createElement('span');
            caption.className = 'grid-print-caption';
            const titleLine = document.createElement('strong');
            titleLine.textContent = title;
            const category = document.createElement('small');
            category.textContent = record?.category || 'Recorded renderer image';
            caption.append(titleLine, category);
            const enlarge = document.createElement('span');
            enlarge.className = 'grid-print-enlarge';
            enlarge.textContent = '↗';
            enlarge.setAttribute('aria-hidden', 'true');
            plate.append(number, caption, enlarge);
            gridItem.append(mount, plate);
            const openImage = () => this.showImageModal({path:imagePath,title,width:img.naturalWidth,height:img.naturalHeight}, () => {
                const rect=img.getBoundingClientRect();
                return {points:[{x:rect.left,y:rect.top},{x:rect.right,y:rect.top},
                    {x:rect.right,y:rect.bottom},{x:rect.left,y:rect.bottom}]};
            }, gridItem);
            gridItem.addEventListener('click', openImage);
            items.appendChild(gridItem);
        });
        this.gridContainer.appendChild(items);
    }

    showImageModal(imageData,getOrigin,gridItem) {
        if (this.modalOpen) return;
        this.modalOpen = true;
        gridItem?.classList.add('is-lightboxed');
        showGalleryImageModal(imageData,()=>{
            this.modalOpen = false;
            gridItem?.classList.remove('is-lightboxed');
        },getOrigin);
    }

    syncButtons() {
        document.querySelectorAll('.view-btn').forEach(button => {
            const active = button.dataset.mode === (this.isActive ? 'grid' : '3d');
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    show() {
        if (this.isActive) return;
        if (this.gridContainer.children.length === 0) this.populate();
        if (gallery3D) gallery3D.setActive(false);
        this.flyingView.classList.add('gallery-layer-inactive');
        this.flyingView.inert = true;
        this.flyingView.setAttribute('aria-hidden', 'true');
        this.gridView.classList.remove('hidden');
        this.gridView.inert = false;
        this.gridView.setAttribute('aria-hidden', 'false');
        this.wrapper.dataset.galleryView = 'grid';
        this.isActive = true;
        this.syncButtons();
    }

    hide() {
        if (!gallery3D || !this.isActive) return;
        this.flyingView.classList.remove('gallery-layer-inactive');
        this.flyingView.inert = false;
        this.flyingView.setAttribute('aria-hidden', 'false');
        this.gridView.classList.add('hidden');
        this.gridView.inert = true;
        this.gridView.setAttribute('aria-hidden', 'true');
        this.wrapper.dataset.galleryView = 'flying';
        this.isActive = false;
        gallery3D.setActive(true);
        this.syncButtons();
    }
}

let gallery3D;
let gridViewController;

window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        if (!loadingScreen) return;
        loadingScreen.style.opacity = '0';
        setTimeout(() => { loadingScreen.style.display = 'none'; }, 500);
    }, 1000);

    gridViewController = new GridViewController();
    try {
        gallery3D = new Gallery3D();
    } catch (error) {
        console.warn('3D gallery unavailable; showing the image grid.', error);
        gridViewController.show();
        const threeButton = document.querySelector('.view-btn[data-mode="3d"]');
        if (threeButton) threeButton.disabled = true;
        const backButton = document.getElementById('back-to-3d');
        if (backButton) backButton.hidden = true;
        document.querySelectorAll('.view-btn').forEach(button => {
            button.classList.toggle('active', button.dataset.mode === 'grid');
        });
    }

    document.querySelectorAll('.view-btn').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(other => other.classList.remove('active'));
            button.classList.add('active');
            if (button.dataset.mode === '3d') gridViewController.hide();
            else if (button.dataset.mode === 'grid') gridViewController.show();
        });
    });
    const backButton = document.getElementById('back-to-3d');
    if (backButton) backButton.addEventListener('click', () => {
        gridViewController.hide();
        document.querySelectorAll('.view-btn').forEach(button => {
            button.classList.toggle('active', button.dataset.mode === '3d');
        });
    });
});
