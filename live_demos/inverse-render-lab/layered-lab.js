(function initLayeredLab() {
  "use strict";

  const core = window.LayeredCore;
  if (!core) return;

  const COLORS = {
    grid: "rgba(222, 235, 230, 0.10)",
    text: "#9eaaa7",
    strong: "#edf4f0",
    naive: "#ed7c91",
    belcour: "#49d0bd",
    guo: "#f0ba5d",
    truth: "#7ba7ff"
  };

  const state = {
    coatRoughness: 0.12,
    sigmaT: 0.35,
    active: false,
    running: false,
    worker: null,
    jobId: 0,
    slice: null,
    sweep: null,
    audit: null,
    series: null,
    truth: null,
    error: "",
    previewKey: "",
    previewProfiles: null,
    previewTimer: 0,
    needsAudit: false
  };

  const elements = {};
  const elementIds = [
    "layeredSliceCanvas", "layeredSweepCanvas", "layeredCoat", "layeredCoatValue",
    "layeredSigma", "layeredSigmaValue", "layeredRunButton", "layeredStatusBadge",
    "layeredSeriesBadge", "layeredSweepBadge", "layeredRelightTable", "layeredRecoveredTable",
    "layeredOutputCanvas", "layeredOutputBadge", "layeredOutputCaption"
  ];

  document.addEventListener("DOMContentLoaded", start);

  function start() {
    const panel = document.querySelector('[data-view-panel="layered"]');
    if (!panel) return;
    for (const id of elementIds) elements[id] = document.getElementById(id);
    state.active = panel.classList.contains("active");
    bindControls();
    draw();
    document.addEventListener("inverse-view-change", (event) => {
      state.active = event.detail?.view === "layered";
      if (state.active && !state.audit && !state.running) run();
      if (state.active) draw();
    });
    if (state.active) run();
  }

  function bindControls() {
    elements.layeredCoat?.addEventListener("input", () => {
      state.coatRoughness = Number(elements.layeredCoat.value);
      if (elements.layeredCoatValue) elements.layeredCoatValue.value = state.coatRoughness.toFixed(2);
      invalidateAudit();
    });
    elements.layeredSigma?.addEventListener("input", () => {
      state.sigmaT = Number(elements.layeredSigma.value);
      if (elements.layeredSigmaValue) elements.layeredSigmaValue.value = state.sigmaT.toFixed(2);
      invalidateAudit();
    });
    elements.layeredRunButton?.addEventListener("click", run);
  }

  function invalidateAudit() {
    // A parameter change invalidates the old fit. Terminating an in-flight audit also keeps
    // a late worker response from presenting old estimates beside the current material.
    if (state.running) {
      state.worker?.terminate();
      state.worker = null;
      state.jobId += 1;
    }
    state.running = false;
    state.needsAudit = true;
    state.audit = null;
    state.slice = null;
    state.sweep = null;
    state.series = null;
    state.truth = null;
    for (const key of ["layeredRelightTable", "layeredRecoveredTable"]) {
      elements[key]?.replaceChildren();
    }
    if (elements.layeredSeriesBadge) elements.layeredSeriesBadge.textContent = "run the audit to refit this stack";
    if (elements.layeredSweepBadge) elements.layeredSweepBadge.textContent = "run the audit";
    updateReadouts();
    window.clearTimeout(state.previewTimer);
    state.previewTimer = window.setTimeout(draw, 65);
  }

  function run() {
    if (state.running) return;
    if (typeof Worker === "undefined") {
      state.error = "Web Workers unavailable; the stochastic reference is too slow for the main thread.";
      updateReadouts();
      return;
    }
    state.running = true;
    state.needsAudit = false;
    state.error = "";
    state.jobId += 1;
    updateReadouts();
    if (!state.worker) {
      state.worker = new Worker("layered-worker.js?v=layered-1");
      state.worker.onmessage = (event) => {
        const data = event.data || {};
        if (data.jobId !== state.jobId) return;
        if (data.type === "slice") state.slice = data.slice;
        if (data.type === "sweep") state.sweep = data.sweep;
        if (data.type === "error") {
          state.error = data.message;
          state.running = false;
        }
        if (data.type === "result") {
          state.audit = data.audit;
          state.series = data.series;
          state.truth = data.truth;
          state.running = false;
        }
        updateReadouts();
        draw();
      };
      state.worker.onerror = () => {
        state.error = "layered worker failed";
        state.running = false;
        updateReadouts();
      };
    }
    state.worker.postMessage({
      type: "audit",
      jobId: state.jobId,
      payload: {
        stack: { coatRoughness: state.coatRoughness, sigmaT: state.sigmaT },
        referenceSamples: 512
      }
    });
  }

  function updateReadouts() {
    if (elements.layeredStatusBadge) {
      elements.layeredStatusBadge.textContent = state.error
        ? state.error
        : state.running ? "computing stochastic reference and fits" : state.audit ? "audit complete"
          : state.needsAudit ? "appearance updated · run audit to refit" : "idle";
    }
    if (elements.layeredSeriesBadge && state.series && state.audit && state.truth) {
      // The headline is the recovered albedo error, not the RMSE gap. A model can be wrong by a
      // large factor in a parameter while sitting within a percent of the right training
      // residual, and that is the whole point of the exhibit.
      const err = (recovered) => {
        let worst = 0;
        for (let channel = 0; channel < 3; channel += 1) {
          worst = Math.max(worst, recovered.albedo[channel] / Math.max(1e-6, state.truth.albedo[channel]),
            state.truth.albedo[channel] / Math.max(1e-6, recovered.albedo[channel]));
        }
        return worst;
      };
      const naiveErr = err(state.audit.lanes.naive.recovered);
      const layeredErr = err(state.audit.lanes.belcour.recovered);
      elements.layeredSeriesBadge.textContent =
        `naive albedo off by ${naiveErr.toFixed(1)}x, statistical by ${layeredErr.toFixed(2)}x`
        + ` -- on training residuals within ${(Math.abs(state.audit.lanes.naive.trainRmse - state.audit.lanes.belcour.trainRmse)
          / Math.max(1e-9, state.audit.lanes.belcour.trainRmse) * 100).toFixed(0)}% of each other`;
    }
    if (elements.layeredSweepBadge && state.sweep?.length) {
      const first = state.sweep[0];
      const last = state.sweep[state.sweep.length - 1];
      elements.layeredSweepBadge.textContent =
        `recovered base roughness ${first.recoveredBaseRoughness.toFixed(3)} -> ${last.recoveredBaseRoughness.toFixed(3)}`
        + ` while truth stays ${last.trueBaseRoughness.toFixed(2)}`;
    }
    if (elements.layeredRelightTable && state.audit) {
      const row = (name, lane) => `
        <tr>
          <td>${name}</td>
          <td>${lane.trainRmse.toExponential(2)}</td>
          <td>${lane.heldOutRmse.toExponential(2)}</td>
          <td>${lane.gap.toFixed(2)}x</td>
        </tr>`;
      elements.layeredRelightTable.innerHTML =
        row("naive addition", state.audit.lanes.naive) + row("statistical layering", state.audit.lanes.belcour);
    }
    if (elements.layeredRecoveredTable && state.audit && state.truth) {
      const fmt = (value) => value.toFixed(3);
      const row = (name, recovered) => `
        <tr>
          <td>${name}</td>
          <td>${recovered.albedo.map(fmt).join(", ")}</td>
          <td>${fmt(recovered.baseRoughness)}</td>
          <td>${fmt(recovered.coatRoughness)}</td>
        </tr>`;
      elements.layeredRecoveredTable.innerHTML =
        `<tr class="truth-row"><td>truth</td><td>${state.truth.albedo.map(fmt).join(", ")}</td>`
        + `<td>${fmt(state.truth.baseRoughness)}</td><td>${fmt(state.truth.coatRoughness)}</td></tr>`
        + row("naive", state.audit.lanes.naive.recovered)
        + row("statistical", state.audit.lanes.belcour.recovered);
    }
  }

  function backdrop(context, width, height) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#0c1115";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = COLORS.grid;
    context.lineWidth = 1;
    for (let i = 1; i < 5; i += 1) {
      const y = height * i / 5;
      context.beginPath();
      context.moveTo(34, y);
      context.lineTo(width - 10, y);
      context.stroke();
    }
  }

  function label(context, text, x, y, color) {
    context.fillStyle = color || COLORS.text;
    context.font = "10px Inter, system-ui, sans-serif";
    context.fillText(text, x, y);
  }

  function draw() {
    drawAppearance();
    drawSlice();
    drawSweep();
  }

  // The core evaluates a coplanar angular slice. Curved cylindrical strips keep every light,
  // surface normal and camera ray in that plane; applying it to arbitrary sphere normals
  // would silently pretend that the core accepted full 3D azimuthal geometry.
  function buildAppearanceProfiles() {
    const key = `${state.coatRoughness}/${state.sigmaT}`;
    if (state.previewKey === key && state.previewProfiles) return state.previewProfiles;
    const stack = core.makeStack({ baseIsDiffuse: false,
      coatRoughness: state.coatRoughness, sigmaT: state.sigmaT });
    const profiles = {};
    const count = 192;
    const keyOffsets = [-.09, -.045, 0, .045, .09];
    const keyWeights = [.10, .23, .34, .23, .10];
    for (const operator of ["naive", "belcour", "guo"]) {
      const rows = [];
      for (let i = 0; i < count; i += 1) {
        const normalAngle = -.99 + 1.98 * i / (count - 1);
        const thetaO = -normalAngle;
        const color = [0, 0, 0];
        for (let channel = 0; channel < 3; channel += 1) {
          // A repeatable reference preserves its Monte Carlo variation across redraws.
          const random = core.mulberry32(0x52c18a ^ (i * 1997 + channel * 811));
          for (let light = 0; light < 6; light += 1) {
            const thetaI = (light < 5 ? .62 + keyOffsets[light] : -.72) - normalAngle;
            if (Math.cos(thetaI) <= 0) continue;
            const value = core.evaluate(operator, stack, thetaI, thetaO, channel,
              { samples: 96, random });
            const irradiance = light < 5 ? keyWeights[light] * 2.4 : .32;
            color[channel] += Math.max(0, value) * Math.cos(thetaI) * irradiance;
          }
        }
        rows.push(color);
      }
      profiles[operator] = rows;
    }
    state.previewKey = key;
    state.previewProfiles = profiles;
    return profiles;
  }

  function drawAppearance() {
    const canvas = elements.layeredOutputCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const profiles = buildAppearanceProfiles();
    context.save();
    context.setTransform(canvas.width / 1040, 0, 0, canvas.height / 430, 0, 0);
    const backdrop = context.createRadialGradient(520, 245, 10, 520, 230, 665);
    backdrop.addColorStop(0, "#24312f");
    backdrop.addColorStop(1, "#0a0e13");
    context.fillStyle = backdrop;
    context.fillRect(0, 0, 1040, 430);
    const lanes = [
      ["naive", "NAIVE ADDITION", "omits transport between layers", COLORS.naive],
      ["belcour", "STATISTICAL LAYERING", "energy + directional variance", COLORS.belcour],
      ["guo", "STOCHASTIC REFERENCE", "96 paths per angle / light / channel", COLORS.guo]
    ];
    lanes.forEach(([operator, name, subtitle, color], lane) => {
      const cx = 180 + lane * 340;
      const radius = 137;
      const extent = Math.sin(.99) * radius;
      context.fillStyle = color;
      context.font = "600 12px Inter, system-ui, sans-serif";
      context.fillText(name, cx - extent, 31);
      context.fillStyle = COLORS.text;
      context.font = "11px Inter, system-ui, sans-serif";
      context.fillText(subtitle, cx - extent, 52);
      const shadow = context.createRadialGradient(cx, 350, 3, cx, 350, 150);
      shadow.addColorStop(0, "rgba(0,0,0,.85)"); shadow.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = shadow; context.fillRect(cx - 160, 280, 320, 125);
      const silhouette = () => {
        context.beginPath();
        for (let side = 0; side < 2; side += 1) {
          for (let i = 0; i <= 192; i += 1) {
            const t = side ? 1 - i / 192 : i / 192;
            const angle = -.99 + 1.98 * t;
            const x = cx + Math.sin(angle) * radius;
            const y = (side ? 341 : 107) - 27 * Math.cos(angle);
            if (!side && !i) context.moveTo(x, y); else context.lineTo(x, y);
          }
        }
        context.closePath();
      };
      context.save(); silhouette(); context.clip();
      const profile = profiles[operator];
      for (let column = 0; column < Math.ceil(extent * 2); column += 1) {
        const nx = Math.max(-.836, Math.min(.836, (column - extent) / radius));
        const t = (Math.asin(nx) + .99) / 1.98 * (profile.length - 1);
        const lo = Math.max(0, Math.min(profile.length - 2, Math.floor(t)));
        const blend = Math.max(0, Math.min(1, t - lo));
        const rgb = profile[lo].map((value, channel) => {
          const radiance = value * (1 - blend) + profile[lo + 1][channel] * blend;
          const exposed = Math.max(0, radiance) * 2.2;
          return Math.round(255 * Math.pow(exposed / (1 + exposed), 1 / 2.2));
        });
        context.fillStyle = `rgb(${rgb.join(",")})`;
        context.fillRect(cx - extent + column, 74, 1.15, 270);
      }
      context.restore();
      silhouette(); context.strokeStyle = "rgba(249,223,186,.34)";
      context.lineWidth = 1; context.stroke();
      context.fillStyle = color;
      context.fillRect(cx - extent, 363, 30, 2);
      context.fillStyle = COLORS.text;
      context.font = "12px Inter, system-ui, sans-serif";
      context.fillText("same base · same coat · same light", cx - extent + 39, 367);
    });
    context.fillStyle = "#bbc9c3";
    context.font = "12px Inter, system-ui, sans-serif";
    context.fillText("Curved material strips / coplanar illumination / shared display exposure", 66, 410);
    context.restore();
    if (elements.layeredOutputBadge) elements.layeredOutputBadge.textContent =
      `coat α ${state.coatRoughness.toFixed(2)} · extinction ${state.sigmaT.toFixed(2)}`;
    if (elements.layeredOutputCaption) elements.layeredOutputCaption.textContent =
      "These are rendered outputs of the three BSDF operators, evaluated on the same curved strip under a five-direction key light and a fill light. All use the same stack, exposure and tone map. Change coat roughness or extinction to see highlight width and transmitted base colour change immediately; then run the audit to compare recovered parameters. The stochastic strip uses a cached angular estimate, so its small bands reflect finite sampling. Geometry is fixed and the transport model remains locally plane-parallel.";
  }

  // Three operators over one stack. The stochastic reference is drawn as points rather than a
  // line, because its scatter is a property of the estimator and smoothing it would hide the
  // thing that makes it a reference rather than a fourth opinion.
  function drawSlice() {
    const canvas = elements.layeredSliceCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    backdrop(context, width, height);
    if (!state.slice?.length) {
      label(context, state.running ? "computing..." : "run the audit to populate", 44, height / 2);
      return;
    }
    let peak = 1e-6;
    for (const row of state.slice) peak = Math.max(peak, row.naive, row.belcour, row.guo);
    const toX = (index) => 34 + (width - 48) * index / Math.max(1, state.slice.length - 1);
    const toY = (value) => height - 22 - (height - 40) * Math.min(1, value / peak);

    for (const [key, color] of [["naive", COLORS.naive], ["belcour", COLORS.belcour]]) {
      context.strokeStyle = color;
      context.lineWidth = 1.8;
      context.beginPath();
      state.slice.forEach((row, index) => {
        const x = toX(index);
        const y = toY(row[key]);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
    context.fillStyle = COLORS.guo;
    state.slice.forEach((row, index) => {
      context.beginPath();
      context.arc(toX(index), toY(row.guo), 1.7, 0, Math.PI * 2);
      context.fill();
    });

    label(context, "outgoing angle ->", 34, height - 7);
    label(context, "naive", width - 150, 14, COLORS.naive);
    label(context, "statistical", width - 108, 14, COLORS.belcour);
    label(context, "stochastic reference", width - 150, 26, COLORS.guo);
  }

  // The variance-addition exhibit: true base roughness is flat, recovered base roughness is not.
  function drawSweep() {
    const canvas = elements.layeredSweepCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    backdrop(context, width, height);
    if (!state.sweep?.length) {
      label(context, state.running ? "computing..." : "run the audit to populate", 44, height / 2);
      return;
    }
    const maxValue = Math.max(...state.sweep.map((row) =>
      Math.max(row.recoveredBaseRoughness, row.apparentBaseRoughness, row.trueBaseRoughness))) * 1.15;
    const toX = (index) => 34 + (width - 48) * index / Math.max(1, state.sweep.length - 1);
    const toY = (value) => height - 22 - (height - 40) * Math.min(1, value / maxValue);

    const series = [
      ["trueBaseRoughness", COLORS.truth, "true base"],
      ["apparentBaseRoughness", COLORS.belcour, "apparent through the coat"],
      ["recoveredBaseRoughness", COLORS.naive, "recovered by naive fit"]
    ];
    series.forEach(([key, color], seriesIndex) => {
      context.strokeStyle = color;
      context.lineWidth = 1.8;
      context.setLineDash(key === "trueBaseRoughness" ? [4, 3] : []);
      context.beginPath();
      state.sweep.forEach((row, index) => {
        const x = toX(index);
        const y = toY(row[key]);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
      context.setLineDash([]);
      label(context, series[seriesIndex][2], 40, 14 + seriesIndex * 12, color);
    });
    label(context, "coat roughness ->", 34, height - 7);
  }
})();
