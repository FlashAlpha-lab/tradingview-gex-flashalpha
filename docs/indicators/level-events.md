# Level events indicator: what the price did at the GEX levels

**Level events** marks, on the candles, each time the price was rejected at a GEX level, broke through it or crossed the
gamma flip, and each time dealers' gamma changed sign. Day markers flag OPEX, earnings, expiry rolls and large open
interest changes. The legend counts how often each level held in the window on screen.

[← All indicators](../../README.md#indicators-at-a-glance) · Lowest plan: **Growth** ·
[Live demo](https://flashalpha-lab.github.io/tradingview-gex-flashalpha/)

---

## What the events mean

The events come from 1-minute bars, whatever interval the chart shows.

| Marker | Event | What happened |
|---|---|---|
| **▼** red, above the bar | Rejected (resistance) | The price touched a level from below and closed back under it within 5 minutes |
| **▲** green, below the bar | Rejected (support) | The price touched a level from above and closed back over it within 5 minutes |
| **■** orange | Broken | Two 1-minute closes beyond the level: above the bar when it broke up, below when it broke down |
| **●** yellow | Gamma flip crossed | The price crossed the gamma flip |
| **+γ / −γ** | Regime flip | Dealers' net gamma changed sign and held for 5 minutes (+γ dampens moves, −γ amplifies them) |

Each marker names its level: **CW** call wall, **PW** put wall, **0DTE** 0DTE magnet, **MP** max pain, **Flip** gamma
flip. `×3` means three such events in that bar.

**Day markers:** a dashed line through the bar, tagged at the bottom of the pane: OPEX, earnings, the expiry roll (with
the share of gamma that expired) and the largest open interest change of the day, for example `OI +84.0K 650P`.

## What you see on the chart

- **The markers** on the candles, in the colours above.
- **The legend line:** per level, how many of the touches in the window that resolved were rejected, for example
  `CW held 2/2 PW held 10/13 Flip crossed 0 0DTE held 55/121`. The ⓘ explains every marker.
- **Hover a bar** for its events, the minute of each and the wall's strength. With the
  [0DTE hedging flow](0dte-hedging-flow.md) on, a break also says how the flow moved in the 5 minutes to it: **with the
  move** or **against the move**.

## Benefits

1. **Levels that held, and levels that did not.** `PW held 10/13` tells you more about the put wall than its line alone.
2. **React at the level, not after.** A rejection marker on the bar shows the reaction the moment it happened.
3. **Breaks with context.** Pair a break with the regime and the hedging flow: a break under negative gamma, with the
   flow the same way, has more behind it.
4. **The day's calendar on the chart.** OPEX, earnings and expiry rolls explain many unusual sessions.

## Settings

| Setting | Options |
|---|---|
| Style: kinds | Rejected at a level, Level broken, Gamma flip crossed, Regime flips, Day markers (each on or off) |
| Style: levels | Call wall, Put wall, 0DTE magnet (off by default), Max pain events (each on or off; the gamma flip's is "Gamma flip crossed") |

The events show whether or not GEX Levels draws the lines. While GEX Levels' own "Call wall broken" / "Put wall broken"
marks are on, the walls' breaks are left to them. On daily and weekly bars only the day markers show.

**0DTE magnet events are off by default:** the magnet can be touched many times a day. Turn them on in the Style tab.

**Zoomed out**, when the bars are narrower than 8 px, the markers keep their shapes without their tags (CW, PW, ...), so
they do not run into each other; zoom in to read the tags, or hover a bar.

## Add it to your chart

```html
<div data-flashalpha-chart data-symbol="SPY" data-layers="levels,events" style="height: 560px"></div>
<script async src="https://charts.flashalpha.com/embed.js" data-key="YOUR_FLASHALPHA_API_KEY"></script>
```

## FAQ

**Why do the markers not match the candles of a 15-minute chart exactly?**
The events come from 1-minute bars; on a longer interval they sit on the bar that contains their minute.

**Why are there no markers on daily bars?**
The touches and breaks are intraday events. Daily and weekly bars show the day markers only.

**Is a rejection a signal to trade?**
No. It records what the price did at a level; read it with the regime, the flow and your own plan.

---

Related: [GEX Levels](gex-levels.md) · [0DTE hedging flow](0dte-hedging-flow.md) · [Net GEX](net-gex.md) ·
[Get a free FlashAlpha API key](https://flashalpha.com/pricing?utm_source=github&utm_medium=docs&utm_campaign=tradingview-gex-flashalpha)
