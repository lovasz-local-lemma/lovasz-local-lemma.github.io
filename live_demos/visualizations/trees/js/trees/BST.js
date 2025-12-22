// Binary Search Tree implementation
class BST {
    constructor() {
        this.root = null;
        this.operations = [];
    }

    insert(value) {
        this.operations.push({type: 'insert', value, tree: 'BST'});
        this.root = this._insertNode(this.root, value);
        this._updateHeights(this.root);
        return this.root;
    }

    _insertNode(node, value) {
        if (!node) {
            return new TreeNode(value);
        }

        if (value < node.value) {
            node.left = this._insertNode(node.left, value);
            if (node.left) node.left.parent = node;
        } else if (value > node.value) {
            node.right = this._insertNode(node.right, value);
            if (node.right) node.right.parent = node;
        }

        return node;
    }

    delete(value) {
        this.operations.push({type: 'delete', value, tree: 'BST'});
        this.root = this._deleteNode(this.root, value);
        this._updateHeights(this.root);
        return this.root;
    }

    _deleteNode(node, value) {
        if (!node) return null;

        if (value < node.value) {
            node.left = this._deleteNode(node.left, value);
            if (node.left) node.left.parent = node;
        } else if (value > node.value) {
            node.right = this._deleteNode(node.right, value);
            if (node.right) node.right.parent = node;
        } else {
            // Node to delete found
            if (!node.left) return node.right;
            if (!node.right) return node.left;

            // Node has two children
            let successor = this._findMin(node.right);
            node.value = successor.value;
            node.right = this._deleteNode(node.right, successor.value);
            if (node.right) node.right.parent = node;
        }

        return node;
    }

    _findMin(node) {
        while (node.left) {
            node = node.left;
        }
        return node;
    }

    search(value) {
        this.operations.push({type: 'search', value, tree: 'BST'});
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

    inorderTraversal() {
        const result = [];
        this._inorder(this.root, result);
        return result;
    }

    _inorder(node, result) {
        if (node) {
            this._inorder(node.left, result);
            result.push(node.value);
            this._inorder(node.right, result);
        }
    }
}
