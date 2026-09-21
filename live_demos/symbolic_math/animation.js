// Animation Mode - Step-by-step visualization with transitions
// Separate module to avoid interfering with existing functionality

class StepAnimator {
    constructor() {
        this.steps = [];
        this.currentStep = 0;
        this.isAnimating = false;
        this.animationSpeed = 1000; // ms per step
        this.container = null;
    }
    
    // Initialize animation with steps
    loadSteps(steps) {
        this.steps = steps;
        this.currentStep = 0;
        this.createAnimationContainer();
    }
    
    // Create dedicated animation view
    createAnimationContainer() {
        // Remove existing container
        const existing = document.getElementById('animationContainer');
        if (existing) existing.remove();
        
        const container = document.createElement('div');
        container.id = 'animationContainer';
        container.className = 'glass-panel animation-panel';
        container.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 80%;
            max-width: 900px;
            max-height: 80%;
            overflow-y: auto;
            z-index: 10000;
            padding: 2rem;
            display: none;
        `;
        
        container.innerHTML = `
            <div class="animation-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h2 style="color: #60a5fa; margin: 0;">🎬 Step-by-Step Animation</h2>
                <button id="closeAnimation" class="wobble-btn" style="padding: 0.5rem 1rem; background: rgba(255,0,0,0.2); border: 1px solid #ff4444; border-radius: 8px; color: #fff; cursor: pointer;">
                    ✕ Close
                </button>
            </div>
            
            <div class="animation-progress" style="margin-bottom: 1.5rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span style="color: #94a3b8; font-size: 0.9rem;">Step <span id="currentStepNum">0</span> of <span id="totalSteps">0</span></span>
                    <span style="color: #94a3b8; font-size: 0.9rem;">Speed: <span id="speedValue">1</span>x</span>
                </div>
                <div style="width: 100%; height: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; overflow: hidden;">
                    <div id="progressBar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #60a5fa, #a78bfa); transition: width 0.3s ease;"></div>
                </div>
            </div>
            
            <div class="animation-controls" style="display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
                <button id="animFirst" class="op-btn wobble-btn" style="flex: 1; min-width: 100px;">⏮ First</button>
                <button id="animPrev" class="op-btn wobble-btn" style="flex: 1; min-width: 100px;">◀ Previous</button>
                <button id="animPlayPause" class="op-btn wobble-btn" style="flex: 2; min-width: 120px; background: rgba(16, 185, 129, 0.2); border-color: #10b981;">▶ Play</button>
                <button id="animNext" class="op-btn wobble-btn" style="flex: 1; min-width: 100px;">Next ▶</button>
                <button id="animLast" class="op-btn wobble-btn" style="flex: 1; min-width: 100px;">Last ⏭</button>
            </div>
            
            <div class="speed-control" style="margin-bottom: 1.5rem;">
                <label style="display: block; color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.5rem;">Animation Speed:</label>
                <input type="range" id="speedSlider" min="0.25" max="3" step="0.25" value="1" 
                       style="width: 100%; accent-color: #60a5fa;" />
            </div>
            
            <div id="animationContent" style="background: rgba(0,0,0,0.3); border-radius: 12px; padding: 1.5rem; min-height: 200px;">
                <!-- Step content goes here -->
            </div>
        `;
        
        document.body.appendChild(container);
        this.container = container;
        
        // Setup event listeners
        this.setupControls();
    }
    
    setupControls() {
        document.getElementById('closeAnimation').onclick = () => this.hide();
        document.getElementById('animFirst').onclick = () => this.goToStep(0);
        document.getElementById('animPrev').onclick = () => this.previousStep();
        document.getElementById('animPlayPause').onclick = () => this.togglePlayPause();
        document.getElementById('animNext').onclick = () => this.nextStep();
        document.getElementById('animLast').onclick = () => this.goToStep(this.steps.length - 1);
        
        document.getElementById('speedSlider').oninput = (e) => {
            const speed = parseFloat(e.target.value);
            this.animationSpeed = 1000 / speed;
            document.getElementById('speedValue').textContent = speed.toFixed(2);
        };
    }
    
    show() {
        if (!this.container) return;
        this.container.style.display = 'block';
        document.getElementById('totalSteps').textContent = this.steps.length;
        this.showStep(0);
    }
    
    hide() {
        if (!this.container) return;
        this.container.style.display = 'none';
        this.stop();
    }
    
    showStep(index) {
        if (index < 0 || index >= this.steps.length) return;
        
        this.currentStep = index;
        const step = this.steps[index];
        
        // Update progress
        document.getElementById('currentStepNum').textContent = index + 1;
        const progress = ((index + 1) / this.steps.length) * 100;
        document.getElementById('progressBar').style.width = `${progress}%`;
        
        // Build step content with animation
        const content = document.getElementById('animationContent');
        content.style.opacity = '0';
        content.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            content.innerHTML = this.buildStepHTML(step, index);
            content.style.transition = 'all 0.5s ease';
            content.style.opacity = '1';
            content.style.transform = 'translateY(0)';
        }, 100);
    }
    
    buildStepHTML(step, index) {
        const ruleColor = this.getRuleColor(step.operation);
        
        return `
            <div class="step-animation" style="animation: fadeIn 0.5s ease;">
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                    <div style="background: ${ruleColor}; color: #000; padding: 0.5rem 1rem; border-radius: 8px; font-weight: bold; font-size: 0.9rem;">
                        Step ${index + 1}
                    </div>
                    <div style="flex: 1; height: 2px; background: linear-gradient(90deg, ${ruleColor}, transparent);"></div>
                </div>
                
                <div style="background: rgba(96, 165, 250, 0.1); border-left: 4px solid #60a5fa; padding: 1rem; margin-bottom: 1rem; border-radius: 8px;">
                    <div style="color: #60a5fa; font-weight: bold; margin-bottom: 0.5rem;">📐 Rule Applied:</div>
                    <div style="color: #e2e8f0; font-size: 1.1rem;">${this.escapeHTML(step.rule || 'Unknown rule')}</div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; align-items: center;">
                    <div style="background: rgba(255, 255, 255, 0.05); padding: 1rem; border-radius: 8px; border: 1px solid rgba(96, 165, 250, 0.3);">
                        <div style="color: #94a3b8; font-size: 0.8rem; margin-bottom: 0.5rem;">FROM:</div>
                        <div style="color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 1rem;">${this.escapeHTML(step.from)}</div>
                    </div>
                    
                    <div style="font-size: 2rem; color: #a78bfa;">→</div>
                    
                    <div style="background: rgba(167, 139, 250, 0.1); padding: 1rem; border-radius: 8px; border: 1px solid rgba(167, 139, 250, 0.3); animation: pulse 2s infinite;">
                        <div style="color: #a78bfa; font-size: 0.8rem; margin-bottom: 0.5rem;">TO:</div>
                        <div style="color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 1rem;">${this.escapeHTML(step.to)}</div>
                    </div>
                </div>
            </div>
            
            <style>
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes pulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(167, 139, 250, 0.4); }
                    50% { box-shadow: 0 0 0 10px rgba(167, 139, 250, 0); }
                }
            </style>
        `;
    }
    
    getRuleColor(operation) {
        const colors = {
            'integration': '#10b981',
            'derivative': '#f59e0b',
            'simplification': '#60a5fa',
            'substitution': '#ec4899'
        };
        return colors[operation] || '#94a3b8';
    }
    
    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        }
    }
    
    previousStep() {
        if (this.currentStep > 0) {
            this.showStep(this.currentStep - 1);
        }
    }
    
    goToStep(index) {
        this.showStep(index);
    }
    
    togglePlayPause() {
        if (this.isAnimating) {
            this.pause();
        } else {
            this.play();
        }
    }
    
    play() {
        this.isAnimating = true;
        document.getElementById('animPlayPause').innerHTML = '⏸ Pause';
        document.getElementById('animPlayPause').style.background = 'rgba(239, 68, 68, 0.2)';
        document.getElementById('animPlayPause').style.borderColor = '#ef4444';
        
        this.playInterval = setInterval(() => {
            if (this.currentStep < this.steps.length - 1) {
                this.nextStep();
            } else {
                this.pause();
                this.goToStep(0); // Loop back to start
            }
        }, this.animationSpeed);
    }
    
    pause() {
        this.isAnimating = false;
        document.getElementById('animPlayPause').innerHTML = '▶ Play';
        document.getElementById('animPlayPause').style.background = 'rgba(16, 185, 129, 0.2)';
        document.getElementById('animPlayPause').style.borderColor = '#10b981';
        
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
    }
    
    stop() {
        this.pause();
        this.currentStep = 0;
    }
}

// Global instance
window.stepAnimator = new StepAnimator();
