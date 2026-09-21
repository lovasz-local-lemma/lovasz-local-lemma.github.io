(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))a(o);new MutationObserver(o=>{for(const r of o)if(r.type==="childList")for(const d of r.addedNodes)d.tagName==="LINK"&&d.rel==="modulepreload"&&a(d)}).observe(document,{childList:!0,subtree:!0});function n(o){const r={};return o.integrity&&(r.integrity=o.integrity),o.referrerPolicy&&(r.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?r.credentials="include":o.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function a(o){if(o.ep)return;o.ep=!0;const r=n(o);fetch(o.href,r)}})();const g=[{label:"Shadow inversion",href:"./creator.html",tint:"#f1a6cf",purpose:"3D form → 2D shadow constraints",group:"theory"},{label:"Higher-dimensional inversion",href:"./inverse.html",tint:"#ead691",purpose:"4D form → 2D / 3D projection constraints",group:"theory"},{label:"5D Explorer",href:"./index.html",tint:"#a9f1e6",purpose:"Read a 3D slice of a higher-dimensional field",group:"fields"},{label:"Compounded 5D Explorer",href:"./blend.html",tint:"#c0a4ff",purpose:"Compose generators and compare their slices",group:"fields"}],h="cc4dPrevMode",x=/[?&](blendTest|creatorTest|cc4dTest)=/.test(location.search);function w(i){const e=location.pathname;return i==="./index.html"?e.endsWith("/")||e.endsWith("/index.html"):e.endsWith(i.slice(1))}function v(){return g.find(i=>w(i.href))||g[0]}function b(){var e;const i=(((e=document.querySelector("#status"))==null?void 0:e.textContent)||"").trim();return/^Live/.test(i)?{ready:!0}:/No WebGPU|Unavailable|No GPU|Device lost/i.test(i)?{ready:!0,error:i}:{ready:!1,note:i}}function S(){if(document.querySelector("#modeSwitchStyle"))return;const i=document.createElement("style");i.id="modeSwitchStyle",i.textContent=`
    #modeSwitch { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 50;
      display: flex; gap: 3px; padding: 3px; border: 1px solid rgba(230,255,249,0.14);
      border-radius: 999px; background: rgba(9,15,16,0.78); backdrop-filter: blur(8px);
      box-shadow: 0 4px 18px rgba(0,0,0,0.45);
      font-family: Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif; }
    #modeSwitch .ms-goo { position: absolute; inset: 0; z-index: 0; pointer-events: none;
      filter: url(#msGoo); }
    /* Positioned with transform, not left, for the same compositor reason as the sweep bar: the
       drop's entrance animation fires on page load, i.e. while the shader is compiling and the main
       thread is at its busiest. left/top would jank there; translateX glides. */
    #modeSwitch .ms-drop, #modeSwitch .ms-tip { position: absolute; left: 0; top: 3px;
      border-radius: 999px; background: var(--tint); will-change: transform; }
    /* The springy curve is what reads as liquid: it overshoots slightly and settles. */
    #modeSwitch .ms-drop { transition: transform 620ms cubic-bezier(.34,1.56,.44,1),
      width 620ms cubic-bezier(.34,1.56,.44,1), background 300ms ease; }
    #modeSwitch .ms-tip { transition: transform 380ms cubic-bezier(.34,1.4,.44,1),
      width 380ms ease, opacity 220ms ease, background 300ms ease; opacity: 0; }
    #modeSwitch a { position: relative; z-index: 1; padding: 4px 11px; border-radius: 999px;
      font-size: 11px; line-height: 1.35; text-decoration: none; color: #8fb0ad;
      letter-spacing: 0.02em; white-space: nowrap; transition: color 200ms ease; }
    #modeSwitch a:hover { color: #eef5f6; }
    #modeSwitch a.active { color: #06110f; font-weight: 640; cursor: default; }
    #modeSwitch { border-radius:18px; gap:10px; padding:5px 9px; max-width:calc(100vw - 20px); }
    #modeSwitch .ms-group { display:grid; grid-template-columns:auto auto; gap:2px; padding:0 3px; }
    #modeSwitch .ms-group + .ms-group { border-left:1px solid #bdece744; padding-left:12px; }
    #modeSwitch .ms-group-label { grid-column:1/-1; text-align:center; text-transform:uppercase; letter-spacing:.16em; font-size:8px; color:#efd891; text-shadow:0 0 9px #eacb6ab0,0 0 19px #eacb6a55; padding:1px 0 3px; }
    #modeSwitch .ms-group:last-child .ms-group-label { color:#b2efdb; text-shadow:0 0 9px #a4f3de99,0 0 19px #a4f3de44; }
    @media(max-width:720px) { #modeSwitch { width:max-content;flex-wrap:wrap;justify-content:center;gap:4px; } #modeSwitch .ms-group { padding:0; } #modeSwitch .ms-group+.ms-group{border-left:0;padding-left:0} #modeSwitch a{padding:4px 7px;font-size:10px} }

    /* Opacity, not display, so the dismiss is a compositor-driven fade. visibility keeps it out of
       hit-testing once faded. */
    #msLoad { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center;
      justify-content: center; background: rgba(6,10,12,0.72); backdrop-filter: blur(3px);
      font-family: Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif;
      opacity: 0; visibility: hidden; transition: opacity 420ms ease, visibility 0s linear 420ms; }
    #msLoad.on { opacity: 1; visibility: visible; transition: opacity 200ms ease, visibility 0s; }
    #msLoad .card { display: flex; flex-direction: column; align-items: center; gap: 11px;
      padding: 22px 30px; border-radius: 14px; border: 1px solid rgba(230,255,249,0.16);
      background: rgba(9,15,16,0.92); box-shadow: 0 12px 44px rgba(0,0,0,0.6); }
    #msLoad .ttl { font-size: 13px; font-weight: 640; color: #f2fbf9; letter-spacing: 0.01em; }
    #msLoad .sub { font-size: 11px; color: #8fb0ad; max-width: 260px; text-align: center;
      line-height: 1.5; }
    /* Indeterminate: the compile gives no progress signal, so never imply one. */
    #msLoad .bar { position: relative; width: 190px; height: 3px; border-radius: 999px;
      background: rgba(255,255,255,0.10); overflow: hidden; }
    /* Animated with transform, NOT left: a transform animation runs on the compositor, so it keeps
       sweeping smoothly even while the main thread is blocked -- which is exactly what happens here,
       since this overlay exists to cover shader compilation and (in 5D Field) the reaction-diffusion
       bake. Animating the left property would stutter precisely when the indicator matters most. */
    #msLoad .bar i { position: absolute; top: 0; bottom: 0; left: 0; width: 40%; border-radius: 999px;
      background: var(--tint); box-shadow: 0 0 10px var(--tint); will-change: transform;
      animation: msSweep 1150ms cubic-bezier(.45,0,.55,1) infinite; }
    @keyframes msSweep { 0% { transform: translateX(-105%); } 100% { transform: translateX(255%); } }
    #msLoad .elapsed { font-size: 10px; color: #6d8e8b; font-variant-numeric: tabular-nums; }
    /* The main view fades up once the mode is live, instead of snapping from black to a full
       render. Opacity only, so it composites and cannot fight the first frames for main-thread
       time. Guarded by a body class rather than applied to the canvas directly, so a mode that
       never mounts this module is unaffected. */
    body.ms-warming canvas { opacity: 0; }
    body.ms-live canvas { opacity: 1; transition: opacity 520ms ease; }
  `,document.head.append(i);const e=document.createElementNS("http://www.w3.org/2000/svg","svg");e.setAttribute("width","0"),e.setAttribute("height","0"),e.style.cssText="position:absolute;pointer-events:none",e.innerHTML=`<defs><filter id="msGoo" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" />
      <feColorMatrix in="b" mode="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
      <feGaussianBlur in="goo" stdDeviation="4" result="glow" />
      <feMerge><feMergeNode in="glow" /><feMergeNode in="goo" /></feMerge>
    </filter></defs>`,document.body.append(e)}function L(i){const e=document.createElement("div");e.id="msLoad",e.style.setProperty("--tint",i.tint),e.innerHTML=`<div class="card">
      <div class="ttl">Compiling ${i.label} shader…</div>
      <div class="bar"><i></i></div>
      <div class="sub">First load of a mode compiles its GPU shader. This can take a while; it is cached afterwards.</div>
      <div class="elapsed"></div>
    </div>`,document.body.append(e);const n=()=>{document.body.classList.remove("ms-warming"),document.body.classList.add("ms-live")};if(b().ready||x){n();return}document.body.classList.add("ms-warming"),e.classList.add("on");const o=performance.now(),r=e.querySelector(".elapsed"),d=()=>{const c=b();if(c.ready){if(c.error){e.querySelector(".ttl").textContent=c.error,e.querySelector(".bar").style.display="none",e.querySelector(".sub").textContent="This mode needs WebGPU. Try a Chromium-based browser with WebGPU enabled.";return}n(),e.classList.remove("on");return}r.textContent=`${((performance.now()-o)/1e3).toFixed(1)}s`,requestAnimationFrame(d)};requestAnimationFrame(d)}function y(){if(document.querySelector("#modeSwitch"))return;S();const i=document.createElement("nav");i.id="modeSwitch",i.setAttribute("aria-label","Four linked investigations");const e=document.createElement("div");e.className="ms-goo";const n=document.createElement("span");n.className="ms-drop";const a=document.createElement("span");a.className="ms-tip",e.append(n,a),i.append(e);const o=v(),r=[],d=new Map;for(const t of g){if(!d.has(t.group)){const l=document.createElement("div");l.className="ms-group";const u=document.createElement("span");u.className="ms-group-label",u.textContent=t.group==="theory"?"Theory · inverse constraints":"Creative · procedural fields",l.append(u),i.append(l),d.set(t.group,l)}const s=document.createElement("a");s.textContent=t.label,s.title=t.purpose,s.dataset.mode=t.href,t===o?(s.classList.add("active"),s.setAttribute("aria-current","page")):(s.href=t.href,s.addEventListener("click",()=>{try{sessionStorage.setItem(h,o.href)}catch{}}),s.addEventListener("mouseenter",()=>{a.style.setProperty("--tint",t.tint),m(s),a.style.opacity="0.85"}),s.addEventListener("mouseleave",()=>{a.style.opacity="0",m(c())})),r.push({mode:t,el:s}),d.get(t.group).append(s)}document.body.append(i);const c=()=>r.find(t=>t.mode===o).el;function f(t,s){t.style.transform=`translateX(${s.offsetLeft}px)`,t.style.width=`${s.offsetWidth}px`,t.style.height=`${s.offsetHeight}px`,t.style.top=`${s.offsetTop}px`}function m(t){const s=Math.max(14,t.offsetWidth*.34),l=Math.round(t.offsetHeight*.5);a.style.transform=`translateX(${t.offsetLeft+(t.offsetWidth-s)/2}px)`,a.style.width=`${s}px`,a.style.height=`${l}px`,a.style.top=`${t.offsetTop+(t.offsetHeight-l)/2}px`}n.style.setProperty("--tint",o.tint),a.style.setProperty("--tint",o.tint);let p=null;try{const t=sessionStorage.getItem(h);t&&(sessionStorage.removeItem(h),p=r.find(s=>s.mode.href===t))}catch{}p&&p.mode!==o&&(n.style.setProperty("--tint",p.mode.tint),f(n,p.el),m(p.el),n.offsetLeft,n.style.setProperty("--tint",o.tint)),f(n,c()),m(c()),window.addEventListener("resize",()=>{f(n,c()),m(c())}),L(o)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",y):y();
