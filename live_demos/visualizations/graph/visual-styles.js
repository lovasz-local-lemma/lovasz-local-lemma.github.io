// Visual Styles and Physics System for Graph Visualizer

class VisualStyleManager {
    constructor() {
        this.currentStyle = 'modern';
        this.styles = {
            modern: new ModernGlassStyle(),
            frosted: new FrostedGlassStyle(),
            luxury: new LuxuryGradientStyle(),
            crystal: new CrystalStyle(),
            'soft-shadow': new SoftShadowStyle(),
            glossy: new GlossyReflectiveStyle(),
            metro: new MetroStyle(),
            '3d': new ThreeDShadedStyle(),
            neon: new NeonGlowStyle(),
            fire: new FireEnergyStyle(),
            minimal: new MinimalFlatStyle(),
            organic: new OrganicFlowStyle(),
            elegant: new ElegantStyle()
        };
    }

    getStyle(name) {
        return this.styles[name] || this.styles.modern;
    }

    setStyle(name) {
        this.currentStyle = name;
    }

    getCurrentStyle() {
        return this.styles[this.currentStyle];
    }
}

// Base Style Class
class BaseVisualStyle {
    constructor(name) {
        this.name = name;
        this.time = 0; // For animations
    }

    // Node rendering
    drawNode(ctx, x, y, radius, state, nodeId) {
        throw new Error('drawNode must be implemented');
    }

    // Edge rendering
    drawEdge(ctx, from, to, state, edge) {
        throw new Error('drawEdge must be implemented');
    }

    // Mouse interaction behavior
    onNodeHover(node) {}
    onNodeLeave(node) {}
    
    // Get animation type for this style
    getAnimationType() {
        return 'wobble'; // Default: wobble. Can be 'wobble', 'wave', 'pulse', 'none'
    }
    
    // Utility: Apply subtle wobble when node is being processed
    getWobbleOffset(state, intensity = 0.3) {
        // Only wobble when CURRENTLY being processed (not visited)
        if (!state.current) {
            return { x: 0, y: 0 };
        }
        
        this.time += 0.006; // Even slower animation
        const wobble = Math.sin(this.time * 1.5) * intensity; // More subtle
        const angle = this.time * 1.2;
        
        return {
            x: Math.cos(angle) * wobble,
            y: Math.sin(angle) * wobble
        };
    }
    
    // Utility: Get edge wobble (curve offset for visual wave effect)
    getEdgeWobble(state, from, to) {
        // MST edges don't wobble - they glow instead
        if (!state.explored && !state.highlighted && !state.released) {
            return { cpX: (from.x + to.x) / 2, cpY: (from.y + to.y) / 2 };
        }
        
        this.time += 0.015; // Smooth animation
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        
        // Calculate perpendicular offset for wave effect
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const perpX = -dy / len;
        const perpY = dx / len;
        
        // Wobble amplitude - more subtle for release
        const wobbleAmount = state.released ? 
            Math.sin(this.time * 2.5) * 3 : // Subtle for release
            Math.sin(this.time * 3) * 8;     // Normal for processing
        
        return {
            cpX: midX + perpX * wobbleAmount,
            cpY: midY + perpY * wobbleAmount
        };
    }
    
    // Utility: Get wobble intensity for edge width
    getEdgeWobbleWidth(state, baseWidth) {
        // MST edges don't wobble - they stay consistent
        if (!state.explored && !state.highlighted && !state.released) {
            return baseWidth;
        }
        
        return baseWidth + Math.sin(this.time * 5) * 0.5;
    }
    
    // Utility: Get wave propagation effect on edge (alternative to wobble)
    getEdgeWave(state, from, to, waveSpeed = 3) {
        if (!state.explored && !state.highlighted && !state.released) {
            return { cpX: (from.x + to.x) / 2, cpY: (from.y + to.y) / 2 };
        }
        
        this.time += 0.02;
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        
        // Calculate perpendicular for wave
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const perpX = -dy / len;
        const perpY = dx / len;
        
        // Wave propagates along the edge
        const edgeProgress = (this.time * waveSpeed) % 1; // 0 to 1
        const waveAmplitude = Math.sin(edgeProgress * Math.PI * 2) * 10; // Wave height
        
        // Position wave along edge
        const waveX = from.x + dx * edgeProgress;
        const waveY = from.y + dy * edgeProgress;
        
        return {
            cpX: waveX + perpX * waveAmplitude,
            cpY: waveY + perpY * waveAmplitude
        };
    }
    
    // Physics behavior
    getPhysicsConfig() {
        return {
            springStrength: 0.02,
            damping: 0.8,
            repulsion: 1000,
            attraction: 0.001,
            hoverRepulsion: 200
        };
    }
}

// Modern Glass Style
class ModernGlassStyle extends BaseVisualStyle {
    constructor() {
        super('modern');
    }

    drawNode(ctx, x, y, radius, state, nodeId) {
        const { color, textColor } = this.getNodeColors(state);
        
        // Apply subtle wobble when processing
        const wobble = this.getWobbleOffset(state, 0.3);
        x += wobble.x;
        y += wobble.y;
        
        ctx.save();
        
        // Drop shadow for node
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;
        
        // Glass effect with gradient
        const gradient = ctx.createRadialGradient(x - radius/3, y - radius/3, 0, x, y, radius);
        gradient.addColorStop(0, ColorUtils.addAlpha('#ffffff', 0.9));
        gradient.addColorStop(0.4, color);
        gradient.addColorStop(1, ColorUtils.interpolateColor(color, '#000000', 0.25));
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner shadow for depth
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.globalCompositeOperation = 'multiply';
        const innerShadow = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius);
        innerShadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
        innerShadow.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
        ctx.fillStyle = innerShadow;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        
        // Glass highlight (top-left)
        const highlight = ctx.createRadialGradient(x - radius/3, y - radius/3, 0, x - radius/3, y - radius/3, radius * 0.8);
        highlight.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
        highlight.addColorStop(0.6, 'rgba(255, 255, 255, 0.2)');
        highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Enhanced outer glow based on state
        let glowIntensity = 8;
        let glowColor = ColorUtils.addAlpha(color, 0.3);
        if (state.current) {
            glowIntensity = 20;
            glowColor = ColorUtils.addAlpha('#4caf50', 0.6);
        } else if (state.visited) {
            glowIntensity = 12;
            glowColor = ColorUtils.addAlpha(color, 0.4);
        }
        
        // Border with glow
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = glowIntensity;
        ctx.stroke();
        
        ctx.restore();
        
