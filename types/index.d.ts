import type { IChartApi, ISeriesApi } from 'lightweight-charts';

/** Bar resolutions. Gamma exposure levels are drawn on the intraday ones (`1m` to `1h`). */
export type Resolution = '1m' | '5m' | '15m' | '1h' | '1d' | '1w';

/** `rth` regular hours, `eth` with pre-market and after-hours. */
export type Session = 'rth' | 'eth';

/** `auto` follows the reader's `prefers-color-scheme`. */
export type Theme = 'dark' | 'light' | 'auto';

/** FlashAlpha plans, lowest first. */
export type Plan = 'free' | 'basic' | 'growth' | 'alpha' | 'enterprise';

/** The lightweight-charts 5 module (`import * as LightweightCharts from 'lightweight-charts'`). */
export type LightweightChartsModule = typeof import('lightweight-charts');

/** One OHLCV bar. Times are UTC ISO 8601 strings. */
export interface Bar {
    ts: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume?: number | null;
    /**
     * Where the bar comes from; `spot` marks candles built from exposure rows, `quotes` a bar built from quote mids (drawn
     * muted, without volume, unless the symbol's `asset_class` is `index`).
     */
    source?: string;
}

/** Gamma exposure levels at one time. A `null` level is drawn as a gap. */
export interface ExposureRow {
    ts: string;
    call_wall?: number | null;
    put_wall?: number | null;
    /** Which walls the API sent: `oi` (most call / put open interest on each side of spot) or `gex` (gamma walls). */
    walls?: 'oi' | 'gex' | null;
    max_pain?: number | null;
    /** A `status` other than `available` draws the flip in grey. */
    gamma_flip?: { last: number | null; status?: string } | null;
    /** Spot in the bucket: the chart draws muted candles from it after the last stored bar. */
    spot?: { first: number | null; min: number | null; max: number | null; last: number | null } | null;
    [column: string]: unknown;
}

/** An exposure row on a bar, as layer plugins see it (`ctx.exposure`). */
export interface ChartExposureRow extends ExposureRow {
    /** The bar's chart time: ET wall-clock seconds written as UTC. */
    time: number;
}

/** A session's close levels (`levels_daily`): drawn dashed over the next session. `ts` is the session date. */
export interface DailyLevelsRow {
    ts: string;
    call_wall?: number | null;
    put_wall?: number | null;
    /** As in `ExposureRow`. */
    walls?: 'oi' | 'gex' | null;
    gamma_flip?: number | null;
    gamma_flip_status?: string | null;
    max_pain?: number | null;
    /** A status other than `ok` leaves a gap. */
    status?: string;
}

/** The `charts()` answer. */
export interface ChartsResponse {
    exposure?: ExposureRow[];
    levels_daily?: DailyLevelsRow[];
    /** Per API layer: data, or `{ status: 'gated' }` when the plan does not include it. */
    layers?: Record<string, { status?: string; [k: string]: unknown }>;
    /** The key's plan: layers above it are locked. */
    plan?: Plan | string | null;
    /** An error code or message; the chart shows it instead of an empty chart. */
    error?: string;
    [k: string]: unknown;
}

/** The `charts()` query: the API layers to read, the session, and parameters set by plugins (`ctx.setQuery`). */
export interface ChartsQuery {
    layers: string[];
    session: Session;
    [param: string]: unknown;
}

type MaybePromise<T> = T | Promise<T>;

/** Where the chart reads its data. `chartEngineSource()` reads the FlashAlpha chart API; any backend with the same shapes works. */
export interface DataSource {
    symbols(): MaybePromise<Array<{ symbol: string; last_bar?: string | null; first_bar?: string | null; asset_class?: string | null }>>;
    /** `extra.sessions` (1D/5D intraday): the window is that many trading sessions ending at `toIso`; `fromIso` is an approximation. */
    bars(symbol: string, resolution: Resolution, fromIso: string, toIso: string, session: Session, extra?: { sessions?: number }): MaybePromise<{ bars?: Bar[]; error?: string; message?: string }>;
    charts(symbol: string, resolution: Resolution, fromIso: string, toIso: string, query: ChartsQuery): MaybePromise<ChartsResponse>;
}

