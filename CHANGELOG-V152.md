# Noctra v152

## TV — FSTV

- Remplace l’iframe distante FSTV par un **bridge same-origin Noctra** pour les pages `fstv.rest`.
- Les scripts, feuilles de style, images, formulaires et requêtes XHR/fetch FSTV restent dans leur arborescence officielle mais transitent par Noctra afin que DataLife Engine conserve la route et la session de la chaîne.
- Les cookies publics renvoyés par FSTV sont conservés uniquement pour le bridge de la chaîne sélectionnée.
- Le bridge détecte ensuite la zone vidéo/lecteur et la place au premier plan dans le Centre TV, sans modifier les autres sources.
- Aucun jeton privé, clé ou DRM n’est extrait.

## Sports — StreamSports99

- La découverte ne dépend plus uniquement du HTML hydraté de `streamsports99.su`.
- Noctra interroge en priorité l’API Sports publique CDN Live TV utilisée par l’écosystème StreamSports99 : `https://api.cdn-live.tv/api/v1/events/sports/?user=cdnlivetv&plan=free`.
- Les événements live/à venir deviennent de vraies entrées Noctra avec sport, compétition, équipes, horaire et lecteur iframe public documenté.
- Les pages publiques StreamSports99 (`/player/...`, `/live-tv/...`) et ses miroirs restent un secours/complément pour les sports non présents dans l’API agrégée.
- Le faux canal générique n’est pas réintroduit quand aucun événement n’est disponible.

## Stabilité

- Version client/serveur/PWA alignée sur `152.0.0` / `noctra-shell-v152`.
- Les correctifs v151 WiTV HLS, OHA routes/recherche, ainsi que les grilles desktop/mobile v149 restent inchangés.
- Toute la suite de tests Noctra est exécutée avec un test de régression v152 dédié à FSTV et StreamSports99.
