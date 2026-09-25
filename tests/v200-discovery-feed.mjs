import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const source = shell.slice(shell.indexOf('  function stopDiscoveryFeed()'), shell.indexOf('  function annualDiscoveryMarkup('));
let response;
const requested = [];
const api = new Function('cachedApi', `
  let discoveryFeed = null;
  const window = {};
  const icons = { retry: '', plus: '' };
  const discoveryCard = item => '[' + item.mediaType + ':' + item.id + ']';
  const activateDiscoveryEnrichment = () => {};
  const activateTrackerAvailability = () => {};
  ${source}
  return { start: startDiscoveryFeed, load: loadMoreDiscoveries, stop: stopDiscoveryFeed };
`)(async path => {
  requested.push(new URL(path, 'http://test').searchParams.get('page'));
  return typeof response === 'function' ? response() : response;
});

function surface() {
  const button = { isConnected: true, addEventListener() {} };
  const grid = {
    isConnected: true, dataset: {}, html: '',
    parentElement: { querySelector: () => button },
    querySelector: () => null,
    insertAdjacentHTML(position, html) { this.html += html; }
  };
  return { grid, button };
}
const item = (id, mediaType = 'movie') => ({ id, mediaType });
const state = { category: 'cinema', mediaType: 'all' };

const first = surface();
api.start(first.grid, { results: [item(1)], hasMore: true, nextPage: 2 }, state, []);
response = { results: [item(1), item(2), item(3)], hasMore: false };
await api.load();
assert.equal(first.grid.html, '[movie:2][movie:3]', 'Les titres deja rendus ne sont pas dupliques.');
assert.equal(first.grid.dataset.exhausted, 'true');
assert.equal(first.button.disabled, true);
assert.deepEqual(requested, ['2']);

const buffered = surface();
api.start(buffered.grid, { results: [] }, state, Array.from({ length: 17 }, (_, i) => item(i)));
await api.load();
assert.equal((buffered.grid.html.match(/\[/g) || []).length, 12);
assert.equal(buffered.grid.dataset.exhausted, 'false');
await api.load();
assert.equal((buffered.grid.html.match(/\[/g) || []).length, 17);
assert.equal(buffered.grid.dataset.exhausted, 'true');

const retry = surface();
api.start(retry.grid, { results: [], hasMore: true, nextPage: 4 }, state, []);
response = () => { throw new Error('Network error'); };
await api.load();
assert.match(retry.button.innerHTML, /R.essayer/);
assert.equal(retry.grid.dataset.exhausted, 'false');
response = { results: [item(4)], hasMore: false };
await api.load();
assert.deepEqual(requested.slice(-2), ['4', '4'], 'La page en erreur doit pouvoir etre rechargee.');

const stale = surface();
api.start(stale.grid, { results: [], hasMore: true, nextPage: 2 }, state, []);
let finish;
response = () => new Promise(resolve => { finish = resolve; });
const pending = api.load();
api.stop();
finish({ results: [item(9)], hasMore: false });
await pending;
assert.equal(stale.grid.html, '', 'Un changement de vue annule les insertions tardives.');

const filtered = surface();
api.start(filtered.grid, { results: [], hasMore: true, nextPage: 2 }, { ...state, mediaType: 'tv' }, []);
response = { results: [item(1), item(2, 'tv')], hasMore: false };
await api.load();
assert.equal(filtered.grid.html, '[tv:2]');
console.log('v200.12 incremental feed, deduplication, retry, stale responses and filters passed');
