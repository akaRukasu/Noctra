// La vraie appli iPhone/iPad (apps/ios-native) et l'ancienne interface web
// (apps/ios) ne doivent jamais partager d'identifiant : sinon installer l'une
// remplace l'autre sur l'iPhone (ancienne interface à la place de l'appli native).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const bundle = text => (text.match(/PRODUCT_BUNDLE_IDENTIFIER:\s*(\S+)/) || [])[1];
const native = bundle(await read('apps/ios-native/project.yml'));
const web = bundle(await read('apps/ios/project.yml'));
assert.equal(native, 'com.noctra.app', 'appli native : identifiant inchangé (mises à jour par-dessus)');
assert.notEqual(web, native, 'ancienne interface web : identifiant distinct');
assert.match(await read('apps/ios/Noctra/Info.plist'), /<key>CFBundleDisplayName<\/key>\s*<string>Noctra Web<\/string>/);
const apps = await read('.github/workflows/noctra-apps.yml');
assert.ok(!apps.includes('Noctra-ios-unsigned.ipa') && !/name: noctra-ios\n/.test(apps), 'plus d’IPA ambiguë « Noctra-ios-unsigned.ipa »');
assert.match(await read('.github/workflows/noctra-ios-native.yml'), /name: noctra-ios26\n/);
console.log('iOS : appli native et ancienne interface web séparées : OK');
