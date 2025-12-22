// Singularity detection algorithms for complex functions

// Detect zeros using grid search + refinement
function findZeros(visualizer, searchRadius, gridDensity = 30) {
    const zeros = [];
    const step = (2 * searchRadius) / gridDensity;
    const threshold = 0.15; // Increased threshold for better detection
    
    // Grid search for candidate points
    for (let i = 0; i < gridDensity; i++) {
        for (let j = 0; j < gridDensity; j++) {
            const x = -searchRadius + i * step;
            const y = -searchRadius + j * step;
            const z = { re: x, im: y };
            
            try {
                const w = visualizer.applyFunction(z);
                const mag = Math.sqrt(w.re * w.re + w.im * w.im);
                
                // Candidate zero if magnitude is very small
                if (mag < threshold) {
                    // Use refined position if available, otherwise use grid point
                    const refined = refineZero(visualizer, z, 5);
                    const finalPos = refined || z;
                    if (!isDuplicate(zeros, finalPos, 0.15)) {
                        const order = estimateOrder(visualizer, finalPos, true);
                        zeros.push({ pos: finalPos, order });
                    }
                }
            } catch (e) {
                // Skip points where function fails
            }
        }
    }
    
    return zeros;
}

// Detect poles using magnitude growth
function findPoles(visualizer, searchRadius, gridDensity = 30) {
    const poles = [];
    const step = (2 * searchRadius) / gridDensity;
    const threshold = 5.0; // Lowered threshold for better detection
    
    for (let i = 0; i < gridDensity; i++) {
        for (let j = 0; j < gridDensity; j++) {
            const x = -searchRadius + i * step;
            const y = -searchRadius + j * step;
            const z = { re: x, im: y };
            
            try {
                const w = visualizer.applyFunction(z);
                const mag = Math.sqrt(w.re * w.re + w.im * w.im);
                
                // Candidate pole if magnitude is very large
                if (mag > threshold) {
                    // Check if it's actually a pole by looking at nearby points
                    const isPole = checkPoleCandidate(visualizer, z);
                    if (isPole && !isDuplicate(poles, z, 0.2)) {
                        const order = estimateOrder(visualizer, z, false);
                        poles.push({ pos: z, order });
                    }
                }
            } catch (e) {
                // Function undefined - likely a pole
                if (!isDuplicate(poles, z, 0.15)) {
                    const order = estimateOrder(visualizer, z, false);
                    poles.push({ pos: z, order });
                }
            }
        }
    }
    
    return poles;
}

// Check if point is actually a pole by examining neighborhood
function checkPoleCandidate(visualizer, z) {
    const delta = 0.05;
    const dirs = [
        { re: delta, im: 0 },
        { re: -delta, im: 0 },
        { re: 0, im: delta },
        { re: 0, im: -delta }
    ];
    
    let count = 0;
    for (const dir of dirs) {
        try {
            const zTest = { re: z.re + dir.re, im: z.im + dir.im };
            const w = visualizer.applyFunction(zTest);
            const mag = Math.sqrt(w.re * w.re + w.im * w.im);
            if (mag > 5.0) count++;
        } catch (e) {
            count++;
        }
    }
    
    return count >= 2; // At least half the neighbors show large magnitude
}

