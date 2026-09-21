// js/core/AudioManager.js
// Generates collision sounds using Web Audio API — no audio files needed.

let ctx = null;
let enabled = true;

function getContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return ctx;
}

/**
 * Play a short percussive click for a collision event.
 * @param {'wall'|'block'} type — wall hits are higher pitched
 * @param {number} intensity — 0 to 1, controls volume and pitch
 */
export function playCollisionSound(type = 'block', intensity = 0.5) {
  if (!enabled) return;
  try {
    const ac = getContext();
    if (ac.state === 'suspended') ac.resume();

    const now = ac.currentTime;
    const gain = ac.createGain();
    const osc = ac.createOscillator();

    // Wall hits: sharp high click. Block hits: deeper thud.
    if (type === 'wall') {
      osc.frequency.setValueAtTime(800 + intensity * 400, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15 * intensity, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain).connect(ac.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    } else {
      osc.frequency.setValueAtTime(300 + intensity * 200, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
      osc.type = 'triangle';
      gain.gain.setValueAtTime(0.12 * intensity, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain).connect(ac.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  } catch (e) {
    // Audio not available — silently ignore
  }
}

export function setEnabled(on) { enabled = on; }
export function isEnabled() { return enabled; }
