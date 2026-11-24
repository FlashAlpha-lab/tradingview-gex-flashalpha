import { ET, THEMES } from '../constants.js';
import { global } from '../env.js';

const etParts = new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** Now in US Eastern time: { day: '2026-11-17', time: '15:30' }. */
function etNow() {
  const p = Object.fromEntries(etParts.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/**
 * "Take a screenshot": the chart (lightweight-charts takeScreenshot, with plugin primitives) under a title line
 * (symbol · resolution · session, the brand name, the ET time), saved as a PNG named after the symbol, resolution and time.
 */
export function createScreenshot(view, chart) {
  const { root, o, state } = view;
  return function screenshot() {
    if (typeof chart.takeScreenshot !== 'function') return null;
    const shot = chart.takeScreenshot(true, false);
    const canvasBox = root.querySelector('.fac-canvas');
    const ratio = canvasBox && canvasBox.clientWidth ? shot.width / canvasBox.clientWidth : (global.devicePixelRatio || 1);
    const head = Math.round(30 * ratio);
    const out = document.createElement('canvas');
    out.width = shot.width; out.height = shot.height + head;
    const g = out.getContext('2d');
    if (!g) return null;
    const css = name => root.style.getPropertyValue('--fac-' + name).trim();
    const bg = css('bg') || THEMES.dark.bg, text = css('text') || THEMES.dark.text, muted = css('muted') || THEMES.dark.muted;
    g.fillStyle = bg; g.fillRect(0, 0, out.width, out.height);
    const now = etNow(), pad = 10 * ratio, mid = head / 2;
    g.textBaseline = 'middle';
    g.font = `600 ${13 * ratio}px system-ui, -apple-system, Segoe UI, sans-serif`;
    g.fillStyle = text;
    const title = state.symbol || '';
    g.fillText(title, pad, mid);
    g.font = `${12 * ratio}px system-ui, -apple-system, Segoe UI, sans-serif`;
    g.fillStyle = muted;
    g.fillText(` · ${state.res} · ${String(o.session).toUpperCase()}${o.brand && o.brand.name ? ' · ' + o.brand.name : ''}`,
      pad + g.measureText(title).width + 2 * ratio, mid);
    g.textAlign = 'right';
    g.fillText(`${now.day} ${now.time} ET`, out.width - pad, mid);
    g.drawImage(shot, 0, head);
    const name = `${title || 'chart'}_${state.res}_${now.day}_${now.time.replace(':', '')}.png`;
    const save = href => {
      const a = document.createElement('a');
      a.href = href; a.download = name; a.style.display = 'none';
      root.appendChild(a); a.click(); a.remove();
    };
    if (out.toBlob && global.URL && URL.createObjectURL) {
      out.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        save(url);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/png');
    } else save(out.toDataURL('image/png'));
    return name;
  };
}
