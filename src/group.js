import { NARROW, STORAGE_KEY } from './constants.js';
import { global } from './env.js';
import { injectCss } from './css.js';
import { mountChart } from './chart.js';
import { LAYOUTS, MAX_CHARTS, areaOf, gridStyle, layoutById, layoutIcon } from './layouts.js';

/** Below this width (px) a group shows only the chart in focus and hides the Layout menu (phones, small widgets). */
export const SINGLE = 640;
/** The interval a new chart opens with: the first of these no other chart of the group has. */
const NEW_RESOLUTIONS = ['1m', '5m', '15m', '1h', '1d', '1w'];

/**
 * Mounts a chart group in `container`: one to four charts in a layout like TradingView's, picked from the Layout menu
 * next to Settings. One toolbar and one time bar, at the top and the bottom of the group, act on the chart in focus (click
 * a chart to focus it); each chart keeps its own interval, range, session, indicators and Settings. Changing the symbol
 * changes it on every chart; the theme too. The layout and each chart's interval, range and session are remembered
 * (localStorage, `storageKey` + ':group'); each chart remembers its own layers (`storageKey`, then `storageKey:2` ...).
 * Below SINGLE px only the chart in focus shows. `layouts: false` (or `controls: false`) mounts one chart as before.
 * Returns the methods of the chart in focus (setResolution, setLayers, ...) plus setLayout(id), layout, charts, active,
 * focus(i); setSymbol, setTheme, reload and destroy act on the whole group.
 */
