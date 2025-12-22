/**
 * Mode Manager
 * Manages Floyd-Warshall visualization
 * Mode Manager - Switches between visualization modes
 */

import { LengthOnlyMode } from './LengthOnlyMode.js';
import { PathTrackingMode } from './PathTrackingMode.js';

export class ModeManager {
    constructor() {
        this.modes = {
            'length-only': new LengthOnlyMode(),
            'path-tracking': new PathTrackingMode()
        };
        
        // Default to path tracking mode
        this.currentMode = 'path-tracking';
    }

    /**
     * Set current mode
     */
    setMode(modeName) {
        if (!this.modes[modeName]) {
            console.warn(`Unknown mode: ${modeName}, keeping current mode`);
            return false;
        }
        
        this.currentMode = modeName;
        return true;
    }

    /**
     * Get current mode
     */
    getMode() {
        return this.modes[this.currentMode];
    }

    /**
     * Get mode by name
     */
    getModeByName(modeName) {
        return this.modes[modeName] || null;
    }

    /**
     * Visualize using current mode
     */
    visualize(context) {
        const mode = this.getMode();
        
        if (!mode) {
            console.error('No visualization mode set');
            return;
        }
        
        mode.visualize(context);
    }

    /**
     * Check if current mode supports hover paths
     */
    supportsHoverPaths() {
        return this.currentMode === 'path-tracking';
    }

    /**
     * Draw hover paths if current mode supports it
     */
    drawHoverPaths(context, hoveredNode, renderContext) {
        if (!this.supportsHoverPaths()) {
            return;
        }
        
        const mode = this.getMode();
        
        if (mode.drawHoverPaths) {
            mode.drawHoverPaths(context, hoveredNode, renderContext);
        }
    }

    /**
     * Get list of available modes
     */
    getAvailableModes() {
        return Object.keys(this.modes);
    }

    /**
     * Get metadata for all modes
     */
    getAllModesMetadata() {
        const metadata = {};
        
        for (const [name, mode] of Object.entries(this.modes)) {
            metadata[name] = mode.getMetadata();
        }
        
        return metadata;
    }

    /**
     * Get metadata for current mode
     */
    getCurrentModeMetadata() {
        const mode = this.getMode();
        return mode ? mode.getMetadata() : null;
    }

    /**
     * Register a custom mode
     * Allows extending with new visualization modes
     */
    registerMode(name, modeInstance) {
        if (this.modes[name]) {
            console.warn(`Mode ${name} already exists, overwriting`);
        }
        
        this.modes[name] = modeInstance;
    }
}
