/**
 * Animation Curve Examples
 * Demonstrates different ways to draw curves with animations
 */

// Example 1: Simple animated curve
function exampleSimpleCurve(rive) {
    const points = [
        {x: 100, y: 200},
        {x: 200, y: 100},
        {x: 300, y: 200}
    ];
    
    // Automatically uses programmatic animations
    rive.createBezierCurve(points, '#4caf50', true);
}

// Example 2: Path visualization for algorithms
function exampleAlgorithmPath(rive, nodePositions, path) {
    // path = [0, 2, 4, 5] (node indices)
    const points = path.map(nodeIndex => ({
        x: nodePositions[nodeIndex].x,
        y: nodePositions[nodeIndex].y
    }));
    
    // Draw smooth path with animation
    rive.createBezierCurve(points, '#ff6b6b', true);
}

// Example 3: Multiple curve styles
function exampleMultipleStyles(rive) {
    const basePoints = [
        {x: 50, y: 150},
        {x: 150, y: 100},
        {x: 250, y: 150}
    ];
    
    // Smooth curve
    rive.createAnimatedCurve({
        points: basePoints,
        color: '#4caf50',
        width: 3,
        style: 'smooth',
        animated: true
    });
    
    // Sharp curve (offset)
    const sharpPoints = basePoints.map(p => ({x: p.x, y: p.y + 80}));
    rive.createAnimatedCurve({
        points: sharpPoints,
        color: '#ff6b6b',
        width: 3,
        style: 'sharp',
        animated: true
    });
    
    // Dashed curve (offset)
    const dashedPoints = basePoints.map(p => ({x: p.x, y: p.y + 160}));
    rive.createAnimatedCurve({
        points: dashedPoints,
        color: '#64b5f6',
        width: 3,
        style: 'dashed',
        animated: true
    });
}

// Example 4: Using custom animation inputs (.riv file required)
function exampleCustomInputs(rive) {
    const points = [
        {x: 100, y: 100},
        {x: 200, y: 150},
        {x: 300, y: 100},
        {x: 400, y: 150}
    ];
    
    rive.createAnimatedCurve({
        points: points,
        color: '#ba68c8',
        width: 5,
        animated: true,
        style: 'smooth',
        inputs: {
            // These would be custom inputs in your .riv file
            glow: true,
            glowIntensity: 0.8,
            dashLength: 10,
            dashGap: 5,
            particlesFollow: true,
            particleCount: 10,
            animationSpeed: 1.5
        }
    });
}

// Example 5: Interactive curve drawing
class InteractiveCurveDrawing {
    constructor(canvas, rive) {
        this.canvas = canvas;
        this.rive = rive;
        this.points = [];
        this.isDrawing = false;
        
        canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        canvas.addEventListener('mousemove', (e) => this.draw(e));
        canvas.addEventListener('mouseup', () => this.endDrawing());
    }
    