/** Your logo instead of the TradingView logo on the chart, with a "Charts by TradingView" link under the chart. */
export interface Brand {
    logo: string;
    href: string;
    name?: string;
}

export interface MountOptions {
    /** Ticker. Default: the first symbol with data. */
    symbol?: string | null;
    /** Default `5m`. */
    resolution?: Resolution;
    /** Days to show; each resolution has a maximum. Default: per resolution. */
    days?: number | null;
    /** Default `rth`. */
    session?: Session;
    /**
     * Layer ids: `levels`, `maxpain`, and ids of registered layer plugins. Default: none (price and volume only). The layers
     * the reader picked last time (see `storage`) win over this.
     */
    layers?: string[];
    /** `false` does not remember the reader's layers in localStorage. Default `true`. */
    storage?: boolean;
    /** The localStorage key of the remembered layers, to keep charts apart. Default `'tradingview-gex-flashalpha:layers'`. */
    storageKey?: string;
    /** `true` shows the Upgrade box over the chart while a layer that is on needs a higher plan. Default `false` (hidden for now). */
    upsell?: boolean;
    /** `false` hides the toolbar (and the Layout menu: one chart). */
    controls?: boolean;
    /** The Layout menu next to Settings: one to four charts. `false` mounts one chart. Default `true`. */
    layouts?: boolean;
    /** The layout the chart opens with; the reader's last pick (remembered) wins. Default `'1'`. */
    layout?: LayoutId;
    /** `false` hides the symbol dropdown (with its search box). */
    symbolButtons?: boolean;
    /** `false` draws candles only. */
    exposure?: boolean;
    /** Your own data. Default: the FlashAlpha chart API at `baseUrl`. */
    source?: DataSource | null;
    /** Chart API root. Default: same origin. */
    baseUrl?: string;
    /** FlashAlpha API key, sent as `X-Api-Key`. Default: the `setLicenseKey` value. */
    apiKey?: string | null;
    /** Seconds between refreshes while the page is visible; `0` turns refresh off. Default 60. */
    refresh?: number;
    /**
     * `true` draws 1m to 1h candles and levels live from the chart API's WebSocket (`/v1/live`), with the FlashAlpha chart
     * API as the source; while it is connected the refresh runs every 5 minutes. Default `false`.
     */
    live?: boolean;
    /** Default `dark`. */
    theme?: Theme;
    /**
     * Background colour. Default: per theme (CSS variable `--fac-bg`). A dark colour goes with the dark theme, a light one
     * with the light theme (the other theme keeps its own); a colour that is not hex or rgb() goes with both.
     */
    background?: string | null;
    /** Where locked layers and the Upgrade box link. Default: FlashAlpha pricing. */
    upgradeUrl?: string;
    /** `false` hides the toolbar's account button: "Sign up" without a plan, the plan's name with one. Default `true`. */
    account?: boolean;
    /** Where the toolbar's "Sign up" button and the signed-out "Sign up free" box link. Default: FlashAlpha pricing. */
    signupUrl?: string;
    /** Shows load status in the toolbar; `'latency'` also the live lag (p50/p95, receive minus the newest print). */
    debug?: boolean | 'latency';
    /** The line under the chart next to the credit; `''` hides it. Default: the model-estimate note. */
    note?: string;
    brand?: Brand | null;
    /** The lightweight-charts module, when you import it instead of loading the script. Default: `window.LightweightCharts`. */
    lightweightCharts?: LightweightChartsModule;
    /** `false` does not add the chart's `<style>` to the page; load `tradingview-gex-flashalpha/style.css` yourself. Default `true`. */
    injectCss?: boolean;
    /** Plot styles by plot id, over the plugins' defaults, e.g. `{ callWall: { color: '#00c853', lineWidth: 2 } }`. */
    styles?: Record<string, Partial<PlotStyle>> | null;
}

