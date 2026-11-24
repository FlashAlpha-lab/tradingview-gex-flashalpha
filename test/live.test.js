import { chartTime, fakeLW, host, tick, window } from './helpers.js';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '../src/index.js';
import { createLive, foldBars, foldLevels, liveUrl } from '../src/live.js';

/** A WebSocket stand-in: opens on the next tick, records what the client sends; server(msg) answers. */
class MockSocket {
  static all = [];
  constructor(url) {
    this.url = url; this.sent = []; this.readyState = 0;
    MockSocket.all.push(this);
    setTimeout(() => { if (this.readyState === 0) { this.readyState = 1; if (this.onopen) this.onopen(); } }, 0);
  }
  send(x) { this.sent.push(JSON.parse(x)); }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    setTimeout(() => { if (this.onclose) this.onclose({ code: 1000 }); }, 0);
  }
  server(msg) { this.onmessage({ data: JSON.stringify(msg) }); }
}
const lastSocket = () => MockSocket.all.at(-1);
/**
 * Waits until `ok()` holds (at most `ms`). A reconnect is three zero-delay timers in a row (close, connect, open), and a
 * timer takes up to ~16 ms on Windows, so a fixed tick(30) can end before the new socket has opened.
 */
async function until(ok, ms = 1000) {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await tick(5);
}

const iso = (hh, mm) => `2026-11-13T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`;
const minute = s => Date.parse(s);
/** Durable 1m bars 20:00Z..20:46Z (15:00-15:46 ET). */
const durable = [];
for (let i = 0; i <= 46; i++) durable.push({ ts: iso(20, i), open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 10, source: 'trades' });
/** A live 1m bar of minute 20:mm (values 200 + mm). */
const liveBar = (mm, extra) => Object.assign({ ts: iso(20, mm), closed: false, open: 200 + mm, high: 202 + mm, low: 198 + mm,
  close: 201 + mm, volume: 50, source: 'live', final: false, lt: Date.now() - 100, at: Date.now() - 50 }, extra || {});
/** The snapshot: 20:38..20:47. */
const snapBars = () => Array.from({ length: 10 }, (_, i) => liveBar(38 + i));

/** The loaded bars per resolution: 1m up to 20:40, 5m buckets up to 20:35, 15m up to 20:15 (the durable path lags). */
function loaded(res) {
  if (res === '1m') return durable.filter(b => minute(b.ts) <= minute(iso(20, 40)));
  const step = res === '5m' ? 5 : 15, last = res === '5m' ? 35 : 15, out = [];
  for (let s = 0; s <= last; s += step) {
    const f = foldBars(durable.filter(b => { const m = (minute(b.ts) - minute(iso(20, 0))) / 60e3; return m >= s && m < s + step; }));
    out.push(Object.assign({ ts: iso(20, s) }, f));
  }
  return out;
}

