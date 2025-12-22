// Ray marching shader for derivative landscape visualization
const derivativeLandscapeVertexShader = `
    varying vec3 vWorldPos;
    varying vec3 vPosition;
    
    void main() {
        vPosition = position;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;

const derivativeLandscapeFragmentShader = `
    uniform vec3 cameraPos;
    uniform float heightScale;
    uniform float fogDensity;
    uniform bool showVolumetricFog;
    uniform bool showContourLines;
    uniform sampler2D derivativeTexture;
    uniform sampler2D phaseTexture;
    
    varying vec3 vWorldPos;
    varying vec3 vPosition;
    
    const int MAX_STEPS = 200;
    const float MAX_DIST = 15.0;
    const float EPSILON = 0.005;
    const float CONTOUR_SPACING = 0.4;
    
    // Sample derivative magnitude at UV coordinates
    float getDerivMag(vec2 uv) {
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            return 0.0;
        }
        return texture2D(derivativeTexture, uv).r;
    }
    
    // Get phase color at UV
    vec3 getPhaseColor(vec2 uv) {
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            return vec3(0.0);
        }
        return texture2D(phaseTexture, uv).rgb;
    }
    
    // Height function: h(x, y) = |f'(x + iy)|
    float heightField(vec2 pos) {
        // Map world position to UV coordinates
        vec2 uv = (pos + vec2(2.0)) / 4.0; // Assuming domain is [-2, 2]
        return getDerivMag(uv) * heightScale;
    }
    
    // SDF for the surface z = heightField(x, y)
    float surfaceSDF(vec3 p) {
        float h = heightField(p.xy);
        return p.z - h;
    }
    
    // Gradient for normal calculation
    vec3 getNormal(vec3 p) {
        vec2 e = vec2(EPSILON, 0.0);
        return normalize(vec3(
            surfaceSDF(p + e.xyy) - surfaceSDF(p - e.xyy),
            surfaceSDF(p + e.yxy) - surfaceSDF(p - e.yxy),
            surfaceSDF(p + e.yyx) - surfaceSDF(p - e.yyx)
        ));
    }
    
    // Ray marching
    float rayMarch(vec3 ro, vec3 rd) {
        float t = 0.0;
        for (int i = 0; i < MAX_STEPS; i++) {
            vec3 p = ro + rd * t;
            float d = abs(surfaceSDF(p));
            
            if (d < EPSILON || t > MAX_DIST) {
                break;
            }
            
            t += d * 0.5; // Slower step for better accuracy
        }
        return t;
    }
    
    void main() {
        // Ray origin and direction
        // Start from the box surface (back face), march toward camera
        vec3 rayOrigin = vWorldPos;
        vec3 rayDir = normalize(vWorldPos - cameraPos);
        
        // Clamp domain to visible area
        vec2 domainMin = vec2(-3.0);
        vec2 domainMax = vec2(3.0);
        
        // Ray march to find surface
        float t = rayMarch(rayOrigin, rayDir);
        
        vec3 accumulatedColor = vec3(0.0);
        float accumulatedAlpha = 0.0;
        
        if (t < MAX_DIST) {
            vec3 hitPos = rayOrigin + rayDir * t;
            
            // Check if hit position is within domain
            if (hitPos.x >= domainMin.x && hitPos.x <= domainMax.x &&
                hitPos.y >= domainMin.y && hitPos.y <= domainMax.y) {
                
                vec3 normal = getNormal(hitPos);
                
                // Get derivative magnitude at hit point
                vec2 uv = (hitPos.xy - domainMin) / (domainMax - domainMin);
                float derivMag = getDerivMag(uv);
                
                // Base color from phase
                vec3 phaseColor = getPhaseColor(uv);
                
                // Lighting
                vec3 lightDir1 = normalize(vec3(1.0, 1.0, 2.0));
                vec3 lightDir2 = normalize(vec3(-0.5, -0.5, 1.0));
                float diffuse = max(dot(normal, lightDir1), 0.0) * 0.7 + 
                               max(dot(normal, lightDir2), 0.0) * 0.3;
                
                vec3 viewDir = -rayDir;
                vec3 halfDir = normalize(lightDir1 + viewDir);
                float specular = pow(max(dot(normal, halfDir), 0.0), 32.0);
                
                // Height-based coloring (peaks brighter)
                float heightFactor = smoothstep(0.0, 3.0, derivMag);
                vec3 heightColor = mix(
                    vec3(0.05, 0.05, 0.15),   // Valleys (zeros) - dark blue
                    vec3(1.0, 0.85, 0.2),     // Peaks (poles) - bright gold
                    heightFactor
                );
                
                // Blend phase color with height color
                vec3 color = mix(phaseColor * 0.4, heightColor, 0.7);
                color = color * (0.4 + 0.6 * diffuse) + vec3(1.0, 0.95, 0.7) * specular * 0.4;
                
                // Contour lines
                if (showContourLines) {
                    float contourVal = mod(derivMag, CONTOUR_SPACING);
                    float contourLine = smoothstep(0.03, 0.0, contourVal) + 
                                       smoothstep(CONTOUR_SPACING - 0.03, CONTOUR_SPACING, contourVal);
                    color = mix(color, vec3(1.0, 0.95, 0.5), contourLine * 0.7);
                }
                
                accumulatedColor = color;
                accumulatedAlpha = 1.0;
                
                // Volumetric fog
                if (showVolumetricFog) {
                    float fogAmount = 1.0 - exp(-fogDensity * t * 0.08);
                    vec3 fogColor = phaseColor * 0.2 + vec3(0.08, 0.08, 0.12);
                    accumulatedColor = mix(accumulatedColor, fogColor, fogAmount * 0.5);
                }
                
                // Distance fade
                float distFade = 1.0 - smoothstep(8.0, MAX_DIST, t);
                accumulatedAlpha *= distFade;
            }
        }
        
        // Output with proper alpha blending
        gl_FragColor = vec4(accumulatedColor, accumulatedAlpha);
    }
`;
