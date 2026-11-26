# Expected move indicator: the options-implied range on the price chart

**Expected move** draws the move the options market prices in for the session: a band from the session's open to
**+1σ** (light green) and **−1σ** (light red), filled faintly between them. Hover a bar to see its
close against the band.

[← All indicators](../../README.md#indicators-at-a-glance) · Lowest plan: **Growth** ·
[Live demo](https://flashalpha-lab.github.io/tradingview-gex-flashalpha/)

---

## What the expected move means

The expected move is one standard deviation (1σ) of the price over the session, implied by option prices. If moves were
normally distributed, the price would close inside ±1σ on about 2 sessions in 3.

| Where the price is | What it tells you |
|---|---|
| **Inside the band** | A normal session: the move the options priced in |
| **At +1σ or −1σ** | The edge of the expected range: moves often stall there, or speed up when it breaks |
| **Far beyond the band** | A rare session: news, a gap or a squeeze moved the price further than options expected |

## What you see on the chart

- Each session's band starts at the 9:30 ET open, when the move is taken: **EM +1σ** dotted light green, **EM −1σ** dotted
  light red (lighter than the call wall's green and the put wall's red, so the band and the walls read apart), the open to
  +1σ filled green and the open to −1σ filled red. On the price scale: `EM +1σ`, `EM −1σ`; `+1σ`, `−1σ` on a phone or
  while the GEX profile draws at the right edge (the walls then read `CW`, `PW`).
- On daily bars each day has its own band from its open. On weekly bars the band is the week's: its first session's 1σ
  × √5, from the week's open.
- The legend line: the band, the 1σ in dollars, and how many finished sessions in view stayed inside ±1σ, for example
  `+1σ 605.00 −1σ 595.00 1σ ±5.00 Inside 14/20 (70%)`. The ⓘ explains the band and shows the session's IV30, RV20,
  VRP and VIX state.
- **Hover a bar:** nodes on its close and on the band, and a box above them with the date, the close (how many σ it is
  from the open) and how far +1σ and −1σ are from the close in percent.

## Benefits

1. **A frame for the day.** Targets, stops and entries next to the range the options market expects.
2. **Fade or follow.** A test of +1σ with positive gamma often stalls; a break with negative gamma often runs. Pair it
   with [GEX Levels](gex-levels.md) and [Net GEX](net-gex.md).
3. **Option strikes.** Sellers look for strikes outside the band; buyers need a move larger than it to profit.
4. **How reliable the band was.** The Inside count shows how often the price stayed inside it in the sessions on screen.

## Settings

| Setting | Options |
|---|---|
| Style | EM +1σ and EM −1σ colour, width, line style, price line, axis label; Band fill on or off |

## Add it to your chart

```html
<div data-flashalpha-chart data-symbol="SPY" data-layers="levels,em" style="height: 560px"></div>
<script async src="https://charts.flashalpha.com/embed.js" data-key="YOUR_FLASHALPHA_API_KEY"></script>
```

## FAQ

**Why does the band start at 9:30 ET?**
The move is computed at the open, so the band is drawn from the open. Before it, and in the pre-market, there is none.

**Why is a session missing its band?**
Its value was not computed that day, or the window starts after its 9:30 bar.

**Is the expected move a prediction of direction?**
No. It is a range in both directions; where the price goes inside it depends on positioning and news.

---

Related: [GEX Levels](gex-levels.md) · [Net GEX](net-gex.md) · [Strike heatmap and GEX profile](gex-by-strike.md) ·
[Get a free FlashAlpha API key](https://flashalpha.com/pricing?utm_source=github&utm_medium=docs&utm_campaign=tradingview-gex-flashalpha)
