/**
 * Floyd-Warshall Algorithm
 * Computes all-pairs shortest paths
 */

import { Algorithm } from './Algorithm.js';
import { STEP_TYPES } from '../core/Constants.js';
import { createMatrix, cloneMatrix, formatDistance } from '../core/Utils.js';

export class FloydWarshall extends Algorithm {
    constructor() {
        super('Floyd-Warshall', 'All-pairs shortest paths algorithm');
        this.supportsNegativeWeights = true;
        this.requiresStartNode = false;
    }

    /**
     * Execute Floyd-Warshall algorithm
     */
    *execute(graph, options = {}) {
        this.validateGraph(graph);
        
        const nodeCount = graph.nodes.length;
        const state = this.initializeMatrices(graph, nodeCount);
        
        yield this.createInitializationStep(state);
        
        // Main triple loop
        for (let k = 0; k < nodeCount; k++) {
            yield this.createIntermediateStep(k, state);
            
            for (let i = 0; i < nodeCount; i++) {
                for (let j = 0; j < nodeCount; j++) {
                    // Skip diagonal
                    if (i === j) {
                        continue;
                    }
                    
                    // Skip pairs that include the intermediate node
                    if (this.shouldSkipPair(i, j, k)) {
                        yield this.createSkipStep(i, j, k, state);
                        continue;
                    }
                    
                    // Compare paths
                    const comparison = this.comparePaths(i, j, k, state);
                    yield this.createCompareStep(i, j, k, comparison, state);
                    
                    // Update if shorter path found
                    if (comparison.isShorter) {
                        this.updatePath(i, j, k, state);
                        yield this.createUpdateStep(i, j, k, comparison, state);
                    }
                }
            }
        }
        
        yield this.createCompletionStep(state);
    }

    /**
     * Initialize distance and next matrices
     */
    initializeMatrices(graph, nodeCount) {
        const distances = createMatrix(nodeCount, nodeCount, Infinity);
        const next = createMatrix(nodeCount, nodeCount, null);
        
        // Diagonal is 0
        for (let i = 0; i < nodeCount; i++) {
            distances[i][i] = 0;
        }
        
        // Initialize with direct edges
        for (const edge of graph.edges) {
            this.addEdgeToMatrices(edge, distances, next);
            
            // For undirected graphs, add reverse direction
            if (!graph.directed) {
                this.addReverseEdgeToMatrices(edge, distances, next);
            }
        }
        
        return { distances, next };
    }

    /**
     * Add edge to matrices
     */
    addEdgeToMatrices(edge, distances, next) {
        distances[edge.from][edge.to] = edge.weight;
        next[edge.from][edge.to] = edge.to;
    }

    /**
     * Add reverse edge for undirected graphs
     */
    addReverseEdgeToMatrices(edge, distances, next) {
        distances[edge.to][edge.from] = edge.weight;
        next[edge.to][edge.from] = edge.from;
    }

    /**
     * Check if pair should be skipped
     */
    shouldSkipPair(i, j, k) {
        return i === k || j === k;
    }

    /**
     * Compare direct path vs path through intermediate node
     */
    comparePaths(i, j, k, state) {
        const directDistance = state.distances[i][j];
        const distanceViaK = state.distances[i][k] + state.distances[k][j];
        
        return {
            directDistance,
            distanceViaK,
            distanceIK: state.distances[i][k],
            distanceKJ: state.distances[k][j],
            isShorter: distanceViaK < directDistance
        };
    }

    /**
     * Update path with shorter route
     */
    updatePath(i, j, k, state) {
        const oldDistance = state.distances[i][j];
        const newDistance = state.distances[i][k] + state.distances[k][j];
        
        state.distances[i][j] = newDistance;
        state.next[i][j] = state.next[i][k];
        
        return { oldDistance, newDistance };
    }

    /**
     * Create initialization step
     */
    createInitializationStep(state) {
        return this.createStep(STEP_TYPES.INIT, {
            dist: cloneMatrix(state.distances),
            next: cloneMatrix(state.next),
            message: 'Initialized distance matrix with direct edges'
        });
    }

    /**
     * Create intermediate node step
     */
    createIntermediateStep(k, state) {
        return this.createStep(STEP_TYPES.INTERMEDIATE, {
            k,
            dist: cloneMatrix(state.distances),
            next: cloneMatrix(state.next),
            message: `Using node ${k} as intermediate node`
        });
    }

    /**
     * Create skip step
     */
    createSkipStep(i, j, k, state) {
        return this.createStep(STEP_TYPES.SKIP, {
            i, j, k,
            dist: cloneMatrix(state.distances),
            next: cloneMatrix(state.next),
            message: `Skipped: pair (${i},${j}) includes intermediate node ${k}`
        });
    }

    /**
     * Create comparison step
     */
    createCompareStep(i, j, k, comparison, state) {
        const directStr = formatDistance(comparison.directDistance);
        const ikStr = formatDistance(comparison.distanceIK);
        const kjStr = formatDistance(comparison.distanceKJ);
        const viaStr = formatDistance(comparison.distanceViaK);
        
        return this.createStep(STEP_TYPES.COMPARE, {
            i, j, k,
            directDist: comparison.directDistance,
            viaDist: comparison.distanceViaK,
            distIK: comparison.distanceIK,
            distKJ: comparison.distanceKJ,
            dist: cloneMatrix(state.distances),
            next: cloneMatrix(state.next),
            message: this.buildCompareMessage(i, j, k, directStr, ikStr, kjStr, viaStr)
        });
    }

    /**
     * Build comparison message
     */
    buildCompareMessage(i, j, k, directStr, ikStr, kjStr, viaStr) {
        return `Comparing: dist[${i}][${j}] = ${directStr} vs ` +
               `dist[${i}][${k}] + dist[${k}][${j}] = ${ikStr} + ${kjStr} = ${viaStr}`;
    }

    /**
     * Create update step
     */
    createUpdateStep(i, j, k, comparison, state) {
        const oldStr = formatDistance(comparison.directDistance);
        const newStr = formatDistance(state.distances[i][j]);
        
        return this.createStep(STEP_TYPES.UPDATE, {
            i, j, k,
            oldDist: comparison.directDistance,
            newDist: state.distances[i][j],
            dist: cloneMatrix(state.distances),
            next: cloneMatrix(state.next),
            message: `✓ Updated dist[${i}][${j}] via ${k}: ${oldStr} → ${newStr}`
        });
    }

    /**
     * Create completion step
     */
    createCompletionStep(state) {
        return this.createStep(STEP_TYPES.COMPLETE, {
            dist: cloneMatrix(state.distances),
            next: cloneMatrix(state.next),
            message: 'All-pairs shortest paths computed!'
        });
    }
}