export function mount(container, options) {
  const o = Object.assign({}, options || {});
  if (o.layouts === false || o.controls === false) return mountChart(container, o);
  if (!(o.lightweightCharts || global.LightweightCharts))
    throw new Error('FlashAlphaChart needs lightweight-charts 5 (global LightweightCharts or options.lightweightCharts)');
  if (o.injectCss !== false) injectCss();

  const base = o.storage === false ? null : String(o.storageKey || STORAGE_KEY);
  const groupKey = base && base + ':group';
  const saved = read();
  let layout = layoutById((saved && saved.layout) || o.layout || '1');
  /** Each chart's interval, range and session by position, kept for a chart the layout drops and brings back. */
  const slots = Array.from({ length: MAX_CHARTS }, (_, i) => (saved && Array.isArray(saved.charts) && saved.charts[i]) || null);

  const root = document.createElement('div');
  root.className = 'fac-grp';
  // The bars come after the grid in the page (CSS puts the top bar first), so querySelector('.fac') is the first chart.
  root.innerHTML = '<div class="fac-grp-grid"></div><div class="fac-grp-top"></div><div class="fac-grp-foot"></div>';
  container.appendChild(root);
  const grid = root.querySelector('.fac-grp-grid'), top = root.querySelector('.fac-grp-top'), foot = root.querySelector('.fac-grp-foot');
  /** { cell, api, parts: {bar, time, credit}, marks } per chart, in layout order. */
  const charts = [];
  let active = -1, single = false, syncing = false, destroyed = false;

  const resizeObserver = new ResizeObserver(() => {
    const w = root.clientWidth;
    root.classList.toggle('fac-narrow', w > 0 && w < NARROW);
    const s = w > 0 && w < SINGLE;
    if (s !== single) { single = s; arrange(); }
  });
  resizeObserver.observe(root);

  function read() {
    if (!groupKey) return null;
    try { const v = JSON.parse(global.localStorage.getItem(groupKey)); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
  }
  function save() {
    if (!groupKey || destroyed) return;
    charts.forEach((c, i) => { slots[i] = { res: c.api.resolution, days: c.api.range, session: c.api.session }; });
    try { global.localStorage.setItem(groupKey, JSON.stringify({ layout: layout.id, active, charts: slots })); } catch (e) { /* not remembered */ }
  }

  /** Calls `method` on every chart but `from`: the symbol and the theme follow the chart that changed them. */
  function sync(method, value, from) {
    if (syncing) return;
    syncing = true;
    try { for (const c of charts) if (c.api !== from) c.api[method](value); } finally { syncing = false; }
  }
  /** The group's bars take the theme colours of the chart in focus (they sit outside its element). */
  function copyTheme() {
    const r = charts[active] && charts[active].cell.querySelector('.fac');
    if (!r) return;
    for (let i = 0; i < r.style.length; i++) {
      const k = r.style[i];
      if (k.startsWith('--fac-')) root.style.setProperty(k, r.style.getPropertyValue(k));
    }
  }

  function addChart(i) {
    const cell = document.createElement('div');
    cell.className = 'fac-cell';
    grid.appendChild(cell);
    const slot = slots[i], focused = charts[active];
    const used = charts.map(c => c.api.resolution);
    const own = slot ? { resolution: slot.res, days: slot.days, session: slot.session }
      : i === 0 ? {} : { resolution: NEW_RESOLUTIONS.find(r => !used.includes(r)) || '5m', days: null };
    const entry = { cell };
    const hooks = {
      frame: () => root,
      symbol: (x, api) => sync('setSymbol', x, api),
      theme: (t, api) => { sync('setTheme', t, api); copyTheme(); },
      changed: () => save(),
      hidden: () => single && charts.indexOf(entry) !== active,
    };
    entry.api = mountChart(cell, Object.assign({}, o, own, {
      layoutMenu: true,
      symbol: (focused && focused.api.symbol) || o.symbol || null,
      storageKey: base ? (i ? `${base}:${i + 1}` : base) : o.storageKey,
    }), hooks);
    entry.parts = entry.api._parts();
    entry.marks = {};
    for (const [k, el] of Object.entries(entry.parts)) {
      if (!el) continue;
      const mark = document.createComment('fac-' + k);
      el.after(mark);
      entry.marks[k] = mark;
    }
    const panel = entry.parts.bar && entry.parts.bar.querySelector('.fac-layouts .fac-panel');
    if (panel) {
      panel.innerHTML = '<div class="fac-ttl">Layout</div>' + [1, 2, 3, 4].map(n => `<div class="fac-lay-row"><span class="fac-lay-n">${n}</span>`
        + LAYOUTS.filter(l => l.n === n).map(l => {
          const t = l.n === 1 ? '1 chart' : `${l.n} charts`;
          return `<button type="button" data-layout="${l.id}" title="${t}" aria-label="${t}">${layoutIcon(l)}</button>`;
        }).join('') + '</div>').join('');
      panel.addEventListener('click', e => {
        const b = e.target.closest('[data-layout]');
        if (!b) return;
        entry.api._closeMenus();
        setLayout(b.dataset.layout);
      });
    }
    cell.addEventListener('pointerdown', () => focus(charts.indexOf(entry)), true);
    charts.push(entry);
  }

  /** Moves the toolbar, time bar and credit of chart i into the group's bars (and the previous chart's back home). */
  function focus(i) {
    if (i < 0 || i >= charts.length || i === active) return;
    const was = charts[active];
    if (was) {
      was.api._closeMenus();
      for (const [k, el] of Object.entries(was.parts)) if (el && was.marks[k]) was.marks[k].before(el);
      was.api._outside([]);
      was.cell.classList.remove('on');
    }
    active = i;
    const c = charts[i];
    if (c.parts.bar) top.appendChild(c.parts.bar);
    for (const el of [c.parts.time, c.parts.credit]) if (el) foot.appendChild(el);
    c.api._outside([c.parts.bar, c.parts.time, c.parts.credit]);
    c.cell.classList.add('on');
    copyTheme();
    arrange();
    save();
  }

  /** The grid for the layout; below SINGLE px only the chart in focus. A chart shown again catches up at once. */
  function arrange() {
    root.classList.toggle('fac-grp-multi', charts.length > 1 && !single);
    root.classList.toggle('fac-grp-single', single);
    Object.assign(grid.style, single ? { gridTemplateAreas: '"a"', gridTemplateColumns: '1fr', gridTemplateRows: '1fr' } : gridStyle(layout));
    charts.forEach((c, i) => {
      const hide = single && i !== active;
      c.cell.style.gridArea = single ? 'a' : areaOf(i);
      if (c.cell.hidden && !hide) c.api.reload();
      c.cell.hidden = hide;
    });
  }

  /** The Layout button shows the current layout; the menu marks it. */
  function renderMenus() {
    for (const c of charts) {
      const bar = c.parts.bar;
      if (!bar) continue;
      const btn = bar.querySelector('.fac-layouts > button');
      if (btn) btn.innerHTML = layoutIcon(layout);
      bar.querySelectorAll('[data-layout]').forEach(b => {
        const on = b.dataset.layout === layout.id;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }
  }

  function setLayout(id) {
    const l = layoutById(id);
    if (active >= l.n) focus(0);
    save();                                     // the charts about to go keep their settings in their slot
    while (charts.length > l.n) {
      const c = charts.pop();
      c.api.destroy();
      c.cell.remove();
    }
    layout = l;
    while (charts.length < l.n) addChart(charts.length);
    arrange();
    renderMenus();
    save();
  }

  for (let i = 0; i < layout.n; i++) addChart(i);
  focus(saved && saved.active > 0 && saved.active < charts.length ? saved.active : 0);
  renderMenus();

  const group = {
    /** Any id of LAYOUTS: '1', '2v', '2h', '3v' ... '4tr'. */
    setLayout,
    get layout() { return layout.id; },
    /** The methods of every chart, in layout order. */
    get charts() { return charts.map(c => c.api); },
    /** The position of the chart in focus. */
    get active() { return active; },
    focus,
    setSymbol(x) { return charts[active].api.setSymbol(x); },
    setTheme(t) { charts[active].api.setTheme(t); },
    reload: () => Promise.all(charts.map(c => c.api.reload())),
    destroy() {
      destroyed = true;
      resizeObserver.disconnect();
      for (const c of charts) c.api.destroy();
      charts.length = 0;
      root.remove();
    },
  };
  // Everything else (setResolution, setLayers, plan, layers, chart, plugin methods ...) is the chart in focus.
  return new Proxy(group, {
    get(t, k) {
      if (k in t) return t[k];
      const api = charts[active] && charts[active].api;
      const v = api ? api[k] : undefined;
      return typeof v === 'function' ? v.bind(api) : v;
    },
    has(t, k) { return k in t || !!(charts[active] && k in charts[active].api); },
  });
}
