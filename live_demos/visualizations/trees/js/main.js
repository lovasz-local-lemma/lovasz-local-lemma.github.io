// Main application controller
class TreeDemo {
    constructor() {
        this.trees = {
            bst: new BST(),
            avl: new AVL(),
            rbt: new RedBlackTree(),
            sbt: new SizeBalancedTree(),
            treap: new Treap(),
            splay: new SplayTree(),
            '234': new Tree234()
        };
        
        this.currentLayout = '2cols'; // '2cols' or '3cols'

        this.visualizers = {};
        this.animationEngine = new AnimationEngine();
        this.currentOperation = null;
        this.sequentialCounter = 0;
        this.maxRange = 100;
        
        // Heat map tracking
        this.valueFrequency = new Map();
        this.currentBatch = new Set();
        this.previousBatch = new Set();
        this.nextSequentialStart = 1;

        this.initializeVisualizers();
        this.setupEventListeners();
        this.initializeHeatmap();
        this.updateUI();
    }

    initializeVisualizers() {
        const containers = document.querySelectorAll('.tree-container');
        containers.forEach(container => {
            const treeType = container.dataset.tree;
            const svg = container.querySelector('.tree-canvas');
            this.visualizers[treeType] = new TreeVisualizer(svg, treeType);
        });
    }

