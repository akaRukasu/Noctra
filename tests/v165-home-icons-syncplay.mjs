import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell = fs.readFileSync('public/noctra-shell.js', 'utf8');
const theme = fs.readFileSync('public/noctra-theme.css', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const sw = fs.readFileSync('public/noctra-sw.js', 'utf8');

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(shell.includes('function cssBackgroundUrl(value)'), 'Le shell doit lire les images Jellyfin posees en background CSS.');
assert.ok(shell.includes('function applyHomeLibraryCardImage(card, visual)'), 'Les cartes Mes medias doivent reutiliser les images chargees tardivement.');
assert.ok(shell.includes("visual.dataset.noctraLibraryImage = 'true'"), 'Les cartes de mediatheque doivent marquer les images restaurees.');
assert.ok(shell.includes('missingLibraryImages === 0'), 'Le scan accueil doit retenter tant que les images Mes medias ne sont pas presentes.');

assert.ok(shell.includes('function repairScrollArrowButtons(root = document)'), 'Les fleches de carousel doivent etre reparees sans police Material.');
assert.ok(shell.includes("next: '<svg viewBox=\"0 0 24 24\"><path d=\"m9.5 5 7 7-7 7\"/></svg>'"), 'Une icone fleche droite Noctra doit exister.');
assert.ok(shell.includes('function repairHeaderMenuIcons(root = document, fallbackKind = \'\')'), 'Les menus Cast/SyncPlay doivent reparer leurs icones apres ouverture.');
assert.ok(shell.includes('repairHeaderMenuIcons(menu, kind)'), 'La decoration des menus doit etre appliquee pendant la detection Cast/SyncPlay.');
assert.ok(shell.includes('window.setTimeout(settleHeaderMenu, 90)'), 'Les menus animes doivent etre rescannes apres ouverture.');
assert.ok(shell.includes("window.addEventListener('pageshow', () => { syncAuthContext(true); verifyNoctraBuild(); repairHeaderIconButtons(); repairScrollArrowButtons(); repairHeaderMenuIcons(); repairMaterialIconFallbacks(); repairAuthenticatedViewState(); }"), 'Les reparations doivent etre rejouees aussi au retour mobile/page cachee.');

assert.ok(theme.includes('.noctra-scroll-icon-fixed > svg[data-noctra-scroll-icon]'), 'Le theme doit afficher les fleches SVG reparees.');
assert.ok(theme.includes('.noctra-menu-icon-fixed > svg[data-noctra-menu-icon]'), 'Le theme doit afficher les icones des menus Cast/SyncPlay.');
assert.ok(theme.includes('background-size: cover !important;'), 'Les vignettes Mes medias doivent couvrir toute la carte.');
