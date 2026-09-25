# Noctra v99 — TV Polish & Multiview Stability

## TV normale protégée
- Le workspace et les quatre blocs critiques de lecture restent identiques à la base TV v94, hors numéro de version.
- Aucun changement automatique de serveur n'est réintroduit.
- WiTV, LiveWatch et OHA conservent leurs chemins de lecture actuels.

## Qualité vidéo
- Le menu Outils TV affiche maintenant un vrai sélecteur de qualité lorsque le manifeste HLS expose plusieurs renditions : Auto, 1080p, 720p, 480p, etc. selon la source.
- Les boutons +/- restent disponibles.
- Les changements effectués depuis le menu v99 utilisent `loadLevel` afin d'appliquer la nouvelle qualité aux fragments suivants sans purger volontairement le buffer courant.
- Une source mono-qualité est clairement indiquée comme telle ; Noctra n'invente pas de renditions absentes.

## Multiview
- Toujours disponible dès 2 chaînes et jusqu'à 25 (5x5 maximum).
- Nouvelle barre de contrôle intégrée avec profil de qualité global : Auto stable, Auto sans limite, 1080p max, 720p max, 480p max, 360p max.
- Le profil Auto stable limite automatiquement la qualité pour préserver bande passante/CPU : 720p max jusqu'à 4 flux, 540p jusqu'à 9, 480p jusqu'à 16, 360p au-delà.
- Les caps utilisent les renditions déjà présentes dans le HLS ; aucun transcodage n'est réalisé.
- `lowLatencyMode` désactivé pour les lecteurs secondaires, tampon avant porté à 60 s et délais de fragments assouplis.
- Jusqu'à deux récupérations réseau et deux récupérations média par lecteur secondaire, sans toucher au lecteur principal.
- Démarrage des flux davantage échelonné pour éviter un pic réseau/CPU lors de l'ouverture du multiplex.
- Nouvelle présentation 16:9 : les flux ne sont plus étirés dans de grandes cases verticales ; header, états, qualité et commandes sont mieux intégrés.
- Responsive mobile portrait/paysage conservé.

## Indicateur de lecture
- Le badge d'état situé sous le guide est remplacé visuellement par un HUD discret directement dans la zone vidéo.
- États différenciés : attente, chargement/mise en mémoire, lecture, erreur.
- Le statut original reste dans le DOM pour la logique existante mais ne perturbe plus la barre d'actions.

## Sécurité de l'archive
- Build Server Safe : aucun EXE/DLL/VBS/BAT/CMD/PS1 ni lanceur Windows n'est inclus.