        // Text
        this.drawNodeText(ctx, x, y, nodeId, textColor);
    }

    drawEdge(ctx, from, to, state, edge) {
        const color = this.getEdgeColor(state);
        const baseWidth = state.highlighted ? 4 : state.mst ? 3 : 2;
        const width = this.getEdgeWobbleWidth(state, baseWidth);
        
        // Get wobble control point for curved edge
        const cp = this.getEdgeWobble(state, from, to);
        
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        
        // Edge drop shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
        
        // Special glows for different states
        if (state.negativeCycle) {
            // RED GLOW for negative cycle
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#dc3545';
            ctx.lineWidth = width + 2; // Thicker for emphasis
        } else if (state.hoveredPath) {
            // GOLD GLOW for hovered path
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#ffc107';
            ctx.lineWidth = width + 1;
        } else if (state.mst) {
            // MST edges get glow (no wobble)
            ctx.shadowBlur = 15;
            ctx.shadowColor = color;
        } else if (state.highlighted) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = color;
        }
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(cp.cpX, cp.cpY, to.x, to.y);
        ctx.stroke();
        
        ctx.restore();
    }

    getNodeColors(state) {
        // Floyd-Warshall specific highlighting (more prominent)
        if (state.floydK) return { color: '#ffd54f', textColor: '#333' }; // K: yellow (intermediate)
        if (state.floydI) return { color: '#42a5f5', textColor: '#fff' }; // I: blue (from)
        if (state.floydJ) return { color: '#ba68c8', textColor: '#fff' }; // J: purple (to)
        
        // SPFA-specific: queue visualization
        if (state.spfaPopped) return { color: '#4caf50', textColor: '#fff' }; // Green: just popped, processing
        if (state.spfaInQueue) return { color: '#00bcd4', textColor: '#fff' }; // Cyan: waiting in queue
        
        // Kruskal-specific: color by set
        if (state.kruskalSetIndex >= 0) {
            const colors = [
                { color: '#4caf50', textColor: '#fff' },  // Green
                { color: '#2196f3', textColor: '#fff' },  // Blue
                { color: '#ff9800', textColor: '#fff' },  // Orange
                { color: '#9c27b0', textColor: '#fff' },  // Purple
                { color: '#f44336', textColor: '#fff' },  // Red
                { color: '#00bcd4', textColor: '#fff' },  // Cyan
                { color: '#ffeb3b', textColor: '#333' },  // Yellow
                { color: '#795548', textColor: '#fff' },  // Brown
            ];
            return colors[state.kruskalSetIndex % colors.length];
        }
        
        // Prim-specific: nodes in MST (purple)
        if (state.primVisited) return { color: '#ba68c8', textColor: '#fff' };
        
        // Standard highlighting
        if (state.current) return { color: '#4caf50', textColor: '#fff' };
        if (state.visited) return { color: '#ffd54f', textColor: '#333' };
        return { color: '#64b5f6', textColor: '#fff' };
    }

    getEdgeColor(state) {
        if (state.negativeCycle) return '#dc3545'; // RED for negative cycle
        if (state.negativeEdge && !state.negativeCycle) return '#ff9800'; // ORANGE for negative edge (not cycle)
        if (state.hoveredPath) return '#ffc107'; // YELLOW/GOLD for hovered path
        if (state.pqTop) return '#4caf50'; // GREEN for PQ top
        if (state.mst) return '#ba68c8';
        if (state.explored) return '#ff6b6b';
        if (state.highlighted) return '#64b5f6';
        if (state.inPQ) return '#81c784'; // LIGHT GREEN for edges in PQ
        return '#999';
    }

    drawNodeText(ctx, x, y, text, color) {
        ctx.save();
        // Text drop shadow for better readability
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = color;
        ctx.font = '400 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    getPhysicsConfig() {
        return {
            springStrength: 0.015,
            damping: 0.85,
            repulsion: 800,
            hoverRepulsion: 150
        };
    }
}

// Glossy Reflective Style (Simple, elegant glass sphere)
class GlossyReflectiveStyle extends BaseVisualStyle {
    constructor() {
        super('glossy');
    }

    drawNode(ctx, x, y, radius, state, nodeId) {
        const { color, textColor } = this.getNodeColors(state);
        
        // Apply subtle wobble when processing
        const wobble = this.getWobbleOffset(state, 0.3);
        x += wobble.x;
        y += wobble.y;
        
        ctx.save();
        
        // Base sphere with depth gradient
        const baseGradient = ctx.createRadialGradient(
            x, y - radius * 0.2, 0,
            x, y, radius * 1.2
        );
        baseGradient.addColorStop(0, ColorUtils.interpolateColor(color, '#ffffff', 0.3));
        baseGradient.addColorStop(0.5, color);
        baseGradient.addColorStop(1, ColorUtils.interpolateColor(color, '#000000', 0.4));
        
        // Soft shadow for depth
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowOffsetY = 3;
        
        ctx.fillStyle = baseGradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        
        // Top highlight (simpler, static)
        const highlight = ctx.createRadialGradient(
            x - radius * 0.4, y - radius * 0.4, 0,
            x - radius * 0.4, y - radius * 0.4, radius * 0.8
        );
        highlight.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        highlight.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)');
        highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Bottom shine (subtle reflection)
        const bottomShine = ctx.createRadialGradient(
            x + radius * 0.3, y + radius * 0.3, 0,
            x + radius * 0.3, y + radius * 0.3, radius * 0.5
        );
        bottomShine.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        bottomShine.addColorStop(0.6, 'rgba(255, 255, 255, 0.1)');
        bottomShine.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = bottomShine;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Subtle rim light
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, radius - 0.5, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
        
        // Text
        this.drawNodeText(ctx, x, y, nodeId, textColor);
    }

    drawEdge(ctx, from, to, state, edge) {
        const color = this.getEdgeColor(state);
        const baseWidth = state.highlighted ? 4 : 2;
        const width = this.getEdgeWobbleWidth(state, baseWidth);
        
        // Get wobble control point for curved edge
        const cp = this.getEdgeWobble(state, from, to);
        
        ctx.save();
        
        // Glossy edge with gradient
        const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.5, ColorUtils.interpolateColor(color, '#ffffff', 0.3));
        gradient.addColorStop(1, color);
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        
        if (state.highlighted) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = ColorUtils.addAlpha(color, 0.4);
        }
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(cp.cpX, cp.cpY, to.x, to.y);
        ctx.stroke();
        
        ctx.restore();
    }

    getNodeColors(state) {
        if (state.current) return { color: '#4caf50', textColor: '#fff' };
        if (state.visited) return { color: '#ffa726', textColor: '#000' };
        return { color: '#42a5f5', textColor: '#fff' };
    }

    getEdgeColor(state) {
        if (state.mst) return '#ab47bc';
        if (state.explored) return '#ef5350';
        if (state.highlighted) return '#42a5f5';
        return '#90a4ae';
    }

    drawNodeText(ctx, x, y, text, color) {
        ctx.save();
        // Add drop shadow for better readability
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = color;
        ctx.font = '600 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    getPhysicsConfig() {
        return {
            springStrength: 0.018,
            damping: 0.87,
            repulsion: 850,
            hoverRepulsion: 120
        };
    }
}

