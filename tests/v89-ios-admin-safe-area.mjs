import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes('function mobileAdminSafeTop()'), 'La zone sûre admin doit être mesurée côté client.');
assert.ok(shell.includes('viewport-fit=cover'), 'Le viewport admin doit forcer viewport-fit=cover sur iOS.');
assert.ok(shell.includes("--noctra-admin-safe-top"), 'La zone sûre mesurée doit être publiée en variable CSS.');
assert.ok(shell.includes('fallback = appleTouch') && shell.includes('? 44 : 0'), 'Un fallback iPhone doit couvrir les premières frames où WebKit renvoie 0.');
assert.ok(css.includes('/* Noctra v89 — zone sûre iPhone'), 'Le bloc CSS v89 doit exister.');
assert.ok(css.includes('body.noctra-dashboard .MuiAppBar-root') && css.includes('padding-top: var(--noctra-admin-safe-top-effective'), 'L’AppBar MUI doit descendre sous la zone statut.');
assert.ok(css.includes('body.noctra-dashboard .skinHeader .headerTop') && css.includes('padding-top: 0 !important;'), 'Le safe-area ne doit pas être appliqué deux fois sur le header legacy.');
assert.ok(css.includes('.mainAnimatedPage:not(.hide)') && css.includes('top: 0 !important;'), 'Le top desktop résiduel des pages admin doit être supprimé.');
assert.ok(css.includes('--noctra-admin-header-bottom') && css.includes('+ 10px'), 'Le contenu doit démarrer juste sous le bord réel du header.');
console.log('Safe-area Dashboard / Utilisateurs iOS Noctra v89 : OK');
