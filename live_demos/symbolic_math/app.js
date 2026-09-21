// Modern Mathematical Expression Analyzer - Enhanced JavaScript

// State Management
const state = {
    currentExpressionId: null,
    originalExpression: null, // The very first parsed expression (never changes)
    lastResult: null,         // Latest operation result (for visualization)
    opsMenuOpen: false
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    renderExamples();
    setupDetailsAnimation();
    setupEventListeners();
    initWobbleEffects();
});

// Example expressions, grouped and collapsible. Each group has a math-glyph icon
// and an accent color (cohesive per-category coding). Chips keep class "example-btn"
// and data-formula so the existing click wiring picks them up.
const EXAMPLE_GROUPS = [
  { icon: 'xⁿ',   color: '#60a5fa', title: 'Basics', open: true, items: ['x^3','1/x','sin(x)','cos(x)','exp(x)','sinh(x)','cosh(x)','tanh(x)','tan(x)','sec(x)','cot(x)','csc(x)','sin(2*x)','exp(2*x+1)'] },
  { icon: 'u',    color: '#22d3ee', title: 'U-substitution', items: ['x/(x^2+1)','(x^2+1)/(x^3+3*x)','2*x*exp(x^2)','x*exp(x^2)','cos(x)*exp(sin(x))','sin(x)*exp(cos(x))','x*cos(x^2)','x^2*exp(x^3)','sin(x)^2*cos(x)','sin(x)^3*cos(x)','x*sin(x^2)','x/(x^2+1)^2','exp(x)/(exp(x)+1)^2'] },
  { icon: '∫uv',  color: '#a78bfa', title: 'Integration by parts', items: ['x*exp(x)','x*sin(x)','x^2*cos(x)','x*ln(x)','x^2*exp(x)','x^3*sin(x)','x^3*cos(x)','arctan(x)','arcsin(x)','x*arctan(x)','ln(x)^2','ln(x)^3','x^2*ln(x)','x^2*exp(0-x)'] },
  { icon: 'sin',  color: '#f472b6', title: 'Trigonometric', items: ['sin(x)*cos(x)','sin(x)^2','cos(x)^2','sin(x)^3','cos(x)^3','sin(x)^4','cos(x)^4','tan(x)^2','tan(x)^3','tan(x)^4','sec(x)^3','sin(x)^2*cos(x)^2','1/(sin(x)*cos(x))','1/(cos(x)^2)','1/(sin(x)^2)','tan(x)*sec(x)','sec(x)^2*tan(x)','1/(1+sin(x))','1/(1+cos(x))','sin(2*x)*cos(3*x)','sin(3*x)*cos(5*x)'] },
  { icon: 'P/Q',  color: '#fbbf24', title: 'Rational & partial fractions', items: ['1/(x^2-4)','1/(x^2-9)','(2*x+3)/(x^2-4)','(x-1)/(x^2-9)','x^3/x','(x^2+1)/x','(x^3+2*x)/x','1/(x*(x+1))','1/(x^2*(x+1))','1/(x^2+2*x+5)','x/(x^2+2*x+5)','(2*x+1)/(x^2+1)','x^2/(x^2+1)','(x^2+x+1)/(x+1)','1/((x+1)*(x+2))','(3*x+2)/(x^2+x)','x^3/(x+1)','(x^3-1)/(x-1)','(x^4-1)/(x^2-1)','(x^2-4)/(x-2)','1/(1+x^3)'] },
  { icon: '√',    color: '#34d399', title: 'Radicals & trig substitution', items: ['sqrt(x)','1/sqrt(x)','sqrt(4-x^2)','sqrt(x^2+4)','sqrt(x^2-4)','sqrt(1-x^2)','1/sqrt(1-x^2)','1/sqrt(x^2+1)','x*sqrt(x^2+1)','1/sqrt(x^2+2*x+5)','cos(x)/sqrt(sin(x))'] },
  { icon: 'ln',   color: '#fb923c', title: 'Logarithmic', items: ['ln(x)/x','sin(ln(x))/x','1/(x*ln(x))','ln(x)/x^2'] },
  { icon: '≡',    color: '#38bdf8', title: 'Simplification examples', items: ['x+x','x*x+x*x','3*x^2+5*x^2','(x-1)^2','(x+1)^2','(x+2)^2-4','x^2+2*x+x^2','(x+1)^2-(x-1)^2','x^2+3*x','(2*x^2)/(x*(x+2))','(x*x+x*x)/((x+1)^2-1)','(x^2)/(x)','(x+1)^3','(x+1)^2*(x-1)^2','((x+1)^2-1)^2','(x^2+2*x+1)-(x+1)^2','((x+1)^2-1)/x'] },
  { icon: 'i',    color: '#818cf8', title: 'Complex / Euler-form examples', items: ['sin(i*x)','cos(i*x)','exp(i*x)','sin(x+i)','(1+i)*x','i*x^2','exp(i*pi)','i^2'] },
  { icon: '[a,b]',color: '#2dd4bf', title: 'Definite-integral examples (try the ∫ab button)', items: ['x^2','sin(x)','x^3','cos(x)'] },
  { icon: '∮',    color: '#f87171', title: 'Improper / residue examples (try ∮, -∞..∞)', items: ['1/(x^2+1)','1/(x^2+4)','1/(x^4+1)','1/((x^2+1)*(x^2+4))','1/(x^2+1)^2','x^2/(x^4+1)','1/(x^2+2*x+2)'] },
  { icon: '⚔',    color: '#fb7185', title: 'Conquered — poly·exp·trig & mixed trig powers (new)', items: ['x^2*exp(x)*sin(x)','x*exp(x)*cos(x)','x*sin(x)^2','sin(x)^2*cos(x)^3','x^3*exp(x)*cos(x)','x^2*exp(2*x)*sin(3*x)','x^2*sin(x)^2','sin(x)^4*cos(x)^3','sin(x)^3*cos(x)^3'] },
  { icon: 'ƒ',    color: '#e879f9', title: 'Special functions — non-elementary, solved via erf, Si, Ci, Ei, li, Fresnel (new)', items: ['exp(0-x^2)','exp(-2*x^2)','sin(x)/x','cos(x)/x','sin(2*x)/x','exp(x)/x','1/ln(x)','sin(x^2)','cos(x^2)','exp(x)*ln(x)','ln(ln(x))'] },
  { icon: 'ℍ',    color: '#67e8f9', title: 'Quaternion-valued (componentwise) — i, j, k as constants (new)', items: ['(1+j)*x','j*sin(x)+k*cos(x)','(2+i+j+k)*x^2','exp(x)*k','x*j+x^2*k','(1+i+j+k)*exp(x)'] },
  { icon: '∄',    color: '#94a3b8', title: 'Honest FAILED — no standard closed form (or beyond the engine)', limitations: true, items: ['x^x','sqrt(sin(x))','exp(x^2)','1/(x^4+1)'] },
];

function renderExamples() {
    const root = document.getElementById('exampleGroups');
    if (!root) return;
    root.innerHTML = EXAMPLE_GROUPS.map(g => {
        const chips = g.items.map(f =>
            `<button class="example-btn" type="button" data-formula="${f.replace(/"/g, '&quot;')}" title="${escapeHtml(f)}">${mathHtml(f)}</button>`
        ).join('');
        return `<details class="example-group${g.limitations ? ' limitations' : ''}"${g.open ? ' open' : ''} style="--accent:${g.color || '#60a5fa'}">` +
               `<summary><span class="group-icon">${escapeHtml(g.icon || '')}</span>` +
               `<span class="group-title">${escapeHtml(g.title)}</span>` +
               `<span class="group-count">${g.items.length}</span></summary>` +
               `<div class="chips-wrap"><div class="example-chips">${chips}</div></div></details>`;
    }).join('');
}

// Pretty math (symbols only, no coloring) — for mixed text like step rule labels.
function prettifyMath(s) {
    const sup = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹' };
    return escapeHtml(String(s == null ? '' : s))
        .replace(/\^(\d+)/g, (_, d) => d.replace(/./g, c => sup[c]))
        .replace(/[*×]/g, '·')
        .replace(/\bsqrt\b/g, '√')
        .replace(/\bpi\b/g, 'π');
}

// Syntax-highlighted pretty math: colored function / number / variable / i / operator
// tokens, Unicode superscripts, and depth-cycled parenthesis colors.
// data-formula keeps the raw, parseable string.
const MATH_FN_RE = /(FresnelS|FresnelC|erf|Si|Ci|Ei|li|arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|sec|csc|ln|exp|sqrt|abs)|(\bpi\b|π)|(\^\d+)|(\d+\.?\d*)|(\b[ijk]\b)|([a-zA-Z]\w*)|([+\-*×·/÷^−])|([()])/g;
// MathJax is loaded with `async`, so `window.MathJax` can be truthy (the config
// stub) while typesetPromise does not exist yet. The old `if (window.MathJax)`
// guard therefore skipped typesetting on early renders and left raw \[...\] on
// screen. Wait for startup, then typeset; retry briefly if the script is still
// in flight.
function typesetMath(el, attempt = 0) {
    if (!el) return;
    const mj = window.MathJax;
    if (mj && typeof mj.typesetPromise === 'function') {
        const run = () => mj.typesetPromise([el]).catch(err => console.error('MathJax error:', err));
        (mj.startup && mj.startup.promise) ? mj.startup.promise.then(run).catch(run) : run();
        return;
    }
    if (attempt < 40) setTimeout(() => typesetMath(el, attempt + 1), 150);
}

function mathHtml(s) {
    if (s == null) return '';
    const sup = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹' };
    let depth = 0;
    return escapeHtml(String(s)).replace(MATH_FN_RE, (m, fn, pi, pow, num, im, id, op, paren) => {
        if (fn) return `<span class="tok-fn">${fn === 'sqrt' ? '√' : fn}</span>`;
        if (pi) return '<span class="tok-const">π</span>';
        if (pow) return `<span class="tok-pow">${pow.slice(1).replace(/./g, c => sup[c])}</span>`;
        if (num) return `<span class="tok-num">${num}</span>`;
        if (im) return `<span class="tok-i">${im}</span>`;
        if (id) return `<span class="tok-var">${id}</span>`;
        if (op) return `<span class="tok-op">${(op === '*' || op === '×') ? '·' : op}</span>`;
        if (paren) {
            if (paren === '(') { const c = depth % 3; depth += 1; return `<span class="tok-paren-${c}">(</span>`; }
            depth = Math.max(0, depth - 1);
            return `<span class="tok-paren-${depth % 3}">)</span>`;
        }
        return m;
    });
}

// Smooth fold/unfold: intercept the summary toggle and animate the chips-wrap height
// (preventDefault reliably cancels the native toggle on real activations). The wrapper
// has no padding so it collapses cleanly. Respects prefers-reduced-motion.
function setupDetailsAnimation() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('details.example-group').forEach(d => {
        const summary = d.querySelector('summary');
        const wrap = d.querySelector('.chips-wrap');
        if (!summary || !wrap) return;
        if (d.open) wrap.style.height = 'auto';
        summary.addEventListener('click', (e) => {
            if (reduce || wrap._busy) return;   // reduced-motion → native instant toggle
            e.preventDefault();
            wrap._busy = true;
            const opening = !d.open;
            let done = false;
            const finalize = () => {
                if (done) return;
                done = true;
                if (opening) { wrap.style.height = 'auto'; }
                else { d.open = false; wrap.style.height = ''; }
                wrap._busy = false;
            };
            if (opening) {
                d.open = true;                  // show content
                const target = wrap.scrollHeight;
                wrap.style.height = '0px';
                void wrap.offsetHeight;         // force reflow (no rAF dependency)
                wrap.style.height = target + 'px';
            } else {
                wrap.style.height = wrap.scrollHeight + 'px';
                void wrap.offsetHeight;
                wrap.style.height = '0px';
            }
            wrap.addEventListener('transitionend', finalize, { once: true });
            setTimeout(finalize, 320);          // fallback if transitionend never fires
        });
    });
}

// Event Listeners
function setupEventListeners() {
    // Parse button
    document.getElementById('parseBtn').addEventListener('click', parseExpression);
    document.getElementById('formula').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') parseExpression();
    });
    
    // Example buttons
    document.querySelectorAll('.example-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.getElementById('formula').value = btn.dataset.formula;
            await parseExpression();
            // Bring the formula/tree region into view so the user sees the parsed result.
            const grid = document.getElementById('displayGrid');
            if (grid && grid.style.display !== 'none') {
                grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
    
    // Reset view
    document.getElementById('resetView').addEventListener('click', resetView);
    
    // Tree view toggle
    document.getElementById('toggleTreeView').addEventListener('click', toggleTreeView);
    
    // Operations panel
    document.getElementById('opsToggle').addEventListener('click', toggleOpsMenu);
    document.querySelectorAll('.op-btn').forEach(btn => {
        btn.addEventListener('click', () => handleOperation(btn.dataset.op));
    });

    // Operation-symbol style (white vs black + 360° white glow), persisted
    const iconStyle = document.getElementById('iconStyle');
    const grid = document.querySelector('.ops-grid');
    if (iconStyle && grid) {
        const applyIconStyle = (v) => grid.classList.toggle('icon-glow', v === 'glow');
        const saved = localStorage.getItem('iconStyle') || 'white';
        iconStyle.value = saved;
        applyIconStyle(saved);
        iconStyle.addEventListener('change', () => {
            localStorage.setItem('iconStyle', iconStyle.value);
            applyIconStyle(iconStyle.value);
        });
    }
    
    // Modal
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalCancel').addEventListener('click', closeModal);
    document.getElementById('modalSubmit').addEventListener('click', executeModalOperation);
    
    // Modal only closes via X or Cancel buttons (not by clicking outside)
    
    // Font selector
    const fontSelector = document.getElementById('fontSelector');
    if (fontSelector) {
        fontSelector.addEventListener('change', (e) => {
            const fontClass = `font-${e.target.value}`;
            document.body.className = document.body.className.replace(/font-\w+/g, '');
            document.body.classList.add(fontClass);
            localStorage.setItem('selectedFont', e.target.value);
        });
        
        // Load saved font preference
        const savedFont = localStorage.getItem('selectedFont');
        if (savedFont) {
            fontSelector.value = savedFont;
            document.body.classList.add(`font-${savedFont}`);
        } else {
            document.body.classList.add('font-inter');
        }
    }
}

// Parse Expression
async function parseExpression() {
    const formula = document.getElementById('formula').value.trim();
    if (!formula) return;
    
    const experimental = document.getElementById('experimentalMode').checked;
    const parseBtn = document.getElementById('parseBtn');
    if (parseBtn) parseBtn.classList.add('is-busy');

    try {
        const response = await fetch('/api/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                expression: formula,
                experimental: experimental
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            state.currentExpressionId = null;
            showError(data.error);
            return;
        }
        
        console.log("Received data:", data);
        
        clearOutputPanels();   // a new expression invalidates all previous output
        state.currentExpressionId = data.id;
        state.lastParsedFormula = formula;
        state.originalExpression = {
            id: data.id,
            formula: data.formula,
            latex: data.latex,
            tree_text: data.tree_text,
            tree_json: data.tree_json
        };
        state.lastResult = null; // Clear any previous results
        
        console.log("State set:", state.originalExpression);
        
        displayExpression();
        showMainUI();
        cueOperations();
        updateOperationAvailability(formula);
    } catch (error) {
        state.currentExpressionId = null;
        showError('Failed to parse expression: ' + error.message);
    } finally {
        if (parseBtn) parseBtn.classList.remove('is-busy');
    }
}

// Highlight imaginary unit "i" in complex mode
function highlightImaginaryUnit(text) {
    if (!text) return text;
    
    // Save function names to avoid replacing 'i' in them
    const functionPattern = /(sin|cos|tan|arcsin|arccos|arctan|sinh|cosh|tanh|ln|exp)/g;
    const functions = [];
    let protectedText = text.replace(functionPattern, (match, offset) => {
        const placeholder = `__FUNC${functions.length}__`;
        functions.push(match);
        return placeholder;
    });
    
    // Now replace 'i' patterns
    protectedText = protectedText
        // Standalone i (word boundary)
        .replace(/\b(i)\b/g, '<span style="color: #ff4444; font-weight: bold;">$1</span>')
        // -i, 2i, -2i, etc. (number followed by i)
        .replace(/([+-]?\d*)(i)\b/g, '$1<span style="color: #ff4444; font-weight: bold;">$2</span>')
        // i* patterns
        .replace(/(<span[^>]*>i<\/span>)\s*\*/g, '$1 *')
        .replace(/\*\s*(<span[^>]*>i<\/span>)/g, '* $1');
    
    // Restore function names
    functions.forEach((func, index) => {
        protectedText = protectedText.replace(`__FUNC${index}__`, func);
    });
    
    return protectedText;
}

// Display Expression
function displayExpression() {
    // Always show original formula
    const formulaDisplay = document.getElementById('formulaDisplay');
    const complexMode = document.getElementById('complexMode').checked;
    
    if (complexMode) {
        // Highlight imaginary unit "i" in red for complex mode
        formulaDisplay.innerHTML = highlightImaginaryUnit(state.originalExpression.formula);
    } else {
        formulaDisplay.textContent = state.originalExpression.formula;
    }
    
    // Render LaTeX with MathJax
    const latexDisplay = document.getElementById('latexDisplay');
    latexDisplay.innerHTML = `\\[${state.originalExpression.latex}\\]`;
    typesetMath(latexDisplay);
    
    // Render trees
    const hasResult = state.lastResult !== null;
    const treeColumns = document.querySelectorAll('.tree-column');
    
    if (!hasResult) {
        // No result yet - only show left side
        treeColumns[0].style.display = 'block';
        treeColumns[1].style.display = 'none'; // Hide arrow
        treeColumns[2].style.display = 'none';
        
        // Show original on left
        document.querySelectorAll('.tree-label')[0].textContent = 'Original';
        document.querySelectorAll('.tree-label')[2].textContent = 'Original';
        renderTreeFromJSON('treeOriginal', state.originalExpression.tree_json);
        document.getElementById('treeOriginalText').textContent = state.originalExpression.tree_text || 'No tree data';
        
        // Green border on left (always active)
        treeColumns[0].classList.add('active-formula');
        treeColumns[2].classList.remove('active-formula');
        
        // Hide result panel
        document.getElementById('resultsPanel').style.display = 'none';
        
    } else {
        // Has result - show both sides
        treeColumns[0].style.display = 'block';
        treeColumns[1].style.display = 'flex';
        treeColumns[2].style.display = 'block';
        
        // Always: original → result (original is always active)
        document.querySelectorAll('.tree-label')[0].textContent = 'Original (Active)';
        document.querySelectorAll('.tree-label')[1].textContent = 'Result';
        document.querySelectorAll('.tree-label')[2].textContent = 'Original (Active)';
        document.querySelectorAll('.tree-label')[3].textContent = 'Result';
        
        renderTreeFromJSON('treeOriginal', state.originalExpression.tree_json);
        renderTreeFromJSON('treeProcessed', state.lastResult.tree_json);
        document.getElementById('treeOriginalText').textContent = state.originalExpression.tree_text || 'No tree data';
        document.getElementById('treeProcessedText').textContent = state.lastResult.tree_text || 'No tree data';

        // Clean up residue plot from tree panel if it exists (from a previous residue operation)
        const residPlot = document.getElementById('treeResidPlot');
        if (residPlot) { residPlot.style.display = 'none'; }
        const treeSvg = document.getElementById('treeProcessed');
        if (treeSvg) { treeSvg.style.display = ''; }
        
        // Green border on left (always active)
        treeColumns[0].classList.add('active-formula');
        treeColumns[2].classList.remove('active-formula');
        
        // Show result panel with the processed formula
        showResultsWithLatex(state.lastResult.formula, state.lastResult.latex);
    }
}

// Toggle between visual and text tree view
function toggleTreeView() {
    const visualView = document.getElementById('treeVisualView');
    const textView = document.getElementById('treeTextView');
    const toggleBtn = document.getElementById('toggleTreeView');
    
    if (visualView.style.display === 'none') {
        visualView.style.display = 'grid';
        textView.style.display = 'none';
        toggleBtn.textContent = 'Switch to Text View';
    } else {
        visualView.style.display = 'none';
        textView.style.display = 'grid';
        toggleBtn.textContent = 'Switch to Visual View';
    }
}

// Render Tree from JSON structure
function renderTreeFromJSON(svgId, treeJson) {
    const svg = document.getElementById(svgId);
    svg.innerHTML = '';
    
    if (!treeJson) return;
    
    // Convert JSON to our tree format
    const root = jsonToTree(treeJson);
    if (!root) return;
    
    // Count nodes to determine size
    const nodeCount = countNodes(root);
    const maxDepth = getMaxDepth(root);
    
    // Calculate dynamic size
    const width = Math.max(400, nodeCount * 60);
    const height = Math.max(400, maxDepth * 100);
    
    // Set SVG size
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
    // Layout tree
    const layout = layoutTree(root, width, height);
    
    // Draw edges first
    drawEdges(svg, layout);
    
    // Draw nodes
    drawNodes(svg, layout);
}

// Convert JSON tree to our internal format
function jsonToTree(json) {
    if (!json) return null;
    
    const node = {
        label: json.data,
        type: json.isLeaf ? (isNaN(json.data) ? 'var' : 'const') : 'op',
        left: jsonToTree(json.left),
        right: jsonToTree(json.right)
    };
    
    return node;
}

// Count total nodes in tree
function countNodes(node) {
    if (!node) return 0;
    return 1 + countNodes(node.left) + countNodes(node.right);
}

// Get maximum depth of tree
function getMaxDepth(node) {
    if (!node) return 0;
    return 1 + Math.max(getMaxDepth(node.left), getMaxDepth(node.right));
}

// Build tree structure from string representation
// SIMPLIFIED: Use explicit left/right tracking
function buildTreeStructure(treeString) {
    if (!treeString || typeof treeString !== 'string') return null;
    
    const lines = treeString.split('\n').filter(l => l.trim());
    if (lines.length === 0) return null;
    
    let root = null;
    const stack = []; // Stack: [{ node, depth, side }]
    
    lines.forEach((line) => {
        // Extract node content
        const match = line.match(/[⟨<【]([^⟩>】]+)[⟩>】]/);
        if (!match) return;
        
        const label = match[1];
        const type = line.includes('⟨') ? 'op' : line.includes('<') ? 'var' : 'const';
        
        if (line.includes('ROOT:')) {
            // Create root node with left/right children
            root = { label, type, left: null, right: null };
            stack.push({ node: root, depth: 0 });
        } else {
            // Determine if this is left [L] or right [R] child
            const isLeft = line.includes('[L]');
            const isRight = line.includes('[R]');
            
            if (!isLeft && !isRight) return;
            
            // Calculate depth by indent
            const indent = (line.match(/^\s*/) || [''])[0].length;
            const depth = Math.floor(indent / 7) + 1;
            
            // Pop stack to correct depth
            while (stack.length > depth) {
                stack.pop();
            }
            
            if (stack.length > 0) {
                const parent = stack[stack.length - 1].node;
                const child = { label, type, left: null, right: null };
                
                if (isLeft) {
                    parent.left = child;
                } else if (isRight) {
                    parent.right = child;
                }
                
                stack.push({ node: child, depth });
            }
        }
    });
    
    return root;
}

// Layout tree using improved algorithm
function layoutTree(node, width, height) {
    const levels = [];
    
    // Traverse tree and assign levels and depth
    function traverse(n, level) {
        if (!n) return;
        if (!levels[level]) levels[level] = [];
        n.depth = level; // Assign depth to node
        levels[level].push(n);
        traverse(n.left, level + 1);
        traverse(n.right, level + 1);
    }
    
    traverse(node, 0);
    
    const nodes = [];
    const edges = [];
    const levelHeight = height / (levels.length + 1);
    
    // Assign positions to each node
    levels.forEach((level, levelIndex) => {
        const levelWidth = width / (level.length + 1);
        level.forEach((n, nodeIndex) => {
            n.x = levelWidth * (nodeIndex + 1);
            n.y = levelHeight * (levelIndex + 1);
            nodes.push(n);
            
            // Add edges to children
            if (n.left) {
                edges.push({ from: n, to: n.left });
            }
            if (n.right) {
                edges.push({ from: n, to: n.right });
            }
        });
    });
    
    return { nodes, edges };
}

// Draw edges// Draw edges
function drawEdges(svg, layout) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'edges');
    
    // Calculate max depth for edge styling
    const maxDepth = Math.max(...layout.nodes.map(n => n.depth || 0));
    
    layout.edges.forEach(edge => {
        // Get color based on target node type
        const targetType = edge.to.type || 'op'; // Fallback to op if type is missing
        const targetColor = getNodeColorRGB(targetType);
        const targetColorDark = getNodeColorRGBDark(targetType);
        
        // Create gradient for tapered effect (outer edge)
        const gradientId = `edge-gradient-${Math.random().toString(36).substr(2, 9)}`;
        const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        gradient.setAttribute('id', gradientId);
        gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
        gradient.setAttribute('x1', edge.from.x);
        gradient.setAttribute('y1', edge.from.y);
        gradient.setAttribute('x2', edge.to.x);
        gradient.setAttribute('y2', edge.to.y);
        
        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', targetColor);
        stop1.setAttribute('stop-opacity', '0.6');
        
        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', targetColor);
        stop2.setAttribute('stop-opacity', '0.9');
        
        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        svg.appendChild(gradient);
        
        // Create gradient for core (darker)
        const coreGradientId = `core-gradient-${Math.random().toString(36).substr(2, 9)}`;
        const coreGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        coreGradient.setAttribute('id', coreGradientId);
        coreGradient.setAttribute('gradientUnits', 'userSpaceOnUse');
        coreGradient.setAttribute('x1', edge.from.x);
        coreGradient.setAttribute('y1', edge.from.y);
        coreGradient.setAttribute('x2', edge.to.x);
        coreGradient.setAttribute('y2', edge.to.y);
        
        const coreStop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        coreStop1.setAttribute('offset', '0%');
        coreStop1.setAttribute('stop-color', targetColorDark);
        coreStop1.setAttribute('stop-opacity', '0.8');
        
        const coreStop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        coreStop2.setAttribute('offset', '100%');
        coreStop2.setAttribute('stop-color', targetColorDark);
        coreStop2.setAttribute('stop-opacity', '1');
        
        coreGradient.appendChild(coreStop1);
        coreGradient.appendChild(coreStop2);
        svg.appendChild(coreGradient);
        
        // Create curved path
        const dx = edge.to.x - edge.from.x;
        const dy = edge.to.y - edge.from.y;
        const dr = Math.sqrt(dx * dx + dy * dy) * 0.3;
        
        const pathData = `M ${edge.from.x} ${edge.from.y} Q ${edge.from.x + dx/2} ${edge.from.y + dy/2 - dr} ${edge.to.x} ${edge.to.y}`;
        
        // Determine stroke width based on depth
        const fromDepth = edge.from.depth || 0;
        let strokeWidth = 4;
        if (fromDepth === 0) {
            strokeWidth = 5;
        } else if (fromDepth < maxDepth / 2) {
            strokeWidth = 4;
        } else {
            strokeWidth = 3;
        }
        
        // Outer path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('class', 'tree-edge');
        path.setAttribute('stroke', `url(#${gradientId})`);
        path.setAttribute('stroke-width', strokeWidth);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.style.filter = 'drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.4))';
        
        // Core path (darker, thinner)
        const corePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        corePath.setAttribute('d', pathData);
        corePath.setAttribute('class', 'tree-edge-core');
        corePath.setAttribute('stroke', `url(#${coreGradientId})`);
        corePath.setAttribute('stroke-width', Math.max(1, strokeWidth * 0.4));
        corePath.setAttribute('fill', 'none');
        corePath.setAttribute('stroke-linecap', 'round');
        
        // Add animation
        path.style.opacity = '0';
        corePath.style.opacity = '0';
        setTimeout(() => {
            path.style.transition = 'opacity 0.5s ease';
            corePath.style.transition = 'opacity 0.5s ease';
            path.style.opacity = '1';
            corePath.style.opacity = '1';
        }, 100);
        
        g.appendChild(path);
        g.appendChild(corePath);
    });
    
    svg.appendChild(g);
}

// Draw nodes
function drawNodes(svg, layout) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'nodes');
    
    layout.nodes.forEach((node, index) => {
        const nodeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeG.setAttribute('class', 'tree-node');
        nodeG.setAttribute('transform', `translate(${node.x}, ${node.y})`);
        
        // Imaginary/quaternion units i, j, k (and forms like -i, 2i, -2j)
        const isImaginaryUnit = /^-?\d*[ijk]$/.test(node.label) ||
                                (['i', 'j', 'k'].includes(node.label) && node.type === 'const');
        
        // Circle
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', node.type === 'op' ? '28' : '24');
        circle.setAttribute('fill', isImaginaryUnit ? 'rgba(239, 68, 68, 0.9)' : getNodeColor(node.type));
        circle.setAttribute('stroke', isImaginaryUnit ? 'rgba(255, 100, 100, 0.8)' : 'rgba(255, 255, 255, 0.3)');
        circle.setAttribute('stroke-width', isImaginaryUnit ? '3' : '2');
        circle.style.filter = isImaginaryUnit ? 
            'drop-shadow(0px 4px 12px rgba(239, 68, 68, 0.6))' : 
            'drop-shadow(0px 4px 8px rgba(0, 0, 0, 0.5))';
        
        // Text
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dy', '0.35em');
        text.setAttribute('fill', 'white');
        text.setAttribute('font-size', isImaginaryUnit ? '18' : '15');
        text.setAttribute('font-weight', '700');
        text.setAttribute('font-family', '"JetBrains Mono", monospace');
        text.style.filter = 'drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.6))';
        text.textContent = node.label;
        
        nodeG.appendChild(circle);
        nodeG.appendChild(text);
        
        // Add subtle breathing glow on hover
        nodeG.addEventListener('mouseenter', () => {
            nodeG.classList.add('glow');
        });
        
        nodeG.addEventListener('mouseleave', () => {
            nodeG.classList.remove('glow');
        });
        
        // Stagger animation
        nodeG.style.opacity = '0';
        setTimeout(() => {
            nodeG.style.transition = 'opacity 0.5s ease';
            nodeG.style.opacity = '1';
        }, index * 50);
        
        g.appendChild(nodeG);
    });
    
    svg.appendChild(g);
}

// Get node color based on type (RGBA)
function getNodeColor(type) {
    switch (type) {
        case 'op': return 'rgba(102, 126, 234, 0.9)';
        case 'var': return 'rgba(74, 222, 128, 0.8)';
        case 'const': return 'rgba(251, 191, 36, 0.8)';
        default: return 'rgba(148, 163, 184, 0.8)';
    }
}

// Get node color based on type (RGB for gradients)
function getNodeColorRGB(type) {
    switch (type) {
        case 'op': return 'rgb(102, 126, 234)';
        case 'var': return 'rgb(74, 222, 128)';
        case 'const': return 'rgb(251, 191, 36)';
        default: return 'rgb(148, 163, 184)';
    }
}

// Get darker node color for edge cores
function getNodeColorRGBDark(type) {
    switch (type) {
        case 'op': return 'rgb(60, 80, 180)';
        case 'var': return 'rgb(40, 150, 70)';
        case 'const': return 'rgb(200, 140, 20)';
        default: return 'rgb(100, 110, 130)';
    }
}

// Reset View to Original
function resetView() {
    state.lastResult = null;
    state.currentExpressionId = state.originalExpression.id;
    clearOutputPanels();
    displayExpression();
}

// Hide + empty every output region so a fresh solve never sits above stale
// steps/results/trace from the previous one.
function clearOutputPanels() {
    [['stepsPanel', 'stepsContent'], ['resultsPanel', 'resultsContent'], ['tracePanel', null]].forEach(([panelId, contentId]) => {
        const p = document.getElementById(panelId);
        if (p) p.style.display = 'none';
        if (contentId) {
            const c = document.getElementById(contentId);
            if (c) c.innerHTML = '';
        }
    });
    if (typeof liveReset === 'function') liveReset();
    ['traceTreeContent', 'traceSpaceContent', 'traceMermaidContent', 'traceTechniquesContent'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    });
    setSolveFailedState(false);
}

// Show Main UI
function showMainUI() {
    document.getElementById('displayGrid').style.display = 'grid';
    document.getElementById('resetBar').style.display = 'flex';
    document.getElementById('operationsPanel').style.display = 'block';
}

// Dim operations that don't apply to the current expression.
const KNOWN_FNS = new Set(['sin','cos','tan','cot','sec','csc','sinh','cosh','tanh','sech','csch','coth','asinh','arcsinh','acosh','arccosh','atanh','arctanh','arcsin','arccos','arctan','ln','exp','abs','sqrt','erf','Si','Ci','Ei','li','FresnelS','FresnelC']);
const KNOWN_CONSTS = new Set(['e','pi','i','j','k']);
function updateOperationAvailability(formula) {
    const ids = (formula.match(/[a-zA-Z_]\w*/g) || []);
    const vars = new Set(ids.filter(t => !KNOWN_FNS.has(t) && !KNOWN_CONSTS.has(t)));
    const transcendental = ids.some(t => KNOWN_FNS.has(t));
    const setOp = (op, enabled, why) => {
        const b = document.querySelector(`.op-btn[data-op="${op}"]`);
        if (!b) return;
        b.classList.toggle('op-disabled', !enabled);
        b.title = enabled ? '' : why;
    };
    // gradient/differential stay enabled even for single-variable input (trivial
    // but valid); only the residue path has a hard requirement (rational function).
    setOp('gradient', true, '');
    setOp('differential', true, '');
    setOp('residue', !transcendental, 'The residue path needs a rational function P(x)/Q(x) — try 1/(x^2+1)');
}

// Cue the operations (π) button after a formula is parsed; clear once it's used.
function cueOperations() {
    document.getElementById('opsToggle')?.classList.add('attention');
}
function clearOperationsCue() {
    document.getElementById('opsToggle')?.classList.remove('attention');
}

// Operations Panel
function toggleOpsMenu() {
    state.opsMenuOpen = !state.opsMenuOpen;
    if (state.opsMenuOpen) clearOperationsCue();
    const menu = document.getElementById('opsMenu');
    menu.classList.toggle('active', state.opsMenuOpen);
    
    const toggle = document.getElementById('opsToggle');
    toggle.style.transform = state.opsMenuOpen ? 'rotate(45deg)' : 'rotate(0deg)';
}

// Handle Operation
async function handleOperation(operation) {
    const opBtn = document.querySelector(`.op-btn[data-op="${operation}"]`);
    try {
        // The experimental vector-calculus / measure / transport tools live behind
        // one launcher card; each opens a self-contained modal that parses its own
        // curve / surface / field expressions (Lebesgue is the only one that uses
        // the current formula).
        if (operation === 'experimental') {
            showExperimentalLauncher();
            return;
        }
        // Equation discovery works from trajectory data, not from the current
        // formula, so it is self-contained like the launcher tools.
        if (operation === 'sindy') {
            showModal('Equation Discovery (SINDy)', createSindyForm());
            return;
        }
        // Certified bounds is self-contained too (its own f + box inputs).
        if (operation === 'interval') {
            showModal('Conditional Interval Bounds', createIntervalForm());
            return;
        }
        if (operation === 'gr') {
            showModal('General Relativity', createGRForm());
            return;
        }
        if (operation === 'exact') {
            showModal('Exact Arithmetic (ℚ)', createExactForm());
            return;
        }
        // Make sure the current input is parsed before running an operation, so the
        // operations button works even before the user pressed Enter.
        const input = document.getElementById('formula');
        const expr = input ? input.value.trim() : '';
        if (expr === '') {
            if (input) input.focus();
            showError('Enter an expression first — e.g. x^3*sin(x).');
            return;
        }
        if (!state.currentExpressionId || state.lastParsedFormula !== expr) {
            await parseExpression();
            if (!state.currentExpressionId) return; // parse failed; error already shown
        }
        clearOperationsCue();
        if (opBtn) opBtn.classList.add('is-busy');
        switch (operation) {
            case 'derivative':
                await performDerivative();
                break;
            case 'integrate':
                await performIntegration();
                break;
            case 'simplify':
                await performSimplify();
                break;
            case 'evaluate':
                showModal('Evaluate', createEvaluateForm());
                break;
            case 'gradient':
                showModal('Grad · Div · Curl · Laplacian', createGradientForm());
                // _vcDim builds the axis boxes for the seeded dimension, then syncs
                window._vcDim();
                break;
            case 'differential':
                showModal('Differential Form', createDifferentialForm());
                break;
            case 'taylor':
                showModal('Taylor Series', createSeriesForm('taylor'));
                break;
            case 'laurent':
                showModal('Laurent Series [EXPERIMENTAL]', createSeriesForm('laurent'));
                break;
            case 'pade':
                showModal('Padé Approximant', createPadeForm());
                break;
            case 'definite':
                showModal('Definite Integral', createDefiniteIntegralForm());
                break;
            case 'lebesgue':
                showModal('Lebesgue Integral [EXPERIMENTAL]', createLebesgueForm());
                break;
            case 'residue':
                showModal('Residue Theorem', createResidueForm());
                break;
        }
    } catch (error) {
        showError(error.message);
    } finally {
        if (opBtn) opBtn.classList.remove('is-busy');
    }
}

