import { chartTime, fakeLW, host, tick } from './helpers.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mount, registerLayers } from '../src/index.js';

const row = (day, n) => ({ ts: day, call_wall: 5050 + n, put_wall: 4950 - n, gamma_flip: 4990 + n, gamma_flip_status: 'available',
  max_pain: 5000 + n, status: 'ok' });

/** Daily bars Mon 2026-11-10 to Fri 11-14; daily level rows for 11-07, 11-10, 11-11 and 11-13 (11-12 missing). */
function dailySource() {
  const days = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'];
  const calls = [];
  return {
    calls,
    symbols: () => [{ symbol: 'SPX', last_bar: '2026-11-14T21:00:00Z' }],
    bars: () => ({ bars: days.map((d, i) => ({ ts: d + 'T00:00:00Z', open: 5000 + i, high: 5010 + i, low: 4990 + i, close: 5005 + i, volume: 1 })) }),
    charts: (s, res, from, to, q) => {
      calls.push(q);
      return { levels_daily: [row('2026-11-07', 7), row('2026-11-10', 10), row('2026-11-11', 11), row('2026-11-13', 13)] };
    },
  };
}

/** Two 5m sessions (11-12 and 11-13): exposure rows only from the 11-13 open, daily rows for 11-11 and 11-12. */
function intradaySource() {
  const bars = [], exposure = [];
  for (const day of ['2026-11-12', '2026-11-13']) {
    for (let i = 0; i < 6; i++) {
      const ts = new Date(Date.parse(day + 'T14:30:00Z') + i * 300e3).toISOString();
      bars.push({ ts, open: 5000, high: 5001, low: 4999, close: 5000.5, volume: 10 });
      if (day === '2026-11-13') exposure.push({ ts, call_wall: 5100, put_wall: 4900, max_pain: 5000, gamma_flip: { last: 5010, status: 'available' } });
    }
  }
  return {
    symbols: () => [{ symbol: 'SPX', last_bar: '2026-11-13T15:00:00Z' }],
    bars: () => ({ bars }),
    charts: () => ({ exposure, levels_daily: [row('2026-11-11', 11), row('2026-11-12', 12)] }),
  };
}

const open = (el, opts) => {
  const LW = fakeLW();
  const chart = mount(el, Object.assign({ symbol: 'SPX', refresh: 0, lightweightCharts: LW, storage: false }, opts));
  return { chart, c: () => LW.charts[0] };
};

describe('daily levels', () => {
  it('on 1d: each session gets the previous session\'s close levels as dashed steps, a gap after a missing day', async () => {
    const el = host();
    const source = dailySource();
    const { c, chart } = open(el, { resolution: '1d', source });
    await chart.setLayers(['levels', 'maxpain']);
    await tick();
    assert.deepEqual(source.calls.at(-1).layers, ['levels_daily'], 'no exposure rows on 1d, only the daily rows');
    const [flip, call, put, maxPain] = c().series.slice(2, 6);
    assert.ok([flip, call, put, maxPain].every(s => s.opts.lineStyle === 2 && s.opts.lastValueVisible === false), 'dashed, no axis label');
    assert.deepEqual(call.data.map(p => p.value ?? null), [5057, 5060, 5061, null, 5063]);
    assert.deepEqual(maxPain.data.map(p => p.value ?? null), [5007, 5010, 5011, null, 5013]);
    const legend = () => el.querySelector('.fac-legend').textContent;
    assert.doesNotMatch(legend(), /pick 1m to 1h/, 'the daily levels are levels to show on 1d');
    // no "Daily levels (close …)" note under the legend
    c().crosshair.forEach(fn => fn({ time: Date.parse('2026-11-11T00:00:00Z') / 1000, point: { x: 0, y: 0 } }));
    assert.doesNotMatch(legend(), /Daily levels/);
    chart.destroy();
  });

  it('on 1d without daily rows the chart still asks for 1m to 1h', async () => {
    const el = host();
    const source = Object.assign(dailySource(), { charts: () => ({ levels_daily: [] }) });
    const { chart } = open(el, { resolution: '1d', source });
    await chart.setLayers(['levels']);
    await tick();
    assert.match(el.querySelector('.fac-legend').textContent, /GEX levels: pick 1m to 1h/);
    chart.destroy();
  });

  it('intraday: no daily walls or flip (only 1d/1w); max pain only before the first exposure row that has one', async () => {
    const el = host();
    const { c, chart } = open(el, { resolution: '5m', source: intradaySource(), layers: ['levels', 'maxpain'] });
    await tick();
    const [flip, call, put, maxPain] = c().series.slice(2, 6);
    assert.ok([flip, call, put].every(s => s.data.every(p => p.value == null)), 'no daily wall or flip intraday');
    const mp = maxPain.data.map(p => p.value ?? null);
    assert.deepEqual(mp.slice(0, 6), Array(6).fill(5011), 'the 11-12 session: the close max pain of 11-11');
    assert.deepEqual(mp.slice(6), Array(6).fill(null), 'the 11-13 session has max pain in its exposure rows');
    for (const t of ['2026-11-12T14:35:00Z', '2026-11-13T14:35:00Z']) {
      c().crosshair.forEach(fn => fn({ time: chartTime(t), point: { x: 0, y: 0 } }));
      assert.doesNotMatch(el.querySelector('.fac-legend').textContent, /Daily levels/);
    }
    chart.destroy();
  });
});

