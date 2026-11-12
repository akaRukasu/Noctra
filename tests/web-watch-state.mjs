import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8');
const [source, home, runtime, index, shell] = await Promise.all([
  read('public/noctra-watch-state.js'),
  read('public/client/56213.a6cde3c8ba80d7030952.chunk.js'),
  read('public/client/runtime.bundle.js'),
  read('public/client/index.html'),
  read('public/noctra-shell.js')
]);
assert.match(home, /noctraWatchRow="nextup".*UserId:owner\?owner\.userId:r\.getCurrentUserId\(\).*DisableFirstEpisode:!0.*nextUpCutoff\(t\.maxDaysForNextUp\(\)\).*EnableRewatching:!0/);
assert.match(home, /noctraWatchRow="resume".*r\.getResumableItems\(owner\?owner\.userId:r\.getCurrentUserId\(\),n\)/);
assert.match(home, /NoctraWatchState\.refreshRow\(this,O\.bind\(this\)\)/);
assert.match(runtime, /56213===e\?"\?v=200\.171":""/);
assert.ok(index.indexOf('noctra-watch-state.js') < index.indexOf('main.jellyfin.bundle.js'));
assert.match(shell, /String\(payload\.userId \|\| ''\) !== String\(owner\.userId\)/);

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
};
const queries = [];
const changes = [];
let uid = 'alice';
let token = 'alice-token';
const nativeCalls = [];
const userData = new Map();
let markRequest;
let playbackStop;
const client = {
  getCurrentUserId: () => uid,
  accessToken: () => token,
  serverId: () => 'jellyfin',
  setAuthenticationInfo(nextToken, nextUser) { token = nextToken; uid = nextUser; },
  markPlayed(user, itemId) {
    nativeCalls.push(['played', user, itemId]);
    return markRequest.promise;
  },
  markUnplayed(user, itemId) {
    nativeCalls.push(['unplayed', user, itemId]);
    return Promise.resolve({ Played: false });
  },
  getItem: async (_user, id) => ({ UserData: userData.get(id) }),
  reportPlaybackStopped: () => playbackStop.promise
};
const row = {
  isConnected: true,
  dataset: { noctraWatchRow: 'nextup' },
  items: [],
  parentContainer: { classList: { add() {} } },
  replaceChildren() { this.items = []; },
  fetchData(owner) {
    const request = deferred();
    queries.push({ ...request, userId: owner.userId, token: owner.token, client: owner.client });
    return request.promise;
  },
  refreshItems() {
    return window.NoctraWatchState.refreshRow(this, result => {
      this.items = Array.from(result.Items, item => item.Id);
    });
  }
};
const fakeTimers = new Map();
let timerId = 0;
const window = {
  ApiClient: client,
  dispatchEvent: event => changes.push(event.type),
  setTimeout: callback => { fakeTimers.set(++timerId, callback); return timerId; },
  clearTimeout: id => fakeTimers.delete(id)
};
const tick = () => {
  for (const [id, callback] of fakeTimers) {
    fakeTimers.delete(id);
    callback();
  }
};
const document = {
  hidden: false,
  addEventListener() {},
  querySelector: () => ({ querySelectorAll: () => [row] }),
  querySelectorAll: () => [row]
};
vm.runInNewContext(source, { window, document, Event });
const { bind, syncAccount, nextUpCutoff } = window.NoctraWatchState;
const now = Date.parse('2026-11-04T20:00:00Z');
assert.equal(nextUpCutoff(365, now), '2026-10-05T20:00:00.000Z');
assert.equal(nextUpCutoff(7, now), '2026-10-28T20:00:00.000Z');
assert.equal(nextUpCutoff(undefined, now), '2026-10-05T20:00:00.000Z');
const listeners = new Map();
const events = {
  on: (_target, name, handler) => listeners.set(name, handler),
  trigger: (_target, name, args) => {
    changes.push([name, args[1].ItemId, args[1].Played]);
    listeners.get(name)?.(null, ...args);
  }
};
bind(client, events, {});
const item = (id, Played = false, PlaybackPositionTicks = 1) => ({ Id: id, UserData: { Played, PlaybackPositionTicks } });
const reply = (...Items) => ({ Items });

