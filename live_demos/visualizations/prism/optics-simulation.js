class Vector2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    
    add(v) { return new Vector2(this.x + v.x, this.y + v.y); }
    subtract(v) { return new Vector2(this.x - v.x, this.y - v.y); }
    multiply(s) { return new Vector2(this.x * s, this.y * s); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    normalize() { 
        const len = this.length();
        return len > 0 ? new Vector2(this.x / len, this.y / len) : new Vector2(0, 0);
    }
    reflect(normal) {
        return this.subtract(normal.multiply(2 * this.dot(normal)));
    }
}

class Photon {
    constructor(position, direction, wavelength = 550) {
        this.position = position;
        this.direction = direction.normalize();
        this.wavelength = wavelength; // nanometers
        this.energy = 1.0;
        this.alive = true;
        this.trail = [position];
        this.maxTrailLength = 100;
        this.bounceCount = 0;
        this.distanceTraveled = 0;
        this.insideMedium = null; // Track which object we're inside (null = air)
        this.lastHitObject = null; // Prevent immediate re-collision with same surface
        this.skipCollisionFrames = 0; // Frames to skip collision with lastHitObject
    }
    
    update(dt, simulation) {
        if (!this.alive) return;
        
        const speed = 200; // pixels per second
        const movement = this.direction.multiply(speed * dt);
        const oldPos = new Vector2(this.position.x, this.position.y);
        this.position = this.position.add(movement);
        this.distanceTraveled += movement.length();
        
        // Check if photon crosses sensor line or hits multi-sensors
        if (simulation && this.alive) {
            if (simulation.multiSensorMode) {
                // Record to multi-directional sensors
                simulation.recordPhotonHitMulti(this.position, this.direction, this.wavelength, this.energy);
            } else if (oldPos.x < simulation.sensorX && this.position.x >= simulation.sensorX) {
                const y = oldPos.y + (this.position.y - oldPos.y) * ((simulation.sensorX - oldPos.x) / (this.position.x - oldPos.x));
                if (y >= 0 && y < 600) {
                    simulation.recordPhotonHit(y, this.wavelength, this.energy);
                }
            }
        }
        
        // Add to trail
        this.trail.push(new Vector2(this.position.x, this.position.y));
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
        
        // Kill photon if it goes out of bounds
        if (this.position.x < 0 || this.position.x > 800 || 
            this.position.y < 0 || this.position.y > 600) {
            this.alive = false;
        }
    }
    
    getColor() {
        // Convert wavelength to RGB
        const wavelength = this.wavelength;
        let r = 0, g = 0, b = 0;
        
        if (wavelength >= 380 && wavelength < 440) {
            r = -(wavelength - 440) / (440 - 380);
            g = 0;
            b = 1;
        } else if (wavelength >= 440 && wavelength < 490) {
            r = 0;
            g = (wavelength - 440) / (490 - 440);
            b = 1;
        } else if (wavelength >= 490 && wavelength < 510) {
            r = 0;
            g = 1;
            b = -(wavelength - 510) / (510 - 490);
        } else if (wavelength >= 510 && wavelength < 580) {
            r = (wavelength - 510) / (580 - 510);
            g = 1;
            b = 0;
        } else if (wavelength >= 580 && wavelength < 645) {
            r = 1;
            g = -(wavelength - 645) / (645 - 580);
            b = 0;
        } else if (wavelength >= 645 && wavelength <= 750) {
            r = 1;
            g = 0;
            b = 0;
        }
        
        // Intensity factor
        let factor = 1;
        if (wavelength >= 380 && wavelength < 420) {
            factor = 0.3 + 0.7 * (wavelength - 380) / (420 - 380);
        } else if (wavelength >= 645 && wavelength <= 750) {
            factor = 0.3 + 0.7 * (750 - wavelength) / (750 - 645);
        }
        
        r = Math.round(255 * r * factor * this.energy);
        g = Math.round(255 * g * factor * this.energy);
        b = Math.round(255 * b * factor * this.energy);
        
        return `rgb(${r}, ${g}, ${b})`;
    }
}

class OpticalObject {
    constructor(type, vertices, material = 'glass') {
        this.type = type;
        this.vertices = vertices;
        this.material = material;
        this.refractiveIndex = this.getRefractiveIndex(material);
    }
    
    getRefractiveIndex(material, wavelength = 550) {
        // Material IOR at reference wavelength (550nm - green)
        const baseIOR = {
            'glass': 1.5,
            'diamond': 2.4,
            'water': 1.33,
            'flint': 1.6,
            'sapphire': 1.77,
            'cubic-zirconia': 2.15,
            'quartz': 1.46
        }[material] || 1.5;
        
        // Cauchy's equation: n(λ) = A + B/λ²
        // Shorter wavelength (violet ~400nm) = HIGHER IOR → bends MORE
        // Longer wavelength (red ~700nm) = LOWER IOR → bends LESS
        const lambda_um = wavelength / 1000; // Convert nm to micrometers for Cauchy equation
        const lambda_ref_um = 0.550; // Reference wavelength in micrometers
        
        // Dispersion strength B scales with material (higher base IOR = stronger dispersion)
        const B = (baseIOR - 1.0) * 0.1; // Cauchy B coefficient in um²
        
        // n(λ) = n_ref + B * (1/λ² - 1/λ_ref²)
        // This gives: violet (small λ) → large 1/λ² → positive dispersion → higher n
        //             red (large λ) → small 1/λ² → negative dispersion → lower n
        const dispersion = B * (1/(lambda_um*lambda_um) - 1/(lambda_ref_um*lambda_ref_um));
        return baseIOR + dispersion;
    }
    
    intersectRay(rayStart, rayDir) {
        let closestIntersection = null;
        let minDistance = Infinity;
        
        for (let i = 0; i < this.vertices.length; i++) {
            const v1 = this.vertices[i];
            const v2 = this.vertices[(i + 1) % this.vertices.length];
            
            const intersection = this.lineIntersection(rayStart, rayDir, v1, v2);
            if (intersection && intersection.distance > 0.001 && intersection.distance < minDistance) {
                minDistance = intersection.distance;
                closestIntersection = intersection;
            }
        }
        
        return closestIntersection;
    }
    
    lineIntersection(rayStart, rayDir, lineStart, lineEnd) {
        const lineDir = lineEnd.subtract(lineStart);
        const cross = rayDir.x * lineDir.y - rayDir.y * lineDir.x;
        
        if (Math.abs(cross) < 1e-10) return null; // Parallel lines
        
        const diff = lineStart.subtract(rayStart);
        const t = (diff.x * lineDir.y - diff.y * lineDir.x) / cross;
        const u = (diff.x * rayDir.y - diff.y * rayDir.x) / cross;
        
        if (t >= 0 && u >= 0 && u <= 1) {
            const point = rayStart.add(rayDir.multiply(t));
            const normal = new Vector2(-lineDir.y, lineDir.x).normalize();
            
            return {
                point: point,
                normal: normal,
                distance: t
            };
        }
        
        return null;
    }
    
    isPointInside(point) {
        let inside = false;
        for (let i = 0, j = this.vertices.length - 1; i < this.vertices.length; j = i++) {
            const vi = this.vertices[i];
            const vj = this.vertices[j];
            
            if (((vi.y > point.y) !== (vj.y > point.y)) &&
                (point.x < (vj.x - vi.x) * (point.y - vi.y) / (vj.y - vi.y) + vi.x)) {
                inside = !inside;
            }
        }
        return inside;
    }
    
    containsPoint(point) {
        // Check if point is near the boundary of the object
        const threshold = 15; // pixels
        for (let i = 0; i < this.vertices.length; i++) {
            const v1 = this.vertices[i];
            const v2 = this.vertices[(i + 1) % this.vertices.length];
            
            // Distance from point to line segment
            const dx = v2.x - v1.x;
            const dy = v2.y - v1.y;
            const lengthSq = dx * dx + dy * dy;
            const t = Math.max(0, Math.min(1, ((point.x - v1.x) * dx + (point.y - v1.y) * dy) / lengthSq));
            const projX = v1.x + t * dx;
            const projY = v1.y + t * dy;
            const dist = Math.sqrt((point.x - projX) * (point.x - projX) + (point.y - projY) * (point.y - projY));
            
            if (dist < threshold) return true;
        }
        return this.isPointInside(point);
    }
    
    getCenter() {
        let sumX = 0, sumY = 0;
        for (let v of this.vertices) {
            sumX += v.x;
            sumY += v.y;
        }
        return new Vector2(sumX / this.vertices.length, sumY / this.vertices.length);
    }
}