// Metro Style (Microsoft Design Language - Clean, Flat, Bold)
class MetroStyle extends BaseVisualStyle {
    constructor() {
        super('metro');
    }

    drawNode(ctx, x, y, radius, state, nodeId) {
        const { color, textColor } = this.getNodeColors(state);
        
        // Apply subtle wobble when processing
        const wobble = this.getWobbleOffset(state, 0.3);
        x += wobble.x;
        y += wobble.y;
        
        ctx.save();
        
        // Flat square/rounded rectangle
        const size = radius * 1.8;
        const cornerRadius = 4;
        
        // Solid flat color - no gradients
        ctx.fillStyle = color;
        this.roundRect(ctx, x - size/2, y - size/2, size, size, cornerRadius);
        ctx.fill();
        
        // Subtle border only when highlighted
        if (state.current || state.highlighted) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            this.roundRect(ctx, x - size/2, y - size/2, size, size, cornerRadius);
            ctx.stroke();
        }
        
        ctx.restore();
        
        // Bold text
        this.drawNodeText(ctx, x, y, nodeId, textColor);
    }

    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    drawEdge(ctx, from, to, state, edge) {
        const color = this.getEdgeColor(state);
        const width = state.highlighted ? 5 : 3;
        
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'square'; // Sharp Metro look
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        
        ctx.restore();
    }

    getNodeColors(state) {
        // Bold Metro colors
        if (state.current) return { color: '#00b294', textColor: '#fff' }; // Teal
        if (state.visited) return { color: '#ffc40d', textColor: '#000' }; // Gold
        return { color: '#0078d4', textColor: '#fff' }; // Blue
    }

    getEdgeColor(state) {
        if (state.mst) return '#e81123'; // Red
        if (state.explored) return '#ff8c00'; // Orange
        if (state.highlighted) return '#0078d4'; // Blue
        return '#8a8886'; // Gray
    }

    drawNodeText(ctx, x, y, text, color) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = '700 18px Segoe UI, JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    getPhysicsConfig() {
        return {
            springStrength: 0.02,
            damping: 0.85,
            repulsion: 1200,
            hoverRepulsion: 100
        };
    }
}

// 3D Shaded Style
class ThreeDShadedStyle extends BaseVisualStyle {
    constructor() {
        super('3d');
    }

    drawNode(ctx, x, y, radius, state, nodeId) {
        const { color, textColor } = this.getNodeColors(state);
        
        ctx.save();
        
        // Shadow
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 5;
        
        // Main sphere with 3D gradient
        const gradient = ctx.createRadialGradient(x - radius/2, y - radius/2, 0, x, y, radius);
        gradient.addColorStop(0, ColorUtils.interpolateColor(color, '#ffffff', 0.6));
        gradient.addColorStop(0.5, color);
        gradient.addColorStop(1, ColorUtils.interpolateColor(color, '#000000', 0.4));
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // 3D highlight
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        const highlight = ctx.createRadialGradient(x - radius/3, y - radius/3, 0, x, y, radius/2);
        highlight.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.arc(x - radius/4, y - radius/4, radius/2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        // Text with shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 3;
        this.drawNodeText(ctx, x, y, nodeId, textColor);
        ctx.restore();
    }

    drawEdge(ctx, from, to, state, edge) {
        const color = this.getEdgeColor(state);
        const width = state.highlighted ? 5 : 3;
        
        ctx.save();
        
        // Shadow
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;
        
        // Edge with gradient
        const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.5, ColorUtils.interpolateColor(color, '#ffffff', 0.2));
        gradient.addColorStop(1, color);
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        
        ctx.restore();
    }

    getNodeColors(state) {
        if (state.current) return { color: '#43a047', textColor: '#fff' };
        if (state.visited) return { color: '#fbc02d', textColor: '#333' };
        return { color: '#1e88e5', textColor: '#fff' };
    }

    getEdgeColor(state) {
        if (state.mst) return '#8e24aa';
        if (state.explored) return '#e53935';
        if (state.highlighted) return '#1976d2';
        return '#757575';
    }

    drawNodeText(ctx, x, y, text, color) {
        ctx.fillStyle = color;
        ctx.font = '600 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    }

    getPhysicsConfig() {
        return {
            springStrength: 0.025,
            damping: 0.75,
            repulsion: 1200,
            hoverRepulsion: 200
        };
    }
}

// Neon Glow Style
class NeonGlowStyle extends BaseVisualStyle {
    constructor() {
        super('neon');
    }

