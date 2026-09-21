/* A timed stroke is a signal, not just an ordered list of points. */
class FourierVisualizer {
    constructor() {
        this.canvas = document.getElementById('epicycles-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.inspector = document.getElementById('motion-inspector');
        this.inspectCtx = this.inspector.getContext('2d');
        this.numCircles = 16;
        this.coefficientSelection = 'contiguous';
        this.showReconstruction = true;
        this.showTrace = true;
        this.clearTrace();
        this.reconstructionOpacity = .4;
        this.compareFourier = true;
        this.speed = 1;
        this.time = 0;
        this.clock = 6000;
        this.inputPhase = 1;
        this.isPlaying = !matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.transformType = 'stft';
        this.drawingMode = 'preset';
        this.currentPreset = 'trefoil';
        this.motionProfile = 'expressive';
        this.stftWindowDuration = 3000;
        this.stftReconstruction = 'analysis';
        this.stftRingBuffer = [];
        this.stftPointTimestamps = [];
        this.stftWindow = [];
        this.fourierCoeffs = [];
        this.workspace = FrequencyMath.motionWorkspace(128);
        this.drawnPath = [];
        this.drawnTimes = [];
        this.isDrawing = false;
        this.pointerStroke = [];
        this.pointerPath = null;
        this.visible = true;
        this.dirty = true;
        this.lastAnalysis = -Infinity;
        this.lastReadout = -Infinity;
        this.analysisMs = 0;
        this.setupControls();
        this.setupDrawing();
        this.loadPresetCurve('trefoil');
        this.resizeCanvas();
        this.updateMode();
        this.frame = this.animate.bind(this);
        this.observer = new IntersectionObserver(entries => {
            this.visible = entries.some(entry => entry.isIntersecting);
            this.lastFrame = 0;
            if (this.visible) this.wake();
        }, { rootMargin: '80px' });
        this.observer.observe(document.getElementById('motion-lab'));
        new ResizeObserver(() => this.resizeCanvas()).observe(this.canvas.parentElement);
        document.addEventListener('visibilitychange', () => { this.lastFrame = 0; if (!document.hidden) this.wake(); });
        this.wake();
    }

    wake() {
        this.dirty = true;
        if (!this.request && this.frame && this.visible && !document.hidden) this.request = requestAnimationFrame(this.frame);
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.width = rect.width || 900; this.height = rect.height || 440;
        this.ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        this.canvas.width = Math.round(this.width * this.ratio);
        this.canvas.height = Math.round(this.height * this.ratio);
        this.centerX = this.width / 2; this.centerY = this.height / 2;
        this.viewScale = Math.min(this.width / 440, this.height / 390, 1.5);
        const iw = this.inspector.getBoundingClientRect().width || 1000;
        this.inspectorWidth = iw;
        this.inspectorHeight = iw < 700 ? 610 : 210;
        this.inspector.style.height = `${this.inspectorHeight}px`;
        this.inspector.height = Math.round(this.inspectorHeight * this.ratio);
        this.inspector.width = Math.round(iw * this.ratio);
        this.drawInspector(); this.wake();
    }

    setupControls() {
        const el = id => document.getElementById(id);
        el('num-circles').addEventListener('input', e => {
            this.numCircles = +e.target.value; el('circles-value').textContent = this.numCircles;
            this.computeTransform(); this.wake();
        });
        el('coefficient-selection').addEventListener('change', e => {
            this.coefficientSelection = e.target.value; this.computeTransform(); this.wake();
        });
        el('show-reconstruction').addEventListener('change', e => { this.showReconstruction = e.target.checked; this.wake(); });
        el('show-trace').addEventListener('change', e => { this.showTrace = e.target.checked; this.wake(); });
        el('stft-reconstruction').addEventListener('change', e => {
            this.stftReconstruction = e.target.value; this.clearTrace();
            this.updateMode(); this.computeTransform(); this.updateReadout(); this.wake();
        });
        el('reconstruction-opacity').addEventListener('input', e => { this.reconstructionOpacity = +e.target.value; this.wake(); });
        el('compare-fourier').addEventListener('change', e => { this.compareFourier = e.target.checked; this.wake(); });
        el('speed').addEventListener('input', e => {
            this.speed = +e.target.value; el('speed-value').textContent = this.speed.toFixed(1) + '×';
            this.publishPath(); this.wake();
        });
        el('stft-window-size').addEventListener('input', e => {
            this.stftWindowDuration = +e.target.value;
            el('stft-window-value').textContent = (this.stftWindowDuration / 1000).toFixed(1) + ' s';
            this.computeTransform(); this.wake();
        });
        el('transform-type').addEventListener('change', e => {
            this.transformType = e.target.value; this.time = 0;
            if (this.drawingMode === 'preset') this.seedMotion();
            this.updateMode(); this.computeTransform(); this.publishPath(); this.wake();
        });
        el('drawing-mode').addEventListener('change', e => {
            this.drawingMode = e.target.value;
            if (this.drawingMode === 'preset') this.loadPresetCurve(this.currentPreset);
            else this.clearDrawing();
            this.updateMode(); this.wake();
        });
        el('preset-curve').addEventListener('change', e => this.loadPresetCurve(e.target.value));
        el('motion-profile').addEventListener('change', e => {
            this.motionProfile = e.target.value;
            this.drawnPath = Array.from({ length: 256 }, (_, i) => this.timedPoint(i / 256));
            this.seedMotion(); this.computeTransform(); this.updateTimingCopy(); this.publishPath(); this.wake();
        });
        el('play-pause').addEventListener('click', () => {
            this.isPlaying = !this.isPlaying; this.lastFrame = 0; this.updatePlay(); this.wake();
        });
        el('reset').addEventListener('click', () => {
            this.time = 0; this.inputPhase = 1;
            if (this.drawingMode === 'preset') this.seedMotion();
            this.computeTransform(); this.wake();
        });
        el('clear-draw').addEventListener('click', () => this.clearDrawing());
        el('draw-now').addEventListener('click', () => {
            this.drawingMode = 'draw'; el('drawing-mode').value = 'draw';
            this.clearDrawing(); this.updateMode(); this.canvas.focus();
        });
        el('sine-example').addEventListener('click', () => {
            this.drawingMode = 'preset'; el('drawing-mode').value = 'preset'; el('preset-curve').value = 'flourish';
            this.loadPresetCurve('flourish'); this.updateMode(); this.wake();
        });
        this.updatePlay();
    }

    updatePlay() { document.getElementById('play-pause').textContent = this.isPlaying ? '⏸ Pause' : '▶ Play'; }

    updateMode() {
        const captions = {
            stft: 'STFT measures recent motion at uniform time intervals. This sketch reconstructs the Hann-tapered target, not the original path. Choose Match sampled path to undo the windowing with inverse STFT.',
            fourier: 'Fourier analyzes the whole gesture at once. Timed presets retain speed too; coefficient selection decides which global frequencies survive.',
            dct: 'Cosine uses an even extension — paired frequencies make the reconstructed motion go out and return symmetrically in time.',
            sine: 'Sine modes preserve both endpoints — subtract their straight baseline, reconstruct the interior, then add the baseline back.'
        };
        document.getElementById('mode-caption').textContent = captions[this.transformType];
        document.getElementById('stft-window-control').hidden = this.transformType !== 'stft';
        const recovering = this.transformType === 'stft' && this.stftReconstruction === 'recover';
        document.getElementById('stft-reconstruction-control').hidden = this.transformType !== 'stft';
        document.getElementById('num-circles').disabled = recovering;
        if (recovering) document.getElementById('mode-caption').textContent = 'Inverse STFT recovers all 128 recent time samples. Overlapping Hann windows cancel through weighted overlap-add; all bins are retained. Gold rotors decompose that recovered buffer and their tip follows its latest sample, one sampling interval behind the input.';
        document.getElementById('timing-control').hidden = this.drawingMode !== 'preset';
        document.getElementById('preset-group').hidden = this.drawingMode !== 'preset';
        document.getElementById('clear-draw').hidden = this.drawingMode !== 'draw';
        document.getElementById('draw-now').hidden = this.drawingMode === 'draw';
        document.getElementById('sine-example').hidden = this.transformType !== 'sine';
        document.getElementById('inspector-panel').hidden = this.transformType !== 'stft';
        document.getElementById('selection-control').hidden = this.transformType !== 'fourier';
        document.getElementById('compare-option').hidden = this.transformType !== 'fourier';
        document.getElementById('fourier-comparison').hidden = this.transformType !== 'fourier';
        document.getElementById('snapshot-option').hidden = this.transformType !== 'stft';
        document.getElementById('snapshot-opacity-option').hidden = this.transformType !== 'stft';
        document.querySelector('.legend-reconstruction').hidden = this.transformType !== 'stft';
        const maximum = this.transformType === 'sine' ? 255 : recovering ? 128 : 100;
        this.numCircles = Math.min(this.numCircles, maximum);
        document.getElementById('num-circles').max = maximum;
        document.getElementById('num-circles').value = recovering ? 128 : this.numCircles;
        document.getElementById('circles-value').textContent = this.numCircles;
        if (recovering) document.getElementById('circles-value').textContent = '128 · all bins';
        document.getElementById('budget-title').textContent = this.transformType === 'sine' ? 'Sine-mode budget' : 'Vector budget';
        document.querySelector('.legend-window').hidden = this.transformType !== 'stft' || recovering;
        document.querySelector('.legend-reconstruction').textContent = recovering ? 'Recovered time samples' : 'Current STFT curve';
        document.getElementById('motion-error-label').textContent = recovering ? 'RMS error against original time samples' : 'RMS error against windowed target';
        document.querySelector('.legend-vector').textContent = this.transformType === 'sine' ? 'Sine contributions' : 'Rotating vectors';
        document.getElementById('input-hint').textContent = this.drawingMode === 'draw'
            ? 'Draw anywhere here. Change speed. Release to hold your last position.'
            : this.transformType === 'stft' ? 'Green dot: actual motion · burst through the path, then linger.' : 'Compare how the basis and its boundary assumptions reconstruct this path.';
        document.getElementById('motion-lab').dataset.mode = this.transformType;
        this.updateTimingCopy();
        this.resizeCanvas();
    }

    updateTimingCopy() {
        document.getElementById('timing-explanation').textContent = this.motionProfile === 'expressive'
            ? 'The same path rushes through one part and lingers through another. Parameter speed varies about 152×; geometric speed also depends on the curve.'
            : 'The curve parameter advances steadily. Geometric speed can still vary: equal changes of parameter need not travel equal distances.';
    }

    setupDrawing() {
        this.canvas.addEventListener('pointerdown', e => {
            if (this.drawingMode !== 'draw') return;
            e.preventDefault(); this.canvas.setPointerCapture(e.pointerId);
            if (this.transformType !== 'stft') this.clearDrawing();
            this.isDrawing = true;
            this.pointerStroke = []; this.pointerPath = null;
            if (!this.isPlaying) this.lastFrame = performance.now();
            this.isPlaying = true; this.updatePlay();
            if (this.transformType === 'stft' && this.stftRingBuffer.length) {
                // Hold until the new stroke starts; do not interpolate across the pause.
                this.stftRingBuffer.push({ ...this.stftRingBuffer.at(-1) });
                this.stftPointTimestamps.push(this.inputTimestamp(e));
            }
            this.recordPointer(e); this.wake();
        });
        this.canvas.addEventListener('pointermove', e => {
            if (this.isDrawing) { this.recordPointer(e); this.wake(); }
        });
        const finish = () => {
            if (!this.isDrawing) return;
            this.isDrawing = false;
            this.pointerStroke = []; this.pointerPath = null;
            this.computeTransform(this.transformType !== 'stft'); this.publishPath(); this.wake();
        };
        this.canvas.addEventListener('pointerup', finish);
        this.canvas.addEventListener('pointercancel', finish);
    }

    recordPointer(e) {
        const rect = this.canvas.getBoundingClientRect();
        const p = { x: (e.clientX - rect.left - this.centerX) / this.viewScale,
            y: (e.clientY - rect.top - this.centerY) / this.viewScale };
        const timestamp = this.inputTimestamp(e);
        // Drawing feedback is independent of the selected transform and its cadence.
        this.pointerStroke.push(p);
        if (this.pointerStroke.length > 2048) this.pointerStroke.shift();
        this.pointerPath = null;
        this.drawnPath.push(p); this.drawnTimes.push(timestamp);
        if (this.drawnPath.length > 2048) { this.drawnPath.shift(); this.drawnTimes.shift(); }
        this.stftRingBuffer.push(p); this.stftPointTimestamps.push(timestamp);
        this.pruneMotion();
    }

    inputTimestamp(e) {
        // Pointer timestamps resolve motion between animation frames, even on a busy frame.
        return this.clock + (this.lastFrame ? Math.max(0, e.timeStamp - this.lastFrame) : 0);
    }

    clearDrawing() {
        this.isDrawing = false; this.pointerStroke = []; this.pointerPath = null;
        this.drawnPath = []; this.drawnTimes = []; this.stftRingBuffer = []; this.stftPointTimestamps = [];
        this.fourierCoeffs = []; this.retained = []; this.stftWindow = []; this.reconstruction = []; this.inputPath = null;
        this.agePaths = []; this.windowedPath = null; this.reconstructedPath = null;
        this.comparisonPath = null; this.sineAnalysis = null;
        this.clearTrace();
        this.time = 0; this.drawInspector(); this.wake();
    }

    presetPoint(preset, u) {
        const t = u * Math.PI * 2;
        switch (preset) {
            case 'circle': return { x: 100 * Math.cos(t), y: 100 * Math.sin(t) };
            case 'heart': return { x: 100 * Math.sin(t) ** 3, y: -6.25 * (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) };
            case 'star': { const r = 100 * (1 + .5 * Math.cos(5*t)); return { x: r * Math.cos(t), y: r * Math.sin(t) }; }
            case 'spiral': { const r = 50 + 50 * (u % 1); return { x: r * Math.cos(t), y: r * Math.sin(t) }; }
            case 'infinity': return { x: 100 * Math.cos(t) / (1 + Math.sin(t)**2), y: 100 * Math.sin(t) * Math.cos(t) / (1 + Math.sin(t)**2) };
            case 'flourish': { const q = ((u % 1) + 1) % 1; return { x: 200 * (q - .5), y: 58 * Math.sin(2 * Math.PI * q) + 24 * Math.sin(5 * Math.PI * q) + 45 * q }; }
            default: return { x: 80 * Math.cos(t) * (1 + Math.cos(3*t)), y: 80 * Math.sin(t) * (1 + Math.cos(3*t)) };
        }
    }

    timedPoint(phase) {
        const u = FrequencyMath.motionPhase(phase, this.motionProfile);
        return this.presetPoint(this.currentPreset, u);
    }

    loadPresetCurve(preset) {
        this.isDrawing = false; this.pointerStroke = []; this.pointerPath = null;
        this.currentPreset = preset;
        this.drawnPath = Array.from({ length: 256 }, (_, i) => this.timedPoint(i / 256));
        this.drawnTimes = Array.from({ length: 256 }, (_, i) => i * 6000 / 256);
        this.seedMotion(); this.computeTransform(); this.time = 0; this.publishPath(); this.wake();
    }

    seedMotion() {
        this.stftRingBuffer = []; this.stftPointTimestamps = [];
        for (let i = 0; i <= 384; i++) {
            const ago = 6000 - i * 6000 / 384;
            this.stftRingBuffer.push(this.timedPoint(this.inputPhase - ago * this.speed / 6000));
            this.stftPointTimestamps.push(this.clock - ago);
        }
    }

    pruneMotion() {
        // Retain one predecessor so interpolation at the left window edge stays correct.
        let cut = 0;
        while (cut + 1 < this.stftPointTimestamps.length && this.stftPointTimestamps[cut + 1] < this.clock - 5500) cut++;
        cut = Math.max(cut, this.stftRingBuffer.length - 2048);
        if (cut > 0) { this.stftRingBuffer.splice(0, cut); this.stftPointTimestamps.splice(0, cut); }
    }

    publishPath() {
        const timedPreset = this.drawingMode === 'preset' && this.transformType === 'stft';
        const points = timedPreset ? Array.from({ length: 257 }, (_, i) => this.timedPoint(i / 256)) : this.drawnPath.map(p => ({ ...p }));
        const timestamps = timedPreset ? Array.from({ length: 257 }, (_, i) => i * 6000 / (256 * this.speed)) : this.drawnTimes.slice();
        document.dispatchEvent(new CustomEvent('harmonics:path', { detail: {
            points, timestamps
        } }));
    }

    computeTransform(resetTrace = true) {
        if (resetTrace) this.clearTrace();
        if (this.transformType === 'stft') { this.computeSTFT(); return; }
        if (!this.drawnPath.length) return;
        const count = Math.max(256, 2 ** Math.ceil(Math.log2(this.drawnPath.length)));
        this.staticSamples = FrequencyMath.indexSamples(this.drawnPath, count, this.transformType !== 'sine');
        this.comparisonPath = null;
        if (this.transformType === 'sine') {
            this.sineAnalysis = FrequencyMath.sineAnalysis(this.drawnPath);
            this.fourierCoeffs = this.sineAnalysis.coefficients;
            this.retained = this.fourierCoeffs.slice(0, this.numCircles);
            this.reconstruction = FrequencyMath.reconstructSine(this.sineAnalysis, this.numCircles);
        } else {
            const samples = this.transformType === 'dct' ? [...this.staticSamples, ...this.staticSamples.slice().reverse()] : this.staticSamples;
            this.fourierCoeffs = FrequencyMath.pathCoefficients(samples);
            if (this.transformType === 'dct') {
                const pairs = Math.floor((this.numCircles - 1) / 2);
                this.retained = this.fourierCoeffs.filter(c => Math.abs(c.freq) <= pairs);
            } else {
                const contiguous = FrequencyMath.selectPathCoefficients(this.fourierCoeffs, this.numCircles, 'contiguous');
                const largest = FrequencyMath.selectPathCoefficients(this.fourierCoeffs, this.numCircles, 'largest');
                this.retained = this.coefficientSelection === 'largest' ? largest : contiguous;
                const other = this.coefficientSelection === 'largest' ? contiguous : largest;
                this.comparisonPath = this.pathFrom(FrequencyMath.reconstruct(other, count), true);
                const lowError = FrequencyMath.spectralRms(this.fourierCoeffs, contiguous), bestError = FrequencyMath.spectralRms(this.fourierCoeffs, largest);
                document.getElementById('contiguous-error').textContent = `${lowError.toFixed(2)} units`;
                document.getElementById('largest-error').textContent = `${bestError.toFixed(2)} units`;
                const gain = lowError > 1e-9 ? 100 * (1 - bestError / lowError) : 0;
                document.getElementById('selection-explanation').textContent = `Both keep ${this.retained.length} of ${count} coefficients, including the mean. ${gain > .01 ? `Automatic selection lowers RMS error by ${gain.toFixed(1)}%.` : 'These policies tie at this budget.'} Glowing trace: ${this.coefficientSelection === 'largest' ? 'largest coefficients' : 'contiguous frequencies'}. Dotted amber: the other policy’s full curve.`;
            }
            this.retained.sort((a, b) => b.amp - a.amp);
            this.reconstruction = FrequencyMath.reconstruct(this.retained, Math.max(512, samples.length));
        }
        this.inputPath = this.pathFrom(this.drawnPath);
        this.reconstructedPath = this.pathFrom(this.reconstruction, this.transformType !== 'sine');
    }

    computeSTFT() {
        const started = performance.now();
        this.stftWindow = FrequencyMath.resample(this.stftRingBuffer, this.stftPointTimestamps,
            this.clock, this.stftWindowDuration, 128, this.stftWindow);
        this.fourierCoeffs = FrequencyMath.motionCoefficients(this.stftWindow, 63, this.workspace);
        this.retained = this.fourierCoeffs.slice(0, this.numCircles);
        this.reconstruction = FrequencyMath.reconstruct(this.retained);
        const recovering = this.stftReconstruction === 'recover';
        if (recovering) {
            this.reconstruction = FrequencyMath.recoverMotion(this.stftWindow);
            this.fourierCoeffs = FrequencyMath.pathCoefficients(this.reconstruction).sort((a,b)=>b.amp-a.amp);
            this.retained = this.fourierCoeffs;
        }
        this.reconstructedPath = this.pathFrom(this.reconstruction, !recovering);
        this.windowedPath = recovering ? null : this.pathFrom(this.stftWindow.length ? this.workspace.windowed : [], true);
        this.agePaths = [];
        // Eight strokes replace thousands of per-event draw calls and color allocations.
        for (let j = 0; j < 8; j++) this.agePaths.push(this.pathFrom(this.stftWindow.slice(j * 16, Math.min(128, (j + 1) * 16 + 1))));
        this.analysisMs = .8 * this.analysisMs + .2 * (performance.now() - started);
        this.drawInspector();
    }

    pathFrom(points, closed = false) {
        const path = new Path2D();
        points.forEach((p, i) => i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y));
        if (closed && points.length) path.closePath();
        return path;
    }

