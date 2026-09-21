import { setEnabled as setAudioEnabled } from './AudioManager.js';

export class ControlPanel {
  constructor(sim, container) {
    this.sim = sim;
    this.container = container;
    this.elements = {};
  }

  build() {
    this.container.innerHTML = '';
    const piLabel = this.sim.getPiLabel?.() || 'π ≈';
    const countLabel = this.sim.getCountLabel?.() || 'Collisions';

    // Playback buttons + shared toggles
    const transport = document.createElement('div');
    transport.className = 'control-stack transport-stack';

    const playback = document.createElement('div');
    playback.className = 'control-group playback';
    const playBtn = this.makeButton('▶', () => {
      if (this.sim.finished || this.sim.playing) {
        this.sim.playing = false;
        this.sim.reset();
        this.sim.initSimScene();
      }
      this.sim.playing = true;
    }, 'Play');
    this.playBtn = playBtn;
    const pauseBtn = this.makeButton('⏸', () => { this.sim.playing = false; }, 'Pause');
    const resetBtn = this.makeButton('↺', () => {
      this.sim.playing = false;
      this.sim.reset();
      this.sim.initSimScene();
    }, 'Reset');
    const stepBtn = this.makeButton('⏭', () => { this.sim.requestStep(); }, 'Step one frame');
    playback.append(playBtn, pauseBtn, resetBtn, stepBtn);
    transport.appendChild(playback);

    const sharedToggles = document.createElement('div');
    sharedToggles.className = 'shared-toggles';
    this.addToggle({ id: 'trail', label: 'Trail', default: true }, sharedToggles);
    this.addToggle({ id: 'vectors', label: 'Vectors', default: false }, sharedToggles);
    this.addToggle({ id: 'grid', label: 'Grid', default: false }, sharedToggles);
    this.addToggle({ id: 'tracer', label: 'Tracer', default: false }, sharedToggles);
    this.addToggle({ id: 'stepMode', label: 'Step', default: false }, sharedToggles);
    this.addToggle({ id: 'sound', label: 'Sound', default: true,
      onChange: (val) => setAudioEnabled(val) }, sharedToggles);
    transport.appendChild(sharedToggles);

    this.container.appendChild(transport);
    this.addSeparator();

    // Sim-specific controls
    const controls = this.sim.getControls();
    for (const ctrl of controls) {
      if (ctrl.type === 'slider') this.addSlider(ctrl);
      else if (ctrl.type === 'select') this.addSelect(ctrl);
      else if (ctrl.type === 'toggle') this.addToggle(ctrl);
    }
    this.addSeparator();

    if (this.sim.getFormulaHTML) {
      const formula = document.createElement('div');
      formula.className = 'control-group formula-readout';
      formula.id = 'formula-readout';
      formula.innerHTML = this.sim.getFormulaHTML();
      this.container.appendChild(formula);
    }

    // Collision counter
    const counter = document.createElement('div');
    counter.className = 'control-group collision-counter';
    counter.innerHTML = `
      <div class="counter-label">${countLabel}</div>
      <div class="counter-value" id="collision-count">0</div>
      <div class="counter-label" style="margin-top:2px;">${piLabel}</div>
      <div class="counter-value" id="pi-approx" style="color:var(--cyan)">0</div>
    `;
    this.container.appendChild(counter);
  }

