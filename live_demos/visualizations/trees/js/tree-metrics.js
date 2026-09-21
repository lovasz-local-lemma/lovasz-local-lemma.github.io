/* Read-only structure measurements: no search calls, splaying or operation-log changes. */
const TreeMetrics = {
    meanNodeVisits(root) {
        let keys = 0, visits = 0;
        const walk = (node, depth) => {
            if (!node) return;
            const count = Array.isArray(node.keys) ? node.keys.length : 1;
            keys += count;
            visits += count * depth;
            if (Array.isArray(node.children)) node.children.forEach(child => walk(child, depth + 1));
            else { walk(node.left, depth + 1); walk(node.right, depth + 1); }
        };
        walk(root, 1);
        return keys ? visits / keys : 0;
    }
};
if (typeof module !== 'undefined') module.exports = TreeMetrics;
