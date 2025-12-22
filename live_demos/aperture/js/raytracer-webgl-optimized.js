// OPTIMIZED VERSION - Material functions extracted for faster compilation
// This file demonstrates the optimization strategy

export class RayTracerWebGLOptimized {
    constructor(canvas, scene, camera) {
        // ... same constructor as original ...
    }
    
    // The key optimization: Extract the giant shader into smaller, modular functions
    getOptimizedFragmentShader() {
        return `#version 300 es
        precision highp float;
        
        // ... (keep all uniforms and structures the same) ...
        
        // ═══════════════════════════════════════════════════════════
        // EXTRACTED MATERIAL EVALUATION FUNCTIONS
        // These are now separate, making compilation much faster
        // ═══════════════════════════════════════════════════════════
        
        // Glass material with Fresnel and refraction
        bool evaluateGlass(inout Ray ray, Hit hit, inout vec3 color, float ior, float absorption) {
            bool entering = dot(ray.direction, hit.normal) < 0.0;
            vec3 outwardNormal = entering ? hit.normal : -hit.normal;
            float etaRatio = entering ? (1.0 / ior) : ior;
            
            vec3 refracted = refract(normalize(ray.direction), outwardNormal, etaRatio);
            
            if (length(refracted) > 0.01) {
                vec3 V = -normalize(ray.direction);
                float cosTheta = abs(dot(V, outwardNormal));
                float r0 = pow((1.0 - ior) / (1.0 + ior), 2.0);
                float fresnel = r0 + (1.0 - r0) * pow(1.0 - cosTheta, 5.0);
                
                if (random() < fresnel) {
                    ray.direction = reflect(ray.direction, outwardNormal);
                    ray.origin = hit.point + outwardNormal * EPSILON;
                } else {
                    ray.direction = refracted;
                    ray.origin = hit.point - outwardNormal * EPSILON;
                    
                    if (absorption > 0.001 && !entering) {
                        vec3 absorptionColor = vec3(1.0); // Use albedo from caller
                        vec3 attenuation = exp(-absorptionColor * absorption * hit.t);
                        color *= attenuation;
                    }
                }
                return true; // Continue tracing
            } else {
                // Total internal reflection
                ray.direction = reflect(ray.direction, hit.normal);
                ray.origin = hit.point + hit.normal * EPSILON;
                return true;
            }
        }
        
        // Mirror material (perfect reflection)
        bool evaluateMirror(inout Ray ray, Hit hit, inout vec3 color, vec3 albedo) {
            ray.direction = reflect(ray.direction, hit.normal);
            ray.origin = hit.point + hit.normal * EPSILON;
            color *= albedo;
            return true; // Continue tracing
        }
        
        // Glossy/Microfacet BRDF (base version without special effects)
        bool evaluateGlossy(inout Ray ray, Hit hit, inout vec3 color, vec3 albedo, float roughness) {
            if (roughness < 0.01) roughness = 0.01;
            
            vec3 H = sampleGGX(hit.normal, roughness);
            vec3 V = -ray.direction;
            vec3 scattered = reflect(-V, H);
            
            if (dot(scattered, hit.normal) > 0.0) {
                ray.origin = hit.point + hit.normal * EPSILON;
                ray.direction = scattered;
                
                float NdotV = max(dot(hit.normal, V), 0.0);
                float fresnel = pow(1.0 - NdotV, 5.0);
                color *= albedo * (1.0 - fresnel * 0.5);
                return true;
            }
            return false; // Invalid reflection
        }
        
        // Anisotropic glossy (brushed metal)
        bool evaluateAnisotropic(inout Ray ray, Hit hit, inout vec3 color, vec3 albedo, 
                                 float roughness, float anisotropy, float rotation) {
            if (roughness < 0.01) roughness = 0.01;
            
            vec3 H = sampleGGXAnisotropic(hit.normal, roughness, anisotropy, rotation);
            vec3 V = -ray.direction;
            vec3 scattered = reflect(-V, H);
            
            if (dot(scattered, hit.normal) > 0.0) {
                ray.origin = hit.point + hit.normal * EPSILON;
                ray.direction = scattered;
                
                float NdotV = max(dot(hit.normal, V), 0.0);
                float fresnel = pow(1.0 - NdotV, 5.0);
                color *= albedo * (1.0 - fresnel * 0.5);
                return true;
            }
            return false;
        }
        
        // Clearcoat layer (car paint)
        bool evaluateClearcoat(inout Ray ray, Hit hit, inout vec3 color, vec3 albedo,
                               float roughness, float clearcoat, float clearcoatRoughness, float clearcoatIOR) {
            vec3 V = -ray.direction;
            float NdotV = max(dot(hit.normal, V), 0.0);
            float F0 = pow((1.0 - clearcoatIOR) / (1.0 + clearcoatIOR), 2.0);
            float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);
            
            float clearcoatProb = clearcoat * fresnel;
            bool sampleClearcoat = (random() < clearcoatProb);
            
            float actualRoughness = sampleClearcoat ? clearcoatRoughness : roughness;
            vec3 actualAlbedo = sampleClearcoat ? vec3(1.0) : albedo;
            
            vec3 H = sampleGGX(hit.normal, actualRoughness);
            vec3 scattered = reflect(-V, H);
            
            if (dot(scattered, hit.normal) > 0.0) {
                ray.origin = hit.point + hit.normal * EPSILON;
                ray.direction = scattered;
                color *= actualAlbedo * (1.0 - fresnel * 0.5);
                return true;
            }
            return false;
        }
        
        // Subsurface scattering (simplified)
        bool evaluateSSS(inout Ray ray, Hit hit, inout vec3 color, vec3 albedo, 
                        float scatterDistance, float scatterDensity, int matIndex) {
            float sssIOR = 1.4;
            vec3 refracted = refract(normalize(ray.direction), hit.normal, 1.0 / sssIOR);
            
            if (length(refracted) > 0.01) {
                vec3 sssPos = hit.point - hit.normal * EPSILON;
                vec3 sssDir = refracted;
                vec3 sssColor = vec3(1.0);
                float totalDist = 0.0;
                
                // Simplified random walk (reduced iterations)
                for (int step = 0; step < 4; step++) {
                    float stepDist = -log(random()) / scatterDensity * scatterDistance;
                    totalDist += stepDist;
                    sssPos += sssDir * stepDist;
                    
                    vec3 absorption = exp(-albedo * scatterDensity * totalDist);
                    sssColor *= absorption;
                    
                    // Check if exited
                    vec3 toCenter = u_spheres[matIndex].xyz - sssPos;
                    float distToCenter = length(toCenter);
                    float radius = u_spheres[matIndex].w;
                    
                    if (distToCenter > radius - EPSILON) {
                        vec3 exitNormal = normalize(sssPos - u_spheres[matIndex].xyz);
                        vec3 exitDir = refract(sssDir, -exitNormal, sssIOR);
                        if (length(exitDir) < 0.01) {
                            exitDir = reflect(sssDir, -exitNormal);
                        }
                        
                        ray.origin = sssPos + exitNormal * EPSILON;
                        ray.direction = normalize(exitDir);
                        color *= sssColor * albedo;
                        return true;
                    }
                    
                    sssDir = randomUnitVector();
                }
            }
            return true;
        }
        
        // Diffuse material with direct lighting
        bool evaluateDiffuse(inout Ray ray, Hit hit, inout vec3 color, inout vec3 light, vec3 albedo) {
            vec3 directLight = sampleDirectLight(hit.point, hit.normal);
            light += color * albedo * directLight / PI;
            
            vec3 scattered = normalize(hit.normal + randomUnitVector());
            ray.origin = hit.point + hit.normal * EPSILON;
            ray.direction = scattered;
            color *= albedo;
            return true;
        }
        
        // ═══════════════════════════════════════════════════════════
        // MAIN TRACE FUNCTION (SIMPLIFIED)
        // ═══════════════════════════════════════════════════════════
        vec3 trace(Ray ray) {
            vec3 color = vec3(1.0);
            vec3 light = vec3(0.0);
            
            int minBounces = u_enableVPT ? 1 : u_minBounces;
            int maxBounces = u_enableVPT ? u_vptMaxBounces : (u_minBounces + u_bounceRange);
            
            for (int bounce = 0; bounce < MAX_BOUNCES; bounce++) {
                if (bounce >= maxBounces) break;
                
                Hit hit = intersectScene(ray);
                
                // Volumetric path tracing (if enabled)
                if (u_enableVPT) {
                    // ... volumetric code stays the same ...
                }
                
                if (!hit.hit) {
                    light += color * getSky(ray.direction);
                    break;
                }
                
                // Get material properties
                vec3 albedo;
                float matType;
                vec3 emission = vec3(0.0);
                
                if (hit.materialIndex >= 0) {
                    albedo = u_sphereMats[hit.materialIndex].xyz;
                    matType = u_sphereMats[hit.materialIndex].w;
                    emission = u_sphereEmission[hit.materialIndex].xyz;
                    
                    // Apply texture
                    float textureType = u_sphereTexture[hit.materialIndex].x;
                    albedo = applyTexture(albedo, hit.point, textureType, 1.0);
                } else {
                    // Ground
                    albedo = vec3(0.5);
                    matType = 0.0;
                    albedo = applyTexture(albedo, hit.point, u_groundPattern, u_groundPatternScale);
                }
                
                // Emissive materials
                if (matType == 4.0) {
                    if (!u_disableSceneLights) {
                        light += color * emission;
                    }
                    break;
                }
                
                // ═══════════════════════════════════════════════════════════
                // MODULAR MATERIAL EVALUATION (replaces 600-line if/else chain)
                // ═══════════════════════════════════════════════════════════
                bool continueTrace = true;
                
                if (matType == 2.0) {
                    // Glass
                    float ior = 1.5;
                    if (u_enableChromaticAberration) {
                        ior += (ray.wavelength - 0.5) * 0.12 * u_chromaticAberration;
                    }
                    float absorption = u_sphereVolume[hit.materialIndex].x;
                    continueTrace = evaluateGlass(ray, hit, color, ior, absorption);
                    
                } else if (matType == 3.0) {
                    // Mirror
                    continueTrace = evaluateMirror(ray, hit, color, albedo);
                    
                } else if (matType == 6.0) {
                    // Glossy/Microfacet
                    float roughness = u_sphereVolume[hit.materialIndex].y;
                    float anisotropy = u_sphereVolume[hit.materialIndex].z;
                    float anisotropyRotation = u_sphereVolume[hit.materialIndex].w;
                    
                    float clearcoat = u_sphereTexture[hit.materialIndex].y;
                    float clearcoatRoughness = u_sphereTexture[hit.materialIndex].z;
                    float clearcoatIOR = u_sphereTexture[hit.materialIndex].w;
                    
                    // Check for SSS
                    float densityOrScatter = u_sphereVolume[hit.materialIndex].x;
                    bool isSSS = (densityOrScatter < -0.001 && clearcoatIOR < 0.0);
                    
                    if (isSSS) {
                        float scatterDistance = -densityOrScatter;
                        float scatterDensity = clearcoatRoughness;
                        continueTrace = evaluateSSS(ray, hit, color, albedo, scatterDistance, 
                                                   scatterDensity, hit.materialIndex);
                    } else if (clearcoat > 0.01) {
                        continueTrace = evaluateClearcoat(ray, hit, color, albedo, roughness,
                                                         clearcoat, clearcoatRoughness, clearcoatIOR);
                    } else if (anisotropy > 0.01) {
                        continueTrace = evaluateAnisotropic(ray, hit, color, albedo, roughness,
                                                           anisotropy, anisotropyRotation);
                    } else {
                        continueTrace = evaluateGlossy(ray, hit, color, albedo, roughness);
                    }
                    
                    if (!continueTrace) {
                        // Fallback to diffuse
                        continueTrace = evaluateDiffuse(ray, hit, color, light, albedo);
                    }
                    
                } else {
                    // Diffuse (default)
                    continueTrace = evaluateDiffuse(ray, hit, color, light, albedo);
                }
                
                if (!continueTrace) break;
                
                // Russian roulette
                if (bounce > 1) {
                    float p = max(albedo.r, max(albedo.g, albedo.b));
                    if (random() > p) break;
                    color /= p;
                }
            }
            
            return light;
        }
        
        // ... rest of shader (main function, etc) stays the same ...
        `;
    }
}
