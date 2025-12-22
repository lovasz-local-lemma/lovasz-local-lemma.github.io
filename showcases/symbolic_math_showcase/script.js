// ============================================
// Symbolic Math Showcase - Interactive Features
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initSyntaxHighlighting();
    initScrollAnimations();
});

// ============================================
// Navigation
// ============================================

function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.content-section');
    
    // Smooth scroll to section
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                // Remove active class from all links
                navLinks.forEach(l => l.classList.remove('active'));
                // Add active class to clicked link
                link.classList.add('active');
                
                // Smooth scroll to target
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Update active nav link on scroll
    const observerOptions = {
        root: null,
        rootMargin: '-20% 0px -35% 0px',
        threshold: 0
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${id}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }, observerOptions);
    
    // Observe all sections
    sections.forEach(section => {
        if (section.id) {
            observer.observe(section);
        }
    });
}

// ============================================
// Syntax Highlighting
// ============================================

function initSyntaxHighlighting() {
    // Initialize highlight.js for code blocks
    if (typeof hljs !== 'undefined') {
        hljs.highlightAll();
    }
    
    // Add copy button to code blocks
    const codeBlocks = document.querySelectorAll('.code-block-wrapper');
    
    codeBlocks.forEach(wrapper => {
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.innerHTML = '📋 Copy';
        copyButton.title = 'Copy code to clipboard';
        
        const codeHeader = wrapper.querySelector('.code-header');
        if (codeHeader) {
            copyButton.style.cssText = `
                position: absolute;
                right: 1rem;
                top: 50%;
                transform: translateY(-50%);
                background: rgba(212, 175, 55, 0.2);
                border: 1px solid rgba(212, 175, 55, 0.3);
                color: var(--gold-light);
                padding: 0.4rem 0.8rem;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.8rem;
                font-family: 'Source Code Pro', monospace;
                transition: all 0.3s ease;
            `;
            
            codeHeader.style.position = 'relative';
            codeHeader.appendChild(copyButton);
            
            copyButton.addEventListener('click', () => {
                const code = wrapper.querySelector('code');
                if (code) {
                    navigator.clipboard.writeText(code.textContent).then(() => {
                        copyButton.innerHTML = '✓ Copied!';
                        copyButton.style.background = 'rgba(152, 195, 121, 0.3)';
                        copyButton.style.borderColor = 'rgba(152, 195, 121, 0.5)';
                        
                        setTimeout(() => {
                            copyButton.innerHTML = '📋 Copy';
                            copyButton.style.background = 'rgba(212, 175, 55, 0.2)';
                            copyButton.style.borderColor = 'rgba(212, 175, 55, 0.3)';
                        }, 2000);
                    });
                }
            });
            
            copyButton.addEventListener('mouseenter', () => {
                copyButton.style.background = 'rgba(212, 175, 55, 0.3)';
                copyButton.style.boxShadow = '0 0 15px rgba(212, 175, 55, 0.3)';
            });
            
            copyButton.addEventListener('mouseleave', () => {
                if (!copyButton.innerHTML.includes('Copied')) {
                    copyButton.style.background = 'rgba(212, 175, 55, 0.2)';
                    copyButton.style.boxShadow = 'none';
                }
            });
        }
    });
}

// ============================================
// Scroll Animations
// ============================================

function initScrollAnimations() {
    // Fade in elements as they come into view
    const animateElements = document.querySelectorAll(
        '.info-card, .tier-card, .technique-item, .achievement-card, .math-rule, .rule-card'
    );
    
    const animationObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '0';
                entry.target.style.transform = 'translateY(20px)';
                entry.target.style.transition = 'all 0.6s ease';
                
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, 100);
                
                animationObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });
    
    animateElements.forEach(el => {
        animationObserver.observe(el);
    });
}

// ============================================
// Video Placeholder Enhancement
// ============================================

// Add hover effects to video placeholders
const videoPlaceholders = document.querySelectorAll('.video-placeholder');

videoPlaceholders.forEach(placeholder => {
    placeholder.addEventListener('mouseenter', () => {
        placeholder.style.background = 'linear-gradient(135deg, rgba(212, 175, 55, 0.15), rgba(204, 52, 45, 0.12))';
        placeholder.style.borderColor = 'rgba(212, 175, 55, 0.5)';
    });
    
    placeholder.addEventListener('mouseleave', () => {
        placeholder.style.background = 'linear-gradient(135deg, rgba(212, 175, 55, 0.1), rgba(204, 52, 45, 0.08))';
        placeholder.style.borderColor = 'rgba(212, 175, 55, 0.3)';
    });
});

// ============================================
// Smooth Scroll for All Internal Links
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
// Back to Top Button (Optional Enhancement)
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
    
    // Show/hide button based on scroll position
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            button.style.opacity = '1';
            button.style.pointerEvents = 'auto';
        } else {
            button.style.opacity = '0';
            button.style.pointerEvents = 'none';
        }
    });
    
    // Scroll to top on click
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

createBackToTop();

// ============================================
// Console Easter Egg
// ============================================

console.log('%c🔬 Symbolic Math Engine', 'font-size: 20px; font-weight: bold; color: #D4AF37;');
console.log('%cBuilt with Ruby • Tree-Based AST • Risch Integration', 'font-size: 12px; color: #B0B0B0;');
console.log('%c\nTree Structure Example:', 'font-size: 14px; font-weight: bold; color: #F4D03F; margin-top: 10px;');
console.log(`
  🌲 ROOT: ⟨+⟩
  ├─[L]─ ⟨*⟩
  │      ├─[L]─ 【2】
  │      └─[R]─ ⟨^⟩
  │             ├─[L]─ <x>
  │             └─[R]─ 【2】
  └─[R]─ ⟨*⟩
         ├─[L]─ 【3】
         └─[R]─ <x>
         
  Expression: 2x² + 3x
`);
