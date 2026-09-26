# Noctra 200.0.125 — direct TV : plus de boucle hors fenêtre, lien expiré renouvelé à temps

Contient aussi la 200.0.124 (départ 30 s en retrait du direct).

## Ce que montrait le diagnostic 200.0.123 (LiveWatch · BEIN SPORTS 1, 65 min de match)

### À 51 min : 4 minutes sans image
- Au fil des coupures, la lecture avait accumulé ~110 s de retard sur le direct.
- Pendant une panne du fournisseur, elle est sortie de la fenêtre de 120 s. Par défaut, Shaka la ramène alors au **début** de la fenêtre, 11 s plus loin, en annulant les téléchargements en cours.
- La fenêtre avançant pendant ce temps, la lecture ressortait 11 s plus tard, et ainsi de suite : 22 sauts et 44 téléchargements annulés, jusqu'à 245 s sans segment reçu.

### À 63 min : lien expiré
- La playlist du fournisseur répond `404` en boucle, avec encore 25 s de réserve.
- Pour Shaka ce sont des erreurs non fatales : rien ne renouvelait le lien avant que la lecture se fige.

## Corrections
- **Hors de la fenêtre du direct**, Shaka revient maintenant **20 s avant le bord** (`returnToEndOfLiveWindowWhenOutside`, `safeSeekEndOffset: 20`). Les segments y existent, le saut n'a lieu qu'une fois, et le retard accumulé est remis à zéro. Le bouton « En direct » n'est pas affecté (il vise la fin de la fenêtre).
- **Lien expiré** : 3 réponses 403/404/410 de la playlist en moins de 60 s, lecture déjà lancée, suffisent à renouveler le lien LiveWatch aussitôt. Le renouvellement passe par le chemin de reconnexion existant, qui laisse la réserve se lire pendant la résolution. Un événement `shaka-link-expired` est ajouté au diagnostic. Un segment en 404 ne déclenche rien.

## Validation
- Nouveau test `tests/v200125-shaka-window-link.mjs` (`npm run test:v200125`, qui enchaîne les tests 124 à 108). Il vérifie :
  - la configuration du lecteur ;
  - le comportement correspondant dans le code du Shaka embarqué ;
  - la détection du lien expiré.
- `tests/tv-shaka.mjs` rejoue le scénario :
  - deux 404 de playlist : rien ne se passe ;
  - troisième 404 : un seul renouvellement, avec `refresh=1` ;
  - un 404 de segment ne déclenche rien.
- Tous les tests qui réussissaient avant réussissent encore.

## À vérifier dans le prochain diagnostic
- `shaka-startup-reserve` avec au moins 15 s obtenues avant 20 s d'attente (200.0.124).
- Plus de série de `shaka-seeking` + `shaka-download-cancelled` toutes les 11 s.
- En cas d'expiration du lien : `shaka-link-expired`, puis reprise du direct sans gel prolongé.
