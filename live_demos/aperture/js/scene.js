export class Scene {
    constructor() {
        this.objects = [];
        this.spheres = []; // WebGL renderer expects this
        this.planes = [];
        this.lights = [];
        this.skyIntensity = 1.0;
        this.fogDensity = 0.0;
        this.fogColor = [0.7, 0.8, 0.9];
        this.groundPattern = 0; // 0=none, 1=checkerboard, 3=fine grid, 4=thick grid, 5=circles
        this.groundPatternScale = 1.0;
    }
    
    clear() {
        this.objects = [];
        this.spheres = [];
        this.planes = [];
        this.lights = [];
    }
    
    addSphere(center, radius, material) {
        const sphere = {
            type: 'sphere',
            center: center,
            radius: radius,
            material: material || { type: 'diffuse', albedo: [0.8, 0.8, 0.8] }
        };
        this.objects.push(sphere);
        this.spheres.push(sphere); // Also add to spheres array for WebGL
    }
    
    addVolumetricSphere(center, radius, density, albedo) {
        const sphere = {
            type: 'sphere',
            center: center,
            radius: radius,
            material: { 
                type: 'volumetric',
                density: density || 0.5, // Scattering density
                albedo: albedo || [0.8, 0.9, 1.0], // Scattering color
                anisotropy: 0.0 // Henyey-Greenstein g parameter
            }
        };
        this.objects.push(sphere);
        this.spheres.push(sphere);
    }
    
    addBox(center, size, material) {
        this.objects.push({
            type: 'box',
            center: center,
            size: size,
            material: material || { type: 'diffuse', albedo: [0.8, 0.8, 0.8] }
        });
    }
    
    addPlane(point, normal, material) {
        this.objects.push({
            type: 'plane',
            point: point,
            normal: this.normalize(normal),
            material: material || { type: 'diffuse', albedo: [0.8, 0.8, 0.8] }
        });
    }
    
    addLight(position, color, intensity) {
        this.lights.push({
            position: position,
            color: color || [1, 1, 1],
            intensity: intensity || 1.0
        });
    }
    
    intersect(ray) {
        let closestHit = null;
        let minDist = Infinity;
        
        for (const obj of this.objects) {
            let hit = null;
            
            if (obj.type === 'sphere') {
                hit = this.intersectSphere(ray, obj);
            } else if (obj.type === 'box') {
                hit = this.intersectBox(ray, obj);
            } else if (obj.type === 'plane') {
                hit = this.intersectPlane(ray, obj);
            }
            
            if (hit && hit.t > 0.001 && hit.t < minDist) {
                minDist = hit.t;
                closestHit = hit;
                closestHit.material = obj.material;
            }
        }
        
        return closestHit;
    }
    
    intersectSphere(ray, sphere) {
        const oc = this.subtract(ray.origin, sphere.center);
        const a = this.dot(ray.direction, ray.direction);
        const b = 2.0 * this.dot(oc, ray.direction);
        const c = this.dot(oc, oc) - sphere.radius * sphere.radius;
        const discriminant = b * b - 4 * a * c;
        
        if (discriminant < 0) return null;
        
        const t = (-b - Math.sqrt(discriminant)) / (2.0 * a);
        if (t < 0.001) return null;
        
        const point = this.add(ray.origin, this.scale(ray.direction, t));
        const normal = this.normalize(this.subtract(point, sphere.center));
        
        return { t, point, normal };
    }
    
    intersectBox(ray, box) {
        const invDir = [1 / ray.direction[0], 1 / ray.direction[1], 1 / ray.direction[2]];
        const min = this.subtract(box.center, this.scale(box.size, 0.5));
        const max = this.add(box.center, this.scale(box.size, 0.5));
        
        const t1 = [(min[0] - ray.origin[0]) * invDir[0],
                    (min[1] - ray.origin[1]) * invDir[1],
                    (min[2] - ray.origin[2]) * invDir[2]];
        const t2 = [(max[0] - ray.origin[0]) * invDir[0],
                    (max[1] - ray.origin[1]) * invDir[1],
                    (max[2] - ray.origin[2]) * invDir[2]];
        
        const tmin = [Math.min(t1[0], t2[0]), Math.min(t1[1], t2[1]), Math.min(t1[2], t2[2])];
        const tmax = [Math.max(t1[0], t2[0]), Math.max(t1[1], t2[1]), Math.max(t1[2], t2[2])];
        
        const tNear = Math.max(tmin[0], Math.max(tmin[1], tmin[2]));
        const tFar = Math.min(tmax[0], Math.min(tmax[1], tmax[2]));
        
        if (tNear > tFar || tFar < 0.001) return null;
        
        const t = tNear > 0.001 ? tNear : tFar;
        const point = this.add(ray.origin, this.scale(ray.direction, t));
        
        // Calculate normal
        const localPoint = this.subtract(point, box.center);
        const epsilon = 0.0001;
        let normal = [0, 0, 0];
        
        if (Math.abs(localPoint[0] - box.size[0] * 0.5) < epsilon) normal = [1, 0, 0];
        else if (Math.abs(localPoint[0] + box.size[0] * 0.5) < epsilon) normal = [-1, 0, 0];
        else if (Math.abs(localPoint[1] - box.size[1] * 0.5) < epsilon) normal = [0, 1, 0];
        else if (Math.abs(localPoint[1] + box.size[1] * 0.5) < epsilon) normal = [0, -1, 0];
        else if (Math.abs(localPoint[2] - box.size[2] * 0.5) < epsilon) normal = [0, 0, 1];
        else if (Math.abs(localPoint[2] + box.size[2] * 0.5) < epsilon) normal = [0, 0, -1];
        
        return { t, point, normal };
    }
    
    intersectPlane(ray, plane) {
        const denom = this.dot(plane.normal, ray.direction);
        
        if (Math.abs(denom) < 0.0001) return null;
        
        const t = this.dot(this.subtract(plane.point, ray.origin), plane.normal) / denom;
        
        if (t < 0.001) return null;
        
        const point = this.add(ray.origin, this.scale(ray.direction, t));
        const normal = denom < 0 ? plane.normal : this.scale(plane.normal, -1);
        
        return { t, point, normal };
    }
    
    getSkyColor(direction) {
        // Simple sky gradient
        const t = direction[1] * 0.5 + 0.5;
        const color = [
            (1.0 - t) + t * 0.5,
            (1.0 - t) + t * 0.7,
            1.0
        ];
        return this.scale(color, this.skyIntensity);
    }
    
    // Volume scattering
    sampleVolume(ray, tMax) {
        if (this.fogDensity <= 0) return null;
        
        // Sample distance in participating media
        const t = -Math.log(1 - Math.random()) / this.fogDensity;
        
        if (t < tMax) {
            return {
                t: t,
                point: this.add(ray.origin, this.scale(ray.direction, t)),
                scattered: true
            };
        }
        
        return null;
    }
    
    // Vector math utilities
    add(a, b) {
        return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    }
    
    subtract(a, b) {
        return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }
    
    scale(v, s) {
        return [v[0] * s, v[1] * s, v[2] * s];
    }
    
    multiply(a, b) {
        return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
    }
    
    dot(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }
    
    cross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }
    
    length(v) {
        return Math.sqrt(this.dot(v, v));
    }
    
    normalize(v) {
        const len = this.length(v);
        return len > 0 ? this.scale(v, 1 / len) : v;
    }
}
