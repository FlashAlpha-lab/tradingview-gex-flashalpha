import { brandLink, creditLine } from './brand.js';
import { CROSSHAIRS, SCALE_MODES } from '../display.js';

const svg = path => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
/** Toolbar icons (inline SVG, drawn in the text colour). */
export const ICONS = {
  search: svg('<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  fullscreen: svg('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  exitFullscreen: svg('<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  key: svg('<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16.5 6.5 19 9M14.5 8.5 16.5 10.5"/>'),
  eye: svg('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="m4 4 16 16"/>'),
  trash: svg('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  chevron: svg('<path d="m6 14 6-6 6 6"/>'),
};
/** Chart type icons (the chart type menu, like TradingView's). */
export const TYPE_ICONS = {
  candles: svg('<path d="M8 3v18M16 5v14"/><rect x="5.5" y="7" width="5" height="9" rx=".5" fill="currentColor"/><rect x="13.5" y="9" width="5" height="6" rx=".5" fill="currentColor"/>'),
  hollow: svg('<path d="M8 3v4M8 16v5M16 5v4M16 15v4"/><rect x="5.5" y="7" width="5" height="9" rx=".5"/><rect x="13.5" y="9" width="5" height="6" rx=".5"/>'),
  bars: svg('<path d="M8 4v16M5 8h3M8 16h3M16 6v13M13 10h3M16 15h3"/>'),
  line: svg('<path d="m3 17 5-6 4 3 8-9"/>'),
  area: svg('<path d="m3 17 5-6 4 3 8-9v15H3z" fill="currentColor" fill-opacity=".25" stroke="none"/><path d="m3 17 5-6 4 3 8-9"/>'),
  baseline: svg('<path d="M3 12h18" stroke-dasharray="2 2"/><path d="m3 15 4-6 4 5 4-8 6 9"/>'),
  heikin: svg('<path d="M6 4v16M12 3v15M18 7v13"/><rect x="4" y="7" width="4" height="8" rx=".5" fill="currentColor"/><rect x="10" y="5" width="4" height="9" rx=".5" fill="currentColor"/><rect x="16" y="9" width="4" height="7" rx=".5"/>'),
};

const options = list => list.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

/**
 * The chart's markup, laid out like a TradingView chart: the top toolbar (symbol search, interval, chart type and Indicators
 * on the left; Settings, Fullscreen, screenshot, Live / delayed and Sign up / the plan on the right), the chart body with the
 * legend, the empty-state cover and the Upgrade box, the time bar (ranges; session, ET clock and the price scale's % log
 * auto on the right); the top and the time bar follow
 * options.controls. The indicator Settings dialog covers the chart when open. Then the credit line (options.brand).
 */
export function createLayout(o) {
  const root = document.createElement('div');
  root.className = 'fac';
  root.innerHTML = `${o.controls ? `<div class="fac-bar">
        ${o.symbolButtons ? `<div class="fac-menu fac-dd" data-g="symbols"><button type="button" class="fac-dd-btn" aria-haspopup="listbox" aria-expanded="false" title="Symbol search">${ICONS.search}<b class="fac-dd-val"></b></button>
          <div class="fac-panel fac-sym-panel"><input type="search" class="fac-search" placeholder="Search symbol" aria-label="Search symbol" autocomplete="off" spellcheck="false">
          <div class="fac-list" role="listbox" aria-label="Symbols"></div></div></div>` : ''}
        <div class="fac-menu fac-dd" data-g="res"><button type="button" class="fac-dd-btn" aria-haspopup="listbox" aria-expanded="false" title="Interval"><span class="fac-dd-val"></span> ▾</button>
          <div class="fac-panel"><div class="fac-list" role="listbox" aria-label="Interval"></div></div></div>
        <div class="fac-menu fac-dd fac-type" data-g="type"><button type="button" class="fac-dd-btn" aria-haspopup="listbox" aria-expanded="false" title="Chart type" aria-label="Chart type"><span class="fac-dd-val"></span></button>
          <div class="fac-panel"><div class="fac-list" role="listbox" aria-label="Chart type"></div></div></div>
        ${o.exposure ? '<div class="fac-menu fac-ind-menu"><button type="button" aria-haspopup="true" aria-expanded="false" title="Indicators"><i class="fac-fx">ƒx</i> Indicators ▾</button><div class="fac-panel"><div class="fac-ind-list"></div><div class="fac-more"></div></div></div>' : ''}
        <span class="fac-spacer"></span><span class="fac-status"></span>
        <div class="fac-right">
          ${o.layoutMenu ? '<div class="fac-menu fac-layouts"><button type="button" class="fac-icon" aria-haspopup="true" aria-expanded="false" title="Layout" aria-label="Layout"></button><div class="fac-panel"></div></div>' : ''}
          <div class="fac-menu fac-settings"><button type="button" class="fac-icon" aria-haspopup="true" aria-expanded="false" title="Settings" aria-label="Settings">${ICONS.settings}</button>
            <div class="fac-panel"><div class="fac-ttl">Settings</div>
              <div class="fac-sec">Appearance</div>
              <label class="fac-field"><span>Theme</span><select data-s="theme"><option value="dark">Dark</option><option value="light">Light</option><option value="auto">Auto (system)</option></select></label>
              <label><input type="checkbox" data-s="grid"> Grid lines</label>
              <label><input type="checkbox" data-s="watermark"> Watermark</label>
              <div class="fac-sec">Scales</div>
              <label class="fac-field"><span>Price scale</span><select data-s="scaleMode">${options(SCALE_MODES)}</select></label>
              <label class="fac-field"><span>Scale placement</span><select data-s="scaleSide"><option value="right">Right</option><option value="left">Left</option></select></label>
              <label><input type="checkbox" data-s="autoScale"> Auto scale</label>
              <label><input type="checkbox" data-s="invert"> Invert scale</label>
              <label><input type="checkbox" data-s="priceLabel"> Price label</label>
              <label><input type="checkbox" data-s="priceLine"> Last price line</label>
              <div class="fac-sec">Crosshair</div>
              <label class="fac-field"><span>Mode</span><select data-s="crosshair">${options(CROSSHAIRS)}</select></label>
              <div class="fac-sec">Status line</div>
              <label><input type="checkbox" data-s="legend"> Legend</label>
              <label><input type="checkbox" data-s="volume"> Volume</label></div></div>
          <button type="button" class="fac-icon" data-a="fullscreen" title="Fullscreen" aria-label="Fullscreen">${ICONS.fullscreen}</button>
          <button type="button" class="fac-icon" data-a="screenshot" title="Take a screenshot" aria-label="Take a screenshot">${ICONS.camera}</button>
          <span class="fac-feed" hidden></span>
          ${o.account ? '<a class="fac-account" target="_blank" rel="noopener" hidden></a>' : ''}
        </div></div>` : ''}
      <div class="fac-body"><div class="fac-canvas"></div><div class="fac-legend"></div><div class="fac-pane-lgs"></div><div class="fac-empty"></div>
        <div class="fac-upsell" hidden></div>${brandLink(o)}</div>
      ${o.controls ? `<div class="fac-timebar"><div class="fac-group" data-g="range"></div><span class="fac-spacer"></span>
        <div class="fac-group" data-g="session"></div><span class="fac-clock" title="US Eastern time"></span>
        <div class="fac-group fac-scale-btns" data-g="scale"></div></div>` : ''}
      ${creditLine(o)}
      ${o.controls && o.exposure ? '<div class="fac-dialog" hidden></div>' : ''}`;
  return root;
}
