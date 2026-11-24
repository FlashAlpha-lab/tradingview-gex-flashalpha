/** Escapes text for innerHTML: symbols, statuses and details come from the host page or the API. */
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const num = (v, d = 2) => v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export const big = v => v == null ? '—'
  : Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M'
  : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(Math.round(v));

/** Index of the last element of sorted `times` that is <= t, or -1. For layer plugins (ctx.util). */
export function floorIndex(times, t) {
  let lo = 0, hi = times.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at;
}
