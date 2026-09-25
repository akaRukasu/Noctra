# Noctra v157

- Volkamax : suivi du renvoi JavaScript `volkamax.club` vers `bzh-sport.lat`, puis reconstruction des cartes avec des URLs locales Noctra. La source ne retombe plus à `0 bouquet` quand la page officielle ne sert qu'un `location.href`.
- Volkamax : les cartes ouvrent le bridge Noctra local `/api/tv/volkamax/embed/...` au lieu de transformer ce chemin en URL distante invalide.
- WiTV : le lecteur web officiel est sélectionné par défaut. Les options HLS restent disponibles manuellement, mais Noctra ne force plus le HLS au démarrage.
- Alternative : chaque lien Haloule s'ouvre maintenant dans un navigateur intégré Noctra avec barre de titre et bouton `Ouvrir dehors` si le site refuse l'intégration iframe.
- Version : client/serveur/PWA passent en `157.0.0` / `noctra-shell-v157`.

Tests :

- `npm run check`
- `npm test`
