#!/usr/bin/env node
/* Construit « Noctra TV » : l'appli Android TV officielle de Jellyfin
   (jellyfin-androidtv, licence GPL-2.0), adaptée pour Noctra :
   - serveur Jellyfin Noctra intégré : au démarrage, l'appli se connecte seule
     et ouvre directement la page d'authentification (plus d'adresse à saisir) ;
   - nom, icône, bannière et logo Noctra ;
   - identifiant com.noctra.tv : s'installe à côté de l'appli Jellyfin officielle ;
   - accueil Noctra (apps/androidtv/web + java/com/noctra/tv) : menu du haut,
     médiathèques, TV en direct (lecteur natif ExoPlayer), Découvrir, Demandes,
     Roulette et recherche ; fiches et lecture des films et séries dans les
     écrans natifs de Jellyfin.
   Interface native (fluide sur les boîtiers et vidéoprojecteurs) et lecteur
   vidéo natif (ExoPlayer, lecture directe sans transcodage quand c'est possible).

   Usage : node apps/scripts/build-androidtv.mjs [jellyfin-androidtv-release.apk]
   Sans fichier, l'APK officiel v0.19.10 est téléchargé depuis GitHub.
   Variables : NOCTRA_JELLYFIN_URL (adresse du serveur Jellyfin), NOCTRA_URL
   (adresse du serveur Noctra), signature : voir android-tools.mjs.  →  dist/apps/Noctra-androidtv.apk */
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join, relative } from 'node:path';
import { alignZip, appsRoot, listFiles, prepareTools, repoRoot, run, signApk, step, toolsDir } from './android-tools.mjs';

const serverUrl = (process.env.NOCTRA_JELLYFIN_URL || 'https://akarukasu.merlion.usbx.me/jellyfin').replace(/\/+$/, '');
const noctraUrl = (process.env.NOCTRA_URL || 'https://akarukasu.merlion.usbx.me/noctra').replace(/\/+$/, '');
const packageName = 'com.noctra.tv';
const appName = 'Noctra';
const minSdk = 24;
const base = {
  version: '0.19.10',
  url: 'https://github.com/jellyfin/jellyfin-androidtv/releases/download/v0.19.10/jellyfin-androidtv-v0.19.10-release.apk',
  sha256: '8510a517c99927076082917f41bf306dd7a2546c59d492dd11bde18d6e2e4628'
};
const noctraRevision = 36;
const versionName = `${base.version}-noctra.${noctraRevision}`;

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
  .replace(/versionName: .*/, `versionName: ${versionName}`);
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

// ── 4. Accueil Noctra ────────────────────────────────────────────────────
// Une fois la session ouverte, StartupActivity ouvre l'accueil Noctra au lieu
// de l'accueil Jellyfin (NoctraRouting) ; les écrans Jellyfin demandés depuis
// l'accueil Noctra (fiche, médiathèque) restent ceux de Jellyfin.
step(`Accueil Noctra : ${noctraUrl}`);
await patch(smali('ui/startup/StartupActivity.smali'), [[
  `    const-class v1, Lorg/jellyfin/androidtv/ui/browsing/MainActivity;

    invoke-direct {p1, v0, v1}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    const v0, 0x10004000`,
  `    invoke-static {v0}, Lcom/noctra/tv/NoctraRouting;->nextActivity(Landroid/content/Context;)Ljava/lang/Class;

    move-result-object v1

    invoke-direct {p1, v0, v1}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    invoke-static {v0}, Lcom/noctra/tv/NoctraRouting;->nextActivityFlags(Landroid/content/Context;)I

    move-result v0`
]]);
const activity = (name, extra = '') => `        <activity android:configChanges="keyboard|keyboardHidden|navigation|orientation|screenLayout|uiMode|screenSize|smallestScreenSize|density" android:exported="false" android:name="com.noctra.tv.${name}"${extra} android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen"/>\n`;
// Lecteur web des chaînes dans son propre processus : un plantage de la page
// d'un fournisseur (ou du moteur web) ne ferme plus l'appli.
await patch(join(decoded, 'AndroidManifest.xml'), [['    </application>', activity('NoctraHomeActivity') + activity('NoctraPlayerActivity') + activity('NoctraMultiviewActivity')
  + activity('NoctraWebPlayerActivity', ' android:process=":webplayer"') + '    </application>']]);
