import { chartTime, fakeLW, fakeSource, host, tick } from './helpers.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '../src/index.js';
import { LevelsOverlay, edgeLabels, levelRuns, pct, regimeRuns, veil } from '../src/plugins/levels-overlay.js';

/** A 2D context that records what is drawn. */
function recorder() {
  const calls = [];
  const c = { calls, measureText: t => ({ width: t.length * 6 }) };
  for (const fn of ['fillRect', 'strokeRect', 'fillText']) c[fn] = (...a) => calls.push([fn, c.fillStyle, c.strokeStyle, ...a]);
  return c;
}
const target = (c, width = 400, height = 200) => ({ useMediaCoordinateSpace: fn => fn({ context: c, mediaSize: { width, height } }) });

/** An overlay attached to a stub chart: price 100 at y 0 down to 0 at y 200; time t at x = t * 10. */
function attached(theme = { light: false, bg: '#0f1115' }) {
  const o = new LevelsOverlay(() => theme);
  const updates = [];
  o.attached({
    chart: { timeScale: () => ({ timeToCoordinate: t => t * 10, options: () => ({ barSpacing: 10 }) }) },
    series: { priceToCoordinate: p => (100 - p) * 2 },
    requestUpdate: () => updates.push(1),
  });
  return { o, updates };
}