    drawNode(ctx, x, y, radius, state, nodeId) {
        const { color, textColor } = this.getNodeColors(state);
        
        ctx.save();
        
        // Multiple glow layers
        for (let i = 3; i > 0; i--) {
            ctx.shadowBlur = 25 * i;
            ctx.shadowColor = color;
            
            ctx.fillStyle = ColorUtils.addAlpha(color, 0.1 * i);
            ctx.beginPath();
            ctx.arc(x, y, radius + i * 5, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Core
        ctx.shadowBlur = 30;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Bright center
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        // Glowing text
        ctx.save();
        ctx.shadowColor = textColor;
        ctx.shadowBlur = 10;
        this.drawNodeText(ctx, x, y, nodeId, textColor);
        ctx.restore();
    }

    drawEdge(ctx, from, to, state, edge) {
        const color = this.getEdgeColor(state);
        const width = state.highlighted ? 4 : 2;
        
        ctx.save();
        
        // Glow effect
        ctx.shadowBlur = state.highlighted ? 20 : 10;
        ctx.shadowColor = color;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        
        // Bright core line
        if (state.highlighted) {
            ctx.shadowBlur = 5;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        
        ctx.restore();
    }

    getNodeColors(state) {
        if (state.current) return { color: '#00ff41', textColor: '#001a0d' };
        if (state.visited) return { color: '#ffea00', textColor: '#1a1600' };
        return { color: '#00d4ff', textColor: '#001a1d' };
    }

    getEdgeColor(state) {
        if (state.mst) return '#ff00ff';
        if (state.explored) return '#ff3d00';
        if (state.highlighted) return '#00e5ff';
        return '#4a4a4a';
    }

    drawNodeText(ctx, x, y, text, color) {
        ctx.fillStyle = color;
        ctx.font = '600 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    }

    getPhysicsConfig() {
        return {
            springStrength: 0.02,
            damping: 0.9,
            repulsion: 600,
            hoverRepulsion: 100,
            pulsate: true
        };
    }
}

// Fire & Energy Style
class FireEnergyStyle extends BaseVisualStyle {
    constructor() {
        super('fire');
        this.particles = [];
        this.time = 0;
    }

    drawNode(ctx, x, y, radius, state, nodeId) {
        this.time += 0.1;
        const { color, textColor } = this.getNodeColors(state);
        
        ctx.save();
        
        // Animated fire glow
        const pulse = Math.sin(this.time) * 0.2 + 1;
        
        // Outer flame
        const outerGradient = ctx.createRadialGradient(x, y, 0, x, y, radius * pulse * 1.5);
        outerGradient.addColorStop(0, ColorUtils.addAlpha(color, 0.8));
        outerGradient.addColorStop(0.5, ColorUtils.addAlpha(color, 0.3));
        outerGradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = outerGradient;
        ctx.beginPath();
        ctx.arc(x, y, radius * pulse * 1.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Main fireball
        const gradient = ctx.createRadialGradient(x, y - radius/3, 0, x, y, radius);
        gradient.addColorStop(0, '#fff4e6');
        gradient.addColorStop(0.3, color);
        gradient.addColorStop(0.7, ColorUtils.interpolateColor(color, '#ff4500', 0.5));
        gradient.addColorStop(1, '#8b0000');
        
        ctx.shadowBlur = 25;
        ctx.shadowColor = color;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Bright core
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffffff';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.arc(x, y - radius/4, radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        // Text
        this.drawNodeText(ctx, x, y, nodeId, textColor);
    }

    drawEdge(ctx, from, to, state, edge) {
        const color = this.getEdgeColor(state);
        const width = state.highlighted ? 5 : 3;
        
        ctx.save();
        
        // Animated energy flow
        if (state.highlighted) {
            const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
            const pulse = (Math.sin(this.time * 2) + 1) / 2;
            gradient.addColorStop(0, color);
            gradient.addColorStop(pulse, '#ffffff');
            gradient.addColorStop(1, color);
            
            ctx.strokeStyle = gradient;
            ctx.shadowBlur = 20;
            ctx.shadowColor = color;
        } else {
            ctx.strokeStyle = color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = color;
        }
        
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        
        ctx.restore();
    }

    getNodeColors(state) {
        if (state.current) return { color: '#ff6f00', textColor: '#fff' };
        if (state.visited) return { color: '#ffd600', textColor: '#333' };
        return { color: '#ff1744', textColor: '#fff' };
    }

    getEdgeColor(state) {
        if (state.mst) return '#e040fb';
        if (state.explored) return '#ff5722';
        if (state.highlighted) return '#ff9100';
        return '#424242';
    }

    drawNodeText(ctx, x, y, text, color) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 5;
        ctx.fillStyle = color;
        ctx.font = '600 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    getPhysicsConfig() {
        return {
            springStrength: 0.03,
            damping: 0.7,
            repulsion: 1500,
            hoverRepulsion: 300,
            chaotic: true
        };
    }
}

// Minimal Flat Style
class MinimalFlatStyle extends BaseVisualStyle {
    constructor() {
        super('minimal');
    }

    drawNode(ctx, x, y, radius, state, nodeId) {
        const { color, textColor } = this.getNodeColors(state);
        
        ctx.save();
        
        // Simple flat circle
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Clean border
        ctx.strokeStyle = ColorUtils.interpolateColor(color, '#000000', 0.3);
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
        
        // Text
        this.drawNodeText(ctx, x, y, nodeId, textColor);
    }

    drawEdge(ctx, from, to, state, edge) {
        const color = this.getEdgeColor(state);
        const width = state.highlighted ? 4 : 2;
        
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
    }

    getNodeColors(state) {
        if (state.current) return { color: '#4caf50', textColor: '#fff' };
        if (state.visited) return { color: '#ffc107', textColor: '#333' };
        return { color: '#2196f3', textColor: '#fff' };
    }

    getEdgeColor(state) {
        if (state.mst) return '#9c27b0';
        if (state.explored) return '#f44336';
        if (state.highlighted) return '#03a9f4';
        return '#757575';
    }

    drawNodeText(ctx, x, y, text, color) {
        ctx.fillStyle = color;
        ctx.font = '600 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    }

    getPhysicsConfig() {
        return {
            springStrength: 0.02,
            damping: 0.95,
            repulsion: 500,
            hoverRepulsion: 50
        };
    }
}

// Organic Flow Style
class OrganicFlowStyle extends BaseVisualStyle {
    constructor() {
        super('organic');
        this.time = 0;
    }

    drawNode(ctx, x, y, radius, state, nodeId) {
        this.time += 0.01; // Slow, smooth animation
        const { color, textColor } = this.getNodeColors(state);
        
        ctx.save();
        
        // Organic blob shape
        ctx.fillStyle = color;
        ctx.shadowBlur = 20;
        ctx.shadowColor = ColorUtils.addAlpha(color, 0.6);
        
        // Wobble only when node is CURRENTLY being processed (not visited)
        const wobbleAmount = state.current ? 2 : 0;
        
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            const offset = Math.sin(this.time + i) * wobbleAmount;
            const r = radius + offset;
            const px = x + Math.cos(angle) * r;
            const py = y + Math.sin(angle) * r;
            
            if (i === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.fill();
        
        // Inner gradient
        ctx.shadowBlur = 0;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, ColorUtils.addAlpha('#ffffff', 0.3));
        gradient.addColorStop(1, 'transparent');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        // Text
        this.drawNodeText(ctx, x, y, nodeId, textColor);
    }

    drawEdge(ctx, from, to, state, edge) {
        const color = this.getEdgeColor(state);
        const baseWidth = state.highlighted ? 4 : 2;
        const width = this.getEdgeWobbleWidth(state, baseWidth);
        
        // Get wobble control point for curved edge
        const cp = this.getEdgeWobble(state, from, to);
        
        ctx.save();
        
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        
        if (state.highlighted) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = color;
        }
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(cp.cpX, cp.cpY, to.x, to.y);
        ctx.stroke();
        
        ctx.restore();
    }

    getNodeColors(state) {
        if (state.current) return { color: '#66bb6a', textColor: '#fff' };
        if (state.visited) return { color: '#ffca28', textColor: '#333' };
        return { color: '#42a5f5', textColor: '#fff' };
    }

    getEdgeColor(state) {
        if (state.mst) return '#ab47bc';
        if (state.explored) return '#ef5350';
        if (state.highlighted) return '#29b6f6';
        return '#78909c';
    }

    drawNodeText(ctx, x, y, text, color) {
        ctx.fillStyle = color;
        ctx.font = '600 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    }

    getPhysicsConfig() {
        return {
            springStrength: 0.01,
            damping: 0.88,
            repulsion: 700,
            hoverRepulsion: 120,
            flowing: true
        };
    }
}

// Elegant Style (Clean, Sophisticated, Minimalist with subtle elegance)
class ElegantStyle extends BaseVisualStyle {
    constructor() {
        super('elegant');
    }

    drawNode(ctx, x, y, radius, state, nodeId) {
        const { color, textColor } = this.getNodeColors(state);
        
        ctx.save();
        
        // Subtle outer ring for depth
        ctx.strokeStyle = ColorUtils.addAlpha(color, 0.2);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
        
        // Soft gradient fill
        const gradient = ctx.createRadialGradient(x, y - radius/3, 0, x, y, radius);
        gradient.addColorStop(0, ColorUtils.interpolateColor(color, '#ffffff', 0.3));
        gradient.addColorStop(1, color);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Subtle inner highlight
        const highlight = ctx.createRadialGradient(x - radius/4, y - radius/4, 0, x, y, radius/2);
        highlight.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Clean border
        ctx.strokeStyle = ColorUtils.addAlpha('#ffffff', 0.6);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
        
        // Refined text
        this.drawNodeText(ctx, x, y, nodeId, textColor);
    }

    drawEdge(ctx, from, to, state, edge) {
        const color = this.getEdgeColor(state);
        const width = state.highlighted ? 3 : 1.5;
        
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        
        // Very subtle shadow for depth
        if (state.highlighted) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = ColorUtils.addAlpha(color, 0.3);
        }
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        
        ctx.restore();
    }

    getNodeColors(state) {
        // Sophisticated, muted colors
        if (state.current) return { color: '#5c9e5f', textColor: '#fff' }; // Sage green
        if (state.visited) return { color: '#e6b17e', textColor: '#333' }; // Soft gold
        return { color: '#6fa8dc', textColor: '#fff' }; // Soft blue
    }

    getEdgeColor(state) {
        if (state.mst) return '#a47db8'; // Muted purple
        if (state.explored) return '#d17a7a'; // Soft coral
        if (state.highlighted) return '#6fa8dc'; // Soft blue
        return '#c0c0c0'; // Light gray
    }

    drawNodeText(ctx, x, y, text, color) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = '500 16px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    getPhysicsConfig() {
        return {
            springStrength: 0.018,
            damping: 0.9,
            repulsion: 900,
            hoverRepulsion: 80
        };
    }
}

// Improved Force-Directed Physics System (Fruchterman-Reingold inspired)
// Optimized to minimize edge crossings and create flatter, more planar layouts
class SpringPhysics {
    constructor(config) {
        this.config = config || {};
        this.velocities = [];
        this.iteration = 0;
    }

    initialize(nodeCount) {
        this.velocities = Array(nodeCount).fill(null).map(() => ({ vx: 0, vy: 0 }));
        this.iteration = 0;
    }

    applyForces(nodePositions, edges, draggedNode, mousePos, bounds) {
        const forces = nodePositions.map(() => ({ fx: 0, fy: 0 }));
        this.iteration++;
        
        // Calculate optimal distance based on area and node count
        const area = bounds.width * bounds.height;
        const k = Math.sqrt(area / nodePositions.length) * 0.8; // Optimal distance
        
        // Repulsion between all nodes (inverse square law)
        for (let i = 0; i < nodePositions.length; i++) {
            for (let j = i + 1; j < nodePositions.length; j++) {
                const dx = nodePositions[j].x - nodePositions[i].x;
                const dy = nodePositions[j].y - nodePositions[i].y;
                const distSq = dx * dx + dy * dy;
                const dist = Math.sqrt(distSq) || 1;
                
                // Moderate repulsion - reduced strength
                const repulsion = this.config.repulsion / (distSq + 1);
                const fx = (dx / dist) * repulsion;
                const fy = (dy / dist) * repulsion;
                
                forces[i].fx -= fx;
                forces[i].fy -= fy;
                forces[j].fx += fx;
                forces[j].fy += fy;
            }
        }
        
        // Centering force to prevent drift (gentle)
        const centerX = bounds.width / 2;
        const centerY = bounds.height / 2;
        const centerStrength = 0.003; // Gentle pull toward center
        
        nodePositions.forEach((pos, i) => {
            const dx = centerX - pos.x;
            const dy = centerY - pos.y;
            
            forces[i].fx += dx * centerStrength;
            forces[i].fy += dy * centerStrength;
        });
        
        // Attraction along edges (spring force)
        edges.forEach(edge => {
            const i = edge.from;
            const j = edge.to;
            const dx = nodePositions[j].x - nodePositions[i].x;
            const dy = nodePositions[j].y - nodePositions[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const idealDist = Math.min(k, 180); // Cap ideal distance
            
            // Spring force toward ideal distance
            const force = (dist - idealDist) * this.config.springStrength;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            
            forces[i].fx += fx;
            forces[i].fy += fy;
            forces[j].fx -= fx;
            forces[j].fy -= fy;
        });
        
        // Very gentle planar force (optional, reduced)
        // Only apply if nodes are very close to reduce crossings slightly
        if (this.config.planarForce !== false && nodePositions.length < 20) {
            edges.forEach(edge => {
                const p1 = nodePositions[edge.from];
                const p2 = nodePositions[edge.to];
                
                nodePositions.forEach((node, i) => {
                    if (i === edge.from || i === edge.to) return;
                    
                    const edgeDx = p2.x - p1.x;
                    const edgeDy = p2.y - p1.y;
                    const edgeLength = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy) || 1;
                    
                    const t = Math.max(0, Math.min(1, 
                        ((node.x - p1.x) * edgeDx + (node.y - p1.y) * edgeDy) / (edgeLength * edgeLength)
                    ));
                    
                    const projX = p1.x + t * edgeDx;
                    const projY = p1.y + t * edgeDy;
                    
                    const dx = node.x - projX;
                    const dy = node.y - projY;
                    const distToEdge = Math.sqrt(dx * dx + dy * dy) || 1;
                    
                    // Very gentle push, only when very close
                    if (distToEdge < 40) {
                        const pushForce = (40 - distToEdge) * 0.05;
                        forces[i].fx += (dx / distToEdge) * pushForce;
                        forces[i].fy += (dy / distToEdge) * pushForce;
                    }
                });
            });
        }
        
        // Mouse interaction disabled - was making nodes hard to select
        
        // Update positions (simple mass-spring, no rotation)
        nodePositions.forEach((pos, i) => {
            if (i === draggedNode) return; // Don't update dragged node
            
            // Apply strong damping first
            this.velocities[i].vx *= 0.85; // Strong global damping
            this.velocities[i].vy *= 0.85;
            
            // Add forces
            this.velocities[i].vx += forces[i].fx;
            this.velocities[i].vy += forces[i].fy;
            
            // Apply per-style damping
            this.velocities[i].vx *= this.config.damping;
            this.velocities[i].vy *= this.config.damping;
            
            // Stop micro-movements (velocity threshold)
            const speed = Math.sqrt(this.velocities[i].vx ** 2 + this.velocities[i].vy ** 2);
            if (speed < 0.01) {
                this.velocities[i].vx = 0;
                this.velocities[i].vy = 0;
            }
            
            // Update position
            pos.x += this.velocities[i].vx;
            pos.y += this.velocities[i].vy;
            
            // Boundary constraints
            const margin = 50;
            pos.x = Math.max(margin, Math.min(bounds.width - margin, pos.x));
            pos.y = Math.max(margin, Math.min(bounds.height - margin, pos.y));
            
            // Friction at boundaries
            if (pos.x <= margin || pos.x >= bounds.width - margin) {
                this.velocities[i].vx *= 0.3; // Stronger boundary friction
            }
            if (pos.y <= margin || pos.y >= bounds.height - margin) {
                this.velocities[i].vy *= 0.3;
            }
        });
    }
}

// Frosted Glass Morphism Style
class FrostedGlassStyle extends BaseVisualStyle {
    constructor() {
        super('frosted');
    }
    
    getAnimationType() {
        return 'wave'; // Wave propagation instead of wobble
    }

    drawNode(ctx, x, y, radius, state, nodeId) {
        const { color, textColor } = this.getNodeColors(state);
        
        const wobble = this.getWobbleOffset(state, 0.3);
        x += wobble.x;
        y += wobble.y;
        
        ctx.save();
        
        // Drop shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 6;
        
        // Frosted glass background
        const bgGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        bgGradient.addColorStop(0, ColorUtils.addAlpha(color, 0.25));
        bgGradient.addColorStop(1, ColorUtils.addAlpha(color, 0.15));
        
        ctx.fillStyle = bgGradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Blur border effect (frosted edge)
        ctx.shadowBlur = 0;
        ctx.strokeStyle = ColorUtils.addAlpha('#ffffff', 0.5);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner highlight
        const highlightGradient = ctx.createRadialGradient(x - radius/2.5, y - radius/2.5, 0, x, y, radius);
        highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
        highlightGradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.2)');
        highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = highlightGradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Color border
        ctx.strokeStyle = ColorUtils.addAlpha(color, 0.6);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, radius - 1, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
        
        this.drawNodeText(ctx, x, y, nodeId, textColor);
    }

    drawEdge(ctx, from, to, state, edge) {
        const color = this.getEdgeColor(state);
        const baseWidth = state.highlighted ? 4 : state.mst ? 3 : 2;
        const width = baseWidth; // No width wobble for wave style
        const cp = this.getEdgeWave(state, from, to, 2); // Use wave propagation
        
        ctx.save();
        ctx.strokeStyle = ColorUtils.addAlpha(color, 0.7);
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        
        // Drop shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;
        
        if (state.mst) {
            ctx.shadowBlur = 18;
            ctx.shadowColor = color;
        } else if (state.highlighted) {
            ctx.shadowBlur = 12;
            ctx.shadowColor = color;
        }
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(cp.cpX, cp.cpY, to.x, to.y);
        ctx.stroke();
        
        ctx.restore();
    }

    getNodeColors(state) {
        if (state.floydK) return { color: '#ffd54f', textColor: '#333' };
        if (state.floydI) return { color: '#42a5f5', textColor: '#fff' };
        if (state.floydJ) return { color: '#ba68c8', textColor: '#fff' };
        if (state.spfaPopped) return { color: '#4caf50', textColor: '#fff' };
        if (state.spfaInQueue) return { color: '#00bcd4', textColor: '#fff' };
        if (state.kruskalSetIndex >= 0) {
            const colors = [
                { color: '#4caf50', textColor: '#fff' },
                { color: '#2196f3', textColor: '#fff' },
                { color: '#ff9800', textColor: '#fff' },
                { color: '#9c27b0', textColor: '#fff' },
                { color: '#f44336', textColor: '#fff' },
                { color: '#00bcd4', textColor: '#fff' },
                { color: '#ffeb3b', textColor: '#333' },
                { color: '#795548', textColor: '#fff' },
            ];
            return colors[state.kruskalSetIndex % colors.length];
        }
        if (state.primVisited) return { color: '#ba68c8', textColor: '#fff' };
        if (state.current) return { color: '#4caf50', textColor: '#fff' };
        if (state.visited) return { color: '#ffd54f', textColor: '#333' };
        return { color: '#64b5f6', textColor: '#fff' };
    }

    getEdgeColor(state) {
        if (state.negativeCycle) return '#dc3545'; // RED for negative cycle
        if (state.negativeEdge && !state.negativeCycle) return '#ff9800'; // ORANGE for negative edge (not cycle)
        if (state.hoveredPath) return '#ffc107'; // YELLOW/GOLD for hovered path
        if (state.pqTop) return '#4caf50'; // GREEN for PQ top
        if (state.mst) return '#ba68c8';
        if (state.explored) return '#ff6b6b';
        if (state.highlighted) return '#64b5f6';
        if (state.inPQ) return '#81c784'; // LIGHT GREEN for edges in PQ
        return '#999';
    }

    drawNodeText(ctx, x, y, text, color) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = color;
        ctx.font = '400 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    getPhysicsConfig() {
        return {
            springStrength: 0.02,
            repulsion: 900,
            damping: 0.92,
            planarForce: true
        };
    }
}

// Luxury Gradient Style
class LuxuryGradientStyle extends BaseVisualStyle {
    constructor() {
        super('luxury');
    }
    
