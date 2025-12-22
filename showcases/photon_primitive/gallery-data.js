// Gallery Room Configurations
const GALLERY_ROOMS = [
    {
        id: "primitives",
        title: "Geometric Primitives",
        description: "Each primitive sweeps a different dimension. Sphere, cone, disk—each creates its own aesthetic signature.",
        commentary: "These aren't just rendering techniques—they're brushstrokes in a computational painting.",
        images: [
            {
                path: "images/SPHERE.png",
                title: "Sphere Primitive",
                category: "Primitive"
            },
            {
                path: "images/CONE.png",
                title: "Cone Primitive",
                category: "Primitive"
            },
            {
                path: "images/DISK.png",
                title: "Disk Primitive",
                category: "Primitive"
            },
            {
                path: "images/SPHERE_CONE.png",
                title: "Sphere + Cone",
                category: "Combination"
            },
            {
                path: "images/SPHERE_DISK.png",
                title: "Sphere + Disk",
                category: "Combination"
            },
            {
                path: "images/CSD.png",
                title: "Cone-Sphere-Disk",
                category: "Combination"
            }
        ]
    },
    {
        id: "comparison",
        title: "Against the Baseline",
        description: "Watch how different estimators handle the same scene. NEE, naive sampling, and our primitive-based approaches.",
        commentary: "Sometimes the 'wrong' path creates the most interesting intermediate frames.",
        images: [
            {
                path: "images/NEE.png",
                title: "Next Event Estimation",
                category: "Baseline"
            },
            {
                path: "images/NAIVE.png",
                title: "Naive Sampling",
                category: "Baseline"
            },
            {
                path: "images/NEE+naive.png",
                title: "NEE + Naive",
                category: "Combined"
            },
            {
                path: "images/NEE+DISK.png",
                title: "NEE + Disk",
                category: "Our Method"
            },
            {
                path: "images/NEE+naive+disk.png",
                title: "NEE + Naive + Disk",
                category: "Our Method"
            },
            {
                path: "images/disk_unbiased.png",
                title: "Disk (Unbiased)",
                category: "Our Method"
            }
        ]
    },
    {
        id: "evolution",
        title: "Progressive Refinement",
        description: "From chaotic noise to photorealistic convergence. Each frame is a snapshot of the estimator's journey.",
        commentary: "The artifacts tell a story. They're not errors—they're the algorithm exploring possibility space.",
        images: [
            {
                path: "images/PP0_A.png",
                title: "Early Sample (PP0_A)",
                category: "Evolution"
            },
            {
                path: "images/PP0_A001.png",
                title: "Iteration 1",
                category: "Evolution"
            },
            {
                path: "images/PP0_A002.png",
                title: "Iteration 2",
                category: "Evolution"
            },
            {
                path: "images/PP0_A004.png",
                title: "Iteration 4",
                category: "Evolution"
            },
            {
                path: "images/PP0_A007.png",
                title: "Iteration 7",
                category: "Evolution"
            },
            {
                path: "images/PP0_A010.png",
                title: "Iteration 10",
                category: "Evolution"
            },
            {
                path: "images/PP0_A013.png",
                title: "Near Convergence",
                category: "Evolution"
            }
        ]
    },
    {
        id: "stylish",
        title: "Correlated Artifacts",
        description: "When primitives stay consistent across pixels, magic happens. These are correlated estimators in action.",
        commentary: "Game developers: this is your style library. Rasterizable, artistic, and mathematically sound.",
        images: [
            {
                path: "images/SS0_test_B028.png",
                title: "Bold Patterns",
                category: "Correlated"
            },
            {
                path: "images/SS0_test_B029.png",
                title: "Sweeping Artifacts",
                category: "Correlated"
            },
            {
                path: "images/SS0_test_B030.png",
                title: "Geometric Flow",
                category: "Correlated"
            },
            {
                path: "images/SS0_test_B031.png",
                title: "Crystalline Structure",
                category: "Correlated"
            },
            {
                path: "images/SS0_test_B032.png",
                title: "Radial Beauty",
                category: "Correlated"
            },
            {
                path: "images/SS0_test_B035.png",
                title: "Layered Complexity",
                category: "Correlated"
            }
        ]
    },
    {
        id: "anisotropic",
        title: "Anisotropic & Directional",
        description: "Sweeping along specific planes and directions. X-plane, Y-plane, Z-plane, cones, spheres—all combined.",
        commentary: "The LR2 framework: where dimensional sweeping becomes an art form.",
        images: [
            {
                path: "images/LR2.png",
                title: "LR2 Full Method",
                category: "LR2"
            },
            {
                path: "images/BALANCE_LR2aniso_xplane_ _yplane_ _zplane_ _cone_ _sphere_1.png",
                title: "Balanced Multi-Primitive",
                category: "LR2"
            },
            {
                path: "images/LR2anisobeam_.png",
                title: "LR2 Beam",
                category: "LR2"
            },
            {
                path: "images/LR2aniso-P xplane, P yplane, P zplane, P cone, P sphere-_.png",
                title: "Planar Sweep Combination",
                category: "LR2"
            }
        ]
    },
    {
        id: "real-scenes",
        title: "Real-World Scenes",
        description: "From test scenes to actual renders. Dining rooms, living rooms, and complex light transport.",
        commentary: "This is where theory meets reality. Watch the techniques handle caustics, global illumination, and participating media.",
        images: [
            {
                path: "images/ball.png",
                title: "Ball Scene",
                category: "Scene"
            },
            {
                path: "images/dining-room_beauty.png",
                title: "Dining Room",
                category: "Scene"
            },
            {
                path: "images/livingroom2_beauty.png",
                title: "Living Room",
                category: "Scene"
            },
            {
                path: "images/S2M_.png",
                title: "S2M Method",
                category: "Comparison"
            },
            {
                path: "images/S2M_beam_.png",
                title: "S2M Beam",
                category: "Comparison"
            },
            {
                path: "images/S2M_ours_.png",
                title: "Our Method",
                category: "Comparison"
            },
            {
                path: "images/gas.png",
                title: "Volumetric Rendering",
                category: "Scene"
            },
            {
                path: "images/vspt_full.png",
                title: "vs Path Tracing (Full)",
                category: "Comparison"
            },
            {
                path: "images/vspt_b.png",
                title: "vs Path Tracing (B)",
                category: "Comparison"
            },
            {
                path: "images/vsb_l.png",
                title: "vs Baseline (L)",
                category: "Comparison"
            }
        ]
    }
];

