import { it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// One version: npm, the scripts' banner and embed.js's ?v= (cache busting on the chart host) move together.
it('embed.js VERSION is the package version', () => {
  const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const pkg = JSON.parse(read('package.json'));
  assert.equal((read('embed.js').match(/var VERSION = '([^']+)'/) || [])[1], pkg.version);
});

// The demo page tells search engines and AI assistants which version it describes (SoftwareSourceCode "version").
// Where this package is built, the published demo page is private/public-repo/index.html (index.html is a dev page).
it('the demo page structured data carries the package version', () => {
  const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const pkg = JSON.parse(read('package.json'));
  const page = ['private/public-repo/index.html', 'index.html'].find(p => existsSync(new URL('../' + p, import.meta.url)));
  assert.equal((read(page).match(/"version": "([^"]+)"/) || [])[1], pkg.version);
});
