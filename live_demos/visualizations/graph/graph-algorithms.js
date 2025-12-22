// Graph Algorithms Implementation

class GraphAlgorithms {
    /**
     * Dijkstra's Algorithm - Shortest path from source to all nodes
     */
    static *dijkstra(graph, start) {
        const n = graph.nodes.length;
        const distances = new Array(n).fill(Infinity);
        const visited = new Array(n).fill(false);
        const previous = new Array(n).fill(null);
        const pq = new MinHeap();

        distances[start] = 0;
        pq.insert({ node: start, distance: 0 });

        yield {
            type: 'init',
            current: start,
            distances: [...distances],
            visited: [...visited],
            priorityQueue: pq.heap.map(item => ({ node: item.node, distance: item.distance })),
            message: `Starting Dijkstra from node ${start}`
        };

        while (!pq.isEmpty()) {
            const { node: current, distance: pqDist } = pq.extractMin();

            // Check if this is a stale entry (distance in PQ > current best)
            if (pqDist > distances[current]) {
                yield {
                    type: 'discard',
                    current,
                    pqDistance: pqDist,
                    currentDistance: distances[current],
                    priorityQueue: pq.heap.map(item => ({ node: item.node, distance: item.distance })),
                    message: `Discarded stale entry: node ${current} with dist ${pqDist} (current best: ${distances[current]})`
                };
                continue;
            }

            if (visited[current]) continue;
            visited[current] = true;

            yield {
                type: 'visit',
                current,
                distances: [...distances],
                visited: [...visited],
                priorityQueue: pq.heap.map(item => ({ node: item.node, distance: item.distance })),
                message: `Visiting node ${current} (distance: ${distances[current]})`
            };

            // Get neighbors
            const neighbors = this.getNeighbors(graph, current);
            
            // Indicate start of neighbor batch
            yield {
                type: 'begin_batch',
                current,
                neighborCount: neighbors.length,
                distances: [...distances],
                priorityQueue: pq.heap.map(item => ({ node: item.node, distance: item.distance })),
                message: `Exploring ${neighbors.length} neighbors of node ${current}`
            };
            
            for (const { node: neighbor, weight } of neighbors) {
                if (visited[neighbor]) continue;

                const newDistance = distances[current] + weight;

                yield {
                    type: 'explore',
                    current,
                    neighbor,
                    edge: this.findEdge(graph, current, neighbor),
                    distances: [...distances],
                    message: `Exploring edge ${current} → ${neighbor} (weight: ${weight})`
                };

                if (newDistance < distances[neighbor]) {
                    distances[neighbor] = newDistance;
                    previous[neighbor] = current;
                    pq.insert({ node: neighbor, distance: newDistance });

                    yield {
                        type: 'relax',
                        current,
                        neighbor,
                        edge: this.findEdge(graph, current, neighbor),
                        distances: [...distances],
                        previous: [...previous],
                        priorityQueue: pq.heap.map(item => ({ node: item.node, distance: item.distance })),
                        message: `Updated distance to ${neighbor}: ${newDistance} (pushed to PQ)`
                    };
                }
            }
        }

        yield {
            type: 'complete',
            distances: [...distances],
            previous: [...previous],
            visited: [...visited],
            message: 'Algorithm complete!'
        };
    }

