/**
 * Length Only Floyd-Warshall Visualization Mode
 * Shows comparisons with glowing paths - green (accepted) and red (rejected)
 * Does not track actual paths, only cares about distance values
 */

import { VisualizationMode } from './VisualizationMode.js';
import { COLORS } from '../../core/Constants.js';

export class LengthOnlyMode extends VisualizationMode {
    constructor() {
        super(
            'Length Only (No Paths)',
            'Shows distance comparisons only. Green glow = accepted, Red dashed = rejected.'
        );
    }

    visualize(context) {
        const { step, positions, particles } = context;
        
        // Clear previous visualizations
        this.clear(particles);
        
        // Create node pulses
        this.createNodePulses(context);
        
        // Don't need to check path data - we only care about distances
        if (!this.hasRequiredData(step)) {
            return;
        }
        
        // Determine which distance is shorter
        const isPathViaShorter = this.isPathShorter(step);
        
        // Visualize the comparison
        this.visualizeComparison(context, isPathViaShorter);
    }

    /**
     * Check if we have required data
     */
    hasRequiredData(step) {
        return step.dist && step.i !== undefined && step.j !== undefined && step.k !== undefined;
    }

    /**
     * Visualize the comparison between current distance and via-K distance
     */
    visualizeComparison(context, isViaShorter) {
        const { step, positions, particles, speedMultiplier } = context;
        
        const nodeI = positions[step.i];
        const nodeJ = positions[step.j];
        const nodeK = positions[step.k];
        
        if (!nodeI || !nodeJ || !nodeK) return;
        
        // Always show both paths with glow effect
        
        // Path via K (i -> k -> j)
        if (isViaShorter) {
            // Accepted path - green solid with glow
            setTimeout(() => {
                const segmentIK = [
                    { x: nodeI.x, y: nodeI.y },
                    { x: (nodeI.x + nodeK.x) / 2, y: (nodeI.y + nodeK.y) / 2 },
                    { x: nodeK.x, y: nodeK.y }
                ];
                particles.createGlowingPath(segmentIK, COLORS.FLOYD_ACCEPTED, true);
                
                const segmentKJ = [
                    { x: nodeK.x, y: nodeK.y },
                    { x: (nodeK.x + nodeJ.x) / 2, y: (nodeK.y + nodeJ.y) / 2 },
                    { x: nodeJ.x, y: nodeJ.y }
                ];
                particles.createGlowingPath(segmentKJ, COLORS.FLOYD_ACCEPTED, true);
            }, 100);
        } else {
            // Rejected path - red dashed
            setTimeout(() => {
                const segmentIK = [
                    { x: nodeI.x, y: nodeI.y },
                    { x: (nodeI.x + nodeK.x) / 2, y: (nodeI.y + nodeK.y) / 2 },
                    { x: nodeK.x, y: nodeK.y }
                ];
                particles.createGlowingPath(segmentIK, COLORS.FLOYD_REJECTED, false);
                
                const segmentKJ = [
                    { x: nodeK.x, y: nodeK.y },
                    { x: (nodeK.x + nodeJ.x) / 2, y: (nodeK.y + nodeJ.y) / 2 },
                    { x: nodeJ.x, y: nodeJ.y }
                ];
                particles.createGlowingPath(segmentKJ, COLORS.FLOYD_REJECTED, false);
            }, 100);
        }
        
        // Direct path (i -> j)
        if (!isViaShorter) {
            // Accepted path - green solid with glow
            const segmentIJ = [
                { x: nodeI.x, y: nodeI.y },
                { x: (nodeI.x + nodeJ.x) / 2, y: (nodeI.y + nodeJ.y) / 2 },
                { x: nodeJ.x, y: nodeJ.y }
            ];
            particles.createGlowingPath(segmentIJ, COLORS.FLOYD_ACCEPTED, true);
        } else {
            // Rejected path - red dashed
            const segmentIJ = [
                { x: nodeI.x, y: nodeI.y },
                { x: (nodeI.x + nodeJ.x) / 2, y: (nodeI.y + nodeJ.y) / 2 },
                { x: nodeJ.x, y: nodeJ.y }
            ];
            particles.createGlowingPath(segmentIJ, COLORS.FLOYD_REJECTED, false);
        }
    }

    /**
     * This mode doesn't support hover paths (no path data stored)
     */
    supportsHoverPaths() {
        return false;
    }

    drawHoverPaths(context, hoveredNode, renderContext) {
        // Not supported in length-only mode
        return;
    }
}
