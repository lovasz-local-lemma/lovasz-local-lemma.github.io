// Tree Visualization Engine
class TreeVisualizer {
    constructor(svgElement, treeType) {
        this.svg = svgElement;
        this.treeType = treeType;
        this.nodeRadius = 20;
        this.levelHeight = 60;
        this.nodeSpacing = 45;
        this.animationDuration = 500;
        this.baseWidth = parseInt(this.svg.getAttribute('width'));
        this.baseHeight = parseInt(this.svg.getAttribute('height'));
    }

    render(tree) {
        this.svg.innerHTML = '';
        if (!tree.root) return;

        // Calculate positions for all nodes
        this._calculatePositions(tree.root);
        
        // Apply dynamic zoom to fit the tree
        this._applyDynamicZoom(tree.root);
        
        // Render edges first (so they appear behind nodes)
        this._renderEdges(tree.root);
        
        // Render nodes
        this._renderNodes(tree.root);
    }

    _calculatePositions(root) {
        if (!root) return;

        // Calculate tree width to center it
        const treeWidth = this._calculateTreeWidth(root);
        const svgWidth = parseInt(this.svg.getAttribute('width'));
        const startX = (svgWidth - treeWidth) / 2 + this.nodeRadius;

        this._assignPositions(root, startX, 30, treeWidth);
    }

    _calculateTreeWidth(node) {
        if (!node) return 0;
        
        if (node.isLeaf()) {
            return this.nodeRadius * 2;
        }
        
        const leftWidth = this._calculateTreeWidth(node.left);
        const rightWidth = this._calculateTreeWidth(node.right);
        
        return Math.max(this.nodeRadius * 2, leftWidth + rightWidth + this.nodeSpacing);
    }

    _assignPositions(node, x, y, width) {
        if (!node) return;

        node.x = x + width / 2;
        node.y = y;

        if (node.left || node.right) {
            const leftWidth = this._calculateTreeWidth(node.left);
            const rightWidth = this._calculateTreeWidth(node.right);
            
            if (node.left) {
                this._assignPositions(node.left, x, y + this.levelHeight, leftWidth);
            }
            
            if (node.right) {
                this._assignPositions(node.right, x + leftWidth + this.nodeSpacing, y + this.levelHeight, rightWidth);
            }
        }
    }

    _applyDynamicZoom(root) {
        // Find bounds of the tree
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        
        const findBounds = (node) => {
            if (!node) return;
            minX = Math.min(minX, node.x - this.nodeRadius);
            maxX = Math.max(maxX, node.x + this.nodeRadius);
            minY = Math.min(minY, node.y - this.nodeRadius);
            maxY = Math.max(maxY, node.y + this.nodeRadius);
            if (node.left) findBounds(node.left);
            if (node.right) findBounds(node.right);
        };
        
        findBounds(root);
        
        const treeWidth = maxX - minX;
        const treeHeight = maxY - minY;
        const padding = 40;
        
        // Calculate scale to fit
        const scaleX = (this.baseWidth - padding * 2) / treeWidth;
        const scaleY = (this.baseHeight - padding * 2) / treeHeight;
        const scale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 1x
        
        // Apply scaling and centering
        const offsetX = (this.baseWidth - treeWidth * scale) / 2 - minX * scale;
        const offsetY = padding;
        
        const applyTransform = (node) => {
            if (!node) return;
            node.x = node.x * scale + offsetX;
            node.y = node.y * scale + offsetY;
            if (node.left) applyTransform(node.left);
            if (node.right) applyTransform(node.right);
        };
        
        applyTransform(root);
    }

    _renderEdges(node) {
        if (!node) return;

        if (node.left) {
            this._createEdge(node.x, node.y, node.left.x, node.left.y);
            this._renderEdges(node.left);
        }

        if (node.right) {
            this._createEdge(node.x, node.y, node.right.x, node.right.y);
            this._renderEdges(node.right);
        }
    }