function createSeriesForm(mode) {
    const hint = mode === 'taylor'
        ? 'If the function has a pole at the center, the Taylor expansion is impossible — the Laurent button handles that case.'
        : 'EXPERIMENTAL: the principal part relies on symbolically cancelling the pole; when that fails, coefficients come from limit sampling and the series may truncate early as "numerically unstable". Without a pole the Laurent series equals the Taylor series.';
    return `
        <div style="display:flex;flex-direction:column;gap:0.75rem;">
            <label style="font-size:0.85rem;color:#94a3b8;">Center a (expand around x = a)
                <input type="text" id="seriesCenter" value="0" style="width:100%;padding:0.5rem;background:rgba(255,255,255,0.08);border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#fff;font-family:'JetBrains Mono',monospace;" />
            </label>
            <label style="font-size:0.85rem;color:#94a3b8;">Order n (1–8)
                <input type="number" id="seriesOrder" value="6" min="1" max="8" style="width:100%;padding:0.5rem;background:rgba(255,255,255,0.08);border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#fff;font-family:'JetBrains Mono',monospace;" />
            </label>
            <div style="font-size:0.78rem;color:#64748b;">${hint} Coefficients are shown as exact rationals when one matches; the Lagrange remainder bounds the inaccuracy.</div>
        </div>`;
}

async function performSeries(mode) {
    const variable = document.getElementById('variableInput').value.trim() || 'x';
    const center = document.getElementById('seriesCenter')?.value.trim() || '0';
    const order = parseInt(document.getElementById('seriesOrder')?.value || '6', 10);

    const response = await fetch(`/api/series/${state.currentExpressionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variable, center: parseFloat(center) || 0, order, mode })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');

    if (data.type === 'impossible') {
        setSolveFailedState(true);
        content.innerHTML = `
            <div class="result-item" style="border-left-color:#ef4444;">
                <div class="result-label" style="color:#fca5a5;">Taylor expansion impossible</div>
                <div style="font-size:0.9rem;color:#fecaca;line-height:1.55;">${escapeHtml(data.message)}</div>
            </div>`;
        panel.style.display = 'block';
        setTimeout(() => content.scrollIntoView({ behavior: 'smooth' }), 100);
        return;
    }

    setSolveFailedState(false);
    const typeBadge = data.type === 'laurent'
        ? `<span style="background:rgba(244,114,182,0.18);color:#f9a8d4;padding:2px 10px;border-radius:10px;font-size:0.75rem;">Laurent — pole of order ${data.pole_order}</span>`
        : `<span style="background:rgba(45,212,191,0.18);color:#5eead4;padding:2px 10px;border-radius:10px;font-size:0.75rem;">Taylor</span>`;
    content.innerHTML = `
        <div class="result-item">
            <div class="result-label">Series of <span class="step-math">${mathHtml(data.original || '')}</span> around ${escapeHtml(String(data.center))} ${typeBadge}</div>
            <div class="result-value step-math" style="font-size:1.05rem;">${mathHtml(data.pretty)}</div>
            ${data.note ? `<div style="font-size:0.8rem;color:#94a3b8;margin-top:0.4rem;">${escapeHtml(data.note)}</div>` : ''}
        </div>
        <div class="result-item" style="border-left-color:#fbbf24;">
            <div class="result-label">Inaccuracy (Lagrange remainder)</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:0.85rem;color:#fcd34d;">${escapeHtml(data.remainder.formula)}</div>
            <div style="font-size:0.82rem;color:#94a3b8;margin-top:0.3rem;">${escapeHtml(data.remainder.note)}</div>
        </div>
        <div class="result-item" style="border-left-color:#22d3ee;">
            <div class="result-label">f(x) vs the truncated series
                <span style="margin-left:0.8rem;font-size:0.72rem;"><span style="color:#22d3ee;">━ f(x)</span>&nbsp;&nbsp;<span style="color:#f9a8d4;">╌ series</span></span>
            </div>
            <canvas id="seriesPlot" width="720" height="240" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;"></canvas>
        </div>`;
    panel.style.display = 'block';
    if (data.samples) drawSeriesPlot(document.getElementById('seriesPlot'), data.samples, data.center);
    setTimeout(() => content.scrollIntoView({ behavior: 'smooth' }), 100);
}

// Plot f(x) (solid cyan) vs the truncated series (dashed pink) around the center.
function drawSeriesPlot(canvas, samples, center) {
    if (!canvas || !samples || !samples.xs) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, Hc = canvas.height, pad = 28;
    const xs = samples.xs;
    const finite = v => v !== null && v !== undefined && isFinite(v);
    // robust y-range from f's values (fall back to series), clipped to percentiles
    const fv = samples.f.filter(finite), sv = samples.series.filter(finite);
    const pool = (fv.length ? fv : sv).slice().sort((a, b) => a - b);
    if (!pool.length) return;
    const lo = pool[Math.floor(pool.length * 0.05)], hi = pool[Math.ceil(pool.length * 0.95) - 1];
    const span = Math.max(hi - lo, 1e-6), y0 = lo - span * 0.15, y1 = hi + span * 0.15;
    const X = x => pad + (x - xs[0]) / (xs[xs.length - 1] - xs[0]) * (W - 2 * pad);
    const Y = y => Hc - pad - (y - y0) / (y1 - y0) * (Hc - 2 * pad);

    ctx.clearRect(0, 0, W, Hc);
    // axes
    ctx.strokeStyle = 'rgba(148,163,184,0.35)'; ctx.lineWidth = 1;
    if (y0 < 0 && y1 > 0) { ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(W - pad, Y(0)); ctx.stroke(); }
    // center marker
    ctx.strokeStyle = 'rgba(251,191,36,0.5)'; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(X(center), pad / 2); ctx.lineTo(X(center), Hc - pad / 2); ctx.stroke();
    ctx.setLineDash([]);

    const curve = (vals, color, dash) => {
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash);
        ctx.beginPath();
        let pen = false;
        xs.forEach((x, i) => {
            const v = vals[i];
            if (!finite(v) || v < y0 - span || v > y1 + span) { pen = false; return; }
            const px = X(x), py = Y(v);
            if (pen) ctx.lineTo(px, py); else ctx.moveTo(px, py);
            pen = true;
        });
        ctx.stroke(); ctx.setLineDash([]);
    };
    curve(samples.f, '#22d3ee', []);
    curve(samples.series, '#f9a8d4', [6, 4]);
}

// ---- Definite-integral region plot (curve + shaded area + optional MC darts) ----
function drawDefinitePlot(canvas, plot, darts) {
    if (!canvas || !plot || !plot.xs) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, Hc = canvas.height, pad = 26;
    const xs = plot.xs, fs = plot.fs;
    const finite = v => v !== null && v !== undefined && isFinite(v);
    const fv = fs.filter(finite);
    if (!fv.length) return;
    let lo = Math.min(...fv, 0), hi = Math.max(...fv, 0);
    if (darts) { darts.forEach(d => { lo = Math.min(lo, d.y); hi = Math.max(hi, d.y); }); }
    const span = Math.max(hi - lo, 1e-9);
    const y0 = lo - span * 0.08, y1 = hi + span * 0.08;
    const X = x => pad + (x - xs[0]) / (xs[xs.length - 1] - xs[0]) * (W - 2 * pad);
    const Y = y => Hc - pad - (y - y0) / (y1 - y0) * (Hc - 2 * pad);
    ctx.clearRect(0, 0, W, Hc);
    // shaded region between 0 and f(x) within the bounds
    ctx.fillStyle = 'rgba(74, 222, 128, 0.18)';
    for (let i = 0; i + 1 < xs.length; i++) {
        if (!finite(fs[i])) continue;
        const x = X(xs[i]), w = X(xs[i + 1]) - x;
        ctx.fillRect(x, Math.min(Y(0), Y(fs[i])), Math.max(w, 1), Math.abs(Y(fs[i]) - Y(0)));
    }
    // zero axis + bound markers
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(W - pad, Y(0)); ctx.stroke();
    ctx.strokeStyle = 'rgba(251,191,36,0.6)'; ctx.setLineDash([3, 4]);
    [plot.lower, plot.upper].forEach(bx => {
        if (bx === null || bx === undefined) return;
        ctx.beginPath(); ctx.moveTo(X(bx), pad / 2); ctx.lineTo(X(bx), Hc - pad / 2); ctx.stroke();
    });
    ctx.setLineDash([]);
    // MC darts
    if (darts) darts.forEach(d => {
        ctx.fillStyle = d.hit ? 'rgba(74,222,128,0.85)' : 'rgba(248,113,113,0.55)';
        ctx.beginPath(); ctx.arc(X(d.x), Y(d.y), 2, 0, 7); ctx.fill();
    });
    // curve
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath();
    let pen = false;
    xs.forEach((x, i) => {
        if (!finite(fs[i])) { pen = false; return; }
        if (pen) ctx.lineTo(X(x), Y(fs[i])); else ctx.moveTo(X(x), Y(fs[i]));
        pen = true;
    });
    ctx.stroke();
}

// ---- Lebesgue (layer-cake) — EXPERIMENTAL ----
function createLebesgueForm() {
    return `
        <div style="display:flex;gap:12px;margin:4px 0 10px;">
            <label style="flex:1;font-size:0.85rem;color:#94a3b8;">Lower bound
                <input type="text" id="lebLower" value="0" style="width:100%;padding:0.5rem;background:rgba(255,255,255,0.08);border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#fff;font-family:'JetBrains Mono',monospace;" />
            </label>
            <label style="flex:1;font-size:0.85rem;color:#94a3b8;">Upper bound
                <input type="text" id="lebUpper" value="3" style="width:100%;padding:0.5rem;background:rgba(255,255,255,0.08);border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#fff;font-family:'JetBrains Mono',monospace;" />
            </label>
        </div>
        <div style="font-size:0.78rem;color:#64748b;line-height:1.5;">EXPERIMENTAL. Lebesgue partitions the <em>range</em> (horizontal slabs: ∫f dμ = ∫ μ({f &gt; t}) dt — the "layer cake"), where Riemann partitions the domain (vertical strips). Not Monte Carlo — no randomness. For Riemann-integrable f the values coincide; both are reported as a cross-check.</div>`;
}

async function performLebesgue() {
    const variable = document.getElementById('variableInput').value.trim() || 'x';
    const lower = parseFloat(document.getElementById('lebLower')?.value || '0');
    const upper = parseFloat(document.getElementById('lebUpper')?.value || '1');
    const response = await fetch(`/api/lebesgue/${state.currentExpressionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variable, lower, upper })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    setSolveFailedState(false);
    const agree = data.agreement !== null && data.agreement < 0.05;
    content.innerHTML = `
        <div class="result-item">
            <div class="result-label">Lebesgue (layer-cake) integral of <span class="step-math">${mathHtml(data.original || '')}</span>
                <span style="background:rgba(232,121,249,0.18);color:#f0abfc;padding:2px 10px;border-radius:10px;font-size:0.75rem;">μ-measure [EXPERIMENTAL]</span></div>
            <div style="font-size:1.8rem;font-weight:700;color:#f1f5f9;">${data.value.toFixed(8)}</div>
            <div style="font-size:0.82rem;color:#94a3b8;margin-top:0.3rem;">f⁺ part ${data.pos_value.toFixed(6)} − f⁻ part ${data.neg_value.toFixed(6)} · ${data.levels} range levels</div>
            <div style="font-size:0.82rem;margin-top:0.3rem;color:${agree ? '#4ade80' : '#fbbf24'};">Riemann (Simpson) cross-check: ${data.riemann_value.toFixed(8)} — ${agree ? 'coincide ✓ (as they must for Riemann-integrable f)' : `differ by ${data.agreement?.toFixed(6)}`}</div>
        </div>
        <div class="result-item" style="border-left-color:#e879f9;">
            <div class="result-label">Horizontal slabs μ({f &gt; t})·dt — the layer cake</div>
            <canvas id="lebPlot" width="720" height="240" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;"></canvas>
        </div>`;
    panel.style.display = 'block';
    drawLebesguePlot(document.getElementById('lebPlot'), data);
    if (data.steps) showSteps(data.steps);
    setTimeout(() => content.scrollIntoView({ behavior: 'smooth' }), 100);
}

function drawLebesguePlot(canvas, data) {
    if (!canvas || !data.plot) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, Hc = canvas.height, pad = 26;
    const xs = data.plot.xs, fs = data.plot.fs;
    const finite = v => v !== null && v !== undefined && isFinite(v);
    const fv = fs.filter(finite);
    if (!fv.length) return;
    const lo = Math.min(...fv, 0), hi = Math.max(...fv, 0);
    const span = Math.max(hi - lo, 1e-9), y0 = lo - span * 0.08, y1 = hi + span * 0.08;
    const X = x => pad + (x - xs[0]) / (xs[xs.length - 1] - xs[0]) * (W - 2 * pad);
    const Y = y => Hc - pad - (y - y0) / (y1 - y0) * (Hc - 2 * pad);
    ctx.clearRect(0, 0, W, Hc);
    // horizontal slabs: positive part violet, negative part rose — drawn only where f passes the level
    const slabBand = (slabs, sign, color) => {
        ctx.fillStyle = color;
        slabs.forEach(s => {
            for (let i = 0; i + 1 < xs.length; i++) {
                const v = fs[i];
                if (!finite(v)) continue;
                const passes = sign > 0 ? v > s.t1 : -v > s.t1;
                if (!passes) continue;
                const ya = Y(sign * s.t0), yb = Y(sign * s.t1);
                ctx.fillRect(X(xs[i]), Math.min(ya, yb), Math.max(X(xs[i + 1]) - X(xs[i]), 1), Math.abs(yb - ya) + 0.5);
            }
        });
    };
    slabBand((data.pos_slabs || []).filter((_, k) => k % 2 === 0), 1, 'rgba(232,121,249,0.28)');
    slabBand((data.neg_slabs || []).filter((_, k) => k % 2 === 0), -1, 'rgba(251,113,133,0.28)');
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(W - pad, Y(0)); ctx.stroke();
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath();
    let pen = false;
    xs.forEach((x, i) => {
        if (!finite(fs[i])) { pen = false; return; }
        if (pen) ctx.lineTo(X(x), Y(fs[i])); else ctx.moveTo(X(x), Y(fs[i]));
        pen = true;
    });
    ctx.stroke();
}

// ---- 2D line integrals + Green's theorem — EXPERIMENTAL ----
const VECTOR_PRESETS = [
    { name: 'PARAMETRIC ⭐: circle of radius s, F=(−y, x) — both methods = 2πs² for EVERY s', xt: 's*cos(t)', yt: 's*sin(t)', t0: '0', t1: '2*pi', form: 'work', p: '0-y', q: 'x', f: '', param: { name: 's', at: 1, from: 0.4, to: 2 }, expected: '2*pi*s^2' },
    { name: 'PARAMETRIC: field strength F=(0, s·x) on the unit circle — both = πs', xt: 'cos(t)', yt: 'sin(t)', t0: '0', t1: '2*pi', form: 'work', p: '0', q: 's*x', f: '', param: { name: 's', at: 1, from: 0.2, to: 3 }, expected: 'pi*s' },
    { name: 'PARAMETRIC flux: F = s·(x, y) out of the unit circle — both = 2πs', xt: 'cos(t)', yt: 'sin(t)', t0: '0', t1: '2*pi', form: 'flux', p: 's*x', q: 's*y', f: '', param: { name: 's', at: 1, from: 0.2, to: 3 }, expected: '2*pi*s' },
    { name: 'Unit circle, rotational field F = (−y, x)  →  ∮ = 2π (= ∬2 dA)', xt: 'cos(t)', yt: 'sin(t)', t0: '0', t1: '2*pi', form: 'work', p: '0-y', q: 'x', f: '' },
    { name: 'Flux/divergence: radial F = (x, y) out of the unit circle → both sides 2π', xt: 'cos(t)', yt: 'sin(t)', t0: '0', t1: '2*pi', form: 'flux', p: 'x', q: 'y', f: '' },
    { name: 'Flux of a divergence-free field F = (−y, x) → 0', xt: 'cos(t)', yt: 'sin(t)', t0: '0', t1: '2*pi', form: 'flux', p: '0-y', q: 'x', f: '' },
    { name: 'Ellipse area via Green: F = (0, x)  →  ∮ = area = 2π', xt: '2*cos(t)', yt: 'sin(t)', t0: '0', t1: '2*pi', form: 'work', p: '0', q: 'x', f: '' },
    { name: 'Conservative field F = (y, x) on a closed loop  →  ∮ = 0', xt: 'cos(t)', yt: 'sin(t)', t0: '0', t1: '2*pi', form: 'work', p: 'y', q: 'x', f: '' },
    { name: 'Arc-length: ∫ (x²+y²) ds along the segment (0,0)→(1,1) = 2√2/3', xt: 't', yt: 't', t0: '0', t1: '1', form: 'arclength', p: '', q: '', f: 'x^2+y^2' },
    { name: 'Curve length of one spiral turn (f = 1)', xt: 't*cos(t)', yt: 't*sin(t)', t0: '0', t1: '2*pi', form: 'arclength', p: '', q: '', f: '1' },
    { name: 'Circle r=2, shear field F = (0, x²)', xt: '2*cos(t)', yt: '2*sin(t)', t0: '0', t1: '2*pi', form: 'work', p: '0', q: 'x^2', f: '' },
];

function createVectorForm() {
    const opts = VECTOR_PRESETS.map((p, i) => `<option value="${i}">${escapeHtml(p.name)}</option>`).join('');
    const field = (id, label, val) => `
        <label style="flex:1;font-size:0.8rem;color:#94a3b8;">${label}
            <input type="text" id="${id}" value="${escapeHtml(val)}" style="width:100%;padding:0.45rem;background:rgba(255,255,255,0.08);border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#fff;font-family:'JetBrains Mono',monospace;" />
        </label>`;
    return `
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
            <label style="font-size:0.8rem;color:#94a3b8;">Preset (these are long to type — start here)
                <select id="vecPreset" style="width:100%;padding:0.5rem;background:#1e293b;border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#e2e8f0;" onchange="window._applyVecPreset(this.value)">${opts}</select>
            </label>
            <div style="display:flex;gap:10px;">${field('vecXt', 'x(t)', 'cos(t)')}${field('vecYt', 'y(t)', 'sin(t)')}</div>
            <div style="display:flex;gap:10px;">${field('vecT0', 't from', '0')}${field('vecT1', 't to', '2*pi')}</div>
            <label style="font-size:0.8rem;color:#94a3b8;">Form
                <select id="vecForm" style="width:100%;padding:0.5rem;background:#1e293b;border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#e2e8f0;">
                    <option value="work" selected>Vector (directed): ∮ F·dr = ∫ P dx + Q dy</option>
                    <option value="flux">Flux (outward): ∮ F·n ds = ∫ P dy − Q dx</option>
                    <option value="arclength">Scalar (arc length): ∫ f ds</option>
                </select>
            </label>
            <div style="display:flex;gap:10px;">${field('vecP', 'P(x,y)', '0-y')}${field('vecQ', 'Q(x,y)', 'x')}${field('vecF', 'f(x,y) (ds form)', '')}</div>
            <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:0.6rem;margin-top:0.2rem;">
                <div style="font-size:0.78rem;color:#c4b5fd;margin-bottom:0.4rem;">Parameter sweep — leave a constant symbolic (write it in the fields above, e.g. <code>s</code>) and show both methods agree for EVERY value:</div>
                <div style="display:flex;gap:10px;">${field('vecParam', 'parameter (blank = off)', '')}${field('vecParamAt', 'showcase at', '1')}${field('vecParamFrom', 'sweep from', '0.4')}${field('vecParamTo', 'sweep to', '2')}</div>
                <input type="hidden" id="vecExpected" value="" />
            </div>
            <div style="font-size:0.75rem;color:#64748b;">EXPERIMENTAL. Closed curves are also evaluated over the enclosed region (Green / divergence theorem, Monte Carlo) and both methods are compared — analytically against the closed form when a preset provides one.</div>
        </div>`;
}

window._applyVecPreset = function (idx) {
    const p = VECTOR_PRESETS[parseInt(idx, 10)];
    if (!p) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('vecXt', p.xt); set('vecYt', p.yt); set('vecT0', p.t0); set('vecT1', p.t1);
    set('vecP', p.p); set('vecQ', p.q); set('vecF', p.f);
    set('vecParam', p.param ? p.param.name : '');
    set('vecParamAt', p.param ? p.param.at : '1');
    set('vecParamFrom', p.param ? p.param.from : '0.4');
    set('vecParamTo', p.param ? p.param.to : '2');
    set('vecExpected', p.expected || '');
    const fm = document.getElementById('vecForm'); if (fm) fm.value = p.form;
};

async function performVectorIntegral() {
    const get = id => document.getElementById(id)?.value.trim() || '';
    const body = { xt: get('vecXt'), yt: get('vecYt'), t0: get('vecT0'), t1: get('vecT1'), form: get('vecForm') || 'work', p: get('vecP'), q: get('vecQ'), f: get('vecF') };
    const pname = get('vecParam');
    if (pname) {
        body.param = { name: pname, at: parseFloat(get('vecParamAt')) || 1,
                       from: parseFloat(get('vecParamFrom')) || 0.4, to: parseFloat(get('vecParamTo')) || 2,
                       expected: get('vecExpected') };
    }
    const response = await fetch('/api/vector_integral', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    setSolveFailedState(false);
    const headLabel = data.form === 'work' ? (data.closed ? '∮ F·dr (closed curve)' : '∫ F·dr along the curve')
                    : data.form === 'flux' ? (data.closed ? '∮ F·n ds (outward flux)' : '∫ F·n ds along the curve')
                    : '∫ f ds (arc length form)';
    const paramNote = data.param ? ` <span style="color:#c4b5fd;font-size:0.85rem;">with ${escapeHtml(data.param.name)} = ${data.param.at}</span>` : '';

    // "theorems in place": method-vs-method with the actual formulas
    let methodsHtml = '';
    if (data.green) {
        const g = data.green;
        const thmName = data.form === 'flux' ? 'divergence theorem' : "Green's theorem";
        const thmFormula = data.form === 'flux' ? '∬ (∂P/∂x + ∂Q/∂y) dA' : '∬ (∂Q/∂x − ∂P/∂y) dA';
        methodsHtml = `
        <div class="result-item" style="border-left-color:${g.match ? '#4ade80' : '#fbbf24'};">
            <div class="result-label">Two ways to solve it
                <span style="margin-left:0.6rem;padding:2px 10px;border-radius:10px;font-size:0.75rem;background:${g.match ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'};color:${g.match ? '#4ade80' : '#fbbf24'};">${g.match ? `✓ equivalent (${thmName} verified)` : 'disagree — check inputs'}</span></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-top:0.4rem;">
                <div style="background:rgba(103,232,249,0.06);border:1px solid rgba(103,232,249,0.25);border-radius:8px;padding:0.6rem 0.8rem;">
                    <div style="font-size:0.74rem;color:#67e8f9;text-transform:uppercase;letter-spacing:0.06em;">Method 1 — direct, WITHOUT ${thmName}</div>
                    <div class="step-math" style="font-size:0.82rem;margin:0.3rem 0;">${mathHtml(data.direct_formula || '')}</div>
                    <div style="font-size:1.25rem;font-weight:700;color:#f1f5f9;">${data.value.toFixed(6)}</div>
                </div>
                <div style="background:rgba(244,114,182,0.06);border:1px solid rgba(244,114,182,0.25);border-radius:8px;padding:0.6rem 0.8rem;">
                    <div style="font-size:0.74rem;color:#f9a8d4;text-transform:uppercase;letter-spacing:0.06em;">Method 2 — WITH ${thmName}</div>
                    <div class="step-math" style="font-size:0.82rem;margin:0.3rem 0;">${thmFormula}, &nbsp;${mathHtml(g.curl)}</div>
                    <div style="font-size:1.25rem;font-weight:700;color:#f1f5f9;">${g.value.toFixed(6)} <span style="font-size:0.8rem;color:#94a3b8;">± ${g.stderr.toFixed(6)} (MC)</span></div>
                </div>
            </div>
        </div>`;
    }

    // parameter sweep: both methods as FUNCTIONS of the parameter (+ analytic overlay)
    let sweepHtml = '';
    if (data.sweep && data.sweep.length) {
        const expFormula = data.expected ? `&nbsp; — analytic closed form <span class="step-math">${mathHtml(data.expected.formula)}</span> overlaid (dotted)` : '';
        sweepHtml = `
        <div class="result-item" style="border-left-color:#c4b5fd;">
            <div class="result-label">Both methods as functions of ${escapeHtml(data.param.name)} — the theorem holds for every value${expFormula}</div>
            <div style="font-size:0.72rem;color:#94a3b8;margin-bottom:4px;"><span style="color:#22d3ee;">━ direct</span>&nbsp;&nbsp;<span style="color:#f9a8d4;">╌ via theorem (MC)</span>${data.expected ? '&nbsp;&nbsp;<span style="color:#fcd34d;">┄ analytic</span>' : ''}</div>
            <canvas id="vecSweep" width="720" height="220" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;"></canvas>
        </div>`;
    }

    content.innerHTML = `
        <div class="result-item">
            <div class="result-label">${headLabel}${paramNote}
                <span style="background:rgba(103,232,249,0.18);color:#67e8f9;padding:2px 10px;border-radius:10px;font-size:0.75rem;">Line integral [EXPERIMENTAL]</span></div>
            <div style="font-size:1.8rem;font-weight:700;color:#f1f5f9;">${data.value.toFixed(8)}</div>
        </div>
        ${methodsHtml}
        ${sweepHtml}
        <div class="result-item" style="border-left-color:#67e8f9;">
            <div class="result-label">Curve${data.form === 'work' ? ' + field' : ''}${data.green ? ' + region samples (green = inside)' : ''}</div>
            <canvas id="vecPlot" width="720" height="380" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;"></canvas>
        </div>`;
    panel.style.display = 'block';
    drawVectorPlot(document.getElementById('vecPlot'), data);
    if (data.sweep && data.sweep.length) {
        drawSweepChart(document.getElementById('vecSweep'),
            data.sweep.map(p => p.s),
            [{ ys: data.sweep.map(p => p.value), color: '#22d3ee', dash: [] },
             { ys: data.sweep.map(p => p.green), color: '#f9a8d4', dash: [6, 4] },
             ...(data.expected ? [{ ys: data.expected.values, color: '#fcd34d', dash: [2, 4] }] : [])]);
    }
    if (data.steps) showSteps(data.steps);
    setTimeout(() => content.scrollIntoView({ behavior: 'smooth' }), 100);
}

// generic multi-curve chart: curves = [{ys, color, dash}] over shared xs
function drawSweepChart(canvas, xs, curves) {
    if (!canvas || !xs || !xs.length) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, Hc = canvas.height, pad = 30;
    const all = curves.flatMap(c => (c.ys || []).filter(v => v !== null && v !== undefined && isFinite(v)));
    if (!all.length) return;
    const lo = Math.min(...all, 0), hi = Math.max(...all, 0);
    const span = Math.max(hi - lo, 1e-9), y0 = lo - span * 0.1, y1 = hi + span * 0.1;
    const X = x => pad + (x - xs[0]) / (xs[xs.length - 1] - xs[0]) * (W - 2 * pad);
    const Y = y => Hc - pad - (y - y0) / (y1 - y0) * (Hc - 2 * pad);
    ctx.clearRect(0, 0, W, Hc);
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(W - pad, Y(0)); ctx.stroke();
    // x ticks
    ctx.fillStyle = '#64748b'; ctx.font = '10px JetBrains Mono, monospace';
    [0, Math.floor(xs.length / 2), xs.length - 1].forEach(i => ctx.fillText(String(xs[i]), X(xs[i]) - 8, Hc - 8));
    curves.forEach(c => {
        if (!c.ys) return;
        ctx.strokeStyle = c.color; ctx.lineWidth = 2; ctx.setLineDash(c.dash || []);
        ctx.beginPath();
        let pen = false;
        xs.forEach((x, i) => {
            const v = c.ys[i];
            if (v === null || v === undefined || !isFinite(v)) { pen = false; return; }
            if (pen) ctx.lineTo(X(x), Y(v)); else ctx.moveTo(X(x), Y(v));
            pen = true;
        });
        ctx.stroke(); ctx.setLineDash([]);
    });
}

function drawVectorPlot(canvas, data) {
    if (!canvas || !data.curve) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, Hc = canvas.height, pad = 30;
    const xsAll = data.curve.map(p => p[0]), ysAll = data.curve.map(p => p[1]);
    (data.field || []).forEach(a => { xsAll.push(a[0]); ysAll.push(a[1]); });
    let x0 = Math.min(...xsAll), x1 = Math.max(...xsAll), y0 = Math.min(...ysAll), y1 = Math.max(...ysAll);
    const sp = Math.max(x1 - x0, y1 - y0, 1e-6) * 0.08;
    x0 -= sp; x1 += sp; y0 -= sp; y1 += sp;
    // equal aspect
    const scale = Math.min((W - 2 * pad) / (x1 - x0), (Hc - 2 * pad) / (y1 - y0));
    const X = x => W / 2 + (x - (x0 + x1) / 2) * scale;
    const Y = y => Hc / 2 - (y - (y0 + y1) / 2) * scale;
    ctx.clearRect(0, 0, W, Hc);
    // region darts
    (data.green?.darts || []).forEach(d => {
        ctx.fillStyle = d[2] ? 'rgba(74,222,128,0.55)' : 'rgba(100,116,139,0.3)';
        ctx.beginPath(); ctx.arc(X(d[0]), Y(d[1]), 2, 0, 7); ctx.fill();
    });
    // field quiver
    (data.field || []).forEach(a => {
        const [x, y, p, q] = a;
        const mag = Math.hypot(p, q);
        if (mag < 1e-9) return;
        const len = 14;
        const ux = p / mag * len, uy = q / mag * len;
        const px = X(x), py = Y(y);
        ctx.strokeStyle = 'rgba(251,191,36,0.55)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + ux, py - uy); ctx.stroke();
        const ang = Math.atan2(-uy, ux);
        ctx.beginPath();
        ctx.moveTo(px + ux, py - uy);
        ctx.lineTo(px + ux - 5 * Math.cos(ang - 0.45), py - uy + 5 * Math.sin(ang - 0.45) * -1 + 5 * Math.sin(ang - 0.45) * 0);
        ctx.stroke();
    });
    // curve with direction arrows
    ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 2.4; ctx.beginPath();
    data.curve.forEach((p, i) => { if (i) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1])); });
    ctx.stroke();
    for (let k = 30; k < data.curve.length; k += 60) {
        const [ax, ay] = data.curve[k - 1], [bx, by] = data.curve[k];
        const ang = Math.atan2(Y(by) - Y(ay), X(bx) - X(ax));
        ctx.fillStyle = '#67e8f9';
        ctx.beginPath();
        ctx.moveTo(X(bx), Y(by));
        ctx.lineTo(X(bx) - 8 * Math.cos(ang - 0.4), Y(by) - 8 * Math.sin(ang - 0.4));
        ctx.lineTo(X(bx) - 8 * Math.cos(ang + 0.4), Y(by) - 8 * Math.sin(ang + 0.4));
        ctx.fill();
    }
}

// ---- 3D surface integrals (Stokes / Gauss) — EXPERIMENTAL ----
const SURFACE_PRESETS = [
    { name: 'Stokes: hemisphere + rotational F=(−y, x, 0) → both sides 2π', mode: 'stokes',
      xs: 'sin(u)*cos(v)', ys: 'sin(u)*sin(v)', zs: 'cos(u)', u0: '0', u1: 'pi/2', v0: '0', v1: '2*pi',
      p: '0-y', q: 'x', r: '0', f: '', edge: 'u1', solid: null },
    { name: 'Stokes: paraboloid cap z=1−u² + F=(z, x, y) → both sides π', mode: 'stokes',
      xs: 'u*cos(v)', ys: 'u*sin(v)', zs: '1-u^2', u0: '0', u1: '1', v0: '0', v1: '2*pi',
      p: 'z', q: 'x', r: 'y', f: '', edge: 'u1', solid: null },
    { name: 'Gauss: unit sphere + F=(x, y, z) → both sides 4π (= 3·V)', mode: 'gauss',
      xs: 'sin(u)*cos(v)', ys: 'sin(u)*sin(v)', zs: 'cos(u)', u0: '0', u1: 'pi', v0: '0', v1: '2*pi',
      p: 'x', q: 'y', r: 'z', f: '', edge: 'u1', solid: { type: 'sphere', r: 1, bbox: [-1, 1, -1, 1, -1, 1] } },
    { name: 'Gauss: unit sphere + F=(x³, y³, z³) → both sides 12π/5', mode: 'gauss',
      xs: 'sin(u)*cos(v)', ys: 'sin(u)*sin(v)', zs: 'cos(u)', u0: '0', u1: 'pi', v0: '0', v1: '2*pi',
      p: 'x^3', q: 'y^3', r: 'z^3', f: '', edge: 'u1', solid: { type: 'sphere', r: 1, bbox: [-1, 1, -1, 1, -1, 1] } },
    { name: 'Area of the unit sphere (f = 1) → 4π', mode: 'scalar',
      xs: 'sin(u)*cos(v)', ys: 'sin(u)*sin(v)', zs: 'cos(u)', u0: '0', u1: 'pi', v0: '0', v1: '2*pi',
      p: '', q: '', r: '', f: '1', edge: 'u1', solid: null },
    { name: 'Area of a torus R=2, r=1 (f = 1) → 8π²', mode: 'scalar',
      xs: '(2+cos(u))*cos(v)', ys: '(2+cos(u))*sin(v)', zs: 'sin(u)', u0: '0', u1: '2*pi', v0: '0', v1: '2*pi',
      p: '', q: '', r: '', f: '1', edge: 'u1', solid: null },
];

