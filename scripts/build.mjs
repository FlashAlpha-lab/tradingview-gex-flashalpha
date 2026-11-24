// Builds dist/ from src/: the style sheet (lightningcss) and the script in four formats (esbuild).
//   tradingview-gex-flashalpha.mjs      ES module           import { mount } from 'tradingview-gex-flashalpha'
//   tradingview-gex-flashalpha.cjs      CommonJS            require('tradingview-gex-flashalpha')
//   tradingview-gex-flashalpha.js       script tag          window.FlashAlphaChart (drop-in for flashalpha-chart-core.js)
//   tradingview-gex-flashalpha.min.js   script tag, minified
//   tradingview-gex-flashalpha.css      the style sheet, for pages that load it themselves (mount option injectCss: false)
// Every script carries the minified CSS and injects it once per page. lightweight-charts is never bundled: it is a peer
// dependency, read from options.lightweightCharts or window.LightweightCharts.
//
// dist/vendor/ gets the pinned lightweight-charts (the exact devDependency version) with its LICENSE and NOTICE, for the
// chart host, the demo and the examples to serve themselves instead of a CDN. It is not in the npm package.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { transform } from 'lightningcss';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const dist = join(root, 'dist');
const NAME = 'tradingview-gex-flashalpha';

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// The browsers the README promises (ES2020): the CSS is lowered for them, nothing newer is assumed.
const TARGETS = { chrome: 91 << 16, firefox: 90 << 16, safari: 14 << 16 };
const css = transform({
  filename: NAME + '.css',
  code: readFileSync(join(root, 'src/styles.css')),
  minify: true,
  targets: TARGETS,
}).code.toString();

const banner = '/*! ' + pkg.name + ' v' + pkg.version + ' | ' + pkg.license + ' | https://github.com/FlashAlpha-lab/tradingview-gex-flashalpha */';
writeFileSync(join(dist, NAME + '.css'), banner + '\n' + css + '\n');

const shared = {
  bundle: true,
  target: ['es2020'],
  legalComments: 'none',
  charset: 'utf8',
  banner: { js: banner },
  define: {
    __FAC_CSS__: JSON.stringify(css),
    __FAC_VERSION__: JSON.stringify(pkg.version),
  },
};
const entry = join(root, 'src/index.js');
const script = join(root, 'src/global.js');

await esbuild.build({ ...shared, entryPoints: [entry], format: 'esm', outfile: join(dist, NAME + '.mjs') });
await esbuild.build({ ...shared, entryPoints: [entry], format: 'cjs', platform: 'neutral', outfile: join(dist, NAME + '.cjs') });
await esbuild.build({ ...shared, entryPoints: [script], format: 'iife', outfile: join(dist, NAME + '.js') });
await esbuild.build({ ...shared, entryPoints: [script], format: 'iife', minify: true, outfile: join(dist, NAME + '.min.js') });

const LW_PIN = pkg.devDependencies['lightweight-charts'];
if (!/^\d+\.\d+\.\d+$/.test(LW_PIN)) throw new Error('pin lightweight-charts to an exact version in devDependencies, not ' + LW_PIN);
const lwDir = join(root, 'node_modules/lightweight-charts');
const lwInstalled = JSON.parse(readFileSync(join(lwDir, 'package.json'), 'utf8')).version;
if (lwInstalled !== LW_PIN) throw new Error(`lightweight-charts ${lwInstalled} is installed, ${LW_PIN} is pinned: run npm install`);
const vendor = join(dist, 'vendor');
mkdirSync(vendor, { recursive: true });
const lwFile = `lightweight-charts-${LW_PIN}.standalone.production.js`;
copyFileSync(join(lwDir, 'dist/lightweight-charts.standalone.production.js'), join(vendor, lwFile));
copyFileSync(join(lwDir, 'LICENSE'), join(vendor, `lightweight-charts-${LW_PIN}.LICENSE.txt`));
copyFileSync(join(root, 'vendor/lightweight-charts/NOTICE'), join(vendor, `lightweight-charts-${LW_PIN}.NOTICE.txt`));

console.log('built dist/ for ' + pkg.name + ' v' + pkg.version);
console.log(`vendored lightweight-charts ${LW_PIN}: dist/vendor/${lwFile}`);
