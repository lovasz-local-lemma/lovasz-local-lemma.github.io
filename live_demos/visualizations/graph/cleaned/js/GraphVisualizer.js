/**
 * Graph Visualizer - Main Application
 * Integrates all refactored modules
 */

import { COLORS, NODE, ANIMATION, ALGORITHMS, VISUAL_STYLES, FLOYD_MODES } from './core/Constants.js';
import { calculateDistance, isPointInCircle } from './core/Utils.js';
import { Graph } from './core/Graph.js';
import { FloydWarshall } from './algorithms/FloydWarshall.js';
import { Dijkstra } from './algorithms/Dijkstra.js';
import { BellmanFord } from './algorithms/BellmanFord.js';
import { SPFA } from './algorithms/SPFA.js';
import { Prim } from './algorithms/Prim.js';
import { PrimUnoptimized } from './algorithms/PrimUnoptimized.js';
import { Kruskal } from './algorithms/Kruskal.js';
import { ParticleSystem } from './visualization/ParticleSystem.js';
import { ModeManager } from './visualization/modes/ModeManager.js';

export class GraphVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Initialize graph
        this.graph = new Graph();
        this.hoveredNode = null;
        this.selectedAlgorithm = null;
        
        // Visual preferences
        this.visualStyle = VISUAL_STYLES.GLOSSY_3D;
        this.showDistances = true; // Persistent distance display
        
        // Visualization systems
        this.particles = new ParticleSystem(this.ctx);
        this.modeManager = new ModeManager();
        
        // Set default Floyd mode to path tracking
        this.modeManager.setMode(FLOYD_MODES.PATH_TRACKING);
        
        // Algorithm registry
        this.algorithms = {
            [ALGORITHMS.FLOYD_WARSHALL]: new FloydWarshall(),
            [ALGORITHMS.DIJKSTRA]: new Dijkstra(),
            [ALGORITHMS.BELLMAN_FORD]: new BellmanFord(),
            [ALGORITHMS.SPFA]: new SPFA(),
            [ALGORITHMS.PRIM]: new Prim(),
            [ALGORITHMS.PRIM_UNOPTIMIZED]: new PrimUnoptimized(),
            [ALGORITHMS.KRUSKAL]: new Kruskal()
        };
        
        // Animation state
        this.animationState = {
            isPlaying: false,
            currentStep: 0,
            steps: [],
            speed: ANIMATION.DEFAULT_SPEED,
            algorithmGenerator: null,
            floydNext: null,
            floydDist: null,
            floydK: null,
            floydI: null,
            floydJ: null,
            distances: null,
            visited: null
        };
        
        // UI state
        this.selectedAlgorithm = null;
        this.hoveredNode = null;
        this.selectedNode = null;
        
        // Setup
        this.setupEventListeners();
        this.resizeCanvas();
        this.startRenderLoop();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Canvas events
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        
        // Window events
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    /**
     * Resize canvas to match container
     */
    resizeCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    }

    /**
     * Get mouse position relative to canvas
     */
    getMousePos(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    /**
     * Handle mouse move
     */
    handleMouseMove(event) {
        const pos = this.getMousePos(event);
        const previousHovered = this.hoveredNode;
        
        this.hoveredNode = this.findNodeAt(pos.x, pos.y);
        
        if (previousHovered !== this.hoveredNode) {
            this.render();
        }
    }

    /**
     * Handle click
     */
    handleClick(event) {
        const pos = this.getMousePos(event);
        const clickedNode = this.findNodeAt(pos.x, pos.y);
        
        if (clickedNode !== null) {
            this.selectedNode = clickedNode;
            this.render();
        }
    }

    /**
     * Find node at position
     */
    findNodeAt(x, y) {
        for (let i = 0; i < this.graph.nodes.length; i++) {
            const node = this.graph.nodes[i];
            if (isPointInCircle(x, y, node.x, node.y, NODE.RADIUS)) {
                return i;
            }
        }
        return null;
    }

    /**
     * Load graph data
     */
    loadGraph(graphData) {
        this.graph = new Graph();
        
        // Add nodes
        graphData.nodes.forEach((node, index) => {
            this.graph.addNode(index, node.x, node.y);
        });
        
        // Add edges
        graphData.edges.forEach(edge => {
            this.graph.addEdge(edge.from, edge.to, edge.weight);
        });
        
        this.graph.directed = graphData.directed || false;
        
        this.render();
    }

    /**
     * Start algorithm execution
     */
    startAlgorithm(algorithmName, options = {}) {
        this.selectedAlgorithm = algorithmName;
        
        const algorithm = this.algorithms[algorithmName];
        if (!algorithm) {
            console.error(`Unknown algorithm: ${algorithmName}`);
            return;
        }
        
        // Reset animation state
        this.animationState.currentStep = 0;
        this.animationState.steps = [];
        
        // Create generator
        this.animationState.algorithmGenerator = algorithm.execute(this.graph, options);
        
        // Collect all steps
        for (const step of this.animationState.algorithmGenerator) {
            this.animationState.steps.push(step);
        }
        
        // Reset for playback
        this.animationState.currentStep = 0;
        this.animationState.isPlaying = false;
        
        // Process first step
        if (this.animationState.steps.length > 0) {
            this.processStep(this.animationState.steps[0]);
        }
        
        this.render();
    }

    /**
     * Process algorithm step
     */
    processStep(step) {
        if (!step) return;
        
        const speedMultiplier = this.animationState.speed / 2;
        
        // Update animation state based on step type
        if (step.distances) {
            this.animationState.distances = step.distances;
        }
        
        if (step.visited) {
            this.animationState.visited = step.visited;
        }
        
        // Floyd-Warshall specific
        if (this.selectedAlgorithm === ALGORITHMS.FLOYD_WARSHALL) {
            this.processFloydStep(step, speedMultiplier);
        } else {
            // Other algorithms (Dijkstra, Bellman-Ford, SPFA)
            this.processOtherAlgorithmStep(step, speedMultiplier);
        }
    }

    /**
     * Process step for Dijkstra, Bellman-Ford, SPFA, Prim, Kruskal
     */
    processOtherAlgorithmStep(step, speedMultiplier) {
        const { type } = step;

        // Update spinning circle indicator for current node
        if (step.current !== undefined) {
            const node = this.graph.nodes[step.current];
            if (node) {
                this.particles.getOrCreateSpinningCircle(
                    node.x, node.y, 
                    NODE.RADIUS + 10, 
                    COLORS.CURRENT, 
                    speedMultiplier
                );
            }
        }

        // Visit node
        if (type === 'visit' && step.current !== undefined) {
            const node = this.graph.nodes[step.current];
            if (node) {
                this.particles.createPulse(node.x, node.y, COLORS.VISITED, 1.0, speedMultiplier);
            }
        }

        // Explore edge
        if (type === 'explore' && step.current !== undefined && step.neighbor !== undefined) {
            const fromNode = this.graph.nodes[step.current];
            const toNode = this.graph.nodes[step.neighbor];
            if (fromNode && toNode) {
                // Create pulse at neighbor
                this.particles.createPulse(toNode.x, toNode.y, COLORS.NEIGHBOR, 0.6, speedMultiplier);
            }
        }

        // Relax edge (successful update)
        if (type === 'relax' && step.current !== undefined && step.neighbor !== undefined) {
            const fromNode = this.graph.nodes[step.current];
            const toNode = this.graph.nodes[step.neighbor];
            if (fromNode && toNode) {
                // Create green pulse for successful relaxation
                this.particles.createPulse(toNode.x, toNode.y, COLORS.FLOYD_ACCEPTED, 1.0, speedMultiplier);
            }
        }

        // Dequeue (SPFA)
        if (type === 'dequeue' && step.current !== undefined) {
            const node = this.graph.nodes[step.current];
            if (node) {
                this.particles.createPulse(node.x, node.y, COLORS.CURRENT, 0.8, speedMultiplier);
            }
        }

        // Enqueue (SPFA)
        if (type === 'enqueue' && step.neighbor !== undefined) {
            const node = this.graph.nodes[step.neighbor];
            if (node) {
                this.particles.createPulse(node.x, node.y, COLORS.NEIGHBOR, 0.5, speedMultiplier);
            }
        }

        // PQ operations (Dijkstra, Prim)
        if (type === 'pq_pop' && step.current !== undefined) {
            const node = this.graph.nodes[step.current];
            if (node) {
                this.particles.createPulse(node.x, node.y, COLORS.CURRENT, 1.0, speedMultiplier);
            }
        }

        // Add to MST (Prim)
        if (type === 'add_to_mst' && step.current !== undefined) {
            const node = this.graph.nodes[step.current];
            if (node) {
                this.particles.createPulse(node.x, node.y, COLORS.FLOYD_ACCEPTED, 1.2, speedMultiplier);
            }
        }

        // Accept edge (Kruskal)
        if (type === 'accept_edge' && step.edge) {
            const fromNode = this.graph.nodes[step.edge.from];
            const toNode = this.graph.nodes[step.edge.to];
            if (fromNode && toNode) {
                this.particles.createPulse(fromNode.x, fromNode.y, COLORS.FLOYD_ACCEPTED, 1.0, speedMultiplier);
                this.particles.createPulse(toNode.x, toNode.y, COLORS.FLOYD_ACCEPTED, 1.0, speedMultiplier);
            }
        }

        // Reject edge (Kruskal)
        if (type === 'reject_edge' && step.edge) {
            const fromNode = this.graph.nodes[step.edge.from];
            const toNode = this.graph.nodes[step.edge.to];
            if (fromNode && toNode) {
                this.particles.createPulse(fromNode.x, fromNode.y, COLORS.FLOYD_REJECTED, 0.6, speedMultiplier);
                this.particles.createPulse(toNode.x, toNode.y, COLORS.FLOYD_REJECTED, 0.6, speedMultiplier);
            }
        }

        // Initialization
        if (type === 'init' && step.current !== undefined) {
            const node = this.graph.nodes[step.current];
            if (node) {
                this.particles.createPulse(node.x, node.y, COLORS.CURRENT, 0.8, speedMultiplier);
            }
        }
    }

    /**
     * Process Floyd-Warshall specific step
     */
    processFloydStep(step, speedMultiplier) {
        // Store matrices
        if (step.next) {
            this.animationState.floydNext = step.next;
        }
        if (step.dist) {
            this.animationState.floydDist = step.dist;
        }
        
        // Store K, I, J for highlighting
        if (step.k !== undefined) this.animationState.floydK = step.k;
        if (step.i !== undefined) this.animationState.floydI = step.i;
        if (step.j !== undefined) this.animationState.floydJ = step.j;
        
        // Handle compare step (visualization modes)
        if (step.type === 'compare' && step.i !== undefined && step.j !== undefined && step.k !== undefined) {
            this.particles.clearType('dashed-triangle');
            this.particles.clearType('glowing-path');
            
            // Create context for visualization
            const context = {
                step,
                positions: this.graph.nodes,
                particles: this.particles,
                speedMultiplier,
                state: this.animationState,
                graph: this.graph
            };
            
            // Use mode manager to visualize
            this.modeManager.visualize(context);
        }
    }

    /**
     * Play animation
     */
    play() {
        this.animationState.isPlaying = true;
        this.playNextStep();
    }

    /**
     * Pause animation
     */
    pause() {
        this.animationState.isPlaying = false;
    }

    /**
     * Step forward
     */
    stepForward() {
        if (this.animationState.currentStep < this.animationState.steps.length - 1) {
            this.animationState.currentStep++;
            this.processStep(this.animationState.steps[this.animationState.currentStep]);
            this.render();
        }
    }

    /**
     * Step backward
     */
    stepBackward() {
        if (this.animationState.currentStep > 0) {
            this.animationState.currentStep--;
            this.processStep(this.animationState.steps[this.animationState.currentStep]);
            this.render();
        }
    }

    /**
     * Play next step (for animation)
     */
    playNextStep() {
        if (!this.animationState.isPlaying) return;
        
        if (this.animationState.currentStep < this.animationState.steps.length - 1) {
            this.stepForward();
            
            const delay = 1000 / this.animationState.speed;
            setTimeout(() => this.playNextStep(), delay);
        } else {
            this.animationState.isPlaying = false;
        }
    }

    /**
     * Set animation speed
     */
    setSpeed(speed) {
        this.animationState.speed = speed;
    }

    /**
     * Set Floyd visualization mode
     */
    setFloydMode(mode) {
        this.modeManager.setMode(mode);
        this.render();
    }

    /**
     * Set visual style (flat or 3D)
     */
    setVisualStyle(style) {
        this.visualStyle = style;
        this.render();
    }

    /**
     * Toggle distance display
     */
    toggleDistances(show) {
        this.showDistances = show;
        this.render();
    }

    /**
     * Start render loop
     */
    startRenderLoop() {
        const animate = () => {
            this.particles.update(0.016);
            this.render();
            requestAnimationFrame(animate);
        };
        animate();
    }

    /**
     * Render everything
     */
    render() {
        // Clear canvas
        this.ctx.fillStyle = COLORS.BACKGROUND;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw edges
        this.graph.edges.forEach(edge => {
            this.drawEdge(edge);
        });
        
        // Draw hover paths (if applicable)
        if (this.hoveredNode !== null && 
            this.selectedAlgorithm === ALGORITHMS.FLOYD_WARSHALL &&
            this.modeManager.supportsHoverPaths()) {
            
            const context = {
                positions: this.graph.nodes,
                state: this.animationState,
                graph: this.graph
            };
            
            this.modeManager.drawHoverPaths(context, this.hoveredNode, this.ctx);
        }
        
        // Draw particles
        this.particles.render(this.ctx);
        
        // Draw nodes
        this.graph.nodes.forEach((node, index) => {
            this.drawNode(node, index);
        });
    }

    /**
     * Draw edge
     */
    drawEdge(edge) {
        const fromNode = this.graph.nodes[edge.from];
        const toNode = this.graph.nodes[edge.to];
        
        if (!fromNode || !toNode) return;
        
        // Get current step for MST highlighting
        const currentStep = this.animationState.steps[this.animationState.currentStep];
        
        // Check if edge is in MST (for Prim/Kruskal)
        let isMSTEdge = false;
        let isRejectedEdge = false;
        let isCurrentEdge = false;
        
        if (currentStep && currentStep.mstEdges) {
            isMSTEdge = currentStep.mstEdges.some(mstEdge => 
                (mstEdge.from === edge.from && mstEdge.to === edge.to) ||
                (mstEdge.from === edge.to && mstEdge.to === edge.from)
            );
        }
        
        if (currentStep && currentStep.processedEdges) {
            const processed = currentStep.processedEdges.find(e =>
                (e.from === edge.from && e.to === edge.to) ||
                (e.from === edge.to && e.to === edge.from)
            );
            if (processed && processed.status === 'rejected') {
                isRejectedEdge = true;
            }
        }
        
        if (currentStep && currentStep.edge) {
            isCurrentEdge = (currentStep.edge.from === edge.from && currentStep.edge.to === edge.to) ||
                           (currentStep.edge.from === edge.to && currentStep.edge.to === edge.from);
        }
        
        // Set edge style
        if (isMSTEdge) {
            this.ctx.strokeStyle = COLORS.EDGE_MST;
            this.ctx.lineWidth = 4;
        } else if (isRejectedEdge) {
            this.ctx.strokeStyle = COLORS.FLOYD_REJECTED;
            this.ctx.lineWidth = 2;
            this.ctx.globalAlpha = 0.3;
        } else if (isCurrentEdge) {
            this.ctx.strokeStyle = COLORS.CURRENT;
            this.ctx.lineWidth = 3;
        } else {
            this.ctx.strokeStyle = COLORS.EDGE_DEFAULT;
            this.ctx.lineWidth = 2;
        }
        
        this.ctx.beginPath();
        this.ctx.moveTo(fromNode.x, fromNode.y);
        this.ctx.lineTo(toNode.x, toNode.y);
        this.ctx.stroke();
        
        this.ctx.globalAlpha = 1.0;
        
        // Draw weight
        const midX = (fromNode.x + toNode.x) / 2;
        const midY = (fromNode.y + toNode.y) / 2;
        
        this.ctx.fillStyle = isMSTEdge ? COLORS.EDGE_MST : COLORS.TEXT;
        this.ctx.font = isMSTEdge ? 'bold 14px Arial' : '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(edge.weight, midX, midY - 10);
    }

    /**
     * Draw node
     */
    drawNode(node, index) {
        let scale = 1.0;
        let fillColor = COLORS.NODE_DEFAULT;
        let isStartNode = false;
        
        // Get current step for highlighting
        const currentStep = this.animationState.steps[this.animationState.currentStep];
        
        // Kruskal - use set colors
        if (this.selectedAlgorithm === ALGORITHMS.KRUSKAL && currentStep?.setColors) {
            // Find root of this node
            const findRoot = (parent, node) => {
                if (parent[node] === node) return node;
                return findRoot(parent, parent[node]);
            };
            
            if (currentStep.parent) {
                const root = findRoot(currentStep.parent, index);
                fillColor = currentStep.setColors[root] || COLORS.NODE_DEFAULT;
            }
        }
        // Floyd-Warshall - triple loop colors (more distinct)
        else if (this.selectedAlgorithm === ALGORITHMS.FLOYD_WARSHALL) {
            if (index === this.animationState.floydK) {
                scale = NODE.FLOYD_K_SCALE;
                fillColor = '#FF6B35'; // Bright orange for K
            } else if (index === this.animationState.floydI) {
                scale = NODE.FLOYD_IJ_SCALE;
                fillColor = '#00D9FF'; // Cyan for I
            } else if (index === this.animationState.floydJ) {
                scale = NODE.FLOYD_IJ_SCALE;
                fillColor = '#D946EF'; // Magenta for J
            }
        }
        // Other algorithms
        else {
            if (currentStep?.current === index) {
                scale = NODE.FLOYD_K_SCALE;
                fillColor = COLORS.CURRENT;
            } else if (currentStep?.neighbor === index) {
                scale = NODE.FLOYD_IJ_SCALE;
                fillColor = COLORS.NEIGHBOR;
            } else if (this.animationState.visited && this.animationState.visited[index]) {
                fillColor = COLORS.VISITED;
            }
            
            // Check if this is the start node
            if (currentStep?.startNode !== undefined && currentStep.startNode === index) {
                isStartNode = true;
            } else if (this.animationState.steps[0]?.current === index) {
                isStartNode = true;
            }
        }
        
        // Hover effect
        if (index === this.hoveredNode) {
            scale *= NODE.HOVER_SCALE;
        }
        
        const radius = NODE.RADIUS * scale;
        
        // Draw dashed circle for start node
        if (isStartNode && !this.selectedAlgorithm === ALGORITHMS.FLOYD_WARSHALL) {
            this.ctx.strokeStyle = fillColor;
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius + 8, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
        
        // Draw node circle based on visual style
        if (this.visualStyle === VISUAL_STYLES.GLOSSY_3D) {
            // 3D glossy style with gradient
            const gradient = this.ctx.createRadialGradient(
                node.x - radius * 0.3,
                node.y - radius * 0.3,
                radius * 0.1,
                node.x,
                node.y,
                radius
            );
            
            gradient.addColorStop(0, this.lightenColor(fillColor, 40));
            gradient.addColorStop(0.4, fillColor);
            gradient.addColorStop(1, this.darkenColor(fillColor, 20));
            
            // Drop shadow
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            this.ctx.shadowBlur = 8;
            this.ctx.shadowOffsetX = 3;
            this.ctx.shadowOffsetY = 3;
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Reset shadow
            this.ctx.shadowColor = 'transparent';
            this.ctx.shadowBlur = 0;
            this.ctx.shadowOffsetX = 0;
            this.ctx.shadowOffsetY = 0;
            
            // Glossy highlight overlay
            const highlightGradient = this.ctx.createRadialGradient(
                node.x - radius * 0.4,
                node.y - radius * 0.4,
                0,
                node.x - radius * 0.4,
                node.y - radius * 0.4,
                radius * 0.6
            );
            highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
            highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            this.ctx.fillStyle = highlightGradient;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Rim light effect (bottom edge)
            this.ctx.strokeStyle = this.lightenColor(fillColor, 60);
            this.ctx.lineWidth = 2;
            this.ctx.globalAlpha = 0.3;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius - 1, Math.PI * 0.3, Math.PI * 0.7);
            this.ctx.stroke();
            this.ctx.globalAlpha = 1.0;
            
            // Border
            this.ctx.strokeStyle = this.darkenColor(fillColor, 30);
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            this.ctx.stroke();
        } else {
            // Flat style
            this.ctx.fillStyle = fillColor;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = COLORS.TEXT;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        
        // Draw node label with text shadow
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        this.ctx.shadowBlur = 3;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;
        
        this.ctx.fillStyle = COLORS.TEXT;
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(index, node.x, node.y);
        
        // Reset shadow
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
        
        // Draw distance (if available and enabled)
        if (this.showDistances && this.animationState.distances && this.animationState.distances[index] !== undefined) {
            const dist = this.animationState.distances[index];
            const distText = dist === Infinity ? '∞' : dist.toString();
            
            // Text shadow for distance
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            this.ctx.shadowBlur = 2;
            this.ctx.shadowOffsetX = 1;
            this.ctx.shadowOffsetY = 1;
            
            this.ctx.fillStyle = COLORS.TEXT_SECONDARY;
            this.ctx.font = '12px Arial';
            this.ctx.fillText(distText, node.x, node.y + radius + 15);
            
            // Reset shadow
            this.ctx.shadowColor = 'transparent';
            this.ctx.shadowBlur = 0;
            this.ctx.shadowOffsetX = 0;
            this.ctx.shadowOffsetY = 0;
        }
    }

    /**
     * Lighten a color by a percentage
     */
    lightenColor(color, percent) {
        // Handle hex colors
        if (color.startsWith('#')) {
            const num = parseInt(color.slice(1), 16);
            const r = Math.min(255, ((num >> 16) & 0xFF) + percent);
            const g = Math.min(255, ((num >> 8) & 0xFF) + percent);
            const b = Math.min(255, (num & 0xFF) + percent);
            return `rgb(${r}, ${g}, ${b})`;
        }
        // Handle hsl colors
        if (color.startsWith('hsl')) {
            const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (match) {
                const h = match[1];
                const s = match[2];
                const l = Math.min(100, parseInt(match[3]) + percent / 2.55);
                return `hsl(${h}, ${s}%, ${l}%)`;
            }
        }
        return color;
    }

    /**
     * Darken a color by a percentage
     */
    darkenColor(color, percent) {
        // Handle hex colors
        if (color.startsWith('#')) {
            const num = parseInt(color.slice(1), 16);
            const r = Math.max(0, ((num >> 16) & 0xFF) - percent);
            const g = Math.max(0, ((num >> 8) & 0xFF) - percent);
            const b = Math.max(0, (num & 0xFF) - percent);
            return `rgb(${r}, ${g}, ${b})`;
        }
        // Handle hsl colors
        if (color.startsWith('hsl')) {
            const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (match) {
                const h = match[1];
                const s = match[2];
                const l = Math.max(0, parseInt(match[3]) - percent / 2.55);
                return `hsl(${h}, ${s}%, ${l}%)`;
            }
        }
        return color;
    }

    /**
     * Get current step info
     */
    getCurrentStepInfo() {
        const step = this.animationState.steps[this.animationState.currentStep];
        return {
            stepNumber: this.animationState.currentStep + 1,
            totalSteps: this.animationState.steps.length,
            message: step?.message || '',
            type: step?.type || '',
            currentStep: step  // Include full step data for DataPanel
        };
    }

    /**
     * Reset visualization
     */
    reset() {
        this.animationState = {
            isPlaying: false,
            currentStep: 0,
            steps: [],
            speed: ANIMATION.DEFAULT_SPEED,
            algorithmGenerator: null,
            floydNext: null,
            floydDist: null,
            floydK: null,
            floydI: null,
            floydJ: null,
            distances: null,
            visited: null
        };
        
        this.selectedAlgorithm = null;
        this.particles.clearAll();
        this.render();
    }
}
