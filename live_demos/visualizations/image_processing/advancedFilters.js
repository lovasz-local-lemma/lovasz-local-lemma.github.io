export class AdvancedFilters {
    // Basic Adjustments
    brightness(imageData, amount = 1.0) {
        const data = imageData.data;
        const beta = (amount - 1.0) * 50;
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, Math.min(255, data[i] + beta));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + beta));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + beta));
        }
        
        return imageData;
    }

    contrast(imageData, amount = 1.0) {
        const data = imageData.data;
        const factor = (259 * (amount * 255 + 255)) / (255 * (259 - amount * 255));
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, Math.min(255, factor * (data[i] - 128) + 128));
            data[i + 1] = Math.max(0, Math.min(255, factor * (data[i + 1] - 128) + 128));
            data[i + 2] = Math.max(0, Math.min(255, factor * (data[i + 2] - 128) + 128));
        }
        
        return imageData;
    }

    invert(imageData) {
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];
            data[i + 1] = 255 - data[i + 1];
            data[i + 2] = 255 - data[i + 2];
        }
        
        return imageData;
    }

    threshold(imageData, amount = 1.0) {
        const data = imageData.data;
        const threshold = amount * 128;
        
        for (let i = 0; i < data.length; i += 4) {
            const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
            const value = gray > threshold ? 255 : 0;
            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
        }
        
        return imageData;
    }

    posterize(imageData, amount = 1.0) {
        const data = imageData.data;
        const levels = Math.max(2, Math.floor(amount * 8));
        const step = 255 / levels;
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.floor(data[i] / step) * step;
            data[i + 1] = Math.floor(data[i + 1] / step) * step;
            data[i + 2] = Math.floor(data[i + 2] / step) * step;
        }
        
        return imageData;
    }

    // Convolution-based filters
    gaussianBlur(imageData, amount = 1.0) {
        const sigma = amount * 2;
        const kernel = this.createGaussianKernel(sigma);
        return this.convolve(imageData, kernel);
    }

    createGaussianKernel(sigma) {
        const size = Math.ceil(sigma * 3) * 2 + 1;
        const kernel = [];
        const center = Math.floor(size / 2);
        let sum = 0;

        for (let y = 0; y < size; y++) {
            kernel[y] = [];
            for (let x = 0; x < size; x++) {
                const dx = x - center;
                const dy = y - center;
                const value = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
                kernel[y][x] = value;
                sum += value;
            }
        }

        // Normalize
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                kernel[y][x] /= sum;
            }
        }

        return kernel;
    }

    sharpen(imageData, amount = 1.0) {
        const kernel = [
            [0, -amount, 0],
            [-amount, 1 + 4 * amount, -amount],
            [0, -amount, 0]
        ];
        return this.convolve(imageData, kernel);
    }

    unsharpMask(imageData, amount = 1.0) {
        // Blur the image
        const blurred = this.gaussianBlur(new ImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
        ), 0.5);

        // Subtract blurred from original and add back
        const data = imageData.data;
        const blurData = blurred.data;

        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, Math.min(255, data[i] + amount * (data[i] - blurData[i])));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + amount * (data[i + 1] - blurData[i + 1])));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + amount * (data[i + 2] - blurData[i + 2])));
        }

        return imageData;
    }

    emboss(imageData, amount = 1.0) {
        const kernel = [
            [-2 * amount, -amount, 0],
            [-amount, 1, amount],
            [0, amount, 2 * amount]
        ];
        return this.convolve(imageData, kernel, 128);
    }

    edgeEnhance(imageData, amount = 1.0) {
        const kernel = [
            [-amount, -amount, -amount],
            [-amount, 1 + 8 * amount, -amount],
            [-amount, -amount, -amount]
        ];
        return this.convolve(imageData, kernel);
    }

    // Edge detection
    laplacian(imageData) {
        const kernel = [
            [0, 1, 0],
            [1, -4, 1],
            [0, 1, 0]
        ];
        return this.convolve(imageData, kernel, 128);
    }

    // Morphological operations
    open(imageData) {
        const eroded = this.erode(new ImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
        ));
        return this.dilate(eroded);
    }

    close(imageData) {
        const dilated = this.dilate(new ImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
        ));
        return this.erode(dilated);
    }

    dilate(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const output = new ImageData(width, height);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let maxR = 0, maxG = 0, maxB = 0;

                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4;
                        maxR = Math.max(maxR, data[idx]);
                        maxG = Math.max(maxG, data[idx + 1]);
                        maxB = Math.max(maxB, data[idx + 2]);
                    }
                }

                const idx = (y * width + x) * 4;
                output.data[idx] = maxR;
                output.data[idx + 1] = maxG;
                output.data[idx + 2] = maxB;
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

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let minR = 255, minG = 255, minB = 255;

                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4;
                        minR = Math.min(minR, data[idx]);
                        minG = Math.min(minG, data[idx + 1]);
                        minB = Math.min(minB, data[idx + 2]);
                    }
                }

                const idx = (y * width + x) * 4;
                output.data[idx] = minR;
                output.data[idx + 1] = minG;
                output.data[idx + 2] = minB;
                output.data[idx + 3] = 255;
            }
        }

        return output;
    }

    // Advanced filters
    median(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const output = new ImageData(width, height);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const rValues = [], gValues = [], bValues = [];

                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4;
                        rValues.push(data[idx]);
                        gValues.push(data[idx + 1]);
                        bValues.push(data[idx + 2]);
                    }
                }

                rValues.sort((a, b) => a - b);
                gValues.sort((a, b) => a - b);
                bValues.sort((a, b) => a - b);

                const idx = (y * width + x) * 4;
                output.data[idx] = rValues[4];
                output.data[idx + 1] = gValues[4];
                output.data[idx + 2] = bValues[4];
                output.data[idx + 3] = 255;
            }
        }

        return output;
    }

    highpass(imageData, amount = 1.0) {
        // Create lowpass version
        const lowpass = this.gaussianBlur(new ImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
        ), amount);

        // Subtract from original
        const data = imageData.data;
        const lowData = lowpass.data;

        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, Math.min(255, 128 + (data[i] - lowData[i])));
            data[i + 1] = Math.max(0, Math.min(255, 128 + (data[i + 1] - lowData[i + 1])));
            data[i + 2] = Math.max(0, Math.min(255, 128 + (data[i + 2] - lowData[i + 2])));
        }

        return imageData;
    }

    // Helper: Generic convolution
    convolve(imageData, kernel, offset = 0) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const output = new ImageData(width, height);
        const kSize = kernel.length;
        const kHalf = Math.floor(kSize / 2);

        for (let y = kHalf; y < height - kHalf; y++) {
            for (let x = kHalf; x < width - kHalf; x++) {
                let r = 0, g = 0, b = 0;

                for (let ky = 0; ky < kSize; ky++) {
                    for (let kx = 0; kx < kSize; kx++) {
                        const idx = ((y + ky - kHalf) * width + (x + kx - kHalf)) * 4;
                        const weight = kernel[ky][kx];
                        r += data[idx] * weight;
                        g += data[idx + 1] * weight;
                        b += data[idx + 2] * weight;
                    }
                }

                const idx = (y * width + x) * 4;
                output.data[idx] = Math.max(0, Math.min(255, r + offset));
                output.data[idx + 1] = Math.max(0, Math.min(255, g + offset));
                output.data[idx + 2] = Math.max(0, Math.min(255, b + offset));
                output.data[idx + 3] = 255;
            }
        }

        return output;
    }
}