    /**
     * Prim's Algorithm - Minimum Spanning Tree
     */
    static *prim(graph, start) {
        const n = graph.nodes.length;
        const inMST = new Array(n).fill(false);
        const visitedNodes = new Set();
        const key = new Array(n).fill(Infinity);
        const parent = new Array(n).fill(null);
        const pq = new MinHeap();
        const mstEdges = [];

        key[start] = 0;
        pq.insert({ node: start, key: 0 });

        // Helper: Convert PQ to edge list for visualization
        const getPQEdges = () => {
            return pq.heap
                .filter(item => parent[item.node] !== null)
                .map(item => this.findEdge(graph, parent[item.node], item.node))
                .filter(e => e !== null);
        };

        yield {
            type: 'init',
            current: start,
            inMST: [...inMST],
            visitedNodes: new Set(),
            mstEdges: [],
            priorityQueue: [{ node: start, key: 0 }],
            pqEdges: [],
            message: `Starting Prim's MST from node ${start}, added to PQ`
        };

        while (!pq.isEmpty()) {
            // Show PQ top before popping
            const top = pq.peek();
            yield {
                type: 'pq_peek',
                topNode: top.node,
                topKey: top.key,
                inMST: [...inMST],
                visitedNodes: new Set(visitedNodes),
                mstEdges: [...mstEdges],
                priorityQueue: pq.heap.map(item => ({ node: item.node, key: item.key })),
                pqEdges: getPQEdges(),
                message: `PQ top: edge to node ${top.node} (weight: ${top.key})`
            };

            const { node: current, key: edgeWeight } = pq.extractMin();

            // Show popping from PQ
            yield {
                type: 'pq_pop',
                current,
                edgeWeight,
                inMST: [...inMST],
                visitedNodes: new Set(visitedNodes),
                mstEdges: [...mstEdges],
                priorityQueue: pq.heap.map(item => ({ node: item.node, key: item.key })),
                pqEdges: getPQEdges(),
                message: `Popped node ${current} from PQ (weight: ${edgeWeight})`
            };

            // Check if already in MST (internal edge - skip)
            if (inMST[current]) {
                yield {
                    type: 'pq_skip',
                    current,
                    inMST: [...inMST],
                    visitedNodes: new Set(visitedNodes),
                    mstEdges: [...mstEdges],
                    priorityQueue: pq.heap.map(item => ({ node: item.node, key: item.key })),
                    pqEdges: getPQEdges(),
                    message: `Node ${current} already in MST - skip (stale entry)`
                };
                continue;
            }

            // Add to MST
            inMST[current] = true;
            visitedNodes.add(current);

            if (parent[current] !== null) {
                const edge = this.findEdge(graph, parent[current], current);
                if (edge) mstEdges.push(edge);
            }

            yield {
                type: 'add_to_mst',
                current,
                parent: parent[current],
                inMST: [...inMST],
                visitedNodes: new Set(visitedNodes),
                mstEdges: [...mstEdges],
                priorityQueue: pq.heap.map(item => ({ node: item.node, key: item.key })),
                pqEdges: getPQEdges(),
                message: parent[current] !== null 
                    ? `✓ Added edge ${parent[current]} → ${current} (weight: ${edgeWeight}) to MST`
                    : `✓ Starting MST at node ${current}`
            };

            // Add all incident edges to PQ
            const neighbors = this.getNeighbors(graph, current);

            // Indicate start of neighbor batch
            yield {
                type: 'begin_batch',
                current,
                neighborCount: neighbors.length,
                inMST: [...inMST],
                visitedNodes: new Set(visitedNodes),
                mstEdges: [...mstEdges],
                priorityQueue: pq.heap.map(item => ({ node: item.node, key: item.key })),
                pqEdges: getPQEdges(),
                message: `Exploring ${neighbors.length} neighbors of node ${current}`
            };

            for (const { node: neighbor, weight } of neighbors) {
                if (inMST[neighbor]) continue; // Skip if already in MST

                if (weight < key[neighbor]) {
                    const oldKey = key[neighbor];
                    key[neighbor] = weight;
                    parent[neighbor] = current;
                    pq.insert({ node: neighbor, key: weight });

                    yield {
                        type: 'pq_add',
                        current,
                        neighbor,
                        weight,
                        oldKey,
                        visitedNodes: new Set(visitedNodes),
                        edge: this.findEdge(graph, current, neighbor),
                        priorityQueue: pq.heap.map(item => ({ node: item.node, key: item.key })),
                        pqEdges: getPQEdges(),
                        message: oldKey === Infinity 
                            ? `Added edge ${current} → ${neighbor} (weight: ${weight}) to PQ`
                            : `Updated edge to ${neighbor}: ${oldKey} → ${weight} in PQ`
                    };
                }
            }
        }

        const totalWeight = mstEdges.reduce((sum, edge) => sum + edge.weight, 0);

        yield {
            type: 'complete',
            mstEdges: [...mstEdges],
            inMST: [...inMST],
            visitedNodes: new Set(visitedNodes),
            totalWeight,
            priorityQueue: [],
            pqEdges: [],
            message: `MST complete! Total weight: ${totalWeight}`
        };
    }

