import { COLORS, DEFAULT_DAYS, INTRADAY, LINE_STYLES, MAX_DAYS, NARROW, NOTE, RES_SECONDS, KEY_ERRORS, SIGNUP_URL, STORAGE_KEY, TINY, UPGRADE_URL } from './constants.js';
import { global } from './env.js';
import { injectCss } from './css.js';
import { dayOf, etTime, fmtClock, fmtDay, fmtTime, sessionOf } from './time.js';
import { big, esc, floorIndex, num } from './util.js';
import { chartEngineSource } from './source.js';
import { getLicenseKey, planRank, upgradeHref } from './plans.js';
import { activePlugins } from './registry.js';
import { createTheme } from './theme.js';
import { createLayout } from './components/layout.js';
import { placeBrand } from './components/brand.js';
import { createToolbar } from './components/toolbar.js';
import { createLegend } from './components/legend.js';
import { createUpsell } from './components/upsell.js';
import { createEmptyState } from './components/empty-state.js';
import { createScreenshot } from './components/screenshot.js';
import { createIndicators } from './components/indicators.js';
import { levelsPlugin } from './plugins/levels.js';
import { bucketOf, createLive, foldBars, foldLevels, liveUrl, percentile } from './live.js';

/**
 * Indicators (the Indicators menu), in the order their first layer comes. A layer belongs to the indicator its plugin
 * names for it (`indicators: { layerId: name }`), else to the plugin's `indicator`, else to an indicator of the plugin's
 * own (named `name`, else its first layer's label). So one plugin can fill several indicators, and several plugins one.
 * Each indicator has its layers, its plots (lines whose style the Settings dialog sets; a plot follows its layer), the
 * plugins with a layer in it, a box for option controls, `statusOff`: its layers whose values are left out of the
 * legend (Style tab, "Values in status line"), and `hidden`: turned off with the legend's 👁, its line kept to show it
 * again. `homes` maps each plugin to its own indicator (`indicator`, else the one of its first layer): where its controls
 * go unless it names another.
 */
function buildIndicators(plugins) {
  const groups = [];
  const groupOf = name => {
    let g = groups.find(x => x.name === name);
    if (!g) {
      g = { id: 'ind' + groups.length, name, layers: [], plots: [], plugins: [], statusOff: new Set(), hidden: false, lastOn: null,
        inputs: typeof document !== 'undefined' ? document.createElement('div') : null };
      groups.push(g);
    }
    return g;
  };
  const homes = new Map();
  for (const p of plugins) {
    const own = String(p.indicator || p.name || (p.layers[0] && p.layers[0][1]) || 'Indicator');
    const of = id => String((p.indicators && p.indicators[id]) || own);
    for (const l of p.layers) {
      const g = groupOf(of(l[0]));
      g.layers.push(l);
      if (!g.plugins.includes(p)) g.plugins.push(p);
    }
    const home = groupOf(p.indicator || !p.layers.length ? own : of(p.layers[0][0]));
    if (!home.plugins.includes(p)) home.plugins.push(p);
    homes.set(p, home);
    for (const pl of p.plots || []) groupOf(pl.layer ? of(pl.layer) : home.name).plots.push(pl);
  }
  return { groups, homes };
}

/** A plot's style: these, then what its plugin declares (color and any of these keys), then options.styles[id]. */
const PLOT_DEFAULTS = { lineWidth: 1, lineStyle: 'solid', visible: true, priceLine: true, axisLabel: true };

/**
 * Mounts one chart in `container` and returns its methods. The chart fills the container and follows its size.
 * See README.md for the options and docs/plugins.md for layer plugins. mount() (group.js) puts one to four of these in a
 * chart group; `hooks` is how the group follows them:
 *   frame()            the element menus fit in and fullscreen fills (default: this chart)
 *   symbol(x, api)     the symbol changed (the group moves every chart to it)
 *   theme(t, api)      the theme changed (the group applies it to every chart)
 *   changed(api)       the interval, range, session or layers changed (the group remembers them)
 *   hidden()           true while the group hides this chart: no refresh
 */
