// Noctra TV 1.1.51 / noctra.71 — multiview : les chaînes sans flux direct (DLStreams…) passent par le
// lecteur de leur site ; la vignette Android TV ouvre la page, repère son flux HLS et le lit en natif.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const app = await read('apps/androidtv/web/app.js');
const start = app.indexOf('  function multiviewOptions(options, channel) {');
const end = app.indexOf('\n  }\n', start) + 4;
assert.ok(start > 0 && end > start);
const multiviewOptions = new Function('optionLabel', 'optionKind', 'absolute', 'tsTransport', 'frameConfig',
  `${app.slice(start, end)}; return multiviewOptions;`)(
  (option, index) => option.label || `Serveur ${index + 1}`,
  option => option.streamUrl ? 'native' : option.resolveUrl && !option.url ? 'resolve' : 'web',
  value => /^https?:\/\//.test(value) ? value : `https://noctra.test${value}`,
  () => false,
  () => ({ sandbox: null, referrer: 'strict-origin-when-cross-origin' })
);
const list = multiviewOptions([
  { label: 'DLStreams', url: 'https://dlstreams.test/embed/1', manualOnly: false },
  { label: 'Site avec pubs', url: 'https://pubs.test/1', manualOnly: true },
  { label: 'Auto', resolveUrl: '/api/tv/resolve/x' },
  { label: 'Direct', streamUrl: '/api/tv/stream/y' }
], {});
assert.deepEqual(list.map(item => item.label), ['Direct', 'Auto', 'DLStreams · lecteur du site', 'Site avec pubs · lecteur du site'], 'directs, automatiques, puis lecteurs des sites');
assert.equal(list[2].page, 'https://dlstreams.test/embed/1');
assert.equal(list[2].sandbox, null);
assert.equal(multiviewOptions([{ label: 'Seul site', url: 'https://only.test/', manualOnly: true }], {}).length, 1, 'chaîne qui n’a qu’un lecteur de site : gardée');

const activity = await read('apps/androidtv/java/com/noctra/tv/NoctraMultiviewActivity.java');
assert.match(activity, /private void sniff\(final Tile tile, final Option option, final int index, final int generation\)/);
assert.match(activity, /if \(!found\[0\] && isStream\(url\)\)/);
assert.match(activity, /tile\.stream = new NoctraStream\(this, tile\.view, tile, url, option\.mime, headers, true, true, 0\);/, 'flux repéré lu avec les en-têtes de la page');
assert.match(activity, /settings\.setSafeBrowsingEnabled\(false\)/);
assert.match(activity, /option\.page = source\.optString\("page", ""\);/);
assert.match(activity, /getHost\(\)\.toLowerCase\(\)\.contains\("livewatch\."\)/, 'jamais la page publique LiveWatch');
assert.match(await read('apps/scripts/build-androidtv.mjs'), /const noctraRevision = 71;/);
assert.match(await read('apps/androidtv/web/tv-native.js'), /var VERSION = '1\.1\.(5[1-9]|[6-9]\d)';/, 'interface 1.1.51 ou plus récente');
console.log('Noctra TV 1.1.51 / noctra.71 : multiview avec les lecteurs des sites (flux repéré, lecture native) : OK');
