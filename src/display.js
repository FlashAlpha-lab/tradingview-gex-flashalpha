import { COLORS, RES_LABELS } from './constants.js';

/** The chart types of the Settings menu: [value, label]. */
export const CHART_TYPES = [['candles', 'Candles'], ['hollow', 'Hollow candles'], ['bars', 'Bars'], ['line', 'Line'],
  ['area', 'Area'], ['baseline', 'Baseline'], ['heikin', 'Heikin Ashi']];
/** The price scale modes of the Settings menu: [value, label, lightweight-charts PriceScaleMode]. */
export const SCALE_MODES = [['normal', 'Regular', 0], ['log', 'Logarithmic', 1], ['percent', 'Percent', 2], ['indexed', 'Indexed to 100', 3]];
/** The crosshair modes of the Settings menu: [value, label, lightweight-charts CrosshairMode]. */
export const CROSSHAIRS = [['normal', 'Free', 0], ['magnet', 'Magnet (close)', 1], ['magnetOHLC', 'Magnet (OHLC)', 3], ['hidden', 'Hidden', 2]];
/** The Settings menu's chart display, before the reader changes it. */
export const DISPLAY_DEFAULTS = { chartType: 'candles', scaleMode: 'normal', scaleSide: 'right', autoScale: true, invert: false,
  crosshair: 'normal', priceLine: true, priceLabel: true, watermark: false };

const CLEAR = { color: 'transparent', wickColor: 'transparent', borderColor: 'transparent' };
/** Types drawn from the closes; the others draw OHLC bars and become a line while the bars are one sample a minute. */
const LINE_LIKE = ['line', 'area', 'baseline'];
/** The lightweight-charts series of each type drawn over the candles. */
const KIND = { hollow: 'CandlestickSeries', heikin: 'CandlestickSeries', bars: 'BarSeries', area: 'AreaSeries', baseline: 'BaselineSeries' };
const SCALE_IDS = ['right', 'left'];
/** The watermark's colour by theme: the text colour, faint. */
const WATERMARK = { dark: 'rgba(214,217,224,0.07)', light: 'rgba(31,36,48,0.07)' };

/**
 * How the price series is drawn (Settings menu): the chart type, the price scale (mode, side, auto scale, invert), the
 * crosshair, the last price line and label, the watermark.
 * The candles series stays the price series for everything else (the price scale, the levels, the markers, the plugins):
 * with another type it is transparent and a series of that type draws the bars over it (the close line for Line).
 * Rows: { time, open, high, low, close, muted } (muted: drawn in the spot colours, see chart.js draw).
 */