describe('levels overlay', () => {
  it('pct: signed distance in percent, one decimal, no sign at zero', () => {
    assert.equal(pct(750, 717), '+4.6%');
    assert.equal(pct(730, 744), '−1.9%');
    assert.equal(pct(5050, 5050.5), '0.0%');
    assert.equal(pct(null, 10), '');
    assert.equal(pct(10, null), '');
  });

  it('regimeRuns: one run per stretch of the same flip; a row without a flip ends it', () => {
    assert.deepEqual(regimeRuns([{ time: 1, flip: 50 }, { time: 2, flip: 50 }, { time: 3, flip: 60 }, { time: 4, flip: null }, { time: 5, flip: 60 }]),
      [{ from: 1, to: 2, flip: 50 }, { from: 3, to: 3, flip: 60 }, { from: 5, to: 5, flip: 60 }]);
  });

  it('edgeLabels: levels above or below the pane, with their distance from spot', () => {
    const yOf = p => (100 - p) * 2;
    const { top, bottom } = edgeLabels([
      { title: 'Call wall', value: 120, color: 'g' }, { title: 'Put wall', value: -10, color: 'r' }, { title: 'Gamma flip', value: 50, color: 'y' },
    ], yOf, 200, 40);
    assert.deepEqual(top, [{ text: '▲ Call wall 120.00 (+200.0%)', color: 'g' }]);
    assert.deepEqual(bottom, [{ text: '▼ Put wall -10.00 (−125.0%)', color: 'r' }]);
  });

  it('tints above the flip green and below it red, session by session, with no text', () => {
    const { o, updates } = attached();
    o.set({ runs: [{ from: 1, to: 5, flip: 60 }, { from: 7, to: 9, flip: 40 }], levels: [], spot: 50 });
    assert.equal(updates.length, 1, 'asks for a repaint');
    const c = recorder();
    o.views[0].renderer().draw(target(c, 600));
    assert.equal(o.views[0].zOrder(), 'bottom', 'behind the candles');
    const rects = c.calls.filter(x => x[0] === 'fillRect').map(([, fill, , ...r]) => [fill, ...r]);
    assert.deepEqual(rects, [
      ['rgba(52,211,153,0.06)', 5, 0, 50, 80], ['rgba(248,113,113,0.06)', 5, 80, 50, 120],     // flip 60 → y 80, x 5..55
      ['rgba(52,211,153,0.06)', 65, 0, 30, 120], ['rgba(248,113,113,0.06)', 65, 120, 30, 80],  // flip 40 → y 120, x 65..95
    ]);
    assert.deepEqual(c.calls.filter(x => x[0] === 'fillText'), [], 'no "Positive gamma" / "Negative gamma" labels');
  });

  it('a flip above the pane: all red; light theme colours', () => {
    const { o } = attached({ light: true, bg: '#ffffff' });
    o.set({ runs: [{ from: 1, to: 3, flip: 150 }], levels: [], spot: 50 });
    const c = recorder();
    o.views[0].renderer().draw(target(c, 300));
    const rects = c.calls.filter(x => x[0] === 'fillRect').map(([, fill, , ...r]) => [fill, ...r]);
    assert.deepEqual(rects, [['rgba(5,150,105,0.06)', 5, 0, 30, 0], ['rgba(220,38,38,0.06)', 5, 0, 30, 200]]);
    assert.deepEqual(c.calls.filter(x => x[0] === 'fillText'), []);
  });

  it('pins a level out of view to the edge as a chip in its colour, over the candles', () => {
    const { o } = attached();
    o.set({ runs: [], levels: [{ title: 'Call wall', value: 120, color: '#059669' }, { title: 'Gamma flip', value: 50, color: '#fbbf24' }], spot: 40 });
    const c = recorder();
    o.views[2].renderer().draw(target(c));
    assert.equal(o.views[2].zOrder(), 'top');
    const text = c.calls.find(x => x[0] === 'fillText');
    assert.deepEqual(text.slice(1, 4), ['#059669', '#059669', '▲ Call wall 120.00 (+200.0%)']);
    assert.equal(c.calls.filter(x => x[0] === 'fillText').length, 1, 'a level in view gets no chip');
    assert.deepEqual(c.calls.find(x => x[0] === 'fillRect').slice(1, 2), ['#0f1115'], 'on the theme background');
  });

  it('an edge label ends left of the room a plugin keeps at the right edge (theme().right)', () => {
    const levels = [{ title: 'Call wall', value: 120, color: '#059669' }];
    const right = r => {
      const { o } = attached({ light: false, bg: '#0f1115', right: r });
      o.set({ runs: [], levels, spot: 40 });
      const c = recorder();
      o.views[2].renderer().draw(target(c));
      const rect = c.calls.find(x => x[0] === 'fillRect');
      return rect[3] + rect[5];                      // x + width: the chip's right end
    };
    assert.equal(right(0), 400 - 6);
    assert.equal(right(120), 400 - 120 - 6, 'left of the GEX profile\'s panel');
  });

  it('the chart attaches it to the candles and hands it the regime runs, the latest levels and the last close', async () => {
    const LW = fakeLW();
    const el = host();
    const chart = mount(el, { symbol: 'SPX', refresh: 0, lightweightCharts: LW, source: fakeSource(), storage: false, layers: ['levels', 'maxpain'] });
    await tick();
    const [overlay] = LW.charts[0].series[0].primitives;
    assert.ok(overlay instanceof LevelsOverlay);
    // sessionData: one session, flip 4,990 all day
    assert.deepEqual(overlay.data.runs, [{ from: chartTime('2026-11-13T14:30:00Z'), to: chartTime('2026-11-13T20:55:00Z'), flip: 4990 }]);
    assert.deepEqual(overlay.data.levels.map(l => [l.title, l.value, l.color]),
      [['Call wall', 5050, '#059669'], ['Put wall', 4950, '#f84040'], ['Gamma flip', 4990, '#fbbf24'], ['Max pain', 5000, '#a78bfa']]);
    assert.equal(overlay.data.spot, 5076.5);
    chart.setStyle('flip', { visible: false });
    assert.deepEqual(overlay.data.runs, [], 'no regime with the flip hidden');
    assert.ok(!overlay.data.levels.some(l => l.title === 'Gamma flip'), 'nor its edge label');
    await chart.setLayers([]);
    assert.deepEqual(overlay.data.levels, []);
    chart.destroy();
  });

  it('levelRuns: one run per stretch of the same value and colour; no value or a split ends it', () => {
    const pts = [{ time: 1, value: 5, color: 'g' }, { time: 2, value: 5, color: 'g' }, { time: 3, value: 5, color: 'f' },
      { time: 4 }, { time: 5, value: 5, color: 'g' }, { time: 6, value: 5, color: 'g' }, { time: 7, value: 6, color: 'g' }];
    assert.deepEqual(levelRuns(pts, (a, b) => b.time === 6), [{ from: 1, to: 2, value: 5, color: 'g' }, { from: 3, to: 3, value: 5, color: 'f' },
      { from: 5, to: 5, value: 5, color: 'g' }, { from: 6, to: 6, value: 5, color: 'g' }, { from: 7, to: 7, value: 6, color: 'g' }]);
  });

  it('draws each level run as one flat segment across its bars (no vertical step), dashed in line widths', () => {
    const { o } = attached();
    o.set({ lines: [{ from: 1, to: 5, value: 60, color: 'g', width: 2, style: 0 }, { from: 6, to: 9, value: 40, color: 'g', width: 2, style: 2 }] });
    const calls = [];
    const c = { setLineDash: d => calls.push(['dash', d]), beginPath() {}, moveTo: (x, y) => calls.push(['move', x, y]),
      lineTo: (x, y) => calls.push(['line', x, y]), stroke: () => calls.push(['stroke', c.strokeStyle, c.lineWidth]) };
    assert.equal(o.views[3].zOrder(), 'normal', 'with the candles');
    o.views[3].renderer().draw(target(c, 600));
    assert.deepEqual(calls, [
      ['dash', []], ['move', 5, 80], ['line', 55, 80], ['stroke', 'g', 2],     // bars 1..5: x 5..55, value 60 → y 80
      ['dash', [4, 4]], ['move', 55, 120], ['line', 95, 120], ['stroke', 'g', 2],
      ['dash', []],
    ]);
  });

  it('veils the sessions left and right of the one in focus, over the candles, before the edge labels', () => {
    const { o } = attached({ light: false, bg: '#0f1115' });
    const c = recorder();
    o.views[1].renderer().draw(target(c, 600));
    assert.deepEqual(c.calls, [], 'no focus: nothing veiled');
    o.set({ focus: { from: 2, to: 4 } });
    o.views[1].renderer().draw(target(c, 600));
    assert.equal(o.views[1].zOrder(), 'top');
    assert.equal(o.views[2].zOrder(), 'top', 'the edge labels come after it');
    // bars 2..4: x 15..45; the rest of the 600 px pane in the background colour at 60 %
    assert.deepEqual(c.calls.map(([fn, fill, , ...r]) => [fn, fill, ...r]),
      [['fillRect', 'rgba(15, 17, 21, 0.6)', 0, 0, 15, 200], ['fillRect', 'rgba(15, 17, 21, 0.6)', 45, 0, 555, 200]]);
    assert.equal(veil('#fff', true), 'rgba(255, 255, 255, 0.6)');
    assert.equal(veil('rgb(1, 2, 3)', false), 'rgba(1, 2, 3, 0.6)');
    assert.equal(veil('linear-gradient(red, blue)', true), 'rgba(255, 255, 255, 0.6)', 'not a colour: the theme\'s');
  });

  it('no day bands: without regime runs nothing is drawn behind the candles; a level in `hidden` gets no edge label', () => {
    const { o } = attached({ light: true, bg: '#ffffff' });
    const c = recorder();
    o.views[0].renderer().draw(target(c, 600));
    assert.deepEqual(c.calls, []);
    o.set({ levels: [{ id: 'callWall', title: 'Call wall', value: 120, color: 'g' }, { id: 'flip', title: 'Gamma flip', value: 130, color: 'y' }],
      hidden: ['callWall'], spot: 50 });
    const e = recorder();
    o.views[2].renderer().draw(target(e));
    assert.deepEqual(e.calls.filter(x => x[0] === 'fillText').map(x => x[3]), ['▲ Gamma flip 130.00 (+160.0%)']);
  });

  it('the walls\' and the flip\'s price line, axis label and edge label hide while the latest session is scrolled out of view', async () => {
    const LW = fakeLW();
    const el = host();
    const chart = mount(el, { symbol: 'SPX', refresh: 0, lightweightCharts: LW, source: fakeSource(), storage: false, layers: ['levels', 'maxpain'] });
    await tick();
    const lw = LW.charts[0], overlay = lw.series[0].primitives[0];
    const wall = title => lw.series.find(s => s.opts.title === title);
    const first = chartTime('2026-11-13T14:30:00Z');
    lw.ts.getVisibleRange = () => ({ from: first - 86400, to: first - 3600 });     // the day before the (only) session
    lw.ts.rangeSubs.forEach(fn => fn());
    for (const t of ['Call wall', 'Put wall', 'Gamma flip']) assert.deepEqual(wall(t).applied.at(-1), { priceLineVisible: false, lastValueVisible: false });
    assert.ok(!wall('Max pain').applied.some(a => a.priceLineVisible === false), 'max pain keeps its');
    assert.deepEqual(overlay.data.hidden, ['callWall', 'putWall', 'flip']);
    lw.ts.getVisibleRange = () => ({ from: first - 86400, to: first });
    lw.ts.rangeSubs.forEach(fn => fn());
    for (const t of ['Call wall', 'Put wall', 'Gamma flip']) assert.deepEqual(wall(t).applied.at(-1), { priceLineVisible: true, lastValueVisible: true });
    assert.deepEqual(overlay.data.hidden, []);
    chart.destroy();
  });
});
