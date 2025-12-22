import { BilateralGrid } from './bilateralGrid.js';
import { HoughTransform } from './houghTransform.js';
import { HoughCircleTransform } from './houghCircle.js';
import { HoughCircleGPU } from './houghCircleGPU.js';
import { HoughShapeTransform } from './houghShape.js';
import { Grid3DVisualizer } from './grid3DVisualizer.js';
import { ImageProcessor } from './imageProcessor.js';
import { AdvancedFilters } from './advancedFilters.js';
import { DrawingCanvas } from './drawingCanvas.js';
import { GradientDomainProcessor } from './gradientDomain.js';
import { Field3DVisualizer } from './field3DVisualizer.js';

class AlgorithmDemo {
    constructor() {
        this.initializeBilateralSection();
        this.initializeHoughSection();
        this.initializeCircleSection();
        this.initializeShapeSection();
        this.initializeExtraSection();
        this.loadDefaultImages();
    }

    initializeBilateralSection() {
        // Get canvas elements
        this.bilateralInputCanvas = document.getElementById('bilateralInput');
        this.bilateralOutputCanvas = document.getElementById('bilateralOutput');
        this.bilateral3DCanvas = document.getElementById('bilateral3d');

        this.bilateralInputCtx = this.bilateralInputCanvas.getContext('2d');
        this.bilateralOutputCtx = this.bilateralOutputCanvas.getContext('2d');

        // Initialize bilateral grid
        this.bilateralGrid = new BilateralGrid();
        
        // Initialize 3D visualizer
        this.grid3D = new Grid3DVisualizer(this.bilateral3DCanvas);

        // Get controls
        const spatialSigmaSlider = document.getElementById('spatialSigma');
        const rangeSigmaSlider = document.getElementById('rangeSigma');
        const gridScaleSlider = document.getElementById('gridScale');

        // Debounce timer for real-time updates
        this.bilateralUpdateTimer = null;
        
        // Update value displays and apply filter in real-time if enabled
        const updateBilateral = () => {
            if (document.getElementById('autoUpdateBilateral').checked) {
                clearTimeout(this.bilateralUpdateTimer);
                this.bilateralUpdateTimer = setTimeout(() => {
                    this.applyBilateralFilter();
                }, 150); // Debounce 150ms for smooth interaction
            }
        };
        
        spatialSigmaSlider.addEventListener('input', (e) => {
            document.getElementById('spatialSigmaValue').textContent = e.target.value;
            updateBilateral();
        });

        rangeSigmaSlider.addEventListener('input', (e) => {
            document.getElementById('rangeSigmaValue').textContent = e.target.value;
            updateBilateral();
        });

        gridScaleSlider.addEventListener('input', (e) => {
            document.getElementById('gridScaleValue').textContent = e.target.value;
            updateBilateral();
        });

        // Apply bilateral filter button
        document.getElementById('applyBilateral').addEventListener('click', () => {
            this.applyBilateralFilter();
        });

        // Reset button
        document.getElementById('resetBilateral').addEventListener('click', () => {
            this.bilateralOutputCtx.clearRect(0, 0, this.bilateralOutputCanvas.width, this.bilateralOutputCanvas.height);
            this.grid3D.clear();
            document.getElementById('gridSizeInfo').textContent = '-';
            document.getElementById('clusterCount').textContent = '-';
            document.getElementById('processingTime').textContent = '-';
        });
    }