export function createDisplay(view, chart, LW, candles, closeLine) {
  const { root, state } = view;
  const set = state.view;
  let extra = null, extraType = null;   // the series of the picked type (not for Candles and Line) and its type
  let rows = [];                        // the last rows drawn
  let ha = [];                          // Heikin Ashi [time, { open, high, low, close }] in time order (Heikin Ashi only)
  let wm = null, themeName = 'dark';    // the text watermark plugin, the theme it is coloured for
  let lineMode = false;

  /**
   * The type drawn: the pick, a line of closes for an OHLC type while the bars are one sample a minute; Candles when the
   * lightweight-charts given has no series for the pick.
   */
  const drawn = () => {
    const t = KIND[set.chartType] && !LW[KIND[set.chartType]] ? 'candles' : set.chartType;
    return lineMode && !LINE_LIKE.includes(t) ? 'line' : t;
  };
  const side = () => (set.scaleSide === 'left' ? 'left' : 'right');
  const muted = up => (up ? COLORS.spotUp : COLORS.spotDown);

  /** The series for `type`: created on first use, right above the candles; null for Candles and Line (and a missing type). */
  function seriesFor(type) {
    if (extraType === type) return extra;
    if (extra) { try { chart.removeSeries(extra); } catch (e) { /* already gone */ } }
    extra = null; extraType = null;
    const make = opts => (LW[KIND[type]] ? chart.addSeries(LW[KIND[type]], Object.assign({ priceScaleId: side() }, opts)) : null);
    const up = COLORS.up, down = COLORS.down;
    if (type === 'hollow') extra = make({ upColor: 'transparent', downColor: down, borderVisible: true,
      borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
    else if (type === 'heikin') extra = make({ upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down });
    else if (type === 'bars') extra = make({ upColor: up, downColor: down, thinBars: false });
    else if (type === 'area') extra = make({ lineColor: COLORS.line, lineWidth: 2,
      topColor: 'rgba(79,140,255,0.32)', bottomColor: 'rgba(79,140,255,0.02)' });
    else if (type === 'baseline') extra = make({ lineWidth: 2, baseValue: { type: 'price', price: 0 },
      topLineColor: up, topFillColor1: 'rgba(38,166,154,0.28)', topFillColor2: 'rgba(38,166,154,0.04)',
      bottomLineColor: down, bottomFillColor1: 'rgba(239,83,80,0.04)', bottomFillColor2: 'rgba(239,83,80,0.28)' });
    if (extra) {
      extraType = type;
      // Drawn where the candles are: over the plugins' series added before them, under the ones added after.
      if (typeof extra.setSeriesOrder === 'function' && typeof candles.seriesOrder === 'function') extra.setSeriesOrder(candles.seriesOrder() + 1);
    }
    return extra;
  }

  /** Heikin Ashi of one bar from the one before it (null for the first). */
  function haOf(r, prev) {
    const close = (r.open + r.high + r.low + r.close) / 4;
    const open = prev ? (prev.open + prev.close) / 2 : (r.open + r.close) / 2;
    return { open, high: Math.max(r.high, open, close), low: Math.min(r.low, open, close), close };
  }
  /** One row for the series of the drawn type (not the candles). */
  function pointOf(type, r, h) {
    if (LINE_LIKE.includes(type)) return { time: r.time, value: r.close };
    const b = type === 'heikin' ? h : r, up = b.close >= b.open, out = { time: r.time, open: b.open, high: b.high, low: b.low, close: b.close };
    if (!r.muted) return out;
    const c = muted(up);
    if (type === 'bars') return Object.assign(out, { color: c });
    return Object.assign(out, { color: type === 'hollow' && up ? 'transparent' : c, wickColor: c, borderColor: c });
  }
  const candleOf = r => {
    const b = { time: r.time, open: r.open, high: r.high, low: r.low, close: r.close };
    if (drawn() !== 'candles') return Object.assign(b, CLEAR);
    if (!r.muted) return b;
    const c = muted(r.close >= r.open);
    return Object.assign(b, { color: c, wickColor: c });
  };

  /** The last price line and its axis label on the series that is seen, none on the others. */
  function applyMarks() {
    const type = drawn(), main = type === 'candles' ? candles : type === 'line' ? closeLine : extra;
    for (const s of [candles, closeLine, extra]) {
      if (s) s.applyOptions({ lastValueVisible: s === main && set.priceLabel, priceLineVisible: s === main && set.priceLine });
    }
  }

  /** Draws `list` (rows, see above); `flat`: the bars are one sample a minute (chart.js draws a line of closes then). */
  function setData(list, flat) {
    rows = list; lineMode = !!flat;
    const type = drawn();
    const s = type === 'candles' || type === 'line' ? seriesFor(null) : seriesFor(type);
    ha = [];
    if (type === 'heikin') { let prev = null; for (const r of list) { prev = haOf(r, prev); ha.push([r.time, prev]); } }
    applyMarks();
    closeLine.applyOptions({ visible: type === 'line' });
    closeLine.setData(type === 'line' ? list.map(r => ({ time: r.time, value: r.close })) : []);
    candles.setData(list.map(candleOf));
    if (s) s.setData(list.map((r, i) => pointOf(type, r, ha[i] && ha[i][1])));
    if (type === 'baseline' && s && list.length) s.applyOptions({ baseValue: { type: 'price', price: list[0].close } });
    watermark();
  }

  /** One bar of the live lane in place (`old`: an older bar, lightweight-charts' historicalUpdate). Throws like update(). */
  function update(r, old) {
    const type = drawn();
    candles.update(candleOf(r), old);
    if (type === 'line') closeLine.update({ time: r.time, value: r.close }, old);
    if (!extra) return;
    let h = null;
    if (type === 'heikin') {
      let i = ha.length - 1;
      while (i >= 0 && ha[i][0] > r.time) i--;
      const same = i >= 0 && ha[i][0] === r.time, prev = same ? (ha[i - 1] || [])[1] : (ha[i] || [])[1];
      h = haOf(r, prev || null);
      if (same) ha[i] = [r.time, h]; else ha.splice(i + 1, 0, [r.time, h]);
    }
    extra.update(pointOf(type, r, h), old);
  }

  function clear() {
    rows = []; ha = [];
    for (const s of [candles, closeLine, extra]) if (s) s.setData([]);
  }

  /**
   * Moves every series on the price scales (not the overlay scales, e.g. volume) to the picked side, the candles first in
   * each pane: lightweight-charts takes the Percent / Indexed to 100 base from the first series of the scale, so it is the
   * candles' first bar. A series already on that side hops off and back (it then comes after the candles).
   */
  function placeSeries() {
    const to = side();
    for (const pane of chart.panes()) {
      if (typeof pane.getSeries !== 'function') continue;
      const list = pane.getSeries().slice().sort((a, b) => (b === candles) - (a === candles));
      for (const s of list) {
        const id = s.options().priceScaleId;
        if (id != null && !SCALE_IDS.includes(id)) continue;
        if (id === to) s.applyOptions({ priceScaleId: 'fac-hop' });
        s.applyOptions({ priceScaleId: to });
      }
    }
  }

  /** The price pane's scale: mode, auto scale, invert; the other side hidden. */
  function applyScale() {
    const to = side(), mode = (SCALE_MODES.find(x => x[0] === set.scaleMode) || SCALE_MODES[0])[2];
    chart.applyOptions({ rightPriceScale: { visible: to === 'right' }, leftPriceScale: { visible: to === 'left' } });
    chart.priceScale(to, 0).applyOptions({ mode, autoScale: !!set.autoScale, invertScale: !!set.invert });
    placeAxis();
  }
  /** The legend and the brand logo keep clear of a price scale on the left (--fac-axis-left). */
  function placeAxis() {
    const go = () => {
      let w = 0;
      if (side() === 'left') { try { w = chart.priceScale('left', 0).width() || 0; } catch (e) { w = 0; } }
      root.style.setProperty('--fac-axis-left', w + 'px');
    };
    go();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go);   // the scale's width once it is drawn
  }

  /** The symbol and the interval, faint, in the middle of the price pane (Settings, Watermark). */
  function watermark() {
    const make = LW.createTextWatermark;
    if (!set.watermark || typeof make !== 'function') {
      if (wm) { try { wm.detach(); } catch (e) { /* pane gone */ } wm = null; }
      return;
    }
    const color = WATERMARK[themeName] || WATERMARK.dark;
    const lines = [{ text: String(state.symbol || ''), color, fontSize: 56, fontStyle: 'bold' },
      { text: RES_LABELS[state.res] || state.res || '', color, fontSize: 18 }];
    const opts = { horzAlign: 'center', vertAlign: 'center', lines };
    if (wm) wm.applyOptions(opts); else wm = make(chart.panes()[0], opts);
  }

  /** A Settings menu change: `k` one of DISPLAY_DEFAULTS' keys. */
  function apply(k, v) {
    set[k] = v;
    if (k === 'chartType') setData(rows, lineMode);
    else if (k === 'scaleSide') { placeSeries(); applyScale(); }
    else if (k === 'scaleMode') { if (v === 'percent' || v === 'indexed') placeSeries(); applyScale(); }
    else if (k === 'autoScale' || k === 'invert') applyScale();
    else if (k === 'crosshair') chart.applyOptions({ crosshair: { mode: (CROSSHAIRS.find(x => x[0] === v) || CROSSHAIRS[0])[2] } });
    else if (k === 'priceLine' || k === 'priceLabel') applyMarks();
    else if (k === 'watermark') watermark();
  }

  return {
    setData, update, clear, apply, placeAxis, watermark,
    /** The theme changed: the watermark's colour follows. */
    theme(name) { themeName = name; if (wm) watermark(); },
    /** True while the price scale fits the data (dragging the scale turns it off). */
    autoScale() {
      try { const x = chart.priceScale(side(), 0).options(); return x.autoScale !== false; } catch (e) { return !!set.autoScale; }
    },
  };
}
