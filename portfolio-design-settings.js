/* Persistent page-composition controls and complete design-package exports. */
(() => {
  'use strict';
  const KEY='portfolio:design-settings:v1';
  const lightingDefaults=Object.freeze({elevatorWarmth:0,elevatorGlow:0,elevatorHighlights:0,elevatorHoverSmooth:false,elevatorFrameGlow:false,elevatorButtonGlow:false,elevatorTravelSparks:false,elevatorFiligree:'off',elevatorPatina:0});
  const lightingPresets=Object.freeze({
    original:lightingDefaults,
    amber:Object.freeze({...lightingDefaults,elevatorWarmth:45,elevatorGlow:70,elevatorHighlights:45,elevatorHoverSmooth:true,elevatorFrameGlow:true,elevatorButtonGlow:true,elevatorPatina:18}),
    nixie:Object.freeze({...lightingDefaults,elevatorWarmth:84,elevatorGlow:100,elevatorHighlights:88,elevatorHoverSmooth:true,elevatorFrameGlow:true,elevatorButtonGlow:true,elevatorTravelSparks:true,elevatorFiligree:'nixie',elevatorPatina:32}),
    brass:Object.freeze({...lightingDefaults,elevatorWarmth:28,elevatorGlow:40,elevatorHighlights:62,elevatorHoverSmooth:true,elevatorFrameGlow:true,elevatorButtonGlow:true,elevatorFiligree:'construction',elevatorPatina:48})
  });
  const defaults=Object.freeze({columns:3,gap:25,sideMargin:160,excludeElevator:true,elevatorScale:100,elevatorButtonHeight:56,elevatorCorner:8,elevatorGap:5,topicsInset:5,connectionsInset:2,...lightingDefaults,...window.PortfolioVisualDefaults?.settings?.page});
  const clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Number(value))):fallback;
  const normalize=value=>{
    const side=value?.sideMargin??defaults.sideMargin;
    return {
      columns:Math.round(clamp(value?.columns,2,5,defaults.columns)),
      gap:Math.round(clamp(value?.gap,12,48,defaults.gap)),
      sideMargin:side==='auto'||!Number.isFinite(Number(side))?'auto':Math.round(clamp(side,120,360,120)),
      excludeElevator:typeof value?.excludeElevator==='boolean'?value.excludeElevator:defaults.excludeElevator,
      elevatorScale:Math.round(clamp(value?.elevatorScale,70,140,defaults.elevatorScale)),
      elevatorButtonHeight:Math.round(clamp(value?.elevatorButtonHeight,40,68,defaults.elevatorButtonHeight)),
      elevatorCorner:Math.round(clamp(value?.elevatorCorner,0,20,defaults.elevatorCorner)),
      elevatorGap:Math.round(clamp(value?.elevatorGap,2,12,defaults.elevatorGap)),
      elevatorWarmth:Math.round(clamp(value?.elevatorWarmth,0,100,defaults.elevatorWarmth)),
      elevatorGlow:Math.round(clamp(value?.elevatorGlow,0,160,defaults.elevatorGlow)),
      elevatorHighlights:Math.round(clamp(value?.elevatorHighlights,0,160,defaults.elevatorHighlights)),
      elevatorHoverSmooth:typeof value?.elevatorHoverSmooth==='boolean'?value.elevatorHoverSmooth:defaults.elevatorHoverSmooth,
      elevatorFrameGlow:typeof value?.elevatorFrameGlow==='boolean'?value.elevatorFrameGlow:defaults.elevatorFrameGlow,
      elevatorButtonGlow:typeof value?.elevatorButtonGlow==='boolean'?value.elevatorButtonGlow:defaults.elevatorButtonGlow,
      elevatorTravelSparks:typeof value?.elevatorTravelSparks==='boolean'?value.elevatorTravelSparks:defaults.elevatorTravelSparks,
      elevatorFiligree:['off','construction','nixie'].includes(value?.elevatorFiligree)?value.elevatorFiligree:defaults.elevatorFiligree,
      elevatorPatina:Math.round(clamp(value?.elevatorPatina,0,100,defaults.elevatorPatina)),
      topicsInset:clamp(value?.topicsInset,0,18,defaults.topicsInset),
      connectionsInset:clamp(value?.connectionsInset,0,18,defaults.connectionsInset)
    };
  };
  const load=()=>{try{return normalize(JSON.parse(localStorage.getItem(KEY)));}catch{return {...defaults};}};
  const apply=value=>{
    const settings=normalize(value),root=document.documentElement;
    root.style.setProperty('--project-columns',settings.columns);
    root.style.setProperty('--project-card-gap',`${settings.gap}px`);
    root.toggleAttribute('data-authored-page-width',settings.sideMargin!=='auto');
    root.toggleAttribute('data-margin-excludes-elevator',settings.excludeElevator);
    if(settings.sideMargin==='auto')root.style.removeProperty('--page-side-margin');
    else root.style.setProperty('--page-side-margin',`${settings.sideMargin}px`);
    root.style.setProperty('--elevator-scale',settings.elevatorScale/100);
    root.style.setProperty('--elevator-button-height',`${settings.elevatorButtonHeight}px`);
    root.style.setProperty('--elevator-corner',`${settings.elevatorCorner}px`);
    root.style.setProperty('--elevator-gap',`${settings.elevatorGap}px`);
    root.style.setProperty('--elevator-warmth',settings.elevatorWarmth/100);
    root.style.setProperty('--elevator-glow',settings.elevatorGlow/100);
    root.style.setProperty('--elevator-highlights',settings.elevatorHighlights/100);
    root.style.setProperty('--elevator-patina',settings.elevatorPatina/100);
    root.toggleAttribute('data-elevator-hover-smooth',settings.elevatorHoverSmooth);
    root.toggleAttribute('data-elevator-frame-glow',settings.elevatorFrameGlow);
    root.toggleAttribute('data-elevator-button-glow',settings.elevatorButtonGlow);
    root.toggleAttribute('data-elevator-travel-sparks',settings.elevatorTravelSparks);
    root.setAttribute('data-elevator-filigree',settings.elevatorFiligree);
    root.toggleAttribute('data-elevator-lighting',Object.keys(lightingDefaults).some(key=>settings[key]!==lightingDefaults[key]));
    root.style.setProperty('--topics-inset',`${settings.topicsInset}%`);
    root.style.setProperty('--connections-inset',`${settings.connectionsInset}%`);
    return settings;
  };
  const save=value=>{
    const settings=apply(value);
    try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{/* Export still captures the live settings. */}
    document.dispatchEvent(new CustomEvent('portfolio:design-settings',{detail:settings}));
    return settings;
  };
  const safeJSON=key=>{try{const value=JSON.parse(localStorage.getItem(key));return value&&typeof value==='object'?value:null;}catch{return null;}};
  const captureAtmospheres=()=>{
    const entries=[];
    try{
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(key==='portfolio:atmosphere-v2'||key?.startsWith('portfolio:atmosphere-project:')){
          const value=safeJSON(key);
          if(value)entries.push({scope:key==='portfolio:atmosphere-v2'?'portfolio':key.slice('portfolio:atmosphere-project:'.length),...value});
        }
      }
    }catch{/* Storage may be disabled. */}
    return entries.sort((a,b)=>a.scope.localeCompare(b.scope));
  };
  const capture=()=>({
    page:{...current},
    navigationPresentation:document.documentElement.dataset?.portfolioNavigation||'top',
    cardPresentation:document.body.dataset.cardStyle||window.PortfolioVisualDefaults?.settings?.cardPresentation||'ribbon',
    cardLabels:window.PortfolioCardPresentation?.labels||window.PortfolioVisualDefaults?.settings?.cardLabels||{ribbon:true,canonical:false},
    appTitles:window.PortfolioAppTitles?Object.fromEntries(window.PortfolioAppTitles.entries.map(entry=>[entry.id,window.PortfolioAppTitles.get(entry.id)])):undefined,
    connectionGraph:(()=>{const appearance=window.PortfolioConnectionAppearance?.current||safeJSON('portfolio:connection-appearance:v1');try{return {style:localStorage.getItem('portfolio:connection-style')||'arc-atlas',rotation:Number(localStorage.getItem('portfolio:connection-rotation')??-35),appearance};}catch{return {style:'arc-atlas',rotation:-35,appearance};}})(),
    atmosphere:{
      selections:captureAtmospheres(),
      active:(()=>{
        const value=window.PortfolioAtmosphereCurrent;
        if(!value)return null;
        return {scope:document.body.dataset.projectId||'portfolio',mode:value.mode,scene:value.scene,
          paused:value.paused,intensity:value.intensity};
      })(),
      sparks:window.PortfolioEmbers?.normalize(safeJSON('portfolio:ember-tuning-v1'))||safeJSON('portfolio:ember-tuning-v1')
    }
  });
  const exportData=layouts=>({
    schema:'portfolio-visual-layout',version:1,exportedAt:new Date().toISOString(),
    settings:capture(),layouts:(window.PortfolioPreviewLayouts?.exportData(layouts).layouts||[])
  });
  let current=apply(load());
  const applyLightingPreset=name=>lightingPresets[name]?save({...current,...lightingPresets[name]}):null;
  document.addEventListener('portfolio:design-settings',event=>{current=normalize(event.detail);});
  window.PortfolioDesignSettings={defaults,normalize,load,save,apply,capture,exportData,lightingPresets,applyLightingPreset,get current(){return current;}};
})();
