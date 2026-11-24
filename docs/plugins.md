# Layer plugins

A layer plugin adds layers to the chart's **Indicators** menu: series on the price pane, panes under it, legend lines,
settings and methods. The core GEX levels (`levels`, `maxpain`) are a plugin too:
[`src/plugins/levels.js`](../src/plugins/levels.js) is a complete example.

## Indicators

Like TradingView's indicators, the menu lists **indicators**: named groups of layers. Plugins with the same `indicator`
name share one; the core one is `GEX Levels` (Walls & gamma flip, Max pain), and a plugin joins it with
`indicator: 'GEX Levels'`. A plugin without `indicator` is an indicator of its own, named `name` (else its
first layer's label). One plugin can fill several indicators: `indicators: { layerId: 'Indicator name' }` puts each
listed layer in its own indicator (the others stay in `indicator`); a plot follows its `layer`.

Each indicator has a switch (all its layers on or off) and its layers (a layer above the key's plan is a 🔒 link to upgrade
with the plan it needs on the right; a layer open to the key's plan carries no plan label; the indicator's name carries no plan, its layers can
differ). The indicator has no options of its own: each layer open to the key's plan has an **options** button (gear) for
its own dialog; the button on the indicator's line in the legend opens the options of its first layer that is on.

- **Inputs:** the layer's switch, and the indicator's options: the controls plugins add with `ctx.addControl(el)` (or
  `ctx.addControl(el, 'panel', name)` for another indicator of the plugin). They apply to every layer of the indicator,
  so each of its layers shows them.
- **Style:** the layer's plots (lines declared in `plots` with this `layer`; a plot with no `layer` shows under every
  layer of its indicator): visible, colour, width (1–4 px), line style (solid, dotted, dashed); price lines and labels on
  the price scale for those plots; values in the status line (this layer's parts of the indicator's legend line: a part's `layer`, else its plot's). A layer with plots opens on
  Style, one without on Inputs.
- **Defaults** puts the layer's plots' default style back, **Cancel** what was there when the dialog opened, **Ok** keeps
  it.

```js
FlashAlphaChart.registerLayers({
  indicator: 'GEX Levels',
  layers: [['vwap', 'VWAP']],
  plans: { vwap: 'alpha' },                     // "VWAP  Alpha" in the menu; 🔒 below Alpha
  plots: [{ id: 'vwap', title: 'VWAP', layer: 'vwap', color: '#4fc3f7', priceLine: false }],
  attach(ctx) {
    let line;
    return {
      ready() { line = ctx.bindPlot('vwap', ctx.chart.addSeries(ctx.LW.LineSeries, {})); },
      draw() { line.setData(/* … */); },
    };
  },
});
```

