# Noctra Media Client — Changelog V106

## TV — diagnostic et faux bandeau d’erreur
- Ajout d’un diagnostic TV local accessible depuis `Outils TV`.
- Le diagnostic enregistre les événements HLS/video, le buffer, readyState/networkState, les erreurs HTTP remontées par HLS.js et les frames perdues.
- Aucune URL, cookie, jeton LiveWatch ou donnée d’authentification n’est incluse dans le diagnostic copiable.
- Le bandeau `Flux indisponible · le serveur sélectionné reste actif` n’est plus affiché immédiatement sur une erreur HTMLMediaElement transitoire.
- Si la vidéo reprend réellement, l’état repasse automatiquement en lecture et le faux bandeau rouge disparaît.
- Les événements `playing`, `canplay`, `timeupdate`, `waiting`, `stalled` et `error` sont désormais gérés pendant toute la session via un AbortController, sans empilement de listeners lors du zapping.

## LiveWatch — récupération même source
- Les erreurs HLS non fatales sont diagnostiquées mais ne mettent plus le lecteur en erreur.
- Jusqu’à 3 reprises réseau contrôlées sur exactement le même flux LiveWatch.
- Jusqu’à 2 récupérations média contrôlées.
- Aucun changement automatique de chaîne, serveur ou fournisseur.
- Les reprises sont temporisées pour éviter une boucle agressive.

## Responsive
- Les corrections desktop V105 restent présentes.
- Le panneau de diagnostic dispose d’un layout desktop et mobile dédié.

## Server Safe
- Aucun binaire Windows ajouté.
