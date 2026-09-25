# Noctra v126

## LiveWatch — reprise en cours de lecture

- Corrige le cas observé sur iPhone où un direct LiveWatch VIP démarre correctement puis passe brutalement sur `flux iOS indisponible` après une coupure réseau/CDN.
- Une erreur transitoire de la balise vidéo n’est plus affichée comme une erreur terminale tant que HLS.js peut récupérer la lecture.
- Le resolver peut renouveler plusieurs fois **le même direct Premium** pendant une longue session (jusqu’à 6 tentatives rapprochées, budget réinitialisé après stabilité), au lieu d’une seule tentative pour tout le clic courant.
- Les renouvellements forcent `no-store` et un cache-buster afin de récupérer une URL LiveWatch/CDN réellement fraîche.
- En cas d’échec isolé du resolver sur réseau mobile, Noctra retente le même flux au lieu de basculer immédiatement en erreur.
- Aucun changement automatique de chaîne, fournisseur ou serveur ; le lecteur public avec pubs reste un secours manuel.

## Conservé

- Daddy TV / NorthTV / FrameTV restent sur leurs embeds officiels (v125).
- Profil réseau faible v124.
- OHA et WiTV inchangés.
- Correctifs récents qBittorrent, responsive releases, plein écran/PiP restent présents.

## Validation responsive et lecteur

- Supprime le débordement horizontal de la fiche média sur bureau en intégrant ses paddings à la largeur disponible.
- Corrige le dialogue de suppression qBittorrent à 320/390 px, y compris les noms longs et les trois actions.
- Masque le raccourci flottant Utilisateurs pendant l'ouverture d'un panneau afin qu'il ne recouvre plus les actions mobiles.
- Absorbe le rejet asynchrone de `exitFullscreen()` lors de la fermeture du Multiview.
- Affiche clairement Daddy TV, NorthTV et FrameTV comme lecteurs officiels même lorsqu'une session VIP principale est active.
