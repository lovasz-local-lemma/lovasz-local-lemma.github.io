// Base TreeNode class for all tree implementations
class TreeNode {
    constructor(value) {
        this.value = value;
        this.left = null;
        this.right = null;
        this.parent = null;
        this.height = 1;
        this.size = 1;
        this.x = 0;
        this.y = 0;
    }

    isLeaf() {
        return !this.left && !this.right;
    }

    hasOnlyLeftChild() {
        return this.left && !this.right;
    }

    hasOnlyRightChild() {
        return !this.left && this.right;
    }

    hasBothChildren() {
        return this.left && this.right;
    }
}

// Red-Black Tree Node
class RBNode extends TreeNode {
    constructor(value) {
        super(value);
        this.color = 'RED'; // RED or BLACK
    }
}

// Treap Node
class TreapNode extends TreeNode {
    constructor(value) {
        super(value);
        this.priority = Math.random();
    }
}

// 2-3-4 Tree Node
class Node234 {
    constructor() {
        this.keys = [];
        this.children = [];
        this.parent = null;
        this.x = 0;
        this.y = 0;
    }

    isLeaf() {
        return this.children.length === 0;
    }

    isFull() {
        return this.keys.length === 3;
    }

    hasKey(key) {
        return this.keys.includes(key);
    }

    insertKey(key) {
        this.keys.push(key);
        this.keys.sort((a, b) => a - b);
    }

    removeKey(key) {
        const index = this.keys.indexOf(key);
        if (index !== -1) {
            this.keys.splice(index, 1);
        }
    }
}