function createSurfaceForm() {
    const opts = SURFACE_PRESETS.map((p, i) => `<option value="${i}">${escapeHtml(p.name)}</option>`).join('');
    const field = (id, label, val, w) => `
        <label style="flex:${w || 1};font-size:0.78rem;color:#94a3b8;">${label}
            <input type="text" id="${id}" value="${escapeHtml(val)}" style="width:100%;padding:0.42rem;background:rgba(255,255,255,0.08);border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#fff;font-family:'JetBrains Mono',monospace;" />
        </label>`;
    return `
        <div style="display:flex;flex-direction:column;gap:0.55rem;">
            <label style="font-size:0.78rem;color:#94a3b8;">Preset (start here — surfaces are long to type)
                <select id="surfPreset" style="width:100%;padding:0.5rem;background:#1e293b;border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#e2e8f0;" onchange="window._applySurfPreset(this.value)">${opts}</select>
            </label>
            <div style="display:flex;gap:8px;">${field('surfXs', 'x(u,v)', 'sin(u)*cos(v)')}${field('surfYs', 'y(u,v)', 'sin(u)*sin(v)')}${field('surfZs', 'z(u,v)', 'cos(u)')}</div>
            <div style="display:flex;gap:8px;">${field('surfU0', 'u from', '0')}${field('surfU1', 'u to', 'pi/2')}${field('surfV0', 'v from', '0')}${field('surfV1', 'v to', '2*pi')}</div>
            <label style="font-size:0.78rem;color:#94a3b8;">Mode
                <select id="surfMode" style="width:100%;padding:0.5rem;background:#1e293b;border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#e2e8f0;">
                    <option value="stokes" selected>Stokes: ∮∂S F·dr vs ∬S (∇×F)·dS</option>
                    <option value="gauss">Gauss: ∬S F·dS vs ∭V (∇·F) dV</option>
                    <option value="flux">Flux only: ∬S F·dS</option>
                    <option value="scalar">Scalar: ∬S f dS</option>
                </select>
            </label>
            <div style="display:flex;gap:8px;">${field('surfP', 'P(x,y,z)', '0-y')}${field('surfQ', 'Q(x,y,z)', 'x')}${field('surfR', 'R(x,y,z)', '0')}${field('surfF', 'f (scalar mode)', '')}</div>
            <input type="hidden" id="surfSolid" value="" />
            <input type="hidden" id="surfEdge" value="u1" />
            <div style="font-size:0.74rem;color:#64748b;">EXPERIMENTAL. Tangents r_u, r_v and curl/div are symbolic; the (u,v) integral is numeric. Stokes/Gauss compute BOTH sides of the theorem and compare. Drag the result plot to rotate.</div>
        </div>`;
}

window._applySurfPreset = function (idx) {
    const p = SURFACE_PRESETS[parseInt(idx, 10)];
    if (!p) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('surfXs', p.xs); set('surfYs', p.ys); set('surfZs', p.zs);
    set('surfU0', p.u0); set('surfU1', p.u1); set('surfV0', p.v0); set('surfV1', p.v1);
    set('surfP', p.p); set('surfQ', p.q); set('surfR', p.r); set('surfF', p.f);
    set('surfEdge', p.edge); set('surfSolid', p.solid ? JSON.stringify(p.solid) : '');
    const m = document.getElementById('surfMode'); if (m) m.value = p.mode;
};

