/**
 * Base class for Floyd-Warshall visualization modes
 * Uses Strategy pattern to encapsulate different visualization behaviors
 */

import { COLORS } from '../../core/Constants.js';

export class VisualizationMode {
    constructor(name, description) {
        this.name = name;
        this.description = description;
    }

    /**
     * Visualize the comparison step
     * Must be implemented by subclasses
     * @param {Object} context - Visualization context
     * @param {Object} context.step - Current algorithm step
     * @param {Object} context.positions - Node positions
     * @param {ParticleSystem} context.particles - Particle system
     * @param {number} context.speedMultiplier - Animation speed multiplier
     * @param {Object} context.state - Animation state
     */
    visualize(context) {
        throw new Error(`${this.name}: visualize() must be implemented`);
    }

    /**
     * Clear previous visualizations
     * Called before new comparison
     */
    clear(particles) {
        particles.clearType('dashed-triangle');
        particles.clearType('glowing-path');
    }

    /**
     * Create node pulses for K, I, J nodes
     * Common to all modes
     */
    createNodePulses(context) {
        const { step, positions, particles, speedMultiplier } = context;
        
        if (positions[step.k]) {
            particles.createPulse(
                positions[step.k].x,
                positions[step.k].y,
                COLORS.FLOYD_K,
                1.5,
                speedMultiplier
            );
        }
        
        if (positions[step.i]) {
            particles.createPulse(
                positions[step.i].x,
                positions[step.i].y,
                COLORS.FLOYD_I,
                1.2,
                speedMultiplier
            );
        }
        
        if (positions[step.j]) {
            particles.createPulse(
                positions[step.j].x,
                positions[step.j].y,
                COLORS.FLOYD_J,
                1.2,
                speedMultiplier
            );
        }
    }

    /**
     * Determine if path through K is shorter
     */
    isPathShorter(step) {
        return step.viaDist < step.directDist;
    }

    /**
     * Get color for accepted/rejected paths
     */
    getAcceptedColor(isAccepted) {
        return isAccepted ? COLORS.FLOYD_ACCEPTED : COLORS.FLOYD_REJECTED;
    }

    /**
     * Get metadata about this mode
     */
    getMetadata() {
        return {
            name: this.name,
            description: this.description
        };
    }
}
