import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/client/index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(server.includes("version: '200.0.21'"));
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

const matteDock = css.slice(css.indexOf('/* Noctra V132 - dock mat'));
assert.ok(matteDock.length > 200);
assert.match(matteDock, /#noctra-dock \*[\s\S]*box-shadow: none !important;/);
assert.match(matteDock, /filter: none !important;/);
assert.match(matteDock, /text-shadow: none !important;/);
assert.match(matteDock, /\.noctra-dock-button::before[\s\S]*content: none !important;/);

assert.ok(server.includes("['north', 'frame'].includes(sourceFamily)"));
assert.ok(server.includes('`/api/tv/livewatch/resolve/${sourceFamily}/${encodeURIComponent(reference.id)}`'));
assert.ok(server.includes('streamKind: `${familyLabel} · direct officiel HLS`'));
assert.ok(shell.includes("if (channel?.playbackType === 'resolver' && channel?.resolverUrl) return false;"));

const decorateStart = server.indexOf('async function decorateLiveWatchVipPlayback');
const decorateEnd = server.indexOf('\n\nfunction validLiveWatchChannelReference', decorateStart);
const decorateSource = server.slice(decorateStart, decorateEnd);
const embedReference = channel => {
  const url = new URL(channel.externalUrl || channel.embedUrl);
  const match = url.pathname.match(/^\/embed\/(?:(daddy|north|frame)\/)?([^/]+)\/?$/i);
  return match ? { kind: String(match[1] || 'main').toLowerCase(), id: match[2] } : null;
};
const decorate = new Function(
  'liveWatchQuickVipStatus',
  'liveWatchEmbedReference',
  'publicPath',
  `${decorateSource}; return decorateLiveWatchVipPlayback;`
)(async () => ({ configured: true, active: true, isVip: true }), embedReference, value => `/noctra${value}`);

for (const family of ['north', 'frame']) {
  const embedUrl = `https://livewatch.top/embed/${family}/sample`;
  const result = await decorate({ channels: [{ embedUrl }] }, { id: `livewatch-${family}`, family });
  assert.equal(result.channels[0].playbackType, 'resolver');
  assert.equal(result.channels[0].embedUrl, '');
  assert.equal(result.channels[0].vipPlayback, true);
  assert.equal(result.channels[0].vipFallbackUrl, embedUrl);
  assert.equal(result.channels[0].resolverUrl, `/noctra/api/tv/livewatch/resolve/${family}/sample`);
}

assert.ok(!server.includes("id: 'livewatch-daddy'"));

console.log('v132 matte dock and LiveWatch family routing checks passed');