    getAnimationType() {
        return 'pulse'; // Pulse/scale animation instead of wobble
    }

    drawNode(ctx, x, y, radius, state, nodeId) {
        const { color, textColor } = this.getNodeColors(state);
        
        const wobble = this.getWobbleOffset(state, 0.3);
        x += wobble.x;
        y += wobble.y;
        
        ctx.save();
        
        // Dramatic drop shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 8;
        
        // Luxury gradient with metallic effect
        const gradient = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
        const lightColor = ColorUtils.interpolateColor(color, '#ffffff', 0.3);
        const darkColor = ColorUtils.interpolateColor(color, '#000000', 0.3);
        
        gradient.addColorStop(0, lightColor);
        gradient.addColorStop(0.5, color);
        gradient.addColorStop(1, darkColor);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Glossy highlight
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        const highlightGradient = ctx.createRadialGradient(x - radius/2, y - radius/2, 0, x, y, radius * 1.2);
        highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
        highlightGradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.3)');
        highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = highlightGradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Gold/metallic border
        ctx.strokeStyle = ColorUtils.addAlpha(lightColor, 0.9);
        ctx.lineWidth = 2.5;
        ctx.shadowColor = ColorUtils.addAlpha(color, 0.5);
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
        
        this.drawNodeText(ctx, x, y, nodeId, textColor);
    }

