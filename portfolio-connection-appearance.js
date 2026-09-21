/* Independent graph styling. Geometry and relationship navigation stay intact. */
(() => {
  'use strict';
  const key = 'portfolio:connection-appearance:v1';
  const defaults = { rootSize: 100, branchSize: 150, material: 'original', saturation: 135, brassMix: 28, specular: 100, glow: 50, etching: true, rim: true, flow: true, ...window.PortfolioVisualDefaults?.settings?.connectionGraph?.appearance };
  const presets = {
    golden: { ...defaults },
    original: { material: 'original', saturation: 100, brassMix: 0, specular: 0, glow: 0, etching: false, rim: false, flow: true },
    brass: { material: 'brass', saturation: 120, brassMix: 100, specular: 72, glow: 22, etching: true, rim: true, flow: true },
    glass: { material: 'glass', saturation: 120, brassMix: 0, specular: 65, glow: 30, etching: false, rim: true, flow: true },
    nixie: { material: 'nixie', saturation: 120, brassMix: 0, specular: 42, glow: 60, etching: true, rim: true, flow: true }
  };
  function normalize(raw) {
    const value = { ...defaults };
    if (!raw || typeof raw !== 'object') return value;
    for (const [name, min, max] of [['rootSize', 65, 160], ['branchSize', 65, 150], ['saturation', 65, 200], ['brassMix', 0, 100], ['specular', 0, 100], ['glow', 0, 100]]) {
      if (typeof raw[name] === 'number' && Number.isFinite(raw[name])) value[name] = Math.max(min, Math.min(max, Math.round(raw[name])));
    }
    if (['original', 'brass', 'glass', 'nixie'].includes(raw.material)) value.material = raw.material;
    for (const name of ['etching', 'rim', 'flow']) if (typeof raw[name] === 'boolean') value[name] = raw[name];
    return value;
  }
  let current;
  try { current = normalize(JSON.parse(localStorage.getItem(key))); } catch { current = { ...defaults }; }
  let mounted = null;
  function mount({ diagram, header }) {
    const make = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const action = (label, handler) => {
      const node = make('button', '', label); node.type = 'button'; node.addEventListener('click', handler); return node;
    };
    const launch = action('Graph appearance', () => toggle(panel.hidden));
    launch.className = 'pc-appearance-launch studio-ui'; launch.setAttribute('aria-controls', 'pc-appearance-panel'); launch.setAttribute('aria-expanded', 'false');
    header.append(launch);
    const panel = make('aside', 'pc-appearance-panel studio-ui');
    panel.id = 'pc-appearance-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Graph appearance');
    const top = make('header', 'pc-appearance-top');
    const heading = make('strong', '', 'Graph appearance');
    const dock = action('Dock left', () => { const left = panel.dataset.dock !== 'left'; panel.dataset.dock = left ? 'left' : 'right'; dock.textContent = left ? 'Dock right' : 'Dock left'; });
    const close = action('×', () => toggle(false)); close.setAttribute('aria-label', 'Close graph appearance');
    top.append(heading, dock, close); panel.append(top);
    const body = make('div', 'pc-appearance-body'); panel.append(body);
    body.append(make('p', 'pc-appearance-note', 'Change the finish, keep the map. Every treatment is optional.'));
    const inputs = new Map();
    function range(name, label, min, max) {
      const field = make('label', 'pc-appearance-range');
      const text = make('span', '', label), output = make('output');
      const input = make('input'); input.type = 'range'; input.min = min; input.max = max; input.step = 1; input.setAttribute('aria-label', label);
      input.addEventListener('input', () => { current[name] = Number(input.value); apply(); sync(); });
      input.addEventListener('change', save);
      field.append(text, output, input); body.append(field); inputs.set(name, { input, output });
    }
    body.append(make('h4', '', 'Node sizes'));
    range('rootSize', 'Root node size', 65, 160);
    range('branchSize', 'Branch node size', 65, 150);
    body.append(make('p', 'pc-appearance-note', 'Root and branches scale together as the page zooms. These controls adjust their relative sizes.'));
    body.append(make('h4', '', 'Finish presets'));
    const presetRow = make('div', 'pc-appearance-presets'); presetRow.setAttribute('role', 'group'); presetRow.setAttribute('aria-label', 'Graph finish presets');
    const presetButtons = new Map();
    for (const [id, label] of [['golden', 'Golden color'], ['original', 'Original'], ['brass', 'Polished brass'], ['glass', 'Glass & copper'], ['nixie', 'Nixie cabinet']]) {
      const button = action(label, () => { current = { ...current, ...presets[id] }; apply(); sync(); save(); });
      presetButtons.set(id, button); presetRow.append(button);
    }
    body.append(presetRow);
    const materialLabel = make('label', 'pc-appearance-material'); materialLabel.append(make('span', '', 'Ribbon material'));
    const material = make('select'); material.setAttribute('aria-label', 'Ribbon material');
    for (const [value, label] of [['original', 'Original palette'], ['brass', 'Reflective brass'], ['glass', 'Glass & copper'], ['nixie', 'Amber nixie']]) {
      const option = make('option', '', label); option.value = value; material.append(option);
    }
    material.addEventListener('change', () => { current.material = material.value; apply(); sync(); save(); });
    materialLabel.append(material); body.append(materialLabel);
    range('saturation', 'Color saturation', 65, 200);
    range('brassMix', 'Brass blend · original palette', 0, 100);
    range('specular', 'Specular highlights · HDR look', 0, 100);
    range('glow', 'Extra glow', 0, 100);
    for (const [name, label] of [['etching', 'Steampunk etching'], ['rim', 'Polished thumbnail rims'], ['flow', 'Flowing light']]) {
      const field = make('label', 'pc-appearance-check'), input = make('input'); input.type = 'checkbox';
      input.addEventListener('change', () => { current[name] = input.checked; apply(); sync(); save(); });
      field.append(input, make('span', '', label)); body.append(field); inputs.set(name, { input });
    }
    const footer = make('footer', 'pc-appearance-footer');
    footer.append(action('Reset all', () => { current = { ...defaults }; apply(); sync(); save(); }));
    const saved = make('span', '', 'Saved in this browser · included in Studio export.'); footer.append(saved); body.append(footer);
    document.body.append(panel);
    function sync() {
      for (const [name, { input, output }] of inputs) {
        if (input.type === 'checkbox') input.checked = current[name];
        else { input.value = current[name]; output.textContent = `${current[name]}%`; }
      }
      material.value = current.material;
      inputs.get('brassMix').input.disabled = current.material !== 'original';
      for (const [id, button] of presetButtons) button.setAttribute('aria-pressed', String(Object.entries(presets[id]).every(([name, value]) => current[name] === value)));
    }
    function save() {
      try { localStorage.setItem(key, JSON.stringify(current)); saved.textContent = 'Saved in this browser · included in Studio export.'; }
      catch { saved.textContent = 'Storage unavailable · Studio export still captures this look.'; }
    }
    function apply() {
      diagram.dataset.appearanceReady = 'true';
      diagram.style.setProperty('--pc-root-scale', current.rootSize / 100);
      diagram.style.setProperty('--pc-branch-scale', current.branchSize / 100);
      diagram.dataset.flow = current.flow ? 'on' : 'off';
      window.PortfolioConnectionArt?.applyAppearance(diagram, current);
    }
    function toggle(open) {
      panel.hidden = !open; launch.setAttribute('aria-expanded', String(open));
      if (open) close.focus({ preventScroll: true }); else launch.focus({ preventScroll: true });
    }
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); toggle(false); } });
    window.addEventListener('storage', event => {
      if (event.key !== key) return;
      try { current = normalize(JSON.parse(event.newValue)); apply(); sync(); } catch { /* Ignore damaged preferences. */ }
    });
    sync(); apply();
    mounted = { apply, open: () => toggle(true), set: raw => { current = normalize(raw); apply(); sync(); save(); } };
    return mounted;
  }
  window.PortfolioConnectionAppearance = { mount, normalize, get current() { return { ...current }; }, open: () => mounted?.open(), set: raw => mounted?.set(raw) };
})();