async function performSurfaceIntegral() {
    const get = id => document.getElementById(id)?.value.trim() || '';
    const body = {
        xs: get('surfXs'), ys: get('surfYs'), zs: get('surfZs'),
        u0: get('surfU0'), u1: get('surfU1'), v0: get('surfV0'), v1: get('surfV1'),
        mode: get('surfMode') || 'scalar', p: get('surfP'), q: get('surfQ'), r: get('surfR'), f: get('surfF'),
        boundary_edge: get('surfEdge') || 'u1'
    };
    const solidRaw = get('surfSolid');
    if (solidRaw) body.solid = JSON.parse(solidRaw);
    if (body.mode === 'gauss' && !body.solid) body.solid = { type: 'sphere', r: 1, bbox: [-1, 1, -1, 1, -1, 1] };

    const response = await fetch('/api/surface_integral', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    setSolveFailedState(false);
    let theorem = '';
    if (data.stokes) {
        const s = data.stokes;
        theorem = `
        <div class="result-item" style="border-left-color:${s.match ? '#4ade80' : '#fbbf24'};">
            <div class="result-label">Two ways to solve it — Stokes' theorem in place</div>
            <div style="font-size:1.1rem;color:#f1f5f9;"><span style="color:#67e8f9;">Method 1 (direct, boundary only):</span> ∮∂S F·dr = ${s.boundary_work.toFixed(6)} · <span style="color:#f9a8d4;">Method 2 (via Stokes):</span> ∬S(∇×F)·dS = ${s.curl_flux.toFixed(6)}
                <span style="margin-left:0.6rem;padding:2px 10px;border-radius:10px;font-size:0.75rem;background:${s.match ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'};color:${s.match ? '#4ade80' : '#fbbf24'};">${s.match ? '✓ Stokes verified' : 'disagree — check inputs'}</span></div>
            <div style="font-size:0.78rem;color:#94a3b8;margin-top:0.3rem;font-family:'JetBrains Mono',monospace;">∇×F = ${escapeHtml(s.curl)}</div>
        </div>`;
    }
    if (data.gauss) {
        const g = data.gauss;
        theorem = `
        <div class="result-item" style="border-left-color:${g.match ? '#4ade80' : '#fbbf24'};">
            <div class="result-label">Two ways to solve it — Gauss' divergence theorem in place</div>
            <div style="font-size:1.1rem;color:#f1f5f9;"><span style="color:#67e8f9;">Method 1 (direct surface flux):</span> ∬S F·dS = ${g.flux.toFixed(6)} · <span style="color:#f9a8d4;">Method 2 (via Gauss):</span> ∭V(∇·F) dV = ${g.div_volume.toFixed(6)} ± ${g.stderr.toFixed(6)}
                <span style="margin-left:0.6rem;padding:2px 10px;border-radius:10px;font-size:0.75rem;background:${g.match ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'};color:${g.match ? '#4ade80' : '#fbbf24'};">${g.match ? '✓ Gauss verified' : 'disagree — check inputs'}</span></div>
            <div style="font-size:0.78rem;color:#94a3b8;margin-top:0.3rem;font-family:'JetBrains Mono',monospace;">${escapeHtml(g.div)}</div>
        </div>`;
    }
    content.innerHTML = `
        <div class="result-item">
            <div class="result-label">${data.mode === 'scalar' ? '∬ f dS' : '∬ F·dS'}
                <span style="background:rgba(103,232,249,0.18);color:#67e8f9;padding:2px 10px;border-radius:10px;font-size:0.75rem;">Surface integral [EXPERIMENTAL]</span></div>
            <div style="font-size:1.8rem;font-weight:700;color:#f1f5f9;">${data.value.toFixed(8)}</div>
        </div>
        ${theorem}
        <div class="result-item" style="border-left-color:#67e8f9;">
            <div class="result-label">Surface${data.boundary ? ' + boundary (rose)' : ''}${data.arrows && data.arrows.length ? ' + field (amber)' : ''}${data.gauss ? ' + volume samples' : ''} — drag to rotate</div>
            <canvas id="surfPlot" width="720" height="430" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;cursor:grab;touch-action:none;"></canvas>
        </div>`;
    panel.style.display = 'block';
    initSurface3D(document.getElementById('surfPlot'), data);
    if (data.steps) showSteps(data.steps);
    setTimeout(() => content.scrollIntoView({ behavior: 'smooth' }), 100);
}

// software-projected, depth-sorted, Lambert-shaded 3D on Canvas 2D.
// Smoothness: drags are accumulated and rendered once per animation frame
// (requestAnimationFrame), with a gentle idle auto-spin — rendering per
// pointermove event is what causes jank, not the Canvas rasterizer.
const animatedCanvasVisibility = new WeakMap();
const animatedCanvasObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    entries.forEach(entry => animatedCanvasVisibility.set(entry.target, entry.isIntersecting));
}, { rootMargin: '100px 0px', threshold: 0 }) : null;
function trackAnimatedCanvas(canvas) {
    animatedCanvasVisibility.set(canvas, true);
    animatedCanvasObserver?.observe(canvas);
}
function releaseAnimatedCanvas(canvas) {
    animatedCanvasObserver?.unobserve(canvas);
    animatedCanvasVisibility.delete(canvas);
}
function animatedCanvasCanPaint(canvas) {
    return !document.hidden && window.SymbolicHostVisibility?.visible !== false &&
        !document.documentElement.classList.contains('is-scrolling') && animatedCanvasVisibility.get(canvas) !== false;
}
function initSurface3D(canvas, data, meshOfT) {
    if (!canvas || (!data.mesh && !meshOfT)) return;
    const st = { yaw: 0.7, pitch: 0.42, dirty: true, dragging: false, alive: true, t0: performance.now() };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lx = 0, ly = 0, lastIdlePaint = 0;
    trackAnimatedCanvas(canvas);
    canvas.addEventListener('pointerdown', e => { st.dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
        if (!st.dragging) return;
        st.yaw += (e.clientX - lx) * 0.01;
        st.pitch = Math.max(-1.5, Math.min(1.5, st.pitch + (e.clientY - ly) * 0.01));
        lx = e.clientX; ly = e.clientY;
        st.dirty = true;                          // render on the next frame, not per event
    });
    canvas.addEventListener('pointerup', () => { st.dragging = false; });
    drawSurface3D(canvas, data, st.yaw, st.pitch);   // synchronous first paint (don't wait for rAF)
    const frame = (now) => {
        if (!st.alive || !canvas.isConnected) { st.alive = false; releaseAnimatedCanvas(canvas); return; }
        if (!animatedCanvasCanPaint(canvas)) { requestAnimationFrame(frame); return; }
        const spinning = !reduce && !st.dragging;
        if (spinning && now - lastIdlePaint < 1000 / 30) { requestAnimationFrame(frame); return; }
        lastIdlePaint = now;
        // The idle renderer now runs at 30 Hz, so advance twice as far per paint
        // to preserve the original 60 Hz angular speed.
        if (spinning) { st.yaw += 0.007; st.dirty = true; }
        if (meshOfT) { data.mesh = meshOfT(now); st.dirty = true; }
        if (st.dirty) { drawSurface3D(canvas, data, st.yaw, st.pitch); st.dirty = false; }
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return st;
}

function drawSurface3D(canvas, data, yaw, pitch) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, Hc = canvas.height;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const rot = ([x, y, z]) => {
        const x1 = x * cy - y * sy, y1 = x * sy + y * cy;          // yaw about z
        const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;        // pitch about x
        return [x1, y2, z2];                                        // depth = y2
    };
    // fit scale from mesh extents — a FIXED extent must be supplied for animated
    // (deforming) meshes, otherwise per-frame auto-fit normalizes the motion away
    let ext = data.fixedExtent || 0.001;
    if (!data.fixedExtent) {
        data.mesh.forEach(row => row.forEach(p => { ext = Math.max(ext, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])); }));
    }
    const scale = Math.min(W, Hc) * 0.36 / ext;
    const P = v => { const r = rot(v); return { x: W / 2 + r[0] * scale, y: Hc / 2 - r[2] * scale, d: r[1] }; };

    ctx.clearRect(0, 0, W, Hc);
    // volume darts behind the mesh
    (data.gauss?.darts || []).forEach(d => {
        const pr = P([d[0], d[1], d[2]]);
        ctx.fillStyle = d[3] ? 'rgba(74,222,128,0.5)' : 'rgba(100,116,139,0.18)';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 1.6, 0, 7); ctx.fill();
    });
    // depth-sorted quads with Lambert shading
    const quads = [];
    const light = [0.45, -0.6, 0.66];
    for (let i = 0; i + 1 < data.mesh.length; i++) {
        for (let j = 0; j + 1 < data.mesh[i].length; j++) {
            const a = data.mesh[i][j], b = data.mesh[i + 1][j], c = data.mesh[i + 1][j + 1], d4 = data.mesh[i][j + 1];
            const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            const v = [d4[0] - b[0], d4[1] - b[1], d4[2] - b[2]];
            let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            const nl = Math.hypot(...n) || 1;
            n = n.map(w => w / nl);
            const lam = Math.abs(n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
            const pa = P(a), pb = P(b), pc = P(c), pd = P(d4);
            quads.push({ d: (pa.d + pb.d + pc.d + pd.d) / 4, pts: [pa, pb, pc, pd], lam });
        }
    }
    quads.sort((q1, q2) => q2.d - q1.d);
    quads.forEach(q => {
        const sh = 0.35 + 0.65 * q.lam;
        ctx.fillStyle = `rgba(${Math.round(34 * sh + 20)}, ${Math.round(180 * sh + 30)}, ${Math.round(220 * sh + 25)}, 0.82)`;
        ctx.strokeStyle = 'rgba(8, 30, 45, 0.35)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        q.pts.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    // boundary curve (Stokes)
    if (data.boundary && data.boundary.length) {
        ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 3; ctx.beginPath();
        data.boundary.forEach((p, k) => { const pr = P(p); k ? ctx.lineTo(pr.x, pr.y) : ctx.moveTo(pr.x, pr.y); });
        ctx.stroke();
    }
    // field arrows
    (data.arrows || []).forEach(a => {
        const base = P([a[0], a[1], a[2]]);
        const mag = Math.hypot(a[3], a[4], a[5]);
        if (mag < 1e-9) return;
        const s = 0.34 / Math.max(mag, 1);
        const tip = P([a[0] + a[3] * s, a[1] + a[4] * s, a[2] + a[5] * s]);
        ctx.strokeStyle = 'rgba(251,191,36,0.85)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
        ctx.fillStyle = 'rgba(251,191,36,0.9)';
        ctx.beginPath(); ctx.arc(tip.x, tip.y, 2.2, 0, 7); ctx.fill();
    });
}

// ---- Leibniz rule / moving-domain animation — EXPERIMENTAL ----
const LEIBNIZ_PRESETS = [
    { name: 'Growing window: d/dt ∫₀ᵗ x² dx = t²', f: 'x^2', a: '0', b: 't', t: '2' },
    { name: 'Moving window, t-dependent integrand: ∫ₜ²ᵗ sin(t·x) dx', f: 'sin(t*x)', a: 't', b: '2*t', t: '1.3' },
    { name: 'Sliding unit window over a Gaussian: ∫ₜᵗ⁺¹ e^(−x²) dx', f: 'exp(0-x^2)', a: 't', b: 't+1', t: '0' },
    { name: 'Expanding window over a wave: ∫₋ₜᵗ cos(x) dx = 2 sin(t)', f: 'cos(x)', a: '0-t', b: 't', t: '1' },
];

function createLeibnizForm() {
    const opts = LEIBNIZ_PRESETS.map((p, i) => `<option value="${i}">${escapeHtml(p.name)}</option>`).join('');
    const field = (id, label, val) => `
        <label style="flex:1;font-size:0.8rem;color:#94a3b8;">${label}
            <input type="text" id="${id}" value="${escapeHtml(val)}" style="width:100%;padding:0.45rem;background:rgba(255,255,255,0.08);border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#fff;font-family:'JetBrains Mono',monospace;" />
        </label>`;
    return `
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
            <label style="font-size:0.8rem;color:#94a3b8;">Preset
                <select id="leibPreset" style="width:100%;padding:0.5rem;background:#1e293b;border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#e2e8f0;" onchange="window._applyLeibPreset(this.value)">${opts}</select>
            </label>
            ${field('leibF', 'f(x, t)', 'x^2')}
            <div style="display:flex;gap:10px;">${field('leibA', 'a(t) — lower bound', '0')}${field('leibB', 'b(t) — upper bound', 't')}${field('leibT', 'evaluate at t =', '2')}</div>
            <div style="font-size:0.75rem;color:#64748b;">EXPERIMENTAL — the 1D Reynolds transport theorem: d/dt ∫ f dx = boundary motion (f·b′ − f·a′) + bulk change (∫ ∂f/∂t dx). Both sides are computed independently; the result animates the moving domain.</div>
        </div>`;
}

window._applyLeibPreset = function (idx) {
    const p = LEIBNIZ_PRESETS[parseInt(idx, 10)];
    if (!p) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('leibF', p.f); set('leibA', p.a); set('leibB', p.b); set('leibT', p.t);
};

const leibAnim = { timer: null };
async function performLeibniz() {
    const get = id => document.getElementById(id)?.value.trim() || '';
    const response = await fetch('/api/leibniz', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ f: get('leibF'), a: get('leibA'), b: get('leibB'), t: parseFloat(get('leibT')) || 0 })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    setSolveFailedState(false);
    content.innerHTML = `
        <div class="result-item" style="border-left-color:${data.match ? '#4ade80' : '#fbbf24'};">
            <div class="result-label">d/dt ∫ f(x,t) dx over the moving domain [a(t), b(t)] at t = ${escapeHtml(String(data.t))}
                <span style="background:rgba(45,212,191,0.18);color:#5eead4;padding:2px 10px;border-radius:10px;font-size:0.75rem;">Leibniz / Reynolds 1D [EXPERIMENTAL]</span></div>
            <div style="font-size:1.25rem;color:#f1f5f9;margin-top:0.3rem;">
                LHS (numeric d/dt) = <strong>${data.lhs.toFixed(6)}</strong> ·
                RHS = boundary ${data.boundary_term.toFixed(6)} + bulk ${data.bulk_term.toFixed(6)} = <strong>${data.rhs.toFixed(6)}</strong>
                <span style="margin-left:0.6rem;padding:2px 10px;border-radius:10px;font-size:0.75rem;background:${data.match ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'};color:${data.match ? '#4ade80' : '#fbbf24'};">${data.match ? '✓ theorem verified' : 'disagree'}</span>
            </div>
            <div style="font-size:0.78rem;color:#94a3b8;margin-top:0.3rem;font-family:'JetBrains Mono',monospace;">${escapeHtml(data.derivatives)}</div>
        </div>
        <div class="result-item" style="border-left-color:#5eead4;">
            <div class="result-label">The moving domain, animated <button id="leibPlay" class="btn-secondary" type="button" style="margin-left:0.6rem;font-size:0.72rem;padding:2px 10px;">⏸ pause</button>
                <span id="leibReadout" style="margin-left:0.8rem;font-family:'JetBrains Mono',monospace;font-size:0.8rem;color:#5eead4;"></span></div>
            <canvas id="leibPlot" width="720" height="240" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;"></canvas>
        </div>`;
    panel.style.display = 'block';
    startLeibnizAnimation(document.getElementById('leibPlot'), data.frames);
    if (data.steps) showSteps(data.steps);
    setTimeout(() => content.scrollIntoView({ behavior: 'smooth' }), 100);
}

function startLeibnizAnimation(canvas, frames) {
    if (!canvas || !frames || !frames.length) return;
    clearInterval(leibAnim.timer);
    if (leibAnim.stop) leibAnim.stop();
    const ctx = canvas.getContext('2d');
    const W = canvas.width, Hc = canvas.height, pad = 26;
    const allF = frames.flatMap(fr => fr.fs.filter(v => v !== null && isFinite(v)));
    const lo = Math.min(...allF, 0), hi = Math.max(...allF, 0);
    const span = Math.max(hi - lo, 1e-9), y0 = lo - span * 0.1, y1 = hi + span * 0.1;
    const xsAll = frames[0].xs;
    const X = x => pad + (x - xsAll[0]) / (xsAll[xsAll.length - 1] - xsAll[0]) * (W - 2 * pad);
    const Y = y => Hc - pad - (y - y0) / (y1 - y0) * (Hc - 2 * pad);
    let playing = true, alive = true;
    leibAnim.stop = () => { alive = false; };
    // smooth playback: interpolate linearly BETWEEN server frames each rAF tick,
    // instead of stepping whole frames on a coarse timer.
    const lerpFrame = (pos) => {
        const k = Math.min(Math.floor(pos), frames.length - 2);
        const w = pos - k;
        const A = frames[k], B = frames[k + 1];
        const mix = (a, b) => (a === null || b === null || !isFinite(a) || !isFinite(b)) ? null : a + (b - a) * w;
        return {
            t: A.t + (B.t - A.t) * w,
            a: mix(A.a, B.a), b: mix(A.b, B.b),
            integral: mix(A.integral, B.integral),
            xs: A.xs,
            fs: A.fs.map((v, i) => mix(v, B.fs[i]))
        };
    };
    const draw = (fr) => {
        ctx.clearRect(0, 0, W, Hc);
        // shaded moving region between 0 and f over [a(t), b(t)]
        ctx.fillStyle = 'rgba(94, 234, 212, 0.2)';
        for (let i = 0; i + 1 < fr.xs.length; i++) {
            const x = fr.xs[i];
            if (x < Math.min(fr.a, fr.b) || x > Math.max(fr.a, fr.b)) continue;
            const v = fr.fs[i];
            if (v === null || !isFinite(v)) continue;
            ctx.fillRect(X(x), Math.min(Y(0), Y(v)), Math.max(X(fr.xs[i + 1]) - X(x), 1), Math.abs(Y(v) - Y(0)));
        }
        ctx.strokeStyle = 'rgba(148,163,184,0.4)';
        ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(W - pad, Y(0)); ctx.stroke();
        // moving bounds
        ctx.strokeStyle = 'rgba(251,191,36,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        [fr.a, fr.b].forEach(bx => { ctx.beginPath(); ctx.moveTo(X(bx), pad / 2); ctx.lineTo(X(bx), Hc - pad / 2); ctx.stroke(); });
        ctx.setLineDash([]);
        // f(x, t) curve
        ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath();
        let pen = false;
        fr.xs.forEach((x, i) => {
            const v = fr.fs[i];
            if (v === null || !isFinite(v)) { pen = false; return; }
            if (pen) ctx.lineTo(X(x), Y(v)); else ctx.moveTo(X(x), Y(v));
            pen = true;
        });
        ctx.stroke();
        const ro = document.getElementById('leibReadout');
        if (ro && fr.integral !== null) ro.textContent = `t = ${fr.t.toFixed(2)}   ∫ = ${fr.integral.toFixed(4)}`;
    };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { draw(frames[Math.floor(frames.length / 2)]); return; }
    trackAnimatedCanvas(canvas);
    const CYCLE_MS = 4500;                       // one full sweep of the t-window
    let acc = 0, last = performance.now(), lastPaint = 0;
    const tick = (now) => {
        if (!alive || !canvas.isConnected) { releaseAnimatedCanvas(canvas); return; }
        if (!animatedCanvasCanPaint(canvas)) { last = now; requestAnimationFrame(tick); return; }
        if (now - lastPaint < 1000 / 30) { requestAnimationFrame(tick); return; }
        lastPaint = now;
        if (playing) {
            acc = (acc + (now - last)) % CYCLE_MS;
            draw(lerpFrame(acc / CYCLE_MS * (frames.length - 1)));
        }
        last = now;
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const btn = document.getElementById('leibPlay');
    if (btn) btn.onclick = () => { playing = !playing; btn.textContent = playing ? '⏸ pause' : '▶ play'; };
}

// ---- Reynolds transport theorem (3D, deforming sphere) — EXPERIMENTAL ----
const REYNOLDS_PRESETS = [
    { name: 'Breathing sphere, f = 1: d/dt V = ∬ v_n dS = 4πR²R′', f: '1', r: '1+0.3*sin(t)', cx: '0', t: '0.8' },
    { name: 'Breathing sphere, f = x²+y²+z²: pure boundary-motion term', f: 'x^2+y^2+z^2', r: '1+0.3*sin(t)', cx: '0', t: '0.8' },
    { name: 'Translating sphere, f = x: d/dt = c′·V', f: 'x', r: '1', cx: '0.5*t', t: '1' },
    { name: 'Static sphere, time-dependent f = t·z²: pure bulk term', f: 't*z^2', r: '1', cx: '0', t: '0.7' },
];

function createReynoldsForm() {
    const opts = REYNOLDS_PRESETS.map((p, i) => `<option value="${i}">${escapeHtml(p.name)}</option>`).join('');
    const field = (id, label, val) => `
        <label style="flex:1;font-size:0.8rem;color:#94a3b8;">${label}
            <input type="text" id="${id}" value="${escapeHtml(val)}" style="width:100%;padding:0.45rem;background:rgba(255,255,255,0.08);border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#fff;font-family:'JetBrains Mono',monospace;" />
        </label>`;
    return `
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
            <label style="font-size:0.8rem;color:#94a3b8;">Preset
                <select id="reyPreset" style="width:100%;padding:0.5rem;background:#1e293b;border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#e2e8f0;" onchange="window._applyReyPreset(this.value)">${opts}</select>
            </label>
            ${field('reyF', 'f(x, y, z, t)', '1')}
            <div style="display:flex;gap:10px;">${field('reyR', 'R(t) — sphere radius', '1+0.3*sin(t)')}${field('reyCx', 'c(t) — center x offset', '0')}${field('reyT', 'evaluate at t =', '0.8')}</div>
            <div style="font-size:0.75rem;color:#64748b;">EXPERIMENTAL — Reynolds transport over a deforming control volume Ω(t): d/dt ∭ f dV = ∭ ∂f/∂t dV (bulk) + ∬ f (v_b·n) dS (boundary motion), with symbolic R′(t), c′(t), ∂f/∂t. Both sides are computed independently and also swept over a t-window.</div>
        </div>`;
}

window._applyReyPreset = function (idx) {
    const p = REYNOLDS_PRESETS[parseInt(idx, 10)];
    if (!p) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('reyF', p.f); set('reyR', p.r); set('reyCx', p.cx); set('reyT', p.t);
};

async function performReynolds() {
    const get = id => document.getElementById(id)?.value.trim() || '';
    const response = await fetch('/api/reynolds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ f: get('reyF'), r: get('reyR'), cx: get('reyCx'), t: parseFloat(get('reyT')) || 0 })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    setSolveFailedState(false);
    content.innerHTML = `
        <div class="result-item" style="border-left-color:${data.match ? '#4ade80' : '#fbbf24'};">
            <div class="result-label">Reynolds transport over the deforming sphere Ω(t), at t = ${escapeHtml(String(data.t))}
                <span style="background:rgba(94,234,212,0.18);color:#5eead4;padding:2px 10px;border-radius:10px;font-size:0.75rem;">Reynolds 3D [EXPERIMENTAL]</span></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-top:0.4rem;">
                <div style="background:rgba(103,232,249,0.06);border:1px solid rgba(103,232,249,0.25);border-radius:8px;padding:0.6rem 0.8rem;">
                    <div style="font-size:0.74rem;color:#67e8f9;text-transform:uppercase;letter-spacing:0.06em;">Method 1 — direct d/dt of ∭ f dV</div>
                    <div style="font-size:1.25rem;font-weight:700;color:#f1f5f9;">${data.lhs.toFixed(6)}</div>
                </div>
                <div style="background:rgba(244,114,182,0.06);border:1px solid rgba(244,114,182,0.25);border-radius:8px;padding:0.6rem 0.8rem;">
                    <div style="font-size:0.74rem;color:#f9a8d4;text-transform:uppercase;letter-spacing:0.06em;">Method 2 — via the theorem: bulk + boundary motion</div>
                    <div style="font-size:1.25rem;font-weight:700;color:#f1f5f9;">${data.bulk_term.toFixed(6)} + ${data.surface_term.toFixed(6)} = ${data.rhs.toFixed(6)}</div>
                </div>
            </div>
            <div style="margin-top:0.5rem;">
                <span style="padding:2px 10px;border-radius:10px;font-size:0.75rem;background:${data.match ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'};color:${data.match ? '#4ade80' : '#fbbf24'};">${data.match ? '✓ theorem verified' : 'disagree — check inputs'}</span>
                <span style="margin-left:0.8rem;font-size:0.78rem;color:#94a3b8;font-family:'JetBrains Mono',monospace;">${escapeHtml(data.derivatives)}</span>
            </div>
        </div>
        <div class="result-item" style="border-left-color:#c4b5fd;">
            <div class="result-label">Both sides as functions of t — the theorem holds along the whole deformation
                <span style="margin-left:0.6rem;font-size:0.72rem;"><span style="color:#22d3ee;">━ LHS d/dt∭f dV</span>&nbsp;&nbsp;<span style="color:#f9a8d4;">╌ RHS bulk+boundary</span></span></div>
            <canvas id="reySweep" width="720" height="200" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;"></canvas>
        </div>
        <div class="result-item" style="border-left-color:#5eead4;">
            <div class="result-label">The deforming control volume Ω(t) — animated, drag to rotate</div>
            <canvas id="reyPlot" width="720" height="380" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;cursor:grab;touch-action:none;"></canvas>
        </div>`;
    panel.style.display = 'block';

    drawSweepChart(document.getElementById('reySweep'),
        data.sweep.map(p => p.t),
        [{ ys: data.sweep.map(p => p.lhs), color: '#22d3ee', dash: [] },
         { ys: data.sweep.map(p => p.rhs), color: '#f9a8d4', dash: [6, 4] }]);

    // animated deforming sphere: scale/offset a client-built unit mesh by R(t), c(t)
    const unit = unitSphereMesh(16, 26);
    const geo = data.geometry;
    const CYCLE = 6000;
    const meshOfT = (now) => {
        const pos = (now % CYCLE) / CYCLE * (geo.length - 1);
        const k = Math.min(Math.floor(pos), geo.length - 2);
        const w = pos - k;
        const R = geo[k].r + (geo[k + 1].r - geo[k].r) * w;
        const C = geo[k].cx + (geo[k + 1].cx - geo[k].cx) * w;
        return unit.map(row => row.map(p => [C + R * p[0], R * p[1], R * p[2]]));
    };
    const maxExt = Math.max(...geo.map(g => Math.abs(g.cx) + g.r));
    initSurface3D(document.getElementById('reyPlot'), { mesh: meshOfT(0), fixedExtent: maxExt }, meshOfT);
    if (data.steps) showSteps(data.steps);
    setTimeout(() => content.scrollIntoView({ behavior: 'smooth' }), 100);
}

function unitSphereMesh(nu, nv) {
    return Array.from({ length: nu + 1 }, (_, i) => {
        const th = Math.PI * i / nu;
        return Array.from({ length: nv + 1 }, (_, j) => {
            const ph = 2 * Math.PI * j / nv;
            return [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
        });
    });
}

// ---- Leibniz 2D / 3D — moving area / deforming-ellipsoid transport — EXPERIMENTAL ----
const LEIBNIZ_ND_PRESETS = {
    2: [
        { name: 'Breathing disk, f = 1 → d/dt(πR²) = 2πR R′', f: '1', ax: '1+0.3*sin(t)', ay: '1+0.3*sin(t)', cx: '0', cy: '0', t: '0.8' },
        { name: 'Translating disk, f = x → c′·area', f: 'x', ax: '1', ay: '1', cx: '0.5*t', cy: '0', t: '1' },
        { name: 'Pulsing ellipse (a grows, b fixed), f = 1', f: '1', ax: '1+0.2*t', ay: '2', cx: '0', cy: '0', t: '1' },
        { name: 'Breathing disk, f = x²+y² → 2πR³R′', f: 'x^2+y^2', ax: '1+0.3*sin(t)', ay: '1+0.3*sin(t)', cx: '0', cy: '0', t: '0.8' },
    ],
    3: [
        { name: 'Breathing sphere, f = 1 → 4πR²R′', f: '1', ax: '1+0.3*sin(t)', ay: '1+0.3*sin(t)', az: '1+0.3*sin(t)', cx: '0', cy: '0', cz: '0', t: '0.8' },
        { name: 'Deforming ellipsoid (a grows), f = 1', f: '1', ax: '1+0.2*t', ay: '2', az: '1.5', cx: '0', cy: '0', cz: '0', t: '1' },
        { name: 'Translating sphere, f = x → c′·V', f: 'x', ax: '1', ay: '1', az: '1', cx: '0.5*t', cy: '0', cz: '0', t: '1' },
        { name: 'Static sphere, time-dependent f = t·z² (pure bulk)', f: 't*z^2', ax: '1', ay: '1', az: '1', cx: '0', cy: '0', cz: '0', t: '0.7' },
    ],
};

function createLeibnizNDForm(dim) {
    const presets = LEIBNIZ_ND_PRESETS[dim];
    const opts = presets.map((p, i) => `<option value="${i}">${escapeHtml(p.name)}</option>`).join('');
    const field = (id, label, val) => `
        <label style="flex:1;font-size:0.78rem;color:#94a3b8;">${label}
            <input type="text" id="${id}" value="${escapeHtml(val || '')}" style="width:100%;padding:0.42rem;background:rgba(255,255,255,0.08);border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#fff;font-family:'JetBrains Mono',monospace;" />
        </label>`;
    const p0 = presets[0];
    const axisRow = dim === 2
        ? `<div style="display:flex;gap:8px;">${field('lndAx', 'a(t) — x semi-axis', p0.ax)}${field('lndAy', 'b(t) — y semi-axis', p0.ay)}</div>`
        : `<div style="display:flex;gap:8px;">${field('lndAx', 'a(t)', p0.ax)}${field('lndAy', 'b(t)', p0.ay)}${field('lndAz', 'c(t)', p0.az)}</div>`;
    const centerRow = dim === 2
        ? `<div style="display:flex;gap:8px;">${field('lndCx', 'cₓ(t)', p0.cx)}${field('lndCy', 'c_y(t)', p0.cy)}</div>`
        : `<div style="display:flex;gap:8px;">${field('lndCx', 'cₓ(t)', p0.cx)}${field('lndCy', 'c_y(t)', p0.cy)}${field('lndCz', 'c_z(t)', p0.cz)}</div>`;
    return `<input type="hidden" id="lndDim" value="${dim}" />
        <div style="display:flex;flex-direction:column;gap:0.55rem;">
            <label style="font-size:0.78rem;color:#94a3b8;">Preset
                <select id="lndPreset" style="width:100%;padding:0.5rem;background:#1e293b;border:1px solid rgba(96,165,250,0.3);border-radius:6px;color:#e2e8f0;" onchange="window._applyLndPreset(${dim}, this.value)">${opts}</select>
            </label>
            ${field('lndF', dim === 2 ? 'f(x, y, t)' : 'f(x, y, z, t)', p0.f)}
            <div style="font-size:0.72rem;color:#64748b;">Ω(t) = ${dim === 2 ? 'ellipse' : 'ellipsoid'} with these semi-axes + center; equal axes ⇒ ${dim === 2 ? 'disk' : 'sphere'}.</div>
            ${axisRow}
            ${centerRow}
            ${field('lndT', 'evaluate at t =', p0.t)}
            <div style="font-size:0.74rem;color:#64748b;">EXPERIMENTAL — transport via the flow map: d/dt ${dim === 2 ? '∬' : '∭'}_Ω f = bulk (∂f/∂t) + boundary motion, from symbolic axis/center derivatives and ∇f. Both sides are computed independently and swept over t.</div>
        </div>`;
}

window._applyLndPreset = function (dim, idx) {
    const p = LEIBNIZ_ND_PRESETS[dim][parseInt(idx, 10)];
    if (!p) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
    set('lndF', p.f); set('lndAx', p.ax); set('lndAy', p.ay); set('lndAz', p.az);
    set('lndCx', p.cx); set('lndCy', p.cy); set('lndCz', p.cz); set('lndT', p.t);
};

async function performLeibnizND(dim) {
    const get = id => document.getElementById(id)?.value.trim() || '';
    const axes = dim === 2 ? [get('lndAx'), get('lndAy')] : [get('lndAx'), get('lndAy'), get('lndAz')];
    const center = dim === 2 ? [get('lndCx'), get('lndCy')] : [get('lndCx'), get('lndCy'), get('lndCz')];
    const body = { dim, f: get('lndF'), axes, center, t: parseFloat(get('lndT')) || 0 };
    const response = await fetch('/api/leibniz_nd', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    renderLeibnizND(data);
}

const lndAnim = { stop: null };
function renderLeibnizND(data) {
    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    setSolveFailedState(false);
    if (lndAnim.stop) { lndAnim.stop(); lndAnim.stop = null; }
    const sym = data.dim === 2 ? { I: '∬', d: 'dA' } : { I: '∭', d: 'dV' };
    content.innerHTML = `
        <div class="result-item" style="border-left-color:${data.match ? '#4ade80' : '#fbbf24'};">
            <div class="result-label">d/dt ${sym.I} f ${sym.d} over the deforming ${data.dim === 2 ? 'region' : 'volume'} Ω(t), at t = ${escapeHtml(String(data.t))}
                <span style="background:rgba(52,211,153,0.18);color:#6ee7b7;padding:2px 10px;border-radius:10px;font-size:0.75rem;">Leibniz ${data.dim}D [EXPERIMENTAL]</span></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-top:0.4rem;">
                <div style="background:rgba(103,232,249,0.06);border:1px solid rgba(103,232,249,0.25);border-radius:8px;padding:0.6rem 0.8rem;">
                    <div style="font-size:0.74rem;color:#67e8f9;text-transform:uppercase;letter-spacing:0.06em;">Method 1 — direct d/dt of ${sym.I} f ${sym.d}</div>
                    <div style="font-size:1.25rem;font-weight:700;color:#f1f5f9;">${data.lhs.toFixed(6)}</div>
                </div>
                <div style="background:rgba(244,114,182,0.06);border:1px solid rgba(244,114,182,0.25);border-radius:8px;padding:0.6rem 0.8rem;">
                    <div style="font-size:0.74rem;color:#f9a8d4;text-transform:uppercase;letter-spacing:0.06em;">Method 2 — via the theorem: bulk + boundary motion</div>
                    <div style="font-size:1.25rem;font-weight:700;color:#f1f5f9;">${data.bulk_term.toFixed(6)} + ${data.boundary_term.toFixed(6)} = ${data.rhs.toFixed(6)}</div>
                </div>
            </div>
            <div style="margin-top:0.5rem;">
                <span style="padding:2px 10px;border-radius:10px;font-size:0.75rem;background:${data.match ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'};color:${data.match ? '#4ade80' : '#fbbf24'};">${data.match ? '✓ theorem verified' : 'disagree — check inputs'}</span>
                <span style="margin-left:0.8rem;font-size:0.78rem;color:#94a3b8;font-family:'JetBrains Mono',monospace;">${escapeHtml(data.derivatives)}</span>
            </div>
        </div>
        <div class="result-item" style="border-left-color:#c4b5fd;">
            <div class="result-label">Both sides as functions of t — the theorem holds along the whole deformation
                <span style="margin-left:0.6rem;font-size:0.72rem;"><span style="color:#22d3ee;">━ LHS d/dt</span>&nbsp;&nbsp;<span style="color:#f9a8d4;">╌ RHS bulk+boundary</span></span></div>
            <canvas id="lndSweep" width="720" height="200" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;"></canvas>
        </div>
        <div class="result-item" style="border-left-color:#6ee7b7;">
            <div class="result-label">The deforming ${data.dim === 2 ? 'region Ω(t) — animated (ghosts show the deformation envelope)' : 'ellipsoid Ω(t) — animated, drag to rotate'}</div>
            <canvas id="lndPlot" width="720" height="${data.dim === 2 ? 260 : 380}" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;${data.dim === 3 ? 'cursor:grab;touch-action:none;' : ''}"></canvas>
        </div>`;
    panel.style.display = 'block';
    drawSweepChart(document.getElementById('lndSweep'), data.sweep.map(p => p.t),
        [{ ys: data.sweep.map(p => p.lhs), color: '#22d3ee', dash: [] },
         { ys: data.sweep.map(p => p.rhs), color: '#f9a8d4', dash: [6, 4] }]);
    if (data.dim === 2) {
        lndAnim.stop = animateLeibniz2D(document.getElementById('lndPlot'), data.geometry);
    } else {
        const geo = data.geometry;
        const unit = unitSphereMesh(16, 26);
        const CYCLE = 6000;
        const meshOfT = (now) => {
            const pos = (now % CYCLE) / CYCLE * (geo.length - 1);
            const k = Math.min(Math.floor(pos), geo.length - 2), w = pos - k;
            const ax = geo[k].axes.map((a, i) => a + (geo[k + 1].axes[i] - a) * w);
            const c = geo[k].center.map((c0, i) => c0 + (geo[k + 1].center[i] - c0) * w);
            return unit.map(row => row.map(p => [c[0] + ax[0] * p[0], c[1] + ax[1] * p[1], c[2] + ax[2] * p[2]]));
        };
        const maxExt = Math.max(...geo.flatMap(g => g.axes.map((a, i) => Math.abs(g.center[i]) + a)));
        const stt = initSurface3D(document.getElementById('lndPlot'), { mesh: meshOfT(0), fixedExtent: maxExt }, meshOfT);
        lndAnim.stop = () => { if (stt) stt.alive = false; };
    }
    if (data.steps) showSteps(data.steps);
    setTimeout(() => content.scrollIntoView({ behavior: 'smooth' }), 100);
}

function animateLeibniz2D(canvas, geo) {
    if (!canvas || !geo || !geo.length) return () => {};
    const ctx = canvas.getContext('2d');
    const W = canvas.width, Hc = canvas.height, pad = 24;
    let E = 0.001;
    geo.forEach(g => { E = Math.max(E, Math.abs(g.center[0]) + g.axes[0], Math.abs(g.center[1]) + g.axes[1]); });
    E *= 1.1;
    const scale = Math.min((W - 2 * pad) / (2 * E), (Hc - 2 * pad) / (2 * E));
    const X = x => W / 2 + x * scale, Y = y => Hc / 2 - y * scale;
    const ellipse = (cx, cy, ax, ay, fill, stroke, lw) => {
        ctx.beginPath();
        ctx.ellipse(X(cx), Y(cy), Math.max(ax * scale, 0.5), Math.max(ay * scale, 0.5), 0, 0, Math.PI * 2);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
    };
    const frameAt = pos => {
        const k = Math.min(Math.floor(pos), geo.length - 2), w = pos - k, a = geo[k], b = geo[k + 1];
        return {
            cx: a.center[0] + (b.center[0] - a.center[0]) * w, cy: a.center[1] + (b.center[1] - a.center[1]) * w,
            ax: a.axes[0] + (b.axes[0] - a.axes[0]) * w, ay: a.axes[1] + (b.axes[1] - a.axes[1]) * w, t: a.t + (b.t - a.t) * w
        };
    };
    const render = fr => {
        ctx.clearRect(0, 0, W, Hc);
        ctx.strokeStyle = 'rgba(148,163,184,0.22)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(W - pad, Y(0)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(X(0), pad); ctx.lineTo(X(0), Hc - pad); ctx.stroke();
        for (let i = 0; i < geo.length; i += 10) { const g = geo[i]; ellipse(g.center[0], g.center[1], g.axes[0], g.axes[1], null, 'rgba(110,231,183,0.13)', 1); }
        ellipse(fr.cx, fr.cy, fr.ax, fr.ay, 'rgba(52,211,153,0.22)', '#34d399', 2.2);
        ctx.fillStyle = '#34d399'; ctx.beginPath(); ctx.arc(X(fr.cx), Y(fr.cy), 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#94a3b8'; ctx.font = '11px JetBrains Mono, monospace'; ctx.fillText('t = ' + fr.t.toFixed(2), pad, pad);
    };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    render(frameAt((geo.length - 1) / 2));   // synchronous first paint (don't wait for rAF)
    if (reduce) { return () => {}; }
    let alive = true, last = performance.now(), acc = 0, lastPaint = 0;
    trackAnimatedCanvas(canvas);
    const CYCLE = 6000;
    const tick = now => {
        if (!alive || !canvas.isConnected) { releaseAnimatedCanvas(canvas); return; }
        if (!animatedCanvasCanPaint(canvas)) { last = now; requestAnimationFrame(tick); return; }
        if (now - lastPaint < 1000 / 30) { requestAnimationFrame(tick); return; }
        lastPaint = now;
        acc = (acc + (now - last)) % CYCLE; last = now;
        render(frameAt(acc / CYCLE * (geo.length - 1)));
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { alive = false; };
}

// Modal Functions
// ===================== Exact arithmetic (ℚ) =====================
// The engine can now evaluate the SAME tree three ways. They are not competing
// implementations — they answer three different questions, and each carries its
// own colour from the server so this legend cannot drift from what actually ran:
//
//   AMBER  float      — what we already had. Always answers, silently approximate.
//   GREEN  interval   — an enclosure, conditional on the math-library bound.
//   PURPLE exact      — NEW. Zero error, or an honest refusal.
//   GREY   refused    — no exact value exists, with the reason.
//
// Mode is switchable and purely additive: "float only" reproduces exactly what
// the engine did before any of this existed.

const EXACT_PRESETS = [
    { key: 'classic',  mode: 'compare',    f: '0.1 + 0.2',  label: '0.1 + 0.2 — the classic float lie (≠ 0.3)' },
    { key: 'cancel',   mode: 'compare',    f: '(1/3)*3 - 1', label: '(1/3)·3 − 1 — is it zero? float guesses, exact knows' },
    { key: 'irr',      mode: 'compare',    f: 'sqrt(2)',    label: '√2 — exact mode REFUSES (no rational value exists)' },
    { key: 'gcdfail',  mode: 'polynomial', f: 'x^4 - 4*x^3/3 + 6*x^2/9 - 4*x/27 + 1/81', label: '(x − 1/3)⁴ — float GCD gets this structurally WRONG' },
    { key: 'sqfree',   mode: 'polynomial', f: 'x^3 + x^2 - 5*x + 3', label: '(x−1)²(x+3) — squarefree decomposition + resultant' },
    { key: 'primgcd',  mode: 'polynomial', f: '3*x^2 - 4*x + 1', g: '3*x^2 + 2*x - 1', label: 'gcd = 3x − 1 — canonical primitive, not just monic' },
    { key: 'sqrt2',    mode: 'algebraic',  f: 'a^2 - 2',      g: '1 + a', label: 'ℚ(√2) — the value exact mode had to REFUSE, now exact' },
    { key: 'phi',      mode: 'algebraic',  f: 'a^2 - a - 1',  g: 'a',     label: 'ℚ(φ) golden ratio — φ² = φ + 1 exactly' },
    { key: 'cbrt2',    mode: 'algebraic',  f: 'a^3 - 2',      g: 'a',     label: 'ℚ(∛2) — degree 3, α⁻¹ = α²/2 exactly' },
    { key: 'quartic',  mode: 'algebraic',  f: 'a^4 + 1',      g: 'a',     label: 'ℚ(α), α⁴ = −1 — the constants 1/(x⁴+1) needs' },
];

function createExactForm() {
    const cur = document.getElementById('formula').value.trim();
    return `
        <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:0.9rem;line-height:1.5;">
            Everything else in this engine computes in <strong style="color:#fbbf24;">floats</strong>. This mode computes in
            <strong style="color:#a78bfa;">exact rationals</strong> — or refuses. The point is the
            <strong style="color:#f1f5f9;">zero-test</strong>: "is this coefficient zero?" is a <em>guess</em> at 1e−10 in float
            and a <em>fact</em> in ℚ. Every decision procedure (Risch, Rothstein–Trager, Gosper) is built out of exact
            zero-tests — which is why none of them could be built on the float core.
        </div>
        <div class="form-group">
            <label for="exPreset">preset</label>
            <select id="exPreset" onchange="window._exApplyPreset()">
                <option value="">— custom —</option>
                ${EXACT_PRESETS.map(p => `<option value="${p.key}">${escapeHtml(p.label)}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label for="exMode">mode <span style="color:#64748b;font-size:0.72rem;">(switchable — "float only" is the old behaviour)</span></label>
            <select id="exMode" onchange="window._exModeFields()">
                <option value="compare">compare all three — float vs interval vs exact</option>
                <option value="float">float only — what the engine did before</option>
                <option value="exact">exact only — ℚ or refusal</option>
                <option value="polynomial">polynomial lab — exact GCD / squarefree / resultant</option>
                <option value="algebraic">ℚ(α) — algebraic extensions, where √2 stops being refused</option>
            </select>
        </div>
        <div class="form-group"><label for="exF"><span id="exFLabel">f =</span></label><input type="text" id="exF" value="${escapeHtml(cur || '0.1 + 0.2')}"></div>
        <div class="form-group" id="exGWrap" style="display:none;">
            <label for="exG"><span id="exGLabel">g =</span> <span style="color:#64748b;font-size:0.72rem;" id="exGHint">(blank → uses f′, whose GCD with f exposes repeated roots)</span></label>
            <input type="text" id="exG" value="">
        </div>
        <div class="form-group" id="exVarsWrap">
            <label for="exVars">variable values <span style="color:#64748b;font-size:0.72rem;">(e.g. <code>x=1/3</code>, comma separated — fractions kept exact)</span></label>
            <input type="text" id="exVars" value="" placeholder="x=1/3">
        </div>`;
}

window._exApplyPreset = function () {
    const p = EXACT_PRESETS.find(q => q.key === document.getElementById('exPreset').value);
    if (!p) return;
    document.getElementById('exMode').value = p.mode;
    document.getElementById('exF').value = p.f;
    document.getElementById('exG').value = p.g || '';
    window._exModeFields();
};

window._exModeFields = function () {
    const m = document.getElementById('exMode').value;
    const poly = m === 'polynomial';
    const alg = m === 'algebraic';
    document.getElementById('exGWrap').style.display = (poly || alg) ? '' : 'none';
    document.getElementById('exVarsWrap').style.display = (poly || alg) ? 'none' : '';
    document.getElementById('exFLabel').textContent = alg ? 'minimal polynomial m(a) =' : 'f =';
    document.getElementById('exGLabel').textContent = alg ? 'element of ℚ(α) =' : 'g =';
    document.getElementById('exGHint').textContent = alg
        ? '(a polynomial in a — blank uses α itself)'
        : '(blank → uses f′, whose GCD with f exposes repeated roots)';
};

async function performExact() {
    const mode = document.getElementById('exMode').value;
    const f = document.getElementById('exF').value.trim();
    if (!f) throw new Error('Enter an expression.');
    const vars = {};
    (document.getElementById('exVars').value || '').split(',').forEach(part => {
        const m = part.split('=');
        if (m.length === 2 && m[0].trim()) vars[m[0].trim()] = m[1].trim();
    });
    const body = { mode, f, variable: 'x', vars };
    if (mode === 'polynomial' || mode === 'algebraic') body.g = document.getElementById('exG').value.trim();
    const response = await fetch('/api/exact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    if (data.mode === 'polynomial') renderExactPolynomial(data);
    else if (data.mode === 'algebraic') renderAlgebraic(data);
    else renderExactCompare(data);
}

// ℚ(α): α is stored as a SYMBOL plus the rule m(α)=0 — never as a float.
// The numeric column is an independent oracle, never fed back into the exact
// arithmetic, which is why it can be wrong-looking (or absent, for ℚ(i))
// without affecting a single exact claim.
function renderAlgebraic(data) {
    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    setSolveFailedState(false);
    const ic = data.irreducible_color;
    const istatus = data.irreducible === true ? 'PROVEN a field'
        : data.irreducible === false ? 'NOT a field' : 'ASSUMED a field';

    const powerRows = data.powers.map(p => `
        <tr>
            <td style="padding:3px 9px;color:#a78bfa;font-family:'JetBrains Mono',monospace;">α<sup>${p.k}</sup></td>
            <td style="padding:3px 9px;font-family:'JetBrains Mono',monospace;color:#f1f5f9;">${mathHtml(p.exact)}</td>
            <td style="padding:3px 9px;text-align:right;font-family:'JetBrains Mono',monospace;color:#64748b;">${p.numeric === null ? '— (no real embedding)' : Number(p.numeric).toPrecision(12)}</td>
        </tr>`).join('');

    content.innerHTML = `
        <div class="result-item" style="border-left-color:#a78bfa;">
            <div class="result-label">${escapeHtml(data.field)}
                <span style="background:rgba(167,139,250,0.18);color:#a78bfa;padding:2px 10px;border-radius:10px;font-size:0.75rem;">ℚ(α)</span></div>
            <div style="margin-top:0.5rem;padding:0.6rem 0.85rem;border-radius:8px;background:rgba(167,139,250,0.07);border:1px solid rgba(167,139,250,0.28);">
                <div style="font-size:0.8rem;color:#e2e8f0;line-height:1.5;">
                    Exact mode over ℚ had to <strong style="color:#94a3b8;">refuse</strong> irrational values.
                    Here α is stored as a <strong style="color:#a78bfa;">symbol plus the rule</strong>
                    <span style="font-family:'JetBrains Mono',monospace;">${mathHtml(data.min_poly)} = 0</span> —
                    so α² is <em>exactly</em> what the rule says, where a float √2 squares to 2.0000000000000004.
                </div>
            </div>
            <div style="margin-top:0.55rem;display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;">
                <span style="padding:3px 11px;border-radius:10px;font-size:0.78rem;background:${ic}22;color:${ic};font-weight:600;">${istatus}</span>
                <span style="font-size:0.76rem;color:#94a3b8;">degree ${data.degree}${data.alpha_numeric !== null ? ` · α ≈ ${Number(data.alpha_numeric).toPrecision(12)}` : ' · no real embedding (e.g. ℚ(i)) — the arithmetic is unaffected'}</span>
            </div>
            <div style="margin-top:0.4rem;font-size:0.77rem;color:#94a3b8;line-height:1.45;">${escapeHtml(data.irreducible_note)}</div>
            <div style="margin-top:0.4rem;font-size:0.78rem;color:${data.defining_check.zero ? '#4ade80' : '#f87171'};">
                ${data.defining_check.zero ? '✓' : '✗'} ${escapeHtml(data.defining_check.text)}
            </div>
        </div>

        <div class="result-item" style="border-left-color:#22d3ee;">
            <div class="result-label">Element β = ${mathHtml(data.element)} — powers reduce mod m, exactly
                <span style="margin-left:0.6rem;font-size:0.72rem;color:#64748b;">right column is an independent numeric oracle, never fed back in</span></div>
            <table style="width:100%;font-size:0.86rem;border-collapse:collapse;">
                <tr><th style="text-align:left;padding:3px 9px;color:#22d3ee;font-size:0.7rem;text-transform:uppercase;">power</th>
                    <th style="text-align:left;padding:3px 9px;color:#22d3ee;font-size:0.7rem;text-transform:uppercase;">exact (in ℚ(α))</th>
                    <th style="text-align:right;padding:3px 9px;color:#22d3ee;font-size:0.7rem;text-transform:uppercase;">numeric</th></tr>
                ${powerRows}
            </table>
        </div>

        <div class="result-item" style="border-left-color:${data.inverse ? '#4ade80' : '#f87171'};">
            <div class="result-label">Inverse — extended Euclid in ℚ[x], the step that makes this a <em>field</em></div>
            ${data.inverse ? `
                <div style="font-family:'JetBrains Mono',monospace;font-size:1.0rem;color:#f1f5f9;">
                    β⁻¹ = ${mathHtml(data.inverse.exact)}
                    ${data.inverse.numeric === null ? '' : `<span style="font-size:0.76rem;color:#64748b;"> ≈ ${Number(data.inverse.numeric).toPrecision(12)}</span>`}
                </div>
                <div style="margin-top:0.35rem;font-size:0.8rem;color:${data.inverse.verified ? '#4ade80' : '#f87171'};">
                    ${data.inverse.verified ? '✓' : '✗'} β · β⁻¹ = ${escapeHtml(data.inverse.product)} ${data.inverse.verified ? '— exactly 1' : '— NOT 1'}
                </div>
                <div style="margin-top:0.3rem;font-size:0.76rem;color:#94a3b8;">Solve u·p + v·m = 1, then p⁻¹ ≡ u (mod m). Needs exact remainders — a float Euclid never terminates cleanly.</div>`
            : `<div style="font-size:0.82rem;color:#fca5a5;">${escapeHtml(data.inverse_error || 'no inverse')}</div>
               <div style="margin-top:0.3rem;font-size:0.76rem;color:#94a3b8;">A failed inverse is not a numerical wobble — it is a <strong>proof</strong> that the minimal polynomial factors.</div>`}
        </div>

        <div class="result-item" style="border-left-color:#4ade80;">
            <div class="result-label">Norm &amp; trace — computed two independent ways, which must agree</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.7rem;">
                <div style="background:rgba(74,222,128,0.07);border:1px solid rgba(74,222,128,0.28);border-radius:8px;padding:0.55rem 0.8rem;">
                    <div style="font-size:0.7rem;color:#4ade80;text-transform:uppercase;">norm — via resultant</div>
                    <div style="font-size:1.05rem;font-weight:700;color:#f1f5f9;font-family:'JetBrains Mono',monospace;">${escapeHtml(data.norm)}</div>
                </div>
                <div style="background:rgba(34,211,238,0.07);border:1px solid rgba(34,211,238,0.28);border-radius:8px;padding:0.55rem 0.8rem;">
                    <div style="font-size:0.7rem;color:#22d3ee;text-transform:uppercase;">norm — via matrix det</div>
                    <div style="font-size:1.05rem;font-weight:700;color:#f1f5f9;font-family:'JetBrains Mono',monospace;">${escapeHtml(data.norm_via_matrix)}</div>
                </div>
                <div style="background:rgba(167,139,250,0.07);border:1px solid rgba(167,139,250,0.28);border-radius:8px;padding:0.55rem 0.8rem;">
                    <div style="font-size:0.7rem;color:#a78bfa;text-transform:uppercase;">trace</div>
                    <div style="font-size:1.05rem;font-weight:700;color:#f1f5f9;font-family:'JetBrains Mono',monospace;">${escapeHtml(data.trace)}</div>
                </div>
            </div>
            <div style="margin-top:0.45rem;font-size:0.8rem;color:${data.norm_consistent ? '#4ade80' : '#f87171'};">
                ${data.norm_consistent ? '✓ both routes agree — norm and trace are rational, as the theory demands' : '✗ the two routes disagree, which would be a bug'}
            </div>
            ${exactLegend()}
        </div>`;
    panel.style.display = 'block';
    showSteps(data.steps);
}

// the persistent colour key — same colours the server tagged each lane with
function exactLegend() {
    const rows = [
        ['#fbbf24', 'float', 'what we already had — always answers, silently approximate'],
        ['#4ade80', 'interval', 'outward-rounded bounds; transcendental guarantees assume a two-ULP library error bound'],
        ['#a78bfa', 'exact', 'NEW — zero error, or an honest refusal'],
        ['#94a3b8', 'refused', 'no exact value exists, and the reason why'],
    ];
    return `<div style="display:flex;flex-wrap:wrap;gap:0.5rem 1.1rem;margin-top:0.6rem;padding-top:0.55rem;border-top:1px solid rgba(148,163,184,0.15);">
        ${rows.map(([c, k, d]) => `<span style="font-size:0.72rem;color:#94a3b8;display:inline-flex;align-items:center;gap:5px;">
            <span style="width:9px;height:9px;border-radius:3px;background:${c};display:inline-block;"></span>
            <strong style="color:${c};">${k}</strong> ${escapeHtml(d)}</span>`).join('')}
    </div>`;
}

function renderExactCompare(data) {
    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    setSolveFailedState(false);
    const lanes = data.lanes.map(l => `
        <div style="background:${l.color}14;border:1px solid ${l.color}44;border-left:3px solid ${l.color};border-radius:8px;padding:0.6rem 0.85rem;margin-bottom:0.5rem;">
            <div style="display:flex;align-items:baseline;gap:0.6rem;flex-wrap:wrap;">
                <span style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.07em;color:${l.color};font-weight:700;">${escapeHtml(l.label)}</span>
                <span style="font-family:'JetBrains Mono',monospace;font-size:1.05rem;color:#f1f5f9;">${escapeHtml(l.value)}</span>
                ${l.decimal ? `<span style="font-size:0.75rem;color:#64748b;font-family:'JetBrains Mono',monospace;">= ${escapeHtml(l.decimal)}…</span>` : ''}
                ${l.status === 'refused' ? '<span style="font-size:0.68rem;background:rgba(148,163,184,0.2);color:#94a3b8;padding:1px 8px;border-radius:9px;">refused</span>' : ''}
            </div>
            <div style="font-size:0.76rem;color:#94a3b8;margin-top:0.3rem;line-height:1.45;">${escapeHtml(l.note)}</div>
        </div>`).join('');

    const d = data.delta;
    content.innerHTML = `
        <div class="result-item" style="border-left-color:#a78bfa;">
            <div class="result-label">Same expression, three kinds of answer — ${mathHtml(data.expression)}
                <span style="background:rgba(167,139,250,0.18);color:#a78bfa;padding:2px 10px;border-radius:10px;font-size:0.75rem;">ℚ exact</span></div>
            <div style="margin-top:0.55rem;">${lanes}</div>
            ${d ? `<div style="margin-top:0.5rem;padding:0.55rem 0.85rem;border-radius:8px;background:${d.equal ? 'rgba(74,222,128,0.08)' : 'rgba(251,191,36,0.1)'};border:1px solid ${d.equal ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'};font-size:0.82rem;color:#e2e8f0;">
                ${d.equal
                    ? '✓ float happened to agree exactly here — it often does, which is exactly what makes the cases where it does not so hard to notice.'
                    : `float is off by <span style="font-family:'JetBrains Mono',monospace;color:#fbbf24;">${escapeHtml(d.difference)}</span> — tiny, and enough to turn a zero-test into a coin flip.`}
            </div>` : ''}
            ${exactLegend()}
        </div>`;
    panel.style.display = 'block';
    showSteps(data.steps);
}

function renderExactPolynomial(data) {
    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    setSolveFailedState(false);
    const g = data.gcd;
    const disagree = g.disagree;

    content.innerHTML = `
        <div class="result-item" style="border-left-color:#a78bfa;">
            <div class="result-label">Exact polynomial over ℚ — f = ${mathHtml(data.f)}
                <span style="background:rgba(167,139,250,0.18);color:#a78bfa;padding:2px 10px;border-radius:10px;font-size:0.75rem;">ℚ exact</span></div>
            <div style="font-size:0.78rem;color:#94a3b8;margin-top:0.3rem;">partner (${escapeHtml(data.partner_label)}) = <span style="font-family:'JetBrains Mono',monospace;">${mathHtml(data.partner)}</span></div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-top:0.7rem;">
                <div style="background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.3);border-left:3px solid #a78bfa;border-radius:8px;padding:0.6rem 0.85rem;">
                    <div style="font-size:0.7rem;color:#a78bfa;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">exact GCD (ℚ)</div>
                    <div style="font-family:'JetBrains Mono',monospace;font-size:1.02rem;color:#f1f5f9;margin-top:2px;">${mathHtml(g.exact)}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;">degree ${g.exact_degree} · canonical primitive form (integer coefficients)</div>
                </div>
                <div style="background:${disagree ? 'rgba(248,113,113,0.08)' : 'rgba(251,191,36,0.08)'};border:1px solid ${disagree ? 'rgba(248,113,113,0.35)' : 'rgba(251,191,36,0.3)'};border-left:3px solid ${disagree ? '#f87171' : '#fbbf24'};border-radius:8px;padding:0.6rem 0.85rem;">
                    <div style="font-size:0.7rem;color:${disagree ? '#f87171' : '#fbbf24'};text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">float GCD (what we had)</div>
                    <div style="font-family:'JetBrains Mono',monospace;font-size:1.02rem;color:#f1f5f9;margin-top:2px;">${g.float === null ? '—' : mathHtml(g.float)}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;">degree ${g.float_degree === null ? '—' : g.float_degree} · monic scaling only</div>
                </div>
            </div>
            ${disagree ? `<div style="margin-top:0.55rem;padding:0.6rem 0.85rem;border-radius:8px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.35);font-size:0.82rem;color:#fecaca;">
                <strong>The two disagree structurally.</strong> The true GCD has degree ${g.exact_degree}; the float path reports degree ${g.float_degree}
                — i.e. “no common factor”. Not a rounding difference: a coefficient that should be exactly 0 never lands on exactly 0.0,
                so the Euclidean remainder never terminates correctly. This is the operation Rothstein–Trager is built on.
            </div>` : `<div style="margin-top:0.55rem;font-size:0.8rem;color:#94a3b8;">Float agrees on this input — it often does. Try the <em>(x − 1/3)⁴</em> preset to see it fail.</div>`}
        </div>

        <div class="result-item" style="border-left-color:#4ade80;">
            <div class="result-label">Squarefree decomposition (Yun) — needs exact GCD, so this was impossible before</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:0.98rem;color:#f1f5f9;">
                ${data.squarefree.length ? data.squarefree.map(s => `(${mathHtml(s.factor)})${s.multiplicity > 1 ? `<sup style="color:#4ade80;">${s.multiplicity}</sup>` : ''}`).join(' · ') : 'f is already squarefree'}
            </div>
            <div style="font-size:0.76rem;color:#94a3b8;margin-top:0.35rem;">Splits f by root multiplicity. Rothstein–Trager runs on the squarefree part, so this is a hard prerequisite.</div>
        </div>

        <div class="result-item" style="border-left-color:#22d3ee;">
            <div class="result-label">Resultant &amp; exact roots — the other Rothstein–Trager ingredient</div>
            <div style="font-size:0.9rem;color:#f1f5f9;font-family:'JetBrains Mono',monospace;">
                Res(f, ${escapeHtml(data.partner_label)}) = <span style="color:${data.resultant_zero ? '#4ade80' : '#22d3ee'};">${escapeHtml(data.resultant)}</span>
            </div>
            <div style="font-size:0.76rem;color:#94a3b8;margin-top:0.3rem;">
                ${data.resultant_zero
                    ? 'Exactly zero ⇒ f and its partner share a root. An <strong>exact</strong> test — the float path could only ever compare against a tolerance.'
                    : 'Non-zero ⇒ no shared root. Exact, so this is a proof rather than a measurement.'}
            </div>
            <div style="font-size:0.85rem;color:#f1f5f9;margin-top:0.5rem;font-family:'JetBrains Mono',monospace;">
                rational roots: ${data.rational_roots.length ? data.rational_roots.map(r => `<span style="color:#a78bfa;">${escapeHtml(r)}</span>`).join(', ') : '<span style="color:#64748b;">none (verified exactly)</span>'}
            </div>
            ${exactLegend()}
        </div>`;
    panel.style.display = 'block';
    showSteps(data.steps);
}

// ===================== General relativity =====================
// Diagonal metric in, curvature out - with the field's classic self-checks:
// Schwarzschild must be vacuum (Ricci = 0) with Kretschmann 48M²/r⁶, de Sitter
// must solve R_uv = 3H²g_uv, and a geodesic on OUR Christoffels must conserve
// E, L, and the 4-velocity norm while precessing as GR demands.

function createGRForm() {
    return `
        <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:0.9rem;line-height:1.5;">
            Give a diagonal metric <span style="font-family:'JetBrains Mono',monospace;color:#a78bfa;">g<sub>μν</sub></span> and the engine derives
            Christoffel symbols and curvature <strong style="color:#f1f5f9;">symbolically</strong>, then attacks the result with
            every oracle the textbooks offer — including flying an orbit on the computed connection.
        </div>
        <div class="form-group">
            <label for="grPreset">spacetime</label>
            <select id="grPreset" onchange="window._grToggleCustom()">
                <option value="schwarzschild" selected>Schwarzschild — black hole exterior (vacuum + orbit + Mercury)</option>
                <option value="desitter">de Sitter — exponentially expanding universe (Λ-vacuum)</option>
                <option value="minkowski">Minkowski — flat spacetime (the null test)</option>
                <option value="custom">Custom diagonal metric</option>
            </select>
        </div>
        <div id="grOrbitBlock" style="background:rgba(167,139,250,0.05);border:1px solid rgba(167,139,250,0.2);border-radius:8px;padding:0.7rem 0.85rem;margin-bottom:0.8rem;">
            <div style="font-size:0.74rem;color:#c4b5fd;margin-bottom:0.5rem;">Orbit (geodesic on the computed Christoffels, M = 1)</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.6rem;">
                <div class="form-group"><label for="grRp">perihelion r_p</label><input type="text" id="grRp" value="40"></div>
                <div class="form-group"><label for="grRa">apoapsis r_a</label><input type="text" id="grRa" value="60"></div>
                <div class="form-group"><label for="grOrbits">orbits</label><select id="grOrbits">${[2,3,4,5,6].map(v=>`<option value="${v}"${v===4?' selected':''}>${v}</option>`).join('')}</select></div>
            </div>
            <div style="font-size:0.7rem;color:#64748b;">Tighter orbits (e.g. 15 / 25) precess more per orbit but drift further from the first-order 6πM/ℓ formula.</div>
        </div>
        <div id="grCustomBlock" style="display:none;background:rgba(167,139,250,0.05);border:1px solid rgba(167,139,250,0.2);border-radius:8px;padding:0.7rem 0.85rem;margin-bottom:0.8rem;">
            <div style="font-size:0.74rem;color:#c4b5fd;margin-bottom:0.5rem;">Diagonal components in coordinates t, r, th, ph (th → θ, ph → φ)</div>
            <div class="form-group"><label>g_tt</label><input type="text" id="grG0" value="-1"></div>
            <div class="form-group"><label>g_rr</label><input type="text" id="grG1" value="1"></div>
            <div class="form-group"><label>g_θθ</label><input type="text" id="grG2" value="r^2"></div>
            <div class="form-group"><label>g_φφ</label><input type="text" id="grG3" value="r^2*sin(th)^2"></div>
            <div style="font-size:0.7rem;color:#64748b;">Custom metrics get the structural checks (Riemann identities) — there is no closed-form oracle, and the verdict will say so.</div>
        </div>`;
}

window._grToggleCustom = function () {
    const p = document.getElementById('grPreset').value;
    document.getElementById('grCustomBlock').style.display = p === 'custom' ? '' : 'none';
    document.getElementById('grOrbitBlock').style.display = p === 'schwarzschild' ? '' : 'none';
};

async function performGR() {
    const preset = document.getElementById('grPreset').value;
    const body = {};
    if (preset === 'custom') {
        body.metric = ['grG0', 'grG1', 'grG2', 'grG3'].map(id => document.getElementById(id).value.trim());
        body.coords = ['t', 'r', 'th', 'ph'];
        body.ranges = { t: [0, 1], r: [1.2, 3], th: [0.5, 2.5], ph: [0, 6] };
    } else {
        body.preset = preset;
        if (preset === 'schwarzschild') {
            body.orbit = {
                r_p: parseFloat(document.getElementById('grRp').value) || 40,
                r_a: parseFloat(document.getElementById('grRa').value) || 60,
                orbits: parseInt(document.getElementById('grOrbits').value, 10) || 4,
            };
        }
    }
    const response = await fetch('/api/gr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    renderGR(data);
}

function renderGR(data) {
    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    const v = data.verification;
    const tone = v.passed ? { c: '#4ade80', bg: 'rgba(74,222,128,0.18)' } : { c: '#f87171', bg: 'rgba(248,113,113,0.15)' };
    setSolveFailedState(!v.passed);

    const metricRow = data.metric.map(m => `<span style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;color:#e2e8f0;background:rgba(0,0,0,0.25);padding:2px 9px;border-radius:7px;">${escapeHtml(m.component)} = ${mathHtml(m.expr)}</span>`).join(' ');
    const gammaGrid = data.christoffels.length ? data.christoffels.map(cst => `
        <div style="font-family:'JetBrains Mono',monospace;font-size:0.84rem;padding:3px 0;border-bottom:1px solid rgba(148,163,184,0.08);">
            <span style="color:#a78bfa;">${escapeHtml(cst.symbol)}</span> <span style="color:#64748b;">=</span> ${mathHtml(cst.expr)}
        </div>`).join('') : '<div style="color:#64748b;font-size:0.84rem;">All Christoffel symbols vanish — flat spacetime in Cartesian coordinates.</div>';

    const ricci = data.ricci;
    const sym = data.symmetry;
    const checksRows = [
        ['Ricci', ricci.note, ricci.passed],
        ['Riemann identities', sym.note, sym.passed],
        data.kretschmann ? ['Kretschmann', data.kretschmann.note, data.kretschmann.passed] : null,
    ].filter(Boolean).map(([name, note, ok]) => `
        <div style="display:flex;gap:0.6rem;align-items:baseline;margin-bottom:0.4rem;">
            <span style="min-width:130px;font-size:0.76rem;color:#a78bfa;text-transform:uppercase;letter-spacing:0.05em;">${name}</span>
            <span style="font-size:0.8rem;color:${ok ? '#94a3b8' : '#f87171'};">${escapeHtml(note)}</span>
            <span style="color:${ok ? '#4ade80' : '#f87171'};font-weight:700;">${ok ? '✓' : '✗'}</span>
        </div>`).join('');

    const orb = data.orbit && data.orbit.path ? data.orbit : null;
    const orbSkipped = data.orbit && data.orbit.skipped ? data.orbit.skipped : null;
    content.innerHTML = `
        <div class="result-item" style="border-left-color:${tone.c};">
            <div class="result-label">${escapeHtml(data.label)}
                <span style="background:${tone.bg};color:${tone.c};padding:2px 10px;border-radius:10px;font-size:0.75rem;">g<sub>μν</sub></span></div>
            <div style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.4rem;">${metricRow}</div>
            <div style="margin-top:0.6rem;"><span style="padding:3px 11px;border-radius:10px;font-size:0.78rem;background:${tone.bg};color:${tone.c};font-weight:600;">${escapeHtml(v.verdict)}</span></div>
        </div>
        <div class="result-item" style="border-left-color:#a78bfa;">
            <div class="result-label">Christoffel symbols — ${data.n_nonzero_christoffels} nonzero, parameters kept symbolic</div>
            <div style="columns:${data.christoffels.length > 5 ? 2 : 1};column-gap:2rem;">${gammaGrid}</div>
        </div>
        <div class="result-item" style="border-left-color:#22d3ee;">
            <div class="result-label">Curvature — attacked by every available oracle</div>
            ${checksRows}
        </div>
        ${orb ? `
        <div class="result-item" style="border-left-color:#fbbf24;">
            <div class="result-label">Geodesic on the computed connection — the rosette IS the precession
                <span style="margin-left:0.6rem;font-size:0.72rem;color:#fbbf24;">● perihelia</span></div>
            <canvas id="grOrbit" width="720" height="480" style="width:100%;max-width:720px;background:rgba(0,0,0,0.35);border-radius:8px;"></canvas>
            <div style="margin-top:0.5rem;display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.7rem;">
                <div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.25);border-radius:8px;padding:0.55rem 0.8rem;">
                    <div style="font-size:0.7rem;color:#fbbf24;text-transform:uppercase;">measured advance</div>
                    <div style="font-size:1.1rem;font-weight:700;color:#f1f5f9;">${orb.precession_measured_deg}°/orbit</div>
                </div>
                <div style="background:rgba(34,211,238,0.06);border:1px solid rgba(34,211,238,0.25);border-radius:8px;padding:0.55rem 0.8rem;">
                    <div style="font-size:0.7rem;color:#22d3ee;text-transform:uppercase;">6πM/ℓ (first-order PN)</div>
                    <div style="font-size:1.1rem;font-weight:700;color:#f1f5f9;">${orb.precession_theory_deg}°/orbit</div>
                </div>
                <div style="background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.25);border-radius:8px;padding:0.55rem 0.8rem;">
                    <div style="font-size:0.7rem;color:#a78bfa;text-transform:uppercase;">same formula, Mercury's numbers</div>
                    <div style="font-size:1.1rem;font-weight:700;color:#f1f5f9;">${orb.mercury_arcsec_per_century}″/century</div>
                </div>
            </div>
            <div style="margin-top:0.45rem;font-size:0.74rem;color:#94a3b8;">
                conservation drift — energy ${orb.conservation.energy_drift} · angular momentum ${orb.conservation.ang_momentum_drift} · 4-velocity norm ${orb.conservation.norm_drift}
            </div>
        </div>` : orbSkipped ? `
        <div class="result-item" style="border-left-color:#fbbf24;">
            <div class="result-label">Geodesic orbit</div>
            <div style="font-size:0.82rem;color:#fbbf24;">${escapeHtml(orbSkipped)}</div>
        </div>` : ''}`;
    panel.style.display = 'block';
    showSteps(data.steps);
    if (orb) drawGROrbit(document.getElementById('grOrbit'), orb);
}

function drawGROrbit(canvas, orb) {
    if (!canvas || !orb.path || !orb.path.length) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const maxR = Math.max(...orb.path.map(p => Math.hypot(p[0], p[1])));
    const scale = Math.min(W, H) * 0.46 / maxR;
    const SX = x => W / 2 + x * scale, SY = y => H / 2 - y * scale;
    ctx.clearRect(0, 0, W, H);
    // central mass with a soft glow + photon-sphere-ish rings for flavor
    const grad = ctx.createRadialGradient(W / 2, H / 2, 1, W / 2, H / 2, 26);
    grad.addColorStop(0, 'rgba(251,191,36,0.9)');
    grad.addColorStop(0.4, 'rgba(251,146,60,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 26, 0, 6.284); ctx.fill();
    ctx.fillStyle = '#0b0f19';
    ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.max(2 * scale, 3), 0, 6.284); ctx.fill();
    // the rosette, hue drifting along proper time
    for (let i = 1; i < orb.path.length; i++) {
        const t = i / orb.path.length;
        ctx.strokeStyle = `hsla(${190 + 130 * t}, 85%, ${55 + 12 * Math.sin(t * 9)}%, 0.85)`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(SX(orb.path[i - 1][0]), SY(orb.path[i - 1][1]));
        ctx.lineTo(SX(orb.path[i][0]), SY(orb.path[i][1]));
        ctx.stroke();
    }
    // perihelion markers at radius r_p along each recorded angle
    (orb.perihelion_angles || []).forEach(a => {
        ctx.fillStyle = 'rgba(251,191,36,0.95)';
        ctx.beginPath();
        ctx.arc(SX(orb.r_p * Math.cos(a)), SY(orb.r_p * Math.sin(a)), 4, 0, 6.284);
        ctx.fill();
    });
    ctx.fillStyle = '#64748b'; ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText(`r_p = ${orb.r_p}M · r_a = ${orb.r_a}M · ${orb.orbits} orbits — the ellipse axis swings ${orb.precession_measured_deg}° each pass`, 14, 16);
}

// ===================== Certified bounds — interval arithmetic =====================
// Every op carries [lo, hi] with outward rounding; transcendental guarantees over
// the whole box assume the library error fits the two-ULP widening: ranges, minima
// and definite-integral brackets that the Simpson estimate must fall inside.

const INTERVAL_PRESETS = [
    { key: 'dep',     mode: 'enclose',   f: 'x^2 - x', x: [0, 1],   name: 'x² − x — the dependency problem, shrunk live' },
    { key: 'needle',  mode: 'globalmin', f: '0.05*x^2 - exp(-200*(x - 1.2345)^2)', x: [-3, 3], name: 'needle in a haystack — a narrow dip found by interval subdivision' },
    { key: 'dips',    mode: 'globalmin', f: 'sin(3*x) + 0.3*x^2', x: [-4, 4], name: 'sin(3x)+0.3x² — many local minima, one bounded search' },
    { key: 'himmel',  mode: 'globalmin', f: '(x^2 + y - 11)^2 + (x + y^2 - 7)^2', x: [-5, 5], y: [-5, 5], name: 'Himmelblau (2D) — four global-minimum regions' },
    { key: 'sinint',  mode: 'integral',  f: 'sin(x)', a: '0', b: '3.14159265358979', name: '∫₀^π sin = 2 — bounded by interval sums' },
    { key: 'gauss',   mode: 'integral',  f: 'exp(-x^2)', a: '0', b: '1', name: '∫₀¹ e^(−x²) — non-elementary, still bracketed' },
];

function createIntervalForm() {
    const cur = document.getElementById('formula').value.trim();
    const presetOpts = INTERVAL_PRESETS.map(p => `<option value="${p.key}">${escapeHtml(p.name)}</option>`).join('');
    return `
        <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:0.9rem;line-height:1.5;">
            The engine's other checks sample points; this one carries <span style="font-family:'JetBrains Mono',monospace;color:#4ade80;">[lo, hi]</span>
            bounds through every operation with outward rounding. These are
            <strong style="color:#f1f5f9;">conditional interval bounds</strong>: transcendental operations assume the platform math-library error is covered by the two-ULP widening. Sample checks can reveal bugs; they do not prove that assumption.
        </div>
        <div class="form-group">
            <label for="ivPreset">preset (or edit the fields below)</label>
            <select id="ivPreset" onchange="window._ivApplyPreset()"><option value="">— custom —</option>${presetOpts}</select>
        </div>
        <div class="form-group">
            <label for="ivMode">what to bound</label>
            <select id="ivMode" onchange="window._ivModeFields()">
                <option value="enclose">range enclosure — all values of f on a box</option>
                <option value="globalmin">global minimum — branch &amp; bound search</option>
                <option value="integral">definite integral — an interval bracket</option>
            </select>
        </div>
        <div class="form-group"><label for="ivF">f =</label><input type="text" id="ivF" value="${escapeHtml(cur || 'x^2 - x')}"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0.6rem;">
            <div class="form-group"><label for="ivX0">x from</label><input type="text" id="ivX0" value="0"></div>
            <div class="form-group"><label for="ivX1">x to</label><input type="text" id="ivX1" value="1"></div>
            <div class="form-group" id="ivY0w"><label for="ivY0">y from <span style="color:#64748b;font-size:0.7rem;">(2D only)</span></label><input type="text" id="ivY0" value=""></div>
            <div class="form-group" id="ivY1w"><label for="ivY1">y to</label><input type="text" id="ivY1" value=""></div>
        </div>
        <div style="font-size:0.72rem;color:#64748b;">
            The interval evaluator refuses unsupported inputs: unbound variables, domain violations (ln touching 0) and
            unsupported functions raise an honest error instead of returning a plausible number.
        </div>`;
}

window._ivApplyPreset = function () {
    const p = INTERVAL_PRESETS.find(q => q.key === document.getElementById('ivPreset').value);
    if (!p) return;
    document.getElementById('ivMode').value = p.mode;
    document.getElementById('ivF').value = p.f;
    document.getElementById('ivX0').value = p.mode === 'integral' ? p.a : p.x[0];
    document.getElementById('ivX1').value = p.mode === 'integral' ? p.b : p.x[1];
    document.getElementById('ivY0').value = p.y ? p.y[0] : '';
    document.getElementById('ivY1').value = p.y ? p.y[1] : '';
    window._ivModeFields();
};

window._ivModeFields = function () {
    const is2dOk = document.getElementById('ivMode').value !== 'integral';
    document.getElementById('ivY0w').style.opacity = is2dOk ? '1' : '0.35';
    document.getElementById('ivY1w').style.opacity = is2dOk ? '1' : '0.35';
};

async function performInterval() {
    const mode = document.getElementById('ivMode').value;
    const f = document.getElementById('ivF').value.trim();
    const x0 = parseFloat(document.getElementById('ivX0').value);
    const x1 = parseFloat(document.getElementById('ivX1').value);
    if (!f) throw new Error('Enter a function.');
    if (!isFinite(x0) || !isFinite(x1)) throw new Error('Enter numeric bounds for x.');
    const body = { mode, f };
    if (mode === 'integral') {
        body.lower = x0; body.upper = x1; body.variable = 'x';
    } else {
        body.box = { x: [x0, x1] };
        const y0 = parseFloat(document.getElementById('ivY0').value);
        const y1 = parseFloat(document.getElementById('ivY1').value);
        if (isFinite(y0) && isFinite(y1)) body.box.y = [y0, y1];
    }
    const response = await fetch('/api/interval', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    renderInterval(mode, data);
}

function ivToneOf(v) {
    if (v.passed) return { c: '#4ade80', bg: 'rgba(74,222,128,0.18)' };
    if (v.verdict && v.verdict.startsWith('NO CERTIFICATE')) return { c: '#fbbf24', bg: 'rgba(251,191,36,0.16)' };
    return { c: '#f87171', bg: 'rgba(248,113,113,0.15)' };
}

function renderInterval(mode, data) {
    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    const v = data.verification;
    const tone = ivToneOf(v);
    setSolveFailedState(!v.passed && !(v.verdict || '').startsWith('NO CERTIFICATE'));

    let body = `
        <div class="result-item" style="border-left-color:${tone.c};">
            <div class="result-label">${mode === 'enclose' ? 'Range enclosure' : mode === 'globalmin' ? 'Global-minimum bounds' : 'Integral bracket'}
                <span style="background:${tone.bg};color:${tone.c};padding:2px 10px;border-radius:10px;font-size:0.75rem;">⟦ conditional interval bound ⟧</span></div>`;

    if (mode === 'enclose') {
        body += `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-top:0.5rem;">
                <div style="background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.25);border-radius:8px;padding:0.6rem 0.8rem;">
                    <div style="font-size:0.72rem;color:#fca5a5;text-transform:uppercase;letter-spacing:0.06em;">naive (one box)</div>
                    <div style="font-size:1.05rem;font-weight:700;color:#f1f5f9;font-family:'JetBrains Mono',monospace;">[${data.naive.lo}, ${data.naive.hi}]</div>
                    <div style="font-size:0.72rem;color:#94a3b8;">width ${data.naive.width} — the dependency problem</div>
                </div>
                <div style="background:rgba(74,222,128,0.06);border:1px solid rgba(74,222,128,0.25);border-radius:8px;padding:0.6rem 0.8rem;">
                    <div style="font-size:0.72rem;color:#4ade80;text-transform:uppercase;letter-spacing:0.06em;">interval (subdivided)</div>
                    <div style="font-size:1.05rem;font-weight:700;color:#f1f5f9;font-family:'JetBrains Mono',monospace;">[${data.certified.lo}, ${data.certified.hi}]</div>
                    <div style="font-size:0.72rem;color:#94a3b8;">width ${data.certified.width} — ${(data.naive.width / Math.max(data.certified.width, 1e-12)).toFixed(1)}× tighter</div>
                </div>
            </div>
            <div style="margin-top:0.5rem;font-size:0.76rem;color:#94a3b8;">sampled range (4000 pts): [${data.sampled.min}, ${data.sampled.max}] — ${data.sampled.inside_certified ? 'every sample inside the interval ✓' : '<span style="color:#f87171">ESCAPED</span>'}</div>`;
    } else if (mode === 'globalmin') {
        body += `
            <div style="margin-top:0.5rem;font-size:1.15rem;font-family:'JetBrains Mono',monospace;color:#f1f5f9;">
                min f ∈ <span style="color:#4ade80;">[${data.certified.lb}, ${data.certified.ub}]</span>
                <span style="font-size:0.76rem;color:#94a3b8;">gap ${data.certified.gap}</span>
            </div>
            <div style="margin-top:0.4rem;font-size:0.76rem;color:#94a3b8;">
                ${data.boxes_processed} boxes processed · ${data.minimizer_boxes.length} minimizer region(s) survive ·
                best of 20000 samples: <span style="font-family:'JetBrains Mono',monospace;color:#f1f5f9;">${data.sampled_min}</span> (a regression check of the interval bound)
            </div>`;
    } else {
        body += `
            <div style="margin-top:0.5rem;font-size:1.15rem;font-family:'JetBrains Mono',monospace;color:#f1f5f9;">
                ∫ ∈ <span style="color:#4ade80;">[${data.certified.lo ?? '−∞'}, ${data.certified.hi ?? '+∞'}]</span>
                ${data.certified.width !== null && data.certified.width !== undefined ? `<span style="font-size:0.76rem;color:#94a3b8;">width ${data.certified.width}</span>` : ''}
            </div>
            <div style="margin-top:0.4rem;font-size:0.76rem;color:#94a3b8;">independent Simpson estimate: <span style="font-family:'JetBrains Mono',monospace;color:#22d3ee;">${data.simpson}</span> — must fall inside the bracket</div>`;
    }

    body += `
            <div style="margin-top:0.55rem;"><span style="padding:3px 11px;border-radius:10px;font-size:0.78rem;background:${tone.bg};color:${tone.c};font-weight:600;">${escapeHtml(v.verdict)}</span></div>
        </div>
        <div class="result-item" style="border-left-color:#4ade80;">
            <div class="result-label">${mode === 'globalmin' && data.heat ? 'Branch &amp; bound over the plane — grey eliminated by bounds, green undecided, gold survives' : mode === 'globalmin' ? 'The bounded search — grey strips pruned, gold strips survive' : mode === 'integral' ? 'Darboux staircase — the area is trapped between the bands' : 'Per-box interval bands around the curve'}</div>
            <canvas id="ivCanvas" width="720" height="${data.heat ? 480 : 300}" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;"></canvas>
        </div>`;
    content.innerHTML = body;
    panel.style.display = 'block';
    showSteps(data.steps);
    const cv = document.getElementById('ivCanvas');
    if (mode === 'enclose') drawIvEnclose(cv, data);
    else if (mode === 'globalmin') (data.heat ? drawIvMin2D(cv, data) : drawIvMin1D(cv, data));
    else drawIvIntegral(cv, data);
}

function ivChartFrame(canvas, xs, ys, extraLo, extraHi) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, pad = 36;
    const fin = ys.filter(t => t !== null);
    let y0 = Math.min(...fin, extraLo ?? Infinity), y1 = Math.max(...fin, extraHi ?? -Infinity);
    const span = Math.max(y1 - y0, 1e-9);
    y0 -= span * 0.12; y1 += span * 0.12;
    const x0 = xs[0], x1 = xs[xs.length - 1];
    return { ctx, W, H, pad, y0, y1, SX: x => pad + (x - x0) / (x1 - x0) * (W - 2 * pad), SY: y => H - pad - (y - y0) / (y1 - y0) * (H - 2 * pad) };
}

function ivDrawCurve(fr, xs, ys, color) {
    fr.ctx.strokeStyle = color; fr.ctx.lineWidth = 1.8; fr.ctx.setLineDash([]);
    fr.ctx.beginPath();
    let pen = false;
    for (let i = 0; i < xs.length; i++) {
        if (ys[i] === null) { pen = false; continue; }
        const X = fr.SX(xs[i]), Y = fr.SY(ys[i]);
        pen ? fr.ctx.lineTo(X, Y) : fr.ctx.moveTo(X, Y);
        pen = true;
    }
    fr.ctx.stroke();
}

function drawIvEnclose(canvas, data) {
    if (!canvas || !data.curve) return;
    const fr = ivChartFrame(canvas, data.curve.xs, data.curve.ys, data.naive.lo, data.naive.hi);
    fr.ctx.clearRect(0, 0, fr.W, fr.H);
    // naive box: wide dashed red frame
    fr.ctx.strokeStyle = 'rgba(248,113,113,0.55)'; fr.ctx.setLineDash([6, 5]); fr.ctx.lineWidth = 1.4;
    fr.ctx.strokeRect(fr.SX(data.curve.xs[0]), fr.SY(data.naive.hi), fr.SX(data.curve.xs.at(-1)) - fr.SX(data.curve.xs[0]), fr.SY(data.naive.lo) - fr.SY(data.naive.hi));
    fr.ctx.setLineDash([]);
    // certified per-piece bands
    (data.pieces || []).forEach(p => {
        fr.ctx.fillStyle = 'rgba(74,222,128,0.16)';
        fr.ctx.fillRect(fr.SX(p.x0), fr.SY(p.hi), fr.SX(p.x1) - fr.SX(p.x0), fr.SY(p.lo) - fr.SY(p.hi));
        fr.ctx.strokeStyle = 'rgba(74,222,128,0.35)'; fr.ctx.lineWidth = 0.8;
        fr.ctx.strokeRect(fr.SX(p.x0), fr.SY(p.hi), fr.SX(p.x1) - fr.SX(p.x0), fr.SY(p.lo) - fr.SY(p.hi));
    });
    ivDrawCurve(fr, data.curve.xs, data.curve.ys, 'rgba(34,211,238,0.95)');
    fr.ctx.fillStyle = '#64748b'; fr.ctx.font = '10px JetBrains Mono, monospace';
    fr.ctx.fillText('red dashed = naive single-box bound · green = per-box interval bands', fr.pad, 16);
}

function drawIvMin1D(canvas, data) {
    if (!canvas || !data.curve) return;
    const fr = ivChartFrame(canvas, data.curve.xs, data.curve.ys, data.certified.lb, null);
    fr.ctx.clearRect(0, 0, fr.W, fr.H);
    // pruned / live boxes as strips on a thin top track
    (data.trace || []).forEach(t => {
        const [bx] = t.b;
        fr.ctx.fillStyle = t.s === 'pruned' ? 'rgba(148,163,184,0.18)' : t.s === 'live' || t.s === 'converged' ? 'rgba(251,191,36,0.5)' : 'rgba(74,222,128,0.3)';
        fr.ctx.fillRect(fr.SX(bx[0]), 22, Math.max(fr.SX(bx[1]) - fr.SX(bx[0]), 1), 10);
    });
    // certified band
    fr.ctx.fillStyle = 'rgba(74,222,128,0.22)';
    fr.ctx.fillRect(fr.pad, fr.SY(data.certified.ub), fr.W - 2 * fr.pad, Math.max(fr.SY(data.certified.lb) - fr.SY(data.certified.ub), 2));
    ivDrawCurve(fr, data.curve.xs, data.curve.ys, 'rgba(34,211,238,0.95)');
    // minimizer boxes: gold strips
    (data.minimizer_boxes || []).forEach(bx => {
        fr.ctx.fillStyle = 'rgba(251,191,36,0.25)';
        fr.ctx.fillRect(fr.SX(bx[0][0]), fr.pad * 0.9, Math.max(fr.SX(bx[0][1]) - fr.SX(bx[0][0]), 2), fr.H - 2 * fr.pad);
    });
    fr.ctx.fillStyle = '#64748b'; fr.ctx.font = '10px JetBrains Mono, monospace';
    fr.ctx.fillText('top track: boxes (grey = pruned by bounds, gold = surviving) · green band: interval [lb, ub]', fr.pad, 14);
}

function drawIvMin2D(canvas, data) {
    if (!canvas || !data.heat) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, pad = 30;
    const n = data.heat.length;
    const [bx, by] = data.box;
    const SX = x => pad + (x - bx[0]) / (bx[1] - bx[0]) * (W - 2 * pad);
    const SY = y => H - pad - (y - by[0]) / (by[1] - by[0]) * (H - 2 * pad);
    ctx.clearRect(0, 0, W, H);
    // log-scaled heat of f (dark = low)
    const flat = data.heat.flat().filter(t => t !== null);
    const lo = Math.min(...flat), hi = Math.max(...flat);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const val = data.heat[j][i];
        if (val === null) continue;
        const t = Math.log(1 + (val - lo)) / Math.log(1 + (hi - lo));
        ctx.fillStyle = `rgba(${Math.round(30 + 90 * t)}, ${Math.round(40 + 60 * t)}, ${Math.round(80 + 120 * t)}, 0.85)`;
        const x = bx[0] + (bx[1] - bx[0]) * i / (n - 1), y = by[0] + (by[1] - by[0]) * j / (n - 1);
        const w = (bx[1] - bx[0]) / (n - 1), h = (by[1] - by[0]) / (n - 1);
        ctx.fillRect(SX(x - w / 2), SY(y + h / 2), SX(x + w / 2) - SX(x - w / 2) + 1, SY(y - h / 2) - SY(y + h / 2) + 1);
    }
    (data.trace || []).forEach(t => {
        const [tx, ty] = t.b;
        if (t.s === 'pruned') { ctx.strokeStyle = 'rgba(148,163,184,0.16)'; ctx.lineWidth = 0.5; }
        else { ctx.strokeStyle = 'rgba(74,222,128,0.5)'; ctx.lineWidth = 1; }
        ctx.strokeRect(SX(tx[0]), SY(ty[1]), SX(tx[1]) - SX(tx[0]), SY(ty[0]) - SY(ty[1]));
    });
    (data.minimizer_boxes || []).forEach(b => {
        const [tx, ty] = b;
        ctx.fillStyle = 'rgba(251,191,36,0.55)';
        const w = Math.max(SX(tx[1]) - SX(tx[0]), 5), h = Math.max(SY(ty[0]) - SY(ty[1]), 5);
        ctx.fillRect(SX(tx[0]) - (w < 6 ? 2 : 0), SY(ty[1]) - (h < 6 ? 2 : 0), w, h);
    });
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText('heatmap: f (dark = low) · grey boxes pruned by bounds · gold: candidate minimizer regions', pad, 14);
}

function drawIvIntegral(canvas, data) {
    if (!canvas || !data.curve) return;
    const fr = ivChartFrame(canvas, data.curve.xs, data.curve.ys, 0, null);
    fr.ctx.clearRect(0, 0, fr.W, fr.H);
    (data.segments || []).forEach(s => {
        fr.ctx.fillStyle = 'rgba(74,222,128,0.14)';
        fr.ctx.fillRect(fr.SX(s.x0), fr.SY(s.hi), fr.SX(s.x1) - fr.SX(s.x0), fr.SY(s.lo) - fr.SY(s.hi));
        fr.ctx.strokeStyle = 'rgba(74,222,128,0.4)'; fr.ctx.lineWidth = 0.7;
        fr.ctx.strokeRect(fr.SX(s.x0), fr.SY(s.hi), fr.SX(s.x1) - fr.SX(s.x0), fr.SY(s.lo) - fr.SY(s.hi));
    });
    fr.ctx.strokeStyle = 'rgba(148,163,184,0.3)';
    fr.ctx.beginPath(); fr.ctx.moveTo(fr.pad, fr.SY(0)); fr.ctx.lineTo(fr.W - fr.pad, fr.SY(0)); fr.ctx.stroke();
    ivDrawCurve(fr, data.curve.xs, data.curve.ys, 'rgba(34,211,238,0.95)');
    fr.ctx.fillStyle = '#64748b'; fr.ctx.font = '10px JetBrains Mono, monospace';
    fr.ctx.fillText(`the area is trapped between the staircase bands — ${(data.segments || []).length} adaptive segments`, fr.pad, 14);
}

// ===================== Padé approximant =====================
// Rational [L/M] from Taylor coefficients: the denominator captures poles a
// Taylor polynomial cannot represent, so the approximant keeps tracking f far
// beyond the Taylor radius of convergence.

function createPadeForm() {
    return `
        <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:0.9rem;line-height:1.5;">
            Approximate the current expression by a ratio of polynomials
            <span style="font-family:'JetBrains Mono',monospace;color:#fb923c;">P(x)/Q(x)</span> matching its Taylor series
            through order L+M. The denominator can hold <strong style="color:#f1f5f9;">poles</strong> — watch the Taylor
            polynomial diverge while the Padé curve keeps tracking f.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.7rem;">
            <div class="form-group"><label for="padeL">numerator degree L</label>
                <select id="padeL">${[0,1,2,3,4,5].map(v=>`<option value="${v}"${v===3?' selected':''}>${v}</option>`).join('')}</select></div>
            <div class="form-group"><label for="padeM">denominator degree M</label>
                <select id="padeM">${[1,2,3,4,5].map(v=>`<option value="${v}"${v===3?' selected':''}>${v}</option>`).join('')}</select></div>
            <div class="form-group"><label for="padeCenter">center</label>
                <input type="text" id="padeCenter" value="0"></div>
        </div>
        <div class="form-group">
            <label for="padeHw">plot half-width <span style="color:#64748b;font-size:0.72rem;">(blank = auto from the nearest pole)</span></label>
            <input type="text" id="padeHw" value="" placeholder="auto">
        </div>
        <div style="font-size:0.72rem;color:#64748b;">
            Odd/even functions need matching parity (tan: [3/3] ✓, cos: [2/2] ✓ but [1/1] is singular — you will get a hint).
        </div>`;
}

async function performPade() {
    const expr = document.getElementById('formula').value.trim();
    const hwRaw = document.getElementById('padeHw').value.trim();
    const body = {
        f: expr,
        variable: 'x',
        center: parseFloat(document.getElementById('padeCenter').value) || 0,
        l: parseInt(document.getElementById('padeL').value, 10),
        m: parseInt(document.getElementById('padeM').value, 10),
    };
    if (hwRaw !== '') body.half_width = parseFloat(hwRaw);
    const response = await fetch('/api/pade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    renderPade(data);
}

function renderPade(data) {
    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    const v = data.verification;
    const tone = !v.passed ? { c: '#f87171', bg: 'rgba(248,113,113,0.15)' }
        : v.exact ? { c: '#4ade80', bg: 'rgba(74,222,128,0.18)' }
        : v.spurious_poles > 0 ? { c: '#fbbf24', bg: 'rgba(251,191,36,0.16)' }
        : { c: '#4ade80', bg: 'rgba(74,222,128,0.18)' };
    setSolveFailedState(!v.passed);

    const poleRows = data.poles.map(p => {
        const isReal = Math.abs(p.im) < 1e-8;
        const label = isReal ? `x = ${p.re}` : `x = ${p.re} ${p.im >= 0 ? '+' : '−'} ${Math.abs(p.im)}i`;
        const chip = !isReal
            ? '<span style="background:rgba(167,139,250,0.18);color:#c4b5fd;padding:1px 8px;border-radius:9px;font-size:0.7rem;">complex — marks the Taylor radius</span>'
            : p.spurious
                ? '<span style="background:rgba(248,113,113,0.18);color:#f87171;padding:1px 8px;border-radius:9px;font-size:0.7rem;">SPURIOUS (Froissart artifact)</span>'
                : '<span style="background:rgba(74,222,128,0.18);color:#4ade80;padding:1px 8px;border-radius:9px;font-size:0.7rem;">genuine — f really blows up here</span>';
        return `<div style="font-family:'JetBrains Mono',monospace;font-size:0.85rem;color:#f1f5f9;margin-bottom:0.3rem;">${label} ${chip}</div>`;
    }).join('') || '<div style="color:#64748b;font-size:0.82rem;">Q has no roots — the approximant is entire.</div>';

    content.innerHTML = `
        <div class="result-item" style="border-left-color:${tone.c};">
            <div class="result-label">Padé approximant [${data.l}/${data.m}] at x = ${data.center}
                <span style="background:${tone.bg};color:${tone.c};padding:2px 10px;border-radius:10px;font-size:0.75rem;">P/Q</span></div>
            <div style="display:inline-block;background:rgba(251,146,60,0.06);border:1px solid rgba(251,146,60,0.25);border-radius:8px;padding:0.65rem 1.1rem;margin-top:0.5rem;text-align:center;">
                <div style="font-family:'JetBrains Mono',monospace;font-size:1.02rem;color:#f1f5f9;padding-bottom:4px;border-bottom:2px solid #fb923c;">${mathHtml(data.numerator)}</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:1.02rem;color:#f1f5f9;padding-top:4px;">${mathHtml(data.denominator)}</div>
            </div>
            <div style="margin-top:0.55rem;font-size:0.76rem;color:#94a3b8;">
                Taylor for contrast: <span style="font-family:'JetBrains Mono',monospace;">${mathHtml(data.taylor_string)}</span>
            </div>
            <div style="margin-top:0.55rem;display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;">
                <span style="padding:3px 11px;border-radius:10px;font-size:0.78rem;background:${tone.bg};color:${tone.c};font-weight:600;">${escapeHtml(v.verdict)}</span>
            </div>
            <div style="margin-top:0.45rem;font-size:0.76rem;color:#94a3b8;">
                residuals <span style="color:#f1f5f9;font-family:'JetBrains Mono',monospace;">${v.residual_max}</span>
                · near-center error <span style="color:#f1f5f9;font-family:'JetBrains Mono',monospace;">${v.near_center_rel_error}</span>
                · window median error: Taylor <span style="color:#fbbf24;font-family:'JetBrains Mono',monospace;">${v.median_rel_error_taylor}</span>
                vs Padé <span style="color:#4ade80;font-family:'JetBrains Mono',monospace;">${v.median_rel_error_pade}</span>
                ${v.improvement ? `· <span style="color:#4ade80;font-weight:600;">×${v.improvement} better</span>` : ''}
            </div>
        </div>
        <div class="result-item" style="border-left-color:#fb923c;">
            <div class="result-label">Taylor diverges, Padé keeps tracking
                <span style="margin-left:0.6rem;font-size:0.72rem;"><span style="color:#22d3ee;">━ f</span>&nbsp;&nbsp;<span style="color:#fbbf24;">╌ Taylor (order ${data.l + data.m})</span>&nbsp;&nbsp;<span style="color:#4ade80;">╌ Padé [${data.l}/${data.m}]</span>&nbsp;&nbsp;<span style="color:#f87171;">┊ poles of Q</span>&nbsp;&nbsp;<span style="color:#e2e8f0;">◦ center</span>&nbsp;&nbsp;<span style="color:#fbbf24;">▒ Taylor radius</span></span></div>
            <canvas id="padeChart" width="720" height="300" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;"></canvas>
        </div>
        <div class="result-item" style="border-left-color:#a78bfa;">
            <div class="result-label">Poles of the denominator — the structure Taylor cannot see</div>
            ${poleRows}
        </div>`;
    panel.style.display = 'block';
    showSteps(data.steps);
    drawPadeChart(document.getElementById('padeChart'), data);
}

// The chart's job is to make ONE thing visible: Taylor is only trustworthy
// inside the disc of convergence, and Padé is not. So it draws, besides the
// three curves:
//
//   the CENTER x = a          both series are built there, so both are exact there
//   the TAYLOR RADIUS band    |x − a| < R, R = distance from a to the nearest
//                             genuine pole (complex poles count — that is the
//                             whole point of a *radius*). Outside the band the
//                             amber curve has no reason to work, and you can
//                             watch it leave.
//   the POLES of Q            dashed, labelled, with spurious ones dimmed so a
//                             Froissart artifact is never mistaken for structure
function drawPadeChart(canvas, data) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, pad = 34;
    const s = data.samples;
    // robust y-range: percentiles of the finite f values, padded
    const fin = s.f.filter(v => v !== null).sort((a, b) => a - b);
    if (!fin.length) return;
    const p = q => fin[Math.max(0, Math.min(fin.length - 1, Math.floor(q * fin.length)))];
    let y0 = p(0.03), y1 = p(0.97);
    const span = Math.max(y1 - y0, 1e-6);
    y0 -= span * 0.35; y1 += span * 0.35;
    const x0 = s.xs[0], x1 = s.xs[s.xs.length - 1];
    const SX = x => pad + (x - x0) / (x1 - x0) * (W - 2 * pad);
    const SY = y => H - pad - (y - y0) / (y1 - y0) * (H - 2 * pad);
    const clampX = x => Math.max(pad, Math.min(W - pad, SX(x)));
    ctx.clearRect(0, 0, W, H);

    const center = Number(data.center) || 0;
    // radius of convergence = nearest pole in the COMPLEX plane, artifacts excluded
    const radii = (data.poles || [])
        .filter(pp => pp.spurious !== true)
        .map(pp => Math.hypot(pp.re - center, pp.im))
        .filter(d => isFinite(d) && d > 1e-9);
    const R = radii.length ? Math.min(...radii) : null;

    // ---- Taylor validity band, drawn first so everything else sits on top ----
    if (R !== null && center - R < x1 && center + R > x0) {
        const bl = clampX(center - R), br = clampX(center + R);
        ctx.fillStyle = 'rgba(251,191,36,0.055)';
        ctx.fillRect(bl, pad * 0.5, br - bl, H - pad * 1.0);
        ctx.strokeStyle = 'rgba(251,191,36,0.28)';
        ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
        [bl, br].forEach(bx => { ctx.beginPath(); ctx.moveTo(bx, pad * 0.5); ctx.lineTo(bx, H - pad * 0.75); ctx.stroke(); });
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(251,191,36,0.75)';
        ctx.font = '10px JetBrains Mono, monospace';
        const lbl = `Taylor radius R = ${R.toFixed(3)}`;
        const lw = ctx.measureText(lbl).width;
        if (br - bl > lw + 8) ctx.fillText(lbl, (bl + br) / 2 - lw / 2, pad * 0.5 + 11);
    }

    // ---- axes ----
    ctx.strokeStyle = 'rgba(148,163,184,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, SY(0)); ctx.lineTo(W - pad, SY(0)); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '10px JetBrains Mono, monospace';
    [y0 + span * 0.35, (y0 + y1) / 2, y1 - span * 0.35].forEach(yv => {
        const Y = SY(yv);
        ctx.strokeStyle = 'rgba(148,163,184,0.09)';
        ctx.beginPath(); ctx.moveTo(pad, Y); ctx.lineTo(W - pad, Y); ctx.stroke();
        ctx.fillText(yv.toFixed(2), 3, Y + 3);
    });

    // ---- poles ----
    (data.poles || []).filter(pp => Math.abs(pp.im) < 1e-8 && pp.re > x0 && pp.re < x1).forEach(pp => {
        const art = pp.spurious === true;
        ctx.strokeStyle = art ? 'rgba(248,113,113,0.28)' : 'rgba(248,113,113,0.6)';
        ctx.setLineDash(art ? [2, 6] : [3, 5]); ctx.lineWidth = art ? 1 : 1.4;
        const X = SX(pp.re);
        ctx.beginPath(); ctx.moveTo(X, pad * 0.5); ctx.lineTo(X, H - pad * 0.75); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = art ? 'rgba(248,113,113,0.55)' : 'rgba(248,113,113,0.95)';
        const t = art ? 'spurious' : `pole ${pp.re.toFixed(2)}`;
        ctx.fillText(t, Math.min(W - pad - ctx.measureText(t).width, X + 3), H - pad + 12);
    });

    const drawCurve = (ys, color, dash, width) => {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i < s.xs.length; i++) {
            const v = ys[i];
            if (v === null || v < y0 - 3 * span || v > y1 + 3 * span) { pen = false; continue; }
            const X = SX(s.xs[i]), Y = SY(v);
            pen ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
            pen = true;
        }
        ctx.stroke(); ctx.setLineDash([]);
    };
    drawCurve(s.taylor, 'rgba(251,191,36,0.85)', [6, 4], 1.6);
    drawCurve(s.pade, 'rgba(74,222,128,0.9)', [5, 4], 1.9);
    drawCurve(s.f, 'rgba(34,211,238,0.9)', [], 1.6);

    // ---- the center, last so it reads on top of all three curves ----
    if (center >= x0 && center <= x1) {
        const CX = SX(center);
        ctx.strokeStyle = 'rgba(226,232,240,0.5)'; ctx.lineWidth = 1.2;
        ctx.setLineDash([1, 3]);
        ctx.beginPath(); ctx.moveTo(CX, pad * 0.5); ctx.lineTo(CX, H - pad * 0.75); ctx.stroke();
        ctx.setLineDash([]);
        // dot on f(center): the one point where f, Taylor and Padé all agree
        let best = 0;
        for (let i = 1; i < s.xs.length; i++) {
            if (Math.abs(s.xs[i] - center) < Math.abs(s.xs[best] - center)) best = i;
        }
        const fv = s.f[best];
        if (fv !== null && fv >= y0 && fv <= y1) {
            const CY = SY(fv);
            ctx.fillStyle = 'rgba(15,23,42,0.9)';
            ctx.beginPath(); ctx.arc(CX, CY, 5, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.8;
            ctx.beginPath(); ctx.arc(CX, CY, 4.5, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(226,232,240,0.9)';
        ctx.font = '10px JetBrains Mono, monospace';
        const ct = `center a = ${center}`;
        const cw = ctx.measureText(ct).width;
        ctx.fillText(ct, Math.max(pad, Math.min(W - pad - cw, CX - cw / 2)), H - pad + 24);
    }

    ctx.fillStyle = '#64748b'; ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText(String(x0.toFixed(2)), pad, H - 10);
    ctx.fillText(String(x1.toFixed(2)), W - pad - 30, H - 10);
}

// ===================== SINDy — sparse identification of nonlinear dynamics =====================
// Recovers a governing ODE from trajectory data. The engine generates the truth
// trajectory, hides the equations, and the regression has to find them back.

const SINDY_PRESETS = [
    { key: 'lorenz',    name: 'Lorenz attractor',        note: 'chaotic · 3D · the classic' },
    { key: 'vanderpol', name: 'Van der Pol oscillator',  note: 'nonlinear limit cycle' },
    { key: 'pendulum',  name: 'Damped pendulum',         note: 'needs sin(x) in the library' },
    { key: 'linear2d',  name: 'Damped linear oscillator', note: 'the simplest case' },
    { key: 'cubic2d',   name: 'Cubic oscillator',        note: 'pure cubic dynamics' },
];

function createSindyForm() {
    const opts = SINDY_PRESETS.map(p =>
        `<option value="${p.key}"${p.key === 'lorenz' ? ' selected' : ''}>${escapeHtml(p.name)} — ${escapeHtml(p.note)}</option>`).join('');
    return `
        <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:0.9rem;line-height:1.5;">
            Given only a <strong style="color:#f1f5f9;">trajectory</strong>, find the differential equation that generated it.
            We fit <span style="font-family:'JetBrains Mono',monospace;color:#38bdf8;">ẋ = Θ(x)·ξ</span> over a library of candidate
            terms and force <strong style="color:#f1f5f9;">ξ to be sparse</strong> — the prior that turns a fit into a physical law.
        </div>
        <div class="form-group">
            <label for="sinSystem">System (its equations are hidden from the solver)</label>
            <select id="sinSystem" onchange="window._sindyToggleCustom()">
                ${opts}
                <option value="custom">Custom — type your own ODE</option>
            </select>
        </div>
        <div id="sinCustomBlock" style="display:none;background:rgba(56,189,248,0.05);border:1px solid rgba(56,189,248,0.2);border-radius:8px;padding:0.7rem 0.85rem;margin-bottom:0.8rem;">
            <div style="font-size:0.74rem;color:#7dd3fc;margin-bottom:0.5rem;">Autonomous system in x, y (z optional). The engine simulates it, then tries to rediscover it.</div>
            <div class="form-group"><label for="sinRhsX">dx/dt =</label><input type="text" id="sinRhsX" value="y" placeholder="y"></div>
            <div class="form-group"><label for="sinRhsY">dy/dt =</label><input type="text" id="sinRhsY" value="-4*sin(x) - 0.5*y" placeholder="-4*sin(x) - 0.5*y"></div>
            <div class="form-group"><label for="sinRhsZ">dz/dt = <span style="color:#64748b;font-size:0.72rem;">(blank for a 2-variable system)</span></label><input type="text" id="sinRhsZ" value="" placeholder=""></div>
            <div class="form-group"><label for="sinX0">initial condition (comma separated)</label><input type="text" id="sinX0" value="1, 0" placeholder="1, 0"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;">
            <div class="form-group">
                <label for="sinNoise">measurement noise: <span id="sinNoiseVal" style="color:#38bdf8;font-family:'JetBrains Mono',monospace;">0%</span></label>
                <input type="range" id="sinNoise" min="0" max="50" step="1" value="0"
                       oninput="document.getElementById('sinNoiseVal').textContent=(this.value/10)+'%'" style="width:100%;">
            </div>
            <div class="form-group">
                <label for="sinPoly">polynomial order of the library</label>
                <select id="sinPoly"><option value="">auto</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;">
            <div class="form-group">
                <label for="sinThr">sparsity threshold λ <span style="color:#64748b;font-size:0.72rem;">(blank = auto)</span></label>
                <input type="text" id="sinThr" value="" placeholder="auto">
            </div>
            <div class="form-group" style="display:flex;align-items:center;padding-top:1.2rem;">
                <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.82rem;">
                    <input type="checkbox" id="sinTrig"> include sin/cos in the library
                </label>
            </div>
        </div>
        <div style="font-size:0.72rem;color:#64748b;margin-top:0.3rem;">
            Raise λ for a sparser (simpler) model; too high and real terms get pruned. The result is verified against the true
            vector field — an oracle the regression never sees.
        </div>`;
}

window._sindyToggleCustom = function () {
    const isCustom = document.getElementById('sinSystem').value === 'custom';
    document.getElementById('sinCustomBlock').style.display = isCustom ? '' : 'none';
    if (isCustom) document.getElementById('sinTrig').checked = true;
};

async function performSindy() {
    const sys = document.getElementById('sinSystem').value;
    const thrRaw = document.getElementById('sinThr').value.trim();
    const polyRaw = document.getElementById('sinPoly').value;
    const body = {
        system: sys,
        noise: parseFloat(document.getElementById('sinNoise').value) / 1000,
        use_trig: document.getElementById('sinTrig').checked,
    };
    if (thrRaw !== '') body.threshold = parseFloat(thrRaw);
    if (polyRaw !== '') body.poly_order = parseInt(polyRaw, 10);
    if (sys === 'custom') {
        const rz = document.getElementById('sinRhsZ').value.trim();
        const rhs = [document.getElementById('sinRhsX').value.trim(),
                     document.getElementById('sinRhsY').value.trim()];
        const vars = ['x', 'y'];
        if (rz !== '') { rhs.push(rz); vars.push('z'); }
        if (rhs.some(r => r === '')) throw new Error('Every equation needs a right-hand side.');
        body.rhs = rhs;
        body.vars = vars;
        const x0 = document.getElementById('sinX0').value.split(',').map(s => parseFloat(s.trim()));
        if (x0.length === vars.length && x0.every(v => isFinite(v))) body.x0 = x0;
    }
    const response = await fetch('/api/sindy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    renderSindy(data);
}

const sindyAnim = { stop: null };

function renderSindy(data) {
    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    const v = data.verification;
    const exact = v.verdict.startsWith('EXACT');
    const tone = !v.passed ? { c: '#f87171', bg: 'rgba(248,113,113,0.15)' }
        : exact ? { c: '#4ade80', bg: 'rgba(74,222,128,0.18)' }
        : { c: '#fbbf24', bg: 'rgba(251,191,36,0.16)' };
    setSolveFailedState(!v.passed);
    if (sindyAnim.stop) { sindyAnim.stop(); sindyAnim.stop = null; }

    const eqRows = data.equations.map(eq => `
        <div style="margin-bottom:0.55rem;">
            <div style="font-family:'JetBrains Mono',monospace;font-size:1.02rem;color:#f1f5f9;">
                <span style="color:#38bdf8;">d${escapeHtml(eq.variable)}/dt</span> = ${mathHtml(eq.expression)}
            </div>
            <div style="font-size:0.76rem;color:#64748b;margin-top:1px;">
                true: <span style="font-family:'JetBrains Mono',monospace;">${mathHtml(eq.truth)}</span>
            </div>
        </div>`).join('');

    const anySpurious = data.equations.some(e => e.terms.some(t => t.spurious));
    const termRows = data.equations.map(eq => eq.terms.map(t => `
        <tr>
            <td style="padding:3px 8px;color:#94a3b8;font-family:'JetBrains Mono',monospace;">d${escapeHtml(eq.variable)}/dt</td>
            <td style="padding:3px 8px;font-family:'JetBrains Mono',monospace;color:${t.spurious ? '#f87171' : '#f1f5f9'};">${mathHtml(t.name)}${t.spurious ? ' <span style="font-size:0.68rem;">spurious</span>' : ''}</td>
            <td style="padding:3px 8px;text-align:right;font-family:'JetBrains Mono',monospace;color:#38bdf8;">${t.coefficient}</td>
            <td style="padding:3px 8px;text-align:right;font-family:'JetBrains Mono',monospace;color:#64748b;">${t.true_coefficient === null || t.true_coefficient === undefined ? '—' : t.true_coefficient}</td>
        </tr>`).join('')).join('');

    const nvars = data.variables.length;
    content.innerHTML = `
        <div class="result-item" style="border-left-color:${tone.c};">
            <div class="result-label">Discovered governing equation — ${escapeHtml(data.label)}
                <span style="background:${tone.bg};color:${tone.c};padding:2px 10px;border-radius:10px;font-size:0.75rem;">SINDy</span></div>
            <div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.22);border-radius:8px;padding:0.75rem 0.9rem;margin-top:0.5rem;">
                ${eqRows}
            </div>
            <div style="margin-top:0.6rem;display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;">
                <span style="padding:3px 11px;border-radius:10px;font-size:0.78rem;background:${tone.bg};color:${tone.c};font-weight:600;">${escapeHtml(v.verdict)}</span>
                <span style="font-size:0.76rem;color:#94a3b8;">${escapeHtml(data.sparsity)} · library of ${data.library_size} candidates</span>
            </div>
            <div style="margin-top:0.45rem;font-size:0.76rem;color:#94a3b8;">
                vector-field error <span style="color:#f1f5f9;font-family:'JetBrains Mono',monospace;">${fmtSindyErr(v.field_rel_error)}</span>
                · re-simulation error <span style="color:#f1f5f9;font-family:'JetBrains Mono',monospace;">${fmtSindyErr(v.trajectory_rel_error)}</span>
                ${data.noise > 0 ? `· noise <span style="color:#fbbf24;">${(data.noise * 100).toFixed(1)}%</span>` : ''}
            </div>
            ${v.chaotic ? `<div style="margin-top:0.4rem;font-size:0.73rem;color:#64748b;font-style:italic;">
                Chaotic system: nearby trajectories separate exponentially even for a perfect model, so the re-simulation
                error is corroboration only — the vector-field check carries the verdict.</div>` : ''}
        </div>

        <div class="result-item" style="border-left-color:#38bdf8;">
            <div class="result-label">Phase portrait — ${nvars >= 3 ? 'the attractor, drag to rotate' : 'trajectory in phase space'}
                <span style="margin-left:0.6rem;font-size:0.72rem;"><span style="color:#22d3ee;">━ true</span>&nbsp;&nbsp;<span style="color:#4ade80;">╌ re-simulated from the discovered model</span>${data.trajectory.measured ? '&nbsp;&nbsp;<span style="color:#fbbf24;">· noisy samples</span>' : ''}</span></div>
            <canvas id="sinPhase" width="720" height="${nvars >= 3 ? 380 : 300}" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;${nvars >= 3 ? 'cursor:grab;touch-action:none;' : ''}"></canvas>
        </div>

        <div class="result-item" style="border-left-color:#4ade80;">
            <div class="result-label">Time series — the discovered model re-integrated against the truth</div>
            <canvas id="sinTime" width="720" height="220" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;"></canvas>
        </div>

        <div class="result-item" style="border-left-color:#a78bfa;">
            <div class="result-label">Active coefficients — every other candidate in the library was driven to exactly zero${anySpurious ? ' <span style="color:#f87171;font-size:0.75rem;">(terms not in the true equation are flagged)</span>' : ''}</div>
            <table style="width:100%;font-size:0.82rem;border-collapse:collapse;">
                <tr><th style="text-align:left;padding:3px 8px;color:#a78bfa;font-size:0.72rem;text-transform:uppercase;">equation</th>
                    <th style="text-align:left;padding:3px 8px;color:#a78bfa;font-size:0.72rem;text-transform:uppercase;">term</th>
                    <th style="text-align:right;padding:3px 8px;color:#a78bfa;font-size:0.72rem;text-transform:uppercase;">found</th>
                    <th style="text-align:right;padding:3px 8px;color:#a78bfa;font-size:0.72rem;text-transform:uppercase;">true</th></tr>
                ${termRows}
            </table>
        </div>`;
    panel.style.display = 'block';
    showSteps(data.steps);

    const tr = data.trajectory;
    if (nvars >= 3) {
        sindyAnim.stop = initCurve3D(document.getElementById('sinPhase'), [
            { pts: tr.truth, color: 'rgba(34,211,238,0.75)', width: 1.3 },
            { pts: tr.recovered, color: 'rgba(74,222,128,0.95)', width: 2.2, dash: [7, 5] },
        ]);
    } else {
        drawPhase2D(document.getElementById('sinPhase'), tr);
    }
    drawSindyTime(document.getElementById('sinTime'), tr);
}

function fmtSindyErr(e) {
    if (e === null || e === undefined || !isFinite(e)) return '∞';
    return e < 1e-10 ? '<1e-10' : e.toExponential(2);
}

// --- 2D phase portrait -------------------------------------------------------
function drawPhase2D(canvas, tr) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, pad = 34;
    const sets = [tr.truth, tr.recovered].filter(Boolean);
    if (!sets.length) return;
    const all = sets.flat();
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sx = v => pad + (v - x0) / Math.max(x1 - x0, 1e-9) * (W - 2 * pad);
    const sy = v => H - pad - (v - y0) / Math.max(y1 - y0, 1e-9) * (H - 2 * pad);
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(148,163,184,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, sy(0)); ctx.lineTo(W - pad, sy(0));
    ctx.moveTo(sx(0), pad); ctx.lineTo(sx(0), H - pad); ctx.stroke();
    if (tr.measured) {
        ctx.fillStyle = 'rgba(251,191,36,0.5)';
        tr.measured.forEach(p => { ctx.beginPath(); ctx.arc(sx(p[0]), sy(p[1]), 1.2, 0, 6.284); ctx.fill(); });
    }
    const line = (pts, color, dash, width) => {
        if (!pts || !pts.length) return;
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
        ctx.beginPath();
        pts.forEach((p, i) => i ? ctx.lineTo(sx(p[0]), sy(p[1])) : ctx.moveTo(sx(p[0]), sy(p[1])));
        ctx.stroke(); ctx.setLineDash([]);
    };
    line(tr.truth, 'rgba(34,211,238,0.9)', [], 1.6);
    line(tr.recovered, 'rgba(74,222,128,0.85)', [5, 4], 1.6);
    ctx.fillStyle = '#64748b'; ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText(tr.variables[0], W - pad + 4, sy(0) + 4);
    ctx.fillText(tr.variables[1], sx(0) - 4, pad - 6);
}

// --- time series -------------------------------------------------------------
function drawSindyTime(canvas, tr) {
    if (!canvas || !tr.t || !tr.t.length) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, pad = 30;
    const n = tr.variables.length;
    const all = tr.truth.flat().concat((tr.recovered || []).flat()).filter(isFinite);
    const lo = Math.min(...all), hi = Math.max(...all);
    const t0 = tr.t[0], t1 = tr.t[tr.t.length - 1];
    const sx = t => pad + (t - t0) / Math.max(t1 - t0, 1e-9) * (W - 2 * pad);
    const sy = y => H - pad - (y - lo) / Math.max(hi - lo, 1e-9) * (H - 2 * pad);
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(148,163,184,0.3)';
    ctx.beginPath(); ctx.moveTo(pad, sy(0)); ctx.lineTo(W - pad, sy(0)); ctx.stroke();
    const palette = ['#22d3ee', '#a78bfa', '#f472b6'];
    for (let j = 0; j < n; j++) {
        ctx.strokeStyle = palette[j % 3]; ctx.lineWidth = 1.5; ctx.setLineDash([]);
        ctx.beginPath();
        tr.truth.forEach((p, i) => i ? ctx.lineTo(sx(tr.t[i]), sy(p[j])) : ctx.moveTo(sx(tr.t[i]), sy(p[j])));
        ctx.stroke();
        if (tr.recovered && tr.recovered.length) {
            ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]);
            ctx.beginPath();
            tr.recovered.forEach((p, i) => i ? ctx.lineTo(sx(tr.t[i]), sy(p[j])) : ctx.moveTo(sx(tr.t[i]), sy(p[j])));
            ctx.stroke(); ctx.setLineDash([]);
        }
    }
    ctx.fillStyle = '#64748b'; ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText('t = ' + t0, pad, H - 8);
    ctx.fillText(String(t1), W - pad - 20, H - 8);
}

// --- 3D curve (the attractor), drag to rotate --------------------------------
// The fit is computed over a FULL turn at the current pitch, so the figure fills
// the canvas without "breathing" as it spins. Scaling off the raw 3D extent is
// not enough: in Lorenz x and y are strongly correlated, so some yaw angles
// project the attractor almost edge-on and it collapses to a sliver.
function computeCurve3DFit(curves, W, H, pitch) {
    const all = curves.flatMap(c => c.pts || []);
    if (!all.length) return null;
    const mid = k => { let lo = Infinity, hi = -Infinity; for (const p of all) { if (p[k] < lo) lo = p[k]; if (p[k] > hi) hi = p[k]; } return (lo + hi) / 2; };
    const cx3 = mid(0), cy3 = mid(1), cz3 = mid(2);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    let hw = 1e-9, hh = 1e-9;
    for (let k = 0; k < 36; k++) {
        const yaw = k * Math.PI / 18, cosY = Math.cos(yaw), sinY = Math.sin(yaw);
        for (const p of all) {
            const x = p[0] - cx3, y = p[1] - cy3, z = p[2] - cz3;
            const x1 = x * cosY - y * sinY, y1 = x * sinY + y * cosY;
            const z2 = y1 * sinP + z * cosP;
            const ax = Math.abs(x1), az = Math.abs(z2);
            if (ax > hw) hw = ax;
            if (az > hh) hh = az;
        }
    }
    return { cx3, cy3, cz3, scale: Math.min(0.46 * W / hw, 0.46 * H / hh) };
}

function drawCurve3D(canvas, curves, yaw, pitch, fit) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    if (!fit) fit = computeCurve3DFit(curves, W, H, pitch);
    if (!fit) return;
    const { cx3, cy3, cz3, scale } = fit;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw), cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    ctx.clearRect(0, 0, W, H);
    curves.forEach(c => {
        if (!c.pts || !c.pts.length) return;
        ctx.strokeStyle = c.color;
        ctx.lineWidth = c.width || 1.2;
        ctx.setLineDash(c.dash || []);
        ctx.beginPath();
        for (let i = 0; i < c.pts.length; i++) {
            const p = c.pts[i];
            const x = p[0] - cx3, y = p[1] - cy3, z = p[2] - cz3;
            const x1 = x * cosY - y * sinY, y1 = x * sinY + y * cosY;
            const z2 = y1 * sinP + z * cosP;
            const X = W / 2 + x1 * scale, Y = H / 2 - z2 * scale;
            i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    });
}

function initCurve3D(canvas, curves) {
    if (!canvas) return null;
    // yaw 0 / small pitch is the classic x-z view — for Lorenz, the butterfly.
    const st = { yaw: 0, pitch: 0.12, dragging: false, alive: true };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let fit = computeCurve3DFit(curves, canvas.width, canvas.height, st.pitch);
    let fitPitch = st.pitch;
    let lx = 0, ly = 0, lastIdlePaint = 0;
    trackAnimatedCanvas(canvas);
    canvas.addEventListener('pointerdown', e => { st.dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
        if (!st.dragging) return;
        st.yaw += (e.clientX - lx) * 0.01;
        st.pitch = Math.max(-1.5, Math.min(1.5, st.pitch + (e.clientY - ly) * 0.01));
        lx = e.clientX; ly = e.clientY;
    });
    canvas.addEventListener('pointerup', () => { st.dragging = false; });
    drawCurve3D(canvas, curves, st.yaw, st.pitch, fit);   // synchronous first paint
    const frame = (now) => {
        if (!st.alive || !canvas.isConnected) { st.alive = false; releaseAnimatedCanvas(canvas); return; }
        if (!animatedCanvasCanPaint(canvas)) { requestAnimationFrame(frame); return; }
        if (!st.dragging && now - lastIdlePaint < 1000 / 30) { requestAnimationFrame(frame); return; }
        lastIdlePaint = now;
        // Preserve the original angular speed while idle paints are capped at 30 Hz.
        if (!reduce && !st.dragging) st.yaw += 0.006;
        if (Math.abs(st.pitch - fitPitch) > 0.05) {         // refit only when the tilt really changed
            fit = computeCurve3DFit(curves, canvas.width, canvas.height, st.pitch);
            fitPitch = st.pitch;
        }
        drawCurve3D(canvas, curves, st.yaw, st.pitch, fit);
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return () => { st.alive = false; };
}

function showModal(title, body) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = body;
    document.getElementById('modalSubmit').style.display = '';   // launcher hides this; restore by default
    document.getElementById('opModal').classList.add('active');
}

// ---- Experimental launcher: one card opens a small window of sub-tools ----
const EXPERIMENTAL_TOOLS = [
    { key: 'lebesgue', icon: '∫μ', title: 'Lebesgue Integral', sub: 'partition the RANGE (layer cake)', color: '#e879f9',
      needsFormula: true, modalTitle: 'Lebesgue Integral [EXPERIMENTAL]', form: () => createLebesgueForm(),
      desc: '∫f dμ = ∫μ({f>t})dt — horizontal slabs, cross-checked against Riemann.' },
    { key: 'vector', icon: '∮F·dr', title: 'Line Integral + Green', sub: '2D work / flux / circulation', color: '#67e8f9',
      modalTitle: 'Line Integral + Green [EXPERIMENTAL]', form: () => createVectorForm(),
      desc: "∮F·dr & ∮F·n ds with Green's / divergence theorem and parameter sweeps." },
    { key: 'surface', icon: '∬·dS', title: 'Surface / Stokes / Gauss', sub: '3D flux, both theorems', color: '#2dd4bf',
      modalTitle: 'Surface Integral — Stokes / Gauss [EXPERIMENTAL]', form: () => createSurfaceForm(),
      desc: '∬F·dS on a parametric surface; Stokes & Gauss verified two ways.' },
    { key: 'leibniz', icon: 'd/dt∫', title: 'Leibniz 1D', sub: 'moving interval [a(t), b(t)]', color: '#5eead4',
      modalTitle: 'Leibniz Rule — moving domain [EXPERIMENTAL]', form: () => createLeibnizForm(),
      desc: 'd/dt ∫ₐ(t)ᵇ⁽ᵗ⁾ f dx = boundary motion + bulk, animated.' },
    { key: 'leibniz2d', icon: 'd/dt∬', title: 'Leibniz 2D', sub: 'moving area Ω(t) — disk / ellipse', color: '#34d399',
      modalTitle: 'Leibniz 2D — moving area [EXPERIMENTAL]', form: () => createLeibnizNDForm(2),
      desc: 'd/dt ∬_Ω f dA = bulk + boundary line integral, over a deforming region.' },
    { key: 'leibniz3d', icon: 'd/dt∭', title: 'Leibniz 3D', sub: 'deforming ellipsoid Ω(t)', color: '#a78bfa',
      modalTitle: 'Leibniz 3D — deforming volume [EXPERIMENTAL]', form: () => createLeibnizNDForm(3),
      desc: 'd/dt ∭_Ω f dV over an ellipsoid with axes a(t), b(t), c(t).' },
    { key: 'reynolds', icon: '∂ₜ∭', title: 'Reynolds Transport', sub: 'physics framing: sphere + vₚ', color: '#c084fc',
      modalTitle: 'Reynolds Transport 3D — deforming volume [EXPERIMENTAL]', form: () => createReynoldsForm(),
      desc: 'd/dt ∭ f dV with the velocity-field (vₚ·n) boundary term and surface quadrature.' },
];

function showExperimentalLauncher() {
    const cards = EXPERIMENTAL_TOOLS.map(t => `
        <button class="exp-card" type="button" onclick="window._openExp('${t.key}')" style="--c:${t.color}">
            <span class="exp-card-icon">${escapeHtml(t.icon)}</span>
            <span class="exp-card-text">
                <span class="exp-card-title">${escapeHtml(t.title)}</span>
                <span class="exp-card-sub">${escapeHtml(t.sub)}</span>
                <span class="exp-card-desc">${escapeHtml(t.desc)}</span>
            </span>
        </button>`).join('');
    showModal('Field Theorems & Moving Domains', `<div class="exp-launcher">${cards}</div>
        <div style="font-size:0.74rem;color:#64748b;margin-top:0.7rem;">All numeric and EXPERIMENTAL — each verifies its theorem two independent ways. Pick a tool.</div>`);
    document.getElementById('modalSubmit').style.display = 'none';
}

window.showExperimentalLauncher = showExperimentalLauncher;
window._openExp = function (key) {
    const tool = EXPERIMENTAL_TOOLS.find(t => t.key === key);
    if (!tool) return;
    let body = tool.form();
    if (tool.needsFormula && !state.currentExpressionId) {
        body = `<div style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:8px;padding:0.6rem 0.8rem;margin-bottom:0.8rem;font-size:0.82rem;color:#fcd34d;">Parse a formula in the top input first — this tool integrates the current expression over [a, b].</div>` + body;
    }
    const back = `<button type="button" class="btn-secondary" style="font-size:0.72rem;padding:2px 12px;margin-bottom:0.8rem;" onclick="window.showExperimentalLauncher()">← all tools</button>`;
    document.getElementById('modalTitle').textContent = tool.modalTitle;
    document.getElementById('modalBody').innerHTML = back + body;
    document.getElementById('modalSubmit').style.display = '';
};

function closeModal() {
    document.getElementById('opModal').classList.remove('active');
}

async function executeModalOperation() {
    const operation = document.getElementById('modalTitle').textContent.toLowerCase();
    // Some tools (equation discovery, transport, surfaces) run for seconds — and
    // many seconds under ruby.wasm — so show the button as busy rather than
    // letting the dialog sit there looking frozen.
    const submitBtn = document.getElementById('modalSubmit');
    const submitLabel = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Working…';
        submitBtn.style.opacity = '0.7';
    }
    try {
        if (operation.includes('derivative')) {
            await performDerivative();
        } else if (operation.includes('integration')) {
            await performIntegration();
        } else if (operation.includes('simplify')) {
            await performSimplify();
        } else if (operation.includes('evaluate')) {
            await performEvaluate();
        } else if (operation.includes('grad')) {
            await performVectorOp();
        } else if (operation.includes('differential')) {
            await performDifferential();
        } else if (operation.includes('taylor')) {
            await performSeries('taylor');
        } else if (operation.includes('laurent')) {
            await performSeries('laurent');
        } else if (operation.includes('lebesgue')) {
            await performLebesgue();
        } else if (operation.includes('line integral')) {
            await performVectorIntegral();
        } else if (operation.includes('surface')) {
            await performSurfaceIntegral();
        } else if (operation.includes('leibniz 2d')) {
            await performLeibnizND(2);
        } else if (operation.includes('leibniz 3d')) {
            await performLeibnizND(3);
        } else if (operation.includes('leibniz')) {
            await performLeibniz();
        } else if (operation.includes('reynolds')) {
            await performReynolds();
        } else if (operation.includes('definite')) {
            await performDefiniteIntegral();
        } else if (operation.includes('residue')) {
            await performDefiniteIntegral();  // Same API, residue is auto-detected server-side
        } else if (operation.includes('discovery')) {
            await performSindy();
        } else if (operation.includes('padé') || operation.includes('pade')) {
            await performPade();
        } else if (operation.includes('certified')) {
            await performInterval();
        } else if (operation.includes('relativity')) {
            await performGR();
        } else if (operation.includes('exact arithmetic')) {
            await performExact();
        }

        closeModal();
    } catch (error) {
        showError(error.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitLabel;
            submitBtn.style.opacity = '';
        }
    }
}

// Operation Forms — auto-detect variables, color-coded chips

function createVarSelector(id, multi) {
    const vars = extractVarsFromFormula();
    const defaultVar = vars.includes('x') ? 'x' : (vars[0] || 'x');
    if (!multi) {
        // Single-select: clickable chips, one active at a time
        const chips = vars.map((v, i) => {
            const sel = v === defaultVar;
            return varChipHTML(v, i, sel, `window._selectVar('${id}','${v}')`);
        }).join(' ');
        return `<input type="hidden" id="${id}" value="${defaultVar}" />
            <div style="margin-bottom:4px;color:#94a3b8;font-size:0.8rem;">Variable:</div>
            <div id="${id}_chips" style="display:flex;gap:8px;flex-wrap:wrap;">${chips}</div>`;
    } else {
        // Multi-select: click to toggle
        const chips = vars.map((v, i) => {
            return varChipHTML(v, i, true, `window._toggleVar('${id}','${v}')`);
        }).join(' ');
        return `<input type="hidden" id="${id}" value="${vars.join(' ')}" />
            <div style="margin-bottom:4px;color:#94a3b8;font-size:0.8rem;">Variables (click to toggle):</div>
            <div id="${id}_chips" style="display:flex;gap:8px;flex-wrap:wrap;">${chips}</div>`;
    }
}

// Global handlers for chip clicks
window._selectVar = function(id, v) {
    document.getElementById(id).value = v;
    const vars = extractVarsFromFormula();
    const container = document.getElementById(id + '_chips');
    container.innerHTML = vars.map((vv, i) => varChipHTML(vv, i, vv === v, `window._selectVar('${id}','${vv}')`)).join(' ');
};

window._toggleVar = function(id, v) {
    const input = document.getElementById(id);
    let selected = input.value.split(/\s+/).filter(Boolean);
    if (selected.includes(v)) {
        selected = selected.filter(s => s !== v);
    } else {
        selected.push(v);
    }
    input.value = selected.join(' ');
    const vars = extractVarsFromFormula();
    const container = document.getElementById(id + '_chips');
    container.innerHTML = vars.map((vv, i) => varChipHTML(vv, i, selected.includes(vv), `window._toggleVar('${id}','${vv}')`)).join(' ');
};

function createDerivativeForm() {
    return createVarSelector('opInput', false);
}

function createIntegrationForm() {
    return createVarSelector('opInput', false);
}

function createSimplifyForm() {
    return `<label>
            <input type="checkbox" id="opExperimental" />
            Use experimental simplification (more aggressive)
        </label>`;
}

function createEvaluateForm() {
    const vars = extractVarsFromFormula();
    const fields = vars.map((v, i) => {
        const c = VAR_COLORS[i % VAR_COLORS.length];
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <span style="color:${c};font-family:'JetBrains Mono',monospace;font-weight:700;font-size:1.1rem;min-width:24px;">${v}</span>
            <span style="color:#64748b;">=</span>
            <input type="number" step="any" class="eval-var-input" data-var="${v}" placeholder="0" style="flex:1;padding:8px 12px;background:rgba(255,255,255,0.06);border:1.5px solid ${c}40;border-radius:10px;color:${c};font-family:'JetBrains Mono',monospace;font-size:0.95rem;" />
        </div>`;
    }).join('');
    return `<div style="margin-bottom:4px;color:#94a3b8;font-size:0.8rem;">Assign values:</div>${fields}`;
}

// Grad / Div / Curl / Laplacian share one self-contained dialog. The design is
// driven entirely by the operators' SIGNATURES, because that is what an earlier
// build got wrong:
//
//   grad ∇f   scalar → vector      div  ∇·F   vector → scalar
//   lap  ∇²f  scalar → scalar      curl ∇×F   vector → vector (3D) / scalar (2D)
//
// div and curl consume a whole vector field, so the dialog asks for one component
// per axis. It used to default F to ∇f instead, which silently turned "divergence"
// into the Laplacian — a different operator, correctly computed, that nobody asked
// for. The Laplacian is now its own mode, and F is always exactly what is typed.
// "Fill from ∇f" is still one click away, but it writes the components into the
// boxes where you can see and edit them rather than substituting them behind you.
//
// Dimension is a slider, and it gates the modes. grad, div and the Laplacian are
// defined for every n (at n = 1 they collapse to f′, F′ and f″, which is worth
// showing rather than forbidding). Curl is the exception: it is the antisymmetric
// part of the derivative, with n(n−1)/2 components — 0 at n = 1, 1 at n = 2 (a
// scalar), 3 at n = 3 (the only n where it is a vector), 6 at n = 4 (a bivector).
// So curl is offered at n = 2 and n = 3 and disabled elsewhere, with the reason.
const VC_MAX_DIM = 6;
const VC_AXIS_NAMES = ['x', 'y', 'z', 'w', 'u', 'v'];
const VC_SCALAR_IN = ['gradient', 'laplacian'];
const VC_MODE_LABEL = {
    gradient: ['∇f', 'Gradient', 'scalar → vector'],
    divergence: ['∇·F', 'Divergence', 'vector → scalar'],
    curl: ['∇×F', 'Curl', 'vector → vector (3D) / scalar (2D)'],
    laplacian: ['∇²f', 'Laplacian', 'scalar → scalar'],
};
// mirrors VectorFieldOps::RESERVED — names the parser consumes before any
// variable lookup, so the dialog can refuse them before a round trip
const VC_RESERVED = ['pi', 'e', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
    'sinh', 'cosh', 'tanh', 'sech', 'csch', 'coth', 'asinh', 'arcsinh', 'acosh',
    'arccosh', 'atanh', 'arctanh', 'arcsin', 'arccos', 'arctan', 'ln', 'exp',
    'abs', 'sqrt', 'erf', 'si', 'ci', 'ei', 'li', 'fresnels', 'fresnelc'];

// why curl cannot be offered at this n, or null if it can
function vcCurlBlocker(n) {
    if (n === 2 || n === 3) return null;
    if (n < 2) return 'in 1D the antisymmetric derivative has no components at all';
    return `in ${n}D it has ${n * (n - 1) / 2} components — a bivector, not a vector`;
}

function createGradientForm() {
    const seeded = extractVarsFromFormula();
    const n = Math.min(Math.max(seeded.length || 3, 1), VC_MAX_DIM);
    const modeOpts = Object.entries(VC_MODE_LABEL).map(([k, [sym, name, arity]]) =>
        `<option value="${k}">${sym} — ${name} (${arity})</option>`).join('');
    return `
        <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:0.8rem;line-height:1.5;">
            Four operators built from the same exact symbolic partials. Two take a
            <span style="color:#c8bfe8;">scalar</span> (∇f, ∇²f) and two take a
            <span style="color:#c8bfe8;">vector field</span> (∇·F, ∇×F) — the dialog asks for whichever the
            operator actually consumes. This tool ignores the input bar unless you tell it not to.
        </div>

        <div class="form-group">
            <label for="vcDim">dimension <span id="vcDimVal" style="color:#c4b5fd;font-family:'JetBrains Mono',monospace;">${n}</span></label>
            <input type="range" id="vcDim" min="1" max="${VC_MAX_DIM}" step="1" value="${n}"
                   oninput="window._vcDim()" style="width:100%;">
            <div id="vcAxes" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:0.4rem;"></div>
        </div>

        <div class="form-group">
            <label for="vcMode">operator</label>
            <select id="vcMode" onchange="window._vcSync()">${modeOpts}</select>
        </div>

        <div id="vcScalarWrap" style="background:rgba(167,139,250,0.05);border:1px solid rgba(167,139,250,0.2);border-radius:8px;padding:0.7rem 0.85rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
                <span style="font-size:0.74rem;color:#c4b5fd;">the scalar field f</span>
                <button type="button" onclick="window._vcFromBar()"
                        style="font-size:0.68rem;padding:2px 8px;border-radius:8px;cursor:pointer;background:rgba(148,163,184,0.12);border:1px solid rgba(148,163,184,0.3);color:#cbd5e1;">use the input bar</button>
            </div>
            <div class="form-group" style="margin:0;"><label for="vcScalar">f =</label>
                <input type="text" id="vcScalar" value="x^2 + y^2"></div>
        </div>

        <div id="vcFieldWrap" style="display:none;background:rgba(167,139,250,0.05);border:1px solid rgba(167,139,250,0.2);border-radius:8px;padding:0.7rem 0.85rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
                <span style="font-size:0.74rem;color:#c4b5fd;">the vector field F — one component per axis</span>
                <button type="button" onclick="window._vcFillFromGrad()"
                        style="font-size:0.68rem;padding:2px 8px;border-radius:8px;cursor:pointer;background:rgba(148,163,184,0.12);border:1px solid rgba(148,163,184,0.3);color:#cbd5e1;"
                        title="Compute ∇f from the input bar and write it into these boxes, where you can still edit it. Handy for the identities: ∇·(∇f) is the Laplacian and ∇×(∇f) is zero.">fill from ∇f</button>
            </div>
            <div id="vcComps"></div>
            <div id="vcTry" style="font-size:0.7rem;color:#64748b;margin-top:0.3rem;"></div>
        </div>

        <div id="vcHint" style="font-size:0.75rem;line-height:1.5;margin-top:0.6rem;"></div>`;
}

// the axis-name boxes; rebuilt when the dimension changes, keeping typed names
function vcRebuildAxes(n) {
    const host = document.getElementById('vcAxes');
    if (!host) return;
    const kept = [];
    host.querySelectorAll('input[data-vc-axis]').forEach(el => { kept[Number(el.dataset.vcAxis)] = el.value; });
    const seeded = extractVarsFromFormula();
    host.innerHTML = Array.from({ length: n }, (_, i) => {
        const val = kept[i] !== undefined ? kept[i] : (seeded[i] || VC_AXIS_NAMES[i] || `x${i + 1}`);
        return `<input type="text" data-vc-axis="${i}" value="${escapeHtml(val)}" oninput="window._vcSync()"
                       style="width:3.2rem;padding:4px 8px;background:rgba(255,255,255,0.06);border:1.5px solid rgba(167,139,250,0.3);border-radius:8px;color:#c4b5fd;font-family:'JetBrains Mono',monospace;font-size:0.85rem;text-align:center;">`;
    }).join('');
}

function vcVarList() {
    const els = [...document.querySelectorAll('#vcAxes input[data-vc-axis]')];
    const vars = els.map(el => el.value.trim()).filter(Boolean);
    return vars.length ? vars : ['x'];
}

// One component input per axis. Values are carried across BY POSITION, not by
// axis name: keying on the name meant that renaming y to b found no saved value
// and silently replaced what the user had typed with a default.
function vcRebuildComponents(vars) {
    const host = document.getElementById('vcComps');
    if (!host) return;
    const kept = [];
    host.querySelectorAll('input[data-vc-idx]').forEach(el => { kept[Number(el.dataset.vcIdx)] = el.value; });
    host.innerHTML = vars.map((v, i) => {
        const val = kept[i] !== undefined ? kept[i] : '0';
        return `<div class="form-group" style="margin-bottom:0.4rem;"><label for="vcC${i}">F_${escapeHtml(v)} =</label>
                <input type="text" id="vcC${i}" data-vc-idx="${i}" value="${escapeHtml(val)}"></div>`;
    }).join('');
}

window._vcDim = function () {
    const n = Number(document.getElementById('vcDim').value);
    const out = document.getElementById('vcDimVal');
    if (out) out.textContent = n;
    vcRebuildAxes(n);
    window._vcSync();
};

// copy the input bar into the scalar box
window._vcFromBar = function () {
    const src = (document.getElementById('formula')?.value || '').trim();
    const box = document.getElementById('vcScalar');
    if (box && src) box.value = src;
    window._vcSync();
};

// Write ∇f into the component boxes. Deliberately a visible action rather than a
// hidden default: after this the field on screen IS the field being used, and it
// can be edited. Also the honest way to demo ∇·(∇f) = ∇²f and ∇×(∇f) = 0.
window._vcFillFromGrad = async function () {
    const vars = vcVarList();
    const f = (document.getElementById('vcScalar')?.value || document.getElementById('formula')?.value || '').trim();
    const hint = document.getElementById('vcHint');
    if (!f) { if (hint) hint.innerHTML = '<span style="color:#fca5a5;">type a scalar f first (or click “use the input bar”)</span>'; return; }
    try {
        const r = await fetch('/api/vectorop', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'gradient', expression: f, variables: vars })
        }).then(x => x.json());
        if (r.error) throw new Error(r.error);
        vcRebuildComponents(vars);
        r.components.forEach((c, i) => {
            const el = document.getElementById(`vcC${i}`);
            if (el) el.value = c.formula;
        });
        window._vcSync();
        if (hint) hint.innerHTML += ` <span style="color:#86efac;">— filled with ∇(${escapeHtml(f)})</span>`;
    } catch (e) {
        if (hint) hint.innerHTML = `<span style="color:#fca5a5;">${escapeHtml(e.message)}</span>`;
    }
};

// fill the component boxes with the rotation named in the hint
window._vcTryDemo = function () {
    const tryBox = document.getElementById('vcTry');
    if (!tryBox || !tryBox.dataset.demo) return;
    JSON.parse(tryBox.dataset.demo).forEach((c, i) => {
        const el = document.getElementById(`vcC${i}`);
        if (el) el.value = c;
    });
};

// Single place that decides what the dialog shows: which pane is visible, which
// operators the current dimension permits, and what the formula actually is in
// the user's own variable names.
window._vcSync = function () {
    const modeSel = document.getElementById('vcMode');
    const vars = vcVarList();
    const n = vars.length;
    const hint = document.getElementById('vcHint');
    if (!modeSel) return;

    // gate curl on the dimension, in the dropdown itself
    const blocker = vcCurlBlocker(n);
    const curlOpt = [...modeSel.options].find(o => o.value === 'curl');
    if (curlOpt) {
        curlOpt.disabled = !!blocker;
        curlOpt.textContent = blocker
            ? `∇×F — Curl (unavailable in ${n}D)`
            : `∇×F — Curl (${n === 2 ? 'vector → scalar (2D)' : 'vector → vector (3D)'})`;
    }
    if (modeSel.value === 'curl' && blocker) modeSel.value = 'divergence';
    const mode = modeSel.value;

    const scalarIn = VC_SCALAR_IN.includes(mode);
    const sw = document.getElementById('vcScalarWrap');
    const fw = document.getElementById('vcFieldWrap');
    if (sw) sw.style.display = scalarIn ? '' : 'none';
    if (fw) fw.style.display = scalarIn ? 'none' : '';
    if (!scalarIn) vcRebuildComponents(vars);

    // The components default to 0, which is honest but makes a first Execute
    // return zeros. Offer the classic rotation as a one-click starting point
    // rather than pre-filling it, so what is in the boxes is always what the
    // user put there.
    const tryBox = document.getElementById('vcTry');
    if (tryBox) {
        const demo = n === 2 ? ['-' + vars[1], vars[0]]
            : n === 3 ? ['-' + vars[1], vars[0], '0'] : null;
        tryBox.innerHTML = demo
            ? `Nothing to hand? <a href="#" onclick="window._vcTryDemo();return false;" style="color:#93c5fd;">try F = (${demo.map(escapeHtml).join(', ')})</a> — a pure rotation, so ∇×F is ${n === 2 ? '2' : '(0,0,2)'} and ∇·F is 0.`
            : '';
        tryBox.dataset.demo = demo ? JSON.stringify(demo) : '';
    }
    if (!hint) return;

    const ok = c => `<span style="color:#86efac;">${c}</span>`;
    const bad = c => `<span style="color:#fca5a5;">${c}</span>`;
    const V = v => escapeHtml(v);
    const reserved = [...new Set(vars.filter(v => VC_RESERVED.includes(v.toLowerCase())))];
    const dupes = [...new Set(vars.filter((v, i) => vars.indexOf(v) !== i))];

    let msg;
    if (reserved.length) {
        msg = bad(`${reserved.join(', ')} cannot be an axis name`) + ' — the parser replaces pi and e with numbers and reads function names as calls, so that partial would come back as 0.';
    } else if (dupes.length) {
        msg = bad(`repeated axis: ${dupes.join(', ')}`) + ' — each axis is one dimension, so a name may appear only once.';
    } else if (mode === 'curl') {
        msg = ok(`${n}D ✓`) + (n === 2
            ? ` — in 2D the curl has a single component, so it comes back as the <b>scalar</b> ∂F_${V(vars[1])}/∂${V(vars[0])} − ∂F_${V(vars[0])}/∂${V(vars[1])}.`
            : ' — 3D is the one dimension where the curl is itself a vector.');
    } else if (mode === 'divergence') {
        msg = ok(`${n}D ✓`) + ` — ∇·F = ${vars.map(v => `∂F_${V(v)}/∂${V(v)}`).join(' + ')}.`;
        if (n === 1) msg += ' In 1D that is just dF/dx.';
    } else if (mode === 'laplacian') {
        msg = ok(`${n}D ✓`) + ` — ∇²f = ${vars.map(v => `∂²f/∂${V(v)}²`).join(' + ')}.`;
        if (n === 1) msg += ' In 1D that is just f″.';
    } else {
        msg = ok(`${n}D ✓`) + ` — ∇f = (${vars.map(v => `∂f/∂${V(v)}`).join(', ')}), each exact.`;
        if (n === 1) msg += ' In 1D that is just f′.';
    }
    if (blocker && mode !== 'curl') {
        msg += ` <span style="color:#94a3b8;">Curl is off the menu here: ${blocker}.</span>`;
    }
    hint.innerHTML = msg;
};

async function performVectorOp() {
    const mode = document.getElementById('vcMode')?.value || 'gradient';
    const vars = vcVarList();
    if (vars.length > VC_MAX_DIM) throw new Error(`at most ${VC_MAX_DIM} axes`);

    const body = { mode, variables: vars };
    if (VC_SCALAR_IN.includes(mode)) {
        const f = (document.getElementById('vcScalar')?.value || '').trim();
        if (!f) throw new Error(`${mode} acts on a scalar — type an f (or click “use the input bar”).`);
        body.expression = f;
    } else {
        const comps = vars.map((_, i) => (document.getElementById(`vcC${i}`)?.value || '').trim());
        if (comps.some(c => c === '')) throw new Error('Every component needs a value (use 0 for none).');
        body.components = comps;
    }

    const response = await fetch('/api/vectorop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    renderVectorOp(data);
}

function renderVectorOp(data) {
    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');
    setSolveFailedState(false);

    // The server names the operation and its signature, so the two transports and
    // the doc cannot disagree with each other about what was computed.
    const title = data.heading || 'Vector calculus';
    const scalarSymbol = data.symbol || '∇·F';

    // The partials that go INTO the answer. A card that jumps from "F_x = 1, F_y = 1"
    // straight to "∇·F = 0" looks like an arithmetic mistake; showing that each
    // component is differentiated again, and that a constant differentiates to 0,
    // is what makes the result read as correct instead of broken.
    const termBlock = (data.terms && data.terms.length) ? `
        <div style="margin:0.45rem 0 0.55rem;padding:0.45rem 0.7rem;border-left:2px solid rgba(167,139,250,0.35);background:rgba(167,139,250,0.05);border-radius:0 6px 6px 0;">
            ${data.terms.map(t => `
                <div style="font-family:'JetBrains Mono',monospace;font-size:0.86rem;color:#cbd5e1;padding:1px 0;">
                    <span style="color:#c4b5fd;">${escapeHtml(t.label)}</span> = ${mathHtml(t.formula)}
                </div>`).join('')}
        </div>` : '';

    const body = data.components
        ? data.components.map((c, i) => `
            <div style="font-family:'JetBrains Mono',monospace;font-size:1.0rem;color:#f1f5f9;padding:3px 0;">
                <span style="color:#c4b5fd;">${escapeHtml(data.labels[i])}</span> = ${mathHtml(c.formula)}
            </div>`).join('')
        : `<div style="font-family:'JetBrains Mono',monospace;font-size:1.1rem;color:#f1f5f9;">
                <span style="color:#c4b5fd;">${scalarSymbol}</span> = ${mathHtml(data.scalar)}
           </div>`;

    // echo the input the operator actually consumed — a vector field or a scalar
    const inputBlock = data.field ? `
        <div style="font-size:0.78rem;color:#94a3b8;margin:0.35rem 0 0.5rem;">
            ${data.field.map(f => `<span style="font-family:'JetBrains Mono',monospace;margin-right:0.8rem;">${mathHtml(f)}</span>`).join('')}
        </div>` : (data.input ? `
        <div style="font-size:0.78rem;color:#94a3b8;margin:0.35rem 0 0.5rem;font-family:'JetBrains Mono',monospace;">f = ${mathHtml(data.input)}</div>` : '');

    content.innerHTML = `
        <div class="result-item" style="border-left-color:#a78bfa;">
            <div class="result-label">${title}
                <span style="background:rgba(167,139,250,0.18);color:#a78bfa;padding:2px 10px;border-radius:10px;font-size:0.75rem;">${data.dim}D · ${escapeHtml(data.arity || '')}</span></div>
            ${inputBlock}
            ${termBlock}
            ${body}
            ${data.note ? `<div style="margin-top:0.5rem;font-size:0.76rem;color:#c4b5fd;">${escapeHtml(data.note)}</div>` : ''}
            <div style="margin-top:0.3rem;font-size:0.76rem;color:#94a3b8;">Every partial is an exact symbolic derivative — the same engine the Derivative button uses.</div>
        </div>`;
    panel.style.display = 'block';
    showSteps(data.steps || []);
}

function createDifferentialForm() {
    return createVarSelector('opInput', true);
}

function createDefiniteIntegralForm() {
    const varSelector = createVarSelector('defVar', false);
    return `
        ${varSelector}
        <div style="display:flex;gap:12px;margin:14px 0 10px;">
            <div style="flex:1;">
                <div style="color:#94a3b8;font-size:0.8rem;margin-bottom:4px;">Lower bound</div>
                <input type="text" id="defLower" placeholder="0" value="0" style="width:100%;padding:8px 12px;background:rgba(255,255,255,0.06);border:1.5px solid rgba(96,165,250,0.3);border-radius:10px;color:#60a5fa;font-family:'JetBrains Mono',monospace;" oninput="window._updateRangeViz()" />
            </div>
            <div style="flex:1;">
                <div style="color:#94a3b8;font-size:0.8rem;margin-bottom:4px;">Upper bound</div>
                <input type="text" id="defUpper" placeholder="1" value="1" style="width:100%;padding:8px 12px;background:rgba(255,255,255,0.06);border:1.5px solid rgba(96,165,250,0.3);border-radius:10px;color:#60a5fa;font-family:'JetBrains Mono',monospace;" oninput="window._updateRangeViz()" />
            </div>
        </div>
        <div id="rangeViz" style="height:32px;border-radius:8px;overflow:hidden;position:relative;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);margin-bottom:8px;"></div>
        <div style="margin:10px 0;">
            <div style="color:#94a3b8;font-size:0.8rem;margin-bottom:4px;">Method</div>
            <select id="defMethod" style="width:100%;padding:8px 12px;background:#1e293b;border:1.5px solid rgba(96,165,250,0.3);border-radius:10px;color:#e2e8f0;font-size:0.85rem;">
                <option value="auto" selected>Symbolic / automatic (FTC → special → Simpson)</option>
                <option value="mc">Monte Carlo (sampled estimate ± error, with dart plot)</option>
            </select>
        </div>
        <p style="font-size:0.75rem;color:#64748b;margin:0;">Use <code style="color:#60a5fa;">inf</code> or <code style="color:#60a5fa;">-inf</code> for improper integrals (symbolic method only)</p>
    `;
}

// Real-time range visualization with draggable handles
window._parseBound = function(s) {
    s = s.trim().toLowerCase();
    if (s === 'inf' || s === 'infinity') return Infinity;
    if (s === '-inf' || s === '-infinity') return -Infinity;
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
};

window._updateRangeViz = function() {
    const viz = document.getElementById('rangeViz');
    if (!viz) return;
    const lo = window._parseBound(document.getElementById('defLower')?.value || '0');
    const hi = window._parseBound(document.getElementById('defUpper')?.value || '1');
    if (lo === null || hi === null) { viz.innerHTML = ''; return; }

    const isFinL = isFinite(lo), isFinU = isFinite(hi);
    let leftPct = 15, rightPct = 85;
    let leftLabel = isFinL ? lo.toFixed(1) : '-∞';
    let rightLabel = isFinU ? hi.toFixed(1) : '∞';

    if (!isFinL && isFinU) { leftPct = 5; rightPct = 80; }
    else if (isFinL && !isFinU) { leftPct = 20; rightPct = 95; }
    else if (!isFinL && !isFinU) { leftPct = 5; rightPct = 95; }

    const handleStyle = 'position:absolute;top:0;width:14px;height:100%;cursor:ew-resize;z-index:2;border-radius:4px;';
    viz.innerHTML = `
        <div style="position:absolute;top:0;left:${leftPct}%;right:${100-rightPct}%;height:100%;background:linear-gradient(90deg,rgba(96,165,250,0.25),rgba(96,165,250,0.45),rgba(96,165,250,0.25));border-radius:8px;"></div>
        <div id="rangeHandleL" style="${handleStyle}left:${leftPct}%;transform:translateX(-50%);background:rgba(96,165,250,0.7);" title="Drag to change lower bound"></div>
        <div id="rangeHandleR" style="${handleStyle}left:${rightPct}%;transform:translateX(-50%);background:rgba(96,165,250,0.7);" title="Drag to change upper bound"></div>
        <div style="position:absolute;left:${leftPct}%;top:50%;transform:translate(-50%,-50%);color:#60a5fa;font-family:'JetBrains Mono',monospace;font-size:0.7rem;font-weight:700;pointer-events:none;text-shadow:0 0 4px rgba(0,0,0,0.8);">${leftLabel}</div>
        <div style="position:absolute;left:${rightPct}%;top:50%;transform:translate(-50%,-50%);color:#60a5fa;font-family:'JetBrains Mono',monospace;font-size:0.7rem;font-weight:700;pointer-events:none;text-shadow:0 0 4px rgba(0,0,0,0.8);">${rightLabel}</div>
    `;

    // Attach drag handlers — visual preview during drag, value commits on release
    const attachDrag = (handleId, boundId) => {
        const handle = document.getElementById(handleId);
        if (!handle) return;
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const vizRect = viz.getBoundingClientRect();
            // Snapshot the range at drag start so it stays fixed
            const startLo = window._parseBound(document.getElementById('defLower')?.value || '0');
            const startHi = window._parseBound(document.getElementById('defUpper')?.value || '1');
            const effLo = isFinite(startLo) ? startLo : -1e9;
            const effHi = isFinite(startHi) ? startHi : 1e9;
            const rangeSpan = effHi - effLo || 2;
            const padLo = effLo - rangeSpan * 0.3;
            const padHi = effHi + rangeSpan * 0.3;

            let lastVal = null;
            const pctToVal = (ev) => {
                const pct = Math.max(2, Math.min(98, ((ev.clientX - vizRect.left) / vizRect.width) * 100));
                return Math.round((padLo + (pct / 100) * (padHi - padLo)) * 100) / 100;
            };
            const onMove = (ev) => {
                lastVal = pctToVal(ev);
                const pct = Math.max(2, Math.min(98, ((ev.clientX - vizRect.left) / vizRect.width) * 100));
                handle.style.left = pct + '%';
                // Update input value in real-time (no DOM rebuild)
                document.getElementById(boundId).value = lastVal;
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                window._updateRangeViz(); // Full rebuild on release
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    };
    attachDrag('rangeHandleL', 'defLower');
    attachDrag('rangeHandleR', 'defUpper');
};

// Initialize range viz after modal opens
const origShowModal = showModal;
showModal = function(title, body) {
    origShowModal(title, body);
    if (title.includes('Definite') || title.includes('Residue')) {
        setTimeout(() => window._updateRangeViz(), 50);
    }
};

function createResidueForm() {
    const varSelector = createVarSelector('defVar', false);
    return `
        <div style="padding:10px; background:rgba(239,68,68,0.08); border-radius:8px; border:1px solid rgba(239,68,68,0.25); margin-bottom:12px;">
            <p style="color:#94a3b8; font-size:0.82rem; margin:0;">Residue Theorem — evaluates improper integrals of rational functions P(x)/Q(x) (deg Q ≥ deg P + 2) via contour integration. Declines when a pole sits on the real axis (divergent / principal-value only).</p>
        </div>
        ${varSelector}
        <div style="display:flex;gap:12px;margin:14px 0 10px;">
            <div style="flex:1;">
                <div style="color:#94a3b8;font-size:0.8rem;margin-bottom:4px;">Lower bound</div>
                <input type="text" id="defLower" value="-inf" style="width:100%;padding:8px 12px;background:rgba(255,255,255,0.06);border:1.5px solid rgba(239,68,68,0.3);border-radius:10px;color:#f87171;font-family:'JetBrains Mono',monospace;" oninput="window._updateRangeViz()" />
            </div>
            <div style="flex:1;">
                <div style="color:#94a3b8;font-size:0.8rem;margin-bottom:4px;">Upper bound</div>
                <input type="text" id="defUpper" value="inf" style="width:100%;padding:8px 12px;background:rgba(255,255,255,0.06);border:1.5px solid rgba(239,68,68,0.3);border-radius:10px;color:#f87171;font-family:'JetBrains Mono',monospace;" oninput="window._updateRangeViz()" />
            </div>
        </div>
        <div id="rangeViz" style="height:32px;border-radius:8px;overflow:hidden;position:relative;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);margin-bottom:8px;"></div>
        <p style="font-size:0.75rem;color:#64748b;margin:0;">Rational functions P(x)/Q(x) where deg(Q) ≥ deg(P)+2</p>
    `;
}

// Perform Operations
async function performDerivative() {
    const variable = document.getElementById('opInput')?.value.trim() || document.getElementById('variableInput').value.trim() || 'x';
    const trackSteps = true; // Always track steps
    const complexMode = document.getElementById('complexMode').checked;
    const simplifyMode = document.getElementById('simplifyMode')?.value || 'final';

    const response = await fetch(`/api/derivative/${state.currentExpressionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            variable,
            track_steps: trackSteps,
            complex_mode: complexMode,
            aggressive_simplify: simplifyMode === 'steps',
            simplify_mode: simplifyMode
        })
    });
    
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    
    updateExpression(data);
    if (trackSteps && data.steps) showSteps(data.steps);
}

async function performIntegration() {
    // Strategy View toggle: integrate via the trace endpoint, which yields the
    // normal result + steps PLUS the animated strategy playback.
    if (document.getElementById('strategyView')?.checked) {
        return performTraceIntegration();
    }
    const variable = document.getElementById('opInput')?.value.trim() || document.getElementById('variableInput').value.trim() || 'x';
    const trackSteps = true; // Always track steps
    const experimental = document.getElementById('experimentalMode').checked;
    const complexMode = document.getElementById('complexMode').checked;
    const taylorMode = document.getElementById('taylorMode')?.checked || false;
    const simplifyMode = document.getElementById('simplifyMode')?.value || 'final';

    const response = await fetch(`/api/integrate/${state.currentExpressionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            variable,
            track_steps: trackSteps,
            experimental,
            complex_mode: complexMode,
            taylor: taylorMode,
            aggressive_simplify: simplifyMode === 'steps',
            simplify_mode: simplifyMode
        })
    });
    
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    
    if (data.taylor) {
        showTaylorSeries(data.taylor);
    }
    
    updateExpression(data);

    // Surface the verification verdict as the closing step. The engine has always
    // checked its own integration — differentiate the answer and compare it to the
    // integrand at 15 random points (§11) — but the verdict used to be dropped on
    // this path and was visible only in Strategy View. Checking the work and then
    // hiding the result is the one thing this engine is not supposed to do, and
    // "verified at 15/15 points" belongs where a reader looks for how the answer
    // was reached. An honest marker gets no verdict, because none was attempted.
    if (trackSteps && data.steps) showSteps(data.steps);
    if (trackSteps && data.debug_logs) showDebugLogs(data.debug_logs);
}

// ============================================================
// Live Solve player — animated playback of the strategy cascade
// ============================================================
const live = { timers: [], skipped: false };
const stripAnsiCodes = (s) => String(s || '').replace(/\x1b\[[0-9;]*m/g, '');

const LIVE_TECH_COLORS = [
    [/table/i, '#a3e635'], [/u-sub/i, '#fbbf24'], [/special product/i, '#f472b6'],
    [/trig identity/i, '#2dd4bf'], [/rational|partial/i, '#fb923c'],
    [/by parts/i, '#60a5fa'], [/distribut/i, '#a78bfa'], [/inverse/i, '#e879f9'],
    [/radical|trig sub/i, '#34d399'], [/standard/i, '#7dd3fc'], [/power/i, '#fcd34d'],
];
function liveTechColor(name) {
    const hit = LIVE_TECH_COLORS.find(([re]) => re.test(name || ''));
    return hit ? hit[1] : '#22d3ee';
}

function liveReset() {
    live.timers.forEach(clearInterval);
    live.timers = [];
    live.skipped = false;
    ['liveTimeline', 'liveConsole', 'livePolish', 'liveFinal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
    const ex = document.getElementById('liveExamining');
    if (ex) ex.hidden = true;
    const st = document.getElementById('liveStrategy');
    if (st) { st.textContent = 'analyzing…'; st.style.color = '#93c5fd'; }
}

function livePlay(data) {
    liveReset();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeline = document.getElementById('liveTimeline');
    const consoleEl = document.getElementById('liveConsole');
    const polishEl = document.getElementById('livePolish');
    const finalEl = document.getElementById('liveFinal');
    if (!timeline || !consoleEl) return;

    // ---- build the timeline event list from the technique trace ----
    const techs = ((data.trace && data.trace.techniques) || []).filter(t => t.technique !== '∫ solve');
    const logs = (data.debug_logs || [])
        .map(l => (l && typeof l === 'object')
            ? { t: stripAnsiCodes(l.message), lvl: l.level || 0 }
            : { t: stripAnsiCodes(l), lvl: 0 })
        .filter(e => e.t.trim());

    // Group per-candidate outcomes by u-sub attempt: each '[U-Sub] candidates:' line
    // starts a segment; the 'try/WORKS/fails' lines that follow belong to it.
    const segs = [];
    logs.forEach(e => {
        if (e.t.includes('[U-Sub] candidates:')) {
            segs.push({ cands: e.t.split('candidates:')[1].split('|').map(s => s.trim()).filter(Boolean), outcomes: {} });
        } else if (segs.length && e.t.includes('[U-Sub] u = ')) {
            const tail = e.t.split('u = ')[1] || '';
            if (tail.includes(' WORKS')) segs[segs.length - 1].outcomes[tail.split(' WORKS')[0].trim()] = 'ok';
            else if (tail.includes(' fails')) segs[segs.length - 1].outcomes[tail.split(' fails')[0].trim()] = 'fail';
        }
    });
    let segIdx = 0;
    const events = [];
    let lastStrategy = null;
    const minDepth = techs.length ? Math.min(...techs.map(x => x.depth)) : 0;
    techs.forEach(t => {
        if (t.depth === minDepth && t.technique !== lastStrategy) {
            events.push({ kind: 'strategy', name: t.technique });
            lastStrategy = t.technique;
        }
        const ev = { kind: 'attempt', t };
        if (/u-sub/i.test(t.technique) && segIdx < segs.length) ev.seg = segs[segIdx++];
        events.push(ev);
    });
    if (!events.length) events.push({ kind: 'strategy', name: 'Fast path (no trace recorded)' });

    const polishSteps = (data.simplify_steps || []).filter(s => s && s.rule);

    // ---- renderers ----
    const renderEvent = (ev) => {
        if (ev.kind === 'strategy') {
            const st = document.getElementById('liveStrategy');
            if (st) { st.innerHTML = `strategy → <strong>${escapeHtml(ev.name)}</strong>`; st.style.color = liveTechColor(ev.name); }
            const banner = document.createElement('div');
            banner.className = 'live-event live-strategy-banner';
            banner.style.borderColor = liveTechColor(ev.name);
            banner.innerHTML = `⟶ strategy: <strong style="color:${liveTechColor(ev.name)}">${escapeHtml(ev.name)}</strong>`;
            timeline.appendChild(banner);
        } else {
            const t = ev.t;
            const color = liveTechColor(t.technique);
            const status = t.status === 'success' ? `<span class="live-ok">✓ success</span>` :
                           t.status === 'fail'    ? `<span class="live-fail">✗ ${escapeHtml(t.reason || 'no match')}</span>` :
                                                    `<span class="live-skip">≫ ${escapeHtml(t.reason || 'skipped')}</span>`;
            const card = document.createElement('div');
            card.className = 'live-event live-attempt';
            card.style.borderLeftColor = color;
            card.style.marginLeft = `${Math.min(t.depth, 6) * 14}px`;
            let inner = `<div class="live-attempt-head"><span class="live-tech" style="color:${color}">${escapeHtml(t.technique)}</span> ${status}</div>`;
            if (t.expression) inner += `<div class="live-on">examining: <span class="step-math">${mathHtml(t.expression)}</span></div>`;
            if (ev.seg && ev.seg.cands.length) {
                inner += `<div class="live-cands">candidates: ${ev.seg.cands.map(c => {
                    const oc = ev.seg.outcomes[c];
                    const mark = oc === 'ok' ? ' ✓' : oc === 'fail' ? ' ✗' : '';
                    return `<span class="live-cand ${oc ? 'live-cand-' + oc : ''}">${mathHtml(c)}${mark}</span>`;
                }).join('')}</div>`;
            }
            if (t.status === 'success' && t.result) inner += `<div class="live-result-line">⇒ <span class="step-math">${mathHtml(t.result)}</span></div>`;
            card.innerHTML = inner;
            timeline.appendChild(card);
            timeline.scrollTop = timeline.scrollHeight;
            // "now examining" spotlight
            const ex = document.getElementById('liveExamining');
            const exExpr = document.getElementById('liveExaminingExpr');
            if (ex && exExpr && t.expression) {
                ex.hidden = false;
                exExpr.innerHTML = mathHtml(t.expression);
                ex.classList.remove('pulse'); void ex.offsetWidth; ex.classList.add('pulse');
            }
        }
    };

    const renderConsoleLine = (entry) => {
        const line = entry.t;
        const div = document.createElement('div');
        div.className = 'live-console-line';
        div.dataset.lvl = entry.lvl;
        let color = '#7c8db0';
        if (line.includes('WORKS')) color = '#4ade80';
        else if (line.includes('fails')) color = '#f87171';
        else if (line.includes('[U-Sub]')) color = '#fbbf24';
        else if (line.includes('[Special]')) color = '#f472b6';
        else if (line.includes('[Strategy]')) color = '#22d3ee';
        else if (line.includes('Normalized')) color = '#7dd3fc';
        else if (line.includes('[Verify]')) color = '#4ade80';
        else if (line.includes('[Risch]')) color = '#a78bfa';
        div.style.color = color;
        div.textContent = line.trim();
        consoleEl.appendChild(div);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    };

    const renderPolish = () => {
        if (!polishEl) return;
        polishEl.innerHTML = `<div class="live-col-title">Polish — simplification after solving</div>`;
        polishSteps.slice(0, 30).forEach((s, i) => {
            const row = document.createElement('div');
            row.className = 'live-event live-polish-row';
            row.style.animationDelay = live.skipped || reduce ? '0s' : `${i * 0.12}s`;
            row.innerHTML = `<span class="tok-op">≈</span> ${prettifyMath(s.rule)}`;
            polishEl.appendChild(row);
        });
    };

    const renderFinal = () => {
        if (!finalEl) return;
        const failed = !!data.failed;
        const formula = data.formula || '';
        finalEl.innerHTML = `<div class="live-final-card ${failed ? 'failed' : ''}">` +
            `<div class="live-col-title">${failed ? '✗ FAILED — no antiderivative found' : '✓ Solved'}</div>` +
            `<div class="step-math live-final-math">${mathHtml(formula)}</div></div>`;
        const st = document.getElementById('liveStrategy');
        if (st) { st.textContent = failed ? 'failed' : 'solved'; st.style.color = failed ? '#f87171' : '#4ade80'; }
        setSolveFailedState(failed);
    };

    const finishAll = () => {
        live.timers.forEach(clearInterval);
        live.timers = [];
        renderPolish();
        renderFinal();
    };

    if (reduce) {           // instant render for reduced-motion users
        events.forEach(renderEvent);
        logs.forEach(renderConsoleLine);
        finishAll();
        return;
    }

    // ---- two animated pumps: timeline (~380ms) + console (~70ms) ----
    let ei = 0, li = 0;
    const evTimer = setInterval(() => {
        if (ei >= events.length) {
            clearInterval(evTimer);
            // let the console catch up, then polish + final
            const wait = setInterval(() => {
                if (li >= logs.length) { clearInterval(wait); finishAll(); }
            }, 80);
            live.timers.push(wait);
            return;
        }
        renderEvent(events[ei++]);
    }, 380);
    const logTimer = setInterval(() => {
        if (li >= logs.length) { clearInterval(logTimer); return; }
        renderConsoleLine(logs[li++]);
    }, 70);
    live.timers.push(evTimer, logTimer);

    const verboseCb = document.getElementById('liveVerbose');
    const applyVerbose = () => consoleEl.classList.toggle('no-verbose', !(verboseCb && verboseCb.checked));
    if (verboseCb) verboseCb.onchange = applyVerbose;
    applyVerbose();

    const skipBtn = document.getElementById('liveSkip');
    if (skipBtn) skipBtn.onclick = () => {
        live.skipped = true;
        live.timers.forEach(clearInterval);
        live.timers = [];
        while (ei < events.length) renderEvent(events[ei++]);
        while (li < logs.length) renderConsoleLine(logs[li++]);
        finishAll();
    };
}

async function performTraceIntegration() {
    const variable = document.getElementById('variableInput').value.trim() || 'x';

    if (!state.currentExpressionId) {
        showError('Please parse an expression first');
        return;
    }

    const response = await fetch(`/api/integrate_trace/${state.currentExpressionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variable })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server error (${response.status}). Try restarting the server: ruby symbolic/web_server.rb`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    updateExpression(data);

    // Show trace panel
    const tracePanel = document.getElementById('tracePanel');
    tracePanel.style.display = 'block';

    if (data.trace) {
        // Strip ANSI codes for HTML display
        const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

        document.getElementById('traceTreeContent').textContent = stripAnsi(data.trace.tree_text || 'No trace');
        document.getElementById('traceSpaceContent').textContent = stripAnsi(data.trace.space_plot || 'No plot');
        document.getElementById('traceMermaidContent').textContent = data.trace.mermaid || 'No diagram';

        // Build techniques list
        const techDiv = document.getElementById('traceTechniquesContent');
        if (data.trace.techniques && data.trace.techniques.length > 0) {
            let html = '<div style="font-family: \'JetBrains Mono\', monospace; font-size: 13px;">';
            data.trace.techniques.forEach((t, i) => {
                const color = t.status === 'success' ? '#4ade80' : t.status === 'fail' ? '#f87171' : '#fbbf24';
                const icon = t.status === 'success' ? '+' : t.status === 'fail' ? '-' : '~';
                const indent = '&nbsp;'.repeat(t.depth * 4);
                html += `<div style="color: ${color}; margin: 2px 0;">`;
                html += `${indent}[${icon}] <strong>${t.technique}</strong>`;
                if (t.expression) html += ` <span style="color: #94a3b8; font-size: 11px;">on: ${t.expression}</span>`;
                if (t.result) html += `<br/>${indent}&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #86efac;">=> ${t.result}</span>`;
                if (t.reason) html += `<br/>${indent}&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #fca5a5;">reason: ${t.reason}</span>`;
                html += '</div>';
            });
            html += '</div>';
            techDiv.innerHTML = html;
        } else {
            techDiv.innerHTML = '<p style="color: #94a3b8;">No technique data recorded.</p>';
        }
    }

    // Normal output too: result card + solution steps (Strategy View is additive)
    showResultsWithLatex(data.formula, data.latex);
    if (data.steps && data.steps.length) showSteps(data.steps);

    // Live Solve playback is the default view; scroll to the strategy region LAST
    // (the results/steps cards schedule their own scrolls at ~100ms).
    switchTraceTab('live');
    livePlay(data);
    setTimeout(() => document.getElementById('tracePanel').scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
}