    drawEdge(ctx, from, to, state, edge) {
        const color = this.getEdgeColor(state);
        const baseWidth = state.highlighted ? 5 : state.mst ? 4 : 2.5;
        const width = this.getEdgeWobbleWidth(state, baseWidth);
        const cp = this.getEdgeWobble(state, from, to);
        
        ctx.save();
        
        // Gradient edge
        const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
        gradient.addColorStop(0, ColorUtils.addAlpha(color, 0.8));
        gradient.addColorStop(0.5, color);
        gradient.addColorStop(1, ColorUtils.addAlpha(color, 0.8));
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        
        // Drop shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;
        
        if (state.mst) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = color;
        } else if (state.highlighted) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = color;
        }
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(cp.cpX, cp.cpY, to.x, to.y);
        ctx.stroke();
        
        ctx.restore();
    }

    getNodeColors(state) {
        if (state.floydK) return { color: '#ffd54f', textColor: '#333' };
        if (state.floydI) return { color: '#42a5f5', textColor: '#fff' };
        if (state.floydJ) return { color: '#ba68c8', textColor: '#fff' };
        if (state.kruskalSetIndex >= 0) {
            const colors = [
                { color: '#4caf50', textColor: '#fff' },
                { color: '#2196f3', textColor: '#fff' },
                { color: '#ff9800', textColor: '#fff' },
                { color: '#9c27b0', textColor: '#fff' },
                { color: '#f44336', textColor: '#fff' },
                { color: '#00bcd4', textColor: '#fff' },
                { color: '#ffeb3b', textColor: '#333' },
                { color: '#795548', textColor: '#fff' },
            ];
            return colors[state.kruskalSetIndex % colors.length];
        }
        if (state.primVisited) return { color: '#ba68c8', textColor: '#fff' };
        if (state.current) return { color: '#4caf50', textColor: '#fff' };
        if (state.visited) return { color: '#ffd54f', textColor: '#333' };
        return { color: '#64b5f6', textColor: '#fff' };
    }

    getEdgeColor(state) {
        if (state.negativeEdge && !state.negativeCycle) return '#ff9800'; // ORANGE for negative edge (not cycle)
        if (state.negativeCycle) return '#dc3545'; // RED for negative cycle
        if (state.hoveredPath) return '#ffc107'; // YELLOW/GOLD for hovered path
        if (state.mst) return '#ba68c8';
        if (state.explored) return '#ff6b6b';
        if (state.highlighted) return '#64b5f6';
        return '#999';
    }

    drawNodeText(ctx, x, y, text, color) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = color;
        ctx.font = '500 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    getPhysicsConfig() {
        return {
            springStrength: 0.025,
            repulsion: 1000,
            damping: 0.90,
            planarForce: true
        };
    }
}

