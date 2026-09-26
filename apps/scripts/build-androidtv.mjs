#!/usr/bin/env node
/* Construit « Noctra TV » : l'appli Android TV officielle de Jellyfin
   (jellyfin-androidtv, licence GPL-2.0), adaptée pour Noctra :
   - serveur Jellyfin Noctra intégré : au démarrage, l'appli se connecte seule
     et ouvre directement la page d'authentification (plus d'adresse à saisir) ;
   - nom, icône, bannière et logo Noctra ;
   - identifiant com.noctra.tv : s'installe à côté de l'appli Jellyfin officielle.
   Interface native (fluide sur les boîtiers et vidéoprojecteurs) et lecteur
   vidéo natif (ExoPlayer, lecture directe sans transcodage quand c'est possible).

   Usage : node apps/scripts/build-androidtv.mjs [jellyfin-androidtv-release.apk]
   Sans fichier, l'APK officiel v0.19.10 est téléchargé depuis GitHub.
   Variables : NOCTRA_JELLYFIN_URL (adresse du serveur Jellyfin), signature :
   voir android-tools.mjs.  →  dist/apps/Noctra-androidtv.apk */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { alignZip, appsRoot, listFiles, prepareTools, repoRoot, run, signApk, step, toolsDir } from './android-tools.mjs';

const serverUrl = (process.env.NOCTRA_JELLYFIN_URL || 'https://akarukasu.merlion.usbx.me/jellyfin').replace(/\/+$/, '');
const packageName = 'com.noctra.tv';
const appName = 'Noctra';
const minSdk = 24;
const base = {
  version: '0.19.10',
  url: 'https://github.com/jellyfin/jellyfin-androidtv/releases/download/v0.19.10/jellyfin-androidtv-v0.19.10-release.apk',
  sha256: '8510a517c99927076082917f41bf306dd7a2546c59d492dd11bde18d6e2e4628'
};
const noctraRevision = 1;

const work = join(repoRoot, 'dist', 'androidtv-build');
const decoded = join(work, 'decoded');
const output = join(repoRoot, 'dist', 'apps', 'Noctra-androidtv.apk');

async function baseApk() {
  let file = process.argv[2];
  if (!file) {
    file = join(toolsDir, `jellyfin-androidtv-v${base.version}-release.apk`);
    if (!existsSync(file)) {
      step(`Téléchargement de Jellyfin Android TV ${base.version}`);
      const response = await fetch(base.url);
      if (!response.ok) throw new Error(`Téléchargement impossible (${response.status}). Passez le fichier APK en argument.`);
      await writeFile(file, Buffer.from(await response.arrayBuffer()));
    }
  }
  const digest = createHash('sha256').update(await readFile(file)).digest('hex');
  if (digest !== base.sha256) throw new Error(`APK inattendu (${digest}) : ce script cible jellyfin-androidtv ${base.version} (release).`);
  return file;
}

// Remplacement vérifié : une version différente de Jellyfin fait échouer la construction.
async function patch(file, replacements) {
  let text = await readFile(file, 'utf8');
  for (const [before, after, expected = 1] of replacements) {
    const count = text.split(before).length - 1;
    if (count !== expected) throw new Error(`${relative(decoded, file)} : « ${before.slice(0, 60)} » trouvé ${count} fois (attendu ${expected}).`);
    text = text.split(before).join(after);
  }
  await writeFile(file, text);
}

const smali = path => join(decoded, 'smali_classes6', 'org', 'jellyfin', 'androidtv', ...path.split('/'));

await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
await mkdir(dirname(output), { recursive: true });
const tools = await prepareTools();
const input = await baseApk();

step('Décodage (apktool)');
run('java', ['-jar', tools.apktool, 'd', '-f', '-o', decoded, input]);

// ── 1. Serveur intégré ───────────────────────────────────────────────────
// Sans session, Jellyfin affiche la liste des serveurs. On ouvre à la place
// l'écran « Ajouter un serveur » avec l'adresse Noctra : Jellyfin la vérifie,
// l'enregistre puis ouvre la page d'authentification (argument server_address).
step(`Serveur intégré : ${serverUrl}`);
await patch(smali('ui/startup/StartupActivity.smali'), [[
  `.method private final showServerSelection()V
    .locals 4`,
  `.method private final showServerSelection()V
    .locals 6`
], [
  `    const-class v2, Lorg/jellyfin/androidtv/ui/startup/fragment/SelectServerFragment;

    invoke-virtual {v0, v1, v2, v3, v3}, Landroidx/fragment/app/FragmentTransaction;->add(ILjava/lang/Class;Landroid/os/Bundle;Ljava/lang/String;)Landroidx/fragment/app/FragmentTransaction;`,
  `    new-instance v4, Landroid/os/Bundle;

    invoke-direct {v4}, Landroid/os/Bundle;-><init>()V

    const-string v5, "server_address"

    const-string v2, "${serverUrl}"

    invoke-virtual {v4, v5, v2}, Landroid/os/Bundle;->putString(Ljava/lang/String;Ljava/lang/String;)V

    const-class v2, Lorg/jellyfin/androidtv/ui/startup/fragment/ServerAddFragment;

    invoke-virtual {v0, v1, v2, v4, v3}, Landroidx/fragment/app/FragmentTransaction;->add(ILjava/lang/Class;Landroid/os/Bundle;Ljava/lang/String;)Landroidx/fragment/app/FragmentTransaction;`
]]);

