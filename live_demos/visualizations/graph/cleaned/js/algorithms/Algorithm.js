/**
 * Base class for all graph algorithms
 * Uses Template Method pattern for common algorithm structure
 */

import { STEP_TYPES } from '../core/Constants.js';

export class Algorithm {
    constructor(name, description) {
        this.name = name;
        this.description = description;
    }

    /**
     * Execute the algorithm
     * Must be implemented by subclasses as a generator function
     * @param {Graph} graph - The graph to run the algorithm on
     * @param {*} options - Algorithm-specific options
     * @returns {Generator} - Yields steps for visualization
     */
    *execute(graph, options = {}) {
        throw new Error(`${this.name}: execute() must be implemented`);
    }

    /**
     * Validate that the graph is suitable for this algorithm
     * Override in subclasses if needed
     */
    validateGraph(graph) {
        if (!graph || !graph.nodes || graph.nodes.length === 0) {
            throw new Error('Graph must have at least one node');
        }
        return true;
    }

    /**
     * Create a step object with common fields
     */
    createStep(type, data = {}) {
        return {
            type,
            algorithm: this.name,
            timestamp: Date.now(),
            ...data
        };
    }

    /**
     * Create an initialization step
     */
    createInitStep(data = {}) {
        return this.createStep(STEP_TYPES.INIT, {
            message: `Starting ${this.name}`,
            ...data
        });
    }

    /**
     * Create a completion step
     */
    createCompleteStep(data = {}) {
        return this.createStep(STEP_TYPES.COMPLETE, {
            message: `${this.name} complete`,
            ...data
        });
    }

    /**
     * Get algorithm metadata
     */
    getMetadata() {
        return {
            name: this.name,
            description: this.description,
            requiresStartNode: this.requiresStartNode || false,
            supportsDirected: this.supportsDirected !== false,
            supportsNegativeWeights: this.supportsNegativeWeights || false
        };
    }
}