// Crystal Transparent Style
class CrystalStyle extends BaseVisualStyle {
    constructor() {
        super('crystal');
    }
    
    getAnimationType() {
        return 'none'; // No animation - clean and still
    }

    drawNode(ctx, x, y, radius, state, nodeId) {
        const { color, textColor } = this.getNodeColors(state);
        
        const wobble = this.getWobbleOffset(state, 0.3);
        x += wobble.x;
        y += wobble.y;
        
        ctx.save();
        
        // Soft shadow for crystal
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 5;
        
        // Crystal base with transparency
        const baseGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        baseGradient.addColorStop(0, ColorUtils.addAlpha(color, 0.4));
        baseGradient.addColorStop(0.7, ColorUtils.addAlpha(color, 0.2));
        baseGradient.addColorStop(1, ColorUtils.addAlpha(color, 0.1));
        
        ctx.fillStyle = baseGradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Multiple crystalline facets
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Facet 1 (top-left)
        const facet1 = ctx.createRadialGradient(x - radius/2, y - radius/2, 0, x, y, radius/1.5);
        facet1.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        facet1.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
        facet1.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = facet1;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Facet 2 (bottom-right)
        const facet2 = ctx.createRadialGradient(x + radius/3, y + radius/3, 0, x, y, radius);
        facet2.addColorStop(0, ColorUtils.addAlpha(color, 0.5));
        facet2.addColorStop(0.6, ColorUtils.addAlpha(color, 0));
        
        ctx.fillStyle = facet2;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Crystal outline
        ctx.strokeStyle = ColorUtils.addAlpha(color, 0.8);
        ctx.lineWidth = 2;
        ctx.shadowColor = ColorUtils.addAlpha(color, 0.4);
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner sparkle ring
        ctx.strokeStyle = ColorUtils.addAlpha('#ffffff', 0.6);
        ctx.lineWidth = 1;
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
        
        this.drawNodeText(ctx, x, y, nodeId, textColor);
    }

