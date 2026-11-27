import './helpers.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, etTime, sessionOf } from '../src/time.js';
import { big, cutGaps, esc, floorIndex, num } from '../src/util.js';
import { chartEngineSource } from '../src/source.js';
import { planRank, upgradeHref } from '../src/plans.js';

describe('time', () => {
  it('etTime writes ET wall-clock as UTC seconds, across the DST change', () => {
    assert.equal(etTime('2026-11-13T14:30:00Z'), Date.UTC(2026, 10, 13, 9, 30) / 1000);   // EST
    assert.equal(etTime('2026-07-01T13:30:00Z'), Date.UTC(2026, 6, 1, 9, 30) / 1000);     // EDT
  });
  it('dayOf and sessionOf read a chart time back', () => {
    const t = etTime('2026-11-13T14:30:00Z');
    assert.equal(dayOf(t), '2026-11-13');
    assert.equal(sessionOf(t), 'rth');
    assert.equal(sessionOf(t - 60), 'pre');
    assert.equal(sessionOf(etTime('2026-11-13T21:00:00Z')), 'post');
  });
});

describe('util', () => {
  it('esc escapes HTML', () => assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;'));
  it('num and big format numbers, — for null', () => {
    assert.equal(num(5012.5), '5,012.50');
    assert.equal(num(null), '—');
    assert.deepEqual([big(1.5e9), big(2.25e6), big(1500), big(12), big(null)], ['1.50B', '2.3M', '1.5K', '12', '—']);
  });
  it('cutGaps makes the point before a gap transparent (lightweight-charts would join across it), not the last point', () => {
    const pts = [{ time: 1, value: 5 }, { time: 2, value: 6 }, { time: 3 }, { time: 4, value: 7, color: '#f00' }, { time: 5, value: 8 }, { time: 6 }];
    const out = cutGaps(pts);
    assert.deepEqual(out.map(p => p.color), [undefined, 'transparent', undefined, '#f00', undefined, undefined]);
    assert.equal(pts[1].color, undefined, 'the points given are left as they are');
    assert.deepEqual(Object.keys(cutGaps(pts, 'baseline')[1]).filter(k => k !== 'time' && k !== 'value'),
      ['topLineColor', 'bottomLineColor', 'topFillColor1', 'topFillColor2', 'bottomFillColor1', 'bottomFillColor2']);
    assert.deepEqual(Object.keys(cutGaps(pts, 'area')[1]).filter(k => k !== 'time' && k !== 'value'), ['lineColor', 'topColor', 'bottomColor']);
    assert.deepEqual(cutGaps([{ time: 1 }, { time: 2, value: 1 }]), [{ time: 1 }, { time: 2, value: 1 }], 'a gap first: nothing to hide');
  });
  it('floorIndex finds the last time <= t', () => {
    assert.deepEqual([floorIndex([10, 20, 30], 5), floorIndex([10, 20, 30], 20), floorIndex([10, 20, 30], 99)], [-1, 1, 2]);
  });
});

describe('plans', () => {
  it('ranks plans, an unknown name lowest', () => {
    assert.ok(planRank('growth') > planRank('basic'));
    assert.equal(planRank('nope'), 0);
  });
  it('tags the upgrade link with utm parameters and the page host', () => {
    const u = new URL(upgradeHref('https://flashalpha.com/pricing', 'heatmap'));
    assert.equal(u.searchParams.get('utm_source'), 'chart');
    assert.equal(u.searchParams.get('utm_content'), 'heatmap');
    assert.equal(u.searchParams.get('utm_term'), 'example.com');
  });
  it('does not tag a link to the page\'s own site (www. or not)', () => {
    assert.equal(upgradeHref('/pricing?returnUrl=%2Fx', 'heatmap'), 'https://example.com/pricing?returnUrl=%2Fx');
    assert.equal(upgradeHref('https://www.example.com/pricing', 'heatmap', 'signup'), 'https://www.example.com/pricing');
    assert.match(upgradeHref('https://charts.example.com/pricing', 'heatmap'), /utm_source=chart/, 'another host is tagged');
  });
});

describe('chartEngineSource', () => {
  it('builds the chart API URLs and sends the key as X-Api-Key', async () => {
    const seen = [];
    const old = globalThis.fetch;
    globalThis.fetch = async (url, init) => { seen.push({ url, init }); return { status: 200, json: async () => ({ ok: true }) }; };
    try {
      const s = chartEngineSource('https://charts.example/', 'key_x');
      await s.symbols();
      await s.bars('SPX', '5m', 'A', 'B');
      await s.charts('S&P', '1m', 'A', 'B', { layers: ['exposure', 'strikes'], scope: 'zero_dte', none: null });
      assert.equal(seen[0].url, 'https://charts.example/v1/symbols');
      assert.equal(seen[0].init.headers['X-Api-Key'], 'key_x');
      assert.equal(seen[1].url, 'https://charts.example/v1/bars/SPX?resolution=5m&from=A&to=B&limit=10000&session=rth');
      const c = new URL(seen[2].url);
      assert.equal(c.pathname, '/v1/charts/S%26P');
      assert.equal(c.searchParams.get('layers'), 'exposure,strikes');
      assert.equal(c.searchParams.get('scope'), 'zero_dte');
      assert.equal(c.searchParams.has('none'), false);
    } finally { globalThis.fetch = old; }
  });
  it('shares one /v1/symbols answer per root and key, a copy for each chart, and sends sessions', async () => {
    const seen = [];
    const old = globalThis.fetch;
    globalThis.fetch = async url => { seen.push(url); return { status: 200, json: async () => [{ symbol: 'SPY' }] }; };
    try {
      const [a, b] = await Promise.all([chartEngineSource('https://share.example', 'k1').symbols(),
        chartEngineSource('https://share.example', 'k1').symbols()]);
      a.push({ symbol: 'XYZ' });
      assert.deepEqual(b, [{ symbol: 'SPY' }]);
      assert.deepEqual(await chartEngineSource('https://share.example', 'k1').symbols(), [{ symbol: 'SPY' }]);
      assert.equal(seen.length, 1);
      await chartEngineSource('https://share.example', 'k2').symbols();
      assert.equal(seen.length, 2, 'another key asks again');
      await chartEngineSource('https://share.example', 'k1').bars('SPY', '5m', 'A', 'B', 'rth', { sessions: 5 });
      assert.equal(seen[2], 'https://share.example/v1/bars/SPY?resolution=5m&from=A&to=B&limit=10000&session=rth&sessions=5');
    } finally { globalThis.fetch = old; }
  });
  it('turns failures into {error}', async () => {
    const old = globalThis.fetch;
    try {
      globalThis.fetch = async () => { throw new TypeError('offline'); };
      assert.equal((await chartEngineSource('', null).symbols()).error, 'network');
      globalThis.fetch = async () => ({ status: 502, json: async () => { throw new SyntaxError('html'); } });
      assert.equal((await chartEngineSource('', null).symbols()).error, 'http_502');
    } finally { globalThis.fetch = old; }
  });
});