async function performDefiniteIntegral() {
    const variable = document.getElementById('defVar')?.value?.trim() || 'x';
    const lower = document.getElementById('defLower')?.value.trim() || '0';
    const upper = document.getElementById('defUpper')?.value.trim() || '1';

    if (!state.currentExpressionId) {
        showError('Please parse an expression first');
        return;
    }

    const mcMethod = document.getElementById('defMethod')?.value === 'mc';
    const response = await fetch(`/api/definite_integral/${state.currentExpressionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variable, lower, upper, method: mcMethod ? 'mc' : 'auto' })
    });

    if (!response.ok) {
        throw new Error(`Server error (${response.status}). Restart the server.`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    // Show result
    const panel = document.getElementById('resultsPanel');
    const content = document.getElementById('resultsContent');

    let methodBadge = '';
    if (data.method === 'ftc') methodBadge = '<span style="background:rgba(74,222,128,0.2);color:#4ade80;padding:2px 8px;border-radius:10px;font-size:0.75rem;">Fundamental Theorem</span>';
    else if (data.method === 'special') methodBadge = '<span style="background:rgba(167,139,250,0.2);color:#a78bfa;padding:2px 8px;border-radius:10px;font-size:0.75rem;">Known Special Form</span>';
    else if (data.method === 'residue') methodBadge = '<span style="background:rgba(239,68,68,0.2);color:#f87171;padding:2px 8px;border-radius:10px;font-size:0.75rem;">Residue Theorem</span>';
    else if (data.method === 'numeric') methodBadge = '<span style="background:rgba(251,191,36,0.2);color:#fbbf24;padding:2px 8px;border-radius:10px;font-size:0.75rem;">Numerical (Simpson)</span>';
    else if (data.method === 'montecarlo') methodBadge = '<span style="background:rgba(34,211,238,0.2);color:#22d3ee;padding:2px 8px;border-radius:10px;font-size:0.75rem;">Monte Carlo</span>';
    else if (data.method === 'divergent') methodBadge = '<span style="background:rgba(239,68,68,0.22);color:#f87171;padding:2px 8px;border-radius:10px;font-size:0.75rem;">DIVERGENT</span>';
    else if (data.method === 'improper') methodBadge = '<span style="background:rgba(251,146,60,0.2);color:#fb923c;padding:2px 8px;border-radius:10px;font-size:0.75rem;">Improper — split at the singularity</span>';

    const mcSuffix = data.method === 'montecarlo' && typeof data.stderr === 'number'
        ? ` <span style="font-size:1.1rem;color:#94a3b8;">± ${data.stderr.toFixed(6)} <span style="font-size:0.75rem;">(std err, n=${data.n})</span></span>` : '';

    // A divergent integral has no value. Print the refusal where the number would
    // have gone, rather than a plausible-looking figure the reader would take as
    // the answer: this path used to hand back -2 for the divergent int_-1^1 dx/x^2.
    const headline = data.method === 'divergent'
        ? '<span style="font-size:1.5rem;font-weight:700;color:#f87171;">no value — the integral diverges</span>'
        : `<span style="font-size:2rem;font-weight:700;color:#f1f5f9;">${typeof data.value === 'number' ? data.value.toFixed(8) : data.value}${mcSuffix}</span>`;

    let html = `<div style="margin-bottom:1rem;">
        <div style="font-size:0.9rem;color:#94a3b8;margin-bottom:4px;">Definite Integral Result ${methodBadge}</div>
        <div>${headline}</div>
    </div>`;

    if (data.note) {
        const tone = data.method === 'divergent' ? '#f87171' : '#fb923c';
        html += `<div style="margin:0 0 0.8rem;padding:0.55rem 0.8rem;border-left:3px solid ${tone};background:rgba(148,163,184,0.06);border-radius:0 8px 8px 0;font-size:0.82rem;color:#cbd5e1;line-height:1.55;">${escapeHtml(data.note)}</div>`;
    }

    if (data.plot) {
        html += `<div style="margin-top:0.75rem;">
            <div style="font-size:0.78rem;color:#94a3b8;margin-bottom:4px;">Integration region${data.darts ? ' + Monte Carlo darts (green = counted, red = miss)' : ''}</div>
            <canvas id="defPlot" width="720" height="230" style="width:100%;max-width:720px;background:rgba(0,0,0,0.3);border-radius:8px;"></canvas>
        </div>`;
    }

    if (data.contour) {
        html += `<div style="font-size:0.85rem;color:#94a3b8;">Contour: ${data.contour}</div>`;
    }

    if (data.poles && data.poles.length > 0) {
        html += `<div style="margin-top:0.5rem;font-size:0.85rem;color:#94a3b8;">Poles found: ${data.poles.map(p =>
            p.im === 0 ? p.re.toString() : `${p.re} ${p.im >= 0 ? '+' : '-'} ${Math.abs(p.im)}i`
        ).join(', ')}</div>`;
    }

    if (data.poles && data.poles.length > 0) {
        // Canvas-based visualization
        html += `<div id="complexPlotContainer" style="margin-top:1.5rem;margin-bottom:1.5rem;"></div>`;
    } else if (data.visualization) {
        // Fallback ASCII
        html += `<pre style="margin-top:1rem;font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.3;background:rgba(0,0,0,0.4);padding:1rem;border-radius:8px;overflow-x:auto;color:#e2e8f0;">${data.visualization}</pre>`;
    }

    content.innerHTML = html;
    panel.style.display = 'block';
    if (data.plot) drawDefinitePlot(document.getElementById('defPlot'), data.plot, data.darts);

    // Show steps
    if (data.steps && data.steps.length > 0) {
        showSteps(data.steps);
    }

    // Draw complex plots in BOTH the results panel AND the right tree column
    if (data.poles && data.poles.length > 0 && typeof drawComplexPlots === 'function') {
        const selectedPoles = (data.poles || []).filter(p => p.im > 0.001);
        const contourType = data.contour || 'upper';
        const expr = state.originalExpression?.formula || '';

        requestAnimationFrame(() => {
            try {
                // Results panel plots
                const resultsEl = document.getElementById('complexPlotContainer');
                if (resultsEl) {
                    drawComplexPlots('complexPlotContainer', data.poles, selectedPoles, contourType, expr);
                }

                // Right tree column: replace the SVG with complex plane plots
                const treeSvg = document.getElementById('treeProcessed');
                if (treeSvg) {
                    // Ensure the parent column and the arrow are visible
                    const parentCol = treeSvg.parentElement;
                    if (parentCol) parentCol.style.display = 'block';
                    const arrow = document.querySelector('#treeVisualView .tree-arrow');
                    if (arrow) arrow.style.display = 'flex';

                    treeSvg.style.display = 'none';
                    let treePlotDiv = document.getElementById('treeResidPlot');
                    if (!treePlotDiv) {
                        treePlotDiv = document.createElement('div');
                        treePlotDiv.id = 'treeResidPlot';
                        parentCol.appendChild(treePlotDiv);
                    }
                    treePlotDiv.innerHTML = '';
                    treePlotDiv.style.display = 'block';
                    drawComplexPlots('treeResidPlot', data.poles, selectedPoles, contourType, expr);
                }

                // Update the right tree label
                const labels = document.querySelectorAll('#treeVisualView .tree-label');
                if (labels[1]) labels[1].textContent = 'Complex Plane (Residue Theorem)';

            } catch(e) {
                console.error('Plot render error:', e);
            }
        });
    }
}

function switchTraceTab(tab) {
    document.querySelectorAll('.trace-view').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.trace-tab').forEach(b => b.classList.remove('active'));

    const viewId = {
        live: 'traceLiveView',
        tree: 'traceTreeView',
        space: 'traceSpaceView',
        techniques: 'traceTechniquesView',
        mermaid: 'traceMermaidView'
    }[tab];

    if (viewId) document.getElementById(viewId).style.display = 'block';
    document.querySelector(`.trace-tab[data-tab="${tab}"]`)?.classList.add('active');
}

async function performSimplify() {
    // Always use aggressive (experimental) simplification
    const experimental = true;
    
    const response = await fetch(`/api/simplify/${state.currentExpressionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experimental, track_steps: true })
    });
    
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    
    updateExpression(data);
    if (data.steps) showSteps(data.steps);
}

