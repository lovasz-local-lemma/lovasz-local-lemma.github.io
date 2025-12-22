// Main Graph Visualizer with Animation Integration

class GraphVisualizer {
    constructor() {
        // Canvas setup
        this.canvas = document.getElementById('graphCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Animation integration (pass graph canvas context for particles)
        this.rive = new AnimationIntegration('riveCanvas', this.ctx);
        
        // Visual styles
        this.styleManager = new VisualStyleManager();
        this.currentStyle = this.styleManager.getCurrentStyle();
        this.currentStyleName = 'modern'; // Track current style name
        
        // Physics system
        this.physics = new SpringPhysics(this.currentStyle.getPhysicsConfig());
        this.physicsEnabled = false;
        this.classicLayout = true; // Static ring layout (DEFAULT)
        
        // Drag state
        this.draggedNode = null;
        this.mousePos = null;
        this.isDragging = false;
        this.recentlyReleasedNode = null;
        this.releaseTime = 0;
        
        // Graph state
        this.graph = {
            nodes: [],
            edges: [],
            directed: false
        };
        
        // Visualization state
        this.nodePositions = [];
        this.nodeRadius = 25;
        this.selectedAlgorithm = 'dijkstra';
        this.floydVisualizationMode = 'path-tracking'; // Default to path-tracking mode
        this.algorithmGenerator = null;
        this.currentStep = null;
        this.stepHistory = []; // Store history for backward navigation
        this.historyIndex = -1; // Current position in history
        this.isPlaying = false;
        this.isPaused = false;
        this.speed = 2;
        this.stepCount = 0;
        
        // Animation state
        this.animationState = {
            visitedNodes: new Set(),
            currentNode: null,
            exploredEdges: new Set(),
            pathEdges: new Set(),
            mstEdges: new Set(),
            distances: [],
            highlightedEdge: null,
            priorityQueue: [],
            queue: [],
            floydMatrix: null,
            floydIntermediate: null,
            comparison: null,
            previous: null  // Track previous nodes for path reconstruction
        };
        
        // Path tracking for hover
        this.shortestPaths = {}; // Store paths from algorithms: { nodeId: [path edges] }
        this.hoveredNode = null;
        this.negativeCycle = null; // Store negative cycle edges for highlighting
        
        // UI elements
        this.setupUIElements();
        this.setupEventListeners();
        
        // Initialize
        this.resizeCanvas();
        this.generateRandomGraph(8);
        this.rive.initialize();
        
        // Sync style dropdown with actual current style
        this.ui.visualStyle.value = this.currentStyleName;
        
        this.render();
        
        console.log('Graph Visualizer initialized with animation integration');
    }

    setupUIElements() {
        this.ui = {
            playBtn: document.getElementById('playBtn'),
            pauseBtn: document.getElementById('pauseBtn'),
            resetBtn: document.getElementById('resetBtn'),
            prevBtn: document.getElementById('prevBtn'),
            stepBtn: document.getElementById('stepBtn'),
            generateBtn: document.getElementById('generateBtn'),
            clearBtn: document.getElementById('clearBtn'),
            speedSlider: document.getElementById('speedSlider'),
            speedValue: document.getElementById('speedValue'),
            directedCheck: document.getElementById('directedCheck'),
            weightedCheck: document.getElementById('weightedCheck'),
            weightMode: document.getElementById('weightMode'),
            classicLayoutCheck: document.getElementById('classicLayoutCheck'),
            useRealRiveCheck: document.getElementById('useRealRiveCheck'),
            floydMode: document.getElementById('floydMode'),
            floydModeSection: document.getElementById('floydModeSection'),
            startNode: document.getElementById('startNode'),
            stepInfo: document.getElementById('stepInfo'),
            algoInfo: document.getElementById('algoInfo'),
            stepCount: document.getElementById('stepCount'),
            distance: document.getElementById('distance'),
            algoBtns: document.querySelectorAll('.algo-btn'),
            visualStyle: document.getElementById('visualStyle'),
            // Data panels
            pqPanel: document.getElementById('pqPanel'),
            pqContent: document.getElementById('pqContent'),
            distancePanel: document.getElementById('distancePanel'),
            distanceTable: document.getElementById('distanceTable'),
            comparisonPanel: document.getElementById('comparisonPanel'),
            comparisonContent: document.getElementById('comparisonContent'),
            floydPanel: document.getElementById('floydPanel'),
            floydMatrix: document.getElementById('floydMatrix'),
            mstPanel: document.getElementById('mstPanel'),
            mstEdges: document.getElementById('mstEdges'),
            queuePanel: document.getElementById('queuePanel'),
            queueContent: document.getElementById('queueContent')
        };
    }

    setupEventListeners() {
        // Algorithm selection
        this.ui.algoBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.ui.algoBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedAlgorithm = btn.dataset.algo;
                
                // Show Floyd mode selector only for Floyd-Warshall
                if (this.selectedAlgorithm === 'floyd') {
                    this.ui.floydModeSection.style.display = 'block';
                } else {
                    this.ui.floydModeSection.style.display = 'none';
                }
                
                this.updateAlgorithmInfo();
                this.reset();
                this.rive.animateButtonPress(btn);
            });
        });
        
        // Floyd visualization mode selector
        this.ui.floydMode.addEventListener('change', (e) => {
            this.floydVisualizationMode = e.target.value;
            this.reset(); // Reset to apply new mode
        });

        // Control buttons
        this.ui.playBtn.addEventListener('click', () => this.play());
        this.ui.pauseBtn.addEventListener('click', () => this.pause());
        this.ui.resetBtn.addEventListener('click', () => this.reset());
        this.ui.prevBtn.addEventListener('click', () => this.previousStep());
        this.ui.stepBtn.addEventListener('click', () => this.step());
        this.ui.generateBtn.addEventListener('click', () => {
            const nodeCount = 6 + Math.floor(Math.random() * 6);
            this.generateRandomGraph(nodeCount);
        });
        this.ui.clearBtn.addEventListener('click', () => this.clear());

        // Speed slider
        this.ui.speedSlider.addEventListener('input', (e) => {
            this.speed = parseInt(e.target.value);
            this.ui.speedValue.textContent = this.speed;
        });

        // Checkboxes
        this.ui.directedCheck.addEventListener('change', (e) => {
            this.graph.directed = e.target.checked;
            this.reset(); // Reset first to clear animation state
            this.checkAlgorithmFailures(); // Re-check warnings when directed/undirected changes
            this.render(); // Re-render to update edge colors
        });

        this.ui.classicLayoutCheck.addEventListener('change', (e) => {
            this.classicLayout = e.target.checked;
            this.physicsEnabled = !e.target.checked;
            
            if (this.classicLayout) {
                // Switch to classic ring layout
                this.arrangeNodesInCircle();
            }
            
            this.render();
        });

        // Node selection
        this.ui.startNode.addEventListener('change', () => this.reset());
        
        // Weight mode - regenerate graph when changed
        this.ui.weightMode.addEventListener('change', () => {
            const nodeCount = this.graph.nodes.length || 8;
            this.generateRandomGraph(nodeCount);
            this.reset(); // Reset animation state
            this.checkAlgorithmFailures(); // Re-check warnings for new weights
            this.render(); // Re-render to update edge colors
        });

        // Visual style selection
        this.ui.visualStyle.addEventListener('change', (e) => {
            this.currentStyleName = e.target.value;
            this.styleManager.setStyle(this.currentStyleName);
            this.currentStyle = this.styleManager.getCurrentStyle();
            this.physics = new SpringPhysics(this.currentStyle.getPhysicsConfig());
            this.physics.initialize(this.graph.nodes.length);
            this.render();
        });

        // Canvas interaction - dragging
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.handleMouseUp(e));
        
        // Window resize
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Animation loop for physics
        this.startPhysicsLoop();
    }

    resizeCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        
        // Also resize animation canvas to match
        this.rive.resizeCanvas();
        
        this.render();
    }

    arrangeNodesInCircle() {
        const nodeCount = this.graph.nodes.length;
        this.nodePositions = [];
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = Math.min(centerX, centerY) * 0.7;
        
        for (let i = 0; i < nodeCount; i++) {
            const angle = (2 * Math.PI * i) / nodeCount - Math.PI / 2;
            this.nodePositions.push({
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle)
            });
        }
    }

    generateRandomGraph(nodeCount) {
        this.graph.nodes = Array(nodeCount).fill(null).map((_, i) => ({ id: i }));
        this.graph.edges = [];
        
        // Generate positions
        this.arrangeNodesInCircle();
        
        // If not classic layout, add some randomness for physics
        if (!this.classicLayout) {
            this.nodePositions.forEach(pos => {
                pos.x += (Math.random() - 0.5) * 50;
                pos.y += (Math.random() - 0.5) * 50;
            });
        }

        // Generate edges (ensure connectivity)
        const edgeCount = Math.min(nodeCount * 2, nodeCount * (nodeCount - 1) / 2);
        const edges = new Set();
        
        // Determine weight range based on mode
        const weightMode = this.ui.weightMode ? this.ui.weightMode.value : 'positive';
        const getRandomWeight = () => {
            switch (weightMode) {
                case 'positive':
                    return Math.floor(Math.random() * 15) + 1;
                case 'negative':
                    // Mix of positive and negative (more positive)
                    return Math.random() < 0.7 ? 
                           Math.floor(Math.random() * 15) + 1 : 
                           -Math.floor(Math.random() * 5) - 1;
                case 'negative-cycle':
                    // More negative weights, can create cycles
                    return Math.random() < 0.5 ? 
                           Math.floor(Math.random() * 15) + 1 : 
                           -Math.floor(Math.random() * 10) - 1;
                default:
                    return Math.floor(Math.random() * 15) + 1;
            }
        };
        
        // First, create a spanning tree to ensure connectivity
        for (let i = 1; i < nodeCount; i++) {
            const from = Math.floor(Math.random() * i);
            const to = i;
            const weight = getRandomWeight();
            const edgeKey = `${Math.min(from, to)}-${Math.max(from, to)}`;
            edges.add(edgeKey);
            this.graph.edges.push({ from, to, weight });
        }

        // Add additional random edges
        while (this.graph.edges.length < edgeCount) {
            const from = Math.floor(Math.random() * nodeCount);
            let to = Math.floor(Math.random() * nodeCount);
            
            if (from === to) continue;
            
            const edgeKey = `${Math.min(from, to)}-${Math.max(from, to)}`;
            if (edges.has(edgeKey)) continue;
            
            let weight = getRandomWeight();
            
            // For "negative" mode (no cycles), check if negative edge would create cycle
            if (weightMode === 'negative' && weight < 0) {
                // Temporarily add edge and check for negative cycle
                this.graph.edges.push({ from, to, weight });
                const cycleCheck = this.detectNegativeCycle();
                if (cycleCheck.hasCycle) {
                    // Remove edge and try with positive weight instead
                    this.graph.edges.pop();
                    weight = Math.floor(Math.random() * 15) + 1;
                }
                this.graph.edges.pop(); // Remove temp edge
            }
            
            edges.add(edgeKey);
            this.graph.edges.push({ from, to, weight });
        }

        // Update node selectors
        this.updateNodeSelectors();
        
        // Initialize physics
        this.physics.initialize(nodeCount);
        
        // Check for algorithm failure cases
        this.checkAlgorithmFailures();
        
        this.reset();
        this.render();
    }
    
    // Detect negative cycle using Bellman-Ford and return cycle edges if found
    detectNegativeCycle() {
        const n = this.graph.nodes.length;
        if (n === 0) return { hasCycle: false, cycle: [] };
        
        // Special case for undirected graphs: any negative edge is a cycle
        if (!this.graph.directed) {
            for (const edge of this.graph.edges) {
                if (edge.weight < 0) {
                    // Return both directions of the edge to show the cycle
                    return { 
                        hasCycle: true, 
                        cycle: [
                            { from: edge.from, to: edge.to },
                            { from: edge.to, to: edge.from }
                        ] 
                    };
                }
            }
            return { hasCycle: false, cycle: [] };
        }
        
        // For directed graphs, use Bellman-Ford to detect actual cycles
        const distances = new Array(n).fill(Infinity);
        const previous = new Array(n).fill(null);
        
        // Initialize all nodes with distance 0 to detect cycles in all components
        for (let i = 0; i < n; i++) {
            distances[i] = 0;
        }
        
        // Relax edges n-1 times
        for (let i = 0; i < n - 1; i++) {
            for (const edge of this.graph.edges) {
                if (distances[edge.from] + edge.weight < distances[edge.to]) {
                    distances[edge.to] = distances[edge.from] + edge.weight;
                    previous[edge.to] = edge.from;
                }
            }
        }
        
        // Check for negative cycle (nth iteration) and trace the cycle
        for (const edge of this.graph.edges) {
            if (distances[edge.from] + edge.weight < distances[edge.to]) {
                // Found negative cycle, trace it
                const cycle = this.traceNegativeCycle(edge.to, previous);
                return { hasCycle: true, cycle };
            }
        }
        
        return { hasCycle: false, cycle: [] };
    }
    
    // Trace the negative cycle from a node in the cycle
    traceNegativeCycle(startNode, previous) {
        const n = this.graph.nodes.length;
        let current = startNode;
        const visited = new Set();
        
        // Walk back to find a node in the cycle
        for (let i = 0; i < n; i++) {
            current = previous[current];
        }
        
        // Now trace the cycle
        const cycle = [];
        const cycleStart = current;
        do {
            const next = previous[current];
            if (next !== null) {
                cycle.push({ from: next, to: current });
            }
            current = next;
        } while (current !== cycleStart && current !== null);
        
        return cycle.reverse();
    }
    
    // Find counterexample where Dijkstra fails with negative edges
    findDijkstraCounterexample() {
        // Check if graph has negative edges
        const hasNegativeEdges = this.graph.edges.some(e => e.weight < 0);
        if (!hasNegativeEdges) return null;
        
        const n = this.graph.nodes.length;
        
        // Try each node as start
        for (let start = 0; start < n; start++) {
            // Run Bellman-Ford (correct)
            const bellmanDist = new Array(n).fill(Infinity);
            bellmanDist[start] = 0;
            
            for (let i = 0; i < n - 1; i++) {
                for (const edge of this.graph.edges) {
                    if (bellmanDist[edge.from] !== Infinity && 
                        bellmanDist[edge.from] + edge.weight < bellmanDist[edge.to]) {
                        bellmanDist[edge.to] = bellmanDist[edge.from] + edge.weight;
                    }
                    if (!this.graph.directed) {
                        if (bellmanDist[edge.to] !== Infinity && 
                            bellmanDist[edge.to] + edge.weight < bellmanDist[edge.from]) {
                            bellmanDist[edge.from] = bellmanDist[edge.to] + edge.weight;
                        }
                    }
                }
            }
            
            // Run Dijkstra (may be incorrect)
            const dijkstraDist = new Array(n).fill(Infinity);
            const visited = new Array(n).fill(false);
            dijkstraDist[start] = 0;
            
            for (let i = 0; i < n; i++) {
                let u = -1;
                for (let j = 0; j < n; j++) {
                    if (!visited[j] && (u === -1 || dijkstraDist[j] < dijkstraDist[u])) {
                        u = j;
                    }
                }
                
                if (dijkstraDist[u] === Infinity) break;
                visited[u] = true;
                
                for (const edge of this.graph.edges) {
                    if (edge.from === u && dijkstraDist[u] + edge.weight < dijkstraDist[edge.to]) {
                        dijkstraDist[edge.to] = dijkstraDist[u] + edge.weight;
                    }
                    if (!this.graph.directed && edge.to === u && dijkstraDist[u] + edge.weight < dijkstraDist[edge.from]) {
                        dijkstraDist[edge.from] = dijkstraDist[u] + edge.weight;
                    }
                }
            }
            
            // Compare results - find a counterexample
            for (let target = 0; target < n; target++) {
                if (target === start) continue;
                
                // If Dijkstra found a longer path than Bellman-Ford, that's a counterexample
                if (bellmanDist[target] !== Infinity && 
                    dijkstraDist[target] !== Infinity &&
                    dijkstraDist[target] > bellmanDist[target] + 0.001) { // Small epsilon for float comparison
                    return {
                        start,
                        target,
                        dijkstraDistance: dijkstraDist[target],
                        correctDistance: bellmanDist[target]
                    };
                }
            }
        }
        
        return null;
    }
    
    // Check for algorithm failure cases and display warnings
    checkAlgorithmFailures() {
        const warningPanel = document.getElementById('algorithmWarnings');
        if (!warningPanel) {
            // Create warning panel if it doesn't exist
            const panel = document.createElement('div');
            panel.id = 'algorithmWarnings';
            panel.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                max-width: 400px;
                background: #fff3cd;
                border: 2px solid #ffc107;
                border-radius: 8px;
                padding: 16px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 1000;
                font-size: 14px;
                display: none;
            `;
            document.body.appendChild(panel);
        }
        
        const warnings = [];
        
        // Check for negative cycle
        const cycleResult = this.detectNegativeCycle();
        this.negativeCycle = cycleResult.hasCycle ? cycleResult.cycle : null;
        
        // Check if graph has negative edges
        const hasNegativeEdges = this.graph.edges.some(e => e.weight < 0);
        
        if (cycleResult.hasCycle) {
            const undirectedNote = !this.graph.directed ? '<br><em>(Note: In undirected graphs, any negative edge forms a cycle)</em>' : '';
            warnings.push({
                title: '⚠️ Negative Cycle Detected!',
                message: 'This graph contains a <strong>negative cycle</strong>. The optimal path cost is <strong>-∞</strong>.' + undirectedNote + '<br><br>'
                    + '❌ <strong>Dijkstra will fail silently</strong> (gives wrong result without warning)<br>'
                    + '✅ <strong>Bellman-Ford and SPFA will detect the cycle</strong> and report it.',
                severity: 'critical'
            });
        } else if (hasNegativeEdges) {
            // Has negative edges but no cycle - only Dijkstra fails
            const counterexample = this.findDijkstraCounterexample();
            const counterexampleText = counterexample ? 
                `<strong>Counterexample:</strong><br>
                • Path from Node ${counterexample.start} → Node ${counterexample.target}<br>
                • Dijkstra's result: <span style="color: #ff5555; font-weight: 600;">${counterexample.dijkstraDistance.toFixed(2)}</span><br>
                • Correct distance: <span style="color: #55ff55; font-weight: 600;">${counterexample.correctDistance.toFixed(2)}</span><br><br>` : '';
            
            warnings.push({
                title: '❌ Dijkstra Will Fail!',
                message: `This graph has <strong>negative edges</strong> (but no negative cycle).<br><br>
                    ${counterexampleText}
                    ✅ Use <strong>Bellman-Ford</strong> or <strong>SPFA</strong> instead!`,
                severity: 'error'
            });
        }
        
        // Display warnings
        this.displayAlgorithmWarnings(warnings);
    }
    
    displayAlgorithmWarnings(warnings) {
        const panel = document.getElementById('algorithmWarnings');
        if (!panel) return;
        
        if (warnings.length === 0) {
            panel.style.display = 'none';
            return;
        }
        
        // Build warning HTML
        let html = '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">';
        html += '<h4 style="margin: 0; font-size: 16px; font-weight: 600; color: #1a1a1a; text-shadow: 0 0 8px rgba(212, 175, 55, 0.4);">Algorithm Warnings</h4>';
        html += '<button onclick="document.getElementById(\'algorithmWarnings\').style.display=\'none\'" style="background: none; border: none; font-size: 20px; cursor: pointer; padding: 0; line-height: 1; color: #1a1a1a;">&times;</button>';
        html += '</div>';
        
        warnings.forEach((warning, i) => {
            const bgColor = warning.severity === 'critical' ? 'rgba(50, 20, 25, 0.95)' : 'rgba(50, 40, 20, 0.95)';
            const borderColor = warning.severity === 'critical' ? '#ff5555' : '#ffaa00';
            const textColor = '#e8e8e8';
            
            html += `<div style="background: ${bgColor}; border-left: 4px solid ${borderColor}; padding: 12px; margin-bottom: ${i < warnings.length - 1 ? '12px' : '0'}; border-radius: 4px; backdrop-filter: blur(10px);">`;
            html += `<div style="font-weight: 600; margin-bottom: 8px; color: ${textColor}; text-shadow: 0 0 8px rgba(212, 175, 55, 0.3);">${warning.title}</div>`;
            html += `<div style="line-height: 1.5; color: ${textColor};">${warning.message}</div>`;
            html += '</div>';
        });
        
        panel.innerHTML = html;
        panel.style.display = 'block';
    }

    updateNodeSelectors() {
        const startNode = this.ui.startNode;
        
        startNode.innerHTML = '';
        for (let i = 0; i < this.graph.nodes.length; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Node ${i}`;
            startNode.appendChild(option);
        }
    }

    clear() {
        this.graph.nodes = [];
        this.graph.edges = [];
        this.nodePositions = [];
        this.reset();
        this.render();
    }

    play() {
        if (this.isPlaying && !this.isPaused) return;
        
        if (!this.algorithmGenerator) {
            this.initializeAlgorithm();
        }
        
        this.isPlaying = true;
        this.isPaused = false;
        this.runAnimation();
    }

    pause() {
        this.isPaused = true;
        this.isPlaying = false;
    }

    reset() {
        this.isPlaying = false;
        this.isPaused = false;
        this.algorithmGenerator = null;
        this.currentStep = null;
        this.stepHistory = [];
        this.historyIndex = -1;
        this.stepCount = 0;
        
        this.animationState = {
            visitedNodes: new Set(),
            currentNode: null,
            exploredEdges: new Set(),
            pathEdges: new Set(),
            mstEdges: new Set(),
            distances: [],
            highlightedEdge: null,
            poppedLog: [],  // Log of all popped entries
            lastKeyChanges: new Set(),  // Track recent key changes for highlighting
            batchNode: null,  // Current node being explored (batch indicator)
            batchEdges: [],    // Edges in current batch
            batchNeighbors: new Set()  // Neighbor nodes in current batch
        };
        
        this.ui.stepCount.textContent = '0';
        this.ui.distance.textContent = '-';
        this.ui.stepInfo.textContent = '';
        
        this.rive.clearEffects();
        this.render();
    }

    step() {
        if (!this.algorithmGenerator) {
            this.initializeAlgorithm();
        }
        
        this.executeStep();
    }

    initializeAlgorithm() {
        const startNode = parseInt(this.ui.startNode.value);
        
        // Hide all data panels first
        this.hideAllDataPanels();
        
        switch (this.selectedAlgorithm) {
            case 'dijkstra':
                this.algorithmGenerator = GraphAlgorithms.dijkstra(this.graph, startNode);
                this.ui.pqPanel.style.display = 'block';
                this.ui.distancePanel.style.display = 'block';
                this.ui.comparisonPanel.style.display = 'block';
                break;
            case 'prim':
                this.algorithmGenerator = GraphAlgorithms.prim(this.graph, startNode);
                this.ui.mstPanel.style.display = 'block';
                this.ui.pqPanel.style.display = 'block';
                break;
            case 'prim-optimized':
                this.algorithmGenerator = GraphAlgorithms.primOptimized(this.graph, startNode);
                this.ui.mstPanel.style.display = 'block';
                this.ui.pqPanel.style.display = 'block';
                break;
            case 'kruskal':
                this.algorithmGenerator = GraphAlgorithms.kruskal(this.graph);
                this.ui.mstPanel.style.display = 'block';
                break;
            case 'bellman':
                this.algorithmGenerator = GraphAlgorithms.bellmanFord(this.graph, startNode);
                this.ui.distancePanel.style.display = 'block';
                break;
            case 'spfa':
                this.algorithmGenerator = GraphAlgorithms.spfa(this.graph, startNode);
                this.ui.queuePanel.style.display = 'block';
                this.ui.distancePanel.style.display = 'block';
                this.ui.comparisonPanel.style.display = 'block';
                break;
            case 'floyd':
                this.algorithmGenerator = GraphAlgorithms.floydWarshall(this.graph);
                this.ui.floydPanel.style.display = 'block';
                this.ui.comparisonPanel.style.display = 'block';
                break;
        }
    }
    
    hideAllDataPanels() {
        this.ui.pqPanel.style.display = 'none';
        this.ui.distancePanel.style.display = 'none';
        this.ui.comparisonPanel.style.display = 'none';
        this.ui.floydPanel.style.display = 'none';
        this.ui.mstPanel.style.display = 'none';
        this.ui.queuePanel.style.display = 'none';
    }

    async runAnimation() {
        while (this.isPlaying && !this.isPaused) {
            const done = this.executeStep();
            if (done) {
                this.isPlaying = false;
                break;
            }
            
            const delay = 1000 / this.speed;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    executeStep() {
        if (!this.algorithmGenerator) return true;
        
        // If we're not at the end of history, just move forward in history
        if (this.historyIndex < this.stepHistory.length - 1) {
            this.historyIndex++;
            this.currentStep = this.stepHistory[this.historyIndex];
            this.stepCount++;
            this.ui.stepCount.textContent = this.stepCount;
            this.processStep(this.currentStep);
            this.render();
            return false;
        }
        
        // Otherwise, get next step from generator
        const result = this.algorithmGenerator.next();
        
        if (result.done) {
            return true;
        }
        
        this.currentStep = result.value;
        this.stepHistory.push(this.currentStep); // Save to history
        this.historyIndex = this.stepHistory.length - 1;
        this.stepCount++;
        this.ui.stepCount.textContent = this.stepCount;
        
        this.processStep(this.currentStep);
        this.render();
        
        return false;
    }
    
    previousStep() {
        if (this.historyIndex <= 0) return; // Can't go back further
        
        this.historyIndex--;
        this.stepCount--;
        this.ui.stepCount.textContent = this.stepCount;
        
        // Need to rebuild state from start to current historyIndex
        this.rebuildStateFromHistory();
        this.render();
    }
    
    rebuildStateFromHistory() {
        // Reset animation state
        this.animationState = {
            visitedNodes: new Set(),
            currentNode: null,
            exploredEdges: new Set(),
            pathEdges: new Set(),
            mstEdges: new Set(),
            distances: [],
            highlightedEdge: null,
            poppedLog: [],
            lastKeyChanges: new Set(),
            batchNode: null,
            batchEdges: [],
            batchNeighbors: new Set()
        };
        
        // Replay all steps up to historyIndex
        for (let i = 0; i <= this.historyIndex; i++) {
            this.processStep(this.stepHistory[i]);
        }
        
        this.currentStep = this.stepHistory[this.historyIndex];
    }

    // Reconstruct path from i to j using Floyd's next matrix
    reconstructFloydPath(i, j, next, dist = null) {
        // Check if path exists
        if (!next || !next[i] || next[i][j] === null) {
            return null; // No path exists
        }
        
        // Check distance matrix if available (path is unreachable if dist is Infinity)
        if (dist && dist[i] && dist[i][j] === Infinity) {
            return null;
        }
        
        const path = [i];
        let current = i;
        let iterations = 0;
        const maxIterations = 100; // Safety limit to prevent infinite loops
        
        while (current !== j && iterations < maxIterations) {
            current = next[current][j];
            if (current === null || current === undefined) {
                return null; // Path broken
            }
            path.push(current);
            iterations++;
        }
        
        // Check if we actually reached destination
        if (current !== j) {
            return null; // Failed to reach destination
        }
        
        return path;
    }
    
    // Draw a Floyd path with glowing effect
    drawFloydPath(path, color, isAccepted) {
        if (!path || path.length < 2) return;
        
        const pos = this.nodePositions;
        // Draw path as a series of connected segments
        for (let i = 0; i < path.length; i++) {
            if (i < path.length - 1) {
                // Pass through segments to create a path
                const x1 = pos[path[i]].x;
                const y1 = pos[path[i]].y;
                const x2 = pos[path[i+1]].x;
                const y2 = pos[path[i+1]].y;
                
                // Use midpoint for triangular shape
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                
                setTimeout(() => {
                    this.rive.createGlowingPath(x1, y1, midX, midY, x2, y2, color, isAccepted);
                }, i * 100);
            }
        }
    }
    
    // Draw paths from hovered node to all other nodes (for Floyd path-tracking mode)
    drawFloydHoverPaths(fromNode) {
        const ctx = this.ctx;
        const pos = this.nodePositions;
        const next = this.animationState.floydNext;
        const dist = this.animationState.floydDist;
        
        if (!next || !pos) return;
        
        // Draw paths from fromNode to all other nodes
        for (let toNode = 0; toNode < this.graph.nodes.length; toNode++) {
            if (toNode === fromNode) continue;
            
            const path = this.reconstructFloydPath(fromNode, toNode, next, dist);
            if (!path || path.length < 2) continue;
            
            // Draw the path with a semi-transparent line
            ctx.save();
            ctx.strokeStyle = '#4caf50';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.6;
            ctx.lineCap = 'round';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#4caf50';
            
            ctx.beginPath();
            ctx.moveTo(pos[path[0]].x, pos[path[0]].y);
            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(pos[path[i]].x, pos[path[i]].y);
            }
            ctx.stroke();
            
            // Draw arrowhead at the end
            if (path.length >= 2) {
                const lastIdx = path.length - 1;
                const prevIdx = lastIdx - 1;
                const angle = Math.atan2(
                    pos[path[lastIdx]].y - pos[path[prevIdx]].y,
                    pos[path[lastIdx]].x - pos[path[prevIdx]].x
                );
                
                const arrowSize = 12;
                ctx.fillStyle = '#4caf50';
                ctx.beginPath();
                ctx.moveTo(pos[path[lastIdx]].x, pos[path[lastIdx]].y);
                ctx.lineTo(
                    pos[path[lastIdx]].x - arrowSize * Math.cos(angle - Math.PI / 6),
                    pos[path[lastIdx]].y - arrowSize * Math.sin(angle - Math.PI / 6)
                );
                ctx.lineTo(
                    pos[path[lastIdx]].x - arrowSize * Math.cos(angle + Math.PI / 6),
                    pos[path[lastIdx]].y - arrowSize * Math.sin(angle + Math.PI / 6)
                );
                ctx.closePath();
                ctx.fill();
            }
            
            ctx.restore();
        }
    }

    processStep(step) {
        if (!step) return;
        
        const pos = this.nodePositions;
        const speedMult = this.speed / 2;  // Speed multiplier for animations
        
        // Update UI
        this.ui.stepInfo.textContent = step.message || '';
        
        // Process based on step type
        switch (step.type) {
            case 'init':
                if (step.current !== undefined && pos[step.current]) {
                    this.animationState.currentNode = step.current;
                    this.rive.createNodePulse(pos[step.current].x, pos[step.current].y, '#4caf50', 1.0, speedMult);
                }
                // Floyd: Store initial matrices
                if (this.selectedAlgorithm === 'floyd') {
                    if (step.next) {
                        this.animationState.floydNext = step.next;
                    }
                    if (step.dist) {
                        this.animationState.floydDist = step.dist;
                    }
                }
                break;
                
            case 'visit':
                if (step.current !== undefined && pos[step.current]) {
                    this.animationState.visitedNodes.add(step.current);
                    this.animationState.currentNode = step.current;
                    this.rive.createNodePulse(pos[step.current].x, pos[step.current].y, '#ffd54f', 0.8, speedMult);
                }
                if (step.distances) {
                    this.animationState.distances = step.distances;
                }
                if (step.priorityQueue) {
                    this.animationState.priorityQueue = step.priorityQueue;
                }
                // Dijkstra: Add to popped log as accepted
                if (this.selectedAlgorithm === 'dijkstra') {
                    this.animationState.poppedLog.push({
                        node: step.current,
                        distance: step.distances ? step.distances[step.current] : '-',
                        status: 'accepted'
                    });
                }
                break;
                
            case 'pq_peek':
                // Prim: showing top of PQ
                if (step.topNode !== undefined && pos[step.topNode]) {
                    this.animationState.primTopNode = step.topNode;
                    this.rive.createNodePulse(pos[step.topNode].x, pos[step.topNode].y, '#64b5f6', 0.6);
                }
                if (step.priorityQueue) {
                    this.animationState.priorityQueue = step.priorityQueue;
                }
                if (step.pqEdges) {
                    this.animationState.pqEdges = step.pqEdges;
                }
                break;
                
            case 'pq_pop':
                // Prim: popped from PQ (will be accepted or rejected later)
                if (step.current !== undefined && pos[step.current]) {
                    this.animationState.currentNode = step.current;
                    this.animationState.primTopNode = null;
                    this.rive.createNodePulse(pos[step.current].x, pos[step.current].y, '#ffc107', 0.8);
                    // Track as pending - status determined in add_to_mst or pq_skip
                    this.animationState.pendingPop = {
                        node: step.current,
                        weight: step.edgeWeight
                    };
                }
                if (step.priorityQueue) {
                    this.animationState.priorityQueue = step.priorityQueue;
                }
                if (step.pqEdges) {
                    this.animationState.pqEdges = step.pqEdges;
                }
                break;
                
            case 'pq_skip':
                // Prim: skipping stale entry (internal edge)
                if (step.current !== undefined && pos[step.current]) {
                    this.rive.createNodePulse(pos[step.current].x, pos[step.current].y, '#f44336', 0.5);
                    // Add to popped log as rejected (internal edge)
                    this.animationState.poppedLog.push({
                        node: step.current,
                        weight: this.animationState.pendingPop ? this.animationState.pendingPop.weight : '-',
                        status: 'rejected',
                        reason: 'internal edge'
                    });
                    this.animationState.pendingPop = null;
                }
                if (step.priorityQueue) {
                    this.animationState.priorityQueue = step.priorityQueue;
                }
                if (step.pqEdges) {
                    this.animationState.pqEdges = step.pqEdges;
                }
                break;
                
            case 'pq_add':
                // Prim: adding edge to PQ
                if (step.edge && step.current !== undefined && step.neighbor !== undefined && pos[step.current] && pos[step.neighbor]) {
                    // Always flow from current to neighbor
                    this.rive.createEdgeFlow(pos[step.current].x, pos[step.current].y, pos[step.neighbor].x, pos[step.neighbor].y, '#4caf50');
                }
                if (step.neighbor !== undefined && pos[step.neighbor]) {
                    this.rive.createNodePulse(pos[step.neighbor].x, pos[step.neighbor].y, '#4caf50', 0.6);
                }
                if (step.priorityQueue) {
                    this.animationState.priorityQueue = step.priorityQueue;
                }
                if (step.pqEdges) {
                    this.animationState.pqEdges = step.pqEdges;
                }
                break;
                
            case 'pq_update':
                // Prim Optimized: updating edge in PQ (decreaseKey)
                if (step.edge && step.current !== undefined && step.neighbor !== undefined && pos[step.current] && pos[step.neighbor]) {
                    // Always flow from current to neighbor
                    this.rive.createEdgeFlow(pos[step.current].x, pos[step.current].y, pos[step.neighbor].x, pos[step.neighbor].y, '#ffc107');
                }
                if (step.neighbor !== undefined && pos[step.neighbor]) {
                    this.rive.createNodePulse(pos[step.neighbor].x, pos[step.neighbor].y, '#ffc107', 0.7);
                }
                if (step.priorityQueue) {
                    this.animationState.priorityQueue = step.priorityQueue;
                }
                if (step.pqEdges) {
                    this.animationState.pqEdges = step.pqEdges;
                }
                break;
                
            case 'edge_reject':
                // Prim Optimized: rejecting edge without pushing (glow effect)
                if (step.edge && step.current !== undefined && step.neighbor !== undefined && pos[step.current] && pos[step.neighbor]) {
                    // Always flow from current to neighbor
                    this.rive.createEdgeFlow(pos[step.current].x, pos[step.current].y, pos[step.neighbor].x, pos[step.neighbor].y, '#e57373');
                    
                    // Add to popped log as rejected (never in PQ)
                    this.animationState.poppedLog.push({
                        node: step.neighbor,
                        weight: step.weight,
                        status: 'rejected',
                        reason: 'never in PQ',
                        currentKey: step.currentKey
                    });
                }
                if (step.neighbor !== undefined && pos[step.neighbor]) {
                    // Glow the node to show current key value
                    this.rive.createNodePulse(pos[step.neighbor].x, pos[step.neighbor].y, '#e57373', 0.8);
                }
                break;
            
            case 'begin_batch':
                // Starting to explore neighbors of a node - set batch indicator
                if (step.current !== undefined) {
                    this.animationState.batchNode = step.current;
                    // Get all edges and neighbor nodes from current node for batch visualization
                    const batchEdges = [];
                    const batchNeighbors = new Set();
                    this.graph.edges.forEach(edge => {
                        if (edge.from === step.current) {
                            batchEdges.push(edge);
                            batchNeighbors.add(edge.to);
                        } else if (!this.graph.directed && edge.to === step.current) {
                            batchEdges.push(edge);
                            batchNeighbors.add(edge.from);
                        }
                    });
                    this.animationState.batchEdges = batchEdges;
                    this.animationState.batchNeighbors = batchNeighbors;
                    // Subtle pulse on batch node
                    if (pos[step.current]) {
                        this.rive.createNodePulse(pos[step.current].x, pos[step.current].y, '#90caf9', 0.4);
                    }
                }
                break;
                
            case 'explore':
                if (step.edge) {
                    // Temporarily highlight edge (will be cleared next step)
                    this.animationState.highlightedEdge = step.edge;
                    // Use current and neighbor for consistent direction, fallback to edge.from/to
                    const from = step.current !== undefined ? step.current : step.edge.from;
                    const to = step.neighbor !== undefined ? step.neighbor : step.edge.to;
                    if (pos[from] && pos[to]) {
                        this.rive.createEdgeFlow(pos[from].x, pos[from].y, pos[to].x, pos[to].y, '#64b5f6');
                    }
                }
                break;
                
            case 'relax':
                // Clear previous highlighted edge
                this.animationState.highlightedEdge = null;
                
                if (step.edge) {
                    // Add to explored (red), but will be cleared
                    this.animationState.exploredEdges.add(step.edge);
                    const to = step.neighbor || step.edge.to;
                    if (pos[to]) {
                        this.rive.createNodePulse(pos[to].x, pos[to].y, '#ff6b6b', 1.2);
                    }
                    
                    // Clear this edge after a short time
                    setTimeout(() => {
                        this.animationState.exploredEdges.delete(step.edge);
                    }, 500);
                }
                if (step.distances) {
                    this.animationState.distances = step.distances;
                }
                if (step.priorityQueue) {
                    this.animationState.priorityQueue = step.priorityQueue;
                }
                // Track previous nodes for path reconstruction
                if (step.previous) {
                    this.animationState.previous = step.previous;
                }
                break;
                
            case 'add_to_mst':
            case 'accept':
                if (step.mstEdges) {
                    this.animationState.mstEdges = new Set(step.mstEdges);
                    if (step.mstEdges.length > 0) {
                        const lastEdge = step.mstEdges[step.mstEdges.length - 1];
                        const from = lastEdge.from;
                        const to = lastEdge.to;
                        if (pos[from] && pos[to]) {
                            this.rive.createBezierFlow(pos[from].x, pos[from].y, pos[to].x, pos[to].y, '#ba68c8');
                            this.rive.createExplosion(pos[to].x, pos[to].y, '#ba68c8', 8);
                        }
                        
                        // Remove from explored to prevent wobble (MST uses glow instead)
                        this.animationState.exploredEdges.delete(lastEdge);
                    }
                }
                // Prim: Add to popped log as accepted
                if ((this.selectedAlgorithm === 'prim' || this.selectedAlgorithm === 'prim-optimized') && this.animationState.pendingPop) {
                    this.animationState.poppedLog.push({
                        node: this.animationState.pendingPop.node,
                        weight: this.animationState.pendingPop.weight,
                        status: 'accepted'
                    });
                    this.animationState.pendingPop = null;
                }
                // Store visited nodes for Prim or union-find sets for Kruskal
                if (step.visitedNodes) {
                    this.animationState.primVisitedNodes = step.visitedNodes;
                }
                if (step.unionFindSets) {
                    this.animationState.unionFindSets = step.unionFindSets;
                }
                if (step.totalWeight !== undefined) {
                    this.ui.distance.textContent = step.totalWeight;
                }
                break;
                
            case 'consider':
            case 'update_key':
                if (step.edge) {
                    this.animationState.highlightedEdge = step.edge;
                }
                // Store visited nodes for Prim or union-find sets for Kruskal
                if (step.visitedNodes) {
                    this.animationState.primVisitedNodes = step.visitedNodes;
                }
                if (step.unionFindSets) {
                    this.animationState.unionFindSets = step.unionFindSets;
                }
                break;
                
            case 'reject':
                if (step.edge) {
                    const from = step.edge.from;
                    const to = step.edge.to;
                    this.rive.createEdgeFlow(pos[from].x, pos[from].y, pos[to].x, pos[to].y, '#f44336');
                }
                if (step.unionFindSets) {
                    this.animationState.unionFindSets = step.unionFindSets;
                }
                break;
                
            case 'discard':
                // Dijkstra: stale entry
                if (step.current !== undefined && pos[step.current]) {
                    this.rive.createNodePulse(pos[step.current].x, pos[step.current].y, '#f44336', 0.5);
                    // Add to popped log as stale
                    this.animationState.poppedLog.push({
                        node: step.current,
                        distance: step.pqDistance !== undefined ? step.pqDistance : '-',
                        status: 'stale',
                        currentBest: step.currentDistance
                    });
                }
                if (step.priorityQueue) {
                    this.animationState.priorityQueue = step.priorityQueue;
                }
                break;
                
            case 'discard_old':
                // Dijkstra: discarded stale PQ entry
                if (step.priorityQueue) {
                    this.animationState.priorityQueue = step.priorityQueue;
                }
                if (step.current !== undefined && pos[step.current]) {
                    this.rive.createNodePulse(pos[step.current].x, pos[step.current].y, '#999', 0.8);
                }
                break;
                
            case 'dequeue':
                // SPFA: node popped from queue, about to process its edges
                if (step.current !== undefined && pos[step.current]) {
                    this.animationState.currentNode = step.current;
                    this.animationState.spfaQueue = step.queue || [];
                    this.animationState.spfaPoppedNode = step.current; // Track popped node
                    this.rive.createNodePulse(pos[step.current].x, pos[step.current].y, '#4caf50', 1.0);
                }
                break;
                
            case 'enqueue':
                // SPFA: node added to queue
                if (step.neighbor !== undefined && pos[step.neighbor]) {
                    this.animationState.spfaQueue = step.queue || [];
                    this.animationState.spfaPoppedNode = null; // Clear popped node
                    this.rive.createNodePulse(pos[step.neighbor].x, pos[step.neighbor].y, '#64b5f6');
                }
                break;
                
            case 'intermediate':
                if (step.k !== undefined && pos[step.k]) {
                    // K node: outermost loop (most important)
                    this.animationState.floydK = step.k;
                    this.animationState.floydI = null;
                    this.animationState.floydJ = null;
                    this.animationState.floydComparisonCells = null;
                    // Store the next matrix for path reconstruction
                    if (step.next) {
                        this.animationState.floydNext = step.next;
                    }
                    // Store distance matrix to check reachability
                    if (step.dist) {
                        this.animationState.floydDist = step.dist;
                    }
                    this.rive.createNodePulse(pos[step.k].x, pos[step.k].y, '#ffd54f', 1.2);
                    // Add green circle indicator on outer loop node
                    this.rive.createGreenCircleIndicator(pos[step.k].x, pos[step.k].y);
                }
                break;
                
            case 'skip':
                if (step.k !== undefined && step.i !== undefined && step.j !== undefined) {
                    // Keep K highlighted but clear I and J
                    this.animationState.floydI = step.i;
                    this.animationState.floydJ = step.j;
                    this.animationState.floydComparisonCells = null;
                    // Store matrices (unchanged, but needed for hover)
                    if (step.next) {
                        this.animationState.floydNext = step.next;
                    }
                    if (step.dist) {
                        this.animationState.floydDist = step.dist;
                    }
                    // Brief pulse to show we're skipping
                    if (pos[step.i]) this.rive.createNodePulse(pos[step.i].x, pos[step.i].y, '#999', 0.5);
                    if (pos[step.j]) this.rive.createNodePulse(pos[step.j].x, pos[step.j].y, '#999', 0.5);
                }
                break;
                
            case 'compare':
                if (step.k !== undefined && step.i !== undefined && step.j !== undefined) {
                    // Clear old triangles/paths to prevent stacking
                    this.rive.clearParticleType('dashed-triangle');
                    this.rive.clearParticleType('glowing-path');
                    
                    // Store all three nodes for prominent highlighting
                    this.animationState.floydK = step.k;  // Intermediate node (mid)
                    this.animationState.floydI = step.i;  // From node (A)
                    this.animationState.floydJ = step.j;  // To node (B)
                    
                    // Store next matrix for path reconstruction
                    if (step.next) {
                        this.animationState.floydNext = step.next;
                    }
                    // Store distance matrix to check reachability
                    if (step.dist) {
                        this.animationState.floydDist = step.dist;
                    }
                    
                    // Store which matrix cells we're comparing
                    const willAccept = step.viaDist < step.directDist;
                    this.animationState.floydComparisonCells = {
                        ik: [step.i, step.k],  // A->mid
                        kj: [step.k, step.j],  // mid->B
                        ij: [step.i, step.j],  // A->B
                        willAccept: willAccept
                    };
                    
                    const speedMult = this.speed / 2;  // Normalize speed (2 is default)
                    if (pos[step.k]) this.rive.createNodePulse(pos[step.k].x, pos[step.k].y, '#ffd54f', 1.5, speedMult);
                    if (pos[step.i]) this.rive.createNodePulse(pos[step.i].x, pos[step.i].y, '#64b5f6', 1.2, speedMult);
                    if (pos[step.j]) this.rive.createNodePulse(pos[step.j].x, pos[step.j].y, '#ba68c8', 1.2, speedMult);
                    
                    if (this.floydVisualizationMode === 'simple') {
                        // Simple mode: Draw dashed triangle: i->k->j->i
                        this.rive.createDashedTriangle(
                            pos[step.i].x, pos[step.i].y,
                            pos[step.k].x, pos[step.k].y,
                            pos[step.j].x, pos[step.j].y,
                            willAccept ? '#4caf50' : '#ff9800',
                            speedMult
                        );
                    } else if (this.floydVisualizationMode === 'colorful') {
                        // Colorful mode: Show glowing lines for via-K (blue) and direct (purple)
                        // Draw the via-K path (i->k->j)
                        setTimeout(() => {
                            this.rive.createGlowingPath(
                                pos[step.i].x, pos[step.i].y,
                                pos[step.k].x, pos[step.k].y,
                                pos[step.j].x, pos[step.j].y,
                                '#64b5f6',
                                willAccept  // Glow green if accepted, red if rejected
                            );
                        }, 100);
                        
                        // Draw the direct path (i->j)
                        setTimeout(() => {
                            const midX = (pos[step.i].x + pos[step.j].x) / 2;
                            const midY = (pos[step.i].y + pos[step.j].y) / 2;
                            this.rive.createGlowingPath(
                                pos[step.i].x, pos[step.i].y,
                                midX, midY,
                                pos[step.j].x, pos[step.j].y,
                                '#ba68c8',
                                !willAccept  // Glow green if kept, red if replaced
                            );
                        }, 200);
                    } else if (this.floydVisualizationMode === 'path-tracking') {
                        // Path tracking mode: Show actual shortest paths found so far
                        if (step.next && this.animationState.floydNext) {
                            const dist = this.animationState.floydDist;
                            
                            // Get current shortest path from i to j (before this comparison)
                            const currentPath = this.reconstructFloydPath(step.i, step.j, this.animationState.floydNext, dist);
                            
                            // Draw the via-K path: i->...->k->...->j
                            const pathIK = this.reconstructFloydPath(step.i, step.k, this.animationState.floydNext, dist);
                            const pathKJ = this.reconstructFloydPath(step.k, step.j, this.animationState.floydNext, dist);
                            
                            // Draw current path (might be kept or replaced)
                            if (currentPath && currentPath.length > 1) {
                                this.drawFloydPath(currentPath, '#ba68c8', !willAccept);
                            }
                            
                            // Draw candidate path via K
                            if (pathIK && pathKJ) {
                                const fullPathViaK = [...pathIK.slice(0, -1), ...pathKJ];
                                setTimeout(() => {
                                    this.drawFloydPath(fullPathViaK, '#64b5f6', willAccept);
                                }, 200);
                            }
                        }
                    }
                }
                break;
                
            case 'update':
                if (step.i !== undefined && step.j !== undefined && step.k !== undefined) {
                    // Store next matrix for path reconstruction
                    if (step.next) {
                        this.animationState.floydNext = step.next;
                    }
                    // Store distance matrix to check reachability
                    if (step.dist) {
                        this.animationState.floydDist = step.dist;
                    }
                    
                    // Update comparison cells to highlight the accepted path
                    this.animationState.floydComparisonCells = {
                        ik: [step.i, step.k],  // A->mid (highlight)
                        kj: [step.k, step.j],  // mid->B (highlight)
                        ij: [step.i, step.j],  // A->B (being updated)
                        willAccept: true,
                        updated: true
                    };
                    
                    // Explosion at destination to emphasize improvement
                    if (pos[step.j]) {
                        this.rive.createExplosion(pos[step.j].x, pos[step.j].y, '#4caf50', 8);
                    }
                }
                break;
                
            case 'complete':
                this.animationState.currentNode = null;
                this.animationState.highlightedEdge = null;
                
                // Store final next matrix for Floyd
                if (step.next && this.selectedAlgorithm === 'floyd') {
                    this.animationState.floydNext = step.next;
                }
                // Store final distance matrix for Floyd
                if (step.dist && this.selectedAlgorithm === 'floyd') {
                    this.animationState.floydDist = step.dist;
                }
                
                // Reconstruct all shortest paths for hover
                if (this.animationState.previous) {
                    this.reconstructAllPaths();
                }
                
                // Create subtle celebration effect
                this.graph.nodes.forEach((_, i) => {
                    setTimeout(() => {
                        this.rive.createNodePulse(pos[i].x, pos[i].y, '#4caf50', 1.0);
                    }, i * 50);
                });
                break;
        }
        
        // Update data visualization panels
        this.updateDataPanels(step);
    }
    
    // Reconstruct all shortest paths from the previous array
    reconstructAllPaths() {
        if (!this.animationState.previous) return;
        
        const previous = this.animationState.previous;
        this.shortestPaths = {};
        
        const startNode = parseInt(this.ui.startNode.value);
        
        // For each node, reconstruct path from start
        for (let target = 0; target < this.graph.nodes.length; target++) {
            if (target === startNode || previous[target] === null) continue;
            
            const path = [];
            let current = target;
            
            // Walk backwards from target to start
            while (current !== null && current !== startNode) {
                const prev = previous[current];
                if (prev !== null) {
                    path.push({ from: prev, to: current });
                }
                current = prev;
            }
            
            if (path.length > 0) {
                this.shortestPaths[target] = path.reverse();
            }
        }
    }

    render() {
        const ctx = this.ctx;
        const canvas = this.canvas;
        
        // Draw elegant background gradient
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#f8f9fa');
        gradient.addColorStop(0.5, '#ffffff');
        gradient.addColorStop(1, '#f1f3f5');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Optional: add subtle radial overlay for depth
        const radial = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, 0,
            canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2
        );
        radial.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        radial.addColorStop(1, 'rgba(0, 0, 0, 0.02)');
        
        ctx.fillStyle = radial;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw edges
        this.graph.edges.forEach(edge => {
            this.drawEdge(edge);
        });
        
        // Draw nodes
        this.graph.nodes.forEach((node, i) => {
            this.drawNode(i);
        });
        
        // Floyd path-tracking mode: Show paths from hovered node
        if (this.selectedAlgorithm === 'floyd' && this.floydVisualizationMode === 'path-tracking' && 
            this.hoveredNode !== null && this.animationState.floydNext) {
            this.drawFloydHoverPaths(this.hoveredNode);
        }
        
        // Draw particles (radial rings, pulses, etc.) on top of graph
        this.rive.renderParticles();
    }

    drawEdge(edge) {
        const from = this.nodePositions[edge.from];
        const to = this.nodePositions[edge.to];
        
        // Check if edge is connected to recently released node (within 800ms, subtle wobble only)
        const timeSinceRelease = Date.now() - this.releaseTime;
        const isRecentlyReleased = this.recentlyReleasedNode !== null && 
                                   timeSinceRelease < 800 &&
                                   (edge.from === this.recentlyReleasedNode || 
                                    edge.to === this.recentlyReleasedNode);
        
        // Check if this edge is currently highlighted or explored
        const isHighlighted = this.animationState.highlightedEdge && 
                             this.animationState.highlightedEdge.from === edge.from &&
                             this.animationState.highlightedEdge.to === edge.to;
        
        const isExplored = Array.from(this.animationState.exploredEdges).some(e => 
            e.from === edge.from && e.to === edge.to
        );
        
        const isMST = Array.from(this.animationState.mstEdges || []).some(e => 
            e.from === edge.from && e.to === edge.to
        );
        
        // Check if edge is in hovered path
        const isInHoveredPath = this.hoveredNode !== null && 
                               this.shortestPaths[this.hoveredNode] &&
                               this.shortestPaths[this.hoveredNode].some(e => 
                                   (e.from === edge.from && e.to === edge.to) ||
                                   (!this.graph.directed && e.from === edge.to && e.to === edge.from)
                               );
        
        // Check if edge is in negative cycle
        const isInNegativeCycle = this.negativeCycle &&
                                 this.negativeCycle.some(e => 
                                     (e.from === edge.from && e.to === edge.to) ||
                                     (!this.graph.directed && e.from === edge.to && e.to === edge.from)
                                 );
        
        // Check if edge is in PQ (Prim's algorithm)
        let isInPQ = false;
        let isPQTop = false;
        if (this.animationState.priorityQueue && this.animationState.priorityQueue.length > 0) {
            // For Prim: PQ contains edges (node entries represent edges via parent tracking)
            // We need to reconstruct edges from PQ entries and parent info
            const pqEdges = this.animationState.pqEdges || [];
            isInPQ = pqEdges.some(e => 
                (e.from === edge.from && e.to === edge.to) ||
                (!this.graph.directed && e.from === edge.to && e.to === edge.from)
            );
            isPQTop = pqEdges.length > 0 && 
                     ((pqEdges[0].from === edge.from && pqEdges[0].to === edge.to) ||
                      (!this.graph.directed && pqEdges[0].from === edge.to && pqEdges[0].to === edge.from));
        }
        
        // Check if edge is part of current batch being explored
        const isInBatch = this.animationState.batchEdges && this.animationState.batchEdges.some(e =>
            (e.from === edge.from && e.to === edge.to) ||
            (!this.graph.directed && e.from === edge.to && e.to === edge.from)
        );
        
        const state = {
            highlighted: isHighlighted,
            explored: isExplored,
            mst: isMST,
            released: isRecentlyReleased, // Separate state for subtle wobble without color change
            hoveredPath: isInHoveredPath,  // NEW: part of hovered path
            negativeCycle: isInNegativeCycle,  // NEW: part of negative cycle
            negativeEdge: edge.weight < 0,  // NEW: negative weight edge (not necessarily a cycle)
            inPQ: isInPQ,  // NEW: edge in priority queue (Prim)
            pqTop: isPQTop,  // NEW: edge at top of PQ (Prim)
            inBatch: isInBatch  // NEW: edge in current exploration batch
        };
        
        // Use visual style to draw edge
        this.currentStyle.drawEdge(this.ctx, from, to, state, edge);
        
        // Draw arrow for directed graphs
        if (this.graph.directed) {
            const color = state.mst ? '#ab47bc' : 
                         state.explored ? '#ef5350' : 
                         state.highlighted ? '#42a5f5' : '#90a4ae';
            this.drawArrow(this.ctx, from.x, from.y, to.x, to.y, color);
        }
        
        // Draw weight
        if (this.ui.weightedCheck.checked) {
            const ctx = this.ctx;
            
            // Calculate edge direction and perpendicular offset
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            
            // Perpendicular vector (offset to side)
            const perpX = -dy / len;
            const perpY = dx / len;
            const offset = 15; // Distance from edge center
            
            // Position label to the side of the edge
            const midX = (from.x + to.x) / 2 + perpX * offset;
            const midY = (from.y + to.y) / 2 + perpY * offset;
            
            ctx.save();
            
            // Enhanced background with shadow
            const metrics = ctx.measureText(edge.weight);
            const padding = 6;
            const bgWidth = metrics.width + padding * 2;
            const bgHeight = 16;
            
            // Shadow for depth
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 2;
            
            // Background with rounded corners and gradient
            ctx.fillStyle = state.negativeCycle ? '#dc3545' : 
                           state.hoveredPath ? '#ffc107' :
                           state.mst ? '#ba68c8' : 
                           state.highlighted ? '#64b5f6' : '#fff';
            
            ctx.beginPath();
            ctx.roundRect(
                midX - bgWidth / 2,
                midY - bgHeight / 2,
                bgWidth,
                bgHeight,
                4
            );
            ctx.fill();
            
            // Border
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Text
            ctx.fillStyle = (state.negativeCycle || state.hoveredPath || state.mst || state.highlighted) ? '#fff' : '#333';
            ctx.font = '600 11px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(edge.weight, midX, midY);
            
            ctx.restore();
        }
    }

    drawArrow(ctx, fromX, fromY, toX, toY, color) {
        const angle = Math.atan2(toY - fromY, toX - fromX);
        const arrowLength = 15;
        const arrowWidth = 8;
        
        // Adjust end point to node edge
        const adjustedToX = toX - Math.cos(angle) * this.nodeRadius;
        const adjustedToY = toY - Math.sin(angle) * this.nodeRadius;
        
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(adjustedToX, adjustedToY);
        ctx.lineTo(
            adjustedToX - arrowLength * Math.cos(angle - Math.PI / 6),
            adjustedToY - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            adjustedToX - arrowLength * Math.cos(angle + Math.PI / 6),
            adjustedToY - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    drawNode(nodeId) {
        const pos = this.nodePositions[nodeId];
        
        if (!pos) return;
        
        // Determine node state (including Floyd-Warshall highlighting and Prim visited)
        const isFloydK = this.animationState.floydK === nodeId;
        const isFloydI = this.animationState.floydI === nodeId;
        const isFloydJ = this.animationState.floydJ === nodeId;
        const isPrimVisited = this.animationState.primVisitedNodes?.has(nodeId) || false;
        
        // Kruskal: determine which set this node belongs to (use consistent colorIndex)
        let kruskalSetIndex = -1;
        if (this.animationState.unionFindSets && this.selectedAlgorithm === 'kruskal') {
            const setInfo = this.animationState.unionFindSets.find(set => set.nodes.includes(nodeId));
            if (setInfo) {
                kruskalSetIndex = setInfo.colorIndex; // Use persistent color index
            }
        }
        
        // SPFA: check if node is in queue or was just popped
        const isInSpfaQueue = this.animationState.spfaQueue?.includes(nodeId) || false;
        const isSpfaPopped = this.animationState.spfaPoppedNode === nodeId;
        
        const state = {
            current: this.animationState.currentNode === nodeId || isFloydK,
            visited: this.animationState.visitedNodes.has(nodeId),
            primVisited: isPrimVisited,  // Prim: nodes in MST (purple)
            kruskalSetIndex: kruskalSetIndex, // Kruskal: color by set
            spfaInQueue: isInSpfaQueue,  // SPFA: node in queue (cyan)
            spfaPopped: isSpfaPopped,    // SPFA: just popped (green, processing)
            floydK: isFloydK,      // Intermediate node (yellow, largest)
            floydI: isFloydI,      // From node (blue)
            floydJ: isFloydJ       // To node (purple)
        };
        
        // Use visual style to draw node (much larger for Floyd nodes)
        const radius = isFloydK ? this.nodeRadius * 1.4 :          // K: 40% larger
                      (isFloydI || isFloydJ) ? this.nodeRadius * 1.25 : // I,J: 25% larger
                      this.nodeRadius;
        this.currentStyle.drawNode(this.ctx, pos.x, pos.y, radius, state, nodeId);
        
        // Draw circle indicator around start node
        const startNode = parseInt(this.ui.startNode.value);
        if (nodeId === startNode) {
            this.ctx.save();
            this.ctx.strokeStyle = '#4caf50';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, radius + 8, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            this.ctx.restore();
        }
        
        // Draw batch indicators (triangles)
        // Downward triangle on current node being explored (positioned to the left to avoid label)
        if (this.animationState.batchNode === nodeId) {
            this.ctx.save();
            this.ctx.fillStyle = '#90caf9';
            this.ctx.strokeStyle = '#1976d2';
            this.ctx.lineWidth = 2;
            const triangleSize = 8;
            const offset = radius + 10;
            this.ctx.beginPath();
            // Downward triangle (point down) - positioned left
            this.ctx.moveTo(pos.x - offset - triangleSize / 2, pos.y);
            this.ctx.lineTo(pos.x - offset, pos.y - triangleSize / 2);
            this.ctx.lineTo(pos.x - offset, pos.y + triangleSize / 2);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();
        }
        
        // Upward triangles on neighbors being explored (positioned to the right to avoid label)
        if (this.animationState.batchNeighbors && this.animationState.batchNeighbors.has(nodeId)) {
            this.ctx.save();
            this.ctx.fillStyle = '#81c784';
            this.ctx.strokeStyle = '#388e3c';
            this.ctx.lineWidth = 2;
            const triangleSize = 8;
            const offset = radius + 10;
            this.ctx.beginPath();
            // Upward triangle (point up) - positioned right
            this.ctx.moveTo(pos.x + offset + triangleSize / 2, pos.y);
            this.ctx.lineTo(pos.x + offset, pos.y - triangleSize / 2);
            this.ctx.lineTo(pos.x + offset, pos.y + triangleSize / 2);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();
        }
        
        // Floyd-Warshall triangle indicators
        // I and J nodes get small triangles to show path direction
        if (this.animationState.floydI === nodeId && this.selectedAlgorithm === 'floyd') {
            this.ctx.save();
            this.ctx.fillStyle = '#64b5f6';
            this.ctx.strokeStyle = '#1976d2';
            this.ctx.lineWidth = 2;
            const triangleSize = 7;
            const offset = radius + 10;
            this.ctx.beginPath();
            // Right-pointing triangle (source)
            this.ctx.moveTo(pos.x + offset, pos.y);
            this.ctx.lineTo(pos.x + offset + triangleSize, pos.y - triangleSize / 2);
            this.ctx.lineTo(pos.x + offset + triangleSize, pos.y + triangleSize / 2);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();
        }
        
        if (this.animationState.floydJ === nodeId && this.selectedAlgorithm === 'floyd') {
            this.ctx.save();
            this.ctx.fillStyle = '#ba68c8';
            this.ctx.strokeStyle = '#7b1fa2';
            this.ctx.lineWidth = 2;
            const triangleSize = 7;
            const offset = radius + 10;
            this.ctx.beginPath();
            // Left-pointing triangle (destination)
            this.ctx.moveTo(pos.x - offset, pos.y);
            this.ctx.lineTo(pos.x - offset - triangleSize, pos.y - triangleSize / 2);
            this.ctx.lineTo(pos.x - offset - triangleSize, pos.y + triangleSize / 2);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();
        }
        
        // Draw distance label (for shortest path algorithms)
        if (this.animationState.distances[nodeId] !== undefined && 
            this.animationState.distances[nodeId] !== Infinity &&
            ['dijkstra', 'bellman', 'spfa'].includes(this.selectedAlgorithm)) {
            const ctx = this.ctx;
            ctx.save();
            ctx.fillStyle = '#333';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.font = 'bold 12px JetBrains Mono';
            ctx.textAlign = 'center';
            
            const distance = this.animationState.distances[nodeId];
            ctx.strokeText(distance, pos.x, pos.y - this.nodeRadius - 10);
            ctx.fillText(distance, pos.x, pos.y - this.nodeRadius - 10);
            ctx.restore();
        }
    }

    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Check if clicked on a node
        for (let i = 0; i < this.nodePositions.length; i++) {
            const pos = this.nodePositions[i];
            const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
            
            if (dist <= this.nodeRadius) {
                // Update start node
                this.ui.startNode.value = i;
                this.reset();
                this.rive.createExplosion(pos.x, pos.y, '#4caf50', 12);
                break;
            }
        }
    }

    updateAlgorithmInfo() {
        const info = {
            dijkstra: {
                title: "Dijkstra's Algorithm",
                description: "Finds the shortest path from a source node to all other nodes using a greedy approach with a priority queue. Always picks the unvisited node with smallest distance.",
                howItWorks: "Maintains a min-heap PQ of (node, distance) pairs. Pops minimum, relaxes neighbors, adds to PQ. Accepts first pop of each node (subsequent pops are stale).",
                colorLegend: {
                    "Green edge": "Adding to PQ / Successfully relaxed",
                    "Blue edge": "Currently exploring",
                    "Red edge": "Updated distance (will fade)"
                },
                complexity: "Time: O((V+E)log V)"
            },
            prim: {
                title: "Prim's Algorithm (Lazy)",
                description: "Builds MST by growing tree one edge at a time. Starts from any node, always adds minimum weight edge connecting tree to non-tree nodes. Uses lazy deletion.",
                howItWorks: "Uses PQ of (node, edge_weight) but allows duplicate entries. When popping, checks if node already in MST (internal edge) and skips it. Simpler but has stale entries.",
                comparison: "vs Optimized: Allows duplicate PQ entries (lazy), so we may pop internal edges that are already connected to MST by other paths. Still correct but does more work.",
                colorLegend: {
                    "Purple edge": "In MST (accepted)",
                    "Green edge (solid)": "Just added to PQ (animation)",
                    "Light green (dashed)": "Currently in PQ (waiting to be popped)",
                    "Green (top of PQ)": "Top of PQ (will be popped next)",
                    "Red crossed": "Internal edge (rejected - already in MST)"
                },
                complexity: "Time: O((V+E)log V)"
            },
            'prim-optimized': {
                title: "Prim's Algorithm (Optimized)",
                description: "Optimized Prim's MST using eager update with decreaseKey. Maintains best edge to each non-tree node. No stale/duplicate entries in PQ.",
                howItWorks: "Uses key array to track minimum edge weight to each node. When finding better edge, uses decreaseKey to update PQ instead of inserting duplicate. Some edges never enter PQ if worse than current key.",
                comparison: "vs Lazy: Never has stale entries. Uses decreaseKey to update existing PQ entries. More efficient with fewer PQ operations. Some edges get rejected immediately without entering PQ.",
                colorLegend: {
                    "Purple edge": "In MST (accepted)",
                    "Green edge": "Adding to PQ",
                    "Orange edge": "Updating in PQ (decreaseKey)",
                    "Light red": "Rejected (weight ≥ current key, never in PQ)",
                    "🔑 Keys": "Min cost to reach each node (orange glow = just changed)"
                },
                complexity: "Time: O((V+E)log V)"
            },
            kruskal: {
                title: "Kruskal's Algorithm",
                description: "Builds MST by sorting all edges and adding them in order of weight, using Union-Find to detect and avoid cycles.",
                howItWorks: "Sort all edges by weight. Process each edge: if endpoints in different sets, add edge to MST and union the sets. Skip if endpoints already connected (would create cycle).",
                colorLegend: {
                    "Purple edge": "In MST (accepted)",
                    "Node colors": "Union-Find sets (same color = same set)"
                },
                complexity: "Time: O(E log E)"
            },
            bellman: {
                title: "Bellman-Ford Algorithm",
                description: "Finds shortest paths from source to all nodes. Works with negative weights. Relaxes ALL edges V-1 times.",
                howItWorks: "For V-1 iterations, check every edge and relax if better path found. After V-1 iterations, do one more pass to detect negative cycles.",
                comparison: "vs SPFA: Bellman-Ford checks all edges every iteration (even if no change). Simple but slower. Guaranteed O(VE).",
                colorLegend: {
                    "Blue edge": "Currently checking",
                    "Red edge": "Relaxed (improved distance)"
                },
                complexity: "Time: O(VE)"
            },
            spfa: {
                title: "SPFA (Shortest Path Faster Algorithm)",
                description: "Optimized Bellman-Ford using a queue. Only processes nodes whose distance changed. Much faster in practice.",
                howItWorks: "Maintains queue of nodes to process. When node's distance improves, enqueue it. Only relax edges from nodes in queue. Often faster than Dijkstra on dense graphs with negative edges.",
                comparison: "vs Bellman-Ford: Only checks edges from nodes whose distance changed (in queue). Average O(E) vs O(VE). Still detects negative cycles.",
                colorLegend: {
                    "Blue edge": "Currently exploring",
                    "Red edge": "Relaxed (improved distance)",
                    "Cyan node": "In queue (pending)",
                    "Green node": "Just dequeued (processing)"
                },
                complexity: "Time: O(VE) worst, O(E) average"
            },
            floyd: {
                title: "Floyd-Warshall Algorithm",
                description: "Computes shortest paths between ALL pairs of vertices using dynamic programming. Tries each vertex as intermediate.",
                howItWorks: "For each intermediate vertex k, check if path i→k→j is shorter than direct i→j. Updates distance matrix in-place.",
                colorLegend: {
                    "Yellow node (largest)": "Intermediate vertex K",
                    "Blue node": "From vertex I",
                    "Purple node": "To vertex J",
                    "Matrix cell": "Current shortest distance i→j"
                },
                complexity: "Time: O(V³)"
            }
        };
        
        const algoData = info[this.selectedAlgorithm];
        let html = `
            <p><strong>${algoData.title}</strong></p>
            <p style="font-size: 13px; line-height: 1.4;">${algoData.description}</p>
        `;
        
        if (algoData.howItWorks) {
            html += `<p style="font-size: 14px; color: #838383ff; margin-top: 8px; line-height: 1.4;"><strong>How it works:</strong> ${algoData.howItWorks}</p>`;
        }
        
        if (algoData.comparison) {
            html += `<p style="font-size: 12px; color: #0066cc; margin-top: 8px; line-height: 1.4;"><strong>📊 ${algoData.comparison}</strong></p>`;
        }
        
        if (algoData.colorLegend) {
            html += `<div style="margin-top: 10px; padding: 8px; background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04)); border: 1px solid rgba(212, 175, 55, 0.25); border-radius: 4px; font-size: 11px; backdrop-filter: blur(5px);">
                <strong style="color: var(--gold-light); text-shadow: 0 0 8px rgba(212, 175, 55, 0.4);">🎨 Color Legend:</strong><br>`;
            for (const [label, meaning] of Object.entries(algoData.colorLegend)) {
                html += `<div style="margin-top: 4px; margin-left: 8px;"><span style="color: var(--text-primary); text-shadow: 0 0 6px rgba(212, 175, 55, 0.2);">• <strong>${label}:</strong></span> <span style="color: var(--text-secondary);">${meaning}</span></div>`;
            }
            html += `</div>`;
        }
        
        html += `<p class="complexity" style="margin-top: 10px;">${algoData.complexity}</p>`;
        
        this.ui.algoInfo.innerHTML = html;
    }
    
    // Mouse handling for dragging
    handleMouseDown(e) {
        if (this.classicLayout) return; // No dragging in classic mode
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Check if clicked on a node
        for (let i = 0; i < this.nodePositions.length; i++) {
            const pos = this.nodePositions[i];
            const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
            
            if (dist <= this.nodeRadius) {
                this.draggedNode = i;
                this.isDragging = true;
                this.canvas.classList.add('dragging');
                break;
            }
        }
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.mousePos = { x, y };
        
        if (this.isDragging && this.draggedNode !== null) {
            this.nodePositions[this.draggedNode].x = x;
            this.nodePositions[this.draggedNode].y = y;
        } else {
            // Check if hovering over a node
            let foundNode = null;
            for (let i = 0; i < this.nodePositions.length; i++) {
                const pos = this.nodePositions[i];
                const dx = x - pos.x;
                const dy = y - pos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist <= this.nodeRadius) {
                    foundNode = i;
                    break;
                }
            }
            
            if (this.hoveredNode !== foundNode) {
                this.hoveredNode = foundNode;
                this.render(); // Re-render to show path highlight
            }
        }
    }
    
    handleMouseUp(e) {
        if (this.draggedNode !== null) {
            this.recentlyReleasedNode = this.draggedNode;
            this.releaseTime = Date.now();
        }
        
        this.isDragging = false;
        this.draggedNode = null;
        this.canvas.classList.remove('dragging');
    }
    
    // Physics animation loop
    startPhysicsLoop() {
        const animate = () => {
            if (this.physicsEnabled && this.nodePositions.length > 0) {
                const bounds = {
                    width: this.canvas.width,
                    height: this.canvas.height
                };
                this.physics.applyForces(
                    this.nodePositions,
                    this.graph.edges,
                    this.draggedNode,
                    this.mousePos,
                    bounds
                );
            }
            
            // Update particle effects (radial rings, etc.)
            this.rive.updateParticles();
            
            this.render();
            requestAnimationFrame(animate);
        };
        animate();
    }
    
    // Update data visualization panels
    updateDataPanels(step) {
        // Update distance table
        if (step.distances && this.ui.distancePanel.style.display !== 'none') {
            // Track most recently updated node for persistent highlighting
            if (step.neighbor !== undefined) {
                this.animationState.lastUpdatedNode = step.neighbor;
            }
            
            let html = '';
            step.distances.forEach((dist, i) => {
                const val = dist === Infinity ? '∞' : dist;
                const isUpdated = (this.animationState.lastUpdatedNode === i);
                const cls = isUpdated ? 'updated' : dist === Infinity ? 'infinity' : '';
                html += `<div class="table-cell ${cls}">Node ${i}: ${val}</div>`;
            });
            this.ui.distanceTable.innerHTML = html;
        }
        
        // Update SPFA queue
        if (step.queue && this.ui.queuePanel.style.display !== 'none') {
            let html = '';
            step.queue.forEach((node, idx) => {
                html += `<div class="queue-item ${idx === 0 ? 'front' : ''}">${node}</div>`;
            });
            this.ui.queueContent.innerHTML = html || '<div style="color:#999;">Queue empty</div>';
        }
        
        // Update Floyd matrix
        if (step.dist && this.ui.floydPanel.style.display !== 'none') {
            const n = step.dist.length;
            let html = '<table class="matrix-table"><thead><tr><th></th>';
            for (let j = 0; j < n; j++) html += `<th>${j}</th>`;
            html += '</tr></thead><tbody>';
            
            // Get comparison cells from animation state
            const compCells = this.animationState.floydComparisonCells;
            
            for (let i = 0; i < n; i++) {
                html += `<tr><th>${i}</th>`;
                for (let j = 0; j < n; j++) {
                    const val = step.dist[i][j] === Infinity ? '∞' : step.dist[i][j];
                    let cls = step.dist[i][j] === Infinity ? 'infinity' : '';
                    
                    // Highlight cells based on comparison state
                    if (compCells) {
                        const isIK = compCells.ik && i === compCells.ik[0] && j === compCells.ik[1];
                        const isKJ = compCells.kj && i === compCells.kj[0] && j === compCells.kj[1];
                        const isIJ = compCells.ij && i === compCells.ij[0] && j === compCells.ij[1];
                        
                        if (compCells.updated) {
                            // After update: highlight A->mid and mid->B (accepted path)
                            if (isIK || isKJ) cls += ' floyd-accepted';
                            if (isIJ) cls += ' floyd-updated';
                        } else if (compCells.willAccept) {
                            // Comparison showing acceptance: highlight all three
                            if (isIK || isKJ) cls += ' floyd-accept-candidate';
                            if (isIJ) cls += ' floyd-compare-current';
                        } else {
                            // Comparison showing rejection: show what we're comparing
                            if (isIK || isKJ) cls += ' floyd-reject-candidate';
                            if (isIJ) cls += ' floyd-keep';
                        }
                    }
                    
                    html += `<td class="${cls}">${val}</td>`;
                }
                html += '</tr>';
            }
            html += '</tbody></table>';
            this.ui.floydMatrix.innerHTML = html;
        }
        
        // Update comparison view
        if (step.type === 'explore' || step.type === 'compare') {
            if (this.ui.comparisonPanel.style.display !== 'none') {
                let html = '';
                if (step.currentDist !== undefined && step.neighborDist !== undefined) {
                    html = `
                        <div class="comparison-item">
                            <div><span class="comparison-label">Current</span><br>
                            <span class="comparison-value">${step.currentDist === Infinity ? '∞' : step.currentDist}</span></div>
                            <div class="comparison-operator">+</div>
                            <div><span class="comparison-label">Weight</span><br>
                            <span class="comparison-value">${step.weight}</span></div>
                            <div class="comparison-operator">&lt;</div>
                            <div><span class="comparison-label">Neighbor</span><br>
                            <span class="comparison-value">${step.neighborDist === Infinity ? '∞' : step.neighborDist}</span></div>
                        </div>
                    `;
                } else if (step.directDist !== undefined && step.viaDist !== undefined) {
                    const distIK = step.distIK === Infinity ? '∞' : step.distIK;
                    const distKJ = step.distKJ === Infinity ? '∞' : step.distKJ;
                    const directDist = step.directDist === Infinity ? '∞' : step.directDist;
                    const viaDist = step.viaDist === Infinity ? '∞' : step.viaDist;
                    
                    html = `
                        <div class="comparison-item">
                            <div><span class="comparison-label">dist[${step.i}][${step.k}]</span><br>
                            <span class="comparison-value">${distIK}</span></div>
                            <div class="comparison-operator">+</div>
                            <div><span class="comparison-label">dist[${step.k}][${step.j}]</span><br>
                            <span class="comparison-value">${distKJ}</span></div>
                            <div class="comparison-operator">=</div>
                            <div><span class="comparison-label">Via ${step.k}</span><br>
                            <span class="comparison-value">${viaDist}</span></div>
                            <div class="comparison-operator">${step.viaDist < step.directDist ? '<' : '≥'}</div>
                            <div><span class="comparison-label">dist[${step.i}][${step.j}]</span><br>
                            <span class="comparison-value">${directDist}</span></div>
                        </div>
                    `;
                }
                this.ui.comparisonContent.innerHTML = html;
            }
        }
        
        // Update MST edges
        if (step.mstEdges && this.ui.mstPanel.style.display !== 'none') {
            let html = '';
            let totalWeight = 0;
            step.mstEdges.forEach(edge => {
                totalWeight += edge.weight;
                html += `<div class="mst-edge-item">
                    <span class="mst-edge-nodes">${edge.from} - ${edge.to}</span>
                    <span class="mst-edge-weight">${edge.weight}</span>
                </div>`;
            });
            html += `<div style="margin-top:12px; padding:8px; background:linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05)); border:1px solid rgba(212, 175, 55, 0.3); border-radius:6px; font-weight:700; text-align:center; color: var(--gold-light); text-shadow: 0 0 10px rgba(212, 175, 55, 0.5);">
                Total: ${totalWeight}
            </div>`;
            this.ui.mstEdges.innerHTML = html;
        }
        
        // Update priority queue (Dijkstra/Prim)
        if (step.priorityQueue && this.ui.pqPanel.style.display !== 'none') {
            let html = '';
            const isPrim = this.selectedAlgorithm === 'prim' || this.selectedAlgorithm === 'prim-optimized';
            
            step.priorityQueue.forEach((entry, idx) => {
                const isTop = idx === 0; // First entry is top of min-heap
                const staleClass = entry.stale ? ' stale' : '';
                const poppedClass = entry.popped ? ' popped' : '';
                const topClass = isTop ? ' pq-top' : '';
                
                const label = isPrim ? 'weight' : 'dist';
                const value = isPrim ? entry.key : entry.distance;
                
                html += `<div class="pq-item${staleClass}${poppedClass}${topClass}">
                    <span class="pq-node">Node ${entry.node}</span>
                    <span class="pq-distance">${label}: ${value}</span>
                    ${isTop ? '<span class="pq-label pq-label-top">⬆ TOP</span>' : ''}
                    ${entry.stale ? '<span class="pq-label">stale</span>' : ''}
                    ${entry.popped ? '<span class="pq-label">popped</span>' : ''}
                </div>`;
            });
            this.ui.pqContent.innerHTML = html || '<div style="color: #ffaa44; font-size: 1.1rem; font-weight: 700; text-shadow: 0 0 15px rgba(255, 170, 68, 0.8); text-align: center; padding: 12px;">PQ Empty</div>';
            
            // Add popped log below PQ (for Dijkstra and Prim)
            if (this.animationState.poppedLog && this.animationState.poppedLog.length > 0) {
                let logHtml = '<div style="margin-top:12px; padding:8px; background:#f5f5f5; border-radius:6px;">';
                logHtml += '<div style="font-weight:600; color:#666; margin-bottom:6px; font-size:11px;">POPPED LOG:</div>';
                
                this.animationState.poppedLog.forEach((entry, idx) => {
                    const isAccepted = entry.status === 'accepted';
                    const isStale = entry.status === 'stale';
                    const isRejected = entry.status === 'rejected';
                    
                    const bgColor = isAccepted ? '#c8e6c9' : (isStale || isRejected) ? '#ffcdd2' : '#fff';
                    const textColor = isAccepted ? '#2e7d32' : (isStale || isRejected) ? '#c62828' : '#333';
                    const opacity = (isStale || isRejected) ? '0.7' : '1';
                    const textDecoration = (isStale || isRejected) ? 'line-through' : 'none';
                    
                    const label = isPrim ? 'w' : 'd';
                    const value = isPrim ? entry.weight : entry.distance;
                    
                    let statusBadge = '';
                    if (isAccepted) {
                        statusBadge = '<span style="background:#4caf50; color:white; padding:2px 4px; border-radius:3px; font-size:9px; margin-left:4px;">✓</span>';
                    } else if (isStale) {
                        statusBadge = '<span style="background:#f44336; color:white; padding:2px 4px; border-radius:3px; font-size:9px; margin-left:4px;">STALE</span>';
                    } else if (isRejected) {
                        const reason = entry.reason || '';
                        const reasonText = reason === 'never in PQ' ? 'NEVER IN PQ' : 'INTERNAL';
                        statusBadge = `<span style="background:#f44336; color:white; padding:2px 4px; border-radius:3px; font-size:9px; margin-left:4px;">${reasonText}</span>`;
                    }
                    
                    logHtml += `<div style="padding:4px 6px; margin:2px 0; background:${bgColor}; border-radius:4px; opacity:${opacity}; text-decoration:${textDecoration};">
                        <span style="color:${textColor}; font-size:11px; font-weight:600;">
                            ${idx + 1}. Node ${entry.node} (${label}:${value})${statusBadge}
                        </span>
                    </div>`;
                });
                
                logHtml += '</div>';
                this.ui.pqContent.innerHTML += logHtml;
            }
        }
        
        // Update union-find sets (Kruskal) with color coding
        if (step.unionFindSets && this.ui.mstPanel.style.display !== 'none') {
            const colors = [
                '#4caf50', '#2196f3', '#ff9800', '#9c27b0', 
                '#f44336', '#00bcd4', '#ffeb3b', '#795548'
            ];
            
            let setsHtml = '<div class="union-find-sets">';
            step.unionFindSets.forEach((setInfo, idx) => {
                const color = colors[setInfo.colorIndex % colors.length];
                setsHtml += `<div class="uf-set" style="border-left-color: ${color}; box-shadow: -2px 0 8px ${color}60, 0 0 12px ${color}30;">
                    <span class="uf-set-label" style="color:${color}; font-weight:700; text-shadow: 0 0 12px ${color}80;">Set ${idx + 1} (${setInfo.size}):</span>
                    <span class="uf-set-nodes" style="color:${color}; font-weight:700; text-shadow: 0 0 15px ${color}99;">{${setInfo.nodes.join(', ')}}</span>
                </div>`;
            });
            setsHtml += '</div>';
            
            // Insert before MST edges
            const existingEdges = this.ui.mstEdges.innerHTML;
            this.ui.mstEdges.innerHTML = setsHtml + (step.mstEdges && step.mstEdges.length > 0 ? 
                '<div style="margin-top:12px; font-weight:600; color:#d4af37; text-shadow: 0 0 8px rgba(212, 175, 55, 0.5);">MST Edges:</div>' + 
                existingEdges : '');
        }
        
        // Update Prim Optimized key array (min cost to reach each node)
        if (step.keyArray && this.selectedAlgorithm === 'prim-optimized' && this.ui.mstPanel.style.display !== 'none') {
            // Track key changes for highlighting
            const prevKeyArray = this.animationState.prevKeyArray || new Array(step.keyArray.length).fill(Infinity);
            const changedNodes = new Set();
            step.keyArray.forEach((cost, node) => {
                if (cost !== prevKeyArray[node]) {
                    changedNodes.add(node);
                }
            });
            this.animationState.prevKeyArray = [...step.keyArray];
            
            // Clear old change highlights after a few steps
            if (step.type === 'pq_pop' || step.type === 'add_to_mst') {
                this.animationState.lastKeyChanges = changedNodes;
            }
            
            let keyHtml = '<div style="margin-bottom:12px; padding:8px; background:#f0f4ff; border-radius:6px;">';
            keyHtml += '<div style="font-weight:600; color:#1976d2; margin-bottom:6px;">🔑 Min Cost Keys:</div>';
            keyHtml += '<div style="display:flex; flex-wrap:wrap; gap:6px;">';
            step.keyArray.forEach((cost, node) => {
                const inMST = step.inMST && step.inMST[node];
                const wasChanged = changedNodes.has(node) && !inMST;
                
                let bgColor = inMST ? '#c8e6c9' : (cost === Infinity ? '#fafafa' : '#fff3cd');
                let textColor = inMST ? '#2e7d32' : (cost === Infinity ? '#999' : '#856404');
                let borderStyle = '';
                
                // Highlight recently changed keys with a glow
                if (wasChanged) {
                    borderStyle = 'border: 2px solid #ff9800; box-shadow: 0 0 8px rgba(255, 152, 0, 0.5);';
                    bgColor = '#ffe0b2';
                    textColor = '#e65100';
                }
                
                keyHtml += `<div style="padding:4px 8px; background:${bgColor}; border-radius:4px; font-size:12px; color:${textColor}; font-weight:600; ${borderStyle}">
                    ${node}: ${cost === Infinity ? '∞' : cost}
                </div>`;
            });
            keyHtml += '</div></div>';
            
            // Prepend to MST panel
            this.ui.mstEdges.innerHTML = keyHtml + this.ui.mstEdges.innerHTML;
        }
        
        // Update edge tracking (considered/rejected) for optimized Prim
        if ((step.consideredEdges || step.rejectedEdges) && this.selectedAlgorithm === 'prim-optimized' && this.ui.mstPanel.style.display !== 'none') {
            let edgeTrackHtml = '<div style="margin-bottom:12px; padding:8px; background:#fff8e1; border-radius:6px;">';
            
            // Rejected edges
            if (step.rejectedEdges && step.rejectedEdges.length > 0) {
                edgeTrackHtml += '<div style="margin-bottom:6px;">';
                edgeTrackHtml += '<div style="font-weight:600; color:#d32f2f; margin-bottom:4px;">✗ Rejected Edges:</div>';
                edgeTrackHtml += '<div style="display:flex; flex-wrap:wrap; gap:4px;">';
                step.rejectedEdges.forEach(edge => {
                    edgeTrackHtml += `<div style="padding:3px 6px; background:#ffcdd2; border-radius:3px; font-size:11px; color:#c62828;">
                        ${edge.from}→${edge.to} (${edge.weight} ≥ ${edge.currentKey === Infinity ? '∞' : edge.currentKey})
                    </div>`;
                });
                edgeTrackHtml += '</div></div>';
            }
            
            edgeTrackHtml += '</div>';
            
            // Prepend to MST panel
            this.ui.mstEdges.innerHTML = edgeTrackHtml + this.ui.mstEdges.innerHTML;
        }
    }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
    window.visualizer = new GraphVisualizer();
});
