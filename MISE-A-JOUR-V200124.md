# Noctra 200.0.124 — départ TV en retrait du direct

## Ce que montrait le diagnostic 200.0.123 (LiveWatch · BEIN SPORTS 1)
- L'attente de réserve de la 123 a bien fonctionné (« Préchargement du direct · 15 s… », puis `shaka-startup-reserve`).
- Mais la réserve est **restée bloquée à 7,58 s pendant les 20 s d'attente**, et la lecture a coupé deux fois dans la première minute.
- **Cause.**
  - Le fournisseur publie ses segments en retard sur l'horloge. Shaka calcule le bord du direct à partir de l'horloge : il le place donc plus loin que le dernier segment réellement disponible.
  - Au départ par défaut, il n'existait que ~7,5 s de contenu devant la position de lecture. La réserve ne pouvait pas dépasser ce qui était publié.
- Plus tard dans la session, une fois que quelques coupures ont reculé la lecture, la réserve monte à 42–45 s et tient plusieurs minutes. C'est l'état qu'on veut dès le départ.

## Correction
- Shaka démarre maintenant **30 s en retrait** de son bord du direct (`player.load(url, -30)`). Dans Shaka 5.2.10, une heure de départ négative est relative au direct, et bornée au début de la fenêtre.
- Au départ, environ 35 s de segments déjà publiés sont disponibles devant la lecture : la réserve de 15 s (200.0.123) devient atteignable, le plus souvent bien avant les 20 s d'attente maximum.
- Le décalage par rapport au direct est d'environ 35–40 s, ce qui correspond à l'état stable observé de toute façon après quelques minutes. Le bouton « En direct » permet toujours de revenir au bord.
- La reconnexion automatique passe par le même chemin et en profite aussi.

## Validation
- Nouveau test `tests/v200124-shaka-start-behind-live.mjs` (`npm run test:v200124`, qui enchaîne les tests 123 à 108). Il vérifie :
  - dans le Shaka embarqué, qu'un départ négatif est bien relatif au direct et borné à la fenêtre ;
  - que l'attente de réserve suit toujours le chargement.
- `tests/tv-shaka.mjs` vérifie que Shaka reçoit bien un départ à −30 s.
- Tous les tests qui réussissaient avant réussissent encore.

## À vérifier dans le prochain diagnostic
- `shaka-startup-reserve` avec `reserve` ≥ 15 et `waitedMs` bien inférieur à 20 000.
- `first-playing` avec un `bufferAhead` ≥ 15, et plus de coupure dans la première minute.
