/**
 * One /v1/symbols answer per API root and key, shared by every chart of the page for a minute (a page of 9 charts asks
 * once); a failed answer is not kept.
 */
const SYMBOLS_MS = 60e3;
const symbolsAnswers = new Map();

/** The chart API: /v1/bars, /v1/charts, /v1/symbols under baseUrl ('' = same origin), with the key as X-Api-Key. */
export function chartEngineSource(baseUrl, apiKey) {
  const root = (baseUrl || '').replace(/\/$/, '');
  const headers = apiKey ? { 'X-Api-Key': apiKey } : undefined;
  // Every failure becomes {error}: a network error, a CORS refusal or a proxy's HTML page must not leave the chart loading.
  // A request that does not answer in 20 s is dropped, so it cannot stop the refreshes after it.
  const get = async url => {
    const abort = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = abort ? setTimeout(() => abort.abort(), 20000) : null;
    try {
      const r = await fetch(root + url, { headers, signal: abort ? abort.signal : undefined });
      return await r.json().catch(() => ({ error: `http_${r.status}` }));
    } catch (e) { return { error: e && e.name === 'AbortError' ? 'timeout' : 'network', message: String(e) }; }
    finally { if (timer) clearTimeout(timer); }
  };
  return {
    symbols: () => {
      const k = `${root}
${apiKey || ''}`, hit = symbolsAnswers.get(k);
      const p = hit && Date.now() - hit.at < SYMBOLS_MS ? hit.p : get('/v1/symbols');
      if (!hit || hit.p !== p) {
        symbolsAnswers.set(k, { at: Date.now(), p });
        p.then(l => { const cur = symbolsAnswers.get(k); if (!Array.isArray(l) && cur && cur.p === p) symbolsAnswers.delete(k); });
      }
      return p.then(l => (Array.isArray(l) ? l.slice() : l));   // a copy: a chart adds its own symbol to the list
    },
    bars: (s, res, from, to, session, extra) =>
      get(`/v1/bars/${encodeURIComponent(s)}?resolution=${res}&from=${from}&to=${to}&limit=10000&session=${session || 'rth'}`
        + (extra && extra.sessions ? `&sessions=${extra.sessions}` : '')),
    charts: (s, res, from, to, q) => {
      const { layers, session, ...extra } = q;
      const p = new URLSearchParams({ resolution: res, layers: layers.join(','), session: session || 'rth', from, to });
      for (const [k, v] of Object.entries(extra)) if (v != null) p.set(k, v);
      return get(`/v1/charts/${encodeURIComponent(s)}?${p}`);
    },
  };
}
