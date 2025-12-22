export class Camera {
    constructor() {
        // Camera type and settings
        this.type = 'thin-lens'; // pinhole, thin-lens, compound-lens
        this.fov = 60;
        
        // Position and orientation
        this.position = [0, 1.5, -5]; // Raised camera, moved back
        this.lookAt = [0, 0, 5]; // Looking at scene center
        this.up = [0, 1, 0];
        
        // Camera rotation (degrees)
        this.yaw = 180; // Left/right rotation - face forward
        this.pitch = 6; // Up/down rotation - gentle look down at scene
        this.distance = 12.0; // Distance from scene - good overview
        
        // Aperture settings (in camera local space)
        this.apertureShape = 'star'; // circular, hexagonal, square, star
        this.apertureFStop = 50; // Moderate aperture for balanced DOF
        this.apertureBlades = 6;
        this.apertureShiftX = 0.0; // meters, right
        this.apertureShiftY = 0.0; // meters, up
        this.apertureShiftZ = 0.0; // meters, forward
        this.apertureTiltX = 0; // degrees
        this.apertureTiltY = 0; // degrees
        
        // Lens settings
        this.focalLength = 50; // mm (standard lens)
        this.focusDistance = 5.0; // Focus on center objects (not camera distance)
        this.lensElements = 3; // Number of lens elements
        
        // Film/sensor settings (in camera local space)
        this.filmShiftX = 0.0; // meters, right
        this.filmShiftY = 0.0; // meters, up
        this.filmShiftZ = 0.0; // meters, forward
        this.filmTiltX = 0; // degrees
        this.filmTiltY = 0; // degrees
        this.filmSize = 43; // mm (diagonal) - Full frame sensor (36x24mm = 43.3mm diagonal)
        this.filmCurvature = 0;
        this.aspectRatio = 16 / 9;
        this.enableTiltShift = false; // Enable virtual plane tilt-shift rendering
        
        // Sensor viewport offset (for panning to see shifted image)
        this.sensorOffsetX = 0.0; // normalized units (-1 to 1, 0 = center)
        this.sensorOffsetY = 0.0; // normalized units (-1 to 1, 0 = center)
        
        // Lens distortion (post-process)
        this.distortionType = 'none'; // none, barrel, pincushion, fisheye
        this.distortionAmount = 0.0; // 0.0 to 1.0
        
        // Chromatic aberration
        this.enableChromaticAberration = false;
        this.chromaticAberrationMode = 'rgb'; // 'rgb' or 'spectrum'
        this.chromaticAberration = 1.0; // 0.0 to 3.0, controls IOR variation
        // Debug toggles for RGB channels
        this.showRedChannel = true;
        this.showGreenChannel = true;
        this.showBlueChannel = true;
        // Spectral filter (0.0 = red/infrared, 1.0 = blue/UV)
        this.spectralFilterMin = 0.0; // Minimum wavelength to show
        this.spectralFilterMax = 1.0; // Maximum wavelength to show
        
        // Lens chromatic aberration
        this.enableLensChromaticAberration = false;
        this.lensChromaticAberrationMode = 'postprocess'; // 'postprocess' or 'spectral'
        this.lensChromaticAberration = 1.0; // 0.0 to 3.0, strength of lens CA
        
        // Time-of-Flight (TOF) filtering
        this.enableTOF = false;
        this.tofMinDistance = 0.0; // Minimum path length in meters
        this.tofRange = 50.0; // Range/window size in meters
        
        // Continuous Wave ToF (CW-ToF) for holographic depth sensing
        this.enableCWToF = false;
        this.cwTofModulationFreq = 30e6; // 30 MHz modulation frequency
        this.cwTofPhaseOffset = 0; // Current phase offset for multi-phase capture (0, 90, 180, 270 degrees)
        this.cwTofWavelength = 850; // nm - Near infrared (coherent light)
        this.cwTofShowInterference = true; // Show raw interference patterns
        this.cwTofShowDepth = false; // Show ground truth depth map (ray-traced)
        this.cwTofShowReconstruction = false; // Show reconstructed depth from 4-phase algorithm
        this.cwTofPhaseShifts = []; // Store 4 phase-shifted captures for processing
        this.cwTofMinSPP = 100; // Minimum samples per pixel before capturing (reduces noise)
        
        // Off-Axis Holography (single-shot spatial phase encoding)
        this.enableOffAxisHolography = false;
        this.offAxisReferenceAngle = 5.0; // degrees - angle of reference beam (creates spatial carrier)
        this.offAxisWavelength = 632.8; // nm - He-Ne laser wavelength (red)
        this.offAxisCarrierFreq = 20; // Spatial carrier frequency (10-30 recommended to avoid aliasing)
        this.offAxisShowHologram = true; // Show raw hologram with fringes
        this.offAxisShowFFTPreview = false; // Show real-time FFT preview overlay
        this.offAxisFFTPreviewSize = 512; // Size of FFT preview window (512x512)
        this.offAxisFFTPreviewMode = 'magnitude'; // 'magnitude' or 'phase'
        this.offAxisFFTTestMode = false; // Use test pattern instead of captured hologram
        this.offAxisMinSPP = 100; // Minimum samples per pixel before running FFT (reduces noise)
        
        // Planar wave light source (for coherent illumination)
        this.enablePlanarWaveLight = false;
        this.planarWaveLightDistance = 5.0; // Distance behind camera in meters
        this.planarWaveLightSize = 20.0; // Size of square light in meters
        this.planarWaveLightIntensity = 10.0; // Brighter by default
        this.planarWaveCarrierFreq = 0.0; // Spatial carrier frequency (for off-axis)
        this.planarWaveTiltAngle = 0.0; // Tilt angle in degrees (0=straight, positive=right)
        this.planarWaveShowDebug = false; // Show debug visualization of light direction
        this.disableSceneLights = false; // Turn off emissive spheres and sky
        
        // Reference wave controls (for interference)
        this.enableReferenceWave = false; // Toggle reference wave interference
        this.referenceWaveIntensity = 0.5; // Reference wave intensity
        this.referenceWaveFrequency = 30e6; // Frequency in Hz (matches CW-ToF by default)
        this.referenceWavePhase = 0.0; // Phase offset in degrees
        this.referenceWaveColorMode = false; // If true, preserve scene color; if false, show grayscale interference
        
        // Ground truth depth reference (for comparison)
        this.showDepthReference = false;
        
        // Participating media (environment fog)
        this.enableEnvironmentFog = false;
        this.fogDensity = 0.05; // Density coefficient
        this.fogAlbedo = [0.8, 0.8, 0.8]; // Scattering color
        this.fogAnisotropy = 0.0; // -1=backscatter, 0=isotropic, 1=forward
        
        // Gizmo hover state (for focus point interaction)
        this.hoveredGizmo = null; // null, 'pointA', 'pointB', 'pointC', 'center', 'axisX', 'axisY', 'axisZ', 'circleX', 'circleY', 'circleZ'
        this.showRotationCircles = false; // Show rotation gizmo circles
    }
    
    updateRotation() {
        // Update camera position based on yaw/pitch around lookAt point
        const yawRad = this.yaw * Math.PI / 180;
        const pitchRad = this.pitch * Math.PI / 180;
        
        // Spherical coordinates around lookAt point
        const x = this.lookAt[0] + this.distance * Math.sin(yawRad) * Math.cos(pitchRad);
        const y = this.lookAt[1] + this.distance * Math.sin(pitchRad);
        const z = this.lookAt[2] + this.distance * Math.cos(yawRad) * Math.cos(pitchRad);
        
        this.position = [x, y, z];
    }
    
    getApertureRadius() {
        // Convert f-stop to aperture radius
        // aperture diameter = focal_length / f_stop
        return (this.focalLength / this.apertureFStop / 2) / 1000; // Convert to meters
    }
    
    getLensData() {
        // Generate lens element positions for compound lens
        const elements = [];
        const spacing = 0.02; // 20mm between elements
        
        for (let i = 0; i < this.lensElements; i++) {
            const z = -this.focalLength / 1000 / 2 + i * spacing;
            const curvature = (i % 2 === 0) ? 0.05 : -0.05;
            const radius = 0.015; // 15mm radius
            
            elements.push({
                position: z,
                curvature: curvature,
                radius: radius,
                ior: 1.5 // Glass refractive index
            });
        }
        
        return elements;
    }
    
    getFilmPosition() {
        // Calculate film position based on focal length and focus distance
        // Using thin lens equation: 1/f = 1/do + 1/di
        const f = this.focalLength / 1000; // Convert to meters
        const do_ = this.focusDistance;
        const di = (f * do_) / (do_ - f);
        
        return -di + this.filmShiftZ;
    }
    
    getFilmTransform() {
        // Returns transformation matrix for film
        const tiltXRad = this.filmTiltX * Math.PI / 180;
        const tiltYRad = this.filmTiltY * Math.PI / 180;
        
        return {
            position: [0, 0, this.getFilmPosition()],
            tiltX: tiltXRad,
            tiltY: tiltYRad,
            curvature: this.filmCurvature
        };
    }
    
    getBasis() {
        // Calculate camera basis vectors
        const w = this.normalize(this.subtract(this.position, this.lookAt));
        const u = this.normalize(this.cross(this.up, w));
        const v = this.cross(w, u);
        
        return { u, v, w };
    }
    
    // Ray generation based on camera type
    generateRay(u, v) {
        // u, v are normalized coordinates on film [-1, 1]
        const basis = this.getBasis();
        
        if (this.type === 'pinhole') {
            return this.generatePinholeRay(u, v, basis);
        } else if (this.type === 'thin-lens') {
            return this.generateThinLensRay(u, v, basis);
        } else if (this.type === 'compound-lens') {
            return this.generateCompoundLensRay(u, v, basis);
        }
    }
    
    generatePinholeRay(u, v, basis) {
        const filmPos = this.getFilmPosition();
        
        // Use focal length to determine FOV (same as thin lens)
        const sensorHeight = (this.filmSize / 1000) * 0.6;
        const fovFromFocal = 2 * Math.atan(sensorHeight / (2 * this.focalLength / 1000));
        const halfHeight = Math.tan(fovFromFocal / 2) * Math.abs(filmPos);
        const halfWidth = halfHeight * this.aspectRatio;
        
        // Film point (behind camera at negative Z in camera space)
        const filmPoint = [
            u * halfWidth,
            v * halfHeight,
            filmPos  // This is negative (e.g., -0.05)
        ];
        
        // If aperture is large (small f-stop), sample within aperture for DOF effect
        // Otherwise use true pinhole at origin
        let origin = [0, 0, 0];
        if (this.apertureFStop < 16) {
            // Sample aperture for DOF even in "pinhole" mode
            const aperturePoint = this.sampleAperture();
            const apertureRadius = this.getApertureRadius();
            origin = [
                aperturePoint[0] * apertureRadius + this.apertureShiftX,
                aperturePoint[1] * apertureRadius + this.apertureShiftY,
                this.apertureShiftZ
            ];
        }
        
        // Camera space: film at negative Z, we want rays pointing in negative Z direction
        // (which is forward, since w basis points backward)
        // Simply use the film point direction from origin, normalized
        const direction = this.normalize(this.subtract(filmPoint, origin));
        
        // Transform to world space
        const worldOrigin = [
            basis.u[0] * origin[0] + basis.v[0] * origin[1] + basis.w[0] * origin[2],
            basis.u[1] * origin[0] + basis.v[1] * origin[1] + basis.w[1] * origin[2],
            basis.u[2] * origin[0] + basis.v[2] * origin[1] + basis.w[2] * origin[2]
        ];
        
        return {
            origin: this.add(this.position, worldOrigin),
            direction: this.transformDirection(direction, basis)
        };
    }
    
    generateThinLensRay(u, v, basis) {
        // Calculate point on film plane
        const filmPos = this.getFilmPosition();
        
        // Use focal length to determine FOV
        // For a 35mm sensor (filmSize), FOV = 2 * atan(filmSize / (2 * focalLength))
        const sensorHeight = (this.filmSize / 1000) * 0.6; // Approximate height from diagonal
        const fovFromFocal = 2 * Math.atan(sensorHeight / (2 * this.focalLength / 1000));
        const halfHeight = Math.tan(fovFromFocal / 2) * Math.abs(filmPos);
        const halfWidth = halfHeight * this.aspectRatio;
        
        // Film point in camera space (before shift/tilt)
        let filmPoint = [
            u * halfWidth,
            v * halfHeight,
            filmPos  // negative (e.g., -0.05)
        ];
        
        // Apply film shift (in camera local space)
        filmPoint[0] += this.filmShiftX;
        filmPoint[1] += this.filmShiftY;
        // filmShiftZ already applied in getFilmPosition()
        
        // Apply film tilt (Scheimpflug principle)
        const filmTransform = this.getFilmTransform();
        if (filmTransform.tiltX !== 0 || filmTransform.tiltY !== 0) {
            filmPoint = this.rotatePoint(filmPoint, filmTransform.tiltX, filmTransform.tiltY);
        }
        
        // Apply film curvature
        if (this.filmCurvature > 0) {
            const r = Math.sqrt(filmPoint[0] * filmPoint[0] + filmPoint[1] * filmPoint[1]);
            filmPoint[2] -= r * r * this.filmCurvature * 0.02;
        }
        
        // Aperture center and normal (optical axis) in camera space
        const apertureTiltXRad = this.apertureTiltX * Math.PI / 180;
        const apertureTiltYRad = this.apertureTiltY * Math.PI / 180;
        
        // Aperture center position
        let apertureCenter = [this.apertureShiftX, this.apertureShiftY, this.apertureShiftZ];
        
        // Aperture normal (optical axis) - starts pointing forward (-Z)
        let apertureNormal = [0, 0, -1];
        if (apertureTiltXRad !== 0 || apertureTiltYRad !== 0) {
            apertureNormal = this.rotatePoint(apertureNormal, apertureTiltXRad, apertureTiltYRad);
        }
        
        // Sample point on aperture disk in local aperture space
        const aperturePoint = this.sampleAperture();
        const apertureDiskPoint = [
            aperturePoint[0] * this.getApertureRadius(),
            aperturePoint[1] * this.getApertureRadius(),
            0
        ];
        
        // Transform aperture disk point to camera space (rotate by aperture tilt, then shift)
        let lensPoint = apertureDiskPoint;
        if (apertureTiltXRad !== 0 || apertureTiltYRad !== 0) {
            lensPoint = this.rotatePoint(lensPoint, apertureTiltXRad, apertureTiltYRad);
        }
        lensPoint[0] += apertureCenter[0];
        lensPoint[1] += apertureCenter[1];
        lensPoint[2] += apertureCenter[2];
        
        // Calculate focus point along the optical axis
        // Ray from film point through aperture center defines the chief ray
        const chiefRayDir = this.normalize(this.subtract(apertureCenter, filmPoint));
        
        // Focus plane is perpendicular to aperture normal at focusDistance from aperture center
        // Find intersection of chief ray with focus plane
        const focusPlanePoint = [
            apertureCenter[0] + apertureNormal[0] * this.focusDistance,
            apertureCenter[1] + apertureNormal[1] * this.focusDistance,
            apertureCenter[2] + apertureNormal[2] * this.focusDistance
        ];
        
        // Ray-plane intersection: find t where (chiefRay + t*chiefRayDir - focusPlanePoint) · apertureNormal = 0
        const toPlane = this.subtract(focusPlanePoint, apertureCenter);
        const denom = this.dot(chiefRayDir, apertureNormal);
        const t = denom !== 0 ? this.dot(toPlane, apertureNormal) / denom : this.focusDistance;
        
        const focusPoint = [
            apertureCenter[0] + chiefRayDir[0] * t,
            apertureCenter[1] + chiefRayDir[1] * t,
            apertureCenter[2] + chiefRayDir[2] * t
        ];
        
        // Ray from lens sample point toward focus point
        const direction = this.normalize(this.subtract(focusPoint, lensPoint));
        
        // Transform to world space
        const worldLensPoint = [
            basis.u[0] * lensPoint[0] + basis.v[0] * lensPoint[1] + basis.w[0] * lensPoint[2],
            basis.u[1] * lensPoint[0] + basis.v[1] * lensPoint[1] + basis.w[1] * lensPoint[2],
            basis.u[2] * lensPoint[0] + basis.v[2] * lensPoint[1] + basis.w[2] * lensPoint[2]
        ];
        
        return {
            origin: this.add(this.position, worldLensPoint),
            direction: this.transformDirection(direction, basis)
        };
    }
    
    generateCompoundLensRay(u, v, basis) {
        // Use same logic as thin lens for now
        return this.generateThinLensRay(u, v, basis);
    }
    
    sampleAperture() {
        // Sample a point on the aperture based on shape
        if (this.apertureShape === 'circular') {
            return this.sampleCircle();
        } else if (this.apertureShape === 'hexagonal') {
            return this.samplePolygon(6);
        } else if (this.apertureShape === 'square') {
            return this.sampleSquare();
        } else if (this.apertureShape === 'star') {
            return this.sampleStar(6);
        }
        return [0, 0];
    }
    
    sampleCircle() {
        const r = Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        return [r * Math.cos(theta), r * Math.sin(theta)];
    }
    
    sampleSquare() {
        return [Math.random() * 2 - 1, Math.random() * 2 - 1];
    }
    
    samplePolygon(sides) {
        // Sample inside a regular polygon using triangle decomposition
        // Much faster than rejection sampling
        const angle = Math.random() * 2 * Math.PI / sides;
        const r = Math.sqrt(Math.random()) * Math.cos(Math.PI / sides);
        
        const baseAngle = Math.floor(Math.random() * sides) * (2 * Math.PI / sides);
        
        return [
            r * Math.cos(baseAngle + angle),
            r * Math.sin(baseAngle + angle)
        ];
    }
    
    sampleStar(points) {
        // Sample inside a star shape with thin, pronounced spikes
        const r = Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        
        // Modulate radius based on angle for star effect
        // Make spikes very thin and pronounced
        const angleSegment = theta % (2 * Math.PI / points);
        const normalizedAngle = angleSegment / (2 * Math.PI / points); // 0 to 1
        
        // Sharp star: 1.0 at center of spike (0), 0.2 at valley (0.5)
        const starRadius = normalizedAngle < 0.5 
            ? 1.0 - normalizedAngle * 1.6  // 1.0 → 0.2
            : 0.2 + (normalizedAngle - 0.5) * 1.6; // 0.2 → 1.0
        
        return [r * starRadius * Math.cos(theta), r * starRadius * Math.sin(theta)];
    }
    
    rotatePoint(point, tiltX, tiltY) {
        // Rotate point around X and Y axes
        let p = [...point];
        
        // Rotate around X
        if (tiltX !== 0) {
            const cos = Math.cos(tiltX);
            const sin = Math.sin(tiltX);
            p = [p[0], p[1] * cos - p[2] * sin, p[1] * sin + p[2] * cos];
        }
        
        // Rotate around Y
        if (tiltY !== 0) {
            const cos = Math.cos(tiltY);
            const sin = Math.sin(tiltY);
            p = [p[0] * cos + p[2] * sin, p[1], -p[0] * sin + p[2] * cos];
        }
        
        return p;
    }
    
    // Vector math utilities
    add(a, b) {
        return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    }
    
    subtract(a, b) {
        return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }
    
    scale(v, s) {
        return [v[0] * s, v[1] * s, v[2] * s];
    }
    
    dot(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }
    
    cross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }
    
    length(v) {
        return Math.sqrt(this.dot(v, v));
    }
    
    normalize(v) {
        const len = this.length(v);
        return len > 0 ? this.scale(v, 1 / len) : v;
    }
    
    transformDirection(dir, basis) {
        return this.normalize([
            dir[0] * basis.u[0] + dir[1] * basis.v[0] + dir[2] * basis.w[0],
            dir[0] * basis.u[1] + dir[1] * basis.v[1] + dir[2] * basis.w[1],
            dir[0] * basis.u[2] + dir[1] * basis.v[2] + dir[2] * basis.w[2]
        ]);
    }
}
