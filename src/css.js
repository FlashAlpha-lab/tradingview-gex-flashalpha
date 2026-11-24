/** src/styles.css, minified; set by the build (empty when the source runs unbuilt, e.g. in tests). */
export const css = typeof __FAC_CSS__ !== 'undefined' ? __FAC_CSS__ : '';

/** Adds the chart's style sheet to the page once. options.injectCss: false skips it (load style.css yourself). */
export function injectCss() {
  if (!css || typeof document === 'undefined' || document.getElementById('fac-css')) return;
  const style = document.createElement('style');
  style.id = 'fac-css';
  style.textContent = css;
  document.head.appendChild(style);
}
