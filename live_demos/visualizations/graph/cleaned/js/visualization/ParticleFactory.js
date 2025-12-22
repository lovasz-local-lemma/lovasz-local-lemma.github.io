/**
 * Particle Factory
 * Creates particle instances using the Factory pattern
 */

import { PARTICLE_TYPES } from '../core/Constants.js';
import { PulseParticle } from './particles/PulseParticle.js';
import { DashedTriangleParticle } from './particles/DashedTriangleParticle.js';
import { GlowingPathParticle } from './particles/GlowingPathParticle.js';
import { GreenCircleParticle } from './particles/GreenCircleParticle.js';
import { ExplosionParticle } from './particles/ExplosionParticle.js';
import { SpinningCircleParticle } from './particles/SpinningCircleParticle.js';

export class ParticleFactory {
    constructor() {
        // Map of particle type to class
        this.particleClasses = {
            [PARTICLE_TYPES.PULSE]: PulseParticle,
            [PARTICLE_TYPES.DASHED_TRIANGLE]: DashedTriangleParticle,
            [PARTICLE_TYPES.GLOWING_PATH]: GlowingPathParticle,
            [PARTICLE_TYPES.GREEN_CIRCLE]: GreenCircleParticle,
            [PARTICLE_TYPES.EXPLOSION]: ExplosionParticle,
            [PARTICLE_TYPES.SPINNING_CIRCLE]: SpinningCircleParticle
        };
    }

    /**
     * Create a particle of the specified type
     * @param {string} type - Particle type from PARTICLE_TYPES
     * @param {Object} options - Particle-specific options
     * @returns {Particle|null} - Created particle or null if type unknown
     */
    create(type, options = {}) {
        const ParticleClass = this.particleClasses[type];
        
        if (!ParticleClass) {
            console.error(`Unknown particle type: ${type}`);
            return null;
        }
        
        try {
            return new ParticleClass(options);
        } catch (error) {
            console.error(`Error creating ${type} particle:`, error);
            return null;
        }
    }

    /**
     * Register a new particle type
     * Allows extending with custom particle types
     */
    register(type, ParticleClass) {
        if (this.particleClasses[type]) {
            console.warn(`Particle type ${type} already registered, overwriting`);
        }
        this.particleClasses[type] = ParticleClass;
    }

    /**
     * Get list of registered particle types
     */
    getRegisteredTypes() {
        return Object.keys(this.particleClasses);
    }

    /**
     * Check if particle type is registered
     */
    isRegistered(type) {
        return this.particleClasses.hasOwnProperty(type);
    }
}
