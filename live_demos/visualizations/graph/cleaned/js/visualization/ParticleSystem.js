/**
 * Particle System
 * Manages particle lifecycle, updates, and rendering
 */

import { ParticleFactory } from './ParticleFactory.js';
import { PARTICLE_TYPES } from '../core/Constants.js';

export class ParticleSystem {
    constructor(context = null) {
        this.context = context;
        this.particles = [];
        this.factory = new ParticleFactory();
    }

    /**
     * Set rendering context
     */
    setContext(context) {
        this.context = context;
    }

    /**
     * Create and add a particle
     * @param {string} type - Particle type from PARTICLE_TYPES
     * @param {Object} options - Particle-specific options
     * @returns {Particle|null} - Created particle
     */
    create(type, options = {}) {
        const particle = this.factory.create(type, options);
        
        if (particle) {
            this.particles.push(particle);
        }
        
        return particle;
    }

    /**
     * Create multiple particles at once
     */
    createBatch(type, optionsArray = []) {
        const created = [];
        
        for (const options of optionsArray) {
            const particle = this.create(type, options);
            if (particle) {
                created.push(particle);
            }
        }
        
        return created;
    }

    /**
     * Update all particles
     * Removes dead particles automatically
     */
    update(deltaTime = 0.016) {
        this.particles = this.particles.filter(particle => {
            const shouldContinue = particle.update(deltaTime);
            return shouldContinue && particle.isAlive;
        });
    }

    /**
     * Render all particles
     */
    render(context = this.context) {
        if (!context) {
            console.warn('No rendering context available');
            return;
        }
        
        for (const particle of this.particles) {
            try {
                particle.render(context);
            } catch (error) {
                console.error('Error rendering particle:', error);
            }
        }
    }

    /**
     * Clear specific particle type
     * Useful for mode transitions
     */
    clearType(type) {
        // Get the particle class constructor name for comparison
        const ParticleClass = this.factory.particleClasses[type];
        
        if (!ParticleClass) {
            return;
        }
        
        this.particles = this.particles.filter(particle => {
            return !(particle instanceof ParticleClass);
        });
    }

    /**
     * Clear all particles
     */
    clearAll() {
        this.particles = [];
    }

    /**
     * Get particle count
     */
    getCount() {
        return this.particles.length;
    }

    /**
     * Get count by type
     */
    getCountByType(type) {
        const ParticleClass = this.factory.particleClasses[type];
        
        if (!ParticleClass) {
            return 0;
        }
        
        return this.particles.filter(p => p instanceof ParticleClass).length;
    }

    /**
     * Register custom particle type
     */
    registerParticleType(type, ParticleClass) {
        this.factory.register(type, ParticleClass);
    }

    // ============================================
    // Convenience methods for common particles
    // ============================================

    /**
     * Create node pulse effect
     */
    createPulse(x, y, color, intensity = 1, speedMultiplier = 1) {
        return this.create(PARTICLE_TYPES.PULSE, {
            x, y, color, intensity,
            speed: 2 * speedMultiplier,
            fadeSpeed: 0.01 * speedMultiplier
        });
    }

    /**
     * Create dashed triangle for Floyd-Warshall
     */
    createDashedTriangle(points, color, speedMultiplier = 1) {
        return this.create(PARTICLE_TYPES.DASHED_TRIANGLE, {
            points,
            color,
            fadeSpeed: 0.016 * speedMultiplier
        });
    }

    /**
     * Create glowing path for Floyd-Warshall
     */
    createGlowingPath(points, color, isAccepted) {
        return this.create(PARTICLE_TYPES.GLOWING_PATH, {
            points,
            color,
            isAccepted
        });
    }

    /**
     * Create green circle indicator
     */
    createGreenCircle(x, y, speedMultiplier = 1.0) {
        return this.create(PARTICLE_TYPES.GREEN_CIRCLE, {
            x,
            y,
            speedMultiplier
        });
    }

    /**
     * Create spinning dashed circle indicator
     */
    createSpinningCircle(x, y, radius, color, speed = 1.0) {
        return this.create(PARTICLE_TYPES.SPINNING_CIRCLE, {
            x,
            y,
            radius,
            color,
            speed
        });
    }

    /**
     * Get or create persistent spinning circle (only one active)
     */
    getOrCreateSpinningCircle(x, y, radius, color, speed = 1.0) {
        // Find existing spinning circle
        let spinner = this.particles.find(p => p.type === PARTICLE_TYPES.SPINNING_CIRCLE);
        
        if (spinner) {
            // Update existing
            spinner.setPosition(x, y);
            spinner.setColor(color);
        } else {
            // Create new
            spinner = this.createSpinningCircle(x, y, radius, color, speed);
        }
        
        return spinner;
    }

    /**
     * Create explosion effect
     */
    createExplosion(x, y, color, count = 12) {
        const particles = [];
        
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speed = 2 + Math.random() * 3;
            
            const particle = this.create(PARTICLE_TYPES.EXPLOSION, {
                x, y,
                color,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2 + Math.random() * 2
            });
            
            if (particle) {
                particles.push(particle);
            }
        }
        
        return particles;
    }
}
