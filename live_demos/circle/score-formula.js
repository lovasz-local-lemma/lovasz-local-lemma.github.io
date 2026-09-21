(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RoundnessScoreFormula = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var TERMS = [
    { key: "rms", code: "A", name: "Average fit", note: "overall drift", anchor: "6% radial RMS" },
    { key: "zone", code: "B", name: "Zone width", note: "local extremes", anchor: "15% annulus width" },
    { key: "compactness", code: "C", name: "Compactness", note: "area vs. perimeter", anchor: "0.03 compactness deficit" },
    { key: "curvature", code: "D", name: "Curvature", note: "uneven bending", anchor: "0.75 curvature RMS" },
    { key: "harmonics", code: "E", name: "Harmonics", note: "repeated wobble", anchor: "6% harmonic amplitude" }
  ];
  function math(content) { return '<math xmlns="http://www.w3.org/1998/Math/MathML">' + content + '</math>'; }
  function q(code) { return '<msub><mi>q</mi><mi mathvariant="normal">' + code + '</mi></msub>'; }
  function weight(model, term) { return model.components[term.key].weight.toFixed(2); }
  function markup(policy, model) {
    if (!["geometric", "arithmetic", "bottleneck"].includes(policy)) throw new RangeError("Unknown formula policy: " + policy);
    var isMin = policy === "bottleneck", isProduct = policy === "geometric";
    var terms = TERMS.map(function (term, index) {
      var expression = isMin ? q(term.code) : isProduct
        ? '<msup>' + q(term.code) + '<mn>' + weight(model, term) + '</mn></msup>'
        : '<mrow><mn>' + weight(model, term) + '</mn><mo>·</mo>' + q(term.code) + '</mrow>';
      return '<div class="formula-term" data-measure="' + term.key + '">' +
        '<div class="formula-symbol">' + (index ? '<span class="formula-operator" aria-hidden="true">' + (isMin ? ',' : isProduct ? '·' : '+') + '</span>' : '') + math(expression) + '</div>' +
        '<span class="formula-leader" aria-hidden="true"></span>' +
        '<span class="formula-caption"><b>' + term.name + '</b><small>' + term.note + '</small></span></div>';
    }).join("");
    return '<div class="formula-prefix">' + math('<mi>S</mi><mo>=</mo><mn>100</mn><mo>×</mo>' + (isMin ? '<mi mathvariant="normal">min</mi>' : '')) +
      '<span>' + (isMin ? 'weakest quality' : isProduct ? 'weighted product' : 'weighted sum') + '</span></div>' +
      '<div class="formula-terms' + (isMin ? ' formula-min' : isProduct ? '' : ' formula-sum') + '">' + terms + '</div>' +
      '<p class="formula-key">' + math('<msub><mi>q</mi><mi>i</mi></msub><mo>=</mo><mfrac><mtext>component quality</mtext><mn>100</mn></mfrac>') +
      '<span>0 = poor · 1 = ideal' + (isMin ? ' · no weights' : ' · weights sum to 1') + '</span></p>';
  }
  function qualityMarkup() {
    return '<div class="quality-transform">' + math(
      '<msub><mi>q</mi><mi>i</mi></msub><mo>=</mo><mfrac><mn>1</mn><mrow><mn>1</mn><mo>+</mo><msup><mrow><mo>(</mo><mfrac><mi class="formula-error">e</mi><mi class="formula-anchor">h</mi></mfrac><mo>)</mo></mrow><mn>2</mn></msup></mrow></mfrac>') +
      '<div class="quality-callouts"><span class="formula-error"><b>e ↖</b> measured error</span><span class="formula-anchor"><b>h ↖</b> q = 0.5 when e = h</span></div></div>' +
      '<p class="formula-exception">A, B, D, E use this squared-error mapping. Compactness uses ' + math(
        q('C') + '<mo>=</mo><mfrac><mn>1</mn><mrow><mn>1</mn><mo>+</mo><mfrac><mrow><mn>1</mn><mo>−</mo><mi>C</mi></mrow><mn>0.03</mn></mfrac></mrow></mfrac>') +
      ', with the deficit clamped to zero.</p><div class="formula-anchors">' + TERMS.map(function (term) {
        return '<span data-measure="' + term.key + '"><b>' + term.code + '</b> ' + term.anchor + '</span>';
      }).join('') + '</div><p class="formula-footnote">C = 4πA / L². Radial and harmonic errors use the fitted radius; zone width uses the annulus mean radius. Curvature measures RMS(Rκ − 1). Harmonics inspect modes 2–12. The geometric implementation floors normalized qualities at 10⁻¹².</p>';
  }
  function render(host, qualityHost, policy, model) {
    if (!host || !qualityHost) return;
    var key = policy + ':' + TERMS.map(function (term) { return weight(model, term); }).join(',');
    if (host.getAttribute('data-formula-key') !== key) {
      host.innerHTML = markup(policy, model);
      host.setAttribute('data-formula-key', key);
    }
    if (!qualityHost.getAttribute('data-formula-ready')) {
      qualityHost.innerHTML = qualityMarkup();
      qualityHost.setAttribute('data-formula-ready', 'true');
    }
  }
  function accessibleFormula(policy) {
    var equations = {
      geometric: 'S = 100 × exp(Σ wᵢ ln(max(qᵢ, 10⁻¹²)))',
      arithmetic: 'S = 100 × (Σ wᵢ qᵢ)',
      bottleneck: 'S = 100 × minᵢ qᵢ'
    };
    if (!equations[policy]) throw new RangeError('Unknown formula policy: ' + policy);
    return equations[policy] + '. qᵢ is component quality divided by 100, on a zero-to-one scale.';
  }
  return { markup: markup, qualityMarkup: qualityMarkup, render: render, accessibleFormula: accessibleFormula };
});
