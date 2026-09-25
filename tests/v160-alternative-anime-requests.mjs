import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(sw.includes('noctra-shell-v200-r15'));
assert.ok(server.includes("version: '200.0.21'"));

assert.ok(server.includes('function halouleDirectSportLabelAllowed'), 'Alternative doit avoir une whitelist Sport 24/24.');
assert.ok(server.includes('1\\.2\\)\\s*Meilleurs sites de streaming live tv'), 'Alternative doit couper avant la section sites/apps.');
assert.ok(server.includes('if (!halouleDirectSportLabelAllowed(label)) continue;'), 'Alternative ne doit garder que les liens sportifs directs demandés.');
assert.ok(server.includes("channels.sort((left, right) => left.name.localeCompare(right.name, 'fr'"), 'Alternative doit trier les chaînes par ordre alphabétique.');
assert.ok(server.includes('noSandbox: true'), 'Les liens Alternative directs doivent demander un iframe non sandboxé.');
assert.ok(shell.includes("channel?.noSandbox || channel?.provider === 'Alternative'"), 'Le lecteur Alternative doit enlever le sandbox externe.');
assert.ok(server.includes('id="noctraAltClickShield" hidden'), 'Alternative doit laisser les clics actifs par défaut.');
assert.ok(server.includes('Clics actifs'), 'Alternative doit afficher que les clics sont actifs par défaut.');
assert.ok(server.includes('Anti-popup dur'), 'Alternative doit garder un mode anti-popup dur activable.');
assert.ok(server.includes('.frame,.frame iframe{position:fixed;inset:0'), 'Alternative doit afficher le lecteur sans bandes internes.');
assert.equal(server.includes('<div class="bar">'), false, 'Alternative ne doit plus avoir de barre haute permanente dans le lecteur.');
assert.equal(server.includes('<div class="hint">'), false, 'Alternative ne doit plus avoir de bande basse permanente dans le lecteur.');

assert.equal(server.includes('sort=created'), false, 'Jellyseerr ne doit plus utiliser le tri created refusé par certaines API.');
assert.ok(/\/api\/v1\/request\?[^'"]*sort=added/.test(server), 'Les demandes Jellyseerr doivent utiliser le tri added.');
assert.ok(server.includes('sort=displayname'), 'La liste utilisateurs Jellyseerr doit utiliser displayname en minuscules.');

assert.ok(shell.includes('visual.dataset.noctraLibraryTitle = label'), 'Mes médias doit recopier le titre sur l’image.');
assert.match(theme, /cardImageContainer\[data-noctra-library-title\]::after \{[\s\S]*?content:\s*none !important;[\s\S]*?display:\s*none !important;/, 'Le titre ne doit pas être dupliqué sur les images Mes médias.');

assert.ok(theme.includes("@font-face"), 'Le thème doit déclarer la police d’icônes locale.');
assert.ok(theme.includes('MaterialIcons-Regular.2d8017489da689caedc1.woff2'), 'La police Material Icons locale doit être référencée.');
assert.equal(theme.includes("url('/web/"), false, 'La police ne doit pas pointer hors du préfixe Noctra.');
assert.ok(theme.includes("font-feature-settings: 'liga'"), 'Les ligatures Material Icons doivent être activées.');

assert.ok(server.includes('function sortTvChannelsAlphabetically'), 'Tous les catalogues TV doivent passer par un tri alphabétique commun.');
assert.ok(server.includes('const sortedChannels = sortTvChannelsAlphabetically(catalog.channels, source)'), 'Le tri alphabétique doit être appliqué juste avant la réponse catalogue avec le contexte du fournisseur.');
assert.ok(shell.includes('WiTV · flux direct indisponible · ouverture du lecteur web…'), 'WiTV doit essayer son lecteur web si le direct ne fournit aucun média.');
assert.ok(shell.includes('WiTV · lecteur chargé · démarrage du média…'), 'WiTV ne doit pas déclarer une iframe en lecture avant le démarrage réel du média.');
assert.ok(theme.includes('transform: translate(-50%, -50%) !important;'), 'Le logo de démarrage doit être recentré.');

console.log('v160 Alternative/Animes/demandes checks: OK');
