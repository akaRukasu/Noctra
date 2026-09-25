# Noctra v170

## Mes medias

- Correction du chargement des images grises sur l'accueil.
- `/api/libraries` peut maintenant utiliser la cle API serveur en secours lorsque la session navigateur Jellyfin n'est pas encore disponible.
- Le proxy `/api/jellyfin/image/...` fonctionne avec la session utilisateur ou, en secours local, avec la cle API serveur.
- Le serveur sait utiliser une image de contenu recent si la vue de mediatheque Jellyfin ne fournit pas d'image primaire exploitable.
- Le client recupere le jeton Jellyfin avec plusieurs formes d'`ApiClient`, pas seulement `accessToken()`.
- Si une image injectee echoue, le client vide son cache local et retente l'hydratation.

## Version

- Client, serveur et PWA passent en `170.0.0` / `noctra-shell-v170`.
