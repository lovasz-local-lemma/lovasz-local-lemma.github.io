export class HoughCircleTransform {
    constructor() {
        this.width = 512;
        this.height = 512;
        this.minRadius = 10;
        this.maxRadius = 100;
        this.radiusStep = 3; // Increased from 2 for speed (33% fewer radii)
        this.lastHoughSpace = null;
        this.lastImageData = null;
        this.downsampleFactor = 2; // Downsample for initial detection
    }

    // Compute 3D Hough space for circles (x, y, r) - OPTIMIZED
    computeHoughSpace(imageData, minRadius = 10, maxRadius = 100) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        
        this.width = width;
        this.height = height;
        this.minRadius = minRadius;
        this.maxRadius = maxRadius;
        
        const numRadii = Math.floor((maxRadius - minRadius) / this.radiusStep) + 1;
        
        // 3D accumulator: [x][y][r]
        const accumulator = new Float32Array(width * height * numRadii);
        
        // Find edge pixels - sample every pixel for better detection
        const edges = [];
        const sampleStep = 1;
        for (let y = 0; y < height; y += sampleStep) {
            for (let x = 0; x < width; x += sampleStep) {
                const idx = (y * width + x) * 4;
                const intensity = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                
                // Consider bright pixels as edges
                if (intensity > 100) {
                    edges.push({ x, y });
                }
            }
        }
        
        // Limit edges for extreme cases
        const maxEdges = 1000;
        let processedEdges = edges;
        if (edges.length > maxEdges) {
            const step = Math.ceil(edges.length / maxEdges);
            processedEdges = edges.filter((_, i) => i % step === 0);
            console.log(`Circle detection: reduced ${edges.length} edges to ${processedEdges.length} for speed`);
        }
        
        // For each edge pixel, vote for possible circle centers
        processedEdges.forEach(edge => {
            const { x: x1, y: y1 } = edge;
            
            // Try different radii
            for (let rIdx = 0; rIdx < numRadii; rIdx++) {
                const r = minRadius + rIdx * this.radiusStep;
                
                // ADAPTIVE SAMPLING: fewer samples for small circles, more for large
                // Balanced sampling for good detection with reasonable speed
                const numSamples = Math.max(8, Math.min(32, Math.floor(Math.PI * r / 1.5)));
                const angleStep = (2 * Math.PI) / numSamples;
                
                for (let i = 0; i < numSamples; i++) {
                    const theta = i * angleStep;
                    const x0 = Math.round(x1 - r * Math.cos(theta));
                    const y0 = Math.round(y1 - r * Math.sin(theta));
                    
                    // Vote for this center
                    if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < height) {
                        const accIdx = (rIdx * height * width) + (y0 * width) + x0;
                        accumulator[accIdx]++;
                    }
                }
            }
        });
        
        this.lastHoughSpace = accumulator;
        this.lastImageData = imageData;
        this.numRadii = numRadii;
        
        return accumulator;
    }

    // Detect circles using non-maximum suppression
    detectCircles(threshold = 8, minDistance = 20) {
        if (!this.lastHoughSpace) return [];
        
        const circles = [];
        const width = this.width;
        const height = this.height;
        const numRadii = this.numRadii;
        
        // Find local maxima in 3D Hough space
        for (let rIdx = 0; rIdx < numRadii; rIdx++) {
            const r = this.minRadius + rIdx * this.radiusStep;
            
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = (rIdx * height * width) + (y * width) + x;
                    const value = this.lastHoughSpace[idx];
                    
                    if (value < threshold) continue;
                    
                    // Check if local maximum in 3D neighborhood
                    let isMax = true;
                    
                    for (let dr = -1; dr <= 1 && isMax; dr++) {
                        const rIdx2 = rIdx + dr;
                        if (rIdx2 < 0 || rIdx2 >= numRadii) continue;
                        
                        for (let dy = -1; dy <= 1 && isMax; dy++) {
                            for (let dx = -1; dx <= 1 && isMax; dx++) {
                                if (dx === 0 && dy === 0 && dr === 0) continue;
                                
                                const x2 = x + dx;
                                const y2 = y + dy;
                                
                                if (x2 >= 0 && x2 < width && y2 >= 0 && y2 < height) {
                                    const idx2 = (rIdx2 * height * width) + (y2 * width) + x2;
                                    if (this.lastHoughSpace[idx2] > value) {
                                        isMax = false;
                                    }
                                }
                            }
                        }
                    }
                    
                    if (isMax) {
                        circles.push({ x, y, r, votes: value });
                    }
                }
            }
        }
        
        // Sort by votes
        circles.sort((a, b) => b.votes - a.votes);
        
        // Non-maximum suppression: remove overlapping circles
        const filtered = [];
        for (const circle of circles) {
            let tooClose = false;
            
            for (const existing of filtered) {
                const dist = Math.sqrt(
                    Math.pow(circle.x - existing.x, 2) + 
                    Math.pow(circle.y - existing.y, 2)
                );
                
                if (dist < minDistance) {
                    tooClose = true;
                    break;
                }
            }
            
            if (!tooClose) {
                filtered.push(circle);
            }
        }
        
        return filtered;
    }

    // Visualize Hough space as 2D slices (one per radius)
    getHoughSpaceSlice(radiusIndex) {
        if (!this.lastHoughSpace) return null;
        
        const width = this.width;
        const height = this.height;
        const slice = new Float32Array(width * height);
        
        const offset = radiusIndex * width * height;
        
        for (let i = 0; i < width * height; i++) {
            slice[i] = this.lastHoughSpace[offset + i];
        }
        
        return slice;
    }

    // Get all circles above threshold for visualization
    getAllCircles(threshold = 10) {
        if (!this.lastHoughSpace) return [];
        
        const circles = [];
        const width = this.width;
        const height = this.height;
        const numRadii = this.numRadii;
        
        for (let rIdx = 0; rIdx < numRadii; rIdx++) {
            const r = this.minRadius + rIdx * this.radiusStep;
            
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (rIdx * height * width) + (y * width) + x;
                    const value = this.lastHoughSpace[idx];
                    
                    if (value > threshold) {
                        circles.push({ x, y, r, votes: value });
                    }
                }
            }
        }
        
        return circles;
    }
}
