import * as THREE from 'three';

// One shared WebGL renderer draws every card thumbnail. Browsers cap live WebGL
// contexts (~16), so we can't give each of ~40 cards its own canvas — instead this
// renderer draws each sim's scene once, captured to a data URL.
//
// Per-sim hints: `static previewSteps = N` (how far to advance before the still,
// default 120 steps of dt=0.04), `static previewParams = {...}` (constructor
// params), and an instance method `getPreviewBox()` returning {x0,x1,y0,y1} in
// scene coordinates to frame the *interesting* content (otherwise the scene's
// bounding box is used).

let _renderer = null;
function getRenderer() {
  if (_renderer) return _renderer;
  const canvas = document.createElement('canvas');
  _renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  const bg = (getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#0b0b1a').trim();
  try { _renderer.setClearColor(new THREE.Color(bg), 1); }
  catch (e) { _renderer.setClearColor(0x0b0b1a, 1); }
  return _renderer;
}

function disposeScene(scene) {
  scene?.traverse(obj => {
    obj.geometry?.dispose?.();
    const mat = obj.material;
    if (mat) {
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) { m.map?.dispose?.(); m.dispose?.(); }
    }
  });
}

// Widen an ortho camera's horizontal bounds (or set a perspective aspect) to the
// thumbnail aspect so circles stay round.
function fitCamera(cam, W, H) {
  const aspect = W / H;
  if (cam.isPerspectiveCamera) {
    cam.aspect = aspect; cam.updateProjectionMatrix();
  } else if (cam.isOrthographicCamera) {
    const vH = cam.top - cam.bottom;
    const cx = (cam.left + cam.right) / 2;
    cam.left = cx - (vH * aspect) / 2;
    cam.right = cx + (vH * aspect) / 2;
    cam.updateProjectionMatrix();
  }
}

// Fit the camera to the scene's content bounding box so the whole sim is in frame.
function frameScene(cam, scene, W, H) {
  let box;
  try { box = new THREE.Box3().setFromObject(scene); } catch (e) { return; }
  if (!box || box.isEmpty() || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const aspect = W / H;
  if (cam.isOrthographicCamera) {
    const pad = 1.14;
    let halfW = Math.max(size.x, 1e-3) / 2 * pad;
    let halfH = Math.max(size.y, 1e-3) / 2 * pad;
    if (halfW / halfH > aspect) halfH = halfW / aspect; else halfW = halfH * aspect;
    cam.left = center.x - halfW; cam.right = center.x + halfW;
    cam.top = center.y + halfH; cam.bottom = center.y - halfH;
    cam.updateProjectionMatrix();
  } else if (cam.isPerspectiveCamera) {
    cam.aspect = aspect;
    const radius = Math.max(size.length() / 2, 1e-3);
    const vFov = cam.fov * Math.PI / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const dist = Math.max(radius / Math.tan(vFov / 2), radius / Math.tan(hFov / 2)) * 1.15;
    const dir = new THREE.Vector3().subVectors(cam.position, center);
    if (dir.lengthSq() < 1e-9) dir.set(0.6, 0.5, 1);
    dir.normalize();
    cam.position.copy(center).addScaledVector(dir, dist);
    cam.near = Math.max(0.01, dist - radius * 3);
    cam.far = dist + radius * 3;
    cam.lookAt(center);
    cam.updateProjectionMatrix();
  }
}

function capture(scene, cam, W, H) {
  const r = getRenderer();
  r.setSize(W, H, false);
  r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
}

// Apply a sim-provided focus box {x0,x1,y0,y1} to an orthographic camera,
// widening to the thumbnail aspect so nothing distorts.
function applyPreviewBox(cam, box, W, H) {
  if (!cam.isOrthographicCamera) return false;
  const aspect = W / H;
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  let halfW = Math.max(box.x1 - box.x0, 1e-3) / 2;
  let halfH = Math.max(box.y1 - box.y0, 1e-3) / 2;
  if (halfW / halfH > aspect) halfH = halfW / aspect; else halfW = halfH * aspect;
  cam.left = cx - halfW; cam.right = cx + halfW;
  cam.top = cy + halfH; cam.bottom = cy - halfH;
  cam.updateProjectionMatrix();
  return true;
}

function renderScenePreview(SimClass, W, H, steps) {
  let sim;
  try {
    sim = new SimClass(SimClass.previewParams || {});
    sim.maxTrailLength = Math.min(sim.maxTrailLength || 3000, 3000);
    sim.initSimScene();
    for (let i = 0; i < steps && !sim.finished; i++) sim.step(0.04);
    sim.flushPhasePoints?.();
    sim.collisionEffects = [];   // no transient pulse rings in a still frame
    sim.updateSimScene();
  } catch (e) { return null; }
  const cam = sim.simCamera;
  if (!cam) return null;
  try {
    fitCamera(cam, W, H);
    // Prefer the sim's own focus box (the "interesting stuff"); fall back to
    // fitting the whole scene's bounding box.
    const box = typeof sim.getPreviewBox === 'function' ? sim.getPreviewBox() : null;
    if (!box || !applyPreviewBox(cam, box, W, H)) {
      frameScene(cam, sim.simScene, W, H);
    }
    const url = capture(sim.simScene, cam, W, H);
    disposeScene(sim.simScene);
    return url;
  } catch (e) { try { disposeScene(sim.simScene); } catch (_) {} return null; }
}

// Render a representative still for a sim to a PNG data URL (or null on failure, so
// the caller can keep the letter placeholder).
export function renderPreview(SimClass, opts = {}) {
  const W = opts.width || 360, H = opts.height || 202;
  const steps = opts.steps ?? SimClass.previewSteps ?? 120;
  return renderScenePreview(SimClass, W, H, steps);
}