    /**
     * Prim's Algorithm (Optimized) - MST with eager update using decreaseKey
     * No stale entries - updates keys in PQ instead of inserting duplicates
     */
    static *primOptimized(graph, start) {
        const n = graph.nodes.length;
        const inMST = new Array(n).fill(false);
        const visitedNodes = new Set();
        const key = new Array(n).fill(Infinity);
        const parent = new Array(n).fill(null);
        const pq = new MinHeap();
        const mstEdges = [];
        const consideredEdges = []; // Track all edges considered
        const rejectedEdges = [];   // Track edges rejected without pushing

        key[start] = 0;
        pq.insert({ node: start, key: 0 });

        // Helper: Convert PQ to edge list for visualization
        const getPQEdges = () => {
            return pq.heap
                .filter(item => parent[item.node] !== null)
                .map(item => this.findEdge(graph, parent[item.node], item.node))
                .filter(e => e !== null);
        };

        yield {
            type: 'init',
            current: start,
            inMST: [...inMST],
            visitedNodes: new Set(),
            mstEdges: [],
            priorityQueue: [{ node: start, key: 0 }],
            pqEdges: [],
            keyArray: [...key],
            consideredEdges: [],
            rejectedEdges: [],
            message: `Starting Prim's MST (Optimized) from node ${start}`
        };

        while (!pq.isEmpty()) {
            // Show PQ top before popping
            const top = pq.peek();
            yield {
                type: 'pq_peek',
                topNode: top.node,
                topKey: top.key,
                inMST: [...inMST],
                visitedNodes: new Set(visitedNodes),
                mstEdges: [...mstEdges],
                priorityQueue: pq.heap.map(item => ({ node: item.node, key: item.key })),
                pqEdges: getPQEdges(),
                keyArray: [...key],
                consideredEdges: [...consideredEdges],
                rejectedEdges: [...rejectedEdges],
                message: `PQ top: edge to node ${top.node} (weight: ${top.key})`
            };

            const { node: current, key: edgeWeight } = pq.extractMin();

            // In optimized version, no stale entries - all popped nodes are valid
            yield {
                type: 'pq_pop',
                current,
                edgeWeight,
                inMST: [...inMST],
                visitedNodes: new Set(visitedNodes),
                mstEdges: [...mstEdges],
                priorityQueue: pq.heap.map(item => ({ node: item.node, key: item.key })),
                pqEdges: getPQEdges(),
                keyArray: [...key],
                consideredEdges: [...consideredEdges],
                rejectedEdges: [...rejectedEdges],
                message: `Popped node ${current} from PQ (weight: ${edgeWeight})`
            };

            // Add to MST
            inMST[current] = true;
            visitedNodes.add(current);

            if (parent[current] !== null) {
                const edge = this.findEdge(graph, parent[current], current);
                if (edge) mstEdges.push(edge);
            }

            yield {
                type: 'add_to_mst',
                current,
                parent: parent[current],
                inMST: [...inMST],
                visitedNodes: new Set(visitedNodes),
                mstEdges: [...mstEdges],
                priorityQueue: pq.heap.map(item => ({ node: item.node, key: item.key })),
                pqEdges: getPQEdges(),
                keyArray: [...key],
                consideredEdges: [...consideredEdges],
                rejectedEdges: [...rejectedEdges],
                message: parent[current] !== null 
                    ? `✓ Added edge ${parent[current]} → ${current} (weight: ${edgeWeight}) to MST`
                    : `✓ Starting MST at node ${current}`
            };

            // Add/update incident edges to PQ
            const neighbors = this.getNeighbors(graph, current);

            // Indicate start of neighbor batch
            yield {
                type: 'begin_batch',
                current,
                neighborCount: neighbors.length,
                inMST: [...inMST],
                visitedNodes: new Set(visitedNodes),
                mstEdges: [...mstEdges],
                priorityQueue: pq.heap.map(item => ({ node: item.node, key: item.key })),
                pqEdges: getPQEdges(),
                keyArray: [...key],
                consideredEdges: [...consideredEdges],
                rejectedEdges: [...rejectedEdges],
                message: `Exploring ${neighbors.length} neighbors of node ${current}`
            };

            for (const { node: neighbor, weight } of neighbors) {
                if (inMST[neighbor]) continue; // Skip if already in MST

                const edge = this.findEdge(graph, current, neighbor);
                consideredEdges.push({ ...edge, status: 'considered' });

                if (weight < key[neighbor]) {
                    const oldKey = key[neighbor];
                    const wasInPQ = pq.contains(neighbor);
                    
                    key[neighbor] = weight;
                    parent[neighbor] = current;

                    if (wasInPQ) {
                        // Update existing entry (decreaseKey)
                        pq.decreaseKey(neighbor, weight);
                        
                        yield {
                            type: 'pq_update',
                            current,
                            neighbor,
                            weight,
                            oldKey,
                            visitedNodes: new Set(visitedNodes),
                            edge,
                            priorityQueue: pq.heap.map(item => ({ node: item.node, key: item.key })),
                            pqEdges: getPQEdges(),
                            keyArray: [...key],
                            consideredEdges: [...consideredEdges],
                            rejectedEdges: [...rejectedEdges],
                            message: `Updated edge to ${neighbor}: ${oldKey} → ${weight} in PQ (decreaseKey)`
                        };
                    } else {
                        // Add new entry
                        pq.insert({ node: neighbor, key: weight });
                        
                        yield {
                            type: 'pq_add',
                            current,
                            neighbor,
                            weight,
                            oldKey,
                            visitedNodes: new Set(visitedNodes),
                            edge,
                            priorityQueue: pq.heap.map(item => ({ node: item.node, key: item.key })),
                            pqEdges: getPQEdges(),
                            keyArray: [...key],
                            consideredEdges: [...consideredEdges],
                            rejectedEdges: [...rejectedEdges],
                            message: `Added edge ${current} → ${neighbor} (weight: ${weight}) to PQ`
                        };
                    }
                } else {
                    // Reject edge - not better than current key
                    rejectedEdges.push({ ...edge, status: 'rejected', weight, currentKey: key[neighbor] });
                    
                    yield {
                        type: 'edge_reject',
                        current,
                        neighbor,
                        weight,
                        currentKey: key[neighbor],
                        visitedNodes: new Set(visitedNodes),
                        edge,
                        priorityQueue: pq.heap.map(item => ({ node: item.node, key: item.key })),
                        pqEdges: getPQEdges(),
                        keyArray: [...key],
                        consideredEdges: [...consideredEdges],
                        rejectedEdges: [...rejectedEdges],
                        message: `✗ Rejected edge ${current} → ${neighbor} (weight: ${weight} ≥ current best: ${key[neighbor] === Infinity ? '∞' : key[neighbor]})`
                    };
                }
            }
        }

        const totalWeight = mstEdges.reduce((sum, edge) => sum + edge.weight, 0);

        yield {
            type: 'complete',
            mstEdges: [...mstEdges],
            inMST: [...inMST],
            visitedNodes: new Set(visitedNodes),
            totalWeight,
            priorityQueue: [],
            pqEdges: [],
            keyArray: [...key],
            consideredEdges: [...consideredEdges],
            rejectedEdges: [...rejectedEdges],
            message: `MST complete! Total weight: ${totalWeight}`
        };
    }

