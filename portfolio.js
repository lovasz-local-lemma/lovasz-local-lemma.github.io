// Portfolio Gallery System and Navigation
document.addEventListener('DOMContentLoaded', () => {
    const galleryPanel = document.getElementById('galleryPanel');
    const galleryImages = galleryPanel?.querySelector('.gallery-images');
    const galleryPlaceholder = galleryPanel?.querySelector('.gallery-placeholder');
    const projectCards = document.querySelectorAll('.project-card');
    let hideTimeout = null;
    let currentCard = null;
    let isTransitioning = false;
    
    const gallerySettings = {
        tiltRange: 12,
        randomness: 60,
        fanMode: 'away'
    };
    
    const REFERENCE_WIDTH = 1920;
    const REFERENCE_HEIGHT = 1080;
    
    const savedTweaks = {
        "shaderweave": {
            "0": { "dx": -1, "dy": 2, "dRotate": 19.5, "dScale": 1.127 },
            "1": { "dx": 431, "dy": 409, "dRotate": 3.5, "dScale": 1.221 },
            "2": { "dx": -288, "dy": -113, "dRotate": 5.5, "dScale": 1.406 },
            "3": { "dx": -42, "dy": 83, "dRotate": -8.5, "dScale": 1.0 },
            "4": { "dx": 370, "dy": -445, "dRotate": 0, "dScale": 1.248 }
        },
        "tof_render": {
            "0": { "dx": -115, "dy": 6, "dRotate": -8, "dScale": 1.06 },
            "1": { "dx": 172, "dy": -109, "dRotate": 0, "dScale": 1.196 },
            "2": { "dx": 105, "dy": -99, "dRotate": 6, "dScale": 1.069 }
        },
        "aperture": {
            "0": { "dx": -15, "dy": -30, "dRotate": -2, "dScale": 1.059 },
            "1": { "dx": 61, "dy": 9, "dRotate": -2, "dScale": 1.06 },
            "2": { "dx": 71, "dy": 53, "dRotate": 0, "dScale": 1.042 }
        },
        "fortune_crystal": {
            "0": { "dx": 129, "dy": -17, "dRotate": 4, "dScale": 1.06 },
            "1": { "dx": -230, "dy": -51, "dRotate": 0, "dScale": 1.178 },
            "2": { "dx": 25, "dy": 17, "dRotate": 0, "dScale": 1.04 }
        },
        "symbolic_math": {
            "0": { "dx": 28, "dy": -26, "dRotate": 0, "dScale": 1.074 },
            "1": { "dx": 48, "dy": 20, "dRotate": 0, "dScale": 1.112 },
            "2": { "dx": 9, "dy": 11, "dRotate": 0, "dScale": 1.146 }
        },
        "photon_primitive": {
            "0": { "dx": 5, "dy": -27, "dRotate": 0, "dScale": 1.07 },
            "1": { "dx": -124, "dy": -14, "dRotate": -2, "dScale": 1.136 },
            "2": { "dx": 61, "dy": 8, "dRotate": 0, "dScale": 1.072 }
        },
        "tracer_flatland": {
            "0": { "dx": -51, "dy": -17, "dRotate": 0, "dScale": 1.056 },
            "1": { "dx": 107, "dy": -73, "dRotate": 0, "dScale": 1.166 },
            "2": { "dx": 22, "dy": 1, "dRotate": 0, "dScale": 1.12 }
        },
        "fenwick": {
            "0": { "dx": -79, "dy": -3, "dRotate": 0, "dScale": 1.104 },
            "1": { "dx": -1, "dy": -19, "dRotate": -1, "dScale": 1.06 },
            "2": { "dx": 10, "dy": 19, "dRotate": 0, "dScale": 1.054 }
        },
        "prism_optics": {
            "0": { "dx": -19, "dy": -17, "dRotate": 0, "dScale": 1.231 },
            "1": { "dx": 87, "dy": -25, "dRotate": -0.5, "dScale": 1.217 },
            "2": { "dx": 100, "dy": -21, "dRotate": 0, "dScale": 1.195 }
        },
        "dft_dct": {
            "0": { "dx": 0, "dy": 0, "dRotate": 6.5, "dScale": 1 },
            "1": { "dx": 0, "dy": 0, "dRotate": -1, "dScale": 1 },
            "2": { "dx": -2, "dy": 14, "dRotate": 0, "dScale": 1.04 }
        },
        "catalan": {
            "0": { "dx": 20, "dy": -51, "dRotate": 0, "dScale": 1.1 },
            "1": { "dx": 68, "dy": 17, "dRotate": -3, "dScale": 1.122 },
            "2": { "dx": 119, "dy": 46, "dRotate": 0, "dScale": 1.086 }
        },
        "image_processing": {
            "0": { "dx": -41, "dy": 18, "dRotate": 0, "dScale": 1.042 },
            "1": { "dx": 42, "dy": 67, "dRotate": 0, "dScale": 1.094 }
        },
        "graph_algorithms": {
            "0": { "dx": 40, "dy": 0, "dRotate": 0, "dScale": 1.071 },
            "1": { "dx": 20, "dy": 2, "dRotate": 2, "dScale": 1.081 },
            "2": { "dx": 35, "dy": 0, "dRotate": 1, "dScale": 1.063 }
        },
        "complex_function": {
            "0": { "dx": -17, "dy": -13, "dRotate": 0, "dScale": 1.043 },
            "1": { "dx": -26, "dy": -11, "dRotate": 0, "dScale": 1.116 },
            "2": { "dx": -36, "dy": 30, "dRotate": 0, "dScale": 1.126 }
        },
        "trees": {
            "0": { "dx": 0, "dy": 0, "dRotate": 0, "dScale": 1.224 },
            "1": { "dx": 53, "dy": 101, "dRotate": 0, "dScale": 1.292 }
        },
        "laplacian": {
            "0": { "dx": -122, "dy": -36, "dRotate": 0, "dScale": 1.274 },
            "1": { "dx": 636, "dy": -40, "dRotate": -5.5, "dScale": 1.143 },
            "2": { "dx": -278, "dy": -63, "dRotate": 0, "dScale": 1.233 },
            "3": { "dx": 484, "dy": -33, "dRotate": 0, "dScale": 1.102 },
            "4": { "dx": -216, "dy": -68, "dRotate": -3.5, "dScale": 1.248 }
        },
        "pi_collision": {
            "0": { "dx": -886, "dy": -11, "dRotate": 0, "dScale": 1.388 },
            "1": { "dx": -97, "dy": 50, "dRotate": 3, "dScale": 1.394 },
            "2": { "dx": -901, "dy": 112, "dRotate": 0, "dScale": 1.425 },
            "3": { "dx": -104, "dy": 182, "dRotate": -1.5, "dScale": 1.378 }
        },
        "5D": {
            "0": { "dx": -48, "dy": 28, "dRotate": 0, "dScale": 1.14 },
            "1": { "dx": 0, "dy": -5, "dRotate": 3.5, "dScale": 1.16 },
            "2": { "dx": -47, "dy": 90, "dRotate": 0, "dScale": 1.124 },
            "3": { "dx": 28, "dy": 50, "dRotate": 0, "dScale": 1.17 }
        }
    };
    
    let currentProjectTweaks = JSON.parse(JSON.stringify(savedTweaks));
    
    const imageCache = {};
    const preloadedImages = {};
    let previewsManifest = null;
    async function loadManifest() {
        if (previewsManifest !== null) return previewsManifest;
        try {
            const response = await fetch('previews-manifest.json');
            if (response.ok) {
                previewsManifest = await response.json();
                console.log('Previews manifest loaded:', Object.keys(previewsManifest).length, 'projects');
            } else {
                previewsManifest = {};
            }
        } catch (e) {
            previewsManifest = {};
        }
        return previewsManifest;
    }
    
    const PRELOAD_STRATEGY = 'all';
    
    async function preloadAllImagesImmediately() {
        await loadManifest();
        const projectIds = Array.from(projectCards)
            .map(card => card.dataset.project)
            .filter(Boolean);
        
        for (const projectId of projectIds) {
            const images = await getProjectImages(projectId);
            images.forEach(imgObj => {
                const src = typeof imgObj === 'string' ? imgObj : imgObj.url;
                if (!preloadedImages[src]) {
                    const img = new Image();
                    img.src = src;
                    preloadedImages[src] = img;
                }
            });
        }
        console.log('Gallery images preloaded (all at once)');
    }
    
    async function preloadImagesDeferred() {
        await loadManifest();
        const projectIds = Array.from(projectCards)
            .map(card => card.dataset.project)
            .filter(Boolean);
        
        // Wait for page to be idle before starting
        await new Promise(resolve => {
            if ('requestIdleCallback' in window) {
                requestIdleCallback(resolve, { timeout: 2000 });
            } else {
                setTimeout(resolve, 1000);
            }
        });
        
        // Load in batches with delays between
        const BATCH_SIZE = 3;
        const BATCH_DELAY = 100;
        
        for (let i = 0; i < projectIds.length; i += BATCH_SIZE) {
            const batch = projectIds.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async projectId => {
                const images = await getProjectImages(projectId);
                images.forEach(imgObj => {
                    const src = typeof imgObj === 'string' ? imgObj : imgObj.url;
                    if (!preloadedImages[src]) {
                        const img = new Image();
                        img.src = src;
                        preloadedImages[src] = img;
                    }
                });
            }));
            await new Promise(r => setTimeout(r, BATCH_DELAY));
        }
        console.log('Gallery images preloaded (deferred batches)');
    }
    
    function setupLazyPreload() {
        projectCards.forEach(card => {
            let preloaded = false;
            card.addEventListener('mouseenter', async () => {
                if (preloaded) return;
                preloaded = true;
                const projectId = card.dataset.project;
                const images = await getProjectImages(projectId);
                images.forEach(imgObj => {
                    const src = typeof imgObj === 'string' ? imgObj : imgObj.url;
                    if (!preloadedImages[src]) {
                        const img = new Image();
                        img.src = src;
                        preloadedImages[src] = img;
                    }
                });
            }, { once: true });
        });
        console.log('Gallery lazy preload setup complete');
    }
    
    function noPreload() {
        console.log('Gallery preload disabled - images load on demand');
    }
    
    // Execute chosen strategy
    switch (PRELOAD_STRATEGY) {
        case 'all': preloadAllImagesImmediately(); break;
        case 'deferred': preloadImagesDeferred(); break;
        case 'lazy': setupLazyPreload(); break;
        case 'none': noPreload(); break;
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
                    .replace(/\.[^/.]+$/, '')  // Remove extension
                    .replace(/[_]/g, ' ')     // Replace _ and - with space
                images.push({ url, name });
            }
        }
        
        imageCache[projectId] = images;
        return images;
    }
    
    function generateImageLayout(images, imageDimensions = {}, panelSide = 'right', projectId = '') {
        if (!images.length) return '';
        
        const { tiltRange, randomness, fanMode } = gallerySettings;
        const total = images.length;
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        const seededRandom = (seed) => {
            const x = Math.sin(seed * 9999) * 10000;
            return x - Math.floor(x);
        };
        
        const topPadding = 80;
        const bottomPadding = 80;
        const labelHeight = 24;
        const overlapAmount = 0.15;
        const baseArea = 200000;
        const maxWidth = 500;
        const minWidth = 300;
        
        const usableHeight = viewportHeight - topPadding - bottomPadding;
        
        const getImageInfo = (img, i) => {
            const imgUrl = typeof img === 'string' ? img : img.url;
            const imgName = typeof img === 'string' ? '' : img.name;
            const dims = imageDimensions[imgUrl] || { width: 16, height: 10 };
            const aspectRatio = dims.width / dims.height;
            return { imgUrl, imgName, aspectRatio, index: i };
        };
        
        const getAngle = (verticalProgress, index) => {
            const convergeSide = panelSide === 'right' ? -1 : 1;
            
            let baseAngle = 0;
            if (fanMode === 'toward') {
                // Bottom edges converge toward where card is
                baseAngle = convergeSide * (verticalProgress - 0.5) * tiltRange;
            } else if (fanMode === 'away') {
                // Bottom edges converge away from card
                baseAngle = -convergeSide * (verticalProgress - 0.5) * tiltRange;
            } else {
                // Random mode
                baseAngle = (seededRandom(index * 17) - 0.5) * tiltRange;
            }
            
            const randAngle = (seededRandom(index * 7) - 0.5) * randomness * 0.06;
            return baseAngle + randAngle;
        };
        
        // Render a single image div with optional tweak transforms
        const renderImage = (info, x, y, width, height, angle, zIndex, imageIndex) => {
            const { imgUrl, imgName } = info;
            
            // Apply any saved tweaks for this image (projectId passed from outer scope)
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
            
            return `<div class="gallery-image fade-enabled" style="${style}" data-index="${imageIndex}">
                ${labelHtml}
                <img src="${imgUrl}" alt="${imgName || 'Preview'}">
            </div>`;
        };
        
        // 2 images: bigger, stacked with slight offset
        if (total === 2) {
            const imageInfos = images.map(getImageInfo);
            const targetHeight = usableHeight * 0.42;
            
            return imageInfos.map((info, i) => {
                const width = Math.min(maxWidth, targetHeight * info.aspectRatio);
                const height = width / info.aspectRatio;
                const y = topPadding + i * (height * 0.9 + 40);
                const x = viewportWidth * 0.21;
                const horizJitter = (seededRandom(i * 11) - 0.5) * 30;
                const angle = getAngle(i, i);
                return renderImage(info, x + horizJitter, y, width, height, angle, i + 1, i);
            }).join('');
        }
        
        // 3 images: classic fan layout with overlap
        if (total === 3) {
            const imageInfos = images.map(getImageInfo);
            const targetHeight = usableHeight * 0.36;
            
            return imageInfos.map((info, i) => {
                const width = Math.min(maxWidth, targetHeight * info.aspectRatio);
                const height = width / info.aspectRatio;
                const spacing = (usableHeight - height) / 2;
                const y = topPadding + i * spacing;
                const x = viewportWidth * 0.21;
                
                const verticalProgress = i / 2;
                const fanCurve = Math.sin(verticalProgress * Math.PI);
                const convergeSide = panelSide === 'right' ? -1 : 1;
                const horizOffset = convergeSide * fanCurve * 20 + (seededRandom(i * 13) - 0.5) * 15;
                const angle = getAngle(verticalProgress, i);
                
                return renderImage(info, x + horizOffset, y, width, height, angle, i + 1, i);
            }).join('');
        }
        
        // 4 images: 2x2 grid with casual overlap
        if (total === 4) {
            const imageInfos = images.map(getImageInfo);
            const cellWidth = viewportWidth * 0.20;
            const cellHeight = usableHeight * 0.45;
            
            // Grid positions: top-left, top-right, bottom-left, bottom-right
            const gridPositions = [
                { col: 0, row: 0 },
                { col: 1, row: 0 },
                { col: 0, row: 1 },
                { col: 1, row: 1 }
            ];
            
            return imageInfos.map((info, i) => {
                const { col, row } = gridPositions[i];
                const targetW = cellWidth * 0.95;
                const width = Math.min(targetW, cellHeight * 0.9 * info.aspectRatio);
                const height = width / info.aspectRatio;
                
                const baseX = viewportWidth * 0.08 + col * cellWidth;
                const baseY = topPadding + row * cellHeight;
                
                // Add casual offset for overlap feel
                const offsetX = (seededRandom(i * 23) - 0.5) * 25;
                const offsetY = (seededRandom(i * 31) - 0.5) * 20;
                const angle = (seededRandom(i * 17) - 0.5) * tiltRange * 0.8;
                
                return renderImage(info, baseX + offsetX, baseY + offsetY, width, height, angle, i + 1, i);
            }).join('');
        }
        
        // 5 images: 3 on back layer, 2 on front layer (layered fan)
        if (total === 5) {
            const imageInfos = images.map(getImageInfo);
            const backLayer = [0, 2, 4]; // indices for back (3 images)
            const frontLayer = [1, 3];   // indices for front (2 images)
            
            const backHeight = usableHeight * 0.32;
            const frontHeight = usableHeight * 0.38;
            
            let html = '';
            
            // Back layer (3 images)
            backLayer.forEach((idx, i) => {
                const info = imageInfos[idx];
                const width = Math.min(maxWidth * 0.85, backHeight * info.aspectRatio);
                const height = width / info.aspectRatio;
                const spacing = (usableHeight - height) / 2;
                const y = topPadding + i * spacing;
                const x = viewportWidth * 0.24;
                
                const verticalProgress = i / 2;
                const convergeSide = panelSide === 'right' ? -1 : 1;
                const horizOffset = convergeSide * Math.sin(verticalProgress * Math.PI) * 15;
                const angle = getAngle(verticalProgress, idx);
                
                html += renderImage(info, x + horizOffset, y, width, height, angle, idx + 1, idx);
            });
            
            // Front layer (2 images, offset and bigger)
            frontLayer.forEach((idx, i) => {
                const info = imageInfos[idx];
                const width = Math.min(maxWidth * 0.95, frontHeight * info.aspectRatio);
                const height = width / info.aspectRatio;
                const y = topPadding + 60 + i * (usableHeight * 0.48);
                const x = viewportWidth * 0.18;
                
                const verticalProgress = (i + 0.5) / 2;
                const convergeSide = panelSide === 'right' ? -1 : 1;
                const horizOffset = convergeSide * 25 + (seededRandom(idx * 13) - 0.5) * 20;
                const angle = getAngle(verticalProgress, idx);
                
                html += renderImage(info, x + horizOffset, y, width, height, angle, idx + 10, idx);
            });
            
            return html;
        }
        
        // 6+ images: compact vertical stack with overlap
        const imageInfos = images.map(getImageInfo);
        const perImageHeight = usableHeight / total;
        const targetHeight = perImageHeight * (1 + overlapAmount);
        
        return imageInfos.map((info, i) => {
            const width = Math.min(maxWidth * 0.8, targetHeight * info.aspectRatio);
            const height = width / info.aspectRatio;
            const y = topPadding + i * (perImageHeight * (1 - overlapAmount));
            const x = viewportWidth * 0.21;
            
            const verticalProgress = total === 1 ? 0.5 : i / (total - 1);
            const convergeSide = panelSide === 'right' ? -1 : 1;
            const horizOffset = convergeSide * Math.sin(verticalProgress * Math.PI) * 20 + (seededRandom(i * 13) - 0.5) * 15;
            const angle = getAngle(verticalProgress, i);
            
            return renderImage(info, x + horizOffset, y, width, height, angle, i + 1, i);
        }).join('');
    }
    
    // Load image dimensions before layout
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
                imgEl.onerror = () => resolve(); // Use default on error
                imgEl.src = url;
            });
        });
        await Promise.all(promises);
        return dimensions;
    }
    
    // Determine which side panel should be on
    function getPanelSide(card) {
        const rect = card.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const cardCenterX = rect.left + rect.width / 2;
        return cardCenterX > viewportWidth * 0.66 ? 'left' : 'right';
    }
    
    async function updateGalleryContent(card) {
        const projectId = card.dataset.project;
        const images = await getProjectImages(projectId);
        
        if (images.length > 0) {
            // Get actual image dimensions and panel side for proper layout
            const dimensions = await getImageDimensions(images);
            const panelSide = getPanelSide(card);
            galleryImages.innerHTML = generateImageLayout(images, dimensions, panelSide, projectId);
            galleryImages.className = 'gallery-images';
            galleryPlaceholder.style.display = 'none';
            galleryImages.style.display = 'flex';
            
            // Trigger staggered fade-in for images
            const galleryImageElements = galleryImages.querySelectorAll('.gallery-image.fade-enabled');
            const fadeSpeed = getFadeSpeed();
            const staggerDelay = Math.min(80, fadeSpeed / 4);
            
            galleryImageElements.forEach((img, index) => {
                setTimeout(() => {
                    img.classList.add('image-visible');
                }, index * staggerDelay);
            });
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
    
    function getFadeSpeed() {
        return 250;
    }
    
    let transitionQueue = [];
    let isProcessingQueue = false;
    let hasLoadedContent = false;
    let pendingHide = false;
    
    async function processTransitionQueue() {
        if (isProcessingQueue || transitionQueue.length === 0) return;
        
        isProcessingQueue = true;
        pendingHide = false; // Cancel any pending hide
        const fadeSpeed = getFadeSpeed();
        
        while (transitionQueue.length > 0) {
            const card = transitionQueue[transitionQueue.length - 1];
            transitionQueue = [];
            
            if (card === currentCard) {
                isProcessingQueue = false;
                return;
            }
            
            const needsFadeOut = hasLoadedContent && currentCard !== null;
            
            if (needsFadeOut) {
                galleryPanel.classList.remove('visible');
                await new Promise(r => setTimeout(r, fadeSpeed));
                
                if (transitionQueue.length > 0) continue;
            }
            
            await updateGalleryContent(card);
            updatePanelPosition(card);
            currentCard = card;
            hasLoadedContent = true;
            
            galleryPanel.offsetHeight;
            galleryPanel.classList.add('visible');
            
            await new Promise(r => setTimeout(r, fadeSpeed));
        }
        
        isProcessingQueue = false;
        
        if (pendingHide) {
            pendingHide = false;
            galleryPanel.classList.remove('visible');
            currentCard = null;
            hasLoadedContent = false;
        }
    }
    
    projectCards.forEach(card => {
        card.addEventListener('mouseenter', async (e) => {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }
            
            pendingHide = false;
            transitionQueue.push(card);
            processTransitionQueue();
        });
        
        card.addEventListener('mouseleave', () => {
            if (isProcessingQueue) {
                pendingHide = true;
                transitionQueue = [];
                return;
            }
            
            transitionQueue = [];
            galleryPanel.classList.remove('visible');
            currentCard = null;
            hasLoadedContent = false;
        });
    });
    
    galleryPanel.classList.add('blur-effect');
    
    const navItems = document.querySelectorAll('.nav-item');
    const navItemsArray = Array.from(navItems);
    const sections = document.querySelectorAll('section[id], header[id]');
    const sideNav = document.querySelector('.side-nav');
    
    let targetDestination = null;
    
    function getGlowPosition(item) {
        if (!item || !sideNav) return 0;
        const navRect = sideNav.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        return itemRect.top - navRect.top + itemRect.height / 2 - 40;
    }
    
    function moveGlowTo(item) {
        const pos = getGlowPosition(item);
        sideNav.style.setProperty('--glow-speed', '0.05s');
        sideNav.style.setProperty('--glow-top', `${pos}px`);
    }
    
    function setActiveItem(item) {
        const currentActive = document.querySelector('.nav-item.active');
        if (currentActive === item) return;
        
        navItems.forEach(nav => {
            nav.classList.remove('active');
            nav.classList.remove('passing');
        });
        
        if (targetDestination && item !== targetDestination) {
            item.classList.add('passing');
        } else {
            item.classList.add('active');
        }
        
        moveGlowTo(item);
    }
    
    function getCurrentSection() {
        const scrollPos = window.scrollY + 200;
        let current = null;
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
                current = section.getAttribute('id');
            }
        });
        
        return current;
    }
    
    function findNavItem(sectionId) {
        return navItemsArray.find(item => 
            item.getAttribute('href').substring(1) === sectionId
        );
    }
    
    function navigateTo(item) {
        const targetId = item.getAttribute('href').substring(1);
        const targetSection = document.getElementById(targetId);
        if (!targetSection) return;
        
        targetDestination = item;
        targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(item);
        });
    });
    
    let lastUpdateTime = 0;
    const THROTTLE_MS = 20;
    
    window.addEventListener('scroll', () => {
        const now = performance.now();
        
        if (now - lastUpdateTime < THROTTLE_MS) return;
        lastUpdateTime = now;
        
        requestAnimationFrame(() => {
            const currentSection = getCurrentSection();
            if (currentSection) {
                const navItem = findNavItem(currentSection);
                if (navItem) {
                    setActiveItem(navItem);
                    
                    if (navItem === targetDestination) {
                        setTimeout(() => {
                            if (navItem === targetDestination) {
                                navItem.classList.remove('passing');
                                navItem.classList.add('active');
                                targetDestination = null;
                            }
                        }, 100);
                    }
                }
            }
        });
    });
    
    const initialSection = getCurrentSection();
    const initialItem = initialSection ? findNavItem(initialSection) : navItemsArray[0];
    if (initialItem) {
        initialItem.classList.add('active');
        moveGlowTo(initialItem);
    }
    
    function generateTagCloud() {
        const tagCloud = document.querySelector('.tag-cloud');
        if (!tagCloud) return;
        
        const sectionWeights = {
            'signature': 5,
            'interactive': 2,
            'prototypes': 1
        };
        
        const tagCounts = {};
        const languageCounts = {};
        
        Object.keys(sectionWeights).forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (!section) return;
            
            const weight = sectionWeights[sectionId];
            const cards = section.querySelectorAll('.project-card:not(.coming-soon-card)');
            
            cards.forEach(card => {
                const visibleTags = card.querySelectorAll('.project-tags .tag');
                visibleTags.forEach(tag => {
                    const text = tag.textContent.trim();
                    tagCounts[text] = (tagCounts[text] || 0) + weight;
                });
                
                const languageBadge = card.querySelector('.language-badge');
                if (languageBadge) {
                    const lang = languageBadge.textContent.trim();
                    languageCounts[lang] = (languageCounts[lang] || 0) + weight;
                }
            });
        });
        
        const manualTags = {
            'Research': 'size-lg'
        };
        
        const getSizeClass = (count) => {
            if (count >= 10) return 'size-xl';
            if (count >= 7) return 'size-lg';
            if (count >= 4) return 'size-md';
            return 'size-sm';
        };
        
        const sortedTags = Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1]);
        
        const sortedLanguages = Object.entries(languageCounts)
            .sort((a, b) => b[1] - a[1]);
        
        let tagHTML = '';
        
        sortedLanguages.forEach(([lang, count]) => {
            const sizeClass = getSizeClass(count);
            tagHTML += `<span class="cloud-tag ${sizeClass}">${lang}</span>\n                `;
        });
        
        sortedTags.forEach(([tag, count]) => {
            const sizeClass = getSizeClass(count);
            tagHTML += `<span class="cloud-tag ${sizeClass}">${tag}</span>\n                `;
        });
        
        Object.entries(manualTags).forEach(([tag, sizeClass]) => {
            tagHTML += `<span class="cloud-tag ${sizeClass}">${tag}</span>\n                `;
        });
        
        tagCloud.innerHTML = tagHTML;
    }
    
    generateTagCloud();
});
