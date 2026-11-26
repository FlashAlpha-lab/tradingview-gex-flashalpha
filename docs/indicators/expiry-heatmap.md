# Expiry heatmap indicator: gamma by strike and by expiration

**Expiry heatmap** splits the options positioning near the price by expiration: a grid in a panel beside the chart, with
a row per strike and a column per expiration, each cell coloured by its net GEX (or delta, vanna or charm exposure). It
shows which expiry a wall comes from: a 0DTE wall is gone after today's close, a monthly one lasts.

[← All indicators](../../README.md#indicators-at-a-glance) · Lowest plan: **Growth** ·
[Live demo](https://flashalpha-lab.github.io/tradingview-gex-flashalpha/)

---

## How to read the grid

- **Rows:** the strikes nearest the last price (20, 30 or 50; highest on top), with the strike on the right like the
  price scale. A line marks the price, and another the gamma flip.
- **Columns:** the next expirations, with their date, days to expiry (`0DTE`, `3D`, ...) and OPEX at the bottom like the
  time scale (`OPEX`, `Q-OPEX`, or a monthly OPEX moved to Thursday by a holiday).
- **Cells:** green for long gamma, red for short gamma (in the lens picked), stronger for more exposure. A hatched cell has
  no value.
- **Totals:** the first column is the total per strike over the expirations; the top row is the total per expiration,
  with its share of the whole: what goes away when that expiration expires.
- **Tags:** `CW`, `PW`, `0DTE` and `MP` mark the strikes of the call wall, put wall, 0DTE magnet and max pain drawn on the
  chart.
- **Hover or tap a cell** for its value, for example `Strike 728 · Nov 24 (0DTE) · Net GEX −$2.3M · 0.2% of that expiry`.

The grid shows the latest snapshot in the window (taken every 15 minutes during regular hours) on any interval; it does
not follow the crosshair.

## The panel

- Docked beside the chart (40 % of the width), or under it on a narrow screen (60 % of the height, its header on one
  line).
- Its header has the value per strike (**GEX**, **DEX**, **VEX**, **CHEX**), the strikes shown, and **Values in cells**,
  which writes each cell's value in it.
- Hover its title for **hide** (folds the panel to a tab at the edge; the layer stays on), **options** and **remove**.

## Benefits

1. **Know how long a level lasts.** A wall built on 0DTE options fades at today's close; one on the monthly OPEX holds
   until then.
2. **See what an expiration takes away.** The total row shows how much gamma leaves the market at each expiry, and the
   days around a large one.
3. **Find where positioning is concentrated.** One strike on one expiration can explain a whole wall.
4. **The same lenses as the strike heatmap.** Switch to vanna before a volatility event, or to charm into expiry.

## Settings

| Setting | Options |
|---|---|
| Value per strike | Net GEX, Net DEX, Net VEX, Net CHEX (its own, apart from the strike heatmap's and the GEX profile's) |
| Strikes shown | 20, 30 or 50 nearest the price |
| Style | Colours above and below zero; Values in cells on or off |

From code: `options.expiryRows` (the strikes shown), `options.lens` (`'gex'`, or `{ expiries: 'vex' }` for this
indicator only) and `chart.setLens(lens, 'expiries')`.

## Add it to your chart

```html
<div data-flashalpha-chart data-symbol="SPX" data-layers="levels,expiries" style="height: 600px"></div>
<script async src="https://charts.flashalpha.com/embed.js" data-key="YOUR_FLASHALPHA_API_KEY"></script>
```

## FAQ

**What is the difference with the strike heatmap?**
The [strike heatmap](gex-by-strike.md) shows each strike over time, behind the candles, all expirations together. The
expiry heatmap shows one moment, split by expiration.

**Why does it not change when I move the cursor?**
It shows the latest snapshot in the window, not the bar under the cursor.

**Which expirations are shown?**
The next ones from the snapshot's date, as many as fit; scroll the panel sideways on a narrow screen.

---

Related: [Strike heatmap and GEX profile](gex-by-strike.md) · [GEX Levels](gex-levels.md) ·
[0DTE scope and live OI](0dte-and-live-oi.md) ·
[Get a free FlashAlpha API key](https://flashalpha.com/pricing?utm_source=github&utm_medium=docs&utm_campaign=tradingview-gex-flashalpha)
