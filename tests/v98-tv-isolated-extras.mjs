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

// Le workspace TV doit conserver les protections intégrées au lecteur courant.
const workspace = block('  function renderTvWorkspace', '\n  function tvChannelStableIdentity');
assert.equal(
  hash(workspace.replaceAll('v99', 'v94')),
  'c1056a1ba019993f34f8141c6f11134b44a78e39406e35591f3704835f57ed06'
);
assert.ok(workspace.includes('data-tv-safe-tools'));
assert.ok(!workspace.includes('data-tv-safe-multi'));
assert.ok(!workspace.includes('data-tv-safe-theater'));

// Les quatre blocs critiques du lecteur restent strictement ceux validés en v163.
const hashBlock = (a, b) => hash(block(a, b));
assert.equal(hashBlock('  async function playTvDirectStream', '\n  async function playTvResolvedOption'), '6e7bbf5e46be746c369155e6152a38ef153d79ac38400721807542cc12fad72e');
assert.equal(hashBlock('function playTvEmbedUrl', 'function resetTvQualitySelector'), '7e9db5cad0cf40e1360ed714e53b805be35f8da1c7bbe5fe1d7789c14246acc7');
assert.equal(hashBlock('async function playTvResolvedOption', 'async function resolveAndPlayTvChannel'), 'f2ee57807c10bc3d2eb16ecc68373fc0f872381ae59f7c2463098375c7a216d9');
assert.equal(hashBlock('async function resolveAndPlayTvChannel', 'function updateTvCastButton'), 'c24b575d2944dd64ac0c7d425dbc796516990d476a06d6976c313d9f61bfa586');

// Cinéma/qualité/multiview ne sont montés qu'après le rendu par un observer dédié au backdrop.
assert.ok(shell.includes('const tvSafeExtras ='));
assert.ok(shell.includes('function mountTvSafeExtrasLauncher()'));
assert.ok(shell.includes("screen.appendChild(button)"));
assert.ok(shell.includes('const installTvSafeExtrasObserver = () =>'));
assert.ok(shell.includes("tvSafeExtrasObserver.observe(backdrop, { childList: true, subtree: true })"));
assert.ok(shell.includes("document.body.appendChild(layer)"));
assert.ok(!shell.includes('syncTvExperienceControls'));
assert.ok(!shell.includes('const tvMultiState ='));
assert.ok(!shell.includes('data-tv-theater="'));

// Le multiview n'arrête/relance jamais le HLS principal.
const extras = block('  /* V99 — TV extras isolated', '\n\n  async function playTvDirectStream');
assert.ok(!extras.includes('tvHls?.stopLoad'));
assert.ok(!extras.includes('tvHls?.startLoad'));
assert.ok(!extras.includes('currentTime ='));
assert.ok(extras.includes("tvAppleTouchDevice() && video.canPlayType('application/vnd.apple.mpegurl')"));
assert.ok(extras.includes('capLevelToPlayerSize: true'));

// Le CSS normal est intact : les changements de layout sont conditionnés à un clic cinéma explicite.
assert.ok(theme.includes('#noctra-panel[data-noctra-panel-kind="tv"][data-tv-safe-theater="true"]'));
assert.ok(theme.includes('.noctra-tv-safe-tools-launcher'));
assert.ok(theme.includes('.noctra-tv-safe-tools-menu'));
assert.ok(theme.includes('.noctra-tv-safe-multiview'));
assert.ok(theme.includes('@media (max-width:760px)'));
assert.ok(theme.includes('orientation:landscape'));
assert.ok(theme.includes('width:230px!important'));

console.log('TV v94 intacte + Cinéma/Multiview isolés Noctra v98 : OK');
