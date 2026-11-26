// The pinned lightweight-charts: one exact version everywhere (devDependency, dist/vendor, embed.js, demo, examples), and
// the chart works on it. Upgrading = change the devDependency, npm install, set LW_VERSION in embed.js, npm run check.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const pkg = JSON.parse(read('package.json'));
const PIN = pkg.devDependencies['lightweight-charts'];
const LW_FILE = `lightweight-charts-${PIN}.standalone.production.js`;
const vendored = new URL('dist/vendor/' + LW_FILE, root);
const built = existsSync(vendored) && existsSync(new URL('dist/tradingview-gex-flashalpha.min.js', root));
const UNPKG = /unpkg\.com\/lightweight-charts/;

/** A jsdom window with a 2D canvas stand-in, enough for lightweight-charts to lay out and draw. */
function browser(html = '<!doctype html><body></body>') {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com/', pretendToBeVisual: true });
  const w = dom.window;
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return s => ({ width: String(s).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      return k in t ? t[k] : () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  w.HTMLCanvasElement.prototype.getContext = () => ctx;
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  return w;
}

function session() {
  const bars = [], exposure = [];
  for (let i = 0; i < 78; i++) {
    const ts = new Date(Date.parse('2026-11-13T14:30:00Z') + i * 300e3).toISOString();
    bars.push({ ts, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 10 });
    exposure.push({ ts, call_wall: 150, put_wall: 90, max_pain: 120, gamma_flip: { last: 110, status: 'available' } });
  }
  return {
    symbols: () => [{ symbol: 'SPX', last_bar: '2026-11-13T21:00:00Z' }],
    bars: () => ({ bars }),
    charts: () => ({ exposure, plan: 'growth' }),
  };
}

describe('pinned lightweight-charts', () => {
  it('is one exact version, installed', () => {
    assert.match(PIN, /^\d+\.\d+\.\d+$/, 'devDependencies.lightweight-charts must be an exact version');
    assert.equal(JSON.parse(read('node_modules/lightweight-charts/package.json')).version, PIN);
  });

  it('embed.js loads that version from the chart host, never a CDN', () => {
    const embed = read('embed.js');
    assert.equal((embed.match(/var LW_VERSION = '([^']+)'/) || [])[1], PIN);
    assert.match(embed, /var LW_URL = host \+ '\/lightweight-charts-' \+ LW_VERSION \+ '\.standalone\.production\.js'/);
    assert.doesNotMatch(embed, UNPKG);
  });

  it('the demo and the examples load the vendored copy', () => {
    // The public repository has no demo.html, and its index.html loads the chart through embed.js.
    const demoOnly = new Set(['index.html', 'examples/demo.html']);
    for (const [page, prefix] of [['index.html', 'dist/vendor/'], ['examples/basic.html', '../dist/vendor/'],
      ['examples/custom-source.html', '../dist/vendor/'], ['examples/demo.html', '../dist/vendor/']]) {
      if (demoOnly.has(page) && (!existsSync(new URL(page, root)) || !/lightweight-charts/.test(read(page)))) continue;
      const html = read(page);
      assert.ok(html.includes(`<script src="${prefix}${LW_FILE}"`), page + ' loads ' + prefix + LW_FILE);
      assert.doesNotMatch(html, UNPKG, page);
    }
  });

  it('the NOTICE kept for redistribution is TradingView\'s', () => {
    assert.match(read('vendor/lightweight-charts/NOTICE').replace(/\r\n/g, '\n'), /^TradingView Lightweight Charts™\nCopyright .* TradingView, Inc\. https:\/\/www\.tradingview\.com\//);
  });
});

describe('vendored copy and the chart on it', { skip: built ? false : 'run npm run build first' }, () => {
  it('dist/vendor holds the npm file unchanged, with its LICENSE and NOTICE', () => {
    assert.ok(readFileSync(vendored).equals(readFileSync(new URL('node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js', root))));
    assert.match(read(`dist/vendor/lightweight-charts-${PIN}.LICENSE.txt`), /Apache License/);
    assert.equal(read(`dist/vendor/lightweight-charts-${PIN}.NOTICE.txt`), read('vendor/lightweight-charts/NOTICE'));
  });

  it('the chart mounts, draws, switches and destroys on the pinned version', async () => {
    const w = browser('<!doctype html><body><div id="c"></div></body>');
    const errors = [];
    w.console.error = (...a) => errors.push(a.join(' '));
    w.eval(readFileSync(vendored, 'utf8'));
    assert.equal(w.LightweightCharts.version(), PIN);
    w.eval(read('dist/tradingview-gex-flashalpha.min.js'));
    const chart = w.FlashAlphaChart.mount(w.document.getElementById('c'),
      { symbol: 'SPX', source: session(), refresh: 0, layers: ['levels', 'maxpain'], brand: { logo: 'l.png', href: '#', name: 'B' },
        styles: { callWallBroken: { visible: true } } });     // the breaks are off by default: on, so the marker is drawn
    await new Promise(r => setTimeout(r, 50));
    const series = chart.chart.panes()[0].getSeries();
    assert.equal(series.length, 11, 'candles, volume, 4 daily levels (dashed), flip, call wall, put wall, max pain, the close line');
    assert.equal(series[0].data().length, 78);
    // the close passes the call wall at 13:40 ET: the marker goes on the real candles (createSeriesMarkers) without an error
    assert.match(w.document.querySelector('.fac-legend').textContent, /Call wall 150\.00 \(broken\)Put wall 90\.00Gamma flip 110\.00Max pain 120\.00/);
    await chart.setResolution('15m');
    chart.setTheme('light');
    await chart.setLayers([]);
    // Let the pane layout frames run first: destroy() right after a load throws in placeBrand's frame (as in 0.3.3).
    await new Promise(r => setTimeout(r, 50));
    chart.destroy();
    assert.deepEqual(errors, []);
  });

  it('the Settings menu\'s chart types, price scale, crosshair and watermark work on the pinned version', async () => {
    const w = browser('<!doctype html><body><div id="c"></div></body>');
    const errors = [];
    w.console.error = (...a) => errors.push(a.join(' '));
    w.eval(readFileSync(vendored, 'utf8'));
    w.eval(read('dist/tradingview-gex-flashalpha.min.js'));
    const chart = w.FlashAlphaChart.mount(w.document.getElementById('c'), { symbol: 'SPX', source: session(), refresh: 0, layers: ['levels', 'maxpain'] });
    await new Promise(r => setTimeout(r, 50));
    const menu = w.document.querySelector('.fac-settings');
    const pick = (k, v) => {
      if (k === 'chartType') { w.document.querySelector(`[data-g="type"] .fac-opt[data-v="${v}"]`).click(); return; }
      const x = menu.querySelector(`[data-s="${k}"]`);
      if (x.type === 'checkbox') x.checked = v; else x.value = v;
      x.dispatchEvent(new w.Event('change'));
    };
    const pane = () => chart.chart.panes()[0];
    for (const t of ['hollow', 'bars', 'line', 'area', 'baseline', 'heikin', 'candles']) {
      pick('chartType', t);
      await new Promise(r => setTimeout(r, 0));
    }
    assert.equal(pane().getSeries().length, 11, 'back on Candles: no series left from the other types');
    pick('chartType', 'heikin');
    pick('scaleSide', 'left');
    pick('scaleMode', 'percent');
    const left = chart.chart.priceScale('left', 0);
    assert.equal(left.options().mode, 2);
    assert.equal(left.options().visible, true);
    assert.equal(chart.chart.priceScale('right', 0).options().visible, false);
    assert.equal(pane().getSeries()[0].options().priceScaleId, 'left', 'the candles moved');
    for (const [k, v] of [['scaleMode', 'indexed'], ['scaleMode', 'log'], ['invert', true], ['autoScale', false], ['crosshair', 'magnetOHLC'],
      ['crosshair', 'hidden'], ['priceLine', false], ['priceLabel', false], ['watermark', true], ['scaleSide', 'right'], ['scaleMode', 'normal']]) pick(k, v);
    for (const b of w.document.querySelectorAll('[data-g="scale"] button')) b.click();     // % log auto from the time bar
    await chart.setResolution('15m');
    chart.setTheme('light');
    pick('watermark', false);
    await new Promise(r => setTimeout(r, 50));
    assert.equal(pane().getSeries().filter(s => s.options().priceScaleId === 'left').length, 0, 'every series back on the right');
    chart.destroy();
    assert.deepEqual(errors, []);
  });
});

describe('embed.js and the page\'s own lightweight-charts', { skip: built ? false : 'run npm run build first' }, () => {
  /** The windows embed() opened: closed after each test, so a failed one leaves no frame loop running node --test. */
  const windows = [];
  afterEach(() => { for (const w of windows.splice(0)) w.close(); });

  /** Runs embed.js; the scripts it adds are served from dist/ (the host's files) instead of the network. */
  async function embed(pageLw) {
    const w = browser('<!doctype html><head></head><body><div data-flashalpha-chart data-symbol="SPX" data-refresh="0"></div></body>');
    windows.push(w);
    if (pageLw === 'same') w.eval(readFileSync(vendored, 'utf8'));
    else if (pageLw) w.LightweightCharts = pageLw;
    const page = w.LightweightCharts;
    const requested = [];
    const append = w.document.head.appendChild.bind(w.document.head);
    w.document.head.appendChild = node => {
      if (node.tagName !== 'SCRIPT' || !node.src) return append(node);
      const url = new URL(node.src);
      requested.push(url.pathname);
      setTimeout(() => {
        if (url.pathname === '/' + LW_FILE) w.eval(readFileSync(vendored, 'utf8'));
        else if (url.pathname === '/flashalpha-chart-core.js') w.eval(read('dist/tradingview-gex-flashalpha.min.js'));
        else { node.onerror(); return; }
        node.onload();
      }, 0);
      return node;
    };
    w.eval(read('embed.js'));
    await new Promise(r => setTimeout(r, 100));
    const el = w.document.querySelector('[data-flashalpha-chart]');
    // lightweight-charts (a large script), the core and the layer bundle load one after another: a busy machine needs longer
    const end = Date.now() + 3000;
    while (!el.__flashalphaChart && Date.now() < end) await new Promise(r => setTimeout(r, 25));
    return { w, page, requested, chart: el.__flashalphaChart };
  }

  it('without one, loads the pinned copy from the host', async () => {
    const { w, requested, chart } = await embed(null);
    assert.equal(requested[0], '/' + LW_FILE);
    assert.ok(chart, 'the chart is mounted');
    assert.equal(w.LightweightCharts.version(), PIN);
    chart.destroy();
  });

  it('with the same version, uses it and loads nothing', async () => {
    const { requested, chart } = await embed('same');
    assert.ok(!requested.includes('/' + LW_FILE));
    assert.ok(chart);
    chart.destroy();
  });

  it('with another version, charts get the pinned copy and the page keeps its own', async () => {
    const other = { version: () => '5.0.0', createChart() { throw new Error('the page\'s copy must not be used'); } };
    const { w, requested, chart } = await embed(other);
    assert.equal(requested[0], '/' + LW_FILE);
    assert.equal(w.LightweightCharts, other, 'window.LightweightCharts is the page\'s again');
    assert.ok(chart, 'mounted on the pinned copy');
    chart.destroy();
  });
});
