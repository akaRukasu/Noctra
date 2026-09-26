/* Outils communs à la construction des APK Noctra sans Android Studio ni SDK
   et sans accès aux dépôts de Google (seulement Java 17+ et Node.js).

   Outils téléchargés une fois depuis Maven Central (empreinte SHA-1 vérifiée),
   dans dist/android-tools :
   - android-all (Robolectric) : classes du système Android pour javac ;
   - apktool : aapt2 précompilé, framework Android, décodage/reconstruction d'APK ;
   - dalvik-dx : conversion en bytecode Android (classes.dex) ;
   - apksig : signature v2 (Android 7 et plus).

   Signature : NOCTRA_KEYSTORE_FILE (PKCS12 ou JKS), NOCTRA_KEYSTORE_PASSWORD,
   NOCTRA_KEY_ALIAS, NOCTRA_KEY_PASSWORD. Sans clé fournie, une clé est créée
   dans dist/android-tools/noctra-release.p12 : gardez-la pour pouvoir installer
   les mises à jour par-dessus les applis existantes. */
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

export const appsRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = join(appsRoot, '..');
export const toolsDir = join(repoRoot, 'dist', 'android-tools');
const maven = 'https://repo1.maven.org/maven2';

const artifacts = {
  androidAll: 'org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar',
  apktool: 'org/apktool/apktool-cli/3.0.3/apktool-cli-3.0.3.jar',
  dx: 'com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar',
  apksig: 'com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar'
};

export function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024, ...options }).toString();
  } catch (error) {
    const detail = [String(error.stdout || ''), String(error.stderr || '')].join('\n').split('\n')
      .filter(line => line && !line.startsWith('Picked up JAVA_TOOL_OPTIONS')).join('\n');
    throw new Error(`${command} a échoué :\n${detail || error.message}`);
  }
}

export const step = message => console.log(`• ${message}`);

async function download(path) {
  const target = join(toolsDir, path.split('/').pop());
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

export async function listFiles(dir, filter = () => true) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await listFiles(path, filter));
    else if (filter(entry.name)) found.push(path);
  }
  return found;
}

export async function prepareTools() {
  await mkdir(toolsDir, { recursive: true });
  const androidAll = await download(artifacts.androidAll);
  const apktool = await download(artifacts.apktool);
  const dx = await download(artifacts.dx);
  const apksig = await download(artifacts.apksig);
  const platformDir = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macosx' : 'linux';
  const aapt2Name = process.platform === 'win32' ? 'aapt2.exe' : 'aapt2';
  const aapt2 = join(toolsDir, aapt2Name);
  if (!existsSync(aapt2)) await unzipEntry(apktool, `prebuilt/${platformDir}/${aapt2Name}`, aapt2);
  await chmod(aapt2, 0o755);
  const framework = join(toolsDir, 'android-framework.jar');
  if (!existsSync(framework)) await unzipEntry(apktool, 'prebuilt/android-framework.jar', framework);
  return { androidAll, apktool, dx, apksig, aapt2, framework };
}

/* Alignement (équivalent de zipalign) : fichiers non compressés alignés sur
   4 octets, bibliothèques natives sur 16 Ko. Obligatoire pour resources.arsc
   dès Android 11 (targetSdk 30 et plus). Les descripteurs de données sont
   supprimés (tailles et CRC recopiés dans chaque en-tête local). */
export async function alignZip(source, target) {
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
    header.writeUInt16LE(header.readUInt16LE(6) & ~0x0008, 6);
    header.writeUInt32LE(zip.readUInt32LE(central + 16), 14);
    header.writeUInt32LE(compressedSize, 18);
    header.writeUInt32LE(zip.readUInt32LE(central + 24), 22);
    const name = zip.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    const alignment = method !== 0 ? 1 : name.toString().endsWith('.so') ? 16384 : 4;
    const unpadded = offset + 30 + name.length;
    const padding = (alignment - (unpadded % alignment)) % alignment;
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
    System.out.println("signature v2=" + result.isVerifiedUsingV2Scheme());
  }
}
`;

/* Signature v2 (apksig ; la signature v1 d'apksig 2.3.0 ne fonctionne pas avec
   les JDK récents, d'où Android 7 minimum), puis vérification de l'alignement. */
export async function signApk({ tools, input, output, minSdk, workDir }) {
  let keystore = process.env.NOCTRA_KEYSTORE_FILE;
  let storePassword = process.env.NOCTRA_KEYSTORE_PASSWORD;
  const alias = process.env.NOCTRA_KEY_ALIAS || 'noctra';
  let keyPassword = process.env.NOCTRA_KEY_PASSWORD || storePassword;
  if (!keystore) {
    keystore = join(toolsDir, 'noctra-release.p12');
    const passwordFile = join(toolsDir, 'noctra-release.password');
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
  const signerDir = join(workDir, 'signer');
  await mkdir(signerDir, { recursive: true });
  await writeFile(join(signerDir, 'NoctraSign.java'), SIGNER);
  run('javac', ['-nowarn', '-cp', tools.apksig, '-d', signerDir, join(signerDir, 'NoctraSign.java')]);
  const separator = process.platform === 'win32' ? ';' : ':';
  const exports = ['x509', 'pkcs', 'util'].flatMap(name => ['--add-exports', `java.base/sun.security.${name}=ALL-UNNAMED`, '--add-opens', `java.base/sun.security.${name}=ALL-UNNAMED`]);
  console.log('  ' + run('java', [...exports, '-cp', `${tools.apksig}${separator}${signerDir}`, 'NoctraSign',
    keystore, storePassword, alias, keyPassword, input, output, String(minSdk)]).trim());

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
