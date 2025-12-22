/**
 * Application-wide constants
 * Centralizes all magic numbers and string literals
 */

export const CANVAS = {
    DEFAULT_WIDTH: 800,
    DEFAULT_HEIGHT: 600,
    BACKGROUND: '#1a1a2e'
};

export const NODE = {
    RADIUS: 25,
    LABEL_OFFSET: 5,
    HOVER_SCALE: 1.1,
    FLOYD_K_SCALE: 1.4,
    FLOYD_IJ_SCALE: 1.25
};

export const EDGE = {
    WIDTH: 2,
    ARROW_SIZE: 12,
    LABEL_OFFSET: 10,
    DASH_PATTERN: [5, 5]
};

export const COLORS = {
    // Algorithm states
    VISITED: '#4caf50',
    CURRENT: '#ffd54f',
    NEIGHBOR: '#64b5f6',
    REJECTED: '#f44336',
    PROCESSED: '#9c27b0',
    
    // Floyd-Warshall
    FLOYD_K: '#ffd54f',
    FLOYD_I: '#64b5f6',
    FLOYD_J: '#ba68c8',
    FLOYD_ACCEPTED: '#4caf50',
    FLOYD_REJECTED: '#ff9800',
    
    // Paths and edges
    PATH_CANDIDATE: '#64b5f6',
    PATH_CURRENT: '#ba68c8',
    PATH_HOVER: '#4caf50',
    EDGE_DEFAULT: '#90a4ae',
    EDGE_EXPLORED: '#ef5350',
    EDGE_MST: '#ab47bc',
    
    // Nodes
    NODE_DEFAULT: '#2196F3',
    
    // UI
    TEXT: '#ffffff',
    TEXT_SECONDARY: '#b0bec5',
    BACKGROUND: '#1a1a2e',
    INFINITY: '#ff5252'
};

export const ANIMATION = {
    DEFAULT_SPEED: 2,
    MIN_SPEED: 1,
    MAX_SPEED: 10,
    PULSE_RADIUS: 30,
    PULSE_MAX_RADIUS: 60,
    PULSE_ALPHA: 0.6,
    TRIANGLE_LIFETIME: 1.0,
    PATH_GLOW_ALPHA: 0.6
};

export const ALGORITHMS = {
    DIJKSTRA: 'dijkstra',
    PRIM: 'prim',
    PRIM_UNOPTIMIZED: 'prim-unoptimized',
    KRUSKAL: 'kruskal',
    BELLMAN_FORD: 'bellman',
    SPFA: 'spfa',
    FLOYD_WARSHALL: 'floyd'
};

export const FLOYD_MODES = {
    PATH_TRACKING: 'path-tracking',
    LENGTH_ONLY: 'length-only'
};

export const VISUAL_STYLES = {
    FLAT: 'flat',
    GLOSSY_3D: '3d'
};

export const STEP_TYPES = {
    INIT: 'init',
    VISIT: 'visit',
    EXPLORE: 'explore',
    RELAX: 'relax',
    COMPARE: 'compare',
    UPDATE: 'update',
    SKIP: 'skip',
    INTERMEDIATE: 'intermediate',
    COMPLETE: 'complete',
    PQ_PEEK: 'pq_peek',
    PQ_POP: 'pq_pop',
    PQ_ADD: 'pq_add',
    PQ_UPDATE: 'pq_update',
    PQ_SKIP: 'pq_skip',
    ADD_TO_MST: 'add_to_mst',
    EDGE_REJECT: 'edge_reject',
    BEGIN_BATCH: 'begin_batch',
    ACCEPT: 'accept'
};

export const WEIGHT_MODES = {
    UNIFORM: 'uniform',
    RANDOM: 'random',
    WEIGHTED: 'weighted'
};

export const PARTICLE_TYPES = {
    PULSE: 'pulse',
    DASHED_TRIANGLE: 'dashedTriangle',
    GLOWING_PATH: 'glowingPath',
    GREEN_CIRCLE: 'greenCircle',
    EXPLOSION: 'explosion',
    SPINNING_CIRCLE: 'spinningCircle'
};
