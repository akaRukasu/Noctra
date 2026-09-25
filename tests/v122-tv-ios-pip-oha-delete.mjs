import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/noctra-theme.css', import.meta.url), 'utf8');
const sw = await readFile(new URL('../public/noctra-sw.js', import.meta.url), 'utf8');

assert.match(shell, /autopictureinpicture/);
assert.match(shell, /data-tv-safe-pip/);
assert.match(shell, /webkitSetPresentationMode\('picture-in-picture'\)/);
assert.match(shell, /webkitSetPresentationMode\('fullscreen'\)/);
assert.match(shell, /visibilitychange', tryTvAutoPictureInPicture/);
assert.match(shell, /iosHlsJsPreferred/);
assert.match(shell, /preferManagedMediaSource/);
assert.match(server, /function ohaCatalogPublicPageUrl/);
assert.match(server, /const externalUrl = ohaCatalogPublicPageUrl\(item, root\)/);
assert.match(server, /\(\?:\[a-f0-9\]\{40\}\|\[a-f0-9\]\{64\}\)/i);
assert.match(shell, /executePendingTorrentDelete/);
assert.match(shell, /data-delete-error/);
assert.match(css, /\.noctra-confirm-card\s*\{[\s\S]*?box-sizing:\s*border-box;[\s\S]*?max-width:\s*570px;/);
assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.noctra-confirm-name\s*\{[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?white-space:\s*normal;/);
assert.match(shell, /data-noctra="users" data-admin-dock/);
assert.doesNotMatch(shell, /noctra-users-shortcut/);
assert.doesNotMatch(shell, /data-tv-screen-pip/);
assert.match(sw, /noctra-shell-v200-r15/);
console.log('V122 TV iOS/PiP/OHA/delete checks: OK');
