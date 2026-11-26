# Changelog

## 1.1.0 — 2026-11-25

- **Level events** (FlashAlpha layer `events`, Growth) is released: markers on the candles where the price was rejected
  at a GEX level (▼ / ▲), broke it (■) or crossed the gamma flip (●), regime flips that held 5 minutes (+γ / −γ), and day
  markers (OPEX, earnings, expiry roll, the largest open interest change). The legend counts per level how many touches
  held (`PW held 10/13`); hovering a bar lists its events. Page: docs/indicators/level-events.md.
- **0DTE hedging flow** (FlashAlpha layer `hedgeflow`, Growth) is released: the stock dealers had to buy or sell since
  the open to hedge today's 0DTE trades, in a pane under the price (blue above zero, orange below), with the flow per bar,
  the call and put legs, divergence markers, and `$Δ` or `% move` units (`options.hedgeUnits`, `setHedgeUnits`).
  Page: docs/indicators/0dte-hedging-flow.md.
- **Expiry heatmap** (FlashAlpha layer `expiries`, Growth) is released: net GEX (or delta, vanna, charm) by strike and by
  expiration in a panel beside the chart, with totals per strike and per expiration, the levels' strikes tagged, and the
  lens, the strikes shown (`options.expiryRows`) and values in cells in its header. Page: docs/indicators/expiry-heatmap.md.
- The **Strike heatmap** and the **GEX profile** are two indicators (they were the layers of "GEX by strike"), each with
  its own value per strike: `options.lens` takes one lens for all, or `{ heatmap, profile, expiries }`;
  `setLens(lens, layer)` sets one. Their page keeps its address: docs/indicators/gex-by-strike.md.
- Fix: on a **Percent** or **Indexed to 100** price scale the level lines and their labels were off (`Call wall 0.00%`):
  Lightweight Charts measures each series from its own first value. While one of those scales is on, the candles draw
  the levels' price lines and labels (from the candles' base) and their lines (`src/percent-levels.js`).
- Fix: Lightweight Charts joins a line across a point without a value, so a line "cut between sessions" was drawn with a
  slope from one session to the next (Net GEX, the 0DTE hedging flow, the metrics pane, the level lines). The point before
  a gap is now transparent. Plugins: `ctx.util.cutGaps(points, type)` does it for their own series.
- Fix: the legend of a pane under the price (Net GEX, the 0DTE hedging flow) sat up to 25 px too high, over the pane
  above it, after an indicator was turned on, until the pointer moved: it is placed where Lightweight Charts lays the pane
  out, and again whenever that pane changes size.
- Fix: a legend line longer than the plot area ran under the price scale (and under a docked panel). The legend ends at
  the plot area, a line that does not fit drops its last values for "…" (their text on hover; the title and the ⓘ stay),
  and each line sits on a faint backdrop so a level line or a marker under it no longer runs through its text.
- Fix: the axis label and price line of Net GEX and of the 0DTE hedging flow take the colour of the latest value's side
  of zero (a negative Net GEX had a green label).
- Expected move in **light green / light red** (`#80cbc4` / `#ef9a9a`), so its lines and labels no longer read as the call
  wall's green and the put wall's red next to them.
