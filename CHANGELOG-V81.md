# Noctra Media Client v82 — LiveWatch plus rapide / logos / OHA imbriqué

## Objectif

Stabilisation ciblée de la TV à partir de la v80. LiveWatch Premium fonctionne déjà : cette version réduit son délai de lancement et améliore les logos. OHA reçoit une correction du bridge pour les lecteurs imbriqués. La logique WiTV n'est pas modifiée.

## LiveWatch Premium

- Le lecteur **VIP Premium · LiveWatch officiel** est désormais préparé immédiatement au clic.
- Suppression de la tentative HLS spéculative pouvant attendre jusqu'à 7 secondes avant d'ouvrir le lecteur Premium officiel.
- La session VIP n'est plus renouvelée de force à chaque changement de chaîne : elle n'est rafraîchie que lorsqu'elle approche réellement de son expiration.
- Le lecteur public avec deux pubs reste uniquement un secours manuel.
- Le catalogue principal reste `/api/v1/public/all` ; DaddyTV/NorthTV/FrameTV ne sont pas fusionnés dans l'onglet LiveWatch.

## Logos LiveWatch

- Correction du paramètre `logoRefresh=1` : il déclenche maintenant réellement l'enrichissement des logos côté serveur.
- Le premier rafraîchissement différé des logos LiveWatch intervient après ~1,2 s au lieu de ~6,5 s.
- L'identité des chaînes ignore mieux les suffixes géographiques comme `France`, `Belgique`, `Suisse`, `Canada`, `USA`, etc., afin d'augmenter les correspondances avec la base de logos.
- Le système de cache/proxy d'images existant est conservé.

## OHA / oha.cx

- `https://oha.cx/live` reste le point de départ primaire.
- Le bridge OHA fournit maintenant un `localStorage` et `sessionStorage` en mémoire au lecteur officiel. Cela évite les erreurs de stockage possibles dans l'iframe sandboxée à origine opaque.
- Les pages OHA chargées dans des iframes imbriquées sont désormais **préparées récursivement** par le même bridge au lieu d'être renvoyées comme HTML brut.
- Un lecteur imbriqué qui détecte un média relaie maintenant son état `noctra-oha-state` jusqu'à la fenêtre Noctra principale ; l'interface peut donc sortir de « OHA · en attente du lecteur officiel… » lorsque le média a réellement été résolu.
- Le même traitement récursif s'applique aux pages HTML OHA obtenues via le tunnel HTTP officiel après redirection.
- Les signatures et le relais média déjà présents sont conservés.

## WiTV

- **Aucune modification de la logique WiTV.**
- Les tests de régression continuent de comparer les blocs critiques WiTV aux empreintes de la version de référence.

## Version / cache

- Version : `82.0.0`
- Cache PWA : `noctra-shell-v82`
- Marqueur TV : `NOCTRA · TV EN DIRECT · v82`
- `/health` et `/api/config` : `82.0.0`