// Ce processus n'a pas l'injection de dépendances de Jellyfin (Koin, démarré
// par androidx.startup dans le processus principal) : son initialisation est sautée.
await patch(join(decoded, 'smali_classes6', 'org', 'jellyfin', 'androidtv', 'JellyfinApplication.smali'), [[
  `    invoke-super {p0}, Landroid/app/Application;->onCreate()V
`,
  `    invoke-super {p0}, Landroid/app/Application;->onCreate()V

    invoke-static {p0}, Lcom/noctra/tv/NoctraProcess;->isSecondary(Landroid/content/Context;)Z

    move-result v0

    if-eqz v0, :noctra_main_process

    return-void

    :noctra_main_process
`
]]);
await cp(join(appsRoot, 'androidtv', 'web'), join(decoded, 'assets', 'noctra-tv'), { recursive: true });

// Contrôle à distance (« Lire sur… » depuis un téléphone ou un PC) : la
// commande reçue par Jellyfin ouvre le lecteur ou la fiche Noctra.
await patch(smali('data/eventhandling/SocketHandler.smali'), [[
  `    invoke-interface {v2, v0, v1, p1, v3}, Lorg/jellyfin/androidtv/util/PlaybackHelper;->retrieveAndPlay(Ljava/util/UUID;ZLjava/lang/Long;Landroid/content/Context;)V`,
  `    invoke-static {v3, v0, p1}, Lcom/noctra/tv/NoctraRemote;->play(Landroid/content/Context;Ljava/util/UUID;Ljava/lang/Long;)V`
], [
  `    invoke-direct {p0, p1, p2, p3}, Lorg/jellyfin/androidtv/data/eventhandling/SocketHandler;->onDisplayContent(Ljava/util/UUID;Lorg/jellyfin/sdk/model/api/BaseItemKind;Lkotlin/coroutines/Continuation;)Ljava/lang/Object;

    move-result-object p0

    return-object p0`,
  `    iget-object p0, p0, Lorg/jellyfin/androidtv/data/eventhandling/SocketHandler;->context:Landroid/content/Context;

    invoke-static {p0, p1}, Lcom/noctra/tv/NoctraRemote;->show(Landroid/content/Context;Ljava/util/UUID;)V

    sget-object p0, Lkotlin/Unit;->INSTANCE:Lkotlin/Unit;

    return-object p0`
]]);

// Lecteur Jellyfin ouvert depuis Noctra (NoctraPlayback) : à sa fermeture,
// retour à l'accueil Noctra au lieu de l'accueil Jellyfin.
const closeCheck = label => `
    invoke-static {v0}, Lcom/noctra/tv/NoctraPlayback;->close(Landroid/app/Activity;)Z

    move-result v0

    if-eqz v0, :${label}

    return-void

    :${label}
`;
const fragmentActivity = owner => `
    invoke-virtual {p0}, ${owner};->getActivity()Landroidx/fragment/app/FragmentActivity;

    move-result-object v0
`;
const overlay = 'Lorg/jellyfin/androidtv/ui/playback/CustomPlaybackOverlayFragment';
await patch(smali('ui/playback/CustomPlaybackOverlayFragment.smali'), [
  [
    // Après le contrôle « navigating » de Jellyfin : pendant le passage à
    // l'épisode suivant (écran « À suivre »), onStop appelle closePlayer, qui
    // ne doit rien faire ; seule une vraie fermeture ramène à Noctra.
    `.method public closePlayer()V
    .locals 2

    .line 1310
    iget-boolean v0, p0, ${overlay};->navigating:Z

    if-eqz v0, :cond_0

    return-void

    :cond_0
`,
    `.method public closePlayer()V
    .locals 2

    .line 1310
    iget-boolean v0, p0, ${overlay};->navigating:Z

    if-eqz v0, :cond_0

    return-void

    :cond_0
${fragmentActivity(overlay)}${closeCheck('noctra_jellyfin_screens')}`
  ],
  // Lecteur réellement ouvert : un retour ultérieur à l'accueil Jellyfin
  // (fin de lecture → « À suivre » → retour) ramène à Noctra.
  [
    `.method public onCreate(Landroid/os/Bundle;)V
    .locals 3

    .line 144
    invoke-super {p0, p1}, Landroidx/fragment/app/Fragment;->onCreate(Landroid/os/Bundle;)V
`,
    `.method public onCreate(Landroid/os/Bundle;)V
    .locals 3

    .line 144
    invoke-super {p0, p1}, Landroidx/fragment/app/Fragment;->onCreate(Landroid/os/Bundle;)V
${fragmentActivity(overlay)}
    invoke-static {v0}, Lcom/noctra/tv/NoctraPlayback;->started(Landroid/app/Activity;)V
`
  ]
]);
await patch(smali('ui/home/HomeFragment.smali'), [[
  `# virtual methods
`,
  `# virtual methods
.method public onResume()V
    .locals 1

    invoke-super {p0}, Landroidx/fragment/app/Fragment;->onResume()V
${fragmentActivity('Lorg/jellyfin/androidtv/ui/home/HomeFragment')}
    invoke-static {v0, p0}, Lcom/noctra/tv/NoctraPlayback;->home(Landroid/app/Activity;Ljava/lang/Object;)V

    return-void
.end method

`
]]);
await patch(smali('ui/browsing/MainActivity$backPressedCallback$1.smali'), [[
  `.method public handleOnBackPressed()V
    .locals 1
`,
  `.method public handleOnBackPressed()V
    .locals 1

    iget-object v0, p0, Lorg/jellyfin/androidtv/ui/browsing/MainActivity$backPressedCallback$1;->this$0:Lorg/jellyfin/androidtv/ui/browsing/MainActivity;
${closeCheck('noctra_jellyfin_back')}`
]]);