    drawEdge(ctx, from, to, state, edge) {
        const color = this.getEdgeColor(state);
        const baseWidth = state.highlighted ? 4 : state.mst ? 3 : 2;
        const width = this.getEdgeWobbleWidth(state, baseWidth);
        const cp = this.getEdgeWobble(state, from, to);
        
        ctx.save();
        ctx.strokeStyle = ColorUtils.addAlpha(color, 0.5);
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        
        // Soft shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;
        
        if (state.mst) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = ColorUtils.addAlpha(color, 0.8);
            ctx.strokeStyle = ColorUtils.addAlpha(color, 0.7);
        } else if (state.highlighted) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = ColorUtils.addAlpha(color, 0.6);
            ctx.strokeStyle = ColorUtils.addAlpha(color, 0.6);
        }
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(cp.cpX, cp.cpY, to.x, to.y);
        ctx.stroke();
        
        // Sparkle overlay for crystal effect
        if (state.mst || state.highlighted) {
            ctx.strokeStyle = ColorUtils.addAlpha('#ffffff', 0.4);
            ctx.lineWidth = 1;
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.quadraticCurveTo(cp.cpX, cp.cpY, to.x, to.y);
            ctx.stroke();
        }
        
        ctx.restore();
    }

    getNodeColors(state) {
        if (state.floydK) return { color: '#ffd54f', textColor: '#333' };
        if (state.floydI) return { color: '#42a5f5', textColor: '#fff' };
        if (state.floydJ) return { color: '#ba68c8', textColor: '#fff' };
        if (state.spfaPopped) return { color: '#4caf50', textColor: '#fff' };
        if (state.spfaInQueue) return { color: '#00bcd4', textColor: '#fff' };
        if (state.kruskalSetIndex >= 0) {
            const colors = [
                { color: '#4caf50', textColor: '#fff' },
                { color: '#2196f3', textColor: '#fff' },
                { color: '#ff9800', textColor: '#fff' },
                { color: '#9c27b0', textColor: '#fff' },
                { color: '#f44336', textColor: '#fff' },
                { color: '#00bcd4', textColor: '#fff' },
                { color: '#ffeb3b', textColor: '#333' },
                { color: '#795548', textColor: '#fff' },
            ];
            return colors[state.kruskalSetIndex % colors.length];
        }
        if (state.primVisited) return { color: '#ba68c8', textColor: '#fff' };
        if (state.current) return { color: '#4caf50', textColor: '#fff' };
        if (state.visited) return { color: '#ffd54f', textColor: '#333' };
        return { color: '#64b5f6', textColor: '#fff' };
    }

    getEdgeColor(state) {
        if (state.negativeEdge && !state.negativeCycle) return '#ff9800'; // ORANGE for negative edge (not cycle)
        if (state.negativeCycle) return '#dc3545'; // RED for negative cycle
        if (state.hoveredPath) return '#ffc107'; // YELLOW/GOLD for hovered path
        if (state.mst) return '#ba68c8';
        if (state.explored) return '#ff6b6b';
        if (state.highlighted) return '#64b5f6';
        return '#999';
    }

    drawNodeText(ctx, x, y, text, color) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = color;
        ctx.font = '400 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    getPhysicsConfig() {
        return {
            springStrength: 0.022,
            repulsion: 950,
            damping: 0.91,
            planarForce: true
        };
    }
}

// Soft Shadow Style (Neumorphism-inspired)
class SoftShadowStyle extends BaseVisualStyle {
    constructor() {
        super('soft-shadow');
    }

    drawNode(ctx, x, y, radius, state, nodeId) {
        const { color, textColor } = this.getNodeColors(state);
        
        const wobble = this.getWobbleOffset(state, 0.3);
        x += wobble.x;
        y += wobble.y;
        
        ctx.save();
        
        // Dark shadow (bottom-right)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 8;
        ctx.shadowOffsetY = 8;
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Light shadow (top-left)
        ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = -6;
        ctx.shadowOffsetY = -6;
        
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner shadow for depth
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        const innerGradient = ctx.createRadialGradient(x - radius/3, y - radius/3, 0, x, y, radius);
        innerGradient.addColorStop(0, ColorUtils.interpolateColor(color, '#ffffff', 0.2));
        innerGradient.addColorStop(1, ColorUtils.interpolateColor(color, '#000000', 0.1));
        
        ctx.fillStyle = innerGradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        this.drawNodeText(ctx, x, y, nodeId, textColor);
    }

    drawEdge(ctx, from, to, state, edge) {
        const color = this.getEdgeColor(state);
        const baseWidth = state.pqTop ? 4 : state.highlighted ? 4 : state.mst ? 3 : state.inPQ ? 2.5 : 2;
        const width = this.getEdgeWobbleWidth(state, baseWidth);
        const cp = this.getEdgeWobble(state, from, to);
        
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.globalAlpha = state.inPQ && !state.pqTop ? 0.6 : 0.9;
        
        // Dashed line for non-top PQ edges
        if (state.inPQ && !state.pqTop) {
            ctx.setLineDash([8, 4]);
        }
        
        // Soft shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;
        
        if (state.pqTop) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#4caf50';
        } else if (state.mst) {
            ctx.shadowBlur = 18;
            ctx.shadowColor = color;
        } else if (state.highlighted) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = color;
        } else if (state.inPQ) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#81c784';
        }
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(cp.cpX, cp.cpY, to.x, to.y);
        ctx.stroke();
        
        // Draw batch indicator (subtle dotted outline) if part of exploration batch
        if (state.inBatch && !state.highlighted && !state.inPQ) {
            ctx.save();
            ctx.strokeStyle = '#90caf9';
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.4;
            ctx.setLineDash([3, 3]);
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.quadraticCurveTo(cp.cpX, cp.cpY, to.x, to.y);
            ctx.stroke();
            ctx.restore();
        }
        
        ctx.restore();
    }

    getNodeColors(state) {
        if (state.floydK) return { color: '#ffd54f', textColor: '#333' };
        if (state.floydI) return { color: '#42a5f5', textColor: '#fff' };
        if (state.floydJ) return { color: '#ba68c8', textColor: '#fff' };
        if (state.kruskalSetIndex >= 0) {
            const colors = [
                { color: '#4caf50', textColor: '#fff' },
                { color: '#2196f3', textColor: '#fff' },
                { color: '#ff9800', textColor: '#fff' },
                { color: '#9c27b0', textColor: '#fff' },
                { color: '#f44336', textColor: '#fff' },
                { color: '#00bcd4', textColor: '#fff' },
                { color: '#ffeb3b', textColor: '#333' },
                { color: '#795548', textColor: '#fff' },
            ];
            return colors[state.kruskalSetIndex % colors.length];
        }
        if (state.primVisited) return { color: '#ba68c8', textColor: '#fff' };
        if (state.current) return { color: '#4caf50', textColor: '#fff' };
        if (state.visited) return { color: '#ffd54f', textColor: '#333' };
        return { color: '#64b5f6', textColor: '#fff' };
    }

    getEdgeColor(state) {
        if (state.negativeEdge && !state.negativeCycle) return '#ff9800'; // ORANGE for negative edge (not cycle)
        if (state.negativeCycle) return '#dc3545'; // RED for negative cycle
        if (state.hoveredPath) return '#ffc107'; // YELLOW/GOLD for hovered path
        if (state.mst) return '#ba68c8';
        if (state.explored) return '#ff6b6b';
        if (state.highlighted) return '#64b5f6';
        return '#999';
    }

    drawNodeText(ctx, x, y, text, color) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = color;
        ctx.font = '400 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    getPhysicsConfig() {
        return {
            springStrength: 0.02,
            repulsion: 900,
            damping: 0.92,
            planarForce: true
        };
    }
}
