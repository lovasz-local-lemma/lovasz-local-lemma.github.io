// FFT Processor for Off-Axis Holography
// Implements 2D FFT using Cooley-Tukey algorithm

export class FFTProcessor {
    constructor(size) {
        this.size = size; // Must be power of 2
        this.hologramData = null; // Captured hologram (grayscale)
        this.fftReal = null; // FFT real part
        this.fftImag = null; // FFT imaginary part
        this.fftMagnitude = null; // FFT magnitude (for display)
        this.fftPhase = null; // FFT phase (for display)
        this.filteredReal = null; // Filtered sideband real
        this.filteredImag = null; // Filtered sideband imaginary
        this.filteredMagnitude = null; // Filtered magnitude (for display)
        this.reconstructedPhase = null; // Final phase map (depth)
        
        // SNAPSHOT copies for visualization (NEVER modified after initial copy)
        this.fftRealSnapshot = null;
        this.fftImagSnapshot = null;
        this.filteredRealSnapshot = null;
        this.filteredImagSnapshot = null;
    }

    // Generate test pattern for sanity check
    generateTestPattern(patternType = 'single-wave') {
        const n = this.size;
        this.hologramData = new Float32Array(n * n);
        
        console.log(`🧪 Generating ${n}x${n} test pattern: ${patternType}`);
        
        if (patternType === 'single-wave') {
            // Single cosine wave - produces 3 dots in FFT (DC center + 2 sidebands)
            const freq = 10; // 10 cycles across image
            for (let y = 0; y < n; y++) {
                for (let x = 0; x < n; x++) {
                    // Pure cosine wave in X direction
                    const phase = 2 * Math.PI * freq * (x / n);
                    this.hologramData[y * n + x] = 0.5 + 0.5 * Math.cos(phase);
                }
            }
            console.log(`✓ Generated single cosine wave (${freq} cycles) - should show 3 dots in FFT`);
        } else if (patternType === 'stripes') {
            // Horizontal stripes (should produce vertical line in FFT)
            const freq = 10; // 10 cycles across image
            for (let y = 0; y < n; y++) {
                for (let x = 0; x < n; x++) {
                    const phase = 2 * Math.PI * freq * (x / n);
                    this.hologramData[y * n + x] = 0.5 + 0.5 * Math.cos(phase);
                }
            }
        } else if (patternType === 'checkerboard') {
            // Checkerboard
            const size = 8;
            for (let y = 0; y < n; y++) {
                for (let x = 0; x < n; x++) {
                    const checkX = Math.floor(x / size) % 2;
                    const checkY = Math.floor(y / size) % 2;
                    this.hologramData[y * n + x] = (checkX ^ checkY) ? 1.0 : 0.0;
                }
            }
        } else if (patternType === 'gradient') {
            // Simple gradient
            for (let y = 0; y < n; y++) {
                for (let x = 0; x < n; x++) {
                    this.hologramData[y * n + x] = x / n;
                }
            }
        } else if (patternType === 'gaussian') {
            // Gaussian blob (should produce Gaussian in FFT)
            const centerX = n / 2;
            const centerY = n / 2;
            const sigma = n / 8;
            for (let y = 0; y < n; y++) {
                for (let x = 0; x < n; x++) {
                    const dx = x - centerX;
                    const dy = y - centerY;
                    const r2 = dx * dx + dy * dy;
                    this.hologramData[y * n + x] = Math.exp(-r2 / (2 * sigma * sigma));
                }
            }
        }
        
        // Stats
        let minVal = Infinity;
        let maxVal = -Infinity;
        let sumVal = 0;
        for (let i = 0; i < n * n; i++) {
            if (this.hologramData[i] < minVal) minVal = this.hologramData[i];
            if (this.hologramData[i] > maxVal) maxVal = this.hologramData[i];
            sumVal += this.hologramData[i];
        }
        
        // //console.log('Test pattern stats:');
        // //console.log('  Min:', minVal);
        // //console.log('  Max:', maxVal);
        // //console.log('  Range:', maxVal - minVal);
        // //console.log('  Average:', sumVal / (n * n));
    }
    
