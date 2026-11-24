/**
 * The live lane: one WebSocket to {baseUrl}/v1/live and the pure helpers the chart folds its 1m bars and levels rows with.
 * A browser cannot set headers on a WebSocket, so the key goes in the first message (hello), never in the URL.
 *
 * Client → server: {op: 'hello', key, v: 1} first, then {op: 'sub' | 'unsub', s}, and {op: 'pong', ts} for every ping.
 * Server → client: welcome {mode, delay, plan, hb}, snap {s, bars, levels}, bar {s, bar}, levels {s, row}, ping {ts},
 * error {code} (then a close, except unknown_symbol).
 */

/** Errors after which reconnecting cannot help: the chart stays on its polling refresh. */
const FATAL = ['invalid_api_key', 'embed_key_expired', 'embed_key_revoked', 'origin_not_allowed', 'delay_not_streamed'];
/** Waits before the 2nd, 3rd ... try after a lost connection (the 1st waits a random 0-3 s). */
const BACKOFF = [1000, 2000, 4000, 8000, 15000];
/** No message (the server pings every 15 s) for this long: the connection is dropped and opened again. */
const IDLE_MS = 40000;
/** A tab hidden for this long closes its connection; it opens again when the tab is visible. */
const HIDDEN_MS = 60000;

/** ws(s)://host/v1/live for a chart API root ('' = this page's origin). */
export function liveUrl(baseUrl, origin) {
  return String(baseUrl || origin || '').replace(/\/$/, '').replace(/^http/, 'ws') + '/v1/live';
}

/**
 * Keeps one connection open for one symbol at a time. onMessage gets snap, bar, levels and error messages; onState gets
 * 'up' (welcome: {mode, delay, plan}), 'down' (lost: it reconnects, or stays off after a fatal error, `off: true`).
 * set(symbol) subscribes (and unsubscribes the previous one); close() ends it for good.
 */
export function createLive({ url, key, WebSocket: WS, onMessage, onState, doc, random = Math.random }) {
  let ws = null, up = false, symbol = null, tries = 0, stopped = false, paused = false;
  let retry = null, watchdog = null, hiddenTimer = null;
  const send = (sock, msg) => { try { sock.send(JSON.stringify(msg)); } catch (e) { /* closing: the reconnect resends */ } };
  const kick = sock => { clearTimeout(watchdog); watchdog = setTimeout(() => drop(sock), IDLE_MS); };
  const drop = sock => { try { sock.close(); } catch (e) { /* already closed */ } };

  function connect() {
    clearTimeout(retry);
    if (stopped || paused || ws) return;
    let sock;
    try { sock = new WS(url); } catch (e) { schedule(); return; }
    ws = sock;
    let fatal = false;
    kick(sock);
    sock.onopen = () => { if (ws === sock) send(sock, { op: 'hello', key: key || null, v: 1 }); };
    sock.onmessage = ev => {
      if (ws !== sock) return;
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;
      kick(sock);
      if (m.t === 'ping') { send(sock, { op: 'pong', ts: m.ts }); return; }
      if (m.t === 'welcome') {
        up = true; tries = 0;
        if (symbol) send(sock, { op: 'sub', s: symbol });
        onState('up', m);
        return;
      }
      if (m.t === 'error' && FATAL.includes(m.code)) fatal = true;
      onMessage(m);
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      clearTimeout(watchdog);
      const was = up;
      up = false;
      if (fatal) stopped = true;
      onState('down', { was, off: stopped });
      schedule();
    };
    sock.onerror = () => {};                   // a close follows
  }

  function schedule() {
    if (stopped || paused) return;
    const wait = tries === 0 ? random() * 3000 : BACKOFF[Math.min(tries - 1, BACKOFF.length - 1)];
    tries++;
    retry = setTimeout(connect, wait);
  }

  /** Hidden for HIDDEN_MS: closed (no background tab holds a connection all day); visible again: opened at once. */
  const onVisibility = () => {
    if (doc.hidden) {
      clearTimeout(hiddenTimer);
      hiddenTimer = setTimeout(() => {
        paused = true; clearTimeout(retry);
        const sock = ws; ws = null; clearTimeout(watchdog);
        if (sock) { drop(sock); if (up) { up = false; onState('down', { was: true, off: false }); } }
      }, HIDDEN_MS);
    } else {
      clearTimeout(hiddenTimer);
      if (paused) { paused = false; tries = 0; connect(); }
    }
  };
  if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', onVisibility);
  if (doc && doc.hidden) onVisibility();       // mounted in a background tab

  connect();
  return {
    /** Subscribes `s` (unsubscribing the previous symbol); sent after the welcome when not connected yet. */
    set(s) {
      if (s === symbol) return;
      if (ws && up && symbol) send(ws, { op: 'unsub', s: symbol });
      symbol = s;
      if (ws && up && s) send(ws, { op: 'sub', s });
    },
    get up() { return up; },
    close() {
      stopped = true; up = false;
      clearTimeout(retry); clearTimeout(watchdog); clearTimeout(hiddenTimer);
      if (doc && doc.removeEventListener) doc.removeEventListener('visibilitychange', onVisibility);
      const sock = ws; ws = null;
      if (sock) drop(sock);
    },
  };
}

/**
 * The start of the bucket a chart time (ET-as-UTC seconds) falls in. 5m and 15m buckets are whole multiples; 1h in
 * regular hours starts at :30 (bars_1h_rth, from 09:30 ET), with pre- and post-market on the whole hour.
 */
export function bucketOf(t, step, offset = 0) {
  return Math.floor((t - offset) / step) * step + offset;
}

/** One bar from 1m bars in time order: first open, max high, min low, last close, volume summed. */
export function foldBars(list) {
  const bars = list.filter(b => b && b.open != null);
  if (!bars.length) return null;
  const vols = bars.filter(b => b.volume != null);
  return { open: bars[0].open, high: Math.max(...bars.map(b => b.high)), low: Math.min(...bars.map(b => b.low)),
    close: bars[bars.length - 1].close, volume: vols.length ? vols.reduce((s, b) => s + b.volume, 0) : null,
    source: bars[bars.length - 1].source };
}

/** Exposure fields that are {first, min, max, last, ...} over a bucket. */
const RANGED = ['net_gex', 'spot', 'gamma_flip'];

/**
 * A bucket's exposure row after a newer minute's row (`ts`: the bucket's): every field from the new row, except that
 * net_gex, spot and gamma_flip keep the bucket's first value and widen its min and max.
 */
export function foldLevels(old, row, ts) {
  const out = Object.assign({}, old || {}, row, { ts });
  for (const k of RANGED) {
    const a = old && old[k], b = row[k];
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') continue;
    const lo = [a.min, b.min].filter(x => x != null), hi = [a.max, b.max].filter(x => x != null);
    out[k] = Object.assign({}, b, { first: a.first != null ? a.first : b.first,
      min: lo.length ? Math.min(...lo) : null, max: hi.length ? Math.max(...hi) : null });
  }
  return out;
}

/** The p-th percentile (0-100) of a list of numbers, or null. */
export function percentile(list, p) {
  if (!list.length) return null;
  const s = list.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p / 100 * s.length) - 1))];
}
