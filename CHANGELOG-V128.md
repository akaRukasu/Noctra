# Noctra v128

## NorthTV

- Relais same-origin de l'embed officiel NorthTV lorsque la session LiveWatch VIP est active.
- Neutralisation du blocage `X-Frame-Options: SAMEORIGIN` sans fabriquer de route HLS privée.
- Conservation de l'iframe officielle comme moteur de lecture pour éviter les boucles de reconnexion historiques.

## Picture in Picture iOS

- Détection WebKit prioritaire sur iPhone et iPad.
- Suppression du faux positif `document.pictureInPictureEnabled` dans la PWA installée.
- Confirmation de l'état WebKit avant de considérer le passage en PiP comme réussi.
- Safari normal conserve les chemins WebKit et standard.

## LiveWatch

- Catalogue principal persistant dans `runtime/livewatch-catalog-cache.json`.
- Préchauffage non bloquant au démarrage du serveur.
- Rafraîchissement stale-while-revalidate et cache mémoire porté à quinze minutes.
- Déduplication des téléchargements de catalogue simultanés.

Version : `128.0.0`
Cache PWA : `noctra-shell-v128`