// Code Java : compilé contre Android et des signatures Media3 (stubs, jamais
// incluses dans l'APK) ; les vraies classes Media3 sont celles de Jellyfin.
const javaDir = join(work, 'java');
const generated = join(javaDir, 'gen', 'com', 'noctra', 'tv');
await mkdir(generated, { recursive: true });
await writeFile(join(generated, 'NoctraConfig.java'), `package com.noctra.tv;

/** Généré par apps/scripts/build-androidtv.mjs. */
final class NoctraConfig {
    static final String NOCTRA_URL = ${JSON.stringify(noctraUrl)};
    static final String JELLYFIN_URL = ${JSON.stringify(serverUrl)};
    static final String VERSION = ${JSON.stringify(versionName)};

    private NoctraConfig() { }
}
`);
const stubClasses = join(javaDir, 'stubs');
const noctraClasses = join(javaDir, 'classes');
await mkdir(stubClasses, { recursive: true });
await mkdir(noctraClasses, { recursive: true });
const javac = ['-encoding', 'UTF-8', '--release', '8', '-nowarn', '-Xlint:-options'];
run('javac', [...javac, '-cp', tools.androidAll, '-d', stubClasses,
  ...await listFiles(join(appsRoot, 'androidtv', 'stubs'), name => name.endsWith('.java'))]);
run('javac', [...javac, '-cp', `${tools.androidAll}${delimiter}${stubClasses}`, '-d', noctraClasses,
  ...await listFiles(join(appsRoot, 'androidtv', 'java'), name => name.endsWith('.java')), join(generated, 'NoctraConfig.java')]);
// Dex suivant ceux de Jellyfin (classes.dex, classes2.dex, … sans trou).
const dexCount = (await readdir(decoded)).filter(name => /^smali(_classes\d+)?$/.test(name)).length;
const dexName = `classes${dexCount + 1}.dex`;
const dexDir = join(javaDir, 'dex');
await mkdir(dexDir, { recursive: true });
run('java', ['-cp', tools.dx, 'com.android.dx.command.Main', '--dex', `--min-sdk-version=${minSdk}`, `--output=${join(dexDir, dexName)}`, noctraClasses]);

// ── 5. Reconstruction et signature ───────────────────────────────────────
step('Reconstruction (apktool + aapt2)');
const unsigned = join(work, 'unsigned.apk');
run('java', ['-jar', tools.apktool, 'b', '-o', unsigned, decoded]);
run('jar', ['uf', unsigned, '-C', dexDir, dexName]);
const aligned = join(work, 'aligned.apk');
await alignZip(unsigned, aligned);
step('Signature (apksig, schéma v2 : Android 7 et plus)');
await signApk({ tools, input: aligned, output, minSdk, workDir: work });

const badging = run(tools.aapt2, ['dump', 'badging', output]);
if (!badging.includes(`package: name='${packageName}'`) || !badging.includes('leanback-launchable-activity')) {
  throw new Error('APK final inattendu :\n' + badging.split('\n').slice(0, 8).join('\n'));
}
const manifestTree = run(tools.aapt2, ['dump', 'xmltree', output, '--file', 'AndroidManifest.xml']);
const entries = run('jar', ['tf', output]).split(/\r?\n/);
if (!manifestTree.includes('com.noctra.tv.NoctraHomeActivity') || !entries.includes(dexName) || !entries.includes('assets/noctra-tv/app.js')) {
  throw new Error(`APK final incomplet : accueil Noctra, ${dexName} ou assets/noctra-tv manquant.`);
}
const { size } = await stat(output);
console.log(`${relative(process.cwd(), output)} (${(size / 1048576).toFixed(1)} Mo) — ${packageName} ${versionName}, Android ${minSdk}+, Jellyfin ${serverUrl}, Noctra ${noctraUrl}`);
