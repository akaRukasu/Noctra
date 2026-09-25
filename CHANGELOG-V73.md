# Noctra Media Client v73

## Objectif

La v73 arrête les changements successifs de stratégie TV et repart des chemins qui ont réellement fonctionné dans les versions précédentes, tout en corrigeant les régressions déterministes trouvées dans la v72.

## LiveWatch VIP Premium

- Correction d’un bug réel dans `server.mjs` : trois caractères de contrôle `BACKSPACE` avaient remplacé les `\b` de la regex chargée de reconnaître les proxys LiveWatch officiels. Une URL valide pouvait ainsi être refusée comme flux inattendu.
- Retour au chemin v66 : lorsqu’un VIP partagé est actif, une chaîne ouvre directement `/api/tv/livewatch/stream/...` dans le lecteur HLS Noctra.
- Suppression de la pré-validation master → playlist → segment dans le chemin de lecture normal. Cette sonde reste disponible pour le diagnostic, mais elle ne peut plus consommer un lien temporaire avant Hls.js.
- Le lecteur public LiveWatch avec publicités reste un **secours manuel** et n’est plus lancé automatiquement avant le VIP.
- Les cookies `Set-Cookie` reçus au fil des playlists HLS sont fusionnés et transmis aux ressources suivantes lorsque l’hôte reste identique.
- Le bearer et les cookies LiveWatch sont supprimés automatiquement lorsqu’une playlist pointe vers un CDN tiers.
- Le resolver VIP manuel reste disponible mais ne pré-sonde plus le flux.

## WiTV

- Restauration du comportement de la v66, qui était le dernier chemin confirmé comme stable sur l’instance utilisateur.
- Noctra charge le player public WiTV côté serveur, extrait le `streamUrl` HLS public puis transmet **directement** ce HLS au navigateur/Hls.js.
- Le HLS WiTV n’est pas forcé dans le proxy Node, ce qui évite les problèmes rencontrés avec certains redirects/CDN signés.
- Pour chaque serveur HLS extrait, le lecteur web WiTV préparé par Noctra est conservé juste après comme solution de secours.
- Les références WiTV restent stateless et survivent aux redémarrages du processus Node.

## OHA

- Le clic sur une chaîne n’attend plus plusieurs tentatives de résolution native avant d’afficher quelque chose.
- Le **lecteur officiel OHA** devient le premier chemin de lecture.
- Ajout d’un pont OHA isolé sous `/api/tv/oha/embed/...` : Noctra récupère la page officielle, retire uniquement les restrictions qui empêchent son affichage dans une iframe et l’exécute dans un sandbox sans `allow-same-origin`.
- Ajout d’un tunnel strictement limité aux domaines `oha.to`, `www.oha.to`, `oha.cx` et `www.oha.cx` pour les appels du lecteur officiel.
- Le tunnel relaie la méthode, le corps, `Range` et la valeur `mediahubmx-signature` **uniquement lorsqu’elle a été produite par le JavaScript officiel OHA**. Noctra ne fabrique et ne contourne aucune signature.
- Les scripts/styles OHA hébergés sur les domaines officiels peuvent également passer par ce tunnel, avec CORS adapté au sandbox isolé.
- Le lecteur officiel envoie à Noctra un état `playing/error` lorsqu’un élément vidéo est détecté.
- Un deuxième choix **OHA direct** reste disponible, puis les serveurs natifs peuvent être essayés manuellement.
- Les essais natifs existants restent présents pour compatibilité, mais ne bloquent plus la lecture initiale.

## HLS / proxy TV

- Nouvelle propagation des cookies playlist par playlist.
- Les URI de variantes, segments et clés `URI="..."` continuent d’être réécrites vers des références Noctra.
- Les credentials sensibles sont conservés uniquement sur le même hôte et supprimés lors d’un changement de domaine.

## Cache et versions

- Version serveur/package : `73.0.0`.
- Cache PWA : `noctra-shell-v73`.
- Shell, thème, manifeste, icônes et HLS.js utilisent désormais tous `?v=73`.
- Métadonnées du client desktop/Tauri alignées sur `73.0.0`.
- Correction d’un reliquat v72 dans le message de démarrage du serveur.

## Tests ajoutés

La v73 ajoute `tests/tv-playback-regressions.mjs`, qui vérifie notamment :

- absence des caractères de contrôle ayant cassé LiveWatch ;
- acceptation simulée d’un proxy LiveWatch VIP officiel ;
- conservation du bearer/cookie sur LiveWatch et suppression lors d’un passage vers un CDN tiers ;
- fusion des cookies HLS entre playlists ;
- réécriture des variantes et clés HLS ;
- extraction simulée d’un HLS WiTV et présence de son lecteur web de secours ;
- préparation de la page OHA, restriction des domaines du tunnel et installation du bridge avant les scripts officiels.

`npm run check` et l’intégralité de `npm test` passent avec succès. Un smoke test sous `BASE_URL=/noctra` répond également en `73.0.0`.

## Limite du test de construction

L’environnement de construction n’a pas de résolution DNS sortante vers les fournisseurs TV. Il est donc impossible d’affirmer qu’un segment vidéo réel LiveWatch/OHA/WiTV a été lu depuis cet environnement. La v73 corrige cependant les régressions reproductibles dans Noctra et teste les chemins de lecture avec des réponses simulées, puis laisse le test réseau réel à l’instance Ultra.cc.
