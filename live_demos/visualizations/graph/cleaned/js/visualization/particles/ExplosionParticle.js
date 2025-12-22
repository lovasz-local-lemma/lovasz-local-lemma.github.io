/**
 * Explosion particle - radial burst effect
 * Used for algorithm completion and special events
 */

import { Particle } from '../Particle.js';

export class ExplosionParticle extends Particle {
    constructor(options = {}) {
        super(options);
        
        this.vx = options.vx || 0;
        this.vy = options.vy || 0;
        this.size = options.size || 3;
        this.friction = options.friction || 0.95;
    }

    update(deltaTime) {
        // Apply velocity
        this.x += this.vx;
        this.y += this.vy;
        
        // Apply friction
        this.vx *= this.friction;
        this.vy *= this.friction;
        
        // Fade out
        this.life -= 0.016;
        this.alpha = this.life;
        
        return this.life > 0;
    }

    render(context) {
        this.applyContextSettings(context);
        
        context.fillStyle = this.color;
        context.shadowBlur = 8;
        context.shadowColor = this.color;
        
        context.beginPath();
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        context.fill();
        
        context.shadowBlur = 0;
        
        this.restoreContext(context);
    }
}
