# Noctra 200.0.74

Corrections ciblées à partir de 200.0.73.

- Demandes : retrait du cumul largeur maximale et padding calculé sur tout le viewport. Le corps conserve une largeur utile et une marge interne modérée.
- Automatisation : barre compacte de boutons Radarr, Sonarr, Prowlarr, sans étirement sur toute la page.
- Roulette sur ordinateur : deux colonnes égales, formulaire étiré à hauteur du bloc d'introduction.
- Fermeture : bouton rond centré dans le bandeau, coordonnées héritées réinitialisées ; focus clavier conservé.
- Accueil : image réservée à la partie droite sur ordinateur et fondu progressif vers le texte. Mobile inchangé pour ce cadrage.
- Carrousels : pas de rechargement des limites à chaque clic si la géométrie est inchangée ; dédoublonnage des identifiants avec/sans tirets et casse différente ; position courante préservée pendant le chargement asynchrone.

## Chaînes TV

Sur demande explicite de l'utilisateur, le mode automatique HLS des chaînes et favoris associés privilégie une variante jusqu'à 720p et 4 Mb/s si le manifeste en propose une. La sélection manuelle enlève ce plafond ; revenir à Auto stable le rétablit. Le garde-fou de continuité peut encore réduire la qualité temporairement. Les sources à qualité unique ne sont pas transcodées. Les lecteurs externes et la lecture Jellyfin ne sont pas modifiés. Le tampon de démarrage des chaînes passe de 6 à 8 secondes sur connexion normale, avec adaptation existante aux playlists courtes. L'estimation adaptative conserve davantage de marge. Un démarrage légèrement plus lent est possible. Le débit du test utilisateur ne garantit pas celui du fournisseur.

## Vérification et livraison

`npm run test:v200074` : chaîne de régression, moteur Jellyfin réel pour le défilement, dédoublonnage GUID, clics sans reload inutile, plafond automatique, choix manuel, retour automatique, source unique, tampon et playlists courtes.

Vérification locale Chrome des feuilles de style complètes sur un DOM représentatif Demandes à 1920 px et accueil à 1440 px, avec illustrations abstraites. Pas de déploiement serveur, pas de validation physique iPhone, pas de mesure d'endurance TV en direct. Les corrections des boucles de carrousel sont testées au niveau moteur et logique ; leur disparition complète en production reste à confirmer après installation.

Installer l'archive complète selon la procédure habituelle en conservant configuration et données, redémarrer puis recharger. Version 200.0.74, cache r74 et ressources 200.74.
