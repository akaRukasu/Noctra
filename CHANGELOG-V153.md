# Noctra v153

## OHA — audit et auto-réparation des routes

- Les routes publiques OHA `/watch?live=...` ne sont plus fabriquées à partir de `ids.id` : cet identifiant du catalogue n'est pas garanti comme étant le hash public du routeur OHA.
- Noctra inspecte désormais récursivement chaque entrée du catalogue OHA afin de récupérer les vraies routes `/watch?live=...` lorsqu'elles sont effectivement publiées dans les données de la chaîne, même lorsqu'elles sont imbriquées dans un objet/JSON plutôt que dans `entry.url`.
- Les routes réellement publiées sont prioritaires. Si aucune route publique fiable n'est présente, Noctra utilise `/live` puis retrouve automatiquement la chaîne par son identifiant/nom au lieu d'inventer une deep-link.
- La route confirmée de **Ligue 1+** est intégrée explicitement : `https://oha.cx/watch?live=505952112a3ea267236a1`.
- Si une route `/watch?live=...` devient obsolète après le démarrage de la SPA OHA et affiche `NOT FOUND / That route doesn't exist`, le bridge le détecte dans le DOM et revient automatiquement sur `/live`, puis relance la sélection de la même chaîne.
- Les routes candidates sont conservées dans la référence OHA de la chaîne pour que le lecteur puisse appliquer le même audit au moment du clic, même après pagination/rafraîchissement du catalogue.
- Un statut `OHA · route actualisée · recherche de la chaîne…` est affiché pendant ce mécanisme de récupération.

## Stabilité

- Les corrections v151 de recherche/scroll OHA et WiTV HLS sont conservées.
- Les intégrations FSTV / StreamSports99 de v152 sont conservées sans modification dans cette passe OHA.
- Client, serveur et service worker passent en `153.0.0` / `noctra-shell-v153`.
- Toute la suite de tests Noctra passe, avec un nouveau test de non-régression `v153-oha-route-audit.mjs`.

## Limite de vérification externe

L'API OHA `mediaurl-catalog.json` est un endpoint POST qui n'est pas interrogeable depuis l'environnement de build actuel (la vue web publique renvoie actuellement HTTP 501 pour le catalogue). La v153 ne prétend donc pas avoir validé manuellement plusieurs centaines d'URLs depuis l'extérieur : elle effectue l'audit à partir du **catalogue réellement reçu par ton serveur Noctra** et s'auto-répare si une route publique devient invalide côté SPA OHA.
