/**
 * Bellman-Ford Algorithm
 * Single-source shortest path that handles negative weights
 */

import { Algorithm } from './Algorithm.js';

export class BellmanFord extends Algorithm {
    constructor() {
        super('Bellman-Ford', 'Single-source shortest path with negative weight support');
    }

    /**
     * Execute Bellman-Ford algorithm
     */
    *execute(graph, options = {}) {
        const startNode = options.startNode || 0;
        const nodeCount = graph.nodes.length;

        // Validate start node
        if (startNode < 0 || startNode >= nodeCount) {
            throw new Error(`Invalid start node: ${startNode}`);
        }

        // Initialize state
        const state = this.initializeState(nodeCount, startNode);

        // Yield initialization step
        yield this.createInitializationStep(startNode, state);

        // Relax edges (n-1) times
        yield* this.relaxEdges(graph, nodeCount, state);

        // Check for negative cycles
        const hasNegativeCycle = yield* this.checkNegativeCycle(graph, state);

        if (hasNegativeCycle) {
            return; // Early termination
        }

        // Yield completion step
        yield this.createCompletionStep(state);
    }

    /**
     * Initialize algorithm state
     */
    initializeState(nodeCount, startNode) {
        const distances = Array(nodeCount).fill(Infinity);
        const previous = Array(nodeCount).fill(null);
        
        distances[startNode] = 0;

        return {
            distances,
            previous,
            startNode
        };
    }

    /**
     * Relax edges for (n-1) iterations
     */
    *relaxEdges(graph, nodeCount, state) {
        for (let iteration = 0; iteration < nodeCount - 1; iteration++) {
            yield this.createIterationStep(iteration, nodeCount, state);

            const updated = yield* this.relaxAllEdgesOnce(graph, state);

            // Early termination if no updates
            if (!updated) {
                yield this.createEarlyStopStep(iteration, state);
                break;
            }
        }
    }

    /**
     * Relax all edges once
     */
    *relaxAllEdgesOnce(graph, state) {
        let hasUpdated = false;

        for (const edge of graph.edges) {
            const updated = yield* this.processEdge(edge, state);
            hasUpdated = hasUpdated || updated;
        }

        return hasUpdated;
    }

    /**
     * Process single edge
     */
    *processEdge(edge, state) {
        const { from: u, to: v, weight } = edge;

        // Yield explore step
        yield this.createExploreStep(edge, state);

        // Check if we can relax
        if (this.canRelax(u, v, weight, state)) {
            this.relaxEdge(u, v, weight, state);
            yield this.createRelaxStep(edge, state);
            return true;
        }

        return false;
    }

    /**
     * Check if edge can be relaxed
     */
    canRelax(u, v, weight, state) {
        const { distances } = state;
        return distances[u] !== Infinity && 
               distances[u] + weight < distances[v];
    }

    /**
     * Relax edge
     */
    relaxEdge(u, v, weight, state) {
        state.distances[v] = state.distances[u] + weight;
        state.previous[v] = u;
    }

    /**
     * Check for negative weight cycles
     */
    *checkNegativeCycle(graph, state) {
        for (const edge of graph.edges) {
            const { from: u, to: v, weight } = edge;

            if (this.canRelax(u, v, weight, state)) {
                yield this.createNegativeCycleStep(edge);
                return true; // Negative cycle detected
            }
        }

        return false; // No negative cycle
    }

    /**
     * Create initialization step
     */
    createInitializationStep(startNode, state) {
        return this.createStep('init', {
            current: startNode,
            distances: [...state.distances],
            message: `Starting Bellman-Ford from node ${startNode}`
        });
    }

    /**
     * Create iteration step
     */
    createIterationStep(iteration, totalIterations, state) {
        return this.createStep('iteration', {
            iteration: iteration + 1,
            totalIterations,
            distances: [...state.distances],
            message: `Iteration ${iteration + 1} of ${totalIterations}`
        });
    }

    /**
     * Create explore step
     */
    createExploreStep(edge, state) {
        return this.createStep('explore', {
            edge,
            distances: [...state.distances],
            message: `Checking edge ${edge.from} → ${edge.to} (weight: ${edge.weight})`
        });
    }

    /**
     * Create relax step
     */
    createRelaxStep(edge, state) {
        return this.createStep('relax', {
            edge,
            distances: [...state.distances],
            previous: [...state.previous],
            message: `Relaxed edge ${edge.from} → ${edge.to}, new distance: ${state.distances[edge.to]}`
        });
    }

    /**
     * Create early stop step
     */
    createEarlyStopStep(iteration, state) {
        return this.createStep('early_stop', {
            iteration: iteration + 1,
            distances: [...state.distances],
            message: 'No updates in this iteration, stopping early'
        });
    }

    /**
     * Create negative cycle detection step
     */
    createNegativeCycleStep(edge) {
        return this.createStep('negative_cycle', {
            edge,
            message: `Negative cycle detected at edge ${edge.from} → ${edge.to}!`
        });
    }

    /**
     * Create completion step
     */
    createCompletionStep(state) {
        return this.createStep('complete', {
            distances: [...state.distances],
            previous: [...state.previous],
            message: 'Algorithm complete! No negative cycles detected.'
        });
    }

    /**
     * Get algorithm metadata
     */
    getMetadata() {
        return {
            ...super.getMetadata(),
            timeComplexity: 'O(V * E)',
            spaceComplexity: 'O(V)',
            requirements: ['Can handle negative weights'],
            useCases: [
                'Graphs with negative weights',
                'Negative cycle detection',
                'Currency arbitrage'
            ]
        };
    }
}