/** How a plot (an indicator line) is drawn; its layer's options (Style tab) change it. */
export interface PlotStyle {
    color: string;
    lineWidth: 1 | 2 | 3 | 4 | number;
    lineStyle: 'solid' | 'dotted' | 'dashed';
    visible: boolean;
    /** The dotted line at the latest value. */
    priceLine: boolean;
    /** The label on the price scale. */
    axisLabel: boolean;
}

/** A line a layer plugin draws, listed in its indicator's Style tab. Defaults: width 1, solid, visible, price line, label. */
export interface PlotDef extends Partial<PlotStyle> {
    id: string;
    title: string;
    /** The layer id the plot belongs to. */
    layer?: string;
    /** Its colour (a `toggle` may have none: a switch only). */
    color?: string;
    /** Only a colour in the Style tab (a colour the plugin uses, not a series of its own). */
    colorOnly?: boolean;
    /** Only a switch and a colour in the Style tab (something the plugin shows or not, e.g. markers; no line of its own). */
    toggle?: boolean;
}

/** A key-level item in the legend: label, value, the previous session's value, and a CSS class (`up`, `dn`). */
export interface LegendLevel {
    label: string;
    /** A number (with its change against `prev`), or a string shown as it is. */
    value: number | string | null | undefined;
    prev?: number | null;
    cls?: string;
    /** Writes a number and its change (default: two decimals), e.g. a compact 1.08B for net GEX. */
    format?: (value: number) => string;
    /** The plot it reads: the value takes the plot's colour, and the part is left out while the plot is hidden. */
    plot?: string;
    /** The layer it belongs to (default: its plot's): left out while that layer's values are off the status line. */
    layer?: string;
    /** A colour for the value, over the plot's. */
    color?: string;
    /** Shown in brackets after the value, e.g. `'broken'` → "Put wall 730.00 (broken)". */
    note?: string;
}

/** A colour scale in an indicator's legend line: `from`, a gradient through `ramp`, `to`; `title` shows on hover. */
export interface LegendRamp {
    ramp: string[];
    from?: string;
    to?: string;
    title?: string;
    /** The layer it belongs to: left out while that layer's values are off the status line. */
    layer?: string;
}

/** An ⓘ in an indicator's legend line: `info` shows on hover or click. */
export interface LegendInfo {
    info: string;
    /** What it is about, for screen readers: the button reads "About <about>" (default "About"). */
    about?: string;
    /** The layer it belongs to: left out while that layer's values are off the status line. */
    layer?: string;
}

/** A note in an indicator's legend line; `title` shows on hover. */
export interface LegendNote {
    text: string;
    title?: string;
}

/** A layout of the Layout menu: 1 to 4 charts. */
export type LayoutId = '1' | '2v' | '2h' | '3v' | '3h' | '3l' | '3r' | '3t' | '3b' | '4' | '4h' | '4v' | '4l' | '4r' | '4t' | '4b'
    | '4lc' | '4rc' | '4tr';

/**
 * What `mount` returns: the chart in focus's methods, plus the layout (one to four charts). `setSymbol`, `setTheme`,
 * `reload` and `destroy` act on every chart. With `layouts: false`, one chart without the layout members.
 */
export interface ChartInstance {
    setLayout?(id: LayoutId): void;
    readonly layout?: LayoutId;
    /** Every chart's methods, in layout order. */
    readonly charts?: ChartInstance[];
    /** The position of the chart in focus, from 0. */
    readonly active?: number;
    focus?(index: number): void;
    readonly symbol: string | null;
    readonly resolution: Resolution;
    /** Days back from now. */
    readonly range: number;
    readonly session: Session;
    setSymbol(symbol: string): Promise<void>;
    setResolution(resolution: Resolution): Promise<void>;
    /** Days back from now, capped per resolution. */
    setRange(days: number): Promise<void>;
    setSession(session: Session): Promise<void>;
    setLayers(layers: string[]): Promise<void>;
    setTheme(theme: Theme): void;
    /** The key's plan from the last answer, or `null` before it or without auth. */
    readonly plan: Plan | string | null;
    readonly layers: string[];
    /** Every plot's style by plot id (a copy). */
    readonly styles: Record<string, PlotStyle>;
    /** Changes a plot's style, as a layer's options do. */
    setStyle(plotId: string, style: Partial<PlotStyle>): void;
    reload(): Promise<void>;
    destroy(): void;
    /** The lightweight-charts instance, for your own series. */
    readonly chart: IChartApi;
    /** Methods added by layer plugins (`handle.methods`). */
    [method: string]: unknown;
}

