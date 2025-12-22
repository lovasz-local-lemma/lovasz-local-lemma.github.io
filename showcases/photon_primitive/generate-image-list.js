#!/usr/bin/env node
/**
 * Generate image list from the images folder
 * Run this whenever you add new images: node generate-image-list.js
 */

const fs = require('fs');
const path = require('path');

const imagesDir = path.join(__dirname, 'images');
const outputFile = path.join(__dirname, 'image-list.js');

// Read all files from images directory
const files = fs.readdirSync(imagesDir);

// Filter for image files
const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const imageFiles = files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return imageExtensions.includes(ext);
});

// Generate JavaScript file
const output = `// Auto-generated image list
// Run 'node generate-image-list.js' to regenerate this file

const ALL_IMAGES = [
${imageFiles.map(file => `    "images/${file}"`).join(',\n')}
];

// Export for use in gallery
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ALL_IMAGES;
}
`;

fs.writeFileSync(outputFile, output, 'utf8');

console.log(`✅ Generated image list with ${imageFiles.length} images`);
console.log(`📝 Saved to: ${outputFile}`);
console.log('\nImages found:');
imageFiles.forEach((file, i) => {
    console.log(`  ${i + 1}. ${file}`);
});
