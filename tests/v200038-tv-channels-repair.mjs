import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');

assert.match(server, /const remoteRoute = `\$\{page\.pathname \|\| '\/'\}/,
  'Le bridge VIP doit restaurer /embed/<id> pour le routeur React LiveWatch principal.');
assert.ok(server.includes('refreshLiveWatchChannelReference'),
  'Un identifiant LiveWatch mis en cache doit être remappé vers le catalogue courant au clic.');
assert.ok(server.includes("name=${encodeURIComponent(channel.name || '')}"),
  'Le resolver LiveWatch doit recevoir le nom stable de la chaîne pour réparer un ID opaque expiré.');

assert.ok(server.includes("resolverUrl: publicPath(`/api/tv/fstv/resolve/${token}`)"),
  'FSTV doit résoudre son /live.php courant au clic, pas ouvrir un ancien iframe.');
assert.ok(server.includes('async function resolveFstvPageReference') && server.includes("label: 'FSTV · direct vérifié'"),
  'Le HLS FSTV doit être sondé avant d’être rendu au lecteur.');

assert.ok(server.includes("url: 'https://kool.ws/live'") && server.includes("'/mediahubmx-catalog.json'") && server.includes("'/mediahubmx-resolve.json'"),
  'OHA doit utiliser la migration Kool et son protocole MediaHubMX actuel.');
assert.ok(server.includes("'185.254.196.78'") && server.includes("'oha.cx'"),
  'Kool doit conserver les replis IP et OHA historiques.');

const wiStart = server.indexOf('async function resolveWiTvPlayerOption');
const wiEnd = server.indexOf('function wiTvChannelIdentity', wiStart);
const wiResolver = server.slice(wiStart, wiEnd);
assert.ok(wiResolver.includes('Lecteur WiTV tiers') && !wiResolver.includes("playbackType: 'embed', host: item.host }"),
  'WiTV ne doit plus envoyer livehdtv/livehdtvs directement au navigateur.');
assert.ok(server.includes('const internalCandidates = candidates.filter(item => isWiTvPublicPlayer(item.url))'),
  'Le PlayerJS interne WiTV doit toujours être prioritaire.');

assert.ok(server.includes('payload?.stations || payload?.channels') && server.includes('group.stations || group.channels || group.items'),
  'Les playlists W3U/Wiseplay doivent accepter stations à la racine et dans les groupes.');
assert.ok(server.includes("raw.embed === true || raw.embed === 'true'") && server.includes('stream && !embed'),
  'embed:true doit transformer l’URL de station en lecteur web, jamais en URL littérale /true.');

const normalizeStart = server.indexOf('function normalizeTvChannel');
const normalizeEnd = server.indexOf('function parseM3uHeader', normalizeStart);
const normalizeTvChannel = new Function(
  'resolveTvUrl', 'issueTvReference', 'tvPublicStreamUrl', 'createHash',
  `${server.slice(normalizeStart, normalizeEnd)}; return normalizeTvChannel;`
)(
  (value, base) => new URL(String(value), base).toString(),
  () => 'stream-ref',
  token => `/api/tv/stream/${token}`,
  createHash
);
const hosted = normalizeTvChannel({ name: 'Chaîne hébergée', url: 'https://player.example/embed/1', embed: true }, 'https://catalog.example/list.json');
assert.equal(hosted.playbackType, 'embed');
assert.equal(hosted.embedUrl, 'https://player.example/embed/1');
assert.notEqual(hosted.embedUrl, 'https://catalog.example/true');

const jsonStart = server.indexOf('function parseJsonTvCatalog');
const jsonEnd = server.indexOf('function decodeXmlText', jsonStart);
const parseJsonTvCatalog = new Function(
  'parseLiveWatchCatalog', 'normalizeTvChannel', 'resolveTvUrl', 'issueTvReference', 'createHash',
  `${server.slice(jsonStart, jsonEnd)}; return parseJsonTvCatalog;`
)(
  () => ({ channels: [] }),
  normalizeTvChannel,
  (value, base) => new URL(String(value), base).toString(),
  () => 'catalog-ref',
  createHash
);
const wiseplay = parseJsonTvCatalog({
  name: 'Wiseplay test',
  groups: [{ name: 'France', stations: [{ name: 'TF1', url: '/tf1/player', embed: true }] }]
}, 'https://catalog.example/root.json');
assert.equal(wiseplay.channels.length, 1);
assert.equal(wiseplay.channels[0].group, 'France');
assert.equal(wiseplay.channels[0].embedUrl, 'https://catalog.example/tf1/player');

assert.match(shell, /Nom \(facultatif\)/,
  'Mes sources doit accepter une URL seule et déduire son nom.');
assert.ok(shell.includes('data-tv-delete-source'),
  'Chaque source personnelle doit rester supprimable.');

console.log('Réparation Chaînes Noctra v200.0.38 : OK');