    /**
     * Kruskal's Algorithm - Minimum Spanning Tree using Union-Find
     */
    static *kruskal(graph) {
        const n = graph.nodes.length;
        const edges = [...graph.edges].sort((a, b) => a.weight - b.weight);
        const uf = new UnionFind(n);
        const mstEdges = [];
        let totalWeight = 0;

        yield {
            type: 'init',
            edges: edges.map(e => ({ ...e, status: 'pending' })),
            unionFindSets: uf.getSets(),
            message: `Starting Kruskal's MST with ${edges.length} sorted edges`
        };

        for (const edge of edges) {
            yield {
                type: 'consider',
                edge,
                mstEdges: [...mstEdges],
                unionFindSets: uf.getSets(),
                message: `Considering edge ${edge.from} - ${edge.to} (weight: ${edge.weight})`
            };

            if (uf.find(edge.from) !== uf.find(edge.to)) {
                uf.union(edge.from, edge.to);
                mstEdges.push(edge);
                totalWeight += edge.weight;

                yield {
                    type: 'accept',
                    edge,
                    mstEdges: [...mstEdges],
                    unionFindSets: uf.getSets(),
                    totalWeight,
                    message: `Accepted edge ${edge.from} - ${edge.to} (MST size: ${mstEdges.length})`
                };
            } else {
                yield {
                    type: 'reject',
                    edge,
                    mstEdges: [...mstEdges],
                    unionFindSets: uf.getSets(),
                    message: `Rejected edge ${edge.from} - ${edge.to} (would create cycle)`
                };
            }

            if (mstEdges.length === n - 1) break;
        }

        yield {
            type: 'complete',
            mstEdges: [...mstEdges],
            unionFindSets: uf.getSets(),
            totalWeight,
            message: `MST complete! Total weight: ${totalWeight}`
        };
    }

