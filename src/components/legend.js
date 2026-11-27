import { big, esc, num } from '../util.js';
import { dayOf, sessionOf } from '../time.js';
import { ICONS } from './layout.js';

const change = (v, p, fmt = num) => typeof v !== 'number' || typeof p !== 'number' || v === p ? ''
  : ` <span class="ch">(${v > p ? '+' : '−'}${esc(fmt(Math.abs(v - p)))})</span>`;

/**
 * One level as HTML: label, value (in `color` when given, e.g. the plot's colour), `note` in brackets after it (e.g.
 * "(broken)"), and the change against the previous session ('' when the value is absent). A number is written by `fmt`
 * (default: two decimals); a string as it is, without a change.
 */
const keyItem = (label, v, p, cls = '', color = '', fmt = num, note = '') => v == null ? ''
  : `<span>${label ? `<span class="k">${label}</span> ` : ''}<span class="${cls}"${color ? ` style="color:${esc(color)}"` : ''}>${esc(typeof v === 'number' ? fmt(v) : v)}</span>`
    + `${note ? ` <span class="ch">(${esc(note)})</span>` : ''}${change(v, p, fmt)}</span>`;

/**
 * The legend over the price pane: the bar under the crosshair (or the latest), the levels line of the exposure row at that
 * bar (one line per indicator), plugin lines (legend) and notes. A levels line reads: "Spot 7,413.75
 * (−147.03) Call wall 8,000.00 Put wall 7,000.00 Gamma flip 7,588.40 (−42.98)", the change against the last row of the
 * previous session. Layer plugins add to their indicators' lines with legendLevels(row, parts, prev, indicator), called
 * once per indicator the plugin has a layer in (`indicator` is its name): a part is
 * { label, value, prev, plot, color, cls, format, note } (drawn like a key level; `value` a number, written by `format`
 * when given, or a string), { text, title } (a note with a tooltip) or text. On phones it is one line until the crosshair
 * is on the chart.
 * Like TradingView, each indicator's line starts with its title and, on hover, its buttons: hide / show (👁: its layers
 * off, the line kept, dimmed, to bring them back), options (⚙) and remove (🗑: its layers off, the line gone). An indicator
 * drawn in a pane of its own (a plugin's paneOf(indicator) gives a series there) has its line at the top left of that pane;
 * a plugin's paneLegends(time) adds a line to a pane that is no indicator of its own ({ series, name, parts, indicator,
 * remove }: options open `indicator`'s, remove calls `remove`).
 */
