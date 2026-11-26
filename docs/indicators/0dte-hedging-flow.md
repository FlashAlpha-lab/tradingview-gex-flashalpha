# 0DTE hedging flow indicator: what dealers had to buy or sell today

**0DTE hedging flow** estimates the stock dealers had to buy or sell since the 9:30 ET open to hedge the options on
today's expiry traded today. Above zero (blue), dealers are net buyers; below zero (orange), net sellers. It sits in a
pane under the price, with the flow of each bar as a histogram at the pane's bottom.

[← All indicators](../../README.md#indicators-at-a-glance) · Lowest plan: **Growth** ·
[Live demo](https://flashalpha-lab.github.io/tradingview-gex-flashalpha/)

---

## What the hedging flow means

Every 0DTE trade is classed as bought or sold by the side that crossed the spread. That side is taken to be a customer
and the dealer the other one, so the dealer has to hedge the opposite way:

| Customers | Dealers are left | Dealers hedge by | On the line |
|---|---|---|---|
| **Buy calls** | Short calls | Buying stock | Up (+) |
| **Sell calls** | Long calls | Selling stock | Down (−) |
| **Buy puts** | Short puts | Selling stock | Down (−) |
| **Sell puts** | Long puts | Buying stock | Up (+) |

Each trade counts its delta × price × 100 (delta-dollars, $Δ) at the greeks of its minute, and the line adds them up
from the open.

What it is **not**:

- Not the dealers' re-hedging as price and time move (gamma and charm). That side is in [Net GEX](net-gex.md) and in
  the metric pane's *Dealer hedge if ±1 %*.
- Not the dealers' whole position: positions opened before today, and trades at the mid, are left out.
- An estimate: a trade between two customers counts as if a dealer took it.

## What you see on the chart

- **The line:** the flow since the open, blue above zero and orange below (not green / red: next to Net GEX those mean
  long and short gamma). Each session starts at zero, so the line breaks at each open instead of sloping from the last
  close to zero. With more than one session on screen, the sessions around the one under the crosshair fade.
- **The histogram:** the flow in each bar (the change since the bar before), in the line's colours.
- **Calls and Puts** (off by default, Style tab): the two legs of the total, dashed.
- **Div markers:** **Div ▼** (orange) where the price makes a new session high while the flow is lower than at a session
  high at least 15 minutes earlier: the rise has less hedging behind it. **Div ▲** (blue) the same at lows. Hover the
  bar for the values.
- **The legend line:** the total, its change over the last 15 minutes (`15m`), and the legs while they show, for
  example `+$780.0M 15m +$30.0M Calls +$1.56B Puts −$780.0M`. On daily bars, `Session` and the session's total.
- **[Level events](level-events.md):** a break of a GEX level or a gamma flip crossing says in its hover box how the flow moved in the 5
  minutes to its bar, and whether that was **with the move** or **against the move**.

## Benefits

1. **Who is pushing.** A steep rise is hedging that adds buying pressure; a steep fall, selling pressure. The slope says
   more than the level.
2. **Moves with or without backing.** A new high with a falling flow (Div ▼) has less hedging behind it and stalls more
   often; a new high with a rising flow is backed.
3. **Better level breaks.** Pair it with [GEX Levels](gex-levels.md) and [Level events](level-events.md): a call wall break with the flow
   the same way is better backed than one against it.
4. **Calls or puts.** The legs show whether the flow comes from call buying, put selling, or the other side.
5. **Across symbols and days.** In **% move** units the flow is set against the session's 0DTE gamma, so a large-cap
   index and a single stock read on the same scale.

## Settings

| Setting | Options |
|---|---|
| Inputs: Units | **$Δ (delta-dollars)** (default), or **% move (vs 0DTE gamma)**: the flow over the session's mean 0DTE net GEX ($ per 1 % move), the move whose gamma hedge would trade as much |
| Style | Line colour above zero, width, line style, price line, axis label; colour below zero; Calls and Puts lines (off by default); Flow per bar (histogram) on or off; Divergence with price on or off |

From code: `options.hedgeUnits` (`'usd'` or `'move'`) and `chart.setHedgeUnits(units)`.

## Add it to your chart

```html
<div data-flashalpha-chart data-symbol="SPY" data-layers="levels,hedgeflow" data-resolution="1m" style="height: 560px"></div>
<script async src="https://charts.flashalpha.com/embed.js" data-key="YOUR_FLASHALPHA_API_KEY"></script>
```

## FAQ

**Which intervals show it?**
1m to 1h. On 1d each session's total is a bar; on 1w there is none (the total starts again every day).

**How current is it?**
About 2 minutes behind: a minute is counted once it has closed and its trades are in.

**Why is a symbol or a day empty?**
Only symbols with a same-day expiry that are tracked for 0DTE flow have a value, and only from the 9:30 ET open.
Calls and Puts are empty before the call / put split was recorded.

**Why does the total look short after a gap?**
Minutes the sampler missed are not filled in later, so their flow is missing from the total.

**Is it a signal to buy or sell?**
No. It shows the pressure dealer hedging puts on the price; read it with the levels, the regime and the price itself.

---

Related: [GEX Levels](gex-levels.md) · [Net GEX](net-gex.md) · [Level events](level-events.md) · [Expected move](expected-move.md) ·
[Get a free FlashAlpha API key](https://flashalpha.com/pricing?utm_source=github&utm_medium=docs&utm_campaign=tradingview-gex-flashalpha)