// Refine zero location using Newton's method
function refineZero(visualizer, z0, maxIter) {
    let z = { re: z0.re, im: z0.im };
    const h = 0.0001;
    
    for (let iter = 0; iter < maxIter; iter++) {
        const f = visualizer.applyFunction(z);
        const fMag = Math.sqrt(f.re * f.re + f.im * f.im);
        
        if (fMag < 0.001) return z; // Converged
        
        // Numerical derivative
        const fh = visualizer.applyFunction({ re: z.re + h, im: z.im });
        const dfdr = (fh.re - f.re) / h;
        const dfdi = (fh.im - f.im) / h;
        
        const fhi = visualizer.applyFunction({ re: z.re, im: z.im + h });
        const dfdr_i = (fhi.re - f.re) / h;
        const dfdi_i = (fhi.im - f.im) / h;
        
        // f'(z) = dfdr + i*dfdi (treating as df/dz)
        const fprime = { re: dfdr - dfdi_i, im: dfdi + dfdr_i };
        const fpMag = fprime.re * fprime.re + fprime.im * fprime.im;
        
        if (fpMag < 0.0001) break; // Derivative too small
        
        // Newton step: z = z - f/f'
        const ratio_re = (f.re * fprime.re + f.im * fprime.im) / fpMag;
        const ratio_im = (f.im * fprime.re - f.re * fprime.im) / fpMag;
        
        z.re -= ratio_re;
        z.im -= ratio_im;
        
        // Bail if moving too far
        const dist = Math.sqrt((z.re - z0.re)**2 + (z.im - z0.im)**2);
        if (dist > 0.5) return null;
    }
    
    return z;
}

// Estimate order of zero or pole
function estimateOrder(visualizer, z, isZero) {
    const h = 0.001;
    try {
        const f = visualizer.applyFunction(z);
        const fh = visualizer.applyFunction({ re: z.re + h, im: z.im });
        const fh2 = visualizer.applyFunction({ re: z.re + 2*h, im: z.im });
        
        const f1 = Math.sqrt(f.re**2 + f.im**2);
        const f2 = Math.sqrt(fh.re**2 + fh.im**2);
        const f3 = Math.sqrt(fh2.re**2 + fh2.im**2);
        
        if (isZero) {
            // For zeros, check how fast magnitude grows
            if (f2 < 0.001) return 2; // Double zero
            if (f3 < 0.001) return 3; // Triple zero
            return 1; // Simple zero
        } else {
            // For poles, estimate from growth rate
            if (f1 > 100) return 2; // Higher order
            return 1; // Simple pole
        }
    } catch (e) {
        return 1;
    }
}

// Check if point is duplicate
function isDuplicate(list, point, tolerance) {
    return list.some(item => {
        const dx = item.pos.re - point.re;
        const dy = item.pos.im - point.im;
        return Math.sqrt(dx*dx + dy*dy) < tolerance;
    });
}

// Find zeros of f'(z) - critical points
function findDerivativeZeros(visualizer, searchRadius, gridDensity = 30) {
    const zeros = [];
    const step = (2 * searchRadius) / gridDensity;
    const threshold = 0.2;
    
    for (let i = 0; i < gridDensity; i++) {
        for (let j = 0; j < gridDensity; j++) {
            const x = -searchRadius + i * step;
            const y = -searchRadius + j * step;
            const z = { re: x, im: y };
            
            try {
                const derivMag = visualizer.getDerivativeMagnitude(z);
                
                if (derivMag < threshold) {
                    if (!isDuplicate(zeros, z, 0.2)) {
                        zeros.push({ pos: z, order: 1 });
                    }
                }
            } catch (e) {
                // Skip
            }
        }
    }
    
    return zeros;
}

// Find poles of f'(z)
function findDerivativePoles(visualizer, searchRadius, gridDensity = 30) {
    const poles = [];
    const step = (2 * searchRadius) / gridDensity;
    const threshold = 8.0;
    
    for (let i = 0; i < gridDensity; i++) {
        for (let j = 0; j < gridDensity; j++) {
            const x = -searchRadius + i * step;
            const y = -searchRadius + j * step;
            const z = { re: x, im: y };
            
            try {
                const derivMag = visualizer.getDerivativeMagnitude(z);
                
                if (derivMag > threshold) {
                    if (!isDuplicate(poles, z, 0.2)) {
                        poles.push({ pos: z, order: 1 });
                    }
                }
            } catch (e) {
                // Derivative undefined - likely a pole
                if (!isDuplicate(poles, z, 0.2)) {
                    poles.push({ pos: z, order: 1 });
                }
            }
        }
    }
    
    return poles;
}
