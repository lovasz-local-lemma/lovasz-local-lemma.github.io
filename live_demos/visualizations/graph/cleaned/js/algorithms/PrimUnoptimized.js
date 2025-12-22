/**
 * Prim's Algorithm - Unoptimized Version
 * Uses simple array scan instead of priority queue
 */

import { Algorithm } from './Algorithm.js';

export class PrimUnoptimized extends Algorithm {
    constructor() {
        super();
        this.metadata = {
            name: "Prim's Algorithm (Unoptimized)",
            type: 'mst',
            description: 'Finds MST by scanning all edges - O(V²) time complexity',
            timeComplexity: 'O(V²)',
            spaceComplexity: 'O(V)',
            useCases: ['Dense graphs', 'Educational comparison']
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

        // Initialize: Start node
        state.key[startNode] = 0;

        yield {
            type: 'init',
            current: startNode,
            inMST: [...state.inMST],
            key: [...state.key],
            mstEdges: [],
            message: `Starting Prim's MST (Unoptimized) from node ${startNode}`
        };

        // Main loop - add n vertices
        for (let count = 0; count < n; count++) {
            // Find minimum key vertex not in MST
            let minKey = Infinity;
            let minNode = -1;

            yield {
                type: 'scan_start',
                inMST: [...state.inMST],
                key: [...state.key],
                mstEdges: [...state.mstEdges],
                message: `Scanning all nodes to find minimum key...`
            };

            for (let v = 0; v < n; v++) {
                yield {
                    type: 'scan_node',
                    scanNode: v,
                    currentMin: minNode,
                    inMST: [...state.inMST],
                    key: [...state.key],
                    mstEdges: [...state.mstEdges],
                    message: `Checking node ${v}: key=${state.key[v]}, inMST=${state.inMST[v]}`
                };

                if (!state.inMST[v] && state.key[v] < minKey) {
                    minKey = state.key[v];
                    minNode = v;
                }
            }

            if (minNode === -1) break;

            // Add to MST
            state.inMST[minNode] = true;

            // Add edge to MST (if not start node)
            if (state.parent[minNode] !== null) {
                const edge = this.findEdge(graph, state.parent[minNode], minNode);
                if (edge) {
                    state.mstEdges.push(edge);
                }

                yield {
                    type: 'add_to_mst',
                    current: minNode,
                    parent: state.parent[minNode],
                    edge,
                    edgeWeight: minKey,
                    inMST: [...state.inMST],
                    key: [...state.key],
                    mstEdges: [...state.mstEdges],
                    message: `Added node ${minNode} to MST (edge ${state.parent[minNode]} → ${minNode}, weight: ${minKey})`
                };
            } else {
                yield {
                    type: 'add_to_mst',
                    current: minNode,
                    inMST: [...state.inMST],
                    key: [...state.key],
                    mstEdges: [...state.mstEdges],
                    message: `Added start node ${minNode} to MST`
                };
            }

            // Update keys of adjacent vertices
            const neighbors = this.getNeighbors(graph, minNode);

            for (const { node: neighbor, weight } of neighbors) {
                if (!state.inMST[neighbor] && weight < state.key[neighbor]) {
                    const edge = this.findEdge(graph, minNode, neighbor);

                    yield {
                        type: 'update_key',
                        current: minNode,
                        neighbor,
                        edge,
                        oldKey: state.key[neighbor],
                        newKey: weight,
                        inMST: [...state.inMST],
                        key: [...state.key],
                        mstEdges: [...state.mstEdges],
                        message: `Updated key for node ${neighbor}: ${state.key[neighbor]} → ${weight}`
                    };

                    state.key[neighbor] = weight;
                    state.parent[neighbor] = minNode;
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
