// High-Quality Canvas Rendering
// Creates high-quality animations using Canvas 2D with advanced techniques
// Note: Animation runtime is for loading .riv files. For programmatic animations,
// we use Canvas 2D with high-quality rendering (smooth gradients, vector-style)

class AnimationProgrammatic {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.rive = null;
        this.animations = new Map();
        this.activeAnimations = [];
        
        // Check if animation runtime is available (for potential .riv file loading)
        this.riveAvailable = typeof window.rive !== 'undefined';
        
        if (this.riveAvailable) {
            console.log('Animation runtime detected - using high-quality Canvas rendering');
            this.initializeRenderer();
        } else {
            console.log('Using high-quality Canvas rendering');
            this.riveAvailable = true; // We can still render with Canvas
            this.initializeRenderer();
        }
    }

    async initializeRenderer() {
        try {
            // Note: Animation runtime is for loading .riv files, not programmatic creation
            // We'll use Canvas 2D with high-quality rendering techniques instead
            // This gives us smooth gradients, vector-quality, and GPU acceleration
            
            console.log('High-quality Canvas renderer initialized');
            this.riveAvailable = true; // Use Canvas with advanced techniques
        } catch (error) {
            console.error('Error initializing renderer:', error);
            this.riveAvailable = false;
        }
    }

    /**
     * Create a node pulse using high-quality rendering
     * Uses Canvas 2D with smooth gradients and vector-style quality
     */
    createNodePulse(x, y, color, intensity = 1) {
        if (!this.riveAvailable) {
            console.warn('Renderer not initialized');
            return;
        }

        const animation = {
            type: 'pulse',
            x, y, color, intensity,
            radius: 30,
            maxRadius: 60 * intensity,
            opacity: 0.8,
            startTime: Date.now(),
            duration: 800 // milliseconds
        };

        this.activeAnimations.push(animation);
        return animation;
    }

    /**
     * Create edge flow particles using high-quality rendering
     */
    createEdgeFlow(x1, y1, x2, y2, color) {
        if (!this.riveAvailable) return;

        const particleCount = 3;
        for (let i = 0; i < particleCount; i++) {
            const animation = {
                type: 'edgeParticle',
                x1, y1, x2, y2, color,
                progress: i / particleCount,
                speed: 0.015,
                size: 6,
                opacity: 0.8,
                startTime: Date.now()
            };
            this.activeAnimations.push(animation);
        }
    }

    /**
     * Create explosion using high-quality rendering
     */
    createExplosion(x, y, color, particleCount = 12) {
        if (!this.riveAvailable) return;

        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            const animation = {
                type: 'explosionParticle',
                x, y, color,
                angle,
                distance: 0,
                maxDistance: 80,
                size: 4,
                opacity: 1,
                startTime: Date.now(),
                duration: 600
            };
            this.activeAnimations.push(animation);
        }
    }

    /**
     * Create curved path using high-quality bezier rendering
     * This demonstrates smooth curve drawing with animation support
     */
    createBezierCurve(points, color, animate = true) {
        if (!this.riveAvailable || points.length < 2) return;

        const animation = {
            type: 'bezierCurve',
            points, // Array of {x, y} points
            color,
            progress: 0,
            duration: 1000,
            startTime: Date.now(),
            animate
        };

        this.activeAnimations.push(animation);
        return animation;
    }

    /**
     * Render all active animations
     */
    render() {
        if (!this.riveAvailable || !this.ctx) {
            return;
        }

        const ctx = this.ctx;
        const now = Date.now();
        
        // Filter out completed animations
        this.activeAnimations = this.activeAnimations.filter(anim => {
            const elapsed = now - anim.startTime;
            const progress = Math.min(elapsed / (anim.duration || 1000), 1);
            
            // Render based on animation type
            switch (anim.type) {
                case 'pulse':
                    return this.renderPulse(anim, progress);
                
                case 'edgeParticle':
                    return this.renderEdgeParticle(anim);
                
                case 'explosionParticle':
                    return this.renderExplosionParticle(anim, progress);
                
                case 'bezierCurve':
                    return this.renderBezierCurve(anim, progress);
                
                default:
                    return false;
            }
        });
    }

    /**
     * Render pulse animation using high-quality vector rendering
     */
    renderPulse(anim, progress) {
        if (progress >= 1) return false;

        const ctx = this.ctx;
        const currentRadius = anim.radius + (anim.maxRadius - anim.radius) * progress;
        const currentOpacity = anim.opacity * (1 - progress);

        ctx.save();
        
        // Use high-quality rendering with smooth gradients
        const gradient = ctx.createRadialGradient(
            anim.x, anim.y, 0,
            anim.x, anim.y, currentRadius
        );
        
        const color = this.hexToRgba(anim.color, currentOpacity);
        const centerColor = this.hexToRgba(anim.color, currentOpacity * 1.5);
        
        gradient.addColorStop(0, centerColor);
        gradient.addColorStop(0.5, color);
        gradient.addColorStop(1, this.hexToRgba(anim.color, 0));
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(anim.x, anim.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        return true;
    }

    /**
     * Render edge particle with smooth interpolation
     */
    renderEdgeParticle(anim) {
        anim.progress += anim.speed;
        if (anim.progress > 1) return false;

        const ctx = this.ctx;
        const x = anim.x1 + (anim.x2 - anim.x1) * anim.progress;
        const y = anim.y1 + (anim.y2 - anim.y1) * anim.progress;
        
        // Fade in at start, fade out at end
        let opacity = anim.opacity;
        if (anim.progress < 0.2) {
            opacity *= anim.progress / 0.2;
        } else if (anim.progress > 0.8) {
            opacity *= (1 - anim.progress) / 0.2;
        }

        ctx.save();
        
        // High-quality glow
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, anim.size * 2);
        gradient.addColorStop(0, this.hexToRgba(anim.color, opacity));
        gradient.addColorStop(0.5, this.hexToRgba(anim.color, opacity * 0.5));
        gradient.addColorStop(1, this.hexToRgba(anim.color, 0));
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, anim.size * 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        return true;
    }

    /**
     * Render explosion particle
     */
    renderExplosionParticle(anim, progress) {
        if (progress >= 1) return false;

        const ctx = this.ctx;
        const easeOut = 1 - Math.pow(1 - progress, 3); // Cubic ease-out
        const distance = anim.maxDistance * easeOut;
        const x = anim.x + Math.cos(anim.angle) * distance;
        const y = anim.y + Math.sin(anim.angle) * distance;
        const opacity = anim.opacity * (1 - progress);
        const size = anim.size * (1 - progress * 0.5);

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = anim.color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        return true;
    }

    /**
     * Render bezier curve with animation
     * This shows how to draw smooth curves
     */
    renderBezierCurve(anim, progress) {
        if (!anim.animate) progress = 1;
        if (progress >= 1 && anim.animate) return false;

        const ctx = this.ctx;
        const points = anim.points;
        
        if (points.length < 2) return false;

        ctx.save();
        ctx.strokeStyle = anim.color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Add glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = anim.color;
        
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        
        // Draw smooth curve through points
        for (let i = 1; i < points.length; i++) {
            if (anim.animate && i / points.length > progress) break;
            
            if (i === points.length - 1) {
                // Last point
                ctx.lineTo(points[i].x, points[i].y);
            } else {
                // Use quadratic curve for smoothness
                const xMid = (points[i].x + points[i + 1].x) / 2;
                const yMid = (points[i].y + points[i + 1].y) / 2;
                ctx.quadraticCurveTo(points[i].x, points[i].y, xMid, yMid);
            }
        }
        
        ctx.stroke();
        ctx.restore();

        return anim.animate; // Keep if animating
    }

    /**
     * Clear all active animations
     */
    clear() {
        this.activeAnimations = [];
    }

    /**
     * Utility: Convert hex to rgba
     */
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnimationProgrammatic;
}
