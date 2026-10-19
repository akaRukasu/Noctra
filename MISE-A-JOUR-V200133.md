# Noctra 200.0.133 — lecteur LiveWatch : relais des sous-domaines et diagnostic

Cette version contient aussi toutes les corrections de la 200.0.132 (voir `MISE-A-JOUR-V200132.md`).

## Symptôme
Sur les chaînes LiveWatch (livewatch.icu), le lecteur officiel s'ouvre avec la session VIP (« VIP transmis ») mais affiche « Chaîne introuvable ».

## Piste corrigée
Le lecteur LiveWatch tourne dans Noctra à travers un relais qui transmet la session VIP. Ce relais n'acceptait que `livewatch.icu` et `www.livewatch.icu`. Si le nouveau site appelle son API sur un sous-domaine (`api.livewatch.icu`, par exemple), ces appels partaient directement depuis la page. Le navigateur les bloquait (autre origine), et le lecteur concluait que la chaîne n'existe pas.
- Les sous-domaines LiveWatch (API, médias) passent maintenant par le relais, avec la session VIP et l'origine du site officiel.
- Jamais un autre domaine : `livewatch.icu.exemple.com` ou `faux-livewatch.icu` restent refusés.

Cette cause n'est pas confirmée : le site n'est pas joignable depuis l'environnement de développement.

## Diagnostic LiveWatch enrichi
`/api/tv/livewatch/diagnostics` (compte administrateur) indique désormais, dans `site` :
- le domaine utilisé et celui atteint après redirection (`finalOrigin`) ;
- le serveur d'authentification (Supabase) ;
- les hôtes appelés par la page d'accueil, le lecteur et leurs scripts.

Ce ne sont que des noms d'hôtes : aucun jeton ni mot de passe. Ces informations disent ce que le nouveau site attend, si la correction ne suffit pas.

## Validation
- Nouveau test `tests/v200133-livewatch-bridge-hosts.mjs` (`npm run test:v200133`, qui enchaîne les tests 132 à 108) :
  - sous-domaines LiveWatch acceptés ;
  - domaines voisins refusés ;
  - appels du lecteur vers un sous-domaine passant par le relais ;
  - diagnostic des hôtes.
- Tous les tests qui réussissaient avant réussissent encore.
- Non testé avec le vrai site (injoignable d'ici).
