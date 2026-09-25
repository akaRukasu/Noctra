# Noctra V141

## TV

- Réunit les boutons Outils TV et plein écran dans une capsule translucide plus lisible au-dessus de la vidéo.
- Différencie les deux actions par des teintes menthe et bleu clair, sans bordure ni halo.
- Conserve les dimensions tactiles et le placement adaptés au lecteur mobile.
- Ne modifie ni les événements, ni le plein écran, ni le panneau Outils TV.
- Privilégie le moteur HLS natif d’iOS pour NorthTV afin de commencer plus tôt le décodage de ses gros segments, avec HLS.js conservé en secours.
- Donne aux playlists NorthTV une URL locale stable pour renouveler leurs segments sans changer de ressource côté lecteur.
- Relaye le HLS WiTV avec les en-têtes `Origin` et `Referer` du lecteur officiel, exigés par son CDN.
- Maintient le transport des gros segments WiTV au-delà du délai générique de 30 secondes sur une connexion mobile lente.
- Restaure ainsi le plein écran vidéo natif iOS pour WiTV quand son HLS est disponible ; l’iframe reste un secours.

## Validation

- Contrôles vérifiés sur desktop et mobile.
- API, manifeste et premier segment comparés entre NorthTV et FrameTV ; défaut d’en-têtes WiTV reproduit puis corrigé dans le relais.
- Suite complète de tests passée.