/** Helpers for layer plugins. */
export interface PluginUtil {
    /** UTC ISO time → chart time (ET wall-clock seconds written as UTC). */
    etTime(iso: string): number;
    /** The ET date (`yyyy-mm-dd`) of a chart time. */
    dayOf(time: number): string;
    sessionOf(time: number): 'pre' | 'rth' | 'post';
    /** Index of the last element of sorted `times` that is <= `t`, or -1. */
    floorIndex(times: number[], t: number): number;
    /** Escapes text for HTML. */
    esc(value: unknown): string;
    num(value: number | null | undefined, digits?: number): string;
    /** 1.5B, 2.3M, 1.5K. */
    big(value: number | null | undefined): string;
    RES_SECONDS: Record<Resolution, number>;
}

/** What a layer plugin's `attach` receives, once per chart. */
export interface PluginContext {
    LW: LightweightChartsModule;
    chart: IChartApi;
    /** The chart's root element (`.fac`). */
    root: HTMLElement;
    options: MountOptions;
    colors: Record<'up' | 'down' | 'spotUp' | 'spotDown' | 'flip' | 'unverified' | 'maxpain', string>;
    /** A level line: steps through the day and a dotted line at its latest value. */
    /** With `plotId`, the line follows that plot's style (see `bindPlot`). */
    level(color: string, title: string, plotId?: string): ISeriesApi<'Line'>;
    /** Ties a series to one of the plugin's plots (`plots`): its layer's options restyle it. Returns the series. */
    bindPlot<S extends ISeriesApi<any>>(plotId: string, series: S): S;
    /** A plot's current style. */
    styleOf(plotId: string): PlotStyle;
    intraday(): boolean;
    /** True when the layer is picked, the plan includes it and it is not hidden with the legend's 👁 (in apiLayers: not hidden ignored). */
    on(layer: string): boolean;
    /** True when the layer is on but hidden with the legend's 👁: not drawn (e.g. keep its pane, empty). */
    hidden(layer: string): boolean;
    /** True when the key's plan is below `plan`. */
    lockedPlan(plan: Plan | string): boolean;
    /** The upgrade link, tagged with utm parameters. */
    upgradeHref(what?: string): string;
    readonly plan: Plan | string | null;
    readonly candles: ISeriesApi<'Candlestick'> | null;
    /** The drawn bars, each with its chart `time`. */
    readonly bars: Array<Bar & { time: number }>;
    /** The exposure rows of the last load on bar times. */
    readonly exposure: ChartExposureRow[];
    readonly symbol: string | null;
    readonly resolution: Resolution;
    readonly query: Record<string, unknown>;
    /** Merged into the `charts()` request, then reloads; called from `attach` it only sets the first request. */
    setQuery(params: Record<string, unknown>): Promise<void>;
    /**
     * Adds a control: into an indicator's options (Inputs tab of each of its layers) under `el.title` (default), or the toolbar. The indicator is
     * the plugin's own, or the one named by `indicator`. False when the toolbar is hidden.
     */
    addControl(el: HTMLElement, where?: 'panel' | 'toolbar', indicator?: string): boolean;
    /** A note in the legend when no exposure row is under the crosshair. */
    note(text: string): void;
    /**
     * Keeps `px` free at the right edge of the price pane for what the plugin draws there (0 gives it back): room right of
     * the latest bar, the level lines without their titles (axis labels stay), the edge labels left of it.
     */
    reserveRight(px: number): void;
    /** The width `reserveRight` keeps free (0 for none). */
    readonly reservedRight: number;
    /** Draws again from the last answer, no request: every plugin's draw(), then the legend. */
    redraw(): void;
    util: PluginUtil;
}

