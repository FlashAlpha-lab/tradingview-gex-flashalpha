import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// One version: npm, the scripts' banner and embed.js's ?v= (cache busting on the chart host) move together.
it('embed.js VERSION is the package version', () => {
  const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const pkg = JSON.parse(read('package.json'));
  assert.equal((read('embed.js').match(/var VERSION = '([^']+)'/) || [])[1], pkg.version);
});