A plot: `{ id, title, layer, color }`, plus any of `lineWidth`, `lineStyle`, `visible`, `priceLine`, `axisLabel` as its
defaults, or `colorOnly: true` for a colour the plugin reads (`ctx.styleOf(id).color`) without a series of its own, or `toggle: true` for a switch and a colour, or a switch only when the plot has no `color` (`ctx.styleOf(id).visible`, e.g. markers; the
core's "Call wall broken" and "Put wall broken" are toggles, off by default). The
page can override defaults with the mount option `styles`, and change them later with `chart.setStyle(id, style)`.

Register a plugin before `mount`. It applies to every chart mounted afterward.

```js
FlashAlphaChart.registerLayers(plugin);                 // script tag
import { registerLayers } from 'tradingview-gex-flashalpha';   // npm
```

The TypeScript declarations ([`types/index.d.ts`](../types/index.d.ts)) describe every field below as `LayerPlugin`,
`PluginContext` and `PluginHandle`.

## Plugin

| Field | Description |
|---|---|
| `layers` | `[[id, label], ...]`: the menu entries. |
| `indicator`, `name` | Optional. The indicator the layers belong to (see [Indicators](#indicators)). |
| `indicators` | Optional. An indicator per layer id, over `indicator`, for example `{ heatmap: 'GEX by strike' }`. |
| `defaults` | Optional. Layer ids turned on when the reader switches the indicator on (the chart itself opens with no layer). |
| `plans` | Optional. The lowest plan per layer id, for example `{ heatmap: 'growth' }`. A layer without one is never locked. |
| `apiLayers(ctx)` | Optional. The API layers to request for the enabled ids, for example `['strikes']`. |
| `attach(ctx)` | Once per chart, before the candle series exists: series added here are drawn behind the candles. Returns a handle. |

## Handle

Every member is optional.

| Member | When it runs |
|---|---|
| `ready()` | Once the candles exist. Series added here are drawn over the candles. |
| `draw(response)` | After every load, with the `charts()` response. Windows loaded as the reader drags the chart are merged in: arrays of rows with a `ts` by time, anything else from the newest window. |
| `clear()` | When a load failed. |
| `legend(time, y)` | Returns lines for the legend at the bar under the crosshair. |
| `crosshair(time, y)` | On every crosshair move (`time` is `null` off the chart). |
| `paneOf(indicator)` | The series of a pane of its own that the indicator draws in (`indicator`: its name), or null: its legend line goes to the top left of that pane instead of the price pane's legend. |
| `paneLegends(time)` | Lines for panes that are no indicator of their own (e.g. a metric pane): `[{ series, name, parts, indicator, remove }]`, each at the top left of `series`'s pane: `name`, then `parts` (as `legendLevels`), the options button opening `indicator`'s options, the remove button calling `remove()`. |
| `legendLevels(row, parts, prev, indicator)` | Called once per indicator of the plugin that is on (`indicator`: its name). Parts of that indicator's line in the legend for the exposure row under the crosshair (the core indicator: spot, call wall, put wall, gamma flip, max pain when on). A part `{ label, value, prev, plot, color, cls, format }` reads like a key level, with its change against `prev` (the previous session's last row), the value in the plot's colour and left out while the plot is hidden; `value` is a number (written by `format` when given, else with two decimals) or a string shown as it is; a string part is text; `{ ramp: [colours], from, to, title }` is a colour scale (`from`, a gradient, `to`; `title` on hover); `{ info, about }` is an ⓘ whose text shows on hover or click (`about` names it for screen readers: "About <about>"). Insert or append in place. |
| `destroy()` | When the chart is destroyed. |
| `methods` | `{ name: function }` added to the object `mount` returns. Core names win. |

Panes a plugin adds under the price pane each get a fifth of the chart's height (at least 60 px).

## Context (`ctx`)

| Member | Description |
|---|---|
| `LW` | The lightweight-charts module (`LW.LineSeries`, `LW.HistogramSeries`, ...). |
| `chart` | The lightweight-charts chart. |
| `root` | The chart's root element (`.fac`). |
| `options` | The mount options with their defaults. |
| `colors` | `up`, `down`, `spotUp`, `spotDown`, `flip`, `unverified`, `maxpain`. |
| `level(color, title)` | A level line: steps through the day and a dotted line at its latest value. |
| `candles`, `bars` | The candle series and the drawn bars (each with its chart `time`). |
| `exposure` | The exposure rows of the last load on bar times, each with its chart `time`. |
| `symbol`, `resolution`, `intraday()` | What the chart shows. |
| `on(id)` | True when the layer is picked, the key's plan includes it and it is not hidden with the legend's 👁 (in `apiLayers` a hidden layer counts as on: its data keeps coming, so it shows again at once). |
| `hidden(id)` | True when the layer is on but hidden with the legend's 👁: draw nothing for it (a pane of its own can stay, empty, for its legend line). |
| `plan`, `lockedPlan(plan)`, `upgradeHref(what)` | The key's plan, whether a plan is above it, and the tagged upgrade link. |
| `addControl(el, where, indicator)` | Adds a control: into an indicator's options, shown in the options of each of its layers (the plugin's own indicator, or the one named by `indicator`), Inputs tab, under `el.title` (default), or `'toolbar'` (it moves into the Indicators menu on phones). False when the toolbar is hidden. |
| `level(color, title, plotId)` | A level line; with `plotId` it follows that plot's style. |
| `bindPlot(plotId, series)` | Ties a series to one of the plugin's plots: its layer's options restyle it. Returns the series. |
| `styleOf(plotId)` | A plot's current style: `color`, `lineWidth`, `lineStyle`, `visible`, `priceLine`, `axisLabel`. |
| `query`, `setQuery({...})` | Parameters merged into the `charts()` request; `setQuery` reloads (called from `attach` it only sets the first request). |
| `note(text)` | A note in the legend when no exposure row is under the crosshair. |
| `reserveRight(px)`, `reservedRight` | Keeps `px` free at the right edge of the price pane for what the plugin draws there (`0` gives it back): room right of the latest bar, the level lines without their titles (their axis labels stay), the edge labels left of it. |
| `redraw()` | Draws again from the last answer, no request: every plugin's `draw()`, then the legend (e.g. after an option of your own changed). |
| `util` | `etTime`, `dayOf`, `sessionOf`, `floorIndex`, `esc`, `num`, `big`, `RES_SECONDS`. |

## Times

Times handed to lightweight-charts are ET wall-clock seconds written as if they were UTC ("ET-as-UTC"), so day and
month ticks fall on ET boundaries. `ctx.util.etTime(iso)` converts an API time; `ctx.util.dayOf(time)` gives its ET date.