    /**
     * Bellman-Ford Algorithm - Shortest path with negative weights
     */
    static *bellmanFord(graph, start) {
        const n = graph.nodes.length;
        const distances = new Array(n).fill(Infinity);
        const previous = new Array(n).fill(null);
        
        distances[start] = 0;

        yield {
            type: 'init',
            current: start,
            distances: [...distances],
            message: `Starting Bellman-Ford from node ${start}`
        };

        // Relax edges n-1 times
        for (let i = 0; i < n - 1; i++) {
            let updated = false;

            yield {
                type: 'iteration',
                iteration: i + 1,
                distances: [...distances],
                message: `Iteration ${i + 1} of ${n - 1}`
            };

            for (const edge of graph.edges) {
                const u = edge.from;
                const v = edge.to;
                const weight = edge.weight;

                yield {
                    type: 'explore',
                    edge,
                    distances: [...distances],
                    message: `Checking edge ${u} → ${v} (weight: ${weight})`
                };

                if (distances[u] !== Infinity && distances[u] + weight < distances[v]) {
                    distances[v] = distances[u] + weight;
                    previous[v] = u;
                    updated = true;

                    yield {
                        type: 'relax',
                        edge,
                        neighbor: v,
                        current: u,
                        distances: [...distances],
                        previous: [...previous],
                        message: `Relaxed edge ${u} → ${v}, new distance: ${distances[v]}`
                    };
                }
            }

            if (!updated) {
                yield {
                    type: 'early_stop',
                    iteration: i + 1,
                    distances: [...distances],
                    message: 'No updates in this iteration, stopping early'
                };
                break;
            }
        }

        // Check for negative cycles
        for (const edge of graph.edges) {
            const u = edge.from;
            const v = edge.to;
            const weight = edge.weight;

            if (distances[u] !== Infinity && distances[u] + weight < distances[v]) {
                yield {
                    type: 'negative_cycle',
                    edge,
                    message: `Negative cycle detected at edge ${u} → ${v}!`
                };
                return;
            }
        }

        yield {
            type: 'complete',
            distances: [...distances],
            previous: [...previous],
            message: 'Algorithm complete! No negative cycles detected.'
        };
    }

    /**
     * SPFA (Shortest Path Faster Algorithm) - Improved Bellman-Ford using queue
     */
    static *spfa(graph, start) {
        const n = graph.nodes.length;
        const distances = new Array(n).fill(Infinity);
        const previous = new Array(n).fill(null);
        const inQueue = new Array(n).fill(false);
        const queue = [];
        const relaxCount = new Array(n).fill(0);

        distances[start] = 0;
        queue.push(start);
        inQueue[start] = true;

        yield {
            type: 'init',
            current: start,
            distances: [...distances],
            queue: [...queue],
            inQueue: [...inQueue],
            message: `Starting SPFA from node ${start}`
        };

        while (queue.length > 0) {
            const current = queue.shift();
            inQueue[current] = false;

            yield {
                type: 'dequeue',
                current,
                queue: [...queue],
                inQueue: [...inQueue],
                distances: [...distances],
                message: `Dequeued node ${current} (distance: ${distances[current]})`
            };

            const neighbors = this.getNeighbors(graph, current);

            // Indicate start of neighbor batch
            yield {
                type: 'begin_batch',
                current,
                neighborCount: neighbors.length,
                queue: [...queue],
                inQueue: [...inQueue],
                distances: [...distances],
                message: `Exploring ${neighbors.length} neighbors of node ${current}`
            };

            for (const { node: neighbor, weight } of neighbors) {
                const newDistance = distances[current] + weight;

                yield {
                    type: 'explore',
                    current,
                    neighbor,
                    edge: this.findEdge(graph, current, neighbor),
                    currentDist: distances[current],
                    neighborDist: distances[neighbor],
                    weight,
                    newDistance,
                    queue: [...queue],
                    inQueue: [...inQueue],
                    message: `Checking edge ${current} → ${neighbor}: ${distances[current]} + ${weight} = ${newDistance}`
                };

                if (distances[current] !== Infinity && newDistance < distances[neighbor]) {
                    distances[neighbor] = newDistance;
                    previous[neighbor] = current;
                    relaxCount[neighbor]++;

                    yield {
                        type: 'relax',
                        current,
                        neighbor,
                        edge: this.findEdge(graph, current, neighbor),
                        distances: [...distances],
                        previous: [...previous],
                        queue: [...queue],
                        inQueue: [...inQueue],
                        message: `Updated distance to ${neighbor}: ${newDistance}`
                    };

                    // Check for negative cycle
                    if (relaxCount[neighbor] >= n) {
                        yield {
                            type: 'negative_cycle',
                            node: neighbor,
                            message: `Negative cycle detected! Node ${neighbor} relaxed ${relaxCount[neighbor]} times`
                        };
                        return;
                    }

                    if (!inQueue[neighbor]) {
                        queue.push(neighbor);
                        inQueue[neighbor] = true;

                        yield {
                            type: 'enqueue',
                            neighbor,
                            queue: [...queue],
                            inQueue: [...inQueue],
                            message: `Enqueued node ${neighbor}`
                        };
                    }
                }
            }
        }

        yield {
            type: 'complete',
            distances: [...distances],
            previous: [...previous],
            message: 'SPFA complete! All reachable nodes processed.'
        };
    }

