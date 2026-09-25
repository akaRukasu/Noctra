# Noctra v163

## Correctifs

- Alternative : les clics dans le lecteur sont de nouveau actifs par défaut.
- Alternative : conservation d'un mode `Anti-popup dur` activable pour absorber les clics quand un lecteur ouvre trop de popups.
- Alternative : suppression des barres permanentes au-dessus et au-dessous de l'iframe pour laisser la vidéo respirer.
- TV : tri alphabétique appliqué a tous les catalogues de chaînes renvoyés par les sources TV.
- WiTV : le HLS reste prioritaire et n'est plus abandonné automatiquement vers le lecteur web au premier incident de chargement.
- WiTV : en cas de démarrage HLS lent, Noctra relance le chargement HLS au lieu de basculer tout seul en iframe.
- Démarrage : recentrage forcé du logo de splash screen.

## Tests

- `npm run check`
- `npm test`
- Vérification live WiTV : la page publique `https://witv.football/chaines-live/sport/` répond en HTTP 200 et renvoie bien un catalogue non trié côté source, corrigé par le tri final Noctra.

## Version

- Client/serveur/PWA passent en `163.0.0` / `noctra-shell-v163`.
