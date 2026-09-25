# Noctra 200.0.76 — compatibilité d’authentification Jellyfin 12

Jellyfin 12 désactive les anciens mécanismes d’authentification, y compris lors d’une mise à jour. La version 200.0.75 de Noctra les employait encore à plusieurs endroits. Cela peut provoquer des sessions refusées, des reconnexions perdues et une connexion temps réel indisponible.

## Corrections

- Serveur Noctra : `Authorization: MediaBrowser Token="…"` remplace `X-Emby-Token` pour les sessions utilisateur et la clé API serveur. Les valeurs sont encodées conformément au protocole Jellyfin.
- Client intégré : la validation du compte mémorisé utilise `Authorization` au lieu de `X-MediaBrowser-Token`.
- WebSocket et téléchargement : `ApiKey` remplace le paramètre obsolète `api_key`. Le WebSocket conserve le chemin `/socket` sous l’URL de base configurée, sans réécriture vers `embywebsocket`. Son URL contenant le jeton n’est plus journalisée.
- Cache : l’URL du bundle corrigé porte une nouvelle version pour éviter la réutilisation de l’ancien fichier mis en cache pendant un an. Version affichée et cache PWA mis à jour.

Les paramètres `api_key` des autres fournisseurs ne sont pas des paramètres Jellyfin et restent inchangés. Cette mise à jour conserve le moteur et les personnalisations Noctra existants ; elle ne remplace pas l’ensemble du client par Jellyfin Web 12.

## Installation

1. Sauvegarder l’installation Noctra actuelle.
2. Appliquer cette archive avec la procédure de mise à jour Noctra habituelle, en conservant `.env`, `runtime` et les données persistantes. Sur une installation Ultra qui dispose déjà de la commande, utiliser `noctra-update /chemin/noctra-media-client-v200.0.76.zip`.
3. Redémarrer Noctra puis recharger la page avec Ctrl+F5. Sur mobile/PWA, fermer et rouvrir l’application.
4. Vérifier que la version affichée est **200.0.76**. Si la session a déjà été effacée par l’ancienne version, se reconnecter une fois.
5. Vérifier l’accueil, les affiches, un film, la reprise de lecture et la reconnexion après fermeture du navigateur.

Jellyfin 12 supprime aussi les anciens alias `/emby/` et `/mediabrowser/`. Si votre configuration utilise un alias fourni auparavant par Jellyfin, renseigner l’URL réelle du serveur dans `JELLYFIN_URL` et dans la connexion du client. Conserver les sous-chemins réellement définis par votre reverse proxy ; Noctra ne les retire pas automatiquement.

## Validation et limites

Validés avec Node.js 24.14.0 :

- `npm run check` et contrôle syntaxique du bundle API modifié.
- `npm run test:v200076` : exécution du véritable bundle client et des routes HTTP Noctra avec un faux serveur qui refuse les anciens en-têtes. Couverture : compte mémorisé, requête utilisateur, URL WebSocket et téléchargement, sous-chemins serveur/client, cookie de session, rejet d’un jeton invalide, droits non-administrateur, image via clé API et nouvelle URL de cache.
- Tests existants `v20013-api`, `v200075-late-cards`, `v200074-quality`, `v200073-carousel`, `v200072-regressions`, `v200071-grid`, `v200064-playback`, `v200057-playback`, `v20023-playback-details`.

La commande globale `npm test` est bloquée dès son prétest historique `v20021-responsive-media-ui.mjs`, qui impose la version 200.0.21. Ces anciennes assertions ne valident déjà pas la version 200.0.75 fournie. La suite globale n’est donc pas déclarée réussie.

Pas de connexion au serveur Jellyfin réel de l’utilisateur, de décodage d’un vrai média ni de négociation WebSocket réelle : le test contrôle l’URL produite et simule l’API d’authentification. Les migrations du serveur, les plugins et le reverse proxy ne sont pas vérifiés par ces tests.

Sources : [annonce Jellyfin 12](https://jellyfin.org/posts/jellyfin-release-12.0/), [protocole d’authentification](https://gist.github.com/nielsvanvelzen/ea047d9028f676185832e51ffaf12a6f), [implémentation serveur v12.0](https://github.com/jellyfin/jellyfin/blob/v12.0/Jellyfin.Server.Implementations/Security/AuthorizationContext.cs).
