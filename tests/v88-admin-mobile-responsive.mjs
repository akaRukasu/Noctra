import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21', 'Le paquet doit annoncer la v88.');
assert.ok(shell.includes('function syncMobileAdminLayout()'), 'Le shell doit mesurer le layout admin mobile.');
assert.ok(shell.includes('--noctra-admin-header-bottom'), 'La hauteur réelle du header admin doit être exposée au CSS.');
assert.ok(shell.includes('--noctra-admin-viewport-height'), 'La hauteur VisualViewport doit être exposée au CSS.');
assert.ok(shell.includes("window.visualViewport?.addEventListener('resize', syncMobileAdminLayout"), 'Le layout doit suivre les variations de viewport iOS.');
assert.ok(shell.includes("document.body.dataset.noctraAdminPage = pageKind"), 'Le shell doit distinguer Dashboard / Utilisateurs / autres pages admin.');

const start = css.indexOf('/* Noctra v88 — Dashboard / Utilisateurs');
assert.ok(start >= 0, 'Le bloc responsive v88 doit exister.');
const mobile = css.slice(start);
assert.ok(mobile.includes('height: var(--noctra-admin-viewport-height, 100dvh) !important'), 'Dashboard/Utilisateurs doivent utiliser la hauteur visuelle réelle.');
assert.ok(mobile.includes('calc(var(--noctra-admin-header-bottom, 64px) + 10px)'), 'Le contenu doit démarrer sous le vrai header, pas sous un padding fixe arbitraire.');
assert.ok(mobile.includes('padding-bottom: var(--noctra-admin-bottom) !important'), 'Le bas de page ne doit plus réserver artificiellement la hauteur du dock masqué.');
assert.ok(mobile.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important'), 'Les actions Dashboard doivent passer sur une grille mobile lisible.');
assert.ok(mobile.includes('grid-column: 1 / -1 !important'), 'L’action principale Dashboard doit pouvoir occuper toute la ligne.');
assert.ok(mobile.includes('flex-direction: column !important') && mobile.includes('.localUsers'), 'La liste Utilisateurs doit devenir une vraie liste verticale.');
assert.ok(mobile.includes('grid-template-columns: 62px minmax(0, 1fr) !important'), 'Les utilisateurs doivent utiliser une ligne avatar + infos compacte.');
assert.ok(shell.includes('data-noctra="users" data-admin-dock'), 'Le bouton Utilisateurs doit rester dans le dock administrateur.');
assert.ok(!shell.includes('noctra-users-shortcut'), 'Aucun raccourci Utilisateurs flottant ne doit chevaucher les pages admin mobile.');

console.log('Responsive Dashboard / Utilisateurs Noctra v88 : OK');
