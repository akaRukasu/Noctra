import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const shell = await readFile(new URL('public/noctra-shell.js', root), 'utf8');
const server = await readFile(new URL('server.mjs', root), 'utf8');
const theme = await readFile(new URL('public/noctra-theme.css', root), 'utf8');
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

assert.equal(pkg.version, '200.0.107');
assert.ok(server.includes('function strictResumeItems(items, limit = 12)'));
assert.ok(server.includes('userData.Played === true'));
assert.ok(server.includes("return json(res, 200, { userId: session.user.Id, items });"));
assert.ok(server.includes("Cache-Control', 'private, no-store, max-age=0"));
assert.ok(shell.includes('function reconcileNativeResumeSections(home, items, userId = \'\')'));
assert.ok(shell.includes('payloadUser && liveUser && payloadUser !== liveUser'));
assert.ok(shell.includes('.card[data-noctra-resume-state="allowed"]'));
assert.ok(theme.includes('200.0.107 — même géométrie du dock'));
assert.match(theme, /data-noctra-role="user"[^\n]*#noctra-dock\[data-role="user"\][\s\S]*?height:\s*52px !important;/);

console.log('v200.0.107 : reprise isolée par utilisateur et dock desktop aligné : OK');
