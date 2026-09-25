# Noctra Media Client v28

## Fluidité adaptative

- les boutons des carrousels d’accueil utilisent désormais une animation temporelle via `requestAnimationFrame` ;
- le mouvement suit donc automatiquement la cadence réellement fournie par Chrome sur un écran 60, 120, 144, 165 ou 240 Hz ;
- la durée de l’animation reste identique : un écran rapide affiche simplement davantage d’étapes intermédiaires ;
- les nouvelles mutations du client Jellyfin sont regroupées en une seule passe par image, au lieu de relancer plusieurs traitements immédiatement ;
- les changements de taille, d’orientation et de viewport visuel sont eux aussi regroupés par image ;
- Noctra mesure de manière légère la fréquence active après l’ouverture, un changement de taille ou un retour au premier plan ;
- les images non prioritaires passent en décodage asynchrone et chargement progressif ;
- les sections hors écran utilisent `content-visibility` et les animations reposent principalement sur `transform` et `opacity`.

## Responsive téléphone et tablette

- profil automatique `mobile`, `tablet` ou `desktop` selon le viewport réel ;
- détection du tactile, de la capacité de survol et de l’orientation ;
- navigation Noctra transformée en barre inférieure tactile sur téléphone ;
- navigation inférieure élargie sur tablette ;
- toutes les actions administrateur restent accessibles par défilement horizontal de la barre ;
- carrousels mobiles au glissement natif avec aimantation des affiches ;
- flèches de carrousel masquées sur téléphone ;
- médiathèques en deux colonnes sur téléphone et en grille adaptative sur tablette ;
- panneaux Noctra plein écran sur téléphone ;
- boutons et contrôles tactiles agrandis à au moins 46 px ;
- fiches média, dialogues, formulaires, recherche et lecteur adaptés aux petits écrans ;
- prise en charge des encoches et barres système avec les variables `safe-area-inset-*` ;
- mode paysage mobile spécifique.

## PWA et serveur

- version serveur et paquet harmonisée en `28.0.0` ;
- cache du service worker renouvelé en `noctra-shell-v28` ;
- paramètres anti-cache des fichiers Noctra passés en `v28` ;
- déploiement Ultra.cc inchangé : le service `noctra.service`, le port `40514` et le proxy `/noctra/` peuvent être conservés.