- Level labels on the price scale keep a **short title** where the full one does not fit (phones, the GEX profile at the
  pane's right edge): `CW`, `PW`, `Flip`, `MP`, `0DTE`, `+1σ`, `−1σ` (they had no title there). Plugins:
  `ctx.level(color, title, plotId, short)`.
- Level events: the **0DTE magnet's events are off by default** (it is touched many times a day; on in the Style tab),
  and zoomed out (bars under 8 px wide) the markers show their shapes without their tags.
- Expiry heatmap on a phone: docked under the chart at 60 % of its height (was 40 %: one row of strikes showed), its
  header on one line ("Values", the snapshot's time left out).
- A plan without an indicator's data (the chart API answers its layer `"gated"`): the legend names those indicators on
  one line, **Not in your plan: GEX Levels, Net GEX, …**, with an **Upgrade** link (**Sign up** without a key). The
  strike heatmap and the GEX profile no longer say "no strike data in this window" then. Plugins: `ctx.gated(apiLayer)`,
  and `{ gated: name }` from `legend()`.
- Without a key the account button says **Sign up**, also when the chart API names a plan for the keyless answer (it
  said "Free").
- GEX Levels: the magnet's layer is **0DTE magnet** in the Indicators menu, the Style tab, the legend and on the price
  scale (`0DTE` where the full title does not fit), so it no longer reads as the 0DTE hedging flow.
- Touch screens: the legends have no hide / options / remove buttons (they sat over the values); the Indicators menu does
  the same. A plugin's panel keeps its own.
- **Expected move** (FlashAlpha layer `em`, Growth) is released: each session's options-implied 1σ from its 9:30 ET
  open, **+1σ** dotted green and **−1σ** dotted red with the band between them filled faintly (Band fill in the Style
  tab). On 1w the band is the week's (the first session's 1σ × √5 from the week's
  open). The legend shows the band, the 1σ and how many finished sessions in view stayed inside it
  (`Inside 14/20 (70%)`); the session's IV30, RV20, VRP and VIX state moved into its ⓘ. Hovering a bar draws nodes on
  its close and on the band and a box above them (the close in σ from the open, the distance to ±1σ in percent). One name everywhere:
  EM +1σ, EM −1σ. Page: docs/indicators/expected-move.md.
- Legend: every ⓘ sits right after its indicator's name, before the values (it used to come after them).
- Legend: no more "Max pain (daily, close …)" note under the legend before the first intraday max pain; the daily
  value stays on the GEX Levels line as "Max pain (daily)". No more "Daily levels (close …)" note either (1d / 1w):
  the daily levels are still drawn, their values are no longer written under the legend.
- More of Lightweight Charts, laid out like TradingView. A **chart type** menu next to Indicators (its icon shows the
  type): candles, hollow candles, bars, line, area, baseline (from the first close) or Heikin Ashi; the legend keeps the
  real OHLC. **%**, **log** and **auto** buttons at the right of the time bar (auto follows the chart: dragging the price
  scale turns it off, a double click on it back on). **Settings** in sections: Appearance (theme, grid lines, a
  **watermark** with the symbol and the interval), Scales (regular, logarithmic, percent or indexed to 100 from the
  candles' first bar; placement right or left; auto scale; invert; price label; last price line), Crosshair (free, magnet
  on the close, magnet on OHLC, hidden) and Status line (legend, volume).
  The candles stay the price series (levels, markers and plugins keep using them): another type draws over them.
- Indicators menu like TradingView: an indicator with one layer is one row (its switch, its name, its options); one with
  several layers keeps its name, its switch and a row per layer. That switch turns all its layers on (those the plan
  includes) or all off, and is half-ticked while only some are on. The plugin option `defaults` is no longer used.
- Legend like TradingView: a fold button under the price pane's indicator lines hides them (the symbol and its bar stay;
  folded, the button shows how many indicators are folded) and shows them again.
- The legend no longer moves under the pointer: each indicator's line is one line (its parts never wrap), and the notes
  show wherever the pointer is.
- Plugins: `legendLevels(row, parts, prev, indicator, at)` is called at every bar, with the row `{ time }` (and `prev`
  null) where there is no exposure row, so a layer with data of its own fills its line there too; `at` is `{ time, y }`,
  the crosshair's y in the price pane (null off the chart), for a part that follows the pointer. Values that used to be
  extra `legend()` lines under the pointer belong on the indicator's line.

## 1.0.0 — 2026-11-24

- First release on npm and GitHub as **tradingview-gex-flashalpha**. It ships the changes listed under 0.9.0
  below, which reached the chart host as 0.9.0 to 0.9.3 but were never published to npm.
- The package is **tradingview-gex-flashalpha** (`npm install tradingview-gex-flashalpha`), from the GitHub repository
  FlashAlpha-lab/tradingview-gex-flashalpha. The style sheet is `tradingview-gex-flashalpha/style.css`, the builds are
  `dist/tradingview-gex-flashalpha.mjs`, `.cjs`, `.js`, `.min.js` and `.css`. The layers a reader turns on are remembered
  under the new key `tradingview-gex-flashalpha:layers` (`storageKey`): picks saved under the previous key are not read,
  so each reader opens once with the default layers.

## 0.9.0 — chart host only (0.9.0 to 0.9.3, not published to npm)

- Legend parts take `{ info }`: an ⓘ whose text shows on hover, and stays open after a click until a click elsewhere.
  The title's hide / options / remove buttons touch the title (no gap to cross) and hide a moment after the pointer
  leaves, so they are easy to reach.
