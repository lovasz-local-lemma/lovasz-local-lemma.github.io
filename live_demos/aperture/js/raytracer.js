export class RayTracer {
    constructor(canvas, scene, camera) {
        this.canvas = canvas;
        this.scene = scene;
        this.camera = camera;
        
        // Settings
        this.maxBounces = 3; // Reduced from 5 for speed
        this.samplesPerPixel = 1;
        this.enableVPT = false;
        this.renderScale = 0.5; // Render at half resolution for speed
        this.visualizeFocus = false; // Highlight in-focus regions in green
        this.focusTolerance = 0; // 0 = auto (based on DOF), 1-50 = manual percentage
        
        // State
        this.needsUpdate = true;
        this.currentSample = 0;
        this.raysTraced = 0;
        
        // Setup 2D context for CPU ray tracing
        // (WebGL shader-based ray tracing would be more complex to implement fully)
        this.ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        if (!this.ctx) {
            console.error('Failed to get 2D context - canvas may have WebGL context already');
            return;
        }
        
        this.imageData = null;
        this.accumBuffer = null;
        
        this.resize();
    }
    
    resize() {
        if (!this.ctx) return;
        
        // Render at reduced resolution for performance
        this.width = Math.floor(this.canvas.width * this.renderScale);
        this.height = Math.floor(this.canvas.height * this.renderScale);
        this.camera.aspectRatio = this.width / this.height;
        this.imageData = this.ctx.createImageData(this.width, this.height);
        this.accumBuffer = new Float32Array(this.width * this.height * 4);
        this.needsUpdate = true;
    }
    
    render() {
        if (!this.ctx) return; // Can't render without 2D context
        
        if (this.needsUpdate) {
            this.currentSample = 0;
            this.accumBuffer.fill(0);
            this.needsUpdate = false;
        }
        
        // Progressive rendering
        if (this.currentSample < this.samplesPerPixel) {
            this.renderPass();
            this.currentSample++;
        }
    }
    
    renderPass() {
        const startTime = performance.now();
        let rays = 0;
        
        // Render using tiling for better cache coherency and responsiveness
        const tileSize = 16; // Smaller tiles for better responsiveness
        const tilesX = Math.ceil(this.width / tileSize);
        const tilesY = Math.ceil(this.height / tileSize);
        
        for (let ty = 0; ty < tilesY; ty++) {
            for (let tx = 0; tx < tilesX; tx++) {
                const x0 = tx * tileSize;
                const y0 = ty * tileSize;
                const x1 = Math.min(x0 + tileSize, this.width);
                const y1 = Math.min(y0 + tileSize, this.height);
                
                for (let y = y0; y < y1; y++) {
                    for (let x = x0; x < x1; x++) {
                        // Normalized coordinates with jitter
                        let u = ((x + Math.random()) / this.width) * 2 - 1;
                        let v = ((y + Math.random()) / this.height) * 2 - 1;
                        
                        // Apply lens distortion
                        if (this.camera.distortionType !== 'none' && this.camera.distortionAmount > 0) {
                            const distorted = this.applyDistortion(u, v);
                            u = distorted.u;
                            v = distorted.v;
                        }
                        
                        const ray = this.camera.generateRay(u, -v); // Flip Y
                        const result = this.traceRay(ray, 0);
                        let color = result.color;
                        
                        // Visualize focus region if enabled
                        if (this.visualizeFocus && result.distance > 0) {
                            const focusDist = this.camera.focusDistance;
                            let tolerance;
                            
                            if (this.focusTolerance === 0) {
                                // Auto: Calculate based on depth of field
                                // DOF formula: DOF ≈ (2 * N * C * s²) / f²
                                // Simplified: use aperture diameter and focus distance
                                const fstop = this.camera.apertureFStop;
                                const focalLength = this.camera.focalLength / 1000; // Convert to meters
                                const circleOfConfusion = 0.00003; // 0.03mm for 35mm film
                                
                                // Calculate DOF
                                const dof = (2 * fstop * circleOfConfusion * focusDist * focusDist) / (focalLength * focalLength);
                                
                                // Use half DOF as tolerance (distance from focus to near/far limit)
                                tolerance = Math.max(dof / 2, focusDist * 0.01); // At least 1% of focus distance
                            } else {
                                // Manual percentage
                                tolerance = focusDist * (this.focusTolerance / 100);
                            }
                            
                            const distDiff = Math.abs(result.distance - focusDist);
                            
                            if (distDiff < tolerance) {
                                // In focus - tint green
                                const greenAmount = 1.0 - (distDiff / tolerance);
                                color = [
                                    color[0] * (1 - greenAmount * 0.5) + greenAmount * 0.3,
                                    color[1] * (1 - greenAmount * 0.5) + greenAmount * 1.0,
                                    color[2] * (1 - greenAmount * 0.5) + greenAmount * 0.3
                                ];
                            }
                        }
                        
                        rays++;
                        
                        // Accumulate color
                        const idx = (y * this.width + x) * 4;
                        this.accumBuffer[idx + 0] += color[0];
                        this.accumBuffer[idx + 1] += color[1];
                        this.accumBuffer[idx + 2] += color[2];
                        this.accumBuffer[idx + 3] += 1;
                        
                        // Average and gamma correct
                        const scale = 1.0 / (this.currentSample + 1);
                        this.imageData.data[idx + 0] = Math.min(255, Math.pow(this.accumBuffer[idx + 0] * scale, 1/2.2) * 255);
                        this.imageData.data[idx + 1] = Math.min(255, Math.pow(this.accumBuffer[idx + 1] * scale, 1/2.2) * 255);
                        this.imageData.data[idx + 2] = Math.min(255, Math.pow(this.accumBuffer[idx + 2] * scale, 1/2.2) * 255);
                        this.imageData.data[idx + 3] = 255;
                    }
                }
            }
        }
        
        // Draw low-res image scaled up to canvas
        if (this.renderScale < 1) {
            // Create temporary canvas for low-res render
            if (!this.tempCanvas) {
                this.tempCanvas = document.createElement('canvas');
                this.tempCtx = this.tempCanvas.getContext('2d');
            }
            this.tempCanvas.width = this.width;
            this.tempCanvas.height = this.height;
            this.tempCtx.putImageData(this.imageData, 0, 0);
            
            // Scale up to full canvas size with smooth interpolation
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'low'; // 'low' is faster
            this.ctx.drawImage(this.tempCanvas, 0, 0, this.width, this.height, 
                                                0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.putImageData(this.imageData, 0, 0);
        }
        this.raysTraced = rays;
    }
    
    traceRay(ray, depth) {
        if (depth >= this.maxBounces) {
            return { color: [0, 0, 0], distance: -1 };
        }
        
        // Check for volume scattering
        let volumeHit = null;
        let surfaceHit = this.scene.intersect(ray);
        
        if (this.enableVPT && this.scene.fogDensity > 0) {
            const maxT = surfaceHit ? surfaceHit.t : 1000;
            volumeHit = this.scene.sampleVolume(ray, maxT);
        }
        
        // Volume scattering takes precedence if it's closer
        if (volumeHit && volumeHit.t < (surfaceHit ? surfaceHit.t : Infinity)) {
            return { color: this.handleVolumeScattering(ray, volumeHit, depth), distance: volumeHit.t };
        }
        
        // Surface intersection
        if (surfaceHit) {
            return { color: this.shade(ray, surfaceHit, depth), distance: surfaceHit.t };
        }
        
        // Sky
        return { color: this.scene.getSkyColor(ray.direction), distance: -1 };
    }
    
    handleVolumeScattering(ray, hit, depth) {
        // Simple isotropic scattering in participating media
        const scatterDir = this.randomUnitVector();
        const scatteredRay = {
            origin: hit.point,
            direction: scatterDir
        };
        
        const result = this.traceRay(scatteredRay, depth + 1);
        return this.multiply(result.color, this.scene.fogColor);
    }
    
    shade(ray, hit, depth) {
        const material = hit.material;
        
        // Emissive materials return their emission directly
        if (material.type === 'emissive') {
            return material.emission || [1, 1, 1];
        }
        
        if (material.type === 'diffuse') {
            return this.shadeDiffuse(ray, hit, depth);
        } else if (material.type === 'metal') {
            return this.shadeMetal(ray, hit, depth);
        } else if (material.type === 'glass') {
            return this.shadeGlass(ray, hit, depth);
        } else if (material.type === 'mirror') {
            return this.shadeMirror(ray, hit, depth);
        }
        
        return [1, 0, 1]; // Magenta for unknown material
    }
    
    shadeDiffuse(ray, hit, depth) {
        // Lambertian BRDF
        const scatterDir = this.normalize(this.add(hit.normal, this.randomUnitVector()));
        const scattered = {
            origin: hit.point,
            direction: scatterDir
        };
        
        const result = this.traceRay(scattered, depth + 1);
        return this.multiply(result.color, hit.material.albedo);
    }
    
    shadeMetal(ray, hit, depth) {
        const reflected = this.reflect(ray.direction, hit.normal);
        const roughness = hit.material.roughness || 0.0;
        
        // Add roughness by perturbing reflection
        const scatterDir = this.normalize(this.add(reflected, this.scale(this.randomUnitVector(), roughness)));
        
        if (this.dot(scatterDir, hit.normal) > 0) {
            const scattered = {
                origin: hit.point,
                direction: scatterDir
            };
            
            const result = this.traceRay(scattered, depth + 1);
            return this.multiply(result.color, hit.material.albedo);
        }
        
        return [0, 0, 0];
    }
    
    shadeGlass(ray, hit, depth) {
        const ior = hit.material.ior || 1.5;
        const entering = this.dot(ray.direction, hit.normal) < 0;
        const normal = entering ? hit.normal : this.scale(hit.normal, -1);
        const eta = entering ? 1.0 / ior : ior;
        
        const refracted = this.refract(ray.direction, normal, eta);
        
        if (refracted) {
            // Schlick's approximation for Fresnel
            const r0 = Math.pow((1 - ior) / (1 + ior), 2);
            const cosine = -this.dot(ray.direction, normal);
            const reflectProb = r0 + (1 - r0) * Math.pow(1 - cosine, 5);
            
            if (Math.random() < reflectProb) {
                // Reflect
                const reflected = this.reflect(ray.direction, normal);
                const scattered = { origin: hit.point, direction: reflected };
                return this.traceRay(scattered, depth + 1).color;
            } else {
                // Refract
                const scattered = { origin: hit.point, direction: refracted };
                return this.traceRay(scattered, depth + 1).color;
            }
        } else {
            // Total internal reflection
            const reflected = this.reflect(ray.direction, normal);
            const scattered = { origin: hit.point, direction: reflected };
            return this.traceRay(scattered, depth + 1).color;
        }
    }
    
    shadeMirror(ray, hit, depth) {
        const reflected = this.reflect(ray.direction, hit.normal);
        const scattered = {
            origin: hit.point,
            direction: reflected
        };
        
        return this.traceRay(scattered, depth + 1).color;
    }
    
    reflect(v, n) {
        return this.subtract(v, this.scale(n, 2 * this.dot(v, n)));
    }
    
    refract(v, n, eta) {
        const cosI = -this.dot(v, n);
        const sin2T = eta * eta * (1 - cosI * cosI);
        
        if (sin2T > 1) return null; // Total internal reflection
        
        const cosT = Math.sqrt(1 - sin2T);
        return this.normalize(this.add(this.scale(v, eta), this.scale(n, eta * cosI - cosT)));
    }
    
    randomUnitVector() {
        // Random point on unit sphere
        const z = Math.random() * 2 - 1;
        const a = Math.random() * 2 * Math.PI;
        const r = Math.sqrt(1 - z * z);
        return [r * Math.cos(a), r * Math.sin(a), z];
    }
    
    applyDistortion(u, v) {
        // Apply lens distortion (post-process effect on image coordinates)
        const type = this.camera.distortionType;
        const amount = this.camera.distortionAmount;
        
        // Distance from center
        const r = Math.sqrt(u * u + v * v);
        
        if (type === 'barrel') {
            // Barrel distortion (wide angle lens)
            // r' = r * (1 + k * r^2)
            const k = amount * 0.5;
            const rDistorted = r * (1 + k * r * r);
            const scale = rDistorted / (r + 0.0001);
            return { u: u * scale, v: v * scale };
            
        } else if (type === 'pincushion') {
            // Pincushion distortion (telephoto lens)
            // r' = r * (1 - k * r^2)
            const k = amount * 0.3;
            const rDistorted = r * (1 - k * r * r);
            const scale = rDistorted / (r + 0.0001);
            return { u: u * scale, v: v * scale };
            
        } else if (type === 'fisheye') {
            // Fisheye distortion (extreme wide angle)
            // Map to hemispherical projection
            const theta = r * Math.PI / 2 * (1 + amount * 0.5); // Increase FOV with amount
            const rFisheye = Math.sin(theta);
            const scale = rFisheye / (r + 0.0001);
            return { u: u * scale, v: v * scale };
        }
        
        return { u, v };
    }
    
    // Vector math utilities
    add(a, b) {
        return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    }
    
    subtract(a, b) {
        return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }
    
    multiply(a, b) {
        return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
    }
    
    scale(v, s) {
        return [v[0] * s, v[1] * s, v[2] * s];
    }
    
    dot(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }
    
    length(v) {
        return Math.sqrt(this.dot(v, v));
    }
    
    normalize(v) {
        const len = this.length(v);
        return len > 0 ? this.scale(v, 1 / len) : v;
    }
}
