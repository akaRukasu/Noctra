import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '200.0.21');
assert.ok(shell.includes("NOCTRA_BUILD_VERSION = '200.0.21'"));
assert.ok(server.includes("version: '200.0.21'"));

const block = (a, b) => {
  const i = shell.indexOf(a);
  const j = shell.indexOf(b, i + a.length);
  assert.ok(i >= 0 && j > i, `Bloc introuvable: ${a}`);
  return shell.slice(i, j);
};
const hash = text => createHash('sha256').update(text).digest('hex');

const workspace = block('  function renderTvWorkspace', '\n  function tvChannelStableIdentity');
assert.ok(workspace.includes('NOCTRA · TV EN DIRECT'));
assert.ok(!/TV EN DIRECT · v\d+/i.test(workspace), 'Le numéro de version ne doit plus apparaître dans l’en-tête TV.');
assert.ok(workspace.includes('class="noctra-tv-screen-tools"') && workspace.includes('data-tv-safe-tools-launcher'), 'Le lanceur isolé doit être intégré à la barre du lecteur sans embarquer le menu.');
assert.ok(!workspace.includes('data-tv-safe-tools-menu'));
assert.ok(!workspace.includes('data-tv-safe-multi'));

const hashBlock = (a, b) => hash(block(a, b));
assert.equal(hashBlock('  async function playTvDirectStream', '\n  async function playTvResolvedOption'), 'ebae0b42cbe4f65194acf61db2d2c60ad792b121869a69bddf6650e4dd9848be'); // v200 : reprise du même serveur StreamSports99 après huit secondes.
assert.equal(hashBlock('function playTvEmbedUrl', 'function resetTvQualitySelector'), '72d6188065c6b80caea3cb2169498b1220e1ba84d478dcb189f49f66072ca3c9'); // v198 : VIP explicite et lecteur public conservé comme choix manuel.
assert.equal(hashBlock('async function playTvResolvedOption', 'async function resolveAndPlayTvChannel'), 'f2ee57807c10bc3d2eb16ecc68373fc0f872381ae59f7c2463098375c7a216d9');
const resolverBlock = block('async function resolveAndPlayTvChannel', 'function updateTvCastButton');
assert.ok(resolverBlock.includes('void ensureHlsLibrary().catch(() => undefined)'), 'Le préchargement HLS parallèle doit rester présent.');
assert.equal(resolverBlock.includes('const firstWeb = options.findIndex'), false, 'WiTV doit sélectionner le HLS par défaut.');

const extras = block('  /* V100 — TV extras isolated', '\n\n  async function playTvDirectStream');
assert.ok(extras.includes('suspendTvSafeMainPlaybackForMulti'));
assert.ok(extras.includes('tvHls.stopLoad()'));
assert.ok(extras.includes('tvHls.startLoad(-1)'));
assert.ok(!extras.includes('currentTime ='));
assert.ok(!extras.includes('resolveAndPlayTvChannel('), 'Le Multiview ne doit pas rerésoudre/changer la chaîne principale.');
assert.ok(extras.includes('data-tv-safe-status-hud'));
assert.ok(theme.includes('.noctra-tv-safe-status-hud'));
assert.ok(theme.includes('.noctra-tv-safe-tools-menu'));
assert.ok(theme.includes('.noctra-tv-safe-multiview'));

console.log('TV v94 protégée + extras v100 isolés : OK');