    // Capture hologram from canvas
    captureHologram(gl, width, height) {
        // Read pixels from framebuffer
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        
        // Check what we actually captured (raw pixel values)
        // //console.log('Raw pixel sample (first 20 pixels, R channel only):');
        const sampleRow = [];
        for (let i = 0; i < Math.min(20, width); i++) {
            sampleRow.push(pixels[i * 4]); // R channel
        }
        //console.log('  First row:', sampleRow.join(', '));
        
        // Check for variation
        let minPx = 255;
        let maxPx = 0;
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            if (r < minPx) minPx = r;
            if (r > maxPx) maxPx = r;
        }
        //console.log('Raw pixels (bytes):');
        //console.log('  Min:', minPx, '  Max:', maxPx, '  Range:', maxPx - minPx);
        
        if (maxPx - minPx < 5) {
            console.error('⚠️ CAPTURED IMAGE HAS NO VARIATION!');
            console.error('All pixels are nearly identical. This suggests:');
            console.error('  1. Reading from wrong framebuffer');
            console.error('  2. Hologram not rendered yet');
            console.error('  3. Accumulation has smoothed out fringes');
        }
        
        // Downsample to FFT resolution and convert to grayscale
        // Use CENTER CROP to preserve aspect ratio and avoid distortion
        const minDim = Math.min(width, height);
        const cropX = Math.floor((width - minDim) / 2);
        const cropY = Math.floor((height - minDim) / 2);
        
        //console.log(`Downsampling: ${width}×${height} → ${this.size}×${this.size}`);
        //console.log(`  Center crop: [${cropX}, ${cropY}] size ${minDim}×${minDim}`);
        
        this.hologramData = new Float32Array(this.size * this.size);
        
        let minVal = 1;
        let maxVal = 0;
        let sumVal = 0;
        
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                // Sample from CENTER CROPPED region (to avoid distortion)
                const srcX = cropX + Math.floor((x / this.size) * minDim);
                const srcY = cropY + Math.floor((y / this.size) * minDim);
                const idx = (srcY * width + srcX) * 4;
                
                // Convert to grayscale (luminance)
                const gray = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / (3 * 255);
                this.hologramData[y * this.size + x] = gray;
                