// ── 2. Identifiant propre (com.noctra.tv) ─────────────────────────────────
// Autorités des fournisseurs, permission et type de compte doivent être
// uniques sur l'appareil pour cohabiter avec l'appli Jellyfin officielle.
step(`Identifiant : ${packageName}`);
await patch(join(decoded, 'AndroidManifest.xml'), [
  ...['acra', 'androidx-startup', 'content', 'integration.provider.ImageProvider'].map(name => [
    `android:authorities="org.jellyfin.androidtv.${name}"`, `android:authorities="${packageName}.${name}"`
  ]),
  ['"org.jellyfin.androidtv.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"', `"${packageName}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"`, 2],
  // Les composants sont nommés en entier (org.jellyfin.androidtv.…) : seul
  // l'identifiant de l'appli change, pas les classes.
  ['package="org.jellyfin.androidtv"', `package="${packageName}"`]
]);
await patch(smali('integration/MediaContentProvider.smali'), [['"org.jellyfin.androidtv.content"', `"${packageName}.content"`, 2]]);
await patch(smali('integration/provider/ImageProvider$Companion.smali'), [['"org.jellyfin.androidtv.integration.provider.ImageProvider"', `"${packageName}.integration.provider.ImageProvider"`]]);
await patch(join(decoded, 'res', 'values', 'strings.xml'), [
  ['<string name="app_id">org.jellyfin.androidtv</string>', `<string name="app_id">${packageName}</string>`],
  ['org.jellyfin.androidtv.content', `${packageName}.content`, 2]
]);
await patch(smali('auth/AccountManagerMigration.smali'), [['"org.jellyfin.androidtv"', `"${packageName}"`, 2]]);

const yml = join(decoded, 'apktool.yml');
let apktoolYml = await readFile(yml, 'utf8');
apktoolYml = apktoolYml
  .replace(/minSdkVersion: \d+/, `minSdkVersion: ${minSdk}`)
  .replace(/versionName: .*/, `versionName: ${base.version}-noctra.${noctraRevision}`);
await writeFile(yml, apktoolYml);

// ── 3. Marque Noctra ─────────────────────────────────────────────────────
step('Nom, icône, bannière et logo Noctra');
for (const file of await listFiles(join(decoded, 'res'), name => name === 'strings.xml')) {
  const text = await readFile(file, 'utf8');
  if (text.includes('name="app_name_release"')) {
    await writeFile(file, text.replace(/<string name="app_name_release">[^<]*<\/string>/, `<string name="app_name_release">${appName}</string>`));
  }
}
// Les versions vectorielles (API 24+) masqueraient les images Noctra.
for (const name of ['app_logo', 'app_icon_foreground', 'app_banner_foreground']) {
  await rm(join(decoded, 'res', 'drawable-anydpi-v24', `${name}.xml`));
}
await cp(join(appsRoot, 'androidtv', 'overlay', 'res'), join(decoded, 'res'), { recursive: true });
for (const name of ['app_icon_background', 'app_banner_background']) {
  await patch(join(decoded, 'res', 'drawable', `${name}.xml`), [['#000b25', '#050711']]);
}
await patch(join(decoded, 'res', 'mipmap-anydpi-v26', 'app_icon.xml'), [['@drawable/app_icon_foreground_monochrome', '@drawable/app_icon_foreground']]);

// ── 4. Reconstruction et signature ───────────────────────────────────────
step('Reconstruction (apktool + aapt2)');
const unsigned = join(work, 'unsigned.apk');
run('java', ['-jar', tools.apktool, 'b', '-o', unsigned, decoded]);
const aligned = join(work, 'aligned.apk');
await alignZip(unsigned, aligned);
step('Signature (apksig, schéma v2 : Android 7 et plus)');
await signApk({ tools, input: aligned, output, minSdk, workDir: work });

const badging = run(tools.aapt2, ['dump', 'badging', output]);
if (!badging.includes(`package: name='${packageName}'`) || !badging.includes('leanback-launchable-activity')) {
  throw new Error('APK final inattendu :\n' + badging.split('\n').slice(0, 8).join('\n'));
}
const { size } = await stat(output);
console.log(`${relative(process.cwd(), output)} (${(size / 1048576).toFixed(1)} Mo) — ${packageName} ${base.version}-noctra.${noctraRevision}, Android ${minSdk}+, serveur ${serverUrl}`);