class OpticsSimulation {
    constructor(canvas) {
        this.canvas = canvas;
        this.canvas.width = 900;
        this.canvas.height = 600;
        this.ctx = canvas.getContext('2d');
        this.ctx.lineWidth = 2;
        this.objects = [];
        this.photons = [];
        this.lightSource = new Vector2(100, 380); // Lower position to hit prism
        this.lightAngle = 20; // Slightly up to show rainbow
        this.photonRate = 500; // Photons per second instead of count
        this.lightRange = 0; // Parallel beam for clear rainbow
        this.lightSourceType = 'point'; // 'point', 'parallel', 'diffuse', 'diffuse-sphere', 'flashlight'
        this.lightSourceRadius = 20; // For sphere and flashlight
        this.flashlightBlockerAngle = 0; // Direction blockers point (opposite to light)
        this.flashlightBlockerSpread = 60; // Angle of cone blocked
        this.spectrumMode = 'white'; // 'white', 'purple-single', 'purple-dual', 'custom'
        this.customSpectrum = []; // Array of {min, max, weight} ranges
        this.tunnelMode = false;
        this.tunnelTop = 200;
        this.tunnelBottom = 400;
        this.paused = false;
        this.showTrails = true;
        this.participatingMedia = 0.001; // Scattering coefficient
        
        // Virtual sensor setup
        this.sensorCanvas = document.getElementById('sensorCanvas');
        this.sensorCtx = this.sensorCanvas.getContext('2d');
        // Store RGB values per pixel for proper color mixing - default high resolution
        this.sensorCanvas.width = 500;
        this.sensorCanvas.height = 400;
        this.sensorData = new Array(500).fill(0).map(() => new Array(400).fill(0).map(() => ({r: 0, g: 0, b: 0})));
        this.sensorX = 800; // Position on main canvas (updated for 900px width)
        this.sensorDecay = 0.998; // Much slower fade for better persistence
        this.sensorType = 'cmos'; // 'retina' or 'cmos'
        this.sensorSensitivity = 1.0; // 0.1 to 5.0
        this.splatType = 'gaussian'; // 'point', 'tent', 'gaussian'
        this.surfaceRoughness = 0.0; // 0 = perfect specular, 1 = very rough
        
        // Multi-directional sensors for raindrop mode
        this.multiSensors = [
            {angle: 0, x: 700, data: null, label: 'Right'},
            {angle: 90, x: 400, data: null, label: 'Top'},
            {angle: 180, x: 100, data: null, label: 'Left'},
            {angle: 270, x: 400, data: null, label: 'Bottom'}
        ];
        this.multiSensorMode = false;
        
        // Custom spectrum canvas
        this.spectrumCanvas = document.getElementById('spectrumCanvas');
        this.spectrumCtx = this.spectrumCanvas ? this.spectrumCanvas.getContext('2d') : null;
        this.isDraggingSpectrum = false;
        this.spectrumDragStart = null;
        
        this.dragging = false;
        this.draggedObject = null;
        this.dragOffset = new Vector2(0, 0);
        
        this.setupDefaultScene();
        this.setupEventListeners();
        this.setupSpectrumCanvas();
        this.lastTime = 0;
        this.animate();
    }
    
    setupDefaultScene(scene = 'prism') {
        this.objects = [];
        
        // Reset all light source parameters to defaults
        this.lightSource = new Vector2(100, 380);
        this.lightAngle = 20;
        this.lightSourceType = 'point';
        this.lightRange = 0;
        this.lightSourceRadius = 20;
        this.flashlightBlockerAngle = 0;
        this.multiSensorMode = false;
        
        switch(scene) {
            case 'prism':
            default:
                // Default prism scene - uses reset defaults above
                const prismVertices = [
                    new Vector2(300, 400),
                    new Vector2(400, 200),
                    new Vector2(500, 400)
                ];
                this.objects.push(new OpticalObject('prism', prismVertices, 'glass'));
                break;
                
            case 'tir':
                // Total Internal Reflection test - use diamond for high critical angle
                const tirVertices = [
                    new Vector2(350, 250),
                    new Vector2(450, 250),
                    new Vector2(450, 350),
                    new Vector2(350, 350)
                ];
                this.objects.push(new OpticalObject('tir-block', tirVertices, 'diamond'));
                // Set light at steep angle for TIR
                this.lightSource = new Vector2(250, 300);
                this.lightAngle = 15;
                break;
                
            case 'raindrop':
                // Circular raindrop
                const center = new Vector2(400, 300);
                const radius = 60;
                const vertices = [];
                for (let i = 0; i < 24; i++) {
                    const angle = (i / 24) * Math.PI * 2;
                    vertices.push(new Vector2(
                        center.x + Math.cos(angle) * radius,
                        center.y + Math.sin(angle) * radius
                    ));
                }
                this.objects.push(new OpticalObject('raindrop', vertices, 'water'));
                this.lightSource = new Vector2(100, 300);
                this.lightAngle = 0;
                this.lightSourceType = 'parallel';
                this.lightRange = 100;
                this.multiSensorMode = true;
                // Initialize multi-sensor data
                for (let sensor of this.multiSensors) {
                    sensor.data = new Array(100).fill(0).map(() => ({r: 0, g: 0, b: 0}));
                }
                break;
        }
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mousePos = new Vector2(
                e.clientX - rect.left,
                e.clientY - rect.top
            );
            
            // Check if clicking on an object
            for (let obj of this.objects) {
                if (obj.containsPoint(mousePos)) {
                    this.dragging = true;
                    this.draggedObject = obj;
                    const center = obj.getCenter();
                    this.dragOffset = center.subtract(mousePos);
                    return;
                }
            }
            
            // Otherwise, move light source
            this.lightSource = mousePos;
            this.reset();
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.dragging || !this.draggedObject) return;
            
            const rect = this.canvas.getBoundingClientRect();
            const mousePos = new Vector2(
                e.clientX - rect.left,
                e.clientY - rect.top
            );
            
            const newCenter = mousePos.add(this.dragOffset);
            const currentCenter = this.draggedObject.getCenter();
            const delta = newCenter.subtract(currentCenter);
            
