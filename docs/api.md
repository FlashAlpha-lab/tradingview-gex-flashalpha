# FlashAlpha chart API

The read API behind the chart widget. Base URL: `https://charts.flashalpha.com`. Every answer is JSON, field names in
snake_case, times in UTC ISO 8601. A `null` value means "unknown"; it is never filled with the previous value.

## Keys

Send the key in the `X-Api-Key` header (CORS allows `GET` from any origin with this header).

| Key | Where | What it can do |
|---|---|---|
| Secret API key (your FlashAlpha account key) | servers only | read every layer of your plan; mint embed keys |
| Embed key `fa_pk_…` | public pages | read every layer of the plan it was minted with, only from the domains it lists (checked on `Origin`, else `Referer`; subdomains included); cannot mint keys; never reaches the main FlashAlpha API |

### Mint an embed key

`POST /v1/embed-keys` with the secret key.

```http
POST /v1/embed-keys
X-Api-Key: <secret key>
Content-Type: application/json

{ "domains": ["example.com"], "ttl_seconds": 3600 }
```

- `domains`: 1 to 10 host names (no scheme, no path), at least two labels (`example.com`); a bare TLD, `localhost` and IP
  addresses are refused.
- `ttl_seconds` (optional): 300 up to 30 days; default 30 days. A site with a backend mints short-lived keys per page view;
  a static site mints a 30-day key and renews it.
- `plan` (optional): a plan up to yours (`free`, `basic`, ...), for a page that should show fewer layers.
- `delay_minutes` (optional): 15 to 1440. A delayed key reads nothing newer than now minus the delay (`/latest` is refused
  with `403 delayed_key`), and may live up to 365 days.

Answer `200`:

```json
{ "key": "fa_pk_…", "id": "424fba899475ef1f", "plan": "growth", "domains": ["example.com"], "expires_at": "2026-12-16T10:00:00Z",
  "delay_minutes": 0 }
```

The key carries the plan it was minted with until it expires. Errors: `403 secret_key_required` (an embed key tried to mint),
`400 domains_required`, `400 invalid_ttl`, `400 invalid_plan`, `400 invalid_delay`, `404 embed_keys_off`. FlashAlpha can revoke a key by its `id`.

## Plans and layers

| Plan | Layers |
|---|---|
| Free | bars only |
| Basic | `exposure` (walls, gamma flip, max pain, net GEX, regime, 0DTE magnet, vanna / charm / delta exposure) on scope `all` |
| Growth | plus `strikes`, `daily`, `metrics`, and the scopes `zero_dte`, `front`, `monthly` |
| Alpha, Enterprise | plus basis `live` |

A layer above the key's plan answers `{"status": "gated"}` in `layers` and has no data. `/v1/charts` also returns `plan`.

## Endpoints

### `GET /v1/symbols`

The symbols the engine serves. `first_bar` older than 10 days is the date of the first daily bar (00:00 UTC of that
session); `last_bar` is the newest 1m bar, or the date of the last daily bar (00:00 UTC) when the symbol has no 1m bar in
the last 10 days (no longer traded, or a longer gap).

```json
[{ "symbol": "SPX", "asset_class": "index", "enabled_from": "2026-01-02", "first_bar": "2025-11-03T00:00:00Z",
   "last_bar": "2026-11-13T20:59:00Z", "sources": ["quotes", "trades"], "reconciled_through": "2026-11-12" }]
```

### `GET /v1/bars/{symbol}`

OHLCV bars.

| Parameter | Default | |
|---|---|---|
| `resolution` | required | `1m 5m 15m 1h 1d 1w 1M` |
| `from`, `to` | last 5 days (intraday) or 2 years (daily and up), ending now | ISO 8601 UTC |
| `sessions` | none | intraday, 1 to 5: the window starts at 00:00 ET of the Nth latest trading session up to `to` (exchange calendar: weekends and holidays skipped; today counts once its session has opened), and `from` is ignored. `5` is TradingView's 5D. `400 invalid_sessions` outside 1 to 5 |
| `limit` | 5000 | at most 10000 |
| `session` | `rth` | `rth` (09:30–16:00 ET) or `eth` (04:00–20:00 ET) |
| `adjust` | `none` intraday, `split` daily | `none`, `split`, `all` (splits and dividends) |

