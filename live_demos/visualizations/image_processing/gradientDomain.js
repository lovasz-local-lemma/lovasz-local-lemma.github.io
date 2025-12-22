export class GradientDomainProcessor {
    constructor() {
        this.mask = null;
        this.gradientField = null;
    }

    // Poisson blending / content-aware fill
    poissonBlending(imageData, mask) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        
        // Compute gradients
        const gradX = new Float32Array(width * height * 3);
        const gradY = new Float32Array(width * height * 3);
        
        for (let y = 0; y < height - 1; y++) {
            for (let x = 0; x < width - 1; x++) {
                const idx = y * width + x;
                const idxRight = y * width + (x + 1);
                const idxDown = (y + 1) * width + x;
                
                for (let c = 0; c < 3; c++) {
                    const pixelIdx = idx * 4 + c;
                    const rightIdx = idxRight * 4 + c;
                    const downIdx = idxDown * 4 + c;
                    
                    gradX[idx * 3 + c] = data[rightIdx] - data[pixelIdx];
                    gradY[idx * 3 + c] = data[downIdx] - data[pixelIdx];
                }
            }
        }
        
        // Solve Poisson equation using Jacobi iteration
        const result = new ImageData(width, height);
        const solution = new Float32Array(width * height * 3);
        
        // Initialize with original values
        for (let i = 0; i < data.length; i++) {
            result.data[i] = data[i];
            if (i % 4 < 3) {
                solution[Math.floor(i / 4) * 3 + (i % 4)] = data[i];
            }
        }
        
        // Jacobi iterations
        const iterations = 50;
        for (let iter = 0; iter < iterations; iter++) {
            const temp = new Float32Array(solution);
            
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = y * width + x;
                    
                    if (mask && !mask[idx]) continue;
                    
                    for (let c = 0; c < 3; c++) {
                        const left = (y * width + (x - 1)) * 3 + c;
                        const right = (y * width + (x + 1)) * 3 + c;
                        const up = ((y - 1) * width + x) * 3 + c;
                        const down = ((y + 1) * width + x) * 3 + c;
                        const current = idx * 3 + c;
                        
                        // Laplacian from gradients
                        const divGrad = gradX[current] - gradX[left] + 
                                       gradY[current] - gradY[up];
                        
                        // Update
                        temp[current] = (solution[left] + solution[right] + 
                                        solution[up] + solution[down] - divGrad) / 4;
                    }
                }
            }
            
            solution.set(temp);
        }
        
        // Copy solution to result
        for (let i = 0; i < width * height; i++) {
            result.data[i * 4] = Math.max(0, Math.min(255, solution[i * 3]));
            result.data[i * 4 + 1] = Math.max(0, Math.min(255, solution[i * 3 + 1]));
            result.data[i * 4 + 2] = Math.max(0, Math.min(255, solution[i * 3 + 2]));
            result.data[i * 4 + 3] = 255;
        }
        
        this.gradientField = { gradX, gradY, width, height };
        
        return result;
    }

    // Compute energy map for seam carving
    computeEnergyMap(imageData, mask = null) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const energy = new Float32Array(width * height);
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                
                // If mask exists and pixel is not in mask, set very high energy to protect it
                if (mask && !mask[idx]) {
                    energy[idx] = 1e9; // Very high energy - avoid removing
                    continue;
                }
                
                // Gradient energy
                let gx = 0, gy = 0;
                for (let c = 0; c < 3; c++) {
                    const left = (y * width + (x - 1)) * 4 + c;
                    const right = (y * width + (x + 1)) * 4 + c;
                    const up = ((y - 1) * width + x) * 4 + c;
                    const down = ((y + 1) * width + x) * 4 + c;
                    
                    gx += Math.abs(data[right] - data[left]);
                    gy += Math.abs(data[down] - data[up]);
                }
                
                energy[idx] = Math.sqrt(gx * gx + gy * gy);
                // Lower energy in masked region to prefer removing from there
                if (mask && mask[idx]) {
                    energy[idx] *= 0.5;
                }
            }
        }
        
        this.energyMap = energy;
        return energy;
    }

    // Seam carving - find and remove vertical seam
    seamCarving(imageData, mask = null, removeCount = 50) {
        let currentData = imageData;
        let currentMask = mask;
        const seams = [];
        
        for (let i = 0; i < removeCount; i++) {
            const energy = this.computeEnergyMap(currentData, currentMask);
            const seam = this.findVerticalSeam(energy, currentData.width, currentData.height);
            seams.push(seam);
            currentData = this.removeSeam(currentData, seam);
            // Update mask if it exists
            if (currentMask) {
                currentMask = this.updateMaskForSeam(currentMask, seam, currentData.width + 1, currentData.height);
            }
        }
        
        return { result: currentData, seams };
    }

    findVerticalSeam(energy, width, height) {
        // Dynamic programming to find minimum energy seam
        const dp = new Float32Array(width * height);
        const backtrack = new Int32Array(width * height);
        
        // Initialize first row
        for (let x = 0; x < width; x++) {
            dp[x] = energy[x];
        }
        
        // Fill DP table
        for (let y = 1; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                let minEnergy = Infinity;
                let minX = x;
                
                // Check three pixels above
                for (let dx = -1; dx <= 1; dx++) {
                    const prevX = x + dx;
                    if (prevX >= 0 && prevX < width) {
                        const prevIdx = (y - 1) * width + prevX;
                        if (dp[prevIdx] < minEnergy) {
                            minEnergy = dp[prevIdx];
                            minX = prevX;
                        }
                    }
                }
                
                dp[idx] = energy[idx] + minEnergy;
                backtrack[idx] = minX;
            }
        }
        
        // Find minimum in last row
        let minX = 0;
        let minEnergy = dp[(height - 1) * width];
        for (let x = 1; x < width; x++) {
            const idx = (height - 1) * width + x;
            if (dp[idx] < minEnergy) {
                minEnergy = dp[idx];
                minX = x;
            }
        }
        
        // Backtrack to find seam
        const seam = new Int32Array(height);
        seam[height - 1] = minX;
        for (let y = height - 2; y >= 0; y--) {
            const idx = (y + 1) * width + seam[y + 1];
            seam[y] = backtrack[idx];
        }
        
        return seam;
    }

    removeSeam(imageData, seam) {
        const width = imageData.width;
        const height = imageData.height;
        const newWidth = width - 1;
        const result = new ImageData(newWidth, height);
        
        for (let y = 0; y < height; y++) {
            const seamX = seam[y];
            let dstX = 0;
            
            for (let x = 0; x < width; x++) {
                if (x === seamX) continue;
                
                const srcIdx = (y * width + x) * 4;
                const dstIdx = (y * newWidth + dstX) * 4;
                
                result.data[dstIdx] = imageData.data[srcIdx];
                result.data[dstIdx + 1] = imageData.data[srcIdx + 1];
                result.data[dstIdx + 2] = imageData.data[srcIdx + 2];
                result.data[dstIdx + 3] = imageData.data[srcIdx + 3];
                
                dstX++;
            }
        }
        
        return result;
    }

    // Distance transform
    distanceTransform(imageData, threshold = 128) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        
        // Binary mask
        const binary = new Uint8Array(width * height);
        for (let i = 0; i < width * height; i++) {
            const intensity = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
            binary[i] = intensity > threshold ? 1 : 0;
        }
        
        // Distance transform using two passes
        const dist = new Float32Array(width * height);
        const INF = width + height;
        
        // Initialize
        for (let i = 0; i < dist.length; i++) {
            dist[i] = binary[i] ? 0 : INF;
        }
        
        // Forward pass
        for (let y = 1; y < height; y++) {
            for (let x = 1; x < width; x++) {
                const idx = y * width + x;
                if (binary[idx]) continue;
                
                const left = y * width + (x - 1);
                const up = (y - 1) * width + x;
                const upLeft = (y - 1) * width + (x - 1);
                const upRight = (y - 1) * width + (x + 1);
                
                dist[idx] = Math.min(
                    dist[idx],
                    dist[left] + 1,
                    dist[up] + 1,
                    dist[upLeft] + 1.414,
                    x < width - 1 ? dist[upRight] + 1.414 : INF
                );
            }
        }
        
        // Backward pass
        for (let y = height - 2; y >= 0; y--) {
            for (let x = width - 2; x >= 0; x--) {
                const idx = y * width + x;
                if (binary[idx]) continue;
                
                const right = y * width + (x + 1);
                const down = (y + 1) * width + x;
                const downLeft = (y + 1) * width + (x - 1);
                const downRight = (y + 1) * width + (x + 1);
                
                dist[idx] = Math.min(
                    dist[idx],
                    dist[right] + 1,
                    dist[down] + 1,
                    dist[downRight] + 1.414,
                    x > 0 ? dist[downLeft] + 1.414 : INF
                );
            }
        }
        
        // Normalize and create output
        let maxDist = 0;
        for (let i = 0; i < dist.length; i++) {
            if (dist[i] < INF) maxDist = Math.max(maxDist, dist[i]);
        }
        
        const result = new ImageData(width, height);
        for (let i = 0; i < dist.length; i++) {
            const value = dist[i] < INF ? (dist[i] / maxDist) * 255 : 0;
            result.data[i * 4] = value;
            result.data[i * 4 + 1] = value;
            result.data[i * 4 + 2] = value;
            result.data[i * 4 + 3] = 255;
        }
        
        this.distanceField = dist;
        
        return result;
    }

    // Visualize gradient field
    visualizeGradientField(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        
        const gradX = new Float32Array(width * height);
        const gradY = new Float32Array(width * height);
        const magnitude = new Float32Array(width * height);
        
        let maxMag = 0;
        
        for (let y = 0; y < height - 1; y++) {
            for (let x = 0; x < width - 1; x++) {
                const idx = y * width + x;
                const idxRight = y * width + (x + 1);
                const idxDown = (y + 1) * width + x;
                
                let gx = 0, gy = 0;
                for (let c = 0; c < 3; c++) {
                    gx += data[idxRight * 4 + c] - data[idx * 4 + c];
                    gy += data[idxDown * 4 + c] - data[idx * 4 + c];
                }
                
                gradX[idx] = gx / 3;
                gradY[idx] = gy / 3;
                magnitude[idx] = Math.sqrt(gx * gx + gy * gy) / 3;
                maxMag = Math.max(maxMag, magnitude[idx]);
            }
        }
        
        // Create visualization
        const result = new ImageData(width, height);
        for (let i = 0; i < width * height; i++) {
            const mag = (magnitude[i] / maxMag) * 255;
            result.data[i * 4] = mag;
            result.data[i * 4 + 1] = mag;
            result.data[i * 4 + 2] = mag;
            result.data[i * 4 + 3] = 255;
        }
        
        this.gradientField = { gradX, gradY, magnitude, width, height };
        
        return result;
    }

    getGradientField() {
        return this.gradientField;
    }

    getEnergyMap() {
        return this.energyMap;
    }

    getDistanceField() {
        return this.distanceField;
    }

    // Update mask after removing a seam
    updateMaskForSeam(mask, seam, oldWidth, height) {
        const newWidth = oldWidth - 1;
        const newMask = new Uint8Array(newWidth * height);
        
        for (let y = 0; y < height; y++) {
            const seamX = seam[y];
            let dstX = 0;
            
            for (let x = 0; x < oldWidth; x++) {
                if (x === seamX) continue;
                
                const srcIdx = y * oldWidth + x;
                const dstIdx = y * newWidth + dstX;
                newMask[dstIdx] = mask[srcIdx];
                
                dstX++;
            }
        }
        
        return newMask;
    }
}
