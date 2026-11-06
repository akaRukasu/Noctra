// Samsung 2014 (Noctra TV 1.1.62-2014.3) : l'adresse du serveur gardée sur le
// téléviseur par une installation précédente (akarukasu.merlion.usbx.me) est
// remplacée par akarukasu.astra.usbx.me/noctra au lancement, et réenregistrée
// (l'ancienne est notée : reprise seulement si elle répond et pas la nouvelle,
// voir le scénario navigateur de tests/orsay-samsung-2014.mjs).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const host = (await readFile(new URL('../apps/samsung-orsay/orsay-host.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const start = host.indexOf('  function movedServer(url) {');
const end = host.indexOf('  // Adresse utilisée : le relais local');
assert.ok(start > 0 && end > start, 'fonctions de l’adresse du serveur');
const build = await readFile(new URL('../apps/scripts/build-orsay.mjs', import.meta.url), 'utf8');
assert.match(build, /export const DEFAULT_SERVER = 'https:\/\/akarukasu\.astra\.usbx\.me\/noctra';/);
assert.match(build, /export const ORSAY_REVISION = 3;/);

function run(saved) {
  const store = new Map(saved === undefined ? [] : [['noctra-orsay-server-v1', JSON.stringify(saved)]]);
  const context = {
    SERVER_KEY: 'noctra-orsay-server-v1',
    config: { defaultServerUrl: 'https://akarukasu.astra.usbx.me/noctra' },
    localStorage: { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)) }
  };
  vm.createContext(context);
  vm.runInContext(host.slice(start, end), context);
  const entry = JSON.parse(JSON.stringify(context.loadServer()));
  return { entry, stored: store.has('noctra-orsay-server-v1') ? JSON.parse(store.get('noctra-orsay-server-v1')) : null };
}

// Première installation : nouvelle adresse.
assert.deepEqual(run().entry, { url: 'https://akarukasu.astra.usbx.me/noctra', relay: '' });
// Ancienne adresse gardée (HTTPS ou HTTP non chiffré) : corrigée et réenregistrée.
let result = run({ url: 'https://akarukasu.merlion.usbx.me/noctra', relay: '', insecure: true });
assert.deepEqual(result.entry, { url: 'https://akarukasu.astra.usbx.me/noctra', relay: '', insecure: true, movedFrom: { url: 'https://akarukasu.merlion.usbx.me/noctra', relay: '' } });
assert.deepEqual(result.stored, result.entry, 'adresse corrigée enregistrée');
// Relais saisi avec le nom de l'ancienne seedbox : nom corrigé aussi.
result = run({ url: 'https://akarukasu.merlion.usbx.me/noctra', relay: 'http://merlion.usbx.me:12345' });
assert.equal(result.entry.url, 'https://akarukasu.astra.usbx.me/noctra');
assert.equal(result.entry.relay, 'http://astra.usbx.me:12345');
// Ancienne adresse gardée volontairement (keepServer) : plus changée.
assert.deepEqual(run({ url: 'https://akarukasu.merlion.usbx.me/noctra', relay: '', keepServer: true }).entry.url, 'https://akarukasu.merlion.usbx.me/noctra');
// Autre serveur ou relais en adresse IP : inchangés.
result = run({ url: 'https://exemple.fr/noctra', relay: 'http://192.168.1.20:8095' });
assert.deepEqual(result.entry, { url: 'https://exemple.fr/noctra', relay: 'http://192.168.1.20:8095' });
assert.equal(run({ url: 'https://akarukasu.astra.usbx.me/noctra', relay: '' }).entry.url, 'https://akarukasu.astra.usbx.me/noctra');
console.log('Samsung 2014 1.1.62-2014.3 : ancienne adresse (merlion) remplacée par akarukasu.astra.usbx.me/noctra et réenregistrée : OK');
