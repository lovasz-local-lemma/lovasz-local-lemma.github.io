// Animation Integration for Graph Visualizer
// This module handles animations and effects

class AnimationIntegration {
    constructor(canvasId, graphCanvasCtx = null) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.graphCtx = graphCanvasCtx; // Use graph canvas for particles (renders on top)
        this.riveInstances = new Map();
        this.particleSystem = [];
        this.animationFrame = null;
        this.initialized = false;
        this.useRealRive = false; // Toggle between real animations and programmatic
        this.useProgrammaticRive = true; // Use animation runtime for nodes
        
        // Real animations (from .riv files)
        this.riveAnimations = {
            nodePulse: null,
            edgeFlow: null,
            explosion: null,
            trail: null
        };
        
        // Programmatic animation (runtime API)
        this.riveProgrammatic = null;
        
        // Animation queues for coordinated effects
        this.animationQueue = [];
        
        if (this.canvas) {
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
            
            // Initialize programmatic animation if available
            if (typeof AnimationProgrammatic !== 'undefined') {
                this.riveProgrammatic = new AnimationProgrammatic(this.canvas);
                console.log('Programmatic animation initialized for nodes');
            }
        }
    }

    resizeCanvas() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    /**
     * Initialize animations (if .riv files are available)
     * For this demo, we'll use programmatic animations
     */
    async initialize() {
        try {
            // For this demo, we'll create programmatic animations
            this.initialized = true;
            this.startAnimationLoop();
            console.log('Animation Integration initialized (programmatic mode)');
        } catch (error) {
            console.warn('Animation initialization error', error);
            this.initialized = true;
            this.startAnimationLoop();
        }
    }

    /**
     * Load real animation files from assets folder
     */
    async loadRiveFiles() {
        try {
            console.log('Attempting to load animation files...');
            
            // Check if rive is available
            if (typeof window.rive === 'undefined') {
                console.error('Animation runtime not loaded');
                return false;
            }

            const riveFiles = {
                nodePulse: 'assets/node-pulse.riv',
                edgeFlow: 'assets/edge-flow.riv',
                explosion: 'assets/explosion.riv',
                trail: 'assets/trail.riv'
            };

            // Try to load each file
            let loadedCount = 0;
            const loadPromises = Object.entries(riveFiles).map(async ([key, path]) => {
                try {
                    const response = await fetch(path);
                    if (!response.ok) {
                        console.warn(`${path} not found`);
                        return false;
                    }
                    
                    const arrayBuffer = await response.arrayBuffer();
                    
                    // Create animation instance
                    const rive = new window.rive.Rive({
                        buffer: arrayBuffer,
                        canvas: this.canvas,
                        autoplay: false,
                        stateMachines: 'StateMachine', // Adjust based on your .riv file
                        onLoad: () => {
                            console.log(`Loaded ${path}`);
                            this.riveAnimations[key] = rive;
                            loadedCount++;
                        },
                        onLoadError: (err) => {
                            console.error(`Error loading ${path}:`, err);
                        }
                    });
                    
                    return true;
                } catch (error) {
                    console.warn(`Failed to load ${path}:`, error);
                    return false;
                }
            });

            await Promise.all(loadPromises);
            
            if (loadedCount === 0) {
                console.error('No animation files loaded. Using fallback animations.');
                return false;
            }
            
            console.log(`Successfully loaded ${loadedCount} animation file(s)`);
            return true;
            
        } catch (error) {
            console.error('Error loading animation files:', error);
            return false;
        }
    }

    /**
     * Start the animation loop for particle effects and transitions
     */
    startAnimationLoop() {
        const animate = () => {
            if (this.ctx && this.canvas) {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                
                // Render programmatic animations (for nodes)
                if (this.useProgrammaticRive && this.riveProgrammatic) {
                    this.riveProgrammatic.render();
                }
                
                // Render canvas fallback particles (for edges/other effects)
                this.updateParticles();
                this.renderParticles();
            }
            this.animationFrame = requestAnimationFrame(animate);
        };
        animate();
    }

    /**
     * Clear specific particle types (for state transitions)
     */
    clearParticleType(type) {
        this.particleSystem = this.particleSystem.filter(p => p.type !== type);
    }
    
    /**
     * Create node pulse/glow effect
     */
    createNodePulse(x, y, color, intensity = 1, speedMultiplier = 1) {
        // Priority 1: Real animation files (.riv)
        if (this.useRealRive && this.riveAnimations.nodePulse) {
            try {
                const stateMachine = this.riveAnimations.nodePulse.stateMachineInputs('StateMachine');
                if (stateMachine) {
                    const xInput = stateMachine.find(input => input.name === 'x');
                    const yInput = stateMachine.find(input => input.name === 'y');
                    const triggerInput = stateMachine.find(input => input.name === 'trigger');
                    
                    if (xInput) xInput.value = x;
                    if (yInput) yInput.value = y;
                    if (triggerInput) triggerInput.fire();
                }
                return;
            } catch (error) {
                console.warn('Error triggering animation pulse:', error);
            }
        }
        
        // Priority 2: Programmatic animation (runtime API for nodes)
        if (this.useProgrammaticRive && this.riveProgrammatic) {
            this.riveProgrammatic.createNodePulse(x, y, color, intensity);
            return;
        }
        
        // Priority 3: Canvas fallback
        const pulse = {
            x, y,
            radius: 30,
            maxRadius: 60,
            alpha: 0.6 * intensity,
            speed: 2 * speedMultiplier,
            fadeSpeed: 0.01 * speedMultiplier,
            color,
            type: 'pulse'
        };
        this.particleSystem.push(pulse);
    }

    /**
     * Create edge highlight effect with traveling particles
     */
    createEdgeFlow(x1, y1, x2, y2, color) {
        const particles = 3;
        for (let i = 0; i < particles; i++) {
            const particle = {
                x: x1,
                y: y1,
                targetX: x2,
                targetY: y2,
                progress: i / particles,
                speed: 0.02,
                color,
                size: 6,
                type: 'flow',
                alpha: 0.8
            };
            this.particleSystem.push(particle);
        }
    }

    /**
     * Create curved dashed arrow effect (for Floyd visualization)
     */
    createCurvedDashedArrow(x1, y1, x2, y2, color) {
        const particles = 12; // More particles for longer curve
        for (let i = 0; i < particles; i++) {
            const particle = {
                x: x1,
                y: y1,
                currentX: x1,
                currentY: y1,
                targetX: x2,
                targetY: y2,
                progress: i / particles,
                speed: 0.015, // Slightly slower for smoother animation
                color,
                size: 3, // Smaller points
                type: 'curved-dashed',
                alpha: 0.8,
                life: 1.5
            };
            this.particleSystem.push(particle);
        }
    }
    
    /**
     * Create explosion effect for algorithm events
     */
    createExplosion(x, y, color, count = 12) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const particle = {
                x, y,
                vx: Math.cos(angle) * 3,
                vy: Math.sin(angle) * 3,
                size: 4,
                alpha: 1,
                color,
                type: 'explosion',
                life: 1
            };
            this.particleSystem.push(particle);
        }
    }

    /**
     * Create green circle indicator for Floyd outer loop node
     */
    createGreenCircleIndicator(x, y) {
        const indicator = {
            x, y,
            type: 'green-circle',
            color: '#4caf50',
            size: 30,
            alpha: 1,
            life: 2.0,
            maxLife: 2.0
        };
        this.particleSystem.push(indicator);
    }
    
    /**
     * Create glowing path visualization for Floyd advanced mode
     */
    createGlowingPath(x1, y1, x2, y2, x3, y3, color, isAccepted) {
        // Draw a curved path through all three points
        const path = {
            x1, y1, x2, y2, x3, y3,
            type: 'glowing-path',
            color,
            isAccepted,
            alpha: 1,
            life: 1.5,
            maxLife: 1.5,
            pulsePhase: 0
        };
        this.particleSystem.push(path);
    }
    
    /**
     * Create dashed triangle for Floyd path visualization
     */
    createDashedTriangle(x1, y1, x2, y2, x3, y3, color, speedMultiplier = 1) {
        const triangle = {
            x1, y1, x2, y2, x3, y3,
            type: 'dashed-triangle',
            color,
            alpha: 1,
            life: 1.0 / speedMultiplier,  // Faster at higher speeds
            maxLife: 1.0 / speedMultiplier,
            fadeSpeed: 0.016 * speedMultiplier
        };
        this.particleSystem.push(triangle);
    }
    
    /**
     * Create gradient trail effect (bezier curves)
     */
    createTrail(points, color) {
        if (points.length < 2) return;

        // Use programmatic animation for curves if available
        if (this.useProgrammaticRive && this.riveProgrammatic) {
            this.riveProgrammatic.createBezierCurve(points, color, true);
            return;
        }

        // Canvas fallback
        const trail = {
            points: [...points],
            color,
            alpha: 0.8,
            width: 4,
            type: 'trail',
            life: 1
        };
        this.particleSystem.push(trail);
    }
    
    /**
     * Create rotating radial ring around node (like clock animation at 12:00)
     */
    createRadialRing(x, y, color, segments = 12, duration = 1.0) {
        const ring = {
            x, y,
            color,
            segments,
            radius: 25,
            maxRadius: 50,
            rotation: 0,
            rotationSpeed: Math.PI * 2 / 60, // Full rotation in 60 frames
            alpha: 1,
            life: duration,
            maxLife: duration,
            type: 'radialRing'
        };
        this.particleSystem.push(ring);
    }
    
    /**
     * Create celebration effect with multiple radial rings
     */
    createCelebrationRings(x, y, color) {
        // Create 3 waves of rings with delays
        for (let wave = 0; wave < 3; wave++) {
            setTimeout(() => {
                this.createRadialRing(x, y, color, 16, 1.5);
            }, wave * 150);
        }
    }
    
    /**
     * Draw curves with extra inputs
     * This demonstrates how to draw smooth curves
     * 
     * @param {Object} options - Curve options
     * @param {Array} options.points - Array of {x, y} points
     * @param {string} options.color - Curve color
     * @param {number} options.width - Line width
     * @param {boolean} options.animated - Animate drawing
     * @param {string} options.style - 'smooth', 'sharp', 'dashed'
     * @param {Object} options.inputs - Extra animation inputs
     */
    createAnimatedCurve(options) {
        const {
            points = [],
            color = '#4caf50',
            width = 3,
            animated = false,
            style = 'smooth',
            inputs = {}
        } = options;
        
        if (points.length < 2) return;
        
        // If using real animation files with curve support
        if (this.useRealRive && this.riveAnimations.trail) {
            try {
                const stateMachine = this.riveAnimations.trail.stateMachineInputs('StateMachine');
                if (stateMachine) {
                    // Set all the custom inputs
                    const triggerInput = stateMachine.find(i => i.name === 'trigger');
                    const colorInput = stateMachine.find(i => i.name === 'color');
                    const widthInput = stateMachine.find(i => i.name === 'width');
                    const styleInput = stateMachine.find(i => i.name === 'style');
                    
                    // Set points array (if supported by your .riv file)
                    const pointsInput = stateMachine.find(i => i.name === 'points');
                    
                    if (triggerInput) triggerInput.fire();
                    if (colorInput) colorInput.value = color;
                    if (widthInput) widthInput.value = width;
                    if (styleInput) styleInput.value = style === 'smooth' ? 0 : style === 'sharp' ? 1 : 2;
                    
                    // Set any extra custom inputs
                    Object.entries(inputs).forEach(([key, value]) => {
                        const input = stateMachine.find(i => i.name === key);
                        if (input) input.value = value;
                    });
                    
                    // Note: Setting array of points requires special handling
                    // You'd typically use multiple number inputs (x1, y1, x2, y2, etc.)
                    // or expose them through a custom component
                    if (pointsInput && points.length <= 10) {
                        points.forEach((pt, i) => {
                            const xInput = stateMachine.find(inp => inp.name === `x${i}`);
                            const yInput = stateMachine.find(inp => inp.name === `y${i}`);
                            if (xInput) xInput.value = pt.x;
                            if (yInput) yInput.value = pt.y;
                        });
                    }
                }
                return;
            } catch (error) {
                console.warn('Error creating animated curve:', error);
            }
        }
        
        // Use programmatic animation
        if (this.useProgrammaticRive && this.riveProgrammatic) {
            this.riveProgrammatic.createBezierCurve(points, color, animated);
            return;
        }
        
        // Canvas fallback - draw curve immediately
        this.drawCanvasCurve(points, color, width, style);
    }
    
    /**
     * Canvas fallback for curve drawing
     */
    drawCanvasCurve(points, color, width, style) {
        if (!this.ctx || points.length < 2) return;
        
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (style === 'dashed') {
            ctx.setLineDash([10, 5]);
        }
        
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        
        if (style === 'sharp') {
            // Sharp corners
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
        } else {
            // Smooth curves
            for (let i = 1; i < points.length - 1; i++) {
                const xMid = (points[i].x + points[i + 1].x) / 2;
                const yMid = (points[i].y + points[i + 1].y) / 2;
                ctx.quadraticCurveTo(points[i].x, points[i].y, xMid, yMid);
            }
            ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        }
        
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Update particle system
     */
    updateParticles() {
        this.particleSystem = this.particleSystem.filter(particle => {
            switch (particle.type) {
                case 'pulse':
                    particle.radius += particle.speed;
                    particle.alpha -= (particle.fadeSpeed || 0.01);
                    return particle.alpha > 0 && particle.radius < particle.maxRadius;

                case 'flow':
                    particle.progress += particle.speed;
                    particle.x = particle.x + (particle.targetX - particle.x) * particle.speed;
                    particle.y = particle.y + (particle.targetY - particle.y) * particle.speed;
                    return particle.progress < 1;
                
                case 'curved-dashed':
                    particle.progress += particle.speed;
                    particle.life -= 0.016;
                    particle.alpha = Math.max(0, particle.life * 0.6);
                    // Calculate curved path (quadratic bezier)
                    const t = particle.progress;
                    const dx = particle.targetX - particle.x;
                    const dy = particle.targetY - particle.y;
                    const midX = (particle.x + particle.targetX) / 2;
                    const midY = (particle.y + particle.targetY) / 2;
                    // Control point perpendicular to line
                    const controlX = midX - dy * 0.2;
                    const controlY = midY + dx * 0.2;
                    // Update position along curve
                    const t1 = 1 - t;
                    particle.currentX = t1 * t1 * particle.x + 2 * t1 * t * controlX + t * t * particle.targetX;
                    particle.currentY = t1 * t1 * particle.y + 2 * t1 * t * controlY + t * t * particle.targetY;
                    return particle.progress < 1 && particle.life > 0;

                case 'explosion':
                    particle.x += particle.vx;
                    particle.y += particle.vy;
                    particle.vx *= 0.95;
                    particle.vy *= 0.95;
                    particle.life -= 0.02;
                    particle.alpha = particle.life;
                    return particle.life > 0;

                case 'trail':
                    particle.life -= 0.02;
                    particle.alpha = particle.life * 0.8;
                    return particle.life > 0;
                
                case 'radialRing':
                    particle.rotation += particle.rotationSpeed;
                    particle.radius += (particle.maxRadius - particle.radius) * 0.05;
                    particle.life -= 0.016; // ~60fps
                    particle.alpha = particle.life / particle.maxLife;
                    return particle.life > 0;
                
                case 'acceptance':
                case 'rejection':
                    particle.life -= 0.016;
                    // Flash effect: oscillate alpha
                    particle.alpha = 0.5 + 0.5 * Math.sin(particle.life * 20);
                    return particle.life > 0;
                
                case 'green-circle':
                    particle.life -= 0.008; // Slower fade
                    particle.alpha = particle.life / particle.maxLife;
                    return particle.life > 0;
                
                case 'dashed-triangle':
                    particle.life -= (particle.fadeSpeed || 0.016);
                    particle.alpha = particle.life / particle.maxLife;
                    return particle.life > 0;
                
                case 'glowing-path':
                    particle.life -= 0.016;
                    particle.pulsePhase += 0.1;
                    // Fade out while pulsing
                    const baseFade = particle.life / particle.maxLife;
                    particle.alpha = baseFade * (0.7 + 0.3 * Math.sin(particle.pulsePhase));
                    return particle.life > 0;

                default:
                    return false;
            }
        });
    }

    /**
     * Render particle effects
     */
    renderParticles() {
        // Use graph canvas context if available (renders on top), otherwise use animation canvas
        const ctx = this.graphCtx || this.ctx;
        if (!ctx) return;

        this.particleSystem.forEach(particle => {
            ctx.save();
            ctx.globalAlpha = particle.alpha;

            switch (particle.type) {
                case 'pulse':
                    this.renderPulse(ctx, particle);
                    break;
                case 'flow':
                    this.renderFlow(ctx, particle);
                    break;
                case 'curved-dashed':
                    this.renderCurvedDashed(ctx, particle);
                    break;
                case 'explosion':
                    this.renderExplosion(ctx, particle);
                    break;
                case 'trail':
                    this.renderTrail(ctx, particle);
                    break;
                case 'radialRing':
                    this.renderRadialRing(ctx, particle);
                    break;
                case 'acceptance':
                    this.renderAcceptance(ctx, particle);
                    break;
                case 'rejection':
                    this.renderRejection(ctx, particle);
                    break;
                case 'green-circle':
                    this.renderGreenCircle(ctx, particle);
                    break;
                case 'dashed-triangle':
                    this.renderDashedTriangle(ctx, particle);
                    break;
                case 'glowing-path':
                    this.renderGlowingPath(ctx, particle);
                    break;
            }

            ctx.restore();
        });
    }

    renderPulse(ctx, particle) {
        const gradient = ctx.createRadialGradient(
            particle.x, particle.y, 0,
            particle.x, particle.y, particle.radius
        );
        gradient.addColorStop(0, particle.color);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    renderFlow(ctx, particle) {
        const gradient = ctx.createRadialGradient(
            particle.x, particle.y, 0,
            particle.x, particle.y, particle.size
        );
        gradient.addColorStop(0, particle.color);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.shadowBlur = 10;
        ctx.shadowColor = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    renderCurvedDashed(ctx, particle) {
        // Render as dashed circle with glow
        const gradient = ctx.createRadialGradient(
            particle.currentX, particle.currentY, 0,
            particle.currentX, particle.currentY, particle.size * 1.5
        );
        gradient.addColorStop(0, particle.color);
        gradient.addColorStop(0.5, particle.color + '80');
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.shadowBlur = 12;
        ctx.shadowColor = particle.color;
        
        ctx.beginPath();
        ctx.arc(particle.currentX, particle.currentY, particle.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
    }

    renderExplosion(ctx, particle) {
        ctx.fillStyle = particle.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    renderTrail(ctx, particle) {
        if (particle.points.length < 2) return;

        ctx.strokeStyle = particle.color;
        ctx.lineWidth = particle.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 8;
        ctx.shadowColor = particle.color;

        ctx.beginPath();
        ctx.moveTo(particle.points[0].x, particle.points[0].y);
        
        for (let i = 1; i < particle.points.length; i++) {
            ctx.lineTo(particle.points[i].x, particle.points[i].y);
        }
        
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
    
    renderAcceptance(ctx, particle) {
        // Draw green circle (O)
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 15;
        ctx.shadowColor = particle.color;
        
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.shadowBlur = 0;
    }
    
    renderRejection(ctx, particle) {
        // Draw red X
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 15;
        ctx.shadowColor = particle.color;
        
        const offset = particle.size * 0.7;
        
        // First diagonal
        ctx.beginPath();
        ctx.moveTo(particle.x - offset, particle.y - offset);
        ctx.lineTo(particle.x + offset, particle.y + offset);
        ctx.stroke();
        
        // Second diagonal
        ctx.beginPath();
        ctx.moveTo(particle.x + offset, particle.y - offset);
        ctx.lineTo(particle.x - offset, particle.y + offset);
        ctx.stroke();
        
        ctx.shadowBlur = 0;
    }
    
    renderGreenCircle(ctx, particle) {
        // Draw green circle indicator on outer loop node
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 12;
        ctx.shadowColor = particle.color;
        
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.shadowBlur = 0;
    }
    
    renderDashedTriangle(ctx, particle) {
        // Draw dashed triangle connecting three nodes
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.lineCap = 'round';
        ctx.shadowBlur = 10;
        ctx.shadowColor = particle.color;
        
        ctx.beginPath();
        ctx.moveTo(particle.x1, particle.y1);
        ctx.lineTo(particle.x2, particle.y2);
        ctx.lineTo(particle.x3, particle.y3);
        ctx.closePath();
        ctx.stroke();
        
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
    }
    
    renderGlowingPath(ctx, particle) {
        // Draw glowing path with pulsing effect
        const glowColor = particle.isAccepted ? '#4caf50' : '#f44336';
        
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 15 + 5 * Math.sin(particle.pulsePhase);
        ctx.shadowColor = glowColor;
        
        // Draw path as curve through three points
        ctx.beginPath();
        ctx.moveTo(particle.x1, particle.y1);
        ctx.lineTo(particle.x2, particle.y2);
        ctx.lineTo(particle.x3, particle.y3);
        ctx.stroke();
        
        ctx.shadowBlur = 0;
    }
    
    renderRadialRing(ctx, particle) {
        ctx.save();
        
        // Draw rotating radial segments (like clock rays)
        const angleStep = (Math.PI * 2) / particle.segments;
        
        for (let i = 0; i < particle.segments; i++) {
            const angle = particle.rotation + i * angleStep;
            const startRadius = particle.radius * 0.7;
            const endRadius = particle.radius;
            
            // Calculate segment endpoints
            const x1 = particle.x + Math.cos(angle) * startRadius;
            const y1 = particle.y + Math.sin(angle) * startRadius;
            const x2 = particle.x + Math.cos(angle) * endRadius;
            const y2 = particle.y + Math.sin(angle) * endRadius;
            
            // Draw segment with glow
            const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
            gradient.addColorStop(0, 'transparent');
            gradient.addColorStop(0.5, particle.color);
            gradient.addColorStop(1, particle.color);
            
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.shadowBlur = 10;
            ctx.shadowColor = particle.color;
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    /**
     * Create button press animation effect
     */
    animateButtonPress(buttonElement) {
        if (!buttonElement) return;

        buttonElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
            buttonElement.style.transform = 'scale(1)';
        }, 100);
    }

    /**
     * Create smooth color transition
     */
    createColorTransition(fromColor, toColor, duration = 500) {
        return new Promise(resolve => {
            const startTime = Date.now();
            
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Easing function (ease-in-out)
                const eased = progress < 0.5
                    ? 2 * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve(toColor);
                }
            };
            
            animate();
        });
    }

    /**
     * Animate value counter (for statistics)
     */
    animateCounter(element, from, to, duration = 500) {
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            
            const current = Math.round(from + (to - from) * eased);
            element.textContent = current;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }

    /**
     * Clear all effects
     */
    clearEffects() {
        this.particleSystem = [];
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    /**
     * Stop animation loop
     */
    stop() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    /**
     * Create bezier curve effect (path animation)
     */
    createBezierFlow(x1, y1, x2, y2, color, controlOffset = 50) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        
        // Calculate perpendicular offset for curve
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const perpX = -dy / len * controlOffset;
        const perpY = dx / len * controlOffset;
        
        const controlX = midX + perpX;
        const controlY = midY + perpY;
        
        // Create particles that follow the bezier curve
        for (let i = 0; i < 5; i++) {
            const particle = {
                x: x1, y: y1,
                x1, y1, x2, y2,
                controlX, controlY,
                progress: i / 5,
                speed: 0.015,
                color,
                size: 5,
                type: 'bezier',
                alpha: 0.8
            };
            this.particleSystem.push(particle);
        }
    }
}

// Color utilities for gradients
class ColorUtils {
    static hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    static rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    static interpolateColor(color1, color2, factor) {
        const c1 = this.hexToRgb(color1);
        const c2 = this.hexToRgb(color2);
        
        if (!c1 || !c2) return color1;
        
        const r = Math.round(c1.r + factor * (c2.r - c1.r));
        const g = Math.round(c1.g + factor * (c2.g - c1.g));
        const b = Math.round(c1.b + factor * (c2.b - c1.b));
        
        return this.rgbToHex(r, g, b);
    }

    static addAlpha(color, alpha) {
        const rgb = this.hexToRgb(color);
        if (!rgb) return color;
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }
}