// Additional single images for grid view
const ADDITIONAL_IMAGES = [
    { path: "images/Q0_A.png", title: "Q0_A Test", category: "Test" },
    { path: "images/Q1_A.png", title: "Q1_A Test", category: "Test" },
    { path: "images/Q2_A.png", title: "Q2_A Test", category: "Test" },
    { path: "images/S0_A.png", title: "S0_A Test", category: "Test" },
    { path: "images/C0_test_B027.png", title: "C0 Test B027", category: "Test" },
    { path: "images/D008.png", title: "Diffuse Test 008", category: "Test" },
    { path: "images/D019.png", title: "Diffuse Test 019", category: "Test" },
    { path: "images/UT.png", title: "UT Component", category: "Component" },
    { path: "images/VT.png", title: "VT Component", category: "Component" },
    { path: "images/UV.png", title: "UV Component", category: "Component" },
    { path: "images/UT_VT.png", title: "UT+VT Combined", category: "Component" },
    { path: "images/aA274.png", title: "Anisotropic 274", category: "Anisotropic" },
    { path: "images/aA275.png", title: "Anisotropic 275", category: "Anisotropic" },
    { path: "images/aA276.png", title: "Anisotropic 276", category: "Anisotropic" },
    { path: "images/aA277.png", title: "Anisotropic 277", category: "Anisotropic" }
];

// Get all images for grid view
function getAllImages() {
    const allImages = [];
    
    // Add images from rooms
    GALLERY_ROOMS.forEach(room => {
        room.images.forEach(img => {
            allImages.push({
                ...img,
                room: room.title
            });
        });
    });
    
    // Add additional images
    ADDITIONAL_IMAGES.forEach(img => {
        allImages.push({
            ...img,
            room: "Additional"
        });
    });
    
    return allImages;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GALLERY_ROOMS, ADDITIONAL_IMAGES, getAllImages };
}
