# Noctra TV (Android TV, Google TV, Fire TV)

Noctra TV est l’appli **Jellyfin pour Android TV** (projet officiel [jellyfin-androidtv](https://github.com/jellyfin/jellyfin-androidtv), version 0.19.10), adaptée pour Noctra :

- **Serveur intégré.** Au démarrage, l’appli se connecte seule à `https://akarukasu.merlion.usbx.me/jellyfin` et ouvre directement la page d’authentification. Il n’y a plus d’adresse à saisir à la télécommande.
- **Marque Noctra.** Nom, icône, bannière du lanceur Android TV et logo sont ceux de Noctra.
- **Identifiant `com.noctra.tv`.** L’appli s’installe à côté de l’appli Jellyfin officielle, sans conflit.

L’interface est native, ce qui la rend fluide sur les boîtiers et les vidéoprojecteurs. La lecture passe par le lecteur vidéo d’Android (ExoPlayer) : MKV, HEVC, AC3/DTS et sous-titres sont lus directement quand l’appareil les prend en charge, sinon Jellyfin transcode.

Les fonctions propres à l’interface web de Noctra (demandes, TV en direct, téléchargements, automatisation) n’existent pas dans cette appli. Elles restent disponibles sur téléphone, sur PC et dans le navigateur.

## Construire

```bash
node apps/scripts/build-androidtv.mjs            # télécharge l’APK officiel v0.19.10 depuis GitHub
node apps/scripts/build-androidtv.mjs chemin/jellyfin-androidtv-v0.19.10-release.apk
```

Le script produit `dist/apps/Noctra-androidtv.apk`. Il ne demande que Java 17+ et Node.js, et pas le SDK Android. Voici ce qu’il fait :
1. il vérifie l’empreinte SHA-256 de l’APK Jellyfin ;
2. il le décode avec apktool ;
3. il applique les modifications ci-dessus, chacune vérifiée : une autre version de Jellyfin fait échouer la construction au lieu de produire une appli cassée ;
4. il reconstruit l’APK, l’aligne et le signe avec la clé Noctra (voir `apps/scripts/android-tools.mjs`).

Pour un autre serveur, définissez `NOCTRA_JELLYFIN_URL`.

Les images de la marque se trouvent dans `overlay/res`. Elles sont générées par `node apps/scripts/render-icons.mjs`.

## Licence

jellyfin-androidtv est distribué sous licence GNU GPL v2. Noctra TV en est une version modifiée, soumise à la même licence. Le code source d’origine est disponible sur https://github.com/jellyfin/jellyfin-androidtv (étiquette `v0.19.10`), et l’intégralité des modifications se trouve dans `apps/scripts/build-androidtv.mjs` et `apps/androidtv/overlay`.