            // Move all vertices
            for (let vertex of this.draggedObject.vertices) {
                vertex.x += delta.x;
                vertex.y += delta.y;
            }
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.dragging = false;
            this.draggedObject = null;
        });
        
        document.getElementById('lightAngle').addEventListener('input', (e) => {
            this.lightAngle = parseFloat(e.target.value);
            document.getElementById('angleValue').textContent = e.target.value + '°';
            this.reset();
        });
        
        document.getElementById('photonRate').addEventListener('input', (e) => {
            this.photonRate = parseInt(e.target.value);
            document.getElementById('rateValue').textContent = e.target.value + '/s';
        });
        
        document.getElementById('lightRange').addEventListener('input', (e) => {
            this.lightRange = parseInt(e.target.value);
            document.getElementById('rangeValue').textContent = e.target.value + '°';
        });
        
        document.getElementById('spectrumMode').addEventListener('change', (e) => {
            const oldMode = this.spectrumMode;
            this.spectrumMode = e.target.value;
            const customControls = document.getElementById('customSpectrumControls');
            if (customControls) {
                customControls.style.display = e.target.value === 'custom' ? 'block' : 'none';
            }
            
            // Copy current spectrum to custom mode when switching
            if (e.target.value === 'custom' && oldMode !== 'custom') {
                this.customSpectrum = this.getCurrentSpectrumRanges(oldMode);
            }
            
            // Update spectrum canvas styling for custom mode
            if (this.spectrumCanvas) {
                if (e.target.value === 'custom') {
                    this.spectrumCanvas.style.cursor = 'crosshair';
                    this.spectrumCanvas.style.border = '2px solid #d4af37';
                    this.spectrumCanvas.style.boxShadow = '0 0 15px rgba(212, 175, 55, 0.5)';
                } else {
                    this.spectrumCanvas.style.cursor = 'default';
                    this.spectrumCanvas.style.border = '1px solid #333';
                    this.spectrumCanvas.style.boxShadow = 'none';
                }
            }
            
            this.renderSpectrumCanvas(); // Update visualization
            this.reset();
        });
        
        document.getElementById('lightSourceType').addEventListener('change', (e) => {
            this.lightSourceType = e.target.value;
            const flashlightControl = document.getElementById('flashlightControl');
            if (flashlightControl) {
                flashlightControl.style.display = e.target.value === 'flashlight' ? 'block' : 'none';
            }
            this.reset();
        });
        
        const flashlightAngleEl = document.getElementById('flashlightAngle');
        if (flashlightAngleEl) {
            flashlightAngleEl.addEventListener('input', (e) => {
                this.flashlightBlockerAngle = parseFloat(e.target.value);
                document.getElementById('flashlightValue').textContent = e.target.value + '°';
            });
        }
        
        document.getElementById('tunnelMode').addEventListener('change', (e) => {
            this.tunnelMode = e.target.checked;
        });
        
        document.getElementById('sensorType').addEventListener('change', (e) => {
            this.sensorType = e.target.value;
        });
        
        document.getElementById('sensorSensitivity').addEventListener('input', (e) => {
            this.sensorSensitivity = parseFloat(e.target.value);
            document.getElementById('sensitivityValue').textContent = e.target.value + 'x';
        });
        
        document.getElementById('splatType').addEventListener('change', (e) => {
            this.splatType = e.target.value;
        });
        
        document.getElementById('surfaceRoughness').addEventListener('input', (e) => {
            this.surfaceRoughness = parseFloat(e.target.value);
            document.getElementById('roughnessValue').textContent = parseFloat(e.target.value).toFixed(2);
        });
        
        document.getElementById('prismMaterial').addEventListener('change', (e) => {
            this.objects.forEach(obj => {
                if (obj.type === 'prism') {
                    obj.material = e.target.value;
                }
            });
            this.reset();
        });
    }
    
    
    updatePhotons(dt) {
        if (this.paused) return;
        
        for (let photon of this.photons) {
            if (!photon.alive) continue;
            
            // Check tunnel wall collisions (perfect mirror)
            if (this.tunnelMode) {
                const nextY = photon.position.y + photon.direction.y * dt * 200;
                if (nextY <= this.tunnelTop) {
                    photon.direction.y = Math.abs(photon.direction.y);
                    photon.position.y = this.tunnelTop + 1;
                } else if (nextY >= this.tunnelBottom) {
                    photon.direction.y = -Math.abs(photon.direction.y);
                    photon.position.y = this.tunnelBottom - 1;
                }
            }
            
            // Store old position for swept collision detection
            const oldPos = new Vector2(photon.position.x, photon.position.y);
            const speed = 200;
            const movement = photon.direction.multiply(speed * dt);
            const newPos = oldPos.add(movement);
            
            // Check collisions with objects using swept line segment
            let minT = Infinity;
            let closestIntersection = null;
            let closestObject = null;
            
            for (let obj of this.objects) {
                // Skip collision with object we just hit to prevent immediate re-collision
                if (obj === photon.lastHitObject && photon.skipCollisionFrames > 0) {
                    continue;
                }
                
                // Check intersection along the movement path (swept collision)
                const intersection = obj.intersectRay(oldPos, photon.direction);
                if (intersection && intersection.distance >= 0 && intersection.distance <= movement.length() + 0.1) {
                    // Normalize t to [0,1] range along the movement
                    const t = intersection.distance / movement.length();
                    if (t < minT) {
                        minT = t;
                        closestIntersection = intersection;
                        closestObject = obj;
                    }
                }
            }
            
            // Decrement skip counter
            if (photon.skipCollisionFrames > 0) {
                photon.skipCollisionFrames--;
            }
            
            if (closestIntersection && minT <= 1.0) {
                // Collision detected - move to intersection point and handle interaction
                // Use geometric test on oldPos (before movement) - it's never on boundary so no ambiguity
                const wasInside = closestObject.isPointInside(oldPos);
                const distanceToIntersection = closestIntersection.point.subtract(oldPos).length();
                photon.distanceTraveled += distanceToIntersection;
                photon.position = closestIntersection.point;
                photon.bounceCount++;
                
                // Kill photon if too many bounces (prevent infinite loops)
                if (photon.bounceCount > 50) {
                    photon.alive = false;
                } else {
                    this.handlePhotonInteraction(photon, closestIntersection, closestObject, wasInside);
                    // Mark this object as last hit and skip it for 3 frames to prevent re-collision
                    photon.lastHitObject = closestObject;
                    photon.skipCollisionFrames = 3;
                }
            } else {
                // No collision - move normally
                photon.update(dt, this);
            }
        }
        
        // Remove dead photons (no energy filtering needed without absorption)
        this.photons = this.photons.filter(p => p.alive);
    }
    
    handlePhotonInteraction(photon, intersection, object, wasInside) {
        // wasInside tells us if photon was inside before hitting boundary
        const n1 = wasInside ? object.getRefractiveIndex(object.material, photon.wavelength) : 1.0;
        const n2 = wasInside ? 1.0 : object.getRefractiveIndex(object.material, photon.wavelength);
        
        // Apply attenuation based on distance traveled in medium (Beer's law)
        // Attenuation coefficient depends on material (air has essentially 0)
        const attenuationCoeff = wasInside ? this.getAttenuationCoefficient(object.material) : 0.0;
        const attenuation = Math.exp(-attenuationCoeff * photon.distanceTraveled);
        photon.energy *= attenuation;
        
        // Reset distance for next segment
        photon.distanceTraveled = 0;
        
        // Kill photon if energy too low
        if (photon.energy < 0.01) {
            photon.alive = false;
            return;
        }
        
        // Normal should point AGAINST the incident direction (into the medium we're leaving)
        let normal = intersection.normal;
        const cosI = -photon.direction.dot(normal);
        if (cosI < 0) {
            // Normal is pointing wrong way, flip it
            normal = normal.multiply(-1);
        }
        const absCosI = Math.abs(cosI);
        
        const sinI = Math.sqrt(Math.max(0, 1 - absCosI * absCosI));
        const sinT = (n1 / n2) * sinI;
        
        // Check for total internal reflection
        if (sinT > 1) {
            // Total internal reflection - stay in same medium
            photon.direction = photon.direction.reflect(normal);
            
            // Add roughness scattering
            if (this.surfaceRoughness > 0) {
                const scatterAngle = (Math.random() - 0.5) * this.surfaceRoughness * Math.PI / 2;
                const cos = Math.cos(scatterAngle);
                const sin = Math.sin(scatterAngle);
                photon.direction = new Vector2(
                    photon.direction.x * cos - photon.direction.y * sin,
                    photon.direction.x * sin + photon.direction.y * cos
                ).normalize();
            }
            
            // Even TIR has small surface absorption
            photon.energy *= 0.99;
            
            // Use larger offset to prevent numerical precision issues
            const tirOffset = normal.multiply(wasInside ? -1.0 : 1.0);
            photon.position = intersection.point.add(tirOffset);
            
            // Verification: TIR means photon must stay in same medium
            const nowInside = object.isPointInside(photon.position);
            if (nowInside !== wasInside) {
                // Failed to stay in same medium - force it
                photon.position = intersection.point.add(normal.multiply(wasInside ? -3.0 : 3.0));
            }
        } else {
            // Fresnel equations for reflection/transmission coefficients
            const cosT = Math.sqrt(1 - sinT * sinT);
            
            // Fresnel equations (s and p polarization)
            const rs = Math.pow((n1 * absCosI - n2 * cosT) / (n1 * absCosI + n2 * cosT), 2);
            const rp = Math.pow((n1 * cosT - n2 * absCosI) / (n1 * cosT + n2 * absCosI), 2);
            const reflectance = (rs + rp) / 2;
            
            if (Math.random() < reflectance) {
                // Reflection - bounce back into the same medium we came from
                photon.direction = photon.direction.reflect(normal);
                
                // Add roughness scattering to reflected ray
                if (this.surfaceRoughness > 0) {
                    const scatterAngle = (Math.random() - 0.5) * this.surfaceRoughness * Math.PI / 2;
                    const cos = Math.cos(scatterAngle);
                    const sin = Math.sin(scatterAngle);
                    photon.direction = new Vector2(
                        photon.direction.x * cos - photon.direction.y * sin,
                        photon.direction.x * sin + photon.direction.y * cos
                    ).normalize();
                }
                
                // Surface absorption on reflection (small loss)
                photon.energy *= 0.98;
                
                // Offset in direction of reflected ray (back into original medium)
                // Use larger offset to prevent numerical precision issues
                const reflectOffset = normal.multiply(wasInside ? -1.0 : 1.0);
                photon.position = intersection.point.add(reflectOffset);
                
                // Verification: ensure photon stayed in same medium
                const nowInside = object.isPointInside(photon.position);
                if (nowInside !== wasInside) {
                    // Failed to stay in same medium - force it with even larger offset
                    photon.position = intersection.point.add(normal.multiply(wasInside ? -3.0 : 3.0));
                }
            } else {
                // Refraction - enter the new medium
                const refractedDir = this.refract(photon.direction, normal, n1, n2);
                photon.direction = refractedDir.normalize();
                
                // Add roughness scattering to refracted ray
                if (this.surfaceRoughness > 0) {
                    const scatterAngle = (Math.random() - 0.5) * this.surfaceRoughness * Math.PI / 2;
                    const cos = Math.cos(scatterAngle);
                    const sin = Math.sin(scatterAngle);
                    photon.direction = new Vector2(
                        photon.direction.x * cos - photon.direction.y * sin,
                        photon.direction.x * sin + photon.direction.y * cos
                    ).normalize();
                }
                
                // Surface absorption on transmission (small loss)
                photon.energy *= 0.98;
                
                // Offset in direction of refracted ray (into new medium)
                // Use larger offset to prevent numerical precision issues
                const offset = normal.multiply(wasInside ? 1.0 : -1.0);
                photon.position = intersection.point.add(offset);
                
                // Verification: ensure photon actually crossed the boundary
                const nowInside = object.isPointInside(photon.position);
                const shouldBeInside = !wasInside; // After refraction, state should toggle
                if (nowInside !== shouldBeInside) {
                    // Failed to cross boundary properly - force it with even larger offset
                    // If was inside, push OUT (positive normal direction)
                    // If was outside, push IN (negative normal direction)
                    photon.position = intersection.point.add(normal.multiply(wasInside ? 3.0 : -3.0));
                }
            }
        }
    }
    
    getAttenuationCoefficient(material) {
        // Attenuation coefficient in units of 1/pixel
        // Reduced to show more internal bouncing and light paths
        const coefficients = {
            'glass': 0.0025,      // Lower absorption
            'diamond': 0.001,     // Very transparent
            'water': 0.0015,      // Lower absorption
            'flint': 0.004,       // More absorbing (lead content)
            'sapphire': 0.0015,   // Transparent
            'cubic-zirconia': 0.002,
            'quartz': 0.001       // Very transparent
        };
        return coefficients[material] || 0.0025;
    }
    
    refract(incident, normal, n1, n2) {
        const eta = n1 / n2;
        const cosI = -incident.dot(normal);
        const sinT2 = eta * eta * (1 - cosI * cosI);
        
        if (sinT2 > 1) return incident.reflect(normal); // Total internal reflection
        
        const cosT = Math.sqrt(1 - sinT2);
        // Snell's law: refracted = eta * incident + (eta * cosI - cosT) * normal
        return incident.multiply(eta).add(normal.multiply(eta * cosI - cosT));
    }
    
    recordPhotonHit(y, wavelength, photonEnergy = 1.0) {
        if (!this.multiSensorMode) {
            // Single sensor mode
            const width = this.sensorData.length;
            const height = this.sensorData[0].length;
            const sensorY = (y / 600) * height; // Keep as float for smooth distribution
            if (sensorY < 0 || sensorY >= height) return;
            
            const rgb = this.wavelengthToRGB(wavelength);
            // Multiply by photon energy - dim photons produce dim sensor response
            const energy = 8.0 * this.sensorSensitivity * photonEnergy;
            
            // Apply splat based on type
            let spreadRadius;
            switch(this.splatType) {
                case 'point':
                    spreadRadius = 0;
                    break;
                case 'tent':
                    spreadRadius = 2;
                    break;
                case 'gaussian':
                default:
                    spreadRadius = 2;
                    break;
            }
            
            // Fill horizontal line with vertical spread
            for (let x = 0; x < width; x++) {
                for (let dy = -spreadRadius; dy <= spreadRadius; dy++) {
                    const targetY = Math.floor(sensorY + dy);
                    if (targetY >= 0 && targetY < height) {
                        let falloff = 1.0;
                        
                        if (this.splatType === 'gaussian') {
                            // Gaussian falloff
                            falloff = Math.exp(-0.5 * dy * dy);
                        } else if (this.splatType === 'tent') {
                            // Linear tent falloff
                            falloff = 1.0 - Math.abs(dy) / (spreadRadius + 1);
                        }
                        // point has no falloff (spreadRadius = 0)
                        
                        this.sensorData[x][targetY].r += rgb.r * energy * falloff;
                        this.sensorData[x][targetY].g += rgb.g * energy * falloff;
                        this.sensorData[x][targetY].b += rgb.b * energy * falloff;
                    }
                }
            }
        }
    }
    
    recordPhotonHitMulti(position, direction, wavelength, photonEnergy = 1.0) {
        // Check which sensor(s) this photon might hit
        for (let sensor of this.multiSensors) {
            const angleRad = (sensor.angle * Math.PI) / 180;
            const sensorNormal = new Vector2(Math.cos(angleRad), -Math.sin(angleRad));
            
            // Check if photon is moving toward sensor
            const dot = direction.dot(sensorNormal);
            if (dot < 0.7) continue; // Not hitting this sensor
            
            // Compute angle from raindrop center
            const center = new Vector2(400, 300);
            const fromCenter = position.subtract(center).normalize();
            const angle = Math.atan2(fromCenter.y, fromCenter.x);
            
            if (Math.abs(angle - (sensor.angle * Math.PI / 180)) < Math.PI / 4) {
                const perpendicular = new Vector2(-sensorNormal.y, sensorNormal.x);
                const offset = fromCenter.dot(perpendicular);
                const sensorIdx = Math.floor(((offset + 1) / 2) * 100);
                
                if (sensorIdx >= 0 && sensorIdx < 100) {
                    const rgb = this.wavelengthToRGB(wavelength);
                    // Multiply by photon energy
                    const energy = 10.0 * this.sensorSensitivity * photonEnergy;
                    sensor.data[sensorIdx].r += rgb.r * energy;
                    sensor.data[sensorIdx].g += rgb.g * energy;
                    sensor.data[sensorIdx].b += rgb.b * energy;
                }
            }
        }
    }
    
    wavelengthToRGB(wavelength) {
        // Convert wavelength (nm) to RGB color
        // Based on CIE color matching functions approximation
        let r = 0, g = 0, b = 0;
        
        if (wavelength >= 380 && wavelength < 440) {
            r = -(wavelength - 440) / (440 - 380);
            g = 0.0;
            b = 1.0;
        } else if (wavelength >= 440 && wavelength < 490) {
            r = 0.0;
            g = (wavelength - 440) / (490 - 440);
            b = 1.0;
        } else if (wavelength >= 490 && wavelength < 510) {
            r = 0.0;
            g = 1.0;
            b = -(wavelength - 510) / (510 - 490);
        } else if (wavelength >= 510 && wavelength < 580) {
            r = (wavelength - 510) / (580 - 510);
            g = 1.0;
            b = 0.0;
        } else if (wavelength >= 580 && wavelength < 645) {
            r = 1.0;
            g = -(wavelength - 645) / (645 - 580);
            b = 0.0;
        } else if (wavelength >= 645 && wavelength <= 750) {
            r = 1.0;
            g = 0.0;
            b = 0.0;
        }
        
        // Intensity correction for edge wavelengths
        let factor = 1.0;
        if (wavelength >= 380 && wavelength < 420) {
            factor = 0.3 + 0.7 * (wavelength - 380) / (420 - 380);
        } else if (wavelength >= 700 && wavelength <= 750) {
            factor = 0.3 + 0.7 * (750 - wavelength) / (750 - 700);
        }
        
        return {
            r: r * factor,
            g: g * factor,
            b: b * factor
        };
    }
    
    render() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw tunnel walls if enabled
        if (this.tunnelMode) {
            this.ctx.strokeStyle = '#888';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(0, this.tunnelTop);
            this.ctx.lineTo(800, this.tunnelTop);
            this.ctx.moveTo(0, this.tunnelBottom);
            this.ctx.lineTo(800, this.tunnelBottom);
            this.ctx.stroke();
            
            this.ctx.fillStyle = 'rgba(136, 136, 136, 0.1)';
            this.ctx.fillRect(0, 0, 800, this.tunnelTop);
            this.ctx.fillRect(0, this.tunnelBottom, 800, 600 - this.tunnelBottom);
        }
        
        // Draw objects
        for (let obj of this.objects) {
            this.drawObject(obj);
        }
        
        // Draw photons
        for (let photon of this.photons) {
            if (!photon.alive) continue;
            
            // Draw trail if enabled
            if (this.showTrails && photon.trail.length > 1) {
                this.ctx.strokeStyle = photon.getColor();
                this.ctx.globalAlpha = 0.3;
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.moveTo(photon.trail[0].x, photon.trail[0].y);
                for (let i = 1; i < photon.trail.length; i++) {
                    this.ctx.lineTo(photon.trail[i].x, photon.trail[i].y);
                }
                this.ctx.stroke();
                this.ctx.globalAlpha = 1;
            }
            
            // Draw photon as a bright point
            this.ctx.fillStyle = photon.getColor();
            this.ctx.beginPath();
            this.ctx.arc(photon.position.x, photon.position.y, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Draw sensor line
        this.ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.sensorX, 0);
        this.ctx.lineTo(this.sensorX, 600);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // Draw light source
        if (this.lightSourceType === 'diffuse-sphere') {
            // Draw circle for sphere source
            this.ctx.strokeStyle = '#ffff88';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(this.lightSource.x, this.lightSource.y, this.lightSourceRadius, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.fillStyle = 'rgba(255, 255, 136, 0.2)';
            this.ctx.fill();
        } else {
            this.ctx.fillStyle = '#ffff88';
            this.ctx.beginPath();
            this.ctx.arc(this.lightSource.x, this.lightSource.y, 8, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Draw light source direction indicator
        const angleRad = (this.lightAngle * Math.PI) / 180;
        const endPoint = this.lightSource.add(new Vector2(Math.cos(angleRad), -Math.sin(angleRad)).multiply(30));
        this.ctx.strokeStyle = '#ffff88';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(this.lightSource.x, this.lightSource.y);
        this.ctx.lineTo(endPoint.x, endPoint.y);
        this.ctx.stroke();
        
        // Draw flashlight mirrors (< shape)
        if (this.lightSourceType === 'flashlight') {
            const emissionAngle = (this.flashlightBlockerAngle * Math.PI) / 180;
            const mirrorLength = this.lightSourceRadius * 2.5;
            const backwardDist = 40; // Distance to place vertex B backward
            
            // Calculate vertex B (middle vertex) - moved backward from light source
            const vertexB = new Vector2(
                this.lightSource.x - Math.cos(emissionAngle) * backwardDist,
                this.lightSource.y - Math.sin(emissionAngle) * backwardDist
            );
            
            // Calculate vertices A and C (closer to light source)
            const wedgeAngle = Math.PI / 4; // 45 degrees for wedge opening
            const vertexA = new Vector2(
                vertexB.x + Math.cos(emissionAngle - wedgeAngle) * mirrorLength,
                vertexB.y + Math.sin(emissionAngle - wedgeAngle) * mirrorLength
            );
            const vertexC = new Vector2(
                vertexB.x + Math.cos(emissionAngle + wedgeAngle) * mirrorLength,
                vertexB.y + Math.sin(emissionAngle + wedgeAngle) * mirrorLength
            );
            
            // Draw upper mirror (B to A)
            this.ctx.strokeStyle = '#88ccff';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(vertexB.x, vertexB.y);
            this.ctx.lineTo(vertexA.x, vertexA.y);
            this.ctx.stroke();
            
            // Draw lower mirror (B to C)
            this.ctx.beginPath();
            this.ctx.moveTo(vertexB.x, vertexB.y);
            this.ctx.lineTo(vertexC.x, vertexC.y);
            this.ctx.stroke();
        }
        
        // Draw lens preview (dashed outline) if modal is open
        if (typeof lensPreviewVertices !== 'undefined' && lensPreviewVertices && lensPreviewVertices.length > 0) {
            this.ctx.strokeStyle = '#d4af37';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([8, 4]);
            this.ctx.beginPath();
            this.ctx.moveTo(lensPreviewVertices[0].x, lensPreviewVertices[0].y);
            for (let i = 1; i < lensPreviewVertices.length; i++) {
                this.ctx.lineTo(lensPreviewVertices[i].x, lensPreviewVertices[i].y);
            }
            this.ctx.closePath();
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            // Add a subtle fill
            this.ctx.fillStyle = 'rgba(212, 175, 55, 0.1)';
            this.ctx.fill();
        }
    }
    
    drawObject(obj) {
        this.ctx.strokeStyle = '#666';
        this.ctx.fillStyle = 'rgba(100, 150, 255, 0.1)';
        this.ctx.lineWidth = 2;
        
        this.ctx.beginPath();
        this.ctx.moveTo(obj.vertices[0].x, obj.vertices[0].y);
        for (let i = 1; i < obj.vertices.length; i++) {
            this.ctx.lineTo(obj.vertices[i].x, obj.vertices[i].y);
        }
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
        
        // Label the object
        const center = obj.vertices.reduce((sum, v) => sum.add(v), new Vector2(0, 0))
                                  .multiply(1 / obj.vertices.length);
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(obj.material, center.x, center.y);
    }
    
    animate(currentTime = 0) {
        const dt = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        
        this.emitPhotons(dt);
        
        this.updatePhotons(dt);
        this.render();
        this.renderSensor();
        
        requestAnimationFrame((time) => this.animate(time));
    }
    
    emitPhotons(dt) {
        // Emit photons continuously based on rate
        const photonsToEmit = Math.floor(this.photonRate * dt) + (Math.random() < (this.photonRate * dt) % 1 ? 1 : 0);
        
        // Angle convention: 0 = right, positive = counterclockwise (up)
        const angleRad = (this.lightAngle * Math.PI) / 180;
        const baseDirection = new Vector2(Math.cos(angleRad), -Math.sin(angleRad));
        
        for (let i = 0; i < photonsToEmit; i++) {
            // Get wavelength based on spectrum mode
            const wavelength = this.getWavelengthFromSpectrum();
            
            let direction;
            let position = new Vector2(this.lightSource.x, this.lightSource.y);
            let blocked = false;
            
            switch(this.lightSourceType) {
                case 'point':
                    // Point source with angular spread
                    const rangeRad = (this.lightRange * Math.PI) / 180;
                    const randomAngle = (Math.random() - 0.5) * rangeRad;
                    const cos1 = Math.cos(randomAngle);
                    const sin1 = Math.sin(randomAngle);
                    direction = new Vector2(
                        baseDirection.x * cos1 - baseDirection.y * sin1,
                        baseDirection.x * sin1 + baseDirection.y * cos1
                    );
                    break;
                    
                case 'parallel':
                    // Parallel beam with spatial spread
                    const perpendicular = new Vector2(-baseDirection.y, baseDirection.x);
                    const spread = (Math.random() - 0.5) * this.lightRange * 2;
                    position = position.add(perpendicular.multiply(spread));
                    direction = baseDirection;
                    break;
                    
                case 'diffuse':
                    // Diffuse source emits in random directions
                    const randomDir = Math.random() * 2 * Math.PI;
                    direction = new Vector2(Math.cos(randomDir), Math.sin(randomDir));
                    break;
                    
                case 'diffuse-sphere':
                    // Emit from random point on circle perimeter
                    const circleAngle = Math.random() * 2 * Math.PI;
                    position = this.lightSource.add(new Vector2(
                        Math.cos(circleAngle) * this.lightSourceRadius,
                        Math.sin(circleAngle) * this.lightSourceRadius
                    ));
                    // Random direction from that point
                    const emitDir = Math.random() * 2 * Math.PI;
                    direction = new Vector2(Math.cos(emitDir), Math.sin(emitDir));
                    break;
                    
                case 'flashlight':
                    // Omnidirectional source - mirrors will redirect
                    const flashDir = Math.random() * 2 * Math.PI;
                    direction = new Vector2(Math.cos(flashDir), Math.sin(flashDir));
                    break;
            }
            
            if (!blocked) {
                this.photons.push(new Photon(
                    position,
                    direction,
                    wavelength
                ));
            }
        }
    }
    
    getWavelengthFromSpectrum() {
        switch(this.spectrumMode) {
            case 'white':
                return 380 + Math.random() * 370; // Full visible spectrum
            case 'purple-single':
                return 420; // Single purple wavelength
            case 'purple-dual':
                return Math.random() < 0.5 ? 420 : 650; // Mix of blue and red (metamerism)
            case 'red-violet':
                return Math.random() < 0.5 ? 400 : 700; // Opposite ends of spectrum
            case 'yellow-single':
                return 580; // Single yellow wavelength
            case 'yellow-dual':
                return Math.random() < 0.5 ? 530 : 630; // Green + Red = Yellow (metamerism)
            case 'cyan':
                return 490; // Single cyan
            case 'magenta':
                return Math.random() < 0.5 ? 450 : 650; // Blue + Red = Magenta
            case 'green-narrow':
                return 520 + Math.random() * 40; // Narrow green band
            case 'custom':
                if (this.customSpectrum.length === 0) return 550;
                const totalWeight = this.customSpectrum.reduce((sum, r) => sum + r.weight, 0);
                let rand = Math.random() * totalWeight;
                for (let range of this.customSpectrum) {
                    rand -= range.weight;
                    if (rand <= 0) {
                        return range.min + Math.random() * (range.max - range.min);
                    }
                }
                return 550;
            default:
                return 550;
        }
    }
    
    renderSensor() {
        const width = this.sensorData.length;
        const height = this.sensorData[0].length;
        
        if (this.multiSensorMode) {
            // Multi-sensor mode: draw 4 sensors in 2x2 grid, filling most of canvas
            this.sensorCtx.fillStyle = '#000';
            this.sensorCtx.fillRect(0, 0, width, height);
            
            const sensorWidth = 245;
            const sensorHeight = 195;
            const gap = 5;
            
            for (let i = 0; i < 4; i++) {
                const sensor = this.multiSensors[i];
                if (!sensor.data) continue;
                
                const col = i % 2;
                const row = Math.floor(i / 2);
                const offsetX = col * (sensorWidth + gap) + gap;
                const offsetY = row * (sensorHeight + gap) + gap;
                
                // Apply decay
                for (let x = 0; x < 100; x++) {
                    sensor.data[x].r *= this.sensorDecay;
                    sensor.data[x].g *= this.sensorDecay;
                    sensor.data[x].b *= this.sensorDecay;
                }
                
                // Render this sensor
                const imageData = this.sensorCtx.createImageData(sensorWidth, sensorHeight);
                for (let y = 0; y < sensorHeight; y++) {
                    for (let x = 0; x < sensorWidth; x++) {
                        const dataX = Math.floor((x / sensorWidth) * 100);
                        const pixel = sensor.data[dataX];
                        
                        const idx = (y * sensorWidth + x) * 4;
                        const scale = this.sensorType === 'retina' ? 50 : 2;
                        const r = this.sensorType === 'retina' ? Math.log1p(pixel.r) * scale : pixel.r * scale;
                        const g = this.sensorType === 'retina' ? Math.log1p(pixel.g) * scale : pixel.g * scale;
                        const b = this.sensorType === 'retina' ? Math.log1p(pixel.b) * scale : pixel.b * scale;
                        
                        imageData.data[idx] = Math.min(255, Math.max(0, r));
                        imageData.data[idx + 1] = Math.min(255, Math.max(0, g));
                        imageData.data[idx + 2] = Math.min(255, Math.max(0, b));
                        imageData.data[idx + 3] = 255;
                    }
                }
                this.sensorCtx.putImageData(imageData, offsetX, offsetY);
                
                // Draw label
                this.sensorCtx.fillStyle = '#d4af37';
                this.sensorCtx.font = '10px Arial';
                this.sensorCtx.fillText(sensor.label, offsetX + 5, offsetY + sensorHeight - 5);
            }
        } else {
            // Single sensor mode
            // Apply decay to accumulated RGB values
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < height; y++) {
                    this.sensorData[x][y].r *= this.sensorDecay;
                    this.sensorData[x][y].g *= this.sensorDecay;
                    this.sensorData[x][y].b *= this.sensorDecay;
                }
            }
            
            // Render sensor display
            const imageData = this.sensorCtx.createImageData(width, height);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const pixel = this.sensorData[x][y];
                    
                    // Apply sensor response curve
                    let r, g, b;
                    if (this.sensorType === 'retina') {
                        // Logarithmic response (human eye)
                        const scale = 50;
                        r = Math.log1p(pixel.r) * scale;
                        g = Math.log1p(pixel.g) * scale;
                        b = Math.log1p(pixel.b) * scale;
                    } else {
                        // Linear response (CMOS sensor)
                        const scale = 2;
                        r = pixel.r * scale;
                        g = pixel.g * scale;
                        b = pixel.b * scale;
                    }
                    
                    // Clamp to valid range
                    imageData.data[idx] = Math.min(255, Math.max(0, r));
                    imageData.data[idx + 1] = Math.min(255, Math.max(0, g));
                    imageData.data[idx + 2] = Math.min(255, Math.max(0, b));
                    imageData.data[idx + 3] = 255;
                }
            }
            this.sensorCtx.putImageData(imageData, 0, 0);
        }
    }
    
    hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return {r: Math.floor(r * 255), g: Math.floor(g * 255), b: Math.floor(b * 255)};
    }
    
    reset() {
        this.photons = [];
        // Reset sensor data with RGB structure - use current dimensions
        const width = this.sensorCanvas.width;
        const height = this.sensorCanvas.height;
        this.sensorData = new Array(width).fill(0).map(() => new Array(height).fill(0).map(() => ({r: 0, g: 0, b: 0})));
    }
    
    setupSpectrumCanvas() {
        if (!this.spectrumCanvas) return;
        
        this.renderSpectrumCanvas();
        
        this.spectrumCanvas.addEventListener('mousedown', (e) => {
            const rect = this.spectrumCanvas.getBoundingClientRect();
            // Scale from display coords to canvas internal coords
            const scaleX = this.spectrumCanvas.width / rect.width;
            const x = (e.clientX - rect.left) * scaleX;
            this.isDraggingSpectrum = true;
            this.spectrumDragStart = x;
        });
        
        this.spectrumCanvas.addEventListener('mousemove', (e) => {
            if (!this.isDraggingSpectrum) return;
            const rect = this.spectrumCanvas.getBoundingClientRect();
            const scaleX = this.spectrumCanvas.width / rect.width;
            const x = (e.clientX - rect.left) * scaleX;
            this.renderSpectrumCanvas(this.spectrumDragStart, x);
        });
        
        this.spectrumCanvas.addEventListener('mouseup', (e) => {
            if (!this.isDraggingSpectrum) return;
            const rect = this.spectrumCanvas.getBoundingClientRect();
            const scaleX = this.spectrumCanvas.width / rect.width;
            const x = (e.clientX - rect.left) * scaleX;
            
            const minX = Math.min(this.spectrumDragStart, x);
            const maxX = Math.max(this.spectrumDragStart, x);
            
            // Convert canvas x to wavelength (use canvas internal width)
            const canvasWidth = this.spectrumCanvas.width;
            const minWavelength = 380 + (minX / canvasWidth) * 370;
            const maxWavelength = 380 + (maxX / canvasWidth) * 370;
            
            if (maxWavelength - minWavelength > 10) {
                this.customSpectrum.push({
                    min: minWavelength,
                    max: maxWavelength,
                    weight: 1.0
                });
                
                // Flash effect
                this.flashSpectrumRange(minX, maxX);
            }
            
            this.isDraggingSpectrum = false;
            this.spectrumDragStart = null;
            this.renderSpectrumCanvas();
        });
    }
    
    renderSpectrumCanvas(dragStart = null, dragEnd = null) {
        if (!this.spectrumCtx) return;
        
        const ctx = this.spectrumCtx;
        const width = this.spectrumCanvas.width;   // Use actual canvas width
        const height = this.spectrumCanvas.height; // Use actual canvas height
        
        // Clear canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        
        // Draw spectrum gradient
        for (let x = 0; x < width; x++) {
            const wavelength = 380 + (x / width) * 370;
            const rgb = this.wavelengthToRGB(wavelength);
            ctx.fillStyle = `rgb(${rgb.r * 255}, ${rgb.g * 255}, ${rgb.b * 255})`;
            ctx.fillRect(x, 0, 1, 150); // Taller gradient
        }
        
        // Draw custom ranges with stronger highlight
        for (let range of this.customSpectrum) {
            const x1 = ((range.min - 380) / 370) * width;
            const x2 = ((range.max - 380) / 370) * width;
            
            // Bright border
            ctx.strokeStyle = '#d4af37';
            ctx.lineWidth = 2;
            ctx.strokeRect(x1, 0, x2 - x1, 150);
            
            // Semi-transparent fill
            ctx.fillStyle = 'rgba(212, 175, 55, 0.3)';
            ctx.fillRect(x1, 0, x2 - x1, 150);
        }
        
        // Draw current drag
        if (dragStart !== null && dragEnd !== null) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            const minX = Math.min(dragStart, dragEnd);
            const maxX = Math.max(dragStart, dragEnd);
            ctx.fillRect(minX, 0, maxX - minX, 150);
        }
        
        // Draw wavelength labels
        ctx.fillStyle = '#fff';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('380nm', 20, 170);
        ctx.fillText('550nm (green)', width / 2, 170);
        ctx.fillText('750nm', width - 20, 170);
        
        // Visualize current spectrum mode distribution
        if (!this.customSpectrum || this.customSpectrum.length === 0) {
            this.drawSpectrumDistribution(ctx, width);
        }
    }
    
    drawSpectrumDistribution(ctx, width) {
        // Show which wavelengths are being emitted in current mode
        const height = 40;
        const y = 145;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        
        // Add border for better visibility
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.8)';
        ctx.lineWidth = 1;
        
        switch(this.spectrumMode) {
            case 'white':
                ctx.fillRect(0, y, width, height);
                ctx.strokeRect(0, y, width, height);
                break;
            case 'purple-single':
                const px = ((420 - 380) / 370) * width;
                const singleWidth = 12; // Wider bars
                ctx.fillRect(px - singleWidth/2, y, singleWidth, height);
                ctx.strokeRect(px - singleWidth/2, y, singleWidth, height);
                break;
            case 'purple-dual':
                const p1x = ((420 - 380) / 370) * width;
                const p2x = ((650 - 380) / 370) * width;
                const dualWidth = 8;
                ctx.fillRect(p1x - dualWidth/2, y, dualWidth, height);
                ctx.strokeRect(p1x - dualWidth/2, y, dualWidth, height);
                ctx.fillRect(p2x - dualWidth/2, y, dualWidth, height);
                ctx.strokeRect(p2x - dualWidth/2, y, dualWidth, height);
                break;
            case 'red-violet':
                const r1x = ((400 - 380) / 370) * width;
                const r2x = ((700 - 380) / 370) * width;
                ctx.fillRect(r1x - dualWidth/2, y, dualWidth, height);
                ctx.strokeRect(r1x - dualWidth/2, y, dualWidth, height);
                ctx.fillRect(r2x - dualWidth/2, y, dualWidth, height);
                ctx.strokeRect(r2x - dualWidth/2, y, dualWidth, height);
                break;
            case 'yellow-single':
                const yx = ((580 - 380) / 370) * width;
                ctx.fillRect(yx - singleWidth/2, y, singleWidth, height);
                ctx.strokeRect(yx - singleWidth/2, y, singleWidth, height);
                break;
            case 'yellow-dual':
                const y1x = ((530 - 380) / 370) * width;
                const y2x = ((630 - 380) / 370) * width;
                ctx.fillRect(y1x - dualWidth/2, y, dualWidth, height);
                ctx.strokeRect(y1x - dualWidth/2, y, dualWidth, height);
                ctx.fillRect(y2x - dualWidth/2, y, dualWidth, height);
                ctx.strokeRect(y2x - dualWidth/2, y, dualWidth, height);
                break;
            case 'cyan':
                const cx = ((490 - 380) / 370) * width;
                ctx.fillRect(cx - singleWidth/2, y, singleWidth, height);
                ctx.strokeRect(cx - singleWidth/2, y, singleWidth, height);
                break;
            case 'magenta':
                const m1x = ((450 - 380) / 370) * width;
                const m2x = ((650 - 380) / 370) * width;
                ctx.fillRect(m1x - dualWidth/2, y, dualWidth, height);
                ctx.strokeRect(m1x - dualWidth/2, y, dualWidth, height);
                ctx.fillRect(m2x - dualWidth/2, y, dualWidth, height);
                ctx.strokeRect(m2x - dualWidth/2, y, dualWidth, height);
                break;
            case 'green-narrow':
                const g1x = ((520 - 380) / 370) * width;
                const g2x = ((560 - 380) / 370) * width;
                ctx.fillRect(g1x, y, g2x - g1x, height);
                ctx.strokeRect(g1x, y, g2x - g1x, height);
                break;
        }
    }
    
    flashSpectrumRange(minX, maxX) {
        if (!this.spectrumCtx) return;
        
        const ctx = this.spectrumCtx;
        let opacity = 1;
        const flash = () => {
            if (opacity <= 0) return;
            
            // Temporarily draw flash overlay
            this.renderSpectrumCanvas();
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.fillRect(minX, 0, maxX - minX, 150);
            
            opacity -= 0.1;
            if (opacity > 0) {
                requestAnimationFrame(flash);
            } else {
                this.renderSpectrumCanvas();
            }
        };
        flash();
    }
    
    getCurrentSpectrumRanges(mode) {
        // Convert a spectrum mode to custom ranges
        switch(mode) {
            case 'white':
                return [{min: 380, max: 750, weight: 1.0}];
            case 'purple-single':
                return [{min: 415, max: 425, weight: 1.0}];
            case 'purple-dual':
                return [
                    {min: 415, max: 425, weight: 1.0},
                    {min: 645, max: 655, weight: 1.0}
                ];
            case 'red-violet':
                return [
                    {min: 395, max: 405, weight: 1.0},
                    {min: 695, max: 705, weight: 1.0}
                ];
            case 'yellow-single':
                return [{min: 575, max: 585, weight: 1.0}];
            case 'yellow-dual':
                return [
                    {min: 525, max: 535, weight: 1.0},
                    {min: 625, max: 635, weight: 1.0}
                ];
            case 'cyan':
                return [{min: 485, max: 495, weight: 1.0}];
            case 'magenta':
                return [
                    {min: 445, max: 455, weight: 1.0},
                    {min: 645, max: 655, weight: 1.0}
                ];
            case 'green-narrow':
                return [{min: 520, max: 560, weight: 1.0}];
            default:
                return [];
        }
    }
    
    clearCustomSpectrum() {
        this.customSpectrum = [];
        this.renderSpectrumCanvas();
    }
    
    togglePause() {
        this.paused = !this.paused;
    }
    
    toggleTrails() {
        this.showTrails = !this.showTrails;
    }
    
    resetSensor() {
        const width = this.sensorData.length;
        const height = this.sensorData[0].length;
        
        // Clear all sensor data
        this.sensorData = new Array(width).fill(0).map(() => 
            new Array(height).fill(0).map(() => ({r: 0, g: 0, b: 0}))
        );
        
        // Clear the entire canvas to black (prevents black rectangle artifacts)
        this.sensorCtx.fillStyle = '#000';
        this.sensorCtx.fillRect(0, 0, this.sensorCanvas.width, this.sensorCanvas.height);
        
        // Clear multi-sensor data
        for (let sensor of this.multiSensors) {
            if (sensor.data) {
                sensor.data = sensor.data.map(() => ({r: 0, g: 0, b: 0}));
            }
        }
    }
    
    addMirror() {
        const mirror = new OpticalObject('mirror', [
            new Vector2(200, 100),
            new Vector2(250, 150)
        ], 'mirror');
        this.objects.push(mirror);
    }
    
    addLens() {
        // Simple circular lens approximation with polygon
        const center = new Vector2(600, 300);
        const radius = 50;
        const vertices = [];
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            vertices.push(new Vector2(
                center.x + Math.cos(angle) * radius,
                center.y + Math.sin(angle) * radius
            ));
        }
        this.objects.push(new OpticalObject('lens', vertices, 'glass'));
    }
    
    // Add circular lens with configurable parameters
    addCircularLens(radius, faces, material, rotation = 0) {
        const center = new Vector2(600, 300);
        const vertices = [];
        for (let i = 0; i < faces; i++) {
            const angle = (i / faces) * Math.PI * 2 + (rotation * Math.PI / 180);
            vertices.push(new Vector2(
                center.x + Math.cos(angle) * radius,
                center.y + Math.sin(angle) * radius
            ));
        }
        this.objects.push(new OpticalObject('lens', vertices, material));
    }
    
    // Add convex lens (two curved surfaces bulging outward)
    addConvexLens(radius, thickness, curvature, material, isParabolic = false, rotation = 0) {
        const center = new Vector2(600, 300);
        const vertices = [];
        const segments = 24;
        const halfThickness = thickness / 2;
        
        // Calculate curve depth based on curvature
        const curveDepth = radius * curvature;
        
        // Right curve (top to bottom)
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const y = center.y - radius + t * 2 * radius;
            const normalizedY = (y - center.y) / radius; // -1 to 1
            
            let xOffset;
            if (isParabolic) {
                // Parabolic profile: x = a * y^2
                xOffset = curveDepth * (1 - normalizedY * normalizedY);
            } else {
                // Spherical profile: circular arc
                xOffset = curveDepth * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
            }
            vertices.push(new Vector2(center.x + halfThickness + xOffset, y));
        }
        
        // Left curve (bottom to top)
        for (let i = segments; i >= 0; i--) {
            const t = i / segments;
            const y = center.y - radius + t * 2 * radius;
            const normalizedY = (y - center.y) / radius;
            
            let xOffset;
            if (isParabolic) {
                xOffset = curveDepth * (1 - normalizedY * normalizedY);
            } else {
                xOffset = curveDepth * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
            }
            vertices.push(new Vector2(center.x - halfThickness - xOffset, y));
        }
        
        // Apply rotation
        if (rotation !== 0) {
            const cos = Math.cos(rotation * Math.PI / 180);
            const sin = Math.sin(rotation * Math.PI / 180);
            for (let v of vertices) {
                const dx = v.x - center.x;
                const dy = v.y - center.y;
                v.x = center.x + dx * cos - dy * sin;
                v.y = center.y + dx * sin + dy * cos;
            }
        }
        
        this.objects.push(new OpticalObject('convex-lens', vertices, material));
    }
    
    // Add concave lens (two curved surfaces curving inward)
    addConcaveLens(radius, thickness, curvature, material, isParabolic = false, rotation = 0) {
        const center = new Vector2(600, 300);
        const vertices = [];
        const segments = 24;
        const halfThickness = thickness / 2;
        const curveDepth = radius * curvature * 0.5;
        
        // Right curve (top to bottom) - curves INWARD
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const y = center.y - radius + t * 2 * radius;
            const normalizedY = (y - center.y) / radius;
            
            let xOffset;
            if (isParabolic) {
                xOffset = curveDepth * (1 - normalizedY * normalizedY);
            } else {
                xOffset = curveDepth * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
            }
            // Inward curve: subtract offset instead of add
            vertices.push(new Vector2(center.x + halfThickness + curveDepth - xOffset, y));
        }
        
        // Left curve (bottom to top) - curves INWARD
        for (let i = segments; i >= 0; i--) {
            const t = i / segments;
            const y = center.y - radius + t * 2 * radius;
            const normalizedY = (y - center.y) / radius;
            
            let xOffset;
            if (isParabolic) {
                xOffset = curveDepth * (1 - normalizedY * normalizedY);
            } else {
                xOffset = curveDepth * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
            }
            vertices.push(new Vector2(center.x - halfThickness - curveDepth + xOffset, y));
        }
        
        // Apply rotation
        if (rotation !== 0) {
            const cos = Math.cos(rotation * Math.PI / 180);
            const sin = Math.sin(rotation * Math.PI / 180);
            for (let v of vertices) {
                const dx = v.x - center.x;
                const dy = v.y - center.y;
                v.x = center.x + dx * cos - dy * sin;
                v.y = center.y + dx * sin + dy * cos;
            }
        }
        
        this.objects.push(new OpticalObject('concave-lens', vertices, material));
    }
    
    // Add perfect focusing lens optimized for specific wavelength
    addPerfectLens(radius, thickness, material, wavelength, rotation = 0, isConvex = true) {
        const center = new Vector2(600, 300);
        const vertices = [];
        const segments = 32;
        const halfThickness = thickness / 2;
        
        // Get IOR for this material and wavelength
        const tempObj = new OpticalObject('temp', [], material);
        const n = tempObj.getRefractiveIndex(material, wavelength);
        
        // For a perfect plano-convex lens focusing parallel rays:
        // The surface should be a hyperbola, not a sphere
        // For simplicity, we use an optimized aspherical profile
        // Conic constant k = -n^2 makes the surface aplanatic
        const k = -(n * n);
        const R = radius * 0.8; // Base radius of curvature
        
        // Right surface (aspherical, optimized)
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const y = center.y - radius + t * 2 * radius;
            const normalizedY = (y - center.y) / radius;
            const y2 = normalizedY * normalizedY;
            
            // Aspherical surface: z = (r²/R) / (1 + sqrt(1 - (1+k)(r/R)²))
            // Simplified for our 2D case
            const rSq = y2;
            const denom = 1 + Math.sqrt(Math.max(0.01, 1 - (1 + k) * rSq));
            const xOffset = (rSq * radius) / denom * 0.5;
            
            vertices.push(new Vector2(center.x + halfThickness + xOffset, y));
        }
        
        // Left surface (flat for plano-convex, or symmetric)
        for (let i = segments; i >= 0; i--) {
            const t = i / segments;
            const y = center.y - radius + t * 2 * radius;
            vertices.push(new Vector2(center.x - halfThickness, y));
        }
        
        // Apply rotation
        if (rotation !== 0) {
            const cos = Math.cos(rotation * Math.PI / 180);
            const sin = Math.sin(rotation * Math.PI / 180);
            for (let v of vertices) {
                const dx = v.x - center.x;
                const dy = v.y - center.y;
                v.x = center.x + dx * cos - dy * sin;
                v.y = center.y + dx * sin + dy * cos;
            }
        }
        
        const lens = new OpticalObject('perfect-lens', vertices, material);
        lens.optimizedWavelength = wavelength;
        this.objects.push(lens);
    }
    
    // Add perfect concave lens (diverging, optimized for wavelength)
    addPerfectConcaveLens(radius, thickness, material, wavelength, rotation = 0) {
        const center = new Vector2(600, 300);
        const vertices = [];
        const segments = 32;
        const halfThickness = thickness / 2;
        
        const tempObj = new OpticalObject('temp', [], material);
        const n = tempObj.getRefractiveIndex(material, wavelength);
        const k = -(n * n);
        
        // Right surface (concave - curves inward)
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const y = center.y - radius + t * 2 * radius;
            const normalizedY = (y - center.y) / radius;
            const y2 = normalizedY * normalizedY;
            
            const rSq = y2;
            const denom = 1 + Math.sqrt(Math.max(0.01, 1 - (1 + k) * rSq));
            const xOffset = (rSq * radius) / denom * 0.3;
            
            vertices.push(new Vector2(center.x + halfThickness - xOffset, y));
        }
        
        // Left surface (concave - curves inward)
        for (let i = segments; i >= 0; i--) {
            const t = i / segments;
            const y = center.y - radius + t * 2 * radius;
            const normalizedY = (y - center.y) / radius;
            const y2 = normalizedY * normalizedY;
            
            const rSq = y2;
            const denom = 1 + Math.sqrt(Math.max(0.01, 1 - (1 + k) * rSq));
            const xOffset = (rSq * radius) / denom * 0.3;
            
            vertices.push(new Vector2(center.x - halfThickness + xOffset, y));
        }
        
        // Apply rotation
        if (rotation !== 0) {
            const cos = Math.cos(rotation * Math.PI / 180);
            const sin = Math.sin(rotation * Math.PI / 180);
            for (let v of vertices) {
                const dx = v.x - center.x;
                const dy = v.y - center.y;
                v.x = center.x + dx * cos - dy * sin;
                v.y = center.y + dx * sin + dy * cos;
            }
        }
        
        const lens = new OpticalObject('perfect-concave-lens', vertices, material);
        lens.optimizedWavelength = wavelength;
        this.objects.push(lens);
    }
    
    clearObjects() {
        this.objects = [];
        this.setupDefaultScene();
        this.reset();
    }
    
    changeScene(scene) {
        this.currentScene = scene;
        // Reset multi-sensor mode first
        this.multiSensorMode = false;
        this.setupDefaultScene(scene);
        this.reset();
    }
}