/** The built-in source over fetch: answers /v1/symbols, /v1/bars and /v1/charts, and records every request. */
function fakeFetch({ seedError = false } = {}) {
  const calls = [];
  const exposure = [{ ts: iso(20, 0), call_wall: 150, put_wall: 90, max_pain: 120, gamma_flip: { first: 110, min: 110, max: 110, last: 110, status: 'available' },
    net_gex: { first: 1, min: 1, max: 1, last: 1 }, spot: { first: 100, min: 99, max: 101, last: 100.5 } }];
  const answer = url => {
    const u = new URL(url, 'https://example.com');
    if (u.pathname === '/v1/symbols') return [{ symbol: 'SPY', last_bar: iso(20, 40) }, { symbol: 'QQQ' }];
    const res = u.searchParams.get('resolution'), from = Date.parse(u.searchParams.get('from')), to = Date.parse(u.searchParams.get('to'));
    if (u.pathname.startsWith('/v1/bars/')) {
      // A window inside the fixture day is the live seed; any other window is a chart load.
      if (res === '1m' && from >= minute(iso(20, 0)) && from < minute(iso(21, 0))) return seedError ? { error: 'timeout' } : { bars: durable.filter(b => minute(b.ts) >= from && minute(b.ts) <= to) };
      return { bars: loaded(res) };
    }
    if (u.pathname.startsWith('/v1/charts/')) return { layers: {}, exposure: exposure.slice() };
    return { error: 'not_found' };
  };
  const fn = async (url, init) => {
    calls.push({ url: String(url), headers: init && init.headers });
    const body = answer(String(url));
    return { status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
  };
  fn.calls = calls;
  fn.count = kind => calls.filter(c => c.url.includes(kind)).length;
  return fn;
}

let savedFetch, savedWS;
beforeEach(() => {
  savedFetch = globalThis.fetch; savedWS = window.WebSocket;
  MockSocket.all = [];
  window.WebSocket = MockSocket;
});
/** Charts openLive made: afterEach destroys the ones a failed assertion left open (their timers would keep node --test running). */
const opened = [];
afterEach(() => {
  for (const c of opened.splice(0)) c.destroy();
  globalThis.fetch = savedFetch; window.WebSocket = savedWS;
});

/** A chart on the built-in source with live on, connected and welcomed, with the snapshot sent. */
async function openLive(opts = {}, { snap = true, seedError = false } = {}) {
  const f = globalThis.fetch = fakeFetch({ seedError });
  const LW = fakeLW();
  const el = host();
  const chart = mount(el, Object.assign({ symbol: 'SPY', resolution: '1m', refresh: 0, lightweightCharts: LW, storage: false,
    layouts: false, live: true, apiKey: 'k1' }, opts));
  const destroy = chart.destroy;
  let done = false;
  chart.destroy = () => { if (!done) { done = true; destroy.call(chart); } };
  opened.push(chart);
  await tick(30);
  await until(() => lastSocket() && lastSocket().sent.length > 0);   // load, connect and open take longer on a busy machine
  const ws = lastSocket();
  if (ws && snap) {
    ws.server({ t: 'welcome', mode: 'live', delay: 0, plan: null, hb: 15 });
    ws.server({ t: 'snap', s: 'SPY', bars: snapBars(), levels: null });
    await tick();
  }
  const s = LW.charts[0].series;
  return { chart, ws, f, LW, el, candles: s[0], volume: s[1] };
}
const at = (series, iso_) => series.data.find(b => b.time === chartTime(iso_));

describe('live lane (WebSocket)', () => {
  it('is off by default and with a data source of your own', async () => {
    globalThis.fetch = fakeFetch();
    const a = mount(host(), { symbol: 'SPY', resolution: '1m', refresh: 0, lightweightCharts: fakeLW(), storage: false, layouts: false });
    await tick(30);
    assert.equal(MockSocket.all.length, 0);
    a.destroy();
    const b = mount(host(), { symbol: 'SPY', resolution: '1m', refresh: 0, lightweightCharts: fakeLW(), storage: false, layouts: false, live: true,
      source: { symbols: () => [], bars: () => ({ bars: [] }), charts: () => ({}) } });
    await tick(30);
    assert.equal(MockSocket.all.length, 0);
    b.destroy();
  });

  it('sends hello with the key first, subscribes after the welcome, answers pings', async () => {
    const { chart, ws } = await openLive({}, { snap: false });
    assert.equal(ws.url, 'wss://example.com/v1/live');
    assert.deepEqual(ws.sent, [{ op: 'hello', key: 'k1', v: 1 }], 'hello only, nothing before the welcome');
    ws.server({ t: 'welcome', mode: 'live', delay: 0, plan: 'growth', hb: 15 });
    assert.deepEqual(ws.sent.at(-1), { op: 'sub', s: 'SPY' });
    ws.server({ t: 'ping', ts: 12345 });
    assert.deepEqual(ws.sent.at(-1), { op: 'pong', ts: 12345 });
    chart.destroy();
  });

  it('applies the snapshot at 1m: minutes newer than the loaded bars, loaded ones untouched', async () => {
    const { chart, candles, volume } = await openLive();
    assert.equal(candles.data.at(-1).time, chartTime(iso(20, 47)));
    assert.equal(at(candles, iso(20, 39)).close, 139.5, 'a loaded minute stays');
    assert.equal(at(candles, iso(20, 41)).close, 242);
    assert.equal(at(volume, iso(20, 41)).value, 50);
    assert.ok(candles.updates.every(([, h]) => h === false));
    chart.destroy();
  });

  it('updates the last candle in place at 1m', async () => {
    const { chart, ws, candles } = await openLive();
    const n = candles.data.length;
    ws.server({ t: 'bar', s: 'SPY', bar: liveBar(47, { close: 250.25, high: 251 }) });
    assert.equal(candles.data.length, n);
    assert.deepEqual(candles.data.at(-1), { time: chartTime(iso(20, 47)), open: 247, high: 251, low: 245, close: 250.25 });
    ws.server({ t: 'bar', s: 'SPY', bar: liveBar(48) });
    assert.equal(candles.data.length, n + 1, 'a new minute adds a candle');
    ws.server({ t: 'bar', s: 'QQQ', bar: liveBar(49) });
    assert.equal(candles.data.length, n + 1, 'another symbol is ignored');
    chart.destroy();
  });

  it('folds 1m parts at 5m: open first, high max, low min, close last, volume summed', async () => {
    const { chart, ws, candles, volume } = await openLive({ resolution: '5m' });
    const fold = mms => { const p = mms.map(m => liveBar(m)); return { open: p[0].open, high: Math.max(...p.map(b => b.high)),
      low: Math.min(...p.map(b => b.low)), close: p.at(-1).close, volume: p.length * 50 }; };
    const last = candles.data.at(-1), f = fold([45, 46, 47]);
    assert.deepEqual(last, { time: chartTime(iso(20, 45)), open: f.open, high: f.high, low: f.low, close: f.close });
    assert.equal(volume.data.at(-1).value, f.volume);
    const f40 = fold([40, 41, 42, 43, 44]);
    assert.equal(at(candles, iso(20, 40)).close, f40.close);
    // The 20:35 bucket (the last loaded one) folds the seeded durable 20:35-20:37 with the snapshot's 20:38-20:39.
    const b35 = at(candles, iso(20, 35));
    assert.equal(b35.open, 135, 'open from the seeded durable minute');
    assert.equal(b35.close, 240, 'close from the live 20:39');
    ws.server({ t: 'bar', s: 'SPY', bar: liveBar(47, { high: 300, close: 299, volume: 70 }) });
    assert.equal(candles.data.at(-1).high, 300);
    assert.equal(volume.data.at(-1).value, 50 + 50 + 70);
    chart.destroy();
  });

  it('seeds the earlier minutes of the buckets with one 1m bars call at 15m', async () => {
    const { chart, f, candles } = await openLive({ resolution: '15m' });
    const seeds = f.calls.filter(c => c.url.includes('/v1/bars/') && c.url.includes('resolution=1m'));
    assert.equal(seeds.length, 1);
    assert.equal(new URL(seeds[0].url, 'https://example.com').searchParams.get('from'), iso(20, 15), 'from the last loaded bucket (older than the previous one)');
    const b30 = at(candles, iso(20, 30));
    assert.equal(b30.open, 130, 'the bucket opens with the seeded 20:30');
    assert.equal(b30.close, 245, 'and closes with the live 20:44');
    assert.equal(candles.data.at(-1).time, chartTime(iso(20, 45)));
    chart.destroy();
  });

  it('draws a late fix of the previous bucket with historicalUpdate and drops older minutes', async () => {
    const { chart, ws, candles } = await openLive({ resolution: '5m' });
    ws.server({ t: 'bar', s: 'SPY', bar: liveBar(43, { high: 400 }) });
    const [bar, historical] = candles.updates.at(-1);
    assert.equal(bar.time, chartTime(iso(20, 40)));
    assert.equal(historical, true);
    assert.equal(at(candles, iso(20, 40)).high, 400);
    const n = candles.updates.length;
    ws.server({ t: 'bar', s: 'SPY', bar: liveBar(33, { high: 500 }) });
    assert.equal(candles.updates.length, n, 'older than the previous bucket: ignored');
    chart.destroy();
  });

  it('draws a late fix of the last 3 minutes at 1m and drops older ones', async () => {
    const { chart, ws, candles } = await openLive();
    ws.server({ t: 'bar', s: 'SPY', bar: liveBar(44, { high: 400 }) });
    const [bar, historical] = candles.updates.at(-1);
    assert.equal(bar.time, chartTime(iso(20, 44)));
    assert.equal(historical, true);
    assert.equal(at(candles, iso(20, 44)).high, 400);
    const n = candles.updates.length;
    ws.server({ t: 'bar', s: 'SPY', bar: liveBar(43, { high: 500 }) });
    assert.equal(candles.updates.length, n, 'more than 3 minutes back: ignored');
    chart.destroy();
  });

  it('keeps the loaded candles when the seed fails', async () => {
    const { chart, ws, f, candles } = await openLive({ resolution: '5m' }, { seedError: true });
    const seeds = () => f.calls.filter(c => c.url.includes('/v1/bars/') && c.url.includes('resolution=1m')).length;
    assert.equal(seeds(), 1);
    const last = candles.data.at(-1), b35 = loaded('5m').at(-1);
    assert.deepEqual(last, { time: chartTime(iso(20, 35)), open: b35.open, high: b35.high, low: b35.low, close: b35.close },
      'the last loaded bucket is not redrawn from the stream minutes alone');
    ws.server({ t: 'bar', s: 'SPY', bar: liveBar(47) });
    await tick();
    assert.equal(seeds(), 1, 'retried after a minute, not on every bar');
    assert.deepEqual(candles.data.at(-1), last);
    chart.destroy();
  });

  it('drops minutes outside regular hours with session rth', async () => {
    const { chart, ws, candles } = await openLive();
    const n = candles.data.length;
    ws.server({ t: 'bar', s: 'SPY', bar: Object.assign(liveBar(48), { ts: '2026-11-13T21:05:00.000Z' }) });
    assert.equal(candles.data.length, n);
    chart.destroy();
  });

  it('a reload never sets the live candle back', async () => {
    const { chart, ws, candles } = await openLive({ resolution: '5m' });
    ws.server({ t: 'bar', s: 'SPY', bar: liveBar(47, { close: 299 }) });
    const before = candles.data.at(-1);
    await chart.reload();
    await tick();
    assert.deepEqual(candles.data.at(-1), before);
    chart.destroy();
  });

  it('refreshes by polling while the socket is down or silent for the symbol, only every 5 minutes while bars come', async () => {
    const { chart, ws, f } = await openLive({ refresh: 0.05, symbol: 'spy' }, { snap: false });
    const polls = () => f.calls.filter(c => c.url.includes('/v1/bars/')).length;
    let n = polls();
    await tick(200);
    assert.ok(polls() > n, 'polling before the welcome');
    ws.server({ t: 'welcome', mode: 'live', delay: 0, plan: null, hb: 15 });
    await tick(30);
    n = polls();
    await tick(200);
    assert.ok(polls() > n, 'up but no bar for the symbol yet (an index without a live source): still polling');
    ws.server({ t: 'bar', s: 'SPY', bar: liveBar(47) });              // the gateway answers in upper case
    await tick(30);
    n = polls();
    await tick(200);
    assert.equal(polls(), n, 'no polling while bars of this symbol arrive');
    chart.destroy();
  });

  it('re-subscribes on a symbol change and closes the socket on destroy', async () => {
    const { chart, ws } = await openLive();
    await chart.setSymbol('QQQ');
    await tick();
    assert.deepEqual(ws.sent.slice(-2), [{ op: 'unsub', s: 'SPY' }, { op: 'sub', s: 'QQQ' }]);
    assert.equal(MockSocket.all.length, 1, 'the same connection');
    chart.destroy();
    assert.equal(ws.readyState, 3);
    await tick(50);
    assert.equal(MockSocket.all.length, 1, 'no reconnect after destroy');
  });

  it('closes the socket on a daily resolution and opens it again intraday', async () => {
    const { chart, ws } = await openLive();
    await chart.setResolution('1d');
    assert.equal(ws.readyState, 3);
    await chart.setResolution('5m');
    await tick(30);
    await until(() => MockSocket.all.length === 2 && lastSocket().sent.length > 0);
    assert.equal(MockSocket.all.length, 2);
    assert.deepEqual(lastSocket().sent, [{ op: 'hello', key: 'k1', v: 1 }]);
    chart.destroy();
  });

  it('merges a levels row into the exposure rows and redraws without an API call', async () => {
    const { chart, ws, f, LW } = await openLive({ resolution: '5m', layers: ['levels'] });
    const charts = f.count('/v1/charts/'), bars = f.count('/v1/bars/');
    ws.server({ t: 'levels', s: 'SPY', row: { ts: iso(20, 46), call_wall: 777, put_wall: 90, max_pain: 120,
      gamma_flip: { first: 112, min: 112, max: 112, last: 112, status: 'available' }, net_gex: { first: 2, min: 2, max: 2, last: 2 },
      spot: { first: 246, min: 244, max: 249, last: 247.5 } } });
    assert.equal(f.count('/v1/charts/'), charts);
    assert.equal(f.count('/v1/bars/'), bars);
    assert.match(LW.charts[0].el.closest('.fac').querySelector('.fac-legend').textContent, /Call wall 777\.00/);
    chart.destroy();
  });

  it('shows lag p50/p95 in the status line with debug latency', async () => {
    const { chart, ws, LW } = await openLive({ debug: 'latency' });
    ws.server({ t: 'bar', s: 'SPY', bar: liveBar(47, { lt: Date.now() - 120 }) });
    assert.match(LW.charts[0].el.closest('.fac').querySelector('.fac-status').textContent, /lag p50 \d+ ms · p95 \d+ ms/);
    chart.destroy();
  });
});

describe('createLive', () => {
  const open = () => {
    const states = [], msgs = [];
    const conn = createLive({ url: 'wss://x/v1/live', key: null, WebSocket: MockSocket, random: () => 0,
      onMessage: m => msgs.push(m), onState: (s, m) => states.push([s, m]) });
    return { conn, states, msgs };
  };

  it('reconnects after a lost connection and subscribes again', async () => {
    const { conn, states } = open();
    try {                                        // closed even when an assertion fails: it would reconnect forever
      conn.set('SPY');
      await until(() => lastSocket() && lastSocket().sent.length > 0);
      const a = lastSocket();
      assert.deepEqual(a.sent, [{ op: 'hello', key: null, v: 1 }]);
      a.server({ t: 'welcome', mode: 'delayed', delay: 15, plan: 'free', hb: 15 });
      assert.deepEqual(a.sent.at(-1), { op: 'sub', s: 'SPY' });
      assert.equal(conn.up, true);
      a.close();                                 // the server went away
      await until(() => lastSocket() !== a && lastSocket().sent.length > 0);
      const b = lastSocket();
      assert.notEqual(a, b);
      assert.deepEqual(b.sent, [{ op: 'hello', key: null, v: 1 }]);
      b.server({ t: 'welcome', mode: 'delayed', delay: 15, plan: 'free', hb: 15 });
      assert.deepEqual(b.sent.at(-1), { op: 'sub', s: 'SPY' });
      assert.deepEqual(states.map(s => s[0]), ['up', 'down', 'up']);
      conn.set('QQQ');
      assert.deepEqual(b.sent.slice(-2), [{ op: 'unsub', s: 'SPY' }, { op: 'sub', s: 'QQQ' }]);
    } finally {
      conn.close();
    }
  });

  it('stays down after a fatal error; close() stops reconnecting', async () => {
    const { conn, states, msgs } = open();
    await tick();
    const a = lastSocket();
    a.server({ t: 'error', code: 'invalid_api_key' });
    a.close();
    await tick(30);
    assert.equal(MockSocket.all.length, 1);
    assert.equal(msgs[0].code, 'invalid_api_key');
    assert.deepEqual(states.at(-1), ['down', { was: false, off: true }]);
    const c = open();
    await tick();
    c.conn.close();
    await tick(30);
    assert.equal(MockSocket.all.length, 2);
  });

  it('stays on polling when the server does not stream its delay', async () => {
    const { conn, states } = open();
    await tick();
    const a = lastSocket();
    a.server({ t: 'error', code: 'delay_not_streamed' });
    a.close();
    await tick(30);
    assert.equal(MockSocket.all.length, 1, 'no reconnect');
    assert.deepEqual(states.at(-1), ['down', { was: false, off: true }]);
    conn.close();
  });

  it('builds the socket URL from the API root or the page origin', () => {
    assert.equal(liveUrl('https://charts.example.com/', ''), 'wss://charts.example.com/v1/live');
    assert.equal(liveUrl('', 'http://localhost:5000'), 'ws://localhost:5000/v1/live');
  });
});

describe('live folds', () => {
  it('foldBars folds OHLCV like the server', () => {
    assert.deepEqual(foldBars([{ open: 1, high: 3, low: 0.5, close: 2, volume: 10 }, { open: 2, high: 4, low: 1, close: 3.5, volume: 5 }]),
      { open: 1, high: 4, low: 0.5, close: 3.5, volume: 15, source: undefined });
    assert.equal(foldBars([]), null);
  });

  it('foldLevels keeps the first spot, net_gex and flip, widens min/max, takes the rest new', () => {
    const old = { ts: 'a', call_wall: 1, spot: { first: 10, min: 9, max: 11, last: 10.5 }, gamma_flip: { first: 5, min: 5, max: 5, last: 5, status: 'unverified' } };
    const row = { ts: 'b', call_wall: 2, spot: { first: 12, min: 12, max: 13, last: 12.5 }, gamma_flip: { first: 4, min: 4, max: 4, last: 4, status: 'available' } };
    assert.deepEqual(foldLevels(old, row, 'bucket'), { ts: 'bucket', call_wall: 2, spot: { first: 10, min: 9, max: 13, last: 12.5 },
      gamma_flip: { first: 5, min: 4, max: 5, last: 4, status: 'available' } });
    assert.deepEqual(foldLevels(null, row, 'bucket'), Object.assign({}, row, { ts: 'bucket' }));
  });
});

describe('feed label and the built-in source window', () => {
  it('says Live or N min delayed from the welcome, and Delayed for a reader with no key before it', async () => {
    const { chart, ws, el } = await openLive({ apiKey: null }, { snap: false });
    const feed = el.querySelector('.fac-feed');
    assert.equal(feed.hidden, false);
    assert.equal(feed.textContent, 'Delayed');
    ws.server({ t: 'welcome', mode: 'delayed', delay: 15, plan: 'free', hb: 15 });
    assert.equal(feed.textContent, '15 min delayed');
    assert.ok(feed.classList.contains('fac-delayed'));
    chart.destroy();
    const live = await openLive();
    const f2 = live.el.querySelector('.fac-feed');
    assert.equal(f2.textContent, 'Live');
    assert.ok(f2.classList.contains('fac-live'));
    live.chart.destroy();
  });

  it('asks 1D and 5D intraday as trading sessions, and no charts() without the exposure layers', async () => {
    const f = globalThis.fetch = fakeFetch();
    const a = mount(host(), { symbol: 'SPY', resolution: '5m', refresh: 0, lightweightCharts: fakeLW(), storage: false, layouts: false,
      apiKey: 'k1', exposure: false });
    await tick(30);
    const bars = f.calls.filter(c => c.url.includes('/v1/bars/'));
    assert.equal(new URL(bars[0].url, 'https://example.com').searchParams.get('sessions'), '5');
    assert.equal(f.count('/v1/charts/'), 0);
    a.setRange(31);
    await tick(30);
    assert.equal(new URL(f.calls.filter(c => c.url.includes('/v1/bars/')).at(-1).url, 'https://example.com').searchParams.has('sessions'), false);
    a.destroy();
  });
});
