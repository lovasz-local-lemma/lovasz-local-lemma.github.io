/**
 * Simple Floyd-Warshall Visualization Mode
 * Shows dashed triangles connecting i->k->j nodes
 * Green for accepted paths, orange for rejected
 */

import { VisualizationMode } from './VisualizationMode.js';
import { PARTICLE_TYPES } from '../../core/Constants.js';

export class SimpleMode extends VisualizationMode {
    constructor() {
        super(
            'Simple',
            'Dashed triangle showing the comparison (green=accepted, orange=rejected)'
        );
    }

    visualize(context) {
        const { step, positions, particles, speedMultiplier } = context;
        
        // Clear previous visualizations
        this.clear(particles);
        
        // Create node pulses
        this.createNodePulses(context);
        
        // Determine if path is accepted
        const isPathShorter = this.isPathShorter(step);
        const triangleColor = this.getAcceptedColor(isPathShorter);
        
        // Create dashed triangle: i -> k -> j -> i
        const trianglePoints = [
            positions[step.i],
            positions[step.k],
            positions[step.j]
        ];
        
        particles.createDashedTriangle(
            trianglePoints,
            triangleColor,
            speedMultiplier
        );
    }
}