    setupEventListeners() {
        // Input controls
        document.getElementById('insertBtn').addEventListener('click', () => this.handleInsert());
        document.getElementById('deleteBtn').addEventListener('click', () => this.handleDelete());
        document.getElementById('clearBtn').addEventListener('click', () => this.handleClear());
        
        // Layout switcher
        document.getElementById('layout2').addEventListener('click', () => this.setLayout(2));
        document.getElementById('layout3').addEventListener('click', () => this.setLayout(3));

        // Preset operations
        document.getElementById('randomBtn').addEventListener('click', () => this.insertRandom());
        document.getElementById('sequentialBtn').addEventListener('click', () => this.insertSequentialRepeat());
        document.getElementById('sequentialGrowBtn').addEventListener('click', () => this.insertSequentialAdvance());

        // Speed control
        const speedSlider = document.getElementById('speedSlider');
        const speedValue = document.getElementById('speedValue');
        speedSlider.addEventListener('input', (e) => {
            const speed = parseInt(e.target.value);
            speedValue.textContent = speed;
            this.animationEngine.setSpeed(speed);
        });
        
        // Max range control with confirm button
        document.getElementById('confirmRangeBtn').addEventListener('click', () => {
            const newMax = parseInt(document.getElementById('maxRange').value);
            this.updateMaxRange(newMax);
        });
        
        // Layout controls
        const layout2Btn = document.getElementById('layout2Cols');
        const layout3Btn = document.getElementById('layout3Cols');
        if (layout2Btn && layout3Btn) {
            layout2Btn.addEventListener('click', () => this.setLayout('2cols'));
            layout3Btn.addEventListener('click', () => this.setLayout('3cols'));
        }
        

        // Enter key support
        document.getElementById('valueInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleInsert();
            }
        });
    }

    async handleInsert() {
        const value = parseInt(document.getElementById('valueInput').value);
        if (isNaN(value)) {
            alert('Please enter a valid integer');
            return;
        }

        this.currentOperation = 'insert';
        this.logOperation(`Inserting ${value} into all trees`);
        
        // Track in heat map
        this.currentBatch.clear();
        this.currentBatch.add(value);
        this.updateValueFrequency(value);

        // Insert into all trees
        for (const [treeType, tree] of Object.entries(this.trees)) {
            tree.insert(value);
        }

        await this.renderAllTrees();
        
        // Trigger wobble animation for newly inserted node
        for (const visualizer of Object.values(this.visualizers)) {
            visualizer.animateInsertion(value);
        }
        
        this.updateUI();
        this.updateHeatmap();
        document.getElementById('valueInput').value = '';
    }

    async handleDelete() {
        const value = parseInt(document.getElementById('valueInput').value);
        if (isNaN(value)) {
            alert('Please enter a valid number to delete');
            return;
        }

        this.currentOperation = 'delete';
        this.logOperation(`Deleting ${value} from all trees`);

        // Delete from all trees
        for (const [treeType, tree] of Object.entries(this.trees)) {
            tree.delete(value);
        }

        await this.renderAllTrees();
        this.updateUI();
        document.getElementById('valueInput').value = '';
    }

    handleClear() {
        this.logOperation('Clearing all trees');
        
        for (const tree of Object.values(this.trees)) {
            tree.clear();
        }
        
        // Reset all tracking
        this.sequentialCounter = 0;
        this.valueFrequency.clear();
        this.currentBatch.clear();
        this.previousBatch.clear();
        this.nextSequentialStart = 1;

        this.renderAllTrees();
        this.updateUI();
        this.updateHeatmap();
        this.clearLog();
    }

    async insertRandom() {
        const values = [];
        for (let i = 0; i < 7; i++) {
            values.push(Math.floor(Math.random() * (this.maxRange - 10)) + 10);
        }

        this.logOperation(`Inserting random values: ${values.join(', ')}`);
        
        this.previousBatch = new Set(this.currentBatch);
        this.currentBatch.clear();

        for (const value of values) {
            this.currentBatch.add(value);
            this.updateValueFrequency(value);
            
            for (const tree of Object.values(this.trees)) {
                tree.insert(value);
            }
            await this.renderAllTrees();
            
            for (const visualizer of Object.values(this.visualizers)) {
                visualizer.animateInsertion(value);
            }
            
            this.updateHeatmap();
            await this.delay(this.animationEngine.speed / 2);
        }

        this.updateUI();
    }

    async insertSequentialRepeat() {
        const values = [];
        const startVal = this.nextSequentialStart;
        for (let i = 0; i < 7; i++) {
            values.push(startVal + i);
        }
        
        this.logOperation(`Inserting sequential values (repeat): ${values.join(', ')}`);
        
        this.previousBatch = new Set(this.currentBatch);
        this.currentBatch.clear();

        for (const value of values) {
            this.currentBatch.add(value);
            this.updateValueFrequency(value);
            
            for (const tree of Object.values(this.trees)) {
                tree.insert(value);
            }
            await this.renderAllTrees();
            
            for (const visualizer of Object.values(this.visualizers)) {
                visualizer.animateInsertion(value);
            }
            
            this.updateHeatmap();
            await this.delay(this.animationEngine.speed / 2);
        }

        this.updateUI();
    }

    async insertSequentialAdvance() {
        const values = [];
        const startVal = this.nextSequentialStart;
        for (let i = 0; i < 7; i++) {
            values.push(this.nextSequentialStart++);
        }
        
        this.logOperation(`Inserting sequential values (advance): ${values.join(', ')}`);
        
        this.previousBatch = new Set(this.currentBatch);
        this.currentBatch.clear();

        for (const value of values) {
            this.currentBatch.add(value);
            this.updateValueFrequency(value);
            
            for (const tree of Object.values(this.trees)) {
                tree.insert(value);
            }
            await this.renderAllTrees();
            
            for (const visualizer of Object.values(this.visualizers)) {
                visualizer.animateInsertion(value);
            }
            
            this.updateHeatmap();
            await this.delay(this.animationEngine.speed / 2);
        }

        this.updateUI();
    }


    async renderAllTrees() {
        for (const [treeType, tree] of Object.entries(this.trees)) {
            if (treeType === '234') {
                this.visualizers[treeType].render234(tree);
            } else {
                this.visualizers[treeType].render(tree);
            }
        }

        // Process any queued animations
        await this.animationEngine.processQueue();
    }

    updateUI() {
        // Update tree information displays
        for (const [treeType, tree] of Object.entries(this.trees)) {
            const container = document.querySelector(`[data-tree="${treeType}"]`);
            const heightSpan = container.querySelector('.height');
            const nodesSpan = container.querySelector('.nodes');
            
            heightSpan.textContent = `Height: ${tree.getHeight()}`;
            nodesSpan.textContent = `Nodes: ${tree.getNodeCount()}`;
        }

        // Update metrics panel
        this.updateMetrics();

        // Log recent operations
        this.logRecentOperations();
    }

    updateMetrics() {
        // Check if we have the grid-based metrics panel or separate charts
        const metricsGrid = document.getElementById('metricsGrid');
        if (metricsGrid) {
            this.updateMetricsGrid();
        } else {
            this.updateHeightChart();
            this.updateBalanceChart();
            this.updateOperationChart();
            this.updatePropertiesTable();
        }
    }

    setLayout(layout) {
        const treeGrid = document.querySelector('.tree-grid');
        console.log('setLayout called with:', layout);
        console.log('Found tree-grid element:', treeGrid);
        
        if (!treeGrid) {
            console.error('tree-grid element not found!');
            return;
        }
        
        // Update buttons
        document.querySelectorAll('.layout-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`layout${layout}`).classList.add('active');
        
        if (layout === 2) {
            treeGrid.classList.add('layout-2');
            console.log('Added layout-2 class');
        } else {
            treeGrid.classList.remove('layout-2');
            console.log('Removed layout-2 class');
        }
        console.log('Current classes:', treeGrid.className);
    }

    updateMetricsGrid() {
        const metricsGrid = document.getElementById('metricsGrid');
        if (!metricsGrid) return;
        metricsGrid.innerHTML = '';

        const stats = this.getTreeStats();
        const treeColors = {
            bst: '#2196F3', avl: '#4CAF50', rbt: '#f44336', 
            sbt: '#FF9800', treap: '#9C27B0', splay: '#00BCD4', '234': '#795548'
        };

        for (const [treeType, treeStat] of Object.entries(stats)) {
            const card = document.createElement('div');
            card.className = 'metric-card';
            
            const treeNames = {
                bst: 'BST', avl: 'AVL', rbt: 'RBT', 
                sbt: 'SBT', treap: 'Treap', splay: 'Splay', '234': '2-3-4'
            };

            card.innerHTML = `
                <h4>${treeNames[treeType]}</h4>
                <div style="margin: 10px 0;">
                    <div style="display: flex; justify-content: space-between; margin: 5px 0;">
                        <span>Height:</span>
                        <strong style="color: ${treeColors[treeType]}">${treeStat.height}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin: 5px 0;">
                        <span>Nodes:</span>
                        <strong>${treeStat.nodes}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin: 5px 0;">
                        <span>Operations:</span>
                        <strong style="color: ${treeColors[treeType]}">${treeStat.operations}</strong>
                    </div>
                </div>
            `;
            
            metricsGrid.appendChild(card);
        }
    }

    updateHeightChart() {
        const heightChart = document.getElementById('heightChart');
        if (!heightChart) return;
        heightChart.innerHTML = '';

        const heights = this.compareTreeHeights();
        const maxHeight = Math.max(...Object.values(heights), 1);

        const treeColors = {
            bst: '#2196F3', avl: '#4CAF50', rbt: '#f44336', 
            sbt: '#FF9800', treap: '#9C27B0', splay: '#00BCD4', '234': '#795548'
        };
        
        const treeNames = {
            bst: 'Naive', avl: 'AVL', rbt: 'RBT', 
            sbt: 'SBT', treap: 'Treap', splay: 'Splay', '234': '2-3-4'
        };

        for (const [treeType, height] of Object.entries(heights)) {
            const barContainer = document.createElement('div');
            barContainer.className = 'bar-container';
            
            const label = document.createElement('span');
            label.className = 'bar-label';
            label.textContent = treeNames[treeType];
            
            const barWrapper = document.createElement('div');
            barWrapper.className = 'bar-wrapper';
            
            const barFill = document.createElement('div');
            barFill.className = 'bar-fill';
            barFill.style.width = `${(height / maxHeight) * 100}%`;
            barFill.style.backgroundColor = treeColors[treeType];
            barFill.style.color = treeColors[treeType];
            
            const value = document.createElement('span');
            value.className = 'bar-value';
            value.textContent = height;
            value.style.color = treeColors[treeType];
            
            barWrapper.appendChild(barFill);
            barContainer.appendChild(label);
            barContainer.appendChild(barWrapper);
            barContainer.appendChild(value);
            heightChart.appendChild(barContainer);
        }
    }

    updateBalanceChart() {
        const balanceChart = document.getElementById('balanceChart');
        if (!balanceChart) return;
        balanceChart.innerHTML = '';

        const balanceFactors = {};
        for (const [treeType, tree] of Object.entries(this.trees)) {
            balanceFactors[treeType] = this.calculateBalanceFactor(tree);
        }

        const treeColors = {
            bst: '#2196F3', avl: '#4CAF50', rbt: '#f44336', 
            sbt: '#FF9800', treap: '#9C27B0', splay: '#00BCD4', '234': '#795548'
        };
        
        const treeNames = {
            bst: 'Naive', avl: 'AVL', rbt: 'RBT', 
            sbt: 'SBT', treap: 'Treap', splay: 'Splay', '234': '2-3-4'
        };

        for (const [treeType, balance] of Object.entries(balanceFactors)) {
            const barContainer = document.createElement('div');
            barContainer.className = 'bar-container';
            
            const label = document.createElement('span');
            label.className = 'bar-label';
            label.textContent = treeNames[treeType];
            
            const barWrapper = document.createElement('div');
            barWrapper.className = 'bar-wrapper';
            
            const barFill = document.createElement('div');
            barFill.className = 'bar-fill';
            barFill.style.width = `${balance * 100}%`;
            barFill.style.backgroundColor = treeColors[treeType];
            barFill.style.color = treeColors[treeType];
            
            const value = document.createElement('span');
            value.className = 'bar-value';
            value.textContent = `${Math.round(balance * 100)}%`;
            value.style.color = treeColors[treeType];
            
            barWrapper.appendChild(barFill);
            barContainer.appendChild(label);
            barContainer.appendChild(barWrapper);
            barContainer.appendChild(value);
            balanceChart.appendChild(barContainer);
        }
    }

    updateOperationChart() {
        const operationChart = document.getElementById('operationChart');
        if (!operationChart) return;
        operationChart.innerHTML = '';

        // Count only structural changes (spins, splits, merges, borrows)
        // Recolors are not counted as they don't change tree structure
        const operationCounts = {};
        for (const [treeType, tree] of Object.entries(this.trees)) {
            operationCounts[treeType] = tree.operations ? tree.operations.filter(op => 
                op.type === 'spin' || op.type === 'split' || op.type === 'borrow' || op.type === 'merge'
            ).length : 0;
        }
        
        // Debug logging
        console.log('Operation counts:', operationCounts);
        for (const [treeType, tree] of Object.entries(this.trees)) {
            const spins = tree.operations.filter(op => op.type === 'spin').length;
            const recolors = tree.operations.filter(op => op.type === 'recolor').length;
            console.log(`${treeType}: ${spins} spins, ${recolors} recolors (not counted), total: ${operationCounts[treeType]}`);
        }

        const maxOps = Math.max(...Object.values(operationCounts), 1);

        const treeColors = {
            bst: '#2196F3', avl: '#4CAF50', rbt: '#f44336', 
            sbt: '#FF9800', treap: '#9C27B0', splay: '#00BCD4', '234': '#795548'
        };
        
        const treeNames = {
            bst: 'Naive', avl: 'AVL', rbt: 'RBT', 
            sbt: 'SBT', treap: 'Treap', splay: 'Splay', '234': '2-3-4'
        };

        for (const [treeType, count] of Object.entries(operationCounts)) {
            const barContainer = document.createElement('div');
            barContainer.className = 'bar-container';
            
            const label = document.createElement('span');
            label.className = 'bar-label';
            label.textContent = treeNames[treeType];
            
            const barWrapper = document.createElement('div');
            barWrapper.className = 'bar-wrapper';
            
            const barFill = document.createElement('div');
            barFill.className = 'bar-fill';
            barFill.style.width = `${(count / maxOps) * 100}%`;
            barFill.style.backgroundColor = treeColors[treeType];
            barFill.style.color = treeColors[treeType];
            
            const value = document.createElement('span');
            value.className = 'bar-value';
            value.textContent = count;
            value.style.color = treeColors[treeType];
            
            barWrapper.appendChild(barFill);
            barContainer.appendChild(label);
            barContainer.appendChild(barWrapper);
            barContainer.appendChild(value);
            operationChart.appendChild(barContainer);
        }
    }

    updatePropertiesTable() {
        const propertiesTable = document.getElementById('propertiesTable');
        if (!propertiesTable) return;
        propertiesTable.innerHTML = '';

        const stats = this.getTreeStats();
        const totalNodes = stats.bst.nodes;
        
        if (totalNodes === 0) return;

        // Best height (most balanced) excluding BST and 234
        const heights = {};
        const balancedTreeHeights = [];
        for (const [treeType, treeStat] of Object.entries(stats)) {
            heights[treeType] = treeStat.height;
            if (treeType !== 'bst' && treeType !== '234') {
                balancedTreeHeights.push(treeStat.height);
            }
        }
        
        const bestHeight = Math.min(...balancedTreeHeights);
        const worstNonBSTHeight = Math.max(...balancedTreeHeights);
        const bstHeight = heights.bst;

        // Find which trees have best/worst heights
        const bestTrees = [];
        const worstTrees = [];
        for (const [treeType, height] of Object.entries(heights)) {
            if (treeType !== 'bst' && treeType !== '234') {
                if (height === bestHeight) bestTrees.push(treeType.toUpperCase());
                if (height === worstNonBSTHeight) worstTrees.push(treeType.toUpperCase());
            }
        }
        
        const optimalHeight = Math.ceil(Math.log2(totalNodes + 1));

        const properties = [
            { label: 'Total Nodes', value: totalNodes },
            { label: 'Optimal Height', value: optimalHeight },
            { label: 'Best Height (excl. 234)', value: `${bestHeight} (${bestTrees.join(', ')})` },
            { label: 'Worst Height (excl. Naive)', value: `${worstNonBSTHeight} (${worstTrees.join(', ')})` },
            { label: 'Naive BST Height', value: bstHeight }
        ];

        properties.forEach(prop => {
            const item = document.createElement('div');
            item.className = 'property-item';
            item.innerHTML = `
                <span class="property-label">${prop.label}:</span>
                <strong class="property-value">${prop.value}</strong>
            `;
            propertiesTable.appendChild(item);
        });
    }

    addPropertyRow(container, label, value, className = 'property-value') {
        const row = document.createElement('div');
        row.className = 'property-row';

        const labelDiv = document.createElement('div');
        labelDiv.className = 'property-label';
        labelDiv.textContent = label;

        const valueDiv = document.createElement('div');
        valueDiv.className = className;
        valueDiv.textContent = value;

        row.appendChild(labelDiv);
        row.appendChild(valueDiv);
        container.appendChild(row);
    }

    calculateBalanceFactor(tree) {
        if (!tree.root || tree.getNodeCount() === 0) return 1;
        
        const actualHeight = tree.getHeight();
        const optimalHeight = Math.ceil(Math.log2(tree.getNodeCount() + 1));
        
        return Math.max(0, 1 - (actualHeight - optimalHeight) / actualHeight);
    }

    logOperation(message) {
        const logContent = document.getElementById('logContent');
        if (!logContent) return;
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
        
        if (message.includes('Insert')) entry.classList.add('insert');
        else if (message.includes('Delet')) entry.classList.add('delete');
        else if (message.includes('Search')) entry.classList.add('search');
        else if (message.includes('rotation')) entry.classList.add('rotation');

        logContent.appendChild(entry);
        logContent.scrollTop = logContent.scrollHeight;
    }

    logRecentOperations() {
        // Log any recent tree operations
        for (const [treeType, tree] of Object.entries(this.trees)) {
            if (tree.operations && tree.operations.length > 0) {
                const recentOps = tree.operations.slice(-3); // Last 3 operations
                recentOps.forEach(op => {
                    if (op.type === 'rotation' || op.type === 'recolor' || op.type === 'split') {
                        this.logOperation(`${op.tree}: ${op.operation}`);
                    }
                });
                // Don't clear operations - we need them for cumulative counting
                // tree.operations = [];
            }
        }
    }

    clearLog() {
        const logContent = document.getElementById('logContent');
        if (logContent) logContent.innerHTML = '';
    }
    
    setLayout(layout) {
        this.currentLayout = layout;
        const treesGrid = document.getElementById('treesGrid');
        const layout2Btn = document.getElementById('layout2Cols');
        const layout3Btn = document.getElementById('layout3Cols');
        
        if (treesGrid) {
            if (layout === '3cols') {
                treesGrid.classList.add('layout-3');
                if (layout3Btn) layout3Btn.classList.add('active');
                if (layout2Btn) layout2Btn.classList.remove('active');
            } else {
                treesGrid.classList.remove('layout-3');
                if (layout2Btn) layout2Btn.classList.add('active');
                if (layout3Btn) layout3Btn.classList.remove('active');
            }
        }
    }
    

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Comparison utilities
    compareTreeHeights() {
        const heights = {};
        for (const [treeType, tree] of Object.entries(this.trees)) {
            heights[treeType] = tree.getHeight();
        }
        return heights;
    }

    compareTreeSizes() {
        const sizes = {};
        for (const [treeType, tree] of Object.entries(this.trees)) {
            sizes[treeType] = tree.getNodeCount();
        }
        return sizes;
    }

    getTreeStats() {
        const stats = {};
        for (const [treeType, tree] of Object.entries(this.trees)) {
            stats[treeType] = {
                height: tree.getHeight(),
                nodes: tree.getNodeCount(),
                balanced: this.isBalanced(tree)
            };
        }
        return stats;
    }

    isBalanced(tree) {
        if (!tree.root) return true;
        return this._checkBalance(tree.root);
    }

    _checkBalance(node) {
        if (!node) return true;
        
        const leftHeight = this._getHeight(node.left);
        const rightHeight = this._getHeight(node.right);
        
        return Math.abs(leftHeight - rightHeight) <= 1 && 
               this._checkBalance(node.left) && 
               this._checkBalance(node.right);
    }

    _getHeight(node) {
        if (!node) return 0;
        return 1 + Math.max(this._getHeight(node.left), this._getHeight(node.right));
    }
    
    // Heat map functions
    initializeHeatmap() {
        this.updateHeatmap();
    }
    
    updateHeatmap() {
        const grid = document.getElementById('heatmapGrid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        const cellsPerRow = 20;
        const totalCells = this.maxRange;
        const cellsToShow = Math.ceil(totalCells / cellsPerRow) * cellsPerRow;
        
        for (let i = 1; i <= cellsToShow; i++) {
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            cell.dataset.value = i;
            
            if (i > this.maxRange) {
                cell.classList.add('empty');
                cell.style.opacity = '0.3';
            } else {
                const freq = this.valueFrequency.get(i) || 0;
                const isCurrentBatch = this.currentBatch.has(i);
                const isPreviousBatch = this.previousBatch.has(i);
                const isNextSeq = i >= this.nextSequentialStart && i < this.nextSequentialStart + 7;
                
                if (freq === 0) {
                    cell.classList.add('empty');
                } else {
                    const intensity = Math.min(freq / 5, 1);
                    const baseColor = `rgba(212, 175, 55, ${0.3 + intensity * 0.5})`;
                    cell.style.background = baseColor;
                    if (freq > 1) {
                        cell.textContent = freq;
                    }
                }
                
                if (isCurrentBatch) {
                    cell.classList.add('current-batch');
                    cell.style.background = '#4CAF50';
                } else if (isPreviousBatch) {
                    cell.classList.add('previous-batch');
                    cell.style.background = '#2196F3';
                }
                
                if (isNextSeq && freq === 0) {
                    cell.classList.add('next-indicator');
                    cell.style.background = 'rgba(156, 39, 176, 0.4)';
                    cell.style.borderColor = '#9C27B0';
                }
            }
            
            cell.addEventListener('click', () => {
                if (i <= this.maxRange) {
                    this.handleHeatmapClick(i);
                }
            });
            
            grid.appendChild(cell);
        }
    }
    
    handleHeatmapClick(value) {
        this.nextSequentialStart = value;
        this.updateHeatmap();
        this.logOperation(`Next sequential batch will start from ${value}`);
    }
    
    updateValueFrequency(value) {
        const current = this.valueFrequency.get(value) || 0;
        this.valueFrequency.set(value, current + 1);
    }
    
    updateMaxRange(newMax) {
        this.maxRange = newMax;
        document.getElementById('maxRangeDisplay').textContent = newMax;
        document.getElementById('valueInput').setAttribute('max', newMax);
        
        // Clear heat map when range changes
        this.valueFrequency.clear();
        this.currentBatch.clear();
        this.previousBatch.clear();
        this.nextSequentialStart = 1;
        
        this.updateHeatmap();
        this.logOperation(`Max range updated to ${newMax}. Heat map cleared.`);
    }
}

// Initialize the demo when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.treeDemo = new TreeDemo();
    console.log('Tree Algorithms Demo initialized!');
    
    // Add welcome message
    window.treeDemo.logOperation('Welcome! Try inserting values to see how different trees behave.');
    window.treeDemo.logOperation('Use preset buttons to see interesting patterns.');
});
