export const ET = 'America/New_York';
export const RESOLUTIONS = ['1m', '5m', '15m', '1h', '1d', '1w'];
/** Plot line styles (indicator Settings, Style tab) → lightweight-charts LineStyle values. */
export const LINE_STYLES = { solid: 0, dotted: 1, dashed: 2 };
/** The resolutions in words, for the interval dropdown. */
export const RES_LABELS = { '1m': '1 minute', '5m': '5 minutes', '15m': '15 minutes', '1h': '1 hour', '1d': '1 day', '1w': '1 week' };
export const INTRADAY = ['1m', '5m', '15m', '1h'];
export const RES_SECONDS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1d': 86400, '1w': 604800 };
export const RANGES = [['1D', 1], ['5D', 5], ['1M', 31], ['6M', 183], ['1Y', 366]];
export const DEFAULT_DAYS = { '1m': 1, '5m': 5, '15m': 5, '1h': 31, '1d': 183, '1w': 366 };
/** The longest window per resolution: about 10,000 bars (the bars API limit). */
export const MAX_DAYS = { '1m': 5, '5m': 31, '15m': 62, '1h': 366, '1d': 3660, '1w': 3660 };
/** Plans in order. The API returns the key's plan (response.plan); a layer above it is locked. */
export const PLANS = ['free', 'basic', 'growth', 'alpha', 'enterprise'];
export const PLAN_NAMES = { free: 'Free', basic: 'Basic', growth: 'Growth', alpha: 'Alpha', enterprise: 'Enterprise' };
export const UPGRADE_URL = 'https://flashalpha.com/pricing';
/**
 * Where the toolbar's "Sign up" button and the sign-up box link when the chart has no plan (signed out, no key). The
 * FlashAlpha site signs up from its pricing page (/register redirects there; /signup is 404).
 */
export const SIGNUP_URL = 'https://flashalpha.com/pricing';
/** Answers that the key is missing or not valid: the chart then locks like the free plan. */
export const KEY_ERRORS = ['api_key_required', 'invalid_api_key', 'invalid_embed_key'];
/** localStorage key of the layers the reader picked (options.storageKey). */
export const STORAGE_KEY = 'tradingview-gex-flashalpha:layers';
/** One line per plan for the Upgrade box: what the reader gets. */
export const PLAN_PITCH = {
  basic: 'See where dealers hedge: call wall, put wall, gamma flip, max pain.',
  growth: 'Strike heatmap, GEX profile and 0DTE.',
  alpha: 'Levels from live open interest, updated through the session.',
  enterprise: 'Everything, for your team and your site.',
};
/** Shown under the chart (options.note): what the levels are. */
export const NOTE = 'GEX levels are model estimates from open interest, not observed dealer positions. Not financial advice.';
/** API error codes in words for the page's readers (the code stays in the 'flashalpha:nodata' event). */
export const ERRORS = {
  api_key_required: 'Add your FlashAlpha key to show this chart.',
  invalid_api_key: 'This FlashAlpha key is not valid.',
  too_many_requests: 'Too many requests. Retrying in a minute.',
  too_many_key_lookups: 'Too many requests. Retrying in a minute.',
  auth_unavailable: 'Chart data is unavailable right now. Retrying.',
  questdb_unavailable: 'Chart data is unavailable right now. Retrying.',
  network: 'Could not reach the chart server.',
  timeout: 'The chart server did not answer.',
};
/** The sign-up box over the chart when the API wants a key (api_key_required: a signed-out reader). */
export const GATE = {
  title: symbol => symbol ? `Sign up free to see the ${symbol} chart` : 'Sign up free to see this chart',
  text: 'A free FlashAlpha account loads price and volume here. From the Basic plan the chart adds the levels dealers '
    + 'hedge around: call wall, put wall, gamma flip and max pain.',
  cta: 'Sign up free',
};
export const COLORS = { line: '#4f8cff', up: '#26a69a', down: '#ef5350', spotUp: '#5f8f8a', spotDown: '#9a6463', flip: '#fbbf24', unverified: '#6b7080',
  maxpain: '#a78bfa', volUp: 'rgba(38,166,154,0.35)', volDown: 'rgba(239,83,80,0.35)' };
/**
 * options.theme 'dark' (default), 'light' or 'auto' (follows prefers-color-scheme). `scheme` is the CSS color-scheme of
 * the browser's own controls in the chart (checkboxes, select lists, colour pickers).
 */
export const THEMES = {
  dark: { bg: '#0f1115', text: '#d6d9e0', muted: '#8a909c', line: '#262a33', grid: '#1b1e25', shadow: 'rgba(0,0,0,0.4)',
    shade: 'rgba(15,17,21,0.6)', scheme: 'dark' },
  light: { bg: '#ffffff', text: '#1f2430', muted: '#5b6270', line: '#d9dde4', grid: '#eef0f3', shadow: 'rgba(20,24,32,0.15)',
    shade: 'rgba(255,255,255,0.6)', scheme: 'light' },
};
/** Below this width (px) the toolbar and the legend are compact. */
export const NARROW = 560;
/** Below this width (px) level labels on the price axis drop their titles. */
export const TINY = 480;
