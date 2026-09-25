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

assert.ok(server.includes("defaultTvEpgUrl = 'https://xmltvfr.fr/xmltv/xmltv_fr.xml.gz'"));
assert.ok(server.includes('createGunzip') && server.includes('parseXmlTvNowNextStream'));
assert.ok(server.includes('tvEpgPromises.set') && server.includes("current || next ? 'XML TV Fr' : ''"));

const ohaIdentityStart = server.indexOf('function ohaChannelIdentity');
const ohaIdentityEnd = server.indexOf('function ', ohaIdentityStart + 10);
const ohaIdentity = server.slice(ohaIdentityStart, ohaIdentityEnd);
assert.ok(ohaIdentity.includes('backup|secours|live during events only|events only'));
assert.ok(server.includes('if (name.length < current.name.length) current.name = name;'));

assert.ok(server.includes('async function wiTvNoctraFallbackOption'));
assert.ok(server.includes("item.id === 'fstv-public' || item.type === 'fstv'"));
assert.ok(server.includes('const response = await fetchTvRemote(item.url, {') && server.includes('Secours Noctra · FSTV'));

const volkamaxStart = server.indexOf('async function proxyVolkamaxEmbed');
const volkamaxEnd = server.indexOf('function parseVolkamaxSports', volkamaxStart);
const volkamaxSource = server.slice(volkamaxStart, volkamaxEnd);
assert.equal(volkamaxSource.includes('sandbox='), false);
assert.ok(volkamaxSource.includes('Lecteur web'));

assert.ok(server.includes('function resolveStreamSports99EventReference'));
assert.ok(server.includes("encodeTvStateReference('streamsports99-event'"));
assert.ok(server.includes("/api/tv/streamsports99/resolve/"));
assert.ok(server.includes("playbackType: 'resolver'"));

assert.ok(shell.includes('const startResolvedOptionFallback'));
assert.ok(shell.includes('item?.officialClient && item?.vip !== false'));
assert.ok(shell.includes('tvFailedOptionIndexes'));
assert.ok(shell.includes('const warmQuick = validCachedApiValue(quickPath)'));

console.log('Noctra v183 - fournisseurs TV, reprise et EPG : OK');
