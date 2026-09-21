import { buildOpticsDiagram, add, sub, mul } from './opticsDiagram.js';

const COLORS = ['#f2a38c', '#aee6b7', '#83bcf4'];
export class CameraVisualizer {
    constructor(canvas, camera, scene) {
        this.canvas = canvas; this.camera = camera; this.scene = scene;
        this.ctx = canvas.getContext('2d'); this.showRays = true; this.showComponents = true;
        this.rayCount = 9; this.axis = 'y'; this.lesson = false; this.needsUpdate = true;
        this.showPupilPreview = false;
        this.resize();
    }
    resize() { this.width = this.canvas.width; this.height = this.canvas.height; this.needsUpdate = true; }
    line(a, b, color, width = 1, dash = []) {
        const c = this.ctx; c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash);
        c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.setLineDash([]);
    }
    dot(p, color, radius = 3) {
        this.ctx.fillStyle = color; this.ctx.beginPath(); this.ctx.arc(...p, radius, 0, Math.PI*2); this.ctx.fill();
    }
    label(text, x, y, color = '#acbab5', size = 10) {
        this.ctx.fillStyle = color; this.ctx.font = `${size}px system-ui,sans-serif`; this.ctx.fillText(text, x, y);
    }
    render() {
        // Gizmo editing changes several camera fields together; compare a small numeric signature.
        const signature = JSON.stringify([this.camera.focusPointA, this.camera.focusPointB, this.camera.focusPointC,
            this.camera.position, this.camera.lookAt, this.camera.enableNewTiltShift]);
        if (signature !== this.signature) { this.signature = signature; this.needsUpdate = true; }
        if (!this.needsUpdate) return;
        const c = this.ctx, w = this.width, h = this.height;
        if (!w || !h) return;
        c.fillStyle = '#10191c'; c.fillRect(0, 0, w, h);
        const model = buildOpticsDiagram(this.camera, this.axis, this.lesson);
        const compact = h < 155;
        const mainWidth = w * (w > 460 ? 0.68 : 0.62);
        const valid = model.samples.filter(s => s.sensor && s.focus && s.focus.every(Number.isFinite));
        const finiteSensor = valid.flatMap(s => [s.sensor, ...s.lensPoints]);
        // Uniform metric scale in the optical assembly. Fit changes only with components,
        // not the (potentially distant or infinite) object conjugates in the separate inset.
        const projected = p => [p[2], p[model.coordinate]];
        const points = finiteSensor.concat([add(model.center, mul(model.tangent, Math.max(model.radius, 0.012))),
            sub(model.center, mul(model.tangent, Math.max(model.radius, 0.012)))]).map(projected);
        const minZ = Math.min(-0.06, ...points.map(p => p[0]));
        const maxZ = Math.max(0.025, ...points.map(p => p[0]));
        const minY = Math.min(-0.015, ...points.map(p => p[1]));
        const maxY = Math.max(0.015, ...points.map(p => p[1]));
        const pad = compact ? 17 : 32;
        const scale = Math.max(1e-6, Math.min((mainWidth-48)/(maxZ-minZ), (h-pad*2)/(maxY-minY)));
        const centerZ = (minZ+maxZ)/2, centerY = (minY+maxY)/2;
        const map = p => [mainWidth/2+(p[2]-centerZ)*scale, h/2-(p[model.coordinate]-centerY)*scale];
        c.save(); c.beginPath(); c.rect(0, 0, mainWidth, h); c.clip();
        this.line([10, map(model.center)[1]], [mainWidth-10, map(model.center)[1]], '#43514d', 1, [3, 5]);
        if (this.showRays) valid.forEach(sample => {
            sample.lensPoints.forEach((lens, j) => {
                const a = map(sample.sensor), b = map(lens), far = map(sample.focus);
                this.line(a, b, COLORS[sample.index], j === 1 ? 1.6 : 0.7);
                // The scene is metres away; clip its rays at this centimetre-scale panel edge.
                this.line(b, far, COLORS[sample.index], j === 1 ? 1.6 : 0.7);
            });
            this.dot(map(sample.sensor), COLORS[sample.index]);
        });
        if (this.showComponents) {
            const ends = [sub(model.center, mul(model.tangent, Math.max(model.radius*1.25, 0.018))),
                add(model.center, mul(model.tangent, Math.max(model.radius*1.25, 0.018)))];
            this.line(map(ends[0]), map(ends[1]), '#586267', 4);
            this.line(map(sub(model.center, mul(model.tangent, model.radius))),
                map(add(model.center, mul(model.tangent, model.radius))), '#e9c177', 4);
            if (valid.length > 1) this.line(map(valid[0].sensor), map(valid[valid.length-1].sensor), '#80adcc', 2);
            this.dot(map(model.center), '#ffe3a0', 2);
        }
        this.label(this.lesson ? 'Ideal thin lens · sensor → lens → conjugates' : 'Camera rays · equivalent image conjugates → pupil', 10, 13, '#d9d3b8', compact ? 9 : 11);
        if (!compact && this.camera.enableTiltShift && (this.camera.filmTiltX || this.camera.filmTiltY))
            this.label('Legacy blur approximation is not shown', 10, 27, '#d8b17b', 9);
        const pupil = `f/${this.camera.apertureFStop.toFixed(1)} · Ø ${(model.radius*2000).toFixed(2)} mm`;
        this.label(pupil, 10, h-7, '#e9c177', 10);
        if (!compact) this.label('Uniform scale near lens · scene continues in inset →', 10, h-21, '#8faaa8', 9);
        c.restore();
        this.line([mainWidth, 0], [mainWidth, h], '#4b5a56');
        this.drawFocusInset(model, valid, mainWidth, w-mainWidth, h);
        if (this.showPupilPreview && h >= 110 && mainWidth >= 240) this.drawPupilPreview(model, mainWidth, h);
        this.needsUpdate = false;
    }
    drawPupilPreview(model, width, height) {
        const c = this.ctx, boxWidth = 186, boxHeight = 68;
        const x = width-boxWidth-8, y = height-boxHeight-34;
        c.save();
        c.fillStyle = '#10191cf5'; c.fillRect(x,y,boxWidth,boxHeight);
        c.strokeStyle = '#49574c'; c.lineWidth = 1; c.strokeRect(x,y,boxWidth,boxHeight);
        this.label('Front views · normalized',x+6,y+11,'#d4c697',9);
        const r = 17, cx = x+27, cy = y+35, blades = Math.max(3,this.camera.apertureBlades || 6);
        c.save(); c.translate(cx,cy); c.fillStyle = '#d6b77166'; c.strokeStyle = '#edcd89'; c.beginPath();
        const shape = this.camera.apertureShape;
        const polygon = points => { points.forEach((p,i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); };
        if (shape === 'polygon' || shape === 'hexagonal') {
            polygon(Array.from({length:blades},(_,i)=>[r*Math.cos(i/blades*Math.PI*2-Math.PI/2),r*Math.sin(i/blades*Math.PI*2-Math.PI/2)]));
        } else if (shape === 'star') {
            polygon(Array.from({length:161},(_,i)=>{ const a=i/160*Math.PI*2, span=Math.PI*2/blades;
                const radius=r*(0.4+0.6*Math.abs(a%span-span/2)/(span/2)); return [radius*Math.cos(a),radius*Math.sin(a)]; }));
        } else if (shape === 'square') c.rect(-r,-r,r*2,r*2);
        else if (shape === 'diagonal') polygon([[-r,-r*0.4],[r,r*0.2],[r,r*0.4],[-r,-r*0.2]]);
        else if (shape === 'coded' || shape === 'pinhole-grid') {
            const n=shape==='coded'?5:blades, step=2*r/n;
            const open=new Set([0,2,3,5,6,8,10,12,13,15,17,18,20,22,24]);
            for(let j=0;j<n;j++) for(let i=0;i<n;i++) {
                const px=-r+(i+0.5)*step, py=-r+(j+0.5)*step;
                if(shape==='coded') { if(open.has(j*n+i)) c.rect(px-step/2,py-step/2,step*0.9,step*0.9); }
                else { c.moveTo(px+step*0.3,py); c.arc(px,py,step*0.3,0,Math.PI*2); }
            }
        } else if(shape==='heart') {
            polygon(Array.from({length:81},(_,i)=>{ const t=i/80*Math.PI*2; return [16*Math.sin(t)**3*r/17,
                -(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))*r/17]; }));
        } else if(shape==='cat') c.ellipse(0,0,r*0.15,r,0,0,Math.PI*2);
        else { c.arc(0,0,r,0,Math.PI*2); if(shape==='ring') { c.moveTo(r*0.5,0); c.arc(0,0,r*0.5,0,Math.PI*2,true); } }
        // This guide shows mask shape, not the sampler's probability density.
        if(shape!=='heart') c.fill('evenodd'); c.stroke(); c.restore();
        this.label(`${(model.radius*2000).toFixed(2)} mm`,x+5,y+61,'#e6c879',9);
        const sx=x+105, sy=y+35, sw=45, sh=sw/this.camera.aspectRatio;
        c.fillStyle='#7baec62b'; c.strokeStyle='#83adca'; c.fillRect(sx-sw/2,sy-sh/2,sw,sh); c.strokeRect(sx-sw/2,sy-sh/2,sw,sh);
        if(this.camera.filmCurvature) {
            c.beginPath(); c.moveTo(sx-sw/2,sy); c.quadraticCurveTo(sx,sy-Math.min(12,Math.abs(this.camera.filmCurvature)*12),sx+sw/2,sy); c.stroke();
        }
        this.label(this.camera.filmCurvature ? 'Curvature sketch' : `${(model.filmWidth*1000).toFixed(1)}×${(model.filmHeight*1000).toFixed(1)} mm`,x+65,y+61,'#9dbbd0',9);
        c.restore();
    }
    drawFocusInset(model, valid, x, width, height) {
        const c = this.ctx;
        c.save(); c.beginPath(); c.rect(x+1, 0, width-1, height); c.clip();
        this.label('Object-side conjugates', x+9, 13, '#d9d3b8', 10);
        if (!valid.length || !model.validTilt) {
            this.label('No finite forward focus', x+9, height/2, '#e3b18d');
            this.label('Plane parallel / outside model', x+9, height/2+15, '#9aada7', 9);
            c.restore(); return;
        }
        const points = valid.map(s => [s.focus[2], s.focus[model.coordinate]]);
        const minZ = Math.min(...points.map(p => p[0])), maxZ = Math.max(...points.map(p => p[0]));
        const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
        const range = Math.max(maxZ-minZ, maxY-minY, 0.05);
        const scale = Math.max(1e-6, Math.min((width-44)/range, (height-(height < 90 ? 29 : 57))/range));
        const map = p => [x+width/2+(p[2]-(minZ+maxZ)/2)*scale, height/2-(p[model.coordinate]-(minY+maxY)/2)*scale];
        if (valid.length > 1) this.line(map(valid[0].focus), map(valid[valid.length-1].focus), '#8bd6a5', 1, [4, 3]);
        valid.forEach(sample => { this.dot(map(sample.focus), COLORS[sample.index], 3); });
        this.label(`${minZ.toFixed(2)}–${maxZ.toFixed(2)} m depth`, x+9, height-(height < 90 ? 5 : 19), '#9dbbad', 9);
        if (height >= 90) this.label('Same colors = same image samples', x+9, height-6, '#829990', 9);
        c.restore();
    }
}
