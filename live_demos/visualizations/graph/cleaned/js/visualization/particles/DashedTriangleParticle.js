/**
 * Dashed triangle particle
 * Used for Floyd-Warshall simple mode visualization
 */

import { Particle } from '../Particle.js';

export class DashedTriangleParticle extends Particle {
    constructor(options = {}) {
        super(options);
        
        // Three points of the triangle
        this.points = options.points || [];
        if (this.points.length !== 3) {
            throw new Error('DashedTriangleParticle requires exactly 3 points');
        }
        
        this.fadeSpeed = options.fadeSpeed || 0.016;
        this.lineWidth = options.lineWidth || 2;
    }

    update(deltaTime) {
        this.fadeOut(this.fadeSpeed);
        return this.checkLife();
    }

    render(context) {
        if (this.points.length !== 3) return;
        
        this.applyContextSettings(context);
        
        context.strokeStyle = this.color;
        context.lineWidth = this.lineWidth;
        context.setLineDash([5, 5]);
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.shadowBlur = 10;
        context.shadowColor = this.color;
        
        // Draw triangle connecting the three points
        context.beginPath();
        context.moveTo(this.points[0].x, this.points[0].y);
        context.lineTo(this.points[1].x, this.points[1].y);
        context.lineTo(this.points[2].x, this.points[2].y);
        context.closePath();
        context.stroke();
        
        // Reset context
        context.setLineDash([]);
        context.shadowBlur = 0;
        
        this.restoreContext(context);
    }
}
