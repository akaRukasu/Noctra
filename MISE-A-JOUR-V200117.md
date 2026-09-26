# Noctra 200.0.117 — apparence des sous-titres sur iPhone / iPad

## Problème
Sur iOS 27, la partie **Apparence** manquait dans les réglages des sous-titres (menu de la photo de profil → Sous-titres), quel que soit le compte, administrateur ou utilisateur.

Jellyfin n'affiche cette partie que si le navigateur répond à un test précis : `getComputedStyle(video, '::cue')` doit renvoyer un fond. Les versions récentes de Safari/WebKit (iOS 27) renvoient une valeur vide, alors qu'elles appliquent bien ces styles. Jellyfin concluait donc à tort que le navigateur ne savait pas styliser les sous-titres. Les autres navigateurs, et les versions d'iOS plus anciennes, n'étaient pas touchés.

## Correction
- Nouveau script `public/noctra-subtitle-appearance.js`, chargé juste avant le bundle Jellyfin.
- Sur un moteur qui gère `::cue` (WebKit d'Apple, ou `CSS.supports('selector(::cue)')`), la réponse vide de ce seul test est remplacée par une réponse valide.
- Tout autre appel à `getComputedStyle` est rendu tel quel. Les navigateurs qui répondaient déjà correctement ne voient aucun changement.
- Aucun accès réseau ni stockage.

## Validation
- Nouveau test `tests/v200117-subtitle-appearance.mjs` (`npm run test:v200117`, qui enchaîne les tests 116 à 108). Il rejoue la détection extraite telle quelle du bundle Jellyfin et vérifie :
  - iPhone sous iOS 27 et iPad en mode bureau : section disponible ;
  - Chrome/Android : comportement inchangé ;
  - moteur sans `::cue` : aucun correctif ;
  - autres appels à `getComputedStyle` inchangés ;
  - un seul correctif, même si le script est chargé deux fois.
- Contrôle dans Chromium en simulant la réponse vide d'iOS : la détection Jellyfin passe de « non » à « oui », et l'objet de style renvoyé reste pleinement utilisable.

## Bon à savoir
Sur téléphone en mode portrait, Noctra fixe la taille des sous-titres à 16 px pour qu'une réplique ne s'étale pas sur 4 lignes. Le réglage de taille s'applique donc surtout en mode paysage. Couleur, fond, ombre, police et position s'appliquent dans les deux orientations.
