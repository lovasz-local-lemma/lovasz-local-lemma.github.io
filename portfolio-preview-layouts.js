/* Authored screenshot arrangements. Stored positions are reference-pixel offsets
 * from the author's card center. Playback keeps the authored viewport height
 * placement while following the current card horizontally; groups scale/mirror
 * as one object without depending on where the reader scrolled the card.
 * Browser: window.PortfolioPreviewLayouts. Node: require this file for the model.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PortfolioPreviewLayouts = api;
})(typeof window === 'undefined' ? null : window, function (root) {
  'use strict';

  const SCHEMA = 'portfolio-preview-layouts';
  const VERSION = 1;
  const STORAGE_KEY = 'portfolio:preview-layouts:v1';
  const ARCHIVE_KEY = 'portfolio:preview-layouts:archived:v1';
  const ARCHIVE_SCHEMA = 'portfolio-preview-layout-archive';
  const reserved = new Set(['__proto__', 'prototype', 'constructor']);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const record = value => value && typeof value === 'object' && !Array.isArray(value) &&
    ![...reserved].some(key => own(value, key));
  const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e7;
  const positive = value => finite(value) && value >= .01;
  const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) && !reserved.has(value);
  function source(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) return null;
    const clean = value.trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(clean) && !/^https?:/i.test(clean)) return null;
    return clean;
  }
  function viewport(value) {
    return record(value) && positive(value.width) && positive(value.height) ? {width: value.width, height: value.height} : null;
  }
  function anchor(value) {
    if (!record(value)) return null;
    const x = value.x === undefined ? value.left : value.x;
    const y = value.y === undefined ? value.top : value.y;
    return finite(x) && finite(y) && positive(value.width) && positive(value.height) ?
      {x, y, width: value.width, height: value.height} : null;
  }

  function normalize(input) {
    try {
      if (!record(input) || input.version !== VERSION || !identifier(input.projectId) || !['left', 'right'].includes(input.side)) return null;
      const view = viewport(input.viewport), card = anchor(input.anchor);
      if (!view || !card || !Array.isArray(input.items) || !input.items.length || input.items.length > 64) return null;
      const seen = new Set(), items = [];
      for (const item of input.items) {
        if (!record(item)) return null;
        const src = source(item.src);
        if (!src || seen.has(src) || !finite(item.cx) || !finite(item.cy) || !positive(item.width) ||
            !positive(item.height) || !finite(item.rotation) || !finite(item.z) || !['near', 'far'].includes(item.depth) ||
            typeof item.caption !== 'boolean') return null;
        const opacity=item.opacity===undefined?1:item.opacity;
        if(!finite(opacity)||opacity<.15||opacity>1)return null;
        const fit=item.fit===undefined?'contain':item.fit;
        const frameStyle=item.frameStyle===undefined?'glow':item.frameStyle;
        if(!['contain','cover'].includes(fit)||!['glow','quiet','frameless'].includes(frameStyle))return null;
        seen.add(src);
        items.push({src, cx: item.cx, cy: item.cy, width: item.width, height: item.height,
          rotation: item.rotation, z: Math.trunc(item.z), depth: item.depth, caption: item.caption,
          opacity,fit,frameStyle});
      }
      const orderMode=input.orderMode===undefined?'manual':input.orderMode;
      if(!['manual','auto'].includes(orderMode))return null;
      return {version: VERSION, projectId: input.projectId, viewport: view, anchor: card, side: input.side, orderMode, items};
    } catch (_) { return null; }
  }

  function create(projectId, items, boxes, currentViewport, anchorRect, side, orderMode='manual') {
    try {
      const view = viewport(currentViewport), card = anchor(anchorRect);
      if (!identifier(projectId) || !view || !card || !Array.isArray(items) || !Array.isArray(boxes) || boxes.length !== items.length) return null;
      const bySource = boxes.every(box => record(box) && source(box.src)) ? new Map(boxes.map(box => [source(box.src), box])) : null;
      if (bySource && bySource.size !== boxes.length) return null;
      const centerX = card.x + card.width / 2, centerY = card.y + card.height / 2;
      return normalize({version: VERSION, projectId, viewport: view, anchor: card, side, orderMode,
        items: items.map((item, index) => {
          const box = bySource ? bySource.get(source(item?.src)) : boxes[index];
          if (!record(item) || !record(box) || !finite(box.x) || !finite(box.y) || !positive(box.w) || !positive(box.h)) return null;
          return {src: item.src, cx: box.x + box.w / 2 - centerX, cy: box.y + box.h / 2 - centerY,
            width: box.w, height: box.h, rotation: box.tilt, z: box.z, depth: box.hand,
            caption: typeof box.caption === 'boolean' ? box.caption : true,
            opacity:Number.isFinite(box.opacity)?box.opacity:1,fit:box.fit||'contain',frameStyle:box.frameStyle||'glow'};
        })});
    } catch (_) { return null; }
  }

  function bounds(boxes) {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const box of boxes) {
      const angle = box.tilt * Math.PI / 180;
      const halfW = (Math.abs(Math.cos(angle)) * box.w + Math.abs(Math.sin(angle)) * box.h) / 2;
      const halfH = (Math.abs(Math.sin(angle)) * box.w + Math.abs(Math.cos(angle)) * box.h) / 2;
      left = Math.min(left, box.cx - halfW); right = Math.max(right, box.cx + halfW);
      top = Math.min(top, box.cy - halfH); bottom = Math.max(bottom, box.cy + halfH);
    }
    return {left, top, right, bottom, width: right - left, height: bottom - top};
  }

  function resolve(input, items, currentViewport, anchorRect, side) {
    try {
      const layout = normalize(input), view = viewport(currentViewport), card = anchor(anchorRect);
      if (!layout || !view || !card || !['left', 'right'].includes(side) || !Array.isArray(items) || !items.length || items.length > 64) return null;
      const indexed = new Map(layout.items.map(item => [item.src, item]));
      const selected = items.map(item => source(item?.src));
      if (selected.some(src => !src || !indexed.has(src)) || new Set(selected).size !== selected.length) return null;
      const scale = Math.min(view.width / layout.viewport.width, view.height / layout.viewport.height);
      const mirror = side === layout.side ? 1 : -1;
      const centerX = card.x + card.width / 2;
      // The editor brings the card to the top before arranging. Hover can occur
      // at any scroll position, and text edits can change the card's height.
      // Recover the original viewport y from the saved anchor instead of adding
      // those unrelated card-center changes to every print. Existing files keep
      // their original coordinates; no migration or storage rewrite is needed.
      const centerY = view.height / 2 +
        (layout.anchor.y + layout.anchor.height / 2 - layout.viewport.height / 2) * scale;
      const boxes = selected.map(src => {
        const item = indexed.get(src);
        return {src, cx: centerX + item.cx * scale * mirror, cy: centerY + item.cy * scale,
          w: item.width * scale, h: item.height * scale, tilt: item.rotation * mirror,
          z: item.z, hand: item.depth, caption: item.caption,
          opacity:item.opacity,fit:item.fit,frameStyle:item.frameStyle};
      });
      let extent = bounds(boxes);
      const fit = Math.min(1, view.width / extent.width, view.height / extent.height);
      if (fit < 1) {
        for (const box of boxes) {
          box.cx = centerX + (box.cx - centerX) * fit; box.cy = centerY + (box.cy - centerY) * fit;
          box.w *= fit; box.h *= fit;
        }
        extent = bounds(boxes);
      }
      // One translation retains the authored spacing; individual frames never clamp independently.
      const dx = extent.left < 0 ? -extent.left : extent.right > view.width ? view.width - extent.right : 0;
      const dy = extent.top < 0 ? -extent.top : extent.bottom > view.height ? view.height - extent.bottom : 0;
      return boxes.map(box => ({src: box.src, x: box.cx + dx - box.w / 2, y: box.cy + dy - box.h / 2,
        w: box.w, h: box.h, tilt: box.tilt, z: box.z, hand: box.hand, caption: box.caption,
        opacity:box.opacity,fit:box.fit,frameStyle:box.frameStyle}));
    } catch (_) { return null; }
  }

  function stored() {
    try {
      const text = root?.localStorage?.getItem(STORAGE_KEY);
      if (!text || text.length > 2e6) return [];
      const data = JSON.parse(text);
      if (!record(data) || data.schema !== SCHEMA || data.version !== VERSION || !Array.isArray(data.layouts) || data.layouts.length > 500) return [];
      const layouts = [], seen = new Set();
      for (const entry of data.layouts) {
        const layout = normalize(entry);
        if (!layout || seen.has(layout.projectId)) return [];
        seen.add(layout.projectId); layouts.push(layout);
      }
      return layouts;
    } catch (_) { return []; }
  }
  function all() {
    const merged=new Map();
    for(const value of root?.PortfolioVisualDefaults?.layouts||[]){const layout=normalize(value);if(layout)merged.set(layout.projectId,layout);}
    for(const layout of stored())merged.set(layout.projectId,layout);
    return [...merged.values()];
  }
  function load(projectId) {
    return identifier(projectId) ? all().find(layout => layout.projectId === projectId) || null : null;
  }
  function published(projectId) {
    if(!identifier(projectId))return null;
    return normalize(root?.PortfolioVisualDefaults?.layouts?.find(value=>value.projectId===projectId));
  }
  function resolveFor(projectId, items, currentViewport, anchorRect, side) {
    const preferred=load(projectId);
    const boxes=resolve(preferred,items,currentViewport,anchorRect,side);
    if(boxes)return {layout:preferred,boxes,usedPublishedFallback:false};
    // A local draft can refer to images that have since been replaced. Retain
    // that draft, but prefer the current published arrangement to generic fans.
    const baseline=published(projectId);
    const fallback=resolve(baseline,items,currentViewport,anchorRect,side);
    return fallback?{layout:baseline,boxes:fallback,usedPublishedFallback:!!preferred}:null;
  }
  function exportData(layouts) {
    const unique = new Map();
    if (Array.isArray(layouts)) for (const value of layouts) {
      const layout = normalize(value);
      if (layout) unique.set(layout.projectId, layout);
    }
    return {schema: SCHEMA, version: VERSION, exportedAt: new Date().toISOString(), layouts: [...unique.values()]};
  }
  function persist(layouts) {
    try {
      if (!root?.localStorage) return false;
      if (layouts.length > 500) return false;
      const text = JSON.stringify(exportData(layouts));
      if (text.length > 2e6) return false;
      root.localStorage.setItem(STORAGE_KEY, text);
      return true;
    } catch (_) { return false; }
  }
  function save(input) {
    const layout = normalize(input);
    if (!layout) return false;
    const layouts = stored().filter(item => item.projectId !== layout.projectId);
    layouts.push(layout); return persist(layouts);
  }
  function remove(projectId) {
    if (!identifier(projectId)) return false;
    return persist(stored().filter(item => item.projectId !== projectId));
  }
  function archiveEntries() {
    try {
      const text=root?.localStorage?.getItem(ARCHIVE_KEY);
      if(!text)return [];
      if(text.length>2e6)return null;
      const data=JSON.parse(text);
      if(!record(data)||data.schema!==ARCHIVE_SCHEMA||data.version!==VERSION||!Array.isArray(data.entries)||data.entries.length>500)return null;
      const entries=[];
      for(const entry of data.entries){
        const layout=normalize(entry?.layout);
        if(!record(entry)||!layout||typeof entry.archivedAt!=='string'||entry.archivedAt.length>40||!Number.isFinite(Date.parse(entry.archivedAt)))return null;
        entries.push({archivedAt:entry.archivedAt,layout});
      }
      return entries;
    }catch{return null;}
  }
  function exportArchived() {
    const entries=archiveEntries();
    return entries?{schema:ARCHIVE_SCHEMA,version:VERSION,exportedAt:new Date().toISOString(),entries}:null;
  }
  function usePublished(projectId) {
    if(!published(projectId))return false;
    const layouts=stored(),previous=layouts.find(layout=>layout.projectId===projectId);
    if(!previous)return true;
    const entries=archiveEntries();
    if(!entries)return false;
    const signature=JSON.stringify(previous);
    if(!entries.some(entry=>JSON.stringify(entry.layout)===signature)){
      if(entries.length>=500)return false;
      entries.push({archivedAt:new Date().toISOString(),layout:previous});
    }
    try{
      const text=JSON.stringify({schema:ARCHIVE_SCHEMA,version:VERSION,entries});
      if(text.length>2e6)return false;
      // Archive first. A failed archive never removes the user's active draft.
      root.localStorage.setItem(ARCHIVE_KEY,text);
    }catch{return false;}
    return persist(layouts.filter(layout=>layout.projectId!==projectId));
  }

  return Object.freeze({normalize, create, resolve, resolveFor, load, published, usePublished, exportArchived, save, remove, all, exportData});
});
