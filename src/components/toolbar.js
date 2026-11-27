import { ET, MAX_DAYS, PLAN_NAMES, RANGES, RES_LABELS, RESOLUTIONS } from '../constants.js';
import { esc } from '../util.js';
import { ICONS, TYPE_ICONS } from './layout.js';
import { CHART_TYPES } from '../display.js';

const fmtClock = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

/** The symbols the symbol dropdown lists first, in this order. */
const FEATURED = ['SPY', 'SPX', 'QQQ', 'TSLA', 'NVDA'];
const featured = s => { const i = FEATURED.indexOf(s); return i < 0 ? FEATURED.length : i; };

/** The element in fullscreen, with the WebKit prefix (Safari 14–16.3). */
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const fullscreenEnabled = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

/**
 * The controls, laid out like a TradingView chart. Top toolbar, left: the symbol dropdown with a search box, the interval
 * dropdown, the chart type menu, the Indicators menu (components/indicators.js) and plugin controls; right: Layout (in a
 * chart group: one to four charts, filled by group.js), Settings (appearance, scales, crosshair, status line), Fullscreen,
 * Take a screenshot, and "Sign up" (no plan: signed out) or the plan's name (signed in).
 * Time bar under the chart: ranges, session, the ET clock and the price scale's % (percent), log and auto buttons. On phones the plugins' toolbar controls move into the
 * Indicators menu ("more") and the clock is hidden. view.api (set once the chart's methods exist) receives the clicks;
 * view.applySetting and view.screenshot (set by the chart) do the Settings and the screenshot.
 */
