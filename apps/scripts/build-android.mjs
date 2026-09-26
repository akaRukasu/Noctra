#!/usr/bin/env node
/* Construit l'APK Noctra pour téléphone et tablette (WebView de l'interface
   Noctra) sans Android Studio ni SDK : seulement Java 17+ et Node.js.
   Outils et signature : voir apps/scripts/android-tools.mjs.

   Usage : node apps/scripts/build-android.mjs  →  dist/apps/Noctra-android.apk */
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { alignZip, appsRoot, listFiles, prepareTools, repoRoot, run, signApk, step } from './android-tools.mjs';

const project = join(appsRoot, 'android', 'app');
const work = join(repoRoot, 'dist', 'android-build');
const output = join(repoRoot, 'dist', 'apps', 'Noctra-android.apk');

await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
await mkdir(dirname(output), { recursive: true });
const tools = await prepareTools();
const { androidAll, dx, aapt2, framework } = tools;

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
// Assets : écran de connexion partagé + copie du pont web du serveur.
const assets = join(work, 'assets');
await cp(join(appsRoot, 'shared'), assets, { recursive: true });
await mkdir(join(assets, 'bridge'), { recursive: true });
await cp(join(repoRoot, 'public', 'noctra-app-bridge.js'), join(assets, 'bridge', 'noctra-app-bridge.js'));
const compiled = join(work, 'compiled.zip');
run(aapt2, ['compile', '--dir', join(project, 'src', 'main', 'res'), '-o', compiled]);
const gen = join(work, 'gen');
await mkdir(gen, { recursive: true });
const unsigned = join(work, 'unsigned.apk');
run(aapt2, ['link', '-o', unsigned, '-I', framework, '--manifest', manifest, '--java', gen,
  '--min-sdk-version', minSdk, '--target-sdk-version', targetSdk,
  '--version-code', versionCode, '--version-name', versionName,
  '-A', assets, '--auto-add-overlay', compiled]);

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

const aligned = join(work, 'aligned.apk');
await alignZip(withDex, aligned);

step('Signature (apksig, schéma v2 : Android 7 et plus)');
await signApk({ tools, input: aligned, output, minSdk, workDir: work });

const { size } = await stat(output);
console.log(`${relative(process.cwd(), output)} (${(size / 1024).toFixed(0)} Ko) — ${packageName} ${versionName} (${versionCode}), Android ${minSdk}+`);
