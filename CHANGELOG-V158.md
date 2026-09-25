# Noctra v158

## Alternative

- L'onglet Alternative ne collecte plus toute la page Haloule : Noctra se limite aux sections de diffusion live (`1.1` chaînes 24/24 et `1.2` sites live TV).
- Les liens applications, navigateurs, VPN, cast/receiver, hébergeurs, téléchargements et guides sont filtrés pour éviter de les afficher comme des chaînes.
- Les liens Clictune/Dlink publics sont résolus côté serveur quand la destination finale est exposée dans la page de redirection.
- Le navigateur intégré affiche directement la destination résolue, avec le bouton `Ouvrir dehors` conservé en secours.

## Volkamax

- Le pont Volkamax garde le lecteur fonctionnel mais le charge dans une iframe sandboxée pour bloquer popups et navigation forcée.
- La page locale neutralise `window.open` et indique que les popups sont bloquées.

## Version

- Client/serveur/PWA passent en `158.0.0` / `noctra-shell-v158`.

## Tests

- `npm run check`
- `npm test`
