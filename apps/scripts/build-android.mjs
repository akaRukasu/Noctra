#!/usr/bin/env node
/* Construit l'APK Noctra (téléphone + Android TV) sans Android Studio ni SDK,
   et sans accès aux dépôts de Google : seulement Java 17+ et Node.js.

   Outils téléchargés une fois depuis Maven Central (empreinte SHA-1 vérifiée),
   dans dist/android-tools :
   - android-all (Robolectric) : classes du système Android pour javac ;
   - apktool : aapt2 précompilé et framework Android pour les ressources ;
   - dalvik-dx : conversion en bytecode Android (classes.dex) ;
   - apksig : signature v2 (Android 7 et plus, comme minSdk).

   Signature : NOCTRA_KEYSTORE_FILE (PKCS12 ou JKS), NOCTRA_KEYSTORE_PASSWORD,
   NOCTRA_KEY_ALIAS, NOCTRA_KEY_PASSWORD. Sans clé fournie, une clé est créée
   dans dist/android-tools/noctra-release.p12 : gardez-la pour pouvoir
   installer les mises à jour par-dessus l'appli existante.

   Usage : node apps/scripts/build-android.mjs  →  dist/apps/Noctra-android.apk */
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const appsRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appsRoot, '..');
const project = join(appsRoot, 'android', 'app');
const tools = join(repoRoot, 'dist', 'android-tools');
const work = join(repoRoot, 'dist', 'android-build');
const output = join(repoRoot, 'dist', 'apps', 'Noctra-android.apk');
const maven = 'https://repo1.maven.org/maven2';

const artifacts = {
  androidAll: 'org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar',
  apktool: 'org/apktool/apktool-cli/3.0.3/apktool-cli-3.0.3.jar',
  dx: 'com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar',
  apksig: 'com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar'
};

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...options }).toString();
  } catch (error) {
    const detail = String(error.stderr || '').split('\n').filter(line => line && !line.startsWith('Picked up JAVA_TOOL_OPTIONS')).join('\n');
    throw new Error(`${command} a échoué :\n${detail || error.message}`);
  }
}
const step = message => console.log(`• ${message}`);

async function download(path) {
  const target = join(tools, path.split('/').pop());
  if (existsSync(target)) return target;
  step(`Téléchargement de ${path.split('/').pop()}`);
  const [body, sha1] = await Promise.all([
    fetch(`${maven}/${path}`).then(response => {
      if (!response.ok) throw new Error(`${path} : HTTP ${response.status}`);
      return response.arrayBuffer();
    }),
    fetch(`${maven}/${path}.sha1`).then(response => response.text())
  ]);
  const buffer = Buffer.from(body);
  const actual = createHash('sha1').update(buffer).digest('hex');
  if (actual !== sha1.trim().split(/\s+/)[0]) throw new Error(`Empreinte SHA-1 invalide pour ${path}`);
  await writeFile(target, buffer);
  return target;
}

