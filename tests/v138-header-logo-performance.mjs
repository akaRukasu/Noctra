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

const v138Css = css.slice(css.lastIndexOf('/* Noctra V138 - actions mobiles ancrees'));
assert.ok(v138Css.length > 700);
assert.match(v138Css, /\.headerTop \.headerRight \{[\s\S]*margin-left: auto !important;/);
assert.match(v138Css, /\.headerTop \{[\s\S]*width: 100% !important;/);
assert.match(v138Css, /contain: layout paint style !important;/);

assert.ok(server.includes('const tvLogoIndexSchemaVersion = 2'));
assert.ok(server.includes('const tvLogoFetchPromises = new Map()'));
assert.equal(server.includes('function scheduleTvLogoWarmup('), false);
assert.ok(server.includes("const indexedChannels = (Array.isArray(channels) ? channels : []).filter(channel => channel?.id)"));
assert.ok(server.includes(".replace(/\\s*\\.(?:b|c|s)\\s*$/i, ' ')"));
assert.doesNotMatch(server, /if \(!channel\?\.id \|\| !preferredCountries\.has/);
assert.ok(server.includes('Boolean(options.logoRefresh)'));
assert.ok(server.includes("logo: tvPublicImageUrl(item.logo, item.secondaryLogo ? '' : item.name)"));

assert.ok(shell.includes('function mutationAddsStructure(mutations, selector)'));
assert.ok(shell.includes('if (!structural && !detailContent) return;'));
assert.ok(shell.includes("visibleIndex < 8 ? 'high' : visibleIndex < 20 ? 'eager' : 'lazy'"));
assert.ok(shell.includes('pendingSecondary.dataset.tvLogoSrc'));
assert.match(shell, /function installDesktopSmoothWheel\(\)[\s\S]*classList\.contains\('noctra-native-wheel'\)[\s\S]*return;/);

console.log('v138 mobile header anchoring, worldwide TV logos and desktop mutation filtering checks passed');