async function performEvaluate() {
    // Read from color-coded input fields
    const inputs = document.querySelectorAll('.eval-var-input');
    const vars = {};
    inputs.forEach(inp => {
        const v = inp.getAttribute('data-var');
        const val = parseFloat(inp.value);
        if (v && !isNaN(val)) vars[v] = val;
    });

    const response = await fetch(`/api/evaluate/${state.currentExpressionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables: vars })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    showResults(`Result: ${data.result}`);
}

async function performDifferential() {
    const variables = (document.getElementById('opInput')?.value || 'x').trim().split(/\s+/).filter(Boolean);

    const response = await fetch(`/api/differential/${state.originalExpression.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables })
    });
    
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    
    // Format differential terms
    const termsHtml = data.terms.map(term => `
        <div class="result-item">
            <div class="result-value">${term.coefficient} × ${term.differential}</div>
        </div>
    `).join('');
    
    const panel = document.getElementById('resultsPanel');
    const resultsContent = document.getElementById('resultsContent');
    
    resultsContent.innerHTML = `
        <div class="result-item">
            <h3>Differential Form df</h3>
            <div class="result-label">Original: ${data.original}</div>
        </div>
        <div class="result-item">
            <div class="result-label">Result:</div>
            <div class="result-value">${data.differential}</div>
        </div>
        ${termsHtml}
    `;
    
    panel.style.display = 'block';
    
    if (data.steps && data.steps.length > 0) {
        showSteps(data.steps);
    }
}