// Initialize simulation when page loads
let simulation;
window.addEventListener('load', () => {
    const canvas = document.getElementById('canvas');
    simulation = new OpticsSimulation(canvas);
    
    // Setup lens modal slider listeners
    const radiusSlider = document.getElementById('lensRadius');
    const facesSlider = document.getElementById('lensFaces');
    const curvatureSlider = document.getElementById('lensCurvature');
    const thicknessSlider = document.getElementById('lensThickness');
    const wavelengthSlider = document.getElementById('lensWavelength');
    
    if (radiusSlider) {
        radiusSlider.addEventListener('input', (e) => {
            document.getElementById('radiusValue').textContent = e.target.value;
        });
    }
    if (facesSlider) {
        facesSlider.addEventListener('input', (e) => {
            document.getElementById('facesValue').textContent = e.target.value;
        });
    }
    if (curvatureSlider) {
        curvatureSlider.addEventListener('input', (e) => {
            document.getElementById('curvatureValue').textContent = e.target.value;
        });
    }
    if (thicknessSlider) {
        thicknessSlider.addEventListener('input', (e) => {
            document.getElementById('thicknessValue').textContent = e.target.value;
        });
    }
    if (wavelengthSlider) {
        wavelengthSlider.addEventListener('input', (e) => {
            document.getElementById('wavelengthValue').textContent = e.target.value;
            updateLensPreview();
        });
    }
    
    const rotationSlider = document.getElementById('lensRotation');
    if (rotationSlider) {
        rotationSlider.addEventListener('input', (e) => {
            document.getElementById('rotationValue').textContent = e.target.value;
            updateLensPreview();
        });
    }
    
    // Add preview update listeners to all sliders
    ['lensRadius', 'lensFaces', 'lensCurvature', 'lensThickness', 'lensType', 'lensMaterial'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateLensPreview);
            el.addEventListener('change', updateLensPreview);
        }
    });
});

