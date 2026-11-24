import { PLAN_NAMES } from '../constants.js';
import { global } from '../env.js';
import { planRank } from '../plans.js';
import { esc } from '../util.js';
import { ICONS } from './layout.js';

const WIDTHS = [1, 2, 3, 4];
const STYLES = [['solid', 'Solid'], ['dotted', 'Dotted'], ['dashed', 'Dashed']];

/**
 * The Indicators menu and the layer options dialog, like TradingView's.
 * An indicator is a named group of layers (view.groups, see buildIndicators in chart.js: e.g. the core
 * "GEX Levels": Walls & gamma flip, Max pain, plus layers plugins add to it). The menu lists each indicator
 * with a switch (all its layers on / off) and its layers; a layer above the key's plan is a 🔒 link to the upgrade page
 * with the plan it needs on the right (the layers open to the key's plan carry no plan label). An indicator groups layers that can need
 * different plans, so its name carries none: the layers above the reader's plan are what the upgrade sells.
 * The indicator has no options of its own: each open layer has an options button (gear) that opens its dialog.
 * Inputs: the layer's switch, and the indicator's options (the plugins' controls from ctx.addControl), shared by all its
 * layers. Style: the layer's plots (visible, colour, width, line style; a plot with no layer shows under every layer of
 * its indicator), price lines and labels on the price scale for them, and the layer's values in the status line.
 * Applied as you change them; Cancel puts back what was there when the dialog opened, Defaults the layer's default style.
 */
