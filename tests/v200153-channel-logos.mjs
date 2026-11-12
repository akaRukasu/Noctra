import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// 200.0.153 : logos des chaînes. Second référentiel (tv-logo/tv-logos, PNG), famille des
// chaînes numérotées (« C+Live 11 », « AMAZON PRIME 3 ») et logo de secours essayé par le
// serveur, pour le site comme pour les applis (une seule adresse de logo par chaîne).
const server = (await readFile(new URL('../server.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
function between(a, b) { const start = server.indexOf(a), end = server.indexOf(b, start + a.length); assert(start >= 0 && end > start, a); return server.slice(start, end); }
const code = [
  between('function normalizedIdentifier(', '\n}\n') + '\n}\n',
  between('function tvLogoIdentityKeys(', 'function tvLogoChannelIdKey('),
  between('function tvLogoChannelIdKey(', 'function shareTvLogosAcrossDuplicateNames('),
  between('// 200.0.153 : second référentiel de logos', 'async function iptvOrgProgramme(')
].join('\n');
const R = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/';
const paths = ['countries/france/canal-plus-fr.png', 'countries/france/canal-plus-sport-fr.png', 'countries/france/hd/canal-plus-sport-hd-fr.png',
  'countries/france/rmc-sport-live-5-fr.png', 'countries/france/ligue-1plus-2-fr.png', 'countries/france/bein-sports-1-french-fr.png',
  'countries/belgium/dazn-1-fr-be.png', 'countries/united-states/canal-plus-us.png', 'countries/germany/a-tv-de.png', 'countries/france/0_all_logos_mosaic.md'];
let requests = 0;
const context = {
  console: { warn() {} }, Date, Map, Set, URL, JSON, Number, String, Array, Promise, Error, encodeURIComponent, AbortSignal,
  join: (...parts) => parts.join('/'), runtimeRoot: '/tmp/noctra-test',
  readFile: async () => { throw new Error('absent'); }, writeFile: async () => undefined, mkdir: async () => undefined,
  fetchTvRemote: async url => { requests += 1; assert.match(url, /api\.github\.com\/repos\/tv-logo\/tv-logos\/git\/trees\/main\?recursive=1/); return { ok: true, json: async () => ({ tree: paths.map(path => ({ type: 'blob', path })) }) }; },
  iptvOrgLogoIndex: async () => ({ map: new Map([['m6', { logo: 'https://iptv-org.example/m6.png', channelId: 'M6.fr', name: 'M6', country: 'FR' }]]) }),
  iptvOrgLogoCache: { schemaVersion: 3 }, tvLogoIndexSchemaVersion: 3
};
vm.createContext(context);
vm.runInContext(code + '\nglobalThis.api = { enrichTvLogosFromIptvOrg, tvLogosRepoEntry, tvLogoFamilyNames };', context);
const { enrichTvLogosFromIptvOrg, tvLogosRepoEntry, tvLogoFamilyNames } = context.api;

assert.deepEqual([...tvLogosRepoEntry('countries/france/ligue-1plus-2-fr.png').names], ['ligue 1+ 2', 'ligue 1plus 2']);
assert.deepEqual([...tvLogosRepoEntry('countries/belgium/dazn-1-fr-be.png').names], ['dazn 1']);
assert.equal(tvLogosRepoEntry('countries/france/0_all_logos_mosaic.md'), null);
assert.deepEqual([...tvLogoFamilyNames('C+Live 11')], ['C+Live', 'Canal+']);
assert.deepEqual([...tvLogoFamilyNames('AMAZON PRIME 3')], ['AMAZON PRIME', 'Prime Video']);
assert.deepEqual([...tvLogoFamilyNames('France')], []);

const names = ['A+', 'RMC Sport Live 5', 'Canal+ Sport', 'C+Live 11', 'Ligue 1+ 2', 'beIN SPORTS 1 France', 'DAZN 1', 'A LA CARTE 10', 'M6'];
const out = await enrichTvLogosFromIptvOrg(names.map(name => ({ name, logo: '' })));
const logo = name => out.find(channel => channel.name === name).logo;
assert.equal(logo('RMC Sport Live 5'), R + 'france/rmc-sport-live-5-fr.png');
assert.equal(logo('Canal+ Sport'), R + 'france/canal-plus-sport-fr.png', 'logo français, pas la variante HD ni un homonyme étranger');
assert.equal(logo('C+Live 11'), R + 'france/canal-plus-fr.png', 'famille C+Live : logo Canal+');
assert.equal(logo('Ligue 1+ 2'), R + 'france/ligue-1plus-2-fr.png');
assert.equal(logo('beIN SPORTS 1 France'), R + 'france/bein-sports-1-french-fr.png');
assert.equal(logo('DAZN 1'), R + 'belgium/dazn-1-fr-be.png');
assert.equal(logo('A LA CARTE 10'), '', 'aucun logo connu : remplacement à initiales');
assert.equal(logo('A+'), '', 'pas de logo pour une clé d\'une lettre (« a-tv » allemand)');
assert.equal(logo('M6'), 'https://iptv-org.example/m6.png', 'iptv-org garde la priorité');

const [kept] = await enrichTvLogosFromIptvOrg([{ name: 'RMC Sport Live 5', logo: 'https://source.example/rmc.png' }]);
assert.equal(kept.logo, 'https://source.example/rmc.png', 'logo de la source gardé');
assert.equal(kept.secondaryLogo, R + 'france/rmc-sport-live-5-fr.png', 'référentiel en secours');
const [fresh] = await enrichTvLogosFromIptvOrg([{ name: 'RMC Sport Live 5', logo: 'https://source.example/rmc.png' }], true);
assert.deepEqual([fresh.logo, fresh.secondaryLogo], [R + 'france/rmc-sport-live-5-fr.png', 'https://source.example/rmc.png'], 'source peu fiable : référentiel devant');
assert.equal(requests, 1, 'liste téléchargée une fois puis gardée');

// Logo de secours essayé par le serveur : les applis n'ont qu'une adresse de logo.
assert.match(server, /logo: tvPublicImageUrl\(item\.logo, item\.secondaryLogo \? '' : item\.name, item\.secondaryLogo\)/);
assert.match(server, /\.\.\.\(alternate && alternate !== normalized \? \{ a: alternate \} : \{\}\)/);
assert.match(server, /if \(payload\?\.a\) alternate = safeTvRemoteUrl\(String\(payload\.a\)\)\.toString\(\)/);
assert.match(server, /if \(reference\.alternate\) \{[\s\S]*?fetchTvLogoAsset\(\{ \.\.\.reference, headers: \{ \.\.\.reference\.headers, referer: `\$\{origin\}\/` \} \}, reference\.alternate\)/);
console.log('200.0.153 logos des chaînes (tv-logos, familles, logo de secours) : OK');
