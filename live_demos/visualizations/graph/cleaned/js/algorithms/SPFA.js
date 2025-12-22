/**
 * SPFA (Shortest Path Faster Algorithm)
 * Optimized Bellman-Ford using queue
 */

import { Algorithm } from './Algorithm.js';
import { getNeighbors, findEdge } from '../core/Utils.js';

export class SPFA extends Algorithm {
    constructor() {
        super('SPFA', 'Shortest Path Faster Algorithm - optimized Bellman-Ford');
    }

    /**
     * Execute SPFA algorithm
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

        // Process queue
        yield* this.processQueue(graph, nodeCount, state);

        // Yield completion step
        yield this.createCompletionStep(state);
    }

    /**
     * Initialize algorithm state
     */
    initializeState(nodeCount, startNode) {
        const distances = Array(nodeCount).fill(Infinity);
        const previous = Array(nodeCount).fill(null);
        const inQueue = Array(nodeCount).fill(false);
        const relaxCount = Array(nodeCount).fill(0);
        const queue = [];

        distances[startNode] = 0;
        queue.push(startNode);
        inQueue[startNode] = true;

        return {
            distances,
            previous,
            inQueue,
            queue,
            relaxCount,
            startNode
        };
    }

    /**
     * Process queue until empty
     */
    *processQueue(graph, nodeCount, state) {
        while (state.queue.length > 0) {
            const current = this.dequeueNode(state);

            // Yield dequeue step
            yield this.createDequeueStep(current, state);

            // Process neighbors
            const hasNegativeCycle = yield* this.processNeighbors(
                graph, 
                current, 
                nodeCount, 
                state
            );

            if (hasNegativeCycle) {
                return; // Early termination
            }
        }
    }

    /**
     * Dequeue node from queue
     */
    dequeueNode(state) {
        const node = state.queue.shift();
        state.inQueue[node] = false;
        return node;
    }

    /**
     * Enqueue node to queue
     */
    enqueueNode(node, state) {
        state.queue.push(node);
        state.inQueue[node] = true;
    }

    /**
     * Process neighbors of current node
     */
    *processNeighbors(graph, current, nodeCount, state) {
        const neighbors = getNeighbors(graph, current);

        // Yield batch begin step
        yield this.createBatchBeginStep(current, neighbors.length, state);

        for (const { nodeId: neighbor, weight } of neighbors) {
            const hasNegativeCycle = yield* this.processNeighbor(
                graph,
                current,
                neighbor,
                weight,
                nodeCount,
                state
            );

            if (hasNegativeCycle) {
                return true;
            }
        }

        return false;
    }

    /**
     * Process single neighbor
     */
    *processNeighbor(graph, current, neighbor, weight, nodeCount, state) {
        const edge = findEdge(graph.edges, current, neighbor, graph.directed);
        const newDistance = state.distances[current] + weight;

        // Yield explore step
        yield this.createExploreStep(current, neighbor, edge, newDistance, state);

        // Check if we can relax
        if (this.canRelax(current, neighbor, newDistance, state)) {
            this.relaxEdge(neighbor, newDistance, current, state);

            // Yield relax step
            yield this.createRelaxStep(current, neighbor, edge, state);

            // Check for negative cycle
            if (this.hasNegativeCycle(neighbor, nodeCount, state)) {
                yield this.createNegativeCycleStep(neighbor, state);
                return true;
            }

            // Enqueue if not already in queue
            if (this.shouldEnqueue(neighbor, state)) {
                this.enqueueNode(neighbor, state);
                yield this.createEnqueueStep(neighbor, state);
            }
        }

        return false;
    }

    /**
     * Check if edge can be relaxed
     */
    canRelax(current, neighbor, newDistance, state) {
        return state.distances[current] !== Infinity &&
               newDistance < state.distances[neighbor];
    }

    /**
     * Relax edge
     */
    relaxEdge(neighbor, newDistance, current, state) {
        state.distances[neighbor] = newDistance;
        state.previous[neighbor] = current;
        state.relaxCount[neighbor]++;
    }

    /**
     * Check if node has negative cycle
     */
    hasNegativeCycle(node, nodeCount, state) {
        return state.relaxCount[node] >= nodeCount;
    }

    /**
     * Check if node should be enqueued
     */
    shouldEnqueue(node, state) {
        return !state.inQueue[node];
    }

    /**
     * Create initialization step
     */
    createInitializationStep(startNode, state) {
        return this.createStep('init', {
            current: startNode,
            distances: [...state.distances],
            queue: [...state.queue],
            inQueue: [...state.inQueue],
            message: `Starting SPFA from node ${startNode}`
        });
    }

    /**
     * Create dequeue step
     */
    createDequeueStep(node, state) {
        return this.createStep('dequeue', {
            current: node,
            queue: [...state.queue],
            inQueue: [...state.inQueue],
            distances: [...state.distances],
            message: `Dequeued node ${node} (distance: ${state.distances[node]})`
        });
    }

    /**
     * Create batch begin step
     */
    createBatchBeginStep(node, neighborCount, state) {
        return this.createStep('begin_batch', {
            current: node,
            neighborCount,
            queue: [...state.queue],
            inQueue: [...state.inQueue],
            distances: [...state.distances],
            message: `Exploring ${neighborCount} neighbors of node ${node}`
        });
    }

    /**
     * Create explore step
     */
    createExploreStep(current, neighbor, edge, newDistance, state) {
        return this.createStep('explore', {
            current,
            neighbor,
            edge,
            currentDist: state.distances[current],
            neighborDist: state.distances[neighbor],
            weight: edge?.weight || 0,
            newDistance,
            queue: [...state.queue],
            inQueue: [...state.inQueue],
            message: `Checking edge ${current} → ${neighbor}: ${state.distances[current]} + ${edge?.weight || 0} = ${newDistance}`
        });
    }

    /**
     * Create relax step
     */
    createRelaxStep(current, neighbor, edge, state) {
        return this.createStep('relax', {
            current,
            neighbor,
            edge,
            distances: [...state.distances],
            previous: [...state.previous],
            queue: [...state.queue],
            inQueue: [...state.inQueue],
            message: `Updated distance to ${neighbor}: ${state.distances[neighbor]}`
        });
    }

    /**
     * Create negative cycle detection step
     */
    createNegativeCycleStep(node, state) {
        return this.createStep('negative_cycle', {
            node,
            message: `Negative cycle detected! Node ${node} relaxed ${state.relaxCount[node]} times`
        });
    }

    /**
     * Create enqueue step
     */
    createEnqueueStep(node, state) {
        return this.createStep('enqueue', {
            neighbor: node,
            queue: [...state.queue],
            inQueue: [...state.inQueue],
            message: `Enqueued node ${node}`
        });
    }

    /**
     * Create completion step
     */
    createCompletionStep(state) {
        return this.createStep('complete', {
            distances: [...state.distances],
            previous: [...state.previous],
            message: 'SPFA complete! All reachable nodes processed.'
        });
    }

    /**
     * Get algorithm metadata
     */
    getMetadata() {
        return {
            ...super.getMetadata(),
            timeComplexity: 'O(V * E) worst case, O(E) average',
            spaceComplexity: 'O(V)',
            requirements: ['Can handle negative weights'],
            useCases: [
                'Faster than Bellman-Ford in practice',
                'Graphs with negative weights',
                'Negative cycle detection'
            ]
        };
    }
}
