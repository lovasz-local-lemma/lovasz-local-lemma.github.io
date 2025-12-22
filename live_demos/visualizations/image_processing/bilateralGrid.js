export class BilateralGrid {
    constructor() {
        this.grid = null;
        this.gridWidth = 0;
        this.gridHeight = 0;
        this.gridDepth = 0;
    }

    async filter(imageData, spatialSigma, rangeSigma, gridScale) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        // Calculate grid dimensions
        this.gridWidth = Math.ceil(width / gridScale);
        this.gridHeight = Math.ceil(height / gridScale);
        this.gridDepth = Math.ceil(256 / (rangeSigma * 255));

        // Create bilateral grid
        this.grid = this.createGrid(data, width, height, gridScale, rangeSigma);

        // Blur the grid
        this.blurGrid(spatialSigma, rangeSigma);

        // Slice the grid to get output
        const output = this.sliceGrid(data, width, height, gridScale, rangeSigma);

        return {
            output,
            grid: this.grid,
            gridWidth: this.gridWidth,
            gridHeight: this.gridHeight,
            gridDepth: this.gridDepth
        };
    }

    createGrid(data, width, height, gridScale, rangeSigma) {
        const gridSize = this.gridWidth * this.gridHeight * this.gridDepth;
        const grid = new Float32Array(gridSize * 4); // RGBA + weight

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                
                // Convert to intensity for grid depth
                const intensity = (r + g + b) / 3;
                
                // Calculate grid coordinates
                const gx = Math.floor(x / gridScale);
                const gy = Math.floor(y / gridScale);
                const gz = Math.floor(intensity / (rangeSigma * 255));
                
                // Clamp to grid bounds
                const gxc = Math.max(0, Math.min(gx, this.gridWidth - 1));
                const gyc = Math.max(0, Math.min(gy, this.gridHeight - 1));
                const gzc = Math.max(0, Math.min(gz, this.gridDepth - 1));
                
                const gridIdx = (gzc * this.gridHeight * this.gridWidth + gyc * this.gridWidth + gxc) * 4;
                
                grid[gridIdx] += r;
                grid[gridIdx + 1] += g;
                grid[gridIdx + 2] += b;
                grid[gridIdx + 3] += 1; // weight
            }
        }

        // Normalize by weight
        for (let i = 0; i < gridSize; i++) {
            const idx = i * 4;
            const weight = grid[idx + 3];
            if (weight > 0) {
                grid[idx] /= weight;
                grid[idx + 1] /= weight;
                grid[idx + 2] /= weight;
            }
        }

        return grid;
    }

    blurGrid(spatialSigma, rangeSigma) {
        // Simple box blur in 3D
        const tempGrid = new Float32Array(this.grid.length);
        
        const radius = Math.ceil(spatialSigma / 4);
        
        // Blur in X direction
        for (let z = 0; z < this.gridDepth; z++) {
            for (let y = 0; y < this.gridHeight; y++) {
                for (let x = 0; x < this.gridWidth; x++) {
                    let sumR = 0, sumG = 0, sumB = 0, sumW = 0;
                    let count = 0;
                    
                    for (let dx = -radius; dx <= radius; dx++) {
                        const nx = x + dx;
                        if (nx >= 0 && nx < this.gridWidth) {
                            const idx = (z * this.gridHeight * this.gridWidth + y * this.gridWidth + nx) * 4;
                            sumR += this.grid[idx];
                            sumG += this.grid[idx + 1];
                            sumB += this.grid[idx + 2];
                            sumW += this.grid[idx + 3];
                            count++;
                        }
                    }
                    
                    const idx = (z * this.gridHeight * this.gridWidth + y * this.gridWidth + x) * 4;
                    tempGrid[idx] = sumR / count;
                    tempGrid[idx + 1] = sumG / count;
                    tempGrid[idx + 2] = sumB / count;
                    tempGrid[idx + 3] = sumW / count;
                }
            }
        }
        
        this.grid = tempGrid;
    }

    sliceGrid(data, width, height, gridScale, rangeSigma) {
        const output = new ImageData(width, height);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                
                const intensity = (r + g + b) / 3;
                
                // Calculate grid coordinates
                const gx = x / gridScale;
                const gy = y / gridScale;
                const gz = intensity / (rangeSigma * 255);
                
                // Trilinear interpolation
                const value = this.trilinearInterpolate(gx, gy, gz);
                
                output.data[idx] = Math.max(0, Math.min(255, value[0]));
                output.data[idx + 1] = Math.max(0, Math.min(255, value[1]));
                output.data[idx + 2] = Math.max(0, Math.min(255, value[2]));
                output.data[idx + 3] = 255;
            }
        }
        
        return output;
    }

    trilinearInterpolate(x, y, z) {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const z0 = Math.floor(z);
        const x1 = Math.min(x0 + 1, this.gridWidth - 1);
        const y1 = Math.min(y0 + 1, this.gridHeight - 1);
        const z1 = Math.min(z0 + 1, this.gridDepth - 1);
        
        const xd = x - x0;
        const yd = y - y0;
        const zd = z - z0;
        
        const getValue = (xi, yi, zi) => {
            const idx = (zi * this.gridHeight * this.gridWidth + yi * this.gridWidth + xi) * 4;
            return [this.grid[idx], this.grid[idx + 1], this.grid[idx + 2]];
        };
        
        const c000 = getValue(x0, y0, z0);
        const c100 = getValue(x1, y0, z0);
        const c010 = getValue(x0, y1, z0);
        const c110 = getValue(x1, y1, z0);
        const c001 = getValue(x0, y0, z1);
        const c101 = getValue(x1, y0, z1);
        const c011 = getValue(x0, y1, z1);
        const c111 = getValue(x1, y1, z1);
        
        const result = [0, 0, 0];
        for (let i = 0; i < 3; i++) {
            const c00 = c000[i] * (1 - xd) + c100[i] * xd;
            const c01 = c001[i] * (1 - xd) + c101[i] * xd;
            const c10 = c010[i] * (1 - xd) + c110[i] * xd;
            const c11 = c011[i] * (1 - xd) + c111[i] * xd;
            
            const c0 = c00 * (1 - yd) + c10 * yd;
            const c1 = c01 * (1 - yd) + c11 * yd;
            
            result[i] = c0 * (1 - zd) + c1 * zd;
        }
        
        return result;
    }
}
