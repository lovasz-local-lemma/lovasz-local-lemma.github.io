// ============================================
// Portfolio Main Page - Interactive Features
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initAnimations();
    initCardEffects();
    createBackToTop();
});

// ============================================
// Card Hover Effects
// ============================================

function initCardEffects() {
    const cards = document.querySelectorAll('.project-card');
    
    cards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            // Subtle tilt effect
            this.style.transform = 'translateY(-10px) rotateX(2deg)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) rotateX(0deg)';
        });
        
        // Track mouse movement for parallax effect
        card.addEventListener('mousemove', function(e) {
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = (y - centerY) / 30;
            const rotateY = (centerX - x) / 30;
            
            this.style.transform = `translateY(-10px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        });
    });
}

// ============================================
// Scroll Animations
// ============================================

function initAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    // Observe all project cards
    const cards = document.querySelectorAll('.project-card');
    cards.forEach((card, index) => {
        // Stagger animation delay (use animation-delay, not transition-delay)
        card.style.animationDelay = `${index * 0.1}s`;
        observer.observe(card);
    });
    
    // Observe section headers
    const headers = document.querySelectorAll('.section-header');
    headers.forEach(header => observer.observe(header));
}

// ============================================
// Back to Top Button
// ============================================

function createBackToTop() {
    const button = document.createElement('button');
    button.className = 'back-to-top';
    button.innerHTML = '↑';
    button.title = 'Back to top';
    button.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        width: 50px;
        height: 50px;
        background: linear-gradient(135deg, var(--gold-primary), var(--gold-dark));
        border: none;
        border-radius: 50%;
        color: var(--dark-bg);
        font-size: 1.5rem;
        font-weight: bold;
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transition: all 0.3s ease;
        z-index: 999;
        box-shadow: 0 4px 20px rgba(212, 175, 55, 0.4);
    `;
    
    document.body.appendChild(button);
    
    // Show/hide based on scroll
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 300) {
            button.style.opacity = '1';
            button.style.pointerEvents = 'auto';
        } else {
            button.style.opacity = '0';
            button.style.pointerEvents = 'none';
        }
        
        lastScroll = currentScroll;
    });
    
    // Scroll to top
    button.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
    
    // Hover effect
    button.addEventListener('mouseenter', () => {
        button.style.transform = 'translateY(-5px) scale(1.1)';
        button.style.boxShadow = '0 8px 30px rgba(212, 175, 55, 0.6)';
    });
    
    button.addEventListener('mouseleave', () => {
        button.style.transform = 'translateY(0) scale(1)';
        button.style.boxShadow = '0 4px 20px rgba(212, 175, 55, 0.4)';
    });
}

// ============================================
// Smooth Scroll
// ============================================

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ============================================
// Parallax Effect on Scroll
// ============================================

window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const orbs = document.querySelectorAll('.orb');
    
    orbs.forEach((orb, index) => {
        const speed = 0.5 + (index * 0.2);
        orb.style.transform = `translateY(${scrolled * speed}px)`;
    });
});

// ============================================
// Console Easter Egg
// ============================================

console.log('%c✨ Portfolio Website', 'font-size: 24px; font-weight: bold; color: #D4AF37;');
console.log('%cMathematics • Graphics • Code', 'font-size: 14px; color: #B0B0B0;');
console.log('%c\nExplore the projects above! 🚀', 'font-size: 12px; color: #F4D03F; margin-top: 10px;');

// ============================================
// Performance: Remove loading class
// ============================================

window.addEventListener('load', () => {
    document.documentElement.classList.remove('loading');
});
