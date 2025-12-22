// New Fancy Visual Styles

// Frosted Glass Morphism Style
class FrostedGlassStyle extends BaseVisualStyle {
    constructor() {
        super('frosted');
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
        const width = this.getEdgeWobbleWidth(state, baseWidth);
        const cp = this.getEdgeWobble(state, from, to);
        
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
        const baseWidth = state.highlighted ? 4 : state.mst ? 3 : 2;
        const width = this.getEdgeWobbleWidth(state, baseWidth);
        const cp = this.getEdgeWobble(state, from, to);
        
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        
        // Soft shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;
        
        if (state.mst) {
            ctx.shadowBlur = 18;
            ctx.shadowColor = color;
        } else if (state.highlighted) {
            ctx.shadowBlur = 14;
            ctx.shadowColor = color;
        }
        
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(cp.cpX, cp.cpY, to.x, to.y);
        ctx.stroke();
        
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
