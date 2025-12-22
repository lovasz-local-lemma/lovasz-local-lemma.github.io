export class HoughShapeTransform {
    constructor() {
        this.template = null; // User-defined shape template
        this.rTable = null; // R-table for generalized Hough transform
        this.width = 512;
        this.height = 512;
    }

    // Create template from user drawing
    createTemplate(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        // Extract edge points and compute gradients (sample every pixel for template)
        const edges = [];
        const gradients = [];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                const intensity = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

                if (intensity > 100) {
                    // Compute gradient direction
                    const gx = this.getPixel(data, width, height, x + 1, y) - 
                              this.getPixel(data, width, height, x - 1, y);
                    const gy = this.getPixel(data, width, height, x, y + 1) - 
                              this.getPixel(data, width, height, x, y - 1);

                    const angle = Math.atan2(gy, gx);
                    edges.push({ x, y });
                    gradients.push(angle);
                }
            }
        }

        // Limit template size for performance - MORE AGGRESSIVE
        const maxTemplateEdges = 100; // Reduced from 200 for 4x speedup
        if (edges.length > maxTemplateEdges) {
            const step = Math.floor(edges.length / maxTemplateEdges);
            const sampledEdges = [];
            const sampledGradients = [];
            for (let i = 0; i < edges.length; i += step) {
                sampledEdges.push(edges[i]);
                sampledGradients.push(gradients[i]);
            }
            edges.length = 0;
            gradients.length = 0;
            edges.push(...sampledEdges);
            gradients.push(...sampledGradients);
            console.log(`Template reduced to ${edges.length} edge points for speed`);
        }

        // Find centroid
        let cx = 0, cy = 0;
        edges.forEach(p => {
            cx += p.x;
            cy += p.y;
        });
        cx /= edges.length;
        cy /= edges.length;

        // Build R-table: for each gradient direction, store vectors from centroid
        this.rTable = {};
        const angleStep = Math.PI / 36; // 5 degree bins

        edges.forEach((edge, i) => {
            const angle = gradients[i];
            const bin = Math.round(angle / angleStep);

            if (!this.rTable[bin]) {
                this.rTable[bin] = [];
            }

            // Store vector from centroid to edge point
            this.rTable[bin].push({
                dx: edge.x - cx,
                dy: edge.y - cy
            });
        });

        this.template = { edges, gradients, centroid: { x: cx, y: cy } };
        console.log(`Template created with ${edges.length} edge points`);
    }

    getPixel(data, width, height, x, y) {
        if (x < 0 || x >= width || y < 0 || y >= height) return 0;
        const idx = (y * width + x) * 4;
        return (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    }

    // Detect shape with rotation and scale - OPTIMIZED
    detectShape(imageData, minScale = 0.6, maxScale = 1.8, scaleStep = 0.4, 
                angleStep = Math.PI / 9) { // Coarser steps for 8x speedup
        if (!this.rTable) {
            console.error('No template defined. Call createTemplate first.');
            return [];
        }

        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        // Extract edges from target image (sample every 3 pixels for speed)
        const targetEdges = [];
        const targetGradients = [];

        const edgeSampleStep = 3; // Increased from 2 for 2.25x speedup
        for (let y = 1; y < height - 1; y += edgeSampleStep) {
            for (let x = 1; x < width - 1; x += edgeSampleStep) {
                const idx = (y * width + x) * 4;
                const intensity = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

                if (intensity > 100) {
                    const gx = this.getPixel(data, width, height, x + 1, y) - 
                              this.getPixel(data, width, height, x - 1, y);
                    const gy = this.getPixel(data, width, height, x, y + 1) - 
                              this.getPixel(data, width, height, x, y - 1);

                    const angle = Math.atan2(gy, gx);
                    targetEdges.push({ x, y });
                    targetGradients.push(angle);
                }
            }
        }

        console.log(`Target has ${targetEdges.length} edge points (sampled)`);

        // Limit edge points for performance - MORE AGGRESSIVE
        const maxEdges = 250; // Reduced from 500 for 4x speedup
        if (targetEdges.length > maxEdges) {
            const step = Math.floor(targetEdges.length / maxEdges);
            const sampledEdges = [];
            const sampledGradients = [];
            for (let i = 0; i < targetEdges.length; i += step) {
                sampledEdges.push(targetEdges[i]);
                sampledGradients.push(targetGradients[i]);
            }
            targetEdges.length = 0;
            targetGradients.length = 0;
            targetEdges.push(...sampledEdges);
            targetGradients.push(...sampledGradients);
            console.log(`Reduced to ${targetEdges.length} edge points for speed`);
        }
        
        const numScales = Math.ceil((maxScale - minScale) / scaleStep) + 1;
        const numAngles = Math.ceil((2 * Math.PI) / angleStep);
        console.log(`Shape detection: ${numScales} scales × ${numAngles} angles = ${numScales * numAngles} iterations`);

        // Accumulator for position, scale, and rotation
        const detections = [];
        const binStep = Math.PI / 36;

        // For each scale
        for (let scale = minScale; scale <= maxScale; scale += scaleStep) {
            // For each rotation angle
            for (let theta = 0; theta < 2 * Math.PI; theta += angleStep) {
                const accumulator = new Float32Array(width * height);

                // For each edge point in target image
                targetEdges.forEach((edge, i) => {
                    const gradAngle = targetGradients[i];
                    const bin = Math.round(gradAngle / binStep);

                    if (!this.rTable[bin]) return;

                    // Vote for possible reference points
                    this.rTable[bin].forEach(vector => {
                        // Apply scale and rotation to vector
                        const rotatedDx = scale * (
                            vector.dx * Math.cos(theta) - vector.dy * Math.sin(theta)
                        );
                        const rotatedDy = scale * (
                            vector.dx * Math.sin(theta) + vector.dy * Math.cos(theta)
                        );

                        const refX = Math.round(edge.x - rotatedDx);
                        const refY = Math.round(edge.y - rotatedDy);

                        if (refX >= 0 && refX < width && refY >= 0 && refY < height) {
                            accumulator[refY * width + refX]++;
                        }
                    });
                });

                // Find peaks in accumulator
                for (let y = 5; y < height - 5; y++) {
                    for (let x = 5; x < width - 5; x++) {
                        const idx = y * width + x;
                        const value = accumulator[idx];

                        if (value < 5) continue; // Lowered threshold for better detection

                        // Check if local maximum
                        let isMax = true;
                        for (let dy = -5; dy <= 5 && isMax; dy++) {
                            for (let dx = -5; dx <= 5 && isMax; dx++) {
                                if (dx === 0 && dy === 0) continue;
                                const idx2 = (y + dy) * width + (x + dx);
                                if (accumulator[idx2] > value) {
                                    isMax = false;
                                }
                            }
                        }

                        if (isMax) {
                            detections.push({
                                x, y,
                                scale,
                                angle: theta,
                                votes: value
                            });
                        }
                    }
                }
            }
        }

        // Sort by votes
        detections.sort((a, b) => b.votes - a.votes);

        // Non-maximum suppression
        const filtered = [];
        for (const detection of detections) {
            let tooClose = false;

            for (const existing of filtered) {
                const dist = Math.sqrt(
                    Math.pow(detection.x - existing.x, 2) +
                    Math.pow(detection.y - existing.y, 2)
                );

                if (dist < 50) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose && filtered.length < 10) {
                filtered.push(detection);
            }
        }

        return filtered;
    }

    // Draw template shape at detected location
    drawDetectedShape(ctx, detection) {
        if (!this.template) return;

        const { x, y, scale, angle } = detection;
        const { edges, centroid } = this.template;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.scale(scale, scale);

        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2 / scale;

        // Draw edges
        ctx.beginPath();
        edges.forEach((edge, i) => {
            const dx = edge.x - centroid.x;
            const dy = edge.y - centroid.y;

            if (i === 0) {
                ctx.moveTo(dx, dy);
            } else {
                ctx.lineTo(dx, dy);
            }
        });
        ctx.stroke();

        // Draw center
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(0, 0, 3 / scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