  // `name` is the accessible label: the visible glyph is decorative, so a screen
  // reader would otherwise announce "black right-pointing triangle" instead of
  // "Play". type=button keeps these out of any implicit form submission.
  makeButton(text, onClick, name) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ctrl-btn';
    btn.textContent = text;
    if (name) { btn.setAttribute('aria-label', name); btn.title = name; }
    btn.addEventListener('click', onClick);
    return btn;
  }

  addSeparator() {
    const sep = document.createElement('div');
    sep.className = 'ctrl-separator';
    this.container.appendChild(sep);
  }

  addSlider(ctrl) {
    const group = document.createElement('div');
    group.className = 'control-group slider-group' + (ctrl.highlight ? ' slider-highlight' : '');
    // A real <label for=…> so the control is announced with its name and live
    // value; previously every slider read as an unlabelled "slider", and a sim
    // can have half a dozen of them.
    const uid = `ctrl-${ctrl.id}`;
    const label = document.createElement('label');
    label.className = 'ctrl-label';
    label.htmlFor = uid;
    const valueSpan = document.createElement('span');
    valueSpan.className = 'ctrl-value';
    valueSpan.textContent = ctrl.default;
    label.textContent = ctrl.label + ' ';
    label.appendChild(valueSpan);
    const input = document.createElement('input');
    input.id = uid;
    input.type = 'range';
    input.min = ctrl.min; input.max = ctrl.max; input.step = ctrl.step;
    input.value = ctrl.default;
    input.className = 'ctrl-slider';
    input.addEventListener('input', () => {
      const val = Number(input.value);
      valueSpan.textContent = val;
      this.sim.params[ctrl.id] = val;
      if (ctrl.id === 'speed') this.sim.speed = val;
      if (ctrl.onChange) ctrl.onChange(val);
      this.updateHash();
    });
    this.elements[ctrl.id] = input;
    this.sim.params[ctrl.id] = ctrl.default;
    if (ctrl.id === 'speed') this.sim.speed = ctrl.default;
    group.append(label, input);
    this.container.appendChild(group);
  }

  addSelect(ctrl) {
    const group = document.createElement('div');
    group.className = 'control-group select-group' + (ctrl.highlight ? ' slider-highlight' : '');

    const uid = `ctrl-${ctrl.id}`;
    const label = document.createElement('label');
    label.className = 'ctrl-label';
    label.htmlFor = uid;
    label.textContent = ctrl.label;

    const select = document.createElement('select');
    select.id = uid;
    select.className = 'ctrl-select';
    for (const option of ctrl.options || []) {
      const el = document.createElement('option');
      el.value = option.value;
      el.textContent = option.label;
      select.appendChild(el);
    }
    select.value = ctrl.default;
    select.addEventListener('change', () => {
      const val = select.value;
      this.sim.params[ctrl.id] = val;
      if (ctrl.onChange) ctrl.onChange(val);
      this.updateHash();
    });

    this.elements[ctrl.id] = select;
    this.sim.params[ctrl.id] = ctrl.default;
    group.append(label, select);
    this.container.appendChild(group);
  }

  addToggle(ctrl, parent = this.container) {
    const label = document.createElement('label');
    label.className = 'ctrl-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = ctrl.default;
    input.addEventListener('change', () => {
      const checked = input.checked;
      if (ctrl.id === 'trail') this.sim.showTrail = checked;
      else if (ctrl.id === 'vectors') this.sim.showVectors = checked;
      else if (ctrl.id === 'grid') this.sim.showGrid = checked;
      else if (ctrl.id === 'stepMode') this.sim.stepMode = checked;
      else this.sim[ctrl.id] = checked;
      if (ctrl.onChange) ctrl.onChange(input.checked);
      this.updateHash();
    });
    if (ctrl.id === 'trail') this.sim.showTrail = ctrl.default;
    else if (ctrl.id === 'vectors') this.sim.showVectors = ctrl.default;
    else if (ctrl.id === 'grid') this.sim.showGrid = ctrl.default;
    else if (ctrl.id === 'stepMode') this.sim.stepMode = ctrl.default;
    else this.sim[ctrl.id] = ctrl.default;
    this.elements[ctrl.id] = input;
    label.append(input, document.createTextNode(' ' + ctrl.label));
    parent.appendChild(label);
  }

  updateReadouts() {
    const countEl = document.getElementById('collision-count');
    const piEl = document.getElementById('pi-approx');
    if (countEl) {
      countEl.textContent = this.sim.getCollisionCount();
      const label = this.sim.getCountLabel();
      if (countEl.previousElementSibling.textContent !== label) countEl.previousElementSibling.textContent = label;
    }
    if (piEl) {
      const label = this.sim.getPiLabel?.() || 'π ≈';
      if (piEl.previousElementSibling.textContent !== label) piEl.previousElementSibling.textContent = label;
      if (this.sim.getPiMethod?.() === 'volume') {
        // Volume-based — pi is calculated in main.js, don't overwrite
        if (piEl.textContent === '0' || piEl.textContent === '0.00000000') {
          piEl.textContent = 'estimating...';
        }
      } else {
        piEl.textContent = this.sim.getPiReadout?.()
          ?? this.sim.getPiApproximation().toFixed(8);
      }
    }

    const formulaEl = document.getElementById('formula-readout');
    if (formulaEl && this.sim.getFormulaHTML) {
      const html = this.sim.getFormulaHTML();
      // Static equations and paused experiments do not need DOM reconstruction.
      if (html !== this._lastFormulaHTML || !formulaEl.firstChild) {
        formulaEl.innerHTML = html;
        this._lastFormulaHTML = html;
      }
    }

    const records = document.getElementById('simulation-records');
    if (records?.open && this.sim.getDetailedReadoutHTML) {
      const html = this.sim.getDetailedReadoutHTML();
      if (html !== this._lastDetailedHTML) {
        records.querySelector('.simulation-records-content').innerHTML = html;
        this._lastDetailedHTML = html;
      }
    }

    // Play button state: glow green when paused (not playing, not finished); active (coral) when playing
    if (this.playBtn) {
      const isPaused = !this.sim.playing && !this.sim.finished;
      this.playBtn.classList.toggle('play-ready', isPaused);
      this.playBtn.classList.toggle('play-active', this.sim.playing && !this.sim.finished);
    }
  }

  updateHash() {
    const parts = [];
    for (const [id, input] of Object.entries(this.elements)) {
      if (input.type === 'checkbox') parts.push(`${id}=${input.checked ? 1 : 0}`);
      else parts.push(`${id}=${input.value}`);
    }
    window.location.hash = parts.join('&');
  }
}
