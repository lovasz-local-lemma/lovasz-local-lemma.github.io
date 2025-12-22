/**
 * Path Reconstructor
 * Reconstructs paths from Floyd-Warshall next matrix
 */

export class PathReconstructor {
    constructor() {
        this.maxIterations = 100; // Safety limit
    }

    /**
     * Reconstruct path from i to j using next matrix
     * @param {number} fromNode - Starting node
     * @param {number} toNode - Ending node
     * @param {Array<Array>} nextMatrix - Floyd's next matrix
     * @param {Array<Array>} distanceMatrix - Floyd's distance matrix (optional, for validation)
     * @returns {Array<number>|null} - Path as array of node indices, or null if no path
     */
    reconstruct(fromNode, toNode, nextMatrix, distanceMatrix = null) {
        // Validate input
        if (!this.isValidInput(fromNode, toNode, nextMatrix)) {
            return null;
        }
        
        // Check if path exists in next matrix
        if (nextMatrix[fromNode][toNode] === null) {
            return null;
        }
        
        // Check if path is reachable (not Infinity distance)
        if (this.isUnreachable(fromNode, toNode, distanceMatrix)) {
            return null;
        }
        
        // Reconstruct the path
        return this.buildPath(fromNode, toNode, nextMatrix);
    }

    /**
     * Validate reconstruction input
     */
    isValidInput(fromNode, toNode, nextMatrix) {
        if (!nextMatrix || !nextMatrix[fromNode]) {
            return false;
        }
        
        if (fromNode === toNode) {
            return false;
        }
        
        return true;
    }

    /**
     * Check if path is unreachable
     */
    isUnreachable(fromNode, toNode, distanceMatrix) {
        if (!distanceMatrix || !distanceMatrix[fromNode]) {
            return false;
        }
        
        return distanceMatrix[fromNode][toNode] === Infinity;
    }

    /**
     * Build path by following next pointers
     */
    buildPath(fromNode, toNode, nextMatrix) {
        const path = [fromNode];
        let currentNode = fromNode;
        let iterations = 0;
        
        while (currentNode !== toNode && iterations < this.maxIterations) {
            currentNode = nextMatrix[currentNode][toNode];
            
            if (currentNode === null || currentNode === undefined) {
                return null; // Path broken
            }
            
            path.push(currentNode);
            iterations++;
        }
        
        // Verify we reached the destination
        if (currentNode !== toNode) {
            return null; // Failed to reach destination
        }
        
        return path;
    }

    /**
     * Reconstruct path going through intermediate node K
     * Returns combined path: i -> ... -> k -> ... -> j
     */
    reconstructViaK(fromNode, viaNode, toNode, nextMatrix, distanceMatrix = null) {
        const pathToK = this.reconstruct(fromNode, viaNode, nextMatrix, distanceMatrix);
        const pathFromK = this.reconstruct(viaNode, toNode, nextMatrix, distanceMatrix);
        
        if (!pathToK || !pathFromK) {
            return null;
        }
        
        // Combine paths, removing duplicate K node
        return this.concatenatePaths(pathToK, pathFromK);
    }

    /**
     * Concatenate two paths, removing the duplicate intermediate node
     */
    concatenatePaths(pathA, pathB) {
        if (!pathA || !pathB) {
            return null;
        }
        
        // Remove last node of pathA to avoid duplication
        // with first node of pathB (they are the same node)
        const pathWithoutDuplicate = pathA.slice(0, -1);
        
        return [...pathWithoutDuplicate, ...pathB];
    }

    /**
     * Convert path (array of node indices) to points (array of {x, y})
     */
    pathToPoints(path, nodePositions) {
        if (!path || path.length === 0) {
            return null;
        }
        
        return path.map(nodeIndex => {
            const position = nodePositions[nodeIndex];
            
            if (!position) {
                return null;
            }
            
            return { x: position.x, y: position.y };
        }).filter(point => point !== null);
    }

    /**
     * Get all paths from a node to all other nodes
     */
    reconstructAllFrom(fromNode, nodeCount, nextMatrix, distanceMatrix = null) {
        const paths = {};
        
        for (let toNode = 0; toNode < nodeCount; toNode++) {
            if (toNode === fromNode) {
                continue;
            }
            
            const path = this.reconstruct(fromNode, toNode, nextMatrix, distanceMatrix);
            
            if (path) {
                paths[toNode] = path;
            }
        }
        
        return paths;
    }
}