    startDrawing(e) {
        this.isDrawing = true;
        this.points = [];
        const rect = this.canvas.getBoundingClientRect();
        this.points.push({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
    }
    
    draw(e) {
        if (!this.isDrawing) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const point = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        
        // Add point if far enough from last point
        const lastPoint = this.points[this.points.length - 1];
        const distance = Math.sqrt(
            Math.pow(point.x - lastPoint.x, 2) +
            Math.pow(point.y - lastPoint.y, 2)
        );
        
        if (distance > 10) {
            this.points.push(point);
            
            // Draw live curve
            this.rive.createBezierCurve(this.points, '#4caf50', false);
        }
    }
    
    endDrawing() {
        if (this.isDrawing && this.points.length > 1) {
            // Final animated curve
            this.rive.createBezierCurve(this.points, '#ff6b6b', true);
        }
        this.isDrawing = false;
    }
}

// Example 6: Bezier curve with control points
function exampleBezierControl(rive) {
    // Define curve with explicit control points
    const start = {x: 100, y: 200};
    const control1 = {x: 150, y: 100};
    const control2 = {x: 250, y: 100};
    const end = {x: 300, y: 200};
    
    // Generate smooth curve points
    const points = [];
    for (let t = 0; t <= 1; t += 0.1) {
        const x = Math.pow(1-t, 3) * start.x +
                  3 * Math.pow(1-t, 2) * t * control1.x +
                  3 * (1-t) * Math.pow(t, 2) * control2.x +
                  Math.pow(t, 3) * end.x;
        
        const y = Math.pow(1-t, 3) * start.y +
                  3 * Math.pow(1-t, 2) * t * control1.y +
                  3 * (1-t) * Math.pow(t, 2) * control2.y +
                  Math.pow(t, 3) * end.y;
        
        points.push({x, y});
    }
    
    // Draw using animations
    rive.createBezierCurve(points, '#ffd54f', true);
    
    // Optionally show control points
    [start, control1, control2, end].forEach(point => {
        rive.createNodePulse(point.x, point.y, '#999', 0.5);
    });
}

// Example 7: Animated path following
class AnimatedPathFollower {
    constructor(rive, path, duration = 2000) {
        this.rive = rive;
        this.path = path;
        this.duration = duration;
        this.startTime = Date.now();
        this.animate();
    }
    
    animate() {
        const elapsed = Date.now() - this.startTime;
        const progress = Math.min(elapsed / this.duration, 1);
        const segmentIndex = Math.floor(progress * (this.path.length - 1));
        
        if (segmentIndex < this.path.length - 1) {
            // Draw curve up to current segment
            const currentPath = this.path.slice(0, segmentIndex + 2);
            this.rive.createBezierCurve(currentPath, '#64b5f6', false);
            
            // Add pulse at current position
            const t = (progress * (this.path.length - 1)) - segmentIndex;
            const current = this.path[segmentIndex];
            const next = this.path[segmentIndex + 1];
            const x = current.x + (next.x - current.x) * t;
            const y = current.y + (next.y - current.y) * t;
            
            this.rive.createNodePulse(x, y, '#64b5f6', 0.8);
            
            // Continue animation
            requestAnimationFrame(() => this.animate());
        } else {
            // Complete - draw full path
            this.rive.createBezierCurve(this.path, '#4caf50', true);
        }
    }
}

// Example 8: MST visualization with curves
function exampleMSTVisualization(rive, nodePositions, mstEdges) {
    // Draw all MST edges as smooth curves
    mstEdges.forEach((edge, index) => {
        const from = nodePositions[edge.from];
        const to = nodePositions[edge.to];
        
        // Create smooth curve between nodes
        const mid = {
            x: (from.x + to.x) / 2,
            y: (from.y + to.y) / 2 - 20 // Slight curve upward
        };
        
        const points = [from, mid, to];
        
        // Animate each edge in sequence
        setTimeout(() => {
            rive.createBezierCurve(points, '#ba68c8', true);
        }, index * 200);
    });
}

// Example 9: Flow visualization along curve
function exampleFlowAlongCurve(rive, curve, particleCount = 5) {
    // Create particles that follow the curve
    for (let i = 0; i < particleCount; i++) {
        const startDelay = (i / particleCount) * 1000;
        
        setTimeout(() => {
            // Animate particle along curve
            animateParticleAlongCurve(rive, curve);
        }, startDelay);
    }
}

function animateParticleAlongCurve(rive, curve, duration = 2000) {
    const startTime = Date.now();
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = (elapsed % duration) / duration;
        
        // Find position on curve
        const segmentFloat = progress * (curve.length - 1);
        const segmentIndex = Math.floor(segmentFloat);
        const t = segmentFloat - segmentIndex;
        
        if (segmentIndex < curve.length - 1) {
            const current = curve[segmentIndex];
            const next = curve[segmentIndex + 1];
            const x = current.x + (next.x - current.x) * t;
            const y = current.y + (next.y - current.y) * t;
            
            // Create small pulse at position
            rive.createNodePulse(x, y, '#64b5f6', 0.3);
        }
        
        // Continue animation
        if (elapsed < duration * 3) { // Loop 3 times
            requestAnimationFrame(animate);
        }
    }
    
    animate();
}

// Example 10: Using in algorithm visualization
function visualizeDijkstraPath(visualizer, startNode, endNode) {
    const rive = visualizer.rive;
    const positions = visualizer.nodePositions;
    
    // Run Dijkstra to get path
    const path = runDijkstra(visualizer.graph, startNode, endNode);
    
    if (path) {
        // Convert path to points
        const points = path.map(nodeId => positions[nodeId]);
        
        // Draw animated curve
        rive.createAnimatedCurve({
            points: points,
            color: '#4caf50',
            width: 4,
            animated: true,
            style: 'smooth',
            inputs: {
                glow: true,
                shadowBlur: 15
            }
        });
        
        // Add flow particles
        setTimeout(() => {
            exampleFlowAlongCurve(rive, points, 3);
        }, 1000);
    }
}

// Export examples
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        exampleSimpleCurve,
        exampleAlgorithmPath,
        exampleMultipleStyles,
        exampleCustomInputs,
        InteractiveCurveDrawing,
        exampleBezierControl,
        AnimatedPathFollower,
        exampleMSTVisualization,
        exampleFlowAlongCurve,
        visualizeDijkstraPath
    };
}
