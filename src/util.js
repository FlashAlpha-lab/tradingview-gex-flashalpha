/** Escapes text for innerHTML: symbols, statuses and details come from the host page or the API. */
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const num = (v, d = 2) => v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export const big = v => v == null ? '—'
  : Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M'
  : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(Math.round(v));

/** The colour keys of one point that draw a line series' segment and its fill, by lightweight-charts series type. */
export const GAP_KEYS = {
  line: ['color'],
  area: ['lineColor', 'topColor', 'bottomColor'],
  baseline: ['topLineColor', 'bottomLineColor', 'topFillColor1', 'topFillColor2', 'bottomFillColor1', 'bottomFillColor2'],
};

/**
 * Points for a line, area or baseline series where a whitespace point ({ time } only) is a gap that stays a gap.
 * lightweight-charts 5 does not break a line at whitespace: it joins the point before the gap to the point after it, in
 * the colour of the point before. So that point is made transparent (its segment and fill), when a value comes after the
 * gap (the last point keeps its colour: the axis label takes it). `type`: 'line' (default), 'area' or 'baseline'.
 * For layer plugins (ctx.util).
 */
export function cutGaps(points, type = 'line') {
  const keys = GAP_KEYS[type] || GAP_KEYS.line;
  const has = p => p && p.value != null;
  const out = points.slice();
  let later = false;                      // a value comes after point i
  for (let i = out.length - 1; i >= 0; i--) {
    if (!has(out[i])) continue;
    if (later && i + 1 < out.length && !has(out[i + 1])) {
      const clear = {};
      for (const k of keys) clear[k] = 'transparent';
      out[i] = Object.assign({}, out[i], clear);
    }
    later = true;
  }
  return out;
}

/** Index of the last element of sorted `times` that is <= t, or -1. For layer plugins (ctx.util). */
export function floorIndex(times, t) {
  let lo = 0, hi = times.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at;
}