export function createLegend(view, chart) {
  const { root, $, state, data } = view;
  const legend = $('.fac-legend');
  const paneBox = $('.fac-pane-lgs');
  /** The paneLegends entries of the last render, for their buttons. */
  let extras = [];
  /** The ⓘ of the last render, numbered in order, and the one a click opened (kept across renders), or null. */
  let tips = 0, openTip = null;

  /** The last exposure row of the session before the one of `g` (rows are in time order), or null. */
  function previousSession(g) {
    const rows = data.exposure, day = dayOf(g.time);
    let i = rows.indexOf(g);
    while (i >= 0 && dayOf(rows[i].time) === day) i--;
    return i >= 0 ? rows[i] : null;
  }

  /**
   * A legend part: { label, value, prev, plot, color, cls, format, note } in the plot's colour (none while the plot is
   * hidden), { text, title } (the title shows on hover), { ramp: [colours], from, to, title } (a colour scale: `from`, a
   * gradient through the colours, `to`), { info, about } (an ⓘ button whose text shows on hover or click; `about` names
   * it for screen readers: "About <about>"), or text.
   */
  function part(p) {
    if (!p) return '';
    if (typeof p !== 'object') return `<span>${esc(p)}</span>`;
    if (p.info != null) return `<button type="button" class="fac-lg-info" data-tip="${tips++}" aria-label="${esc(p.about ? 'About ' + p.about : 'About')}">${ICONS.info}`
      + `<span class="fac-tip" role="tooltip">${esc(p.info)}</span></button>`;
    if (Array.isArray(p.ramp)) return `<span class="fac-lg-ramp"${p.title ? ` title="${esc(p.title)}"` : ''}><span>${esc(p.from || '')}</span>`
      + `<i style="background:linear-gradient(90deg, ${p.ramp.map(c => esc(c)).join(', ')})"></i><span>${esc(p.to || '')}</span></span>`;
    if (p.text != null) return `<span class="fac-lg-note"${p.title ? ` title="${esc(p.title)}"` : ''}>${esc(p.text)}</span>`;
    const st = p.plot ? view.styles[p.plot] : null;
    if (st && st.visible === false) return '';
    return keyItem(esc(p.label), p.value, p.prev, p.cls || '', p.color || (st && st.color) || '',
      typeof p.format === 'function' ? p.format : num, p.note || '');
  }

  /** True for an ⓘ part ({ info }): it goes right after the indicator's name. */
  const isInfo = p => !!p && typeof p === 'object' && p.info != null;

  /**
   * An indicator's title and its buttons (with the chart's controls): hide / show, options, remove. `extra`: the index of
   * a paneLegends entry (options and remove only).
   */
  function title(name, id, hidden = false, extra = null) {
    if (!(view.o.controls && view.$('.fac-dialog'))) return `<span class="fac-lg-head"><span class="fac-lg-name">${esc(name)}</span></span>`;
    const btn = (act, icon, label) => `<button type="button" class="fac-lg-btn" data-act="${act}" data-ind="${esc(id || '')}"`
      + `${extra != null ? ` data-extra="${extra}"` : ''} title="${label}" aria-label="${esc(name)}: ${label}">${icon}</button>`;
    return `<span class="fac-lg-head"><span class="fac-lg-name">${esc(name)}</span><span class="fac-lg-btns">`
      + (extra == null ? btn('eye', hidden ? ICONS.eyeOff : ICONS.eye, hidden ? 'Show' : 'Hide') : '')
      + (id ? btn('settings', ICONS.settings, 'Options') : '') + btn('remove', ICONS.trash, 'Remove') + '</span></span>';
  }

  /**
   * An indicator's line: its title, then its plugins' parts (the core indicator starts with spot). At a bar with an
   * exposure row `g` every plugin of the indicator adds its parts; at a bar without one (no exposure layer on, 1d/1w, before
   * the open) the layer plugins still do, with the row `{ time }` (their values come from their own data), the core one
   * not (its levels are the row's). `at` is { time, y }: the bar and the crosshair's y in the price pane (null when the
   * pointer is off the chart), so a part can follow the pointer on the same line. A part of a layer that does not show
   * values in the status line (its `layer`, else its plot's layer) is left out. A hidden indicator (👁: not drawn, still
   * on) shows its title only, dimmed, where it was. The ⓘ parts come right after the title, before the values.
   */
  function groupLine(gr, g, prev, at) {
    if (gr.hidden) return `<div class="sub lv fac-lg-off">${title(gr.name, gr.id, true)}</div>`;
    const layerOf = p => p && typeof p === 'object' && (p.layer || (p.plot && (gr.plots.find(x => x.id === p.plot) || {}).layer));
    // No layer that is on shows values in the status line: the title only.
    const shows = gr.layers.some(([k]) => view.active(k) && !gr.statusOff.has(k));
    if (!shows) g = null;
    const parts = [];
    if (g) view.callFor(gr.plugins, 'legendLevels', g, parts, prev, gr.name, at);
    else if (shows && at.time != null) {
      view.callFor(gr.plugins.filter(p => p !== view.corePlugin), 'legendLevels', { time: at.time }, parts, null, gr.name, at);
    }
    const kept = parts.filter(p => !gr.statusOff.has(layerOf(p))), infos = kept.filter(isInfo);
    const items = infos.map(part)
      .concat(g && gr.plugins.includes(view.corePlugin) ? [keyItem('Spot', g.spot && g.spot.last, prev && prev.spot && prev.spot.last)] : [])
      .concat(kept.filter(p => !isInfo(p)).map(part)).filter(Boolean);
    return `<div class="sub lv">${title(gr.name, gr.id)}${items.join('')}</div>`;
  }

  /** The pane a series is drawn in, when it is not the price pane; else null. */
  function paneOf(series) {
    const pane = series && typeof series.getPane === 'function' ? series.getPane() : null;
    return pane && pane.paneIndex() > 0 ? pane : null;
  }

  /**
   * The lines of the indicators that are on (or hidden), and of the plugins' pane entries, by pane index: 0 is the price
   * pane (the legend), others go to the top left of their pane.
   */
  function linesByPane(time, g, y) {
    const prev = g ? previousSession(g) : null, out = new Map(), at = { time, y: y == null ? null : y };
    const add = (i, html) => out.set(i, (out.get(i) || []).concat(html));
    for (const gr of view.groups) {
      if (!view.groupOn(gr)) { gr.hidden = false; continue; }         // off (e.g. from the menu): no longer hidden either
      // A hidden indicator's pane stays (empty, its plugin keeps it): its line stays there.
      const pane = paneOf(view.callFor(gr.plugins, 'paneOf', gr.name).find(Boolean));
      add(pane ? pane.paneIndex() : 0, groupLine(gr, g, prev, at));
    }
    extras = time != null ? view.call('paneLegends', time).flat().filter(x => x && paneOf(x.series)) : [];
    extras.forEach((x, i) => {
      const gr = view.groups.find(y => y.name === x.indicator);
      const ps = x.parts || [];
      add(paneOf(x.series).paneIndex(), `<div class="sub lv">${title(x.name, gr && gr.id, false, i)}`
        + `${ps.filter(isInfo).concat(ps.filter(p => !isInfo(p))).map(part).join('')}</div>`);
    });
    return out;
  }

  /**
   * lightweight-charts lays out a pane it adds, or one setHeight changes, at its next frame: the pane elements are watched
   * and the legends placed again when one of them changes size (or the plot narrows, e.g. a panel docked beside it).
   */
  const paneWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    const before = plotRight;
    place();
    if (plotRight !== before) render(...last);    // the plot narrowed or widened: the lines are fitted again
  }) : null;
  let plotRight = null;                     // the last --fac-plot-right (px)
  const watched = new WeakSet();
  const paneEl = p => (p && typeof p.getHTMLElement === 'function' ? p.getHTMLElement() : null);

  /**
   * The pane legends at the top left of their panes: from the pane elements when lightweight-charts gives them, else from
   * the pane heights (1 px separators). Also --fac-plot-right on the chart: the room right of the price pane's plot area
   * (the price scale, a docked panel), which the legends keep clear of.
   */
  function place() {
    if (!chart || typeof chart.panes !== 'function') return;
    const panes = chart.panes(), els = panes.map(paneEl);
    if (paneWatch) for (const el of els) if (el && !watched.has(el)) { watched.add(el); paneWatch.observe(el); }
    const body = $('.fac-body');
    const r0 = els[0] && els[0].getBoundingClientRect(), rb = body && body.getBoundingClientRect();
    // The pane element is its table row (price scales on both sides): the plot is its widest cell.
    const cells = els[0] ? [...els[0].children].map(x => x.getBoundingClientRect()) : [];
    const plot = cells.length ? cells.reduce((a, b) => (b.width > a.width ? b : a)) : r0;
    if (plot && rb && plot.width > 0) {
      plotRight = Math.max(0, Math.round(rb.right - plot.right));
      root.style.setProperty('--fac-plot-right', `${plotRight}px`);
    }
    if (!paneBox) return;
    const tops = [];
    if (r0 && r0.height > 0 && els.every(Boolean)) for (const el of els) tops.push(el.getBoundingClientRect().top - r0.top);
    else { let top = 0; for (const p of panes) { tops.push(top); top += (p.getHeight() || 0) + 1; } }
    paneBox.querySelectorAll('[data-pane]').forEach(el => { el.style.top = `${Math.round(tops[+el.dataset.pane] || 0) + 4}px`; });
  }

  /**
   * A legend line wider than the plot area (each line is one line, never wrapped) would run under the price scale: its
   * last parts are left out until it fits, with "…" (their text on hover). The title and the ⓘ always stay.
   */
  function fit(box) {
    const lim = box.clientWidth;
    if (!lim) return;                     // not laid out (hidden, or no layout engine)
    for (const line of box.querySelectorAll('.lv')) {
      if (line.scrollWidth <= lim) continue;
      const parts = [...line.children].filter(x => !x.matches('.fac-lg-head, .fac-lg-info'));
      const more = document.createElement('span');
      more.className = 'fac-lg-more';
      more.textContent = '…';
      line.appendChild(more);
      const cut = [];
      while (parts.length && line.scrollWidth > lim) { const x = parts.pop(); x.hidden = true; cut.unshift(x.textContent); }
      more.title = cut.join('  ');
    }
  }

  // The buttons in the legends (the legends let clicks through to the chart everywhere else).
  /** The ⓘ a click opened shows its text (hover shows any). */
  function showTip() {
    root.querySelectorAll('.fac-lg-info').forEach(x => x.classList.toggle('fac-tip-open', x.dataset.tip === openTip));
  }
  // A click on an ⓘ opens it (another click closes it); a click anywhere else in the chart, or Escape, closes it. A click
  // on its text (e.g. to select it) leaves it open.
  root.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('.fac-tip')) return;
    const info = e.target.closest && e.target.closest('.fac-lg-info');
    if (!info && openTip == null) return;
    openTip = info && info.dataset.tip !== openTip ? info.dataset.tip : null;
    showTip();
  });
  // Escape on the document: the legend is drawn again on every crosshair move, so the ⓘ that was clicked (and focused) is
  // gone by then and the key goes to the page. Removed once the chart is (its root out of the page).
  const doc = root.ownerDocument;
  function onKey(e) {
    if (!root.isConnected) { doc.removeEventListener('keydown', onKey); return; }
    if (e.key !== 'Escape') return;
    const f = doc.activeElement, info = f && root.contains(f) && f.closest && f.closest('.fac-lg-info');
    if (openTip == null && !info) return;
    openTip = null;
    showTip();
    if (info) info.blur();                // a focused ⓘ shows its text too (:focus-visible)
  }
  doc.addEventListener('keydown', onKey);

  /**
   * The indicator lines of the price pane folded away (the button under them, like TradingView's): the symbol and its bar
   * stay, the button then shows how many indicators are folded. Panes of their own keep their line.
   */
  let folded = false, last = [null, null];
  function onClick(e) {
    const b = e.target.closest && e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'fold') { folded = !folded; render(...last); return; }
    const gr = view.groups.find(x => x.id === b.dataset.ind), act = b.dataset.act;
    if (act === 'settings') { if (gr && view.indicators) view.indicators.open(gr.id); return; }
    if (b.dataset.extra != null) {
      const x = extras[+b.dataset.extra];
      if (act === 'remove' && x && typeof x.remove === 'function') x.remove();
      return;
    }
    if (!gr) return;
    // At once, from what is loaded: 👁 only redraws (the layers stay on and loaded); 🗑 turns them off, redraws without them
    // now, and the reload that follows only drops their data.
    if (act === 'remove') { gr.hidden = false; view.setGroup(gr, false); }
    else if (act === 'eye') gr.hidden = !gr.hidden;
    view.redraw();
  }
  legend.addEventListener('click', onClick);
  if (paneBox) paneBox.addEventListener('click', onClick);

  /**
   * Draws the legends for the bar at chart time `t` (null: the latest) and the crosshair's y in the price pane. The price
   * pane's legend keeps the same lines wherever the pointer is (one line per indicator that is on, each on one line, then
   * the plugins' lines and the notes), so nothing below moves while the pointer moves; only the values change.
   */
  function render(t, y) {
    last = [t, y];
    const b = t != null ? data.byTime.get(t) : [...data.byTime.values()].at(-1);
    const time = b ? b.time : null;
    const g = time != null ? data.gexByTime.get(time) : null;
    const head = `<b>${esc(state.symbol)}</b>`;
    tips = 0;
    const byPane = linesByPane(time, g, t != null ? y : null);
    if (paneBox) {
      paneBox.innerHTML = [...byPane].filter(([i]) => i > 0)
        .map(([i, html]) => `<div class="fac-legend fac-pane-lg" data-pane="${i}">${html.join('')}</div>`).join('');
      place();
      // A pane added by this draw gets its height at lightweight-charts' next layout: placed again then (and by paneWatch).
      if (paneBox.firstChild && typeof requestAnimationFrame === 'function') requestAnimationFrame(place);
      paneBox.querySelectorAll('.fac-pane-lg').forEach(fit);
    } else place();
    if (t == null && root.classList.contains('fac-narrow')) {         // the rest shows on tap (crosshair)
      legend.innerHTML = `<span class="fac-lg-top">${head}${b ? `<span class="${b.close >= b.open ? 'up' : 'dn'}">${num(b.close)}</span>` : ''}</span>`;
      showTip();
      return;
    }
    const price = b ? `<span class="${b.close >= b.open ? 'up' : 'dn'}">${num(b.close)}</span>`
      + `<span class="k">O</span> ${num(b.open)}<span class="k">H</span> ${num(b.high)}<span class="k">L</span> ${num(b.low)}`
      + (b.volume != null && !view.quoteMid(b) && !view.partVolume(b) ? `<span class="k">Vol</span> ${big(b.volume)}` : '')
      + (b.source === 'spot' ? '<span class="k">index spot</span>' : view.quoteMid(b) ? '<span class="k">quote mid (no trades)</span>'
        : view.partVolume(b) ? '<span class="k">some days quote mid (no volume)</span>' : view.intraday() && sessionOf(b.time) !== 'rth' ? `<span class="k">${sessionOf(b.time)}-market</span>` : '') : '';
    const lines = [];
    const extra = time != null ? view.call('legend', time, y).flat().filter(Boolean) : [];
    // Indicators whose data the key's plan does not include ({ gated: name } from the core and the plugins): one line
    // naming them, with the link to upgrade (to sign up without a key).
    const isGated = x => x && typeof x === 'object' && x.gated;
    const menuAt = name => { const i = view.groups.findIndex(gr => gr.name === name); return i < 0 ? Infinity : i; };
    const gatedNames = [...new Set(data.notes.concat(extra).filter(isGated).map(x => String(x.gated)))]
      .sort((a, b) => menuAt(a) - menuAt(b));        // in the Indicators menu's order
    const gatedLine = !gatedNames.length ? ''
      : `<div class="sub fac-lg-gated">Not in your plan: ${esc(gatedNames.join(', '))} `
        + (view.state.noKey
          ? `<a class="fac-lg-up" href="${esc(view.signupHref('legend'))}" ${view.ctaAttrs('legend', 'signup')} target="_blank" rel="noopener">Sign up</a>`
          : `<a class="fac-lg-up" href="${esc(view.upgradeHref('legend'))}" ${view.ctaAttrs('legend')} target="_blank" rel="noopener">Upgrade</a>`) + '</div>';
    lines.push(...extra.filter(x => !isGated(x)));
    // The notes are the load's, not the bar's: shown wherever the pointer is.
    const notes = data.notes.filter(x => !isGated(x));
    if (notes.length) lines.push(notes.join(' · '));
    const inds = byPane.get(0) || [];
    // The fold button under the indicator lines (with how many are folded while folded).
    const fold = !inds.length || !(view.o.controls && view.$('.fac-dialog')) ? ''
      : `<div class="sub fac-lg-foldrow"><button type="button" class="fac-lg-btn fac-lg-fold${folded ? ' on' : ''}" data-act="fold" `
        + `aria-expanded="${!folded}" title="${folded ? 'Show indicator legend' : 'Hide indicator legend'}" `
        + `aria-label="${folded ? 'Show indicator legend' : 'Hide indicator legend'}">${ICONS.chevron}${folded ? `<span>${inds.length}</span>` : ''}</button></div>`;
    legend.innerHTML = `<span class="fac-lg-top">${head}${price}</span>` + (folded ? '' : inds.join('')) + fold
      + gatedLine + (folded ? '' : lines.filter(Boolean).map(l => `<div class="sub">${esc(l)}</div>`).join(''));
    fit(legend);
    showTip();
  }
  return { render, place };
}
