// 2-3-4 Tree implementation
class Tree234 {
    constructor() {
        this.root = new Node234();
        this.operations = [];
    }

    insert(value) {
        this.operations.push({type: 'insert', value, tree: '2-3-4'});
        
        if (this.root.isFull()) {
            const newRoot = new Node234();
            newRoot.children.push(this.root);
            this.root.parent = newRoot;
            this._splitChild(newRoot, 0);
            this.root = newRoot;
            this.operations.push({type: 'split', operation: 'Root split', tree: '2-3-4'});
        }
        
        this._insertNonFull(this.root, value);
        return this.root;
    }

    _insertNonFull(node, value) {
        let i = node.keys.length - 1;

        if (node.isLeaf()) {
            node.keys.push(0);
            while (i >= 0 && node.keys[i] > value) {
                node.keys[i + 1] = node.keys[i];
                i--;
            }
            node.keys[i + 1] = value;
        } else {
            while (i >= 0 && node.keys[i] > value) {
                i--;
            }
            i++;

            if (node.children[i].isFull()) {
                this._splitChild(node, i);
                this.operations.push({type: 'split', operation: `Split child at index ${i}`, tree: '2-3-4'});
                if (node.keys[i] < value) {
                    i++;
                }
            }
            this._insertNonFull(node.children[i], value);
        }
    }

    _splitChild(parent, index) {
        const fullChild = parent.children[index];
        const newChild = new Node234();

        // Save the keys before modifying
        const key0 = fullChild.keys[0];
        const key1 = fullChild.keys[1];
        const key2 = fullChild.keys[2];

        // Move the largest key and its children to new node
        newChild.keys = [key2];
        fullChild.keys = [key0];

        if (!fullChild.isLeaf()) {
            newChild.children = [fullChild.children[2], fullChild.children[3]];
            fullChild.children = [fullChild.children[0], fullChild.children[1]];
            
            // Update parent pointers
            newChild.children.forEach(child => {
                if (child) child.parent = newChild;
            });
        }

        // Move middle key up to parent
        parent.keys.splice(index, 0, key1);
        parent.children.splice(index + 1, 0, newChild);
        
        // Update parent pointers
        newChild.parent = parent;
        fullChild.parent = parent;
    }

    delete(value) {
        this.operations.push({type: 'delete', value, tree: '2-3-4'});
        this._delete(this.root, value);
        
        // If root becomes empty, make its only child the new root
        if (this.root.keys.length === 0 && !this.root.isLeaf()) {
            this.root = this.root.children[0];
            this.root.parent = null;
        }
        
        return this.root;
    }

    _delete(node, value) {
        const index = node.keys.findIndex(key => key === value);
        
        if (index !== -1) {
            // Key found in current node
            if (node.isLeaf()) {
                node.keys.splice(index, 1);
            } else {
                // Replace with predecessor or successor
                const predecessor = this._getPredecessor(node, index);
                node.keys[index] = predecessor;
                this._delete(node.children[index], predecessor);
            }
        } else {
            // Key not in current node, find child to recurse into
            let childIndex = 0;
            while (childIndex < node.keys.length && value > node.keys[childIndex]) {
                childIndex++;
            }
            
            if (!node.isLeaf()) {
                const child = node.children[childIndex];
                
                // Ensure child has at least 2 keys before recursing
                if (child.keys.length === 1) {
                    this._fixChild(node, childIndex);
                }
                
                this._delete(node.children[childIndex], value);
            }
        }
    }

    _getPredecessor(node, index) {
        let current = node.children[index];
        while (!current.isLeaf()) {
            current = current.children[current.children.length - 1];
        }
        return current.keys[current.keys.length - 1];
    }

    _fixChild(parent, childIndex) {
        const child = parent.children[childIndex];
        
        // Try to borrow from left sibling
        if (childIndex > 0 && parent.children[childIndex - 1].keys.length > 1) {
            this._borrowFromLeft(parent, childIndex);
            this.operations.push({type: 'borrow', operation: 'Borrow from left sibling', tree: '2-3-4'});
        }
        // Try to borrow from right sibling
        else if (childIndex < parent.children.length - 1 && parent.children[childIndex + 1].keys.length > 1) {
            this._borrowFromRight(parent, childIndex);
            this.operations.push({type: 'borrow', operation: 'Borrow from right sibling', tree: '2-3-4'});
        }
        // Merge with sibling
        else {
            if (childIndex > 0) {
                this._merge(parent, childIndex - 1);
                this.operations.push({type: 'merge', operation: 'Merge with left sibling', tree: '2-3-4'});
            } else {
                this._merge(parent, childIndex);
                this.operations.push({type: 'merge', operation: 'Merge with right sibling', tree: '2-3-4'});
            }
        }
    }

    _borrowFromLeft(parent, childIndex) {
        const child = parent.children[childIndex];
        const leftSibling = parent.children[childIndex - 1];
        
        child.keys.unshift(parent.keys[childIndex - 1]);
        parent.keys[childIndex - 1] = leftSibling.keys.pop();
        
        if (!leftSibling.isLeaf()) {
            const borrowedChild = leftSibling.children.pop();
            child.children.unshift(borrowedChild);
            borrowedChild.parent = child;
        }
    }

    _borrowFromRight(parent, childIndex) {
        const child = parent.children[childIndex];
        const rightSibling = parent.children[childIndex + 1];
        
        child.keys.push(parent.keys[childIndex]);
        parent.keys[childIndex] = rightSibling.keys.shift();
        
        if (!rightSibling.isLeaf()) {
            const borrowedChild = rightSibling.children.shift();
            child.children.push(borrowedChild);
            borrowedChild.parent = child;
        }
    }

    _merge(parent, leftIndex) {
        const leftChild = parent.children[leftIndex];
        const rightChild = parent.children[leftIndex + 1];
        
        leftChild.keys.push(parent.keys[leftIndex]);
        leftChild.keys = leftChild.keys.concat(rightChild.keys);
        
        if (!leftChild.isLeaf()) {
            leftChild.children = leftChild.children.concat(rightChild.children);
            rightChild.children.forEach(child => {
                if (child) child.parent = leftChild;
            });
        }
        
        parent.keys.splice(leftIndex, 1);
        parent.children.splice(leftIndex + 1, 1);
    }

    search(value) {
        this.operations.push({type: 'search', value, tree: '2-3-4'});
        return this._searchNode(this.root, value);
    }

    _searchNode(node, value) {
        if (node.hasKey(value)) {
            return node;
        }
        
        if (node.isLeaf()) {
            return null;
        }
        
        let i = 0;
        while (i < node.keys.length && value > node.keys[i]) {
            i++;
        }
        
        return this._searchNode(node.children[i], value);
    }

    getHeight() {
        return this._calculateHeight(this.root);
    }

    _calculateHeight(node) {
        if (!node || node.isLeaf()) return 1;
        return 1 + this._calculateHeight(node.children[0]);
    }

    getNodeCount() {
        return this._countKeys(this.root);
    }

    _countKeys(node) {
        if (!node) return 0;
        let count = node.keys.length;
        if (!node.isLeaf()) {
            for (const child of node.children) {
                count += this._countKeys(child);
            }
        }
        return count;
    }

    clear() {
        this.root = new Node234();
        this.operations = [];
    }
}