```json
{ "symbol": "SPY", "resolution": "5m", "session": "rth", "adjust": "none", "from": "…", "to": "…", "count": 78,
  "bars": [{ "ts": "2026-11-13T14:30:00Z", "closed": true, "open": 671.2, "high": 671.9, "low": 670.8, "close": 671.5,
             "volume": 1203344, "vwap": 671.4, "buyVolume": 600112, "sellVolume": 580210, "tradeCount": 9120, "source": "trades" }] }
```

Bar fields are camelCase here (`buyVolume`, `sellVolume`, `tradeCount`: the ingest's bar names), while the live feed
(`/v1/live`, see realtime.md) sends the same bar with snake_case names (`buy_volume`, `sell_volume`, `trade_count`) like
the rest of this API. Both wire formats stay as they are; a client reading both maps the three names.

`ts` is the start of the bar; daily bars carry the ET session date at 00:00 UTC. `source` is `trades`, `quotes` (bars from
quote samples: no volume) or a mix. `GET /v1/bars/{symbol}/latest?resolution=1m` returns `{ symbol, resolution, bar }` with
the newest bar, the open minute included (`closed: false`).

### `GET /v1/charts/{symbol}`

Options-positioning layers for a window.

| Parameter | Default | |
|---|---|---|
| `resolution` | `5m` | `1m 5m 15m 1h 1d 1w`; `exposure`, `strikes`, `metrics` are intraday only |
| `from`, `to` | last 5 days, ending now | ISO 8601 UTC; the window is at most 5 days on 1m, 31 on 5m, 62 on 15m, 366 on 1h, 3660 on 1d and 1w (`400 range_too_long` with `max_days`) |
| `sessions` | none | intraday, 1 to 5 trading sessions up to `to`, as on `/v1/bars` (`from` ignored; may exceed the 1m cap over a holiday weekend) |
| `layers` | `exposure` | comma list of `exposure`, `strikes`, `daily`, `metrics` |
| `scope` | `all` | expiries: `all`, `zero_dte`, `front`, `monthly` |
| `basis` | `settled` | open interest: `settled` (last close) or `live` (with today's flow) |
| `session` | `rth` | `rth` or `eth` |
| `metrics` | none | with `layers=metrics`: up to 8 column names from `/v1/metrics/columns` |
| `model_ver` | newest in the window | pin a model version |

Answer:

```json
{
  "symbol": "SPX", "resolution": "5m", "scope": "all", "basis": "settled", "session": "rth", "from": "…", "to": "…",
  "plan": "growth", "model_ver": "gex-2026.10",
  "exposure": [{
    "ts": "2026-11-13T19:55:00Z",
    "spot": { "first": 5051.2, "min": 5049.8, "max": 5056.5, "last": 5056.5 },
    "net_gex": { "first": -1.2e7, "min": -2.0e7, "max": -1.1e7, "last": -1.75e7 },
    "gamma_flip": { "first": 5030, "min": 5030, "max": 5035, "last": 5030, "status": "available" },
    "regime": "negative_gamma", "call_wall": 5100, "put_wall": 5000, "walls": "oi", "call_wall_gex": 5075, "put_wall_gex": 5025,
    "max_pain": 5050, "zero_dte_magnet": 5055,
    "net_dex": 1.1e9, "net_vex": -3.2e8, "net_chex": 4.0e7,
    "as_of": "2026-11-13T19:59:00Z", "data_quality_score": 0.98, "snapshot_age_s": 12
  }],
  "strikes": [{ "ts": "2026-11-13T19:55:00Z", "rows": [[5050, 1.2e8, 10234, 8122, 2.1e9, -3.0e7, 4.0e6], [5055, -4.0e7, 7120, 9001, -1.4e9, 1.2e7, null]] }],
  "daily": [{ "ts": "2026-11-13T00:00:00Z", "open_call_wall": 5075, "open_put_wall": 5025, "open_gamma_flip": 5030,
              "max_pain": 5050, "iv30": 14.2, "rv20": 11.8, "vrp": 2.4, "expected_move_1d": 38.5, "opex": false, "earnings": null }],
  "metrics": [{ "ts": "…", "values": { "zero_dte_vol_context_vix": 15.3 } }],
  "layers": {
    "exposure": { "status": "ok", "count": 78, "last_ts": "…", "missing_minutes": 0, "source": "sampler" },
    "strikes": { "status": "ok", "count": 78, "last_ts": "…" }
  }
}
```

- `exposure`: one row per bar. `call_wall` / `put_wall` are the open-interest walls when `walls` is `"oi"`: the strike with
  the most call OI at or above spot and the one with the most put OI at or below it, from the session's settled OI (strikes
  within 10 % of the opening spot); a strike changes side only once a whole bar is more than 0.5 % past it, so the walls do
  not flip while spot sits on a big strike. With `walls: "gex"` (no strike data for the session, the screener rows, the
  `live` basis) they are the gamma walls of `/v1/exposure/levels`, which every row also has as `call_wall_gex` /
  `put_wall_gex`. `call_wall_gex`, `put_wall_gex`, `max_pain` and `zero_dte_magnet` are the strike held most minutes
  in the bar, `gamma_flip.last` is the bar's median flip (on 1m the minute's own; when the bar's minutes split evenly
  between two flips more than 0.1 % apart, the one nearer the previous bar's flip) and `gamma_flip.status` the status held
  most of the minutes that have a flip (all minutes when none has one); the other fields are the last value in the bar. `spot`, `net_gex` and `gamma_flip` also give
  first / min / max. `gamma_flip.status` is `available` once the flip is certified. `regime` is `positive_gamma` or
  `negative_gamma`.
  `layers.exposure.source` says where the rows come from. `sampler`: `exposure_1m`, written by the exposure sampler for a
  few tickers. `screener`: on scope `all`, basis `settled`, when the window has no `exposure_1m` row, the rows are built
  from the screener's per-minute `ticker_metrics_1m` rows (producers `*-screener`, ~280 tickers, no extra production-API
  load), same shape: `regime` is `positive_gamma` when spot ≥ flip, `as_of` is the bucket's last minute,
  `data_quality_score`, `snapshot_age_s` and `model_ver` are null, and `missing_minutes` is not reported. The screener
  writes around the clock: `session=rth` keeps its rows from 09:30 to 16:00 ET, `eth` keeps all of them. Strikes, the
  `zero_dte` scope and the `live` basis stay sampler-only.
