// Splay Tree implementation
class SplayTree {
    constructor() {
        this.root = null;
        this.operations = [];
    }

    insert(value) {
        this.operations.push({type: 'insert', value, tree: 'Splay'});
        this.root = this._insertSplay(this.root, value);
        this.root = this._splay(this.root, value);
        this._updateHeights(this.root);
        return this.root;
    }

    _insertSplay(node, value) {
        if (!node) {
            return new TreeNode(value);
        }

        if (value < node.value) {
            node.left = this._insertSplay(node.left, value);
            if (node.left) node.left.parent = node;
        } else if (value > node.value) {
            node.right = this._insertSplay(node.right, value);
            if (node.right) node.right.parent = node;
        }

        return node;
    }

    delete(value) {
        this.operations.push({type: 'delete', value, tree: 'Splay'});
        this.root = this._splay(this.root, value);
        
        if (!this.root || this.root.value !== value) {
            return this.root; // Value not found
        }

        if (!this.root.left) {
            this.root = this.root.right;
            if (this.root) this.root.parent = null;
        } else if (!this.root.right) {
            this.root = this.root.left;
            if (this.root) this.root.parent = null;
        } else {
            const leftSubtree = this.root.left;
            const rightSubtree = this.root.right;
            leftSubtree.parent = null;
            rightSubtree.parent = null;
            
            // Find maximum in left subtree and splay it
            let maxNode = leftSubtree;
            while (maxNode.right) {
                maxNode = maxNode.right;
            }
            leftSubtree = this._splay(leftSubtree, maxNode.value);
            
            // Attach right subtree
            leftSubtree.right = rightSubtree;
            rightSubtree.parent = leftSubtree;
            this.root = leftSubtree;
        }

        this._updateHeights(this.root);
        return this.root;
    }

    search(value) {
        this.operations.push({type: 'search', value, tree: 'Splay'});
        this.root = this._splay(this.root, value);
        return this.root && this.root.value === value ? this.root : null;
    }

    _splay(node, value) {
        if (!node || node.value === value) {
            return node;
        }

        // Value is in left subtree
        if (value < node.value) {
            if (!node.left) return node;

            // Zig-Zig (Left Left)
            if (value < node.left.value) {
                node.left.left = this._splay(node.left.left, value);
                node = this._rightRotate(node);
            }
            // Zig-Zag (Left Right)
            else if (value > node.left.value) {
                node.left.right = this._splay(node.left.right, value);
                if (node.left.right) {
                    node.left = this._leftRotate(node.left);
                }
            }

            if (node.left) {
                node = this._rightRotate(node);
            }
        }
        // Value is in right subtree
        else {
            if (!node.right) return node;

            // Zig-Zag (Right Left)
            if (value < node.right.value) {
                node.right.left = this._splay(node.right.left, value);
                if (node.right.left) {
                    node.right = this._rightRotate(node.right);
                }
            }
            // Zig-Zig (Right Right)
            else if (value > node.right.value) {
                node.right.right = this._splay(node.right.right, value);
                node = this._leftRotate(node);
            }

            if (node.right) {
                node = this._leftRotate(node);
            }
        }

        return node;
    }

    _leftRotate(x) {
        this.operations.push({type: 'spin', direction: 'left', tree: 'Splay'});
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
        this.operations.push({type: 'spin', direction: 'right', tree: 'Splay'});
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
