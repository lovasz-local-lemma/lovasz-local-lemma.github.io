class FourierVisualizer {
    constructor() {
        this.canvas = document.getElementById('epicycles-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        
        // State
        this.numCircles = 10;
        this.speed = 1;
        this.time = 0;
        this.isPlaying = true;
        this.transformType = 'fourier';
        this.drawingMode = 'preset';
        this.currentPreset = 'circle';
        
        // STFT specific
        this.windowSize = 0.3; // Window size as fraction of total signal
        this.stftWindow = []; // Current windowed segment
        this.stftRingBuffer = []; // Ring buffer for continuous drawing
        this.stftMaxBufferSize = 2000; // Maximum points to keep (increased for longer windows)
        this.previousDrawingMode = 'preset'; // Remember mode before STFT
        this.stftPointTimestamps = []; // Track timestamp of each point in ring buffer
        this.stftLastDrawTime = Date.now(); // Track when last point was added
        this.stftStationary = false; // Whether we're currently stationary
        this.stftWindowDuration = 2000; // Window duration in milliseconds (2 seconds)
        this.stftLastPosition = null; // Last drawn position for clamping
        this.stftClampInterval = null; // Interval for adding clamped position
        
        // Drawing
        this.path = [];
        this.drawnPath = [];
        this.isDrawing = false;
        
        // Fourier coefficients
        this.fourierCoeffs = [];
        
        // Initialize
        this.loadPresetCurve('circle');
        this.setupControls();
        this.setupDrawing();
        this.animate();
        
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
    }
    
    setupControls() {
        // Number of circles
        document.getElementById('num-circles').addEventListener('input', (e) => {
            this.numCircles = parseInt(e.target.value);
            document.getElementById('circles-value').textContent = this.numCircles;
            // Reset path when changing circle count to avoid chaos
            this.time = 0;
            this.path = [];
            this.computeTransform();
        });
        
        // Speed
        document.getElementById('speed').addEventListener('input', (e) => {
            this.speed = parseFloat(e.target.value);
            document.getElementById('speed-value').textContent = this.speed.toFixed(1) + 'x';
        });
        
        // STFT window size
        document.getElementById('stft-window-size').addEventListener('input', (e) => {
            this.stftWindowDuration = parseInt(e.target.value);
            const seconds = (this.stftWindowDuration / 1000).toFixed(1);
            document.getElementById('stft-window-value').textContent = seconds + 's';
        });
        
        // Transform type
        document.getElementById('transform-type').addEventListener('change', (e) => {
            const oldType = this.transformType;
            this.transformType = e.target.value;
            this.time = 0;
            this.path = [];
            
            // STFT requires draw mode
            if (this.transformType === 'stft') {
                this.previousDrawingMode = this.drawingMode;
                if (this.drawingMode !== 'draw') {
                    this.drawingMode = 'draw';
                    document.getElementById('drawing-mode').value = 'draw';
                    document.getElementById('preset-group').style.display = 'none';
                    document.getElementById('clear-draw').style.display = 'block';
                    this.drawnPath = [];
                    this.stftRingBuffer = [];
                    this.stftPointTimestamps = [];
                }
                // Disable drawing mode dropdown in STFT
                document.getElementById('drawing-mode').disabled = true;
                document.getElementById('drawing-mode').style.opacity = '0.5';
                document.getElementById('drawing-mode').style.cursor = 'not-allowed';
                // Show STFT window size control
                document.getElementById('stft-window-control').style.display = 'block';
            } else if (oldType === 'stft') {
                // Restore previous mode when leaving STFT
                this.drawingMode = this.previousDrawingMode;
                document.getElementById('drawing-mode').value = this.previousDrawingMode;
                document.getElementById('drawing-mode').disabled = false;
                document.getElementById('drawing-mode').style.opacity = '1';
                document.getElementById('drawing-mode').style.cursor = 'pointer';
                // Hide STFT window size control
                document.getElementById('stft-window-control').style.display = 'none';
                if (this.previousDrawingMode === 'preset') {
                    document.getElementById('preset-group').style.display = 'block';
                    document.getElementById('clear-draw').style.display = 'none';
                    this.loadPresetCurve(this.currentPreset);
                }
            }
            
            this.computeTransform();
        });
        
        // Drawing mode
        document.getElementById('drawing-mode').addEventListener('change', (e) => {
            this.drawingMode = e.target.value;
            const presetGroup = document.getElementById('preset-group');
            const clearBtn = document.getElementById('clear-draw');
            
            if (this.drawingMode === 'draw') {
                presetGroup.style.display = 'none';
                clearBtn.style.display = 'block';
                this.drawnPath = [];
            } else {
                presetGroup.style.display = 'block';
                clearBtn.style.display = 'none';
                this.loadPresetCurve(this.currentPreset);
            }
        });
        
        // Preset curve
        document.getElementById('preset-curve').addEventListener('change', (e) => {
            this.currentPreset = e.target.value;
            this.loadPresetCurve(this.currentPreset);
        });
        
        // Play/Pause
        document.getElementById('play-pause').addEventListener('click', () => {
            this.isPlaying = !this.isPlaying;
            document.getElementById('play-pause').textContent = this.isPlaying ? '⏸ Pause' : '▶ Play';
        });
        
        // Reset
        document.getElementById('reset').addEventListener('click', () => {
            this.time = 0;
            this.path = [];
        });
        
        // Clear drawing
        document.getElementById('clear-draw').addEventListener('click', () => {
            this.stopSTFTClamping();
            this.drawnPath = [];
            this.path = [];
            this.stftRingBuffer = [];
            this.stftPointTimestamps = [];
            this.stftLastPosition = null;
            this.fourierCoeffs = [];
            this.computeTransform();
        });
    }
    
    setupDrawing() {
        let drawing = false;
        
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.drawingMode === 'draw') {
                drawing = true;
                if (this.transformType !== 'stft') {
                    // For non-STFT, clear on new draw
                    this.drawnPath = [];
                    this.path = [];
                }
                const rect = this.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left - this.centerX;
                const y = e.clientY - rect.top - this.centerY;
                
                if (this.transformType === 'stft') {
                    // Stop clamping when new drawing starts
                    this.stopSTFTClamping();
                    // Add to ring buffer
                    const now = Date.now();
                    this.stftRingBuffer.push({ x, y });
                    this.stftPointTimestamps.push(now);
                    this.stftLastDrawTime = now;
                    this.stftLastPosition = { x, y };
                    if (this.stftRingBuffer.length > this.stftMaxBufferSize) {
                        this.stftRingBuffer.shift();
                        this.stftPointTimestamps.shift();
                    }
                } else {
                    this.drawnPath.push({ x, y });
                }
            }
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (drawing && this.drawingMode === 'draw') {
                const rect = this.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left - this.centerX;
                const y = e.clientY - rect.top - this.centerY;
                
                if (this.transformType === 'stft') {
                    const now = Date.now();
                    this.stftRingBuffer.push({ x, y });
                    this.stftPointTimestamps.push(now);
                    this.stftLastDrawTime = now;
                    this.stftLastPosition = { x, y };
                    if (this.stftRingBuffer.length > this.stftMaxBufferSize) {
                        this.stftRingBuffer.shift();
                        this.stftPointTimestamps.shift();
                    }
                } else {
                    this.drawnPath.push({ x, y });
                }
            }
        });
        
        this.canvas.addEventListener('mouseup', () => {
            if (drawing) {
                drawing = false;
                if (this.transformType === 'stft') {
                    // STFT: start clamping behavior - keep adding last position
                    if (this.stftRingBuffer.length > 10) {
                        this.computeTransform();
                        this.startSTFTClamping();
                    }
                } else {
                    if (this.drawnPath.length > 10) {
                        this.computeTransform();
                        this.time = 0;
                    }
                }
            }
        });
        
        // Touch support
        this.canvas.addEventListener('touchstart', (e) => {
            if (this.drawingMode === 'draw') {
                e.preventDefault();
                drawing = true;
                if (this.transformType !== 'stft') {
                    this.drawnPath = [];
                    this.path = [];
                }
                const rect = this.canvas.getBoundingClientRect();
                const x = e.touches[0].clientX - rect.left - this.centerX;
                const y = e.touches[0].clientY - rect.top - this.centerY;
                
                if (this.transformType === 'stft') {
                    this.stopSTFTClamping();
                    const now = Date.now();
                    this.stftRingBuffer.push({ x, y });
                    this.stftPointTimestamps.push(now);
                    this.stftLastDrawTime = now;
                    this.stftLastPosition = { x, y };
                    if (this.stftRingBuffer.length > this.stftMaxBufferSize) {
                        this.stftRingBuffer.shift();
                        this.stftPointTimestamps.shift();
                    }
                } else {
                    this.drawnPath.push({ x, y });
                }
            }
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            if (drawing && this.drawingMode === 'draw') {
                e.preventDefault();
                const rect = this.canvas.getBoundingClientRect();
                const x = e.touches[0].clientX - rect.left - this.centerX;
                const y = e.touches[0].clientY - rect.top - this.centerY;
                
                if (this.transformType === 'stft') {
                    const now = Date.now();
                    this.stftRingBuffer.push({ x, y });
                    this.stftPointTimestamps.push(now);
                    this.stftLastDrawTime = now;
                    this.stftLastPosition = { x, y };
                    if (this.stftRingBuffer.length > this.stftMaxBufferSize) {
                        this.stftRingBuffer.shift();
                        this.stftPointTimestamps.shift();
                    }
                } else {
                    this.drawnPath.push({ x, y });
                }
            }
        });
        
        this.canvas.addEventListener('touchend', () => {
            if (drawing) {
                drawing = false;
                if (this.transformType === 'stft') {
                    if (this.stftRingBuffer.length > 10) {
                        this.computeTransform();
                        this.startSTFTClamping();
                    }
                } else {
                    if (this.drawnPath.length > 10) {
                        this.computeTransform();
                        this.time = 0;
                    }
                }
            }
        });
    }
    
    startSTFTClamping() {
        // Stop any existing clamping
        this.stopSTFTClamping();
        
        if (!this.stftLastPosition) return;
        
        // Add the last position repeatedly at ~60fps to simulate staying at that point
        this.stftClampInterval = setInterval(() => {
            if (this.transformType !== 'stft' || !this.stftLastPosition) {
                this.stopSTFTClamping();
                return;
            }
            
            const now = Date.now();
            this.stftRingBuffer.push({ ...this.stftLastPosition });
            this.stftPointTimestamps.push(now);
            // Don't update stftLastDrawTime during clamping - let glow detect stationary state
            
            if (this.stftRingBuffer.length > this.stftMaxBufferSize) {
                this.stftRingBuffer.shift();
                this.stftPointTimestamps.shift();
            }
        }, 16); // ~60fps
    }
    
    stopSTFTClamping() {
        if (this.stftClampInterval) {
            clearInterval(this.stftClampInterval);
            this.stftClampInterval = null;
        }
    }
    
    loadPresetCurve(preset) {
        const numPoints = 200;
        this.drawnPath = [];
        
        for (let i = 0; i < numPoints; i++) {
            const t = (i / numPoints) * 2 * Math.PI;
            let x, y;
            
            switch(preset) {
                case 'circle':
                    x = 100 * Math.cos(t);
                    y = 100 * Math.sin(t);
                    break;
                case 'heart':
                    x = 100 * 16 * Math.pow(Math.sin(t), 3) / 16;
                    y = -100 * (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) / 16;
                    break;
                case 'star':
                    const r = 100 * (1 + 0.5 * Math.cos(5 * t));
                    x = r * Math.cos(t);
                    y = r * Math.sin(t);
                    break;
                case 'spiral':
                    const radius = 50 + 50 * (t / (2 * Math.PI));
                    x = radius * Math.cos(t);
                    y = radius * Math.sin(t);
                    break;
                case 'infinity':
                    const scale = 80;
                    x = scale * Math.cos(t) / (1 + Math.sin(t) * Math.sin(t));
                    y = scale * Math.sin(t) * Math.cos(t) / (1 + Math.sin(t) * Math.sin(t));
                    break;
                case 'trefoil':
                    x = 80 * Math.cos(t) * (1 + Math.cos(3*t));
                    y = 80 * Math.sin(t) * (1 + Math.cos(3*t));
                    break;
            }
            
            this.drawnPath.push({ x, y });
        }
        
        this.computeTransform();
        this.time = 0;
        this.path = [];
    }
    
    computeTransform() {
        if (this.drawnPath.length === 0) return;
        
        switch(this.transformType) {
            case 'fourier':
                this.computeDFT();
                break;
            case 'dct':
                this.computeDCT();
                break;
            case 'wavelet':
                this.computeWavelet();
                break;
            case 'polynomial':
                this.computePolynomial();
                break;
            case 'stft':
                this.computeSTFT();
                break;
            case 'hht':
                this.computeHHT();
                break;
        }
    }
    
    computeDFT() {
        const N = this.drawnPath.length;
        this.fourierCoeffs = [];
        
        // Compute DFT
        for (let k = -this.numCircles; k <= this.numCircles; k++) {
            let re = 0;
            let im = 0;
            
            for (let n = 0; n < N; n++) {
                const phi = (2 * Math.PI * k * n) / N;
                const x = this.drawnPath[n].x;
                const y = this.drawnPath[n].y;
                
                re += x * Math.cos(phi) + y * Math.sin(phi);
                im += y * Math.cos(phi) - x * Math.sin(phi);
            }
            
            re /= N;
            im /= N;
            
            const freq = k;
            const amp = Math.sqrt(re * re + im * im);
            const phase = Math.atan2(im, re);
            
            this.fourierCoeffs.push({ freq, amp, phase, re, im });
        }
        
        // Sort by amplitude (largest first for better visualization)
        this.fourierCoeffs.sort((a, b) => b.amp - a.amp);
    }
    
    computeDCT() {
        const N = this.drawnPath.length;
        this.fourierCoeffs = [];
        
        // Compute DFT first, then convert using DCT relationship
        // DCT can be computed via DFT by extending signal symmetrically
        const extended = [];
        
        // Mirror the signal for DCT via DFT
        for (let i = 0; i < N; i++) {
            extended.push(this.drawnPath[i]);
        }
        for (let i = N - 1; i >= 0; i--) {
            extended.push(this.drawnPath[i]);
        }
        
        const M = extended.length;
        
        // Compute DFT on extended signal
        for (let k = -this.numCircles; k <= this.numCircles; k++) {
            let re = 0;
            let im = 0;
            
            for (let n = 0; n < M; n++) {
                const phi = (2 * Math.PI * k * n) / M;
                const x = extended[n].x;
                const y = extended[n].y;
                
                re += x * Math.cos(phi) + y * Math.sin(phi);
                im += y * Math.cos(phi) - x * Math.sin(phi);
            }
            
            re /= M;
            im /= M;
            
            const freq = k;
            const amp = Math.sqrt(re * re + im * im);
            const phase = Math.atan2(im, re);
            
            this.fourierCoeffs.push({ freq, amp, phase, re, im });
        }
        
        this.fourierCoeffs.sort((a, b) => b.amp - a.amp);
    }
    
    computeWavelet() {
        // Wavelet removed - not suitable for epicycles
        this.computeDFT();
    }
    
    computeSTFT() {
        // STFT operates on ring buffer with temporal windowing
        if (this.stftRingBuffer.length === 0) {
            this.fourierCoeffs = [];
            this.stftWindow = [];
            return;
        }
        
        const now = Date.now();
        const windowStartTime = now - this.stftWindowDuration;
        const timeSinceLastDraw = now - this.stftLastDrawTime;
        const isActivelyDrawing = timeSinceLastDraw < 200;
        
        // Filter points within temporal window
        this.stftWindow = [];
        const windowed = [];
        const windowedIndices = [];
        
        for (let i = 0; i < this.stftRingBuffer.length; i++) {
            if (this.stftPointTimestamps[i] >= windowStartTime) {
                windowedIndices.push(i);
                this.stftWindow.push(this.stftRingBuffer[i]);
            }
        }
        
        if (this.stftWindow.length < 2) {
            this.fourierCoeffs = [];
            return;
        }
        
        const M = this.stftWindow.length;
        let totalWeight = 0;
        
        // Apply windowing
        for (let i = 0; i < M; i++) {
            const idx = windowedIndices[i];
            const age = now - this.stftPointTimestamps[idx];
            
            // During active drawing: use Hann window for smooth transitions
            // When stationary: use rectangular window to preserve endpoint
            let weight;
            if (isActivelyDrawing) {
                // Hann window for smooth spectral characteristics
                const n = i;
                weight = 0.5 * (1 - Math.cos(2 * Math.PI * n / M));
            } else {
                // Rectangular window when stationary to preserve full amplitude at endpoint
                // But apply temporal decay for visualization
                weight = 1.0;
            }
            
            totalWeight += weight;
            
            windowed.push({
                x: this.stftWindow[i].x * weight,
                y: this.stftWindow[i].y * weight
            });
        }
        
        // Compute DFT on windowed segment
        this.fourierCoeffs = [];
        
        for (let k = -this.numCircles; k <= this.numCircles; k++) {
            let re = 0;
            let im = 0;
            
            for (let n = 0; n < M; n++) {
                const phi = (2 * Math.PI * k * n) / M;
                const x = windowed[n].x;
                const y = windowed[n].y;
                
                re += x * Math.cos(phi) + y * Math.sin(phi);
                im += y * Math.cos(phi) - x * Math.sin(phi);
            }
            
            // Standard DFT normalization
            re /= M;
            im /= M;
            
            const freq = k;
            const amp = Math.sqrt(re * re + im * im);
            const phase = Math.atan2(im, re);
            
            this.fourierCoeffs.push({ freq, amp, phase, re, im });
        }
        
        this.fourierCoeffs.sort((a, b) => b.amp - a.amp);
    }
    
    computeHHT() {
        // HHT via simplified EMD - but EMD is complex, so use simpler adaptive approach
        // Extract dominant oscillatory modes by iterative frequency filtering
        const N = this.drawnPath.length;
        
        // Just do DFT but group coefficients by similar frequencies (simplified "modes")
        this.fourierCoeffs = [];
        
        // First compute all DFT coefficients
        const allCoeffs = [];
        for (let k = -this.numCircles * 2; k <= this.numCircles * 2; k++) {
            let re = 0;
            let im = 0;
            
            for (let n = 0; n < N; n++) {
                const phi = (2 * Math.PI * k * n) / N;
                const x = this.drawnPath[n].x;
                const y = this.drawnPath[n].y;
                
                re += x * Math.cos(phi) + y * Math.sin(phi);
                im += y * Math.cos(phi) - x * Math.sin(phi);
            }
            
            re /= N;
            im /= N;
            
            const amp = Math.sqrt(re * re + im * im);
            allCoeffs.push({ freq: k, amp, phase: Math.atan2(im, re), re, im });
        }
        
        // Sort by amplitude and take top ones (this is the "adaptive" part)
        allCoeffs.sort((a, b) => b.amp - a.amp);
        this.fourierCoeffs = allCoeffs.slice(0, this.numCircles * 2 + 1);
        
        // Re-sort by frequency for visualization
        this.fourierCoeffs.sort((a, b) => b.amp - a.amp);
    }
    
    // EMD helper functions removed - HHT now uses simplified adaptive approach
    
    computePolynomial() {
        // Taylor/Power series approximation
        // Fit x(t) and y(t) as polynomials, then sample to create epicycles
        const N = this.drawnPath.length;
        this.fourierCoeffs = [];
        
        // Fit polynomial coefficients using least squares
        const degree = Math.min(this.numCircles, 20);
        
        // Build Vandermonde matrix and fit
        const coeffsX = this.fitPolynomial(this.drawnPath.map(p => p.x), degree);
        const coeffsY = this.fitPolynomial(this.drawnPath.map(p => p.y), degree);
        
        // Sample the polynomial at N points to reconstruct path
        const reconstructed = [];
        for (let i = 0; i < N; i++) {
            const t = i / N;
            let x = 0, y = 0;
            for (let d = 0; d <= degree; d++) {
                const pow = Math.pow(t, d);
                x += coeffsX[d] * pow;
                y += coeffsY[d] * pow;
            }
            reconstructed.push({ x, y });
        }
        
        // Now compute DFT of the polynomial reconstruction
        for (let k = -this.numCircles; k <= this.numCircles; k++) {
            let re = 0;
            let im = 0;
            
            for (let n = 0; n < N; n++) {
                const phi = (2 * Math.PI * k * n) / N;
                const x = reconstructed[n].x;
                const y = reconstructed[n].y;
                
                re += x * Math.cos(phi) + y * Math.sin(phi);
                im += y * Math.cos(phi) - x * Math.sin(phi);
            }
            
            re /= N;
            im /= N;
            
            const freq = k;
            const amp = Math.sqrt(re * re + im * im);
            const phase = Math.atan2(im, re);
            
            this.fourierCoeffs.push({ freq, amp, phase, re, im });
        }
        
        this.fourierCoeffs.sort((a, b) => b.amp - a.amp);
    }
    
    fitPolynomial(values, degree) {
        // Simple polynomial fitting using normal equations
        const N = values.length;
        const coeffs = new Array(degree + 1).fill(0);
        
        // Use least squares to fit polynomial
        // Simplified approach: use moments
        for (let d = 0; d <= degree; d++) {
            let sum = 0;
            for (let i = 0; i < N; i++) {
                const t = i / N;
                sum += values[i] * Math.pow(t, d);
            }
            coeffs[d] = sum / N;
        }
        
        return coeffs;
    }
    
    drawEpicycles() {
        let x = this.centerX;
        let y = this.centerY;
        
        const coeffsToUse = this.fourierCoeffs.slice(0, this.numCircles);
        
        for (let i = 0; i < coeffsToUse.length; i++) {
            const coeff = coeffsToUse[i];
            const radius = coeff.amp;
            const freq = coeff.freq;
            const phase = coeff.phase;
            
            const angle = freq * this.time + phase;
            
            // Draw circle
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
            this.ctx.strokeStyle = `rgba(212, 175, 55, ${0.3 - i * 0.003})`;
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
            
            // Draw radius line
            const nextX = x + radius * Math.cos(angle);
            const nextY = y + radius * Math.sin(angle);
            
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(nextX, nextY);
            this.ctx.strokeStyle = `rgba(244, 208, 63, ${0.6 - i * 0.005})`;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // Draw point at end
            this.ctx.beginPath();
            this.ctx.arc(nextX, nextY, 3, 0, 2 * Math.PI);
            this.ctx.fillStyle = '#F4D03F';
            this.ctx.fill();
            
            x = nextX;
            y = nextY;
        }
        
        // Add current point to path
        this.path.unshift({ x: x - this.centerX, y: y - this.centerY });
        if (this.path.length > 500) {
            this.path.pop();
        }
        
        return { x, y };
    }
    
    drawPath() {
        if (this.path.length < 2) return;
        
        this.ctx.beginPath();
        this.ctx.moveTo(
            this.path[0].x + this.centerX, 
            this.path[0].y + this.centerY
        );
        
        for (let i = 1; i < this.path.length; i++) {
            const alpha = 1 - i / this.path.length;
            this.ctx.lineTo(
                this.path[i].x + this.centerX, 
                this.path[i].y + this.centerY
            );
        }
        
        this.ctx.strokeStyle = '#4A9EFF';
        this.ctx.lineWidth = 3;
        this.ctx.shadowColor = '#4A9EFF';
        this.ctx.shadowBlur = 10;
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }
    
    drawOriginalCurve() {
        // For STFT, draw ring buffer with temporal age-based fading
        if (this.transformType === 'stft' && this.stftRingBuffer.length > 0) {
            const now = Date.now();
            const windowStartTime = now - this.stftWindowDuration;
            
            for (let i = 1; i < this.stftRingBuffer.length; i++) {
                this.ctx.beginPath();
                this.ctx.moveTo(
                    this.stftRingBuffer[i-1].x + this.centerX,
                    this.stftRingBuffer[i-1].y + this.centerY
                );
                this.ctx.lineTo(
                    this.stftRingBuffer[i].x + this.centerX,
                    this.stftRingBuffer[i].y + this.centerY
                );
                
                const timestamp = this.stftPointTimestamps[i];
                const age = now - timestamp;
                
                // Points in temporal window are green with temporal fade
                if (timestamp >= windowStartTime) {
                    const temporalProgress = 1 - (age / this.stftWindowDuration);
                    const alpha = 0.2 + 0.7 * temporalProgress; // Fade from 0.2 to 0.9
                    this.ctx.strokeStyle = `rgba(76, 175, 80, ${alpha})`;
                    this.ctx.lineWidth = 1 + temporalProgress * 1.5;
                } else {
                    // Old points fade to gray rapidly
                    const beyondWindow = age - this.stftWindowDuration;
                    const fadeTime = 1000; // Fade out over 1 second
                    const alpha = Math.max(0.05, 0.15 * (1 - Math.min(beyondWindow / fadeTime, 1)));
                    this.ctx.strokeStyle = `rgba(150, 150, 150, ${alpha})`;
                    this.ctx.lineWidth = 0.5;
                }
                this.ctx.stroke();
            }
            return;
        }
        
        // Regular drawing for other modes
        if (this.drawnPath.length === 0) return;
        
        this.ctx.beginPath();
        this.ctx.moveTo(
            this.drawnPath[0].x + this.centerX,
            this.drawnPath[0].y + this.centerY
        );
        
        for (let i = 1; i < this.drawnPath.length; i++) {
            this.ctx.lineTo(
                this.drawnPath[i].x + this.centerX,
                this.drawnPath[i].y + this.centerY
            );
        }
        
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
    }
    
    drawSTFTWindow() {
        if (this.stftWindow.length === 0) return;
        
        // Check if stationary (no new points in last 200ms)
        const now = Date.now();
        const timeSinceLastDraw = now - this.stftLastDrawTime;
        this.stftStationary = timeSinceLastDraw > 200;
        
        // If stationary, add intensifying glow effect at the last point
        if (this.stftStationary && this.stftRingBuffer.length > 0) {
            const lastPoint = this.stftRingBuffer[this.stftRingBuffer.length - 1];
            
            // Intensity grows over time when stationary (accumulating importance)
            const stationaryDuration = Math.min(timeSinceLastDraw / 1000, 3); // Cap at 3 seconds
            const baseIntensity = 0.3 + 0.4 * (stationaryDuration / 3); // Grows from 0.3 to 0.7
            const pulseIntensity = baseIntensity + 0.3 * Math.sin(now / 150); // Pulse on top
            
            // Draw multiple glow circles that grow with time
            const numRings = Math.floor(3 + stationaryDuration * 2); // More rings over time
            for (let r = 1; r <= numRings; r++) {
                this.ctx.beginPath();
                this.ctx.arc(
                    lastPoint.x + this.centerX,
                    lastPoint.y + this.centerY,
                    3 * r + stationaryDuration * 5,
                    0,
                    2 * Math.PI
                );
                this.ctx.strokeStyle = `rgba(76, 175, 80, ${pulseIntensity / r})`;
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }
            
            // Center dot that pulses brighter over time
            this.ctx.beginPath();
            this.ctx.arc(
                lastPoint.x + this.centerX,
                lastPoint.y + this.centerY,
                2 + stationaryDuration,
                0,
                2 * Math.PI
            );
            this.ctx.fillStyle = `rgba(76, 175, 80, ${Math.min(pulseIntensity + 0.3, 1)})`;
            this.ctx.fill();
            
            // Add outer glow
            this.ctx.shadowColor = 'rgba(76, 175, 80, 0.8)';
            this.ctx.shadowBlur = 10 + stationaryDuration * 10;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }
    }
    
    animate() {
        // Clear canvas
        this.ctx.fillStyle = '#0A0A0A';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw original curve faintly
        this.drawOriginalCurve();
        
        // For STFT, recompute on each frame to update window
        if (this.transformType === 'stft') {
            this.computeSTFT();
            // Draw the current window segment in green
            this.drawSTFTWindow();
        }
        
        // Draw epicycles and get final point
        if (this.fourierCoeffs.length > 0) {
            const finalPoint = this.drawEpicycles();
            
            // Draw connection line to path
            if (this.path.length > 0) {
                this.ctx.beginPath();
                this.ctx.moveTo(finalPoint.x, finalPoint.y);
                this.ctx.lineTo(
                    this.path[0].x + this.centerX,
                    this.path[0].y + this.centerY
                );
                this.ctx.strokeStyle = 'rgba(74, 158, 255, 0.5)';
                this.ctx.lineWidth = 1;
                this.ctx.setLineDash([5, 5]);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }
        }
        
        // Draw traced path (blue reconstruction)
        this.drawPath();
        
        // Update time
        if (this.isPlaying) {
            const dt = 0.01 * this.speed;
            this.time += dt;
            
            // Reset after one period (except for STFT which is continuous)
            if (this.transformType !== 'stft' && this.time > 2 * Math.PI) {
                this.time = 0;
                this.path = [];
            }
        }
        
        requestAnimationFrame(() => this.animate());
    }
}

// Particle background
class ParticleBackground {
    constructor() {
        this.canvas = document.getElementById('particles');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.resize();
        
        // Create particles
        for (let i = 0; i < 50; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2 + 1
            });
        }
        
        this.animate();
        window.addEventListener('resize', () => this.resize());
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    animate() {
        this.ctx.fillStyle = 'rgba(10, 10, 10, 0.1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let particle of this.particles) {
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            if (particle.x < 0 || particle.x > this.canvas.width) particle.vx *= -1;
            if (particle.y < 0 || particle.y > this.canvas.height) particle.vy *= -1;
            
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, 2 * Math.PI);
            this.ctx.fillStyle = 'rgba(212, 175, 55, 0.3)';
            this.ctx.fill();
        }
        
        requestAnimationFrame(() => this.animate());
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new FourierVisualizer();
    new ParticleBackground();
});
