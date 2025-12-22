// Red-Black Tree implementation
class RedBlackTree {
    constructor() {
        this.root = null;
        this.operations = [];
    }

    insert(value) {
        this.operations.push({type: 'insert', value, tree: 'Red-Black'});
        const newNode = new RBNode(value);
        this.root = this._insertRB(this.root, newNode);
        this._fixInsert(newNode);
        return this.root;
    }

    _insertRB(root, node) {
        if (!root) {
            return node;
        }

        if (node.value < root.value) {
            root.left = this._insertRB(root.left, node);
            root.left.parent = root;
        } else if (node.value > root.value) {
            root.right = this._insertRB(root.right, node);
            root.right.parent = root;
        }

        return root;
    }

    _fixInsert(node) {
        while (node.parent && node.parent.color === 'RED') {
            if (node.parent === node.parent.parent.left) {
                const uncle = node.parent.parent.right;
                
                if (uncle && uncle.color === 'RED') {
                    // Case 1: Uncle is red
                    node.parent.color = 'BLACK';
                    uncle.color = 'BLACK';
                    node.parent.parent.color = 'RED';
                    node = node.parent.parent;
                    this.operations.push({type: 'recolor', operation: 'Recolor parent and uncle', tree: 'Red-Black'});
                } else {
                    if (node.color === 'RED' && node === node.parent.right) {
                        // Case 2: Node is right child - part of double rotation
                        node = node.parent;
                        this._leftRotate(node);
                    }
                    // Case 3: Node is left child (or after case 2)
                    node.parent.color = 'BLACK';
                    node.parent.parent.color = 'RED';
                    this._rightRotate(node.parent.parent);
                }
            } else {
                const uncle = node.parent.parent.left;
                
                if (uncle && uncle.color === 'RED') {
                    node.parent.color = 'BLACK';
                    uncle.color = 'BLACK';
                    node.parent.parent.color = 'RED';
                    node = node.parent.parent;
                    this.operations.push({type: 'recolor', operation: 'Recolor parent and uncle', tree: 'Red-Black'});
                } else {
                    if (node.color === 'RED' && node === node.parent.left) {
                        node = node.parent;
                        this._rightRotate(node);
                    }
                    node.parent.color = 'BLACK';
                    node.parent.parent.color = 'RED';
                    this._leftRotate(node.parent.parent);
                }
            }
        }
        this.root.color = 'BLACK';
    }

    delete(value) {
        this.operations.push({type: 'delete', value, tree: 'Red-Black'});
        const nodeToDelete = this.search(value);
        if (nodeToDelete) {
            this._deleteRB(nodeToDelete);
        }
        return this.root;
    }

    _deleteRB(node) {
        let replacement;
        let originalColor = node.color;

        if (!node.left) {
            replacement = node.right;
            this._transplant(node, node.right);
        } else if (!node.right) {
            replacement = node.left;
            this._transplant(node, node.left);
        } else {
            const successor = this._findMin(node.right);
            originalColor = successor.color;
            replacement = successor.right;

            if (successor.parent === node) {
                if (replacement) replacement.parent = successor;
            } else {
                this._transplant(successor, successor.right);
                successor.right = node.right;
                successor.right.parent = successor;
            }

            this._transplant(node, successor);
            successor.left = node.left;
            successor.left.parent = successor;
            successor.color = node.color;
        }

        if (originalColor === 'BLACK' && replacement) {
            this._fixDelete(replacement);
        }
    }

    _transplant(u, v) {
        if (!u.parent) {
            this.root = v;
        } else if (u === u.parent.left) {
            u.parent.left = v;
        } else {
            u.parent.right = v;
        }
        if (v) {
            v.parent = u.parent;
        }
    }

    _fixDelete(node) {
        while (node !== this.root && node.color === 'BLACK') {
            if (node === node.parent.left) {
                let sibling = node.parent.right;
                
                if (sibling.color === 'RED') {
                    sibling.color = 'BLACK';
                    node.parent.color = 'RED';
                    this._leftRotate(node.parent);
                    sibling = node.parent.right;
                }

                if ((!sibling.left || sibling.left.color === 'BLACK') &&
                    (!sibling.right || sibling.right.color === 'BLACK')) {
                    sibling.color = 'RED';
                    node = node.parent;
                } else {
                    if (!sibling.right || sibling.right.color === 'BLACK') {
                        if (sibling.left) sibling.left.color = 'BLACK';
                        sibling.color = 'RED';
                        this._rightRotate(sibling);
                        sibling = node.parent.right;
                    }

                    sibling.color = node.parent.color;
                    node.parent.color = 'BLACK';
                    if (sibling.right) sibling.right.color = 'BLACK';
                    this._leftRotate(node.parent);
                    node = this.root;
                }
            } else {
                let sibling = node.parent.left;
                
                if (sibling.color === 'RED') {
                    sibling.color = 'BLACK';
                    node.parent.color = 'RED';
                    this._rightRotate(node.parent);
                    sibling = node.parent.left;
                }

                if ((!sibling.right || sibling.right.color === 'BLACK') &&
                    (!sibling.left || sibling.left.color === 'BLACK')) {
                    sibling.color = 'RED';
                    node = node.parent;
                } else {
                    if (!sibling.left || sibling.left.color === 'BLACK') {
                        if (sibling.right) sibling.right.color = 'BLACK';
                        sibling.color = 'RED';
                        this._leftRotate(sibling);
                        sibling = node.parent.left;
                    }

                    sibling.color = node.parent.color;
                    node.parent.color = 'BLACK';
                    if (sibling.left) sibling.left.color = 'BLACK';
                    this._rightRotate(node.parent);
                    node = this.root;
                }
            }
        }
        node.color = 'BLACK';
    }

    _leftRotate(node) {
        this.operations.push({type: 'spin', direction: 'left', tree: 'Red-Black'});
        const newRoot = node.right;
        node.right = newRoot.left;
        if (newRoot.left) {
            newRoot.left.parent = node;
        }
        newRoot.parent = node.parent;
        if (!node.parent) {
            this.root = newRoot;
        } else if (node === node.parent.left) {
            node.parent.left = newRoot;
        } else {
            node.parent.right = newRoot;
        }
        newRoot.left = node;
        node.parent = newRoot;
    }

    _rightRotate(node) {
        this.operations.push({type: 'spin', direction: 'right', tree: 'Red-Black'});
        const newRoot = node.left;
        node.left = newRoot.right;
        if (newRoot.right) {
            newRoot.right.parent = node;
        }
        newRoot.parent = node.parent;
        if (!node.parent) {
            this.root = newRoot;
        } else if (node === node.parent.right) {
            node.parent.right = newRoot;
        } else {
            node.parent.left = newRoot;
        }
        newRoot.right = node;
        node.parent = newRoot;
    }

    search(value) {
        this.operations.push({type: 'search', value, tree: 'Red-Black'});
        return this._searchNode(this.root, value);
    }

    getHeight() {
        return this._calculateHeight(this.root);
    }

    _calculateHeight(node) {
        if (!node) return 0;
        return 1 + Math.max(this._calculateHeight(node.left), this._calculateHeight(node.right));
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
