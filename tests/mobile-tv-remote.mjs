import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../apps/androidtv/web/app.js', import.meta.url), 'utf8');
const commands = [], replies = [], zaps = [], launched = [], toasts = [];
const context = vm.createContext({
  playback: { channel: { name: 'beIN SPORTS 1' } }, vodPlayback: null,
  mobileRemoteState: { playing: true, positionMs: 12000, volume: 25 },
  native: (name, args) => { commands.push({ name, args }); return true; },
  jfJson: async (method, path, body) => { replies.push({ method, path, body }); },
  setTimeout: action => action(), zap: delta => zaps.push(delta),
  loadUnified: async () => ({ channels: [] }), unifiedName: name => name.toLowerCase(),
  epgPayload: () => ({}), launchChannel: channel => { context.playback = { channel }; },
  MULTI_MAX: 12, ALL_SOURCE: { id: 'all' }, channelKey: (channel, source) => source.id + ':' + channel.name,
  launchMultiItems: items => launched.push(items), toast: text => toasts.push(text),
  serverList: async () => [{ streamUrl: '/api/tv/stream/x' }], multiviewOptions: options => options.map(option => ({ label: 'Flux', url: option.streamUrl }))
});
vm.runInContext(source.slice(source.indexOf('  // Multiview ouvert (vignettes'), source.indexOf('  function remotePlaystate(data)')), context);
const id = 'a'.repeat(32), target = 'b'.repeat(32);
context.mobileRemoteCommand({ action: 'state', replyTo: '../admin', targetId: target });
assert.equal(commands.length, 0);
context.mobileRemoteCommand({ action: 'state', replyTo: id, targetId: target });
assert.equal(replies[0].path, `/Sessions/${id}/Command`);
assert.equal(replies[0].body.Name, 'PlayMediaSource');
assert.equal(replies[0].body.Arguments.NoctraRemoteState, '1');
assert.deepEqual(JSON.parse(replies[0].body.Arguments.state), { live: true, title: 'beIN SPORTS 1', playing: true, position: 12, volume: 25, multiview: null });
context.mobileRemoteCommand({ action: 'volume', value: '-20' });
assert.equal(commands.at(-1).args.value, 0);
context.mobileRemoteCommand({ action: 'volume', value: 'NaN' });
assert.equal(commands.at(-1).args.value, 0);
context.mobileRemoteCommand({ action: 'next' });
context.mobileRemoteCommand({ action: 'previous' });
assert.deepEqual(zaps, [1, -1]);
context.mobileRemoteCommand({ action: 'toggle' });
assert.equal(commands.at(-1).args.command, 'playpause');
context.mobileRemoteCommand({ action: 'stop' });
assert.equal(context.playback, null);
context.mobileRemoteCommand({ action: 'playLive', channel: JSON.stringify({ name: 'Arte', _entries: [{ channel: { streamUrl: '/api/tv/stream/a' }, source: { name: 'Source' } }] }) });
assert.equal(context.playback.channel.name, 'Arte');
context.mobileRemoteCommand({ action: 'playLive', channel: JSON.stringify({ name: 'Malformed', _entries: [null] }) });
assert.equal(context.playback.channel.name, 'Arte');
// Multiview piloté depuis le téléphone : lancement, ajout, son, mise en avant, retrait, fermeture.
const channel = name => ({ name, _entries: [{ channel: { streamUrl: '/api/tv/stream/' + name }, source: { name: 'Source' } }] });
context.mobileRemoteCommand({ action: 'playMultiview', channels: JSON.stringify([channel('TF1'), { name: 'Malformed', _entries: [null] }, channel('M6')]) });
assert.deepEqual(Array.from(launched.at(-1), item => item.key), ['all:TF1', 'all:M6']);
assert.equal(context.playback, null);
context.multiviewRemoteState = { tiles: [{ title: 'TF1' }, { title: 'M6' }], audio: 0, featured: -1 };
context.mobileRemoteCommand({ action: 'multiAdd', channel: JSON.stringify(channel('Arte')) });
await new Promise(resolve => setImmediate(resolve));
assert.equal(commands.at(-1).args.command, 'add');
assert.equal(commands.at(-1).args.item.title, 'Arte');
context.mobileRemoteCommand({ action: 'multiSolo', value: '1.0' });
assert.deepEqual([commands.at(-1).name, commands.at(-1).args.command, commands.at(-1).args.index], ['multiviewCommand', 'solo', 1]);
context.mobileRemoteCommand({ action: 'multiAudio', value: '0' });
assert.equal(commands.at(-1).args.command, 'audio');
context.mobileRemoteCommand({ action: 'multiRemove', value: '99' });
assert.equal(commands.at(-1).args.command, 'audio', 'index hors limites ignoré');
context.mobileRemoteCommand({ action: 'multiGrid' });
assert.equal(commands.at(-1).args.command, 'grid');
context.mobileRemoteCommand({ action: 'state', replyTo: id, targetId: target });
const multiState = JSON.parse(replies.at(-1).body.Arguments.state);
assert.equal(multiState.title, 'Multiview · 2 chaînes');
assert.deepEqual(multiState.multiview.tiles.map(tile => tile.title), ['TF1', 'M6']);
context.mobileRemoteCommand({ action: 'stop' });
assert.equal(commands.at(-1).args.command, 'close', 'Arrêter ferme le multiview');
console.log('Télécommande TV : état existant, diffusion, zapping, pause, arrêt et validation vérifiés.');
console.log('Télécommande TV : multiview lancé, complété et piloté depuis le téléphone vérifiés.');
