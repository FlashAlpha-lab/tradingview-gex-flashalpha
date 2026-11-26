import { JSDOM } from 'jsdom';

// A browser-like global scope for the source modules: imported before src/ so src/env.js sees `window`.
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://example.com/page', pretendToBeVisual: true });
const g = globalThis;
g.window = dom.window;
g.document = dom.window.document;
g.CustomEvent = dom.window.CustomEvent;
g.requestAnimationFrame = fn => setTimeout(fn, 0);
export const observers = [];
g.ResizeObserver = class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } };
dom.window.ResizeObserver = g.ResizeObserver;
dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

export const window = dom.window;

/** A stand-in for lightweight-charts 5 that records what the chart asks of it (jsdom has no canvas). */
export function fakeLW() {
  const LW = {
    LineSeries: 'Line', CandlestickSeries: 'Candlestick', HistogramSeries: 'Histogram', BarSeries: 'Bar', AreaSeries: 'Area',
    BaselineSeries: 'Baseline',
    CrosshairMode: { Normal: 0, Magnet: 1, Hidden: 2, MagnetOHLC: 3 }, LineType: { WithSteps: 1 }, LineStyle: { Dotted: 1, Dashed: 2 },
    charts: [],
    watermarks: [],                         // every createTextWatermark(pane, options): { pane, opts, detached }
    createTextWatermark(pane, opts) {
      const wm = { pane, opts, detached: false, applyOptions(x) { this.opts = x; }, detach() { this.detached = true; } };
      LW.watermarks.push(wm);
      return wm;
    },
    markerSets: [],                         // every createSeriesMarkers(series, markers): { series, markers } (setMarkers replaces markers)
    createSeriesMarkers(series, markers) {
      const set = { series, markers, setMarkers(x) { this.markers = x; } };
      LW.markerSets.push(set);
      return set;
    },
    createChart(el, options) {
      const chart = {
        el, options, series: [], applied: [], crosshair: [], removed: false,
        addSeries(type, opts, pane = 0) {
          const s = { type, opts, pane, data: null, applied: [], primitives: [], updates: [], setData(d) { this.data = d; }, applyOptions(x) { this.applied.push(x); },
            options() { return Object.assign({}, this.opts, ...this.applied); },
            attachPrimitive(p) { this.primitives.push(p); },
            priceLines: [],                 // createPriceLine(spec): { options } (applyOptions merges); removePriceLine drops it
            createPriceLine(spec) {
              const l = { options: Object.assign({}, spec), applyOptions(x) { Object.assign(this.options, x); } };
              this.priceLines = this.priceLines.concat(l);
              return l;
            },
            removePriceLine(l) { this.priceLines = this.priceLines.filter(x => x !== l); },
            getPane() { return chart.panes()[pane]; },
            // Like lightweight-charts 5.3: a bar older than the last one only with historicalUpdate, and only one that exists.
            update(b, historical = false) {
              this.updates.push([b, historical]);
              const d = this.data || (this.data = []), last = d.length ? d[d.length - 1].time : -Infinity;
              if (b.time > last) d.push(b);
              else if (b.time === last) d[d.length - 1] = b;
              else if (!historical) throw new Error('Cannot update oldest data');
              else { const i = d.findIndex(x => x.time === b.time); if (i < 0) throw new Error('no bar at ' + b.time); d[i] = b; }
            } };
          chart.series.push(s);
          return s;
        },
        applyOptions(x) { chart.applied.push(x); },
        scales: [],                         // [id, paneIndex, options] for every priceScale(id, pane).applyOptions(options)
        priceScale(id, pane = 0) {
          return { applyOptions(x) { chart.scales.push([id, pane, x]); },
            options: () => Object.assign({ autoScale: true }, ...chart.scales.filter(x => x[0] === id && x[1] === pane).map(x => x[2])) };
        },
        // The price pane (300 px) and one pane (100 px) per pane index a series was added to.
        panes() {
          const n = Math.max(1, ...chart.series.filter(x => !x.removedFrom).map(x => x.pane + 1));
          return Array.from({ length: n }, (_, i) => ({ getHeight: () => i ? 100 : 300, setHeight() {}, paneIndex: () => i,
            getSeries: () => chart.series.filter(x => !x.removedFrom && x.pane === i) }));
        },
        removeSeries(s) { s.removedFrom = true; },
        // One time scale per chart: tests set `logical`, fire `rangeSubs` and read `setLogical` (setVisibleLogicalRange calls).
        ts: {
          logical: null, rangeSubs: [], setLogical: [], fits: 0,
          fitContent() { this.fits++; }, getVisibleLogicalRange() { return this.logical; }, getVisibleRange: () => null,
          setVisibleLogicalRange(r) { this.setLogical.push(r); this.logical = r; }, setVisibleRange() {},
          subscribeVisibleLogicalRangeChange(fn) { this.rangeSubs.push(fn); },
        },
        timeScale() { return chart.ts; },
        subscribeCrosshairMove(fn) { chart.crosshair.push(fn); },
        remove() { chart.removed = true; },
      };
      LW.charts.push(chart);
      return chart;
    },
  };
  return LW;
}