syncAccount();
assert.equal(queries[0].userId, 'alice');
assert.equal(queries[0].token, 'alice-token');
assert.equal(queries[0].client, client);
queries[0].resolve(reply(item('alice-episode'), item('suite-de-revisionnage', true, 0), { Id: 'sans-état-utilisateur' }));
await new Promise(setImmediate);
assert.deepEqual(row.items, ['alice-episode', 'suite-de-revisionnage']);

const old = row.refreshItems();
client.setAuthenticationInfo('bob-token', 'bob');
assert.deepEqual(row.items, [], 'l’ancien compte est retiré immédiatement');
assert.equal(queries[2].userId, 'bob');
queries[2].resolve(reply(item('bob-episode')));
await new Promise(setImmediate);
queries[1].resolve(reply(item('alice-ancien')));
await old;
assert.deepEqual(row.items, ['bob-episode'], 'la réponse tardive de l’autre compte est ignorée');

row.dataset.noctraWatchRow = 'resume';
const early = row.refreshItems();
const late = row.refreshItems();
queries[4].resolve(reply(item('nouvelle-position'),
  { Id: 'revisionnage', RunTimeTicks: 25_290_560_000, UserData: { Played: true, PlaybackPositionTicks: 7_384_840_000, PlayedPercentage: 100 } },
  item('sans-reprise', false, 0), item('terminé', true, 0),
  { Id: 'générique-final', RunTimeTicks: 1000, UserData: { Played: false, PlaybackPositionTicks: 995 } }));
await late;
queries[3].resolve(reply(item('ancienne-position')));
await early;
assert.deepEqual(row.items, ['nouvelle-position', 'revisionnage']);

const other = {};
listeners.get('UserDataChanged')(null, other, item('étranger'));
assert.equal(fakeTimers.size, 0, 'une notification provenant d’un autre serveur est ignorée');
markRequest = deferred();
const mark = client.markPlayed('bob', 'film');
const unmark = client.markUnplayed('bob', 'film');
assert.deepEqual(nativeCalls, [['played', 'bob', 'film']], 'les clics rapides restent dans l’ordre');
markRequest.resolve({ Played: true, PlaybackPositionTicks: 0 });
await Promise.all([mark, unmark]);
assert.deepEqual(nativeCalls, [['played', 'bob', 'film'], ['unplayed', 'bob', 'film']]);
assert.deepEqual(changes.filter(Array.isArray), [['UserDataChanged', 'film', true], ['UserDataChanged', 'film', false]]);
tick();
assert.equal(queries[5].userId, 'bob', 'la mutation confirmée actualise l’accueil');
queries[5].resolve(reply());
await new Promise(setImmediate);

userData.set('film', { Played: false });
markRequest = deferred();
const failed = client.markPlayed('bob', 'film');
markRequest.reject(new Error('Erreur Jellyfin'));
await assert.rejects(failed, /Erreur Jellyfin/);
assert.deepEqual(changes.filter(Array.isArray).at(-1), ['UserDataChanged', 'film', false], 'une erreur rétablit l’état enregistré');
tick();
queries[6].resolve(reply());
await new Promise(setImmediate);

playbackStop = deferred();
const stopped = client.reportPlaybackStopped({ ItemId: 'film' });
assert.equal(fakeTimers.size, 0);
playbackStop.resolve();
await stopped;
assert.equal(fakeTimers.size, 1, 'l’actualisation attend que la position soit enregistrée');
client.setAuthenticationInfo(null, null);
assert.deepEqual(row.items, []);
tick();
assert.equal(queries.length, 7, 'la déconnexion ne lance aucune requête personnelle');
console.log('Accueil web : comptes isolés, réponses périmées écartées, états de lecture et rafraîchissement OK');
