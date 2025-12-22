/**
 * Base class for all particle types
 * Each particle type extends this and implements update() and render()
 */

export class Particle {
    constructor(options = {}) {
        this.x = options.x || 0;
        this.y = options.y || 0;
        this.color = options.color || '#ffffff';
        this.alpha = options.alpha !== undefined ? options.alpha : 1.0;
        this.life = options.life !== undefined ? options.life : 1.0;
        this.maxLife = options.maxLife || this.life;
        this.isAlive = true;
    }

    /**
     * Update particle state
     * @returns {boolean} - true if particle should continue, false if done
     */
    update(deltaTime) {
        throw new Error('Particle.update() must be implemented');
    }

    /**
     * Render particle to canvas
     * @param {CanvasRenderingContext2D} context
     */
    render(context) {
        throw new Error('Particle.render() must be implemented');
    }

    /**
     * Check if particle is still alive
     */
    checkLife() {
        this.isAlive = this.life > 0 && this.alpha > 0;
        return this.isAlive;
    }

    /**
     * Apply context settings before rendering
     */
    applyContextSettings(context) {
        context.save();
        context.globalAlpha = this.alpha;
    }

    /**
     * Restore context settings after rendering
     */
    restoreContext(context) {
        context.restore();
    }

    /**
     * Fade out over time
     */
    fadeOut(fadeSpeed = 0.016) {
        this.life -= fadeSpeed;
        this.alpha = this.life / this.maxLife;
    }
}