// Update Expression
function updateExpression(data) {
    // Always keep original - just show result
    state.lastResult = {
        id: data.id,
        formula: data.formula,
        latex: data.latex,
        tree_text: data.tree_text,
        tree_json: data.tree_json,
        // the independent numeric verdict, if the operation produced one
        verification: data.verification || null
    };

    displayExpression();
}

// Show Results
function showResults(content) {
    const panel = document.getElementById('resultsPanel');
    const resultsContent = document.getElementById('resultsContent');
    
    resultsContent.innerHTML = `<div class="result-item">${content}</div>`;
    panel.style.display = 'block';
    
    setTimeout(() => resultsContent.scrollIntoView({ behavior: 'smooth' }), 100);
}

// Show Results with LaTeX
function showResultsWithLatex(formula, latex) {
    const panel = document.getElementById('resultsPanel');
    const resultsContent = document.getElementById('resultsContent');
    const complexMode = document.getElementById('complexMode').checked;
    
    // Convert to pastable format (only ASCII characters)
    const pastable = makePastable(formula);
    
    // Highlight imaginary unit in complex mode
    const displayFormula = complexMode ? highlightImaginaryUnit(formula) : escapeHtml(formula);

    // Unevaluated 'integral' marker in the result => the solve FAILED; show it honestly.
    setSolveFailedState(/\bintegral\b/i.test(formula));

    // The independent verdict, next to the answer it is about. Integration checks
    // itself — differentiate the result and compare it to the integrand at 15
    // random points (§11) — and that verdict used to be computed and discarded,
    // reachable only by turning on Strategy View. A check whose outcome nobody
    // sees is not a check. No badge means none was attempted, which is the honest
    // reading when the result still carries an unevaluated integral marker.
    const v = state.lastResult && state.lastResult.verification;
    const verdictBadge = v ? (v.valid
        ? `<span style="background:rgba(74,222,128,0.18);color:#4ade80;padding:2px 10px;border-radius:10px;font-size:0.72rem;font-weight:600;margin-left:0.6rem;" title="The answer was differentiated symbolically and compared to the original integrand at 15 random points.">✓ ${escapeHtml(v.details || 'verified')}</span>`
        : `<span style="background:rgba(248,113,113,0.18);color:#f87171;padding:2px 10px;border-radius:10px;font-size:0.72rem;font-weight:600;margin-left:0.6rem;">⚠ ${escapeHtml(v.details || 'verification failed')}</span>`) : '';

    resultsContent.innerHTML = `
        <div class="result-item">
            <div class="result-label">Readable:${verdictBadge}</div>
            <div class="result-value">${displayFormula}</div>
        </div>
        <div class="result-item result-pastable">
            <div class="result-label">
                Pastable:
                <button class="copy-btn" type="button">📋 Copy</button>
            </div>
            <div class="result-value pastable-text">${escapeHtml(pastable)}</div>
        </div>
        <div class="result-item">
            <div class="result-label">LaTeX:</div>
            <div class="result-value latex-rendered">\\[${latex}\\]</div>
        </div>
    `;

    const copyBtn = resultsContent.querySelector('.copy-btn');
    if (copyBtn) copyBtn.addEventListener('click', (e) => copyToClipboard(pastable, e));

    panel.style.display = 'block';
    
    // Render LaTeX
    typesetMath(resultsContent);
    
    setTimeout(() => resultsContent.scrollIntoView({ behavior: 'smooth' }), 100);
}