// Lens preview state
let lensPreviewVertices = null;

// Lens Modal Functions
function showLensModal() {
    const modal = document.getElementById('lensModal');
    modal.style.display = 'flex';
    updateLensOptions();
    updateLensPreview();
}

function hideLensModal() {
    document.getElementById('lensModal').style.display = 'none';
    lensPreviewVertices = null;
}

function updateLensOptions() {
    const lensType = document.getElementById('lensType').value;
    const explanation = document.getElementById('lensExplanation');
    const materialSection = document.getElementById('materialSection');
    const facesSection = document.getElementById('facesSection');
    const curvatureSection = document.getElementById('curvatureSection');
    const thicknessSection = document.getElementById('thicknessSection');
    const wavelengthSection = document.getElementById('wavelengthSection');
    const perfectLensExplanation = document.getElementById('perfectLensExplanation');
    
    // Hide all optional sections first
    facesSection.style.display = 'none';
    curvatureSection.style.display = 'none';
    thicknessSection.style.display = 'none';
    wavelengthSection.style.display = 'none';
    perfectLensExplanation.style.display = 'none';
    materialSection.style.display = 'block';
    
    switch (lensType) {
        case 'circular':
            explanation.innerHTML = 'A circular lens approximated by a polygon. More faces = smoother circle. With 3 faces you get a triangle (prism), 4 = square, etc.';
            facesSection.style.display = 'block';
            break;
        case 'convex-spherical':
            explanation.innerHTML = '<strong>Convex lens with spherical surfaces.</strong> Both sides curve outward. Spherical surfaces are easy to manufacture but suffer from <em>spherical aberration</em>—rays hitting the edge focus at a different point than rays hitting the center.';
            curvatureSection.style.display = 'block';
            thicknessSection.style.display = 'block';
            break;
        case 'convex-parabolic':
            explanation.innerHTML = '<strong>Convex lens with parabolic (aspherical) surfaces.</strong> Designed to reduce spherical aberration. The parabolic profile focuses parallel rays more accurately than spherical surfaces.';
            curvatureSection.style.display = 'block';
            thicknessSection.style.display = 'block';
            break;
        case 'concave-spherical':
            explanation.innerHTML = '<strong>Concave lens with spherical surfaces.</strong> Both sides curve inward (diverging lens). Used in eyeglasses for nearsightedness and in optical systems to spread light.';
            curvatureSection.style.display = 'block';
            thicknessSection.style.display = 'block';
            break;
        case 'concave-parabolic':
            explanation.innerHTML = '<strong>Concave lens with parabolic surfaces.</strong> An aspherical diverging lens with reduced aberration.';
            curvatureSection.style.display = 'block';
            thicknessSection.style.display = 'block';
            break;
        case 'perfect-convex':
            explanation.innerHTML = '<strong>Optimized convex aspherical lens.</strong> The surface profile is calculated to focus light of a specific wavelength to a single point.';
            thicknessSection.style.display = 'block';
            wavelengthSection.style.display = 'block';
            perfectLensExplanation.style.display = 'block';
            break;
        case 'perfect-concave':
            explanation.innerHTML = '<strong>Optimized concave aspherical lens.</strong> A diverging lens with surface profile optimized for a specific wavelength.';
            thicknessSection.style.display = 'block';
            wavelengthSection.style.display = 'block';
            perfectLensExplanation.style.display = 'block';
            break;
    }
    
    updateLensPreview();
}