- Legend parts take `{ ramp: [colours], from, to, title }`: a colour scale (its ends' values either side of a gradient).
  A `toggle` plot without `color` is a switch only in the Style tab.
- Plugins: `ctx.redraw()` draws again from the last answer (no request): every plugin's draw, then the legend.
- Legend like TradingView: every indicator that is on has a line starting with its title; on hover the title shows
  hide / show (👁: its drawings go at once, its line stays, dimmed, and so does its pane; the layers stay on and loaded,
  so showing is at once too), options (⚙) and remove (🗑: its layers off, drawings and line gone at once). With no values
  in the status line the title stays. Plugins: `ctx.on(layer)` is false for a hidden layer while drawing (true when
  asked for the API layers), `ctx.hidden(layer)` tells it is hidden (e.g. keep its pane, empty). An indicator drawn in a pane of its own has
  its line at the top left of that pane: plugin hooks `paneOf(indicator)` and `paneLegends(time)` (a pane that is no
  indicator of its own).
- Fix: a plugin's `apiLayers(ctx)` gets the same context its `attach(ctx)` got (it got the chart's shared one). State a
  plugin keeps by context (a WeakMap) is now seen there: the Pro layers' metric pane asked for no `metrics` layer, so a
  metric picked from "All metrics" (e.g. gamma flip) drew nothing.