- `strikes`: per bar, the last 5-minute snapshot per strike: `[strike, net_gex, call_oi, put_oi, net_dex, net_vex, net_chex]`
  (gamma, delta, vanna and charm exposure), strikes within 2% of the window's price range. `span_s`: seconds a snapshot
  covers; a window over more than one session gets 15-minute snapshots at least, and a long one coarser still (at most 600
  per answer: two months of 15m bars get 30-minute ones), so the row cap never cuts days off. Exposures have 4
  significant digits and open interest is whole.
- `daily`: one row per session (open levels, IV30, RV20, VRP, VIX state, opex, earnings).
- `layers.{name}.status`: `ok`, `partial` (exposure with missing minutes), `missing` (no rows), `gated` (not in the plan),
  `unsupported_resolution`.

### `GET /v1/metrics/columns`

The per-minute metric columns `metrics=` accepts: `{ "columns": ["summary_hedging_estimate_spot_up_1pct_notional_usd", …] }`.

## Errors and limits

Every error is `{ "error": "<code>" }` with the HTTP status.

| Status | Codes |
|---|---|
| 400 | `invalid_resolution`, `invalid_range`, `range_too_long`, `invalid_ttl`, `invalid_layers`, `invalid_scope_or_basis`, `invalid_session`, `invalid_adjust` |
| 401 | `api_key_required`, `invalid_api_key`, `invalid_embed_key`, `embed_key_expired`, `embed_key_revoked` |
| 403 | `origin_not_allowed` (embed key on another domain), `delayed_key` (a delayed key on `/latest` or minting) |
| 404 | `unknown_symbol` |
| 429 | `too_many_requests` (per key: 600 a minute for embed keys and API keys), `too_many_key_lookups` (unknown keys per client) |
| 503 | `auth_unavailable`, `questdb_unavailable` (retry) |

Answers are not cached by browsers or proxies (`Cache-Control: no-store`). The server shares `/v1/bars` and `/v1/charts`
answers for 30 seconds per query string and plan, so ask for windows rounded to the minute (the widget does).