// Lecture minimale d'une archive zip (pour extraire aapt2 et le framework d'apktool).
async function unzipEntry(zipFile, name, target) {
  const zip = await readFile(zipFile);
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end -= 1;
  let offset = zip.readUInt32LE(end + 16);
  const count = zip.readUInt16LE(end + 10);
  for (let index = 0; index < count; index += 1) {
    const method = zip.readUInt16LE(offset + 10);
    const size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const entryName = zip.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (entryName === name) {
      const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const raw = zip.subarray(dataStart, dataStart + size);
      await writeFile(target, method === 8 ? inflateRawSync(raw) : raw);
      return target;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${name} absent de ${zipFile}`);
}

async function listFiles(dir, filter) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await listFiles(path, filter));
    else if (filter(entry.name)) found.push(path);
  }
  return found;
}

const SIGNER = `
import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

public class NoctraSign {
  public static void main(String[] args) throws Exception {
    String type = args[0].toLowerCase().endsWith(".jks") ? "JKS" : "PKCS12";
    KeyStore store = KeyStore.getInstance(type);
    try (FileInputStream in = new FileInputStream(args[0])) { store.load(in, args[1].toCharArray()); }
    String alias = args[2];
    PrivateKey key = (PrivateKey) store.getKey(alias, args[3].toCharArray());
    X509Certificate cert = (X509Certificate) store.getCertificate(alias);
    ApkSigner.SignerConfig signer = new ApkSigner.SignerConfig.Builder("NOCTRA", key, Collections.singletonList(cert)).build();
    new ApkSigner.Builder(Collections.singletonList(signer))
      .setInputApk(new File(args[4])).setOutputApk(new File(args[5]))
      .setMinSdkVersion(Integer.parseInt(args[6]))
      .setV1SigningEnabled(false).setV2SigningEnabled(true)
      .build().sign();
    ApkVerifier.Result result = new ApkVerifier.Builder(new File(args[5])).build().verify();
    if (!result.isVerified()) { System.err.println(result.getErrors()); System.exit(1); }
    System.out.println("signature v1=" + result.isVerifiedUsingV1Scheme() + " v2=" + result.isVerifiedUsingV2Scheme());
  }
}
`;

// ── Préparation ──────────────────────────────────────────────────────────
await mkdir(tools, { recursive: true });
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
await mkdir(dirname(output), { recursive: true });

const androidAll = await download(artifacts.androidAll);
const apktool = await download(artifacts.apktool);
const dx = await download(artifacts.dx);
const apksig = await download(artifacts.apksig);

const platformDir = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macosx' : 'linux';
const aapt2 = join(tools, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2');
if (!existsSync(aapt2)) await unzipEntry(apktool, `prebuilt/${platformDir}/${process.platform === 'win32' ? 'aapt2.exe' : 'aapt2'}`, aapt2);
await chmod(aapt2, 0o755);
const framework = join(tools, 'android-framework.jar');
if (!existsSync(framework)) await unzipEntry(apktool, 'prebuilt/android-framework.jar', framework);

// Version, SDK et identifiant lus dans le projet Gradle (une seule source).
const gradle = await readFile(join(project, 'build.gradle.kts'), 'utf8');
const setting = name => (new RegExp(`${name}\\s*=\\s*"?([^"\\n]+)"?`).exec(gradle) || [])[1];
const packageName = setting('applicationId');
const versionCode = setting('versionCode');
const versionName = setting('versionName');
const minSdk = setting('minSdk');
const targetSdk = setting('targetSdk');

// ── Ressources ───────────────────────────────────────────────────────────
step('Ressources (aapt2)');
const manifestSource = await readFile(join(project, 'src', 'main', 'AndroidManifest.xml'), 'utf8');
const manifest = join(work, 'AndroidManifest.xml');
await writeFile(manifest, manifestSource.replace('<manifest ', `<manifest package="${packageName}" `));
const compiled = join(work, 'compiled.zip');
run(aapt2, ['compile', '--dir', join(project, 'src', 'main', 'res'), '-o', compiled]);
const gen = join(work, 'gen');
await mkdir(gen, { recursive: true });
const unsigned = join(work, 'unsigned.apk');
run(aapt2, ['link', '-o', unsigned, '-I', framework, '--manifest', manifest, '--java', gen,
  '--min-sdk-version', minSdk, '--target-sdk-version', targetSdk,
  '--version-code', versionCode, '--version-name', versionName,
  '-A', join(appsRoot, 'shared'), '--auto-add-overlay', compiled]);

// ── Code ─────────────────────────────────────────────────────────────────
step('Compilation Java');
await writeFile(join(gen, 'BuildConfig.java'), `package ${packageName};\n\npublic final class BuildConfig {\n  public static final boolean DEBUG = false;\n  public static final String APPLICATION_ID = "${packageName}";\n  public static final int VERSION_CODE = ${versionCode};\n  public static final String VERSION_NAME = "${versionName}";\n}\n`);
const classes = join(work, 'classes');
const sources = [...await listFiles(join(project, 'src', 'main', 'java'), name => name.endsWith('.java')), ...await listFiles(gen, name => name.endsWith('.java'))];
run('javac', ['-encoding', 'UTF-8', '--release', '8', '-nowarn', '-Xlint:-options', '-cp', androidAll, '-d', classes, ...sources]);

step('Bytecode Android (dx)');
const dexDir = join(work, 'dex');
await mkdir(dexDir, { recursive: true });
run('java', ['-cp', dx, 'com.android.dx.command.Main', '--dex', `--min-sdk-version=${minSdk}`, `--output=${join(dexDir, 'classes.dex')}`, classes]);

// classes.dex ajouté à l'archive produite par aapt2.
const withDex = join(work, 'with-dex.apk');
await cp(unsigned, withDex);
run('jar', ['uf', withDex, '-C', dexDir, 'classes.dex']);

// Alignement (équivalent de zipalign) : fichiers non compressés sur 4 octets.
// Obligatoire pour resources.arsc dès Android 11 (targetSdk 30 et plus).
async function alignZip(source, target) {
  const zip = await readFile(source);
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end -= 1;
  const count = zip.readUInt16LE(end + 10);
  let central = zip.readUInt32LE(end + 16);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    const method = zip.readUInt16LE(central + 10);
    const compressedSize = zip.readUInt32LE(central + 20);
    const nameLength = zip.readUInt16LE(central + 28);
    const extraLength = zip.readUInt16LE(central + 30);
    const commentLength = zip.readUInt16LE(central + 32);
    const localOffset = zip.readUInt32LE(central + 42);
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const header = Buffer.from(zip.subarray(localOffset, localOffset + 30));
    // Pas de descripteur de données : tailles et CRC recopiés depuis le répertoire central.
    header.writeUInt16LE(header.readUInt16LE(6) & ~0x0008, 6);
    header.writeUInt32LE(zip.readUInt32LE(central + 16), 14);
    header.writeUInt32LE(compressedSize, 18);
    header.writeUInt32LE(zip.readUInt32LE(central + 24), 22);
    const name = zip.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    const unpadded = offset + 30 + name.length;
    const padding = method === 0 ? (4 - (unpadded % 4)) % 4 : 0;
    header.writeUInt16LE(padding, 28);
    const entry = Buffer.from(zip.subarray(central, central + 46 + nameLength + extraLength + commentLength));
    entry.writeUInt16LE(entry.readUInt16LE(8) & ~0x0008, 8);
    entry.writeUInt32LE(offset, 42);
    locals.push(header, name, Buffer.alloc(padding), data);
    centrals.push(entry);
    offset += 30 + name.length + padding + data.length;
    central += 46 + nameLength + extraLength + commentLength;
  }
  const centralData = Buffer.concat(centrals);
  const record = Buffer.from(zip.subarray(end, end + 22));
  record.writeUInt32LE(centralData.length, 12);
  record.writeUInt32LE(offset, 16);
  record.writeUInt16LE(0, 20);
  await writeFile(target, Buffer.concat([...locals, centralData, record]));
}
const aligned = join(work, 'aligned.apk');
await alignZip(withDex, aligned);

