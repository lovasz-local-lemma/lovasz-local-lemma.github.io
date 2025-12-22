// Portfolio Gallery System - Lozad.js Version
// This version uses lozad.js for efficient lazy loading
// To use: 
// 1. Add <script src="https://cdn.jsdelivr.net/npm/lozad/dist/lozad.min.js"></script> to HTML
// 2. Replace portfolio.js with portfolio-lozad.js

document.addEventListener('DOMContentLoaded', () => {
    const galleryPanel = document.getElementById('galleryPanel');
    const galleryImages = galleryPanel?.querySelector('.gallery-images');
    const galleryPlaceholder = galleryPanel?.querySelector('.gallery-placeholder');
    const projectCards = document.querySelectorAll('.project-card');
    let hideTimeout = null;
    let currentCard = null;
    let isTransitioning = false;
    
    // Gallery settings
    const gallerySettings = {
        tiltRange: 12,
        randomness: 40,
        fanMode: 'toward'
    };
    
    // Tweak mode
    let tweakMode = false;
    let tweakCaptured = false;
    let tweakCapturedProject = null;
    let currentProjectTweaks = {};
    let activeGizmo = null;
    let gizmoStartPos = null;
    
    // Image cache
    const imageCache = {};
    let previewsManifest = null;
    
    // Initialize lozad observer for lazy loading
    let lozadObserver = null;
    if (typeof lozad !== 'undefined') {
        lozadObserver = lozad('.lozad', {
            rootMargin: '100px 0px',
            threshold: 0.1,
            loaded: function(el) {
                el.classList.add('lozad-loaded');
            }
        });
        console.log('Lozad.js initialized for lazy loading');
    } else {
        console.warn('Lozad.js not loaded - falling back to native loading');
    }
    
    async function loadManifest() {
        if (previewsManifest !== null) return previewsManifest;
        try {
            const response = await fetch('previews-manifest.json');
            if (response.ok) {
                previewsManifest = await response.json();
            } else {
                previewsManifest = {};
            }
        } catch (e) {
            previewsManifest = {};
        }
        return previewsManifest;
    }
    
    async function getProjectImages(projectId) {
        if (!projectId) return [];
        if (imageCache[projectId]) return imageCache[projectId];
        
        const manifest = await loadManifest();
        const images = [];
        
        if (manifest[projectId]) {
            const files = manifest[projectId];
            for (const filename of files) {
                const url = `previews/${projectId}/${encodeURIComponent(filename)}`;
                const name = filename
                    .replace(/\.[^/.]+$/, '')
                    .replace(/[_]/g, ' ');
                images.push({ url, name });
            }
        }
        
        imageCache[projectId] = images;
        return images;
    }
    
    // Seeded random for consistent layouts
    const seededRandom = (seed) => {
        const x = Math.sin(seed * 9999) * 10000;
        return x - Math.floor(x);
    };
    
    // Generate layout with lozad lazy loading
    function generateImageLayout(images, imageDimensions = {}, panelSide = 'right') {
        if (!images.length) return '';
        
        const { tiltRange, randomness, fanMode } = gallerySettings;
        const total = images.length;
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        const topPadding = 80;
        const bottomPadding = 80;
        const maxWidth = 500;
        const usableHeight = viewportHeight - topPadding - bottomPadding;
        
        const getAngle = (verticalProgress, index) => {
            const convergeSide = panelSide === 'right' ? -1 : 1;
            let baseAngle = 0;
            if (fanMode === 'toward') {
                baseAngle = convergeSide * (verticalProgress - 0.5) * tiltRange;
            } else if (fanMode === 'away') {
                baseAngle = -convergeSide * (verticalProgress - 0.5) * tiltRange;
            } else {
                baseAngle = (seededRandom(index * 17) - 0.5) * tiltRange;
            }
            return baseAngle + (seededRandom(index * 7) - 0.5) * randomness * 0.06;
        };
        
        // Render with lozad data attributes for lazy loading
        const renderImage = (info, x, y, width, height, angle, zIndex, imageIndex) => {
            const { imgUrl, imgName } = info;
            
            const projectId = currentCard?.dataset?.project || '';
            const tweaks = currentProjectTweaks[projectId]?.[imageIndex] || { dx: 0, dy: 0, dRotate: 0, dScale: 1 };
            
            const finalX = x + tweaks.dx;
            const finalY = y + tweaks.dy;
            const finalAngle = angle + tweaks.dRotate;
            const finalWidth = width * tweaks.dScale;
            const finalHeight = height * tweaks.dScale;
            
            const style = `
                position: absolute;
                top: ${finalY}px;
                left: ${finalX}px;
                width: ${finalWidth}px;
                height: ${finalHeight}px;
                transform: translate(-50%, 0) rotate(${finalAngle}deg);
                z-index: ${zIndex};
            `;
            
            const labelHtml = imgName ? `<span class="gallery-image-label">${imgName}</span>` : '';
            const gizmoHtml = tweakMode ? `
                <div class="gizmo-handle gizmo-move" data-action="move" data-index="${imageIndex}">✥</div>
                <div class="gizmo-handle gizmo-rotate" data-action="rotate" data-index="${imageIndex}">↻</div>
                <div class="gizmo-handle gizmo-scale" data-action="scale" data-index="${imageIndex}">⤡</div>
            ` : '';
            
            // Use lozad data-src for lazy loading if available
            const imgHtml = lozadObserver 
                ? `<img class="lozad" data-src="${imgUrl}" alt="${imgName || 'Preview'}">`
                : `<img src="${imgUrl}" alt="${imgName || 'Preview'}" loading="lazy">`;
            
            return `<div class="gallery-image${tweakMode ? ' tweak-active' : ''}" style="${style}" data-index="${imageIndex}">
                ${labelHtml}
                ${imgHtml}
                ${gizmoHtml}
            </div>`;
        };
        
        // Simplified layout generation (just vertical stack for this version)
        const imageInfos = images.map((img, i) => {
            const imgUrl = typeof img === 'string' ? img : img.url;
            const imgName = typeof img === 'string' ? '' : img.name;
            const dims = imageDimensions[imgUrl] || { width: 16, height: 10 };
            return { imgUrl, imgName, aspectRatio: dims.width / dims.height, index: i };
        });
        
        const perImageHeight = usableHeight / total;
        const targetHeight = perImageHeight * 0.85;
        
        return imageInfos.map((info, i) => {
            const width = Math.min(maxWidth, targetHeight * info.aspectRatio);
            const height = width / info.aspectRatio;
            const y = topPadding + i * perImageHeight;
            const x = viewportWidth * 0.21;
            const angle = getAngle(i / Math.max(1, total - 1), i);
            return renderImage(info, x, y, width, height, angle, i + 1, i);
        }).join('');
    }
    
    async function getImageDimensions(images) {
        const dimensions = {};
        const promises = images.map(img => {
            const url = typeof img === 'string' ? img : img.url;
            return new Promise(resolve => {
                const imgEl = new Image();
                imgEl.onload = () => {
                    dimensions[url] = { width: imgEl.naturalWidth, height: imgEl.naturalHeight };
                    resolve();
                };
                imgEl.onerror = () => resolve();
                imgEl.src = url;
            });
        });
        await Promise.all(promises);
        return dimensions;
    }
    
    function getPanelSide(card) {
        const rect = card.getBoundingClientRect();
        const cardCenterX = rect.left + rect.width / 2;
        return cardCenterX > window.innerWidth * 0.66 ? 'left' : 'right';
    }
    
    async function updateGalleryContent(card) {
        const projectId = card.dataset.project;
        const images = await getProjectImages(projectId);
        
        if (images.length > 0) {
            const dimensions = await getImageDimensions(images);
            const panelSide = getPanelSide(card);
            galleryImages.innerHTML = generateImageLayout(images, dimensions, panelSide);
            galleryPlaceholder.style.display = 'none';
            galleryImages.style.display = 'flex';
            
            // Trigger lozad to observe new images
            if (lozadObserver) {
                lozadObserver.observe();
            }
        } else {
            galleryImages.style.display = 'none';
            galleryPlaceholder.style.display = 'flex';
        }
    }
    
    function updatePanelPosition(card) {
        const panelSide = getPanelSide(card);
        galleryPanel.classList.remove('panel-left', 'panel-right');
        galleryPanel.classList.add(`panel-${panelSide}`);
    }
    
    // Card hover handlers
    projectCards.forEach(card => {
        card.addEventListener('mouseenter', async () => {
            if (tweakMode && tweakCaptured) return;
            
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }
            
            const wasVisible = galleryPanel.classList.contains('visible');
            
            if (wasVisible && currentCard !== card) {
                isTransitioning = true;
                galleryPanel.classList.remove('visible');
                
                setTimeout(async () => {
                    await updateGalleryContent(card);
                    updatePanelPosition(card);
                    currentCard = card;
                    
                    if (tweakMode && !tweakCaptured) {
                        tweakCaptured = true;
                        tweakCapturedProject = card.dataset.project;
                    }
                    
                    galleryPanel.offsetHeight;
                    galleryPanel.classList.add('visible');
                    isTransitioning = false;
                }, 250);
            } else if (!wasVisible) {
                await updateGalleryContent(card);
                updatePanelPosition(card);
                currentCard = card;
                
                if (tweakMode && !tweakCaptured) {
                    tweakCaptured = true;
                    tweakCapturedProject = card.dataset.project;
                }
                
                galleryPanel.offsetHeight;
                galleryPanel.classList.add('visible');
            }
        });
        
        card.addEventListener('mouseleave', () => {
            if (tweakMode && tweakCaptured) return;
            galleryPanel.classList.remove('visible');
            currentCard = null;
        });
    });
    
    // Minimal tweak mode support
    function toggleTweakMode() {
        tweakMode = !tweakMode;
        if (!tweakMode) {
            tweakCaptured = false;
            tweakCapturedProject = null;
            galleryPanel.classList.remove('visible');
            currentCard = null;
        }
        document.body.classList.toggle('gallery-tweak-mode', tweakMode);
        if (currentCard) updateGalleryContent(currentCard);
    }
    
    function tweakNextProject() {
        if (!tweakMode) return;
        tweakCaptured = false;
        tweakCapturedProject = null;
        galleryPanel.classList.remove('visible');
        currentCard = null;
    }
    
    window.toggleGalleryTweakMode = toggleTweakMode;
    window.tweakNextProject = tweakNextProject;
    
    console.log('Portfolio Lozad version loaded');
});
