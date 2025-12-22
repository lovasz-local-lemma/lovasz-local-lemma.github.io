/**
 * Generate previews manifest by scanning the previews folder
 * Run this before deploying: node generate-previews.js
 */

const fs = require('fs');
const path = require('path');

const PREVIEWS_DIR = path.join(__dirname, 'previews');
const OUTPUT_FILE = path.join(__dirname, 'previews-manifest.json');
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

function scanPreviews() {
    const manifest = {};
    
    // Check if previews directory exists
    if (!fs.existsSync(PREVIEWS_DIR)) {
        console.log('No previews directory found. Creating empty manifest.');
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify({}, null, 2));
        return;
    }
    
    // Get all items in previews directory
    const items = fs.readdirSync(PREVIEWS_DIR);
    
    for (const item of items) {
        const itemPath = path.join(PREVIEWS_DIR, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
            // Scan folder for images
            const files = fs.readdirSync(itemPath);
            const images = files
                .filter(file => IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()))
                .sort(); // Sort alphabetically
            
            if (images.length > 0) {
                manifest[item] = images;
                console.log(`  ${item}: ${images.length} images`);
            }
        } else if (stat.isFile()) {
            // Single image file at root (e.g., projectId.png)
            const ext = path.extname(item).toLowerCase();
            if (IMAGE_EXTENSIONS.includes(ext)) {
                const projectId = path.basename(item, ext);
                manifest[projectId] = [item];
                console.log(`  ${projectId}: 1 image (root)`);
            }
        }
    }
    
    // Write manifest
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
    console.log(`\nManifest written to: ${OUTPUT_FILE}`);
    console.log(`Total projects: ${Object.keys(manifest).length}`);
}

console.log('Scanning previews folder...\n');
scanPreviews();
