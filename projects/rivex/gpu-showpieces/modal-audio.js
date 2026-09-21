// The instrument supplies modal parameters. The browser supplies its audio device.
export function membraneModes(state) {
  const modes = [], damping = Math.max(0, Math.min(1, state.damping ?? .22));
  const fundamental = Math.max(40, Math.min(440, state.fundamental ?? 110));
  const add = (n, m, weight) => {
    const order = n * n + m * m;
    modes.push({n, m, frequency: fundamental * Math.sqrt(order / 2), weight,
      decay: (.25 + 2.4 * damping) * (1 + .055 * order)});
  };
  if (state.excitationMode > .5) {
    for (let n = 1; n <= 3; n++) for (let m = 1; m <= 3; m++) {
      const order = n * n + m * m;
      add(n, m, Math.sin(n * Math.PI * state.strikeX) * Math.sin(m * Math.PI * state.strikeY)
        * Math.exp(-.032 * order) / Math.sqrt(order / 2) / 4.6);
    }
  } else {
    const n = Math.round(state.n ?? 2), m = Math.round(state.m ?? 3), mix = state.mix ?? .55;
    add(n, m, 1 / (1 + Math.abs(mix)));
    add(m, n, mix / (1 + Math.abs(mix)));
  }
  return modes;
}

export function createModalAudio(surface, readState, onStatus = () => {}) {
  let context, voices = [], lastSerial = null, enabled = false, disposed = false, strikes = 0;
  const stop = () => {
    for (const voice of voices) { try { voice.stop(); } catch {} }
    voices = [];
  };
  const unlock = () => {
    if (disposed) return;
    const Native = window.AudioContext || window.webkitAudioContext;
    if (!Native) { onStatus('Audio is unavailable in this browser.'); return; }
    context ||= new Native();
    if (context.state === 'suspended') context.resume().catch(() => {});
  };
  surface.addEventListener('pointerdown', unlock);
  function strike(state) {
    if (!context || context.state !== 'running' || document.hidden) return;
    stop();
    const start = context.currentTime + .005;
    const amplitude = .24 * Math.min(1, Math.max(0, (state.amplitude ?? .25) / .5));
    for (const mode of membraneModes(state)) {
      if (Math.abs(mode.weight) < 1e-8) continue;
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.frequency.value = mode.frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(amplitude * mode.weight, start + .003);
      gain.gain.setTargetAtTime(0, start + .003, 1 / mode.decay);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start); oscillator.stop(start + Math.min(16, 9 / mode.decay));
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      voices.push(oscillator);
    }
    strikes++;
    onStatus('Sound on · the same modal weights and decay, played at audible frequencies.');
  }
  function update() {
    if (disposed) return;
    const state = readState(); if (!state) return;
    const nextEnabled = state.audioEnabled > .5;
    const changed = lastSerial !== null && state.strikeSerial !== lastSerial;
    if (!nextEnabled || state.playing < .5) stop();
    else if (changed || (!enabled && nextEnabled)) strike(state);
    if (enabled && !nextEnabled) onStatus('Sound off · choose Listen inside the Rive instrument to enable it.');
    enabled = nextEnabled; lastSerial = state.strikeSerial;
  }
  const hide = () => { if (document.hidden) stop(); };
  const visibility = event => {
    if (event.source === parent && event.origin === location.origin && event.data?.type === 'portfolio-lab-visibility' && !event.data.visible) stop();
  };
  document.addEventListener('visibilitychange', hide);
  window.addEventListener('message', visibility);
  return {update, stop, get state() { return {enabled, strikes, audioState: context?.state || 'unopened'}; },
    dispose() { disposed = true; stop(); surface.removeEventListener('pointerdown', unlock);
      document.removeEventListener('visibilitychange', hide); window.removeEventListener('message', visibility);
      context?.close().catch(() => {}); }
  };
}
