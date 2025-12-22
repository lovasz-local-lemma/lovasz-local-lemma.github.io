// Treap implementation (Tree + Heap)
class Treap {
    constructor() {
        this.root = null;
        this.operations = [];
    }

    insert(value) {
        this.operations.push({type: 'insert', value, tree: 'Treap'});
        this.root = this._insertTreap(this.root, value);
        this._updateHeights(this.root);
        return this.root;
    }

    _insertTreap(node, value) {
        if (!node) {
            return new TreapNode(value);
        }

        if (value < node.value) {
            node.left = this._insertTreap(node.left, value);
            if (node.left) node.left.parent = node;
            
            // Maintain heap property
            if (node.left.priority > node.priority) {
                node = this._rightRotate(node);
            }
        } else if (value > node.value) {
            node.right = this._insertTreap(node.right, value);
            if (node.right) node.right.parent = node;
            
            // Maintain heap property
            if (node.right.priority > node.priority) {
                node = this._leftRotate(node);
            }
        }

        return node;
    }

    delete(value) {
        this.operations.push({type: 'delete', value, tree: 'Treap'});
        this.root = this._deleteTreap(this.root, value);
        this._updateHeights(this.root);
        return this.root;
    }

    _deleteTreap(node, value) {
        if (!node) return null;

        if (value < node.value) {
            node.left = this._deleteTreap(node.left, value);
            if (node.left) node.left.parent = node;
        } else if (value > node.value) {
            node.right = this._deleteTreap(node.right, value);
            if (node.right) node.right.parent = node;
        } else {
            // Node to delete found
            if (!node.left) {
                return node.right;
            } else if (!node.right) {
                return node.left;
            } else {
                // Node has both children - rotate the child with higher priority up
                if (node.left.priority > node.right.priority) {
                    node = this._rightRotate(node);
                    node.right = this._deleteTreap(node.right, value);
                    if (node.right) node.right.parent = node;
                } else {
                    node = this._leftRotate(node);
                    node.left = this._deleteTreap(node.left, value);
                    if (node.left) node.left.parent = node;
                }
            }
        }

        return node;
    }

    _leftRotate(x) {
        this.operations.push({type: 'spin', direction: 'left', tree: 'Treap'});
        const y = x.right;
        x.right = y.left;
        if (y.left) y.left.parent = x;
        y.parent = x.parent;
        if (!x.parent) {
            this.root = y;
        } else if (x === x.parent.left) {
            x.parent.left = y;
        } else {
            x.parent.right = y;
        }
        y.left = x;
        x.parent = y;
        return y;
    }

    _rightRotate(y) {
        this.operations.push({type: 'spin', direction: 'right', tree: 'Treap'});
        const x = y.left;
        y.left = x.right;
        if (x.right) x.right.parent = y;
        x.parent = y.parent;
        if (!y.parent) {
            this.root = x;
        } else if (y === y.parent.left) {
            y.parent.left = x;
        } else {
            y.parent.right = x;
        }
        x.right = y;
        y.parent = x;
        return x;
    }

    search(value) {
        this.operations.push({type: 'search', value, tree: 'Treap'});
        return this._searchNode(this.root, value);
    }

    _searchNode(node, value) {
        if (!node || node.value === value) {
            return node;
        }
        if (value < node.value) {
            return this._searchNode(node.left, value);
        }
        return this._searchNode(node.right, value);
    }

    _updateHeights(node) {
        if (!node) return 0;

        const leftHeight = this._updateHeights(node.left);
        const rightHeight = this._updateHeights(node.right);
        
        node.height = Math.max(leftHeight, rightHeight) + 1;
        return node.height;
    }

    getHeight() {
        return this.root ? this.root.height : 0;
    }

    getNodeCount() {
        return this._countNodes(this.root);
    }

    _countNodes(node) {
        if (!node) return 0;
        return 1 + this._countNodes(node.left) + this._countNodes(node.right);
    }

    clear() {
        this.root = null;
        this.operations = [];
    }
}
