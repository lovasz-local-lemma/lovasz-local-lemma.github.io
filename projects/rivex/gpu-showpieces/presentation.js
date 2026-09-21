// A small display-space detail lift. It changes neither the modal field nor
// the signed document; both delivery routes receive the same presentation.
export function crispPresentation(button, surfaces) {
  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  holder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"><defs><filter id="instrument-crisp" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feConvolveMatrix order="3" kernelMatrix="0 -.10 0 -.10 1.40 -.10 0 -.10 0" preserveAlpha="true" edgeMode="duplicate"/></filter></defs></svg>';
  document.body.append(holder);
  let enabled = true, applicable = false;
  function apply() {
    for (const surface of surfaces) surface.style.filter = applicable && enabled ? 'url(#instrument-crisp)' : '';
    button.hidden = !applicable;
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? 'Crisp details · on' : 'Crisp details · off';
  }
  button.title = 'A subtle display sharpening pass for the metal grain and nodal pattern. The modal simulation and signed file are unchanged.';
  button.addEventListener('click', () => {enabled = !enabled; apply();});
  return {select(isMembrane) {applicable = isMembrane; apply();}};
}
