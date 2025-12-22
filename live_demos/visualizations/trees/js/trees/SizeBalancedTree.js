// Size Balanced Tree implementation
class SizeBalancedTree {
    constructor() {
        this.root = null;
        this.operations = [];
    }

    insert(value) {
        this.operations.push({type: 'insert', value, tree: 'SBT'});
        this.root = this._insertSBT(this.root, value);
        this._updateHeights(this.root);
        return this.root;
    }

    _insertSBT(node, value) {
        if (!node) {
            const newNode = new TreeNode(value);
            newNode.size = 1;
            return newNode;
        }

        if (value < node.value) {
            node.left = this._insertSBT(node.left, value);
            if (node.left) node.left.parent = node;
        } else if (value > node.value) {
            node.right = this._insertSBT(node.right, value);
            if (node.right) node.right.parent = node;
        } else {
            return node; // Duplicate not allowed
        }

        this._updateSize(node);
        return this._maintain(node);
    }

    delete(value) {
        this.operations.push({type: 'delete', value, tree: 'SBT'});
        this.root = this._deleteSBT(this.root, value);
        this._updateHeights(this.root);
        return this.root;
    }

    _deleteSBT(node, value) {
        if (!node) return null;

        if (value < node.value) {
            node.left = this._deleteSBT(node.left, value);
            if (node.left) node.left.parent = node;
        } else if (value > node.value) {
            node.right = this._deleteSBT(node.right, value);
            if (node.right) node.right.parent = node;
        } else {
            if (!node.left) return node.right;
            if (!node.right) return node.left;

            const successor = this._findMin(node.right);
            node.value = successor.value;
            node.right = this._deleteSBT(node.right, successor.value);
            if (node.right) node.right.parent = node;
        }

        this._updateSize(node);
        return this._maintain(node);
    }

    _maintain(node, logOperation = true) {
        if (!node) return node;

        const leftSize = this._getSize(node.left);
        const rightSize = this._getSize(node.right);
        const leftLeftSize = node.left ? this._getSize(node.left.left) : 0;
        const leftRightSize = node.left ? this._getSize(node.left.right) : 0;
        const rightLeftSize = node.right ? this._getSize(node.right.left) : 0;
        const rightRightSize = node.right ? this._getSize(node.right.right) : 0;

        if (leftLeftSize > rightSize) {
            node = this._rightRotate(node);
            node.right = this._maintain(node.right, false);
            node = this._maintain(node, false);
        } else if (leftRightSize > rightSize) {
            node.left = this._leftRotate(node.left);
            node = this._rightRotate(node);
            node.left = this._maintain(node.left, false);
            node.right = this._maintain(node.right, false);
            node = this._maintain(node, false);
        } else if (rightRightSize > leftSize) {
            node = this._leftRotate(node);
            node.left = this._maintain(node.left, false);
            node = this._maintain(node, false);
        } else if (rightLeftSize > leftSize) {
            node.right = this._rightRotate(node.right);
            node = this._leftRotate(node);
            node.left = this._maintain(node.left, false);
            node.right = this._maintain(node.right, false);
            node = this._maintain(node, false);
        }

        return node;
    }

    _leftRotate(x) {
        this.operations.push({type: 'spin', direction: 'left', tree: 'SBT'});
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
        
        this._updateSize(x);
        this._updateSize(y);
        return y;
    }

    _rightRotate(y) {
        this.operations.push({type: 'spin', direction: 'right', tree: 'SBT'});
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
        
        this._updateSize(y);
        this._updateSize(x);
        return x;
    }

    _updateSize(node) {
        if (node) {
            node.size = 1 + this._getSize(node.left) + this._getSize(node.right);
        }
    }

    _getSize(node) {
        return node ? node.size : 0;
    }

    _findMin(node) {
        while (node.left) {
            node = node.left;
        }
        return node;
    }

    search(value) {
        this.operations.push({type: 'search', value, tree: 'SBT'});
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
        return this._getSize(this.root);
    }

    clear() {
        this.root = null;
        this.operations = [];
    }
}