                if (gray < minVal) minVal = gray;
                if (gray > maxVal) maxVal = gray;
                sumVal += gray;
            }
        }
        
        const range = maxVal - minVal;
        //console.log(`Captured ${this.size}x${this.size} hologram`);
        //console.log('Hologram intensity stats:');
        //console.log('  Min:', minVal);
        //console.log('  Max:', maxVal);
        //console.log('  Range:', range);
        //console.log('  Average:', sumVal / (this.size * this.size));
        
        if (range < 0.01) {
            console.error('⚠️ WARNING: Hologram has almost no variation! Range:', range);
            console.error('This will produce a uniform FFT (all grey).');
            console.error('Check if off-axis holography is rendering fringes correctly.');
        }
        
        // Sample values across the image
        const mid = Math.floor(this.size / 2);
        //console.log('  Sample values:');
        //console.log('    Top-left:', this.hologramData[0].toFixed(3));
        //console.log('    Top-right:', this.hologramData[this.size - 1].toFixed(3));
        //console.log('    Center:', this.hologramData[mid * this.size + mid].toFixed(3));
        //console.log('    Bottom-left:', this.hologramData[(this.size - 1) * this.size].toFixed(3));
        //console.log('    Bottom-right:', this.hologramData[this.size * this.size - 1].toFixed(3));
        
        // Show histogram of first row to see fringe pattern
        if (this.size >= 16) {
            const row = [];
            for (let x = 0; x < Math.min(16, this.size); x++) {
                row.push(this.hologramData[mid * this.size + x].toFixed(2));
            }
            //console.log('  First 16 pixels of middle row:', row.join(', '));
        }
    }

    // 1D FFT using Cooley-Tukey algorithm
    fft1D(real, imag, inverse = false) {
        const n = real.length;
        if (n <= 1) return;
        
        // Bit-reversal permutation
        const bitReverse = (x, bits) => {
            let result = 0;
            for (let i = 0; i < bits; i++) {
                result = (result << 1) | (x & 1);
                x >>= 1;
            }
            return result;
        };
        
        const bits = Math.log2(n);
        for (let i = 0; i < n; i++) {
            const j = bitReverse(i, bits);
            if (j > i) {
                [real[i], real[j]] = [real[j], real[i]];
                [imag[i], imag[j]] = [imag[j], imag[i]];
            }
        }
        
        // Cooley-Tukey decimation-in-time
        for (let size = 2; size <= n; size *= 2) {
            const halfSize = size / 2;
            const angleStep = (inverse ? 2 : -2) * Math.PI / size;
            
            for (let i = 0; i < n; i += size) {
                for (let j = 0; j < halfSize; j++) {
                    const angle = angleStep * j;
                    const cos = Math.cos(angle);
                    const sin = Math.sin(angle);
                    
                    const evenIdx = i + j;
                    const oddIdx = i + j + halfSize;
                    
                    const tReal = real[oddIdx] * cos - imag[oddIdx] * sin;
                    const tImag = real[oddIdx] * sin + imag[oddIdx] * cos;
                    
                    real[oddIdx] = real[evenIdx] - tReal;
                    imag[oddIdx] = imag[evenIdx] - tImag;
                    real[evenIdx] += tReal;
                    imag[evenIdx] += tImag;
                }
            }
        }
        
        // Normalize inverse transform
        if (inverse) {
            for (let i = 0; i < n; i++) {
                real[i] /= n;
                imag[i] /= n;
            }
        }
    }

    // 2D FFT (row-column algorithm)
    fft2D(inverse = false) {
        const n = this.size;
        
        if (!inverse) {
            // Forward FFT: hologram → frequency domain
            this.fftReal = new Float32Array(n * n);
            this.fftImag = new Float32Array(n * n);
            
            // Copy hologram data to real part
            for (let i = 0; i < n * n; i++) {
                this.fftReal[i] = this.hologramData[i];
                this.fftImag[i] = 0;
            }
        }
        
        // FFT rows
        const rowReal = new Float32Array(n);
        const rowImag = new Float32Array(n);
        
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                rowReal[x] = this.fftReal[y * n + x];
                rowImag[x] = this.fftImag[y * n + x];
            }
            
            this.fft1D(rowReal, rowImag, inverse);
            
            for (let x = 0; x < n; x++) {
                this.fftReal[y * n + x] = rowReal[x];
                this.fftImag[y * n + x] = rowImag[x];
            }
        }
        
        // FFT columns
        const colReal = new Float32Array(n);
        const colImag = new Float32Array(n);
        
        for (let x = 0; x < n; x++) {
            for (let y = 0; y < n; y++) {
                colReal[y] = this.fftReal[y * n + x];
                colImag[y] = this.fftImag[y * n + x];
            }
            
            this.fft1D(colReal, colImag, inverse);
            
            for (let y = 0; y < n; y++) {
                this.fftReal[y * n + x] = colReal[y];
                this.fftImag[y * n + x] = colImag[y];
            }
        }
        
        // DEBUG: Check if imaginary component exists immediately after FFT
        if (!inverse) {
            let maxReal = 0, maxImag = 0;
            for (let i = 0; i < n * n; i++) {
                maxReal = Math.max(maxReal, Math.abs(this.fftReal[i]));
                maxImag = Math.max(maxImag, Math.abs(this.fftImag[i]));
            }
            //console.log(`  FFT DEBUG: maxReal=${maxReal.toFixed(2)}, maxImag=${maxImag.toFixed(2)}`);
            
            // SNAPSHOT: Immediately copy FFT data for visualization
            this.fftRealSnapshot = new Float32Array(this.fftReal);
            this.fftImagSnapshot = new Float32Array(this.fftImag);
            //console.log(`  ✅ Created FFT snapshot (will NEVER be modified)`);
        }
        
        //console.log(`Computed ${inverse ? 'inverse' : 'forward'} 2D FFT`);
    }

    // Compute magnitude and phase for visualization
    computeMagnitudePhase() {
        const n = this.size;
        
        // RAW values (for reconstruction algorithms)
        this.fftMagnitudeRaw = new Float32Array(n * n);
        this.fftPhaseRaw = new Float32Array(n * n);
        
        // NORMALIZED values (for visualization only)
        this.fftMagnitude = new Float32Array(n * n);
        this.fftPhase = new Float32Array(n * n);
        
        let minMag = Infinity;
        let maxMag = 0;
        let sumMag = 0;
        
        // First pass: compute raw magnitude and collect stats
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const idx = y * n + x;
                
                const real = this.fftReal[idx];
                const imag = this.fftImag[idx];
                
                // Raw magnitude
                const mag = Math.sqrt(real * real + imag * imag);
                this.fftMagnitudeRaw[idx] = mag;
                
                // Raw phase
                this.fftPhaseRaw[idx] = Math.atan2(imag, real);
                
                // Stats
                if (mag > maxMag) maxMag = mag;
                if (mag < minMag) minMag = mag;
                sumMag += mag;
            }
        }
        
        //console.log('FFT Magnitude stats (raw):');
        //console.log('  Min:', minMag);
        //console.log('  Max:', maxMag);
        //console.log('  Average:', sumMag / (n * n));
        //console.log('  Range:', maxMag - minMag);
        
        // Check if we have actual variation
        if (maxMag < 1e-10) {
            console.error('FFT magnitude is essentially zero! Hologram might be blank.');
            for (let i = 0; i < n * n; i++) {
                this.fftMagnitude[i] = 0.5;
                this.fftPhase[i] = 0;
            }
            return;
        }
        
        // Apply log scale with offset (like Python: log(abs(F) + 0.01))
        // Then shift zero frequency to center (fftshift)
        let minMagLog = Infinity;
        let maxMagLog = -Infinity;
        
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const idx = y * n + x;
                
                // Shifted coordinates (fftshift)
                const shiftedY = (y + n / 2) % n;
                const shiftedX = (x + n / 2) % n;
                const shiftedIdx = shiftedY * n + shiftedX;
                
                // Log scale with small offset (matches Python: log(abs + 0.01))
                const magLog = Math.log(this.fftMagnitudeRaw[idx] + 0.01);
                this.fftMagnitude[shiftedIdx] = magLog;
                
                // Phase (just shift, no scaling)
                this.fftPhase[shiftedIdx] = this.fftPhaseRaw[idx];
                
                // Track log range
                if (magLog > maxMagLog) maxMagLog = magLog;
                if (magLog < minMagLog) minMagLog = magLog;
            }
        }
        
        //console.log('FFT Magnitude stats (after log with offset):');
        //console.log('  Min:', minMagLog);
        //console.log('  Max:', maxMagLog);
        //console.log('  Range:', maxMagLog - minMagLog);
        
        // PROPER MIN-MAX NORMALIZATION: scale range [min, max] to [0, 1]
        const range = maxMagLog - minMagLog;
        if (range > 1e-6) {
            for (let i = 0; i < n * n; i++) {
                this.fftMagnitude[i] = (this.fftMagnitude[i] - minMagLog) / range;
            }
            //console.log('✓ Normalized to [0, 1] with range:', range);
        } else {
            // If range is too small, something is wrong
            console.error('FFT magnitude range too small after log! Range:', range);
            console.error('This suggests all FFT values are nearly identical.');
            for (let i = 0; i < n * n; i++) {
                this.fftMagnitude[i] = 0.5;
            }
        }
        
        // Sample a few values to verify normalization
        //console.log('Sample FFT magnitude values (normalized 0-1):');
        //console.log('  Center:', this.fftMagnitude[n/2 * n + n/2]);
        //console.log('  Corner:', this.fftMagnitude[0]);
        //console.log('  Middle edge:', this.fftMagnitude[n/2 * n]);
        
        //console.log('Computed magnitude and phase (raw + normalized)');
    }

    // Filter and shift sideband to center
    filterSideband(carrierFreq) {
        const n = this.size;
        this.filteredReal = new Float32Array(n * n);
        this.filteredImag = new Float32Array(n * n);
        this.filteredMagnitude = new Float32Array(n * n); // For visualization
        
        //console.log('Filtering sideband with carrier freq:', carrierFreq);
        
        // DEBUG: Find actual sideband peak position
        let maxPeakMag = 0;
        let peakX = 0, peakY = 0;
        // Search in the region where we expect the sideband (excluding DC at origin)
        for (let y = 0; y < n/4; y++) {
            for (let x = 10; x < n/2; x++) { // Skip DC region (x < 10)
                const idx = y * n + x;
                const mag = Math.sqrt(this.fftReal[idx] * this.fftReal[idx] + this.fftImag[idx] * this.fftImag[idx]);
                if (mag > maxPeakMag) {
                    maxPeakMag = mag;
                    peakX = x;
                    peakY = y;
                }
            }
        }
        //console.log(`  🔍 ACTUAL sideband peak found at: (${peakX}, ${peakY}) with magnitude ${maxPeakMag.toFixed(2)}`);
        
        // USE THE ACTUAL DETECTED PEAK instead of theoretical calculation
        // The shader generates 2× the carrier freq because normalizedPos ranges from -1 to +1
        const sidebandX = peakX; // Use actual peak position
        const sidebandY = peakY; // Use actual peak position
        
        // Store for visualization
        this.detectedSidebandX = sidebandX;
        this.detectedSidebandY = sidebandY;
        
        //console.log(`  ✅ Using ACTUAL peak position: (${sidebandX}, ${sidebandY})`);
        
        // Use a RECTANGULAR filter - tall and narrow
        // Width: narrow around carrier frequency (X direction)
        // Height: full image (Y direction) to capture all vertical frequencies
        const filterWidth = Math.max(carrierFreq * 0.4, 20); // Narrow band in X
        const filterHeight = n; // Full height in Y
        
        //console.log(`  Sideband center position in FFT: (${sidebandX}, ${sidebandY})`);
        //console.log(`  Filter size: width=${filterWidth}, height=${filterHeight} (rectangular)`);
        
        let maxMag = 0;
        
        // Rectangular approach: Copy tall rectangle centered at sideband
        // Output (filteredReal/Imag): sideband will appear centered at (n/2, n/2)
        // Input (fftReal/Imag): sideband is at (sidebandX, sidebandY)
        
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                // Output pixel (x, y) - we want sideband centered here at (n/2, n/2)
                // So we need to read from input shifted by (sidebandX - n/2, sidebandY - n/2)
                
                const srcX = (x + sidebandX - n / 2 + n) % n;
                const srcY = (y + sidebandY - n / 2 + n) % n;
                const srcIdx = srcY * n + srcX;
                
                // Distance from center for rectangular filter
                const dx = Math.abs(x - n / 2);
                const dy = Math.abs(y - n / 2);
                
                // Rectangular filter with soft edges (Gaussian in X, full in Y)
                const weightX = Math.exp(-(dx * dx) / (2 * (filterWidth/2) * (filterWidth/2)));
                const weightY = 1.0; // No filtering in Y direction
                const weight = weightX * weightY;
                
                const dstIdx = y * n + x;
                this.filteredReal[dstIdx] = this.fftReal[srcIdx] * weight;
                this.filteredImag[dstIdx] = this.fftImag[srcIdx] * weight;
                
                const mag = Math.sqrt(
                    this.filteredReal[dstIdx] * this.filteredReal[dstIdx] +
                    this.filteredImag[dstIdx] * this.filteredImag[dstIdx]
                );
                this.filteredMagnitude[dstIdx] = mag;
                if (mag > maxMag) maxMag = mag;
            }
        }
        
        // Count non-zero filtered values
        let nonZeroCount = 0;
        let sumFiltered = 0;
        for (let i = 0; i < n * n; i++) {
            if (this.filteredMagnitude[i] > 0.01) nonZeroCount++;
            sumFiltered += this.filteredMagnitude[i];
        }
        
        // Check filtered data validity
        let maxFilteredReal = 0, maxFilteredImag = 0;
        for (let i = 0; i < n * n; i++) {
            maxFilteredReal = Math.max(maxFilteredReal, Math.abs(this.filteredReal[i]));
            maxFilteredImag = Math.max(maxFilteredImag, Math.abs(this.filteredImag[i]));
        }
        
        //console.log('Filtered sideband stats:');
        //console.log('  Max magnitude:', maxMag);
        //console.log('  Max real:', maxFilteredReal.toFixed(2), '  Max imag:', maxFilteredImag.toFixed(2));
        //console.log('  Non-zero pixels:', nonZeroCount, '/', n * n);
        //console.log('  Average magnitude:', sumFiltered / (n * n));
        
        // SNAPSHOT: Immediately copy filtered data for visualization
        this.filteredRealSnapshot = new Float32Array(this.filteredReal);
        this.filteredImagSnapshot = new Float32Array(this.filteredImag);
        //console.log('  ✅ Created filtered snapshot (will NEVER be modified)');
        
        // DEBUG: Sample filtered data at center
        const centerIdx = (n/2) * n + (n/2);
        //console.log(`  Filtered data at center: real=${this.filteredReal[centerIdx].toFixed(2)}, imag=${this.filteredImag[centerIdx].toFixed(2)}`);
        
        if (maxMag < 1e-10) {
            console.error('⚠️ Filtered magnitude is essentially zero!');
            console.error('The filter may be positioned incorrectly or FFT has no content there.');
        }
        
        // Normalize filtered magnitude for display
        if (maxMag > 0) {
            for (let i = 0; i < n * n; i++) {
                this.filteredMagnitude[i] = Math.log(1 + this.filteredMagnitude[i]) / Math.log(1 + maxMag);
            }
        }
    }
    
    // Compute inverse FFT and extract phase (depth)
    reconstructPhase() {
        const n = this.size;
        
        //console.log('Computing inverse FFT...');
        
        // CRITICAL: Save original FFT arrays BEFORE any modifications
        const originalFftReal = this.fftReal;
        const originalFftImag = this.fftImag;
        
        // Create NEW arrays for IFFT input (copy of filtered data)
        this.fftReal = new Float32Array(this.filteredReal);
        this.fftImag = new Float32Array(this.filteredImag);
        
        // Compute IFFT (modifies fftReal/fftImag in place)
        this.fft2D(true); // inverse = true
        
        // DEBUG: Check IFFT output
        let maxIfftReal = 0, maxIfftImag = 0;
        for (let i = 0; i < n * n; i++) {
            maxIfftReal = Math.max(maxIfftReal, Math.abs(this.fftReal[i]));
            maxIfftImag = Math.max(maxIfftImag, Math.abs(this.fftImag[i]));
        }
        //console.log(`  IFFT DEBUG: maxReal=${maxIfftReal.toFixed(6)}, maxImag=${maxIfftImag.toFixed(6)}`);
        
        // Save IFFT results to separate arrays
        this.ifftReal = this.fftReal;
        this.ifftImag = this.fftImag;
        
        // RESTORE original FFT arrays so visualization can see them!
        this.fftReal = originalFftReal;
        this.fftImag = originalFftImag;
        
        // DEBUG: Compute IFFT magnitude for visualization
        this.ifftMagnitude = new Float32Array(n * n);
        let maxIfftMag = 0;
        let minIfftMag = Infinity;
        for (let i = 0; i < n * n; i++) {
            const mag = Math.sqrt(this.ifftReal[i] * this.ifftReal[i] + this.ifftImag[i] * this.ifftImag[i]);
            this.ifftMagnitude[i] = mag;
            maxIfftMag = Math.max(maxIfftMag, mag);
            minIfftMag = Math.min(minIfftMag, mag);
        }
        // Normalize
        if (maxIfftMag > 0) {
            for (let i = 0; i < n * n; i++) {
                this.ifftMagnitude[i] /= maxIfftMag;
            }
        }
        //console.log(`  IFFT magnitude: min=${minIfftMag.toFixed(2)}, max=${maxIfftMag.toFixed(2)}, range=${(maxIfftMag-minIfftMag).toFixed(2)}`);
        
        // Sample center value
        const centerIdx = (n/2) * n + (n/2);
        //console.log(`  IFFT magnitude at center: ${this.ifftMagnitude[centerIdx].toFixed(4)}`);
        
        // Extract phase (this is the depth information!)
        // BUT: Only trust phase where magnitude is significant!
        this.reconstructedPhase = new Float32Array(n * n);
        let minPhase = Infinity;
        let maxPhase = -Infinity;
        
        // Compute magnitude threshold (e.g., 10% of max magnitude)
        const magnitudeThreshold = maxIfftMag * 0.1;
        console.log(`Phase masking: threshold=${magnitudeThreshold.toFixed(2)} (10% of max=${maxIfftMag.toFixed(2)})`);
        
        let maskedPixels = 0;
        for (let i = 0; i < n * n; i++) {
            const real = this.ifftReal[i];
            const imag = this.ifftImag[i];
            const mag = Math.sqrt(real * real + imag * imag);
            
            // Only extract phase where magnitude is above threshold
            if (mag > magnitudeThreshold) {
                const phase = Math.atan2(imag, real);
                this.reconstructedPhase[i] = phase;
                if (phase < minPhase) minPhase = phase;
                if (phase > maxPhase) maxPhase = phase;
            } else {
                // Low magnitude = unreliable phase, set to 0
                this.reconstructedPhase[i] = 0;
                maskedPixels++;
            }
        }
        
        console.log(`Masked ${maskedPixels}/${n*n} pixels (${(100*maskedPixels/(n*n)).toFixed(1)}%) due to low magnitude`);
        
        //console.log('Reconstructed phase (raw):');
        //console.log('  Min:', minPhase);
        //console.log('  Max:', maxPhase);
        //console.log('  Range:', maxPhase - minPhase);
        
        // Sample a few values to see distribution
        //console.log('  Sample values:');
        //console.log('    Center:', this.reconstructedPhase[n/2 * n + n/2].toFixed(4));
        //console.log('    Corner:', this.reconstructedPhase[0].toFixed(4));
        //console.log('    Edge:', this.reconstructedPhase[n/2].toFixed(4));
        
        // Normalize for display (phase wraps from -π to +π)
        for (let i = 0; i < n * n; i++) {
            this.reconstructedPhase[i] = (this.reconstructedPhase[i] + Math.PI) / (2 * Math.PI);
        }
        
        //console.log('Reconstruction complete!');
    }
    
    // Simple phase unwrapping (row-by-row)
    unwrapPhase() {
        const n = this.size;
        const unwrapped = new Float32Array(n * n);
        
        // Copy first pixel
        unwrapped[0] = this.reconstructedPhase[0];
        
        // Unwrap each row
        for (let y = 0; y < n; y++) {
            // First pixel of row
            if (y === 0) {
                unwrapped[0] = this.reconstructedPhase[0];
            } else {
                // Connect to previous row
                const idx = y * n;
                const prevIdx = (y - 1) * n;
                let diff = this.reconstructedPhase[idx] - unwrapped[prevIdx];
                if (diff > 0.5) diff -= 1.0;
                if (diff < -0.5) diff += 1.0;
                unwrapped[idx] = unwrapped[prevIdx] + diff;
            }
            
            // Unwrap along row
            for (let x = 1; x < n; x++) {
                const idx = y * n + x;
                const prevIdx = y * n + (x - 1);
                let diff = this.reconstructedPhase[idx] - unwrapped[prevIdx];
                
                // Detect wrapping (phase jump > 0.5 in normalized [0,1] range)
                if (diff > 0.5) diff -= 1.0;
                if (diff < -0.5) diff += 1.0;
                
                unwrapped[idx] = unwrapped[prevIdx] + diff;
            }
        }
        
        // Normalize to [0, 1] for visualization
        let minPhase = Infinity, maxPhase = -Infinity;
        for (let i = 0; i < n * n; i++) {
            if (unwrapped[i] < minPhase) minPhase = unwrapped[i];
            if (unwrapped[i] > maxPhase) maxPhase = unwrapped[i];
        }
        
        const range = maxPhase - minPhase;
        if (range > 0) {
            for (let i = 0; i < n * n; i++) {
                unwrapped[i] = (unwrapped[i] - minPhase) / range;
            }
        }
        
        this.unwrappedPhase = unwrapped;
        console.log(`Phase unwrapped: range ${minPhase.toFixed(3)} to ${maxPhase.toFixed(3)}`);
    }
    
    // OLD filterSideband code below (keeping structure)
    _oldFilterSideband(carrierFreq) {
        const n = this.size;
        this.filteredReal = new Float32Array(n * n);
        this.filteredImag = new Float32Array(n * n);
        
        // Filter parameters
        const centerX = n / 2 + (carrierFreq / 100.0) * n / 2; // Right sideband position
        const centerY = n / 2;
        const radius = n / 8; // Filter radius
        
        // Apply bandpass filter around right sideband
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const idx = y * n + x;
                
                // Distance from sideband center
                const dx = x - centerX;
                const dy = y - centerY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // Gaussian filter
                const weight = Math.exp(-(dist * dist) / (2 * radius * radius));
                
                // Apply filter
                this.filteredReal[idx] = this.fftReal[idx] * weight;
                this.filteredImag[idx] = this.fftImag[idx] * weight;
            }
        }
        
        // Shift to center (multiply by phase ramp)
        const shiftX = centerX - n / 2;
        const shiftY = centerY - n / 2;
        
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const idx = y * n + x;
                
                // Phase shift
                const phase = -2 * Math.PI * (shiftX * x / n + shiftY * y / n);
                const cos = Math.cos(phase);
                const sin = Math.sin(phase);
                
                const real = this.filteredReal[idx];
                const imag = this.filteredImag[idx];
                
                this.filteredReal[idx] = real * cos - imag * sin;
                this.filteredImag[idx] = real * sin + imag * cos;
            }
        }
        
        // //console.log('Filtered and shifted sideband');
    }

    // Full processing pipeline
    async processHologram(carrierFreq, progressCallback = null) {
        // //console.log('Starting FFT processing pipeline...');
        
        if (progressCallback) progressCallback('Computing FFT...', 0);
        await this.delay(10);
        this.fft2D(false);
        
        if (progressCallback) progressCallback('Computing magnitude and phase...', 33);
        await this.delay(10);
        this.computeMagnitudePhase();
        
        if (progressCallback) progressCallback('Filtering sideband...', 66);
        await this.delay(10);
        this.filterSideband(carrierFreq);
        
        if (progressCallback) progressCallback('Reconstructing phase...', 90);
        await this.delay(10);
        this.reconstructPhase();
        
        if (progressCallback) progressCallback('Complete!', 100);
        // //console.log('FFT processing complete!');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
