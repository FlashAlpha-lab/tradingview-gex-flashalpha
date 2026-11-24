import { esc } from '../util.js';

/** options.brand {logo, href, name}: the logo, a link to href, at the bottom left of the price pane instead of the TradingView logo. */
export function brandLink(o) {
  return o.brand ? `<a class="fac-brand" href="${esc(o.brand.href)}" target="_blank" rel="noopener" title="${esc(o.brand.name)}"><img src="${esc(o.brand.logo)}" alt="">${o.brand.name ? `<span>${esc(o.brand.name)}</span>` : ''}</a>` : '';
}

/**
 * The line under the chart when a brand replaces the TradingView logo: options.note and a "Charts by TradingView" text link
 * (the Lightweight Charts license asks for one).
 */
export function creditLine(o) {
  return o.brand ? `<div class="fac-credit"><span></span>${o.note && o.exposure ? `<span class="fac-note" title="${esc(o.note)}">${esc(o.note)}</span>` : ''}<a href="https://www.tradingview.com/" target="_blank" rel="noopener">Charts by TradingView</a></div>` : '';
}

/** Keeps the brand logo at the bottom left of the price pane, above the volume and any plugin panes. */
export function placeBrand(el, chart) {
  if (!el) return;
  requestAnimationFrame(() => {
    const ph = chart.panes()[0].getHeight();
    if (ph > 0) { el.style.top = Math.max(0, ph - 26) + 'px'; el.style.bottom = 'auto'; }
  });
}
