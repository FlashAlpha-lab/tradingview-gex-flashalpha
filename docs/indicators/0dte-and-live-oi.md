# 0DTE GEX levels and live open interest

Two settings change what every FlashAlpha GEX indicator is computed on: **Expiries** (all expirations, or today's 0DTE
expiry only) and **Open interest** (settled at the last close, or live with today's option flow).

[← All indicators](../../README.md#indicators-at-a-glance) · Lowest plan: **Growth** (0DTE), **Alpha** (live OI) ·
[Live demo](https://flashalpha-lab.github.io/tradingview-gex-flashalpha/)

---

## Expiries: All or 0DTE (Growth)

With **0DTE**, the call wall, put wall, gamma flip, 0DTE magnet, net GEX, strike heatmap and GEX profile use options that
expire today only.

**Benefits**

- **Today's levels for today's trade.** Same-day options make up a large share of index options volume, and their
  gamma is the strongest close to expiry. 0DTE walls are often the levels the price reacts to intraday.
- **Tighter, more precise levels.** 0DTE strikes cluster near the price, so the walls and the magnet sit where the
  intraday action is.
- **See the pin forming.** The 0DTE magnet with the strike heatmap shows which strike is pulling the price into the close.

## Open interest: Settled or Live (Alpha)

Exchanges publish open interest once a day. **Settled** uses that figure. **Live** adds today's option flow to it, so
the levels follow new positions as they open during the session.

**Benefits**

- **No waiting for tomorrow's update.** A large block of calls bought at 11:00 moves the call wall at 11:00, not the next
  morning.
- **Catch shifts on event days.** Earnings, Fed days and expiration days change positioning fast; live open interest
  keeps up.

## Good to know

- The previous-session levels on daily and weekly bars cover all expiries on settled open interest, so they hide while
  0DTE or Live is on.
- With Live, the strike heatmap and profile use the Net GEX lens (delta, vanna and charm per strike need settled data).
- Days without a same-day expiry have no 0DTE levels.

## Add it to your chart

Open the **Indicators** menu, press the options button (⚙) of **GEX Levels**, and in the Inputs tab set **Expiries** to
0DTE and **Open interest** to Live. The choice applies to every GEX indicator on the chart. From code, the same is
`chart.setExposure({ scope: 'zero_dte', basis: 'live' })`.

---

Related: [GEX Levels](gex-levels.md) · [Strike heatmap and GEX profile](gex-by-strike.md) · [Greeks and 0DTE metrics](metrics-pane.md) ·
[Compare FlashAlpha plans](https://flashalpha.com/pricing?utm_source=github&utm_medium=docs&utm_campaign=tradingview-gex-flashalpha)
