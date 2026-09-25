# Noctra v94 — Stabilisation ciblée LiveWatch / OHA

La v94 part de la v93 et ne modifie pas le profil du lecteur HLS. Le retour terrain indique que WiTV est déjà stable ; les changements sont donc limités aux chemins LiveWatch et OHA afin de réduire les micro-coupures sans toucher aux serveurs ou à la logique de sélection.

## LiveWatch

- Le proxy média ne garde plus un `AbortSignal.timeout(30 s)` actif pendant toute la durée du body d'un flux : le délai protège uniquement l'établissement de la connexion et la réception des headers.
- Les ressources média provenant du bridge sont relayées progressivement au navigateur au lieu d'être systématiquement chargées en mémoire avant envoi.
- Les playlists HLS réutilisent une référence locale stable pour une même URI enfant entre deux rafraîchissements. Cela évite de présenter à HLS.js une nouvelle URL Noctra pour le même segment à chaque reload de playlist.
- `X-Accel-Buffering: no`, `flushHeaders()`, TCP no-delay et keep-alive sont appliqués aux réponses média du chemin LiveWatch.

## OHA / oha.cx

- Même principe de timeout limité à l'établissement de la réponse pour les ressources média.
- Les segments/flux externes résolus par le lecteur OHA sont maintenant relayés dès les premiers octets. La v93 attendait encore `response.arrayBuffer()` sur plusieurs chemins OHA, ce qui ajoutait une latence égale au téléchargement complet du segment avant que le navigateur ne puisse commencer à le consommer.
- Les playlists issues du bridge/site OHA utilisent elles aussi des références HLS stables.
- Le buffering intermédiaire Nginx est désactivé lorsque le reverse proxy honore `X-Accel-Buffering: no`.

## Ce qui ne change pas

- WiTV conserve le chemin de transport v93.
- Aucun changement automatique de chaîne, serveur ou fournisseur.
- Aucun watchdog de lecture n'est réintroduit.
- Le profil HLS v93 reste : `lowLatencyMode: true`, `backBufferLength: 30`, `maxBufferLength: 45`, reprise réseau/média minimale.
- Toutes les optimisations de fluidité desktop des v91/v92 sont conservées.

## Version

- Noctra : `94.0.0`
- Cache PWA : `noctra-shell-v94`
