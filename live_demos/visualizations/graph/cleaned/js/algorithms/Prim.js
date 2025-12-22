/**
 * Prim's Algorithm - Minimum Spanning Tree
 * Extends base Algorithm class
 */

import { Algorithm } from './Algorithm.js';
import { MinHeap } from '../core/MinHeap.js';

export class Prim extends Algorithm {
    constructor() {
        super();
        this.metadata = {
            name: "Prim's Algorithm",
            type: 'mst',
            description: 'Finds Minimum Spanning Tree using greedy approach with priority queue',
            timeComplexity: 'O((V + E) log V)',
            spaceComplexity: 'O(V)',
            useCases: ['Minimum Spanning Tree', 'Network design', 'Clustering']
        };
    }

    /**
     * Initialize algorithm state
     */
    initializeState(graph, options = {}) {
        const { startNode = 0 } = options;
        const n = graph.nodes.length;

        return {
            inMST: new Array(n).fill(false),
            key: new Array(n).fill(Infinity),
            parent: new Array(n).fill(null),
            pq: new MinHeap(),
            mstEdges: [],
            startNode,
            n
        };
    }

    /**
     * Execute algorithm - generator function
     */
    *execute(graph, options = {}) {
        const state = this.initializeState(graph, options);
        const { startNode, n } = state;

        // Initialize: Add start node to PQ
        state.key[startNode] = 0;
        state.pq.insert({ node: startNode, key: 0 });

        yield {
            type: 'init',
            current: startNode,
            inMST: [...state.inMST],
            key: [...state.key],
            mstEdges: [],
            priorityQueue: this.getPQState(state.pq, state.parent, graph),
            pqEdges: [],
            message: `Starting Prim's MST from node ${startNode}, added to PQ`
        };

        // Main loop
        while (!state.pq.isEmpty()) {
            // Peek at top
            const top = state.pq.peek();
            
            yield {
                type: 'pq_peek',
                topNode: top.node,
                topKey: top.key,
                inMST: [...state.inMST],
                key: [...state.key],
                mstEdges: [...state.mstEdges],
                priorityQueue: this.getPQState(state.pq, state.parent, graph),
                pqEdges: this.getPQEdges(state.pq, state.parent, graph),
                message: `PQ top: edge to node ${top.node} (weight: ${top.key})`
            };

            // Pop from PQ
            const { node: current, key: edgeWeight } = state.pq.extractMin();

            yield {
                type: 'pq_pop',
                current,
                edgeWeight,
                inMST: [...state.inMST],
                key: [...state.key],
                mstEdges: [...state.mstEdges],
                priorityQueue: this.getPQState(state.pq, state.parent, graph),
                pqEdges: this.getPQEdges(state.pq, state.parent, graph),
                message: `Popped node ${current} from PQ (weight: ${edgeWeight})`
            };

            // Check if already in MST (stale entry)
            if (state.inMST[current]) {
                yield {
                    type: 'pq_skip',
                    current,
                    inMST: [...state.inMST],
                    key: [...state.key],
                    mstEdges: [...state.mstEdges],
                    priorityQueue: this.getPQState(state.pq, state.parent, graph),
                    pqEdges: this.getPQEdges(state.pq, state.parent, graph),
                    message: `Node ${current} already in MST - skip (stale entry)`
                };
                continue;
            }

            // Add to MST
            state.inMST[current] = true;

            // Add edge to MST (if not the start node)
            if (state.parent[current] !== null) {
                const edge = this.findEdge(graph, state.parent[current], current);
                if (edge) {
                    state.mstEdges.push(edge);
                }

                yield {
                    type: 'add_to_mst',
                    current,
                    parent: state.parent[current],
                    edge,
                    edgeWeight,
                    inMST: [...state.inMST],
                    key: [...state.key],
                    mstEdges: [...state.mstEdges],
                    priorityQueue: this.getPQState(state.pq, state.parent, graph),
                    pqEdges: this.getPQEdges(state.pq, state.parent, graph),
                    message: `Added edge ${state.parent[current]} → ${current} (weight: ${edgeWeight}) to MST`
                };
            }

            // Get neighbors
            const neighbors = this.getNeighbors(graph, current);

            // Explore neighbors
            for (const { node: neighbor, weight } of neighbors) {
                if (state.inMST[neighbor]) {
                    // Skip nodes already in MST
                    continue;
                }

                const edge = this.findEdge(graph, current, neighbor);

                yield {
                    type: 'explore',
                    current,
                    neighbor,
                    edge,
                    weight,
                    currentKey: state.key[neighbor],
                    inMST: [...state.inMST],
                    key: [...state.key],
                    mstEdges: [...state.mstEdges],
                    priorityQueue: this.getPQState(state.pq, state.parent, graph),
                    pqEdges: this.getPQEdges(state.pq, state.parent, graph),
                    message: `Exploring edge ${current} → ${neighbor} (weight: ${weight})`
                };

                // Update key if this edge is better
                if (weight < state.key[neighbor]) {
                    state.key[neighbor] = weight;
                    state.parent[neighbor] = current;
                    state.pq.insert({ node: neighbor, key: weight });

                    yield {
                        type: 'update_key',
                        current,
                        neighbor,
                        edge,
                        newKey: weight,
                        inMST: [...state.inMST],
                        key: [...state.key],
                        parent: [...state.parent],
                        mstEdges: [...state.mstEdges],
                        priorityQueue: this.getPQState(state.pq, state.parent, graph),
                        pqEdges: this.getPQEdges(state.pq, state.parent, graph),
                        message: `Updated key for node ${neighbor}: ${weight} (pushed to PQ)`
                    };
                }
            }
        }

        // Calculate total MST weight
        const totalWeight = state.mstEdges.reduce((sum, edge) => sum + edge.weight, 0);

        yield {
            type: 'complete',
            inMST: [...state.inMST],
            key: [...state.key],
            mstEdges: [...state.mstEdges],
            totalWeight,
            message: `MST complete! Total weight: ${totalWeight}, Edges: ${state.mstEdges.length}`
        };
    }

    /**
     * Get priority queue state for visualization
     */
    getPQState(pq, parent, graph) {
        return pq.heap.map(item => ({
            node: item.node,
            key: item.key,
            from: parent[item.node]
        }));
    }

    /**
     * Get edges currently in priority queue
     */
    getPQEdges(pq, parent, graph) {
        return pq.heap
            .filter(item => parent[item.node] !== null)
            .map(item => this.findEdge(graph, parent[item.node], item.node))
            .filter(e => e !== null);
    }

    /**
     * Find edge between two nodes
     */
    findEdge(graph, from, to) {
        return graph.edges.find(edge => {
            const forwardMatch = edge.from === from && edge.to === to;
            if (graph.directed) return forwardMatch;
            const reverseMatch = edge.from === to && edge.to === from;
            return forwardMatch || reverseMatch;
        });
    }

    /**
     * Get neighbors of a node
     */
    getNeighbors(graph, nodeId) {
        const neighbors = [];
        
        for (const edge of graph.edges) {
            if (edge.from === nodeId) {
                neighbors.push({ node: edge.to, weight: edge.weight });
            }
            if (!graph.directed && edge.to === nodeId) {
                neighbors.push({ node: edge.from, weight: edge.weight });
            }
        }
        
        return neighbors;
    }
}