    initializeHoughSection() {
        this.houghInputCanvas = document.getElementById('houghInput');
        this.houghSpaceCanvas = document.getElementById('houghSpace');
        this.houghOutputCanvas = document.getElementById('houghOutput');

        this.houghInputCtx = this.houghInputCanvas.getContext('2d');
        this.houghSpaceCtx = this.houghSpaceCanvas.getContext('2d');
        this.houghOutputCtx = this.houghOutputCanvas.getContext('2d');

        // Initialize drawing canvas
        this.drawingCanvas = new DrawingCanvas(this.houghInputCanvas);
        
        // Initialize Hough transform
        this.houghTransform = new HoughTransform();

        // Drawing mode
        document.getElementById('drawingMode').addEventListener('change', (e) => {
            this.drawingCanvas.setMode(e.target.value);
        });

        // Brush size
        document.getElementById('brushSize').addEventListener('input', (e) => {
            document.getElementById('brushSizeValue').textContent = e.target.value;
            this.drawingCanvas.setBrushSize(parseInt(e.target.value));
        });

        // Draw color
        document.getElementById('drawColor').addEventListener('change', (e) => {
            this.drawingCanvas.setColor(e.target.value);
        });

        // Threshold
        document.getElementById('threshold').addEventListener('input', (e) => {
            document.getElementById('thresholdValue').textContent = e.target.value;
        });

        // Clear canvas
        document.getElementById('clearCanvas').addEventListener('click', () => {
            this.drawingCanvas.clear();
            this.houghSpaceCtx.clearRect(0, 0, this.houghSpaceCanvas.width, this.houghSpaceCanvas.height);
            this.houghOutputCtx.clearRect(0, 0, this.houghOutputCanvas.width, this.houghOutputCanvas.height);
            document.getElementById('linesDetected').textContent = '0';
            document.getElementById('houghTime').textContent = '-';
        });

        // Detect lines
        document.getElementById('detectLines').addEventListener('click', () => {
            this.detectLines();
        });
        
        // Line field mode toggles
        document.getElementById('lineFieldOff').addEventListener('click', (e) => {
            this.lineFieldMode = 'off';
            document.querySelectorAll('.mode-toggle button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            this.updateHoughSpace();
        });
        
        document.getElementById('lineFieldDominant').addEventListener('click', (e) => {
            this.lineFieldMode = 'dominant';
            document.querySelectorAll('.mode-toggle button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            this.updateHoughSpace();
        });
        
        document.getElementById('lineFieldAccumulation').addEventListener('click', (e) => {
            this.lineFieldMode = 'accumulation';
            document.querySelectorAll('.mode-toggle button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            this.updateHoughSpace();
        });
        
        // Line opacity slider
        document.getElementById('lineOpacity').addEventListener('input', (e) => {
            this.lineOpacity = parseFloat(e.target.value);
            document.getElementById('lineOpacityValue').textContent = e.target.value;
            if (this.lineFieldMode !== 'off') {
                this.updateHoughSpace();
            }
        });

        // Load sample
        document.getElementById('loadSampleImage').addEventListener('click', () => {
            this.loadSampleForHough();
        });

        // Line field visualization
        this.lineFieldMode = 'off'; // 'off', 'dominant', 'accumulation'
        this.lineFieldThreshold = 5;
        this.lineOpacity = 0.3;
        
        // Auto-update on drawing
        this.drawingCanvas.onDrawingChange = () => {
            this.updateHoughSpace();
        };
    }

    initializeCircleSection() {
        this.circleInputCanvas = document.getElementById('circleInput');
        this.circleHoughSpaceCanvas = document.getElementById('circleHoughSpace');
        this.circleOutputCanvas = document.getElementById('circleOutput');

        this.circleInputCtx = this.circleInputCanvas.getContext('2d');
        this.circleHoughSpaceCtx = this.circleHoughSpaceCanvas.getContext('2d');
        this.circleOutputCtx = this.circleOutputCanvas.getContext('2d');

        this.houghCircle = new HoughCircleTransform();
        this.circleDrawingCanvas = new DrawingCanvas(this.circleInputCanvas);

        // Circle field visualization
        this.circleFieldMode = 'off';
        this.circleOpacity = 0.3;
        this.currentRadiusSlice = 55;

        // Update value displays
        document.getElementById('circleBrushSize').addEventListener('input', (e) => {
            document.getElementById('circleBrushSizeValue').textContent = e.target.value;
            this.circleDrawingCanvas.setBrushSize(parseInt(e.target.value));
        });

        document.getElementById('minRadius').addEventListener('input', (e) => {
            document.getElementById('minRadiusValue').textContent = e.target.value;
        });

        document.getElementById('maxRadius').addEventListener('input', (e) => {
            document.getElementById('maxRadiusValue').textContent = e.target.value;
        });

        document.getElementById('circleThreshold').addEventListener('input', (e) => {
            document.getElementById('circleThresholdValue').textContent = e.target.value;
        });

        // Drawing mode
        document.getElementById('circleDrawingMode').addEventListener('change', (e) => {
            this.circleDrawingCanvas.setMode(e.target.value);
        });

        document.getElementById('circleDrawColor').addEventListener('change', (e) => {
            this.circleDrawingCanvas.setColor(e.target.value);
        });

        // Clear canvas
        document.getElementById('clearCircleCanvas').addEventListener('click', () => {
            this.circleInputCtx.fillStyle = '#000000';
            this.circleInputCtx.fillRect(0, 0, this.circleInputCanvas.width, this.circleInputCanvas.height);
            this.circleHoughSpaceCtx.clearRect(0, 0, this.circleHoughSpaceCanvas.width, this.circleHoughSpaceCanvas.height);
            this.circleOutputCtx.clearRect(0, 0, this.circleOutputCanvas.width, this.circleOutputCanvas.height);
            document.getElementById('circlesDetected').textContent = '0';
            document.getElementById('circleTime').textContent = '-';
        });

        // Detect circles
        document.getElementById('detectCircles').addEventListener('click', () => {
            this.detectCircles();
        });


        // Load sample
        document.getElementById('loadCircleSample').addEventListener('click', () => {
            this.loadSampleForCircles();
        });

        // Auto-update on drawing
        this.circleDrawingCanvas.onDrawingChange = () => {
            this.updateCircleHoughSpace();
        };
        
        // Try to use GPU acceleration
        this.houghCircleGPU = new HoughCircleGPU(this.circleHoughSpaceCanvas);
        if (this.houghCircleGPU.useGPU) {
            console.log('Using GPU-accelerated circle detection!');
        }
    }

    initializeShapeSection() {
        this.shapeTemplateCanvas = document.getElementById('shapeTemplate');
        this.shapeTargetCanvas = document.getElementById('shapeTarget');
        this.shapeOutputCanvas = document.getElementById('shapeOutput');

        this.shapeTemplateCtx = this.shapeTemplateCanvas.getContext('2d');
        this.shapeTargetCtx = this.shapeTargetCanvas.getContext('2d');
        this.shapeOutputCtx = this.shapeOutputCanvas.getContext('2d');

        this.houghShape = new HoughShapeTransform();
        this.shapeTemplateDrawing = new DrawingCanvas(this.shapeTemplateCanvas);
        this.shapeTargetDrawing = new DrawingCanvas(this.shapeTargetCanvas);
        this.templateActive = false;
        this.templateWrapper = document.getElementById('templateWrapper');

        // Initialize with black background
        this.shapeTemplateCtx.fillStyle = '#000000';
        this.shapeTemplateCtx.fillRect(0, 0, this.shapeTemplateCanvas.width, this.shapeTemplateCanvas.height);
        this.shapeTargetCtx.fillStyle = '#000000';
        this.shapeTargetCtx.fillRect(0, 0, this.shapeTargetCanvas.width, this.shapeTargetCanvas.height);

        // Brush size controls
        document.getElementById('templateBrushSize').addEventListener('input', (e) => {
            const size = parseInt(e.target.value);
            document.getElementById('templateBrushValue').textContent = size;
            this.shapeTemplateDrawing.brushSize = size;
        });

        document.getElementById('targetBrushSize').addEventListener('input', (e) => {
            const size = parseInt(e.target.value);
            document.getElementById('targetBrushValue').textContent = size;
            this.shapeTargetDrawing.brushSize = size;
        });

        // Set initial brush sizes
        this.shapeTemplateDrawing.brushSize = 3;
        this.shapeTargetDrawing.brushSize = 3;

        // Slider updates
        document.getElementById('minScale').addEventListener('input', (e) => {
            document.getElementById('minScaleValue').textContent = e.target.value;
        });

        document.getElementById('maxScale').addEventListener('input', (e) => {
            document.getElementById('maxScaleValue').textContent = e.target.value;
        });

        document.getElementById('angleStep').addEventListener('input', (e) => {
            document.getElementById('angleStepValue').textContent = e.target.value + '°';
        });

        // Create template
        document.getElementById('createShapeTemplate').addEventListener('click', () => {
            const imageData = this.shapeTemplateCtx.getImageData(
                0, 0,
                this.shapeTemplateCanvas.width,
                this.shapeTemplateCanvas.height
            );
            this.houghShape.createTemplate(imageData);
            this.setTemplateActive(true);
        });

        // Clear template
        document.getElementById('clearShapeTemplate').addEventListener('click', () => {
            this.shapeTemplateCtx.fillStyle = '#000000';
            this.shapeTemplateCtx.fillRect(0, 0, this.shapeTemplateCanvas.width, this.shapeTemplateCanvas.height);
            this.houghShape.template = null;
            this.houghShape.rTable = null;
            this.setTemplateActive(false);
        });

        // Clear target
        document.getElementById('clearShapeTarget').addEventListener('click', () => {
            this.shapeTargetCtx.fillStyle = '#000000';
            this.shapeTargetCtx.fillRect(0, 0, this.shapeTargetCanvas.width, this.shapeTargetCanvas.height);
            this.shapeOutputCtx.clearRect(0, 0, this.shapeOutputCanvas.width, this.shapeOutputCanvas.height);
        });

        // Detect shape
        document.getElementById('detectShape').addEventListener('click', () => {
            this.detectArbitraryShape();
        });

        // Load sample
        document.getElementById('loadShapeSample').addEventListener('click', () => {
            this.loadSampleForShape();
        });
    }

    setTemplateActive(active) {
        this.templateActive = active;
        if (active) {
            this.templateWrapper.classList.add('template-active');
            document.getElementById('templateStatus').textContent = 'Template Active ✓';
            document.getElementById('templateStatus').style.color = 'var(--primary)';
        } else {
            this.templateWrapper.classList.remove('template-active');
            document.getElementById('templateStatus').textContent = 'No Template';
            document.getElementById('templateStatus').style.color = '';
        }
    }

    initializeExtraSection() {
        this.extraInputCanvas = document.getElementById('extraInput');
        this.extraOutputCanvas = document.getElementById('extraOutput');
        this.extraInputCtx = this.extraInputCanvas.getContext('2d');
        this.extraOutputCtx = this.extraOutputCanvas.getContext('2d');

        this.imageProcessor = new ImageProcessor();
        this.advancedFilters = new AdvancedFilters();

        // Filter category dropdown - filter the options
        document.getElementById('filterCategory').addEventListener('change', (e) => {
            const category = e.target.value;
            const filterSelect = document.getElementById('filterType');
            const optgroups = filterSelect.querySelectorAll('optgroup');
            
            // Show/hide optgroups based on category
            optgroups.forEach(group => {
                const label = group.label.toLowerCase();
                if (category === 'basic' && label.includes('basic')) {
                    group.style.display = '';
                } else if (category === 'blur' && label.includes('blur')) {
                    group.style.display = '';
                } else if (category === 'edge' && label.includes('edge')) {
                    group.style.display = '';
                } else if (category === 'morphology' && label.includes('morphological')) {
                    group.style.display = '';
                } else if (category === 'other' && label.includes('other')) {
                    group.style.display = '';
                } else {
                    group.style.display = 'none';
                }
            });
            
            // Select first visible option
            const firstVisible = filterSelect.querySelector('optgroup:not([style*="display: none"]) option');
            if (firstVisible) {
                firstVisible.selected = true;
            }
        });

        // Filter intensity slider
        document.getElementById('filterIntensity').addEventListener('input', (e) => {
            document.getElementById('filterIntensityValue').textContent = e.target.value;
        });

        // Apply filter button
        document.getElementById('applyFilter').addEventListener('click', () => {
            this.applySelectedFilter();
        });

        // Reset filter button
        document.getElementById('resetFilter').addEventListener('click', () => {
            this.extraOutputCtx.clearRect(0, 0, this.extraOutputCanvas.width, this.extraOutputCanvas.height);
            document.getElementById('currentFilter').textContent = '-';
            document.getElementById('filterTime').textContent = '-';
        });
    }

    applySelectedFilter() {
        const filterType = document.getElementById('filterType').value;
        const intensity = parseFloat(document.getElementById('filterIntensity').value);
        
        const imageData = this.extraInputCtx.getImageData(
            0, 0,
            this.extraInputCanvas.width,
            this.extraInputCanvas.height
        );

        const startTime = performance.now();
        let result;

        // Route to appropriate filter
        switch (filterType) {
            // Basic
            case 'brightness':
                result = this.advancedFilters.brightness(imageData, intensity);
                break;
            case 'contrast':
                result = this.advancedFilters.contrast(imageData, intensity);
                break;
            case 'invert':
                result = this.advancedFilters.invert(imageData);
                break;
            case 'threshold':
                result = this.advancedFilters.threshold(imageData, intensity);
                break;
            case 'posterize':
                result = this.advancedFilters.posterize(imageData, intensity);
                break;
            
            // Blur & Sharpen
            case 'gaussianBlur':
                result = this.advancedFilters.gaussianBlur(imageData, intensity);
                break;
            case 'sharpen':
                result = this.advancedFilters.sharpen(imageData, intensity);
                break;
            case 'unsharpMask':
                result = this.advancedFilters.unsharpMask(imageData, intensity);
                break;
            case 'emboss':
                result = this.advancedFilters.emboss(imageData, intensity);
                break;
            case 'edgeEnhance':
                result = this.advancedFilters.edgeEnhance(imageData, intensity);
                break;
            
            // Edge Detection
            case 'sobel':
                result = this.imageProcessor.sobelEdgeDetection(imageData);
                break;
            case 'canny':
                result = this.imageProcessor.cannyEdgeDetection(imageData);
                break;
            case 'laplacian':
                result = this.advancedFilters.laplacian(imageData);
                break;
            
            // Morphological
            case 'dilate':
                result = this.advancedFilters.dilate(imageData);
                break;
            case 'erode':
                result = this.advancedFilters.erode(imageData);
                break;
            case 'open':
                result = this.advancedFilters.open(imageData);
                break;
            case 'close':
                result = this.advancedFilters.close(imageData);
                break;
            
            // Other filters
            case 'median':
                result = this.advancedFilters.median(imageData);
                break;
            case 'highpass':
                result = this.advancedFilters.highpass(imageData, intensity);
                break;
            case 'sepia':
                result = this.applySepiaFilter(imageData, intensity);
                break;
            case 'vignette':
                result = this.applyVignetteFilter(imageData, intensity);
                break;
            case 'pixelate':
                result = this.applyPixelateFilter(imageData, Math.floor(intensity * 10));
                break;
            
            default:
                result = imageData;
        }

        const endTime = performance.now();

        // Display result
        this.extraOutputCtx.putImageData(result, 0, 0);

        // Update stats
        document.getElementById('currentFilter').textContent = filterType;
        document.getElementById('filterTime').textContent = `${(endTime - startTime).toFixed(2)} ms`;
    }

    loadDefaultImages() {
        // Create a colorful test image for bilateral filter
        this.createTestImage(this.bilateralInputCanvas);
        this.createTestImage(this.extraInputCanvas);
        
        // Load default samples for Hough demos
        this.loadSampleForHough();
        this.loadSampleForCircles();
        this.loadSampleForShape();
    }

    createTestImage(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Create gradient background
        const gradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width/2);
        gradient.addColorStop(0, '#ff6b6b');
        gradient.addColorStop(0.3, '#4ecdc4');
        gradient.addColorStop(0.6, '#45b7d1');
        gradient.addColorStop(1, '#96ceb4');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Add some shapes
        ctx.fillStyle = '#ffe66d';
        ctx.beginPath();
        ctx.arc(width * 0.3, height * 0.3, 80, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ff6b9d';
        ctx.fillRect(width * 0.6, height * 0.2, 120, 120);

        ctx.fillStyle = '#c44569';
        ctx.beginPath();
        ctx.moveTo(width * 0.5, height * 0.7);
        ctx.lineTo(width * 0.4, height * 0.9);
        ctx.lineTo(width * 0.6, height * 0.9);
        ctx.closePath();
        ctx.fill();

        // Add some noise
        const imageData = ctx.getImageData(0, 0, width, height);
        for (let i = 0; i < imageData.data.length; i += 4) {
            if (Math.random() > 0.95) {
                const noise = (Math.random() - 0.5) * 100;
                imageData.data[i] += noise;
                imageData.data[i + 1] += noise;
                imageData.data[i + 2] += noise;
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    async applyBilateralFilter() {
        const spatialSigma = parseFloat(document.getElementById('spatialSigma').value);
        const rangeSigma = parseFloat(document.getElementById('rangeSigma').value);
        const gridScale = parseInt(document.getElementById('gridScale').value);

        const imageData = this.bilateralInputCtx.getImageData(
            0, 0, 
            this.bilateralInputCanvas.width, 
            this.bilateralInputCanvas.height
        );

        const startTime = performance.now();
        
        const result = await this.bilateralGrid.filter(imageData, spatialSigma, rangeSigma, gridScale);
        
        const endTime = performance.now();

        this.bilateralOutputCtx.putImageData(result.output, 0, 0);

        // Update 3D visualization
        const clusterCount = this.grid3D.visualizeGrid(result.grid, result.gridWidth, result.gridHeight, result.gridDepth);

        // Update stats
        document.getElementById('gridSizeInfo').textContent = 
            `${result.gridWidth} × ${result.gridHeight} × ${result.gridDepth}`;
        document.getElementById('clusterCount').textContent = clusterCount;
        document.getElementById('processingTime').textContent = 
            `${(endTime - startTime).toFixed(2)} ms`;
    }

    updateHoughSpace() {
        // Get current canvas image
        const imageData = this.houghInputCtx.getImageData(
            0, 0,
            this.houghInputCanvas.width,
            this.houghInputCanvas.height
        );

        // Compute and display Hough space
        const houghSpace = this.houghTransform.computeHoughSpace(imageData);
        this.displayHoughSpace(houghSpace);
        
        // Clear output canvas and redraw input
        this.houghOutputCtx.clearRect(0, 0, this.houghOutputCanvas.width, this.houghOutputCanvas.height);
        this.houghOutputCtx.drawImage(this.houghInputCanvas, 0, 0);
        
        // Update line field based on mode
        if (this.lineFieldMode === 'dominant') {
            this.displayLineFieldDominant();
        } else if (this.lineFieldMode === 'accumulation') {
            this.displayLineFieldAccumulation();
        }
    }

    detectLines() {
        const threshold = parseInt(document.getElementById('threshold').value);
        
        const imageData = this.houghInputCtx.getImageData(
            0, 0,
            this.houghInputCanvas.width,
            this.houghInputCanvas.height
        );

        const startTime = performance.now();
        
        const result = this.houghTransform.detectLines(imageData, threshold);
        
        const endTime = performance.now();

        // Display Hough space
        this.displayHoughSpace(result.houghSpace);

        // Display detected lines
        this.displayDetectedLines(result.lines);

        // Update stats
        document.getElementById('linesDetected').textContent = result.lines.length;
        document.getElementById('houghTime').textContent = `${(endTime - startTime).toFixed(2)} ms`;
    }

    displayHoughSpace(houghSpace) {
        const canvas = this.houghSpaceCanvas;
        const ctx = this.houghSpaceCtx;
        const numRho = this.houghTransform.numRho;
        const numTheta = this.houghTransform.numTheta;

        // Find max value for normalization
        let maxVal = 0;
        for (let i = 0; i < houghSpace.length; i++) {
            maxVal = Math.max(maxVal, houghSpace[i]);
        }

        // Create properly sized image data
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = numTheta;
        tempCanvas.height = numRho;
        const tempCtx = tempCanvas.getContext('2d');
        const imageData = tempCtx.createImageData(numTheta, numRho);
        
        // Fill with Hough space data (theta = x, rho = y)
        for (let t = 0; t < numTheta; t++) {
            for (let r = 0; r < numRho; r++) {
                const houghIdx = t * numRho + r;
                const imgIdx = (r * numTheta + t) * 4;
                const value = (houghSpace[houghIdx] / maxVal) * 255;
                imageData.data[imgIdx] = value;
                imageData.data[imgIdx + 1] = value;
                imageData.data[imgIdx + 2] = value;
                imageData.data[imgIdx + 3] = 255;
            }
        }
        
        tempCtx.putImageData(imageData, 0, 0);
        
        // Scale to fill canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
    }

    displayDetectedLines(lines) {
        const canvas = this.houghOutputCanvas;
        const ctx = this.houghOutputCtx;

        // Copy input image
        ctx.drawImage(this.houghInputCanvas, 0, 0);

        // Draw detected lines
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;

        lines.forEach(line => {
            const { rho, theta } = line;
            const cos = Math.cos(theta);
            const sin = Math.sin(theta);

            const x0 = cos * rho;
            const y0 = sin * rho;

            const x1 = x0 + 1000 * (-sin);
            const y1 = y0 + 1000 * (cos);
            const x2 = x0 - 1000 * (-sin);
            const y2 = y0 - 1000 * (cos);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        });
        
        // Display line field based on mode
        if (this.lineFieldMode === 'dominant') {
            this.displayLineFieldDominant();
        } else if (this.lineFieldMode === 'accumulation') {
            this.displayLineFieldAccumulation();
        }
    }
    
    displayLineFieldDominant() {
        const canvas = this.houghOutputCanvas;
        const ctx = this.houghOutputCtx;
        
        // Generate line field
        const field = this.houghTransform.generateLineField(this.lineFieldThreshold, 24);
        
        // Draw line directions as thin line segments
        field.forEach(point => {
            const { x, y, theta, strength } = point;
            const length = 12;
            
            // Direction perpendicular to line normal
            const dx = Math.cos(theta) * length;
            const dy = Math.sin(theta) * length;
            
            // Color based on strength with user-controlled opacity
            const alpha = Math.min(this.lineOpacity, strength / 80);
            ctx.strokeStyle = `rgba(255, 255, 0, ${alpha})`;
            ctx.lineWidth = 1; // Thinner lines
            
            ctx.beginPath();
            ctx.moveTo(x - dx, y - dy);
            ctx.lineTo(x + dx, y + dy);
            ctx.stroke();
        });
    }
    
    displayLineFieldAccumulation() {
        const canvas = this.houghOutputCanvas;
        const ctx = this.houghOutputCtx;
        
        // Get all significant lines from Hough space
        const lines = this.houghTransform.getAllLines(5);
        
        // Find max votes for normalization
        let maxVotes = 0;
        lines.forEach(line => {
            maxVotes = Math.max(maxVotes, line.votes);
        });
        
        // Draw each line with opacity based on Hough space brightness
        lines.forEach(line => {
            const { rho, theta, votes } = line;
            const cos = Math.cos(theta);
            const sin = Math.sin(theta);
            
            const x0 = cos * rho;
            const y0 = sin * rho;
            
            const x1 = x0 + 1000 * (-sin);
            const y1 = y0 + 1000 * (cos);
            const x2 = x0 - 1000 * (-sin);
            const y2 = y0 - 1000 * (cos);
            
            // Opacity based on votes in Hough space
            const alpha = (votes / maxVotes) * this.lineOpacity * 0.5;
            ctx.strokeStyle = `rgba(100, 200, 255, ${alpha})`;
            ctx.lineWidth = 0.5; // Very thin for accumulation
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        });
    }

    loadSampleForHough() {
        const ctx = this.houghInputCtx;
        const width = this.houghInputCanvas.width;
        const height = this.houghInputCanvas.height;

        // Clear canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Create random seed for reproducibility
        const random = (seed) => {
            const x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        };

        // Draw 8-12 random lines with varying widths and positions
        const numLines = 10;
        ctx.strokeStyle = '#ffffff';

        for (let i = 0; i < numLines; i++) {
            // Random line width between 1 and 5
            const lineWidth = 1 + Math.floor(random(i * 7) * 4);
            ctx.lineWidth = lineWidth;

            // Random start and end points
            const x1 = random(i * 3) * width;
            const y1 = random(i * 5) * height;
            const x2 = random(i * 11) * width;
            const y2 = random(i * 13) * height;

            // Ensure lines are reasonably long
            const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            if (dist < width * 0.3) continue;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        // Add a few shorter accent lines with different opacities
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        for (let i = 0; i < 5; i++) {
            ctx.lineWidth = 1 + Math.floor(random(i * 17) * 2);
            const x1 = random(i * 19) * width;
            const y1 = random(i * 23) * height;
            const angle = random(i * 29) * Math.PI * 2;
            const length = 50 + random(i * 31) * 100;
            const x2 = x1 + Math.cos(angle) * length;
            const y2 = y1 + Math.sin(angle) * length;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        this.updateHoughSpace();
    }

    // Circle detection methods
    updateCircleHoughSpace() {
        const imageData = this.circleInputCtx.getImageData(
            0, 0,
            this.circleInputCanvas.width,
            this.circleInputCanvas.height
        );

        const minRadius = parseInt(document.getElementById('minRadius').value);
        const maxRadius = parseInt(document.getElementById('maxRadius').value);

        // Use GPU if available, otherwise CPU
        let houghSpace;
        if (this.houghCircleGPU && this.houghCircleGPU.useGPU) {
            // GPU path - much faster!
            const midRadius = Math.floor((minRadius + maxRadius) / 2);
            houghSpace = this.houghCircleGPU.computeHoughSpaceGPU(imageData, midRadius);
            // Store as if it's a single slice for compatibility
            this.houghCircle.houghSpace = [houghSpace];
            this.houghCircle.numRadii = 1;
        } else {
            // CPU fallback
            houghSpace = this.houghCircle.computeHoughSpace(imageData, minRadius, maxRadius);
        }
        
        // Display a slice of the Hough space at middle radius
        const numRadii = this.houghCircle.numRadii;
        const midRadiusIdx = Math.floor(numRadii / 2);
        this.currentRadiusSlice = minRadius + midRadiusIdx * this.houghCircle.radiusStep;
        document.getElementById('currentRadius').textContent = this.currentRadiusSlice;
        
        this.displayCircleHoughSpace(midRadiusIdx);
        
        // Clear and redraw output canvas
        this.circleOutputCtx.clearRect(0, 0, this.circleOutputCanvas.width, this.circleOutputCanvas.height);
        this.circleOutputCtx.drawImage(this.circleInputCanvas, 0, 0);
        
        // Update circle field based on mode
        if (this.circleFieldMode === 'accumulation') {
            this.displayCircleFieldAccumulation();
        }
    }

    displayCircleHoughSpace(radiusIndex) {
        const slice = this.houghCircle.getHoughSpaceSlice(radiusIndex);
        if (!slice) return;

        const width = this.houghCircle.width;
        const height = this.houghCircle.height;

        // Find max value for normalization
        let maxVal = 0;
        for (let i = 0; i < slice.length; i++) {
            maxVal = Math.max(maxVal, slice[i]);
        }

        // Create image data
        const imageData = this.circleHoughSpaceCtx.createImageData(width, height);
        for (let i = 0; i < slice.length; i++) {
            const value = maxVal > 0 ? (slice[i] / maxVal) * 255 : 0;
            imageData.data[i * 4] = value;
            imageData.data[i * 4 + 1] = value;
            imageData.data[i * 4 + 2] = value;
            imageData.data[i * 4 + 3] = 255;
        }

        this.circleHoughSpaceCtx.putImageData(imageData, 0, 0);
    }

    detectCircles() {
        const threshold = parseInt(document.getElementById('circleThreshold').value);
        const startTime = performance.now();

        const imageData = this.circleInputCtx.getImageData(
            0, 0,
            this.circleInputCanvas.width,
            this.circleInputCanvas.height
        );

        const minRadius = parseInt(document.getElementById('minRadius').value);
        const maxRadius = parseInt(document.getElementById('maxRadius').value);

        // Compute and detect
        this.houghCircle.computeHoughSpace(imageData, minRadius, maxRadius);
        const circles = this.houghCircle.detectCircles(threshold, 30);

        const endTime = performance.now();

        // Display results
        this.displayDetectedCircles(circles);

        // Update stats
        document.getElementById('circlesDetected').textContent = circles.length;
        document.getElementById('circleTime').textContent = `${(endTime - startTime).toFixed(2)} ms`;
    }

    displayDetectedCircles(circles) {
        const canvas = this.circleOutputCanvas;
        const ctx = this.circleOutputCtx;

        // Copy input image
        ctx.drawImage(this.circleInputCanvas, 0, 0);

        // Draw detected circles
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;

        circles.forEach(circle => {
            const { x, y, r } = circle;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.stroke();

            // Draw center point
            ctx.fillStyle = '#00ff00';
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        });

        // Display circle field based on mode
        if (this.circleFieldMode === 'accumulation') {
            this.displayCircleFieldAccumulation();
        }
    }

    displayCircleFieldAccumulation() {
        const canvas = this.circleOutputCanvas;
        const ctx = this.circleOutputCtx;

        // Get the Hough space slice at current radius
        const numRadii = this.houghCircle.numRadii;
        const midRadiusIdx = Math.floor(numRadii / 2);
        const slice = this.houghCircle.getHoughSpaceSlice(midRadiusIdx);
        
        if (!slice) return;
        
        const width = this.houghCircle.width;
        const height = this.houghCircle.height;
        
        // Find max value
        let maxVal = 0;
        for (let i = 0; i < slice.length; i++) {
            maxVal = Math.max(maxVal, slice[i]);
        }
        
        // Overlay accumulation as a heatmap - BRIGHTER
        const imageData = ctx.createImageData(width, height);
        for (let i = 0; i < slice.length; i++) {
            const value = maxVal > 0 ? (slice[i] / maxVal) : 0;
            // Boost brightness: square root to enhance mid-values, multiply by 2
            const boostedValue = Math.min(1, Math.sqrt(value) * 1.5);
            const alpha = boostedValue * this.circleOpacity * 255;
            // Bright gold/yellow heatmap overlay
            imageData.data[i * 4] = 255 * boostedValue;
            imageData.data[i * 4 + 1] = 215 * boostedValue;
            imageData.data[i * 4 + 2] = 0;
            imageData.data[i * 4 + 3] = alpha;
        }
        
        // Blend with existing image
        ctx.globalAlpha = 1;
        ctx.putImageData(imageData, 0, 0);
    }

    loadSampleForCircles() {
        const ctx = this.circleInputCtx;
        const width = this.circleInputCanvas.width;
        const height = this.circleInputCanvas.height;

        // Clear canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Draw some circles
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;

        // Large circle
        ctx.beginPath();
        ctx.arc(width * 0.3, height * 0.3, 60, 0, Math.PI * 2);
        ctx.stroke();

        // Medium circle
        ctx.beginPath();
        ctx.arc(width * 0.7, height * 0.4, 40, 0, Math.PI * 2);
        ctx.stroke();

        // Small circle
        ctx.beginPath();
        ctx.arc(width * 0.5, height * 0.7, 25, 0, Math.PI * 2);
        ctx.stroke();

        // Overlapping circles
        ctx.beginPath();
        ctx.arc(width * 0.6, height * 0.6, 35, 0, Math.PI * 2);
        ctx.stroke();

        this.updateCircleHoughSpace();
    }

    // Shape detection methods
    detectArbitraryShape() {
        const minScale = parseFloat(document.getElementById('minScale').value);
        const maxScale = parseFloat(document.getElementById('maxScale').value);
        const angleStepDeg = parseInt(document.getElementById('angleStep').value);
        const angleStep = (angleStepDeg * Math.PI) / 180;

        const imageData = this.shapeTargetCtx.getImageData(
            0, 0,
            this.shapeTargetCanvas.width,
            this.shapeTargetCanvas.height
        );

        console.log(`Starting shape detection: scale ${minScale}-${maxScale}, angle step ${angleStepDeg}°`);
        const startTime = performance.now();
        
        // Use coarser scale step for speed (0.3 instead of 0.1)
        const detections = this.houghShape.detectShape(
            imageData,
            minScale,
            maxScale,
            0.3,
            angleStep
        );
        const endTime = performance.now();
        console.log(`Shape detection completed in ${(endTime - startTime).toFixed(0)}ms`);

        // Display results
        this.shapeOutputCtx.drawImage(this.shapeTargetCanvas, 0, 0);

        detections.forEach(detection => {
            this.houghShape.drawDetectedShape(this.shapeOutputCtx, detection);
        });

        // Update stats
        document.getElementById('shapesDetected').textContent = detections.length;
        document.getElementById('shapeTime').textContent = `${(endTime - startTime).toFixed(2)} ms`;

        console.log(`Found ${detections.length} instances of the shape`);
    }

    loadSampleForShape() {
        const templateCtx = this.shapeTemplateCtx;
        const targetCtx = this.shapeTargetCtx;
        const width = this.shapeTemplateCanvas.width;
        const height = this.shapeTemplateCanvas.height;

        // Clear both canvases
        templateCtx.fillStyle = '#000000';
        templateCtx.fillRect(0, 0, width, height);
        targetCtx.fillStyle = '#000000';
        targetCtx.fillRect(0, 0, width, height);

        // Helper function to draw a star
        const drawStar = (ctx, cx, cy, r, rotation = 0) => {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rotation);
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const angle = (i * 4 * Math.PI / 5) - Math.PI / 2;
                const x = r * Math.cos(angle);
                const y = r * Math.sin(angle);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
        };

        // Draw template: a star at standard size
        templateCtx.strokeStyle = '#ffffff';
        templateCtx.lineWidth = 3;
        drawStar(templateCtx, width * 0.45, height * 0.5, 35, 0);

        // Draw target: multiple stars at different scales and rotations
        targetCtx.strokeStyle = '#ffffff';
        targetCtx.lineWidth = 3;

        // Star 1: smaller, rotated 30°
        drawStar(targetCtx, width * 0.25, height * 0.25, 25, Math.PI / 6);

        // Star 2: original size, rotated 90°
        drawStar(targetCtx, width * 0.65, height * 0.35, 35, Math.PI / 2);

        // Star 3: larger, rotated -45°
        drawStar(targetCtx, width * 0.35, height * 0.7, 45, -Math.PI / 4);

        // Star 4: medium, rotated 180°
        drawStar(targetCtx, width * 0.75, height * 0.75, 30, Math.PI);

        console.log('Sample loaded! Click "Build Template" then "Detect Shape"');
        console.log('Should detect 4 stars at different scales and rotations');
        
        // Auto-create template for convenience
        setTimeout(() => {
            const imageData = this.shapeTemplateCtx.getImageData(
                0, 0,
                this.shapeTemplateCanvas.width,
                this.shapeTemplateCanvas.height
            );
            this.houghShape.createTemplate(imageData);
            this.setTemplateActive(true);
            console.log('Template auto-created from sample');
        }, 100);
    }

    applySepiaFilter(imageData, intensity = 1.0) {
        const data = new Uint8ClampedArray(imageData.data);
        const len = data.length;
        
        for (let i = 0; i < len; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            const tr = 0.393 * r + 0.769 * g + 0.189 * b;
            const tg = 0.349 * r + 0.686 * g + 0.168 * b;
            const tb = 0.272 * r + 0.534 * g + 0.131 * b;
            
            // Blend with original based on intensity
            data[i] = r + (tr - r) * intensity;
            data[i + 1] = g + (tg - g) * intensity;
            data[i + 2] = b + (tb - b) * intensity;
        }
        
        return new ImageData(data, imageData.width, imageData.height);
    }

    applyVignetteFilter(imageData, intensity = 1.0) {
        const data = new Uint8ClampedArray(imageData.data);
        const width = imageData.width;
        const height = imageData.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                
                const dx = x - centerX;
                const dy = y - centerY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const vignette = 1 - (dist / maxDist) * intensity;
                
                data[i] *= vignette;
                data[i + 1] *= vignette;
                data[i + 2] *= vignette;
            }
        }
        
        return new ImageData(data, width, height);
    }

    applyPixelateFilter(imageData, blockSize = 10) {
        const data = new Uint8ClampedArray(imageData.data);
        const width = imageData.width;
        const height = imageData.height;
        
        if (blockSize < 1) blockSize = 1;
        
        for (let y = 0; y < height; y += blockSize) {
            for (let x = 0; x < width; x += blockSize) {
                // Calculate average color in block
                let r = 0, g = 0, b = 0, count = 0;
                
                for (let by = 0; by < blockSize && y + by < height; by++) {
                    for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
                        const i = ((y + by) * width + (x + bx)) * 4;
                        r += data[i];
                        g += data[i + 1];
                        b += data[i + 2];
                        count++;
                    }
                }
                
                r = Math.floor(r / count);
                g = Math.floor(g / count);
                b = Math.floor(b / count);
                
                // Apply average color to entire block
                for (let by = 0; by < blockSize && y + by < height; by++) {
                    for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
                        const i = ((y + by) * width + (x + bx)) * 4;
                        data[i] = r;
                        data[i + 1] = g;
                        data[i + 2] = b;
                    }
                }
            }
        }
        
        return new ImageData(data, width, height);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AlgorithmDemo();
});
