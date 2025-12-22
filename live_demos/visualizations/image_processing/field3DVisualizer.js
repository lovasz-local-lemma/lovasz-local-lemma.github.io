export class Field3DVisualizer {
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

        // Vertex shader for surface mesh
        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec3 aColor;
            
            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;
            
            varying vec3 vColor;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
                vColor = aColor;
            }
        `;

        // Fragment shader
        const fragmentShaderSource = `
            precision mediump float;
            varying vec3 vColor;
            
            void main() {
                gl_FragColor = vec4(vColor, 0.8);
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

        // Get locations
        this.positionLocation = gl.getAttribLocation(this.program, 'aPosition');
        this.colorLocation = gl.getAttribLocation(this.program, 'aColor');
        this.modelViewMatrixLocation = gl.getUniformLocation(this.program, 'uModelViewMatrix');
        this.projectionMatrixLocation = gl.getUniformLocation(this.program, 'uProjectionMatrix');

        // Enable depth testing
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);

        // Enable blending
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

    // Visualize 2D field as 3D surface
    visualizeField(field, width, height, scale = 1.0) {
        if (!this.gl) return;

        const vertices = [];
        const colors = [];
        const indices = [];

        // Find max value for normalization
        let maxVal = 0;
        for (let i = 0; i < field.length; i++) {
            maxVal = Math.max(maxVal, Math.abs(field[i]));
        }

        // Sample rate for performance
        const sampleRate = Math.max(1, Math.floor(Math.max(width, height) / 64));

        // Generate mesh
        let vertexIndex = 0;
        for (let y = 0; y < height; y += sampleRate) {
            for (let x = 0; x < width; x += sampleRate) {
                const idx = y * width + x;
                const value = field[idx];
                
                // Normalize coordinates
                const nx = (x / width) * 2 - 1;
                const ny = (y / height) * 2 - 1;
                const nz = (value / maxVal) * scale;

                vertices.push(nx, ny, nz);

                // Color based on height
                const t = (value / maxVal + 1) / 2; // Normalize to [0, 1]
                const r = Math.max(0, Math.min(1, 2 * t));
                const g = Math.max(0, Math.min(1, 2 * (1 - Math.abs(t - 0.5))));
                const b = Math.max(0, Math.min(1, 2 * (1 - t)));

                colors.push(r, g, b);
                vertexIndex++;
            }
        }

        // Generate triangle indices
        const gridWidth = Math.ceil(width / sampleRate);
        const gridHeight = Math.ceil(height / sampleRate);

        for (let y = 0; y < gridHeight - 1; y++) {
            for (let x = 0; x < gridWidth - 1; x++) {
                const i0 = y * gridWidth + x;
                const i1 = y * gridWidth + (x + 1);
                const i2 = (y + 1) * gridWidth + x;
                const i3 = (y + 1) * gridWidth + (x + 1);

                // Two triangles per quad
                indices.push(i0, i1, i2);
                indices.push(i1, i3, i2);
            }
        }

        this.vertices = new Float32Array(vertices);
        this.colors = new Float32Array(colors);
        this.indices = new Uint16Array(indices);

        this.render();
    }

    // Visualize gradient field as vector field
    visualizeVectorField(gradX, gradY, width, height) {
        if (!this.gl) return;

        const vertices = [];
        const colors = [];

        // Sample rate
        const sampleRate = Math.max(1, Math.floor(Math.max(width, height) / 32));

        // Find max magnitude
        let maxMag = 0;
        for (let i = 0; i < gradX.length; i++) {
            const mag = Math.sqrt(gradX[i] * gradX[i] + gradY[i] * gradY[i]);
            maxMag = Math.max(maxMag, mag);
        }

        // Generate vector lines
        for (let y = 0; y < height; y += sampleRate) {
            for (let x = 0; x < width; x += sampleRate) {
                const idx = y * width + x;
                
                const gx = gradX[idx] / maxMag * 0.1;
                const gy = gradY[idx] / maxMag * 0.1;
                const mag = Math.sqrt(gx * gx + gy * gy);

                if (mag < 0.01) continue;

                const nx = (x / width) * 2 - 1;
                const ny = (y / height) * 2 - 1;

                // Start point
                vertices.push(nx, ny, 0);
                // End point
                vertices.push(nx + gx, ny + gy, mag * 2);

                // Color based on magnitude
                const t = mag / 0.1;
                colors.push(t, 1 - t, 0.5);
                colors.push(t, 1 - t, 0.5);
            }
        }

        this.vertices = new Float32Array(vertices);
        this.colors = new Float32Array(colors);
        this.indices = null; // Use line rendering
        this.isVectorField = true;

        this.render();
    }

    render() {
        if (!this.gl || !this.vertices) return;

        const gl = this.gl;

        // Clear
        gl.clearColor(0.1, 0.1, 0.15, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Use program
        gl.useProgram(this.program);

        // Vertex buffer
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.positionLocation);
        gl.vertexAttribPointer(this.positionLocation, 3, gl.FLOAT, false, 0, 0);

        // Color buffer
        const colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.colors, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.colorLocation);
        gl.vertexAttribPointer(this.colorLocation, 3, gl.FLOAT, false, 0, 0);

        // Matrices
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
        if (this.isVectorField) {
            gl.drawArrays(gl.LINES, 0, this.vertices.length / 3);
        } else if (this.indices) {
            const indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);
            gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0);
        }
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
        this.translate(mat, 0, 0, -3);
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
        this.indices = null;
        this.isVectorField = false;

        const gl = this.gl;
        gl.clearColor(0.1, 0.1, 0.15, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
}
