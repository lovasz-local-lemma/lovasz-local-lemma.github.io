/**
 * Green circle indicator particle
 * Used to mark the outer loop node in Floyd-Warshall
 */

import { Particle } from '../Particle.js';
import { COLORS } from '../../core/Constants.js';

export class GreenCircleParticle extends Particle {
    constructor(options = {}) {
        super(options);
        
        this.radius = options.radius || 35;
        this.lineWidth = options.lineWidth || 3;
        this.fadeSpeed = options.fadeSpeed || 0.008; // Slower fade
        this.color = options.color || COLORS.FLOYD_ACCEPTED;
    }

    update(deltaTime) {
        this.fadeOut(this.fadeSpeed);
        return this.checkLife();
    }

    render(context) {
        this.applyContextSettings(context);
        
        context.strokeStyle = this.color;
        context.lineWidth = this.lineWidth;
        context.shadowBlur = 12;
        context.shadowColor = this.color;
        
        context.beginPath();
        context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        context.stroke();
        
        context.shadowBlur = 0;
        
        this.restoreContext(context);
    }
}
