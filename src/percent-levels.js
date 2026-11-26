/**
 * The level lines (ctx.level) on a Percent or Indexed to 100 price scale.
 * lightweight-charts measures every series on such a scale from that series' own first visible value: the candles from
 * their first close, a call wall line from its own first wall. A level would then sit, and be labelled, off the candles'
 * scale ("Call wall 0.00%"). While one of those modes is on, a level series draws nothing itself; for it the candles get
 * a price line at its latest value (same title, colour and style, labelled like the candles' scale) and a primitive on
 * the candles draws its line at the candles' coordinates. Normal and log scales leave the series as they are.
 */

/**
 * What a level series stops drawing while the scale is in percent: its line, price line, axis label and title (the title
 * shows in the pane even without the axis label).
 */
const OFF = { lineVisible: false, priceLineVisible: false, lastValueVisible: false, title: '' };
const KEYS = Object.keys(OFF);
/** Canvas dash per lightweight-charts LineStyle (solid, dotted, dashed, large dashed, sparse dotted), in line widths. */
const DASH = [[], [1, 1], [2, 2], [6, 6], [1, 4]];

export function createPercentLevels(chart) {
  const list = [];                        // { s, real, want, data, line }
  let candles = null, on = false, update = null, attached = false;

  /** The candles' price line for level `e`, made, changed or removed to match the series. */
  function sync(e) {
    if (!candles) return;
    const o = e.s.options();
    let last = null;
    if (on && o.visible !== false) for (let i = e.data.length - 1; i >= 0; i--) if (e.data[i] && e.data[i].value != null) { last = e.data[i]; break; }
    if (!last || !(e.want.priceLineVisible || e.want.lastValueVisible)) {
      if (e.line) { candles.removePriceLine(e.line); e.line = null; }
    } else {
      const spec = { price: last.value, color: o.priceLineColor || o.color, lineWidth: o.priceLineWidth || 1,
        lineStyle: o.priceLineStyle ?? 1, lineVisible: !!e.want.priceLineVisible, axisLabelVisible: !!e.want.lastValueVisible,
        title: e.want.title || '' };
      if (e.line) e.line.applyOptions(spec); else e.line = candles.createPriceLine(spec);
    }
    if (update) update();
  }

  /** The level lines a series with its line on would draw: steps through its points, a gap where a point has no value. */
  const renderer = {
    draw(target) {
      if (!on || !candles) return;
      const ts = chart.timeScale();
      target.useBitmapCoordinateSpace(({ context: c, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
        for (const e of list) {
          const o = e.s.options();
          if (!e.want.lineVisible || o.visible === false) continue;
          const w = Math.max(1, Math.round((o.lineWidth || 1) * hr));
          c.lineWidth = w;
          c.setLineDash((DASH[o.lineStyle] || []).map(x => x * w));
          let prev = null;
          for (const p of e.data) {
            const x = p ? ts.timeToCoordinate(p.time) : null;
            const y = p && p.value != null ? candles.priceToCoordinate(p.value) : null;
            if (x == null || y == null) { prev = null; continue; }
            if (prev) {
              c.strokeStyle = prev.color;
              c.beginPath();
              c.moveTo(prev.x * hr, prev.y * vr);
              c.lineTo(x * hr, prev.y * vr);
              c.lineTo(x * hr, y * vr);
              c.stroke();
            }
            prev = { x, y, color: p.color || o.color };
          }
        }
        c.setLineDash([]);
      });
    },
  };
  const primitive = {
    attached(p) { update = p.requestUpdate; },
    detached() { update = null; },
    paneViews: () => [{ zOrder: () => 'normal', renderer: () => renderer }],
  };

  return {
    /** The candles series, once it exists: the primitive draws on it (attached the first time a percent scale is on). */
    setCandles(s) { candles = s; },
    /**
     * Follows a level series: its options and data go through here, so the scale mode can turn its own drawing off and on
     * while the series' style (plot style, titles, latest-session rule) keeps what the chart and the plugins set.
     */
    track(s, opts) {
      const real = s.applyOptions.bind(s), set = s.setData.bind(s);
      const e = { s, real, data: [], line: null,
        want: Object.fromEntries(KEYS.map(k => [k, k === 'title' ? opts.title || '' : opts[k] !== false])) };
      s.applyOptions = x => {
        const v = Object.assign({}, x || {});
        for (const k of KEYS) if (k in v) e.want[k] = v[k];
        real(on ? Object.assign(v, OFF) : v);
        sync(e);
      };
      s.setData = d => { e.data = d || []; set(d); sync(e); };
      list.push(e);
      if (on) real(OFF);
      return s;
    },
    /** True for Percent or Indexed to 100 on the price scale. */
    setMode(percent) {
      percent = !!percent;
      if (percent === on) return;
      on = percent;
      if (on && !attached && candles && typeof candles.attachPrimitive === 'function') { attached = true; candles.attachPrimitive(primitive); }
      for (const e of list) { e.real(on ? OFF : Object.assign({}, e.want)); sync(e); }
    },
    get on() { return on; },
  };
}