/** Bars and exposure rows for one RTH session (2026-11-13, EST) at 5m; the last two buckets only as spot rows. */
export function sessionData() {
  const bars = [], exposure = [];
  for (let m = 14 * 60 + 30, i = 0; m < 21 * 60; m += 5, i++) {
    const ts = new Date(Date.parse('2026-11-13T00:00:00Z') + m * 60e3).toISOString();
    const o = 5000 + i, c = 5000 + i + (i % 2 ? -0.5 : 0.5);
    if (m < 20 * 60 + 50) bars.push({ ts, open: o, high: Math.max(o, c) + 1, low: Math.min(o, c) - 1, close: c, volume: 1000 + i });
    exposure.push({ ts, call_wall: 5050, put_wall: 4950, max_pain: 5000,
      gamma_flip: { last: 4990, status: m < 15 * 60 ? 'unverified' : 'available' },
      spot: { first: o, min: o - 1, max: o + 1, last: c } });
  }
  return { bars, exposure };
}

/** A data source over sessionData(); `cfg` sets the plan, errors, gated layers. Records every call. */
export function fakeSource(cfg = {}) {
  const d = sessionData();
  const calls = [];
  return {
    calls,
    symbols: () => [{ symbol: 'SPX', last_bar: '2026-11-13T20:45:00Z' }],
    bars: (s, res, from, to, session) => { calls.push({ fn: 'bars', s, res, session }); return cfg.barsError ? { error: cfg.barsError } : { bars: d.bars }; },
    charts: (s, res, from, to, q) => {
      calls.push({ fn: 'charts', s, res, q });
      const out = { exposure: q.layers.includes('exposure') ? d.exposure : undefined, layers: {} };
      if ('plan' in cfg) out.plan = cfg.plan;
      // cfg.gated: API layers the plan does not include (status "gated", no data), like the chart API
      for (const l of cfg.gated || []) if (q.layers.includes(l)) { out.layers[l] = { status: 'gated' }; out[l] = l === 'exposure' ? [] : undefined; }
      return out;
    },
  };
}

/**
 * Hourly bars and exposure rows around the clock from `days` days ago up to `lagHours` hours ago, answered for the window
 * asked (from <= ts <= to); symbols() gives first_bar. The walls move by one each day. `now(ms)` moves the newest bar.
 */
export function hourlySource({ days = 6, lagHours = 0 } = {}) {
  const H = 3600e3;
  let end = Math.floor(Date.now() / H) * H - lagHours * H;
  const start = end - days * 24 * H;
  const calls = [];
  const etDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
  const dayNo = t => Math.round(Date.parse(etDay.format(t)) / 86400e3);
  const rows = () => {
    const out = [];
    for (let t = start, i = 0; t <= end; t += H, i++) out.push({ t, i, day: dayNo(t) - dayNo(start) });   // day: ET days since start
    return out;
  };
  const inWin = (from, to) => rows().filter(r => r.t >= Date.parse(from) && r.t <= Date.parse(to));
  return {
    calls,
    first: new Date(start).toISOString(),
    now(ms) { end = Math.floor(ms / H) * H; },
    symbols: () => [{ symbol: 'SPX', first_bar: new Date(start).toISOString(), last_bar: new Date(end).toISOString() }],
    bars(s, res, from, to, session) {
      calls.push({ fn: 'bars', res, from, to });
      return { bars: inWin(from, to).map(r => ({ ts: new Date(r.t).toISOString(), open: 5000 + r.i, high: 5001 + r.i, low: 4999 + r.i, close: 5000.5 + r.i, volume: 100 })) };
    },
    charts(s, res, from, to, q) {
      calls.push({ fn: 'charts', res, from, to, q });
      return { layers: {}, exposure: inWin(from, to).map(r => ({ ts: new Date(r.t).toISOString(), call_wall: 5050 + r.day, put_wall: 4950 - r.day,
        max_pain: 5000, gamma_flip: { last: 4990 + r.day, status: 'available' }, spot: { first: 5000 + r.i, min: 4999 + r.i, max: 5001 + r.i, last: 5000.5 + r.i } })) };
    },
  };
}

export const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

export function host() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

/** ET-as-UTC chart time of a UTC ISO time in November (EST, UTC-5). */
export const chartTime = iso => Date.parse(iso) / 1000 - 5 * 3600;
