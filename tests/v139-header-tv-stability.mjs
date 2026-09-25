import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [pkg, server, shell, css, index, sw] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../server.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/client/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8')
]);

assert.equal(pkg.version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21') && index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(server.includes("import { pipeline, Readable } from 'node:stream'"));
assert.ok(server.includes('function pipeRemoteResponseBody(response, res)'));
assert.ok((server.match(/pipeRemoteResponseBody/g) || []).length >= 7);
assert.equal(server.includes('Readable.fromWeb(response.body).pipe(res)'), false);
assert.equal(server.includes('scheduleTvLogoWarmup('), false);
assert.ok(shell.includes("visibleIndex < 8 ? 'high' : visibleIndex < 20 ? 'eager' : 'lazy'"));

const v139Css = css.slice(css.lastIndexOf('/* Noctra V139 - bandeau stable'));
assert.ok(v139Css.length > 1_500);
assert.match(v139Css, /@media \(min-width: 761px\)[\s\S]*button\.headerButton:hover[\s\S]*width: 44px !important;[\s\S]*transition: none !important;/);
assert.match(v139Css, /@media \(max-width: 760px\)[\s\S]*height: calc\(68px \+ env\(safe-area-inset-top\)\) !important;/);
assert.match(v139Css, /button\.headerButton:hover[\s\S]*width: 42px !important;/);
assert.match(v139Css, /top: calc\(env\(safe-area-inset-top\) \+ 84px\) !important;/);

console.log('v139 header sizing and TV stream stability checks passed');
