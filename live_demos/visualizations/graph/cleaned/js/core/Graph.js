/**
 * Graph data structure
 * Represents a graph with nodes and edges
 */

export class Graph {
    constructor(directed = false) {
        this.nodes = [];
        this.edges = [];
        this.directed = directed;
    }

    /**
     * Add a node to the graph
     */
    addNode(id, x = 0, y = 0) {
        if (this.hasNode(id)) {
            console.warn(`Node ${id} already exists`);
            return;
        }
        
        this.nodes.push({ id, x, y });
    }

    /**
     * Add an edge to the graph
     */
    addEdge(from, to, weight = 1) {
        if (!this.hasNode(from) || !this.hasNode(to)) {
            console.error(`Cannot add edge: nodes ${from} or ${to} don't exist`);
            return;
        }
        
        this.edges.push({ from, to, weight });
    }

    /**
     * Check if node exists
     */
    hasNode(id) {
        return this.nodes.some(node => node.id === id);
    }

    /**
     * Check if edge exists
     */
    hasEdge(from, to) {
        return this.edges.some(edge => {
            const forwardMatch = edge.from === from && edge.to === to;
            
            if (this.directed) {
                return forwardMatch;
            }
            
            const reverseMatch = edge.from === to && edge.to === from;
            return forwardMatch || reverseMatch;
        });
    }

    /**
     * Get neighbors of a node
     */
    getNeighbors(nodeId) {
        const neighbors = [];
        
        for (const edge of this.edges) {
            if (edge.from === nodeId) {
                neighbors.push({ 
                    nodeId: edge.to, 
                    weight: edge.weight 
                });
            }
            
            if (!this.directed && edge.to === nodeId) {
                neighbors.push({ 
                    nodeId: edge.from, 
                    weight: edge.weight 
                });
            }
        }
        
        return neighbors;
    }

    /**
     * Get edge between two nodes
     */
    getEdge(from, to) {
        return this.edges.find(edge => {
            const forwardMatch = edge.from === from && edge.to === to;
            
            if (this.directed) {
                return forwardMatch;
            }
            
            const reverseMatch = edge.from === to && edge.to === from;
            return forwardMatch || reverseMatch;
        });
    }

    /**
     * Clear all nodes and edges
     */
    clear() {
        this.nodes = [];
        this.edges = [];
    }

    /**
     * Get node count
     */
    getNodeCount() {
        return this.nodes.length;
    }

    /**
     * Get edge count
     */
    getEdgeCount() {
        return this.edges.length;
    }

    /**
     * Clone the graph
     */
    clone() {
        const cloned = new Graph(this.directed);
        cloned.nodes = this.nodes.map(node => ({ ...node }));
        cloned.edges = this.edges.map(edge => ({ ...edge }));
        return cloned;
    }

    /**
     * Convert to adjacency matrix
     */
    toAdjacencyMatrix() {
        const n = this.nodes.length;
        const matrix = Array(n).fill()
            .map(() => Array(n).fill(Infinity));
        
        // Diagonal is 0
        for (let i = 0; i < n; i++) {
            matrix[i][i] = 0;
        }
        
        // Fill with edge weights
        for (const edge of this.edges) {
            matrix[edge.from][edge.to] = edge.weight;
            
            if (!this.directed) {
                matrix[edge.to][edge.from] = edge.weight;
            }
        }
        
        return matrix;
    }

    /**
     * Generate random graph
     */
    static generateRandom(nodeCount, density = 0.3, weightMode = 'random') {
        const graph = new Graph(false);
        
        // Add nodes
        for (let i = 0; i < nodeCount; i++) {
            graph.addNode(i);
        }
        
        // Ensure connectivity: create spanning tree first
        const visited = new Set([0]);
        const unvisited = new Set();
        
        for (let i = 1; i < nodeCount; i++) {
            unvisited.add(i);
        }
        
        while (unvisited.size > 0) {
            const from = Array.from(visited)[
                Math.floor(Math.random() * visited.size)
            ];
            const to = Array.from(unvisited)[
                Math.floor(Math.random() * unvisited.size)
            ];
            
            const weight = this._generateWeight(weightMode);
            graph.addEdge(from, to, weight);
            
            visited.add(to);
            unvisited.delete(to);
        }
        
        // Add additional edges based on density
        const maxEdges = (nodeCount * (nodeCount - 1)) / 2;
        const targetEdges = Math.floor(maxEdges * density);
        
        while (graph.edges.length < targetEdges) {
            const from = Math.floor(Math.random() * nodeCount);
            const to = Math.floor(Math.random() * nodeCount);
            
            if (from !== to && !graph.hasEdge(from, to)) {
                const weight = this._generateWeight(weightMode);
                graph.addEdge(from, to, weight);
            }
        }
        
        return graph;
    }

    /**
     * Generate weight based on mode
     */
    static _generateWeight(mode) {
        switch (mode) {
            case 'uniform':
                return 1;
            case 'random':
                return Math.floor(Math.random() * 10) + 1;
            case 'weighted':
                return Math.floor(Math.random() * 20) + 1;
            default:
                return 1;
        }
    }
}
