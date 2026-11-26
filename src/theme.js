import { THEMES } from './constants.js';
import { global } from './env.js';

/** [r, g, b] of a #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() or rgba() colour; null for any other CSS colour. */
function rgbOf(color) {
  const c = String(color).trim();
  let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c);
  if (m) {
    const h = m[1].length <= 4 ? m[1].replace(/./g, x => x + x) : m[1];
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  return m ? [m[1], m[2], m[3]].map(Number) : null;
}
/**
 * Whether options.background goes with theme `name`: a dark colour with the dark theme, a light one with the light theme
 * (so a dark page's background never sits under the light theme's dark text). Dark = relative luminance under 0.179,
 * where black and white text have the same contrast on it. A colour this cannot read (a name, hsl(), var()) goes with both.
 */
function backgroundFits(color, name) {
  const rgb = rgbOf(color);
  if (!rgb) return true;
  const [r, g, b] = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return (0.2126 * r + 0.7152 * g + 0.0722 * b < 0.179) === (name === 'dark');
}

/**
 * Theme: CSS variables on the root and the same colours in lightweight-charts. 'auto' follows the reader's system setting.
 * `applied(name)` hears the theme drawn ('dark' or 'light') after each change.
 */
export function createTheme(root, chart, o, applied) {
  const dark = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;
  function apply() {
    const want = o.theme === 'auto' ? (dark && !dark.matches ? 'light' : 'dark') : o.theme;
    const name = THEMES[want] ? want : 'dark', t = THEMES[name];
    for (const [k, v] of Object.entries(t)) root.style.setProperty('--fac-' + k, v);
    if (o.background && backgroundFits(o.background, name)) root.style.setProperty('--fac-bg', o.background);
    chart.applyOptions({ layout: { textColor: t.muted, panes: { separatorColor: t.line } },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.line }, leftPriceScale: { borderColor: t.line }, timeScale: { borderColor: t.line } });
    if (applied) applied(name);
  }
  apply();
  const onScheme = () => { if (o.theme === 'auto') apply(); };
  if (dark && dark.addEventListener) dark.addEventListener('change', onScheme);
  return {
    apply,
    destroy() { if (dark && dark.removeEventListener) dark.removeEventListener('change', onScheme); },
  };
}
