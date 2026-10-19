import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../apps/androidtv/web/app.js', import.meta.url), 'utf8');
const commands = [], replies = [], zaps = [];
const context = vm.createContext({
  playback: { channel: { name: 'beIN SPORTS 1' } }, vodPlayback: null,
  mobileRemoteState: { playing: true, positionMs: 12000, volume: 25 },
  native: (name, args) => { commands.push({ name, args }); return true; },
  jfJson: async (method, path, body) => { replies.push({ method, path, body }); },
  setTimeout: action => action(), zap: delta => zaps.push(delta),
  loadUnified: async () => ({ channels: [] }), unifiedName: name => name.toLowerCase(),
  epgPayload: () => ({}), launchChannel: channel => { context.playback = { channel }; }
});
vm.runInContext(source.slice(source.indexOf('  function mobileRemoteCommand(args)'), source.indexOf('  function remotePlaystate(data)')), context);
const id = 'a'.repeat(32), target = 'b'.repeat(32);
context.mobileRemoteCommand({ action: 'state', replyTo: '../admin', targetId: target });
assert.equal(commands.length, 0);
context.mobileRemoteCommand({ action: 'state', replyTo: id, targetId: target });
assert.equal(replies[0].path, `/Sessions/${id}/Command`);
assert.equal(replies[0].body.Name, 'PlayMediaSource');
assert.equal(replies[0].body.Arguments.NoctraRemoteState, '1');
assert.deepEqual(JSON.parse(replies[0].body.Arguments.state), { live: true, title: 'beIN SPORTS 1', playing: true, position: 12, volume: 25 });
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
console.log('Télécommande TV : état existant, diffusion, zapping, pause, arrêt et validation vérifiés.');
