import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [pkgText, server, shell, css, index, sw] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../server.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/client/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8')
]);

assert.equal(JSON.parse(pkgText).version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21') && index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

for (const marker of ['officialTvPortalChannels', "id: 'official-tv-portals'", "type: 'official'", "source.type === 'official'"]) {
  assert.ok(!server.includes(marker), `Le serveur ne doit plus contenir ${marker}.`);
}

for (const marker of ['data-tv-source-type', "catalog.sourceType === 'official'", "channel.playbackType === 'external'"]) {
  assert.ok(!shell.includes(marker), `Le client ne doit plus contenir ${marker}.`);
}

assert.ok(!css.includes('data-tv-source-type="official"'));

console.log('V143 official portal removal checks passed.');