// Generate preview vertices for the current lens configuration
function getLensPreviewVertices() {
    const lensType = document.getElementById('lensType').value;
    const radius = parseInt(document.getElementById('lensRadius').value);
    const faces = parseInt(document.getElementById('lensFaces').value);
    const curvature = parseFloat(document.getElementById('lensCurvature').value);
    const thickness = parseInt(document.getElementById('lensThickness').value);
    const rotation = parseInt(document.getElementById('lensRotation').value);
    
    const center = {x: 600, y: 300};
    let vertices = [];
    
    switch (lensType) {
        case 'circular':
            for (let i = 0; i < faces; i++) {
                const angle = (i / faces) * Math.PI * 2 + (rotation * Math.PI / 180);
                vertices.push({
                    x: center.x + Math.cos(angle) * radius,
                    y: center.y + Math.sin(angle) * radius
                });
            }
            break;
        case 'convex-spherical':
        case 'convex-parabolic':
            const isParabolic = lensType === 'convex-parabolic';
            const segments = 24;
            const halfThickness = thickness / 2;
            const curveDepth = radius * curvature;
            
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const y = center.y - radius + t * 2 * radius;
                const normalizedY = (y - center.y) / radius;
                const xOffset = isParabolic 
                    ? curveDepth * (1 - normalizedY * normalizedY)
                    : curveDepth * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
                vertices.push({x: center.x + halfThickness + xOffset, y: y});
            }
            for (let i = segments; i >= 0; i--) {
                const t = i / segments;
                const y = center.y - radius + t * 2 * radius;
                const normalizedY = (y - center.y) / radius;
                const xOffset = isParabolic 
                    ? curveDepth * (1 - normalizedY * normalizedY)
                    : curveDepth * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
                vertices.push({x: center.x - halfThickness - xOffset, y: y});
            }
            break;
        case 'concave-spherical':
        case 'concave-parabolic':
            const isPara = lensType === 'concave-parabolic';
            const segs = 24;
            const halfT = thickness / 2;
            const cDepth = radius * curvature * 0.5;
            
            for (let i = 0; i <= segs; i++) {
                const t = i / segs;
                const y = center.y - radius + t * 2 * radius;
                const normalizedY = (y - center.y) / radius;
                const xOffset = isPara 
                    ? cDepth * (1 - normalizedY * normalizedY)
                    : cDepth * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
                vertices.push({x: center.x + halfT + cDepth - xOffset, y: y});
            }
            for (let i = segs; i >= 0; i--) {
                const t = i / segs;
                const y = center.y - radius + t * 2 * radius;
                const normalizedY = (y - center.y) / radius;
                const xOffset = isPara 
                    ? cDepth * (1 - normalizedY * normalizedY)
                    : cDepth * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
                vertices.push({x: center.x - halfT - cDepth + xOffset, y: y});
            }
            break;
        case 'perfect-convex':
        case 'perfect-concave':
            const pSegs = 32;
            const pHalfT = thickness / 2;
            for (let i = 0; i <= pSegs; i++) {
                const t = i / pSegs;
                const y = center.y - radius + t * 2 * radius;
                const normalizedY = (y - center.y) / radius;
                const y2 = normalizedY * normalizedY;
                const xOffset = (y2 * radius) / 2 * 0.5;
                if (lensType === 'perfect-convex') {
                    vertices.push({x: center.x + pHalfT + xOffset, y: y});
                } else {
                    vertices.push({x: center.x + pHalfT - xOffset * 0.6, y: y});
                }
            }
            for (let i = pSegs; i >= 0; i--) {
                const t = i / pSegs;
                const y = center.y - radius + t * 2 * radius;
                if (lensType === 'perfect-convex') {
                    vertices.push({x: center.x - pHalfT, y: y});
                } else {
                    const normalizedY = (y - center.y) / radius;
                    const y2 = normalizedY * normalizedY;
                    const xOffset = (y2 * radius) / 2 * 0.3;
                    vertices.push({x: center.x - pHalfT + xOffset, y: y});
                }
            }
            break;
    }
    
    // Apply rotation for non-circular types
    if (rotation !== 0 && lensType !== 'circular') {
        const cos = Math.cos(rotation * Math.PI / 180);
        const sin = Math.sin(rotation * Math.PI / 180);
        vertices = vertices.map(v => ({
            x: center.x + (v.x - center.x) * cos - (v.y - center.y) * sin,
            y: center.y + (v.x - center.x) * sin + (v.y - center.y) * cos
        }));
    }
    
    return vertices;
}

