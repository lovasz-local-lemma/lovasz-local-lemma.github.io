// Animation Engine for tree operations
class AnimationEngine {
    constructor() {
        this.animationQueue = [];
        this.isAnimating = false;
        this.speed = 500; // milliseconds
    }

    setSpeed(speed) {
        this.speed = 1100 - (speed * 100); // Convert 1-10 scale to 1000-100ms
    }

    queueAnimation(type, data) {
        this.animationQueue.push({ type, data, timestamp: Date.now() });
    }

    async processQueue() {
        if (this.isAnimating || this.animationQueue.length === 0) return;
        
        this.isAnimating = true;
        
        while (this.animationQueue.length > 0) {
            const animation = this.animationQueue.shift();
            await this.executeAnimation(animation);
            await this.delay(this.speed);
        }
        
        this.isAnimating = false;
    }

    async executeAnimation(animation) {
        switch (animation.type) {
            case 'highlight':
                this.highlightNode(animation.data.value, animation.data.svg);
                break;
            case 'insert':
                this.animateInsertion(animation.data.value, animation.data.svg);
                break;
            case 'delete':
                this.animateDeletion(animation.data.value, animation.data.svg);
                break;
            case 'rotation':
                this.animateRotation(animation.data.operation, animation.data.svg);
                break;
            case 'recolor':
                this.animateRecolor(animation.data.nodes, animation.data.svg);
                break;
        }
    }

    highlightNode(value, svg) {
        const nodes = svg.querySelectorAll('.tree-node');
        nodes.forEach(nodeGroup => {
            const text = nodeGroup.querySelector('text');
            if (text && text.textContent == value) {
                const circle = nodeGroup.querySelector('circle') || nodeGroup.querySelector('rect');
                if (circle) {
                    circle.style.filter = 'drop-shadow(0 0 10px #ffd700)';
                    circle.style.transform = 'scale(1.1)';
                    circle.style.transformOrigin = 'center';
                    circle.style.transition = 'all 0.3s ease';
                    
                    setTimeout(() => {
                        circle.style.filter = '';
                        circle.style.transform = '';
                    }, this.speed);
                }
            }
        });
    }

    animateInsertion(value, svg) {
        const nodes = svg.querySelectorAll('.tree-node');
        nodes.forEach(nodeGroup => {
            const text = nodeGroup.querySelector('text');
            if (text && text.textContent == value) {
                const circle = nodeGroup.querySelector('circle') || nodeGroup.querySelector('rect');
                if (circle) {
                    circle.style.opacity = '0';
                    circle.style.transform = 'scale(0)';
                    circle.style.transition = 'all 0.5s ease';
                    
                    // Animate in
                    setTimeout(() => {
                        circle.style.opacity = '1';
                        circle.style.transform = 'scale(1)';
                    }, 50);
                    
                    // Pulse effect
                    setTimeout(() => {
                        circle.style.transform = 'scale(1.2)';
                        setTimeout(() => {
                            circle.style.transform = 'scale(1)';
                        }, 200);
                    }, 300);
                }
                
                const textElement = nodeGroup.querySelector('text');
                if (textElement) {
                    textElement.style.opacity = '0';
                    textElement.style.transition = 'opacity 0.5s ease';
                    setTimeout(() => {
                        textElement.style.opacity = '1';
                    }, 250);
                }
            }
        });
    }

    animateDeletion(value, svg) {
        const nodes = svg.querySelectorAll('.tree-node');
        nodes.forEach(nodeGroup => {
            const text = nodeGroup.querySelector('text');
            if (text && text.textContent == value) {
                const circle = nodeGroup.querySelector('circle') || nodeGroup.querySelector('rect');
                if (circle) {
                    circle.style.transition = 'all 0.5s ease';
                    circle.style.transform = 'scale(0)';
                    circle.style.opacity = '0';
                }
                
                const textElement = nodeGroup.querySelector('text');
                if (textElement) {
                    textElement.style.transition = 'opacity 0.3s ease';
                    textElement.style.opacity = '0';
                }
            }
        });
    }

    animateRotation(operation, svg) {
        // Add a visual indicator for rotations
        const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        indicator.setAttribute('x', 10);
        indicator.setAttribute('y', 30);
        indicator.setAttribute('fill', '#ff9800');
        indicator.setAttribute('font-family', 'Arial, sans-serif');
        indicator.setAttribute('font-size', '12');
        indicator.setAttribute('font-weight', 'bold');
        indicator.textContent = operation;
        
        svg.appendChild(indicator);
        
        setTimeout(() => {
            if (svg.contains(indicator)) {
                svg.removeChild(indicator);
            }
        }, this.speed);
    }

    animateRecolor(nodes, svg) {
        // Flash effect for recoloring
        const allNodes = svg.querySelectorAll('.tree-node circle');
        allNodes.forEach(circle => {
            circle.style.transition = 'all 0.3s ease';
            circle.style.filter = 'brightness(1.5)';
            setTimeout(() => {
                circle.style.filter = '';
            }, 300);
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    clear() {
        this.animationQueue = [];
        this.isAnimating = false;
    }
}
