/**
 * Dijkstra's Algorithm
 * Single-source shortest path algorithm for non-negative edge weights
 */

import { Algorithm } from './Algorithm.js';
import { getNeighbors, findEdge } from '../core/Utils.js';
import { MinHeap } from '../core/MinHeap.js';

export class Dijkstra extends Algorithm {
    constructor() {
        super('Dijkstra', 'Single-source shortest path with non-negative weights');
    }

    /**
     * Execute Dijkstra's algorithm
     */
    *execute(graph, options = {}) {
        const startNode = options.startNode || 0;
        const nodeCount = graph.nodes.length;

        // Validate start node
        if (!this.isValidStartNode(startNode, nodeCount)) {
            throw new Error(`Invalid start node: ${startNode}`);
        }

        // Initialize state
        const state = this.initializeState(nodeCount, startNode);

        // Yield initialization step
        yield this.createInitializationStep(startNode, state);

        // Main algorithm loop
        yield* this.processNodes(graph, state);

        // Yield completion step
        yield this.createCompletionStep(state);
    }

    /**
     * Validate graph requirements
     */
    validateGraph(graph) {
        super.validateGraph(graph);
        
        // Check for negative weights
        for (const edge of graph.edges) {
            if (edge.weight < 0) {
                throw new Error('Dijkstra requires non-negative edge weights');
            }
        }
    }

    /**
     * Validate start node
     */
    isValidStartNode(startNode, nodeCount) {
        return startNode >= 0 && startNode < nodeCount;
    }

    /**
     * Initialize algorithm state
     */
    initializeState(nodeCount, startNode) {
        return {
            distances: Array(nodeCount).fill(Infinity),
            visited: Array(nodeCount).fill(false),
            previous: Array(nodeCount).fill(null),
            priorityQueue: new MinHeap(),
            startNode
        };
    }

    /**
     * Setup initial state
     */
    setupInitialState(state) {
        const { startNode, distances, priorityQueue } = state;
        
        distances[startNode] = 0;
        priorityQueue.insert({ node: startNode, distance: 0 });
    }

    /**
     * Process all nodes
     */
    *processNodes(graph, state) {
        const { priorityQueue } = state;
        
        this.setupInitialState(state);

        while (!priorityQueue.isEmpty()) {
            const { node: current, distance: pqDist } = priorityQueue.extractMin();

            // Check for stale entries
            if (this.isStaleEntry(current, pqDist, state)) {
                yield this.createDiscardStep(current, pqDist, state);
                continue;
            }

            // Skip already visited nodes
            if (state.visited[current]) {
                continue;
            }

            // Mark as visited
            state.visited[current] = true;

            // Yield visit step
            yield this.createVisitStep(current, state);

            // Process neighbors
            yield* this.processNeighbors(graph, current, state);
        }
    }

    /**
     * Check if priority queue entry is stale
     */
    isStaleEntry(node, pqDistance, state) {
        return pqDistance > state.distances[node];
    }

    /**
     * Process neighbors of current node
     */
    *processNeighbors(graph, current, state) {
        const neighbors = getNeighbors(graph, current);

        // Yield batch begin step
        yield this.createBatchBeginStep(current, neighbors.length, state);

        for (const { nodeId: neighbor, weight } of neighbors) {
            if (state.visited[neighbor]) {
                continue;
            }

            yield* this.processNeighbor(graph, current, neighbor, weight, state);
        }
    }

    /**
     * Process single neighbor
     */
    *processNeighbor(graph, current, neighbor, weight, state) {
        const edge = findEdge(graph.edges, current, neighbor, graph.directed);

        // Yield explore step
        yield this.createExploreStep(current, neighbor, edge, state);

        // Calculate new distance
        const newDistance = state.distances[current] + weight;

        // Check if we can relax the edge
        if (this.canRelax(neighbor, newDistance, state)) {
            this.relaxEdge(neighbor, newDistance, current, state);
            yield this.createRelaxStep(current, neighbor, edge, newDistance, state);
        }
    }

    /**
     * Check if edge can be relaxed
     */
    canRelax(neighbor, newDistance, state) {
        return newDistance < state.distances[neighbor];
    }

    /**
     * Relax edge (update distance)
     */
    relaxEdge(neighbor, newDistance, current, state) {
        state.distances[neighbor] = newDistance;
        state.previous[neighbor] = current;
        state.priorityQueue.insert({ 
            node: neighbor, 
            distance: newDistance 
        });
    }

    /**
     * Get priority queue snapshot
     */
    getPriorityQueueSnapshot(priorityQueue) {
        return priorityQueue.heap.map(item => ({
            node: item.node,
            distance: item.distance
        }));
    }

    /**
     * Create initialization step
     */
    createInitializationStep(startNode, state) {
        return this.createStep('init', {
            current: startNode,
            distances: [...state.distances],
            visited: [...state.visited],
            priorityQueue: this.getPriorityQueueSnapshot(state.priorityQueue),
            message: `Starting Dijkstra from node ${startNode}`
        });
    }

    /**
     * Create discard step (for stale PQ entries)
     */
    createDiscardStep(node, pqDistance, state) {
        return this.createStep('discard', {
            current: node,
            pqDistance,
            currentDistance: state.distances[node],
            priorityQueue: this.getPriorityQueueSnapshot(state.priorityQueue),
            message: `Discarded stale entry: node ${node} with dist ${pqDistance} (current best: ${state.distances[node]})`
        });
    }

    /**
     * Create visit step
     */
    createVisitStep(node, state) {
        return this.createStep('visit', {
            current: node,
            distances: [...state.distances],
            visited: [...state.visited],
            priorityQueue: this.getPriorityQueueSnapshot(state.priorityQueue),
            message: `Visiting node ${node} (distance: ${state.distances[node]})`
        });
    }

    /**
     * Create batch begin step
     */
    createBatchBeginStep(node, neighborCount, state) {
        return this.createStep('begin_batch', {
            current: node,
            neighborCount,
            distances: [...state.distances],
            priorityQueue: this.getPriorityQueueSnapshot(state.priorityQueue),
            message: `Exploring ${neighborCount} neighbors of node ${node}`
        });
    }

    /**
     * Create explore step
     */
    createExploreStep(current, neighbor, edge, state) {
        return this.createStep('explore', {
            current,
            neighbor,
            edge,
            distances: [...state.distances],
            message: `Exploring edge ${current} → ${neighbor} (weight: ${edge?.weight || 0})`
        });
    }

    /**
     * Create relax step
     */
    createRelaxStep(current, neighbor, edge, newDistance, state) {
        return this.createStep('relax', {
            current,
            neighbor,
            edge,
            distances: [...state.distances],
            previous: [...state.previous],
            priorityQueue: this.getPriorityQueueSnapshot(state.priorityQueue),
            message: `Updated distance to ${neighbor}: ${newDistance} (pushed to PQ)`
        });
    }

    /**
     * Create completion step
     */
    createCompletionStep(state) {
        return this.createStep('complete', {
            distances: [...state.distances],
            previous: [...state.previous],
            visited: [...state.visited],
            message: 'Algorithm complete!'
        });
    }

    /**
     * Get algorithm metadata
     */
    getMetadata() {
        return {
            ...super.getMetadata(),
            timeComplexity: 'O((V + E) log V)',
            spaceComplexity: 'O(V)',
            requirements: ['Non-negative edge weights'],
            useCases: [
                'GPS navigation',
                'Network routing',
                'Shortest path in graphs'
            ]
        };
    }
}
