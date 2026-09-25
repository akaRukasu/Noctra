# Noctra v76 — TV Recovery

Cette version ne modifie volontairement que la chaîne de lecture TV et les métadonnées de version/cache.

## LiveWatch
- Suppression du bridge HTML VIP comme chemin principal.
- Avec un VIP actif, une chaîne passe maintenant par le resolver serveur LiveWatch.
- Le resolver tente d'abord le flux VIP/HLS authentifié côté serveur.
- Le lecteur public LiveWatch reste uniquement le secours suivant si le flux VIP échoue réellement.
- Les jetons/cookies VIP restent côté serveur et ne sont pas ajoutés aux URLs remises au navigateur.

## WiTV
- Retour au comportement connu fonctionnel de la v66 : HLS public extrait remis directement à Hls.js/navigateur.
- Le lecteur web préparé reste en second choix.
- En cas d'erreur réseau HLS fatale, Noctra bascule automatiquement vers l'option suivante au lieu de relancer indéfiniment le même flux.

## OHA
- Le lecteur officiel OHA direct redevient le premier choix.
- Le bridge OHA via Noctra est conservé en second choix.
- Les serveurs natifs restent disponibles manuellement sans bloquer le clic initial.
- Les tunnels/signatures OHA introduits précédemment restent disponibles uniquement pour le mode « OHA via Noctra ».

## Lecteur TV
- Ajout d'un fallback générique sur l'option/serveur suivant lorsque le HLS courant échoue fatalement.
- Les modifications complexes de bridge ne sont plus sur le chemin principal des trois fournisseurs.
- WiTV, LiveWatch VIP et OHA ont désormais chacun un chemin principal distinct, choisi d'après le dernier comportement connu fonctionnel ou le lecteur officiel du fournisseur.

## Validation locale
- `npm run check`
- `npm test`
- cache PWA `noctra-shell-v76`
- version serveur `76.0.0`

La connectivité réelle des fournisseurs doit toujours être validée depuis l'instance Ultra.cc, l'environnement de construction ne disposant pas de résolution DNS sortante vers LiveWatch/OHA/WiTV.