    _createEdge(x1, y1, x2, y2) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', '#6B7280');
        line.setAttribute('stroke-width', '2.5');
        line.setAttribute('opacity', '0.8');
        line.style.filter = 'drop-shadow(0 0 4px rgba(107, 114, 128, 0.6))';
        this.svg.appendChild(line);
    }

    _renderNodes(node) {
        if (!node) return;

        this._createNode(node);
        
        if (node.left) this._renderNodes(node.left);
        if (node.right) this._renderNodes(node.right);
    }

    _createNode(node) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', 'tree-node');
        group.setAttribute('data-value', node.value);

        // Node circle
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', node.x);
        circle.setAttribute('cy', node.y);
        circle.setAttribute('r', this.nodeRadius);
        
        // Set color based on tree type and node properties
        let fillColor = '#10b981';
        let strokeColor = '#065f46';
        let glowColor = 'rgba(16, 185, 129, 0.5)';
        
        if (this.treeType === 'rbt' && node.color) {
            fillColor = node.color === 'RED' ? '#ef4444' : '#1e293b';
            strokeColor = node.color === 'RED' ? '#b91c1c' : '#0f172a';
            glowColor = node.color === 'RED' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(30, 41, 59, 0.5)';
        } else if (this.treeType === 'treap') {
            const intensity = Math.floor(node.priority * 255);
            fillColor = `rgb(${intensity}, ${255 - intensity}, 100)`;
            glowColor = `rgba(${intensity}, ${255 - intensity}, 100, 0.5)`;
        }
        
        circle.setAttribute('fill', fillColor);
        circle.setAttribute('stroke', strokeColor);
        circle.setAttribute('stroke-width', '3');
        circle.style.filter = `drop-shadow(0 4px 6px rgba(0,0,0,0.4)) drop-shadow(0 0 8px ${glowColor})`;

        // Node value text
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', node.x);
        text.setAttribute('y', node.y + 5);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', this.treeType === 'rbt' && node.color === 'BLACK' ? 'white' : 'black');
        text.setAttribute('font-family', 'Arial, sans-serif');
        text.setAttribute('font-size', '14');
        text.setAttribute('font-weight', 'bold');
        text.textContent = node.value;

        // Add priority text for treaps
        if (this.treeType === 'treap' && node.priority !== undefined) {
            const priorityText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            priorityText.setAttribute('x', node.x);
            priorityText.setAttribute('y', node.y - 25);
            priorityText.setAttribute('text-anchor', 'middle');
            priorityText.setAttribute('fill', '#666');
            priorityText.setAttribute('font-family', 'Arial, sans-serif');
            priorityText.setAttribute('font-size', '10');
            priorityText.textContent = `p:${node.priority.toFixed(2)}`;
            group.appendChild(priorityText);
        }

        group.appendChild(circle);
        group.appendChild(text);
        this.svg.appendChild(group);
    }

    // Special rendering for 2-3-4 trees
    render234(tree) {
        this.svg.innerHTML = '';
        if (!tree.root || tree.root.keys.length === 0) return;

        this._calculatePositions234(tree.root);
        this._applyDynamicZoom234(tree.root);
        this._renderEdges234(tree.root);
        this._renderNodes234(tree.root);
    }

    _calculatePositions234(root) {
        const svgWidth = parseInt(this.svg.getAttribute('width'));
        const treeWidth = this._calculateTreeWidth234(root);
        const startX = (svgWidth - treeWidth) / 2;
        this._assignPositions234(root, startX, 30, treeWidth);
    }

    _calculateTreeWidth234(node) {
        if (!node || node.isLeaf()) {
            return Math.max(60, node ? node.keys.length * 25 + 20 : 0);
        }
        
        let totalWidth = 0;
        for (const child of node.children) {
            totalWidth += this._calculateTreeWidth234(child) + 20;
        }
        
        return Math.max(totalWidth - 20, node.keys.length * 25 + 20);
    }

    _assignPositions234(node, x, y, width) {
        if (!node) return;

        node.x = x + width / 2;
        node.y = y;

        if (!node.isLeaf()) {
            let currentX = x;
            for (let i = 0; i < node.children.length; i++) {
                const childWidth = this._calculateTreeWidth234(node.children[i]);
                this._assignPositions234(node.children[i], currentX, y + this.levelHeight, childWidth);
                currentX += childWidth + 20;
            }
        }
    }

    _applyDynamicZoom234(root) {
        // Find bounds of the tree
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        
        const findBounds = (node) => {
            if (!node) return;
            const nodeWidth = node.keys.length * 25 + 10;
            minX = Math.min(minX, node.x - nodeWidth / 2);
            maxX = Math.max(maxX, node.x + nodeWidth / 2);
            minY = Math.min(minY, node.y - 15);
            maxY = Math.max(maxY, node.y + 15);
            if (!node.isLeaf()) {
                for (const child of node.children) {
                    findBounds(child);
                }
            }
        };
        
        findBounds(root);
        
        const treeWidth = maxX - minX;
        const treeHeight = maxY - minY;
        const padding = 40;
        
        // Calculate scale to fit
        const scaleX = (this.baseWidth - padding * 2) / treeWidth;
        const scaleY = (this.baseHeight - padding * 2) / treeHeight;
        const scale = Math.min(scaleX, scaleY, 1);
        
        // Apply scaling and centering
        const offsetX = (this.baseWidth - treeWidth * scale) / 2 - minX * scale;
        const offsetY = padding;
        
        const applyTransform = (node) => {
            if (!node) return;
            node.x = node.x * scale + offsetX;
            node.y = node.y * scale + offsetY;
            if (!node.isLeaf()) {
                for (const child of node.children) {
                    applyTransform(child);
                }
            }
        };
        
        applyTransform(root);
    }

    _renderEdges234(node) {
        if (!node || node.isLeaf()) return;

        for (const child of node.children) {
            if (child) {
                this._createEdge(node.x, node.y + 15, child.x, child.y - 15);
                this._renderEdges234(child);
            }
        }
    }

    _renderNodes234(node) {
        if (!node) return;

        this._createNode234(node);
        
        if (!node.isLeaf()) {
            for (const child of node.children) {
                this._renderNodes234(child);
            }
        }
    }

    _createNode234(node) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', 'tree-node');

        const nodeWidth = node.keys.length * 25 + 10;
        const nodeHeight = 30;

        // Node rectangle
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', node.x - nodeWidth / 2);
        rect.setAttribute('y', node.y - nodeHeight / 2);
        rect.setAttribute('width', nodeWidth);
        rect.setAttribute('height', nodeHeight);
        rect.setAttribute('fill', '#10b981');
        rect.setAttribute('stroke', '#065f46');
        rect.setAttribute('stroke-width', '3');
        rect.setAttribute('rx', '8');
        rect.style.filter = 'drop-shadow(0 4px 6px rgba(0,0,0,0.4)) drop-shadow(0 0 8px rgba(16, 185, 129, 0.5))';

        group.appendChild(rect);

        // Render ALL keys (whether leaf or internal node)
        for (let i = 0; i < node.keys.length; i++) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            const textX = node.x - nodeWidth / 2 + 15 + i * 25;
            text.setAttribute('x', textX);
            text.setAttribute('y', node.y + 5);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', 'black');
            text.setAttribute('font-family', 'Arial, sans-serif');
            text.setAttribute('font-size', '12');
            text.setAttribute('font-weight', 'bold');
            text.textContent = node.keys[i];
            group.appendChild(text);

            // Add separators between keys
            if (i < node.keys.length - 1) {
                const separator = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                separator.setAttribute('x1', textX + 12);
                separator.setAttribute('y1', node.y - 10);
                separator.setAttribute('x2', textX + 12);
                separator.setAttribute('y2', node.y + 10);
                separator.setAttribute('stroke', '#065f46');
                separator.setAttribute('stroke-width', '1.5');
                group.appendChild(separator);
            }
        }

        this.svg.appendChild(group);
    }

    highlightNode(value, className = 'highlighted') {
        const nodes = this.svg.querySelectorAll('.tree-node');
        nodes.forEach(node => {
            const text = node.querySelector('text');
            if (text && text.textContent == value) {
                node.classList.add(className);
                setTimeout(() => node.classList.remove(className), 1000);
            }
        });
    }

    animateInsertion(value) {
        setTimeout(() => {
            const nodes = this.svg.querySelectorAll('.tree-node');
            nodes.forEach(node => {
                if (node.getAttribute('data-value') == value) {
                    node.classList.add('wobble', 'new-node');
                    setTimeout(() => {
                        node.classList.remove('wobble');
                        setTimeout(() => node.classList.remove('new-node'), 800);
                    }, 600);
                }
            });
        }, 50);
    }

    animateDeletion(value) {
        this.highlightNode(value, 'deleting');
    }
}
