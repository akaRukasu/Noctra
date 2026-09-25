import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const updater = await readFile(new URL('../ultra/update-noctra.sh', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const releaseKey = (await readFile(new URL('../ultra/.release-tmdb-key', import.meta.url), 'utf8').catch(() => '')).trim();
const publicFiles = [
  await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8'),
  await readFile(new URL('../public/client/index.html', import.meta.url), 'utf8'),
  await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8'),
  await readFile(new URL('../public/noctra.webmanifest', import.meta.url), 'utf8')
].join('\n');

if (releaseKey) {
  assert.match(releaseKey, /^[a-fA-F0-9]{32}$/, 'Une éventuelle clé TMDB de bootstrap doit être valide.');
  assert.equal(publicFiles.includes(releaseKey), false, 'La clé TMDB ne doit jamais être présente dans les assets servis au navigateur.');
} else {
  assert.ok(updater.includes('cp "$APP_DIR/.env" "$NEW_DIR/.env"'), 'La release Server Safe doit préserver le .env existant sans réembarquer la clé TMDB.');
}
assert.ok(updater.includes("RELEASE_TMDB_KEY_FILE=\"$NEW_DIR/ultra/.release-tmdb-key\""), 'L’updater doit lire la clé privée de release.');
assert.ok(updater.includes('TMDB_API_KEY=${RELEASE_TMDB_KEY}'), 'L’updater doit fusionner la clé dans le .env serveur.');
assert.ok(updater.includes('rm -f "$RELEASE_TMDB_KEY_FILE"'), 'Le secret de release doit être supprimé du dossier installé avant démarrage.');
assert.ok(server.includes("const releaseTmdbKeyPath = join(projectRoot, 'ultra', '.release-tmdb-key')"), 'Le serveur doit aussi pouvoir installer la clé lors d’un remplacement manuel des fichiers.');
assert.ok(server.includes('await unlink(releaseTmdbKeyPath)'), 'Le bootstrap serveur doit supprimer le secret de release après installation.');

assert.ok(server.includes("['smart', 'cinema', 'streaming', 'series', 'trending', 'gems']"), 'Discovery doit exposer la catégorie Pépites.');
assert.ok(server.includes("['precise', 'balanced', 'explore']"), 'Discovery doit proposer les trois niveaux de personnalisation.');
assert.ok(server.includes("source === 'quality'"), 'Le scoring doit reconnaître le signal qualité.');
assert.ok(server.includes('discoverySeedCache') && server.includes('6 * 60 * 60_000'), 'Les recommandations proches doivent être mises en cache plusieurs heures.');

const resultsStart = server.indexOf('async function discoveryResults');
const resultsEnd = server.indexOf('\nasync function ', resultsStart + 10);
const resultsSource = server.slice(resultsStart, resultsEnd > resultsStart ? resultsEnd : resultsStart + 9000);
assert.equal(resultsSource.includes('await enrichDiscoveryStatuses('), false, 'La réponse Discovery initiale ne doit plus attendre les statuts Seerr.');
assert.equal(resultsSource.includes('await enrichDiscoveryLegalPlatforms('), false, 'La réponse Discovery initiale ne doit plus attendre tous les fournisseurs légaux.');
assert.ok(server.includes("path === '/api/discovery/enrich' && req.method === 'POST'"), 'Une route d’enrichissement paresseux doit exister.');
assert.ok(server.includes('mapWithConcurrency(items, 8, discoveryStatusFor)'), 'L’enrichissement doit être parallélisé avec une concurrence bornée.');

assert.ok(shell.includes('function activateDiscoveryEnrichment'), 'Le client doit enrichir les cartes visibles à la demande.');
assert.ok(shell.includes("api('/api/discovery/enrich'"), 'Le client doit utiliser la route d’enrichissement paresseux.');
assert.ok(shell.includes('while (trackerWorkers < 3 && trackerWorkQueue.length)'), 'Les vérifications Prowlarr rapides doivent rester limitées à trois requêtes simultanées.');
assert.ok(shell.includes('const historyPromise = cachedApi'), 'L’historique des demandes doit démarrer en arrière-plan.');
assert.ok(shell.includes('const quick = await api(quickPath, { timeoutMs: 18_000 })') && shell.includes('void cachedApi(smartPath, 60_000'), 'Les tendances doivent s’afficher avant que la personnalisation soit enrichie en arrière-plan.');
assert.ok(shell.includes('Pourquoi cette suggestion ?'), 'Chaque recommandation doit pouvoir expliquer son score.');
assert.ok(shell.includes('Très fidèle à mes goûts') && shell.includes('Plus de découvertes'), 'Le choix du niveau de personnalisation doit être visible.');
assert.ok(shell.includes("['gems', 'Pépites']"), 'La navigation Discovery doit exposer les pépites.');

const observerStart = shell.indexOf('const observer = new MutationObserver');
const observerEnd = shell.indexOf('observer.observe', observerStart);
const observerBlock = shell.slice(observerStart, observerEnd + 400);
assert.ok(observerBlock.includes('mutationSyncTimer'), 'Les mutations DOM doivent être regroupées.');
assert.ok(shell.includes("observer.observe(document.querySelector('#reactRoot') || document.body, {\n      childList: true,\n      subtree: true\n    });"), 'Le watcher global doit se limiter aux ajouts/suppressions DOM, sans observer les attributs.');
assert.ok(shell.includes('const layoutRelevant = home || /(?:movies|tv|collections|favorites)/.test(route);'), 'Les réparations de grille doivent être limitées aux routes qui en ont besoin.');

assert.ok(css.includes('.noctra-discovery-why'), 'Le détail du raisonnement des suggestions doit être stylé.');
assert.ok(css.includes('.noctra-discovery-filters > .noctra-field:nth-of-type(4)') && shell.includes('data-discovery-mode'), 'Le sélecteur de personnalisation doit être responsive.');

console.log('Discovery / Demandes / performances Noctra v90 : OK');
