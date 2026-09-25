import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [pkg, shell, theme, server, index, sw] = await Promise.all([
  readFile(new URL('package.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('public/noctra-shell.js', root), 'utf8'),
  readFile(new URL('public/noctra-theme.css', root), 'utf8'),
  readFile(new URL('server.mjs', root), 'utf8'),
  readFile(new URL('public/client/index.html', root), 'utf8'),
  readFile(new URL('public/noctra-sw.js', root), 'utf8')
]);

const buildVersion = pkg.version;
assert.match(buildVersion, /^\d+\.\d+\.\d+$/);
assert.ok(shell.includes(`NOCTRA_BUILD_VERSION = '${buildVersion}'`));
assert.ok(server.includes(`version: '${buildVersion}'`));
const assetVersion = buildVersion.replace(/^(\d+)\.0\.(\d+)$/, '$1.$2');
assert.ok(index.includes(`noctra-shell.js?v=${assetVersion}`));
assert.ok(index.includes(`noctra-theme.css?v=${assetVersion}`));
assert.ok(sw.includes(`noctra-shell-v200-r${pkg.version.split('.').at(-1)}`));

assert.ok(shell.includes('function markRecentHomeSections(home, sectionTitles'));
assert.ok(shell.includes("/^(?:films|series),?\\s+ajouts?\\s+recents?$/"));
assert.ok(shell.includes("title.closest('.sectionTitleTextButton, a.more.button-flat')"));
assert.ok(shell.includes("section.classList.toggle('noctra-recent-section', recent)"));
assert.ok(shell.includes("icon.dataset.noctraSectionCaret = 'true'"));
assert.ok(shell.includes("parent.matches('.sectionTitleTextButton[data-noctra-title-without-caret=\"true\"], a.more.button-flat"));
assert.ok(theme.includes('noctra-recent-section') || shell.includes('noctra-recent-section'));

assert.ok(shell.includes('const playerSuppressed = Boolean(mountedPlayer'));
assert.ok(shell.includes('const playerHasMedia = Boolean(mountedVideo'));
assert.ok(shell.includes('mountedPlayer.getClientRects().length') && shell.includes('playerHasMedia || (!playerSuppressed'));
assert.ok(!shell.includes("Number(mountedPlayerStyle?.opacity || 1) > .01"));
assert.ok(theme.includes('noctra-video-route') || shell.includes('noctra-video-route'));
assert.ok(theme.includes('videoPlayerContainer') || shell.includes('videoPlayerContainer'));

console.log(`Noctra v${buildVersion} - fiches, lecteur responsive et titres récents : OK`);