/** What `attach` returns. Every member is optional. */
export interface PluginHandle {
    /** Once, after the candles exist (series added here are drawn over them). */
    ready?(): void;
    /** After every load, with the `charts()` answer. */
    draw?(response: ChartsResponse): void;
    /** When a load failed. */
    clear?(): void;
    /** Lines for the legend at `time`. */
    legend?(time: number, y: number | null): string[] | string | null | undefined;
    crosshair?(time: number | null, y: number | null): void;
    destroy?(): void;
    /**
     * Parts of an indicator's line in the legend (after spot on the core one); insert or append in place. `{ label, value, prev, cls }`
     * reads like a key level (change against `prev`); `{ text, title }` is a note with a tooltip; a string is text. `prev`:
     * the previous session's last row, or null.
     * Called once per indicator of the plugin that is on; `indicator` is its name.
     */
    legendLevels?(row: ChartExposureRow, parts: Array<LegendLevel | LegendNote | LegendRamp | LegendInfo | string>, prev: ChartExposureRow | null, indicator: string): void;
    /** The series of a pane of its own the indicator draws in: its legend line goes to the top left of that pane. */
    paneOf?(indicator: string): ISeriesApi<any> | null;
    /** Lines for panes that are no indicator of their own, at the top left of each `series`'s pane. */
    paneLegends?(time: number): Array<{ series: ISeriesApi<any>; name: string; parts?: Array<LegendLevel | LegendNote | string>;
        /** The indicator whose options the line's options button opens. */
        indicator?: string;
        /** Called by the line's remove button. */
        remove?(): void }>;
    /** Added to the object `mount` returns; core names win. */
    methods?: Record<string, (...args: any[]) => unknown>;
}

export interface LayerPlugin {
    /** The indicator (Indicators menu group) the layers belong to; plugins with the same name share one. Default: `name`, else the first layer's label. */
    indicator?: string;
    /** An indicator per layer id, over `indicator`: one plugin can fill several indicators, e.g. `{ heatmap: 'GEX by strike' }`. */
    indicators?: Record<string, string>;
    name?: string;
    /** Lines the plugin draws, listed in the indicator's Style tab; tie each series with `ctx.bindPlot`. */
    plots?: PlotDef[];
    /** `[id, menu label]` pairs. */
    layers: Array<[string, string]>;
    /** Layer ids turned on when `options.layers` is not given. */
    defaults?: string[];
    /** The lowest plan per layer id; a layer without one is never locked. */
    plans?: Record<string, Plan>;
    /** The API layers to request for the enabled ids. */
    apiLayers?(ctx: PluginContext): string[];
    /** Once per chart, before the candle series exists: series added here are drawn behind the candles. */
    attach(ctx: PluginContext): PluginHandle | void;
}

/** Mounts a chart that fills `container` and follows its size. */
export function mount(container: HTMLElement, options?: MountOptions): ChartInstance;

/** The FlashAlpha chart API (`/v1/symbols`, `/v1/bars`, `/v1/charts`) under `baseUrl`, the key sent as `X-Api-Key`. */
export function chartEngineSource(baseUrl?: string, apiKey?: string | null): DataSource;

/** Adds layers to every chart mounted after this call. */
export function registerLayers(plugin: LayerPlugin): void;

/** The key for every chart mounted after this call when `options.apiKey` is not given. */
export function setLicenseKey(key: string | null): void;

export const plans: Plan[];
export const version: string;

declare const FlashAlphaChart: {
    mount: typeof mount;
    chartEngineSource: typeof chartEngineSource;
    registerLayers: typeof registerLayers;
    setLicenseKey: typeof setLicenseKey;
    plans: Plan[];
    /** Every layer id a chart mounted now would offer. */
    readonly layers: string[];
    version: string;
};
export default FlashAlphaChart;

declare global {
    interface Window {
        /** Set by the script build (`dist/tradingview-gex-flashalpha.js`). */
        FlashAlphaChart?: typeof FlashAlphaChart;
        LightweightCharts?: LightweightChartsModule;
    }
}