export function mountChart(container, options, hooks = {}) {
  const LW = (options && options.lightweightCharts) || global.LightweightCharts;
  if (!LW) throw new Error('FlashAlphaChart needs lightweight-charts 5 (global LightweightCharts or options.lightweightCharts)');
  if (!options || options.injectCss !== false) injectCss();
  const plugins = activePlugins();
  const o = Object.assign({
    // No layer by default: price and volume only, until the reader turns indicators on (remembered, see `storage`).
    symbol: null, resolution: '5m', days: null, session: 'rth', layers: [],
    controls: true, symbolButtons: true, exposure: true, source: null, baseUrl: '', apiKey: null, refresh: 60, background: null,
    brand: null, theme: 'dark', upgradeUrl: UPGRADE_URL, signupUrl: SIGNUP_URL, account: true, debug: false, note: NOTE,
    styles: null, storage: true, storageKey: STORAGE_KEY, upsell: false, live: false,
  }, options || {});
  const { groups, homes } = buildIndicators(plugins);
  const plotDefs = new Map(groups.flatMap(g => g.plots.map(p => [p.id, p])));
  const defaultStyle = id => {
    const p = plotDefs.get(id) || {};
    const own = Object.fromEntries(Object.keys(PLOT_DEFAULTS).filter(k => p[k] != null).map(k => [k, p[k]]));
    return Object.assign({}, PLOT_DEFAULTS, { color: p.color || '#4f8cff' }, own, (o.styles && o.styles[id]) || null);
  };
  /** The current style of every plot (indicator Settings, Style tab). */
  const styles = Object.fromEntries([...plotDefs.keys()].map(id => [id, defaultStyle(id)]));
  if (!o.apiKey) o.apiKey = getLicenseKey();
  const source = o.source || chartEngineSource(o.baseUrl, o.apiKey);
  const layerList = plugins.flatMap(p => p.layers);
  const layerPlan = Object.assign({}, ...plugins.map(p => p.plans || {}));
  /**
   * The layers the reader picked last time (localStorage, `storageKey`), over options.layers; ids no plugin registers now
   * are dropped. null: nothing stored, storage off or unavailable (private mode, blocked site data).
   */
  const store = o.storage === false ? null : String(o.storageKey || STORAGE_KEY);
  function storedLayers() {
    if (!store) return null;
    try {
      const v = JSON.parse(global.localStorage.getItem(store));
      return Array.isArray(v) ? v.filter(k => layerList.some(([id]) => id === k)) : null;
    } catch (e) { return null; }
  }
  function storeLayers(list) {
    if (!store) return;
    try { global.localStorage.setItem(store, JSON.stringify(list)); } catch (e) { /* storage unavailable: not remembered */ }
  }
  const stored = storedLayers();
  const state = { symbol: o.symbol, res: o.resolution, days: o.days || DEFAULT_DAYS[o.resolution] || 5, symbols: [], loading: 0,
    layers: new Set(o.exposure ? stored || o.layers : []), picked: !!stored, noData: null, plan: null, answered: false,
    feed: null,                             // the live lane's {mode: 'live' | 'delayed', delay} (welcome); kept after it closes
    noKey: !o.source && !o.apiKey,          // locks like the free plan until a key's plan comes back (see lockedPlan)
    right: 0,                               // px a plugin keeps free at the price pane's right edge (ctx.reserveRight)
    view: { volume: true, grid: true, legend: true } };     // view: the Settings menu
  /** What the last load drew: bars, the exposure rows on bar times (by time too), and notes for the legend. */
  const data = { bars: [], byTime: new Map(), exposure: [], gexByTime: new Map(), notes: [] };
  const query = {};                       // extra charts() parameters, set by plugins
  const intraday = () => INTRADAY.includes(state.res);
  /**
   * True when the key's plan (known after the first charts() answer) is below `plan`. Without a key (the FlashAlpha chart
   * API with no key, or an answer that the key is missing or not valid) the reader is locked like the free plan. A data
   * source of your own that sends no plan locks nothing.
   */
  const lockedPlan = plan => {
    const mine = state.plan != null ? state.plan : state.noKey ? 'free' : null;
    return mine != null && planRank(mine) < planRank(plan);
  };
  const locked = layer => lockedPlan(layerPlan[layer] || 'free');
  /** A layer is on when it is picked and the plan includes it. */
  const active = layer => state.layers.has(layer) && !locked(layer);
  /** A layer of an indicator hidden with the legend's 👁: still on and loaded (so it shows again at once), not drawn. */
  const hiddenLayer = layer => active(layer) && groups.some(g => g.hidden && g.layers.some(([k]) => k === layer));
  /** True while the plugins name the API layers they need: a hidden layer's data keeps coming. */
  let asking = false;
  /** A layer is drawn when it is on and not hidden; it is requested when it is on. */
  const on = layer => active(layer) && (asking || !hiddenLayer(layer));

  const root = createLayout(o);
  container.appendChild(root);
  /** Parts a chart group shows in its own bars for the chart in focus (toolbar, time bar, credit): $ finds them there too. */
  let outside = [];
  const $ = sel => root.querySelector(sel)
    || outside.map(el => el.matches(sel) ? el : el.querySelector(sel)).find(Boolean) || null;
  const status = text => { const s = $('.fac-status'); if (s) s.textContent = o.debug ? text : ''; };
  /** What the components share. */
  const view = { container, root, $, o, state, data, layerList, layerPlan, locked, on, active, intraday,
    frame: () => (hooks.frame && hooks.frame()) || root,
    upgradeHref: what => upgradeHref(o.upgradeUrl, what), signupHref: (what = 'toolbar') => upgradeHref(o.signupUrl, what, 'signup'),
    call, api: null, applySetting: null, screenshot: null, closeMenus: () => {},
    groups, styles, defaultStyle, corePlugin: levelsPlugin,
    /** An indicator is on when one of its layers is on (drawn, or hidden with the legend's 👁). */
    groupOn: g => g.layers.some(([k]) => active(k)),
    /** Turns an indicator's layers off (remembering which were on) or back on (those, else its defaults, else the first). */
    setGroup(g, wanted) {
      const mine = g.layers.map(([k]) => k), open = mine.filter(k => !locked(k));
      const rest = [...state.layers].filter(k => !mine.includes(k));
      if (!wanted) { g.lastOn = mine.filter(k => state.layers.has(k)); return view.api.setLayers(rest); }
      const defaults = g.plugins.flatMap(p => p.defaults || []).filter(k => open.includes(k));
      const back = (g.lastOn && g.lastOn.length ? g.lastOn : defaults.length ? defaults : open.slice(0, 1));
      return view.api.setLayers(rest.concat(back));
    },
    /** Sets a plot's style and applies it (quiet: the caller redraws once after several). */
    setStyle(id, patch, quiet) {
      if (!styles[id]) return;
      Object.assign(styles[id], patch);
      applyPlotStyle(id);
      if (!quiet) view.redraw();
    },
    /** Plugins redraw their series (colours per point) and the legend follows the new style. */
    redraw() { if (raw.bars.length) call('draw', raw.charts); legend.render(null, null); },
    /** `name` on the handles of these plugins only. */
    callFor(list, name, ...args) {
      const out = [];
      for (const { plugin, h } of handles) {
        if (!list.includes(plugin) || typeof h[name] !== 'function') continue;
        try { out.push(h[name](...args)); } catch (e) { if (global.console) console.error('[flashalpha-chart] layer plugin', e); }
      }
      return out;
    },
    indicators: null };
  const toolbar = createToolbar(view);
  view.indicators = createIndicators(view);

  const chart = LW.createChart($('.fac-canvas'), {
    autoSize: true,
    layout: { background: { color: 'transparent' }, attributionLogo: !o.brand },
    crosshair: { mode: LW.CrosshairMode.Normal },
    timeScale: { timeVisible: true, secondsVisible: false,
      tickMarkFormatter: (t, type) => (type <= 2 ? fmtDay : fmtClock).format(new Date(t * 1000)) },
    localization: { timeFormatter: t => intraday() ? fmtTime.format(new Date(t * 1000)) + ' ET' : fmtDay.format(new Date(t * 1000)) },
  });
  const theme = createTheme(root, chart, o);
  // A level line: a step line through the day and a dotted line at its latest value. On a phone, and while a plugin draws
  // over the right edge of the price pane (reserveRight, e.g. the GEX profile's panel), the axis label keeps the colour and
  // drops the title: the title sits in the pane, over what the plugin draws there.
  // Levels do not drive the price scale (it fits the candles): a far wall is off screen, its value stays in the legend, and
  // dragging the price axis brings it in.
  const levels = [];
  const titlesOff = () => !!state.tiny || state.right > 0;
  const applyTitles = () => { for (const [x, title] of levels) x.applyOptions({ title: titlesOff() ? '' : title }); };
  /** A level line; with plotId its colour, width, style and visibility follow the plot's style (bindPlot). */
  const level = (color, title, plotId) => {
    const x = chart.addSeries(LW.LineSeries, { color, title: titlesOff() ? '' : title, lineWidth: 1, lineType: LW.LineType.WithSteps,
      priceLineVisible: true, priceLineStyle: LW.LineStyle.Dotted, priceLineWidth: 1, priceLineColor: color,
      lastValueVisible: true, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null });
    levels.push([x, title]);
    if (plotId) bindPlot(plotId, x);
    return x;
  };
  /** Series drawn for each plot id: the indicator Settings restyle them. */
  const bound = new Map();
  function applyPlotStyle(id) {
    const st = styles[id];
    if (!st) return;
    for (const x of bound.get(id) || []) x.applyOptions({ color: st.color, lineWidth: st.lineWidth,
      lineStyle: LINE_STYLES[st.lineStyle] != null ? LINE_STYLES[st.lineStyle] : 0, visible: st.visible,
      priceLineVisible: st.priceLine, priceLineColor: st.color, lastValueVisible: st.axisLabel });
  }
  /** Ties a series a plugin added to one of its plots (declared in plugin.plots), and applies the plot's style. */
  function bindPlot(id, series) {
    if (!styles[id] || !series) return series;
    bound.set(id, (bound.get(id) || []).concat(series));
    applyPlotStyle(id);
    return series;
  }

  let candles = null, started = false, destroyed = false;
  const ctx = {
    LW, chart, root, options: o, colors: COLORS, level, intraday, on, lockedPlan, upgradeHref: view.upgradeHref,
    /** True for a layer that is on but hidden with the legend's 👁 (on() is false for it): e.g. keep its pane, empty. */
    hidden: hiddenLayer,
    get plan() { return state.plan; },
    get candles() { return candles; },
    get bars() { return data.bars; },
    /** The exposure rows of the last load on bar times, each with its chart `time`. */
    get exposure() { return data.exposure; },
    get symbol() { return state.symbol; },
    get resolution() { return state.res; },
    get query() { return Object.assign({}, query); },
    setQuery(x) { Object.assign(query, x); return started ? load() : Promise.resolve(); },
    addControl: toolbar.addControl,
    bindPlot,
    /** A plot's current style: { color, lineWidth, lineStyle, visible, priceLine, axisLabel }. */
    styleOf: id => styles[id] || defaultStyle(id),
    note(text) { data.notes.push(text); },
    /**
     * Keeps `px` free at the right edge of the price pane for what a plugin draws there (0: gives it back): the room right
     * of the latest bar (rightOffsetPixels; setting it scrolls to the latest bar, so only on a change), the level lines
     * without their titles (their axis labels stay) and the edge labels left of it.
     */
    reserveRight(px) {
      px = Math.max(0, Math.round(px || 0));
      if (px === state.right) return;
      state.right = px;
      chart.timeScale().applyOptions({ rightOffsetPixels: px });
      applyTitles();
    },
    /** The width reserveRight keeps free (0 for none). */
    get reservedRight() { return state.right; },
    /** Draws again from the last answer, no request: every plugin's draw(), then the legend. */
    redraw: () => view.redraw(),
    util: { etTime, dayOf, sessionOf, floorIndex, esc, num, big, RES_SECONDS },
  };
  // Plugins attach before the candles exist, so the series they add are drawn behind them. Each gets the context with
  // addControl putting its options into its own indicator's Settings, or into the indicator it names. apiLayers gets the
  // same context as attach, so a plugin can keep its state by context (e.g. a WeakMap) and read it there.
  const handles = plugins.map(p => {
    const home = homes.get(p);
    const pctx = Object.create(ctx);
    pctx.addControl = (el, where, indicator) => toolbar.addControl(el, where,
      (indicator && groups.find(x => x.name === indicator)) || home);
    return { plugin: p, pctx, h: p.attach(pctx) || {} };
  });
  function call(name, ...args) {
    const out = [];
    for (const { h } of handles) {
      if (typeof h[name] !== 'function') continue;
      try { out.push(h[name](...args)); } catch (e) { if (global.console) console.error('[flashalpha-chart] layer plugin', e); }
    }
    return out;
  }

  candles = chart.addSeries(LW.CandlestickSeries,
    { upColor: COLORS.up, downColor: COLORS.down, borderVisible: false, wickUpColor: COLORS.up, wickDownColor: COLORS.down });
  const volume = chart.addSeries(LW.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false });
  chart.priceScale('vol').applyOptions({ visible: false, scaleMargins: { top: 0.82, bottom: 0 } });
  /** The Settings menu's switches: volume, grid lines, legend (theme goes through setTheme). */
  view.applySetting = (k, v) => {
    state.view[k] = !!v;
    if (k === 'volume') volume.applyOptions({ visible: !!v });
    if (k === 'grid') chart.applyOptions({ grid: { vertLines: { visible: !!v }, horzLines: { visible: !!v } } });
    if (k === 'legend') root.classList.toggle('fac-nolegend', !v);
  };
  view.screenshot = createScreenshot(view, chart);
  call('ready');
  // A line of closes instead of candles where the bars are one sample a minute (open = high = low = close, e.g. SPX on 1m:
  // the index is stored as one value per minute): candles would be a row of dots. The candles stay, transparent, so the
  // price scale, the levels and the markers keep their series.
  const closeLine = chart.addSeries(LW.LineSeries, { color: COLORS.line, lineWidth: 2, priceLineVisible: true, lastValueVisible: true,
    crosshairMarkerVisible: true, visible: false });
  let lineMode = false;
  const CLEAR = { color: 'transparent', wickColor: 'transparent', borderColor: 'transparent' };

  const legend = createLegend(view, chart);
  const upsell = createUpsell(view);
  const emptyState = createEmptyState(view);

  // Plugin panes under the price take a fifth of the chart each; re-applied on every resize because the container may
  // still be 0 px tall when a pane is added.
  const brandEl = $('.fac-body > .fac-brand');
  const sizePanes = () => {
    const panes = chart.panes(), h = $('.fac-body').clientHeight;
    if (h > 0) for (let i = 1; i < panes.length; i++) panes[i].setHeight(Math.max(60, Math.round(h * 0.2)));
    placeBrand(brandEl, chart);
    legend.place();
  };
  // Phones: resolutions, ranges and Indicators in the toolbar; the plugins' toolbar controls move into the Indicators menu;
  // a one-line legend; level labels on the price axis without their titles.
  const resizeObserver = new ResizeObserver(() => {
    const narrow = root.clientWidth < NARROW;
    if (narrow !== root.classList.contains('fac-narrow')) {
      root.classList.toggle('fac-narrow', narrow);
      toolbar.placeControls(narrow);
      legend.render(null, null);
    }
    const tiny = root.clientWidth < TINY;
    if (tiny !== state.tiny) { state.tiny = tiny; applyTitles(); }
    sizePanes();
  });
  resizeObserver.observe(root);

  chart.subscribeCrosshairMove(p => {
    const t = p.time != null ? p.time : null, y = p.point ? p.point.y : null;
    legend.render(t, y);
    call('crosshair', t, y);
  });

  function window_() {
    // The window ends now, or at the newest bar when that is later (clock skew); a symbol without today's bars still
    // shows its last sessions and today's exposure rows.
    const meta = state.symbols.find(x => x.symbol === state.symbol);
    const last = meta && meta.last_bar ? Date.parse(meta.last_bar) + 60e3 : 0;
    // Rounded up to the minute: readers of the same page then ask the same window, which the API answers from its cache.
    const to = new Date(Math.ceil(Math.max(Date.now(), last) / 60e3) * 60e3);
    // The range counts back from the newest bar, so 1D on a weekend or before the pre-market shows the last session
    // instead of an empty chart.
    // Never longer than the API's cap for the resolution.
    const end = last ? Math.min(to.getTime(), last) : to.getTime();
    const max = (MAX_DAYS[state.res] || state.days) * 86400e3;
    const from = Math.max(end - Math.min(state.days * 86400e3, max), to.getTime() - max);
    // Intraday 1 to 5 days (the 1D and 5D ranges) are trading sessions, like TradingView's: the API starts the window at the
    // Nth latest session by its exchange calendar (weekends and holidays skipped); `from` is for a data source of your own.
    const sessions = intraday() && Number.isInteger(state.days) && state.days >= 1 && state.days <= 5 ? state.days : null;
    return { from: new Date(from), to, sessions };
  }

  /** The API layers the enabled chart layers need, plugin by plugin (the core levels plugin first). */
  function apiLayers() {
    const l = new Set();
    asking = true;
    try {
      for (const { plugin, pctx } of handles) {
        if (typeof plugin.apiLayers !== 'function') continue;
        try { for (const x of plugin.apiLayers(pctx) || []) l.add(x); } catch (e) { if (global.console) console.error('[flashalpha-chart] layer plugin', e); }
      }
    } finally { asking = false; }
    return [...l];
  }

  /**
   * What the API sent, merged across loads: the stored bars, the charts() answer (rows with a ts merged by time, anything
   * else from the newest answer), and the layers asked for.
   * Like TradingView, dragging the chart towards its left edge loads the window before the first bar, and towards its
   * right edge (when the newest bar is old) the bars after the last one; a refresh loads that tail too.
   */
  const raw = { bars: [], charts: {}, layers: [], q: [] };
  /** armed: the reader touched the chart (the first fit, which starts at bar 0, must not page in older bars by itself). */
  const lazy = { armed: false, older: false, newer: false, noOlder: false, newerAt: 0 };
  const EDGE = 10;                          // bars from an edge of the data that start loading the next window
  let pending = 0;

  const ms = ts => Date.parse(ts);
  /** a and b merged by ts (b wins on the same ts), in time order. */
  function mergeByTs(a, b) {
    const m = new Map();
    for (const x of a) m.set(ms(x.ts), x);
    for (const x of b) m.set(ms(x.ts), x);
    return [...m.entries()].sort((x, y) => x[0] - y[0]).map(x => x[1]);
  }
  const hasTs = v => Array.isArray(v) && v.length > 0 && !!v[0] && typeof v[0] === 'object' && 'ts' in v[0];
  /** A charts() answer for an older (newer = false) or newer window, merged into what is drawn. */
  function mergeCharts(base, add, newer) {
    if (!add || add.error) return base;
    const out = Object.assign({}, base);
    for (const [k, v] of Object.entries(add)) {
      const b = base[k];
      if (Array.isArray(v) && Array.isArray(b) && (hasTs(v) || hasTs(b))) out[k] = newer ? mergeByTs(b, v) : mergeByTs(v, b);
      else if (k === 'layers' && v && typeof v === 'object') out[k] = newer ? Object.assign({}, b, v) : Object.assign({}, v, b);
      else if (newer || !(k in base)) out[k] = v;
    }
    return out;
  }

  /** bars() and charts() for one window (ms or Date); `sessions`: the window is that many trading sessions (see window_). */
  function fetchWindow(from, to, q, sessions) {
    const f = new Date(from).toISOString(), t = new Date(to).toISOString();
    const s = sessions ? { sessions } : {};
    return Promise.all([
      Promise.resolve(source.bars(state.symbol, state.res, f, t, o.session, s)).catch(e => ({ error: String(e) })),
      q.length ? Promise.resolve(source.charts(state.symbol, state.res, f, t,
        Object.assign({}, query, s, { session: o.session, layers: q }))).catch(e => ({ error: String(e) })) : {},
    ]);
  }
  /** The key's plan: layers above it are locked in the menu and named in the Upgrade box. */
  function updatePlan(c) {
    if (c && 'plan' in c && c.plan !== state.plan) { state.plan = c.plan; toolbar.render(); }
  }
  /** An answer that the key is missing or not valid: lock like the free plan (see lockedPlan). */
  function noteKeyError(r) {
    if (r && KEY_ERRORS.includes(r.error) && !state.noKey) { state.noKey = true; toolbar.render(); upsell.render(); }
  }

  /**
   * Loads the window from scratch (symbol, resolution, range, session or layers changed). A refresh ({keepView: true})
   * loads only the bars after the newest one and keeps what the user looks at (see draw).
   */
  async function load({ keepView = false } = {}) {
    if (!state.symbol) return;
    if (keepView && raw.bars.length) return loadNewer();
    pending++;
    const ticket = state.loading + 1;         // the ticket loadAll takes
    try { await loadAll(keepView); } finally { pending--; }
    if (ticket === state.loading) liveSync(); // a newer load syncs after its own bars
  }

  async function loadAll(keepView) {
    const ticket = ++state.loading;           // also drops older / newer windows still on their way
    const { from, to, sessions } = window_();
    const t0 = performance.now();
    if (!keepView) status('loading…');
    if (!keepView && !raw.bars.length) emptyState.loading();
    const layers = apiLayers();
    // The spot candles need exposure rows even when no exposure layer is on; a chart without the exposure layers
    // (options.exposure false: candles only) asks no charts() at all.
    const q = o.exposure && intraday() && !layers.includes('exposure') ? [...layers, 'exposure'] : layers;
    const [r, c] = await fetchWindow(from, to, q, sessions);
    if (ticket !== state.loading || destroyed) return;      // a newer load (or destroy) superseded this one
    // The account button (Sign up, or the plan's name) waits for the first answer; a plan in this one re-renders it below.
    if (!state.answered) { state.answered = true; toolbar.renderAccount(); }
    noteKeyError(r); noteKeyError(c);
    if (keepView && (r.error || !Array.isArray(r.bars))) { status(`refresh failed: ${r.error || 'no bars'}`); return; }   // keep what is drawn
    Object.assign(lazy, { armed: false, noOlder: false, newerAt: Date.now() });
    if (r.error || !Array.isArray(r.bars)) {
      status(`${r.error || 'no bars'}${r.message ? ': ' + r.message : ''}`);
      emptyState.show(r.error || 'no bars');
      Object.assign(raw, { bars: [], charts: {}, layers, q });
      data.bars = []; data.byTime = new Map(); data.exposure = []; data.gexByTime = new Map();
      for (const x of [candles, volume, closeLine]) x.setData([]);
      call('clear');
      legend.render(null, null);
      return;
    }
    Object.assign(raw, { bars: r.bars.filter(b => b.open != null), charts: c || {}, layers, q });
    updatePlan(c);
    draw(keepView ? 'keep' : 'fit');
    status(`${data.bars.length} bars · ${Math.round(performance.now() - t0)} ms`);
  }

  /**
   * The window before the first bar (as long as the picked range, up to MAX_DAYS), merged at the left; the view stays on the
   * same bars. A weekend or a holiday answers no bars: up to four windows back, each twice as long. Stops at the symbol's
   * first_bar (from symbols()), on an error, or after four empty windows.
   */
  async function loadOlder() {
    if (lazy.older || lazy.noOlder || pending || !raw.bars.length) return;
    lazy.older = true;
    const ticket = state.loading, t0 = performance.now();
    try {
      const first = ms(raw.bars[0].ts);
      const meta = state.symbols.find(x => x.symbol === state.symbol);
      const floor = meta && meta.first_bar ? ms(meta.first_bar) : -Infinity;
      const max = MAX_DAYS[state.res] || state.days;
      let to = first, span = Math.min(Math.max(state.days, 1), max);
      for (let tries = 0; tries < 4 && to > floor; tries++) {
        status('loading older bars…');
        const from = Math.max(to - span * 86400e3, floor);
        const [r, c] = await fetchWindow(from, to, raw.q);
        if (ticket !== state.loading || destroyed) return;
        if (r.error || !Array.isArray(r.bars)) { lazy.noOlder = true; status(`older bars: ${r.error || 'no bars'}`); return; }
        const bars = r.bars.filter(b => b.open != null && ms(b.ts) < first);
        if (bars.length) {
          raw.bars = mergeByTs(bars, raw.bars);
          raw.charts = mergeCharts(raw.charts, c, false);
          draw('prepend');
          status(`${data.bars.length} bars · +${bars.length} older · ${Math.round(performance.now() - t0)} ms`);
          return;
        }
        to = from; span = Math.min(span * 2, max);
      }
      lazy.noOlder = true;
      status('no older bars');
    } finally { lazy.older = false; }
  }

  /**
   * The bars after the newest stored one, from a little before it (the last bars may still change), merged at the right:
   * the refresh, and the reader dragging to the right edge when the newest bar is old (refresh off, a hidden tab).
   * A failure keeps what is drawn.
   */
  async function loadNewer() {
    // Not while a new window loads: raw still holds the previous symbol's bars.
    if (lazy.newer || pending || !raw.bars.length) return;
    lazy.newer = true; pending++;
    const ticket = state.loading, t0 = performance.now();
    try {
      const step = (RES_SECONDS[state.res] || 60) * 1000;
      const from = ms(raw.bars[raw.bars.length - 1].ts) - Math.max(3 * step, 15 * 60e3);
      const to = Math.ceil(Date.now() / 60e3) * 60e3;
      const [r, c] = await fetchWindow(from, to, raw.q);
      if (ticket !== state.loading || destroyed) return;
      lazy.newerAt = Date.now();
      if (r.error || !Array.isArray(r.bars)) { status(`refresh failed: ${r.error || 'no bars'}`); return; }   // keep what is drawn
      raw.bars = mergeByTs(raw.bars, r.bars.filter(b => b.open != null));
      raw.charts = mergeCharts(raw.charts, c, true);
      updatePlan(c);
      draw('keep');
      status(`${data.bars.length} bars · ${Math.round(performance.now() - t0)} ms`);
    } finally { lazy.newer = false; pending--; }
  }

  /**
   * The API layers that layers turned on need and the stored answer lacks (setLayers): only those, over the stored bars'
   * span, merged into raw. The bars, the older and newer windows already loaded and the view stay. A failed answer loads the
   * window again.
   */
  async function loadLayers(missing) {
    const ticket = state.loading, t0 = performance.now();
    const last = ms(raw.bars[raw.bars.length - 1].ts);
    const from = new Date(ms(raw.bars[0].ts)).toISOString();
    const to = new Date(Math.max(window_().to.getTime(), last + 60e3)).toISOString();
    let c;
    pending++;
    try {
      c = await Promise.resolve(source.charts(state.symbol, state.res, from, to,
        Object.assign({}, query, { session: o.session, layers: missing }))).catch(e => ({ error: String(e) }));
    } finally { pending--; }
    if (ticket !== state.loading || destroyed) return;   // a new window (or destroy) superseded this one
    noteKeyError(c);
    if (!c || c.error) return load();
    raw.charts = Object.assign({}, raw.charts, { layers: Object.assign({}, raw.charts.layers, c.layers) });
    for (const k of missing) if (k in c) raw.charts[k] = c[k];
    raw.q = [...new Set(raw.q.concat(missing))];
    raw.layers = apiLayers().filter(x => raw.q.includes(x));
    updatePlan(c);
    draw('keep');
    status(`${data.bars.length} bars · +${missing.join(', ')} · ${Math.round(performance.now() - t0)} ms`);
  }

  /** "Loading…" over the price pane while a layer turned on or off waits for the API (after 0.2 s: no flash when quick). */
  const busyEl = global.document ? global.document.createElement('div') : null;
  if (busyEl) { busyEl.className = 'fac-busy'; busyEl.textContent = 'Loading…'; const body = $('.fac-body'); if (body) body.appendChild(busyEl); }
  let busyCount = 0;
  function whileBusy(p) {
    const set = d => { busyCount += d; if (busyEl) busyEl.classList.toggle('on', busyCount > 0); };
    set(1);
    return Promise.resolve(p).finally(() => set(-1));
  }

  /**
   * Draws `raw`. mode 'fit': the whole window; 'keep' (new bars at the right): a view that ends at the latest bar follows
   * the new bars with the same zoom, any other view stays on the same times; 'prepend' (older bars at the left): the view
   * stays on the same bars.
   */
  function draw(mode) {
    const ts = chart.timeScale();
    const view_ = mode === 'keep' ? currentView() : null;
    const lr = mode === 'prepend' ? ts.getVisibleLogicalRange() : null;
    const firstBefore = data.bars.length ? data.bars[0].time : null;
    const c = raw.charts, layers = raw.layers;
    // Daily ts is already the ET date at 00:00 UTC; intraday ts is shifted to ET-as-UTC.
    data.bars = raw.bars.map(b => Object.assign({}, b, { time: intraday() ? etTime(b.ts) : ms(b.ts) / 1000 }));
    data.bars = data.bars.concat(spotBars(c.exposure || []));
    emptyState.show(data.bars.length ? null : 'no bars');
    data.byTime = new Map(data.bars.map(b => [b.time, b]));
    // Spot candles are muted (no trade prints behind them), and so are quote-mid bars on 1m (one mid a minute: flat dots),
    // outside regular hours (a stub quote's mid, not a market) and when every stored bar in the window is one (no trades at
    // all, e.g. AMC). Other quote-mid bars from 5m up are a real OHLC of mids and keep the normal colours; their volume is
    // not real on any resolution.
    const stored = data.bars.filter(b => b.source !== 'spot'), allQuotes = stored.length > 0 && stored.every(quoteMid);
    lineMode = intraday() && stored.length > 0
      && stored.filter(b => b.open === b.high && b.high === b.low && b.low === b.close).length >= 0.8 * stored.length;
    candles.applyOptions({ lastValueVisible: !lineMode, priceLineVisible: !lineMode });
    closeLine.applyOptions({ visible: lineMode });
    closeLine.setData(lineMode ? data.bars.map(b => ({ time: b.time, value: b.close })) : []);
    candles.setData(data.bars.map(b => lineMode ? Object.assign({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }, CLEAR)
      : b.source === 'spot'
        || (quoteMid(b) && (allQuotes || state.res === '1m' || (intraday() && sessionOf(b.time) !== 'rth')))
      ? { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
          color: b.close >= b.open ? COLORS.spotUp : COLORS.spotDown, wickColor: b.close >= b.open ? COLORS.spotUp : COLORS.spotDown }
      : { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
    volume.setData(data.bars.map(b => b.volume == null || quoteMid(b) || partVolume(b) ? { time: b.time } : { time: b.time, value: b.volume,
      color: b.close >= b.open ? COLORS.volUp : COLORS.volDown }));
    data.notes = [];
    if (c.error && o.debug) data.notes.push(`layers: ${c.error}`);
    // A layer the plan does not include also comes back as status "gated" with no data (an API without a plan field).
    const gated = layers.filter(x => c.layers && c.layers[x] && c.layers[x].status === 'gated');
    upsell.render();
    setExposure(layers.includes('exposure') ? c.exposure || [] : []);
    call('draw', c);
    requestAnimationFrame(sizePanes);                     // a pane added in this load is laid out on the next frame
    const hasDaily = view.callFor([levelsPlugin], 'hasDaily').some(Boolean);
    if (!intraday() && state.picked && ['levels', 'maxpain'].some(on) && !hasDaily) data.notes.push('GEX levels: pick 1m to 1h');
    else if (layers.includes('exposure') && !gated.includes('exposure') && !(c.exposure || []).length) data.notes.push('GEX levels: none yet in this window (they start at the 9:30 ET open)');
    if (mode === 'prepend') {
      const shift = firstBefore == null ? -1 : data.bars.findIndex(b => b.time === firstBefore);
      if (lr && shift > 0) ts.setVisibleLogicalRange({ from: lr.from + shift, to: lr.to + shift });
    } else {
      if (mode === 'fit') autoScalePrices();
      restoreView(view_);
    }
    liveRender();                                         // a reload never sets a live candle back
    legend.render(null, null);
  }

  /**
   * A new window (symbol, resolution, range, session, layers) starts with every pane's price scale fitting its data again:
   * dragging or zooming a price scale turns lightweight-charts' autoScale off, and the next symbol's prices (SPY ~740,
   * SPX ~7,400) would then be outside the view. Refreshes and lazy loads keep the reader's vertical zoom.
   */
  function autoScalePrices() {
    const n = chart.panes().length;
    for (let i = 0; i < n; i++) {
      for (const id of ['right', 'left']) {
        try { chart.priceScale(id, i).applyOptions({ autoScale: true }); } catch (e) { /* no such scale in that pane */ }
      }
    }
  }

  /** The visible range as distances from the last bar and as times, before a refresh replaces the data. */
  function currentView() {
    const ts = chart.timeScale(), lr = ts.getVisibleLogicalRange(), last = data.bars.length - 1;
    return lr && last >= 0 ? { fromEnd: last - lr.from, toEnd: last - lr.to, range: ts.getVisibleRange() } : null;
  }
  function restoreView(v) {
    const ts = chart.timeScale(), last = data.bars.length - 1;
    if (!v || last < 0) ts.fitContent();
    else if (v.toEnd <= 0.5) ts.setVisibleLogicalRange({ from: last - v.fromEnd, to: last - v.toEnd });   // follow the latest bar
    else if (v.range) ts.setVisibleRange(v.range);
    else ts.fitContent();
  }

  /** Candles from the exposure rows' spot for the buckets after the last stored bar (RTH only: spot is sampled in RTH). */
  function spotBars(rows) {
    if (!intraday()) return [];
    const last = data.bars.length ? data.bars[data.bars.length - 1].time : -Infinity;
    return rows.filter(e => e.spot && e.spot.first != null && e.spot.last != null).map(e => ({
      time: etTime(e.ts), open: e.spot.first, high: e.spot.max, low: e.spot.min, close: e.spot.last, volume: null, source: 'spot',
    })).filter(b => b.time > last);
  }

  /**
   * A bar built from quote mids (source "quotes": no trades in the archive that day). Not for a symbol with asset_class
   * "index" (e.g. SPX): its bars are always quote rows (an index has no trades), so they are drawn as normal bars.
   */
  function quoteMid(b) {
    const meta = state.symbols.find(x => x.symbol === state.symbol);
    return b.source === 'quotes' && !(meta && meta.asset_class === 'index');
  }
  view.quoteMid = quoteMid;
  /** A 1w bar folding quote-mid days with trade days: its volume sums the trade days only, so it is not drawn. */
  function partVolume(b) { return b.source === 'mixed' && !intraday(); }
  view.partVolume = partVolume;

  /** The exposure rows on bar times only: a point without a candle would widen the time scale with empty space. */
  function setExposure(rows) {
    data.exposure = rows.map(e => Object.assign({}, e, { time: etTime(e.ts) })).filter(e => data.byTime.has(e.time));
    data.gexByTime = new Map(data.exposure.map(e => [e.time, e]));
  }

  /**
   * The live lane (options.live with the built-in source, intraday): 1m bars and exposure rows by WebSocket (live.js),
   * drawn in place. `parts` holds the 1m bars by minute (ms) for the buckets newer than the loaded bars and the current and
   * previous bucket; above 1m a bucket is the fold of its parts, its earlier minutes seeded once per (re)connect with one
   * 1m bars() call. `seeded`: false, 'pending' or true.
   */
  const live = { conn: null, up: false, symbol: null, key: null, mode: null, parts: new Map(), newest: -Infinity,
    seeded: false, seeding: 0, seedFailAt: 0, from: -Infinity, lastMsg: 0, barAt: 0, lags: [], lagAt: 0 };
  const liveKey = () => state.res + ' ' + o.session;
  /** The start (ms) of the bucket a minute (ms) falls in; 1h RTH buckets start at :30. */
  const bucketMs = m => {
    const t = etTime(m);
    return m - (t - bucketOf(t, RES_SECONDS[state.res] || 60, state.res === '1h' && o.session === 'rth' ? 1800 : 0)) * 1000;
  };
  const previousBucket = m => bucketMs(bucketMs(m) - 60e3);
  /** The oldest minute a stream update may change: the previous bucket, or 3 minutes back (late prints) at 1m. */
  const oldestPart = m => Math.min(previousBucket(m), m - 180e3);
  /** Above 1m, not seeded yet: seed now; a failed seed is retried after a minute (the loaded candles stay meanwhile). */
  const seedDue = () => state.res !== '1m' && live.seeded === false && live.newest > -Infinity &&
    Date.now() - live.seedFailAt > 60e3;

  /** Opens, re-subscribes or closes the connection after a load (symbol, resolution, session changed). */
  function liveSync() {
    if (!(o.live && !o.source && intraday() && state.symbol && !destroyed && typeof global.WebSocket === 'function')) {
      liveStop();
      return;
    }
    if (!live.conn) live.conn = createLive({ url: liveUrl(o.baseUrl, global.location && global.location.origin), key: o.apiKey,
      WebSocket: global.WebSocket, doc: global.document, onMessage: liveMessage, onState: liveState });
    if (live.symbol !== state.symbol) { live.symbol = state.symbol; live.parts.clear(); live.newest = -Infinity; live.key = null; live.barAt = 0; }
    if (live.key !== liveKey()) {
      live.key = liveKey(); live.seeded = false; live.seedFailAt = 0;
      if (state.res === '1m') liveRender();
      else if (live.newest > -Infinity) liveSeed();
    }
    live.conn.set(state.symbol);
  }
  function liveStop() {
    if (live.conn) live.conn.close();
    Object.assign(live, { conn: null, up: false, symbol: null, key: null, newest: -Infinity, seeded: false });
    live.parts.clear();
  }

  function liveState(s, m) {
    if (s === 'up') {
      // A gap longer than the snapshot (10 minutes): the bars in between come from the API.
      if (live.lastMsg && Date.now() - live.lastMsg > 9 * 60e3) load({ keepView: true });
      live.up = true; live.mode = m.mode; live.seeded = false; live.seedFailAt = 0;
      state.feed = { mode: m.mode, delay: m.delay }; toolbar.renderAccount();
    } else live.up = false;
  }

  function liveMessage(m) {
    live.lastMsg = Date.now();
    if (m.t === 'error') { status(`live: ${m.code}`); return; }
    if (!m.s || !live.symbol || m.s.toUpperCase() !== live.symbol.toUpperCase()) return;   // the gateway answers 'SPY' to 'spy'
    if (m.t === 'snap') {
      for (const b of m.bars || []) livePart(b, false);
      if (m.levels) liveLevels(m.levels, true);           // the redraw draws the live buckets too
      if (seedDue()) liveSeed();
      else if (!m.levels) liveRender();
    } else if (m.t === 'bar') {
      live.barAt = Date.now();
      const t = livePart(m.bar, true);
      if (t == null) return;
      if (o.debug === 'latency' && m.bar.lt && Date.now() - live.lagAt > 1000) {
        live.lagAt = Date.now();
        status(`live ${live.mode || ''} · lag p50 ${percentile(live.lags, 50)} ms · p95 ${percentile(live.lags, 95)} ms`);
      }
      if (seedDue()) liveSeed();
      else liveRender(bucketMs(t));
    } else if (m.t === 'levels') liveLevels(m.row, true);
  }

  /**
   * Keeps a 1m bar; its minute (ms), or null when it is dropped: outside regular hours with session 'rth', or (a
   * stream update) older than oldestPart.
   */
  function livePart(b, update) {
    const m = b ? ms(b.ts) : NaN;
    if (!Number.isFinite(m) || b.open == null) return null;
    if (o.session === 'rth' && sessionOf(etTime(m)) !== 'rth') return null;
    if (update && live.newest > -Infinity && m < oldestPart(live.newest)) return null;
    live.parts.set(m, b);
    if (m > live.newest) live.newest = m;
    if (update && b.lt) { live.lags.push(Date.now() - b.lt); if (live.lags.length > 500) live.lags.shift(); }
    const keep = Math.min(oldestPart(live.newest), raw.bars.length ? ms(raw.bars[raw.bars.length - 1].ts) : Infinity);
    for (const k of live.parts.keys()) if (k < keep) live.parts.delete(k);
    return m;
  }

  /**
   * The earlier minutes of the buckets the live lane draws (above 1m), from the API; parts from the stream win. From the
   * previous bucket, or the last loaded one when that is older (the loaded bars lag a few minutes), at most 2 hours back.
   */
  async function liveSeed() {
    const last = raw.bars.length ? ms(raw.bars[raw.bars.length - 1].ts) : Infinity;
    const from = Math.max(Math.min(previousBucket(live.newest), last), bucketMs(live.newest - 120 * 60e3));
    const ticket = ++live.seeding, key = live.key, symbol = live.symbol;
    live.seeded = 'pending'; live.from = from;
    const to = new Date(Math.ceil(Date.now() / 60e3) * 60e3).toISOString();
    const r = await Promise.resolve(source.bars(symbol, '1m', new Date(from).toISOString(), to, o.session)).catch(() => null);
    if (ticket !== live.seeding || destroyed || live.symbol !== symbol || live.key !== key) return;
    if (!r || r.error || !Array.isArray(r.bars)) { live.seeded = false; live.seedFailAt = Date.now(); return; }
    for (const b of r.bars) {
      const m = ms(b.ts);
      if (b.open != null && m >= from && !live.parts.has(m)) live.parts.set(m, b);
    }
    live.seeded = true;
    liveRender();
  }

  /** Draws the live buckets from `onlyMs` (one bucket) or all of them that are not older than the last loaded bar. */
  function liveRender(onlyMs) {
    if (!live.conn || live.symbol !== state.symbol || live.key !== liveKey() || (state.res !== '1m' && live.seeded !== true)) return;
    const from = raw.bars.length ? etTime(raw.bars[raw.bars.length - 1].ts) : -Infinity;      // the last loaded bar
    const buckets = new Map();
    for (const m of [...live.parts.keys()].sort((a, b) => a - b)) {
      const start = bucketMs(m);
      if ((onlyMs != null && start !== onlyMs) || (state.res !== '1m' && start < live.from)) continue;   // not seeded: partial
      if (!buckets.has(start)) buckets.set(start, []);
      buckets.get(start).push(live.parts.get(m));
    }
    let drawn = 0;
    for (const [start, list] of buckets) {
      const t = etTime(start);
      if (t >= from && liveBar(t, start, foldBars(list))) drawn++;
    }
    if (drawn) legend.render(null, null);
  }

  /** One bucket's bar in place: the last bar updated or a new one added, an older one with historicalUpdate. */
  function liveBar(t, start, f) {
    const last = data.bars.length ? data.bars[data.bars.length - 1].time : -Infinity;
    if (!f || (t < last && !data.byTime.has(t))) return false;        // lightweight-charts cannot insert a bar there
    const old = t < last;
    try {
      candles.update(Object.assign({ time: t, open: f.open, high: f.high, low: f.low, close: f.close }, lineMode ? CLEAR : {}), old);
      if (lineMode) closeLine.update({ time: t, value: f.close }, old);
      volume.update(f.volume == null ? { time: t } : { time: t, value: f.volume,
        color: f.close >= f.open ? COLORS.volUp : COLORS.volDown }, old);
    } catch (e) { return false; }
    const bar = Object.assign({ ts: new Date(start).toISOString(), time: t }, f);
    if (data.byTime.has(t)) {
      for (let i = data.bars.length - 1; i >= 0; i--) if (data.bars[i].time === t) { data.bars[i] = bar; break; }
    } else data.bars.push(bar);
    data.byTime.set(t, bar);
    return true;
  }

  /** A pushed exposure row merged into the loaded ones (folded into its bucket above 1m) and drawn, without an API call. */
  function liveLevels(row, redraw) {
    const m = row ? ms(row.ts) : NaN;
    if (!Number.isFinite(m) || !started) return;
    const rows = Array.isArray(raw.charts.exposure) ? raw.charts.exposure : [];
    let add = row;
    if (state.res !== '1m') {
      const start = bucketMs(m);
      add = foldLevels(rows.find(x => ms(x.ts) === start), row, new Date(start).toISOString());
    }
    raw.charts = Object.assign({}, raw.charts, { exposure: mergeByTs(rows, [add]) });
    if (redraw) draw('keep');
  }

  // Dragging or zooming to an edge loads the next window (after the reader touched the chart: see lazy.armed).
  const arm = () => { lazy.armed = true; };
  for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'wheel']) $('.fac-canvas').addEventListener(ev, arm, { passive: true });
  const timeScale = chart.timeScale();
  if (typeof timeScale.subscribeVisibleLogicalRangeChange === 'function') timeScale.subscribeVisibleLogicalRangeChange(lr => {
    if (!lr || !lazy.armed || !started || destroyed || !raw.bars.length) return;
    if (lr.from < EDGE) loadOlder();
    const newest = ms(raw.bars[raw.bars.length - 1].ts);
    const stale = Date.now() - newest > Math.max(2 * (RES_SECONDS[state.res] || 60) * 1000, 120e3);
    if (lr.to > data.bars.length - 1 - EDGE / 2 && stale && Date.now() - lazy.newerAt > 60e3) loadNewer();
  });

  /** Tells the group (hooks.changed) after the interval, range, session or layers changed. */
  const changed = p => { if (hooks.changed) hooks.changed(api); return p; };
  const api = {
    setSymbol(x) {
      state.symbol = x; toolbar.render();
      const p = load();
      if (hooks.symbol) hooks.symbol(x, api);
      return p;
    },
    setResolution(r) { state.res = r; state.days = DEFAULT_DAYS[r] || state.days; toolbar.render(); return changed(load()); },
    /** Days back from now; capped per resolution (MAX_DAYS). */
    setRange(days) { state.days = days; toolbar.render(); return changed(load()); },
    /** 'rth' (regular hours, the default) or 'eth' (with pre- and post-market). */
    setSession(x) { o.session = x; toolbar.render(); return changed(load()); },
    /** Any of 'levels', 'maxpain', plus the ids of registered layer plugins. Remembered for the next visit (`storage`). */
    setLayers(list) {
      state.layers = new Set(list); state.picked = true; storeLayers([...state.layers]);
      toolbar.render(); upsell.render();
      // Every API layer these need is in the stored answer (a layer turned off, or on again): drawn again from it at once, no
      // request. Some are not: only those are asked and merged in (loadLayers); the bars and the view stay. A new window
      // reloads with just the layers on.
      const want = apiLayers();
      if (!pending && raw.bars.length && !raw.charts.error) {
        const missing = want.filter(x => !raw.q.includes(x));
        if (!missing.length) {
          raw.layers = want;
          draw('keep');
          return changed(Promise.resolve());
        }
        return changed(whileBusy(loadLayers(missing)));
      }
      return changed(whileBusy(load()));
    },
    /** 'dark', 'light' or 'auto'. */
    setTheme(t) { o.theme = t; theme.apply(); if (hooks.theme) hooks.theme(t, api); },
    get symbol() { return state.symbol; },
    get resolution() { return state.res; },
    /** Days back from now (setRange). */
    get range() { return state.days; },
    get session() { return o.session; },
    /** For a chart group: the toolbar, time bar and credit line, and where they are now (see `outside`). */
    _parts: () => ({ bar: root.querySelector('.fac-bar'), time: root.querySelector('.fac-timebar'), credit: root.querySelector('.fac-credit') }),
    _outside(list) { outside = list.filter(Boolean); },
    _closeMenus: () => view.closeMenus(),
    /** The key's plan from the last answer ('free', 'basic', ...), or null before it / without auth. */
    get plan() { return state.plan; },
    get layers() { return [...state.layers]; },
    /** Every plot's style by plot id (a copy): { color, lineWidth, lineStyle, visible, priceLine, axisLabel }. */
    get styles() { return JSON.parse(JSON.stringify(styles)); },
    /** Changes a plot's style, as the indicator Settings do, e.g. setStyle('callWall', { color: '#00ff00', lineWidth: 2 }). */
    setStyle(id, style) { view.setStyle(id, style || {}); },
    reload: () => load(),
    destroy() {
      destroyed = true; state.loading++;
      clearInterval(timer);
      liveStop();
      toolbar.destroy();
      theme.destroy();
      call('destroy');
      resizeObserver.disconnect(); chart.remove(); root.remove();
    },
    get chart() { return chart; },
  };
  view.api = api;
  for (const { h } of handles)
    for (const [name, fn] of Object.entries(h.methods || {})) if (!(name in api) && typeof fn === 'function') api[name] = fn;

  // Auto-refresh: every `refresh` seconds while the page is visible (0 = off).
  // Skipped while a load is running, so a refresh never replaces a load the user started.
  // A chart whose element left the page (a single-page app moved on) stops itself instead of polling with the key.
  // While bars of this symbol come by the socket (one in the last 2 minutes) it refreshes only every 5 minutes; a socket
  // that is up but silent for the symbol (an index without a live source, quote-only minutes) keeps the normal refresh.
  const timer = o.refresh > 0 ? setInterval(() => {
    if (!root.isConnected) { api.destroy(); return; }
    if (live.up && Date.now() - live.barAt < 120e3 && Date.now() - lazy.newerAt < 300e3) return;
    if (!document.hidden && !pending && state.noData !== 'unknown_symbol' && !(hooks.hidden && hooks.hidden())) load({ keepView: true });
  }, o.refresh * 1000) : null;

  (async () => {
    emptyState.loading();                                     // until the first window (or the reason there is none)
    try { state.symbols = await source.symbols(); } catch (e) { state.symbols = []; }
    if (destroyed) return;
    noteKeyError(state.symbols);
    const symbolsError = state.symbols && state.symbols.error;
    if (!Array.isArray(state.symbols)) state.symbols = [];
    if (!state.symbol) state.symbol = (state.symbols.find(x => x.last_bar) || state.symbols[0] || {}).symbol;
    if (state.symbol && !state.symbols.some(x => x.symbol === state.symbol)) state.symbols.push({ symbol: state.symbol });
    toolbar.render();
    // Nothing to load, so no answer will come: say why instead of an empty chart (a signed-out reader gets the sign-up box).
    if (!state.symbol) { state.answered = true; toolbar.renderAccount(); emptyState.show(symbolsError || 'no bars'); }
    started = true;
    await load();
  })();
  return api;
}
