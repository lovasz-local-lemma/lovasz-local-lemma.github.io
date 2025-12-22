/**
 * Colorful Floyd-Warshall Visualization Mode
 * Shows glowing paths for both via-K and direct routes
 * Winner glows green, loser glows red
 */

import { VisualizationMode } from './VisualizationMode.js';
import { COLORS } from '../../core/Constants.js';
import { calculateMidpoint } from '../../core/Utils.js';

export class ColorfulMode extends VisualizationMode {
    constructor() {
        super(
            'Colorful Indicator',
            'Glowing paths showing both routes (winner=green glow, loser=red glow)'
        );
    }

    visualize(context) {
        const { step, positions, particles } = context;
        
        // Clear previous visualizations
        this.clear(particles);
        
        // Create node pulses
        this.createNodePulses(context);
        
        // Determine which path is shorter
        const isPathViaShorter = this.isPathShorter(step);
        
        // Draw via-K path (i -> k -> j) with delay
        this.drawViaKPath(context, isPathViaShorter);
        
        // Draw direct path (i -> j) with delay
        this.drawDirectPath(context, !isPathViaShorter);
    }

    /**
     * Draw path going through intermediate node K
     */
    drawViaKPath(context, isAccepted) {
        const { step, positions, particles } = context;
        
        setTimeout(() => {
            const pathPoints = [
                positions[step.i],
                positions[step.k],
                positions[step.j]
            ];
            
            particles.createGlowingPath(
                pathPoints,
                COLORS.PATH_CANDIDATE,  // Blue for via-K
                isAccepted
            );
        }, 100);
    }

    /**
     * Draw direct path from i to j
     */
    drawDirectPath(context, isAccepted) {
        const { step, positions, particles } = context;
        
        setTimeout(() => {
            // Calculate midpoint for visualization
            const midpoint = calculateMidpoint(
                positions[step.i].x,
                positions[step.i].y,
                positions[step.j].x,
                positions[step.j].y
            );
            
            const pathPoints = [
                positions[step.i],
                midpoint,
                positions[step.j]
            ];
            
            particles.createGlowingPath(
                pathPoints,
                COLORS.PATH_CURRENT,  // Purple for direct
                isAccepted
            );
        }, 200);
    }
}
