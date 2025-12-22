/**
 * Kruskal's Algorithm - Minimum Spanning Tree
 * Extends base Algorithm class
 */

import { Algorithm } from './Algorithm.js';

export class Kruskal extends Algorithm {
    constructor() {
        super();
        this.metadata = {
            name: "Kruskal's Algorithm",
            type: 'mst',
            description: 'Finds Minimum Spanning Tree by sorting edges and using Union-Find',
            timeComplexity: 'O(E log E)',
            spaceComplexity: 'O(V)',
            useCases: ['Minimum Spanning Tree', 'Network design', 'Clustering']
        };
    }

    /**
     * Initialize algorithm state
     */
    initializeState(graph) {
        const n = graph.nodes.length;

        // Sort edges by weight
        const sortedEdges = [...graph.edges].sort((a, b) => a.weight - b.weight);

        // Generate distinct colors for each initial set
        const setColors = this.generateSetColors(n);

        return {
            parent: Array.from({ length: n }, (_, i) => i),
            rank: new Array(n).fill(0),
            setSize: new Array(n).fill(1),
            setColors,
            sortedEdges,
            mstEdges: [],
            processedEdges: [],
            currentEdgeIndex: 0,
            n
        };
    }

    /**
     * Generate distinct colors for sets
     */
    generateSetColors(n) {
        const colors = [];
        for (let i = 0; i < n; i++) {
            const hue = (i * 360 / n) % 360;
            colors.push(`hsl(${hue}, 70%, 60%)`);
        }
        return colors;
    }

    /**
     * Execute algorithm - generator function
     */
    *execute(graph) {
        const state = this.initializeState(graph);

        yield {
            type: 'init',
            sortedEdges: [...state.sortedEdges],
            mstEdges: [],
            processedEdges: [],
            parent: [...state.parent],
            setColors: [...state.setColors],
            setSize: [...state.setSize],
            message: `Starting Kruskal's MST. Sorted ${state.sortedEdges.length} edges by weight. Each node starts in its own set.`
        };

        // Process each edge in sorted order
        for (let i = 0; i < state.sortedEdges.length; i++) {
            const edge = state.sortedEdges[i];
            state.currentEdgeIndex = i;

            yield {
                type: 'consider_edge',
                edge,
                edgeIndex: i,
                totalEdges: state.sortedEdges.length,
                sortedEdges: [...state.sortedEdges],
                mstEdges: [...state.mstEdges],
                processedEdges: [...state.processedEdges],
                parent: [...state.parent],
                setColors: [...state.setColors],
                setSize: [...state.setSize],
                message: `Considering edge ${edge.from} → ${edge.to} (weight: ${edge.weight})`
            };

            // Find roots of both nodes
            const rootU = this.find(state.parent, edge.from);
            const rootV = this.find(state.parent, edge.to);

            yield {
                type: 'find_roots',
                edge,
                rootU,
                rootV,
                sortedEdges: [...state.sortedEdges],
                mstEdges: [...state.mstEdges],
                processedEdges: [...state.processedEdges],
                parent: [...state.parent],
                setColors: [...state.setColors],
                setSize: [...state.setSize],
                message: `Find: ${edge.from} → root ${rootU} (size: ${state.setSize[rootU]}), ${edge.to} → root ${rootV} (size: ${state.setSize[rootV]})`
            };

            // Check if adding this edge creates a cycle
            if (rootU === rootV) {
                // Reject - would create cycle
                state.processedEdges.push({ ...edge, status: 'rejected' });

                yield {
                    type: 'reject_edge',
                    edge,
                    reason: 'cycle',
                    rootU,
                    rootV,
                    sortedEdges: [...state.sortedEdges],
                    mstEdges: [...state.mstEdges],
                    processedEdges: [...state.processedEdges],
                    parent: [...state.parent],
                    setColors: [...state.setColors],
                    setSize: [...state.setSize],
                    message: `Rejected edge ${edge.from} → ${edge.to}: Would create cycle (both in set ${rootU})`
                };
            } else {
                // Accept - add to MST
                state.mstEdges.push(edge);
                state.processedEdges.push({ ...edge, status: 'accepted' });
                
                // Determine which set is bigger
                const biggerSet = state.setSize[rootU] >= state.setSize[rootV] ? rootU : rootV;
                const smallerSet = biggerSet === rootU ? rootV : rootU;
                const mergedColor = state.setColors[biggerSet];
                
                this.union(state.parent, state.rank, state.setSize, state.setColors, rootU, rootV);

                yield {
                    type: 'accept_edge',
                    edge,
                    rootU,
                    rootV,
                    biggerSet,
                    smallerSet,
                    mergedColor,
                    sortedEdges: [...state.sortedEdges],
                    mstEdges: [...state.mstEdges],
                    processedEdges: [...state.processedEdges],
                    parent: [...state.parent],
                    setColors: [...state.setColors],
                    setSize: [...state.setSize],
                    message: `Accepted edge ${edge.from} → ${edge.to}. Merged set ${smallerSet} (size: ${state.setSize[smallerSet]}) into set ${biggerSet} (size: ${state.setSize[biggerSet]})`
                };

                // Check if MST is complete
                if (state.mstEdges.length === state.n - 1) {
                    break;
                }
            }
        }

        // Calculate total MST weight
        const totalWeight = state.mstEdges.reduce((sum, edge) => sum + edge.weight, 0);

        yield {
            type: 'complete',
            sortedEdges: [...state.sortedEdges],
            mstEdges: [...state.mstEdges],
            processedEdges: [...state.processedEdges],
            parent: [...state.parent],
            setColors: [...state.setColors],
            setSize: [...state.setSize],
            totalWeight,
            message: `MST complete! Total weight: ${totalWeight}, Edges: ${state.mstEdges.length}/${state.n - 1}`
        };
    }

    /**
     * Find root of a set (with path compression)
     */
    find(parent, node) {
        if (parent[node] !== node) {
            parent[node] = this.find(parent, parent[node]);
        }
        return parent[node];
    }

    /**
     * Union two sets (by rank and size, with color merging)
     */
    union(parent, rank, setSize, setColors, rootU, rootV) {
        // Determine which set is bigger
        let biggerRoot, smallerRoot;
        
        if (setSize[rootU] > setSize[rootV]) {
            biggerRoot = rootU;
            smallerRoot = rootV;
        } else if (setSize[rootU] < setSize[rootV]) {
            biggerRoot = rootV;
            smallerRoot = rootU;
        } else {
            // Same size, use rank as tiebreaker
            if (rank[rootU] >= rank[rootV]) {
                biggerRoot = rootU;
                smallerRoot = rootV;
            } else {
                biggerRoot = rootV;
                smallerRoot = rootU;
            }
        }
        
        // Merge smaller into bigger
        parent[smallerRoot] = biggerRoot;
        setSize[biggerRoot] += setSize[smallerRoot];
        
        // Keep bigger set's color
        const mergedColor = setColors[biggerRoot];
        setColors[smallerRoot] = mergedColor;
        
        // Update rank if needed
        if (rank[rootU] === rank[rootV]) {
            rank[biggerRoot]++;
        }
    }
}
