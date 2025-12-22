export class CameraVisualizer {
    constructor(canvas, camera, scene) {
        this.canvas = canvas;
        this.camera = camera;
        this.scene = scene;
        this.ctx = canvas.getContext('2d');
        
        // Visualization settings
        this.showRays = true;
        this.showComponents = true;
        this.showScene = true;
        this.rayCount = 20; // Reduced for performance
        this.needsUpdate = true;
        
        // View settings - zoom in to show optical components clearly
        this.scale = 2000; // pixels per meter (very zoomed to show cm-scale optics)
        this.viewRangeZ = 0.2; // Show 20cm range (film + aperture area)
        this.offsetX = 0;
        this.offsetY = 0;
        
        // Aperture shape preview size (top-down view)
        this.aperturePreviewSize = 60;
        
        this.resize();
    }
    
    resize() {
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        // Calculate film position to center the view
        const filmPos = Math.abs(this.camera.getFilmPosition());
        
        // Position so film is visible on left, aperture in middle
        this.offsetX = this.width * 0.3; // 30% from left
        this.offsetY = this.height / 2;
        this.needsUpdate = true;
    }
    
    render() {
        if (!this.needsUpdate) return;
        
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Calculate split view dimensions
        const mainViewWidth = this.width * 5 / 6; // 5/6 of width for main view
        const zoomViewWidth = this.width / 6;     // 1/6 of width for zoomed view
        
        // === MAIN VIEW (left, 5/6 width) ===
        this.ctx.save();
        this.ctx.rect(0, 0, mainViewWidth, this.height);
        this.ctx.clip();
        
        // Set up coordinate system (side view: Z axis horizontal, Y axis vertical)
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        
        // Draw grid
        this.drawGrid();
        
        // Draw optical axis
        this.drawAxis();
        
        // Draw scene objects
        if (this.showScene && this.scene) {
            this.drawSceneObjects();
        }
        
        // Draw camera components (side view - as lines)
        if (this.showComponents) {
            this.drawFilmSideView();
            this.drawApertureSideView();
        }
        
        // Draw sample rays showing FOV
        if (this.showRays) {
            this.drawFOVCone();
        }
        
        // Draw labels
        this.drawLabels();
        
        this.ctx.restore();
        this.ctx.restore();
        
        // === ZOOMED VIEW (right, 1/6 width) ===
        this.ctx.save();
        this.ctx.translate(mainViewWidth, 0);
        this.ctx.rect(0, 0, zoomViewWidth, this.height);
        this.ctx.clip();
        
        this.drawZoomedFocalView(zoomViewWidth, this.height);
        
        this.ctx.restore();
        
        // Draw divider line
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(mainViewWidth, 0);
        this.ctx.lineTo(mainViewWidth, this.height);
        this.ctx.stroke();
        
        // Draw shape previews (top-down views in corners) - no transform
        this.drawFilmShapePreview();
        this.drawApertureShapePreview();
        
        this.needsUpdate = false;
    }
    
    drawGrid() {
        this.ctx.strokeStyle = '#222';
        this.ctx.lineWidth = 0.5;
        
        // Zoomed view: Film (left) → Aperture (center) → Focus plane indicator (right)
        // Z: -0.1m (film) → 0m (aperture) → +0.1m (small range)
        
        // Vertical lines (every 1cm = 0.01m)
        for (let z = -0.15; z <= 0.15; z += 0.01) {
            const x = z * this.scale;
            this.ctx.beginPath();
            this.ctx.moveTo(x, -this.height / 2);
            this.ctx.lineTo(x, this.height / 2);
            this.ctx.stroke();
        }
        
        // Horizontal lines (every 1cm)
        for (let y = -0.05; y <= 0.05; y += 0.01) {
            const screenY = -y * this.scale; // Flip Y
            this.ctx.beginPath();
            this.ctx.moveTo(-0.15 * this.scale, screenY);
            this.ctx.lineTo(0.15 * this.scale, screenY);
            this.ctx.stroke();
        }
    }
    
    drawAxis() {
        // Draw optical axis (Z-axis) - horizontal line
        this.ctx.strokeStyle = '#555';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        
        this.ctx.beginPath();
        this.ctx.moveTo(-0.15 * this.scale, 0);
        this.ctx.lineTo(0.15 * this.scale, 0);
        this.ctx.stroke();
        
        this.ctx.setLineDash([]);
        
        // Draw arrow showing light direction
        const arrowX = 0.12 * this.scale;
        this.ctx.fillStyle = '#666';
        this.ctx.beginPath();
        this.ctx.moveTo(arrowX, 0);
        this.ctx.lineTo(arrowX - 10, -5);
        this.ctx.lineTo(arrowX - 10, 5);
        this.ctx.fill();
        
        this.ctx.font = '10px monospace';
        this.ctx.fillText('→ Light', arrowX + 5, -5);
    }
    
    drawSceneObjects() {
        if (!this.scene || !this.scene.spheres) return;
        
        // Draw spheres in the scene
        for (const sphere of this.scene.spheres) {
            const z = sphere.center[2] * this.scale;
            const y = -sphere.center[1] * this.scale; // Flip Y for canvas
            const r = sphere.radius * this.scale;
            
            // Determine color based on material type
            let color = '#888';
            let strokeColor = '#aaa';
            let lineWidth = 1;
            
            if (sphere.material) {
                if (sphere.material.type === 'glossy' && sphere.material.texture === 'fbm') {
                    // Gold sphere with cracks - MAIN SPHERE
                    color = 'rgba(255, 215, 0, 0.3)'; // Gold
                    strokeColor = '#FFD700';
                    lineWidth = 3;
                } else if (sphere.material.type === 'glass') {
                    color = 'rgba(150, 200, 255, 0.2)';
                    strokeColor = '#88ccff';
                } else if (sphere.material.type === 'mirror') {
                    color = 'rgba(200, 200, 200, 0.3)';
                    strokeColor = '#cccccc';
                } else if (sphere.material.type === 'emissive') {
                    // Light source - skip or make subtle
                    continue; // Skip lights for clarity
                } else {
                    // Default diffuse
                    if (sphere.material.albedo) {
                        const [rr, gg, bb] = sphere.material.albedo;
                        color = `rgba(${rr*255}, ${gg*255}, ${bb*255}, 0.2)`;
                        strokeColor = `rgb(${rr*200}, ${gg*200}, ${bb*200})`;
                    }
                }
            }
            
            // Draw sphere as circle (side view)
            this.ctx.fillStyle = color;
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = lineWidth;
            
            this.ctx.beginPath();
            this.ctx.arc(z, y, r, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            
            // Draw center point for reference
            this.ctx.fillStyle = strokeColor;
            this.ctx.beginPath();
            this.ctx.arc(z, y, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
    
    drawFocusPlane() {
        const focusDist = this.camera.focusDistance;
        const x = focusDist * this.scale;
        
        // Draw focus plane
        this.ctx.strokeStyle = '#2ecc71';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([10, 5]);
        
        this.ctx.beginPath();
        this.ctx.moveTo(x, -this.height / 2);
        this.ctx.lineTo(x, this.height / 2);
        this.ctx.stroke();
        
        this.ctx.setLineDash([]);
        
        // Label
        this.ctx.fillStyle = '#2ecc71';
        this.ctx.font = 'bold 12px monospace';
        this.ctx.fillText(`Focus: ${focusDist.toFixed(1)}m`, x + 5, -this.height / 2 + 20);
    }
    
    drawSceneObjects() {
        // Get scene from camera visualizer's parent app
        // For now, draw placeholder spheres to show scale
        const objects = [
            { pos: [0, 0, 3], r: 0.5, color: '#e74c3c' },      // Near
            { pos: [0, 0, 5], r: 1.0, color: '#3498db' },      // Middle (focus)
            { pos: [-1, 0, 7], r: 0.8, color: '#f39c12' },     // Far
            { pos: [0, 0.5, 9], r: 0.5, color: '#2ecc71' },    // Very far
            { pos: [3, 2, 12], r: 0.04, color: '#f1c40f' },    // Light source
        ];
        
        for (const obj of objects) {
            const z = obj.pos[2] * this.scale;
            const y = -obj.pos[1] * this.scale; // Flip Y
            const r = obj.r * this.scale;
            
            // Draw sphere as circle (side view)
            this.ctx.fillStyle = obj.color + '40'; // Semi-transparent
            this.ctx.strokeStyle = obj.color;
            this.ctx.lineWidth = 2;
            
            this.ctx.beginPath();
            this.ctx.arc(z, y, r, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            
            // Draw ground line if needed
            if (obj.pos[1] < 0) {
                this.ctx.strokeStyle = obj.color + '40';
                this.ctx.lineWidth = 1;
                this.ctx.setLineDash([2, 2]);
                this.ctx.beginPath();
                this.ctx.moveTo(z, y + r);
                this.ctx.lineTo(z, 0);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }
        }
    }
    
    drawFilmSideView() {
        const filmPos = this.camera.getFilmPosition();
        const filmTransform = this.camera.getFilmTransform();
        
        // Calculate film dimensions from diagonal (filmSize in mm)
        const filmDiagonal = this.camera.filmSize / 1000; // Convert to meters
        const aspectRatio = this.camera.aspectRatio;
        const filmHeight = filmDiagonal / Math.sqrt(1 + aspectRatio * aspectRatio);
        const filmWidth = filmHeight * aspectRatio;
        
        // Physical world: film is BEHIND aperture (negative Z in camera space)
        // Side view: X (horizontal) = Z position, Y (vertical) = Y position
        const z = -Math.abs(filmPos) * this.scale;
        const y = this.camera.filmShiftY * this.scale; // Up/down shift
        const h = filmHeight * this.scale;
        const w = filmWidth * this.scale * 0.3; // Depth for 3D effect
        
        // Calculate tilt angle for display
        const tiltAngle = filmTransform.tiltX; // Using X tilt for side view
        
        // Draw film rectangle with tilt and shift
        this.ctx.save();
        this.ctx.translate(z, -y); // Negative Y because canvas Y increases downward
        this.ctx.rotate(tiltAngle);
        
        // Film surface (main line) - curved if filmCurvature > 0
        this.ctx.strokeStyle = '#3498db';
        this.ctx.lineWidth = 4;
        
        this.ctx.beginPath();
        if (this.camera.filmCurvature > 0) {
            // Draw curved film (arc)
            const curvature = this.camera.filmCurvature * 0.02;
            const radius = h / 2;
            const arcLength = this.camera.filmCurvature * radius * 0.5;
            
            // Draw as quadratic curve
            this.ctx.moveTo(0, -h / 2);
            this.ctx.quadraticCurveTo(-arcLength, 0, 0, h / 2);
        } else {
            // Flat film
            this.ctx.moveTo(0, -h / 2);
            this.ctx.lineTo(0, h / 2);
        }
        this.ctx.stroke();
        
        // Film holder/frame with depth
        this.ctx.strokeStyle = '#2980b9';
        this.ctx.lineWidth = 2;
        this.ctx.fillStyle = 'rgba(52, 152, 219, 0.2)';
        
        // Draw 3D frame
        const frameWidth = w;
        this.ctx.fillRect(-frameWidth/2, -h/2, frameWidth, h);
        this.ctx.strokeRect(-frameWidth/2, -h/2, frameWidth, h);
        
        // Draw side edges for 3D effect
        this.ctx.strokeStyle = '#1a5c8a';
        this.ctx.lineWidth = 1;
        
        // Top edge
        this.ctx.beginPath();
        this.ctx.moveTo(-frameWidth/2, -h/2);
        this.ctx.lineTo(frameWidth/2, -h/2);
        this.ctx.stroke();
        
        // Bottom edge
        this.ctx.beginPath();
        this.ctx.moveTo(-frameWidth/2, h/2);
        this.ctx.lineTo(frameWidth/2, h/2);
        this.ctx.stroke();
        
        // Draw film size indicator
        this.ctx.fillStyle = '#2ecc71';
        this.ctx.font = '9px monospace';
        const widthMM = (filmWidth * 1000).toFixed(1);
        const heightMM = (filmHeight * 1000).toFixed(1);
        this.ctx.fillText(`${heightMM}x${widthMM}mm`, -frameWidth/2 + 2, 0);
        
        this.ctx.restore();
        
        // Label with tilt
        this.ctx.fillStyle = '#3498db';
        this.ctx.font = '11px monospace';
        const tiltDeg = tiltAngle * 180 / Math.PI;
        const tiltLabel = Math.abs(tiltDeg) > 0.5 ? ` (∠${tiltDeg.toFixed(1)}°)` : '';
        this.ctx.fillText(`Film${tiltLabel}`, z + 10, -y - h / 2 - 5);
    }
    
    drawApertureSideView() {
        const apertureRadius = this.camera.getApertureRadius();
        const apertureTilt = this.camera.apertureTiltX * Math.PI / 180;
        
        // Side view shows: X (horizontal) = Z position, Y (vertical) = Y position
        const z = this.camera.apertureShiftZ * this.scale; // Forward/back
        const y = this.camera.apertureShiftY * this.scale; // Up/down (visible in side view!)
        
        // Scale down aperture for visualization (f/0.8 should look ~= sensor size)
        // Physical aperture is too large, scale by 0.15 for reasonable visualization
        const visualScale = 0.15;
        const r = apertureRadius * this.scale * visualScale;
        
        // Draw aperture with tilt and shift
        this.ctx.save();
        this.ctx.translate(z, -y); // Negative Y because canvas Y increases downward
        this.ctx.rotate(apertureTilt);
        
        // Full lens/aperture plane line (centered, reasonable length)
        this.ctx.strokeStyle = '#555';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([3, 3]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, -0.03 * this.scale);  // ±3cm (reasonable for full lens assembly)
        this.ctx.lineTo(0, 0.03 * this.scale);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // Active aperture opening (tilted)
        this.ctx.strokeStyle = '#e74c3c';
        this.ctx.lineWidth = 5;
        
        this.ctx.beginPath();
        this.ctx.moveTo(0, -r);
        this.ctx.lineTo(0, r);
        this.ctx.stroke();
        
        // Aperture blades/edges
        this.ctx.fillStyle = '#c0392b';
        this.ctx.beginPath();
        this.ctx.arc(0, -r, 3, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(0, r, 3, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore(); // Restore from translate+rotate
        
        // Label
        this.ctx.fillStyle = '#e74c3c';
        this.ctx.font = '11px monospace';
        const fstop = this.camera.apertureFStop;
        const tiltDeg = apertureTilt * 180 / Math.PI;
        const tiltLabel = Math.abs(tiltDeg) > 0.5 ? ` ∠${tiltDeg.toFixed(1)}°` : '';
        const diameterMM = (apertureRadius * 2 * 1000).toFixed(1);
        this.ctx.fillText(`Aperture f/${fstop.toFixed(1)} (${diameterMM}mm)${tiltLabel}`, z + 10, -y - r - 5);
    }
    
    drawFOVCone() {
        // PHYSICALLY ACCURATE THIN LENS OPTICS
        // Light travels: Scene Point → Lens → Sensor Point
        // Thin lens equation: 1/f = 1/s + 1/s' where f=focal length, s=object dist, s'=image dist
        // Rearranging: s' = (f*s)/(s-f) where s=focus distance, s'=image distance (sensor to lens)
        
        const filmPos = this.camera.getFilmPosition();
        const focusDist = this.camera.focusDistance;
        const focalLength = this.camera.focalLength / 1000; // Convert mm to meters
        const apertureRadius = this.camera.getApertureRadius();
        
        // In the real camera: SENSOR moves based on focus distance, aperture stays fixed
        // filmPos = -di where di = (f * focusDist) / (focusDist - f)
        // This is already calculated in getFilmPosition()
        
        // Sensor position (moves with focus distance)
        const sensorPosZ = filmPos * this.scale; // filmPos is already negative
        const sensorPosY = -this.camera.filmShiftY * this.scale;
        
        // Aperture position (relatively fixed, only manual shifts)
        const lensZ = this.camera.apertureShiftZ * this.scale;
        const lensY = -this.camera.apertureShiftY * this.scale;
        
        // MUST match drawAperture() calculation exactly!
        const visualScale = 0.15;
        const lensRadius = apertureRadius * this.scale * visualScale;
        const apertureTilt = this.camera.apertureTiltX * Math.PI / 180;
        
        // Three sample points on lens (top, center, bottom)
        // In local coords (before rotation): top=(0,+r), bottom=(0,-r)
        // After rotation by angle θ around Z-axis:
        // x' = x*cos(θ) - y*sin(θ) = -r*sin(θ)  for top point
        // y' = x*sin(θ) + y*cos(θ) = r*cos(θ)   for top point
        // But we're in 2D with (z,y), so rotation is just:
        const lensTop = {
            z: lensZ - lensRadius * Math.sin(apertureTilt),  // Note: minus for correct direction
            y: lensY + lensRadius * Math.cos(apertureTilt)
        };
        const lensCenter = { z: lensZ, y: lensY };
        const lensBottom = {
            z: lensZ + lensRadius * Math.sin(apertureTilt),  // Note: plus for correct direction
            y: lensY - lensRadius * Math.cos(apertureTilt)
        };
        
        // ACTUAL SENSOR position (already calculated above)
        const sensorZ = sensorPosZ;
        const sensorY = sensorPosY;
        const filmDiagonal = this.camera.filmSize / 1000;
        const aspectRatio = this.camera.aspectRatio;
        const filmHeight = filmDiagonal / Math.sqrt(1 + aspectRatio * aspectRatio);
        const sensorHalfHeight = (filmHeight / 2) * this.scale;
        const filmTilt = this.camera.filmTiltX * Math.PI / 180;
        
        // Three points on actual sensor (accounting for tilt)
        // Use SAME rotation convention as aperture
        const sensorTop = {
            z: sensorZ - sensorHalfHeight * Math.sin(filmTilt),
            y: sensorY + sensorHalfHeight * Math.cos(filmTilt)
        };
        const sensorCenter = { z: sensorZ, y: sensorY };
        const sensorBottom = {
            z: sensorZ + sensorHalfHeight * Math.sin(filmTilt),
            y: sensorY - sensorHalfHeight * Math.cos(filmTilt)
        };
        
        // Draw actual sensor
        this.ctx.strokeStyle = '#c9c';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(sensorTop.z, sensorTop.y);
        this.ctx.lineTo(sensorBottom.z, sensorBottom.y);
        this.ctx.stroke();
        
        this.ctx.fillStyle = '#c9c';
        this.ctx.font = '10px monospace';
        this.ctx.fillText('Sensor', sensorZ - 40, sensorY - sensorHalfHeight - 5);
        
        // NEW APPROACH: Trace FROM sensor points THROUGH lens to find focal plane
        // Three sensor points with different colors
        const sensorPoints = [
            { pos: sensorTop, color: 'rgba(255, 100, 100, 0.7)' },      // Top (red)
            { pos: sensorCenter, color: 'rgba(100, 255, 100, 0.7)' },   // Center (green)
            { pos: sensorBottom, color: 'rgba(100, 100, 255, 0.7)' }    // Bottom (blue)
        ];
        
        const focalPoints = []; // Store where each sensor point focuses
        
        // For each sensor point, shoot 3 rays through lens
        for (let i = 0; i < sensorPoints.length; i++) {
            const sp = sensorPoints[i];
            
            // Ray 1: Sensor point → Lens CENTER (chief ray, undeflected)
            const chiefDirZ = lensCenter.z - sp.pos.z;
            const chiefDirY = lensCenter.y - sp.pos.y;
            const chiefLen = Math.sqrt(chiefDirZ * chiefDirZ + chiefDirY * chiefDirY);
            const chiefNormZ = chiefDirZ / chiefLen;
            const chiefNormY = chiefDirY / chiefLen;
            
            // Ray 2: Sensor point → Lens TOP
            const topDirZ = lensTop.z - sp.pos.z;
            const topDirY = lensTop.y - sp.pos.y;
            const topLen = Math.sqrt(topDirZ * topDirZ + topDirY * topDirY);
            const topNormZ = topDirZ / topLen;
            const topNormY = topDirY / topLen;
            
            // Ray 3: Sensor point → Lens BOTTOM
            const botDirZ = lensBottom.z - sp.pos.z;
            const botDirY = lensBottom.y - sp.pos.y;
            const botLen = Math.sqrt(botDirZ * botDirZ + botDirY * botDirY);
            const botNormZ = botDirZ / botLen;
            const botNormY = botDirY / botLen;
            
            // IDEAL THIN LENS: Calculate where marginal rays converge with chief ray
            // This gives us the actual focal point accounting for lens geometry
            
            const f = focalLength; // meters
            
            // CHIEF RAY: Goes straight through lens center
            const chiefOutZ = chiefNormZ;
            const chiefOutY = chiefNormY;
            
            // Thin lens refraction for marginal rays
            // Output direction gets a deflection: Δy = -h/f
            const hTop = (lensTop.y - lensCenter.y) / this.scale;
            const hBot = (lensBottom.y - lensCenter.y) / this.scale;
            
            const topDeflectionY = -hTop / f;
            const topOutZ = topNormZ;
            const topOutY = topNormY + topDeflectionY;
            const topOutLen = Math.sqrt(topOutZ * topOutZ + topOutY * topOutY);
            const topOutNormZ = topOutZ / topOutLen;
            const topOutNormY = topOutY / topOutLen;
            
            const botDeflectionY = -hBot / f;
            const botOutZ = botNormZ;
            const botOutY = botNormY + botDeflectionY;
            const botOutLen = Math.sqrt(botOutZ * botOutZ + botOutY * botOutY);
            const botOutNormZ = botOutZ / botOutLen;
            const botOutNormY = botOutY / botOutLen;
            
            // Find where top marginal ray intersects chief ray
            const dx1 = lensTop.z - lensCenter.z;
            const dy1 = lensTop.y - lensCenter.y;
            const det1 = chiefOutZ * topOutNormY - chiefOutY * topOutNormZ;
            
            let focal1Z, focal1Y;
            const maxFocalDist = 50.0 * this.scale;
            
            if (Math.abs(det1) > 0.00001) {
                const t1 = (topOutNormZ * dy1 - topOutNormY * dx1) / det1;
                if (t1 > 0 && t1 < maxFocalDist / Math.abs(chiefOutZ)) {
                    focal1Z = lensCenter.z + t1 * chiefOutZ;
                    focal1Y = lensCenter.y + t1 * chiefOutY;
                } else {
                    focal1Z = lensCenter.z + chiefOutZ * maxFocalDist;
                    focal1Y = lensCenter.y + chiefOutY * maxFocalDist;
                }
            } else {
                focal1Z = lensCenter.z + chiefOutZ * maxFocalDist;
                focal1Y = lensCenter.y + chiefOutY * maxFocalDist;
            }
            
            // Find where bottom marginal ray intersects chief ray
            const dx2 = lensBottom.z - lensCenter.z;
            const dy2 = lensBottom.y - lensCenter.y;
            const det2 = chiefOutZ * botOutNormY - chiefOutY * botOutNormZ;
            
            let focal2Z, focal2Y;
            if (Math.abs(det2) > 0.00001) {
                const t2 = (botOutNormZ * dy2 - botOutNormY * dx2) / det2;
                if (t2 > 0 && t2 < maxFocalDist / Math.abs(chiefOutZ)) {
                    focal2Z = lensCenter.z + t2 * chiefOutZ;
                    focal2Y = lensCenter.y + t2 * chiefOutY;
                } else {
                    focal2Z = lensCenter.z + chiefOutZ * maxFocalDist;
                    focal2Y = lensCenter.y + chiefOutY * maxFocalDist;
                }
            } else {
                focal2Z = lensCenter.z + chiefOutZ * maxFocalDist;
                focal2Y = lensCenter.y + chiefOutY * maxFocalDist;
            }
            
            // Average the two intersection points for the focal point
            const focalZ = (focal1Z + focal2Z) / 2;
            const focalY = (focal1Y + focal2Y) / 2;
            
            focalPoints.push({ z: focalZ, y: focalY });
            
            // Draw rays from sensor through lens
            // Chief ray (thick, STRAIGHT through center - NO BENDING)
            this.ctx.strokeStyle = sp.color;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(sp.pos.z, sp.pos.y);
            this.ctx.lineTo(lensCenter.z, lensCenter.y);
            // Continue STRAIGHT in same direction
            const chiefExtendZ = lensCenter.z + chiefOutZ * 10.0 * this.scale;
            const chiefExtendY = lensCenter.y + chiefOutY * 10.0 * this.scale;
            this.ctx.lineTo(chiefExtendZ, chiefExtendY);
            this.ctx.stroke();
            
            // Top marginal ray (thin, BENDS at lens to pass through focal point)
            this.ctx.lineWidth = 1;
            this.ctx.strokeStyle = sp.color.replace('0.7', '0.5');
            this.ctx.beginPath();
            this.ctx.moveTo(sp.pos.z, sp.pos.y);
            this.ctx.lineTo(lensTop.z, lensTop.y);
            // After lens, ray bends toward focal point
            this.ctx.lineTo(focalZ, focalY);
            this.ctx.stroke();
            
            // Bottom marginal ray (thin, BENDS at lens to pass through focal point)
            this.ctx.beginPath();
            this.ctx.moveTo(sp.pos.z, sp.pos.y);
            this.ctx.lineTo(lensBottom.z, lensBottom.y);
            // After lens, ray bends toward focal point
            this.ctx.lineTo(focalZ, focalY);
            this.ctx.stroke();
            
            // Mark sensor point
            this.ctx.fillStyle = sp.color;
            this.ctx.beginPath();
            this.ctx.arc(sp.pos.z, sp.pos.y, 3, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Mark focal point
            this.ctx.fillStyle = sp.color.replace('0.7', '0.9');
            this.ctx.beginPath();
            this.ctx.arc(focalZ, focalY, 4, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Draw the focal plane by ACTUALLY connecting the three focal points
        // This naturally shows tilt when sensor or aperture is tilted
        if (focalPoints.length === 3) {
            // Calculate the line through the 3 focal points (should be nearly collinear for thin lens)
            // Use linear regression or just extend from top to bottom point
            const topFocal = focalPoints[0];
            const midFocal = focalPoints[1];
            const botFocal = focalPoints[2];
            
            // Find the slope of the line connecting top and bottom focal points
            const dz = botFocal.z - topFocal.z;
            const dy = botFocal.y - topFocal.y;
            
            // Extend the line beyond the focal points for visibility
            const extendDist = 100; // pixels
            const len = Math.sqrt(dz * dz + dy * dy);
            const normZ = dz / len;
            const normY = dy / len;
            
            const startZ = topFocal.z - normZ * extendDist;
            const startY = topFocal.y - normY * extendDist;
            const endZ = botFocal.z + normZ * extendDist;
            const endY = botFocal.y + normY * extendDist;
            
            this.ctx.strokeStyle = '#4a4';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(startZ, startY);
            this.ctx.lineTo(endZ, endY);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            this.ctx.fillStyle = '#4a4';
            this.ctx.font = '11px monospace';
            this.ctx.fillText('Focal Plane', midFocal.z + 5, midFocal.y - 20);
            
            // Calculate and display tilt angle of focal plane
            const focalPlaneAngle = Math.atan2(dz, dy) * 180 / Math.PI;
            if (Math.abs(focalPlaneAngle) > 0.5) {
                this.ctx.fillStyle = '#4a4';
                this.ctx.font = '9px monospace';
                this.ctx.fillText(`∠${focalPlaneAngle.toFixed(1)}°`, midFocal.z + 5, midFocal.y + 5);
            }
            
            // Display focal distances for debugging precision
            this.ctx.fillStyle = '#4a4';
            this.ctx.font = '8px monospace';
            const topDist = (topFocal.z / this.scale).toFixed(3);
            const midDist = (midFocal.z / this.scale).toFixed(3);
            const botDist = (botFocal.z / this.scale).toFixed(3);
            this.ctx.fillText(`Top: ${topDist}m`, midFocal.z + 5, midFocal.y + 20);
            this.ctx.fillText(`Mid: ${midDist}m`, midFocal.z + 5, midFocal.y + 30);
            this.ctx.fillText(`Bot: ${botDist}m`, midFocal.z + 5, midFocal.y + 40);
        }
        
        // Show optical axis direction
        const apNormalX = Math.sin(apertureTilt);
        const apNormalY = -Math.cos(apertureTilt);
        this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(lensCenter.z, lensCenter.y);
        this.ctx.lineTo(lensCenter.z + apNormalX * 0.05 * this.scale, lensCenter.y + apNormalY * 0.05 * this.scale);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // Labels
        this.ctx.fillStyle = '#888';
        this.ctx.font = '10px monospace';
        this.ctx.fillText('← Sensor', sensorZ - 50, sensorTop.y - 15);
        this.ctx.fillText('Lens', lensCenter.z - 10, lensCenter.y + 25);
        this.ctx.fillText('Scene (Focal Plane) →', focalPoints[1].z - 80, focalPoints[1].y - 35);
        
        // Show tilt info if tilted
        if (Math.abs(this.camera.apertureTiltX) > 0.5) {
            this.ctx.fillStyle = '#f1c40f';
            this.ctx.fillText(`Aperture Tilt: ${this.camera.apertureTiltX.toFixed(1)}°`, lensCenter.z - 40, lensCenter.y + 40);
        }
        if (Math.abs(this.camera.filmTiltX) > 0.5) {
            this.ctx.fillStyle = '#c9c';
            this.ctx.fillText(`Sensor Tilt: ${this.camera.filmTiltX.toFixed(1)}°`, sensorZ - 60, sensorBottom.y + 20);
        }
    }
    
    drawZoomedFocalView(width, height) {
        // Draw zoomed view of focal plane area
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, 0, width, height);
        
        // Title
        this.ctx.fillStyle = '#aaa';
        this.ctx.font = '10px monospace';
        this.ctx.fillText('Focal Plane', 5, 15);
        this.ctx.fillText('(zoomed)', 5, 28);
        
        // Calculate focal points again (same as in drawFOVCone)
        const filmPos = this.camera.getFilmPosition();
        const focusDist = this.camera.focusDistance;
        const focalLength = this.camera.focalLength / 1000;
        const apertureRadius = this.camera.getApertureRadius();
        
        const lensZ = this.camera.apertureShiftZ * this.scale;
        const lensY = -this.camera.apertureShiftY * this.scale;
        
        const visualScale = 0.15;
        const lensRadius = apertureRadius * this.scale * visualScale;
        const apertureTilt = this.camera.apertureTiltX * Math.PI / 180;
        
        const lensCenter = { z: lensZ, y: lensY };
        
        const sensorZ = -Math.abs(filmPos) * this.scale;
        const sensorY = -this.camera.filmShiftY * this.scale;
        const filmDiagonal = this.camera.filmSize / 1000;
        const aspectRatio = this.camera.aspectRatio;
        const filmHeight = filmDiagonal / Math.sqrt(1 + aspectRatio * aspectRatio);
        const sensorHalfHeight = (filmHeight / 2) * this.scale;
        const filmTilt = this.camera.filmTiltX * Math.PI / 180;
        
        const sensorTop = {
            z: sensorZ - sensorHalfHeight * Math.sin(filmTilt),
            y: sensorY + sensorHalfHeight * Math.cos(filmTilt)
        };
        const sensorCenter = { z: sensorZ, y: sensorY };
        const sensorBottom = {
            z: sensorZ + sensorHalfHeight * Math.sin(filmTilt),
            y: sensorY - sensorHalfHeight * Math.cos(filmTilt)
        };
        
        const sensorPoints = [
            { pos: sensorTop, color: 'rgba(255, 100, 100, 0.8)' },
            { pos: sensorCenter, color: 'rgba(100, 255, 100, 0.8)' },
            { pos: sensorBottom, color: 'rgba(100, 100, 255, 0.8)' }
        ];
        
        const focalPoints = [];
        
        for (let sp of sensorPoints) {
            const chiefDirZ = lensCenter.z - sp.pos.z;
            const chiefDirY = lensCenter.y - sp.pos.y;
            const chiefLen = Math.sqrt(chiefDirZ * chiefDirZ + chiefDirY * chiefDirY);
            const chiefNormZ = chiefDirZ / chiefLen;
            const chiefNormY = chiefDirY / chiefLen;
            
            // Calculate lens edge positions for this view
            const lensTopZ = lensZ + lensRadius * Math.sin(apertureTilt);
            const lensTopY = lensY + lensRadius * Math.cos(apertureTilt);
            const lensBotZ = lensZ - lensRadius * Math.sin(apertureTilt);
            const lensBotY = lensY - lensRadius * Math.cos(apertureTilt);
            
            // Directions to lens edges
            const topDirZ = lensTopZ - sp.pos.z;
            const topDirY = lensTopY - sp.pos.y;
            const topLen = Math.sqrt(topDirZ * topDirZ + topDirY * topDirY);
            const topNormZ = topDirZ / topLen;
            const topNormY = topDirY / topLen;
            
            const botDirZ = lensBotZ - sp.pos.z;
            const botDirY = lensBotY - sp.pos.y;
            const botLen = Math.sqrt(botDirZ * botDirZ + botDirY * botDirY);
            const botNormZ = botDirZ / botLen;
            const botNormY = botDirY / botLen;
            
            // Calculate where marginal rays converge with chief ray
            const f = focalLength;
            
            const chiefOutZ = chiefNormZ;
            const chiefOutY = chiefNormY;
            
            // Thin lens refraction
            const hTop = (lensTopY - lensCenter.y) / this.scale;
            const hBot = (lensBotY - lensCenter.y) / this.scale;
            
            const topDeflectionY = -hTop / f;
            const topOutZ = topNormZ;
            const topOutY = topNormY + topDeflectionY;
            const topOutLen = Math.sqrt(topOutZ * topOutZ + topOutY * topOutY);
            const topOutNormZ = topOutZ / topOutLen;
            const topOutNormY = topOutY / topOutLen;
            
            const botDeflectionY = -hBot / f;
            const botOutZ = botNormZ;
            const botOutY = botNormY + botDeflectionY;
            const botOutLen = Math.sqrt(botOutZ * botOutZ + botOutY * botOutY);
            const botOutNormZ = botOutZ / botOutLen;
            const botOutNormY = botOutY / botOutLen;
            
            // Find intersections
            const dx1 = lensTopZ - lensCenter.z;
            const dy1 = lensTopY - lensCenter.y;
            const det1 = chiefOutZ * topOutNormY - chiefOutY * topOutNormZ;
            
            let focal1Z, focal1Y;
            const maxFocalDist = 50.0 * this.scale;
            
            if (Math.abs(det1) > 0.00001) {
                const t1 = (topOutNormZ * dy1 - topOutNormY * dx1) / det1;
                if (t1 > 0 && t1 < maxFocalDist / Math.abs(chiefOutZ)) {
                    focal1Z = lensCenter.z + t1 * chiefOutZ;
                    focal1Y = lensCenter.y + t1 * chiefOutY;
                } else {
                    focal1Z = lensCenter.z + chiefOutZ * maxFocalDist;
                    focal1Y = lensCenter.y + chiefOutY * maxFocalDist;
                }
            } else {
                focal1Z = lensCenter.z + chiefOutZ * maxFocalDist;
                focal1Y = lensCenter.y + chiefOutY * maxFocalDist;
            }
            
            const dx2 = lensBotZ - lensCenter.z;
            const dy2 = lensBotY - lensCenter.y;
            const det2 = chiefOutZ * botOutNormY - chiefOutY * botOutNormZ;
            
            let focal2Z, focal2Y;
            if (Math.abs(det2) > 0.00001) {
                const t2 = (botOutNormZ * dy2 - botOutNormY * dx2) / det2;
                if (t2 > 0 && t2 < maxFocalDist / Math.abs(chiefOutZ)) {
                    focal2Z = lensCenter.z + t2 * chiefOutZ;
                    focal2Y = lensCenter.y + t2 * chiefOutY;
                } else {
                    focal2Z = lensCenter.z + chiefOutZ * maxFocalDist;
                    focal2Y = lensCenter.y + chiefOutY * maxFocalDist;
                }
            } else {
                focal2Z = lensCenter.z + chiefOutZ * maxFocalDist;
                focal2Y = lensCenter.y + chiefOutY * maxFocalDist;
            }
            
            const focalZ = (focal1Z + focal2Z) / 2;
            const focalY = (focal1Y + focal2Y) / 2;
            
            focalPoints.push({ z: focalZ, y: focalY, color: sp.color });
        }
        
        if (focalPoints.length === 3) {
            // Find bounds of focal points
            const minZ = Math.min(...focalPoints.map(p => p.z));
            const maxZ = Math.max(...focalPoints.map(p => p.z));
            const minY = Math.min(...focalPoints.map(p => p.y));
            const maxY = Math.max(...focalPoints.map(p => p.y));
            
            const centerZ = (minZ + maxZ) / 2;
            const centerY = (minY + maxY) / 2;
            const rangeZ = Math.max(maxZ - minZ, 100); // At least 100 pixels
            const rangeY = Math.max(maxY - minY, 100);
            
            // Zoom to show focal points with some padding
            const zoomScale = Math.min(width / rangeZ, height / rangeY) * 0.6;
            
            this.ctx.save();
            this.ctx.translate(width / 2, height / 2);
            this.ctx.scale(zoomScale, zoomScale);
            this.ctx.translate(-centerZ, -centerY);
            
            // Draw focal plane line
            const topFocal = focalPoints[0];
            const botFocal = focalPoints[2];
            const dz = botFocal.z - topFocal.z;
            const dy = botFocal.y - topFocal.y;
            const len = Math.sqrt(dz * dz + dy * dy);
            const normZ = dz / len;
            const normY = dy / len;
            
            const startZ = topFocal.z - normZ * 50 / zoomScale;
            const startY = topFocal.y - normY * 50 / zoomScale;
            const endZ = botFocal.z + normZ * 50 / zoomScale;
            const endY = botFocal.y + normY * 50 / zoomScale;
            
            this.ctx.strokeStyle = '#4a4';
            this.ctx.lineWidth = 2 / zoomScale;
            this.ctx.setLineDash([5 / zoomScale, 5 / zoomScale]);
            this.ctx.beginPath();
            this.ctx.moveTo(startZ, startY);
            this.ctx.lineTo(endZ, endY);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            // Draw focal points (larger)
            for (let fp of focalPoints) {
                this.ctx.fillStyle = fp.color;
                this.ctx.beginPath();
                this.ctx.arc(fp.z, fp.y, 5 / zoomScale, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            this.ctx.restore();
        }
    }
    
    drawLabels() {
        // Draw distance markers (cm scale for optics view)
        this.ctx.fillStyle = '#888';
        this.ctx.font = '9px monospace';
        
        // Mark every 5cm
        for (let dist = -0.15; dist <= 0.15; dist += 0.05) {
            if (Math.abs(dist) > 0.001) {
                const x = dist * this.scale;
                this.ctx.fillText(`${dist}m`, x - 8, this.height / 2 - 5);
            }
        }
        
        // Draw title
        this.ctx.fillStyle = '#ddd';
        this.ctx.font = 'bold 14px monospace';
        this.ctx.fillText('Camera Internal View (Drag Up to View)', 10, -this.height / 2 + 20);
    }
    
    drawFilmShapePreview() {
        // Draw film shape in top-left corner
        const x = 20 + this.aperturePreviewSize / 2;
        const y = 20 + this.aperturePreviewSize / 2;
        const size = this.aperturePreviewSize / 2;
        
        this.ctx.save();
        this.ctx.translate(x, y);
        
        // Background
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 2;
        this.ctx.fillRect(-size - 10, -size - 10, size * 2 + 20, size * 2 + 20);
        this.ctx.strokeRect(-size - 10, -size - 10, size * 2 + 20, size * 2 + 20);
        
        // Label
        this.ctx.fillStyle = '#aaa';
        this.ctx.font = 'bold 11px monospace';
        this.ctx.fillText('Film/Sensor', -size, -size - 15);
        this.ctx.font = '9px monospace';
        this.ctx.fillText('(Top View)', -size, -size - 4);
        
        // Draw film rectangle (35mm: 24x36mm, aspect 3:2)
        const filmTransform = this.camera.getFilmTransform();
        const filmWidth = size * 1.2;
        const filmHeight = size * 0.8;
        
        this.ctx.save();
        // Apply film tilt Y for top-down rotation
        const tiltY = this.camera.filmTiltY * Math.PI / 180;
        this.ctx.rotate(tiltY);
        
        // Film surface
        this.ctx.fillStyle = 'rgba(52, 152, 219, 0.3)';
        this.ctx.strokeStyle = '#3498db';
        this.ctx.lineWidth = 2;
        
        this.ctx.fillRect(-filmWidth/2, -filmHeight/2, filmWidth, filmHeight);
        this.ctx.strokeRect(-filmWidth/2, -filmHeight/2, filmWidth, filmHeight);
        
        // Draw sensor grid (pixels)
        this.ctx.strokeStyle = '#2980b9';
        this.ctx.lineWidth = 0.5;
        const gridLines = 5;
        for (let i = 1; i < gridLines; i++) {
            // Vertical lines
            const xPos = -filmWidth/2 + (i / gridLines) * filmWidth;
            this.ctx.beginPath();
            this.ctx.moveTo(xPos, -filmHeight/2);
            this.ctx.lineTo(xPos, filmHeight/2);
            this.ctx.stroke();
            
            // Horizontal lines
            const yPos = -filmHeight/2 + (i / gridLines) * filmHeight;
            this.ctx.beginPath();
            this.ctx.moveTo(-filmWidth/2, yPos);
            this.ctx.lineTo(filmWidth/2, yPos);
            this.ctx.stroke();
        }
        
        // Center crosshair
        this.ctx.strokeStyle = '#2ecc71';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(-5, 0);
        this.ctx.lineTo(5, 0);
        this.ctx.moveTo(0, -5);
        this.ctx.lineTo(0, 5);
        this.ctx.stroke();
        
        // Size label
        this.ctx.fillStyle = '#2ecc71';
        this.ctx.font = '8px monospace';
        this.ctx.fillText('36mm', -filmWidth/2 + 2, -filmHeight/2 - 2);
        this.ctx.fillText('24mm', filmWidth/2 + 2, 0);
        
        this.ctx.restore();
        
        // Tilt indicator
        if (Math.abs(tiltY) > 0.01) {
            this.ctx.fillStyle = '#3498db';
            this.ctx.font = '9px monospace';
            this.ctx.fillText(`∠${(tiltY * 180 / Math.PI).toFixed(1)}°`, -size, size + 12);
        }
        
        this.ctx.restore();
    }
    
    drawApertureShapePreview() {
        // Draw in top-right corner (no coordinate transform)
        const x = this.width - this.aperturePreviewSize - 20;
        const y = 20 + this.aperturePreviewSize / 2;
        const size = this.aperturePreviewSize / 2;
        
        this.ctx.save();
        this.ctx.translate(x, y);
        
        // Background
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 2;
        this.ctx.fillRect(-size - 10, -size - 10, size * 2 + 20, size * 2 + 20);
        this.ctx.strokeRect(-size - 10, -size - 10, size * 2 + 20, size * 2 + 20);
        
        // Label
        this.ctx.fillStyle = '#aaa';
        this.ctx.font = 'bold 11px monospace';
        this.ctx.fillText('Aperture Shape', -size, -size - 15);
        this.ctx.font = '9px monospace';
        this.ctx.fillText('(Top View)', -size, -size - 4);
        
        // Draw aperture shape
        const shape = this.camera.apertureShape;
        const blades = this.camera.apertureBlades;
        
        this.ctx.fillStyle = 'rgba(231, 76, 60, 0.3)';
        this.ctx.strokeStyle = '#e74c3c';
        this.ctx.lineWidth = 2;
        
        this.ctx.beginPath();
        
        if (shape === 'circular') {
            this.ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
        } else if (shape === 'polygon' || shape === 'hexagonal') {
            // Regular polygon - uses blade count for sides
            this.drawPolygon(blades || 6, size * 0.8);
        } else if (shape === 'square') {
            const s = size * 0.8 * 0.85;
            this.ctx.rect(-s, -s, s * 2, s * 2);
        } else if (shape === 'star') {
            // Use actual blade count from camera (supports 3+)
            this.drawStar(blades || 6, size * 0.8, size * 0.4);
        } else if (shape === 'ring') {
            // Ring/annular aperture
            this.ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
            this.ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2, true); // Inner hole (reversed)
        } else if (shape === 'diagonal') {
            // Diagonal scar
            const w = size * 1.5;
            const h = size * 0.3;
            this.ctx.save();
            this.ctx.rotate(Math.PI / 6); // 30 degree angle
            this.ctx.rect(-w, -h, w * 2, h * 2);
            this.ctx.restore();
        } else if (shape === 'coded') {
            // MURA coded aperture - 5x5 pattern
            const pattern = [
                1, 0, 1, 1, 0,
                1, 1, 0, 1, 0,
                0, 1, 1, 0, 1,
                0, 1, 0, 1, 1,
                1, 0, 1, 0, 1
            ];
            const cellSize = (size * 1.6) / 5;
            for (let y = 0; y < 5; y++) {
                for (let x = 0; x < 5; x++) {
                    if (pattern[y * 5 + x] === 1) {
                        const px = (x - 2) * cellSize;
                        const py = (y - 2) * cellSize;
                        this.ctx.rect(px, py, cellSize * 0.9, cellSize * 0.9);
                    }
                }
            }
        } else if (shape === 'pinhole-grid') {
            // NxN pinhole grid - uses blade count for density
            const gridSize = blades || 4;
            const spacing = (size * 1.6) / gridSize;
            const pinRadius = spacing * 0.25; // Scales with density
            const offset = (gridSize - 1) / 2.0;
            for (let y = 0; y < gridSize; y++) {
                for (let x = 0; x < gridSize; x++) {
                    const px = (x - offset) * spacing;
                    const py = (y - offset) * spacing;
                    this.ctx.moveTo(px + pinRadius, py);
                    this.ctx.arc(px, py, pinRadius, 0, Math.PI * 2);
                }
            }
        } else if (shape === 'heart') {
            // Heart shape (parametric)
            for (let i = 0; i <= 100; i++) {
                const t = (i / 100) * Math.PI * 2;
                const x = 16 * Math.pow(Math.sin(t), 3);
                const y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
                const scale = (size * 0.8) / 17;
                const px = x * scale;
                const py = -y * scale; // Flip Y
                if (i === 0) this.ctx.moveTo(px, py);
                else this.ctx.lineTo(px, py);
            }
            this.ctx.closePath();
        } else if (shape === 'cat') {
            // Cat eye (vertical slit)
            const w = size * 0.2;
            const h = size * 0.9;
            this.ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
        }
        
        this.ctx.fill();
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    drawPolygon(sides, radius) {
        for (let i = 0; i <= sides; i++) {
            const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
    }
    
    drawStar(points, outerRadius, innerRadius) {
        for (let i = 0; i <= points * 2; i++) {
            const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.closePath();
    }
}
