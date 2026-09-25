# Déploiement automatique de Noctra

## Principe
La seedbox vérifie la branche GitHub `production` du dépôt `akaRukasu/Noctra` toutes les 5 minutes. Rien n'a besoin d'entrer vers la seedbox, et aucun accès à votre serveur n'est donné à l'extérieur.

1. Une modification est développée puis vérifiée (tests, rendu).
2. Le commit validé est publié sur la branche `production`.
3. En moins de 5 minutes, la seedbox télécharge ce commit et l'installe avec `noctra-update` : `.env` conservé, sauvegarde, contrôle `/health` de la nouvelle version, et **retour arrière automatique** en cas d'échec.
4. Seules les 3 dernières sauvegardes sont gardées.

## Installation (une seule fois, en SSH sur la seedbox)

1. Créer un jeton GitHub **à droits minimaux** : GitHub → Settings → Developer settings → *Fine-grained tokens* → Generate.
   - Repository access : *Only select repositories* → `akaRukasu/Noctra`.
   - Permissions : *Contents* → **Read-only**. Rien d'autre.
2. Sur la seedbox, depuis le dossier Noctra installé :
   ```bash
   cd ~/apps/noctra && bash ultra/install-autoupdate.sh
   ```
   Collez le jeton quand il est demandé (la saisie est masquée). Il est enregistré dans `~/.config/noctra/github-token`, en droits 600, et n'est jamais affiché.

La première vérification installe le dernier commit de `production`.

## Commandes utiles
- Journal : `tail -n 50 ~/apps/noctra-autoupdate.log`
- Vérifier tout de suite : `systemctl --user start noctra-autoupdate.service`
- Suspendre : `systemctl --user disable --now noctra-autoupdate.timer`
- Reprendre : `systemctl --user enable --now noctra-autoupdate.timer`
- Révoquer l'accès : supprimer le jeton sur GitHub (le minuteur s'arrête alors d'installer).

## Sécurité
- Le jeton ne permet que de **lire** ce dépôt. Il ne peut rien modifier sur GitHub.
- Un commit défaillant est restauré automatiquement puis noté comme traité, pour ne pas être réinstallé en boucle. La version suivante publiée sur `production` sera installée normalement.
- L'updater PC V7 reste utilisable en parallèle, par exemple pour une installation manuelle.
