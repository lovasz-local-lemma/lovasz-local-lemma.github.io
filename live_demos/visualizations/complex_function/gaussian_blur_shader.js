// Separable Gaussian Blur Shader
// Horizontal and vertical passes for efficient bloom

THREE.HorizontalBlurShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'h': { value: 1.0 / 512.0 },
        'sigma': { value: 2.0 }
    },
    
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float h;
        uniform float sigma;
        varying vec2 vUv;
        
        void main() {
            vec4 sum = vec4(0.0);
            float total = 0.0;
            
            // 9-tap gaussian blur
            for(int i = -4; i <= 4; i++) {
                float offset = float(i) * h;
                float weight = exp(-float(i*i) / (2.0 * sigma * sigma));
                sum += texture2D(tDiffuse, vUv + vec2(offset, 0.0)) * weight;
                total += weight;
            }
            
            gl_FragColor = sum / total;
        }
    `
};

THREE.VerticalBlurShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'v': { value: 1.0 / 512.0 },
        'sigma': { value: 2.0 }
    },
    
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float v;
        uniform float sigma;
        varying vec2 vUv;
        
        void main() {
            vec4 sum = vec4(0.0);
            float total = 0.0;
            
            // 9-tap gaussian blur
            for(int i = -4; i <= 4; i++) {
                float offset = float(i) * v;
                float weight = exp(-float(i*i) / (2.0 * sigma * sigma));
                sum += texture2D(tDiffuse, vUv + vec2(0.0, offset)) * weight;
                total += weight;
            }
            
            gl_FragColor = sum / total;
        }
    `
};

// Additive blend shader for combining blurred layers
THREE.AdditiveBlendShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'tAdd': { value: null },
        'amount': { value: 1.0 }
    },
    
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tAdd;
        uniform float amount;
        varying vec2 vUv;
        
        void main() {
            vec4 base = texture2D(tDiffuse, vUv);
            vec4 add = texture2D(tAdd, vUv);
            gl_FragColor = base + add * amount;
        }
    `
};
