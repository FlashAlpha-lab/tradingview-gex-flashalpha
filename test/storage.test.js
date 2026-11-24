import { fakeLW, fakeSource, host, tick, window } from './helpers.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '../src/index.js';

const open = (opts = {}) => {
  const LW = fakeLW(), source = fakeSource(), el = host();
  const chart = mount(el, Object.assign({ symbol: 'SPX', refresh: 0, lightweightCharts: LW, source }, opts));
  return { el, chart, source, c: () => LW.charts[0] };
};
const KEY = 'tradingview-gex-flashalpha:layers';

describe('default layers and the picks remembered', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts with no indicator: price and volume only', async () => {
    const { el, chart, c, source } = open();
    await tick();
    assert.deepEqual(chart.layers, []);
    assert.equal(c().series[0].data.length, 78, 'candles');
    assert.ok(c().series[1].data.length > 0, 'volume');
    assert.ok(c().series.slice(2).every(s => !s.data || s.data.every(p => p.value == null)), 'no level drawn');
    assert.deepEqual(source.calls.find(x => x.fn === 'charts').q.layers, ['exposure'], 'only the spot rows for the last candles');
    assert.equal(el.querySelectorAll('.fac-ind-layers input:checked').length, 0, 'nothing ticked in the Indicators menu');
    assert.equal(window.localStorage.getItem(KEY), null, 'nothing stored before the reader picks');
    chart.destroy();
  });

  it('remembers what the reader turns on or off and opens with it next time', async () => {
    const first = open();
    await tick();
    await first.chart.setLayers(['levels', 'maxpain']);
    assert.deepEqual(JSON.parse(window.localStorage.getItem(KEY)), ['levels', 'maxpain']);
    first.chart.destroy();

    const next = open();
    await tick();
    assert.deepEqual(next.chart.layers, ['levels', 'maxpain']);
    assert.ok(next.c().series.find(s => s.opts.title === 'Call wall').data.some(p => p.value != null), 'drawn again');
    await next.chart.setLayers([]);
    next.chart.destroy();

    const third = open();
    await tick();
    assert.deepEqual(third.chart.layers, [], 'turning everything off is remembered too');
    third.chart.destroy();
  });

  it('the stored picks win over options.layers; unknown ids are dropped', async () => {
    window.localStorage.setItem(KEY, JSON.stringify(['maxpain', 'gone']));
    const { chart } = open({ layers: ['levels'] });
    await tick();
    assert.deepEqual(chart.layers, ['maxpain']);
    chart.destroy();
  });

  it('storage: false neither reads nor writes; storageKey keeps charts apart', async () => {
    window.localStorage.setItem(KEY, JSON.stringify(['maxpain']));
    const off = open({ storage: false, layers: ['levels'] });
    await tick();
    assert.deepEqual(off.chart.layers, ['levels']);
    await off.chart.setLayers([]);
    assert.equal(window.localStorage.getItem(KEY), JSON.stringify(['maxpain']));
    off.chart.destroy();

    const other = open({ storageKey: 'page:b' });
    await tick();
    assert.deepEqual(other.chart.layers, [], 'its own key has nothing yet');
    await other.chart.setLayers(['levels']);
    assert.equal(window.localStorage.getItem('page:b'), JSON.stringify(['levels']));
    other.chart.destroy();
  });

  it('a broken value or a storage that throws falls back to the default', async () => {
    window.localStorage.setItem(KEY, '{not json');
    const broken = open();
    await tick();
    assert.deepEqual(broken.chart.layers, []);
    broken.chart.destroy();

    const proto = Object.getPrototypeOf(window.localStorage);
    const { getItem, setItem } = proto;
    proto.getItem = () => { throw new Error('SecurityError'); };
    proto.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      const blocked = open();
      await tick();
      await blocked.chart.setLayers(['levels']);
      assert.deepEqual(blocked.chart.layers, ['levels'], 'works, not remembered');
      blocked.chart.destroy();
    } finally { proto.getItem = getItem; proto.setItem = setItem; }
  });
});
