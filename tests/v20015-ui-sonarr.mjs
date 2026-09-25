import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/client/index.html', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const assetVersion = manifest.version.replace(/^(\d+)\.0\.(\d+)$/, '$1.$2');
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.ok(index.includes(`../noctra-shell.js?v=${assetVersion}`));
assert.ok(index.includes(`../noctra-theme.css?v=${assetVersion}`));
assert.ok(!shell.includes('noctra-media-launcher'));
assert.ok(!shell.includes('mediaHubModule'));
assert.ok(!theme.includes('#noctra-media-hub'));
await assert.rejects(access(new URL('../public/noctra-media-hub.js', import.meta.url)));

const dockRoleBlock = shell.match(/function syncDockRoleButtons[\s\S]*?\n  }/)?.[0] || '';
assert.match(dockRoleBlock, /data-noctra="users" data-admin-dock/);
assert.ok(!shell.includes('noctra-users-shortcut'));
assert.match(theme, /#noctra-dock\[data-role="administrator"\] \.noctra-dock-items[\s\S]*?repeat\(9, minmax\(0, 1fr\)\)/);

assert.ok(shell.includes('const sequence = ++automationLoadSequence'));
assert.ok(shell.includes('sequence !== automationLoadSequence'));
assert.ok(shell.includes("Chargement de ${type === 'sonarr'"));
assert.match(shell, /cachedApi\('\/api\/servarr\/center\?type=sonarr&view=overview&page=1&pageSize=40'/);

assert.match(server, /const arrCatalogPending = new Map\(\)/);
assert.match(server, /Date\.now\(\) - cached\.updatedAt < 60_000/);
const overviewBlock = server.match(/if \(normalizedView === 'overview'\)[\s\S]*?\n  }\n  if \(normalizedView === 'library'/)?.[0] || '';
assert.ok(!overviewBlock.includes('arrSettings(type)'));

assert.ok(theme.includes('mainDetailButtons'));
assert.ok(theme.includes('noctra-detail-mobile'));
assert.ok(theme.includes('noctra-arr-metrics') && theme.includes('noctra-arr-hero'));
console.log('v200.16 Sonarr loading, admin dock, player removal and centered detail actions: OK');
