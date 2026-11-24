// Checks src/ before a build: every .js file parses as an ES module, nothing imports lightweight-charts (it stays a peer
// dependency the page provides), and no reference to flashalpha.com's own site code leaks into the public package.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const FORBIDDEN = [
  /FlashAuth/,
  /fa_user/,
  /FaFetchPool/,
  /FaTelemetry/,
  /FaUpgradeModal/,
  /faToolUsage/,
  /data-analytics/,
  /console\.log\(/,
  /debugger;/,
];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) walk(file);
    else files.push(file);
  }
})(src);

const problems = [];
for (const file of files) {
  const name = relative(src, file).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');
  if (extname(file) === '.js') {
    let ast;
    try { ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' }); }
    catch (e) { problems.push(name + ': ' + e.message); continue; }
    for (const node of ast.body) {
      if ((node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration')
        && node.source && /^lightweight-charts/.test(node.source.value)) problems.push(name + ' imports lightweight-charts');
    }
  }
  for (const re of FORBIDDEN) {
    const m = text.match(re);
    if (m) problems.push(name + ' contains "' + m[0] + '"');
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('src: ' + files.length + ' files parse, lightweight-charts stays external, no site-internal references');
