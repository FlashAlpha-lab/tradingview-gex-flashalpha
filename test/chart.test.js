import { chartTime, fakeLW, fakeSource, host, hourlySource, observers, sessionData, tick } from './helpers.js';
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import FlashAlphaChart, { mount, registerLayers, setLicenseKey } from '../src/index.js';

const open = (el, opts = {}) => {
  const LW = fakeLW();
  const source = opts.source || fakeSource();
  const chart = mount(el, Object.assign({ symbol: 'SPX', refresh: 0, lightweightCharts: LW, source, storage: false }, opts));
  return { LW, source, chart, c: () => LW.charts[0] };
};

describe('mount', () => {
  it('needs lightweight-charts', () => {
    assert.throws(() => mount(host(), { source: fakeSource() }), /lightweight-charts 5/);
  });

  it('draws candles, volume and the core level lines over the candles', async () => {
    const el = host();
    const { c, source, chart } = open(el, { layers: ['levels', 'maxpain'] });
    await tick();
    const series = c().series;
    // the last Line is the close line, shown only for one-sample-a-minute bars
    assert.deepEqual(series.map(s => s.type), ['Candlestick', 'Histogram', ...Array(9).fill('Line')]);
    assert.deepEqual(series.slice(6, 10).map(s => s.opts.title), ['Gamma flip', 'Call wall', 'Put wall', 'Max pain']);
    const charts = source.calls.find(x => x.fn === 'charts');
    assert.deepEqual(charts.q.layers, ['exposure', 'levels_daily']);
    // 76 stored bars + 2 spot candles after the last one
    assert.equal(series[0].data.length, 78);
    assert.ok(['#5f8f8a', '#9a6463'].includes(series[0].data.at(-1).color), 'spot candles are muted');
    // the colours and styles of the GEX-by-strike chart: the unverified flip (before 10:00 ET) in the flip colour at 45 %,
    // flip and max pain dashed, walls solid, all 2 px wide; the overlay draws the flip's, the walls' and max pain's lines (flat)
    assert.equal(series[6].data[0].color, 'rgba(251,191,36,0.45)');
    assert.equal(series[6].data.at(-1).color, '#fbbf24');
    const style = s => s.applied.findLast(a => 'color' in a);
    assert.deepEqual([6, 7, 8, 9].map(i => [style(series[i]).color, style(series[i]).lineStyle, style(series[i]).lineWidth]),
      [['#fbbf24', 2, 2], ['#059669', 0, 2], ['#f84040', 0, 2], ['#a78bfa', 2, 2]]);
    assert.deepEqual([6, 7, 8, 9].map(i => series[i].applied.some(a => a.lineVisible === false)), [true, true, true, true]);
    const mp = c().series[0].primitives[0].data.lines.filter(l => l.color === '#a78bfa');
    assert.ok(mp.length && mp.every(l => l.width === 2 && l.style === 2 && l.value === 5000), 'max pain: flat, dashed, 2 px');
    assert.equal(series[9].data.length, 78);
    // the session closes above the call wall at 13:40 ET (see 'marks a wall the price closes through'), not shown by default
    // ("Call wall broken" off); each wall and the flip with its distance from spot
    assert.match(el.querySelector('.fac-legend').textContent,
      /SPX.*Spot 5,076\.50Call wall 5,050\.00 \(−0\.5%\)Put wall 4,950\.00 \(−2\.5%\)Gamma flip 4,990\.00 \(−1\.7%\)Max pain 5,000\.00/);
    chart.destroy();
    assert.equal(c().removed, true);
    assert.equal(el.querySelector('.fac'), null);
  });

  it('is laid out like TradingView: top toolbar, chart, time bar with ranges, session and an ET clock', async () => {
    const el = host();
    const { chart } = open(el, { layouts: false });
    await tick();
    const blocks = [...el.querySelector('.fac').children].map(x => x.className);
    assert.deepEqual(blocks.slice(0, 3), ['fac-bar', 'fac-body', 'fac-timebar']);
    assert.ok(el.querySelector('.fac-bar [data-g="symbols"]') && el.querySelector('.fac-bar [data-g="res"]') && el.querySelector('.fac-bar .fac-menu'));
    assert.deepEqual([...el.querySelectorAll('.fac-timebar [data-g="range"] button')].map(b => b.textContent), ['1D', '5D', '1M']);
    assert.deepEqual([...el.querySelectorAll('.fac-timebar [data-g="session"] button')].map(b => b.textContent), ['RTH', 'ETH']);
    assert.deepEqual([...el.querySelectorAll('.fac-timebar [data-g="session"] button')].map(b => b.title),
      ['Regular trading hours: 9:30 to 16:00 ET', 'Extended trading hours: adds pre-market and after-hours']);
    assert.match(el.querySelector('.fac-timebar .fac-clock').textContent, /^\d\d:\d\d:\d\d ET$/);
    chart.destroy();
    const bare = host();
    const c2 = open(bare, { controls: false }).chart;
    assert.equal(bare.querySelector('.fac-bar, .fac-timebar'), null, 'controls: false hides both bars');
    c2.destroy();
  });

  it('picks the symbol from a dropdown with a search box', async () => {
    const el = host();
    const source = fakeSource();
    source.symbols = () => ['SPX', 'SPY', 'QQQ', 'AAPL', 'AMD', 'AMZN', 'NVDA', 'TSLA', 'META', 'MSFT', 'IWM', 'GOOGL']
      .map(symbol => ({ symbol, name: symbol === 'AAPL' ? 'Apple Inc.' : undefined }));
    const { chart } = open(el, { source });
    await tick();
    const menu = el.querySelector('.fac-bar [data-g="symbols"]');
    assert.equal(menu.querySelector('.fac-dd-val').textContent, 'SPX');
    assert.equal(menu.querySelector('select'), null, 'no native select, even for a long list');
    menu.querySelector('button').click();
    assert.ok(menu.classList.contains('open'));
    const opts = () => [...menu.querySelectorAll('.fac-opt')].map(x => x.dataset.v);
    assert.equal(opts().length, 12);
    assert.deepEqual(opts(), ['SPY', 'SPX', 'QQQ', 'TSLA', 'NVDA', 'AAPL', 'AMD', 'AMZN', 'GOOGL', 'IWM', 'META', 'MSFT'],
      'the featured symbols first, in their order, then the rest alphabetically');
    assert.equal(menu.querySelector('.fac-opt.on').dataset.v, 'SPX');
    const search = menu.querySelector('.fac-search');
    search.value = 'a';
    search.dispatchEvent(new window.Event('input'));
    assert.deepEqual(opts().slice(0, 3), ['AAPL', 'AMD', 'AMZN'], 'symbols starting with the text first');
    assert.match(menu.querySelector('.fac-opt').textContent, /Apple Inc\./);
    search.value = 'apple';
    search.dispatchEvent(new window.Event('input'));
    assert.deepEqual(opts(), ['AAPL'], 'the name matches too');
    search.value = 'zzz';
    search.dispatchEvent(new window.Event('input'));
    assert.equal(menu.querySelector('.fac-none').textContent, 'No symbols match');
    search.value = 'am';
    search.dispatchEvent(new window.Event('input'));
    search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown' }));
    search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
    await tick();
    assert.ok(!menu.classList.contains('open'), 'picking closes the dropdown');
    assert.equal(menu.querySelector('.fac-dd-val').textContent, 'AMZN', 'ArrowDown moves from AMD to AMZN, Enter picks it');
    assert.equal(source.calls.filter(x => x.fn === 'bars').at(-1).s, 'AMZN');
    chart.destroy();
  });

  it('picks the interval from a dropdown; outside click and Escape close it', async () => {
    const el = host();
    const { source, chart } = open(el);
    await tick();
    const menu = el.querySelector('.fac-bar [data-g="res"]');
    assert.equal(menu.querySelector('.fac-dd-val').textContent, '5m');
    menu.querySelector('button').click();
    assert.deepEqual([...menu.querySelectorAll('.fac-opt')].map(x => x.textContent),
      ['1 minute1m', '5 minutes5m', '15 minutes15m', '1 hour1h', '1 day1d', '1 week1w']);
    assert.equal(menu.querySelector('.fac-opt.on').dataset.v, '5m');
    document.body.click();
    assert.ok(!menu.classList.contains('open'), 'an outside click closes it');
    menu.querySelector('button').click();
    menu.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.ok(!menu.classList.contains('open'), 'Escape closes it');
    menu.querySelector('button').click();
    menu.querySelector('[data-v="15m"]').click();
    await tick();
    assert.equal(menu.querySelector('.fac-dd-val').textContent, '15m');
    assert.equal(source.calls.filter(x => x.fn === 'bars').at(-1).res, '15m');
    el.querySelector('[data-g="symbols"] button').click();
    assert.ok(!menu.classList.contains('open') && el.querySelector('[data-g="symbols"]').classList.contains('open'), 'one menu open at a time');
    chart.destroy();
  });

  it('has Settings, Fullscreen, screenshot and Sign up on the right; the plan name once signed in', async () => {
    const el = host();
    const { chart } = open(el, { layouts: false });
    const right = el.querySelector('.fac-bar .fac-right');
    assert.equal(right.querySelector('.fac-account').hidden, true, 'nothing before the first answer');
    await tick();
    assert.deepEqual([...right.querySelectorAll('button')].map(b => b.title), ['Settings', 'Fullscreen', 'Take a screenshot']);
    const signup = right.querySelector('.fac-account');
    assert.equal(signup.hidden, false);
    assert.equal(signup.textContent, 'Sign up');
    const u = new URL(signup.href);
    assert.equal(u.origin + u.pathname, 'https://flashalpha.com/pricing');
    assert.equal(u.searchParams.get('utm_campaign'), 'signup');
    assert.equal(right.querySelector('[data-a="fullscreen"]').hidden, true, 'no fullscreen in this browser: no button');
    chart.destroy();

    const el2 = host();
    const c2 = open(el2, { source: fakeSource({ plan: 'growth' }) }).chart;
    await tick();
    const tier = el2.querySelector('.fac-account');
    assert.equal(tier.textContent, 'Growth');
    assert.ok(tier.classList.contains('fac-tier'));
    assert.match(tier.href, /^https:\/\/flashalpha\.com\/pricing\?.*utm_content=account/);
    c2.destroy();

    const el3 = host();
    const c3 = open(el3, { account: false, signupUrl: 'https://example.com/join' }).chart;
    await tick();
    assert.equal(el3.querySelector('.fac-account'), null, 'account: false hides it');
    c3.destroy();
  });

  it('says "Sign up" without a key even when the chart API names a plan for the keyless answer', async () => {
    const d = sessionData();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('/v1/charts/') ? { plan: 'free', layers: {}, exposure: d.exposure }
      : String(url).includes('/v1/bars/') ? { bars: d.bars } : [{ symbol: 'SPX', last_bar: '2026-11-13T20:45:00Z' }]),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
    try {
      const el = host();
      const chart = mount(el, { symbol: 'SPX', refresh: 0, lightweightCharts: fakeLW(), storage: false, baseUrl: 'https://charts.test',
        layouts: false });
      await tick(50);
      assert.equal(chart.plan, 'free', 'the plan is kept (it locks the layers like the free plan)');
      const account = el.querySelector('.fac-account');
      assert.equal(account.textContent, 'Sign up');
      assert.ok(account.classList.contains('fac-signup') && !account.classList.contains('fac-tier'));
      chart.destroy();
    } finally { globalThis.fetch = realFetch; }
  });

  it('names the indicators the plan does not include on one legend line with an Upgrade link', async () => {
    const el = host();
    const { chart } = open(el, { source: fakeSource({ plan: null, gated: ['exposure'] }), layers: ['levels', 'maxpain'] });
    await tick();
    const line = el.querySelector('.fac-legend .fac-lg-gated');
    assert.ok(line, 'the "Not in your plan" line');
    assert.match(line.textContent, /^Not in your plan: GEX Levels Upgrade$/);
    const a = line.querySelector('a.fac-lg-up');
    assert.equal(a.target, '_blank');
    assert.match(a.href, /^https:\/\/flashalpha\.com\/pricing\?.*utm_content=legend/);
    assert.doesNotMatch(el.querySelector('.fac-legend').textContent, /none yet in this window/, 'not the "no levels yet" reason');
    await chart.setLayers([]);
    assert.equal(el.querySelector('.fac-legend .fac-lg-gated'), null, 'gone with the indicator');
    chart.destroy();
  });

  it('Settings switch the theme, volume, grid lines and legend', async () => {
    const el = host();
    const { c, chart } = open(el);
    await tick();
    const menu = el.querySelector('.fac-settings');
    menu.querySelector('button').click();
    assert.ok(menu.classList.contains('open'));
    const theme = menu.querySelector('[data-s="theme"]');
    assert.equal(theme.value, 'dark');
    assert.ok(['volume', 'grid', 'legend'].every(k => menu.querySelector(`[data-s="${k}"]`).checked));
    assert.equal(el.querySelector('.fac').style.getPropertyValue('--fac-scheme'), 'dark');
    theme.value = 'light';
    theme.dispatchEvent(new window.Event('change'));
    assert.equal(el.querySelector('.fac').style.getPropertyValue('--fac-bg'), '#ffffff');
    assert.equal(el.querySelector('.fac').style.getPropertyValue('--fac-scheme'), 'light');
    const flip = k => { const x = menu.querySelector(`[data-s="${k}"]`); x.checked = false; x.dispatchEvent(new window.Event('change')); };
    flip('volume');
    assert.deepEqual(c().series[1].applied.at(-1), { visible: false });
    flip('grid');
    assert.deepEqual(c().applied.at(-1), { grid: { vertLines: { visible: false }, horzLines: { visible: false } } });
    flip('legend');
    assert.ok(el.querySelector('.fac').classList.contains('fac-nolegend'));
    chart.destroy();
  });

  it('like TradingView: the chart type menu next to Indicators, % log auto in the time bar, Settings in sections', async () => {
    const el = host();
    const { c, chart } = open(el);
    await tick();
    const bar = [...el.querySelector('.fac-bar').children].map(x => x.dataset.g || x.className.split(' ').at(-1));
    assert.deepEqual(bar.slice(0, 4), ['symbols', 'res', 'type', 'fac-ind-menu'], 'symbol, interval, chart type, Indicators');
    const type = el.querySelector('[data-g="type"]');
    assert.equal(type.querySelector('button').title, 'Chart type: Candles');
    assert.ok(type.querySelector('.fac-dd-val svg'), 'the button shows the type\'s icon');
    assert.deepEqual([...type.querySelectorAll('.fac-opt')].map(x => x.textContent),
      ['Candles', 'Hollow candles', 'Bars', 'Line', 'Area', 'Baseline', 'Heikin Ashi']);
    type.querySelector('button').click();
    type.querySelector('.fac-opt[data-v="area"]').click();
    assert.ok(!type.classList.contains('open'), 'picking closes the menu');
    assert.equal(type.querySelector('button').title, 'Chart type: Area');
    assert.equal(type.querySelector('.fac-opt.on').dataset.v, 'area');
    assert.ok(c().series.some(s => s.type === 'Area' && !s.removedFrom));

    const scale = () => [...el.querySelectorAll('[data-g="scale"] button')];
    assert.deepEqual(scale().map(b => [b.textContent, b.classList.contains('on')]), [['%', false], ['log', false], ['auto', true]]);
    assert.equal(el.querySelector('.fac-timebar').lastElementChild.dataset.g, 'scale', 'at the right of the time bar');
    scale()[0].click();
    assert.deepEqual(c().scales.at(-1), ['right', 0, { mode: 2, autoScale: true, invertScale: false }]);
    assert.deepEqual(scale().map(b => b.classList.contains('on')), [true, false, true]);
    scale()[1].click();
    assert.deepEqual(scale().map(b => b.classList.contains('on')), [false, true, true], '% and log: one at a time');
    scale()[1].click();
    assert.equal(c().scales.at(-1)[2].mode, 0, 'log again: back to regular');
    scale()[2].click();
    assert.equal(c().scales.at(-1)[2].autoScale, false);
    assert.equal(scale()[2].classList.contains('on'), false);
    c().scales.push(['right', 0, { autoScale: true }]);             // the reader double-clicked the price scale
    el.querySelector('.fac-canvas').dispatchEvent(new window.Event('dblclick'));
    await tick();
    assert.equal(scale()[2].classList.contains('on'), true, 'auto follows the chart');

    const menu = el.querySelector('.fac-settings');
    assert.deepEqual([...menu.querySelectorAll('.fac-sec')].map(x => x.textContent), ['Appearance', 'Scales', 'Crosshair', 'Status line']);
    assert.equal(menu.querySelector('[data-s="chartType"]'), null, 'the chart type is in the toolbar');
    chart.destroy();
  });

  it('Settings draw the chart type, price scale, crosshair, last price line and label, and the watermark', async () => {
    const el = host();
    const { c, LW, chart } = open(el);
    await tick();
    const menu = el.querySelector('.fac-settings');
    menu.querySelector('button').click();
    const pick = (k, v) => {
      if (k === 'chartType') { el.querySelector(`[data-g="type"] .fac-opt[data-v="${v}"]`).click(); return; }
      const x = menu.querySelector(`[data-s="${k}"]`); x.value = v; x.dispatchEvent(new window.Event('change'));
    };
    const flip = (k, v) => { const x = menu.querySelector(`[data-s="${k}"]`); x.checked = v; x.dispatchEvent(new window.Event('change')); };
    assert.deepEqual(['scaleMode', 'scaleSide', 'crosshair'].map(k => menu.querySelector(`[data-s="${k}"]`).value),
      ['normal', 'right', 'normal']);
    assert.deepEqual(['autoScale', 'invert', 'priceLine', 'priceLabel', 'watermark'].map(k => menu.querySelector(`[data-s="${k}"]`).checked),
      [true, false, true, true, false]);
    const live = type => c().series.filter(s => s.type === type && !s.removedFrom);
    const candles = c().series[0], first = candles.data[0], n = candles.data.length;

    // Chart type: the candles stay (price scale, levels, markers), unseen, under a series of the type picked.
    pick('chartType', 'bars');
    const [bars] = live('Bar');
    assert.equal(bars.data.length, n);
    assert.equal(candles.data[0].color, 'transparent');
    assert.deepEqual(candles.applied.at(-1), { lastValueVisible: false, priceLineVisible: false });
    assert.deepEqual(bars.applied.at(-1), { lastValueVisible: true, priceLineVisible: true }, 'the price line moves to the bars');
    pick('chartType', 'heikin');
    assert.ok(bars.removedFrom, 'one series for the type picked');
    const ha = live('Candlestick')[1], close = (first.open + first.high + first.low + first.close) / 4;
    assert.equal(ha.data[0].close, close);
    assert.equal(ha.data[0].open, (first.open + first.close) / 2);
    assert.equal(ha.data[1].open, (ha.data[0].open + ha.data[0].close) / 2);
    pick('chartType', 'line');
    assert.ok(ha.removedFrom);
    const line = c().series.find(s => s.type === 'Line' && s.opts.color === '#4f8cff');
    assert.equal(line.data.length, n);
    assert.equal(line.applied.at(-1).visible, true);
    pick('chartType', 'area');
    assert.deepEqual(live('Area')[0].data[0], { time: first.time, value: first.close });
    assert.deepEqual(line.data, []);
    pick('chartType', 'baseline');
    assert.equal(live('Baseline')[0].applied.at(-1).baseValue.price, first.close, 'the base is the first close');
    pick('chartType', 'candles');
    assert.equal(live('Baseline').length + live('Area').length + live('Bar').length, 0);
    assert.equal(candles.data[0].color, undefined, 'candles drawn again');
    assert.deepEqual(candles.applied.at(-1), { lastValueVisible: true, priceLineVisible: true });

    // Price scale: mode, invert, side (every price series moves, the volume overlay stays), auto scale.
    pick('scaleMode', 'log');
    assert.deepEqual(c().scales.at(-1), ['right', 0, { mode: 1, autoScale: true, invertScale: false }]);
    flip('invert', true);
    assert.deepEqual(c().scales.at(-1), ['right', 0, { mode: 1, autoScale: true, invertScale: true }]);
    pick('scaleSide', 'left');
    assert.ok(c().applied.some(x => x.rightPriceScale && x.rightPriceScale.visible === false && x.leftPriceScale.visible === true));
    assert.equal(c().scales.at(-1)[0], 'left');
    assert.equal(candles.options().priceScaleId, 'left');
    assert.equal(line.options().priceScaleId, 'left');
    assert.equal(c().series[1].options().priceScaleId, 'vol', 'the volume keeps its overlay scale');
    pick('scaleMode', 'percent');
    assert.ok(candles.applied.some(x => x.priceScaleId === 'fac-hop'), 'the candles go first on the scale (the percent base)');
    assert.deepEqual(c().scales.at(-1), ['left', 0, { mode: 2, autoScale: true, invertScale: true }]);
    c().scales.push(['left', 0, { autoScale: false }]);             // the reader dragged the price scale
    menu.querySelector('button').click(); menu.querySelector('button').click();
    assert.equal(menu.querySelector('[data-s="scaleMode"]').value, 'percent');
    assert.equal(menu.querySelector('[data-s="autoScale"]').checked, false);
    flip('autoScale', true);
    assert.equal(c().scales.at(-1)[2].autoScale, true);

    // Crosshair, last price line and label, watermark.
    pick('crosshair', 'magnetOHLC');
    assert.deepEqual(c().applied.at(-1), { crosshair: { mode: 3 } });
    flip('priceLine', false);
    assert.deepEqual(candles.applied.at(-1), { lastValueVisible: true, priceLineVisible: false });
    flip('priceLabel', false);
    assert.deepEqual(candles.applied.at(-1), { lastValueVisible: false, priceLineVisible: false });
    flip('watermark', true);
    assert.deepEqual(LW.watermarks[0].opts.lines.map(l => l.text), ['SPX', '5 minutes']);
    chart.setTheme('light');
    assert.equal(LW.watermarks[0].opts.lines[0].color, 'rgba(31,36,48,0.07)', 'the watermark follows the theme');
    flip('watermark', false);
    assert.equal(LW.watermarks[0].detached, true);
    chart.destroy();
  });

  it('Percent and Indexed to 100: the levels\' price lines and labels go on the candles (their base), none of their own', async () => {
    const el = host();
    const { c, chart } = open(el, { layers: ['levels', 'maxpain'] });
    await tick();
    const menu = el.querySelector('.fac-settings');
    const pick = v => { const x = menu.querySelector('[data-s="scaleMode"]'); x.value = v; x.dispatchEvent(new window.Event('change')); };
    const candles = c().series[0], lv = c().series.slice(6, 10);
    assert.deepEqual(lv.map(s => s.opts.title), ['Gamma flip', 'Call wall', 'Put wall', 'Max pain']);
    pick('percent');
    assert.deepEqual(candles.priceLines.map(l => [l.options.title, l.options.price, l.options.axisLabelVisible]),
      [['Gamma flip', 4990, true], ['Call wall', 5050, true], ['Put wall', 4950, true], ['Max pain', 5000, true]]);
    assert.ok(lv.every(s => s.options().lastValueVisible === false && s.options().priceLineVisible === false && s.options().title === ''),
      'no label or title of their own');
    pick('indexed');
    assert.equal(candles.priceLines.length, 4);
    pick('log');
    assert.deepEqual(candles.priceLines, []);
    assert.ok(lv.every(s => s.options().lastValueVisible === true && s.options().priceLineVisible === true), 'their own labels again');
    assert.deepEqual(lv.map(s => s.options().title), ['Gamma flip', 'Call wall', 'Put wall', 'Max pain']);
    assert.ok(lv.every(s => s.options().lineVisible === false), 'the overlay still draws their lines');
    chart.destroy();
  });

  it('options.background goes with the theme of its kind: a dark colour with dark, a light one with light', async () => {
    const bg = (background, theme) => {
      const el = host();
      const { chart } = open(el, { background, theme, layouts: false });
      const root = el.querySelector('.fac');
      const on = name => { chart.setTheme(name); return root.style.getPropertyValue('--fac-bg'); };
      const out = [on('dark'), on('light')];
      chart.destroy();
      return out;
    };
    // a dark page's background under the light theme's dark text was unreadable (contrast 1.15)
    assert.deepEqual(bg('#0f172a', 'dark'), ['#0f172a', '#ffffff']);
    assert.deepEqual(bg('rgb(15, 23, 42)', 'dark'), ['rgb(15, 23, 42)', '#ffffff']);
    assert.deepEqual(bg('#fafafa', 'light'), ['#0f1115', '#fafafa']);
    assert.deepEqual(bg('#fff', 'light'), ['#0f1115', '#fff']);
    // a colour the chart cannot read keeps going with both themes, as before
    assert.deepEqual(bg('navy', 'dark'), ['navy', 'navy']);
  });

  it('a menu panel wider than the room on both sides of its button stays inside the widget (phones)', async () => {
    const el = host();
    const { chart } = open(el, { layouts: false });
    await tick();
    const root = el.querySelector('.fac');
    const menu = el.querySelector('.fac-ind-menu'), panel = menu.querySelector('.fac-panel');
    const rect = (left, width) => ({ left, right: left + width, width, top: 100, bottom: 300, height: 200 });
    // a 332 px widget at x 29..361 (390 px phone); the Indicators button at 160..259; the panel 270 px wide
    let widget = rect(29, 332);
    root.getBoundingClientRect = () => widget;
    menu.getBoundingClientRect = () => rect(160, 99);
    panel.getBoundingClientRect = () => {
      const s = panel.style, w = Math.min(270, s.maxWidth ? parseFloat(s.maxWidth) : Infinity);
      return rect(s.left === 'auto' ? 259 - w : 160 + (parseFloat(s.left) || 0), w);
    };
    menu.querySelector('button').click();
    let p = panel.getBoundingClientRect();
    assert.deepEqual([p.left, p.right], [91, 361], 'moved left until it ends at the widget edge');
    assert.equal(panel.style.maxWidth, '');
    document.body.click();
    // a 262 px widget (320 px phone): the panel takes the widget's width
    widget = rect(29, 262);
    menu.querySelector('button').click();
    p = panel.getBoundingClientRect();
    assert.deepEqual([p.left, p.right, panel.style.maxWidth, panel.style.minWidth], [29, 291, '262px', '0']);
    document.body.click();
    // room under the button again (desktop): left as before, no width limit
    widget = rect(0, 1000);
    menu.querySelector('button').click();
    assert.deepEqual([panel.style.left, panel.style.right, panel.style.maxWidth, panel.style.minWidth], ['', '', '', '']);
    chart.destroy();
  });

  it('takes a screenshot: the chart under a title line, saved as a PNG', async () => {
    const el = host();
    const { c, chart } = open(el);
    await tick();
    const drawn = [], saved = [];
    const proto = window.HTMLCanvasElement.prototype, aProto = window.HTMLAnchorElement.prototype;
    const old = { getContext: proto.getContext, toBlob: proto.toBlob, click: aProto.click, url: window.URL.createObjectURL };
    proto.getContext = () => ({ fillRect() {}, measureText: () => ({ width: 30 }), fillText: t => drawn.push(t), drawImage: x => drawn.push(x) });
    proto.toBlob = cb => cb(new window.Blob(['png']));
    globalThis.URL.createObjectURL = () => 'blob:shot';
    aProto.click = function () { saved.push([this.download, this.getAttribute('href')]); };
    const shot = document.createElement('canvas');
    shot.width = 800; shot.height = 400;
    c().takeScreenshot = (top, cross) => { drawn.push(['args', top, cross]); return shot; };
    try {
      el.querySelector('[data-a="screenshot"]').click();
      assert.deepEqual(drawn[0], ['args', true, false]);
      assert.ok(drawn.includes('SPX'));
      assert.ok(drawn.includes(shot));
      assert.equal(saved.length, 1);
      assert.match(saved[0][0], /^SPX_5m_\d{4}-\d\d-\d\d_\d{4}\.png$/);
      assert.equal(saved[0][1], 'blob:shot');
    } finally {
      Object.assign(proto, { getContext: old.getContext, toBlob: old.toBlob });
      aProto.click = old.click; globalThis.URL.createObjectURL = old.url;
    }
    chart.destroy();
  });

  it('goes fullscreen and back', async () => {
    const el = host();
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    let fsEl = null;
    Object.defineProperty(document, 'fullscreenElement', { get: () => fsEl, configurable: true });
    const proto = window.Element.prototype;
    proto.requestFullscreen = function () { fsEl = this; document.dispatchEvent(new window.Event('fullscreenchange')); return Promise.resolve(); };
    document.exitFullscreen = () => { fsEl = null; document.dispatchEvent(new window.Event('fullscreenchange')); return Promise.resolve(); };
    try {
      const { chart } = open(el, { layouts: false });
      await tick();
      const btn = el.querySelector('[data-a="fullscreen"]'), root = el.querySelector('.fac');
      assert.equal(btn.hidden, false);
      btn.click();
      assert.equal(fsEl, root);
      assert.ok(root.classList.contains('fac-fullscreen'));
      assert.equal(btn.title, 'Exit fullscreen');
      btn.click();
      assert.equal(fsEl, null);
      assert.equal(btn.title, 'Fullscreen');
      chart.destroy();
    } finally {
      delete document.fullscreenEnabled; delete document.fullscreenElement; delete proto.requestFullscreen; delete document.exitFullscreen;
    }
  });

  it('shows the levels in the legend with the change vs the previous session, and no key levels text', async () => {
    const el = host();
    const { c, chart } = open(el, { source: hourlySource(), resolution: '1h', days: 3, layers: ['levels'] });
    await tick();
    const legend = el.querySelector('.fac-legend .lv').textContent;
    // the price climbs one a bar: by the last bar it has closed above the day's call wall (breaks not shown by default);
    // each level with its distance from spot, then its change vs the previous session
    assert.match(legend, /^GEX LevelsSpot [\d,.]+ \(\+[\d.]+\)Call wall [\d,.]+ \(−[\d.]+%\) \(\+1\.00\)Put wall [\d,.]+ \(−[\d.]+%\) \(−1\.00\)Gamma flip [\d,.]+ \(−[\d.]+%\) \(\+1\.00\)As of ([A-Z][a-z]{2} \d{1,2} )?\d{1,2}:\d\d ET$/,
      'with the day when the newest row is on another day than the newest regular-hours bar (a run between midnight and the open)');
    // the lines are cut between sessions: the first row of each new session is a gap, every other row has its value
    const call = c().series.find(s => s.opts.title === 'Call wall').data, day = t => new Date(t * 1000).toISOString().slice(0, 10);
    const firsts = call.filter((p, i) => i > 0 && day(p.time) !== day(call[i - 1].time));
    assert.ok(firsts.length >= 2 && firsts.every(p => p.value == null), 'a gap at each new session');
    assert.ok(call.filter((p, i) => i === 0 || day(p.time) === day(call[i - 1].time)).every(p => p.value != null));
    // the overlay draws each session's level as its own flat segment (from the session's first bar, no vertical step)
    const overlay = c().series[0].primitives[0], sessions = [...new Set(c().series[0].data.map(b => day(b.time)))];
    // (a broken wall is drawn faded from the break on: its own segment, in the same session)
    const callLines = overlay.data.lines.filter(l => l.color === '#059669' || l.color === 'rgba(5, 150, 105, 0.35)');
    assert.ok(callLines.every(l => day(l.from) === day(l.to) && l.width === 2 && l.style === 0), 'never across sessions');
    assert.deepEqual([...new Set(callLines.map(l => day(l.from)))], sessions, 'each session has its call wall');
    assert.equal('days' in overlay.data, false, 'no day bands');
    // the session under the crosshair is in focus (the overlay veils the others); none off the chart
    assert.equal(overlay.data.focus, null);
    const bars = c().series[0].data, mid = bars[Math.floor(bars.length / 2)].time;
    c().crosshair.forEach(fn => fn({ time: mid, point: { x: 0, y: 0 } }));
    const f = overlay.data.focus;
    assert.ok(f && f.from <= mid && mid <= f.to, 'the hovered session');
    assert.ok(f.from > bars[0].time && f.to < bars.at(-1).time, 'that session only');
    c().crosshair.forEach(fn => fn({ time: null, point: null }));
    assert.equal(overlay.data.focus, null, 'off the chart: nothing veiled');
    assert.equal(el.querySelector('.fac-keys'), null, 'nothing next to Indicators');
    assert.equal(el.querySelector('.fac-ind-menu').nextElementSibling.className, 'fac-spacer');
    chart.destroy();
    const bare = host();
    const c2 = open(bare, { source: hourlySource(), resolution: '1h', days: 3, controls: false }).chart;
    await tick();
    assert.equal(bare.querySelector('.fac-keys'), null, 'nor under the chart without a toolbar');
    c2.destroy();
  });

  it('a new symbol fits its data: time scale and price scales (a dragged price scale would miss SPX after SPY)', async () => {
    const el = host();
    const { c, chart } = open(el);
    await tick();
    const fits = c().ts.fits;
    c().scales.length = 0;
    await chart.setSymbol('QQQ');
    assert.equal(c().ts.fits, fits + 1, 'the time scale fits the new bars');
    assert.deepEqual(c().scales.filter(([, , x]) => x.autoScale), [['right', 0, { autoScale: true }], ['left', 0, { autoScale: true }]],
      'every pane\'s price scales fit again');
    c().scales.length = 0;
    el.querySelector('.fac-canvas').dispatchEvent(new window.Event('pointerdown'));
    c().ts.rangeSubs.forEach(fn => fn({ from: 1, to: 20 }));
    await tick();
    assert.equal(c().scales.some(([, , x]) => x.autoScale), false, 'loading more bars keeps the reader\'s vertical zoom');
    chart.destroy();
  });

  it('loads the window before the first bar when the chart is dragged to its left edge', async () => {
    const el = host();
    const source = hourlySource({ days: 6 });
    const { c, chart } = open(el, { source, resolution: '1h', days: 2 });
    await tick();
    const ts = c().ts, bars = () => source.calls.filter(x => x.fn === 'bars');
    const n0 = c().series[0].data.length;
    assert.equal(bars().length, 1);
    ts.logical = { from: 3, to: 40 };
    ts.rangeSubs.forEach(fn => fn(ts.logical));
    await tick();
    assert.equal(bars().length, 1, 'not before the reader touches the chart (the first fit starts at bar 0)');
    el.querySelector('.fac-canvas').dispatchEvent(new window.Event('pointerdown'));
    ts.rangeSubs.forEach(fn => fn(ts.logical));
    await tick();
    assert.equal(bars().length, 2);
    const older = bars()[1];
    assert.ok(Date.parse(older.from) < Date.parse(bars()[0].from), 'an older window');
    assert.ok(Date.parse(older.to) <= Date.parse(bars()[0].from) + 3600e3, 'ending at the first bar drawn');
    const n1 = c().series[0].data.length, added = n1 - n0;
    assert.ok(added >= 47, `about two days of hourly bars added (${added})`);
    assert.deepEqual(ts.setLogical.at(-1), { from: 3 + added, to: 40 + added }, 'the view stays on the same bars');
    assert.equal(source.calls.filter(x => x.fn === 'charts').length, 2, 'the layers of that window too');
    // again and again until the symbol's first bar, then no more requests
    for (let i = 0; i < 4; i++) { ts.rangeSubs.forEach(fn => fn({ from: 1, to: 30 })); await tick(); }
    assert.equal(c().series[0].data.length, 6 * 24 + 1, 'every bar from first_bar on');
    const calls = bars().length;
    ts.rangeSubs.forEach(fn => fn({ from: 1, to: 30 }));
    await tick();
    assert.equal(bars().length, calls, 'nothing before first_bar is asked');
    chart.destroy();
  });

  it('loads the bars after the newest one when the chart is dragged to its right edge and they are old', async () => {
    const el = host();
    const source = hourlySource({ days: 3, lagHours: 5 });
    const { c, chart } = open(el, { source, resolution: '1h', days: 3 });
    await tick();
    const ts = c().ts, bars = () => source.calls.filter(x => x.fn === 'bars');
    const n0 = c().series[0].data.length;
    source.now(Date.now());
    el.querySelector('.fac-canvas').dispatchEvent(new window.Event('pointerdown'));
    const realNow = Date.now;
    Date.now = () => realNow() + 61e3;            // past the one-minute pause after the last load
    try {
      ts.rangeSubs.forEach(fn => fn({ from: 20, to: n0 - 1 }));
      await tick();
    } finally { Date.now = realNow; }
    assert.equal(bars().length, 2);
    const tail = bars()[1];
    assert.ok(Date.parse(tail.from) > Date.parse(bars()[0].from) + 2 * 86400e3, 'only the tail');
    assert.equal(c().series[0].data.length, n0 + 5, 'the five newer hours');
    chart.destroy();
  });

  it('shows the legend for the bar under the crosshair', async () => {
    const el = host();
    const { c, chart } = open(el, { layers: ['levels'] });
    await tick();
    c().crosshair.forEach(fn => fn({ time: chartTime('2026-11-13T14:35:00Z'), point: { x: 0, y: 0 } }));
    assert.match(el.querySelector('.fac-legend').textContent, /Gamma flip \(unverified\) 4,990\.00/);
    chart.destroy();
  });

  it('marks a wall the price closes through: faded line from that bar, a marker, "(broken)" in the legend', async () => {
    // sessionData: the close climbs one a bar and first closes above the 5,050 call wall at 18:40 UTC (13:40 ET); it never
    // closes below the 4,950 put wall
    const el = host();
    const { LW, c, chart } = open(el, { layers: ['levels'] });
    await tick();
    const call = c().series.find(s => s.opts.title === 'Call wall'), put = c().series.find(s => s.opts.title === 'Put wall');
    const at = chartTime('2026-11-13T18:40:00Z');
    // off by default ("Call wall broken" / "Put wall broken"): no fading, no marker, no "broken"
    assert.deepEqual([chart.styles.callWallBroken.visible, chart.styles.putWallBroken.visible], [false, false]);
    assert.ok(call.data.every(p => !p.color), 'not faded');
    assert.deepEqual(LW.markerSets[0].markers, []);
    assert.doesNotMatch(el.querySelector('.fac-legend').textContent, /broken/);
    chart.setStyle('callWallBroken', { visible: true });
    assert.ok(call.data.filter(p => p.time < at).every(p => !p.color), 'unbroken before the break: the plot colour');
    assert.ok(call.data.filter(p => p.time >= at).every(p => p.color === 'rgba(5, 150, 105, 0.35)'), 'faded from the break on');
    assert.ok(put.data.every(p => !p.color), 'the put wall is not broken');
    const set = LW.markerSets[0];
    assert.equal(set.series, c().series[0], 'markers on the candles');
    assert.deepEqual(set.markers, [{ time: at, position: 'aboveBar', shape: 'arrowUp', color: '#059669', text: 'Call wall broken 13:40' }]);
    // the legend says "broken" from the break bar on, not before (spot 5,049.5 at 18:35, 5,050.5 at 18:40)
    c().crosshair.forEach(fn => fn({ time: chartTime('2026-11-13T18:35:00Z'), point: { x: 0, y: 0 } }));
    assert.match(el.querySelector('.fac-legend').textContent, /Call wall 5,050\.00 \(0\.0%\)Put wall/);
    c().crosshair.forEach(fn => fn({ time: at, point: { x: 0, y: 0 } }));
    assert.match(el.querySelector('.fac-legend').textContent, /Call wall 5,050\.00 \(0\.0%, broken\)Put wall/);
    // the marker takes the option's colour
    chart.setStyle('callWallBroken', { color: '#123456' });
    assert.equal(set.markers[0].color, '#123456');
    assert.equal(el.querySelector('.fac-lg-note'), null);
    // a hidden call wall has no marker; with the layer off, none at all
    chart.setStyle('callWall', { visible: false });
    assert.deepEqual(set.markers, []);
    await chart.setLayers([]);
    assert.deepEqual(set.markers, []);
    chart.destroy();
  });

  it('the legend shows the walls and the flip only while Walls & gamma flip is on', async () => {
    const el = host();
    const { chart } = open(el, { layers: ['maxpain'] });
    await tick();
    const line = () => el.querySelector('.fac-legend .lv').textContent;
    assert.match(line(), /^GEX LevelsSpot 5,076\.50Max pain 5,000\.00As of \d{1,2}:\d\d ET$/);
    await chart.setLayers(['levels', 'maxpain']);
    await tick();
    assert.match(line(), /Call wall 5,050\.00.*Put wall.*Gamma flip.*Max pain/);
    chart.destroy();
  });

  it('has no "Session levels" note in the legend with the FlashAlpha chart API', async () => {
    const d = sessionData();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('/v1/charts/') ? { plan: 'alpha', layers: {}, exposure: d.exposure }
      : String(url).includes('/v1/bars/') ? { bars: d.bars } : [{ symbol: 'SPX', last_bar: '2026-11-13T20:45:00Z' }]),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
    try {
      const el = host();
      const chart = mount(el, { symbol: 'SPX', refresh: 0, lightweightCharts: fakeLW(), storage: false, baseUrl: 'https://charts.test',
        apiKey: 'k', layers: ['levels'] });
      await tick(50);
      assert.match(el.querySelector('.fac-legend .lv').textContent, /Call wall/);
      assert.equal(el.querySelector('.fac-legend .lv .fac-lg-note'), null);
      assert.doesNotMatch(el.querySelector('.fac-legend').textContent, /Session levels/);
      chart.destroy();
    } finally { globalThis.fetch = realFetch; }
  });

  it('turns a layer off and stops asking for exposure', async () => {
    const el = host();
    const { c, source, chart } = open(el);
    await tick();
    await chart.setLayers([]);
    assert.deepEqual(chart.layers, []);
    assert.deepEqual(c().series[7].data, []);
    // spot candles still need the rows
    assert.deepEqual(source.calls.filter(x => x.fn === 'charts').at(-1).q.layers, ['exposure']);
    chart.destroy();
  });

  it('turns layers off and on again from what is loaded; a layer that needs more asks only that, the bars and the view stay', async () => {
    const el = host();
    const base = fakeSource();
    let release = null;
    // charts() answers when the test says so (release), to see "Loading…" while it waits
    const source = Object.assign({}, base, { charts: (...a) => {
      const out = base.charts(...a);
      return release === false ? new Promise(r => { release = () => r(out); }) : out;
    } });
    const { c, chart } = open(el, { source, layers: ['levels', 'maxpain'] });
    await tick();
    const calls = fn => base.calls.filter(x => x.fn === fn);
    const callWall = () => c().series.find(s => s.opts.title === 'Call wall');
    const n = { bars: calls('bars').length, charts: calls('charts').length };
    // off, then on again: no request
    await chart.setLayers([]);
    assert.deepEqual(callWall().data, []);
    await chart.setLayers(['levels', 'maxpain']);
    assert.ok(callWall().data.length > 0);
    assert.deepEqual([calls('bars').length, calls('charts').length], [n.bars, n.charts], 'no request');
    // a new window asks only the layers on: spot rows (exposure)
    await chart.setLayers([]);
    await chart.reload();
    assert.deepEqual(calls('charts').at(-1).q.layers, ['exposure']);
    // levels on again: only levels_daily is missing; asked alone, no bars, the view stays; "Loading…" while it waits
    // a view that ends at the latest bar (the fake time scale has no getVisibleRange for other views)
    c().timeScale().logical = { from: 40, to: c().series[0].data.length - 1 };
    const view = c().timeScale().getVisibleLogicalRange(), fits = c().timeScale().fits;
    const before = { bars: calls('bars').length, charts: calls('charts').length };
    release = false;
    const p = chart.setLayers(['levels']);
    assert.ok(el.querySelector('.fac-busy').classList.contains('on'));
    release();
    await p;
    assert.equal(el.querySelector('.fac-busy').classList.contains('on'), false);
    assert.equal(calls('bars').length, before.bars, 'no bars request');
    assert.equal(calls('charts').length, before.charts + 1);
    assert.deepEqual(calls('charts').at(-1).q.layers, ['levels_daily']);
    assert.ok(callWall().data.length > 0);
    assert.deepEqual(c().timeScale().getVisibleLogicalRange(), view, 'the view stays');
    assert.equal(c().timeScale().fits, fits, 'no fit');
    chart.destroy();
  });

  it('locks layers above the key plan; the Upgrade box over the chart only with upsell: true', async () => {
    const el = host();
    const { chart } = open(el, { source: fakeSource({ plan: 'free' }), layers: ['levels'] });
    await tick();
    assert.equal(chart.plan, 'free');
    const lock = el.querySelector('.fac-ind-list a.fac-lock');
    assert.match(lock.textContent, /🔒 Walls & gamma flip\s+Basic/);
    assert.match(new URL(lock.href).search, /utm_source=chart/);
    assert.equal(el.querySelector('.fac-upsell').hidden, true, 'hidden by default');
    chart.destroy();

    const el2 = host();
    const c2 = open(el2, { source: fakeSource({ plan: 'free' }), layers: ['levels'], upsell: true }).chart;
    await tick();
    const box = el2.querySelector('.fac-upsell');
    assert.equal(box.hidden, false);
    assert.match(box.textContent, /Basic.*Upgrade/);
    c2.destroy();
  });

  it('without a key the box over the chart says "Sign up free" and links to signupUrl', async () => {
    const d = sessionData();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('/v1/charts/') ? { plan: 'free', layers: { exposure: { status: 'gated' } } }
      : String(url).includes('/v1/bars/') ? { bars: d.bars } : [{ symbol: 'SPX', last_bar: '2026-11-13T20:45:00Z' }]),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
    try {
      const el = host();
      const chart = mount(el, { symbol: 'SPX', refresh: 0, lightweightCharts: fakeLW(), storage: false, baseUrl: 'https://charts.test',
        layers: ['levels'], upsell: true, signupUrl: 'https://flashalpha.test/join' });
      await tick(50);
      const box = el.querySelector('.fac-upsell');
      assert.equal(box.hidden, false);
      const a = box.querySelector('a');
      assert.equal(a.textContent, 'Sign up free');
      assert.match(a.href, /^https:\/\/flashalpha\.test\/join\?.*utm_content=upsell/, 'another site: tagged');
      chart.destroy();
    } finally { globalThis.fetch = realFetch; }
  });

  it('sends flashalpha:change on the container after the symbol, interval, range, session or layers changed', async () => {
    const el = host(), seen = [];
    el.addEventListener('flashalpha:change', e => seen.push(e.detail));
    const { chart } = open(el, { layers: [] });
    await tick();
    assert.equal(seen.length, 0, 'not for the first load');
    await chart.setResolution('15m');
    await chart.setLayers(['levels']);
    await chart.setSymbol('SPY');
    await chart.setSession('eth');
    await chart.setRange(2);
    assert.deepEqual(seen.map(x => [x.symbol, x.resolution, x.session, x.layers.join(','), x.range]), [
      ['SPX', '15m', 'rth', '', 5], ['SPX', '15m', 'rth', 'levels', 5], ['SPY', '15m', 'rth', 'levels', 5],
      ['SPY', '15m', 'eth', 'levels', 5], ['SPY', '15m', 'eth', 'levels', 2]]);
    chart.destroy();
  });

  describe('levels freshness', () => {
    // 2026-11-13 (EST): 5m bars from the 9:30 open to `barsTo`, exposure rows to `rowsTo`, the last one computed at `asOf`.
    function liveSource({ barsTo, rowsTo, asOf }) {
      const bars = [], exposure = [];
      for (let t = Date.parse('2026-11-13T14:30:00Z'), i = 0; t <= Date.parse(barsTo); t += 300e3, i++) {
        const ts = new Date(t).toISOString();
        bars.push({ ts, open: 5000 + i, high: 5001 + i, low: 4999 + i, close: 5000.5 + i, volume: 100 });
        if (t <= Date.parse(rowsTo)) exposure.push({ ts, call_wall: 5050, put_wall: 4950, max_pain: 5000,
          gamma_flip: { last: 4990, status: 'available' }, spot: { first: 5000 + i, min: 4999 + i, max: 5001 + i, last: 5000.5 + i } });
      }
      if (asOf) exposure[exposure.length - 1].as_of = asOf;
      return { symbols: () => [{ symbol: 'SPY', last_bar: barsTo }], bars: () => ({ bars }),
        charts: (s, res, from, to, q) => ({ layers: {}, exposure: q.layers.includes('exposure') ? exposure : undefined }) };
    }
    // 12:02 ET: the 11:55 bar closed 2 minutes ago, the session is trading.
    async function legendAt(cfg) {
      mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-13T17:02:00Z') });
      try {
        const el = host();
        const { chart } = open(el, { symbol: 'SPY', resolution: '5m', source: liveSource(cfg), layers: ['levels'] });
        await tick();
        const text = el.querySelector('.fac-legend').textContent;
        chart.destroy();
        return text;
      } finally { mock.timers.reset(); }
    }

    it('says when the newest levels were computed', async () => {
      const text = await legendAt({ barsTo: '2026-11-13T16:55:00Z', rowsTo: '2026-11-13T16:55:00Z', asOf: '2026-11-13T16:59:50Z' });
      assert.match(text, /Gamma flip 4,990\.00 \([^)]*\)As of 11:59 ET/);
      assert.doesNotMatch(text, /delayed|⚠/);
    });

    it('marks levels computed more than 10 minutes before the newest bar as delayed, first on the line', async () => {
      const text = await legendAt({ barsTo: '2026-11-13T16:55:00Z', rowsTo: '2026-11-13T16:55:00Z', asOf: '2026-11-13T16:40:00Z' });
      assert.match(text, /GEX LevelsSpot [\d,.]+( \([^)]*\))?As of 11:40 ET \(delayed 15 min\)Call wall/);
    });

    it('says so on its own line when the levels stopped before the newest bar', async () => {
      const text = await legendAt({ barsTo: '2026-11-13T16:55:00Z', rowsTo: '2026-11-13T16:30:00Z' });
      assert.match(text, /⚠ GEX levels delayed 25 min: last update 11:30 ET/);
    });
  });

  it('without a key every paid layer is locked, like the free plan', async () => {
    // the FlashAlpha chart API with no key (it answers 401 api_key_required with no plan): every paid layer locked
    const realFetch = globalThis.fetch, asked = [];
    globalThis.fetch = async (url, init) => {
      asked.push({ url: String(url), key: init && init.headers && init.headers['X-Api-Key'] });
      return new Response(JSON.stringify({ error: 'api_key_required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const el = host();
      const chart = mount(el, { symbol: 'SPX', refresh: 0, lightweightCharts: fakeLW(), storage: false, baseUrl: 'https://charts.test' });
      await tick(50);
      assert.ok(asked.length && asked.every(x => !x.key), 'the chart API, no key sent');
      assert.deepEqual([...el.querySelectorAll('.fac-ind-list a.fac-lock')].map(a => a.textContent.trim()),
        ['🔒 Walls & gamma flip Basic', '🔒 Max pain Basic']);
      assert.equal(el.querySelector('.fac-ind-list input[data-layer]'), null, 'nothing to tick');
      assert.equal(chart.plan, null, 'no plan: the account button still says Sign up');
      chart.destroy();
    } finally { globalThis.fetch = realFetch; }

    // a source that answers like the chart API without a key (401 api_key_required): locked after that answer
    const el2 = host();
    const keyless = Object.assign(fakeSource(), { bars: () => ({ error: 'api_key_required' }) });
    const c2 = open(el2, { source: keyless, layers: ['levels'] }).chart;
    await tick();
    assert.deepEqual([...el2.querySelectorAll('.fac-ind-list a.fac-lock')].map(a => a.textContent.trim()),
      ['🔒 Walls & gamma flip Basic', '🔒 Max pain Basic']);
    c2.destroy();

    // your own data source with no plan and no key error: nothing is locked
    const el3 = host();
    const c3 = open(el3, { layers: ['levels'] }).chart;
    await tick();
    assert.equal(el3.querySelector('.fac-ind-list a.fac-lock'), null);
    c3.destroy();
  });

  it('covers the chart and fires flashalpha:nodata on an API error', async () => {
    const el = host();
    const seen = [];
    el.addEventListener('flashalpha:nodata', e => seen.push(e.detail));
    const { chart } = open(el, { source: fakeSource({ barsError: 'invalid_api_key' }) });
    await tick();
    assert.equal(el.querySelector('.fac-empty').textContent, 'This FlashAlpha key is not valid.');
    assert.deepEqual(seen, [{ symbol: 'SPX', error: 'invalid_api_key' }]);
    assert.equal(el.querySelector('.fac-gate'), null, 'a bad key gets the line of text, not the sign-up box');
    chart.destroy();
  });

  it('shows the sign-up box to a signed-out reader (api_key_required)', async () => {
    const el = host();
    const seen = [];
    el.addEventListener('flashalpha:nodata', e => seen.push(e.detail));
    const { chart } = open(el, { source: fakeSource({ barsError: 'api_key_required' }) });
    await tick();
    const gate = el.querySelector('.fac-empty.fac-gate');
    assert.ok(gate, 'the cover is the sign-up box');
    assert.equal(gate.style.display, 'flex');
    assert.ok(gate.querySelector('svg.fac-gate-bg[aria-hidden="true"]'), 'the blurred picture behind it');
    assert.equal(gate.querySelector('.fac-gate-ttl').textContent, 'Sign up free to see the SPX chart');
    assert.match(gate.querySelector('.fac-gate-txt').textContent, /free FlashAlpha account loads price and volume/);
    const cta = gate.querySelector('a.fac-gate-cta');
    assert.equal(cta.textContent, 'Sign up free');
    assert.equal(cta.target, '_blank');
    const u = new URL(cta.href);
    assert.equal(u.origin + u.pathname, 'https://flashalpha.com/pricing');
    assert.equal(u.searchParams.get('utm_campaign'), 'signup');
    assert.equal(u.searchParams.get('utm_content'), 'gate');
    assert.equal(gate.querySelectorAll('a, button').length, 1, 'one call to action, no preview button');
    assert.deepEqual(seen, [{ symbol: 'SPX', error: 'api_key_required' }]);
    chart.destroy();

    const el2 = host();
    const c2 = open(el2, { source: fakeSource({ barsError: 'api_key_required' }), signupUrl: 'https://example.com/join' }).chart;
    await tick();
    const u2 = new URL(el2.querySelector('.fac-gate-cta').href);
    assert.equal(u2.origin + u2.pathname, 'https://example.com/join', 'options.signupUrl');
    c2.destroy();
  });

  it('without a symbol, a signed-out reader gets the sign-up box, not an empty chart', async () => {
    // chart.html mounts with no symbol: the first one comes from /v1/symbols, which answers 401 without a key
    const el = host();
    const keyless = Object.assign(fakeSource(), { symbols: () => ({ error: 'api_key_required' }) });
    const { chart, source } = open(el, { symbol: null, source: keyless });
    await tick();
    const gate = el.querySelector('.fac-empty.fac-gate');
    assert.ok(gate, 'the sign-up box covers the chart');
    assert.equal(gate.style.display, 'flex');
    assert.equal(gate.querySelector('.fac-gate-ttl').textContent, 'Sign up free to see this chart');
    assert.equal(source.calls.length, 0, 'nothing to load');
    chart.destroy();

    const el2 = host();
    const c2 = open(el2, { symbol: null, source: Object.assign(fakeSource(), { symbols: () => [] }) }).chart;
    await tick();
    assert.equal(el2.querySelector('.fac-empty').textContent, 'Chart data is unavailable right now.');
    c2.destroy();
  });

  it('draws one-sample-a-minute bars (an index on 1m) as a line of closes, real OHLC bars as candles', async () => {
    const el = host();
    const flat = fakeSource();
    const real = flat.bars;
    flat.bars = (...a) => ({ bars: real(...a).bars.map(b => Object.assign({}, b, { high: b.close, low: b.close, open: b.close, volume: null, source: 'quotes' })) });
    const { c, chart } = open(el, { source: flat });
    await tick();
    const line = c().series.find(s => s.type === 'Line' && s.opts.color === '#4f8cff');
    assert.ok(line, 'the close line exists');
    assert.equal(line.applied.at(-1).visible, true);
    assert.equal(line.data.length, c().series[0].data.length);
    assert.equal(line.data.at(-1).value, c().series[0].data.at(-1).close);
    assert.equal(c().series[0].data.at(-1).color, 'transparent', 'the candles stay for the scale and the levels, unseen');
    assert.deepEqual(c().series[0].applied.at(-1), { lastValueVisible: false, priceLineVisible: false });
    chart.destroy();

    const el2 = host();
    const r = open(el2);
    await tick();
    const line2 = r.c().series.find(s => s.type === 'Line' && s.opts.color === '#4f8cff');
    assert.equal(line2.applied.at(-1).visible, false);
    assert.deepEqual(line2.data, []);
    assert.notEqual(r.c().series[0].data.at(-1).color, 'transparent');
    r.chart.destroy();
  });

  it('says it is loading until the first window is drawn', async () => {
    const el = host();
    const fast = fakeSource();
    let answer;
    const slow = Object.assign(fakeSource(), { bars: (...a) => new Promise(r => { answer = () => r(fast.bars(...a)); }) });
    const { chart } = open(el, { source: slow });
    await tick();
    const box = el.querySelector('.fac-empty');
    assert.equal(box.textContent, 'Loading SPX…');
    assert.equal(box.style.display, 'flex');
    assert.ok(box.classList.contains('fac-loading'));
    answer();
    await tick();
    assert.equal(box.style.display, 'none');
    assert.ok(!box.classList.contains('fac-loading'));
    chart.destroy();
  });

  it('goes compact below 560 px and shortens level titles below 480 px', async () => {
    const el = host();
    const { c, chart } = open(el);
    await tick();
    const root = el.querySelector('.fac');
    Object.defineProperty(root, 'clientWidth', { value: 400, configurable: true });
    observers.at(-1).fn([]);
    assert.ok(root.classList.contains('fac-narrow'));
    assert.ok(el.querySelector('.fac-timebar [data-g="session"]'), 'the session stays in the time bar');
    // the short titles (the markers' tags): the label still names its level, in less room
    assert.deepEqual([6, 7, 8, 9].map(i => c().series[i].applied.at(-1)), [{ title: 'Flip' }, { title: 'CW' }, { title: 'PW' }, { title: 'MP' }]);
    chart.destroy();
  });

  it('uses the page-wide license key', () => {
    setLicenseKey('page_key');
    const seen = [];
    const old = globalThis.fetch;
    globalThis.fetch = async (url, init) => { seen.push(init.headers); return { status: 200, json: async () => [] }; };
    try {
      const chart = mount(host(), { lightweightCharts: fakeLW(), refresh: 0 });
      assert.equal(seen[0]['X-Api-Key'], 'page_key');
      chart.destroy();
    } finally { globalThis.fetch = old; setLicenseKey(null); }
  });
});

describe('indicators', () => {
  const ind = el => el.querySelector('.fac-ind');
  const series = (c, title) => c().series.find(s => s.opts.title === title);

  it('the Indicators menu lists each indicator (no plan on its name); a layer open to the key\'s plan has no plan label', async () => {
    const el = host();
    const { chart } = open(el, { source: fakeSource({ plan: 'basic' }) });
    await tick();
    assert.match(el.querySelector('.fac-ind-menu > button').textContent, /ƒx Indicators/);
    assert.equal(ind(el).querySelector('b').textContent, 'GEX Levels');
    assert.equal(ind(el).querySelector('.fac-ind-head .fac-badge'), null, 'the indicator\'s name carries no plan');
    assert.deepEqual([...ind(el).querySelectorAll('.fac-ind-layers label')].map(l => l.textContent.trim()),
      ['Walls & gamma flip', 'Max pain'], 'open to Basic: no plan label');
    assert.equal(ind(el).querySelector('.fac-lock'), null, 'the basic plan has them');
    chart.destroy();

    const el2 = host();
    const c2 = open(el2, { source: fakeSource({ plan: 'free' }) }).chart;
    await tick();
    const locks = [...ind(el2).querySelectorAll('a.fac-lock')];
    assert.deepEqual(locks.map(a => a.textContent.trim()), ['🔒 Walls & gamma flip Basic', '🔒 Max pain Basic']);
    assert.match(locks[1].href, /utm_content=maxpain/);
    // the switch of an indicator whose every layer is locked opens the pricing page and stays off
    const opened = [], realOpen = window.open;
    window.open = (...a) => { opened.push(a); return null; };
    try {
      const sw = ind(el2).querySelector('[data-group]');
      sw.checked = true;
      sw.dispatchEvent(new window.Event('change'));
      assert.equal(sw.checked, false);
      assert.deepEqual(c2.layers, []);
      assert.equal(opened.length, 1);
      assert.match(opened[0][0], /^https:\/\/flashalpha\.com\/pricing\?.*utm_content=levels/);
      assert.equal(opened[0][1], '_blank');
    } finally { window.open = realOpen; }
    c2.destroy();
  });

  it('links to the page\'s own site carry no utm tags; Sign up and Upgrade tell the page (flashalpha:upgrade)', async () => {
    const el = host();
    const { chart } = open(el, { source: fakeSource({ plan: 'free' }), upgradeUrl: '/pricing?returnUrl=%2Fstock%2Fspy', signupUrl: '/pricing' });
    await tick();
    const heard = [];
    el.addEventListener('flashalpha:upgrade', e => heard.push(e.detail));
    const lock = ind(el).querySelector('a.fac-lock');
    assert.equal(lock.href, 'https://example.com/pricing?returnUrl=%2Fstock%2Fspy', 'same site: no utm');
    lock.addEventListener('click', e => e.preventDefault());
    lock.click();
    assert.deepEqual(heard[0], { campaign: 'upgrade', content: 'levels', href: lock.href, symbol: chart.symbol });
    const account = el.querySelector('.fac-account');
    account.addEventListener('click', e => e.preventDefault());
    account.click();
    assert.equal(heard[1].campaign, 'upgrade');
    assert.equal(heard[1].content, 'account');
    // a prompt that is not a link (the switch of an indicator whose every layer is locked) is heard too
    const opened = [], realOpen = window.open;
    window.open = (...a) => { opened.push(a); return null; };
    try {
      const sw = ind(el).querySelector('[data-group]');
      sw.checked = true;
      sw.dispatchEvent(new window.Event('change'));
      assert.equal(opened[0][0], 'https://example.com/pricing?returnUrl=%2Fstock%2Fspy');
      assert.deepEqual(heard[2], { campaign: 'upgrade', content: 'levels', href: opened[0][0], symbol: chart.symbol });
    } finally { window.open = realOpen; }
    chart.destroy();
  });

  it('switches a whole indicator off and back on', async () => {
    const el = host();
    const { chart } = open(el, { layers: ['levels', 'maxpain'] });
    await tick();
    const toggle = ind(el).querySelector('[data-group]');
    assert.equal(toggle.checked, true);
    toggle.checked = false; toggle.dispatchEvent(new window.Event('change'));
    await tick();
    assert.deepEqual(chart.layers, []);
    assert.equal(el.querySelector('.fac-legend .lv'), null, 'off: no line in the legend');
    ind(el).querySelector('[data-group]').checked = true;
    ind(el).querySelector('[data-group]').dispatchEvent(new window.Event('change'));
    await tick();
    assert.deepEqual(chart.layers.sort(), ['levels', 'maxpain'], 'all its layers on');
    chart.destroy();
  });

  it('an indicator\'s switch: all its layers on or all off; half-ticked while only some are on', async () => {
    const el = host();
    const { chart } = open(el, { layers: ['levels'] });
    await tick();
    const sw = () => ind(el).querySelector('[data-group]');
    assert.equal(sw().checked, false);
    assert.equal(sw().indeterminate, true, 'one of two layers on');
    // a click on a half-ticked switch ticks it: every layer on
    sw().indeterminate = false; sw().checked = true; sw().dispatchEvent(new window.Event('change'));
    await tick();
    assert.deepEqual(chart.layers.sort(), ['levels', 'maxpain']);
    assert.equal(sw().checked, true);
    assert.equal(sw().indeterminate, false);
    // ticked: a click turns every layer off
    sw().checked = false; sw().dispatchEvent(new window.Event('change'));
    await tick();
    assert.deepEqual(chart.layers, []);
    assert.equal(sw().checked, false);
    assert.equal(sw().indeterminate, false);
    chart.destroy();
  });

  it('Layer options: no Settings on the indicator, one options button per layer, each with its own plots', async () => {
    const el = host();
    const { chart } = open(el, { layers: ['levels', 'maxpain'] });
    await tick();
    assert.equal(ind(el).querySelector('.fac-ind-head [data-settings]'), null, 'the indicator has no Settings');
    assert.deepEqual([...ind(el).querySelectorAll('.fac-ind-row [data-settings]')].map(b => [b.dataset.settings, b.getAttribute('aria-label')]),
      [['levels', 'Walls & gamma flip options'], ['maxpain', 'Max pain options']]);
    ind(el).querySelector('[data-settings="maxpain"]').click();
    const dlg = el.querySelector('.fac-dialog');
    assert.equal(dlg.querySelector('.fac-dlg-head b').textContent, 'Max pain');
    assert.equal(dlg.querySelector('.fac-dlg-head .fac-dlg-sub').textContent, 'GEX Levels');
    assert.equal(dlg.querySelector('[data-tab="style"]').className, 'on', 'opens on Style: the layer has plots');
    assert.deepEqual([...dlg.querySelectorAll('.fac-sty-name')].map(x => x.textContent.trim()), ['Max pain']);
    // Inputs: this layer's switch only; turning it off leaves the other layer on
    dlg.querySelector('[data-tab="inputs"]').click();
    assert.deepEqual([...dlg.querySelectorAll('.fac-dlg-layers label')].map(l => l.textContent.trim()), ['Max pain']);
    const sw = dlg.querySelector('.fac-dlg-layers input[data-layer]');
    sw.checked = false; sw.dispatchEvent(new window.Event('change'));
    await tick();
    assert.deepEqual(chart.layers, ['levels']);
    dlg.querySelector('[data-ok]').click();
    // the legend's options button opens the options of the indicator's first layer that is on
    el.querySelector('.fac-legend .lv [data-act="settings"]').click();
    assert.equal(dlg.querySelector('.fac-dlg-head b').textContent, 'Walls & gamma flip');
    dlg.querySelector('[data-ok]').click();
    // a layer above the key's plan is a 🔒 link with no options button
    chart.destroy();
    const el2 = host();
    const c2 = open(el2, { source: fakeSource({ plan: 'free' }), layers: ['levels'] }).chart;
    await tick();
    assert.equal(el2.querySelector('.fac-ind [data-settings]'), null);
    c2.destroy();
  });

  it('Layer options: Style sets colour, width, line style and visibility; Cancel puts them back; Defaults resets', async () => {
    const el = host();
    const { c, chart } = open(el, { layers: ['levels', 'maxpain'] });
    await tick();
    ind(el).querySelector('[data-settings="levels"]').click();
    const dlg = el.querySelector('.fac-dialog');
    assert.equal(dlg.hidden, false);
    assert.deepEqual([...dlg.querySelectorAll('[data-tab]')].map(b => b.textContent), ['Inputs', 'Style']);
    assert.deepEqual([...dlg.querySelectorAll('.fac-sty-name')].map(x => x.textContent.trim()),
      ['Call wall', 'Put wall', 'Gamma flip', 'Gamma flip (unverified)', 'Call wall broken', 'Put wall broken'],
      'the walls and the flip, not max pain');
    // the break options: a switch (off) and a colour, no width or line style
    assert.equal(dlg.querySelector('[data-p="callWallBroken"][data-k="visible"]').checked, false);
    assert.equal(dlg.querySelector('[data-p="putWallBroken"][data-k="visible"]').checked, false);
    assert.ok(dlg.querySelector('[data-p="putWallBroken"][data-k="color"]'));
    assert.equal(dlg.querySelector('[data-p="putWallBroken"][data-k="lineWidth"]'), null);
    const set = (k, v) => {
      const x = dlg.querySelector(`[data-p="callWall"][data-k="${k}"]`);
      if (k === 'visible') x.checked = v; else x.value = v;
      x.dispatchEvent(new window.Event('change'));
    };
    set('color', '#00ff00'); set('lineWidth', '3'); set('lineStyle', 'dashed');
    assert.deepEqual(series(c, 'Call wall').applied.at(-1), { color: '#00ff00', lineWidth: 3, lineStyle: 2, visible: true,
      priceLineVisible: true, priceLineColor: '#00ff00', lastValueVisible: true });
    assert.match(el.querySelector('.fac-legend .lv').innerHTML, /style="color:#00ff00">5,050\.00/, 'the legend value in the plot colour');
    const flipColor = dlg.querySelector('[data-p="flipUnverified"][data-k="color"]');
    flipColor.value = '#123456'; flipColor.dispatchEvent(new window.Event('input'));
    assert.equal(series(c, 'Gamma flip').data[0].color, '#123456', 'the unverified flip points are redrawn');
    set('visible', false);
    assert.doesNotMatch(el.querySelector('.fac-legend .lv').textContent, /Call wall/, 'a hidden plot leaves the legend');
    const axis = dlg.querySelector('[data-all="axisLabel"]');
    axis.checked = false; axis.dispatchEvent(new window.Event('change'));
    assert.equal(series(c, 'Put wall').applied.at(-1).lastValueVisible, false);
    assert.equal(chart.styles.maxPain.axisLabel, true, 'another layer\'s plot keeps its label');
    dlg.querySelector('[data-cancel]').click();
    assert.equal(dlg.hidden, true);
    assert.deepEqual(chart.styles.callWall, { lineWidth: 2, lineStyle: 'solid', visible: true, priceLine: true, axisLabel: true, color: '#059669' });
    assert.equal(series(c, 'Put wall').applied.at(-1).lastValueVisible, true, 'Cancel puts it back');

    ind(el).querySelector('[data-settings="levels"]').click();
    set('color', '#abcdef');
    dlg.querySelector('[data-ok]').click();
    assert.equal(chart.styles.callWall.color, '#abcdef', 'Ok keeps it');
    chart.setStyle('maxPain', { color: '#111111' });
    ind(el).querySelector('[data-settings="levels"]').click();
    dlg.querySelector('[data-defaults]').click();
    assert.equal(chart.styles.maxPain.color, '#111111', 'Defaults resets this layer\'s plots only');
    assert.equal(chart.styles.callWall.color, '#059669', 'Defaults');
    dlg.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(dlg.hidden, true, 'Escape closes it');
    chart.destroy();
  });

  it('Values in status line hides or shows the values of the layer being set only', async () => {
    const el = host();
    const { chart } = open(el, { layers: ['levels', 'maxpain'] });
    await tick();
    const dlg = el.querySelector('.fac-dialog'), line = () => el.querySelector('.fac-legend .lv');
    const status = on => {
      const x = dlg.querySelector('[data-status]');
      x.checked = on; x.dispatchEvent(new window.Event('change'));
    };
    ind(el).querySelector('[data-settings="maxpain"]').click();
    assert.equal(dlg.querySelector('[data-status]').checked, true);
    status(false);
    assert.doesNotMatch(line().textContent, /Max pain/, 'max pain leaves the legend');
    assert.match(line().textContent, /Call wall.*Put wall.*Gamma flip/, 'the walls and the flip stay');
    dlg.querySelector('[data-ok]').click();
    ind(el).querySelector('[data-settings="levels"]').click();
    assert.equal(dlg.querySelector('[data-status]').checked, true, 'the other layer keeps its own setting');
    status(false);
    assert.equal(line().textContent, 'GEX Levels', 'no layer shows values: the title only (its buttons stay)');
    dlg.querySelector('[data-cancel]').click();
    assert.match(line().textContent, /Call wall/, 'Cancel puts it back');
    assert.doesNotMatch(line().textContent, /Max pain/);
    ind(el).querySelector('[data-settings="maxpain"]').click();
    assert.equal(dlg.querySelector('[data-status]').checked, false);
    dlg.querySelector('[data-defaults]').click();
    assert.match(line().textContent, /Max pain/, 'Defaults shows it again');
    chart.destroy();
  });

  it('the legend has an options button per indicator; options.styles and setStyle set plot styles', async () => {
    const el = host();
    const { c, chart } = open(el, { layers: ['levels'], styles: { callWall: { color: '#00ff00', lineWidth: 2 } } });
    await tick();
    assert.equal(series(c, 'Call wall').applied.findLast(a => 'color' in a).color, '#00ff00');
    assert.equal(chart.styles.callWall.lineWidth, 2);
    chart.setStyle('putWall', { visible: false });
    assert.doesNotMatch(el.querySelector('.fac-legend .lv').textContent, /Put wall/);
    const btn = el.querySelector('.fac-legend .lv [data-act="settings"]');
    assert.match(el.querySelector('.fac-legend .lv .fac-lg-name').textContent, /GEX Levels/);
    btn.click();
    assert.equal(el.querySelector('.fac-dialog').hidden, false);
    chart.destroy();
    const bare = host();
    const c2 = open(bare, { controls: false }).chart;
    await tick();
    assert.equal(bare.querySelector('.fac-lg-btn, .fac-dialog'), null, 'no toolbar: no Settings');
    c2.destroy();
  });

  it('each indicator\'s title has hide / show, options and remove, like TradingView', async () => {
    const el = host();
    const { c, source, chart } = open(el, { layers: ['levels', 'maxpain'] });
    await tick();
    const line = () => el.querySelector('.fac-legend .lv');
    const callWall = () => c().series.find(s => s.opts.title === 'Call wall');
    const charts = () => source.calls.filter(x => x.fn === 'charts').length;
    assert.deepEqual([...line().querySelectorAll('.fac-lg-btn')].map(b => b.dataset.act), ['eye', 'settings', 'remove']);
    assert.equal(line().querySelector('[data-act="eye"]').title, 'Hide');
    // 👁, at once (no request): the drawings go, the layers stay on (still loaded) and the title stays (dimmed, no values)
    const before = charts();
    line().querySelector('[data-act="eye"]').click();
    assert.deepEqual(callWall().data, [], 'not drawn');
    assert.deepEqual(chart.layers, ['levels', 'maxpain'], 'still on');
    assert.ok(line().classList.contains('fac-lg-off'));
    assert.equal(line().textContent, 'GEX Levels');
    assert.equal(line().querySelector('[data-act="eye"]').title, 'Show');
    assert.equal(el.querySelector('.fac-ind [data-layer="levels"]').checked, true, 'checked in the menu');
    await chart.reload();
    assert.ok(source.calls.filter(x => x.fn === 'charts').at(-1).q.layers.includes('exposure'), 'its data keeps coming');
    assert.deepEqual(callWall().data, [], 'and is not drawn');
    // 👁 again, at once: drawn from what is loaded
    line().querySelector('[data-act="eye"]').click();
    assert.ok(callWall().data.length > 0);
    assert.match(line().textContent, /Call wall.*Max pain/);
    assert.equal(charts(), before + 1, 'no request for hide / show (the one above is the reload)');
    // 🗑, at once: drawings and line gone before the reload answers
    line().querySelector('[data-act="remove"]').click();
    assert.deepEqual(chart.layers, []);
    assert.deepEqual(callWall().data, []);
    assert.equal(line(), null);
    chart.destroy();
  });

});

describe('layer plugins', () => {
  it('get the chart context, add controls, legend lines and methods', async () => {
    const seen = {};
    registerLayers({
      layers: [['test', 'Test layer']],
      plans: { test: 'growth' },
      apiLayers: ctx => ctx.on('test') ? ['strikes'] : [],
      attach(ctx) {
        seen.ctx = ctx;
        const sel = document.createElement('select');
        sel.title = 'Lens';
        ctx.addControl(sel);
        return {
          ready() { seen.ready = ctx.candles !== null; },
          draw(r) { seen.drawn = r; seen.exposure = ctx.exposure.length; },
          legend: t => ['test line'],
          legendLevels(row, parts) { parts.push('extra'); },
          methods: { ping: () => 'pong', reload: () => 'shadowed' },
        };
      },
    });
    assert.deepEqual(FlashAlphaChart.layers, ['levels', 'maxpain', 'test']);
    const el = host();
    const { source, chart } = open(el, { layers: ['levels', 'test'] });
    await tick();
    assert.equal(seen.ready, true);
    assert.equal(seen.exposure, 78);
    assert.deepEqual(source.calls.find(x => x.fn === 'charts').q.layers, ['exposure', 'levels_daily', 'strikes']);
    // its own indicator (no `indicator` name): the option goes into the options of that indicator's layers (Inputs first:
    // the layer has no plot)
    assert.deepEqual([...el.querySelectorAll('.fac-ind b')].map(b => b.textContent), ['GEX Levels', 'Test layer']);
    el.querySelector('.fac-ind [data-settings="test"]').click();
    assert.equal(el.querySelector('.fac-dialog .fac-dlg-head b').textContent, 'Test layer');
    assert.equal(el.querySelector('.fac-dialog [data-tab="inputs"]').className, 'on');
    assert.equal(el.querySelector('.fac-dialog .fac-field span').textContent, 'Lens');
    assert.equal(el.querySelector('.fac-dialog .fac-dlg-hint'), null, 'one layer: no "every layer" hint');
    el.querySelector('.fac-dialog [data-ok]').click();
    assert.match(el.querySelector('.fac-legend').textContent, /Gamma flip 4,990\.00 \(−1\.7%\)As of \d{1,2}:\d\d ETTest layerextra/, 'a line per indicator');
    assert.match(el.querySelector('.fac-legend').textContent, /test line/);
    assert.equal(chart.ping(), 'pong');
    assert.ok(chart.reload() instanceof Promise, 'a plugin method never replaces a core one');
    chart.destroy();
  });

  it('apiLayers gets the context attach got: state a plugin keeps by context decides the API layers', async () => {
    const state = new WeakMap();
    registerLayers({
      layers: [['pick', 'Picker']],
      // what the reader picked (kept by the attach context) decides the API layers
      apiLayers: ctx => state.get(ctx) && state.get(ctx).metric ? ['metrics'] : [],
      attach(ctx) {
        const st = { metric: null };
        state.set(ctx, st);
        ctx.addControl(document.createElement('select'));
        return { methods: { pick: name => { st.metric = name; return ctx.setQuery({ metrics: name }); } } };
      },
    });
    const el = host();
    const { source, chart } = open(el, { layers: ['pick'] });
    await tick();
    assert.ok(!source.calls.filter(x => x.fn === 'charts').at(-1).q.layers.includes('metrics'));
    await chart.pick('summary_gamma_flip');
    await tick();
    const q = source.calls.filter(x => x.fn === 'charts').at(-1).q;
    assert.ok(q.layers.includes('metrics'), 'the pick asks for the metrics layer');
    assert.equal(q.metrics, 'summary_gamma_flip');
    chart.destroy();
  });

  it('join an indicator by name, with their plots in its Style tab and the plan label after their layer', async () => {
    registerLayers({
      indicator: 'GEX Levels',
      layers: [['vwap2', 'VWAP']],
      plans: { vwap2: 'alpha' },
      plots: [{ id: 'vwap2', title: 'VWAP', layer: 'vwap2', color: '#4fc3f7' }],
      attach(ctx) {
        return {
          ready() { ctx.bindPlot('vwap2', ctx.chart.addSeries(ctx.LW.LineSeries, { title: 'vwap2' })); },
          legendLevels(row, parts) { if (ctx.on('vwap2')) parts.push({ label: 'VWAP', value: 4321, plot: 'vwap2' }); },
        };
      },
    });
    const el = host();
    const { c, chart } = open(el, { source: fakeSource({ plan: 'growth' }), layers: ['levels', 'vwap2'] });
    await tick();
    const core = el.querySelector('.fac-ind');
    assert.equal(core.querySelector('b').textContent, 'GEX Levels');
    assert.deepEqual([...core.querySelectorAll('.fac-ind-layers > *')].map(x => x.textContent.trim()),
      ['Walls & gamma flip', 'Max pain', '🔒 VWAP Alpha'], 'the Alpha layer is locked on Growth, with its label; the open ones carry none');
    assert.equal(c().series.find(s => s.opts.title === 'vwap2').applied[0].color, '#4fc3f7', 'bindPlot applies the plot style');
    assert.equal(core.querySelector('[data-settings="vwap2"]'), null, 'a locked layer has no options');
    chart.destroy();
    const el3 = host();
    const c3 = open(el3, { source: fakeSource({ plan: 'alpha' }), layers: ['levels', 'vwap2'] });
    await tick();
    el3.querySelector('.fac-ind [data-settings="vwap2"]').click();
    assert.deepEqual([...el3.querySelectorAll('.fac-dialog .fac-sty-name')].map(x => x.textContent.trim()), ['VWAP'], 'its layer\'s plot only');
    c3.chart.destroy();

    const el2 = host();
    const c2 = open(el2, { source: fakeSource({ plan: 'alpha' }), layers: ['levels', 'vwap2'] }).chart;
    await tick();
    assert.match(el2.querySelector('.fac-legend .lv').textContent, /Gamma flip 4,990\.00 \(−1\.7%\)As of \d{1,2}:\d\d ETVWAP 4,321\.00/, 'in the indicator\'s legend line');
    c2.destroy();
  });

  it('fill several indicators with `indicators`: menu order, plan per layer, controls and legend per indicator', async () => {
    const seen = [];
    registerLayers({
      indicator: 'GEX Levels',
      indicators: { pa: 'Pane A', pb1: 'By strike', pb2: 'By strike' },
      layers: [['pm', 'Magnet'], ['pa', 'Pane A layer'], ['pb1', 'Heat'], ['pb2', 'Profile']],
      plans: { pm: 'basic', pa: 'basic', pb1: 'growth', pb2: 'alpha' },
      attach(ctx) {
        const lens = document.createElement('select'); lens.title = 'Lens';
        const scope = document.createElement('select'); scope.title = 'Scope';
        ctx.addControl(lens, 'panel', 'By strike');
        ctx.addControl(scope);
        return { legendLevels(row, parts, prev, indicator) { seen.push(indicator); if (indicator === 'By strike') parts.push('strike part'); } };
      },
    });
    const el = host();
    const { chart } = open(el, { source: fakeSource({ plan: 'growth' }), layers: ['levels', 'pm', 'pb1'] });
    await tick();
    const inds = [...el.querySelectorAll('.fac-ind')];
    const names = inds.map(x => x.querySelector('b').textContent);
    assert.deepEqual(names.slice(0, 1).concat(names.slice(-2)), ['GEX Levels', 'Pane A', 'By strike'], 'in the order of their first layer');
    const byName = n => inds[names.indexOf(n)];
    assert.ok([...byName('GEX Levels').querySelectorAll('.fac-ind-layers > *')].some(x => x.textContent.trim() === 'Magnet'));
    assert.ok(inds.every(x => !x.querySelector('.fac-ind-head .fac-badge')), 'no plan on an indicator\'s name');
    // an indicator with one layer is one row, like TradingView: the layer's switch under the indicator's name, its options
    const paneA = byName('Pane A');
    assert.ok(paneA.classList.contains('fac-ind-one'));
    assert.equal(paneA.querySelector('.fac-ind-head'), null);
    assert.equal(paneA.querySelectorAll('.fac-ind-row').length, 1);
    assert.equal(paneA.querySelector('.fac-ind-row label').textContent.trim(), 'Pane A');
    assert.ok(paneA.querySelector('.fac-ind-row input[data-layer="pa"]'));
    assert.ok(paneA.querySelector('.fac-ind-row [data-settings="pa"]'));
    assert.deepEqual([...byName('By strike').querySelectorAll('.fac-ind-layers > *')].map(x => x.textContent.trim()),
      ['Heat', '🔒 Profile Alpha'], 'each layer its own plan: Growth open (no label), Alpha locked on a Growth key');
    // the lens goes into By strike's Settings, the scope (no name) into the plugin's own indicator
    // (both in the options of each layer of that indicator, with the "every layer" hint)
    byName('By strike').querySelector('[data-settings="pb1"]').click();
    assert.deepEqual([...el.querySelectorAll('.fac-dialog .fac-field span')].map(x => x.textContent), ['Lens']);
    assert.equal(el.querySelector('.fac-dialog .fac-dlg-hint').textContent, 'Apply to every layer of By strike.');
    el.querySelector('.fac-dialog [data-ok]').click();
    for (const k of ['levels', 'pm']) {
      byName('GEX Levels').querySelector(`[data-settings="${k}"]`).click();
      el.querySelector('.fac-dialog [data-tab="inputs"]').click();
      assert.ok([...el.querySelectorAll('.fac-dialog .fac-field span')].some(x => x.textContent === 'Scope'), k);
      el.querySelector('.fac-dialog [data-ok]').click();
    }
    // legendLevels once per indicator that is on (Pane A is off), with its name
    assert.ok(seen.includes('GEX Levels') && seen.includes('By strike') && !seen.includes('Pane A'));
    const lines = [...el.querySelectorAll('.fac-legend .lv')].map(x => x.textContent);
    assert.ok(lines.some(l => /^By strike.*strike part/.test(l)), 'the part on its own indicator\'s line');
    assert.ok(!lines.some(l => /^GEX Levels.*strike part/.test(l)));
    assert.ok(!lines.some(l => /^Pane A/.test(l)), 'an indicator that is off has no line');
    chart.destroy();
  });

  it('rejects a plugin without layers or attach', () => {
    assert.throws(() => registerLayers({ layers: [] }), /registerLayers expects/);
  });

  it('an indicator drawn in a pane of its own has its line at the top left of that pane (paneOf, paneLegends)', async () => {
    let paneSeries = null, extraSeries = null, removed = 0;
    registerLayers({
      indicator: 'Pane ind',
      layers: [['pl', 'Pane layer']],
      attach(ctx) {
        return {
          ready() {
            paneSeries = ctx.chart.addSeries(ctx.LW.LineSeries, {}, 1);
            extraSeries = ctx.chart.addSeries(ctx.LW.LineSeries, {}, 2);
          },
          legendLevels(row, parts, prev, indicator) { if (indicator === 'Pane ind') parts.push({ label: '', value: 12.5 }); },
          paneOf: indicator => indicator === 'Pane ind' ? paneSeries : null,
          paneLegends: () => [{ series: extraSeries, name: 'Extra pane', indicator: 'Pane ind', remove: () => { removed++; },
            parts: [{ label: '', value: 3 }] }],
        };
      },
    });
    const el = host();
    const { chart } = open(el, { layers: ['levels', 'pl'] });
    await tick();
    const main = [...el.querySelector('.fac-legend').querySelectorAll('.lv')].map(x => x.textContent);
    assert.ok(main.some(t => /^GEX Levels/.test(t)) && !main.some(t => /Pane ind/.test(t)), 'not on the price pane');
    const panes = [...el.querySelectorAll('.fac-pane-lgs .fac-pane-lg')];
    assert.deepEqual(panes.map(x => [x.dataset.pane, x.textContent]), [['1', 'Pane ind12.50'], ['2', 'Extra pane3.00']]);
    // tops from the pane heights (fake chart: price pane 300 px, others 100 px, 1 px separators) + 4 px
    assert.deepEqual(panes.map(x => x.style.top), ['305px', '406px']);
    // the extra line: options (its indicator's) and remove (its own), no hide
    assert.deepEqual([...panes[1].querySelectorAll('.fac-lg-btn')].map(b => b.dataset.act), ['settings', 'remove']);
    panes[1].querySelector('[data-act="remove"]').click();
    assert.equal(removed, 1);
    panes[1].querySelector('[data-act="settings"]').click();
    assert.equal(el.querySelector('.fac-dialog .fac-dlg-sub').textContent, 'Pane ind');
    chart.destroy();
  });

  it('pane legends sit where lightweight-charts laid the panes out; the legend ends at the plot area and cuts a long line', async () => {
    let paneSeries = null;
    registerLayers({
      indicator: 'Laid out',
      layers: [['lo', 'Laid out layer']],
      attach(ctx) {
        return {
          ready() { paneSeries = ctx.chart.addSeries(ctx.LW.LineSeries, {}, 1); },
          legendLevels(row, parts, prev, indicator) {
            if (indicator === 'Laid out') parts.push({ info: 'about' }, { label: 'One', value: 1 }, { label: 'Two', value: 2 }, { label: 'Three', value: 3 });
          },
          paneOf: indicator => indicator === 'Laid out' ? paneSeries : null,
        };
      },
    });
    const el = host();
    const { c, chart } = open(el, { layers: ['levels', 'lo'] });
    await tick();
    // the panes as lightweight-charts laid them out (the price pane 0-250 px, the plugin's from 251 px), its plot ending
    // 80 px left of the chart body's right edge (the price scale)
    const rect = (top, height, right) => () => ({ top, bottom: top + height, height, left: 0, right, width: right });
    // (plugins registered by earlier tests may add panes of their own: every pane gets an element)
    const els = [];
    const elOf = i => els[i] || (els[i] = Object.assign(document.createElement('div'),
      { getBoundingClientRect: rect(i ? 251 + (i - 1) * 121 : 0, i ? 120 : 250, 920) }));
    const panes = c().panes;
    c().panes = () => panes().map((p, i) => Object.assign(p, { getHTMLElement: () => elOf(i) }));
    el.querySelector('.fac-body').getBoundingClientRect = rect(0, 400, 1000);
    // the plot area's legend box is 300 px; a line is 9 px a character
    const proto = window.HTMLElement.prototype;
    Object.defineProperty(proto, 'clientWidth', { configurable: true, get() { return this.classList.contains('fac-legend') ? 300 : 0; } });
    Object.defineProperty(proto, 'scrollWidth', { configurable: true,
      get() { return [...this.children].filter(x => !x.hidden).reduce((a, x) => a + x.textContent.length * 9, 0); } });
    try {
      c().crosshair.forEach(fn => fn({ time: null }));
      const lg = el.querySelector('.fac-pane-lgs .fac-pane-lg');
      assert.equal(lg.style.top, '255px', 'at the pane element, not at the 300 px height');
      assert.equal(el.querySelector('.fac').style.getPropertyValue('--fac-plot-right'), '80px');
      // "Laid out" + ⓘ + One 1.00 Two 2.00 Three 3.00: too long for 300 px; the title and the ⓘ stay, the last values go
      const line = lg.querySelector('.lv');
      const shown = [...line.children].filter(x => !x.hidden).map(x => x.textContent);
      assert.equal(shown[0], 'Laid out');
      assert.equal(shown.at(-1), '…');
      assert.ok(line.querySelector('.fac-lg-info:not([hidden])'), 'the ⓘ stays');
      assert.match(line.querySelector('.fac-lg-more').title, /Three 3\.00/, 'what was cut, on hover');
      assert.ok(line.scrollWidth <= 300);
    } finally {
      delete proto.clientWidth;
      delete proto.scrollWidth;
    }
    chart.destroy();
  });

  it('like TradingView: one row per one-layer indicator, legend lines that stay put under the pointer, a fold button', async () => {
    const calls = [];
    registerLayers({
      indicators: { one: 'One' },
      layers: [['one', 'One layer']],
      attach() {
        return {
          // its value from its own data, at any bar; the strike under the pointer on the same line
          legendLevels(row, parts, prev, indicator, at) {
            if (indicator !== 'One') return;
            calls.push([Object.keys(row), at]);
            parts.push({ label: 'One', value: row.time % 1000 }, at.y == null ? '' : `y ${at.y}`);
          },
        };
      },
    });
    const el = host();
    // no exposure layer on (levels off): no exposure rows
    const { c, chart } = open(el, { layers: ['one'] });
    await tick();
    // the menu: one row for One (its switch, its name, its options); GEX Levels keeps its head and a row per layer
    const one = [...el.querySelectorAll('.fac-ind')].find(x => x.textContent.includes('One'));
    assert.ok(one.classList.contains('fac-ind-one'));
    assert.equal(one.querySelector('[data-group]'), null);
    const sw = one.querySelector('input[data-layer="one"]');
    assert.equal(sw.checked, true);
    assert.equal(one.querySelector('b').textContent, 'One');
    assert.ok(el.querySelector('.fac-ind:not(.fac-ind-one) .fac-ind-head [data-group]'), 'GEX Levels: several layers, a head');
    // without an exposure row the plugin still fills its line: the row { time }, and where the pointer is
    const line = () => [...el.querySelectorAll('.fac-legend .lv')].find(x => /^One/.test(x.textContent));
    assert.match(line().textContent, /^OneOne \d/);
    assert.deepEqual(calls.at(-1)[0], ['time']);
    assert.deepEqual(calls.at(-1)[1].y, null, 'no pointer: no y');
    const lines = () => el.querySelectorAll('.fac-legend > .sub').length;
    const before = lines();
    c().crosshair.forEach(fn => fn({ time: chartTime('2026-11-13T15:00:00Z'), point: { x: 10, y: 42 } }));
    assert.match(line().textContent, /y 42$/, 'the pointer\'s part on the indicator\'s own line');
    assert.equal(lines(), before, 'the same lines under the pointer: nothing moves');
    c().crosshair.forEach(fn => fn({ time: null, point: null }));
    assert.equal(lines(), before);
    // fold: the indicator lines go, the button stays with their count; again: back
    const fold = () => el.querySelector('.fac-legend [data-act="fold"]');
    assert.equal(fold().getAttribute('aria-expanded'), 'true');
    fold().click();
    assert.equal(line(), undefined);
    assert.equal(fold().getAttribute('aria-expanded'), 'false');
    assert.equal(fold().textContent, '1');
    assert.equal(fold().title, 'Show indicator legend');
    c().crosshair.forEach(fn => fn({ time: chartTime('2026-11-13T15:00:00Z'), point: { x: 10, y: 42 } }));
    assert.equal(line(), undefined, 'stays folded under the pointer');
    fold().click();
    assert.ok(line());
    // the one row's switch turns the layer off
    sw.checked = false; sw.dispatchEvent(new window.Event('change'));
    await tick();
    assert.deepEqual(chart.layers, []);
    assert.equal(fold(), null, 'no indicator line: no fold button');
    chart.destroy();
  });
});
