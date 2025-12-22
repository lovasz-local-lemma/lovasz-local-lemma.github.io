export class HoughCircleGPU {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        
        if (!this.gl) {
            console.warn('WebGL not available, falling back to CPU');
            this.useGPU = false;
            return;
        }
        
        this.useGPU = true;
        this.width = 512;
        this.height = 512;
        this.initShaders();
    }

    initShaders() {
        const gl = this.gl;

        // Vertex shader for full-screen quad
        const vertexShaderSource = `
            attribute vec2 a_position;
            varying vec2 v_texCoord;
            
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_position * 0.5 + 0.5;
            }
        `;

        // Fragment shader for Hough accumulation
        const fragmentShaderSource = `
            precision highp float;
            uniform sampler2D u_image;
            uniform vec2 u_resolution;
            uniform float u_radius;
            uniform int u_numSamples;
            varying vec2 v_texCoord;
            
            const float PI = 3.14159265359;
            
            void main() {
                vec2 pixelCoord = v_texCoord * u_resolution;
                float accumulator = 0.0;
                
                // For this center position, check if there are edge pixels at distance r
                for (int i = 0; i < 64; i++) {
                    if (i >= u_numSamples) break;
                    
                    float theta = float(i) / float(u_numSamples) * 2.0 * PI;
                    vec2 edgePos = pixelCoord + vec2(
                        u_radius * cos(theta),
                        u_radius * sin(theta)
                    );
                    
                    // Check if edge pixel exists at this position
                    vec2 edgeTexCoord = edgePos / u_resolution;
                    if (edgeTexCoord.x >= 0.0 && edgeTexCoord.x <= 1.0 &&
                        edgeTexCoord.y >= 0.0 && edgeTexCoord.y <= 1.0) {
                        vec4 edgeColor = texture2D(u_image, edgeTexCoord);
                        float intensity = (edgeColor.r + edgeColor.g + edgeColor.b) / 3.0;
                        if (intensity > 0.4) {
                            accumulator += 1.0;
                        }
                    }
                }
                
                gl_FragColor = vec4(accumulator / float(u_numSamples), 0.0, 0.0, 1.0);
            }
        `;

        // Compile shaders
        const vertexShader = this.compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
        const fragmentShader = this.compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);

        // Create program
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(this.program));
            this.useGPU = false;
            return;
        }

        // Get attribute and uniform locations
        this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
        this.imageLocation = gl.getUniformLocation(this.program, 'u_image');
        this.resolutionLocation = gl.getUniformLocation(this.program, 'u_resolution');
        this.radiusLocation = gl.getUniformLocation(this.program, 'u_radius');
        this.numSamplesLocation = gl.getUniformLocation(this.program, 'u_numSamples');

        // Create full-screen quad
        const positions = new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            1, 1
        ]);

        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        // Create texture for input image
        this.inputTexture = gl.createTexture();
        
        // Create framebuffer for output
        this.framebuffer = gl.createFramebuffer();
        this.outputTexture = gl.createTexture();
    }

    compileShader(gl, source, type) {
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

    computeHoughSpaceGPU(imageData, radius) {
        if (!this.useGPU) return null;

        const gl = this.gl;
        const width = imageData.width;
        const height = imageData.height;

        // Upload image to texture
        gl.bindTexture(gl.TEXTURE_2D, this.inputTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // Setup output texture
        gl.bindTexture(gl.TEXTURE_2D, this.outputTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        // Bind framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.outputTexture, 0);

        // Set viewport
        gl.viewport(0, 0, width, height);

        // Use program
        gl.useProgram(this.program);

        // Set uniforms
        gl.uniform1i(this.imageLocation, 0);
        gl.uniform2f(this.resolutionLocation, width, height);
        gl.uniform1f(this.radiusLocation, radius);
        
        const numSamples = Math.max(16, Math.floor(2 * Math.PI * radius / 2));
        gl.uniform1i(this.numSamplesLocation, Math.min(64, numSamples));

        // Bind input texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.inputTexture);

        // Setup position attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(this.positionLocation);
        gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Read back result
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        // Convert to Float32Array (accumulator values are in red channel)
        const accumulator = new Float32Array(width * height);
        for (let i = 0; i < width * height; i++) {
            accumulator[i] = pixels[i * 4] * numSamples; // Scale back
        }

        return accumulator;
    }

    // Detect circles by computing Hough space for multiple radii
    detectCircles(imageData, minRadius, maxRadius, threshold = 50) {
        if (!this.useGPU) {
            console.warn('GPU not available');
            return [];
        }

        const radiusStep = 2;
        const circles = [];
        const width = imageData.width;
        const height = imageData.height;

        // Compute for each radius
        for (let r = minRadius; r <= maxRadius; r += radiusStep) {
            const accumulator = this.computeHoughSpaceGPU(imageData, r);
            if (!accumulator) continue;

            // Find local maxima
            for (let y = 2; y < height - 2; y++) {
                for (let x = 2; x < width - 2; x++) {
                    const idx = y * width + x;
                    const value = accumulator[idx];

                    if (value < threshold) continue;

                    // Check if local maximum
                    let isMax = true;
                    for (let dy = -2; dy <= 2 && isMax; dy++) {
                        for (let dx = -2; dx <= 2 && isMax; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const idx2 = (y + dy) * width + (x + dx);
                            if (accumulator[idx2] > value) {
                                isMax = false;
                            }
                        }
                    }

                    if (isMax) {
                        circles.push({ x, y, r, votes: value });
                    }
                }
            }
        }

        // Sort by votes and apply non-maximum suppression
        circles.sort((a, b) => b.votes - a.votes);

        const filtered = [];
        for (const circle of circles) {
            let tooClose = false;

            for (const existing of filtered) {
                const dist = Math.sqrt(
                    Math.pow(circle.x - existing.x, 2) +
                    Math.pow(circle.y - existing.y, 2)
                );

                if (dist < 30) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                filtered.push(circle);
            }
        }

        return filtered;
    }
}
