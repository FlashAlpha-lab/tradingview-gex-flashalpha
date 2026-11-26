import './helpers.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPercentLevels } from '../src/percent-levels.js';

/** A level series and the candles, as lightweight-charts 5 answers them; the time scale puts time t at x = t. */
function setup() {
  const series = () => {
    const s = { opts: {}, data: null, primitives: [], priceLines: [],
      applyOptions(x) { Object.assign(this.opts, x); }, setData(d) { this.data = d; }, options() { return Object.assign({}, this.opts); },
      attachPrimitive(p) { this.primitives.push(p); p.attached({ requestUpdate: () => { this.updates = (this.updates || 0) + 1; } }); },
      createPriceLine(spec) { const l = { options: Object.assign({}, spec), applyOptions(x) { Object.assign(this.options, x); } }; this.priceLines.push(l); return l; },
      removePriceLine(l) { this.priceLines = this.priceLines.filter(x => x !== l); } };
    return s;
  };
  const candles = series();
  candles.priceToCoordinate = v => 1000 - v;           // the candles' scale: y from the price
  const chart = { timeScale: () => ({ timeToCoordinate: t => t }) };
  const pl = createPercentLevels(chart);
  pl.setCandles(candles);
  return { pl, candles, series };
}

/** What the primitive draws: each stroke as [colour, [x, y], ...] in bitmap pixels (ratio 2). */
function strokes(candles) {
  const out = [];
  let path = null;
  const c = { setLineDash() {}, beginPath() { path = []; }, moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); },
    stroke() { out.push([c.strokeStyle, ...path]); } };
  const target = { useBitmapCoordinateSpace: fn => fn({ context: c, horizontalPixelRatio: 2, verticalPixelRatio: 2 }) };
  for (const p of candles.primitives) for (const v of p.paneViews()) v.renderer().draw(target);
  return out;
}

describe('levels on a percent scale', () => {
  it('normal scale: the level series draw themselves; percent: the candles draw their line, price line and label', () => {
    const { pl, candles, series } = setup();
    const opts = { color: '#059669', title: 'Call wall', priceLineVisible: true, lastValueVisible: true, priceLineColor: '#059669',
      priceLineStyle: 1, priceLineWidth: 1, lineWidth: 1 };
    const s = pl.track(series(), opts);
    s.applyOptions(opts);
    s.setData([{ time: 10, value: 750 }, { time: 20, value: 755 }, { time: 30 }, { time: 40, value: 760 }]);
    assert.deepEqual(candles.priceLines, [], 'normal: nothing on the candles');
    assert.equal(candles.primitives.length, 0, 'the primitive is attached the first time percent is on');

    pl.setMode(true);
    assert.deepEqual([s.opts.lineVisible, s.opts.priceLineVisible, s.opts.lastValueVisible, s.opts.title], [false, false, false, ''],
      'no line, label or title of its own (a title shows in the pane even without the label)');
    assert.deepEqual(candles.priceLines.map(l => l.options), [{ price: 760, color: '#059669', lineWidth: 1, lineStyle: 1,
      lineVisible: true, axisLabelVisible: true, title: 'Call wall' }]);
    // the line in steps at the candles' coordinates, cut at the gap
    assert.deepEqual(strokes(candles), [['#059669', [20, 500], [40, 500], [40, 490]]]);

    // style changes while in percent reach the price line; the series keeps drawing nothing itself
    s.applyOptions({ title: '', priceLineVisible: false });
    assert.equal(s.opts.priceLineVisible, false);
    assert.deepEqual([candles.priceLines[0].options.title, candles.priceLines[0].options.lineVisible], ['', false]);
    s.applyOptions({ lineVisible: false });           // a plugin that draws the line itself (e.g. an overlay)
    assert.deepEqual(strokes(candles), []);
    s.applyOptions({ visible: false });
    assert.deepEqual(candles.priceLines, [], 'a hidden plot: no price line');

    // back to normal: the series draws again as last set
    s.applyOptions({ visible: true });
    pl.setMode(false);
    assert.deepEqual(candles.priceLines, []);
    assert.deepEqual([s.opts.lineVisible, s.opts.priceLineVisible, s.opts.lastValueVisible], [false, false, true]);
    assert.deepEqual(strokes(candles), [], 'the primitive draws nothing on a normal scale');
  });

  it('a level added while percent is on starts without its own line and label', () => {
    const { pl, candles, series } = setup();
    pl.setMode(true);
    const s = pl.track(series(), { lastValueVisible: true, priceLineVisible: true });
    assert.deepEqual([s.opts.lineVisible, s.opts.priceLineVisible, s.opts.lastValueVisible], [false, false, false]);
    s.setData([{ time: 1 }]);
    assert.deepEqual(candles.priceLines, [], 'no value yet: no price line');
  });
});