// ── Signature ────────────────────────────────────────────────────────────
step('Signature (apksig, schéma v2 : Android 7 et plus)');
let keystore = process.env.NOCTRA_KEYSTORE_FILE;
let storePassword = process.env.NOCTRA_KEYSTORE_PASSWORD;
let alias = process.env.NOCTRA_KEY_ALIAS || 'noctra';
let keyPassword = process.env.NOCTRA_KEY_PASSWORD || storePassword;
if (!keystore) {
  keystore = join(tools, 'noctra-release.p12');
  const passwordFile = join(tools, 'noctra-release.password');
  if (!existsSync(keystore)) {
    step('Création d’une clé de signature (dist/android-tools/noctra-release.p12)');
    await writeFile(passwordFile, randomBytes(18).toString('base64url'), { mode: 0o600 });
    const password = (await readFile(passwordFile, 'utf8')).trim();
    run('keytool', ['-genkeypair', '-keystore', keystore, '-storetype', 'PKCS12', '-alias', alias,
      '-keyalg', 'RSA', '-keysize', '4096', '-validity', '36500', '-storepass', password, '-keypass', password,
      '-dname', 'CN=Noctra, O=Noctra, C=FR']);
  }
  storePassword = keyPassword = (await readFile(passwordFile, 'utf8')).trim();
}
const signerDir = join(work, 'signer');
await mkdir(signerDir, { recursive: true });
await writeFile(join(signerDir, 'NoctraSign.java'), SIGNER);
run('javac', ['-nowarn', '-cp', apksig, '-d', signerDir, join(signerDir, 'NoctraSign.java')]);
const separator = process.platform === 'win32' ? ';' : ':';
console.log('  ' + run('java', [...['x509', 'pkcs', 'util'].flatMap(name => ['--add-exports', `java.base/sun.security.${name}=ALL-UNNAMED`, '--add-opens', `java.base/sun.security.${name}=ALL-UNNAMED`]), '-cp', `${apksig}${separator}${signerDir}`, 'NoctraSign', keystore, storePassword, alias, keyPassword, aligned, output, minSdk]).trim());

{
  const apk = await readFile(output);
  let end = apk.length - 22;
  while (apk.readUInt32LE(end) !== 0x06054b50) end -= 1;
  let central = apk.readUInt32LE(end + 16);
  for (let index = apk.readUInt16LE(end + 10); index > 0; index -= 1) {
    const nameLength = apk.readUInt16LE(central + 28);
    const local = apk.readUInt32LE(central + 42);
    const name = apk.subarray(central + 46, central + 46 + nameLength).toString();
    const dataStart = local + 30 + apk.readUInt16LE(local + 26) + apk.readUInt16LE(local + 28);
    if (apk.readUInt16LE(central + 10) === 0 && dataStart % 4) throw new Error(`${name} n'est pas aligné sur 4 octets`);
    if (name === 'resources.arsc' && apk.readUInt16LE(central + 10) !== 0) throw new Error('resources.arsc doit rester non compressé');
    central += 46 + nameLength + apk.readUInt16LE(central + 30) + apk.readUInt16LE(central + 32);
  }
}
const { size } = await stat(output);
console.log(`${relative(process.cwd(), output)} (${(size / 1024).toFixed(0)} Ko) — ${packageName} ${versionName} (${versionCode}), Android ${minSdk}+`);
