import { COLORS, ERRORS, GATE } from '../constants.js';
import { esc } from '../util.js';
import { ICONS } from './layout.js';

/**
 * The blurred picture behind the sign-up box: made-up candles, volume and three level lines (call wall, gamma flip, put
 * wall), so a signed-out reader sees what the chart looks like. Drawn once; no data.
 */
const PREVIEW = (() => {
  const n = 48, w = 600 / n, mid = t => 150 + 38 * Math.sin(t / 7) + 14 * Math.sin(t / 2.3);
  let body = '';
  for (let i = 0; i < n; i++) {
    const o = mid(i), c = mid(i + 1), hi = Math.min(o, c) - 6 - 4 * Math.abs(Math.sin(i * 1.7)), lo = Math.max(o, c) + 6 + 4 * Math.abs(Math.cos(i * 1.3));
    const color = c <= o ? COLORS.up : COLORS.down, x = i * w + w / 2, vol = 18 + 22 * Math.abs(Math.sin(i * 0.9));
    body += `<line x1="${x.toFixed(1)}" y1="${hi.toFixed(1)}" x2="${x.toFixed(1)}" y2="${lo.toFixed(1)}" stroke="${color}" stroke-width="1.5"/>`
      + `<rect x="${(x - w * 0.3).toFixed(1)}" y="${Math.min(o, c).toFixed(1)}" width="${(w * 0.6).toFixed(1)}" height="${Math.max(2, Math.abs(c - o)).toFixed(1)}" fill="${color}"/>`
      + `<rect x="${(x - w * 0.3).toFixed(1)}" y="${(300 - vol).toFixed(1)}" width="${(w * 0.6).toFixed(1)}" height="${vol.toFixed(1)}" fill="${color}" opacity="0.5"/>`;
  }
  const level = (y, color) => `<line x1="0" y1="${y}" x2="600" y2="${y}" stroke="${color}" stroke-width="2" stroke-dasharray="8 6"/>`;
  return `<svg class="fac-gate-bg" viewBox="0 0 600 300" preserveAspectRatio="none" aria-hidden="true" focusable="false">${body}`
    + `${level(96, COLORS.up)}${level(158, COLORS.flip)}${level(212, COLORS.down)}</svg>`;
})();

/**
 * A message over the chart when there is nothing to draw; the host page hears 'flashalpha:nodata' (e.g. to hide the section).
 * A signed-out reader (api_key_required) gets the sign-up box instead of a line of text: the blurred picture, a lock,
 * what a free account shows and a "Sign up free" link (options.signupUrl, in a new tab).
 */
export function createEmptyState(view) {
  const box = view.$('.fac-empty');
  function show(error) {
    const { state } = view;
    state.noData = error;                                         // an unknown symbol is not polled again
    box.classList.remove('fac-loading');
    box.classList.toggle('fac-gate', error === 'api_key_required');
    if (!error) { box.style.display = 'none'; return; }
    if (error === 'api_key_required') {
      box.innerHTML = `${PREVIEW}<div class="fac-gate-box">${ICONS.lock}<p class="fac-gate-ttl">${esc(GATE.title(state.symbol))}</p>`
        + `<p class="fac-gate-txt">${esc(GATE.text)}</p><a class="fac-gate-cta" href="${esc(view.signupHref('gate'))}" target="_blank" `
        + `rel="noopener">${ICONS.key}${esc(GATE.cta)}</a></div>`;
    } else {
      box.textContent = (error === 'unknown_symbol' || error === 'no bars') && state.symbol ? `No chart data for ${state.symbol} yet.`
        : ERRORS[error] || 'Chart data is unavailable right now.';
    }
    box.style.display = 'flex';
    view.container.dispatchEvent(new CustomEvent('flashalpha:nodata', { bubbles: true, detail: { symbol: state.symbol, error } }));
  }
  /** A quiet "Loading SPY…" while a symbol's first window is on its way (nothing drawn yet); show() replaces it. */
  function loading() {
    box.classList.remove('fac-gate');
    box.classList.add('fac-loading');
    box.textContent = view.state.symbol ? `Loading ${view.state.symbol}…` : 'Loading…';
    box.style.display = 'flex';
  }
  return { show, loading };
}
