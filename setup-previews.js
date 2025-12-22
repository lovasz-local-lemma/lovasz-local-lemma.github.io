/**
 * Setup preview folders for all projects
 * Run: node setup-previews.js
 */

const fs = require('fs');
const path = require('path');

const PREVIEWS_DIR = path.join(__dirname, 'previews');

// Project IDs extracted from index.html hrefs
const projectIds = [
    'aperture',
    'tof_render',
    'shaderweave',
    'photon_primitive',
    'symbolic_math',
    'fortune_crystal',
    'tracer_flatland',
    'fenwick',
    'prism_optics',
    'dft_dct',
    'complex_function',
    'image_processing',
    'catalan',
    'trees',
    'graph_algorithms',
    '5D',
    'pi_collision',
    'laplacian'
];

// Ensure previews directory exists
if (!fs.existsSync(PREVIEWS_DIR)) {
    fs.mkdirSync(PREVIEWS_DIR);
    console.log('Created previews/ directory');
}

// Create folder for each project
for (const id of projectIds) {
    const folderPath = path.join(PREVIEWS_DIR, id);
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath);
        console.log(`Created: previews/${id}/`);
    } else {
        console.log(`Exists:  previews/${id}/`);
    }
}

console.log('\nDone! Add images to folders, then run: node generate-previews.js');
