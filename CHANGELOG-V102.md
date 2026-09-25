# Noctra v102 — Desktop TV Rendering

## Correctif principal

- La TV n'utilise plus le conteneur `noctra-panel--workspace` sur desktop. Cette couche avait été ajoutée avec les workspaces quasi plein écran et constitue la principale différence commune entre le chemin PC défaillant et le chemin mobile fonctionnel.
- Le lecteur TV desktop sort explicitement des contraintes `contain: paint` / `content-visibility` sur la zone vidéo et ses ancêtres immédiats, afin de laisser Chromium composer normalement les frames vidéo.
- Les éléments vidéo/iframe TV desktop neutralisent aussi les transforms/filtres/will-change hérités qui peuvent créer une couche GPU séparée.
- La virtualisation du navigateur de chaînes reste active : la fluidité des gros catalogues n'est pas sacrifiée.

## Lecture

- Aucun changement dans `playTvDirectStream`, `playTvEmbedUrl`, la résolution OHA/WiTV ni dans la logique de lecture HLS historique.
- La route LiveWatch stable de la v101 est conservée.
- Mobile/iOS n'est pas modifié : le chemin déjà fonctionnel reste intact.

## Sécurité de l'archive

- Édition Server Safe : aucun composant Windows exécutable.
- La clé TMDB de bootstrap n'est plus embarquée dans l'archive. L'updater conserve le `.env` déjà installé sur le serveur.

Version : `102.0.0` / cache PWA `noctra-shell-v102`.
