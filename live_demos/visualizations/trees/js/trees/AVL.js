// AVL Tree implementation
class AVL extends BST {
    constructor() {
        super();
    }

    insert(value) {
        this.operations.push({type: 'insert', value, tree: 'AVL'});
        this.root = this._insertAVL(this.root, value);
        return this.root;
    }

    _insertAVL(node, value) {
        // Standard BST insertion
        if (!node) {
            return new TreeNode(value);
        }

        if (value < node.value) {
            node.left = this._insertAVL(node.left, value);
            if (node.left) node.left.parent = node;
        } else if (value > node.value) {
            node.right = this._insertAVL(node.right, value);
            if (node.right) node.right.parent = node;
        } else {
            return node; // Duplicate values not allowed
        }

        // Update height
        node.height = 1 + Math.max(this._getHeight(node.left), this._getHeight(node.right));

        // Get balance factor
        const balance = this._getBalance(node);

        // Left Left Case
        if (balance > 1 && value < node.left.value) {
            return this._rightRotate(node);
        }

        // Right Right Case
        if (balance < -1 && value > node.right.value) {
            return this._leftRotate(node);
        }

        // Left Right Case
        if (balance > 1 && value > node.left.value) {
            node.left = this._leftRotate(node.left);
            return this._rightRotate(node);
        }

        // Right Left Case
        if (balance < -1 && value < node.right.value) {
            node.right = this._rightRotate(node.right);
            return this._leftRotate(node);
        }

        return node;
    }

    delete(value) {
        this.operations.push({type: 'delete', value, tree: 'AVL'});
        this.root = this._deleteAVL(this.root, value);
        return this.root;
    }

    _deleteAVL(node, value) {
        if (!node) return node;

        if (value < node.value) {
            node.left = this._deleteAVL(node.left, value);
        } else if (value > node.value) {
            node.right = this._deleteAVL(node.right, value);
        } else {
            if (!node.left || !node.right) {
                let temp = node.left ? node.left : node.right;
                if (!temp) {
                    temp = node;
                    node = null;
                } else {
                    node = temp;
                }
            } else {
                let temp = this._findMin(node.right);
                node.value = temp.value;
                node.right = this._deleteAVL(node.right, temp.value);
            }
        }

        if (!node) return node;

        // Update height
        node.height = 1 + Math.max(this._getHeight(node.left), this._getHeight(node.right));

        // Get balance factor
        const balance = this._getBalance(node);

        // Left Left Case
        if (balance > 1 && this._getBalance(node.left) >= 0) {
            return this._rightRotate(node);
        }

        // Left Right Case
        if (balance > 1 && this._getBalance(node.left) < 0) {
            node.left = this._leftRotate(node.left);
            return this._rightRotate(node);
        }

        // Right Right Case
        if (balance < -1 && this._getBalance(node.right) <= 0) {
            return this._leftRotate(node);
        }

        // Right Left Case
        if (balance < -1 && this._getBalance(node.right) > 0) {
            node.right = this._rightRotate(node.right);
            return this._leftRotate(node);
        }

        return node;
    }

    _getHeight(node) {
        return node ? node.height : 0;
    }

    _getBalance(node) {
        return node ? this._getHeight(node.left) - this._getHeight(node.right) : 0;
    }

    _rightRotate(node) {
        this.operations.push({type: 'spin', direction: 'right', tree: 'AVL'});
        const x = node.left;
        const T2 = x.right;

        // Perform rotation
        x.right = node;
        node.left = T2;

        // Update parents
        x.parent = node.parent;
        node.parent = x;
        if (T2) T2.parent = node;

        // Update heights
        node.height = Math.max(this._getHeight(node.left), this._getHeight(node.right)) + 1;
        x.height = Math.max(this._getHeight(x.left), this._getHeight(x.right)) + 1;

        return x;
    }

    _leftRotate(node) {
        this.operations.push({type: 'spin', direction: 'left', tree: 'AVL'});
        const y = node.right;
        const T2 = y.left;

        // Perform rotation
        y.left = node;
        node.right = T2;

        // Update parents
        y.parent = node.parent;
        node.parent = y;
        if (T2) T2.parent = node;

        // Update heights
        node.height = Math.max(this._getHeight(node.left), this._getHeight(node.right)) + 1;
        y.height = Math.max(this._getHeight(y.left), this._getHeight(y.right)) + 1;

        return y;
    }
}
