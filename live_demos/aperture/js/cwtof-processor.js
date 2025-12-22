// CW-ToF Processor for 4-phase depth reconstruction
// Implements multi-phase depth extraction from interference patterns

export class CWToFProcessor {
    constructor(size) {
        this.size = size;
        this.phaseCaptures = [null, null, null, null]; // Store 4 phase captures
        this.reconstructedDepth = null;
        this.unwrappedDepth = null;
    }
    
    // Capture interference pattern at specific phase offset
    capturePhase(gl, width, height, phaseIndex) {
        const n = this.size;
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        
        // Center crop and downsample
        const minDim = Math.min(width, height);
        const cropX = Math.floor((width - minDim) / 2);
        const cropY = Math.floor((height - minDim) / 2);
        
        this.phaseCaptures[phaseIndex] = new Float32Array(n * n);
        
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                // Sample from center crop
                const srcX = cropX + Math.floor(x * minDim / n);
                const srcY = cropY + Math.floor(y * minDim / n);
                const srcIdx = (srcY * width + srcX) * 4;
                
                // Convert to grayscale intensity [0, 1]
                const r = pixels[srcIdx + 0] / 255.0;
                const g = pixels[srcIdx + 1] / 255.0;
                const b = pixels[srcIdx + 2] / 255.0;
                const intensity = (r + g + b) / 3.0;
                
                this.phaseCaptures[phaseIndex][y * n + x] = intensity;
            }
        }
        
        console.log(`Captured phase ${phaseIndex} (${phaseIndex * 90}°)`);
    }
    
    // Reconstruct depth using 4-phase algorithm
    reconstructDepth(modulationFreq) {
        if (!this.phaseCaptures.every(p => p !== null)) {
            console.error('Not all 4 phase captures are available!');
            return;
        }
        
        const n = this.size;
        const I0 = this.phaseCaptures[0];   // 0°
        const I90 = this.phaseCaptures[1];  // 90°
        const I180 = this.phaseCaptures[2]; // 180°
        const I270 = this.phaseCaptures[3]; // 270°
        
        this.reconstructedDepth = new Float32Array(n * n);
        
        // Speed of light in m/s
        const c = 299792458;
        
        // Modulation wavelength in meters
        const lambda_mod = c / modulationFreq;
        
        // Unambiguous range (half modulation wavelength)
        const unambiguousRange = lambda_mod / 2;
        
        console.log(`4-phase reconstruction:`);
        console.log(`  Modulation freq: ${(modulationFreq / 1e6).toFixed(1)} MHz`);
        console.log(`  Modulation wavelength: ${(lambda_mod).toFixed(3)} m`);
        console.log(`  Unambiguous range: ${(unambiguousRange).toFixed(3)} m`);
        
        let minPhase = Infinity, maxPhase = -Infinity;
        let minDepth = Infinity, maxDepth = -Infinity;
        
        for (let i = 0; i < n * n; i++) {
            // 4-phase algorithm
            const numerator = I90[i] - I270[i];
            const denominator = I0[i] - I180[i];
            
            // Extract phase
            let phase = Math.atan2(numerator, denominator);
            
            // Phase is in [-π, π], convert to [0, 2π]
            if (phase < 0) phase += 2 * Math.PI;
            
            // Convert phase to depth
            // depth = (phase / (4π)) × λ_mod
            const depth = (phase / (4 * Math.PI)) * lambda_mod;
            
            this.reconstructedDepth[i] = depth;
            
            if (phase < minPhase) minPhase = phase;
            if (phase > maxPhase) maxPhase = phase;
            if (depth < minDepth) minDepth = depth;
            if (depth > maxDepth) maxDepth = depth;
        }
        
        console.log(`  Phase range: [${minPhase.toFixed(3)}, ${maxPhase.toFixed(3)}] rad`);
        console.log(`  Depth range: [${minDepth.toFixed(3)}, ${maxDepth.toFixed(3)}] m`);
        
        // Normalize for display [0, 1]
        const depthRange = maxDepth - minDepth;
        if (depthRange > 0) {
            for (let i = 0; i < n * n; i++) {
                this.reconstructedDepth[i] = (this.reconstructedDepth[i] - minDepth) / depthRange;
            }
        }
    }
    
    // Simple phase unwrapping (row-by-row)
    unwrapDepth() {
        const n = this.size;
        this.unwrappedDepth = new Float32Array(n * n);
        
        // Copy first pixel
        this.unwrappedDepth[0] = this.reconstructedDepth[0];
        
        // Unwrap each row
        for (let y = 0; y < n; y++) {
            if (y === 0) {
                this.unwrappedDepth[0] = this.reconstructedDepth[0];
            } else {
                // Connect to previous row
                const idx = y * n;
                const prevIdx = (y - 1) * n;
                let diff = this.reconstructedDepth[idx] - this.unwrappedDepth[prevIdx];
                if (diff > 0.5) diff -= 1.0;
                if (diff < -0.5) diff += 1.0;
                this.unwrappedDepth[idx] = this.unwrappedDepth[prevIdx] + diff;
            }
            
            // Unwrap along row
            for (let x = 1; x < n; x++) {
                const idx = y * n + x;
                const prevIdx = y * n + (x - 1);
                let diff = this.reconstructedDepth[idx] - this.unwrappedDepth[prevIdx];
                
                // Detect wrapping
                if (diff > 0.5) diff -= 1.0;
                if (diff < -0.5) diff += 1.0;
                
                this.unwrappedDepth[idx] = this.unwrappedDepth[prevIdx] + diff;
            }
        }
        
        // Normalize to [0, 1]
        let minDepth = Infinity, maxDepth = -Infinity;
        for (let i = 0; i < n * n; i++) {
            if (this.unwrappedDepth[i] < minDepth) minDepth = this.unwrappedDepth[i];
            if (this.unwrappedDepth[i] > maxDepth) maxDepth = this.unwrappedDepth[i];
        }
        
        const range = maxDepth - minDepth;
        if (range > 0) {
            for (let i = 0; i < n * n; i++) {
                this.unwrappedDepth[i] = (this.unwrappedDepth[i] - minDepth) / range;
            }
        }
        
        console.log(`Unwrapped depth: range [${minDepth.toFixed(3)}, ${maxDepth.toFixed(3)}]`);
    }
    
    // Reset captures
    reset() {
        this.phaseCaptures = [null, null, null, null];
        this.reconstructedDepth = null;
        this.unwrappedDepth = null;
    }
}
