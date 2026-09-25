# Noctra v123 — restauration LiveWatch / plein écran iOS / PiP propre

Base : v122 Server Safe.

## TV — LiveWatch restauré

- Restaure le cœur de lecture LiveWatch qui était stable en v112 : HLS.js + ManagedMediaSource en priorité sur iPhone/iPad, HLS natif uniquement en secours.
- Restaure l’ordre de résolution Premium : **VIP direct → VIP LiveWatch officiel → public manuel**.
- Le lecteur public avec publicités n’est plus sélectionné automatiquement avant le VIP.
- Daddy TV, NorthTV et FrameTV conservent un chemin Premium prioritaire quand la session VIP partagée est active ; leur embed public reste uniquement un secours manuel.
- Les univers Sports / Football Live / BossTV / JackTV / Matchs du jour restent isolés de la détection du catalogue LiveWatch principal afin d’éviter les faux resolvers.
- La reprise après erreur fatale du direct principal garde le mécanisme de récupération stable sans bascule automatique de chaîne ou fournisseur.

## TV — plein écran iPhone/iPad

- Restaure la séquence native WebKit éprouvée : `webkitEnterFullscreen()` puis anciens fallbacks WebKit.
- Le bouton plein écran réutilise directement la balise vidéo active sans recharger le flux.
- Si iOS accepte l’appel sans réellement ouvrir le plein écran, Noctra conserve le fallback viewport déjà prévu, sans second clic.

## TV — Picture in Picture

- Supprime le gros bouton PiP flottant qui chevauchait les contrôles du lecteur.
- Le PiP est déplacé dans **Outils TV** et n’est activé que lorsqu’un véritable flux vidéo compatible est détecté.
- Sur iPhone/iPad en PWA installée, Noctra n’affiche plus un contrôle qui échoue : l’outil indique que le PiP est disponible dans Safari lorsque WebKit ne l’expose pas au mode standalone.
- En Safari normal, Noctra conserve la tentative PiP manuelle et la tentative lors du passage en arrière-plan quand WebKit l’autorise.

## Conservé depuis v122/v121

- Correction OHA `/watch?live=...` et fallbacks OHA.
- Suppression torrent v1/v2 et dialogue iOS fiabilisé.
- Polling qBittorrent temps réel.
- Responsive mobile de la sélection manuelle Radarr/Sonarr.
- Ordre des sources : LiveWatch, OHA, NorthTV, WiTV, Daddy TV, FrameTV.

## Validation

- Suite complète `npm test` : OK.
- `node --check public/noctra-shell.js` : OK.
- `node --check server.mjs` : OK.
- Nouveau test v123 protégeant l’ordre VIP, le chemin HLS iOS, le plein écran natif et l’intégration PiP.
