export class HoughTransform {
    constructor() {
        this.width = 512;
        this.height = 512;
        this.numRho = 512;
        this.numTheta = 360;
        this.maxRho = Math.sqrt(this.width * this.width + this.height * this.height);
        this.lastHoughSpace = null;
        this.lastImageData = null;
    }

    computeHoughSpace(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        
        // Update dimensions
        this.width = width;
        this.height = height;
        this.maxRho = Math.sqrt(width * width + height * height);

        // Initialize accumulator
        const accumulator = new Float32Array(this.numRho * this.numTheta);

        // Precompute sin and cos values
        const sinTable = new Float32Array(this.numTheta);
        const cosTable = new Float32Array(this.numTheta);
        for (let t = 0; t < this.numTheta; t++) {
            const theta = (t * Math.PI) / this.numTheta;
            sinTable[t] = Math.sin(theta);
            cosTable[t] = Math.cos(theta);
        }

        // Edge detection (simple threshold)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const intensity = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

                // Only process edge pixels (bright pixels)
                if (intensity > 128) {
                    // Vote in Hough space
                    for (let t = 0; t < this.numTheta; t++) {
                        const rho = x * cosTable[t] + y * sinTable[t];
                        const rhoIdx = Math.floor(((rho + this.maxRho) / (2 * this.maxRho)) * this.numRho);

                        if (rhoIdx >= 0 && rhoIdx < this.numRho) {
                            const accIdx = t * this.numRho + rhoIdx;
                            accumulator[accIdx]++;
                        }
                    }
                }
            }
        }

        this.lastHoughSpace = accumulator;
        this.lastImageData = imageData;
        return accumulator;
    }

    detectLines(imageData, threshold) {
        const houghSpace = this.computeHoughSpace(imageData);

        // Find local maxima in Hough space
        const lines = [];
        const neighborhoodSize = 5;

        for (let t = neighborhoodSize; t < this.numTheta - neighborhoodSize; t++) {
            for (let r = neighborhoodSize; r < this.numRho - neighborhoodSize; r++) {
                const idx = t * this.numRho + r;
                const value = houghSpace[idx];

                if (value > threshold) {
                    // Check if local maximum
                    let isMax = true;
                    for (let dt = -neighborhoodSize; dt <= neighborhoodSize && isMax; dt++) {
                        for (let dr = -neighborhoodSize; dr <= neighborhoodSize; dr++) {
                            if (dt === 0 && dr === 0) continue;
                            const nIdx = (t + dt) * this.numRho + (r + dr);
                            if (houghSpace[nIdx] > value) {
                                isMax = false;
                                break;
                            }
                        }
                    }

                    if (isMax) {
                        const theta = (t * Math.PI) / this.numTheta;
                        const rho = ((r / this.numRho) * 2 * this.maxRho) - this.maxRho;
                        lines.push({ rho, theta, votes: value });
                    }
                }
            }
        }

        // Sort by votes
        lines.sort((a, b) => b.votes - a.votes);

        // Return top lines
        return {
            houghSpace,
            lines: lines.slice(0, 20)
        };
    }

    // Convert line from parametric form to two points
    lineToPoints(rho, theta, width, height) {
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const x0 = cos * rho;
        const y0 = sin * rho;

        const alpha = 1000;
        return {
            x1: x0 + alpha * (-sin),
            y1: y0 + alpha * cos,
            x2: x0 - alpha * (-sin),
            y2: y0 - alpha * cos
        };
    }

    // Generate line field from Hough space
    // Returns array of {x, y, theta, strength} for visualization
    generateLineField(threshold = 0, sampleRate = 16) {
        if (!this.lastHoughSpace) return [];

        const field = [];
        const width = this.width;
        const height = this.height;

        // Sample the image at regular intervals
        for (let y = sampleRate / 2; y < height; y += sampleRate) {
            for (let x = sampleRate / 2; x < width; x += sampleRate) {
                // For each point, find dominant line direction from Hough space
                let maxVotes = 0;
                let bestTheta = 0;
                let totalVotes = 0;

                // Check which lines pass through this point
                for (let t = 0; t < this.numTheta; t++) {
                    const theta = (t * Math.PI) / this.numTheta;
                    const rho = x * Math.cos(theta) + y * Math.sin(theta);
                    const rhoIdx = Math.floor(((rho + this.maxRho) / (2 * this.maxRho)) * this.numRho);

                    if (rhoIdx >= 0 && rhoIdx < this.numRho) {
                        const accIdx = t * this.numRho + rhoIdx;
                        const votes = this.lastHoughSpace[accIdx];
                        totalVotes += votes;

                        if (votes > maxVotes) {
                            maxVotes = votes;
                            bestTheta = theta;
                        }
                    }
                }

                if (maxVotes > threshold) {
                    field.push({
                        x: x,
                        y: y,
                        theta: bestTheta,
                        strength: maxVotes,
                        avgStrength: totalVotes / this.numTheta
                    });
                }
            }
        }

        return field;
    }

    // Get all significant lines from Hough space (not just peaks)
    getAllLines(threshold = 10) {
        if (!this.lastHoughSpace) return [];

        const lines = [];

        for (let t = 0; t < this.numTheta; t++) {
            for (let r = 0; r < this.numRho; r++) {
                const idx = t * this.numRho + r;
                const value = this.lastHoughSpace[idx];

                if (value > threshold) {
                    const theta = (t * Math.PI) / this.numTheta;
                    const rho = ((r / this.numRho) * 2 * this.maxRho) - this.maxRho;
                    lines.push({ rho, theta, votes: value });
                }
            }
        }

        return lines;
    }
}
