# Noctra Media Client v24

## Correction principale — Identifier

- La cible est désormais figée au clic ou au menu contextuel sur le média.
- L’épisode, le film ou le fichier cliqué passe avant l’identifiant de la page parente.
- Le simple survol d’une autre vignette ne peut plus modifier silencieusement la cible.
- Les attributs Jellyfin courants (`data-id`, `itemid`, liens et conteneurs de cartes/listes) sont pris en charge.
- Les tâches d’identification restent indépendantes et peuvent continuer en arrière-plan.

## Étape 2 — PWA

- Manifeste PWA autonome.
- Icônes 180, 192, 512 et maskable.
- Bouton d’installation lorsque le navigateur le permet.
- Compatibilité avec un hébergement à la racine ou sous un chemin comme `/noctra`.
- Instructions d’installation dans `PWA.md`.

## Étape 3 — Client Windows Tauri

- Projet Tauri 2 dans le dossier `desktop`.
- Mode développement sur le serveur local Noctra.
- Version de production configurée pour charger l’instance Noctra hébergée.
- Installateur NSIS en mode utilisateur, sans droits administrateur.
- Instructions et script de compilation dans `desktop/README.md` et `desktop/BUILD-NOCTRA.bat`.

## Ultra.cc

- Support de `HOST`, `PORT` et `BASE_URL`.
- Script d’installation utilisateur systemd.
- Configuration Nginx pour un accès sous `/noctra`.
- Script de désinstallation fourni.
- Guide complet dans `ULTRA-CC.md`.

## Validation effectuée

- Syntaxe de `server.mjs` et `public/noctra-shell.js`.
- Intégrité JSON du manifeste et des configurations Tauri/Node.
- Test statique dédié à la sélection du média.
- Test HTTP local avec `BASE_URL=/noctra`.
- Vérification syntaxique des scripts Ultra.cc.

## Limites du test automatisé

- Les connexions externes réelles n’ont pas pu être validées depuis l’environnement de construction, dont la résolution DNS sortante était indisponible (`EAI_AGAIN`).
- Le projet Tauri a été préparé et validé statiquement, mais l’installateur Windows n’a pas été compilé dans cet environnement dépourvu de Rust/Cargo et des outils Windows nécessaires.
