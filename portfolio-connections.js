/* A small, navigable neighborhood of projects and techniques. No layout library. */
(() => {
  'use strict';

  function initialize() {
    const root = document.getElementById('connection-explorer');
    const source = document.getElementById('connection-index');
    if (!root || !source || root.dataset.connectionsReady) return;
    let data;
    try { data = JSON.parse(source.textContent); }
    catch { root.textContent = 'Project connections are temporarily unavailable.'; return; }
    root.dataset.connectionsReady = 'true';

    const clean = value => typeof value === 'string' ? value.trim() : '';
    const key = value => clean(value).toLocaleLowerCase();
    const strings = value => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
    const projects = new Map();
    for (const project of Array.isArray(data.projects) ? data.projects : []) {
      if (!project || !clean(project.id)) continue;
      projects.set(project.id, { ...project, title: clean(project.title) || project.id, upcoming: false });
    }
    for (const project of Array.isArray(data.upcoming) ? data.upcoming : []) {
      if (!project || !clean(project.id) || projects.has(project.id)) continue;
      projects.set(project.id, { ...project, title: clean(project.title) || project.id, upcoming: true });
    }
    if (!projects.size) { root.textContent = 'Project connections will appear here as work is added.'; return; }

    const techniqueCategories = new Map((Array.isArray(data.techniqueCategories) ? data.techniqueCategories : [])
      .filter(category => category && clean(category.id))
      .map(category => [key(category.id), category]));
    const techniques = new Map();
    const techniqueAliases = new Map();
    const projectTermSets = new Map([...projects.keys()].map(id => [id, new Set()]));
    const definitions = (Array.isArray(data.techniques) ? data.techniques : []).filter(definition => definition && clean(definition.label || definition.id));
    for (const definition of definitions) {
      const title = clean(definition.label || definition.id);
      const canonical = key(title);
      const technique = { ...definition, key: canonical, title, projects: [] };
      techniques.set(canonical, technique);
      for (const alias of [definition.id, definition.label, ...strings(definition.aliases)]) {
        if (clean(alias)) techniqueAliases.set(key(alias), canonical);
      }
    }
    const addTechniqueProject = (term, project) => {
      const canonical = techniqueAliases.get(key(term)) || key(term);
      if (!canonical || project.upcoming) return;
      if (!techniques.has(canonical)) techniques.set(canonical, { key: canonical, title: clean(term), projects: [] });
      const technique = techniques.get(canonical);
      if (!technique.projects.some(candidate => candidate.id === project.id)) technique.projects.push(project);
      projectTermSets.get(project.id).add(canonical);
    };
    if (definitions.length) {
      for (const definition of definitions) {
        const canonical = techniqueAliases.get(key(definition.id || definition.label));
        for (const projectId of strings(definition.projects)) {
          const project = projects.get(projectId);
          if (project) addTechniqueProject(canonical, project);
        }
      }
      for (const project of projects.values()) {
        for (const term of strings(project.techniques)) addTechniqueProject(term, project);
      }
    } else {
      // Backward-compatible support for older generated pages. New builds use the
      // curated technique registry rather than treating every keyword as a topic.
      for (const project of projects.values()) {
        for (const term of [...strings(project.tags), clean(project.language), ...strings(project.keywords)]) addTechniqueProject(term, project);
      }
    }
    const projectTerms = new Map([...projectTermSets].map(([id, terms]) => [id, [...terms]]));
    const relationships = (Array.isArray(data.relationships) ? data.relationships : []).filter(relation =>
      relation && projects.has(relation.source) && projects.has(relation.target) && relation.source !== relation.target
    );
    const defaultProject = projects.get('photon_primitive') || [...projects.values()].find(project => /photon primitives/i.test(project.title)) || projects.values().next().value;
    const state = { mode: 'connections', projectId: defaultProject.id, focus: 'project', term: null, expanded: false };
    const trail = [];
    const MAX_NEIGHBORS = 8;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let externalLayout = Promise.resolve();
    let renderVersion = 0;
    let rendered = false;
    let renderAnimations = [];
    let renderPromise = Promise.resolve();
    let graphScrollVersion = 0;
    let graphScrollFrame = 0;
    let hoveredNeighbor = null;
    let focusedNeighbor = null;
    const diagramStyles = [
      ['arc-atlas', 'Arc atlas · Focus & orbits', 'The selected idea on the left, its connections along a circular arc. Inward chord sweeps, etched brass, and quiet light.'],
      ['network', 'Member network', 'Flowing chords between group members, with the group name floating in the middle.'],
      ['category-rim', 'Category on rim', 'A broad ribbon fan, anchored to a larger category node on the opposite rim.'],
      ['orrery', 'Orrery · Brass & starlight', 'An engraved celestial instrument, with brass ribbons carrying the connections.'],
      ['interference', 'Interference · Liquid light', 'Iridescent ribbons, optical contours, and slow pulses of pearlescent light.'],
      ['opaline', 'Opaline · Glass cathedral', 'Faceted glass ribbons held in copper, beneath an imaginary rose window.'],
      ['woven', 'Through-center weave', 'Continuous ribbons carry an idea from one node to another.'],
      ['chords', 'Flowing chords', 'A fan of ribbons, gathered into one shared idea.'],
      ['radial', 'Radial branches', 'An orbit of curved branches around the selected idea.'],
      ['ernst', 'Ernst · Botanical dream', 'Engraved leaves, feathered paths, and a nocturnal garden.'],
      ['klee', 'Klee · Polyphonic paths', 'Color, rhythm, and a line taking a walk.'],
      ['chirico', 'de Chirico · Midnight arcade', 'Impossible arcades, suspended forms, and long shadows.'],
      ['dali', 'Dalí · Elastic orbits', 'Liquid ribbons suspended above a dreamlike horizon.'],
      ['decorative-chords', 'Flowing chords · Ambient', 'A quiet composition of flowing ribbons and project thumbnails.', 'chords'],
      ['decorative-interference', 'Interference · Ambient', 'Pearlescent ribbons and optical contours, moving gently on their own.', 'interference'],
      ['decorative-opaline', 'Opaline · Ambient', 'A luminous glass composition with slowly passing glints.', 'opaline']
    ];
    const styleStorageKey = 'portfolio:connection-style';
    const graphDefaults = window.PortfolioVisualDefaults?.settings?.connectionGraph || {};
    let diagramStyle = diagramStyles.some(([id]) => id === graphDefaults.style) ? graphDefaults.style : 'arc-atlas';
    try {
      const saved = localStorage.getItem(styleStorageKey);
      if (diagramStyles.some(([id]) => id === saved)) diagramStyle = saved;
    } catch { /* The selector also works without persistent storage. */ }
    const selectedStyle = () => diagramStyles.find(([id]) => id === diagramStyle);
    const geometryStyle = () => selectedStyle()[3] || diagramStyle;
    const isDecorative = () => Boolean(selectedStyle()[3]);
    const rotationKey = 'portfolio:connection-rotation';
    const snapRotation = value => Math.max(-180, Math.min(180, Math.round((Number(value) || 0) / 5) * 5));
    let diagramRotation = snapRotation(graphDefaults.rotation ?? -35);
    try { diagramRotation = snapRotation(localStorage.getItem(rotationKey) ?? diagramRotation); } catch { /* Optional preference. */ }

    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function button(className, text, handler) {
      const node = element('button', className, text);
      node.type = 'button';
      node.addEventListener('click', handler);
      return node;
    }
    function svgElement(tag, attributes = {}, text) {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function techniqueFamily(item) {
      const category = key(item?.category).replace(/[\s_]+/g, '-');
      if (category === 'method') return 'graph';
      if (category === 'platform') return 'compute';
      if (category === 'language') return 'code';
      if (category === 'domain') return 'constellation';
      if (/(?:render|light|optic)/.test(category)) return 'light';
      if (/(?:compute|platform|runtime|gpu|web)/.test(category)) return 'compute';
      if (/(?:learn|neural|ai)/.test(category)) return 'learning';
      if (/(?:sound|audio|acoustic)/.test(category)) return 'sound';
      if (/(?:simulat|physics|physical)/.test(category)) return 'simulation';
      if (/(?:geometr|curve|spatial)/.test(category)) return 'geometry';
      if (/(?:algorithm|data-structure|graph)/.test(category)) return 'graph';
      if (/(?:math|theory|analysis)/.test(category)) return 'math';
      if (/(?:image|camera|vision)/.test(category)) return 'image';
      if (/(?:language|framework|software|code)/.test(category)) return 'code';
      return 'constellation';
    }
    function techniqueSigil(item, className) {
      const title = clean(item?.title ?? item);
      const family = techniqueFamily(item);
      const category = ['domain', 'method', 'platform', 'language'].includes(key(item?.category)) ? key(item.category) : 'uncategorized';
      const frame = element('span', `${className} pc-technique-sigil pc-sigil-${family} pc-technique-category-${category}`);
      frame.dataset.sigil = family;
      frame.dataset.techniqueCategory = category;
      frame.setAttribute('aria-hidden', 'true');
      const symbol = clean(item?.symbol);
      if (symbol && symbol !== '#') {
        const glyph = element('span', `pc-sigil-glyph${[...symbol].length > 2 ? ' pc-sigil-glyph-compact' : ''}`, symbol);
        frame.append(glyph);
        return frame;
      }
      const svg = svgElement('svg', { viewBox: '0 0 48 48', focusable: 'false' });
      const path = (d, className = 'pc-sigil-line') => svgElement('path', { d, class: className });
      const line = (x1, y1, x2, y2, className = 'pc-sigil-line') => svgElement('line', { x1, y1, x2, y2, class: className });
      const circle = (cx, cy, r = 2.2, className = 'pc-sigil-node') => svgElement('circle', { cx, cy, r, class: className });
      switch (family) {
        case 'light':
          svg.append(path('M7 33C16 8 27 8 41 20', 'pc-sigil-line pc-sigil-trace'), path('M7 33C18 19 28 22 41 20'), circle(7, 33), circle(23, 18, 2.5), circle(41, 20));
          break;
        case 'compute':
          svg.append(svgElement('rect', { x: 12, y: 12, width: 24, height: 24, rx: 4, class: 'pc-sigil-line' }), path('M18 29V19H24V29H30V19', 'pc-sigil-line pc-sigil-trace'));
          for (const p of [16, 24, 32]) svg.append(line(p, 7, p, 12), line(p, 36, p, 41), line(7, p, 12, p), line(36, p, 41, p));
          break;
        case 'learning':
          svg.append(line(11, 14, 24, 24), line(11, 34, 24, 24), line(24, 24, 38, 12), line(24, 24, 38, 25), line(24, 24, 38, 37, 'pc-sigil-line pc-sigil-trace'), circle(11, 14), circle(11, 34), circle(24, 24, 2.8), circle(38, 12), circle(38, 25), circle(38, 37));
          break;
        case 'sound':
          svg.append(path('M5 25H11L15 13L21 36L27 9L33 31L37 21H43', 'pc-sigil-line pc-sigil-trace'), line(5, 39, 43, 39, 'pc-sigil-faint'));
          break;
        case 'simulation':
          svg.append(path('M5 18C11 10 17 10 23 18S35 26 43 18', 'pc-sigil-line pc-sigil-trace'), path('M5 30C11 22 17 22 23 30S35 38 43 30'), circle(12, 16, 1.8), circle(35, 32, 1.8));
          break;
        case 'geometry':
          svg.append(path('M7 35C10 10 22 8 25 23S38 42 41 13', 'pc-sigil-line pc-sigil-trace'), line(7, 35, 25, 23, 'pc-sigil-faint'), line(25, 23, 41, 13, 'pc-sigil-faint'), circle(7, 35), circle(25, 23), circle(41, 13));
          break;
        case 'graph':
          svg.append(line(10, 35, 18, 13), line(18, 13, 31, 20, 'pc-sigil-line pc-sigil-trace'), line(10, 35, 35, 36), line(31, 20, 35, 36), circle(10, 35), circle(18, 13), circle(31, 20), circle(35, 36));
          break;
        case 'math':
          svg.append(path('M37 10H14L27 24L14 38H37', 'pc-sigil-line pc-sigil-trace'), path('M9 15C16 7 32 7 40 15M9 33C16 41 32 41 40 33', 'pc-sigil-faint'));
          break;
        case 'image':
          svg.append(svgElement('rect', { x: 8, y: 10, width: 32, height: 28, rx: 5, class: 'pc-sigil-line' }), circle(31, 18, 4), path('M10 34L19 24L25 30L30 26L39 35', 'pc-sigil-line pc-sigil-trace'));
          break;
        case 'code':
          svg.append(path('M19 12L8 24L19 36M29 12L40 24L29 36', 'pc-sigil-line pc-sigil-trace'), line(27, 8, 21, 40, 'pc-sigil-faint'));
          break;
        default: {
          let hash = 2166136261;
          for (const character of title) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
          const angles = [hash % 360, (hash >>> 8) % 360, (hash >>> 16) % 360].map(angle => angle * Math.PI / 180);
          const points = angles.map((angle, index) => ({ x: 24 + Math.cos(angle) * (12 + index * 3), y: 24 + Math.sin(angle) * (12 + index * 3) }));
          svg.append(svgElement('ellipse', { cx: 24, cy: 24, rx: 17, ry: 10, transform: `rotate(${hash % 70 - 35} 24 24)`, class: 'pc-sigil-faint pc-sigil-trace' }));
          for (const point of points) svg.append(line(24, 24, point.x.toFixed(2), point.y.toFixed(2), 'pc-sigil-faint'));
          svg.append(circle(24, 24, 2.6), ...points.map(point => circle(point.x.toFixed(2), point.y.toFixed(2), 1.9)));
        }
      }
      frame.append(svg);
      return frame;
    }
    function safeHref(value) {
      const href = clean(value);
      if (!href || /^(?:javascript|data|vbscript):/i.test(href)) return null;
      try {
        const resolved = new URL(href, window.location.href);
        return ['http:', 'https:'].includes(resolved.protocol) ? href : null;
      } catch { return null; }
    }
    function thumbnail(project, className = 'pc-thumbnail') {
      const frame = element('div', className);
      const src = safeHref(project.thumbnail);
      if (src) {
        const image = element('img');
        image.src = src;
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', () => image.remove(), { once: true });
        frame.append(image);
      }
      frame.append(element('span', 'pc-thumbnail-mark', project.upcoming ? '↗' : '◇'));
      return frame;
    }
    function shortLabel(item, limit = 42) {
      const title = clean(item.shortLabel) || item.title;
      if (title.length <= limit) return title;
      const clipped = title.slice(0, limit - 1);
      const boundary = clipped.lastIndexOf(' ');
      return `${boundary > limit / 2 ? clipped.slice(0, boundary) : clipped}…`;
    }
    function setProjectURL(id) {
      const url = new URL(window.location.href);
      url.searchParams.set('project', id);
      url.searchParams.delete('technique');
      url.hash = 'connections';
      window.history.replaceState(window.history.state, '', url);
      const detail = { id };
      document.dispatchEvent(new CustomEvent('portfolio:graph-project', { detail }));
      externalLayout = Promise.resolve(detail.settled).catch(() => {});
    }
    function emitTechnique(term) {
      const detail = { term };
      document.dispatchEvent(new CustomEvent('portfolio:graph-technique', { detail }));
      externalLayout = Promise.resolve(detail.settled).catch(() => {});
    }

    root.classList.add('pc-explorer');
    const toolbar = element('div', 'pc-toolbar');
    const modes = element('div', 'pc-modes');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', 'Connection type');
    const modeButtons = {
      connections: button('pc-mode', 'Project connections', () => switchMode('connections')),
      techniques: button('pc-mode', 'Shared techniques', () => switchMode('techniques'))
    };
    modes.append(modeButtons.connections, modeButtons.techniques);
    toolbar.append(modes);
    const selectors = element('div', 'pc-selectors');
    const projectLabel = element('label', 'pc-select-label');
    projectLabel.append(element('span', '', 'Explore a project'));
    const projectSelect = element('select', 'pc-select');
    for (const upcoming of [false, true]) {
      const group = document.createElement('optgroup');
      group.label = upcoming ? 'Coming later' : 'Available projects';
      for (const project of projects.values()) {
        if (project.upcoming !== upcoming) continue;
        const option = element('option', '', project.title);
        option.value = project.id;
        group.append(option);
      }
      if (group.children.length) projectSelect.append(group);
    }
    projectSelect.addEventListener('change', () => selectProject(projectSelect.value, { internal: true }));
    projectLabel.append(projectSelect);
    const techniqueLabel = element('label', 'pc-select-label');
    techniqueLabel.append(element('span', '', 'Or follow a technique'));
    const techniqueSelect = element('select', 'pc-select');
    const placeholder = element('option', '', 'Choose a technique');
    placeholder.value = '';
    techniqueSelect.append(placeholder);
    const categorizedTerms = [...techniques.values()].sort((a, b) => a.title.localeCompare(b.title));
    const categoryOrder = [...techniqueCategories.keys(), 'uncategorized'];
    for (const categoryId of categoryOrder) {
      const terms = categorizedTerms.filter(term => (key(term.category) || 'uncategorized') === categoryId);
      if (!terms.length) continue;
      const category = techniqueCategories.get(categoryId);
      const group = element('optgroup');
      group.label = category?.label || 'Other';
      for (const term of terms) {
        const option = element('option', '', `${term.title} · ${term.projects.length} ${term.projects.length === 1 ? 'project' : 'projects'}`);
        option.value = term.key;
        group.append(option);
      }
      techniqueSelect.append(group);
    }
    techniqueSelect.addEventListener('change', () => {
      if (techniqueSelect.value) selectTechnique(techniques.get(techniqueSelect.value).title, { internal: true });
    });
    techniqueLabel.append(techniqueSelect);
    selectors.append(projectLabel, techniqueLabel);
    toolbar.append(selectors);

    const purpose = element('p', 'pc-purpose');
    const pathNav = element('nav', 'pc-trail');
    pathNav.setAttribute('aria-label', 'Your exploration path');
    const workbench = element('div', 'pc-workbench');
    const diagramPanel = element('div', 'pc-diagram-panel');
    const diagramHeader = element('div', 'pc-diagram-header');
    const styleLabel = element('label', 'pc-style-label', 'Diagram style');
    styleLabel.htmlFor = 'pc-diagram-style';
    const styleSelect = element('select', 'pc-select pc-style-select');
    styleSelect.id = 'pc-diagram-style';
    styleSelect.setAttribute('aria-label', 'Diagram style');
    for (const decorative of [false, true]) {
      const group = element('optgroup');
      group.label = decorative ? 'Decorative compositions' : 'Interactive maps';
      for (const [value, title, , baseStyle] of diagramStyles) {
        if (Boolean(baseStyle) !== decorative) continue;
        const option = element('option', '', title);
        option.value = value;
        group.append(option);
      }
      styleSelect.append(group);
    }
    styleSelect.value = diagramStyle;
    styleSelect.addEventListener('change', () => {
      diagramStyle = styleSelect.value;
      try { localStorage.setItem(styleStorageKey, diagramStyle); } catch { /* Optional preference. */ }
      render(false);
    });
    styleLabel.append(styleSelect);
    const rotationLabel = element('label', 'pc-rotation-label', 'Rotation ');
    const rotationValue = element('output', '', `${diagramRotation}°`);
    const rotationInput = element('input');
    rotationInput.type = 'range'; rotationInput.min = '-180'; rotationInput.max = '180'; rotationInput.step = '5';
    rotationInput.value = diagramRotation;
    rotationInput.setAttribute('aria-label', 'Graph rotation');
    rotationInput.addEventListener('input', () => {
      diagramRotation = snapRotation(rotationInput.value);
      try { localStorage.setItem(rotationKey, diagramRotation); } catch { /* Optional preference. */ }
      applyRotation();
    });
    const resetRotation = button('pc-rotation-reset', 'Reset angle', () => {
      diagramRotation = 0; rotationInput.value = 0;
      try { localStorage.setItem(rotationKey, '0'); } catch { /* Optional preference. */ }
      applyRotation();
    });
    rotationLabel.append(rotationValue, rotationInput);
    const legend = element('div', 'pc-legend');
    const diagram = element('div', 'pc-diagram');
    diagram.setAttribute('role', 'group');
    diagram.setAttribute('aria-label', 'Connection diagram. Select a node to continue exploring.');
    const diagramNote = element('p', 'pc-diagram-note');
    const styleCaption = element('p', 'pc-style-caption');
    styleCaption.id = 'pc-style-caption';
    styleSelect.setAttribute('aria-describedby', styleCaption.id);
    diagramHeader.append(legend, styleLabel, rotationLabel, resetRotation);
    diagramPanel.append(diagramHeader, styleCaption, diagram, diagramNote);
    const appearance = window.PortfolioConnectionAppearance?.mount({ diagram, header: diagramHeader });
    const focusPanel = element('article', 'pc-focus');
    workbench.append(diagramPanel, focusPanel);
    const resultsHeader = element('div', 'pc-results-header');
    const resultsTitle = element('h3', 'pc-results-title');
    resultsTitle.id = 'pc-results-heading';
    resultsTitle.tabIndex = -1;
    const status = element('p', 'pc-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    resultsHeader.append(resultsTitle, status);
    const cards = element('div', 'pc-cards');
    const more = element('div', 'pc-more');
    root.replaceChildren(toolbar, purpose, pathNav, workbench, resultsHeader, cards, more);
    const transitionRegions = [purpose, pathNav, workbench, resultsHeader, cards, more];
    let focusScrollBlockedThrough = 0;
    window.PortfolioConnections = { whenStable: ({ preventScroll = false } = {}) => {
      // A return trip owns navigation even if a node's fade is still finishing.
      if (preventScroll) { focusScrollBlockedThrough = renderVersion; cancelGraphCenter(); }
      return renderPromise;
    }, center: requestGraphCenter };
    // An explicit gesture takes ownership immediately, including while fonts or
    // a graph fade are settling. Never pull the reader back after they scroll.
    window.addEventListener('wheel', cancelGraphCenter, { passive: true });
    window.addEventListener('touchstart', cancelGraphCenter, { passive: true });
    window.addEventListener('pointerdown', cancelGraphCenter, { passive: true });
    window.addEventListener('keydown', event => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Escape', ' '].includes(event.key)) cancelGraphCenter();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelGraphCenter(); });

    const neighborKey = neighbor => `${neighbor.kind}:${neighbor.item.id || neighbor.item.key}`;
    const relatedKeys = node => node.dataset.pcNeighbors
      ? JSON.parse(node.dataset.pcNeighbors) : [node.dataset.pcNeighbor];
    let highlightedNeighbor = null;
    let highlightedDecorative = false;
    function highlightNeighbor() {
      const active = hoveredNeighbor || focusedNeighbor;
      const decorative = diagram.dataset.interaction === 'decorative';
      // pointerover bubbles for every child of a card/avatar. The relationship
      // is unchanged while crossing its image, text or SVG paths; avoid another
      // full graph query and class pass for those events.
      const sameNeighbor = active === highlightedNeighbor || Boolean(active && highlightedNeighbor
        && active.length === highlightedNeighbor.length && active.every(id => highlightedNeighbor.includes(id)));
      if (sameNeighbor && decorative === highlightedDecorative) return;
      highlightedNeighbor = active;
      highlightedDecorative = decorative;
      root.classList.toggle('pc-highlighting', Boolean(active) && !decorative);
      for (const node of root.querySelectorAll('[data-pc-neighbor], [data-pc-neighbors]')) {
        if (decorative && diagram.contains(node)) {
          node.classList.remove('is-related');
          continue;
        }
        const keys = relatedKeys(node);
        const matches = active && (active.length > 1 && node.dataset.pcNeighbors
          ? keys.length === active.length && keys.every(id => active.includes(id))
          : keys.some(id => active.includes(id)));
        node.classList.toggle('is-related', Boolean(matches));
      }
    }
    function relatedKey(target) {
      const related = target instanceof Element && target.closest('[data-pc-neighbors], [data-pc-neighbor]');
      return related && root.contains(related) ? relatedKeys(related) : null;
    }
    root.addEventListener('pointerover', event => {
      hoveredNeighbor = relatedKey(event.target);
      highlightNeighbor();
    });
    root.addEventListener('pointerleave', () => { hoveredNeighbor = null; highlightNeighbor(); });
    root.addEventListener('focusin', event => { focusedNeighbor = relatedKey(event.target); highlightNeighbor(); });
    root.addEventListener('focusout', event => { focusedNeighbor = relatedKey(event.relatedTarget); highlightNeighbor(); });
    const animatedSelector = '.pc-ribbon-light,.pc-sigil-trace,.pc-art-breathe,.pc-art-drift,.pc-art-precess,.pc-wave-contour,.pc-glass-glint';
    const motionRegions = new Map();
    let visibilityObserver = null;
    function setRegionMotion(region, inView) {
      region.inView = inView;
      // Clear the override when visible so existing hidden-tab/reduced-motion
      // CSS remains authoritative. Never force an animation to run inline.
      for (const target of region.targets) target.style.animationPlayState = inView ? '' : 'paused';
    }
    function syncMotionRegions() {
      if (!visibilityObserver) return;
      const regions = new Set([diagram, focusPanel, ...cards.children]);
      for (const [node] of motionRegions) {
        if (regions.has(node)) continue;
        visibilityObserver.unobserve(node);
        motionRegions.delete(node);
      }
      for (const node of regions) {
        const targets = [...node.querySelectorAll(animatedSelector)];
        const previous = motionRegions.get(node);
        if (!targets.length) {
          if (previous) visibilityObserver.unobserve(node);
          motionRegions.delete(node);
          continue;
        }
        const region = { targets, inView: previous?.inView || false };
        motionRegions.set(node, region);
        setRegionMotion(region, region.inView);
        if (!previous) visibilityObserver.observe(node);
      }
    }
    if ('IntersectionObserver' in window) {
      visibilityObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.target === root) root.classList.toggle('pc-in-view', entry.isIntersecting);
          else {
            const region = motionRegions.get(entry.target);
            if (region && region.inView !== entry.isIntersecting) setRegionMotion(region, entry.isIntersecting);
          }
        }
      }, { rootMargin: '100px' });
      // The explorer includes a long list of cards. Its diagram may be far
      // offscreen while the explorer itself still intersects the viewport.
      visibilityObserver.observe(root);
    } else root.classList.add('pc-in-view');
    const pauseGraph = () => root.classList.toggle('pc-sleeping', document.hidden);
    document.addEventListener('visibilitychange', pauseGraph);
    pauseGraph();

    function context() {
      if (state.mode === 'techniques' && state.focus === 'term') {
        const term = techniques.get(state.term) || { key: state.term, title: state.term, projects: [] };
        return {
          kind: 'technique', item: term, title: term.title,
          neighbors: term.projects.map(project => ({ kind: 'project', item: project, edgeLabel: term.title, reason: `Lists ${term.title} among its techniques.`, shared: true }))
        };
      }
      const project = projects.get(state.projectId);
      if (state.mode === 'techniques') {
        return {
          kind: 'project', item: project, title: project.title,
          neighbors: (projectTerms.get(project.id) || []).map(term => techniques.get(term)).filter(term => term.projects.length > 1).map(term => ({
            kind: 'technique', item: term, edgeLabel: 'Shared technique', shared: true,
            reason: clean(term.description) || `${project.title} and the projects shown here use ${term.title}.`
          }))
        };
      }
      const connected = new Map();
      for (const relation of relationships) {
        if (relation.source !== project.id && relation.target !== project.id) continue;
        const neighborId = relation.source === project.id ? relation.target : relation.source;
        if (!connected.has(neighborId)) connected.set(neighborId, { kind: 'project', item: projects.get(neighborId), relationships: [], shared: false });
        connected.get(neighborId).relationships.push(relation);
      }
      for (const neighbor of connected.values()) neighbor.edgeLabel = clean(neighbor.relationships[0].label) || 'Project connection';
      return { kind: 'project', item: project, title: project.title, neighbors: [...connected.values()] };
    }
    function trailEntry() {
      const current = context();
      return { mode: state.mode, focus: state.focus, projectId: state.projectId, term: state.term, title: current.title };
    }
    function remember() {
      const next = trailEntry();
      const last = trail[trail.length - 1];
      if (last && next.mode === last.mode && next.focus === last.focus && next.projectId === last.projectId && next.term === last.term) return;
      trail.push(next);
      if (trail.length > 6) trail.shift();
    }
    function selectProject(id, options = {}) {
      if (!projects.has(id)) return;
      state.projectId = id;
      state.focus = 'project';
      state.term = null;
      state.expanded = false;
      if (options.connections) {
        const hasCuratedConnections = relationships.some(relation => relation.source === id || relation.target === id);
        state.mode = hasCuratedConnections ? 'connections' : 'techniques';
      }
      remember();
      if (options.internal) setProjectURL(id);
      render(options.focusHeading);
    }
    function selectTechnique(term, options = {}) {
      const normalized = techniqueAliases.get(key(term)) || key(term);
      if (!normalized) return;
      state.mode = 'techniques';
      state.focus = 'term';
      state.term = normalized;
      state.expanded = false;
      remember();
      if (options.internal) emitTechnique(techniques.get(normalized)?.title || clean(term));
      render(options.focusHeading);
    }
    function switchMode(mode) {
      state.mode = mode;
      state.focus = 'project';
      state.term = null;
      state.expanded = false;
      remember();
      // Switching out of a technique also clears its results above the graph.
      // Keep the requested mode; automatic mode choice is only for entry links.
      setProjectURL(state.projectId);
      render(false);
    }
    function follow(neighbor) {
      if (neighbor.kind === 'technique') selectTechnique(neighbor.item.title, { internal: true, focusHeading: true });
      else selectProject(neighbor.item.id, { internal: true, focusHeading: true });
    }
    function projectLinks(project, target) {
      if (project.upcoming) return;
      const explanation = safeHref(project.learnMoreHref || project.href);
      const demo = safeHref(project.demoHref);
      const candidates = explanation && explanation !== demo
        ? [['Overview', explanation], ['Open live demo', demo]]
        : [['Open project', demo || explanation]];
      const seen = new Set();
      for (const [label, candidate] of candidates) {
        const href = safeHref(candidate);
        if (!href || seen.has(href)) continue;
        seen.add(href);
        const link = element('a', 'pc-text-link', label);
        link.href = href;
        if (label === 'Overview') link.dataset.overview = project.id;
        target.append(link);
      }
    }
    function renderTrail() {
      pathNav.replaceChildren(element('span', 'pc-trail-label', 'Your path'));
      trail.forEach((entry, index) => {
        if (index) {
          const arrow = element('span', 'pc-trail-arrow', '›');
          arrow.setAttribute('aria-hidden', 'true');
          pathNav.append(arrow);
        }
        const item = button('pc-trail-step', entry.title, () => {
          Object.assign(state, entry, { expanded: false });
          trail.splice(index + 1);
          if (state.focus === 'term') emitTechnique(context().title);
          else setProjectURL(state.projectId);
          render(true);
        });
        if (index === trail.length - 1) item.setAttribute('aria-current', 'true');
        pathNav.append(item);
      });
    }
    function diagramNode(item, kind, x, y, center, handler) {
      const decorative = isDecorative();
      const className = `pc-node${center ? ' pc-node-center' : ''}${kind === 'technique' ? ' pc-node-technique' : ''}${item.upcoming ? ' pc-node-upcoming' : ''}`;
      const node = decorative ? element('div', `${className} pc-node-static`) : button(className, undefined, handler);
      node.style.left = `${x / 640 * 100}%`;
      node.style.top = `${y / 620 * 100}%`;
      node.dataset.graphX = x; node.dataset.graphY = y;
      const description = item.upcoming ? ', coming later' : kind === 'technique' ? ', technique' : ', project';
      if (!decorative) {
        node.setAttribute('aria-label', `${center ? 'Current focus: ' : 'Explore '}${item.title}${description}`);
        node.title = item.title + (kind === 'technique' && strings(item.aliases).length ? '\nAlso indexed as: ' + strings(item.aliases).join(', ') : '');
        if (center) node.setAttribute('aria-current', 'true');
      }
      const orb = kind === 'project' ? thumbnail(item, 'pc-node-orb') : techniqueSigil(item, 'pc-node-orb');
      if (decorative) {
        const mark = orb.querySelector('.pc-thumbnail-mark');
        if (mark) mark.textContent = '◇';
      }
      orb.setAttribute('aria-hidden', 'true');
      node.append(orb, element('span', 'pc-node-label', shortLabel(item, center ? 52 : 38)));
      if (item.upcoming) node.append(element('span', 'pc-node-caption', 'Coming later'));
      return node;
    }
    function cubicSample(control, t) {
      const s = 1 - t, [a, b, c, d] = control;
      const x = s ** 3 * a.x + 3 * s ** 2 * t * b.x + 3 * s * t ** 2 * c.x + t ** 3 * d.x;
      const y = s ** 3 * a.y + 3 * s ** 2 * t * b.y + 3 * s * t ** 2 * c.y + t ** 3 * d.y;
      const dx = 3 * s ** 2 * (b.x - a.x) + 6 * s * t * (c.x - b.x) + 3 * t ** 2 * (d.x - c.x);
      const dy = 3 * s ** 2 * (b.y - a.y) + 6 * s * t * (c.y - b.y) + 3 * t ** 2 * (d.y - c.y);
      const length = Math.hypot(dx, dy) || 1;
      return { x, y, nx: -dy / length, ny: dx / length };
    }
    function renderRoutes(svg, definitions, positions, current) {
      const center = { x: 320, y: 292 };
      const art = window.PortfolioConnectionArt;
      const palette = art?.palette(diagramStyle) || ['#ebc974', '#89bec0', '#c2a4ce', '#c0c990'];
      const pairs = [];
      const count = positions.length, half = Math.ceil(count / 2);
      if (count === 1) pairs.push([positions[0]]);
      else if (count > 1) {
        for (let i = 0; i < Math.floor(count / 2); i++) pairs.push([positions[i], positions[i + half]]);
        if (count % 2) pairs.push([positions[half - 1], positions[0]]);
      }
      // Each pair is a two-edge route A — focus — B. Pairing only arranges the
      // existing neighborhood; it never adds a direct relationship to the data.
      pairs.forEach((ends, routeIndex) => {
        const color = palette[routeIndex % palette.length];
        const keys = ends.map(end => neighborKey(end.neighbor));
        const route = svgElement('g', { class: 'pc-branch pc-route', 'data-pc-neighbors': JSON.stringify(keys) });
        route.style.setProperty('--branch-color', color);
        route.style.setProperty('--branch-delay', `${-routeIndex * 1.7}s`);
        route.style.setProperty('--branch-duration', `${8 + routeIndex % 3}s`);
        const pathTitle = ends.length === 2
          ? `${ends[0].neighbor.item.title} — ${current.title} — ${ends[1].neighbor.item.title}`
          : `${current.title} — ${ends[0].neighbor.item.title}`;
        route.setAttribute('data-route-via', current.item.id || current.item.key);
        const colors = svgElement('linearGradient', { id: `pc-route-${routeIndex}`, gradientUnits: 'userSpaceOnUse',
          x1: ends[0].x, y1: ends[0].y, x2: ends[1]?.x ?? center.x, y2: ends[1]?.y ?? center.y });
        for (const [offset, shade, opacity] of [[0, color, .88], [38, color, .48], [52, '#f7e7b6', .75], [72, color, .63], [100, color, .9]]) {
          colors.append(svgElement('stop', { offset: `${offset}%`, 'stop-color': shade, 'stop-opacity': opacity }));
        }
        definitions.append(colors);
        ends.forEach((end, side) => {
          const start = { x: end.x, y: end.y };
          const control = art?.control(diagramStyle, start, center, routeIndex * 2 + side) || [
            start, { x: start.x * .7 + 96, y: start.y * .7 + 65 },
            { x: center.x + (start.x - center.x) * .2, y: center.y + (start.y - center.y) * .2 }, center
          ];
          // Opposing tangents meet beneath the center badge so a complete pair
          // remains one continuous route even with independently curved halves.
          if (ends.length === 2) {
            const dx = ends[1].x - ends[0].x, dy = ends[1].y - ends[0].y;
            const distance = Math.hypot(dx, dy) || 1;
            const sign = side ? 1 : -1;
            control[2] = { x: center.x + sign * dx / distance * 44, y: center.y + sign * dy / distance * 44 };
          }
          const left = [], right = [];
          const widthAt = t => {
            const wave = Math.sin(Math.PI * t);
            if (diagramStyle === 'klee') return 8 + wave * 5;
            if (diagramStyle === 'chirico') return 16 - t * 6 + wave * 2;
            if (diagramStyle === 'dali') return 15 - t * 5 + wave ** 2 * (17 + side * 5);
            return 15 - t * 5 + wave * (diagramStyle === 'ernst' ? 14 : 10);
          };
          const pointText = p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
          for (let step = 0; step <= 40; step++) {
            const t = step / 40, p = cubicSample(control, t), width = widthAt(t);
            left.push(pointText({ x: p.x + p.nx * width, y: p.y + p.ny * width }));
            right.push(pointText({ x: p.x - p.nx * width, y: p.y - p.ny * width }));
          }
          const outline = `M ${left.join(' L ')} L ${right.reverse().join(' L ')} Z`;
          const spine = `M ${pointText(control[0])} C ${control.slice(1).map(pointText).join(' ')}`;
          const branch = svgElement('g', { class: 'pc-route-half', 'data-pc-neighbors': JSON.stringify(keys),
            'data-pc-destination': neighborKey(end.neighbor) });
          branch.append(svgElement('title', {}, `${pathTitle}. Explore ${end.neighbor.item.title}.`));
          branch.addEventListener('click', () => follow(end.neighbor));
          branch.append(
            svgElement('path', { d: outline, class: 'pc-ribbon-halo', filter: 'url(#pc-ribbon-glow)' }),
            svgElement('path', { d: outline, class: 'pc-ribbon', fill: `url(#pc-route-${routeIndex})` }),
            svgElement('path', { d: spine, class: 'pc-ribbon-spine' }),
            svgElement('path', { d: spine, class: 'pc-ribbon-light', pathLength: 100 })
          );
          if (diagramStyle === 'ernst' || diagramStyle === 'klee') {
            const marks = svgElement('g', { class: 'pc-route-marks', 'pointer-events': 'none' });
            for (let tick = 2; tick <= 8; tick++) {
              const t = tick / 11, p = cubicSample(control, t), width = widthAt(t) * .8;
              if (diagramStyle === 'ernst') {
                const next = cubicSample(control, t + .04);
                marks.append(svgElement('path', { d: `M ${pointText({ x: p.x + p.nx * width, y: p.y + p.ny * width })} Q ${pointText(next)} ${pointText({ x: p.x - p.nx * width, y: p.y - p.ny * width })}` }));
              } else if (tick % 2 === 0) {
                marks.append(svgElement('rect', { x: p.x - 3, y: p.y - 3, width: 6, height: 6, transform: `rotate(45 ${p.x} ${p.y})` }));
              }
            }
            branch.append(marks);
          }
          route.append(branch);
        });
        svg.append(route);
      });
    }
    function renderMemberChords(svg, definitions, layout, visible, current) {
      const art = window.PortfolioConnectionArt;
      const style = geometryStyle(), decorative = isDecorative();
      const material = style === 'arc-atlas' ? 'orrery' : style;
      const special = ['orrery', 'interference', 'opaline'].includes(material);
      const palette = special && art ? art.palette(material) : ['#e9c974', '#87babb', '#c69c7b', '#a4b987', '#b4a2c9', '#82a9c9', '#c9b89b', '#b998a1'];
      const focusKey = `focus:${current.item.id || current.item.key}`;
      for (const [index, edge] of layout.edges.entries()) {
        const from = edge.source < 0 ? layout.focus : layout.nodes[edge.source];
        const to = layout.nodes[edge.target];
        const target = visible[edge.target];
        const keys = [edge.source < 0 ? focusKey : neighborKey(visible[edge.source]), neighborKey(target)];
        const color = palette[(edge.source < 0 ? edge.target : edge.source) % palette.length];
        const gradientId = `pc-member-chord-${index}`;
        const gradient = svgElement('linearGradient', { id: gradientId, gradientUnits: 'userSpaceOnUse', x1: from.x, y1: from.y, x2: to.x, y2: to.y });
        const stops = special && art ? art.ribbonStops(material, color, index) : [[0, color, .84], [48, color, .43], [100, '#fff0ba', .76]];
        for (const [offset, shade, opacity] of stops) {
          gradient.append(svgElement('stop', { offset: `${offset}%`, 'stop-color': shade, 'stop-opacity': opacity }));
        }
        definitions.append(gradient);
        const branch = svgElement('g', { class: 'pc-branch pc-member-chord',
          'data-chord-source': edge.source, 'data-chord-target': edge.target });
        branch.style.setProperty('--branch-color', color);
        branch.style.setProperty('--branch-delay', `${-index * 1.3}s`);
        branch.style.setProperty('--branch-duration', `${7 + index % 3}s`);
        if (!decorative) {
          branch.dataset.pcNeighbors = JSON.stringify(keys);
          branch.append(svgElement('title', {}, edge.source < 0
            ? `${current.title} — ${target.item.title}. Explore ${target.item.title}.`
            : `${visible[edge.source].item.title} ↔ ${target.item.title} · ${current.title} group. Select either end to explore.`));
          branch.addEventListener('click', event => {
            if (edge.source < 0) { follow(target); return; }
            const matrix = branch.getScreenCTM();
            if (!matrix) return;
            const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
            // Follow the end nearest the selected part of the curved ribbon.
            let closest = Infinity, fraction = .5;
            for (let step = 0; step <= 40; step++) {
              const t = step / 40, sample = cubicSample(edge.control, t);
              const distance = (sample.x - point.x) ** 2 + (sample.y - point.y) ** 2;
              if (distance < closest) { closest = distance; fraction = t; }
            }
            follow(visible[fraction < .5 ? edge.source : edge.target]);
          });
        }
        branch.append(
          svgElement('path', { d: edge.d, class: 'pc-ribbon-halo', filter: 'url(#pc-ribbon-glow)' }),
          svgElement('path', { d: edge.d, class: 'pc-ribbon', fill: `url(#${gradientId})` }),
          svgElement('path', { d: edge.spine, class: 'pc-ribbon-spine' }),
          svgElement('path', { d: edge.spine, class: 'pc-ribbon-light', pathLength: 100 })
        );
        if (special) art?.decorateRibbon(branch, definitions, edge, material, index, svgElement);
        for (const arc of edge.arcs) branch.append(svgElement('path', { d: arc, class: 'pc-branch-arc' }));
        svg.append(branch);
      }
    }
    function applyRotation() {
      rotationValue.textContent = `${diagramRotation}°`;
      rotationInput.setAttribute('aria-valuetext', `${diagramRotation} degrees`);
      diagram.dataset.rotation = diagramRotation;
      const radians = diagramRotation * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
      diagram.querySelector('.pc-rotating-geometry')?.setAttribute('transform', `rotate(${diagramRotation} 320 292)`);
      for (const node of diagram.querySelectorAll('[data-graph-x]')) {
        const dx = Number(node.dataset.graphX) - 320, dy = Number(node.dataset.graphY) - 292;
        node.style.left = `${(320 + dx * c - dy * s) / 640 * 100}%`;
        node.style.top = `${(292 + dx * s + dy * c) / 620 * 100}%`;
      }
    }
    function renderDiagram(current) {
      diagram.replaceChildren();
      const style = geometryStyle(), decorative = isDecorative();
      diagram.dataset.style = style;
      diagram.dataset.interaction = decorative ? 'decorative' : 'interactive';
      diagram.setAttribute('aria-label', decorative
        ? 'Decorative composition of the selected project group. Explore using the controls and related-project list.'
        : 'Connection diagram. Select a node to continue exploring.');
      const chords = style === 'chords';
      const arcAtlas = style === 'arc-atlas';
      const artNetwork = ['orrery', 'interference', 'opaline'].includes(style);
      const memberChords = artNetwork || ['network', 'category-rim', 'arc-atlas'].includes(style);
      const routed = !chords && style !== 'radial' && !memberChords;
      diagram.dataset.layout = routed ? 'routed' : memberChords ? 'members' : style;
      diagramPanel.dataset.style = style;
      styleCaption.textContent = selectedStyle()[2];
      const svg = svgElement('svg', { viewBox: '0 0 640 620', 'aria-hidden': 'true', focusable: 'false' });
      const definitions = svgElement('defs');
      const haloFilter = svgElement('filter', { id: 'pc-ribbon-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' });
      haloFilter.append(svgElement('feGaussianBlur', { stdDeviation: 5 }));
      definitions.append(haloFilter);
      svg.append(definitions);
      if (routed || artNetwork || arcAtlas) window.PortfolioConnectionArt?.draw(svg, style, svgElement);
      if (!arcAtlas) svg.append(svgElement('circle', { cx: 320, cy: 292, r: 210, class: 'pc-orbit' }));
      if (!chords && !routed && !memberChords) {
        svg.append(svgElement('circle', { cx: 320, cy: 292, r: 114, class: 'pc-orbit pc-orbit-inner' }));
        svg.append(svgElement('circle', { cx: 320, cy: 292, r: 59, class: 'pc-core-ring' }));
      }
      const visible = current.neighbors.slice(0, MAX_NEIGHBORS);
      diagram.dataset.density = visible.length >= 7 ? 'dense' : 'normal';
      const polar = (angle, radius = 210) => ({ x: 320 + Math.cos(angle) * radius, y: 292 + Math.sin(angle) * radius });
      const pointText = point => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
      const sourceStart = Math.PI * .75, sourceSpan = Math.PI * .5;
      if (chords && visible.length) {
        // A single, labelled source sector represents the focus on the rim.
        // Every ribbon still connects that focus to one actual neighbor.
        svg.append(svgElement('path', { d: `M ${pointText(polar(sourceStart))} A 210 210 0 0 1 ${pointText(polar(sourceStart + sourceSpan))}`, class: 'pc-source-sector' }));
        const sourceLabel = svgElement('text', { x: 320 - 210 - 23, y: 292, class: 'pc-source-label', transform: 'rotate(-90 87 292)', 'text-anchor': 'middle' }, current.kind === 'technique' ? 'FOCUS TECHNIQUE' : 'FOCUS PROJECT');
        svg.append(sourceLabel);
      }
      const chordLayout = memberChords ? window.PortfolioChordLayouts.build(artNetwork ? 'network' : style, visible.length,
        `${current.kind}:${current.item.id || current.item.key}|${visible.map(neighborKey).join('|')}`) : null;
      const positions = chordLayout ? chordLayout.nodes.map(node => ({ ...node, neighbor: visible[node.index] })) : visible.map((neighbor, index) => {
        const angle = chords
          ? (visible.length === 1 ? -.22 : -Math.PI * .60 + index * Math.PI * 1.20 / (visible.length - 1))
          : -Math.PI / 2 + index * 2 * Math.PI / Math.max(visible.length, 1);
        return { neighbor, index, angle, ...polar(angle) };
      });
      if (memberChords) renderMemberChords(svg, definitions, chordLayout, visible, current);
      if (routed) renderRoutes(svg, definitions, positions, current);
      for (const { neighbor, index, angle, x, y } of routed || memberChords ? [] : positions) {
        const u = { x: Math.cos(angle), y: Math.sin(angle) };
        const tangent = { x: -u.y, y: u.x };
        let control = [
          { x: 320 + u.x * 67 - tangent.x * 24, y: 292 + u.y * 67 - tangent.y * 24 },
          { x: 320 + u.x * 112 - tangent.x * 57, y: 292 + u.y * 112 - tangent.y * 57 },
          { x: x - u.x * 84 - tangent.x * 56, y: y - u.y * 84 - tangent.y * 56 },
          { x: x - u.x * 31, y: y - u.y * 31 }
        ];
        const palette = chords
          ? (neighbor.shared ? ['#91c9b0', '#82b4c9', '#c1c791', '#8faad3', '#c3a5bb', '#b9d6c7', '#76adab', '#cfbd99'] : ['#e9c974', '#87babb', '#c69c7b', '#a4b987', '#b4a2c9', '#82a9c9', '#c9b89b', '#b998a1'])
          : (neighbor.shared ? ['#a3d5ba', '#8ec8c9', '#bad296'] : ['#efc866', '#dfa46f', '#d9bd83']);
        const color = palette[index % palette.length];
        const branch = svgElement('g', { class: `pc-branch${neighbor.shared ? ' pc-branch-shared' : ''}` });
        branch.style.setProperty('--branch-color', color);
        branch.style.setProperty('--branch-delay', `${-index * 1.3}s`);
        branch.style.setProperty('--branch-duration', `${7 + index % 3}s`);
        if (!decorative) {
          branch.dataset.pcNeighbor = neighborKey(neighbor);
          branch.append(svgElement('title', {}, `${current.title} · ${neighbor.item.title}: ${neighbor.edgeLabel}`));
          branch.addEventListener('click', () => follow(neighbor));
        }
        let chordOutline, chordSource;
        const targetHalf = chords ? Math.min(.17, .095 + .06 * (1 + Math.cos(angle)) / 2) : 0;
        if (chords) {
          const slot = sourceSpan / visible.length;
          const sourceAngle = sourceStart + slot * (index + .5);
          const sourceHalf = Math.min(slot * .41, .30);
          const s0 = polar(sourceAngle - sourceHalf), s1 = polar(sourceAngle + sourceHalf);
          const t0 = polar(angle - targetHalf), t1 = polar(angle + targetHalf);
          // Each side is a cubic boundary anchored to an arc, rather than an
          // offset stroke. Different endpoints naturally produce different sweeps.
          const bend = Math.sin(sourceAngle - angle) * 24;
          const inward = (point, strength, offset) => ({ x: 320 + (point.x - 320) * strength, y: 292 + (point.y - 292) * strength + offset });
          const pull = .13 + .08 * Math.abs(Math.sin(angle));
          const c1 = inward(s1, .24, bend), c2 = inward(t0, pull, -bend);
          const c3 = inward(t1, pull, -bend), c4 = inward(s0, .24, bend);
          chordOutline = `M ${pointText(s0)} A 210 210 0 0 1 ${pointText(s1)} C ${pointText(c1)} ${pointText(c2)} ${pointText(t0)} A 210 210 0 0 1 ${pointText(t1)} C ${pointText(c3)} ${pointText(c4)} ${pointText(s0)} Z`;
          chordSource = `M ${pointText(s0)} A 210 210 0 0 1 ${pointText(s1)}`;
          const start = polar(sourceAngle), end = polar(angle);
          control = [start, inward(start, .24, bend), inward(end, pull, -bend), end];
        }
        const gradientId = `pc-ribbon-${index}`;
        const gradient = svgElement('linearGradient', { id: gradientId, gradientUnits: 'userSpaceOnUse', x1: control[0].x, y1: control[0].y, x2: control[3].x, y2: control[3].y });
        gradient.append(
          svgElement('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': .82 }),
          svgElement('stop', { offset: '48%', 'stop-color': color, 'stop-opacity': .35 }),
          svgElement('stop', { offset: '100%', 'stop-color': '#fff0ba', 'stop-opacity': .76 })
        );
        definitions.append(gradient);
        // Sample the cubic's normal to draw a smooth, tapered ribbon. Width is a
        // visual treatment, identical for every branch; it does not encode weight.
        const left = [], right = [];
        for (let step = 0; step <= 32; step++) {
          const t = step / 32, s = 1 - t;
          const [a, b, c, d] = control;
          const point = { x: s ** 3 * a.x + 3 * s ** 2 * t * b.x + 3 * s * t ** 2 * c.x + t ** 3 * d.x, y: s ** 3 * a.y + 3 * s ** 2 * t * b.y + 3 * s * t ** 2 * c.y + t ** 3 * d.y };
          const dx = 3 * s ** 2 * (b.x - a.x) + 6 * s * t * (c.x - b.x) + 3 * t ** 2 * (d.x - c.x);
          const dy = 3 * s ** 2 * (b.y - a.y) + 6 * s * t * (c.y - b.y) + 3 * t ** 2 * (d.y - c.y);
          const length = Math.hypot(dx, dy) || 1;
          const halfWidth = 5 + s ** .7 * 8 + Math.sin(t * Math.PI) * 3.5;
          left.push(`${(point.x - dy / length * halfWidth).toFixed(2)} ${(point.y + dx / length * halfWidth).toFixed(2)}`);
          right.push(`${(point.x + dy / length * halfWidth).toFixed(2)} ${(point.y - dx / length * halfWidth).toFixed(2)}`);
        }
        const outline = chordOutline || `M ${left.join(' L ')} L ${right.reverse().join(' L ')} Z`;
        const spine = `M ${control[0].x} ${control[0].y} C ${control.slice(1).map(point => `${point.x} ${point.y}`).join(' ')}`;
        branch.append(
          svgElement('path', { d: outline, class: 'pc-ribbon-halo', filter: 'url(#pc-ribbon-glow)' }),
          svgElement('path', { d: outline, class: 'pc-ribbon', fill: `url(#${gradientId})` }),
          svgElement('path', { d: spine, class: 'pc-ribbon-spine' }),
          svgElement('path', { d: spine, class: 'pc-ribbon-light', pathLength: 100 })
        );
        const halfArc = chords ? targetHalf : Math.min(.28, Math.PI / Math.max(visible.length, 1) * .54);
        const rim = value => `${320 + Math.cos(value) * 210} ${292 + Math.sin(value) * 210}`;
        branch.append(svgElement('path', { d: `M ${rim(angle - halfArc)} A 210 210 0 0 1 ${rim(angle + halfArc)}`, class: 'pc-branch-arc' }));
        if (chordSource) branch.append(svgElement('path', { d: chordSource, class: 'pc-branch-arc pc-source-attachment' }));
        svg.append(branch);
      }
      const rotatingGeometry = svgElement('g', { class: 'pc-rotating-geometry' });
      for (const child of [...svg.children]) if (child !== definitions) rotatingGeometry.append(child);
      svg.append(rotatingGeometry);
      diagram.append(svg);
      for (const position of positions) {
        const node = diagramNode(position.neighbor.item, position.neighbor.kind, position.x, position.y, false, () => follow(position.neighbor));
        if (memberChords && visible.length >= 7) node.querySelector('.pc-node-label').textContent = shortLabel(position.neighbor.item, 22);
        if (!decorative) node.dataset.pcNeighbor = neighborKey(position.neighbor);
        diagram.append(node);
      }
      if (style === 'network' || artNetwork) {
        const label = element('div', 'pc-group-label');
        label.append(element('span', 'pc-group-eyebrow', 'Group'), element('strong', '', current.title));
        diagram.append(label);
      } else {
        const focusPosition = chordLayout?.focus || { x: 320, y: 292 };
        const centerNode = diagramNode(current.item, current.kind, focusPosition.x, focusPosition.y, true, () => {
          focusPanel.querySelector('h3')?.focus({ preventScroll: true });
        });
        if (style === 'category-rim' || arcAtlas) {
          centerNode.classList.add('pc-node-category');
          if (!decorative) centerNode.dataset.pcNeighbor = `focus:${current.item.id || current.item.key}`;
          centerNode.append(element('span', 'pc-group-eyebrow', arcAtlas ? (current.kind === 'technique' ? 'Technique in focus' : 'Project in focus') : 'Group'));
        }
        if (routed && visible.length > 1) centerNode.prepend(element('span', 'pc-center-via', 'Connected through'));
        diagram.append(centerNode);
      }
      applyRotation();
      appearance?.apply();
      legend.replaceChildren();
      const line = element('span', state.mode === 'techniques' ? 'pc-legend-line pc-legend-shared' : 'pc-legend-line');
      line.setAttribute('aria-hidden', 'true');
      legend.append(line, element('span', '', decorative ? 'Decorative composition' : arcAtlas ? (state.mode === 'techniques' ? 'Shared technique' : 'Curated connection') : memberChords ? 'Group members' : routed ? 'Paths through the focus' : state.mode === 'techniques' ? 'Shared technique' : 'Curated connection'));
      if (visible.some(neighbor => neighbor.item.upcoming)) legend.append(element('span', 'pc-legend-later', 'Dashed node · coming later'));
      diagramNote.textContent = decorative
        ? 'Ribbons are ornamental; their paths do not represent additional relationships. Use the controls above or the list below to explore.'
        : arcAtlas
        ? (visible.length ? 'Each ribbon joins the selected idea to one connected node. Hover to trace a connection; select its ribbon or avatar to explore.' : 'No connections to display yet. Choose another project or technique above.')
        : memberChords
        ? (!visible.length ? 'No group members to display yet. Choose another project or technique above.'
          : (style === 'network' || artNetwork) && visible.length === 1 ? 'A single group member. Select it to explore.'
          : style === 'network' || artNetwork
          ? 'Ribbons form a visual network among group members. Hover to trace both ends; select a member to explore.'
          : 'The larger node names the group. Follow a ribbon to explore one of its members.')
        : routed
        ? (visible.length > 1 ? `Paths connect the surrounding nodes through ${current.title}. Hover a ribbon to reveal both ends; select a node or its end of a ribbon to explore.`
          : visible.length ? `A single connection to ${current.title}. Select the node to explore.` : 'No connections to draw yet. Choose a technique or another project above.')
        : chords && visible.length
          ? 'Ribbons flow from the focus sector beneath the selected idea. Hover to highlight; select a ribbon or node to explore.'
          : 'Choose a node to follow its connections. The cards below explain each link.';
      if (current.neighbors.length > MAX_NEIGHBORS) diagramNote.append(` Showing ${MAX_NEIGHBORS} neighbors; expand the list for all ${current.neighbors.length}.`);
    }
    function renderFocus(current) {
      focusPanel.replaceChildren();
      focusPanel.append(element('p', 'pc-kicker', current.kind === 'technique' ? 'Technique in focus' : current.item.upcoming ? 'Coming later' : 'Project in focus'));
      const heading = element('h3', 'pc-focus-title', current.title);
      heading.id = 'pc-focus-heading';
      heading.tabIndex = -1;
      focusPanel.append(heading);
      if (current.kind === 'project') {
        focusPanel.append(thumbnail(current.item, 'pc-focus-image'));
        if (clean(current.item.summary)) {
          const summary=element('p','pc-focus-summary',current.item.summary);
          window.PortfolioPunchlineEditor?.decorate(summary,current.item.id,'summary',current.item.summary);focusPanel.append(summary);
        }
        if (current.item.upcoming) focusPanel.append(element('p', 'pc-upcoming-note', 'Coming later. Follow the connections to explore the work already available.'));
        const actions = element('div', 'pc-focus-actions');
        projectLinks(current.item, actions);
        if (actions.children.length) focusPanel.append(actions);
        const terms = (projectTerms.get(current.item.id) || []).slice(0, 10);
        if (terms.length) {
          focusPanel.append(element('p', 'pc-tags-label', 'Follow a technique'));
          const tags = element('div', 'pc-tags');
          for (const term of terms) tags.append(button('pc-tag', techniques.get(term).title, () => selectTechnique(techniques.get(term).title, { internal: true, focusHeading: true })));
          focusPanel.append(tags);
        }
      } else {
        focusPanel.append(techniqueSigil(current.item, 'pc-technique-art'));
        const category = techniqueCategories.get(key(current.item.category));
        focusPanel.append(element('p', 'pc-focus-summary', clean(current.item.description) || `Explore the projects that use ${current.title}.`));
        const aliases = strings(current.item.aliases).filter(alias => key(alias) !== key(current.title));
        if (aliases.length) focusPanel.append(element('p', 'pc-focus-note', 'Also indexed as: ' + aliases.join(' · ')));
        focusPanel.append(element('p', 'pc-focus-note', `${category?.label || 'Technique'} · Select a project to follow this idea into the rest of its technical context.`));
      }
    }
    function renderCard(neighbor) {
      const card = element('article', `pc-card${neighbor.item.upcoming ? ' pc-card-upcoming' : ''}`);
      card.dataset.pcNeighbor = neighborKey(neighbor);
      const head = element('div', 'pc-card-head');
      if (neighbor.kind === 'project') head.append(thumbnail(neighbor.item));
      else head.append(techniqueSigil(neighbor.item, 'pc-term-icon'));
      const heading = element('div', 'pc-card-heading');
      heading.append(element('p', 'pc-card-type', neighbor.item.upcoming ? 'Coming later' : neighbor.shared ? 'Shared technique' : 'Curated connection'));
      heading.append(element('h4', 'pc-card-title', neighbor.item.title));
      head.append(heading);
      card.append(head);
      if (neighbor.kind === 'project') {
        if (neighbor.shared && clean(neighbor.item.summary)) {
          const summary=element('p','pc-card-summary',neighbor.item.summary);
          window.PortfolioPunchlineEditor?.decorate(summary,neighbor.item.id,'summary',neighbor.item.summary);card.append(summary);
        }
        if (neighbor.shared) card.append(element('p', 'pc-card-reason', neighbor.reason));
        else for (const relation of neighbor.relationships) {
          const reason = element('div', 'pc-card-reason');
          reason.append(element('strong', '', clean(relation.label) || 'Project connection'));
          if (clean(relation.note)) reason.append(element('p', '', relation.note));
          card.append(reason);
        }
      } else {
        card.append(element('p', 'pc-card-reason', neighbor.reason));
        const examples = element('ul', 'pc-technique-examples');
        const otherProjects = neighbor.item.projects.filter(project => project.id !== state.projectId);
        for (const project of otherProjects.slice(0, 3)) {
          const item = element('li');
          item.append(thumbnail(project, 'pc-mini-thumbnail'), element('span', '', project.title));
          examples.append(item);
        }
        card.append(examples);
        if (otherProjects.length > 3) card.append(element('p', 'pc-example-count', `And ${otherProjects.length - 3} more ${otherProjects.length - 3 === 1 ? 'project' : 'projects'}.`));
      }
      const actions = element('div', 'pc-card-actions');
      const followButton = button('pc-follow', neighbor.kind === 'technique' ? 'Follow technique →' : 'Follow connections →', () => follow(neighbor));
      followButton.setAttribute('aria-label', `${neighbor.kind === 'technique' ? 'Follow technique' : 'Follow connections for'} ${neighbor.item.title}`);
      actions.append(followButton);
      if (neighbor.kind === 'project') projectLinks(neighbor.item, actions);
      card.append(actions);
      return card;
    }
    function updateControls() {
      for (const [mode, control] of Object.entries(modeButtons)) control.setAttribute('aria-pressed', String(state.mode === mode));
      projectSelect.value = state.projectId;
      techniqueSelect.value = state.focus === 'term' && techniques.has(state.term) ? state.term : '';
    }
    function paint() {
      const current = context();
      hoveredNeighbor = null;
      focusedNeighbor = null;
      highlightedNeighbor = null;
      highlightedDecorative = false;
      root.classList.remove('pc-highlighting');
      purpose.textContent = state.mode === 'connections'
        ? 'Follow explicit connections between projects: related methods, earlier explorations and work still to come.'
        : 'Move from a project to a technique, then into other projects that use it.';
      renderTrail();
      renderDiagram(current);
      renderFocus(current);
      resultsTitle.textContent = state.mode === 'connections' ? 'Why these projects connect' : current.kind === 'technique' ? 'Projects using this technique' : 'Techniques shared with other projects';
      const count = current.neighbors.length;
      status.textContent = `${current.title} · ${count} ${count === 1 ? 'connection' : 'connections'}`;
      cards.replaceChildren();
      more.replaceChildren();
      if (!count) {
        cards.append(element('p', 'pc-empty', state.mode === 'connections'
          ? 'No curated connections are listed for this project yet. Follow one of its techniques, or choose another project above.'
          : 'No shared techniques are listed for this selection yet. Choose another project or technique above.'));
      } else {
        const visible = state.expanded ? current.neighbors : current.neighbors.slice(0, MAX_NEIGHBORS);
        for (const neighbor of visible) cards.append(renderCard(neighbor));
        if (count > MAX_NEIGHBORS) {
          const expand = button('pc-expand', state.expanded ? 'Show fewer connections' : `Show all ${count} connections`, () => {
            state.expanded = !state.expanded;
            render(false, true);
          });
          expand.setAttribute('aria-expanded', String(state.expanded));
          more.append(expand);
        }
      }
      syncMotionRegions();
    }
    function cancelGraphCenter() {
      graphScrollVersion++;
      if (graphScrollFrame) cancelAnimationFrame(graphScrollFrame);
      graphScrollFrame = 0;
    }
    function graphScrollTarget() {
      // Include labels/avatars extending past the drawing area. Centering an
      // off-axis root or the section heading crops the opposite branches.
      const pieces = [...diagram.querySelectorAll('.pc-rotating-geometry, .pc-node, .pc-group-label')]
        .map(node => node.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0);
      const frame = diagram.getBoundingClientRect();
      const topEdge = pieces.length ? Math.min(...pieces.map(box => box.top)) : frame.top;
      const bottomEdge = pieces.length ? Math.max(...pieces.map(box => box.bottom)) : frame.bottom;
      if (!frame.width || !frame.height) return scrollY;
      // All measurements use CSS pixels: desktop zoom and responsive reflow
      // therefore share the same coordinates. A floating bottom nav is not a
      // top obstruction; only an actually visible, fixed/stuck header counts.
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportBottom = viewportTop + (viewport?.height || innerHeight);
      let clearTop = viewportTop;
      for (const nav of document.querySelectorAll('.site-nav, .portfolio-route.universal-route-top')) {
        const box = nav.getBoundingClientRect(), style = getComputedStyle(nav);
        if (!nav.classList.contains('universal-route-dock') && ['fixed', 'sticky'].includes(style.position)
          && box.width > 0 && box.height > 0 && box.top <= viewportTop + 1 && box.bottom > viewportTop) {
          clearTop = Math.max(clearTop, Math.min(viewportBottom, box.bottom));
        }
      }
      const center = (clearTop + viewportBottom) / 2;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight
        - (document.documentElement.clientHeight || innerHeight));
      return Math.max(0, Math.min(maxScroll, scrollY + (topEdge + bottomEdge) / 2 - center));
    }
    function centerConnectionPlot({ immediate = false } = {}) {
      cancelGraphCenter();
      const version = graphScrollVersion;
      const start = scrollY, target = graphScrollTarget();
      if (Math.abs(target - start) <= 1) return;
      if (immediate || reducedMotion.matches || document.hidden) {
        window.scrollTo({ top: target, behavior: 'instant' });
        return;
      }
      // One owner for the flight. Re-read the target during the short flight so
      // zoom, a wrapping title, or a changing navigation height cannot strand it
      // half a screen away. No observer or correction loop remains afterwards.
      let started;
      const advance = now => {
        if (version !== graphScrollVersion) return;
        if (started === undefined) started = now;
        const progress = Math.min(1, (now - started) / 420);
        const eased = 1 - (1 - progress) ** 3;
        window.scrollTo({ top: start + (graphScrollTarget() - start) * eased, behavior: 'instant' });
        graphScrollFrame = progress < 1 ? requestAnimationFrame(advance) : 0;
      };
      graphScrollFrame = requestAnimationFrame(advance);
    }
    async function requestGraphCenter(options = {}) {
      cancelGraphCenter();
      const version = graphScrollVersion;
      await Promise.all([renderPromise, document.fonts?.ready]);
      if (!document.hidden) await new Promise(resolve => requestAnimationFrame(resolve));
      if (version !== graphScrollVersion) return false;
      centerConnectionPlot(options);
      return true;
    }
    function render(focusHeading = false, focusResults = false) {
      cancelGraphCenter();
      const version = ++renderVersion;
      const layout = externalLayout;
      externalLayout = Promise.resolve();
      const animate = rendered && !reducedMotion.matches && typeof workbench.animate === 'function';
      // Read the in-flight opacity before cancellation, so a rapid selection
      // continues from what is visible rather than flashing back to full opacity.
      const opacities = animate ? transitionRegions.map(region => Number.parseFloat(getComputedStyle(region).opacity)) : [];
      for (const animation of renderAnimations) animation.cancel();
      renderAnimations = [];
      updateControls();
      root.setAttribute('aria-busy', 'true');
      root.dataset.rendering = animate ? 'out' : 'in';
      renderPromise = (async () => {
        if (animate) {
          renderAnimations = transitionRegions.map((region, index) => region.animate(
            [{ opacity: opacities[index] }, { opacity: 0 }],
            { duration: 125, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }
          ));
          await Promise.allSettled(renderAnimations.map(animation => animation.finished));
          if (version !== renderVersion) return false;
        }
        paint();
        rendered = true;
        root.dataset.rendering = 'in';
        for (const animation of renderAnimations) animation.cancel();
        renderAnimations = [];
        if (animate && !reducedMotion.matches) {
          renderAnimations = transitionRegions.map((region, index) => region.animate(
            [{ opacity: 0 }, { opacity: 1 }],
            { duration: 260, delay: index > 3 ? 35 : 0, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' }
          ));
        }
        // Topic results above this graph may be fading out at the same time.
        // Wait for their final height before placing keyboard focus or scrolling.
        await Promise.all([Promise.allSettled(renderAnimations.map(animation => animation.finished)), layout]);
        if (!document.hidden) await new Promise(resolve => requestAnimationFrame(resolve));
        if (version !== renderVersion) return false;
        for (const animation of renderAnimations) animation.cancel();
        renderAnimations = [];
        root.dataset.rendering = 'idle';
        root.setAttribute('aria-busy', 'false');
        if (focusResults) resultsTitle.focus({ preventScroll: true });
        else if (focusHeading && version > focusScrollBlockedThrough) {
          const heading = focusPanel.querySelector('h3');
          heading?.focus({ preventScroll: true });
          centerConnectionPlot();
        }
        document.dispatchEvent(new CustomEvent('portfolio:graph-rendered', { detail: {
          projectId: state.projectId, term: state.term, mode: state.mode
        } }));
        return true;
      })();
      return renderPromise;
    }

    document.addEventListener('portfolio:select-technique', event => selectTechnique(event.detail?.term));
    document.addEventListener('portfolio:select-project', event => selectProject(event.detail?.id, { connections: true }));
    reducedMotion.addEventListener('change', () => render(false));
    remember();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