    /**
     * Floyd-Warshall Algorithm - All-pairs shortest paths
     */
    static *floydWarshall(graph) {
        const n = graph.nodes.length;
        const dist = Array(n).fill().map(() => Array(n).fill(Infinity));
        const next = Array(n).fill().map(() => Array(n).fill(null));

        // Initialize distances
        for (let i = 0; i < n; i++) {
            dist[i][i] = 0;
        }

        // Initialize with direct edges
        for (const edge of graph.edges) {
            dist[edge.from][edge.to] = edge.weight;
            next[edge.from][edge.to] = edge.to;
            
            // For undirected graphs, add reverse direction
            if (!graph.directed) {
                dist[edge.to][edge.from] = edge.weight;
                next[edge.to][edge.from] = edge.from;
            }
        }

        yield {
            type: 'init',
            dist: dist.map(row => [...row]),
            next: next.map(row => [...row]),
            message: 'Initialized distance matrix'
        };

        // Floyd-Warshall main loop
        for (let k = 0; k < n; k++) {
            yield {
                type: 'intermediate',
                k,
                dist: dist.map(row => [...row]),
                next: next.map(row => [...row]),
                message: `Using node ${k} as intermediate node`
            };

            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    if (i === j) continue;
                    
                    // Skip if pair includes the intermediate node
                    if (i === k || j === k) {
                        yield {
                            type: 'skip',
                            i, j, k,
                            dist: dist.map(row => [...row]),
                            next: next.map(row => [...row]),
                            message: `Skipped: pair (${i},${j}) includes intermediate node ${k}`
                        };
                        continue;
                    }

                    const directDist = dist[i][j];
                    const viaDist = dist[i][k] + dist[k][j];

                    yield {
                        type: 'compare',
                        i, j, k,
                        directDist,
                        viaDist,
                        distIK: dist[i][k],
                        distKJ: dist[k][j],
                        dist: dist.map(row => [...row]),
                        next: next.map(row => [...row]),
                        message: `Comparing: dist[${i}][${j}] = ${directDist === Infinity ? '∞' : directDist} vs dist[${i}][${k}] + dist[${k}][${j}] = ${dist[i][k] === Infinity ? '∞' : dist[i][k]} + ${dist[k][j] === Infinity ? '∞' : dist[k][j]} = ${viaDist === Infinity ? '∞' : viaDist}`
                    };

                    if (viaDist < directDist) {
                        const oldDist = dist[i][j];
                        dist[i][j] = viaDist;
                        next[i][j] = next[i][k];

                        yield {
                            type: 'update',
                            i, j, k,
                            oldDist,
                            newDist: dist[i][j],
                            dist: dist.map(row => [...row]),
                            next: next.map(row => [...row]),
                            message: `✓ Updated dist[${i}][${j}] via ${k}: ${oldDist === Infinity ? '∞' : oldDist} → ${dist[i][j]}`
                        };
                    }
                }
            }
        }

        yield {
            type: 'complete',
            dist: dist.map(row => [...row]),
            next: next.map(row => [...row]),
            message: 'All-pairs shortest paths computed!'
        };
    }

    // Helper methods
    static getNeighbors(graph, node) {
        const neighbors = [];
        for (const edge of graph.edges) {
            if (edge.from === node) {
                neighbors.push({ node: edge.to, weight: edge.weight });
            }
            if (!graph.directed && edge.to === node) {
                neighbors.push({ node: edge.from, weight: edge.weight });
            }
        }
        return neighbors;
    }

    static findEdge(graph, from, to) {
        return graph.edges.find(e => 
            (e.from === from && e.to === to) || 
            (!graph.directed && e.from === to && e.to === from)
        );
    }
}

