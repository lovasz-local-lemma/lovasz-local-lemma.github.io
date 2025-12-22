/**
 * Shared utility functions
 * Pure functions with no side effects
 */

/**
 * Calculate distance between two points
 */
export function calculateDistance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate midpoint between two points
 */
export function calculateMidpoint(x1, y1, x2, y2) {
    return {
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2
    };
}

/**
 * Calculate angle between two points
 */
export function calculateAngle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}

/**
 * Check if two edges match (considering undirected graphs)
 */
export function edgesMatch(edge1, edge2, isDirected) {
    const forwardMatch = (
        edge1.from === edge2.from && 
        edge1.to === edge2.to
    );
    
    if (isDirected) {
        return forwardMatch;
    }
    
    const reverseMatch = (
        edge1.from === edge2.to && 
        edge1.to === edge2.from
    );
    
    return forwardMatch || reverseMatch;
}

/**
 * Find edge in edge list
 */
export function findEdge(edges, from, to, isDirected) {
    return edges.find(edge => 
        edgesMatch({ from, to }, edge, isDirected)
    );
}

/**
 * Get neighbors of a node
 */
export function getNeighbors(graph, nodeId) {
    const neighbors = [];
    
    for (const edge of graph.edges) {
        if (edge.from === nodeId) {
            neighbors.push({ 
                nodeId: edge.to, 
                weight: edge.weight 
            });
        }
        
        if (!graph.directed && edge.to === nodeId) {
            neighbors.push({ 
                nodeId: edge.from, 
                weight: edge.weight 
            });
        }
    }
    
    return neighbors;
}

/**
 * Format distance for display (handle Infinity)
 */
export function formatDistance(distance) {
    return distance === Infinity ? '∞' : distance.toString();
}

/**
 * Clone a 2D array (for matrices)
 */
export function cloneMatrix(matrix) {
    return matrix.map(row => [...row]);
}

/**
 * Create empty 2D array
 */
export function createMatrix(rows, cols, defaultValue) {
    return Array(rows)
        .fill()
        .map(() => Array(cols).fill(defaultValue));
}

/**
 * Generate random integer in range [min, max]
 */
export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random float in range [min, max]
 */
export function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

/**
 * Clamp value between min and max
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Lerp (linear interpolation) between two values
 */
export function lerp(start, end, t) {
    return start + (end - start) * t;
}


/**
 * Check if point is inside circle
 */
export function isPointInCircle(px, py, cx, cy, radius) {
    const distance = calculateDistance(px, py, cx, cy);
    return distance <= radius;
}


/**
 * Check if point is inside rectangle
 */
export function isPointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}


/**
 * Deep clone object
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce function calls
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Check if value is defined and not null
 */
export function isDefined(value) {
    return value !== undefined && value !== null;
}

/**
 * Safe array access with default
 */
export function safeGet(array, index, defaultValue = null) {
    return array && array[index] !== undefined 
        ? array[index] 
        : defaultValue;
}