- The gamma regime tint has no text on the chart any more ("Positive gamma · moves tend to dampen" / "Negative gamma ·
  moves tend to amplify" removed); the legend still gives the regime.
- Indicators menu: only a layer above the key's plan shows a plan, on the right after its 🔒; the layers the key's plan
  opens carry no plan label (`.fac-badge` removed).
- Legend: the call wall, put wall and gamma flip (and their daily levels) show only while Walls & gamma flip is on.
  With only Max pain on they were still listed.
- Levels: call wall, put wall, gamma flip and max pain are drawn flat, one segment per value, with no vertical line
  between sessions or where a level moves. Max pain is 2 px like the walls and the flip.
- The horizontal line across the chart (price line), the price-scale label and the edge label of the call wall, the put
  wall and the gamma flip show only while the latest session is in view: scrolled back, they would mark another day's
  level.
- The legend no longer ends with "Session levels (set at the open)".
- "Values in status line (legend)" in a layer's Style tab now hides or shows that layer's values only (e.g. Max pain),
  not the whole indicator line; the line goes when no layer that is on shows values. Legend parts take `layer`
  (default: their plot's layer).
- Broken walls are off by default: Walls & gamma flip has two new options in its Style tab, "Call wall broken" and
  "Put wall broken" (a switch and the marker colour). On, a wall the price closes through is faded from that bar, gets a
  marker and reads "(broken)" in the legend, as before. Plots take `toggle: true` (a switch and a colour, no line).
- The core indicator is renamed "GEX Levels" (was "FlashAlpha GEX Levels"): a plugin that joins it names it so.
- The demo pages no longer have the VWAP plugin example.
- Intraday with Walls & gamma flip or Max pain on, the session under the crosshair stands out: the other sessions (their
  candles and levels) are veiled in the chart's background colour until the crosshair leaves the chart.

- `live: true` (off by default): with the FlashAlpha chart API, 1m to 1h charts draw the forming candle, its volume and
  the levels from a WebSocket (`/v1/live`): 1m bars folded into the chart's interval, a late print of the previous
  bucket included; levels without a reload. It reconnects by itself, closes on a tab hidden for a minute, and while it
  is down the chart refreshes as before. `debug: 'latency'` shows the lag in the status line.

- `background` goes with the theme of its kind: a dark colour with the dark theme, a light colour with the light
  theme. Switching a chart that has a dark `background` to Light (Settings) gave dark text on the dark background;
  now the light theme keeps its own white. A colour that is not hex or `rgb()` is used with both themes, as before.
- On a narrow chart (a phone) a menu panel with no room on either side of its button (the Indicators menu at 390 px)
  is moved left to end at the chart's right edge, and is no wider than the chart: its plan labels and option buttons
  were cut off.
- The chart's checkboxes, radios, select lists and symbol search keep the browser's own look on pages
  with site-wide form styles (e.g. `@tailwindcss/forms`, Tailwind preflight): no white 16 px boxes, select lists keep
  their arrow, no blue focus ring. The browser's controls follow the chart's theme (`color-scheme` dark or light, new
  theme value `--fac-scheme`).
- Options per layer: an indicator (e.g. FlashAlpha GEX Levels) has no Settings button any more; each layer open to the
  key's plan has its own options button (gear) in the Indicators menu. Style: that layer's plots only (Walls & gamma
  flip: call wall, put wall, gamma flip; Max pain: max pain), with their price lines and axis labels, and the
  indicator's values in the status line. Inputs: the layer's switch (only that layer turns on or off) and the
  indicator's options (e.g. Expiries / Open interest), shared by all its layers ("Apply to every layer of ...").
  A layer with plots opens on Style. Defaults resets that layer's plots only. The legend's button opens the options of
  the indicator's first layer that is on.
- Levels styled like the GEX-by-strike chart (@flashalpha-lab/gex-charts): call wall `#059669`, put wall `#f84040`
  (solid), gamma flip `#fbbf24` and max pain `#a78bfa` (dashed, 2 px), an unverified flip in the flip colour at 45 %
  (was grey); in the FlashAlpha layer bundle the 0DTE magnet `#f472b6` (dashed), the expected move `#94a3b8`.
- The level lines are cut between sessions: no step from one session's level to the next (the first bar of a session
  is a gap).
- The gamma regime is tinted behind the candles, either side of the flip (green above: "Positive gamma · moves tend to
  dampen"; red below: "Negative gamma · moves tend to amplify"), session by session, labelled by the latest flip in view.
- A level outside the visible price range gets a label pinned to the top or bottom edge: "▲ Call wall 8,000.00 (+11.5%)"
  (distance from the last close).
- The legend gives each wall and the flip its distance from spot: "Call wall 750.00 (+4.6%)", "Put wall 730.00 (−1.9%,
  broken)".
- Daily levels (previous close) only on 1d/1w: intraday the walls and the flip come from the intraday rows only; max pain
  keeps its daily value until the first intraday row that has one.
- Broken walls: when a candle closes above the call wall or below the put wall, that wall's line is faded from that
  bar to the end of the session, a marker "Call wall broken 13:40" / "Put wall broken 10:30" sits on the bar (on the
  candles, `createSeriesMarkers`; none while the wall's plot is hidden), and the legend reads "Put wall 730.00
  (broken)" from that bar on. A new session or a new wall value starts unbroken.
- With the FlashAlpha chart API on settled OI the legend's levels line ends with "Session levels (set at the open)";
  hovering it explains that the levels are set once per session. Not shown for a source of your own.
- Legend parts from `legendLevels`: `note` (in brackets after the value) and `{ text, title }` (a note with a tooltip).
- The chart opens with no layer: price and volume only (`layers` default `[]`, was `['levels']` plus plugin defaults;
  plugin `defaults` now only say what an indicator's switch turns on).
- The layers the reader turns on or off are remembered in localStorage and the chart opens with them next time, over
  `layers` (`storage: false` turns it off, `storageKey` keeps charts apart; unknown ids are dropped; a blocked or broken
  storage falls back to the default).
- The Indicators menu lists every indicator and layer whatever the key's plan; a locked layer links to the pricing page,
  and the switch of an indicator whose every layer is locked opens it too (and stays off).
- Without a key the chart locks every paid layer like the free plan: from the start with the FlashAlpha chart API and no
  key, and after an answer `api_key_required`, `invalid_api_key` or `invalid_embed_key` from any source. A source of
  your own that sends no plan still locks nothing.
- Layouts: the **Layout** button next to Settings shows one to four charts (19 layouts, like TradingView's). One
  toolbar and time bar act on the chart in focus (click a chart); each chart keeps its interval, range, session,
  indicators and Settings; a new symbol (and the theme) goes to every chart; a new chart opens with an interval no other
  has. The layout and each chart's settings are remembered (`storageKey:group`, layers under `storageKey:2`...). Below
  640 px only the chart in focus shows. New options `layouts` (default `true`; `false` = one chart as before) and
  `layout`; new members `setLayout`, `layout`, `charts`, `focus`, `active`, and `symbol`, `resolution`, `range`,
  `session` on each chart.
- A signed-out reader (answer `api_key_required`) sees a sign-up box over a blurred picture of the chart instead of
  "Add your FlashAlpha key to show this chart.": a lock, "Sign up free to see the SPX chart", what a free account and the
  Basic plan show, and a **Sign up free** link (`signupUrl`, `utm_content=gate`). Other errors keep their line of text.
- `signupUrl` defaults to the FlashAlpha pricing page (the site signs up there; `/signup` was a 404).
- The Upgrade box over the chart is hidden for now; `upsell: true` shows it.
- One version number: the package, `FlashAlphaChart.version` and `embed.js` `VERSION` (which jumps from 0.8.x). There is no
  0.4.0 to 0.8.0 release of the package.
- Daily levels: `levels` and `maxpain` also draw the previous session's closing levels (`levels_daily`) as dashed steps, on
  `1d`/`1w` and before the first intraday level; "Daily levels" in the legend; not under a 0DTE scope or live flow.
- Quote-mid bars (`source: 'quotes'`) have no volume and are labelled "quote mid (no trades)"; they are muted on `1m`,
  outside regular hours and when every bar in the window is one, otherwise drawn in the normal colours; not for a symbol
  with `asset_class: 'index'`. A `1w` bar with `source: 'mixed'` has no volume, labelled "some days quote mid (no volume)".
- Level lines (walls, flip, max pain, daily levels, 0DTE magnet) do not drive the price scale: it fits the candles.
- The daily max pain hands over at the first intraday row that has a max pain ("Max pain (daily)" in the legend before
  it); walls and flip still hand over at the first intraday row. The daily levels are drawn only with `levels` or
  `maxpain` on.
- Legend parts from layer plugins: `value` may be a string, and `format` writes a number and its change (e.g. `1.08B`).
- The core indicator is **FlashAlpha GEX Levels** (was "FlashAlpha GEX Max Pain").
- One plugin can fill several indicators: plugin field `indicators: { layerId: name }`, `ctx.addControl(el, 'panel', name)`,
  and `legendLevels(row, parts, prev, indicator)` called once per indicator of the plugin that is on.
- An indicator groups layers that can need different plans: its name carries no plan, and each paid layer in it shows
  its own plan's label (a 🔒 upgrade link above the key's plan).
- The changes listed under 0.4.0 below ship in this release (0.4.0 was never published).

## 0.4.0 — 2026-11-17 (not published)

- npm package: ES module, CommonJS and script-tag builds in `dist/` (`tradingview-gex-flashalpha.mjs`, `.cjs`, `.js`, `.min.js`),
  the style sheet as `tradingview-gex-flashalpha/style.css`, and TypeScript declarations (`types/index.d.ts`).
  Lightweight Charts 5 stays a peer dependency and is never bundled.
- `injectCss: false` skips the `<style>` the chart adds, for pages that load the style sheet themselves.
- `ctx.exposure` for layer plugins: the exposure rows of the last load on bar times.
- The source is split into modules under `src/` (chart, data source, theme, components, plugins). The core layers
  `levels` and `maxpain` are a layer plugin (`src/plugins/levels.js`). The chart draws and behaves as in 0.3.3.
- `FlashAlphaChart.version` is the package version (0.3.3 reported `0.3.0`).
- Layout like a TradingView chart: the toolbar above the chart keeps the symbols, resolutions and Layers; a time bar
  under the chart has the ranges (1D 5D 1M 6M 1Y), RTH / ETH and a live US Eastern clock (hidden below 560 px). The
  session no longer moves into the Layers panel on phones. `controls: false` hides both bars.
- Toolbar like TradingView's: the symbols are a dropdown with a search box (symbol or name, arrow keys and Enter), the
  resolutions an interval dropdown. On the right: **Settings** (theme, volume, grid lines, legend), **Fullscreen**
  (hidden where the browser or the iframe has none), **Take a screenshot** (PNG of the chart under a symbol / interval /
  ET time line) and **Sign up** when the chart has no plan, or the plan's name once the API returns one. New options
  `account` (`false` hides that button) and `signupUrl`. Plugin controls added with `addControl(el, 'toolbar')` sit after
  the Layers menu.
- The key levels text under the chart is gone, with the `keyLevels` option, the `data-key-levels` attribute and the
  plugin hook `keyLevels(last, prev, items)`: the legend shows the same levels. Its levels line reads `Spot 7,413.75
  (−147.03) Call wall 8,000.00 Put wall 7,000.00 Gamma flip 7,588.40 (−42.98)`, the change against the previous session.
  `legendLevels(row, parts, prev)` takes `{ label, value, prev, plot }` parts besides text.
- More history as you drag, like TradingView: at the left edge the chart loads the window before the first bar (as long as
  the range, up to `MAX_DAYS`; until `first_bar`), at the right edge the bars after the newest one when it is old. The
  refresh loads only that tail. Windows are merged: plugins' `draw(response)` gets rows with a `ts` merged by time.
- **Indicators** instead of Layers, like TradingView: the menu ("ƒx Indicators") lists indicators, named groups of layers
  (plugin field `indicator`; the core one is `FlashAlpha GEX Max Pain`: Walls & gamma flip, Max pain), each with a switch,
  its layers with the plan each needs after its name (🔒 and an upgrade link above the key's plan) and a **Settings**
  dialog (also from its legend line): Inputs (layers, plugin options from `addControl`) and Style (per plot: visible,
  colour, width, line style; price lines, labels on the price scale, values in the status line), Defaults / Cancel / Ok.
  The legend has a line per indicator. New: plugin `plots`, `ctx.bindPlot`, `ctx.styleOf`, `ctx.level(color, title,
  plotId)`, mount option `styles`, `chart.styles` and `chart.setStyle(id, style)`. Plan limits are unchanged.
- A new symbol, resolution, range, session or layer set fits its data on both axes: the price scales auto-scale again
  (dragging a price scale turned lightweight-charts' autoScale off, so SPX after SPY was drawn outside the view).
  Refreshes and lazy loads keep the reader's zoom.
- The level labels on the price scale read like the rest of the chart: `Call wall`, `Put wall`, `Gamma flip`, `Max pain`
  (were `call wall`, `put wall`, `flip`, `max pain`).
- Embed keys (`fa_pk_…`) are no longer special: no console warning for other keys, no messages for embed-key errors
  (`invalid_embed_key`, `embed_key_expired`, `embed_key_revoked`, `origin_not_allowed` show the general message).
- Lightweight Charts pinned to **5.3.0** and served from the chart host instead of unpkg: `dist/vendor/` gets the exact
  devDependency version with its LICENSE and NOTICE; `embed.js`, the demo and the examples load it. `embed.js` uses a
  copy the page already has only when it is the same version; otherwise the charts get the pinned copy and the page keeps
  its own `window.LightweightCharts`. `test/lightweight-charts.test.js` checks every pin and mounts the chart on the
  real library.
- Docs: [layer plugins](docs/plugins.md). Tests with `node:test` and jsdom; `npm run check` before publishing.

## 0.3.3 — 2026-11-16

- The brand logo sits at the bottom left of the price pane, where the TradingView logo was.
- Plugin settings (`ctx.addControl(el)`) go into the Layers panel as captioned fields; `addControl(el, 'toolbar')` keeps one in the toolbar.
- Select lists use the theme colours.

## 0.3.2 — 2026-11-16

- More than 8 symbols show as one select instead of a strip of buttons.
- The data window is rounded to the minute, so readers of one page ask the same query (cache-friendly).

## 0.3.1 — 2026-11-16

- `note`: a line under the chart saying the levels are model estimates (default on; `''` hides it).
- The Upgrade box says what the plan adds.

## 0.3.0 — 2026-11-13

- Embed keys: `FlashAlphaChart.setLicenseKey('fa_pk_…')` or `data-key` on the embed `<script>` tag; a console warning when
  a page uses a secret API key.
- Plans: the API's `plan` locks layers above it in the Layers menu with an upgrade link (`upgradeUrl`), and an Upgrade box
  names picked layers the plan doesn't include. Layer plugins declare `plans: { id: 'growth' }`.
- Themes: `theme: 'dark' | 'light' | 'auto'`, `setTheme()`.
- Levels drawn as step lines through the day.
- Mobile: session and plugin controls move into the Layers menu below 560 px; larger buttons; key levels in two columns;
  level labels without titles below 480 px.
- API errors shown in words; load status only with `debug: true`.
- The brand logo sits under the chart next to the "Charts by TradingView" link.
- Requests time out after 20 s; a chart whose element leaves the page stops refreshing.
- `embed.js`: default `5m` over 5 days, `data-range` accepts `1D 5D 1M 6M 1Y`, `data-theme`, `data-upgrade-url`,
  Lightweight Charts pinned by an SRI hash.
- Docs: [chart API reference](docs/api.md); gallery images also as WebP (about 4x smaller).

## 0.1.0 — 2026-11-11

First public release: candlestick chart with call wall, put wall, gamma flip and max pain, key levels text, layer plugins,
custom data sources, one-line embed.
