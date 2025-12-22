// Particle Background Animation
class ParticleBackground {
    constructor() {
        this.canvas = document.getElementById('particles');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.particleCount = 100;
        this.connections = [];
        this.mouse = { x: null, y: null, radius: 150 };
        
        this.resize();
        this.init();
        this.animate();
        this.setupEventListeners();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = document.body.scrollHeight;
    }

    init() {
        this.particles = [];
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push(new Particle(this.canvas));
        }
    }

    setupEventListeners() {
        window.addEventListener('resize', () => {
            this.resize();
            this.init();
        });

        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.x;
            this.mouse.y = e.y + window.scrollY;
        });

        window.addEventListener('mouseout', () => {
            this.mouse.x = null;
            this.mouse.y = null;
        });

        // Update canvas height on scroll
        document.addEventListener('scroll', () => {
            this.resize();
        });
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Update and draw particles
        this.particles.forEach(particle => {
            particle.update(this.mouse);
            particle.draw(this.ctx);
        });

        // Draw connections
        this.connectParticles();

        requestAnimationFrame(() => this.animate());
    }

    connectParticles() {
        const maxDistance = 120;
        
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const dx = this.particles[i].x - this.particles[j].x;
                const dy = this.particles[i].y - this.particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < maxDistance) {
                    const opacity = 1 - distance / maxDistance;
                    
                    // Gold gradient for connections
                    const gradient = this.ctx.createLinearGradient(
                        this.particles[i].x, this.particles[i].y,
                        this.particles[j].x, this.particles[j].y
                    );
                    gradient.addColorStop(0, `rgba(212, 175, 55, ${opacity * 0.3})`);
                    gradient.addColorStop(1, `rgba(244, 208, 63, ${opacity * 0.2})`);

                    this.ctx.strokeStyle = gradient;
                    this.ctx.lineWidth = 1;
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
                    this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
                    this.ctx.stroke();
                }
            }
        }
    }
}

class Particle {
    constructor(canvas) {
        this.canvas = canvas;
        this.reset();
        this.y = Math.random() * canvas.height;
        this.baseX = this.x;
        this.baseY = this.y;
        this.density = Math.random() * 30 + 10;
        this.hue = 45 + Math.random() * 15; // Gold hue range
    }

    reset() {
        this.x = Math.random() * this.canvas.width;
        this.y = Math.random() * this.canvas.height;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.size = Math.random() * 3 + 1;
        this.baseX = this.x;
        this.baseY = this.y;
    }

    update(mouse) {
        // Move particles
        this.x += this.vx;
        this.y += this.vy;

        // Boundary check
        if (this.x < 0 || this.x > this.canvas.width) {
            this.vx *= -1;
        }
        if (this.y < 0 || this.y > this.canvas.height) {
            this.vy *= -1;
        }

        // Mouse interaction
        if (mouse.x !== null && mouse.y !== null) {
            const dx = mouse.x - this.x;
            const dy = mouse.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const forceDirectionX = dx / distance;
            const forceDirectionY = dy / distance;
            const maxDistance = mouse.radius;
            const force = (maxDistance - distance) / maxDistance;

            if (distance < maxDistance) {
                const directionX = forceDirectionX * force * this.density;
                const directionY = forceDirectionY * force * this.density;
                
                this.x -= directionX;
                this.y -= directionY;
            }
        }

        // Gentle return to base position
        const dx = this.baseX - this.x;
        const dy = this.baseY - this.y;
        this.x += dx * 0.01;
        this.y += dy * 0.01;
    }

    draw(ctx) {
        // Particle glow effect
        const gradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.size * 3
        );
        
        gradient.addColorStop(0, `hsla(${this.hue}, 100%, 50%, 0.8)`);
        gradient.addColorStop(0.5, `hsla(${this.hue}, 100%, 45%, 0.4)`);
        gradient.addColorStop(1, `hsla(${this.hue}, 100%, 40%, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
        ctx.fill();

        // Core particle
        ctx.fillStyle = `hsla(${this.hue}, 100%, 60%, 1)`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        // Shimmer effect (occasionally)
        if (Math.random() > 0.99) {
            ctx.save();
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#D4AF37';
            ctx.fillStyle = '#F4D03F';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    new ParticleBackground();
});

// Add scroll animations
window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    const sections = document.querySelectorAll('.intro-panel, .tech-section, .magic-section, .publications');
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        const sectionCenter = sectionTop + sectionHeight / 2;
        const windowCenter = scrolled + window.innerHeight / 2;
        
        // Parallax effect
        const distance = Math.abs(sectionCenter - windowCenter);
        const maxDistance = window.innerHeight;
        const parallaxAmount = Math.min(distance / maxDistance, 1) * 20;
        
        if (windowCenter > sectionTop - window.innerHeight && windowCenter < sectionTop + sectionHeight) {
            section.style.transform = `translateY(${parallaxAmount}px)`;
            section.style.opacity = 1 - (parallaxAmount / 40);
        }
    });
});

// Add floating animation to concept boxes
const conceptBoxes = document.querySelectorAll('.concept-box');
conceptBoxes.forEach((box, index) => {
    box.style.animation = `float ${3 + index * 0.5}s ease-in-out infinite`;
    box.style.animationDelay = `${index * 0.2}s`;
});

// Add CSS for float animation
const style = document.createElement('style');
style.textContent = `
    @keyframes float {
        0%, 100% {
            transform: translateY(0px);
        }
        50% {
            transform: translateY(-10px);
        }
    }
`;
document.head.appendChild(style);
