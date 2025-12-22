/**
 * Pulse particle - expanding radial gradient
 * Used for node highlighting and algorithm events
 */

import { Particle } from '../Particle.js';
import { ANIMATION } from '../../core/Constants.js';

export class PulseParticle extends Particle {
    constructor(options = {}) {
        super(options);
        
        this.radius = options.radius || ANIMATION.PULSE_RADIUS;
        this.maxRadius = options.maxRadius || ANIMATION.PULSE_MAX_RADIUS;
        this.speed = options.speed || 2;
        this.fadeSpeed = options.fadeSpeed || 0.01;
        this.intensity = options.intensity || 1;
        
        // Apply intensity to initial alpha
        this.alpha = ANIMATION.PULSE_ALPHA * this.intensity;
    }

    update(deltaTime) {
        this.radius += this.speed;
        this.alpha -= this.fadeSpeed;
        
        const reachedMaxRadius = this.radius >= this.maxRadius;
        const fadedOut = this.alpha <= 0;
        
        return !reachedMaxRadius && !fadedOut;
    }

    render(context) {
        this.applyContextSettings(context);
        
        const gradient = context.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.radius
        );
        
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(1, 'transparent');
        
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        context.fill();
        
        this.restoreContext(context);
    }
}
