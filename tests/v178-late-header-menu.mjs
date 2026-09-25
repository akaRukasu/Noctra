import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../public/noctra-shell.js', import.meta.url), 'utf8');
const clickStart = shell.indexOf("const trigger = event.target.closest?.('.headerCastButton, .headerSyncButton')");
const clickEnd = shell.indexOf("}, true);", clickStart);
const handler = shell.slice(clickStart, clickEnd);

assert.ok(handler.includes('headerActionMenuIntentUntil = Date.now() + 8_000'));
assert.ok(handler.includes('window.setTimeout(settleHeaderMenu, 90)'));
assert.ok(shell.includes(".actionSheet.actionsheet-not-fullscreen, .dialog.actionsheet-not-fullscreen"));

console.log('Noctra v178 - ancrage des menus Cast et SyncPlay tardifs : OK');
