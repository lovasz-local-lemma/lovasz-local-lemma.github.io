(function initPanelUi() {
  "use strict";

  // Shared panel guidance and controls.
  //
  // 1. A "?" on every panel that says, in plain language, what the lab is, what is on screen,
  //    what to try, and the scope of its evidence. A compact context strip keeps the next
  //    experiment and its connection to the main investigations visible without opening help.
  //
  // 2. Static, collapsible numerical controls beside visible scene choices.
  // Small control groups open initially; taller ones begin folded.

  const HELP = {
    "3d": {
      title: "3D reconstruction",
      what: "Fits an implicit shape, its material and scene lighting to rendered measurements, with numerical gradient estimators or derivative-free pattern search.",
      look: "Target against current reconstruction, the residual between them, and the parameter traces. The capture tab shows which cameras the optimizer was given.",
      probe: "Switch scenario to change topology, then watch whether the fit escapes the 'solid blob' basin. Turn the ablation to Macro only to see what cannot be explained once displacement and pigment are frozen.",
      limit: "Convergence checks geometry and RGB in fit and inspection views. The inspection camera can also guide pattern search, so that check is not always held out; the separate orbit audit tests more viewpoints."
    },
    nlos3d: {
      title: "Hidden-object capture",
      what: "A full around-the-corner scene: camera and projector face a relay wall, an object is hidden from direct view, and the reconstruction uses only indirect light.",
      look: "The room in 3D with the blocked direct ray drawn, the measurement the sensor actually collects, and the mode-specific recovery beside the hidden truth.",
      probe: "Change acquisition mode and aperture, then compare what each measurement makes recoverable. The resolution ledger states the limit the optics impose.",
      limit: "Reconstruction quality is reported against the truth rather than asserted, and the panel names the ambiguity each mode leaves behind."
    },
    mesh: {
      title: "Surface extraction",
      what: "Extracts an explicit mesh from the current implicit field. A separate angular-sample experiment fits structured BSDF models and tests whether their parameters are identifiable.",
      look: "A fitted field slice, its actual triangle mesh, and the target surface under matching inspection conditions. The reflectance tab compares rendered material strips, angular curves, and model-selection evidence.",
      probe: "Compare the extracted surface against the target field as the fit improves.",
      limit: "SDF extraction and the BSDF fits are executable. Direct-mesh and Gaussian-surface routes are illustrations without reconstruction metrics; the displayed atlas is a material-map preview, not a recovered UV asset."
    },
    asset: {
      title: "Factorized asset capture",
      what: "Fits 15 coefficients of a controlled procedural shape, material and illumination model using finite differences and Adam. The recovered model produces the displayed factor maps.",
      look: "Target, current fit and residual, plus factor maps for each recovered channel.",
      probe: "Run the ablations. Each freezes part of the model, and what remains in the residual is what that part was explaining.",
      limit: "The unknown is a compact procedural model, not an arbitrary mesh or free per-texel material maps. This controlled setting makes geometry, material and lighting ambiguity directly testable."
    },
    volumeinv: {
      title: "Cloud inversion",
      what: "Recovers a 3D extinction grid from calibrated optical-depth projections using analytic backprojection and regularization.",
      look: "Target and recovered volume, optical-depth loss, and alternative depth hypotheses that can explain the same front image.",
      probe: "Move from dense to sparse to single-view capture, then inspect how much the compatible volumes disagree from the side.",
      limit: "The solver updates the extinction grid, not the phase function. Multiple scattering is a display surrogate; the single-view alternatives are procedural hypotheses, not samples from a learned posterior."
    },
    aperture2d: {
      title: "Coded-aperture cameras",
      what: "Explores two camera models: recover an angular image from a coded shadow, or recover spatial distances from coded defocus. The mask and image-forming mechanism remain visible.",
      look: "Angular recovery compares target, exposure and recovered image. Depth from coded blur compares photographs, sixteen measured region distances, confidence and the selected region’s depth-score curve.",
      probe: "Move a direction through the angular camera. In Depth from coded blur, compare one-photo inference with two-focus evidence and test structured textures against the image prior.",
      limit: "The angular camera has no range observable. The depth experiment assumes calibrated independent planar regions with periodic blur; one-photo inference uses an image prior and a known side of focus. These are separate forward models."
    },
    capture: {
      title: "Capture physics",
      what: "Four measurement models -- photometric stereo, polarization, time of flight, exposure bracketing -- each acquiring shots progressively.",
      look: "Raw measurements, the forward fit, the recovered quantities, and the local Fisher conditioning of the estimate.",
      probe: "Add shots one at a time and watch which quantities become identifiable and which stay flat.",
      limit: "About what a measurement can and cannot determine. The ambiguity left outside the operator is reported, not hidden."
    },
    "2d": {
      title: "Gradient laboratory",
      what: "One small differentiable renderer fitted by four optimizers from the same start: analytic adjoint, autodiff, SPSA, and evolution search.",
      look: "Target, reconstruction, residual, loss curves and the gradient itself, side by side per optimizer.",
      probe: "Run all four and compare cost per unit of progress rather than progress per iteration.",
      limit: "The scene is deliberately compact so gradient quality and evaluation cost can be compared with the same forward model and starting point."
    },
    nlos: {
      title: "NLOS operators",
      what: "Explains the acquisition geometry of transient time of flight, dual photography and passive-edge imaging with a shared hidden target.",
      look: "A transport setup and simulated measurement, followed by schematic inverse-shape and reconstruction panels.",
      probe: "Switch acquisition mode and identify what the sensor measures, then open Hidden-object capture to run the corresponding inverse.",
      limit: "The forward measurement is simulated, but the inverse panels illustrate expected behavior: they do not reconstruct that measurement. Executable inverses and measured reconstruction errors live in Hidden-object capture."
    },
    volume: {
      title: "Representation study",
      what: "The same object as a density field, an iso-surface and a faceted mesh, with the error introduced by each conversion.",
      look: "Side-by-side renders plus the residual from forcing a soft field into a hard surface.",
      probe: "Compare the mesh proxy loss against the volume it approximates.",
      limit: "A comparison, not a solver. Nothing here is being fitted."
    },
    splat: {
      title: "Gaussian splatting",
      what: "Anisotropic Gaussians composited front to back and fitted with a hand-derived analytic adjoint, with clone/split/prune density control on top.",
      look: "Target, the recovery with splat outlines drawn, the residual, and the population growing against the loss.",
      probe: "Run the fit, then press Relight the recovery. The truth changes and the recovery does not.",
      limit: "This is a 2D image-fitting model without 3D covariance or a camera. Its fixed splat colors explain the training image but do not factor out illumination, making the relighting test a representation limit."
    },
    optics: {
      title: "Distance from optical measurements",
      what: "Fits the distance of a rendered target from two calibrated, defocused photographs. Separate aperture-statistics and waterdrop experiments probe other optical tradeoffs.",
      look: "The hidden sharp reference, both measured photographs, the recovered image, and mismatch across candidate distances.",
      probe: "Change the target distance, scene, noise, or aperture. Check whether the same inferred distance explains both photographs.",
      limit: "The focus pair assumes registered captures and one planar target distance; it does not recover the pictured objects' separate surface depths. The inverse receives measurements and calibration only."
    },
    layered: {
      title: "Layered materials",
      what: "One coated stack evaluated three ways: naive lobe addition, statistical adding-doubling, and an unbiased stochastic reference.",
      look: "The three evaluations over the same stack, and what a fit recovers when the evidence came from the real thing.",
      probe: "Compare the naive fit's recovered albedo against the truth, then look at its training residual.",
      limit: "The trap is the exhibit: the naive model's residual is within 0.1% of the correct model's while its albedo is 3.73x wrong. A good fit is not a good model."
    },
    research: {
      title: "Research atlas",
      what: "The paper trail and method map behind everything else in this workbench.",
      look: "Representation comparisons, frontier notes and grouped references.",
      probe: "Use it to find which panel implements a given idea, and which ideas are described but not implemented.",
      limit: "Reference material. Nothing here is executable."
    }
  };

  const CONTEXT = {
    "3d": {
      kind: "Main investigation",
      probe: "Switch topology, run the fit, then inspect a new viewpoint to separate image agreement from shape recovery.",
      related: [["2d", "Compare optimizers"], ["mesh", "Inspect the extracted surface"]]
    },
    asset: {
      kind: "Main investigation",
      probe: "Freeze one factor with an ablation and inspect which error the remaining factors can absorb.",
      related: [["layered", "Test material-model bias"], ["capture", "Change the measurement"]]
    },
    nlos3d: {
      kind: "Main investigation",
      probe: "Switch acquisition mode and compare the raw evidence with the recovered object and its remaining ambiguity.",
      related: [["nlos", "Understand the light paths"], ["aperture2d", "Test aperture conditioning"]]
    },
    volumeinv: {
      kind: "Live experiment",
      probe: "Compare dense and single-view capture, then inspect the side view to see what the evidence leaves unconstrained.",
      related: [["3d", "Geometry reconstruction"], ["volume", "Compare volume and surface"]]
    },
    aperture2d: {
      kind: "Live experiment",
      probe: "Explore the mask, then choose angular-image recovery or depth from coded blur. Compare the reconstructed result with the measurement and its remaining ambiguity.",
      related: [["nlos3d", "Hidden-object capture"], ["optics", "Compare optical tradeoffs"]]
    },
    capture: {
      kind: "Live experiment",
      probe: "Add one shot at a time and check which recovered quantities become better constrained.",
      related: [["asset", "Appearance factorization"], ["nlos3d", "Hidden-object capture"]]
    },
    "2d": {
      kind: "Live experiment",
      probe: "Run the optimizers from the same start and compare loss reduction against evaluation cost.",
      related: [["3d", "Geometry reconstruction"], ["asset", "Appearance factorization"]]
    },
    splat: {
      kind: "Live experiment",
      probe: "Fit the image, then relight the recovery to reveal what fixed splat colors cannot explain.",
      related: [["asset", "Appearance factorization"], ["3d", "Geometry reconstruction"]]
    },
    optics: {
      kind: "Live experiment",
      probe: "Recover one target-plane distance from two calibrated focus settings, then compare apertures with their light-transmission cost included.",
      related: [["nlos3d", "Hidden-object capture"], ["aperture2d", "Test aperture conditioning"]]
    },
    layered: {
      kind: "Live experiment",
      probe: "Compare the naive fit's residual with its recovered albedo: image agreement can conceal material bias.",
      related: [["asset", "Appearance factorization"], ["mesh", "Inspect BSDF identifiability"]]
    },
    mesh: {
      kind: "Live extraction + illustrated routes",
      probe: "Compare SDF extraction errors as the geometry fit improves; the other route previews explain alternative representations.",
      related: [["3d", "Geometry reconstruction"], ["asset", "Appearance factorization"]]
    },
    nlos: {
      kind: "Illustrated guide · inverse panels are schematic",
      probe: "Trace each acquisition's light path, then run its measured reconstruction in Hidden-object capture.",
      related: [["nlos3d", "Run hidden-object capture"], ["aperture2d", "Test aperture conditioning"]]
    },
    volume: {
      kind: "Visual comparison · no solver",
      probe: "Compare the soft volume with its surface proxy and inspect which wisps and transparency disappear.",
      related: [["3d", "Geometry reconstruction"], ["volumeinv", "Run volume inversion"]]
    },
    research: {
      kind: "Reading · no solver",
      probe: "Choose a method family, then follow its implementation or scope notes back to a live experiment.",
      related: [["3d", "Geometry reconstruction"], ["nlos3d", "Hidden-object capture"]]
    }
  };

  const CONTROL_PATTERN = /(-controls|scenario-row|gpu-mode-strip)/;
  const MAIN_VIEWS = new Set(["3d", "asset", "nlos3d"]);
  let mainOrigin = null;
  let returningToMain = false;

  function exposeScenes(panel, view) {
    const selectors = {
      "3d": [".scenario-row"],
      asset: ["[data-asset-shape]", "[data-asset-model]"],
      nlos3d: ["[data-nlos3d-target]", "[data-nlos3d-mode]"],
      optics: ["[data-optics-experiment]"]
    }[view];
    if (!selectors) return;
    const blocks = [...new Set(selectors.map(selector => {
      const item = panel.querySelector(selector);
      return item && (item.matches(".scenario-row") ? item : item.closest(".compact-panel"));
    }).filter(Boolean))];
    if (!blocks.length) return;
    const deck = document.createElement("section");
    deck.className = "scene-deck";
    deck.setAttribute("aria-label", "Scene and experiment selection");
    const label = document.createElement("p");
    label.className = "scene-deck-label";
    label.textContent = view === "3d" ? "Explore all " + panel.querySelectorAll("[data-3d-scenario]").length + " test scenes" : view === "asset" ? "Choose a shape and its scattering model" : view === "optics" ? "Choose an optical experiment" : "Choose the hidden scene and capture mode";
    deck.appendChild(label);
    const choices = document.createElement("div");
    choices.className = "scene-deck-choices";
    for (const block of blocks) {
      if (view === "3d") block.removeAttribute("data-d3-workspace-group");
      choices.appendChild(block);
    }
    deck.appendChild(choices);
    const header = panel.querySelector(".test3d-header");
    const help = header && header.nextElementSibling;
    (help || header).insertAdjacentElement("afterend", deck);
  }

  function rememberMain(destination) {
    const current = document.querySelector("[data-view-panel].active");
    if (!current || returningToMain) return;
    const view = current.dataset.viewPanel;
    if (MAIN_VIEWS.has(destination)) { mainOrigin = null; return; }
    if (MAIN_VIEWS.has(view)) mainOrigin = {
      view,
      title: { "3d": "3D Reconstruction", asset: "Full Asset", nlos3d: "3D NLOS Scene" }[view],
      offset: Math.max(0, window.scrollY - (current.getBoundingClientRect().top + window.scrollY)),
      focus: document.activeElement
    };
  }

  function refreshReturnButtons() {
    for (const button of document.querySelectorAll(".lab-return")) {
      button.hidden = !mainOrigin;
      button.textContent = mainOrigin ? "← Back to " + mainOrigin.title : "";
    }
  }

  function returnToMain() {
    if (!mainOrigin) return;
    const origin = mainOrigin;
    const panel = document.querySelector('[data-view-panel="' + origin.view + '"]');
    returningToMain = true;
    document.querySelector('.lab-browser [data-view="' + origin.view + '"]').click();
    returningToMain = false;
    mainOrigin = null;
    refreshReturnButtons();
    requestAnimationFrame(() => {
      const focus = origin.focus && origin.focus.isConnected ? origin.focus : panel.querySelector("h2");
      if (focus) {
        if (!focus.matches("button, a[href], input, select, textarea, [tabindex]")) focus.setAttribute("tabindex", "-1");
        focus.focus({ preventScroll: true });
      }
      window.scrollTo({ top: panel.getBoundingClientRect().top + window.scrollY + origin.offset,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  }

  function promoteRunActions(panel, view) {
    if (view === "aperture2d") {
      panel.querySelectorAll("#apertureImageRunButton, #aperture2dRunButton").forEach(button => button.classList.add("primary-button", "run-action"));
      return; // Each camera workspace owns its visible Run action.
    }
    const runIds = {"3d":"run3dButton",asset:"assetRunButton",nlos3d:"nlos3dRunButton",splat:"splatRunButton",volumeinv:"volumeinvRunButton",capture:"capturePhysicsRunButton",optics:"opticsRunButton",aperture2d:"aperture2dRunButton",layered:"layeredRunButton","2d":"runButton"};
    const button = panel.querySelector("#" + runIds[view]);
    if (!button) return;
    button.classList.add("primary-button", "run-action");
    const alreadyProminent = button.closest(".test3d-header, .nlos3d-actions");
    if (alreadyProminent) return;
    const bar = document.createElement("div");
    bar.className = "lab-run-bar";
    bar.setAttribute("aria-label", "Run this experiment");
    // Move the actual controls, preserving their bindings and disabled/pause state.
    const group = button.closest(".asset-actions, .seed-row, .button-row");
    if (group && [...group.children].every(child => child.tagName === "BUTTON")) {
      while (group.firstChild) bar.appendChild(group.firstChild);
      group.remove();
    } else bar.appendChild(button);
    const label = document.createElement("span");
    label.className = "lab-run-hint";
    label.textContent = view === "splat" ? "Fit the image · watch the splats grow" : "Run the experiment, then inspect its evidence";
    bar.appendChild(label);
    const deck = panel.querySelector(".scene-deck");
    const header = panel.querySelector(".test3d-header, .panel-help-anchor");
    (deck || header).insertAdjacentElement("afterend", bar);
  }

  function build(panel, view) {
    addHelp(panel, view);
    exposeScenes(panel, view);
    promoteRunActions(panel, view);
    dockControls(panel);
    addContext(panel, view);
  }

  function addContext(panel, view) {
    const entry = CONTEXT[view];
    if (!entry) return;
    const context = document.createElement("aside");
    context.className = "lab-context";
    context.setAttribute("aria-label", "Experiment guide");

    const kind = document.createElement("span");
    kind.className = "lab-context-kind";
    kind.textContent = entry.kind;
    context.appendChild(kind);
    if (!MAIN_VIEWS.has(view)) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "lab-return";
      back.hidden = true;
      back.addEventListener("click", returnToMain);
      context.appendChild(back);
    }

    const probe = document.createElement("p");
    probe.className = "lab-context-probe";
    const label = document.createElement("strong");
    label.textContent = "Try this. ";
    probe.append(label, document.createTextNode(entry.probe));
    context.appendChild(probe);

    const links = document.createElement("div");
    links.className = "lab-context-links";
    links.setAttribute("aria-label", "Related investigations");
    for (const [destination, title] of entry.related) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.openLab = destination;
      button.textContent = title;
      button.addEventListener("click", () => openLab(destination));
      links.appendChild(button);
    }
    context.appendChild(links);

    // The dock has already chosen its visual anchor, so the guide stays above Controls.
    const header = panel.querySelector(".test3d-header, .research-copy");
    const help = header && header.nextElementSibling;
    if (help && help.classList.contains("panel-help")) help.insertAdjacentElement("afterend", context);
    else if (header) header.insertAdjacentElement("afterend", context);
    else panel.prepend(context);
  }

  function openLab(view) {
    // Reuse the existing app mode handler. These links deliberately do not use data-view,
    // which is reserved for the mutually exclusive lab-browser selection buttons.
    const button = document.querySelector('.lab-browser [data-view="' + view + '"]');
    const panel = document.querySelector('[data-view-panel="' + view + '"]');
    if (!button || !panel) return;
    rememberMain(view);
    button.click();
    requestAnimationFrame(() => {
      if (!panel.classList.contains("active")) return;
      const heading = panel.querySelector("h2, h1, h3") || panel;
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  }

  function addHelp(panel, view) {
    const entry = HELP[view];
    if (!entry) return;
    // Most panels open with a header block. The 2-D lab does not -- it is a side-by-side stage
    // and control aside -- so fall back to a bar of its own at the top of the panel rather than
    // being the one lab with no explanation.
    let header = panel.querySelector(".test3d-header, .research-copy");
    if (!header) {
      header = document.createElement("div");
      header.className = "test3d-header panel-help-anchor";
      header.innerHTML = "<div><h2>" + escapeHtml(entry.title) + "</h2></div>";
      panel.insertBefore(header, panel.firstChild);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-help-toggle";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "What is " + entry.title + "?");
    button.title = "What is this?";
    button.textContent = "?";

    const help = document.createElement("div");
    help.className = "panel-help";
    help.hidden = true;
    help.innerHTML =
      "<h3>" + escapeHtml(entry.title) + "</h3>"
      + row("What it is", entry.what)
      + row("On screen", entry.look)
      + row("Try", entry.probe)
      + row("Scope of the result", entry.limit, "panel-help-limit");

    button.addEventListener("click", () => {
      help.hidden = !help.hidden;
      button.setAttribute("aria-expanded", String(!help.hidden));
      button.classList.toggle("active", !help.hidden);
    });

    // Sits in the header's own status row where there is one, so it lines up with the badge.
    header.appendChild(button);
    header.insertAdjacentElement("afterend", help);
  }

  function row(label, text, extra) {
    if (!text) return "";
    return '<p class="' + (extra || "") + '"><strong>' + escapeHtml(label) + "</strong> "
      + escapeHtml(text) + "</p>";
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  // Paragraphs of explanation inside a control panel are what push the viewports off screen.
  //
  // The control grid stretches every panel to the tallest, so a single 349-character note in
  // one of them made all five 254px tall when their actual content needs about 90. The words
  // are worth keeping -- several are the honesty notes that stop a readout being misread -- so
  // they move to the prose at the foot of the panel rather than being deleted, carrying the
  // label of the control they belong to so they still have an anchor.
  const NOTE_LIFT_THRESHOLD = 120;

  function liftLongNotes(panel, body) {
    const lifted = [];
    for (const note of Array.from(body.querySelectorAll("p.seed-note"))) {
      const text = (note.textContent || "").trim();
      // Leave short hints in place, and leave anything a lab script writes into by id, since
      // moving it would not break the write but would put live output somewhere unexpected.
      if (text.length < NOTE_LIFT_THRESHOLD || note.id) continue;
      const holder = note.closest(".compact-panel");
      const label = holder && holder.querySelector(".control-label");
      const paragraph = document.createElement("p");
      paragraph.className = "claim-note";
      if (label) {
        const strong = document.createElement("strong");
        strong.textContent = label.textContent.trim() + ". ";
        paragraph.appendChild(strong);
      }
      paragraph.appendChild(document.createTextNode(text));
      lifted.push(paragraph);
      note.remove();
    }
    if (!lifted.length) return;
    const wrap = document.createElement("div");
    wrap.className = "control-notes";
    for (const paragraph of lifted) wrap.appendChild(paragraph);
    panel.appendChild(wrap);
  }

  function dockControls(panel) {
    const blocks = Array.from(panel.children).filter((el) =>
      el.nodeType === 1 && CONTROL_PATTERN.test(el.className || ""));
    if (!blocks.length) return;

    const dock = document.createElement("div");
    dock.className = "control-dock";

    // Directly above the visuals, and staying put.
    //
    // An earlier version pinned this to the bottom edge so it followed the page down. It does
    // keep the controls reachable, but a panel of buttons sliding over the content while you
    // read it is more distracting than useful. Static and adjacent is the better trade: the
    // dock collapses, so it costs a single bar of height when it is not wanted, and sits
    // exactly where you would reach for it when it is.
    const anchor = Array.from(panel.children).find((el) =>
      el !== dock
      && !/header/.test(el.className || "")
      && !el.classList.contains("panel-help")
      && !el.classList.contains("scene-deck")
      && !el.classList.contains("lab-run-bar")
      && !CONTROL_PATTERN.test(el.className || ""));
    panel.insertBefore(dock, anchor || blocks[0]);

    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = "control-dock-bar";
    bar.innerHTML = '<span class="control-dock-label">Controls</span>'
      + '<span class="control-dock-hint"></span>'
      + '<span class="control-dock-chevron" aria-hidden="true"></span>';

    const body = document.createElement("div");
    body.className = "control-dock-body";
    for (const block of blocks) body.appendChild(block);
    liftLongNotes(panel, body);

    dock.appendChild(bar);
    dock.appendChild(body);

    const setOpen = (open) => {
      dock.setAttribute("data-open", String(open));
      bar.setAttribute("aria-expanded", String(open));
      dock.querySelector(".control-dock-hint").textContent = open ? "" : "show";
    };
    bar.addEventListener("click", () => setOpen(dock.getAttribute("data-open") !== "true"));

    // A block that already fits without eating the screen opens by default; a tall one does
    // not, because pinning 4500px of controls to the bottom edge is not a control panel, it is
    // a wall.
    //
    // Deferred until the panel is first shown. Only one panel is displayed at a time, so at
    // load every other one measures zero height and would be judged not to fit -- which quietly
    // collapsed every dock in the app, including the short ones this default exists for.
    let decided = false;
    const settle = () => {
      if (decided || !panel.classList.contains("active")) return;
      // A collapsed body is display:none and measures zero, so it has to be revealed to be
      // measured. Both writes and the read happen in one synchronous pass, so nothing paints
      // in between.
      const wasOpen = dock.getAttribute("data-open") === "true";
      if (!wasOpen) dock.setAttribute("data-open", "true");
      const height = body.scrollHeight;
      if (!wasOpen) dock.setAttribute("data-open", "false");
      if (!height) return;
      decided = true;
      setOpen(height <= Math.max(240, window.innerHeight * 0.42));
    };
    setOpen(false);
    settle();
    document.addEventListener("inverse-view-change", settle);
    // A manual toggle is the visitor's decision and ends the automatic one.
    bar.addEventListener("click", () => { decided = true; });

    // The 3D panel hides its control blocks per workspace, so the dock can end up wrapping
    // nothing at all. An empty bar labelled "Controls" that opens onto blank space is worse
    // than no bar, so the dock takes itself out when every block inside is hidden.
    const refresh = () => {
      const anyVisible = blocks.some(block =>
        !block.hidden && !block.classList.contains("workspace-hidden") &&
        [...block.querySelectorAll("button, input, select, textarea")].some(control =>
          !control.closest("[hidden], .workspace-hidden")));
      dock.setAttribute("data-empty", String(!anyVisible));
    };
    refresh();
    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(refresh);
      for (const block of blocks) {
        observer.observe(block, { attributes: true, subtree: true, attributeFilter: ["class", "hidden"] });
      }
    }
  }

  function start() {
    document.addEventListener("click", event => {
      const button = event.target.closest(".lab-browser [data-view]");
      if (button) rememberMain(button.dataset.view);
    }, true);
    document.addEventListener("inverse-view-change", refreshReturnButtons);
    for (const panel of document.querySelectorAll("[data-view-panel]")) {
      build(panel, panel.getAttribute("data-view-panel"));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