// Min Heap for priority queue
class MinHeap {
    constructor() {
        this.heap = [];
    }

    insert(item) {
        this.heap.push(item);
        this.bubbleUp(this.heap.length - 1);
    }

    extractMin() {
        if (this.heap.length === 0) return null;
        if (this.heap.length === 1) return this.heap.pop();

        const min = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.bubbleDown(0);
        return min;
    }

    peek() {
        return this.heap.length > 0 ? this.heap[0] : null;
    }

    bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            const key = this.heap[index].distance || this.heap[index].key;
            const parentKey = this.heap[parentIndex].distance || this.heap[parentIndex].key;
            
            if (key >= parentKey) break;

            [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
            index = parentIndex;
        }
    }

    bubbleDown(index) {
        while (true) {
            let minIndex = index;
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;

            const currentKey = this.heap[minIndex].distance || this.heap[minIndex].key;

            if (leftChild < this.heap.length) {
                const leftKey = this.heap[leftChild].distance || this.heap[leftChild].key;
                if (leftKey < currentKey) {
                    minIndex = leftChild;
                }
            }

            if (rightChild < this.heap.length) {
                const minKey = this.heap[minIndex].distance || this.heap[minIndex].key;
                const rightKey = this.heap[rightChild].distance || this.heap[rightChild].key;
                if (rightKey < minKey) {
                    minIndex = rightChild;
                }
            }

            if (minIndex === index) break;

            [this.heap[index], this.heap[minIndex]] = [this.heap[minIndex], this.heap[index]];
            index = minIndex;
        }
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    contains(node) {
        return this.heap.some(item => item.node === node);
    }

    decreaseKey(node, newKey) {
        // Find the node in the heap
        const index = this.heap.findIndex(item => item.node === node);
        if (index === -1) return; // Node not found

        // Update the key
        this.heap[index].key = newKey;
        
        // Bubble up since we decreased the key
        this.bubbleUp(index);
    }
}

// Union-Find (Disjoint Set) for Kruskal's algorithm
class UnionFind {
    constructor(size) {
        this.parent = Array(size).fill(0).map((_, i) => i);
        this.rank = Array(size).fill(0);
        this.size = Array(size).fill(1); // Track size of each set
        this.colorMap = new Map(); // Map root to color index
        let colorIndex = 0;
        for (let i = 0; i < size; i++) {
            this.colorMap.set(i, colorIndex++);
        }
    }

    find(x) {
        if (this.parent[x] !== x) {
            this.parent[x] = this.find(this.parent[x]); // Path compression
        }
        return this.parent[x];
    }

    union(x, y) {
        const rootX = this.find(x);
        const rootY = this.find(y);

        if (rootX === rootY) return false;

        // Union by size: merge smaller into larger
        // The larger set keeps its color
        let biggerRoot, smallerRoot;
        if (this.size[rootX] >= this.size[rootY]) {
            biggerRoot = rootX;
            smallerRoot = rootY;
        } else {
            biggerRoot = rootY;
            smallerRoot = rootX;
        }
        
        // Merge smaller into bigger
        this.parent[smallerRoot] = biggerRoot;
        this.size[biggerRoot] += this.size[smallerRoot];
        
        // Bigger set keeps its color (no need to update colorMap)
        // The color is looked up by root, and biggerRoot keeps being the root

        return true;
    }

    getSets() {
        // Group nodes by their root parent with size and color info
        const sets = new Map();
        for (let i = 0; i < this.parent.length; i++) {
            const root = this.find(i);
            if (!sets.has(root)) {
                sets.set(root, {
                    nodes: [],
                    size: this.size[root],
                    colorIndex: this.colorMap.get(root)
                });
            }
            sets.get(root).nodes.push(i);
        }
        return Array.from(sets.values());
    }
}
