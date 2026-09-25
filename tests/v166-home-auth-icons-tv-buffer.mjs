import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell = fs.readFileSync('public/noctra-shell.js', 'utf8');
const theme = fs.readFileSync('public/noctra-theme.css', 'utf8');
const index = fs.readFileSync('public/client/index.html', 'utf8');
const sw = fs.readFileSync('public/noctra-sw.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(index.includes('noctra-shell.js?v=200.21'));
assert.ok(index.includes('noctra-theme.css?v=200.21'));
assert.ok(sw.includes('noctra-shell-v200-r15'));

assert.ok(shell.includes('function findHomeLibrarySection(home, sectionTitles)'), 'Mes medias doit avoir une detection de secours independante du titre exact.');
assert.ok(shell.includes("visual.style.setProperty('background-image'"), 'Les images Jellyfin doivent gagner contre une regle CSS importante eventuelle.');
assert.ok(shell.includes("mediaSection.querySelectorAll('.card')"), 'Toutes les structures de cartes de la section doivent etre prises en charge.');
assert.ok(shell.includes('attempt < 14'), 'Le chargement différé doit être retenté sans scanner la page pendant huit secondes.');
assert.ok(shell.includes('attempt === 0 && homeEnhanceTimer'), 'Les mutations rapprochées doivent être regroupées sur desktop.');

assert.ok(shell.includes('function repairMaterialIconFallbacks(root = document)'), 'Les icones critiques doivent disposer de SVG locaux.');
assert.ok(shell.includes("const selector = '.material-icons, .material-icons-round"), 'Les actions des affiches doivent etre reparees sans dépendre de leur structure.');
assert.ok(shell.includes('materialIconFallback(element)'), 'Les icones de profil et reglages doivent etre reparees.');
assert.ok(theme.includes('[data-noctra-material-hidden="true"]'), 'Les carres de la police defaillante doivent etre masques.');
assert.ok(theme.includes('svg[data-noctra-material-icon]'), 'Les remplacements SVG doivent etre visibles.');

assert.ok(shell.includes(".sectionTitleTextButton.noctra-scroll-icon-fixed"), 'Les anciennes fleches parasites doivent etre nettoyees.');
assert.ok(shell.includes("'.emby-scrollbuttons .emby-scrollbuttons-button, .emby-scrollbuttons .scrollbutton'"), 'Seuls les vrais boutons du carousel doivent recevoir une fleche.');
assert.ok(!shell.includes("root.querySelectorAll?.('.emby-scrollbuttons-button, .scrollbutton, .sectionTitleTextButton')"), 'Le titre de ligne ne doit plus etre traite comme une fleche de carousel.');

assert.ok(shell.includes('function repairAuthenticatedViewState()'), 'Le portail de connexion residuel doit etre detecte.');
assert.ok(shell.includes('noctra-stale-auth-portal'), 'Le portail residuel doit recevoir un etat explicite.');
assert.ok(theme.includes('#loginPage.noctra-stale-auth-portal'), 'Le portail residuel authentifie doit etre masque visuellement.');
assert.ok(shell.includes('hasJellyfinIdentity'), 'Une vraie identite Jellyfin doit etre exigee avant de masquer le portail.');

assert.ok(shell.includes('const desktop = !appleConservative'), 'Le profil reseau doit distinguer le poste desktop du mobile.');
assert.ok(shell.includes("!desktop && (effectiveType === '3g'"), 'Une estimation 3G du serveur distant ne doit pas degrader un poste RJ45.');
assert.ok(shell.includes('const startupBufferGoal = networkProfile.weak ? 12 : (stabilitySensitiveStream ? 10 : 8)'), 'Le direct doit attendre un tampon de démarrage mesuré et renforcé pour les fournisseurs sensibles.');
assert.ok(shell.includes("recordTvDiagnostic('hls-startup-buffer-ready'"), 'Le diagnostic doit enregistrer le tampon obtenu avant lecture.');
assert.ok(shell.includes("'Source momentanément irrégulière · mise en mémoire…'"), 'Une source distante irreguliere ne doit plus etre presentee comme une mauvaise connexion locale.');

assert.ok(theme.includes('sous-pages plein écran, dock permanent'), 'Les sous-pages doivent occuper tout le viewport.');
assert.ok(theme.includes('body.noctra-panel-open:not(.noctra-playing) #noctra-dock'), 'Le dock doit rester visible au-dessus des sous-pages.');
assert.ok(theme.includes('padding-bottom: calc(92px + env(safe-area-inset-bottom))'), 'Le dock mobile doit disposer de sa reserve d espace.');

assert.ok(shell.includes("TV_FAVORITES_STORAGE_KEY = 'noctra-tv-favorites-v1'"), 'Les favoris TV doivent persister localement.');
assert.ok(shell.includes("favorites: 'Favoris'"), 'Le centre TV doit exposer la vue Favoris commune aux sources.');
assert.ok(shell.includes('async function openTvFavorite(key)'), 'Un favori doit rouvrir sa source avant lecture.');
assert.ok(shell.includes("localeCompare(String(b.channel?.name || ''), 'fr'"), 'Les chaînes de chaque source doivent être triees alphabetiquement.');
assert.ok(theme.includes('.noctra-tv-favorites-grid'), 'Les favoris doivent avoir un rendu responsive dedie.');

assert.ok(shell.includes('function scheduleTvDesktopControlsHide(delay = 800)'), 'La barre du direct doit se masquer rapidement.');
assert.ok(!theme.includes('body:not(.noctra-tv-native-fullscreen):not(.noctra-tv-pseudo-fullscreen)'), 'Le petit lecteur ne doit plus forcer la barre a rester affichee.');

assert.ok(shell.includes("playbackType: streamUrl ? 'stream' : 'embed'"), 'Le multiview doit accepter les flux directs et les lecteurs web compatibles.');
assert.ok(shell.includes('data-tv-safe-multi-frame'), 'Le multiview doit disposer de cases web isolees.');
assert.ok(shell.includes("mainEmbedSrc: ''"), 'Le lecteur web principal doit etre suspendu pendant la mosaïque.');
assert.ok(shell.includes('const mobileColumns = 1'), 'Le multiview mobile doit rester lisible en portrait.');

console.log('Noctra v169 - accueil, icones, sous-pages, favoris et lecture TV : OK');
