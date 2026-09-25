# Composants tiers

Le moteur de lecture inclus dans `public/client` est une compilation de Jellyfin Web 10.11.8, adaptée ici pour une utilisation dans un navigateur de bureau.

Jellyfin Web est distribué sous licence GPL-2.0-or-later. Le texte de licence est fourni dans `LICENSE-JELLYFIN-WEB.txt`. Le projet et son code source de référence sont disponibles à l’adresse suivante :

<https://github.com/jellyfin/jellyfin-web>

La couche d’interface Noctra (`public/noctra-shell.js`, `public/noctra-theme.css` et `server.mjs`) est distincte du moteur Jellyfin Web.


## HLS.js

Le lecteur TV charge HLS.js 1.6.16 pour la lecture HLS dans les navigateurs utilisant Media Source Extensions. HLS.js est distribué sous licence Apache-2.0 et reste un composant tiers distinct de Noctra.

<https://github.com/video-dev/hls.js>


## Police Sora

Les titres de l’interface utilisent la police Sora (variable, sous-ensembles latin et latin étendu, version 5.3.0 du paquet Fontsource), fichiers `public/fonts/sora-*.woff2`. Sora est distribuée sous licence SIL Open Font License 1.1, dont le texte est fourni dans `public/fonts/SORA-OFL.txt`.

<https://github.com/sora-xor/sora-font>


## iptv-org metadata (optional TV enrichment)

Noctra peut consulter les API publiques `channels.json`, `logos.json` et `guides.json` d’iptv-org pour rapprocher le nom d’une chaîne avec un logo et, lorsque disponible, une source de guide programmes. Les données sont utilisées comme enrichissement facultatif : aucun flux iptv-org n’est ajouté automatiquement à Noctra.
