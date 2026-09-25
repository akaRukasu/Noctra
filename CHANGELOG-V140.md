# Noctra V140

## TV

- Stabilise les gros segments LiveWatch, NorthTV, FrameTV et OHA avec un tampon plus profond et davantage de reprises contrôlées.
- Renouvelle le même direct résolu après une coupure avec HLS.js comme avec le moteur HLS natif.
- Donne la priorité à HLS.js sur desktop lorsque le support HLS natif annoncé reste bloqué.
- Bascule WiTV vers son lecteur web officiel après 12 secondes sans média ou après une erreur de démarrage.
- Empêche une fermeture de segment déjà commencé de faire tomber le serveur avec `ERR_HTTP_HEADERS_SENT`.
- Enrichit le diagnostic local du lecteur sans enregistrer d'URL, de cookie ni de jeton.

## Interface

- Réagit au chargement tardif de « Continuer à regarder » sans dépendre d'une action Cast ou SyncPlay.
- Réduit le bandeau mobile à 64 px tout en conservant les commandes tactiles de 42 px.

## Validation

- Catalogues testés : LiveWatch, OHA, NorthTV, WiTV, FrameTV, Sports, Football Live et BossTV.
- Résolveurs et premiers segments testés sur LiveWatch, OHA, NorthTV, WiTV et FrameTV.
- Lectures prolongées validées sur LiveWatch et FrameTV, repli officiel validé sur WiTV, rendu TV contrôlé sur desktop et mobile.
- Suite complète de 54 tests passée.
