export class Grid3DVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        
        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }

        this.rotation = { x: 0.5, y: 0.5 };
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };

        this.initWebGL();
        this.setupMouseControls();
    }

    initWebGL() {
        const gl = this.gl;

        // Vertex shader
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec4 aColor;
            attribute float aSize;
            
            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;
            
            varying vec4 vColor;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                gl_PointSize = aSize;
                vColor = aColor;
            }
        `;

        // Fragment shader
        const fragmentShaderSource = `
            precision mediump float;
            varying vec4 vColor;
            
            void main() {
                // Make points circular and smooth
                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);
                if (dist > 0.5) discard;
                
                // Soft edge
                float alpha = vColor.a * (1.0 - smoothstep(0.3, 0.5, dist));
                gl_FragColor = vec4(vColor.rgb, alpha);
            }
        `;

        // Compile shaders
        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

        // Create program
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(this.program));
            return;
        }

        // Get attribute and uniform locations
        this.positionLocation = gl.getAttribLocation(this.program, 'aPosition');
        this.colorLocation = gl.getAttribLocation(this.program, 'aColor');
        this.sizeLocation = gl.getAttribLocation(this.program, 'aSize');
        this.modelViewMatrixLocation = gl.getUniformLocation(this.program, 'uModelViewMatrix');
        this.projectionMatrixLocation = gl.getUniformLocation(this.program, 'uProjectionMatrix');

        // Enable depth testing
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);

        // Enable blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    setupMouseControls() {
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.lastMouse.x;
                const dy = e.clientY - this.lastMouse.y;

                this.rotation.y += dx * 0.01;
                this.rotation.x += dy * 0.01;

                this.lastMouse = { x: e.clientX, y: e.clientY };
                this.render();
            }
        });

        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
        });
    }

    visualizeGrid(grid, gridWidth, gridHeight, gridDepth) {
        if (!this.gl) return;

        const vertices = [];
        const colors = [];
        const sizes = [];

        // Find max weight for normalization
        let maxWeight = 0;
        for (let i = 3; i < grid.length; i += 4) {
            maxWeight = Math.max(maxWeight, grid[i]);
        }

        // Visualize ALL grid cells (not just sampled) to show true structure
        // The bilateral grid is sparse, so most cells will have low/zero weight
        for (let z = 0; z < gridDepth; z++) {
            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    const idx = (z * gridHeight * gridWidth + y * gridWidth + x) * 4;
                    const weight = grid[idx + 3];

                    // Only show cells with significant accumulated weight
                    // These represent "clusters" of similar pixels in the 3D space
                    if (weight > 0.05) {
                        // Normalize coordinates to [-1, 1]
                        // X, Y represent spatial dimensions
                        // Z represents intensity/color dimension
                        const nx = (x / gridWidth) * 2 - 1;
                        const ny = (y / gridHeight) * 2 - 1;
                        const nz = (z / gridDepth) * 2 - 1;

                        vertices.push(nx, ny, nz);

                        // Color from accumulated RGB values in this grid cell
                        const r = grid[idx] / 255;
                        const g = grid[idx + 1] / 255;
                        const b = grid[idx + 2] / 255;
                        
                        // Alpha and size based on weight (density of cluster)
                        // Higher weight = more pixels accumulated here = denser cluster
                        const normalizedWeight = weight / maxWeight;
                        const alpha = Math.min(1.0, 0.3 + normalizedWeight * 0.7);
                        
                        colors.push(r, g, b, alpha);
                        
                        // Point size represents cluster density
                        // Larger points = more pixels accumulated (denser cluster)
                        const pointSize = 3.0 + normalizedWeight * 15.0;
                        sizes.push(pointSize);
                    }
                }
            }
        }

        this.vertices = new Float32Array(vertices);
        this.colors = new Float32Array(colors);
        this.sizes = new Float32Array(sizes);
        this.vertexCount = vertices.length / 3;

        console.log(`Visualizing ${this.vertexCount} grid cells with accumulated weights`);
        console.log(`Grid dimensions: ${gridWidth} × ${gridHeight} × ${gridDepth}`);
        console.log(`Max weight in grid: ${maxWeight.toFixed(2)}`);

        this.render();
        
        return this.vertexCount;
    }

    render() {
        if (!this.gl || !this.vertices) return;

        const gl = this.gl;

        // Clear canvas
        gl.clearColor(0.1, 0.1, 0.15, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Use program
        gl.useProgram(this.program);

        // Set up vertex buffer
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.positionLocation);
        gl.vertexAttribPointer(this.positionLocation, 3, gl.FLOAT, false, 0, 0);

        // Set up color buffer
        const colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.colors, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.colorLocation);
        gl.vertexAttribPointer(this.colorLocation, 4, gl.FLOAT, false, 0, 0);

        // Set up size buffer
        const sizeBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.sizes, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.sizeLocation);
        gl.vertexAttribPointer(this.sizeLocation, 1, gl.FLOAT, false, 0, 0);

        // Set up matrices
        const projectionMatrix = this.createPerspectiveMatrix(
            45 * Math.PI / 180,
            this.canvas.width / this.canvas.height,
            0.1,
            100.0
        );

        const modelViewMatrix = this.createModelViewMatrix();

        gl.uniformMatrix4fv(this.projectionMatrixLocation, false, projectionMatrix);
        gl.uniformMatrix4fv(this.modelViewMatrixLocation, false, modelViewMatrix);

        // Draw
        gl.drawArrays(gl.POINTS, 0, this.vertexCount);
    }

    createPerspectiveMatrix(fov, aspect, near, far) {
        const f = 1.0 / Math.tan(fov / 2);
        const rangeInv = 1.0 / (near - far);

        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (near + far) * rangeInv, -1,
            0, 0, near * far * rangeInv * 2, 0
        ]);
    }

    createModelViewMatrix() {
        const mat = this.createIdentityMatrix();

        // Translate
        this.translate(mat, 0, 0, -3);

        // Rotate
        this.rotateX(mat, this.rotation.x);
        this.rotateY(mat, this.rotation.y);

        return mat;
    }

    createIdentityMatrix() {
        return new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
    }

    translate(mat, x, y, z) {
        mat[12] += mat[0] * x + mat[4] * y + mat[8] * z;
        mat[13] += mat[1] * x + mat[5] * y + mat[9] * z;
        mat[14] += mat[2] * x + mat[6] * y + mat[10] * z;
        mat[15] += mat[3] * x + mat[7] * y + mat[11] * z;
    }

    rotateX(mat, angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const temp = new Float32Array(mat);

        mat[4] = temp[4] * c + temp[8] * s;
        mat[5] = temp[5] * c + temp[9] * s;
        mat[6] = temp[6] * c + temp[10] * s;
        mat[7] = temp[7] * c + temp[11] * s;

        mat[8] = temp[8] * c - temp[4] * s;
        mat[9] = temp[9] * c - temp[5] * s;
        mat[10] = temp[10] * c - temp[6] * s;
        mat[11] = temp[11] * c - temp[7] * s;
    }

    rotateY(mat, angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const temp = new Float32Array(mat);

        mat[0] = temp[0] * c - temp[8] * s;
        mat[1] = temp[1] * c - temp[9] * s;
        mat[2] = temp[2] * c - temp[10] * s;
        mat[3] = temp[3] * c - temp[11] * s;

        mat[8] = temp[0] * s + temp[8] * c;
        mat[9] = temp[1] * s + temp[9] * c;
        mat[10] = temp[2] * s + temp[10] * c;
        mat[11] = temp[3] * s + temp[11] * c;
    }

    clear() {
        if (!this.gl) return;
        
        this.vertices = null;
        this.colors = null;
        this.sizes = null;
        this.vertexCount = 0;

        const gl = this.gl;
        gl.clearColor(0.1, 0.1, 0.15, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
}