export function createIndicators(view) {
  const { $, state } = view;
  const list = $('.fac-ind-list');
  const dlg = $('.fac-dialog');
  let open = null;                          // { g, k, label, tab, snapshot } while the dialog is open

  /** The plots a layer's Style tab shows: its own, and its indicator's plots that name no layer. */
  const plotsOf = (g, k) => g.plots.filter(p => !p.layer || p.layer === k);

  const planName = p => PLAN_NAMES[p] || p;
  /**
   * A layer: a checkbox (open to the key's plan: no plan label), or a 🔒 upgrade link with the plan it needs on the right
   * (above the key's plan; the pricing page, in a new tab). The indicator's name carries no plan: its layers can need
   * different plans.
   */
  function layerRow(k, label) {
    const plan = view.layerPlan[k] || 'free';
    if (view.locked(k)) return `<a class="fac-lock" href="${esc(view.upgradeHref(k))}" target="_blank" rel="noopener">🔒 ${esc(label)} <span class="plan">${esc(planName(plan))}</span></a>`;
    return `<label><input type="checkbox" data-layer="${esc(k)}" ${view.active(k) ? 'checked' : ''}> ${esc(label)}</label>`;
  }
  /**
   * The indicator's switch. An indicator with every layer above the key's plan opens the upgrade page (pricing, new tab)
   * for its cheapest layer instead, and stays off.
   */
  function toggleGroup(g, wanted, input) {
    if (wanted && g.layers.length && g.layers.every(([k]) => view.locked(k))) {
      input.checked = false;
      const [k] = g.layers.slice().sort(([a], [b]) => planRank(view.layerPlan[a]) - planRank(view.layerPlan[b]))[0];
      global.open(view.upgradeHref(k), '_blank', 'noopener');
      return;
    }
    return view.setGroup(g, wanted);
  }
  /** The layers checked in `box` replace that indicator's layers; the others stay as they are. */
  function layersFrom(box, g) {
    const mine = new Set(g.layers.map(([k]) => k));
    const keep = [...state.layers].filter(k => !mine.has(k));
    return keep.concat([...box.querySelectorAll('input[data-layer]:checked')].map(x => x.dataset.layer));
  }

  function renderList() {
    if (!list) return;
    // A layer row: its switch (or 🔒 link), then its options button while it is open to the key's plan.
    const row = (g, k, l) => `<div class="fac-ind-row">${layerRow(k, l)}${view.locked(k) ? ''
      : `<button type="button" class="fac-icon" data-settings="${esc(k)}" title="Options" aria-label="${esc(l)} options">${ICONS.settings}</button>`}</div>`;
    list.innerHTML = view.groups.map(g => `<div class="fac-ind" data-ind="${esc(g.id)}">
      <div class="fac-ind-head"><label><input type="checkbox" data-group ${view.groupOn(g) ? 'checked' : ''}> <b>${esc(g.name)}</b></label></div>
      <div class="fac-ind-layers">${g.layers.map(([k, l]) => row(g, k, l)).join('')}</div></div>`).join('');
    list.querySelectorAll('.fac-ind').forEach(box => {
      const g = view.groups.find(x => x.id === box.dataset.ind);
      box.querySelector('[data-group]').onchange = e => toggleGroup(g, e.target.checked, e.target);
      box.querySelectorAll('[data-settings]').forEach(b => { b.onclick = () => { view.closeMenus(); openSettings(g.id, b.dataset.settings); }; });
      box.querySelectorAll('input[data-layer]').forEach(i => { i.onchange = () => view.api.setLayers(layersFrom(box, g)); });
    });
  }

  // --- Layer options dialog ----------------------------------------------------------------------------------------------
  function snapshot(g, k) {
    return { layers: [...state.layers], statusOff: new Set(g.statusOff),
      styles: Object.fromEntries(plotsOf(g, k).map(p => [p.id, Object.assign({}, view.styles[p.id])])) };
  }
  /**
   * Opens the options of layer `k` of indicator `id`; with no `k` (the legend's button) the first open layer that is on,
   * else the first open one. Style first when the layer has plots, else Inputs.
   */
  function openSettings(id, k, tab) {
    const g = view.groups.find(x => x.id === id);
    if (!dlg || !g) return;
    const open1 = g.layers.filter(([x]) => !view.locked(x));
    const layer = open1.find(([x]) => x === k) || (!k && (open1.find(([x]) => view.active(x)) || open1[0]));
    if (!layer) return;
    open = { g, k: layer[0], label: layer[1], tab: tab || (plotsOf(g, layer[0]).length ? 'style' : 'inputs'), snapshot: snapshot(g, layer[0]) };
    dlg.hidden = false;
    renderDialog();
    const first = dlg.querySelector('.fac-tabs .on');
    if (first) first.focus();
  }
  function close() { if (dlg) dlg.hidden = true; open = null; }
  function cancel() {
    if (!open) return;
    const { g, snapshot: s } = open;
    for (const [id, st] of Object.entries(s.styles)) view.setStyle(id, st, true);
    g.statusOff = s.statusOff;
    view.redraw();
    const changed = s.layers.length !== state.layers.size || s.layers.some(k => !state.layers.has(k));
    close();
    if (changed) view.api.setLayers(s.layers);
  }

  function inputsTab(g, k, label) {
    const shared = g.layers.length > 1 ? `<div class="fac-dlg-hint">Apply to every layer of ${esc(g.name)}.</div>` : '';
    return `<div class="fac-dlg-sec">Layer</div><div class="fac-dlg-layers">${layerRow(k, label)}</div>`
      + (g.inputs.children.length ? `<div class="fac-dlg-sec">Options</div>${shared}<div class="fac-dlg-inputs"></div>` : '');
  }
  function styleTab(g, k) {
    const plots = plotsOf(g, k);
    const rows = plots.map(p => {
      const st = view.styles[p.id];
      const color = `<input type="color" data-p="${esc(p.id)}" data-k="color" value="${esc(st.color)}" aria-label="${esc(p.title)} colour">`;
      if (p.colorOnly) return `<div class="fac-sty"><span class="fac-sty-name">${esc(p.title)}</span>${color}</div>`;
      const visible = `<label class="fac-sty-name"><input type="checkbox" data-p="${esc(p.id)}" data-k="visible" ${st.visible ? 'checked' : ''}> ${esc(p.title)}</label>`;
      // A toggle: its switch, and its colour when it declares one.
      if (p.toggle) return `<div class="fac-sty">${visible}${p.color ? color : ''}</div>`;
      return `<div class="fac-sty">${visible}${color}`
        + `<select data-p="${esc(p.id)}" data-k="lineWidth" aria-label="${esc(p.title)} width">${WIDTHS.map(w => `<option value="${w}"${st.lineWidth === w ? ' selected' : ''}>${w}px</option>`).join('')}</select>`
        + `<select data-p="${esc(p.id)}" data-k="lineStyle" aria-label="${esc(p.title)} line style">${STYLES.map(([v, l]) => `<option value="${v}"${st.lineStyle === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`;
    }).join('');
    const lines = plots.filter(p => !p.colorOnly && !p.toggle);
    const all = key => lines.length && lines.every(p => view.styles[p.id][key]);
    // Price lines and axis labels belong to plots: without a line plot there is nothing to switch.
    return `${rows || '<div class="fac-none">Nothing to style.</div>'}<div class="fac-dlg-sec">Show</div>`
      + (lines.length ? `<label><input type="checkbox" data-all="priceLine" ${all('priceLine') ? 'checked' : ''}> Price lines (latest value)</label>
      <label><input type="checkbox" data-all="axisLabel" ${all('axisLabel') ? 'checked' : ''}> Labels on price scale</label>` : '')
      + `<label><input type="checkbox" data-status ${g.statusOff.has(k) ? '' : 'checked'}> Values in status line (legend)</label>`;
  }

  function renderDialog() {
    if (!open || !dlg) return;
    const { g, k, label, tab } = open;
    const plots = plotsOf(g, k);
    dlg.innerHTML = `<div class="fac-dlg" role="dialog" aria-modal="true" aria-label="${esc(label)} options">
      <div class="fac-dlg-head"><b>${esc(label)}</b><span class="fac-dlg-sub">${esc(g.name)}</span><button type="button" class="fac-icon" data-x title="Close" aria-label="Close">×</button></div>
      <div class="fac-tabs" role="tablist">${[['inputs', 'Inputs'], ['style', 'Style']].map(([t, l]) =>
        `<button type="button" role="tab" data-tab="${t}" aria-selected="${t === tab}" class="${t === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="fac-dlg-body">${tab === 'inputs' ? inputsTab(g, k, label) : styleTab(g, k)}</div>
      <div class="fac-dlg-foot"><button type="button" data-defaults title="Reset the style to the layer's defaults">Defaults</button><span class="fac-spacer"></span>
        <button type="button" data-cancel>Cancel</button><button type="button" class="fac-primary" data-ok>Ok</button></div></div>`;
    const slot = dlg.querySelector('.fac-dlg-inputs');
    if (slot) slot.appendChild(g.inputs);              // the plugins' option controls keep their state between openings
    dlg.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { open.tab = b.dataset.tab; renderDialog(); }; });
    // The layer's switch: only this layer turns on or off.
    const sw = dlg.querySelector('.fac-dlg-layers input[data-layer]');
    if (sw) sw.onchange = () => view.api.setLayers(sw.checked ? [...state.layers, k] : [...state.layers].filter(x => x !== k));
    dlg.querySelectorAll('[data-p]').forEach(el => {
      el.onchange = el.oninput = () => {
        const k = el.dataset.k;
        const v = k === 'visible' ? el.checked : k === 'lineWidth' ? +el.value : el.value;
        view.setStyle(el.dataset.p, { [k]: v });
      };
    });
    dlg.querySelectorAll('[data-all]').forEach(el => {
      el.onchange = () => { for (const p of plots) if (!p.colorOnly && !p.toggle) view.setStyle(p.id, { [el.dataset.all]: el.checked }, true); view.redraw(); };
    });
    const status = dlg.querySelector('[data-status]');
    // This layer's values only: the indicator's other layers keep theirs.
    if (status) status.onchange = () => { if (status.checked) g.statusOff.delete(k); else g.statusOff.add(k); view.redraw(); };
    dlg.querySelector('[data-defaults]').onclick = () => {
      for (const p of plots) view.setStyle(p.id, view.defaultStyle(p.id), true);
      g.statusOff.delete(k);
      view.redraw();
      renderDialog();
    };
    dlg.querySelector('[data-x]').onclick = dlg.querySelector('[data-cancel]').onclick = cancel;
    dlg.querySelector('[data-ok]').onclick = close;
  }
  if (dlg) {
    dlg.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } });
    dlg.addEventListener('click', e => { if (e.target === dlg) cancel(); });      // a click beside the dialog
  }

  return {
    /** The menu, and the dialog's layer list when it is open (the plan or the layers changed). */
    render() {
      renderList();
      if (open && open.tab === 'inputs') renderDialog();
    },
    open: openSettings,
    close,
    get isOpen() { return !!open; },
  };
}
