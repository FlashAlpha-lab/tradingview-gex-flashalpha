import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { fakeLW, fakeSource } from './helpers.js';

const distUrl = new URL('../dist/', import.meta.url);
const built = existsSync(new URL('tradingview-gex-flashalpha.mjs', distUrl));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('built package', { skip: built ? false : 'run npm run build first' }, () => {
  it('the ES module reports its version and injects its CSS once (or not at all with injectCss: false)', async () => {
    const M = await import(new URL('tradingview-gex-flashalpha.mjs', distUrl));
    assert.equal(M.version, pkg.version);
    assert.equal(M.default.version, pkg.version);
    const make = opts => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      return M.mount(el, Object.assign({ symbol: 'SPX', refresh: 0, lightweightCharts: fakeLW(), source: fakeSource(), storage: false }, opts));
    };
    document.getElementById('fac-css')?.remove();
    const a = make({ injectCss: false });
    assert.equal(document.getElementById('fac-css'), null);
    const b = make();
    const c = make();
    const styles = document.querySelectorAll('style#fac-css');
    assert.equal(styles.length, 1);
    assert.match(styles[0].textContent, /^\.fac\{/);
    [a, b, c].forEach(x => x.destroy());
  });

  it('the CommonJS build has the same API', () => {
    const cjs = createRequire(import.meta.url)(fileURLToPath(new URL('tradingview-gex-flashalpha.cjs', distUrl)));
    for (const k of ['mount', 'chartEngineSource', 'registerLayers', 'setLicenseKey']) assert.equal(typeof cjs[k], 'function');
    assert.deepEqual(cjs.plans, ['free', 'basic', 'growth', 'alpha', 'enterprise']);
  });

  it('the CSS never styles anything outside the chart', () => {
    const css = readFileSync(new URL('tradingview-gex-flashalpha.css', distUrl), 'utf8').replace(/^\/\*![^*]*\*\/\s*/, '');
    const selectors = [];
    css.replace(/(^|[{};])([^{}@;]+)\{/g, (m, p, sel) => { selectors.push(...sel.split(',')); return m; });
    const loose = selectors.map(s => s.trim()).filter(s => s && !s.startsWith('.fac'));
    assert.deepEqual(loose, []);
  });

  it('the CSS puts the browser\'s own form controls back over a page\'s form resets, in the theme\'s colour scheme', () => {
    const css = readFileSync(new URL('tradingview-gex-flashalpha.css', distUrl), 'utf8');
    assert.match(css, /\.fac,\.fac-grp\{color-scheme:var\(--fac-scheme,dark\)\}/);
    assert.match(css, /\.fac input\[type=checkbox\],\.fac input\[type=radio\],\.fac-grp input\[type=checkbox\],\.fac-grp input\[type=radio\]\{all:revert\}/);
    assert.match(css, /\.fac select,\.fac input\[type=search\],\.fac-grp select,\.fac-grp input\[type=search\]\{[^}]*appearance:auto/);
  });

  it('the script build sets window.FlashAlphaChart and mounts with window.LightweightCharts', async () => {
    for (const file of ['tradingview-gex-flashalpha.js', 'tradingview-gex-flashalpha.min.js']) {
      const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only', url: 'https://example.com/', pretendToBeVisual: true });
      const w = dom.window;
      w.ResizeObserver = class { observe() {} disconnect() {} };
      w.LightweightCharts = fakeLW();
      w.eval(readFileSync(new URL(file, distUrl), 'utf8'));
      const F = w.FlashAlphaChart;
      assert.equal(F.version, pkg.version);
      assert.deepEqual([...F.layers], ['levels', 'maxpain']);
      const chart = F.mount(w.document.getElementById('c'), { symbol: 'SPX', refresh: 0, source: fakeSource() });
      await new Promise(r => setTimeout(r, 20));
      assert.equal(w.LightweightCharts.charts[0].series.length, 11);   // candles, volume, 4 daily levels, 4 levels, the close line
      assert.ok(w.document.getElementById('fac-css'));
      chart.destroy();
    }
  });
});
