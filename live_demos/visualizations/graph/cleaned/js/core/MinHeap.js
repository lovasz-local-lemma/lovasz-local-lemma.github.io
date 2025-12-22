/**
 * Min Heap (Priority Queue)
 * Used for Dijkstra and Prim algorithms
 */

export class MinHeap {
    constructor(comparator = null) {
        this.heap = [];
        this.comparator = comparator || this.defaultComparator;
    }

    /**
     * Default comparator for { node, distance } objects
     */
    defaultComparator(a, b) {
        return a.distance - b.distance;
    }

    /**
     * Get parent index
     */
    getParentIndex(index) {
        return Math.floor((index - 1) / 2);
    }

    /**
     * Get left child index
     */
    getLeftChildIndex(index) {
        return 2 * index + 1;
    }

    /**
     * Get right child index
     */
    getRightChildIndex(index) {
        return 2 * index + 2;
    }

    /**
     * Check if has parent
     */
    hasParent(index) {
        return this.getParentIndex(index) >= 0;
    }

    /**
     * Check if has left child
     */
    hasLeftChild(index) {
        return this.getLeftChildIndex(index) < this.heap.length;
    }

    /**
     * Check if has right child
     */
    hasRightChild(index) {
        return this.getRightChildIndex(index) < this.heap.length;
    }

    /**
     * Get parent value
     */
    parent(index) {
        return this.heap[this.getParentIndex(index)];
    }

    /**
     * Get left child value
     */
    leftChild(index) {
        return this.heap[this.getLeftChildIndex(index)];
    }

    /**
     * Get right child value
     */
    rightChild(index) {
        return this.heap[this.getRightChildIndex(index)];
    }

    /**
     * Swap two elements
     */
    swap(index1, index2) {
        const temp = this.heap[index1];
        this.heap[index1] = this.heap[index2];
        this.heap[index2] = temp;
    }

    /**
     * Peek at minimum element without removing
     */
    peek() {
        if (this.heap.length === 0) {
            return null;
        }
        return this.heap[0];
    }

    /**
     * Extract minimum element
     */
    extractMin() {
        if (this.heap.length === 0) {
            return null;
        }

        const min = this.heap[0];
        this.heap[0] = this.heap[this.heap.length - 1];
        this.heap.pop();
        
        if (this.heap.length > 0) {
            this.heapifyDown();
        }

        return min;
    }

    /**
     * Insert new element
     */
    insert(item) {
        this.heap.push(item);
        this.heapifyUp();
    }

    /**
     * Heapify up (bubble up)
     */
    heapifyUp() {
        let index = this.heap.length - 1;

        while (
            this.hasParent(index) &&
            this.comparator(this.heap[index], this.parent(index)) < 0
        ) {
            this.swap(this.getParentIndex(index), index);
            index = this.getParentIndex(index);
        }
    }

    /**
     * Heapify down (bubble down)
     */
    heapifyDown() {
        let index = 0;

        while (this.hasLeftChild(index)) {
            let smallerChildIndex = this.getLeftChildIndex(index);

            if (
                this.hasRightChild(index) &&
                this.comparator(
                    this.rightChild(index),
                    this.leftChild(index)
                ) < 0
            ) {
                smallerChildIndex = this.getRightChildIndex(index);
            }

            if (
                this.comparator(
                    this.heap[index],
                    this.heap[smallerChildIndex]
                ) < 0
            ) {
                break;
            }

            this.swap(index, smallerChildIndex);
            index = smallerChildIndex;
        }
    }

    /**
     * Check if heap is empty
     */
    isEmpty() {
        return this.heap.length === 0;
    }

    /**
     * Get heap size
     */
    size() {
        return this.heap.length;
    }

    /**
     * Clear heap
     */
    clear() {
        this.heap = [];
    }

    /**
     * Build heap from array
     */
    buildHeap(array) {
        this.heap = array;
        for (let i = Math.floor(this.heap.length / 2); i >= 0; i--) {
            this.heapifyDownFrom(i);
        }
    }

    /**
     * Heapify down from specific index
     */
    heapifyDownFrom(startIndex) {
        let index = startIndex;

        while (this.hasLeftChild(index)) {
            let smallerChildIndex = this.getLeftChildIndex(index);

            if (
                this.hasRightChild(index) &&
                this.comparator(
                    this.rightChild(index),
                    this.leftChild(index)
                ) < 0
            ) {
                smallerChildIndex = this.getRightChildIndex(index);
            }

            if (
                this.comparator(
                    this.heap[index],
                    this.heap[smallerChildIndex]
                ) < 0
            ) {
                break;
            }

            this.swap(index, smallerChildIndex);
            index = smallerChildIndex;
        }
    }

    /**
     * Convert heap to array (sorted)
     */
    toArray() {
        const result = [];
        const heapCopy = [...this.heap];

        while (this.heap.length > 0) {
            result.push(this.extractMin());
        }

        this.heap = heapCopy;
        return result;
    }
}
