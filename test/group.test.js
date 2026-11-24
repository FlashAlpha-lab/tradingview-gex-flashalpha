import { fakeLW, fakeSource, host, observers, tick, window } from './helpers.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '../src/index.js';
import { LAYOUTS } from '../src/layouts.js';

const open = (opts = {}) => {
  const LW = fakeLW(), source = fakeSource(), el = host();
  const first = observers.length;
  const chart = mount(el, Object.assign({ symbol: 'SPX', refresh: 0, lightweightCharts: LW, source, storage: false }, opts));
  return { el, chart, source, LW, groupObserver: observers[first] };
};
const cells = el => [...el.querySelectorAll('.fac-cell')];
const topBar = el => el.querySelector('.fac-grp-top > .fac-bar');
const pick = (el, id) => {
  topBar(el).querySelector('.fac-layouts > button').click();
  topBar(el).querySelector(`[data-layout="${id}"]`).click();
};

describe('chart group (layouts)', () => {
  beforeEach(() => window.localStorage.clear());

  it('has 19 layouts of 1 to 4 charts, each with one grid letter per chart', () => {
    assert.equal(LAYOUTS.length, 19);
    assert.deepEqual([1, 2, 3, 4].map(n => LAYOUTS.filter(l => l.n === n).length), [1, 2, 6, 10]);
    for (const l of LAYOUTS) assert.deepEqual([...new Set(l.grid.flat())].sort(), 'abcd'.slice(0, l.n).split(''), l.id);
  });

  it('opens one chart; one toolbar and time bar at the top and bottom of the group, Layout before Settings', async () => {
    const { el, chart } = open();
    await tick();
    const grp = el.querySelector('.fac-grp');
    assert.deepEqual([...grp.children].map(x => x.className), ['fac-grp-grid', 'fac-grp-top', 'fac-grp-foot']);
    assert.equal(cells(el).length, 1);
    assert.ok(topBar(el), 'the toolbar is in the top bar');
    assert.ok(el.querySelector('.fac-grp-foot > .fac-timebar'), 'the time bar is in the bottom bar');
    assert.deepEqual([...topBar(el).querySelectorAll('.fac-right > .fac-menu > button, .fac-right > button')].map(b => b.title),
      ['Layout', 'Settings', 'Fullscreen', 'Take a screenshot']);
    const rows = [...topBar(el).querySelectorAll('.fac-layouts .fac-lay-row')];
    assert.deepEqual(rows.map(r => r.querySelector('.fac-lay-n').textContent), ['1', '2', '3', '4']);
    assert.deepEqual(rows.map(r => r.querySelectorAll('[data-layout]').length), [1, 2, 6, 10]);
    assert.equal(topBar(el).querySelector('[data-layout].on').dataset.layout, '1');
    assert.equal(chart.layout, '1');
    assert.equal(el.querySelector('.fac-grp-multi'), null, 'no focus outline with one chart');
    chart.destroy();
    assert.equal(el.children.length, 0);
  });

  it('a layout from the menu adds charts with their own intervals; dropping charts keeps the first ones', async () => {
    const { el, chart } = open();
    await tick();
    pick(el, '4');
    await tick();
    assert.equal(chart.layout, '4');
    assert.equal(cells(el).length, 4);
    assert.deepEqual(chart.charts.map(c => c.resolution), ['5m', '1m', '15m', '1h'], 'a new chart takes an interval no other chart has');
    assert.deepEqual(chart.charts.map(c => c.symbol), ['SPX', 'SPX', 'SPX', 'SPX']);
    assert.deepEqual(cells(el).map(c => c.style.gridArea.split(' ')[0]), ['a', 'b', 'c', 'd']);
    const grid = el.querySelector('.fac-grp-grid');
    assert.equal(grid.style.gridTemplateAreas, '"a b" "c d"');
    assert.ok(el.querySelector('.fac-grp.fac-grp-multi'));
    assert.equal(topBar(el).querySelector('[data-layout].on').dataset.layout, '4');
    assert.equal(el.querySelector('.fac-layouts.open'), null, 'the menu closes after a pick');
    assert.equal(el.querySelectorAll('.fac-grp-top > .fac-bar').length, 1, 'one toolbar for the group');

    chart.focus(3);
    chart.setLayout('2v');
    await tick();
    assert.equal(cells(el).length, 2);
    assert.equal(chart.active, 0, 'the chart in focus was dropped: the first one takes the focus');
    assert.deepEqual(chart.charts.map(c => c.resolution), ['5m', '1m']);
    assert.equal(el.querySelector('.fac-grp-grid').style.gridTemplateAreas, '"a b"');
    chart.setLayout('3l');
    await tick();
    assert.deepEqual(chart.charts.map(c => c.resolution), ['5m', '1m', '15m'], 'a chart brought back keeps its interval');
    chart.destroy();
  });

  it('a click focuses a chart: the toolbar then acts on it, the others keep their settings', async () => {
    const { el, chart } = open({ layout: '2v' });
    await tick();
    assert.equal(chart.active, 0);
    cells(el)[1].dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    assert.equal(chart.active, 1);
    assert.ok(cells(el)[1].classList.contains('on') && !cells(el)[0].classList.contains('on'));
    assert.equal(topBar(el).querySelector('[data-g="res"] .fac-dd-val').textContent, '1m', "the second chart's toolbar");
    assert.ok(cells(el)[0].querySelector('.fac-bar'), "the first chart's toolbar went back into it (hidden)");
    // the interval menu in the group's toolbar changes the chart in focus only
    topBar(el).querySelector('[data-g="res"] > button').click();
    topBar(el).querySelector('[data-g="res"] .fac-opt[data-v="1h"]').click();
    await tick();
    assert.deepEqual(chart.charts.map(c => c.resolution), ['5m', '1h']);
    chart.setRange(1);
    assert.deepEqual(chart.charts.map(c => c.range), [5, 1], 'the group methods act on the chart in focus');
    chart.destroy();
  });

  it('a new symbol goes to every chart; their intervals and indicators stay', async () => {
    const { el, chart, source } = open({ layout: '3v' });
    await tick();
    await chart.charts[1].setLayers(['levels']);
    chart.focus(2);
    // the symbol menu of the group's toolbar (the third chart's)
    topBar(el).querySelector('[data-g="symbols"] > button').click();
    const opt = topBar(el).querySelector('[data-g="symbols"] .fac-opt[data-v="SPX"]');
    assert.ok(opt, 'the symbol list');
    chart.charts[2].setSymbol('QQQ');
    await tick();
    assert.deepEqual(chart.charts.map(c => c.symbol), ['QQQ', 'QQQ', 'QQQ']);
    assert.deepEqual(chart.charts.map(c => c.resolution), ['5m', '1m', '15m']);
    assert.deepEqual(chart.charts.map(c => c.layers), [[], ['levels'], []]);
    assert.deepEqual([...new Set(source.calls.filter(x => x.fn === 'bars' && x.s === 'QQQ').map(x => x.res))].sort(), ['15m', '1m', '5m']);
    assert.deepEqual([...el.querySelectorAll('[data-g="symbols"] .fac-dd-val')].map(x => x.textContent), ['QQQ', 'QQQ', 'QQQ'],
      'every toolbar (the hidden ones too) shows it');
    chart.destroy();
  });

  it('the theme from Settings goes to every chart and to the group bars', async () => {
    const { el, chart } = open({ layout: '2h' });
    await tick();
    const theme = topBar(el).querySelector('.fac-settings [data-s="theme"]');
    theme.value = 'light';
    theme.dispatchEvent(new window.Event('change'));
    for (const c of cells(el)) assert.equal(c.querySelector('.fac').style.getPropertyValue('--fac-bg'), '#ffffff');
    assert.equal(el.querySelector('.fac-grp').style.getPropertyValue('--fac-bg'), '#ffffff');
    chart.destroy();
  });

  it("remembers the layout, the chart in focus and each chart's interval, range and session", async () => {
    const a = open({ storage: true });
    await tick();
    a.chart.setLayout('3l');
    a.chart.focus(2);
    await a.chart.setResolution('1d');
    await a.chart.charts[1].setSession('eth');
    await a.chart.charts[1].setLayers(['levels']);
    a.chart.destroy();
    const stored = JSON.parse(window.localStorage.getItem('tradingview-gex-flashalpha:layers:group'));
    assert.equal(stored.layout, '3l');
    assert.equal(stored.active, 2);
    assert.deepEqual(window.localStorage.getItem('tradingview-gex-flashalpha:layers:2'), '["levels"]', "the second chart's layers");

    const b = open({ storage: true });
    await tick();
    assert.equal(b.chart.layout, '3l');
    assert.equal(b.chart.active, 2);
    assert.deepEqual(b.chart.charts.map(c => c.resolution), ['5m', '1m', '1d']);
    assert.deepEqual(b.chart.charts.map(c => c.session), ['rth', 'eth', 'rth']);
    assert.deepEqual(b.chart.charts.map(c => c.layers), [[], ['levels'], []]);
    assert.deepEqual(b.chart.charts.map(c => c.symbol), ['SPX', 'SPX', 'SPX'], 'the symbol is not remembered: it comes from the page');
    b.chart.destroy();
  });

  it('below 640 px: only the chart in focus, no Layout menu; wider again: the layout is back', async () => {
    const { el, chart, groupObserver } = open({ layout: '4' });
    await tick();
    chart.focus(1);
    const grp = el.querySelector('.fac-grp');
    Object.defineProperty(grp, 'clientWidth', { value: 500, configurable: true });
    groupObserver.fn([]);
    assert.ok(grp.classList.contains('fac-grp-single') && grp.classList.contains('fac-narrow'));
    assert.deepEqual(cells(el).map(c => c.hidden), [true, false, true, true]);
    assert.equal(el.querySelector('.fac-grp-grid').style.gridTemplateAreas, '"a"');
    Object.defineProperty(grp, 'clientWidth', { value: 1200, configurable: true });
    groupObserver.fn([]);
    assert.ok(!grp.classList.contains('fac-grp-single'));
    assert.deepEqual(cells(el).map(c => c.hidden), [false, false, false, false]);
    assert.equal(el.querySelector('.fac-grp-grid').style.gridTemplateAreas, '"a b" "c d"');
    chart.destroy();
  });

  it('layouts: false mounts one chart as before, with no Layout button', async () => {
    const { el, chart } = open({ layouts: false });
    await tick();
    assert.equal(el.querySelector('.fac-grp'), null);
    assert.equal(el.querySelector('.fac-layouts'), null);
    assert.equal(el.firstElementChild.className.split(' ')[0], 'fac');
    assert.equal(chart.setLayout, undefined);
    chart.destroy();
  });
});
