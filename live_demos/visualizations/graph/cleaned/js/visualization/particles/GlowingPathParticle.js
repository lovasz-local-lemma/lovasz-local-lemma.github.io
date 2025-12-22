/**
 * Glowing path particle with pulsing effect
 * Used for Floyd-Warshall colorful and path-tracking modes
 */

import { Particle } from '../Particle.js';
import { COLORS } from '../../core/Constants.js';

export class GlowingPathParticle extends Particle {
    constructor(options = {}) {
        super(options);
        
        // Three points defining the path
        this.points = options.points || [];
        if (this.points.length !== 3) {
            throw new Error('GlowingPathParticle requires exactly 3 points');
        }
        
        this.isAccepted = options.isAccepted !== undefined ? options.isAccepted : true;
        this.pulsePhase = 0;
        this.pulseSpeed = options.pulseSpeed || 0.1;
        this.lineWidth = options.lineWidth || 3;
    }

    update(deltaTime) {
        this.life -= 0.016;
        this.pulsePhase += this.pulseSpeed;
        
        // Fade out while pulsing
        const baseFade = this.life / this.maxLife;
        this.alpha = baseFade * (0.7 + 0.3 * Math.sin(this.pulsePhase));
        
        return this.life > 0;
    }

    render(context) {
        if (this.points.length !== 3) return;
        
        this.applyContextSettings(context);
        
        // Choose color based on acceptance
        const glowColor = this.isAccepted 
            ? COLORS.FLOYD_ACCEPTED 
            : COLORS.REJECTED;
        
        context.strokeStyle = glowColor;
        context.lineWidth = this.lineWidth;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        
        // Pulsing shadow effect
        context.shadowBlur = 15 + 5 * Math.sin(this.pulsePhase);
        context.shadowColor = glowColor;
        
        // Draw path through the three points
        context.beginPath();
        context.moveTo(this.points[0].x, this.points[0].y);
        context.lineTo(this.points[1].x, this.points[1].y);
        context.lineTo(this.points[2].x, this.points[2].y);
        context.stroke();
        
        context.shadowBlur = 0;
        
        this.restoreContext(context);
    }
}
