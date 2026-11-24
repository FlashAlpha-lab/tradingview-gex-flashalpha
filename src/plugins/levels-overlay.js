/**
 * What the core levels draw on the candles' pane besides their lines, as a lightweight-charts series primitive:
 *   - the gamma regime (behind the candles): above the flip tinted green (dealers long gamma, moves tend to dampen), below
 *     it red (short gamma, moves tend to amplify), session by session, no text on the chart; the colours of the
 *     GEX-by-strike chart (@flashalpha-lab/gex-charts)
 *   - the level lines (call wall, put wall, gamma flip): one flat segment per run of the same value, across the bars of
 *     the run and never joined to the next run, so no vertical step between sessions (or where a level moves)
 *   - the session in focus (over the candles, intraday): while the crosshair is on a session, the other sessions are
 *     veiled in the chart's background colour (their candles and levels fade), so that session and its levels stand out
 *   - edge labels (over the candles): a level outside the visible price range is pinned to the top or bottom edge,
 *     "▲ Call wall 8,000.00 (+11.5%)" (its distance from the last close); the levels in `hidden` get none
 * The levels plugin hands it what to draw with set(); it reads the theme at each repaint.
 */

const ZONE = {
  dark: { pos: 'rgba(52,211,153,0.06)', neg: 'rgba(248,113,113,0.06)' },
  light: { pos: 'rgba(5,150,105,0.06)', neg: 'rgba(220,38,38,0.06)' },
};
/** How much of the chart's background covers the sessions out of focus. */
const VEIL_ALPHA = 0.6;
/** Canvas dash per lightweight-charts line style (0 solid, 1 dotted, 2 dashed), in line widths. */
const DASH = { 1: [1, 1], 2: [2, 2] };
const FONT = '600 11px system-ui, -apple-system, Segoe UI, sans-serif';
const CHIP_H = 16, GAP = 4, PAD = 5;

/** Signed distance of `value` from `from` in percent, one decimal ("+4.6%", "−1.8%", "0.0%"); '' without a base. */
export function pct(value, from) {
  if (value == null || !from) return '';
  const d = Math.round((value - from) / from * 1000) / 10;
  return (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d).toFixed(1) + '%';
}

/** Runs of consecutive rows with the same flip: [{ from, to, flip }] (chart times); rows without a flip end a run. */
export function regimeRuns(rows) {
  const out = [];
  let run = null;
  for (const r of rows) {
    if (r.flip == null) { run = null; continue; }
    if (run && run.flip === r.flip) run.to = r.time;
    else out.push(run = { from: r.time, to: r.time, flip: r.flip });
  }
  return out;
}

/** The veil over the sessions out of focus: the background colour (#rgb, #rrggbb, rgb()) at VEIL_ALPHA, else the theme's. */
export function veil(bg, light) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(bg || '');
  const h = hex && (hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1]);
  const rgb = h ? [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
    : (/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(bg || '') || []).slice(1, 4);
  const [r, g, b] = rgb.length === 3 ? rgb : light ? [255, 255, 255] : [15, 17, 21];
  return `rgba(${r}, ${g}, ${b}, ${VEIL_ALPHA})`;
}

/**
 * Runs of consecutive points with the same value and colour: [{ from, to, value, color }] (chart times). A point without
 * a value ends a run, and so does `split(prev, point)` (e.g. a new session).
 */
export function levelRuns(points, split = () => false) {
  const out = [];
  let run = null, prev = null;
  for (const p of points) {
    if (p.value == null) run = null;
    else if (run && run.value === p.value && run.color === p.color && !split(prev, p)) run.to = p.time;
    else out.push(run = { from: p.time, to: p.time, value: p.value, color: p.color });
    prev = p;
  }
  return out;
}

/**
 * The levels outside the visible price range, split by edge: { top: [..], bottom: [..] }, each item { text, color }.
 * `yOf(price)` is the pane coordinate (null when unknown), `height` the pane height.
 */
export function edgeLabels(levels, yOf, height, spot) {
  const top = [], bottom = [];
  for (const l of levels) {
    const y = yOf(l.value);
    if (y == null || (y >= 0 && y <= height)) continue;
    const d = pct(l.value, spot);
    const text = `${y < 0 ? '▲' : '▼'} ${l.title} ${l.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${d ? ` (${d})` : ''}`;
    (y < 0 ? top : bottom).push({ text, color: l.color });
  }
  return { top, bottom };
}

export class LevelsOverlay {
  /** `theme()` → { light, bg, right }: read at each repaint, so a theme change shows at once; right: px kept free at the
   *  pane's right edge (the edge labels end left of it). */
  constructor(theme) {
    this.theme = theme;
    this.data = { runs: [], levels: [], spot: null, lines: [], hidden: [], focus: null };
    this.chart = this.series = this.requestUpdate = null;
    this.views = [
      { zOrder: () => 'bottom', renderer: () => ({ draw: target => this.drawZones(target) }) },
      // the veil before the edge labels: they stay readable
      { zOrder: () => 'top', renderer: () => ({ draw: target => this.drawFocus(target) }) },
      { zOrder: () => 'top', renderer: () => ({ draw: target => this.drawEdges(target) }) },
      { zOrder: () => 'normal', renderer: () => ({ draw: target => this.drawLines(target) }) },
    ];
  }