// Convert to pastable format
function makePastable(formula) {
    return formula
        .replace(/÷/g, '/')
        .replace(/×/g, '*')
        .replace(/·/g, '*')
        .replace(/−/g, '-')
        .replace(/√/g, 'sqrt')
        .replace(/π/g, 'pi')
        .replace(/∞/g, 'inf')
        .replace(/⁰/g, '^0')
        .replace(/¹/g, '^1')
        .replace(/²/g, '^2')
        .replace(/³/g, '^3')
        .replace(/⁴/g, '^4')
        .replace(/⁵/g, '^5')
        .replace(/⁶/g, '^6')
        .replace(/⁷/g, '^7')
        .replace(/⁸/g, '^8')
        .replace(/⁹/g, '^9');
}

// Copy to clipboard
function copyToClipboard(text, event) {
    if (!event) {
        // Fallback if event is not passed
        navigator.clipboard.writeText(text).then(() => {
            console.log('Copied to clipboard:', text);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
        return;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        // Show feedback
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        btn.style.background = '#10b981';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        const btn = event.target;
        btn.textContent = '✗ Failed';
        btn.style.background = '#ef4444';
        setTimeout(() => {
            btn.textContent = '📋 Copy';
            btn.style.background = '';
        }, 2000);
    });
}

// Show Steps
function showSteps(steps) {
    // Check if animation mode is enabled (commented out for simplicity)
    const animationMode = document.getElementById('animationMode')?.checked || false; // Safe access
    if (animationMode && window.stepAnimator) {
        window.stepAnimator.loadSteps(steps);
        window.stepAnimator.show();
        return;
    }
    
    const panel = document.getElementById('stepsPanel');
    const stepsContent = document.getElementById('stepsContent');
    
    stepsContent.innerHTML = steps.map((step, i) => {
        const stepObj = typeof step === 'string' ? {rule: step} : step;
        const rule = stepObj.rule || stepObj.description || (stepObj.iteration != null ? `Simplify pass ${stepObj.iteration}` : 'Applied rule');
        const from = stepObj.from || null;
        const to = stepObj.to || stepObj.formula || stepObj.expression || stepObj.current || null;

        // Step categorization with unique symbols (default is colorful, never grey)
        let ruleColor = '#a78bfa';
        let sym = '·'; // default
        let category = 'general';
        const isSimp = rule.includes('Simplification');

        if (rule.includes('Integration by Parts') || rule.includes('∫u dv'))
            { ruleColor = '#60a5fa'; sym = '∫∂'; category = 'pattern'; }
        else if (rule.includes('Power Rule') || rule.includes('power'))
            { ruleColor = '#f59e0b'; sym = 'xⁿ'; category = 'method'; }
        else if (rule.includes('Sum') || rule.includes('Difference'))
            { ruleColor = '#10b981'; sym = '±'; category = 'method'; }
        else if (rule.includes('Product Rule') || rule.includes('Chain Rule'))
            { ruleColor = '#3b82f6'; sym = '∘'; category = 'method'; }
        else if (rule.includes('Constant'))
            { ruleColor = '#8b5cf6'; sym = 'c'; category = 'method'; }
        else if (rule.includes('Quotient'))
            { ruleColor = '#ec4899'; sym = '÷'; category = 'method'; }
        else if (rule.includes('Exponential') || rule.includes('exp'))
            { ruleColor = '#34d399'; sym = 'eˣ'; category = 'method'; }
        else if (rule.includes('Trigonometric') || rule.includes('sin') || rule.includes('cos'))
            { ruleColor = '#06b6d4'; sym = '∿'; category = 'method'; }
        else if (rule.includes('U-Substitution') || rule.includes('substitution') || rule.includes('U-sub'))
            { ruleColor = '#fbbf24'; sym = 'u↦'; category = 'method'; }
        else if (rule.includes('Partial') || rule.includes('PF') || rule.includes('Completing'))
            { ruleColor = '#f472b6'; sym = 'P/Q'; category = 'method'; }
        else if (rule.includes('By Parts: choose') || rule.includes('Compute du') || rule.includes('Compute v'))
            { ruleColor = '#818cf8'; sym = '∂'; category = 'detail'; }
        else if (rule.includes('Simplify v') || rule.includes('Compute integral(v'))
            { ruleColor = '#a78bfa'; sym = '↻'; category = 'detail'; }
        else if (rule.includes('Trig identity'))
            { ruleColor = '#2dd4bf'; sym = 'θ'; category = 'method'; }
        else if (rule.includes('Table:'))
            { ruleColor = '#a3e635'; sym = '≡'; category = 'method'; }
        else if (rule.includes('Reduction') || rule.includes('reduction'))
            { ruleColor = '#fb923c'; sym = '↓n'; category = 'method'; }
        else if (rule.includes('Radical') || rule.includes('Trig Sub'))
            { ruleColor = '#e879f9'; sym = '√'; category = 'method'; }
        else if (rule.includes('Polynomial') || rule.includes('long division'))
            { ruleColor = '#38bdf8'; sym = '⌊÷⌋'; category = 'method'; }
        else if (rule.includes('Multiply') || rule.includes('multiply'))
            { ruleColor = '#fb923c'; sym = '×'; category = 'detail'; }
        else if (rule.includes('Combine') || rule.includes('Collect') || rule.includes('like term'))
            { ruleColor = '#22d3ee'; sym = 'Σ'; category = 'detail'; }
        else if (rule.includes('Distribut') || rule.includes('Expand'))
            { ruleColor = '#a78bfa'; sym = '⊗'; category = 'detail'; }
        else if (rule.includes('Normalize') || rule.includes('Flatten') || rule.includes('Cancel') || rule.includes('fold'))
            { ruleColor = '#7dd3fc'; sym = '↻'; category = 'detail'; }
        else if (rule.includes('Simplify pass'))
            { ruleColor = '#818cf8'; sym = '↻'; category = 'detail'; }
        else if (rule.includes('Special function') || rule.includes('Fresnel') || rule.includes('Gaussian'))
            { ruleColor = '#e879f9'; sym = 'ƒ'; category = 'method'; }
        else if (rule.includes('Reduction family') || rule.includes('Odd cosine') || rule.includes('Odd sine') || rule.includes('Half-angle'))
            { ruleColor = '#fb7185'; sym = '⚔'; category = 'method'; }

        if (isSimp) { ruleColor = '#5eead4'; sym = '≈'; category = 'simplify'; }
        if (rule.includes('Result') || rule.includes('Final'))
            { ruleColor = '#c084fc'; sym = '✓'; category = 'result'; }
        
        const compact = category === 'simplify' || category === 'detail';
        return `
            <div class="step-item step-${category}" style="border-left-color:${ruleColor};background:${ruleColor}14;${compact ? 'padding:4px 8px;margin-bottom:2px;' : ''}">
                <div class="step-header" style="${compact ? 'gap:6px;' : ''}">
                    <span class="step-number" style="background:${ruleColor};${compact ? 'width:22px;height:22px;font-size:0.6rem;' : 'font-size:0.7rem;'}">${sym}</span>
                    <span class="step-rule" style="color: ${ruleColor}; font-weight: 600;">${prettifyMath(rule).replace(/P=\[([^\]]*)\]/g, '<span style="color:#f87171;font-weight:700;">P</span>=<span style="color:#f87171;">[$1]</span>').replace(/Q=\[([^\]]*)\]/g, '<span style="color:#4ade80;font-weight:700;">Q</span>=<span style="color:#4ade80;">[$1]</span>').replace(/quotient=\[([^\]]*)\]/g, '<span style="color:#60a5fa;">quot</span>=<span style="color:#60a5fa;">[$1]</span>').replace(/remainder=\[([^\]]*)\]/g, '<span style="color:#fbbf24;">rem</span>=<span style="color:#fbbf24;">[$1]</span>')}</span>
                </div>
                ${from ? `
                    <div class="step-transformation">
                        <div class="step-from">
                            <div class="step-from-label" style="color: #94a3b8;">From:</div>
                            <div class="step-from-latex step-math">${mathHtml(from)}</div>
                        </div>
                        <div class="step-arrow" style="color: ${ruleColor};">⟹</div>
                        <div class="step-to">
                            <div class="step-to-label" style="color: #94a3b8;">To:</div>
                            <div class="step-to-latex step-math">${mathHtml(to || '')}</div>
                        </div>
                    </div>
                ` : (to ? `
                    <div class="step-formula">
                        <div class="step-formula-latex step-math">${mathHtml(to)}</div>
                    </div>
                ` : '')}
            </div>
        `;
    }).join('');
    
    panel.style.display = 'block';

    // Render LaTeX in steps
    typesetMath(stepsContent);

    // Land on the RESULT, not past it. The steps panel sits well below the results
    // panel, so scrolling to the steps skips over the answer the user just asked
    // for — on the vector-calculus card that is a ~1200px jump past it.
    //
    // The older renderers hid this by scheduling their own scroll to the results
    // at the same 100ms delay, so whichever was queued last won; the newer ones
    // (vector calculus, Pade, SINDy, interval, relativity) never did, and always
    // landed on the steps. Deciding it here once removes the race and gives every
    // tool the same behaviour: show the result, with the steps a scroll below.
    const resultsPanel = document.getElementById('resultsPanel');
    const resultsContent = document.getElementById('resultsContent');
    const target = (resultsPanel && resultsPanel.offsetParent !== null && resultsContent)
        ? resultsContent
        : stepsContent;
    setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

// Show Debug Logs - simple terminal-style output
function showDebugLogs(logs) {
    const panel = document.getElementById('stepsPanel');
    const stepsContent = document.getElementById('stepsContent');
    
    // Build HTML - simple flat list with colors
    const debugHTML = `
        <div class="debug-logs-container">
            <h3 style="color: #60a5fa; margin-bottom: 1rem; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
                <span>💻</span>
                <span>Console Output</span>
                <span style="font-size: 0.75rem; color: #94a3b8; font-weight: normal;">(${logs.length} lines)</span>
            </h3>
            <div class="debug-terminal">
                ${logs.map(log => {
                    const indent = log.level * 20;
                    
                    // Process ANSI color codes and extract clean message
                    let msg = log.message;
                    let color = '#94a3b8'; // default gray
                    
                    // Detect ANSI color codes
                    if (msg.includes('\x1b[94m') || msg.includes('\u001b[94m')) color = '#60a5fa'; // bright blue
                    else if (msg.includes('\x1b[92m') || msg.includes('\u001b[92m')) color = '#34d399'; // bright green
                    else if (msg.includes('\x1b[93m') || msg.includes('\u001b[93m')) color = '#fbbf24'; // bright yellow
                    else if (msg.includes('\x1b[95m') || msg.includes('\u001b[95m')) color = '#c084fc'; // bright purple
                    else if (msg.includes('\x1b[96m') || msg.includes('\u001b[96m')) color = '#06b6d4'; // bright cyan
                    else if (msg.includes('\x1b[34m') || msg.includes('\u001b[34m')) color = '#3b82f6'; // blue
                    else if (msg.includes('\x1b[32m') || msg.includes('\u001b[32m')) color = '#10b981'; // green
                    else if (msg.includes('\x1b[33m') || msg.includes('\u001b[33m')) color = '#f59e0b'; // yellow
                    
                    // Strip ANSI codes for display
                    msg = msg.replace(/\x1b\[[0-9;]*m/g, '').replace(/\u001b\[[0-9;]*m/g, '');
                    
                    // Add extra color hints based on content (more colorful!)
                    if (msg.includes('🧪 EXPERIMENTAL')) color = '#ff00ff'; // magenta
                    else if (msg.includes('Expression:') || msg.includes('Variable:')) color = '#94a3b8'; // gray
                    else if (msg.includes('[Risch] Analyzing')) color = '#60a5fa'; // bright blue
                    else if (msg.includes('[Risch] Detected')) color = '#10b981'; // green
                    else if (msg.includes('[Risch] Attempting')) color = '#fbbf24'; // yellow
                    else if (msg.includes('[Risch] Distributing')) color = '#f97316'; // orange
                    else if (msg.includes('[Risch] Applied')) color = '#34d399'; // emerald
                    else if (msg.includes('[Risch] Transformed')) color = '#a78bfa'; // purple
                    else if (msg.includes('[Risch] Using standard')) color = '#94a3b8'; // gray
                    else if (msg.includes('[By Parts Check]')) color = '#06b6d4'; // cyan
                    else if (msg.includes('[By Parts]')) color = '#0ea5e9'; // sky blue
                    else if (msg.includes('[Trig]')) color = '#ec4899'; // pink
                    else if (msg.includes('[Sec]') || msg.includes('[Tan]')) color = '#f472b6'; // hot pink
                    else if (msg.includes('[Simplify]')) color = '#fbbf24'; // amber
                    else if (msg.includes('>>> compute_integral')) color = '#f59e0b'; // orange
                    else if (msg.includes('→ Node is')) color = '#fb923c'; // orange-400
                    else if (msg.includes('→ CASE:')) color = '#fdba74'; // orange-300
                    else if (msg.includes('Computing')) color = '#c084fc'; // purple
                    else if (msg.includes('Choose u') || msg.includes('Choose dv')) color = '#34d399'; // emerald
                    else if (msg.includes('Compute du')) color = '#22d3ee'; // cyan
                    else if (msg.includes('Result')) color = '#a78bfa'; // purple
                    else if (msg.includes('┌─') || msg.includes('└─')) color = '#60a5fa'; // blue
                    else if (msg.includes('│')) color = '#60a5fa'; // blue
                    else if (msg.includes('Formula:')) color = '#10b981'; // green
                    
                    return `
                        <div class="debug-log-line" style="margin-left: ${indent}px;">
                            <span class="debug-log-text" style="color: ${color};">${escapeHtml(msg)}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    
    // Append to existing steps content
    stepsContent.innerHTML += debugHTML;
    
    panel.style.display = 'block';
    
    setTimeout(() => stepsContent.scrollIntoView({ behavior: 'smooth' }), 100);
}

// Toggle debug section expansion
function toggleDebugSection(sectionId) {
    const section = document.getElementById(`debug-section-${sectionId}`);
    const header = section.previousElementSibling;
    const icon = header.querySelector('.debug-expand-icon');
    
    if (section.style.display === 'none') {
        section.style.display = 'block';
        icon.textContent = '▼';
        icon.style.transform = 'rotate(0deg)';
    } else {
        section.style.display = 'none';
        icon.textContent = '▶';
        icon.style.transform = 'rotate(0deg)';
    }
}

// Helper to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Convert expression to LaTeX (simple conversions)
function convertToLatex(expr) {
    if (!expr) return '';
    // Helper: match balanced parentheses from position after opening paren
    function matchBalancedParen(s, start) {
        let depth = 1, i = start;
        while (i < s.length && depth > 0) {
            if (s[i] === '(') depth++;
            else if (s[i] === ')') depth--;
            i++;
        }
        return depth === 0 ? i : -1;
    }
    // Replace function calls with balanced parens
    function replaceFn(s, fn, latexFn) {
        let result = '', i = 0;
        while (i < s.length) {
            const idx = s.indexOf(fn + '(', i);
            if (idx === -1) { result += s.slice(i); break; }
            result += s.slice(i, idx);
            const argStart = idx + fn.length + 1;
            const argEnd = matchBalancedParen(s, argStart);
            if (argEnd === -1) { result += s.slice(idx); break; }
            const arg = s.slice(argStart, argEnd - 1);
            result += latexFn(arg);
            i = argEnd;
        }
        return result;
    }
    let r = expr;
    r = replaceFn(r, 'exp', a => `e^{${a}}`);
    r = replaceFn(r, 'sqrt', a => `\\sqrt{${a}}`);
    r = replaceFn(r, 'ln', a => `\\ln(${a})`);
    r = replaceFn(r, 'sin', a => `\\sin(${a})`);
    r = replaceFn(r, 'cos', a => `\\cos(${a})`);
    r = replaceFn(r, 'tan', a => `\\tan(${a})`);
    r = replaceFn(r, 'arcsin', a => `\\arcsin(${a})`);
    r = replaceFn(r, 'arccos', a => `\\arccos(${a})`);
    r = replaceFn(r, 'arctan', a => `\\arctan(${a})`);
    r = r.replace(/\*/g, ' \\cdot ').replace(/\//g, ' / ');
    return r;
}

// Show Taylor Series
function showTaylorSeries(taylor) {
    const panel = document.getElementById('stepsPanel');
    const stepsContent = document.getElementById('stepsContent');
    
    const taylorHTML = `
        <div class="glass-panel" style="background: rgba(167, 139, 250, 0.1); border: 2px solid rgba(167, 139, 250, 0.3); padding: 1.5rem; margin-bottom: 1rem;">
            <h3 style="color: #a78bfa; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                <span>📈</span> Taylor Series Expansion
            </h3>
            <div style="background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <div style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.5rem;">Expanded around x = ${taylor.center}</div>
                <div style="color: #fff; font-family: 'JetBrains Mono', monospace; font-size: 1.1rem;">
                    ${escapeHtml(taylor.infix)}
                </div>
            </div>
            <div style="color: #94a3b8; font-size: 0.85rem;">
                Terms shown: ${taylor.terms.length}
            </div>
        </div>
    `;
    
    // Prepend to steps content
    if (panel.style.display === 'block') {
        stepsContent.innerHTML = taylorHTML + stepsContent.innerHTML;
    } else {
        stepsContent.innerHTML = taylorHTML;
        panel.style.display = 'block';
    }
}

// Show Error
// Red failed-state on the results panel + processed tree when the result still
// contains an unevaluated 'integral' marker (i.e. the engine could not solve it).
function setSolveFailedState(failed) {
    const rp = document.getElementById('resultsPanel');
    if (rp) {
        rp.classList.toggle('failed', failed);
        let badge = rp.querySelector('.failed-badge');
        if (failed && !badge) {
            badge = document.createElement('span');
            badge.className = 'failed-badge';
            badge.textContent = 'FAILED — no antiderivative found';
            rp.querySelector('.panel-title')?.appendChild(badge);
        } else if (!failed && badge) {
            badge.remove();
        }
    }
    document.getElementById('treeProcessed')?.closest('.tree-column')?.classList.toggle('failed', failed);
}

function showError(message) {
    const banner = document.getElementById('errorBanner');
    if (!banner) { console.error('Error:', message); return; }
    banner.textContent = String(message);   // textContent, not innerHTML — safe
    banner.hidden = false;
    clearTimeout(showError._timer);
    showError._timer = setTimeout(() => { banner.hidden = true; }, 8000);
}

// Parse Variables
function parseVariables(input) {
    const vars = {};
    const parts = input.trim().split(/\s+/);
    for (let i = 0; i < parts.length; i += 2) {
        if (i + 1 < parts.length) {
            vars[parts[i]] = parseFloat(parts[i + 1]);
        }
    }
    return vars;
}

// Extract variable names from formula string
const VAR_COLORS = ['#60a5fa','#f472b6','#34d399','#fbbf24','#a78bfa','#fb923c','#22d3ee','#f87171'];
function extractVarsFromFormula() {
    const formula = state.originalExpression?.formula || '';
    // Match single-letter vars that are not part of function names
    const funcNames = new Set(['sin','cos','tan','exp','ln','log','sqrt','arcsin','arccos','arctan','sinh','cosh','tanh','sec','csc','cot','abs','pi']);
    const tokens = formula.match(/[a-zA-Z]+/g) || [];
    const vars = new Set();
    tokens.forEach(t => {
        if (t.length === 1 && !funcNames.has(t) && t !== 'e' && t !== 'i') vars.add(t);
    });
    return Array.from(vars).sort();
}

function varChipHTML(v, idx, selected, clickAction) {
    const c = VAR_COLORS[idx % VAR_COLORS.length];
    const sel = selected ? `background:${c};color:#111;font-weight:700;` : `background:rgba(255,255,255,0.08);color:${c};border:1.5px solid ${c};`;
    return `<span class="var-chip" style="${sel}padding:4px 14px;border-radius:20px;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:0.95rem;display:inline-block;transition:all 0.15s;" onclick="${clickAction}">${v}</span>`;
}

function varColorStyle(v) {
    const vars = extractVarsFromFormula();
    const idx = vars.indexOf(v);
    return VAR_COLORS[(idx >= 0 ? idx : 0) % VAR_COLORS.length];
}

// Initialize Wobble Effects
function initWobbleEffects() {
    // Add subtle parallax effect to orbs
    document.addEventListener('mousemove', (e) => {
        const orbs = document.querySelectorAll('.orb');
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;
        
        orbs.forEach((orb, i) => {
            const speed = (i + 1) * 10;
            orb.style.transform = `translate(${x * speed}px, ${y * speed}px)`;
        });
    });
}

// Theme system
window.setTheme = function(theme) {
    document.body.className = theme === 'default' ? '' : `theme-${theme}`;
    localStorage.setItem('mathviz-theme', theme);
};
// Restore saved theme on load
(function() {
    const saved = localStorage.getItem('mathviz-theme');
    if (saved && saved !== 'default') {
        document.body.className = `theme-${saved}`;
        const sel = document.getElementById('themeSelector');
        if (sel) sel.value = saved;
    }
})();
