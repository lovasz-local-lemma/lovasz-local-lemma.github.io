/**
 * Data Panel - Display algorithm state
 * Shows matrices, distances, queues, etc.
 */

import { COLORS } from '../core/Constants.js';
import { formatDistance } from '../core/Utils.js';

export class DataPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentAlgorithm = null;
    }

    /**
     * Update panel with algorithm state
     */
    update(algorithm, step) {
        if (!this.container) return;

        this.currentAlgorithm = algorithm;

        // Clear previous content
        this.container.innerHTML = '';

        // Render based on algorithm type
        if (algorithm === 'floyd') {
            this.renderFloydWarshallData(step);
        } else if (algorithm === 'dijkstra' || algorithm === 'spfa') {
            this.renderSingleSourceData(step);
        } else if (algorithm === 'bellman') {
            this.renderBellmanFordData(step);
        } else if (algorithm === 'prim' || algorithm === 'prim-unoptimized') {
            this.renderPrimData(step);
        } else if (algorithm === 'kruskal') {
            this.renderKruskalData(step);
        }
    }

    /**
     * Render Floyd-Warshall data (matrices)
     */
    renderFloydWarshallData(step) {
        const section = this.createSection('Floyd-Warshall Matrices');

        // Current K, I, J
        if (step.k !== undefined && step.i !== undefined && step.j !== undefined) {
            const infoDiv = document.createElement('div');
            infoDiv.className = 'data-highlight';
            infoDiv.innerHTML = `
                <strong>Current:</strong> k=${step.k}, i=${step.i}, j=${step.j}<br>
                <strong>Comparing:</strong> dist[${step.i}][${step.j}] vs dist[${step.i}][${step.k}] + dist[${step.k}][${step.j}]
            `;
            section.appendChild(infoDiv);
        }

        // Distance matrix
        if (step.dist) {
            const distTitle = document.createElement('h4');
            distTitle.textContent = 'Distance Matrix:';
            section.appendChild(distTitle);
            section.appendChild(this.createMatrix(step.dist, step.i, step.j, step.k));
        }

        // Next matrix (for path reconstruction) - only show in path-tracking mode
        if (step.next && step.showNext !== false) {
            const nextTitle = document.createElement('h4');
            nextTitle.textContent = 'Next Matrix (Path Tracking):';
            nextTitle.style.marginTop = '15px';
            section.appendChild(nextTitle);
            section.appendChild(this.createMatrix(step.next, step.i, step.j, step.k, true));
        }

        this.container.appendChild(section);
    }

    /**
     * Render single-source algorithm data (Dijkstra, SPFA)
     */
    renderSingleSourceData(step) {
        const section = this.createSection('Algorithm State');

        // Distances array
        if (step.distances) {
            const distTitle = document.createElement('h4');
            distTitle.textContent = 'Distances:';
            section.appendChild(distTitle);
            section.appendChild(this.createArray(step.distances, step.current));
        }

        // Visited array
        if (step.visited) {
            const visitedTitle = document.createElement('h4');
            visitedTitle.textContent = 'Visited:';
            visitedTitle.style.marginTop = '15px';
            section.appendChild(visitedTitle);
            section.appendChild(this.createBooleanArray(step.visited, step.current));
        }

        // Priority Queue
        if (step.priorityQueue && step.priorityQueue.length > 0) {
            const pqTitle = document.createElement('h4');
            pqTitle.textContent = 'Priority Queue:';
            pqTitle.style.marginTop = '15px';
            section.appendChild(pqTitle);
            section.appendChild(this.createPriorityQueue(step.priorityQueue));
        }

        // Queue (for SPFA)
        if (step.queue) {
            const queueTitle = document.createElement('h4');
            queueTitle.textContent = 'Queue:';
            queueTitle.style.marginTop = '15px';
            section.appendChild(queueTitle);
            section.appendChild(this.createQueue(step.queue, step.inQueue));
        }

        this.container.appendChild(section);
    }

    /**
     * Render Bellman-Ford data
     */
    renderBellmanFordData(step) {
        const section = this.createSection('Bellman-Ford State');

        // Iteration info
        if (step.iteration !== undefined) {
            const iterDiv = document.createElement('div');
            iterDiv.className = 'data-highlight';
            iterDiv.innerHTML = `<strong>Iteration:</strong> ${step.iteration} / ${step.totalIterations || step.iteration}`;
            section.appendChild(iterDiv);
        }

        // Distances
        if (step.distances) {
            const distTitle = document.createElement('h4');
            distTitle.textContent = 'Distances:';
            section.appendChild(distTitle);
            section.appendChild(this.createArray(step.distances));
        }

        this.container.appendChild(section);
    }

    /**
     * Create section container
     */
    createSection(title) {
        const section = document.createElement('div');
        section.className = 'data-section';

        const titleElem = document.createElement('h3');
        titleElem.textContent = title;
        titleElem.style.color = COLORS.FLOYD_K;
        titleElem.style.marginBottom = '10px';
        titleElem.style.borderBottom = `2px solid ${COLORS.FLOYD_K}`;
        titleElem.style.paddingBottom = '5px';

        section.appendChild(titleElem);
        return section;
    }

    /**
     * Create matrix display
     */
    createMatrix(matrix, highlightI, highlightJ, isNext = false) {
        const table = document.createElement('table');
        table.className = 'data-matrix';
        table.style.borderCollapse = 'collapse';
        table.style.margin = '10px 0';

        const n = matrix.length;

        // Header row
        const headerRow = document.createElement('tr');
        headerRow.appendChild(document.createElement('th')); // Corner cell
        for (let j = 0; j < n; j++) {
            const th = document.createElement('th');
            th.textContent = j;
            th.style.padding = '5px 8px';
            th.style.backgroundColor = '#f0f0f0';
            th.style.border = '1px solid #ddd';
            if (j === highlightJ) {
                th.style.backgroundColor = COLORS.FLOYD_J;
                th.style.color = 'white';
            }
            headerRow.appendChild(th);
        }
        table.appendChild(headerRow);

        // Data rows
        for (let i = 0; i < n; i++) {
            const row = document.createElement('tr');

            // Row header
            const th = document.createElement('th');
            th.textContent = i;
            th.style.padding = '5px 8px';
            th.style.backgroundColor = '#f0f0f0';
            th.style.border = '1px solid #ddd';
            if (i === highlightI) {
                th.style.backgroundColor = COLORS.FLOYD_I;
                th.style.color = 'white';
            }
            row.appendChild(th);

            // Data cells
            for (let j = 0; j < n; j++) {
                const td = document.createElement('td');
                const value = matrix[i][j];
                
                if (isNext) {
                    td.textContent = value === null ? '-' : value;
                } else {
                    td.textContent = formatDistance(value);
                }

                td.style.padding = '5px 8px';
                td.style.border = '1px solid #ddd';
                td.style.textAlign = 'center';
                td.style.fontFamily = 'monospace';

                // Highlight current cell
                if (i === highlightI && j === highlightJ) {
                    td.style.backgroundColor = COLORS.FLOYD_ACCEPTED;
                    td.style.color = 'white';
                    td.style.fontWeight = 'bold';
                }
                // Diagonal
                else if (i === j) {
                    td.style.backgroundColor = '#f9f9f9';
                }

                row.appendChild(td);
            }

            table.appendChild(row);
        }

        return table;
    }

    /**
     * Create array display
     */
    createArray(array, highlight = null) {
        const container = document.createElement('div');
        container.className = 'data-array';
        container.style.display = 'flex';
        container.style.gap = '5px';
        container.style.flexWrap = 'wrap';
        container.style.margin = '10px 0';

        array.forEach((value, index) => {
            const cell = document.createElement('div');
            cell.className = 'array-cell';
            cell.innerHTML = `
                <div style="font-size: 10px; color: #666;">${index}</div>
                <div style="font-weight: bold; font-family: monospace;">${formatDistance(value)}</div>
            `;
            cell.style.padding = '8px 12px';
            cell.style.border = '1px solid #ddd';
            cell.style.borderRadius = '4px';
            cell.style.textAlign = 'center';
            cell.style.minWidth = '50px';

            if (index === highlight) {
                cell.style.backgroundColor = COLORS.CURRENT;
                cell.style.borderColor = COLORS.CURRENT;
            } else {
                cell.style.backgroundColor = '#f9f9f9';
            }

            container.appendChild(cell);
        });

        return container;
    }

    /**
     * Create boolean array display
     */
    createBooleanArray(array, highlight = null) {
        const container = document.createElement('div');
        container.className = 'data-array';
        container.style.display = 'flex';
        container.style.gap = '5px';
        container.style.flexWrap = 'wrap';
        container.style.margin = '10px 0';

        array.forEach((value, index) => {
            const cell = document.createElement('div');
            cell.className = 'array-cell';
            cell.innerHTML = `
                <div style="font-size: 10px; color: #666;">${index}</div>
                <div style="font-weight: bold;">${value ? '✓' : '✗'}</div>
            `;
            cell.style.padding = '8px 12px';
            cell.style.border = '1px solid #ddd';
            cell.style.borderRadius = '4px';
            cell.style.textAlign = 'center';
            cell.style.minWidth = '50px';

            if (value) {
                cell.style.backgroundColor = COLORS.VISITED;
                cell.style.color = 'white';
                cell.style.borderColor = COLORS.VISITED;
            } else {
                cell.style.backgroundColor = '#f9f9f9';
            }

            if (index === highlight) {
                cell.style.borderWidth = '3px';
                cell.style.borderColor = COLORS.CURRENT;
            }

            container.appendChild(cell);
        });

        return container;
    }

    /**
     * Create priority queue display
     */
    createPriorityQueue(pq) {
        const container = document.createElement('div');
        container.className = 'priority-queue';
        container.style.margin = '10px 0';

        if (pq.length === 0) {
            container.textContent = 'Empty';
            container.style.color = '#999';
            return container;
        }

        pq.forEach((item, index) => {
            const entry = document.createElement('div');
            entry.style.padding = '6px 10px';
            entry.style.margin = '3px 0';
            entry.style.backgroundColor = index === 0 ? COLORS.CURRENT : '#f0f0f0';
            entry.style.color = index === 0 ? 'white' : '#333';
            entry.style.borderRadius = '4px';
            entry.style.fontFamily = 'monospace';
            entry.style.fontSize = '13px';
            
            const nodeText = `Node ${item.node}`;
            const distText = item.distance !== undefined 
                ? `dist: ${formatDistance(item.distance)}`
                : `key: ${formatDistance(item.key)}`;
            
            entry.textContent = `${nodeText} (${distText})`;
            
            if (index === 0) {
                entry.textContent = '▶ ' + entry.textContent;
            }

            container.appendChild(entry);
        });

        return container;
    }

    /**
     * Create queue display (for SPFA)
     */
    createQueue(queue, inQueue) {
        const container = document.createElement('div');
        container.className = 'queue';
        container.style.margin = '10px 0';

        if (queue.length === 0) {
            container.textContent = 'Empty';
            container.style.color = '#999';
            return container;
        }

        const queueDisplay = document.createElement('div');
        queueDisplay.style.display = 'flex';
        queueDisplay.style.gap = '5px';
        queueDisplay.style.flexWrap = 'wrap';

        queue.forEach((nodeId, index) => {
            const cell = document.createElement('div');
            cell.textContent = nodeId;
            cell.style.padding = '8px 12px';
            cell.style.backgroundColor = index === 0 ? COLORS.CURRENT : COLORS.NEIGHBOR;
            cell.style.color = 'white';
            cell.style.borderRadius = '4px';
            cell.style.fontWeight = 'bold';
            cell.style.minWidth = '40px';
            cell.style.textAlign = 'center';
            
            if (index === 0) {
                cell.style.border = '2px solid white';
            }

            queueDisplay.appendChild(cell);
        });

        container.appendChild(queueDisplay);
        return container;
    }

    /**
     * Render Prim's algorithm data
     */
    renderPrimData(step) {
        const section = this.createSection("Prim's MST");

        // MST progress
        if (step.mstEdges) {
            const progressDiv = document.createElement('div');
            progressDiv.className = 'data-highlight';
            progressDiv.innerHTML = `<strong>MST Progress:</strong> ${step.mstEdges.length} edges added`;
            if (step.totalWeight !== undefined) {
                progressDiv.innerHTML += ` | Weight: ${step.totalWeight}`;
            }
            section.appendChild(progressDiv);
        }

        // Priority Queue with status marks
        if (step.priorityQueue) {
            const pqTitle = document.createElement('h4');
            pqTitle.textContent = 'Priority Queue:';
            pqTitle.style.marginTop = '15px';
            section.appendChild(pqTitle);
            section.appendChild(this.createPrimPriorityQueue(step.priorityQueue, step.current, step.inMST));
        }

        // MST Edges
        if (step.mstEdges && step.mstEdges.length > 0) {
            const mstTitle = document.createElement('h4');
            mstTitle.textContent = 'MST Edges:';
            mstTitle.style.marginTop = '15px';
            section.appendChild(mstTitle);
            section.appendChild(this.createMSTEdgesList(step.mstEdges));
        }

        // In MST array
        if (step.inMST) {
            const inMSTTitle = document.createElement('h4');
            inMSTTitle.textContent = 'Nodes in MST:';
            inMSTTitle.style.marginTop = '15px';
            section.appendChild(inMSTTitle);
            section.appendChild(this.createBooleanArray(step.inMST, step.current));
        }

        this.container.appendChild(section);
    }

    /**
     * Render Kruskal's algorithm data
     */
    renderKruskalData(step) {
        const section = this.createSection("Kruskal's MST");

        // MST progress
        if (step.mstEdges) {
            const progressDiv = document.createElement('div');
            progressDiv.className = 'data-highlight';
            progressDiv.innerHTML = `<strong>MST Progress:</strong> ${step.mstEdges.length} edges accepted`;
            if (step.totalWeight !== undefined) {
                progressDiv.innerHTML += ` | Weight: ${step.totalWeight}`;
            }
            section.appendChild(progressDiv);
        }

        // Sorted edges with status marks
        if (step.sortedEdges) {
            const edgesTitle = document.createElement('h4');
            edgesTitle.textContent = 'All Edges (Sorted by Weight):';
            section.appendChild(edgesTitle);
            section.appendChild(this.createKruskalEdgesList(
                step.sortedEdges,
                step.processedEdges || [],
                step.edge
            ));
        }

        // Union-Find parent array with color coding
        if (step.parent && step.setColors) {
            const parentTitle = document.createElement('h4');
            parentTitle.textContent = 'Union-Find Parent (Color Coded):';
            parentTitle.style.marginTop = '15px';
            section.appendChild(parentTitle);
            section.appendChild(this.createColorCodedParentArray(step.parent, step.setColors));
        }

        this.container.appendChild(section);
    }

    /**
     * Create color-coded parent array for Union-Find
     */
    createColorCodedParentArray(parent, setColors) {
        const container = document.createElement('div');
        container.className = 'data-array';
        container.style.display = 'flex';
        container.style.gap = '5px';
        container.style.flexWrap = 'wrap';
        container.style.margin = '10px 0';

        // Helper to find root
        const findRoot = (node) => {
            if (parent[node] === node) return node;
            return findRoot(parent[node]);
        };

        parent.forEach((value, index) => {
            const root = findRoot(index);
            const color = setColors[root] || '#ccc';
            
            const cell = document.createElement('div');
            cell.className = 'array-cell';
            cell.innerHTML = `
                <div style="font-size: 10px; color: #666;">node ${index}</div>
                <div style="font-weight: bold; font-family: monospace; font-size: 16px;">${value}</div>
                <div style="font-size: 9px; color: #666;">root: ${root}</div>
            `;
            cell.style.padding = '8px 10px';
            cell.style.border = `2px solid ${color}`;
            cell.style.borderRadius = '4px';
            cell.style.textAlign = 'center';
            cell.style.minWidth = '60px';
            cell.style.backgroundColor = this.lightenColor(color, 80);

            container.appendChild(cell);
        });

        return container;
    }

    /**
     * Lighten color for background
     */
    lightenColor(color, amount) {
        // Handle HSL colors
        if (color.startsWith('hsl')) {
            const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (match) {
                const h = match[1];
                const s = Math.max(0, parseInt(match[2]) - 20); // Reduce saturation
                const l = Math.min(95, parseInt(match[3]) + amount / 2.55);
                return `hsl(${h}, ${s}%, ${l}%)`;
            }
        }
        return color;
    }

    /**
     * Create Prim priority queue with status marks
     */
    createPrimPriorityQueue(pq, currentNode, inMST) {
        const container = document.createElement('div');
        container.className = 'priority-queue';
        container.style.margin = '10px 0';

        if (pq.length === 0) {
            container.textContent = 'Empty';
            container.style.color = '#999';
            return container;
        }

        pq.forEach((item, index) => {
            const entry = document.createElement('div');
            entry.style.padding = '8px 10px';
            entry.style.margin = '3px 0';
            entry.style.borderRadius = '4px';
            entry.style.fontFamily = 'monospace';
            entry.style.fontSize = '13px';
            entry.style.display = 'flex';
            entry.style.justifyContent = 'space-between';
            entry.style.alignItems = 'center';
            
            // Check if this entry is stale
            const isStale = inMST && inMST[item.node];
            const isCurrent = item.node === currentNode && index === 0;
            
            if (isStale) {
                entry.style.backgroundColor = '#ffebee';
                entry.style.color = '#666';
                entry.style.textDecoration = 'line-through';
            } else if (isCurrent) {
                entry.style.backgroundColor = COLORS.CURRENT;
                entry.style.color = 'white';
                entry.style.fontWeight = 'bold';
            } else {
                entry.style.backgroundColor = '#f0f0f0';
                entry.style.color = '#333';
            }
            
            const edgeText = item.from !== undefined 
                ? `${item.from} → ${item.node}` 
                : `Start: ${item.node}`;
            const keyText = `(weight: ${formatDistance(item.key)})`;
            
            const textSpan = document.createElement('span');
            textSpan.textContent = `${edgeText} ${keyText}`;
            entry.appendChild(textSpan);

            // Status badge
            const badge = document.createElement('span');
            badge.style.padding = '2px 6px';
            badge.style.borderRadius = '10px';
            badge.style.fontSize = '10px';
            badge.style.fontWeight = 'bold';
            
            if (isStale) {
                badge.textContent = 'STALE';
                badge.style.backgroundColor = '#f44336';
                badge.style.color = 'white';
            } else if (isCurrent) {
                badge.textContent = 'TOP';
                badge.style.backgroundColor = 'white';
                badge.style.color = COLORS.CURRENT;
            }
            
            if (badge.textContent) {
                entry.appendChild(badge);
            }

            container.appendChild(entry);
        });

        return container;
    }

    /**
     * Create Kruskal edges list with status marks
     */
    createKruskalEdgesList(allEdges, processedEdges, currentEdge) {
        const container = document.createElement('div');
        container.style.margin = '10px 0';
        container.style.maxHeight = '400px';
        container.style.overflowY = 'auto';

        allEdges.forEach((edge, index) => {
            const entry = document.createElement('div');
            entry.style.padding = '8px 10px';
            entry.style.margin = '3px 0';
            entry.style.borderRadius = '4px';
            entry.style.fontFamily = 'monospace';
            entry.style.fontSize = '13px';
            entry.style.display = 'flex';
            entry.style.justifyContent = 'space-between';
            entry.style.alignItems = 'center';
            
            // Find status of this edge
            const processed = processedEdges.find(e => 
                e.from === edge.from && e.to === edge.to
            );
            const isCurrent = currentEdge && 
                currentEdge.from === edge.from && 
                currentEdge.to === edge.to;
            
            if (processed) {
                if (processed.status === 'accepted') {
                    entry.style.backgroundColor = '#e8f5e9';
                    entry.style.borderLeft = '4px solid #4caf50';
                } else {
                    entry.style.backgroundColor = '#fff3e0';
                    entry.style.borderLeft = '4px solid #ff9800';
                }
            } else if (isCurrent) {
                entry.style.backgroundColor = COLORS.CURRENT;
                entry.style.color = 'white';
                entry.style.fontWeight = 'bold';
            } else {
                entry.style.backgroundColor = '#f9f9f9';
                entry.style.borderLeft = '4px solid #ddd';
            }
            
            const textSpan = document.createElement('span');
            textSpan.textContent = `${edge.from} → ${edge.to} (weight: ${edge.weight})`;
            entry.appendChild(textSpan);

            // Status badge
            const badge = document.createElement('span');
            badge.style.padding = '2px 6px';
            badge.style.borderRadius = '10px';
            badge.style.fontSize = '10px';
            badge.style.fontWeight = 'bold';
            
            if (processed) {
                if (processed.status === 'accepted') {
                    badge.textContent = '✓ ACCEPTED';
                    badge.style.backgroundColor = '#4caf50';
                    badge.style.color = 'white';
                } else {
                    badge.textContent = '✗ REJECTED';
                    badge.style.backgroundColor = '#ff9800';
                    badge.style.color = 'white';
                }
            } else if (isCurrent) {
                badge.textContent = 'CHECKING';
                badge.style.backgroundColor = 'white';
                badge.style.color = COLORS.CURRENT;
            } else {
                badge.textContent = 'PENDING';
                badge.style.backgroundColor = '#ddd';
                badge.style.color = '#666';
            }
            
            entry.appendChild(badge);
            container.appendChild(entry);
        });

        return container;
    }

    /**
     * Create MST edges list
     */
    createMSTEdgesList(mstEdges) {
        const container = document.createElement('div');
        container.style.margin = '10px 0';

        if (mstEdges.length === 0) {
            container.textContent = 'No edges yet';
            container.style.color = '#999';
            return container;
        }

        mstEdges.forEach((edge, index) => {
            const entry = document.createElement('div');
            entry.style.padding = '6px 10px';
            entry.style.margin = '3px 0';
            entry.style.backgroundColor = '#e8f5e9';
            entry.style.borderLeft = '3px solid #4caf50';
            entry.style.borderRadius = '4px';
            entry.style.fontFamily = 'monospace';
            entry.style.fontSize = '13px';
            
            entry.textContent = `${index + 1}. ${edge.from} → ${edge.to} (weight: ${edge.weight})`;
            
            container.appendChild(entry);
        });

        return container;
    }

    /**
     * Clear panel
     */
    clear() {
        if (this.container) {
            this.container.innerHTML = '<p style="color: #999; padding: 20px; text-align: center;">No data to display</p>';
        }
    }
}