describe('quote-mid bars', () => {
  const quoteSource = asset => ({
    symbols: () => [{ symbol: 'SPY', last_bar: '2026-11-13T15:00:00Z', asset_class: asset }],
    bars: () => ({ bars: [
      { ts: '2026-11-13T14:30:00Z', open: 600, high: 601, low: 599, close: 600.5, volume: 100, source: 'quotes' },
      { ts: '2026-11-13T14:35:00Z', open: 600.5, high: 602, low: 600, close: 601, volume: 200 },
    ] }),
    charts: () => ({ exposure: [] }),
  });

  it('have no volume, labelled "quote mid (no trades)"; normal colours from 5m up in regular hours', async () => {
    const el = host();
    const { c, chart } = open(el, { symbol: 'SPY', resolution: '5m', source: quoteSource('equity') });
    await tick();
    const [candles, volume] = c().series;
    assert.equal(candles.data[0].color, undefined);
    assert.equal(candles.data[1].color, undefined);
    assert.deepEqual(volume.data[0], { time: candles.data[0].time });
    assert.equal(volume.data[1].value, 200);
    c().crosshair.forEach(fn => fn({ time: candles.data[0].time, point: { x: 0, y: 0 } }));
    const text = el.querySelector('.fac-legend').textContent;
    assert.match(text, /quote mid \(no trades\)/);
    assert.doesNotMatch(text, /Vol/);
    chart.destroy();
  });

  it('are muted on 1m', async () => {
    const el = host();
    const { c, chart } = open(el, { symbol: 'SPY', resolution: '1m', source: quoteSource('equity') });
    await tick();
    const [candles] = c().series;
    assert.equal(candles.data[0].color, '#5f8f8a');
    assert.equal(candles.data[1].color, undefined);
    chart.destroy();
  });

  it('an index (asset_class "index") keeps normal bars: its bars are always quote rows', async () => {
    const el = host();
    const { c, chart } = open(el, { symbol: 'SPY', source: quoteSource('index') });
    await tick();
    const [candles, volume] = c().series;
    assert.equal(candles.data[0].color, undefined);
    assert.equal(volume.data[0].value, 100);
    chart.destroy();
  });
});

// Last: the plugin it registers stays for every chart mounted after it in this file.
describe('daily levels and the exposure query', () => {
  it('are not asked for under a 0DTE scope or the live basis', async () => {
    registerLayers({ layers: [['zdte', '0DTE scope']], attach: ctx => { ctx.setQuery({ scope: 'zero_dte' }); return {}; } });
    const el = host();
    const source = dailySource();
    const { c, chart } = open(el, { resolution: '1d', source });
    await chart.setLayers(['levels']);
    await tick();
    assert.ok(source.calls.every(q => !q.layers.includes('levels_daily')), 'charts() never asked for levels_daily');
    assert.ok(c().series.slice(2, 6).every(s => (s.data || []).every(p => p.value == null)), 'no daily level drawn');
    chart.destroy();
  });
});