  /**
   * { runs: regimeRuns(..), levels: [{ id, title, value, color }], spot, lines: [{ from, to, value, color, width, style }],
   * hidden: [level ids without an edge label], focus: { from, to } (the session under the crosshair, the others veiled)
   * or null }; a missing key keeps its value.
   */
  set(data) {
    Object.assign(this.data, data);
    if (this.requestUpdate) this.requestUpdate();
  }

  attached({ chart, series, requestUpdate }) { this.chart = chart; this.series = series; this.requestUpdate = requestUpdate; }
  detached() { this.chart = this.series = this.requestUpdate = null; }
  updateAllViews() {}
  paneViews() { return this.views; }

  edges(height) {
    const levels = this.data.levels.filter(l => !this.data.hidden.includes(l.id));
    return edgeLabels(levels, v => this.series.priceToCoordinate(v), height, this.data.spot);
  }

  /** The pane x span of the bars `from` to `to` (chart times), bar edge to bar edge; null when unknown or out of view. */
  span(from, to, width) {
    const ts = this.chart.timeScale(), half = (ts.options().barSpacing || 6) / 2;
    const x0 = ts.timeToCoordinate(from), x1 = ts.timeToCoordinate(to);
    if (x0 == null || x1 == null || x1 + half < 0 || x0 - half > width) return null;
    return { left: Math.max(0, x0 - half), right: Math.min(width, x1 + half) };
  }

  drawZones(target) {
    if (!this.series || !this.data.runs.length) return;
    target.useMediaCoordinateSpace(({ context: c, mediaSize: { width, height } }) => {
      const ts = this.chart.timeScale(), half = (ts.options().barSpacing || 6) / 2;
      const colors = ZONE[this.theme().light ? 'light' : 'dark'];
      for (const r of this.data.runs) {
        const x0 = ts.timeToCoordinate(r.from), x1 = ts.timeToCoordinate(r.to), y = this.series.priceToCoordinate(r.flip);
        if (x0 == null || x1 == null || y == null || x1 + half < 0 || x0 - half > width) continue;
        const left = Math.max(0, x0 - half), right = Math.min(width, x1 + half), split = Math.max(0, Math.min(height, y));
        c.fillStyle = colors.pos;
        c.fillRect(left, 0, right - left, split);
        c.fillStyle = colors.neg;
        c.fillRect(left, split, right - left, height - split);
      }
    });
  }

  /** The sessions left and right of the one in focus, under a veil of the chart's background. */
  drawFocus(target) {
    const f = this.data.focus;
    if (!this.series || !f) return;
    target.useMediaCoordinateSpace(({ context: c, mediaSize: { width, height } }) => {
      const x = this.span(f.from, f.to, width);
      if (!x) return;
      const t = this.theme();
      c.fillStyle = veil(t.bg, t.light);
      if (x.left > 0) c.fillRect(0, 0, x.left, height);
      if (x.right < width) c.fillRect(x.right, 0, width - x.right, height);
    });
  }

  drawLines(target) {
    if (!this.series || !this.data.lines.length) return;
    target.useMediaCoordinateSpace(({ context: c, mediaSize: { width } }) => {
      for (const l of this.data.lines) {
        const x = this.span(l.from, l.to, width), y = this.series.priceToCoordinate(l.value);
        if (!x || y == null) continue;
        c.strokeStyle = l.color;
        c.lineWidth = l.width;
        c.setLineDash((DASH[l.style] || []).map(n => n * l.width));
        c.beginPath();
        c.moveTo(x.left, y);
        c.lineTo(x.right, y);
        c.stroke();
      }
      c.setLineDash([]);
    });
  }

  drawEdges(target) {
    if (!this.series || !this.data.levels.length) return;
    target.useMediaCoordinateSpace(({ context: c, mediaSize: { width, height } }) => {
      const { top, bottom } = this.edges(height);
      const { bg, right = 0 } = this.theme();
      c.font = FONT;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      // left of what a plugin keeps free at the right edge (right, px), e.g. the GEX profile's panel
      const chip = (l, y) => {
        const w = c.measureText(l.text).width + PAD * 2, x = width - right - w - 6;
        c.globalAlpha = 0.9;
        c.fillStyle = bg;
        c.fillRect(x, y, w, CHIP_H);
        c.globalAlpha = 1;
        c.strokeStyle = l.color;
        c.lineWidth = 1;
        c.strokeRect(x + 0.5, y + 0.5, w - 1, CHIP_H - 1);
        c.fillStyle = l.color;
        c.fillText(l.text, x + PAD, y + CHIP_H / 2);
      };
      top.forEach((l, i) => chip(l, GAP + i * (CHIP_H + GAP)));
      bottom.forEach((l, i) => chip(l, height - GAP - CHIP_H - i * (CHIP_H + GAP)));
    });
  }
}
