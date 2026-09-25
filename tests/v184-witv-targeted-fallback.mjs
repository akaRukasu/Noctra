import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [pkgText, server, shell, sw] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../server.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8')
]);
const pkg = JSON.parse(pkgText);

assert.equal(pkg.version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(sw.includes('noctra-shell-v200-r15'));

const start = server.indexOf('async function wiTvNoctraFallbackOption');
const end = server.indexOf('function sanitizeWiTvPlayerHtml', start);
const source = server.slice(start, end);
assert.ok(start >= 0 && end > start);
assert.equal(source.includes('await tvCatalogFromFstv'), false);
assert.ok(source.includes("new URL('/index.php?category=chaines-live&do=cat', root)"));
assert.ok(source.includes('await enrichFstvDirectStreams([match])'));
assert.ok(source.includes("label: 'Secours Noctra · FSTV'"));
assert.ok(source.includes("label: 'Secours Noctra · FSTV web'"));

console.log('Noctra v184 - secours WiTV ciblé : OK');
