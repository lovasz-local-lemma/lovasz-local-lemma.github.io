export class DrawingCanvas {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.isDrawing = false;
        this.mode = 'draw'; // 'draw', 'liquify', 'erase'
        this.brushSize = 5;
        this.color = '#ffffff';
        this.lastPos = null;
        this.onDrawingChange = null;

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());

        // Touch support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            this.canvas.dispatchEvent(mouseEvent);
        });
    }

    handleMouseDown(e) {
        this.isDrawing = true;
        const pos = this.getMousePos(e);
        this.lastPos = pos;

        if (this.mode === 'draw' || this.mode === 'erase') {
            this.drawPoint(pos);
        }
    }

    handleMouseMove(e) {
        if (!this.isDrawing) return;

        const pos = this.getMousePos(e);

        if (this.mode === 'draw' || this.mode === 'erase') {
            this.drawLine(this.lastPos, pos);
        } else if (this.mode === 'liquify') {
            this.liquify(this.lastPos, pos);
        }

        this.lastPos = pos;

        if (this.onDrawingChange) {
            this.onDrawingChange();
        }
    }

    handleMouseUp() {
        this.isDrawing = false;
        this.lastPos = null;
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    drawPoint(pos) {
        this.ctx.fillStyle = this.mode === 'erase' ? '#000000' : this.color;
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, this.brushSize, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawLine(from, to) {
        this.ctx.strokeStyle = this.mode === 'erase' ? '#000000' : this.color;
        this.ctx.lineWidth = this.brushSize * 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.stroke();
    }

    liquify(from, to) {
        // Get the direction vector
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 0.1) return;

        const dirX = dx / distance;
        const dirY = dy / distance;

        // Liquify effect: distort pixels in the direction of movement
        const radius = this.brushSize * 3;
        const strength = 0.5;

        // Get image data
        const imageData = this.ctx.getImageData(
            Math.max(0, to.x - radius),
            Math.max(0, to.y - radius),
            Math.min(this.canvas.width, radius * 2),
            Math.min(this.canvas.height, radius * 2)
        );

        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        // Create a copy for reading
        const tempData = new Uint8ClampedArray(data);

        // Apply distortion
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const px = to.x - radius + x;
                const py = to.y - radius + y;

                // Distance from cursor
                const dist = Math.sqrt((px - to.x) ** 2 + (py - to.y) ** 2);

                if (dist < radius) {
                    // Calculate displacement
                    const factor = (1 - dist / radius) * strength * distance;
                    const offsetX = dirX * factor;
                    const offsetY = dirY * factor;

                    // Source pixel
                    const srcX = Math.floor(x - offsetX);
                    const srcY = Math.floor(y - offsetY);

                    if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                        const dstIdx = (y * width + x) * 4;
                        const srcIdx = (srcY * width + srcX) * 4;

                        data[dstIdx] = tempData[srcIdx];
                        data[dstIdx + 1] = tempData[srcIdx + 1];
                        data[dstIdx + 2] = tempData[srcIdx + 2];
                        data[dstIdx + 3] = tempData[srcIdx + 3];
                    }
                }
            }
        }

        // Put image data back
        this.ctx.putImageData(imageData, to.x - radius, to.y - radius);
    }

    setMode(mode) {
        this.mode = mode;
    }

    setBrushSize(size) {
        this.brushSize = size;
    }

    setColor(color) {
        this.color = color;
    }

    clear() {
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
