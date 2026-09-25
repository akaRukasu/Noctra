# Noctra v70 — dock finalisé et lecture TV stabilisée

## Dock

- Suppression de l'espace vide entre le logo Noctra et le premier raccourci.
  - La cause était le bouton d'installation PWA : il conservait une largeur de 42 px à cause d'une ancienne règle `display: grid !important` alors qu'il portait l'attribut `hidden`.
  - En v70, `[hidden]` reprend explicitement la priorité et ne réserve plus aucune place.
- Suppression de la « double bulle » autour du N.
  - Le bouton parent du logo est désormais transparent, sans bordure ni ombre.
  - Seule la forme du logo Noctra reste visible dans la capsule principale.
- Espacement interne réduit à 2 px afin de retrouver un dock compact et continu.

## LiveWatch / VIP

- Le lecteur officiel LiveWatch redevient le chemin de lecture prioritaire et stable, y compris quand le VIP est connecté.
- L'iframe officielle démarre toujours en premier. Le pont VIP n'est tenté qu'après son `onload`, donc il ne concurrence plus le démarrage de la chaîne.
- Avant toute bascule VIP, Noctra valide désormais le chemin HLS jusqu'à une vraie ressource média (master → playlist média → segment). Un simple HTTP 200 ne suffit plus.
- Si cette validation échoue, l'iframe officielle déjà chargée reste affichée sans interruption.
- La session VIP, son renouvellement et le diagnostic restent gérés côté serveur Noctra.
- Le catalogue LiveWatch reste progressif et multi-source : un endpoint lent ne doit pas empêcher les autres catalogues d'apparaître.

## OHA

- Le résolveur natif OHA conserve la priorité, mais dispose maintenant d'un budget de temps court et borné.
- Si les serveurs natifs ne donnent aucun flux vidéo exploitable, Noctra bascule automatiquement sur le lecteur web OHA de la chaîne au lieu de rester bloqué sur le chargement.
- Les serveurs natifs restent proposés manuellement lorsque disponibles.
- Le parseur continue à privilégier les vrais flux HLS/MP4/MPD et à ignorer les pages/images parasites.

## WiTV

- Aucun changement du chemin de lecture WiTV : son fonctionnement de la v69 est volontairement conservé.

## Cache et version

- Version serveur / desktop / manifeste : `70.0.0`.
- Cache PWA : `noctra-shell-v70`.
- Ressources principales et HLS.js : `?v=70`.

## Vérifications locales

- Syntaxe Node du serveur et du shell.
- Tests statiques et responsive existants.
- Tests du dock : bouton PWA caché sans espace réservé + logo sans capsule imbriquée.
- Tests LiveWatch : priorité de l’embed officiel, déclenchement VIP uniquement après `onload` et validation HLS jusqu’à une ressource média.
- Tests OHA : sélection du flux natif et repli web automatique.
- Smoke test du serveur sous `BASE_URL=/noctra`.

Les appels réels aux serveurs LiveWatch/OHA ne peuvent pas être validés depuis l'environnement de construction lorsqu'il bloque les sorties DNS ; la v70 teste donc le chemin applicatif, les fallbacks et les régressions de code, puis le flux amont doit être confirmé sur l'instance Noctra connectée à Internet.