    clearTrace() {
        this.tracedPoints = [];
        this.tracedPath = null;
        this.lastTraceClock = -Infinity;
    }

    recordTrace(x, y) {
        // Keep the original moving-tip history, never an ever-growing full path.
        // Sample at most 60 Hz; cached geometry is reused by faster display frames.
        if (this.tracedPoints.length && (!this.isPlaying || this.clock - this.lastTraceClock < 1000 / 60)) return;
        this.tracedPoints.push({ x, y });
        if (this.tracedPoints.length > 500) this.tracedPoints.shift();
        this.lastTraceClock = Number.isFinite(this.lastTraceClock)
            ? this.clock - (this.clock - this.lastTraceClock) % (1000 / 60) : this.clock;
        this.tracedPath = this.pathFrom(this.tracedPoints);
    }

    drawTrace() {
        if (!this.showTrace || this.tracedPoints.length < 2) return;
        const c = this.ctx;
        c.lineWidth = 2.6; c.strokeStyle = '#6cb2ff';
        c.shadowColor = '#4a9eff'; c.shadowBlur = 10;
        c.stroke(this.tracedPath); c.shadowBlur = 0;
    }

    drawInspector() {
        if (!this.inspectCtx || !this.inspectorWidth) return;
        const c = this.inspectCtx, W = this.inspectorWidth, H = this.inspectorHeight, gap = 18;
        const stacked = W < 700, col = stacked ? W - gap * 2 : (W - gap * 4) / 3;
        const ox = p => stacked ? gap : gap + p * (col + gap);
        const oy = p => stacked ? p * 200 : 0;
        c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
        c.fillStyle = '#101010'; c.fillRect(0, 0, W, H);
        c.font = `11px "Source Code Pro", monospace`;
        const labels = ['01  TIME SAMPLES + HANN', this.stftReconstruction === 'recover' ? '02  RECOVERED BUFFER SPECTRUM' : '02  SIGNED LOCAL SPECTRUM', '03  SPEED THROUGH THE WINDOW'];
        const pts = this.stftWindow, n = pts.length;
        for (let p = 0; p < 3; p++) {
            const x = ox(p), y = oy(p);
            c.fillStyle = '#e4c45d'; c.fillText(labels[p], x, y + 22);
            c.strokeStyle = '#ffffff17'; c.strokeRect(x, y + 37, col, 127);
            c.fillStyle = '#96968e'; c.fillText(p === 1 ? '− frequency     0     + frequency' : `−${(this.stftWindowDuration / 1000).toFixed(1)} s                         now`, x, y + 180);
        }
        if (!n) return;
        const amplitude = Math.max(30, ...pts.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))));
        const trace = (values, panel, color, low, high) => {
            c.beginPath(); values.forEach((v, i) => {
                const x = ox(panel) + i / (values.length - 1) * col, y = oy(panel) + 160 - (v - low) / (high - low) * 119;
                i ? c.lineTo(x, y) : c.moveTo(x, y);
            }); c.strokeStyle = color; c.lineWidth = 1.4; c.stroke();
        };
        trace(Array.from(this.workspace.hann), 0, '#a5945077', 0, 1);
        trace(pts.map(p => p.x), 0, '#4a9eff', -amplitude, amplitude);
        trace(pts.map(p => p.y), 0, '#57cf78', -amplitude, amplitude);
        c.fillStyle = '#4a9eff'; c.fillText('x(t)', gap + 4, 196);
        c.fillStyle = '#57cf78'; c.fillText('y(t)', gap + 48, 196);
        c.fillStyle = '#d4af37'; c.fillText('window', gap + 94, 196);
        const off = ox(1), maxFreq = Math.min(24, Math.max(8, Math.ceil(this.numCircles / 2)));
        const peak = Math.max(.001, ...this.fourierCoeffs.filter(v => v.freq !== 0).map(v => v.amp));
        const selected = new Set(this.retained.map(v => v.freq));
        for (const v of this.fourierCoeffs) {
            if (Math.abs(v.freq) > maxFreq) continue;
            const x = off + (v.freq + maxFreq) / (2 * maxFreq + 1) * col;
            const height = Math.min(1, v.amp / peak) * 116;
            c.fillStyle = selected.has(v.freq) ? '#f4d03f' : '#686a72';
            c.fillRect(x, oy(1) + 160 - height, Math.max(1.5, col / (2 * maxFreq + 1) - 1.5), height);
        }
        c.fillStyle = '#b0b0a8'; c.fillText(`Gold retained · ±${(maxFreq * 1000 / this.stftWindowDuration).toFixed(1)} Hz shown`, off, oy(1) + 196);
        const speeds = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y) * n * 1000 / this.stftWindowDuration);
        trace(speeds, 2, '#e58f60', 0, Math.max(20, ...speeds));
        c.fillStyle = '#b0b0a8'; c.fillText('Same geometry ≠ same timing', ox(2), oy(2) + 196);
    }

    updateReadout() {
        const n = this.stftWindow.length;
        if (!n) return;
        const energy = this.fourierCoeffs.filter(c => c.freq).reduce((sum, c) => sum + c.amp ** 2, 0);
        const kept = this.retained.filter(c => c.freq).reduce((sum, c) => sum + c.amp ** 2, 0);
        let squared = 0;
        const target = this.stftReconstruction === 'recover' ? this.stftWindow : this.workspace.windowed;
        for (let i = 0; i < n; i++) {
            squared += (this.reconstruction[i].x - target[i].x) ** 2 + (this.reconstruction[i].y - target[i].y) ** 2;
        }
        document.getElementById('stft-sampling').textContent = `128 uniform samples · Δf ${(1000 / this.stftWindowDuration).toFixed(2)} Hz · Nyquist ${(64000 / this.stftWindowDuration).toFixed(1)} Hz · latest sample ${(this.stftWindowDuration / 128).toFixed(1)} ms behind now`;
        document.getElementById('motion-energy').textContent = `${(energy > 1e-10 ? 100 * kept / energy : 100).toFixed(1)}%`;
        document.getElementById('motion-error').textContent = `${Math.sqrt(squared / n).toFixed(2)} units`;
        document.getElementById('motion-cost').textContent = `${this.analysisMs.toFixed(2)} ms`;
    }

    render() {
        const c = this.ctx;
        c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
        c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, this.width, this.height);
        c.translate(this.centerX, this.centerY); c.scale(this.viewScale, this.viewScale);
        c.lineWidth = .5; c.strokeStyle = '#d4af370d'; c.beginPath();
        for (let x = -360; x <= 360; x += 40) { c.moveTo(x, -260); c.lineTo(x, 260); }
        for (let y = -240; y <= 240; y += 40) { c.moveTo(-380, y); c.lineTo(380, y); } c.stroke();
        if (this.transformType === 'stft') {
            (this.agePaths || []).forEach((path, i) => { c.strokeStyle = `rgba(76, 200, 110, ${.14 + i * .10})`; c.lineWidth = 1.4; c.stroke(path); });
            if (this.windowedPath) { c.strokeStyle = '#aaa58b5a'; c.setLineDash([3, 4]); c.lineWidth = 1; c.stroke(this.windowedPath); c.setLineDash([]); }
        } else if (this.inputPath) { c.strokeStyle = '#ffffff44'; c.lineWidth = 1; c.stroke(this.inputPath); }
        if (this.comparisonPath && this.compareFourier && this.transformType === 'fourier') {
            c.lineWidth = 1.6; c.strokeStyle = 'rgba(229,155,91,0.45)'; c.setLineDash([3, 4]); c.stroke(this.comparisonPath); c.setLineDash([]);
        }
        if (this.transformType === 'stft' && this.showReconstruction && this.reconstructedPath) {
            c.lineWidth = 2; c.strokeStyle = `rgba(74,158,255,${this.reconstructionOpacity})`; c.stroke(this.reconstructedPath);
        }
        if (this.transformType === 'stft' && this.stftRingBuffer.length) {
            const p = this.stftRingBuffer.at(-1); c.beginPath(); c.arc(p.x, p.y, 4.3, 0, 2 * Math.PI); c.fillStyle = '#78e995'; c.fill();
            c.beginPath(); c.arc(p.x, p.y, 8, 0, 2 * Math.PI); c.strokeStyle = '#57cf7870'; c.lineWidth = 1; c.stroke();
        }
        let x = 0, y = 0;
        if (this.transformType === 'sine' && this.sineAnalysis) {
            const t = .5 - .5 * Math.cos(this.time), { first, last } = this.sineAnalysis;
            x = first.x * (1 - t) + last.x * t; y = first.y * (1 - t) + last.y * t;
            c.strokeStyle = '#c7b27460'; c.lineWidth = 1; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(first.x, first.y); c.lineTo(last.x, last.y); c.stroke(); c.setLineDash([]);
            for (const p of [first, last]) { c.beginPath(); c.arc(p.x, p.y, 5, 0, 2 * Math.PI); c.strokeStyle = '#e4c978'; c.stroke(); }
            for (const coefficient of this.retained || []) {
                const s = Math.sin(Math.PI * coefficient.freq * t), nx = x + coefficient.re * s, ny = y + coefficient.im * s;
                c.beginPath(); c.moveTo(x - coefficient.re, y - coefficient.im); c.lineTo(x + coefficient.re, y + coefficient.im); c.strokeStyle = '#d4af3720'; c.lineWidth = .7; c.stroke();
                c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.strokeStyle = '#f4d03fb0'; c.lineWidth = 1.2; c.stroke(); x = nx; y = ny;
            }
        } else {
        // Recovered motion follows the latest available time sample. The
        // analysis sketch instead tours its current periodic window freely.
        const phaseTime = this.transformType === 'stft' && this.stftReconstruction === 'recover'
            ? 2 * Math.PI * (this.stftWindow.length - 1) / this.stftWindow.length : this.time;
        for (const coefficient of this.retained || []) {
            const phase = coefficient.freq * phaseTime + coefficient.phase;
            const nx = x + coefficient.amp * Math.cos(phase), ny = y + coefficient.amp * Math.sin(phase);
            if (coefficient.amp < .15) { x = nx; y = ny; continue; }
            c.beginPath(); c.arc(x, y, coefficient.amp, 0, 2 * Math.PI);
            c.strokeStyle = '#d4af374c'; c.lineWidth = .8; c.stroke();
            c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.strokeStyle = '#f4d03fb0'; c.lineWidth = 1.2; c.stroke();
            x = nx; y = ny;
        }
        }
        if (this.retained?.length) {
            this.recordTrace(x, y); this.drawTrace();
            c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fillStyle = '#fff1a1'; c.fill();
            c.beginPath(); c.arc(x, y, 8, 0, Math.PI * 2); c.strokeStyle = '#f4d03f80'; c.stroke();
        }
        if (this.isDrawing && this.pointerStroke.length) {
            // Cache one bounded path per display frame; never analyze a global
            // Fourier/cosine/sine transform for each incoming pointer event.
            this.pointerPath ||= this.pathFrom(this.pointerStroke);
            c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
            c.lineWidth = 2.2; c.strokeStyle = '#78e995';
            c.shadowColor = '#57cf78'; c.shadowBlur = 6;
            c.stroke(this.pointerPath);
            const tip = this.pointerStroke.at(-1);
            c.beginPath(); c.arc(tip.x, tip.y, 3.6, 0, 2 * Math.PI);
            c.fillStyle = '#b1ffc6'; c.fill(); c.restore();
        }
    }

    animate(stamp) {
        this.request = 0;
        if (!this.visible || document.hidden) { this.lastFrame = 0; return; }
        const dt = this.lastFrame ? Math.max(0, stamp - this.lastFrame) : 0;
        this.lastFrame = stamp;
        if (this.isPlaying) {
            this.clock += dt;
            const nextTime = this.time + dt * .001 * this.speed * Math.PI / 2;
            if (nextTime >= 2 * Math.PI && this.transformType !== 'stft') this.clearTrace();
            this.time = nextTime % (2 * Math.PI);
            if (this.drawingMode === 'preset' && this.transformType === 'stft') {
                this.inputPhase += dt * this.speed / 6000;
                this.stftRingBuffer.push(this.timedPoint(this.inputPhase));
                this.stftPointTimestamps.push(this.clock); this.pruneMotion();
            }
        }
        if (this.transformType === 'stft' && (this.dirty || (this.isPlaying && stamp - this.lastAnalysis >= 33))) {
            this.computeSTFT(); this.lastAnalysis = stamp;
        }
        if (this.transformType === 'stft' && (this.dirty || stamp - this.lastReadout >= 250)) { this.updateReadout(); this.lastReadout = stamp; }
        this.render(); this.dirty = false;
        if (this.isPlaying) this.request = requestAnimationFrame(this.frame);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.parent !== window) document.querySelectorAll('.back-button').forEach(link => { link.hidden = true; });
    window.fourierVisualizer = new FourierVisualizer();
});
