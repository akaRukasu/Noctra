#!/usr/bin/env node
/* Génère apps/androidtv/web/tv-data.js : données fixes de la TV en direct.
   - logos : noms des logos français de la collection libre tv-logo/tv-logos
     (images servies par jsDelivr ou raw.githubusercontent.com) ;
   - foreign : chaînes francophones d'autres pays (Afrique, Belgique, Suisse,
     Québec, Maghreb…), d'après la base libre iptv-org/database, pour qu'elles
     ne soient pas classées parmi les chaînes françaises.
   Les clés sont calculées avec les règles de noms de app.js (unifiedName) :
   à relancer si ces règles changent.

   Usage : node apps/scripts/tv-data.mjs */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'androidtv', 'web');
const app = await readFile(join(webRoot, 'app.js'), 'utf8');
// Règles de noms de app.js (normalize, cleanChannelName, unifiedName…).
const rules = app.slice(app.indexOf('  function normalize(value)'), app.indexOf('  // ── Guide des programmes'))
  + app.slice(app.indexOf('  var COUNTRY_CODES = '), app.indexOf('  function playable(channel)'));
const { unifiedName } = new Function('var TV_DATA = {};\n' + rules + '\nreturn { unifiedName: unifiedName };')();

async function text(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} : ${response.status}`);
  return response.text();
}
function parseCsv(content) {
  const lines = content.split('\n').filter(Boolean);
  const head = lines.shift().split(',');
  return lines.map(line => {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (const character of line) {
      if (character === '"') quoted = !quoted;
      else if (character === ',' && !quoted) { cells.push(cell); cell = ''; }
      else cell += character;
    }
    cells.push(cell);
    return Object.fromEntries(head.map((name, index) => [name, (cells[index] || '').trim()]));
  });
}

// 1. Logos français de tv-logos (liste des fichiers du dépôt).
const clone = await mkdtemp(join(tmpdir(), 'tv-logos-'));
let logos;
try {
  execFileSync('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout', 'https://github.com/tv-logo/tv-logos.git', clone], { stdio: 'inherit' });
  logos = execFileSync('git', ['-C', clone, 'ls-tree', '-r', '--name-only', 'HEAD', 'countries/france'], { encoding: 'utf8' })
    .split('\n').filter(name => /-fr\.png$/.test(name)).map(name => name.replace('countries/france/', '').replace(/-fr\.png$/, ''));
} finally {
  await rm(clone, { recursive: true, force: true });
}
// Logos ordinaires d'abord (les versions « hd/ » ne servent qu'à défaut).
logos.sort((a, b) => (a.startsWith('hd/') - b.startsWith('hd/')) || a.localeCompare(b));
const logoKey = name => unifiedName(name.replace(/^hd\//, '').replace(/-french$/, '').replace(/-/g, ' '));

// 2. Chaînes francophones hors de France (iptv-org).
const base = 'https://raw.githubusercontent.com/iptv-org/database/master/data/';
const channels = parseCsv(await text(base + 'channels.csv'));
const feeds = parseCsv(await text(base + 'feeds.csv'));
const languages = {};
for (const feed of feeds) for (const language of feed.languages.split(';')) (languages[feed.channel] ||= new Set()).add(language);
// France et outre-mer : chaînes françaises.
const FRANCE = new Set(['FR', 'MQ', 'GP', 'RE', 'GF', 'YT', 'NC', 'PF', 'PM', 'WF', 'BL', 'MF']);
// Pays francophones dont les chaînes locales se glissent dans les listes « FR »
// (les réseaux internationaux, américains ou britanniques, gardent leur version française).
const AFRICA = ['CD', 'SN', 'CM', 'CI', 'BJ', 'ML', 'GN', 'TG', 'BF', 'MG', 'CG', 'GA', 'NE', 'BI', 'TD', 'MR', 'MU', 'SC', 'DJ', 'KM', 'CF', 'RW', 'GQ'];
const COUNTRY = { CA: 'ca', BE: 'be', CH: 'ch', LU: 'lu', MC: 'mc', HT: 'ht', MA: 'ma', DZ: 'dz', TN: 'tn' };
for (const code of AFRICA) COUNTRY[code] = 'afrique';
// Noms trop courants pour désigner une seule chaîne.
const GENERIC = new Set(['info', 'infos', 'nationale', 'national', 'sport', 'sports', 'music', 'musique', 'cinema', 'cinemax', 'series', 'movies', 'kids', 'news', 'direct', 'television', 'tele']);
const names = channel => [channel.name, ...channel.alt_names.split(';')].filter(Boolean);
const french = new Set(logos.map(logoKey));
for (const channel of channels) if (FRANCE.has(channel.country)) for (const name of names(channel)) french.add(unifiedName(name));
const foreign = {};
for (const channel of channels) {
  const country = COUNTRY[channel.country];
  if (!country || channel.closed || channel.is_nsfw === 'TRUE' || !languages[channel.id]?.has('fra')) continue;
  for (const name of names(channel)) {
    const key = unifiedName(name);
    if (key.length >= 5 && !GENERIC.has(key) && !/^\d+$/.test(key) && !french.has(key)) (foreign[country] ||= new Set()).add(key);
  }
}
const data = {
  logos: logos.join(' '),
  foreign: Object.fromEntries(Object.keys(foreign).sort().map(country => [country, [...foreign[country]].sort().join(' ')]))
};
const count = Object.values(foreign).reduce((total, set) => total + set.size, 0);
await writeFile(join(webRoot, 'tv-data.js'),
  '/* Généré par apps/scripts/tv-data.mjs : ne pas modifier à la main.\n'
  + '   Logos : tv-logo/tv-logos. Chaînes francophones hors de France : iptv-org/database. */\n'
  + 'var TV_DATA = ' + JSON.stringify(data) + ';\n');
console.log(`tv-data.js : ${logos.length} logos, ${count} chaînes francophones hors de France.`);