function updateLensPreview() {
    lensPreviewVertices = getLensPreviewVertices();
}

function addConfiguredLens() {
    const lensType = document.getElementById('lensType').value;
    const material = document.getElementById('lensMaterial').value;
    const radius = parseInt(document.getElementById('lensRadius').value);
    const faces = parseInt(document.getElementById('lensFaces').value);
    const curvature = parseFloat(document.getElementById('lensCurvature').value);
    const thickness = parseInt(document.getElementById('lensThickness').value);
    const wavelength = parseInt(document.getElementById('lensWavelength').value);
    const rotation = parseInt(document.getElementById('lensRotation').value);
    
    switch (lensType) {
        case 'circular':
            simulation.addCircularLens(radius, faces, material, rotation);
            break;
        case 'convex-spherical':
            simulation.addConvexLens(radius, thickness, curvature, material, false, rotation);
            break;
        case 'convex-parabolic':
            simulation.addConvexLens(radius, thickness, curvature, material, true, rotation);
            break;
        case 'concave-spherical':
            simulation.addConcaveLens(radius, thickness, curvature, material, false, rotation);
            break;
        case 'concave-parabolic':
            simulation.addConcaveLens(radius, thickness, curvature, material, true, rotation);
            break;
        case 'perfect-convex':
            simulation.addPerfectLens(radius, thickness, material, wavelength, rotation, true);
            break;
        case 'perfect-concave':
            simulation.addPerfectConcaveLens(radius, thickness, material, wavelength, rotation);
            break;
    }
    
    lensPreviewVertices = null;
    hideLensModal();
}
