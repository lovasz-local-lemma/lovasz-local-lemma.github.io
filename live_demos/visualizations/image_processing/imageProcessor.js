export class ImageProcessor {
    constructor() {
        // Sobel kernels
        this.sobelX = [
            [-1, 0, 1],
            [-2, 0, 2],
            [-1, 0, 1]
        ];

        this.sobelY = [
            [-1, -2, -1],
            [0, 0, 0],
            [1, 2, 1]
        ];
    }

    sobelEdgeDetection(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const output = new ImageData(width, height);

        // Convert to grayscale first
        const gray = new Float32Array(width * height);
        for (let i = 0; i < data.length; i += 4) {
            const idx = i / 4;
            gray[idx] = (data[i] + data[i + 1] + data[i + 2]) / 3;
        }

        // Apply Sobel operator
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let gx = 0;
                let gy = 0;

                // Convolve with kernels
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = (y + ky) * width + (x + kx);
                        const pixel = gray[idx];
                        gx += pixel * this.sobelX[ky + 1][kx + 1];
                        gy += pixel * this.sobelY[ky + 1][kx + 1];
                    }
                }

                const magnitude = Math.sqrt(gx * gx + gy * gy);
                const idx = (y * width + x) * 4;
                const value = Math.min(255, magnitude);

                output.data[idx] = value;
                output.data[idx + 1] = value;
                output.data[idx + 2] = value;
                output.data[idx + 3] = 255;
            }
        }

        return output;
    }

    cannyEdgeDetection(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        // Step 1: Grayscale
        const gray = new Float32Array(width * height);
        for (let i = 0; i < data.length; i += 4) {
            const idx = i / 4;
            gray[idx] = (data[i] + data[i + 1] + data[i + 2]) / 3;
        }

        // Step 2: Gaussian blur
        const blurred = this.gaussianBlur(gray, width, height);

        // Step 3: Sobel for gradient magnitude and direction
        const gradient = new Float32Array(width * height);
        const direction = new Float32Array(width * height);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let gx = 0;
                let gy = 0;

                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = (y + ky) * width + (x + kx);
                        const pixel = blurred[idx];
                        gx += pixel * this.sobelX[ky + 1][kx + 1];
                        gy += pixel * this.sobelY[ky + 1][kx + 1];
                    }
                }

                const idx = y * width + x;
                gradient[idx] = Math.sqrt(gx * gx + gy * gy);
                direction[idx] = Math.atan2(gy, gx);
            }
        }

        // Step 4: Non-maximum suppression
        const suppressed = this.nonMaximumSuppression(gradient, direction, width, height);

        // Step 5: Double thresholding and edge tracking
        const edges = this.doubleThreshold(suppressed, width, height, 50, 100);

        // Create output image
        const output = new ImageData(width, height);
        for (let i = 0; i < edges.length; i++) {
            const value = edges[i] ? 255 : 0;
            output.data[i * 4] = value;
            output.data[i * 4 + 1] = value;
            output.data[i * 4 + 2] = value;
            output.data[i * 4 + 3] = 255;
        }

        return output;
    }

    gaussianBlur(data, width, height) {
        const kernel = [
            [1/16, 2/16, 1/16],
            [2/16, 4/16, 2/16],
            [1/16, 2/16, 1/16]
        ];

        const output = new Float32Array(width * height);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = (y + ky) * width + (x + kx);
                        sum += data[idx] * kernel[ky + 1][kx + 1];
                    }
                }
                output[y * width + x] = sum;
            }
        }

        return output;
    }

    nonMaximumSuppression(gradient, direction, width, height) {
        const output = new Float32Array(width * height);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                const angle = direction[idx] * 180 / Math.PI;
                let normalizedAngle = angle < 0 ? angle + 180 : angle;

                let q = 255;
                let r = 255;

                // Determine neighbor pixels based on gradient direction
                if ((normalizedAngle >= 0 && normalizedAngle < 22.5) || (normalizedAngle >= 157.5 && normalizedAngle <= 180)) {
                    q = gradient[y * width + (x + 1)];
                    r = gradient[y * width + (x - 1)];
                } else if (normalizedAngle >= 22.5 && normalizedAngle < 67.5) {
                    q = gradient[(y + 1) * width + (x - 1)];
                    r = gradient[(y - 1) * width + (x + 1)];
                } else if (normalizedAngle >= 67.5 && normalizedAngle < 112.5) {
                    q = gradient[(y + 1) * width + x];
                    r = gradient[(y - 1) * width + x];
                } else if (normalizedAngle >= 112.5 && normalizedAngle < 157.5) {
                    q = gradient[(y - 1) * width + (x - 1)];
                    r = gradient[(y + 1) * width + (x + 1)];
                }

                if (gradient[idx] >= q && gradient[idx] >= r) {
                    output[idx] = gradient[idx];
                } else {
                    output[idx] = 0;
                }
            }
        }

        return output;
    }

    doubleThreshold(data, width, height, lowThreshold, highThreshold) {
        const output = new Uint8Array(width * height);

        for (let i = 0; i < data.length; i++) {
            if (data[i] >= highThreshold) {
                output[i] = 2; // Strong edge
            } else if (data[i] >= lowThreshold) {
                output[i] = 1; // Weak edge
            } else {
                output[i] = 0; // Non-edge
            }
        }

        // Edge tracking by hysteresis
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                if (output[idx] === 1) {
                    // Check if connected to strong edge
                    let hasStrongNeighbor = false;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            if (output[(y + ky) * width + (x + kx)] === 2) {
                                hasStrongNeighbor = true;
                                break;
                            }
                        }
                        if (hasStrongNeighbor) break;
                    }
                    output[idx] = hasStrongNeighbor ? 2 : 0;
                }
            }
        }

        // Convert to binary
        for (let i = 0; i < output.length; i++) {
            output[i] = output[i] === 2 ? 1 : 0;
        }

        return output;
    }

    dilate(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const output = new ImageData(width, height);

        const structuringElement = [
            [0, 1, 0],
            [1, 1, 1],
            [0, 1, 0]
        ];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let maxVal = 0;

                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        if (structuringElement[ky + 1][kx + 1]) {
                            const idx = ((y + ky) * width + (x + kx)) * 4;
                            maxVal = Math.max(maxVal, data[idx]);
                        }
                    }
                }

                const idx = (y * width + x) * 4;
                output.data[idx] = maxVal;
                output.data[idx + 1] = maxVal;
                output.data[idx + 2] = maxVal;
                output.data[idx + 3] = 255;
            }
        }

        return output;
    }

    erode(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const output = new ImageData(width, height);

        const structuringElement = [
            [0, 1, 0],
            [1, 1, 1],
            [0, 1, 0]
        ];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let minVal = 255;

                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        if (structuringElement[ky + 1][kx + 1]) {
                            const idx = ((y + ky) * width + (x + kx)) * 4;
                            minVal = Math.min(minVal, data[idx]);
                        }
                    }
                }

                const idx = (y * width + x) * 4;
                output.data[idx] = minVal;
                output.data[idx + 1] = minVal;
                output.data[idx + 2] = minVal;
                output.data[idx + 3] = 255;
            }
        }

        return output;
    }
}
