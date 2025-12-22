/**
 * Path Tracking Floyd-Warshall Visualization Mode
 * Shows actual shortest paths found so far
 * Supports hover to see all paths from a node
 */

import { VisualizationMode } from './VisualizationMode.js';
import { COLORS } from '../../core/Constants.js';
import { PathReconstructor } from '../PathReconstructor.js';

export class PathTrackingMode extends VisualizationMode {
    constructor() {
        super(
            'Path Tracking',
            'Shows actual shortest paths found so far. Hover over nodes to see all paths.'
        );
        
        this.pathReconstructor = new PathReconstructor();
    }

    visualize(context) {
        const { step, positions, particles, state } = context;
        
        // Clear previous visualizations
        this.clear(particles);
        
        // Create node pulses
        this.createNodePulses(context);
        
        // Only visualize if we have the necessary matrices
        if (!this.hasRequiredData(step, state)) {
            return;
        }
        
        // Determine which path is shorter
        const isPathViaShorter = this.isPathShorter(step);
        
        // Draw current path (i -> j)
        this.drawCurrentPath(context, !isPathViaShorter);
        
        // Draw candidate path via K (i -> k -> j)
        this.drawCandidatePath(context, isPathViaShorter);
    }

    /**
     * Check if we have required data for path reconstruction
     */
    hasRequiredData(step, state) {
        return step.next && state.floydNext && state.floydDist;
    }

    /**
     * Draw current shortest path from i to j
     */
    drawCurrentPath(context, isAccepted) {
        const { step, state } = context;
        
        const currentPath = this.pathReconstructor.reconstruct(
            step.i,
            step.j,
            state.floydNext,
            state.floydDist
        );
        
        if (!currentPath || currentPath.length < 2) {
            return;
        }
        
        this.drawPath(context, currentPath, COLORS.PATH_CURRENT, isAccepted);
    }

    /**
     * Draw candidate path via K
     */
    drawCandidatePath(context, isAccepted) {
        const { step, state } = context;
        
        const pathViaK = this.pathReconstructor.reconstructViaK(
            step.i,
            step.k,
            step.j,
            state.floydNext,
            state.floydDist
        );
        
        if (!pathViaK || pathViaK.length < 2) {
            return;
        }
        
        // Draw with delay to show sequence
        setTimeout(() => {
            this.drawPath(context, pathViaK, COLORS.PATH_CANDIDATE, isAccepted);
        }, 200);
    }

    /**
     * Draw a path as connected segments
     */
    drawPath(context, path, color, isAccepted) {
        const { positions, particles } = context;
        
        // Draw path as series of connected segments
        for (let i = 0; i < path.length - 1; i++) {
            const fromNode = path[i];
            const toNode = path[i + 1];
            
            if (!positions[fromNode] || !positions[toNode]) {
                continue;
            }
            
            const segment = this.createSegment(
                positions[fromNode],
                positions[toNode]
            );
            
            // Stagger the appearance of each segment
            setTimeout(() => {
                particles.createGlowingPath(
                    segment,
                    color,
                    isAccepted
                );
            }, i * 100);
        }
    }

    /**
     * Create segment points for glowing path particle
     * A segment needs 3 points for the particle system
     */
    createSegment(fromPos, toPos) {
        const midX = (fromPos.x + toPos.x) / 2;
        const midY = (fromPos.y + toPos.y) / 2;
        
        return [
            { x: fromPos.x, y: fromPos.y },
            { x: midX, y: midY },
            { x: toPos.x, y: toPos.y }
        ];
    }

    /**
     * Draw all paths from hovered node
     * Called separately during render when hovering
     */
    drawHoverPaths(context, hoveredNode, renderContext) {
        const { positions, state, graph } = context;
        
        if (!state.floydNext || !state.floydDist) {
            return;
        }
        
        const nodeCount = graph.nodes.length;
        
        // Get all paths from hovered node
        const paths = this.pathReconstructor.reconstructAllFrom(
            hoveredNode,
            nodeCount,
            state.floydNext,
            state.floydDist
        );
        
        // Draw each path
        for (const [toNode, path] of Object.entries(paths)) {
            this.drawHoverPath(path, positions, renderContext);
        }
    }

    /**
     * Draw a single hover path
     */
    drawHoverPath(path, positions, renderContext) {
        if (!path || path.length < 2) {
            return;
        }
        
        renderContext.save();
        renderContext.strokeStyle = COLORS.PATH_HOVER;
        renderContext.lineWidth = 3;
        renderContext.globalAlpha = 0.6;
        renderContext.lineCap = 'round';
        renderContext.shadowBlur = 10;
        renderContext.shadowColor = COLORS.PATH_HOVER;
        
        // Draw path line
        renderContext.beginPath();
        renderContext.moveTo(positions[path[0]].x, positions[path[0]].y);
        
        for (let i = 1; i < path.length; i++) {
            renderContext.lineTo(positions[path[i]].x, positions[path[i]].y);
        }
        
        renderContext.stroke();
        
        // Draw arrowhead at destination
        this.drawArrowhead(path, positions, renderContext);
        
        renderContext.restore();
    }

    /**
     * Draw arrowhead at end of path
     */
    drawArrowhead(path, positions, renderContext) {
        if (path.length < 2) {
            return;
        }
        
        const lastIdx = path.length - 1;
        const prevIdx = lastIdx - 1;
        
        const angle = Math.atan2(
            positions[path[lastIdx]].y - positions[path[prevIdx]].y,
            positions[path[lastIdx]].x - positions[path[prevIdx]].x
        );
        
        const arrowSize = 12;
        const tipX = positions[path[lastIdx]].x;
        const tipY = positions[path[lastIdx]].y;
        
        renderContext.fillStyle = COLORS.PATH_HOVER;
        renderContext.beginPath();
        renderContext.moveTo(tipX, tipY);
        renderContext.lineTo(
            tipX - arrowSize * Math.cos(angle - Math.PI / 6),
            tipY - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        renderContext.lineTo(
            tipX - arrowSize * Math.cos(angle + Math.PI / 6),
            tipY - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        renderContext.closePath();
        renderContext.fill();
    }
}