export function createToolbar(view) {
  const { root, $, o, state } = view;
  const extraControls = [];                  // [element, placeholder] for controls that move on narrow widths
  /** Keeps `el` (already in the toolbar) where it is on wide charts; on narrow ones it goes into the Indicators menu. */
  const movable = el => { const mark = document.createComment('fac'); el.after(mark); extraControls.push([el, mark]); };
  const clock = $('.fac-clock');
  const tick = () => { clock.textContent = fmtClock.format(new Date()) + ' ET'; };
  const clockTimer = clock ? setInterval(tick, 1000) : null;
  if (clock) tick();

  /**
   * Adds a plugin control; false when the toolbar is hidden. Selects and other settings go, under a caption (el.title),
   * into the Inputs tab of the Settings of the plugin's indicator (`group`), so the toolbar keeps only what readers use
   * most; where = 'toolbar' puts it in the toolbar, after the Indicators menu (it moves into that menu on phones).
   */
  function addControl(el, where = 'panel', group = null) {
    const spacer = $('.fac-bar > .fac-spacer'), more = $('.fac-more');
    if (!spacer) return false;
    const box = group && $('.fac-dialog') ? group.inputs : more;
    if (where === 'toolbar' || !box) { spacer.before(el); if (more) movable(el); return true; }
    const field = document.createElement('label');
    field.className = 'fac-field';
    field.innerHTML = `<span>${esc(el.title || '')}</span>`;
    field.appendChild(el);
    box.appendChild(field);
    return true;
  }

  function placeControls(narrow) {
    const more = $('.fac-more');
    if (!more) return;
    for (const [el, mark] of extraControls) if (narrow) more.appendChild(el); else mark.before(el);
  }

  function buttons(group, items, isOn, onClick) {
    const box = $(`[data-g="${group}"]`);
    if (!box) return;
    box.innerHTML = '';
    for (const [label, value, tip] of items) {
      const b = document.createElement('button');
      b.textContent = label;
      if (tip) b.title = tip;
      b.classList.toggle('on', isOn(value));
      b.onclick = () => onClick(value);
      box.appendChild(b);
    }
  }

  // --- dropdown menus: one open at a time; outside click and Escape close it ------------------------------------------
  const menus = [...root.querySelectorAll('.fac-menu')];
  function closeMenus(except) {
    for (const m of menus) if (m !== except && m.classList.contains('open')) {
      m.classList.remove('open');
      m.querySelector('button').setAttribute('aria-expanded', 'false');
    }
  }
  const onDocClick = () => closeMenus();
  /**
   * Opens a menu's panel towards the side with room, no taller than the space under it in the widget. When neither side
   * has room (a phone) the panel is moved left until it ends at the widget's right edge, and a panel wider than the
   * widget gets the widget's width, so nothing in it is cut off.
   */
  function openMenu(m) {
    closeMenus(m);
    m.classList.add('open');
    m.querySelector('button').setAttribute('aria-expanded', 'true');
    const panel = m.querySelector('.fac-panel'), box = view.frame().getBoundingClientRect();
    panel.style.left = ''; panel.style.right = ''; panel.style.maxHeight = ''; panel.style.minWidth = ''; panel.style.maxWidth = '';
    panel.style.boxSizing = '';
    if (box.width > 0 && panel.getBoundingClientRect().width > box.width) {
      // border-box: the max width then counts the panel's padding and border too, so it really ends at the widget's edge.
      panel.style.minWidth = '0'; panel.style.maxWidth = box.width + 'px'; panel.style.boxSizing = 'border-box';
    }
    if (panel.getBoundingClientRect().right > box.right) { panel.style.left = 'auto'; panel.style.right = '0'; }
    if (panel.getBoundingClientRect().left < box.left) {
      panel.style.left = '0'; panel.style.right = 'auto';
      const p = panel.getBoundingClientRect();
      if (p.right > box.right) panel.style.left = (Math.max(box.left, box.right - p.width) - p.left) + 'px';
    }
    const room = box.bottom - panel.getBoundingClientRect().top - 6;
    if (room > 0) panel.style.maxHeight = Math.max(140, room) + 'px';
    if (m.dataset.g === 'symbols') openSymbols();
    if (m.dataset.g === 'res') { const at = m.querySelector('.on'); if (at && at.scrollIntoView) at.scrollIntoView({ block: 'nearest' }); }
    if (m.classList.contains('fac-settings')) syncSettings();
  }
  for (const m of menus) {
    m.querySelector('button').onclick = e => {
      e.stopPropagation();
      if (m.classList.contains('open')) closeMenus(); else openMenu(m);
    };
    m.querySelector('.fac-panel').onclick = e => e.stopPropagation();
    m.addEventListener('keydown', e => {
      if (e.key === 'Escape' && m.classList.contains('open')) { e.stopPropagation(); closeMenus(); m.querySelector('button').focus(); }
    });
  }
  document.addEventListener('click', onDocClick);
  view.closeMenus = () => closeMenus();

  /** A list of options (role="option"); the picked one is marked .on, the keyboard one .active. */
  function fillList(list, items, isOn, onPick, empty) {
    list.innerHTML = items.length ? items.map(([value, label, hint], i) =>
      `<div class="fac-opt${isOn(value) ? ' on' : ''}" role="option" aria-selected="${isOn(value)}" data-v="${esc(value)}" data-i="${i}">`
      + `<span>${esc(label)}</span>${hint ? `<span class="fac-hint">${esc(hint)}</span>` : ''}</div>`).join('')
      : `<div class="fac-none">${esc(empty || '')}</div>`;
    list.querySelectorAll('.fac-opt').forEach(el => { el.onclick = () => { closeMenus(); onPick(el.dataset.v); }; });
  }

  // --- symbol dropdown with a search box -------------------------------------------------------------------------------
  const symMenu = $('[data-g="symbols"]');
  const search = symMenu && symMenu.querySelector('.fac-search');
  const symList = symMenu && symMenu.querySelector('.fac-list');
  let active = -1;
  /**
   * The symbols matching the search: those starting with it first, then those containing it (symbol or name). FEATURED
   * lead, in that order, the rest alphabetically.
   */
  function matches() {
    const q = search.value.trim().toUpperCase();
    const all = state.symbols.map(x => ({ symbol: x.symbol, name: x.name || x.description || '' }))
      .sort((a, b) => featured(a.symbol) - featured(b.symbol) || a.symbol.localeCompare(b.symbol));
    if (!q) return all;
    const starts = all.filter(x => x.symbol.toUpperCase().startsWith(q));
    return starts.concat(all.filter(x => !starts.includes(x) && (x.symbol.toUpperCase().includes(q) || x.name.toUpperCase().includes(q))));
  }
  function renderSymbols() {
    const found = matches();
    fillList(symList, found.map(x => [x.symbol, x.symbol, x.name]), v => v === state.symbol, v => view.api.setSymbol(v), 'No symbols match');
    active = found.length ? 0 : -1;
    markActive();
  }
  function markActive() {
    symList.querySelectorAll('.fac-opt').forEach(el => el.classList.toggle('active', +el.dataset.i === active));
    const el = symList.querySelector('.fac-opt.active');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }
  function openSymbols() {
    search.value = '';
    renderSymbols();
    const at = symList.querySelector('.fac-opt.on');
    if (at) { active = +at.dataset.i; markActive(); }
    search.focus();
  }
  if (search) {
    search.oninput = renderSymbols;
    search.onkeydown = e => {
      const n = symList.querySelectorAll('.fac-opt').length;
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); active = (active + 1) % n; markActive(); }
      else if (e.key === 'ArrowUp' && n) { e.preventDefault(); active = (active - 1 + n) % n; markActive(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const el = symList.querySelector('.fac-opt.active');
        if (el) el.click();
      }
    };
  }

  // --- Chart type menu (next to Indicators) and the price scale's % log auto (time bar), like TradingView ------------------
  const typeMenu = $('[data-g="type"]');
  /** scaleOnly: just the % log auto buttons (the reader dragged or zoomed the chart). */
  function renderDisplay(scaleOnly) {
    if (typeMenu && !scaleOnly) {
      const t = state.view.chartType, label = (CHART_TYPES.find(x => x[0] === t) || CHART_TYPES[0])[1];
      typeMenu.querySelector('.fac-dd-val').innerHTML = TYPE_ICONS[t] || TYPE_ICONS.candles;
      typeMenu.querySelector('button').title = 'Chart type: ' + label;
      const list = typeMenu.querySelector('.fac-list');
      list.innerHTML = CHART_TYPES.map(([v, l]) => `<div class="fac-opt${v === t ? ' on' : ''}" role="option" aria-selected="${v === t}" data-v="${v}">`
        + `<span class="fac-type-opt">${TYPE_ICONS[v]}${esc(l)}</span></div>`).join('');
      list.querySelectorAll('.fac-opt').forEach(el => { el.onclick = () => { closeMenus(); view.applySetting('chartType', el.dataset.v); }; });
    }
    if (view.scaleAuto) state.view.autoScale = view.scaleAuto();
    const mode = state.view.scaleMode;
    buttons('scale', [['%', 'percent', 'Percent scale'], ['log', 'log', 'Logarithmic scale'],
      ['auto', 'auto', 'Auto scale: the price scale fits the bars']],
    v => (v === 'auto' ? !!state.view.autoScale : v === mode),
    v => (v === 'auto' ? view.applySetting('autoScale', !state.view.autoScale) : view.applySetting('scaleMode', v === mode ? 'normal' : v)));
  }

  // --- Settings ----------------------------------------------------------------------------------------------------------
  const settings = $('.fac-settings');
  const PICKS = ['scaleMode', 'scaleSide', 'crosshair'];
  const SWITCHES = ['autoScale', 'invert', 'volume', 'grid', 'legend', 'priceLine', 'priceLabel', 'watermark'];
  function syncSettings() {
    if (!settings) return;
    // Dragging the price scale turns lightweight-charts' auto scale off: the switch shows what the chart does now.
    if (view.scaleAuto) state.view.autoScale = view.scaleAuto();
    settings.querySelector('[data-s="theme"]').value = o.theme;
    for (const k of PICKS) settings.querySelector(`[data-s="${k}"]`).value = state.view[k];
    for (const k of SWITCHES) settings.querySelector(`[data-s="${k}"]`).checked = !!state.view[k];
  }
  if (settings) {
    settings.querySelector('[data-s="theme"]').onchange = e => view.api.setTheme(e.target.value);
    for (const k of PICKS) settings.querySelector(`[data-s="${k}"]`).onchange = e => view.applySetting(k, e.target.value);
    for (const k of SWITCHES)
      settings.querySelector(`[data-s="${k}"]`).onchange = e => view.applySetting(k, e.target.checked);
  }

  // --- Fullscreen and screenshot ------------------------------------------------------------------------------------------
  const fsBtn = $('[data-a="fullscreen"]');
  function syncFullscreen() {
    if (!fsBtn) return;
    const frame = view.frame(), on = fullscreenElement() === frame;
    frame.classList.toggle('fac-fullscreen', on);
    fsBtn.innerHTML = on ? ICONS.exitFullscreen : ICONS.fullscreen;
    fsBtn.title = on ? 'Exit fullscreen' : 'Fullscreen';
    fsBtn.setAttribute('aria-label', fsBtn.title);
  }
  if (fsBtn) {
    // No fullscreen (an iframe without allow="fullscreen", iPhone Safari): no button.
    if (!fullscreenEnabled()) fsBtn.hidden = true;
    fsBtn.onclick = () => {
      closeMenus();
      const frame = view.frame();
      const p = fullscreenElement() === frame ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
        : (frame.requestFullscreen || frame.webkitRequestFullscreen).call(frame);
      if (p && p.catch) p.catch(() => {});
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
  }
  const shotBtn = $('[data-a="screenshot"]');
  if (shotBtn) shotBtn.onclick = () => { closeMenus(); view.screenshot(); };

  // --- Live or delayed data: the live lane's welcome says which; without it, a reader with no key reads delayed data ---------
  const feed = $('.fac-feed');
  function renderFeed() {
    if (!feed) return;
    const f = state.feed || (state.answered && state.noKey ? { mode: 'delayed', delay: null } : null);
    feed.hidden = !f;
    if (!f) return;
    const delayed = f.mode === 'delayed';
    feed.className = `fac-feed ${delayed ? 'fac-delayed' : 'fac-live'}`;
    feed.textContent = delayed ? (f.delay ? `${f.delay} min delayed` : 'Delayed') : 'Live';
    feed.title = delayed ? `Prices are ${f.delay ? `${f.delay} minutes ` : ''}behind the market.` : 'Live prices';
  }

  // --- Sign up (no plan) or the plan's name ------------------------------------------------------------------------------
  const account = $('.fac-account');
  /** Shown once the first load answered (a member's plan comes with it), so a member never sees "Sign up" flash. */
  function renderAccount() {
    renderFeed();
    if (!account || !state.answered) return;
    // Without a key (signed out) "Sign up", even when the chart API names a plan for the keyless answer ("free").
    const plan = state.plan != null && !state.noKey ? String(state.plan).toLowerCase() : null;
    if (plan) {
      account.className = 'fac-account fac-tier';
      account.textContent = PLAN_NAMES[plan] || state.plan;
      account.title = `Your plan: ${PLAN_NAMES[plan] || state.plan}`;
      account.href = view.upgradeHref('account');
      account.setAttribute('data-fac-cta', 'upgrade'); account.setAttribute('data-fac-content', 'account');
    } else {
      account.className = 'fac-account fac-signup';
      account.textContent = 'Sign up';
      account.title = 'Create a free FlashAlpha account';
      account.href = view.signupHref();
      account.setAttribute('data-fac-cta', 'signup'); account.setAttribute('data-fac-content', 'toolbar');
    }
    account.hidden = false;
  }

  function render() {
    const api = view.api;
    if (symMenu) {
      symMenu.querySelector('.fac-dd-val').textContent = state.symbol || 'Symbol';
      if (symMenu.classList.contains('open')) renderSymbols();
    }
    const resMenu = $('[data-g="res"]');
    if (resMenu) {
      resMenu.querySelector('.fac-dd-val').textContent = state.res;
      fillList(resMenu.querySelector('.fac-list'), RESOLUTIONS.map(r => [r, RES_LABELS[r] || r, r]), v => v === state.res, v => api.setResolution(v));
    }
    buttons('range', RANGES.filter(([, d]) => d <= (MAX_DAYS[state.res] || d)), v => v === state.days, v => api.setRange(v));
    buttons('session', [['RTH', 'rth', 'Regular trading hours: 9:30 to 16:00 ET'],
      ['ETH', 'eth', 'Extended trading hours: adds pre-market and after-hours']], v => v === o.session, v => api.setSession(v));
    if (view.indicators) view.indicators.render();
    renderDisplay();
    renderAccount();
  }

  return {
    addControl,
    placeControls,
    render,
    renderAccount,
    renderDisplay,
    destroy() {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
      if (fullscreenElement() === view.frame()) {
        const p = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        if (p && p.catch) p.catch(() => {});
      }
      clearInterval(clockTimer);
    },
  };
}
