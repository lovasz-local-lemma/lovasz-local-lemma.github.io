/**
 * Spinning Dashed Circle Particle
 * Rotating dashed circle indicator for current node
 */

import { Particle } from '../Particle.js';

export class SpinningCircleParticle extends Particle {
    constructor(x, y, radius, color, speed = 1.0) {
        super(x, y);
        this.type = 'spinningCircle';
        this.radius = radius;
        this.color = color;
        this.speed = speed;
        this.rotation = 0;
        this.dashLength = 10;
        this.gapLength = 5;
        this.lineWidth = 3;
        this.persistent = true; // Don't auto-remove
    }

    /**
     * Update rotation
     */
    update(deltaTime) {
        // Rotate continuously
        this.rotation += deltaTime * this.speed * 3; // 3 radians per second
        
        // Keep rotation in 0-2π range
        if (this.rotation > Math.PI * 2) {
            this.rotation -= Math.PI * 2;
        }
        
        // Don't die (persistent indicator)
        return true;
    }

    /**
     * Render spinning dashed circle
     */
    render(ctx) {
        ctx.save();
        
        // Translate to particle position
        ctx.translate(this.x, this.y);
        
        // Rotate
        ctx.rotate(this.rotation);
        
        // Draw dashed circle
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.lineWidth;
        ctx.setLineDash([this.dashLength, this.gapLength]);
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Reset line dash
        ctx.setLineDash([]);
        
        ctx.restore();
    }

    /**
     * Update position (for moving nodes)
     */
    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }

    /**
     * Update color
     */
    setColor(color) {
        this.color = color;
    }

    /**
     * Kill the particle
     */
    kill() {
        this.alive = false;
    }
}
